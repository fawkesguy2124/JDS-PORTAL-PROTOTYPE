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

// Loads everything the journey needs for all jobs, in four queries.
export async function loadJourneyData() {
  const [jobsRes, csRes, resultsRes, ctRes] = await Promise.all([
    supabase.from('jobs').select('*').order('job_no', { ascending: false }),
    supabase.from('customs_status').select('*'),
    supabase.from('ulip_results')
      .select('api, job_id, found, summary, parsed, params, checked_at, last_error, last_error_at')
      .not('job_id', 'is', null)
      .order('checked_at', { ascending: false, nullsFirst: false }),
    supabase.from('container_tracking')
      .select('container_no, job_id, job_no, status, status_text, current_location, free_days, port_in, port_out, cfs_gate_in, milestones, last_refreshed_at'),
  ])
  const firstError = [jobsRes, csRes, resultsRes, ctRes].find((r) => r.error)?.error
  if (firstError) console.warn('[journey] load problem:', firstError.message)

  const customsByJob = {}
  for (const row of csRes.data || []) customsByJob[row.job_id] = row

  // newest result per job + API
  const resultsByJob = {}
  for (const row of resultsRes.data || []) {
    const byApi = (resultsByJob[row.job_id] ||= {})
    if (!byApi[row.api]) byApi[row.api] = row
  }

  const containersByNo = {}
  for (const row of ctRes.data || []) if (row.container_no) containersByNo[row.container_no.toUpperCase()] = row

  return {
    jobs: jobsRes.data || [],
    customsByJob,
    resultsByJob,
    containersByNo,
    loadedAt: new Date().toISOString(),
  }
}

const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null)
const dayLabel = (iso) => {
  if (!iso) return null
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso)
  return isNaN(d) ? String(iso) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export const isExportJob = (job) => job?.job_type === 'export'
export const isAirJob = (job) => job?.mode === 'Air'
export const isDelivered = (job) => Number(job?.stage) >= 10

// Board columns, in order. Import and export jobs share the board.
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

// Container facts for a job (first container with tracking data)
function containerFacts(job, data) {
  const nos = parseContainerNos(job.containers)
  const tracked = nos.map((n) => data.containersByNo[n]).filter(Boolean)
  const freeLeft = tracked.map((t) => t.free_days).filter((v) => v !== null && v !== undefined)
  const minFree = freeLeft.length ? Math.min(...freeLeft.map(Number)) : null
  const anyOut = tracked.some((t) => t.port_out || ['delivered', 'empty_returned'].includes(t.status))
  const allDelivered = tracked.length > 0 && tracked.every((t) => ['delivered', 'empty_returned'].includes(t.status))
  const portIn = tracked.map((t) => t.port_in).filter(Boolean).sort()[0] || null
  return { nos, tracked, minFree, anyOut, allDelivered, portIn }
}

