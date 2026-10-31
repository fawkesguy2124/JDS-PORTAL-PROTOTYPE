import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { STAGE_NAMES } from '../utils/jobHelpers'
import { linkContainer } from '../api/trackingApi'
import { PORTS } from '../utils/ports'
import { CLIENT_NAMES, matchClient } from '../utils/clients'
import { readPdf, describeDocuments } from '../utils/docReader'
import { boxOwnerHint } from '../../supabase/functions/_shared/portal/shippingLines.js'
import { availableTypes, typesFoundInside, docTypeLabel } from '../utils/docTypes'
import { isLineNotShip } from '../../supabase/functions/_shared/portal/shippingLines.js'
import { Button, Chip, Icon } from '../industrial/ui'
import { startShipTracking } from '../services/shipTracking'
// tokens live on .ix: the employee screen and the full-page route do not load them otherwise
import '../industrial/industrial.css'
import '../industrial/styles/createjob.css'

const MODES = ['Sea FCL', 'Sea LCL', 'Air', 'BPT/MBPT']
// sea jobs carry containers (LCL: the shared consolidation box, which LDB tracks to the CFS)
const HAS_BOXES = (mode) => mode === 'Sea FCL' || mode === 'Sea LCL'
const BOX_NO = /^[A-Z]{4}\d{7}$/
const CONTAINER_SIZES = ['20GP','40GP','40HC','45HC','20RF','40RF','40RFHC','20OT','40OT','20FR','40FR','20TK']
// an LCL job's box is a shared consolidation container: its size is just "LCL"
const sizesFor = (mode) => (mode === 'Sea LCL' ? ['LCL'] : CONTAINER_SIZES)
const defaultSize = (mode) => (mode === 'Sea LCL' ? 'LCL' : '')
const PRIORITIES = ['normal', 'high', 'urgent']
const RMS_STATUSES = ['pending', 'rms', 'apr', 'acl', 'check', 'hold']
const BG_OPTIONS = ['no', 'yes', '100percent']
const SHIPPING_LINES = [
  'Maersk', 'MSC', 'Hapag-Lloyd', 'CMA CGM', 'Evergreen',
  'ONE', 'OOCL', 'COSCO', 'ZIM', 'HMM', 'Yang Ming',
  'Wan Hai', 'TS Line', 'Interasia', 'Emirates', 'RCL', 'Other',
]
const DETENTION_RISKS = ['low', 'medium', 'high']

const CLIENT_LIST = CLIENT_NAMES

