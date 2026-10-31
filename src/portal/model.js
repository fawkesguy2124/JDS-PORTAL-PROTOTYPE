// The new portal's view model (Jose, 31 Oct 2026): plain functions that turn a
// journey row ({ job, j } from JourneyContext) into what the one-screen portal
// shows: the picker list, the red tag, the "where" card, the one next action,
// papers, containers and history. No React, no database: the rules stay in
// journeyCore.js and the writes in jobActions.js / BeStage.jsx.
import {
  isExportJob, isAirJob, isDelivered, jobTrucks, truckNos, plateNo, parseContainerNos, deliveryBy,
} from '../services/journey'
import { getContainerSize } from '../utils/jobHelpers'
import { portByCode } from '../utils/ports'
import { fmtDate, timeAgo } from '../industrial/ui'
import { portTime, notSailed } from '../industrial/SeaTracking'
import { recentJobIds } from '../industrial/recentJobs'
import { initials } from '../ui/utils'

const DAY = 24 * 60 * 60 * 1000

export const STAGES = ['arriving', 'customs', 'road', 'delivered']
export const STAGE_LABEL = { arriving: 'Arriving', customs: 'In customs', road: 'On the road', delivered: 'Delivered' }

// a date for the page: '' when there is none (fmtDate says '—')
const day = (iso) => (iso ? fmtDate(iso) : '')
const portName = (job) => portByCode(job?.port_code)?.name || ''
const strip = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, '')
const sameNo = (a, b) => !!a && !!b && String(a).toUpperCase().replace(/\s+/g, '') === String(b).toUpperCase().replace(/\s+/g, '')
const jobNum = (job) => Number(String(job?.job_no || '').replace(/\D/g, '')) || 0

// ── who may do what (today's effective rules, see BUILD-SPEC §1.3) ──
export function perms(profile) {
  const name = profile?.name || ''
  const role = profile?.role
  const isAdmin = role === 'admin'
  const isFieldOps = role === 'field_ops'
  const isOffice = role === 'admin' || role === 'employee'
  return {
    isAdmin, isFieldOps, isOffice,
    canEditBE: isAdmin || name === 'Akshyani',
    canUpdateStage: isAdmin || ['Trupti', 'Uphadhya'].includes(name),
    canCreateJob: isAdmin || isFieldOps || ['Uphadhya', 'Akshyani'].includes(name),
    canSetBeStage: isOffice,
    canManage: isAdmin,
    userName: name || '—',
  }
}

// ── stage on the list ──
export function listStage(row) {
  const { job, j } = row
  const arrived = !!j.steps?.find((s) => s.id === 'arrival')?.done
  if (isExportJob(job)) return (isDelivered(job) || j.phase === 'delivered') ? null : 'customs'
  switch (j.phase) {
    case 'arrival': return 'arriving'
    case 'docs': return arrived ? 'customs' : 'arriving'
    case 'ooc': return 'customs'
    case 'release': return 'road'
    case 'truck': return 'road'
    case 'delivered': return (!isDelivered(job) || (j.containers?.tracked || []).some((t) => !t.stale)) ? 'delivered' : null
    default: return null
  }
}

export function pageStage(row) {
  return listStage(row) ?? (isExportJob(row.job) ? 'shipped' : 'closed')
}

function beNotFiled(row, data) {
  const { job, j } = row
  const st = listStage(row)
  if (j.beFiled || j.oocDone || (st !== 'arriving' && st !== 'customs')) return false
  const arrived = !!j.steps?.find((s) => s.id === 'arrival')?.done
  if (arrived) return true
  const sea = data?.seaByJob?.[job.id]
  const etaIso = (sea && !sea.error && !sea.pod_actual && sea.pod_date) || job.eta
  if (!etaIso) return false
  const t = new Date(String(etaIso).length <= 10 ? `${etaIso}T00:00:00` : etaIso).getTime()
  return !isNaN(t) && t - Date.now() <= 2 * DAY
}

