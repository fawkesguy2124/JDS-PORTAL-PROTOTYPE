// The bot asks the team, calmly (Jose, 1 Nov 2026: "not an irritating bot asking every 10
// minutes"). It asks ONLY what the portal can't find out by itself, at the moment it
// matters, and turns the reply into data:
//   truck      a container left the CFS / port loaded (or is on the road) and no truck is known
//   be         the ship has arrived and no BE is in the portal
//   delivered  nothing has moved for days: is the job finished?
// The rules that keep it calm:
//   • never what ULIP / FASTag / tracking / a post will tell anyway (the journey decides)
//   • only between 9:00 and 20:00 India time, only inside WhatsApp's free 24-hour window
//   • one message per person at most every 3 hours, up to 4 questions in it, numbered
//   • each question once, plus one reminder a day later at most; then it is left alone
//   • "skip" / "don't know" ends it; an answer is saved at once (UNDO works as for posts)
// Switch: secret BOT_ASKING = on (send) · anything else = off. The test run works it all
// out on the live data and sends nothing. Who is asked: BOT_ASK_TO (comma-separated
// numbers), else Jose's first number, until each CFS has its own person.
import { journeyFor, isDelivered, isExportJob, isAirJob, deliveryBy } from '../_shared/portal/journeyCore.js'
import { platesIn } from '../_shared/portal/postReader.js'
import { handlePost } from './posts.ts'

type Admin = any
type Person = { phone: string; name: string; level?: string }
export type Question = { key: string; job_id: string; job_no: string; kind: 'truck' | 'be' | 'delivered'; text: string }

const env = (k: string) => Deno.env.get(k) || ''
export const askingOn = () => env('BOT_ASKING') === 'on'
const MAX_PER_MESSAGE = 4
const GAP_HOURS = 3
const REMIND_AFTER_HOURS = 24
const MAX_ASKS = 2
const istHour = (d = new Date()) => Number(d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }))
const istDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
const hoursSince = (iso: string | null | undefined) => (iso ? (Date.now() - new Date(iso).getTime()) / 36e5 : null)

// what is worth asking right now, from the portal's own picture of each job
export function questionsDue(data: any): Question[] {
  const out: Question[] = []
  for (const job of data?.jobs || []) {
    if (isDelivered(job) || isExportJob(job)) continue
    const j: any = journeyFor(job, data)
    if (j.phase === 'delivered') continue
    const who = `*${job.job_no}*${job.client ? ` (${job.client})` : ''}`
    // 1. the cargo left with no truck known (the journey's own "add the truck number" note:
    //    left the CFS loaded in the last few days, or on the road by tracking), after an hour
    //    so the team's truck post has time to come in first
    const leftNote = (j.attention || []).find((a: any) => a.action === 'truck' && /add the truck number/.test(a.text))
    const leftAt = j.c?.lastExitAt || j.leftAt || null
    if (leftNote && deliveryBy(job) === 'jds' && (hoursSince(leftAt) ?? 99) >= 1) {
      const what = String(leftNote.text).split(' — ')[0]
      out.push({ key: `${job.id}:truck`, job_id: job.id, job_no: job.job_no, kind: 'truck', text: `${who}: ${what}. Which truck took it? (e.g. MH46CU9963)` })
      continue
    }
    // 2. the ship (or flight) is in, half a day has passed, and there is no BE
    const arrived = j.arrivedAt || (j.steps?.[0]?.done ? job.eta : null)
    const since = hoursSince(arrived)
    if (!job.be_no && arrived && since !== null && since >= 12 && since <= 10 * 24) {
      out.push({ key: `${job.id}:be`, job_id: job.id, job_no: job.job_no, kind: 'be', text: `${who}: the ${isAirJob(job) ? 'flight' : 'ship'} arrived on ${istDay(arrived)} and no BE is in the portal. Is it filed? Reply with the BE no and date (e.g. 4588199 22.10), or forward the BE post.` })
      continue
    }
    // 3. nothing has moved for days: finished?
    if ((j.attention || []).some((a: any) => /is this job finished/i.test(a.text))) {
      out.push({ key: `${job.id}:delivered`, job_id: job.id, job_no: job.job_no, kind: 'delivered', text: `${who}: no container movement for days. Is it delivered? Reply YES or NO.` })
    }
  }
  return out
}

