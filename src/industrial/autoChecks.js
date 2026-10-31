import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { runUlipCheck } from '../services/ulip/ulipClient'

// Automatic checks when someone OPENS a page (BE & OOC, Trucks), so nobody has
// to press "Check" for every job. Kept human-like on purpose, so ULIP never
// sees bot traffic (Jose's account must not be flagged):
// - only when a person opens the page: no timers, no background schedule
// - only what still needs an answer (OOC not granted yet, truck on the road)
// - each item at most once every COOLDOWN_MIN, counted from the last check
//   saved in the database, so the whole team shares it (Kiran opening the page
//   10 minutes after Jose asks ULIP nothing)
// - one check at a time, a few seconds apart, at most MAX_PER_OPEN per opening
// - stops when the person leaves the page
export const COOLDOWN_MIN = 30
const GAP_MS = 3000
const MAX_PER_OPEN = 8

const minutesSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 60_000 : Infinity)
export const isDue = (...isoTimes) => Math.min(...isoTimes.map(minutesSince)) >= COOLDOWN_MIN

// One automatic customs check (ICEGATE OOC only; the port check runs only when a person
// presses Check customs status) for a job, through the customs-status function
export async function checkCustoms(jobId) {
  const { data, error } = await supabase.functions.invoke('customs-status', { body: { jobId, auto: true } })
  return { ok: !error && !!data?.success, oocDate: data?.data?.ooc_date || null }
}

// One truck check (FASTag toll crossings or VAHAN papers) through the ulip function
export async function checkTruck(api, truckNo, jobId) {
  const res = await runUlipCheck({ api, params: { vehiclenumber: truckNo }, jobId })
  return { ok: res.ok, row: res.data }
}

// items: [{ key, label, run: async () => {} }] — worked through once per page
// opening (the list is read when the page has its data). onDone runs after the
// last one so the page can reload the saved answers.
export function useAutoChecks(items, ready, onDone) {
  const [state, setState] = useState({ running: false, done: 0, total: 0, label: '' })
  const started = useRef(false)
  const latest = useRef({ items, onDone })
  latest.current = { items, onDone }

  useEffect(() => {
    if (!ready || started.current) return
    started.current = true
    let stopped = false
    ;(async () => {
      const list = latest.current.items.slice(0, MAX_PER_OPEN)
      if (!list.length) return
      setState({ running: true, done: 0, total: list.length, label: list[0].label })
      for (let i = 0; i < list.length && !stopped; i++) {
        setState({ running: true, done: i, total: list.length, label: list[i].label })
        try { await list[i].run() } catch { /* one failure doesn't stop the rest */ }
        if (i < list.length - 1 && !stopped) await new Promise((r) => setTimeout(r, GAP_MS))
      }
      if (stopped) return
      setState({ running: false, done: list.length, total: list.length, label: '' })
      latest.current.onDone?.()
    })()
    // (React may start a page twice while developing: the second start takes over)
    return () => { stopped = true; started.current = false }
  }, [ready])

  return state
}
