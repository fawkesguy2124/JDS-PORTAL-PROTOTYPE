/* eslint-disable react-refresh/only-export-components -- the jobs table shares the row helpers and the pager with this panel */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { parseContainerNos, getContainerSize } from '../utils/jobHelpers'
import { portLabel } from '../utils/ports'
import { useJourney } from './JourneyContext'
import {
  containerFinishedOn, containerTrip, containerWhere, daysAgo, daysSinceLastMove, deliveryBy,
  displayLine, freeTimeFor, tripMilestones, STALE_AFTER_DAYS,
} from '../services/journey'
import { seaOf } from '../../supabase/functions/_shared/portal/ships.js'
import { Button, Chip, Dash, EmptyState, FreeDays, Icon, JobNo, Section, Segmented, Status, fmtDate, fmtDateTime, fmtTime, jobOwnerName, worst } from './ui'
import { vesselOf, shipIdOf } from './ShipMap'
import { openDoc, downloadDoc } from '../services/docFiles'
import PdfPreview from '../components/PdfPreview'
import SeaTracking, { portTime } from './SeaTracking'
import BeStage from './BeStage'
import AirCargo from './AirCargo'
import { rememberJob } from './recentJobs'
import { availableTypes, docTypeLabel } from '../utils/docTypes'
import { uploadJobDocument } from '../services/jobDocuments'
import './styles/jobs.css'

// ─────────────────────────────────────────────────────────────────────────────
// Row helpers shared with the All jobs table, so the table and the panel say the
// same thing about a job (Jose, 31 Oct 2026: one number, one source).
// ─────────────────────────────────────────────────────────────────────────────

export const jobNum = (job) => parseInt(String(job?.job_no || '').replace(/\D/g, ''), 10) || 0

