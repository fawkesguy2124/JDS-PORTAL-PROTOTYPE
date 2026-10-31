// Icons as SVG markup strings, for the HTML that Leaflet map markers are built
// from (L.divIcon). Same Tabler outline paths as <Icon>; add more here when a
// marker needs one.
const NODES = {
  truck: ['M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5'],
  transfer: ['M20 10h-16l5.5 -6', 'M4 14h16l-5.5 6'],
  anchor: ['M12 9v12m-8 -8a8 8 0 0 0 16 0m1 0h-2m-14 0h-2', 'M12 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0'],
}

export function iconSvg(name, size = '1em', stroke = 2) {
  const paths = (NODES[name] || []).map((d) => `<path d="${d}"/>`).join('')
  return `<svg class="ix-icon" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
}
