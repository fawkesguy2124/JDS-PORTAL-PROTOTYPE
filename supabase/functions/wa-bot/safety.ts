// The bot's safety net (Jose, 2 Nov 2026: "once they start relying on this bot, they'll keep
// relying on it… make sure that strong reliability is there, for any scenario").
//   botHealth   a failed message, an AI that didn't answer, a reply WhatsApp refused: Jose
//               hears it within the hour (WhatsApp and the desktop alert, at most once an hour)
//   savedToday  each evening, one list of everything the bot saved in the portal that day,
//               so a wrong save is caught the same day
// Both run inside the 5-minute alert run; both go only to admins, free (a message waits for
// the 24-hour window like every other alert).
type Admin = any
type Person = { phone: string; name: string; level?: string }
type Outgoing = { key: string; kind: string; text: string; template: { name: string; values: string[] } }
type Deps = { sendOnce: (key: string, person: Person, msg: Outgoing) => Promise<unknown>; push: (alerts: any[]) => Promise<unknown> }

const HELD = 'held: 24-hour window closed'
const ist = (d = new Date()) => d.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', hour12: false }).replace(',', '') // "2026-11-02 19:05:00"
const admins = (team: Person[]) => { const a = team.filter((p) => p.level === 'admin'); return a.length ? a : team.slice(0, 1) }

export async function botHealth(admin: Admin, team: Person[], deps: Deps) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: rows } = await admin.from('bot_sent').select('kind, text, error, sent_at').gte('sent_at', since).not('error', 'is', null).order('sent_at', { ascending: false })
  const problems = (rows || []).filter((r: any) => r.error !== HELD && !String(r.kind || '').startsWith('push-') && r.kind !== 'health')
  if (!problems.length) return { problems: 0 }
  const latest = problems[0]
  const what = latest.kind === 'error' ? String(latest.text || 'a message') : `sending ${latest.kind}`
  const text = `⚠️ The WhatsApp bot had ${problems.length === 1 ? 'a problem' : `${problems.length} problems`} in the last hour.\nLatest: ${what}: ${String(latest.error).slice(0, 160)}\nThe person got a "please send it again" reply. Worth a look today.`
  const key = `health:${ist().slice(0, 13)}` // at most once an hour
  const alert = { key, kind: 'system', jobNo: 'Bot', text, template: { name: 'jds_alert', values: ['WhatsApp bot', `${problems.length} problem(s) in the last hour`, '-'] } }
  await deps.push([alert]).catch(() => null) // the desktop alert also works when WhatsApp itself is the problem
  for (const p of admins(team)) await deps.sendOnce(key, p, { key, kind: 'health', text, template: alert.template })
  return { problems: problems.length }
}

export async function savedToday(admin: Admin, team: Person[], deps: Deps) {
  const now = ist()
  if (now.slice(11, 16) < '19:00') return { skipped: 'before 19:00' }
  const day = now.slice(0, 10)
  const from = new Date(`${day}T00:00:00+05:30`).toISOString()
  const { data: rows } = await admin.from('activity_log').select('title, done_by_name, created_at').gte('created_at', from).ilike('done_by_name', '%via WhatsApp%').order('created_at')
  const list = rows || []
  if (!list.length) return { saved: 0 }
  const lines = list.slice(0, 15).map((r: any) => `• ${String(r.title || '').replace(/\s+—\s+/, ': ')} (${String(r.done_by_name || '').replace(/\s*via WhatsApp/i, '')})`)
  const more = list.length > 15 ? `\n…and ${list.length - 15} more in the portal's activity.` : ''
  const text = `🧾 What I saved in the portal today (${list.length}):\n${lines.join('\n')}${more}\n\nAnything wrong? Tell me and I'll fix it.`
  const key = `saved:${day}`
  for (const p of admins(team)) await deps.sendOnce(key, p, { key, kind: 'saved', text, template: { name: 'jds_alert', values: ['WhatsApp bot', `${list.length} saves today`, '-'] } })
  return { saved: list.length }
}
