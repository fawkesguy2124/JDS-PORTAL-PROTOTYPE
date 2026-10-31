import { supabase } from '../supabase'
import { markBeFiled, markSbFiled, assignTruck, setStage } from '../services/jobActions'
import { saveBeStage } from '../industrial/BeStage'
import { checkCustoms, checkTruck, isDue } from '../industrial/autoChecks'
import { isExportJob, isDelivered, plateNo, containerFinishedOn } from '../services/journey'
import { getStageName } from '../utils/jobHelpers'
import { vesselFromBl } from '../services/blVessel'

// Job page actions (BUILD-SPEC §3). Every write goes through the existing
// service the old screens use, with the same arguments, so the database rows
// and activity_log entries are exactly what the old portal writes.

// as CustomsPage.jsx: permission / RLS errors in plain words
export const plainSaveError = (msg) => (/permission|policy|row-level|not allowed|denied|no permission/i.test(msg || '') ? "You don't have permission to change this job." : msg)

// as CustomsPage.jsx LEO_CHECK
export const LEO_CHECK = { api: 'ICEGATE/06', title: 'Has LEO been given?', button: 'Check LEO', refs: { sbNo: 'sb_no', sbDt: 'sb_date' } }

// today as YYYY-MM-DD (max of the BE / SB date inputs)
export const todayIso = () => new Date().toISOString().slice(0, 10)

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const tooBig = (file) => !!file && file.size > MAX_UPLOAD_BYTES

const ok = (message) => ({ ok: true, message })
const fail = (error) => ({ ok: false, error: plainSaveError(error) })
const cancelled = () => ({ ok: false, cancelled: true })

// runAction(kind, row, input, ctx) → { ok: true, message } | { ok: false, error } | { ok: false, cancelled: true }
// ctx = { userName, patchJob, refresh }
export async function runAction(kind, row, input, ctx) {
  const { job, j } = row
  const { userName, patchJob, refresh } = ctx
  const saved = (message) => (res) => {
    if (!res?.ok) return fail(res?.error || 'Could not save.')
    patchJob(res.job)
    return ok(message)
  }
  try {
    switch (kind) {
      case 'be':
        return saved('BE filed')(await markBeFiled(job, { beNo: input?.no, beDate: input?.date }, userName))
      case 'sb':
        return saved('shipping bill filed')(await markSbFiled(job, { sbNo: input?.no, sbDate: input?.date }, userName))
      case 'arrived':
        return saved('marked arrived')(await setStage(job, 4, getStageName(4), userName))
      case 'assessed':
      case 'query_answered':
      case 'duty_paid': {
        // saveBeStage throws on error; a reply to a query sends the BE back to the appraising officer
        const stage = { assessed: 'assessed', query_answered: 'ao', duty_paid: 'duty_paid' }[kind]
        const res = await saveBeStage(job, stage, userName)
        patchJob(res)
        return ok({ assessed: 'assessed', query_answered: 'query answered', duty_paid: 'duty paid' }[kind])
      }
      case 'ooc':
        return saved('OOC received')(await setStage(job, 7, 'OOC', userName))
      case 'check_ooc': {
        const r = await checkCustoms(job.id)
        refresh()
        if (!r.ok) return fail(`${job.job_no}: customs check failed`)
        return ok(r.oocDate ? 'OOC granted' : 'no OOC yet')
      }
      case 'close_export':
        if (!window.confirm(`Mark job ${job.job_no} as shipped?`)) return cancelled()
        return saved('shipped')(await setStage(job, 10, 'Delivered', userName))
      case 'truck': {
        const res = await assignTruck(job, { truckNo: input?.truckNo }, userName)
        return saved(`truck ${plateNo(input?.truckNo)} assigned`)(res)
      }
      case 'left_cfs':
        return saved('left CFS')(await setStage(job, 9, 'Vehicle Out', userName))
      case 'delivered':
        if (!window.confirm(`Mark job ${job.job_no} as delivered?`)) return cancelled()
        return saved('delivered')(await setStage(job, 10, 'Delivered', userName))
      case 'locate': {
        const no = j.trucks?.[0]?.no
        if (!no) return fail('This job has no truck yet.')
        const r = await checkTruck('FASTAG/01', no, job.id)
        refresh()
        if (!r.ok) return fail(`${job.job_no}: FASTag check failed`)
        return ok('truck location updated')
      }
      case 'empty': {
        if (!window.confirm(`Mark the empty container(s) of ${job.job_no} as returned?`)) return cancelled()
        const res = await markEmptyReturned(job, row, userName)
        if (!res.ok) return fail(res.error)
        refresh()
        return ok('empty returned')
      }
      case 'close':
        if (!window.confirm(`Mark job ${job.job_no} as delivered?`)) return cancelled()
        return saved('closed')(await setStage(job, 10, 'Delivered', userName))
      default:
        return fail('This action is not available.')
    }
  } catch (e) {
    return fail(`Could not save: ${e?.message || e}`)
  }
}

