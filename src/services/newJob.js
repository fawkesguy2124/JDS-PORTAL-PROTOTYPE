// Creating a job: the one path shared by the full Create Job form
// (pages/CreateJob.jsx) and the portal's "New job" sheet (portal/NewJobSheet.jsx).
// Moved here unchanged out of CreateJob.jsx (Jose, 31 Oct 2026) so both screens
// read the BL the same way, check the same things in the same order with the same
// messages, and write exactly the same rows (jobs, container links, documents,
// activity_log).
import { supabase } from '../supabase'
import { linkContainer } from '../api/trackingApi'
import { PORTS } from '../utils/ports'
import { CLIENT_NAMES, matchClient } from '../utils/clients'
import { readPdf, describeDocuments } from '../utils/docReader'
import { typesFoundInside } from '../utils/docTypes'
import { isLineNotShip } from '../../supabase/functions/_shared/portal/shippingLines.js'
import { loadPdfjs } from '../utils/pdfjs'

export const MODES = ['Sea FCL', 'Sea LCL', 'Air', 'BPT/MBPT']
// sea jobs carry containers (LCL: the shared consolidation box, which LDB tracks to the CFS)
export const HAS_BOXES = (mode) => mode === 'Sea FCL' || mode === 'Sea LCL'
export const BOX_NO = /^[A-Z]{4}\d{7}$/
export const CONTAINER_SIZES = ['20GP','40GP','40HC','45HC','20RF','40RF','40RFHC','20OT','40OT','20FR','40FR','20TK']
// an LCL job's box is a shared consolidation container: its size is just "LCL"
export const sizesFor = (mode) => (mode === 'Sea LCL' ? ['LCL'] : CONTAINER_SIZES)
export const defaultSize = (mode) => (mode === 'Sea LCL' ? 'LCL' : '')
export const SHIPPING_LINES = [
  'Maersk', 'MSC', 'Hapag-Lloyd', 'CMA CGM', 'Evergreen',
  'ONE', 'OOCL', 'COSCO', 'ZIM', 'HMM', 'Yang Ming',
  'Wan Hai', 'TS Line', 'Interasia', 'Emirates', 'RCL', 'Other',
]

const CLIENT_LIST = CLIENT_NAMES

export const CLIENT_ALIASES = {
  'putzmeister': 'PCM',
  'putzmeister concrete': 'PCM',
  'putzmeister concrete machines': 'PCM',
  'putzmeister concrete machines private limited': 'PCM',
  'putzmeister concrete machines pvt ltd': 'PCM',
  'putzmeister concrete machines pvt': 'PCM',
  'putzmeister india pvt ltd': 'PCM',
  'putzmeister india private limited': 'PCM',
  'putzmeister india': 'PCM',
  'putzmeister concrete pumps india': 'PCM',
  'pcm india': 'PCM',
  'ms putzmeister': 'PCM',
}

