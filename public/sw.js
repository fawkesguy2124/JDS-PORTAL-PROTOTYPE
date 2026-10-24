// JDS Portal app worker (Jose, 24 Oct 2026: the portal as a desktop app).
// - Makes the portal installable (its own window, Start-menu icon).
// - Keeps only the app's own files (the hashed /assets/ files) for a fast start;
//   job data is never stored here: every screen reads it live.
// - Shows an "offline" page instead of a browser error when there is no internet.
// - Shows desktop notifications sent by the portal (OOC granted, free days, …).
const VERSION = 'jds-app-v1'
const SHELL = ['/offline.html', '/app/icon-192.png', '/app/badge-96.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase, maps etc. go straight to the network
  // pages: always the newest from the network; offline page when there is no internet
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')))
    return
  }
  // the app's own files: their names change with every release, so a kept copy is always right
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) c.put(req, res.clone())
      return res
    }))
  }
  // everything else (API calls, the dev server) is left alone
})

// ── desktop notifications ──
self.addEventListener('push', (e) => {
  let n = {}
  try { n = e.data ? e.data.json() : {} } catch { n = { body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(n.title || 'JDS Portal', {
    body: n.body || '',
    icon: '/app/icon-192.png',
    badge: '/app/badge-96.png',
    tag: n.tag || undefined, // the same alert again replaces the old one instead of stacking
    data: { url: n.url || '/admin?tab=today' },
  }))
})

// clicking a notification opens the job in the app (an open window is reused)
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = new URL(e.notification.data?.url || '/', self.location.origin).href
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin)
    if (win) { await win.focus(); return win.navigate(target).catch(() => null) }
    return self.clients.openWindow(target)
  })())
})
