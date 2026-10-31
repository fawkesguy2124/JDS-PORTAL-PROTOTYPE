import { useEffect, useRef, useState } from 'react'
import { shipPosition, voyage, shortPort } from '../industrial/shipInfo'
import { portByCode } from '../utils/ports'
import './maps.css'

// Where the ship (or plane) is, on the job page's WHERE card (approved design,
// Jose 31 Oct 2026). With a position (Safecube's tracking, else the ship's last
// AIS position) it is a real sea chart, quiet like the prototype: the water
// sailed as a solid line, the rest dashed, both ports pinned and the ship's name
// on a tag. Without one (and for flights) it is the prototype's drawn map.
// The map library (Leaflet + MapLibre, ~1 MB) loads only when a real map shows.
// Nothing here calls any service: it draws what the journey data already holds.

const W = 700, H = 250
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const has = (p) => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number'
// the map may have been closed in the meantime (job changed)
const alive = (m) => !!m && !!m._mapPane && !!m.getContainer()?.isConnected

// the vehicle glyphs of the prototype, drawn around (0, 0)
const SHIP_ICON = 'M-8,2 L8,2 L6,6 L-6,6 Z M-4,2 L-4,-4 L3,-4 L3,2'
const PLANE_ICON = 'M-9,1 L9,-1 M3,-1 L-2,-8 M3,-1 L-2,7 M-7,0 L-9,-4'
const vehSvg = (d) => `<svg viewBox="-15 -15 30 30" aria-hidden="true"><path d="${d}" class="pt-mp-veh-fg"/></svg>`

// How far along the voyage is, 0..1 (drawn map only): sailed → arrives, else
// job created → ETA, else halfway
function progressOf(sea, job) {
  const span = (a, b) => {
    const s = new Date(a).getTime(), e = new Date(b).getTime()
    return Number.isFinite(s) && Number.isFinite(e) && e > s ? clamp((Date.now() - s) / (e - s), 0.05, 0.95) : null
  }
  return (sea && !sea.error && span(sea.pol_date, sea.pod_date)) ?? span(job?.created_at, job?.eta) ?? 0.5
}

// marker helpers handed to every draw() (RoadMap uses them too)

/** A real Leaflet map in a .pt-map box. The library loads on first use.
 *  draw(L, map, layer, kit) adds the job's marks to `layer` and returns fit():
 *  it frames them and is called again whenever the box changes size.
 *  kit = { vehicleIcon(L, { icon, tag, mono, below }), pinIcon(L, { name, end }),
 *          keepInside(map, marker, latlng), declutter(map) }.
 *  Redraws when drawKey changes. Shows `fallback` if the library cannot load. */
export function LiveMap({ road = false, layout, label, drawKey, draw, fallback = null }) {
  const box = useRef(null)
  const drawRef = useRef(draw)
  const fitRef = useRef(null)
  const [live, setLive] = useState(null) // { L, map, layer }
  const [failed, setFailed] = useState(false)

  useEffect(() => { drawRef.current = draw })

  useEffect(() => {
    let cancelled = false
    let map = null
    let ro = null
    ;(async () => {
      try {
        const [{ default: L }, base] = await Promise.all([
          import('leaflet'),
          road ? import('../industrial/TruckMap') : import('../industrial/ShipMap'),
        ])
        if (cancelled || !box.current) return
        const phone = layout === 'm'
        map = L.map(box.current, {
          zoomControl: false, attributionControl: true, scrollWheelZoom: false,
          dragging: !phone, touchZoom: !phone, doubleClickZoom: !phone, boxZoom: false, keyboard: false, tap: false,
          zoomSnap: 0.25, fadeAnimation: false,
          // fixed range: otherwise Leaflet takes the zoom range from the layers (the sea marks start at 10)
          minZoom: 1, maxZoom: 18,
        })
        map.attributionControl.setPrefix(false) // no "Leaflet" credit; the map credits sit behind the small "i"
        map.setView([19, 72.8], 4)
        if (road) base.addBaseMap(map)
        else { base.addSeaChart(map); quietSea(map) }
        const layer = L.layerGroup().addTo(map)
        // the pane / page can change size (window, phone page growing out of its row)
        if (typeof ResizeObserver === 'function') {
          let raf = 0
          ro = new ResizeObserver(() => {
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => { if (alive(map)) { map.invalidateSize(); fitRef.current?.() } })
          })
          ro.observe(box.current)
        }
        setLive({ L, map, layer })
      } catch (err) {
        if (!cancelled) { console.warn('[map] could not load the map:', err?.message || err); setFailed(true) }
      }
    })()
    return () => { cancelled = true; ro?.disconnect(); fitRef.current = null; map?.remove() }
  }, [road, layout])

  useEffect(() => {
    if (!live || !alive(live.map)) return
    live.layer.clearLayers()
    try {
      fitRef.current = drawRef.current(live.L, live.map, live.layer, { vehicleIcon, pinIcon, keepInside, declutter }) || null
      fitRef.current?.()
    } catch (err) {
      console.warn('[map] could not draw:', err?.message || err)
    }
  }, [live, drawKey])

  if (failed && fallback) return fallback
  return (
    <div className={`pt-map${road ? ' pt-map--road' : ''}`}>
      <div ref={box} className={`pt-map-canvas${live ? ' on' : ''}`} role="img" aria-label={label} />
    </div>
  )
}

