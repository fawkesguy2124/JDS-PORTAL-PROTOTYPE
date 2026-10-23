// Customs status for one job, from its BE number and BE date.
// Asks ICEGATE/03 (OOC from Customs) and, for JNPT jobs, JNPT/02 (port BE
// record: IGM, DO, OOC, trucks). Saves the combined answer in customs_status
// and raises an "OOC granted" alert the first time OOC is seen.
//
// Traffic rules (same spirit as the "ulip" function):
// - same job checked again within 5 minutes → saved answer, no ULIP call
// - after a failure → wait 2 minutes before asking ULIP again
// - two presses at once → the second is refused
// - JNPT is asked only for JNPT jobs (no pointless calls for other ports)
// - the WhatsApp bot may ask too, when a person asks it to check (Jose, 23 Oct
//   2026): with the bot's database password, at most once every 30 minutes per
//   job; a newer check is answered from the saved one
import { adminClient, callUlip, claimKey, corsHeaders, getCaller, json, releaseKey, toIsoDate } from '../_shared/ulip.ts'

const MIN_MINUTES_BETWEEN_CHECKS = 5
const MIN_MINUTES_BETWEEN_BOT_CHECKS = 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIN_MINUTES_AFTER_FAILURE = 2
const SKIP_SECOND_CALL_AFTER_MS = 60_000

const minutesSince = (iso: string | null | undefined) => (iso ? (Date.now() - new Date(iso).getTime()) / 60_000 : Infinity)
const short = (e?: string) => (e || '').split(' | ')[0] || null

