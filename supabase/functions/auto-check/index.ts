// Automatic checks, done like a person working through the list (Jose, 25 Oct 2026:
// J-667's OOC was granted on 24 Oct but JDS heard only on 25 Oct; every alert must
// reach JDS within about 1.5 hours, and ULIP must never see a robot pattern).
//
// What is watched (one row each in auto_checks):
//  • ooc:<job>      a job with a BE filed and no OOC yet → Customs (ICEGATE + JNPT) about
//                   once an hour; the customs-status function records "OOC granted",
//                   which the 15-minute alerts send on WhatsApp / desktop / bell
//  • truck:<plate>  a truck on the road (OOC done, not delivered) → FASTag about every
//                   1.5 hours; no new toll for 6 hours → "truck not moving" alert
//  • papers:<plate> every truck of an open job → VAHAN once a month; road tax, permit,
//                   fitness, insurance or PUC expired → "truck papers problem" alert
//
// The pace: the scheduler calls this every 5 minutes; each call does at most a couple
// of checks, 30-60 s apart, in the order they fall due. Every item gets a random
// interval (never on the clock). Two ULIP failures in a row pause everything for 2 hours
// (and say so). Every check is made through the portal's own functions, logged under
// "Auto-check", with their 30-minute repeat guard and office per-minute limits.
import { adminClient, corsHeaders, json } from '../_shared/ulip.ts'
import { jobTrucks, containerTrip, containerFinishedOn, parseContainerNos } from '../_shared/portal/journeyCore.js'
import { correctTrackingRow } from '../_shared/portal/eventOrder.js'

const env = (k: string) => (Deno.env.get(k) || '').trim()
const MIN = 60_000
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const AS = 'Auto-check'
const TIME_BUDGET_MS = 75_000         // stop starting new checks after this
const GAP_MS: [number, number] = [30_000, 60_000]
const EVERY: Record<string, [number, number]> = { ooc: [50, 70], air: [50, 70], truck: [75, 95], papers: [30 * 24 * 60, 31 * 24 * 60] } // minutes
const STUCK_HOURS = 6
const STUCK_MAX_HOURS = 36
const TRUCK_WATCH_DAYS = 4
const PAUSE_AFTER_ERRORS = 2
const PAUSE_MINUTES = 120

async function callFn(name: string, body: unknown, token: string) {
  const anon = env('SUPABASE_ANON_KEY')
  const res = await fetch(`${env('SUPABASE_URL')}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anon}`, apikey: anon, 'x-bot-secret': token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(110_000),
  })
  return await res.json().catch(() => ({ success: false, error: `error ${res.status}` }))
}

