// Ship / container tracking from Safecube (Jose, 24 Oct 2026). JDS used to type
// each container on every shipping line's website to see the ETA, the ship and
// where it is. This looks up each new sea job's carrier BL (or, for a house BL,
// one of its containers) on Safecube and keeps the answer in sea_tracking.
// NOT ULIP. Safecube's free trial allows 50 shipments, so:
//  • a BL counts once however many containers it has, so a carrier BL is used first
//  • only sea imports whose containers are not in port yet are looked up
//  • jobs opened before the trial are only tracked when staff ask (start: true)
//  • every number is counted per month (sea_track_usage) and the function stops at MONTH_CAP
//  • once the ship has arrived the job is marked done and never looked up again
//
// Calls:
//  • scheduler (x-bot-secret), every 3 hours: adds new jobs, refreshes tracked ones
//  • staff (signed in) or scheduler: { jobId } refresh one, { jobId, start: true } start one
//  • { sandbox: 'ZZZZ0000000' } Safecube's free test numbers (nothing saved)
//  • { sealines: true } the lines Safecube covers; { usage: true } this month's count
import { adminClient, corsHeaders, getCaller, json } from '../_shared/ulip.ts'
import { lineName } from '../_shared/portal/shippingLines.js'
import { containerTrip, isOldVoyage } from '../_shared/portal/journeyCore.js'

