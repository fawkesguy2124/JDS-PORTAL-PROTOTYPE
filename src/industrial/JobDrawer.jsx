/* eslint-disable react-refresh/only-export-components -- the jobs table shares the row helpers and the pager with this panel */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
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
import { Button, Chip, Dash, EmptyState, FreeDays, Icon, JobNo, Section, Segmented, Status, Tabs, fmtDate, fmtDateTime, fmtINR, fmtTime, initials, jobOwnerName, timeAgo, worst } from './ui'
import { vesselOf, shipIdOf } from './ShipMap'
import { openDoc, downloadDoc } from '../services/docFiles'
import PdfPreview from '../components/PdfPreview'
import SeaTracking, { portTime } from './SeaTracking'
import BeStage from './BeStage'
import AirCargo from './AirCargo'
import { rememberJob } from './recentJobs'
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

// The papers a job is expected to have (graft from direction 3, Jose 31 Oct 2026)
const PAPERS_IMPORT = ['BL', 'Invoice', 'Packing List', 'BE', 'OOC', 'E-Way Bill']
const PAPERS_EXPORT = ['Invoice', 'Packing List']
const paperName = (t, job) => (t === 'BL' && job?.mode === 'Air' ? 'AWB' : t === 'Packing List' ? 'Packing list' : t === 'E-Way Bill' ? 'E-way bill' : t)

// RMS / assessment as saved on the job (pending = nothing to say yet)
const RMS = { rms: 'RMS facilitated', hold: 'On hold', check: 'Check' }
const rmsText = (v) => (!v || String(v).toLowerCase() === 'pending' ? null : RMS[String(v).toLowerCase()] || String(v).toUpperCase())
const bgText = (v) => (v === true || /^y/i.test(String(v)) ? 'Needed' : /^100/.test(String(v)) ? 'Needed (100%)' : null)

const freeWord = (left) => (left === null || left === undefined ? null : left < 0 ? `${-left} d over` : left === 0 ? 'last day today' : `${left} d left`)
const nextDay = (ymd) => { const d = new Date(`${ymd}T00:00:00Z`); return isNaN(d) ? null : new Date(d.getTime() + 864e5).toISOString().slice(0, 10) }
const typing = (e) => { const t = e.target; return !!t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) }

