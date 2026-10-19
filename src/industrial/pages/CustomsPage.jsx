import { useMemo, useRef, useState } from 'react'
import { journeyFor, isExportJob } from '../../services/journey'
import { markBeFiled, markSbFiled } from '../../services/jobActions'
import UlipCheck from '../../components/ulip/UlipCheck'
import { CUSTOMS_TAB_GROUPS, SHIP_GROUPS } from '../../components/ulip/ulipChecks'
import { JobPicker, CustomsWorkspace, NoJobChosen } from '../JobChecks'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import { useAutoChecks, checkCustoms, isDue, COOLDOWN_MIN } from '../autoChecks'
import AutoStatus from '../AutoStatus'
import { Icon, fmtDate, timeAgo } from '../ui'

// BE & OOC desk. Imports: pick a job on the left, see and run all its customs
// checks on the right (BE, OOC, cargo, IGM …). Exports: SB & LEO queues.
// Opening the page checks customs by itself for import jobs still waiting for
// OOC (see autoChecks.js for the limits). Once OOC is granted a job is never
// checked again.

const SHOW_FIRST = 20
const LEO_CHECK = { api: 'ICEGATE/06', title: 'Has LEO been given?', button: 'Check LEO', refs: { sbNo: 'sb_no', sbDt: 'sb_date' } }

const daysSince = (v) => {
  if (!v) return null
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v)
  return isNaN(d) ? null : Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}
const filedText = (v) => { const n = daysSince(v); return n === null ? '' : n === 0 ? 'filed today' : n === 1 ? 'filed 1 day ago' : `filed ${n} days ago` }
const plainSaveError = (msg) => (/permission|policy|row-level|not allowed|denied|no permission/i.test(msg || '') ? "You don't have permission to change this job." : msg)

// Answers from checks made on this page, laid over the loaded data until the next full load
function useOverlay(data, rows) {
  const [extra, setExtra] = useState({ loadedAt: null, customs: {}, results: {} })
  const add = (kind, jobId, value) => setExtra((p) => {
    const base = p.loadedAt === data?.loadedAt ? p : { loadedAt: data?.loadedAt, customs: {}, results: {} }
    const id = String(jobId)
    return kind === 'customs'
      ? { ...base, customs: { ...base.customs, [id]: value } }
      : { ...base, results: { ...base.results, [id]: { ...(base.results[id] || {}), ...value } } }
  })
  const view = useMemo(() => {
    if (!data || extra.loadedAt !== data.loadedAt) return rows
    const ids = new Set([...Object.keys(extra.customs), ...Object.keys(extra.results)])
    if (!ids.size) return rows
    const resultsByJob = { ...data.resultsByJob }
    for (const [id, r] of Object.entries(extra.results)) resultsByJob[id] = { ...(data.resultsByJob[id] || {}), ...r }
    const d2 = { ...data, customsByJob: { ...data.customsByJob, ...extra.customs }, resultsByJob }
    return rows.map((r) => (ids.has(String(r.job.id)) ? { job: r.job, j: journeyFor(r.job, d2) } : r))
  }, [data, rows, extra])
  return [view, add]
}

function FiledForm({ initialNo, numLabel, dateLabel, busy, onSave, onCancel }) {
  const [no, setNo] = useState(String(initialNo || '').replace(/\D/g, '').slice(0, 7))
  const [date, setDate] = useState('')
  return (
    <div className="ix-q-form">
      <input value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, '').slice(0, 7))} inputMode="numeric" maxLength={7}
        placeholder={numLabel} aria-label={numLabel} autoFocus />
      <input type="date" max={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)}
        aria-label={dateLabel} title={dateLabel} style={{ fontFamily: 'Inter, sans-serif' }} />
      <button type="button" className="ix-btn sm primary" disabled={busy} onClick={() => onSave(no, date)}>{busy ? 'Saving…' : 'Save'}</button>
      <button type="button" className="ix-btn sm ghost" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  )
}

