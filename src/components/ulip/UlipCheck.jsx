import { useRef, useState } from 'react'
import { findApi } from '../../../supabase/functions/ulip/apis/index.ts'
import { runUlipCheck, isoToDate8, date8ToIso } from '../../services/ulip/ulipClient'
import { refValue, rememberRefs } from './jobRefs'
import ResultTable from './ResultTable'
import { presentResult } from './presentResult'
import { parseContainerNos } from '../../utils/jobHelpers'
import { Button, Icon, fmtDateTime } from '../../industrial/ui'
import '../../industrial/industrial.css'
import './ulipCards.css'

// One government check: the boxes it needs, one button, and the answer in
// plain words. Values already on the job are filled in automatically. It only
// runs when the button is pressed (or Enter in a box): never by itself.
// Control tower look (Jose, 31 Oct 2026): the button is secondary, so the pane
// around it keeps its one primary action.
//
// check = {
//   api: 'ICEGATE/05',
//   title: 'Shipping bill status',
//   description: 'Is the shipping bill with Customs, and what does it say?',
//   button: 'Check shipping bill',
//   refs: { sbNo: 'sb_no', sbDt: 'sb_date' },     // shared reference names (see jobRefs.js)
//   labels: { sbNo: 'Shipping bill number' },     // optional label overrides
//   hints: { tagid: 'Tag ID from the tag' },      // optional placeholder / format hint overrides
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
  const hintOf = (input) => check.hints?.[input.key] || input.hint
  // phones: the box hint is cut off, so only the example is shown ('Like M7264');
  // the full hint still shows in the 'looks wrong' message (Jose, 1 Nov 2026)
  const phone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches
  const placeholderOf = (input) => {
    const h = hintOf(input) || ''
    if (!phone) return h
    const plain = h.replace(/\s*\([^)]*\)\s*$/, '')
    const ex = /\blike\s+(.+)$/i.exec(plain)
    return ex ? `Like ${ex[1]}` : plain
  }
  const visibleInputs = api.inputs.filter((input) => !check.fixed?.[input.key])

  // Shown value: what was typed > the job's current number > last checked > default
  const valueOf = (input) => {
    if (edited[input.key] !== undefined) return edited[input.key]
    let v = refValue(job, check.refs?.[input.key]) ?? result?.params?.[input.key] ?? check.defaults?.[input.key]?.(job) ?? ''
    if (isDate(input)) v = /^\d{8}$/.test(String(v)) ? date8ToIso(v) : String(v || '').slice(0, 10)
    return v === null || v === undefined ? '' : String(v)
  }

  // The values that would be sent now, in the government system's format
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
      if (v && !input.pattern.test(v)) return { problem: `${labelOf(input)} looks wrong: ${hintOf(input)}.` }
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
      // numbers are kept only from an answer that is really this job's (not an
      // older BE with the same number, see presentResult)
      if (job && res.data?.parsed?.found && presentResult(check.api, res.data.parsed, job)?.found) {
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
    <div className={`ix-uc uc-check${compact ? ' compact' : ''}`}>
      <div className="uc-check-t">{check.title}</div>
      {check.description && <div className="uc-check-d">{check.description}</div>}
      {api.oneOf && <div className="uc-check-d">Fill in just one of the boxes below.</div>}

      <div className="uc-form">
        {visibleInputs.map((input) => (
          <label key={input.key} className={`uc-field${isDate(input) ? ' date' : ''}`}>
            <span>{labelOf(input)}{input.optional && !api.oneOf ? ' (optional)' : ''}</span>
            <input
              className={`uc-input${isDate(input) ? '' : ' mono'}`}
              type={isDate(input) ? 'date' : 'text'}
              value={valueOf(input)}
              onChange={(e) => { const v = input.upper ? e.target.value.toUpperCase() : e.target.value; setEdited((prev) => ({ ...prev, [input.key]: v })) }}
              onKeyDown={(e) => { if (e.key === 'Enter') run() }}
              placeholder={isDate(input) ? '' : placeholderOf(input)}
            />
          </label>
        ))}
        <Button onClick={run} disabled={busy}>
          {busy ? <><Icon name="loader-2" className="uc-spin" />Checking…</> : <><Icon name="search" />{check.button || 'Check'}</>}
        </Button>
      </div>

      {busy && <div className="uc-busy">Government systems can take up to a minute to answer. Please wait.</div>}

      {error && <div className="ix-error" role="alert"><Icon name="alert-triangle" />{error}</div>}

      {parsed && (
        <div className="uc-result">
          {stale && (
            <div className="uc-note">
              This answer is for <span className="mono">{Object.values(result.params).join(' / ')}</span>. The numbers above have changed, so press the button to check again.
            </div>
          )}
          <div className={`uc-answer ${toneOf(parsed.tone, parsed.found)}`}><div>{parsed.summary}</div></div>
          {parsed.note && <div className="uc-meta">{parsed.note}</div>}

          {parsed.fields?.length > 0 && (
            <dl className="uc-kv">
              {parsed.fields.map((f, i) => (
                <div key={i}>
                  <dt>{f.label}</dt>
                  <dd>{f.value ?? <span className="uc-dash">—</span>}</dd>
                </div>
              ))}
            </dl>
          )}

          {(parsed.tables || []).map((t, ti) => t.rows?.length > 0 && (
            <ResultTable key={ti} table={t} highlight={jobMarks} labelStyle={TABLE_LABEL} />
          ))}
        </div>
      )}

      {result?.checked_at && (
        <div className="uc-meta">
          Last checked {fmtDateTime(result.checked_at)}{result.checked_by_name ? ` by ${result.checked_by_name}` : ''}
        </div>
      )}
      {note && <div className="uc-meta warn">{note}</div>}
    </div>
  )
}

// Answer tone → status colour. Green only for a good answer (done / valid),
// amber for "not yet / check this", red for a real problem, teal for plain facts.
function toneOf(tone, found) {
  const t = tone || (found ? 'good' : 'warn')
  return { good: 'green', bad: 'red', info: 'teal', warn: 'amber' }[t] || 'amber'
}

// ResultTable takes its caps title style as a prop; same look as the .uc-kv labels
const TABLE_LABEL = { fontSize: 'var(--fs-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)' }
