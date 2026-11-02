// The team's own posts, sent or forwarded to the bot, fill the portal (Jose, 1 Nov 2026):
// the "BE filed" post and the truck-out post, exactly as they are written for the JD Group.
// No form, no AI (postReader.js reads them), no YES: what is new is saved at once and the
// reply says what was saved, with UNDO for a slip. Anything doubtful is NOT saved and is
// asked instead: a job not in the portal, a BE already on another job, a BE that would
// replace a different one (that one goes through the normal Yes / No).
import { readPost } from '../_shared/portal/postReader.js'
import { jobTrucks, parseContainerNos, BE_STAGES } from '../_shared/portal/journeyCore.js'
import type { Pending } from './actions.ts'

type Admin = any
type Person = { phone: string; name: string; level?: string; id?: string }

export const UNDO_MINUTES = 30
const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const nice = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const num = (jobNo: string) => String(jobNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^J0*/, 'J')
// "undo" said any way the team says it, typed or in a voice note (Jose, 1 Nov 2026: "they
// will say 'can you undo this?'"): "undo", "please undo that", "revert it", "that's wrong,
// take it back", "galat hai, wapas karo", "hata do". Only used while a post's save can be
// undone, and never for a message that names something else (a truck, a BE, a container)
const UNDO_WORDS = /\b(undo|un-do|revert|reverse|roll\s*back|take\s+(it|that|this)\s+back|cancel\s+(it|that|this|the\s+last|last|what)|remove\s+(it|that|this|what\s+you)|delete\s+(it|that|this|what\s+you)|put\s+(it|that)\s+back|galat|wapas|vapas|hata\s*(do|de|dijiye)|mat\s+(save|daalo|dalo)|wrong\s+(entry|post|one|job)|that'?s\s+wrong|it'?s\s+wrong|(that|it|this)\s+is\s+wrong|not\s+correct)\b/i
// a message that names a field and a new value is a change, not an undo ("mode wapas FCL
// kar do" = set the mode; live test 2 Nov 2026 took it as UNDO)
const CHANGE_WORDS = /\b(mode|fcl|lcl|air|bpt|mbpt|eta|line|cfs|free\s*days?|priority|urgent|truck|trucks|rail|train|vessel|ship|client|deliver\w*|note|stage|query|assess\w*|duty|ooc|be\s*no|bl|gaadi|gadi|gaari|container|box|invoice|bill|payment|charges?|amount|cheque|maal|cargo)\b/i
export const isUndo = (t: string, undoJobNo: string | null = null) => {
  const s = String(t || '').trim()
  if (!s || s.length > 120 || !UNDO_WORDS.test(s)) return false
  // a truck, a BE no or a container in the message: it's a new instruction, not an undo
  if (/\b[A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{4}\b|\b\d{7}\b|\b[A-Z]{3}U\d{7}\b/i.test(s)) return false
  // "undo" / "revert" said outright is an undo
  if (/\b(undo|un-do|revert|roll\s*back)\b/i.test(s)) return true
  // "wrong job, it's J-584" / "galat job": the post went on the wrong job
  if (/\b(wrong|galat)\s+job\b|\bjob\s+(galat|wrong)\b/i.test(s)) return true
  // "wapas", "galat", "hata do" only in a short message about the saved post itself: never one
  // naming another job ("J-712 ka invoice galat hai"), never a sentence ("J-711 gaadi wapas aa
  // gayi"), never one that names what to change (code check 3 Nov 2026)
  const nos = [...s.matchAll(/\bJ[-. ]*0*(\d{1,5})\b/gi)].map((m) => Number(m[1]))
  const mine = String(undoJobNo || '').match(/\d+/g)?.map(Number) || []
  if (nos.some((n) => !mine.includes(n))) return false
  if (s.split(/\s+/).length > 6) return false
  return !CHANGE_WORDS.test(s)
}
// a message correcting or removing something ("hata do", "remove", "nahi … hai", "galat",
// "cancel", "instead"): never saved as a post, never a plain yes
export const isCorrection = (t: string) => {
  const s = String(t || '')
  // a "not" / "nahi" in a real multi-line post is a remark ("Pending 2x40 not reach in cfs"):
  // only a short message with one is a correction
  return /\b(hata\w*|hatao|nikaal\s*do|nikal\s*do|remove\w*|delete\w*|cancel\w*|galat|wrong|instead|replace\w*|badl\w*|change\w*|correct(ion)?|sahi\s+(wala|number|no))\b/i.test(s)
    || (s.trim().split('\n').length <= 2 && /\b(nahi+n?|nhi|nai|not|mat)\b/i.test(s))
}

// not something that has happened: a question, a plan, the past or a request ("kal J-711 ka truck
// MH04… aayega", "J-711 MH04… kitne baje niklega", "BE … file karna hai", "old truck … tha",
// "MH04… RTO details"): never saved at once as a post, it goes through Yes / No (edge-case hunt,
// 3 Nov 2026: all of these were saved straight onto the job). A short typed message is read
// strictly; a real multi-line post card only for "not yet / to be done" (its own lines say "First
// Check", "OLD" machine, … which are not questions)
const NOT_DONE_SHORT = /\?|\b(kya|kaha|kahan|kab|kitne|kitna|kaun|kaunsa|where|when|what|which|how|why|status|details?|(?<!first\s)check\w*|kal|tomorrow|parso|aaye?ga|aaye?gi|ayega|ayegi|jaye?ga|jaye?gi|nikle?ga|niklegi|bhejenge|bhejna|bhejni|bhejo|will|going\s+to|karna\s+hai|karni\s+hai|hona\s+hai|hoga|hogi|plan\w*|tha|thi|old|purana|purani|pehle\s+wala|not\s+yet|abhi\s+(nahi|tak)|nahi\s+hua|pending\s+hai)\b/i
const NOT_DONE_CARD = /\b(not\s+yet\s+(filed|loaded|out|left|dispatched)|karna\s+hai|karni\s+hai|hona\s+hai|file\s+nahi|tomorrow|will\s+(load|be|go|leave))\b/i
export const notDoneYet = (t: string) => {
  const s = String(t || '')
  return s.trim().split('\n').filter((l) => l.trim()).length <= 2 ? NOT_DONE_SHORT.test(s) : NOT_DONE_CARD.test(s)
}

export { readPost }

// the portal job for "J-583" (the newest one with that number: numbers start again each April)
function findJob(data: any, jobNo: string) {
  const want = num(jobNo)
  return (data?.jobs || []).filter((j: any) => num(j.job_no) === want)
    .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null
}

// "06.02.2025" written on 6 Feb 2026: the year is a slip when the day and month are within
// a few days of today and only the year differs (seen 8 times this year: 2016, 2025, 20#6)
function fixYear(date: string | null, today: string): { date: string | null; fixed: boolean } {
  if (!date) return { date, fixed: false }
  if (date.slice(0, 4) === today.slice(0, 4)) return { date, fixed: false }
  const same = `${today.slice(0, 4)}${date.slice(4)}`
  const gap = (new Date(today).getTime() - new Date(same).getTime()) / 864e5
  return gap >= 0 && gap <= 7 ? { date: same, fixed: true } : { date, fixed: false }
}

const BG_WORD: Record<string, string> = { none: 'No BG', yes: 'BG', '100%': '100% BG' }
const beCardLine = (p: any, date: string | null) => [
  `BE ${p.be_no}${date ? ` (${nice(date)})` : ''}`, p.group && `Gr.${p.group}`, p.bg && BG_WORD[p.bg], p.lane_label,
  p.filing && p.filing[0].toUpperCase() + p.filing.slice(1), ...p.flags.map((f: any) => f.label),
].filter(Boolean).join(' · ')

export type PostResult = {
  reply: string
  undo?: Pending | null // what UNDO puts back
  confirm?: Pending | null // a change that needs Yes / No instead
  saved: boolean
}

// What a post would change on one job, worked out on the job's CURRENT row
function changeFor(post: any, job: any, person: Person, today: string, now: string) {
  const update: Record<string, unknown> = {}
  const logs: any[] = []
  const said: string[] = []
  const warn: string[] = []
  const meta = job.field_meta && typeof job.field_meta === 'object' ? { ...job.field_meta } : {}
  const by = `${person.name} via WhatsApp`

  if (post.kind === 'be') {
    const { date, fixed } = fixYear(post.be_date, today)
    if (fixed) warn.push(`the post says ${post.be_date.slice(0, 4)}; I took it as ${date!.slice(0, 4)}`)
    const card = { group: post.group, bg: post.bg, lane: post.lane, filing: post.filing, flags: post.flags.map((f: any) => f.id), be_no: post.be_no, at: now, by }
    const old = meta.be_card || {}
    const sameCard = old.be_no === post.be_no && ['group', 'bg', 'lane', 'filing'].every((k) => (old as any)[k] === (card as any)[k])
    const newBe = String(job.be_no || '') !== post.be_no || (date && String(job.be_date || '').slice(0, 10) !== date)
    if (newBe) {
      update.be_no = post.be_no
      if (date) update.be_date = date
      if ((Number(job.stage) || 0) < 4) update.stage = 4
      logs.push({ type: 'be_filed', title: `${job.job_no} — BE ${post.be_no} filed`, note: `BE ${post.be_no}${date ? ` dated ${date}` : ''} filed in LiveImpex (from ${person.name}'s post via WhatsApp)`, meta: { be_no: post.be_no, be_date: date } })
    }
    if (!sameCard) meta.be_card = card
    // RMS at filing = facilitated: the customs stage chip starts there (the team still moves it)
    const stageNow = meta.be_stage && meta.be_stage.be_no === post.be_no ? meta.be_stage.stage : null
    if (post.lane === 'rms' && !stageNow) {
      meta.be_stage = { stage: 'rms', be_no: post.be_no, at: now, by, note: null }
      const def = BE_STAGES.find((x: any) => x.id === 'rms')
      logs.push({ type: 'be_stage', title: `${job.job_no} — Customs: ${def?.label || 'RMS'}`, note: `BE ${post.be_no}`, meta: { stage: 'rms', be_no: post.be_no } })
    }
    if (!sameCard || meta.be_stage !== job.field_meta?.be_stage) update.field_meta = meta
    // (the BE already on the job: say only what was added, so nobody thinks the BE changed)
    if (newBe) said.push(beCardLine(post, date))
    else if (!sameCard) said.push(`BE ${post.be_no} was already there; added ${beCardLine({ ...post, be_no: '' }, null).replace(/^BE\s*·?\s*/, '') || 'the BE details'}`)
    if (!post.group) warn.push('no group (Gr.) in the post')
    if (!post.lane) warn.push('no RMS / APR / ACL line in the post')
    for (const n of post.notes) if (!fixed) warn.push(n)
  }

  if (post.kind === 'truck') {
    const list = jobTrucks(job).map((t: any) => ({ ...t }))
    const onJob = parseContainerNos(job.containers)
    const mine = post.trucks.filter((t: any) => !t.jobs.length || t.jobs.some((j: string) => num(j) === num(job.job_no)))
    const added: string[] = []
    const filled = new Set<string>() // trucks already on the job that got details
    const what = new Set<string>() // which details ("driver mobile", "container", "packages")
    for (const t of mine) {
      const pk = t.jobPkgs?.[`J-${num(job.job_no).slice(1)}`] ?? t.pkgs ?? null
      const have = list.find((x: any) => x.no === t.plate)
      const box = t.boxes[0] || null
      if (have) {
        // already there: only fill what it lacks
        if (box && !have.container) { have.container = box; filled.add(t.plate); what.add('container') }
        if (t.boxes.length > 1 && !have.containers) { have.containers = t.boxes; filled.add(t.plate); what.add('container') }
        if (t.mobile && !have.mobile) { have.mobile = t.mobile; filled.add(t.plate); what.add('driver mobile') }
        if (pk != null && have.pkgs == null) { have.pkgs = pk; filled.add(t.plate); what.add('packages') }
        continue
      }
      list.push({ no: t.plate, container: box, ...(t.boxes.length > 1 ? { containers: t.boxes } : {}), mobile: t.mobile || null, pkgs: pk, dl: null, at: now, by, via: 'post' })
      added.push(`${t.plate}${box ? ` · ${box}` : pk != null ? ` · ${pk} pkg${pk === 1 ? '' : 's'}` : ''}`)
      logs.push({ type: 'truck_dispatched', title: `Truck ${t.plate} assigned — ${job.job_no}${list.length > 1 ? ` (truck ${list.length})` : ''}`, note: `Truck ${t.plate}${box ? ` with ${box}` : ''}${pk != null ? `, ${pk} pkgs` : ''} (from ${person.name}'s post via WhatsApp)`, meta: { truckNo: t.plate, container: box, mobile: t.mobile || null, pkgs: pk } })
      for (const b of t.boxes) if (onJob.length && !onJob.includes(b)) warn.push(`${b} is not one of ${job.job_no}'s containers (kept on the truck only)`)
    }
    if (added.length || filled.size) { update.trucks = list; update.truck_no = list[0].no }
    if (added.length) said.push(`${added.length === 1 ? 'new truck' : `${added.length} new trucks`}: ${added.join(', ')}`)
    // ("driver mobiles" for several trucks, "driver mobile" for one)
    if (filled.size) said.push(`${filled.size === 1 ? `${[...filled][0]} was` : `the ${filled.size} trucks were`} already there, so I added the ${[...what].map((w) => (filled.size > 1 && w !== 'packages' ? `${w}s` : w)).join(' and ')}`)
    if (post.pending) {
      const meta2 = (update.field_meta as any) || meta
      if (meta2.dispatch_pending?.text !== post.pending) {
        update.field_meta = { ...meta2, dispatch_pending: { text: post.pending, count: post.pendingCount, at: now, by } }
        said.push(`pending: ${post.pending}`)
      }
    }
    for (const p of post.problems) if (!/no job number/.test(p)) warn.push(p)
  }
  return { update, logs, said, warn }
}

// Reads a message; returns null when it is not a post (the bot then answers as before).
// test = work everything out on the live data but save nothing.
export async function handlePost(admin: Admin, person: Person, text: string, data: any, opts: { test?: boolean; allowedChange?: boolean } = {}): Promise<PostResult | null> {
  const today = todayIst()
  const post: any = readPost(text, { postDate: today })
  if (!post) return null
  // a correction or a removal is never a post ("J-711 se truck MH04AB1234 hata do", "truck
  // MH04… nahi, MH04… hai", "remove MH04… from J-711"): it goes to the assistant, which asks
  // Yes / No (code check 3 Nov 2026: these were saved straight on as a NEW truck)
  if (isCorrection(text) || notDoneYet(text)) return null
  // a BE written in a sentence, with neither the group (Gr.) nor the RMS / APR / ACL line of a
  // real BE card, goes through "Shall I go ahead?" like any typed change (live test 2 Nov
  // 2026: "J-598 ka BE 1234567 dated 15.11.2026" was saved straight onto a real job)
  if (post.kind === 'be' && !post.group && !post.lane) return null
  // a BE dated after today is never saved
  if (post.kind === 'be') {
    const { date } = fixYear(post.be_date, today)
    if (date && date > today) return { saved: false, reply: `The BE date ${nice(date)} is in the future, so nothing was saved. Please check the date.` }
  }
  if (opts.allowedChange === false) return { saved: false, reply: '🔒 Your WhatsApp access is view only, so posts can\'t change jobs from your number. Please send it to Jose.' }
  const kind = post.kind === 'be' ? 'BE post' : 'truck post'
  const refs = post.jobs
  if (!refs.length) return { saved: false, reply: `I read this as a ${kind}, but it has no job number, so nothing was saved. Which job is it? Send it again with the job no at the top.` }
  const now = new Date().toISOString()
  const lines: string[] = []
  const notes: string[] = []
  const undoItems: any[] = []
  let confirm: Pending | null = null
  for (const ref of refs) {
    if (ref.series === 'ALS') { notes.push(`${ref.jobNo}: ALS (Adorn) jobs aren't in the portal, so nothing was saved for it.`); continue }
    const cached = findJob(data, ref.jobNo)
    if (!cached && post.kind === 'be') {
      // a BE post for a job the portal doesn't have yet: the job is made from it (Jose,
      // 1 Nov 2026: "it should add the new job if they forward like this")
      const made = await createFromBePost(admin, post, ref.jobNo, data, person, today, now, !!opts.test)
      if (made.line) lines.push(made.line)
      notes.push(...made.notes)
      if (made.undo) undoItems.push(made.undo)
      continue
    }
    if (!cached) { notes.push(`${ref.jobNo} isn't in the portal yet, so nothing was saved for it. Add it in the portal with Create job.`); continue }
    // the job as it is right now (the bot's copy can be a few minutes old)
    const { data: job } = await admin.from('jobs').select('*').eq('id', cached.id).maybeSingle()
    if (!job) { notes.push(`${ref.jobNo} could not be read just now; nothing was saved for it.`); continue }
    const who = `*${job.job_no}*${job.client ? ` · ${job.client}` : ''}`
    if (post.kind === 'be') {
      // the same BE on another job is a slip (J-00893 and J-00883 had BE 7372895 in Feb)
      const clash = (data?.jobs || []).find((j: any) => j.id !== job.id && String(j.be_no || '') === post.be_no)
      if (clash) { notes.push(`⚠ BE ${post.be_no} is already on *${clash.job_no}*${clash.client ? ` (${clash.client})` : ''}, so nothing was saved on ${job.job_no}. Please check which job it belongs to.`); continue }
      if (job.be_no && String(job.be_no) !== post.be_no) {
        const { date } = fixYear(post.be_date, today)
        if (date) confirm = { action: 'record_be', job_id: job.id, job_no: job.job_no, args: { be_no: post.be_no, be_date: date }, summary: `Replace BE ${job.be_no} with *${post.be_no}* (${nice(date)}) on ${job.job_no}${job.client ? ` (${job.client})` : ''}`, at: now }
        notes.push(`${job.job_no} already has BE ${job.be_no}, and this post says ${post.be_no}.`)
        continue
      }
    }
    const c = changeFor(post, job, person, today, now)
    if (!Object.keys(c.update).length) { lines.push(`${who}: I already had all of this, so nothing changed.`); for (const w of c.warn) notes.push(`⚠ ${job.job_no}: ${w}`); continue }
    if (!opts.test) {
      const before: Record<string, unknown> = {}
      for (const k of Object.keys(c.update)) before[k] = job[k] ?? null
      const { data: saved, error } = await admin.from('jobs').update({ ...c.update, updated_at: now }).eq('id', job.id).select('updated_at').single()
      if (error) { notes.push(`❌ ${job.job_no}: could not save (${error.message}). Nothing was changed.`); continue }
      const logIds: string[] = []
      for (const l of c.logs) {
        const { data: row } = await admin.from('activity_log').insert({
          type: l.type, action: l.type, title: l.title, note: l.note, job_id: job.id, job_no: job.job_no, done_by_name: `${person.name} via WhatsApp`,
          meta: { job_id: job.id, job_no: job.job_no, via: 'whatsapp_post', ...l.meta },
        }).select('id').single()
        if (row?.id) logIds.push(row.id)
      }
      undoItems.push({ job_id: job.id, job_no: job.job_no, before, saved_at: saved?.updated_at || now, log_ids: logIds })
    }
    lines.push(`${who}: ${c.said.join('; ')}`)
    for (const w of c.warn) notes.push(`⚠ ${job.job_no}: ${w}`)
  }
  const saved = undoItems.length > 0 || (!!opts.test && lines.some((l) => !/nothing new/.test(l)))
  const head = saved ? `✅ Got it, saved from your ${kind}${opts.test ? ' (test: nothing really saved)' : ''}:` : lines.length ? `Thanks, I read your ${kind}:` : `I read your ${kind}, but didn't save anything.`
  const reply = [head, ...lines.map((l) => `• ${l}`), ...(notes.length ? ['', ...notes] : []), ...(saved && !opts.test ? ['', `If something's wrong, just tell me to undo it (any time in the next ${UNDO_MINUTES} min).`] : []),
    ...(confirm ? ['', 'Should the BE be replaced?'] : [])].join('\n')
  const undo: Pending | null = undoItems.length ? { action: 'undo_post', job_id: undoItems[0].job_id, job_no: undoItems.map((x) => x.job_no).join(', '), args: { items: undoItems }, summary: `undo the ${kind}`, at: now } : null
  return { reply, undo, confirm, saved }
}

// The client as already spelled on earlier jobs: "Vendkin" → "Vendekin Technologies",
// "NNC" → "Divine / NNC", "Limitless" → "Limitless Components EXIM"; else as written
const squash = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
export function knownClient(written: string, data: any): { name: string; known: boolean } {
  const want = squash(written)
  const names = [...new Set((data?.jobs || []).map((j: any) => String(j.client || '').trim()).filter(Boolean))] as string[]
  if (!want) return { name: '', known: false }
  const hit = names.find((n) => squash(n) === want)
    || names.find((n) => squash(n).startsWith(want) || want.startsWith(squash(n)))
    || names.find((n) => n.split(/[\s/]+/).some((w) => squash(w) === want))
    || (want.length >= 4 ? names.find((n) => squash(n).slice(0, 4) === want.slice(0, 4)) : undefined)
  return hit ? { name: hit, known: true } : { name: written.trim(), known: false }
}

// A new job from a "BE filed" post: job no, client, BE no / date and the BE details from the
// post; "Air" in the job line = an air job, "Mumbai" / "MBPT" = old Mumbai port, else sea FCL.
// Only a BE from the last 10 days (an old forwarded post never makes an old job), never an
// ALS job, never a BE that is already on another job. UNDO deletes it again.
async function createFromBePost(admin: Admin, post: any, jobNo: string, data: any, person: Person, today: string, now: string, test: boolean) {
  const notes: string[] = []
  const { date } = fixYear(post.be_date, today)
  const age = date ? (new Date(today).getTime() - new Date(date).getTime()) / 864e5 : null
  if (!date || age === null || age < 0 || age > 10) {
    notes.push(`${jobNo} isn't in the portal, and this BE is ${date ? `from ${nice(date)}` : 'undated'}, so I didn't make a new job from it. Add it in the portal with Create job.`)
    return { line: null, notes, undo: null }
  }
  const clash = (data?.jobs || []).find((j: any) => String(j.be_no || '') === post.be_no)
  if (clash) { notes.push(`⚠ BE ${post.be_no} is already on *${clash.job_no}*, so I didn't make ${jobNo}. Please check which job it belongs to.`); return { line: null, notes, undo: null } }
  // the client: the job line without the job no, "Air" and the place
  const written = String(post.client || '').replace(/\b(air|mumbai|pune|goa|mbpt|bpt|lcl|fcl)\b/gi, ' ').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!written) { notes.push(`${jobNo} isn't in the portal and the post has no client name, so I didn't make it. Send it with the client name after the job no.`); return { line: null, notes, undo: null } }
  const client = knownClient(written, data)
  const header = String(post.client || '')
  const mode = post.air ? 'Air' : /\b(mumbai|mbpt|bpt)\b/i.test(header) ? 'BPT/MBPT' : /\blcl\b/i.test(header) ? 'Sea LCL' : 'Sea FCL'
  const port = mode === 'Air' ? 'INBOM4' : mode === 'BPT/MBPT' ? 'INBOM1' : 'INNSA1'
  const by = `${person.name} via WhatsApp`
  const field_meta: Record<string, unknown> = {
    created_via: 'whatsapp_post',
    be_card: { group: post.group, bg: post.bg, lane: post.lane, filing: post.filing, flags: post.flags.map((f: any) => f.id), be_no: post.be_no, at: now, by },
    ...(post.lane === 'rms' ? { be_stage: { stage: 'rms', be_no: post.be_no, at: now, by, note: null } } : {}),
  }
  const line = `*${jobNo}* · ${client.name}${client.known ? '' : ' (new client name)'}: *new job made* · ${mode} · ${beCardLine(post, date)}`
  notes.push(`${jobNo} wasn't in the portal, so I made it from the BE post. Send its BE or BL PDF here and I'll fill in the rest (${mode === 'Air' ? 'AWB and flight' : 'containers, BL and ship'}).${mode === 'Sea FCL' ? ' I set it as Sea FCL; tell me if it\'s LCL.' : ''}`)
  if (test) return { line, notes, undo: null }
  const uuid = /^[0-9a-f-]{36}$/i.test(String((person as any).id || '')) ? (person as any).id : null
  const { data: madeJob, error } = await admin.from('jobs').insert({
    job_no: jobNo, client: client.name, mode, port_code: port, job_type: 'import', stage: 4, priority: 'normal', free_days: 14,
    be_no: post.be_no, be_date: date, created_by: uuid, field_meta, updated_at: now,
  }).select('id, job_no, updated_at').single()
  if (error || !madeJob) return { line: null, notes: [`❌ Could not make ${jobNo}: ${error?.message || 'unknown error'}.`], undo: null }
  const logIds: string[] = []
  for (const l of [
    { type: 'job_created', title: `${jobNo} — Job created`, note: `${client.name} · ${mode} (from ${person.name}'s BE post via WhatsApp)` },
    { type: 'be_filed', title: `${jobNo} — BE ${post.be_no} filed`, note: `BE ${post.be_no} dated ${date} filed in LiveImpex (from ${person.name}'s post via WhatsApp)` },
  ]) {
    const { data: row } = await admin.from('activity_log').insert({ ...l, action: l.type, job_id: madeJob.id, job_no: jobNo, done_by_name: by, meta: { job_id: madeJob.id, job_no: jobNo, via: 'whatsapp_post' } }).select('id').single()
    if (row?.id) logIds.push(row.id)
  }
  return { line, notes, undo: { job_id: madeJob.id, job_no: jobNo, created: true, saved_at: madeJob.updated_at || now, log_ids: logIds } }
}