// '40′ HC', '20′' from whatever was typed or tracked ('40HC', "40'", '20GP')
const SIZE = /(20|40|45)\s*['′]?\s*(HC|HQ|RF|RH|OT|FR|GP|DV|ST)?/i
const sizeLabel = (s) => {
  const m = SIZE.exec(String(s || ''))
  if (!m) return ''
  const t = (m[2] || '').toUpperCase().replace('HQ', 'HC')
  return `${m[1]}′${['HC', 'RF', 'RH', 'OT', 'FR'].includes(t) ? ` ${t}` : ''}`
}
export const boxSize = (job, no, data) => sizeLabel(getContainerSize(job, no) || data?.containersByNo?.[no]?.container_size)

// '2×40′', '1×20′ + 1×40′ HC', 'LCL' (LCL cargo shares a box, so its count says little)
export function boxesText(job, data) {
  const nos = [...new Set(parseContainerNos(job?.containers))]
  if (/lcl/i.test(job?.mode || '')) return 'LCL'
  if (!nos.length) return null
  const by = new Map()
  for (const no of nos) { const k = boxSize(job, no, data); by.set(k, (by.get(k) || 0) + 1) }
  return [...by].map(([k, n]) => (k ? `${n}×${k}` : `${n} box${n === 1 ? '' : 'es'}`)).join(' + ')
}

// The next thing to do, as a verb ('Arrange truck or rail'), without the 'Next:' prefix
export function nextStepText(j) {
  if (!j || j.phase === 'delivered') return null
  const t = String(j.steps?.find((s) => s.current)?.nextText || '').replace(/^Next:\s*/i, '')
  // "Waiting for OOC / arrival" only repeats the status next to it (Jose, 31 Oct 2026):
  // the next step is shown only when there is something to do
  if (!t || /^waiting\b/i.test(t)) return null
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// How long the job has sat in its stage: '· 5 d' (since OOC / since the BE / since the SB)
export function stageDays(job, j) {
  const since = j?.phase === 'release' ? j.oocDate
    : j?.phase === 'ooc' ? job?.be_date
      : j?.phase === 'leo' ? job?.ulip_refs?.sb_date : null
  const d = since ? daysAgo(since) : null
  return d === null || d === undefined ? null : d
}

// Saved titles from older checks can still carry system names: plain words on
// screen (no ULIP, ICEGATE, LDB, FASTag; Jose's rule)
export const plain = (s) => String(s || '')
  .replace(/\s*\((?:through|via|from) (?:ULIP|LDB|ICEGATE)\)/gi, '')
  .replace(/\bICEGATE\b/gi, 'Customs').replace(/\bLDB\b/g, 'container tracking')
  .replace(/\bFASTag\b/gi, 'toll').replace(/\bVAHAN\b/gi, 'vehicle papers')
  .replace(/\bSafecube\b/gi, 'ship tracking').replace(/\bULIP\b/g, 'government systems')

// The small stage bar under the status (navy = done, amber = now)
export function StageBar({ steps = [] }) {
  return (
    <span className="ix-stagebar" aria-hidden="true">
      {steps.map((s) => <i key={s.id} className={s.done ? 'done' : s.current ? 'now' : ''} />)}
    </span>
  )
}

// ── pager: the panel walks the list it was opened from ('7 of 12', J / K) ──
// JobsPage publishes its visible order; opened from anywhere else the pager walks
// the open jobs, newest first. `cur` lets the list highlight the job on screen.
const pager = { ids: null, cur: null, subs: new Set() }
export function setPagerList(ids) { pager.ids = ids }
export function subscribePager(fn) { pager.subs.add(fn); return () => { pager.subs.delete(fn) } }
const tell = () => pager.subs.forEach((fn) => fn(pager.cur))
export const usePagerCurrent = () => useSyncExternalStore(subscribePager, () => pager.cur)

// ── containers of one job, from the shared helpers (same as the Containers page) ──
function jobBoxes(job, data) {
  return [...new Set(parseContainerNos(job?.containers))].map((no) => {
    const t = data?.containersByNo?.[no] || null
    const where = containerWhere(t, job)
    const trip = t ? containerTrip(t, job) : null
    const ft = t ? freeTimeFor(job, t) : null
    const moved = t ? daysSinceLastMove(t) : null
    const ms = t ? tripMilestones(t, job) : []
    return {
      no, size: boxSize(job, no, data), tracked: !!t, raw: t,
      where: where.code, whereText: where.label, whereSince: where.since,
      leftAt: trip?.exitAt || null, leftFrom: trip?.exitFrom || null,
      freeLeft: ft ? ft.left : null, freeTill: ft?.till || null,
      finishedOn: t ? containerFinishedOn(t, job) : null,
      stale: moved !== null && moved > STALE_AFTER_DAYS,
      milestones: ms, lastEvent: ms.at(-1) || null,
    }
  })
}
// at port / CFS = teal (calm), moving = navy, finished = green, no tracking = hollow
const WHERE_TONE = { not_arrived: 'blue', port: 'teal', to_cfs: 'blue', cfs: 'teal', out: 'blue', road: 'blue', rail: 'blue', collected: 'green', empty_back: 'green' }
const WhereStatus = ({ b }) => (b.where === 'unknown'
  ? <span className="ix-st hollow">No tracking yet</span>
  : <Status tone={WHERE_TONE[b.where] || 'grey'}>{b.where === 'out' ? `Left ${b.leftFrom || 'CFS'}` : b.whereText}</Status>)

// ── timeline sources in plain words ──
const SRC = { customs: ['Customs', 'building-bank'], port: ['Port', 'anchor'], toll: ['Toll', 'road'], staff: ['Staff', 'user'], whatsapp: ['WhatsApp', 'brand-whatsapp'] }
function sourceOf(r) {
  const s = `${r.type || ''} ${r.action || ''}`.toLowerCase()
  if (/whatsapp|wa_|\bbot\b/.test(s)) return 'whatsapp'
  if (/ooc|be_|sb_|leo|icegate|customs|igm/.test(s)) return 'customs'
  if (/truck|fastag|toll|vahan/.test(s)) return 'toll'
  if (/container|ldb|port|cfs|vessel|ship|sea_/.test(s)) return 'port'
  return 'staff'
}
const BAD = /alert|problem|error|fail|query|detention/i
const ROAD = /^On (road|rail)/

const paperName = (t, job) => (t === 'BL' && job?.mode === 'Air' ? 'AWB' : t === 'Packing List' ? 'Packing list' : t === 'E-Way Bill' ? 'E-way bill' : t)

// RMS / assessment as saved on the job (pending = nothing to say yet)
const RMS = { rms: 'RMS facilitated', hold: 'On hold', check: 'Check' }
const rmsText = (v) => (!v || String(v).toLowerCase() === 'pending' ? null : RMS[String(v).toLowerCase()] || String(v).toUpperCase())

const freeWord = (left) => (left === null || left === undefined ? null : left < 0 ? `${-left} d over` : left === 0 ? 'last day today' : `${left} d left`)
const nextDay = (ymd) => { const d = new Date(`${ymd}T00:00:00Z`); return isNaN(d) ? null : new Date(d.getTime() + 864e5).toISOString().slice(0, 10) }
const typing = (e) => { const t = e.target; return !!t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) }
const isPhone = () => !!window.matchMedia?.('(max-width: 760px)').matches

// On a phone the step bar swipes sideways: start it at the step before the current one, so
// the current step and its button are on screen (Jose, 1 Nov 2026). The full job page
// (components/JobDetailView.jsx) has the same few lines.
function showCurrentStep(wrap) {
  if (!wrap || wrap.scrollWidth <= wrap.clientWidth) return
  const steps = [...wrap.querySelectorAll('.ix-jp-step')]
  const i = steps.findIndex((el) => el.classList.contains('now'))
  if (i < 0) { if (steps.at(-1)?.classList.contains('done')) wrap.scrollLeft = wrap.scrollWidth; return }
  const el = steps[Math.max(0, i - 1)]
  wrap.scrollLeft = Math.max(0, el.getBoundingClientRect().left - wrap.getBoundingClientRect().left + wrap.scrollLeft - 12)
}

// The side panel that opens when a job is clicked, as an object page: who and
// what, one next step, the facts once, where every container is, papers, ship,
// timeline and notes. Editing and government checks stay on the full job page and
// on the BE & OOC / Trucks pages (button press only).
// One Upload button with the paper types in a menu (Jose, 31 Oct 2026: instead of a
// placeholder per paper). Only the types this job does not have yet (each once per job,
// "Other" as often as needed). Picking one opens the file picker and uploads in place.
function UploadMenu({ job, docs, userName, showToast, onDone, label = 'Upload' }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const typeRef = useRef(null)
  const fileRef = useRef(null)
  const boxRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc, true) }
  }, [open])
  const types = availableTypes(docs.map((d) => d.doc_type))
  const pick = (t) => { typeRef.current = t; setOpen(false); fileRef.current?.click() }
  const send = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !typeRef.current) return
    setBusy(typeRef.current)
    const r = await uploadJobDocument({ job, file, docType: typeRef.current, userName })
    setBusy(null)
    if (!r.ok) { showToast?.(r.error, 'error'); return }
    showToast?.(`${typeRef.current} uploaded`, 'success')
    if (r.vessel) showToast?.(`Ship name saved from the BL: ${r.vessel}`, 'success')
    onDone?.()
  }
  return (
    <div className="ix-jp-up" ref={boxRef}>
      <Button size="sm" icon={busy ? 'loader-2' : 'upload'} onClick={() => setOpen((v) => !v)} disabled={!!busy} aria-haspopup="menu" aria-expanded={open}>
        {busy ? `Uploading ${busy}…` : label}<Icon name="chevron-down" />
      </Button>
      {open && (
        <div className="ix-menu" role="menu">
          {types.map((t) => (
            <button key={t} type="button" role="menuitem" onClick={() => pick(t)}>
              <Icon name="file-upload" />{t === 'BL' && job.mode === 'Air' ? 'Air waybill (AWB)' : docTypeLabel(t)}
            </button>
          ))}
        </div>
      )}
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden onChange={send} />
    </div>
  )
}

