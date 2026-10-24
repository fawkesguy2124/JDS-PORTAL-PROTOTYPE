import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { vesselOf, shipIdOf } from '../../supabase/functions/_shared/portal/ships.js'
import { addBaseMap } from './TruckMap'
import { Icon } from './ui'

// Ships on the portal's own map (Jose, 24 Oct 2026: "remove VesselFinder, we have
// our own map and Safecube"). Same map as the Trucks page. A ship's position is
// the one Safecube gives with the job's tracking (sea_tracking), else the last one
// the free vessel-track finder heard. The selected ship also shows its sea route
// to the port and the port itself. Not ULIP; nothing here calls any service.
//
// ships: [{ key, label, jobs: 'J-689, J-690', pos: [lat, lng], at, from, eta, where, podName, route }]

// which ship a job is on and its numbers: shared with the WhatsApp bot
export { shipKey, vesselsOf, vesselOf, shipIdOf } from '../../supabase/functions/_shared/portal/ships.js'

// (kept for older callers) the IMO of the job's first ship
export const imoOf = (job, data) => shipIdOf(job, vesselOf(job, data), data).imo

// Where a ship is: Safecube's position (the job's tracking), else the finder's
// last-heard position for that ship name. { pos, at, from } or null
export function shipPosition(sea, found) {
  if (sea && !sea.error && typeof sea.lat === 'number' && typeof sea.lng === 'number') return { pos: [sea.lat, sea.lng], at: sea.position_at || sea.fetched_at, from: 'Safecube' }
  if (found && typeof found.lat === 'number' && typeof found.lon === 'number') return { pos: [found.lat, found.lon], at: found.seen_at, from: 'ship radio (AIS)' }
  return null
}

const ARABIAN_SEA = [[15, 68], 4]
const STALE_HOURS = 24
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const ago = (v) => {
  const h = (Date.now() - new Date(v).getTime()) / 3600e3
  if (isNaN(h)) return ''
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`
}
const alive = (m) => !!m && !!m._mapPane && !!m.getContainer()?.isConnected
const fit = (m, bounds) => {
  if (!alive(m)) return
  if (bounds.length === 1) m.setView(bounds[0], 6)
  else if (bounds.length) m.fitBounds(L.latLngBounds(bounds).pad(0.2), { maxZoom: 7 })
  else m.setView(...ARABIAN_SEA)
}

export default function ShipMap({ ships = [], selectedKey, onSelect, height = 420 }) {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const lastBounds = useRef([])
  const [big, setBig] = useState(false)

  useEffect(() => {
    if (!box.current || map.current) return
    map.current = L.map(box.current, { zoomControl: true, scrollWheelZoom: false, worldCopyJump: true }).setView(...ARABIAN_SEA)
    addBaseMap(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
  }, [])

  const placed = ships.filter((s) => s.pos)

  useEffect(() => {
    const m = map.current
    if (!m) return
    layer.current.clearLayers()
    const bounds = []
    const sel = placed.find((s) => s.key === selectedKey) || (placed.length === 1 ? placed[0] : null)
    // the selected ship's sea route and its port
    if (sel?.route) {
      for (const seg of sel.route.segments || []) {
        // a route that crosses the date line is drawn in one piece
        const pts = []
        for (const [la, lo] of seg) { const prev = pts[pts.length - 1]; let x = lo; if (prev) { while (x - prev[1] > 180) x -= 360; while (prev[1] - x > 180) x += 360 } pts.push([la, x]) }
        L.polyline(pts, { color: '#1a4fa0', weight: 3, opacity: 0.55, dashArray: '6 6' }).addTo(layer.current)
      }
      if (sel.route.pod) {
        L.circleMarker(sel.route.pod, { radius: 7, color: '#1a4fa0', weight: 3, fillColor: '#fff', fillOpacity: 1 })
          .bindTooltip(`Port of discharge${sel.podName ? `: ${esc(sel.podName)}` : ''}${sel.eta ? `<br>${esc(sel.eta)}` : ''}`).addTo(layer.current)
        bounds.push(sel.route.pod)
      }
    }
    for (const s of placed) {
      const isSel = sel?.key === s.key
      const stale = s.at && Date.now() - new Date(s.at).getTime() > STALE_HOURS * 3600e3
      const html = `<div class="ix-tmark ${stale ? 'stale' : ''} ${isSel ? 'sel' : ''}"><span class="ic"><i class="ti ti-ship"></i></span>${esc(s.label)}<span class="job">${esc(s.jobs)}</span></div>`
      L.marker(s.pos, { icon: L.divIcon({ className: 'ix-tpin', iconSize: [0, 0], html }), zIndexOffset: isSel ? 1000 : 0 })
        .bindTooltip(`<b>${esc(s.label)}</b> · ${esc(s.jobs)}${s.where ? `<br>${esc(s.where)}` : ''}${s.eta ? `<br>${esc(s.eta)}` : ''}${s.at ? `<br>position ${esc(ago(s.at))}${s.from ? ` · ${esc(s.from)}` : ''}` : ''}`, { direction: 'top', offset: [0, -28] })
        .on('click', () => onSelect?.(s.key))
        .addTo(layer.current)
      if (isSel) bounds.push(s.pos)
    }
    if (!bounds.length || big) placed.forEach((s) => bounds.push(s.pos))
    lastBounds.current = bounds
    fit(m, bounds)
    setTimeout(() => { if (alive(m)) m.invalidateSize() }, 0)
  }) // redraw on every render: the lists are small

  // full screen: fit to the new size, zoom with the mouse wheel, Esc closes
  useEffect(() => {
    const m = map.current
    if (!m) return
    setTimeout(() => { if (!alive(m)) return; m.invalidateSize(); fit(m, lastBounds.current) }, 60)
    if (big) m.scrollWheelZoom.enable(); else m.scrollWheelZoom.disable()
    if (!big) return
    const onKey = (e) => { if (e.key === 'Escape') setBig(false) }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [big])

  return (
    <>
      {big && <div className="ix-realmap-backdrop" onClick={() => setBig(false)} />}
      <div className={`ix-realmap ix-shipmap2 ${big ? 'big' : ''}`} style={big ? undefined : { height }}>
        <div ref={box} className="ix-realmap-canvas" role="img" aria-label="Map of ships carrying our cargo" />
        {!placed.length && (
          <div className="ix-realmap-msg">
            <Icon name="ship" /> {ships.length ? 'No ship position yet.' : 'No ship is carrying our cargo right now.'}
            {ships.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>Positions come with Safecube tracking (job → Ship tracking).</div>}
          </div>
        )}
        <div className="ix-realmap-legend">
          <span><i style={{ background: '#1a4fa0' }} />Ship (last position)</span>
          <span><i style={{ background: '#b91c1c' }} />Position {STALE_HOURS} h+ old</span>
          <span><i style={{ background: '#fff', border: '2px solid #1a4fa0' }} />Port it is heading to</span>
        </div>
        <button type="button" className="ix-realmap-expand" onClick={() => setBig((b) => !b)}
          title={big ? 'Make the map small again (Esc)' : 'Full screen'} aria-label={big ? 'Make the map small again' : 'Full screen map'}>
          <Icon name={big ? 'arrows-diagonal-minimize-2' : 'arrows-diagonal'} />
        </button>
      </div>
    </>
  )
}
