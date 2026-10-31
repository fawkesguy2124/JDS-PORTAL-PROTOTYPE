import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { availableTypes, docTypeLabel } from '../utils/docTypes'
import { vesselFromBl } from '../services/blVessel'
import { isLineNotShip } from '../../supabase/functions/_shared/portal/shippingLines.js'
import { downloadDoc, useDocUrl } from '../services/docFiles'
import PdfPreview from './PdfPreview'
import { cachedDocs, keepDocs, loadDocs } from '../services/docCache'
import { useJourney } from '../industrial/JourneyContext'
import { Icon, JobNo, PhaseStatus, Chip, Dash, Button, Tabs, Toolbar, Panel, EmptyState, Skeleton, fmtDate, fmtDateTime } from '../industrial/ui'
import '../industrial/styles/customs.css'

// Documents: one row per job with its papers checklist (Control tower, Jose 31 Oct 2026).
// A green paper is in (click to preview it); a dashed one is missing (click to upload
// that type). One Upload button for the page; a small upload icon on each row.
// Click a row to see its files.

// The papers every import needs, in the order staff look for them. Exports have no BE / OOC.
const PAPERS = [
  { type: 'BL', label: 'BL', title: 'Bill of lading (or air waybill)' },
  { type: 'Invoice', label: 'Invoice' },
  { type: 'Packing List', label: 'Packing list' },
  { type: 'BE', label: 'BE', title: 'Bill of entry', importOnly: true },
  { type: 'OOC', label: 'OOC', title: 'Out of charge', importOnly: true },
  { type: 'E-Way Bill', label: 'E-way bill' },
]
const PAPER_TYPES = new Set(PAPERS.map((p) => p.type))
const SHOW_FIRST = 100
const MAX_BYTES = 10 * 1024 * 1024
const OK_EXT = ['.pdf', '.jpg', '.jpeg', '.png']
const OK_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']

const jobNum = (no) => parseInt(String(no || '').replace(/\D/g, ''), 10) || 0
const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
const sanitizeFilename = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_')
const fileIcon = (doc) => {
  const ext = String(doc.file_type || '').toLowerCase()
  return ext === 'pdf' ? 'file-type-pdf' : ['jpg', 'jpeg', 'png'].includes(ext) ? 'photo' : 'file'
}
const isExport = (job) => job?.job_type === 'export'

