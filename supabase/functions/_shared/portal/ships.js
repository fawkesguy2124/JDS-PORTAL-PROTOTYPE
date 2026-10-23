// Which ship each job is on, and that ship's numbers (IMO / MMSI). Shared by the
// portal (Vessels page, job drawer) and the WhatsApp bot, so both say the same.
// Not ULIP: saved job data, the saved IGM check and the vessel-track finder only.
import { parseContainerNos, containerTrip, isDelivered } from './journeyCore.js'
import { isLineNotShip } from './shippingLines.js'

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
  const names = []
  // a shipping line's name saved as the ship ("EVERGREEN") is not a ship
  const add = (v, line) => { const k = shipKey(v); if (k.length >= 3 && !isLineNotShip(k, line) && !names.includes(k)) names.push(k) }
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

// Rough sea area of a position, in words (for the bot's "last heard" line)
const AREAS = [
  ['near Nhava Sheva / Mumbai', 18.3, 19.6, 72.3, 73.2],
  ['off the west coast of India', 8, 23.5, 66, 77],
  ['near Colombo / Sri Lanka', 5, 10, 78, 82.5],
  ['in the Arabian Sea', 5, 25, 55, 77],
  ['in the Persian Gulf', 23.5, 30.5, 47.5, 57],
  ['in the Red Sea / Gulf of Aden', 11, 30, 32, 51],
  ['in the Bay of Bengal', 5, 23, 80, 95],
  ['near Singapore / Malacca Strait', -1, 8, 95, 105],
  ['in the South China Sea', 0, 23, 105, 121],
  ['near China / Korea / Japan', 23, 45, 115, 145],
  ['in the Mediterranean', 30, 46, -6, 36.5],
  ['in the Indian Ocean', -40, 25, 40, 100],
]
export function seaArea(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  const a = AREAS.find(([, la1, la2, lo1, lo2]) => lat >= la1 && lat <= la2 && lon >= lo1 && lon <= lo2)
  return a ? a[0] : 'at sea'
}

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
  const ships = vesselsOf(job, data)
  // the job's containers on this ship (a box with no ship of its own is on the job's ship)
  const boxes = parseContainerNos(job?.containers).filter((no) => {
    const own = shipKey(data?.containersByNo?.[no]?.vessel)
    return own.length >= 3 ? own === name : name === ships[0]
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
  return { onBoard: true, unloadedOn: null, arrivedAt }
}
