// The portal tools the WhatsApp assistant (AI) may use. READ-ONLY, saved portal
// data only: no ULIP calls, no documents. Each tool returns plain facts, small
// enough to send to the AI model. The same file runs in the portal (for testing)
// and on the server (wa-bot).
import { journeyFor, isDelivered, isExportJob, effectiveStage, PHASES, EXPORT_PHASES, parseContainerNos, containerTrip, containerFinishedOn, deliveryBy, truckNos } from './journeyCore.js'
import { jobsFor } from './botMessages.js'
import { lineName } from './shippingLines.js'
import { vesselsOf, shipIdOf, seaArea, cargoOnShip } from './ships.js'

const TZ = 'Asia/Kolkata'
const day = (iso) => {
  if (!iso) return null
  const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00+05:30` : iso)
  return isNaN(d) ? String(iso) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })
}
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
// every word asked for appears somewhere ("Kerry Indev CFS" finds "Raigad/Kerry Indev Logistics CFS,Mumbai")
const has2 = (v, want) => {
  if (!want) return true
  const hay = norm(v)
  return hay.includes(norm(want)) || String(want).split(/[\s/,.-]+/).map(norm).filter(Boolean).every((w) => hay.includes(w))
}
// YYYY-MM-DD in India time, for date-range filters
const ymd = (iso) => {
  if (!iso) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return String(iso)
  const d = new Date(iso)
  return isNaN(d) ? null : d.toLocaleDateString('en-CA', { timeZone: TZ })
}
const inRange = (iso, from, to) => {
  if (!from && !to) return true
  const d = ymd(iso)
  return !!d && (!from || d >= from) && (!to || d <= to)
}
// portal document types are short codes (BL, BE, COO…): map spoken names to them
const DOC_ALIAS = { BILLOFLADING: 'BL', HBL: 'BL', MBL: 'BL', AWB: 'BL', BILLOFENTRY: 'BE', CERTIFICATEOFORIGIN: 'COO', PACKING: 'PACKINGLIST', PL: 'PACKINGLIST', COMMERCIALINVOICE: 'INVOICE', INV: 'INVOICE', EWAY: 'EWAYBILL', PROOFOFDELIVERY: 'POD', EXAMORDER: 'EXAMINATIONORDER', OUTOFCHARGE: 'OOC' }
const docType = (s) => DOC_ALIAS[norm(s)] || norm(s)
// what staff may call an event → the name in the tracking data
const EVENT_ALIAS = { CFSGATEOUT: 'CFSOUT', CFSGATEIN: 'CFSIN', ICDGATEOUT: 'ICDOUT', ICDGATEIN: 'ICDIN', OUTOFCFS: 'CFSOUT', OUTOFPORT: 'PORTOUT', PORTGATEOUT: 'GATEOUT', PORTGATEIN: 'GATEIN', DISCHARGED: 'PORTIN', ARRIVED: 'PORTIN', TOLL: 'TOLLPLAZACROSSED', ONROAD: 'TOLLPLAZACROSSED', ONRAIL: 'STATIONCROSSED' }
// what kind of place a container is at, from the place name and the event
const placeType = (where, ev) => {
  const w = String(where || '').toUpperCase()
  const e = String(ev || '').toUpperCase()
  // the event says it best ("ICD IN" at "Dronagiri Rail Terminal CFS" = an ICD)
  if (/^ICD/.test(e)) return 'ICD'
  if (/^CFS/.test(e)) return 'CFS'
  if (/STATION|LOADING/.test(e)) return 'rail'
  if (/TOLL|GATE CROSSED|TRANSIT/.test(e)) return 'road'
  if (/^(PORT|TERMINAL|DPD)/.test(e)) return 'port'
  // otherwise the place name
  if (/\bICD\b/.test(w)) return 'ICD'
  if (/\bCFS\b|LOGISTICS PARK|WAREHOUS/.test(w)) return 'CFS'
  if (/RAIL|STATION/.test(w)) return 'rail'
  if (/TOLL/.test(w)) return 'road'
  if (/TERMINAL|PORT|GATE|JNPA|NSICT|NSFT|NSIGT|GTI|BMCT|PSA|APMT/.test(w) || /^GATE/.test(e)) return 'port'
  return 'unknown'
}
const PORT_ALIAS = { JNPT: 'INNSA', NHAVASHEVA: 'INNSA', NSA: 'INNSA', JNPA: 'INNSA', MUMBAI: 'INBOM1', MUMBAIPORT: 'INBOM1', MBPT: 'INBOM1', AIR: 'INBOM4', MUMBAIAIR: 'INBOM4', SAHAR: 'INBOM4' }
const STAGE = ['Job created', 'Docs received', 'Verification', 'BE filing', 'Customs review', 'Assessment', 'Duty paid', 'OOC', 'Out of port', 'In transit', 'Delivered']

// date + time in India, for "when was it last checked"
const when = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d) ? String(iso) : `${day(iso)}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}`
}
const phaseLabel = (id) => [...PHASES, ...EXPORT_PHASES].find((p) => p.id === id)?.label || id
// When customs (ICEGATE) was last asked about this job's BE, as the portal saved it
function customsCheck(job, data, j) {
  if (isExportJob(job) || !job.be_no) return {}
  const raw = data.customsByJob?.[job.id]
  const forThisBe = raw && String(raw.be_no || '') === String(job.be_no)
  const lastOk = forThisBe ? raw.checked_at : null
  const lastErr = forThisBe && raw.last_error_at && (!lastOk || raw.last_error_at > lastOk) ? raw.last_error : null
  return {
    customs_last_checked: lastOk ? when(lastOk) : 'never checked for this BE',
    customs_last_answer: j.oocDone ? 'OOC granted' : lastOk ? 'OOC not granted yet' : null,
    customs_check_problem: lastErr || null,
  }
}

// One job as facts
function jobFacts(job, data, detail = false) {
  const j = journeyFor(job, data)
  const cur = j.steps.find((s) => s.current)
  const facts = {
    job_no: job.job_no, client: job.client || null, mode: job.mode || null, port: job.port_code || null,
    eta: day(job.eta), stage: STAGE[effectiveStage(job, j)] || null, status: phaseLabel(j.phase),
    // a finished job has no next step (a delivered job without a recorded truck still showed "arrange truck")
    next_step: j.phase === 'delivered' || isDelivered(job) ? 'Finished' : cur?.nextText || null,
    be_no: job.be_no || null, be_date: day(job.be_date), ooc_date: day(j.oocDate) || (j.oocDone && !j.oocDate ? 'recorded by staff' : null),
    free_days_left: j.freeDaysLeft, problems: j.attention.map((a) => `${a.level === 'red' ? 'URGENT' : a.level === 'amber' ? 'TO DO' : 'NOTE'}: ${a.text}`),
    leaves_by: j.onwardMode || 'not decided', trucks: (j.trucks || []).map((t) => `${t.no}${t.container ? ` (${t.container})` : ''}`),
    ...customsCheck(job, data, j),
  }
  if (!detail) return { ...facts, containers: parseContainerNos(job.containers).length }
  const docs = (data.documents || []).filter((d) => d.job_id === job.id)
  const acts = (data.activity || []).filter((a) => a.job_id === job.id || a.job_no === job.job_no).slice(0, 6)
  return {
    ...facts,
    priority: job.priority || null, created: `${day(job.created_at)}${data.people?.[job.created_by] ? ` by ${data.people[job.created_by]}` : ''}`, last_updated: day(job.updated_at),
    contract_free_days: job.free_days ?? null, hs_code: job.hs_code || null, notes: job.notes ? String(job.notes).slice(0, 300) : null,
    bl_no: job.bl_no || null, shipping_line: job.shipping_line || null, vessel: job.vessel || null, cfs: job.cfs_name || null,
    goods: job.goods ? String(job.goods).slice(0, 120) : null, rms: job.rms_status || null,
    container_sizes: job.container_sizes && Object.keys(job.container_sizes).length ? job.container_sizes : job.container_size || null,
    documents_uploaded: docs.length ? docs.map((d) => `${d.doc_type || 'Other'}: ${d.file_name || ''} (${day(d.created_at)}${d.uploaded_by_name ? `, ${d.uploaded_by_name}` : ''})`) : 'none',
    recent_activity: acts.map((a) => `${day(a.created_at)}: ${a.title || a.action}${a.note ? ` (${String(a.note).slice(0, 80)})` : ''}`),
    delivery_to_warehouse: deliveryBy(job) === 'client' ? 'client collects' : 'JDS delivers',
    igm: job.ulip_refs?.igm_no ? `${job.ulip_refs.igm_no} (${day(job.ulip_refs.igm_date) || ''})` : null,
    steps: j.steps.map((s) => `${s.done ? 'done' : s.current ? 'CURRENT' : 'later'}: ${s.label}${s.when ? ` ${s.when}` : ''}${s.sub ? ` (${s.sub})` : ''}`),
    trucks_last_seen: (j.trucks || []).filter((t) => t.location).map((t) => `${t.no}: ${t.location.plaza} at ${day(t.location.at)}`),
    container_list: parseContainerNos(job.containers).slice(0, 25).map((no) => {
      const t = data.containersByNo[no]
      if (!t) return { no, tracking: 'not tracked' }
      const trip = containerTrip(t, job)
      const live = j.containers.tracked.find((x) => x.container_no?.toUpperCase() === no)
      return {
        no, last_event: t.status_text || t.status || null, where: t.current_location || null,
        port_in: day(trip.portIn), left_with_cargo: day(trip.exitAt), empty_back: day(containerFinishedOn(t, job) === 'yes' ? null : containerFinishedOn(t, job)),
        free_days_left: live?.freeLeft ?? null, shipping_line: t.shipping_line_ldb || null,
      }
    }),
  }
}

const FILTERS = {
  open: (r) => r.j.phase !== 'delivered',
  urgent: (r) => r.j.attention.some((a) => a.level === 'red'),
  detention: (r) => r.j.freeDaysLeft !== null && r.j.freeDaysLeft < 0,
  free_days_low: (r) => r.j.freeDaysLeft !== null && r.j.freeDaysLeft >= 0 && r.j.freeDaysLeft <= 3,
  be_not_filed: (r) => r.j.phase !== 'delivered' && !r.j.beFiled,
  waiting_ooc: (r) => r.j.phase === 'ooc' || (r.j.phase === 'arrival' && r.j.beFiled),
  ooc_done_not_moved: (r) => r.j.phase === 'release',
  on_the_move: (r) => r.j.phase === 'truck',
  arriving_soon: (r) => r.j.phase === 'arrival',
  delivered: (r) => r.j.phase === 'delivered',
  all: () => true,
}

// Tool definitions (shape used by Gemini; plain JSON schema types)
// Kept short on purpose: the whole list goes with every question, and the free
// AI plan counts every word sent per minute.
// (list_jobs, clients_overview and today_counts still run if asked, but
// search_jobs covers them, so they are not offered.)
const S = { type: 'STRING' }
export const TOOLS = [
  {
    name: 'get_job',
    description: 'Full details of ONE job (steps, BE, OOC, containers, truck/rail, documents, recent activity). ref = job no (J-193 or 193), BE no, container no, BL no or truck no.',
    parameters: { type: 'OBJECT', properties: { ref: S }, required: ['ref'] },
  },
  {
    name: 'search_jobs',
    description: 'Find, count or group jobs by any mix of filters and date ranges (dates YYYY-MM-DD). Gives total/open/finished and average days BE→OOC and arrival→OOC.',
    parameters: {
      type: 'OBJECT',
      properties: {
        situation: { type: 'STRING', enum: Object.keys(FILTERS), description: 'open=not finished; urgent; detention=free time over; free_days_low=0-3 left; be_not_filed; waiting_ooc; ooc_done_not_moved; on_the_move=out by truck/rail; arriving_soon; delivered=finished; all (default)' },
        text: { type: 'STRING', description: 'words in any field (goods, BL, notes…)' },
        client: S, shipping_line: S, vessel: S, cfs: S,
        port: { type: 'STRING', description: 'code or name: JNPT, Mumbai, air' },
        mode: { type: 'STRING', description: 'Sea FCL, Sea LCL, Air' },
        rms: { type: 'STRING', description: 'RMS, APR…' }, priority: S,
        leaves_by: { type: 'STRING', enum: ['truck', 'rail', 'not decided'] },
        has_truck: { type: 'BOOLEAN' },
        missing_document: { type: 'STRING', description: 'BL, Invoice, Packing List, COO, Insurance, BE, OOC, E-Way Bill, POD' },
        has_document: S,
        created_from: S, created_to: S, be_from: S, be_to: S, ooc_from: S, ooc_to: S, arrived_from: S, arrived_to: S, eta_from: S, eta_to: S,
        group_by: { type: 'STRING', enum: ['client', 'shipping_line', 'mode', 'status', 'port', 'cfs', 'created_month', 'rms', 'leaves_by'], description: 'count per group instead of a list' },
        limit: { type: 'NUMBER', description: 'default 12, max 40' },
      },
    },
  },
  {
    name: 'list_containers',
    description: 'Containers of current jobs by LATEST tracking event (PORT OUT, CFS IN, CFS OUT…), stage, place, client, job or movement date.',
    parameters: {
      type: 'OBJECT',
      properties: {
        last_event: S,
        stage: { type: 'STRING', enum: ['at_port', 'at_cfs_or_icd', 'left_cfs_with_cargo', 'empty_back', 'detention', 'any'] },
        client: S, job: S,
        place: { type: 'STRING', description: 'part of the place name, e.g. Kerry Indev' },
        moved_from: { type: 'STRING', description: 'latest event on/after this date' }, moved_to: S,
        include_old: { type: 'BOOLEAN', description: 'also boxes back empty or idle 30+ days' },
        limit: { type: 'NUMBER', description: 'default 30' },
      },
    },
  },
  {
    name: 'container_history',
    description: 'Every tracking event of one container, with its job, size, vessel, terminal and line.',
    parameters: { type: 'OBJECT', properties: { container: S }, required: ['container'] },
  },
  {
    name: 'ship_info',
    description: 'Ships (vessels) of the jobs: IMO, every job on the ship, at sea or arrived, ETA, last-heard position and the live map link. ship = ship name, IMO or a job no; empty = all ships of open sea jobs.',
    parameters: { type: 'OBJECT', properties: { ship: S } },
  },
  {
    name: 'recent_activity',
    description: 'What happened in the portal (last 30 days): container events, OOC, stage changes, trucks, uploads, new jobs, by job, person or kind. from defaults to today.',
    parameters: {
      type: 'OBJECT',
      properties: {
        job: S, from: S, to: S, person: S,
        kind: { type: 'STRING', enum: ['any', 'container', 'ooc', 'stage', 'truck', 'document', 'job_created', 'note', 'detention'] },
        limit: { type: 'NUMBER', description: 'default 25' },
      },
    },
  },
]

// Where a container is, from its latest event (for list_containers)
function boxStage(t, job, trip, finished, freeLeft) {
  const ev = String(t.status_text || '').toUpperCase()
  if (finished) return 'empty_back'
  if (freeLeft !== null && freeLeft < 0) return 'detention'
  if (trip.exitAt) return 'left_cfs_with_cargo'
  if (/CFS IN|ICD IN|CFS GATE IN|ICD GATE IN/.test(ev) || t.status === 'at_cfs') return 'at_cfs_or_icd'
  if (/PORT IN|DISCHARGE|DPD|ARRIVED/.test(ev) || t.status === 'arrived') return 'at_port'
  return 'other'
}

// Leaves out empty fields so answers stay small
const compact = (v) => {
  if (Array.isArray(v)) return v.map(compact)
  if (!v || typeof v !== 'object') return v
  const o = {}
  for (const [k, x] of Object.entries(v)) {
    if (x === null || x === undefined || x === '' || (Array.isArray(x) && !x.length)) continue
    o[k] = compact(x)
  }
  return o
}

// Ships of the jobs, one entry per ship (same IMO = same ship, like the Vessels
// page). The position is only what the free vessel-track finder last heard
// (it hears little off west India); the live map is the Vessels page.
const VESSELS_PAGE = 'https://jds-portal-prototype.vercel.app/admin?tab=vessels'
const NAV = { 0: 'moving', 1: 'at anchor', 5: 'moored', 8: 'sailing' }
function shipInfo(args, data, rows) {
  const want = String(args?.ship || '').trim()
  const ref = norm(want)
  const groups = new Map()
  for (const { job, j } of rows) {
    if (isExportJob(job) || /air/i.test(job.mode || '')) continue
    vesselsOf(job, data).forEach((name, i) => {
      const id = shipIdOf(job, name, data)
      const key = id.imo ? `imo:${id.imo}` : id.mmsi ? `mmsi:${id.mmsi}` : `name:${name}`
      const g = groups.get(key) || { name, names: [], imo: id.imo, mmsi: id.mmsi, jobs: [] }
      if (!g.names.includes(name)) g.names.push(name)
      if (!g.jobs.some((x) => x.job.id === job.id)) g.jobs.push({ job, j, first: i === 0, cargo: cargoOnShip(job, name, data, j) })
      groups.set(key, g)
    })
  }
  let ships = [...groups.values()]
  if (ref) {
    const num = ref.replace(/^J/, '')
    const byJob = ships.filter((g) => g.jobs.some((x) => norm(x.job.job_no) === ref || norm(x.job.job_no).replace(/^J/, '') === num))
    ships = byJob.length ? byJob : ships.filter((g) => g.imo === ref || g.names.some((n) => has2(n, want)))
    if (!ships.length) return { not_found: want, note: 'no job of yours is on a ship by that name, IMO or job no' }
  } else {
    // the list = ships with our cargo still on board (like the Vessels page)
    ships = ships.filter((g) => g.jobs.some((x) => x.cargo.onBoard))
  }
  const out = ships.map((g) => {
    const open = g.jobs.filter((x) => x.cargo.onBoard)
    const unloaded = g.jobs.map((x) => x.cargo.unloadedOn).filter(Boolean).sort().pop() || null
    const arrived = g.jobs.map((x) => x.j.arrivedAt).filter(Boolean).sort()[0] || null
    const etas = open.map((x) => x.job.eta).filter(Boolean).sort()
    // the finder's position, only when it is this same ship (not a namesake)
    const f = g.names.map((n) => data.shipIds?.[n]).find((x) => x && typeof x.lat === 'number' && (!g.imo || !x.imo || String(x.imo) === g.imo))
    let last_heard = 'no position heard (the free ship finder hears little near India); use live_map'
    if (f) {
      const hrs = Math.round((Date.now() - new Date(f.seen_at)) / 3600000)
      last_heard = `${day(f.seen_at)} ${new Date(f.seen_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: TZ })} (${hrs < 1 ? 'under an hour' : `${hrs} h`} ago): ${seaArea(f.lat, f.lon)} (${f.lat.toFixed(2)}, ${f.lon.toFixed(2)})`
        + `${typeof f.sog === 'number' ? `, ${f.sog.toFixed(1)} knots` : ''}${NAV[f.nav_status] ? `, ${NAV[f.nav_status]}` : ''}${f.destination ? `, going to ${f.destination}` : ''}`
    }
    return {
      ship: g.names.join(' / '), imo: g.imo || (g.mmsi ? 'not known (radio no. known, map works)' : 'not added yet (type it on the Vessels page)'),
      status: !open.length ? `our cargo already unloaded${unloaded ? ` (${day(unloaded)})` : arrived ? ` (ship arrived ${day(arrived)})` : ''}: no longer tracked` : arrived ? `at port since ${day(arrived)}, unloading` : 'at sea, our cargo on board',
      eta: etas.length ? day(etas[0]) : null,
      jobs: g.jobs.map((x) => `${x.job.job_no} · ${x.job.client || 'No client'}${x.j.phase === 'delivered' ? ' (finished)' : !x.cargo.onBoard ? ' (unloaded)' : ''}${x.job.eta ? `, ETA ${day(x.job.eta)}` : ''}`),
      last_heard,
      live_map: open.length && (g.imo || g.mmsi) ? VESSELS_PAGE : null,
    }
  }).sort((a, b) => (/^at sea/.test(a.status) ? 0 : 1) - (/^at sea/.test(b.status) ? 0 : 1))
  return { total: out.length, ships: out.slice(0, 20), vessels_page: VESSELS_PAGE }
}

// Runs one tool call. person decides which jobs they may see.
export function runTool(name, args, data, person) {
  return compact(runToolRaw(name, args, data, person))
}
function runToolRaw(name, args, data, person) {
  const jobs = jobsFor(person, data.jobs)
  const rows = jobs.map((job) => ({ job, j: isDelivered(job) ? { phase: 'delivered', attention: [], freeDaysLeft: null, beFiled: true } : journeyFor(job, data) }))
  if (name === 'list_jobs') {
    const test = FILTERS[args?.situation] || FILTERS.open
    const c = norm(args?.client)
    const hits = rows.filter(test).filter((r) => !c || norm(r.job.client).includes(c))
    const limit = Math.min(Math.max(Number(args?.limit) || 15, 1), 40)
    return { situation: args?.situation || 'open', client: args?.client || null, total: hits.length, shown: Math.min(limit, hits.length), jobs: hits.slice(0, limit).map((r) => jobFacts(r.job, data)) }
  }
  if (name === 'get_job') {
    const ref = norm(args?.ref)
    const num = ref.replace(/^J/, '')
    const job = jobs.find((x) => norm(x.job_no) === ref || norm(x.job_no).replace(/^J/, '') === num)
      || jobs.find((x) => ref.length === 7 && norm(x.be_no) === ref)
      || jobs.find((x) => parseContainerNos(x.containers).includes(ref))
      || jobs.find((x) => ref.length >= 6 && norm(x.bl_no) === ref)
      || jobs.find((x) => ref.length >= 6 && truckNos(x).includes(ref))
    return job ? jobFacts(job, data, true) : { not_found: args?.ref }
  }
  if (name === 'clients_overview') {
    const c = norm(args?.name)
    const by = {}
    for (const r of rows) {
      if (c && !norm(r.job.client).includes(c)) continue
      const k = r.job.client || 'No client'
      by[k] ||= { client: k, open_jobs: 0, urgent: 0, finished: 0 }
      if (r.j.phase === 'delivered') by[k].finished++
      else { by[k].open_jobs++; if (r.j.attention.some((a) => a.level === 'red')) by[k].urgent++ }
    }
    return { clients: Object.values(by).sort((a, b) => b.open_jobs - a.open_jobs).slice(0, 40) }
  }
  if (name === 'today_counts') {
    const n = (k) => rows.filter(FILTERS[k]).length
    return { date: day(new Date().toISOString()), open: n('open'), urgent: n('urgent'), detention: n('detention'), free_days_low: n('free_days_low'), be_not_filed: n('be_not_filed'), waiting_ooc: n('waiting_ooc'), ooc_done_not_moved: n('ooc_done_not_moved'), on_the_move: n('on_the_move'), arriving_soon: n('arriving_soon') }
  }
  if (name === 'search_jobs') {
    const a = args || {}
    const has = has2
    const test = FILTERS[a.situation] || FILTERS.all
    const wantMode = norm(a.mode)
    const port = PORT_ALIAS[norm(a.port)] || norm(a.port)
    const words = String(a.text || '').split(/\s+/).map(norm).filter(Boolean)
    const hits = []
    for (const r of rows) {
      const job = r.job
      if (!test(r)) continue
      if (!has(job.client, a.client) || !has(job.vessel, a.vessel) || !has(job.cfs_name, a.cfs) || !has(job.rms_status, a.rms) || !has(job.priority, a.priority)) continue
      if (a.shipping_line && !has(`${job.shipping_line || ''} ${lineName(job.shipping_line) || ''}`, a.shipping_line)) continue
      if (wantMode) {
        const m = norm(job.mode)
        const key = /AIR/.test(wantMode) ? 'AIR' : /LCL/.test(wantMode) ? 'LCL' : /FCL/.test(wantMode) ? 'FCL' : wantMode
        if (!m.includes(key)) continue
      }
      if (port && !norm(job.port_code).includes(port) && !norm(job.port_name).includes(port)) continue
      if (a.has_truck !== undefined && a.has_truck !== null && truckNos(job).length > 0 !== !!a.has_truck) continue
      if (words.length) { const all = norm(Object.values(job).filter((v) => typeof v === 'string').join(' ')); if (!words.every((w) => all.includes(w))) continue }
      const full = r.j.phase === 'delivered' ? { ...journeyFor(job, data), phase: 'delivered' } : r.j
      if (a.leaves_by && (full.onwardMode || 'not decided') !== a.leaves_by) continue
      const docs = (data.documents || []).filter((d) => d.job_id === job.id).map((d) => norm(d.doc_type))
      if (a.has_document && !docs.includes(docType(a.has_document))) continue
      if (a.missing_document && docs.includes(docType(a.missing_document))) continue
      if (!inRange(job.created_at, a.created_from, a.created_to) || !inRange(job.be_date, a.be_from, a.be_to) || !inRange(full.oocDate, a.ooc_from, a.ooc_to)
        || !inRange(full.arrivedAt, a.arrived_from, a.arrived_to) || !inRange(job.eta, a.eta_from, a.eta_to)) continue
      hits.push({ job, full })
    }
    hits.sort((x, y) => String(y.job.created_at || '').localeCompare(String(x.job.created_at || '')))
    const avg = (pairs) => { const d = pairs.filter(([s, e]) => s && e).map(([s, e]) => (new Date(e) - new Date(s)) / 864e5).filter((n) => n >= 0 && n < 120); return d.length ? { days: Math.round((d.reduce((p, n) => p + n, 0) / d.length) * 10) / 10, from_jobs: d.length } : null }
    const stats = {
      total: hits.length, open: hits.filter((h) => h.full.phase !== 'delivered').length, finished: hits.filter((h) => h.full.phase === 'delivered').length,
      avg_be_to_ooc: avg(hits.map((h) => [h.job.be_date, h.full.oocDate])), avg_arrival_to_ooc: avg(hits.map((h) => [h.full.arrivedAt, h.full.oocDate])),
    }
    const filters = Object.fromEntries(Object.entries(a).filter(([k, v]) => v !== undefined && v !== null && v !== '' && k !== 'limit' && k !== 'group_by'))
    if (a.group_by) {
      const keyOf = {
        client: (h) => h.job.client || 'No client', shipping_line: (h) => lineName(h.job.shipping_line) || h.job.shipping_line || 'Not set', mode: (h) => h.job.mode || 'Not set',
        status: (h) => h.full.phase, port: (h) => h.job.port_code || 'Not set', cfs: (h) => h.job.cfs_name || 'Not set', rms: (h) => h.job.rms_status || 'Not set',
        created_month: (h) => (ymd(h.job.created_at) || 'unknown').slice(0, 7), leaves_by: (h) => h.full.onwardMode || 'not decided',
      }[a.group_by] || ((h) => h.job.client || 'No client')
      const groups = {}
      for (const h of hits) groups[keyOf(h)] = (groups[keyOf(h)] || 0) + 1
      return { filters, group_by: a.group_by, ...stats, groups: Object.entries(groups).sort((x, y) => y[1] - x[1]).slice(0, 40).map(([k, n]) => ({ [a.group_by]: k, jobs: n })) }
    }
    const limit = Math.min(Math.max(Number(a.limit) || 12, 1), 40)
    return {
      filters, ...stats, shown: Math.min(limit, hits.length),
      jobs: hits.slice(0, limit).map((h) => ({ ...jobFacts(h.job, data), ...(h.full.phase === 'delivered' ? { next_step: 'Finished', problems: [] } : {}), status: phaseLabel(h.full.phase), created: day(h.job.created_at), arrived: day(h.full.arrivedAt), shipping_line: lineName(h.job.shipping_line) || h.job.shipping_line || null, cfs: h.job.cfs_name || null, rms: h.job.rms_status || null })),
    }
  }
  if (name === 'container_history') {
    const no = norm(args?.container)
    const t = data.containersByNo[no] || Object.values(data.containersByNo).find((x) => no.length >= 4 && norm(x.container_no).endsWith(no))
    const job = jobs.find((x) => parseContainerNos(x.containers).includes(t ? norm(t.container_no) : no))
    if (!job) return { not_found: args?.container }
    if (!t) return { container: no, job: job.job_no, client: job.client || null, tracking: 'not tracked yet' }
    const ms = (Array.isArray(t.milestones) ? t.milestones : []).filter((m) => m?.date).sort((x, y) => String(x.date).localeCompare(String(y.date)))
    const trip = containerTrip(t, job)
    return {
      container: t.container_no, job: job.job_no, client: job.client || null, size: t.container_size || null, vessel: t.vessel || null, terminal: t.terminal || null,
      shipping_line: t.shipping_line_ldb || null, last_event: t.status_text || null, where_now: t.current_location || null,
      port_in: day(trip.portIn), left_with_cargo: day(trip.exitAt), empty_back: day(trip.returnedAt),
      events: ms.slice(-40).map((m) => `${day(m.date)} ${new Date(m.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}: ${m.description || m.event || m.status || ''}${m.location ? ` · ${m.location}` : ''}`),
    }
  }
  if (name === 'ship_info') return shipInfo(args, data, rows)
  if (name === 'recent_activity') {
    const a = args || {}
    const from = a.from || ymd(new Date().toISOString())
    const kinds = { container: ['container_update'], ooc: ['ooc_granted'], stage: ['stage_update'], truck: ['truck_dispatched'], document: ['document_upload'], job_created: ['job_created'], detention: ['detention_alert'], note: ['note', 'comment', 'note_added'] }[a.kind]
    const jn = norm(a.job).replace(/^J/, '')
    const mine = new Set(jobs.map((x) => x.job_no))
    const hits = (data.activity || []).filter((x) => {
      if (x.job_no && !mine.has(x.job_no)) return false
      if (jn && norm(x.job_no).replace(/^J/, '') !== jn) return false
      if (kinds && !kinds.includes(x.action || x.type)) return false
      if (a.person && !has2(`${x.done_by_name || ''} ${x.user_name || ''}`, a.person)) return false
      return inRange(x.created_at, jn && !a.from ? null : from, a.to)
    })
    const limit = Math.min(Math.max(Number(a.limit) || 25, 1), 60)
    const counts = {}
    for (const x of hits) counts[x.action || x.type || 'other'] = (counts[x.action || x.type || 'other'] || 0) + 1
    return {
      from: jn && !a.from ? 'last 30 days' : from, to: a.to || 'now', note: 'Only the last 30 days are kept here.', total: hits.length, counts, shown: Math.min(limit, hits.length),
      items: hits.slice(0, limit).map((x) => `${day(x.created_at)} ${new Date(x.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}: ${x.title || x.action}${x.note ? ` (${String(x.note).slice(0, 90)})` : ''}${x.done_by_name || x.user_name ? ` [${x.done_by_name || x.user_name}]` : ''}`),
    }
  }
  if (name === 'list_containers') {
    const want = EVENT_ALIAS[norm(args?.last_event)] || norm(args?.last_event)
    const pool = [] // every current box before the event filter, to say which events exist
    const stage = args?.stage && args.stage !== 'any' ? args.stage : null
    const c = norm(args?.client)
    const jn = norm(args?.job).replace(/^J/, '')
    const place = norm(args?.place)
    const old = !!args?.include_old || !!jn
    const out = []
    for (const r of rows) {
      if (r.j.phase === 'delivered' && stage !== 'empty_back' && !old) continue
      if (c && !norm(r.job.client).includes(c)) continue
      if (jn && norm(r.job.job_no).replace(/^J/, '') !== jn) continue
      for (const no of parseContainerNos(r.job.containers)) {
        const t = data.containersByNo[no]
        if (!t) continue
        const trip = containerTrip(t, r.job)
        const fin = containerFinishedOn(t, r.job)
        const live = r.j.containers?.tracked?.find((x) => x.container_no?.toUpperCase() === no)
        const freeLeft = live?.freeLeft ?? null
        const ev = String(t.status_text || '').toUpperCase().trim()
        const st = boxStage(t, r.job, trip, fin, freeLeft)
        if (stage && st !== stage) continue
        const lastAt = (Array.isArray(t.milestones) ? t.milestones : []).map((m) => m?.date).filter(Boolean).sort().at(-1)
        // current containers only: skip boxes already back empty, and boxes with no
        // movement for 30+ days (most likely finished but never marked), unless asked
        if (!stage && !old && st === 'empty_back') continue
        if (!stage && !old && lastAt && Date.now() - new Date(lastAt).getTime() > 30 * 864e5) continue
        if (place && !has2(t.current_location, args.place) && placeType(t.current_location, ev).toUpperCase() !== place) continue
        if (!inRange(lastAt, args?.moved_from, args?.moved_to)) continue
        const row = { container: no, job: r.job.job_no, client: r.job.client || null, last_event: ev || null, where: t.current_location || null, place_type: placeType(t.current_location, ev), when: day(lastAt), stage: st, free_days_left: freeLeft }
        pool.push(row)
        // exact event, or a short word for a group ("ICD" = ICD IN / ICD OUT)
        if (!want || norm(ev) === want || (want.length <= 4 && norm(ev).startsWith(want))) out.push(row)
      }
    }
    const limit = Math.min(Math.max(Number(args?.limit) || 30, 1), 60)
    const byEvent = {}
    for (const x of out) byEvent[x.last_event || 'none'] = (byEvent[x.last_event || 'none'] || 0) + 1
    if (want && !out.length) {
      const now = {}
      for (const x of pool) now[x.last_event || 'none'] = (now[x.last_event || 'none'] || 0) + 1
      return { filter: { last_event: args?.last_event, matched_as: want }, total: 0, note: `No current container has "${args?.last_event}" as its latest event. These are the latest events right now (use these exact names):`, events_now: now }
    }
    return { filter: { last_event: args?.last_event || null, stage: stage || 'any', client: args?.client || null, job: args?.job || null, place: args?.place || null, moved_from: args?.moved_from || null, moved_to: args?.moved_to || null, include_old: old }, total: out.length, shown: Math.min(limit, out.length), counts_by_last_event: byEvent, containers: out.slice(0, limit) }
  }
  return { error: `unknown tool ${name}` }
}

// Today's basics, given with every question so simple ones need no tool call
export function TODAY_BRIEF(data, person) {
  const counts = runTool('today_counts', {}, data, person)
  const lines = []
  for (const job of jobsFor(person, data.jobs)) {
    if (isDelivered(job)) continue
    const j = journeyFor(job, data)
    if (j.phase === 'delivered') continue
    const a = j.attention.find((x) => x.level === 'red') || j.attention.find((x) => x.level === 'amber')
    if (a) lines.push(`${a.level === 'red' ? 'URGENT' : 'TO DO'} ${job.job_no} ${job.client || ''}: ${a.text}`)
  }
  lines.sort((x, y) => (x.startsWith('URGENT') ? 0 : 1) - (y.startsWith('URGENT') ? 0 : 1))
  return `Today's basics (from the portal, right now):
Counts: ${Object.entries(counts).filter(([k]) => k !== 'date').map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ')}.
Jobs that need attention:
${lines.slice(0, 20).join('\n') || 'none'}${lines.length > 20 ? `\n(+${lines.length - 20} more: use search_jobs)` : ''}
For anything not shown here (a job's details, containers, a client's jobs, other lists), use the tools.`
}

// Exact date ranges, so the AI never has to work out "this week" itself
function dateRanges(now) {
  const t = ymd(now.toISOString())
  const d = (n) => { const x = new Date(`${t}T12:00:00+05:30`); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA', { timeZone: TZ }) }
  const dow = (new Date(`${t}T12:00:00+05:30`).getUTCDay() + 6) % 7 // Monday = 0
  const [y, m] = t.split('-').map(Number)
  const lastMonthEnd = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10)
  return `Date ranges: today ${t}; yesterday ${d(-1)}; this week ${d(-dow)} to ${t}; last week ${d(-dow - 7)} to ${d(-dow - 1)}; last 7 days ${d(-6)} to ${t}; this month ${t.slice(0, 8)}01 to ${t}; last month ${lastMonthEnd.slice(0, 8)}01 to ${lastMonthEnd}.`
}

export const SYSTEM_PROMPT = (person, now = new Date()) => `You are "JDS AI Assistant", the WhatsApp assistant of JDS Logistics (if asked your name, say JDS AI Assistant), a customs broker (CHA) in Navi Mumbai that clears IMPORT cargo at JNPT / Nhava Sheva, Mumbai Port and Mumbai air cargo, and moves it to the client's warehouse by truck or by rail.
You are talking to ${person?.name || 'a JDS team member'} (JDS staff).
Today is ${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })}, ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: TZ })} India time.
${dateRanges(now)}

