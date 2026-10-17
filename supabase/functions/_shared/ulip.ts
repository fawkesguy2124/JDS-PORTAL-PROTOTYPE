// Shared ULIP helper for Edge Functions.
//
// Everything here exists to keep JDS's ULIP traffic calm and human-paced:
// - One ULIP login is reused for 25 minutes (ulip_token), and only one
//   function at a time may log in (a short lock in the same row)
// - A failed login is remembered: no new login attempt for 5 minutes
// - A refused login token is withdrawn at once; re-login at most once per call
// - Caps: 20 calls a minute per person, 60 a minute for the whole office,
//   counting calls that are still running
// - Every call (including logins) is recorded in ulip_calls
// - Every call goes through the JDS proxy with the x-proxy-key header
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const ULIP_BASE              = 'http://13.200.155.29:3000/ulip/v1.0.0'
const ULIP_TIMEOUT_MS        = 20_000
const ICEGATE_TIMEOUT_MS     = 35_000
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
  // ICEGATE is often slow to answer; everything else gets the normal limit
  const limit = path.startsWith("ICEGATE/") ? ICEGATE_TIMEOUT_MS : ULIP_TIMEOUT_MS
  const timeout = setTimeout(() => controller.abort(), limit)
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

type Ctx = { jobId?: string | null; userId?: string | null; userName?: string | null; requestStart?: number }

// A call is written to ulip_calls BEFORE it is sent (ok = null while it runs),
// so the per-minute caps also count calls that are still waiting for ULIP.
async function startCall(admin: SupabaseClient, api: string, ctx: Ctx): Promise<number | null> {
  const { data, error } = await admin.from('ulip_calls').insert({
    api, job_id: ctx.jobId ?? null, user_id: ctx.userId ?? null, user_name: ctx.userName ?? null, ok: null,
  }).select('id').single()
  if (error) {
    console.warn('[ulip] ulip_calls insert failed:', error.message)
    return null
  }
  return data.id
}

async function finishCall(admin: SupabaseClient, id: number | null, status: number, ok: boolean, error: string | null, ms: number) {
  if (id === null) return
  const { error: logErr } = await admin.from('ulip_calls').update({ http_status: status, ok, error, ms }).eq('id', id)
  if (logErr) console.warn('[ulip] ulip_calls update failed:', logErr.message)
}

class UlipBusy extends Error {}

// Remember a login problem so nobody tries again for 5 minutes
async function rememberLoginFailure(admin: SupabaseClient, problem: string) {
  const { error } = await admin.from('ulip_token').update({
    refreshing_until: null, last_login_failed_at: new Date().toISOString(), last_login_error: problem,
  }).eq('id', 1)
  if (error) console.warn('[ulip] could not record login failure:', error.message)
}

// Logs in to ULIP. Only the function holding the lock does this; it saves
// the token, or remembers the failure so nobody retries for 5 minutes.
async function login(admin: SupabaseClient, ctx: Ctx): Promise<{ token: string; issuedAt: number }> {
  const username = Deno.env.get('ULIP_USERNAME')
  const password = Deno.env.get('ULIP_PASSWORD')
  if (!username || !password) {
    await rememberLoginFailure(admin, 'ULIP credentials not configured on the server')
    throw new Error('ULIP credentials not configured on the server')
  }

  const callId = await startCall(admin, 'user/login', ctx)
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
  await finishCall(admin, callId, status, !problem, problem, Date.now() - started)

  if (problem || !token) {
    await rememberLoginFailure(admin, problem || 'ULIP login failed')
    throw new Error(problem || 'ULIP login failed')
  }
  const now = Date.now()
  const { error } = await admin.from('ulip_token').update({
    token,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + TOKEN_REUSE_MINS * 60_000).toISOString(),
    refreshing_until: null,
    last_login_failed_at: null,
    last_login_error: null,
  }).eq('id', 1)
  if (error) {
    // The login worked but could not be saved: stop others logging in again and again
    console.warn('[ulip] could not save ULIP login:', error.message)
    await rememberLoginFailure(admin, 'the portal could not save the ULIP login')
  }
  return { token, issuedAt: now }
}

