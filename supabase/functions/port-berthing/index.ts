// JNPA berthing reports → each JDS ship's berthing at Nhava Sheva (Jose, 7 Nov 2026). Staff
// opened jnport.gov.in to see when a ship berths; this reads the same public reports a few
// times a day, free, with no tracking service and no login, and keeps per job: expected (ETA),
// berthed (when, which terminal) and sailed. A ship stays in a report only ~24 hours after it
// berths or sails, so what was seen is kept. NOT ULIP; only jnport.gov.in is asked.
//
// Calls:
//  • scheduler (x-bot-secret), every hour 8 am – 10 pm India time (Jose, 7 Nov 2026). JNPA
//    uploads the reports once a day (7 Nov: ~12:10 pm), so each hour only asks when each PDF
//    was last changed and downloads it only when it is new (or a job got a new ship); the
//    page's at-berth table is read every time
//  • signed-in staff: {} (same as the scheduler), { force: true } to read every PDF again, or
//    { dry: true } to see the answer without saving
import { adminClient, corsHeaders, getCaller, json } from '../_shared/ulip.ts'
import { CONTAINER_TERMINALS, readBerthingPage, shipAtJnpa, shipKey } from '../_shared/portal/jnpaBerthing.js'
import { pdfToLines } from '../_shared/portal/beParser.js'
import { isDelivered, isOldVoyage } from '../_shared/portal/journeyCore.js'

const env = (k: string) => (Deno.env.get(k) || '').trim()
const PAGE = 'https://www.jnport.gov.in/page/daily-berthing-report/M2VlS0pwUXZ3akhSV0E0RDFUVlhxQT09'
const UA = { 'User-Agent': 'Mozilla/5.0 (JDS Logistics portal; daily berthing report)' }
// Nhava Sheva (JNPT) jobs only: the reports cover JNPA's terminals, not Mumbai Port
const AT_JNPT = (job: any) => /^INNSA|NHAVA|JNPT|JNPA|JAWAHARLAL/i.test(String(job.port_code || ''))

async function fetchText(url: string) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`${r.status} from jnport.gov.in`)
  return await r.text()
}
// when JNPA last uploaded a report (one small request, no download)
async function lastModified(url: string) {
  try {
    const r = await fetch(url, { method: 'HEAD', headers: UA, signal: AbortSignal.timeout(20_000) })
    return r.ok ? r.headers.get('last-modified') : null
  } catch { return null }
}
async function reportLines(url: string) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45_000) })
  if (!r.ok) throw new Error(`${r.status}`)
  const { getDocumentProxy }: any = await import('https://esm.sh/unpdf@0.12.1')
  const pdf = await getDocumentProxy(new Uint8Array(await r.arrayBuffer()))
  return await pdfToLines(pdf)
}