export const normalise = (str) => (str || '')
  .toLowerCase()
  .replace(/\bpvt\b|\bltd\b|\binc\b|\bcorp\b|\bllp\b|\bco\b|\bprivate\b|\blimited\b|\btrading\b|\benterprises\b|\bindustries\b|\bexim\b/g, '')
  .replace(/[^a-z0-9\s]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

export const fuzzyMatchClient = (extracted, iec) => {
  if (!extracted && !iec) return null
  const known = matchClient({ iec, name: extracted })
  if (known) return known.name
  if (!extracted) return null
  const normExtracted = normalise(extracted)

  // Check aliases first
  for (const [alias, clientName] of Object.entries(CLIENT_ALIASES)) {
    if (normExtracted.includes(normalise(alias)) || normalise(alias).includes(normExtracted)) {
      return clientName
    }
  }

  // Then fuzzy match against client list
  return CLIENT_LIST.find(c => {
    const normC = normalise(c)
    return normExtracted.includes(normC) || normC.includes(normExtracted)
  }) || null
}

export const fuzzyMatchShippingLine = (extracted) => {
  if (!extracted) return null
  const normExtracted = normalise(extracted)
  return SHIPPING_LINES.filter(sl => sl !== 'Other').find(sl => {
    const normSl = normalise(sl)
    return normExtracted.includes(normSl) || normSl.includes(normExtracted)
  }) || null
}

export const INITIAL_FORM = {
  job_no: '',
  client: '',
  mode: '',
  job_type: 'import',
  port_code: 'INNSA1',
  containers: [],
  containerRaw: '',
  goods: '',
  priority: 'normal',
  bl_no: '',
  carrier: '',
  carrierOther: '',
  vessel: '',
  eta: '',
  cfs_name: '',
  cfs_amount: '',
  be_no: '',
  be_date: '',
  hs_code: '',
  rms_status: 'pending',
  igm_no: '',
  igm_date: '',
  igm_item_no: '',
  hawb_no: '', // air: the house air waybill from the BE (kept in ulip_refs for the air checks)
  bg_required: 'no',
  destination: '',
  free_days: '14',
  detention_risk: 'low',
  stage: '0',
  delay_reason: '',
}

// The form after the mode changes: the port follows the mode, and the container
// rows appear (sea) or go (air, BPT/MBPT)
export function applyModeChange(prev, value) {
  const next = { ...prev, mode: value }
  if (value === 'Air' && (prev.port_code === 'INNSA1' || prev.port_code === 'INBOM1')) next.port_code = 'INBOM4'
  if (value !== 'Air' && prev.port_code === 'INBOM4') next.port_code = 'INNSA1'
  if (value === 'BPT/MBPT' && (prev.port_code === 'INNSA1' || prev.port_code === 'INBOM4')) next.port_code = 'INBOM1'
  if (value !== 'BPT/MBPT' && value !== 'Air' && prev.mode === 'BPT/MBPT' && prev.port_code === 'INBOM1') next.port_code = 'INNSA1'
  if (HAS_BOXES(value)) {
    const rows = prev.containers.length === 0 ? [{ no: '', size: '' }] : prev.containers
    // switching between FCL and LCL: sizes that don't fit the new mode are reset
    next.containers = rows.map(r => ({ ...r, size: sizesFor(value).includes(r.size) ? r.size : defaultSize(value) }))
  } else {
    next.containers = []
  }
  return next
}

// What a file probably is, from its name (a file sent on WhatsApp, a dropped BL)
export function guessDocType(fileName) {
  const lower = String(fileName || '').toLowerCase()
  return /out.?of.?charge|ooc/.test(lower) ? 'OOC'
    : /bill.?of.?entry|processed.?be|\bbe\b|be_\d/.test(lower) ? 'BE'
    : /lading|\bh?m?bl\b|bldraft|waybill|awb/.test(lower) ? 'BL'
    : /invoice/.test(lower) ? 'Invoice' : /packing/.test(lower) ? 'Packing List' : 'Other'
}

// Reads a PDF (the text inside it, on this computer: no AI, nothing is sent
// anywhere) and works out which empty fields of `form` it fills.
// onProgress(percent, status) is optional (the full form's progress bar).
// → { kind: 'not_pdf' | 'irrelevant' | 'mismatch' | 'ok' | 'error',
//     parsed, updates, applied, foundInside, unreadable, docBoxes, haveBoxes }
export async function extractFromPdf(file, form, onProgress) {
  try {
    // Documents are read from the text inside the PDF, on this computer.
    // No AI and nothing is sent anywhere.
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return { kind: 'not_pdf', message: 'Only PDF soft copies can be read automatically. Please fill the fields by hand.' }
    }
    const pdfjs = await loadPdfjs()
    onProgress?.(40, 'Reading pages...')
    const result = await readPdf(pdfjs, new Uint8Array(await file.arrayBuffer()))
    const inside = typesFoundInside(result.documents)
    const f = result.fields
    onProgress?.(80, 'Applying fields...')

    const parsed = {
      _source: 'pdf-text',
      _found: describeDocuments(result),
      _unreadable: result.unreadablePages,
      copy_type: f.copy_type || null,
      rms_label: f.rms_label || null,
      client: f.client || f.consignee_name || null,
      iec: f.importer_iec || null,
      bl_no: f.bl_number || null,
      containers: (f.container_numbers || []).join(' '),
      container_size: f.container_size || null,
      container_load: f.container_load || null,
      shipping_line: f.shipping_line || null,
      vessel: f.vessel_name ? `${f.vessel_name}${f.voyage_no ? ` / ${f.voyage_no}` : ''}` : null,
      goods: f.goods_description || null,
      eta: f.eta || null,
      hs_code: f.hs_code || null,
      be_no: f.be_number || null,
      be_date: f.be_date || null,
      igm_no: f.igm_number || null,
      igm_date: f.igm_date || null,
      igm_item_no: f.igm_item_no || null,
      hawb_no: f.hawb_number || null,
      rms_status: f.rms_status || null,
      port_code: f.port_code || null,
      mode: f.mode || null,
    }

    const hasMinimumFields = parsed.bl_no || parsed.be_no || parsed.containers || parsed.client
    if (!hasMinimumFields) {
      return { kind: 'irrelevant', parsed, foundInside: inside, unreadable: result.unreadablePages }
    }

    // a document of another shipment must not fill this job: when the job already has
    // containers and this document's are all different, nothing is filled from it
    const haveBoxes = form.containers.map(c => String(c.no || '').trim().toUpperCase()).filter(Boolean)
    const docBoxes = String(parsed.containers || '').split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z]{4}\d{7}$/.test(s))
    if (haveBoxes.length && docBoxes.length && !docBoxes.some(b => haveBoxes.includes(b))) {
      return { kind: 'mismatch', parsed, foundInside: inside, docBoxes: docBoxes.slice(0, 3), haveBoxes: haveBoxes.slice(0, 3) }
    }

    // Only fill fields that are currently empty — don't overwrite existing data
    const shouldFill = (field) => !form[field] || form[field] === '' || form[field] === '__other__'
    const updates = {}
    const applied = {}

    if (parsed.client && shouldFill('client')) {
      const matchedClient = fuzzyMatchClient(parsed.client, parsed.iec)
      if (matchedClient) { updates.client = matchedClient }
      else { updates.client = '__other__'; updates.clientOther = parsed.client }
      applied.client = true
    }
    if (parsed.bl_no && shouldFill('bl_no'))           { updates.bl_no = parsed.bl_no;         applied.bl_no = true }
    if (parsed.containers) {
      const extractedNos = parsed.containers.split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(s => s.length >= 4)
      // fill for any sea job, and when the rows are still blank (an empty row added
      // before the upload used to block this)
      if ((HAS_BOXES(form.mode) || !form.mode) && extractedNos.length > 0 && form.containers.every(c => !String(c.no || '').trim())) {
        updates.containers = extractedNos.map(no => ({ no, size: defaultSize(form.mode) }))
        applied.containers = true
      }
    }
    // FCL / LCL sets the mode when it isn't chosen yet: the BE's LCL/FCL column, or a BL that says LCL
    if (!form.mode && (parsed.container_load === 'LCL' || parsed.container_size === 'LCL')) { updates.mode = 'Sea LCL'; applied.mode = true }
    else if (!form.mode && parsed.container_load === 'FCL') { updates.mode = 'Sea FCL'; applied.mode = true }
    // the container size the BL shows, for rows that have no size yet (FCL)
    const sz = parsed.container_size
    if (sz && CONTAINER_SIZES.includes(sz) && (updates.mode || form.mode) !== 'Sea LCL') {
      const rows = updates.containers || form.containers
      if (rows.some(r => String(r.no || '').trim() && !r.size)) {
        updates.containers = rows.map(r => (String(r.no || '').trim() && !r.size ? { ...r, size: sz } : r))
        applied.container_size = true
      }
    }
    if (updates.mode === 'Sea LCL') {
      updates.containers = (updates.containers || form.containers).map(r => ({ ...r, size: 'LCL' }))
    }
    if (parsed.shipping_line && shouldFill('carrier')) {
      const matchedLine = fuzzyMatchShippingLine(parsed.shipping_line)
      updates.carrier = matchedLine || '__other__'
      if (!matchedLine) updates.carrierOther = parsed.shipping_line
      applied.shipping_line = true
    }
    if (parsed.vessel && shouldFill('vessel'))         { updates.vessel = parsed.vessel;       applied.vessel = true }
    if (parsed.eta && shouldFill('eta'))               { updates.eta = parsed.eta;             applied.eta = true }
    if (parsed.goods && shouldFill('goods'))           { updates.goods = parsed.goods;         applied.goods = true }
    if (parsed.hs_code && shouldFill('hs_code'))       { updates.hs_code = parsed.hs_code;     applied.hs_code = true }
    if (parsed.be_no && shouldFill('be_no'))           { updates.be_no = parsed.be_no;         applied.be_no = true }
    if (parsed.be_date && shouldFill('be_date'))       { updates.be_date = parsed.be_date;     applied.be_date = true }
    if (parsed.igm_no && shouldFill('igm_no'))         { updates.igm_no = parsed.igm_no;       applied.igm_no = true }
    if (parsed.igm_date && shouldFill('igm_date'))     { updates.igm_date = parsed.igm_date;   applied.igm_date = true }
    if (parsed.igm_item_no && shouldFill('igm_item_no')) { updates.igm_item_no = String(parsed.igm_item_no); applied.igm_item_no = true }
    if (parsed.hawb_no && shouldFill('hawb_no'))       { updates.hawb_no = parsed.hawb_no }
    if (parsed.rms_status && parsed.rms_status !== 'pending' && form.rms_status === 'pending') {
      updates.rms_status = parsed.rms_status; applied.rms_status = true
    }
    if (parsed._source === 'pdf-text') {
      if (parsed.port_code && PORTS.some(pt => pt.code === parsed.port_code)) updates.port_code = parsed.port_code
      if (parsed.mode === 'Air' && form.mode !== 'Air') updates.mode = 'Air'
    }

    return { kind: 'ok', parsed, updates, applied, foundInside: inside, unreadable: result.unreadablePages }
  } catch (err) {
    console.error('Quick extract error:', err.message, err)
    return { kind: 'error' }
  }
}

