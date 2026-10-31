import { supabase } from '../supabase'
import { readBlFile } from './blVessel'
import { startShipTracking } from './shipTracking'
import { isLineNotShip } from '../../supabase/functions/_shared/portal/shippingLines.js'

// Upload one paper for a job: the file to storage, a documents row, what a BL says (never
// overwrites; see applyBlToJob), and an activity log line. The same steps the Documents page
// takes, so the job panel can upload in place (Jose, 31 Oct 2026: one Upload button with
// the paper types in a menu). Returns { ok, error, vessel }.
export const MAX_BYTES = 10 * 1024 * 1024
const OK_EXT = ['.pdf', '.jpg', '.jpeg', '.png']
const OK_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
const sanitizeFilename = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_')

export function fileProblem(file) {
  if (!file) return 'No file chosen.'
  const ext = `.${file.name.split('.').pop().toLowerCase()}`
  if (!OK_MIME.includes(file.type) && !OK_EXT.includes(ext)) return 'Unsupported file type. Use PDF, JPG or PNG.'
  if (file.size > MAX_BYTES) return 'File size must be under 10 MB.'
  return null
}

// A BL uploaded to a job: the job gets what it is still missing from it (the ship, the
// BL number, the containers, the shipping line; never overwritten, except a shipping
// line saved as the ship, e.g. "EVERGREEN"), then ship tracking starts at once (Jose,
// 1 Nov 2026: "once the BL is uploaded, tracking should start"; before, a job created
// without a BL or container number never started). Returns { vessel, filled, job }.
export async function applyBlToJob(job, file) {
  let bl = null
  try { bl = await readBlFile(file) } catch (e) { console.warn('[jobDocuments] could not read the BL:', e?.message) }
  const lineAsShip = !!job.vessel && isLineNotShip(String(job.vessel).split('/')[0], job.shipping_line)
  const updates = {}
  if (bl?.vessel && (!job.vessel || lineAsShip)) updates.vessel = bl.vessel
  if (bl?.bl_no && !String(job.bl_no || '').trim()) updates.bl_no = bl.bl_no
  if (bl?.containers?.length && !String(job.containers || '').trim()) updates.containers = bl.containers.join(' ')
  if (bl?.shipping_line && !String(job.shipping_line || '').trim()) updates.shipping_line = bl.shipping_line
  let saved = job
  if (Object.keys(updates).length) {
    const { data, error } = await supabase.from('jobs').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', job.id).select().maybeSingle()
    if (error) console.warn('[jobDocuments] could not save what the BL says:', error.message)
    else if (data) saved = data
  }
  // ship tracking starts now (runs on in the background)
  startShipTracking(saved)
  return { vessel: saved !== job && updates.vessel ? updates.vessel : null, filled: saved !== job ? Object.keys(updates) : [], job: saved }
}

export async function uploadJobDocument({ job, file, docType, userName }) {
  const problem = fileProblem(file)
  if (problem) return { ok: false, error: problem }
  try {
    const { data: { user } = {} } = await supabase.auth.getUser()
    const filePath = `${job.id}/${Date.now()}_${sanitizeFilename(file.name)}`
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
      uploaded_by_name: userName || null,
      file_size: file.size,
      created_at: new Date().toISOString(),
    })
    if (insErr) throw insErr
    const vessel = docType === 'BL' ? (await applyBlToJob(job, file)).vessel : null
    try {
      await supabase.from('activity_log').insert({
        type: 'document_upload', action: 'document_upload',
        title: `${job.job_no} — ${docType} uploaded`,
        note: `${file.name} uploaded by ${userName || 'staff'}`,
        job_no: job.job_no, job_id: job.id,
        done_by: user?.id || null, done_by_name: userName || null, user_name: userName || null,
        meta: { job_id: job.id, job_no: job.job_no, file_name: file.name, doc_type: docType },
        created_at: new Date().toISOString(),
      })
    } catch (e) { console.warn('[jobDocuments] activity_log insert failed:', e?.message) }
    return { ok: true, vessel }
  } catch (e) {
    return { ok: false, error: e?.message || 'Upload failed.' }
  }
}
