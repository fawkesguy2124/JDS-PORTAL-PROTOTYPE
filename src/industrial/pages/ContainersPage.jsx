import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { refreshAllContainers, forceRefreshAllContainers, fetchLDBTracking, persistLDBTracking } from '../../services/tracking/ldbProvider'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import {
  Icon, PageHead, Button, KpiStrip, Kpi, Tabs, Toolbar, Panel, Section, EmptyState, Status, Chip,
  FreeDays, JobNo, Dash, Skeleton, fmtDate, fmtDateTime, fmtTime, timeAgo,
} from '../ui'
import '../styles/containers.css'

// Containers (Control tower, Jose 31 Oct 2026): one row per container of the open
// import jobs, read from the shared useJourney().facts.containers, so the counts here
// match the sidebar, Today and Detention. Free days, where-now and the trip's events
// all come from journeyCore (src/services/JOURNEY_FACTS.md); nothing is recounted here.

// where-now code → the tab it belongs to
const GROUP = {
  unknown: 'none', not_arrived: 'due', port: 'port', to_cfs: 'port', cfs: 'cfs',
  out: 'out', road: 'out', rail: 'out', collected: 'out', empty_back: 'out',
}
// journey order, for sorting by Where now
const ORDER = { not_arrived: 1, port: 2, to_cfs: 3, cfs: 4, out: 5, road: 6, rail: 6, collected: 7, empty_back: 8, unknown: 9 }
const COLS = 10

const keyOf = (c) => `${c.jobId}:${c.no}`
const isRisk = (c) => !c.finishedOn && (c.level === 'over' || c.level === 'risk')
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// at port / CFS with OOC done and no truck = needs action soon (amber, like 'To move');
// moving is navy, done is green, calm waiting is teal
function whereTone(c, j) {
  if (c.where === 'unknown') return 'grey'
  if (c.where === 'collected' || c.where === 'empty_back') return 'green'
  if (c.where === 'port' || c.where === 'cfs') return j?.readyForTruck ? 'amber' : 'teal'
  return 'blue'
}

function WhereNow({ c, j }) {
  if (c.where === 'unknown') return <span className="ix-st hollow">No tracking yet</span>
  const tone = whereTone(c, j)
  return (
    <Status tone={tone} sub={c.whereSince ? `since ${fmtDate(c.whereSince)}` : null}
      title={tone === 'amber' ? 'OOC done, no truck or rail arranged yet' : undefined}>
      {/* its own span so a long place name is cut with '…' in the table */}
      <span className="ix-cn-wt">{c.whereText}</span>
    </Status>
  )
}

// '2026-11-01' → '2026-11-02' (the day detention starts)
function nextDay(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''))
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1)).toISOString().slice(0, 10)
}

// where an event came from, in plain words (Port, Toll, Rail), never the system name
function eventSource(m) {
  const s = `${m.raw} ${m.label}`.toUpperCase()
  if (/TOLL/.test(s)) return { icon: 'road', word: 'Toll' }
  if (/STATION|RAIL/.test(s)) return { icon: 'train', word: 'Rail' }
  return { icon: 'anchor', word: 'Port' }
}

// nulls (the muted dash) sort last in both directions
function compare(a, b, dir) {
  const na = a === null || a === undefined || a === ''
  const nb = b === null || b === undefined || b === ''
  if (na || nb) return na === nb ? 0 : na ? 1 : -1
  const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en', { numeric: true })
  return dir === 'desc' ? -r : r
}

