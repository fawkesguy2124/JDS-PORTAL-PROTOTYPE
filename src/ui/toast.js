// A tiny toast store: toast('Saved'), toast.success('Job created'),
// toast.error('Could not save'), toast('Undo?', { action: { label, onClick } }).
// <ToastProvider> (src/ui/Toast.jsx) renders them; mounted once in main.jsx.
// For screens that pass `showToast(message, type)` around, useToast().showToast
// has that exact signature.
import { useSyncExternalStore } from 'react'

let items = []
let seq = 0
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())

export function dismissToast(id) {
  const t = items.find((x) => x.id === id)
  if (!t || t.leaving) return
  items = items.map((x) => (x.id === id ? { ...x, leaving: true } : x))
  emit()
  setTimeout(() => { items = items.filter((x) => x.id !== id); emit() }, 180)
}

/** toast(message, { tone: 'success'|'error'|'warning'|'info'|'neutral', duration: ms, action: { label, onClick } }) → id */
export function toast(message, opts = {}) {
  const tone = opts.tone === 'danger' ? 'error' : opts.tone || 'neutral'
  const id = ++seq
  items = [...items.slice(-3), { id, message, tone, action: opts.action, leaving: false }]
  emit()
  const ms = opts.duration ?? (tone === 'error' ? 6000 : 3200)
  if (ms > 0) setTimeout(() => dismissToast(id), ms)
  return id
}
toast.success = (m, o) => toast(m, { ...o, tone: 'success' })
toast.error = (m, o) => toast(m, { ...o, tone: 'error' })
toast.info = (m, o) => toast(m, { ...o, tone: 'info' })
toast.warning = (m, o) => toast(m, { ...o, tone: 'warning' })
toast.dismiss = dismissToast

/** Same signature the older screens use: showToast(message, 'success' | 'error'). */
export const showToast = (message, type = 'success') => toast(message, { tone: type })

const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb) }
const getItems = () => items
export const useToasts = () => useSyncExternalStore(subscribe, getItems, getItems)

export function useToast() {
  return { toast, showToast, dismiss: dismissToast }
}