// The side panel that opens when a job is clicked, as an object page: who and
// what, one next step, the facts once, where every container is, papers, ship,
// timeline and notes. Editing and government checks stay on the full job page and
// on the BE & OOC / Trucks pages (button press only).
export default function JobDrawer({ jobId, initialTab = 'overview', onClose, onOpenFull, onOpenTruck, currentUserName, showToast }) {
  const { byId, data, profiles, patchJob, active } = useJourney()
  const navigate = useNavigate()
  const [curId, setCurId] = useState(jobId)
  const row = byId[curId]
  const job = row?.job
  const j = row?.j
  const [tab, setTab] = useState(initialTab)
  const [loaded, setLoaded] = useState({ id: null, log: [], docs: [] })
  const [viewDoc, setViewDoc] = useState(null) // a PDF shown inside the portal
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [ctrFilter, setCtrFilter] = useState('all')
  const [ctrQ, setCtrQ] = useState('')
  const [openBox, setOpenBox] = useState(null)

  const log = loaded.id === curId ? loaded.log : []
  const docs = loaded.id === curId ? loaded.docs : []

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
  }, [curId])

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
    setNote(''); setViewDoc(null); setOpenBox(null); setCtrFilter('all'); setCtrQ('')
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

  if (!job) return null

  const isExport = job.job_type === 'export'
  const isAir = /air/i.test(job.mode || '')
  const delivered = j.phase === 'delivered'
  const sea = isExport || isAir ? null : seaOf(job, data)
  const notes = log.filter((r) => r.type === 'note')
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

  const addNote = async () => {
    const text = note.trim()
    if (!text) return
    setSaving(true)
    const { data: inserted, error } = await supabase.from('activity_log').insert({
      type: 'note', action: 'note', title: text.length > 80 ? `${text.slice(0, 77)}…` : text, note: text,
      job_id: job.id, job_no: job.job_no, done_by_name: currentUserName || null,
      meta: { job_id: job.id, job_no: job.job_no },
    }).select()
    setSaving(false)
    if (error) { showToast?.(`Could not save the note: ${error.message}`, 'error'); return }
    setLoaded((s) => (s.id === job.id ? { ...s, log: [...(inserted || []), ...s.log] } : s))
    setNote('')
  }

  const copyLink = async () => {
    const url = `${window.location.origin}/admin?tab=jobs&open=${job.id}`
    try {
      await navigator.clipboard.writeText(url)
      showToast?.(`Link to ${job.job_no} copied`, 'success')
    } catch {
      window.prompt('Copy this link', url)
    }
  }
  const goPage = (tabName) => { onClose(); navigate(`/admin?tab=${tabName}&job=${job.id}`) }

  // ── the one primary action: the next step (Jose, 31 Oct 2026: no second copy in the alerts) ──
  let cta = null
  let alt = null
  if (!isExport && j.readyForTruck) {
    cta = { key: 'truck', label: 'Assign truck', icon: 'truck', run: () => onOpenTruck(job.id) }
    if (!j.onwardMode) alt = { label: 'Goes by rail', icon: 'train', run: () => setMeta('onward_mode', 'rail', 'Saved: goes by rail') }
  } else if (!isExport && j.phase === 'ooc') cta = { key: 'customs', label: 'Check OOC', icon: 'file-certificate', run: () => onOpenFull(job.id, 'customs') }
  else if (!isExport && (j.phase === 'docs' || j.phase === 'arrival') && !job.be_no) cta = { key: 'customs', label: 'Record BE no', icon: 'file-plus', run: () => onOpenFull(job.id, 'customs') }
  else if (isExport && !j.sbNo) cta = { key: 'export', label: 'Record SB no', icon: 'file-plus', run: () => onOpenFull(job.id, isAir ? 'air' : 'export') }
  else if (!isExport && j.phase === 'truck' && !j.truck && j.onwardMode !== 'rail' && deliveryBy(job) === 'jds') cta = { key: 'truck', label: 'Add truck number', icon: 'truck', run: () => onOpenTruck(job.id) }

  // ── alerts, each with its own action (never the same as the primary one) ──
  const alerts = j.attention
    // (an alert that only restates the current step — "BE filed 9 days ago, OOC not yet",
    // "OOC done, arrange truck" — is left out: the step bar shows it; Jose, 31 Oct 2026)
    .filter((a) => !(a.action === 'truck' && /^OOC done/.test(a.text)))
    .filter((a) => !(a.action === 'customs' && /^BE filed \d+ days? ago/.test(a.text)))
    .map((a) => {
      const m = (j.mismatches || []).find((x) => a.text.startsWith(`Check the ${x.field.toLowerCase()}`))
      let title = a.text
      let sub = null
      if (m) { title = `Check the ${m.field.toLowerCase()}`; sub = `The job says ${m.job}, container tracking says ${m.tracking}. Correct it on the full job page if the job is wrong.` }
      else if (a.text.includes(' — ')) [title, sub] = [a.text.split(' — ')[0], a.text.split(' — ').slice(1).join(' — ')]
      if (a.action === 'containers' && j.freeTill && /free|detention/i.test(a.text)) {
        const box = j.freeBox && boxes.length > 1 ? ` on ${j.freeBox}` : ''
        sub = `${sub ? `${sub}. ` : ''}Free time ${j.freeDaysLeft < 0 ? 'ended' : 'ends'} ${fmtDate(j.freeTill)}${box}.`
      }
      let act = null
      if (a.action === 'containers' && boxes.length) act = { label: 'See containers', run: () => setTab('containers') }
      else if (a.action === 'truck') act = { key: 'truck', label: 'Open on Trucks', run: () => onOpenTruck(job.id) }
      else if (a.action === 'customs') act = { key: 'customs', label: 'Open BE & OOC', run: () => onOpenFull(job.id, 'customs') }
      else if (a.action === 'details') act = { label: 'Open full job', run: () => onOpenFull(job.id, 'details') }
      if (act?.key && act.key === cta?.key) act = null
      return { level: a.level, title: plain(title), sub: sub && plain(sub), act }
    })

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
  // many containers: fold their moves into one line that opens the Containers tab
  let shownEvents = events
  const ctrEvents = events.filter((e) => e.ctr)
  if (boxes.length > 3 && ctrEvents.length) {
    shownEvents = [...events.filter((e) => !e.ctr), { at: ctrEvents[0].at, t: `${ctrEvents.length} container updates`, src: 'port', fold: true }].sort(byTime)
  }
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
  const timeline = (limit) => {
    const list = limit ? shownEvents.slice(0, limit) : shownEvents
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
            {e.fold ? <button type="button" className="ix-link" onClick={() => setTab('containers')}>{e.t} · see Containers</button>
              : e.no ? <><span className="mono">{e.no}</span> {e.t.toLowerCase()}{e.place ? ` · ${e.place}` : ''}</> : e.t}
            <small><Icon name={icon} />{label}{e.by ? ` · ${e.by}` : ''}{time ? ` · ${time}` : ''}</small>
          </p>
        </div>,
      )
    })
    return (
      <div className="ix-jp-tl">
        {upcoming.length > 0 && (
          <div className="ix-jp-up">
            <div className="day">Upcoming</div>
            {upcoming.map((u) => (
              <div key={u.t} className="ix-jp-ev"><span className={`d${u.red ? ' red' : ''}`} /><p>{u.t}<small>{u.s}</small></p></div>
            ))}
          </div>
        )}
        {list.length === 0 && <EmptyState line icon="clock" title="No events yet" />}
        {items}
        {limit && shownEvents.length > limit ? <button type="button" className="ix-link" style={{ margin: '4px 0 0' }} onClick={() => setTab('timeline')}>See the full timeline →</button> : null}
      </div>
    )
  }

  // ── papers checklist from the job's documents ──
  const paperTypes = isExport ? PAPERS_EXPORT : PAPERS_IMPORT
  const docOf = (t) => docs.find((d) => d.doc_type === t)
  const showDoc = (d) => (/pdf/i.test(d.file_type || d.file_name) ? setViewDoc(d) : openDoc(d))
  const upload = () => onOpenFull(job.id, 'documents')

  // ── facts, once ──
  const facts = []
  if (isExport) {
    facts.push({ k: 'SB', v: j.sbNo, mono: true, small: job.ulip_refs?.sb_date && fmtDate(job.ulip_refs.sb_date) })
    facts.push({ k: 'LEO', v: j.leoDate && fmtDate(j.leoDate) })
    facts.push({ k: 'EGM', v: j.egmNo, mono: true })
  } else {
    // (arrival / ETA, BE and OOC are on the step bar right below; not repeated here)
    facts.push({
      k: 'Free till', v: j.freeTill && fmtDate(j.freeTill), small: freeWord(j.freeDaysLeft),
      tone: j.freeDaysLeft !== null && j.freeDaysLeft <= 2 ? 'red' : undefined,
      title: j.freeBox ? `Runs out first: ${j.freeBox}` : undefined,
    })
  }
  // (boxes go on the line under the job name; a strip with only them looked empty)
  // (no owner can be set anywhere in the portal yet, so no "Assign" link that leads nowhere)
  if (ownerName) facts.push({ k: 'Owner', v: ownerName })

  // ── details, only what the job has ──
  const igm = job.ulip_refs?.igm_no
  const kv = [
    ['Client', job.client],
    // (the port name already ends with its code, e.g. "JNPT / Nhava Sheva (INNSA1)")
    ['Port', job.port_code ? portLabel?.(job.port_code) || job.port_code : null],
    [isAir ? 'Airline' : 'Shipping line', line ? <>{line}{lineMismatch && <span className="flag"><Icon name="info-circle" /> tracking says {lineMismatch.tracking}</span>}</> : null],
    [isAir ? 'AWB' : 'BL', job.bl_no ? <span className="mono">{job.bl_no}</span> : null],
    ['IGM', igm ? <><span className="mono">{igm}</span>{job.ulip_refs?.igm_date ? <span className="muted"> · {fmtDate(job.ulip_refs.igm_date)}</span> : null}</> : null],
    ['Assessment', rmsText(job.rms_status)],
    ['CFS', job.cfs_name],
    ['Free days', job.free_days ? `${job.free_days} days from arrival` : null],
    ['Deliver to', job.destination],
    ['Goods', job.goods],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '')
  const trucks = j.trucks || []
  const canTruck = !isExport && j.oocDone && j.onwardMode !== 'rail'

  // ── ship card (the ship's name and IMO appear only here) ──
  const shipName = !isExport && !isAir ? vesselOf(job, data) : (isExport ? job.vessel : null)
  const imo = shipName && !isExport ? shipIdOf(job, shipName, data).imo : null
  const showSeaTrack = !isExport && !isAir && (sea || (!j.arrivedAt && !boxes.some((b) => b.raw?.port_in) && Number(job.stage || 0) < 7))

  const tabs = [
    { id: 'overview', label: 'Overview' },
    ...(boxes.length ? [{ id: 'containers', label: 'Containers', count: boxes.length }] : []),
    { id: 'docs', label: 'Documents', count: docs.length || undefined },
    { id: 'timeline', label: 'Timeline', count: shownEvents.length || undefined },
    { id: 'payments', label: 'Payments' },
    { id: 'notes', label: 'Notes', count: notes.length || undefined },
  ]
  const shown = tabs.some((t) => t.id === tab) ? tab : 'overview'
  const sd = stageDays(job, j)
  const stageSince = sd === null ? null : j.phase === 'release' ? `· ${sd} d since OOC` : j.phase === 'ooc' ? `· ${sd} d since BE` : `· ${sd} d`

  // containers tab groups
  const groups = [
    ['all', 'All', () => true],
    ['port', 'At port / CFS', (b) => ['port', 'cfs', 'to_cfs'].includes(b.where)],
    ['out', 'Out', (b) => ['out', 'road', 'rail', 'collected'].includes(b.where)],
    ['risk', 'Free days ≤ 2', (b) => b.freeLeft !== null && b.freeLeft <= 2],
    ['done', 'Finished', (b) => !!b.finishedOn || b.where === 'empty_back'],
  ].filter(([id, , fn]) => id === 'all' || boxes.some(fn))
  const cf = groups.find((g) => g[0] === ctrFilter) || groups[0]
  const ctrRows = boxes.filter(cf[2]).filter((b) => !ctrQ || b.no.includes(ctrQ.trim().toUpperCase()))

  const boxRows = (b, full) => {
    const open = full && openBox === b.no
    const out = [
      <tr key={b.no} onClick={full ? () => setOpenBox(open ? null : b.no) : undefined} title={full ? 'Show this trip’s moves' : undefined}>
        <td className="box">{b.no}{b.stale && <span title="No movement for 30+ days" className="muted"> <Icon name="clock-question" /></span>}</td>
        <td>{b.size || <Dash />}</td>
        <td><WhereStatus b={b} /></td>
        {full && <td className="dim">{b.whereSince ? fmtDateTime(b.whereSince) : <Dash />}</td>}
        <td className={b.leftAt ? '' : 'dim'}>{b.leftAt ? fmtDateTime(b.leftAt) : <Dash />}</td>
        <td className="r"><FreeDays value={b.freeLeft} till={b.freeTill && fmtDate(b.freeTill)} /></td>
      </tr>,
    ]
    if (open) {
      out.push(
        <tr key={`${b.no}-ms`} className="ms"><td colSpan={6}>
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
  const boxTable = (rows, full) => (
    <div className="ix-jp-inner">
      <table className={`ix-tbl${full ? ' click' : ''}`}>
        <thead><tr>
          <th>Container</th><th>Size</th><th>Where now</th>
          {full && <th>Since</th>}
          <th>Left</th><th className="r">Free till</th>
        </tr></thead>
        <tbody>
          {rows.flatMap((b) => boxRows(b, full))}
          {rows.length === 0 && <tr><td colSpan={full ? 6 : 5} className="dim">No containers match</td></tr>}
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
              {cta && <Button variant="primary" urgent={level === 'red' && cta.key === 'truck'} icon={cta.icon} onClick={cta.run}>{cta.label}</Button>}
              {alt && <Button icon={alt.icon} onClick={alt.run}>{alt.label}</Button>}
              <Button icon="upload" onClick={upload}>Upload</Button>
              <span className="vr hide-m" />
              <button type="button" className="ix-icon-btn" onClick={copyLink} title="Copy link to this job" aria-label="Copy link to this job"><Icon name="link" /></button>
              <button type="button" className="ix-icon-btn" onClick={() => onOpenFull(job.id, 'details')} title="Open full job" aria-label="Open full job"><Icon name="external-link" /></button>
              <span className="vr" />
              {at >= 0 && <span className="pg">{at + 1} of {pagerIds.length}</span>}
              <button type="button" className="ix-icon-btn" disabled={at <= 0} onClick={() => go(-1)} title="Previous job (K)" aria-label="Previous job"><Icon name="chevron-up" /></button>
              <button type="button" className="ix-icon-btn" disabled={at < 0 || at >= pagerIds.length - 1} onClick={() => go(1)} title="Next job (J)" aria-label="Next job"><Icon name="chevron-down" /></button>
              <span className="grow" />
              <button type="button" className="ix-icon-btn" onClick={onClose} title="Close (Esc)" aria-label="Close"><Icon name="x" /></button>
            </div>
          </div>
          <div className="ix-jp-meta">
            {job.mode && <Chip>{job.mode}</Chip>}
            {boxesText(job, data) && boxesText(job, data) !== job.mode?.replace(/^Sea\s+/i, '') && <Chip>{boxesText(job, data)}</Chip>}
            <Chip>{isExport ? 'Export' : 'Import'}</Chip>
            {line && <span>{line}</span>}
            {job.port_code && <><span className="sep">·</span><span>{portLabel?.(job.port_code) || job.port_code}</span></>}
            {job.created_at && <><span className="sep">·</span><span title={fmtDateTime(job.created_at)}>Opened {fmtDate(job.created_at)}</span></>}
          </div>

          {facts.some((f) => f.v) && <div className="ix-jp-facts">
            {facts.filter((f) => f.v).map((f) => (
              <div key={f.k} className={`ix-jp-fact${f.tone ? ` ${f.tone}` : ''}`} title={f.title}>
                <div className="k">{f.k}</div>
                <div className={`v${f.mono && f.v ? ' mono' : ''}`}>{f.v || <Dash />}{f.v && f.small ? <small>{f.small}</small> : null}</div>
              </div>
            ))}
          </div>}

          <div className="ix-jp-stepwrap">
            <div className="ix-jp-steps" style={{ gridTemplateColumns: `repeat(${j.steps.length}, minmax(0, 1fr))` }}>
              {j.steps.map((s) => {
                const since = s.current && stageSince ? stageSince.replace(/^·\s*/, '') : null
                const sub = since || (s.sub ? plain(s.sub) : (s.id === 'delivered' && !s.done && !isExport ? (deliveryBy(job) === 'client' ? 'Client collects' : 'JDS delivers') : null))
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

          <Tabs className="ix-jp-tabs" value={shown} onChange={setTab} tabs={tabs} />
        </div>

        <div className="ix-jp-body">
          {shown === 'overview' && (
            <>
              {alerts.length > 0 && (
                <div className="ix-jp-alerts">
                  {alerts.map((a, i) => (
                    <div key={i} className={`ix-jp-al ${a.level}`}>
                      <Icon name={a.level === 'red' ? 'alert-octagon' : a.level === 'amber' ? 'alert-triangle' : 'info-circle'} />
                      <p><b>{a.title}</b>{a.sub && <small>{a.sub}</small>}</p>
                      <div>{a.act && <Button size="sm" variant="ghost" onClick={a.act.run}>{a.act.label}</Button>}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* where the BE is now, after filing: one tap (Jose, 25 Oct 2026) */}
              {!isExport && j.beFiled && !j.oocDone && !delivered && (
                <BeStage job={job} userName={currentUserName} showToast={showToast} />
              )}

              <div className="ix-jp-grid">
                <div>
                  {boxes.length > 0 && (
                    <Section title={`Containers · ${boxes.length}`} right={!isExport && !delivered ? <button type="button" className="ix-link" onClick={() => goPage('containers')}>Open on Containers <Icon name="arrow-right" /></button> : null}>
                      {boxTable(boxes.slice(0, 5), false)}
                      {boxes.length > 5
                        ? <div className="ix-jp-more">Showing 5 of {boxes.length} · <button type="button" className="ix-link" onClick={() => setTab('containers')}>See all</button></div>
                        : <div className="ix-jp-more" />}
                    </Section>
                  )}

                  <Section title="Details">
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
                  {!isExport && isAir && <Section title="Flight"><AirCargo key={job.id} job={job} showToast={showToast} /></Section>}

                  {showSeaTrack && (
                    <Section title="Ship">
                      <SeaTracking job={job} showToast={showToast} shipName={shipName} imo={imo} onVessels={() => goPage('vessels')} />
                    </Section>
                  )}
                  {!showSeaTrack && shipName && (
                    <Section title="Ship">
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
                    <Section title="Arrangements">
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
                  <Section title="Papers" right={<button type="button" className="ix-link" onClick={() => setTab('docs')}>Documents</button>}>
                    <div className="ix-jp-papers">
                      {paperTypes.map((t) => {
                        const d = docOf(t)
                        return d
                          ? <button key={t} type="button" className="ix-jp-paper" onClick={() => showDoc(d)} title={`${d.file_name} · ${fmtDateTime(d.created_at)}`}><Icon name="circle-check" />{paperName(t, job)}</button>
                          : <button key={t} type="button" className="ix-jp-paper miss" onClick={upload} title={`No ${paperName(t, job)} yet: upload it on the full job page`}><Icon name="upload" />{paperName(t, job)}</button>
                      })}
                    </div>
                  </Section>
                  <Section title="Timeline" right={<span className="muted">IST</span>}>
                    {timeline(6)}
                  </Section>
                </div>
              </div>
            </>
          )}

          {shown === 'containers' && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <Segmented label="Show containers" value={cf[0]} onChange={setCtrFilter}
                  options={groups.map(([id, l, fn]) => ({ value: id, label: `${l} ${boxes.filter(fn).length}` }))} />
                {boxes.length > 6 && (
                  <label className="ix-tsearch" style={{ width: 200 }}>
                    <Icon name="search" />
                    <input value={ctrQ} onChange={(e) => setCtrQ(e.target.value)} placeholder="Find a container" aria-label="Find a container" />
                  </label>
                )}
              </div>
              {boxTable(ctrRows, true)}
              <div className="ix-jp-more">
                Click a container to see this trip’s moves · trucks are assigned on the Trucks page
                {!isExport && !delivered && <> · <button type="button" className="ix-link" onClick={() => goPage('containers')}>Open on Containers</button></>}
              </div>
            </>
          )}

          {shown === 'timeline' && timeline()}

          {shown === 'docs' && (
            <div className="ix-jp-docs">
              <Section title="Papers" right={<Button size="sm" icon="upload" onClick={upload}>Upload</Button>}>
                <div className="ix-jp-inner">
                  <table className="ix-tbl">
                    <thead><tr><th>Paper</th><th>File</th><th>Uploaded</th><th /></tr></thead>
                    <tbody>
                      {paperTypes.map((t) => {
                        const d = docOf(t)
                        return (
                          <tr key={t}>
                            <td className={d ? 'ok' : 'dim'}><Icon name={d ? 'circle-check' : 'circle-dashed'} /> {paperName(t, job)}</td>
                            <td className="cl" title={d?.file_name || ''}>{d ? d.file_name : <Dash />}</td>
                            <td className="dim" title={d ? timeAgo(d.created_at) : undefined}>{d ? `${fmtDateTime(d.created_at)}${d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}` : <Dash />}</td>
                            <td className="r">{d
                              ? ((d.file_path || d.file_url) && <Button size="sm" variant="ghost" onClick={() => showDoc(d)}>View</Button>)
                              : <Button size="sm" variant="ghost" icon="upload" onClick={upload}>Upload</Button>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
              {(() => {
                const others = docs.filter((d) => !paperTypes.includes(d.doc_type) || docOf(d.doc_type) !== d)
                if (!others.length) return docs.length ? null : <EmptyState line icon="files" title="No documents uploaded yet." />
                return (
                  <Section title={`Other files · ${others.length}`}>
                    {others.map((d) => (
                      <div key={d.id} className="ix-jp-file">
                        <Icon name={/pdf/i.test(d.file_type || d.file_name) ? 'file-type-pdf' : 'file-text'} />
                        <div style={{ minWidth: 0 }}>
                          <div className="n">{d.doc_type ? `${d.doc_type} · ` : ''}{d.file_name}</div>
                          <div className="s" title={timeAgo(d.created_at)}>{d.uploaded_by_name ? `${d.uploaded_by_name} · ` : ''}{fmtDateTime(d.created_at)}</div>
                        </div>
                        {(d.file_path || d.file_url) && <Button size="sm" variant="ghost" onClick={() => showDoc(d)}>View</Button>}
                      </div>
                    ))}
                  </Section>
                )
              })()}
            </div>
          )}

          {shown === 'payments' && (() => {
            // what the job has today: the CFS amount, the bank guarantee and the duty stage
            const duty = isExport ? null
              : j.oocDone ? 'Paid (OOC given)'
                : j.beStage?.id === 'duty_paid' ? 'Paid'
                  : j.beStage?.id === 'assessed' ? 'Assessed: to pay'
                    : null
            const pay = [
              ['CFS amount', job.cfs_amount !== null && job.cfs_amount !== undefined && job.cfs_amount !== '' ? fmtINR(job.cfs_amount) : null],
              ['Customs duty', duty],
              ['Bank guarantee', bgText(job.bg_required)],
            ].filter(([, v]) => v)
            return (
              <Section title="Payments" right={<button type="button" className="ix-link" onClick={() => onOpenFull(job.id, 'details')}>Edit on the full job page</button>}>
                {pay.length
                  ? <div className="ix-jp-kv">{pay.map(([k, v]) => [<div key={`${k}-k`}>{k}</div>, <div key={`${k}-v`}>{v}</div>])}</div>
                  : <EmptyState line icon="receipt" title="No payment details on this job yet." />}
              </Section>
            )
          })()}

          {shown === 'notes' && (
            notes.length === 0
              ? <EmptyState line icon="message" title="No notes yet.">Notes are seen by everyone at JDS who opens this job.</EmptyState>
              : [...notes].reverse().map((n) => (
                <div key={n.id} className="ix-note">
                  <span className="ix-avatar">{initials(n.done_by_name)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="who" title={timeAgo(n.created_at)}>{n.done_by_name || 'Someone'} · {fmtDateTime(n.created_at)}</div>
                    <div className="bubble">{n.note || n.title}</div>
                  </div>
                </div>
              ))
          )}
        </div>

        {shown === 'notes' && (
          <div className="ix-composer">
            <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !saving && addNote()} placeholder="Write a note for the team…" maxLength={1000} />
            <Button variant="primary" onClick={addNote} disabled={saving || !note.trim()}>{saving ? 'Saving…' : 'Send'}</Button>
          </div>
        )}

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
