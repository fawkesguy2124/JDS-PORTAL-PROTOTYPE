import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { STAGE_NAMES } from '../utils/jobHelpers'
import { linkContainer } from '../api/trackingApi'
import { PORTS } from '../utils/ports'

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

const CLIENT_LIST = [
  'PCM','Adorn (ALS Series)','Deepa Traders','Divine / NNC','Eboney',
  'Limitless Components EXIM','Infinite EXIM','Uddaybharat Techno Pvt. Ltd.',
  'Leon International','Green Soul','Enkay Machinery','TRW','Grupo',
  'Integral','Maxlord','Gefit','REAL','Mahalaxmi','Macksmatec','Finearc',
  'Electrica','Ishita','Cotswold','INTO','Rivaan','Nikam',
]

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

const fuzzyMatchClient = (extracted) => {
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

const BL_QUICK_EXTRACT_PROMPT = `You are an expert shipping document parser.

IMPORTANT: First check if this is a shipping or customs document such as a Bill of Lading, Commercial Invoice, Packing List, Certificate of Origin, or similar. If it is NOT a shipping document, return exactly this JSON and nothing else: {"_irrelevant": true}

If it IS a shipping document, extract ONLY these fields and return ONLY valid JSON, no markdown, no explanation:

{
  "client": "importer or consignee full name",
  "bl_no": "bill of lading number",
  "containers": "ALL container numbers space separated e.g. MSCU1234567 OOLU7654321",
  "shipping_line": "shipping line name e.g. Evergreen COSCO MSC",
  "vessel": "vessel name",
  "eta": "estimated arrival date in YYYY-MM-DD format if found else null",
  "goods": "brief goods description",
  "hs_code": "HS code if found else null",
  "free_days": "number of free days (also called free time or detention free period) mentioned in the BL — usually 7, 14, or 21 days — null if not found"
 }

If a field is not found set it to null. Extract ALL container numbers visible in the document.`

const BE_QUICK_EXTRACT_PROMPT = `You are an expert Indian Customs document parser.

IMPORTANT: First check if this is an Indian Customs Bill of Entry or OOC document issued by ICEGATE. If it is NOT a customs document, return exactly this JSON and nothing else: {"_irrelevant": true}

If it IS a Bill of Entry or OOC document, extract ONLY these fields and return ONLY valid JSON, no markdown, no explanation:

{
  "client": "importer full name from DECLARANT section — extract the FULL name exactly as written e.g. PUTZMEISTER CONCRETE MACHINES PRIVATE LIMITED",
  "be_no": "BE number from top right corner of every page e.g. 9301277",
  "be_date": "BE date in YYYY-MM-DD format e.g. 2026-05-16",
  "bl_no": "BL or MAWB number from MANIFEST DETAILS section e.g. COSU6445596690",
  "containers": "ALL container numbers from CONTAINER DETAILS section across ALL pages space separated e.g. BMOU4978572 BMOU5358154 CCLU7383578",
  "shipping_line": "shipping line name derived from container prefix or manifest e.g. COSCO Evergreen MSC",
  "vessel": "vessel name from MANIFEST DETAILS section",
  "eta": null,
  "goods": "item description from PART III DUTIES section",
  "hs_code": "8-digit CTH code from PART III e.g. 84571010"
}

Important:
- Extract ALL container numbers — they appear in PART I summary and PART IV additional details across multiple pages
- BE number is in the top right corner of every page
- BL number is in the MANIFEST DETAILS section as MAWB NO
- Importer name is in the DECLARANT section
- If a field is not found set it to null`

const INVOICE_QUICK_EXTRACT_PROMPT = `You are an expert shipping document parser.

IMPORTANT: If this is not a Commercial Invoice or Proforma Invoice, return exactly: {"_irrelevant": true}

If it IS a Commercial Invoice, extract ONLY these fields and return ONLY valid JSON:
{
  "client": "buyer or importer full name",
  "goods": "brief description of goods",
  "hs_code": "HS or CTH code if found else null"
}
If a field is not found set it to null.`

const PACKING_LIST_PROMPT = `You are an expert shipping document parser.

IMPORTANT: If this is not a Packing List, return exactly: {"_irrelevant": true}

If it IS a Packing List, extract ONLY these fields and return ONLY valid JSON:
{
  "client": "buyer or importer full name if found else null",
  "goods": "brief description of goods if found else null"
}
If a field is not found set it to null.`

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

  const DOC_TYPES = ['BL', 'Invoice', 'Packing List', 'COO', 'Insurance', 'BE', 'Examination Order', 'OOC', 'E-Way Bill', 'POD', 'Other']

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

    const groqKey = import.meta.env.VITE_GROQ_API_KEY
    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!groqKey && !geminiKey) {
      setExtractedFields({ _error: true })
      setExtractStatus('No AI API key configured — contact Jose.')
      extractingRef.current = false
      return
    }
    setExtractedFields(null)
    setAutoFillApplied({})
    setExtractProgress(0)
    setExtractStatus('Reading document...')

    try {
      // Convert file to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      setExtractProgress(20)
      setExtractStatus('Converting pages...')

      const isPdf = file.name.toLowerCase().endsWith('.pdf')
      let images = []

      if (isPdf) {
        const pdfjs = await import('pdfjs-dist')
        const workerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.href
        const pdfBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
        const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise
        const maxPages = Math.min(pdf.numPages, 4)
        for (let p = 1; p <= maxPages; p++) {
          const page = await pdf.getPage(p)
          const viewport = page.getViewport({ scale: 0.9 })
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvasContext: ctx, viewport }).promise
          images.push({
            base64: canvas.toDataURL('image/jpeg', 0.85).split(',')[1],
            mimeType: 'image/jpeg',
          })
        }
      } else {
        images = [{ base64, mimeType: file.type || 'image/jpeg' }]
      }

      setExtractProgress(45)
      setExtractStatus('Sending to AI...')

      // Use Jose's selected document type to pick the right prompt
      const promptMap = {
        'BL':           BL_QUICK_EXTRACT_PROMPT,
        'BE':           BE_QUICK_EXTRACT_PROMPT,
        'OOC':          BE_QUICK_EXTRACT_PROMPT,
        'Invoice':      INVOICE_QUICK_EXTRACT_PROMPT,
        'Packing List': PACKING_LIST_PROMPT,
      }
      const activePrompt = promptMap[docType] || BL_QUICK_EXTRACT_PROMPT

      setExtractProgress(55)
      setExtractStatus('Extracting fields...')

      let parsed = null

      // Try Gemini first
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: activePrompt },
                  ...images.map(img => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } }))
                ]
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
            }),
          }
        )
        const data = await res.json()
        if (data.error) throw new Error(`Gemini API error: ${data.error.message}`)
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n') || ''
        if (!text) throw new Error('Gemini returned empty response')
        const cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
        console.log('Gemini raw response:', cleaned)
        parsed = JSON.parse(cleaned)
      } catch (geminiErr) {
        console.warn('Gemini failed in CreateJob, trying Groq...', geminiErr.message)
        setExtractStatus('Trying fallback AI...')

        // Groq fallback — images only (first image, Groq handles one at a time)
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            max_tokens: 1024,
            temperature: 0.1,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: activePrompt },
                { type: 'image_url', image_url: { url: `data:${images[0].mimeType};base64,${images[0].base64}` } }
              ]
            }]
          }),
        })
        const groqData = await groqRes.json()
        const groqText = groqData?.choices?.[0]?.message?.content || ''
        const groqCleaned = groqText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
        parsed = JSON.parse(groqCleaned)
      }

      setExtractProgress(85)
      setExtractStatus('Applying fields...')

      // Check if document was flagged as irrelevant by the AI
      if (parsed._irrelevant) {
        setStagedDocs(prev => prev.map(d => d.id === docId ? { ...d, irrelevant: true } : d))
        setExtractedFields({ _irrelevant: true })
        return
      }

      // Validate minimum shipping fields
      const hasMinimumFields = parsed.bl_no || parsed.be_no || parsed.containers || parsed.client
      if (!hasMinimumFields) {
        setStagedDocs(prev => prev.map(d => d.id === docId ? { ...d, irrelevant: true } : d))
        setExtractedFields({ _irrelevant: true })
        return
      }

