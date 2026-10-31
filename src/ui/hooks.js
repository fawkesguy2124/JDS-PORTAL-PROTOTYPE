import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react'

// ── media queries ─────────────────────────────────────────────────────────────
const canMatch = typeof window !== 'undefined' && typeof window.matchMedia === 'function'

/** True while `query` matches, e.g. useMediaQuery('(min-width: 1024px)'). */
export function useMediaQuery(query) {
  const subscribe = useCallback((cb) => {
    if (!canMatch) return () => {}
    const mql = window.matchMedia(query)
    mql.addEventListener('change', cb)
    return () => mql.removeEventListener('change', cb)
  }, [query])
  return useSyncExternalStore(subscribe, () => (canMatch ? window.matchMedia(query).matches : false), () => false)
}

// breakpoints (docs/DESIGN.md): phone < 640, tablet 640–1023, desktop ≥ 1024, wide ≥ 1440
export const PHONE_QUERY = '(max-width: 639.98px)'
export const TABLET_QUERY = '(min-width: 640px) and (max-width: 1023.98px)'
export const DESKTOP_QUERY = '(min-width: 1024px)'
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

export const useIsPhone = () => useMediaQuery(PHONE_QUERY)
export const useIsTablet = () => useMediaQuery(TABLET_QUERY)
export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY)
export const useIsTouch = () => useMediaQuery(TOUCH_QUERY)

// ── theme ─────────────────────────────────────────────────────────────────────
// light / dark / system, saved in localStorage 'jds_theme'. Only Shell pages are
// themed: while a component uses useTheme() (the Shell does), the resolved theme
// is written to <html data-theme> and <meta name="theme-color">. Every other
// screen (login, employee, field) stays light, so not-yet-migrated pages with
// hard-coded light colours are safe.
//
// index.html writes data-theme before React loads on Shell routes (/admin), so a
// saved dark theme never flashes light while the app starts. The attribute is
// removed only when the last Shell unmounts (logout) or when the app lands on a
// route without a Shell (releaseTheme, called by App on every route change).
//
// useForcedTheme('light') pins a page to light while it is mounted (the Shell
// does this for pages that are not migrated yet: Shell `lightOnly`).
const KEY = 'jds_theme'
const THEMES = ['light', 'dark', 'system']
const META = { light: '#FFFFFF', dark: '#10151F' }
const listeners = new Set()
let users = 0
let forced = null

// Dark mode is opt-in while some pages are still legacy (Shell lightOnly): with
// nothing saved the theme is 'light', not 'system', so nobody gets dark mode (and
// a light/dark switch between migrated and legacy pages) without choosing it.
// 'system' stays available as an explicit choice. When the last `legacy: true`
// is gone from AdminDashboard NAV_SECTIONS, change DEFAULT to 'system' here and
// in the index.html theme script.
const DEFAULT = 'light'
const read = () => {
  try { const v = localStorage.getItem(KEY); return THEMES.includes(v) ? v : DEFAULT } catch { return DEFAULT }
}
let current = typeof window !== 'undefined' ? read() : DEFAULT
const systemDark = () => canMatch && window.matchMedia('(prefers-color-scheme: dark)').matches
const resolve = (t) => (t === 'system' ? (systemDark() ? 'dark' : 'light') : t)
const effective = () => forced || resolve(current)

function paint(r) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (r) { root.dataset.theme = r; root.style.colorScheme = r } else { delete root.dataset.theme; root.style.colorScheme = '' }
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', META[r || 'light']))
}
const apply = () => { if (users > 0) paint(effective()) }
const emit = () => { apply(); listeners.forEach((l) => l()) }

/** Drops <html data-theme> when no Shell is mounted (a route without one). */
export function releaseTheme() { if (users === 0) paint(null) }

if (canMatch) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (current === 'system') emit() })
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) { current = read(); emit() } }) // other tabs
}

export function setTheme(t) {
  current = THEMES.includes(t) ? t : DEFAULT
  try { localStorage.setItem(KEY, current) } catch { /* private mode: this tab only */ }
  emit()
}

const subscribeTheme = (cb) => { listeners.add(cb); return () => listeners.delete(cb) }
const snapshot = () => `${current}|${effective()}|${forced ? 1 : 0}`

/** { theme: 'light'|'dark'|'system' (saved), resolved: 'light'|'dark' (shown), forced, setTheme(t), toggle() } */
export function useTheme() {
  const snap = useSyncExternalStore(subscribeTheme, snapshot, () => `${DEFAULT}|light|0`)
  const [theme, resolved, f] = snap.split('|')
  // layout effect: the attribute is right before the first paint
  useLayoutEffect(() => {
    users += 1
    apply()
    return () => { users -= 1; if (users === 0) paint(null) }
  }, [])
  const toggle = useCallback(() => setTheme(resolve(current) === 'dark' ? 'light' : 'dark'), [])
  return { theme, resolved, forced: f === '1', setTheme, toggle }
}

/** While mounted with a value ('light' | 'dark'), shows that theme whatever is saved. Call after useTheme(). */
export function useForcedTheme(t) {
  useLayoutEffect(() => {
    if (!t) return undefined
    forced = t
    emit()
    return () => { forced = null; emit() }
  }, [t])
}

// ── overlays: scroll lock + Esc stack + focus trap (Modal, Drawer, palette) ──
let locks = 0
export function lockScroll() {
  locks += 1
  if (locks === 1) document.documentElement.classList.add('ix-scroll-locked')
  return () => {
    locks = Math.max(0, locks - 1)
    if (locks === 0) document.documentElement.classList.remove('ix-scroll-locked')
  }
}

const layers = []
/** Registers an overlay; returns { isTop, release }. Only the top one handles Esc. */
export function pushLayer(id) {
  layers.push(id)
  return { isTop: () => layers[layers.length - 1] === id, release: () => { const i = layers.lastIndexOf(id); if (i >= 0) layers.splice(i, 1) } }
}

const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
export const focusables = (el) => (el ? [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement) : [])

/** Keeps Tab / Shift+Tab inside `el`. Call from a keydown handler. */
export function trapTab(e, el) {
  if (e.key !== 'Tab' || !el) return
  const list = focusables(el)
  if (!list.length) { e.preventDefault(); el.focus(); return }
  const first = list[0], last = list[list.length - 1]
  if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}
