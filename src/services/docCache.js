import { supabase } from '../supabase'

// The documents list, kept for the whole visit (Jose, 25 Oct 2026: the Documents page
// spun for a second each time). Loaded once in the background after sign-in; the
// page shows it at once and refreshes it quietly.
let cache = null
let inflight = null

export const cachedDocs = () => cache
export const keepDocs = (rows) => { cache = rows }

export function loadDocs() {
  if (!inflight) {
    inflight = supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(500)
      .then(({ data, error }) => {
        if (!error) cache = data ?? []
        return { data: error ? null : cache, error }
      })
      .finally(() => { inflight = null })
  }
  return inflight
}
