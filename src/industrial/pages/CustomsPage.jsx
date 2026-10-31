import { useMemo, useRef, useState } from 'react'
import { journeyFor, isExportJob } from '../../services/journey'
import { markBeFiled, markSbFiled } from '../../services/jobActions'
import UlipCheck from '../../components/ulip/UlipCheck'
import { CUSTOMS_TAB_GROUPS, SHIP_GROUPS } from '../../components/ulip/ulipChecks'
import { JobPicker, CustomsWorkspace, DayTag } from '../JobChecks'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import { useAutoChecks, checkCustoms, isDue, COOLDOWN_MIN } from '../autoChecks'
import AutoStatus from '../AutoStatus'
import { Icon, JobNo, Status, PhaseStatus, Chip, FreeDays, Dash, Button, Segmented, PageHead, Panel, EmptyState, Skeleton, worst, fmtDate, fmtDateTime } from '../ui'
import '../styles/customs.css'

// BE & OOC desk (Control tower, Jose 31 Oct 2026). Imports: the work list on the
// left (waiting for OOC oldest BE first, OOC granted, BE to file), and on the right
// the picked job's customs facts and checks, or the whole queue as a table when no
// job is picked. Exports: SB & LEO queues.
// Opening the page checks customs by itself for import jobs still waiting for
// OOC (see autoChecks.js for the limits). Once OOC is granted a job is never
// checked again. Every other check runs only when its button is pressed.

const SHOW_FIRST = 20
const LEO_CHECK = { api: 'ICEGATE/06', title: 'Has LEO been given?', button: 'Check LEO', refs: { sbNo: 'sb_no', sbDt: 'sb_date' } }

const plainSaveError = (msg) => (/permission|policy|row-level|not allowed|denied|no permission/i.test(msg || '') ? "You don't have permission to change this job." : msg)
// oldest first, a missing date last
const byDate = (get) => (a, b) => {
  const x = get(a), y = get(b)
  if (!x) return y ? 1 : 0
  if (!y) return -1
  return String(x).localeCompare(String(y))
}
// the row's 3px edge: the job's worst problem (same rule as Today)
const levelOf = ({ j }) => { const w = worst(j); return w === 'red' || w === 'amber' ? w : '' }
const oocText = (j) => (j.oocDate ? `OOC ${fmtDate(j.oocDate)}` : j.steps?.find((s) => s.id === 'ooc')?.sub || 'OOC recorded by staff')
const whereText = (j) => j.steps?.find((s) => s.id === 'out')?.sub || null

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
        aria-label={dateLabel} title={dateLabel} />
      <Button size="sm" variant="primary" disabled={busy} onClick={() => onSave(no, date)}>{busy ? 'Saving…' : 'Save'}</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
    </div>
  )
}

