// The bot's tools that act (Jose, 24 Oct 2026): send a job's document, check a
// truck or find a ship when a person asks, reminders, watches ("tell me when"),
// Customs for several jobs, plan my day, an Excel report and a document pack. ULIP is asked only
// through the portal's own "ulip" function (same rules, logged under the person's
// name), only when a person asks, at most once every 30 minutes per item; the
// result follows as a separate WhatsApp message.
import { jobTrucks, plateNo, journeyFor, isDelivered, parseContainerNos } from '../_shared/portal/journeyCore.js'
import { jobsFor } from '../_shared/portal/botMessages.js'
import { sendDocument } from './media.ts'

type Admin = any
type Person = { id: string; name: string; role: string; phone: string }
type Row = { id: string; title: string; description?: string }
type Deps = {
  admin: Admin; person: Person; data: any; test?: boolean
  send: (text: string) => Promise<unknown>
  dataChanged: () => void
  team?: Person[]
  after?: any[] // messages (e.g. a tap-to-act list) sent after the reply
  sendFile?: boolean
  customsOne?: (job: any) => Promise<string> // one Customs check, returns the message
}

const env = (k: string) => (Deno.env.get(k) || '').trim()
const GAP_MIN = 30
const TZ = 'Asia/Kolkata'
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ })
const minutesAgo = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 60_000 : Infinity)
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

function findJob(data: any, person: Person, ref: string) {
  const want = digits(ref)
  return want ? jobsFor(person, data.jobs).find((j: any) => digits(j.job_no).replace(/^0+/, '') === want.replace(/^0+/, '')) : null
}

// One ULIP check through the portal's "ulip" function, as this person
async function botUlip(admin: Admin, person: Person, api: string, params: Record<string, string>, jobId: string | null) {
  const { data: st } = await admin.from('bot_state').select('cron_token').eq('id', 1).maybeSingle()
  const anon = env('SUPABASE_ANON_KEY')
  const res = await fetch(`${env('SUPABASE_URL')}/functions/v1/ulip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anon}`, apikey: anon, 'x-bot-secret': String(st?.cron_token || '') },
    body: JSON.stringify({ api, params, jobId, asId: person.id || null, asName: `${person.name} via WhatsApp` }),
    signal: AbortSignal.timeout(110_000),
  })
  return await res.json().catch(() => ({ success: false, error: `error ${res.status}` }))
}

// the saved answer of a check, if it is newer than 30 minutes
async function recent(admin: Admin, key: string) {
  const { data } = await admin.from('ulip_results').select('summary, parsed, checked_at, found').eq('query_key', key).maybeSingle()
  return data && minutesAgo(data.checked_at) < GAP_MIN ? data : null
}

// keeps working after the reply has gone out
function later(work: Promise<unknown>) {
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(work) } catch { /* it still runs */ }
}

