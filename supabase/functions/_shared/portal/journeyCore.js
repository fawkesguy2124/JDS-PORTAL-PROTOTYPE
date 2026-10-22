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

const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null)
const dayLabel = (iso) => {
  if (!iso) return null
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso)
  return isNaN(d) ? String(iso) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
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

export function containerTrip(row, job) {
  const ms = (Array.isArray(row?.milestones) ? row.milestones : [])
    .filter((m) => !isNaN(WHEN(m))).sort((x, y) => WHEN(x) - WHEN(y))
  const iso = (m) => (m ? new Date(WHEN(m)).toISOString() : null)
  const none = { portIn: row?.port_in || null, exitAt: null, returnedAt: null, how: null }
  if (!ms.length) return none
  // when this job's trip started: the ETA, or else the day the job was opened
  const anchorIso = job?.eta ? `${String(job.eta).slice(0, 10)}T00:00:00+05:30` : job?.created_at || null
  const anchor = anchorIso ? new Date(anchorIso).getTime() : NaN
  const arrivals = ms.filter((m) => ARRIVE.test(NAME(m)))
  const from = isNaN(anchor) ? -Infinity : anchor - DAYS_BEFORE_ETA * DAY
  const arrive = arrivals.find((m) => WHEN(m) >= from) || (isNaN(anchor) ? arrivals[0] : null)
  // everything on record is from a much later trip → ours finished before it
  if (!isNaN(anchor) && WHEN(ms[0]) - anchor > LATER_TRIP_AFTER_DAYS * DAY && (!arrive || WHEN(arrive) - anchor > LATER_TRIP_AFTER_DAYS * DAY)) {
    return { portIn: null, exitAt: null, returnedAt: iso(ms[0]), how: `history only shows a later trip (from ${dayLabel(iso(ms[0]))})`, laterTrip: true }
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
  if (!exit) {
    const portOut = after.find((m) => /^(PORT OUT|PORTOUT)$/.test(NAME(m)))
    const cfsAfter = portOut && after.some((m) => (AT_CFS.test(NAME(m)) || LEFT_CFS.test(NAME(m))) && WHEN(m) > WHEN(portOut))
    if (portOut && !cfsAfter) exit = portOut
  }
  // anything after leaving with cargo that starts its next life
  const next = exit ? after.find((m) => WHEN(m) > WHEN(exit) && NEXT_LIFE.test(NAME(m))) : null
  return { portIn: iso(arrive), exitAt: iso(exit), returnedAt: iso(next), how: next ? `${next.description}${next.location ? ` · ${next.location}` : ''}` : null }
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

// Free days left for one container, worked out TODAY (negative = detention running,
// null = not known, status unclear, or the container's work for this job is over).
// Detention runs from this job's port arrival until the empty is back.
export function freeDaysLeftFor(job, row) {
  if (!row || containerFinishedOn(row, job)) return null
  const moved = daysSinceLastMove(row)
  if (moved !== null && moved > STALE_AFTER_DAYS) return null
  const contract = Number(job?.free_days)
  const portInDays = daysSince(containerTrip(row, job).portIn || row.port_in)
  if (Number.isFinite(contract) && contract > 0 && portInDays !== null) return contract - portInDays
  if (row.free_days === null || row.free_days === undefined) return null
  const snapshotAge = daysSince(row.last_refreshed_at) ?? 0
  return Number(row.free_days) - snapshotAge
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

// How the cargo leaves after OOC: not always a truck. Staff can set it on the job
// (field_meta.onward_mode = 'truck' | 'rail'); otherwise rail is recognised from the
// container's own tracking (rail transport, station crossed, wagon), and a truck
// number means truck. null = not decided yet.
const RAIL_EVENT = /RAIL|STATION|WAGON|TRAIN/
export function onwardMode(job, rows = []) {
  const set = job?.field_meta?.onward_mode
  if (set === 'truck' || set === 'rail') return set
  const onRail = rows.some((t) => (Array.isArray(t?.milestones) ? t.milestones : [])
    .some((m) => RAIL_EVENT.test(String(m?.description || '').toUpperCase()) || /^R(AIL)?$/i.test(String(m?.transportMode || '').trim())))
  if (onRail || rows.some((t) => t?.status === 'on_rail')) return 'rail'
  return truckNos(job).length ? 'truck' : null
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
      return { ...t, trip, outWithCargo: !!trip.exitAt, freeLeft: freeDaysLeftFor(job, t), lastMoveDays: lastMove, stale: lastMove !== null && lastMove > STALE_AFTER_DAYS }
    })
  const allStale = tracked.length > 0 && tracked.every((t) => t.stale)
  const staleDays = allStale ? Math.min(...tracked.map((t) => t.lastMoveDays)) : null
  const lefts = tracked.map((t) => t.freeLeft).filter((v) => v !== null)
  const minFree = lefts.length ? Math.min(...lefts) : null
  const anyOut = all.some((t) => t.port_out || DONE_CONTAINER.includes(t.status) || isFinished(t) || containerTrip(t, job).exitAt)
  // every container of the job is back (or, for client-collected jobs, has left the CFS)
  const allDelivered = all.length > 0 && all.every((t) => isFinished(t) || t.status === 'empty_returned')
  const finishedOn = allDelivered ? finished.map((f) => f.on).filter((d) => d !== 'yes').sort().at(-1) || null : null
  const portIn = all.map((t) => containerTrip(t, job).portIn || t.port_in).filter(Boolean).sort()[0] || null
  return { nos, all, tracked, minFree, anyOut, allDelivered, finishedOn, portIn, allStale, staleDays }
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
  const oocDone = !!oocDate || stage >= 7
  const beFiled = !!(job.be_no && job.be_date)
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
  const ata = vessel?.parsed?.extra?.ata || null
  const arrived = !!(ata || c.portIn || stage >= 3)
  const mode = onwardMode(job, c.all)
  const railMoving = mode === 'rail' && c.anyOut

  const steps = [
    arrived
      ? { id: 'arrival', label: isAirJob(job) ? 'Flight arrived' : 'Ship arrived', done: true, when: dayLabel(ata || c.portIn), sub: null }
      : { id: 'arrival', label: isAirJob(job) ? 'Flight due' : 'Ship due', done: false, when: null, sub: job.eta ? `ETA ${dayLabel(job.eta)}` : null },
    { id: 'be', label: 'BE filed', done: beFiled, when: dayLabel(job.be_date), sub: beFiled ? `BE ${job.be_no}` : 'In LiveImpex' },
    { id: 'ooc', label: 'OOC', done: oocDone, when: dayLabel(oocDate), sub: oocDate ? (cs.ooc_no ? `OOC ${cs.ooc_no}` : null) : oocDone ? 'Recorded by staff' : beFiled ? 'Waiting' : null },
    { id: 'out', label: isAirJob(job) ? 'Cargo out' : 'Container out', done: c.anyOut || stage >= 9, when: null, sub: c.tracked[0]?.status_text || null },
    { id: 'truck', label: mode === 'rail' ? 'Rail' : mode === 'truck' ? 'Truck' : 'Truck / rail', done: oocDone && (!!truck || railMoving), when: null,
      sub: truck ? (trucks.length > 1 ? `${trucks.length} trucks` : truck) : (mode === 'rail' ? (railMoving ? 'On its way by rail' : 'Going by rail') : oocDone ? 'Not arranged yet' : null) },
    { id: 'delivered', label: 'Delivered', done: delivered, when: !isDelivered(job) && c.finishedOn ? dayLabel(c.finishedOn) : null, sub: !isDelivered(job) && c.allDelivered ? (deliveryBy(job) === 'client' ? 'Collected by client' : 'Empty container back') : null },
  ]
  markCurrent(steps)
  const moveStep = steps.find((s) => s.id === 'truck')
  if (moveStep?.current) moveStep.nextText = mode === 'rail' ? 'Next: send the container by rail' : mode === 'truck' ? 'Next: assign a truck' : 'Next: arrange truck or rail'

  let phase = 'arrival'
  if (delivered) phase = 'delivered'
  else if ((truck && oocDone) || (railMoving && oocDone) || stage >= 9) phase = 'truck'
  else if (oocDone) phase = 'release'
  else if (beFiled) phase = 'ooc'
  else if (arrived || stage >= 1) phase = 'docs'

  // OOC done and the onward move not arranged yet (rail jobs don't wait for a truck)
  const readyForTruck = !delivered && oocDone && !truck && mode !== 'rail'

  // ── Saved job details that container tracking (LDB) contradicts ──
  const mismatches = []
  const jobLine = lineName(job.shipping_line)
  const ldbLines = [...new Set(c.tracked.map((t) => lineName(t.shipping_line_ldb)).filter(Boolean))]
  if (jobLine && ldbLines.length === 1 && lineGroup(ldbLines[0]) !== lineGroup(jobLine)) mismatches.push({ field: 'Shipping line', job: jobLine, tracking: ldbLines[0] })

  // ── What needs attention ──
  const attention = []
  const add = (level, text, action) => attention.push({ level, text, action, jobId: job.id, jobNo: job.job_no, client: job.client })
  if (!delivered) {
    const late = c.tracked.filter((t) => t.freeLeft !== null && t.freeLeft === c.minFree)
    const outLate = late.length > 0 && late.every((t) => t.outWithCargo)
    if (c.minFree !== null && c.minFree < 0) add('red', `Detention running — ${-c.minFree} day${c.minFree === -1 ? '' : 's'} over free time${outLate ? ' (delivered, empty not back yet)' : ''}`, 'containers')
    else if (c.minFree !== null && c.minFree <= 2) add('red', c.minFree === 0 ? 'Last free day today' : `Only ${c.minFree} free day${c.minFree === 1 ? '' : 's'} left`, 'containers')
    else if (c.minFree !== null && c.minFree <= 5) add('amber', `${c.minFree} free days left`, 'containers')
    // (no "move the job to the OOC stage" reminder: the customs check moves it by itself)
    if (readyForTruck) add('amber', mode === 'truck' ? 'OOC done — no truck assigned yet' : 'OOC done — arrange truck or rail', 'truck')
    if (beFiled && !oocDone) {
      const filedDays = daysSince(job.be_date)
      if (filedDays !== null && filedDays >= 3) add('amber', `BE filed ${filedDays} days ago — OOC not yet`, 'customs')
    }
    for (const t of trucks) if (t.papers?.found && t.papers.tone === 'bad') add('red', `Truck ${t.no} papers problem: ${t.papers.summary}`, 'truck')
    if (job.detention_risk === 'high') add('red', 'Marked as high detention risk', 'containers')
    if (c.allStale) add('info', `No container movement for ${c.staleDays} days — is this job finished? If so, mark it delivered.`, 'details')
    for (const m of mismatches) add('info', `Check the ${m.field.toLowerCase()}: the job says ${m.job}, container tracking says ${m.tracking}`, 'details')
  }

  // the newest toll crossing of any of the job's trucks
  const seen = trucks.filter((t) => t.location).sort((a, b) => String(b.location.at || '').localeCompare(String(a.location.at || '')))
  return {
    steps, phase, attention,
    oocDate, oocDone, beFiled, truck, trucks, readyForTruck, onwardMode: mode,
    arrivedAt: ata || c.portIn || null,
    freeDaysLeft: c.minFree,
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
    readyForTruck: false, oocDone: false, freeDaysLeft: null,
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