// What should be watched right now
async function wanted(admin: any) {
  const since = new Date(Date.now() - 60 * 24 * 60 * MIN).toISOString()
  const { data: jobs } = await admin.from('jobs').select('id, job_no, client, be_no, be_date, bl_no, port_code, stage, mode, job_type, trucks, truck_no, ulip_refs, containers, eta, field_meta, created_at, updated_at')
    .or('stage.is.null,stage.lt.10').gte('created_at', since)
  const open = (jobs || []).filter((j: any) => j.job_type !== 'export')
  const { data: cs } = await admin.from('customs_status').select('job_id, be_no, ooc_date').in('job_id', open.map((j: any) => j.id))
  const ooc = new Map((cs || []).map((r: any) => [r.job_id, r]))
  // air imports already found in Customs' air manifest (ICEGATE/09): no need to ask again
  const { data: airDone } = await admin.from('ulip_results').select('job_id').eq('api', 'ICEGATE/09').eq('found', true).in('job_id', open.map((j: any) => j.id))
  const manifested = new Set((airDone || []).map((r: any) => r.job_id))
  // what LDB already says about the boxes: a box that left with cargo had its OOC, and a
  // finished box (empty back, or collected by the client) needs no truck watch
  const nos = [...new Set(open.flatMap((j: any) => parseContainerNos(j.containers)))]
  const { data: boxRows } = nos.length ? await admin.from('container_tracking').select('container_no, status, port_in, milestones, last_refreshed_at').in('container_no', nos) : { data: [] }
  const boxes = new Map((boxRows || []).map((r: any) => [String(r.container_no).toUpperCase(), correctTrackingRow(r)]))
  const boxesOf = (j: any) => parseContainerNos(j.containers).map((n: string) => boxes.get(n)).filter(Boolean)
  const items = new Map<string, any>()
  for (const j of open) {
    const be = String(j.be_no || '').trim()
    const got = ooc.get(j.id) as any
    const hasOoc = got?.ooc_date && String(got.be_no) === be
    const leftWithCargo = boxesOf(j).some((r: any) => containerTrip(r, j).exitAt)
    if (/^\d{7}$/.test(be) && j.be_date && !hasOoc && !leftWithCargo && Number(j.stage || 0) < 7) {
      items.set(`ooc:${j.id}`, { key: `ooc:${j.id}`, kind: 'ooc', job_id: j.id, label: j.job_no })
    }
    // an air import not yet in the air manifest (IGM): ICEGATE/09 by MAWB + airport, about
    // hourly, until it is (Jose, 25 Oct 2026). The MAWB: the BL field when it is 11 digits
    // (air jobs keep it there), else the one typed in the job's Air cargo box.
    const blDigits = String(j.bl_no || '').replace(/\D/g, '')
    const mawb = blDigits.length === 11 ? blDigits : String(j.ulip_refs?.mawb_no || '').replace(/\D/g, '')
    if (/air/i.test(j.mode || '') && mawb.length === 11 && Number(j.stage || 0) < 7 && !manifested.has(j.id)) {
      const site = /^[A-Z0-9]{6}$/.test(String(j.port_code || '').toUpperCase()) ? String(j.port_code).toUpperCase() : 'INBOM4'
      items.set(`air:${j.id}`, { key: `air:${j.id}`, kind: 'air', job_id: j.id, label: j.job_no, meta: { mawb, site } })
    }
    for (const t of jobTrucks(j)) {
      if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}$|^\d{2}BH\d{4}[A-Z]{1,2}$/.test(t.no)) continue
      items.set(`papers:${t.no}`, { key: `papers:${t.no}`, kind: 'papers', job_id: j.id, label: `${t.no} (${j.job_no})` })
      // on the road: OOC done, the job not delivered yet, and the truck put on the job in
      // the last 4 days (a finished trip on a job nobody closed must not raise alarms)
      const since = t.at || j.updated_at
      const fresh = since && Date.now() - new Date(since).getTime() < TRUCK_WATCH_DAYS * 24 * 60 * MIN
      // ...and its container (or, with none named, every box of the job) not finished yet
      const mine = boxesOf(j).filter((r: any) => !t.container || String(r.container_no).toUpperCase() === String(t.container).toUpperCase())
      const finished = mine.length > 0 && mine.every((r: any) => containerFinishedOn(r, j))
      if (Number(j.stage || 0) >= 7 && Number(j.stage || 0) < 10 && j.mode !== 'Air' && fresh && !finished) {
        items.set(`truck:${t.no}`, { key: `truck:${t.no}`, kind: 'truck', job_id: j.id, label: `${t.no} (${j.job_no})`, meta: { plate: t.no, since } })
      }
    }
  }
  return { items, jobs: new Map(open.map((j: any) => [j.id, j])) }
}

// One entry in the activity log (the bell shows it; the 15-minute alerts send it on)
async function log(admin: any, action: string, title: string, note: string, job: any, meta: Record<string, unknown>) {
  await admin.from('activity_log').insert({
    type: action, action, title, note, job_id: job?.id || null, job_no: job?.job_no || null, done_by_name: AS,
    meta: { ...meta, job_id: job?.id || null, job_no: job?.job_no || null },
  })
}
async function loggedBefore(admin: any, action: string, metaKey: string, value: string) {
  const { data } = await admin.from('activity_log').select('id').eq('action', action).eq(`meta->>${metaKey}`, value).limit(1)
  return !!data?.length
}