// the red tag on the page and the red dot on the list (first match wins)
export function riskOf(row, data) {
  const { job, j } = row
  if (isExportJob(job)) return null
  const st = listStage(row)
  const minFree = j.containers?.minFree ?? null
  if (minFree !== null && minFree < 0) return `Detention day ${-minFree}`
  if (j.beStage?.id === 'query') return 'Query raised'
  if (minFree === 0) return 'Last free day'
  if (minFree !== null && minFree <= 2) return `${minFree} free day${minFree === 1 ? '' : 's'}`
  if (beNotFiled(row, data)) return 'BE not filed'
  if ((j.trucks || []).some((t) => t.papers?.found && t.papers.tone === 'bad')) return 'Truck papers'
  if (job.detention_risk === 'high' && st !== 'delivered' && st !== null) return 'Detention risk'
  return null
}

export function toListItem(row, data) {
  const { job } = row
  const stage = listStage(row)
  return {
    id: job.id, jobNo: job.job_no, client: job.client || '—', stage,
    stageLabel: STAGE_LABEL[stage], risk: riskOf(row, data), ownerId: job.assigned_to || null,
    isExport: isExportJob(job), isAir: isAirJob(job),
  }
}

// a field person's list: everything on the road, plus export jobs with a truck
export function isFieldMove(row) {
  const { job } = row
  return listStage(row) === 'road' || (isExportJob(job) && !isDelivered(job) && truckNos(job).length > 0)
}

export function matchesPerson(row, personId, profiles = {}) {
  const { job } = row
  return job.assigned_to === personId || jobTrucks(job).some((t) => t.by && t.by === profiles[personId])
}

const STAGE_ORDER = (s) => STAGES.indexOf(s)
export function buildList(rows, data, { perms: p, personId = null, profiles = {} } = {}) {
  const items = []
  for (const r of rows || []) {
    if (personId) { if (!matchesPerson(r, personId, profiles)) continue }
    else if (p?.isFieldOps && !isFieldMove(r)) continue
    const it = toListItem(r, data)
    if (!it.stage) continue
    it._n = jobNum(r.job)
    items.push(it)
  }
  items.sort((a, b) => STAGE_ORDER(a.stage) - STAGE_ORDER(b.stage) || (b.risk ? 1 : 0) - (a.risk ? 1 : 0) || b._n - a._n)
  return items.map(({ _n, ...it }) => it) // eslint-disable-line no-unused-vars
}

export function ownerOf(job, profiles = {}) {
  const id = job?.assigned_to
  const name = id ? profiles[id] : null
  return name ? { id, name, initials: initials(name) } : null
}

// ── search ──
const stageWord = (row) => STAGE_LABEL[listStage(row)] || (isExportJob(row.job) ? 'Shipped' : 'Closed')

export function searchAll(rows, data, q, profiles = {}, listItems = []) { // eslint-disable-line no-unused-vars
  const raw = String(q || '').trim()
  const needle = strip(raw)
  const all = rows || []
  if (!needle) {
    const byId = Object.fromEntries(all.map((r) => [r.job.id, r]))
    const jobs = recentJobIds().map((id) => byId[id]).filter(Boolean).slice(0, 6)
      .map((r) => ({ id: r.job.id, a: r.job.job_no, b: r.job.client || '—', c: 'Recent', hl: null, hlIn: null }))
    return { people: [], jobs, lookup: null }
  }
  const people = Object.entries(profiles)
    .filter(([, name]) => name && strip(name).startsWith(needle))
    .slice(0, 4)
    .map(([id, name]) => ({ id, name, count: all.filter((r) => listStage(r) && matchesPerson(r, id, profiles)).length }))

  const jobs = []
  for (const r of all) {
    if (jobs.length >= 8) break
    const { job } = r
    const refs = job.ulip_refs || {}
    const air = isAirJob(job)
    const fields = [
      [job.job_no, 'no'], [job.client, 'client'],
      ...parseContainerNos(job.containers).map((v) => [v, 'Container']),
      [job.be_no, 'BE'], [job.bl_no, air ? 'AWB' : 'BL'], [refs.sb_no, 'SB'], [refs.mawb_no, 'AWB'],
      [refs.hawb_no, 'HAWB'], [refs.igm_no, 'IGM'],
      ...truckNos(job).map((v) => [v, 'Truck']),
    ]
    const hit = fields.find(([v]) => v && strip(v).includes(needle))
    if (!hit) continue
    const [value, label] = hit
    const base = { id: job.id, a: job.job_no, c: stageWord(r), hl: String(value) }
    if (label === 'no') jobs.push({ ...base, b: job.client || '—', hlIn: 'a' })
    else if (label === 'client') jobs.push({ ...base, b: job.client, hlIn: 'b' })
    else jobs.push({ ...base, b: `${label} ${value}`, hlIn: 'b' })
  }
  const lookup = needle.length >= 5 && /\d/.test(needle) ? raw : null
  return { people, jobs, lookup }
}