export function makeServerTools(d: Deps) {
  const { admin, person, data } = d
  return {
    // ── documents ──
    async send_document(args: any) {
      const job = findJob(data, person, args?.job)
      if (!job) return { not_found: args?.job }
      const { data: docs } = await admin.from('documents').select('id, doc_type, file_name, file_path, file_url, created_at').eq('job_id', job.id).order('created_at', { ascending: false })
      const list = docs || []
      if (!list.length) return { job: job.job_no, documents: 'none uploaded yet', note: 'no documents on the job' }
      const want = String(args?.doc_type || '').trim().toLowerCase()
      if (!want) {
        // a tap-to-send list follows the reply
        const types = [...new Set(list.map((x: any) => String(x.doc_type || 'Other')))].slice(0, 9)
        const rows: Row[] = types.map((t) => ({ id: `send ${job.job_no} ${t}`, title: t.slice(0, 24), description: (list.find((x: any) => x.doc_type === t)?.file_name || '').slice(0, 72) }))
        if (list.length > 1) rows.push({ id: `send ${job.job_no} document pack`, title: 'All as one PDF', description: 'BE, BL, Invoice … joined in one file' })
        const menu = !d.test && d.after && rows.length > 0
        if (menu) d.after!.push({ text: `Documents of ${job.job_no}:`, list: { button: 'Choose', rows } })
        return { say: menu ? `📂 *${job.job_no}* has: ${[...new Set(list.map((x: any) => x.doc_type))].join(', ')}. Tap one in the list below to get it.` : undefined, job: job.job_no, documents: list.map((x: any) => `${x.doc_type}: ${x.file_name}`), menu_sent: menu, tell_the_person: menu ? 'Say in one line which documents the job has and that they can tap one in the list below.' : 'List these and ask which one to send.' }
      }
      const doc = list.find((x: any) => String(x.doc_type || '').toLowerCase() === want) || list.find((x: any) => String(x.file_name || '').toLowerCase().includes(want))
      if (!doc) return { job: job.job_no, not_found: `no ${args.doc_type}`, documents: list.map((x: any) => `${x.doc_type}: ${x.file_name}`) }
      if (d.test) return { say: `(test) Would send *${doc.file_name}* (${job.job_no} · ${doc.doc_type}).`, sent: false, test_mode: `would send ${doc.file_name}`, note: `test mode: ${doc.file_name} not sent` }
      const path = doc.file_path || (String(doc.file_url || '').match(/\/object\/(?:public|sign)\/job-documents\/([^?]+)/) || [])[1]
      if (!path) return { error: 'The file is missing in storage.' }
      const { data: blob, error } = await admin.storage.from('job-documents').download(decodeURIComponent(path))
      if (error || !blob) return { error: `Could not open the file: ${error?.message || 'not found'}` }
      if (blob.size > 15 * 1024 * 1024) return { error: 'The file is too big for WhatsApp (over 15 MB). Open it in the portal.' }
      try {
        await sendDocument(person.phone, new Uint8Array(await blob.arrayBuffer()), blob.type || 'application/pdf', doc.file_name || 'document.pdf', `${job.job_no} · ${doc.doc_type}`)
      } catch (e) { return { error: `WhatsApp did not take the file: ${(e as Error).message}` } }
      return { say: `📎 Sent *${doc.file_name}* (${job.job_no} · ${doc.doc_type}) as a separate message.`, sent: true, file: doc.file_name, note: `sent ${doc.file_name}`, tell_the_person: 'The file has been sent as a separate message. Say so in one short line.' }
    },

    // ── truck: last FASTag toll crossing ──
    async check_truck_now(args: any) {
      let truck = plateNo(args?.truck_no || '')
      let job = args?.job ? findJob(data, person, args.job) : null
      if (!truck && job) {
        const trucks = jobTrucks(job)
        if (!trucks.length) return { not_possible: `${job.job_no} has no truck yet.` }
        if (trucks.length > 1) return { ask: `${job.job_no} has ${trucks.length} trucks: ${trucks.map((t: any) => t.no).join(', ')}. Which one?` }
        truck = trucks[0].no
      }
      if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}$|^\d{2}BH\d{4}[A-Z]{1,2}$/.test(truck)) return { not_possible: 'Give the truck number, for example MH04AB1234.' }
      if (!job) job = (data.jobs || []).find((j: any) => jobTrucks(j).some((t: any) => t.no === truck)) || null
      const saved = await recent(admin, `FASTAG/01?vehiclenumber=${truck}`)
      if (saved) return { say: `🚚 *${truck}* was checked at ${when(saved.checked_at)} (under 30 minutes ago), so FASTag was not asked again:\n${saved.summary}`, checked_recently: true, last_checked: when(saved.checked_at), answer: saved.summary, note: `FASTag NOT asked again (checked ${Math.round(minutesAgo(saved.checked_at))} min earlier)` }
      if (d.test) return { say: `(test) Would ask FASTag for *${truck}* now.`, started: true, test_mode: 'FASTag was NOT asked', note: 'test mode' }
      later((async () => {
        const out = await botUlip(admin, person, 'FASTAG/01', { vehiclenumber: truck }, job?.id || null).catch((e) => ({ success: false, error: (e as Error).message }))
        const x = out?.data?.parsed?.extra || {}
        const text = out?.success
          ? `🚚 *${truck}*${job ? ` (${job.job_no})` : ''}: ${out.data?.summary || 'checked'}${x.lastPlaza ? `\nLast toll: *${x.lastPlaza}*${x.lastSeenAt ? `, ${when(x.lastSeenAt)}` : ''}` : ''}`
          : `🚚 *${truck}*: the FASTag check did not work (${String(out?.error || '').slice(0, 140)}). Try again in a few minutes, or use the Trucks page.`
        d.dataChanged()
        await d.send(text)
      })())
      return { say: `🚚 Checking *${truck}* with FASTag now. The result follows in a separate message.`, started: true, note: 'FASTag asked now, result to follow in a separate message', tell_the_person: 'Say only that you are checking the truck now and the result follows in a separate message.' }
    },

    // ── ship: IMO and arrival from the IGM ──
    async find_ship_now(args: any) {
      const job = findJob(data, person, args?.job)
      if (!job) return { not_found: args?.job }
      const igm = digits(job.ulip_refs?.igm_no)
      const date = String(job.ulip_refs?.igm_date || '').slice(0, 10)
      if (igm.length < 5 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { not_possible: `${job.job_no} has no IGM number and date yet (they come from the BE).` }
      const [y, m, dd] = date.split('-')
      const params = { igmNo: igm, igmDt: `${dd}${m}${y}` }
      const saved = await recent(admin, `ICEGATE/01?igmDt=${params.igmDt}&igmNo=${igm}`)
      if (saved) return { say: `🚢 *${job.job_no}*: the IGM was checked at ${when(saved.checked_at)} (under 30 minutes ago), so ICEGATE was not asked again:\n${saved.summary}`, checked_recently: true, last_checked: when(saved.checked_at), answer: saved.summary, imo: saved.parsed?.extra?.imoCode || null, note: 'ICEGATE NOT asked again (checked within 30 min)' }
      if (d.test) return { say: `(test) Would ask ICEGATE for the ship of *${job.job_no}* now.`, started: true, test_mode: 'ICEGATE was NOT asked', note: 'test mode' }
      later((async () => {
        let text = ''
        try {
          let out = await botUlip(admin, person, 'ICEGATE/01', params, job.id)
          let x = out?.data?.parsed?.extra || {}
          // no ship in the arrival record: the IGM details may have it
          if (!(out?.success && x.imoCode)) {
            const more = await botUlip(admin, person, 'ICEGATE/07', params, job.id)
            if (more?.success && more.data?.parsed?.extra?.imoCode) { out = more; x = more.data.parsed.extra }
          }
          const imo = digits(x.imoCode)
          if (out?.success && imo.length === 7) {
            await admin.rpc('merge_job_refs', { p_job: job.id, p_found: { imo_code: imo, ...(x.vesselCode ? { vessel_code: String(x.vesselCode) } : {}) }, p_typed: {}, p_truck: null })
            text = `🚢 *${job.job_no}*: ICEGATE gives the ship's IMO *${imo}*${x.expectedArrival ? `, expected ${new Date(`${x.expectedArrival}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}${x.portOfArrival ? ` at ${x.portOfArrival}` : ''}. It now shows on the Vessels page map.`
          } else if (out?.success) {
            text = `🚢 *${job.job_no}*: ICEGATE has no ship details for IGM ${igm} yet (${String(out.data?.summary || '').slice(0, 120)}).`
          } else {
            text = `🚢 *${job.job_no}*: the IGM check did not work (${String(out?.error || '').slice(0, 140)}). Try again in a few minutes.`
          }
        } catch (e) { text = `🚢 *${job.job_no}*: the IGM check did not finish (${(e as Error).message}).` }
        d.dataChanged()
        await d.send(text)
      })())
      return { say: `🚢 Looking up the ship of *${job.job_no}* with ICEGATE now. The result follows in a separate message.`, started: true, note: 'ICEGATE asked now, result to follow in a separate message', tell_the_person: 'Say only that you are looking up the ship now and the result follows in a separate message.' }
    },

    // ── reminders ──
    async set_reminder(args: any) {
      const m = String(args?.when || '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/)
      if (!m) return { not_done: 'Give the date and time, for example tomorrow 10:00.' }
      const due = new Date(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00+05:30`)
      if (isNaN(due.getTime()) || due.getTime() < Date.now() + 60_000) return { not_done: 'That time is already past.' }
      if (due.getTime() > Date.now() + 90 * 86_400_000) return { not_done: 'Reminders can be at most 90 days ahead.' }
      const text = String(args?.text || '').trim().slice(0, 300)
      if (!text) return { not_done: 'What should the reminder say?' }
      const job = args?.job ? findJob(data, person, args.job) : null
      if (d.test) return { say: `(test) Would remind you at *${when(due.toISOString())}*: ${text}`, set: false, test_mode: `would remind at ${when(due.toISOString())}: ${text}`, note: 'test mode' }
      const { data: row, error } = await admin.from('bot_reminders').insert({ phone: person.phone, person_name: person.name, job_no: job?.job_no || null, text, due_at: due.toISOString() }).select('id').single()
      if (error) return { not_done: `Could not save: ${error.message}` }
      return { say: `⏰ Reminder #${row.id} set for *${when(due.toISOString())}*: ${text}`, set: true, id: row.id, at: when(due.toISOString()), note: `reminder ${row.id} set`, tell_the_person: 'Confirm the reminder with its time (India). It comes within 5 minutes of that time.' }
    },
    async list_reminders() {
      const { data: rows } = await admin.from('bot_reminders').select('id, due_at, text, job_no').eq('phone', person.phone).is('sent_at', null).eq('cancelled', false).order('due_at').limit(20)
      return { reminders: (rows || []).map((r: any) => `#${r.id} · ${when(r.due_at)}${r.job_no ? ` · ${r.job_no}` : ''}: ${r.text}`) }
    },
    async cancel_reminder(args: any) {
      const id = Number(args?.id)
      if (!id) return { not_done: 'Which reminder? Give its number.' }
      if (d.test) return { cancelled: false, test_mode: `would cancel #${id}` }
      const { data: rows } = await admin.from('bot_reminders').update({ cancelled: true }).eq('id', id).eq('phone', person.phone).is('sent_at', null).select('id')
      return rows?.length ? { cancelled: true, id, say: `Cancelled reminder #${id}.` } : { not_found: `reminder #${id}` }
    },

    // ── watches: "tell me when …" (checked by the 5-minute warm run) ──
    async watch(args: any) {
      const kind = String(args?.event || '').toLowerCase()
      if (!WATCH[kind]) return { not_done: `I can watch for: ${Object.keys(WATCH).join(', ')}.` }
      const job = findJob(data, person, args?.job)
      if (!job) return { not_found: args?.job || 'no job given' }
      const box = String(args?.container || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (box && !parseContainerNos(job.containers).includes(box)) return { not_done: `${box} is not on ${job.job_no}.` }
      const j = journeyFor(job, data)
      if (WATCH[kind].done(job, j, box)) return { say: `${job.job_no}: ${WATCH[kind].label(job, box)} has already happened, so no watch was set.`, already: `${job.job_no}: ${WATCH[kind].label(job, box)} has already happened.`, tell_the_person: 'Say it has already happened, no watch was set.' }
      if (d.test) return { say: `(test) Would watch for *${WATCH[kind].label(job, box)}*. Note: ${WATCH[kind].how}.`, set: false, test_mode: `would watch ${job.job_no} for ${kind}`, how_it_fires: WATCH[kind].how }
      const { data: same } = await admin.from('bot_watches').select('id').eq('phone', person.phone).eq('job_id', job.id).eq('kind', kind).eq('target', box || '').is('done_at', null).eq('cancelled', false).limit(1)
      if (same?.length) return { say: `🔔 I am already watching for *${WATCH[kind].label(job, box)}* (#${same[0].id}).`, already_watching: `#${same[0].id}`, how_it_fires: WATCH[kind].how }
      const { data: row, error } = await admin.from('bot_watches').insert({ phone: person.phone, person_name: person.name, kind, job_id: job.id, job_no: job.job_no, target: box || '', event: WATCH[kind].label(job, box) }).select('id').single()
      if (error) return { not_done: `Could not save: ${error.message}` }
      return { say: `🔔 I'll tell you when *${WATCH[kind].label(job, box)}*. Note: ${WATCH[kind].how}.`, set: true, id: row.id, watching: WATCH[kind].label(job, box), how_it_fires: WATCH[kind].how, note: `watch ${row.id} set`, tell_the_person: 'Confirm in one line, and say honestly how it is noticed (how_it_fires).' }
    },
    async list_watches() {
      const { data: rows } = await admin.from('bot_watches').select('id, event, created_at').eq('phone', person.phone).is('done_at', null).eq('cancelled', false).order('created_at').limit(20)
      return { watches: (rows || []).map((r: any) => `#${r.id} · ${r.event} (since ${when(r.created_at)})`) }
    },
    async cancel_watch(args: any) {
      const id = Number(args?.id)
      if (!id) return { not_done: 'Which watch? Give its number.' }
      if (d.test) return { cancelled: false, test_mode: `would cancel #${id}` }
      const { data: rows } = await admin.from('bot_watches').update({ cancelled: true }).eq('id', id).eq('phone', person.phone).is('done_at', null).select('id')
      return rows?.length ? { cancelled: true, id, say: `Stopped watch #${id}.` } : { not_found: `watch #${id}` }
    },

    // ── Customs for several jobs: one by one, a few seconds apart, one message at the end ──
    async check_customs_many(args: any) {
      const all = jobsFor(person, data.jobs).filter((x: any) => x.job_type !== 'export')
      let jobs: any[]
      if (Array.isArray(args?.jobs) && args.jobs.length) {
        jobs = []
        for (const ref of args.jobs) { const x = findJob(data, person, ref); if (x && !jobs.includes(x)) jobs.push(x) }
      } else {
        // "check all waiting": BE filed, no OOC yet
        jobs = all.filter((x: any) => { const p = journeyFor(x, data).phase; return p === 'ooc' || (p === 'arrival' && x.be_no) })
      }
      const ready = jobs.filter((x) => /^\d{7}$/.test(String(x.be_no || '').trim()) && x.be_date)
      const noBe = jobs.filter((x) => !ready.includes(x)).map((x) => x.job_no)
      if (!ready.length) return { not_possible: noBe.length ? `No BE number and date on ${noBe.join(', ')}.` : 'No job is waiting for OOC.' }
      // checked in the last 30 minutes: answered from that check
      const { data: rows } = await admin.from('customs_status').select('job_id, be_no, checked_at, ooc_no, ooc_date').in('job_id', ready.map((x) => x.id))
      const saved = new Map((rows || []).map((r: any) => [r.job_id, r]))
      const recentOnes: string[] = []
      const ask: any[] = []
      for (const x of ready) {
        const cs: any = saved.get(x.id)
        if (cs && String(cs.be_no) === String(x.be_no) && minutesAgo(cs.checked_at) < GAP_MIN) recentOnes.push(`${x.job_no}: ${cs.ooc_date ? `OOC granted${cs.ooc_no ? ` (${cs.ooc_no})` : ''}` : 'OOC not yet'} (checked ${when(cs.checked_at)})`)
        else ask.push(x)
      }
      const take = ask.slice(0, MANY_MAX)
      const left = ask.slice(MANY_MAX).map((x) => x.job_no)
      if (!take.length) return { say: `🛃 All of these were checked with Customs in the last 30 minutes, so Customs was not asked again:\n${recentOnes.map((x) => `• ${x}`).join('\n')}`, checked_recently: recentOnes, asked_customs_now: false, note: 'Customs NOT asked: all checked within 30 min' }
      if (d.test || !d.customsOne) return { say: `(test) Would ask Customs now for ${take.map((x) => x.job_no).join(', ')}.${recentOnes.length ? `\nChecked shortly before:\n${recentOnes.map((x) => `• ${x}`).join('\n')}` : ''}`, started: true, test_mode: `would ask Customs for ${take.map((x) => x.job_no).join(', ')}`, checked_recently: recentOnes, not_checked_more_than_8: left }
      later((async () => {
        const lines: string[] = []
        for (let i = 0; i < take.length; i++) {
          if (i) await new Promise((r) => setTimeout(r, MANY_GAP_MS))
          lines.push(await d.customsOne!(take[i]).catch((e) => `*${take[i].job_no}*: the check did not finish (${(e as Error).message})`))
        }
        d.dataChanged()
        await d.send(`🛃 *Customs, ${take.length} job${take.length === 1 ? '' : 's'}*\n\n${lines.join('\n')}${recentOnes.length ? `\n\nChecked shortly before (not asked again):\n${recentOnes.join('\n')}` : ''}${left.length ? `\n\nNot checked (8 at a time): ${left.join(', ')}` : ''}`)
      })())
      return { say: `🛃 Asking Customs now for ${take.map((x) => `*${x.job_no}*`).join(', ')}, one by one. All results come together in one message in a minute or two.${recentOnes.length ? `\n\nChecked shortly before (not asked again):\n${recentOnes.map((x) => `• ${x}`).join('\n')}` : ''}${left.length ? `\n\nNot checked now (8 at a time): ${left.join(', ')}` : ''}${noBe.length ? `\nNo BE yet: ${noBe.join(', ')}` : ''}`, started: true, asking_customs_for: take.map((x) => x.job_no), checked_recently: recentOnes, not_checked_more_than_8: left, no_be: noBe, note: `Customs asked now for ${take.map((x) => x.job_no).join(', ')}, one message with all results to follow`, tell_the_person: 'Say you are checking these jobs with Customs one by one now and all results come together in one message in a minute or two. Give the recently checked answers now.' }
    },

    // ── plan my day: what to do first, with a tap-to-act menu ──
    async plan_my_day() {
      const mine = jobsFor(person, data.jobs).filter((x: any) => !isDelivered(x))
      const rows = mine.map((job: any) => ({ job, j: journeyFor(job, data) })).filter(({ j }) => j.phase !== 'delivered')
      const urgent: string[] = [], todo: string[] = []
      const menu: Row[] = []
      const addMenu = (id: string, title: string, description: string) => { if (menu.length < 10 && !menu.some((m) => m.id === id)) menu.push({ id: id.slice(0, 200), title: title.slice(0, 24), description: description.slice(0, 72) }) }
      for (const { job, j } of rows) {
        for (const a of j.attention) {
          if (a.level === 'red') { urgent.push(`${job.job_no} (${job.client || '—'}): ${a.text}`); addMenu(`show ${job.job_no}`, `${job.job_no} ⚠`, a.text) }
        }
      }
      for (const { job, j } of rows) {
        if (j.phase === 'ooc') { todo.push(`${job.job_no}: BE ${job.be_no} waiting for OOC`); addMenu(`check customs ${job.job_no}`, `Check OOC ${job.job_no}`, `BE ${job.be_no} · ${job.client || ''}`) }
        else if (j.readyForTruck) { todo.push(`${job.job_no}: OOC done, ${j.onwardMode === 'truck' ? 'assign a truck' : 'arrange truck or rail'}`); addMenu(`add truck to ${job.job_no}`, `Truck for ${job.job_no}`, `OOC done · ${job.client || ''}`) }
        else if ((j.phase === 'docs' || j.phase === 'arrival') && !job.be_no && j.steps?.[0]?.done) { todo.push(`${job.job_no}: ship in, BE not filed`); addMenu(`show ${job.job_no}`, `${job.job_no} file BE`, `Ship arrived · ${job.client || ''}`) }
      }
      const { data: tasks } = await admin.from('bot_tasks').select('id, job_no, text, from_name, due_at').eq('to_phone', person.phone).eq('status', 'open').order('created_at').limit(10)
      const dayEnd = new Date(); dayEnd.setUTCHours(18, 29, 59, 0) // end of today in India
      const { data: rem } = await admin.from('bot_reminders').select('due_at, text, job_no').eq('phone', person.phone).is('sent_at', null).eq('cancelled', false).lte('due_at', dayEnd.toISOString()).order('due_at').limit(10)
      if (menu.length && d.after && !d.test) d.after.push({ text: 'Tap to act on one:', list: { button: 'Choose', rows: menu } })
      return {
        urgent, to_do: todo.slice(0, 15),
        tasks_given_to_you: (tasks || []).map((t: any) => `${t.job_no ? `${t.job_no}: ` : ''}${t.text} (from ${t.from_name}${t.due_at ? `, by ${when(t.due_at)}` : ''})`),
        reminders_today: (rem || []).map((r: any) => `${when(r.due_at)}: ${r.text}`),
        open_jobs: rows.length,
        menu_sent: menu.length > 0 && !d.test,
        tell_the_person: 'Give a short plan in order: urgent first, then to-dos, tasks and reminders. Keep it short. If menu_sent, say they can tap the list below.',
      }
    },

    // ── Excel report sent as a WhatsApp file ──
    async send_report(args: any) {
      const period = ['today', 'week', 'month', 'open'].includes(String(args?.period)) ? String(args.period) : 'open'
      const from = period === 'today' ? startOfDayIst(0) : period === 'week' ? startOfDayIst(6) : period === 'month' ? startOfDayIst(29) : null
      const all = jobsFor(person, data.jobs).map((job: any) => ({ job, j: journeyFor(job, data) }))
      const inPeriod = ({ job, j }: any) => !from || [job.created_at, job.be_date, j.oocDate, job.updated_at].some((v) => v && new Date(v).getTime() >= from.getTime())
      const rows = all.filter((r: any) => (period === 'open' ? r.j.phase !== 'delivered' : inPeriod(r)))
      if (!rows.length) return { not_done: `No jobs for ${period === 'open' ? 'open jobs' : `this ${period}`}.` }
      const XLSX: any = await import('https://esm.sh/xlsx@0.18.5')
      const label = (p: string) => ({ arrival: 'Awaiting arrival', docs: 'Docs & BE filing', ooc: 'Waiting for OOC', release: 'OOC — to be moved', truck: 'On the move', delivered: 'Delivered', sb: 'Shipping bill', leo: 'Waiting for LEO', sail: 'LEO — to sail' } as any)[p] || p
      const day = (v: any) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }) : '')
      const jobsSheet = rows.map(({ job, j }: any) => ({
        'Job': job.job_no, 'Client': job.client || '', 'Mode': job.mode || '', 'Import/Export': job.job_type === 'export' ? 'Export' : 'Import',
        'Status': label(j.phase), 'BE / SB no': job.be_no || j.sbNo || '', 'BE date': day(job.be_date), 'OOC date': day(j.oocDate),
        'Containers': parseContainerNos(job.containers).join(', '), 'Free days left': j.freeDaysLeft ?? '', 'Truck': (j.trucks || []).map((t: any) => t.no).join(', '),
        'Shipping line': job.shipping_line || '', 'CFS': job.cfs_name || '', 'Opened': day(job.created_at),
      }))
      const count = (p: string) => rows.filter((r: any) => r.j.phase === p).length
      const summary = [
        { 'Item': 'Report', 'Value': period === 'open' ? 'All open jobs' : `Last ${period === 'today' ? 'day' : period}` },
        { 'Item': 'Made on', 'Value': when(new Date().toISOString()) },
        { 'Item': 'Jobs in this report', 'Value': rows.length },
        { 'Item': 'Waiting for OOC', 'Value': count('ooc') },
        { 'Item': 'OOC done, to be moved', 'Value': count('release') },
        { 'Item': 'On the move', 'Value': count('truck') },
        { 'Item': 'Delivered', 'Value': count('delivered') },
        { 'Item': 'Detention running', 'Value': rows.filter((r: any) => r.j.freeDaysLeft !== null && r.j.freeDaysLeft < 0).length },
      ]
      const book = XLSX.utils.book_new()
      const s1 = XLSX.utils.json_to_sheet(summary); s1['!cols'] = [{ wch: 26 }, { wch: 22 }]
      const s2 = XLSX.utils.json_to_sheet(jobsSheet); s2['!cols'] = Object.keys(jobsSheet[0]).map((k) => ({ wch: Math.max(10, Math.min(40, k.length + 4, ...jobsSheet.map((r: any) => String(r[k]).length + 2))) }))
      XLSX.utils.book_append_sheet(book, s1, 'Summary')
      XLSX.utils.book_append_sheet(book, s2, 'Jobs')
      const bytes = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
      const name = `JDS_${period === 'open' ? 'open_jobs' : period}_${new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)}.xlsx`
      if (d.test) return { say: `(test) Built *${name}* (${rows.length} jobs).`, sent: false, test_mode: `built ${name}: ${rows.length} jobs, ${bytes.length} bytes, not sent`, note: `test: built ${name} ${bytes.length} bytes` }
      try { await sendDocument(person.phone, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name, `JDS report · ${rows.length} jobs`) } catch (e) { return { error: `WhatsApp did not take the file: ${(e as Error).message}` } }
      return { say: `📊 Sent *${name}* (${rows.length} jobs) as a separate message.`, sent: true, file: name, jobs: rows.length, note: `sent ${name}`, tell_the_person: 'Say the Excel has been sent as a separate message, in one line.' }
    },

    // ── one PDF with a job's papers (BE, BL, Invoice, Packing List, OOC …) ──
    async send_pack(args: any) {
      const job = findJob(data, person, args?.job)
      if (!job) return { not_found: args?.job }
      const { data: docs } = await admin.from('documents').select('doc_type, file_name, file_path, file_url, created_at').eq('job_id', job.id).order('created_at')
      const order = ['BE', 'BL', 'Invoice', 'Packing List', 'OOC', 'COO', 'Insurance', 'Examination Order', 'E-Way Bill', 'POD']
      const want = Array.isArray(args?.doc_types) && args.doc_types.length ? args.doc_types.map((x: any) => String(x).toLowerCase()) : null
      const list = (docs || []).filter((x: any) => /\.(pdf|jpe?g|png)$/i.test(x.file_name || '') && (!want || want.includes(String(x.doc_type).toLowerCase())))
        .sort((a: any, b: any) => (order.indexOf(a.doc_type) + 1 || 99) - (order.indexOf(b.doc_type) + 1 || 99))
      if (!list.length) return { not_done: `${job.job_no} has no PDF or photo documents${want ? ' of those types' : ''}.`, documents: (docs || []).map((x: any) => `${x.doc_type}: ${x.file_name}`) }
      const { PDFDocument }: any = await import('https://esm.sh/pdf-lib@1.17.1')
      const pack = await PDFDocument.create()
      const used: string[] = [], skipped: string[] = []
      for (const doc of list) {
        try {
          const path = doc.file_path || (String(doc.file_url || '').match(/\/object\/(?:public|sign)\/job-documents\/([^?]+)/) || [])[1]
          const { data: blob } = await admin.storage.from('job-documents').download(decodeURIComponent(path || ''))
          if (!blob) { skipped.push(doc.doc_type); continue }
          const bytes = new Uint8Array(await blob.arrayBuffer())
          if (/\.pdf$/i.test(doc.file_name)) {
            const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
            for (const p of await pack.copyPages(src, src.getPageIndices())) pack.addPage(p)
          } else {
            const img = /\.png$/i.test(doc.file_name) ? await pack.embedPng(bytes) : await pack.embedJpg(bytes)
            const w = 595, h = 842, s = Math.min((w - 40) / img.width, (h - 40) / img.height)
            pack.addPage([w, h]).drawImage(img, { x: (w - img.width * s) / 2, y: (h - img.height * s) / 2, width: img.width * s, height: img.height * s })
          }
          used.push(doc.doc_type)
        } catch { skipped.push(doc.doc_type) }
      }
      if (!used.length) return { error: 'None of the files could be opened.' }
      const out = await pack.save()
      if (out.length > 15 * 1024 * 1024) return { error: 'The pack is over 15 MB, too big for WhatsApp. Ask for the papers one by one.' }
      const name = `${job.job_no}_documents.pdf`
      if (d.test) return { say: `(test) Built *${name}*: ${used.join(', ')}.`, sent: false, test_mode: `built ${name}: ${pack.getPageCount()} pages (${used.join(', ')}), ${out.length} bytes, not sent`, could_not_open: skipped, note: `test: built ${name} ${pack.getPageCount()} pages ${out.length} bytes` }
      try { await sendDocument(person.phone, out, 'application/pdf', name, `${job.job_no} · ${used.join(', ')}`) } catch (e) { return { error: `WhatsApp did not take the file: ${(e as Error).message}` } }
      return { say: `📎 Sent *${name}* with ${used.join(', ')} as a separate message.${skipped.length ? ` Could not open: ${skipped.join(', ')}.` : ''}`, sent: true, file: name, contains: used, could_not_open: skipped, note: `sent pack ${used.join(', ')}`, tell_the_person: 'Say the PDF has been sent as a separate message and what is in it, in one line.' }
    },
  }
}

const MANY_MAX = 8
const MANY_GAP_MS = 4000
// midnight in India, `back` days ago
function startOfDayIst(back: number) {
  const ist = new Date(Date.now() + 5.5 * 3600_000)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - back) - 5.5 * 3600_000)
}

