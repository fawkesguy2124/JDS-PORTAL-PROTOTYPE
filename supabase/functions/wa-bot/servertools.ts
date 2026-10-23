// The bot's tools that act (Jose, 24 Oct 2026): send a job's document, check a
// truck or find a ship when a person asks, and reminders. ULIP is asked only
// through the portal's own "ulip" function (same rules, logged under the person's
// name), only when a person asks, at most once every 30 minutes per item; the
// result follows as a separate WhatsApp message.
import { jobTrucks, plateNo } from '../_shared/portal/journeyCore.js'
import { jobsFor } from '../_shared/portal/botMessages.js'
import { sendDocument } from './media.ts'

type Admin = any
type Person = { id: string; name: string; role: string; phone: string }
type Deps = {
  admin: Admin; person: Person; data: any; test?: boolean
  send: (text: string) => Promise<unknown>
  dataChanged: () => void
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
      if (!want) return { job: job.job_no, documents: list.map((x: any) => `${x.doc_type}: ${x.file_name}`), tell_the_person: 'List these and ask which one to send.' }
      const doc = list.find((x: any) => String(x.doc_type || '').toLowerCase() === want) || list.find((x: any) => String(x.file_name || '').toLowerCase().includes(want))
      if (!doc) return { job: job.job_no, not_found: `no ${args.doc_type}`, documents: list.map((x: any) => `${x.doc_type}: ${x.file_name}`) }
      if (d.test) return { sent: false, test_mode: `would send ${doc.file_name}`, note: `test mode: ${doc.file_name} not sent` }
      const path = doc.file_path || (String(doc.file_url || '').match(/\/object\/(?:public|sign)\/job-documents\/([^?]+)/) || [])[1]
      if (!path) return { error: 'The file is missing in storage.' }
      const { data: blob, error } = await admin.storage.from('job-documents').download(decodeURIComponent(path))
      if (error || !blob) return { error: `Could not open the file: ${error?.message || 'not found'}` }
      if (blob.size > 15 * 1024 * 1024) return { error: 'The file is too big for WhatsApp (over 15 MB). Open it in the portal.' }
      try {
        await sendDocument(person.phone, new Uint8Array(await blob.arrayBuffer()), blob.type || 'application/pdf', doc.file_name || 'document.pdf', `${job.job_no} · ${doc.doc_type}`)
      } catch (e) { return { error: `WhatsApp did not take the file: ${(e as Error).message}` } }
      return { sent: true, file: doc.file_name, note: `sent ${doc.file_name}`, tell_the_person: 'The file has been sent as a separate message. Say so in one short line.' }
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
      if (saved) return { checked_recently: true, last_checked: when(saved.checked_at), answer: saved.summary, note: `FASTag NOT asked again (checked ${Math.round(minutesAgo(saved.checked_at))} min earlier)` }
      if (d.test) return { started: true, test_mode: 'FASTag was NOT asked', note: 'test mode' }
      later((async () => {
        const out = await botUlip(admin, person, 'FASTAG/01', { vehiclenumber: truck }, job?.id || null).catch((e) => ({ success: false, error: (e as Error).message }))
        const x = out?.data?.parsed?.extra || {}
        const text = out?.success
          ? `🚚 *${truck}*${job ? ` (${job.job_no})` : ''}: ${out.data?.summary || 'checked'}${x.lastPlaza ? `\nLast toll: *${x.lastPlaza}*${x.lastSeenAt ? `, ${when(x.lastSeenAt)}` : ''}` : ''}`
          : `🚚 *${truck}*: the FASTag check did not work (${String(out?.error || '').slice(0, 140)}). Try again in a few minutes, or use the Trucks page.`
        d.dataChanged()
        await d.send(text)
      })())
      return { started: true, note: 'FASTag asked now, result to follow in a separate message', tell_the_person: 'Say only that you are checking the truck now and the result follows in a separate message.' }
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
      if (saved) return { checked_recently: true, last_checked: when(saved.checked_at), answer: saved.summary, imo: saved.parsed?.extra?.imoCode || null, note: 'ICEGATE NOT asked again (checked within 30 min)' }
      if (d.test) return { started: true, test_mode: 'ICEGATE was NOT asked', note: 'test mode' }
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
      return { started: true, note: 'ICEGATE asked now, result to follow in a separate message', tell_the_person: 'Say only that you are looking up the ship now and the result follows in a separate message.' }
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
      if (d.test) return { set: false, test_mode: `would remind at ${when(due.toISOString())}: ${text}`, note: 'test mode' }
      const { data: row, error } = await admin.from('bot_reminders').insert({ phone: person.phone, person_name: person.name, job_no: job?.job_no || null, text, due_at: due.toISOString() }).select('id').single()
      if (error) return { not_done: `Could not save: ${error.message}` }
      return { set: true, id: row.id, at: when(due.toISOString()), note: `reminder ${row.id} set`, tell_the_person: 'Confirm the reminder with its time (India). It comes within 5 minutes of that time.' }
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
      return rows?.length ? { cancelled: true, id } : { not_found: `reminder #${id}` }
    },
  }
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
