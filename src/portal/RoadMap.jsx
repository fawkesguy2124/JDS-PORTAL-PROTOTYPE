import { LiveMap } from './SeaMap'
import './maps.css'
import { atCfsOf } from './model'

// Where the truck is, on the job page's WHERE card (approved design, Jose 31 Oct
// 2026). With saved FASTag toll crossings that have a position it is a real
// street map, quiet like the prototype: the road the truck took, each toll plaza
// as a small pin, every truck of the job at its last crossing with its number on
// a tag. Without positions it is the prototype's drawn road (CFS → client).
// Nothing here calls FASTag/ULIP: it draws the answers already saved when staff
// pressed "Where is it?" (or the job page's own checks).
//
// trucks: [{ no, points: truckPoints(job, j, results, no) }] (oldest crossing first)

const W = 700, H = 250
const P = [[70, 190], [190, 175], [290, 120], [420, 110], [520, 70], [630, 80]]
const TRUCK_ICON = 'M-8,-4 h9 v8 h-9 z M1,-1 h4 l3,3 v2 h-7'

// "MH46BM4521" → "MH46 BM 4521" (as written on the plate)
const plateText = (no) => {
  const s = String(no || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const m = /^([A-Z]{2}\d{1,2})([A-Z]{1,3})(\d{1,4})$/.exec(s)
  return m ? `${m[1]} ${m[2]} ${m[3]}` : s
}
// "KHALAPUR TOLL PLAZA" → "Khalapur"
const plazaName = (p) => {
  const s = String(p || '').replace(/\b(toll\s*plaza|fee\s*plaza|toll|plaza)\b/gi, ' ').replace(/\s+/g, ' ').trim()
  const short = s.split(' ').slice(0, 2).join(' ')
  return short === short.toUpperCase() ? short.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : short
}
const when = (v) => {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d) ? String(v) : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// a point `t` (0..1) of the way along the drawn road, and how far along point i is
const SEG = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1]))
const LEN = SEG.reduce((a, b) => a + b, 0)
const tAt = (i) => SEG.slice(0, i).reduce((a, b) => a + b, 0) / LEN
function along(t) {
  let r = t * LEN
  for (let i = 0; i < SEG.length; i++) {
    if (r <= SEG[i]) { const k = r / SEG[i]; return [P[i][0] + (P[i + 1][0] - P[i][0]) * k, P[i][1] + (P[i + 1][1] - P[i][1]) * k] }
    r -= SEG[i]
  }
  return P[P.length - 1]
}

