import L from 'leaflet'
import '@maplibre/maplibre-gl-leaflet'

// The vector-map add-on finishes a zoom or resize one frame later; if the page closed the
// map in that frame it read the removed map ("getZoom of null" in the console, 1 Nov 2026).
// Same steps, skipped once the map is gone.
if (L.MaplibreGL && !L.MaplibreGL.prototype._steady) {
  const P = L.MaplibreGL.prototype
  P._steady = true
  P._transitionEnd = function () {
    L.Util.requestAnimFrame(function () {
      if (!this._map || !this._glMap) return
      const zoom = this._map.getZoom()
      const center = this._map.getCenter()
      const offset = this._map.latLngToContainerPoint(this._map.getBounds().getNorthWest())
      this._resizeContainer()
      L.DomUtil.setTransform(this._glMap._actualCanvas, offset, 1)
      this._glMap.once('moveend', L.Util.bind(function () { this._zoomEnd() }, this))
      this._glMap.jumpTo({ center, zoom: zoom - 1 })
    }, this)
  }
  const zoomEnd = P._zoomEnd
  P._zoomEnd = function () { if (this._map && this._glMap) zoomEnd.call(this) }
}

// Keeps a map's background drawn (Jose, 1 Nov 2026: "a lot of times the map becomes blank;
// it should never happen"). The cause, reproduced: the graphics card takes back the map's
// drawing surface (after the laptop sleeps, a driver hiccup, or many maps / tabs open at
// once) and the vector map (MapLibre inside Leaflet) stays white for good, with the pins
// still on it. So:
//   1. the vector map is rebuilt at once when its drawing surface is lost;
//   2. if it is lost again and again, cannot start, or its tiles do not arrive within a
//      few seconds of the page being on screen, the map switches to plain picture tiles
//      (a second provider), which need no graphics card;
//   3. the map is told whenever its box changes size and when the window comes back into
//      view, so it redraws to the right size.
// makeGL(m) adds the vector layer to the map (with its own styling) and returns it;
// raster() returns the picture-tile layer to fall back to.
const MAX_LOSSES = 2          // a third loss in one visit: picture tiles from then on
const FIRST_DRAW_MS = 12000   // vector tiles not drawn in this long (on screen): picture tiles

export function steadyBaseMap(m, { makeGL, raster }) {
  let alive = true
  let gl = null
  let fallen = false
  let losses = 0
  let timer = null

  const toRaster = () => {
    if (!alive || fallen) return
    fallen = true
    clearTimeout(timer)
    if (gl) { try { m.removeLayer(gl) } catch { /* already gone */ } gl = null }
    raster().addTo(m).bringToBack()
  }

  const start = () => {
    if (!alive || fallen) return
    try { gl = makeGL(m) } catch { toRaster(); return }
    let ml
    try { ml = gl.getMaplibreMap() } catch { toRaster(); return }
    if (!ml) { toRaster(); return }
    // 1. the drawing surface is lost: build the vector map again (or give up on it)
    ml.getCanvas()?.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      losses += 1
      setTimeout(() => {
        if (!alive || fallen) return
        if (losses > MAX_LOSSES) { toRaster(); return }
        try { m.removeLayer(gl) } catch { /* already gone */ }
        gl = null
        start()
      }, 250)
    }, { once: true })
    // 2. the tiles never arrive (server down, network): picture tiles. Time counts only
    // while the page is on screen (a hidden window draws nothing, by design).
    let drawn = false
    ml.once('load', () => { drawn = true; clearTimeout(timer) })
    const watch = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!alive || drawn || fallen) return
        if (document.hidden) { watch(); return }
        toRaster()
      }, FIRST_DRAW_MS)
    }
    watch()
  }
  start()

  // 3. a new size or the window back in view: redraw
  const redraw = () => {
    if (!alive || !m._mapPane) return
    m.invalidateSize()
    try { gl?.getMaplibreMap()?.triggerRepaint() } catch { /* not ready */ }
  }
  const sized = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => redraw()) : null
  sized?.observe(m.getContainer())
  const shown = () => { if (!document.hidden) redraw() }
  document.addEventListener('visibilitychange', shown)
  window.addEventListener('focus', shown)

  m.on('unload', () => {
    alive = false
    clearTimeout(timer)
    sized?.disconnect()
    document.removeEventListener('visibilitychange', shown)
    window.removeEventListener('focus', shown)
  })
  return { usingRaster: () => fallen }
}

// picture tiles with streets: OpenStreetMap (free, no key; only used when the vector map
// can't draw). CARTO's free tiles now answer "API key required" (checked 1 Nov 2026), so
// they are not used. Dark mode: the same tiles, inverted.
export const streetTiles = (dark) => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 19, className: dark ? 'ix-tiles-dark' : '', attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors' })
