import { supabase } from '../supabase'
import { jobTrucks, plateNo } from './journey'

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

// "Add truck": a job can have several trucks (a big job after OOC, often one
// truck per container). Each truck: number, and if known the container it
// carries and the driver's licence. jobs.truck_no stays = the first truck, for
// older screens; the job's first driver licence stays in ulip_refs.dl_no for
// the driver checks.
export async function assignTruck(job, { truckNo, dlNo, container }, userName) {
  const truck = plateNo(truckNo)
  // State series (MH04AB1234, KA01A1234) or Bharat series (22BH1234AA)
  if (!/^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}|\d{2}BH\d{4}[A-Z]{1,2})$/.test(truck)) return { ok: false, error: 'Truck number looks wrong. Example: MH04AB1234.' }
  const dl = dlNo ? String(dlNo).trim().toUpperCase() : null
  const box = container ? String(container).trim().toUpperCase() : null

  const list = jobTrucks(job)
  const had = list.find((t) => t.no === truck)
  if (had) { if (dl) had.dl = dl; if (box) had.container = box }
  else list.push({ no: truck, container: box, dl, at: new Date().toISOString(), by: userName || null })

  const refs = { ...(job.ulip_refs || {}) }
  if (list[0].dl) refs.dl_no = list[0].dl
  else delete refs.dl_no

  const res = await updateJob(job.id, { trucks: list, truck_no: list[0].no, ulip_refs: refs, updated_at: new Date().toISOString() })
  if (!res.ok) return res
  if (!had) {
    const n = list.length
    await log(job, 'truck_dispatched', `Truck ${truck} assigned — ${job.job_no}${n > 1 ? ` (truck ${n})` : ''}`,
      `Truck ${truck}${box ? ` with ${box}` : ''}${dl ? `, driver licence ${dl}` : ''} (by ${userName || 'staff'})`, userName, { truckNo: truck, container: box, enteredBy: userName })
  }
  return res
}

// Takes a truck off a job (typed by mistake, or replaced)
export async function removeTruck(job, truckNo, userName) {
  const truck = plateNo(truckNo)
  const list = jobTrucks(job).filter((t) => t.no !== truck)
  const refs = { ...(job.ulip_refs || {}) }
  if (list[0]?.dl) refs.dl_no = list[0].dl
  else delete refs.dl_no
  const res = await updateJob(job.id, { trucks: list, truck_no: list[0]?.no || null, ulip_refs: refs, updated_at: new Date().toISOString() })
  if (!res.ok) return res
  await log(job, 'truck_removed', `Truck ${truck} removed — ${job.job_no}`, `Truck ${truck} taken off the job (by ${userName || 'staff'})`, userName, { truckNo: truck, enteredBy: userName })
  return res
}

// Stage change with the usual activity log entry
export async function setStage(job, stage, stageName, userName) {
  const res = await updateJob(job.id, { stage, updated_at: new Date().toISOString() })
  if (!res.ok) return res
  await log(job, 'stage_update', `${job.job_no} — Stage ${stage}: ${stageName}`, `Stage updated by ${userName || 'staff'}`, userName, { old_stage: job.stage, new_stage: stage })
  return res
}
