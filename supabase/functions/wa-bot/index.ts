// JDS WhatsApp bot (official WhatsApp Cloud API, team members only).
// Reads SAVED portal data only: no AI, no ULIP calls.
//
// Three ways in:
//  1. GET  from Meta   → webhook check (Meta sends hub.verify_token once)
//  2. POST from Meta   → a team member wrote to the bot: answer them
//  3. POST from the scheduler with header x-bot-secret → { run: 'morning' | 'alerts' }
//
// Secrets (Supabase → Edge Functions → Secrets), set by Jose:
//   WHATSAPP_TOKEN        access token from Meta (never in code or chat)
//   WHATSAPP_PHONE_ID     Phone number ID of the bot's number
//   WHATSAPP_APP_SECRET   App secret (Meta app → Settings → Basic); checks messages really come from Meta
//   WHATSAPP_VERIFY_TOKEN any word you choose; typed again in Meta's webhook setup
//   BOT_CRON_SECRET       any long word; the scheduler sends it
//   BOT_SENDING           must be "on" to really send. Anything else = dry run (returns what it would send)
//   WHATSAPP_TEMPLATE_LANG optional, default "en"
import { adminClient, json } from '../_shared/ulip.ts'
import { buildJourneyData } from '../_shared/portal/journeyCore.js'
import { morningSummary, instantAlerts, answer, teamFromProfiles } from '../_shared/portal/botMessages.js'

const GRAPH = 'https://graph.facebook.com/v21.0'
const DAY = 24 * 60 * 60 * 1000
const PAGE = 1000
const env = (k: string) => Deno.env.get(k) || ''
const sendingOn = () => env('BOT_SENDING') === 'on'

type Admin = ReturnType<typeof adminClient>
type Person = { id: string; name: string; role: string; phone: string }
type Template = { name: string; values: string[] }

// ── data (same rows the portal loads) ──
async function readAll(build: () => any) {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if (!data || data.length < PAGE) return rows
  }
}

async function loadData(admin: Admin) {
  const since = new Date(Date.now() - 180 * DAY).toISOString()
  const [jobs, customs, results, containers] = await Promise.all([
    readAll(() => admin.from('jobs').select('*').order('job_no', { ascending: false })),
    readAll(() => admin.from('customs_status').select('*').order('job_id')),
    readAll(() => admin.from('ulip_results')
      .select('api, job_id, found, summary, parsed, params, checked_at, last_error, last_error_at')
      .not('job_id', 'is', null).gte('checked_at', since)
      .order('checked_at', { ascending: false, nullsFirst: false })),
    readAll(() => admin.from('container_tracking')
      .select('container_no, job_id, job_no, status, status_text, current_location, free_days, port_in, port_out, cfs_gate_in, milestones, last_refreshed_at')
      .order('container_no')),
  ])
  return buildJourneyData({ jobs, customs, results, containers })
}

async function loadTeam(admin: Admin): Promise<Person[]> {
  const { data, error } = await admin.from('profiles').select('id, name, email, role')
  if (error) throw new Error(error.message)
  return teamFromProfiles(data || [])
}

