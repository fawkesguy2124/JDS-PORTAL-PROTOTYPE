// Customs status for one job, from its BE number and BE date.
// Asks ICEGATE/03 (OOC from Customs) and JNPT/02 (port BE record: IGM, DO,
// OOC, trucks), saves the combined answer in customs_status, and raises an
// "OOC granted" alert the first time OOC is seen.
import { adminClient, callUlip, corsHeaders, getCaller, json, toIsoDate } from '../_shared/ulip.ts'

// Same job checked again within this window gets the saved answer, so
// repeated clicks never turn into repeated ULIP traffic.
const MIN_MINUTES_BETWEEN_CHECKS = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = adminClient()
  const caller = await getCaller(req, admin)
  if (!caller) return json({ success: false, error: 'Please sign in again.' }, 401)

  let jobId = ''
  try { jobId = String((await req.json())?.jobId || '') } catch { /* handled below */ }
  if (!jobId) return json({ success: false, error: 'No job given.' }, 400)

  const { data: job, error: jobErr } = await admin
    .from('jobs').select('id, job_no, be_no, be_date, truck_no').eq('id', jobId).maybeSingle()
  if (jobErr || !job) return json({ success: false, error: 'Job not found.' }, 404)

  const beNo = (job.be_no || '').trim()
  if (!/^\d{7}$/.test(beNo)) {
    return json({ success: false, error: 'This job needs a 7-digit BE number first.' }, 400)
  }
  if (!job.be_date) return json({ success: false, error: 'This job needs a BE date first.' }, 400)

  const { data: existing } = await admin.from('customs_status').select('*').eq('job_id', job.id).maybeSingle()
  if (
    existing && existing.be_no === beNo &&
    Date.now() - new Date(existing.checked_at).getTime() < MIN_MINUTES_BETWEEN_CHECKS * 60_000
  ) {
    return json({ success: true, cached: true, data: existing })
  }

  const [y, m, d] = String(job.be_date).split('-')
  const beDt = `${d}${m}${y}` // ICEGATE wants DDMMYYYY
  const ctx = { jobId: job.id, userId: caller.id, userName: caller.name }

  // One after the other (not in parallel) to keep traffic gentle
  const ice = await callUlip(admin, 'ICEGATE/03', { beNo, beDt }, ctx)
  const port = await callUlip(admin, 'JNPT/02', { beNo }, ctx)

  if (!ice.ok && !port.ok) {
    return json({ success: false, error: `Could not reach ULIP: ${ice.error || port.error}` }, 502)
  }

  // ICEGATE/03 answer: response[0].response = { oocNo, oocDt }
  const iceRec = ice.ok ? ice.body?.response?.[0]?.response : null
  const iceFound = !!(iceRec && (iceRec.oocNo || iceRec.oocDt))

  // JNPT/02 answer: response[0].response = [ { "Be No": ..., "Out of Charge Date": ..., ... } ]
  const portList = port.ok ? port.body?.response?.[0]?.response : null
  const portRec = Array.isArray(portList) && portList.length > 0 ? portList[0] : null

  const vehicles = (Array.isArray(portRec?.['Vehicle Info']) ? portRec['Vehicle Info'] : [])
    .map((v: any) => ({
      number: v?.['Vehicle Number'] || v?.vehicleNum || null,
      entryPermitNo: v?.['Truck Entry Permit No'] ?? null,
      entryTime: v?.['Truck Entry Time'] ?? null,
      exitTime: v?.['Truck Exit Time'] ?? null,
    }))
    .filter((v: any) => v.number)

  const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v))

  const row = {
    job_id: job.id,
    job_no: job.job_no,
    be_no: beNo,
    be_date: job.be_date,
    ooc_no: str(iceRec?.oocNo) ?? str(portRec?.['Out of Charge No']),
    ooc_date: toIsoDate(iceRec?.oocDt) ?? toIsoDate(portRec?.['Out of Charge Date']),
    igm_no: str(portRec?.['IGM NO']),
    igm_date: toIsoDate(portRec?.['IGM Date']),
    do_no: str(portRec?.['Delivery Oder No']),
    do_date: toIsoDate(portRec?.['DO Date']),
    vehicles,
    icegate_status: !ice.ok ? 'error' : iceFound ? 'found' : 'not_found',
    jnpt_status: !port.ok ? 'error' : portRec ? 'found' : 'not_found',
    icegate_error: ice.ok ? null : ice.error,
    jnpt_error: port.ok ? null : port.error,
    raw: { icegate: ice.body, jnpt: port.body },
    checked_at: new Date().toISOString(),
    checked_by: caller.id,
    checked_by_name: caller.name,
  }

  // Keep earlier good values when one source failed this time
  if (existing && existing.be_no === beNo) {
    for (const k of ['ooc_no', 'ooc_date', 'igm_no', 'igm_date', 'do_no', 'do_date'] as const) {
      if (row[k] === null && existing[k]) (row as any)[k] = existing[k]
    }
    if (vehicles.length === 0 && Array.isArray(existing.vehicles)) row.vehicles = existing.vehicles
  }

  const { data: saved, error: saveErr } = await admin.from('customs_status').upsert(row).select().single()
  if (saveErr) return json({ success: false, error: `Could not save result: ${saveErr.message}` }, 500)

  // First time OOC is seen for this job: alert everyone
  if (row.ooc_date && !existing?.ooc_date) {
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

  // Save the first truck number on the job for truck tracking later
  if (!job.truck_no && row.vehicles[0]?.number) {
    const { error: truckErr } = await admin.from('jobs').update({ truck_no: row.vehicles[0].number }).eq('id', job.id)
    if (truckErr) console.warn('[customs-status] truck_no update failed:', truckErr.message)
  }

  return json({ success: true, cached: false, data: saved })
})