// The shipping line's own tracking page (kept from the old Containers screen). Sites
// that do not fill the number in get it copied, so staff can paste it.
const LINE_SITES = [
  [/msc/, (n) => `https://www.msc.com/en/track-a-shipment?agencyPath=msc&Type=Container&Information=${n}`],
  [/maersk/, (n) => `https://www.maersk.com/tracking/${n}`],
  [/hapag/, (n) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${n}`],
  [/cma/, (n) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchViewModel.SearchBy=Container&SearchViewModel.Reference=${n}`],
  [/\bone\b|ocean network/, (n) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?ctrack-field=${n}&trakNoParam=${n}`, true],
  [/evergreen/, (n) => `https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do?TYPE=CNTR&CNTR=${n}`, true],
  [/zim/, (n) => `https://www.zim.com/tools/track-a-shipment?consnumber=${n}`, true],
  [/yang ?ming/, (n) => `https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx?SearchType=CNTR_NO&strSearch=${n}`, true],
  [/hmm|hyundai/, (n) => `https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp?trackingType=CNTR&trackingNo=${n}`, true],
  [/cosco/, (n) => `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number=${n}`],
  [/oocl/, (n) => `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?ContainerNo=${n}`, true],
  [/wan ?hai/, (n) => `https://www.wanhai.com/views/cargoTrack/CargoTrack.xhtml?cntrNo=${n}`, true],
  [/\bpil\b|pacific international/, (n) => `https://www.pilship.com/en-PIL-Container-Tracking/114.html?number=${n}`, true],
  [/ts ?line/, (n) => `https://www.tslines.com/cargo_track?cntr_no=${n}`],
  [/sinokor/, (n) => `https://www.sinokor.co.kr/Tracking?blNo=${n}`, true],
  [/emirates/, () => 'https://scekprd.emirates.com/skychain/app?service=page%2Fnwp%3ATrackshipmt&initial=y'],
]
function openLineSite(no, line, toast) {
  const hit = LINE_SITES.find(([re]) => re.test(String(line || '').toLowerCase()))
  const url = hit ? hit[1](no) : `https://www.track-trace.com/container#${no}`
  window.open(url, '_blank', 'noopener')
  if (hit?.[2]) return
  const typeIt = () => toast(`Type ${no} in the line's search box`, 'info')
  try {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(no).then(() => toast(`${no} copied: paste it in the line's search box`, 'success'), typeIt)
    else typeIt()
  } catch {
    typeIt()
  }
}

// a per-container check that found nothing new, in plain words (no system names)
const NOT_OK = {
  OUTDATED_TRACKING: 'has had no movement for over 30 days',
  NO_TRACKING_FOUND: 'is not reported by the port or line yet; try again later',
  INVALID_TRACKING_RESPONSE: 'could not be read; try again in a minute',
  TRACKING_PROVIDER_ERROR: 'could not be checked; try again in a minute',
}

export default function ContainersPage({ showToast, pendingNavAction, onNavActionConsumed, onOpenJob }) {
  const { data, byId, facts, error, refresh } = useJourney()
  useFreshOnOpen()
  const navigate = useNavigate()
  const toast = (msg, type = 'info') => showToast?.(msg, type)

  const [view, setView] = useState('all')
  const [q, setQ] = useState('')
  const [line, setLine] = useState('')
  const [jobFilter, setJobFilter] = useState(null)
  const [sort, setSort] = useState({ key: 'free', dir: 'asc' })
  const [showFinished, setShowFinished] = useState(false)
  const [sel, setSel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(null)
  const [navSeen, setNavSeen] = useState(null)

  const all = facts.containers
  const inPlay = useMemo(() => all.filter((c) => !c.finishedOn), [all])
  const finishedAll = useMemo(() => all.filter((c) => c.finishedOn), [all])
  const checkedAt = (c) => data?.containersByNo?.[c.no]?.last_refreshed_at || null

  // the KPI and tab figures, all from the one list of containers in play
  const k = useMemo(() => {
    const n = { all: inPlay.length, due: 0, port: 0, toCfs: 0, cfs: 0, out: 0, road: 0, rail: 0, none: 0, stale: 0, risk: 0, over: 0 }
    const jobs = new Set()
    const riskJobs = new Set()
    let oldestCfs = null
    let firstRisk = null
    let lastCheck = null
    for (const c of inPlay) {
      jobs.add(c.jobId)
      n[GROUP[c.where]] = (n[GROUP[c.where]] || 0) + 1
      if (c.where === 'to_cfs') n.toCfs++
      if (c.where === 'road') n.road++
      if (c.where === 'rail') n.rail++
      if (c.stale) n.stale++
      if (c.where === 'cfs' && c.whereSince && (!oldestCfs || c.whereSince < oldestCfs)) oldestCfs = c.whereSince
      if (isRisk(c)) {
        n.risk++
        riskJobs.add(c.jobId)
        if (c.level === 'over') n.over++
        if (!firstRisk || c.freeLeft < firstRisk.freeLeft) firstRisk = c
      }
    }
    for (const c of all) {
      const t = data?.containersByNo?.[c.no]?.last_refreshed_at
      if (t && (!lastCheck || t > lastCheck)) lastCheck = t
    }
    return { ...n, jobs: jobs.size, riskJobs: riskJobs.size, oldestCfs, firstRisk, lastCheck }
  }, [inPlay, all, data])

  const lines = useMemo(() => [...new Set(inPlay.map((c) => c.line).filter(Boolean))].sort(), [inPlay])

  // search, line and job filters (the tabs come on top of these)
  const match = (c) => {
    if (jobFilter && c.jobId !== jobFilter) return false
    if (line && c.line !== line) return false
    const s = q.trim().toLowerCase()
    if (s) {
      const hay = [c.jobNo, c.client, c.no, c.line, c.whereText, c.place, c.size].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(s) && !hay.replace(/\s+/g, '').includes(s.replace(/\s+/g, ''))) return false
    }
    return true
  }
  const inView = (c) => (view === 'all' ? true
    : view === 'risk' ? isRisk(c)
      : view === 'stale' ? c.stale
        : GROUP[c.where] === view)

  const sortVal = {
    job: (c) => c.jobNo,
    client: (c) => c.client,
    no: (c) => c.no,
    line: (c) => c.line,
    where: (c) => ORDER[c.where],
    event: (c) => c.lastEvent?.at || null,
    free: (c) => c.freeLeft,
    updated: (c) => checkedAt(c),
  }
  const byOrder = (a, b) => compare(sortVal[sort.key](a), sortVal[sort.key](b), sort.dir)
    || compare(a.jobNo, b.jobNo, 'asc') || compare(a.no, b.no, 'asc')

  const rows = inPlay.filter((c) => match(c) && inView(c)).sort(byOrder)
  const finishedRows = finishedAll.filter(match).sort(byOrder)
  const shownFinished = showFinished && view === 'all' ? finishedRows : []
  const list = [...rows, ...shownFinished]
  const listJobs = new Set(list.map((c) => c.jobId)).size

  const current = sel ? all.find((c) => keyOf(c) === sel) || null : null
  const pos = current ? list.findIndex((c) => keyOf(c) === sel) : -1

  // links from alerts: ?job= filters to that job, ?cn= opens that container (a job
  // with a single container opens it). Handled once, as soon as the data is here.
  if (data && pendingNavAction && pendingNavAction !== navSeen && pendingNavAction.tab === 'containers' && pendingNavAction.jobId) {
    setNavSeen(pendingNavAction)
    setJobFilter(pendingNavAction.jobId)
    setView('all')
    setQ('')
    setLine('')
    const cn = String(pendingNavAction.cn || '').replace(/\s+/g, '').toUpperCase()
    const boxes = all.filter((c) => c.jobId === pendingNavAction.jobId)
    const hit = cn ? boxes.find((c) => c.no === cn) : boxes.length === 1 ? boxes[0] : null
    setSel(hit ? keyOf(hit) : null)
    if (hit?.finishedOn) setShowFinished(true)
  }
  useEffect(() => {
    if (navSeen && navSeen === pendingNavAction) onNavActionConsumed?.()
  }, [navSeen, pendingNavAction, onNavActionConsumed])

  // live: a saved tracking change reloads the shared data (a few seconds after the
  // last one, so a batch of updates loads once)
  useEffect(() => {
    let timer = null
    const channel = supabase
      .channel('ix-containers-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'container_tracking' }, () => {
        clearTimeout(timer)
        timer = setTimeout(() => refresh(), 4000)
      })
      .subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(channel) }
  }, [refresh])

  // the open containers grouped back into their jobs, for the tracking calls
  // (finished boxes are left out, so they are not checked again)
  const jobsToCheck = (boxes) => {
    const m = new Map()
    for (const c of boxes) {
      if (!m.has(c.jobId)) m.set(c.jobId, [])
      m.get(c.jobId).push(c.no)
    }
    return [...m].map(([id, nos]) => byId[id]?.job && { ...byId[id].job, containers: nos.join(', ') }).filter(Boolean)
  }

  // Opening the page checks containers not checked in the last 12 hours, as the old
  // Containers screen did (container tracking only, never a government system), now
  // only for the open jobs.
  const mounted = useRef(true)
  const autoRan = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    if (autoRan.current || !data) return
    autoRan.current = true
    const list = jobsToCheck(inPlay)
    if (!list.length) return
    refreshAllContainers(list, {})
      .then((t) => { if (mounted.current && t.updated > 0) refresh() })
      .catch((e) => console.warn('[Containers] check on open failed:', e))
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps -- runs once, when the data first arrives

  // Refresh all: checks every open container now (the button the old screen had)
  const refreshAll = async () => {
    if (busy) return
    const list = jobsToCheck(inPlay)
    if (!list.length) { toast('No open containers to check.', 'info'); return }
    setBusy(true)
    toast('Checking container movements…', 'info')
    try {
      const t = await forceRefreshAllContainers(list)
      if (t.failed > 0) toast(`${t.updated} updated, ${t.failed} could not be checked. Try again in a minute.`, 'error')
      else if (t.updated === 0) toast('All containers checked: no new movements.', 'info')
      else toast(`${plural(t.updated, 'container')} updated${t.skipped ? `, ${t.skipped} with nothing new` : ''}.`, 'success')
      refresh()
    } catch (e) {
      console.error('[Containers] refresh all failed:', e)
      toast('Could not reach container tracking, try again in a minute.', 'error')
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  // one container, on a button press
  const checkOne = async (c) => {
    const job = byId[c.jobId]?.job
    if (!job || checking) return
    setChecking(c.no)
    toast(`Checking ${c.no}…`, 'info')
    try {
      const res = await fetchLDBTracking(c.no)
      if (res.ok) {
        await persistLDBTracking(c.no, job, res.data)
        toast(`${c.no} updated`, 'success')
        refresh()
      } else {
        toast(`${c.no} ${NOT_OK[res.status] || 'has nothing new'}.`, 'info')
      }
    } catch (e) {
      console.error('[Containers] check failed:', e)
      toast('Could not reach container tracking, try again in a minute.', 'error')
    } finally {
      if (mounted.current) setChecking(null)
    }
  }

  // the job panel when the dashboard passes it, else the All jobs link alerts use
  const openJob = (id) => {
    if (onOpenJob) { setSel(null); onOpenJob(id) }
    else navigate(`/admin?tab=jobs&open=${encodeURIComponent(id)}`)
  }

  const setSortKey = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  const th = (id, label, className = '') => {
    const on = sort.key === id
    return (
      <th key={id} className={`sort${on ? ' sorted' : ''}${className ? ` ${className}` : ''}`} onClick={() => setSortKey(id)}
        aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        {label} <Icon name={on && sort.dir === 'desc' ? 'arrow-down' : 'arrow-up'} className={on ? '' : 'hint'} />
      </th>
    )
  }

  // one container row
  const row = (c) => {
    const lvl = c.level === 'over' || c.level === 'risk' ? 'red' : c.level === 'soon' ? 'amber' : ''
    const cls = [lvl, keyOf(c) === sel && 'sel', c.finishedOn && 'done'].filter(Boolean).join(' ')
    const t = checkedAt(c)
    return (
      <tr key={keyOf(c)} className={cls} onClick={() => setSel(keyOf(c) === sel ? null : keyOf(c))}>
        <td className="lvl" />
        <td title={c.client || undefined}><JobNo no={c.jobNo} onClick={() => openJob(c.jobId)} /></td>
        <td className="cl c-cl" title={c.client || undefined}><span className="ix-cn-ell">{c.client || <Dash />}</span></td>
        <td><span className="ix-cn-no">{c.no}</span></td>
        <td className="dim c-size">{c.size || <Dash />}</td>
        <td className="ix-cn-line c-line" title={c.line || undefined}><span className="ix-cn-ell">{c.line || <Dash />}</span></td>
        <td className="ix-cn-where" title={c.where === 'unknown' ? undefined : `${c.whereText}${c.whereSince ? ` since ${fmtDate(c.whereSince)}` : ''}`}><WhereNow c={c} j={byId[c.jobId]?.j} /></td>
        <td className="c-ev" title={c.lastEvent?.place || undefined}>
          {c.lastEvent
            ? <span className="ix-cn-ev"><span>{c.lastEvent.label}</span><span className="at">{fmtDateTime(c.lastEvent.at)}</span></span>
            : <Dash />}
        </td>
        <td className="r">
          {c.stale && c.freeLeft === null
            ? <Chip tone="amber" title="No movement for over 30 days: probably finished">No move {c.lastMoveDays} d</Chip>
            : <FreeDays value={c.freeLeft} till={c.freeTill && fmtDate(c.freeTill)} />}
        </td>
        <td className="dim c-upd" title={t ? `Checked ${timeAgo(t)}` : 'Not checked yet'}>{t ? fmtDateTime(t) : <Dash />}</td>
      </tr>
    )
  }

  const pickKpi = (id) => setView((v) => (v === id ? 'all' : id))
  const clearFilters = () => { setQ(''); setLine(''); setJobFilter(null); setView('all') }
  const jobNoOf = (id) => byId[id]?.job?.job_no || 'This job'

  const tabs = [
    { id: 'all', label: 'All in play', count: k.all },
    { id: 'risk', label: 'Detention risk', count: k.risk, tone: k.risk ? 'red' : undefined },
    { id: 'due', label: 'Not arrived', count: k.due },
    { id: 'port', label: 'At port', count: k.port },
    { id: 'cfs', label: 'At CFS', count: k.cfs },
    { id: 'out', label: 'Left with cargo', count: k.out },
    { id: 'none', label: 'No tracking yet', count: k.none },
    { id: 'stale', label: 'No movement 30+ d', count: k.stale, tone: k.stale ? 'amber' : undefined },
  ].filter((t) => t.id === 'all' || t.count > 0 || t.id === view)

  const head = (
    <PageHead
      title="Containers"
      sub={['Every container on open jobs', 'port and CFS movements, updated automatically', k.lastCheck && `last check ${fmtDateTime(k.lastCheck)}`]}
      actions={(
        <Button icon="refresh" onClick={refreshAll} disabled={busy || !data} title="Check every open container's movements now">
          {busy ? 'Checking…' : 'Refresh all'}
        </Button>
      )}
    />
  )

  if (!data) {
    return (
      <>
        {head}
        <Panel>
          {error
            ? <EmptyState line icon="alert-triangle" tone="red" title={`Could not load containers: ${error}`} action={<button type="button" className="ix-link" onClick={refresh}>Try again</button>} />
            : <Skeleton rows={8} />}
        </Panel>
      </>
    )
  }

  return (
    <>
      {head}

      <KpiStrip>
        <Kpi label="In play" value={k.all}
          sub={k.all ? `on ${plural(k.jobs, 'open job')}${k.none ? ` · ${k.none} not tracked yet` : ''}` : 'no open containers'}
          onClick={() => setView('all')} title="Show every container in play" />
        <Kpi label="At port" dot="teal" value={k.port} sub={k.toCfs ? `${k.toCfs} on the way to the CFS` : null}
          onClick={() => pickKpi('port')} selected={view === 'port'} />
        <Kpi label="At CFS" dot="teal" value={k.cfs} sub={k.oldestCfs ? `longest there since ${fmtDate(k.oldestCfs)}` : null}
          onClick={() => pickKpi('cfs')} selected={view === 'cfs'} />
        <Kpi label="Left with cargo" dot="blue" value={k.out}
          sub={k.road || k.rail ? [k.road && `${k.road} on the road`, k.rail && `${k.rail} on rail`].filter(Boolean).join(' · ') : null}
          onClick={() => pickKpi('out')} selected={view === 'out'} />
        <Kpi label="Detention risk" dot="red" tone={k.risk ? 'red' : undefined} value={k.risk}
          sub={k.risk
            ? (k.over ? `${k.over} in detention · ${plural(k.riskJobs, 'job')}` : k.firstRisk && <><JobNo no={k.firstRisk.jobNo} /> free till {fmtDate(k.firstRisk.freeTill)}</>)
            : '2 free days or fewer'}
          onClick={() => pickKpi('risk')} selected={view === 'risk'} />
      </KpiStrip>

      <Panel>
        <Tabs tabs={tabs} value={view} onChange={setView} />
        <Toolbar
          search={q} onSearch={setQ} placeholder="Job, client, container, line or place"
          filters={lines.length > 1 ? [{ key: 'line', label: 'Line', value: line, onChange: setLine, options: [{ value: '', label: 'All' }, ...lines] }] : []}
        >
          {jobFilter && (
            <span className="ix-cn-jobchip">
              Job: <b>{jobNoOf(jobFilter)}</b>
              <button type="button" onClick={() => setJobFilter(null)} aria-label="Show every job"><Icon name="x" /></button>
            </span>
          )}
        </Toolbar>

        {all.length === 0 ? (
          <EmptyState icon="box" title="No containers on open jobs">Containers show here once a job has its container numbers.</EmptyState>
        ) : list.length === 0 ? (
          <EmptyState line icon="filter-off"
            title={jobFilter && !all.some((c) => c.jobId === jobFilter) ? `${jobNoOf(jobFilter)} has no containers on an open job.` : 'No containers match.'}
            action={<button type="button" className="ix-link" onClick={clearFilters}>Show all containers</button>} />
        ) : (
          <div className="ix-tbl-wrap ix-cn-wrap">
            <table className="ix-tbl click ix-cn-tbl">
              <thead>
                <tr>
                  <th className="lvl" />
                  {/* c-* columns drop out on narrower screens (containers.css) so the
                      table fits at 1366px; Job, Container, Where now and Free till stay */}
                  {th('job', 'Job')}
                  {th('client', 'Client', 'c-cl')}
                  {th('no', 'Container')}
                  <th className="c-size">Size</th>
                  {th('line', 'Line', 'c-line')}
                  {th('where', 'Where now')}
                  {th('event', 'Last event', 'c-ev')}
                  {th('free', 'Free till', 'r')}
                  {th('updated', 'Updated', 'c-upd')}
                </tr>
              </thead>
              <tbody>
                {rows.map(row)}
                {shownFinished.length > 0 && (
                  <tr className="grp"><td colSpan={COLS}>Finished <span className="n">{shownFinished.length}</span></td></tr>
                )}
                {shownFinished.map(row)}
              </tbody>
            </table>
          </div>
        )}

        {all.length > 0 && (
          <div className="ix-tbl-foot">
            <span>{plural(list.length, 'container')} · {plural(listJobs, 'job')}</span>
            {finishedRows.length > 0 && (
              <div className="right">
                <button type="button" className="ix-link" onClick={() => { setShowFinished((v) => !(v && view === 'all')); setView('all') }}>
                  {showFinished && view === 'all' ? 'Hide finished' : `Show finished (${finishedRows.length})`}
                </button>
              </div>
            )}
          </div>
        )}
      </Panel>

      {current && (
        <ContainerPanel
          c={current} j={byId[current.jobId]?.j}
          checked={checkedAt(current)}
          siblings={all.filter((x) => x.jobId === current.jobId)}
          pos={pos} total={list.length}
          onPrev={pos > 0 ? () => setSel(keyOf(list[pos - 1])) : null}
          onNext={pos >= 0 && pos < list.length - 1 ? () => setSel(keyOf(list[pos + 1])) : null}
          onPick={(x) => { setSel(keyOf(x)); if (x.finishedOn) setShowFinished(true) }}
          onClose={() => setSel(null)}
          onOpenJob={() => openJob(current.jobId)}
          onCheck={() => checkOne(current)} checking={checking === current.no}
          onLineSite={() => openLineSite(current.no, current.line || byId[current.jobId]?.job?.shipping_line, toast)}
        />
      )}
    </>
  )
}

// ── side panel: one container's trip ──
function ContainerPanel({ c, j, checked, siblings, pos, total, onPrev, onNext, onPick, onClose, onOpenJob, onCheck, checking, onLineSite }) {
  // Esc closes; J / K (or the arrow keys) move through the list, as in the job panel
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'Escape') onClose()
      else if ((e.key === 'j' || e.key === 'ArrowDown') && onNext) { e.preventDefault(); onNext() }
      else if ((e.key === 'k' || e.key === 'ArrowUp') && onPrev) { e.preventDefault(); onPrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNext, onPrev])

  const risk = c.level === 'over' || c.level === 'risk'
  const facts = [
    c.portInAt && { k: 'Port in', v: fmtDate(c.portInAt) },
    c.freeTill && {
      k: 'Free till', v: fmtDate(c.freeTill), red: risk,
      s: c.freeLeft < 0 ? `${c.detentionDays} d over` : c.freeLeft === 0 ? 'last day today' : `${c.freeLeft} d left`,
    },
    c.leftAt && { k: `Left ${c.leftFrom || 'CFS'}`, v: fmtDate(c.leftAt), s: fmtTime(c.leftAt) },
    c.line && { k: 'Line', v: c.line },
  ].filter(Boolean)

  // newest first, with a heading per day
  const days = []
  for (const m of [...(c.milestones || [])].reverse()) {
    const d = fmtDate(m.at)
    if (!days.length || days[days.length - 1].d !== d) days.push({ d, items: [] })
    days[days.length - 1].items.push(m)
  }
  const upcoming = !c.finishedOn && c.freeTill && c.freeLeft !== null && c.freeLeft >= 0

  let note = null
  if (c.level === 'over') {
    note = { tone: 'red', icon: 'alert-octagon', t: `Detention running · ${plural(c.detentionDays, 'day')}`, s: `Free time ended ${fmtDate(c.freeTill)}. Charges add up until the empty is back.` }
  } else if (c.level === 'risk') {
    note = { tone: 'red', icon: 'alert-octagon', t: c.freeLeft === 0 ? 'Last free day today' : `Only ${plural(c.freeLeft, 'free day')} left`, s: `Free time ends ${fmtDate(c.freeTill)}; detention from ${fmtDate(nextDay(c.freeTill))}.` }
  } else if (c.stale && !c.finishedOn) {
    note = { tone: 'amber', icon: 'alert-triangle', t: `No movement for ${c.lastMoveDays} days`, s: 'Probably finished. If the empty is back, mark the job delivered.' }
  } else if (!c.tracked) {
    note = { tone: 'grey', icon: 'info-circle', t: 'No tracking yet', s: 'The port or line has not reported this container. Check now to look it up.' }
  }

  return (
    <>
      <div className="ix-backdrop" onClick={onClose} />
      <aside className="ix-drawer ix-cn-drawer" role="dialog" aria-label={`Container ${c.no}`}>
        <div className="ix-dr-head">
          <div className="ix-dr-title">
            <JobNo no={c.jobNo} size="lg" onClick={onOpenJob} title={`Open ${c.jobNo}`} />
            {c.client && <span className="ix-cn-client">· {c.client}</span>}
            <div className="x">
              {pos >= 0 && total > 1 && <span className="ix-cn-pos">{pos + 1} of {total}</span>}
              <button type="button" className="ix-icon-btn sm" onClick={onPrev || undefined} disabled={!onPrev} aria-label="Previous container (K)" title="Previous (K)"><Icon name="chevron-up" /></button>
              <button type="button" className="ix-icon-btn sm" onClick={onNext || undefined} disabled={!onNext} aria-label="Next container (J)" title="Next (J)"><Icon name="chevron-down" /></button>
              <button type="button" className="ix-icon-btn sm" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)"><Icon name="x" /></button>
            </div>
          </div>
          <div className="ix-cn-hero">
            <span className="no">{c.no}</span>
            {c.size && <span className="size">{c.size}</span>}
            {c.where === 'unknown'
              ? <span className="ix-st hollow pill">No tracking yet</span>
              : <Status tone={whereTone(c, j)} pill>{c.whereText}</Status>}
          </div>
          {facts.length > 0 && (
            <div className="ix-facts ix-cn-facts" style={{ '--n': facts.length }}>
              {facts.map((f) => (
                <div key={f.k} className="ix-fact">
                  <div className="k">{f.k}</div>
                  <div className={`v${f.red ? ' red' : ''}`}>{f.v}{f.s ? <small>{f.s}</small> : null}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ix-dr-body">
          {note && (
            <div className={`ix-next ix-cn-note ${note.tone}`}>
              <Icon name={note.icon} />
              <div><div className="t">{note.t}</div><div className="s">{note.s}</div></div>
            </div>
          )}

          <Section title="This trip" right={<span className="ix-cn-meta">IST</span>}>
            {upcoming && (
              <div className="ix-timeline ix-cn-upcoming">
                <div className="ix-cn-day">Upcoming</div>
                <div className="ix-tl"><div className="t">Free time ends</div><div className="m">{fmtDate(c.freeTill)}</div></div>
                <div className="ix-tl n"><div className="t">Detention starts</div><div className="m">{fmtDate(nextDay(c.freeTill))} · if not finished by then</div></div>
              </div>
            )}
            {days.length ? (
              <div className="ix-timeline">
                {days.map((g, gi) => (
                  <div key={g.d}>
                    <div className="ix-cn-day">{g.d}</div>
                    {g.items.map((m, i) => {
                      const src = eventSource(m)
                      const time = fmtTime(m.at)
                      return (
                        <div key={`${m.at}-${i}`} className={`ix-tl ${gi === 0 && i === 0 ? 'latest' : 'ok'}`}>
                          <div className="t">{m.label || <Dash />}</div>
                          <div className="m"><Icon name={src.icon} />{src.word}{time ? ` · ${time}` : ''}{m.place ? ` · ${m.place}` : ''}</div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState line icon="route" title={c.tracked ? 'No movements reported for this trip yet.' : 'No movements yet.'} />
            )}
          </Section>

          <Section title="Details">
            <div className="ix-kv">
              {c.line && <div><div className="k">Line</div><div className="v">{c.line}</div></div>}
              {c.size && <div><div className="k">Size</div><div className="v">{c.size}</div></div>}
              {c.freeFrom && <div><div className="k">Free days counted</div><div className="v">{c.freeFrom === 'line' ? "By the line's own count" : "Job's free days, from port arrival"}</div></div>}
              <div><div className="k">Last checked</div><div className="v" title={checked ? timeAgo(checked) : undefined}>{checked ? fmtDateTime(checked) : <Dash />}</div></div>
              {c.finishedOn && <div><div className="k">Finished</div><div className="v">{c.finishedOn === 'yes' ? 'Yes' : fmtDate(c.finishedOn)}</div></div>}
            </div>
          </Section>

          {siblings.length > 1 && (
            <Section title={`Containers on ${c.jobNo}`} right={<span className="ix-cn-meta">{siblings.length}</span>}>
              <div className="ix-cn-sibs">
                {siblings.map((x) => (
                  <button key={x.no} type="button" className={`ix-cn-sib${x.no === c.no ? ' on' : ''}`} onClick={() => onPick(x)}
                    aria-pressed={x.no === c.no} title={x.whereText}>
                    <span className={`ix-dot ${whereTone(x, j)}`} />{x.no}
                  </button>
                ))}
              </div>
            </Section>
          )}
        </div>

        <div className="ix-cn-foot">
          <Button variant="primary" icon="layout-sidebar-right" onClick={onOpenJob}>Open {c.jobNo}</Button>
          <Button icon="refresh" onClick={onCheck} disabled={checking} title="Check this container's movements now">{checking ? 'Checking…' : 'Check now'}</Button>
          <Button variant="ghost" icon="external-link" onClick={onLineSite} title="Open the shipping line's tracking page">Line's website</Button>
        </div>
      </aside>
    </>
  )
}
