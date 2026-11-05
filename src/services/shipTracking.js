import { supabase } from '../supabase'

// Start ship tracking for a job straight away (Jose, 31 Oct 2026: "it should be instant"),
// instead of waiting for the hourly run. Ship tracking follows the BL or container
// number, so it gives the ship, its IMO, where it is and the ETA in one go, and keeps
// following the box if it changes ships on the way. Only sea imports opened since the
// tracking trial began (the same jobs the hourly run adds by itself, so no extra
// shipments are used); the sea-track function keeps the monthly cap and skips a job
// whose container is already in port. Never throws; resolves to the function's answer.
const TRACKING_FROM = '2026-10-24'
export const SHIP_TRACKED = 'jds:ship-tracked'

// opts.fromBl: someone just uploaded this job's BL, so an older open job is tracked too
export function shouldTrackShip(job, opts = {}) {
  // sea jobs only (Air, Courier and Land have no ship; a job with no mode yet may be sea)
  if (!job?.id || (job.mode && !/^sea/i.test(job.mode)) || job.job_type === 'export') return false
  if (!job.bl_no && !job.containers) return false
  if (opts.fromBl) return !(Number(job.stage) >= 10)
  return String(job.created_at || new Date().toISOString()).slice(0, 10) >= TRACKING_FROM
}

// The container's own tracking (LDB) at once too, not at the next scheduled run, up to 30 minutes
// later (Jose, 5 Nov 2026: "instant container tracking, vessel tracking"). Runs on in the background.
export async function startContainerTracking(job) {
  if (!job?.containers) return
  try {
    const { refreshJobContainers } = await import('./tracking/ldbProvider')
    await refreshJobContainers(job)
    window.dispatchEvent(new Event(SHIP_TRACKED))
  } catch (e) {
    console.warn('[shipTracking] container tracking could not start:', e?.message)
  }
}

export async function startShipTracking(job, opts = {}) {
  if (!shouldTrackShip(job, opts)) return null
  try {
    const { data, error } = await supabase.functions.invoke('sea-track', { body: { jobId: job.id, start: true } })
    if (error) { console.warn('[shipTracking] could not start:', error.message); return null }
    // the portal reloads its data so the Vessels page shows the ship without a refresh
    window.dispatchEvent(new Event(SHIP_TRACKED))
    return data
  } catch (e) {
    console.warn('[shipTracking] could not start:', e?.message)
    return null
  }
}
