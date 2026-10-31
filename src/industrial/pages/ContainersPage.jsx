import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { refreshAllContainers, forceRefreshAllContainers, fetchLDBTracking, persistLDBTracking } from '../../services/tracking/ldbProvider'
import { containerTrip } from '../../services/journey'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import {
  Icon, PageHead, Button, Tabs, Toolbar, Panel, EmptyState, Status, Chip,
  FreeDays, JobNo, Dash, Skeleton, fmtDate, fmtDateTime, timeAgo,
} from '../ui'
import '../styles/containers.css'

// Containers (Control tower, Jose 31 Oct 2026): one row per JOB of the open import
// jobs (a job with more boxes shows "+1", "+2" next to its container), read from the
// shared useJourney().facts.containers, so the counts here match the sidebar, Today and
// Detention. Free days, where-now and the trip's events all come from journeyCore
// (src/services/JOURNEY_FACTS.md); nothing is recounted here. Clicking a job opens the
// container panel, laid out like the old Containers panel (Jose: "match the old one").

// where-now code → the tab it belongs to
const GROUP = {
  unknown: 'none', not_arrived: 'due', port: 'port', to_cfs: 'port', cfs: 'cfs',
  out: 'out', road: 'out', rail: 'out', collected: 'out', empty_back: 'out',
}
// journey order, for sorting by Where now
const ORDER = { not_arrived: 1, port: 2, to_cfs: 3, cfs: 4, out: 5, road: 6, rail: 6, collected: 7, empty_back: 8, unknown: 9 }
const COLS = 10

const isRisk = (c) => !c.finishedOn && (c.level === 'over' || c.level === 'risk')
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// at port / CFS with OOC done and no truck = needs action soon (amber, like 'To move');
// moving is navy, done is green, calm waiting is teal
function whereTone(c, j) {
  if (c.where === 'unknown') return 'grey'
  if (c.where === 'collected' || c.where === 'empty_back') return 'green'
  if (c.where === 'port' || c.where === 'cfs') return j?.readyForTruck ? 'amber' : 'teal'
  return 'blue'
}
// a box's dot in the panel's container switcher: free-days level first, then where it is
const boxTone = (c, j) => (isRisk(c) ? 'red' : !c.finishedOn && c.level === 'soon' ? 'amber' : whereTone(c, j))

function WhereNow({ c, j }) {
  if (c.where === 'unknown') return <span className="ix-st hollow">No tracking yet</span>
  const tone = whereTone(c, j)
  // (the row hides this 'since' while Last event shows the same day: see sameDay)
  return (
    <Status tone={tone} sub={c.whereSince ? `since ${fmtDate(c.whereSince)}` : null}
      title={tone === 'amber' ? 'OOC done, no truck or rail arranged yet' : undefined}>
      {/* its own span so a long place name is cut with '…' in the table */}
      <span className="ix-cn-wt">{c.whereText}</span>
    </Status>
  )
}

// Where now and Last event often say the same thing ("At CFS since 26 Oct" beside
// "At CFS 26 Oct, 12:30"; Jose, 31 Oct 2026: each fact once). The event's name is left
// out when one name contains the other (lowercase, no punctuation: "left cfs" in "left
// cfs with cargo", "at port" in "arrived at port"); the 'since' date is left out when
// the event is on that same day (only while the Last event column is on screen).
const flatName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
function sameName(c) {
  const a = flatName(c.lastEvent?.label)
  const b = flatName(c.whereText)
  return !!(a && b) && (a.includes(b) || b.includes(a))
}
const sameDay = (c) => !!(c.whereSince && c.lastEvent?.at) && fmtDate(c.whereSince) === fmtDate(c.lastEvent.at)

// '2026-11-01' → '2026-11-02' (the day detention starts)
function nextDay(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''))
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1)).toISOString().slice(0, 10)
}

// nulls (the muted dash) sort last in both directions
function compare(a, b, dir) {
  const na = a === null || a === undefined || a === ''
  const nb = b === null || b === undefined || b === ''
  if (na || nb) return na === nb ? 0 : na ? 1 : -1
  const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en', { numeric: true })
  return dir === 'desc' ? -r : r
}

// the box a job row stands for: fewest free days first, then the newest event
const byUrgency = (a, b) => compare(a.freeLeft, b.freeLeft, 'asc')
  || compare(a.lastEvent?.at || null, b.lastEvent?.at || null, 'desc')
  || compare(a.no, b.no, 'asc')
const mostUrgent = (boxes) => [...boxes].sort(byUrgency)[0] || null

// how an event travelled, in plain words: STATION CROSSED is always rail and a toll or
// gate crossing always road, whatever the tracking says; otherwise the event's own mode
const MODE_ICON = { Vessel: 'ship', Rail: 'train', Truck: 'truck', Road: 'road' }
const upName = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim()
function eventMode(m, raw) {
  const s = upName(m.raw)
  if (/STATION CROSSED/.test(s)) return 'Rail'
  if (/TOLL PLAZA CROSSED|GATE CROSSED/.test(s)) return 'Road'
  const at = new Date(m.at).getTime()
  const hit = raw.find((r) => upName(r?.description || r?.event) === s && new Date(r?.date).getTime() === at)
  const t = upName(hit?.transportMode || hit?.transport_mode)
  if (/VESSEL|SHIP|SEA/.test(t)) return 'Vessel'
  if (/RAIL|TRAIN/.test(t)) return 'Rail'
  if (/TRUCK|ROAD/.test(t)) return 'Truck'
  return null
}
// a dot colour per event, by what it means for the box (status colours only)
function eventTone(m) {
  const s = upName(m.raw)
  if (/EMPTY/.test(s)) return 'green'
  if (/^(PORT IN|PORTIN|VESSEL ARRIVED|DISCHARGE|DPD|CFS IN|CFS GATE IN|ICD IN|ICD GATE IN)/.test(s)) return 'teal'
  if (/OUT$|CROSSED|LOADING|LOADED|DEPARTED|SAILED/.test(s)) return 'blue'
  return 'grey'
}

