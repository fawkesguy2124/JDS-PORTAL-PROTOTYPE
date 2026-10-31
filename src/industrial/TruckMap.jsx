// (addBaseMap stays next to the map that uses it; other maps import it from here)
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@maplibre/maplibre-gl-leaflet'
import { Icon, fmtDateTime } from './ui'

// The background map: OpenFreeMap (free, no key, allowed for business use), a
// clean Google-Maps-like style with place names in English. If the browser
// can't draw it (very old phone, no WebGL), the plain OpenStreetMap tiles.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const ENGLISH = ['coalesce', ['get', 'name:en'], ['get', 'name_int'], ['get', 'name:latin'], ['get', 'name']]
export function addBaseMap(m) {
  try {
    const gl = L.maplibreGL({ style: MAP_STYLE, attribution: '© <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>' }).addTo(m)
    const ml = gl.getMaplibreMap()
    ml.on('style.load', () => {
      for (const layer of ml.getStyle().layers || []) {
        // only place/road NAMES; road-number signs (ref) stay as they are
        if (layer.type === 'symbol' && /name/.test(JSON.stringify(layer.layout?.['text-field'] || ''))) ml.setLayoutProperty(layer.id, 'text-field', ENGLISH)
      }
    })
  } catch {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(m)
  }
}

// A real street map of the trucks on the road. A truck's
// position is its last toll crossing; nothing here calls a government system — it
// only draws answers already saved (automatic look-ups or "Where is it?").
// trucks: [{ id, no, job, points, hollow, mode }] — one pin per truck (a job can have
// several). hollow = container tracking shows the box on the road / rail but the job has
// no truck number: a dashed pin at that place (Jose, 31 Oct 2026).
// message: { title, sub } shown when no pin can be placed, so the map says the same as
// the page's "on the road" list.

const fmt = (v) => (v ? fmtDateTime(v) : '')
// colours as the --navy / --red tokens (map layers cannot read CSS variables)
const NAVY = '#1a4fa0', RED = '#c81e1e'
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const STALE_HOURS = 6
// the map may have been closed in the meantime (page changed)
const alive = (m) => !!m && !!m._mapPane && !!m.getContainer()?.isConnected
const fit = (m, bounds) => {
  if (!alive(m)) return
  if (bounds.length === 1) m.setView(bounds[0], 11)
  else if (bounds.length) m.fitBounds(L.latLngBounds(bounds).pad(0.25))
}

export default function TruckMap({ trucks, selectedId, onSelect, message }) {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const [big, setBig] = useState(false) // expanded to fill the screen
  const lastBounds = useRef([])

  useEffect(() => {
    if (!box.current || map.current) return
    map.current = L.map(box.current, { zoomControl: true, scrollWheelZoom: false }).setView([19.05, 73.05], 9)
    map.current.attributionControl.setPrefix(false) // no "Leaflet" credit; the map credits sit behind the small ⓘ
    addBaseMap(map.current)
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
      const stale = !t.hollow && !isNaN(lastAt) && Date.now() - lastAt.getTime() > STALE_HOURS * 3600e3
      const route = t.points.filter((p) => p.pos)
      if (isSel && route.length > 1) {
        L.polyline(route.map((p) => p.pos), { color: stale ? RED : NAVY, weight: 4, opacity: 0.85 }).addTo(layer.current)
      }
      if (isSel) {
        for (const p of route.slice(0, -1)) {
          L.circleMarker(p.pos, { radius: 5, color: NAVY, weight: 2, fillColor: '#fff', fillOpacity: 1 })
            .bindTooltip(`${esc(p.plaza)}<br>${esc(fmt(p.at))}${p.approx ? '<br><i>approximate position</i>' : ''}`).addTo(layer.current)
        }
        route.forEach((p) => bounds.push(p.pos))
      }
      // job number first on the pin; a hollow pin says no truck number is known yet
      const icon = t.mode === 'rail' ? 'train' : 'truck'
      const html = `<div class="ix-tmark ${stale ? 'stale' : ''} ${t.hollow ? 'hollow' : ''} ${isSel ? 'sel' : ''}"><span class="ic"><i class="ti ti-${icon}"></i></span><span class="job">${esc(t.job.job_no)}</span>${esc(t.hollow ? (t.mode === 'rail' ? 'On rail' : 'No truck no.') : t.no)}</div>`
      const what = t.hollow ? `${t.mode === 'rail' ? 'On rail' : 'On the road'} by container tracking, no truck number yet` : esc(t.no)
      L.marker(t.last.pos, { icon: L.divIcon({ className: 'ix-tpin', iconSize: [0, 0], html }), zIndexOffset: isSel ? 1000 : 0 })
        .bindTooltip(`<b>${esc(t.job.job_no)}</b> · ${what}<br>${esc(t.last.plaza)}<br>${esc(fmt(t.last.at))}${stale ? ' · <b>no newer crossing</b>' : ''}${t.last.approx ? '<br><i>approximate position</i>' : ''}`, { direction: 'top', offset: [0, -28] })
        .on('click', () => onSelect?.(t.id))
        .addTo(layer.current)
      if (!bounds.length && !selectedId) bounds.push(t.last.pos)
    }
    // expanded: show every truck, not just the selected one
    if (!bounds.length || big) shown.forEach((t) => bounds.push(t.last.pos))
    lastBounds.current = bounds
    fit(m, bounds)
    // the page layout can change size after the first draw
    setTimeout(() => { if (alive(m)) m.invalidateSize() }, 0)
  }) // redraw on every render: the lists are small

  // expanded: fit the map to its new size, zoom with the mouse wheel, Esc closes
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

  const unplaced = trucks.filter((t) => t.points.length && !placed.find((p) => p.id === t.id)?.last)
  return (
    <>
    {big && <div className="ix-realmap-backdrop" onClick={() => setBig(false)} />}
    <div className={`ix-realmap ${big ? 'big' : ''}`}>
      <div ref={box} className="ix-realmap-canvas" role="img" aria-label="Map of trucks on the road" />
      {!shown.length && (
        <div className="ix-realmap-msg">
          <Icon name="map-pin" /> {message?.title || (trucks.length ? 'No toll crossing with a known position yet.' : 'No truck on the road.')}
          {(message ? message.sub : trucks.length > 0 && 'Press “Where is it?” on a truck below.') && <div className="s">{message ? message.sub : 'Press “Where is it?” on a truck below.'}</div>}
        </div>
      )}
      <div className="ix-realmap-legend">
        <span><i style={{ background: NAVY }} />Last toll crossing</span>
        <span><i style={{ background: RED }} />No crossing for {STALE_HOURS} h+</span>
        {trucks.some((t) => t.hollow) && <span><i className="hollow" />Moving, no truck number</span>}
        {unplaced.length > 0 && <span style={{ color: 'var(--muted)' }}>{unplaced.length} {unplaced.length === 1 ? 'place' : 'places'} we can’t put on the map</span>}
      </div>
      <button type="button" className="ix-realmap-expand" onClick={() => setBig((b) => !b)}
        title={big ? 'Make the map small again (Esc)' : 'Expand the map'} aria-label={big ? 'Make the map small again' : 'Expand the map'}>
        <Icon name={big ? 'arrows-diagonal-minimize-2' : 'arrows-diagonal'} />
      </button>
    </div>
    </>
  )
}