// ── the drawn road (prototype roadMap) ──
function RoadSketch({ start, end, towns, t, plate, layout }) {
  const m = layout === 'm'
  const k = m ? 1.65 : 1
  const d = 'M' + P.map((p) => p.join(',')).join(' L')
  const pos = along(t)
  const tw = (plate.length * 10.2 + 28) * k
  const tx = Math.min(Math.max(pos[0] - tw / 2, 8), W - tw - 8)
  // the plate under the truck (prototype), above it when the truck is still near the bottom
  const ty = pos[1] + 26 + 30 * k <= H - 6 ? pos[1] + 26 : pos[1] - 26 - 30 * k
  const places = [[P[0], start, 0], ...towns.map((n, i) => [P[i === 0 ? 2 : 4], n, 0]), [P[5], end, 1]]
  return (
    <svg className="pt-mp" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map: truck from ${start} to ${end}`}>
      <rect width={W} height={H} className="pt-mp-land" />
      <path d="M0,215 C120,205 160,240 260,250 L0,250 Z" className="pt-mp-sea" />
      <path d={d} className="pt-mp-roadbg" />
      <path d={d} className="pt-mp-road" />
      <path d={d} className="pt-mp-roaddone" pathLength="1" strokeDasharray={`${t} 1`} />
      {places.map(([p, n, isEnd], i) => {
        // the start name stays inside the picture on a phone (its labels are bigger)
        const x = !isEnd && i === 0 ? Math.max(p[0], 8 + String(n).length * (m ? 6.8 : 4.2)) : p[0]
        return (
          <g key={`${i}-${n}`}>
            <circle cx={p[0]} cy={p[1]} r={isEnd ? 8 : 5} className={`pt-mp-pin${isEnd ? ' end' : ''}`} />
            <text x={isEnd && m ? p[0] + 8 : x} y={p[1] + (isEnd ? -18 : m ? 40 : 28)} textAnchor={isEnd && m ? 'end' : 'middle'}
              className={isEnd ? 'pt-mp-t' : 'pt-mp-s'}>{n}</text>
          </g>
        )
      })}
      <circle cx={pos[0]} cy={pos[1]} r="24" className="pt-mp-halo" />
      <circle cx={pos[0]} cy={pos[1]} r="15" className="pt-mp-veh" />
      <g transform={`translate(${pos[0]},${pos[1]})`}><path d={TRUCK_ICON} className="pt-mp-veh-fg" /></g>
      {plate && (
        <>
          <rect x={tx} y={ty} width={tw} height={30 * k} rx="8" className="pt-mp-tag" />
          <text x={tx + tw / 2} y={ty + 20 * k} textAnchor="middle" className="pt-mp-tag-m">{plate}</text>
        </>
      )}
    </svg>
  )
}

export default function RoadMap({ job, j, trucks = [], layout }) {
  const start = String(job?.cfs_name || '').trim().split(/\s+/).slice(0, 2).join(' ') || 'CFS'
  const end = String(job?.destination || '').split(',')[0].trim() || 'Client'
  const plate = plateText(trucks[0]?.no)
  const placed = trucks.map((t) => ({ ...t, route: (t.points || []).filter((p) => Array.isArray(p.pos)) }))
  const first = placed.find((t) => t.route.length)

  if (!first) {
    // the drawn road: the last two toll plazas passed (if any), the truck at the last one
    const names = []
    for (const p of trucks[0]?.points || []) {
      const n = plazaName(p.plaza)
      if (n && names[names.length - 1] !== n) names.push(n)
    }
    const towns = names.slice(-2)
    const atCfs = j ? atCfsOf(job, j) : Number(job?.stage) < 9
    const t = Number(job?.stage) >= 10 ? 1 : atCfs ? 0 : towns.length ? tAt(towns.length === 1 ? 2 : 4) : 0.15
    return (
      <div className="pt-map pt-map--road pt-map-svg">
        <RoadSketch start={start} end={end} towns={towns} t={t} plate={plate} layout={layout} />
      </div>
    )
  }

  const drawKey = JSON.stringify(placed.map((t) => [t.no, t.route.map((p) => [p.pos, p.at])]))
  const draw = (L, map, layer, kit) => {
    const route = first.route
    const line = route.map((p) => p.pos)
    if (line.length > 1) {
      L.polyline(line, { className: 'pt-ml-roadbg', color: '#D9DDE4', weight: 10, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(layer)
      L.polyline(line, { className: 'pt-ml-road', color: '#1F4FAE', weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(layer)
    }
    for (const p of route.slice(0, -1)) {
      L.circleMarker(p.pos, { className: 'pt-ml-plaza', radius: 5, weight: 2, color: '#4A5465', fillColor: '#fff', fillOpacity: 1 })
        .bindTooltip(`${esc(plazaName(p.plaza) || p.plaza)}${p.at ? ` · ${esc(when(p.at))}` : ''}`, { direction: 'top', offset: [0, -6] })
        .addTo(layer)
    }
    const marks = []
    const pts = [...line]
    placed.forEach((t, i) => {
      const last = t.route[t.route.length - 1]
      if (!last) return
      const mk = L.marker(last.pos, {
        icon: kit.vehicleIcon(L, { icon: TRUCK_ICON, tag: plateText(t.no), mono: true, below: true }),
        keyboard: false, zIndexOffset: t === first ? 1000 : 500 - i,
        title: `${plateText(t.no)}${last.plaza ? ` · ${plazaName(last.plaza) || last.plaza}` : ''}${last.at ? ` · ${when(last.at)}` : ''}`,
      }).addTo(layer)
      marks.push([mk, last.pos])
      pts.push(last.pos)
    })
    const bounds = L.latLngBounds(pts)
    return () => {
      if (bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
        // room below the trucks for their number tags
        map.fitBounds(bounds, { paddingTopLeft: [30, 30], paddingBottomRight: [30, 64], maxZoom: 12, animate: false })
      } else {
        map.setView(pts[0], 10, { animate: false })
      }
      for (const [mk, at] of marks) kit.keepInside(map, mk, at)
      kit.declutter(map)
    }
  }

  return (
    <LiveMap road layout={layout} drawKey={drawKey} draw={draw}
      fallback={<div className="pt-map pt-map--road pt-map-svg"><RoadSketch start={start} end={end} towns={[]} t={0.15} plate={plate} layout={layout} /></div>}
      label={`Map: truck ${plate || ''} from ${start} to ${end}`.replace(/\s+/g, ' ')} />
  )
}
