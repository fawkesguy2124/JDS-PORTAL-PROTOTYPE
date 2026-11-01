// Changes the JDS team can make by WhatsApp (Jose, 20 Oct 2026).
// Safety: the AI only PROPOSES a change (the propose_change tool). The bot then
// asks "Reply YES to confirm"; only a YES makes the change, and the change is
// made here by plain code (never by the AI), on a fresh copy of the job, with
// the same checks as the portal, logged as done by that person via WhatsApp.
import { jobTrucks, plateNo, parseContainerNos, BE_STAGES } from '../_shared/portal/journeyCore.js'
import { jobsFor, BOT_NUMBERS, LEVEL_LABEL } from '../_shared/portal/botMessages.js'
import { isLineNotShip, lineName } from '../_shared/portal/shippingLines.js'
import { beFill } from './bereader.ts'
import { docFill } from './docfill.ts'

type Person = { id: string; name: string; role: string; phone: string; level?: string }
type Admin = any
export type Pending = { action: string; job_id: string; job_no: string; args: Record<string, any>; summary: string; at: string }

export const PENDING_MINUTES = 15
const TRUCK_RE = /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}|\d{2}BH\d{4}[A-Z]{1,2})$/
const norm = (s: unknown) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const nice = (iso: string) => new Date(`${iso}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export const ACTIONS = ['mark_delivered', 'add_truck', 'remove_truck', 'record_be', 'set_leaves_by', 'set_delivery_by', 'add_note',
  // added 24 Oct 2026
  'attach_document', 'set_eta', 'set_imo', 'set_vessel', 'set_shipping_line', 'set_cfs', 'set_free_days', 'set_priority', 'set_owner',
  'add_container', 'remove_container', 'record_ooc',
  // added 25 Oct 2026: where the BE is with Customs (RMS / AO / query / AC / assessed / duty paid / examination)
  'set_be_stage',
  // added 24 Oct 2026 (2): a new job by chat, the CFS payment, a task for a teammate
  'create_job', 'record_payment', 'assign_task',
  // who may use the bot (admins only)
  'set_access']
const MODES = ['Sea FCL', 'Sea LCL', 'Air', 'BPT/MBPT']
const SIZES = ['20GP', '40GP', '40HC', '45HC', '20RF', '40RF', '40RFHC', '20OT', '40OT', '20FR', '40FR', '20TK', 'LCL']
const DOC_TYPES = ['BE', 'BL', 'Invoice', 'Packing List', 'COO', 'Insurance', 'Examination Order', 'OOC', 'E-Way Bill', 'POD', 'Other']

export const CHANGE_TOOL = {
  name: 'propose_change',
  description: 'Make a change in the portal for the person: mark_delivered, add_truck (truck_no, optional container), remove_truck (truck_no), record_be (be_no 7 digits, be_date YYYY-MM-DD), set_leaves_by (mode truck/rail), set_delivery_by (by jds/client), add_note (note), attach_document (the file the person just sent; doc_type), set_eta (date YYYY-MM-DD), set_imo (imo = the 7-digit IMO number of the ship), set_vessel (vessel = the SHIP\'s name, never the shipping line), set_shipping_line (line), set_cfs (cfs), set_free_days (days), set_priority (priority normal/high/urgent), set_owner (owner = staff name), add_container (container, size), remove_container (container), record_ooc (ooc_no, ooc_date YYYY-MM-DD; OOC seen in LiveImpex), set_be_stage (stage = where the BE is with Customs: rms / ao / query / ac / assessed / duty_paid / exam; note optional, e.g. the query text), create_job (job = the NEW job no; client, job_mode, port, bl_no, containers, size, vessel, eta, line, be_no, be_date, days), record_payment (amount in rupees = the CFS amount), assign_task (to = teammate name, task, due = YYYY-MM-DD HH:MM India time), set_access (admins only; gives, changes or removes WhatsApp bot access: phone = 10-digit mobile, to = the name of the person, level = view / staff / admin / remove). The SAME change on several jobs: give them all in jobs (e.g. ["J-519","J-633"]) in ONE call. Call it ONCE; the bot then asks the person to confirm. Nothing changes until they do.',
  parameters: {
    type: 'OBJECT',
    properties: {
      action: { type: 'STRING', enum: ACTIONS },
      job: { type: 'STRING', description: 'Job number, e.g. J-638' },
      jobs: { type: 'ARRAY', items: { type: 'STRING' }, description: 'several job numbers for the same change' },
      client: { type: 'STRING' }, job_mode: { type: 'STRING', enum: MODES }, port: { type: 'STRING' }, bl_no: { type: 'STRING' }, containers: { type: 'STRING' },
      eta: { type: 'STRING' }, amount: { type: 'NUMBER' }, to: { type: 'STRING' }, task: { type: 'STRING' }, due: { type: 'STRING' },
      truck_no: { type: 'STRING' }, container: { type: 'STRING' },
      be_no: { type: 'STRING' }, be_date: { type: 'STRING' },
      mode: { type: 'STRING', enum: ['truck', 'rail'] },
      by: { type: 'STRING', enum: ['jds', 'client'] },
      note: { type: 'STRING' },
      doc_type: { type: 'STRING', enum: DOC_TYPES }, date: { type: 'STRING' }, vessel: { type: 'STRING' }, imo: { type: 'STRING' }, line: { type: 'STRING' },
      cfs: { type: 'STRING' }, days: { type: 'NUMBER' }, priority: { type: 'STRING', enum: ['normal', 'high', 'urgent'] },
      owner: { type: 'STRING' }, size: { type: 'STRING' }, ooc_no: { type: 'STRING' }, ooc_date: { type: 'STRING' },
      phone: { type: 'STRING' }, level: { type: 'STRING', enum: ['view', 'staff', 'admin', 'remove'] },
      stage: { type: 'STRING', enum: BE_STAGES.map((x: any) => x.id) },
    },
    required: ['action'],
  },
}

// What else a proposal may need: the file the person sent last, the team
export type ChangeContext = {
  lastFile?: { path: string; file_name: string; mime: string; size: number; doc_type?: string | null; at: string } | null
  team?: Person[]
}
type Prepared = { ok: true; pending: Pending } | { ok: false; error: string }

// Checks a proposal against the loaded data. Returns the pending change (with the
// sentence the person confirms) or a plain error for the AI to pass on.
// Several jobs (jobs: [...]) become ONE confirmation listing each of them.
export function prepareChange(args: any, data: any, person: Person, extra: ChangeContext = {}): Prepared {
  const action = String(args?.action || '')
  if (action === 'create_job') return prepareCreate(args, data, person)
  if (action === 'set_access') return prepareAccess(args, extra.team || [])
  const list = [...new Set((Array.isArray(args?.jobs) ? args.jobs : []).map((x: unknown) => String(x)).filter(Boolean))]
  if (list.length > 1) {
    if (['attach_document', 'assign_task'].includes(action)) return { ok: false, error: 'Please do this one job at a time.' }
    if (list.length > 15) return { ok: false, error: 'At most 15 jobs in one go.' }
    const items: Pending[] = []
    const problems: string[] = []
    for (const j of list) {
      const r = prepareOne({ ...args, job: j }, data, person, extra)
      if (r.ok) items.push(r.pending)
      else problems.push(`${j}: ${r.error}`)
    }
    if (!items.length) return { ok: false, error: problems.join(' ') }
    return {
      ok: true,
      pending: {
        action: 'batch', job_id: items[0].job_id, job_no: items.map((x) => x.job_no).join(', '), args: { items },
        summary: `${items.length} changes:\n${items.map((x) => `• ${x.summary}`).join('\n')}${problems.length ? `\n(Left out: ${problems.join('; ')})` : ''}`,
        at: new Date().toISOString(),
      },
    }
  }
  return prepareOne({ ...args, job: args?.job || list[0] }, data, person, extra)
}

// Who may use the bot: an admin gives, changes or removes a number's access.
// Jose's own two numbers (BOT_NUMBERS) are always admins and can't be changed here.
function prepareAccess(args: any, team: Person[]): Prepared {
  const digits = String(args?.phone || '').replace(/\D/g, '').replace(/^(?:91|0)(?=[6-9]\d{9}$)/, '')
  if (!/^[6-9]\d{9}$/.test(digits)) return { ok: false, error: 'Give the 10-digit mobile number, for example 9876543210.' }
  const phone = `91${digits}`
  if (BOT_NUMBERS.includes(phone)) return { ok: false, error: "That is one of Jose's own numbers: it is always a full admin and cannot be changed here." }
  const level = String(args?.level || '').toLowerCase()
  if (!['view', 'staff', 'admin', 'remove'].includes(level)) return { ok: false, error: 'Which access: view only, staff, full admin, or remove?' }
  const now = team.find((t) => t.phone === phone)
  const name = String(args?.to || args?.owner || now?.name || '').trim().slice(0, 40)
  if (level === 'remove') {
    if (!now) return { ok: false, error: `+91 ${digits} has no access to the bot.` }
    return { ok: true, pending: { action: 'set_access', job_id: '', job_no: '', args: { phone, name: now.name, level }, summary: `Remove *${now.name}* (+91 ${digits}) from the WhatsApp bot`, at: new Date().toISOString() } }
  }
  if (!name) return { ok: false, error: `What is the name of the person with +91 ${digits}?` }
  if (now?.level === level) return { ok: false, error: `${now.name} already has ${LEVEL_LABEL[level]} access.` }
  return { ok: true, pending: { action: 'set_access', job_id: '', job_no: '', args: { phone, name, level }, summary: `${now ? 'Change' : 'Give'} *${name}* (+91 ${digits}) *${LEVEL_LABEL[level]}* access to the WhatsApp bot${now ? ` (now ${LEVEL_LABEL[now.level || 'view']})` : ''}`, at: new Date().toISOString() } }
}

// A new job typed on WhatsApp: the same checks as Create job
function prepareCreate(args: any, data: any, person: Person): Prepared {
  const num = String(args?.job || '').replace(/\D/g, '')
  if (!num) return { ok: false, error: 'What is the new job number?' }
  const jobNo = `J-${num}`
  if ((data.jobs || []).some((j: any) => norm(j.job_no).replace(/^J0*/, '') === num.replace(/^0+/, ''))) return { ok: false, error: `${jobNo} already exists.` }
  // the client as already spelled on earlier jobs, when it matches
  const want = String(args?.client || '').trim()
  if (!want) return { ok: false, error: 'Which client?' }
  const known = [...new Set((data.jobs || []).map((j: any) => String(j.client || '').trim()).filter(Boolean))] as string[]
  const client = known.find((c) => norm(c) === norm(want)) || known.find((c) => norm(c).startsWith(norm(want)) || norm(want).startsWith(norm(c))) || want
  const mode = MODES.find((m) => norm(m) === norm(args?.job_mode)) || null
  if (!mode) return { ok: false, error: 'Which mode: Sea FCL, Sea LCL, Air or BPT/MBPT?' }
  const port = String(args?.port || '').toUpperCase().match(/INNSA1|INBOM1|INBOM4/)?.[0] || (mode === 'Air' ? 'INBOM4' : mode === 'BPT/MBPT' ? 'INBOM1' : 'INNSA1')
  const boxes = [...new Set(String(args?.containers || '').toUpperCase().split(/[\s,;/]+/).filter((b) => /^[A-Z]{4}\d{7}$/.test(b)))]
  if ((mode === 'Sea FCL' || mode === 'Sea LCL') && !boxes.length) return { ok: false, error: 'A sea job needs its container number(s).' }
  const vessel = String(args?.vessel || '').trim().toUpperCase()
  if (vessel && isLineNotShip(vessel, args?.line)) return { ok: false, error: `${vessel} is a shipping line, not a ship. Give the ship's own name from the BL, or leave it out.` }
  const eta = String(args?.eta || args?.date || '').slice(0, 10)
  if (eta && !/^\d{4}-\d{2}-\d{2}$/.test(eta)) return { ok: false, error: 'Give the ETA as a date.' }
  const be = String(args?.be_no || '').replace(/\D/g, '')
  if (be && !/^\d{7}$/.test(be)) return { ok: false, error: 'The BE number must be 7 digits.' }
  const days = args?.days == null ? 14 : Number(args.days)
  if (!Number.isInteger(days) || days < 0) return { ok: false, error: 'Free days must be a whole number.' }
  const size = mode === 'Sea LCL' ? 'LCL' : SIZES.includes(String(args?.size || '').toUpperCase()) ? String(args.size).toUpperCase() : null
  const fields = {
    job_no: jobNo, client, mode, port_code: port, bl_no: String(args?.bl_no || '').trim().toUpperCase() || null,
    containers: boxes.join(' ') || null, container_sizes: size && boxes.length ? Object.fromEntries(boxes.map((b) => [b, size])) : null,
    vessel: vessel || null, eta: eta || null, shipping_line: lineName(args?.line) || null,
    be_no: be || null, be_date: be ? String(args?.be_date || '').slice(0, 10) || null : null, free_days: days,
  }
  const lines = [
    `Create *${jobNo}* for *${client}*${known.includes(client) ? '' : ' (new client name)'}`,
    `${mode} · ${port}${boxes.length ? ` · ${boxes.length} container${boxes.length > 1 ? 's' : ''}: ${boxes.join(', ')}${size ? ` (${size})` : ''}` : ''}`,
    [fields.bl_no && `BL ${fields.bl_no}`, fields.vessel && `ship ${fields.vessel}`, fields.shipping_line && `line ${fields.shipping_line}`, fields.eta && `ETA ${nice(fields.eta)}`, be && `BE ${be}`, `${days} free days`].filter(Boolean).join(' · '),
  ]
  return { ok: true, pending: { action: 'create_job', job_id: '', job_no: jobNo, args: fields, summary: lines.join('\n'), at: new Date().toISOString() } }
}

