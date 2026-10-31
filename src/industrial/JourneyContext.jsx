import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { loadJourneyData, journeyFor, activeRows, isOldVoyage, onTheRoad, needATruck, containersInPlay, isDetentionRisk, activeJobsByClient } from '../services/journey'

// One shared load of everything the new screens show (saved data only, never
// ULIP), so moving between pages is instant. refresh() reloads it.
const Ctx = createContext(null)
const emptyFacts = { onRoad: [], needTruck: [], detention: [], containers: [], byClient: {} }

export function JourneyProvider({ children }) {
  const [data, setData] = useState(null)
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [key, setKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [d, p] = await Promise.all([loadJourneyData(), supabase.from('profiles').select('id, name')])
        if (cancelled) return
        const map = {}
        for (const row of p.data || []) map[row.id] = row.name
        setProfiles(map)
        setData(d)
        setError(d.error || null)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not load the latest data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [key])

  const refresh = useCallback(() => { setLoading(true); setKey((k) => k + 1) }, [])

  // Put one changed job into the loaded data without a full reload
  const patchJob = useCallback((job) => {
    if (!job?.id) return
    setData((d) => d && ({ ...d, jobs: d.jobs.some((j) => j.id === job.id) ? d.jobs.map((j) => (j.id === job.id ? job : j)) : [job, ...d.jobs] }))
  }, [])

  // Put one job's new ship tracking row into the loaded data (a row about an older
  // voyage is dropped, as at load: it is not this job's cargo)
  const patchSea = useCallback((row) => {
    if (!row?.job_id) return
    setData((d) => {
      if (!d) return d
      const seaByJob = { ...(d.seaByJob || {}) }
      if (isOldVoyage(row, d.jobs.find((j) => j.id === row.job_id))) delete seaByJob[row.job_id]
      else seaByJob[row.job_id] = row
      return { ...d, seaByJob }
    })
  }, [])

  const derived = useMemo(() => {
    if (!data) return { rows: [], byId: {}, active: [], facts: emptyFacts }
    const rows = data.jobs.map((job) => ({ job, j: journeyFor(job, data) }))
    const byId = Object.fromEntries(rows.map((r) => [r.job.id, r]))
    const active = activeRows(rows)
    // the shared counts, worked out once so every screen shows the same number
    // (Jose, 31 Oct 2026; see src/services/JOURNEY_FACTS.md)
    const facts = {
      onRoad: onTheRoad(active),
      needTruck: needATruck(active),
      detention: active.filter((r) => isDetentionRisk(r.j)),
      containers: containersInPlay(active, data),
      byClient: activeJobsByClient(rows),
    }
    return { rows, byId, active, facts }
  }, [data])

  const value = useMemo(() => ({
    data, profiles, loading, error, refresh, patchJob, patchSea,
    rows: derived.rows, byId: derived.byId,
    active: derived.active,
    facts: derived.facts,
  }), [data, profiles, loading, error, refresh, patchJob, patchSea, derived])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// (the hooks live beside the provider on purpose: every page imports them from here)
// eslint-disable-next-line react-refresh/only-export-components
export const useJourney = () => useContext(Ctx)

// Opening a page reloads the saved data (database only, never ULIP), so every
// tab shows the latest. A load from the last 20 seconds counts as fresh, so
// starting the portal doesn't load twice. Returns true once the data on screen
// is from this opening.
const FRESH_MS = 20_000
// eslint-disable-next-line react-refresh/only-export-components
export function useFreshOnOpen() {
  const { data, refresh } = useContext(Ctx)
  const [openedAt] = useState(() => Date.now())
  const [since] = useState(() => (data && Date.now() - new Date(data.loadedAt).getTime() < FRESH_MS ? new Date(data.loadedAt).getTime() : openedAt))
  useEffect(() => {
    if (since === openedAt) refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return !!data && new Date(data.loadedAt).getTime() >= since
}
