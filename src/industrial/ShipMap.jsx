import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@maplibre/maplibre-gl-leaflet'
import { vesselOf, shipIdOf } from '../../supabase/functions/_shared/portal/ships.js'
import { Icon } from './ui'

// Ships on the portal's own map (Jose, 24 Oct 2026: "remove VesselFinder, we have
// our own map and Safecube… make it like VesselFinder's tracker"). A sea chart:
// blue sea, sea marks near ports (OpenSeaMap), each ship drawn as a ship pointing
// the way it sails, the water it has already crossed as a solid line, the rest of
// its route to the port dashed, and a card with the voyage's progress and ETA.
// Positions: Safecube (the job's tracking), else the free vessel-track finder.
// Not ULIP; nothing here calls any service.
//
// ships: [{ key, label (IMO, shown only in the card), jobs, clients, line, pos: [lat, lng], at, from, eta, where,
//           polName, polDate, podName, arrived, route, track }]

// which ship a job is on and its numbers: shared with the WhatsApp bot
export { shipKey, vesselsOf, vesselOf, shipIdOf } from '../../supabase/functions/_shared/portal/ships.js'

// (kept for older callers) the IMO of the job's first ship
export const imoOf = (job, data) => shipIdOf(job, vesselOf(job, data), data).imo

// Where a ship is: Safecube's position (the job's tracking), else the finder's
// last-heard position for that ship name. { pos, at, from } or null
export function shipPosition(sea, found) {
  if (sea && !sea.error && typeof sea.lat === 'number' && typeof sea.lng === 'number') return { pos: [sea.lat, sea.lng], at: sea.position_at || sea.fetched_at, from: 'Safecube' }
  if (found && typeof found.lat === 'number' && typeof found.lon === 'number') return { pos: [found.lat, found.lon], at: found.seen_at, from: 'ship radio (AIS)', heading: found.heading ?? found.cog ?? null }
  return null
}

// ── the sea chart ──
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const ENGLISH = ['coalesce', ['get', 'name:en'], ['get', 'name_int'], ['get', 'name:latin'], ['get', 'name']]
const SEA = '#a9cdee', LAND = '#f3f1ec'
function addSeaChart(m) {
  try {
    const gl = L.maplibreGL({ style: MAP_STYLE, attribution: '© <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>' }).addTo(m)
    const ml = gl.getMaplibreMap()
    ml.on('style.load', () => {
      for (const layer of ml.getStyle().layers || []) {
        try {
          if (layer.type === 'background') ml.setPaintProperty(layer.id, 'background-color', LAND)
          else if (layer.type === 'fill' && /water|ocean/.test(layer.id)) ml.setPaintProperty(layer.id, 'fill-color', SEA)
          else if (layer.type === 'line' && /waterway/.test(layer.id)) ml.setPaintProperty(layer.id, 'line-color', SEA)
          else if (layer.type === 'symbol' && /water|ocean|sea|marine/.test(layer.id)) { ml.setPaintProperty(layer.id, 'text-color', '#3d6f9e'); ml.setPaintProperty(layer.id, 'text-halo-color', 'rgba(255,255,255,0.5)') }
          // land detail that clutters a sea map
          else if (/poi|transit|aeroway|building|housenumber/.test(layer.id)) ml.setLayoutProperty(layer.id, 'visibility', 'none')
          if (layer.type === 'symbol' && /name/.test(JSON.stringify(layer.layout?.['text-field'] || ''))) ml.setLayoutProperty(layer.id, 'text-field', ENGLISH)
        } catch { /* a layer without that property */ }
      }
    })
  } catch {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(m)
  }
  // buoys, lights and channels near the ports (free, open data)
  L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { minZoom: 9, maxZoom: 18, opacity: 0.9, attribution: '© <a href="https://www.openseamap.org" target="_blank">OpenSeaMap</a>' }).addTo(m)
}

