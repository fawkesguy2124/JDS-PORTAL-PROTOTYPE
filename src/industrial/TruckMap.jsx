import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Icon } from './ui'

// A real street map (OpenStreetMap) of the trucks on the road. A truck's
// position is its last FASTag toll crossing; nothing here calls ULIP — it only
// draws answers already saved when staff pressed "Where is it?".
// trucks: [{ id, no, job, points }] — one pin per truck (a job can have several).

const fmt = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const STALE_HOURS = 6
const fit = (m, bounds) => {
  if (bounds.length === 1) m.setView(bounds[0], 11)
  else if (bounds.length) m.fitBounds(L.latLngBounds(bounds).pad(0.25))
}

export default function TruckMap({ trucks, selectedId, onSelect }) {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const [big, setBig] = useState(false) // expanded to fill the screen
  const lastBounds = useRef([])

  useEffect(() => {
    if (!box.current || map.current) return
    map.current = L.map(box.current, { zoomControl: true, scrollWheelZoom: false }).setView([19.05, 73.05], 9)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
  }, [])

  const placed = trucks.map((t) => ({ ...t, last: [...t.points].reverse().find((p) => p.pos) || null }))
  const shown = placed.filter((t) => t.last)

  useEffect(() => {
    const m = map.current
    if (!m) return
    layer.current.clearLayers()
    const bounds = []
    for (const t of placed) {
      if (!t.last) continue
      const isSel = t.id === selectedId
      const lastAt = new Date(t.last.at)
      const stale = !isNaN(lastAt) && Date.now() - lastAt.getTime() > STALE_HOURS * 3600e3
      const route = t.points.filter((p) => p.pos)
      if (isSel && route.length > 1) {
        L.polyline(route.map((p) => p.pos), { color: stale ? '#b91c1c' : '#1a4fa0', weight: 5, opacity: 0.85 }).addTo(layer.current)
      }
      if (isSel) {
        for (const p of route.slice(0, -1)) {
          L.circleMarker(p.pos, { radius: 5, color: '#1a4fa0', weight: 2, fillColor: '#fff', fillOpacity: 1 })
            .bindTooltip(`${esc(p.plaza)}<br>${esc(fmt(p.at))}${p.approx ? '<br><i>approximate position</i>' : ''}`).addTo(layer.current)
        }
        route.forEach((p) => bounds.push(p.pos))
      }
      const html = `<div class="ix-tmark ${stale ? 'stale' : ''} ${isSel ? 'sel' : ''}">${esc(t.no)}</div>`
      L.marker(t.last.pos, { icon: L.divIcon({ className: 'ix-tpin', iconSize: [0, 0], html }), zIndexOffset: isSel ? 1000 : 0 })
        .bindTooltip(`<b>${esc(t.no)}</b> · ${esc(t.job.job_no)}<br>${esc(t.last.plaza)}<br>${esc(fmt(t.last.at))}${stale ? ' · <b>no newer crossing</b>' : ''}${t.last.approx ? '<br><i>approximate position</i>' : ''}`, { direction: 'top', offset: [0, -28] })
        .on('click', () => onSelect?.(t.id))
        .addTo(layer.current)
      if (!bounds.length && !selectedId) bounds.push(t.last.pos)
    }
    // expanded: show every truck, not just the selected one
    if (!bounds.length || big) shown.forEach((t) => bounds.push(t.last.pos))
    lastBounds.current = bounds
    fit(m, bounds)
    // the page layout can change size after the first draw
    setTimeout(() => m.invalidateSize(), 0)
  }) // redraw on every render: the lists are small

  // expanded: fit the map to its new size, zoom with the mouse wheel, Esc closes
  useEffect(() => {
    const m = map.current
    if (!m) return
    setTimeout(() => { m.invalidateSize(); fit(m, lastBounds.current) }, 60)
    if (big) m.scrollWheelZoom.enable(); else m.scrollWheelZoom.disable()
    if (!big) return
    const onKey = (e) => { if (e.key === 'Escape') setBig(false) }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [big])

  const unplaced = trucks.filter((t) => t.points.length && !placed.find((p) => p.id === t.id)?.last)
  return (
    <>
    {big && <div className="ix-realmap-backdrop" onClick={() => setBig(false)} />}
    <div className={`ix-realmap ${big ? 'big' : ''}`}>
      <div ref={box} className="ix-realmap-canvas" role="img" aria-label="Map of trucks on the road" />
      {!shown.length && (
        <div className="ix-realmap-msg">
          <Icon name="map-pin" /> {trucks.length ? 'No toll crossing with a known position yet.' : 'No trucks on the road right now.'}
          {trucks.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>Press “Where is it?” on a truck below to ask FASTag.</div>}
        </div>
      )}
      <div className="ix-realmap-legend">
        <span><i style={{ background: '#1a4fa0' }} />Last toll crossing</span>
        <span><i style={{ background: '#b91c1c' }} />No crossing for {STALE_HOURS} h+</span>
        {unplaced.length > 0 && <span style={{ color: 'var(--muted)' }}>{unplaced.length} truck{unplaced.length === 1 ? '' : 's'} at a plaza we can’t place</span>}
      </div>
      <button type="button" className="ix-realmap-expand" onClick={() => setBig((b) => !b)}
        title={big ? 'Make the map small again (Esc)' : 'Expand the map'} aria-label={big ? 'Make the map small again' : 'Expand the map'}>
        <Icon name={big ? 'arrows-diagonal-minimize-2' : 'arrows-diagonal'} />
      </button>
    </div>
    </>
  )
}
