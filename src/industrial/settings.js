// Preferences for this computer (Settings page, Jose 31 Oct 2026).
// One JSON value in localStorage ("jds_prefs_v1"); every part of the portal reads
// it through here. getPrefs() works anywhere (time formats, the bell); usePrefs()
// re-renders a component when a preference changes, in this tab or another one.
// applyPrefs() puts the look on <html> (data-theme, data-density, data-text,
// data-motion); industrial.css does the rest. index.html sets data-theme before
// the app loads, so a dark portal never flashes white.
import { useSyncExternalStore } from 'react'

export const PREFS_KEY = 'jds_prefs_v1'
const EVENT = 'jds-prefs'

// The pages the portal can open on after sign-in
export const LANDING_PAGES = [
  { value: 'today', label: 'Today' },
  { value: 'jobs', label: 'All jobs' },
  { value: 'containers', label: 'Containers' },
  { value: 'vessels', label: 'Vessels' },
  { value: 'customs', label: 'BE & OOC' },
  { value: 'trucks', label: 'Trucks' },
]

// The kinds of update the bell shows; each one can be hidden (bellMuted).
// Same grouping as the alert links (supabase/functions/_shared/portal/alertLinks.js).
export const BELL_KINDS = [
  { id: 'container', label: 'Container moves and free days' },
  { id: 'customs', label: 'Customs: BE stages and OOC' },
  { id: 'arrival', label: 'Ship arrivals and ETA changes' },
  { id: 'truck', label: 'Trucks' },
  { id: 'document', label: 'Documents' },
  { id: 'job', label: 'Jobs and stages' },
  { id: 'system', label: 'System notices' },
]
// an activity type ('ooc_granted', 'container_update' …) → its BELL_KINDS id
export function bellKindOf(type) {
  const t = String(type || '')
  if (/^(ooc|ooc_granted|customs|be_stage|be_status_check|be_not_filed|be_filed|sb_filed|air_igm)$/.test(t) || t.includes('ulip')) return 'customs'
  if (/^(ship_arrived|ship_due|ship_unloaded|eta_changed)$/.test(t)) return 'arrival'
  if (/^truck/.test(t)) return 'truck'
  if (/container|^(free_days|detention_alert)$/.test(t)) return 'container'
  if (/upload|document/.test(t)) return 'document'
  if (/job|stage/.test(t)) return 'job'
  return 'system'
}

// light by default: Jose's portal has always been light; dark is an option (31 Oct 2026)
export const DEFAULT_PREFS = Object.freeze({
  theme: 'light',
  density: 'comfortable',
  text: 'md',
  motion: 'full',
  navCollapsed: false,
  landing: 'today',
  timeFormat: '24h',
  todayType: 'all',
  todayScope: 'everyone',
  bellMuted: [],
  bellSound: false,
})

const ALLOWED = {
  theme: ['light', 'dark', 'system'],
  density: ['comfortable', 'compact'],
  text: ['sm', 'md', 'lg'],
  motion: ['full', 'reduce'],
  landing: LANDING_PAGES.map((p) => p.value),
  timeFormat: ['24h', '12h'],
  todayType: ['all', 'import', 'export'],
  todayScope: ['everyone', 'mine'],
}

// keep only known keys with allowed values (an old or hand-edited value falls back)
function clean(raw) {
  const out = { ...DEFAULT_PREFS }
  if (!raw || typeof raw !== 'object') return out
  for (const [k, list] of Object.entries(ALLOWED)) if (list.includes(raw[k])) out[k] = raw[k]
  if (typeof raw.navCollapsed === 'boolean') out.navCollapsed = raw.navCollapsed
  if (typeof raw.bellSound === 'boolean') out.bellSound = raw.bellSound
  if (Array.isArray(raw.bellMuted)) out.bellMuted = raw.bellMuted.filter((id) => BELL_KINDS.some((b) => b.id === id))
  return out
}