// Every check made before a job is saved, in the same order, with the same
// messages. → the message to show, or null when the form can be saved.
// (The "logged in" check comes first and needs the user: see createJob.)
export function validateJobForm(form) {
  if (!form.job_no.trim()) return 'Job number is required.'

  const clientValue = form.client === '__other__' ? (form.clientOther?.trim() || '') : form.client.trim()
  if (!clientValue) return 'Client name is required.'

  if (!form.mode) return 'Please select the mode (Sea FCL, Sea LCL, Air or BPT/MBPT).'

  // the ship's own name, not the shipping line's (Jose, 23 Oct 2026: EVERGREEN typed as the ship)
  const lineChosen = form.carrier === '__other__' ? form.carrierOther : form.carrier
  if (form.vessel.trim() && isLineNotShip(form.vessel.split('/')[0], lineChosen)) {
    return `"${form.vessel.trim()}" is a shipping line, not a ship. Type the ship's own name from the BL (for example EVER LENIENT), or leave Vessel empty.`
  }

  const freeDays = String(form.free_days ?? '').trim()
  if (!/^\d{1,3}$/.test(freeDays)) return 'Free days is required (a whole number, e.g. 14).'

  // container number is required for sea jobs (Jose, 22 Oct 2026)
  if (HAS_BOXES(form.mode)) {
    const typed = form.containers.map(c => String(c.no || '').trim().toUpperCase()).filter(Boolean)
    const wrong = typed.filter(no => !BOX_NO.test(no))
    if (!typed.length) {
      return 'Container number is required for a sea job (LCL: the consolidation container). Upload the BL or BE to fill it, or type it.'
    }
    if (wrong.length) {
      return `Container number looks wrong: ${wrong.join(', ')}. It is 4 letters and 7 digits, for example MSCU1234567.`
    }
    // checked before saving, so a job is never saved half-done
    if (!form.carrier) return 'Shipping line is required when containers are given (it is used to track them).'
  }

  // Validate before DB insert
  if (containersStringOf(form) && !form.carrier) return 'Shipping Line is required when containers are specified.'
  return null
}

