import { supabase } from '../supabase'

// Start ship tracking for a job straight away (Jose, 31 Oct 2026: "it should be instant"),
// instead of waiting for the hourly run. Ship tracking follows the BL or container
// number, so it gives the ship, its IMO, where it is and the ETA in one go, and keeps
// following the box if it changes ships on the way. Only sea imports opened since the
// tracking trial began (the same jobs the hourly run adds by itself, so no extra
// shipments are used); the sea-track function keeps the monthly cap and skips a job
// whose container is already in port. Never throws; resolves to the function's answer.
const TRACKING_FROM = '2026-10-24'

export function shouldTrackShip(job) {
  if (!job?.id || job.mode === 'Air' || job.job_type === 'export') return false
  if (!job.bl_no && !job.containers) return false
  return String(job.created_at || new Date().toISOString()).slice(0, 10) >= TRACKING_FROM
}

export async function startShipTracking(job) {
  if (!shouldTrackShip(job)) return null
  try {
    const { data, error } = await supabase.functions.invoke('sea-track', { body: { jobId: job.id, start: true } })
    if (error) { console.warn('[shipTracking] could not start:', error.message); return null }
    return data
  } catch (e) {
    console.warn('[shipTracking] could not start:', e?.message)
    return null
  }
}
