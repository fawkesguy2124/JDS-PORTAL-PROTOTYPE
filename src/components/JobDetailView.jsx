import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import { getStageName } from '../utils/jobHelpers'
import OCRSection, { FIELD_LABELS_OCR, OCR_SECTIONS, OCR_FIELD_MAP, MULTI_VALUE_FIELDS } from '../components/OCRSection'
import JobDetailMobile from './mobile/JobDetailMobile'
import JobDetailDesktop from './desktop/JobDetailDesktop'
import { useAuth } from '../contexts/AuthContext'

function classNames(...xs) { return xs.filter(Boolean).join(' ') }

const STAGE_LIST = Array.from({ length: 11 }).map((_, i) => ({
  value: i,
  label: getStageName(i),
}))

const FIELD_LABELS = {
  job_no: 'Job Number',
  client: 'Client',
  mode: 'Mode',
  bl_no: 'BL Number',
  containers: 'Containers',
  shipping_line: 'Shipping Line',
  vessel: 'Vessel / Flight',
  eta: 'ETA',
  cfs_name: 'CFS Name',
  be_no: 'BE Number',
  be_date: 'BE Date',
  hs_code: 'HS Code',
  container_size: 'Container Size',
  rms_status: 'RMS Status',
  bg_required: 'BG Required',
  cfs_amount: 'CFS Amount',
  destination: 'Destination',
  priority: 'Priority',
  goods: 'Goods',
  free_days: 'Free Days',
  detention_risk: 'Detention Risk',
  stage: 'Current Stage',
  delay_reason: 'Delay Reason',
  notes: 'Notes',
  assigned_to: 'Assigned To',
  created_by: 'Created By',
  created_at: 'Created At',
  updated_at: 'Updated At',
}

const FIELD_PERMS = {
  job_no: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  client: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  mode: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
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
  destination: { can: 'all' },
  priority: { can: 'all' },
  goods: { can: 'all' },
  free_days: { can: 'all' },
  detention_risk: { can: 'all' },
  delay_reason: { can: 'all' },
  notes: { can: 'all' },
  stage: { can: ['Trupti', 'Uphadhya'] },
}