const containersStringOf = (form) => (HAS_BOXES(form.mode)
  ? form.containers.map(c => c.no).filter(Boolean).join(' ')
  : '')

// The jobs row, exactly as the Create Job form has always saved it
export function buildJobPayload(form, userId) {
  const containersString = containersStringOf(form)
  const containerSizes = HAS_BOXES(form.mode)
    ? form.containers.reduce((acc, c) => {
        if (c.no && c.size) acc[c.no] = c.size
        return acc
      }, {})
    : {}

  return {
    job_no: `J-${form.job_no.trim()}`,
    client: form.client === '__other__' ? (form.clientOther?.trim() || '') : form.client.trim(),
    mode: form.mode,
    job_type: form.job_type,
    port_code: form.port_code || null,
    goods: form.goods.trim() || null,
    priority: form.priority,
    bl_no: form.bl_no.trim() || null,
    containers: containersString || null,
    container_sizes: Object.keys(containerSizes).length > 0 ? containerSizes : null,
    shipping_line: form.carrier === '__other__' ? (form.carrierOther.trim() || null) : (form.carrier || null),
    vessel: form.vessel.trim() || null,
    eta: form.eta || null,
    cfs_name: form.cfs_name.trim() || null,
    cfs_amount: (() => {
      const n = Number(form.cfs_amount)
      return form.cfs_amount !== '' && Number.isFinite(n) ? n : null
    })(),
    be_no: form.be_no.trim() || null,
    be_date: form.be_date || null,
    hs_code: form.hs_code.trim() || null,
    rms_status: form.rms_status,
    ulip_refs: {
      ...(form.igm_no.trim() ? { igm_no: form.igm_no.trim() } : {}),
      ...(form.igm_date ? { igm_date: form.igm_date } : {}),
      ...(form.igm_item_no.trim() ? { igm_item_no: form.igm_item_no.trim() } : {}),
      ...(form.hawb_no.trim() ? { hawb_no: form.hawb_no.trim() } : {}),
    },
    bg_required: form.bg_required,
    destination: form.destination.trim() || null,
    free_days: Number(form.free_days),
    detention_risk: form.detention_risk,
    stage: Number(form.stage),
    delay_reason: form.delay_reason.trim() || null,
    created_by: userId,
  }
}