// ── geometry (small numbers, flat-earth is fine for picking points) ──
const R_NM = 3440.065
const rad = (d) => (d * Math.PI) / 180
function nm(a, b) {
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)))
}
function bearing(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]))
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]))
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}
// one line through the route's pieces, unwrapped across the date line
function routeLine(route) {
  const out = []
  for (const seg of route?.segments || []) for (const [la, lo] of seg) {
    const prev = out[out.length - 1]
    let x = lo
    if (prev) { while (x - prev[1] > 180) x -= 360; while (prev[1] - x > 180) x += 360 }
    out.push([la, x])
  }
  return out
}
// The voyage around the ship: the route split where the ship is, its heading and progress
function voyage(s) {
  const line = routeLine(s.route)
  const pos = s.pos
  if (!pos) return null
  let p = [pos[0], pos[1]]
  if (line.length >= 2) {
    let k = 0, best = Infinity
    line.forEach((q, i) => { const d = (q[0] - p[0]) ** 2 + ((q[1] - p[1]) * Math.cos(rad(p[0]))) ** 2; if (d < best) { best = d; k = i } })
    // keep the ship's longitude on the same "copy" of the world as the route
    while (p[1] - line[k][1] > 180) p = [p[0], p[1] - 360]
    while (line[k][1] - p[1] > 180) p = [p[0], p[1] + 360]
    // the route point just ahead of the ship (the nearest one may be behind it)
    let next = k
    if (k < line.length - 1 && k > 0) next = nm(line[k - 1], line[k + 1]) > nm(line[k - 1], p) ? k + 1 : k
    if (next === k && k < line.length - 1 && nm(p, line[k]) < 5) next = k + 1
    const sailed = [...line.slice(0, next), p]
    const ahead = [p, ...line.slice(next)]
    const len = (pts) => pts.slice(1).reduce((t, q, i) => t + nm(pts[i], q), 0)
    const done = len(sailed), left = len(ahead)
    const aim = ahead.find((q) => nm(p, q) > 3) || line[line.length - 1]
    return { pos: p, sailed, ahead, heading: s.heading ?? (aim ? bearing(p, aim) : null), done, left, pct: done + left > 0 ? Math.round((done / (done + left)) * 100) : null }
  }
  // no route: point the ship along its last two known positions
  const tr = (s.track || []).filter((t) => typeof t[0] === 'number')
  const a = tr[tr.length - 2], b = tr[tr.length - 1]
  return { pos: p, sailed: [], ahead: [], heading: s.heading ?? (a && b && nm(a, b) > 1 ? bearing(a, b) : null), done: null, left: null, pct: null }
}

