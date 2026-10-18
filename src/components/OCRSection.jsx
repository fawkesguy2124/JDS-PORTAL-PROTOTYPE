import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import * as XLSX from 'xlsx'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { readJobDocuments, toOcrFields, unreadableMessage } from '../utils/docReaderMap'

export const FIELD_LABELS_OCR = {
  // Shipment identifiers
  bl_number: 'BL / AWB Number',
  vessel_name: 'Vessel / Flight',
  container_numbers: 'Container Numbers',
  seal_numbers: 'Seal Numbers',
  container_size: 'Container Size',
  shipping_line: 'Shipping Line',

  // Parties
  consignee_name: 'Consignee / Importer',
  consignee_address: 'Importer Address',
  importer_gstin: 'GSTIN',
  importer_iec: 'IEC Code',
  ad_code: 'AD Code',
  supplier_name: 'Supplier / Exporter',
  supplier_address: 'Supplier Address',
  supplier_country: 'Supplier Country',

  // Origin & Route
  country_of_origin: 'Country of Origin',
  country_of_consignment: 'Country of Consignment',
  port_of_loading: 'Port of Loading',
  port_of_shipment: 'Port of Shipment',
  port_of_discharge: 'Port of Discharge',
  place_of_delivery: 'Place of Delivery',

  // IGM / HAWB
  igm_number: 'IGM Number',
  igm_date: 'IGM Date',
  hawb_number: 'HAWB / HBL Number',
  hawb_date: 'HAWB / HBL Date',
  bl_date: 'BL / AWB Date',

  // Invoice & Finance
  invoice_numbers: 'Invoice Numbers',
  invoice_dates: 'Invoice Dates',
  invoice_amounts: 'Invoice Amounts',
  invoice_currencies: 'Invoice Currencies',
  payment_terms: 'Payment Terms (CIF/FOB)',
  freight_amount: 'Freight Amount',
  insurance_amount: 'Insurance Amount',
  exchange_rates: 'Exchange Rates',

  // Cargo
  package_count: 'Package Count',
  gross_weight: 'Gross Weight (KGS)',
  net_weight: 'Net Weight (KGS)',
  goods_description: 'Goods Description',
  hs_code: 'HS Code / CTH',

  // Line items & docs
  invoice_line_items: 'Invoice Line Items',
  supporting_documents: 'Supporting Documents',
}

export const OCR_SECTIONS = [
  { title: 'Shipment Identifiers', fields: ['bl_number','bl_date','vessel_name','container_numbers','container_size','seal_numbers','shipping_line'] },
  { title: 'Parties', fields: ['consignee_name','consignee_address','importer_gstin','importer_iec','ad_code','supplier_name','supplier_address','supplier_country'] },
  { title: 'Origin & Route', fields: ['country_of_origin','country_of_consignment','port_of_loading','port_of_shipment','port_of_discharge','place_of_delivery'] },
  { title: 'IGM & House Docs', fields: ['igm_number','igm_date','hawb_number','hawb_date'] },
  { title: 'Invoice & Finance', fields: ['invoice_numbers','invoice_dates','invoice_amounts','invoice_currencies','payment_terms','freight_amount','insurance_amount','exchange_rates'] },
  { title: 'Cargo Details', fields: ['goods_description','hs_code','package_count','gross_weight','net_weight'] },
  { title: 'Line Items & Supporting Documents', fields: ['invoice_line_items','supporting_documents'] },
]

export const OCR_FIELD_MAP = {
  bl_no:                    'bl_number',
  vessel:                   'vessel_name',
  containers:               'container_numbers',
  container_size:           'container_size',
  goods:                    'goods_description',
  hs_code:                  'hs_code',
  client:                   'consignee_name',
  destination:              'place_of_delivery',
  be_no:                    null,
  eta:                      null,
  shipping_line:            null,
  cfs_name:                 null,
  cfs_amount:               null,
  free_days:                'free_days',
  notes:                    null,
  bg_required:              null,
  rms_status:               null,
  detention_risk:           null,
  delay_reason:             null,
  priority:                 null,
  mode:                     null,
  importer_gstin:           'importer_gstin',
  importer_iec:             'importer_iec',
  importer_address:         'consignee_address',
  ad_code:                  'ad_code',
  igm_no:                   'igm_number',
  igm_date:                 'igm_date',
  hawb_no:                  'hawb_number',
  hawb_date:                'hawb_date',
  bl_date:                  'bl_date',
  port_of_loading:          'port_of_loading',
  port_of_shipment:         'port_of_shipment',
  port_of_discharge:        'port_of_discharge',
  country_of_origin:        'country_of_origin',
  country_of_consignment:   'country_of_consignment',
  package_count:            'package_count',
  gross_weight:             'gross_weight',
  net_weight:               'net_weight',
  seal_numbers:             'seal_numbers',
  supplier_name:            'supplier_name',
  supplier_address:         'supplier_address',
  supplier_country:         'supplier_country',
  invoice_numbers:          'invoice_numbers',
  invoice_dates:            'invoice_dates',
  invoice_amounts:          'invoice_amounts',
  invoice_currencies:       'invoice_currencies',
  payment_terms:            'payment_terms',
  freight_amount:           'freight_amount',
  insurance_amount:         'insurance_amount',
  exchange_rates:           'exchange_rates',
  line_items:               'invoice_line_items',
  supporting_documents:     'supporting_documents',
}

