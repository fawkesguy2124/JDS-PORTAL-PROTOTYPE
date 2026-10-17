// Shared ULIP helper for Edge Functions.
//
// Everything here exists to keep JDS's ULIP traffic calm and human-paced:
// - One ULIP login is reused for 25 minutes (ulip_token), and only one
//   function at a time may log in (a short lock in the same row)
// - A failed login is remembered: no new login attempt for 5 minutes
// - Re-login only on 401 with an older token, at most once per call
// - Caps: 20 calls a minute per person, 60 a minute for the whole office
// - Every call (including logins) is recorded in ulip_calls
// - Every call goes through the JDS proxy with the x-proxy-key header
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const ULIP_BASE              = 'http://13.200.155.29:3000/ulip/v1.0.0'
const ULIP_TIMEOUT_MS        = 20_000
const TOKEN_REUSE_MINS       = 25
const LOGIN_LOCK_SECS        = 30
const LOGIN_RETRY_AFTER_MINS = 5
const PER_USER_PER_MINUTE    = 20
const OFFICE_PER_MINUTE      = 60
const NO_RETRY_AFTER_MS      = 40_000   // never start a second attempt this late into a request

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Returns the signed-in JDS staff member, or null. A valid sign-in alone is
// not enough: the person must also have a staff profile.
export async function getCaller(req: Request, admin: SupabaseClient) {
  const auth = req.headers.get('Authorization') || ''
  const jwt = auth.replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data?.user) return null
  const { data: profile } = await admin.from('profiles').select('name, role').eq('id', data.user.id).maybeSingle()
  if (!profile) return null
  return { id: data.user.id, name: profile.name || data.user.email || 'Unknown', role: profile.role || null }
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

type Ctx = { jobId?: string | null; userId?: string | null; userName?: string | null }

async function logCall(admin: SupabaseClient, api: string, ctx: Ctx, status: number, ok: boolean, error: string | null, ms: number) {
  const { error: logErr } = await admin.from('ulip_calls').insert({
    api, job_id: ctx.jobId ?? null, user_id: ctx.userId ?? null, user_name: ctx.userName ?? null,
    http_status: status, ok, error, ms,
  })
  if (logErr) console.warn('[ulip] ulip_calls insert failed:', logErr.message)
}

class UlipBusy extends Error {}

// Logs in to ULIP. Only the function that wins the lock does this; it saves
// the token, or remembers the failure so nobody retries for 5 minutes.
async function login(admin: SupabaseClient, ctx: Ctx): Promise<{ token: string; issuedAt: number }> {
  const username = Deno.env.get('ULIP_USERNAME')
  const password = Deno.env.get('ULIP_PASSWORD')
  if (!username || !password) throw new Error('ULIP credentials not configured on the server')

  const started = Date.now()
  let status = 0
  let problem: string | null = null
  let token: string | null = null
  try {
    const res = await postToProxy('user/login', { username, password })
    status = res.status
    token = res.body?.response?.id || res.body?.response?.token || res.body?.data?.token || res.body?.token || null
    if (status !== 200) problem = `ULIP login failed (HTTP ${status})`
    else if (!token) problem = 'ULIP login gave no token'
  } catch (err: any) {
    problem = err?.name === 'AbortError' ? 'ULIP login did not answer in time' : (err?.message || 'ULIP login unreachable')
  }
  await logCall(admin, 'user/login', ctx, status, !problem, problem, Date.now() - started)

  const now = Date.now()
  if (problem || !token) {
    const { error } = await admin.from('ulip_token').update({
      refreshing_until: null, last_login_failed_at: new Date(now).toISOString(), last_login_error: problem,
    }).eq('id', 1)
    if (error) console.warn('[ulip] could not record login failure:', error.message)
    throw new Error(problem || 'ULIP login failed')
  }
  const { error } = await admin.from('ulip_token').update({
    token,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + TOKEN_REUSE_MINS * 60_000).toISOString(),
    refreshing_until: null,
    last_login_failed_at: null,
    last_login_error: null,
  }).eq('id', 1)
  if (error) console.warn('[ulip] could not save ULIP login:', error.message)
  return { token, issuedAt: now }
}

async function readToken(admin: SupabaseClient) {
  const { data, error } = await admin.from('ulip_token').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(`Could not read saved ULIP login: ${error.message}`)
  return data
}

// Returns a usable token. Waits briefly if another function is logging in.
async function getToken(admin: SupabaseClient, ctx: Ctx, forceNew = false): Promise<{ token: string; issuedAt: number }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readToken(admin)
    const now = Date.now()
    if (!forceNew && row?.token && row.expires_at && new Date(row.expires_at).getTime() > now + 60_000) {
      return { token: row.token, issuedAt: row.issued_at ? new Date(row.issued_at).getTime() : 0 }
    }
    if (row?.last_login_failed_at && now - new Date(row.last_login_failed_at).getTime() < LOGIN_RETRY_AFTER_MINS * 60_000) {
      throw new Error(`ULIP login is not working right now (${row.last_login_error || 'login failed'}). Please try again in a few minutes.`)
    }
    // Try to take the login lock (only one function logs in at a time)
    const nowIso = new Date(now).toISOString()
    const { data: claimed, error } = await admin.from('ulip_token')
      .update({ refreshing_until: new Date(now + LOGIN_LOCK_SECS * 1000).toISOString() })
      .eq('id', 1)
      .or(`refreshing_until.is.null,refreshing_until.lt.${nowIso}`)
      .select('id')
    if (error) throw new Error(`Could not lock ULIP login: ${error.message}`)
    if (claimed && claimed.length > 0) return login(admin, ctx)
    forceNew = false              // someone else is logging in; use their token
    await sleep(2000)
  }
  throw new UlipBusy('ULIP login is busy. Please try again in a minute.')
}

