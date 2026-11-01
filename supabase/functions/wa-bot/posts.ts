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

const PORTAL = 'https://jds-portal-prototype.vercel.app'
export const UNDO_MINUTES = 30
const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const nice = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const num = (jobNo: string) => String(jobNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^J0*/, 'J')
export const isUndo = (t: string) => /^\s*(undo|galat|wrong|cancel that|undo it)\s*[.!]*\s*$/i.test(t)

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
    for (const t of mine) {
      const pk = t.jobPkgs?.[`J-${num(job.job_no).slice(1)}`] ?? t.pkgs ?? null
      const have = list.find((x: any) => x.no === t.plate)
      const box = t.boxes[0] || null
      if (have) {
        // already there: only fill what it lacks
        let more = false
        if (box && !have.container) { have.container = box; more = true }
        if (t.boxes.length > 1 && !have.containers) { have.containers = t.boxes; more = true }
        if (t.mobile && !have.mobile) { have.mobile = t.mobile; more = true }
        if (pk != null && have.pkgs == null) { have.pkgs = pk; more = true }
        if (more) added.push(`${t.plate} (details added)`)
        continue
      }
      list.push({ no: t.plate, container: box, ...(t.boxes.length > 1 ? { containers: t.boxes } : {}), mobile: t.mobile || null, pkgs: pk, dl: null, at: now, by, via: 'post' })
      added.push(`${t.plate}${box ? ` · ${box}` : pk != null ? ` · ${pk} pkg${pk === 1 ? '' : 's'}` : ''}`)
      logs.push({ type: 'truck_dispatched', title: `Truck ${t.plate} assigned — ${job.job_no}${list.length > 1 ? ` (truck ${list.length})` : ''}`, note: `Truck ${t.plate}${box ? ` with ${box}` : ''}${pk != null ? `, ${pk} pkgs` : ''} (from ${person.name}'s post via WhatsApp)`, meta: { truckNo: t.plate, container: box, mobile: t.mobile || null, pkgs: pk } })
      for (const b of t.boxes) if (onJob.length && !onJob.includes(b)) warn.push(`${b} is not one of ${job.job_no}'s containers (kept on the truck only)`)
    }
    if (added.length) { update.trucks = list; update.truck_no = list[0].no; said.push(`${added.length === 1 ? 'truck' : `${added.length} trucks`}: ${added.join(', ')}`) }
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
  if (opts.allowedChange === false) return { saved: false, reply: '🔒 Your WhatsApp access is view only, so posts can\'t change jobs from your number. Please send it to Jose.' }
  const kind = post.kind === 'be' ? 'BE post' : 'truck post'
  const refs = post.jobs
  if (!refs.length) return { saved: false, reply: `I read this as a ${kind}, but it has no job number, so nothing was saved. Which job is it? Send it again with the job no (e.g. J-00583) at the top.` }
  const now = new Date().toISOString()
  const lines: string[] = []
  const notes: string[] = []
  const undoItems: any[] = []
  let confirm: Pending | null = null
  for (const ref of refs) {
    if (ref.series === 'ALS') { notes.push(`${ref.jobNo}: ALS (Adorn) jobs aren't in the portal, so nothing was saved for it.`); continue }
    const cached = findJob(data, ref.jobNo)
    if (!cached) { notes.push(`${ref.jobNo} isn't in the portal yet, so nothing was saved for it. Add it with Create job: ${PORTAL}/admin?tab=jobs`); continue }
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
    if (!Object.keys(c.update).length) { lines.push(`${who}: already has all of this, nothing new.`); for (const w of c.warn) notes.push(`⚠ ${job.job_no}: ${w}`); continue }
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
  const head = saved ? `✅ Saved from your ${kind}${opts.test ? ' (test: nothing really saved)' : ''}:` : lines.length ? `Read your ${kind}:` : `Read your ${kind}, but nothing was saved.`
  const reply = [head, ...lines.map((l) => `• ${l}`), ...(notes.length ? ['', ...notes] : []), ...(saved && !opts.test ? ['', `Wrong? Reply *UNDO* (within ${UNDO_MINUTES} min).`] : []),
    ...(confirm ? ['', 'Should the BE be replaced?'] : [])].join('\n')
  const undo: Pending | null = undoItems.length ? { action: 'undo_post', job_id: undoItems[0].job_id, job_no: undoItems.map((x) => x.job_no).join(', '), args: { items: undoItems }, summary: `undo the ${kind}`, at: now } : null
  return { reply, undo, confirm, saved }
}

// UNDO: puts back what the last post changed, unless the job was changed again since
export async function undoPost(admin: Admin, pending: Pending, person: Person): Promise<string> {
  const out: string[] = []
  for (const it of (pending.args?.items || []) as any[]) {
    const { data: job } = await admin.from('jobs').select('id, job_no, updated_at').eq('id', it.job_id).maybeSingle()
    if (!job) { out.push(`${it.job_no}: not found any more.`); continue }
    if (String(job.updated_at) !== String(it.saved_at)) { out.push(`${it.job_no}: changed again since, so I left it. Please correct it in the portal.`); continue }
    const { error } = await admin.from('jobs').update({ ...it.before, updated_at: new Date().toISOString() }).eq('id', it.job_id)
    if (error) { out.push(`${it.job_no}: could not undo (${error.message}).`); continue }
    if (it.log_ids?.length) await admin.from('activity_log').delete().in('id', it.log_ids)
    await admin.from('activity_log').insert({ type: 'note', action: 'note', title: `${it.job_no} — post undone`, note: `${person.name} undid what their WhatsApp post saved`, job_id: it.job_id, job_no: it.job_no, done_by_name: `${person.name} via WhatsApp`, meta: { job_id: it.job_id, via: 'whatsapp_post' } })
    out.push(`${it.job_no}: put back as it was.`)
  }
  return `↩️ Undone.\n${out.map((l) => `• ${l}`).join('\n')}`
}