const CLIENT_ALIASES = {
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

const normalise = (str) => (str || '')
  .toLowerCase()
  .replace(/\bpvt\b|\bltd\b|\binc\b|\bcorp\b|\bllp\b|\bco\b|\bprivate\b|\blimited\b|\btrading\b|\benterprises\b|\bindustries\b|\bexim\b/g, '')
  .replace(/[^a-z0-9\s]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const fuzzyMatchClient = (extracted, iec) => {
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

const fuzzyMatchShippingLine = (extracted) => {
  if (!extracted) return null
  const normExtracted = normalise(extracted)
  return SHIPPING_LINES.filter(sl => sl !== 'Other').find(sl => {
    const normSl = normalise(sl)
    return normExtracted.includes(normSl) || normSl.includes(normExtracted)
  }) || null
}

const INITIAL_FORM = {
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

// plain names for the "filled from the document" list (keys of autoFillApplied)
const FILLED_LABELS = {
  client: 'Client', bl_no: 'BL number', containers: 'Containers', mode: 'Mode',
  container_size: 'Container size', shipping_line: 'Shipping line', vessel: 'Vessel', eta: 'ETA',
  goods: 'Goods', hs_code: 'HS code', be_no: 'BE number', be_date: 'BE date',
  igm_no: 'IGM number', igm_date: 'IGM date', igm_item_no: 'IGM item', rms_status: 'RMS status',
}
// RMS codes stay in capitals; the plain words get sentence case
const rmsLabel = (s) => (['pending', 'check', 'hold'].includes(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s.toUpperCase())
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n, one, many) => (n === 1 ? one : many)

function FormSection({ title, children }) {
  return (
    <section className="ix-cj-sec">
      <h3 className="ix-cj-sec-t">{title}</h3>
      <div className="ix-cj-grid">{children}</div>
    </section>
  )
}

// label over control; an error replaces the hint so the field never grows twice
function Field({ id, label, required, error, hint, wide, children }) {
  return (
    <div className={`ix-cj-field${wide ? ' wide' : ''}${error ? ' bad' : ''}`}>
      <label className="ix-cj-label" htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {children}
      {error
        ? <p className="ix-cj-err" role="alert"><Icon name="alert-circle" />{error}</p>
        : hint ? <p className="ix-cj-hint">{hint}</p> : null}
    </div>
  )
}

export default function CreateJob({ isModal = false, onCancel, onCreated, initialFilePath = null }) {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [form, setForm] = useState(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // which field the error belongs to ('' = a general error shown in the footer)
  const [errorField, setErrorField] = useState('')
  const [stagedDocs, setStagedDocs] = useState([])
  const [addDocType, setAddDocType] = useState('')
  const [addDocError, setAddDocError] = useState('')
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const [extracting, setExtracting] = useState(false)
  const [showRowWarning, setShowRowWarning] = useState(false)
  const [extractProgress, setExtractProgress] = useState(0)
  const [extractStatus, setExtractStatus] = useState('')
  const [extractedFields, setExtractedFields] = useState(null)
  const [autoFillApplied, setAutoFillApplied] = useState({})
  const quickUploadRef = useRef(null)
  const extractingRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // a field filled from the document gets a navy tint, so staff can check what was read
  const inCls = (fieldKey, extra = '') => `ix-cj-in${autoFillApplied[fieldKey] ? ' filled' : ''}${extra ? ` ${extra}` : ''}`

  const clearError = () => { setError(''); setErrorField('') }
  const errFor = (field) => (errorField === field ? error : '')
  // shows the message under the field and brings that field into view
  const fail = (field, message) => {
    setError(message)
    setErrorField(field || '')
    setSaving(false)
    if (!field) return
    requestAnimationFrame(() => {
      const el = document.getElementById(`cj-${field}`)
      if (!el) return
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  // A type already on this job (chosen, or found inside an uploaded bundle) is not offered again
  const usedTypes = (exceptId) => stagedDocs.filter((d) => d.id !== exceptId).flatMap((d) => [d.docType, ...(d.foundInside || [])])

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const set = (field) => (e) => {
    const value = e.target.value
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'mode') {
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
      }
      return next
    })
    clearError()
  }

  const setJobNumber = (e) => {
    setForm((prev) => ({ ...prev, job_no: e.target.value.replace(/\D/g, '') }))
    clearError()
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
      return
    }
    navigate(profile?.role === 'field_ops' ? '/field' : '/admin')
  }

  const handleQuickExtract = async (file, docType, docId) => {
    if (!file) return
    if (extractingRef.current) return
    extractingRef.current = true
    setExtracting(true)

    setExtractedFields(null)
    setExtractProgress(0)
    setExtractStatus('Reading document...')

    try {
      // Documents are read from the text inside the PDF, on this computer.
      // No AI and nothing is sent anywhere.
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setExtractedFields({ _error: true, _message: 'Only PDF soft copies can be read automatically. Please fill the fields by hand.' })
        return
      }
      const pdfjs = await import('pdfjs-dist')
      const workerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.href
      setExtractProgress(40)
      setExtractStatus('Reading pages...')
      const result = await readPdf(pdfjs, new Uint8Array(await file.arrayBuffer()))
      const inside = typesFoundInside(result.documents)
      setStagedDocs(prev => prev.map(d => d.id === docId ? { ...d, foundInside: inside } : d))
      const f = result.fields
      setExtractProgress(80)
      setExtractStatus('Applying fields...')

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
        setStagedDocs(prev => prev.map(d => d.id === docId ? { ...d, irrelevant: true } : d))
        setExtractedFields({ _irrelevant: true, _unreadable: result.unreadablePages, _found: parsed._found })
        return
      }

      // a document of another shipment must not fill this job: when the job already has
      // containers and this document's are all different, nothing is filled from it
      const haveBoxes = form.containers.map(c => String(c.no || '').trim().toUpperCase()).filter(Boolean)
      const docBoxes = String(parsed.containers || '').split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z]{4}\d{7}$/.test(s))
      if (haveBoxes.length && docBoxes.length && !docBoxes.some(b => haveBoxes.includes(b))) {
        setStagedDocs(prev => prev.map(d => d.id === docId ? { ...d, mismatch: true } : d))
        setExtractedFields({ _mismatch: true, _docBoxes: docBoxes.slice(0, 3), _haveBoxes: haveBoxes.slice(0, 3) })
        return
      }

      setExtractedFields(parsed)

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

      setForm(prev => ({ ...prev, ...updates }))
      setStagedDocs(prev => prev.map(d => d.id === docId ? { ...d, extracted: true } : d))
      setAutoFillApplied(prev => ({ ...prev, ...applied }))
      setExtractProgress(100)
      setExtractStatus('Done!')

    } catch (err) {
      console.error('Quick extract error:', err.message, err)
      setExtractedFields({ _error: true })
      setExtractProgress(0)
      setExtractStatus('')
    } finally {
      setTimeout(() => {
        extractingRef.current = false
        if (mountedRef.current) {
          setExtracting(false)
          setExtractProgress(0)
          setExtractStatus('')
        }
      }, 800)
    }
  }

  // A file sent to the WhatsApp bot ("create a new job from it"): loaded from the
  // private storage and read here, exactly like a file chosen with Upload
  const fileFromBotDone = useRef(false)
  useEffect(() => {
    if (!initialFilePath || fileFromBotDone.current) return
    fileFromBotDone.current = true
    ;(async () => {
      const { data: blob, error } = await supabase.storage.from('job-documents').download(initialFilePath)
      if (error || !blob) { setAddDocError(`Could not open the file sent on WhatsApp: ${error?.message || 'not found'}`); return }
      const name = initialFilePath.split('/').pop().replace(/^\d+_/, '')
      const file = new File([blob], name, { type: blob.type || 'application/pdf' })
      const lower = name.toLowerCase()
      const docType = /out.?of.?charge|ooc/.test(lower) ? 'OOC'
        : /bill.?of.?entry|processed.?be|\bbe\b|be_\d/.test(lower) ? 'BE'
        : /lading|\bh?m?bl\b|bldraft|waybill|awb/.test(lower) ? 'BL'
        : /invoice/.test(lower) ? 'Invoice' : /packing/.test(lower) ? 'Packing List' : 'Other'
      const docId = Date.now()
      setStagedDocs((prev) => [...prev, { file, docType, id: docId, extracted: false, irrelevant: false }])
      await handleQuickExtract(file, docType, docId)
    })()
  }, [initialFilePath]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    setSaving(true)

    if (!user?.id) return fail('', 'You must be logged in to create a job.')

    if (!form.job_no.trim()) return fail('job_no', 'Job number is required.')

    const clientValue = form.client === '__other__' ? (form.clientOther?.trim() || '') : form.client.trim()
    if (!clientValue) return fail('client', 'Client name is required.')

    if (!form.mode) return fail('mode', 'Select the mode (Sea FCL, Sea LCL, Air or BPT/MBPT).')

    // the ship's own name, not the shipping line's (Jose, 23 Oct 2026: EVERGREEN typed as the ship)
    const lineChosen = form.carrier === '__other__' ? form.carrierOther : form.carrier
    if (form.vessel.trim() && isLineNotShip(form.vessel.split('/')[0], lineChosen)) {
      return fail('vessel', `"${form.vessel.trim()}" is a shipping line, not a ship. Type the ship's own name from the BL (for example EVER LENIENT), or leave Vessel empty.`)
    }

    // the form is noValidate (so messages show inline), so the browser's number check is done here
    if (form.cfs_amount !== '' && !(Number(form.cfs_amount) >= 0)) return fail('cfs_amount', 'CFS amount must be a number, 0 or more.')

    const freeDays = String(form.free_days ?? '').trim()
    if (!/^\d{1,3}$/.test(freeDays)) return fail('free_days', 'Free days is required (a whole number, e.g. 14).')

    // container number is required for sea jobs (Jose, 22 Oct 2026)
    if (HAS_BOXES(form.mode)) {
      const typed = form.containers.map(c => String(c.no || '').trim().toUpperCase()).filter(Boolean)
      const wrong = typed.filter(no => !BOX_NO.test(no))
      if (!typed.length) {
        return fail('containers', 'Container number is required for a sea job (LCL: the consolidation container). Upload the BL or BE to fill it, or type it.')
      }
      if (wrong.length) {
        return fail('containers', `Container number looks wrong: ${wrong.join(', ')}. It is 4 letters and 7 digits, for example MSCU1234567.`)
      }
      // checked before saving, so a job is never saved half-done
      if (!form.carrier) return fail('carrier', 'Shipping line is required when containers are given (it is used to track them).')
    }
    // the carrier was always a required select (the browser checked it before); now checked here
    if (!form.carrier) return fail('carrier', 'Choose the carrier or shipping line.')
    if (form.carrier === '__other__' && !form.carrierOther.trim()) return fail('carrier', 'Type the shipping line name, or go back to the list.')

    const containersString = HAS_BOXES(form.mode)
      ? form.containers.map(c => c.no).filter(Boolean).join(' ')
      : ''
    const containerSizes = HAS_BOXES(form.mode)
      ? form.containers.reduce((acc, c) => {
          if (c.no && c.size) acc[c.no] = c.size
          return acc
        }, {})
      : {}

    const payload = {
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
      created_by: user.id,
    }

    // Validate before DB insert
    if (containersString && !form.carrier) return fail('carrier', 'Shipping line is required when containers are given.')

    const { data: insertedJob, error: insertError } = await supabase
      .from('jobs')
      .insert(payload)
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505' || insertError.message?.includes('unique constraint') || insertError.message?.includes('job_no_key')) {
        return fail('job_no', `Job number "${payload.job_no}" already exists. Please use a different job number.`)
      }
      return fail('', insertError.message || 'Failed to create job. Please try again.')
    }

    const jobId = insertedJob.id
    const jobNo = payload.job_no

    // Validate shipping line before uploading documents
    if (containersString) {
      if (!form.carrier) return fail('carrier', 'Shipping line is required when containers are given.')
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
      setUploadingDocs(true)
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
      setUploadingDocs(false)
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
    // ship tracking starts now, not at the next hourly run (runs on in the background)
    startShipTracking(insertedJob)
    setSaving(false)

    if (onCreated) {
      onCreated()
      return
    }
    navigate(profile?.role === 'field_ops' ? '/field' : '/admin')
  }

  const lastRow = form.containers[form.containers.length - 1]
  const canAddRow = !lastRow || (lastRow.no.trim().length >= 4 && (form.mode !== 'Sea FCL' || lastRow.size !== ''))
  // the warning disappears by itself once the last row is complete (no effect needed)
  const rowWarning = showRowWarning && !canAddRow
  const handleAddRow = () => {
    if (!canAddRow) { setShowRowWarning(true); return }
    setShowRowWarning(false)
    setForm(p => ({ ...p, containers: [...p.containers, { no: '', size: defaultSize(p.mode) }] }))
  }
  const setBox = (i, patch) => {
    setForm(p => {
      const next = [...p.containers]
      next[i] = { ...next[i], ...patch }
      return { ...p, containers: next }
    })
    if (errorField === 'containers') clearError()
  }

  // one path for the "Choose file" button and a file dropped on the panel
  const takeQuickFile = async (file, input) => {
    const reset = () => { if (input) input.value = '' }
    if (!file) return reset()
    if (extractingRef.current) { setAddDocError('Wait for the current document to finish reading.'); return reset() }
    if (!addDocType) { setAddDocError('Please select a document type first.'); return reset() }
    if (file.size > 10 * 1024 * 1024) { setAddDocError('File must be under 10MB.'); return reset() }
    setAddDocError('')

    const docType = addDocType
    const docId = Date.now()
    setStagedDocs(prev => [...prev, { file, docType, id: docId, extracted: false, irrelevant: false }])

    // Every PDF is read: the reader works out which documents are inside
    await handleQuickExtract(file, docType, docId)

    setAddDocType('')
    reset()
  }
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files')
  const onDragOver = (e) => { if (!hasFiles(e)) return; e.preventDefault(); setDragOver(true) }
  const onDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }
  const onDrop = (e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    setDragOver(false)
    takeQuickFile(e.dataTransfer.files?.[0])
  }

  const busy = saving || uploadingDocs
  const filledKeys = Object.entries(autoFillApplied).filter(([, v]) => v).map(([k]) => k)
  const unreadable = extractedFields?._unreadable || []
  const picturePages = (pages) => `Page${pages.length === 1 ? '' : 's'} ${pages.join(', ')} ${pages.length === 1 ? 'is a picture' : 'are pictures'} with no text`
  const ownerHint = form.mode === 'Sea FCL' ? boxOwnerHint(form.containers) : null
  const foundBoxes = form.containers.filter(c => String(c.no || '').trim()).length

  return (
    <div className={`ix ix-cj-root ${isModal ? 'modal' : 'page'}`}>
      <div className="ix-cj" role={isModal ? 'dialog' : undefined} aria-modal={isModal || undefined} aria-labelledby="cj-title">
        <header className="ix-cj-head">
          <div className="ix-cj-title">
            <h2 id="cj-title">Create job</h2>
            <p>Upload the BL or BE to fill most fields · <span className="req">*</span> required</p>
          </div>
          {isModal && (
            <button type="button" className="ix-icon-btn" onClick={handleCancel} disabled={busy} aria-label="Close create job">
              <Icon name="x" />
            </button>
          )}
        </header>

        {/* noValidate: every check runs in handleSubmit, so its message shows under the field */}
        <form className="ix-cj-form" onSubmit={handleSubmit} noValidate>
          <div className="ix-cj-body">

            {/* Fill from a document: a quiet dropzone; the type is picked first, as before */}
            <div className={`ix-cj-drop${dragOver ? ' over' : ''}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
              <div className="ix-cj-drop-head">
                <Icon name="file-upload" />
                <div className="txt">
                  <b>Fill from a document</b>
                  <span>Pick the document type, then choose or drop the file. PDFs are read on this computer and only empty fields are filled.</span>
                </div>
              </div>

              {stagedDocs.length > 0 && (
                <ul className="ix-cj-docs">
                  {stagedDocs.map((item) => {
                    const isPdf = item.file.name.toLowerCase().endsWith('.pdf')
                    return (
                      <li key={item.id} className="ix-cj-doc">
                        <Icon name={isPdf ? 'file-type-pdf' : 'photo'} className="ic" />
                        <div className="nm">
                          <span className="fn" title={item.file.name}>{item.file.name}</span>
                          <span className="sz">
                            {formatFileSize(item.file.size)}
                            {item.foundInside?.length > 1 && <span title="Documents found inside this file"> · has {item.foundInside.join(', ')}</span>}
                          </span>
                        </div>
                        <select
                          aria-label={`Document type of ${item.file.name}`}
                          value={item.docType}
                          onChange={e => setStagedDocs(prev => prev.map(d => d.id === item.id ? { ...d, docType: e.target.value } : d))}
                          className="ix-cj-in sm"
                        >
                          {availableTypes(usedTypes(item.id), item.docType).map(t => <option key={t} value={t}>{docTypeLabel(t)}</option>)}
                        </select>
                        {item.extracted && <Chip tone="blue" icon="check">Read</Chip>}
                        {item.irrelevant && <Chip tone="amber" icon="alert-triangle">Not a shipping document</Chip>}
                        {item.mismatch && <Chip tone="amber" icon="alert-triangle">Other shipment</Chip>}
                        <button
                          type="button"
                          className="ix-icon-btn sm"
                          onClick={() => setStagedDocs(prev => prev.filter(d => d.id !== item.id))}
                          aria-label={`Remove ${item.file.name}`}
                          title="Remove"
                        ><Icon name="x" /></button>
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="ix-cj-drop-row">
                <select
                  aria-label="Document type"
                  value={addDocType}
                  onChange={e => { setAddDocType(e.target.value); setAddDocError('') }}
                  className="ix-cj-in"
                >
                  <option value="">Document type…</option>
                  {availableTypes(usedTypes()).map(t => <option key={t} value={t}>{docTypeLabel(t)}</option>)}
                </select>
                <input
                  ref={quickUploadRef}
                  id="doc-file-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  hidden
                  onChange={e => takeQuickFile(e.target.files?.[0], e.target)}
                />
                <Button
                  icon={extracting ? undefined : 'upload'}
                  disabled={extracting}
                  onClick={() => {
                    if (!addDocType) { setAddDocError('Please select a document type first.'); return }
                    quickUploadRef.current?.click()
                  }}
                >
                  {extracting ? <><Icon name="loader-2" className="ix-cj-spin" />{extractStatus || 'Reading…'}</> : 'Choose file'}
                </Button>
              </div>
              {addDocError && <p className="ix-cj-err top" role="alert"><Icon name="alert-circle" />{addDocError}</p>}

              {extracting && (
                <div className="ix-cj-prog" aria-live="polite">
                  <div className="row"><span>{extractStatus}</span><b>{extractProgress}%</b></div>
                  <div className="bar"><i style={{ width: `${extractProgress}%` }} /></div>
                </div>
              )}

              {extractedFields?._error && (
                <p className="ix-cj-msg red"><Icon name="alert-triangle" />{extractedFields._message || 'Could not read this document. Please fill the fields by hand.'}</p>
              )}
              {extractedFields?._mismatch && (
                <p className="ix-cj-msg amber">
                  <Icon name="alert-triangle" />
                  <span>
                    This document looks like a different shipment: its containers (<span className="mono">{extractedFields._docBoxes.join(', ')}</span>) are
                    not this job&apos;s (<span className="mono">{extractedFields._haveBoxes.join(', ')}</span>). Nothing was filled from it. Please check it is the right document.
                  </span>
                </p>
              )}
              {extractedFields?._irrelevant && (
                <p className="ix-cj-msg amber">
                  <Icon name="alert-triangle" />
                  <span>
                    Nothing to fill was found in this document.
                    {unreadable.length ? ` ${picturePages(unreadable)}: please type those details by hand.` : ''}
                  </span>
                </p>
              )}

              {filledKeys.length > 0 && (
                <div className="ix-cj-applied">
                  <p className="t">
                    <Icon name="check" />
                    Filled {filledKeys.length} {plural(filledKeys.length, 'field', 'fields')} from the documents
                    {extractedFields?._source === 'pdf-text' && <span className="muted">· read from the PDF on this computer, no AI used</span>}
                  </p>
                  {extractedFields?._found && <p className="sub">Found: {extractedFields._found}</p>}
                  {!extractedFields?._irrelevant && unreadable.length > 0 && (
                    <p className="sub amber">{picturePages(unreadable)}, so nothing was read from {unreadable.length === 1 ? 'it' : 'them'}.</p>
                  )}
                  <div className="keys">
                    {filledKeys.map(k => <Chip key={k} tone="blue">{FILLED_LABELS[k] || cap(k.replace(/_/g, ' '))}</Chip>)}
                  </div>
                </div>
              )}
            </div>

            <FormSection title="Job">
              <Field id="cj-job_no" label="Job number" required error={errFor('job_no')}>
                {/* saved as J- plus the number, so the prefix is shown, not typed */}
                <div className="ix-cj-affix">
                  <span aria-hidden="true">J-</span>
                  <input
                    id="cj-job_no"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    value={form.job_no}
                    onChange={setJobNumber}
                    placeholder="123"
                  />
                </div>
              </Field>

              <Field id="cj-client" label="Client" required error={errFor('client')}>
                {form.client === '__other__' ? (
                  <div className="ix-cj-pair">
                    <input
                      id="cj-client"
                      type="text"
                      value={form.clientOther || ''}
                      onChange={(e) => { setForm(p => ({ ...p, clientOther: e.target.value })); clearError() }}
                      className={inCls('client')}
                      placeholder="Client name"
                    />
                    <Button icon="list" title="Pick from the client list" onClick={() => setForm(p => ({ ...p, client: '', clientOther: '' }))}>List</Button>
                  </div>
                ) : (
                  <select
                    id="cj-client"
                    value={form.client}
                    onChange={(e) => { const v = e.target.value; setForm(p => ({ ...p, client: v === '__other__' ? '__other__' : v, clientOther: v === '__other__' ? '' : p.clientOther })); clearError() }}
                    className={inCls('client')}
                  >
                    <option value="">Select client</option>
                    {CLIENT_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__other__">Other…</option>
                  </select>
                )}
              </Field>

              <Field id="cj-mode" label="Mode" required error={errFor('mode')}>
                <select id="cj-mode" value={form.mode} onChange={set('mode')} className={inCls('mode')}>
                  <option value="" disabled>Select mode</option>
                  {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>

              <Field id="cj-job_type" label="Import / export">
                <select id="cj-job_type" value={form.job_type} onChange={set('job_type')} className="ix-cj-in">
                  <option value="import">Import</option>
                  <option value="export">Export</option>
                </select>
              </Field>

              <Field id="cj-port_code" label="Port">
                <select id="cj-port_code" value={form.port_code} onChange={set('port_code')} className="ix-cj-in">
                  {PORTS.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
                </select>
              </Field>

              <Field id="cj-priority" label="Priority">
                <select id="cj-priority" value={form.priority} onChange={set('priority')} className="ix-cj-in">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}
                </select>
              </Field>

              <Field id="cj-goods" label="Goods description" wide>
                <input id="cj-goods" type="text" value={form.goods} onChange={set('goods')} className={inCls('goods')} />
              </Field>
            </FormSection>

            <FormSection title="Shipment">
              <Field id="cj-bl_no" label={form.mode === 'Air' ? 'AWB number' : 'BL number'}>
                <input id="cj-bl_no" type="text" value={form.bl_no} onChange={set('bl_no')} className={inCls('bl_no', 'mono')} />
              </Field>

              <Field
                id="cj-carrier"
                label="Carrier / shipping line"
                required
                error={errFor('carrier')}
                hint={ownerHint && `Hint: the boxes belong to ${ownerHint}. That is who owns them, not always the line on the BL, so check the BL.`}
              >
                {form.carrier === '__other__' ? (
                  <div className="ix-cj-pair">
                    <input
                      id="cj-carrier"
                      type="text"
                      value={form.carrierOther || ''}
                      onChange={e => {
                        setForm(p => ({ ...p, carrierOther: e.target.value }))
                        clearError()
                      }}
                      className={inCls('shipping_line')}
                      placeholder="Shipping line name"
                      autoFocus
                    />
                    <Button icon="list" title="Pick from the list" onClick={() => setForm(p => ({ ...p, carrier: '', carrierOther: '' }))}>List</Button>
                  </div>
                ) : (
                  <select
                    id="cj-carrier"
                    value={form.carrier}
                    onChange={e => {
                      const v = e.target.value
                      setForm(p => ({
                        ...p,
                        carrier: v === '__other__' ? '__other__' : v,
                        carrierOther: v === '__other__' ? '' : p.carrierOther,
                      }))
                      clearError()
                    }}
                    className={inCls('shipping_line')}
                  >
                    <option value="">Select shipping line</option>
                    {SHIPPING_LINES.filter(s => s !== 'Other').map(s => <option key={s} value={s}>{s}</option>)}
                    <option value="__other__">Other…</option>
                  </select>
                )}
              </Field>

              {form.mode === 'Air' && (
                <Field id="cj-hawb_no" label="House AWB (HAWB)" hint="From the BE; used for the air cargo checks">
                  <input id="cj-hawb_no" type="text" value={form.hawb_no} onChange={set('hawb_no')} className="ix-cj-in mono" />
                </Field>
              )}

              {/* Containers: rows for sea jobs (required), a short note for the others */}
              {HAS_BOXES(form.mode) ? (
                <Field
                  id="cj-containers"
                  wide
                  required
                  error={errFor('containers')}
                  label={<>Containers{form.mode === 'Sea LCL' && <span className="lbl-note"> · the consolidation container</span>}</>}
                  hint="Each container can have its own size, as on the BL"
                >
                  <div className="ix-cj-boxes">
                    <div className="ix-cj-box head" aria-hidden="true"><span>Container no</span><span>Size</span><span /></div>
                    {form.containers.map((row, i) => (
                      <div key={i} className="ix-cj-box">
                        <input
                          id={i === 0 ? 'cj-containers' : undefined}
                          aria-label={`Container ${i + 1} number`}
                          type="text"
                          value={row.no}
                          onChange={e => setBox(i, { no: e.target.value.toUpperCase() })}
                          placeholder="MSCU1234567"
                          className={inCls('containers', 'mono')}
                        />
                        <select
                          aria-label={`Container ${i + 1} size`}
                          value={row.size}
                          onChange={e => setBox(i, { size: e.target.value })}
                          className={inCls('container_size')}
                        >
                          <option value="">Size</option>
                          {sizesFor(form.mode).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button
                          type="button"
                          className="ix-icon-btn sm"
                          disabled={form.containers.length <= 1}
                          onClick={() => setForm(p => ({ ...p, containers: p.containers.filter((_, idx) => idx !== i) }))}
                          aria-label={`Remove container ${i + 1}`}
                          title="Remove container"
                        ><Icon name="x" /></button>
                      </div>
                    ))}
                    <div className="ix-cj-box-foot">
                      <button type="button" className="ix-link" onClick={handleAddRow}><Icon name="plus" />Add container</button>
                      {rowWarning && <span className="ix-cj-err">Complete the container number and size above first.</span>}
                    </div>
                  </div>
                </Field>
              ) : (
                <Field label="Containers" wide>
                  <p className="ix-cj-note">
                    {form.mode === 'Air' ? 'Not used for air jobs. Put the AWB number in the AWB number field.'
                      : form.mode === 'BPT/MBPT' ? 'Not used for BPT/MBPT jobs.'
                        : foundBoxes ? `${foundBoxes} ${plural(foundBoxes, 'container', 'containers')} found in the document. Select the mode above to see them.`
                          : 'Select the mode above first.'}
                  </p>
                </Field>
              )}

              <Field id="cj-vessel" label="Vessel / flight" error={errFor('vessel')}>
                <input id="cj-vessel" type="text" value={form.vessel} onChange={set('vessel')} className={inCls('vessel')} />
              </Field>

              <Field id="cj-eta" label="ETA">
                <input id="cj-eta" type="date" value={form.eta} onChange={set('eta')} className={inCls('eta')} />
              </Field>

              <Field id="cj-cfs_name" label="CFS name">
                <input id="cj-cfs_name" type="text" value={form.cfs_name} onChange={set('cfs_name')} className="ix-cj-in" />
              </Field>

              <Field id="cj-cfs_amount" label="CFS amount (₹)" error={errFor('cfs_amount')}>
                <input id="cj-cfs_amount" type="number" min="0" step="0.01" inputMode="decimal" value={form.cfs_amount} onChange={set('cfs_amount')} className="ix-cj-in num" />
              </Field>
            </FormSection>

            <FormSection title="Customs">
              <Field id="cj-be_no" label="BE number">
                <input id="cj-be_no" type="text" value={form.be_no} onChange={set('be_no')} className={inCls('be_no', 'mono')} />
              </Field>

              <Field id="cj-be_date" label="BE date">
                <input id="cj-be_date" type="date" value={form.be_date} onChange={set('be_date')} className={inCls('be_date')} />
              </Field>

              <Field id="cj-hs_code" label="HS code">
                <input id="cj-hs_code" type="text" value={form.hs_code} onChange={set('hs_code')} className={inCls('hs_code', 'mono')} />
              </Field>

              <Field id="cj-igm_no" label="IGM number">
                <input id="cj-igm_no" type="text" value={form.igm_no} onChange={set('igm_no')} placeholder="From the BE" className={inCls('igm_no', 'mono')} />
              </Field>

              <Field id="cj-igm_date" label="IGM date">
                <input id="cj-igm_date" type="date" value={form.igm_date} onChange={set('igm_date')} className={inCls('igm_date')} />
              </Field>

              <Field id="cj-igm_item_no" label="IGM item (line) no" hint="Optional: finds this client's line in the IGM">
                <input
                  id="cj-igm_item_no"
                  type="text"
                  inputMode="numeric"
                  value={form.igm_item_no}
                  onChange={(e) => setForm((f) => ({ ...f, igm_item_no: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  className={inCls('igm_item_no', 'mono')}
                />
              </Field>

              <Field id="cj-rms_status" label="RMS status" hint={extractedFields?.rms_label && `From the BE: ${extractedFields.rms_label}`}>
                <select id="cj-rms_status" value={form.rms_status} onChange={set('rms_status')} className={inCls('rms_status')}>
                  {RMS_STATUSES.map((s) => <option key={s} value={s}>{rmsLabel(s)}</option>)}
                </select>
              </Field>

              <Field id="cj-bg_required" label="BG required">
                <select id="cj-bg_required" value={form.bg_required} onChange={set('bg_required')} className="ix-cj-in">
                  {BG_OPTIONS.map((b) => <option key={b} value={b}>{b === '100percent' ? '100%' : cap(b)}</option>)}
                </select>
              </Field>
            </FormSection>

            <FormSection title="Delivery">
              <Field id="cj-destination" label="Destination">
                <input id="cj-destination" type="text" value={form.destination} onChange={set('destination')} className="ix-cj-in" />
              </Field>

              <Field id="cj-free_days" label="Free days" required error={errFor('free_days')}>
                <input
                  id="cj-free_days"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.free_days}
                  onChange={set('free_days')}
                  className="ix-cj-in num"
                />
              </Field>

              <Field id="cj-detention_risk" label="Detention risk">
                <select id="cj-detention_risk" value={form.detention_risk} onChange={set('detention_risk')} className="ix-cj-in">
                  {DETENTION_RISKS.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
                </select>
              </Field>

              <Field id="cj-stage" label="Current stage">
                <select id="cj-stage" value={form.stage} onChange={set('stage')} className="ix-cj-in">
                  {Object.entries(STAGE_NAMES).map(([value, name]) => <option key={value} value={value}>{value} — {name}</option>)}
                </select>
              </Field>

              <Field id="cj-delay_reason" label="Delay reason" wide>
                <input id="cj-delay_reason" type="text" value={form.delay_reason} onChange={set('delay_reason')} className="ix-cj-in" />
              </Field>
            </FormSection>
          </div>

          {/* sticky footer: outside the scrolling body, so Create job is always in reach */}
          <footer className="ix-cj-foot">
            {error && !errorField && <p className="ix-cj-foot-err" role="alert"><Icon name="alert-circle" />{error}</p>}
            <div className="ix-cj-actions">
              <Button onClick={handleCancel} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy && <Icon name="loader-2" className="ix-cj-spin" />}
                {uploadingDocs ? 'Uploading documents…' : saving ? 'Saving…' : 'Create job'}
              </Button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}
