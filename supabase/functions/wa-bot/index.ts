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
import { buildJourneyData, buildSeaByJob } from '../_shared/portal/journeyCore.js'
import { morningSummary, instantAlerts, answer, teamFromProfiles, BOT_NUMBERS, missingDetails, allowed, LEVELS, LEVEL_LABEL } from '../_shared/portal/botMessages.js'
import { askAssistant, groqInfo } from './assistant.ts'
import { applyChange, confirmText, isNo, isYes, PENDING_MINUTES, prepareChange, type Pending } from './actions.ts'
import { downloadMedia, transcribe, normalizeSpoken, docTypeFromName, jobFromText, safeName, MAX_FILE_BYTES } from './media.ts'
import { makeServerTools, sendDueReminders, checkWatches, checkTasks } from './servertools.ts'
import { readBeFile, jobForBe, beLine } from './bereader.ts'
import { readDocFile, jobForDoc, docFill, fillArgs } from './docfill.ts'
import { pushAlerts, pushTest } from './push.ts'
import { handlePost, undoPost, isUndo, UNDO_MINUTES } from './posts.ts'
import { runQuestions, answerQuestion, questionsDue } from './questions.ts'

const PORTAL = 'https://jds-portal-prototype.vercel.app'

const GRAPH = 'https://graph.facebook.com/v21.0'
const DAY = 24 * 60 * 60 * 1000
const PAGE = 1000
const env = (k: string) => (Deno.env.get(k) || '').trim() // pasted values often carry spaces or a line break
const sendingOn = () => env('BOT_SENDING') === 'on'

type Admin = ReturnType<typeof adminClient>
type Person = { id: string; name: string; role: string; phone: string; level?: string }
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
  'ICEGATE/06', 'PCS/03', 'JNPT/03', 'ICEGATE/05', 'MBPT/03', 'IPORTMAN/03', 'ICEGATE/12',
  'ICEGATE/07', 'ICEGATE/01'] // (07/01: the ship's IMO from the IGM, for ship questions)

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
      .select('container_no, job_id, job_no, status, status_text, current_location, free_days, port_in, port_out, cfs_gate_in, milestones, last_refreshed_at, shipping_line_ldb, container_size, vessel, terminal, eta')
      .order('container_no')),
  ])
  const data: any = buildJourneyData({ jobs, customs, results, containers })
  // extras for the assistant only (what happened, which papers, who): a failure here
  // must never stop alerts or the summary
  const month = new Date(Date.now() - 30 * DAY).toISOString()
  const [activity, documents, people, ships] = await Promise.all([
    readAll(() => admin.from('activity_log').select('action, type, title, note, job_no, job_id, done_by_name, user_name, created_at')
      .gte('created_at', month).order('created_at', { ascending: false })).catch(() => []),
    // file names and types only: never the files or their links
    readAll(() => admin.from('documents').select('job_id, job_no, file_name, doc_type, uploaded_by_name, created_at').order('created_at', { ascending: false })).catch(() => []),
    readAll(() => admin.from('profiles').select('id, name').order('id')).catch(() => []),
    // ship numbers and last-heard positions from the vessel-track finder
    readAll(() => admin.from('vessel_positions').select('name, mmsi, imo, candidates, lat, lon, sog, nav_status, destination, seen_at').order('name')).catch(() => []),
  ])
  data.shipIds = Object.fromEntries(ships.map((r: any) => [r.name, r]))
  // ETA, ship and position from Safecube (sea-track function)
  const sea = await readAll(() => admin.from('sea_tracking').select('*').order('job_id')).catch(() => [])
  // shared rule, as in the portal: rows about an older voyage of the ship are left out
  data.seaByJob = buildSeaByJob(sea, jobs)
  data.activity = activity
  data.documents = documents
  data.people = Object.fromEntries(people.map((p: any) => [p.id, p.name]))
  return data
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
    // bold inside a bold line ("*Only one is *PORT OUT*:*") breaks in WhatsApp: one bold line
    .replace(/^\*(.*\*.*)\*(:?)$/gm, (_m, inner: string, colon: string) => `*${inner.replace(/\*/g, '')}*${colon}`)
    .replace(/^\[checked:.*\]$/gm, '') // the bot's own note, never shown
    .trim()
}

// the team list rarely changes: keep it for 5 minutes
let teamCache: { at: number; team: Person[] } | null = null
async function loadTeam(admin: Admin): Promise<Person[]> {
  if (teamCache && Date.now() - teamCache.at < 5 * 60_000) return teamCache.team
  const [{ data, error }, extra] = await Promise.all([
    admin.from('profiles').select('id, name, email, role'),
    // numbers an admin added from WhatsApp, with their access level
    admin.from('bot_people').select('phone, name, level').then((r: any) => r.data || []),
  ])
  if (error) throw new Error(error.message)
  teamCache = { at: Date.now(), team: teamFromProfiles(data || [], extra) }
  return teamCache.team
}