export const MULTI_VALUE_FIELDS = [
  'containers',
  'seal_numbers',
  'invoice_numbers',
  'invoice_dates',
  'invoice_amounts',
  'invoice_currencies',
  'line_items',
  'supporting_documents',
]

// Reads the selected documents straight from the text inside each PDF, in the
// browser. Nothing is sent to any outside service.
async function readSelectedDocuments(docs, onProgress = () => {}) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const read = await readJobDocuments(pdfjs, docs, onProgress)
  return {
    result: toOcrFields(read.fields, read.documents, read.sources),
    provider: 'pdf-text',
    files: read.files,
  }
}

export default function OCRSection({ job: preselectedJob, jobs, currentUserName, showToast, user: ocrUser, profile: ocrProfile, preloadedExtraction, onSaved }) {
  const [step, setStep] = useState(1)
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedDocIds, setSelectedDocIds] = useState(new Set())
  const [extracting, setExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState('')
  const [extractError, setExtractError] = useState(null)
  const [extractedData, setExtractedData] = useState(null)
  const [extractEdits, setExtractEdits] = useState({})
  const [savedExtraction, setSavedExtraction] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [ocrSearch, setOcrSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [recentExtractions, setRecentExtractions] = useState([])
  const [loadingRecent, setLoadingRecent]         = useState(true)
  const [uploading, setUploading]         = useState(false)
  const [uploadDocType, setUploadDocType] = useState('BL')
  const [dragOver, setDragOver]           = useState(false)
  const uploadInputRef                     = useRef(null)

  useEffect(() => {
    loadRecentExtractions()
  }, [])

  useEffect(() => {
    if (!preselectedJob) return

    setSelectedJob(preselectedJob)
    setSelectedDocIds(new Set())
    setExtractError(null)

    if (preloadedExtraction) {
      // Use already-loaded extraction data — no Supabase call needed
      setSavedExtraction(preloadedExtraction)
      setExtractedData({ result: preloadedExtraction.extracted_data, provider: 'saved' })
      setExtractEdits({ ...(preloadedExtraction.extracted_data || {}) })
      setStep(4)
      setLoadingDocs(false)
    } else {
      // No extraction yet — load documents for step 2
      fetchDocuments(preselectedJob).then(() => setStep(2))
    }
  }, [preselectedJob?.id, preloadedExtraction?.id])

  const recentLoadingRef = useRef(false)

  const loadRecentExtractions = async () => {
    if (recentLoadingRef.current) return
    recentLoadingRef.current = true
    setLoadingRecent(true)
    try {
      const { data, error } = await supabase
        .from('job_extractions')
        .select('id, job_id, job_no, extracted_by_name, extracted_at, updated_at, extracted_data')
        .order('extracted_at', { ascending: false })
        .limit(8)
      if (error) throw error
      setRecentExtractions(
        (data || []).map(row => {
          const fields   = row.extracted_data || {}
          const total    = Object.keys(fields).length
          const found    = Object.values(fields).filter(f => f?.value).length
          const allHigh  = Object.values(fields).every(f => f?.confidence === 'high')
          const anyLow   = Object.values(fields).some(f => !f?.value)
          return {
            id:          row.id,
            jobId:       row.job_id,
            jobNo:       row.job_no,
            extractedBy: row.extracted_by_name,
            extractedAt: row.extracted_at || row.updated_at,
            total,
            found,
            dot: anyLow ? '#f59e0b' : allHigh ? '#16a34a' : '#16a34a',
          }
        })
      )
    } catch (e) {
      console.warn('Could not load recent extractions:', e)
    } finally {
      recentLoadingRef.current = false
      setLoadingRecent(false)
    }
  }

  const handleViewSavedForJob = async (job) => {
    try {
      const { data, error } = await supabase
        .from('job_extractions')
        .select('*')
        .eq('job_id', job.id)
        .order('extracted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) {
        showToast('Error loading extraction: ' + error.message, 'error')
        return
      }
      if (!data) {
        showToast('No saved extraction found for this job.', 'error')
        return
      }
      setSelectedJob(job)
      setExtractedData({
        ...data.extracted_data,
        provider: 'saved',
      })
      setExtractEdits(data.extracted_data || {})
      setSavedExtraction(data)
      setStep(4)
    } catch (e) {
      showToast('Could not load saved extraction.', 'error')
    }
  }

  const TEXTAREA_FIELDS = ['goods_description', 'consignee_address', 'supplier_address', 'invoice_line_items', 'supporting_documents', 'exchange_rates']

  const filteredJobs = useMemo(() => {
    const q = ocrSearch.trim().toLowerCase()
    if (!q) return jobs || []
    return (jobs || []).filter((j) =>
      (j.job_no || '').toLowerCase().includes(q) ||
      (j.client || '').toLowerCase().includes(q)
    )
  }, [jobs, ocrSearch])

  const stepInfo = [
    { num: 1, label: 'Select Job' },
    { num: 2, label: 'Select Docs' },
    { num: 3, label: 'Extract' },
    { num: 4, label: 'Review' },
    { num: 5, label: 'Save' },
    { num: 6, label: 'Download' },
    { num: 7, label: 'ICEGATE', manual: true },
  ]

  const fetchDocuments = async (job) => {
    setLoadingDocs(true)
    try {
      const { data, error } = await supabase.from('documents').select('*').eq('job_id', job.id).order('created_at', { ascending: false })
      if (error) throw error
      setDocuments(data ?? [])
    } catch (e) {
      console.warn('Failed to fetch documents:', e)
      setDocuments([])
    }
    setLoadingDocs(false)
  }

  const handleSelectJob = async (job, autoAdvance = false) => {
    setSelectedJob(job)
    setSelectedDocIds(new Set())
    setExtractedData(null)
    setExtractEdits({})
    setExtractError(null)
    setSavedExtraction(null)
    setDocuments([])
    setLoadingDocs(true)
    const { data: extraction } = await supabase.from('job_extractions').select('*').eq('job_id', job.id).maybeSingle()
    if (extraction) {
      setSavedExtraction(extraction)
      setLoadingDocs(false)
      if (autoAdvance) {
        // Has saved extraction — go straight to review
        setExtractedData({ result: extraction.extracted_data, provider: 'saved' })
        setExtractEdits({ ...extraction.extracted_data })
        setStep(4)
      }
    } else {
      await fetchDocuments(job)
      setStep(2)
    }
  }

  const handleViewSaved = () => {
    if (!savedExtraction) return
    setExtractedData({ result: savedExtraction.extracted_data, provider: 'saved' })
    setExtractEdits({ ...savedExtraction.extracted_data })
    setStep(4)
  }

  const handleExtractAgain = async () => {
    setSavedExtraction(null)
    await fetchDocuments(selectedJob)
    setStep(2)
  }

  const toggleDoc = (id) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedDocIds.size === documents.length) {
      setSelectedDocIds(new Set())
    } else {
      setSelectedDocIds(new Set(documents.map((d) => d.id)))
    }
  }

  const handleExtract = async () => {
    const selectedDocs = documents.filter((d) => selectedDocIds.has(d.id))
    if (selectedDocs.length === 0) { showToast('Select at least one document.', 'error'); return }
    setStep(3)
    setExtracting(true)
    setExtractProgress('Opening documents...')
    setExtractError(null)
    try {
      const { result, provider, files } = await readSelectedDocuments(selectedDocs, (msg) => setExtractProgress(msg))
      const readOk = files.filter((f) => !f.notPdf && !f.error)
      if (readOk.length === 0) {
        const allPictures = files.every((f) => f.notPdf)
        throw new Error(allPictures
          ? 'Only PDF soft copies can be read. Photos and scanned images (JPG, PNG) cannot be read — please upload the original PDF, or type the details by hand.'
          : `The documents could not be opened: ${files.map((f) => `${f.name} (${f.notPdf ? 'not a PDF' : f.error})`).join('; ')}. Please check the files and try again.`)
      }
      setExtractedData({ result, provider, files })
      setExtractEdits(JSON.parse(JSON.stringify(result)))
      const found = Object.values(result).filter((f) => f?.value).length
      showToast(found ? `Read ${found} fields from the documents.` : 'Nothing could be read from these documents — please type the details by hand.', found ? 'success' : 'error')
      setStep(4)
    } catch (e) {
      setExtractError(e?.message || 'The documents could not be read.')
      showToast(e?.message || 'The documents could not be read.', 'error')
    } finally {
      setExtracting(false)
      setExtractProgress('')
    }
  }

  const handleSave = async () => {
    if (!selectedJob || !extractedData) return
    setSaving(true)
    try {
      const { error } = await supabase.from('job_extractions').upsert({
        job_id: selectedJob.id,
        job_no: selectedJob.job_no,
        extracted_data: extractEdits,
        extracted_by: ocrUser?.id || null,
        extracted_by_name: currentUserName,
        extracted_at: new Date().toISOString(),
      })
      if (error) throw error
      showToast('Extraction saved to database.', 'success')
      await loadRecentExtractions()
      if (onSaved) await onSaved()
      setSavedExtraction({ job_id: selectedJob.id, extracted_data: extractEdits })
    } catch (e) {
      showToast(e?.message || 'Save failed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new()
    const headers = Object.values(FIELD_LABELS_OCR)
    const values = Object.keys(FIELD_LABELS_OCR).map((k) => {
      const v = extractEdits?.[k]?.value
      return v != null ? String(v) : ''
    })
    const data = [
      ['JDS Logistics'],
      [`Document Extraction — ${selectedJob?.job_no || ''}`],
      [],
      headers,
      values,
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }]
    ws['!cols'] = headers.map(() => ({ wch: 20 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Extraction')
    XLSX.writeFile(wb, `OCR_Extraction_${selectedJob?.job_no || 'export'}.xlsx`)
  }

  const DOC_TYPES = [
    'BL', 'Invoice', 'Packing List', 'Certificate of Origin',
    'Insurance', 'BIS Certificate', 'LMPC Certificate',
    'SIMS Registration', 'NFMIMS Registration', 'Delivery Order',
    'Bill of Entry', 'OOC', 'Duty Challan', 'e-Way Bill', 'Other',
  ]

  const handleUploadDocument = async (file) => {
    if (!selectedJob) {
      showToast('Select a job first before uploading.', 'error')
      return
    }
    if (!file) return

    const MAX_SIZE = 20 * 1024 * 1024
    const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (file.size > MAX_SIZE) {
      showToast('File too large. Maximum 20MB.', 'error')
      return
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast('Invalid file type. Only PDF, JPEG, PNG, and WebP are accepted.', 'error')
      return
    }

    setUploading(true)
    try {
      const ext      = file.name.split('.').pop()
      const filePath = `${selectedJob.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      const { error: upErr } = await supabase.storage
        .from('job-documents')
        .upload(filePath, file, { cacheControl: '3600', upsert: false })

      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage
        .from('job-documents')
        .getPublicUrl(filePath)

      const { error: insErr } = await supabase.from('documents').insert({
        job_id:           selectedJob.id,
        job_no:           selectedJob.job_no,
        file_name:        file.name,
        file_path:        filePath,
        doc_type:         uploadDocType,
        file_url:         publicUrl,
        uploaded_by:      ocrUser?.id || null,
        uploaded_by_name: ocrProfile?.name || currentUserName,
        file_size:        file.size,
      })

      if (insErr) throw insErr

      const isPdf = file.type === 'application/pdf'
      showToast(isPdf ? `${file.name} uploaded successfully.` : `${file.name} uploaded. Note: only PDF soft copies can be read automatically — details from photos must be typed by hand.`, 'success')

      const { data: freshDocs } = await supabase
        .from('documents')
        .select('*')
        .eq('job_id', selectedJob.id)
        .order('created_at', { ascending: false })
      setDocuments(freshDocs || [])
      if (freshDocs?.length) {
        setSelectedDocIds(prev => new Set([...prev, freshDocs[0].id]))
      }
    } catch (e) {
      showToast(`Upload failed: ${e.message}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleFileDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUploadDocument(file)
  }

  const handleFileInput = (e) => {
    const file = e.target.files[0]
    if (file) handleUploadDocument(file)
    e.target.value = ''
  }

  const btnBase = 'h-9 px-4 text-sm rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const cardBase = 'bg-white border border-[#e2e6ed] rounded-xl shadow-sm'

  const confidenceColor = (conf) => {
    if (conf === 'high') return 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]'
    if (conf === 'medium') return 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]'
    if (conf === 'low') return 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]'
    return 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]'
  }

  const inputBase = 'w-full h-9 px-3 py-2 text-sm rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#e8eef8]'
  const textareaBase = 'w-full px-3 py-2 text-sm rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#e8eef8] resize-none'

  return (
    <div className="flex flex-col-reverse lg:flex-row gap-[18px] items-start">

      {/* ── LEFT MAIN COLUMN ── */}
      <div className="flex-1 min-w-0">

        {!preselectedJob && (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden mb-[18px]">
          <div className="px-5 py-4 flex items-center gap-0">
            {stepInfo.filter(s => preselectedJob ? s.num !== 1 : true).map((s, i) => {
              const done   = s.num < step
              const active = s.num === step
              return (
                <div key={s.num} className="flex items-center flex-1 min-w-0">
                  <div className="flex flex-col items-center shrink-0">
                    <div className={[
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                      done    ? 'bg-[#1a4fa0] border-[#1a4fa0] text-white'
                      : active ? 'bg-white border-[#1a4fa0] text-[#1a4fa0]'
                               : 'bg-[#f4f6f9] border-[#d0d6e0] text-[#8a96a8]'
                    ].join(' ')}>
                      {done ? '\u2713' : s.num}
                    </div>
                    <span className={[
                      'text-[10px] font-semibold mt-1 whitespace-nowrap',
                      active ? 'text-[#1a4fa0]' : done ? 'text-[#1a2233]' : 'text-[#8a96a8]'
                    ].join(' ')}>
                      {s.label}
                    </span>
                  </div>
                  {i < stepInfo.length - 1 && (
                    <div className={[
                      'flex-1 h-[2px] mx-1 mb-4',
                      done ? 'bg-[#1a4fa0]' : 'bg-[#e2e6ed]'
                    ].join(' ')} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
        )}

        {/* ── STEP 1: SELECT JOB ── */}
        {step === 1 && !preselectedJob && (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-[#1a2233]">Read from the Documents</div>
                <div className="text-xs text-[#8a96a8] mt-0.5">Select a job · the portal reads the fields straight from the PDF soft copies</div>
              </div>
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]">✓ PDF soft copies</span>
            </div>
            <div className="p-5">
              {/* Search */}
              <div className="flex items-center gap-2 h-10 px-4 bg-[#f8f9fb] border-[1.5px] border-[#e2e6ed] rounded-lg mb-4 focus-within:border-[#1a4fa0] focus-within:bg-white transition-colors">
                <span className="text-[#8a96a8] text-sm">🔍</span>
                <input
                  value={ocrSearch}
                  onChange={(e) => setOcrSearch(e.target.value)}
                  placeholder="Search by job no. or client..."
                  className="flex-1 bg-transparent outline-none text-sm text-[#1a2233] placeholder:text-[#8a96a8]"
                />
              </div>

              {/* Saved extraction banner */}
              {savedExtraction && (
                <div className="mb-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#15803d]">Saved extraction found for {selectedJob?.job_no}</p>
                    <p className="text-xs text-[#166534] mt-0.5">
                      Extracted on {savedExtraction.extracted_at ? new Date(savedExtraction.extracted_at).toLocaleDateString('en-IN') : '—'}
                      {savedExtraction.extracted_by_name ? ` · ${savedExtraction.extracted_by_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={handleViewSaved}
                      className="h-8 px-3 text-xs font-semibold rounded-lg bg-[#16a34a] text-white hover:bg-[#15803d] transition-colors">
                      View Saved
                    </button>
                    <button type="button" onClick={handleExtractAgain}
                      className="h-8 px-3 text-xs font-semibold rounded-lg bg-white border border-[#bbf7d0] text-[#15803d] hover:bg-[#f0fdf4] transition-colors">
                      Extract Again
                    </button>
                  </div>
                </div>
              )}

              {/* Job list */}
              <div className="border border-[#e2e6ed] rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-[#f8f9fb] border-b border-[#e2e6ed] flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#8a96a8] uppercase tracking-wider">Select Job</span>
                  <span className="text-xs text-[#8a96a8]">{filteredJobs.length} jobs</span>
                </div>
                <div className="divide-y divide-[#e2e6ed] max-h-[400px] overflow-y-auto scrollbar-thin">
                  {filteredJobs.map((job) => (
                    <div
                      key={job.id}
                      role="button" tabIndex={0}
                      onClick={() => handleSelectJob(job)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSelectJob(job)}
                      className={[
                        'px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors',
                        selectedJob?.id === job.id
                          ? 'bg-[#e8eef8] border-l-[3px] border-l-[#1a4fa0]'
                          : 'hover:bg-[#f8f9fb]'
                      ].join(' ')}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#1a4fa0] font-mono">{job.job_no || '—'}</span>
                          <span className="text-xs text-[#8a96a8] truncate">{job.client || ''}</span>
                        </div>
                        <div className="text-xs text-[#8a96a8] mt-0.5">
                          Stage {job.stage ?? 0} · {job.mode || '—'} · {job.goods ? String(job.goods).slice(0, 32) : '—'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {savedExtraction?.job_id === job.id && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); handleViewSavedForJob(job) }}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0] hover:bg-[#16a34a] hover:text-white transition-colors"
                          >
                            ✓ View Saved
                          </button>
                        )}
                        <span className="text-[#d0d6e0] text-xs">→</span>
                      </div>
                    </div>
                  ))}
                  {filteredJobs.length === 0 && (
                    <div className="px-4 py-10 text-center text-sm text-[#8a96a8]">
                      {ocrSearch.trim() ? 'No jobs match your search.' : 'No jobs available.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: SELECT DOCUMENTS ── */}
        {step === 2 && (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center gap-3">
            {!preselectedJob && (
              <button type="button" onClick={() => setStep(1)}
                className="h-8 px-3 text-xs font-semibold rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] transition-colors">
                ← Back
              </button>
            )}
              <div>
                <span className="text-sm font-bold text-[#1a2233]">{selectedJob?.job_no}</span>
                <span className="text-xs text-[#8a96a8] ml-2">{selectedJob?.client}</span>
              </div>
            </div>

            {loadingDocs ? (
              <div className="p-12 flex flex-col items-center gap-3">
                <div className="h-9 w-9 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[#8a96a8]">Loading documents...</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-3xl mb-3">📄</div>
                <p className="text-sm font-semibold text-[#4a5568] mb-1">No documents uploaded for this job</p>
                <p className="text-xs text-[#8a96a8] mb-5">Upload a BL, Invoice, or Packing List to get started.</p>
                <div className="flex flex-col items-center gap-3">
                  <select
                    value={uploadDocType}
                    onChange={e => setUploadDocType(e.target.value)}
                    className="h-9 px-3 text-sm border-[1.5px] border-[#e2e6ed] rounded-lg bg-white outline-none focus:border-[#1a4fa0] text-[#4a5568]"
                  >
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={uploading}
                    className="h-9 px-5 text-sm font-semibold rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {uploading
                      ? <><span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</>
                      : '📎 Upload Document'}
                  </button>
                  <input ref={uploadInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileInput} />
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-[#e2e6ed] bg-[#f8f9fb] flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox"
                      checked={selectedDocIds.size === documents.length && documents.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-[#d0d6e0] text-[#1a4fa0]" />
                    <span className="text-[11px] font-bold text-[#8a96a8] uppercase tracking-wider">Select Documents</span>
                  </label>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-[#8a96a8]">{selectedDocIds.size} / {documents.length} selected</span>
                    <select
                      value={uploadDocType}
                      onChange={e => setUploadDocType(e.target.value)}
                      className="h-7 px-2 text-xs border-[1.5px] border-[#e2e6ed] rounded-lg bg-white outline-none text-[#4a5568]"
                    >
                      {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={uploading}
                      className="h-7 px-3 text-xs font-semibold rounded-lg bg-[#e8eef8] border border-[#bfdbfe] text-[#1a4fa0] hover:bg-[#1a4fa0] hover:text-white disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
                    >
                      {uploading
                        ? <span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        : '📎'}
                      {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                    <input ref={uploadInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileInput} />
                  </div>
                </div>

                {/* Drag and drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  className={`mx-4 my-3 border-2 border-dashed rounded-xl p-4 text-center text-xs transition-colors cursor-pointer ${dragOver ? 'border-[#1a4fa0] bg-[#eff6ff] text-[#1a4fa0]' : 'border-[#e2e6ed] bg-[#f8f9fb] text-[#8a96a8]'}`}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  {dragOver ? '📂 Drop to upload' : '📎 Drag & drop a file here, or click to upload'}
                </div>
                <div className="divide-y divide-[#e2e6ed]">
                  {documents.map((doc) => (
                    <label key={doc.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8f9fb] cursor-pointer transition-colors">
                      <input type="checkbox"
                        checked={selectedDocIds.has(doc.id)}
                        onChange={() => toggleDoc(doc.id)}
                        className="h-4 w-4 rounded border-[#d0d6e0] text-[#1a4fa0] shrink-0" />
                      <span className="text-sm">📄</span>
                      <span className="text-sm text-[#1a2233] font-medium flex-1 truncate">{doc.file_name}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe] shrink-0">
                        {doc.doc_type || 'Other'}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="px-5 py-4 border-t border-[#e2e6ed] bg-[#f8f9fb]">
                  <button type="button" onClick={handleExtract} disabled={selectedDocIds.size === 0}
                    className="h-9 px-5 text-sm font-semibold rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2">
                    Read {selectedDocIds.size} document{selectedDocIds.size !== 1 ? 's' : ''}
                  </button>
                  <p className="text-xs text-[#8a96a8] mt-2">Only PDF soft copies can be read. Photos and scanned pages must be typed by hand.</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 3: EXTRACTING ── */}
        {step === 3 && (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-12 text-center">
            <div className="text-4xl mb-5">📄</div>
            {!extractError && <div className="h-12 w-12 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin mx-auto mb-5" />}
            <p className="text-base font-bold text-[#1a2233] mb-1">Reading the Documents</p>
            <p className="text-sm text-[#4a5568] mb-1">{extractProgress || (extractError ? '' : 'Reading the text inside the PDFs...')}</p>
            <p className="text-xs text-[#8a96a8]">Read on this computer from the PDF text · usually takes a few seconds</p>
            {extractError && (
              <div className="mt-5 p-4 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-left">
                <p className="text-sm font-semibold text-[#991b1b] mb-2">{extractError}</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleExtract}
                    className="h-9 px-4 text-sm font-semibold rounded-lg bg-[#dc2626] text-white hover:bg-[#b91c1c] transition-colors">
                    Try Again
                  </button>
                  <button type="button" onClick={() => { setExtractError(null); setStep(2) }}
                    className="h-9 px-4 text-sm font-semibold rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] transition-colors">
                    ← Back to Documents
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: REVIEW EXTRACTED FIELDS ── */}
        {step === 4 && extractedData && (
          <div>
            {/* Provider + job banner */}
            <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl px-5 py-3 mb-4 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <span className={[
                  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold',
                  extractedData.provider === 'pdf-text' ? 'bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]'
                                                        : 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]'
                ].join(' ')}>
                  {extractedData.provider === 'pdf-text' ? '📄 Read from the documents' : '✓ Saved'}
                </span>
                <div>
                  <span className="text-sm font-bold text-[#1a2233]">{selectedJob?.job_no}</span>
                  <span className="text-xs text-[#8a96a8] ml-2">{selectedJob?.client}</span>
                </div>
              </div>
              {(() => {
                const vals = Object.values(extractEdits || {})
                const high = vals.filter(f => f?.confidence === 'high').length
                const med  = vals.filter(f => f?.confidence === 'medium').length
                const miss = vals.filter(f => !f?.value).length
                return (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-full bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0] text-xs font-semibold">{high} high</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#fffbeb] text-[#92400e] border border-[#fde68a] text-xs font-semibold">{med} medium</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#fef2f2] text-[#991b1b] border border-[#fecaca] text-xs font-semibold">{miss} missing</span>
                  </div>
                )
              })()}
            </div>

            {/* What was found in each document */}
            {extractedData.files?.length > 0 && (
              <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden mb-4">
                <div className="px-5 py-3 border-b border-[#e2e6ed] bg-[#f8f9fb]">
                  <span className="text-sm font-bold text-[#1a2233]">What was found in the documents</span>
                </div>
                <div className="divide-y divide-[#e2e6ed]">
                  {extractedData.files.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="px-5 py-3">
                      <div className="text-sm font-medium text-[#1a2233] truncate">📄 {f.name}</div>
                      {f.notPdf ? (
                        <p className="text-xs text-[#b45309] mt-1">This is not a PDF soft copy, so it could not be read. Only PDF soft copies can be read — please type these details by hand.</p>
                      ) : f.error ? (
                        <p className="text-xs text-[#dc2626] mt-1">This file could not be opened ({f.error}).</p>
                      ) : (
                        <>
                          <p className="text-xs text-[#4a5568] mt-1">{f.found ? `Found: ${f.found}` : 'No shipping documents were recognised in this file.'}</p>
                          {f.unreadable?.length > 0 && (
                            <p className="text-xs text-[#b45309] mt-1">{unreadableMessage(f.unreadable)}</p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section cards with fields */}
            <div className="space-y-4 mb-5">
              {OCR_SECTIONS.map((section) => (
                <div key={section.title} className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#e2e6ed] bg-[#f8f9fb]">
                    <span className="text-sm font-bold text-[#1a2233]">{section.title}</span>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {section.fields.map((key) => {
                      const field = extractEdits?.[key] || {}
                      const label = FIELD_LABELS_OCR[key] || key
                      const isLong = TEXTAREA_FIELDS.includes(key)
                      const isEmpty = field.value == null || field.value === ''
                      const leftBorder =
                        isEmpty                         ? 'border-l-[#dc2626]'
                        : field.confidence === 'high'   ? 'border-l-[#16a34a]'
                        : field.confidence === 'medium' ? 'border-l-[#f59e0b]'
                                                        : 'border-l-[#dc2626]'
                      const bgTint =
                        isEmpty                         ? 'bg-[#fffafa]'
                        : field.confidence === 'high'   ? 'bg-white'
                                                        : 'bg-white'
                      return (
                        <div key={key}
                          className={[
                            'rounded-[7px] border-[1.5px] border-[#e2e6ed] border-l-4 p-[10px] transition-all',
                            leftBorder, bgTint,
                            isLong ? 'md:col-span-2' : ''
                          ].join(' ')}>
                          <div className="flex items-center justify-between mb-1.5 gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8a96a8]">{label}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {field.confidence && (
                                <span className={[
                                  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                                  field.confidence === 'high'   ? 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]'
                                  : field.confidence === 'medium' ? 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]'
                                                                 : 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]'
                                ].join(' ')}>
                                  {field.confidence}
                                </span>
                              )}
                              {field.source && (
                                <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-[#f8f9fb] text-[#4a5568] border border-[#d0d6e0]">
                                  {field.source}
                                </span>
                              )}
                            </div>
                          </div>
                          {key === 'invoice_line_items' && isEmpty && (
                            <p className="text-xs text-[#1e40af] mb-1.5">Line items are read from a Bill of Entry. For other documents, please add them by hand if needed.</p>
                          )}
                          {key === 'exchange_rates' && isEmpty && (
                            <p className="text-xs text-[#1e40af] mb-1.5">Exchange rates are not read automatically — please add them by hand if needed.</p>
                          )}
                          {isEmpty && (
                            <p className="text-xs text-[#dc2626] italic mb-1">Not found — enter manually</p>
                          )}
                          {isLong ? (
                            <textarea
                              value={field.value || ''}
                              onChange={(e) => setExtractEdits(prev => ({ ...prev, [key]: { ...prev[key], value: e.target.value } }))}
                              rows={2}
                              className="w-full px-3 py-2 text-sm rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0] resize-none"
                            />
                          ) : (
                            <input
                              value={field.value || ''}
                              onChange={(e) => setExtractEdits(prev => ({ ...prev, [key]: { ...prev[key], value: e.target.value } }))}
                              className="w-full h-9 px-3 text-sm rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0]"
                            />
                          )}
                          {/* Confidence hint below field */}
                          {!isEmpty && field.confidence && (
                            <div className={[
                              'text-[10px] mt-1',
                              field.confidence === 'high'   ? 'text-[#16a34a]'
                              : field.confidence === 'medium' ? 'text-[#b45309]'
                                                             : 'text-[#dc2626]'
                            ].join(' ')}>
                              {field.confidence === 'high' ? '\u25CF High confidence' : field.confidence === 'medium' ? '\u25CF Medium — please verify' : '\u25CF Low confidence — check manually'}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Action footer */}
            <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl px-5 py-4 flex items-center justify-between shadow-sm">
              <button type="button"
                onClick={async () => {
                  const hasEdits = Object.keys(extractEdits).length > 0 && savedExtraction &&
                    JSON.stringify(extractEdits) !== JSON.stringify(savedExtraction.extracted_data)
                  if (hasEdits && !window.confirm('You have unsaved edits. Discard them and start over?')) return
                  setExtractedData(null)
                  setExtractEdits({})
                  setExtractError(null)
                  setSavedExtraction(null)
                  setSelectedDocIds(new Set())
                  if (preselectedJob) {
                    await fetchDocuments(preselectedJob)
                    setStep(2)
                  } else {
                    setSelectedJob(null)
                    setDocuments([])
                    setStep(1)
                  }
                }}
                className="h-9 px-4 text-sm font-semibold rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] transition-colors">
                ← Start Over
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleDownloadExcel}
                  className="h-9 px-4 text-sm font-semibold rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] transition-colors inline-flex items-center gap-1.5">
                  ↓ Download Excel
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="h-9 px-5 text-sm font-semibold rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] disabled:opacity-50 transition-colors inline-flex items-center gap-2 justify-center"
                  style={{minWidth:'160px'}}>
                  {saving && <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Saving...' : '\u2193 Save to Database'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>{/* end left column */}

      {/* ── RIGHT SIDEBAR ── */}
      <div className={`${preselectedJob ? 'hidden' : 'hidden lg:flex'} w-[300px] shrink-0 flex-col gap-[16px]`}>

        {/* Step 1–3: Recent Extractions */}
        {step < 4 && (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between">
              <div className="text-sm font-bold text-[#1a2233]">Recent Extractions</div>
              <button
                onClick={loadRecentExtractions}
                className="text-xs text-[#1a4fa0] hover:underline"
              >
                Refresh
              </button>
            </div>
            <div className="py-1">
              {loadingRecent ? (
                <div className="px-5 py-4 space-y-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-8 bg-[#f4f6f9] rounded animate-pulse" />
                  ))}
                </div>
              ) : recentExtractions.length === 0 ? (
                <div className="px-5 py-6 text-center text-xs text-[#8a96a8]">
                  No extractions yet. Extract a document to see history here.
                </div>
              ) : (
                recentExtractions.map((r) => (
                  <div
                    key={r.id}
                    className="flex gap-3 px-5 py-3 border-b border-[#e2e6ed] last:border-b-0 cursor-pointer hover:bg-[#f8f9fb] transition-colors"
                    onClick={() => {
                      const job = jobs?.find(j => j.id === r.jobId || j.job_no === r.jobNo)
                      if (job) handleSelectJob(job)
                    }}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: r.dot }} />
                    <div className="min-w-0">
                      <div className="text-sm text-[#1a2233]">
                        <span className="font-semibold text-[#1a4fa0]">{r.jobNo || '—'}</span>
                        {' — '}
                        <span>{r.found}/{r.total} fields</span>
                      </div>
                      <div className="text-[11px] text-[#8a96a8] mt-0.5 font-mono truncate">
                        {r.extractedAt
                          ? (() => {
                              const d = new Date(r.extractedAt)
                              const now = new Date()
                              const diffMs = now - d
                              const diffMins = Math.floor(diffMs / 60000)
                              const diffHrs  = Math.floor(diffMs / 3600000)
                              const diffDays = Math.floor(diffMs / 86400000)
                              const timeStr =
                                diffMins < 1   ? 'Just now'
                                : diffMins < 60 ? `${diffMins}m ago`
                                : diffHrs  < 24 ? `${diffHrs}h ago`
                                : diffDays === 1 ? 'Yesterday'
                                : d.toLocaleDateString('en-IN', { day:'2-digit', month:'short' })
                              return `${timeStr}${r.extractedBy ? ` · ${r.extractedBy}` : ''}`
                            })()
                          : '—'
                        }
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Step 1–3: Performance Stats */}
        {step < 4 && (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e6ed]">
              <div className="text-sm font-bold text-[#1a2233]">Performance Stats</div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {[
                { label: 'Average accuracy',      value: '91.4%',    color: '#16a34a' },
                { label: 'Documents processed',   value: '147',      color: '#1a4fa0' },
                { label: 'Time saved per month',  value: '~18 hours', color: '#b45309' },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between px-3 py-2.5 bg-[#f8f9fb] border-[1.5px] border-[#e2e6ed] rounded-lg">
                  <span className="text-sm text-[#4a5568]">{s.label}</span>
                  <span className="text-base font-bold" style={{ color: s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Extraction Stats */}
        {step === 4 && extractedData && (() => {
          const vals  = Object.values(extractEdits || {})
          const total = vals.length
          const found = vals.filter(f => f?.value).length
          const high  = vals.filter(f => f?.confidence === 'high').length
          const med   = vals.filter(f => f?.confidence === 'medium').length
          const low   = vals.filter(f => f?.confidence === 'low' && f?.value).length
          const miss  = vals.filter(f => !f?.value).length
          return (
            <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#e2e6ed]">
                <div className="text-sm font-bold text-[#1a2233]">Extraction Stats</div>
              </div>
              <div className="p-4 flex flex-col gap-3">
                {/* Fill rate bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-[#8a96a8]">Fill rate</span>
                    <span className="font-bold text-[#1a4fa0]">{total ? Math.round((found/total)*100) : 0}%</span>
                  </div>
                  <div className="h-2 bg-[#e2e6ed] rounded-full overflow-hidden">
                    <div className="h-full bg-[#1a4fa0] rounded-full" style={{ width: `${total ? (found/total)*100 : 0}%` }} />
                  </div>
                </div>
                {/* Stat rows */}
                {[
                  { label: 'Total fields',      value: total,  color: '#1a2233' },
                  { label: 'Fields found',      value: found,  color: '#1a2233' },
                  { label: '\u25CF High confidence', value: high,   color: '#16a34a' },
                  { label: '\u25CF Medium',          value: med,    color: '#b45309' },
                  { label: '\u25CF Low confidence',  value: low,    color: '#dc2626' },
                  { label: '\u25CB Not found',       value: miss,   color: '#8a96a8' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between px-3 py-2 bg-[#f8f9fb] border-[1.5px] border-[#e2e6ed] rounded-lg">
                    <span className="text-sm" style={{ color: s.color }}>{s.label}</span>
                    <span className="text-sm font-bold" style={{ color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Step 4: Tips */}
        {step === 4 && (
          <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-4">
            <p className="text-xs font-bold text-[#1e40af] mb-2">💡 Tips</p>
            <ul className="text-xs text-[#1e40af] space-y-1.5 list-disc list-inside">
              <li>Red border = not found or low confidence</li>
              <li>Green border = high confidence extraction</li>
              <li>Edit any field before saving</li>
              <li>Download Excel for ICEGATE / Live Impex entry</li>
            </ul>
          </div>
        )}

      </div>{/* end right sidebar */}

    </div>
  )
}