const API = 'https://api.sinay.ai/container-tracking/api/v2'
const MONTH_CAP = 45                 // trial: 50 shipments; 5 kept spare
const AUTO_FROM = '2026-10-24'       // jobs opened from the trial's first day are added by themselves
// every hour now (Jose, 25 Oct 2026: alerts within 1.5 hours)
const REFRESH_HOURS = 1
const STAFF_REFRESH_MINUTES = 10
const env = (k: string) => (Deno.env.get(k) || '').trim()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const month = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7) // India month
const clean = (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const boxNos = (v: unknown) => String(v || '').toUpperCase().match(/[A-Z]{4}\d{7}/g) || []

async function call(path: string, params: Record<string, string | boolean> = {}) {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  const res = await fetch(`${API}/${path}${q.size ? `?${q}` : ''}`, { headers: { API_KEY: env('SAFECUBE_API_KEY'), Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) })
  const text = await res.text()
  let body: any = null
  try { body = JSON.parse(text) } catch { body = { message: text.slice(0, 200) } }
  return { ok: res.ok, status: res.status, body }
}

// Safecube's lines (cached while the function stays warm)
let linesCache: any[] | null = null
async function sealines() {
  if (linesCache) return linesCache
  const r = await call('sealines')
  if (!r.ok) throw new Error(`sealines: ${r.status} ${r.body?.errorCode || r.body?.message || ''}`)
  linesCache = (r.body?.sealines || []).filter((s: any) => s.active !== false)
  return linesCache!
}
const tidy = (s: unknown) => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
// the job's line ("Evergreen", "HUNGA A LINE") → Safecube's SCAC
function scacFor(line: unknown, lines: any[]) {
  const want = tidy(lineName(line) || line).replace(/\s+(LINES?|SHIPPING)$/, '')
  if (!want) return null
  const alias: Record<string, string> = { 'HUNGA A': 'HEUNG A', 'TS LINE': 'T S LINES', 'TS': 'T S LINES' }
  const w = alias[want] || want
  const hit = lines.find((s) => tidy(s.name) === w) || lines.find((s) => tidy(s.name).startsWith(w) || w.startsWith(tidy(s.name)))
    || lines.find((s) => tidy(s.name).replace(/\s/g, '').includes(w.replace(/\s/g, '')))
  return hit?.scacCodes?.[0] || null
}

// What to look up for a job: a carrier BL (its first 4 letters are a line's BL
// prefix) counts once for all its containers; a house BL can't be tracked, so
// then the job's first container (all its boxes normally sail together).
// Carrier BLs start with the line's SCAC (EGLV…, HDMU…); Safecube's "prefixes" are
// container owner codes, so they don't count here. A few lines use a BL code
// Safecube files under another id.
const BL_CODE: Record<string, string> = { HASL: '11QU' } // Heung-A
function pickNumber(job: any, lines: any[]) {
  const bl = clean(job.bl_no)
  if (bl.length >= 8) {
    const code = BL_CODE[bl.slice(0, 4)] || bl.slice(0, 4)
    const s = lines.find((x) => (x.scacCodes || []).includes(code))
    if (s && s.activeTypes?.bl !== false) return { number: bl, type: 'BL', scac: code }
  }
  const box = boxNos(job.containers)[0]
  if (box) return { number: box, type: 'CT', scac: scacFor(job.shipping_line, lines) }
  return null
}

const when = (v: unknown) => (v && !isNaN(new Date(String(v)).getTime()) ? new Date(String(v)).toISOString() : null)
// Safecube's answer → one row (events refer to locations / vessels by id)
function summarize(d: any) {
  const m = d?.metadata || {}
  const byId = (arr: any[], v: any) => (v && typeof v === 'object' ? v : (arr || []).find((x: any) => x?.id === v) || null)
  const place = (v: any) => { const l = byId(d?.locations, v); return l ? [l.name, l.countryCode].filter(Boolean).join(', ') : null }
  const ship = (v: any) => byId(d?.vessels, v)
  const pol = d?.route?.pol || {}, pod = d?.route?.pod || {}
  const events: any[] = []
  for (const c of d?.containers || []) for (const e of c?.events || []) events.push({ ...e, box: c.number })
  const at = (e: any) => new Date(e?.date || 0).getTime()
  const done = events.filter((e) => e.isActual).sort((a, b) => at(b) - at(a))
  const next = events.filter((e) => !e.isActual).sort((a, b) => at(a) - at(b))
  const ev = (e: any) => (e ? { what: e.description || e.eventCode || null, code: e.eventCode || null, where: place(e.location), when: when(e.date), box: e.box || null, vessel: ship(e.vessel)?.name || null, voyage: e.voyage || null } : null)
  const ais = d?.routeData?.ais || {}
  const aisShip = ais?.data?.vessel ? ship(ais.data.vessel) || ais.data.vessel : null
  // the ship the cargo is on now: the AIS ship, else the latest move's / next move's ship
  const nowShip = aisShip || ship(done.find((e) => e.vessel)?.vessel) || ship(next.find((e) => e.vessel)?.vessel) || (d?.vessels || [])[0] || null
  const pos = ais?.data?.lastVesselPosition || null
  const coords = pos || d?.routeData?.coordinates || null
  // the sea route for the portal's map, thinned to about 300 points
  const ll = (p: any) => (typeof p?.lat === 'number' && typeof p?.lng === 'number' ? [Math.round(p.lat * 1e4) / 1e4, Math.round(p.lng * 1e4) / 1e4] : null)
  const segs = (d?.routeData?.routeSegments || []).map((s: any) => (s?.path || []).map(ll).filter(Boolean))
  const total = segs.reduce((n: number, s: any[]) => n + s.length, 0)
  const step = Math.max(1, Math.ceil(total / 300))
  const locLL = (v: any) => { const l = byId(d?.locations, v); return ll(l?.coordinates) }
  // ports where the cargo changes ship on the way (Jose, 24 Oct 2026: J-674 via Busan):
  // sea events at a port that is neither the loading nor the discharge port, in order
  const placeKey = (v: any) => { const l = byId(d?.locations, v); return l ? (l.locode || l.name) : null }
  const polKey = placeKey(pol.location), podKey = placeKey(pod.location)
  const via: any[] = []
  for (const e of [...events].sort((a, b) => at(a) - at(b))) {
    if (e.routeType === 'LAND') continue
    const k = placeKey(e.location)
    if (!k || k === polKey || k === podKey) continue
    let v = via.find((x) => x.key === k)
    if (!v) { v = { key: k, name: place(e.location), pos: locLL(e.location), arrive: null, leave: null, arrived: false, left: false, inShip: null, outShip: null }; via.push(v) }
    const sh = ship(e.vessel)?.name || null
    if (e.eventCode === 'ARRI' || e.eventCode === 'DISC') { v.arrive ||= when(e.date); v.arrived ||= !!e.isActual; v.inShip ||= sh }
    if (e.eventCode === 'DEPA' || e.eventCode === 'LOAD') { v.leave = when(e.date) || v.leave; v.left ||= !!e.isActual; v.outShip = sh || v.outShip }
  }
  const route = {
    segments: segs.map((s: any[]) => s.filter((_: any, i: number) => i % step === 0 || i === s.length - 1)).filter((s: any[]) => s.length > 1),
    pol: locLL(pol.location), pod: locLL(pod.location),
    // change: the cargo comes in on one ship and leaves on another (transhipment); else
    // the same ship just calls there
    via: via.map(({ key, ...v }) => ({ ...v, change: !!(v.inShip && v.outShip && v.inShip !== v.outShip) })),
  }
  return {
    status: m.shippingStatus || null, sealine: m.sealine || null, sealine_name: m.sealineName || null,
    pol: place(pol.location), pol_date: when(pol.date), pod: place(pod.location), pod_date: when(pod.date), pod_actual: !!pod.actual,
    predictive_eta: when(pod.predictiveEta),
    vessel_name: nowShip?.name || null, vessel_imo: nowShip?.imo ? String(nowShip.imo) : null, vessel_mmsi: nowShip?.mmsi ? String(nowShip.mmsi) : null,
    lat: typeof coords?.lat === 'number' ? coords.lat : null, lng: typeof coords?.lng === 'number' ? coords.lng : null,
    position_at: when(pos?.updatedAt || ais?.data?.updatedAt), ais_status: ais?.status || null,
    last_event: ev(done[0]), next_event: ev(next[0]),
    containers: (d?.containers || []).map((c: any) => {
      const last = (c.events || []).filter((e: any) => e.isActual).sort((a: any, b: any) => at(b) - at(a))[0]
      return { no: c.number, status: c.status || null, size: c.sizeType || null, last: ev(last) }
    }),
    warnings: Array.isArray(m.warnings) ? m.warnings : [], carrier_updated_at: when(m.updatedAt), route,
  }
}

async function lookUp(n: { number: string; type: string; scac: string | null }) {
  const params: Record<string, string | boolean> = { shipmentNumber: n.number, shipmentType: n.type, route: true, ais: true }
  if (n.scac) params.sealine = n.scac
  let r = await call('shipment', params)
  // the line refused the type or the line code (J-644, 25 Oct 2026: WRONG_TYPE for an
  // Evergreen box): ask again letting Safecube work them out (400s are not billed)
  // (Safecube puts the code in errorCode or, as for J-644, in message with errorCode 400)
  const refused = (x: any) => /WRONG_TYPE|TYPE_NOT_SUPPORTED|WRONG_SEALINE|SEALINE_NOT_SUPPORTED|AUTO_CANT_DETECT_TYPE/.test(`${x.body?.errorCode || ''} ${x.body?.message || ''}`)
  if (refused(r)) { delete params.shipmentType; r = await call('shipment', params) }
  if (refused(r) && params.sealine) { delete params.sealine; r = await call('shipment', params) }
  if (r.ok && !r.body?.errorCode) return { ok: true, row: summarize(r.body) }
  const code = r.body?.errorCode || `HTTP ${r.status}`
  // 400 / 500 answers are not billed by Safecube
  return { ok: false, billed: r.ok, error: `${code}${r.body?.message ? `: ${String(r.body.message).slice(0, 160)}` : ''}`, retry: /NO_RESPONSE|TEMPORARY|MAINTENANCE/.test(code) || r.status >= 500 }
}

// "J-689 — Ship arrived": once per job (a second arrival entry is never written)
const portWord = (p: unknown) => String(p || 'the port').replace(/^Jawaharlal Nehru(, IN)?/i, 'Nhava Sheva')
const portClock = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) : '')
async function logArrival(admin: any, job: any, row: any) {
  const { data: had } = await admin.from('activity_log').select('id').eq('action', 'ship_arrived').eq('job_id', job.id).limit(1)
  if (had?.length) return
  const ship = row.vessel_name ? ` (${row.vessel_name})` : ''
  await admin.from('activity_log').insert({
    type: 'ship_arrived', action: 'ship_arrived', title: `${job.job_no} — Ship arrived at ${portWord(row.pod)}`,
    note: `Arrived ${portClock(row.pod_date)}${ship}`, job_id: job.id, job_no: job.job_no, done_by_name: 'Ship tracking',
    meta: { job_id: job.id, job_no: job.job_no, port: portWord(row.pod), arrived_at: row.pod_date, vessel: row.vessel_name || null },
  })
}