// ── sending ──
// buttons: up to 3 tap buttons under the text (e.g. Yes / No). list: a menu to pick
// from (up to 10 rows). A tap comes back as its id, handled like a typed message.
type Button = { id: string; title: string }
type ListRow = { id: string; title: string; description?: string }
type Message = { text?: string; template?: Template; buttons?: Button[]; list?: { button: string; rows: ListRow[] } }
async function send(to: string, message: Message) {
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  const interactive = message.text && message.buttons?.length
    ? {
        type: 'button', body: { text: cut(message.text, 1024) },
        action: { buttons: message.buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: cut(b.id, 256), title: cut(b.title, 20) } })) },
      }
    : message.text && message.list?.rows.length
      ? {
          type: 'list', body: { text: cut(message.text, 1024) },
          action: { button: cut(message.list.button, 20), sections: [{ title: 'Choose', rows: message.list.rows.slice(0, 10).map((r) => ({ id: cut(r.id, 200), title: cut(r.title, 24), ...(r.description ? { description: cut(r.description, 72) } : {}) })) }] },
        }
      : null
  // text longer than an interactive message allows: send it as plain text
  if (interactive && message.text!.length > 1024) {
    const first = await send(to, { text: message.text })
    if (!first.ok) return first
    return await send(to, { ...message, text: message.buttons ? 'Tap one:' : 'Pick one:' })
  }
  const body = interactive
    ? { messaging_product: 'whatsapp', to, type: 'interactive', interactive }
    : message.text
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
  // buttons refused for any reason: the same message as plain text (the person can type YES / NO)
  if (!res.ok && interactive) {
    console.warn(`[wa-bot] interactive message refused (${out?.error?.message || res.status}); sending text`)
    return await send(to, { text: message.text })
  }
  return { ok: res.ok, dryRun: false, id: out?.messages?.[0]?.id || null, error: res.ok ? null : (out?.error?.message || `HTTP ${res.status}`) }
}
const YES_NO: Button[] = [{ id: 'YES', title: '✅ Yes' }, { id: 'NO', title: '❌ No' }]

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
  // free only (Jose, 24 Oct 2026: no payment method): a paid template is never sent.
  // Outside the 24-hour window the message waits and goes out with the person's next message.
  if (!open && !PAID_TEMPLATES) {
    await admin.from('bot_sent').update({ error: HELD }).eq('key', key).eq('phone', person.phone)
    return { key, to: person.name, as: 'held', held: true }
  }
  const r = await send(person.phone, open ? { text: message.text } : { template: message.template })
  if (r.dryRun) await admin.from('bot_sent').delete().eq('key', key).eq('phone', person.phone) // dry runs leave no trace
  else await admin.from('bot_sent').update({ wa_message_id: r.id, error: r.error }).eq('key', key).eq('phone', person.phone)
  return { key, to: person.name, as: open ? 'text' : 'template', ...r, preview: open ? message.text : message.template }
}
// paid templates only if the secret BOT_PAID_TEMPLATES=on (needs a payment method in Meta)
const PAID_TEMPLATES = env('BOT_PAID_TEMPLATES') === 'on'
const HELD = 'held: 24-hour window closed'

// The messages held while the window was closed (last 2 days), sent as one message
// right after the person writes again. Older ones are dropped as stale.
async function sendHeld(admin: Admin, person: Person) {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: rows } = await admin.from('bot_sent').select('key, kind, text, sent_at').eq('phone', person.phone).eq('error', HELD).gte('sent_at', since).order('sent_at')
  if (!rows?.length) return
  // one short line per message, newest last (Jose, 31 Oct 2026: the full messages
  // pasted one after another were too much to read). The morning summary becomes one
  // line; the missing-details list is left out (the next morning repeats it).
  const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
  const news = rows.filter((r: any) => r.kind !== 'morning' && r.kind !== 'missing')
  const line = (t: string) => {
    const ls = String(t || '').split('\n').map((x) => x.replace(/[*_]/g, '').trim()).filter(Boolean)
    const head = ls[0]?.replace(/^🔔\s*/, '') || ''
    const body = ls.slice(1).join(' ').replace(/\s+/g, ' ')
    const one = body ? `${head}: ${body}` : head
    return one.length > 110 ? `${one.slice(0, 107)}…` : one
  }
  const MAX = 8
  const shown = news.slice(-MAX).map((r: any) => `• ${when(r.sent_at)} ${line(r.text)}`)
  const more = news.length > MAX ? `\n_+${news.length - MAX} earlier, in the portal bell_` : ''
  // the summary as one line: how much is urgent, and how to see it
  const summary = [...rows].reverse().find((r: any) => r.kind === 'morning')
  const count = (re: RegExp) => Number(String(summary?.text || '').match(re)?.[1] || 0)
  const sumLine = summary ? `☀️ 8 am summary: ${count(/Urgent \((\d+)\)/)} urgent, ${count(/To do today \((\d+)\)/)} to do · reply *today* to see it` : ''
  const text = news.length || summary
    ? [`📬 *While you were away*`, ...shown, more.trim(), sumLine].filter(Boolean).join('\n')
    : null
  if (!text) {
    await admin.from('bot_sent').update({ error: 'held, dropped (overview only)' }).eq('phone', person.phone).eq('error', HELD)
    return
  }
  const r = await send(person.phone, { text })
  if (!r.error) await admin.from('bot_sent').update({ error: 'held, then sent together', wa_message_id: r.id || null }).eq('phone', person.phone).eq('error', HELD)
}

// ── scheduled runs ──
async function runMorning(admin: Admin) {
  const [data, team] = await Promise.all([loadData(admin), loadTeam(admin)])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const out = []
  for (const person of team) {
    const summary = morningSummary(data, person)
    // free only: tomorrow's summary can reach them only if they write within 24 hours
    const text = PAID_TEMPLATES ? summary.text : `${summary.text}\n\n_Reply "ok" to get tomorrow's summary._`
    out.push(await sendOnce(admin, `morning:${today}`, person, 'morning', { ...summary, text }))
  }
  // then the details missing on their jobs, with a tap list (the list only goes
  // inside WhatsApp's 24-hour window; outside it the alert template carries the text)
  for (const person of team) {
    if (!allowed(person, 'change')) continue // view only: nothing they could fill in
    const miss = missingDetails(data, person)
    if (!miss.text) continue
    const r: any = await sendOnce(admin, `missing:${today}`, person, 'missing', { text: miss.text, template: { name: 'jds_alert', values: ['details', miss.text.replace(/\*/g, '').replace(/\n+/g, ' ').slice(0, 900), 'SUMMARY'] } })
    out.push(r)
    if (r?.as === 'text' && !r?.skipped && miss.rows.length) await send(person.phone, { text: 'Add a missing detail:', list: { button: 'Choose', rows: miss.rows } })
  }
  return out
}

async function runAlerts(admin: Admin) {
  const { data: state } = await admin.from('bot_state').select('alerts_checked_at').eq('id', 1).maybeSingle()
  const since = state?.alerts_checked_at || new Date(Date.now() - 60 * 60 * 1000).toISOString()
  // read only up to 2 minutes ago: the container refresh runs at the same moment and
  // stamps its record a split second before saving it, so a record still being saved
  // fell before the next run's start and was never sent (Jose, 31 Oct 2026: J-691's
  // PORT OUT at 1:30 am reached the bell but not WhatsApp)
  const now = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const [data, team, events] = await Promise.all([
    loadData(admin), loadTeam(admin),
    readAll(() => admin.from('activity_log').select('*').gt('created_at', since).lte('created_at', now).order('created_at')),
  ])
  const out = []
  const alerts = instantAlerts(data, events)
  // desktop notifications first (they don't depend on WhatsApp working)
  const pushed = await pushAlerts(admin, alerts).catch((e) => ({ error: (e as Error).message }))
  console.log(`[wa-bot] desktop alerts: ${JSON.stringify(pushed)}`)
  for (const alert of alerts) {
    for (const person of team) out.push(await sendOnce(admin, alert.key, person, alert.kind, alert))
  }
  if (sendingOn()) await admin.from('bot_state').upsert({ id: 1, alerts_checked_at: now })
  // the bot's calm questions (only when the BOT_ASKING switch is on; questions.ts)
  await runQuestions(admin, data, team, questionDeps(admin)).catch((e) => console.warn(`[wa-bot] questions: ${(e as Error).message}`))
  return out
}

