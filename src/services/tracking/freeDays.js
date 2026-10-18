import { freeDaysLeftFor, daysSinceLastMove, containerTrip, containerFinishedOn, STALE_AFTER_DAYS } from '../journey'

// What the Containers screen shows about free days / detention for one container.
// Uses the same rules as Today and the job journey:
//   done     – empty container back (or the box started its next trip), collected by
//              the client, or the job is delivered: show nothing
//   unclear  – no movement for 30+ days: probably finished but never marked
//   running  – free days are over: detention is adding up (shows how many days)
//   risk     – 0 to 2 free days left
//   ok       – more than 2 free days left
//   unknown  – free days not known
const DAY = 24 * 60 * 60 * 1000

export function freeDayState(td, job) {
  if (!td) return { kind: 'unknown' }
  const row = {
    status: td.status, port_in: td.portIn, port_out: td.portOut, cfs_gate_in: td.cfsGateIn,
    milestones: td.milestones, free_days: td.freeDays, last_refreshed_at: td.lastUpdate,
  }
  if (Number(job?.stage) >= 10) return { kind: 'done' }
  const finishedOn = containerFinishedOn(row, job)
  if (finishedOn) return { kind: 'done', finishedOn }
  const portIn = containerTrip(row, job).portIn || td.portIn
  const moved = daysSinceLastMove(row)
  const left = freeDaysLeftFor(job, row) // null when unknown or no movement for 30+ days

  // the day free time ended (from the contract when known, else from the last saved snapshot)
  const contract = Number(job?.free_days)
  let endsOn = null
  if (portIn && Number.isFinite(contract) && contract > 0) endsOn = new Date(new Date(portIn).getTime() + contract * DAY)
  else if (left !== null) endsOn = new Date(Date.now() + left * DAY)
  const endsText = endsOn ? endsOn.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : null

  if (moved !== null && moved > STALE_AFTER_DAYS) return { kind: 'unclear', stillDays: moved, endsText }
  if (left === null) return { kind: 'unknown', endsText }
  if (left < 0) return { kind: 'running', over: -left, endsText }
  if (left <= 2) return { kind: 'risk', left, endsText }
  return { kind: 'ok', left, endsText }
}

export const isDetentionState = (s) => s?.kind === 'running' || s?.kind === 'risk'