// Port in / out and CFS (or ICD) gate in / out of THIS trip, from the trip's events
// (journeyCore's tripMilestones); the saved row's own dates only when the trip has none.
// Gate out is leaving the CFS the box went into last: a CFS OUT before that gate in was
// a move between CFSs, so it is told in a note (as the old panel did), not shown as the
// box's gate out. With no CFS OUT after the gate in, a plain GATE OUT after it is used.
const CFS_IN = /^(CFS IN|CFS GATE IN|ICD IN|ICD GATE IN)$/
const CFS_OUT = /^(CFS OUT|CFS GATE OUT|ICD OUT|ICD GATE OUT)$/
const GATE_OUT = /^(GATE OUT|GATEOUT)$/
function tripGates(c, row) {
  const ms = c.milestones || []
  const at = (m) => new Date(m.at).getTime()
  const latest = (re, after = -Infinity) => [...ms].reverse().find((m) => re.test(upName(m.raw)) && at(m) >= after) || null
  const none = !ms.length
  const pOut = latest(/^(PORT OUT|PORTOUT)$/)
  // the box's own PORT IN event, not the trip's start (that can be the date-only DPD
  // marker at 00:00; the old panel showed the real port-in time)
  const pIn = ms.find((m) => /^(PORT IN|PORTIN)$/.test(upName(m.raw))) || null
  const gIn = latest(CFS_IN)
  const lastOut = latest(CFS_OUT)
  const gOut = gIn ? latest(CFS_OUT, at(gIn)) || latest(GATE_OUT, at(gIn)) : lastOut
  const flat = (p) => String(p || '').toUpperCase().replace(/\W/g, '')
  const differ = (a, b) => !!(a?.place && b?.place && flat(a.place) !== flat(b.place))
  const earlier = gIn && lastOut && at(lastOut) < at(gIn) ? lastOut : null
  let note = null
  let inPlace = null
  let outPlace = null
  if (differ(earlier, gIn)) {
    note = `left ${earlier.place} on ${fmtDate(earlier.at)}, then entered ${gIn.place} on ${fmtDate(gIn.at)}.`
    inPlace = gIn.place
    if (gOut) outPlace = gOut.place || null
  } else if (differ(gIn, gOut)) {
    note = `gate in was reported at ${gIn.place} and gate out at ${gOut.place}.`
    inPlace = gIn.place
    outPlace = gOut.place
  }
  return {
    icd: ms.some((m) => /^ICD/.test(upName(m.raw))),
    portIn: pIn?.at || c.portInAt || (none ? row?.port_in || null : null),
    portOut: pOut?.at || (none ? row?.port_out || null : null),
    gateIn: gIn?.at || (none ? row?.cfs_gate_in || null : null),
    gateOut: gOut?.at || null,
    inPlace, outPlace, note,
  }
}

// Is the saved tracking snapshot (ship, ETA, terminal, IMO, laden / empty, dwell end,
// current location, status) about THIS job's trip? For a finished box whose tracking has
// since moved on to a later trip it is not, so the panel falls back to the job's own
// ship and ETA and leaves the rest blank.
function snapshotIsThisTrip(c, row, job) {
  if (!row) return false
  if (!c.finishedOn) return true
  if (containerTrip(row, job).laterTrip) return false
  const times = (Array.isArray(row.milestones) ? row.milestones : [])
    .map((m) => new Date(m?.date).getTime()).filter(Number.isFinite)
  if (!times.length) return true
  const last = c.milestones?.at(-1)
  return !!last && Math.max(...times) <= new Date(last.at).getTime() + 60e3
}

// DPD on this trip: the shared trip rule (containerTrip().dpd, known once the box has
// left the port), or a DPD event among this trip's events before that; the saved flag
// only when the trip has no events and the snapshot is this trip's
function isDpd(c, row, job, ex) {
  if (!row) return false
  if (containerTrip(row, job).dpd) return true
  if ((c.milestones || []).some((m) => /^DPD/.test(upName(m.raw)))) return true
  return !c.milestones?.length && ex?.dpd_flag === true && snapshotIsThisTrip(c, row, job)
}

// The shipping line's own tracking page (kept from the old Containers screen). Sites
// that do not fill the number in get it copied, so staff can paste it.
const LINE_SITES = [
  [/msc/, (n) => `https://www.msc.com/en/track-a-shipment?agencyPath=msc&Type=Container&Information=${n}`],
  [/maersk/, (n) => `https://www.maersk.com/tracking/${n}`],
  [/hapag/, (n) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${n}`],
  [/cma/, (n) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchViewModel.SearchBy=Container&SearchViewModel.Reference=${n}`],
  [/\bone\b|ocean network/, (n) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?ctrack-field=${n}&trakNoParam=${n}`, true],
  [/evergreen/, (n) => `https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do?TYPE=CNTR&CNTR=${n}`, true],
  [/zim/, (n) => `https://www.zim.com/tools/track-a-shipment?consnumber=${n}`, true],
  [/yang ?ming/, (n) => `https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx?SearchType=CNTR_NO&strSearch=${n}`, true],
  [/hmm|hyundai/, (n) => `https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp?trackingType=CNTR&trackingNo=${n}`, true],
  [/cosco/, (n) => `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number=${n}`],
  [/oocl/, (n) => `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?ContainerNo=${n}`, true],
  [/wan ?hai/, (n) => `https://www.wanhai.com/views/cargoTrack/CargoTrack.xhtml?cntrNo=${n}`, true],
  [/\bpil\b|pacific international/, (n) => `https://www.pilship.com/en-PIL-Container-Tracking/114.html?number=${n}`, true],
  [/ts ?line/, (n) => `https://www.tslines.com/cargo_track?cntr_no=${n}`],
  [/sinokor/, (n) => `https://www.sinokor.co.kr/Tracking?blNo=${n}`, true],
  [/emirates/, () => 'https://scekprd.emirates.com/skychain/app?service=page%2Fnwp%3ATrackshipmt&initial=y'],
]
function openLineSite(no, line, toast) {
  const hit = LINE_SITES.find(([re]) => re.test(String(line || '').toLowerCase()))
  const url = hit ? hit[1](no) : `https://www.track-trace.com/container#${no}`
  window.open(url, '_blank', 'noopener')
  if (hit?.[2]) return
  const typeIt = () => toast(`Type ${no} in the line's search box`, 'info')
  try {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(no).then(() => toast(`${no} copied: paste it in the line's search box`, 'success'), typeIt)
    else typeIt()
  } catch {
    typeIt()
  }
}
function copyText(text, toast) {
  const fail = () => toast(`Could not copy ${text}`, 'error')
  try {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(`${text} copied`, 'success'), fail)
    else fail()
  } catch {
    fail()
  }
}

// a per-container check that found nothing new, in plain words (no system names)
const NOT_OK = {
  OUTDATED_TRACKING: 'has had no movement for over 30 days',
  NO_TRACKING_FOUND: 'is not reported by the port or line yet; try again later',
  INVALID_TRACKING_RESPONSE: 'could not be read; try again in a minute',
  TRACKING_PROVIDER_ERROR: 'could not be checked; try again in a minute',
}

