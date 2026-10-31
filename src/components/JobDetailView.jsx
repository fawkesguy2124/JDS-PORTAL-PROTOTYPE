import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { getStageName, parseContainerNos, getContainerSize } from '../utils/jobHelpers'
import { useJourney } from '../industrial/JourneyContext'
import { daysAgo, deliveryBy, displayLine, effectiveStage } from '../services/journey'
import { seaOf } from '../../supabase/functions/_shared/portal/ships.js'
import { isLineNotShip } from '../../supabase/functions/_shared/portal/shippingLines.js'
import { Button, Chip, Dash, Icon, JobNo, Panel, PhaseStatus, Status, Tabs, fmtDate, fmtDateTime, fmtINR, timeAgo } from '../industrial/ui'
import CustomsStatusCard from './CustomsStatusCard'
import { PORTS, portLabel } from '../utils/ports'
import UlipSection from './ulip/UlipSection'
import { JOB_TABS, CUSTOMS_TAB_GROUPS } from './ulip/ulipChecks'
// the tokens live under .ix; the employee screen mounts this page outside the
// portal shell, so the page brings the design system with it
import '../industrial/industrial.css'
import '../industrial/styles/jobs.css'
import '../industrial/styles/fulljob.css'

const CONTAINER_SIZES = [
  '20GP','40GP','40HC','45HC',
  '20RF','40RF','40RFHC',
  '20OT','40OT',
  '20FR','40FR',
  '20TK'
]