export default function JobDrawer({ jobId, onClose, onOpenFull, onOpenTruck, currentUserName, showToast }) {
  const { byId, data, profiles, patchJob, active, refresh } = useJourney()
  const navigate = useNavigate()
  const [curId, setCurId] = useState(jobId)
  const row = byId[curId]
  const job = row?.job
  const j = row?.j
  const [loaded, setLoaded] = useState({ id: null, log: [], docs: [] })
  const [viewDoc, setViewDoc] = useState(null) // a PDF shown inside the portal
  const [openBox, setOpenBox] = useState(null)
  const [checking, setChecking] = useState(false) // Check OOC running in the panel
  const [warnOpen, setWarnOpen] = useState(null) // phone: the step whose warnings show under the steps
  const stepRef = useRef(null)

  const log = loaded.id === curId ? loaded.log : []
  const docs = loaded.id === curId ? loaded.docs : []
  const [docsTick, setDocsTick] = useState(0)

  useEffect(() => {
    if (!curId) return
    let cancelled = false
    Promise.all([
      supabase.from('activity_log').select('*').eq('job_id', curId).order('created_at', { ascending: false }).limit(80),
      supabase.from('documents').select('*').eq('job_id', curId).order('created_at', { ascending: false }),
    ]).then(([l, d]) => {
      if (!cancelled) setLoaded({ id: curId, log: l.data || [], docs: d.data || [] })
    })
    return () => { cancelled = true }
  }, [curId, docsTick])

  // the list highlights the job the panel shows
  useEffect(() => { pager.cur = curId; tell() }, [curId])
  useEffect(() => () => { pager.cur = null; tell() }, [])

  // the list the pager walks
  const pagerIds = useMemo(() => {
    if (pager.ids?.includes(curId)) return pager.ids
    return [...active].sort((a, b) => jobNum(b.job) - jobNum(a.job)).map((r) => r.job.id)
  }, [active, curId])
  const at = pagerIds.indexOf(curId)
  const go = (delta) => {
    const id = pagerIds[at + delta]
    if (at < 0 || !id) return
    rememberJob(id)
    setCurId(id)
    setViewDoc(null); setOpenBox(null); setWarnOpen(false)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { if (viewDoc) setViewDoc(null); else onClose(); return }
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || viewDoc) return
      if (e.key === 'j' || e.key === 'J') { e.preventDefault(); go(1) }
      else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); go(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const boxes = useMemo(() => (job ? jobBoxes(job, data) : []), [job, data])
  const nowStep = j?.steps?.findIndex((s) => s.current)
  useEffect(() => { showCurrentStep(stepRef.current) }, [curId, nowStep])

  if (!job) return null

  const isExport = job.job_type === 'export'
  const isAir = /air/i.test(job.mode || '')
  const delivered = j.phase === 'delivered'
  const sea = isExport || isAir ? null : seaOf(job, data)
  const ownerName = jobOwnerName(job, profiles)
  const level = worst(j)
  const line = displayLine(job.shipping_line)
  const lineMismatch = (j.mismatches || []).find((m) => m.field === 'Shipping line')

  // Save one choice into the job's field_meta (onward_mode, delivery_by)
  const setMeta = async (key, value, done) => {
    const field_meta = { ...(job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : {}), [key]: value }
    const { data: saved, error } = await supabase.from('jobs').update({ field_meta, updated_at: new Date().toISOString() }).eq('id', job.id).select().single()
    if (error) { showToast?.(`Could not save: ${error.message}`, 'error'); return }
    patchJob(saved)
    showToast?.(done, 'success')
  }

  // Check OOC right here (Jose, 1 Nov 2026: no jump to the BE & OOC page): the same
  // customs check as that page's button, and a pop-up with what Customs said
  const checkOoc = async () => {
    if (checking) return
    setChecking(true)
    const { data: res, error: fnErr } = await supabase.functions.invoke('customs-status', { body: { jobId: job.id } })
    setChecking(false)
    if (fnErr || !res?.success) {
      let msg = res?.error
      if (!msg && fnErr?.context?.json) { try { msg = (await fnErr.context.json())?.error } catch { /* no body */ } }
      showToast?.(`OOC not updated: ${plain(msg || fnErr?.message || 'the customs check failed')}`, 'error')
      return
    }
    const r = res.data || {}
    if (r.ooc_date) {
      showToast?.(`OOC updated: granted ${fmtDate(r.ooc_date)}${r.ooc_no ? ` · OOC ${r.ooc_no}` : ''}`, 'success')
      refresh?.()
      return
    }
    const when = res.cached ? ' (checked a few minutes ago)' : ''
    const said = r.icegate_status === 'not_found' ? 'Customs has no record of this BE yet'
      : r.icegate_status === 'error' ? `Customs did not answer${r.icegate_error ? `: ${plain(r.icegate_error)}` : ''}`
        : 'Customs has not given OOC yet'
    showToast?.(`OOC not updated: ${said}${when}`, 'info')
    refresh?.()
  }
  const goPage = (tabName) => { onClose(); navigate(`/admin?tab=${tabName}&job=${job.id}`) }

  // ── the one primary action: the next step (Jose, 31 Oct 2026: no second copy in the alerts) ──
  let cta = null
  let alt = null
  if (!isExport && j.readyForTruck) {
    cta = { key: 'truck', step: 'truck', label: 'Assign truck', icon: 'truck', run: () => onOpenTruck(job.id) }
    if (!j.onwardMode) alt = { label: 'Goes by rail', icon: 'train', run: () => setMeta('onward_mode', 'rail', 'Saved: goes by rail') }
  } else if (!isExport && j.phase === 'ooc') cta = { key: 'customs', step: 'ooc', label: 'Check OOC', icon: 'file-certificate', run: () => checkOoc() }
  else if (!isExport && (j.phase === 'docs' || j.phase === 'arrival') && !job.be_no) cta = { key: 'customs', step: 'be', label: 'Record BE no', icon: 'file-plus', run: () => onOpenFull(job.id, 'customs') }
  else if (isExport && !j.sbNo) cta = { key: 'export', step: 'sb', label: 'Record SB no', icon: 'file-plus', run: () => onOpenFull(job.id, isAir ? 'air' : 'export') }
  else if (!isExport && j.phase === 'truck' && !j.truck && j.onwardMode !== 'rail' && deliveryBy(job) === 'jds') cta = { key: 'truck', step: 'truck', label: 'Add truck number', icon: 'truck', run: () => onOpenTruck(job.id), onDone: true }
  // left the port by road with no truck number yet: the button sits under Truck / rail even
  // though that step is done, instead of a "Left port … add the truck number" banner that
  // repeats the step bar (Jose, 31 Oct 2026)
  const askTruck = !isExport && j.attention.some((a) => a.action === 'truck' && /add the truck number/.test(a.text))
  if (!cta && askTruck) cta = { key: 'truck', step: 'truck', label: 'Add truck number', icon: 'truck', run: () => onOpenTruck(job.id), onDone: true }

  // where the BE is now, after filing: the Customs stage card (one tap)
  const showBeStage = !isExport && j.beFiled && !j.oocDone && !delivered
  // ── alerts: a small mark next to the step they are about (red !, amber triangle, blue i),
  // the words on hover, no banners (Jose, 1 Nov 2026: "no separate row"). A phone has no
  // hover: a tap shows them in a line under the steps instead of leaving the panel ──
  const stepIds = j.steps.map((s) => s.id)
  const stepPick = (...ids) => ids.find((id) => stepIds.includes(id))
  const curStepId = (j.steps.find((s) => s.current) || j.steps[j.steps.length - 1])?.id
  const stepOf = (a) => (a.action === 'truck' ? stepPick('truck')
    : a.action === 'containers' ? stepPick('out', 'egm', 'truck')
      : a.action === 'customs' ? stepPick(j.beFiled ? 'ooc' : 'be', 'ooc', 'leo', 'sb')
        : null) || curStepId
  const alerts = j.attention
    // (an alert that only restates the current step — "BE filed 9 days ago, OOC not yet",
    // "OOC done, arrange truck" — is left out: the step bar shows it; Jose, 31 Oct 2026)
    .filter((a) => !(a.action === 'truck' && /^OOC done/.test(a.text)))
    .filter((a) => !(a.action === 'customs' && /^BE filed \d+ days? ago/.test(a.text)))
    .filter((a) => !(a.action === 'truck' && /add the truck number/.test(a.text)))
    // while the Customs stage card is shown, it already says where the BE is ("BE assessed —
    // pay the duty", "Customs query raised" …): no second copy as an alert (Jose, 31 Oct 2026)
    .filter((a) => !(showBeStage && a.action === 'customs'))
    .map((a) => {
      const m = (j.mismatches || []).find((x) => a.text.startsWith(`Check the ${x.field.toLowerCase()}`))
      let title = a.text
      let sub = null
      const papers = a.text.match(/^Truck (\S+) papers problem: (.*)$/)
      // ("Truck MH06… papers problem: MH06…: road tax expired" said the plate twice)
      if (papers) title = `Truck ${papers[1]} papers problem: ${papers[2].replace(`${papers[1]}: `, '')}`
      else if (m) { title = `Check the ${m.field.toLowerCase()}`; sub = `The job says ${m.job}, container tracking says ${m.tracking}. Correct it on the full job page if the job is wrong.` }
      else if (a.text.includes(' — ')) [title, sub] = [a.text.split(' — ')[0], a.text.split(' — ').slice(1).join(' — ')]
      if (a.action === 'containers' && j.freeTill && /free|detention/i.test(a.text)) {
        const box = j.freeBox && boxes.length > 1 ? ` on ${j.freeBox}` : ''
        sub = `${sub ? `${sub}. ` : ''}Free time ${j.freeDaysLeft < 0 ? 'ended' : 'ends'} ${fmtDate(j.freeTill)}${box}.`
      }
      let act = null
      if (a.action === 'containers' && boxes.length && !isExport) act = { label: 'Open on Containers', run: () => goPage('containers') }
      else if (a.action === 'truck') act = { key: 'truck', label: 'Open on Trucks', run: () => onOpenTruck(job.id) }
      else if (a.action === 'customs') act = { key: 'customs', label: 'Open BE & OOC', run: () => onOpenFull(job.id, 'customs') }
      else if (a.action === 'details') act = { label: 'Open full job', run: () => onOpenFull(job.id, 'details') }
      title = plain(title)
      return { level: a.level, step: stepOf(a), text: sub ? `${title}${/[.!?]$/.test(title) ? '' : '.'} ${plain(sub)}` : title, act }
    })
  // free till: a ! on Container out with the date on hover (Jose, 1 Nov 2026), coloured by
  // how close it is; not added when a free-time alert there already says it
  const outStep = stepPick('out', 'truck')
  if (!isExport && !delivered && j.freeTill && outStep && !alerts.some((a) => a.step === outStep && /free|detention/i.test(a.text))) {
    const box = j.freeBox && boxes.length > 1 ? ` (${j.freeBox})` : ''
    const left = j.freeDaysLeft
    alerts.push({
      level: left !== null && left <= 2 ? 'red' : left !== null && left <= 5 ? 'amber' : 'info', icon: 'alert-circle', step: outStep,
      text: `Free till ${fmtDate(j.freeTill)}${box}${left !== null ? ` · ${freeWord(left)}` : ''}`,
      act: boxes.length ? { label: 'Open on Containers', run: () => goPage('containers') } : null,
    })
  }
  const LEVELS = { red: ['alert-circle', 3], amber: ['alert-triangle', 2], info: ['info-circle', 1] }
  const iconOf = (ws, lv) => (ws.every((w) => w.icon) ? ws[0].icon : LEVELS[lv][0])
  const warnsOn = (id) => alerts.filter((a) => a.step === id)
  const worstOf = (ws) => ws.reduce((w, a) => ((LEVELS[a.level]?.[1] || 1) > (LEVELS[w]?.[1] || 1) ? a.level : w), 'info')

  // ── timeline: saved events, this trip's container moves, upcoming dates ──
  const events = []
  for (const r of log) {
    if (r.type === 'note') continue
    const src = sourceOf(r)
    events.push({ at: r.created_at, t: plain(r.title || String(r.type || r.action || '').replace(/_/g, ' ')), src, by: r.done_by_name, bad: BAD.test(`${r.type} ${r.title || ''}`) })
  }
  for (const b of boxes) {
    if (b.milestones.length) {
      for (const m of b.milestones) events.push({ at: m.at, t: m.label, no: b.no, place: m.place, src: ROAD.test(m.label) ? 'toll' : 'port', ctr: true })
    } else if (b.raw) {
      if (b.raw.port_in) events.push({ at: b.raw.port_in, t: 'Arrived at port', no: b.no, src: 'port', ctr: true })
      if (b.raw.cfs_gate_in) events.push({ at: b.raw.cfs_gate_in, t: 'At CFS', no: b.no, src: 'port', ctr: true })
      if (b.raw.port_out) events.push({ at: b.raw.port_out, t: 'Left port', no: b.no, src: 'port', ctr: true })
    }
  }
  if (j.oocDate && !log.some((r) => r.type === 'ooc_granted')) events.push({ at: j.oocDate, t: `OOC granted${j.customs?.ooc_no ? ` (${j.customs.ooc_no})` : ''}`, src: 'customs' })
  if (job.created_at) events.push({ at: job.created_at, t: 'Job created', src: 'staff' })
  const byTime = (a, b) => new Date(b.at) - new Date(a.at)
  events.sort(byTime)
  // (every event shown, nothing folded or cut short: the card scrolls; Jose, 1 Nov 2026)
  const upcoming = []
  if (!delivered && j.freeTill) {
    const box = j.freeBox && boxes.length > 1 ? ` · ${j.freeBox}` : ''
    if (j.freeDaysLeft >= 0) {
      upcoming.push({ t: 'Free time ends', s: `${fmtDate(j.freeTill)}${box}`, red: true })
      upcoming.push({ t: 'Detention starts', s: `${fmtDate(nextDay(j.freeTill))} · if the empty is not back` })
    }
  }
  if (!delivered && !j.arrivedAt && !isExport && (sea?.pod_date || job.eta)) upcoming.push({ t: isAir ? 'Flight due' : 'Ship due', s: sea?.pod_date ? portTime(sea.pod_date, false) : fmtDate(job.eta) })

  const dayHead = (iso) => {
    const d = daysAgo(iso)
    return d === 0 ? `Today · ${fmtDate(iso)}` : d === 1 ? `Yesterday · ${fmtDate(iso)}` : fmtDate(iso)
  }
  // (render functions, not components: they read this render's values)
  const timeline = () => {
    const list = events
    const items = []
    let lastDay = null
    list.forEach((e, i) => {
      const day = fmtDate(e.at)
      if (day !== lastDay) items.push(<div key={`d${i}`} className="day">{dayHead(e.at)}</div>)
      lastDay = day
      const [label, icon] = SRC[e.src] || SRC.staff
      const time = fmtTime(e.at)
      items.push(
        <div key={i} className="ix-jp-ev">
          <span className={`d ${e.bad ? 'bad' : e.src}`} />
          <p>
            {e.no ? <><span className="mono">{e.no}</span> {e.t.toLowerCase()}{e.place ? ` · ${e.place}` : ''}</> : e.t}
            <small><Icon name={icon} />{label}{e.by ? ` · ${e.by}` : ''}{time ? ` · ${time}` : ''}</small>
          </p>
        </div>,
      )
    })
    return (
      <div className="ix-jp-tl">
        {upcoming.length > 0 && (
          <div className="ix-jp-upc">
            <div className="day">Upcoming</div>
            {upcoming.map((u) => (
              <div key={u.t} className="ix-jp-ev"><span className={`d${u.red ? ' red' : ''}`} /><p>{u.t}<small>{u.s}</small></p></div>
            ))}
          </div>
        )}
        {list.length === 0 && <EmptyState line icon="clock" title="No events yet" />}
        {items}
      </div>
    )
  }

  // ── papers: a PDF opens inside the portal ──
  const showDoc = (d) => (/pdf/i.test(d.file_type || d.file_name) ? setViewDoc(d) : openDoc(d))

  // ── facts, once ──
  const facts = []
  if (isExport) {
    facts.push({ k: 'SB', v: j.sbNo, mono: true, small: job.ulip_refs?.sb_date && fmtDate(job.ulip_refs.sb_date) })
    facts.push({ k: 'LEO', v: j.leoDate && fmtDate(j.leoDate) })
    facts.push({ k: 'EGM', v: j.egmNo, mono: true })
  } else {
    // (arrival / ETA, BE and OOC are on the step bar right below; not repeated here. Free
    // till is a mark on Container out, not a box above the steps: Jose, 1 Nov 2026)
  }
  // (boxes go on the line under the job name; a strip with only them looked empty)
  // (no owner can be set anywhere in the portal yet, so no "Assign" link that leads nowhere)
  if (ownerName) facts.push({ k: 'Owner', v: ownerName })

  // ── details, only what the job has ──
  const igm = job.ulip_refs?.igm_no
  // ── the ship (its name appears only in the ship card) and its IMO number ──
  const shipName = !isExport && !isAir ? vesselOf(job, data) : (isExport ? job.vessel : null)
  const imo = shipName && !isExport ? shipIdOf(job, shipName, data).imo : null
  const kv = [
    ['Client', job.client],
    ['Job', [job.mode, isExport ? 'export' : 'import'].filter(Boolean).join(' ') + (job.created_at ? ` · opened ${fmtDate(job.created_at)}` : '')],
    // (the port name already ends with its code, e.g. "JNPT / Nhava Sheva (INNSA1)")
    ['Port', job.port_code ? portLabel?.(job.port_code) || job.port_code : null],
    [isAir ? 'Airline' : 'Shipping line', line ? <>{line}{lineMismatch && <span className="flag"><Icon name="info-circle" /> tracking says {lineMismatch.tracking}</span>}</> : null],
    [isAir ? 'AWB' : 'BL', job.bl_no ? <span className="mono">{job.bl_no}</span> : null],
    // the ship's IMO number (Jose, 1 Nov 2026): typed, from the IGM or found by ship tracking
    ['IMO', !isAir && imo ? <span className="mono">{imo}</span> : null],
    ['IGM', igm ? <><span className="mono">{igm}</span>{job.ulip_refs?.igm_date ? <span className="muted"> · {fmtDate(job.ulip_refs.igm_date)}</span> : null}</> : null],
    ['Assessment', rmsText(job.rms_status)],
    ['CFS', job.cfs_name],
    ['Free days', job.free_days ? `${job.free_days} days from arrival` : null],
    ['Deliver to', job.destination],
    ['Goods', job.goods],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '')
  const trucks = j.trucks || []
  const canTruck = !isExport && j.oocDone && j.onwardMode !== 'rail'

  // ── ship card ──
  // the ship card only while the ship is still on its way: once it has arrived the step
  // bar says so and the ship is of no more interest here (Jose, 31 Oct 2026)
  const shipArrived = !isExport && !!j.steps?.[0]?.done
  const showSeaTrack = !isExport && !isAir && !shipArrived && (sea || (!j.arrivedAt && !boxes.some((b) => b.raw?.port_in) && Number(job.stage || 0) < 7))

  const sd = stageDays(job, j)
  const stageSince = sd === null ? null : j.phase === 'release' ? `· ${sd} d since OOC` : j.phase === 'ooc' ? `· ${sd} d since BE` : `· ${sd} d`

  const boxRows = (b) => {
    const open = openBox === b.no
    const out = [
      <tr key={b.no} onClick={() => setOpenBox(open ? null : b.no)} title="Show this trip’s moves">
        <td className="box">{b.no}{b.stale && <span title="No movement for 30+ days" className="muted"> <Icon name="clock-question" /></span>}</td>
        <td className="sz">{b.size || <Dash />}</td>
        <td className="wh"><WhereStatus b={b} /></td>
        <td className={b.leftAt ? 'lf' : 'lf dim'}>{b.leftAt ? fmtDateTime(b.leftAt) : <Dash />}</td>
        <td className="r"><FreeDays value={b.freeLeft} till={b.freeTill && fmtDate(b.freeTill)} /></td>
      </tr>,
    ]
    if (open) {
      out.push(
        <tr key={`${b.no}-ms`} className="ms"><td colSpan={5}>
          {b.milestones.length ? (
            <ul className="ix-jp-ms">
              {[...b.milestones].reverse().map((m, i) => <li key={i}>{m.label}{m.place ? ` · ${m.place}` : ''} <span>· {fmtDateTime(m.at)}</span></li>)}
            </ul>
          ) : <span className="muted">No moves on this trip yet.</span>}
        </td></tr>,
      )
    }
    return out
  }
  const boxTable = (rows) => (
    <div className="ix-jp-inner">
      {/* (on a phone each container is a small card: jobs.css) */}
      <table className="ix-tbl click ix-jp-boxtbl">
        <thead><tr>
          <th>Container</th><th>Size</th><th>Where now</th>
          <th>Left</th><th className="r">Free till</th>
        </tr></thead>
        <tbody>
          {rows.flatMap((b) => boxRows(b))}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <div className="ix-backdrop" onClick={onClose} />
      <aside className="ix-drawer ix-jp" aria-label={`Job ${job.job_no}`}>
        <div className="ix-jp-top">
          <div className="ix-jp-row1">
            <JobNo no={job.job_no} size="lg" />
            {job.client && <><span className="sep">·</span><span className="cl" title={job.client}>{job.client}</span></>}
            {String(job.priority).toLowerCase() === 'urgent' && <Chip tone="red" icon="flame">Urgent</Chip>}
            <div className="right">
              <span className="vr hide-m" />
              <button type="button" className="ix-icon-btn" onClick={() => onOpenFull(job.id, 'details')} title="Open full job" aria-label="Open full job"><Icon name="external-link" /></button>
              <span className="vr" />
              {at >= 0 && <span className="pg">{at + 1} of {pagerIds.length}</span>}
              <button type="button" className="ix-icon-btn" disabled={at <= 0} onClick={() => go(-1)} title="Previous job (K)" aria-label="Previous job"><Icon name="chevron-up" /></button>
              <button type="button" className="ix-icon-btn" disabled={at < 0 || at >= pagerIds.length - 1} onClick={() => go(1)} title="Next job (J)" aria-label="Next job"><Icon name="chevron-down" /></button>
              <span className="grow" />
              <button type="button" className="ix-icon-btn" onClick={onClose} title="Close (Esc)" aria-label="Close"><Icon name="x" /></button>
            </div>
          </div>
          {/* (no mode / line / port line here: Details below says it once; Jose, 31 Oct 2026) */}

          {facts.some((f) => f.v) && <div className="ix-jp-facts">
            {facts.filter((f) => f.v).map((f) => (
              <div key={f.k} className={`ix-jp-fact${f.tone ? ` ${f.tone}` : ''}`} title={f.title}>
                <div className="k">{f.k}</div>
                <div className={`v${f.mono && f.v ? ' mono' : ''}`}>{f.v || <Dash />}{f.v && f.small ? <small>{f.small}</small> : null}</div>
              </div>
            ))}
          </div>}

          <div className="ix-jp-stepwrap" ref={stepRef}>
            <div className="ix-jp-steps" style={{ gridTemplateColumns: `repeat(${j.steps.length}, minmax(0, 1fr))` }}>
              {j.steps.map((s) => {
                const since = s.current && stageSince ? stageSince.replace(/^·\s*/, '') : null
                const sub = since || (s.sub ? plain(s.sub) : (s.id === 'delivered' && !s.done && !isExport ? (deliveryBy(job) === 'client' ? 'Client collects' : 'JDS delivers') : null))
                const ws = warnsOn(s.id)
                const lv = ws.length ? worstOf(ws) : null
                const toAct = ws.find((w) => w.act)?.act
                const warn = lv && (
                  <button type="button" className={`ix-jp-warn ${lv}${j.steps.indexOf(s) < 2 ? ' l' : ''}${toAct ? '' : ' na'}`} data-tip={ws.map((w) => w.text).join('\n')} aria-label={ws.map((w) => w.text).join(' ')}
                    onClick={() => (isPhone() ? setWarnOpen((v) => (v === s.id ? null : s.id)) : toAct?.run())}>
                    <Icon name={iconOf(ws, lv)} />
                  </button>
                )
                return (
                  <div key={s.id} className={`ix-jp-step ${s.done ? 'done' : s.current ? 'now' : 'todo'}`}>
                    <span className="dot">{s.done && <Icon name="check" />}</span>
                    <b>{s.label}</b>
                    <div className="w">{s.when}{(sub || warn) && <span>{sub}{warn}</span>}</div>
                    {/* the step's own action, only while the step is still to do (e.g. Check OOC
                        until OOC is granted); Add truck number also once the box has left */}
                    {cta && (!s.done || cta.onDone) && (cta.step || (s.current && s.id)) === s.id && (
                      <div className="act">
                        <Button size="sm" variant="primary" urgent={level === 'red' && cta.key === 'truck'} icon={cta.key === 'customs' && checking ? 'loader-2' : cta.icon} disabled={cta.key === 'customs' && checking} onClick={cta.run}>{cta.key === 'customs' && checking ? 'Checking…' : cta.label}</Button>
                        {alt && <Button size="sm" variant="ghost" icon={alt.icon} onClick={alt.run}>{alt.label}</Button>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          {warnOpen && warnsOn(warnOpen).length > 0 && (() => {
            const ws = warnsOn(warnOpen)
            const lv = worstOf(ws)
            const toAct = ws.find((w) => w.act)?.act
            return (
              <div className={`ix-jp-warnline ${lv}`} role="status">
                <div>
                  <Icon name={iconOf(ws, lv)} />
                  <p>{ws.map((w) => <span key={w.text}>{w.text}</span>)}</p>
                  {toAct && <button type="button" className="ix-link" onClick={toAct.run}>{toAct.label}</button>}
                </div>
              </div>
            )
          })()}

        </div>

        <div className="ix-jp-body">
          {/* one page, no tabs: containers, papers and timeline are all here (Jose, 31 Oct 2026) */}
          <>
              {/* where the BE is now, after filing: one tap (Jose, 25 Oct 2026) */}
              {showBeStage && (
                <BeStage job={job} userName={currentUserName} showToast={showToast} />
              )}

              <div className="ix-jp-grid">
                <div>
                  {boxes.length > 0 && (
                    <Section title={<><Icon name="box" />Containers · {boxes.length}</>}>
                      {boxTable(boxes)}
                      <div className="ix-jp-more" />
                    </Section>
                  )}

                  <Section title={<><Icon name="list-details" />Details</>}>
                    <div className="ix-jp-kv">
                      {kv.map(([k, v]) => [<div key={`${k}-k`}>{k}</div>, <div key={`${k}-v`}>{v}</div>])}
                      {(trucks.length > 0 || canTruck) && [
                        <div key="trucks-k">{trucks.length > 1 ? `Trucks · ${trucks.length}` : 'Truck'}</div>,
                        <div key="trucks-v" className="trucks">
                          {trucks.map((t) => (
                            <span key={t.no} title={t.location ? `Last seen ${t.location.plaza}` : 'Not seen at a toll yet'}>
                              <span className="ix-plate">{t.no}</span>
                              {t.container && <span className="mono muted"> {t.container}</span>}
                            </span>
                          ))}
                          {canTruck && <button type="button" className="ix-link" onClick={() => onOpenTruck(job.id)}>{trucks.length ? 'Manage trucks →' : 'Assign on Trucks →'}</button>}
                        </div>,
                      ]}
                    </div>
                  </Section>

                  {/* air imports: is the air waybill in Customs' air manifest yet */}
                  {!isExport && isAir && <Section title={<><Icon name="plane" />Flight</>}><AirCargo key={job.id} job={job} showToast={showToast} /></Section>}

                  {showSeaTrack && (
                    <Section title={<><Icon name="ship" />Ship</>}>
                      <SeaTracking job={job} showToast={showToast} shipName={shipName} imo={imo} onVessels={() => goPage('vessels')} />
                    </Section>
                  )}
                  {!showSeaTrack && shipName && !shipArrived && (
                    <Section title={<><Icon name="ship" />Ship</>}>
                      <div className="ix-jp-ship">
                        <span className={`ic${j.arrivedAt || isExport ? '' : ' sea'}`}><Icon name={j.arrivedAt ? 'anchor' : 'ship'} /></span>
                        <div style={{ minWidth: 0 }}>
                          <b>{isExport ? 'Export vessel' : j.arrivedAt ? `Arrived · ${fmtDate(j.arrivedAt)}` : 'Ship'}</b>
                          <small>{shipName}{imo ? <> · <span className="mono">IMO {imo}</span></> : null}</small>
                        </div>
                        {!isExport && <button type="button" className="ix-link" onClick={() => goPage('vessels')}>Vessels <Icon name="arrow-right" /></button>}
                      </div>
                    </Section>
                  )}

                  {!isExport && (
                    <Section title={<><Icon name="route" />Arrangements</>}>
                      <div className="ix-jp-arr">
                        <div>Move by</div>
                        <div>
                          <Segmented label="Leaves the port or CFS by" value={j.onwardMode || ''} options={[{ value: 'truck', label: 'Truck' }, { value: 'rail', label: 'Rail' }]}
                            onChange={(v) => job.field_meta?.onward_mode !== v && setMeta('onward_mode', v, v === 'rail' ? 'Saved: goes by rail' : 'Saved: goes by truck')} />
                          {!job.field_meta?.onward_mode && j.onwardMode && <small>(from tracking)</small>}
                        </div>
                        <div>Delivery</div>
                        <div>
                          <Segmented label="Delivery to the warehouse" value={deliveryBy(job)} options={[{ value: 'jds', label: 'JDS delivers' }, { value: 'client', label: 'Client collects' }]}
                            onChange={(v) => deliveryBy(job) !== v && setMeta('delivery_by', v, v === 'client' ? 'Saved: the client collects the cargo' : 'Saved: JDS delivers the cargo')} />
                        </div>
                      </div>
                    </Section>
                  )}
                </div>

                <div>
                  <Section title={<><Icon name="files" />Papers</>} right={<UploadMenu job={job} docs={docs} userName={currentUserName} showToast={showToast} onDone={() => setDocsTick((n) => n + 1)} />}>
                    <div className="ix-jp-papers">
                      {docs.length === 0 && <span className="muted">No papers yet</span>}
                      {docs.map((d) => (
                        <button key={d.id} type="button" className="ix-jp-paper" onClick={() => showDoc(d)} title={`${d.file_name} · ${fmtDateTime(d.created_at)}`}>
                          <Icon name="circle-check" />{paperName(d.doc_type || 'Other', job)}
                        </button>
                      ))}
                    </div>
                  </Section>
                  <Section title={<><Icon name="clock" />Timeline</>} right={<span className="muted">IST</span>}>
                    {timeline()}
                  </Section>
                </div>
              </div>
          </>
        </div>

        {/* a PDF, drawn by the portal itself (works on every browser and phone) */}
        {viewDoc && (
          <div className="ix-jp-viewer" role="dialog" aria-label={viewDoc.file_name} onClick={() => setViewDoc(null)}>
            <div onClick={(e) => e.stopPropagation()}>
              <div className="hd">
                <b>{viewDoc.doc_type ? `${viewDoc.doc_type} · ` : ''}{viewDoc.file_name}</b>
                <Button size="sm" icon="download" onClick={() => downloadDoc(viewDoc).catch((e) => showToast?.(`Could not download: ${e.message}`, 'error'))}>Download</Button>
                <Button size="sm" onClick={() => setViewDoc(null)}>Close</Button>
              </div>
              <div className="bd"><PdfPreview doc={viewDoc} /></div>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