// Saves a checked form (call validateJobForm first): the job row, its container
// links, the staged documents ([{ file, docType }]) and the 'job_created' log.
// onUploading(true|false) brackets the document uploads (the form's button text).
// → { ok: true, job } | { ok: false, error }
export async function createJob(form, stagedDocs, { user, profile, onUploading } = {}) {
  if (!user?.id) return { ok: false, error: 'You must be logged in to create a job.' }

  const containersString = containersStringOf(form)
  const payload = buildJobPayload(form, user.id)

  const { data: insertedJob, error: insertError } = await supabase
    .from('jobs')
    .insert(payload)
    .select()
    .single()

  if (insertError) {
    if (insertError.code === '23505' || insertError.message?.includes('unique constraint') || insertError.message?.includes('job_no_key')) {
      return { ok: false, error: `Job number "${payload.job_no}" already exists. Please use a different job number.` }
    }
    return { ok: false, error: insertError.message || 'Failed to create job. Please try again.' }
  }

  const jobId = insertedJob.id
  const jobNo = payload.job_no

  // Validate shipping line before uploading documents
  if (containersString) {
    if (!form.carrier) {
      return { ok: false, error: 'Shipping Line is required when containers are specified.' }
    }
    const containerList = containersString.split(/\s+/).filter(Boolean)
    const linkResults = await Promise.allSettled(
      containerList.map((cn) => linkContainer(cn.toUpperCase(), jobId, jobNo, form.carrier))
    )
    linkResults.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.warn(`[CreateJob] linkContainer failed for ${containerList[i]}:`, result.reason)
      }
    })
  }

  if (stagedDocs.length > 0) {
    onUploading?.(true)
    await Promise.allSettled(stagedDocs.map(async (item) => {
      try {
        const sanitized = item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const randomSuffix = Math.random().toString(36).slice(2, 8)
        const filePath = `${jobId}/${Date.now()}_${randomSuffix}_${sanitized}`
        const { error: upErr } = await supabase.storage
          .from('job-documents')
          .upload(filePath, item.file, { cacheControl: '3600', upsert: false })
        if (upErr) throw upErr
        const { data: { publicUrl } } = supabase.storage
          .from('job-documents')
          .getPublicUrl(filePath)
        const { error: insErr } = await supabase.from('documents').insert({
          job_id: jobId,
          job_no: jobNo,
          file_name: item.file.name,
          file_type: item.file.name.split('.').pop(),
          doc_type: item.docType,
          file_url: publicUrl,
          file_path: filePath,
          uploaded_by: user.id,
          uploaded_by_name: profile?.name || '',
          file_size: item.file.size,
          created_at: new Date().toISOString(),
        })
        if (insErr) throw insErr
      } catch (docErr) {
        console.warn('Document upload failed:', docErr)
      }
    }))
    onUploading?.(false)
  }

  try {
    await supabase.from('activity_log').insert({
      type: 'job_created',
      action: 'job_created',
      title: `${payload.job_no} — Job created`,
      note: `${payload.client} · ${payload.mode || ''} · ${containersString ? containersString.split(/\s+/).filter(Boolean).length + ' containers' : 'no containers'}`,
      job_no: payload.job_no,
      job_id: insertedJob.id,
      done_by: user.id,
      done_by_name: profile?.name || 'Unknown',
      meta: { job_id: insertedJob.id, job_no: payload.job_no },
      created_at: new Date().toISOString(),
    })
  } catch (logErr) {
    console.warn('[CreateJob] activity_log insert failed:', logErr.message)
  }

  return { ok: true, job: insertedJob }
}
