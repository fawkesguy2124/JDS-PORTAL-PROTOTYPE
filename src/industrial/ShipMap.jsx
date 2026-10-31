import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@maplibre/maplibre-gl-leaflet'
import { nm, shortDate, voyage, shortPort, viaText, TONE_COLOR, toneOf } from './shipInfo'
import { Icon } from './ui'
import { iconSvg } from '../ui/iconSvg'

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

// ship facts without map code (vesselOf, voyage, toneOf…) live in shipInfo.js


// ── the sea chart ──
// A calm, dashboard-style chart (Jose, 25 Oct 2026: "very professional"): light grey
// land, soft blue sea, only country names and big cities, no terrain or roads, so the
// ships and their routes are the only colour on the map.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const ENGLISH = ['coalesce', ['get', 'name:en'], ['get', 'name_int'], ['get', 'name:latin'], ['get', 'name']]
const SEA = '#cddff1', LAND = '#eef0f3'
const HIDE = /poi|transit|aeroway|building|housenumber|road|highway|bridge|tunnel|railway|ferry|landcover|landuse|park|wood|grass|sand|glacier|ice|aerialway|label_town|label_village|label_other|label_state|place_other|hillshade/
// (exported for the portal's job-page sea map, src/portal/SeaMap.jsx)
// eslint-disable-next-line react-refresh/only-export-components
export function addSeaChart(m) {
  try {
    const gl = L.maplibreGL({ style: MAP_STYLE, attribution: '© <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>' }).addTo(m)
    const ml = gl.getMaplibreMap()
    ml.on('style.load', () => {
      for (const layer of ml.getStyle().layers || []) {
        try {
          const id = layer.id
          if (layer.type === 'raster' || layer.type === 'hillshade' || HIDE.test(id)) { ml.setLayoutProperty(id, 'visibility', 'none'); continue }
          if (layer.type === 'background') ml.setPaintProperty(id, 'background-color', LAND)
          else if (layer.type === 'fill' && /water|ocean/.test(id)) ml.setPaintProperty(id, 'fill-color', SEA)
          else if (layer.type === 'line' && /waterway/.test(id)) ml.setPaintProperty(id, 'line-color', SEA)
          else if (layer.type === 'line' && /boundary|admin/.test(id)) { ml.setPaintProperty(id, 'line-color', '#c5ccd6'); ml.setPaintProperty(id, 'line-opacity', 0.9) }
          else if (layer.type === 'symbol') {
            if (/water|ocean|sea|marine/.test(id)) ml.setPaintProperty(id, 'text-color', '#7d9cbd')
            else ml.setPaintProperty(id, 'text-color', /country/.test(id) ? '#5f6b7c' : '#8a93a1')
            ml.setPaintProperty(id, 'text-halo-color', 'rgba(255,255,255,0.85)')
            if (/name/.test(JSON.stringify(layer.layout?.['text-field'] || ''))) ml.setLayoutProperty(id, 'text-field', ENGLISH)
          }
        } catch { /* a layer without that property */ }
      }
    })
  } catch {
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors © CARTO' }).addTo(m)
  }
  // buoys, lights and channels near the ports, only when zoomed right in (free, open data)
  L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { minZoom: 10, maxZoom: 18, opacity: 0.8, attribution: '© <a href="https://www.openseamap.org" target="_blank">OpenSeaMap</a>' }).addTo(m)
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const ago = (v) => {
  const h = (Date.now() - new Date(v).getTime()) / 3600e3
  if (isNaN(h)) return ''
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`
}
const alive = (m) => !!m && !!m._mapPane && !!m.getContainer()?.isConnected
const ARABIAN_SEA = [[15, 70], 4]
// card: leave room on the right for the voyage card
const fit = (m, bounds, maxZoom = 7, card = false) => {
  if (!alive(m)) return
  const wide = card && m.getSize().x > 760
  if (bounds.length === 1) m.setView(bounds[0], 6)
  // room for the tags beside the ships (about 180 px) and the colour key below
  else if (bounds.length) m.fitBounds(L.latLngBounds(bounds), { paddingTopLeft: [90, 50], paddingBottomRight: [wide ? 410 : 190, 80], maxZoom })
  else m.setView(...ARABIAN_SEA)
}
// the vessel mark ship trackers use: a slim arrow, bow up, turned to the heading
const hull = (color) => `<svg viewBox="0 0 16 26" width="16" height="26" aria-hidden="true"><path d="M8 1.5 L14.5 23.5 L8 19.8 L1.5 23.5 Z" fill="${color}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg>`
// "Arabian Sea, near Nhava Sheva" → "near Nhava Sheva"
const placeOf = (where) => {
  const m = /,\s*((?:near|at) .+)$/.exec(String(where || ''))
  return m ? m[1] : String(where || '').split(',')[0]
}
// the last stretch the ship sailed (about 600 km), as a faint trail
function trail(sailed) {
  const out = []
  let d = 0
  for (let i = sailed.length - 1; i >= 0; i--) {
    if (out.length) d += nm(out[0], sailed[i])
    out.unshift(sailed[i])
    if (d > 320) break
  }
  return out
}
// a tag's pixel width, roughly (Inter 11.5–12 px)
const tagW = (a, b) => 22 + 7.2 * String(a).length + (b ? 10 + 6.3 * String(b).length : 0)

export default function ShipMap({ ships = [], selectedKey, onSelect, height = 420 }) {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const lastBounds = useRef([])
  const lastFitKey = useRef(null)
  const [big, setBig] = useState(false)
  const [closedFor, setClosedFor] = useState(null) // the ship whose card was closed
  const [, setZoomTick] = useState(0) // a zoom redraws, so the tags are spread again

  useEffect(() => {
    if (!box.current || map.current) return
    // the mouse wheel zooms (Jose, 24 Oct 2026)
    map.current = L.map(box.current, { zoomControl: false, scrollWheelZoom: true, wheelPxPerZoomLevel: 90, worldCopyJump: true, minZoom: 2, zoomSnap: 0.25 }).setView(...ARABIAN_SEA)
    map.current.attributionControl.setPrefix(false) // no "Leaflet" credit; the map credits sit behind the small ⓘ
    L.control.zoom({ position: 'topleft' }).addTo(map.current)
    L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 110 }).addTo(map.current)
    addSeaChart(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    map.current.on('zoomend', () => setZoomTick((n) => n + 1))
    return () => { map.current?.remove(); map.current = null }
  }, [])

  const placed = ships.filter((s) => s.pos)
  const sel = placed.find((s) => s.key === selectedKey) || null
  const trips = Object.fromEntries(placed.map((s) => [s.key, voyage(s)]))
  const v = sel ? trips[sel.key] : null
  const card = !!sel && closedFor !== sel.key

  useEffect(() => {
    const m = map.current
    if (!m) return
    layer.current.clearLayers()
    const bounds = []
    const posOf = (s) => trips[s.key]?.pos || s.pos

    // faint trails behind the other ships; the chosen ship gets its whole voyage
    for (const s of placed) {
      const t = trips[s.key]
      if (s.key === sel?.key || !t || t.sailed.length < 2) continue
      L.polyline(trail(t.sailed), { color: TONE_COLOR[toneOf(s)], weight: 2, opacity: 0.35, interactive: false }).addTo(layer.current)
    }
    if (sel && v) {
      if (v.sailed.length > 1) {
        L.polyline(v.sailed, { color: '#ffffff', weight: 6, opacity: 0.8, interactive: false }).addTo(layer.current)
        L.polyline(v.sailed, { color: '#15803d', weight: 3, opacity: 0.95, interactive: false }).addTo(layer.current)
      }
      if (v.ahead.length > 1) L.polyline(v.ahead, { color: '#1a4fa0', weight: 2.5, opacity: 0.75, dashArray: '1 7', lineCap: 'round', interactive: false }).addTo(layer.current)
      for (const t of (sel.track || []).slice(0, -1)) {
        if (typeof t[0] !== 'number') continue
        L.circleMarker([t[0], t[1]], { radius: 2.5, color: '#15803d', weight: 1, fillColor: '#fff', fillOpacity: 1 })
          .bindTooltip(`Position ${esc(ago(t[2]))}`).addTo(layer.current)
      }
      const pol = sel.route?.pol
      if (pol) {
        L.circleMarker(pol, { radius: 5, color: '#15803d', weight: 2, fillColor: '#fff', fillOpacity: 1 })
          .bindTooltip(`<b>${esc(sel.polName || 'Port of loading')}</b>${sel.polDate ? `<br>${esc(sel.polDate)}` : ''}`).addTo(layer.current)
      }
      // ports on the way: where the cargo changes ship (labelled), and where its ship just calls
      for (const p of sel.route?.via || []) {
        if (!Array.isArray(p.pos)) continue
        const dates = [p.arrive && `${p.arrived ? 'Arrived' : 'Arrives'} ${shortDate(p.arrive)}`, p.leave && `${p.left ? 'Left' : 'Leaves'} ${shortDate(p.leave)}`].filter(Boolean).join(' · ')
        if (p.change) {
          const html = `<div class="ix-via"><span class="dot">${iconSvg('transfer')}</span><span class="lbl">${esc(shortPort(p.name))} · change ship</span></div>`
          L.marker(p.pos, { icon: L.divIcon({ className: 'ix-tpin', iconSize: [0, 0], html }), zIndexOffset: 500 })
            .bindTooltip(`<b>${esc(p.name)}</b> · change ship${p.inShip ? `<br>${esc(p.inShip)} → ${esc(p.outShip)}` : ''}${dates ? `<br>${esc(dates)}` : ''}`, { direction: 'top', offset: [0, -14] }).addTo(layer.current)
        } else {
          L.circleMarker(p.pos, { radius: 3.5, color: '#1a4fa0', weight: 2, fillColor: '#fff', fillOpacity: 1 })
            .bindTooltip(`<b>${esc(p.name)}</b> · stop${dates ? `<br>${esc(dates)}` : ''}`).addTo(layer.current)
        }
      }
      // the view frames this ship's whole voyage
      bounds.push(...v.sailed, ...v.ahead)
      if (!v.sailed.length && !v.ahead.length) bounds.push(v.pos)
    }

    // tags never on top of each other, and never far from their ship (Jose, 25 Oct 2026):
    // each tag tries right of its mark, then left, above, below; ports first
    const taken = []
    const size = m.getSize()
    const hits = (b) => taken.some((o) => b.x1 < o.x2 && b.x2 > o.x1 && b.y1 < o.y2 && b.y2 > o.y1)
    const placeTag = (p, w, h = 24, gap = 13) => {
      const spots = [[gap, -h / 2], [-w - gap, -h / 2], [-w / 2, -h - gap], [-w / 2, gap], [gap, -h / 2 - h - 4], [gap, h / 2 + 4], [-w - gap, -h / 2 - h - 4], [-w - gap, h / 2 + 4]]
      const at = (dx, dy) => ({ x1: p.x + dx - 3, x2: p.x + dx + w + 3, y1: p.y + dy - 3, y2: p.y + dy + h + 3 })
      // inside the map, clear of the controls, and clear of other tags
      const area = (a, o) => Math.max(0, Math.min(a.x2, o.x2) - Math.max(a.x1, o.x1)) * Math.max(0, Math.min(a.y2, o.y2) - Math.max(a.y1, o.y1))
      const cornerBox = { x1: size.x - 110, x2: size.x, y1: size.y - 66, y2: size.y }
      const keyBox = { x1: 0, x2: 310, y1: size.y - 48, y2: size.y }
      const zoomBox = { x1: 0, x2: 48, y1: 0, y2: 84 }
      const inside = (b) => b.x1 >= 6 && b.x2 <= size.x - 6 && b.y1 >= 6 && b.y2 <= size.y - 6 && area(b, keyBox) === 0 && area(b, zoomBox) === 0 && area(b, cornerBox) === 0
      // no clean spot: the one that hides least (cut off at the edge counts double)
      const view = { x1: 6, x2: size.x - 6, y1: 6, y2: size.y - 6 }
      const cost = ([dx, dy]) => {
        const b = at(dx, dy)
        const out = (b.x2 - b.x1) * (b.y2 - b.y1) - area(b, view)
        return out * 2 + (area(b, keyBox) + area(b, zoomBox) + area(b, cornerBox)) * 2 + taken.reduce((t, o) => t + area(b, o), 0)
      }
      const pick = spots.find(([dx, dy]) => inside(at(dx, dy)) && !hits(at(dx, dy))) || [...spots].sort((x, y) => cost(x) - cost(y))[0]
      taken.push(at(...pick))
      return pick
    }
    const pt = Object.fromEntries(placed.map((s) => [s.key, m.latLngToContainerPoint(posOf(s))]))
    // the ship marks themselves are taken space too
    for (const s of placed) taken.push({ x1: pt[s.key].x - 9, x2: pt[s.key].x + 9, y1: pt[s.key].y - 12, y2: pt[s.key].y + 12 })

    // ports the ships are heading to: an anchor with how many are inbound
    const ports = new Map()
    for (const s of placed) {
      const pod = s.route?.pod
      if (!Array.isArray(pod) || !s.podName) continue
      const g = ports.get(s.podName) || { name: s.podName, pos: pod, inbound: 0, here: 0 }
      if (s.arrived || s.atPod) g.here++
      else if (!s.waiting) g.inbound++
      ports.set(s.podName, g)
    }
    const portTags = []
    for (const g of ports.values()) {
      const p = m.latLngToContainerPoint(g.pos)
      taken.push({ x1: p.x - 12, x2: p.x + 12, y1: p.y - 12, y2: p.y + 12 })
      portTags.push({ g, p })
      if (!sel) bounds.push(g.pos)
    }

    // ships close together on screen become one mark ("J-584 · J-689 near Nhava Sheva");
    // the chosen ship always stands alone
    const groups = []
    for (const s of placed) {
      if (s.key === sel?.key) { groups.push([s]); continue }
      const g = groups.find((x) => x[0].key !== sel?.key && x.some((o) => pt[o.key].distanceTo(pt[s.key]) < 26))
      if (g) g.push(s)
      else groups.push([s])
    }
    // the chosen ship's tag is placed first, so it gets the best spot
    groups.sort((a, b) => (a[0].key === sel?.key ? -1 : b[0].key === sel?.key ? 1 : 0))
    for (const g of groups) {
      if (g.length === 1) {
        const s = g[0]
        const t = trips[s.key]
        const isSel = sel?.key === s.key
        const tone = toneOf(s)
        const color = TONE_COLOR[tone]
        const shape = t?.heading != null && !s.waiting
          ? `<span class="hull" style="transform:translate(-50%,-50%) rotate(${Math.round(t.heading)}deg)">${hull(color)}</span>`
          : `<span class="dot" style="background:${color}"></span>`
        // JDS knows ships by their jobs: the tag shows the job numbers and clients, never the IMO (Jose, 24 Oct 2026)
        const client = String(s.clients || '').length > 22 ? `${String(s.clients).slice(0, 21)}…` : s.clients
        const [dx, dy] = placeTag(pt[s.key], tagW(s.jobs, client))
        const html = `<div class="ix-ship ${isSel ? 'sel' : ''}">${shape}<div class="ix-tag ${tone} ${isSel ? 'sel' : ''}" style="left:${dx}px;top:${dy}px"><b>${esc(s.jobs)}</b>${client ? `<span>${esc(client)}</span>` : ''}</div></div>`
        L.marker(posOf(s), { icon: L.divIcon({ className: 'ix-tpin', iconSize: [0, 0], html }), zIndexOffset: isSel ? 1000 : 0 })
          .on('click', () => { onSelect?.(s.key); setClosedFor(null) })
          .addTo(layer.current)
        if (!sel) bounds.push(posOf(s))
      } else {
        const tones = g.map(toneOf)
        const tone = tones.every((x) => x === tones[0]) ? tones[0] : 'sea'
        const center = g.map(posOf).reduce((a, q) => [a[0] + q[0] / g.length, a[1] + q[1] / g.length], [0, 0])
        const place = placeOf(g.find((s) => s.where)?.where)
        const jobs = g.map((s) => s.jobs).join(' · ')
        const [dx, dy] = placeTag(m.latLngToContainerPoint(center), tagW(jobs, place))
        const html = `<div class="ix-ship"><span class="ix-cluster ${tone}">${g.length}</span><div class="ix-tag ${tone}" style="left:${dx}px;top:${dy}px"><b>${esc(jobs)}</b>${place ? `<span>${esc(place)}</span>` : ''}</div></div>`
        L.marker(center, { icon: L.divIcon({ className: 'ix-tpin', iconSize: [0, 0], html }), zIndexOffset: 200 })
          .on('click', () => {
            // zoom in until they come apart; ships at one berth: pick the first
            const b = L.latLngBounds(g.map(posOf))
            if (m.getZoom() >= 11 || b.getNorthEast().distanceTo(b.getSouthWest()) < 1500) { onSelect?.(g[0].key); setClosedFor(null) }
            else m.fitBounds(b.pad(0.6), { maxZoom: 12 })
          })
          .addTo(layer.current)
        if (!sel) g.forEach((s) => bounds.push(posOf(s)))
      }
    }
    // port tags last: they take whatever room the ships left
    for (const { g, p } of portTags) {
      const sub = g.inbound ? `${g.inbound} inbound` : g.here ? `${g.here} in port` : ''
      const [dx, dy] = placeTag(p, tagW(g.name, sub), 24, 15)
      const html = `<div class="ix-portmk">${iconSvg('anchor')}</div><div class="ix-tag port-tag" style="left:${dx}px;top:${dy}px"><b>${esc(g.name)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`
      L.marker(g.pos, { icon: L.divIcon({ className: 'ix-tpin', iconSize: [0, 0], html }), zIndexOffset: -100, interactive: false }).addTo(layer.current)
    }
    lastBounds.current = bounds
    // move the view only when the selection (or the ships) change, so zooming in stays put
    const fitKey = `${sel?.key || ''}|${placed.map((s) => s.key).join(',')}|${big}`
    if (fitKey !== lastFitKey.current) { lastFitKey.current = fitKey; fit(m, bounds, sel ? 7 : 5, !!sel) }
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

  return (
    <>
      {big && <div className="ix-realmap-backdrop" onClick={() => setBig(false)} />}
      <div className={`ix-realmap ix-shipmap2 ${big ? 'big' : ''}`} style={big ? undefined : { height }}>
        <div ref={box} className="ix-realmap-canvas" role="img" aria-label="Sea map of ships carrying our cargo" />
        {!placed.length && (
          <div className="ix-realmap-msg">
            <Icon name="ship" /> {ships.length ? 'No ship position yet.' : 'No ship is carrying our cargo right now.'}
            {ships.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>Positions come with ship tracking (open the job → Track this ship).</div>}
          </div>
        )}
        {sel && (
          <button type="button" className="ix-map-all" onClick={() => onSelect?.(null)}><Icon name="world" />All ships</button>
        )}
        {/* the voyage card, like a ship tracker's */}
        {sel && card && (
          <div className="ix-voyage" onClick={(e) => e.stopPropagation()}>
            <div className="hd">
              <span className={`ic ${toneOf(sel)}`}><Icon name="ship" /></span>
              <div style={{ minWidth: 0 }}>
                <div className="t">{sel.jobs}</div>
                <div className="s">{[sel.clients, sel.line].filter(Boolean).join(' · ')}</div>
              </div>
              <button type="button" className="x" onClick={() => setClosedFor(sel.key)} aria-label="Close the card"><Icon name="x" /></button>
            </div>
            {(sel.polName || sel.podName) && (
              <div className="legs">
                <div><div className="k">From</div><div className="v">{sel.polName || '—'}</div>{sel.polDate && <div className="d">{sel.polDate}</div>}</div>
                <Icon name="arrow-right" />
                <div style={{ textAlign: 'right' }}><div className="k">To</div><div className="v">{sel.podName || '—'}</div>{sel.eta && <div className="d">{sel.eta}</div>}{sel.delay && <div className={`ix-delay ${sel.delay.tone}`}>{sel.delay.text}</div>}</div>
              </div>
            )}
            {viaText(sel.route) && <div className="via"><Icon name="transfer" />{viaText(sel.route)}</div>}
            {(sel.flags || []).map((f) => <div key={f.id} className={`ix-flag ${f.tone}`}><Icon name={f.icon} />{f.text}</div>)}
            {v?.pct != null && (
              <>
                <div className="bar"><span style={{ width: `${sel.arrived || sel.atPod ? 100 : sel.waiting ? 0 : v.pct}%` }} /></div>
                <div className="prog">
                  <span>{sel.arrived ? 'Arrived' : sel.atPod ? 'At the port · arrival not confirmed yet' : sel.waiting ? 'Not sailed yet' : `${v.pct}% of the way`}</span>
                  {!sel.arrived && !sel.atPod && v.left != null && <span>{Math.round(v.left * 1.852).toLocaleString('en-IN')} km {sel.waiting ? 'voyage' : 'to go'}</span>}
                </div>
              </>
            )}
            {(sel.lastMove || sel.nextStop) && (
              <div className="moves">
                {sel.lastMove && <div><span className="k">Last move</span>{sel.lastMove}</div>}
                {sel.nextStop && <div><span className="k">Next stop</span>{sel.nextStop}</div>}
              </div>
            )}
            <div className="foot">
              {sel.where && <span><Icon name="map-pin" />{sel.where}</span>}
              {sel.at && !sel.waiting && <span>Position {ago(sel.at)}</span>}
              {v?.heading != null && !sel.waiting && <span>Heading {Math.round(v.heading)}°</span>}
            </div>
          </div>
        )}
        <div className="ix-realmap-legend">
          <span><i style={{ background: TONE_COLOR.sea }} />At sea</span>
          <span><i style={{ background: TONE_COLOR.port }} />At port</span>
          <span><i style={{ background: TONE_COLOR.old }} />Not sailed / old position</span>
          {sel && <span><b style={{ color: '#15803d' }}>━</b> Sailed <b style={{ color: '#1a4fa0', marginLeft: 6 }}>┅</b> Ahead</span>}
        </div>
        <button type="button" className="ix-realmap-expand" onClick={() => setBig((b) => !b)}
          title={big ? 'Make the map small again (Esc)' : 'Full screen'} aria-label={big ? 'Make the map small again' : 'Full screen map'}>
          <Icon name={big ? 'arrows-diagonal-minimize-2' : 'arrows-diagonal'} />
        </button>
      </div>
    </>
  )
}
