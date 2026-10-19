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
import { morningSummary, instantAlerts, answer, teamFromProfiles, BOT_NUMBERS } from '../_shared/portal/botMessages.js'
import { askAssistant } from './assistant.ts'

const GRAPH = 'https://graph.facebook.com/v21.0'
const DAY = 24 * 60 * 60 * 1000
const PAGE = 1000
const env = (k: string) => (Deno.env.get(k) || '').trim() // pasted values often carry spaces or a line break
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

// Only the saved checks the job rules actually read (truck place, truck papers,
// vessel arrival, export LEO). Loading every saved ULIP answer was the slow part.
const USED_CHECKS = ['FASTAG/01', 'VAHAN/04', 'VAHAN/01', 'JNPT/01', 'MBPT/01', 'IPORTMAN/01',
  'ICEGATE/06', 'PCS/03', 'JNPT/03', 'ICEGATE/05', 'MBPT/03', 'IPORTMAN/03', 'ICEGATE/12']

async function loadData(admin: Admin) {
  const since = new Date(Date.now() - 180 * DAY).toISOString()
  const [jobs, customs, results, containers] = await Promise.all([
    readAll(() => admin.from('jobs').select('*').order('job_no', { ascending: false })),
    readAll(() => admin.from('customs_status').select('*').order('job_id')),
    readAll(() => admin.from('ulip_results')
      .select('api, job_id, found, summary, parsed, params, checked_at, last_error, last_error_at')
      .in('api', USED_CHECKS)
      .not('job_id', 'is', null).gte('checked_at', since)
      .order('checked_at', { ascending: false, nullsFirst: false })),
    readAll(() => admin.from('container_tracking')
      .select('container_no, job_id, job_no, status, status_text, current_location, free_days, port_in, port_out, cfs_gate_in, milestones, last_refreshed_at, shipping_line_ldb')
      .order('container_no')),
  ])
  return buildJourneyData({ jobs, customs, results, containers })
}

// For questions: reuse the data loaded in the last minute (the bot stays warm
// between messages), so a follow-up question doesn't wait for a fresh load.
// Scheduled alerts and the summary always load fresh.
const DATA_FRESH_MS = 6 * 60_000 // refreshed every 5 min by the 'warm' run
let dataCache: { at: number; data: any } | null = null
async function loadDataCached(admin: Admin) {
  if (dataCache && Date.now() - dataCache.at < DATA_FRESH_MS) return dataCache.data
  const data = await loadData(admin)
  dataCache = { at: Date.now(), data }
  return data
}

