import { useEffect, useMemo, useState } from 'react'
import { loadJourneyData, journeyFor, activeRows, isDetentionRisk, containersInPlay, STALE_AFTER_DAYS } from '../../services/journey'
import { useJourney } from '../../industrial/JourneyContext'
import { PageHead, KpiStrip, Kpi, JobNo, FreeDays, Status, Dash, EmptyState, Toolbar, Skeleton, Icon, fmtDate, fmtDateTime } from '../../industrial/ui'
import '../../industrial/industrial.css'
import '../../industrial/styles/records.css'

// Free days and detention risk, per container. Reads saved data only, never a
// government check. Rows and counts come from the shared journey facts, so the
// tiles, the sidebar badge and Today show the same numbers (Jose, 31 Oct 2026).

// The staff dashboard shows this page outside the industrial shell (no shared
// journey there): load the same data once and build the same facts.
function useDetentionFacts() {
  const shared = useJourney()
  const inShell = !!shared
  const [own, setOwn] = useState(null)
  useEffect(() => {
    if (inShell) return undefined
    let cancelled = false
    ;(async () => {
      let d = null
      let err
      try {
        d = await loadJourneyData()
        err = d?.error || null
      } catch (e) {
        err = e?.message || 'Something went wrong'
      }
      if (cancelled) return
      if (!d) { setOwn({ error: err, facts: { detention: [], containers: [] } }); return }
      const active = activeRows(d.jobs.map((job) => ({ job, j: journeyFor(job, d) })))
      setOwn({ error: err, facts: { detention: active.filter((r) => isDetentionRisk(r.j)), containers: containersInPlay(active, d) } })
    })()
    return () => { cancelled = true }
  }, [inShell])
  if (inShell) return { inShell, loading: !shared.data && shared.loading, error: shared.error, facts: shared.facts, refresh: shared.refresh }
  return { inShell, loading: !own, error: own?.error || null, facts: own?.facts || { detention: [], containers: [] } }
}

// where the box is → dot colour (teal at port / CFS, navy moving, green done, grey unknown)
const WHERE_TONE = { port: 'teal', to_cfs: 'blue', cfs: 'teal', out: 'blue', road: 'blue', rail: 'blue', collected: 'green', empty_back: 'green', not_arrived: 'grey', unknown: 'grey' }
const LEVEL_ROW = { over: 'red', risk: 'red', soon: 'amber' }
const NONE = Number.POSITIVE_INFINITY
const daysOf = (c) => (c.freeLeft === null || c.freeLeft === undefined ? NONE : c.freeLeft)

// worst job first, a job's boxes together (worst box first); unknown days last
function sortWorstFirst(list) {
  const worst = {}
  for (const c of list) worst[c.jobId] = Math.min(worst[c.jobId] ?? NONE, daysOf(c))
  const diff = (x, y) => (x === y ? 0 : x === NONE ? 1 : y === NONE ? -1 : x - y)
  return [...list].sort((a, b) => diff(worst[a.jobId], worst[b.jobId])
    || String(a.jobNo).localeCompare(String(b.jobNo), undefined, { numeric: true })
    || diff(daysOf(a), daysOf(b)) || a.no.localeCompare(b.no))
}

function whereTitle(c) {
  const e = c.lastEvent
  if (!e) return c.whereSince ? `Since ${fmtDateTime(c.whereSince)} IST` : undefined
  return [e.label, e.at && `${fmtDateTime(e.at)} IST`, e.place].filter(Boolean).join(' · ')
}