// ── deep links (BUILD-SPEC §5) ──
// null = nothing to act on (no params, or already the portal's own ?job= / ?manage= / ?edit=)
// else { job, manage, create, notFound }: what to open; the caller rewrites the URL.
const OWN = ['job', 'manage', 'edit']
export function parseDeepLink(search, rows, p) {
  const sp = new URLSearchParams(search || '')
  const keys = [...sp.keys()]
  if (!keys.some((k) => !OWN.includes(k))) return null
  const out = { job: null, manage: null, create: null, notFound: false }
  const create = sp.get('createFrom')
  if (create) { out.create = create; return out }
  const all = rows || []
  const has = (id) => all.some((r) => String(r.job.id) === String(id))
  const want = (id) => { if (has(id)) out.job = String(id); else out.notFound = true; return out }
  const tab = sp.get('tab')
  if (sp.get('job')) return want(sp.get('job'))
  if (tab === 'jobs' && sp.get('open')) return want(sp.get('open'))
  if (sp.get('jobId')) return want(sp.get('jobId'))
  if (tab === 'trucks' && sp.get('q')) {
    const x = sp.get('q')
    const r = all.find((row) => sameNo(row.job.job_no, x)) || all.find((row) => plateNo(x) && truckNos(row.job).includes(plateNo(x)))
    if (r) out.job = String(r.job.id)
    return out
  }
  if (['health', 'bot', 'overview'].includes(tab)) { if (p?.canManage) out.manage = tab; return out }
  if (tab === 'search' || tab === 'lookup') { out.manage = 'search'; return out }
  return out
}

// ── job page helpers ──
export function customsSteps(row, activity = []) {
  const { job, j } = row
  let steps
  if (isExportJob(job)) {
    steps = [
      { id: 'sb', label: 'SB filed', done: !!j.sbNo, date: day(job.ulip_refs?.sb_date), note: '' },
      { id: 'leo', label: 'LEO', done: !!j.leoDate, date: day(j.leoDate), note: 'Waiting' },
    ]
  } else {
    const bs = j.beStage?.id || null
    const stageAt = (ids) => {
      const a = (activity || []).find((r) => r.type === 'be_stage' && ids.includes(r.meta?.stage) && (!r.meta?.be_no || String(r.meta.be_no) === String(job.be_no)))
      if (a) return a.created_at
      return bs && ids.includes(bs) ? j.beStage?.at || null : null
    }
    const assessedNote = bs === 'query' ? 'Query raised' : bs === 'ao' ? 'With AO' : bs === 'ac' ? 'With AC' : ''
    steps = [
      { id: 'be', label: 'BE filed', done: !!(j.beFiled || j.oocDone), date: day(job.be_date), note: '' },
      { id: 'assessed', label: 'Assessed', done: !!(j.oocDone || ['rms', 'assessed', 'duty_paid', 'exam'].includes(bs)), date: day(stageAt(['assessed', 'rms'])), note: assessedNote, bad: bs === 'query' },
      { id: 'duty', label: 'Duty paid', done: !!(j.oocDone || ['duty_paid', 'exam'].includes(bs)), date: day(stageAt(['duty_paid'])), note: '' },
      { id: 'ooc', label: 'OOC', done: !!j.oocDone, date: day(j.oocDate), note: bs === 'exam' ? 'Examination' : '' },
    ]
  }
  const curIdx = steps.findIndex((s) => !s.done)
  return steps.map((s, i) => ({
    id: s.id, label: s.label, done: s.done, cur: i === curIdx,
    bad: i === curIdx && !!s.bad,
    date: s.done ? s.date : '',
    note: i === curIdx ? s.note : '',
  }))
}