// what the question run needs from here: sending one message, and the 24-hour window
const questionDeps = (admin: Admin) => ({
  send: async (p: Person, text: string) => (await send(p.phone, { text })).ok === true,
  windowOpen: (phone: string) => windowOpen(admin, phone),
})
// "Is J-583 delivered?" answered YES: the same change as "mark J-583 delivered"
async function markDeliveredFor(admin: Admin, person: Person, data: any, jobNo: string) {
  const r = prepareChange({ action: 'mark_delivered', job: jobNo }, data, person)
  return r.ok ? await applyChange(admin, r.pending, person) : `Couldn't mark ${jobNo} delivered: ${r.error}`
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

// ── "check customs now", asked by a person (Jose, 23 Oct 2026) ──
// If the job was checked in the last 30 minutes, that answer is given and Customs
// is not asked again. Otherwise ONE check runs through the portal's own
// customs-status function (same traffic rules) and the result goes to the person
// as a second message.
const BOT_CHECK_GAP_MIN = 30
const istWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const istDay = (iso: string) => new Date(String(iso).length <= 10 ? `${iso}T12:00:00+05:30` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

function customsChecker(admin: Admin, person: Person, data: any, opts: { test?: boolean; notify?: (text: string) => Promise<unknown> } = {}) {
  return async (ref: string) => {
    const want = String(ref || '').replace(/\D/g, '')
    const job = (data?.jobs || []).find((j: any) => String(j.job_no || '').replace(/\D/g, '') === want)
    if (!want || !job) return { not_found: ref }
    if (job.job_type === 'export') return { not_possible: `${job.job_no} is an export job; this check is for import BEs.` }
    if (!/^\d{7}$/.test(String(job.be_no || '').trim()) || !job.be_date) return { not_possible: `${job.job_no} has no BE number and date yet, so Customs cannot be asked.` }
    const { data: cs } = await admin.from('customs_status').select('be_no, checked_at, ooc_no, ooc_date').eq('job_id', job.id).maybeSingle()
    const sameBe = !!cs && String(cs.be_no) === String(job.be_no)
    const mins = sameBe && cs.checked_at ? (Date.now() - new Date(cs.checked_at).getTime()) / 60000 : Infinity
    if (mins < BOT_CHECK_GAP_MIN) {
      return {
        checked_recently: true, last_checked: istWhen(cs.checked_at), minutes_ago: Math.round(mins),
        answer: cs.ooc_date ? `OOC granted${cs.ooc_no ? `, OOC ${cs.ooc_no}` : ''} dated ${istDay(cs.ooc_date)}` : 'OOC not granted yet',
        asked_customs_now: false,
        tell_the_person: 'Customs was NOT asked again now: it was checked less than 30 minutes ago. Give this answer, say when it was checked, and do not call it a fresh or live check.',
      }
    }
    if (opts.test) return { started: true, test_mode: 'test mode: Customs was NOT asked', tell_the_person: 'Say you are checking with Customs now and the result will follow in a separate message.' }
    // asked now and answered in this same reply (about a minute; WhatsApp shows typing):
    // no "checking with Customs now…" message first (Jose, 1 Nov 2026)
    // Customs takes about a minute: one short line first, then the answer (Jose, 1 Nov 2026)
    await opts.notify?.(`🛃 Checking ${job.job_no} with Customs, this takes a minute…`).catch(() => {})
    const text = await runCustomsCheck(admin, person, job, false)
    return { checked_now: true, say_text: text, tell_the_person: 'Customs was asked just now and the bot\'s own message already gives the result; add nothing unless asked.' }
  }
}

// "Did you actually refresh / check?": answered from the record of the bot's
// last reply (its [checked: …] note), never by the AI, so it is always true
const ASKS_IF_CHECKED = /\b(did|have|had)\s+(you|u)\b[^?]{0,30}\b(refresh|re-?check|check|pull)|\b(actually|really|truly)\s+(refresh|re-?check|check)/i
function honestCheckReply(text: string, history: { role: string; text: string }[]): string | null {
  // (a question naming a job, "did you check 509?", is a request: the AI handles it)
  if (!ASKS_IF_CHECKED.test(String(text || '')) || /\bJ-?\s?\d+|\b\d{3,7}\b/i.test(String(text || ''))) return null
  const last = [...history].reverse().find((t) => t.role === 'model')?.text || ''
  const note = (last.match(/\[checked:([^\]]*)\]/) || [])[1] || ''
  const m = note.match(/check_customs_now\s*(\{[^}]*\})\s*→\s*([^;]*)/)
  const job = m ? (String(m[1]).match(/"job"\s*:\s*"([^"]+)"/) || [])[1] || 'that job' : null
  if (m && /Customs asked now/.test(m[2])) return `Yes. I asked Customs for ${job} just then; my reply gave what Customs said.`
  if (m && /NOT asked again/.test(m[2])) {
    const at = (m[2].match(/at ([^)]+)\)/) || [])[1]
    return `No, Customs was not asked again just then: ${job} had already been checked${at ? ` at ${at}` : ''}, and Customs is asked at most once every 30 minutes per job. My answer was from that check.`
  }
  return 'No. That answer was from the data the portal had already saved; I did not ask Customs. Say "check J-… again" and I will ask Customs (at most once every 30 minutes per job).'
}