const STALE_HOURS = 24
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const ago = (v) => {
  const h = (Date.now() - new Date(v).getTime()) / 3600e3
  if (isNaN(h)) return ''
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`
}
const alive = (m) => !!m && !!m._mapPane && !!m.getContainer()?.isConnected
const ARABIAN_SEA = [[15, 70], 4]
const fit = (m, bounds, zoom = 6) => {
  if (!alive(m)) return
  if (bounds.length === 1) m.setView(bounds[0], zoom)
  else if (bounds.length) m.fitBounds(L.latLngBounds(bounds).pad(0.15), { maxZoom: 7 })
  else m.setView(...ARABIAN_SEA)
}
// the vessel mark ship trackers use: a slim arrow, bow up, turned to the heading
const hull = (color) => `<svg viewBox="0 0 18 30" width="18" height="30" aria-hidden="true"><path d="M9 1.5 L16 27 L9 22.8 L2 27 Z" fill="${color}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg>`

export default function ShipMap({ ships = [], selectedKey, onSelect, height = 420 }) {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const lastBounds = useRef([])
  const lastFitKey = useRef(null)
  const [big, setBig] = useState(false)
  const [closedFor, setClosedFor] = useState(null) // the ship whose card was closed

  useEffect(() => {
    if (!box.current || map.current) return
    // the mouse wheel zooms (Jose, 24 Oct 2026)
    map.current = L.map(box.current, { zoomControl: true, scrollWheelZoom: true, wheelPxPerZoomLevel: 90, worldCopyJump: true, minZoom: 2 }).setView(...ARABIAN_SEA)
    addSeaChart(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
  }, [])

  const placed = ships.filter((s) => s.pos)
  const sel = placed.find((s) => s.key === selectedKey) || (placed.length === 1 ? placed[0] : null)
  const trips = Object.fromEntries(placed.map((s) => [s.key, voyage(s)]))
  const v = sel ? trips[sel.key] : null
  const card = !!sel && closedFor !== sel.key

  useEffect(() => {
    const m = map.current
    if (!m) return
    layer.current.clearLayers()
    const bounds = []
    // the selected ship's voyage: water crossed (solid), the rest of the route (dashed), the port
    if (sel && v) {
      if (v.sailed.length > 1) {
        L.polyline(v.sailed, { color: '#ffffff', weight: 7, opacity: 0.7 }).addTo(layer.current)
        L.polyline(v.sailed, { color: '#0b6b3a', weight: 3.5, opacity: 0.95 }).addTo(layer.current)
      }
      if (v.ahead.length > 1) L.polyline(v.ahead, { color: '#1a4fa0', weight: 3, opacity: 0.8, dashArray: '2 8', lineCap: 'round' }).addTo(layer.current)
      // positions seen on earlier checks
      for (const t of (sel.track || []).slice(0, -1)) {
        if (typeof t[0] !== 'number') continue
        L.circleMarker([t[0], t[1]], { radius: 3, color: '#0b6b3a', weight: 1, fillColor: '#fff', fillOpacity: 1 })
          .bindTooltip(`Position ${esc(ago(t[2]))}`).addTo(layer.current)
      }
      const pod = sel.route?.pod || v.ahead[v.ahead.length - 1]
      if (pod) {
        L.marker(pod, { icon: L.divIcon({ className: 'ix-tpin', iconSize: [0, 0], html: `<div class="ix-port"><i class="ti ti-anchor"></i></div>` }) })
          .bindTooltip(`<b>${esc(sel.podName || 'Port of discharge')}</b>${sel.eta ? `<br>${esc(sel.eta)}` : ''}`, { direction: 'top', offset: [0, -14] }).addTo(layer.current)
        bounds.push(pod)
      }
      const pol = sel.route?.pol
      if (pol && v.sailed.length > 1) {
        L.circleMarker(pol, { radius: 5, color: '#0b6b3a', weight: 2, fillColor: '#fff', fillOpacity: 1 })
          .bindTooltip(`<b>${esc(sel.polName || 'Port of loading')}</b>${sel.polDate ? `<br>Left ${esc(sel.polDate)}` : ''}`).addTo(layer.current)
      }
    }
    for (const s of placed) {
      const t = trips[s.key]
      const isSel = sel?.key === s.key
      const stale = s.at && Date.now() - new Date(s.at).getTime() > STALE_HOURS * 3600e3
      const color = stale ? '#94a3b8' : s.arrived ? '#b45309' : '#15803d'
      const pos = t?.pos || s.pos
      const shape = t?.heading != null
        ? `<span class="hull" style="transform:translate(-50%,-50%) rotate(${Math.round(t.heading)}deg)">${hull(color)}</span>`
        : `<span class="dot" style="background:${color}"></span>`
      // JDS knows ships by their jobs: the pin shows the job numbers, not the IMO (Jose, 24 Oct 2026)
      const tone = stale ? 'old' : s.arrived ? 'port' : 'sea'
      const html = `<div class="ix-ship ${isSel ? 'sel' : ''}">${shape}<div class="ix-smark ${tone} ${isSel ? 'sel' : ''}"><span class="ic"><i class="ti ti-ship"></i></span>${esc(s.jobs)}</div></div>`
      L.marker(pos, { icon: L.divIcon({ className: 'ix-tpin', iconSize: [0, 0], html }), zIndexOffset: isSel ? 1000 : 0 })
        .bindTooltip(`<b>${esc(s.jobs)}</b>${s.where ? `<br>${esc(s.where)}` : ''}${s.eta ? `<br>${esc(s.eta)}` : ''}${s.at ? `<br>Position ${esc(ago(s.at))}` : ''}`, { direction: 'top', offset: [0, -20] })
        .on('click', () => { onSelect?.(s.key); setClosedFor(null) })
        .addTo(layer.current)
      if (isSel) bounds.push(pos)
    }
    if (!bounds.length || big) placed.forEach((s) => bounds.push(trips[s.key]?.pos || s.pos))
    lastBounds.current = bounds
    // move the view only when the selection (or the ships) change, so zooming in stays put
    const fitKey = `${sel?.key || ''}|${placed.map((s) => s.key).join(',')}|${big}`
    if (fitKey !== lastFitKey.current) { lastFitKey.current = fitKey; fit(m, bounds) }
    setTimeout(() => { if (alive(m)) m.invalidateSize() }, 0)
  }) // redraw on every render: the lists are small

  // full screen: fit to the new size, zoom with the mouse wheel, Esc closes
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

  const zoomTo = () => { const m = map.current; if (m && v) m.setView(v.pos, 9) }

  return (
    <>
      {big && <div className="ix-realmap-backdrop" onClick={() => setBig(false)} />}
      <div className={`ix-realmap ix-shipmap2 ${big ? 'big' : ''}`} style={big ? undefined : { height }}>
        <div ref={box} className="ix-realmap-canvas" role="img" aria-label="Sea map of ships carrying our cargo" />
        {!placed.length && (
          <div className="ix-realmap-msg">
            <Icon name="ship" /> {ships.length ? 'No ship position yet.' : 'No ship is carrying our cargo right now.'}
            {ships.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>Positions come with Safecube tracking (job → Ship tracking).</div>}
          </div>
        )}
        {/* the voyage card, like a ship tracker's */}
        {sel && card && (
          <div className="ix-voyage" onClick={(e) => e.stopPropagation()}>
            <div className="hd">
              <span className="ic"><Icon name="ship" /></span>
              <div style={{ minWidth: 0 }}>
                <div className="t">{sel.jobs}</div>
                <div className="s">{[sel.clients, sel.line, sel.label].filter(Boolean).join(' · ')}</div>
              </div>
              <button type="button" className="x" onClick={() => setClosedFor(sel.key)} aria-label="Close the card"><Icon name="x" /></button>
            </div>
            {(sel.polName || sel.podName) && (
              <div className="legs">
                <div><div className="k">From</div><div className="v">{sel.polName || '—'}</div>{sel.polDate && <div className="d">Left {sel.polDate}</div>}</div>
                <Icon name="arrow-right" />
                <div style={{ textAlign: 'right' }}><div className="k">To</div><div className="v">{sel.podName || '—'}</div>{sel.eta && <div className="d">{sel.eta}</div>}</div>
              </div>
            )}
            {v?.pct != null && (
              <>
                <div className="bar"><span style={{ width: `${sel.arrived ? 100 : v.pct}%` }} /></div>
                <div className="prog">
                  <span>{sel.arrived ? 'Arrived' : `${v.pct}% of the way`}</span>
                  {!sel.arrived && v.left != null && <span>{Math.round(v.left).toLocaleString('en-IN')} nm to go</span>}
                </div>
              </>
            )}
            <div className="foot">
              {sel.where && <span>{sel.where}</span>}
              {sel.at && <span>Position {ago(sel.at)}{sel.from ? ` · ${sel.from}` : ''}</span>}
              {v?.heading != null && <span>Heading {Math.round(v.heading)}°</span>}
              <button type="button" className="ix-link" style={{ margin: 0 }} onClick={zoomTo}>Zoom to ship →</button>
            </div>
          </div>
        )}
        <div className="ix-realmap-legend">
          <span><i style={{ background: '#16a34a' }} />At sea</span>
          <span><i style={{ background: '#d97706' }} />At port</span>
          <span><i style={{ background: '#94a3b8' }} />Position {STALE_HOURS} h+ old</span>
          <span><b style={{ color: '#0b6b3a' }}>━</b> Sailed <b style={{ color: '#1a4fa0', marginLeft: 6 }}>┅</b> Ahead</span>
        </div>
        <button type="button" className="ix-realmap-expand" onClick={() => setBig((b) => !b)}
          title={big ? 'Make the map small again (Esc)' : 'Full screen'} aria-label={big ? 'Make the map small again' : 'Full screen map'}>
          <Icon name={big ? 'arrows-diagonal-minimize-2' : 'arrows-diagonal'} />
        </button>
      </div>
    </>
  )
}