// the ship a job is on: ship tracking's (when it has this trip), else what staff typed
function shipOf(job: any, sea: any) {
  if (sea && !sea.error && sea.vessel_name && !isOldVoyage(sea, job)) return String(sea.vessel_name)
  return job.vessel ? String(job.vessel) : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const admin = adminClient()
  let body: any = {}
  try { body = await req.json() } catch { /* scheduler sends {} */ }
  const cron = req.headers.get('x-bot-secret')
  if (cron !== null) {
    const { data: st } = await admin.from('bot_state').select('cron_token').eq('id', 1).maybeSingle()
    const allowed = [env('BOT_CRON_SECRET'), String(st?.cron_token || '').trim()].filter((v) => v.length >= 20)
    if (!allowed.includes(cron.trim())) return json({ success: false, error: 'Not allowed' }, 403)
  } else if (!(await getCaller(req, admin))) return json({ success: false, error: 'Please sign in' }, 401)

  try {
    // 1. the JDS ships due at, or just arrived at, Nhava Sheva
    const { data: jobs } = await admin.from('jobs').select('id, job_no, job_type, mode, port_code, vessel, stage, eta, created_at')
      .gte('created_at', new Date(Date.now() - 120 * 864e5).toISOString())
    const open = (jobs || []).filter((j: any) => j.job_type !== 'export' && !/AIR/i.test(String(j.mode || '')) && AT_JNPT(j) && !isDelivered(j))
    const { data: seaRows } = await admin.from('sea_tracking').select('*').in('job_id', open.map((j: any) => j.id))
    const { data: before } = await admin.from('port_berthing').select('*').in('job_id', open.map((j: any) => j.id))
    const seaBy = Object.fromEntries((seaRows || []).map((r: any) => [r.job_id, r]))
    const prevBy = Object.fromEntries((before || []).map((r: any) => [r.job_id, r]))
    const wanted = open.map((job: any) => ({ job, ship: shipOf(job, seaBy[job.id]) })).filter((w: any) => w.ship && shipKey(w.ship).length >= 3)
    if (!wanted.length) return json({ success: true, checked: 0, note: 'no open JNPT job has a ship name' })

    // 2. today's reports: the page's table, and the five container terminals' PDFs
    const page: any = readBerthingPage(await fetchText(PAGE))
    const pages: any[] = []
    const failed: string[] = []
    const skipped: string[] = []
    // the reports read last time ({ NSICT: { url, modified } }), and whether a job has a ship not looked for yet
    const seenBefore: any = (before || []).find((r: any) => r.reports_seen)?.reports_seen || {}
    const newShip = wanted.some((w: any) => !prevBy[w.job.id] || shipKey(prevBy[w.job.id].vessel) !== shipKey(w.ship))
    const reportsSeen: any = {}
    for (const t of CONTAINER_TERMINALS) {
      const url = page.reports[t]
      if (!url) { failed.push(`${t}: no report link`); continue }
      const modified = await lastModified(url)
      if (!body.force && !newShip && modified && seenBefore[t]?.url === url && seenBefore[t]?.modified === modified) {
        skipped.push(t); reportsSeen[t] = seenBefore[t]; continue
      }
      try { pages.push({ terminal: t, url, lines: await reportLines(url) }); reportsSeen[t] = { url, modified } } catch (e) { failed.push(`${t}: ${(e as Error).message}`); if (seenBefore[t]) reportsSeen[t] = seenBefore[t] }
    }

    // 3. each ship; what was seen before is kept (a ship drops out of the report a day after)
    const now = new Date()
    const out: any[] = []
    for (const { job, ship } of wanted) {
      // the ETA already known (ship tracking's, else the job's): a far-off date is another call
      const sea = seaBy[job.id]
      const near = sea && !sea.error && sea.pod_date && !isOldVoyage(sea, job) ? sea.pod_date : job.eta || null
      const hit: any = shipAtJnpa(ship, pages, page.atBerth, now, near)
      const prev = prevBy[job.id] && shipKey(prevBy[job.id].vessel) === shipKey(ship) ? prevBy[job.id] : null
      const row: any = {
        job_id: job.id, job_no: job.job_no, vessel: ship, checked_at: now.toISOString(),
        terminal: hit?.terminal || prev?.terminal || null, via: hit?.via || prev?.via || null,
        eta: hit?.eta || prev?.eta || null,
        berthed_at: hit?.berthedAt || prev?.berthed_at || null,
        sailed_at: hit?.sailedAt || prev?.sailed_at || null,
        status: hit?.status === 'sailed' || prev?.sailed_at ? 'sailed' : hit?.status === 'berthed' || prev?.berthed_at ? 'berthed' : hit?.status || prev?.status || 'not_listed',
        seen_at: hit ? now.toISOString() : prev?.seen_at || null,
        row_text: hit?.row || prev?.row_text || null,
        report_url: hit ? pages.find((p) => p.terminal === hit.terminal)?.url || PAGE : prev?.report_url || null,
        first_seen_at: prev?.first_seen_at || (hit ? now.toISOString() : null),
        // each ETA the port gave, when it changed: [{ eta, seen }]
        eta_history: [...(prev?.eta_history || []), ...(hit?.eta && hit.eta !== prev?.eta ? [{ eta: hit.eta, seen: now.toISOString() }] : [])],
        reports_seen: reportsSeen,
      }
      out.push(row)
    }
    if (!body.dry) {
      const { error } = await admin.from('port_berthing').upsert(out, { onConflict: 'job_id' })
      if (error) return json({ success: false, error: `save: ${error.message}` }, 500)
    }
    return json({ success: true, checked: out.length, found: out.filter((r) => r.seen_at === now.toISOString()).length, failed, reports: pages.map((p) => p.terminal), unchanged: skipped, rows: body.dry ? out : undefined })
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500)
  }
})
