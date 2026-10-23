// Changes the JDS team can make by WhatsApp (Jose, 20 Oct 2026).
// Safety: the AI only PROPOSES a change (the propose_change tool). The bot then
// asks "Reply YES to confirm"; only a YES makes the change, and the change is
// made here by plain code (never by the AI), on a fresh copy of the job, with
// the same checks as the portal, logged as done by that person via WhatsApp.
import { jobTrucks, plateNo, parseContainerNos } from '../_shared/portal/journeyCore.js'
import { jobsFor } from '../_shared/portal/botMessages.js'
import { isLineNotShip, lineName } from '../_shared/portal/shippingLines.js'

type Person = { id: string; name: string; role: string; phone: string }
type Admin = any
export type Pending = { action: string; job_id: string; job_no: string; args: Record<string, any>; summary: string; at: string }

export const PENDING_MINUTES = 15
const TRUCK_RE = /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}|\d{2}BH\d{4}[A-Z]{1,2})$/
const norm = (s: unknown) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const nice = (iso: string) => new Date(`${iso}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export const ACTIONS = ['mark_delivered', 'add_truck', 'remove_truck', 'record_be', 'set_leaves_by', 'set_delivery_by', 'add_note',
  // added 24 Oct 2026
  'attach_document', 'set_eta', 'set_vessel', 'set_shipping_line', 'set_cfs', 'set_free_days', 'set_priority', 'set_owner',
  'add_container', 'remove_container', 'record_ooc']
const SIZES = ['20GP', '40GP', '40HC', '45HC', '20RF', '40RF', '40RFHC', '20OT', '40OT', '20FR', '40FR', '20TK', 'LCL']
const DOC_TYPES = ['BE', 'BL', 'Invoice', 'Packing List', 'COO', 'Insurance', 'Examination Order', 'OOC', 'E-Way Bill', 'POD', 'Other']

export const CHANGE_TOOL = {
  name: 'propose_change',
  description: 'Make a change in the portal for the person: mark_delivered, add_truck (truck_no, optional container), remove_truck (truck_no), record_be (be_no 7 digits, be_date YYYY-MM-DD), set_leaves_by (mode truck/rail), set_delivery_by (by jds/client), add_note (note), attach_document (the file the person just sent; doc_type), set_eta (date YYYY-MM-DD), set_vessel (vessel = the SHIP\'s name, never the shipping line), set_shipping_line (line), set_cfs (cfs), set_free_days (days), set_priority (priority normal/high/urgent), set_owner (owner = staff name), add_container (container, size), remove_container (container), record_ooc (ooc_no, ooc_date YYYY-MM-DD; OOC seen in LiveImpex). Call it ONCE; the bot then asks the person to reply YES. Nothing changes until they do.',
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
      doc_type: { type: 'STRING', enum: DOC_TYPES }, date: { type: 'STRING' }, vessel: { type: 'STRING' }, line: { type: 'STRING' },
      cfs: { type: 'STRING' }, days: { type: 'NUMBER' }, priority: { type: 'STRING', enum: ['normal', 'high', 'urgent'] },
      owner: { type: 'STRING' }, size: { type: 'STRING' }, ooc_no: { type: 'STRING' }, ooc_date: { type: 'STRING' },
    },
    required: ['action', 'job'],
  },
}

// What else a proposal may need: the file the person sent last, staff names
export type ChangeContext = { lastFile?: { path: string; file_name: string; mime: string; size: number; doc_type?: string | null; at: string } | null }

// Checks a proposal against the loaded data. Returns the pending change (with the
// sentence the person confirms) or a plain error for the AI to pass on.
export function prepareChange(args: any, data: any, person: Person, extra: ChangeContext = {}): { ok: true; pending: Pending } | { ok: false; error: string } {
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
  if (action === 'attach_document') {
    const f = extra.lastFile
    if (!f || Date.now() - new Date(f.at).getTime() > 24 * 60 * 60 * 1000) return { ok: false, error: 'No file is waiting. Send the PDF on WhatsApp first, then say which job it is for.' }
    const type = DOC_TYPES.find((t) => t.toLowerCase() === String(args?.doc_type || f.doc_type || '').toLowerCase()) || null
    if (!type) return { ok: false, error: `What kind of document is ${f.file_name}? For example BE, BL, Invoice, Packing List, OOC.` }
    const taken = (data.documents || []).some((d: any) => d.job_id === job.id && d.doc_type === type)
    if (taken && type !== 'Other') return { ok: false, error: `${job.job_no} already has a ${type}. Say "attach it as Other" to keep both, or replace it in the portal.` }
    return p(`Attach *${f.file_name}* to ${who} as *${type}*`, { path: f.path, file_name: f.file_name, mime: f.mime, size: f.size, doc_type: type })
  }
  if (action === 'set_eta' || action === 'record_ooc') {
    const date = String(action === 'set_eta' ? args?.date : args?.ooc_date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Please give the date.' }
    if (action === 'set_eta') return p(`Set the ETA of ${who} to *${nice(date)}*${job.eta ? ` (was ${nice(String(job.eta).slice(0, 10))})` : ''}`, { date })
    if (date > todayIst()) return { ok: false, error: 'The OOC date cannot be in the future.' }
    const no = String(args?.ooc_no || '').replace(/\D/g, '')
    if (no && no.length < 6) return { ok: false, error: 'The OOC number looks too short. Check it, or leave it out.' }
    return p(`Record *OOC${no ? ` ${no}` : ''}* dated *${nice(date)}* on ${who} (as seen in LiveImpex)`, { ooc_no: no || null, ooc_date: date })
  }
  if (action === 'set_vessel') {
    const vessel = String(args?.vessel || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 60)
    if (vessel.length < 3) return { ok: false, error: 'What is the ship\'s name? It is on the BL, for example EVER LENIENT.' }
    if (isLineNotShip(vessel, job.shipping_line)) return { ok: false, error: `${vessel} is a shipping line, not a ship. The ship's own name is on the BL (for example EVER LENIENT).` }
    return p(`Set the ship of ${who} to *${vessel}*${job.vessel ? ` (was ${job.vessel})` : ''}`, { vessel })
  }
  if (action === 'set_shipping_line') {
    const line = lineName(args?.line)
    if (!line) return { ok: false, error: 'Which shipping line?' }
    return p(`Set the shipping line of ${who} to *${line}*${job.shipping_line ? ` (was ${job.shipping_line})` : ''}`, { line })
  }
  if (action === 'set_cfs') {
    const cfs = String(args?.cfs || '').trim().slice(0, 80)
    if (cfs.length < 2) return { ok: false, error: 'Which CFS?' }
    return p(`Set the CFS of ${who} to *${cfs}*${job.cfs_name ? ` (was ${job.cfs_name})` : ''}`, { cfs })
  }
  if (action === 'set_free_days') {
    const days = Number(args?.days)
    if (!Number.isInteger(days) || days < 0 || days > 120) return { ok: false, error: 'Free days must be a whole number, for example 14.' }
    return p(`Set the free days of ${who} to *${days}*${job.free_days != null ? ` (was ${job.free_days})` : ''}`, { days })
  }
  if (action === 'set_priority') {
    const pr = ['normal', 'high', 'urgent'].includes(String(args?.priority)) ? String(args.priority) : null
    if (!pr) return { ok: false, error: 'Say normal, high or urgent.' }
    return p(`Set the priority of ${who} to *${pr}*`, { priority: pr })
  }
  if (action === 'set_owner') {
    const want = norm(args?.owner)
    const hits = Object.entries(data.people || {}).filter(([, n]) => want && norm(n).includes(want))
    if (hits.length !== 1) return { ok: false, error: hits.length ? `More than one person matches "${args?.owner}": ${hits.map(([, n]) => n).join(', ')}.` : `Nobody called "${args?.owner}" has a portal login.` }
    const [id, name] = hits[0] as [string, string]
    return p(`Make *${name}* the owner of ${who}`, { owner_id: id, owner_name: name })
  }
  if (action === 'add_container' || action === 'remove_container') {
    // the number, wherever the AI put it (it sometimes uses "note")
    const box = norm(args?.container) || (Object.values(args || {}).map((v) => norm(v)).find((v) => /^[A-Z]{4}\d{7}$/.test(v)) || '')
    if (!/^[A-Z]{4}\d{7}$/.test(box)) return { ok: false, error: 'The container number looks wrong. Example: MSKU1234567.' }
    const has = parseContainerNos(job.containers).includes(box)
    if (action === 'remove_container') {
      if (!has) return { ok: false, error: `Container ${box} is not on ${job.job_no}.` }
      return p(`Take container *${box}* off ${who}`, { container: box })
    }
    if (has) return { ok: false, error: `Container ${box} is already on ${job.job_no}.` }
    const size = String(args?.size || '').toUpperCase().replace(/\s+/g, '').replace(/^(20|40|45)(FT|')?$/, '$1GP').replace(/HQ$/, 'HC')
    if (size && !SIZES.includes(size)) return { ok: false, error: `Size ${args?.size} is not one the portal knows (e.g. 20GP, 40HC).` }
    return p(`Add container *${box}*${size ? ` (${size})` : ''} to ${who}`, { container: box, size: size || null })
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
  if (pending.action === 'attach_document') {
    // the file was kept in private storage when it arrived; it moves under the job
    const dest = `${job.id}/${Date.now()}_${String(a.file_name).replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: mvErr } = await admin.storage.from('job-documents').move(a.path, dest)
    if (mvErr) return `❌ Could not attach the file: ${mvErr.message}. Nothing was changed.`
    const { error: insErr } = await admin.from('documents').insert({
      job_id: job.id, job_no: job.job_no || '', file_name: a.file_name, file_type: String(a.file_name).split('.').pop(),
      // file_url is required by the table; like the portal's, it is the storage address
      // (the files are private: the portal opens them with 1-hour links)
      doc_type: a.doc_type, file_path: dest, file_url: `${(Deno.env.get('SUPABASE_URL') || '').trim()}/storage/v1/object/public/job-documents/${dest}`,
      uploaded_by: null, uploaded_by_name: by, file_size: a.size || null,
      created_at: now,
    })
    if (insErr) return `❌ Could not attach the file: ${insErr.message}.`
    await admin.from('bot_inbox').update({ last_file: null }).eq('phone', person.phone)
    await log('document_upload', `${a.doc_type} uploaded — ${job.job_no}`, `${a.file_name} (sent on WhatsApp by ${person.name})`, { doc_type: a.doc_type, file_name: a.file_name })
    return `✅ Done: *${a.file_name}* attached to ${job.job_no} as *${a.doc_type}*.`
  }
  const simple: Record<string, [Record<string, unknown>, string]> = {
    set_eta: [{ eta: a.date }, `ETA set to ${a.date ? nice(a.date) : ''}`],
    set_vessel: [{ vessel: a.vessel }, `ship set to ${a.vessel}`],
    set_shipping_line: [{ shipping_line: a.line }, `shipping line set to ${a.line}`],
    set_cfs: [{ cfs_name: a.cfs }, `CFS set to ${a.cfs}`],
    set_free_days: [{ free_days: a.days }, `free days set to ${a.days}`],
    set_priority: [{ priority: a.priority }, `priority set to ${a.priority}`],
    set_owner: [{ assigned_to: a.owner_id }, `owner set to ${a.owner_name}`],
  }
  if (simple[pending.action]) {
    const [update, what] = simple[pending.action]
    const err = await save(update); if (err) return err
    await log('note', `${job.job_no} — ${what}`, `Changed by ${by}`, update)
    return `✅ Done: ${job.job_no} — ${what}.`
  }
  if (pending.action === 'add_container' || pending.action === 'remove_container') {
    const list = parseContainerNos(job.containers)
    const sizes = { ...(job.container_sizes && typeof job.container_sizes === 'object' ? job.container_sizes : {}) }
    if (pending.action === 'add_container') {
      if (list.includes(a.container)) return `Container ${a.container} is already on ${job.job_no}.`
      list.push(a.container)
      if (a.size) sizes[a.container] = a.size
    } else {
      const i = list.indexOf(a.container)
      if (i < 0) return `Container ${a.container} is not on ${job.job_no}.`
      list.splice(i, 1)
      delete sizes[a.container]
    }
    const err = await save({ containers: list.join(' ') || null, container_sizes: Object.keys(sizes).length ? sizes : null }); if (err) return err
    const what = pending.action === 'add_container' ? `container ${a.container}${a.size ? ` (${a.size})` : ''} added` : `container ${a.container} taken off`
    await log('note', `${job.job_no} — ${what}`, `Changed by ${by}`, { container: a.container })
    return `✅ Done: ${job.job_no} — ${what}.`
  }
  if (pending.action === 'record_ooc') {
    const update: Record<string, unknown> = {}
    if ((Number(job.stage) || 0) < 7) update.stage = 7
    if (Object.keys(update).length) { const err = await save(update); if (err) return err }
    await log('ooc_granted', `OOC granted — ${job.job_no}`, `OOC ${a.ooc_no || ''} dated ${a.ooc_date} (recorded by ${by}, from LiveImpex)`.replace(/\s+/g, ' '), { ooc_no: a.ooc_no, ooc_date: a.ooc_date, typed: true })
    return `✅ Done: OOC${a.ooc_no ? ` ${a.ooc_no}` : ''} dated ${nice(a.ooc_date)} recorded on ${job.job_no}${update.stage ? ' (moved to the OOC stage)' : ''}.`
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