// Exports: one queue (shipping bill to file, waiting for LEO, LEO given)
function Queue({ title, items, empty, note, render }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, SHOW_FIRST)
  return (
    <Panel title={title} meta={String(items.length)} className="cu-q">
      {note && items.length > 0 && <div className="cu-grp-note">{note}</div>}
      <div className="cu-qbody">
        {items.length === 0 ? <EmptyState line icon="circle-check" title={empty} /> : shown.map(render)}
      </div>
      {items.length > SHOW_FIRST && (
        <button type="button" className="ix-more" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${items.length}`}</button>
      )}
    </Panel>
  )
}

// No job picked: the whole import queue as one table, a row per job
function QueueTable({ groups, onSelect }) {
  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  if (!total) {
    return (
      <Panel title="Customs queue">
        <EmptyState icon="circle-check" tone="green" title="Nothing waiting at customs">
          No BE to file, no BE waiting for OOC and no job with OOC granted still to move.
        </EmptyState>
      </Panel>
    )
  }
  return (
    <Panel title="Customs queue" meta="Pick a job to see its BE, OOC and checks" className="cu-queue">
      <div className="ix-tbl-wrap">
        <table className="ix-tbl click">
          <thead><tr>
            <th className="lvl" /><th>Job</th><th>Client</th><th>BE no</th><th>BE date</th>
            <th className="r">Since BE</th><th>Customs stage</th><th>Last checked</th><th>OOC</th>
          </tr></thead>
          <tbody>
            {groups.filter((g) => g.rows.length).map((g) => [
              <tr key={`g-${g.title}`} className="grp"><td className="lvl" /><td colSpan={8}>{g.title}<span className="n">{g.rows.length}</span></td></tr>,
              ...g.rows.map((r) => {
                const { job, j } = r
                const waiting = j.beFiled && !j.oocDone
                return (
                  <tr key={job.id} className={levelOf(r)} onClick={() => onSelect(job.id)} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') onSelect(job.id) }}>
                    <td className="lvl" />
                    <td><JobNo no={job.job_no} /></td>
                    <td className="cl">{job.client || <Dash />}</td>
                    <td className="mono">{job.be_no || <Dash />}</td>
                    <td>{job.be_date ? fmtDate(job.be_date) : <Dash />}</td>
                    <td className="r">{waiting ? <DayTag since={job.be_date} /> : <Dash />}</td>
                    {/* once OOC is granted the stage reads as everywhere else (amber 'To move';
                        green only once delivered), the OOC column has the date */}
                    <td>{j.oocDone ? <PhaseStatus job={job} j={j} />
                      : j.beStage ? <Status tone={j.beStage.tone}>{j.beStage.short}</Status>
                        : waiting ? <span className="ix-dash">Not set</span> : <Status tone="grey">BE to file</Status>}</td>
                    <td className="dim">{j.customs?.checked_at ? fmtDateTime(j.customs.checked_at) : <Dash />}</td>
                    <td>{j.oocDate ? fmtDate(j.oocDate) : j.oocDone ? <span className="ix-dash">{oocText(j)}</span> : <Dash />}</td>
                  </tr>
                )
              }),
            ])}
          </tbody>
        </table>
      </div>
      <div className="ix-tbl-foot">{total} {total === 1 ? 'job' : 'jobs'} at customs or just through it</div>
    </Panel>
  )
}

export default function CustomsPage({ currentUserName, onOpenJob, showToast, canEditBE, canUpdateStage }) {
  const { data, active, rows, loading, error, refresh, patchJob } = useJourney()
  const [view, rowsAdd] = useOverlay(data, active)
  const [kind, setKind] = useState('import')
  const fresh = useFreshOnOpen()

  // jobs waiting for OOC whose last customs answer is older than the cool-down
  const toCheck = active
    // (a BE filed before the ship came in is checked too: an OOC must never be missed)
    .filter(({ job, j }) => !isExportJob(job) && (j.phase === 'ooc' || (j.phase === 'arrival' && j.beFiled)) && /^\d{7}$/.test(String(job.be_no || '').trim()) && job.be_date)
    .filter(({ job }) => { const cs = data?.customsByJob?.[job.id]; return isDue(cs?.checked_at, cs?.last_error_at) })
    .map(({ job }) => ({
      key: job.id, label: job.job_no,
      run: async () => { const r = await checkCustoms(job.id); if (r.oocDate) showToast?.(`OOC granted — ${job.job_no}`, 'success') },
    }))
  const auto = useAutoChecks(toCheck, fresh, refresh)
  const [selId, setSelId] = useState(() => new URLSearchParams(window.location.search).get('job'))
  const setJobParam = (id) => {
    const params = new URLSearchParams(window.location.search)
    if (id) params.set('job', id)
    else params.delete('job')
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }
  const select = (id) => { setSelId(id); setJobParam(id) }
  const unselect = () => { setSelId(null); setJobParam(null) }
  const [busyId, setBusyId] = useState(null)      // the one action running on this page
  const [formFor, setFormFor] = useState(null)    // job id with the BE / SB form open
  const [leoFor, setLeoFor] = useState(null)      // job id with the LEO check open
  const [rowErrors, setRowErrors] = useState({})
  const lock = useRef(false)

  const setErr = (id, msg) => setRowErrors((p) => ({ ...p, [id]: msg }))
  const anyBusy = busyId !== null

  const mine = view.filter((r) => (kind === 'export' ? isExportJob(r.job) : !isExportJob(r.job)))
  const inPhase = (...ids) => mine.filter((r) => ids.includes(r.j.phase))
  // imports: oldest BE first, so the longest wait is on top (audit, 31 Oct 2026)
  const waiting = inPhase('ooc').sort(byDate((r) => r.job.be_date))
  const toMove = inPhase('release').sort(byDate((r) => r.j.oocDate))
  const toFile = inPhase('docs').sort(byDate((r) => r.j.arrivedAt))
  // a BE filed before the ship came in: waits for the ship first (still checked for OOC)
  const advance = mine.filter((r) => r.j.phase === 'arrival' && r.j.beFiled).sort(byDate((r) => r.job.be_date))
  const lastCheck = active.filter((r) => !isExportJob(r.job)).map((r) => r.j.customs?.checked_at).filter(Boolean).sort().at(-1)

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

  // ── import list groups (left list and the queue table share them) ──
  const groups = [
    { title: 'Waiting for OOC', rows: waiting, empty: 'No BE waiting for OOC.', level: levelOf,
      sub: ({ job, j }) => <>BE <span className="mono">{job.be_no}</span> · {fmtDate(job.be_date)}{j.beStage ? ` · ${j.beStage.short}` : ''}</>,
      tag: ({ job }) => <DayTag since={job.be_date} /> },
    { title: 'OOC granted — to move', rows: toMove, empty: 'No job with OOC granted still to move.', level: levelOf,
      sub: ({ j }) => [oocText(j), whereText(j)].filter(Boolean).join(' · '),
      tag: ({ j }) => <>{j.onwardMode === 'rail' && <Chip>Rail</Chip>}<FreeDays value={j.freeDaysLeft} /></> },
    { title: 'BE to file', rows: toFile, empty: 'No BE to file.', level: levelOf,
      sub: ({ job, j }) => [j.arrivedAt ? `Arrived ${fmtDate(j.arrivedAt)}` : job.eta ? `ETA ${fmtDate(job.eta)}` : null, job.mode].filter(Boolean).join(' · ') || 'File in LiveImpex',
      tag: () => <Chip>LiveImpex</Chip> },
    { title: 'BE filed — ship not in yet', rows: advance, empty: 'No BE filed ahead of arrival.', level: levelOf,
      sub: ({ job }) => <>BE <span className="mono">{job.be_no}</span> · {fmtDate(job.be_date)}{job.eta ? ` · ETA ${fmtDate(job.eta)}` : ''}</>,
      tag: () => <Status tone="blue">Ship due</Status> },
  ]

  // ── export rows ──
  const rowView = ({ job, sub, tag, action, children }) => (
    <div key={job.id}>
      <div className="cu-qrow">
        <div className="what" role="button" tabIndex={0} onClick={() => onOpenJob?.(job.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpenJob?.(job.id) }}>
          <div className="t"><JobNo no={job.job_no} /><span className="cl">{job.client || 'No client'}</span></div>
          <div className="m">{sub}</div>
        </div>
        {tag}
        {action}
      </div>
      {children}
      {busyId === job.id && <div className="cu-note">Government systems can take up to a minute to answer. Please wait.</div>}
      {rowErrors[job.id] && <div className="ix-error"><Icon name="alert-triangle" /> {rowErrors[job.id]}</div>}
    </div>
  )

  const renderSbToFile = ({ job }) => rowView({
    job,
    sub: [job.mode, job.port, job.eta ? `ETD/ETA ${fmtDate(job.eta)}` : null].filter(Boolean).join(' · ') || 'Shipping bill not recorded yet',
    action: !canEditBE || formFor === job.id ? null : (
      <Button size="sm" icon="plus" disabled={anyBusy} onClick={() => { setFormFor(job.id); setErr(job.id, '') }}>Record SB no</Button>
    ),
    children: <>
      {!canEditBE && <div className="cu-note">Ask Akshyani or an admin to record the shipping bill.</div>}
      {canEditBE && formFor === job.id && (
        <FiledForm numLabel="Shipping bill number (7 digits)" dateLabel="Shipping bill date" busy={busyId === job.id}
          onCancel={() => setFormFor(null)} onSave={(no, date) => saveFiled(job, 'sb', { sbNo: no, sbDate: date })} />
      )}
    </>,
  })

  const renderWaitingLeo = ({ job, j }) => rowView({
    job,
    sub: <>SB <span className="mono">{j.sbNo}</span> · {fmtDate(job.ulip_refs?.sb_date)}</>,
    tag: <DayTag since={job.ulip_refs?.sb_date} />,
    action: (
      <Button size="sm" variant={leoFor === job.id ? 'ghost' : 'secondary'} disabled={anyBusy} onClick={() => setLeoFor((v) => (v === job.id ? null : job.id))}>
        {leoFor === job.id ? 'Close' : 'Check LEO'}
      </Button>
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

  const switchKind = (k) => { setKind(k); setFormFor(null); setLeoFor(null) }
  const isImport = kind === 'import'
  const sub = isImport
    ? [`${waiting.length} waiting for OOC`, `${toMove.length} OOC granted, to move`, `${toFile.length} BE to file`]
    : [`${inPhase('sb').length} shipping bills to file`, `${inPhase('leo').length} waiting for LEO`, `${inPhase('sail').length} LEO given`]

  return (
    <>
      <PageHead title={isImport ? 'BE & OOC' : 'Shipping bill & LEO'} sub={data ? sub : 'File in LiveImpex, record it here, then follow it'}
        actions={<>
          <Segmented label="Imports or exports" value={kind} onChange={switchKind}
            options={[{ value: 'import', label: 'Imports' }, { value: 'export', label: 'Exports' }]} />
          <Button size="sm" variant="ghost" icon="refresh" onClick={refresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        </>} />

      {/* the honest promise: customs is checked when this page opens, not round the clock (audit, 31 Oct 2026) */}
      {isImport && <AutoStatus auto={auto} fresh={fresh} what="customs"
        idle={waiting.length || advance.length
          ? `Customs is checked when this page opens, each job at most every ${COOLDOWN_MIN} min${lastCheck ? ` · last check ${fmtDateTime(lastCheck)}` : ''}. Jobs with OOC granted are not checked again.`
          : 'No job is waiting for OOC, so there is nothing to check.'} />}

      {error && (
        <div className="ix-error">
          Could not load the latest data — {error}.{' '}
          <Button size="sm" onClick={refresh} style={{ marginLeft: 8 }}>Refresh</Button>
        </div>
      )}

      {loading && !data ? (
        <div className="ix-card"><Skeleton rows={6} /></div>
      ) : error ? null : isImport ? (
        <div className={`cu-desk${selId ? ' has-sel' : ''}`}>
          <JobPicker
            title="Customs work list"
            rows={rows.filter((r) => !isExportJob(r.job))}
            selectedId={selId}
            onSelect={select}
            placeholder="Any import job: job no, client, BE, container…"
            lists={groups}
          />
          {selId
            ? <CustomsWorkspace jobId={selId} onOpenJob={onOpenJob} canEditBE={canEditBE} canUpdateStage={canUpdateStage} onClose={unselect}
                currentUserName={currentUserName} showToast={showToast} groups={[...CUSTOMS_TAB_GROUPS, ...SHIP_GROUPS]} />
            : <QueueTable groups={groups} onSelect={select} />}
        </div>
      ) : (
        <div className="ix-queues">
          <Queue title="Shipping bill to file" items={inPhase('sb')}
            empty="No shipping bills waiting to be filed." render={renderSbToFile} />
          <Queue title="Waiting for LEO" items={inPhase('leo').sort(byDate((r) => r.job.ulip_refs?.sb_date))}
            note="Each check asks Customs. Check when you expect LEO." empty="No jobs waiting for LEO." render={renderWaitingLeo} />
          <Queue title="LEO given" items={inPhase('sail')}
            empty="No jobs with LEO given right now." render={renderLeoGiven} />
        </div>
      )}
    </>
  )
}
