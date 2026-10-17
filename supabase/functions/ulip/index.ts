// One entry point for every ULIP check in the portal.
// POST { api: 'ICEGATE/05', params: { sbNo: '...', sbDt: '...' }, jobId?: '<uuid>' }
//
// - Only the 50 approved APIs in the registry can be called
// - Inputs are checked against ULIP's documented formats before any call
// - The same check repeated within 5 minutes returns the saved answer (no ULIP call)
// - Every answer is saved in ulip_results (with who checked and when)
// - Every ULIP call is recorded in ulip_calls (by the shared helper)
import { adminClient, callUlip, corsHeaders, getCaller, json } from '../_shared/ulip.ts'
import { cleanParams, findApi } from './apis/index.ts'

const MIN_MINUTES_BETWEEN_SAME_CHECK = 5

function queryKey(api: string, values: Record<string, string>) {
  const sorted = Object.keys(values).sort().map((k) => `${k}=${values[k]}`).join('&')
  return `${api}?${sorted}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ success: false, error: 'Use POST.' }, 405)

  const admin = adminClient()
  const caller = await getCaller(req, admin)
  if (!caller) return json({ success: false, error: 'Please sign in again.' }, 401)

  let input: any
  try { input = await req.json() } catch { return json({ success: false, error: 'Invalid request.' }, 400) }

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
  if (
    existing?.checked_at &&
    Date.now() - new Date(existing.checked_at).getTime() < MIN_MINUTES_BETWEEN_SAME_CHECK * 60_000
  ) {
    return json({ success: true, cached: true, data: existing })
  }

  const body = api.buildBody ? api.buildBody(values) : values
  const res = await callUlip(admin, api.id, body, { jobId, userId: caller.id, userName: caller.name })
  const now = new Date().toISOString()

  if (!res.ok) {
    const shortError = (res.error || 'ULIP problem').split(' | ')[0]
    // Keep any earlier good answer; just record the failure
    await admin.from('ulip_results').upsert({
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
    return json({ success: false, error: shortError, data: existing ?? null }, 502)
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
    job_id: jobId,
    params: values,
    found: parsed.found,
    summary: parsed.summary,
    parsed,
    raw: res.body,
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
})