Rules:
- JDS job facts (jobs, containers, clients, customs, detention, trucks, rail) come ONLY from "Today's basics" below or the tools. Never invent numbers, dates or statuses; if not found, say so.
- Your job facts are what the portal has saved (at most a few minutes old); customs_last_checked says when Customs was last asked. Never say you refreshed, re-pulled or re-checked unless you called check_customs_now in this reply, and never say the portal "auto-updates".
- When the person asks to check / refresh / check again / check live a job's customs or OOC, call check_customs_now for that job (if the tool exists). If it says started: reply only that you are checking with Customs now and the result follows in a separate message. If it says checked_recently: give that answer and when it was checked (Customs is asked at most once every 30 minutes per job); never call it a fresh or live check. If asked whether you really checked, say exactly what the "[checked: … check_customs_now …]" note shows. If check_customs_now is not available, say plainly you read the portal's saved data, give customs_last_checked, and that a fresh check is done on the BE & OOC page.
- Never give a reason the data does not state (e.g. do not say OOC is waiting because the cargo has not arrived). Only offer actions you can do (propose_change); never offer to file a BE, an OOC or anything in ICEGATE/LiveImpex.
- General customs/logistics questions (what an IGM, BE, OOC or DO is, how detention works, documents, HS codes) may be answered from your own knowledge; say when rules vary, and never present it as a fact about a JDS job.
- For counting or comparing jobs, check with the tools, then give only the answer.
- Changes: you can mark a job delivered, add or remove a truck (with the container it carries if said), record a BE number and date, set truck or rail, set who delivers (JDS or the client), add a note, attach the file the person just sent (attach_document with its type), set the ETA, the ship's name (set_vessel: the SHIP, never the shipping line), the shipping line, the CFS, free days, priority or the owner, add or remove a container (with its size), record an OOC seen in LiveImpex, create a new job (create_job: client, mode, port, BL, containers, ETA), record the CFS amount paid (record_payment, amount in rupees) and give a teammate a task (assign_task: to, task, due), by calling propose_change ONCE with the details. The same change on SEVERAL jobs ("mark 652, 667 and 690 delivered") = ONE propose_change with all job numbers in jobs. The bot then asks the person to reply YES; never say a change is done. If a detail is missing (e.g. the BE date), still call propose_change with what you have: it says what is missing, then ask for it. Never write a confirmation or "reply YES" yourself: only propose_change does that. Anything else (stages, deleting): say to use the portal. A new job can also be made from a file the person sends: the bot replies with a Create job link.
- Acting now (only when the person asks): send_document sends a job's file on WhatsApp ("send me J-652 BE"); check_truck_now asks FASTag where a truck is; find_ship_now asks ICEGATE for a job's ship (IMO) from its IGM; set_reminder / list_reminders / cancel_reminder for reminders (work out the date and time in India from today's date and time above); watch / list_watches / cancel_watch for "tell me when …" (say honestly how it is noticed, as the tool says); check_customs_many for Customs on several jobs ("check all waiting for OOC"); plan_my_day for "plan my day / what first"; send_report for an Excel report; send_pack for all of a job's papers in one PDF. Checks run at most once every 30 minutes per item. After an acting tool, do not describe what it did (sent, set, started, checking): the bot adds its own exact line; only answer any other part of the question. Container positions refresh by themselves every 30 minutes from container tracking (LDB): answer from the data and give when it was last updated.
- Bot access (admins only): giving, changing or removing a phone number's access (view only / staff / full admin / remove) = propose_change set_access with phone, to (the name) and level; "who has access" = list_access. Never say a number was added: the bot asks Yes first.
- Voice notes are written out by the bot before you see them; answer them like typed messages and never repeat back what was said. Small hearing mistakes in job numbers are possible: if a job number does not exist, say so and ask.
- Reply in the question's language: an English question gets an English answer; Hindi or Hinglish only when the question itself is in Hindi/Hinglish. WhatsApp style: short, *bold* key facts, "• " bullets, no tables or headers, about 12 lines max unless a full list is asked.
- free_days_left below 0 = detention running that many days. Never mention tools, JSON or AI.
- Container tracking events (staff use these words): PORT IN (unloaded at the port), PORT OUT (left the port terminal, usually to a CFS), CFS IN / ICD IN (entered the CFS / ICD), CFS OUT / ICD OUT (left with cargo for the client; "CFS gate out" = CFS OUT), GATE IN / GATE OUT (a PORT gate, not a CFS), GATE CROSSED / TOLL PLAZA CROSSED (on the road), STATION CROSSED / LOADING (on rail), DPD (direct port delivery), DPE (export). Use place_type to say where it is (port, CFS, ICD, road, rail); never call an event or place by a name the data doesn't show. "Containers in port out" or "port out containers" = containers whose latest event is PORT OUT: use list_containers with last_event. Same for any other event name.
- Which tool: one job / container / BE / BL / truck number → get_job. Jobs by ANY field, date range, count, "how many", "per client", averages → search_jobs (combine filters freely; use group_by for counts per group). A container's full journey → container_history. "What happened", updates, who did what, uploads → recent_activity. Containers by event, place or movement date → list_containers. A ship / vessel (where is it, its IMO, which jobs are on it, at sea or arrived, "ship of J-519", "which ships are at sea") → ship_info. "Ships at sea" / the ship list = ships still carrying our cargo; once our cargo is unloaded a ship is no longer tracked. A ship position is only "last heard" (give the time and say it is not live); for the live position give the Vessels page link (live_map). Never guess a position.
- Use the date ranges above exactly as given (YYYY-MM-DD). "OOC granted / BE filed / arrived in a period" → search_jobs with ooc_/be_/arrived_ dates (the real dates); recent_activity only shows when staff recorded something in the portal.
- The portal holds only one money figure: the CFS amount per job (record_payment). It does NOT hold: other payments, duty or invoice amounts, freight rates, bank details, phone numbers or emails of clients/CFS/transporters, or the contents of documents. If asked, say plainly the portal doesn't have that. Only for duty suggest ICEGATE / LiveImpex; for DO or line charges the shipping line. Never invent other places to look.
- If a tool answers with not_found or zero jobs, say so plainly and suggest the closest thing you can check (e.g. a similar client name).
- Follow-ups: your earlier replies end with "[checked: …]" = the exact checks behind them (never write such a line yourself). "What about X" = the same check with X changed. "Are you sure?" / "check again" = run the same check again; if it agrees, say yes and why (event, place, date); if your earlier answer was wrong, say so plainly and give the right one. Never contradict yourself without explaining.
- If a check finds nothing, say what the data DOES show (e.g. the events containers are at right now), not just "none".
- Don't ask the user to clarify when the meaning is reasonably clear: pick the most likely meaning, answer it, and mention the other reading in one short line if useful.
- Bold in WhatsApp is single asterisks: *like this*. Never use **double**, and never bold inside bold.`
