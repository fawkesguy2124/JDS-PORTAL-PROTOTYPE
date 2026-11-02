// The bot asks the team, calmly (Jose, 1 Nov 2026: "not an irritating bot asking every 10
// minutes"), and since 2 Nov one message per event with tap buttons, so the team answers
// in one tap, or in their own words, typed or by voice (Jose: "very conversational"). It
// asks ONLY what the portal can't find out by itself, at the moment it matters:
//   move       OOC granted and nobody said how the cargo goes: truck, rail or the client
//   duty       the BE is assessed: is the duty paid?
//   be         the ship has arrived and no BE is in the portal: is it filed?
//   truck      a container left the CFS / port loaded and no truck is known: which truck?
//   delivered  nothing has moved for days: is the job finished?
// The rules that keep it calm:
//   • never what ULIP / FASTag / tracking / a post will tell anyway (the journey decides)
//   • only between 9:00 and 20:00 India time, only inside WhatsApp's free 24-hour window
//   • at most 3 messages in one go, then nothing for 3 hours
//   • each question once, plus one reminder a day later at most; then it is left alone
//   • "not yet" asks again tomorrow; "skip" / "don't know" ends it; an answer is saved at once
// Switch: secret BOT_ASKING = on (send) · anything else = off. The test run works it all
// out on the live data and sends nothing. Who is asked: BOT_ASK_TO (comma-separated
// numbers), else Jose's first number, until each CFS has its own person.
import { journeyFor, isDelivered, isExportJob, isAirJob, deliveryBy, truckNos, containerTrip } from '../_shared/portal/journeyCore.js'
import { platesIn } from '../_shared/portal/postReader.js'
import { handlePost } from './posts.ts'

type Admin = any
type Person = { phone: string; name: string; level?: string }
type Button = { id: string; title: string }
export type Question = { key: string; job_id: string; job_no: string; kind: 'move' | 'duty' | 'be' | 'truck' | 'delivered' | 'deliver'; text: string; buttons: Button[] }

const env = (k: string) => Deno.env.get(k) || ''
export const askingOn = () => env('BOT_ASKING') === 'on'
const MAX_PER_RUN = 3
const GAP_HOURS = 3
const REMIND_AFTER_HOURS = 24
const MAX_ASKS = 2
const istHour = (d = new Date()) => Number(d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }))
const istDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
const hoursSince = (iso: string | null | undefined) => (iso ? (Date.now() - new Date(iso).getTime()) / 36e5 : null)
// a tap comes back as its id: Q|<question key>|<answer>
const tap = (key: string, answer: string, title: string): Button => ({ id: `Q|${key}|${answer}`, title })

