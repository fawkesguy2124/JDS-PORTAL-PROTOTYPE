import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// Customs status for a job, from ULIP (ICEGATE/03 + JNPT/02) via the
// customs-status Edge Function. The last answer is saved, so opening the
// tab shows it without calling ULIP again.
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
  const showMoveButton = oocGranted && canUpdateStage && Number(job.stage) < 7

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ ...section, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a2233' }}>Customs status</div>
          <div style={{ fontSize: '11px', color: '#8a96a8', marginTop: '2px' }}>
            OOC from Customs (ICEGATE); for Nhava Sheva jobs also IGM, delivery order and trucks from JNPT
          </div>
        </div>
        {/* once OOC is granted for this BE there is nothing more to ask Customs */}
        {hasBE && !(oocGranted && status?.be_no === job.be_no) && (
          <button type="button" onClick={check} disabled={checking} style={primaryButton(checking)}>
            {checking ? <><Spinner light /> Checking…</> : 'Check customs status'}
          </button>
        )}
      </div>

      {/* BE number + date */}
      <div style={{ ...section, display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {hasBE ? (
          <>
            <Field label="BE number" value={job.be_no} mono />
            <Field label="BE date" value={formatDate(job.be_date)} />
          </>
        ) : canEditBE ? (
          <div style={{ width: '100%' }}>
            <div style={{ fontSize: '12px', color: '#4a5568', marginBottom: '8px' }}>
              Add the BE number and date to check customs status.
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input value={beNo} onChange={e => setBeNo(e.target.value.replace(/\D/g, ''))} maxLength={7}
                placeholder="BE number (7 digits)" style={{ ...input, flex: '1 1 160px', fontFamily: "'JetBrains Mono', monospace" }} />
              <input type="date" value={beDate} onChange={e => setBeDate(e.target.value)} style={{ ...input, flex: '0 1 170px' }} />
              <button type="button" onClick={saveBE} disabled={savingBE} style={primaryButton(savingBE)}>
                {savingBE ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: '#4a5568' }}>
            This job has no BE number and date yet. Ask Akshyani or an admin to add them.
          </div>
        )}
      </div>

      {error && (
        <div style={{ margin: '14px 18px', padding: '10px 12px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '8px', fontSize: '12px', color: '#991b1b' }}>
          ⚠ {error}
        </div>
      )}

      {loadingSaved ? (
        <div style={{ padding: '24px 18px', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : !status ? (
        hasBE && !error && (
          <div style={{ padding: '28px 18px', textAlign: 'center', fontSize: '12px', color: '#8a96a8' }}>
            Not checked yet. It is checked by itself when the BE &amp; OOC page is opened, or click "Check customs status".
          </div>
        )
      ) : (
        <div style={{ padding: '14px 18px' }}>
          {status.be_no !== job.be_no && (
            <div style={{ ...banner('#fff7ed', '#fed7aa'), color: '#9a3412', fontSize: '12px' }}>
              This result is for BE {status.be_no}. The BE number has changed since, so check again.
            </div>
          )}

          {/* OOC banner */}
          {oocGranted ? (
            <div style={banner('#ecfdf5', '#d1fae5')}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#065f46' }}>✓ OOC granted on {formatDate(status.ooc_date)}</div>
              <div style={{ fontSize: '11px', color: '#047857', marginTop: '2px' }}>Customs is done for this BE, so it is not checked again.</div>
              {status.ooc_no && <div style={{ fontSize: '11px', color: '#047857', marginTop: '2px' }}>OOC number {status.ooc_no}</div>}
              {showMoveButton && (
                <button type="button" onClick={moveToOOC} disabled={movingStage} style={{ ...primaryButton(movingStage), marginTop: '10px', background: movingStage ? '#94a3b8' : '#059669' }}>
                  {movingStage ? 'Moving…' : 'Move job to stage 7 (OOC)'}
                </button>
              )}
            </div>
          ) : (
            <div style={banner('#fffbeb', '#fde68a')}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e' }}>OOC not granted yet</div>
            </div>
          )}

          {/* Details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px 24px', margin: '14px 0' }}>
            <Field label="IGM number" value={status.igm_no} mono />
            <Field label="IGM date" value={formatDate(status.igm_date)} />
            <Field label="Delivery order no." value={status.do_no} mono />
            <Field label="Delivery order date" value={formatDate(status.do_date)} />
          </div>

          {/* Trucks */}
          {Array.isArray(status.vehicles) && status.vehicles.length > 0 && (
            <div style={{ borderTop: '1px solid #f4f6f9', paddingTop: '12px', marginBottom: '12px' }}>
              <div style={labelStyle}>Trucks at the port</div>
              {status.vehicles.map((v, i) => (
                <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center', padding: '6px 0', fontSize: '12px', color: '#4a5568' }}>
                  <span style={{ padding: '3px 10px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", borderRadius: '8px', background: '#E6F1FB', color: '#0C447C', border: '1px solid #B5D4F4' }}>{v.number}</span>
                  <span>Gate in: {v.entryTime || '—'}</span>
                  <span>Gate out: {v.exitTime || '—'}</span>
                </div>
              ))}
            </div>
          )}

          {/* Sources + last checked */}
          <div style={{ borderTop: '1px solid #f4f6f9', paddingTop: '10px', fontSize: '11px', color: '#8a96a8', lineHeight: 1.7 }}>
            <div>Customs (ICEGATE): {sourceText(status.icegate_status, status.icegate_error)}</div>
            <div>Port (JNPT): {sourceText(status.jnpt_status, status.jnpt_error, 'not found. This job may be at another port.')}</div>
            <div>Last checked {formatDateTime(status.checked_at)}{status.checked_by_name ? ` by ${status.checked_by_name}` : ''}</div>
          </div>
        </div>
      )}

      <style>{`@keyframes csSpin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function sourceText(state, err, notFoundText = 'no record yet') {
  if (state === 'found') return 'found'
  if (state === 'not_found') return notFoundText
  if (state === 'error') return `could not reach (${err || 'unknown problem'})`
  return '—'
}

function formatDate(iso) {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y || !m || !d) return String(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${Number(d)} ${months[Number(m) - 1] || m} ${y}`
}

function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function Field({ label, value, mono }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: '13px', color: '#1a2233', fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit', fontWeight: mono ? 600 : 400 }}>
        {value || '—'}
      </div>
    </div>
  )
}

function Spinner({ light }) {
  return (
    <span style={{
      display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%',
      border: light ? '2px solid rgba(255,255,255,0.3)' : '2px solid #e2e6ed',
      borderTopColor: light ? 'white' : '#1a4fa0', animation: 'csSpin 0.7s linear infinite',
    }} />
  )
}

const card = { background: 'white', border: '1.5px solid #e2e6ed', borderRadius: '14px', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }
const section = { padding: '14px 18px', borderBottom: '1px solid #f4f6f9' }
const labelStyle = { fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a96a8', marginBottom: '4px' }
const input = { height: '40px', padding: '0 12px', border: '1.5px solid #e2e6ed', borderRadius: '8px', fontSize: '13px', color: '#1a2233', background: '#f8fafc', outline: 'none', boxSizing: 'border-box' }
const banner = (bg, border) => ({ padding: '10px 12px', marginBottom: '10px', background: bg, border: `1.5px solid ${border}`, borderRadius: '8px' })
const primaryButton = (busy) => ({
  height: '40px', padding: '0 18px', background: busy ? '#94a3b8' : '#1a4fa0', color: 'white', border: 'none',
  borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: busy ? 'default' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
})
