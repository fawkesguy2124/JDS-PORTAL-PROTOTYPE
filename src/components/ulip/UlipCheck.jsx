import { useRef, useState } from 'react'
import { findApi } from '../../../supabase/functions/ulip/apis/index.ts'
import { runUlipCheck, isoToDate8, date8ToIso } from '../../services/ulip/ulipClient'
import { refValue, rememberRefs } from './jobRefs'
import ResultTable from './ResultTable'
import { presentResult } from './presentResult'
import { parseContainerNos } from '../../utils/jobHelpers'

// One ULIP check: the boxes it needs, one big button, and the answer in
// plain words. Values already on the job are filled in automatically.
//
// check = {
//   api: 'ICEGATE/05',
//   title: 'Shipping bill status',
//   description: 'Is the shipping bill in ICEGATE, and what does it say?',
//   button: 'Check shipping bill',
//   refs: { sbNo: 'sb_no', sbDt: 'sb_date' },     // shared reference names (see jobRefs.js)
//   labels: { sbNo: 'Shipping bill number' },     // optional label overrides
//   defaults: { location: (job) => 'BOM' },       // optional: starting value when nothing else is known
//   fixed: { portCode: (job) => job.port_code },  // optional: values taken from the job, not typed
// }
export default function UlipCheck({ check, job, saved, onResult, onJobChange, compact }) {
  const api = findApi(check.api)
  // Only what the person typed is kept in state; everything else is worked out
  // from the job each time, so numbers found by another check appear at once.
  const [edited, setEdited] = useState({})
  const [result, setResult] = useState(saved || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const running = useRef(false)

  if (!api) return null

  // This job's own numbers, so its rows stand out in long lists like the IGM
  const jobMarks = [
    ...parseContainerNos(job?.containers),
    job?.bl_no, job?.be_no, job?.ulip_refs?.igm_item_no,
  ].filter(Boolean)

  const isDate = (input) => input.kind === 'date8' || input.kind === 'isoDate'
  const labelOf = (input) => check.labels?.[input.key] || input.label
  const visibleInputs = api.inputs.filter((input) => !check.fixed?.[input.key])

  // Shown value: what was typed > the job's current number > last checked > default
  const valueOf = (input) => {
    if (edited[input.key] !== undefined) return edited[input.key]
    let v = refValue(job, check.refs?.[input.key]) ?? result?.params?.[input.key] ?? check.defaults?.[input.key]?.(job) ?? ''
    if (isDate(input)) v = /^\d{8}$/.test(String(v)) ? date8ToIso(v) : String(v || '').slice(0, 10)
    return v === null || v === undefined ? '' : String(v)
  }

  // The values that would be sent now, in ULIP's format
  const buildParams = () => {
    const params = {}
    const typedRefs = {}
    for (const input of api.inputs) {
      const fixedFn = check.fixed?.[input.key]
      let v = String(fixedFn ? (fixedFn(job) ?? '') : valueOf(input)).trim()
      if (!v && fixedFn && !input.optional) return { problem: check.fixedHint || `This job is missing the ${labelOf(input)}.` }
      if (input.upper) v = v.toUpperCase().replace(/\s+/g, '')
      const ref = check.refs?.[input.key]
      if (ref && v) typedRefs[ref] = v                        // dates stay ISO here
      if (input.kind === 'date8') v = isoToDate8(v)
      if (!v && !input.optional) return { problem: `Please enter the ${labelOf(input)}.` }
      if (v && !input.pattern.test(v)) return { problem: `${labelOf(input)} looks wrong: ${input.hint}.` }
      if (v) params[input.key] = v
    }
    if (api.inputs.length && api.inputs.every((i) => i.optional) && !Object.keys(params).length) {
      return { problem: `Please fill in one of: ${api.inputs.map(labelOf).join(', ')}.` }
    }
    if (api.oneOf && Object.keys(params).length > 1) {
      return { problem: `Please fill in only one of: ${api.inputs.map(labelOf).join(', ')}.` }
    }
    return { params, typedRefs }
  }

  const run = async () => {
    if (running.current) return
    setError('')
    setNote('')
    const built = buildParams()
    if (built.problem) { setError(built.problem); return }

    running.current = true
    setBusy(true)
    try {
      const res = await runUlipCheck({ api: api.id, params: built.params, jobId: job?.id })
      if (!res.ok) {
        setError(res.error)
        if (res.data) setResult(res.data)
        return
      }
      setResult(res.data)
      setEdited({})
      if (job && res.data?.parsed?.found) {
        const remembered = await rememberRefs(job, built.typedRefs, res.data.parsed.extra)
        if (remembered.job) onJobChange?.(remembered.job)
        if (remembered.error) setNote(remembered.error)
      }
      onResult?.(res.data)
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const parsed = presentResult(check.api, result?.parsed, job)
  // Does the saved answer belong to the numbers now in the boxes?
  const current = buildParams().params
  const stale = parsed && current && result?.params &&
    JSON.stringify(Object.entries(result.params).sort()) !== JSON.stringify(Object.entries(current).sort())

  return (
    <div style={{ ...card, padding: compact ? '14px 16px' : '18px 20px' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a2233' }}>{check.title}</div>
      {check.description && (
        <div style={{ fontSize: '13px', color: '#5b6678', marginTop: '3px', lineHeight: 1.5 }}>{check.description}</div>
      )}
      {api.oneOf && (
        <div style={{ fontSize: '13px', color: '#5b6678', marginTop: '3px' }}>Fill in just one of the boxes below.</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px', alignItems: 'flex-end' }}>
        {visibleInputs.map((input) => (
          <label key={input.key} style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: isDate(input) ? '0 1 180px' : '1 1 200px', minWidth: 0 }}>
            <span style={labelStyle}>{labelOf(input)}{input.optional && !api.oneOf ? ' (optional)' : ''}</span>
            <input
              type={isDate(input) ? 'date' : 'text'}
              value={valueOf(input)}
              onChange={(e) => { const v = input.upper ? e.target.value.toUpperCase() : e.target.value; setEdited((prev) => ({ ...prev, [input.key]: v })) }}
              onKeyDown={(e) => { if (e.key === 'Enter') run() }}
              placeholder={isDate(input) ? '' : input.hint}
              style={{ ...inputStyle, fontFamily: isDate(input) ? 'inherit' : "'JetBrains Mono', monospace" }}
            />
          </label>
        ))}
        <button type="button" onClick={run} disabled={busy} style={buttonStyle(busy)}>
          {busy ? <><Spinner /> Checking…</> : (check.button || 'Check')}
        </button>
      </div>

      {busy && (
        <div style={{ fontSize: '12px', color: '#8a96a8', marginTop: '8px' }}>
          Government systems can take up to a minute to answer. Please wait.
        </div>
      )}

      {error && (
        <div style={{ ...box('#fef2f2', '#fecaca'), color: '#991b1b', marginTop: '12px' }}>⚠ {error}</div>
      )}

      {parsed && (
        <div style={{ marginTop: '14px' }}>
          {stale && (
            <div style={{ ...box('#fff7ed', '#fed7aa'), color: '#9a3412', marginBottom: '8px' }}>
              This answer is for {Object.values(result.params).join(' / ')}. The numbers above have changed, so press the button to check again.
            </div>
          )}
          <div style={{ ...box(...toneColors(parsed.tone, parsed.found)), fontSize: '14px', fontWeight: 700, color: toneText(parsed.tone, parsed.found) }}>
            {parsed.summary}
          </div>
          {parsed.note && <div style={{ fontSize: '12px', color: '#5b6678', marginTop: '6px' }}>{parsed.note}</div>}

          {parsed.fields?.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px 20px', marginTop: '12px' }}>
              {parsed.fields.map((f, i) => (
                <div key={i} style={{ minWidth: 0 }}>
                  <div style={labelStyle}>{f.label}</div>
                  <div style={{ fontSize: '14px', color: '#1a2233', marginTop: '2px', wordBreak: 'break-word' }}>{f.value ?? '—'}</div>
                </div>
              ))}
            </div>
          )}

          {(parsed.tables || []).map((t, ti) => t.rows?.length > 0 && (
            <ResultTable key={ti} table={t} highlight={jobMarks} labelStyle={labelStyle} />
          ))}
        </div>
      )}

      {result?.checked_at && (
        <div style={{ fontSize: '12px', color: '#8a96a8', marginTop: '10px' }}>
          Last checked {new Date(result.checked_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          {result.checked_by_name ? ` by ${result.checked_by_name}` : ''}
        </div>
      )}
      {note && <div style={{ fontSize: '12px', color: '#9a3412', marginTop: '6px' }}>{note}</div>}

      <style>{'@keyframes ulipSpin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}

function toneColors(tone, found) {
  const t = tone || (found ? 'good' : 'warn')
  if (t === 'good') return ['#ecfdf5', '#bbf7d0']
  if (t === 'bad') return ['#fef2f2', '#fecaca']
  if (t === 'info') return ['#eff6ff', '#bfdbfe']
  return ['#fffbeb', '#fde68a']
}
function toneText(tone, found) {
  const t = tone || (found ? 'good' : 'warn')
  return { good: '#065f46', bad: '#991b1b', info: '#1e40af', warn: '#92400e' }[t]
}

function Spinner() {
  return <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: 'white', animation: 'ulipSpin 0.7s linear infinite' }} />
}

const card = { background: 'white', border: '1.5px solid #e2e6ed', borderRadius: '14px', fontFamily: 'Inter, system-ui, sans-serif' }
const labelStyle = { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a96a8' }
const inputStyle = { height: '44px', padding: '0 12px', border: '1.5px solid #e2e6ed', borderRadius: '8px', fontSize: '14px', color: '#1a2233', background: '#f8fafc', outline: 'none', boxSizing: 'border-box', width: '100%' }
const box = (bg, border) => ({ padding: '10px 12px', background: bg, border: `1.5px solid ${border}`, borderRadius: '8px', fontSize: '13px' })
const buttonStyle = (busy) => ({
  height: '44px', padding: '0 20px', background: busy ? '#94a3b8' : '#1a4fa0', color: 'white', border: 'none',
  borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: busy ? 'default' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap',
})
