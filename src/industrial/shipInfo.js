// Ship facts without the map: which ship a job is on, where it is, its voyage
// and the route text. Kept apart from ShipMap.jsx so the job drawer, the sea
// tracking card and the checks do not pull the map library (leaflet + maplibre,
// about 1 MB) onto every admin page. Import the map itself from ShipMap.jsx.
import { vesselOf, shipIdOf } from '../../supabase/functions/_shared/portal/ships.js'

// which ship a job is on and its numbers: shared with the WhatsApp bot
export { shipKey, vesselsOf, vesselOf, shipIdOf } from '../../supabase/functions/_shared/portal/ships.js'

// (kept for older callers) the IMO of the job's first ship
export const imoOf = (job, data) => shipIdOf(job, vesselOf(job, data), data).imo

// Where a ship is: Safecube's position (the job's tracking), else the finder's
// last-heard position for that ship name. { pos, at, from } or null
export function shipPosition(sea, found) {
  if (sea && !sea.error && typeof sea.lat === 'number' && typeof sea.lng === 'number') return { pos: [sea.lat, sea.lng], at: sea.position_at || sea.fetched_at, from: 'tracking' }
  if (found && typeof found.lat === 'number' && typeof found.lon === 'number') return { pos: [found.lat, found.lon], at: found.seen_at, from: 'ship radio (AIS)', heading: found.heading ?? found.cog ?? null }
  return null
}

// ── geometry (small numbers, flat-earth is fine for picking points) ──
export const R_NM = 3440.065
export const rad = (d) => (d * Math.PI) / 180
export function nm(a, b) {
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)))
}
export function bearing(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]))
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]))
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}
// one line through the route's pieces, unwrapped across the date line
export function routeLine(route) {
  const out = []
  for (const seg of route?.segments || []) for (const [la, lo] of seg) {
    const prev = out[out.length - 1]
    let x = lo
    if (prev) { while (x - prev[1] > 180) x -= 360; while (prev[1] - x > 180) x += 360 }
    out.push([la, x])
  }
  return out
}
// The voyage around the ship: the route split where the ship is, its heading and progress
export function voyage(s) {
  const line = routeLine(s.route)
  const pos = s.pos
  if (!pos) return null
  let p = [pos[0], pos[1]]
  if (line.length >= 2) {
    let k = 0, best = Infinity
    line.forEach((q, i) => { const d = (q[0] - p[0]) ** 2 + ((q[1] - p[1]) * Math.cos(rad(p[0]))) ** 2; if (d < best) { best = d; k = i } })
    // keep the ship's longitude on the same "copy" of the world as the route
    while (p[1] - line[k][1] > 180) p = [p[0], p[1] - 360]
    while (line[k][1] - p[1] > 180) p = [p[0], p[1] + 360]
    // the route point just ahead of the ship (the nearest one may be behind it)
    let next = k
    if (k < line.length - 1 && k > 0) next = nm(line[k - 1], line[k + 1]) > nm(line[k - 1], p) ? k + 1 : k
    if (next === k && k < line.length - 1 && nm(p, line[k]) < 5) next = k + 1
    const sailed = [...line.slice(0, next), p]
    const ahead = [p, ...line.slice(next)]
    const len = (pts) => pts.slice(1).reduce((t, q, i) => t + nm(pts[i], q), 0)
    const done = len(sailed), left = len(ahead)
    const aim = ahead.find((q) => nm(p, q) > 3) || line[line.length - 1]
    return { pos: p, sailed, ahead, heading: s.heading ?? (aim ? bearing(p, aim) : null), done, left, pct: done + left > 0 ? Math.round((done / (done + left)) * 100) : null }
  }
  // no route: point the ship along its last two known positions
  const tr = (s.track || []).filter((t) => typeof t[0] === 'number')
  const a = tr[tr.length - 2], b = tr[tr.length - 1]
  return { pos: p, sailed: [], ahead: [], heading: s.heading ?? (a && b && nm(a, b) > 1 ? bearing(a, b) : null), done: null, left: null, pct: null }
}

// "Ningbo, CN" → "Ningbo"; the line's dates are port time (shown as given)
export const shortPort = (n) => String(n || '').replace(/,\s*[A-Z]{2}$/, '').replace(/^Jawaharlal Nehru$/i, 'Nhava Sheva')
export const shortDate = (iso) => {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(d.getUTCFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}
// "Change ship at Ningbo · stops at Busan, Shekou, Singapore, Colombo"
export function viaText(route) {
  const via = route?.via || []
  if (!via.length) return null
  const change = via.filter((p) => p.change).map((p) => shortPort(p.name))
  const stops = via.filter((p) => !p.change).map((p) => shortPort(p.name))
  return [change.length && `Change ship at ${change.join(', ')}`, stops.length && `stops at ${stops.join(', ')}`].filter(Boolean).join(' · ').replace(/^stops/, 'Stops')
}


export const STALE_HOURS = 24
export const TONE_COLOR = { sea: '#15803d', port: '#c2410c', old: '#94a3b8' }
export const toneOf = (s) => {
  const stale = s.at && Date.now() - new Date(s.at).getTime() > STALE_HOURS * 3600e3
  // at the port (confirmed, or already within reach of it) beats an old position
  return s.waiting ? 'old' : s.arrived || s.atPod ? 'port' : stale ? 'old' : 'sea'
}