async function readToken(admin: SupabaseClient) {
  const { data, error } = await admin.from('ulip_token').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(`Could not read saved ULIP login: ${error.message}`)
  if (!data) {
    const { error: insErr } = await admin.from('ulip_token').insert({ id: 1 })
    if (insErr && insErr.code !== '23505') throw new Error(`Could not set up ULIP login: ${insErr.message}`)
    return { id: 1 } as any
  }
  return data
}

// Returns a usable token. `rejected` = a token ULIP just refused: any other
// unexpired saved token is used instead (someone else already logged in).
// Waits briefly if another function is logging in.
async function getToken(admin: SupabaseClient, ctx: Ctx, rejected: string | null = null): Promise<{ token: string; issuedAt: number }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readToken(admin)
    const now = Date.now()
    if (row?.token && row.token !== rejected && row.expires_at && new Date(row.expires_at).getTime() > now + 60_000) {
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
    await sleep(2000)              // someone else is logging in; use their token next round
  }
  throw new UlipBusy('ULIP login is busy. Please try again in a minute.')
}

// Refuses the call if this person or the whole office has made too many calls
// in the last minute (including calls still running). Returns a plain message,
// or null when the call may go ahead. If the count cannot be read, refuse.
async function overCap(admin: SupabaseClient, userId?: string | null): Promise<string | null> {
  const since = new Date(Date.now() - 60_000).toISOString()
  const office = await admin.from('ulip_calls').select('id', { count: 'exact', head: true }).gte('created_at', since)
  if (office.error) return 'The portal could not check its call limits just now. Please try again in a minute.'
  if ((office.count ?? 0) >= OFFICE_PER_MINUTE) return 'The office has made many government checks in the last minute. Please wait a minute and try again.'
  if (userId) {
    const mine = await admin.from('ulip_calls').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('user_id', userId)
    if (mine.error) return 'The portal could not check its call limits just now. Please try again in a minute.'
    if ((mine.count ?? 0) >= PER_USER_PER_MINUTE) return 'You have made many checks in the last minute. Please wait a minute and try again.'
  }
  return null
}

export type UlipResult = {
  ok: boolean        // true when ULIP answered successfully (data may still be empty)
  status: number     // HTTP status (0 when unreachable or refused before calling)
  body: any          // ULIP's JSON answer
  error?: string     // plain-language problem, when ok is false (" | " then technical detail)
  refused?: boolean  // true only when NO call reached ULIP (cap, login problem before calling)
}

function classify(status: number, body: any): UlipResult {
  if (status !== 200) {
    return { ok: false, status, body, error: `${body?.message || `ULIP returned HTTP ${status}`} | ${JSON.stringify(body).slice(0, 400)}` }
  }
  if (body?.error === 'true' || body?.error === true) {
    const inner = body?.response?.[0]?.response
    const detail = typeof inner === 'string' ? inner : (body?.message || '')
    return { ok: false, status, body, error: `ULIP reported an error${detail ? `: ${detail}` : ''} | ${JSON.stringify(body).slice(0, 400)}` }
  }
  // ULIP says "Success" on the outside but the government system behind it
  // failed, e.g. { responseStatus: 'ERROR', message: { text: '3rd party API Error: Request Time out' } }.
  // That is a failure, not "no record".
  const first = Array.isArray(body?.response) ? body.response[0] : null
  const innerText = typeof first?.message === 'string' ? first.message : first?.message?.text
  const innerPayload = first?.response
  if (
    (innerText && /3rd party|third party|time ?out|timed out|service is down|not reachable|unavailable/i.test(innerText)) ||
    (typeof innerPayload === 'string' && /3rd party|third party|time ?out|timed out|service is down|not reachable|unavailable/i.test(innerPayload))
  ) {
    const why = innerText || innerPayload
    return { ok: false, status, body, error: `The government system did not answer (${why}) | ${JSON.stringify(body).slice(0, 400)}` }
  }
  return { ok: true, status, body }
}