Deno.serve(async (req) => {
  const requestStart = Date.now()
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = adminClient()
  let body: any = {}
  try { body = await req.json() } catch { /* handled below */ }

  // a signed-in staff member, or the WhatsApp bot asking for one (with its password)
  let caller = await getCaller(req, admin)
  let fromBot = false
  const botSecret = req.headers.get('x-bot-secret')
  if (!caller && botSecret) {
    const { data: st } = await admin.from('bot_state').select('cron_token').eq('id', 1).maybeSingle()
    const ok = [Deno.env.get('BOT_CRON_SECRET') || '', String(st?.cron_token || '')].map((v) => v.trim()).filter((v) => v.length >= 20)
    if (!ok.includes(botSecret.trim())) return json({ success: false, error: 'Not allowed' }, 403)
    const asId = String(body?.asId || '')
    caller = { id: UUID.test(asId) ? asId : null, name: String(body?.asName || 'WhatsApp bot').slice(0, 80), role: null } as any
    fromBot = true
  }
  if (!caller) return json({ success: false, error: 'Please sign in again.' }, 401)

  const jobId = String(body?.jobId || '')
  if (!jobId) return json({ success: false, error: 'No job given.' }, 400)

  const { data: job, error: jobErr } = await admin
    .from('jobs').select('id, job_no, be_no, be_date, truck_no, port_code, mode, stage').eq('id', jobId).maybeSingle()
  if (jobErr || !job) return json({ success: false, error: 'Job not found.' }, 404)

  const beNo = (job.be_no || '').trim()
  if (!/^\d{7}$/.test(beNo)) {
    return json({ success: false, error: 'This job needs a 7-digit BE number first.' }, 400)
  }
  if (!job.be_date) return json({ success: false, error: 'This job needs a BE date first.' }, 400)
  const beDate = String(job.be_date).slice(0, 10)

  const { data: existing } = await admin.from('customs_status').select('*').eq('job_id', job.id).maybeSingle()
  const sameBe = !!existing && existing.be_no === beNo && String(existing.be_date || '').slice(0, 10) === beDate

  if (sameBe && existing.checked_at && minutesSince(existing.checked_at) < (fromBot ? MIN_MINUTES_BETWEEN_BOT_CHECKS : MIN_MINUTES_BETWEEN_CHECKS)) {
    return json({ success: true, cached: true, data: existing })
  }
  if (sameBe && minutesSince(existing.last_error_at) < MIN_MINUTES_AFTER_FAILURE) {
    return json({
      success: false,
      error: `${existing.last_error} (This check failed a moment ago. Please try again in a couple of minutes.)`,
    }, 502)
  }

  const lockKey = `customs:${job.id}`
  const claim = await claimKey(admin, lockKey, 200)
  if (!claim) {
    return json({ success: false, error: 'This check is already running. Please wait a moment.' }, 409)
  }

  try {
    const [y, m, d] = beDate.split('-')
    const beDt = `${d}${m}${y}` // ICEGATE wants DDMMYYYY
    const ctx = { jobId: job.id, userId: caller.id, userName: caller.name, requestStart }
    const askJnpt = job.mode !== 'Air' && (!job.port_code || job.port_code === 'INNSA1')

    // One after the other (not in parallel) to keep traffic gentle
    const started = Date.now()
    const ice = await callUlip(admin, 'ICEGATE/03', { beNo, beDt }, ctx)
    const port = askJnpt && !ice.refused && Date.now() - started < SKIP_SECOND_CALL_AFTER_MS
      ? await callUlip(admin, 'JNPT/02', { beNo }, ctx)
      : null

    // ICEGATE/03 answer: response[0].response = { oocNo, oocDt }. A text answer means a problem.
    const iceInner = ice.ok ? ice.body?.response?.[0]?.response : null
    const iceText = typeof iceInner === 'string' ? iceInner : null
    const iceRec = iceInner && typeof iceInner === 'object' && !Array.isArray(iceInner) ? iceInner : null
    const iceOk = ice.ok && !iceText
    const iceFound = !!(iceRec && (iceRec.oocNo || iceRec.oocDt))

    // JNPT/02 answer: response[0].response = [ { "Be No": ..., "Out of Charge Date": ..., ... } ]
    const portInner = port?.ok ? port.body?.response?.[0]?.response : null
    const portText = typeof portInner === 'string' ? portInner : null
    const portRec = Array.isArray(portInner) && portInner.length > 0 ? portInner[0] : null
    const portOk = !!port?.ok && !portText

    const iceError = iceOk ? null : (iceText || short(ice.error) || 'ICEGATE problem')
    const portError = !port ? null : portOk ? null : (portText || short(port.error) || 'JNPT problem')

    if (!iceOk && (!port || !portOk)) {
      const message = port ? `Customs: ${iceError}. Port: ${portError}.` : `Customs: ${iceError}.`
      if (!ice.refused) {
        // Remember the failure so repeated presses wait (earlier good values are kept)
        const keepOld = sameBe ? {} : {
          ooc_no: null, ooc_date: null, igm_no: null, igm_date: null, do_no: null, do_date: null,
          vehicles: [], icegate_status: null, jnpt_status: null, raw: null, checked_at: null, checked_by: null, checked_by_name: null,
        }
        const { error: errSave } = await admin.from('customs_status').upsert({
          job_id: job.id, job_no: job.job_no, be_no: beNo, be_date: beDate, ...keepOld,
          last_error: message, last_error_at: new Date().toISOString(),
        })
        if (errSave) console.warn('[customs-status] could not record failure:', errSave.message)
      }
      return json({ success: false, error: `ULIP problem. ${message}` }, ice.refused ? 429 : 502)
    }

    const vehicles = (Array.isArray(portRec?.['Vehicle Info']) ? portRec['Vehicle Info'] : [])
      .map((v: any) => ({
        number: v?.['Vehicle Number'] || v?.vehicleNum || null,
        entryPermitNo: v?.['Truck Entry Permit No'] ?? null,
        entryTime: v?.['Truck Entry Time'] ?? null,
        exitTime: v?.['Truck Exit Time'] ?? null,
      }))
      .filter((v: any) => v.number)

    const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v))
    // Only a real 7-digit ICEGATE IGM number is kept (ports sometimes send their own numbers)
    const igmRaw = str(portRec?.['IGM NO'])
    const igmNo = igmRaw && /^\d{7}$/.test(igmRaw) ? igmRaw : null

    const row: Record<string, any> = {
      job_id: job.id,
      job_no: job.job_no,
      be_no: beNo,
      be_date: beDate,
      ooc_no: str(iceRec?.oocNo) ?? str(portRec?.['Out of Charge No']),
      ooc_date: toIsoDate(iceRec?.oocDt) ?? toIsoDate(portRec?.['Out of Charge Date']),
      igm_no: igmNo,
      igm_date: igmNo ? toIsoDate(portRec?.['IGM Date']) : null,
      do_no: str(portRec?.['Delivery Oder No'] ?? portRec?.['Delivery Order No']),
      do_date: toIsoDate(portRec?.['DO Date']),
      vehicles,
      icegate_status: !iceOk ? 'error' : iceFound ? 'found' : 'not_found',
      jnpt_status: !port ? 'skipped' : !portOk ? 'error' : portRec ? 'found' : 'not_found',
      icegate_error: iceError,
      jnpt_error: portError,
      raw: { icegate: ice.body, jnpt: port?.body ?? null },
      checked_at: new Date().toISOString(),
      checked_by: caller.id,
      checked_by_name: caller.name,
      last_error: null,
      last_error_at: null,
    }

    // Keep earlier good values when one source failed this time
    if (sameBe) {
      for (const k of ['ooc_no', 'ooc_date', 'igm_no', 'igm_date', 'do_no', 'do_date'] as const) {
        if (row[k] === null && existing[k]) row[k] = existing[k]
      }
      if (vehicles.length === 0 && Array.isArray(existing.vehicles)) row.vehicles = existing.vehicles
    }

    const { data: saved, error: saveErr } = await admin.from('customs_status').upsert(row).select().single()
    if (saveErr) return json({ success: false, error: `Could not save result: ${saveErr.message}` }, 500)

    // First time OOC is seen for this job: alert everyone (unique on title+job_no)
    if (row.ooc_date && !(sameBe && existing.ooc_date)) {
      const { error: logErr } = await admin.from('activity_log').upsert({
        type: 'ooc_granted',
        action: 'ooc_granted',
        title: `OOC granted — ${job.job_no}`,
        note: `OOC ${row.ooc_no || ''} dated ${row.ooc_date} (checked by ${caller.name})`.trim(),
        job_id: job.id,
        job_no: job.job_no,
        done_by: caller.id,
        done_by_name: caller.name,
        meta: { be_no: beNo, ooc_no: row.ooc_no, ooc_date: row.ooc_date },
      }, { onConflict: 'title,job_no', ignoreDuplicates: true })
      if (logErr) console.warn('[customs-status] OOC alert insert failed:', logErr.message)
    }

    // OOC granted: move the job to the OOC stage (7) by itself, so nobody has to
    // press "Move job to stage 7" (only forwards, never back from a later stage)
    if (row.ooc_date && (Number(job.stage) || 0) < 7) {
      const { data: moved, error: stageErr } = await admin.from('jobs').update({ stage: 7, updated_at: new Date().toISOString() })
        .eq('id', job.id).or('stage.is.null,stage.lt.7').select('id')
      if (stageErr) console.warn('[customs-status] stage update failed:', stageErr.message)
      else if (moved?.length) {
        await admin.from('activity_log').insert({
          type: 'stage_update', action: 'stage_update', title: `${job.job_no} — Stage 7: OOC`,
          note: `Moved to OOC by itself after Customs granted OOC (check by ${caller.name})`,
          job_id: job.id, job_no: job.job_no, done_by: caller.id, done_by_name: caller.name,
          meta: { job_id: job.id, job_no: job.job_no, old_stage: job.stage, new_stage: 7, auto: true },
        })
      }
    }

    // Save the first truck number on the job for truck tracking later (only if still empty)
    if (!job.truck_no && row.vehicles[0]?.number) {
      const { error: truckErr } = await admin.from('jobs').update({ truck_no: row.vehicles[0].number })
        .eq('id', job.id).is('truck_no', null)
      if (truckErr) console.warn('[customs-status] truck_no update failed:', truckErr.message)
    }

    return json({ success: true, cached: false, data: saved })
  } finally {
    await releaseKey(admin, lockKey, claim)
  }
})