// ── sending ──
async function send(to: string, message: { text?: string; template?: Template }) {
  const body = message.text
    ? { messaging_product: 'whatsapp', to, type: 'text', text: { body: message.text.slice(0, 4000), preview_url: false } }
    : {
        messaging_product: 'whatsapp', to, type: 'template',
        template: {
          name: message.template!.name,
          language: { code: env('WHATSAPP_TEMPLATE_LANG') || 'en' },
          components: [{ type: 'body', parameters: message.template!.values.map((v) => ({ type: 'text', text: String(v).slice(0, 200) })) }],
        },
      }
  if (!sendingOn()) return { ok: true, dryRun: true, id: null, error: null }
  const res = await fetch(`${GRAPH}/${env('WHATSAPP_PHONE_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => ({}))
  return { ok: res.ok, dryRun: false, id: out?.messages?.[0]?.id || null, error: res.ok ? null : (out?.error?.message || `HTTP ${res.status}`) }
}

// Has this person written to the bot in the last 24 hours? Then a normal
// message is allowed; otherwise WhatsApp only allows an approved template.
async function windowOpen(admin: Admin, phone: string) {
  const { data } = await admin.from('bot_inbox').select('last_inbound_at').eq('phone', phone).maybeSingle()
  return !!data?.last_inbound_at && Date.now() - new Date(data.last_inbound_at).getTime() < 23.5 * 60 * 60 * 1000
}

// Sends once per key + person (an alert or a day's summary never repeats)
async function sendOnce(admin: Admin, key: string, person: Person, kind: string, message: { text: string; template: Template }) {
  const { error: claimErr } = await admin.from('bot_sent').insert({ key, phone: person.phone, kind, text: message.text })
  if (claimErr?.code === '23505') return { key, to: person.name, skipped: 'already sent' }
  if (claimErr) throw new Error(`bot_sent: ${claimErr.message} (run supabase/sql/009_whatsapp_bot.sql)`)
  const open = await windowOpen(admin, person.phone)
  const r = await send(person.phone, open ? { text: message.text } : { template: message.template })
  if (r.dryRun) await admin.from('bot_sent').delete().eq('key', key).eq('phone', person.phone) // dry runs leave no trace
  else await admin.from('bot_sent').update({ wa_message_id: r.id, error: r.error }).eq('key', key).eq('phone', person.phone)
  return { key, to: person.name, as: open ? 'text' : 'template', ...r, preview: open ? message.text : message.template }
}

// ── scheduled runs ──
async function runMorning(admin: Admin) {
  const [data, team] = await Promise.all([loadData(admin), loadTeam(admin)])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const out = []
  for (const person of team) out.push(await sendOnce(admin, `morning:${today}`, person, 'morning', morningSummary(data, person)))
  return out
}

async function runAlerts(admin: Admin) {
  const { data: state } = await admin.from('bot_state').select('alerts_checked_at').eq('id', 1).maybeSingle()
  const since = state?.alerts_checked_at || new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()
  const [data, team, events] = await Promise.all([
    loadData(admin), loadTeam(admin),
    readAll(() => admin.from('activity_log').select('*').gt('created_at', since).lte('created_at', now).order('created_at')),
  ])
  const out = []
  for (const alert of instantAlerts(data, events)) {
    for (const person of team) out.push(await sendOnce(admin, alert.key, person, alert.kind, alert))
  }
  if (sendingOn()) await admin.from('bot_state').upsert({ id: 1, alerts_checked_at: now })
  return out
}

// ── Meta webhook ──
async function validSignature(req: Request, raw: string) {
  const secret = env('WHATSAPP_APP_SECRET')
  const given = req.headers.get('x-hub-signature-256') || ''
  if (!secret || !given.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
  const hex = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('')
  const want = given.slice(7)
  if (hex.length !== want.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ want.charCodeAt(i)
  return diff === 0
}

async function handleInbound(admin: Admin, payload: any) {
  const messages = (payload?.entry || []).flatMap((e: any) => (e.changes || []).flatMap((c: any) => c.value?.messages || []))
  if (!messages.length) return // delivery receipts etc.
  const team = await loadTeam(admin)
  let data: any = null
  for (const m of messages) {
    const person = team.find((t) => t.phone === String(m.from))
    if (!person) continue // not a JDS team number: ignore silently
    await admin.from('bot_inbox').upsert({ phone: person.phone, last_inbound_at: new Date().toISOString() })
    const text = m.type === 'text' ? m.text?.body : m.type === 'button' ? m.button?.text : ''
    data ||= await loadData(admin)
    const reply = text ? answer(data, text, person) : 'Please send text: a job no, a container no, a BE no or SUMMARY.'
    await send(person.phone, { text: reply })
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // 1. Meta's one-time webhook check
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && !!env('WHATSAPP_VERIFY_TOKEN') &&
      url.searchParams.get('hub.verify_token') === env('WHATSAPP_VERIFY_TOKEN')
    return ok ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('Forbidden', { status: 403 })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const admin = adminClient()
  const raw = await req.text()

  // 3. scheduler
  const cron = req.headers.get('x-bot-secret')
  if (cron !== null) {
    if (!env('BOT_CRON_SECRET') || cron !== env('BOT_CRON_SECRET')) return json({ success: false, error: 'Not allowed' }, 403)
    let run = ''
    try { run = JSON.parse(raw || '{}').run } catch { /* below */ }
    try {
      if (run === 'morning') return json({ success: true, sending: sendingOn(), sent: await runMorning(admin) })
      if (run === 'alerts') return json({ success: true, sending: sendingOn(), sent: await runAlerts(admin) })
    } catch (e) {
      return json({ success: false, error: (e as Error).message }, 500)
    }
    return json({ success: false, error: 'run must be "morning" or "alerts"' }, 400)
  }

  // 2. a message from WhatsApp
  if (!(await validSignature(req, raw))) return new Response('Bad signature', { status: 401 })
  try {
    await handleInbound(admin, JSON.parse(raw))
  } catch (e) {
    console.error('[wa-bot] inbound failed:', (e as Error).message)
  }
  return new Response('ok', { status: 200 }) // always 200, or Meta keeps retrying
})