const failText = (err: any) => (err?.name === 'AbortError' ? 'ULIP did not answer in time' : (err?.message || 'ULIP unreachable'))

// Calls one ULIP API (e.g. 'ICEGATE/03') and records the call in ulip_calls
export async function callUlip(admin: SupabaseClient, api: string, payload: unknown, ctx: Ctx): Promise<UlipResult> {
  const requestStart = ctx.requestStart ?? Date.now()
  const capMsg = await overCap(admin, ctx.userId)
  if (capMsg) return { ok: false, status: 0, body: null, error: capMsg, refused: true }

  let auth: { token: string; issuedAt: number }
  try {
    auth = await getToken(admin, ctx)
  } catch (err: any) {
    return { ok: false, status: 0, body: null, error: err?.message || 'ULIP login problem', refused: true }
  }

  const callId = await startCall(admin, api, ctx)
  const started = Date.now()
  let result: UlipResult
  try {
    const first = await postToProxy(api, payload, auth.token)
    result = classify(first.status, first.body)

    if (first.status === 401) {
      // The saved login was refused: stop everyone using it (only if it is still the saved one)
      await admin.from('ulip_token').update({ expires_at: null }).eq('id', 1).eq('token', auth.token)
      // Try once more with a fresh login, only if the token was not brand new and there is time
      if (Date.now() - auth.issuedAt > 60_000 && Date.now() - requestStart < NO_RETRY_AFTER_MS) {
        await finishCall(admin, callId, 401, false, 'Saved ULIP login was refused; logging in again', Date.now() - started)
        try {
          auth = await getToken(admin, ctx, auth.token)
        } catch (err: any) {
          // A call did reach ULIP (the refused one), so this is a real failure, not "refused"
          return { ok: false, status: 401, body: first.body, error: err?.message || 'ULIP login problem' }
        }
        const retryId = await startCall(admin, api, ctx)
        const retryStart = Date.now()
        try {
          const second = await postToProxy(api, payload, auth.token)
          result = classify(second.status, second.body)
        } catch (err: any) {
          result = { ok: false, status: 0, body: null, error: failText(err) }
        }
        await finishCall(admin, retryId, result.status, result.ok, result.error ?? null, Date.now() - retryStart)
        return result
      }
    }
  } catch (err: any) {
    result = { ok: false, status: 0, body: null, error: failText(err) }
  }

  await finishCall(admin, callId, result.status, result.ok, result.error ?? null, Date.now() - started)
  return result
}

// Marks "this exact check is running" so a double click or two people
// pressing the same button do not make two ULIP calls. Returns a claim
// (pass it to releaseKey), or null if the check is already running.
export async function claimKey(admin: SupabaseClient, key: string, seconds = 150): Promise<string | null> {
  const now = new Date()
  const until = new Date(now.getTime() + seconds * 1000).toISOString()
  const ins = await admin.from('ulip_inflight').insert({ key, until })
  if (!ins.error) return until
  if (ins.error.code !== '23505') {          // anything but "already exists" — fail safe: refuse
    console.warn('[ulip] inflight insert failed:', ins.error.message)
    return null
  }
  const { data } = await admin.from('ulip_inflight').update({ until }).eq('key', key).lt('until', now.toISOString()).select('key')
  return data && data.length > 0 ? until : null
}

// Releases only our own claim (never one another request took over later)
export async function releaseKey(admin: SupabaseClient, key: string, claim: string | null) {
  if (!claim) return
  const { error } = await admin.from('ulip_inflight').delete().eq('key', key).eq('until', claim)
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