// what is worth asking right now, from the portal's own picture of each job (one per job)
export function questionsDue(data: any): Question[] {
  const out: Question[] = []
  for (const job of data?.jobs || []) {
    if (isDelivered(job) || isExportJob(job)) continue
    const j: any = journeyFor(job, data)
    if (j.phase === 'delivered') continue
    const who = `*${job.job_no}*${job.client ? ` (${job.client})` : ''}`
    const ask = (kind: Question['kind'], text: string, buttons: [string, string][]) => {
      const key = `${job.id}:${kind}`
      out.push({ key, job_id: job.id, job_no: job.job_no, kind, text, buttons: buttons.map(([a, t]) => tap(key, a, t)) })
    }
    const fm = job.field_meta || {}
    // 1. OOC granted in the last 3 days, and nobody has said how the cargo goes
    if (j.phase === 'release' && !fm.onward_mode && !fm.delivery_by && !truckNos(job).length && (hoursSince(j.oocDate) ?? 0) <= 72) {
      ask('move', `🎉 ${who}: OOC granted${j.oocDate ? ` on ${istDay(j.oocDate)}` : ''}. How is the cargo going?`,
        [['truck', '🚚 Truck'], ['rail', '🚆 Rail'], ['client', 'Client collects']])
      continue
    }
    // 2. assessed half a day ago or more: is the duty paid?
    if (j.phase === 'ooc' && j.beStage?.id === 'assessed' && (hoursSince(j.beStage.at) ?? 99) >= 6) {
      ask('duty', `💰 ${who}: BE ${job.be_no} was assessed${j.beStage.at ? ` on ${istDay(j.beStage.at)}` : ''}. Is the duty paid?`,
        [['yes', '✅ Duty paid'], ['later', 'Not yet']])
      continue
    }
    // 3. the cargo left with no truck known (the journey's own "add the truck number" note:
    //    left the CFS loaded in the last few days, or on the road by tracking), after an hour
    //    so the team's truck post has time to come in first
    const leftNote = (j.attention || []).find((a: any) => a.action === 'truck' && /add the truck number/.test(a.text))
    const leftAt = j.c?.lastExitAt || j.leftAt || null
    if (leftNote && deliveryBy(job) === 'jds' && (hoursSince(leftAt) ?? 99) >= 1) {
      const what = String(leftNote.text).split(' — ')[0]
      ask('truck', `🚚 ${who}: ${what}. Which truck took it? Just send or say the number.`, [['skip', "Don't know"]])
      continue
    }
    // 4. the ship (or flight) is in, half a day has passed, and there is no BE
    const arrived = j.arrivedAt || (j.steps?.[0]?.done ? job.eta : null)
    const since = hoursSince(arrived)
    if (!job.be_no && arrived && since !== null && since >= 12 && since <= 10 * 24) {
      ask('be', `📄 ${who}: the ${isAirJob(job) ? 'flight' : 'ship'} came in on ${istDay(arrived)} and there's no BE in the portal yet. Is it filed?`,
        [['yes', '✅ Filed'], ['later', 'Not yet']])
      continue
    }
    // 5. nothing has moved for days: finished?
    if ((j.attention || []).some((a: any) => /is this job finished/i.test(a.text))) {
      ask('delivered', `📦 ${who}: no container movement for a few days. Is it delivered?`, [['yes', '✅ Delivered'], ['later', 'Not yet']])
    }
  }
  return out
}

// One question about a job the person is asking about right now (Jose, 2 Nov 2026: "if JDS
// is inquiring about J-711, isn't that the right time to ask whatever is missing?"). Asked
// after the answer, one tap, at most once a day per question (the caller checks that).
//   deliver  who takes the cargo out. "Client collects" on a job that goes through the CFS
//            (or that they ask about at the CFS) is asked again: client-collect jobs usually
//            come straight from the port, so a CFS job is normally JDS delivering
//   …else    the job's own due question (BE, duty, truck, delivered), if there is one
export function followUpFor(job: any, data: any, text: string): Question | null {
  if (!job || isDelivered(job) || isExportJob(job)) return null
  const j: any = journeyFor(job, data)
  if (j.phase === 'delivered') return null
  const fm = job.field_meta || {}
  const who = `*${job.job_no}*${job.client ? ` (${job.client})` : ''}`
  const ask = (key: string, text: string): Question => ({ key, job_id: job.id, job_no: job.job_no, kind: 'deliver', text,
    buttons: [tap(key, 'jds', '🚚 JDS delivers'), tap(key, 'client', '🏢 Client collects')] })
  const viaCfs = /\bCFS\b/i.test(text) || (j.containers?.all || []).some((t: any) => (t.milestones || []).some((m: any) => /^(CFS|ICD)\s*IN/i.test(String(m.description || m.event || '')))) || (j.containers?.all || []).some((t: any) => containerTrip(t, job).toCfsSince)
  // (its own key: a "client collects" answered earlier is asked again once the CFS shows up)
  if (fm.delivery_by === 'client' && viaCfs) {
    return ask(`${job.id}:deliver_cfs`, `${who} is set to *client collects*, but it's going through the CFS, and that's usually JDS delivering. Who takes the cargo out?`)
  }
  if (!fm.delivery_by && ['ooc', 'release', 'docs', 'arrival'].includes(j.phase)) {
    return ask(`${job.id}:deliver`, `Quick one on ${who}: who takes the cargo out, JDS or the client?`)
  }
  return questionsDue({ ...data, jobs: [job] })[0] || null
}