setExtractedFields(parsed)

// Only fill fields that are currently empty — don't overwrite existing data
const shouldFill = (field) => !form[field] || form[field] === '' || form[field] === '__other__'
const updates = {}
const applied = {}

if (parsed.client && shouldFill('client')) {
        const matchedClient = fuzzyMatchClient(parsed.client)
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
                        {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
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
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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

                      // Only extract for these types
                      const extractableTypes = ['BL', 'Invoice', 'BE', 'OOC', 'Packing List']
                      if (extractableTypes.includes(addDocType)) {
                        await handleQuickExtract(file, addDocType, docId)
                      }

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
                  <p className="text-xs font-semibold text-red-700">⚠ Extraction failed — please fill fields manually or try again.</p>
                </div>
              )}
              {extractedFields?._irrelevant && (
                <div className="mt-3 bg-amber-50 rounded-lg border border-amber-200 p-3">
                  <p className="text-xs font-semibold text-amber-700">⚠ Document doesn't appear to be a shipping document — no fields extracted.</p>
                </div>
              )}

              {/* Auto-filled fields summary */}
              {Object.keys(autoFillApplied).length > 0 && (
                <div className="mt-3 bg-white rounded-lg border border-green-200 p-3">
                  <p className="text-xs font-semibold text-green-700 mb-2">✓ Fields applied to form</p>
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

              <Field label="RMS Status">
                <select value={form.rms_status} onChange={set('rms_status')} className={inputClass}>
                  {RMS_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ))}
                </select>
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