export function deliveredSteps(row, activity = []) {
  const { job, j } = row
  const tracked = (j.containers?.tracked || []).filter((t) => !t.stale)
  const minFree = j.containers?.minFree ?? null
  const deliveredAt = (activity || []).find((a) => a.type === 'stage_update' && Number(a.meta?.new_stage) === 10)?.created_at
  return [
    { id: 'delivered', label: deliveryBy(job) === 'client' ? 'Collected' : 'Delivered', done: true, cur: false, bad: false, date: day(deliveredAt), note: '' },
    {
      id: 'empty', label: 'Empty returned', done: tracked.length === 0, cur: tracked.length > 0,
      date: tracked.length === 0 ? day(j.containers?.finishedOn) : '',
      bad: minFree !== null && minFree < 0,
      note: tracked.length === 0 ? '' : minFree !== null && minFree < 0 ? `Detention day ${-minFree}` : minFree !== null ? `${minFree} free day${minFree === 1 ? '' : 's'} left` : '',
    },
  ]
}

function arrivalText(job, data) {
  const sea = data?.seaByJob?.[job.id]
  if (sea && !sea.error && sea.pod_date) return `${sea.pod_actual ? 'Arrived' : 'Arrives'} ${portTime(sea.pod_date, false)}`
  if (job.eta) return `Arrives ${fmtDate(job.eta)}`
  return 'Arrival date not known'
}

// Still at the CFS: no container has left it with the cargo (LDB's CFS OUT / port exit
// for this trip), the stage is before "Vehicle Out" and no toll plaza has seen the truck.
// (containers.anyOut is not used: it is true as soon as a box leaves the PORT for the
// CFS, which would skip "Left CFS" on almost every FCL job.)
export const atCfsOf = (job, j) => !((j.containers?.tracked || []).some((t) => t.outWithCargo) || Number(job.stage) >= 9 || j.truckLocation)

export function whereOf(row, data) {
  const { job, j } = row
  const st = pageStage(row)
  if (st === 'arriving') {
    if (isAirJob(job)) return { kind: 'air', title: 'In the air', sub: arrivalText(job, data) }
    const sea = data?.seaByJob?.[job.id]
    return { kind: 'sea', title: notSailed(sea) ? 'Waiting to sail' : 'At sea', sub: arrivalText(job, data) }
  }
  if (st === 'customs') {
    if (isExportJob(job)) return { kind: 'customs', title: j.leoDate ? 'LEO given' : 'In customs', sub: portName(job) }
    return { kind: 'customs', title: 'In customs', sub: job.cfs_name || portName(job) }
  }
  if (st === 'road') {
    const place = j.onwardMove?.place || null
    if (j.onwardMode === 'rail') return { kind: 'rail', title: 'Going by rail', sub: place ? `Last seen ${place}` : (job.cfs_name || '') }
    if (truckNos(job).length === 0) return { kind: 'truck_needed', title: j.onwardMove ? `On the road${place ? ` · ${place}` : ''}` : 'Waiting for a truck', sub: job.cfs_name || '' }
    if (atCfsOf(job, j)) return { kind: 'road', title: 'Loading at CFS', sub: job.destination ? `To ${job.destination}` : '' }
    return {
      kind: 'road', title: 'On the way',
      sub: j.truckLocation ? `Seen at ${j.truckLocation.plaza} · ${timeAgo(j.truckLocation.at)}` : (job.destination ? `To ${job.destination}` : ''),
    }
  }
  if (st === 'shipped') return { kind: 'customs', title: 'Shipped', sub: portName(job) }
  return { kind: 'delivered', title: deliveryBy(job) === 'client' ? 'Collected by client' : 'Delivered', sub: job.destination || '' }
}

