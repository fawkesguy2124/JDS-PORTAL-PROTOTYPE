import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { lockScroll, pushLayer, trapTab, focusables } from '../ui/hooks'
import { CLIENT_NAMES } from '../utils/clients'
import { PORTS } from '../utils/ports'
import {
  MODES, HAS_BOXES, SHIPPING_LINES, INITIAL_FORM, sizesFor, defaultSize,
  applyModeChange, guessDocType, extractFromPdf, validateJobForm, createJob,
} from '../services/newJob'
import './maps.css'
import './jobpage.css' // .pt-pbtn (the sheet can open before any job page has loaded)

// New job (approved design, Jose 31 Oct 2026): drop the BL or pre-alert, the
// document reader fills the job in (the same reader as the Create Job form, on
// this computer, no AI), check the few fields that matter, create. The job is
// saved through services/newJob.js exactly as the full form saves it (job row,
// container links, the dropped file as a document, the 'job_created' log).
// "Fill in manually" opens the full Create Job form (with the file, if any).
// Phone: bottom sheet; desktop: centred dialog (portal.css .pt-sheet).

const MAX_BYTES = 10 * 1024 * 1024
const UP = 'M12 16V4M7 9l5-5 5 5M5 20h14'
const X = 'M6 6l12 12M18 6 6 18'
const Ico = ({ d }) => <svg className="pt-i" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

const plural = (n, one, many) => (n === 1 ? one : many)
// the same sentences the Create Job form shows when a document cannot fill it
function problemText(res) {
  if (res.kind === 'not_pdf') return res.message
  if (res.kind === 'irrelevant') {
    const u = res.unreadable || []
    return `Nothing to fill was found in this document.${u.length ? ` Page${plural(u.length, '', 's')} ${u.join(', ')} ${plural(u.length, 'is a picture', 'are pictures')} with no text — please type those details by hand.` : ''}`
  }
  if (res.kind === 'mismatch') return `This document looks like a different shipment: its containers (${(res.docBoxes || []).join(', ')}) are not this job's (${(res.haveBoxes || []).join(', ')}). Nothing was filled from it. Please check it is the right document.`
  return 'Could not read this document — please fill the fields by hand.'
}
const boxNos = (text) => String(text || '').toUpperCase().split(/[\s,;/]+/).map((s) => s.trim()).filter(Boolean)
const clientIn = (v) => CLIENT_NAMES.find((c) => c.toLowerCase() === String(v).trim().toLowerCase()) || null

