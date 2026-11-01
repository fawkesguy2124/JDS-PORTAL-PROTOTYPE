// Where is each job in its journey, and what needs attention?
// Pure rules only (no database, no ULIP): the portal and the WhatsApp bot
// both use this file, so they always agree. The portal loads the data in
// src/services/journey.js; the bot loads it on the server.
import { correctTrackingRow } from './eventOrder.js'
import { lineName } from './shippingLines.js'

const DAY = 24 * 60 * 60 * 1000

export function parseContainerNos(value) {
  if (Array.isArray(value)) {
    return value
      .map(c => typeof c === 'object' ? (c.no || '') : String(c))
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length >= 4)
  }
  return (value || '')
    .split(/[\s,;/]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length >= 4)
}

// Turns loaded rows into the shape journeyFor() needs
export function buildJourneyData({ jobs = [], customs = [], results = [], containers = [] }, error = null) {
  const customsByJob = {}
  for (const row of customs) customsByJob[row.job_id] = row

  // all results per job + API, newest first
  const resultsByJob = {}
  for (const row of results) {
    const byApi = (resultsByJob[row.job_id] ||= {})
    ;(byApi[row.api] ||= []).push(row)
  }

  const containersByNo = {}
  for (const row of containers) if (row.container_no) containersByNo[row.container_no.toUpperCase()] = correctTrackingRow(row)

  return { jobs, customsByJob, resultsByJob, containersByNo, loadedAt: new Date().toISOString(), error }
}