export function nextAction(row, p = {}) {
  const { job, j } = row
  const st = pageStage(row)
  const a = (kind, label, allowed, input = null) => ({ kind, label, allowed: !!allowed, input })
  if (st === 'arriving') {
    if (!j.beFiled) return a('be', 'File BE', p.canEditBE, 'be')
    if (Number(job.stage) < 4) return a('arrived', 'Mark arrived', p.canUpdateStage)
    return null
  }
  if (st === 'customs') {
    if (isExportJob(job)) {
      if (!j.sbNo) return a('sb', 'File SB', p.canEditBE, 'sb')
      if (!j.leoDate) return a('check_leo', 'Check LEO', true, 'leo')
      return a('close_export', 'Mark shipped', p.canUpdateStage)
    }
    const bs = j.beStage?.id || null
    if (!j.beFiled) return a('be', 'File BE', p.canEditBE, 'be')
    if (bs === 'query') return a('query_answered', 'Query answered', p.canSetBeStage)
    if (!bs || bs === 'ao' || bs === 'ac') return a('assessed', 'Assessed', p.canSetBeStage)
    if (bs === 'rms' || bs === 'assessed') return a('duty_paid', 'Duty paid', p.canSetBeStage)
    if (p.canUpdateStage) return a('ooc', 'OOC received', true)
    return a('check_ooc', 'Check OOC', /^\d{7}$/.test(String(job.be_no || '')) && !!job.be_date)
  }
  if (st === 'road') {
    if (j.onwardMode === 'rail') return a('delivered', 'Delivered', p.canUpdateStage)
    if (truckNos(job).length === 0) return a('truck', 'Assign', true, 'truck')
    if (atCfsOf(job, j) && Number(job.stage) < 9 && p.canUpdateStage) return a('left_cfs', 'Left CFS', true)
    if (p.canUpdateStage) return a('delivered', 'Delivered', true)
    return a('locate', 'Where is it?', true)
  }
  if (st === 'delivered') {
    if ((j.containers?.tracked || []).some((t) => !t.stale)) return a('empty', 'Empty returned', true)
    if (!isDelivered(job)) return a('close', 'Close job', p.canUpdateStage)
    return null
  }
  return null
}

