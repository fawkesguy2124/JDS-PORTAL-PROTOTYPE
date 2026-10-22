import { parseContainerNos } from '../services/journey'

// A ship's live position on VesselFinder's free embedded map (their own data,
// shown in a frame; the portal reads nothing from it). Needs the ship's IMO
// number; without one it shows the sea around Nhava Sheva with ship names.
// Not ULIP. (Jose, 22 Oct 2026: aisstream's free feed hears no ships off west
// India, VesselFinder does.)

const NHAVA_SHEVA = { lat: 18.95, lon: 72.95 }
const digits = (v) => String(v || '').replace(/\D/g, '')

// The job's ship name: typed on the job, else from its container tracking (LDB)
export function vesselOf(job, data) {
  if (job?.vessel) return String(job.vessel).trim()
  for (const no of parseContainerNos(job?.containers)) {
    const v = data?.containersByNo?.[no]?.vessel
    if (v) return String(v).trim()
  }
  return null
}

// The ship's IMO number (7 digits): typed or remembered on the job, else from the
// job's saved IGM / vessel-arrival checks
export function imoOf(job, data) {
  const typed = digits(job?.ulip_refs?.imo_code)
  if (typed.length === 7) return typed
  const results = data?.resultsByJob?.[job?.id] || {}
  for (const api of ['ICEGATE/07', 'ICEGATE/01']) {
    for (const r of [].concat(results[api] || [])) {
      const f = (r?.parsed?.fields || []).find((x) => /imo/i.test(x?.label || ''))
      const n = digits(f?.value || r?.parsed?.extra?.imoCode)
      if (n.length === 7) return n
    }
  }
  return null
}

export const vesselFinderLink = (imo, name) => (imo
  ? `https://www.vesselfinder.com/vessels/details/${imo}`
  : `https://www.vesselfinder.com/vessels?name=${encodeURIComponent(name || '')}`)

export default function ShipMap({ imo, height = 420, title }) {
  const ship = digits(imo).length === 7 ? digits(imo) : null
  const params = new URLSearchParams({
    zoom: ship ? 'undefined' : '8',
    lat: ship ? 'undefined' : String(NHAVA_SHEVA.lat),
    lon: ship ? 'undefined' : String(NHAVA_SHEVA.lon),
    width: '100%',
    height: String(height),
    names: 'true',
    ...(ship ? { imo: ship } : {}),
    track: ship ? 'true' : 'false',
    fleet: 'false',
    fleet_name: 'false',
    fleet_hide_old_positions: 'false',
    clicktoact: 'false',
    store_pos: 'false',
    ra: typeof window !== 'undefined' ? window.location.origin : '',
  })
  return (
    <iframe
      key={ship || 'area'}
      title={title || (ship ? `Ship IMO ${ship} on VesselFinder` : 'Ships near Nhava Sheva on VesselFinder')}
      src={`https://www.vesselfinder.com/aismap?${params.toString()}`}
      width="100%" height={height} frameBorder="0" loading="lazy"
      style={{ display: 'block', border: 0, borderRadius: 10, background: '#e8eef5' }}
    />
  )
}
