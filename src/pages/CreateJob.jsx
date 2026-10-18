import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { STAGE_NAMES } from '../utils/jobHelpers'
import { linkContainer } from '../api/trackingApi'
import { PORTS } from '../utils/ports'
import { CLIENT_NAMES, matchClient } from '../utils/clients'
import { readPdf, describeDocuments } from '../utils/docReader'
import { availableTypes, typesFoundInside } from '../utils/docTypes'

const MODES = ['Sea FCL', 'Sea LCL', 'Air', 'BPT/MBPT']
const CONTAINER_SIZES = ['20GP','40GP','40HC','45HC','20RF','40RF','40RFHC','20OT','40OT','20FR','40FR','20TK']
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
  mode: 'Sea FCL',
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
  bg_required: 'no',
  destination: '',
  free_days: '',
  detention_risk: 'low',
  stage: '0',
  delay_reason: '',
}

const inputClass =
  'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent'
const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

function SectionHeading({ children }) {
  return (
    <div className="col-span-full border-b border-gray-200 pb-2 mb-2 mt-4 first:mt-0">
      <h2 className="text-lg font-semibold text-gray-800">{children}</h2>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className={labelClass}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function CreateJob({ isModal = false, onCancel, onCreated }) {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [form, setForm] = useState(INITIAL_FORM)
  const [profiles, setProfiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [stagedDocs, setStagedDocs] = useState([])
  const [addDocType, setAddDocType] = useState('')
  const [addDocFile, setAddDocFile] = useState(null)
  const [addDocError, setAddDocError] = useState('')
  const [uploadingDocs, setUploadingDocs] = useState(false)

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

  const fieldClass = (fieldKey) =>
    `w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent ${
      autoFillApplied[fieldKey] ? 'border-green-400 bg-green-50' : 'border-gray-300'
    }`

  // A type already on this job (chosen, or found inside an uploaded bundle) is not offered again
  const usedTypes = (exceptId) => stagedDocs.filter((d) => d.id !== exceptId).flatMap((d) => [d.docType, ...(d.foundInside || [])])

  const DOC_TYPE_COLORS = {
    BL: 'bg-blue-100 text-blue-800',
    Invoice: 'bg-green-100 text-green-800',
    'Packing List': 'bg-teal-100 text-teal-800',
    COO: 'bg-purple-100 text-purple-800',
    Insurance: 'bg-amber-100 text-amber-800',
    BE: 'bg-red-100 text-red-800',
    'Examination Order': 'bg-orange-100 text-orange-800',
    OOC: 'bg-emerald-100 text-emerald-800',
    'E-Way Bill': 'bg-indigo-100 text-indigo-800',
    POD: 'bg-gray-100 text-gray-800',
    Other: 'bg-slate-100 text-slate-800',
  }

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  useEffect(() => {
    async function loadProfiles() {
      const { data } = await supabase.from('profiles').select('id, name').order('name')
      setProfiles(data ?? [])
    }
    loadProfiles()
  }, [])

  const set = (field) => (e) => {
    const value = e.target.value
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'mode') {
        if (value === 'Air' && (prev.port_code === 'INNSA1' || prev.port_code === 'INBOM1')) next.port_code = 'INBOM4'
        if (value !== 'Air' && prev.port_code === 'INBOM4') next.port_code = 'INNSA1'
        if (value === 'BPT/MBPT' && (prev.port_code === 'INNSA1' || prev.port_code === 'INBOM4')) next.port_code = 'INBOM1'
        if (value !== 'BPT/MBPT' && value !== 'Air' && prev.mode === 'BPT/MBPT' && prev.port_code === 'INBOM1') next.port_code = 'INNSA1'
        if (value === 'Sea FCL') {
          next.containers = prev.containers.length === 0 ? [{ no: '', size: '' }] : prev.containers
        } else {
          next.containers = []
        }
      }
      return next
    })
    setError('')
  }

  const setJobNumber = (e) => {
    setForm((prev) => ({ ...prev, job_no: e.target.value.replace(/\D/g, '') }))
    setError('')
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
      return
    }
    navigate(profile?.role === 'field_ops' ? '/field' : '/admin')
  }

  const handleAddDocFile = (e) => {
    const file = e.target.files?.[0]
    setAddDocError('')
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setAddDocError('File size must be under 10MB.')
      e.target.value = ''
      return
    }
    setAddDocFile(file)
  }

  const handleAddDoc = () => {
    setAddDocError('')
    if (!addDocType) { setAddDocError('Select a document type.'); return }
    if (!addDocFile) { setAddDocError('Select a file.'); return }
    setStagedDocs((prev) => [...prev, { file: addDocFile, docType: addDocType, id: Date.now() }])
    setAddDocType('')
    setAddDocFile(null)
    const fileInput = document.getElementById('doc-file-input')
    if (fileInput) fileInput.value = ''
  }

  const handleQuickExtract = async (file, docType, docId) => {
    if (!file) return
    if (extractingRef.current) return
    extractingRef.current = true
    setExtracting(true)

    setExtractedFields(null)
    setAutoFillApplied({})
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
        if (form.mode === 'Sea FCL' && extractedNos.length > 0 && form.containers.length === 0) {
          updates.containers = extractedNos.map(no => ({ no, size: '' }))
          applied.containers = true
        }
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
      if (parsed.rms_status && parsed.rms_status !== 'pending' && form.rms_status === 'pending') {
        updates.rms_status = parsed.rms_status; applied.rms_status = true
      }
      if (parsed._source === 'pdf-text') {
        if (parsed.port_code && PORTS.some(pt => pt.code === parsed.port_code)) updates.port_code = parsed.port_code
        if (parsed.mode === 'Air' && form.mode !== 'Air') updates.mode = 'Air'
      }

      setForm(prev => ({ ...prev, ...updates }))
      setStagedDocs(prev => prev.map(d => d.id === docId ? { ...d, extracted: true } : d))
      setAutoFillApplied(applied)
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    if (!user?.id) {
      setError('You must be logged in to create a job.')
      setSaving(false)
      return
    }

    if (!form.job_no.trim()) {
      setError('Job number is required.')
      setSaving(false)
      return
    }

    const clientValue = form.client === '__other__' ? (form.clientOther?.trim() || '') : form.client.trim()
    if (!clientValue) {
      setError('Client name is required.')
      setSaving(false)
      return
    }

    const containersString = form.mode === 'Sea FCL'
      ? form.containers.map(c => c.no).filter(Boolean).join(' ')
      : ''
    const containerSizes = form.mode === 'Sea FCL'
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
      },
      bg_required: form.bg_required,
      destination: form.destination.trim() || null,
      free_days: (() => {
        const n = Number(form.free_days)
        return Number.isFinite(n) && n > 0 ? n : null
      })(),
      detention_risk: form.detention_risk,
      stage: Number(form.stage),
      delay_reason: form.delay_reason.trim() || null,
      created_by: user.id,
    }

    // Validate before DB insert
    if (containersString && !form.carrier) {
      setError('Shipping Line is required when containers are specified.')
      setSaving(false)
      return
    }

    const { data: insertedJob, error: insertError } = await supabase
      .from('jobs')
      .insert(payload)
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505' || insertError.message?.includes('unique constraint') || insertError.message?.includes('job_no_key')) {
        setError(`Job number "${payload.job_no}" already exists. Please use a different job number.`)
      } else {
        setError(insertError.message || 'Failed to create job. Please try again.')
      }
      setSaving(false)
      return
    }

    const jobId = insertedJob.id
    const jobNo = payload.job_no

    // Validate shipping line before uploading documents
    if (containersString) {
      if (!form.carrier) {
        setError('Shipping Line is required when containers are specified.')
        setSaving(false)
        return
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
    setSaving(false)

    if (onCreated) {
      onCreated()
      return
    }
    navigate(profile?.role === 'field_ops' ? '/field' : '/admin')
  }

  const lastRow = form.containers[form.containers.length - 1]
  const canAddRow = !lastRow || (lastRow.no.trim().length >= 4 && lastRow.size !== '')
  useEffect(() => { if (canAddRow) setShowRowWarning(false) }, [canAddRow])
  const handleAddRow = () => {
    if (!canAddRow) { setShowRowWarning(true); return }
    setShowRowWarning(false)
    setForm(p => ({ ...p, containers: [...p.containers, { no: '', size: '' }] }))
  }

  return (
    <div className={isModal ? 'bg-white flex flex-col max-h-[88vh]' : 'min-h-screen bg-gray-100 flex flex-col'}>
      <header className={isModal ? 'bg-white text-slate-900 px-5 py-4 border-b border-slate-200 flex items-center justify-between' : 'bg-[#1e3a5f] text-white px-6 py-4 shadow-md flex items-center justify-between'}>
        <div>
          <h1 className="text-xl font-semibold">Create Job</h1>
          <p className={isModal ? 'text-sm text-slate-500 mt-0.5' : 'text-sm text-blue-200 mt-0.5'}>JDS Logistics - Admin</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={isModal ? 'text-sm text-slate-500' : 'text-sm text-blue-100'}>{profile?.name}</span>
          {isModal && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-70"
              aria-label="Close create job"
            >
              x
            </button>
          )}
        </div>
      </header>

      <main className={isModal ? 'flex-1 p-5 overflow-y-auto' : 'flex-1 p-6 overflow-auto'}>
        <div className={isModal ? 'bg-white' : 'max-w-5xl mx-auto bg-white rounded-lg shadow-lg p-6 md:p-8'}>
          <form onSubmit={handleSubmit}>
            {/* Smart Document Upload */}
            <div className="mb-6 border-2 border-dashed border-[#1e3a5f] border-opacity-30 rounded-xl p-5 bg-blue-50">
              <p className="text-sm font-semibold text-[#1e3a5f] mb-1">
                ✦ Upload documents to auto-fill fields
              </p>
              <p className="text-xs text-gray-500 mb-4">
                Select document type then upload — fields will be extracted automatically. You can upload multiple documents.
              </p>

              {/* Staged documents list */}
              {stagedDocs.length > 0 && (
                <div className="space-y-2 mb-4">
                  {stagedDocs.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-gray-200">
                      <span className={`text-xs font-bold ${item.file.name.toLowerCase().endsWith('.pdf') ? 'text-red-500' : 'text-green-500'}`}>
                        {item.file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMG'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{item.file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(item.file.size)}</p>
                      </div>
                      <select
                        value={item.docType}
                        onChange={e => setStagedDocs(prev => prev.map(d => d.id === item.id ? { ...d, docType: e.target.value } : d))}
                        className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white"
                      >
                        {availableTypes(usedTypes(item.id), item.docType).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {item.foundInside?.length > 1 && (
                        <span className="text-xs text-gray-500 hidden sm:inline" title="Documents found inside this file">has {item.foundInside.join(', ')}</span>
                      )}
                      {item.extracted && (
                        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                          Extracted
                        </span>
                      )}
                      {item.irrelevant && (
                        <span className="text-xs text-amber-600 font-medium">⚠ Not a shipping doc</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setStagedDocs(prev => prev.filter(d => d.id !== item.id))}
                        className="text-gray-400 hover:text-red-600 text-lg leading-none"
                      >&times;</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload row — doc type + file picker */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-44">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Document type</label>
                  <select
                    value={addDocType}
                    onChange={e => setAddDocType(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select type...</option>
                    {availableTypes(usedTypes()).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">File</label>
                  <input
                    ref={quickUploadRef}
                    id="doc-file-input"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    style={{ display:'none' }}
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (!addDocType) { setAddDocError('Please select a document type first.'); return }
                      if (file.size > 10 * 1024 * 1024) { setAddDocError('File must be under 10MB.'); return }
                      setAddDocError('')

                      const docId = Date.now()
                      setStagedDocs(prev => [...prev, { file, docType: addDocType, id: docId, extracted: false, irrelevant: false }])

                      // Every PDF is read: the reader works out which documents are inside
                      await handleQuickExtract(file, addDocType, docId)

                      setAddDocType('')
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    disabled={!addDocType || extracting}
                    onClick={() => {
                      if (!addDocType) { setAddDocError('Please select a document type first.'); return }
                      quickUploadRef.current?.click()
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-[#1e3a5f] rounded-lg hover:bg-[#16304f] disabled:opacity-50 flex items-center gap-2"
                  >
                    {extracting ? (
                      <>
                        <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {extractStatus || 'Extracting...'}
                      </>
                    ) : (
                      '↑ Upload'
                    )}
                  </button>
                </div>
                {addDocError && <p className="text-xs text-red-600 w-full">{addDocError}</p>}
              </div>

              {/* Progress bar */}
              {extracting && (
                <div style={{ marginTop:'10px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                    <span style={{ fontSize:'11px', color:'#1e3a5f', fontWeight:500 }}>{extractStatus}</span>
                    <span style={{ fontSize:'11px', color:'#1e3a5f', fontWeight:600 }}>{extractProgress}%</span>
                  </div>
                  <div style={{ height:'5px', background:'#dbeafe', borderRadius:'9999px', overflow:'hidden' }}>
                    <div style={{
                      height:'100%', borderRadius:'9999px', background:'#1e3a5f',
                      width:`${extractProgress}%`, transition:'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}

              {extractedFields?._error && (
                <div className="mt-3 bg-red-50 rounded-lg border border-red-200 p-3">
                  <p className="text-xs font-semibold text-red-700">⚠ {extractedFields._message || 'Could not read this document — please fill the fields by hand.'}</p>
                </div>
              )}
              {extractedFields?._irrelevant && (
                <div className="mt-3 bg-amber-50 rounded-lg border border-amber-200 p-3">
                  <p className="text-xs font-semibold text-amber-700">
                    ⚠ Nothing to fill was found in this document.
                    {extractedFields._unreadable?.length ? ` Page${extractedFields._unreadable.length === 1 ? '' : 's'} ${extractedFields._unreadable.join(', ')} ${extractedFields._unreadable.length === 1 ? 'is a picture' : 'are pictures'} with no text — please type those details by hand.` : ''}
                  </p>
                </div>
              )}

              {/* Auto-filled fields summary */}
              {Object.keys(autoFillApplied).length > 0 && (
                <div className="mt-3 bg-white rounded-lg border border-green-200 p-3">
                  <p className="text-xs font-semibold text-green-700 mb-2">
                    ✓ Fields applied to form
                    {extractedFields?._source === 'pdf-text' && (
                      <span className="font-normal text-gray-500"> · read from the PDF on this computer, no AI used</span>
                    )}
                  </p>
                  {extractedFields?._found && <p className="text-xs text-gray-500 mb-2">Found: {extractedFields._found}</p>}
                  {extractedFields?._unreadable?.length > 0 && (
                    <p className="text-xs text-amber-700 mb-2">Page{extractedFields._unreadable.length === 1 ? '' : 's'} {extractedFields._unreadable.join(', ')} {extractedFields._unreadable.length === 1 ? 'is a picture' : 'are pictures'} with no text, so nothing was read from {extractedFields._unreadable.length === 1 ? 'it' : 'them'}.</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(autoFillApplied).filter(([, v]) => v).map(([key]) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                        <span className="text-xs text-gray-600 capitalize">{key.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <SectionHeading>Job Header</SectionHeading>

              <Field label="Job Number" required>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={form.job_no}
                  onChange={setJobNumber}
                  className={inputClass}
                  placeholder="e.g. 123"
                />
              </Field>

              <Field label="Client Name" required>
                {form.client === '__other__' ? (
                  <div className="flex gap-2">
                    <input type="text" required value={form.clientOther || ''} onChange={(e) => { setForm(p => ({ ...p, clientOther: e.target.value })); setError('') }} className={fieldClass('client')} placeholder="Enter client name" />
                    <button type="button" onClick={() => setForm(p => ({ ...p, client: '', clientOther: '' }))} className="shrink-0 px-3 py-2 text-xs font-semibold rounded-lg bg-gray-100 border border-gray-300 text-gray-600 hover:bg-gray-200">↩ List</button>
                  </div>
                ) : (
                  <select value={form.client} onChange={(e) => { const v = e.target.value; setForm(p => ({ ...p, client: v === '__other__' ? '__other__' : v, clientOther: v === '__other__' ? '' : p.clientOther })); setError('') }} className={fieldClass('client')} required>
                    <option value="">Select client</option>
                    {CLIENT_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__other__">Other...</option>
                  </select>
                )}
              </Field>

              <Field label="Mode" required>
                <select value={form.mode} onChange={set('mode')} className={inputClass}>
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Import / Export" required>
                <select value={form.job_type} onChange={set('job_type')} className={inputClass}>
                  <option value="import">Import</option>
                  <option value="export">Export</option>
                </select>
              </Field>

              <Field label="Port" required>
                <select value={form.port_code} onChange={set('port_code')} className={inputClass}>
                  {PORTS.map((p) => (
                    <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </Field>

              <Field label="Goods Description">
                <input
                  type="text"
                  value={form.goods}
                  onChange={set('goods')}
                  className={fieldClass('goods')}
                />
              </Field>

              <Field label="Priority" required>
                <select value={form.priority} onChange={set('priority')} className={inputClass}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>

              <SectionHeading>Shipment Details</SectionHeading>

              <Field label="BL Number">
                <input type="text" value={form.bl_no} onChange={set('bl_no')} className={fieldClass('bl_no')} />
              </Field>

              <Field label="Carrier / Shipping Line" required>
                {form.carrier === '__other__' ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={form.carrierOther || ''}
                      onChange={e => {
                        setForm(p => ({ ...p, carrierOther: e.target.value }))
                        setError('')
                      }}
                      className={inputClass}
                      placeholder="Enter shipping line name"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, carrier: '', carrierOther: '' }))}
                      className="shrink-0 px-3 py-2 text-xs font-semibold rounded-lg bg-gray-100 border border-gray-300 text-gray-600 hover:bg-gray-200"
                    >
                      ↩ List
                    </button>
                  </div>
                ) : (
                  <select
                    value={form.carrier}
                    onChange={e => {
                      const v = e.target.value
                      setForm(p => ({
                        ...p,
                        carrier: v === '__other__' ? '__other__' : v,
                        carrierOther: v === '__other__' ? '' : p.carrierOther,
                      }))
                      setError('')
                    }}
                    className={inputClass}
                    required
                  >
                    <option value="">Select shipping line</option>
                    {SHIPPING_LINES.filter(s => s !== 'Other').map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                    <option value="__other__">Other...</option>
                  </select>
                )}
              </Field>

              {/* Containers — per-container rows for Sea FCL, notice for others */}
              {form.mode === 'Sea FCL' ? (
                <div className="col-span-full">
                  <label className={labelClass}>Containers</label>
                  <div className="border border-gray-300 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide w-1/2">Container No.</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide w-1/3">Size</th>
                          <th className="px-3 py-2 w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {form.containers.map((row, i) => (
                          <tr key={i} className="border-b border-gray-100 last:border-b-0">
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={row.no}
                                onChange={e => {
                                  const val = e.target.value.toUpperCase()
                                  setForm(p => {
                                    const next = [...p.containers]
                                    next[i] = { ...next[i], no: val }
                                    return { ...p, containers: next }
                                  })
                                }}
                                placeholder="e.g. MSCU1234567"
                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-transparent"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <select
                                value={row.size}
                                onChange={e => {
                                  setForm(p => {
                                    const next = [...p.containers]
                                    next[i] = { ...next[i], size: e.target.value }
                                    return { ...p, containers: next }
                                  })
                                }}
                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-transparent"
                              >
                                <option value="">Select size</option>
                                {CONTAINER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <button
                                type="button"
                                disabled={form.containers.length <= 1}
                                onClick={() => {
                                  setForm(p => ({ ...p, containers: p.containers.filter((_, idx) => idx !== i) }))
                                }}
                                className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
                                title="Remove container"
                              >×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50">
                      <button
                        type="button"
                        onClick={handleAddRow}
                        disabled={!canAddRow}
                        className="text-xs font-semibold text-[#1e3a5f] disabled:opacity-40 disabled:cursor-not-allowed"
                      >+ Add container</button>
                      {showRowWarning && (
                        <p className="text-xs text-red-500 mt-1">Please complete the container number and size above before adding another</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Each container can have a different size as per BL</p>
                </div>
              ) : form.mode === 'Sea LCL' ? (
                <Field label="Containers">
                  <p className="text-sm text-gray-400 italic">Sea LCL — container numbers not applicable. Shipment is consolidated.</p>
                </Field>
              ) : form.mode === 'Air' ? (
                <Field label="Containers">
                  <p className="text-sm text-gray-400 italic">Air — container numbers not applicable. Enter AWB number in BL field.</p>
                </Field>
              ) : form.mode === 'BPT/MBPT' ? (
                <Field label="Containers">
                  <p className="text-sm text-gray-400 italic">BPT/MBPT — container numbers not applicable.</p>
                </Field>
              ) : null}

              <Field label="Vessel / Flight">
                <input type="text" value={form.vessel} onChange={set('vessel')} className={fieldClass('vessel')} />
              </Field>

              <Field label="ETA">
                <input type="date" value={form.eta} onChange={set('eta')} className={fieldClass('eta')} />
              </Field>

              <Field label="CFS Name">
                <input type="text" value={form.cfs_name} onChange={set('cfs_name')} className={inputClass} />
              </Field>

              <Field label="CFS Amount">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cfs_amount}
                  onChange={set('cfs_amount')}
                  className={inputClass}
                />
              </Field>

              <SectionHeading>Customs</SectionHeading>

              <Field label="BE Number">
                <input type="text" value={form.be_no} onChange={set('be_no')} className={fieldClass('be_no')} />
              </Field>

              <Field label="BE Date">
                <input type="date" value={form.be_date} onChange={set('be_date')} className={fieldClass('be_date')} />
              </Field>

              <Field label="HS Code">
                <input type="text" value={form.hs_code} onChange={set('hs_code')} className={fieldClass('hs_code')} />
              </Field>

              <Field label="IGM Number">
                <input type="text" value={form.igm_no} onChange={set('igm_no')} placeholder="From the BE" className={fieldClass('igm_no')} />
              </Field>

              <Field label="IGM Date">
                <input type="date" value={form.igm_date} onChange={set('igm_date')} className={fieldClass('igm_date')} />
              </Field>

              <Field label="IGM Item (line) No">
                <input type="text" inputMode="numeric" value={form.igm_item_no}
                  onChange={(e) => setForm((f) => ({ ...f, igm_item_no: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="Optional — finds this client's line in the IGM" className={fieldClass('igm_item_no')} />
              </Field>

              <Field label="RMS Status">
                <select value={form.rms_status} onChange={set('rms_status')} className={fieldClass('rms_status')}>
                  {RMS_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ))}
                </select>
                {extractedFields?.rms_label && (
                  <p className="text-xs text-gray-500 mt-1">From the BE: {extractedFields.rms_label}</p>
                )}
              </Field>

              <Field label="BG Required">
                <select value={form.bg_required} onChange={set('bg_required')} className={inputClass}>
                  {BG_OPTIONS.map((b) => (
                    <option key={b} value={b}>
                      {b === '100percent' ? '100%' : b.charAt(0).toUpperCase() + b.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>

              <SectionHeading>Delivery</SectionHeading>

              <Field label="Destination">
                <input
                  type="text"
                  value={form.destination}
                  onChange={set('destination')}
                  className={inputClass}
                />
              </Field>

              <Field label="Free Days">
                <input
                  type="number"
                  min="0"
                  value={form.free_days}
                  onChange={set('free_days')}
                  className={inputClass}
                />
              </Field>

              <Field label="Detention Risk">
                <select
                  value={form.detention_risk}
                  onChange={set('detention_risk')}
                  className={inputClass}
                >
                  {DETENTION_RISKS.map((d) => (
                    <option key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Current Stage">
                <select value={form.stage} onChange={set('stage')} className={inputClass}>
                  {Object.entries(STAGE_NAMES).map(([value, name]) => (
                    <option key={value} value={value}>
                      {value} — {name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="md:col-span-2">
                <Field label="Delay Reason">
                  <input
                    type="text"
                    value={form.delay_reason}
                    onChange={set('delay_reason')}
                    className={inputClass}
                  />
                </Field>
              </div>

            </div>

            {error && (
              <p className="mt-6 text-red-600 text-sm text-center">{error}</p>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 pt-6">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving || uploadingDocs}
                className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploadingDocs}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[#1e3a5f] rounded-md hover:bg-[#16304f] disabled:opacity-70 flex items-center gap-2"
              >
                {(saving || uploadingDocs) && (
                  <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {uploadingDocs ? 'Uploading documents...' : saving ? 'Saving...' : 'Save Job'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