// One check through the portal's customs-status function; returns the message
async function runCustomsCheck(admin: Admin, person: Person, job: any, deliver: boolean): Promise<string> {
  let text: string
  try {
    const { data: st } = await admin.from('bot_state').select('cron_token').eq('id', 1).maybeSingle()
    const anon = env('SUPABASE_ANON_KEY')
    const res = await fetch(`${env('SUPABASE_URL')}/functions/v1/customs-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anon}`, apikey: anon, 'x-bot-secret': String(st?.cron_token || '') },
      body: JSON.stringify({ jobId: job.id, asId: person.id || null, asName: `${person.name} via WhatsApp` }),
      signal: AbortSignal.timeout(110_000),
    })
    const out = await res.json().catch(() => ({}))
    const row = out?.data
    if (out?.success && row) {
      const when = out.cached && row.checked_at ? `checked ${istWhen(row.checked_at)}` : 'checked just now'
      text = row.ooc_date
        ? `✅ *${job.job_no}*: Customs says *OOC granted*${row.ooc_no ? `, OOC ${row.ooc_no}` : ''} dated ${istDay(row.ooc_date)} (${when}).`
        : `*${job.job_no}*: ${when} with Customs: *OOC not granted yet* (BE ${job.be_no}).`
    } else {
      text = `*${job.job_no}*: the Customs check did not work (${String(out?.error || `error ${res.status}`).slice(0, 160)}). Try again in a few minutes, or press Check on the BE & OOC page.`
    }
  } catch (e) {
    text = `*${job.job_no}*: the Customs check did not finish (${(e as Error).message}). Try again in a few minutes, or press Check on the BE & OOC page.`
  }
  dataCache = null // the next answers read the fresh result
  if (deliver) await send(person.phone, { text })
  return text
}

// A message to a teammate (a task): a normal message inside WhatsApp's 24-hour
// window, else the approved alert template
async function tellTeammate(admin: Admin, team: Person[], phone: string, text: string, jobNo: string | null) {
  const mate = team.find((t) => t.phone === phone)
  if (!mate) return
  await sendOnce(admin, `task:${Date.now()}:${phone}`, mate, 'task', { text, template: { name: 'jds_alert', values: [jobNo || 'task', text.replace(/\*/g, '').replace(/\n+/g, ' '), jobNo || 'SUMMARY'] } })
}

// "Done" from the person a task was given to: closes it and tells whoever asked
const SAYS_DONE = /^\s*(done|completed|finished|filed|ho\s*gaya|hogaya|kar\s*diya|kardiya|ho\s*gya)\b/i
async function taskDoneReply(admin: Admin, team: Person[], person: Person, text: string): Promise<string | null> {
  if (!SAYS_DONE.test(text)) return null
  const { data: open } = await admin.from('bot_tasks').select('*').eq('to_phone', person.phone).eq('status', 'open').order('created_at', { ascending: false })
  if (!open?.length) return null
  const no = (text.match(/\bJ-?\s?(\d{1,5})\b/i) || [])[1]
  const task = no ? open.find((t: any) => String(t.job_no || '').replace(/\D/g, '') === no) : open[0]
  if (!task) return `Which task? Open ones: ${open.map((t: any) => `${t.job_no}: ${t.text}`).join('; ')}`
  await admin.from('bot_tasks').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', task.id)
  await tellTeammate(admin, team, task.from_phone, `✅ *${person.name}* says done (${task.job_no}): ${task.text}`, task.job_no)
  return `👍 Marked done: ${task.text} (${task.job_no}). ${task.from_name || 'They'} ${task.from_name ? 'has' : 'have'} been told.${open.length > 1 ? `\nStill open: ${open.filter((t: any) => t.id !== task.id).map((t: any) => `${t.job_no}: ${t.text}`).join('; ')}` : ''}`
}

// The words Whisper should expect: open job numbers and client names
function voiceWords(data: any): string {
  const open = (data?.jobs || []).filter((j: any) => Number(j.stage) < 10)
  const nos = open.map((j: any) => j.job_no).filter(Boolean).slice(0, 40)
  const clients = [...new Set(open.map((j: any) => String(j.client || '').trim()).filter(Boolean))].slice(0, 25)
  return `Jobs: ${nos.join(', ')}. Clients: ${clients.join(', ')}.`
}

