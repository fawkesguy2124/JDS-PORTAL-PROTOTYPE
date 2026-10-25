import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import DocumentsMobile from './mobile/DocumentsMobile'
import DocumentsDesktop from './desktop/DocumentsDesktop'

import { availableTypes } from '../utils/docTypes'
import { vesselFromBl } from '../services/blVessel'
import { downloadDoc, useDocUrl } from '../services/docFiles'
import PdfPreview from './PdfPreview'
import { cachedDocs, keepDocs, loadDocs } from '../services/docCache'

function DocumentsSection({ jobs, profiles, currentUserName, showToast, initialExpandJobId, onExpandConsumed }) {
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  // shown at once from the list loaded in the background (docCache), then refreshed
  const [documents, setDocuments] = useState(() => cachedDocs() || [])
  const [loadingDocs, setLoadingDocs] = useState(() => !cachedDocs())
  const [expandedJobId, setExpandedJobId] = useState(null)
  const [uploadModal, setUploadModal] = useState({ open: false, job: null })
  const [previewModal, setPreviewModal] = useState({ open: false, doc: null })
  // the files are private: the preview uses a 1-hour link made for this user
  const previewUrl = useDocUrl(previewModal.open ? previewModal.doc : null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadDocType, setUploadDocType] = useState('BL')
  const [uploadFile, setUploadFile] = useState(null)
  const [docSearch, setDocSearch] = useState('')
  const fileInputRef = useRef(null)
  const uploadIntervalRef = useRef(null)

  useEffect(() => {
    return () => {
      if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current)
    }
  }, [])

  useEffect(() => {
    if (!initialExpandJobId) return
    setExpandedJobId(initialExpandJobId)
    onExpandConsumed?.()
    const timer = setTimeout(() => {
      const el = document.getElementById(`doc-job-${initialExpandJobId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
    return () => clearTimeout(timer)
  }, [initialExpandJobId])

  const DOC_TYPE_COLORS = {
    BL: 'bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]',
    Invoice: 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]',
    'Packing List': 'bg-[#f0fdfa] text-[#0f766e] border border-[#99f6e4]',
    COO: 'bg-[#f5f3ff] text-[#5b21b6] border border-[#ddd6fe]',
    Insurance: 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]',
    BE: 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]',
    'Examination Order': 'bg-[#fff7ed] text-[#c2410c] border border-[#fed7aa]',
    OOC: 'bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]',
    'E-Way Bill': 'bg-[#eef2ff] text-[#3730a3] border border-[#c7d2fe]',
    POD: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]',
    Other: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]',
  }

  useEffect(() => {
    let mounted = true
    loadDocs().then(({ data }) => {
      if (!mounted) return
      if (data) setDocuments(data)
      setLoadingDocs(false)
    })
    return () => { mounted = false }
  }, [])
  // uploads and deletes keep the shared list current too
  useEffect(() => { if (!loadingDocs) keepDocs(documents) }, [documents, loadingDocs])

  const accordionItems = useMemo(() => {
    const docMap = {}
    documents.forEach((d) => {
      if (!docMap[d.job_id]) docMap[d.job_id] = []
      docMap[d.job_id].push(d)
    })
    let items = (jobs || []).map((j) => ({ ...j, docs: docMap[j.id] || [] }))
    const q = docSearch.trim().toLowerCase()
    if (q) {
      items = items.filter((j) => {
        if ((j.job_no || '').toLowerCase().includes(q)) return true
        if ((j.client || '').toLowerCase().includes(q)) return true
        return j.docs.some((d) => (d.file_name || '').toLowerCase().includes(q) || (d.doc_type || '').toLowerCase().includes(q))
      })
    }
    items.sort((a, b) => {
      const aHas = a.docs.length > 0 ? 0 : 1
      const bHas = b.docs.length > 0 ? 0 : 1
      if (aHas !== bHas) return aHas - bHas
      const na = parseInt((a.job_no || '').replace(/\D/g, '')) || 0
      const nb = parseInt((b.job_no || '').replace(/\D/g, '')) || 0
      return nb - na
    })
    return items
  }, [jobs, documents, docSearch])

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return '\u2014'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const sanitizeFilename = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_')

  // Types this job already has are not offered again (except Other)
  const jobTypes = uploadModal.job ? documents.filter((d) => d.job_id === uploadModal.job.id).map((d) => d.doc_type) : []
  const typeOptions = availableTypes(jobTypes)
  const docType = typeOptions.includes(uploadDocType) ? uploadDocType : typeOptions[0]

  const handleUpload = async () => {
    if (!uploadFile || !docType || !uploadModal.job) return
    setUploading(true)
    setUploadProgress(0)
      const sim = setInterval(() => setUploadProgress((p) => Math.min(p + 8, 85)), 250)
      uploadIntervalRef.current = sim
    try {
      const job = uploadModal.job
      const safeName = sanitizeFilename(uploadFile.name)
      const filePath = `${job.id}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage.from('job-documents').upload(filePath, uploadFile, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('job-documents').getPublicUrl(filePath)
      const { error: insErr } = await supabase.from('documents').insert({
        job_id: job.id,
        job_no: job.job_no || '',
        file_name: uploadFile.name,
        file_type: uploadFile.name.split('.').pop(),
        doc_type: docType,
        file_url: publicUrl,
        file_path: filePath,
        uploaded_by: user?.id || null,
        uploaded_by_name: profile?.name || currentUserName,
        file_size: uploadFile.size,
        created_at: new Date().toISOString(),
      })
      if (insErr) throw insErr
      // a BL on a job with no ship yet: save the ship name from it, so the
      // Vessels page can follow the ship from the pre-alert (never overwrites)
      if (docType === 'BL' && !job.vessel) {
        try {
          const vessel = await vesselFromBl(uploadFile)
          if (vessel) {
            const { data: upd } = await supabase.from('jobs').update({ vessel }).eq('id', job.id).is('vessel', null).select('id')
            if (upd?.length) showToast(`Ship name saved from the BL: ${vessel}`, 'success')
          }
        } catch (e) { console.warn('[Documents] could not read the ship name from the BL:', e?.message) }
      }
      clearInterval(sim)
      setUploadProgress(100)
      showToast('Document uploaded successfully.', 'success')
      setUploadModal({ open: false, job: null })
      setUploadFile(null)
      setUploadDocType('BL')
      const { data: newDocs } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
      setDocuments(newDocs ?? [])
      try {
        await supabase.from('activity_log').insert({
          type: 'document_upload',
          action: 'document_upload',
          title: `${job.job_no} — ${docType} uploaded`,
          note: `${uploadFile.name} uploaded by ${profile?.name || currentUserName}`,
          job_no: job.job_no,
          job_id: job.id,
          done_by: user?.id || null,
          done_by_name: profile?.name || currentUserName,
          user_name: profile?.name || currentUserName,
          meta: { job_id: job.id, job_no: job.job_no, file_name: uploadFile.name, doc_type: docType },
          created_at: new Date().toISOString(),
        })
      } catch (logErr) {
        console.warn('[Documents] activity_log insert failed:', logErr.message)
      }
    } catch (e) {
      clearInterval(sim)
      setUploadProgress(0)
      showToast(e?.message || 'Upload failed.', 'error')
    } finally {
      setTimeout(() => {
        setUploading(false)
        setUploadProgress(0)
      }, 600)
    }
  }

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.file_name}"?`)) return
    try {
      if (doc.file_path) {
        const { error: storageErr } = await supabase.storage
          .from('job-documents')
          .remove([doc.file_path])
        if (storageErr) {
          console.warn('[Documents] Storage delete failed:', storageErr.message)
        }
      }
      const { error: dbErr } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id)
      if (dbErr) throw dbErr
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
      showToast('Document deleted.', 'success')
    } catch (e) {
      showToast(e?.message || 'Delete failed.', 'error')
    }
  }

  const btnBase = 'h-8 px-3 text-xs rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const selectBase = 'w-full h-9 px-3 text-xs rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#4a5568] outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#e8eef8]'

  return (
    <div>
      {/* Mobile view */}
      <div className="block md:hidden">
        <DocumentsMobile
          jobs={jobs}
          documents={documents}
          expandedJobId={expandedJobId}
          setExpandedJobId={setExpandedJobId}
          onUpload={(job) => setUploadModal({ open: true, job })}
          onPreview={(doc) => setPreviewModal({ open: true, doc })}
          onDownload={(doc) => downloadDoc(doc).catch((e) => showToast?.(`Could not download: ${e.message}`, 'error'))}
          onDelete={handleDelete}
          isAdmin={isAdmin}
          docSearch={docSearch}
          setDocSearch={setDocSearch}
        />
      </div>

      {/* Desktop view */}
      <div className="hidden md:block">
        <DocumentsDesktop
          accordionItems={accordionItems}
          expandedJobId={expandedJobId}
          setExpandedJobId={setExpandedJobId}
          onUpload={(job) => setUploadModal({ open: true, job })}
          onPreview={(doc) => setPreviewModal({ open: true, doc })}
          onDownload={(doc) => downloadDoc(doc).catch((e) => showToast?.(`Could not download: ${e.message}`, 'error'))}
          onDelete={handleDelete}
          isAdmin={isAdmin}
          userId={user?.id}
          docSearch={docSearch}
          setDocSearch={setDocSearch}
          loadingDocs={loadingDocs}
        />
      </div>

      {/* Upload Modal — shared */}
      {uploadModal.open && uploadModal.job && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-[#e2e6ed] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between">
              <div className="text-sm font-semibold text-[#1a2233]">Upload Document — {uploadModal.job.job_no} {uploadModal.job.client}</div>
              <button type="button" onClick={() => { setUploadModal({ open: false, job: null }); setUploadFile(null); setUploadDocType('BL'); setUploadProgress(0) }}
                className="h-8 w-8 flex items-center justify-center rounded-lg bg-white border border-[#e2e6ed] hover:bg-[#fef2f2] hover:border-[#fecaca] hover:text-[#dc2626] text-[#8a96a8] transition-colors text-lg leading-none">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#8a96a8] uppercase tracking-wide mb-1">Document Type</label>
                <select value={docType} onChange={(e) => setUploadDocType(e.target.value)} className={selectBase}>
                  {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#8a96a8] uppercase tracking-wide mb-1">File</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-400', 'bg-blue-50') }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50') }}
                  onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50'); const f = e.dataTransfer?.files?.[0]; if (!f) return; const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']; const validExts = ['.pdf', '.jpg', '.jpeg', '.png']; const ext = '.' + f.name.split('.').pop().toLowerCase(); if (!validTypes.includes(f.type) && !validExts.includes(ext)) { showToast('Unsupported file type. Use PDF, JPG, or PNG.', 'error'); return } if (f.size > 10 * 1024 * 1024) { showToast('File size must be under 10MB.', 'error'); return } setUploadFile(f) }}
                  className={`border-2 border-dashed rounded-xl px-4 py-8 text-center cursor-pointer transition-colors ${uploadFile ? 'border-green-300 bg-green-50' : 'border-[#d0d6e0] hover:border-blue-300'}`}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 10 * 1024 * 1024) { showToast('File size must be under 10MB.', 'error') } else { setUploadFile(f) } } }} className="hidden" />
                  {uploadFile ? (
                    <div>
                      <p className="text-sm font-semibold text-[#1a2233] break-all">{uploadFile.name}</p>
                      <p className="text-xs text-[#8a96a8] mt-1">{formatFileSize(uploadFile.size)}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-[#8a96a8]">Click to select or drag & drop</p>
                      <p className="text-xs text-[#8a96a8] mt-1">PDF, JPG, PNG — max 10MB</p>
                    </div>
                  )}
                </div>
              </div>
              {uploading && (
                <div>
                  <div className="h-1.5 bg-[#e2e6ed] border border-[#e2e6ed] rounded-full overflow-hidden">
                    <div className="h-full bg-[#1a4fa0] rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-[#e2e6ed] flex items-center justify-end gap-2">
              <button type="button" onClick={() => { setUploadModal({ open: false, job: null }); setUploadFile(null); setUploadDocType('BL'); setUploadProgress(0) }}
                className={`${btnBase} bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8]`}>
                Cancel
              </button>
              <button type="button" onClick={handleUpload} disabled={uploading || !uploadFile || !docType}
                className={`${btnBase} bg-[#1a4fa0] text-white hover:bg-[#153d82] inline-flex items-center gap-2`}>
                {uploading && <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {uploading ? `${uploadProgress}%` : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal — shared */}
      {previewModal.open && previewModal.doc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-2xl border border-[#e2e6ed] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-[#1a2233] truncate">{previewModal.doc.file_name}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${DOC_TYPE_COLORS[previewModal.doc.doc_type] || 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]'}`}>{previewModal.doc.doc_type}</span>
              </div>
              <button type="button" onClick={() => setPreviewModal({ open: false, doc: null })}
                className="h-8 w-8 flex items-center justify-center rounded-lg bg-white border border-[#e2e6ed] hover:bg-[#fef2f2] hover:border-[#fecaca] hover:text-[#dc2626] text-[#8a96a8] transition-colors text-lg leading-none shrink-0">✕</button>
            </div>
            <div className="flex-1 overflow-auto bg-[#f4f6f9] p-4 flex items-center justify-center min-h-[300px]">
              {['pdf'].includes((previewModal.doc.file_type || '').toLowerCase()) ? (
                <PdfPreview doc={previewModal.doc} />
              ) : ['jpg', 'jpeg', 'png'].includes((previewModal.doc.file_type || '').toLowerCase()) ? (
                !previewUrl ? <p className="text-sm text-[#8a96a8]">Opening…</p> : <img src={previewUrl} alt={previewModal.doc.file_name} className="max-w-full max-h-[600px] rounded-lg shadow-sm object-contain" />
              ) : (
                <div className="text-center text-[#8a96a8]">
                  <p className="text-sm font-semibold">Preview not available</p>
                  <p className="text-xs mt-1">This file type cannot be previewed.</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-[#e2e6ed] flex items-center justify-end gap-2 shrink-0">
              <button type="button" onClick={() => downloadDoc(previewModal.doc).catch((e) => showToast?.(`Could not download: ${e.message}`, 'error'))}
                className={`${btnBase} bg-[#1a4fa0] text-white hover:bg-[#153d82] no-underline inline-flex items-center`}>
                Download
              </button>
              <button type="button" onClick={() => setPreviewModal({ open: false, doc: null })}
                className={`${btnBase} bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8]`}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DocumentsSection
