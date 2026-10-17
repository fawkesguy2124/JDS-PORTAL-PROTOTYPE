import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { loadJourneyData, journeyFor, isDelivered } from '../services/journey'

// One shared load of everything the new screens show (saved data only, never
// ULIP), so moving between pages is instant. refresh() reloads it.
const Ctx = createContext(null)

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

  const derived = useMemo(() => {
    if (!data) return { rows: [], byId: {} }
    const rows = data.jobs.map((job) => ({ job, j: journeyFor(job, data) }))
    const byId = Object.fromEntries(rows.map((r) => [r.job.id, r]))
    return { rows, byId }
  }, [data])

  const value = useMemo(() => ({
    data, profiles, loading, error, refresh, patchJob,
    rows: derived.rows, byId: derived.byId,
    active: derived.rows.filter((r) => !isDelivered(r.job) && r.j.phase !== 'delivered'),
  }), [data, profiles, loading, error, refresh, patchJob, derived])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useJourney = () => useContext(Ctx)