// 'BE Filing' → 'BE filing', 'Job Created' → 'Job created' (sentence case on screen;
// the saved stage names stay as they are for the activity log)
const sentence = (s) => String(s || '').split(' ').map((w, i) => (i === 0 || /^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ')

const STAGE_LIST = Array.from({ length: 11 }).map((_, i) => ({
  value: i,
  label: sentence(getStageName(i)),
}))

const FIELD_LABELS = {
  job_no: 'Job number',
  client: 'Client',
  mode: 'Mode',
  job_type: 'Import / export',
  port_code: 'Port',
  bl_no: 'BL number',
  containers: 'Containers',
  shipping_line: 'Shipping line',
  vessel: 'Vessel / flight',
  eta: 'ETA',
  cfs_name: 'CFS name',
  be_no: 'BE number',
  be_date: 'BE date',
  hs_code: 'HS code',
  container_size: 'Container size',
  rms_status: 'RMS status',
  bg_required: 'BG required',
  cfs_amount: 'CFS amount',
  destination: 'Destination',
  priority: 'Priority',
  goods: 'Goods',
  free_days: 'Free days',
  detention_risk: 'Detention risk',
  stage: 'Stage',
  delay_reason: 'Delay reason',
  notes: 'Notes',
  assigned_to: 'Assigned to',
  created_by: 'Created by',
  created_at: 'Created',
  updated_at: 'Last updated',
  onward_mode: 'Move by',
  delivery_by: 'Delivery',
}

const FIELD_PERMS = {
  job_no: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  client: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  mode: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  job_type: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  port_code: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  bl_no: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  containers: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  shipping_line: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  vessel: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  eta: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  cfs_name: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  be_no: { can: ['Akshyani', 'Trupti'] },
  be_date: { can: ['Akshyani', 'Trupti'] },
  container_size: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  hs_code: { can: ['Akshyani', 'Trupti', 'Durgesh'] },
  rms_status: { can: ['Akshyani', 'Trupti', 'Durgesh'] },
  bg_required: { can: ['Anil', 'Akshyani', 'Durgesh'] },
  cfs_amount: { can: ['Kiran', 'Virendra', 'Mayur', 'Anil'] },
  destination: { can: ['Durgesh'] },
  priority: { can: ['Durgesh'] },
  goods: { can: ['Durgesh'] },
  free_days: { can: 'all' },
  detention_risk: { can: ['Durgesh'] },
  delay_reason: { can: ['Durgesh'] },
  notes: { can: ['Durgesh'] },
  stage: { can: ['Trupti', 'Uphadhya'] },
}

// The page in sections, each a dense label / value grid. Every editable field
// appears exactly once (the save below walks the same keys).
const SECTIONS = [
  { id: 'job', title: 'Job details', keys: ['job_no', 'client', 'mode', 'job_type', 'port_code', 'priority', 'goods'] },
  { id: 'customs', title: 'Customs', keys: ['be_no', 'be_date', 'hs_code', 'rms_status', 'bg_required'] },
  { id: 'cfs', title: 'CFS', keys: ['cfs_name', 'cfs_amount', 'free_days', 'detention_risk'] },
  { id: 'transport', title: 'Transport', keys: ['bl_no', 'shipping_line', 'vessel', 'eta', 'containers'] },
  { id: 'delivery', title: 'Delivery', keys: ['destination', 'delay_reason'] },
]
const MONO = ['bl_no', 'be_no', 'hs_code']

function parseContainersWithSizes(containers, containerSizes) {
  const nos = parseContainerNos(containers)
  const sizes = containerSizes || {}
  return nos.map(no => ({ no, size: sizes[no] || '' }))
}

const empty = (v) => v === null || v === undefined || String(v).trim() === ''
const cap = (v) => (empty(v) ? null : String(v).charAt(0).toUpperCase() + String(v).slice(1))
const RMS_TEXT = { pending: 'Pending', rms: 'RMS', apr: 'APR', acl: 'ACL', check: 'Check', hold: 'On hold' }
const rmsLabel = (v) => (empty(v) ? null : RMS_TEXT[String(v).toLowerCase()] || cap(v))
const bgLabel = (v) => (empty(v) ? null : v === true ? 'Yes' : v === false ? 'No' : /^100/.test(String(v)) ? 'Yes (100%)' : cap(v))
const freeWord = (left) => (left === null || left === undefined ? null : left < 0 ? `${-left} d over` : left === 0 ? 'last day today' : `${left} d left`)

// Older saved sources can still carry system names: plain words on screen
// (same rule as plain() in JobDrawer.jsx, kept here so this page does not load the map code)
const plainWords = (s) => String(s || '')
  .replace(/\bICEGATE\b/gi, 'Customs').replace(/\bLDB\b/g, 'container tracking')
  .replace(/\bFASTag\b/gi, 'toll').replace(/\bVAHAN\b/gi, 'vehicle records')
  .replace(/\bSafecube\b/gi, 'ship tracking').replace(/\bULIP\b/g, 'government systems')

// '2×40HC', '1×20GP + 1×40HC', 'LCL' for the fact strip
function boxesLine(job) {
  if (/lcl/i.test(job?.mode || '')) return 'LCL'
  const nos = [...new Set(parseContainerNos(job?.containers))]
  if (!nos.length) return null
  const by = new Map()
  for (const no of nos) { const k = getContainerSize(job, no) || ''; by.set(k, (by.get(k) || 0) + 1) }
  return [...by].map(([k, n]) => (k ? `${n}×${k}` : `${n} box${n === 1 ? '' : 'es'}`)).join(' + ')
}

function normalizeMetaTs(ts) {
  if (!ts) return null
  const n = Number(ts)
  if (!Number.isFinite(n)) return null
  return n < 1e12 ? n * 1000 : n
}
const metaIso = (ts) => { const ms = normalizeMetaTs(ts); return ms ? new Date(ms).toISOString() : null }

// Who filled a field and when: absolute IST time on screen, 'x min ago' in the tooltip
function FieldProvenance({ meta, profiles }) {
  if (!meta || typeof meta !== 'object') return null
  const { by, ts, autoFill } = meta
  const hasManual = by && ts
  const hasAutoFill = autoFill?.ts
  if (!hasManual && !hasAutoFill) return null

  const lastWasManual = hasManual && (!hasAutoFill || normalizeMetaTs(ts) >= normalizeMetaTs(autoFill?.ts))
  const name = by && profiles?.[by] ? profiles[by] : by
  const afName = autoFill?.by && profiles?.[autoFill.by] ? profiles[autoFill.by] : autoFill?.by
  const at = metaIso(lastWasManual ? ts : autoFill.ts)

  return lastWasManual ? (
    <div className="ix-fj-prov" title={at ? timeAgo(at) : undefined}>
      <Icon name="pencil" />Entered by {name || 'someone'}{at ? ` · ${fmtDateTime(at)}` : ''}
    </div>
  ) : (
    <div className="ix-fj-prov auto" title={at ? timeAgo(at) : undefined}>
      <Icon name="file-check" />Filled from {autoFill.source ? plainWords(autoFill.source) : 'a document'}{afName ? ` by ${afName}` : ''}{at ? ` · ${fmtDateTime(at)}` : ''}
    </div>
  )
}

// hideTabs: tabs whose checks live on their own pages instead (e.g. ['customs', 'vessel', 'truck'])
function JobDetailView({ job, profiles = {}, currentUserName, isAdmin, canUpdateStage, onBack, onSaved, toast, onDelete, showToast, onJobUpdated, hideTabs = [] }) {
  // EmployeeDashboard passes showToast / onJobUpdated instead of toast / onSaved
  const notify = toast || showToast || (() => {})
  const reload = onSaved || onJobUpdated || (async () => {})

  const tabIds = ['details', 'customs', ...JOB_TABS.map(t => t.id)].filter(t => !hideTabs.includes(t))
  const hashTab = () => {
    const hash = window.location.hash.replace('#', '')
    return tabIds.includes(hash) ? hash : 'details'
  }

  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stageUpdating, setStageUpdating] = useState(false)
  const [showFullAccountability, setShowFullAccountability] = useState(false)
  const [detailTab, setDetailTab] = useState(hashTab)
  const [form, setForm] = useState(() => ({ ...job }))
  const [hasUnsavedNotes, setHasUnsavedNotes] = useState(false)
  const [shownId, setShownId] = useState(job.id)
  const meta = useMemo(() => (job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : {}), [job.field_meta])

  // Another job opened in place: start fresh (reset while rendering, not in an effect)
  if (job.id !== shownId) {
    setShownId(job.id)
    setEditMode(false)
    setSaving(false)
    setStageUpdating(false)
    setHasUnsavedNotes(false)
    setForm({ ...job })
    setDetailTab(hashTab())
  }

  // Open on the tab named in the link (#customs, #truck …), otherwise Job details,
  // and say so in the URL so a reload comes back to the same tab
  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (!['details', 'customs', ...JOB_TABS.map(t => t.id)].includes(hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + '#details')
    }
  }, [job.id])

  // Esc closes the full accountability list
  useEffect(() => {
    if (!showFullAccountability) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setShowFullAccountability(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showFullAccountability])

  // the stage the job has really reached (BE filed, OOC, out …), never lower than saved
  const journey = useJourney()
  const jRow = journey?.byId?.[job.id]
  const j = jRow?.j || null
  const stage = j ? effectiveStage(job, j) : (Number(job.stage) || 0)
  const stageName = sentence(getStageName(stage))
  const isExport = job.job_type === 'export'
  const isAir = /air/i.test(job.mode || '')
  const priority = String(job.priority || '').toLowerCase()
  const line = displayLine(job.shipping_line)
  const ownerName = job.assigned_to ? profiles[job.assigned_to] || null : null

  const canEditField = (fieldKey) => {
    if (isAdmin) return true
    if (['assigned_to','created_by','created_at','updated_at'].includes(fieldKey)) return false
    // Restricted employees — everyone except Akshyani and Uphadhya — can only edit free_days
    if (!['Akshyani', 'Uphadhya'].includes(currentUserName)) {
      return fieldKey === 'free_days'
    }
    const rule = FIELD_PERMS[fieldKey]
    if (!rule) return false
    if (rule.can === 'all') return true
    return Array.isArray(rule.can) && rule.can.includes(currentUserName)
  }

  const metaEntries = useMemo(() => {
    return Object.entries(meta || {})
      .filter(([, v]) => v && typeof v === 'object' && (v.by || v.ts))
      .map(([k, v]) => ({ key: k, label: FIELD_LABELS[k] || k, by: v.by || '—', ts: v.ts || null }))
      .sort((a, b) => (normalizeMetaTs(b.ts) || 0) - (normalizeMetaTs(a.ts) || 0))
  }, [meta])

  // The container editor keeps its own rows while typing (form._boxRows), so a
  // half-typed number or a new blank row doesn't vanish; the saved text
  // (form.containers / container_sizes) is updated from the complete rows.
  const boxRowsOf = (f) => {
    const rows = f._boxRows ?? parseContainersWithSizes(f.containers, f.container_sizes)
    const lcl = f.mode === 'Sea LCL'
    // an LCL box's size is just "LCL"
    const fixed = lcl ? rows.map(r => ({ ...r, size: 'LCL' })) : rows
    return fixed.length ? fixed : [{ no: '', size: lcl ? 'LCL' : '' }]
  }
  const setBoxRows = (rows) => setForm(prev => ({
    ...prev,
    _boxRows: rows,
    containers: rows.map(r => r.no.trim()).filter(Boolean).join(' '),
    container_sizes: rows.reduce((acc, r) => {
      if (r.no.trim() && r.size) acc[r.no.trim()] = r.size
      return acc
    }, {}),
  }))

  const updateContainerRow = (i, field, value) => {
    const rows = boxRowsOf(form).map(r => ({ ...r }))
    rows[i] = { ...rows[i], [field]: value }
    setBoxRows(rows)
  }

  const addContainerRow = () => setBoxRows([...boxRowsOf(form), { no: '', size: form.mode === 'Sea LCL' ? 'LCL' : '' }])

  const removeContainerRow = (i) => {
    const rows = boxRowsOf(form)
    if (rows.length === 1) return
    setBoxRows(rows.filter((_, idx) => idx !== i))
  }

  const handleSave = async () => {
    // container numbers must be complete (4 letters + 7 digits) before saving
    const wrongBoxes = boxRowsOf(form).map(r => r.no.trim().toUpperCase()).filter(no => no && !/^[A-Z]{4}\d{7}$/.test(no))
    if (wrongBoxes.length) {
      notify(`Container number looks wrong: ${wrongBoxes.join(', ')}. It is 4 letters and 7 digits, for example MSCU1234567.`, 'error')
      return
    }
    // a shipping line typed as the ship (J-583, J-667, J-690 had "EVERGREEN"): the
    // ship's own name is on the BL (Jose, 31 Oct 2026), same rule as Create job
    const vesselTyped = String(form.vessel || '').trim()
    if (vesselTyped && vesselTyped !== String(job.vessel || '').trim() && isLineNotShip(vesselTyped.split('/')[0], form.shipping_line || job.shipping_line)) {
      notify(`"${vesselTyped}" is a shipping line, not a ship. Type the ship's own name from the BL (for example EVER LUCID), or leave Vessel empty.`, 'error')
      return
    }
    setSaving(true)
    try {
      const updates = {}
      const newMeta = { ...(meta || {}) }
      const candidates = ['job_no','client','mode','job_type','port_code','bl_no','containers','shipping_line','vessel','eta','cfs_name','be_no','be_date','hs_code','rms_status','bg_required','cfs_amount','destination','priority','goods','free_days','detention_risk','delay_reason','notes']
      candidates.forEach((k) => {
        if (!canEditField(k)) return
        const prev = job[k]
        let next = form[k]
        if (k === 'free_days' || k === 'cfs_amount') next = next === '' || next === null || next === undefined ? null : Number(next)
        if (k === 'eta' || k === 'be_date') next = next ? next : null
        if (typeof next === 'string') { next = next.trim(); if (next === '') next = null }
        if ((prev ?? null) !== (next ?? null)) { updates[k] = next; newMeta[k] = { by: currentUserName, ts: Date.now() } }
      })
      // Save container_sizes if it changed
      const prevSizes = JSON.stringify(job.container_sizes || {})
      const nextSizes = JSON.stringify(form.container_sizes || {})
      if (prevSizes !== nextSizes) { updates.container_sizes = form.container_sizes || {} }
      if (Object.keys(updates).length === 0) { notify('No changes to save.', 'info'); setEditMode(false); return }
      updates.field_meta = newMeta
      updates.updated_at = new Date().toISOString()
      const { error } = await supabase.from('jobs').update(updates).eq('id', job.id)
      if (error) throw error
      notify('Saved successfully.', 'success')
      setEditMode(false)
      await reload()
    } catch (e) {
      notify(e?.message || 'Save failed.', 'error')
    } finally { setSaving(false) }
  }

  const handleStageChange = async (e) => {
    const nextStage = Number(e.target.value)
    if (!Number.isFinite(nextStage)) return
    if (!canUpdateStage) { notify('You do not have permission to update stage.', 'error'); return }
    setStageUpdating(true)
    try {
      const newMeta = { ...(meta || {}), stage: { by: currentUserName, ts: Date.now() } }
      const { error } = await supabase.from('jobs').update({ stage: nextStage, field_meta: newMeta, updated_at: new Date().toISOString() }).eq('id', job.id)
      if (error) throw error
      await supabase.from('activity_log').insert({
        type: 'job_update',
        action: 'stage_update',
        title: `${job.job_no} — Stage ${nextStage}: ${getStageName(nextStage)}`,
        note: `Stage updated by ${currentUserName}: ${getStageName(job.stage)} → ${getStageName(nextStage)}`,
        job_no: job.job_no,
        job_id: job.id,
        done_by_name: currentUserName,
        meta: { job_id: job.id, job_no: job.job_no, old_stage: job.stage, new_stage: nextStage },
        created_at: new Date().toISOString(),
      })
      notify(`Stage updated to: ${sentence(getStageName(nextStage))}`, 'success')
      await reload()
    } catch (e2) { notify(e2?.message || 'Stage update failed.', 'error') }
    finally { setStageUpdating(false) }
  }

  const saveNotes = async () => {
    try {
      const newMeta = { ...(meta || {}), notes: { by: currentUserName, ts: Date.now() } }
      const { error } = await supabase.from('jobs')
        .update({ notes: form.notes, field_meta: newMeta, updated_at: new Date().toISOString() })
        .eq('id', job.id)
      if (error) throw error
      await reload()
      setHasUnsavedNotes(false)
      notify('Notes saved', 'success')
    } catch (e) {
      notify(e?.message || 'Failed to save notes', 'error')
    }
  }

  const goTab = (id) => {
    setDetailTab(id)
    window.history.replaceState(null, '', window.location.pathname + window.location.search + '#' + id)
  }
  const startEdit = () => { if (detailTab !== 'details') goTab('details'); setEditMode(true) }
  const cancelEdit = () => { setEditMode(false); setForm({ ...job }) }

  // a textarea that grows with its text
  const grow = (el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }

  // ── header facts: the same facts as the job panel, from the shared journey ──
  const facts = []
  if (j && isExport) {
    facts.push({ k: 'SB', v: j.sbNo, mono: true, small: job.ulip_refs?.sb_date && fmtDate(job.ulip_refs.sb_date) })
    facts.push({ k: 'LEO', v: j.leoDate && fmtDate(j.leoDate) })
    facts.push({ k: 'EGM', v: j.egmNo, mono: true })
  } else if (j) {
    const sea = isAir ? null : seaOf(job, journey?.data)
    if (j.arrivedAt) facts.push({ k: 'Arrived', v: fmtDate(j.arrivedAt) })
    else if (j.steps?.[0]?.id === 'arrival' && j.steps[0].done) facts.push({ k: 'Arrived', v: null, title: 'Arrived, date not recorded' })
    // ship tracking gives the port's own date, so the date part is used as is
    else facts.push({ k: 'ETA', v: sea?.pod_date ? fmtDate(String(sea.pod_date).slice(0, 10)) : job.eta ? fmtDate(job.eta) : null, title: sea?.pod_date ? 'From ship tracking' : undefined })
    facts.push({ k: 'BE', v: job.be_no, mono: true, small: job.be_date && fmtDate(job.be_date) })
    const od = j.oocDate ? daysAgo(j.oocDate) : null
    facts.push(j.oocDate ? { k: 'OOC', v: fmtDate(j.oocDate), small: od ? `${od} d ago` : 'today' }
      : j.oocDone ? { k: 'OOC', v: 'Done', small: 'no date', tone: 'amber', title: 'OOC is done but no date was saved' }
        : { k: 'OOC', v: null })
    facts.push({
      k: 'Free till', v: j.freeTill && fmtDate(j.freeTill), small: freeWord(j.freeDaysLeft),
      tone: j.freeDaysLeft !== null && j.freeDaysLeft !== undefined && j.freeDaysLeft <= 2 ? 'red' : undefined,
      title: j.freeBox ? `Runs out first: ${j.freeBox}` : undefined,
    })
  } else {
    // no journey on this screen (employee view): only what the job itself says
    facts.push({ k: 'ETA', v: job.eta && fmtDate(job.eta) })
    facts.push({ k: 'BE', v: job.be_no, mono: true, small: job.be_date && fmtDate(job.be_date) })
    facts.push({ k: 'Free days', v: empty(job.free_days) ? null : `${job.free_days} days` })
  }
  facts.push({ k: 'Boxes', v: boxesLine(job) })
  facts.push({ k: 'Owner', v: ownerName })

  const steps = j?.steps || []

  // ── tabs, only when there is more than Job details to choose from ──
  const extraTabs = JOB_TABS.filter(t => t.showIf(job) && !hideTabs.includes(t.id))
  const showCustomsTab = !isExport && !hideTabs.includes('customs')
  const tabs = [
    { id: 'details', label: 'Job details' },
    ...(showCustomsTab ? [{ id: 'customs', label: 'Customs and BE' }] : []),
    ...extraTabs.map(t => ({ id: t.id, label: t.label })),
  ]

  // ── one field, read only ──
  const viewValue = (k) => {
    const v = job[k]
    switch (k) {
      case 'job_no': return empty(v) ? null : <JobNo no={v} />
      case 'job_type': return isExport ? 'Export' : 'Import'
      case 'port_code': return v
        ? <>{portLabel(v)}{portLabel(v) !== v ? <span className="mono muted"> {v}</span> : null}</>
        : <span className="muted">Not set (JNPT assumed)</span>
      case 'priority': case 'detention_risk': return cap(v)
      case 'rms_status': return rmsLabel(v)
      case 'bg_required': return bgLabel(v)
      case 'be_date': case 'eta': return empty(v) ? null : fmtDate(String(v).slice(0, 10))
      case 'cfs_amount': return empty(v) ? null : fmtINR(v)
      case 'free_days': return empty(v) ? null : `${v} days`
      case 'shipping_line': return empty(v) ? null : line || v
      default: return empty(v) ? null : (MONO.includes(k) ? <span className="mono">{String(v)}</span> : String(v))
    }
  }
  const labelOf = (k) => (k === 'bl_no' && isAir ? 'AWB number' : FIELD_LABELS[k] || k)

  // ── one field, editable (same inputs and choices as before) ──
  const setField = (k, value) => setForm(p => ({ ...p, [k]: value }))
  const editInput = (k) => {
    const val = form[k] || ''
    const onChange = (e) => setField(k, e.target.value)
    switch (k) {
      case 'mode': return (
        <select className="ix-fj-in" value={val} onChange={onChange}>
          <option value="">Select mode</option>
          {['Sea FCL', 'Sea LCL', 'Air', 'Courier', 'Land'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      )
      case 'priority': return (
        <select className="ix-fj-in" value={val} onChange={onChange}>
          <option value="">Select priority</option>
          {['normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{cap(p)}</option>)}
        </select>
      )
      case 'eta': case 'be_date': return <input type="date" className="ix-fj-in" value={val.slice(0, 10)} onChange={onChange} />
      case 'job_type': return (
        <select className="ix-fj-in" value={form[k] || 'import'} onChange={onChange}>
          <option value="import">Import</option>
          <option value="export">Export</option>
        </select>
      )
      case 'port_code': return (
        <select className="ix-fj-in" value={val} onChange={e => setField(k, e.target.value || null)}>
          <option value="">Select port</option>
          {PORTS.map(p => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
        </select>
      )
      case 'bg_required': case 'detention_risk': return (
        <select className="ix-fj-in" value={val} onChange={onChange}>
          <option value="">Select</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      )
      case 'free_days': case 'cfs_amount': return <input type="text" inputMode="numeric" className="ix-fj-in" value={val} onChange={onChange} />
      default: return <input type="text" className={`ix-fj-in${MONO.includes(k) ? ' mono' : ''}`} value={val} onChange={onChange} />
    }
  }
  // what a field shows in edit mode when this person cannot change it
  const lockedValue = (k) => {
    const v = form[k]
    if (empty(v)) return null
    if (k === 'port_code') return portLabel(v)
    if (k === 'job_type') return v === 'export' ? 'Export' : 'Import'
    if (k === 'eta' || k === 'be_date') return fmtDate(String(v).slice(0, 10))
    return String(v)
  }

  // ── containers: a small table to read, rows of number + size to edit ──
  const containersView = () => {
    const nos = parseContainerNos(job.containers)
    const sizes = job.container_sizes || {}
    if (!nos.length) return <Dash />
    return (
      <div className="ix-jp-inner ix-fj-boxes">
        <table className="ix-tbl">
          <thead><tr><th>Container</th><th>Size</th></tr></thead>
          <tbody>
            {nos.map(cn => (
              <tr key={cn}><td className="mono">{cn}</td><td className={sizes[cn] ? '' : 'dim'}>{sizes[cn] || <Dash />}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  const containersEdit = () => {
    const rows = boxRowsOf(form)
    const lastRow = rows[rows.length - 1]
    const canAdd = !lastRow || lastRow.no.trim().length >= 4
    return (
      <div className="ix-fj-boxedit">
        <div className="hd"><span>Container no.</span><span>Size</span><span /></div>
        {rows.map((row, i) => (
          <div key={i} className="row">
            <input type="text" className="ix-fj-in mono" value={row.no} aria-label={`Container ${i + 1} number`}
              onChange={e => updateContainerRow(i, 'no', e.target.value.toUpperCase())}
              placeholder="e.g. MSCU1234567" />
            <select className="ix-fj-in" value={row.size} aria-label={`Container ${i + 1} size`}
              onChange={e => updateContainerRow(i, 'size', e.target.value)}>
              <option value="">Select size</option>
              {(form.mode === 'Sea LCL' ? ['LCL'] : CONTAINER_SIZES).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" className="ix-icon-btn sm" onClick={() => removeContainerRow(i)} disabled={rows.length === 1}
              title="Remove this container" aria-label={`Remove container ${i + 1}`}><Icon name="x" /></button>
          </div>
        ))}
        <div><Button size="sm" variant="ghost" icon="plus" onClick={addContainerRow} disabled={!canAdd}>Add container</Button></div>
      </div>
    )
  }

  const field = (k) => {
    const wide = k === 'containers'
    let value
    if (!editMode) {
      value = (
        <>
          {k === 'containers' ? containersView() : (viewValue(k) ?? <Dash />)}
          {!empty(job[k]) && meta?.[k] && <FieldProvenance meta={meta[k]} profiles={profiles} />}
        </>
      )
    } else if (canEditField(k)) {
      value = k === 'containers' ? containersEdit() : editInput(k)
    } else {
      value = k === 'containers'
        ? (parseContainerNos(form.containers).map(cn => <span key={cn} className="mono ix-fj-cn">{cn}</span>))
        : (lockedValue(k) ?? <Dash />)
      if (k === 'containers' && !parseContainerNos(form.containers).length) value = <Dash />
    }
    return (
      <div key={k} className={`ix-fj-f${wide ? ' wide' : ''}${editMode ? ' edit' : ''}`}>
        <div className="k">{labelOf(k)}{editMode && !canEditField(k) && <Icon name="lock" className="lock" />}</div>
        <div className="v">{value}</div>
      </div>
    )
  }
  const readOnlyRow = (label, value, title) => (
    <div key={label} className={`ix-fj-f${editMode ? ' edit' : ''}`}>
      <div className="k">{label}</div>
      <div className="v" title={title}>{value ?? <Dash />}</div>
    </div>
  )

  const accountabilityTable = (list, full) => (
    <table className="ix-tbl ix-fj-acc">
      <thead><tr><th>Field</th><th>{full ? 'Updated by' : 'By'}</th><th>When</th></tr></thead>
      <tbody>
        {list.length ? list.map((m) => {
          const at = metaIso(m.ts)
          return (
            <tr key={m.key}>
              <td className="cl" title={m.label}>{m.label}</td>
              <td className="who">{profiles[m.by] || m.by}</td>
              <td className="dim" title={at ? timeAgo(at) : undefined}>{at ? fmtDateTime(at) : <Dash />}</td>
            </tr>
          )
        }) : (
          <tr><td colSpan={3} className="dim">No updates logged yet</td></tr>
        )}
      </tbody>
    </table>
  )

  const stageSelect = (
    <label className="ix-fj-stage" title={canUpdateStage ? 'Change the job’s stage' : 'You cannot change the stage'}>
      <span>Stage</span>
      <select disabled={!canUpdateStage || stageUpdating} value={stage} onChange={handleStageChange} aria-label="Update stage">
        {STAGE_LIST.map((s) => <option key={s.value} value={s.value}>{s.value} · {s.label}</option>)}
      </select>
      <Icon name="chevron-down" />
    </label>
  )

  return (
    <div className="ix ix-fj">
      {/* ── header: who and what, the one action, the facts once ── */}
      <header className="ix-card ix-fj-head">
        <div className="ix-fj-back">
          <Button size="sm" variant="ghost" icon="arrow-left" onClick={onBack}>Back to jobs</Button>
        </div>
        <div className="ix-jp-row1">
          <JobNo no={job.job_no} size="lg" />
          {job.client && <><span className="sep">·</span><span className="cl" title={job.client}>{job.client}</span></>}
          {j ? <PhaseStatus job={job} j={j} pill /> : <Status tone={stage >= 10 ? 'green' : 'blue'} pill>{stageName}</Status>}
          {priority === 'urgent' && <Chip tone="red" icon="flame">Urgent</Chip>}
          {priority === 'high' && <Chip tone="amber">High priority</Chip>}
          <div className="right ix-fj-acts">
            {editMode ? (
              <Chip tone="amber" icon="pencil">Editing</Chip>
            ) : (
              <>
                {stageSelect}
                <Button variant={detailTab === 'details' ? 'primary' : 'secondary'} icon="pencil" onClick={startEdit}>Edit</Button>
              </>
            )}
          </div>
        </div>
        <div className="ix-jp-meta">
          {job.mode && <Chip>{job.mode}</Chip>}
          <Chip>{isExport ? 'Export' : 'Import'}</Chip>
          {line && <span>{line}</span>}
          {job.port_code && <><span className="sep">·</span><span>{portLabel(job.port_code) || job.port_code}</span></>}
          {job.created_at && <><span className="sep">·</span><span title={fmtDateTime(job.created_at)}>Opened {fmtDate(job.created_at)}</span></>}
          {!j && <><span className="sep">·</span><span>Stage {stage}: {stageName}</span></>}
        </div>

        <div className="ix-jp-facts">
          {facts.map((f) => (
            <div key={f.k} className={`ix-jp-fact${f.tone ? ` ${f.tone}` : ''}`} title={f.title}>
              <div className="k">{f.k}</div>
              <div className={`v${f.mono && f.v ? ' mono' : ''}`}>{f.v || <Dash />}{f.v && f.small ? <small>{f.small}</small> : null}</div>
            </div>
          ))}
        </div>

        {steps.length > 0 && (
          <div className="ix-jp-stepwrap">
            <div className="ix-jp-steps" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
              {steps.map((s) => {
                const sub = s.sub ? plainWords(s.sub) : (s.id === 'delivered' && !s.done && !isExport ? (deliveryBy(job) === 'client' ? 'Client collects' : 'JDS delivers') : null)
                return (
                  <div key={s.id} className={`ix-jp-step ${s.done ? 'done' : s.current ? 'now' : 'todo'}`}>
                    <span className="dot">{s.done && <Icon name="check" />}</span>
                    <b>{s.label}</b>
                    <div className="w">{s.when}{sub && <span>{sub}</span>}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tabs.length > 1 ? <Tabs className="ix-jp-tabs" value={detailTab} onChange={goTab} tabs={tabs} /> : <div className="ix-fj-headend" />}
      </header>

      {/* ── job details: every field once, grouped, dense ── */}
      {detailTab === 'details' && (
        <div className="ix-fj-grid">
          <div className="ix-fj-main">
            {SECTIONS.map((s) => (
              <Panel key={s.id} title={s.title}>
                <div className="ix-fj-kv">
                  {s.keys.map(field)}
                  {s.id === 'job' && [
                    readOnlyRow('Stage', `${stage} · ${stageName}`),
                    readOnlyRow('Created by', job.created_by ? profiles[job.created_by] ?? job.created_by : null),
                    readOnlyRow('Created', job.created_at ? fmtDateTime(job.created_at) : null, job.created_at ? timeAgo(job.created_at) : undefined),
                    readOnlyRow('Last updated', job.updated_at ? fmtDateTime(job.updated_at) : null, job.updated_at ? timeAgo(job.updated_at) : undefined),
                  ]}
                </div>
              </Panel>
            ))}

            {editMode && (
              <div className="ix-fj-editbar">
                <span className="muted">Fields with a lock are not yours to change.</span>
                <Button disabled={saving} onClick={cancelEdit}>Cancel</Button>
                <Button variant="primary" icon={saving ? undefined : 'device-floppy'} disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save changes'}</Button>
              </div>
            )}
          </div>

          <div className="ix-fj-side">
            <Panel title="Notes" actions={!editMode && hasUnsavedNotes ? <Button size="sm" icon="device-floppy" onClick={saveNotes}>Save notes</Button> : null}>
              <div className="ix-fj-notes">
                {editMode && !canEditField('notes') ? (
                  <p className="ix-fj-notetext">{form.notes || <Dash />}</p>
                ) : (
                  <textarea
                    value={form.notes || ''}
                    onChange={e => {
                      setForm(p => ({ ...p, notes: e.target.value }))
                      if (!editMode) setHasUnsavedNotes(true)
                      grow(e.target)
                    }}
                    ref={grow}
                    placeholder={editMode ? 'Add notes here…' : 'No notes yet. Click to add…'}
                    rows={3}
                    aria-label="Notes"
                  />
                )}
                {!editMode && meta?.notes && !empty(job.notes) && <FieldProvenance meta={meta.notes} profiles={profiles} />}
              </div>
            </Panel>

            {isAdmin && (
              <Panel title="Field accountability" meta={metaEntries.length ? `${metaEntries.length} updates` : null}
                actions={metaEntries.length > 10 ? <button type="button" className="ix-link" onClick={() => setShowFullAccountability(true)}>View all</button> : null}>
                <div className="ix-tbl-wrap ix-fj-accwrap">{accountabilityTable(metaEntries.slice(0, 10), false)}</div>
              </Panel>
            )}

            {isAdmin && !editMode && (
              <div className="ix-fj-danger">
                <Button variant="danger" size="sm" icon="trash" onClick={() => onDelete && onDelete()}>Delete job</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {isAdmin && showFullAccountability && (
        <div className="ix-fj-modal" role="dialog" aria-label="Field accountability" onClick={() => setShowFullAccountability(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <div className="hd">
              <div>
                <b>Field accountability</b>
                <small>{metaEntries.length} updates, times in IST</small>
              </div>
              <Button size="sm" onClick={() => setShowFullAccountability(false)}>Close</Button>
            </div>
            <div className="bd ix-tbl-wrap">{accountabilityTable(metaEntries, true)}</div>
          </div>
        </div>
      )}

      {/* ── checks: Customs and BE, then the job's own check tabs (button press only) ── */}
      {detailTab === 'customs' && showCustomsTab && (
        <div className="ix-fj-checks">
          <CustomsStatusCard
            key={job.id}
            job={job}
            canEditBE={canEditField('be_no') && canEditField('be_date')}
            canUpdateStage={canUpdateStage}
            onMoveToStage={s => handleStageChange({ target: { value: s } })}
            onSaved={reload}
            toast={notify}
          />
          <UlipSection key={`${job.id}-checks`} job={job} groups={CUSTOMS_TAB_GROUPS} onJobChange={() => reload()} />
        </div>
      )}

      {extraTabs.filter(t => t.id === detailTab).map(t => (
        <div key={t.id} className="ix-fj-checks">
          <UlipSection key={job.id + t.id} job={job} groups={t.groups} onJobChange={() => reload()} />
        </div>
      ))}
    </div>
  )
}

export default JobDetailView