// the sea chart without city names: the job's own ports are pinned and named
function quietSea(map) {
  map.eachLayer((layer) => {
    const ml = layer.getMaplibreMap?.()
    if (!ml) return
    const hide = () => {
      for (const l of ml.getStyle()?.layers || []) {
        if (l.type === 'symbol' && /^label_city/.test(l.id)) { try { ml.setLayoutProperty(l.id, 'visibility', 'none') } catch { /* gone */ } }
      }
    }
    ml.on('style.load', hide)
    if (ml.isStyleLoaded?.()) hide()
  })
}

/** After the view is set: keep tags and labels inside the map (they are centred
 *  on their point; near an edge they slide in, the mark stays on the point). */
function keepInside(map, marker, latlng) {
  const el = marker.getElement?.()
  if (!el || !alive(map)) return
  const size = map.getSize()
  const p = map.latLngToContainerPoint(latlng)
  for (const t of el.querySelectorAll('.pt-mk-tag, .pt-mk-label')) {
    const w = t.offsetWidth
    if (!w) continue
    let x = clamp(p.x - w / 2, 8, Math.max(8, size.x - w - 8))
    // clear of the credits' "i" in the bottom-right corner
    const bottom = p.y + t.offsetTop + t.offsetHeight
    if (bottom > size.y - 36 && x + w > size.x - 38) x = Math.max(8, size.x - 38 - w)
    t.style.transform = 'none'
    t.style.left = `${Math.round(x - p.x)}px`
  }
}

/** Pin names hidden where a name tag covers them (the tag matters more) */
function declutter(map) {
  const root = map?.getContainer?.()
  if (!root) return
  const tags = [...root.querySelectorAll('.pt-mk-tag')].map((t) => t.getBoundingClientRect())
  for (const l of root.querySelectorAll('.pt-mk-label')) {
    l.style.visibility = ''
    const r = l.getBoundingClientRect()
    if (tags.some((t) => r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top)) l.style.visibility = 'hidden'
  }
}

/** A vehicle mark: halo, brand circle with the glyph, name tag above or below */
function vehicleIcon(L, { icon, tag, mono = false, below = false }) {
  const html = `<span class="pt-mk-halo"></span><span class="pt-mk-veh">${vehSvg(icon)}</span>${tag ? `<span class="pt-mk-tag ${below ? 'below' : 'above'}${mono ? ' mono' : ''}">${esc(tag)}</span>` : ''}`
  return L.divIcon({ className: 'pt-mk', iconSize: [0, 0], html })
}

/** A place pin with its name under it (end = the destination, darker) */
function pinIcon(L, { name, end = false }) {
  const html = `<span class="pt-mk-pin${end ? ' end' : ''}"></span>${name ? `<span class="pt-mk-label${end ? ' t' : ''}">${esc(name)}</span>` : ''}`
  return L.divIcon({ className: 'pt-mk', iconSize: [0, 0], html })
}

