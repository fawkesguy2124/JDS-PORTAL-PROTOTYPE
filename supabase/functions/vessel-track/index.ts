// Ship-number finder for the ships of JDS's open jobs (Jose, 22 Oct 2026).
// The live map is VesselFinder's (by IMO / MMSI). When JDS hasn't typed the IMO
// and the IGM check hasn't given it, this finds the ship's numbers itself: ships
// broadcast their name, MMSI and (every ~6 min) IMO, type and destination; we
// listen to aisstream.io (free) for about 2 minutes where its receivers are busy
// (Malacca, Red Sea, Gulf) and keep the numbers of the ship with that name.
// Also keeps its last heard position. NOT ULIP. Run by the database every 30 minutes.
//
// Ships are recognised by NAME (container tracking gives us "MSC AURORA").
// Names can repeat, so once a ship is found its MMSI (radio id) is kept and
// later runs follow that MMSI anywhere in the world.
import { adminClient, corsHeaders, getCaller, json } from '../_shared/ulip.ts'

const STREAM = 'wss://stream.aisstream.io/v0/stream'
const LISTEN_MS = 110_000 // ships send their IMO about every 6 minutes; numbers fill in over a few runs
const MIN_MINUTES_BETWEEN_RUNS = 10
// Red Sea and Suez mouth to the Malacca Strait: the waters ships cross on their
// way to Nhava Sheva / Mumbai
const INDIAN_OCEAN = [[-15, 25], [35, 110]]
const WORLD = [[-90, -180], [90, 180]]
// where the free receivers are busiest, for the ship directory (identity messages only)
const EAST_ASIA = [[0, 100], [42, 135]]        // China, Korea, Japan, Vietnam, Singapore
const MED_SUEZ = [[28, -6], [46, 37]]          // Mediterranean and Suez: cargo from Europe
// a destination that says "India" (Nhava Sheva, Mumbai, Mundra, Pipavav, Chennai…)
const INDIA_DEST = /IN[A-Z]{3}|NHAVA|NSA|JNP|MUMBAI|BOMBAY|MUNDRA|PIPAVAV|HAZIRA|KANDLA|CHENNAI|COCHIN|INDIA/