// "J-674 — ETA moved to 23 Nov (+3 days)"
async function logEtaChange(admin: any, job: any, before: string, row: any) {
  const days = Math.round((new Date(row.pod_date).getTime() - new Date(before).getTime()) / 86400e3)
  const shift = days > 0 ? `+${days} day${days === 1 ? '' : 's'}, later` : `${days} day${days === -1 ? '' : 's'}, earlier`
  await admin.from('activity_log').insert({
    type: 'eta_changed', action: 'eta_changed', title: `${job.job_no} — ETA moved to ${portClock(row.pod_date)} (${shift})`,
    note: `Was ${portClock(before)}${row.vessel_name ? ` · ${row.vessel_name}` : ''}`, job_id: job.id, job_no: job.job_no, done_by_name: 'Ship tracking',
    meta: { job_id: job.id, job_no: job.job_no, from: before, to: row.pod_date, days },
  })
}

// The ship has arrived (or the job is finished): stop looking it up
function arrived(row: any) {
  if (row?.status === 'DELIVERED') return true
  return !!(row?.pod_actual && row?.pod_date && Date.now() - new Date(row.pod_date).getTime() > 86400e3)
}

async function usedThisMonth(admin: any) {
  const { count } = await admin.from('sea_track_usage').select('number', { count: 'exact', head: true }).eq('month', month())
  return count || 0
}