// One pass of the sheet: drop → reading → confirm (or a problem). A new pass
// (fresh state) starts each time the sheet opens.
function SheetBody({ sheetRef, onManual, onCreated }) {
  const { user, profile } = useAuth()
  const [step, setStep] = useState('drop') // drop | reading | confirm | problem
  const [file, setFile] = useState(null)
  const [found, setFound] = useState(null) // { inside: [], unreadable: [] }
  const [problem, setProblem] = useState(null) // { text, keepFile }
  const [form, setForm] = useState(INITIAL_FORM)
  const [boxText, setBoxText] = useState('')
  const [sizes, setSizes] = useState({}) // container sizes the document gave
  const [error, setError] = useState('')
  const [saving, setSaving] = useState('') // '' | 'Saving…' | 'Uploading the file…'
  const [over, setOver] = useState(false)
  const inputRef = useRef(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  // while the file is read the drop area goes away: keep the focus inside the sheet
  useEffect(() => { if (step === 'reading' || step === 'problem') sheetRef.current?.focus({ preventScroll: true }) }, [step, sheetRef])

  const read = async (f) => {
    if (!f || step === 'reading') return
    setFile(f)
    if (f.size > MAX_BYTES) { setProblem({ text: 'File must be under 10MB.', keepFile: false }); setStep('problem'); return }
    setStep('reading')
    const res = await extractFromPdf(f, INITIAL_FORM)
    if (!mounted.current) return
    if (res.kind !== 'ok') { setProblem({ text: problemText(res), keepFile: true }); setStep('problem'); return }
    const next = { ...INITIAL_FORM, ...res.updates }
    setForm(next)
    setBoxText(next.containers.map((c) => c.no).filter(Boolean).join(' '))
    setSizes(Object.fromEntries(next.containers.filter((c) => c.no && c.size).map((c) => [c.no, c.size])))
    setFound({ inside: res.foundInside || [], unreadable: res.unreadable || [] })
    setStep('confirm')
  }

  const edit = (patch) => { setForm((p) => ({ ...p, ...patch })); setError('') }
  const setMode = (value) => {
    const next = applyModeChange(form, value)
    setForm(next)
    setBoxText(next.containers.map((c) => c.no).filter(Boolean).join(' '))
    setError('')
  }
  const setBoxes = (text) => {
    setBoxText(text)
    setForm((p) => ({
      ...p,
      containers: boxNos(text).map((no) => ({ no, size: sizes[no] && sizesFor(p.mode).includes(sizes[no]) ? sizes[no] : defaultSize(p.mode) })),
    }))
    setError('')
  }
  const setClient = (v) => {
    const known = clientIn(v)
    edit(known ? { client: known, clientOther: '' } : v.trim() ? { client: '__other__', clientOther: v } : { client: '', clientOther: '' })
  }

  const create = async (e) => {
    e.preventDefault()
    if (saving) return
    setError('')
    if (!user?.id) { setError('You must be logged in to create a job.'); return }
    const invalid = validateJobForm(form)
    if (invalid) { setError(invalid); return }
    setSaving('Saving…')
    // the file is the BL / pre-alert: its type from its name, else what the reader found inside it
    const guess = guessDocType(file.name)
    const docType = guess === 'Other' && found?.inside?.length ? found.inside[0] : guess
    const res = await createJob(form, [{ file, docType, id: Date.now(), foundInside: found?.inside || [] }], {
      user, profile, onUploading: (on) => { if (mounted.current && on) setSaving('Uploading the file…') },
    })
    if (!mounted.current) { if (res.ok) onCreated(res.job); return }
    setSaving('')
    if (!res.ok) { setError(res.error); return }
    onCreated(res.job)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setOver(false)
    read(e.dataTransfer?.files?.[0])
  }

  if (step === 'drop') {
    return (
      <>
        <h3 id="pt-newjob-title">New job</h3>
        <label className={`pt-drop${over ? ' over' : ''}`} tabIndex={0} data-autofocus
          onDragEnter={(e) => { e.preventDefault(); setOver(true) }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false) }}
          onDrop={onDrop}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}>
          <Ico d={UP} />
          <span><b>Drop the BL or pre-alert</b><br />The job fills itself in</span>
          <input ref={inputRef} type="file" accept=".pdf" hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; read(f) }} />
        </label>
        <button type="button" className="pt-link" onClick={() => onManual(null)}>Fill in manually</button>
      </>
    )
  }

  if (step === 'reading') {
    return (
      <>
        <h3 id="pt-newjob-title">New job</h3>
        <div className="pt-reading" role="status"><span className="pt-spin" /><span>Reading {file?.name}</span></div>
      </>
    )
  }

  if (step === 'problem') {
    return (
      <>
        <h3 id="pt-newjob-title">New job</h3>
        <p className="pt-sheet-msg" role="alert">{problem?.text}</p>
        <button type="button" className="pt-link" onClick={() => onManual(problem?.keepFile ? file : null)}>Fill in manually</button>
      </>
    )
  }

  // confirm
  const air = form.mode === 'Air'
  const showBoxes = HAS_BOXES(form.mode) || !form.mode
  const clientText = form.client === '__other__' ? form.clientOther || '' : form.client
  const u = found?.unreadable || []
  return (
    <form className="pt-sheet-form" onSubmit={create} noValidate>
      <h3 id="pt-newjob-title">New job</h3>
      <p className="pt-sheet-note">
        From {file?.name}
        {u.length ? ` · page${plural(u.length, '', 's')} ${u.join(', ')} ${plural(u.length, 'is a picture', 'are pictures')}, not read` : ''}
      </p>
      <div className="pt-kv">
        <label htmlFor="pt-nj-no">Job no</label>
        <div className="pt-kv-jn">
          <span aria-hidden="true">J-</span>
          <input id="pt-nj-no" type="text" inputMode="numeric" pattern="[0-9]*" required autoFocus autoComplete="off"
            placeholder="123" value={form.job_no} onChange={(e) => edit({ job_no: e.target.value.replace(/\D/g, '') })} />
        </div>

        <label htmlFor="pt-nj-client">Client</label>
        <input id="pt-nj-client" type="text" list="pt-nj-clients" autoComplete="off" required
          value={clientText} onChange={(e) => setClient(e.target.value)} />
        <datalist id="pt-nj-clients">{CLIENT_NAMES.map((c) => <option key={c} value={c} />)}</datalist>

        <label htmlFor="pt-nj-mode">Mode</label>
        <select id="pt-nj-mode" required value={form.mode} onChange={(e) => setMode(e.target.value)}>
          <option value="" disabled>Choose</option>
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <label htmlFor="pt-nj-type">Type</label>
        <select id="pt-nj-type" required value={form.job_type} onChange={(e) => edit({ job_type: e.target.value })}>
          <option value="import">Import</option>
          <option value="export">Export</option>
        </select>

        {form.job_type === 'export' && (
          <>
            <label htmlFor="pt-nj-port">Port</label>
            <select id="pt-nj-port" required value={form.port_code} onChange={(e) => edit({ port_code: e.target.value })}>
              {PORTS.map((pt) => <option key={pt.code} value={pt.code}>{pt.name} ({pt.code})</option>)}
            </select>
          </>
        )}

        <label htmlFor="pt-nj-bl">{air ? 'AWB' : 'BL'}</label>
        <input id="pt-nj-bl" className="mono" type="text" autoComplete="off" spellCheck={false}
          value={form.bl_no} onChange={(e) => edit({ bl_no: e.target.value })} />

        {showBoxes && (
          <>
            <label htmlFor="pt-nj-boxes">{boxNos(boxText).length > 1 ? 'Containers' : 'Container'}</label>
            <input id="pt-nj-boxes" className="mono" type="text" autoComplete="off" spellCheck={false}
              placeholder="e.g. MSCU1234567" value={boxText} onChange={(e) => setBoxes(e.target.value)} />
          </>
        )}

        {!air && (
          <>
            <label htmlFor="pt-nj-line">Shipping line</label>
            <div className="pt-kv-pair">
              <select id="pt-nj-line" value={form.carrier}
                onChange={(e) => edit({ carrier: e.target.value, carrierOther: e.target.value === '__other__' ? '' : form.carrierOther })}>
                <option value="">Choose</option>
                {SHIPPING_LINES.filter((s) => s !== 'Other').map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="__other__">Other…</option>
              </select>
              {form.carrier === '__other__' && (
                <input type="text" aria-label="Shipping line name" placeholder="Line name" autoComplete="off"
                  value={form.carrierOther || ''} onChange={(e) => edit({ carrierOther: e.target.value })} />
              )}
            </div>
          </>
        )}

        <label htmlFor="pt-nj-vessel">{air ? 'Flight' : 'Vessel'}</label>
        <input id="pt-nj-vessel" type="text" autoComplete="off" value={form.vessel} onChange={(e) => edit({ vessel: e.target.value })} />

        <label htmlFor="pt-nj-eta">Arrives</label>
        <input id="pt-nj-eta" type="date" value={form.eta} onChange={(e) => edit({ eta: e.target.value })} />

        <label htmlFor="pt-nj-free">Free days</label>
        <input id="pt-nj-free" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" required
          value={form.free_days} onChange={(e) => edit({ free_days: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
      </div>
      {error && <p className="pt-sheet-err" role="alert">{error}</p>}
      <button type="submit" className="pt-pbtn full" disabled={!!saving}>{saving || 'Create job'}</button>
      <button type="button" className="pt-link" onClick={() => onManual(file)} disabled={!!saving}>Fill in manually</button>
    </form>
  )
}

// layout ('d' | 'm') is in the interface; the look follows .pt-app[data-l] in CSS
export default function NewJobSheet({ open, onClose, onCreated, onManual }) {
  const sheetRef = useRef(null)
  // each opening starts a fresh pass (drop the BL again)
  const [pass, setPass] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setPass((n) => n + 1)
  }

  const close = useEffectEvent(() => onClose())
  useEffect(() => {
    if (!open) return undefined
    const prev = document.activeElement
    const unlock = lockScroll()
    const layer = pushLayer(Symbol('pt-newjob'))
    const t = setTimeout(() => {
      const box = sheetRef.current
      if (!box) return
      const el = box.querySelector('[data-autofocus], [autofocus]') || focusables(box).find((n) => !n.classList.contains('pt-sheet-x')) || box
      el.focus({ preventScroll: true })
    }, 30)
    const onKey = (e) => {
      if (!layer.isTop()) return
      if (e.key === 'Escape') { e.preventDefault(); close() }
      else if (e.key === 'Tab') trapTab(e, sheetRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      layer.release()
      unlock()
      if (prev && typeof prev.focus === 'function' && document.contains(prev) && !prev.closest?.('.pt-row')) prev.focus({ preventScroll: true })
    }
  }, [open])

  return (
    <div ref={sheetRef} className={`pt-sheet${open ? ' on' : ''}`} role="dialog" aria-modal="true" aria-labelledby="pt-newjob-title"
      tabIndex={-1} inert={open ? undefined : true}>
      <button type="button" className="pt-sheet-x" onClick={onClose} aria-label="Close"><Ico d={X} /></button>
      <SheetBody key={pass} sheetRef={sheetRef} onCreated={onCreated} onManual={onManual} />
    </div>
  )
}