function formatDateSlash(value) {
  if (!value) return '—'
  const d = new Date(value)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function displayValue(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function priorityChip(priority) {
  const p = String(priority || 'normal').toLowerCase()
  if (p === 'urgent') return { text: 'Urgent', cls: 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]' }
  if (p === 'high') return { text: 'High', cls: 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]' }
  return { text: 'Normal', cls: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]' }
}

function modeChip(mode) {
  const m = String(mode || '').trim()
  if (m === 'Air') return { text: 'Air', cls: 'bg-[#f5f3ff] text-[#5b21b6] border border-[#ddd6fe]' }
  if (m === 'BPT/MBPT') return { text: 'BPT', cls: 'bg-purple-100 text-purple-800' }
  if (m === 'Sea LCL') return { text: 'LCL', cls: 'bg-[#f0fdfa] text-[#0f766e] border border-[#99f6e4]' }
  if (m === 'Sea FCL') return { text: 'FCL', cls: 'bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]' }
  return { text: m || '—', cls: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]' }
}

function normalizeMetaTs(ts) {
  if (!ts) return null
  const n = Number(ts)
  if (!Number.isFinite(n)) return null
  return n < 1e12 ? n * 1000 : n
}

function timeAgo(ts) {
  const ms = normalizeMetaTs(ts)
  if (!ms) return '—'
  const diff = Math.max(0, Date.now() - ms)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

function formatAccountabilityWhen(ts) {
  const ms = normalizeMetaTs(ts)
  if (!ms) return '-'
  const diff = Math.max(0, Date.now() - ms)
  const minutes = Math.floor(diff / (1000 * 60))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  return new Date(ms).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function progressColor(stage) {
  const s = Number(stage) || 0
  if (s <= 3) return 'bg-red-600'
  if (s <= 6) return 'bg-amber-500'
  if (s <= 9) return 'bg-blue-600'
  return 'bg-green-600'
}

function FieldProvenance({ meta, profiles }) {
  if (!meta || typeof meta !== 'object') return null

  const { by, ts, autoFill } = meta
  const hasManual   = by && ts
  const hasAutoFill = autoFill?.ts

  if (!hasManual && !hasAutoFill) return null

  const manualTs   = normalizeMetaTs(ts)
  const autoFillTs = normalizeMetaTs(autoFill?.ts)
  const lastWasManual = hasManual && (!hasAutoFill || manualTs >= autoFillTs)

  const name   = by && profiles?.[by] ? profiles[by] : by
  const afName = autoFill?.by && profiles?.[autoFill.by] ? profiles[autoFill.by] : autoFill?.by

  if (lastWasManual) {
    return (
      <div className="flex flex-wrap items-center gap-1 mt-1">
        <span className="text-[10px] font-semibold text-[#b45309]">✎ Manually entered</span>
        <span className="text-[10px] text-[#8a96a8]">·</span>
        <span className="text-[10px] text-[#8a96a8]">{timeAgo(ts)}</span>
        <span className="text-[10px] text-[#8a96a8]">·</span>
        <span className="text-[10px] text-[#8a96a8]">by {name || '—'}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      <span className="text-[10px] font-semibold text-[#15803d]">✓ Auto Filled</span>
      <span className="text-[10px] text-[#8a96a8]">·</span>
      <span className="text-[10px] text-[#8a96a8]">{timeAgo(autoFill.ts)}</span>
      <span className="text-[10px] text-[#8a96a8]">·</span>
      <span className="text-[10px] text-[#8a96a8]">by {afName || '—'}</span>
      {autoFill.source && (
        <>
          <span className="text-[10px] text-[#8a96a8]">·</span>
          <span className="text-[10px] text-[#1a4fa0] font-medium">📄 {autoFill.source}</span>
        </>
      )}
    </div>
  )
}

function MiniStatus({ title, value, tone }) {
  const tones = { blue: 'border-t-blue-500', amber: 'border-t-amber-500', green: 'border-t-green-500', gray: 'border-t-[#8a96a8]' }
  return (
    <div className={classNames('bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-3 border-t-4', tones[tone] || tones.blue)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8]">{title}</p>
      <p className="text-sm font-semibold text-[#1a2233] mt-1 truncate" title={value}>{value}</p>
    </div>
  )
}

function DetailField({ label, value, meta, profiles, showProvenance = true }) {
  const hasValue = value && value !== '—' && value !== '-' && String(value).trim() !== ''
  const isContainers = label === 'Containers'
  return (
    <div>
      <div className="flex items-center flex-wrap gap-1">
        <p className="text-xs uppercase tracking-wide text-[#8a96a8] font-medium">{label}</p>
      </div>
      {isContainers && hasValue ? (
        <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', marginTop:'2px' }}>
          {String(value).split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(s => s.length >= 4).map(cn => (
            <span key={cn} style={{
              fontFamily:"'JetBrains Mono',monospace", fontSize:'11px', fontWeight:500,
              padding:'2px 8px', borderRadius:'5px',
              background:'#E6F1FB', color:'#185FA5', border:'0.5px solid #B5D4F4',
              display:'inline-flex', alignItems:'center',
            }}>{cn}</span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#1a2233] font-medium mt-0.5">{value}</p>
      )}
      {showProvenance && hasValue && meta && <FieldProvenance meta={meta} profiles={profiles} />}
    </div>
  )
}

function JobProgress({ stage }) {
  const s = Number(stage) || 0
  const pct = Math.min(100, Math.round((s / 10) * 100))
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[#4a5568] truncate">Stage {s}: {getStageName(s)}</span>
        <span className="text-xs text-[#8a96a8]">{pct}%</span>
      </div>
      <div className="mt-0.5 h-0.5 bg-[#e2e6ed] border border-[#e2e6ed] rounded overflow-hidden">
        <div className="h-full bg-[#1a4fa0] rounded" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ContainerChipInput({ value, onChange }) {
  const [inputVal, setInputVal] = useState('')

  const chips = (value || '')
    .split(/[\s,;/]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length >= 4)

  const addChip = (raw) => {
    const newChips = raw.split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(s => s.length >= 4)
    const merged = [...new Set([...chips, ...newChips])]
    onChange(merged.join(' '))
    setInputVal('')
  }

  const removeChip = (cn) => {
    onChange(chips.filter(c => c !== cn).join(' '))
  }

  return (
    <div className="rounded-lg border border-[#e2e6ed] bg-white px-3 py-2 flex flex-wrap gap-2 cursor-text min-h-[42px]"
      onClick={() => document.getElementById('container-chip-input')?.focus()}>
      {chips.map(cn => (
        <span key={cn} style={{
          display:'inline-flex', alignItems:'center', gap:'4px',
          fontFamily:"'JetBrains Mono',monospace", fontSize:'11px', fontWeight:500,
          padding:'2px 8px', borderRadius:'5px',
          background:'#E6F1FB', color:'#185FA5', border:'0.5px solid #B5D4F4',
        }}>
          {cn}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); removeChip(cn) }}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#185FA5', fontSize:'12px', lineHeight:1, padding:'0 0 0 2px', opacity:0.7 }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
          >✕</button>
        </span>
      ))}
      <input
        id="container-chip-input"
        value={inputVal}
        onChange={e => setInputVal(e.target.value.toUpperCase())}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ' || e.key === ',') && inputVal.trim()) {
            e.preventDefault()
            addChip(inputVal.trim())
          }
          if (e.key === 'Backspace' && !inputVal && chips.length > 0) {
            removeChip(chips[chips.length - 1])
          }
        }}
        onBlur={() => { if (inputVal.trim()) addChip(inputVal.trim()) }}
        placeholder={chips.length === 0 ? 'Type container number, press Space or Enter...' : ''}
        style={{
          border:'none', outline:'none', background:'transparent',
          fontFamily:"'JetBrains Mono',monospace", fontSize:'11px',
          color:'#1a2233', minWidth:'200px', flex:1,
        }}
      />
    </div>
  )
}

function JobDetailView({ job, profiles, currentUserName, isAdmin, canUpdateStage, onBack, onSaved, toast, onDelete }) {
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stageUpdating, setStageUpdating] = useState(false)
  const [showFullAccountability, setShowFullAccountability] = useState(false)
  const [detailTab, setDetailTab] = useState(() => {
    const hash = window.location.hash.replace('#', '')
    return ['details', 'ocr', 'fields'].includes(hash) ? hash : 'details'
  })
  const [extractedFields, setExtractedFields] = useState(null)
  const [loadingExtracted, setLoadingExtracted] = useState(false)
  const [extractedData, setExtractedData] = useState(null)
  const [importedFields, setImportedFields] = useState({})
  const [fieldConfidence, setFieldConfidence] = useState({})
  const [summarising, setSummarising] = useState(false)
  const [form, setForm] = useState(() => ({ ...job }))
  const [hasUnsavedNotes, setHasUnsavedNotes] = useState(false)
  const notesRef = useRef(null)
  const meta = job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : {}

  const { user: authUser, profile: authProfile } = useAuth()

  const autoFillTimersRef = useRef([])
  useEffect(() => {
    return () => { autoFillTimersRef.current.forEach(clearTimeout) }
  }, [])


  const loadExtractedFields = async () => {
    setLoadingExtracted(true)
    try {
      const { data } = await supabase
        .from('job_extractions')
        .select('id, job_id, job_no, extracted_data, extracted_at, extracted_by_name')
        .eq('job_id', job.id)
        .order('extracted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setExtractedFields(data || null)
      setExtractedData(data?.extracted_data || null)
    } catch {
      setExtractedFields(null)
      setExtractedData(null)
    } finally {
      setLoadingExtracted(false)
    }
  }

  useEffect(() => {
    if (!job.id) return
    loadExtractedFields()
  }, [job.id])

  useEffect(() => {
    setEditMode(false)
    setSaving(false)
    setStageUpdating(false)
    setForm({ ...job })

    // On reload restore tab from hash — on fresh job open reset to details
    const hash = window.location.hash.replace('#', '')
    const isReload = ['details', 'ocr', 'fields'].includes(hash)
    if (!isReload) {
      setDetailTab('details')
      window.history.replaceState(null, '', window.location.pathname + window.location.search + '#details')
    } else {
      setDetailTab(hash)
    }
  }, [job?.id])

  const stage = Number(job.stage) || 0
  const pct = Math.min(100, Math.round((stage / 10) * 100))
  const stageName = getStageName(stage)
  const priority = priorityChip(job.priority)
  const mode = modeChip(job.mode)
  const assignedName = job.assigned_to ? profiles[job.assigned_to] ?? '—' : '—'
  const cfsDisplay = job.cfs_amount !== null && job.cfs_amount !== undefined && job.cfs_amount !== ''
    ? `Rs. ${Number(job.cfs_amount).toLocaleString('en-IN')}` : 'Pending'

  const canEditField = (fieldKey) => {
    if (isAdmin) return true
    if (['assigned_to','created_by','created_at','updated_at'].includes(fieldKey)) return false
    const rule = FIELD_PERMS[fieldKey]
    if (!rule) return false
    if (rule.can === 'all') return true
    return Array.isArray(rule.can) && rule.can.includes(currentUserName)
  }

  const fieldRows = [
    { key: 'job_no', label: 'Job Number', value: displayValue(job.job_no) },
    { key: 'client', label: 'Client', value: displayValue(job.client) },
    { key: 'mode', label: 'Mode', value: displayValue(job.mode) },
    { key: 'priority', label: 'Priority', value: displayValue(job.priority) },
    { key: 'goods', label: 'Goods', value: displayValue(job.goods) },
    { key: 'bl_no', label: 'BL Number', value: displayValue(job.bl_no) },
    { key: 'be_no', label: 'BE Number', value: displayValue(job.be_no) },
    { key: 'be_date', label: 'BE Date', value: formatDateSlash(job.be_date) },
    { key: 'containers', label: 'Containers', value: displayValue(job.containers) },
    { key: 'container_size', label: 'Container Size', value: displayValue(job.container_size) },
    { key: 'shipping_line', label: 'Shipping Line', value: displayValue(job.shipping_line) },
    { key: 'vessel', label: 'Vessel / Flight', value: displayValue(job.vessel) },
    { key: 'eta', label: 'ETA', value: formatDateSlash(job.eta) },
    { key: 'cfs_name', label: 'CFS Name', value: displayValue(job.cfs_name) },
    { key: 'cfs_amount', label: 'CFS Amount', value: cfsDisplay },
    { key: 'hs_code', label: 'HS Code', value: displayValue(job.hs_code) },
    { key: 'rms_status', label: 'RMS Status', value: displayValue(job.rms_status) },
    { key: 'bg_required', label: 'BG Required', value: displayValue(job.bg_required) },
    { key: 'destination', label: 'Destination', value: displayValue(job.destination) },
    { key: 'free_days', label: 'Free Days', value: displayValue(job.free_days) },
    { key: 'detention_risk', label: 'Detention Risk', value: displayValue(job.detention_risk) },
    { key: 'stage', label: 'Current Stage', value: `${stage} — ${stageName}` },
    { key: 'delay_reason', label: 'Delay Reason', value: displayValue(job.delay_reason) },
    { key: 'created_by', label: 'Created By', value: job.created_by ? profiles[job.created_by] ?? job.created_by : '—' },
    { key: 'created_at', label: 'Created At', value: formatDateTime(job.created_at) },
    { key: 'updated_at', label: 'Updated At', value: formatDateTime(job.updated_at) },
  ]

  const metaEntries = useMemo(() => {
    return Object.entries(meta || {})
      .filter(([, v]) => v && typeof v === 'object' && (v.by || v.ts))
      .map(([k, v]) => ({ key: k, label: FIELD_LABELS[k] || k, by: v.by || '—', ts: v.ts || null }))
      .sort((a, b) => (normalizeMetaTs(b.ts) || 0) - (normalizeMetaTs(a.ts) || 0))
  }, [meta])

  const updateForm = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates = {}
      const newMeta = { ...(meta || {}) }
      const candidates = ['job_no','client','mode','bl_no','containers','container_size','shipping_line','vessel','eta','cfs_name','be_no','be_date','hs_code','rms_status','bg_required','cfs_amount','destination','priority','goods','free_days','detention_risk','delay_reason','notes']
      candidates.forEach((k) => {
        if (!canEditField(k)) return
        const prev = job[k]
        let next = form[k]
        if (k === 'free_days' || k === 'cfs_amount') next = next === '' || next === null || next === undefined ? null : Number(next)
        if (k === 'eta' || k === 'be_date') next = next ? next : null
        if (typeof next === 'string') { next = next.trim(); if (next === '') next = null }
        if ((prev ?? null) !== (next ?? null)) { updates[k] = next; newMeta[k] = { by: currentUserName, ts: Date.now() } }
      })
      if (Object.keys(updates).length === 0) { toast('No changes to save.', 'info'); setEditMode(false); return }
      updates.field_meta = newMeta
      updates.updated_at = new Date().toISOString()
      const { error } = await supabase.from('jobs').update(updates).eq('id', job.id)
      if (error) throw error
      toast('Saved successfully.', 'success')
      setEditMode(false)
      await onSaved()
    } catch (e) {
      toast(e?.message || 'Save failed.', 'error')
    } finally { setSaving(false) }
  }

  const handleStageChange = async (e) => {
    const nextStage = Number(e.target.value)
    if (!Number.isFinite(nextStage)) return
    if (!canUpdateStage) { toast('You do not have permission to update stage.', 'error'); return }
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
      toast(`Stage updated to: ${getStageName(nextStage)}`, 'success')
      await onSaved()
    } catch (e2) { toast(e2?.message || 'Stage update failed.', 'error') }
    finally { setStageUpdating(false) }
  }

  const inputBase = 'w-full h-9 px-3 py-2 text-xs rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#e8eef8] disabled:opacity-60 disabled:cursor-not-allowed'

  const handleAutoFill = async (fieldKey) => {
    const ocrKey = OCR_FIELD_MAP[fieldKey]

    if (!ocrKey) {
      toast(`No extracted data available for ${FIELD_LABELS[fieldKey] || fieldKey}.`, 'info')
      return
    }
    if (!extractedData) {
      toast('No extracted data found. Run OCR Extract on this job first.', 'info')
      return
    }

    const extracted = extractedData[ocrKey]
    if (!extracted?.value) {
      toast(`No extracted value for ${FIELD_LABELS[fieldKey] || fieldKey}.`, 'info')
      return
    }

    const extractedValue = extracted.value.trim()
    const sourceDoc = extracted.source || null
    const now = Date.now()

    if (MULTI_VALUE_FIELDS.includes(fieldKey)) {
      const existing = (form[fieldKey] || '')
        .split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
      const incoming = extractedValue
        .split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
      const merged = [...new Set([...existing, ...incoming])]
      setForm(prev => ({ ...prev, [fieldKey]: merged.join(', ') }))
      toast(`✓ Added ${incoming.length} container(s) to ${FIELD_LABELS[fieldKey]}.`, 'success')
    } else {
      setForm(prev => ({ ...prev, [fieldKey]: extractedValue }))
      toast(`✓ Auto Filled ${FIELD_LABELS[fieldKey] || fieldKey}${sourceDoc ? ` from ${sourceDoc}` : ''}.`, 'success')
    }

    // Persist auto-fill record to field_meta
    const newMeta = {
      ...(meta || {}),
      [fieldKey]: {
        ...(meta?.[fieldKey] || {}),
        autoFill: { ts: now, by: currentUserName, source: sourceDoc },
      }
    }
    try {
      await supabase.from('jobs').update({ field_meta: newMeta }).eq('id', job.id)
      await onSaved()
    } catch (e) {
      console.warn('Could not persist auto-fill record:', e)
    }

    setImportedFields(prev => ({ ...prev, [fieldKey]: true }))
    const t1 = setTimeout(() => setImportedFields(prev => ({ ...prev, [fieldKey]: false })), 2500)
    autoFillTimersRef.current.push(t1)
  }

  const handleAutoFillAll = async () => {
    if (!extractedData) {
      toast('No extracted data found. Run OCR Extract on this job first.', 'info')
      return
    }

    const fillableKeys = ['job_no','client','mode','goods','bl_no','containers','container_size',
      'shipping_line','vessel','eta','hs_code','destination','importer_gstin','importer_iec',
      'ad_code','igm_no','igm_date','hawb_no','hawb_date','bl_date','port_of_loading',
      'port_of_shipment','port_of_discharge','country_of_origin','country_of_consignment',
      'package_count','gross_weight','net_weight','supplier_name','supplier_address','supplier_country'
    ].filter(k => canEditField(k) && OCR_FIELD_MAP[k] && extractedData[OCR_FIELD_MAP[k]]?.value)

    if (fillableKeys.length === 0) {
      toast('No extracted values available to fill.', 'info')
      return
    }

    const newForm = { ...form }
    const newMeta = { ...(meta || {}) }
    const newConfidence = {}
    const now = Date.now()

    for (const k of fillableKeys) {
      const ocrKey = OCR_FIELD_MAP[k]
      const extracted = extractedData[ocrKey]
      if (!extracted?.value) continue

      const extractedValue = extracted.value.trim()
      const sourceDoc = extracted.source || null
      const confidence = extracted.confidence || 'low'

      if (MULTI_VALUE_FIELDS.includes(k)) {
        const existing = (newForm[k] || '').split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
        const incoming = extractedValue.split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
        newForm[k] = [...new Set([...existing, ...incoming])].join(', ')
      } else {
        newForm[k] = extractedValue
      }

      newConfidence[k] = confidence
      newMeta[k] = {
        ...(newMeta[k] || {}),
        autoFill: { ts: now, by: currentUserName, source: sourceDoc },
      }
    }

    setForm(newForm)
    setFieldConfidence(newConfidence)
    setImportedFields(Object.fromEntries(fillableKeys.map(k => [k, true])))

    try {
      await supabase.from('jobs').update({ field_meta: newMeta }).eq('id', job.id)
      await onSaved()
    } catch (e) {
      console.warn('Could not persist auto-fill record:', e)
    }

    toast(`✓ ${fillableKeys.length} fields filled from OCR. Please review highlighted fields.`, 'success')

    const t2 = setTimeout(() => setImportedFields({}), 3000)
    autoFillTimersRef.current.push(t2)
  }

  const renderFieldInput = (key) => {
    const disabled = !canEditField(key) || saving
    const value = form[key] ?? ''
    if (key === 'mode') return <select value={value||''} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="">—</option><option value="Sea FCL">Sea FCL</option><option value="Sea LCL">Sea LCL</option><option value="Air">Air</option><option value="BPT/MBPT">BPT/MBPT</option></select>
    if (key === 'priority') return <select value={value||'normal'} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
    if (key === 'rms_status') return <select value={value||'pending'} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="pending">pending</option><option value="rms">rms</option><option value="apr">apr</option><option value="acl">acl</option><option value="check">check</option><option value="hold">hold</option></select>
    if (key === 'bg_required') return <select value={value||'no'} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="no">no</option><option value="yes">yes</option><option value="100percent">100percent</option></select>
    if (key === 'detention_risk') return <select value={value||'low'} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>
    if (key === 'be_date') return <input type="date" value={value||''} onChange={updateForm(key)} disabled={disabled} className={inputBase} />
    if (key === 'container_size') {
      return (
        <select value={value || ''} onChange={updateForm(key)} disabled={disabled} className={inputBase}>
          <option value="">— Select —</option>
          <option value="20 Feet">20 Feet</option>
          <option value="40 Feet">40 Feet</option>
        </select>
      )
    }
    if (key === 'eta') return <input type="date" value={value||''} onChange={updateForm(key)} disabled={disabled} className={inputBase} />
    if (key === 'free_days' || key === 'cfs_amount') return <input type="number" value={value??''} onChange={updateForm(key)} disabled={disabled} className={inputBase} />
    if (key === 'shipping_line') {
      return (
        <select value={value || ''} onChange={updateForm(key)} disabled={disabled} className={inputBase}>
          <option value="">— Select —</option>
          <option value="Maersk">Maersk</option>
          <option value="MSC">MSC</option>
          <option value="Hapag-Lloyd">Hapag-Lloyd</option>
          <option value="CMA-CGM">CMA-CGM</option>
          <option value="Evergreen">Evergreen</option>
          <option value="ONE">ONE</option>
          <option value="OOCL">OOCL</option>
          <option value="COSCO">COSCO</option>
          <option value="ZIM">ZIM</option>
          <option value="HMM">HMM</option>
          <option value="Yang Ming">Yang Ming</option>
          <option value="Wan Hai">Wan Hai</option>
          <option value="TS Line">TS Line</option>
          <option value="Interasia">Interasia</option>
          <option value="Emirates">Emirates</option>
          <option value="Akkon">Akkon</option>
          <option value="Other">Other</option>
        </select>
      )
    }
    if (key === 'notes') {
      const adjustRows = (el) => {
        el.rows = 6
        const h = el.scrollHeight - 16
        const rowH = (el.clientHeight - 16) / 6
        el.rows = Math.min(8, Math.max(6, Math.ceil(h / rowH)))
      }
      return <textarea ref={notesRef} value={value||''} onChange={e => { updateForm(key)(e); adjustRows(e.target) }} disabled={disabled} rows={6} className={classNames(inputBase,'h-auto py-2 overflow-y-auto')} style={{ fontSize:'15px', lineHeight:'1.7', letterSpacing:'0.01em', resize:'none', maxHeight: `${8 * 1.7 * 15 + 16}px` }} />
    }
    return <input type="text" value={value||''} onChange={updateForm(key)} disabled={disabled} className={inputBase} />
  }

  const handleAISummary = async () => {
    if (!job?.id) return

    if (!extractedData || Object.keys(extractedData).length === 0) {
      toast('No extracted data found. Run OCR Extract on this job first.', 'info')
      return
    }

    setSummarising(true)
    try {
      const fieldLines = Object.entries(extractedData)
        .filter(([, v]) => v?.value)
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v.value}`)
        .join('\n')

      const prompt = `You are a customs clearance assistant for JDS Logistics, a licensed CHA at JNPT, Navi Mumbai.

Based on the extracted document fields below, write a concise 2-3 sentence operational summary for the job notes.
Focus on: what goods are being imported, by whom, from where, and any key customs details.
Be factual, professional, and brief. No greetings or sign-offs.

Job: ${job.job_no} | Client: ${job.client || '\u2014'} | Stage: ${getStageName(Number(job.stage) || 0)}

Extracted Fields:
${fieldLines}

Write the summary:`

      let summary = null
      let usedGroq = false

      try {
        const geminiKey = import.meta.env.VITE_GEMINI_API_KEY
        if (geminiKey) {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
              }),
            }
          )
          if (res.ok) {
            const data = await res.json()
            summary = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
          } else {
            console.warn(`Gemini ${res.status} \u2014 trying Groq`)
          }
        }
      } catch (e) {
        console.warn('Gemini error:', e.message)
      }

      if (!summary) {
        const groqKey = import.meta.env.VITE_GROQ_API_KEY
        if (!groqKey) throw new Error('No AI API key configured.')
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            temperature: 0.3,
            max_tokens: 200,
            messages: [{ role: 'user', content: prompt }],
          }),
        })
        if (!res.ok) throw new Error(`Groq returned ${res.status}`)
        const data = await res.json()
        summary = data?.choices?.[0]?.message?.content?.trim() || null
        if (summary) usedGroq = true
      }

      if (!summary) throw new Error('No summary returned from either provider')

      const existing = form.notes ? form.notes.trim() : ''
      const separator = existing ? '\n\n' : ''
      const dateStamp = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
      const provider = usedGroq ? 'Groq \u00b7 Llama 4' : 'Gemini 2.0 Flash'
      const newNotes = `${existing}${separator}[AI Summary \u2014 ${dateStamp} \u00b7 ${provider}]\n${summary}`

      setForm(prev => ({ ...prev, notes: newNotes }))
      toast('AI summary added to notes. Review and save when ready.', 'success')
    } catch (e) {
      toast(`Summary failed: ${e.message}`, 'error')
    } finally {
      setSummarising(false)
    }
  }

  const content = (
    <>
    <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-[#e2e6ed] flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="h-9 px-3 text-xs rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold">
          ← Back to Jobs
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm sm:text-base font-extrabold text-[#1a2233] truncate">{job.job_no} — {job.client}</div>
          <div className="mt-1 flex flex-wrap gap-2">
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', priority.cls)}>{priority.text}</span>
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', mode.cls)}>{mode.text}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editMode && detailTab === 'details' ? (
            <>
              <button type="button" onClick={() => setEditMode(true)} className="h-9 px-4 text-xs rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold">Edit</button>
              <select disabled={!canUpdateStage||stageUpdating} value={stage} onChange={handleStageChange}
                className={classNames('h-9 px-3 text-xs rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#4a5568] outline-none focus:border-[#1a4fa0]', (!canUpdateStage||stageUpdating)?'opacity-60 cursor-not-allowed':'hover:border-[#1a4fa0]')}>
                {STAGE_LIST.map((s) => <option key={s.value} value={s.value}>{s.value} — {s.label}</option>)}
              </select>
              <span className="text-xs text-[#8a96a8] font-semibold">Update Stage</span>
            </>
          ) : (
            <>
              <button type="button" disabled={saving} onClick={() => { setEditMode(false); setForm({...job}) }}
                className="h-9 px-4 text-xs rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold disabled:opacity-60">Cancel</button>
              <button type="button" disabled={saving} onClick={handleSave}
                className="h-9 px-4 text-xs rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold disabled:opacity-60 inline-flex items-center gap-2">
                {saving && <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Save
              </button>
            </>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 border-b border-[#e2e6ed] bg-[#f8f9fb]">
        <div className="flex gap-1 py-2">
          <button type="button" onClick={() => { setDetailTab('details'); window.history.replaceState(null, '', window.location.pathname + window.location.search + '#details') }}
            className={classNames('px-4 py-1.5 text-xs font-bold rounded-lg transition-colors', detailTab === 'details' ? 'bg-white text-[#1a4fa0] shadow-sm border border-[#e2e6ed]' : 'text-[#8a96a8] hover:text-[#1a4fa0]')}>
            Job Details
          </button>
          <button type="button" onClick={() => { setDetailTab('ocr'); window.history.replaceState(null, '', window.location.pathname + window.location.search + '#ocr') }}
            className={classNames('px-4 py-1.5 text-xs font-bold rounded-lg transition-colors', detailTab === 'ocr' ? 'bg-white text-[#1a4fa0] shadow-sm border border-[#e2e6ed]' : 'text-[#8a96a8] hover:text-[#1a4fa0]')}>
            ✦ OCR Extract
          </button>
          <button type="button" onClick={() => { setDetailTab('fields'); window.history.replaceState(null, '', window.location.pathname + window.location.search + '#fields') }}
            className={classNames('px-4 py-1.5 text-xs font-bold rounded-lg transition-colors', detailTab === 'fields' ? 'bg-white text-[#1a4fa0] shadow-sm border border-[#e2e6ed]' : 'text-[#8a96a8] hover:text-[#1a4fa0]')}>
            ✦ Extracted Fields
          </button>
        </div>
      </div>

      {detailTab === 'details' && (
      <>
      <div className="px-4 sm:px-6 py-4 border-b border-[#e2e6ed] bg-[#f8f9fb]">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm font-medium text-[#4a5568] truncate">{stageName}</div>
          <div className="text-xs text-[#8a96a8]">{pct}%</div>
        </div>
        <div className="h-2 bg-[#e2e6ed] border border-[#e2e6ed] rounded overflow-hidden">
          <div className={classNames('h-full rounded', progressColor(stage))} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 border-b border-[#e2e6ed]">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStatus title="CUSTOMS" value={job.rms_status ? String(job.rms_status).toUpperCase() : '—'} tone="blue" />
          <MiniStatus title="CFS" value={cfsDisplay} tone="amber" />
          <MiniStatus title="TRANSPORT" value={job.vessel?.trim() ? job.vessel : 'Not Yet'} tone="gray" />
          <MiniStatus title="DELIVERY" value={job.destination?.trim() ? job.destination : 'Pending'} tone="green" />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#1a2233]">Job Details</h3>
          {editMode && (
            <button
              type="button"
              onClick={handleAutoFillAll}
              disabled={!extractedData}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border transition-all"
              style={{
                background: extractedData ? '#eff6ff' : '#f4f6f9',
                color: extractedData ? '#1a4fa0' : '#8a96a8',
                border: extractedData ? '1px solid #bfdbfe' : '1px solid #e2e6ed',
                cursor: extractedData ? 'pointer' : 'not-allowed',
                opacity: extractedData ? 1 : 0.6,
              }}
              onMouseEnter={e => { if (extractedData) { e.currentTarget.style.background='#1a4fa0'; e.currentTarget.style.color='white' }}}
              onMouseLeave={e => { e.currentTarget.style.background= extractedData ? '#eff6ff' : '#f4f6f9'; e.currentTarget.style.color= extractedData ? '#1a4fa0' : '#8a96a8' }}
              title={extractedData ? 'Fill all fields from OCR extracted data' : 'Run OCR Extract first to enable auto-fill'}
            >
              ✨ Auto Fill
            </button>
          )}
        </div>
        {!editMode ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left — job fields, 2 columns wide */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
              {fieldRows.filter(f => f.key !== 'notes').map((f) => (
                <DetailField key={f.key} label={f.label} value={f.value} meta={meta?.[f.key]} profiles={profiles} showProvenance={f.key !== 'notes'} />
              ))}
            </div>

            {/* Right — notes + delay reason */}
            <div className="lg:col-span-1 flex flex-col gap-4">
              {/* Delay reason */}
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8]">Delay Reason</p>
                {editMode ? (
                  <input type="text" value={form.delay_reason || ''} onChange={e => setForm(p => ({...p, delay_reason: e.target.value}))}
                    placeholder="Enter delay reason..."
                    className="w-full rounded-lg border border-[#e2e6ed] bg-white px-3 py-2 text-sm text-[#1a2233] focus:border-[#1a4fa0] focus:outline-none focus:ring-1 focus:ring-[#1a4fa0]" />
                ) : (
                  <p className="text-sm text-[#4a5568]">{job.delay_reason?.trim() || <span className="text-[#d0d6e0]">\u2014</span>}</p>
                )}
              </div>
              <div className="flex flex-col rounded-lg border border-[#e2e6ed] bg-[#f8f9fb] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#e2e6ed] flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8]">Notes</p>
                  <button
                    type="button"
                    onClick={handleAISummary}
                    disabled={summarising}
                    style={{
                      padding:'2px 8px', borderRadius:'6px', fontSize:'11px', fontWeight:600,
                      background: summarising ? '#f4f6f9' : '#eff6ff',
                      color: summarising ? '#8a96a8' : '#1a4fa0',
                      border:'1px solid #bfdbfe', cursor: summarising ? 'default' : 'pointer',
                    }}
                  >
                    {summarising ? '...' : '✦ AI Summary'}
                  </button>
                </div>
                <div className="px-4 py-3">
                  <textarea
                    value={form.notes || ''}
                    onChange={e => {
                      setForm(p => ({ ...p, notes: e.target.value }))
                      setHasUnsavedNotes(true)
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                    }}
                    onInput={e => {
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                    }}
                    ref={el => {
                      if (el) {
                        el.style.height = 'auto'
                        el.style.height = el.scrollHeight + 'px'
                      }
                    }}
                    placeholder="No notes yet — click to add..."
                    rows={2}
                    style={{ overflow:'hidden', minHeight:'48px' }}
                    className="w-full text-sm text-[#4a5568] bg-transparent border-none outline-none resize-none leading-relaxed placeholder:text-[#d0d6e0] font-[inherit]"
                  />
                </div>
                {hasUnsavedNotes && !editMode && (
                  <div className="px-4 pb-3 flex justify-end">
                    <button
                      onClick={async () => {
                        try {
                          const newMeta = { ...(meta || {}), notes: { by: currentUserName, ts: Date.now() } }
                          const { error } = await supabase.from('jobs')
                            .update({ notes: form.notes, field_meta: newMeta, updated_at: new Date().toISOString() })
                            .eq('id', job.id)
                          if (error) throw error
                          await onSaved()
                          setHasUnsavedNotes(false)
                          toast && toast('Notes saved', 'success')
                        } catch (e) {
                          toast && toast(e?.message || 'Failed to save notes', 'error')
                        }
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1a4fa0] text-white hover:bg-[#0f3d8a]"
                    >
                      Save notes
                    </button>
                  </div>
                )}
              </div>

              {isAdmin && (
              <div className="rounded-lg border border-[#e2e6ed] bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-[#e2e6ed] flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8]">Field Accountability</p>
                  {metaEntries.length > 5 && (
                    <button type="button" onClick={() => setShowFullAccountability(true)}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-800">
                      View All
                    </button>
                  )}
                </div>
                <div className="max-h-[220px] overflow-y-auto">
                  <table className="w-full table-fixed text-xs">
                    <thead className="sticky top-0 z-10 bg-[#f8f9fb] text-[#8a96a8]">
                      <tr>
                        <th className="w-[40%] text-left px-3 py-2 font-semibold uppercase tracking-wide text-[10px]">Field</th>
                        <th className="w-[30%] text-left px-3 py-2 font-semibold uppercase tracking-wide text-[10px]">By</th>
                        <th className="w-[30%] text-left px-3 py-2 font-semibold uppercase tracking-wide text-[10px]">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metaEntries.length ? metaEntries.slice(0, 10).map((m) => (
                        <tr key={m.key} className="border-t border-[#e2e6ed]">
                          <td className="px-3 py-1.5 text-[#4a5568] truncate text-[11px]" title={m.label}>{m.label}</td>
                          <td className="px-3 py-1.5 text-[#1a2233] font-semibold truncate text-[11px]">{profiles[m.by] || m.by}</td>
                          <td className="px-3 py-1.5 text-[#8a96a8] text-[11px]">{formatAccountabilityWhen(m.ts)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={3} className="px-3 py-6 text-center text-[#8a96a8] text-[11px]">No updates logged yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
      </div>
    </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left — editable fields, 2 columns wide */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
              {['job_no','client','mode','priority','goods','bl_no','be_no','be_date','containers','container_size','shipping_line','vessel','eta','cfs_name','cfs_amount','hs_code','rms_status','bg_required','destination','free_days','detention_risk','delay_reason'].map((k) => {
                const hasOcrValue   = OCR_FIELD_MAP[k] !== undefined && OCR_FIELD_MAP[k] !== null && !!extractedData?.[OCR_FIELD_MAP[k]]?.value
                const isEditable    = canEditField(k)
                const wasJustFilled = importedFields[k]

                return (
                  <div key={k} className="flex flex-col gap-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <p className="text-xs text-[#8a96a8] font-medium uppercase tracking-wide">{FIELD_LABELS[k] || k}</p>
                      {wasJustFilled && (
                        <span className="text-[10px] text-emerald-600 font-semibold">\u2713 Auto-filled</span>
                      )}
                    </div>
                    {isEditable ? (
                      k === 'containers' ? (
                        <ContainerChipInput
                          value={form.containers || ''}
                          onChange={val => { setForm(p => ({...p, containers: val})) }}
                        />
                      ) : k === 'mode' ? (
                        <select value={form[k] || ''} onChange={e => { setForm(p => ({...p, [k]: e.target.value})) }}
                          className="w-full rounded-lg border border-[#e2e6ed] bg-white px-3 py-2 text-sm text-[#1a2233] focus:border-[#1a4fa0] focus:outline-none focus:ring-1 focus:ring-[#1a4fa0]">
                          <option value="">Select mode</option>
                          {['Sea FCL','Sea LCL','Air','Courier','Land'].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      ) : k === 'priority' ? (
                        <select value={form[k] || ''} onChange={e => { setForm(p => ({...p, [k]: e.target.value})) }}
                          className="w-full rounded-lg border border-[#e2e6ed] bg-white px-3 py-2 text-sm text-[#1a2233] focus:border-[#1a4fa0] focus:outline-none focus:ring-1 focus:ring-[#1a4fa0]">
                          <option value="">Select priority</option>
                          {['normal','high','urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      ) : k === 'eta' || k === 'be_date' ? (
                        <input type="date" value={(form[k] || '').slice(0,10)} onChange={e => { setForm(p => ({...p, [k]: e.target.value})) }}
                          className="w-full rounded-lg border border-[#e2e6ed] bg-white px-3 py-2 text-sm text-[#1a2233] focus:border-[#1a4fa0] focus:outline-none focus:ring-1 focus:ring-[#1a4fa0]" />
                      ) : k === 'bg_required' || k === 'detention_risk' ? (
                        <select value={form[k] || ''} onChange={e => { setForm(p => ({...p, [k]: e.target.value})) }}
                          className="w-full rounded-lg border border-[#e2e6ed] bg-white px-3 py-2 text-sm text-[#1a2233] focus:border-[#1a4fa0] focus:outline-none focus:ring-1 focus:ring-[#1a4fa0]">
                          <option value="">Select</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      ) : (
                        <input type="text" value={form[k] || ''} onChange={e => { setForm(p => ({...p, [k]: e.target.value})) }}
                          className={`w-full rounded-lg border px-3 py-2 text-sm text-[#1a2233] focus:outline-none focus:ring-1 focus:ring-[#1a4fa0] ${wasJustFilled ? 'border-emerald-400 bg-emerald-50 focus:border-emerald-500' : 'border-[#e2e6ed] bg-white focus:border-[#1a4fa0]'}`} />
                      )
                    ) : (
                      <p className="text-sm text-[#1a2233] py-2">{form[k] || <span className="text-[#d0d6e0]">\u2014</span>}</p>
                    )}
                    {fieldConfidence[k] && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border w-fit ${
                        fieldConfidence[k] === 'high' ? 'bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]' :
                        fieldConfidence[k] === 'medium' ? 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]' :
                        'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]'
                      }`}>
                        {fieldConfidence[k] === 'high' ? '\u25CF High confidence' :
                         fieldConfidence[k] === 'medium' ? '\u25CF Medium \u2014 please verify' :
                         '\u25CF Low confidence \u2014 check manually'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Right — notes + delay reason + field accountability */}
            <div className="lg:col-span-1 flex flex-col gap-4">
              {/* Delay reason */}
              <div className="flex flex-col gap-1">
                <p className="text-xs text-[#8a96a8] font-medium uppercase tracking-wide">Delay Reason</p>
                <input type="text" value={form.delay_reason || ''} onChange={e => setForm(p => ({...p, delay_reason: e.target.value}))}
                  placeholder="Enter delay reason..."
                  className="w-full rounded-lg border border-[#e2e6ed] bg-white px-3 py-2 text-sm text-[#1a2233] focus:border-[#1a4fa0] focus:outline-none focus:ring-1 focus:ring-[#1a4fa0]" />
              </div>

              {/* Notes */}
              <div className="flex flex-col rounded-lg border border-[#e2e6ed] bg-[#f8f9fb] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#e2e6ed] flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8]">Notes</p>
                  <button
                    type="button"
                    onClick={handleAISummary}
                    disabled={summarising}
                    style={{
                      padding:'2px 8px', borderRadius:'6px', fontSize:'11px', fontWeight:600,
                      background: summarising ? '#f4f6f9' : '#eff6ff',
                      color: summarising ? '#8a96a8' : '#1a4fa0',
                      border:'1px solid #bfdbfe', cursor: summarising ? 'default' : 'pointer',
                    }}
                  >
                    {summarising ? '...' : '✦ AI Summary'}
                  </button>
                </div>
                <div className="px-4 py-3">
                  <textarea
                    value={form.notes || ''}
                    onChange={e => {
                      setForm(p => ({ ...p, notes: e.target.value }))
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                    }}
                    onInput={e => {
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                    }}
                    ref={el => {
                      if (el) {
                        el.style.height = 'auto'
                        el.style.height = el.scrollHeight + 'px'
                      }
                    }}
                    placeholder="Add notes here..."
                    rows={2}
                    style={{ overflow:'hidden', minHeight:'48px' }}
                    className="w-full text-sm text-[#1a2233] bg-transparent border-none outline-none resize-none leading-relaxed placeholder:text-[#d0d6e0] font-[inherit]"
                  />
                </div>
              </div>

              {isAdmin && (
              <div className="rounded-lg border border-[#e2e6ed] bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-[#e2e6ed]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8]">Field Accountability</p>
                </div>
                <div className="max-h-[220px] overflow-y-auto">
                  <table className="w-full table-fixed text-xs">
                    <thead className="sticky top-0 z-10 bg-[#f8f9fb] text-[#8a96a8]">
                      <tr>
                        <th className="w-[40%] text-left px-3 py-2 font-semibold uppercase tracking-wide text-[10px]">Field</th>
                        <th className="w-[30%] text-left px-3 py-2 font-semibold uppercase tracking-wide text-[10px]">By</th>
                        <th className="w-[30%] text-left px-3 py-2 font-semibold uppercase tracking-wide text-[10px]">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metaEntries.length ? metaEntries.slice(0, 10).map((m) => (
                        <tr key={m.key} className="border-t border-[#e2e6ed]">
                          <td className="px-3 py-1.5 text-[#4a5568] truncate text-[11px]">{m.label}</td>
                          <td className="px-3 py-1.5 text-[#1a2233] font-semibold truncate text-[11px]">{profiles[m.by] || m.by}</td>
                          <td className="px-3 py-1.5 text-[#8a96a8] text-[11px]">{formatAccountabilityWhen(m.ts)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={3} className="px-3 py-6 text-center text-[#8a96a8] text-[11px]">No updates logged yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              )}
            </div>
          </div>
        )}
        </div>

        {isAdmin && showFullAccountability && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-3xl max-h-[82vh] overflow-hidden rounded-xl bg-white shadow-2xl border border-[#e2e6ed]">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-[#1a2233]">Field Accountability</div>
                <div className="text-xs text-[#8a96a8]">{metaEntries.length} updates shown in IST</div>
              </div>
              <button type="button" onClick={() => setShowFullAccountability(false)}
                className="h-8 px-3 text-xs rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold">
                Close
              </button>
            </div>
            <div className="max-h-[68vh] overflow-y-auto">
              <table className="w-full table-fixed text-xs">
                <thead className="sticky top-0 z-10 bg-[#f8f9fb] text-[#8a96a8]">
                  <tr>
                    <th className="w-[36%] text-left px-5 py-3 font-semibold uppercase tracking-wide text-xs">Field Name</th>
                    <th className="w-[32%] text-left px-5 py-3 font-semibold uppercase tracking-wide text-xs">Updated By</th>
                    <th className="w-[32%] text-left px-5 py-3 font-semibold uppercase tracking-wide text-xs">When</th>
                  </tr>
                </thead>
                <tbody>
                  {metaEntries.map((m) => (
                    <tr key={m.key} className="border-t border-[#e2e6ed]">
                      <td className="px-5 py-2 text-[#4a5568]">{m.label}</td>
                      <td className="px-5 py-2 text-[#1a2233] font-semibold">{profiles[m.by] || m.by}</td>
                      <td className="px-5 py-2 text-[#8a96a8]">{formatAccountabilityWhen(m.ts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 sm:px-6 pb-6">
        {isAdmin && (
          <button type="button" onClick={() => onDelete && onDelete()}
            className="h-9 px-5 text-xs rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 font-semibold">
            Delete Job
          </button>
        )}
      </div>
      </>
      )}

      {detailTab === 'ocr' && (
        <div className="px-4 sm:px-6 py-5">
          <OCRSection
            job={job}
            showToast={toast}
            preloadedExtraction={extractedFields}
            currentUserName={currentUserName}
            user={authUser}
            profile={authProfile}
            onSaved={loadExtractedFields}
          />
        </div>
      )}
      {detailTab === 'fields' && (
        <div className="px-4 sm:px-6 py-5">
          {loadingExtracted ? (
            <div className="flex items-center justify-center py-12">
              <span className="h-5 w-5 border-2 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm text-[#8a96a8]">Loading extracted fields...</span>
            </div>
          ) : extractedFields ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[#1a2233]">✦ Extracted Fields</h3>
                {extractedFields.extracted_at && (
                  <span className="text-xs text-[#8a96a8]">
                    Extracted {new Date(extractedFields.extracted_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                    {extractedFields.extracted_by_name ? ` · by ${extractedFields.extracted_by_name}` : ''}
                  </span>
                )}
              </div>
              {OCR_SECTIONS.map((section) => {
                const data = extractedFields.extracted_data || {}
                const relevant = section.fields.filter((k) => data[k] !== undefined)
                if (!relevant.length) return null
                return (
                  <div key={section.title} className="mb-5">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-[#8a96a8] mb-2 border-b border-[#e2e6ed] pb-1">{section.title}</h4>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      {relevant.map((k) => {
                        const field = data[k] || {}
                        let borderColor = 'border-gray-200'
                        if (!field.value) borderColor = 'border-red-300 bg-red-50'
                        else if (field.confidence === 'high') borderColor = 'border-green-400'
                        else if (field.confidence === 'medium') borderColor = 'border-amber-400'
                        else borderColor = 'border-red-300'
                        const label = FIELD_LABELS_OCR?.[k] || k.replace(/_/g, ' ')
                        return (
                          <div key={k} className={'rounded-lg border-l-4 px-3 py-2 bg-white border-[1.5px] ' + borderColor}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a96a8]">{label}</p>
                            <p className="text-sm font-semibold text-[#1a2233] mt-0.5">{field.value || '—'}</p>
                            {field.source && <p className="text-[10px] text-[#8a96a8] mt-0.5">Source: {field.source}</p>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {(() => {
                const data = extractedFields.extracted_data || {}
                const otherKeys = Object.keys(data).filter((k) => !OCR_SECTIONS.some(s => s.fields.includes(k)))
                if (!otherKeys.length) return null
                return (
                  <div className="mb-5">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-[#8a96a8] mb-2 border-b border-[#e2e6ed] pb-1">Other Fields</h4>
                    <div className="flex flex-wrap gap-2">
                      {otherKeys.map((k) => {
                        const label = FIELD_LABELS_OCR?.[k] || k.replace(/_/g, ' ')
                        return (
                          <span key={k} className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-[#f4f6f9] text-[#8a96a8] border border-[#e2e6ed]">{label}: {data[k]?.value || '—'}</span>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-[#8a96a8] mb-2">No extracted fields found for this job</p>
              <p className="text-xs text-[#8a96a8]">Use the <strong>OCR Extract</strong> tab above to extract fields from uploaded documents</p>
            </div>
          )}
        </div>
      )}

    </div>
    </>
  )

  return (
    <>
      <div className="block md:hidden">
        <JobDetailMobile job={job} onBack={onBack}>{content}</JobDetailMobile>
      </div>
      <div className="hidden md:block">
        {content}
      </div>
    </>
  )
}

export default JobDetailView