// What a watch waits for. Container news (LDB) comes in by itself every 30 minutes;
// OOC only when Customs is checked (BE & OOC page, or asking the bot) — said honestly.
const BY_ITSELF = 'container tracking updates by itself every 30 minutes, so this comes on its own'
const BY_CHECK = 'Customs is only asked when someone checks (BE & OOC page or asking me), so this comes after the next check'
const boxOut = (j: any, box: string) => (j.containers?.tracked || []).some((t: any) => (!box || t.container_no === box) && t.outWithCargo)
const WATCH: Record<string, { label: (job: any, box: string) => string; done: (job: any, j: any, box: string) => boolean; how: string }> = {
  ooc: { label: (job) => `${job.job_no} OOC granted`, done: (_job, j) => !!j.oocDone, how: BY_CHECK },
  ship_arrived: { label: (job) => `${job.job_no} ship arrived`, done: (_job, j) => !!j.steps?.[0]?.done, how: BY_ITSELF },
  container_out: { label: (job, box) => `${box || job.job_no} out of port / CFS`, done: (_job, j, box) => boxOut(j, box), how: BY_ITSELF },
  delivered: { label: (job) => `${job.job_no} delivered`, done: (job, j) => isDelivered(job) || j.phase === 'delivered', how: 'comes when the job is marked delivered or the empty is back' },
  be_filed: { label: (job) => `${job.job_no} BE filed`, done: (_job, j) => !!j.beFiled, how: 'comes when the BE number is recorded' },
}

