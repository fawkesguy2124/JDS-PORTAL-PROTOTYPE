import { supabase } from '../supabase'
import { buildJourneyData } from '../../supabase/functions/_shared/portal/journeyCore.js'

// The rules live in journeyCore.js (shared with the WhatsApp bot)
export * from '../../supabase/functions/_shared/portal/journeyCore.js'

// ─────────────────────────────────────────────────────────────────────────────
// Where is each job in its journey, and what needs attention?
//
// Everything here reads SAVED data only (jobs, customs_status, ulip_results,
// container_tracking). It never calls ULIP. Pages call loadJourneyData() once,
// then journeyFor(job, data) for each job.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000
const PAGE = 1000

// Reads every row of a query in pages of 1000 (Supabase's default limit)
async function readAll(build) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) return { data: rows, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) return { data: rows, error: null }
  }
}

// Loads everything the journey needs for all jobs.
// Returns { jobs, customsByJob, resultsByJob, containersByNo, loadedAt, error }.
// error is a plain message (or null); pages must show it instead of "all clear".
export async function loadJourneyData() {
  const since = new Date(Date.now() - 180 * DAY).toISOString()
  const [jobsRes, csRes, resultsRes, ctRes] = await Promise.all([
    readAll(() => supabase.from('jobs').select('*').order('job_no', { ascending: false })),
    readAll(() => supabase.from('customs_status').select('*').order('job_id')),
    readAll(() => supabase.from('ulip_results')
      .select('api, job_id, found, summary, parsed, params, checked_at, last_error, last_error_at')
      .not('job_id', 'is', null)
      .gte('checked_at', since)
      .order('checked_at', { ascending: false, nullsFirst: false })),
    readAll(() => supabase.from('container_tracking')
      .select('container_no, job_id, job_no, status, status_text, current_location, free_days, port_in, port_out, cfs_gate_in, milestones, last_refreshed_at, vessel')
      .order('container_no')),
  ])
  const firstError = [jobsRes, csRes, resultsRes, ctRes].find((r) => r.error)?.error
  if (firstError) console.warn('[journey] load problem:', firstError.message)

  return buildJourneyData(
    { jobs: jobsRes.data, customs: csRes.data, results: resultsRes.data, containers: ctRes.data },
    firstError ? (firstError.message || 'Could not load the latest data') : null,
  )
}