// One check. Returns { ok, error?, result } — ok:false only for a real ULIP / Customs failure.
async function runOne(admin: any, item: any, job: any, token: string) {
  if (item.kind === 'ooc') {
    const out = await callFn('customs-status', { jobId: item.job_id, asName: AS }, token)
    if (!out?.success) {
      const e = String(out?.error || 'no answer')
      // our own guards (needs a BE, already running, checked a moment ago) are not ULIP failures
      return { ok: /BE number|BE date|already running|Not allowed|not found/i.test(e), error: e, result: `not checked: ${e.slice(0, 140)}` }
    }
    const r = out.data || {}
    return { ok: true, result: r.ooc_date ? `OOC ${r.ooc_no || ''} dated ${String(r.ooc_date).slice(0, 10)}` : 'no OOC yet' }
  }
  if (item.kind === 'air') {
    const { mawb, site } = item.meta || {}
    const out = await callFn('ulip', { api: 'ICEGATE/09', params: { mawbNumber: mawb, custSite: site }, jobId: item.job_id, asName: AS }, token)
    if (!out?.success) {
      const e = String(out?.error || 'no answer')
      return { ok: /already running|cannot run this check|many (government )?checks/i.test(e), error: e, result: `not checked: ${e.slice(0, 140)}` }
    }
    const row = out.data || {}
    if (!row.found) return { ok: true, result: 'not in the air manifest yet' }
    const x = row.parsed?.extra || {}
    const f = (label: string) => row.parsed?.fields?.find((q: any) => q.label === label)?.value
    if (!(await loggedBefore(admin, 'air_igm', 'mark', String(mawb)))) {
      const bits = [f('IGM date') && `IGM date ${f('IGM date')}`, x.flightNumber && `flight ${x.flightNumber}`, f('Total packages') && `${f('Total packages')} pkg`, f('Gross weight') && `${f('Gross weight')} kg`].filter(Boolean)
      await log(admin, 'air_igm', `${job?.job_no || mawb} — Air cargo in the manifest (IGM ${x.igmRtn || '?'})`, bits.join(' · '), job,
        { mark: String(mawb), mawb, igm_no: x.igmRtn || null, igm_date: x.igmDate || null, flight: x.flightNumber || null })
    }
    return { ok: true, result: `in the manifest: IGM ${x.igmRtn || '?'}` }
  }
  const plate = String(item.key).split(':')[1]
  const api = item.kind === 'truck' ? 'FASTAG/01' : 'VAHAN/04'
  const out = await callFn('ulip', { api, params: { vehiclenumber: plate }, jobId: item.job_id, asName: AS }, token)
  if (!out?.success) {
    const e = String(out?.error || 'no answer')
    return { ok: /already running|cannot run this check|many (government )?checks/i.test(e), error: e, result: `not checked: ${e.slice(0, 140)}` }
  }
  const p = out.data?.parsed || {}
  const x = p.extra || {}
  if (item.kind === 'truck') {
    // no new toll crossing for 6-36 hours, on this trip (after the truck was put on the job):
    // say so once per crossing. Older than 36 h = the trip is surely over, no alarm.
    const seen = x.lastSeenAt ? new Date(x.lastSeenAt).getTime() : NaN
    const since = item.meta?.since ? new Date(item.meta.since).getTime() : 0
    const quiet = Date.now() - seen
    if (!isNaN(seen) && seen >= since && quiet > STUCK_HOURS * 60 * MIN && quiet < STUCK_MAX_HOURS * 60 * MIN) {
      const mark = `${plate}@${x.lastSeenAt}`
      if (!(await loggedBefore(admin, 'truck_stuck', 'mark', mark))) {
        const hrs = Math.round((Date.now() - seen) / (60 * MIN))
        await log(admin, 'truck_stuck', `${job?.job_no || plate} — Truck ${plate} not moving`, `No new toll crossing for ${hrs} hours (last: ${x.lastPlaza || 'unknown plaza'})`, job, { mark, plate, last_plaza: x.lastPlaza || null, last_seen: x.lastSeenAt, hours: hrs })
      }
    }
    return { ok: true, result: x.lastPlaza ? `last toll ${x.lastPlaza} ${x.lastSeenAt || ''}` : String(out.data?.summary || 'checked').slice(0, 160) }
  }
  // papers
  const problems: string[] = Array.isArray(x.problems) ? x.problems : []
  if (problems.length) {
    const mark = `${plate}|${problems.join('|')}`
    if (!(await loggedBefore(admin, 'truck_papers', 'mark', mark))) {
      await log(admin, 'truck_papers', `${job?.job_no || plate} — Truck ${plate} papers problem`, problems.join('; '), job, { mark, plate, problems })
    }
  }
  return { ok: true, result: problems.length ? `problem: ${problems.join('; ')}` : String(out.data?.summary || 'papers in date').slice(0, 160) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const admin = adminClient()
  const { data: st } = await admin.from('bot_state').select('cron_token').eq('id', 1).maybeSingle()
  const token = String(st?.cron_token || '').trim()
  const given = String(req.headers.get('x-bot-secret') || '').trim()
  if (token.length < 20 || given !== token) return json({ success: false, error: 'Not allowed' }, 403)
  let body: any = {}
  try { body = await req.json() } catch { /* the scheduler sends {} */ }
  const started = Date.now()

  // paused after repeated ULIP errors?
  const { data: pause } = await admin.from('auto_checks').select('*').eq('key', '__pause').maybeSingle()
  if (!body.force && pause?.next_due && new Date(pause.next_due).getTime() > Date.now()) {
    return json({ success: true, paused_until: pause.next_due })
  }

  // bring the watch list up to date: new items start at a random moment in the next 20 min
  const { items, jobs } = await wanted(admin)
  const { data: rows } = await admin.from('auto_checks').select('*')
  const have = new Map((rows || []).map((r: any) => [r.key, r]))
  const fresh = [...items.values()].filter((i) => !have.has(i.key)).map((i) => ({ ...i, meta: i.meta || {}, next_due: new Date(Date.now() + rand(0, 20) * MIN).toISOString() }))
  if (fresh.length) await admin.from('auto_checks').upsert(fresh, { onConflict: 'key' })
  // items already watched keep their timing; their job, label and details follow the job
  for (const i of items.values()) {
    const r: any = have.get(i.key)
    if (r && (r.label !== i.label || r.job_id !== i.job_id || JSON.stringify(r.meta || {}) !== JSON.stringify(i.meta || {}))) {
      await admin.from('auto_checks').update({ label: i.label, job_id: i.job_id, meta: i.meta || {} }).eq('key', i.key)
    }
  }
  const gone = (rows || []).filter((r: any) => r.key !== '__pause' && !items.has(r.key)).map((r: any) => r.key)
  if (gone.length) await admin.from('auto_checks').delete().in('key', gone)
  if (body.list) return json({ success: true, watching: [...items.values()].map((i) => `${i.kind} ${i.label}`), added: fresh.length, removed: gone.length })

  // what is due, oldest first
  const { data: due } = await admin.from('auto_checks').select('*').neq('key', '__pause').lte('next_due', new Date().toISOString()).order('next_due').limit(4)
  const done: any[] = []
  let errors = Number(pause?.fails || 0)
  for (const item of due || []) {
    if (done.length && Date.now() - started > TIME_BUDGET_MS - GAP_MS[1]) break
    if (done.length) await sleep(rand(...GAP_MS))
    const job = jobs.get(item.job_id) || null
    let r: any
    try { r = await runOne(admin, item, job, token) } catch (e) { r = { ok: false, error: (e as Error).message, result: `failed: ${(e as Error).message}` } }
    const [lo, hi] = EVERY[item.kind] || [60, 80]
    // a failed check comes back sooner (but not at once)
    const next = new Date(Date.now() + (r.ok ? rand(lo, hi) : rand(20, 30)) * MIN).toISOString()
    await admin.from('auto_checks').update({ last_run: new Date().toISOString(), last_result: String(r.result || '').slice(0, 300), next_due: next, fails: r.ok ? 0 : (item.fails || 0) + 1 }).eq('key', item.key)
    done.push({ check: `${item.kind} ${item.label}`, ok: r.ok, result: r.result })
    errors = r.ok ? 0 : errors + 1
    if (errors >= PAUSE_AFTER_ERRORS) break
  }

  // two failures in a row: pause for 2 hours and tell JDS once
  if (errors >= PAUSE_AFTER_ERRORS) {
    const until = new Date(Date.now() + PAUSE_MINUTES * MIN).toISOString()
    await admin.from('auto_checks').upsert({ key: '__pause', kind: 'pause', label: 'paused', next_due: until, fails: 0, last_result: done.map((d) => d.result).join(' | ').slice(0, 300) }, { onConflict: 'key' })
    await log(admin, 'auto_check_paused', 'Automatic checks paused for 2 hours', `Government systems gave errors ${PAUSE_AFTER_ERRORS} times in a row (${done.map((d) => d.result).join('; ').slice(0, 200)}). They restart by themselves at ${new Date(until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.`, null, { until })
  } else {
    await admin.from('auto_checks').upsert({ key: '__pause', kind: 'pause', label: 'running', next_due: new Date(0).toISOString(), fails: errors, last_run: new Date().toISOString() }, { onConflict: 'key' })
  }
  return json({ success: true, watching: items.size, checked: done, ms: Date.now() - started })
})