// A file sent to the bot (Jose, 24 Oct 2026): kept in the PRIVATE document
// storage (never given to any AI), then attached to a job after a YES. A new job
// is made from it in the portal's Create job, where the PDF reader fills the form.
async function handleFile(admin: Admin, person: Person, m: any, data: any) {
  const media = m.document || m.image
  const name = m.document?.filename || `photo_${new Date().toISOString().slice(0, 10)}.jpg`
  const caption = String(media?.caption || '')
  const reply = async (text: string, userText: string, buttons?: Button[]) => {
    await send(person.phone, buttons ? { text, buttons } : { text })
    const { data: inbox } = await admin.from('bot_inbox').select('history').eq('phone', person.phone).maybeSingle()
    const history = Array.isArray(inbox?.history) ? inbox.history : []
    const next = [...history, { role: 'user', text: userText }, { role: 'model', text: text.slice(0, 1500) }].slice(-10)
    await admin.from('bot_inbox').update({ history: next }).eq('phone', person.phone)
  }
  const userText = `[sent a file: ${name}${caption ? ` — "${caption}"` : ''}]`
  let file: { bytes: Uint8Array; mime: string }
  try { file = await downloadMedia(media.id) } catch (e) { await reply(`📎 Sorry, I could not get that file (${(e as Error).message}).`, userText); return }
  if (file.bytes.length > MAX_FILE_BYTES) { await reply('📎 That file is over 10 MB. Please upload it in the portal.', userText); return }
  const path = `whatsapp/${person.phone}/${Date.now()}_${safeName(name)}`
  const { error: upErr } = await admin.storage.from('job-documents').upload(path, file.bytes, { contentType: file.mime || 'application/octet-stream', upsert: false })
  if (upErr) { await reply(`📎 Sorry, I could not keep that file (${upErr.message}).`, userText); return }
  const docType = docTypeFromName(`${caption} ${name}`)
  const lastFile = { path, file_name: name, mime: file.mime, size: file.bytes.length, doc_type: docType, at: new Date().toISOString() }
  await admin.from('bot_inbox').upsert({ phone: person.phone, last_file: lastFile, pending: null, last_inbound_at: new Date().toISOString() })
  const createLink = `${PORTAL}/admin?tab=jobs&createFrom=${encodeURIComponent(path)}`
  // a PDF: read by the portal's own reader (no AI, the same as Create job): a BE / OOC, BL,
  // air waybill, invoice, packing list or a bundle. One Yes / No for everything it shows:
  // attach it, record the BE and IGM, the OOC, and fill the job's empty fields
  const isPdf = /pdf/i.test(file.mime) || /\.pdf$/i.test(name)
  const doc = isPdf ? await readDocFile(file.bytes).catch((e) => { console.warn(`[wa-bot] doc reader: ${(e as Error).message}`); return null }) : null
  const be = doc?.be || null
  if (doc && (be || doc.types.length || doc.fields.bl_no || doc.fields.containers.length)) {
    lastFile.doc_type = be ? (be.copy_type === 'OOC' ? 'OOC' : 'BE') : docType || doc.types[0] || 'Other'
    await admin.from('bot_inbox').update({ last_file: lastFile }).eq('phone', person.phone)
    const f = doc.fields
    const what = be ? beLine(be) : [doc.found || lastFile.doc_type, f.bl_no ? `${doc.types.includes('BL') && !f.vessel && /^\d{11}$/.test(String(f.bl_no)) ? 'AWB' : 'BL'} ${f.bl_no}` : null, f.containers.length ? `${f.containers.length === 1 ? 'container' : `${f.containers.length} containers`} ${f.containers.slice(0, 3).join(', ')}${f.containers.length > 3 ? '…' : ''}` : null].filter(Boolean).join(' · ')
    const named = jobFromText(`${caption} ${name}`, data?.jobs || [])
    const match = named ? { job: named, how: 'the file name' } : (be ? jobForBe(be, data?.jobs || []) : null) || jobForDoc(doc, data?.jobs || [])
    if (!match) {
      await reply(`📎 Got *${name}*: ${what}.\n\nNo open job has this ${be ? 'BE, ' : ''}BL or container. Which job is it for (e.g. "J-652")?\nOr create a new job from it: ${createLink}`, userText)
      return
    }
    const j = match.job
    const items: Pending[] = []
    const att = prepareChange({ action: 'attach_document', job: j.job_no, doc_type: lastFile.doc_type }, data, person, { lastFile })
    if (att.ok) items.push(att.pending)
    if (be && (String(j.be_no || '') !== String(be.be_no) || !j.be_date)) {
      const r = prepareChange({ action: 'record_be', job: j.job_no, be_no: be.be_no, be_date: be.be_date }, data, person)
      if (r.ok) items.push({ ...r.pending, args: { ...r.pending.args, igm_no: be.igm_no || null, igm_date: be.igm_date || null, from_file: true } })
    }
    // everything else the papers give (containers, BL, ship, line, port, goods, arrival …):
    // the job's empty fields, as Create job fills them (Jose, 1 Nov 2026)
    const fill = docFill(f, j)
    if (fill.said.length) items.push({ action: 'fill_from_doc', job_id: j.id, job_no: j.job_no, args: { fields: fillArgs(f) }, summary: `Fill ${j.job_no} from it: ${fill.said.join(' · ')}`, at: new Date().toISOString() })
    if (be?.copy_type === 'OOC' && be.ooc_no && be.ooc_date && Number(j.stage) < 7) {
      const r = prepareChange({ action: 'record_ooc', job: j.job_no, ooc_no: be.ooc_no, ooc_date: be.ooc_date }, data, person)
      if (r.ok) items.push(r.pending)
    }
    const warn = fill.mismatch ? `\n\n⚠ I didn't fill anything from it: ${fill.mismatch}. Is it really ${j.job_no}'s?` : ''
    if (!items.length) { await reply(`📎 Got *${name}*: ${what}. ${j.job_no} already has this file and everything in it, so nothing needs changing.${warn}`, userText); return }
    const pending: Pending = items.length === 1 ? items[0] : {
      action: 'batch', job_id: j.id, job_no: j.job_no, args: { items },
      summary: `${items.length} changes:\n${items.map((x) => `• ${x.summary}`).join('\n')}`, at: new Date().toISOString(),
    }
    await admin.from('bot_inbox').update({ pending }).eq('phone', person.phone)
    await reply(`📎 Got *${name}*: ${what}.\nIt matches *${j.job_no}* (${j.client || 'no client'}) by ${match.how}.${warn}\n\n${confirmText(pending)}\n\nWrong job? Just say it, e.g. "it is J-652".`, userText, YES_NO)
    return
  }
  const job = jobFromText(`${caption} ${name}`, data?.jobs || [])
  if (job && docType) {
    const res = prepareChange({ action: 'attach_document', job: job.job_no, doc_type: docType }, data, person, { lastFile })
    if (res.ok) {
      await admin.from('bot_inbox').update({ pending: res.pending }).eq('phone', person.phone)
      await reply(`📎 Got *${name}*.\n\n${confirmText(res.pending)}\n\nWrong job or type? Just say it, e.g. "J-652 as BL".\nA new job instead? Open: ${createLink}`, userText, YES_NO)
      return
    }
    await reply(`📎 Got *${name}* and kept it safely. ${res.error}`, userText)
    return
  }
  await reply(`📎 Got *${name}* and kept it safely.\n\nWhich job is it for, and what is it? For example: "J-652, BE".\nOr create a new job from it: ${createLink}`, userText)
}