// UNDO: puts back what the last post changed, unless the job was changed again since
// (a job the post made is deleted again)
export async function undoPost(admin: Admin, pending: Pending, person: Person): Promise<string> {
  const out: string[] = []
  for (const it of (pending.args?.items || []) as any[]) {
    const { data: job } = await admin.from('jobs').select('id, job_no, updated_at').eq('id', it.job_id).maybeSingle()
    if (!job) { out.push(`${it.job_no}: not found any more.`); continue }
    if (it.created && String(job.updated_at || '') === String(it.saved_at || '')) {
      if (it.log_ids?.length) await admin.from('activity_log').delete().in('id', it.log_ids)
      const { error } = await admin.from('jobs').delete().eq('id', it.job_id)
      out.push(error ? `${it.job_no}: could not remove it (${error.message})` : `${it.job_no} is removed again`)
      continue
    }
    if (String(job.updated_at) !== String(it.saved_at)) { out.push(`${it.job_no}: changed again since, so I left it. Please correct it in the portal.`); continue }
    const { error } = await admin.from('jobs').update({ ...it.before, updated_at: new Date().toISOString() }).eq('id', it.job_id)
    if (error) { out.push(`${it.job_no}: could not undo (${error.message}).`); continue }
    if (it.log_ids?.length) await admin.from('activity_log').delete().in('id', it.log_ids)
    await admin.from('activity_log').insert({ type: 'note', action: 'note', title: `${it.job_no} — post undone`, note: `${person.name} undid what their WhatsApp post saved`, job_id: it.job_id, job_no: it.job_no, done_by_name: `${person.name} via WhatsApp`, meta: { job_id: it.job_id, via: 'whatsapp_post' } })
    out.push(`${it.job_no} is back the way it was`)
  }
  // never "Done" for what could not be undone (live test 2 Nov 2026)
  const failed = (l: string) => /changed again since|not found|could not/.test(l)
  const tidy = (l: string) => l.replace(/\.+$/, '')
  const ok = out.filter((l) => !failed(l)), bad = out.filter(failed)
  if (!bad.length) return ok.length === 1 ? `↩️ Done, I've undone that: ${tidy(ok[0])}.` : `↩️ Done, I've undone that:\n${ok.map((l) => `• ${tidy(l)}`).join('\n')}`
  const lines = [...(ok.length ? [`↩️ Undone: ${ok.map(tidy).join('; ')}.`] : []), `⚠️ Couldn't undo: ${bad.map(tidy).join('; ')}.`]
  return lines.join('\n')
}
