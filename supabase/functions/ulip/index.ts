// One entry point for every ULIP check in the portal.
// POST { api: 'ICEGATE/05', params: { sbNo: '...', sbDt: '...' }, jobId?: '<uuid>' }
//
// - Only the 50 approved APIs in the registry can be called
// - Inputs are checked against ULIP's documented formats before any call
// - The same check repeated within 5 minutes returns the saved answer (no ULIP call)
// - After a failed check, the same check waits 2 minutes before asking ULIP again
// - The same check running twice at once (double click, two people) is refused
// - Every answer is saved in ulip_results (with who checked and when)
// - Every ULIP call is recorded in ulip_calls; per-person and office caps apply
import { adminClient, callUlip, claimKey, corsHeaders, getCaller, json, releaseKey } from '../_shared/ulip.ts'
import { cleanParams, findApi } from './apis/index.ts'

const MIN_MINUTES_BETWEEN_SAME_CHECK = 5
const MIN_MINUTES_AFTER_FAILURE = 2
// the WhatsApp bot may ask only these, when a person asks it to (Jose, 24 Oct 2026)
// + LDB/01 (live container movement) and VAHAN/04 (truck papers), Jose 25 Oct 2026
const BOT_APIS = ['FASTAG/01', 'ICEGATE/01', 'ICEGATE/07', 'ICEGATE/09', 'LDB/01', 'VAHAN/04']
const MIN_MINUTES_BETWEEN_BOT_CHECKS = 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Answers that carry personal data (owner/driver names, addresses, dates of
// birth) are not kept in raw form; the plain summary staff see is still saved.
const NO_RAW = /^(SARATHI|VAHAN|ECHALLAN)\//

function queryKey(api: string, values: Record<string, string>) {
  const sorted = Object.keys(values).sort().map((k) => `${k}=${values[k]}`).join('&')
  return `${api}?${sorted}`
}

const minutesSince = (iso: string | null | undefined) => (iso ? (Date.now() - new Date(iso).getTime()) / 60_000 : Infinity)

Deno.serve(async (req) => {
  const requestStart = Date.now()
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ success: false, error: 'Use POST.' }, 405)

  const admin = adminClient()
  let input: any
  try { input = await req.json() } catch { return json({ success: false, error: 'Invalid request.' }, 400) }

  // a signed-in staff member, or the WhatsApp bot asking for one person (with its
  // database password; only the checks below, at most once every 30 minutes each)
  let caller: any = await getCaller(req, admin)
  let fromBot = false
  const botSecret = req.headers.get('x-bot-secret')
  if (!caller && botSecret) {
    const { data: st } = await admin.from('bot_state').select('cron_token').eq('id', 1).maybeSingle()
    const ok = [Deno.env.get('BOT_CRON_SECRET') || '', String(st?.cron_token || '')].map((v) => v.trim()).filter((v) => v.length >= 20)
    if (!ok.includes(botSecret.trim())) return json({ success: false, error: 'Not allowed' }, 403)
    if (!BOT_APIS.includes(String(input?.api || ''))) return json({ success: false, error: 'The bot cannot run this check.' }, 403)
    const asId = String(input?.asId || '')
    caller = { id: UUID.test(asId) ? asId : null, name: String(input?.asName || 'WhatsApp bot').slice(0, 80), role: null }
    fromBot = true
  }
  if (!caller) return json({ success: false, error: 'Please sign in again.' }, 401)

  const api = findApi(String(input?.api || ''))
  if (!api) return json({ success: false, error: 'This check is not available.' }, 400)

  const cleaned = cleanParams(api, input?.params || {})
  if (!cleaned.ok) return json({ success: false, error: cleaned.error }, 400)
  const values = cleaned.values

  let jobId: string | null = input?.jobId ? String(input.jobId) : null
  if (jobId) {
    const { data: job } = await admin.from('jobs').select('id').eq('id', jobId).maybeSingle()
    if (!job) jobId = null
  }

  const key = queryKey(api.id, values)
  const { data: existing } = await admin.from('ulip_results').select('*').eq('query_key', key).maybeSingle()

  // Recent good answer: return it (and link it to this job if it had none)
  if (existing?.checked_at && minutesSince(existing.checked_at) < (fromBot ? MIN_MINUTES_BETWEEN_BOT_CHECKS : MIN_MINUTES_BETWEEN_SAME_CHECK)) {
    if (jobId && !existing.job_id) {
      await admin.from('ulip_results').update({ job_id: jobId }).eq('query_key', key)
      existing.job_id = jobId
    }
    return json({ success: true, cached: true, data: existing })
  }
  // Recent failure: do not ask ULIP again yet
  if (existing?.last_error_at && minutesSince(existing.last_error_at) < MIN_MINUTES_AFTER_FAILURE) {
    return json({
      success: false,
      error: `${existing.last_error} (This check failed a moment ago. Please try again in a couple of minutes.)`,
      data: existing.parsed ? existing : null,
    }, 502)
  }

  const claim = await claimKey(admin, `ulip:${key}`, 150)
  if (!claim) {
    return json({ success: false, error: 'This check is already running. Please wait a moment.' }, 409)
  }

  try {
    const body = api.buildBody ? api.buildBody(values) : values
    const res = await callUlip(admin, api.id, body, { jobId, userId: caller.id, userName: caller.name, requestStart })
    const now = new Date().toISOString()

    if (!res.ok) {
      const shortError = (res.error || 'ULIP problem').split(' | ')[0]
      // Refused before calling (office/person cap, login problem): nothing to record
      if (res.refused) return json({ success: false, error: shortError, data: existing?.parsed ? existing : null }, 429)
      // Keep any earlier good answer; just record the failure
      const { error: failErr } = await admin.from('ulip_results').upsert({
        query_key: key,
        api: api.id,
        job_id: jobId ?? existing?.job_id ?? null,
        params: values,
        found: existing?.found ?? null,
        summary: existing?.summary ?? null,
        parsed: existing?.parsed ?? null,
        raw: existing?.raw ?? null,
        ok: existing?.ok ?? false,
        last_error: shortError,
        last_error_at: now,
        checked_at: existing?.checked_at ?? null,
        checked_by: existing?.checked_by ?? null,
        checked_by_name: existing?.checked_by_name ?? null,
      })
      if (failErr) console.warn('[ulip] could not record failure:', failErr.message)
      return json({ success: false, error: shortError, data: existing?.parsed ? existing : null }, 502)
    }

    let parsed
    try {
      parsed = api.parse(res.body)
    } catch (err: any) {
      console.error(`[ulip] parse failed for ${api.id}:`, err?.message)
      parsed = { found: false, tone: 'bad', summary: 'ULIP answered, but the portal could not read the answer.', fields: [] }
    }

    const row = {
      query_key: key,
      api: api.id,
      job_id: jobId ?? existing?.job_id ?? null,
      params: values,
      found: parsed.found,
      summary: parsed.summary,
      parsed,
      raw: NO_RAW.test(api.id) ? null : res.body,
      ok: true,
      last_error: null,
      last_error_at: null,
      checked_at: now,
      checked_by: caller.id,
      checked_by_name: caller.name,
    }
    const { data: saved, error: saveErr } = await admin.from('ulip_results').upsert(row).select().single()
    if (saveErr) console.warn('[ulip] could not save result:', saveErr.message)

    return json({ success: true, cached: false, data: saved ?? row })
  } finally {
    await releaseKey(admin, `ulip:${key}`, claim)
  }
})