async function handleInbound(admin: Admin, payload: any) {
  const messages = (payload?.entry || []).flatMap((e: any) => (e.changes || []).flatMap((c: any) => c.value?.messages || []))
  if (!messages.length) return // delivery receipts etc.
  // "typing…" first, before any database step (only for the bot's own numbers)
  const typingNow = new Map<string, Promise<void>>()
  const known = new Set([...BOT_NUMBERS, ...(teamCache?.team || []).map((p) => p.phone)])
  for (const m of messages) if (m.id && known.has(String(m.from))) typingNow.set(m.id, showTyping(m.id))
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
    let text = m.type === 'text' ? m.text?.body : m.type === 'button' ? m.button?.text
      // a tapped button or a picked menu row comes back as its id ("YES", "check customs J-652" …)
      : m.type === 'interactive' ? (m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || '') : ''
    // a voice note: Groq's Whisper writes it out, then it is answered like a typed message
    let heard: string | null = null
    if (m.type === 'audio' && m.audio?.id) {
      try {
        const [a, d0] = await Promise.all([downloadMedia(m.audio.id), data ? Promise.resolve(data) : loadDataCached(admin)])
        data = d0
        heard = await transcribe(a.bytes, a.mime, voiceWords(d0))
        // spoken numbers as the team writes them ("job six five two" → J-652)
        text = normalizeSpoken(heard)
      } catch (e) {
        await send(person.phone, { text: `🎤 Sorry, I could not hear that voice note (${(e as Error).message}). Please try again, or type it.` })
        continue
      }
      if (!text) { await send(person.phone, { text: '🎤 The voice note was empty. Please try again.' }); continue }
    }
    // a file (PDF or photo): kept privately, then attached to a job after a YES
    if ((m.type === 'document' || m.type === 'image') && (m.document?.id || m.image?.id)) {
      if (!allowed(person, 'files')) { await send(person.phone, { text: `🔒 Your WhatsApp access is *${LEVEL_LABEL[person.level || 'view']}*, so files can't be added to jobs from your number. Please send it to Jose.` }); continue }
      await handleFile(admin, person, m, data || await loadDataCached(admin))
      await sendHeld(admin, person).catch((e) => console.warn(`[wa-bot] held messages: ${(e as Error).message}`))
      continue
    }
    // the last few messages (so follow-ups make sense) and the portal data, loaded together
    const [inboxRes, loaded] = await Promise.all([
      admin.from('bot_inbox').select('history, pending, last_file').eq('phone', person.phone).maybeSingle(),
      data ? Promise.resolve(data) : loadDataCached(admin),
      admin.from('bot_inbox').upsert({ phone: person.phone, last_inbound_at: new Date().toISOString() }),
      typing,
    ])
    data = loaded
    const history = Array.isArray(inboxRes?.data?.history) ? inboxRes.data.history : []
    if (!text) { await send(person.phone, { text: 'Please send text: ask a question, or a job no, a container no or SUMMARY.' }); continue }
    // a change waiting for this person's YES (asked in their previous message)
    const held: Pending | null = inboxRes?.data?.pending || null
    // what the last post saved stays undoable for UNDO_MINUTES, whatever comes in between
    const undoable = held?.action === 'undo_post' && Date.now() - new Date(held.at).getTime() < UNDO_MINUTES * 60_000 ? held : null
    const pending: Pending | null = held?.action === 'undo_post' ? null : held
    const live = pending && Date.now() - new Date(pending.at).getTime() < PENDING_MINUTES * 60_000
    let reply: string | null = null
    const after: Message[] = [] // menus a tool asks to send after the reply
    let checked: string[] = []
    let ask: Pending | null = null
    let undoNext: Pending | null = undoable // kept unless undone or replaced by a newer post
    if (pending) await admin.from('bot_inbox').update({ pending: undoable }).eq('phone', person.phone) // a proposal is answered once
    // a reply to one of the bot's own questions ("1 MH43U3271", "4588199 22.10", "YES", "skip"),
    // unless a Yes / No change is waiting (that comes first)
    let answered: { reply: string; undo?: any } | null = null
    if (!live && !isUndo(text)) {
      answered = await answerQuestion(admin, person, text, data, { markDelivered: (_id, jobNo) => markDeliveredFor(admin, person, data, jobNo) })
        .catch((e) => { console.warn(`[wa-bot] answer: ${(e as Error).message}`); return null })
    }
    if (answered) {
      reply = answered.reply
      if (answered.undo) undoNext = answered.undo
      dataCache = null
      checked = ['answer to the bot\'s question']
    } else if (undoable && isUndo(text)) {
      reply = await undoPost(admin, undoable, person); undoNext = null; dataCache = null
      // "wrong job, it is J-584": say how to put it on the right one
      const other = String(text).match(/\bJ[-. ]*0*(\d{2,5})\b/i)
      if (other && !String(undoable.job_no).replace(/\D/g, ' ').split(' ').includes(String(Number(other[1])))) reply += `\nSend the post again with J-${Number(other[1])} at the top and I'll save it there.`
    } else if (held?.action === 'undo_post' && /^\s*undo\b/i.test(text)) {
      // (any other way of saying it goes to the assistant, which talks it through)
      reply = `That was saved more than ${UNDO_MINUTES} minutes ago, so I can't undo it from here any more. Tell me what's wrong and I'll fix it, or correct it in the portal.`
    } else if (live && isYes(text)) {
      reply = await applyChange(admin, pending, person, { tell: (phone, t, jobNo) => tellTeammate(admin, team, phone, t, jobNo) })
      if (pending.action === 'set_access') teamCache = null // the new access counts from the next message
      dataCache = null // the next answer shows the change
      checked = [`made the change: ${pending.summary}`]
    } else if (pending && isNo(text)) {
      reply = `Cancelled. Nothing was changed.`
    } else if (pending && isYes(text)) {
      reply = `That request is more than ${PENDING_MINUTES} minutes old, so nothing was changed. Please ask again.`
    }
    else if (!pending && isYes(text)) {
      reply = 'Nothing is waiting for a YES right now. Tell me the change, for example: "mark J-638 delivered".'
    } else if (!pending && isNo(text)) {
      reply = 'OK, nothing was changed.'
    }
    // the team's own "BE filed" / truck-out post (sent or forwarded): saved at once, UNDO for 30 min
    if (!reply) {
      const post = await handlePost(admin, person, text, data, { allowedChange: allowed(person, 'change') })
      if (post) {
        reply = post.reply
        if (post.undo) undoNext = post.undo
        if (post.confirm) ask = post.confirm
        if (post.saved) dataCache = null
        checked = ['read a team post']
      }
    }
    // fixed commands are instant and free; anything else goes to the assistant
    if (!reply) reply = answer(data, text, person, new Date(), { fallback: false })
    if (!reply) reply = honestCheckReply(text, history)
    // a teammate saying a task is done
    if (!reply) reply = await taskDoneReply(admin, team, person, text)
    if (!reply) {
      const aiStart = Date.now()
      const ai = await askAssistant(text, history, data, person, {
        checkCustoms: customsChecker(admin, person, data, { notify: (t) => send(person.phone, { text: t }) }),
        server: makeServerTools({ admin, person, data, team, send: (t) => send(person.phone, { text: t }), sendFile: true, after, dataChanged: () => { dataCache = null }, customsOne: (job) => runCustomsCheck(admin, person, job, false) }),
        change: { lastFile: inboxRes?.data?.last_file || null, team },
      })
      checked = ai.checked
      ask = ai.proposal
      console.log(`[wa-bot] assistant: ${ai.note} | data ${aiStart - started} ms, AI ${Date.now() - aiStart} ms`)
      // a proposed change: the bot itself asks for YES, in fixed words
      if (ask) reply = confirmText(ask)
      else if (ai.text && /reply\s*\*?yes/i.test(ai.text)) reply = "I couldn't prepare that change. Please send it again in one message with all the details, for example: record BE 1234567 dated 18 Oct on J-509."
      else reply = ai.text ? toWhatsApp(ai.text) : "⏳ The AI is busy right now, so I couldn't answer that question. Please ask again in a minute.\n\nThese always work instantly: a job no (J-193), a container no, a BE no, SUMMARY or URGENT."
    }
    if (pending && live && !isYes(text) && !isNo(text) && !ask) reply = `(The earlier change was not made: ${pending.summary.replace(/\*/g, '')}.)\n\n${reply}`
    // (one waiting slot: a Yes / No question wins over the undo of an earlier post)
    if (ask) await admin.from('bot_inbox').update({ pending: ask }).eq('phone', person.phone)
    else if (undoNext !== undoable) await admin.from('bot_inbox').update({ pending: undoNext }).eq('phone', person.phone)
    // (a voice note is answered directly; what was heard is not repeated — Jose, 24 Oct 2026)
    // a change waiting for a YES gets Yes / No buttons; a menu from a tool comes after the reply
    await send(person.phone, ask ? { text: reply, buttons: YES_NO } : { text: reply })
    for (const extra of after) await send(person.phone, extra)
    const note = checked.length ? `\n[checked: ${checked.join('; ').slice(0, 400)}]` : ''
    const next = [...history, { role: 'user', text: String(text).slice(0, 500) }, { role: 'model', text: `${String(reply).slice(0, 1500)}${note}` }].slice(-10)
    await admin.from('bot_inbox').update({ history: next }).eq('phone', person.phone)
    // the window is open again: what was held for this person goes out now
    await sendHeld(admin, person).catch((e) => console.warn(`[wa-bot] held messages: ${(e as Error).message}`))
  }
}

