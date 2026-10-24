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

const API = 'https://api.sinay.ai/container-tracking/api/v2'
const MONTH_CAP = 45                 // trial: 50 shipments; 5 kept spare
const AUTO_FROM = '2026-10-24'       // jobs opened from the trial's first day are added by themselves
const REFRESH_HOURS = 3
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
  const route = {
    segments: segs.map((s: any[]) => s.filter((_: any, i: number) => i % step === 0 || i === s.length - 1)).filter((s: any[]) => s.length > 1),
    pol: locLL(pol.location), pod: locLL(pod.location),
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
  const r = await call('shipment', params)
  if (r.ok && !r.body?.errorCode) return { ok: true, row: summarize(r.body) }
  const code = r.body?.errorCode || `HTTP ${r.status}`
  // 400 / 500 answers are not billed by Safecube
  return { ok: false, billed: r.ok, error: `${code}${r.body?.message ? `: ${String(r.body.message).slice(0, 160)}` : ''}`, retry: /NO_RESPONSE|TEMPORARY|MAINTENANCE/.test(code) || r.status >= 500 }
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
  if (!r.ok) {
    // a number the line doesn't know: don't try it again by itself (staff can)
    await admin.from('sea_tracking').upsert({ ...base, error: r.error, done: prev?.done || (!r.retry && !!opts.auto && !prev) }, { onConflict: 'job_id' })
    return { job: job.job_no, number: n.number, error: r.error }
  }
  const row = { ...base, ...r.row, error: null, done: arrived(r.row) }
  delete (row as any).next_event
  const { error } = await admin.from('sea_tracking').upsert({ ...row, last_event: { ...(r.row.last_event || {}), next: r.row.next_event } }, { onConflict: 'job_id' })
  if (error) return { job: job.job_no, error: `save: ${error.message}` }
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
      const out = await track(admin, job, lines, { start: !!body.start, by })
      return json({ success: !out.error, ...out, used: await usedThisMonth(admin), cap: MONTH_CAP })
    }

    // scheduler: refresh tracked jobs, add new ones (opened since the trial began)
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
    return json({ success: true, checked: results.length, results, used: await usedThisMonth(admin), cap: MONTH_CAP })
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500)
  }
})
