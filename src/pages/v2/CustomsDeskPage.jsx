import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { loadJourneyData, journeyFor, isExportJob, isDelivered } from '../../services/journey'
import { markBeFiled, markSbFiled, setStage } from '../../services/jobActions'
import { runUlipCheck, isoToDate8 } from '../../services/ulip/ulipClient'

const NAVY = '#1a4fa0'
const SHOW_FIRST = 20
const lock = { busy: false, take() { this.busy = true }, free() { this.busy = false } }   // one action at a time

const fmtDate = (v) => {
  if (!v) return '—'
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v)
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
const fmtDateTime = (v) => {
  if (!v) return 'Never'
  const d = new Date(v)
  return isNaN(d) ? 'Never' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
const daysSince = (v) => {
  if (!v) return null
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v)
  return isNaN(d) ? null : Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}
const daysText = (n) => (n === null ? '' : n === 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`)

export default function CustomsDeskPage({ currentUserName, onOpenJob, showToast, canEditBE, canUpdateStage }) {
  const [view, setView] = useState('imports')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busyId, setBusyId] = useState(null)       // the one running action
  const [formFor, setFormFor] = useState(null)     // job id with the inline form open
  const [rowErrors, setRowErrors] = useState({})
  const [rowNotes, setRowNotes] = useState({})
  const [showAll, setShowAll] = useState({})
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const d = await loadJourneyData()
        if (!cancelled) { setData(d); setLoadError(d?.error || '') }
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || 'Could not load jobs.')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [reloadKey])

  const refresh = () => { setLoading(true); setLoadError(''); setReloadKey((k) => k + 1) }
  const plainSaveError = (msg) => (/permission|policy|row-level|not allowed|denied|no permission/i.test(msg || '') ? "You don't have permission to change this job." : msg)

  const setErr = (id, msg) => setRowErrors((p) => ({ ...p, [id]: msg }))
  const setNote = (id, msg) => setRowNotes((p) => ({ ...p, [id]: msg }))
  const patchJob = (job) => setData((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === job.id ? { ...j, ...job } : j)) }))

  const rows = data
    ? data.jobs
        .filter((j) => !isDelivered(j) && (view === 'exports' ? isExportJob(j) : !isExportJob(j)))
        .map((job) => ({ job, jr: journeyFor(job, data) }))
    : []

  let lists
  if (view === 'imports') {
    lists = [
      { id: 'be', title: 'Waiting for BE filing (in LiveImpex)', empty: 'No jobs waiting for BE filing 🎉', items: rows.filter((r) => !r.jr.beFiled) },
      { id: 'ooc', title: 'BE filed — waiting for OOC', empty: 'No jobs waiting for OOC 🎉', items: rows.filter((r) => r.jr.beFiled && !r.jr.oocDate) },
      { id: 'granted', title: 'OOC granted — next steps', empty: 'No jobs with OOC granted right now.', items: rows.filter((r) => r.jr.oocDate) },
    ]
  } else {
    lists = [
      { id: 'sb', title: 'Shipping bill to be filed', empty: 'No shipping bills waiting to be filed 🎉', items: rows.filter((r) => !r.jr.sbNo) },
      { id: 'leo', title: 'Shipping bill filed — waiting for LEO', empty: 'No jobs waiting for LEO 🎉', items: rows.filter((r) => r.jr.sbNo && !r.jr.leoDate) },
      { id: 'given', title: 'LEO given', empty: 'No jobs with LEO given right now.', items: rows.filter((r) => r.jr.leoDate) },
    ]
  }

  // ── actions ──
  const saveFiled = async (job, kind, values) => {
    if (lock.busy) return
    lock.take()
    setBusyId(job.id); setErr(job.id, '')
    let res
    try {
      res = kind === 'be'
        ? await markBeFiled(job, values, currentUserName)
        : await markSbFiled(job, values, currentUserName)
    } finally {
      lock.free()
      setBusyId(null)
    }
    if (!res.ok) { setErr(job.id, plainSaveError(res.error)); return }
    patchJob(res.job)
    setFormFor(null)
    showToast?.(kind === 'be' ? `BE saved for ${job.job_no}` : `Shipping bill saved for ${job.job_no}`, 'success')
  }

  const checkOoc = async (job) => {
    if (lock.busy) return
    lock.take()
    setBusyId(job.id); setErr(job.id, ''); setNote(job.id, '')
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke('customs-status', { body: { jobId: job.id } })
      if (fnErr || !res?.success) {
        let msg = res?.error
        if (!msg && fnErr?.context?.json) { try { msg = (await fnErr.context.json())?.error } catch { /* ignore */ } }
        setErr(job.id, msg || fnErr?.message || 'Customs check failed.')
        return
      }
      const row = res.data
      if (row) setData((d) => ({ ...d, customsByJob: { ...d.customsByJob, [job.id]: row } }))
      if (row?.ooc_date) showToast?.(`OOC granted — ${job.job_no}`, 'success')
      else {
        if (res.cached) showToast?.('Checked a few minutes ago, showing that result', 'info')
        setNote(job.id, 'OOC not given yet.')
      }
    } finally {
      lock.free()
      setBusyId(null)
    }
  }

  const checkLeo = async (job) => {
    if (lock.busy) return
    const refs = job.ulip_refs || {}
    const sbDt = isoToDate8(refs.sb_date)
    if (!refs.sb_no || !sbDt) { setErr(job.id, 'The shipping bill number or date is missing. Open the job to add it.'); return }
    lock.take()
    setBusyId(job.id); setErr(job.id, ''); setNote(job.id, '')
    try {
      const res = await runUlipCheck({ api: 'ICEGATE/06', params: { sbNo: String(refs.sb_no), sbDt }, jobId: job.id })
      if (!res.ok) { setErr(job.id, res.error); return }
      const row = res.data
      if (row) setData((d) => ({ ...d, resultsByJob: { ...d.resultsByJob, [job.id]: { ...(d.resultsByJob[job.id] || {}), 'ICEGATE/06': row } } }))
      setNote(job.id, row?.parsed?.summary || 'Checked.')
      if (row?.parsed?.extra?.leoDate) showToast?.(`LEO given — ${job.job_no}`, 'success')
    } finally {
      lock.free()
      setBusyId(null)
    }
  }

  const moveStage7 = async (job) => {
    if (lock.busy) return
    lock.take()
    setBusyId(job.id); setErr(job.id, '')
    let res
    try {
      res = await setStage(job, 7, 'OOC', currentUserName)
    } finally {
      lock.free()
      setBusyId(null)
    }
    if (!res.ok) { setErr(job.id, plainSaveError(res.error)); return }
    patchJob(res.job)
    showToast?.(`${job.job_no} moved to OOC stage`, 'success')
  }

  const anyBusy = busyId !== null

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: '#1a2233', fontSize: '14px', maxWidth: '960px', margin: '0 auto', padding: '16px', width: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px' }}>BE &amp; OOC</h1>
      <div style={{ color: '#5b6678', marginBottom: '14px' }}>File in LiveImpex, then record it here. Check customs when you are ready.</div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        {[['imports', 'Imports — BE & OOC'], ['exports', 'Exports — Shipping bill & LEO']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => { setView(id); setFormFor(null) }} style={{
            flex: '1 1 240px', minHeight: '52px', borderRadius: '12px', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
            border: `1.5px solid ${view === id ? NAVY : '#e2e6ed'}`, background: view === id ? NAVY : '#fff', color: view === id ? '#fff' : '#1a2233',
          }}>{label}</button>
        ))}
      </div>

      {loading && <div style={{ ...card, color: '#5b6678' }}>Loading jobs…</div>}
      {loadError && (
        <div style={{ ...card, color: '#991b1b', background: '#fef2f2', borderColor: '#fecaca', marginBottom: '14px' }}>
          ⚠ Could not load the latest data — {loadError}. Press Refresh.
          <div style={{ marginTop: '10px' }}><Btn onClick={refresh}>Refresh</Btn></div>
        </div>
      )}

      {!loading && !loadError && lists.map((list) => {
        const expanded = !!showAll[`${view}-${list.id}`]
        const shown = expanded ? list.items : list.items.slice(0, SHOW_FIRST)
        return (
          <section key={list.id} style={{ marginBottom: '22px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {list.title}
              <span style={{ background: '#e8effa', color: NAVY, borderRadius: '999px', padding: '2px 10px', fontSize: '13px', fontFamily: "'JetBrains Mono', monospace" }}>{list.items.length}</span>
            </h2>
            {list.id === 'ooc' && <div style={{ fontSize: '13px', color: '#5b6678', margin: '-4px 0 10px' }}>Check only when you expect OOC — each check asks Customs.</div>}
            {list.items.length === 0 && <div style={{ ...card, color: '#5b6678' }}>{list.empty}</div>}
            {shown.map(({ job, jr }) => (
              <Row key={job.id} job={job} onOpen={() => onOpenJob?.(job.id)} error={rowErrors[job.id]} note={rowNotes[job.id]} busy={busyId === job.id}>
                {list.id === 'be' && (!canEditBE ? <Info>Ask Akshyani or an admin to record the BE.</Info> : (
                  <FiledAction initialNo={job.be_no} locked={anyBusy} label="BE filed" numLabel="BE number (7 digits)" dateLabel="BE date" open={formFor === job.id} busy={busyId === job.id}
                    onOpen={() => { setFormFor(job.id); setErr(job.id, '') }} onCancel={() => setFormFor(null)}
                    onSave={(no, date) => saveFiled(job, 'be', { beNo: no, beDate: date })} />
                ))}
                {list.id === 'ooc' && (
                  <>
                    <Info>BE <b style={mono}>{job.be_no}</b> dated {fmtDate(job.be_date)} · filed {daysText(daysSince(job.be_date))}</Info>
                    <Info>Last checked: {fmtDateTime(jr.customs?.checked_at)}</Info>
                    <Btn disabled={anyBusy} onClick={() => checkOoc(job)}>{busyId === job.id ? 'Checking…' : 'Check OOC'}</Btn>
                  </>
                )}
                {list.id === 'granted' && (
                  <>
                    <Info>OOC <b>{fmtDate(jr.oocDate)}</b>{jr.customs?.ooc_no ? <> · No. <b style={mono}>{jr.customs.ooc_no}</b></> : null}</Info>
                    <Info>Stage {Number(job.stage) || 0}{job.truck_no ? ` · Truck ${job.truck_no}` : ' · No truck yet'}</Info>
                    {canUpdateStage && (Number(job.stage) || 0) < 7 && <Btn disabled={anyBusy} onClick={() => moveStage7(job)}>{busyId === job.id ? 'Saving…' : 'Move to OOC stage'}</Btn>}
                    <Btn secondary disabled={anyBusy} onClick={() => onOpenJob?.(job.id, 'truck')}>Assign truck</Btn>
                  </>
                )}
                {list.id === 'sb' && (!canEditBE ? <Info>Ask Akshyani or an admin to record the shipping bill.</Info> : (
                  <FiledAction locked={anyBusy} label="SB filed" numLabel="Shipping bill number (7 digits)" dateLabel="Shipping bill date" open={formFor === job.id} busy={busyId === job.id}
                    onOpen={() => { setFormFor(job.id); setErr(job.id, '') }} onCancel={() => setFormFor(null)}
                    onSave={(no, date) => saveFiled(job, 'sb', { sbNo: no, sbDate: date })} />
                ))}
                {list.id === 'leo' && (
                  <>
                    <Info>Shipping bill <b style={mono}>{jr.sbNo}</b> dated {fmtDate(job.ulip_refs?.sb_date)} · filed {daysText(daysSince(job.ulip_refs?.sb_date))}</Info>
                    <Btn disabled={anyBusy} onClick={() => checkLeo(job)}>{busyId === job.id ? 'Checking…' : 'Check LEO'}</Btn>
                  </>
                )}
                {list.id === 'given' && (
                  <Info>Shipping bill <b style={mono}>{jr.sbNo}</b> · LEO given on <b>{fmtDate(jr.leoDate)}</b></Info>
                )}
              </Row>
            ))}
            {list.items.length > SHOW_FIRST && (
              <Btn secondary onClick={() => setShowAll((p) => ({ ...p, [`${view}-${list.id}`]: !expanded }))}>
                {expanded ? 'Show fewer' : `Show all ${list.items.length}`}
              </Btn>
            )}
          </section>
        )
      })}
    </div>
  )
}

function Row({ job, onOpen, error, note, busy, children }) {
  return (
    <div style={{ ...card, marginBottom: '10px' }}>
      <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }} style={{ cursor: 'pointer', marginBottom: '10px' }}>
        <div style={{ fontWeight: 700, fontSize: '15px' }}>
          <span style={{ ...mono, color: NAVY }}>{job.job_no}</span> · {job.client || 'No client'}
        </div>
        <div style={{ color: '#8a96a8', fontSize: '13px', marginTop: '2px' }}>
          {[job.commodity || job.description, job.mode].filter(Boolean).join(' · ') || 'Tap to open the job'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>{children}</div>
      {busy && <div style={{ fontSize: '12px', color: '#8a96a8', marginTop: '8px' }}>Government systems can take up to a minute to answer. Please wait.</div>}
      {note && !busy && <div style={{ marginTop: '10px', padding: '10px 12px', background: '#f4f6f9', borderRadius: '8px', fontWeight: 600 }}>{note}</div>}
      {error && <div style={{ marginTop: '10px', padding: '10px 12px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '8px', color: '#991b1b' }}>⚠ {error}</div>}
    </div>
  )
}

function FiledAction({ label, numLabel, dateLabel, open, busy, locked, initialNo, onOpen, onCancel, onSave }) {
  const [no, setNo] = useState(String(initialNo || '').replace(/\D/g, '').slice(0, 7))
  const [date, setDate] = useState('')
  if (!open) return <Btn disabled={locked} onClick={onOpen}>{label}</Btn>
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%', alignItems: 'flex-end' }}>
      <label style={{ flex: '1 1 170px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#5b6678' }}>
        {numLabel}
        <input value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, '').slice(0, 7))} inputMode="numeric" maxLength={7} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} />
      </label>
      <label style={{ flex: '0 1 180px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#5b6678' }}>
        {dateLabel}
        <input type="date" max={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </label>
      <Btn disabled={busy} onClick={() => onSave(no, date)}>{busy ? 'Saving…' : 'Save'}</Btn>
      <Btn secondary disabled={busy} onClick={onCancel}>Cancel</Btn>
    </div>
  )
}

const Info = ({ children }) => <div style={{ fontSize: '13px', color: '#5b6678', flex: '1 1 220px' }}>{children}</div>

function Btn({ children, onClick, disabled, secondary }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      minHeight: '44px', padding: '0 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      border: `1.5px solid ${NAVY}`, background: secondary ? '#fff' : NAVY, color: secondary ? NAVY : '#fff',
    }}>{children}</button>
  )
}

const mono = { fontFamily: "'JetBrains Mono', monospace" }
const card = { background: '#fff', border: '1.5px solid #e2e6ed', borderRadius: '12px', padding: '14px 16px' }
const inputStyle = { minHeight: '44px', padding: '0 12px', border: '1.5px solid #e2e6ed', borderRadius: '10px', fontSize: '14px', color: '#1a2233', background: '#fff', boxSizing: 'border-box', width: '100%' }
