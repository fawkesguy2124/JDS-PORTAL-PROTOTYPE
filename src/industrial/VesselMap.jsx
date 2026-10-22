import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addBaseMap } from './TruckMap'
import { Icon } from './ui'

// The ships of open jobs on the same clear map as the trucks. A ship's dot is
// its last AIS position (aisstream.io); nothing here calls ULIP.
// ships: [{ name, jobs, lat, lon, sog, cog, destination, eta_text, seen_at }]

const fmt = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
export const STALE_HOURS = 12
export const NHAVA_SHEVA = [18.95, 72.95]
const alive = (m) => !!m && !!m._mapPane && !!m.getContainer()?.isConnected

export default function VesselMap({ ships, selected, onSelect }) {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const [big, setBig] = useState(false)

  useEffect(() => {
    if (!box.current || map.current) return
    map.current = L.map(box.current, { zoomControl: true, scrollWheelZoom: false }).setView([12, 70], 4)
    addBaseMap(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
  }, [])

  const placed = ships.filter((s) => typeof s.lat === 'number' && typeof s.lon === 'number')

  useEffect(() => {
    const m = map.current
    if (!alive(m)) return
    layer.current.clearLayers()
    // Nhava Sheva, for reference
    L.circleMarker(NHAVA_SHEVA, { radius: 6, color: '#0f766e', weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip('Nhava Sheva (JNPA)').addTo(layer.current)
    for (const s of placed) {
      const stale = !s.seen_at || Date.now() - new Date(s.seen_at).getTime() > STALE_HOURS * 3600e3
      const isSel = s.name === selected
      const turn = typeof s.cog === 'number' ? s.cog : 0
      const html = `<div class="ix-tmark ${stale ? 'stale' : ''} ${isSel ? 'sel' : ''}"><span class="ic"><i class="ti ti-ship" style="display:inline-block"></i></span>${esc(s.name)}${(s.jobs || []).length ? `<span class="job">${esc(s.jobs.join(', '))}</span>` : ''}</div>`
      L.marker([s.lat, s.lon], { icon: L.divIcon({ className: 'ix-tpin', iconSize: [0, 0], html }), zIndexOffset: isSel ? 1000 : 0 })
        .bindTooltip(`<b>${esc(s.name)}</b>${s.jobs?.length ? ` · ${esc(s.jobs.join(', '))}` : ''}<br>${typeof s.sog === 'number' ? `${s.sog.toFixed(1)} knots, course ${Math.round(turn)}°<br>` : ''}${s.destination ? `To: ${esc(s.destination)}<br>` : ''}${s.eta_text ? `Ship's ETA: ${esc(s.eta_text)}<br>` : ''}Last seen ${esc(fmt(s.seen_at))}${stale ? ' · <b>old position</b>' : ''}`, { direction: 'top', offset: [0, -28] })
        .on('click', () => onSelect?.(s.name))
        .addTo(layer.current)
    }
    const sel = placed.find((s) => s.name === selected)
    if (sel) m.setView([sel.lat, sel.lon], Math.max(m.getZoom(), 6))
    else if (placed.length) m.fitBounds(L.latLngBounds([...placed.map((s) => [s.lat, s.lon]), NHAVA_SHEVA]).pad(0.3), { maxZoom: 7 })
    setTimeout(() => { if (alive(m)) m.invalidateSize() }, 0)
  })

  useEffect(() => {
    const m = map.current
    if (!m) return
    setTimeout(() => { if (alive(m)) m.invalidateSize() }, 60)
    if (big) m.scrollWheelZoom.enable(); else m.scrollWheelZoom.disable()
    if (!big) return
    const onKey = (e) => { if (e.key === 'Escape') setBig(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [big])

  return (
    <>
      {big && <div className="ix-realmap-backdrop" onClick={() => setBig(false)} />}
      <div className={`ix-realmap ${big ? 'big' : ''}`}>
        <div ref={box} className="ix-realmap-canvas" role="img" aria-label="Map of the ships of open jobs" />
        {!placed.length && (
          <div className="ix-realmap-msg">
            <Icon name="ship" /> {ships.length ? 'None of these ships has been heard yet.' : 'No open job has a ship name yet.'}
            {ships.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>Ships are heard near coasts; far out at sea they may not show until they come closer.</div>}
          </div>
        )}
        <div className="ix-realmap-legend">
          <span><i style={{ background: '#1a4fa0' }} />Last position</span>
          <span><i style={{ background: '#b91c1c' }} />Not heard for {STALE_HOURS} h+</span>
          <span><i style={{ background: '#0f766e' }} />Nhava Sheva</span>
        </div>
        <button type="button" className="ix-realmap-expand" onClick={() => setBig((b) => !b)}
          title={big ? 'Make the map small again (Esc)' : 'Expand the map'} aria-label={big ? 'Make the map small again' : 'Expand the map'}>
          <Icon name={big ? 'arrows-diagonal-minimize-2' : 'arrows-diagonal'} />
        </button>
      </div>
    </>
  )
}
