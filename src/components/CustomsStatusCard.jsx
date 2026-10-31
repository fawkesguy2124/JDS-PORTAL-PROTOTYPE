import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { Panel, Button, Icon, Dash, fmtDate, fmtDateTime } from '../industrial/ui'
import '../industrial/industrial.css'
import './ulip/ulipCards.css'

// Customs status for a job (OOC from Customs, and for Nhava Sheva jobs the
// port's IGM, delivery order and gate record) via the customs-status Edge
// Function. The last answer is saved, so opening the tab shows it without
// asking Customs again. Control tower look (Jose, 31 Oct 2026): one primary
// button at a time (save BE, check, or move the job on).
export default function CustomsStatusCard({ job, canEditBE, canUpdateStage, onMoveToStage, onSaved, toast }) {
  const [status, setStatus] = useState(null)
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [beNo, setBeNo] = useState(job.be_no || '')
  const [beDate, setBeDate] = useState(job.be_date || '')
  const [savingBE, setSavingBE] = useState(false)
  const [movingStage, setMovingStage] = useState(false)

  const hasBE = /^\d{7}$/.test((job.be_no || '').trim()) && !!job.be_date

  useEffect(() => {
    let cancelled = false
    supabase.from('customs_status').select('*').eq('job_id', job.id).maybeSingle()
      .then(({ data, error: loadErr }) => {
        if (cancelled) return
        if (loadErr) console.warn('[CustomsStatus] load failed:', loadErr.message)
        setStatus(data?.checked_at ? data : null)   // a row that only holds a failure is not an answer
        setLoadingSaved(false)
      })
    return () => { cancelled = true }
  }, [job.id])

  const saveBE = async () => {
    const no = beNo.trim()
    if (!/^\d{7}$/.test(no)) { setError('BE number must be 7 digits, for example 2237841.'); return }
    if (!beDate) { setError('Please pick the BE date.'); return }
    setSavingBE(true)
    setError('')
    const { error: upErr } = await supabase.from('jobs').update({ be_no: no, be_date: beDate }).eq('id', job.id)
    setSavingBE(false)
    if (upErr) { setError(`Could not save: ${upErr.message}`); return }
    toast?.('BE number and date saved', 'success')
    await onSaved?.()
  }

  const check = async () => {
    setChecking(true)
    setError('')
    const { data, error: fnErr } = await supabase.functions.invoke('customs-status', { body: { jobId: job.id } })
    setChecking(false)
    if (fnErr || !data?.success) {
      let msg = data?.error
      if (!msg && fnErr?.context?.json) { try { msg = (await fnErr.context.json())?.error } catch { /* ignore */ } }
      setError(msg || fnErr?.message || 'Customs check failed.')
      return
    }
    setStatus(data.data)
    if (data.cached) toast?.('Checked a few minutes ago, showing that result', 'info')
    else if (data.data?.ooc_date) toast?.('OOC granted', 'success')
    await onSaved?.()
  }

  const moveToOOC = async () => {
    setMovingStage(true)
    await onMoveToStage?.(7)
    setMovingStage(false)
  }

  const oocGranted = !!status?.ooc_date
  // once OOC is granted for this BE there is nothing more to ask Customs
  const showCheck = hasBE && !(oocGranted && status?.be_no === job.be_no)
  const showMoveButton = oocGranted && canUpdateStage && Number(job.stage) < 7

  const checkButton = showCheck && (
    <Button variant="primary" size="sm" onClick={check} disabled={checking}>
      {checking ? <><Icon name="loader-2" className="uc-spin" />Checking…</> : <><Icon name="refresh" />Check customs status</>}
    </Button>
  )

  return (
    <Panel className="ix-uc uc-customs" flush={false} title="Customs status"
      meta={status?.checked_at ? `Checked ${fmtDateTime(status.checked_at)}` : null}
      actions={checkButton || null}>
      <div className="uc-intro">OOC from Customs. For Nhava Sheva jobs also the IGM, delivery order and trucks at the port gate.</div>

      {/* BE number + date, or the boxes to add them */}
      {hasBE ? (
        <dl className="uc-kv">
          <Field label="BE number" value={job.be_no} mono />
          <Field label="BE date" value={fmtDate(job.be_date)} />
        </dl>
      ) : canEditBE ? (
        <div>
          <div className="uc-meta" style={{ marginTop: 0 }}>Add the BE number and date to check customs status.</div>
          <div className="uc-form" style={{ marginTop: 8 }}>
            <label className="uc-field">
              <span>BE number</span>
              <input className="uc-input mono" value={beNo} onChange={e => setBeNo(e.target.value.replace(/\D/g, ''))} maxLength={7}
                inputMode="numeric" placeholder="7 digits, like 2237841" />
            </label>
            <label className="uc-field date">
              <span>BE date</span>
              <input className="uc-input" type="date" value={beDate} onChange={e => setBeDate(e.target.value)} />
            </label>
            <Button variant="primary" onClick={saveBE} disabled={savingBE}>{savingBE ? 'Saving…' : 'Save BE'}</Button>
          </div>
        </div>
      ) : (
        <div className="uc-empty" style={{ paddingTop: 0 }}>This job has no BE number and date yet. Ask Akshyani or an admin to add them.</div>
      )}

      {error && <div className="ix-error" role="alert"><Icon name="alert-triangle" />{error}</div>}

      {loadingSaved ? (
        <div className="uc-loading"><Icon name="loader-2" className="uc-spin" />Loading the last answer…</div>
      ) : !status ? (
        hasBE && !error && (
          <div className="uc-empty">Not checked yet. It is checked by itself when the BE &amp; OOC page is opened, or press “Check customs status”.</div>
        )
      ) : (
        <>
          {status.be_no !== job.be_no && (
            <div className="uc-note" style={{ marginTop: 12, marginBottom: 0 }}>
              This answer is for BE <span className="mono">{status.be_no}</span>. The BE number has changed since, so check again.
            </div>
          )}

          {oocGranted ? (
            <div className="uc-answer green">
              <div>
                OOC granted on {fmtDate(status.ooc_date)}
                <span className="x">Customs is done for this BE, so it is not checked again.</span>
              </div>
              {showMoveButton && (
                <span className="act">
                  {/* primary unless a fresh check is offered in the head (BE changed since) */}
                  <Button size="sm" variant={showCheck ? 'secondary' : 'primary'} icon="arrow-right" onClick={moveToOOC} disabled={movingStage}>
                    {movingStage ? 'Moving…' : 'Move job to OOC stage'}
                  </Button>
                </span>
              )}
            </div>
          ) : (
            <div className="uc-answer amber"><div>OOC not granted yet</div></div>
          )}

          <dl className="uc-kv">
            {oocGranted && <Field label="OOC number" value={status.ooc_no} mono />}
            <Field label="IGM number" value={status.igm_no} mono />
            <Field label="IGM date" value={status.igm_date && fmtDate(status.igm_date)} />
            <Field label="Delivery order no." value={status.do_no} mono />
            <Field label="Delivery order date" value={status.do_date && fmtDate(status.do_date)} />
          </dl>

          {Array.isArray(status.vehicles) && status.vehicles.length > 0 && (
            <>
              <div className="uc-sub">Trucks at the port gate · {status.vehicles.length}</div>
              <div className="uc-gate">
                {status.vehicles.map((v, i) => (
                  <div key={i}>
                    <span className="ix-plate">{v.number}</span>
                    <span>In <span className="mono">{v.entryTime || '—'}</span></span>
                    <span>Out <span className="mono">{v.exitTime || '—'}</span></span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="uc-meta">
            <div><b>Customs:</b> {sourceText(status.icegate_status, status.icegate_error)}</div>
            <div><b>Port:</b> {sourceText(status.jnpt_status, status.jnpt_error, 'not found. This job may be at another port.')}</div>
            <div>Last checked {fmtDateTime(status.checked_at)}{status.checked_by_name ? ` by ${status.checked_by_name}` : ''}</div>
          </div>
        </>
      )}
    </Panel>
  )
}

function sourceText(state, err, notFoundText = 'no record yet') {
  if (state === 'found') return 'found'
  if (state === 'not_found') return notFoundText
  if (state === 'error') return `could not reach (${err || 'unknown problem'})`
  return '—'
}

// One label / value cell; numbers in mono, a missing value is a faint dash
function Field({ label, value, mono }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono && value ? 'mono' : undefined}>{value || <Dash />}</dd>
    </div>
  )
}
