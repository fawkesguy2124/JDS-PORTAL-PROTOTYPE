// Where are the ships of JDS's open jobs? (Jose, 22 Oct 2026)
// Listens to aisstream.io (free, live AIS from coastal receivers) for about a
// minute and keeps, for each ship name on an open job, its last position,
// speed, course, destination and the ETA the ship itself broadcasts.
// NOT ULIP: this never calls ULIP. Run by the database every 30 minutes and
// when someone opens the Vessels page (at most once every 10 minutes).
//
// Ships are recognised by NAME (container tracking gives us "MSC AURORA").
// Names can repeat, so once a ship is found its MMSI (radio id) is kept and
// later runs follow that MMSI anywhere in the world.
import { adminClient, corsHeaders, getCaller, json } from '../_shared/ulip.ts'

const STREAM = 'wss://stream.aisstream.io/v0/stream'
const LISTEN_MS = 75_000
const MIN_MINUTES_BETWEEN_RUNS = 10
// Red Sea and Suez mouth to the Malacca Strait: the waters ships cross on their
// way to Nhava Sheva / Mumbai
const INDIAN_OCEAN = [[-15, 25], [35, 110]]
const WORLD = [[-90, -180], [90, 180]]
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

  // one run at a time, and not more often than every few minutes
  const { data: last } = await admin.from('vessel_positions').select('checked_at').order('checked_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
  if (last?.checked_at && Date.now() - new Date(last.checked_at).getTime() < MIN_MINUTES_BETWEEN_RUNS * 60_000) {
    return json({ success: true, skipped: 'checked a few minutes ago' })
  }

  // ships of open jobs: from container tracking and from the job itself; a ship
  // that reached the port more than 3 days ago is no longer of interest
  const { data: jobs } = await admin.from('jobs').select('id, job_no, vessel, stage').or('stage.is.null,stage.lt.10')
  const open = new Map((jobs || []).map((j: any) => [j.id, j]))
  const { data: boxes } = await admin.from('container_tracking').select('job_id, vessel, port_in').in('job_id', [...open.keys()])
  const wanted = new Map<string, Set<string>>() // ship key → job numbers
  const want = (name: unknown, jobNo: string) => {
    const k = shipKey(name)
    if (k.length < 3) return
    if (!wanted.has(k)) wanted.set(k, new Set())
    wanted.get(k)!.add(jobNo)
  }
  const arrivedLongAgo = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() > 3 * 864e5
  for (const b of boxes || []) if (b.vessel && !arrivedLongAgo(b.port_in)) want(b.vessel, (open.get(b.job_id) as any)?.job_no)
  for (const j of jobs || []) if ((j as any).vessel) want((j as any).vessel, (j as any).job_no)
  if (!wanted.size) return json({ success: true, ships: 0, note: 'No open job has a ship name yet.' })

  // ships found before: follow their MMSI everywhere
  const { data: known } = await admin.from('vessel_positions').select('name, mmsi').in('name', [...wanted.keys()])
  const mmsiOf = new Map((known || []).filter((k: any) => k.mmsi).map((k: any) => [k.name, String(k.mmsi)]))

  const seen = new Map<string, Seen>() // mmsi → latest
  let messages = 0
  const onMsg = (m: any) => {
    messages++
    const meta = m?.MetaData || {}
    const mmsi = String(meta.MMSI ?? meta.MMSI_String ?? '')
    const name = shipKey(meta.ShipName)
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
  const runs: Promise<string>[] = [listen(key, { BoundingBoxes: [INDIAN_OCEAN], FilterMessageTypes: types }, LISTEN_MS, onMsg)]
  if (mmsiOf.size) runs.push(listen(key, { BoundingBoxes: [WORLD], FiltersShipMMSI: [...new Set(mmsiOf.values())].slice(0, 200), FilterMessageTypes: types }, LISTEN_MS, onMsg))
  const why = await Promise.all(runs)

  // one row per ship name: the MMSI we already follow, else the likeliest of the
  // ships with that name (one heading for India first)
  const now = new Date().toISOString()
  const rows = []
  for (const [name, jobNos] of wanted) {
    const found = [...seen.values()].filter((s) => s.name === name)
    const pick = found.find((s) => s.mmsi === mmsiOf.get(name))
      || found.find((s) => INDIA_DEST.test(String(s.destination || '').toUpperCase()))
      || found.find((s) => s.lat !== undefined)
      || found[0]
    const row: Record<string, unknown> = { name, jobs: [...jobNos].filter(Boolean), checked_at: now }
    if (pick) {
      Object.assign(row, {
        mmsi: pick.mmsi, ship_name: pick.name,
        ...(pick.imo ? { imo: pick.imo } : {}), ...(pick.destination ? { destination: pick.destination } : {}), ...(pick.eta ? { eta_text: pick.eta } : {}),
        ...(pick.type !== undefined ? { ship_type: pick.type } : {}),
        ...(pick.lat !== undefined ? { lat: pick.lat, lon: pick.lon, sog: pick.sog, cog: pick.cog, heading: pick.heading, nav_status: pick.navStatus, seen_at: pick.at } : {}),
        candidates: found.length > 1 ? found.map((f) => ({ mmsi: f.mmsi, destination: f.destination || null, lat: f.lat ?? null, lon: f.lon ?? null })) : null,
      })
    }
    rows.push(row)
  }
  // one by one, so a ship not heard this time keeps its last known position
  for (const row of rows) {
    const { error } = await admin.from('vessel_positions').upsert(row, { onConflict: 'name' })
    if (error) return json({ success: false, error: `Could not save: ${error.message}` }, 500)
  }
  const located = rows.filter((r) => r.lat !== undefined).length
  console.log(`[vessel-track] ${wanted.size} ships wanted, ${located} placed, ${messages} AIS messages heard (${why.join(', ')})`)
  return json({ success: true, ships: wanted.size, placed: located, messages, ended: why })
})
