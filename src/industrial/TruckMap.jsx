// (addBaseMap stays next to the map that uses it; other maps import it from here)
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@maplibre/maplibre-gl-leaflet'
import { Icon, fmtDateTime } from './ui'
import { steadyBaseMap, streetTiles } from './mapBase'

// The background map: OpenFreeMap (free, no key, allowed for business use), a
// clean Google-Maps-like style with place names in English. If the browser
// can't draw it (very old phone, no WebGL), the plain OpenStreetMap tiles.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const ENGLISH = ['coalesce', ['get', 'name:en'], ['get', 'name_int'], ['get', 'name:latin'], ['get', 'name']]
// Dark mode (Jose, 31 Oct 2026): the street map has no dark style of its own, so in
// dark mode its tiles are drawn inverted (light streets become dark, colours kept).
// Only the base map: the pins and tags sit in their own panes and keep their colours.
const DARK_TILES = 'invert(.9) hue-rotate(180deg) brightness(.95) contrast(.9)'
const isDark = () => document.documentElement.dataset.theme === 'dark'
function darkTiles(m) {
  const paint = () => { const p = m.getPane('tilePane'); if (p) p.style.filter = isDark() ? DARK_TILES : '' }
  paint()
  const watch = new MutationObserver(paint)
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  m.on('unload', () => watch.disconnect())
}
export function addBaseMap(m) {
  darkTiles(m)
  // never blank (Jose, 1 Nov 2026): rebuilt if the graphics card drops it, picture tiles
  // if it keeps failing (mapBase.js). Dark mode inverts either kind (darkTiles above).
  steadyBaseMap(m, {
    makeGL: (map) => {
      const gl = L.maplibreGL({ style: MAP_STYLE, attribution: '© <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>' }).addTo(map)
      const ml = gl.getMaplibreMap()
      ml.on('style.load', () => {
        for (const layer of ml.getStyle().layers || []) {
          // only place/road NAMES; road-number signs (ref) stay as they are
          if (layer.type === 'symbol' && /name/.test(JSON.stringify(layer.layout?.['text-field'] || ''))) ml.setLayoutProperty(layer.id, 'text-field', ENGLISH)
        }
      })
      return gl
    },
    raster: () => streetTiles(false),
  })
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
  const fitKey = useRef('') // the view is refitted only when the picked truck or the trucks change

  useEffect(() => {
    if (!box.current || map.current) return
    // the mouse wheel zooms the map (Jose, 1 Nov 2026)
    map.current = L.map(box.current, { zoomControl: true, scrollWheelZoom: true }).setView([19.05, 73.05], 9)
    map.current.attributionControl.setPrefix(false) // no "Leaflet" credit; the map credits sit behind the small ⓘ
    addBaseMap(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => {
      // a mouse-wheel zoom still finishing when the page closes would run on the removed map
      // (Leaflet's queued zoom-end step returns early when no zoom is marked as running)
      if (map.current) { map.current._animatingZoom = false; map.current.remove() }
      map.current = null
    }
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
      // each truck in its own colour (the same as its row on the page)
      const color = t.color || NAVY
      if (isSel && route.length > 1) {
        L.polyline(route.map((p) => p.pos), { color, weight: 4, opacity: 0.85, dashArray: stale ? '6 6' : null }).addTo(layer.current)
      }
      if (isSel) {
        for (const p of route.slice(0, -1)) {
          L.circleMarker(p.pos, { radius: 5, color, weight: 2, fillColor: '#fff', fillOpacity: 1 })
            .bindTooltip(`${esc(p.plaza)}<br>${esc(fmt(p.at))}${p.approx ? '<br><i>approximate position</i>' : ''}`).addTo(layer.current)
        }
        route.forEach((p) => bounds.push(p.pos))
      }
      // job number first on the pin; a hollow pin says no truck number is known yet
      const icon = t.mode === 'rail' ? 'train' : 'truck'
      const html = `<div class="ix-tmark ${stale ? 'stale' : ''} ${t.hollow ? 'hollow' : ''} ${isSel ? 'sel' : ''}" style="--tc:${t.hollow ? '#8792a5' : esc(color)}"><span class="ic"><i class="ti ti-${icon}"></i></span><span class="job">${esc(t.job.job_no)}</span>${esc(t.hollow ? (t.mode === 'rail' ? 'On rail' : 'No truck no.') : t.no)}</div>`
      const what = t.hollow ? `${t.mode === 'rail' ? 'On rail' : 'On the road'} by container tracking, no truck number yet` : esc(t.no)
      L.marker(t.last.pos, { icon: L.divIcon({ className: 'ix-tpin', iconSize: [0, 0], html }), zIndexOffset: isSel ? 1000 : 0 })
        .bindTooltip(`<b>${esc(t.job.job_no)}</b> · ${what}<br>${esc(t.last.plaza)}<br>${esc(fmt(t.last.at))}${stale ? ' · <b>no newer crossing</b>' : ''}${t.last.approx ? '<br><i>approximate position</i>' : ''}`, { direction: 'top', offset: [0, -28] })
        .on('click', () => onSelect?.(t.id))
        .addTo(layer.current)
    }
    // nothing picked (or expanded): every truck in view; a picked truck: its own route
    if (!bounds.length || big || !selectedId) shown.forEach((t) => bounds.push(t.last.pos))
    lastBounds.current = bounds
    // (not on every redraw: a zoom with the mouse wheel stays until the picked truck or the trucks change)
    const key = `${selectedId || ''}|${big}|${shown.map((t) => `${t.id}@${t.last.pos}`).join(',')}`
    if (key !== fitKey.current) { fitKey.current = key; fit(m, bounds) }
    // the page layout can change size after the first draw
    setTimeout(() => { if (alive(m)) m.invalidateSize() }, 0)
  }) // redraw on every render: the lists are small

  // expanded: fit the map to its new size, zoom with the mouse wheel, Esc closes
  useEffect(() => {
    const m = map.current
    if (!m) return
    setTimeout(() => { if (!alive(m)) return; m.invalidateSize(); fit(m, lastBounds.current) }, 60)
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
          {message?.sub && <div className="s">{message.sub}</div>}
        </div>
      )}
      <div className="ix-realmap-legend">
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