// Meta only passes incoming messages to the bot if the WhatsApp account is
// "subscribed" to the app. Make sure of that once each time the bot starts,
// using the bot's own key, and write the outcome to the log (never the key).
// JDS Logistics (real number +91 93454 31746, 25 Oct 2026); the old test account was 1646613459995849
const WABA_ID = '1889002935590311'
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
      if (run === 'warm') {
        dataCache = null
        const [team, data] = await Promise.all([loadTeam(admin), loadDataCached(admin)])
        // reminders, watches ("tell me when") and tasks that are due (this run comes every 5 minutes)
        const viaAlert = (kind: string) => (key: string, person: Person, text: string, jobNo: string | null) =>
          sendOnce(admin, key, person, kind, { text, template: { name: 'jds_alert', values: [jobNo || kind, text.replace(/\*/g, '').replace(/\n+/g, ' '), jobNo || 'SUMMARY'] } })
        const reminders = await sendDueReminders(admin, team, viaAlert('reminder'))
        const watches = await checkWatches(admin, data, team, viaAlert('watch')).catch((e) => { console.warn(`[wa-bot] watches: ${(e as Error).message}`); return 0 })
        const tasks = await checkTasks(admin, data, team, viaAlert('task')).catch((e) => { console.warn(`[wa-bot] tasks: ${(e as Error).message}`); return 0 })
        return json({ success: true, warm: true, reminders: reminders.length, watches, tasks })
      }
      // test questions: answered as the first team member, nothing sent on WhatsApp
      // speed check of one AI service, tiny question, no portal data (test only)
      if (run === 'probe') {
        const body = JSON.parse(raw)
        const key = (Deno.env.get(body.keyName || 'NVIDIA_API_KEY') || '').trim()
        // all variants at once (each its own time limit), so many models fit in one run
        const out = await Promise.all((body.variants || [{}]).map(async (extra: any) => {
          const t0 = Date.now()
          try {
            const res = await fetch(body.url || 'https://integrate.api.nvidia.com/v1/chat/completions', {
              method: 'POST', signal: AbortSignal.timeout(Math.min(Number(body.timeoutMs) || 60_000, 100_000)),
              headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: body.model, messages: [{ role: 'user', content: 'Reply with one word: hello' }], max_tokens: 200, ...extra }),
            })
            const j = await res.json().catch(() => ({}))
            return { model: extra.model || body.model, status: res.status, ms: Date.now() - t0, reply: String(j?.choices?.[0]?.message?.content || j?.detail || j?.error?.message || JSON.stringify(j)).slice(0, 100) }
          } catch (e) { return { model: extra.model || body.model, ms: Date.now() - t0, error: (e as Error).name } }
        }))
        return json({ success: true, probe: out })
      }
      // test: a voice note (base64 audio, or a file in private storage) → the text Whisper hears
      if (run === 'voice-test') {
        const b = JSON.parse(raw)
        let bytes = Uint8Array.from(atob(String(b.audio || '')), (c) => c.charCodeAt(0))
        if (b.path) {
          const { data: blob, error } = await admin.storage.from('job-documents').download(String(b.path))
          if (error || !blob) return json({ success: false, error: error?.message || 'no file' })
          bytes = new Uint8Array(await blob.arrayBuffer())
        }
        const t0 = Date.now()
        try { return json({ success: true, heard: await transcribe(bytes, String(b.mime || 'audio/wav')), ms: Date.now() - t0 }) } catch (e) { return json({ success: false, error: (e as Error).message }) }
      }
      // check: what Meta says about the bot's number and account (read only, changes nothing;
      // 24 Oct 2026: sends failed with #133010 "Account not registered")
      if (run === 'wa-status') {
        const auth = { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}` }
        const get = (path: string) => fetch(`${GRAPH}/${path}`, { headers: auth }).then((r) => r.json()).catch((e) => ({ error: String(e) }))
        const [phone, account, numbers] = await Promise.all([
          get(`${env('WHATSAPP_PHONE_ID')}?fields=display_phone_number,verified_name,status,platform_type,code_verification_status,name_status,quality_rating,account_mode,throughput,is_official_business_account`),
          get(`${WABA_ID}?fields=name,account_review_status,business_verification_status,ownership_type,health_status`),
          get(`${WABA_ID}/phone_numbers?fields=id,display_phone_number,status,platform_type,code_verification_status,quality_rating,account_mode`),
        ])
        return json({ success: true, phone, account, numbers })
      }
      // test: one desktop notification to every computer that switched them on
      if (run === 'push-test') return json({ success: true, ...(await pushTest(admin, String(JSON.parse(raw).text || 'Test: desktop alerts work.'))) })
      // test: the 8:00 missing-details message for each person (nothing sent)
      if (run === 'missing-test') {
        const [data, team] = await Promise.all([loadData(admin), loadTeam(admin)])
        return json({ success: true, people: team.map((p) => { const m = missingDetails(data, p); return { name: p.name, text: m.text, rows: m.rows.map((r: any) => r.id) } }) })
      }
      // test: a stored PDF through the BE reader, and the job it matches (nothing changed)
      if (run === 'be-test') {
        const b = JSON.parse(raw)
        const { data: blob, error } = await admin.storage.from('job-documents').download(String(b.path || ''))
        if (error || !blob) return json({ success: false, error: error?.message || 'no file' })
        const t0 = Date.now()
        try {
          const be = await readBeFile(new Uint8Array(await blob.arrayBuffer()))
          const m = be ? jobForBe(be, (await loadDataCached(admin)).jobs) : null
          return json({ success: true, ms: Date.now() - t0, be: be ? { be_no: be.be_no, be_date: be.be_date, igm_no: be.igm_no, igm_date: be.igm_date, bl_no: be.bl_no, copy: be.copy_type, containers: be.containers } : null, line: be ? beLine(be) : null, job: m ? `${m.job.job_no} by ${m.how}` : null })
        } catch (e) { return json({ success: false, error: (e as Error).message }) }
      }
      // test: team posts ("BE filed", truck out) read against the live jobs; the replies are
      // returned here and NOTHING is saved
      if (run === 'post-test') {
        const texts: string[] = (JSON.parse(raw).texts || []).slice(0, 40)
        const [team, data] = await Promise.all([loadTeam(admin), loadData(admin)])
        const person = team[0]
        const out = []
        for (const t of texts) {
          const r = await handlePost(admin, person, t, data, { test: true })
          out.push({ text: t.slice(0, 80), post: !!r, reply: r?.reply || null, confirm: r?.confirm?.summary || null })
        }
        return json({ success: true, results: out })
      }
      // test: the bot's questions worked out on the live data: what is due, and what each
      // person would get right now and why not (NOTHING is sent or stored)
      if (run === 'questions-test') {
        const [team, data] = await Promise.all([loadTeam(admin), loadData(admin)])
        const due = questionsDue(data)
        const people = await runQuestions(admin, data, team, questionDeps(admin), { test: true })
        return json({ success: true, switch: Deno.env.get('BOT_ASKING') || 'off', due: due.map((q) => ({ job: q.job_no, kind: q.kind, text: q.text })), people })
      }
      // test: the "check customs now" path for one job, as the first team member;
      // the reply is returned here, not sent on WhatsApp
      if (run === 'customs-test') {
        const [team, data] = await Promise.all([loadTeam(admin), loadData(admin)])
        const person = team[0]
        const ref = String(JSON.parse(raw).job || '')
        const quick: any = await customsChecker(admin, person, data, { test: true })(ref)
        if (!quick?.started || !JSON.parse(raw).live) return json({ success: true, quick })
        const job = data.jobs.find((j: any) => String(j.job_no || '').replace(/\D/g, '') === ref.replace(/\D/g, ''))
        return json({ success: true, quick, message: await runCustomsCheck(admin, person, job, false) })
      }
      if (run === 'ask') {
        const questions: string[] = (JSON.parse(raw).questions || []).slice(0, 8)
        const [team, data] = await Promise.all([loadTeam(admin), loadDataCached(admin)])
        // as the first team member, or with another access level to test it ("level": "view")
        const person = { ...team[0], ...(LEVELS.includes(JSON.parse(raw).level) ? { level: JSON.parse(raw).level } : {}) }
        const out = []
        const chat = !!JSON.parse(raw).conversation
        const convo: any[] = []
        let proposed: Pending | null = null
        const gap = Math.min(Number(JSON.parse(raw).gap) || 0, 20_000) // pause between questions, like a person typing
        for (const q of questions) {
          if (out.length && gap) await new Promise((r) => setTimeout(r, gap))
          const t0 = Date.now()
          // test mode never changes anything: a YES only says what WOULD be done
          if (proposed && isYes(q)) {
            out.push({ q, a: `(test mode, nothing saved) would now do: ${proposed.summary}`, how: 'confirm', ms: Date.now() - t0 })
            if (chat) convo.push({ role: 'user', text: q }, { role: 'model', text: `[change made: ${proposed.summary}]` })
            proposed = null
            continue
          }
          if (proposed && isNo(q)) {
            out.push({ q, a: 'Cancelled. Nothing was changed.', how: 'cancel', ms: Date.now() - t0 })
            if (chat) convo.push({ role: 'user', text: q }, { role: 'model', text: 'Cancelled. Nothing was changed.' })
            proposed = null
            continue
          }
          if (!proposed && isYes(q)) {
            out.push({ q, a: 'Nothing is waiting for a YES right now.', how: 'nothing pending', ms: Date.now() - t0 })
            if (chat) convo.push({ role: 'user', text: q }, { role: 'model', text: 'Nothing is waiting for a YES right now.' })
            continue
          }
          proposed = null
          const fixed = answer(data, q, person, new Date(), { fallback: false }) || (chat ? honestCheckReply(q, convo) : null)
          const ai = fixed ? null : await askAssistant(q, chat ? convo : [], data, person, {
            checkCustoms: customsChecker(admin, person, data, { test: true }),
            server: makeServerTools({ admin, person, data, team, test: true, send: async () => {}, dataChanged: () => {} }),
            change: { lastFile: JSON.parse(raw).lastFile || null, team },
          })
          if (ai?.proposal) proposed = ai.proposal
          const a = fixed || (ai?.proposal ? confirmText(ai.proposal) : ai?.text ? toWhatsApp(ai.text) : null)
          out.push({ q, a, how: fixed ? 'fixed' : ai?.note, checked: ai?.checked, ms: Date.now() - t0 })
          // conversation mode: each question sees the earlier ones, like a real chat
          const note = ai?.checked?.length ? `\n[checked: ${ai.checked.join('; ')}]` : ''
          if (chat) convo.push({ role: 'user', text: q }, { role: 'model', text: `${a || ''}${note}` })
        }
        return json({ success: true, answers: out, groq: questions.length ? undefined : await groqInfo() })
      }
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