// Refuses the call if this person or the whole office has made too many calls
// in the last minute. Returns a plain message, or null when the call may go ahead.
async function overCap(admin: SupabaseClient, userId?: string | null): Promise<string | null> {
  const since = new Date(Date.now() - 60_000).toISOString()
  const office = await admin.from('ulip_calls').select('id', { count: 'exact', head: true }).gte('created_at', since)
  if ((office.count ?? 0) >= OFFICE_PER_MINUTE) return 'The office has made many government checks in the last minute. Please wait a minute and try again.'
  if (userId) {
    const mine = await admin.from('ulip_calls').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('user_id', userId)
    if ((mine.count ?? 0) >= PER_USER_PER_MINUTE) return 'You have made many checks in the last minute. Please wait a minute and try again.'
  }
  return null
}

export type UlipResult = {
  ok: boolean        // true when ULIP answered successfully (data may still be empty)
  status: number     // HTTP status (0 when unreachable or refused before calling)
  body: any          // ULIP's JSON answer
  error?: string     // plain-language problem, when ok is false (" | " then technical detail)
  refused?: boolean  // true when no call was made (cap, login problem)
}

// Calls one ULIP API (e.g. 'ICEGATE/03') and records the call in ulip_calls
export async function callUlip(admin: SupabaseClient, api: string, payload: unknown, ctx: Ctx): Promise<UlipResult> {
  const capMsg = await overCap(admin, ctx.userId)
  if (capMsg) return { ok: false, status: 0, body: null, error: capMsg, refused: true }

  let auth: { token: string; issuedAt: number }
  try {
    auth = await getToken(admin, ctx)
  } catch (err: any) {
    return { ok: false, status: 0, body: null, error: err?.message || 'ULIP login problem', refused: true }
  }

  const started = Date.now()
  let status = 0
  let body: any = null
  let result: UlipResult
  try {
    ;({ status, body } = await postToProxy(api, payload, auth.token))
    // Token rejected: only if it is not brand new, and only once, and only if there is still time
    if (status === 401 && Date.now() - auth.issuedAt > 60_000 && Date.now() - started < NO_RETRY_AFTER_MS) {
      await logCall(admin, api, ctx, status, false, 'Saved ULIP login was rejected; logging in again', Date.now() - started)
      try {
        auth = await getToken(admin, ctx, true)
        ;({ status, body } = await postToProxy(api, payload, auth.token))
      } catch (err: any) {
        return { ok: false, status: 0, body: null, error: err?.message || 'ULIP login problem', refused: true }
      }
    }
    if (status !== 200) {
      result = { ok: false, status, body, error: `${body?.message || `ULIP returned HTTP ${status}`} | ${JSON.stringify(body).slice(0, 400)}` }
    } else if (body?.error === 'true' || body?.error === true) {
      const inner = body?.response?.[0]?.response
      const detail = typeof inner === 'string' ? inner : (body?.message || '')
      result = { ok: false, status, body, error: `ULIP reported an error${detail ? `: ${detail}` : ''} | ${JSON.stringify(body).slice(0, 400)}` }
    } else {
      result = { ok: true, status, body }
    }
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? 'ULIP did not answer in time' : (err?.message || 'ULIP unreachable')
    result = { ok: false, status: 0, body: null, error: msg }
  }

  await logCall(admin, api, ctx, result.status, result.ok, result.error ?? null, Date.now() - started)
  return result
}

// Marks "this exact check is running" so a double click or two people
// pressing the same button do not make two ULIP calls. Returns true if this
// request may go ahead.
export async function claimKey(admin: SupabaseClient, key: string, seconds = 60): Promise<boolean> {
  const now = new Date()
  const until = new Date(now.getTime() + seconds * 1000).toISOString()
  const ins = await admin.from('ulip_inflight').insert({ key, until })
  if (!ins.error) return true
  if (ins.error.code !== '23505') {          // anything but "already exists" — fail safe: refuse
    console.warn('[ulip] inflight insert failed:', ins.error.message)
    return false
  }
  const { data } = await admin.from('ulip_inflight').update({ until }).eq('key', key).lt('until', now.toISOString()).select('key')
  return !!(data && data.length > 0)
}

export async function releaseKey(admin: SupabaseClient, key: string) {
  const { error } = await admin.from('ulip_inflight').delete().eq('key', key)
  if (error) console.warn('[ulip] inflight release failed:', error.message)
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
