import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { STAGE_NAMES } from '../utils/jobHelpers'
import { PORTS } from '../utils/ports'
import { CLIENT_NAMES } from '../utils/clients'
import { boxOwnerHint } from '../../supabase/functions/_shared/portal/shippingLines.js'
import { availableTypes, docTypeLabel } from '../utils/docTypes'
// reading a BL, the checks and the save are shared with the portal's New job sheet
import {
  MODES, HAS_BOXES, SHIPPING_LINES, INITIAL_FORM, sizesFor, defaultSize,
  applyModeChange, guessDocType, extractFromPdf, validateJobForm, createJob,
} from '../services/newJob'

const PRIORITIES = ['normal', 'high', 'urgent']
const RMS_STATUSES = ['pending', 'rms', 'apr', 'acl', 'check', 'hold']
const BG_OPTIONS = ['no', 'yes', '100percent']
const DETENTION_RISKS = ['low', 'medium', 'high']

const CLIENT_LIST = CLIENT_NAMES

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

export default function CreateJob({ isModal = false, onCancel, onCreated, initialFilePath = null, initialFile = null }) {
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
    setForm((prev) => (field === 'mode' ? applyModeChange(prev, value) : { ...prev, [field]: value }))
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
    setExtractProgress(0)
    setExtractStatus('Reading document...')

    try {
      // Documents are read from the text inside the PDF, on this computer.
      // No AI and nothing is sent anywhere. (services/newJob.js)
      const res = await extractFromPdf(file, form, (pct, status) => { setExtractProgress(pct); setExtractStatus(status) })
      if (res.kind === 'not_pdf') {
        setExtractedFields({ _error: true, _message: res.message })
        return
      }
      if (res.kind === 'error') {
        setExtractedFields({ _error: true })
        setExtractProgress(0)
        setExtractStatus('')
        return
      }
      const inside = res.foundInside
      setStagedDocs(prev => prev.map(d => d.id === docId ? { ...d, foundInside: inside } : d))

      if (res.kind === 'irrelevant') {
        setStagedDocs(prev => prev.map(d => d.id === docId ? { ...d, irrelevant: true } : d))
        setExtractedFields({ _irrelevant: true, _unreadable: res.unreadable, _found: res.parsed._found })
        return
      }

      if (res.kind === 'mismatch') {
        setStagedDocs(prev => prev.map(d => d.id === docId ? { ...d, mismatch: true } : d))
        setExtractedFields({ _mismatch: true, _docBoxes: res.docBoxes, _haveBoxes: res.haveBoxes })
        return
      }

      setExtractedFields(res.parsed)
      setForm(prev => ({ ...prev, ...res.updates }))
      setStagedDocs(prev => prev.map(d => d.id === docId ? { ...d, extracted: true } : d))
      setAutoFillApplied(prev => ({ ...prev, ...res.applied }))
      setExtractProgress(100)
      setExtractStatus('Done!')

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
  // private storage and read here, exactly like a file chosen with Upload.
  // initialFile: a file already in hand (dropped on the portal's New job sheet).
  const fileFromBotDone = useRef(false)
  useEffect(() => {
    if ((!initialFilePath && !initialFile) || fileFromBotDone.current) return
    fileFromBotDone.current = true
    ;(async () => {
      let file = initialFile
      if (!file) {
        const { data: blob, error } = await supabase.storage.from('job-documents').download(initialFilePath)
        if (error || !blob) { setAddDocError(`Could not open the file sent on WhatsApp: ${error?.message || 'not found'}`); return }
        const name = initialFilePath.split('/').pop().replace(/^\d+_/, '')
        file = new File([blob], name, { type: blob.type || 'application/pdf' })
      }
      const docType = guessDocType(file.name)
      const docId = Date.now()
      setStagedDocs((prev) => [...prev, { file, docType, id: docId, extracted: false, irrelevant: false }])
      await handleQuickExtract(file, docType, docId)
    })()
  }, [initialFilePath, initialFile]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    if (!user?.id) {
      setError('You must be logged in to create a job.')
      setSaving(false)
      return
    }

    const invalid = validateJobForm(form)
    if (invalid) {
      setError(invalid)
      setSaving(false)
      return
    }

    const res = await createJob(form, stagedDocs, { user, profile, onUploading: setUploadingDocs })
    if (!res.ok) {
      setError(res.error)
      setSaving(false)
      return
    }
    setSaving(false)

    if (onCreated) {
      onCreated()
      return
    }
    navigate(profile?.role === 'field_ops' ? '/field' : '/admin')
  }

  const lastRow = form.containers[form.containers.length - 1]
  const canAddRow = !lastRow || (lastRow.no.trim().length >= 4 && (form.mode !== 'Sea FCL' || lastRow.size !== ''))
  useEffect(() => { if (canAddRow) setShowRowWarning(false) }, [canAddRow])
  const handleAddRow = () => {
    if (!canAddRow) { setShowRowWarning(true); return }
    setShowRowWarning(false)
    setForm(p => ({ ...p, containers: [...p.containers, { no: '', size: defaultSize(p.mode) }] }))
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
                        {availableTypes(usedTypes(item.id), item.docType).map(t => <option key={t} value={t}>{docTypeLabel(t)}</option>)}
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
                    {availableTypes(usedTypes()).map(t => <option key={t} value={t}>{docTypeLabel(t)}</option>)}
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
              {extractedFields?._mismatch && (
                <div className="mt-3 bg-amber-50 rounded-lg border border-amber-200 p-3">
                  <p className="text-xs font-semibold text-amber-700">
                    ⚠ This document looks like a different shipment: its containers ({extractedFields._docBoxes.join(', ')}) are not this job's ({extractedFields._haveBoxes.join(', ')}). Nothing was filled from it. Please check it is the right document.
                  </p>
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
                <select value={form.mode} onChange={set('mode')} className={inputClass} required>
                  <option value="" disabled>Select mode</option>
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
                {form.mode === 'Sea FCL' && boxOwnerHint(form.containers) && (
                  <p className="mt-1 text-xs text-gray-500">
                    Hint: the boxes belong to {boxOwnerHint(form.containers)}. That is who owns them, not always the line on the BL, so check the BL.
                  </p>
                )}
              </Field>

              {/* Containers — rows for sea jobs (required), notice for others */}
              {HAS_BOXES(form.mode) ? (
                <div className="col-span-full">
                  <label className={labelClass}>Containers <span className="text-red-500">*</span>{form.mode === 'Sea LCL' && <span className="font-normal text-gray-400"> (the consolidation container)</span>}</label>
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
                                {sizesFor(form.mode).map(s => <option key={s} value={s}>{s}</option>)}
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
              ) : form.mode === 'Air' ? (
                <Field label="Containers">
                  <p className="text-sm text-gray-400 italic">Air — container numbers not applicable. Enter AWB number in BL field.</p>
                </Field>
              ) : form.mode === 'BPT/MBPT' ? (
                <Field label="Containers">
                  <p className="text-sm text-gray-400 italic">BPT/MBPT — container numbers not applicable.</p>
                </Field>
              ) : (
                <Field label="Containers">
                  <p className="text-sm text-gray-500">
                    {form.containers.some(c => String(c.no || '').trim())
                      ? `${form.containers.filter(c => String(c.no || '').trim()).length} container(s) found in the document. Select the mode above to see them.`
                      : 'Select the mode above first.'}
                  </p>
                </Field>
              )}

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

              <Field label="Free Days" required>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  required
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
