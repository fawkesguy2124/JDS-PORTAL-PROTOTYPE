import { kmBetween } from '../../supabase/functions/_shared/portal/seaAreas.js'
import { shortPort } from './shipInfo'
import { portTime } from './SeaTracking'

// What a professional tracker would point out about a ship (Jose, 25 Oct 2026: "the
// screen must always be right and tell you what changed"). From the saved tracking
// only; nothing here calls any service.
//   atPod: within reach of its port although the line has not confirmed arrival
//   delay: how far the ETA moved since tracking started ("+3 days late")
//   flags: [{ id, tone: red | amber | grey | info, icon, text }], most serious first

const HOUR = 3600e3
const DAY = 24 * HOUR
const KMH = 30 // a container ship's normal speed (about 16 knots), as the WhatsApp card uses
const AT_PORT_KM = 40
const INDIA = /(,\s*IN$)|Jawaharlal|Nhava|Mundra|Chennai|Kolkata|Kattupalli|Hazira|Pipavav|Kandla|Cochin|Kochi|Tuticorin|Visakha/i
// the line's dates are port time saved as UTC: for an Indian port the real moment is 5½ h earlier
export const realMs = (iso, port) => {
  const t = new Date(iso).getTime()
  return INDIA.test(String(port || '')) ? t - 5.5 * HOUR : t
}
const km = (n) => `${Math.round(n).toLocaleString('en-IN')} km`
const istDay = (ms) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const TONE_RANK = { red: 0, amber: 1, grey: 2, info: 3 }

export function shipChecks(sea, m, trip, now = Date.now()) {
  const out = { atPod: false, delay: null, flags: [] }
  if (!sea || sea.error || !m || m.waiting) return out
  const port = shortPort(m.podName || sea.pod) || 'the port'
  const pod = sea.route?.pod
  const kmToPod = Array.isArray(pod) && typeof sea.lat === 'number' ? kmBetween([sea.lat, sea.lng], pod) : null
  out.atPod = !m.arrived && kmToPod != null && kmToPod <= AT_PORT_KM

  // how far the ETA moved since tracking started
  if (sea.first_pod_date && sea.pod_date) {
    const days = Math.round((new Date(sea.pod_date).getTime() - new Date(sea.first_pod_date).getTime()) / DAY)
    if (days) out.delay = { days, tone: days > 0 ? 'late' : 'early', text: days > 0 ? `+${days} day${days === 1 ? '' : 's'} late` : `${-days} day${days === -1 ? '' : 's'} early` }
  }
  if (m.arrived) return out

  const flags = []
  const eta = sea.pod_date ? realMs(sea.pod_date, sea.pod) : null
  const kmLeft = trip?.left != null ? trip.left * 1.852 : kmToPod
  if (out.atPod) {
    flags.push({ id: 'atpod', tone: 'amber', icon: 'anchor', text: `At ${port}, arrival not confirmed by the line yet` })
  } else if (eta && now > eta + 3 * HOUR) {
    flags.push({ id: 'passed', tone: 'red', icon: 'clock-exclamation', text: `ETA passed (${portTime(sea.pod_date)})${kmLeft != null ? `, ship still ${km(kmLeft)} away` : ''}` })
  } else if (eta && kmLeft != null) {
    // the line's ETA cannot be met at a normal speed
    const likely = now + (kmLeft / KMH) * HOUR
    if (likely > eta + 12 * HOUR) flags.push({ id: 'early', tone: 'amber', icon: 'gauge', text: `ETA looks too early: ${km(kmLeft)} to go, likely about ${istDay(likely)}` })
  }
  if (out.delay?.days > 0) {
    flags.push({ id: 'delay', tone: out.delay.days >= 3 ? 'red' : 'amber', icon: 'calendar-time', text: `ETA moved ${out.delay.days} day${out.delay.days === 1 ? '' : 's'} later (was ${portTime(sea.first_pod_date, false)})` })
  }
  // no fresh position
  const at = m.at ? new Date(m.at).getTime() : null
  if (at && now - at > DAY && !out.atPod) flags.push({ id: 'stale', tone: 'grey', icon: 'satellite-off', text: `No new position for ${Math.round((now - at) / HOUR)} h` })
  // the cargo changes ship in the next two days
  for (const p of sea.route?.via || []) {
    if (!p.change || p.arrived || !p.arrive) continue
    const t = new Date(p.arrive).getTime()
    if (t > now - 6 * HOUR && t - now < 2 * DAY) flags.push({ id: `change-${p.name}`, tone: 'info', icon: 'transfer', text: `Changes ship at ${shortPort(p.name)} on ${portTime(p.arrive)}${p.outShip ? ` (to ${p.outShip})` : ''}` })
  }
  // arriving within two days (and the ETA looks possible)
  if (!out.atPod && eta && eta > now && eta - now < 2 * DAY && !flags.some((f) => f.id === 'early')) {
    flags.push({ id: 'soon', tone: 'info', icon: 'flag', text: `Arrives ${port} ${portTime(sea.pod_date)}` })
  }
  out.flags = flags.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone])
  return out
}