const askTo = (team: Person[]): Person[] => {
  const nums = env('BOT_ASK_TO').split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean)
  const list = nums.length ? team.filter((p) => nums.includes(p.phone)) : team.slice(0, 1)
  return list.filter((p) => p.level !== 'view')
}

// The 5-minute run: who gets which questions now (test = nothing sent, nothing stored)
export async function runQuestions(admin: Admin, data: any, team: Person[], deps: { send: (p: Person, text: string, buttons?: Button[]) => Promise<boolean>; windowOpen: (phone: string) => Promise<boolean> }, opts: { test?: boolean } = {}) {
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
    const pick = askable.slice(0, MAX_PER_RUN)
    if (!pick.length) why.push('nothing to ask')
    report.push({ to: person.name, wouldSend: !why.length, why, messages: pick.map((q) => ({ text: q.text, buttons: q.buttons.map((b) => b.title) })) })
    if (opts.test || why.length) continue
    // one message per question, each with its own buttons
    for (const [i, q] of pick.entries()) {
      if (!(await deps.send(person, q.text, q.buttons))) continue
      const now = new Date().toISOString()
      const r: any = known.get(q.key)
      await admin.from('bot_questions').upsert({ key: q.key, job_id: q.job_id, job_no: q.job_no, kind: q.kind, phone: person.phone, question: q.text, msg_num: i + 1, asked_count: (r?.asked_count || 0) + 1, first_asked_at: r?.first_asked_at || now, last_asked_at: now, status: 'open' })
    }
  }
  return report
}

// What a typed or spoken answer means. Hindi / Hinglish as the team talks (Jose, 2 Nov 2026)
// (Hindi script is turned into these letters first: toRoman in media.ts, so "पता नहीं" →
// "pata nahin", "हाँ भर दिया" → "han bhar diya")
const NAHI = 'na?h?i+n?|nhi|nai'
const SKIP = new RegExp(`\\b(skip|don'?t know|dont know|no idea|not sure|(pata|malum|maloom|maaloom|patta) (${NAHI})|(${NAHI}) pata|kya pata|kuch pata (${NAHI}))\\b`, 'i')
const LATER = new RegExp(`^\\s*(no|nope|(${NAHI})|not yet|abhi (${NAHI})|abhi tak (${NAHI})|(${NAHI}) hua|(${NAHI}) kiya|(${NAHI}) gaya|later|baad me|baad mein|kal|kal tak|tomorrow|pending|still pending|baaki hai|baki hai|ruko|wait)\\b`, 'i')
const YES = /\b(yes|yas|yeah|yep|ok|oke|okay|haan|han|ha|haa|haanji|han ji|ji haan|ji han|ji|bilkul|done|paid|pay kar|pay ho|bhar diya|bhar di|bhara|bhar dia|jama kar|jama ho|de diya|de di|filed|file ho|file kar|delivered|deliver ho|ho gaya|ho gayi|hogaya|ho gya|ho gai|kar diya|kar di|kardiya|nikal gaya|nikal gayi|chala gaya|chali gayi|pahuch gaya|pahunch gaya|pohoch gaya|reached|mil gaya|aa gaya)\b/i
const NEGATED = new RegExp(`\\b(not|no|never|(${NAHI})|mat)\\b`, 'i')
// who takes the cargo out, as people say it ("hum le jayenge", "JDS", "party khud uthayegi")
const DELIVER_WORDS: [RegExp, string][] = [
  [/\b(client|klaint|party|parti|customer|importer)\b.*\b(collect|le jayega|le jayegi|le jaega|uthayega|uthayegi|pick|lega|legi|khud)|\bclient collects?\b|\bself pick/i, 'client'],
  [/\b(jds|hum|hamara|hamari|we|our|us)\b/i, 'jds'],
]
const MOVE_WORDS: [RegExp, string][] = [
  [/\b(rail|rel|train|tren|rake|icd|malgadi)\b/i, 'rail'],
  [/\b(client|klaint|party|parti|customer|self|khud)\b.*\b(collect|le jayega|le jayegi|le jaega|uthayega|uthayegi|pick|lega|legi)|\bclient collects?\b|\bself pick/i, 'client'],
  [/\b(truck|trak|trek|trailer|treler|gaadi|gadi|gari|gaari|lorry|tempo)\b/i, 'truck'],
]

