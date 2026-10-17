import { supabase } from '../../supabase'

// Shared names for reference numbers, so a number typed (or found) once is
// filled in everywhere it is needed on that job.
//
// Each ref reads from a real job column when there is one; otherwise from
// jobs.ulip_refs (which ULIP checks fill in as staff use them).
const FROM_COLUMNS = {
  be_no: (job) => job.be_no,
  be_date: (job) => job.be_date,
  hs_code: (job) => job.hs_code,
  vehicle_no: (job) => job.truck_no,
  container_no: (job) => firstContainer(job.containers),
  port_code: (job) => job.port_code,
  eta: (job) => job.eta,
  mawb_no: (job) => (job.mode === 'Air' ? job.bl_no : null),   // for air jobs the AWB is kept in the BL field
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

// After a successful check: remember what was typed, plus useful numbers ULIP
// returned (extra.igmNo, extra.vcnNo, extra.truckNumbers ...). Never overwrites
// a real job column such as be_no; only fills truck_no when it is empty.
const EXTRA_TO_REF = {
  igmNo: 'igm_no', igmDate: 'igm_date', vcnNo: 'vcn_no', sbNo: 'sb_no', sbDate: 'sb_date',
  egmNo: 'egm_no', egmDate: 'egm_date', mawbNo: 'mawb_no', hawbNo: 'hawb_no', rotationNo: 'rotation_no',
  vesselCode: 'vessel_code', imoCode: 'imo_code',
}

export async function rememberRefs(job, typed, extra) {
  if (!job?.id) return null
  const refs = { ...(job.ulip_refs || {}) }
  let changed = false
  const put = (ref, value) => {
    if (!ref || value === null || value === undefined || value === '') return
    if (FROM_COLUMNS[ref]?.(job)) return              // real column already has it
    if (refs[ref] === value) return
    refs[ref] = value
    changed = true
  }
  for (const [ref, value] of Object.entries(typed || {})) put(ref, value)
  for (const [k, ref] of Object.entries(EXTRA_TO_REF)) put(ref, extra?.[k])

  const update = {}
  if (changed) update.ulip_refs = refs
  const truck = extra?.truckNumbers?.[0] || typed?.vehicle_no
  if (!job.truck_no && truck) update.truck_no = truck
  if (Object.keys(update).length === 0) return null

  const { error } = await supabase.from('jobs').update(update).eq('id', job.id)
  if (error) {
    console.warn('[ulip] could not remember reference numbers:', error.message)
    return null
  }
  return { ...job, ...update }
}
