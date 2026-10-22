import { useEffect, useState } from 'react'
import { parseContainerNos } from '../services/journey'
import { Icon } from './ui'

// A ship's live position on VesselFinder's free embedded map (their own data,
// shown in a frame; the portal reads nothing from it). Needs the ship's IMO or
// MMSI number; without one it shows the sea around Nhava Sheva with ship names.
// Not ULIP. (Jose, 22 Oct 2026: aisstream's free feed hears no ships off west
// India, VesselFinder does.)

const NHAVA_SHEVA = { lat: 18.95, lon: 72.95 }
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
// (kept for older callers) the IMO of the job's first ship
export const imoOf = (job, data) => shipIdOf(job, vesselOf(job, data), data).imo

export const vesselFinderLink = (imo, name, mmsi) => (imo
  ? `https://www.vesselfinder.com/vessels/details/${imo}`
  : mmsi ? `https://www.vesselfinder.com/vessels/details/${mmsi}` : `https://www.vesselfinder.com/vessels?name=${encodeURIComponent(name || '')}`)

export default function ShipMap({ imo, mmsi, height = 420, title }) {
  const [big, setBig] = useState(false) // full screen, like the Trucks map
  useEffect(() => {
    if (!big) return
    const onKey = (e) => { if (e.key === 'Escape') setBig(false) }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [big])

  const ship = digits(imo).length === 7 ? digits(imo) : null
  const radio = !ship && digits(mmsi).length === 9 ? digits(mmsi) : null
  // full screen: the map is drawn for the window's height
  const h = big && typeof window !== 'undefined' ? Math.max(400, window.innerHeight - 64) : height
  const params = new URLSearchParams({
    zoom: ship || radio ? 'undefined' : '8',
    lat: ship || radio ? 'undefined' : String(NHAVA_SHEVA.lat),
    lon: ship || radio ? 'undefined' : String(NHAVA_SHEVA.lon),
    width: '100%',
    height: String(h),
    names: 'true',
    ...(ship ? { imo: ship } : radio ? { mmsi: radio } : {}),
    track: ship || radio ? 'true' : 'false',
    fleet: 'false',
    fleet_name: 'false',
    fleet_hide_old_positions: 'false',
    clicktoact: 'false',
    store_pos: 'false',
    ra: typeof window !== 'undefined' ? window.location.origin : '',
  })
  return (
    <>
      {big && <div className="ix-realmap-backdrop" onClick={() => setBig(false)} />}
      <div className={`ix-shipmap ${big ? 'big' : ''}`} style={big ? undefined : { height }}>
        <iframe
          key={`${ship || radio || 'area'}:${big}`}
          title={title || (ship ? `Ship IMO ${ship} on VesselFinder` : radio ? `Ship MMSI ${radio} on VesselFinder` : 'Ships near Nhava Sheva on VesselFinder')}
          src={`https://www.vesselfinder.com/aismap?${params.toString()}`}
          width="100%" height={h} frameBorder="0" loading="lazy"
          style={{ display: 'block', border: 0, width: '100%', height: '100%' }}
        />
        <button type="button" className="ix-realmap-expand" onClick={() => setBig((b) => !b)}
          title={big ? 'Make the map small again (Esc)' : 'Full screen'} aria-label={big ? 'Make the map small again' : 'Full screen map'}>
          <Icon name={big ? 'arrows-diagonal-minimize-2' : 'arrows-diagonal'} />
        </button>
      </div>
    </>
  )
}