const askTo = (team: Person[]): Person[] => {
  const nums = env('BOT_ASK_TO').split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean)
  const list = nums.length ? team.filter((p) => nums.includes(p.phone)) : team.slice(0, 1)
  return list.filter((p) => p.level !== 'view')
}

// The 5-minute run: who gets which questions now (test = nothing sent, nothing stored)
export async function runQuestions(admin: Admin, data: any, team: Person[], deps: { send: (p: Person, text: string) => Promise<boolean>; windowOpen: (phone: string) => Promise<boolean> }, opts: { test?: boolean } = {}) {
  const report: any[] = []
  if (!opts.test && !askingOn()) return report
  const hour = istHour()
  const due = questionsDue(data)
  const { data: rows } = await admin.from('bot_questions').select('*').in('key', due.map((q) => q.key).length ? due.map((q) => q.key) : ['-'])
  const known = new Map((rows || []).map((r: any) => [r.key, r]))
  // questions whose reason is gone are closed, so they are never asked again
  if (!opts.test) {
    const dueKeys = new Set(due.map((q) => q.key))
    const { data: open } = await admin.from('bot_questions').select('key').eq('status', 'open')
    const gone = (open || []).map((r: any) => r.key).filter((k: string) => !dueKeys.has(k))
    if (gone.length) await admin.from('bot_questions').update({ status: 'resolved' }).in('key', gone)
  }
  const askable = due.filter((q) => {
    const r: any = known.get(q.key)
    if (!r) return true
    if (r.status !== 'open') return false
    return r.asked_count < MAX_ASKS && (hoursSince(r.last_asked_at) ?? 99) >= REMIND_AFTER_HOURS
  })
  for (const person of askTo(team)) {
    const why: string[] = []
    if (hour < 9 || hour >= 20) why.push('outside 9:00-20:00')
    if (!(await deps.windowOpen(person.phone))) why.push('no message from them in 24 h (free window closed)')
    const { data: lastMsg } = await admin.from('bot_questions').select('last_asked_at').eq('phone', person.phone).order('last_asked_at', { ascending: false }).limit(1).maybeSingle()
    if ((hoursSince(lastMsg?.last_asked_at) ?? 99) < GAP_HOURS) why.push(`asked less than ${GAP_HOURS} h ago`)
    const pick = askable.slice(0, MAX_PER_MESSAGE)
    if (!pick.length) why.push('nothing to ask')
    const text = pick.length ? [`🙋 A quick ${pick.length === 1 ? 'question' : `${pick.length} questions`} (reply when you can):`, ...pick.map((q, i) => `${pick.length > 1 ? `${i + 1}. ` : ''}${q.text}`), pick.length > 1 ? '\nReply with the number first, e.g. "1 MH46CU9963". "skip" if you don\'t know.' : '\n"skip" if you don\'t know.'].join('\n') : null
    report.push({ to: person.name, wouldSend: !why.length, why, text })
    if (opts.test || why.length || !text) continue
    if (!(await deps.send(person, text))) continue
    const now = new Date().toISOString()
    await admin.from('bot_questions').upsert(pick.map((q, i) => {
      const r: any = known.get(q.key)
      return { key: q.key, job_id: q.job_id, job_no: q.job_no, kind: q.kind, phone: person.phone, question: q.text, msg_num: i + 1, asked_count: (r?.asked_count || 0) + 1, first_asked_at: r?.first_asked_at || now, last_asked_at: now, status: 'open' }
    }))
  }
  return report
}

