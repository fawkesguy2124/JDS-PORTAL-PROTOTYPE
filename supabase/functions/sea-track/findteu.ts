// findTEU, ready for when Safecube's trial ends (Jose, 6 Nov 2026). Used only when the secrets
// SEA_PROVIDER=findteu and FINDTEU_API_KEY are set; remove SEA_PROVIDER to go back to Safecube.
// Gives the same row as Safecube's answer (summarize in index.ts), so nothing else changes.
//  • asked by container number (or booking); it finds the line itself, leased boxes too
//  • no ship position or sea route: the portal follows the ship by its IMO, as for any other ship
//  • docs list OOCL, Evergreen, Wan Hai, COSCO, MSC, ONE, ZIM, HMM, Maersk, Hapag-Lloyd, CMA CGM,
//    Yang Ming and PIL, but NOT Emirates, TS Lines, Interasia, Unifeeder, X-Press, RCL, KMTC, SITC
const API = 'https://api.findteu.com'

const when = (v: unknown) => (v && !isNaN(new Date(String(v)).getTime()) ? new Date(String(v)).toISOString() : null)
const CODES: [RegExp, string][] = [[/^loaded/i, 'LOAD'], [/^discharged/i, 'DISC'], [/^departed/i, 'DEPA'], [/^arrived/i, 'ARRI'], [/^gate in/i, 'GTIN'], [/^gate out/i, 'GTOT']]
const codeOf = (e: any) => CODES.find(([re]) => re.test(String(e?.action?.action_name || '')))?.[1] || null
const place = (l: any) => (l?.port ? [l.port, String(l.iso_code || '').slice(0, 2)].filter(Boolean).join(', ') : null)
const shipOf = (e: any) => (e?.mode?.vessel?.vessel_name ? e.mode.vessel : null)
const isCode = (e: any, ...codes: string[]) => codes.includes(codeOf(e) as string)

// findTEU's answer → the row sea_tracking keeps
export function findteuRow(d: any) {
  const at = (e: any) => new Date(e?.event_date || 0).getTime()
  const events = Array.isArray(d?.events) ? d.events : []
  const done = events.filter((e: any) => e.event_type === 'actual').sort((a: any, b: any) => at(b) - at(a))
  const next = events.filter((e: any) => e.event_type !== 'actual').sort((a: any, b: any) => at(a) - at(b))
  const box = d?.container?.number || null
  const ev = (e: any) => (e ? { what: e.action?.action_name || null, code: codeOf(e), where: place(e.location), when: when(e.event_date), box, vessel: shipOf(e)?.vessel_name || null, voyage: shipOf(e)?.voyage_nr || null } : null)
  const polIso = d?.pol?.iso_code, podIso = d?.pod?.iso_code
  const atPod = (e: any) => !!podIso && e?.location?.iso_code === podIso
  const atPol = (e: any) => !!polIso && e?.location?.iso_code === polIso
  // sailed: the box was loaded or has left by ship
  const sailed = done.some((e: any) => isCode(e, 'LOAD', 'DEPA'))
  const landed = done.find((e: any) => atPod(e) && isCode(e, 'ARRI', 'DISC'))
  const left = done.find((e: any) => atPol(e) && isCode(e, 'DEPA')) || done.find((e: any) => atPol(e) && isCode(e, 'LOAD'))
  const etaEvent = next.find((e: any) => atPod(e) && isCode(e, 'ARRI')) || next.find((e: any) => atPod(e) && isCode(e, 'DISC'))
  // the ship the cargo is on now, else the next one it goes on
  const shipNow = shipOf(done.find((e: any) => shipOf(e))) || shipOf(next.find((e: any) => shipOf(e)))
  // ports where the cargo changes ship on the way: neither the loading nor the discharge port
  const via: any[] = []
  for (const e of [...events].sort((a: any, b: any) => at(a) - at(b))) {
    if (!shipOf(e) || atPol(e) || atPod(e) || !e.location?.iso_code) continue
    let v = via.find((x) => x.key === e.location.iso_code)
    if (!v) { v = { key: e.location.iso_code, name: place(e.location), pos: null, arrive: null, leave: null, arrived: false, left: false, inShip: null, outShip: null }; via.push(v) }
    const actual = e.event_type === 'actual'
    if (isCode(e, 'ARRI', 'DISC')) { v.arrive ||= when(e.event_date); v.arrived ||= actual; v.inShip ||= shipOf(e).vessel_name }
    if (isCode(e, 'DEPA', 'LOAD')) { v.leave = when(e.event_date) || v.leave; v.left ||= actual; v.outShip = shipOf(e).vessel_name || v.outShip }
  }
  return {
    status: d?.container?.completed ? 'DELIVERED' : sailed ? 'IN_TRANSIT' : events.length ? 'PLANNED' : 'UNKNOWN',
    sealine: d?.scac || null, sealine_name: null,
    pol: place(d?.pol), pol_date: when(left?.event_date || d?.pol?.etd_date),
    pod: place(d?.pod), pod_date: when(landed?.event_date || etaEvent?.event_date || d?.pod?.eta_date), pod_actual: !!landed,
    predictive_eta: null,
    vessel_name: shipNow?.vessel_name || null, vessel_imo: shipNow?.imo ? String(shipNow.imo) : null, vessel_mmsi: shipNow?.mmsi ? String(shipNow.mmsi) : null,
    lat: null, lng: null, position_at: null, ais_status: null,
    last_event: ev(done[0]), next_event: ev(next[0]),
    containers: box ? [{ no: box, status: d?.container?.completed ? 'DELIVERED' : null, size: d?.container?.type || null, last: ev(done[0]) }] : [],
    warnings: [], carrier_updated_at: when(d?.timestamp),
    route: { segments: [], pol: null, pod: null, via: via.map(({ key: _key, ...v }) => ({ ...v, change: !!(v.inShip && v.outShip && v.inShip !== v.outShip) })) },
  }
}