function prepareOne(args: any, data: any, person: Person, extra: ChangeContext = {}): Prepared {
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
  if (action === 'set_imo') {
    const imo = String(args?.imo || args?.note || '').replace(/\D/g, '')
    if (imo.length !== 7) return { ok: false, error: 'The IMO number has 7 digits, for example 9467287 (it is on the BL or the IGM).' }
    const was = String(job.ulip_refs?.imo_code || '')
    if (was === imo) return { ok: false, error: `${job.job_no} already has IMO ${imo}.` }
    return p(`Set the ship's IMO of ${who} to *${imo}*${was ? ` (was ${was})` : ''}`, { imo })
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
  if (action === 'set_be_stage') {
    const def = BE_STAGES.find((x: any) => x.id === String(args?.stage))
    if (!def) return { ok: false, error: `Say the stage: ${BE_STAGES.map((x: any) => x.short).join(', ')}.` }
    if (!/^\d{7}$/.test(String(job.be_no || '').trim())) return { ok: false, error: `${job.job_no} has no BE number yet. Record the BE first.` }
    return p(`Set the customs stage of ${who} (BE ${job.be_no}) to *${def.label}*${args?.note ? `: ${String(args.note).slice(0, 120)}` : ''}`, { stage: def.id, note: args?.note ? String(args.note).slice(0, 300) : null })
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
    if (size && !SIZES.includes(size)) return { ok: false, error: `Size ${args?.size} is not one the portal knows.` }
    return p(`Add container *${box}*${size ? ` (${size})` : ''} to ${who}`, { container: box, size: size || null })
  }
  if (action === 'record_payment') {
    // the portal keeps one money figure per job: the CFS amount
    const amount = Math.round(Number(String(args?.amount ?? '').replace(/[^\d.]/g, '')))
    if (!amount || amount < 1 || amount > 10_000_000) return { ok: false, error: 'How much (in rupees)? The portal records the CFS amount.' }
    return p(`Record the CFS amount of ${who} as *₹${amount.toLocaleString('en-IN')}*${job.cfs_amount ? ` (was ₹${Number(job.cfs_amount).toLocaleString('en-IN')})` : ''}`, { amount })
  }
  if (action === 'assign_task') {
    const want = norm(args?.to)
    const team = (extra.team || []).filter((t) => t.phone !== person.phone)
    const hits = team.filter((t) => want && norm(t.name).includes(want))
    if (hits.length !== 1) return { ok: false, error: hits.length ? `More than one teammate matches "${args?.to}".` : `"${args?.to || ''}" is not on the WhatsApp bot. Only team numbers on the bot can get tasks: ${team.map((t) => t.name).join(', ') || 'none yet'}.` }
    const task = String(args?.task || '').trim().slice(0, 300)
    if (!task) return { ok: false, error: 'What should they do?' }
    let due: string | null = null
    if (args?.due) {
      const m = String(args.due).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/)
      if (!m) return { ok: false, error: 'Give the deadline as date and time.' }
      due = new Date(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00+05:30`).toISOString()
    }
    const by = due ? ` by ${new Date(due).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : ''
    return p(`Ask *${hits[0].name}* on WhatsApp: "${task}" (${job.job_no})${by}`, { to_phone: hits[0].phone, to_name: hits[0].name, task, due })
  }
  // add_note
  const note = String(args?.note || '').trim().slice(0, 1000)
  if (!note) return { ok: false, error: 'What should the note say?' }
  return p(`Add a note to ${who}: "${note.length > 120 ? `${note.slice(0, 117)}…` : note}"`, { note })
}

export const confirmText = (pending: Pending) =>
  `Please confirm:\n${pending.summary}\n\nTap *Yes* or *No* (or reply YES / NO).`

// What a confirmed change may need besides the database: messaging a teammate
export type ApplyDeps = { tell?: (phone: string, text: string, jobNo: string | null) => Promise<unknown> }

// Makes the confirmed change. Returns the reply to send.
export async function applyChange(admin: Admin, pending: Pending, person: Person, deps: ApplyDeps = {}): Promise<string> {
  // several jobs: each change made on its own, one line per job
  if (pending.action === 'batch') {
    const out: string[] = []
    for (const item of (pending.args?.items || []) as Pending[]) out.push(await applyChange(admin, item, person, deps))
    // a paper sent on WhatsApp: one plain line when all went well, else only what didn't
    if (pending.args?.done) {
      const bad = out.filter((x) => !x.startsWith('✅'))
      return bad.length ? `${bad.join('\n')}${bad.length < out.length ? '\nThe rest was saved.' : ''}` : pending.args.done
    }
    return out.join('\n')
  }
  // who may use the bot (an admin's decision)
  if (pending.action === 'set_access') {
    const a = pending.args || {}
    const shown = `+91 ${String(a.phone).slice(2)}`
    if (a.level === 'remove') {
      const { error } = await admin.from('bot_people').delete().eq('phone', a.phone)
      if (error) return `❌ Could not remove: ${error.message}. Nothing was changed.`
    } else {
      const { error } = await admin.from('bot_people').upsert({ phone: a.phone, name: a.name, level: a.level, added_by: person.name, added_at: new Date().toISOString() })
      if (error) return `❌ Could not save: ${error.message}. Nothing was changed.`
    }
    await admin.from('activity_log').insert({ type: 'note', action: 'note', title: `WhatsApp bot access: ${a.name} ${a.level === 'remove' ? 'removed' : `→ ${LEVEL_LABEL[a.level]}`}`, note: `${shown}, by ${person.name} via WhatsApp`, done_by_name: `${person.name} via WhatsApp`, meta: { phone: a.phone, level: a.level } })
    return a.level === 'remove'
      ? `✅ Done: *${a.name}* (${shown}) can no longer use the bot. Their messages are now ignored.`
      : `✅ Done: *${a.name}* (${shown}) now has *${LEVEL_LABEL[a.level]}* access.

They should send any message to the bot to start. While the bot uses Meta's test number, the number must also be on Meta's test recipient list, or the bot's replies will not reach them.`
  }
  // a new job from a BE PDF sent on WhatsApp (Jose, 2 Nov 2026: "it should say, should I
  // create a job?"): the job, then everything else the papers give, then the file itself
  if (pending.action === 'create_from_doc') {
    const a = pending.args || {}
    const { data: clash } = await admin.from('jobs').select('id').eq('job_no', a.job_no).maybeSingle()
    if (clash) return `❌ ${a.job_no} already exists. Nothing was created.`
    const uuid = /^[0-9a-f-]{36}$/i.test(String(person.id || '')) ? person.id : null
    const now = new Date().toISOString()
    const { data: made, error } = await admin.from('jobs').insert({
      job_no: a.job_no, client: a.client, mode: a.mode, port_code: a.port_code, job_type: 'import', stage: 4, priority: 'normal', free_days: 14,
      be_no: a.be_no, be_date: a.be_date, created_by: uuid, field_meta: { created_via: 'whatsapp_doc' }, updated_at: now,
    }).select('*').single()
    if (error || !made) return `❌ Could not create ${a.job_no}: ${error?.message || 'unknown error'}.`
    const by = `${person.name} via WhatsApp`
    for (const l of [
      { type: 'job_created', title: `${a.job_no} — Job created`, note: `${a.client} · ${a.mode} (from the BE sent on WhatsApp by ${person.name})` },
      { type: 'be_filed', title: `${a.job_no} — BE ${a.be_no} filed`, note: `BE ${a.be_no} dated ${a.be_date} (read from the BE sent on WhatsApp by ${person.name})` },
    ]) await admin.from('activity_log').insert({ ...l, action: l.type, job_id: made.id, job_no: a.job_no, done_by_name: by, meta: { job_id: made.id, job_no: a.job_no, via: 'whatsapp' } })
    const { fields } = docFill(a.fields || {}, made)
    if (Object.keys(fields).length) {
      const { error: fillErr } = await admin.from('jobs').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', made.id)
      if (fillErr) return `✅ ${a.job_no} is made, but its other details could not be saved (${fillErr.message}).`
    }
    if (a.file?.path) {
      const att = await applyChange(admin, { action: 'attach_document', job_id: made.id, job_no: a.job_no, args: a.file, summary: '', at: now }, person, deps)
      if (!att.startsWith('✅')) return `✅ ${a.job_no} is made. ${att}`
    }
    return `✅ Done. ${a.job_no} is made in the portal.`
  }
  // a new job typed on WhatsApp
  if (pending.action === 'create_job') {
    const f = pending.args || {}
    const { data: clash } = await admin.from('jobs').select('id').eq('job_no', f.job_no).maybeSingle()
    if (clash) return `❌ ${f.job_no} already exists. Nothing was created.`
    const uuid = /^[0-9a-f-]{36}$/i.test(String(person.id || '')) ? person.id : null
    const { data: made, error } = await admin.from('jobs').insert({
      ...f, job_type: 'import', stage: f.be_no ? 4 : 0, priority: 'normal', created_by: uuid,
      field_meta: { created_via: 'whatsapp' },
    }).select('id, job_no').single()
    if (error || !made) return `❌ Could not create ${f.job_no}: ${error?.message || 'unknown error'}.`
    await admin.from('activity_log').insert({
      type: 'job_created', action: 'job_created', title: `${made.job_no} — Job created`,
      note: `${f.client} · ${f.mode} · ${String(f.containers || '').split(' ').filter(Boolean).length} containers (via WhatsApp)`,
      job_id: made.id, job_no: made.job_no, done_by_name: `${person.name} via WhatsApp`, meta: { job_id: made.id, job_no: made.job_no, via: 'whatsapp' },
    })
    return `✅ Done: *${made.job_no}* created for ${f.client}. Upload its BE / BL in the portal or send them here.`
  }
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

  if (pending.action === 'set_be_stage') {
    const def = BE_STAGES.find((x: any) => x.id === a.stage)
    const meta = job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : {}
    const err = await save({ field_meta: { ...meta, be_stage: { stage: a.stage, be_no: job.be_no || null, at: now, by, note: a.note || null } } }); if (err) return err
    await log('be_stage', `${job.job_no} — Customs: ${def.label}`, a.note || `BE ${job.be_no || ''}`.trim(), { stage: a.stage, be_no: job.be_no || null })
    return `✅ Done: ${job.job_no} is now *${def.label}*.`
  }
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
    // read from the BE file itself: its IGM goes on the job too (finds the ship)
    if (a.igm_no && /^\d{4}-\d{2}-\d{2}$/.test(String(a.igm_date || ''))) {
      await admin.rpc('merge_job_refs', { p_job: job.id, p_found: { igm_no: String(a.igm_no), igm_date: a.igm_date }, p_typed: {}, p_truck: null })
    }
    await log('be_filed', `${job.job_no} — BE ${a.be_no} filed`, `BE ${a.be_no} dated ${a.be_date} filed in LiveImpex (recorded by ${by}${a.from_file ? ', read from the BE file' : ''})`, { be_no: a.be_no, be_date: a.be_date })
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
    return `✅ Done. Saved to ${job.job_no} as ${a.doc_type}.`
  }
  if (pending.action === 'set_imo') {
    // the same save as the Vessels page's IMO box (typed by staff wins over found)
    const { error } = await admin.rpc('merge_job_refs', { p_job: job.id, p_found: {}, p_typed: { imo_code: a.imo }, p_truck: null })
    if (error) return `❌ Could not save the IMO: ${error.message}. Nothing was changed.`
    await log('note', `${job.job_no} — ship IMO set to ${a.imo}`, `Changed by ${by}`, { imo_code: a.imo })
    return `✅ Done: ${job.job_no} — ship IMO set to ${a.imo}. It now shows on the Vessels page map.`
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
  if (pending.action === 'record_payment') {
    const err = await save({ cfs_amount: a.amount }); if (err) return err
    await log('note', `${job.job_no} — CFS amount ₹${Number(a.amount).toLocaleString('en-IN')}`, `Recorded by ${by}`, { cfs_amount: a.amount })
    return `✅ Done: CFS amount of ${job.job_no} is now ₹${Number(a.amount).toLocaleString('en-IN')}.`
  }
  if (pending.action === 'assign_task') {
    const { data: task, error } = await admin.from('bot_tasks').insert({
      from_phone: person.phone, from_name: person.name, to_phone: a.to_phone, to_name: a.to_name,
      job_id: job.id, job_no: job.job_no, text: a.task, due_at: a.due || null,
    }).select('id').single()
    if (error || !task) return `❌ Could not save the task: ${error?.message || 'unknown error'}.`
    const due = a.due ? ` by ${new Date(a.due).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : ''
    await deps.tell?.(a.to_phone, `📌 *Task from ${person.name}* (${job.job_no})${due}:\n${a.task}\n\nReply *DONE* when it is done.`, job.job_no)
    await log('note', `${job.job_no} — task for ${a.to_name}: ${a.task.slice(0, 60)}`, `Asked by ${by}${due}`, { task_id: task.id })
    return `✅ Done: ${a.to_name} has the task${due}. I'll tell you when it's done${a.due ? ', or remind them if it is late' : ''}.`
  }
  // the rest of the job from a BE PDF sent on WhatsApp: only what is still empty (worked
  // out again on the job as it is now, so nothing typed since is overwritten)
  if (pending.action === 'fill_from_doc' || pending.action === 'fill_from_be') {
    const { fields, said, mismatch } = pending.action === 'fill_from_be' ? { ...beFill(a.be, job), mismatch: null } : docFill(a.fields || {}, job)
    if (mismatch) return `Nothing was filled on ${job.job_no}: ${mismatch}.`
    if (!Object.keys(fields).length) return `${job.job_no} already had everything this paper gives, so nothing more was filled.`
    const err = await save(fields); if (err) return err
    await log('note', `${job.job_no} — filled from a paper`, `${said.join(' · ')} (from the paper sent on WhatsApp by ${by})`, { filled: Object.keys(fields) })
    return `✅ Done: filled ${job.job_no}: ${said.join(' · ')}.`
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