// the extra tracking fields only the panel shows (the shared journey load leaves them out)
const EXTRA_COLS = 'container_no, terminal, vessel_imo, is_empty, expected_port_out, dpd_flag'

export default function ContainersPage({ showToast, pendingNavAction, onNavActionConsumed, onOpenJob }) {
  const { data, byId, facts, error, refresh } = useJourney()
  useFreshOnOpen()
  const navigate = useNavigate()
  const toast = (msg, type = 'info') => showToast?.(msg, type)

  // an old Detention link (?tab=detention) opens the Detention risk tab (the Detention page
  // was folded into Containers, 31 Oct 2026)
  const [view, setView] = useState(() => (new URLSearchParams(window.location.search).get('tab') === 'detention' ? 'risk' : 'all'))
  const [q, setQ] = useState('')
  const [line, setLine] = useState('')
  const [jobFilter, setJobFilter] = useState(null)
  const [sort, setSort] = useState({ key: 'free', dir: 'asc' })
  const [showFinished, setShowFinished] = useState(false)
  const [sel, setSel] = useState(null) // { jobId, no }
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(null)
  const [navSeen, setNavSeen] = useState(null)
  const [extras, setExtras] = useState({})
  const [peek, setPeek] = useState(null) // the +N list: { key, x, top | bottom }
  const peekRef = useRef(null)

  const all = facts.containers
  const inPlay = useMemo(() => all.filter((c) => !c.finishedOn), [all])
  const checkedAt = (c) => data?.containersByNo?.[c.no]?.last_refreshed_at || null

  // every box of a job, in the job's own container order
  const boxesByJob = useMemo(() => {
    const m = new Map()
    for (const c of all) {
      if (!m.has(c.jobId)) m.set(c.jobId, [])
      m.get(c.jobId).push(c)
    }
    return m
  }, [all])

  // the tab figures, all from the one list of containers in play (no KPI strip: it
  // repeated these tabs, Jose 31 Oct 2026)
  const k = useMemo(() => {
    const n = { all: inPlay.length, due: 0, port: 0, cfs: 0, out: 0, none: 0, stale: 0, risk: 0 }
    let lastCheck = null
    for (const c of inPlay) {
      n[GROUP[c.where]] = (n[GROUP[c.where]] || 0) + 1
      if (c.stale) n.stale++
      if (isRisk(c)) n.risk++
    }
    for (const c of all) {
      const t = data?.containersByNo?.[c.no]?.last_refreshed_at
      if (t && (!lastCheck || t > lastCheck)) lastCheck = t
    }
    return { ...n, lastCheck }
  }, [inPlay, all, data])

  const lines = useMemo(() => [...new Set(inPlay.map((c) => c.line).filter(Boolean))].sort(), [inPlay])

  // filters: search matches any box of the job; line and the tabs pick the boxes
  const s = q.trim().toLowerCase()
  const searchHit = (c) => {
    if (!s) return true
    const hay = [c.jobNo, c.client, c.no, c.line, c.whereText, c.place, c.size].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(s) || hay.replace(/\s+/g, '').includes(s.replace(/\s+/g, ''))
  }
  const lineOk = (c) => !line || c.line === line
  const inView = (c) => (view === 'all' ? true
    : view === 'risk' ? isRisk(c)
      : view === 'stale' ? c.stale
        : GROUP[c.where] === view)

  // one row per job: the boxes in play that pass the tab and line filters, shown by
  // the most urgent of them (a box the search names first). A job's finished boxes get
  // a row of their own under Finished (as the old per-container table listed them), so
  // a finished box of a still-open job can be found and opened.
  const jobRow = (jobId, boxes, hits, done) => {
    const named = s ? hits.filter(searchHit) : []
    const p = mostUrgent(named.length ? named : hits)
    const live = boxes.filter((c) => !c.finishedOn)
    const worst = done ? null : mostUrgent(live)
    // "2 places" counts only known places (a box with no tracking yet is not a place)
    const places = new Set(live.filter((c) => c.where !== 'unknown').map((c) => c.whereText)).size
    return { key: done ? `${jobId}:done` : jobId, jobId, done, p, boxes, hits, live, worst, places }
  }
  const rowsOpen = []
  const rowsDone = []
  for (const [jobId, boxes] of boxesByJob) {
    if (jobFilter && jobId !== jobFilter) continue
    const live = boxes.filter((c) => !c.finishedOn)
    const ended = boxes.filter((c) => c.finishedOn)
    const openHits = live.filter((c) => lineOk(c) && inView(c))
    if (openHits.length && openHits.some(searchHit)) rowsOpen.push(jobRow(jobId, boxes, openHits, false))
    const doneHits = ended.filter(lineOk)
    if (doneHits.length && doneHits.some(searchHit)) rowsDone.push(jobRow(jobId, boxes, doneHits, true))
  }

  const sortVal = {
    job: (r) => r.p.jobNo,
    client: (r) => r.p.client,
    no: (r) => r.p.no,
    line: (r) => r.p.line,
    where: (r) => ORDER[r.p.where],
    event: (r) => r.p.lastEvent?.at || null,
    free: (r) => r.p.freeLeft,
    updated: (r) => checkedAt(r.p),
  }
  const byOrder = (a, b) => compare(sortVal[sort.key](a), sortVal[sort.key](b), sort.dir)
    || compare(a.p.jobNo, b.p.jobNo, 'asc')

  const rows = rowsOpen.sort(byOrder)
  const finishedRows = rowsDone.sort(byOrder)
  // a search also looks through finished boxes (it is an explicit ask), so they show
  const finishedOpen = view === 'all' && (showFinished || !!s)
  const shownFinished = finishedOpen ? finishedRows : []
  const list = [...rows, ...shownFinished]
  const listBoxes = list.reduce((n, r) => n + r.hits.length, 0)
  const listJobs = new Set(list.map((r) => r.jobId)).size

  const selBoxes = sel ? boxesByJob.get(sel.jobId) || [] : []
  const current = selBoxes.find((c) => c.no === sel?.no) || selBoxes[0] || null
  // the row the open panel belongs to: the Finished row when a finished box is picked
  const selKey = !current ? null
    : current.finishedOn && list.some((r) => r.key === `${current.jobId}:done`) ? `${current.jobId}:done`
      : list.some((r) => r.key === current.jobId) ? current.jobId : `${current.jobId}:done`
  const pos = selKey ? list.findIndex((r) => r.key === selKey) : -1
  const selectRow = (r) => setSel(r ? { jobId: r.jobId, no: r.p.no } : null)

  // the +N chip / "2 places" hint opens a small list of the job's boxes (a title
  // tooltip cannot be seen on phones and tablets)
  const openPeek = (e, r) => {
    e.stopPropagation()
    if (peek?.key === r.key) { setPeek(null); return }
    const b = e.currentTarget.getBoundingClientRect()
    const x = Math.max(8, Math.min(b.left, window.innerWidth - 328))
    setPeek(window.innerHeight - b.bottom < 260
      ? { key: r.key, x, bottom: window.innerHeight - b.top + 4 }
      : { key: r.key, x, top: b.bottom + 4 })
  }
  useEffect(() => {
    if (!peek) return undefined
    const close = () => setPeek(null)
    const inside = (e) => peekRef.current?.contains(e.target)
    // (a press on a +N chip is left to its own click, which toggles or moves the list)
    const onDown = (e) => { if (!inside(e) && !e.target?.closest?.('.ix-cn-more, .ix-cn-places')) close() }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    const onScroll = (e) => { if (!inside(e)) close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [peek])

  // links from alerts: ?job= filters to that job, ?cn= opens that job's panel on that
  // container (a job with a single container opens it). Handled once, as soon as the
  // data is here.
  if (data && pendingNavAction && pendingNavAction !== navSeen && pendingNavAction.tab === 'containers' && pendingNavAction.jobId) {
    setNavSeen(pendingNavAction)
    setJobFilter(pendingNavAction.jobId)
    setView('all')
    setQ('')
    setLine('')
    const cn = String(pendingNavAction.cn || '').replace(/\s+/g, '').toUpperCase()
    const boxes = all.filter((c) => c.jobId === pendingNavAction.jobId)
    const hit = cn ? boxes.find((c) => c.no === cn) : boxes.length === 1 ? boxes[0] : null
    setSel(hit ? { jobId: hit.jobId, no: hit.no } : null)
    if (hit?.finishedOn) setShowFinished(true)
  }
  useEffect(() => {
    if (navSeen && navSeen === pendingNavAction) onNavActionConsumed?.()
  }, [navSeen, pendingNavAction, onNavActionConsumed])

  // live: a saved tracking change reloads the shared data (a few seconds after the
  // last one, so a batch of updates loads once)
  useEffect(() => {
    let timer = null
    const channel = supabase
      .channel('ix-containers-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'container_tracking' }, () => {
        clearTimeout(timer)
        timer = setTimeout(() => refresh(), 4000)
      })
      .subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(channel) }
  }, [refresh])

  // the open job's terminal, ship IMO, laden / empty, dwell end and DPD flag (read
  // again whenever the shared data reloads, e.g. after a check)
  const selNos = selBoxes.map((c) => c.no).join(',')
  const loadedAt = data?.loadedAt || null
  useEffect(() => {
    if (!selNos) return undefined
    let live = true
    const nos = selNos.split(',')
    supabase.from('container_tracking').select(EXTRA_COLS).in('container_no', nos)
      .then(({ data: got, error: e }) => {
        if (!live) return
        if (e) { console.warn('[Containers] panel details failed:', e.message); return }
        setExtras((prev) => {
          const next = { ...prev }
          for (const no of nos) next[no] = (got || []).find((r) => r.container_no === no) || {}
          return next
        })
      })
    return () => { live = false }
  }, [selNos, loadedAt])

  // the open containers grouped back into their jobs, for the tracking calls
  // (finished boxes are left out, so they are not checked again)
  const jobsToCheck = (boxes) => {
    const m = new Map()
    for (const c of boxes) {
      if (!m.has(c.jobId)) m.set(c.jobId, [])
      m.get(c.jobId).push(c.no)
    }
    return [...m].map(([id, nos]) => byId[id]?.job && { ...byId[id].job, containers: nos.join(', ') }).filter(Boolean)
  }

  // Opening the page checks containers not checked in the last 12 hours, as the old
  // Containers screen did (container tracking only, never a government system), now
  // only for the open jobs.
  const mounted = useRef(true)
  const autoRan = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    if (autoRan.current || !data) return
    autoRan.current = true
    const jobs = jobsToCheck(inPlay)
    if (!jobs.length) return
    refreshAllContainers(jobs, {})
      .then((t) => { if (mounted.current && t.updated > 0) refresh() })
      .catch((e) => console.warn('[Containers] check on open failed:', e))
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps -- runs once, when the data first arrives

  // Refresh all: checks every open container now (the button the old screen had)
  const refreshAll = async () => {
    if (busy) return
    const jobs = jobsToCheck(inPlay)
    if (!jobs.length) { toast('No open containers to check.', 'info'); return }
    setBusy(true)
    toast('Checking container movements…', 'info')
    try {
      const t = await forceRefreshAllContainers(jobs)
      if (t.failed > 0) toast(`${t.updated} updated, ${t.failed} could not be checked. Try again in a minute.`, 'error')
      else if (t.updated === 0) toast('All containers checked: no new movements.', 'info')
      else toast(`${plural(t.updated, 'container')} updated${t.skipped ? `, ${t.skipped} with nothing new` : ''}.`, 'success')
      refresh()
    } catch (e) {
      console.error('[Containers] refresh all failed:', e)
      toast('Could not reach container tracking, try again in a minute.', 'error')
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  // one container, on a button press
  const checkOne = async (c) => {
    const job = byId[c.jobId]?.job
    if (!job || checking) return
    setChecking(c.no)
    toast(`Checking ${c.no}…`, 'info')
    try {
      const res = await fetchLDBTracking(c.no)
      if (res.ok) {
        await persistLDBTracking(c.no, job, res.data)
        toast(`${c.no} updated`, 'success')
        refresh()
      } else {
        toast(`${c.no} ${NOT_OK[res.status] || 'has nothing new'}.`, 'info')
      }
    } catch (e) {
      console.error('[Containers] check failed:', e)
      toast('Could not reach container tracking, try again in a minute.', 'error')
    } finally {
      if (mounted.current) setChecking(null)
    }
  }

  // the job panel when the dashboard passes it, else the All jobs link alerts use
  const openJob = (id) => {
    if (onOpenJob) { setSel(null); onOpenJob(id) }
    else navigate(`/admin?tab=jobs&open=${encodeURIComponent(id)}`)
  }

  const setSortKey = (key) => setSort((x) => (x.key === key ? { key, dir: x.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  const th = (id, label, className = '') => {
    const on = sort.key === id
    return (
      <th key={id} className={`sort${on ? ' sorted' : ''}${className ? ` ${className}` : ''}`} onClick={() => setSortKey(id)}
        aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        {label} <Icon name={on && sort.dir === 'desc' ? 'arrow-down' : 'arrow-up'} className={on ? '' : 'hint'} />
      </th>
    )
  }

  // one job row, shown by its most urgent box
  // (the red / amber edge is the job's worst open box; when that is not the box the row
  // shows, Free till names it, so the edge is never left unexplained)
  const row = (r) => {
    const c = r.p
    const edgeTone = (x) => (x.finishedOn ? '' : x.level === 'over' || x.level === 'risk' ? 'red' : x.level === 'soon' ? 'amber' : '')
    const lvl = edgeTone(r.worst || c)
    const also = lvl && r.worst && r.worst.no !== c.no && edgeTone(c) !== lvl ? r.worst : null
    const on = r.key === selKey
    const cls = [lvl, on && 'sel', r.done && 'done'].filter(Boolean).join(' ')
    const t = checkedAt(c)
    const others = r.boxes.filter((x) => x.no !== c.no)
    const j = byId[r.jobId]?.j
    const evNameDup = c.lastEvent && c.where !== 'unknown' && sameName(c)
    const sinceDup = c.where !== 'unknown' && sameDay(c)
    return (
      <tr key={r.key} className={cls} onClick={() => (on ? setSel(null) : selectRow(r))}>
        <td className="lvl" />
        <td title={c.client || undefined}><JobNo no={c.jobNo} onClick={() => openJob(c.jobId)} /></td>
        <td className="cl c-cl" title={c.client || undefined}><span className="ix-cn-ell">{c.client || <Dash />}</span></td>
        <td>
          <span className="ix-cn-nocell">
            <span className="ix-cn-no">{c.no}</span>
            {others.length > 0 && (
              <button type="button" className={`ix-cn-more${peek?.key === r.key ? ' on' : ''}`} onClick={(e) => openPeek(e, r)}
                aria-expanded={peek?.key === r.key} aria-label={`${plural(others.length, 'more container')} on ${c.jobNo}`}
                title={`Also on ${c.jobNo}:\n${others.map((x) => `${x.no} · ${x.finishedOn ? 'Finished' : x.whereText}`).join('\n')}`}>
                +{others.length}
              </button>
            )}
          </span>
        </td>
        <td className="dim c-size">{c.size || <Dash />}</td>
        <td className="ix-cn-line c-line" title={c.line || undefined}><span className="ix-cn-ell">{c.line || <Dash />}</span></td>
        <td className={`ix-cn-where${sinceDup ? ' dupsince' : ''}`} title={c.where === 'unknown' ? undefined : `${c.whereText}${c.whereSince ? ` since ${fmtDate(c.whereSince)}` : ''}`}>
          <span className="ix-cn-wherecell">
            <WhereNow c={c} j={j} />
            {!r.done && r.places > 1 && (
              <button type="button" className="ix-cn-places" onClick={(e) => openPeek(e, r)} aria-expanded={peek?.key === r.key}
                title={r.live.map((x) => `${x.no} · ${x.whereText}`).join('\n')}>{r.places} places</button>
            )}
          </span>
        </td>
        <td className="c-ev" title={c.lastEvent ? [evNameDup && c.lastEvent.label, c.lastEvent.place].filter(Boolean).join(' · ') || undefined : undefined}>
          {c.lastEvent
            ? <span className="ix-cn-ev">{!evNameDup && <span>{c.lastEvent.label}</span>}<span className="at">{fmtDateTime(c.lastEvent.at)}</span></span>
            : <Dash />}
        </td>
        <td className="r">
          {c.stale && c.freeLeft === null
            ? <Chip tone="amber" title="No movement for over 30 days: probably finished">No move {c.lastMoveDays} d</Chip>
            : <FreeDays value={c.freeLeft} till={c.freeTill && fmtDate(c.freeTill)} />}
          {also && (
            <span className={`ix-cn-also ${lvl}`} title={`${also.no} is the job's most urgent container`}>
              {also.no} · {also.freeLeft < 0 ? `${also.detentionDays} d over` : also.freeLeft === 0 ? 'last day' : `${also.freeLeft} d`}
            </span>
          )}
        </td>
        <td className="dim c-upd" title={t ? `Checked ${timeAgo(t)}` : 'Not checked yet'}>{t ? fmtDateTime(t) : <Dash />}</td>
      </tr>
    )
  }

  const clearFilters = () => { setQ(''); setLine(''); setJobFilter(null); setView('all') }
  const jobNoOf = (id) => byId[id]?.job?.job_no || 'This job'

  const tabs = [
    { id: 'all', label: 'All in play', count: k.all },
    { id: 'risk', label: 'Detention risk', count: k.risk, tone: k.risk ? 'red' : undefined },
    { id: 'due', label: 'Not arrived', count: k.due },
    { id: 'port', label: 'At port', count: k.port },
    { id: 'cfs', label: 'At CFS', count: k.cfs },
    { id: 'out', label: 'Left with cargo', count: k.out },
    { id: 'none', label: 'No tracking yet', count: k.none },
    { id: 'stale', label: 'No movement 30+ d', count: k.stale, tone: k.stale ? 'amber' : undefined },
  ].filter((t) => t.id === 'all' || t.count > 0 || t.id === view)

  const head = (
    <PageHead
      title="Containers"
      sub={['Updated automatically', k.lastCheck && `last check ${fmtDateTime(k.lastCheck)}`]}
      actions={(
        <Button icon="refresh" onClick={refreshAll} disabled={busy || !data} title="Check every open container's movements now">
          {busy ? 'Checking…' : 'Refresh all'}
        </Button>
      )}
    />
  )

  if (!data) {
    return (
      <>
        {head}
        <Panel>
          {error
            ? <EmptyState line icon="alert-triangle" tone="red" title={`Could not load containers: ${error}`} action={<button type="button" className="ix-link" onClick={refresh}>Try again</button>} />
            : <Skeleton rows={8} />}
        </Panel>
      </>
    )
  }

  const finishedBoxes = finishedRows.reduce((n, r) => n + r.hits.length, 0)
  const peekRow = peek ? list.find((r) => r.key === peek.key) || null : null

  return (
    <>
      {head}

      <Panel>
        <Tabs tabs={tabs} value={view} onChange={setView} />
        <Toolbar
          search={q} onSearch={setQ} placeholder="Job, client, container, line or place"
          filters={lines.length > 1 ? [{ key: 'line', label: 'Line', value: line, onChange: setLine, options: [{ value: '', label: 'All' }, ...lines] }] : []}
        >
          {jobFilter && (
            <span className="ix-cn-jobchip">
              Job: <b>{jobNoOf(jobFilter)}</b>
              <button type="button" onClick={() => setJobFilter(null)} aria-label="Show every job"><Icon name="x" /></button>
            </span>
          )}
        </Toolbar>

        {all.length === 0 ? (
          <EmptyState icon="box" title="No containers on open jobs">Containers show here once a job has its container numbers.</EmptyState>
        ) : list.length === 0 ? (
          <EmptyState line icon="filter-off"
            title={jobFilter && !all.some((c) => c.jobId === jobFilter) ? `${jobNoOf(jobFilter)} has no containers on an open job.` : 'No containers match.'}
            action={<button type="button" className="ix-link" onClick={clearFilters}>Show all containers</button>} />
        ) : (
          <div className="ix-tbl-wrap ix-cn-wrap">
            <table className="ix-tbl click ix-cn-tbl">
              <thead>
                <tr>
                  <th className="lvl" />
                  {/* c-* columns drop out on narrower screens (containers.css) so the
                      table fits at 1366px; Job, Container, Where now and Free till stay */}
                  {th('job', 'Job')}
                  {th('client', 'Client', 'c-cl')}
                  {th('no', 'Container')}
                  <th className="c-size">Size</th>
                  {th('line', 'Line', 'c-line')}
                  {th('where', 'Where now')}
                  {th('event', 'Last event', 'c-ev')}
                  {th('free', 'Free till', 'r')}
                  {th('updated', 'Updated', 'c-upd')}
                </tr>
              </thead>
              <tbody>
                {rows.map(row)}
                {shownFinished.length > 0 && (
                  <tr className="grp"><td colSpan={COLS}>Finished <span className="n">{finishedBoxes}</span></td></tr>
                )}
                {shownFinished.map(row)}
              </tbody>
            </table>
          </div>
        )}

        {all.length > 0 && (
          <div className="ix-tbl-foot">
            <span>{plural(listBoxes, 'container')} · {plural(listJobs, 'job')}</span>
            {finishedRows.length > 0 && !s && (
              <div className="right">
                <button type="button" className="ix-link" onClick={() => { setShowFinished((v) => !(v && view === 'all')); setView('all') }}>
                  {showFinished && view === 'all' ? 'Hide finished' : `Show finished (${plural(finishedBoxes, 'container')})`}
                </button>
              </div>
            )}
          </div>
        )}
      </Panel>

      {peekRow && (
        <div ref={peekRef} className="ix-cn-peek" role="dialog" aria-label={`Containers on ${peekRow.p.jobNo}`}
          style={{ left: peek.x, top: peek.top, bottom: peek.bottom }}>
          <div className="hd"><JobNo no={peekRow.p.jobNo} /><span>{plural(peekRow.boxes.length, 'container')}</span></div>
          <ul>
            {peekRow.boxes.map((x) => (
              <li key={x.no}>
                <button type="button" className={x.no === peekRow.p.no ? 'cur' : undefined}
                  onClick={() => { setPeek(null); setSel({ jobId: x.jobId, no: x.no }) }}>
                  <span className={`ix-dot ${x.finishedOn ? 'green' : boxTone(x, byId[x.jobId]?.j)}`} />
                  <span className="no">{x.no}</span>
                  <span className="wh">{x.finishedOn ? 'Finished' : x.whereText}</span>
                  {!x.finishedOn && x.freeLeft !== null && <FreeDays value={x.freeLeft} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {current && (
        <ContainerPanel
          key={current.jobId}
          c={current} boxes={selBoxes}
          job={byId[current.jobId]?.job} j={byId[current.jobId]?.j}
          row={data?.containersByNo?.[current.no] || null}
          rowsByNo={data?.containersByNo || {}}
          extra={extras[current.no]} extras={extras}
          checked={checkedAt(current)}
          onPick={(no) => setSel({ jobId: current.jobId, no })}
          onPrevJob={pos > 0 ? () => selectRow(list[pos - 1]) : null}
          onNextJob={pos >= 0 && pos < list.length - 1 ? () => selectRow(list[pos + 1]) : null}
          onClose={() => setSel(null)}
          onOpenJob={() => openJob(current.jobId)}
          onCheck={() => checkOne(current)} checking={checking === current.no}
          onCopy={() => copyText(current.no, toast)}
          onLineSite={() => openLineSite(current.no, current.line || byId[current.jobId]?.job?.shipping_line, toast)}
        />
      )}
    </>
  )
}

// ── side panel: one job's containers, laid out like the old Containers panel ──
// Header (job, client · line, chips) → container switcher → the box: number and last
// check, free days, location & vessel, container, port events, event history.
function ContainerPanel({ c, boxes, job, j, row, rowsByNo, extra, extras, checked, onPick, onPrevJob, onNextJob, onClose, onOpenJob, onCheck, checking, onCopy, onLineSite }) {
  const idx = Math.max(0, boxes.findIndex((x) => x.no === c.no))
  const prevBox = idx > 0 ? boxes[idx - 1] : null
  const nextBox = idx < boxes.length - 1 ? boxes[idx + 1] : null

  // Esc closes; ← / → move between this job's containers; J / K (or ↑ / ↓) between jobs
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && prevBox) { e.preventDefault(); onPick(prevBox.no) }
      else if (e.key === 'ArrowRight' && nextBox) { e.preventDefault(); onPick(nextBox.no) }
      else if ((e.key === 'j' || e.key === 'ArrowDown') && onNextJob) { e.preventDefault(); onNextJob() }
      else if ((e.key === 'k' || e.key === 'ArrowUp') && onPrevJob) { e.preventDefault(); onPrevJob() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPick, prevBox, nextBox, onNextJob, onPrevJob])

  // keep the picked container's tab in view
  const tabsRef = useRef(null)
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [c.no])

  // the saved snapshot's fields only when they are about this trip (see snapshotIsThisTrip)
  const snap = snapshotIsThisTrip(c, row, job)
  const ex = snap ? extra || {} : {}
  const jobRisk = boxes.some(isRisk)
  const jobOver = boxes.some((x) => !x.finishedOn && x.level === 'over')
  const unclear = !c.finishedOn && c.stale && c.freeLeft === null
  const jobLine = c.line || job?.shipping_line || null
  // DPD: the header chip is for the job (any box), the banner for the picked box
  const dpd = isDpd(c, row, job, extra)
  const jobDpd = boxes.some((x) => (x.no === c.no ? dpd : isDpd(x, rowsByNo?.[x.no], job, extras?.[x.no])))
  const held = snap && !c.finishedOn && row?.status === 'customs_hold'
  const moved = ['out', 'road', 'rail', 'collected', 'empty_back'].includes(c.where)

  // ── free days (journeyCore's numbers only) ──
  const contract = Number(job?.free_days)
  const total = c.freeFrom === 'contract' && Number.isFinite(contract) && contract > 0 ? contract : null
  const detFrom = c.freeTill ? fmtDate(nextDay(c.freeTill)) : null
  let free
  if (c.finishedOn) {
    free = { tone: 'green', label: 'Container work finished', big: c.where === 'collected' ? 'Collected' : 'Done',
      foot: `${c.whereText}${c.whereSince ? ` · ${fmtDate(c.whereSince)}` : c.finishedOn !== 'yes' ? ` · ${fmtDate(c.finishedOn)}` : ''}`, pct: 100 }
  } else if (c.stale && c.freeLeft === null) {
    free = { tone: 'grey', label: 'Status unclear', big: `No move ${c.lastMoveDays} d`,
      foot: 'No movement for over 30 days, so this is probably finished. If the empty is back, mark the job delivered.' }
  } else if (c.freeLeft !== null && c.freeLeft < 0) {
    free = { tone: 'red', label: 'In detention', big: plural(c.detentionDays, 'day'), pct: 100,
      left: `free time ended ${fmtDate(c.freeTill)}`,
      action: 'Charges add up every day until the empty is returned' }
  } else if (c.freeLeft !== null) {
    const tone = c.level === 'risk' ? 'red' : c.level === 'soon' ? 'amber' : 'teal'
    free = {
      tone, label: 'Free days remaining', big: c.freeLeft === 0 ? 'Last day' : plural(c.freeLeft, 'day'),
      pct: total ? Math.max(0, Math.min(100, ((total - c.freeLeft) / total) * 100)) : null,
      left: `free till ${fmtDate(c.freeTill)}`,
      right: total ? `${Math.min(total, Math.max(0, total - c.freeLeft))} of ${total} used` : "by the line's own count",
      action: c.level === 'risk'
        ? `${moved ? 'Get the empty returned' : 'Arrange delivery immediately'} — detention from ${detFrom}`
        : `Detention from ${detFrom}`,
    }
  } else if (c.portInAt) {
    free = { tone: 'amber', label: 'Free days not set', big: <Dash />, foot: "Add the job's free days to count down to detention." }
  } else {
    free = { tone: 'grey', label: 'Free days', big: <Dash />, foot: c.tracked ? 'They start counting when the container reaches the port.' : 'No tracking yet: the port or line has not reported this container.' }
  }

  let alert = null
  if (!c.finishedOn && c.level === 'over') {
    alert = `Detention running for ${plural(c.detentionDays, 'day')} — get the container delivered and the empty returned`
  } else if (!c.finishedOn && c.level === 'risk') {
    alert = `${c.freeLeft === 0 ? 'Last free day today' : `Only ${plural(c.freeLeft, 'free day')} left`} — ${moved ? 'get the empty container returned today' : 'contact client and arrange transport today'}`
  }

  // ── grids ──
  const g = tripGates(c, row)
  const place = c.finishedOn
    ? c.lastEvent?.place || c.place || null
    : (snap && row?.current_location) || c.place || c.lastEvent?.place || null
  const laden = c.where === 'empty_back' || ex.is_empty === true ? 'Empty' : ex.is_empty === false ? 'Full / laden' : null
  const dwell = ex.expected_port_out && (c.where === 'port' || c.where === 'not_arrived') ? `~${fmtDate(ex.expected_port_out)}` : null
  const vesselEta = (snap && row?.eta) || job?.eta || null
  const locGrid = [
    { k: 'Current location', v: place },
    { k: 'Terminal', v: ex.terminal || null },
    { k: 'Vessel', v: (snap && row?.vessel) || job?.vessel || null },
    { k: 'Vessel arrival', v: vesselEta ? fmtDate(vesselEta) : null },
    { k: 'Shipping line', v: jobLine },
    { k: 'Vessel IMO', v: ex.vessel_imo || null, mono: true, muted: true },
  ]
  const boxGrid = [
    { k: 'Size', v: c.size },
    { k: 'Laden / empty', v: laden },
    { k: 'Est. dwell end', v: dwell, muted: true },
  ]
  const gateWord = g.icd ? 'ICD' : 'CFS'
  const portGrid = [
    { k: 'Port in', v: g.portIn ? fmtDateTime(g.portIn) : null },
    { k: 'Port out', v: g.portOut ? fmtDateTime(g.portOut) : null },
    { k: `${gateWord} gate in`, v: g.gateIn ? fmtDateTime(g.gateIn) : null, sub: g.inPlace && `at ${g.inPlace}` },
    { k: `${gateWord} gate out`, v: g.gateOut ? fmtDateTime(g.gateOut) : null, sub: g.outPlace && `at ${g.outPlace}`,
      empty: g.note && !g.gateOut ? `still at ${g.inPlace}` : null },
  ]
  const rawMs = Array.isArray(row?.milestones) ? row.milestones : []
  const history = [...(c.milestones || [])].reverse()

  return (
    <>
      <div className="ix-backdrop" onClick={onClose} />
      <aside className="ix-drawer ix-cnp" role="dialog" aria-label={`${c.jobNo} containers`}>
        {/* header: the job, like the old panel's top band, in the light job-panel look */}
        <header className="ix-cnp-head">
          <div className="ix-cnp-r1">
            <JobNo no={c.jobNo} size="lg" onClick={onOpenJob} title={`Open ${c.jobNo}`} />
            <div className="right">
              <Button variant="primary" size="sm" icon="layout-sidebar-right" onClick={onOpenJob}>Open job</Button>
              <button type="button" className="ix-icon-btn" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)"><Icon name="x" /></button>
            </div>
          </div>
          {(c.client || jobLine) && (
            <div className="ix-cnp-sub">{[c.client, jobLine].filter(Boolean).join(' · ')}</div>
          )}
          <div className="ix-cnp-chips">
            {job?.mode && <Chip icon={job.mode === 'Air' ? 'plane' : 'ship'}>{job.mode}</Chip>}
            {boxes.length > 1 && <Chip icon="box">{plural(boxes.length, 'container')}</Chip>}
            {jobOver
              ? <Chip tone="red" icon="alert-triangle">Detention running</Chip>
              : jobRisk && <Chip tone="red" icon="alert-triangle">Detention risk</Chip>}
            {!jobRisk && unclear && <Chip icon="help-circle">Status unclear</Chip>}
            {held && <Chip tone="amber" icon="lock">Customs hold</Chip>}
            {jobDpd && <Chip tone="teal">DPD</Chip>}
          </div>
        </header>

        {/* container switcher: one tab per box of the job */}
        {boxes.length > 1 && (
          <div className="ix-cnp-switch">
            <button type="button" className="ix-icon-btn sm" disabled={!prevBox} onClick={() => prevBox && onPick(prevBox.no)} aria-label="Previous container (←)" title="Previous container (←)"><Icon name="chevron-left" /></button>
            <div className="tabs" ref={tabsRef} role="tablist" aria-label="Containers on this job">
              {boxes.map((x) => {
                const on = x.no === c.no
                const tone = boxTone(x, j)
                return (
                  <button key={x.no} type="button" role="tab" aria-selected={on}
                    className={`ix-cnp-tab${on ? ' on' : ''}${tone === 'red' ? ' risk' : ''}${x.finishedOn ? ' done' : ''}`}
                    onClick={() => onPick(x.no)} title={`${x.no} · ${x.whereText}`}>
                    <span className={`ix-dot ${tone}`} />{x.no}
                  </button>
                )
              })}
            </div>
            <button type="button" className="ix-icon-btn sm" disabled={!nextBox} onClick={() => nextBox && onPick(nextBox.no)} aria-label="Next container (→)" title="Next container (→)"><Icon name="chevron-right" /></button>
            <span className="n">{idx + 1}/{boxes.length}</span>
          </div>
        )}

        <div className="ix-cnp-body">
          {/* the box: number, last check, refresh, where it is */}
          <section className="ix-cnp-hero">
            <div className="ix-cnp-title">
              <span className="no">{c.no}</span>
              <button type="button" className="ix-icon-btn sm" onClick={onCopy} aria-label={`Copy ${c.no}`} title="Copy container number"><Icon name="copy" /></button>
              <button type="button" className={`ix-icon-btn sm${checking ? ' spin' : ''}`} onClick={onCheck} disabled={checking}
                aria-label="Check this container now" title={checking ? 'Checking…' : "Check this container's movements now"}><Icon name="refresh" /></button>
              <button type="button" className="ix-icon-btn sm" onClick={onLineSite} aria-label="Open the shipping line's tracking page" title="Open the shipping line's tracking page"><Icon name="world" /></button>
              <span className="st">
                {c.where === 'unknown'
                  ? <span className="ix-st hollow pill">No tracking yet</span>
                  : <Status tone={whereTone(c, j)} pill>{c.whereText}</Status>}
              </span>
            </div>
            <div className="ix-cnp-seen" title={checked ? timeAgo(checked) : undefined}>
              <Icon name="clock" />{checked ? `Last refreshed ${fmtDateTime(checked)} IST` : 'Not checked yet'}
            </div>

            <div className={`ix-cnp-free ${free.tone}`}>
              <div className="top">
                <span className="k">{free.label}</span>
                <span className="big">{free.big}</span>
              </div>
              {free.pct !== null && free.pct !== undefined && (
                <div className="bar" role="presentation"><span style={{ width: `${free.pct}%` }} /></div>
              )}
              {(free.left || free.right) && (
                <div className="meta"><span>{free.left}</span>{free.right && <span>{free.right}</span>}</div>
              )}
              {free.action && <div className="act"><Icon name={free.tone === 'red' ? 'alert-triangle' : 'calendar-event'} />{free.action}</div>}
              {free.foot && <div className="foot">{free.foot}</div>}
            </div>

            {alert && (
              <div className="ix-cnp-alert"><Icon name="alert-octagon" /><span>{alert}</span></div>
            )}
            {!alert && dpd && (
              <div className="ix-cnp-alert green"><Icon name="circle-check" /><span>DPD applicable — eligible for direct port delivery</span></div>
            )}
            {held && (
              <div className="ix-cnp-alert amber"><Icon name="lock" /><span>Container under customs hold — check examination status</span></div>
            )}
          </section>

          <Block icon="map-pin" title="Location & vessel">
            <Grid items={locGrid} />
          </Block>

          <Block icon="box" title="Container">
            <Grid items={boxGrid} />
          </Block>

          <Block icon="building-warehouse" title="Port events" right="IST">
            {g.note && (
              <div className="ix-cnp-note"><Icon name="arrows-exchange" /><span><b>Moved between {gateWord}s:</b> {g.note}</span></div>
            )}
            <Grid items={portGrid} />
          </Block>

          <Block icon="history" title="Event history" right={history.length ? `${plural(history.length, 'event')} · this trip` : null} last>
            {history.length ? (
              <ol className="ix-cnp-tl">
                {history.map((m, i) => {
                  const mode = eventMode(m, rawMs)
                  return (
                    <li key={`${m.at}-${i}`} className={`${eventTone(m)}${i === 0 ? ' latest' : ''}`}>
                      <span className="dot" />
                      <div className="body">
                        <div className="l1">
                          <span className="t">{m.label || <Dash />}</span>
                          {mode && <span className="mode"><Icon name={MODE_ICON[mode]} />{mode}</span>}
                          <span className="at">{fmtDateTime(m.at)}</span>
                        </div>
                        {m.place && <div className="pl" title={m.place}>{m.place}</div>}
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <div className="ix-cnp-none">{c.tracked ? 'No movements reported for this trip yet.' : 'No movements yet. Press refresh to look this container up.'}</div>
            )}
          </Block>
        </div>
      </aside>
    </>
  )
}

// a panel section: small caps heading with a hairline running to the right
function Block({ icon, title, right, last, children }) {
  return (
    <section className={`ix-cnp-sec${last ? ' last' : ''}`}>
      <h3 className="ix-cnp-h"><span className="ic"><Icon name={icon} /></span>{title}<span className="rule" />{right && <span className="r">{right}</span>}</h3>
      {children}
    </section>
  )
}

// 2-column label / value grid; a missing value is the muted dash
function Grid({ items }) {
  return (
    <dl className="ix-cnp-grid">
      {items.map((f) => (
        <div key={f.k}>
          <dt>{f.k}</dt>
          <dd className={[f.mono && f.v && 'mono', f.muted && 'muted'].filter(Boolean).join(' ') || undefined}>
            {f.v || (f.empty ? <span className="muted">{f.empty}</span> : <Dash />)}
            {f.v && f.sub ? <small>{f.sub}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}
