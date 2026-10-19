// What the JDS WhatsApp bot says. Built from SAVED portal data only:
// no AI, no ULIP calls. The portal's "Bot preview" page and the server
// (supabase/functions/wa-bot) both use this file, so the preview shows
// exactly what the team would receive.
//
// WhatsApp rules that shape this file:
//  - A message the bot starts (morning summary, alert) must use a template
//    Meta has approved. Template values must be one line each, so templates
//    carry a short version; the full text goes as a normal message once the
//    person has written to the bot in the last 24 hours.
//  - Replies to a person's question are normal messages (no template).
import { journeyFor, isDelivered, isExportJob, parseContainerNos, containerFinishedOn } from './journeyCore.js'

const DAY = 24 * 60 * 60 * 1000
const TZ = 'Asia/Kolkata'
const MAX_LINES = 8 // per section; the rest is "+N more"

// Templates to submit in Meta (WhatsApp Manager → Message templates).
// Category: Utility. Language: English. {{n}} = values filled by the bot.
// Submitted in WhatsApp Manager on 18 Oct 2026 with exactly this wording
// (Meta flagged a "Good morning" version as marketing, so they read as status updates).
export const TEMPLATES = {
  jds_morning_summary: {
    body: 'Hello {{1}}, here is your daily shipment status update for {{2}}: {{3}} shipments need urgent action, {{4}} tasks are due today and {{5}} shipments are arriving soon. Reply SUMMARY to see the details.',
    sample: ['Jose', 'Sun 18 Oct', '3', '5', '2'],
  },
  jds_alert: {
    body: 'Shipment status update for job {{1}}: {{2}}. Reply {{3}} to see the full job details.',
    sample: ['J-193 (Deepa Traders)', 'OOC granted, OOC 2071539740 dated 22 Jun. Arrange the truck', 'J-193'],
  },
}