function DocumentsSection({ jobs, currentUserName, showToast, initialExpandJobId, onExpandConsumed }) {
  const { user, profile } = useAuth()
  const journey = useJourney()
  const isAdmin = profile?.role === 'admin'
  // shown at once from the list loaded in the background (docCache), then refreshed
  const [documents, setDocuments] = useState(() => cachedDocs() || [])
  const [loadingDocs, setLoadingDocs] = useState(() => !cachedDocs())
  const [expandedJobId, setExpandedJobId] = useState(null)   // job_no of the open row
  const [uploadModal, setUploadModal] = useState({ open: false, job: null })
  const [previewModal, setPreviewModal] = useState({ open: false, doc: null })
  // the files are private: the preview uses a 1-hour link made for this user
  const previewUrl = useDocUrl(previewModal.open ? previewModal.doc : null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadDocType, setUploadDocType] = useState('BL')
  const [uploadFile, setUploadFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [pickQ, setPickQ] = useState('')                   // job search in the upload window
  const [docSearch, setDocSearch] = useState('')
  const [scope, setScope] = useState('open')               // 'open' jobs (default) or 'all'
  const [showAll, setShowAll] = useState(false)
  const [menuFor, setMenuFor] = useState(null)             // file with its ⋯ menu open
  const fileInputRef = useRef(null)
  const uploadIntervalRef = useRef(null)

  // open = the same set as the "active jobs" everywhere (useJourney), else not delivered by stage
  const loaded = !!journey?.data
  const activeList = journey?.active
  const activeIds = useMemo(() => (loaded && activeList ? new Set(activeList.map((r) => String(r.job.id))) : null), [loaded, activeList])
  const isOpenJob = (job) => (activeIds ? activeIds.has(String(job.id)) : Number(job.stage) < 10)

  // a link to one job's papers (alert or job panel): open its row, even if the job is finished
  const [seenExpand, setSeenExpand] = useState(null)
  if (!initialExpandJobId && seenExpand) setSeenExpand(null)
  if (initialExpandJobId && initialExpandJobId !== seenExpand) {
    setSeenExpand(initialExpandJobId)
    setExpandedJobId(initialExpandJobId)
    setDocSearch('')
    setShowAll(true)   // the row may be past the first 100
    const target = (jobs || []).find((j) => j.job_no === initialExpandJobId)
    if (target && !isOpenJob(target)) setScope('all')
  }
  useEffect(() => {
    if (!initialExpandJobId) return
    onExpandConsumed?.()
    const timer = setTimeout(() => {
      const el = document.getElementById(`doc-job-${initialExpandJobId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    return () => clearTimeout(timer)
  }, [initialExpandJobId]) // eslint-disable-line react-hooks/exhaustive-deps -- run once per link, not on every parent render

  useEffect(() => () => { if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current) }, [])

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

  // the ⋯ menu closes on a click anywhere else
  useEffect(() => {
    if (!menuFor) return
    const close = (e) => { if (!e.target.closest?.('.dc-menu')) setMenuFor(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuFor])

  const closeUpload = () => {
    if (uploading) return
    setUploadModal({ open: false, job: null }); setUploadFile(null); setUploadDocType('BL'); setUploadProgress(0); setPickQ(''); setDragOver(false)
  }
  const openUpload = (job, type) => {
    // fromRow: the job was given (row or paper chip), so no "Change job"
    setUploadModal({ open: true, job: job || null, fromRow: !!job })
    setUploadDocType(type || 'BL')
    setUploadFile(null); setPickQ('')
  }
  const closePreview = () => setPreviewModal({ open: false, doc: null })
  const preview = (doc) => { setMenuFor(null); setPreviewModal({ open: true, doc }) }
  const download = (doc) => { setMenuFor(null); downloadDoc(doc).catch((e) => showToast?.(`Could not download: ${e.message}`, 'error')) }

  // Esc closes the open window
  useEffect(() => {
    if (!uploadModal.open && !previewModal.open) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (previewModal.open) setPreviewModal({ open: false, doc: null })
      else if (!uploading) { setUploadModal({ open: false, job: null }); setUploadFile(null); setUploadProgress(0); setPickQ('') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [uploadModal.open, previewModal.open, uploading])

  // one row per job: its files (newest first), the paper types it has, its last upload
  const allRows = useMemo(() => {
    const byJob = {}
    for (const d of documents) (byJob[d.job_id] ||= []).push(d)
    return (jobs || []).map((job) => {
      const docs = (byJob[job.id] || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      return { job, docs, types: new Set(docs.map((d) => d.doc_type)), last: docs[0] || null }
    }).sort((a, b) => jobNum(b.job.job_no) - jobNum(a.job.job_no))
  }, [jobs, documents])
  const openRows = allRows.filter((r) => isOpenJob(r.job))
  const q = docSearch.trim().toLowerCase()
  const rows = (scope === 'open' ? openRows : allRows).filter(({ job, docs }) => !q
    || (job.job_no || '').toLowerCase().includes(q)
    || (job.client || '').toLowerCase().includes(q)
    || docs.some((d) => (d.file_name || '').toLowerCase().includes(q) || (d.doc_type || '').toLowerCase().includes(q)))
  const shown = showAll || q ? rows : rows.slice(0, SHOW_FIRST)
  const fileCount = rows.reduce((n, r) => n + r.docs.length, 0)

  // Types this job already has are not offered again (except Other)
  const jobTypes = uploadModal.job ? documents.filter((d) => d.job_id === uploadModal.job.id).map((d) => d.doc_type) : []
  const typeOptions = availableTypes(jobTypes)
  const docType = typeOptions.includes(uploadDocType) ? uploadDocType : typeOptions[0]

  // jobs offered in the upload window when it was opened without one (open jobs first)
  const pickNeedle = pickQ.trim().toLowerCase()
  const pickList = uploadModal.open && !uploadModal.job
    ? [...openRows, ...allRows.filter((r) => !isOpenJob(r.job))]
      .filter(({ job }) => !pickNeedle || (job.job_no || '').toLowerCase().includes(pickNeedle) || (job.client || '').toLowerCase().includes(pickNeedle))
      .slice(0, 60)
    : []

  const takeFile = (f) => {
    if (!f) return
    const ext = `.${f.name.split('.').pop().toLowerCase()}`
    if (!OK_MIME.includes(f.type) && !OK_EXT.includes(ext)) { showToast('Unsupported file type. Use PDF, JPG or PNG.', 'error'); return }
    if (f.size > MAX_BYTES) { showToast('File size must be under 10 MB.', 'error'); return }
    setUploadFile(f)
  }

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
      // (a shipping line saved as the ship, e.g. "EVERGREEN", counts as no ship: the BL's replaces it)
      const lineAsShip = !!job.vessel && isLineNotShip(String(job.vessel).split('/')[0], job.shipping_line)
      if (docType === 'BL' && (!job.vessel || lineAsShip)) {
        try {
          const vessel = await vesselFromBl(uploadFile)
          if (vessel) {
            let q = supabase.from('jobs').update({ vessel }).eq('id', job.id)
            q = lineAsShip ? q.eq('vessel', job.vessel) : q.is('vessel', null)
            const { data: upd } = await q.select('id')
            if (upd?.length) showToast(`Ship name saved from the BL: ${vessel}`, 'success')
          }
        } catch (e) { console.warn('[Documents] could not read the ship name from the BL:', e?.message) }
      }
      clearInterval(sim)
      setUploadProgress(100)
      showToast(`${docType} uploaded for ${job.job_no}`, 'success')
      setUploadModal({ open: false, job: null })
      setUploadFile(null)
      setUploadDocType('BL')
      setPickQ('')
      setExpandedJobId(job.job_no)
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
    setMenuFor(null)
    if (!window.confirm(`Delete "${doc.file_name}"?`)) return
    try {
      if (doc.file_path) {
        const { error: storageErr } = await supabase.storage.from('job-documents').remove([doc.file_path])
        if (storageErr) console.warn('[Documents] Storage delete failed:', storageErr.message)
      }
      const { error: dbErr } = await supabase.from('documents').delete().eq('id', doc.id)
      if (dbErr) throw dbErr
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
      showToast('Document deleted.', 'success')
    } catch (e) {
      showToast(e?.message || 'Delete failed.', 'error')
    }
  }

  // the papers checklist of one job
  const papers = ({ job, docs, types }) => {
    const list = PAPERS.filter((p) => !(p.importOnly && isExport(job)))
    const extra = [...new Set(docs.map((d) => d.doc_type).filter((t) => t && !PAPER_TYPES.has(t)))]
    return (
      <div className="dc-papers">
        {list.map((p) => {
          const has = types.has(p.type)
          return has
            ? <button key={p.type} type="button" className="dc-ppr in" title={`Open the ${p.title || p.label}`}
                onClick={(e) => { e.stopPropagation(); preview(docs.find((d) => d.doc_type === p.type)) }}>
                <Icon name="circle-check" />{p.label}
              </button>
            : <button key={p.type} type="button" className="dc-ppr" title={`Upload the ${p.title || p.label}`}
                onClick={(e) => { e.stopPropagation(); openUpload(job, p.type) }}>
                <Icon name="upload" />{p.label}
              </button>
        })}
        {extra.length > 0 && <span className="dc-ppr more" title={extra.map(docTypeLabel).join(', ')}>+{extra.length}</span>}
      </div>
    )
  }

  const filesOf = ({ job, docs }) => (
    <tr className="dc-files" key={`${job.id}-files`}>
      <td colSpan={8}>
        {docs.length === 0 ? (
          <div className="none">No papers uploaded for {job.job_no} yet.</div>
        ) : (
          <table className="ix-tbl">
            <thead><tr>
              <th>File</th><th>Type</th><th className="dc-hide-sm">Uploaded by</th><th>Uploaded</th><th className="r dc-hide-sm">Size</th><th className="r" aria-label="Actions" />
            </tr></thead>
            <tbody>
              {docs.map((doc) => {
                const canDelete = isAdmin || doc.uploaded_by === user?.id
                return (
                  <tr key={doc.id}>
                    <td><button type="button" className="dc-fname" onClick={() => preview(doc)} title={`Open ${doc.file_name}`}><Icon name={fileIcon(doc)} />{doc.file_name}</button></td>
                    <td><Chip>{doc.doc_type || 'Other'}</Chip></td>
                    <td className="dim dc-hide-sm">{doc.uploaded_by_name || <Dash />}</td>
                    <td className="dim">{doc.created_at ? fmtDateTime(doc.created_at) : <Dash />}</td>
                    <td className="r dim dc-hide-sm">{formatFileSize(doc.file_size)}</td>
                    <td className="r">
                      <span className="dc-menu">
                        <button type="button" className="ix-icon-btn sm" aria-label={`More for ${doc.file_name}`} aria-expanded={menuFor === doc.id}
                          onClick={() => setMenuFor((v) => (v === doc.id ? null : doc.id))}><Icon name="dots" /></button>
                        {menuFor === doc.id && (
                          <span className="dc-menu-pop" role="menu">
                            <button type="button" role="menuitem" onClick={() => preview(doc)}><Icon name="eye" />Open</button>
                            <button type="button" role="menuitem" onClick={() => download(doc)}><Icon name="download" />Download</button>
                            {canDelete && <button type="button" role="menuitem" className="danger" onClick={() => handleDelete(doc)}><Icon name="trash" />Delete</button>}
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  )

  const toggle = (no) => setExpandedJobId((v) => (v === no ? null : no))
  const pv = previewModal.doc
  const pvExt = String(pv?.file_type || '').toLowerCase()

  return (
    <>
      <Panel flush className="dc-panel">
        <Tabs value={scope} onChange={(v) => { setScope(v); setShowAll(false) }} tabs={[
          { id: 'open', label: 'Open jobs', count: openRows.length },
          { id: 'all', label: 'All jobs', count: allRows.length },
        ]} />
        <Toolbar search={docSearch} onSearch={setDocSearch} placeholder="Job no, client, file name, paper type"
          right={<Button variant="primary" size="sm" icon="upload" onClick={() => openUpload(null)}>Upload</Button>} />
        {loadingDocs ? (
          <Skeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon={q ? 'search' : 'files'} title={q ? `No job matches “${docSearch.trim()}”` : scope === 'open' ? 'No open jobs' : 'No jobs yet'} />
        ) : (
          <>
            <div className="ix-tbl-wrap">
              <table className="ix-tbl click dc-tbl">
                <thead><tr>
                  <th aria-label="Show files" /><th>Job</th><th>Client</th><th className="dc-hide-sm">Stage</th><th>Papers</th>
                  <th className="r">Files</th><th className="dc-hide-sm">Last upload</th><th className="r" aria-label="Upload" />
                </tr></thead>
                <tbody>
                  {shown.map((r) => {
                    const { job, docs, last } = r
                    const open = expandedJobId === job.job_no
                    const jr = journey?.byId?.[job.id]
                    return (
                      <Fragment key={job.id}>
                        <tr id={`doc-job-${job.job_no}`} className={open ? 'open' : ''} onClick={() => toggle(job.job_no)} tabIndex={0}
                          aria-expanded={open} onKeyDown={(e) => { if (e.key === 'Enter') toggle(job.job_no) }}>
                          <td className="exp"><Icon name="chevron-right" /></td>
                          <td><JobNo no={job.job_no} /></td>
                          <td className="cl">{job.client || <Dash />}</td>
                          <td className="dc-hide-sm">{jr ? <PhaseStatus job={jr.job} j={jr.j} /> : <Dash />}</td>
                          <td>{papers(r)}</td>
                          <td className="r">{docs.length || <Dash />}</td>
                          <td className="dim dc-hide-sm" title={last ? `${fmtDateTime(last.created_at)}${last.uploaded_by_name ? ` · ${last.uploaded_by_name}` : ''}` : undefined}>
                            {last?.created_at ? fmtDate(last.created_at) : <Dash />}
                          </td>
                          <td className="r">
                            <span className="row-act">
                              <button type="button" className="ix-icon-btn sm" aria-label={`Upload a paper for ${job.job_no}`} title="Upload a paper"
                                onClick={(e) => { e.stopPropagation(); openUpload(job) }}><Icon name="upload" /></button>
                            </span>
                          </td>
                        </tr>
                        {open && filesOf(r)}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="ix-tbl-foot">
              <span>{rows.length} {rows.length === 1 ? 'job' : 'jobs'} · {fileCount} {fileCount === 1 ? 'file' : 'files'}</span>
              {rows.length > shown.length && (
                <span className="right">Showing {shown.length}<button type="button" className="ix-link" onClick={() => setShowAll(true)}>Show all {rows.length}</button></span>
              )}
            </div>
          </>
        )}
      </Panel>

      {/* Upload window */}
      {uploadModal.open && (
        <div className="dc-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) closeUpload() }}>
          <div className="dc-modal" role="dialog" aria-modal="true" aria-label="Upload a paper">
            <div className="dc-modal-h">
              <h2>Upload a paper</h2>
              {uploadModal.job && <span className="sub"><JobNo no={uploadModal.job.job_no} /> · {uploadModal.job.client || 'No client'}</span>}
              <button type="button" className="ix-icon-btn sm" onClick={closeUpload} aria-label="Close" disabled={uploading}><Icon name="x" /></button>
            </div>
            <div className="dc-modal-b">
              {!uploadModal.job && (
                <label className="dc-field">
                  <span>Job</span>
                  <input type="search" value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="Type a job no or client" autoFocus />
                  <select size={6} style={{ height: 'auto', marginTop: 6, padding: 4 }} value="" aria-label="Pick the job"
                    onChange={(e) => { const r = allRows.find((x) => String(x.job.id) === e.target.value); if (r) setUploadModal({ open: true, job: r.job, fromRow: false }) }}>
                    {pickList.map(({ job }) => <option key={job.id} value={String(job.id)}>{job.job_no} · {job.client || 'No client'}</option>)}
                  </select>
                </label>
              )}
              {uploadModal.job && (
                <>
                  <label className="dc-field">
                    <span>Paper</span>
                    <select value={docType} onChange={(e) => setUploadDocType(e.target.value)}>
                      {typeOptions.map((t) => <option key={t} value={t}>{docTypeLabel(t)}</option>)}
                    </select>
                  </label>
                  <div className="dc-field">
                    <span>File</span>
                    <div role="button" tabIndex={0} className={`dc-drop${uploadFile ? ' has' : ''}${dragOver ? ' over' : ''}`}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => { e.preventDefault(); setDragOver(false); takeFile(e.dataTransfer?.files?.[0]) }}>
                      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={(e) => takeFile(e.target.files?.[0])} />
                      {uploadFile
                        ? <><Icon name="file-check" /><b>{uploadFile.name}</b><small>{formatFileSize(uploadFile.size)} · click to pick another</small></>
                        : <><Icon name="upload" /><b>Click to pick a file, or drop it here</b><small>PDF, JPG or PNG, up to 10 MB</small></>}
                    </div>
                  </div>
                  {uploading && <div className="dc-bar" aria-label={`Uploading ${uploadProgress}%`}><i style={{ width: `${uploadProgress}%` }} /></div>}
                </>
              )}
            </div>
            <div className="dc-modal-f">
              {uploadModal.job && !uploading && !uploadModal.fromRow && <Button variant="ghost" size="sm" onClick={() => setUploadModal({ open: true, job: null, fromRow: false })}>Change job</Button>}
              <Button size="sm" onClick={closeUpload} disabled={uploading}>Cancel</Button>
              <Button variant="primary" size="sm" icon={uploading ? undefined : 'upload'} onClick={handleUpload} disabled={uploading || !uploadFile || !docType || !uploadModal.job}>
                {uploading ? `Uploading ${uploadProgress}%` : 'Upload'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Preview window */}
      {previewModal.open && pv && (
        <div className="dc-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) closePreview() }}>
          <div className="dc-modal wide" role="dialog" aria-modal="true" aria-label={pv.file_name}>
            <div className="dc-modal-h">
              <h2 className="fname" title={pv.file_name}>{pv.file_name}</h2>
              <Chip>{pv.doc_type || 'Other'}</Chip>
              {pv.job_no && <JobNo no={pv.job_no} size="sm" />}
              <button type="button" className="ix-icon-btn sm" onClick={closePreview} aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="dc-preview">
              {pvExt === 'pdf' ? (
                <PdfPreview doc={pv} />
              ) : ['jpg', 'jpeg', 'png'].includes(pvExt) ? (
                !previewUrl ? <span style={{ color: 'var(--muted)' }}>Opening…</span> : <img src={previewUrl} alt={pv.file_name} />
              ) : (
                <EmptyState icon="file" title="Preview not available">This file type cannot be shown here. Download it instead.</EmptyState>
              )}
            </div>
            <div className="dc-modal-f">
              <span style={{ marginRight: 'auto', alignSelf: 'center', fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
                {[pv.uploaded_by_name, pv.created_at && fmtDateTime(pv.created_at)].filter(Boolean).join(' · ')}
              </span>
              <Button size="sm" onClick={closePreview}>Close</Button>
              <Button variant="primary" size="sm" icon="download" onClick={() => download(pv)}>Download</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default DocumentsSection
