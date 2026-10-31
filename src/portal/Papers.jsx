import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PdfPreview from '../components/PdfPreview'
import { downloadDoc, openDoc, useDocUrl } from '../services/docFiles'
import { availableTypes, docTypeLabel } from '../utils/docTypes'
import { lockScroll, pushLayer, trapTab } from '../ui/hooks'
import { useJourney } from '../industrial/JourneyContext'
import { usePortal } from './PortalContext'
import { paperRows } from './model'
import { uploadPaper, guessPaperType, tooBig } from './actions'

const PlusIcon = () => (
  <svg className="pt-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
)
const XIcon = () => (
  <svg className="pt-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
)
const DownloadIcon = () => (
  <svg className="pt-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
)

const kindOf = (doc) => {
  const t = String(doc?.file_type || doc?.file_name || '')
  if (/pdf/i.test(t)) return 'pdf'
  if (/jpe?g|png/i.test(t)) return 'image'
  return 'other'
}

function ImagePreview({ doc, alt }) {
  const url = useDocUrl(doc)
  if (!url) return <p className="pt-pv-wait"><span className="pt-spin" aria-hidden="true" /> Opening…</p>
  return <img className="pt-pv-img" src={url} alt={alt} />
}

// The preview sheet: phone = full screen, desktop = centred card
function Preview({ item, layout, onClose }) {
  const ref = useRef(null)
  const { toast } = usePortal()
  const [saving, setSaving] = useState(false)
  const close = useEffectEvent(() => onClose())

  useEffect(() => {
    const prev = document.activeElement
    const unlock = lockScroll()
    const layer = pushLayer(Symbol('pt-preview'))
    const raf = requestAnimationFrame(() => ref.current?.querySelector('[data-close]')?.focus({ preventScroll: true }))
    // capture phase on window: Esc closes only this sheet (not the job page under it)
    const onKey = (e) => {
      if (!layer.isTop()) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
      else if (e.key === 'Tab') trapTab(e, ref.current)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey, true)
      layer.release()
      unlock()
      if (prev && typeof prev.focus === 'function') prev.focus({ preventScroll: true })
    }
  }, [])

  const download = async () => {
    if (saving) return
    setSaving(true)
    try { await downloadDoc(item.doc) } catch (e) { toast(e?.message || 'Could not download the file.', 'error') }
    setSaving(false)
  }

  const kind = kindOf(item.doc)
  return createPortal(
    <div className="pt pt-pvwrap" data-l={layout}>
      <div className="pt-pv-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className="pt-preview" role="dialog" aria-modal="true" aria-label={item.label} tabIndex={-1}>
        <div className="pt-pv-head">
          <div className="pt-pv-title">
            <b>{item.label}</b>
            {item.number ? <span className="pt-pv-no">{item.number}</span> : null}
          </div>
          <button type="button" className="pt-pv-btn" onClick={download} disabled={saving}>
            <DownloadIcon /><span>{saving ? 'Saving…' : 'Download'}</span>
          </button>
          <button type="button" className="pt-pv-x" onClick={onClose} aria-label="Close" data-close><XIcon /></button>
        </div>
        <div className="pt-pv-body">
          {kind === 'pdf' ? <PdfPreview doc={item.doc} /> : <ImagePreview doc={item.doc} alt={item.label} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Papers: every document of the job with its own number; click to read; "Add a paper" uploads
export default function Papers({ row, docs, layout, onChanged }) {
  const { job, j } = row
  const { refresh } = useJourney()
  const { user, profile, perms, toast } = usePortal()
  const [preview, setPreview] = useState(null)
  const [pending, setPending] = useState(null) // { file, type }
  const [uploading, setUploading] = useState(false)
  const lock = useRef(false)

  const rows = paperRows(job, j, docs)
  const types = availableTypes(docs.map((d) => d.doc_type))

  const open = (item) => {
    if (kindOf(item.doc) === 'other') { openDoc(item.doc); return }
    setPreview(item)
  }

  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (tooBig(file)) { toast('File size must be under 10MB.', 'error'); return }
    const guess = guessPaperType(file.name)
    setPending({ file, type: types.includes(guess) ? guess : (types.includes('Other') ? 'Other' : types[0]) })
  }

  const upload = async () => {
    if (!pending || lock.current) return
    lock.current = true
    setUploading(true)
    const res = await uploadPaper(job, pending.file, pending.type, { user, profile, userName: perms.userName })
    lock.current = false
    setUploading(false)
    if (!res.ok) { toast(res.error, 'error'); return }
    setPending(null)
    if (res.vessel) { toast(`Ship name saved from the BL: ${res.vessel}`); refresh() }
    else toast('Paper added')
    onChanged?.()
  }

  return (
    <section className="pt-sec" aria-labelledby="pt-papers-h">
      <h3 id="pt-papers-h">Papers</h3>
      <div className="pt-box">
        {rows.map((p) => (p.doc ? (
          <button key={p.key} type="button" className="pt-li" onClick={() => open(p)}>
            <span className="pt-doc" aria-hidden="true" />
            <span className="pt-nm">{p.label}</span>
            {p.number ? <span className="pt-no">{p.number}</span> : null}
          </button>
        ) : (
          <div key={p.key} className="pt-li virtual">
            <span className="pt-doc" aria-hidden="true" />
            <span className="pt-nm">{p.label}</span>
            {p.number ? <span className="pt-no">{p.number}</span> : null}
          </div>
        )))}
        {pending && (
          <div className="pt-li pt-upl">
            <span className="pt-upl-name" title={pending.file.name}>{pending.file.name}</span>
            <select className="pt-upl-type" value={pending.type} aria-label="Type of paper" disabled={uploading}
              onChange={(e) => setPending((p) => ({ ...p, type: e.target.value }))}>
              {types.map((t) => <option key={t} value={t}>{docTypeLabel(t)}</option>)}
            </select>
            <button type="button" className="pt-upl-go" onClick={upload} disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
            <button type="button" className="pt-upl-x" onClick={() => setPending(null)} disabled={uploading}>Cancel</button>
          </div>
        )}
        <label className="pt-li add">
          <span className="pt-doc" aria-hidden="true"><PlusIcon /></span>
          Add a paper
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="pt-file" onChange={pick} disabled={uploading} />
        </label>
      </div>
      {preview && <Preview item={preview} layout={layout} onClose={() => setPreview(null)} />}
    </section>
  )
}