// One job: look up, save. `start` allows a number not yet counted this month.
async function track(admin: any, job: any, lines: any[], opts: { start?: boolean; by?: string; auto?: boolean }) {
  const { data: prev } = await admin.from('sea_tracking').select('*').eq('job_id', job.id).maybeSingle()
  const n = prev ? { number: prev.number, type: prev.number_type, scac: prev.sealine } : pickNumber(job, lines)
  if (!n) return { job: job.job_no, skipped: 'no BL or container number' }
  // a new number this month uses one of the trial's shipments
  const { data: counted } = await admin.from('sea_track_usage').select('number').eq('month', month()).eq('number', n.number).maybeSingle()
  if (!counted) {
    if (!prev && !opts.start && !opts.auto) return { job: job.job_no, skipped: 'not tracked yet' }
    if (await usedThisMonth(admin) >= MONTH_CAP) return { job: job.job_no, skipped: `monthly limit (${MONTH_CAP}) reached` }
  }
  const r = await lookUp(n)
  if (!counted && (r.ok || r.billed)) await admin.from('sea_track_usage').insert({ month: month(), number: n.number, job_no: job.job_no })
  const now = new Date().toISOString()
  const base = { job_id: job.id, job_no: job.job_no, number: n.number, number_type: n.type, sealine: n.scac, fetched_at: now, ...(prev ? {} : { started_by: opts.by || 'auto' }) }
  // the line still answers with this container's PREVIOUS trip (J-673, 1 Nov 2026: the box
  // was delivered at Chennai on 9 Aug, long before the job was opened on 27 Oct). That is
  // not this job's ship: nothing of it is kept, the job is not marked arrived, and the
  // hourly run keeps asking until the line shows the new trip (once the box is loaded).
  if (r.ok && isOldVoyage(r.row, job)) {
    const was = r.row.pod_date ? String(r.row.pod_date).slice(0, 10) : null
    await admin.from('sea_tracking').upsert({
      ...base, done: false, refresh_error: null,
      error: `the line still shows this container's previous trip${was ? ` (arrived ${was})` : ''}. The new trip shows once the box is loaded; checked every hour.`,
      status: null, pol: null, pol_date: null, pod: null, pod_date: null, pod_actual: null, predictive_eta: null,
      vessel_name: null, vessel_imo: null, vessel_mmsi: null, lat: null, lng: null, position_at: null,
      last_event: null, first_pod_date: null, track: [], eta_history: [],
    }, { onConflict: 'job_id' })
    return { job: job.job_no, number: n.number, old_trip: was }
  }
  if (!r.ok) {
    // a failed update of a ship we already follow: keep its last good position, ETA and
    // route on screen and try again next hour; only note the failure (Jose, 25 Oct
    // 2026: J-584 vanished from the map after one "500: UNEXPECTED_ERROR" from Safecube)
    if (prev && !prev.error && (prev.pod_date || typeof prev.lat === 'number')) {
      await admin.from('sea_tracking').update({ refresh_error: r.error, refresh_error_at: now }).eq('job_id', job.id)
      return { job: job.job_no, number: n.number, error: r.error, kept: 'last good data kept' }
    }
    // a number the line doesn't know: don't try it again by itself (staff can)
    await admin.from('sea_tracking').upsert({ ...base, error: r.error, done: prev?.done || (!r.retry && !!opts.auto && !prev) }, { onConflict: 'job_id' })
    return { job: job.job_no, number: n.number, error: r.error }
  }
  // the ship's position history for the map's track (one point per new position, last 300)
  const track: any[] = Array.isArray(prev?.track) ? prev.track : []
  const lastPt = track[track.length - 1]
  if (typeof r.row.lat === 'number' && (!lastPt || lastPt[0] !== r.row.lat || lastPt[1] !== r.row.lng)) track.push([r.row.lat, r.row.lng, r.row.position_at || now])
  // the ETA's history: the first ETA, and one entry each time it changes (for "ETA +3 days")
  const etaMs = (v: unknown) => (v ? new Date(String(v)).getTime() : NaN)
  const etas: any[] = Array.isArray(prev?.eta_history) ? prev.eta_history : []
  const lastEta = etas[etas.length - 1]?.eta ?? prev?.pod_date ?? null
  if (r.row.pod_date && etaMs(lastEta) !== etaMs(r.row.pod_date)) etas.push({ eta: r.row.pod_date, seen: now })
  const firstEta = prev?.first_pod_date || prev?.pod_date || r.row.pod_date || null
  const row = { ...base, ...r.row, track: track.slice(-300), first_pod_date: firstEta, eta_history: etas.slice(-30), error: null, refresh_error: null, done: arrived(r.row) }
  delete (row as any).next_event
  const { error } = await admin.from('sea_tracking').upsert({ ...row, last_event: { ...(r.row.last_event || {}), next: r.row.next_event } }, { onConflict: 'job_id' })
  if (error) return { job: job.job_no, error: `save: ${error.message}` }
  // the ship has just arrived: one "Ship arrived" entry, which the bell, WhatsApp and
  // desktop alerts all show (Jose, 25 Oct 2026: J-689 arrived with no notification)
  if (r.row.pod_actual && !prev?.pod_actual) await logArrival(admin, job, r.row)
  // the ETA moved by a day or more since the last check: one entry for the bell
  if (!r.row.pod_actual && prev?.pod_date && r.row.pod_date && Math.abs(etaMs(r.row.pod_date) - etaMs(prev.pod_date)) >= 86400e3) await logEtaChange(admin, job, prev.pod_date, r.row)
  return { job: job.job_no, number: n.number, type: n.type, status: r.row.status, eta: r.row.pod_date, arrived: r.row.pod_actual, vessel: r.row.vessel_name, imo: r.row.vessel_imo, pos: r.row.lat != null ? [r.row.lat, r.row.lng] : null, last: r.row.last_event, done: row.done, warnings: r.row.warnings }
}