// findTEU's error codes, in the words the portal already turns into plain language (seaWhy)
const ERRORS: Record<number, [string, boolean]> = {
  1: ['TEMPORARY', true], 2: ['NO_RESPONSE', true], 4: ['MAINTENANCE', true], 208: ['TEMPORARY', true],
  3: ['NO_DATA', false], 6: ['INVALID_NUMBER', false], 207: ['INVALID_NUMBER', false],
  7: ['SEALINE_NOT_SUPPORTED', false], 206: ['SEALINE_NOT_SUPPORTED', false],
  201: ['API_KEY', false], 202: ['API_KEY', false], 203: ['API_LIMIT', false], 204: ['API_ACCOUNT', false],
}

// The answer → { ok, row } or { ok: false, billed, error, retry }. Only a real answer uses a shipment.
export function findteuAnswer(status: number, body: any, opts: { allowDemo?: boolean } = {}) {
  const code = Number(body?.error?.code ?? body?.data?.error ?? 0)
  // the demo key's made-up data must never reach a real job
  if (/NOT REAL/i.test(String(body?.data?.NOTICE || '')) && !opts.allowDemo) return { ok: false as const, billed: false, error: 'API_KEY: this is the demo key, not a real one', retry: false }
  // an answer with no trip in it is not an answer (7 Nov 2026: J-741's leased box came back
  // "DELIVERED" with no events, no ship and Maersk as the line, while it was on SPARROW)
  if (body?.success && !code && body?.data?.container) {
    const events = Array.isArray(body.data.events) ? body.data.events : []
    if (!events.length || (!body.data.pod?.port && !events.some((e: any) => e?.mode?.vessel?.vessel_name))) {
      return { ok: false as const, billed: true, error: 'NO_TRIP: findTEU has no trip for this container (yet)', retry: false }
    }
    return { ok: true as const, row: findteuRow(body.data) }
  }
  const [name, retry] = ERRORS[code] || (status >= 500 ? ['TEMPORARY', true] : ['HTTP_ERROR', false]) as [string, boolean]
  return { ok: false as const, billed: false, error: `${name}: ${String(body?.error?.text || `HTTP ${status}`).slice(0, 160)}`, retry }
}

export async function findteuLookUp(number: string, key: string, opts: { allowDemo?: boolean } = {}) {
  try {
    // ("typically within 25 seconds" for a first request; "if no response in 75 seconds, resubmit")
    const res = await fetch(`${API}/container/${encodeURIComponent(number)}`, { method: 'POST', headers: { 'X-Authorization-ApiKey': key, Accept: 'application/json' }, signal: AbortSignal.timeout(80_000) })
    const text = await res.text()
    let body: any = null
    try { body = JSON.parse(text) } catch { body = { error: { text: text.slice(0, 160) } } }
    return findteuAnswer(res.status, body, opts)
  } catch (e) {
    return { ok: false as const, billed: false, error: `TEMPORARY: ${(e as Error).message}`, retry: true }
  }
}
