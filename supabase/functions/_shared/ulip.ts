// Shared ULIP helper for Edge Functions.
// - One ULIP login is reused for 25 minutes (stored in the ulip_token table)
// - Every call goes through the JDS proxy with the x-proxy-key header
// - Every call is recorded in ulip_calls (who, which API, result, time taken)
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ULIP_BASE        = 'http://13.200.155.29:3000/ulip/v1.0.0'
const ULIP_TIMEOUT_MS  = 30000 // production ULIP can take 10+ seconds
const TOKEN_REUSE_MINS = 25

export const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

// Returns the signed-in portal user (and their profile name), or null
export async function getCaller(req: Request, admin: SupabaseClient) {
  const auth = req.headers.get('Authorization') || ''
  const jwt = auth.replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data?.user) return null
  const { data: profile } = await admin.from('profiles').select('name').eq('id', data.user.id).maybeSingle()
  return { id: data.user.id, name: profile?.name || data.user.email || 'Unknown' }
}

async function postToProxy(path: string, payload: unknown, token?: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ULIP_TIMEOUT_MS)
  try {
    const headers: Record<string, string> = {
      'x-proxy-key': Deno.env.get('ULIP_PROXY_KEY') ?? '',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${ULIP_BASE}/${path}`, {
      method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal,
    })
    const text = await res.text()
    let body: any = null
    try { body = JSON.parse(text) } catch { body = { nonJson: text.slice(0, 2000) } }
    return { status: res.status, body }
  } finally {
    clearTimeout(timeout)
  }
}

async function login(admin: SupabaseClient): Promise<string> {
  const username = Deno.env.get('ULIP_USERNAME')
  const password = Deno.env.get('ULIP_PASSWORD')
  if (!username || !password) throw new Error('ULIP credentials not configured on the server')
  const { status, body } = await postToProxy('user/login', { username, password })
  if (status !== 200) throw new Error(`ULIP login failed (HTTP ${status})`)
  const token = body?.response?.id || body?.response?.token || body?.data?.token || body?.token
  if (!token) throw new Error('ULIP login gave no token')
  await admin.from('ulip_token').upsert({
    id: 1, token, expires_at: new Date(Date.now() + TOKEN_REUSE_MINS * 60_000).toISOString(),
  })
  return token
}

async function getToken(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.from('ulip_token').select('token, expires_at').eq('id', 1).maybeSingle()
  if (data?.token && new Date(data.expires_at).getTime() > Date.now() + 60_000) return data.token
  return login(admin)
}

export type UlipResult = {
  ok: boolean        // true when ULIP answered successfully (data may still be empty)
  status: number     // HTTP status (0 when unreachable)
  body: any          // ULIP's JSON answer
  error?: string     // plain-language problem, when ok is false
}

// Calls one ULIP API (e.g. 'ICEGATE/03') and records the call in ulip_calls
export async function callUlip(
  admin: SupabaseClient,
  api: string,
  payload: unknown,
  ctx: { jobId?: string | null; userId?: string | null; userName?: string | null },
): Promise<UlipResult> {
  const started = Date.now()
  let result: UlipResult
  try {
    let token = await getToken(admin)
    let { status, body } = await postToProxy(api, payload, token)
    if (status === 401 || status === 403) {
      // Saved login expired early: log in once more and retry once
      token = await login(admin)
      ;({ status, body } = await postToProxy(api, payload, token))
    }
    if (status !== 200) {
      result = { ok: false, status, body, error: `${body?.message || `ULIP returned HTTP ${status}`} | ${JSON.stringify(body).slice(0, 400)}` }
    } else if (body?.error === 'true' || body?.error === true) {
      const detail = [body?.code, body?.message].filter(Boolean).join(' ')
      result = { ok: false, status, body, error: `ULIP reported an error${detail ? `: ${detail}` : ''} | ${JSON.stringify(body).slice(0, 400)}` }
    } else {
      result = { ok: true, status, body }
    }
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? 'ULIP did not answer in time' : (err?.message || 'ULIP unreachable')
    result = { ok: false, status: 0, body: null, error: msg }
  }

  const { error: logErr } = await admin.from('ulip_calls').insert({
    api,
    job_id: ctx.jobId ?? null,
    user_id: ctx.userId ?? null,
    user_name: ctx.userName ?? null,
    http_status: result.status,
    ok: result.ok,
    error: result.error ?? null,
    ms: Date.now() - started,
  })
  if (logErr) console.warn('[ulip] ulip_calls insert failed:', logErr.message)

  return result
}

// "26/07/2021 00:00" or "26072021" -> "2021-07-26"; anything else -> null
export function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}
