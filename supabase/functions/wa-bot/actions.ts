// Changes the JDS team can make by WhatsApp (Jose, 20 Oct 2026).
// Safety: the AI only PROPOSES a change (the propose_change tool). The bot then
// asks "Reply YES to confirm"; only a YES makes the change, and the change is
// made here by plain code (never by the AI), on a fresh copy of the job, with
// the same checks as the portal, logged as done by that person via WhatsApp.
import { jobTrucks, plateNo, parseContainerNos } from '../_shared/portal/journeyCore.js'
import { jobsFor } from '../_shared/portal/botMessages.js'

type Person = { id: string; name: string; role: string; phone: string }
type Admin = any
export type Pending = { action: string; job_id: string; job_no: string; args: Record<string, any>; summary: string; at: string }

export const PENDING_MINUTES = 15
const TRUCK_RE = /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}|\d{2}BH\d{4}[A-Z]{1,2})$/
const norm = (s: unknown) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const nice = (iso: string) => new Date(`${iso}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export const ACTIONS = ['mark_delivered', 'add_truck', 'remove_truck', 'record_be', 'set_leaves_by', 'set_delivery_by', 'add_note']

export const CHANGE_TOOL = {
  name: 'propose_change',
  description: 'Make a change in the portal for the person: mark_delivered, add_truck (truck_no, optional container), remove_truck (truck_no), record_be (be_no 7 digits, be_date YYYY-MM-DD), set_leaves_by (mode truck/rail), set_delivery_by (by jds/client), add_note (note). Call it ONCE; the bot then asks the person to reply YES. Nothing changes until they do.',
  parameters: {
    type: 'OBJECT',
    properties: {
      action: { type: 'STRING', enum: ACTIONS },
      job: { type: 'STRING', description: 'Job number, e.g. J-638' },
      truck_no: { type: 'STRING' }, container: { type: 'STRING' },
      be_no: { type: 'STRING' }, be_date: { type: 'STRING' },
      mode: { type: 'STRING', enum: ['truck', 'rail'] },
      by: { type: 'STRING', enum: ['jds', 'client'] },
      note: { type: 'STRING' },
    },
    required: ['action', 'job'],
  },
}

// Checks a proposal against the loaded data. Returns the pending change (with the
// sentence the person confirms) or a plain error for the AI to pass on.
export function prepareChange(args: any, data: any, person: Person): { ok: true; pending: Pending } | { ok: false; error: string } {
  const action = String(args?.action || '')
  if (!ACTIONS.includes(action)) return { ok: false, error: 'This change cannot be made by WhatsApp yet. Please use the portal.' }
  const ref = norm(args?.job)
  const num = ref.replace(/^J/, '')
  const job = jobsFor(person, data.jobs).find((j: any) => norm(j.job_no) === ref || norm(j.job_no).replace(/^J/, '') === num)
  if (!job) return { ok: false, error: `Job ${args?.job || ''} was not found.` }
  const who = `${job.job_no}${job.client ? ` (${job.client})` : ''}`
  const p = (summary: string, a: Record<string, any> = {}) => ({ ok: true as const, pending: { action, job_id: job.id, job_no: job.job_no, args: a, summary, at: new Date().toISOString() } })

  if (action === 'mark_delivered') {
    if (Number(job.stage) >= 10) return { ok: false, error: `${job.job_no} is already marked delivered.` }
    return p(`Mark ${who} as *delivered*`)
  }
  if (action === 'add_truck' || action === 'remove_truck') {
    const truck = plateNo(args?.truck_no)
    if (!TRUCK_RE.test(truck)) return { ok: false, error: 'The truck number looks wrong. Example: MH04AB1234.' }
    const has = jobTrucks(job).some((t: any) => t.no === truck)
    if (action === 'remove_truck') {
      if (!has) return { ok: false, error: `Truck ${truck} is not on ${job.job_no}.` }
      return p(`Take truck *${truck}* off ${who}`, { truck })
    }
    if (has) return { ok: false, error: `Truck ${truck} is already on ${job.job_no}.` }
    let box = args?.container ? norm(args.container) : ''
    if (box && !parseContainerNos(job.containers).includes(box)) return { ok: false, error: `Container ${box} is not on ${job.job_no}.` }
    return p(`Add truck *${truck}*${box ? ` (carrying ${box})` : ''} to ${who}`, { truck, container: box || null })
  }
  if (action === 'record_be') {
    const no = String(args?.be_no || '').replace(/\D/g, '')
    const date = String(args?.be_date || '').slice(0, 10)
    if (!/^\d{7}$/.test(no)) return { ok: false, error: 'The BE number must be 7 digits, for example 2237841.' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Please give the BE date too.' }
    if (date > todayIst()) return { ok: false, error: 'The BE date cannot be in the future.' }
    return p(`Record BE *${no}* dated *${nice(date)}* on ${who}${job.be_no && job.be_no !== no ? ` (replacing BE ${job.be_no})` : ''}`, { be_no: no, be_date: date })
  }
  if (action === 'set_leaves_by') {
    const mode = args?.mode === 'rail' ? 'rail' : args?.mode === 'truck' ? 'truck' : null
    if (!mode) return { ok: false, error: 'Say truck or rail.' }
    return p(`Set ${who} to leave by *${mode}*`, { mode })
  }
  if (action === 'set_delivery_by') {
    const by = args?.by === 'client' ? 'client' : args?.by === 'jds' ? 'jds' : null
    if (!by) return { ok: false, error: 'Say JDS delivers or client collects.' }
    return p(`Set ${who}: *${by === 'client' ? 'client collects the cargo' : 'JDS delivers the cargo'}*`, { by })
  }
  // add_note
  const note = String(args?.note || '').trim().slice(0, 1000)
  if (!note) return { ok: false, error: 'What should the note say?' }
  return p(`Add a note to ${who}: "${note.length > 120 ? `${note.slice(0, 117)}…` : note}"`, { note })
}

export const confirmText = (pending: Pending) =>
  `Please confirm:\n${pending.summary}\n\nReply *YES* to do it, or *NO* to cancel.`

// Makes the confirmed change. Returns the reply to send.
export async function applyChange(admin: Admin, pending: Pending, person: Person): Promise<string> {
  const { data: job, error: readErr } = await admin.from('jobs').select('*').eq('id', pending.job_id).maybeSingle()
  if (readErr || !job) return `❌ Could not find ${pending.job_no} any more. Nothing was changed.`
  const by = `${person.name} via WhatsApp`
  const now = new Date().toISOString()
  const log = (type: string, title: string, note: string, meta: Record<string, unknown> = {}) => admin.from('activity_log').insert({
    type, action: type, title, note, job_id: job.id, job_no: job.job_no, done_by_name: by,
    meta: { job_id: job.id, job_no: job.job_no, via: 'whatsapp', ...meta },
  })
  const save = async (update: Record<string, unknown>) => {
    const { error } = await admin.from('jobs').update({ ...update, updated_at: now }).eq('id', job.id)
    return error ? `❌ Could not save: ${error.message}. Nothing was changed.` : null
  }
  const a = pending.args || {}

  if (pending.action === 'mark_delivered') {
    if (Number(job.stage) >= 10) return `${job.job_no} was already marked delivered.`
    const err = await save({ stage: 10 }); if (err) return err
    await log('stage_update', `${job.job_no} — Stage 10: Delivered`, `Stage updated by ${by}`, { old_stage: job.stage, new_stage: 10 })
    return `✅ Done: ${job.job_no} is marked *delivered*.`
  }
  if (pending.action === 'add_truck') {
    const list = jobTrucks(job)
    if (list.some((t: any) => t.no === a.truck)) return `Truck ${a.truck} is already on ${job.job_no}.`
    list.push({ no: a.truck, container: a.container || null, dl: null, at: now, by })
    const err = await save({ trucks: list, truck_no: list[0].no }); if (err) return err
    await log('truck_dispatched', `Truck ${a.truck} assigned — ${job.job_no}${list.length > 1 ? ` (truck ${list.length})` : ''}`,
      `Truck ${a.truck}${a.container ? ` with ${a.container}` : ''} (by ${by})`, { truckNo: a.truck, container: a.container || null })
    return `✅ Done: truck *${a.truck}* added to ${job.job_no}${list.length > 1 ? ` (${list.length} trucks now)` : ''}.`
  }
  if (pending.action === 'remove_truck') {
    const list = jobTrucks(job).filter((t: any) => t.no !== a.truck)
    const refs = { ...(job.ulip_refs || {}) }
    if (list[0]?.dl) refs.dl_no = list[0].dl; else delete refs.dl_no
    const err = await save({ trucks: list, truck_no: list[0]?.no || null, ulip_refs: refs }); if (err) return err
    await log('truck_removed', `Truck ${a.truck} removed — ${job.job_no}`, `Truck ${a.truck} taken off the job (by ${by})`, { truckNo: a.truck })
    return `✅ Done: truck *${a.truck}* taken off ${job.job_no}.`
  }
  if (pending.action === 'record_be') {
    const update: Record<string, unknown> = { be_no: a.be_no, be_date: a.be_date }
    if ((Number(job.stage) || 0) < 4) update.stage = 4
    const err = await save(update); if (err) return err
    await log('be_filed', `${job.job_no} — BE ${a.be_no} filed`, `BE ${a.be_no} dated ${a.be_date} filed in LiveImpex (recorded by ${by})`, { be_no: a.be_no, be_date: a.be_date })
    return `✅ Done: BE *${a.be_no}* (${nice(a.be_date)}) recorded on ${job.job_no}. Customs will be checked when the BE & OOC page is opened.`
  }
  if (pending.action === 'set_leaves_by' || pending.action === 'set_delivery_by') {
    const key = pending.action === 'set_leaves_by' ? 'onward_mode' : 'delivery_by'
    const value = pending.action === 'set_leaves_by' ? a.mode : a.by
    const field_meta = { ...(job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : {}), [key]: value }
    const err = await save({ field_meta }); if (err) return err
    const what = key === 'onward_mode' ? `leaves by ${value}` : value === 'client' ? 'client collects the cargo' : 'JDS delivers the cargo'
    await log('note', `${job.job_no} — ${what}`, `Set by ${by}`, { [key]: value })
    return `✅ Done: ${job.job_no} — ${what}.`
  }
  if (pending.action === 'add_note') {
    const text = String(a.note || '')
    const { error } = await log('note', text.length > 80 ? `${text.slice(0, 77)}…` : text, text)
    return error ? `❌ Could not save the note: ${error.message}` : `✅ Done: note added to ${job.job_no}.`
  }
  return 'This change cannot be made by WhatsApp. Nothing was changed.'
}

// "yes" / "no" in the ways the team writes them
export const isYes = (t: string) => /^\s*(yes|y|yess|yeah|yep|ok|okay|confirm|confirmed|haan|ha|han|haa|ji|sure|do it)\s*[.!👍]*\s*$/i.test(t)
export const isNo = (t: string) => /^\s*(no|n|nope|cancel|stop|nahi|nahin|na|mat karo|don'?t)\s*[.!]*\s*$/i.test(t)