// ── papers ──
const ORDER = ['BL', 'BE', 'SB', 'Invoice', 'Packing List', 'COO', 'Insurance', 'Examination Order', 'OOC', 'E-Way Bill', 'POD', 'Other']
export function paperRows(job, j, docs = []) {
  const air = isAirJob(job)
  const LABEL = {
    BL: air ? 'Air waybill' : 'Bill of lading', BE: 'Bill of entry', SB: 'Shipping bill', Invoice: 'Invoice', 'Packing List': 'Packing list',
    COO: 'Certificate of origin', Insurance: 'Insurance', 'Examination Order': 'Examination order', OOC: 'Out of charge',
    'E-Way Bill': 'E-way bill', POD: 'Proof of delivery',
  }
  const NUMBER = { BL: air ? (job.ulip_refs?.mawb_no || job.bl_no) : job.bl_no, BE: job.be_no, OOC: j?.customs?.ooc_no }
  const typeOf = (d) => (ORDER.includes(d.doc_type) && d.doc_type !== 'SB' ? d.doc_type : 'Other')
  const sorted = [...(docs || [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  const seen = new Set()
  const out = []
  for (const d of sorted) {
    const t = typeOf(d)
    const label = t === 'Other' ? String(d.file_name || 'Paper').replace(/\.[^.]+$/, '').slice(0, 32) : LABEL[t]
    const number = !seen.has(t) && NUMBER[t] ? String(NUMBER[t]) : null
    seen.add(t)
    out.push({ key: `d-${d.id}`, label, number, doc: d, _t: t })
  }
  const has = (t) => out.some((r) => r._t === t)
  if (job.bl_no && !has('BL')) out.push({ key: 'v-BL', label: LABEL.BL, number: String(NUMBER.BL || job.bl_no), doc: null, _t: 'BL' })
  if (job.be_no && !has('BE')) out.push({ key: 'v-BE', label: LABEL.BE, number: String(job.be_no), doc: null, _t: 'BE' })
  if (isExportJob(job) && job.ulip_refs?.sb_no) out.push({ key: 'v-SB', label: LABEL.SB, number: String(job.ulip_refs.sb_no), doc: null, _t: 'SB' })
  if (j?.customs?.ooc_no && !has('OOC')) out.push({ key: 'v-OOC', label: LABEL.OOC, number: String(j.customs.ooc_no), doc: null, _t: 'OOC' })
  // stable sort: by type order, keeping newest-first within a type
  return out
    .map((r, i) => ({ r, i }))
    .sort((a, b) => ORDER.indexOf(a.r._t) - ORDER.indexOf(b.r._t) || a.i - b.i)
    .map(({ r }) => ({ key: r.key, label: r.label, number: r.number, doc: r.doc }))
}

// ── containers ──
export function sizeLabel(code) {
  if (!code) return ''
  const c = String(code).toUpperCase().replace(/\s+/g, '')
  if (c === 'LCL') return 'LCL'
  const m = c.match(/^(\d{2})(GP|DV|ST|HC|HQ|RF|RH|OT|FR|TK)?$/)
  if (!m) return String(code)
  const kind = m[2] && !['GP', 'DV', 'ST'].includes(m[2]) ? ` ${m[2] === 'HQ' ? 'HC' : m[2] === 'RH' ? 'RF' : m[2]}` : ''
  return `${m[1]} ft${kind}`
}

export function containerRows(job) {
  return parseContainerNos(job?.containers).map((no) => ({ no, size: sizeLabel(getContainerSize(job, no)) }))
}

// ── history: the JobDrawer timeline (JobDrawer.jsx), as plain rows ──
export function historyItems(job, j, log = [], data = null) {
  const events = []
  for (const r of log || []) {
    if (r.type === 'note') continue
    const src = /container|ldb|port|cfs/i.test(r.type || '') ? 'ldb' : 'portal'
    events.push({ at: r.created_at, t: r.title || String(r.type || r.action || '').replace(/_/g, ' '), src, by: r.done_by_name })
  }
  const nos = parseContainerNos(job?.containers)
  for (const no of nos) {
    const c = data?.containersByNo?.[no]
    if (c?.port_in) events.push({ at: c.port_in, t: `${no} arrived at port`, src: 'ldb', ctr: true })
    if (c?.cfs_gate_in) events.push({ at: c.cfs_gate_in, t: `${no} entered CFS`, src: 'ldb', ctr: true })
    if (c?.port_out) events.push({ at: c.port_out, t: `${no} left the port`, src: 'ldb', ctr: true })
  }
  if (j?.oocDate && !(log || []).some((r) => r.type === 'ooc_granted')) events.push({ at: j.oocDate, t: `OOC granted${j.customs?.ooc_no ? ` (${j.customs.ooc_no})` : ''}`, src: 'icegate' })
  if (job?.created_at) events.push({ at: job.created_at, t: 'Job created', src: 'portal' })
  const time = (e) => new Date(e.at).getTime() || 0
  events.sort((a, b) => time(b) - time(a))
  let shown = events
  if (nos.length > 3) {
    const ctr = events.filter((e) => e.ctr)
    shown = events.filter((e) => !e.ctr)
    if (ctr.length) shown.push({ at: ctr[0].at, t: `${ctr.length} container updates`, src: 'ldb' })
    shown.sort((a, b) => time(b) - time(a))
  }
  return shown.slice(0, 30).map((e, i) => ({ key: `${i}-${e.at}`, date: day(e.at), text: e.by ? `${e.t} · ${e.by}` : e.t }))
}
