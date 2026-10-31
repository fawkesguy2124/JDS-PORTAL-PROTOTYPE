// (the health hook and helpers below live with the status line they belong to)
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { Icon, fmtTime } from './ui'

// One line under a page title saying what the page is updating by itself
// (see autoChecks.js), so nobody wonders whether to press a button.
export default function AutoStatus({ auto, fresh, what, idle }) {
  let icon = 'refresh'
  let text = idle
  let tone = 'var(--muted)'
  if (!fresh) text = 'Loading the latest from the portal…'
  else if (auto.running) {
    icon = 'loader-2'
    tone = 'var(--navy)'
    text = `Checking ${what} for ${auto.label} (${auto.done + 1} of ${auto.total})… government systems can take up to a minute.`
  } else if (auto.total > 0) {
    icon = 'circle-check'
    tone = 'var(--green)'
    text = `Updated just now: ${what} checked for ${auto.total} ${auto.total === 1 ? 'item' : 'items'}.`
  }
  return (
    <div className="ix-autostatus" style={{ color: tone }} role="status" aria-live="polite">
      <Icon name={icon} style={auto.running ? { animation: 'ixSpin 1s linear infinite', display: 'inline-block' } : undefined} />
      <span>{text}</span>
    </div>
  )
}

// ── background services, for the sidebar footer and its status dots ──
// Reads supabase.rpc('system_health') (the same call as the System health page),
// at most once a minute and only while the window is visible. Only reads: it never
// starts a government check (Jose, 31 Oct 2026).
const MIN = 60000
export function useSystemHealth() {
  const [h, setH] = useState(null)
  useEffect(() => {
    let off = false
    let last = 0
    const load = () => {
      if (document.hidden || Date.now() - last < MIN) return
      last = Date.now()
      supabase.rpc('system_health').then(({ data, error }) => {
        if (!off && !error && data) setH(data)
      }, () => { /* offline: keep the last answer */ })
    }
    load()
    const t = setInterval(load, MIN)
    const onShow = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onShow)
    return () => { off = true; clearInterval(t); document.removeEventListener('visibilitychange', onShow) }
  }, [])
  return h
}

// green / amber / red per service, with the same rules as HealthPage.jsx
export function healthTones(h) {
  if (!h) return null
  const now = new Date(h.now || Date.now()).getTime()
  const age = (iso) => (iso ? (now - new Date(iso).getTime()) / MIN : Infinity)
  const cronOf = (name) => (h.cron || []).find((c) => c.name === name)
  const cronBad = (c) => c && c.active && c.last_status && c.last_status !== 'succeeded'
  const a = h.auto || {}
  const paused = !!(a.paused_until && new Date(a.paused_until).getTime() > now)
  const auto = paused || cronBad(cronOf('auto-check')) ? 'red'
    : a.watching && age(a.last_run) > 90 ? 'amber' : a.failing ? 'amber' : 'green'
  const s = h.ships || {}
  const ships = cronBad(cronOf('sea-track')) ? 'red'
    : s.tracked && age(s.last_update) > 90 ? 'amber' : s.refresh_errors || s.errors ? 'amber' : 'green'
  const c = h.containers || {}
  const boxes = cronBad(cronOf('refresh-containers-every-30-min')) ? 'red' : c.tracked && age(c.last_refresh) > 90 ? 'amber' : 'green'
  const w = h.whatsapp_24h || {}
  const whatsapp = cronBad(cronOf('wa-bot-alerts')) ? 'red' : w.failed ? 'amber' : age(h.last_summary) > 26 * 60 ? 'amber' : 'green'
  const ulip = Object.values(h.ulip_24h || {})
  const gov = ulip.some((u) => u.failed && !u.ok) ? 'red' : ulip.some((u) => u.failed) ? 'amber' : 'green'
  const all = [auto, ships, boxes, whatsapp, gov]
  const overall = all.includes('red') ? 'red' : all.includes('amber') ? 'amber' : 'green'
  return { auto, ships, boxes, whatsapp, gov, overall, paused }
}

// 'Last check 19:40 · next 20:40' (IST) for the automatic checks
export function autoCheckLine(h) {
  const a = h?.auto
  if (!a) return null
  const now = new Date(h.now || Date.now()).getTime()
  if (a.paused_until && new Date(a.paused_until).getTime() > now) return `Checks paused until ${fmtTime(a.paused_until)}`
  if (!a.last_run) return 'Automatic checks: not run yet'
  const next = a.next_due ? (new Date(a.next_due).getTime() <= now ? 'next due now' : `next ${fmtTime(a.next_due)}`) : null
  return [`Last check ${fmtTime(a.last_run)}`, next].filter(Boolean).join(' · ')
}