// "M.V. MSC AURORA V.543W" → "MSC AURORA"
export function shipKey(raw: unknown) {
  return String(raw || '').toUpperCase()
    .replace(/^\s*(M\.?\s?V\.?|M\/V)\s+/, '')
    .replace(/\s+(V\.?|VOY\.?|VOYAGE)\s*[\w-]+\s*$/, '')
    .replace(/\s*\/.*$/, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

const etaText = (e: any) => (e && e.Month ? `${String(e.Day).padStart(2, '0')}/${String(e.Month).padStart(2, '0')} ${String(e.Hour ?? 0).padStart(2, '0')}:${String(e.Minute ?? 0).padStart(2, '0')} UTC` : null)

type Seen = { mmsi: string; name: string; lat?: number; lon?: number; sog?: number; cog?: number; heading?: number; navStatus?: number; at?: string; imo?: string; destination?: string; eta?: string | null; type?: number }

// listens on one subscription for `ms`, calling onMsg for each message
function listen(key: string, sub: Record<string, unknown>, ms: number, onMsg: (m: any) => void): Promise<string> {
  return new Promise((resolve) => {
    let done = false
    const finish = (why: string) => { if (done) return; done = true; try { ws.close() } catch { /* closed */ } resolve(why) }
    const ws = new WebSocket(STREAM)
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => ws.send(JSON.stringify({ APIKey: key, ...sub }))
    ws.onmessage = (ev) => {
      try {
        const text = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer)
        const m = JSON.parse(text)
        if (m?.error) return finish(`aisstream: ${m.error}`)
        onMsg(m)
      } catch { /* one bad message */ }
    }
    ws.onerror = () => finish('connection error')
    ws.onclose = () => finish('closed')
    setTimeout(() => finish('listened'), ms)
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const admin = adminClient()

  // who may run it: the database schedule (bot_state.cron_token) or a signed-in user
  const secret = req.headers.get('x-bot-secret')
  if (secret !== null) {
    const { data: st } = await admin.from('bot_state').select('cron_token').eq('id', 1).maybeSingle()
    const ok = [Deno.env.get('BOT_CRON_SECRET') || '', String(st?.cron_token || '')].map((s) => s.trim()).filter((s) => s.length >= 20)
    if (!ok.includes(secret.trim())) return json({ success: false, error: 'Not allowed' }, 403)
  } else if (!(await getCaller(req, admin))) {
    return json({ success: false, error: 'Please sign in again.' }, 401)
  }

  const key = (Deno.env.get('AISSTREAM_API_KEY') || '').trim()
  if (!key) return json({ success: false, error: 'The ship tracking key (AISSTREAM_API_KEY) is not set yet.' }, 400)

  // coverage check (test only): listen to the whole area and count ships heard, by area
  let body: any = {}
  try { body = await req.json() } catch { /* empty */ }
  if (body?.coverage) {
    const heard = new Map<string, [number, number]>()
    const why = await listen(key, { BoundingBoxes: [INDIAN_OCEAN], FilterMessageTypes: ['PositionReport'] }, 60_000, (m: any) => {
      const meta = m?.MetaData || {}
      const la = meta.latitude ?? meta.Latitude, lo = meta.longitude ?? meta.Longitude
      if (typeof la === 'number') heard.set(String(meta.MMSI), [la, lo])
    })
    const area = ([la, lo]: [number, number]) => (lo < 60 ? 'Red Sea / Gulf / Oman' : lo < 78 && la > 15 && la < 24 && lo > 70 ? 'Mumbai / Nhava Sheva / Gujarat coast' : lo < 78 && la > 5 ? 'Arabian Sea / west India' : lo < 78 ? 'Maldives / south of India' : lo < 92 ? 'Sri Lanka / Bay of Bengal' : 'Andaman / Malacca')
    const byArea: Record<string, number> = {}
    for (const p of heard.values()) byArea[area(p)] = (byArea[area(p)] || 0) + 1
    return json({ success: true, ships_heard: heard.size, by_area: byArea, ended: why })
  }

  // one run at a time, and not more often than every few minutes
  const { data: last } = await admin.from('vessel_positions').select('checked_at').order('checked_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
  if (!Array.isArray(body?.names) && last?.checked_at && Date.now() - new Date(last.checked_at).getTime() < MIN_MINUTES_BETWEEN_RUNS * 60_000) {
    return json({ success: true, skipped: 'checked a few minutes ago' })
  }

  // ships of open jobs: from container tracking and from the job itself; a ship
  // that reached the port more than 3 days ago is no longer of interest
  // jobs opened in the last 75 days (older open jobs are finished but never closed)
  const since = new Date(Date.now() - 75 * 864e5).toISOString()
  const { data: jobs } = await admin.from('jobs').select('id, job_no, vessel, stage, eta').or('stage.is.null,stage.lt.10').gte('created_at', since)
  const open = new Map((jobs || []).map((j: any) => [j.id, j]))
  const { data: boxes } = await admin.from('container_tracking').select('job_id, vessel, port_in').in('job_id', [...open.keys()])
  const wanted = new Map<string, Set<string>>() // ship key → job numbers
  const want = (name: unknown, jobNo: string) => {
    const k = shipKey(name)
    if (k.length < 3) return
    if (!wanted.has(k)) wanted.set(k, new Set())
    wanted.get(k)!.add(jobNo)
  }
  // a ship is followed until 3 days after its container is in port
  const arrivedLongAgo = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() > 3 * 864e5
  for (const b of boxes || []) if (b.vessel && !arrivedLongAgo(b.port_in)) want(b.vessel, (open.get(b.job_id) as any)?.job_no)
  for (const j of jobs || []) if ((j as any).vessel) want((j as any).vessel, (j as any).job_no)
  // watch list (a fair test of the finder over days): extra ship names from the
  // VESSEL_WATCH setting, saved like job ships but under "watch"
  for (const n of String(Deno.env.get('VESSEL_WATCH') || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 40)) want(n, 'watch')
  // test only: listen for these names instead, and save nothing
  const testOnly = Array.isArray(body?.names) && body.names.length > 0
  if (testOnly) { wanted.clear(); for (const n of body.names.slice(0, 50)) want(n, 'test') }
  // (no early stop when no job ship is wanted: the directory keeps learning)

  // ships found before: follow their MMSI everywhere
  const { data: known } = await admin.from('vessel_positions').select('name, mmsi').in('name', [...wanted.keys()])
  const mmsiOf = new Map((known || []).filter((k: any) => k.mmsi).map((k: any) => [k.name, String(k.mmsi)]))

  const seen = new Map<string, Seen>() // mmsi → latest
  let messages = 0
  const heard = new Map<string, [number, number]>() // for a coverage check: ship → position
  // the ship directory: every ship heard, whatever its name (background only)
  type Dir = { mmsi: string; name?: string; name_key?: string; imo?: string; call_sign?: string; ship_type?: number; destination?: string; last_lat?: number; last_lon?: number; last_heard?: string }
  const dir = new Map<string, Dir>()
  const onMsg = (m: any) => {
    messages++
    const meta = m?.MetaData || {}
    const mmsi = String(meta.MMSI ?? meta.MMSI_String ?? '')
    const name = shipKey(meta.ShipName)
    const la = meta.latitude ?? meta.Latitude, lo = meta.longitude ?? meta.Longitude
    if (/^\d{9}$/.test(mmsi)) {
      const d: Dir = dir.get(mmsi) || { mmsi }
      if (name) { d.name = String(meta.ShipName).trim(); d.name_key = name }
      if (typeof la === 'number' && typeof lo === 'number') { d.last_lat = la; d.last_lon = lo; d.last_heard = new Date().toISOString() }
      const st0 = m?.Message?.ShipStaticData
      if (st0) {
        if (st0.ImoNumber && String(st0.ImoNumber).length === 7) d.imo = String(st0.ImoNumber)
        if (st0.CallSign) d.call_sign = String(st0.CallSign).trim()
        if (st0.Type !== undefined) d.ship_type = st0.Type
        if (String(st0.Destination || '').trim()) d.destination = String(st0.Destination).trim()
        if (st0.Name && !name) { d.name = String(st0.Name).trim(); d.name_key = shipKey(st0.Name) }
      }
      dir.set(mmsi, d)
    }
    if (name && typeof la === 'number' && heard.size < 400) heard.set(name, [Math.round(la * 10) / 10, Math.round(lo * 10) / 10])
    if (!mmsi || !wanted.has(name)) return
    const s: Seen = seen.get(mmsi) || { mmsi, name }
    const pr = m?.Message?.PositionReport
    const st = m?.Message?.ShipStaticData
    if (pr) {
      s.lat = meta.latitude ?? meta.Latitude ?? pr.Latitude
      s.lon = meta.longitude ?? meta.Longitude ?? pr.Longitude
      s.sog = pr.Sog; s.cog = pr.Cog; s.heading = pr.TrueHeading; s.navStatus = pr.NavigationalStatus
      s.at = meta.time_utc ? new Date(String(meta.time_utc).replace(' +0000 UTC', 'Z').replace(' ', 'T')).toISOString() : new Date().toISOString()
    }
    if (st) {
      s.imo = st.ImoNumber ? String(st.ImoNumber) : s.imo
      s.destination = String(st.Destination || '').trim() || s.destination
      s.eta = etaText(st.Eta) || s.eta
      s.type = st.Type ?? s.type
    }
    seen.set(mmsi, s)
  }

  const types = ['PositionReport', 'ShipStaticData']
  const runs: Promise<string>[] = [
    listen(key, { BoundingBoxes: [INDIAN_OCEAN], FilterMessageTypes: types }, LISTEN_MS, onMsg),
    // busy coasts: identity messages only (name, IMO, type, destination), for the directory
    listen(key, { BoundingBoxes: [EAST_ASIA, MED_SUEZ], FilterMessageTypes: ['ShipStaticData'] }, LISTEN_MS, onMsg),
  ]
  if (mmsiOf.size) runs.push(listen(key, { BoundingBoxes: [WORLD], FiltersShipMMSI: [...new Set(mmsiOf.values())].slice(0, 200), FilterMessageTypes: types }, LISTEN_MS, onMsg))
  const why = await Promise.all(runs)

  // save the directory (one row per ship, updated in place; never shown on screen).
  // Rows are grouped by which fields they carry, so known values are never blanked.
  if (!testOnly && dir.size) {
    const groups = new Map<string, Dir[]>()
    for (const d of dir.values()) {
      const k = Object.keys(d).sort().join(',')
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(d)
    }
    for (const rowsOf of groups.values()) {
      for (let i = 0; i < rowsOf.length; i += 500) {
        const { error } = await admin.from('ship_directory').upsert(rowsOf.slice(i, i + 500), { onConflict: 'mmsi' })
        if (error) console.warn(`[vessel-track] directory save: ${error.message}`)
      }
    }
  }
  // job ships not heard this time: look them up in the directory
  const missing = [...wanted.keys()].filter((n) => ![...seen.values()].some((s) => s.name === n))
  if (missing.length) {
    const { data: known2 } = await admin.from('ship_directory').select('mmsi, name_key, imo, ship_type, destination').in('name_key', missing)
    for (const k of known2 || []) {
      if (!seen.has(k.mmsi)) seen.set(k.mmsi, { mmsi: k.mmsi, name: k.name_key, imo: k.imo || undefined, type: k.ship_type ?? undefined, destination: k.destination || undefined })
    }
  }

  // one row per ship name. Safe matching (a wrong ship is worse than none):
  // - only cargo / container ships (AIS type 70-79) when the type is known
  // - a ship already matched keeps its number
  // - one ship heard with that name → that ship
  // - several → the one heading to India; if still unclear, no pick (staff confirm)
  const now = new Date().toISOString()
  const rows = []
  const cargo = (s: Seen) => s.type === undefined || (s.type >= 70 && s.type <= 79)
  const india = (s: Seen) => INDIA_DEST.test(String(s.destination || '').toUpperCase())
  for (const [name, jobNos] of wanted) {
    const found = [...seen.values()].filter((s) => s.name === name && cargo(s))
    const kept = found.find((s) => s.mmsi === mmsiOf.get(name))
    const indian = found.filter(india)
    const pick = kept || (found.length === 1 ? found[0] : indian.length === 1 ? indian[0] : null)
    const row: Record<string, unknown> = { name, jobs: [...jobNos].filter(Boolean), checked_at: now }
    if (pick) {
      Object.assign(row, {
        mmsi: pick.mmsi, ship_name: pick.name,
        ...(pick.imo ? { imo: pick.imo } : {}), ...(pick.destination ? { destination: pick.destination } : {}), ...(pick.eta ? { eta_text: pick.eta } : {}),
        ...(pick.type !== undefined ? { ship_type: pick.type } : {}),
        ...(pick.lat !== undefined ? { lat: pick.lat, lon: pick.lon, sog: pick.sog, cog: pick.cog, heading: pick.heading, nav_status: pick.navStatus, seen_at: pick.at } : {}),
        candidates: null,
      })
    } else if (found.length > 1 && !mmsiOf.get(name)) {
      // several ships with this name and none clearly ours: list them, pick none
      row.candidates = found.map((f) => ({ mmsi: f.mmsi, imo: f.imo || null, destination: f.destination || null }))
    }
    rows.push(row)
  }
  if (testOnly) return json({ success: true, test: true, messages, results: rows.map((r: any) => ({ name: r.name, mmsi: r.mmsi || null, imo: r.imo || null, type: r.ship_type ?? null, destination: r.destination || null, unclear: r.candidates || null })) })
  // one by one, so a ship not heard this time keeps its last known position
  for (const row of rows) {
    const { error } = await admin.from('vessel_positions').upsert(row, { onConflict: 'name' })
    if (error) return json({ success: false, error: `Could not save: ${error.message}` }, 500)
  }
  const located = rows.filter((r) => r.lat !== undefined).length
  console.log(`[vessel-track] ${wanted.size} ships wanted, ${located} placed, ${messages} AIS messages heard (${why.join(', ')})`)
  // coverage check: how many ships were heard in each area
  const area = ([la, lo]: [number, number]) => (lo < 60 ? 'Red Sea / Gulf of Aden / Oman' : lo < 78 && la > 5 ? 'Arabian Sea / west India' : lo < 78 ? 'Maldives / south of India' : lo < 92 ? 'Sri Lanka / Bay of Bengal' : 'Andaman / Malacca')
  const byArea: Record<string, number> = {}
  for (const p of heard.values()) byArea[area(p)] = (byArea[area(p)] || 0) + 1
  return json({ success: true, ships: wanted.size, wanted: [...wanted.keys()], placed: located, messages, directory_heard: dir.size, ships_heard: heard.size, by_area: byArea, ended: why })
})