// ── small helpers ──
const istDate = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
const dayText = (iso) => {
  if (!iso) return ''
  const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00+05:30` : iso)
  return isNaN(d) ? String(iso) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ })
}
// by the time in India, so a summary asked for in the evening doesn't say "Good morning"
const greeting = (now) => {
  const h = Number(new Date(now).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
const todayText = (now) => new Date(now).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })
const daysBetween = (fromIso, toIso) => Math.round((new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) / DAY)
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const shortClient = (c) => oneLine(c).replace(/\b(private|pvt\.?|limited|ltd\.?|llp|india)\b/gi, '').replace(/\s+/g, ' ').trim() || 'No client'
const jobTag = (job) => `${job.job_no} ${shortClient(job.client)}`
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function section(title, lines) {
  if (!lines.length) return ''
  const shown = lines.slice(0, MAX_LINES).map((l) => `• ${l}`)
  if (lines.length > MAX_LINES) shown.push(`  +${lines.length - MAX_LINES} more in the portal`)
  return `*${title}*\n${shown.join('\n')}`
}

// Open import jobs whose ship/flight is due by `days` from today and BE not filed
function arrivingSoon(data, today, days) {
  return data.jobs
    .filter((job) => !isExportJob(job) && !isDelivered(job) && job.eta)
    .map((job) => ({ job, j: journeyFor(job, data), inDays: daysBetween(today, String(job.eta).slice(0, 10)) }))
    .filter(({ j, inDays }) => !j.steps[0].done && inDays >= 0 && inDays <= days)
    .sort((a, b) => a.inDays - b.inDays)
}

// Which jobs a person hears about. Nobody is assigned jobs yet, so for now
// everyone hears about all jobs; once jobs have "assigned to", staff who
// are not admins hear only about theirs.
export function jobsFor(person, jobs) {
  if (!person || person.role === 'admin') return jobs
  const mine = jobs.filter((j) => j.assigned_to && (j.assigned_to === person.id || j.assigned_to === person.name))
  return mine.length ? mine : jobs
}

// ─────────────────────────────────────────────────────────────────────────────
// Morning summary (9:00)
// Returns { text, template: { name, values } }
// ─────────────────────────────────────────────────────────────────────────────
export function morningSummary(allData, person, now = new Date()) {
  const data = { ...allData, jobs: jobsFor(person, allData.jobs) }
  const today = istDate(now)
  // same count as the Today page: not delivered, and containers not all done
  const journeys = data.jobs.filter((job) => !isDelivered(job))
    .map((job) => ({ job, j: journeyFor(job, data) }))
    .filter(({ j }) => j.phase !== 'delivered')
  const open = journeys.map(({ job }) => job)

  const urgent = []
  const todo = []
  for (const { job, j } of journeys) {
    for (const a of j.attention) {
      if (a.level === 'red') urgent.push(`${jobTag(job)}: ${a.text}`)
      else if (a.level === 'amber') todo.push(`${jobTag(job)}: ${a.text}`)
    }
  }
  const soon = arrivingSoon(data, today, 2).map(({ job, j, inDays }) =>
    `${jobTag(job)}: ${inDays === 0 ? 'arrives today' : inDays === 1 ? 'arrives tomorrow' : `arrives ${dayText(job.eta)}`}${j.beFiled ? '' : ', BE not filed'}`)

  const count = (phase) => journeys.filter(({ j }) => j.phase === phase).length
  const name = oneLine(person?.name) || 'team'
  const dateText = todayText(now)

  const parts = [
    `${greeting(now)} ${name} 👋`,
    `*JDS jobs — ${dateText}*`,
    `${plural(open.length, 'open job')}: ${count('ooc')} waiting for OOC, ${count('release')} OOC done to move, ${count('truck')} on the road`,
    section(`🔴 Urgent (${urgent.length})`, urgent),
    section(`🟠 To do today (${todo.length})`, todo),
    section(`🚢 Arriving in the next 2 days (${soon.length})`, soon),
  ]
  if (!urgent.length && !todo.length) parts.push('✅ Nothing urgent today.')
  parts.push('Ask me: a job no (J-193), a container no or a BE no.')

  return {
    text: parts.filter(Boolean).join('\n\n'),
    template: { name: 'jds_morning_summary', values: [name, dateText, String(urgent.length), String(todo.length), String(soon.length)] },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Instant alerts
// `events` = activity_log rows since the last check. Each alert has a `key`;
// the server sends a key only once (so an alert never repeats).
// Returns [{ key, jobId, kind, text, template }]
// ─────────────────────────────────────────────────────────────────────────────
// Every container event of an open job is an alert (Jose, 19 Oct 2026: "any
// container related alert, whether it's port in, port out, CFS in, CFS out").
// The same event for several boxes of one job in one check is one message.
const BOX_ICON = [[/PORT IN|DISCHARGE|VESSEL ARRIVED|DPD/, '🚢'], [/PORT OUT|GATE OUT|GATE CROSSED|TERMINAL OUT/, '🚛'], [/CFS IN|ICD IN|GATE IN|TERMINAL IN/, '🏭'], [/CFS OUT|ICD OUT/, '🚚'], [/TOLL|STATION|RAIL|WAGON/, '🛣️'], [/EMPTY/, '📦']]
const boxIcon = (ev) => BOX_ICON.find(([re]) => re.test(ev))?.[1] || '📦'
const placeOf = (note) => oneLine(String(note || '').split('·').slice(1).join('·')).replace(/^Latest:.*$/i, '').trim() || null

export function instantAlerts(data, events = [], now = new Date()) {
  const today = istDate(now)
  const byId = Object.fromEntries(data.jobs.map((j) => [j.id, j]))
  const byNo = Object.fromEntries(data.jobs.map((j) => [j.job_no, j]))
  const out = []
  const add = (kind, key, job, what) => {
    if (!job || isDelivered(job)) return
    const who = `${job.job_no} (${shortClient(job.client)})`
    out.push({
      key, kind, jobId: job.id, jobNo: job.job_no,
      text: `🔔 *${who}*\n${what}\nReply ${job.job_no} for the job details.`,
      template: { name: 'jds_alert', values: [who, oneLine(what).replace(/[.\s]+$/, ''), job.job_no] },
    })
  }

  // from what the portal recorded
  for (const ev of events) {
    const meta = ev.meta || {}
    if (ev.action === 'ooc_granted') {
      const job = byId[ev.job_id] || byNo[ev.job_no] || byNo[String(ev.title || '').split('— ').pop()?.trim()]
      const ooc = meta.ooc_no ? `OOC ${meta.ooc_no}${meta.ooc_date ? ` dated ${dayText(meta.ooc_date)}` : ''}` : 'OOC granted'
      add('ooc', `ooc:${job?.id}:${meta.ooc_no || ev.id}`, job, `✅ OOC granted: ${ooc}. Arrange truck or rail.`)
    }
  }

  // container events, grouped by job + event
  const groups = new Map()
  for (const ev of events) {
    if (ev.action !== 'container_update') continue
    const meta = ev.meta || {}
    const job = byId[meta.job_id || ev.job_id]
    const box = meta.container_no || String(ev.title || '').split(' — ')[0]
    const what = oneLine(String(ev.title || '').split(' — ')[1] || '').toUpperCase()
    if (!job || !box || !what || isDelivered(job)) continue
    // only this job's trip: skip a box whose work for this job is already over
    const row = data.containersByNo?.[String(box).toUpperCase()]
    if (row && containerFinishedOn(row, job)) continue
    const k = `${job.id}|${what}`
    const g = groups.get(k) || { job, what, boxes: [], ids: [], place: null, more: 0 }
    if (!g.boxes.includes(box)) g.boxes.push(box)
    g.ids.push(ev.id)
    g.place ||= placeOf(ev.note)
    const extra = String(ev.note || '').match(/^(\d+) new events/)
    if (extra) g.more += Number(extra[1]) - 1
    groups.set(k, g)
  }
  for (const g of groups.values()) {
    const event = (g.what.charAt(0) + g.what.slice(1).toLowerCase()).replace(/\b(cfs|icd|dpd|dpe)\b/gi, (w) => w.toUpperCase())
    const boxes = g.boxes.length === 1 ? `Container ${g.boxes[0]}` : `${g.boxes.length} containers (${g.boxes.slice(0, 4).join(', ')}${g.boxes.length > 4 ? ', …' : ''})`
    add('container', `box:${g.ids.sort().join(',')}`, g.job,
      `${boxIcon(g.what)} ${boxes}: ${event}${g.place ? ` at ${g.place}` : ''}${g.more > 0 ? ` (and ${g.more} earlier update${g.more === 1 ? '' : 's'})` : ''}.`)
  }

  // worked out from today's saved data (once per job per day)
  for (const job of data.jobs) {
    if (isDelivered(job) || isExportJob(job)) continue
    const j = journeyFor(job, data)
    const left = j.freeDaysLeft
    if (left !== null && left >= 0 && left <= 2) {
      add('free_days', `free:${job.id}:${today}`, job,
        `⏱ ${left === 0 ? 'Last free day today' : `Only ${plural(left, 'free day')} left`} for the containers. Get them out to avoid detention.`)
    }
  }
  for (const { job, inDays } of arrivingSoon(data, today, 1)) {
    if (job.be_no && job.be_date) continue
    add('be_not_filed', `be:${job.id}:${today}`, job,
      `📄 ${inDays === 0 ? 'Arrives today' : 'Arrives tomorrow'} (ETA ${dayText(job.eta)}) and the BE is not filed yet.`)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// "Ask the bot": the answer to a message from the team
// ─────────────────────────────────────────────────────────────────────────────
const HELP = [
  '*JDS bot* — send me:',
  '• a job no, like J-193',
  '• a container no, like MSKU1234567',
  '• a BE no (7 digits)',
  '• SUMMARY for today\'s list',
  '• URGENT for urgent jobs only',
].join('\n')

function jobCard(job, data) {
  const j = journeyFor(job, data)
  const lines = [`*${job.job_no} — ${oneLine(job.client) || 'No client'}*`]
  if (job.goods) lines.push(oneLine(job.goods).slice(0, 80))
  const next = j.steps.find((s) => s.current)
  lines.push(j.steps.map((s) => `${s.done ? '✅' : s.current ? '▶️' : '▫️'} ${s.label}${s.when ? ` ${s.when}` : ''}${s.sub && !s.done ? ` (${s.sub})` : s.sub && s.id !== 'arrival' ? ` · ${s.sub}` : ''}`).join('\n'))
  if (next?.nextText) lines.push(`*${next.nextText}*`)
  const nos = parseContainerNos(job.containers)
  if (nos.length) {
    const rows = nos.slice(0, 10).map((no) => {
      const t = data.containersByNo[no]
      const free = t ? (j.containers.tracked.find((x) => x.container_no?.toUpperCase() === no)?.freeLeft ?? null) : null
      const freeText = free === null ? '' : free < 0 ? ` · detention ${-free}d` : ` · ${free} free day${free === 1 ? '' : 's'}`
      return `• ${no}: ${t ? oneLine(t.status_text || t.status || 'tracked') : 'not tracked'}${freeText}`
    })
    if (nos.length > 10) rows.push(`  +${nos.length - 10} more`)
    lines.push(`Containers (${nos.length}):\n${rows.join('\n')}`)
  }
  if (j.truck) lines.push(`Truck: ${j.truck}${j.truckLocation ? ` · last seen ${j.truckLocation.plaza}` : ''}`)
  if (j.attention.length) lines.push(j.attention.map((a) => `${a.level === 'red' ? '🔴' : a.level === 'amber' ? '🟠' : 'ℹ️'} ${a.text}`).join('\n'))
  return lines.join('\n\n')
}

export function answer(data, message, person, now = new Date()) {
  const text = oneLine(message).toUpperCase()
  if (!text || /^(HI|HELLO|HELP|MENU|\?)$/.test(text)) return HELP
  if (/^(SUMMARY|TODAY|SUMMARY PLEASE)$/.test(text)) return morningSummary(data, person, now).text
  if (text === 'URGENT') {
    const lines = jobsFor(person, data.jobs).filter((job) => !isDelivered(job))
      .flatMap((job) => journeyFor(job, data).attention.filter((a) => a.level === 'red').map((a) => `${jobTag(job)}: ${a.text}`))
    return lines.length ? section(`🔴 Urgent (${lines.length})`, lines) : '✅ Nothing urgent right now.'
  }

  // job no: "J-193", "j193", "193"
  const jm = text.match(/^J\s*-?\s*(\d{1,5})$/) || text.match(/^(\d{1,4})$/)
  if (jm) {
    const job = data.jobs.find((j) => String(j.job_no).toUpperCase().replace(/[^0-9]/g, '') === String(Number(jm[1])))
    return job ? jobCard(job, data) : `I could not find job J-${jm[1]}.`
  }
  // container no
  const cm = text.replace(/\s+/g, '').match(/^[A-Z]{4}\d{7}$/)
  if (cm) {
    const no = cm[0]
    const job = data.jobs.find((j) => parseContainerNos(j.containers).includes(no))
    if (job) return jobCard(job, data)
    const t = data.containersByNo[no]
    return t ? `${no}: ${oneLine(t.status_text || t.status)} (not linked to a job)` : `I could not find container ${no}.`
  }
  // BE no
  if (/^\d{7}$/.test(text)) {
    const job = data.jobs.find((j) => String(j.be_no || '').trim() === text)
    return job ? jobCard(job, data) : `I could not find BE ${text}.`
  }
  // client name: list their open jobs
  if (text.length >= 3) {
    const hits = data.jobs.filter((j) => !isDelivered(j) && String(j.client || '').toUpperCase().includes(text))
    if (hits.length === 1) return jobCard(hits[0], data)
    if (hits.length > 1) return section(`Open jobs for "${oneLine(message)}" (${hits.length})`, hits.map((j) => `${j.job_no}: ${journeyFor(j, data).steps.find((s) => s.current)?.nextText || 'in progress'}`)) + '\n\nReply a job no for details.'
  }
  return `Sorry, I did not understand "${oneLine(message).slice(0, 40)}".\n\n${HELP}`
}

// The ONLY numbers the bot sends to or answers (Jose's decisions, 18 Oct 2026:
// "only Jose for now", then also +91 99202 51089). To add someone, add a line.
// `name` is used when the number has no portal login.
export const BOT_PEOPLE = [
  { phone: '919920276224', name: 'Jose' },
  { phone: '919920251089', name: 'Iwin' },
]
export const BOT_NUMBERS = BOT_PEOPLE.map((p) => p.phone)

// Team members the bot talks to, in BOT_PEOPLE order. A number with a staff
// login ("<10-digit mobile>@jds.local") uses that login's name and role;
// one without a login is still included, with the name above.
// Returns [{ id, name, role, phone }].
export function teamFromProfiles(profiles = []) {
  const logins = {}
  for (const p of profiles) {
    const digits = String(p.phone || p.email || '').match(/^(?:\+?91)?([6-9]\d{9})(?:@jds\.local)?$/)
    if (digits && !logins[`91${digits[1]}`]) logins[`91${digits[1]}`] = p
  }
  return BOT_PEOPLE.map(({ phone, name }) => {
    const p = logins[phone]
    return p ? { id: p.id, name: p.name || name, role: p.role, phone } : { id: `wa:${phone}`, name, role: 'admin', phone }
  })
}
