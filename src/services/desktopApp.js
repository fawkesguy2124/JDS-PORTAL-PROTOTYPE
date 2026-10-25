// The portal as a desktop app (Jose, 24 Oct 2026): installed from Chrome / Edge,
// it opens in its own window with the JDS icon in the Start menu and taskbar.
// The same code runs in the browser and in the app; the app updates itself on
// every publish (pages are always fetched fresh, see public/sw.js).
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

let installEvent = null // Chrome / Edge's "install this app" offer, kept until used
const listeners = new Set()
const tell = () => listeners.forEach((fn) => fn())

export function startAppWorker() {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; tell() })
  window.addEventListener('appinstalled', () => { installEvent = null; tell() })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('[app] worker not started:', err?.message))
  })
}

// Running as the installed app (its own window), not in a browser tab
export const runningAsApp = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

// { canInstall, asApp, install } for the "Install app" button
export function useInstallApp() {
  const [, redraw] = useState(0)
  useEffect(() => {
    const fn = () => redraw((n) => n + 1)
    listeners.add(fn)
    const mq = window.matchMedia?.('(display-mode: standalone)')
    mq?.addEventListener?.('change', fn)
    return () => { listeners.delete(fn); mq?.removeEventListener?.('change', fn) }
  }, [])
  return {
    canInstall: !!installEvent && !runningAsApp(),
    asApp: runningAsApp(),
    install: async () => {
      if (!installEvent) return false
      installEvent.prompt()
      const { outcome } = await installEvent.userChoice
      installEvent = null
      tell()
      return outcome === 'accepted'
    },
  }
}

// ── Desktop notifications ──
// Sent by the alerts run every 15 minutes (the same alerts as WhatsApp, so they
// work even when WhatsApp is down). Each computer switches them on for itself and
// picks which kinds it wants. The public key below is public by design; its private
// half is a Supabase secret (VAPID_PRIVATE_KEY).
const PUSH_PUBLIC_KEY = 'BOwfHv5s-lBibUcMB5m30PrsrBJ1A0rSNHOzSkybr8Vq_lcCY8_RTLR3srCKqqyzAaILMmTmL0ZsVBgtCH-0HDA'
export const ALERT_KINDS = [
  { id: 'ship_arrived', label: 'Ship arrived at the port' },
  { id: 'ooc', label: 'OOC granted' },
  { id: 'free_days', label: 'Free days running out' },
  { id: 'be_not_filed', label: 'Ship in, BE not filed' },
  { id: 'container', label: 'Container moves (port, CFS, gate…)' },
]
export const ALL_KINDS = Object.fromEntries(ALERT_KINDS.map((k) => [k.id, true]))

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const keyBytes = (b64) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}
const device = () => {
  const ua = navigator.userAgent
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : 'Computer'
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser'
  return `${os} · ${br}${runningAsApp() ? ' (app)' : ''}`
}

// This computer's state: { supported, permission, on, kinds }
export async function pushState() {
  if (!pushSupported()) return { supported: false, permission: 'unsupported', on: false, kinds: ALL_KINDS }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return { supported: true, permission: Notification.permission, on: false, kinds: ALL_KINDS }
  const { data } = await supabase.from('push_subscriptions').select('kinds').eq('endpoint', sub.endpoint).maybeSingle()
  return { supported: true, permission: Notification.permission, on: !!data, kinds: { ...ALL_KINDS, ...(data?.kinds || {}) } }
}

// Switch on for this computer (asks Windows / the browser for permission first)
export async function enablePush(profile, kinds = ALL_KINDS) {
  if (!pushSupported()) throw new Error('This browser cannot show desktop notifications.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied'
    ? 'Notifications are blocked for this site. Click the lock icon left of the address, allow Notifications, then try again.'
    : 'Notifications were not allowed.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_PUBLIC_KEY) })
  const j = sub.toJSON()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in again.')
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: j.endpoint, user_id: user.id, user_name: profile?.name || null,
    p256dh: j.keys.p256dh, auth: j.keys.auth, kinds, device: device(), failures: 0,
  })
  if (error) throw new Error(error.message)
  // a first one at once, so the person sees what they look like
  await reg.showNotification('JDS Portal', { body: 'Desktop alerts are on for this computer.', icon: '/app/icon-192.png', badge: '/app/badge-96.png', tag: 'jds-welcome' })
}

export async function setPushKinds(kinds) {
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
  if (!sub) return
  const { error } = await supabase.from('push_subscriptions').update({ kinds }).eq('endpoint', sub.endpoint)
  if (error) throw new Error(error.message)
}

export async function disablePush() {
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe().catch(() => {})
}