// The journey of one job: steps (for the strip on screens), the board phase,
// and the things that need attention (for Today and the job card).
export function journeyFor(job, data) {
  const cs = data.customsByJob[job.id] || null
  const results = data.resultsByJob[job.id] || {}
  const c = containerFacts(job, data)
  const stage = Number(job.stage) || 0
  const delivered = isDelivered(job)

  const oocDate = cs?.checked_at ? cs.ooc_date : null
  const beFiled = !!(job.be_no && job.be_date)
  const truck = job.truck_no || null
  const fastag = results['FASTAG/01']
  const truckPapers = results['VAHAN/04'] || results['VAHAN/01']
  const arrivedByEta = job.eta ? new Date(job.eta).getTime() <= Date.now() : false
  const vessel = results['JNPT/01'] || results['MBPT/01'] || results['IPORTMAN/01']
  const ata = vessel?.parsed?.extra?.ata || null
  const arrived = !!(ata || c.portIn || arrivedByEta || stage >= 3)

  if (isExportJob(job)) return exportJourney(job, data, results, delivered)

  const steps = [
    { id: 'arrival', label: isAirJob(job) ? 'Flight arrived' : 'Ship arrived', done: arrived, when: dayLabel(ata || c.portIn || (arrivedByEta ? job.eta : null)), sub: !arrived && job.eta ? `ETA ${dayLabel(job.eta)}` : null },
    { id: 'be', label: 'BE filed', done: beFiled, when: dayLabel(job.be_date), sub: beFiled ? `BE ${job.be_no}` : 'In LiveImpex' },
    { id: 'ooc', label: 'OOC', done: !!oocDate, when: dayLabel(oocDate), sub: oocDate ? (cs.ooc_no ? `OOC ${cs.ooc_no}` : null) : beFiled ? 'Waiting' : null },
    { id: 'out', label: isAirJob(job) ? 'Cargo out' : 'Container out', done: c.anyOut || stage >= 9, when: null, sub: c.tracked[0]?.status_text || null },
    { id: 'truck', label: 'Truck', done: !!truck, when: null, sub: truck || (oocDate ? 'Not assigned' : null) },
    { id: 'delivered', label: 'Delivered', done: delivered || c.allDelivered, when: null, sub: null },
  ]
  // the first step not done is "current"
  const current = steps.find((s) => !s.done)
  if (current) current.current = true

  let phase = 'arrival'
  if (delivered || c.allDelivered) phase = 'delivered'
  else if (truck || c.anyOut || stage >= 9) phase = 'truck'
  else if (oocDate || stage >= 7) phase = 'release'
  else if (beFiled) phase = 'ooc'
  else if (arrived || stage >= 1) phase = 'docs'

  // ── What needs attention ──
  const attention = []
  const add = (level, text, action) => attention.push({ level, text, action, jobId: job.id, jobNo: job.job_no, client: job.client })
  if (!delivered) {
    if (c.minFree !== null && c.minFree <= 2) add('red', c.minFree <= 0 ? 'Free days are over — detention is running' : `Only ${c.minFree} free day${c.minFree === 1 ? '' : 's'} left`, 'containers')
    else if (c.minFree !== null && c.minFree <= 5) add('amber', `${c.minFree} free days left`, 'containers')
    if (oocDate && stage < 7) add('amber', 'OOC granted — move the job to stage 7', 'customs')
    if (oocDate && !truck) add('amber', 'OOC granted — no truck assigned yet', 'truck')
    if (beFiled && !oocDate) {
      const filedDays = daysSince(job.be_date)
      const checkedDays = daysSince(cs?.checked_at)
      if (filedDays !== null && filedDays >= 3) add('amber', `BE filed ${filedDays} days ago — OOC not yet`, 'customs')
      else if (checkedDays === null || checkedDays >= 1) add('info', 'BE filed — check OOC', 'customs')
    }
    if (truckPapers?.parsed?.tone === 'bad') add('red', `Truck ${truck || ''} papers problem: ${truckPapers.summary}`.trim(), 'truck')
    if (truck && fastag?.checked_at && daysSince(fastag.checked_at) >= 1 && phase === 'truck') add('info', `Truck ${truck}: location last checked ${daysSince(fastag.checked_at)} day(s) ago`, 'truck')
    if (job.detention_risk === 'high') add('red', 'Marked as high detention risk', 'containers')
  }

  const lastPlaza = fastag?.parsed?.extra?.lastPlaza || null
  return {
    steps, phase, attention,
    oocDate, beFiled, truck,
    freeDaysLeft: c.minFree,
    containers: c,
    truckLocation: lastPlaza ? { plaza: lastPlaza, at: fastag.parsed.extra.lastSeenAt, checkedAt: fastag.checked_at } : null,
    truckPapers: truckPapers ? { tone: truckPapers.parsed?.tone, summary: truckPapers.summary, checkedAt: truckPapers.checked_at } : null,
    customs: cs,
  }
}

function exportJourney(job, data, results, delivered) {
  const refs = job.ulip_refs || {}
  const sbNo = refs.sb_no || null
  const leo = results['ICEGATE/06'] || results['PCS/03'] || results['JNPT/03']
  const leoDate = leo?.parsed?.extra?.leoDate || null
  const egm = results['ICEGATE/08'] || results['ICEGATE/12']
  const egmNo = refs.egm_no || egm?.parsed?.extra?.egmNo || null

  const steps = [
    { id: 'sb', label: 'Shipping bill', done: !!sbNo, when: dayLabel(refs.sb_date), sub: sbNo ? `SB ${sbNo}` : 'In LiveImpex' },
    { id: 'leo', label: 'LEO', done: !!leoDate, when: dayLabel(leoDate), sub: sbNo && !leoDate ? 'Waiting' : null },
    { id: 'egm', label: 'EGM / sailed', done: !!egmNo, when: dayLabel(refs.egm_date), sub: egmNo ? `EGM ${egmNo}` : null },
    { id: 'delivered', label: 'Done', done: delivered, when: null, sub: null },
  ]
  const current = steps.find((s) => !s.done)
  if (current) current.current = true

  let phase = 'sb'
  if (delivered) phase = 'delivered'
  else if (leoDate) phase = 'sail'
  else if (sbNo) phase = 'leo'

  const attention = []
  const add = (level, text, action) => attention.push({ level, text, action, jobId: job.id, jobNo: job.job_no, client: job.client })
  if (!delivered && sbNo && !leoDate) {
    const d = daysSince(refs.sb_date)
    if (d !== null && d >= 2) add('amber', `Shipping bill filed ${d} days ago — LEO not yet`, 'export')
    else add('info', 'Shipping bill filed — check LEO', 'export')
  }
  return { steps, phase, attention, sbNo, leoDate, egmNo, customs: null, containers: { nos: [], tracked: [] } }
}

// All attention items across jobs, most urgent first
export function attentionList(data) {
  const order = { red: 0, amber: 1, info: 2 }
  return data.jobs
    .flatMap((job) => journeyFor(job, data).attention)
    .sort((a, b) => order[a.level] - order[b.level] || String(b.jobNo).localeCompare(String(a.jobNo)))
}
