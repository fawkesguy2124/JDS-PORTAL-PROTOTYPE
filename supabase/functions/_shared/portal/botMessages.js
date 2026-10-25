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
import { vesselsOf, cargoOnShip, jobImo, igmSiblings } from './ships.js'

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

// When a job's ship is due: the ship tracking's ETA (follows the line's latest plan),
// else the ETA typed on the job, else the IGM's expected arrival
function shipEta(job, data) {
  const sea = data.seaByJob?.[job.id]
  if (sea && !sea.error && !sea.pod_actual && sea.pod_date) return String(sea.pod_date).slice(0, 10)
  if (job.eta) return String(job.eta).slice(0, 10)
  const igm = [].concat(data.resultsByJob?.[job.id]?.['ICEGATE/01'] || [])
  const d = igm.map((r) => r?.parsed?.extra?.expectedArrival).find(Boolean)
  return d ? String(d).slice(0, 10) : null
}

// Ship alerts (Jose, 22 Oct 2026), one message per ship, all its jobs in it:
//  • the ship arrives today / tomorrow, with each job's BE filed or not
//  • all our cargo on the ship is unloaded (seen in the container events), so
//    the ship leaves the Vessels page
function shipAlerts(data, today, now) {
  const ships = new Map()
  for (const job of data.jobs) {
    if (isDelivered(job) || isExportJob(job) || /air/i.test(job.mode || '')) continue
    const j = journeyFor(job, data)
    for (const name of vesselsOf(job, data)) {
      const g = ships.get(name) || { name, jobs: [] }
      g.jobs.push({ job, cargo: cargoOnShip(job, name, data, j), eta: shipEta(job, data) })
      ships.set(name, g)
    }
  }
  const out = []
  const push = (kind, key, g, list, what) => {
    const nos = list.map((x) => x.job.job_no)
    const who = `${nos.join(', ')} (ship ${g.name})`
    out.push({
      key, kind, jobId: list[0].job.id, jobNo: nos[0], jobIds: list.map((x) => x.job.id),
      text: `🔔 *Ship ${g.name}*\n${what}\nReply ${nos[0]} for the job details.`,
      template: { name: 'jds_alert', values: [who, oneLine(what).replace(/[.\s]+$/, ''), nos[0]] },
    })
  }
  for (const g of ships.values()) {
    const aboard = g.jobs.filter((x) => x.cargo.onBoard)
    // arriving: the earliest ETA of the jobs still on board
    const due = aboard.filter((x) => x.eta).map((x) => ({ ...x, inDays: daysBetween(today, x.eta) })).filter((x) => x.inDays >= 0 && x.inDays <= 1)
    if (due.length && !aboard.some((x) => x.cargo.arrivedAt)) {
      const first = Math.min(...due.map((x) => x.inDays))
      const lines = aboard.map((x) => `• ${jobTag(x.job)}: BE ${x.job.be_no ? 'filed ✅' : 'not filed ❌'}`).join('\n')
      push('ship_due', `ship_due:${g.name}:${today}`, g, aboard,
        `🚢 Arrives ${first === 0 ? 'today' : 'tomorrow'} at ${aboard[0].job.port_code === 'INBOM1' ? 'Mumbai port' : 'Nhava Sheva'} (ETA ${dayText(due.find((x) => x.inDays === first).eta)}) with ${plural(aboard.length, 'job')}:\n${lines}`)
    }
    // unloaded: nothing of ours left on board, and the containers show it in the last 36 h
    const open = g.jobs.filter((x) => Number(x.job.stage) < 7)
    const when = open.map((x) => x.cargo.unloadedOn).filter(Boolean).sort().pop()
    if (open.length && !aboard.length && open.every((x) => x.cargo.unloadedOn) && when && now - new Date(when) < 36 * 60 * 60 * 1000) {
      push('ship_unloaded', `ship_unloaded:${g.name}:${when.slice(0, 10)}`, g, open,
        `⚓ All our cargo is unloaded (${dayText(when)}): ${open.map((x) => jobTag(x.job)).join(', ')}. The ship is now off the Vessels page.`)
    }
  }
  return out
}

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
    // the ship tracking saw the ship arrive (Jose, 25 Oct 2026)
    if (ev.action === 'ship_arrived') {
      const job = byId[ev.job_id] || byId[meta.job_id] || byNo[ev.job_no]
      add('ship_arrived', `ship_arrived:${job?.id}`, job,
        `⚓ Ship arrived at ${meta.port || 'the port'}${ev.note ? ` (${String(ev.note).replace(/^Arrived /, '')})` : ''}. BE ${job?.be_no ? 'filed ✅' : 'not filed ❌'}.`)
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
  // ships due / unloaded; a job in a "ship arrives" message gets no separate BE reminder
  const ships = shipAlerts(data, today, new Date(now).getTime())
  out.push(...ships)
  const inShipMsg = new Set(ships.filter((a) => a.kind === 'ship_due').flatMap((a) => a.jobIds))
  for (const { job, inDays } of arrivingSoon(data, today, 1)) {
    if ((job.be_no && job.be_date) || inShipMsg.has(job.id)) continue
    add('be_not_filed', `be:${job.id}:${today}`, job,
      `📄 ${inDays === 0 ? 'Arrives today' : 'Arrives tomorrow'} (ETA ${dayText(job.eta)}) and the BE is not filed yet.`)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// "Ask the bot": the answer to a message from the team
// ─────────────────────────────────────────────────────────────────────────────
const HELP = [
  '*JDS AI Assistant* — send me:',
  '• a job no, like J-193',
  '• a container no, like MSKU1234567',
  '• a BE no (7 digits)',
  '• SUMMARY for today\'s list',
  '• URGENT for urgent jobs only',
  '• or just ask, e.g. "which PCM jobs are waiting for OOC?"',
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
  for (const t of j.trucks || (j.truck ? [{ no: j.truck, location: j.truckLocation }] : [])) {
    lines.push(`Truck: ${t.no}${t.container ? ` (${t.container})` : ''}${t.location ? ` · last seen ${t.location.plaza}` : ''}`)
  }
  if (j.attention.length) lines.push(j.attention.map((a) => `${a.level === 'red' ? '🔴' : a.level === 'amber' ? '🟠' : 'ℹ️'} ${a.text}`).join('\n'))
  return lines.join('\n\n')
}

// Fixed commands (instant, no AI). With { fallback: false } it returns null for
// anything else, so the bot can pass the question to the assistant.
export function answer(data, message, person, now = new Date(), { fallback = true } = {}) {
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
  // client name: list their open jobs (one or two words only, not a sentence)
  if (text.length >= 3 && text.split(' ').length <= 2) {
    const hits = data.jobs.filter((j) => !isDelivered(j) && String(j.client || '').toUpperCase().includes(text))
    if (hits.length === 1) return jobCard(hits[0], data)
    if (hits.length > 1) return section(`Open jobs for "${oneLine(message)}" (${hits.length})`, hits.map((j) => `${j.job_no}: ${journeyFor(j, data).steps.find((s) => s.current)?.nextText || 'in progress'}`)) + '\n\nReply a job no for details.'
  }
  if (!fallback) return null
  return `Sorry, I did not understand "${oneLine(message).slice(0, 40)}".\n\n${HELP}`
}

// The owners: always admins of the bot, and can't be changed from WhatsApp (Jose's
// decisions, 18 Oct 2026: "only Jose for now", then also +91 99202 51089; 24 Oct:
// both full admin). Everyone else is in the bot_people table, added by an admin.
// `name` is used when the number has no portal login.
export const BOT_PEOPLE = [
  { phone: '919920276224', name: 'Jose' },
  { phone: '919920251089', name: 'Iwin' },
]
export const BOT_NUMBERS = BOT_PEOPLE.map((p) => p.phone)

// What each access level may do on WhatsApp (Jose, 24 Oct 2026):
//   view  = ask, summaries and alerts only
//   staff = + everyday changes (after Yes), checks, files, watches, reminders
//   admin = everything: new jobs, CFS payments, tasks, reports, who has access
export const LEVELS = ['view', 'staff', 'admin']
export const LEVEL_LABEL = { view: 'view only', staff: 'staff', admin: 'full admin' }
const NEEDS = {
  send_document: 'staff', send_pack: 'staff', check_truck_now: 'staff', find_ship_now: 'staff', check_customs_now: 'staff', check_customs_many: 'staff',
  set_reminder: 'staff', cancel_reminder: 'staff', watch: 'staff', cancel_watch: 'staff', change: 'staff', files: 'staff',
  send_report: 'admin', create_job: 'admin', record_payment: 'admin', assign_task: 'admin', set_access: 'admin', list_access: 'admin',
}
export const levelNeeded = (what) => NEEDS[what] || 'view'
export const allowed = (person, what) => LEVELS.indexOf(person?.level || 'view') >= LEVELS.indexOf(levelNeeded(what))

// Team members the bot talks to: the owners, then bot_people rows ({ phone, name,
// level }). A number with a staff login ("<10-digit mobile>@jds.local") uses that
// login's name and role; one without a login is still included, with its own name.
// Returns [{ id, name, role, phone, level }].
export function teamFromProfiles(profiles = [], extra = []) {
  const logins = {}
  for (const p of profiles) {
    const digits = String(p.phone || p.email || '').match(/^(?:\+?91)?([6-9]\d{9})(?:@jds\.local)?$/)
    if (digits && !logins[`91${digits[1]}`]) logins[`91${digits[1]}`] = p
  }
  const people = [...BOT_PEOPLE.map((x) => ({ ...x, level: 'admin' })), ...extra.filter((x) => !BOT_NUMBERS.includes(x.phone) && LEVELS.includes(x.level))]
  return people.map(({ phone, name, level }) => {
    const p = logins[phone]
    return p ? { id: p.id, name: p.name || name, role: p.role, phone, level } : { id: `wa:${phone}`, name, role: level === 'admin' ? 'admin' : 'staff', phone, level }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Missing details (8:00, after the summary; Jose, 24 Oct 2026): open sea imports
// that lack what the portal needs to follow them by itself (a ship with no ETA,
// containers or IMO can't leave the Vessels list on its own, e.g. J-584).
// Returns { items: [{ job, missing: [...] }], text, rows } — rows for a tap list.
// ─────────────────────────────────────────────────────────────────────────────
export function missingDetails(data, person) {
  const items = []
  for (const job of jobsFor(person, data.jobs || [])) {
    if (isDelivered(job) || isExportJob(job) || !/sea/i.test(job.mode || '')) continue
    const j = journeyFor(job, data)
    if (j.phase === 'delivered') continue
    const arrived = !!j.steps?.[0]?.done
    const boxes = parseContainerNos(job.containers)
    const missing = []
    if (!boxes.length && !/lcl/i.test(job.mode || '')) missing.push('containers')
    if (!job.shipping_line) missing.push('shipping line')
    if (!arrived) {
      if (!job.eta && !boxes.some((no) => data.containersByNo?.[no]?.eta)) missing.push('ETA')
      const igm = String(job.ulip_refs?.igm_no || '').replace(/\D/g, '')
      if (!jobImo(job, data) && !igmSiblings(job, data).some((o) => jobImo(o, data)) && igm.length < 5) missing.push('IMO')
    }
    if (missing.length) items.push({ job, missing })
  }
  items.sort((a, b) => b.missing.length - a.missing.length || String(a.job.job_no).localeCompare(String(b.job.job_no), undefined, { numeric: true }))
  const ask = { containers: (no) => `add container to ${no}`, 'shipping line': (no) => `set shipping line of ${no}`, ETA: (no) => `set ETA of ${no}`, IMO: (no) => `set IMO of ${no}` }
  const rows = items.flatMap(({ job, missing }) => missing.map((m) => ({ id: ask[m](job.job_no), title: `${m === 'containers' ? 'Containers' : m === 'shipping line' ? 'Line' : m} · ${job.job_no}`.slice(0, 24), description: `${job.client || 'No client'}`.slice(0, 72) }))).slice(0, 10)
  const text = items.length
    ? [
        `🧩 *Details missing* (${items.length} job${items.length === 1 ? '' : 's'}). With these filled, the portal follows the job by itself:`,
        ...items.slice(0, 12).map(({ job, missing }) => `• *${job.job_no}* (${job.client || 'no client'}): ${missing.join(', ')}`),
        ...(items.length > 12 ? [`…and ${items.length - 12} more`] : []),
        '',
        `Tap one below, or just reply, e.g. "ETA of ${items[0].job.job_no} is 28 Oct".`,
      ].join('\n')
    : null
  return { items, text, rows }
}
