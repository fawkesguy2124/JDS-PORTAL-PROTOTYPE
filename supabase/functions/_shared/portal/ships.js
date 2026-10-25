// Which ship each job is on, and that ship's numbers (IMO / MMSI). Shared by the
// portal (Vessels page, job drawer) and the WhatsApp bot, so both say the same.
// Not ULIP: saved job data, the saved IGM check and the vessel-track finder only.
import { parseContainerNos, containerTrip, isDelivered } from './journeyCore.js'
import { isLineNotShip, isNotShipName } from './shippingLines.js'

const digits = (v) => String(v || '').replace(/\D/g, '')

// "M.V. MSC AURORA V.543W" → "MSC AURORA" (same as the vessel-track finder)
export function shipKey(raw) {
  return String(raw || '').toUpperCase()
    .replace(/^\s*(M\.?\s?V\.?|M\/V)\s+/, '')
    .replace(/\s+(V\.?|VOY\.?|VOYAGE)\s*[\w-]+\s*$/, '')
    .replace(/\s*\/.*$/, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Every ship of a job: typed on the job, and each container's ship (LDB). A job
// can have two when its containers sail on different ships.
export function vesselsOf(job, data) {
  // the ship tracking says the cargo is on now beats what was typed (Jose, 24 Oct
  // 2026: J-584 said EVER LEARNED; its container is on ONE THESEUS)
  const sea = seaOf(job, data)
  if (sea && !sea.error && shipKey(sea.vessel_name).length >= 3) return [shipKey(sea.vessel_name)]
  const names = []
  // a shipping line's name saved as the ship ("EVERGREEN") is not a ship
  // (an address the BL reader picked up, e.g. "ANDHERI EAST MUMBAI PINCODE", is not a ship either)
  const add = (v, line) => { const k = shipKey(v); if (k.length >= 3 && !isLineNotShip(k, line) && !isNotShipName(v) && !names.includes(k)) names.push(k) }
  const own = (x) => {
    if (x?.vessel) add(x.vessel, x.shipping_line)
    for (const no of parseContainerNos(x?.containers)) add(data?.containersByNo?.[no]?.vessel)
  }
  own(job)
  // nothing on the job itself: another job on the same IGM (same port) is on the
  // same ship, so its ship name counts too (Jose, 23 Oct 2026: J-667)
  if (!names.length) for (const other of igmSiblings(job, data)) own(other)
  return names
}
export const vesselOf = (job, data) => vesselsOf(job, data)[0] || null

// The job's Safecube tracking row (ETA, ship, position), or null
export const seaOf = (job, data) => data?.seaByJob?.[job?.id] || null

// Other jobs filed on the same IGM at the same port (one IGM = one ship's voyage)
export function igmSiblings(job, data) {
  const igm = digits(job?.ulip_refs?.igm_no)
  if (igm.length < 5 || /^0+$/.test(igm)) return []
  const date = String(job?.ulip_refs?.igm_date || '').slice(0, 10)
  return (data?.jobs || []).filter((o) => o.id !== job.id && o.port_code === job.port_code
    && digits(o.ulip_refs?.igm_no) === igm
    && (!date || !o.ulip_refs?.igm_date || String(o.ulip_refs.igm_date).slice(0, 10) === date))
}

// IMO from the job: typed by JDS first, then the job's IGM / vessel-arrival check
export function jobImo(job, data) {
  let igm = null
  const results = data?.resultsByJob?.[job?.id] || {}
  for (const api of ['ICEGATE/07', 'ICEGATE/01']) {
    for (const r of [].concat(results[api] || [])) {
      const f = (r?.parsed?.fields || []).find((x) => /imo/i.test(x?.label || ''))
      const n = digits(f?.value || r?.parsed?.extra?.imoCode)
      if (n.length === 7 && !igm) igm = n
    }
  }
  // the job's saved IMO is either typed by staff or remembered from the IGM check
  const saved = digits(job?.ulip_refs?.imo_code)
  if (saved.length === 7) return { imo: saved, from: saved === igm ? 'igm' : 'typed' }
  return igm ? { imo: igm, from: 'igm' } : null
}

// The numbers to show one ship by, in order of trust: typed by JDS, from the IGM
// check (both apply to the job's first ship), else what the finder heard the
// ship broadcast. { imo, mmsi, from: 'typed'|'igm'|'found'|'unclear'|null, candidates }
export function shipIdOf(job, name, data) {
  // the ship tracking follows the cargo, so its IMO beats one typed earlier (J-584:
  // EVER LEARNED's IMO was typed; the box is on ONE THESEUS)
  const sea = seaOf(job, data)
  if (sea && !sea.error && digits(sea.vessel_imo).length === 7 && (!name || shipKey(sea.vessel_name) === name)) return { imo: digits(sea.vessel_imo), mmsi: sea.vessel_mmsi || null, from: 'tracking' }
  const first = vesselsOf(job, data)[0]
  if (!name || name === first) {
    const own = jobImo(job, data)
    if (own) return { ...own, mmsi: null }
    // a job on the same IGM already knows the ship's IMO
    for (const o of igmSiblings(job, data)) {
      const sib = jobImo(o, data)
      if (sib) return { ...sib, mmsi: null }
    }
  }
  const f = data?.shipIds?.[shipKey(name)]
  if (f?.imo || f?.mmsi) return { imo: digits(f.imo).length === 7 ? digits(f.imo) : null, mmsi: f.mmsi || null, from: 'found', seenAt: f.seen_at }
  if (f?.candidates?.length > 1) return { imo: null, mmsi: null, from: 'unclear', candidates: f.candidates }
  return { imo: null, mmsi: null, from: null }
}

// Where a ship is, in words ("Bohai Sea, near Dalian"): seaAreas.js
export { seaArea } from './seaAreas.js'
import { seaArea } from './seaAreas.js'

// Is this job's cargo still on this ship? (Jose, 22 Oct 2026: a ship stays on the
// Vessels page only while our cargo is on board; once it is unloaded, the ship
// is of no interest.) Unloaded when ANY of:
//  • every container of the job on this ship has a port event of this trip that
//    is the box itself (PORT IN / discharge / gate / CFS…, not just "vessel arrived")
//  • the job reached OOC or was delivered (cargo is surely off)
//  • the ship arrived (IGM / vessel check / port in) more than 2 days ago: a
//    container ship unloads within a day or two of berthing
// Returns { onBoard, unloadedOn, arrivedAt } (dates ISO or null).
const UNLOAD_DAYS = 2
const boxName = (m) => String(m?.description || m?.event || '').toUpperCase().trim()
const boxWhen = (m) => (m?.date ? new Date(m.date).getTime() : NaN)
export function cargoOnShip(job, name, data, j) {
  const arrivedAt = j?.arrivedAt || null
  if (isDelivered(job) || Number(job?.stage) >= 7) return { onBoard: false, unloadedOn: null, arrivedAt }
  // staff saw on the map that the ship has left (Jose, 24 Oct 2026: EVER LEARNED
  // had called Mundra and sailed on to Port Klang, still listed "At sea")
  const left = job?.field_meta?.ship_left
  if (left) return { onBoard: false, unloadedOn: typeof left === 'string' ? left : null, arrivedAt }
  const ships = vesselsOf(job, data)
  // Safecube says the ship reached the port of discharge more than 2 days ago
  const sea = seaOf(job, data)
  const seaShip = sea && (!name || !sea.vessel_name || shipKey(sea.vessel_name) === name || ships.length <= 1)
  if (seaShip && sea.pod_actual && sea.pod_date && Date.now() - new Date(sea.pod_date).getTime() > UNLOAD_DAYS * 86400000) return { onBoard: false, unloadedOn: null, arrivedAt: arrivedAt || sea.pod_date, why: 'tracking' }
  // the job's containers on this ship (a box with no ship of its own, or only a
  // shipping line's name as its ship, is on the job's ship)
  const boxes = parseContainerNos(job?.containers).filter((no) => {
    const t = data?.containersByNo?.[no]
    const own = shipKey(t?.vessel)
    return own.length >= 3 && !isLineNotShip(own, t?.shipping_line_ldb) ? own === name : (name || null) === (ships[0] || null)
  })
  let last = null
  const off = boxes.length > 0 && boxes.every((no) => {
    const t = data?.containersByNo?.[no]
    if (!t) return false
    const trip = containerTrip(t, job)
    if (trip.laterTrip || trip.exitAt) return true
    if (!trip.portIn) return false
    const from = new Date(trip.portIn).getTime()
    const ms = (Array.isArray(t.milestones) ? t.milestones : []).filter((m) => boxWhen(m) >= from && !/^VESSEL/.test(boxName(m)))
    if (!ms.length) return false
    const at = new Date(Math.min(...ms.map(boxWhen))).toISOString()
    if (!last || at > last) last = at
    return true
  })
  if (off) return { onBoard: false, unloadedOn: last, arrivedAt }
  // no container news: go by the ship's arrival (only for a job on one ship)
  if (ships.length <= 1 && arrivedAt && Date.now() - new Date(arrivedAt).getTime() > UNLOAD_DAYS * 86400000) return { onBoard: false, unloadedOn: null, arrivedAt }
  // Nothing says the ship came in, but by now it surely has and sailed on (Jose,
  // 24 Oct 2026: no manual "Ship has left" taps). The free ship feed hears too few
  // ships near India to tell, so this goes by dates JDS already has:
  if (ships.length <= 1 && !arrivedAt) {
    const ageDays = (iso) => (Date.now() - new Date(String(iso).length <= 10 ? `${iso}T12:00:00+05:30` : iso).getTime()) / 86400000
    // fresh Safecube tracking that says the ship hasn't arrived beats the date guesses below
    if (seaShip && !sea.error && !sea.pod_actual && sea.status !== 'DELIVERED' && sea.fetched_at && ageDays(sea.fetched_at) < 2) return { onBoard: true, unloadedOn: null, arrivedAt }
    // the ship's ETA (typed on the job, or from container tracking) is 3+ days past
    const etas = [job?.eta, seaShip && !sea.pod_actual ? sea.pod_date : null, ...parseContainerNos(job?.containers).map((no) => data?.containersByNo?.[no]?.eta)].filter((d) => d && !isNaN(new Date(d)))
    if (etas.length && etas.every((d) => ageDays(d) > UNLOAD_DAYS + 1)) return { onBoard: false, unloadedOn: null, arrivedAt, why: 'eta' }
    // a BE filed 10+ days ago (the same rule the job page uses for "ship in")
    if (job?.be_date && ageDays(job.be_date) >= ADVANCE_BE_DAYS) return { onBoard: false, unloadedOn: null, arrivedAt, why: 'be' }
    // no ETA and no news of the ship three weeks after the job was opened
    if (!etas.length && job?.created_at && ageDays(job.created_at) >= STALE_SHIP_DAYS) return { onBoard: false, unloadedOn: null, arrivedAt, why: 'old' }
  }
  return { onBoard: true, unloadedOn: null, arrivedAt }
}
const ADVANCE_BE_DAYS = 10
const STALE_SHIP_DAYS = 21

// ─────────────────────────────────────────────────────────────────────────────
// The ship card for WhatsApp (Jose, 25 Oct 2026: "where is the ship" must come back
// in one clear layout JDS reads in seconds: job + client, where it is, how far from
// the port, ETA with a countdown, the route). Built by code, never by the AI.
// ─────────────────────────────────────────────────────────────────────────────
const R_KM = 6371
const KMH = 30 // a container ship's normal speed, about 16 knots
const rad = (d) => (d * Math.PI) / 180
function km(a, b) {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}
// How far the ship still has to sail along its route, and how much is done
export function seaVoyage(sea) {
  if (!sea || typeof sea.lat !== 'number') return null
  const line = []
  for (const seg of sea.route?.segments || []) for (const [la, lo] of seg) {
    const prev = line[line.length - 1]
    let x = lo
    if (prev) { while (x - prev[1] > 180) x -= 360; while (prev[1] - x > 180) x += 360 }
    line.push([la, x])
  }
  let p = [sea.lat, sea.lng]
  if (line.length < 2) return sea.route?.pod ? { kmLeft: Math.round(km(p, sea.route.pod)), pct: null } : null
  let k = 0, best = Infinity
  line.forEach((q, i) => { const d = (q[0] - p[0]) ** 2 + ((q[1] - p[1]) * Math.cos(rad(p[0]))) ** 2; if (d < best) { best = d; k = i } })
  while (p[1] - line[k][1] > 180) p = [p[0], p[1] - 360]
  while (line[k][1] - p[1] > 180) p = [p[0], p[1] + 360]
  let next = k
  if (k > 0 && k < line.length - 1) next = km(line[k - 1], line[k + 1]) > km(line[k - 1], p) ? k + 1 : k
  const len = (pts) => pts.slice(1).reduce((t, q, i) => t + km(pts[i], q), 0)
  const done = len([...line.slice(0, next), p]), left = len([p, ...line.slice(next)])
  return { kmLeft: Math.round(left), pct: done + left > 0 ? Math.round((done / (done + left)) * 100) : null }
}

const port = (p) => (p ? String(p).replace(/^Jawaharlal Nehru(, IN)?/i, 'Nhava Sheva') : p)
// the line's dates are the port's own clock (written as if UTC)
const portClock = (iso, time = true) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', ...(time ? { hour: 'numeric', minute: '2-digit' } : {}), timeZone: 'UTC' }) : null)
const ist = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
// "in about 5 h" / "in 4 days" / "2 h ago" for an Indian port's local time
function untilText(iso) {
  const ms = new Date(iso).getTime() - 5.5 * 3600e3 - Date.now()
  const h = Math.abs(ms) / 3600e3
  const span = h < 1 ? 'under an hour' : h < 36 ? `about ${Math.round(h)} h` : `${Math.round(h / 24)} days`
  return ms >= 0 ? `in ${span}` : `${span} ago`
}

// jobs: [{ job_no, client }]; sea: the tracking row; extra: { line, imo, liveMap }
export function shipCardText(jobs, sea, extra = {}) {
  const who = jobs.map((j) => `*${j.job_no}* · ${String(j.client || 'No client').trim()}`).join('\n')
  const v = seaVoyage(sea)
  const notSailed = sea.status === 'PLANNED' || (sea.pol_date && new Date(sea.pol_date) > Date.now() && !sea.pod_actual)
  const lines = [`🚢 ${who}`, `Ship: *${sea.vessel_name || 'name not given'}*${extra.line ? ` (${extra.line})` : ''}${extra.imo ? ` · IMO ${extra.imo}` : ''}`, '']
  if (sea.pod_actual) {
    lines.push(`⚓ *Arrived at ${port(sea.pod)}* · ${portClock(sea.pod_date)}`)
  } else if (notSailed) {
    lines.push(`⏳ *Not sailed yet* · waiting at ${port(sea.last_event?.where || sea.pol)}`)
    if (sea.pol_date) lines.push(`🗓 Sails: ${portClock(sea.pol_date, false)}`)
  } else {
    const where = typeof sea.lat === 'number' ? `${seaArea(sea.lat, sea.lng)}` : 'position not given'
    lines.push(`📍 *Now:* ${where}`)
    if (typeof sea.lat === 'number') lines.push(`      ${Math.abs(sea.lat).toFixed(4)}° ${sea.lat >= 0 ? 'N' : 'S'}, ${Math.abs(sea.lng).toFixed(4)}° ${sea.lng >= 0 ? 'E' : 'W'}${sea.position_at ? ` · as of ${ist(sea.position_at)}` : ''}`)
    if (v?.kmLeft != null) lines.push(`📏 *Distance to ${port(sea.pod) || 'port'}:* about ${v.kmLeft.toLocaleString('en-IN')} km${v.pct != null ? ` (${v.pct}% of the way done)` : ''}`)
  }
  if (!sea.pod_actual && sea.pod_date) lines.push(`🏁 *ETA ${port(sea.pod) || 'port'}:* ${portClock(sea.pod_date)} (${untilText(sea.pod_date)})`)
  // the line's ETA can't be met at a normal speed (J-644, 25 Oct 2026: ETA in 5 h with
  // 968 km to go): say when it would really get there at ~16 knots (30 km/h)
  const real = !sea.pod_actual && !notSailed && v?.kmLeft != null ? Date.now() + (v.kmLeft / KMH) * 3600e3 : null
  if (real && sea.pod_date && real - (new Date(sea.pod_date).getTime() - 5.5 * 3600e3) > 6 * 3600e3) {
    lines.push(`⚠️ At normal speed it reaches about *${ist(new Date(real).toISOString())}*, later than the line's ETA.`)
  }
  const via = (sea.route?.via || []).filter((x) => x.change).map((x) => port(x.name))
  lines.push(`🧭 *Route:* ${port(sea.pol) || '?'}${sea.pol_date && !notSailed ? ` (left ${portClock(sea.pol_date, false)})` : ''} → ${port(sea.pod) || '?'}${via.length ? ` · change ship at ${via.join(', ')}` : ''}`)
  if (sea.fetched_at) lines.push('', `_Ship tracking, updated ${ist(sea.fetched_at)}${extra.liveMap ? ` · map: ${extra.liveMap}` : ''}_`)
  return lines.join('\n')
}

// one short line for the job reply: "🚢 At sea · ETA 25 Oct, 6:30 pm · ~1,018 km to Nhava Sheva"
export function shipLineText(sea) {
  if (!sea || sea.error) return null
  const v = seaVoyage(sea)
  if (sea.pod_actual) return `🚢 ${sea.vessel_name || 'Ship'} arrived at ${port(sea.pod)} · ${portClock(sea.pod_date)}`
  const notSailed = sea.status === 'PLANNED' || (sea.pol_date && new Date(sea.pol_date) > Date.now())
  if (notSailed) return `🚢 ${sea.vessel_name || 'Ship'}: not sailed yet${sea.pol ? ` (at ${port(sea.pol)})` : ''}${sea.pod_date ? ` · ETA ${portClock(sea.pod_date)}` : ''}`
  const late = v?.kmLeft != null && sea.pod_date && Date.now() + (v.kmLeft / KMH) * 3600e3 - (new Date(sea.pod_date).getTime() - 5.5 * 3600e3) > 6 * 3600e3
  return `🚢 ${sea.vessel_name || 'Ship'} at sea · ${typeof sea.lat === 'number' ? seaArea(sea.lat, sea.lng) : 'position not given'}${v?.kmLeft != null ? ` · ~${v.kmLeft.toLocaleString('en-IN')} km to ${port(sea.pod) || 'port'}` : ''}${sea.pod_date ? ` · ETA ${portClock(sea.pod_date)}${late ? ' (looks too early for the distance)' : ''}` : ''}`
}
