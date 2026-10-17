import { supabase } from '../supabase'

// The few things staff record in the portal after doing them elsewhere.
// Each returns { ok: true, job } or { ok: false, error } in plain words.

const NO_PERMISSION = 'You don’t have permission to change this job (or it was deleted). Please ask an admin.'

async function log(job, type, title, note, userName, meta) {
  const { error } = await supabase.from('activity_log').insert({
    type, action: type, title, note,
    job_id: job.id, job_no: job.job_no, done_by_name: userName || null,
    meta: { job_id: job.id, job_no: job.job_no, ...(meta || {}) },
  })
  if (error) console.warn('[jobActions] activity log failed:', error.message)
}

// Updates one job and returns the saved row, or a plain error
async function updateJob(jobId, update) {
  const { data, error } = await supabase.from('jobs').update(update).eq('id', jobId).select()
  if (error) return { ok: false, error: `Could not save: ${error.message}` }
  if (!data || data.length === 0) return { ok: false, error: NO_PERMISSION }
  return { ok: true, job: data[0] }
}

const today = () => new Date().toISOString().slice(0, 10)

// "BE filed in LiveImpex": BE number + date. Moves the job to stage 4
// (Customs review) if it was earlier than that.
export async function markBeFiled(job, { beNo, beDate }, userName) {
  const no = String(beNo || '').trim()
  if (!/^\d{7}$/.test(no)) return { ok: false, error: 'BE number must be 7 digits, for example 2237841.' }
  if (!beDate) return { ok: false, error: 'Please pick the BE date.' }
  if (beDate > today()) return { ok: false, error: 'The BE date cannot be in the future.' }
  const update = { be_no: no, be_date: beDate, updated_at: new Date().toISOString() }
  if ((Number(job.stage) || 0) < 4) update.stage = 4
  const res = await updateJob(job.id, update)
  if (!res.ok) return res
  await log(job, 'be_filed', `${job.job_no} — BE ${no} filed`, `BE ${no} dated ${beDate} filed in LiveImpex (recorded by ${userName || 'staff'})`, userName, { be_no: no, be_date: beDate })
  return res
}

// "Shipping bill filed in LiveImpex" (exports): SB number + date, kept in ulip_refs
export async function markSbFiled(job, { sbNo, sbDate }, userName) {
  const no = String(sbNo || '').trim()
  if (!/^\d{7}$/.test(no)) return { ok: false, error: 'Shipping bill number must be 7 digits.' }
  if (!sbDate) return { ok: false, error: 'Please pick the shipping bill date.' }
  if (sbDate > today()) return { ok: false, error: 'The shipping bill date cannot be in the future.' }
  const { data, error } = await supabase.rpc('merge_job_refs', { p_job: job.id, p_found: {}, p_typed: { sb_no: no, sb_date: sbDate }, p_truck: null })
  const row = Array.isArray(data) ? data[0] : data
  if (error) return { ok: false, error: `Could not save: ${error.message}` }
  if (!row?.id) return { ok: false, error: NO_PERMISSION }
  await log(job, 'sb_filed', `${job.job_no} — Shipping bill ${no} filed`, `SB ${no} dated ${sbDate} filed in LiveImpex (recorded by ${userName || 'staff'})`, userName, { sb_no: no, sb_date: sbDate })
  return { ok: true, job: row }
}

// "Assign truck": truck number, and the driver's licence if known. A new
// truck clears the previous driver's licence so papers are not checked for
// the wrong driver.
export async function assignTruck(job, { truckNo, dlNo }, userName) {
  const truck = String(truckNo || '').toUpperCase().replace(/\s+/g, '')
  // State series (MH04AB1234, KA01A1234) or Bharat series (22BH1234AA)
  if (!/^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}|\d{2}BH\d{4}[A-Z]{1,2})$/.test(truck)) return { ok: false, error: 'Truck number looks wrong. Example: MH04AB1234.' }
  const dl = dlNo ? String(dlNo).trim().toUpperCase() : null

  const refs = { ...(job.ulip_refs || {}) }
  if (dl) refs.dl_no = dl
  else if (job.truck_no && job.truck_no !== truck) delete refs.dl_no

  const res = await updateJob(job.id, { truck_no: truck, ulip_refs: refs, updated_at: new Date().toISOString() })
  if (!res.ok) return res
  await log(job, 'truck_dispatched', `Truck ${truck} assigned — ${job.job_no}`, `Truck ${truck}${dl ? `, driver licence ${dl}` : ''} (by ${userName || 'staff'})`, userName, { truckNo: truck, enteredBy: userName })
  return res
}

// Stage change with the usual activity log entry
export async function setStage(job, stage, stageName, userName) {
  const res = await updateJob(job.id, { stage, updated_at: new Date().toISOString() })
  if (!res.ok) return res
  await log(job, 'stage_update', `${job.job_no} — Stage ${stage}: ${stageName}`, `Stage updated by ${userName || 'staff'}`, userName, { old_stage: job.stage, new_stage: stage })
  return res
}
