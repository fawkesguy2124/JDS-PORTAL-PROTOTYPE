import { supabase } from '../supabase'

// The few things staff record in the portal after doing them elsewhere.
// Each returns { ok: true, job } or { ok: false, error } in plain words.

async function log(job, type, title, note, userName, meta) {
  const { error } = await supabase.from('activity_log').insert({
    type, action: type, title, note,
    job_id: job.id, job_no: job.job_no, done_by_name: userName || null,
    meta: { job_id: job.id, job_no: job.job_no, ...(meta || {}) },
  })
  if (error) console.warn('[jobActions] activity log failed:', error.message)
}

// "BE filed in LiveImpex": BE number + date. Moves the job to stage 4
// (Customs review) if it was earlier than that.
export async function markBeFiled(job, { beNo, beDate }, userName) {
  const no = String(beNo || '').trim()
  if (!/^\d{7}$/.test(no)) return { ok: false, error: 'BE number must be 7 digits, for example 2237841.' }
  if (!beDate) return { ok: false, error: 'Please pick the BE date.' }
  const update = { be_no: no, be_date: beDate, updated_at: new Date().toISOString() }
  if ((Number(job.stage) || 0) < 4) update.stage = 4
  const { data, error } = await supabase.from('jobs').update(update).eq('id', job.id).select().single()
  if (error) return { ok: false, error: `Could not save: ${error.message}` }
  await log(job, 'be_filed', `${job.job_no} — BE ${no} filed`, `BE ${no} dated ${beDate} filed in LiveImpex (recorded by ${userName || 'staff'})`, userName, { be_no: no, be_date: beDate })
  return { ok: true, job: data }
}

// "Shipping bill filed in LiveImpex" (exports): SB number + date, kept in ulip_refs
export async function markSbFiled(job, { sbNo, sbDate }, userName) {
  const no = String(sbNo || '').trim()
  if (!/^\d{7}$/.test(no)) return { ok: false, error: 'Shipping bill number must be 7 digits.' }
  if (!sbDate) return { ok: false, error: 'Please pick the shipping bill date.' }
  const { data, error } = await supabase.rpc('merge_job_refs', { p_job: job.id, p_found: {}, p_typed: { sb_no: no, sb_date: sbDate }, p_truck: null })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row?.id) return { ok: false, error: `Could not save: ${error?.message || 'no permission'}` }
  await log(job, 'sb_filed', `${job.job_no} — Shipping bill ${no} filed`, `SB ${no} dated ${sbDate} filed in LiveImpex (recorded by ${userName || 'staff'})`, userName, { sb_no: no, sb_date: sbDate })
  return { ok: true, job: row }
}

// "Assign truck": truck number (and driver licence if known). Replaces the
// truck number only when staff deliberately change it.
export async function assignTruck(job, { truckNo, dlNo }, userName) {
  const truck = String(truckNo || '').toUpperCase().replace(/\s+/g, '')
  // State series (MH04AB1234, KA01A1234) or Bharat series (22BH1234AA)
  if (!/^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}|\d{2}BH\d{4}[A-Z]{1,2})$/.test(truck)) return { ok: false, error: 'Truck number looks wrong. Example: MH04AB1234.' }
  const { error: tErr } = await supabase.from('jobs').update({ truck_no: truck, updated_at: new Date().toISOString() }).eq('id', job.id)
  if (tErr) return { ok: false, error: `Could not save: ${tErr.message}` }
  const typed = dlNo ? { dl_no: String(dlNo).trim().toUpperCase() } : {}
  const { data, error } = await supabase.rpc('merge_job_refs', { p_job: job.id, p_found: {}, p_typed: typed, p_truck: null })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row?.id) return { ok: false, error: `Truck saved, but the licence number could not be saved: ${error?.message || 'no permission'}` }
  await log(job, 'truck_dispatched', `Truck ${truck} assigned — ${job.job_no}`, `Truck ${truck}${dlNo ? `, driver licence ${typed.dl_no}` : ''} (by ${userName || 'staff'})`, userName, { truckNo: truck, enteredBy: userName })
  return { ok: true, job: row }
}

// Stage change with the usual activity log entry
export async function setStage(job, stage, stageName, userName) {
  const { data, error } = await supabase.from('jobs').update({ stage, updated_at: new Date().toISOString() }).eq('id', job.id).select().single()
  if (error) return { ok: false, error: `Could not update stage: ${error.message}` }
  await log(job, 'stage_update', `${job.job_no} — Stage ${stage}: ${stageName}`, `Stage updated by ${userName || 'staff'}`, userName, { old_stage: job.stage, new_stage: stage })
  return { ok: true, job: data }
}
