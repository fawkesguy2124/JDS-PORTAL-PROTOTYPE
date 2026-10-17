import { supabase } from '../../supabase'

// Shared names for reference numbers, so a number typed (or found) once is
// filled in everywhere it is needed on that job.
//
// Each ref reads from a real job column when there is one; otherwise from
// jobs.ulip_refs (which ULIP checks fill in as staff use them).
const digitsOnly = (v) => (v ? String(v).replace(/\D/g, '') || null : null)

const FROM_COLUMNS = {
  be_no: (job) => job.be_no,
  be_date: (job) => job.be_date,
  hs_code: (job) => digitsOnly(job.hs_code),                     // "8471.30.10" -> "84713010"
  vehicle_no: (job) => job.truck_no,
  container_no: (job) => firstContainer(job.containers),
  port_code: (job) => job.port_code,
  eta: (job) => job.eta,
  mawb_no: (job) => (job.mode === 'Air' ? digitsOnly(job.bl_no) : null),   // air jobs keep the AWB in the BL field
}

export function firstContainer(containers) {
  return String(containers || '').split(/[\s,;/]+/).map((s) => s.trim().toUpperCase()).find(Boolean) || null
}

export function refValue(job, ref) {
  if (!job || !ref) return null
  const fromCol = FROM_COLUMNS[ref]?.(job)
  if (fromCol) return fromCol
  return job.ulip_refs?.[ref] ?? null
}

// ULIP answer "extra" values that are worth remembering, by ref name
const EXTRA_TO_REF = {
  igmNo: 'igm_no', igmDate: 'igm_date', vcnNo: 'vcn_no', sbNo: 'sb_no', sbDate: 'sb_date',
  egmNo: 'egm_no', egmDate: 'egm_date', rotationNo: 'rotation_no',
  vesselCode: 'vessel_code', imoCode: 'imo_code',
}

// After a check that FOUND a record: remember what was typed, plus useful
// numbers ULIP returned. Never touches real job columns such as be_no; fills
// truck_no only when it is empty. The merge happens in one database step
// (merge_job_refs), so two checks cannot wipe each other's numbers.
// Returns { job } with the updated job, or { error } with a plain message.
export async function rememberRefs(job, typed, extra) {
  if (!job?.id) return {}
  const keep = (ref, value) => ref && value !== null && value !== undefined && value !== '' && !FROM_COLUMNS[ref]?.(job)

  const pTyped = {}
  for (const [ref, value] of Object.entries(typed || {})) if (keep(ref, value)) pTyped[ref] = String(value)
  const pFound = {}
  for (const [k, ref] of Object.entries(EXTRA_TO_REF)) if (keep(ref, extra?.[k])) pFound[ref] = String(extra[k])
  const truck = job.truck_no ? null : (extra?.truckNumbers?.[0] || typed?.vehicle_no || null)

  if (!Object.keys(pTyped).length && !Object.keys(pFound).length && !truck) return {}

  const { data, error } = await supabase.rpc('merge_job_refs', {
    p_job: job.id, p_found: pFound, p_typed: pTyped, p_truck: truck,
  })
  if (error) {
    console.warn('[ulip] could not remember reference numbers:', error.message)
    return { error: 'The numbers could not be saved for next time.' }
  }
  const row = Array.isArray(data) ? data[0] : data
  return { job: row ? { ...job, ...row } : job }
}
