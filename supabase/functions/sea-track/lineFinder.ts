// Which shipping line really has this container? (Jose, 6 Nov 2026, J-741: the BL named ZIM, ZIM's
// site said "does not belong to ZIM", the box was with Gold Star.) A BL's line is only a first guess:
// forwarders' BLs name agents, and leased boxes say nothing. When that guess doesn't work, the other
// lines are asked in turn. A refusal costs nothing (Safecube doesn't bill 400/500 answers).
import { isOldVoyage } from '../_shared/portal/journeyCore.js'

// sister lines first: they share ships and agents (a ZIM agent signs for Gold Star)
const PARTNERS: Record<string, string[]> = { ZIM: ['Gold Star'], 'Gold Star': ['ZIM'], COSCO: ['OOCL'], OOCL: ['COSCO'] }
const USUAL = ['MSC', 'Maersk', 'ONE', 'Hapag-Lloyd', 'CMA CGM', 'COSCO', 'OOCL', 'Evergreen', 'HMM', 'Yang Ming', 'Wan Hai', 'ZIM', 'Gold Star', 'PIL', 'RCL', 'Interasia', 'TS Line', 'KMTC', 'SITC', 'Emirates', 'Unifeeder']

// null = let the tracking service work the line out itself. Lines it doesn't cover drop out.
export function linesToAsk(jobLine: string | null, asked: string | null, scacOf: (name: string) => string | null) {
  const out: (string | null)[] = asked ? [null] : []
  for (const name of [...(PARTNERS[jobLine || ''] || []), ...USUAL]) {
    const scac = scacOf(name)
    if (scac && scac !== asked && !out.includes(scac)) out.push(scac)
  }
  return out
}

// Is this answer about this job's trip? A line can truly know a leased box from its PREVIOUS trip,
// so "the line knows it" isn't enough: the cargo must be coming to India, and not have landed
// before the job was even opened.
export function fitsJob(row: any, job: any) {
  if (!row || (!row.pod && !row.vessel_name)) return false
  if (isOldVoyage(row, job)) return false
  if (row.pod && !/,\s*IN$/i.test(String(row.pod))) return false
  const landed = row.pod_actual && row.pod_date ? new Date(row.pod_date).getTime() : NaN
  const opened = new Date(job?.created_at || 0).getTime()
  return !(landed < opened - 3 * 864e5)
}

// Ask the lines in turn until one has this job's trip.
// ask(scac) → { ok, row } or { ok: false, retry, stop }
export async function findLine(o: { scacs: (string | null)[]; job: any; ask: (scac: string | null) => Promise<any>; maxCalls?: number; until?: number }) {
  let tried = 0, down = 0, otherTrips = 0
  let previous: any = null
  for (const scac of o.scacs) {
    if (tried >= (o.maxCalls ?? 12) || (o.until && Date.now() > o.until)) break
    const a = await o.ask(scac)
    tried++
    if (a.ok) {
      down = 0
      if (fitsJob(a.row, o.job)) return { found: true as const, scac: a.row.sealine || scac, answer: a, tried }
      previous ||= { scac: a.row.sealine || scac, answer: a }
      // an answer about another trip may be billed: two at most
      if (++otherTrips >= 2) break
      continue
    }
    if (a.stop) break // the key or the plan: no other line will answer either
    down = a.retry ? down + 1 : 0
    if (down >= 3) break // the service itself is down
  }
  return { found: false as const, tried, previous, down: down >= 3 }
}