// A reply to the bot's questions? (a tapped button, or words about a question asked to this
// person in the last 2 days). Returns the reply to send, or null when the message is about
// something else (it then goes on to the posts reader and the assistant as usual).
export async function answerQuestion(admin: Admin, person: Person, text: string, data: any,
  deps: { markDelivered: (jobId: string, jobNo: string) => Promise<string>; change: (action: Record<string, unknown>) => Promise<string> }): Promise<{ reply: string; undo?: any } | null> {
  const s = String(text || '').trim()
  let q: any = null
  let ans: string | null = null
  let rest = s
  const tapped = s.match(/^Q\|(.+)\|(\w+)$/)
  if (tapped) {
    const { data: row } = await admin.from('bot_questions').select('*').eq('key', tapped[1]).maybeSingle()
    if (!row || row.status !== 'open') return { reply: 'That one is already sorted 👍' }
    q = row; ans = tapped[2]; rest = ''
  } else {
    const { data: open } = await admin.from('bot_questions').select('*').eq('phone', person.phone).eq('status', 'open').gte('last_asked_at', new Date(Date.now() - 48 * 36e5).toISOString()).order('last_asked_at', { ascending: false })
    if (!open?.length) return null
    // the job named in the reply; else the one question the reply fits; else the only one open
    const byJob = open.find((x: any) => new RegExp(`\\bJ[-. ]*0*${String(x.job_no).replace(/\D/g, '')}\\b`, 'i').test(s))
    const fits = (x: any) => SKIP.test(s) || (x.kind === 'truck' ? platesIn(s.toUpperCase()).length > 0
      : x.kind === 'be' ? /\b\d{7}\b/.test(s) || YES.test(s) || LATER.test(s)
      : x.kind === 'move' ? MOVE_WORDS.some(([re]) => re.test(s))
      : x.kind === 'deliver' ? DELIVER_WORDS.some(([re]) => re.test(s))
      : YES.test(s) || LATER.test(s))
    q = byJob || (open.filter(fits).length === 1 ? open.filter(fits)[0] : open.length === 1 && fits(open[0]) ? open[0] : null)
    if (!q) return null
    // "1 MH43U3271" / "J-583 MH43U3271": the number or job no in front is not part of the answer
    rest = s.replace(/^\d\s*[.):-]?\s+/, '').replace(new RegExp(`\\bJ[-. ]*0*${String(q.job_no).replace(/\D/g, '')}\\b`, 'i'), ' ').trim()
    if (SKIP.test(rest)) ans = 'skip'
    else if (LATER.test(rest)) ans = 'later'
    else if (q.kind === 'move') ans = MOVE_WORDS.find(([re]) => re.test(rest))?.[1] || null
    else if (q.kind === 'deliver') ans = DELIVER_WORDS.find(([re]) => re.test(rest))?.[1] || null
    // "not delivered yet", "duty abhi bhara nahi", "file nahi hua": a no, even with the yes word in it
    else if (NEGATED.test(rest)) ans = 'later'
    else if (YES.test(rest)) ans = 'yes'
  }
  const job = q.job_no
  const close = (status: string, answer: string) => admin.from('bot_questions').update({ status, answer: String(answer || '').slice(0, 300), answered_at: new Date().toISOString() }).eq('key', q.key)
  const failed = (r: string) => !String(r).startsWith('✅')

  if (ans === 'skip') { await close('skipped', s); return { reply: `No problem, I won't ask about ${job} again.` } }
  // "not yet": left open, asked once more tomorrow (at most)
  if (ans === 'later') {
    await admin.from('bot_questions').update({ answer: 'not yet', answered_at: new Date().toISOString() }).eq('key', q.key)
    return { reply: q.kind === 'delivered' ? `OK, ${job} stays open. I'll check again tomorrow.` : `OK, I'll ask again tomorrow.` }
  }
  if (q.kind === 'deliver') {
    if (ans !== 'jds' && ans !== 'client') return null
    const r = await deps.change({ action: 'set_delivery_by', job, by: ans })
    if (String(r).startsWith('❌')) return { reply: r }
    await close('answered', ans)
    return { reply: ans === 'jds' ? `👍 Got it, JDS delivers ${job}.` : `👍 Got it, the client collects ${job}.` }
  }
  if (q.kind === 'move') {
    // a truck number said straight away is saved too
    if (platesIn(rest.toUpperCase()).length) {
      const r = await handlePost(admin, person, `${job}\n${rest}`, data)
      if (r?.saved) { await close('answered', rest); return { reply: r.reply, undo: r.undo } }
    }
    if (ans === 'truck') {
      const r = await deps.change({ action: 'set_leaves_by', job, mode: 'truck' })
      if (failed(r)) return { reply: r }
      await close('answered', 'truck')
      return { reply: `👍 Truck it is for ${job}. Send me the truck number once it's loaded.` }
    }
    if (ans === 'rail') {
      const r = await deps.change({ action: 'set_leaves_by', job, mode: 'rail' })
      if (failed(r)) return { reply: r }
      await close('answered', 'rail')
      return { reply: `🚆 Rail it is for ${job}. I'll follow the container on the train.` }
    }
    if (ans === 'client') {
      const r = await deps.change({ action: 'set_delivery_by', job, by: 'client' })
      if (failed(r)) return { reply: r }
      await close('answered', 'client')
      return { reply: `👍 Got it, the client collects ${job}. I won't ask about trucks for it.` }
    }
    return null
  }
  if (q.kind === 'duty') {
    if (ans !== 'yes') return null
    const r = await deps.change({ action: 'set_be_stage', job, stage: 'duty_paid' })
    if (failed(r)) return { reply: r }
    await close('answered', 'duty paid')
    return { reply: `💰 Noted, ${job}'s duty is paid. I'll tell you as soon as the OOC comes.` }
  }
  if (q.kind === 'truck') {
    if (!platesIn(rest.toUpperCase()).length) return null
    const r = await handlePost(admin, person, `${job}\n${rest}`, data)
    if (!r) return null
    if (r.saved) await close('answered', rest)
    return { reply: r.reply, undo: r.undo }
  }
  if (q.kind === 'be') {
    const be = rest.match(/\b(\d{7})\b/)
    if (!be) {
      // "Filed": the number and date are the next thing to ask (the question stays open)
      if (ans === 'yes') {
        await admin.from('bot_questions').update({ answer: 'filed', answered_at: new Date().toISOString() }).eq('key', q.key)
        return { reply: `Great! What's the BE number and date for ${job}? Type it or just say it.` }
      }
      return null
    }
    const d = rest.match(/\b(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{2,4}))?\b(?!\d)/)
    if (!d) return { reply: `Thanks. And the date of BE ${be[1]}?` }
    const year = d[3] ? (d[3].length === 2 ? `20${d[3]}` : d[3]) : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 4)
    const r = await handlePost(admin, person, `${job}\nBE ${be[1]}/${d[1]}.${d[2]}.${year}`, data)
    if (!r) return null
    if (r.saved) await close('answered', rest)
    return { reply: r.reply, undo: r.undo }
  }
  // delivered?
  if (ans === 'yes') { await close('answered', s); return { reply: await deps.markDelivered(q.job_id, job) } }
  return null
}
