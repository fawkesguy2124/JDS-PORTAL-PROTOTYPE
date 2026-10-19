// The portal tools the WhatsApp assistant (AI) may use. READ-ONLY, saved portal
// data only: no ULIP calls, no documents. Each tool returns plain facts, small
// enough to send to the AI model. The same file runs in the portal (for testing)
// and on the server (wa-bot).
import { journeyFor, isDelivered, parseContainerNos, containerTrip, containerFinishedOn, deliveryBy } from './journeyCore.js'
import { jobsFor } from './botMessages.js'

const TZ = 'Asia/Kolkata'
const day = (iso) => {
  if (!iso) return null
  const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00+05:30` : iso)
  return isNaN(d) ? String(iso) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })
}
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const STAGE = ['Job created', 'Docs received', 'Verification', 'BE filing', 'Customs review', 'Assessment', 'Duty paid', 'OOC', 'Out of port', 'In transit', 'Delivered']

// One job as facts
function jobFacts(job, data, detail = false) {
  const j = journeyFor(job, data)
  const cur = j.steps.find((s) => s.current)
  const facts = {
    job_no: job.job_no, client: job.client || null, mode: job.mode || null, port: job.port_code || null,
    eta: day(job.eta), stage: STAGE[Number(job.stage)] || null, status: j.phase,
    next_step: cur?.nextText || (j.phase === 'delivered' ? 'Finished' : null),
    be_no: job.be_no || null, be_date: day(job.be_date), ooc_date: day(j.oocDate) || (j.oocDone && !j.oocDate ? 'recorded by staff' : null),
    free_days_left: j.freeDaysLeft, problems: j.attention.map((a) => `${a.level === 'red' ? 'URGENT' : a.level === 'amber' ? 'TO DO' : 'NOTE'}: ${a.text}`),
    leaves_by: j.onwardMode || 'not decided', truck: job.truck_no || null,
  }
  if (!detail) return { ...facts, containers: parseContainerNos(job.containers).length }
  return {
    ...facts,
    bl_no: job.bl_no || null, shipping_line: job.shipping_line || null, vessel: job.vessel || null, cfs: job.cfs_name || null,
    goods: job.goods ? String(job.goods).slice(0, 120) : null, rms: job.rms_status || null,
    delivery_to_warehouse: deliveryBy(job) === 'client' ? 'client collects' : 'JDS delivers',
    igm: job.ulip_refs?.igm_no ? `${job.ulip_refs.igm_no} (${day(job.ulip_refs.igm_date) || ''})` : null,
    steps: j.steps.map((s) => `${s.done ? 'done' : s.current ? 'CURRENT' : 'later'}: ${s.label}${s.when ? ` ${s.when}` : ''}${s.sub ? ` (${s.sub})` : ''}`),
    truck_last_seen: j.truckLocation ? `${j.truckLocation.plaza} at ${day(j.truckLocation.at)}` : null,
    container_list: parseContainerNos(job.containers).slice(0, 25).map((no) => {
      const t = data.containersByNo[no]
      if (!t) return { no, tracking: 'not tracked' }
      const trip = containerTrip(t, job)
      const live = j.containers.tracked.find((x) => x.container_no?.toUpperCase() === no)
      return {
        no, last_event: t.status_text || t.status || null, where: t.current_location || null,
        port_in: day(trip.portIn), left_with_cargo: day(trip.exitAt), empty_back: day(containerFinishedOn(t, job) === 'yes' ? null : containerFinishedOn(t, job)),
        free_days_left: live?.freeLeft ?? null, shipping_line: t.shipping_line_ldb || null,
      }
    }),
  }
}

const FILTERS = {
  open: (r) => r.j.phase !== 'delivered',
  urgent: (r) => r.j.attention.some((a) => a.level === 'red'),
  detention: (r) => r.j.freeDaysLeft !== null && r.j.freeDaysLeft < 0,
  free_days_low: (r) => r.j.freeDaysLeft !== null && r.j.freeDaysLeft >= 0 && r.j.freeDaysLeft <= 3,
  be_not_filed: (r) => r.j.phase !== 'delivered' && !r.j.beFiled,
  waiting_ooc: (r) => r.j.phase === 'ooc',
  ooc_done_not_moved: (r) => r.j.phase === 'release',
  on_the_move: (r) => r.j.phase === 'truck',
  arriving_soon: (r) => r.j.phase === 'arrival',
  delivered: (r) => r.j.phase === 'delivered',
  all: () => true,
}

// Tool definitions (shape used by Gemini; plain JSON schema types)
export const TOOLS = [
  {
    name: 'list_jobs',
    description: 'List JDS import jobs in a situation, optionally for one client. Use for questions like "which jobs have detention", "what is pending for PCM", "jobs waiting for OOC", "how many jobs are open".',
    parameters: {
      type: 'OBJECT',
      properties: {
        situation: { type: 'STRING', enum: Object.keys(FILTERS), description: 'open = not finished; urgent = has an urgent problem; detention = free time over; free_days_low = 0-3 free days left; be_not_filed; waiting_ooc = BE filed, OOC not yet; ooc_done_not_moved = OOC done, not left yet; on_the_move = out by truck or rail; arriving_soon = ship not arrived; delivered = finished; all' },
        client: { type: 'STRING', description: 'Part of the client name, e.g. "PCM" or "Deepa". Optional.' },
        limit: { type: 'NUMBER', description: 'How many to return, default 15, max 40.' },
      },
      required: ['situation'],
    },
  },
  {
    name: 'get_job',
    description: 'Full details of ONE job: steps, BE, OOC, containers (port in, left CFS, empty back, free days), truck or rail, problems. Accepts a job number (J-193 or 193), a BE number, a container number or a BL number.',
    parameters: { type: 'OBJECT', properties: { ref: { type: 'STRING', description: 'Job no, BE no, container no or BL no' } }, required: ['ref'] },
  },
  {
    name: 'clients_overview',
    description: 'Clients with how many open jobs each has and how many are urgent. Optionally filter by part of the name.',
    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING', description: 'Part of a client name. Optional.' } } },
  },
  {
    name: 'today_counts',
    description: 'Today\'s numbers: open jobs, urgent, detention, waiting OOC, OOC done not moved, on the move, arriving.',
    parameters: { type: 'OBJECT', properties: {} },
  },
]

// Runs one tool call. person decides which jobs they may see.
export function runTool(name, args, data, person) {
  const jobs = jobsFor(person, data.jobs)
  const rows = jobs.map((job) => ({ job, j: isDelivered(job) ? { phase: 'delivered', attention: [], freeDaysLeft: null, beFiled: true } : journeyFor(job, data) }))
  if (name === 'list_jobs') {
    const test = FILTERS[args?.situation] || FILTERS.open
    const c = norm(args?.client)
    const hits = rows.filter(test).filter((r) => !c || norm(r.job.client).includes(c))
    const limit = Math.min(Math.max(Number(args?.limit) || 15, 1), 40)
    return { situation: args?.situation || 'open', client: args?.client || null, total: hits.length, shown: Math.min(limit, hits.length), jobs: hits.slice(0, limit).map((r) => jobFacts(r.job, data)) }
  }
  if (name === 'get_job') {
    const ref = norm(args?.ref)
    const num = ref.replace(/^J/, '')
    const job = jobs.find((x) => norm(x.job_no) === ref || norm(x.job_no).replace(/^J/, '') === num)
      || jobs.find((x) => ref.length === 7 && norm(x.be_no) === ref)
      || jobs.find((x) => parseContainerNos(x.containers).includes(ref))
      || jobs.find((x) => ref.length >= 6 && norm(x.bl_no) === ref)
    return job ? jobFacts(job, data, true) : { not_found: args?.ref }
  }
  if (name === 'clients_overview') {
    const c = norm(args?.name)
    const by = {}
    for (const r of rows) {
      if (c && !norm(r.job.client).includes(c)) continue
      const k = r.job.client || 'No client'
      by[k] ||= { client: k, open_jobs: 0, urgent: 0, finished: 0 }
      if (r.j.phase === 'delivered') by[k].finished++
      else { by[k].open_jobs++; if (r.j.attention.some((a) => a.level === 'red')) by[k].urgent++ }
    }
    return { clients: Object.values(by).sort((a, b) => b.open_jobs - a.open_jobs).slice(0, 40) }
  }
  if (name === 'today_counts') {
    const n = (k) => rows.filter(FILTERS[k]).length
    return { date: day(new Date().toISOString()), open: n('open'), urgent: n('urgent'), detention: n('detention'), free_days_low: n('free_days_low'), be_not_filed: n('be_not_filed'), waiting_ooc: n('waiting_ooc'), ooc_done_not_moved: n('ooc_done_not_moved'), on_the_move: n('on_the_move'), arriving_soon: n('arriving_soon') }
  }
  return { error: `unknown tool ${name}` }
}

export const SYSTEM_PROMPT = (person, now = new Date()) => `You are the WhatsApp assistant of JDS Logistics, a customs broker (CHA) in Navi Mumbai that clears IMPORT cargo at JNPT / Nhava Sheva, Mumbai Port and Mumbai air cargo, and moves it to the client's warehouse by truck or by rail.
You are talking to ${person?.name || 'a JDS team member'} (JDS staff).
Today is ${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })}, ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: TZ })} India time.

Rules:
- Answer ONLY from the portal tools. Never guess or invent job numbers, dates, containers or statuses. If the tools do not have it, say so plainly.
- Use a tool for every question about jobs, containers, clients, customs, detention, trucks or rail.
- You can only READ. If asked to change something (mark delivered, assign truck, add a note), say that changing things from WhatsApp is coming soon and they can do it in the portal now.
- Reply in the same language as the question (English, Hindi or Hinglish).
- WhatsApp style: short, plain words, *bold* for job numbers or key facts, simple bullet lines starting with "• ". No tables, no markdown headers. Keep it under about 12 lines unless they ask for a full list.
- Free days left below 0 means detention is running for that many days. "leaves_by" is truck or rail.
- Do not mention tools, JSON or the AI.`