// Shows "typing…" in the person's chat (and marks their message read) right away
async function showTyping(messageId: string) {
  if (!sendingOn() || !messageId) return
  await fetch(`${GRAPH}/${env('WHATSAPP_PHONE_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId, typing_indicator: { type: 'text' } }),
  }).catch(() => {})
}

// AI replies sometimes use Markdown; turn it into WhatsApp formatting
// (**bold** → *bold*, headers → bold lines, "- " / "* " bullets → "• ")
function toWhatsApp(s: string) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '_$1_')
    .replace(/^#{1,6}\s*(.+)$/gm, '*$1*')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\*{2,}/g, '*')
    .trim()
}

// the team list rarely changes: keep it for 5 minutes
let teamCache: { at: number; team: Person[] } | null = null
async function loadTeam(admin: Admin): Promise<Person[]> {
  if (teamCache && Date.now() - teamCache.at < 5 * 60_000) return teamCache.team
  const { data, error } = await admin.from('profiles').select('id, name, email, role')
  if (error) throw new Error(error.message)
  teamCache = { at: Date.now(), team: teamFromProfiles(data || []) }
  return teamCache.team
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
  // "typing…" first, before any database step (only for the bot's own numbers)
  const typingNow = new Map<string, Promise<void>>()
  for (const m of messages) if (m.id && BOT_NUMBERS.includes(String(m.from))) typingNow.set(m.id, showTyping(m.id))
  const team = await loadTeam(admin)
  let data: any = null
  for (const m of messages) {
    const person = team.find((t) => t.phone === String(m.from))
    if (!person) continue // not a JDS team number: ignore silently
    // WhatsApp resends a message when we are slow: answer each message once
    if (m.id) {
      const { error: dup } = await admin.from('bot_sent').insert({ key: `in:${m.id}`, phone: person.phone, kind: 'inbound' })
      if (dup?.code === '23505') continue
    }
    const started = Date.now()
    const typing = typingNow.get(m.id) || showTyping(m.id) // already started above
    const text = m.type === 'text' ? m.text?.body : m.type === 'button' ? m.button?.text : ''
    // the last few messages (so follow-ups make sense) and the portal data, loaded together
    const [inboxRes, loaded] = await Promise.all([
      admin.from('bot_inbox').select('history').eq('phone', person.phone).maybeSingle(),
      data ? Promise.resolve(data) : loadDataCached(admin),
      admin.from('bot_inbox').upsert({ phone: person.phone, last_inbound_at: new Date().toISOString() }),
      typing,
    ])
    data = loaded
    const history = Array.isArray(inboxRes?.data?.history) ? inboxRes.data.history : []
    if (!text) { await send(person.phone, { text: 'Please send text: ask a question, or a job no, a container no or SUMMARY.' }); continue }
    // fixed commands are instant and free; anything else goes to the assistant
    let reply = answer(data, text, person, new Date(), { fallback: false })
    if (!reply) {
      const aiStart = Date.now()
      const ai = await askAssistant(text, history, data, person)
      console.log(`[wa-bot] assistant: ${ai.note} | data ${aiStart - started} ms, AI ${Date.now() - aiStart} ms`)
      reply = ai.text ? toWhatsApp(ai.text) : "⏳ The AI is busy right now, so I couldn't answer that question. Please ask again in a minute.\n\nThese always work instantly: a job no (J-193), a container no, a BE no, SUMMARY or URGENT."
    }
    await send(person.phone, { text: reply })
    const next = [...history, { role: 'user', text: String(text).slice(0, 500) }, { role: 'model', text: String(reply).slice(0, 1500) }].slice(-10)
    await admin.from('bot_inbox').update({ history: next }).eq('phone', person.phone)
  }
}

// Meta only passes incoming messages to the bot if the WhatsApp account is
// "subscribed" to the app. Make sure of that once each time the bot starts,
// using the bot's own key, and write the outcome to the log (never the key).
const WABA_ID = '1646613459995849'
const APP_ID = '1971564977582223' // JDS portal bot
let subscribeChecked = false
async function ensureSubscribed() {
  if (subscribeChecked || !env('WHATSAPP_TOKEN')) return
  subscribeChecked = true
  try {
    const auth = { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}` }
    const before = await fetch(`${GRAPH}/${WABA_ID}/subscribed_apps`, { headers: auth }).then((r) => r.json()).catch(() => ({}))
    if (before?.error) { console.warn(`[wa-bot] subscription check failed: ${before.error.message}`); return }
    const apps = (before?.data || []).map((d: any) => d?.whatsapp_business_api_data || {})
    const names = apps.map((d: any) => d.name || d.id).filter(Boolean).join(', ') || 'no app'
    // other apps on the account (e.g. Container-JDS-Tracking) are left as they are
    if (apps.some((d: any) => String(d.id) === APP_ID)) { console.log(`[wa-bot] WhatsApp account sends messages to: ${names} (includes this bot)`); return }
    console.log(`[wa-bot] WhatsApp account sends messages to: ${names}, not to this bot. Adding it.`)
    const res = await fetch(`${GRAPH}/${WABA_ID}/subscribed_apps`, { method: 'POST', headers: auth }).then((r) => r.json()).catch(() => ({}))
    console.log(`[wa-bot] subscribed the WhatsApp account to the app: ${res?.success ? 'yes' : `no (${res?.error?.message || 'unknown'})`}`)
  } catch (e) {
    console.warn(`[wa-bot] subscription check error: ${(e as Error).message}`)
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  await ensureSubscribed()

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
    // the scheduler's password: the BOT_CRON_SECRET secret, or the one the database
    // made for its own schedule (bot_state.cron_token, never shown to anyone)
    const { data: st } = await admin.from('bot_state').select('cron_token').eq('id', 1).maybeSingle()
    const allowed = [env('BOT_CRON_SECRET'), String(st?.cron_token || '').trim()].filter((v) => v.length >= 20)
    if (!cron || !allowed.includes(cron.trim())) return json({ success: false, error: 'Not allowed' }, 403)
    let run = ''
    try { run = JSON.parse(raw || '{}').run } catch { /* below */ }
    try {
      if (run === 'morning') return json({ success: true, sending: sendingOn(), sent: await runMorning(admin) })
      if (run === 'alerts') return json({ success: true, sending: sendingOn(), sent: await runAlerts(admin) })
      // keep the bot started, with the team list and portal data already loaded
      if (run === 'warm') { dataCache = null; await Promise.all([loadTeam(admin), loadDataCached(admin)]); return json({ success: true, warm: true }) }
    } catch (e) {
      return json({ success: false, error: (e as Error).message }, 500)
    }
    return json({ success: false, error: 'run must be "morning" or "alerts"' }, 400)
  }

  // 2. a message from WhatsApp
  if (!(await validSignature(req, raw))) {
    // says WHY, never the secret itself
    const sig = req.headers.get('x-hub-signature-256')
    const secret = env('WHATSAPP_APP_SECRET')
    console.warn(`[wa-bot] bad signature: header ${sig ? 'present' : 'missing'}; app secret ${secret ? `set, ${secret.length} chars (Meta's are 32)${/^[0-9a-f]+$/.test(secret) ? '' : ', has characters other than 0-9 a-f'}` : 'not set'}; token ${env('WHATSAPP_TOKEN').length} chars`)
    return new Response('Bad signature', { status: 401 })
  }
  // reply in the background: Meta gets its 200 at once (it retries slow answers)
  let payload: unknown = null
  try { payload = JSON.parse(raw) } catch { return new Response('ok', { status: 200 }) }
  const work = handleInbound(admin, payload).catch((e) => console.error('[wa-bot] inbound failed:', (e as Error).message))
  // @ts-ignore EdgeRuntime is provided by Supabase
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work)
  else await work
  return new Response('ok', { status: 200 }) // always 200, or Meta keeps retrying
})