function Queue({ title, icon, color, items, empty, note, render }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, SHOW_FIRST)
  return (
    <div className="ix-card">
      <div className="ix-card-head">
        <Icon name={icon} style={{ color }} />
        <h2>{title}</h2>
        <span className="ix-chip grey" style={{ marginLeft: 6 }}>{items.length}</span>
      </div>
      {note && <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>{note}</div>}
      <div className="ix-q-list">
        {items.length === 0 && <div className="ix-empty">{empty}</div>}
        {shown.map(render)}
      </div>
      {items.length > SHOW_FIRST && (
        <button type="button" className="ix-more" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${items.length}`}</button>
      )}
    </div>
  )
}

export default function CustomsPage({ currentUserName, onOpenJob, showToast, canEditBE, canUpdateStage }) {
  const { data, active, loading, error, refresh, patchJob } = useJourney()
  const [view, rowsAdd] = useOverlay(data, active)
  const [kind, setKind] = useState('import')
  const { rows } = useJourney()
  const fresh = useFreshOnOpen()

  // jobs waiting for OOC whose last customs answer is older than the cool-down
  const toCheck = active
    .filter(({ job, j }) => !isExportJob(job) && j.phase === 'ooc' && /^\d{7}$/.test(String(job.be_no || '').trim()) && job.be_date)
    .filter(({ job }) => { const cs = data?.customsByJob?.[job.id]; return isDue(cs?.checked_at, cs?.last_error_at) })
    .map(({ job }) => ({
      key: job.id, label: job.job_no,
      run: async () => { const r = await checkCustoms(job.id); if (r.oocDate) showToast?.(`OOC granted — ${job.job_no}`, 'success') },
    }))
  const auto = useAutoChecks(toCheck, fresh, refresh)
  const waitingOoc = active.filter(({ job, j }) => !isExportJob(job) && j.phase === 'ooc').length
  const [selId, setSelId] = useState(() => new URLSearchParams(window.location.search).get('job'))
  const select = (id) => {
    setSelId(id)
    const params = new URLSearchParams(window.location.search)
    params.set('job', id)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }
  const [busyId, setBusyId] = useState(null)      // the one action running on this page
  const [formFor, setFormFor] = useState(null)    // job id with the BE / SB form open
  const [leoFor, setLeoFor] = useState(null)      // job id with the LEO check open
  const [rowErrors, setRowErrors] = useState({})
  const [rowNotes] = useState({})
  const lock = useRef(false)

  const setErr = (id, msg) => setRowErrors((p) => ({ ...p, [id]: msg }))
  const anyBusy = busyId !== null

  const mine = view.filter((r) => (kind === 'export' ? isExportJob(r.job) : !isExportJob(r.job)))
  const inPhase = (...ids) => mine.filter((r) => ids.includes(r.j.phase))

  // ── actions ──
  const saveFiled = async (job, which, values) => {
    if (lock.current) return
    lock.current = true
    setBusyId(job.id); setErr(job.id, '')
    let res
    try {
      res = which === 'be' ? await markBeFiled(job, values, currentUserName) : await markSbFiled(job, values, currentUserName)
    } finally {
      lock.current = false
      setBusyId(null)
    }
    if (!res.ok) { setErr(job.id, plainSaveError(res.error)); return }
    patchJob(res.job)
    setFormFor(null)
    showToast?.(which === 'be' ? `BE saved for ${job.job_no}` : `Shipping bill saved for ${job.job_no}`, 'success')
  }

  // ── rows ──
  const rowView = ({ job, sub, action, children }) => (
    <div key={job.id}>
      <div className="ix-q-row">
        <div className="what" role="button" tabIndex={0} onClick={() => onOpenJob?.(job.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpenJob?.(job.id) }}>
          <b>{job.job_no}</b> <span style={{ color: 'var(--text-2)' }}>· {job.client || 'No client'}</span>
          <div className="s">{sub}</div>
        </div>
        {action}
      </div>
      {children}
      {busyId === job.id && <div style={{ padding: '0 16px 10px', fontSize: 12, color: 'var(--muted)' }}>Government systems can take up to a minute to answer. Please wait.</div>}
      {rowNotes[job.id] && busyId !== job.id && <div style={{ padding: '0 16px 10px', fontSize: 13, fontWeight: 600 }}>{rowNotes[job.id]}</div>}
      {rowErrors[job.id] && <div className="ix-error" style={{ margin: '0 16px 10px' }}><Icon name="alert-triangle" /> {rowErrors[job.id]}</div>}
    </div>
  )

  const renderSbToFile = ({ job }) => rowView({
    job,
    sub: [job.mode, job.port, job.eta ? `ETD/ETA ${fmtDate(job.eta)}` : null].filter(Boolean).join(' · ') || 'Shipping bill not recorded yet',
    action: !canEditBE ? null : formFor === job.id ? null : (
      <button type="button" className="ix-btn sm" disabled={anyBusy} onClick={() => { setFormFor(job.id); setErr(job.id, '') }}>
        <Icon name="plus" />Record SB no
      </button>
    ),
    children: <>
      {!canEditBE && <div style={{ padding: '0 16px 10px', fontSize: 12, color: 'var(--muted)' }}>Ask Akshyani or an admin to record the shipping bill.</div>}
      {canEditBE && formFor === job.id && (
        <FiledForm numLabel="Shipping bill number (7 digits)" dateLabel="Shipping bill date" busy={busyId === job.id}
          onCancel={() => setFormFor(null)} onSave={(no, date) => saveFiled(job, 'sb', { sbNo: no, sbDate: date })} />
      )}
    </>,
  })

  const renderWaitingLeo = ({ job, j }) => rowView({
    job,
    sub: <>SB <span className="mono">{j.sbNo}</span> · {fmtDate(job.ulip_refs?.sb_date)} · {filedText(job.ulip_refs?.sb_date)}</>,
    action: (
      <button type="button" className={`ix-btn sm ${leoFor === job.id ? '' : 'primary'}`} disabled={anyBusy} onClick={() => setLeoFor((v) => (v === job.id ? null : job.id))}>
        {leoFor === job.id ? 'Close' : 'Check LEO'}
      </button>
    ),
    children: leoFor === job.id && (
      <div style={{ padding: '0 16px 12px' }}>
        <UlipCheck check={LEO_CHECK} job={job} compact
          onResult={(row) => {
            if (row) rowsAdd('results', job.id, { [LEO_CHECK.api]: row })
            if (row?.parsed?.extra?.leoDate) showToast?.(`LEO given — ${job.job_no}`, 'success')
          }}
          onJobChange={patchJob} />
      </div>
    ),
  })

  const renderLeoGiven = ({ job, j }) => rowView({
    job,
    sub: <>SB <span className="mono">{j.sbNo}</span> · LEO given {fmtDate(j.leoDate)}</>,
  })

  const kindBtn = (id, label, icon) => (
    <button type="button" className={`ix-btn sm ${kind === id ? 'primary' : ''}`} aria-pressed={kind === id}
      onClick={() => { setKind(id); setFormFor(null); setLeoFor(null) }}>
      <Icon name={icon} />{label}
    </button>
  )

  return (
    <div className="ix-page">
      <div className="ix-page-head">
        <div>
          <h1>{kind === 'import' ? 'BE & OOC' : 'Shipping bill & LEO'}</h1>
          <p>File in LiveImpex, record it here, then follow {kind === 'import' ? 'OOC' : 'LEO'}</p>
        </div>
        <div className="right">
          {kindBtn('import', 'Imports — BE & OOC', 'package')}
          {kindBtn('export', 'Exports — SB & LEO', 'ship')}
          <button type="button" className="ix-btn sm ghost" onClick={refresh} disabled={loading}><Icon name="refresh" />{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      {kind === 'import' && <AutoStatus auto={auto} fresh={fresh} what="customs"
        idle={waitingOoc ? `Customs is checked by itself when you open this page (each job at most every ${COOLDOWN_MIN} min). Jobs with OOC granted are not checked again.` : 'No job is waiting for OOC, so nothing to check.'} />}

      {error && (
        <div className="ix-error">
          Could not load the latest data — {error}.{' '}
          <button type="button" className="ix-btn sm" onClick={refresh} style={{ marginLeft: 8 }}>Refresh</button>
        </div>
      )}

      {loading && !data ? (
        <div className="ix-card"><div className="ix-empty">Loading…</div></div>
      ) : error ? null : kind === 'import' ? (
        <div className="ix-split">
          <JobPicker
            title="Find a job"
            rows={rows.filter((r) => !isExportJob(r.job))}
            selectedId={selId}
            onSelect={select}
            placeholder="Any import job: job no, client, BE, container…"
            lists={[
              { title: 'Waiting for OOC', icon: 'hourglass', color: 'var(--amber)', rows: inPhase('ooc'), empty: 'No jobs waiting for OOC.',
                sub: ({ job, j }) => `BE ${job.be_no} · ${filedText(job.be_date)} · checked ${j.customs?.checked_at ? timeAgo(j.customs.checked_at) : 'never'}` },
              { title: 'OOC granted — next steps', icon: 'circle-check', color: 'var(--green)', rows: inPhase('release'), empty: 'No jobs with OOC granted right now.',
                sub: ({ j }) => `OOC ${j.oocDate ? fmtDate(j.oocDate) : 'recorded by staff'} · truck or rail not arranged` },
            ]}
          />
          {selId
            ? <CustomsWorkspace jobId={selId} onOpenJob={onOpenJob} canEditBE={canEditBE} canUpdateStage={canUpdateStage}
                currentUserName={currentUserName} showToast={showToast} groups={[...CUSTOMS_TAB_GROUPS, ...SHIP_GROUPS]} />
            : <NoJobChosen text="Pick a job on the left to see its customs status: BE, OOC, cargo details, IGM and more. Each check asks Customs only when you press its button." />}
        </div>
      ) : (
        <div className="ix-queues">
          <Queue title="Shipping bill to file" icon="file-text" color="var(--blue)" items={inPhase('sb')}
            empty="No shipping bills waiting to be filed." render={renderSbToFile} />
          <Queue title="Waiting for LEO" icon="hourglass" color="var(--amber)" items={inPhase('leo')}
            note="Each check asks Customs. Check when you expect LEO." empty="No jobs waiting for LEO." render={renderWaitingLeo} />
          <Queue title="LEO given" icon="circle-check" color="var(--green)" items={inPhase('sail')}
            empty="No jobs with LEO given right now." render={renderLeoGiven} />
        </div>
      )}
    </div>
  )
}