// ── the drawn map (prototype seaMap) ──
function SeaSketch({ from, to, t, tag, air, layout }) {
  const L0 = 80, R = W - 90, Y = 178, cx = W / 2, cy = 44
  const bx = (1 - t) * (1 - t) * L0 + 2 * (1 - t) * t * cx + t * t * R
  const by = (1 - t) * (1 - t) * Y + 2 * (1 - t) * t * cy + t * t * Y
  const d = `M${L0},${Y} Q${cx},${cy} ${R},${Y}`
  const m = layout === 'm'
  const k = m ? 1.65 : 1
  const waves = []
  for (let y = 30; y < H; y += 34) for (let x = ((y / 34) % 2) * 40; x < W; x += 80) waves.push(`M${x},${y} q10,-6 20,0`)
  const tw = (String(tag || '').length * 9.2 + 28) * k
  const tx = Math.min(Math.max(bx - tw / 2, 8), W - tw - 8)
  // labels: as the prototype places them, kept inside the picture when a name is long
  const fromW = String(from).length * (m ? 13.5 : 8.3)
  const fromX = Math.max(L0, 8 + fromW / 2)
  const toW = String(to).length * (m ? 16.5 : 9.8)
  const toX0 = R - (m ? 40 : 0)
  const toEnd = toX0 + toW / 2 > W - 8
  return (
    <svg className="pt-mp" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Map: ${air ? 'flight' : 'ship'}${from ? ` from ${from}` : ''}${to ? ` to ${to}` : ''}`}>
      <rect width={W} height={H} className="pt-mp-sea" />
      {waves.map((w) => <path key={w} d={w} className="pt-mp-wave" />)}
      <path d={`M${W - 40},${H} C${W - 50},${H - 60} ${W - 20},${H - 120} ${W},${H - 150} L${W},${H} Z`} className="pt-mp-land" />
      <path d={`M${W - 40},${H} C${W - 50},${H - 60} ${W - 20},${H - 120} ${W},${H - 150}`} className="pt-mp-coast" />
      <path d={d} className="pt-mp-route" />
      <path d={d} className="pt-mp-done" pathLength="1" strokeDasharray={`${t} 1`} />
      <circle cx={L0} cy={Y} r="6" className="pt-mp-pin" />
      {from && <text x={fromX} y={Y + (m ? 44 : 30)} textAnchor="middle" className="pt-mp-s">{from}</text>}
      <circle cx={R} cy={Y} r="8" className="pt-mp-pin end" />
      {to && <text x={toEnd ? W - 8 : toX0} y={Y + (m ? 48 : 32)} textAnchor={toEnd ? 'end' : 'middle'} className="pt-mp-t">{to}</text>}
      <circle cx={bx} cy={by} r="24" className="pt-mp-halo" />
      <circle cx={bx} cy={by} r="15" className="pt-mp-veh" />
      <g transform={`translate(${bx},${by})`}><path d={air ? PLANE_ICON : SHIP_ICON} className="pt-mp-veh-fg" /></g>
      {tag && (
        <>
          <rect x={tx} y={by - 26 - 30 * k} width={tw} height={30 * k} rx="8" className="pt-mp-tag" />
          <text x={tx + tw / 2} y={by - 26 - 10 * k} textAnchor="middle" className="pt-mp-tag-t">{tag}</text>
        </>
      )}
    </svg>
  )
}

export default function SeaMap({ job, sea, found, vessel, air, layout }) {
  const pos = air ? null : shipPosition(sea, found)
  const fromName = air ? '' : shortPort(sea?.pol) || ''
  const toName = shortPort(sea?.pod) || shortPort(String(portByCode(job?.port_code)?.name || '').split(' / ').pop())
  const firstVessel = String(job?.vessel || '').split(' / ')[0].trim()
  const tag = air ? firstVessel || vessel || '' : (sea?.vessel_name || vessel || firstVessel || '')

  const sketch = (
    <div className="pt-map pt-map-svg">
      <SeaSketch from={fromName} to={toName} t={progressOf(sea, job)} tag={tag} air={!!air} layout={layout} />
    </div>
  )
  if (!pos) return sketch

  const v = voyage({ pos: pos.pos, route: sea?.route, track: sea?.track, heading: pos.heading })
  const shipAt = v?.pos || pos.pos
  const pol = v?.sailed?.length > 1 ? v.sailed[0] : has(sea?.route?.pol) ? sea.route.pol : null
  const pod = v?.ahead?.length > 1 ? v.ahead[v.ahead.length - 1] : has(sea?.route?.pod) ? sea.route.pod : null
  const drawKey = JSON.stringify([shipAt, pol, pod, v?.sailed?.length, v?.ahead?.length, tag, fromName, toName])

  const draw = (L, map, layer) => {
    if (v?.sailed?.length > 1) L.polyline(v.sailed, { className: 'pt-ml-sailed', color: '#1F4FAE', weight: 3, opacity: 1, lineCap: 'round', interactive: false }).addTo(layer)
    if (v?.ahead?.length > 1) L.polyline(v.ahead, { className: 'pt-ml-ahead', color: '#8B94A4', weight: 2, opacity: 1, dashArray: '2 8', lineCap: 'round', interactive: false }).addTo(layer)
    const marks = []
    if (pol) marks.push([L.marker(pol, { icon: pinIcon(L, { name: fromName }), interactive: false, keyboard: false }).addTo(layer), pol])
    if (pod) marks.push([L.marker(pod, { icon: pinIcon(L, { name: toName, end: true }), interactive: false, keyboard: false, zIndexOffset: 100 }).addTo(layer), pod])
    marks.push([L.marker(shipAt, { icon: vehicleIcon(L, { icon: SHIP_ICON, tag }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(layer), shipAt])
    const bounds = L.latLngBounds([...(v?.sailed || []), ...(v?.ahead || []), shipAt, ...(pol ? [pol] : []), ...(pod ? [pod] : [])])
    return () => {
      if (!alive(map)) return
      if (bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
        // room above for the ship's tag and below for the port names
        map.fitBounds(bounds, { paddingTopLeft: [30, 62], paddingBottomRight: [30, 34], maxZoom: 7, animate: false })
      } else {
        map.setView(shipAt, 5, { animate: false })
      }
      for (const [mk, at] of marks) keepInside(map, mk, at)
      declutter(map)
    }
  }

  return (
    <LiveMap layout={layout} drawKey={drawKey} draw={draw} fallback={sketch}
      label={`Map: ${tag || 'the ship'}${fromName ? ` from ${fromName}` : ''}${toName ? ` to ${toName}` : ''}`} />
  )
}