// The choices this computer made before Settings existed, moved over once
const OLD_KEYS = ['ix_compact', 'ix_nav_collapsed', 'ix_today_kind', 'ix_today_who']
function migrate() {
  const old = {}
  try {
    if (localStorage.getItem('ix_compact') === '1') old.density = 'compact'
    if (localStorage.getItem('ix_nav_collapsed') === '1') old.navCollapsed = true
    const kind = localStorage.getItem('ix_today_kind')
    if (kind) old.todayType = kind
    if (localStorage.getItem('ix_today_who') === 'mine') old.todayScope = 'mine'
  } catch { /* private mode */ }
  const prefs = clean(old)
  write(prefs)
  try { OLD_KEYS.forEach((k) => localStorage.removeItem(k)) } catch { /* private mode */ }
  return prefs
}

function write(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* private mode: kept for this visit only */ }
}

let cache = null
function read() {
  let text = null
  try { text = localStorage.getItem(PREFS_KEY) } catch { /* private mode */ }
  if (text === null) return migrate()
  try { return clean(JSON.parse(text)) } catch { return { ...DEFAULT_PREFS } }
}

// The current preferences (a frozen object; the same object until something changes)
export function getPrefs() {
  if (!cache) cache = Object.freeze(read())
  return cache
}

function publish(next) {
  cache = Object.freeze(clean(next))
  write(cache)
  window.dispatchEvent(new Event(EVENT))
}

export function setPref(key, value) {
  if (!(key in DEFAULT_PREFS)) return
  const cur = getPrefs()
  if (cur[key] === value) return
  publish({ ...cur, [key]: value })
}

export function resetPrefs() {
  publish({ ...DEFAULT_PREFS })
}

// updates from this tab (EVENT) and from other tabs / app windows (storage)
function subscribe(fn) {
  const onStorage = (e) => {
    if (e.key !== null && e.key !== PREFS_KEY) return
    cache = null
    fn()
  }
  window.addEventListener(EVENT, fn)
  window.addEventListener('storage', onStorage)
  return () => { window.removeEventListener(EVENT, fn); window.removeEventListener('storage', onStorage) }
}

// [prefs, setPref] for a component; it re-renders when any preference changes
export function usePrefs() {
  const prefs = useSyncExternalStore(subscribe, getPrefs, getPrefs)
  return [prefs, setPref]
}

// ── the look, on <html> ──
const darkQuery = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)
export const resolveTheme = (theme) => (theme === 'system' ? (darkQuery()?.matches ? 'dark' : 'light') : theme === 'dark' ? 'dark' : 'light')

let watchingSystem = false
export function applyPrefs(prefs = getPrefs()) {
  const root = document.documentElement
  const theme = resolveTheme(prefs.theme)
  root.setAttribute('data-theme', theme)
  root.setAttribute('data-density', prefs.density)
  root.setAttribute('data-text', prefs.text)
  root.setAttribute('data-motion', prefs.motion)
  root.style.colorScheme = theme
  // the browser / app window's title bar colour follows the theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0e2650' : '#1a4fa0')
  // "Match my computer": follow Windows when it switches between light and dark
  if (!watchingSystem) {
    const mq = darkQuery()
    if (mq?.addEventListener) {
      watchingSystem = true
      mq.addEventListener('change', () => { if (getPrefs().theme === 'system') applyPrefs(getPrefs()) })
    }
  }
}

// ── a short beep for new updates (no sound file) ──
let audio = null
export function beep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    audio = audio || new AC()
    if (audio.state === 'suspended') audio.resume().catch(() => {})
    const t = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, t)
    osc.frequency.setValueAtTime(1175, t + 0.09)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)
    osc.connect(gain).connect(audio.destination)
    osc.start(t)
    osc.stop(t + 0.28)
  } catch { /* no sound on this computer */ }
}

// ── "Clear saved data on this computer" ──
// Removes the portal's own saved choices and caches (keys starting ix_ or jds_),
// keeps the sign-in (jds-portal-auth and the sign-in library's keys), which bell
// updates were already read, and when the containers were last refreshed (so
// clearing does not set off a refresh of every container).
const KEEP = [/^jds-portal-auth/, /^sb-/, /^jds_notif_last_seen_/, /^jds_last_login_refresh_/]
export function clearSavedData() {
  let n = 0
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter(Boolean)
      keys.filter((k) => /^(ix_|jds_)/.test(k) && !KEEP.some((re) => re.test(k))).forEach((k) => { store.removeItem(k); n += 1 })
    } catch { /* private mode */ }
  }
  cache = null
  window.dispatchEvent(new Event(EVENT))
  return n
}
