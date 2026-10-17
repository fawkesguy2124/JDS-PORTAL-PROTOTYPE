import { supabase } from '../supabase'
import { parseContainerNos } from '../utils/jobHelpers'

// ─────────────────────────────────────────────────────────────────────────────
// Where is each job in its journey, and what needs attention?
//
// Everything here reads SAVED data only (jobs, customs_status, ulip_results,
// container_tracking). It never calls ULIP. Pages call loadJourneyData() once,
// then journeyFor(job, data) for each job.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000
const PAGE = 1000

// Reads every row of a query in pages of 1000 (Supabase's default limit)
async function readAll(build) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) return { data: rows, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) return { data: rows, error: null }
  }
}

// Loads everything the journey needs for all jobs.
// Returns { jobs, customsByJob, resultsByJob, containersByNo, loadedAt, error }.
// error is a plain message (or null); pages must show it instead of "all clear".
export async function loadJourneyData() {
  const since = new Date(Date.now() - 180 * DAY).toISOString()
  const [jobsRes, csRes, resultsRes, ctRes] = await Promise.all([
    readAll(() => supabase.from('jobs').select('*').order('job_no', { ascending: false })),
    readAll(() => supabase.from('customs_status').select('*').order('job_id')),
    readAll(() => supabase.from('ulip_results')
      .select('api, job_id, found, summary, parsed, params, checked_at, last_error, last_error_at')
      .not('job_id', 'is', null)
      .gte('checked_at', since)
      .order('checked_at', { ascending: false, nullsFirst: false })),
    readAll(() => supabase.from('container_tracking')
      .select('container_no, job_id, job_no, status, status_text, current_location, free_days, port_in, port_out, cfs_gate_in, milestones, last_refreshed_at')
      .order('container_no')),
  ])
  const firstError = [jobsRes, csRes, resultsRes, ctRes].find((r) => r.error)?.error
  if (firstError) console.warn('[journey] load problem:', firstError.message)

  const customsByJob = {}
  for (const row of csRes.data) customsByJob[row.job_id] = row

  // all results per job + API, newest first
  const resultsByJob = {}
  for (const row of resultsRes.data) {
    const byApi = (resultsByJob[row.job_id] ||= {})
    ;(byApi[row.api] ||= []).push(row)
  }

  const containersByNo = {}
  for (const row of ctRes.data) if (row.container_no) containersByNo[row.container_no.toUpperCase()] = row

  return {
    jobs: jobsRes.data,
    customsByJob,
    resultsByJob,
    containersByNo,
    loadedAt: new Date().toISOString(),
    error: firstError ? (firstError.message || 'Could not load the latest data') : null,
  }
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
const DONE_CONTAINER = ['delivered', 'empty_returned']

// Board columns, in order
export const PHASES = [
  { id: 'arrival', label: 'Awaiting arrival', hint: 'Ship or flight not arrived yet' },
  { id: 'docs', label: 'Docs & BE filing', hint: 'Preparing / filing in LiveImpex' },
  { id: 'ooc', label: 'Waiting for OOC', hint: 'BE filed, OOC not yet' },
  { id: 'release', label: 'OOC — to be moved', hint: 'OOC granted, cargo still at port/CFS' },
  { id: 'truck', label: 'On the road', hint: 'Truck assigned / out of port' },
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

// Free days left for one container, worked out TODAY (negative = detention running,
// null = not known or status unclear). The saved number is only a snapshot.
export function freeDaysLeftFor(job, row) {
  if (!row || DONE_CONTAINER.includes(row.status)) return null
  const moved = daysSinceLastMove(row)
  if (moved !== null && moved > STALE_AFTER_DAYS) return null
  const contract = Number(job?.free_days)
  const portInDays = daysSince(row.port_in)
  if (Number.isFinite(contract) && contract > 0 && portInDays !== null) return contract - portInDays
  if (row.free_days === null || row.free_days === undefined) return null
  const snapshotAge = daysSince(row.last_refreshed_at) ?? 0
  return Number(row.free_days) - snapshotAge
}

// Container facts for a job (containers still in play only)
function containerFacts(job, data) {
  const nos = parseContainerNos(job.containers)
  const all = nos.map((n) => data.containersByNo[n]).filter(Boolean)
  const tracked = all
    .filter((t) => !DONE_CONTAINER.includes(t.status))
    .map((t) => {
      const lastMove = daysSinceLastMove(t)
      return { ...t, freeLeft: freeDaysLeftFor(job, t), lastMoveDays: lastMove, stale: lastMove !== null && lastMove > STALE_AFTER_DAYS }
    })
  const allStale = tracked.length > 0 && tracked.every((t) => t.stale)
  const staleDays = allStale ? Math.min(...tracked.map((t) => t.lastMoveDays)) : null
  const lefts = tracked.map((t) => t.freeLeft).filter((v) => v !== null)
  const minFree = lefts.length ? Math.min(...lefts) : null
  const anyOut = all.some((t) => t.port_out || DONE_CONTAINER.includes(t.status))
  const allDelivered = all.length > 0 && all.every((t) => DONE_CONTAINER.includes(t.status))
  const portIn = all.map((t) => t.port_in).filter(Boolean).sort()[0] || null
  return { nos, tracked, minFree, anyOut, allDelivered, portIn, allStale, staleDays }
}

// What staff see as the next thing to happen, for the step that is "current"
const NEXT_TEXT = {
  arrival: 'Waiting for arrival',
  be: 'Next: file the BE in LiveImpex',
  ooc: 'Waiting for OOC',
  out: 'Next: get the container out',
  truck: 'Next: assign a truck',
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
  const truck = job.truck_no || null
  // truck answers only count for the job's CURRENT truck
  const fastag = truck ? resultFor(results, ['FASTAG/01'], 'vehiclenumber', truck) : null
  const truckPapers = truck ? (resultFor(results, ['VAHAN/04', 'VAHAN/01'], 'vehiclenumber', truck)) : null
  const vessel = resultFor(results, ['JNPT/01', 'MBPT/01', 'IPORTMAN/01'])
  const ata = vessel?.parsed?.extra?.ata || null
  const arrived = !!(ata || c.portIn || stage >= 3)

  const steps = [
    arrived
      ? { id: 'arrival', label: isAirJob(job) ? 'Flight arrived' : 'Ship arrived', done: true, when: dayLabel(ata || c.portIn), sub: null }
      : { id: 'arrival', label: isAirJob(job) ? 'Flight due' : 'Ship due', done: false, when: null, sub: job.eta ? `ETA ${dayLabel(job.eta)}` : null },
    { id: 'be', label: 'BE filed', done: beFiled, when: dayLabel(job.be_date), sub: beFiled ? `BE ${job.be_no}` : 'In LiveImpex' },
    { id: 'ooc', label: 'OOC', done: oocDone, when: dayLabel(oocDate), sub: oocDate ? (cs.ooc_no ? `OOC ${cs.ooc_no}` : null) : oocDone ? 'Recorded by staff' : beFiled ? 'Waiting' : null },
    { id: 'out', label: isAirJob(job) ? 'Cargo out' : 'Container out', done: c.anyOut || stage >= 9, when: null, sub: c.tracked[0]?.status_text || null },
    { id: 'truck', label: 'Truck', done: !!truck && oocDone, when: null, sub: truck || (oocDone ? 'Not assigned' : null) },
    { id: 'delivered', label: 'Delivered', done: delivered, when: null, sub: null },
  ]
  markCurrent(steps)

  let phase = 'arrival'
  if (delivered) phase = 'delivered'
  else if ((truck && oocDone) || stage >= 9) phase = 'truck'
  else if (oocDone) phase = 'release'
  else if (beFiled) phase = 'ooc'
  else if (arrived || stage >= 1) phase = 'docs'

  const readyForTruck = !delivered && oocDone && !truck

  // ── What needs attention ──
  const attention = []
  const add = (level, text, action) => attention.push({ level, text, action, jobId: job.id, jobNo: job.job_no, client: job.client })
  if (!delivered) {
    if (c.minFree !== null && c.minFree < 0) add('red', `Detention running — ${-c.minFree} day${c.minFree === -1 ? '' : 's'} over free time`, 'containers')
    else if (c.minFree !== null && c.minFree <= 2) add('red', c.minFree === 0 ? 'Last free day today' : `Only ${c.minFree} free day${c.minFree === 1 ? '' : 's'} left`, 'containers')
    else if (c.minFree !== null && c.minFree <= 5) add('amber', `${c.minFree} free days left`, 'containers')
    if (oocDate && stage < 7) add('amber', 'OOC granted — move the job to the OOC stage', 'customs')
    if (readyForTruck) add('amber', 'OOC done — no truck assigned yet', 'truck')
    if (beFiled && !oocDone) {
      const filedDays = daysSince(job.be_date)
      if (filedDays !== null && filedDays >= 3) add('amber', `BE filed ${filedDays} days ago — OOC not yet`, 'customs')
    }
    if (truckPapers?.parsed?.found && truckPapers.parsed.tone === 'bad') add('red', `Truck ${truck} papers problem: ${truckPapers.summary}`, 'truck')
    if (job.detention_risk === 'high') add('red', 'Marked as high detention risk', 'containers')
    if (c.allStale) add('info', `No container movement for ${c.staleDays} days — is this job finished? If so, mark it delivered.`, 'details')
  }

  const lastPlaza = fastag?.parsed?.extra?.lastPlaza || null
  return {
    steps, phase, attention,
    oocDate, oocDone, beFiled, truck, readyForTruck,
    freeDaysLeft: c.minFree,
    containers: c,
    truckLocation: lastPlaza ? { plaza: lastPlaza, at: fastag.parsed.extra.lastSeenAt, checkedAt: fastag.checked_at } : null,
    truckPapers: truckPapers ? { found: !!truckPapers.parsed?.found, tone: truckPapers.parsed?.tone, summary: truckPapers.summary, checkedAt: truckPapers.checked_at } : null,
    customs: cs,
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
  const truck = job.truck_no || null

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
    steps, phase, attention, sbNo, leoDate, egmNo, truck,
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