// Sea imports still on the water: not air / export / finished, opened in the last
// 60 days, no container of the job in port yet, ship not marked as left
async function openSeaJobs(admin: any) {
  const since = new Date(Date.now() - 60 * 864e5).toISOString()
  const { data: jobs } = await admin.from('jobs').select('id, job_no, bl_no, containers, shipping_line, mode, job_type, stage, created_at, field_meta')
    .or('stage.is.null,stage.lt.7').gte('created_at', since)
  const sea = (jobs || []).filter((j: any) => j.mode !== 'Air' && j.job_type !== 'export' && !j.field_meta?.ship_left)
  const { data: boxes } = await admin.from('container_tracking').select('job_id, port_in').in('job_id', sea.map((j: any) => j.id))
  const inPort = new Set((boxes || []).filter((b: any) => b.port_in).map((b: any) => b.job_id))
  return sea.filter((j: any) => !inPort.has(j.id))
}

// A job whose container LDB already shows as PORT IN (or that reached OOC) is off the
// ship: its tracking row is closed as arrived, at the port-in time, so the job card and
// WhatsApp stop saying "at sea" with an old ETA (Jose, 25 Oct 2026: J-584). No Safecube
// call is made for it.
async function retireLanded(admin: any, jobIds?: string[]) {
  let q = admin.from('sea_tracking').select('job_id, pod, pod_date, pod_actual, done').eq('done', false)
  if (jobIds) q = q.in('job_id', jobIds)
  const { data: rows } = await q
  if (!rows?.length) return []
  const ids = rows.map((r: any) => r.job_id)
  const [{ data: jobs }, { data: boxes }] = await Promise.all([
    admin.from('jobs').select('id, job_no, stage, eta, created_at').in('id', ids),
    admin.from('container_tracking').select('job_id, port_in, milestones').in('job_id', ids),
  ])
  // this trip's port in only (a box's port_in can be from an earlier trip)
  const portIn = new Map<string, string>()
  for (const b of boxes || []) {
    const pin = containerTrip(b, (jobs || []).find((j: any) => j.id === b.job_id)).portIn
    if (pin && (!portIn.has(b.job_id) || pin < portIn.get(b.job_id)!)) portIn.set(b.job_id, pin)
  }
  const out = []
  for (const r of rows) {
    const job = (jobs || []).find((j: any) => j.id === r.job_id)
    const pin = portIn.get(r.job_id)
    if (!pin && Number(job?.stage || 0) < 7) continue
    const patch: any = { done: true }
    if (!r.pod_actual) {
      patch.pod_actual = true
      // the line's dates for an Indian port are port time saved as UTC; LDB's are real UTC
      const ms = pin ? new Date(pin).getTime() : NaN
      if (!isNaN(ms)) patch.pod_date = new Date(/,\s*IN$/i.test(String(r.pod || '')) ? ms + 5.5 * 3600e3 : ms).toISOString()
    }
    await admin.from('sea_tracking').update(patch).eq('job_id', r.job_id)
    out.push({ job: job?.job_no, closed: pin ? `port in ${pin}` : 'OOC done' })
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const admin = adminClient()
  if (!env('SAFECUBE_API_KEY')) return json({ success: false, error: 'SAFECUBE_API_KEY is not set' }, 500)
  let body: any = {}
  try { body = await req.json() } catch { /* scheduler sends {} */ }

  // who is asking: the scheduler, or signed-in JDS staff
  const cron = req.headers.get('x-bot-secret')
  let by = 'auto'
  if (cron !== null) {
    const { data: st } = await admin.from('bot_state').select('cron_token').eq('id', 1).maybeSingle()
    const allowed = [env('BOT_CRON_SECRET'), String(st?.cron_token || '').trim()].filter((v) => v.length >= 20)
    if (!allowed.includes(cron.trim())) return json({ success: false, error: 'Not allowed' }, 403)
  } else {
    const caller = await getCaller(req, admin)
    if (!caller) return json({ success: false, error: 'Please sign in' }, 401)
    by = caller.name
  }

  try {
    if (body.usage) return json({ success: true, month: month(), used: await usedThisMonth(admin), cap: MONTH_CAP })
    if (body.sealines) {
      const lines = await sealines()
      return json({ success: true, count: lines.length, lines: lines.map((s: any) => ({ name: s.name, scac: s.scacCodes, prefixes: s.prefixes, types: s.activeTypes, maintenance: s.maintenance })) })
    }
    // Safecube's own test numbers (free, nothing saved)
    if (body.sandbox) {
      const no = clean(body.sandbox)
      if (!no.startsWith('ZZZZ')) return json({ success: false, error: 'sandbox numbers start with ZZZZ' }, 400)
      const r = await call('shipment', { shipmentNumber: no, route: true, ais: true })
      return json({ success: r.ok, status: r.status, summary: r.ok && !r.body?.errorCode ? summarize(r.body) : null, error: r.body?.errorCode || null, keys: r.body && typeof r.body === 'object' ? Object.keys(r.body) : null, raw: body.raw ? r.body : undefined })
    }
    const lines = await sealines()
    // one job (staff: "Track this ship" / "Refresh")
    if (body.jobId) {
      const { data: job } = await admin.from('jobs').select('id, job_no, bl_no, containers, shipping_line, mode, job_type, stage, created_at, field_meta').eq('id', body.jobId).maybeSingle()
      if (!job) return json({ success: false, error: 'Job not found' }, 404)
      if (job.mode === 'Air') return json({ success: false, error: 'Air job: nothing to track at sea' }, 400)
      const { data: prev } = await admin.from('sea_tracking').select('fetched_at').eq('job_id', job.id).maybeSingle()
      if (cron === null && prev?.fetched_at && Date.now() - new Date(prev.fetched_at).getTime() < STAFF_REFRESH_MINUTES * 60e3) {
        return json({ success: true, skipped: 'checked a few minutes ago' })
      }
      if (body.preview) return json({ success: true, would_use: pickNumber(job, lines) })
      // already off the ship by LDB: close the row instead of spending a lookup
      const landed = await retireLanded(admin, [job.id])
      if (landed.length) return json({ success: true, skipped: 'container already in port (LDB)', landed })
      const out = await track(admin, job, lines, { start: !!body.start, by })
      return json({ success: !out.error, ...out, used: await usedThisMonth(admin), cap: MONTH_CAP })
    }

    // scheduler: close rows LDB says have landed, refresh tracked jobs, add new ones
    // (opened since the trial began)
    const landed = await retireLanded(admin)
    const open = await openSeaJobs(admin)
    const { data: rows } = await admin.from('sea_tracking').select('job_id, done, fetched_at').in('job_id', open.map((j: any) => j.id))
    const state = new Map((rows || []).map((r: any) => [r.job_id, r]))
    const results = []
    for (const job of open) {
      const s: any = state.get(job.id)
      if (s?.done) continue
      if (s?.fetched_at && Date.now() - new Date(s.fetched_at).getTime() < (REFRESH_HOURS - 0.5) * 3600e3) continue
      const isNew = !s && String(job.created_at).slice(0, 10) >= AUTO_FROM
      if (!s && !isNew) continue
      results.push(await track(admin, job, lines, { auto: true }))
      await sleep(1500)
    }
    return json({ success: true, checked: results.length, results, landed, used: await usedThisMonth(admin), cap: MONTH_CAP })
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500)
  }
})