const SKIP = /^\s*(\d\s*[.):-]?\s*)?(skip|don'?t know|dont know|no idea|pata nahi|malum nahi|maloom nahi|not sure|later|baad me|baad mein)\s*[.!]*\s*$/i
const YES = /^(yes|y|haan|ha|han|ji|done|delivered|ho gaya|hogaya)\b/i
const NO = /^(no|n|nahi|nhi|not yet|abhi nahi)\b/i

// A reply to the bot's questions? (asked to this person in the last 24 h). Returns the reply
// to send, or null when the message is something else (it then goes on as usual).
export async function answerQuestion(admin: Admin, person: Person, text: string, data: any, deps: { markDelivered: (jobId: string, jobNo: string) => Promise<string> }): Promise<{ reply: string; undo?: any } | null> {
  const { data: open } = await admin.from('bot_questions').select('*').eq('phone', person.phone).eq('status', 'open').gte('last_asked_at', new Date(Date.now() - 24 * 36e5).toISOString()).order('msg_num')
  if (!open?.length) return null
  const latest = open.filter((q: any) => q.last_asked_at === open.reduce((m: string, q: any) => (q.last_asked_at > m ? q.last_asked_at : m), ''))
  const s = String(text || '').trim()
  const n = s.match(/^(\d)\s*[.):-]?\s+(.+)$/s)
  let q: any = null
  let rest = s
  if (n && latest.find((x: any) => x.msg_num === Number(n[1]))) { q = latest.find((x: any) => x.msg_num === Number(n[1])); rest = n[2].trim() }
  else if (latest.length === 1) q = latest[0]
  else {
    // the job named in the reply, or the only question of the kind the reply fits
    const byJob = latest.find((x: any) => new RegExp(`\\bJ[-. ]*0*${String(x.job_no).replace(/\D/g, '')}\\b`, 'i').test(s))
    const fits = (x: any) => (x.kind === 'truck' ? platesIn(s.toUpperCase()).length > 0 : x.kind === 'be' ? /\b\d{7}\b/.test(s) : YES.test(s) || NO.test(s))
    q = byJob || (latest.filter(fits).length === 1 ? latest.filter(fits)[0] : null)
  }
  if (!q) return null
  const close = (status: string, answer: string) => admin.from('bot_questions').update({ status, answer: answer.slice(0, 300), answered_at: new Date().toISOString() }).eq('key', q.key)
  if (SKIP.test(s)) { await close('skipped', s); return { reply: `OK, I won't ask about ${q.job_no} again.` } }
  if (q.kind === 'truck') {
    if (!platesIn(rest.toUpperCase()).length) return null
    const r = await handlePost(admin, person, `${q.job_no}\n${rest}`, data)
    if (!r) return null
    if (r.saved) await close('answered', rest)
    return { reply: r.reply, undo: r.undo }
  }
  if (q.kind === 'be') {
    const be = rest.match(/\b(\d{7})\b/)
    if (!be) return null
    const d = rest.match(/\b(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{2,4}))?\b(?!\d)/)
    if (!d) return { reply: `Thanks. What is the date of BE ${be[1]}? (e.g. ${be[1]} 22.10)` }
    const year = d[3] ? (d[3].length === 2 ? `20${d[3]}` : d[3]) : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 4)
    const r = await handlePost(admin, person, `${q.job_no}\nBE ${be[1]}/${d[1]}.${d[2]}.${year}`, data)
    if (!r) return null
    if (r.saved) await close('answered', rest)
    return { reply: r.reply, undo: r.undo }
  }
  // delivered?
  if (YES.test(rest)) { await close('answered', rest); return { reply: await deps.markDelivered(q.job_id, q.job_no) } }
  if (NO.test(rest)) { await close('answered', rest); return { reply: `OK, ${q.job_no} stays open.` } }
  return null
}