export default function DetentionPage({ onOpenJob }) {
  const { inShell, loading, error, facts, refresh } = useDetentionFacts()
  const [filter, setFilter] = useState('')
  const [q, setQ] = useState('')
  const [showStale, setShowStale] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const all = facts.containers
  const riskJobIds = useMemo(() => new Set(facts.detention.map((r) => r.job.id)), [facts.detention])
  // finished boxes and boxes with no movement for 30+ days are kept apart, so the
  // main table only holds boxes whose free time is still running (audit, 31 Oct 2026)
  const { main, stale, done } = useMemo(() => {
    const live = all.filter((c) => !c.finishedOn)
    return { main: live.filter((c) => !c.stale), stale: live.filter((c) => c.stale), done: all.filter((c) => c.finishedOn) }
  }, [all])

  const FILTERS = {
    risk: (c) => riskJobIds.has(c.jobId),
    over: (c) => c.level === 'over',
    two: (c) => c.level === 'risk',
    soon: (c) => c.level === 'soon',
    unknown: (c) => c.freeLeft === null,
  }
  const n = (id) => main.filter(FILTERS[id]).length
  const over = main.filter(FILTERS.over)
  const longest = over.reduce((m, c) => Math.max(m, c.detentionDays || 0), 0)
  const worstJob = sortWorstFirst(main.filter(FILTERS.risk))[0]
  const toggle = (id) => setFilter((f) => (f === id ? '' : id))

  const needle = q.trim().toUpperCase()
  const match = (c) => !needle || [c.jobNo, c.client, c.no, c.line].some((v) => String(v || '').toUpperCase().includes(needle))
  const shownMain = filter === 'stale' ? [] : sortWorstFirst(main.filter((c) => (!filter || FILTERS[filter](c)) && match(c)))
  const shownStale = sortWorstFirst(stale.filter(match))
  const shownDone = sortWorstFirst(done.filter(match))
  const staleOpen = showStale || filter === 'stale'

  const row = (c, i, list, kind) => {
    const first = i === 0 || list[i - 1].jobId !== c.jobId
    const sameBelow = i < list.length - 1 && list[i + 1].jobId === c.jobId
    const open = () => onOpenJob?.(c.jobId, 'details')
    const level = kind === 'main' ? LEVEL_ROW[c.level] || '' : ''
    return (
      <tr key={`${kind}-${c.jobId}-${c.no}`} className={`${level}${sameBelow ? ' same-below' : ''}`} onClick={open}>
        <td className="lvl" />
        <td>{first ? <JobNo no={c.jobNo} onClick={open} /> : null}</td>
        <td className="cl" title={first ? c.client || '' : undefined}>{first ? (c.client || <Dash />) : null}</td>
        <td className="mono">{c.no}{c.size ? <span className="rec-x">{c.size}</span> : null}</td>
        <td className="dim">{c.portInAt ? fmtDate(c.portInAt) : <Dash />}</td>
        <td>{c.freeTill ? fmtDate(c.freeTill) : <Dash />}</td>
        <td className="r">
          {kind === 'stale' ? <span className="muted">{c.lastMoveDays} d no move</span> : <FreeDays value={c.freeLeft} />}
        </td>
        <td className="wide" title={whereTitle(c)}>
          {c.tracked
            ? <Status tone={WHERE_TONE[c.where] || 'grey'} sub={c.whereSince && kind !== 'done' ? `since ${fmtDate(c.whereSince)}` : undefined}>{c.whereText}</Status>
            : <span className="ix-st hollow">No tracking yet</span>}
        </td>
      </tr>
    )
  }

  const nothing = main.length === 0 && stale.length === 0 && done.length === 0
  const table = (
    <section className="ix-card rec-panel">
      <Toolbar search={q} onSearch={setQ} placeholder="Job, client or container"
        right={filter ? <button type="button" className="ix-link" onClick={() => setFilter('')}>Show all containers</button> : null} />
      {nothing ? (
        <EmptyState icon="shield-check" tone="green" title="No containers at risk">
          No open import job has containers waiting. They show here once a job has container numbers.
        </EmptyState>
      ) : (
        <div className="ix-tbl-wrap rec-wrap">
          <table className="ix-tbl click rec-tbl">
            <thead>
              <tr>
                <th className="lvl" /><th>Job</th><th>Client</th><th>Container</th><th>Port in</th>
                <th>Free till</th><th className="r sorted">Days left <Icon name="arrow-up" /></th><th>Where now</th>
              </tr>
            </thead>
            <tbody>
              {shownMain.length === 0 && filter !== 'stale' && (
                <tr className="grp"><td colSpan={8}>{main.length === 0 ? 'No containers with free time running' : 'Nothing matches'}</td></tr>
              )}
              {shownMain.map((c, i) => row(c, i, shownMain, 'main'))}
              {staleOpen && (
                <tr className="grp"><td colSpan={8}>Needs a look · no movement for {STALE_AFTER_DAYS}+ days, finished? <span className="n">{shownStale.length}</span></td></tr>
              )}
              {staleOpen && shownStale.map((c, i) => row(c, i, shownStale, 'stale'))}
              {showDone && (
                <tr className="grp"><td colSpan={8}>Finished on open jobs <span className="n">{shownDone.length}</span></td></tr>
              )}
              {showDone && shownDone.map((c, i) => row(c, i, shownDone, 'done'))}
            </tbody>
          </table>
        </div>
      )}
      {stale.length > 0 && filter !== 'stale' && (
        <button type="button" className="rec-toggle" onClick={() => setShowStale((v) => !v)} aria-expanded={showStale}>
          <Icon name={showStale ? 'chevron-down' : 'chevron-right'} />Needs a look<span className="n">· {stale.length} with no movement for {STALE_AFTER_DAYS}+ days</span>
        </button>
      )}
      {done.length > 0 && (
        <button type="button" className="rec-toggle" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
          <Icon name={showDone ? 'chevron-down' : 'chevron-right'} />Show finished<span className="n">· {done.length} empty back or collected</span>
        </button>
      )}
    </section>
  )

  const page = (
    <>
      <PageHead title="Detention"
        sub={loading ? 'Loading…' : [`${main.length} container${main.length === 1 ? '' : 's'} on open import jobs`, 'free time runs until the empty is back', 'fewest days first']} />
      {error && (
        <div className="ix-error">
          Could not load the latest data — {error}.
          {refresh ? <button type="button" className="ix-link" onClick={refresh}>Try again</button> : ' Reload the page to try again.'}
        </div>
      )}
      <KpiStrip>
        <Kpi label="Jobs at risk" dot="red" value={loading ? null : facts.detention.length}
          tone={facts.detention.length ? 'red' : undefined}
          sub={worstJob ? <><JobNo no={worstJob.jobNo} />{worstJob.freeTill ? ` free till ${fmtDate(worstJob.freeTill)}` : ''}</> : '2 free days or less'}
          onClick={() => toggle('risk')} selected={filter === 'risk'} />
        <Kpi label="In detention" value={loading ? null : over.length} unit={over.length === 1 ? 'box' : 'boxes'}
          tone={over.length ? 'red' : undefined} sub={longest ? `longest ${longest} d over` : 'free time over'}
          onClick={() => toggle('over')} selected={filter === 'over'} />
        <Kpi label="0–2 days left" value={loading ? null : n('two')} tone={n('two') ? 'red' : undefined} sub="act today"
          onClick={() => toggle('two')} selected={filter === 'two'} />
        <Kpi label="3–5 days left" value={loading ? null : n('soon')} tone={n('soon') ? 'amber' : undefined} sub="plan the move"
          onClick={() => toggle('soon')} selected={filter === 'soon'} />
        <Kpi label="Free days not known" value={loading ? null : n('unknown')} sub="no tracking or free days yet"
          onClick={() => toggle('unknown')} selected={filter === 'unknown'} />
        <Kpi label="Needs a look" value={loading ? null : stale.length} sub={`no movement ${STALE_AFTER_DAYS}+ days`}
          onClick={() => toggle('stale')} selected={filter === 'stale'} />
      </KpiStrip>
      {loading ? <div className="ix-card"><Skeleton rows={6} /></div> : table}
    </>
  )

  // inside the shell the frame (padding, background) comes from AdminDashboard
  return inShell ? page : <div className="ix ix-page rec-standalone">{page}</div>
}
