import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { STAGE_NAMES } from '../utils/jobHelpers'
import { linkContainer } from '../api/trackingApi'

const MODES = ['Sea FCL', 'Sea LCL', 'Air', 'BPT/MBPT']
const PRIORITIES = ['normal', 'high', 'urgent']
const RMS_STATUSES = ['pending', 'rms', 'apr', 'acl', 'check', 'hold']
const BG_OPTIONS = ['no', 'yes', '100percent']
const SHIPPING_LINES = [
  'Maersk', 'MSC', 'Hapag-Lloyd', 'CMA-CGM', 'Evergreen',
  'ONE', 'OOCL', 'COSCO', 'ZIM', 'HMM', 'Yang Ming', 'Other',
]
const DETENTION_RISKS = ['low', 'medium', 'high']

const INITIAL_FORM = {
  job_no: '',
  client: '',
  mode: 'Sea FCL',
  goods: '',
  priority: 'normal',
  assigned_to: '',
  bl_no: '',
  containers: '',
  carrier: '',
  vessel: '',
  eta: '',
  cfs_name: '',
  cfs_amount: '',
  be_no: '',
  hs_code: '',
  rms_status: 'pending',
  bg_required: 'no',
  destination: '',
  free_days: '14',
  detention_risk: 'low',
  stage: '0',
  delay_reason: '',
  notes: '',
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
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
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
    navigate('/admin')
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    if (!user?.id) {
      setError('You must be logged in to create a job.')
      setSaving(false)
      return
    }

    const payload = {
      job_no: `J-${form.job_no.trim()}`,
      client: form.client.trim(),
      mode: form.mode,
      goods: form.goods.trim() || null,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      bl_no: form.bl_no.trim() || null,
      containers: form.containers.trim() || null,
      shipping_line: form.carrier || null,
      vessel: form.vessel.trim() || null,
      eta: form.eta || null,
      cfs_name: form.cfs_name.trim() || null,
      cfs_amount: form.cfs_amount !== '' ? Number(form.cfs_amount) : null,
      be_no: form.be_no.trim() || null,
      hs_code: form.hs_code.trim() || null,
      rms_status: form.rms_status,
      bg_required: form.bg_required,
      destination: form.destination.trim() || null,
      free_days: form.free_days !== '' ? Number(form.free_days) : 14,
      detention_risk: form.detention_risk,
      stage: Number(form.stage),
      delay_reason: form.delay_reason.trim() || null,
      notes: form.notes.trim() || null,
      created_by: user.id,
    }

    const { data: insertedJob, error: insertError } = await supabase
      .from('jobs')
      .insert(payload)
      .select()
      .single()

    if (insertError) {
      setSaving(false)
      setError(insertError.message || 'Failed to create job. Please try again.')
      return
    }

    const jobId = insertedJob.id
    const jobNo = payload.job_no

    if (stagedDocs.length > 0) {
      setUploadingDocs(true)
      await Promise.allSettled(stagedDocs.map(async (item) => {
        try {
          const sanitized = item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          const filePath = `${jobId}/${Date.now()}_${sanitized}`
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

    if (form.containers.trim()) {
      if (!form.carrier) {
        setError('Shipping Line is required when containers are specified.')
        setSaving(false)
        return
      }
      const containerList = form.containers.trim().split(/[\s,;]+/).filter(Boolean)
      await Promise.allSettled(containerList.map((cn) =>
        linkContainer(cn.toUpperCase(), jobId, jobNo, form.carrier).catch(() => {})
      ))
    }

    setSaving(false)

    if (onCreated) {
      onCreated()
      return
    }
    navigate('/admin')
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
                <input
                  type="text"
                  required
                  value={form.client}
                  onChange={set('client')}
                  className={inputClass}
                />
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

              <Field label="Goods Description">
                <input
                  type="text"
                  value={form.goods}
                  onChange={set('goods')}
                  className={inputClass}
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

              <Field label="Assign To">
                <select value={form.assigned_to} onChange={set('assigned_to')} className={inputClass}>
                  <option value="">Unassigned</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>

              <SectionHeading>Shipment Details</SectionHeading>

              <Field label="BL Number">
                <input type="text" value={form.bl_no} onChange={set('bl_no')} className={inputClass} />
              </Field>

              <Field label="Carrier / Shipping Line">
                <select value={form.carrier} onChange={set('carrier')} className={inputClass}>
                  <option value="">Select shipping line</option>
                  {SHIPPING_LINES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>

              <Field label="Container Numbers">
                <input
                  type="text"
                  value={form.containers}
                  onChange={set('containers')}
                  className={inputClass}
                  placeholder="Comma-separated"
                />
              </Field>

              <Field label="Vessel / Flight">
                <input type="text" value={form.vessel} onChange={set('vessel')} className={inputClass} />
              </Field>

              <Field label="ETA">
                <input type="date" value={form.eta} onChange={set('eta')} className={inputClass} />
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
                <input type="text" value={form.be_no} onChange={set('be_no')} className={inputClass} />
              </Field>

              <Field label="HS Code">
                <input type="text" value={form.hs_code} onChange={set('hs_code')} className={inputClass} />
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

              <SectionHeading>Notes</SectionHeading>

              <div className="md:col-span-2">
                <Field label="Notes">
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={set('notes')}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>

            <div className="mt-8 border-t border-gray-200 pt-6">
              <SectionHeading>Documents (Optional)</SectionHeading>
              <p className="text-sm text-gray-500 mb-4">Attach shipping documents to this job</p>

              {stagedDocs.length === 0 ? (
                <p className="text-sm text-gray-400 italic mb-4">No documents added yet</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {stagedDocs.map((item) => {
                    const isPdf = item.file.name.toLowerCase().endsWith('.pdf')
                    return (
                      <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-md px-3 py-2">
                        <span className={`text-xs font-bold ${isPdf ? 'text-red-500' : 'text-green-500'}`}>
                          {isPdf ? 'PDF' : 'IMG'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{item.file.name}</p>
                          <p className="text-xs text-gray-500">{formatFileSize(item.file.size)}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${DOC_TYPE_COLORS[item.docType] || 'bg-slate-100 text-slate-800'}`}>
                          {item.docType}
                        </span>
                        <button type="button" onClick={() => setStagedDocs((prev) => prev.filter((d) => d.id !== item.id))}
                          className="text-gray-400 hover:text-red-600 transition-colors text-lg leading-none">&times;</button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <div className="w-44">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
                  <select value={addDocType} onChange={(e) => setAddDocType(e.target.value)} className={inputClass}>
                    <option value="">Select...</option>
                    {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
                  <input id="doc-file-input" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleAddDocFile} className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:text-sm file:font-medium file:border file:border-gray-300 file:rounded-md file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100" />
                </div>
                <button type="button" onClick={handleAddDoc}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-70">
                  Add
                </button>
              </div>
              {addDocError && <p className="text-xs text-red-600 mt-1">{addDocError}</p>}
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