// Watches that came true (run by the 5-minute "warm" schedule); a watch lasts 30 days
export async function checkWatches(admin: Admin, data: any, team: Person[], sendOnce: (key: string, person: Person, text: string, jobNo: string | null) => Promise<unknown>) {
  const { data: rows } = await admin.from('bot_watches').select('*').is('done_at', null).eq('cancelled', false).limit(200)
  let fired = 0
  for (const w of rows || []) {
    if (minutesAgo(w.created_at) > 30 * 1440) { await admin.from('bot_watches').update({ cancelled: true }).eq('id', w.id); continue }
    const job = (data.jobs || []).find((x: any) => x.id === w.job_id)
    const rule = WATCH[w.kind]
    if (!job || !rule) continue
    if (!rule.done(job, journeyFor(job, data), w.target || '')) continue
    const person = team.find((t) => t.phone === w.phone)
    if (person) await sendOnce(`watch:${w.id}`, person, `🔔 *${w.event}*${job.client ? ` (${job.client})` : ''}. You asked me to tell you.`, job.job_no)
    await admin.from('bot_watches').update({ done_at: new Date().toISOString() }).eq('id', w.id)
    fired++
  }
  return fired
}

// Tasks given on WhatsApp: a "file the BE" task closes itself when the BE number
// appears; an overdue task reminds the person once and tells whoever gave it
export async function checkTasks(admin: Admin, data: any, team: Person[], sendOnce: (key: string, person: Person, text: string, jobNo: string | null) => Promise<unknown>) {
  const { data: rows } = await admin.from('bot_tasks').select('*').eq('status', 'open').limit(200)
  let n = 0
  for (const t of rows || []) {
    const job = t.job_id ? (data.jobs || []).find((x: any) => x.id === t.job_id) : null
    const from = team.find((p) => p.phone === t.from_phone)
    const to = team.find((p) => p.phone === t.to_phone)
    if (job && /\b(BE|bill of entry)\b/i.test(t.text) && /\bfile|filing|record\b/i.test(t.text) && job.be_no && job.be_date && new Date(job.updated_at || 0) >= new Date(t.created_at)) {
      await admin.from('bot_tasks').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', t.id)
      if (from) await sendOnce(`taskdone:${t.id}`, from, `✅ Task done: ${t.to_name} — ${t.text} (${job.job_no}: BE ${job.be_no} recorded).`, job.job_no)
      n++
      continue
    }
    if (t.due_at && !t.reminded_at && new Date(t.due_at).getTime() < Date.now()) {
      if (to) await sendOnce(`taskdue:${t.id}`, to, `⏰ *Task overdue*${t.job_no ? ` (${t.job_no})` : ''}: ${t.text} — from ${t.from_name}. Reply DONE when finished.`, t.job_no)
      if (from) await sendOnce(`taskdue-from:${t.id}`, from, `⏰ ${t.to_name} has not finished yet: ${t.text}${t.job_no ? ` (${t.job_no})` : ''}. It was due ${when(t.due_at)}.`, t.job_no)
      await admin.from('bot_tasks').update({ reminded_at: new Date().toISOString() }).eq('id', t.id)
      n++
    }
  }
  return n
}

// Sends the reminders that are due (run by the 5-minute "warm" schedule)
export async function sendDueReminders(admin: Admin, team: Person[], sendOnce: (key: string, person: Person, text: string, jobNo: string | null) => Promise<unknown>) {
  const { data: rows } = await admin.from('bot_reminders').select('*').lte('due_at', new Date().toISOString()).is('sent_at', null).eq('cancelled', false).order('due_at').limit(30)
  const out = []
  for (const r of rows || []) {
    const person = team.find((t) => t.phone === r.phone)
    if (person) out.push(await sendOnce(`rem:${r.id}`, person, `⏰ *Reminder*${r.job_no ? ` (${r.job_no})` : ''}: ${r.text}`, r.job_no))
    await admin.from('bot_reminders').update({ sent_at: new Date().toISOString() }).eq('id', r.id)
  }
  return out
}
