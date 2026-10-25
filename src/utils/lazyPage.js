import { lazy } from 'react'

// Pages load when first opened, so the portal starts faster (Jose, 25 Oct 2026).
// After a new version goes live an open tab may ask for a page file that no longer
// exists: reload once to pick up the new version instead of showing a blank page.
export default function lazyPage(load) {
  return lazy(() => load().catch((err) => {
    let reloaded = false
    try { reloaded = sessionStorage.getItem('jds_chunk_reload') === '1'; sessionStorage.setItem('jds_chunk_reload', '1') } catch { /* private mode */ }
    if (!reloaded) { window.location.reload(); return new Promise(() => {}) }
    throw err
  }).then((m) => {
    try { sessionStorage.removeItem('jds_chunk_reload') } catch { /* private mode */ }
    return m
  }))
}