// Whole days in India time (Jose, 31 Oct 2026: every screen must give the same
// number, so "free till 1 Nov" and "1 d left" on 31 Oct always agree). A date-only
// value ("2026-10-29") is that day in India, not UTC midnight.
const IST = 5.5 * 3600e3
const msOf = (v) => (v ? new Date(String(v).length <= 10 ? `${v}T00:00:00+05:30` : v).getTime() : NaN)
const istDayNo = (v) => { const t = typeof v === 'number' ? v : msOf(v); return isNaN(t) ? null : Math.floor((t + IST) / DAY) }
const istDateOf = (dayNo) => new Date(dayNo * DAY).toISOString().slice(0, 10)
// Whole India days from a date until today (0 = today), or null. Use it for every
// "x days ago" (BE filed, OOC, waiting) so a KPI and a row never differ.
export function daysAgo(iso, now = Date.now()) {
  const d = istDayNo(iso)
  return d === null ? null : istDayNo(now) - d
}
const daysSince = (iso) => daysAgo(iso)
// "29 Oct" ("29 Sep", never "Sept"), in India time; the year only when not this year
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabel = (iso) => {
  if (!iso) return null
  const t = msOf(iso)
  if (isNaN(t)) return String(iso)
  const d = new Date(t + IST), now = new Date(Date.now() + IST)
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${d.getUTCFullYear() !== now.getUTCFullYear() ? ` ${d.getUTCFullYear()}` : ''}`
}
// days after which a BE filed before arrival is taken as "the ship is in by now"
const ADVANCE_BE_DAYS = 10
const sameNo = (a, b) => !!a && !!b && String(a).toUpperCase().replace(/\s+/g, '') === String(b).toUpperCase().replace(/\s+/g, '')

export const isExportJob = (job) => job?.job_type === 'export'
export const isAirJob = (job) => job?.mode === 'Air'
export const isDelivered = (job) => Number(job?.stage) >= 10

// The stage a job has really reached: the saved stage, or further when the facts
// show it (BE filed, OOC, cargo out, on the road, delivered). Never lower than
// what staff saved. Shown everywhere instead of the bare saved stage, so the
// panel never says "Job Created" for a job waiting for OOC (Jose, 22 Oct 2026).
export function effectiveStage(job, j) {
  const saved = Number(job?.stage) || 0
  if (!j || isExportJob(job)) return saved
  let s = 0
  if (j.beFiled) s = 4 // Customs review
  if (j.oocDone) s = 7 // OOC
  if (j.oocDone && (j.containers?.tracked || []).some((t) => t.outWithCargo)) s = 8 // out with the cargo
  if (j.phase === 'truck') s = Math.max(s, 9) // on the road
  if (j.phase === 'delivered') s = 10
  return Math.max(saved, s)
}

// COSCO boxes sail on OOCL bills and the other way round: one group
const LINE_GROUP = { OOCL: 'COSCO' }
const lineGroup = (n) => LINE_GROUP[n] || n
const DONE_CONTAINER = ['delivered', 'empty_returned']

// Board columns, in order
export const PHASES = [
  { id: 'arrival', label: 'Awaiting arrival', hint: 'Ship or flight not arrived yet' },
  { id: 'docs', label: 'Docs & BE filing', hint: 'Preparing / filing in LiveImpex' },
  { id: 'ooc', label: 'Waiting for OOC', hint: 'BE filed, OOC not yet' },
  { id: 'release', label: 'OOC — to be moved', hint: 'OOC granted, cargo still at port/CFS' },
  { id: 'truck', label: 'On the move', hint: 'Out of port by truck or rail' },
  { id: 'delivered', label: 'Delivered', hint: 'Job complete' },
]
export const EXPORT_PHASES = [
  { id: 'sb', label: 'Shipping bill', hint: 'SB to be filed / filed' },
  { id: 'leo', label: 'Waiting for LEO', hint: 'SB filed, LEO not yet' },
  { id: 'sail', label: 'LEO — to sail', hint: 'LEO given, vessel not sailed' },
  { id: 'delivered', label: 'Shipped', hint: 'Job complete' },
]

// A container with no tracking event for this long is treated as "status unclear"
// (most likely finished but never marked), not as detention running.
export const STALE_AFTER_DAYS = 30

// Days since the container's last tracking event (port in/out, CFS in, any milestone)
export function daysSinceLastMove(row) {
  if (!row) return null
  const dates = [row.port_in, row.port_out, row.cfs_gate_in, ...(Array.isArray(row.milestones) ? row.milestones.map((m) => m?.date) : [])]
    .filter(Boolean).map((d) => new Date(d).getTime()).filter((t) => !isNaN(t))
  if (!dates.length) return null
  return Math.floor((Date.now() - Math.max(...dates)) / DAY)
}

// ── This job's trip of a container ──
// A container's tracking history can hold several trips: our import, then the
// same box going empty to a yard and out again on someone's export. The saved
// "status" only reflects the LAST event, so a reused box looked active again.
// This reads the history and finds, for THIS job:
//   portIn    – the port arrival of this job's trip
//   exitAt    – when it left the CFS / ICD / port with cargo (towards the client)
//   returnedAt– the first sign of its next life (empty back at a yard, CFS or
//               port, loaded for export, ...). From then on the job's container
//               work is over and nothing more can be owed for it.
const NAME = (m) => String(m?.description || m?.event || '').toUpperCase().trim()
const WHEN = (m) => (m?.date ? new Date(m.date).getTime() : NaN)
const ARRIVE = /^(PORT IN|PORTIN|VESSEL ARRIVED|DISCHARGE|DPD)/
const AT_CFS = /^(CFS IN|CFS GATE IN|ICD IN|ICD GATE IN)$/
const LEFT_CFS = /^(CFS OUT|CFS GATE OUT|ICD OUT|ICD GATE OUT)$/
const NEXT_LIFE = /EMPTY|^(PORT IN|PORTIN|TERMINAL IN|GATE IN|CFS IN|CFS GATE IN|ICD IN|ICD GATE IN|DPE|LOADING|LOADED|GATE CUT OFF|EXPECTED VESSEL DEPARTURE|VESSEL DEPARTED|SAILED)/
const DAYS_BEFORE_ETA = 20
// A job is opened around arrival. If a box's whole tracking history starts this
// long after that, the history is a LATER trip and ours ended before it.
const LATER_TRIP_AFTER_DAYS = 60
// CFS OUT then CFS/ICD IN this soon (or before OOC) = moved between CFSs, not delivered
const TRANSFER_WITHIN_DAYS = 3
const TRANSFER_BEFORE_OOC_DAYS = 15
// A PORT OUT is the cargo leaving (not the move to the CFS) only for a DPD box, or
// once this long has passed with no CFS / ICD IN after it (Jose, 31 Oct 2026: J-691's
// PORT OUT at 12:47 am, an LCL box on its way to the CFS, said "container out")
const PORT_OUT_SETTLE_MS = 48 * 3600e3
const PORT_OUT = /^(PORT OUT|PORTOUT)$/
const IS_DPD = /^DPD/

// when this job's trip started: the ETA, or else the day the job was opened
function tripAnchor(job) {
  const anchorIso = job?.eta ? `${String(job.eta).slice(0, 10)}T00:00:00+05:30` : job?.created_at || null
  return anchorIso ? new Date(anchorIso).getTime() : NaN
}

// Extra fields (added 31 Oct 2026; the four above keep their meaning):
//   exitFrom   – 'CFS' | 'ICD' | 'port': where the cargo left from
//   dpd        – the box is on direct port delivery this trip
//   toCfsSince – left the port in the last 48 h with no CFS IN yet: on its way to the CFS
export function containerTrip(row, job) {
  const ms = (Array.isArray(row?.milestones) ? row.milestones : [])
    .filter((m) => !isNaN(WHEN(m))).sort((x, y) => WHEN(x) - WHEN(y))
  const iso = (m) => (m ? new Date(WHEN(m)).toISOString() : null)
  const none = { portIn: row?.port_in || null, exitAt: null, returnedAt: null, how: null, exitFrom: null, dpd: false, toCfsSince: null }
  if (!ms.length) return none
  const anchor = tripAnchor(job)
  const arrivals = ms.filter((m) => ARRIVE.test(NAME(m)))
  const from = isNaN(anchor) ? -Infinity : anchor - DAYS_BEFORE_ETA * DAY
  const arrive = arrivals.find((m) => WHEN(m) >= from) || (isNaN(anchor) ? arrivals[0] : null)
  // everything on record is from a much later trip → ours finished before it
  if (!isNaN(anchor) && WHEN(ms[0]) - anchor > LATER_TRIP_AFTER_DAYS * DAY && (!arrive || WHEN(arrive) - anchor > LATER_TRIP_AFTER_DAYS * DAY)) {
    return { portIn: null, exitAt: null, returnedAt: iso(ms[0]), how: `history only shows a later trip (from ${dayLabel(iso(ms[0]))})`, laterTrip: true, exitFrom: null, dpd: false, toCfsSince: null }
  }
  if (!arrive) return none
  const after = ms.filter((m) => WHEN(m) > WHEN(arrive))
  const pastOoc = Number(job?.stage) >= 7
  // left with cargo: CFS/ICD out (skipping moves between CFSs); or straight out of
  // the port when it never went to a CFS
  let exit = null
  for (let k = 0; k < after.length; k++) {
    if (!LEFT_CFS.test(NAME(after[k]))) continue
    const nxt = after.slice(k + 1).find((m) => !/TOLL|STATION|GATE CROSSED/.test(NAME(m)))
    // before OOC a CFS-to-CFS move can take a while, but not months: a CFS IN long
    // after (e.g. 3 months) is the empty box's next life, so this was the real exit
    const gap = nxt ? WHEN(nxt) - WHEN(after[k]) : Infinity
    const isTransfer = nxt && AT_CFS.test(NAME(nxt)) && !/EMPTY/.test(NAME(nxt)) && gap <= (pastOoc ? TRANSFER_WITHIN_DAYS : TRANSFER_BEFORE_OOC_DAYS) * DAY
    if (isTransfer) continue
    exit = after[k]
    break
  }
  // straight out of the port (no CFS OUT found): DPD on this trip, or 48 h with no CFS IN
  let dpd = false, toCfs = null
  if (!exit) {
    const portOut = after.find((m) => PORT_OUT.test(NAME(m)))
    if (portOut) {
      dpd = ms.some((m) => IS_DPD.test(NAME(m)) && WHEN(m) >= WHEN(arrive) - 3 * DAY && WHEN(m) <= WHEN(portOut) + DAY)
      const cfsAfter = after.some((m) => (AT_CFS.test(NAME(m)) || LEFT_CFS.test(NAME(m))) && WHEN(m) > WHEN(portOut))
      // a DPD box that still reached a CFS within 48 h went to the CFS after all
      const cfsSoon = after.some((m) => AT_CFS.test(NAME(m)) && !/EMPTY/.test(NAME(m)) && WHEN(m) > WHEN(portOut) && WHEN(m) - WHEN(portOut) <= PORT_OUT_SETTLE_MS)
      if (dpd && !cfsSoon) exit = portOut
      // (any CFS / ICD event after it, however late, still means it went to a CFS, as before)
      else if (!cfsAfter && Date.now() - WHEN(portOut) >= PORT_OUT_SETTLE_MS) exit = portOut
      else if (!cfsAfter) toCfs = portOut
    }
  }
  // anything after leaving with cargo that starts its next life
  const next = exit ? after.find((m) => WHEN(m) > WHEN(exit) && NEXT_LIFE.test(NAME(m))) : null
  const exitFrom = !exit ? null : /^ICD/.test(NAME(exit)) ? 'ICD' : /^CFS/.test(NAME(exit)) ? 'CFS' : 'port'
  return { portIn: iso(arrive), exitAt: iso(exit), returnedAt: iso(next), how: next ? `${next.description}${next.location ? ` · ${next.location}` : ''}` : null, exitFrom, dpd, toCfsSince: iso(toCfs) }
}

// Who takes the cargo to the client's warehouse. Mostly JDS; "client" when the
// client's own transporter collects it (then JDS's part ends when it leaves the CFS).
export const deliveryBy = (job) => (job?.field_meta?.delivery_by === 'client' ? 'client' : 'jds')

// Is this container finished for this job? Returns the date it finished, or null.
export function containerFinishedOn(row, job) {
  if (!row) return null
  if (row.status === 'empty_returned') return row.last_refreshed_at || 'yes'
  const trip = containerTrip(row, job)
  if (trip.returnedAt) return trip.returnedAt
  if (trip.exitAt && deliveryBy(job) === 'client') return trip.exitAt
  return null
}

// ── Free time: THE one source (Jose, 31 Oct 2026) ──
// Today's KPI, the sidebar Detention badge, the Detention page, the jobs table and
// the job panel all read these, so they always agree.
// Free time for one container, worked out TODAY: { left, till, from } or null.
//   left – free days left (0 = last free day today, negative = detention running)
//   till – the last free day, 'YYYY-MM-DD' (India date)
//   from – 'contract' (the job's free days, from this trip's port arrival) or
//          'line' (the line's own count in the last tracking snapshot)
// null = not known, no movement for 30+ days (status unclear), or the container's
// work for this job is over. Detention runs from this job's port arrival until the
// empty is back.
export function freeTimeFor(job, row, now = Date.now()) {
  if (!row || containerFinishedOn(row, job)) return null
  // a box that left the CFS / port with cargo is no longer the portal's to count: the
  // empty's return is JDS's own business (Jose, 31 Oct 2026)
  if (containerTrip(row, job).exitAt) return null
  const moved = daysSinceLastMove(row)
  if (moved !== null && moved > STALE_AFTER_DAYS) return null
  const today = istDayNo(now)
  const contract = Number(job?.free_days)
  const portInDay = istDayNo(containerTrip(row, job).portIn || row.port_in)
  if (Number.isFinite(contract) && contract > 0 && portInDay !== null) {
    const till = portInDay + contract
    return { left: till - today, till: istDateOf(till), from: 'contract' }
  }
  if (row.free_days === null || row.free_days === undefined || row.free_days === '' || !Number.isFinite(Number(row.free_days))) return null
  const snapshotAge = row.last_refreshed_at ? today - istDayNo(row.last_refreshed_at) : 0
  const left = Number(row.free_days) - snapshotAge
  return { left, till: istDateOf(today + left), from: 'line' }
}

// Free days left for one container (the number only; see freeTimeFor)
export function freeDaysLeftFor(job, row) {
  return freeTimeFor(job, row)?.left ?? null
}

// How bad a free-days number is: 'over' (detention running), 'risk' (0-2 left:
// act today), 'soon' (3-5 left), 'ok', or null when not known
export function detentionLevel(left) {
  if (left === null || left === undefined || !Number.isFinite(Number(left))) return null
  if (left < 0) return 'over'
  if (left <= 2) return 'risk'
  if (left <= 5) return 'soon'
  return 'ok'
}
// A job at detention risk: 2 free days or fewer, or detention already running.
// Takes the journey (j) of an active job.
export const isDetentionRisk = (j) => j?.freeDaysLeft !== null && j?.freeDaysLeft !== undefined && j.freeDaysLeft <= 2

// Free time of one job = the container still in play that runs out first.
// { left, till, containerNo, boxes: [{ no, left, till, from }] } (left/till null when not known)
export function jobFreeTime(job, data) {
  if (isExportJob(job) || isDelivered(job)) return { left: null, till: null, containerNo: null, boxes: [] }
  const boxes = []
  for (const no of parseContainerNos(job?.containers)) {
    const ft = freeTimeFor(job, data?.containersByNo?.[no])
    if (ft) boxes.push({ no, ...ft })
  }
  const first = boxes.slice().sort((a, b) => a.left - b.left)[0] || null
  return { left: first ? first.left : null, till: first?.till || null, containerNo: first?.no || null, boxes }
}

// Every truck on a job. A big job can need several trucks after OOC (often one
// per container). Saved in jobs.trucks [{ no, container, dl, at, by }]; jobs saved
// before that only have truck_no, which is also kept = the first truck.
export const plateNo = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export function jobTrucks(job) {
  const list = (Array.isArray(job?.trucks) ? job.trucks : []).filter((t) => t?.no).map((t) => ({ ...t, no: plateNo(t.no) }))
  const first = plateNo(job?.truck_no)
  if (first && !list.some((t) => t.no === first)) list.unshift({ no: first, dl: job?.ulip_refs?.dl_no || null })
  return list
}
export const truckNos = (job) => jobTrucks(job).map((t) => t.no)

// How the cargo leaves the port / CFS / ICD on this trip, read from LDB (Jose, 31 Oct
// 2026). Checked against every box JDS has tracked:
//   • STATION CROSSED (a railway station or division) = rail, whatever LDB's
//     transport label says (it says TRUCK on most of them)
//   • TOLL PLAZA CROSSED / GATE CROSSED = road
//   • ICD IN / ICD OUT is NOT rail: JDS's ICD is mostly Dronagiri Rail Terminal, used
//     like a CFS, and the box then leaves by road through the toll plazas
// Each departure (PORT OUT, CFS OUT, ICD OUT, GATE OUT, TERMINAL OUT) starts a leg; the
// leg's first movement says rail or road, until the box reaches its next stop.
// The leg that counts is the one that took the cargo out (exitAt); before that, a leg
// by rail straight from the port (to an inland ICD) also counts.
// Returns { mode: 'rail' | 'truck', at, place } of the newest movement, or null.
const DEPART = /^(PORT OUT|PORTOUT|CFS OUT|CFS GATE OUT|ICD OUT|ICD GATE OUT|GATE OUT|TERMINAL OUT)$/
const STOP = /^(PORT IN|PORTIN|CFS IN|CFS GATE IN|ICD IN|ICD GATE IN|GATE IN|TERMINAL IN)$|EMPTY/
const ON_RAIL = /^STATION CROSSED$/
const ON_ROAD = /^(TOLL PLAZA CROSSED|GATE CROSSED)$/
export function onwardMove(row, job) {
  const trip = containerTrip(row, job)
  if (!trip.portIn || trip.laterTrip) return null
  const from = new Date(trip.portIn).getTime()
  const until = trip.returnedAt ? new Date(trip.returnedAt).getTime() : Infinity
  const ms = (Array.isArray(row?.milestones) ? row.milestones : [])
    .filter((m) => !isNaN(WHEN(m)) && WHEN(m) > from && WHEN(m) < until)
    .sort((a, b) => WHEN(a) - WHEN(b))
  const exitAt = trip.exitAt ? new Date(trip.exitAt).getTime() : null
  let found = null
  for (let k = 0; k < ms.length; k++) {
    if (!DEPART.test(NAME(ms[k]))) continue
    const leg = []
    for (const m of ms.slice(k + 1)) { if (STOP.test(NAME(m))) break; leg.push(m) }
    const moves = leg.filter((m) => ON_RAIL.test(NAME(m)) || ON_ROAD.test(NAME(m)))
    if (!moves.length) continue
    const mode = ON_RAIL.test(NAME(moves[0])) ? 'rail' : 'truck'
    const isExitLeg = exitAt !== null && WHEN(ms[k]) >= exitAt
    if (!isExitLeg && mode !== 'rail') continue
    const last = moves.at(-1)
    found = { mode, at: new Date(WHEN(last)).toISOString(), place: String(last.location || '').split(',')[0].replace(/^[^/]*\//, '').trim() || null }
  }
  return found
}

// How the cargo leaves after OOC: not always a truck. Staff can set it on the job
// (field_meta.onward_mode = 'truck' | 'rail'); otherwise this trip's LDB movement
// (onwardMove) says it, and a truck number means truck. null = not decided yet.
export function onwardMode(job, rows = []) {
  const set = job?.field_meta?.onward_mode
  if (set === 'truck' || set === 'rail') return set
  const moves = rows.map((t) => onwardMove(t, job)).filter(Boolean)
  if (moves.some((m) => m.mode === 'rail') || rows.some((t) => t?.status === 'on_rail')) return 'rail'
  if (moves.length || truckNos(job).length) return 'truck'
  return null
}

// Container facts for a job (containers still in play only)
function containerFacts(job, data) {
  const nos = parseContainerNos(job.containers)
  const all = nos.map((n) => data.containersByNo[n]).filter(Boolean)
  const finished = all.map((t) => ({ no: t.container_no, on: containerFinishedOn(t, job) })).filter((f) => f.on)
  const isFinished = (t) => finished.some((f) => f.no === t.container_no)
  const tracked = all
    .filter((t) => !isFinished(t))
    .map((t) => {
      const lastMove = daysSinceLastMove(t)
      const trip = containerTrip(t, job)
      const ft = freeTimeFor(job, t)
      return { ...t, trip, outWithCargo: !!trip.exitAt, freeLeft: ft ? ft.left : null, freeTill: ft?.till || null, lastMoveDays: lastMove, stale: lastMove !== null && lastMove > STALE_AFTER_DAYS }
    })
  const allStale = tracked.length > 0 && tracked.every((t) => t.stale)
  const staleDays = allStale ? Math.min(...tracked.map((t) => t.lastMoveDays)) : null
  const lefts = tracked.map((t) => t.freeLeft).filter((v) => v !== null)
  const minFree = lefts.length ? Math.min(...lefts) : null
  // the box that runs out first, and its last free day (same pick as jobFreeTime)
  const freeBox = minFree === null ? null : tracked.find((t) => t.freeLeft === minFree)
  // (kept as before for the rail rule: a PORT OUT counts here, even the move to the CFS)
  const anyOut = all.some((t) => t.port_out || DONE_CONTAINER.includes(t.status) || isFinished(t) || containerTrip(t, job).exitAt)
  // Every box of the job left the CFS / ICD (or the port, for DPD) loaded on this trip,
  // or is finished: the onward move has happened (Jose, 31 Oct 2026: J-652 said both
  // boxes left the CFS, yet "arrange truck or rail"). Needs every box tracked.
  const noTrip = (t) => !(Array.isArray(t.milestones) && t.milestones.length)
  const outRows = all.filter((t) => containerTrip(t, job).exitAt || isFinished(t) || (noTrip(t) && DONE_CONTAINER.includes(t.status)))
  const allOut = nos.length > 0 && all.length >= new Set(nos).size && outRows.length === all.length
  const exits = all.map((t) => ({ at: containerTrip(t, job).exitAt, from: containerTrip(t, job).exitFrom })).filter((x) => x.at).sort((a, b) => a.at.localeCompare(b.at))
  const lastExit = exits.at(-1) || null
  // every container of the job is back (or, for client-collected jobs, has left the CFS)
  const allDelivered = all.length > 0 && all.every((t) => isFinished(t) || t.status === 'empty_returned')
  const finishedOn = allDelivered ? finished.map((f) => f.on).filter((d) => d !== 'yes').sort().at(-1) || null : null
  const portIn = all.map((t) => containerTrip(t, job).portIn || t.port_in).filter(Boolean).sort()[0] || null
  return {
    nos, all, tracked, minFree, anyOut, allDelivered, finishedOn, portIn, allStale, staleDays,
    freeTill: freeBox?.freeTill || null, freeBox: freeBox?.container_no || null,
    allOut, outCount: outRows.length, lastExitAt: lastExit?.at || null, exitFrom: lastExit?.from || null,
  }
}

// Customs stages after the BE (Jose, 25 Oct 2026). ICEGATE through ULIP only gives the
// OOC, so staff set the stage they see in LiveImpex with one tap (portal or WhatsApp):
// RMS facilitated, or AO → (query) → AC → assessed; then duty paid → (examination) → OOC.
// Saved on the job as field_meta.be_stage { stage, be_no, at, by, note }; it only counts
// for the BE it was set on.
export const BE_STAGES = [
  { id: 'rms', label: 'RMS facilitated', short: 'RMS cleared', next: 'Next: pay the duty', tone: 'blue' },
  { id: 'ao', label: 'With appraising officer (AO)', short: 'With AO', next: 'With the appraising officer', tone: 'blue' },
  { id: 'query', label: 'Query raised', short: 'Query raised', next: 'Next: reply to the customs query', tone: 'red' },
  { id: 'ac', label: 'With assistant commissioner (AC)', short: 'With AC', next: 'With the assistant commissioner', tone: 'blue' },
  { id: 'assessed', label: 'Assessed: pay duty', short: 'Assessed', next: 'Next: pay the duty', tone: 'amber' },
  { id: 'duty_paid', label: 'Duty paid', short: 'Duty paid', next: 'Duty paid: waiting for OOC', tone: 'green' },
  { id: 'exam', label: 'Examination', short: 'Examination', next: 'Next: examination of the goods', tone: 'amber' },
]
export function beStageOf(job) {
  const s = job?.field_meta?.be_stage
  const def = s && BE_STAGES.find((x) => x.id === s.stage)
  if (!def) return null
  // set on an earlier BE (a new BE was filed since): does not count
  if (s.be_no && job?.be_no && String(s.be_no).trim() !== String(job.be_no).trim()) return null
  return { ...def, at: s.at || null, by: s.by || null, note: s.note || null }
}

// What staff see as the next thing to happen, for the step that is "current"
const NEXT_TEXT = {
  arrival: 'Waiting for arrival',
  be: 'Next: file the BE in LiveImpex',
  ooc: 'Waiting for OOC',
  out: 'Next: get the container out',
  truck: 'Next: arrange truck or rail',
  delivered: 'Next: deliver and close the job',
  sb: 'Next: file the shipping bill in LiveImpex',
  leo: 'Waiting for LEO',
  egm: 'Waiting for the vessel to sail',
}
const markCurrent = (steps) => {
  const current = steps.find((st) => !st.done)
  if (current) { current.current = true; current.nextText = NEXT_TEXT[current.id] || current.label }
}

// Saved results for one API, newest first (pages may also store a single row)
const listOf = (results, api) => [].concat(results?.[api] || []).filter(Boolean)

// Newest saved result for an API that was made for this exact value
function resultFor(results, apis, key, value) {
  for (const api of apis) {
    const row = listOf(results, api).find((r) => !key || sameNo(r.params?.[key], value))
    if (row) return row
  }
  return null
}

// The journey of one job: steps (for the strip on screens), the board phase,
// and the things that need attention (for Today and the job card).
export function journeyFor(job, data) {
  const results = data.resultsByJob[job.id] || {}
  if (isExportJob(job)) return exportJourney(job, results)

  const csRaw = data.customsByJob[job.id] || null
  // the saved customs answer only counts for the job's CURRENT BE
  const cs = csRaw && csRaw.checked_at && sameNo(csRaw.be_no, job.be_no) ? csRaw : null
  const c = containerFacts(job, data)
  const stage = Number(job.stage) || 0
  const delivered = isDelivered(job) || c.allDelivered

  const oocDate = cs?.ooc_date || null
  // a container that left the port / CFS with cargo on this trip had its OOC, even if
  // the ICEGATE check never saw it (Jose, 25 Oct 2026: a later fact retires the
  // earlier wait)
  const leftWithCargo = c.all.some((t) => containerTrip(t, job).exitAt)
  const oocDone = !!oocDate || stage >= 7 || leftWithCargo
  const beFiled = !!(job.be_no && job.be_date)
  const beStage = beFiled && !oocDone ? beStageOf(job) : null
  // every truck on the job, each with its own saved FASTag and papers answers
  const trucks = jobTrucks(job).map((t) => {
    const fastag = resultFor(results, ['FASTAG/01'], 'vehiclenumber', t.no)
    const papers = resultFor(results, ['VAHAN/04', 'VAHAN/01'], 'vehiclenumber', t.no)
    const plaza = fastag?.parsed?.extra?.lastPlaza || null
    return {
      ...t,
      location: plaza ? { plaza, at: fastag.parsed.extra.lastSeenAt, checkedAt: fastag.checked_at } : null,
      papers: papers ? { found: !!papers.parsed?.found, tone: papers.parsed?.tone, summary: papers.summary, checkedAt: papers.checked_at } : null,
    }
  })
  const truck = trucks[0]?.no || null
  const vessel = resultFor(results, ['JNPT/01', 'MBPT/01', 'IPORTMAN/01'])
  // the ship tracking saw the ship reach the port; an air waybill in Customs' air
  // manifest (ICEGATE/09) means the flight is in
  // (a tracking row for an older voyage does not count: J-673, opened in October, said
  // "Ship arrived 9 Aug"; Jose, 31 Oct 2026)
  const sea = isOldVoyage(data.seaByJob?.[job.id], job) ? null : data.seaByJob?.[job.id]
  // (the line's dates for an Indian port are port time saved as UTC: 5½ h earlier for real)
  const seaAt = sea && !sea.error && sea.pod_actual && sea.pod_date
    ? (/,\s*IN$/i.test(String(sea.pod || '')) ? new Date(new Date(sea.pod_date).getTime() - 5.5 * 3600e3).toISOString() : sea.pod_date)
    : null
  const airIgm = isAirJob(job) ? (results['ICEGATE/09'] || []).find((r) => r.found) : null
  const ata = vessel?.parsed?.extra?.ata || seaAt || null
  const arrived = !!(ata || c.portIn || airIgm || stage >= 3)
  const mode = onwardMode(job, c.all)
  // LDB already shows the cargo moving (newest movement of any box on this trip): no
  // "arrange a truck" while it is on the road or on rail (Jose, 31 Oct 2026: J-644 was
  // past the Khalapur toll and still said "assign a truck")
  const moved = c.all.map((t) => onwardMove(t, job)).filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null
  const railMoving = mode === 'rail' && (c.anyOut || moved?.mode === 'rail')
  const roadMoving = !railMoving && moved?.mode === 'truck'
  const movedText = moved ? `${moved.mode === 'rail' ? 'On rail' : 'On the road'}${moved.place ? ` · ${moved.place}` : ''}` : null
  // every box left the CFS / ICD / port loaded on this trip: the onward move happened
  const allLeft = oocDone && c.allOut
  const leftText = c.lastExitAt ? `Left ${c.exitFrom || 'CFS'}` : null
  // where the job's boxes are while not all out ("At CFS since 19 Oct", "1 of 2 out")
  const firstWhere = c.tracked.length ? containerWhere(c.tracked.find((t) => !t.trip.exitAt) || c.tracked[0], job) : null
  const outSub = c.allOut
    ? (c.all.length > 1 ? `${c.all.length} boxes left${c.exitFrom ? ` the ${c.exitFrom}` : ''}` : leftText)
    : c.outCount > 0 ? `${c.outCount} of ${c.all.length} out${firstWhere ? ` · ${firstWhere.label}${firstWhere.since ? ` since ${dayLabel(firstWhere.since)}` : ''}` : ''}`
      : firstWhere ? `${firstWhere.label}${firstWhere.since && ['cfs', 'port', 'to_cfs'].includes(firstWhere.code) ? ` since ${dayLabel(firstWhere.since)}` : ''}` : null

  // ── Cargo delivered (Jose, 31 Oct 2026) ──
  // 24 hours after the cargo was loaded for the client the job shows as delivered, also
  // when nobody added a truck number. Loaded = every box left the CFS / ICD / port with
  // cargo on this trip (container tracking), or trucks were put on the job for all its
  // boxes (or the job has no tracked box). Rail moves take days: not counted. Once the
  // cargo is loaded, the empty's return is JDS's own business (Jose, 31 Oct 2026): the
  // job is then simply finished, with no free days or detention to watch.
  const truckAts = trucks.map((t) => t.at).filter(Boolean).sort()
  const truckCovered = trucks.length > 0 && (c.all.length === 0 || trucks.length >= c.nos.length
    || c.nos.every((no) => trucks.some((t) => String(t.container || '').toUpperCase() === no)))
  const loadedAt = c.allOut ? c.lastExitAt : truckCovered ? truckAts.at(-1) || null : null
  const cargoDelivered = !delivered && oocDone && mode !== 'rail' && !railMoving && !!loadedAt
    && Date.now() - new Date(loadedAt).getTime() >= DAY

  const steps = [
    arrived
      ? { id: 'arrival', label: isAirJob(job) ? 'Flight arrived' : 'Ship arrived', done: true, when: dayLabel(ata || c.portIn), sub: null }
      : { id: 'arrival', label: isAirJob(job) ? 'Flight due' : 'Ship due', done: false, when: null, sub: job.eta ? `ETA ${dayLabel(job.eta)}` : beFiled ? 'Not arrived yet' : null },
    // a BE is often filed before the ship comes in (advance BE): say so, so the strip
    // does not look like it contradicts itself (Jose, 24 Oct 2026: J-689)
    // a container that left with cargo had its BE filed, even if the number is not in the portal
    { id: 'be', label: 'BE filed', done: beFiled || leftWithCargo, when: dayLabel(job.be_date), sub: beFiled ? (arrived ? `BE ${job.be_no}` : 'Before arrival') : leftWithCargo ? 'BE number not in the portal' : 'In LiveImpex' },
    { id: 'ooc', label: 'OOC', done: oocDone, when: dayLabel(oocDate), sub: oocDate ? (cs.ooc_no ? `OOC ${cs.ooc_no}` : null) : oocDone ? (stage < 7 && leftWithCargo ? 'Container left with cargo' : 'Recorded by staff') : beFiled ? (beStage?.short || 'Waiting') : null },
    // done only when the boxes left the CFS / port WITH cargo, not on the port-to-CFS
    // move (audit 31 Oct 2026: J-652 ticked "Container out" while still at the CFS)
    { id: 'out', label: isAirJob(job) ? 'Cargo out' : 'Container out', done: c.allOut || stage >= 9, when: c.allOut ? dayLabel(c.lastExitAt) : null, sub: outSub || c.tracked[0]?.status_text || null },
    { id: 'truck', label: mode === 'rail' ? 'Rail' : mode === 'truck' ? 'Truck' : 'Truck / rail', done: oocDone && (!!truck || railMoving || roadMoving || allLeft), when: moved ? dayLabel(moved.at) : allLeft ? dayLabel(c.lastExitAt) : null,
      sub: truck ? (trucks.length > 1 ? `${trucks.length} trucks` : truck) : movedText || (allLeft ? leftText : mode === 'rail' ? 'Going by rail' : oocDone ? 'Not arranged yet' : null) },
    { id: 'delivered', label: 'Delivered', done: delivered || cargoDelivered,
      when: !isDelivered(job) && c.finishedOn ? dayLabel(c.finishedOn) : cargoDelivered ? dayLabel(loadedAt) : null,
      sub: !isDelivered(job) && c.allDelivered ? (deliveryBy(job) === 'client' ? 'Collected by client' : 'Empty container back')
        : cargoDelivered && deliveryBy(job) === 'client' ? 'Collected by client' : null },
  ]
  // delivered = the whole job is over: every step counts as done, nothing is "next"
  // (Jose, 25 Oct 2026: old delivered jobs with no BE saved said "Next: file the BE")
  if (delivered || cargoDelivered) for (const s of steps) { if (!s.done) { s.done = true; s.sub = null } }
  markCurrent(steps)
  const moveStep = steps.find((s) => s.id === 'truck')
  const moveText = mode === 'rail' ? 'Next: send the container by rail' : mode === 'truck' ? 'Next: assign a truck' : 'Next: arrange truck or rail'
  if (moveStep?.current) moveStep.nextText = moveText
  // boxes still at the CFS after OOC with no truck yet: getting them out IS arranging the move
  const outStep = steps.find((s) => s.id === 'out')
  if (outStep?.current && oocDone && !moveStep?.done) outStep.nextText = moveText
  // all out, JDS delivers: the empty must come back too (detention runs till then)
  const delStep = steps.find((s) => s.id === 'delivered')
  if (delStep?.current && deliveryBy(job) === 'jds' && c.all.length) delStep.nextText = 'Next: deliver to the warehouse' // (the empty's return is JDS's own business, not the portal's; Jose, 31 Oct 2026)
  const oocStep = steps.find((s) => s.id === 'ooc')
  if (oocStep?.current && beStage) oocStep.nextText = beStage.next

  let phase = 'arrival'
  if (delivered || cargoDelivered) phase = 'delivered'
  else if ((truck && oocDone) || ((railMoving || roadMoving || allLeft) && oocDone) || stage >= 9) phase = 'truck'
  else if (oocDone) phase = 'release'
  // a BE filed before the ship came in waits for the ship first, not for OOC.
  // LCL boxes are often not tracked, so a BE filed 10+ days ago counts as arrived.
  else if (beFiled && (arrived || daysSince(job.be_date) >= ADVANCE_BE_DAYS)) phase = 'ooc'
  else if (beFiled) phase = 'arrival'
  else if (arrived || stage >= 1) phase = 'docs'

  // OOC done and the onward move not arranged yet (rail jobs don't wait for a truck)
  // (nor jobs whose boxes have all left the CFS loaded: the move has happened)
  const readyForTruck = !delivered && !cargoDelivered && oocDone && !truck && mode !== 'rail' && !roadMoving && !allLeft

  // ── Saved job details that container tracking (LDB) contradicts ──
  const mismatches = []
  const jobLine = displayLine(job.shipping_line)
  const ldbLines = [...new Set(c.tracked.map((t) => displayLine(t.shipping_line_ldb)).filter(Boolean))]
  if (jobLine && ldbLines.length === 1 && lineGroup(ldbLines[0]) !== lineGroup(jobLine)) mismatches.push({ field: 'Shipping line', job: jobLine, tracking: ldbLines[0] })

  // ── What needs attention ──
  const attention = []
  const add = (level, text, action) => attention.push({ level, text, action, jobId: job.id, jobNo: job.job_no, client: job.client })
  if (!delivered && !cargoDelivered) {
    const late = c.tracked.filter((t) => t.freeLeft !== null && t.freeLeft === c.minFree)
    const outLate = late.length > 0 && late.every((t) => t.outWithCargo)
    if (c.minFree !== null && c.minFree < 0) add('red', `Detention running — ${-c.minFree} day${c.minFree === -1 ? '' : 's'} over free time${outLate ? ' (delivered, empty not back yet)' : ''}`, 'containers')
    else if (c.minFree !== null && c.minFree <= 2) add('red', c.minFree === 0 ? 'Last free day today' : `Only ${c.minFree} free day${c.minFree === 1 ? '' : 's'} left`, 'containers')
    else if (c.minFree !== null && c.minFree <= 5) add('amber', `${c.minFree} free days left`, 'containers')
    // (no "move the job to the OOC stage" reminder: the customs check moves it by itself)
    if (readyForTruck) add('amber', mode === 'truck' ? 'OOC done — no truck assigned yet' : 'OOC done — arrange truck or rail', 'truck')
    // on the road by LDB, but the portal has no truck number (for live truck tracking)
    if (roadMoving && !truck) add('info', `${movedText}${moved.at ? ` (${dayLabel(moved.at)})` : ''} — add the truck number to follow it live`, 'truck')
    // left the CFS loaded in the last few days, no truck number and no toll seen yet
    else if (allLeft && !truck && !moved && mode !== 'rail' && deliveryBy(job) === 'jds' && daysSince(c.lastExitAt) !== null && daysSince(c.lastExitAt) <= TRUCK_WATCH_DAYS) {
      add('info', `${leftText} ${dayLabel(c.lastExitAt)} — add the truck number to follow it live`, 'truck')
    }
    if (beFiled && !oocDone && phase === 'ooc') {
      const filedDays = daysSince(job.be_date)
      const inStage = beStage?.at ? daysSince(beStage.at) : null
      // the customs stage staff set says more than "OOC not yet" (Jose, 25 Oct 2026)
      if (beStage?.id === 'query') add('red', `Customs query raised${inStage ? ` ${inStage} day${inStage === 1 ? '' : 's'} ago` : ''} — reply needed`, 'customs')
      else if (beStage?.id === 'assessed') add('amber', `BE assessed${inStage ? ` ${inStage} day${inStage === 1 ? '' : 's'} ago` : ''} — pay the duty`, 'customs')
      else if (beStage?.id === 'exam') add('amber', 'Examination of the goods pending', 'customs')
      else if (beStage && ['ao', 'ac'].includes(beStage.id) && inStage !== null && inStage >= 2) add('amber', `${beStage.short} for ${inStage} days — follow up`, 'customs')
      else if (filedDays !== null && filedDays >= 3) add('amber', `BE filed ${filedDays} days ago — ${beStage ? beStage.short.toLowerCase() : 'OOC not yet'}`, 'customs')
    }
    for (const t of trucks) if (t.papers?.found && t.papers.tone === 'bad') add('red', `Truck ${t.no} papers problem: ${t.papers.summary}`, 'truck')
    if (job.detention_risk === 'high') add('red', 'Marked as high detention risk', 'containers')
    if (c.allStale) add('info', `No container movement for ${c.staleDays} days — is this job finished? If so, mark it delivered.`, 'details')
    for (const m of mismatches) add('info', `Check the ${m.field.toLowerCase()}: the job says ${m.job}, container tracking says ${m.tracking}`, 'details')
  }

  // the newest toll crossing of any of the job's trucks
  const seen = trucks.filter((t) => t.location).sort((a, b) => String(b.location.at || '').localeCompare(String(a.location.at || '')))
  return {
    steps, phase, attention, beStage,
    oocDate, oocDone, beFiled, truck, trucks, readyForTruck, onwardMode: mode, onwardMove: moved,
    // delivered by inference 24 h after loading (Jose, 31 Oct 2026)
    cargoDelivered, deliveredAt: cargoDelivered ? loadedAt : null,
    arrivedAt: ata || c.portIn || null,
    // a finished job has no free days to count down (Jose, 25 Oct 2026)
    freeDaysLeft: delivered || cargoDelivered ? null : c.minFree,
    // the last free day ('YYYY-MM-DD') and the box it belongs to (same pick as jobFreeTime)
    freeTill: delivered || cargoDelivered ? null : c.freeTill,
    freeBox: delivered || cargoDelivered ? null : c.freeBox,
    // every box left the CFS / port loaded on this trip, and when the last one did
    allLeft, leftAt: c.lastExitAt,
    containers: c,
    truckLocation: seen[0] ? { ...seen[0].location, truck: seen[0].no } : null,
    truckPapers: trucks[0]?.papers || null,
    customs: cs,
    mismatches,
  }
}

function exportJourney(job, results) {
  const refs = job.ulip_refs || {}
  const sbNo = refs.sb_no || null
  const delivered = isDelivered(job)
  // LEO from any source that has a date, for this shipping bill
  const leoSources = ['ICEGATE/06', 'PCS/03', 'JNPT/03', 'ICEGATE/05', 'MBPT/03', 'IPORTMAN/03', 'ICEGATE/12']
  const leoRow = sbNo
    ? leoSources.flatMap((api) => listOf(results, api))
      .filter((r) => Object.values(r.params || {}).some((v) => sameNo(v, sbNo)))
      .find((r) => r.parsed?.extra?.leoDate)
    : null
  const leoDate = leoRow?.parsed?.extra?.leoDate || null
  const egmNo = refs.egm_no || null
  const trucks = jobTrucks(job).map((t) => ({ ...t, location: null, papers: null }))
  const truck = trucks[0]?.no || null

  const steps = [
    { id: 'sb', label: 'Shipping bill', done: !!sbNo, when: dayLabel(refs.sb_date), sub: sbNo ? `SB ${sbNo}` : 'In LiveImpex' },
    { id: 'leo', label: 'LEO', done: !!leoDate, when: dayLabel(leoDate), sub: sbNo && !leoDate ? 'Waiting' : null },
    { id: 'egm', label: 'EGM / sailed', done: !!egmNo, when: dayLabel(refs.egm_date), sub: egmNo ? `EGM ${egmNo}` : null },
    { id: 'delivered', label: 'Done', done: delivered, when: null, sub: null },
  ]
  markCurrent(steps)

  let phase = 'sb'
  if (delivered) phase = 'delivered'
  else if (leoDate) phase = 'sail'
  else if (sbNo) phase = 'leo'

  const attention = []
  const add = (level, text, action) => attention.push({ level, text, action, jobId: job.id, jobNo: job.job_no, client: job.client })
  if (!delivered && sbNo && !leoDate) {
    const d = daysSince(refs.sb_date)
    if (d !== null && d >= 2) add('amber', `Shipping bill filed ${d} days ago — LEO not yet`, isAirJob(job) ? 'air' : 'export')
  }
  return {
    steps, phase, attention, sbNo, leoDate, egmNo, truck, trucks,
    readyForTruck: false, oocDone: false, freeDaysLeft: null, freeTill: null, freeBox: null, allLeft: false, leftAt: null,
    customs: null, containers: { nos: [], tracked: [] },
    truckLocation: null, truckPapers: null,
  }
}

// All attention items across jobs, most urgent first
export function attentionList(data) {
  const order = { red: 0, amber: 1, info: 2 }
  return data.jobs
    .flatMap((job) => journeyFor(job, data).attention)
    .sort((a, b) => order[a.level] - order[b.level] || String(b.jobNo).localeCompare(String(a.jobNo)))
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared facts for every screen (Jose, 31 Oct 2026: "one number, one source").
// The audit found Today, the sidebar, Detention, Clients, Trucks and Containers
// each counting the same thing their own way. Pages read these instead.
// src/services/JOURNEY_FACTS.md lists which screen uses which.
// ─────────────────────────────────────────────────────────────────────────────

// An open job: not delivered by stage, and the journey does not say finished.
// The same set as the sidebar's "All jobs" count. r = { job, j }.
export const isActiveRow = (r) => !!r?.job && !isDelivered(r.job) && r.j?.phase !== 'delivered'
export const activeRows = (rows = []) => rows.filter(isActiveRow)

// ── Ship tracking for an older voyage ──
// A tracking row whose arrival (or ETA) is more than 30 days before the job was
// opened is about an earlier voyage, not this job's cargo (J-673, opened in
// October, said "Ship arrived 9 Aug"). Ignore it for arrival and ship cards.
export const OLD_VOYAGE_DAYS = 30
export function isOldVoyage(sea, job) {
  if (!sea || !sea.pod_date || !job?.created_at) return false
  const opened = new Date(job.created_at).getTime()
  const at = new Date(sea.pod_date).getTime()
  return !isNaN(opened) && !isNaN(at) && opened - at > OLD_VOYAGE_DAYS * DAY
}
// sea_tracking rows → { job_id: row }, without older-voyage rows
export function buildSeaByJob(rows = [], jobs = []) {
  const byId = {}
  for (const j of jobs || []) byId[j.id] = j
  const out = {}
  for (const r of rows || []) if (r && r.job_id != null && !isOldVoyage(r, byId[r.job_id])) out[r.job_id] = r
  return out
}

// ── Shipping line names for display ──
// lineName() plus the names it does not know yet, and tidy capitals: "evergreen" →
// "Evergreen", "HUNGA A LINE" → "Heung-A Line" (audit 31 Oct 2026)
const LINE_ALIASES = [[/HEUNG ?-?A\b|HUNGA ?-?A\b/, 'Heung-A Line'], [/SINOKOR/, 'Sinokor']]
const LINE_CAPS = new Set(['MSC', 'ONE', 'CMA CGM', 'COSCO', 'OOCL', 'HMM', 'ZIM', 'RCL', 'PIL', 'KMTC', 'SITC', 'SNL', 'TS Line'])
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, ch) => a + ch.toUpperCase())
export function displayLine(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, ' ').trim()
  if (!s) return null
  const alias = LINE_ALIASES.find(([re]) => re.test(s))
  if (alias) return alias[1]
  const n = lineName(raw)
  if (!n || LINE_CAPS.has(n)) return n
  // an unknown name typed all in capitals or all in small letters: title case it
  return n === n.toUpperCase() || n === n.toLowerCase() ? titleCase(n) : n
}

// ── Container events in plain words (no system words on screen) ──
const EVENT_WORDS = [
  [/EMPTY/, 'Empty returned'],
  [/^(PORT IN|PORTIN)$/, 'Arrived at port'], [/^VESSEL ARRIVED/, 'Ship arrived'], [/^DISCHARGE/, 'Unloaded from ship'],
  [/^DPD/, 'Direct port delivery'], [/^(PORT OUT|PORTOUT)$/, 'Left port'],
  [/^(CFS IN|CFS GATE IN)$/, 'At CFS'], [/^(CFS OUT|CFS GATE OUT)$/, 'Left CFS'],
  [/^(ICD IN|ICD GATE IN)$/, 'At ICD'], [/^(ICD OUT|ICD GATE OUT)$/, 'Left ICD'],
  [/^TOLL PLAZA CROSSED$/, 'On road (toll)'], [/^GATE CROSSED$/, 'On road (gate)'], [/^STATION CROSSED$/, 'On rail (station)'],
  [/^TERMINAL IN$/, 'Terminal gate in'], [/^TERMINAL OUT$/, 'Terminal gate out'], [/^GATE IN$/, 'Gate in'], [/^GATE OUT$/, 'Gate out'],
  [/^DPE/, 'Direct port entry'], [/^(LOADING|LOADED)/, 'Loaded on ship'], [/^(VESSEL DEPARTED|SAILED)/, 'Ship sailed'],
]
export function eventLabel(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, ' ').trim()
  if (!s) return null
  const hit = EVENT_WORDS.find(([re]) => re.test(s))
  if (hit) return hit[1]
  const t = s.toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}
// "KHALAPUR TOLL PLAZA, MAHARASHTRA" → "KHALAPUR TOLL PLAZA" (as onwardMove does)
const shortPlace = (loc) => String(loc || '').split(',')[0].replace(/^[^/]*\//, '').trim() || null

// This trip's raw events of one container, oldest first: from its port arrival to
// the empty coming back
function tripEvents(row, job, trip) {
  if (!row || trip.laterTrip) return []
  const ms = (Array.isArray(row.milestones) ? row.milestones : []).filter((m) => !isNaN(WHEN(m))).sort((x, y) => WHEN(x) - WHEN(y))
  const anchor = tripAnchor(job)
  const from = trip.portIn ? new Date(trip.portIn).getTime() : isNaN(anchor) ? -Infinity : anchor - DAYS_BEFORE_ETA * DAY
  const until = trip.returnedAt ? new Date(trip.returnedAt).getTime() : Infinity
  return ms.filter((m) => WHEN(m) >= from && WHEN(m) <= until)
}
// This trip's events in plain words: [{ label, raw, at, place }], oldest first
export function tripMilestones(row, job) {
  if (!row) return []
  return tripEvents(row, job, containerTrip(row, job)).map((m) => ({
    label: eventLabel(NAME(m)), raw: String(m.description || m.event || ''), at: new Date(WHEN(m)).toISOString(), place: shortPlace(m.location),
  }))
}

// Where one container is now, for this job's trip: { code, label, since, place }
//   code: 'unknown' (no tracking) | 'not_arrived' | 'port' | 'to_cfs' | 'cfs' |
//         'out' (left with cargo) | 'road' | 'rail' | 'collected' | 'empty_back'
export function containerWhere(row, job) {
  if (!row) return { code: 'unknown', label: 'No tracking yet', since: null, place: null }
  const trip = containerTrip(row, job)
  const isoOf = (m) => new Date(WHEN(m)).toISOString()
  if (row.status === 'empty_returned' || trip.returnedAt) return { code: 'empty_back', label: 'Empty back', since: trip.laterTrip ? null : trip.returnedAt || null, place: null }
  if (trip.exitAt) {
    if (deliveryBy(job) === 'client') return { code: 'collected', label: 'Collected by client', since: trip.exitAt, place: null }
    const mv = onwardMove(row, job)
    if (mv && mv.at >= trip.exitAt) return { code: mv.mode === 'rail' ? 'rail' : 'road', label: `${mv.mode === 'rail' ? 'On rail' : 'On the road'}${mv.place ? ` · ${mv.place}` : ''}`, since: mv.at, place: mv.place }
    return { code: 'out', label: `Left ${trip.exitFrom || 'CFS'} with cargo`, since: trip.exitAt, place: null }
  }
  if (trip.toCfsSince) return { code: 'to_cfs', label: 'On the way to the CFS', since: trip.toCfsSince, place: null }
  const ms = tripEvents(row, job, trip)
  const last = ms.at(-1)
  if (last && ON_RAIL.test(NAME(last))) {
    const p = shortPlace(last.location)
    return { code: 'rail', label: `On rail${p ? ` · ${p}` : ''}`, since: isoOf(last), place: p }
  }
  const stop = [...ms].reverse().find((m) => AT_CFS.test(NAME(m)) || LEFT_CFS.test(NAME(m)) || PORT_OUT.test(NAME(m)))
  if (stop && AT_CFS.test(NAME(stop))) return { code: 'cfs', label: /^ICD/.test(NAME(stop)) ? 'At ICD' : 'At CFS', since: isoOf(stop), place: shortPlace(stop.location) }
  if (stop) return { code: 'to_cfs', label: LEFT_CFS.test(NAME(stop)) ? 'Moving between CFSs' : 'On the way to the CFS', since: isoOf(stop), place: null }
  if (!ms.length && row.cfs_gate_in) return { code: 'cfs', label: 'At CFS', since: row.cfs_gate_in, place: null }
  if (trip.portIn) return { code: 'port', label: 'At port', since: trip.portIn, place: null }
  return { code: 'not_arrived', label: 'Not arrived yet', since: null, place: null }
}

// ── Containers in play ──
// One entry per container of the OPEN import jobs (finished boxes included, with
// where 'empty_back' / 'collected' and finishedOn set, so a page can tuck them away).
export function containersInPlay(rows = [], data = {}) {
  const out = []
  for (const r of rows) {
    if (!isActiveRow(r) || isExportJob(r.job)) continue
    const { job } = r
    for (const no of [...new Set(parseContainerNos(job.containers))]) {
      const t = data?.containersByNo?.[no] || null
      const trip = t ? containerTrip(t, job) : null
      const where = containerWhere(t, job)
      const ms = t ? tripMilestones(t, job) : []
      const ft = t ? freeTimeFor(job, t) : null
      const moved = t ? daysSinceLastMove(t) : null
      out.push({
        no, jobId: job.id, jobNo: job.job_no, client: job.client || null,
        line: displayLine(t?.shipping_line_ldb) || displayLine(job.shipping_line),
        size: job.container_sizes?.[no] || t?.container_size || null,
        tracked: !!t,
        where: where.code, whereText: where.label, whereSince: where.since, place: where.place,
        lastEvent: ms.at(-1) || null,
        portInAt: trip?.portIn || null, leftAt: trip?.exitAt || null, leftFrom: trip?.exitFrom || null,
        freeLeft: ft ? ft.left : null, freeTill: ft?.till || null, freeFrom: ft?.from || null,
        detentionDays: ft && ft.left < 0 ? -ft.left : 0, level: detentionLevel(ft ? ft.left : null),
        finishedOn: t ? containerFinishedOn(t, job) : null,
        stale: moved !== null && moved > STALE_AFTER_DAYS, lastMoveDays: moved,
        milestones: ms,
      })
    }
  }
  return out
}

// ── Client counts from the same open set ──
export const clientKey = (name) => String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
// { [clientKey]: { key, name, open, total, openJobIds, jobIds } } over the rows given
export function activeJobsByClient(rows = []) {
  const out = {}
  for (const r of rows) {
    if (!r?.job) continue
    const key = clientKey(r.job.client)
    const e = (out[key] ||= { key, name: String(r.job.client || '').trim() || 'No client', open: 0, total: 0, openJobIds: [], jobIds: [] })
    e.total++
    e.jobIds.push(r.job.id)
    if (isActiveRow(r)) { e.open++; e.openJobIds.push(r.job.id) }
  }
  return out
}

// ── Trucks: one "on the road" list and one "need a truck" list ──
// A truck's trip lasts 4 days from when it was put on the job, or until its box is
// finished (the same rule as the hourly automatic checks; Jose, 25 Oct 2026).
export const TRUCK_WATCH_DAYS = 4
export function truckTripOver(r, t, now = Date.now()) {
  if (t?.at && now - new Date(t.at).getTime() > TRUCK_WATCH_DAYS * DAY) return true
  const boxes = (r?.j?.containers?.all || []).filter((b) => !t?.container || sameNo(b.container_no, t.container))
  return boxes.length > 0 && boxes.every((b) => containerFinishedOn(b, r.job))
}
// Every truck on an open job (imports and export carting) whose trip is not over,
// seen by a toll plaza or not: [{ key, jobId, job, j, truck, seen }]
export function jobTruckEntries(rows = [], now = Date.now()) {
  const out = []
  for (const r of rows) {
    if (!isActiveRow(r)) continue
    for (const t of r.j?.trucks || []) if (!truckTripOver(r, t, now)) out.push({ key: `${r.job.id}:${t.no}`, jobId: r.job.id, job: r.job, j: r.j, truck: t, seen: !!t.location })
  }
  return out
}
// On the road now, open import jobs only, newest first. One entry per:
//   kind 'truck'  – a truck a toll plaza saw in the last 4 days
//   kind 'moving' – container tracking shows the box on the road / rail in the last
//                   4 days and no toll has seen a truck of the job
//   kind 'left'   – every box left the CFS loaded in the last 4 days, nothing seen since
// [{ key, kind, jobId, job, j, truckNo, mode: 'truck'|'rail', place, at }]
export function onTheRoad(rows = [], now = Date.now()) {
  const recent = (iso) => !!iso && !isNaN(new Date(iso)) && now - new Date(iso).getTime() <= TRUCK_WATCH_DAYS * DAY
  const out = []
  for (const r of rows) {
    if (!isActiveRow(r) || isExportJob(r.job)) continue
    const { job, j } = r
    const base = { jobId: job.id, job, j }
    const seen = (j.trucks || []).filter((t) => t.location && recent(t.location.at || t.location.checkedAt) && !truckTripOver(r, t, now))
    for (const t of seen) out.push({ ...base, key: `${job.id}:${t.no}`, kind: 'truck', truckNo: t.no, mode: 'truck', place: t.location.plaza || null, at: t.location.at || t.location.checkedAt })
    if (seen.length || !j.oocDone) continue
    const mv = j.onwardMove
    if (mv && recent(mv.at)) out.push({ ...base, key: `${job.id}:moving`, kind: 'moving', truckNo: j.truck || null, mode: mv.mode, place: mv.place || null, at: mv.at })
    else if (!mv && j.allLeft && recent(j.leftAt)) out.push({ ...base, key: `${job.id}:left`, kind: 'left', truckNo: j.truck || null, mode: j.onwardMode === 'rail' ? 'rail' : 'truck', place: null, at: j.leftAt })
  }
  return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
}
// Open jobs with OOC done and no truck / rail arranged yet (the "need a truck" count)
export const needATruck = (rows = []) => rows.filter((r) => isActiveRow(r) && r.j?.readyForTruck)
// How many different jobs a list of entries covers (a job can have several trucks)
export const jobCount = (list = []) => new Set(list.map((x) => x.jobId ?? x.job?.id)).size