// The one new write (BUILD-SPEC §3): the same columns the existing "Update status"
// modal of Containers writes, without clearing the others.
export async function markEmptyReturned(job, row, userName) {
  const now = new Date().toISOString()
  const boxes = (row.j.containers?.tracked || []).filter((x) => !x.stale)
  const nos = boxes.map((t) => t.container_no)
  if (!nos.length) return { ok: false, error: 'No container of this job is waiting for its empty return.' }
  for (const t of boxes) {
    const { error } = await supabase.from('container_tracking')
      .update({ status: 'empty_returned', status_text: 'Empty Returned', last_update: now, updated_at: now })
      .eq('container_no', t.container_no)
    if (error) return { ok: false, error: `Could not save: ${error.message}` }
  }
  const { error: logErr } = await supabase.from('activity_log').insert({
    type: 'container_update', action: 'container_update',
    title: `${job.job_no} — Empty returned`, note: `${nos.join(', ')} marked empty returned by ${userName}`,
    job_id: job.id, job_no: job.job_no, done_by_name: userName,
    meta: { job_id: job.id, job_no: job.job_no, containers: nos },
  })
  if (logErr) console.warn('[portal] activity log failed:', logErr.message)
  return { ok: true }
}

// "Add a paper": a verbatim copy of DocumentsSection.jsx handleUpload (storage path,
// documents row, ship name from a BL, activity_log row).
// → { ok: true, vessel: string|null } | { ok: false, error }
export async function uploadPaper(job, file, docType, { user, profile, userName }) {
  const currentUserName = userName
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${job.id}/${Date.now()}_${safeName}`
    const { error: upErr } = await supabase.storage.from('job-documents').upload(filePath, file, { cacheControl: '3600', upsert: false })
    if (upErr) throw upErr
    const { data: { publicUrl } } = supabase.storage.from('job-documents').getPublicUrl(filePath)
    const { error: insErr } = await supabase.from('documents').insert({
      job_id: job.id,
      job_no: job.job_no || '',
      file_name: file.name,
      file_type: file.name.split('.').pop(),
      doc_type: docType,
      file_url: publicUrl,
      file_path: filePath,
      uploaded_by: user?.id || null,
      uploaded_by_name: profile?.name || currentUserName,
      file_size: file.size,
      created_at: new Date().toISOString(),
    })
    if (insErr) throw insErr
    // a BL on a job with no ship yet: save the ship name from it, so the
    // Vessels page can follow the ship from the pre-alert (never overwrites)
    let savedVessel = null
    if (docType === 'BL' && !job.vessel) {
      try {
        const vessel = await vesselFromBl(file)
        if (vessel) {
          const { data: upd } = await supabase.from('jobs').update({ vessel }).eq('id', job.id).is('vessel', null).select('id')
          if (upd?.length) savedVessel = vessel
        }
      } catch (e) { console.warn('[Documents] could not read the ship name from the BL:', e?.message) }
    }
    try {
      await supabase.from('activity_log').insert({
        type: 'document_upload',
        action: 'document_upload',
        title: `${job.job_no} — ${docType} uploaded`,
        note: `${file.name} uploaded by ${profile?.name || currentUserName}`,
        job_no: job.job_no,
        job_id: job.id,
        done_by: user?.id || null,
        done_by_name: profile?.name || currentUserName,
        user_name: profile?.name || currentUserName,
        meta: { job_id: job.id, job_no: job.job_no, file_name: file.name, doc_type: docType },
        created_at: new Date().toISOString(),
      })
    } catch (logErr) {
      console.warn('[Documents] activity_log insert failed:', logErr.message)
    }
    return { ok: true, vessel: savedVessel }
  } catch (e) {
    return { ok: false, error: e?.message || 'Upload failed.' }
  }
}

// The type CreateJob guesses from a file name (used to preselect "Add a paper")
export function guessPaperType(fileName) {
  const n = String(fileName || '').toLowerCase()
  if (/out.?of.?charge|ooc/.test(n)) return 'OOC'
  if (/bill.?of.?entry|processed.?be|\bbe\b|be_\d/.test(n)) return 'BE'
  if (/lading|\bh?m?bl\b|bldraft|waybill|awb/.test(n)) return 'BL'
  if (/invoice/.test(n)) return 'Invoice'
  if (/packing/.test(n)) return 'Packing List'
  return 'Other'
}

// ── checks made by themselves when a person opens a job (BUILD-SPEC §2) ──
// Same rules as CustomsPage / TrucksPage "on open": cool-down shared through the
// saved check times, one at a time (useAutoChecks), silent.
const sameNo = (a, b) => !!a && !!b && String(a).toUpperCase().replace(/\s+/g, '') === String(b).toUpperCase().replace(/\s+/g, '')
const TRUCK_WATCH_DAYS = 4 // as TrucksPage.jsx
// copy of TrucksPage.jsx tripOver
const tripOver = (r, t) => {
  if (t.at && Date.now() - new Date(t.at).getTime() > TRUCK_WATCH_DAYS * 864e5) return true
  const boxes = (r.j.containers?.all || []).filter((b) => !t.container || sameNo(b.container_no, t.container))
  return boxes.length > 0 && boxes.every((b) => containerFinishedOn(b, r.job))
}

export function autoChecksFor(row, data, toast) {
  if (!row || !data) return []
  const { job, j } = row
  const items = []
  const cs = data.customsByJob?.[job.id]
  if (!isExportJob(job) && (j.phase === 'ooc' || (j.phase === 'arrival' && j.beFiled))
    && /^\d{7}$/.test(String(job.be_no || '').trim()) && job.be_date && isDue(cs?.checked_at, cs?.last_error_at)) {
    items.push({
      key: job.id, label: job.job_no,
      run: async () => { const r = await checkCustoms(job.id); if (r.oocDate) toast?.(`${job.job_no}: OOC granted`) },
    })
  }
  const savedFor = (api, no) => [].concat(data.resultsByJob?.[job.id]?.[api] || []).filter((r) => r && sameNo(r.params?.vehiclenumber, no))
  // trucks: as TrucksPage, only jobs still on their way (not delivered)
  const onWay = !isDelivered(job) && j.phase !== 'delivered'
  for (const t of onWay ? j.trucks || [] : []) {
    const where = savedFor('FASTAG/01', t.no)
    if (!tripOver(row, t) && isDue(...where.map((x) => x.checked_at), ...where.map((x) => x.last_error_at)))
      items.push({ key: `w:${t.no}`, label: `truck ${t.no}`, run: () => checkTruck('FASTAG/01', t.no, job.id) })
    if (!savedFor('VAHAN/04', t.no).some((x) => x.checked_at))
      items.push({ key: `p:${t.no}`, label: `truck ${t.no} papers`, run: () => checkTruck('VAHAN/04', t.no, job.id) })
  }
  return items
}
