// Which ship each job is on, and that ship's numbers (IMO / MMSI). Shared by the
// portal (Vessels page, job drawer) and the WhatsApp bot, so both say the same.
// Not ULIP: saved job data, the saved IGM check and the vessel-track finder only.
import { parseContainerNos } from './journeyCore.js'

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
  const add = (v) => { const k = shipKey(v); if (k.length >= 3 && !names.includes(k)) names.push(k) }
  if (job?.vessel) add(job.vessel)
  for (const no of parseContainerNos(job?.containers)) add(data?.containersByNo?.[no]?.vessel)
  return names
}
export const vesselOf = (job, data) => vesselsOf(job, data)[0] || null

// IMO from the job: typed by JDS first, then the job's IGM / vessel-arrival check
function jobImo(job, data) {
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
