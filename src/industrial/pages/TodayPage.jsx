import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { daysAgo, detentionLevel, isExportJob, jobCount } from '../../services/journey'
import { seaOf } from '../../../supabase/functions/_shared/portal/ships.js'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import {
  Button, Chip, Dash, EmptyState, FreeDays, Icon, JobNo, Kpi, KpiStrip, PageHead, Panel, Segmented, Skeleton, Status,
  fmtDate, fmtTime, timeAgo, worst,
} from '../ui'
import '../styles/today.css'

// Today (Control tower, Jose 31 Oct 2026): KPIs that filter the list, the pipeline,
// one row per job worst problem first, the free-time runway and the latest updates.
// Every count comes from useJourney() (active / facts), so it matches the sidebar.

const DAY = 86400000
const IST = 5.5 * 3600000
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WD1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// activity_log types shown in Latest updates (container moves come from the
// tracking rows themselves, in plain words, so container_update is left out)
const FEED_TYPES = ['ooc_granted', 'be_filed', 'sb_filed', 'be_stage', 'truck_dispatched', 'stage_update', 'note',
  'ship_arrived', 'eta_changed', 'job_delivered', 'detention_alert', 'air_igm', 'truck_stuck', 'truck_papers', 'job_created']
// the notes of these types can carry a ship name: rows are never labelled by ship (Jose)
const NO_NOTE = ['ship_arrived', 'eta_changed']
const FEED_ICON = {
  ooc_granted: ['building-bank', 'cus'], be_filed: ['building-bank', 'cus'], sb_filed: ['building-bank', 'cus'],
  be_stage: ['building-bank', 'cus'], air_igm: ['plane', 'cus'],
  ship_arrived: ['anchor', 'port'], eta_changed: ['anchor', 'port'],
  truck_dispatched: ['truck', ''], truck_stuck: ['alert-triangle', 'bad'], truck_papers: ['alert-triangle', 'bad'],
  detention_alert: ['alert-triangle', 'bad'], job_delivered: ['flag', 'ok'],
  stage_update: ['arrow-big-right-lines', ''], note: ['message-circle', ''], job_created: ['plus', ''],
}

// vendor and system names never reach the screen: sources are Customs, Port, Toll
const plain = (s) => String(s || '')
  .replace(/\s*\((ICEGATE|LDB|ULIP|FASTag|Safecube)\)/gi, '')
  .replace(/\bICEGATE\b/gi, 'Customs').replace(/\bLDB\b/g, 'container tracking')
  .replace(/\bFASTag\b/gi, 'toll').replace(/\bULIP\b/g, 'government systems').replace(/\bSafecube\b/gi, 'ship tracking')
  .replace(/\s+—\s+/g, ', ')
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')

// Needs-action groups, in order. One row per job, under its worst problem.
const GROUPS = [
  { id: 'today', title: 'Act today' },
  { id: 'truck', title: 'Truck or rail not arranged' },
  { id: 'customs', title: 'Customs and arrival' },
  { id: 'free', title: 'Free time running low' },
  { id: 'other', title: 'Other' },
  { id: 'none', title: 'No action needed' },
]
// the list's title for each KPI filter, and the All jobs view that shows the same jobs
const KF_TITLE = { action: 'Needs action', active: 'Active jobs', risk: 'Free days ≤ 2', move: 'Move not arranged', ooc: 'Waiting for OOC', road: 'On the road', arriving: 'Arriving in 7 days' }
const JOBS_VIEW = { action: 'action', active: 'open', risk: 'detention', move: 'truck', ooc: 'ooc', road: 'onroad', arriving: 'open' }

// ETA of a job not yet arrived: the ship tracking's date when it has one, else the job's
// (the line's dates for an Indian port are port time saved as UTC, as in journeyFor)
function etaOf(job, data) {
  const sea = seaOf(job, data)
  if (sea && !sea.error && sea.pod_date && !sea.pod_actual) {
    return /,\s*IN$/i.test(String(sea.pod || '')) ? new Date(new Date(sea.pod_date).getTime() - IST).toISOString() : sea.pod_date
  }
  return job.eta || null
}

// The 'Since' cell: one measure per job, always labelled (audit: the column mixed
// metrics). SB for exports, then the OOC date, the BE date while waiting, arrival, ETA.
function sinceOf(job, j, eta, now) {
  if (isExportJob(job)) {
    const d = daysAgo(job.ulip_refs?.sb_date, now)
    return d === null ? null : { k: 'SB', d }
  }
  if (j.oocDate) return { k: 'OOC', d: daysAgo(j.oocDate, now) }
  if (j.beFiled && !j.oocDone) return { k: 'BE', d: daysAgo(job.be_date, now) }
  if (j.arrivedAt) return { k: 'Arrived', d: daysAgo(j.arrivedAt, now) }
  if (eta) return { k: 'ETA', d: daysAgo(eta, now) }
  return null
}
function SinceCell({ s }) {
  if (!s || s.d === null || s.d === undefined) return <Dash />
  if (s.k === 'ETA') {
    if (s.d === 0) return <>ETA <b>today</b></>
    return s.d < 0 ? <>ETA in <b>{-s.d} d</b></> : <>ETA <b>{s.d} d</b> ago</>
  }
  return s.d <= 0 ? <>{s.k} <b>today</b></> : <>{s.k} <b>{s.d} d</b> ago</>
}

// Where the job's boxes are now, from the shared container list ('At CFS · 2 boxes',
// 'At CFS 3 · Left port 1'). A truck seen at a toll comes first.
function whereOf(r, boxes, road) {
  const seen = road.find((e) => e.jobId === r.job.id)
  if (seen) return `${seen.mode === 'rail' ? 'On rail' : 'On the road'}${seen.place ? ` · ${seen.place}` : ''}`
  const live = boxes.filter((c) => !c.finishedOn)
  if (live.length) {
    const by = new Map()
    for (const c of live) by.set(c.whereText, (by.get(c.whereText) || 0) + 1)
    if (by.size === 1) return `${live[0].whereText}${live.length > 1 ? ` · ${live.length} boxes` : ''}`
    return [...by].map(([t, n]) => `${t} ${n}`).join(' · ')
  }
  if (!isExportJob(r.job) && r.j.phase === 'arrival') return 'Not arrived yet'
  return null
}

// The one verb for a row, taken from what the problem is (audit: no more 'Open')
function actionOf(item, j) {
  if (!item) return { label: 'Review', icon: 'eye', tab: 'overview' }
  // free time running out while the boxes wait for a truck: the fix is the truck
  if (item.action === 'truck' || (item.action === 'containers' && j.readyForTruck)) {
    if (j.readyForTruck) return { label: j.onwardMode === 'truck' ? 'Assign truck' : 'Arrange truck', icon: 'truck', tab: 'truck' }
    if (item.action === 'truck' && /add the truck number/i.test(item.text)) return { label: 'Add truck no.', icon: 'truck', tab: 'truck' }
    return { label: 'Check truck', icon: 'truck', tab: 'truck' }
  }
  if (item.action === 'containers') return { label: 'Check boxes', icon: 'box', tab: 'containers' }
  if (item.action === 'customs') return { label: 'Update BE stage', icon: 'file-certificate', tab: 'customs' }
  return { label: 'Review', icon: 'eye', tab: 'overview' }
}

function groupOf(level, items, j) {
  if (level === 'red') return 'today'
  if (level !== 'amber') return 'none'
  const amber = items.filter((a) => a.level === 'amber')
  if (amber.some((a) => a.action === 'truck') && j.readyForTruck) return 'truck'
  if (amber.some((a) => ['customs', 'export', 'air'].includes(a.action))) return 'customs'
  if (amber.some((a) => a.action === 'containers')) return 'free'
  return 'other'
}

// The job's other problems become small tags on the same row
function tagsOf(main, items, r, boxCount) {
  const { job, j } = r
  const out = []
  for (const a of items) {
    if (a === main) continue
    if (a.action === 'containers' && /free day|detention/i.test(a.text)) continue // the Free days column shows it
    if (a.action === 'truck' && j.readyForTruck) out.push({ t: '+ arrange truck', title: plain(a.text) })
    else if (a.action === 'truck' && /add the truck number/i.test(a.text)) out.push({ t: '+ truck no.', title: plain(a.text) })
    else if (a.action === 'customs') out.push({ t: '+ customs', title: plain(a.text) })
    else if (/shipping line/i.test(a.text)) out.push({ t: 'line', icon: 'info-circle', tone: 'blue', title: plain(a.text) })
    else out.push({ t: a.level === 'red' ? 'problem' : 'check', tone: a.level === 'red' ? 'red' : undefined, title: plain(a.text) })
  }
  if (!isExportJob(job) && j.oocDone && !j.oocDate && ['release', 'truck'].includes(j.phase)) out.push({ t: 'OOC date missing', tone: 'amber', title: 'OOC is done but its date is not saved' })
  if (/LCL/i.test(job.mode || '')) out.push({ t: 'LCL' })
  if (boxCount > 1) out.push({ t: `${boxCount} boxes` })
  return out
}

// within a group: least free time first (no figure last), then waiting longest
const sortRows = (a, b) => (a.free ?? 9999) - (b.free ?? 9999) || (b.sinceDays ?? -9999) - (a.sinceDays ?? -9999)
  || String(a.job.job_no).localeCompare(String(b.job.job_no), undefined, { numeric: true })

const readPref = (k, fallback) => { try { return localStorage.getItem(k) || fallback } catch { return fallback } }
const savePref = (k, val) => { try { localStorage.setItem(k, val) } catch { /* private mode: the choice just isn't remembered */ } }

export default function TodayPage({ onOpenJob, onGo, profile }) {
  const { data, rows, active, facts, loading, error, refresh } = useJourney()
  useFreshOnOpen() // opening the page shows the latest saved data
  const [log, setLog] = useState([])
  const [kind, setKindRaw] = useState(() => readPref('ix_today_kind', 'all'))
  const [who, setWhoRaw] = useState(() => readPref('ix_today_who', 'all'))
  const [kf, setKf] = useState('action') // the KPI that filters the list (Need action by default)
  const me = profile?.id || null
  const mine = who === 'mine' && !!me
  const setKind = (val) => { setKindRaw(val); savePref('ix_today_kind', val) }
  const setWho = (val) => { setWhoRaw(val); savePref('ix_today_who', val) }

  // the last 24 hours of updates (audit: the feed was empty every evening)
  useEffect(() => {
    let cancelled = false
    supabase.from('activity_log').select('*')
      .or(`type.in.(${FEED_TYPES.join(',')}),action.eq.stage_update`)
      .gte('created_at', new Date(Date.now() - DAY).toISOString())
      .order('created_at', { ascending: false }).limit(40)
      .then(({ data: got }) => { if (!cancelled) setLog(got || []) })
    return () => { cancelled = true }
  }, [data])

  // 'now' is when the data was loaded: every figure on the page is from that moment
  const now = data ? new Date(data.loadedAt).getTime() : 0

  const v = useMemo(() => {
    // the toggles narrow the shared lists; they never recount them
    const keep = (job) => !!job && (kind === 'all' || (kind === 'export') === isExportJob(job)) && (!mine || job.assigned_to === me)
    const act = active.filter((r) => keep(r.job))
    const ids = new Set(act.map((r) => r.job.id))
    const boxes = facts.containers.filter((c) => ids.has(c.jobId))
    const boxesBy = {}
    for (const c of boxes) (boxesBy[c.jobId] ||= []).push(c)
    const road = facts.onRoad.filter((e) => ids.has(e.jobId))
    const risk = facts.detention.filter((r) => ids.has(r.job.id))
    const need = facts.needTruck.filter((r) => ids.has(r.job.id))
    const ooc = act.filter((r) => r.j.phase === 'ooc')

    const all = act.map((r) => {
      const items = r.j.attention || []
      const level = worst(r.j)
      const main = items.find((a) => a.level === 'red') || items.find((a) => a.level === 'amber') || items.find((a) => a.level === 'info') || null
      // not arrived yet (the journey's own arrival step), whatever the stage says
      const notIn = !isExportJob(r.job) && r.j.steps?.find((st) => st.id === 'arrival')?.done === false
      const eta = notIn ? etaOf(r.job, data) : null
      const since = sinceOf(r.job, r.j, eta, now)
      return {
        ...r, id: r.job.id, level, main, items, eta, since,
        sinceDays: since ? since.d : null,
        free: r.j.freeDaysLeft,
        group: groupOf(level, items, r.j),
        where: whereOf(r, boxesBy[r.job.id] || [], road),
        tags: tagsOf(main, items, r, (r.j.containers?.nos || []).length),
        act: actionOf(main, r.j),
      }
    })
    const byId = Object.fromEntries(all.map((x) => [x.id, x]))
    const action = all.filter((x) => x.level === 'red' || x.level === 'amber')
    const watching = all.filter((x) => x.level === 'info')
    // due in the next 7 days, or due in the last 7 and not in yet (overdue first)
    const arriving = all.filter((x) => { const d = x.eta ? daysAgo(x.eta, now) : null; return d !== null && d >= -7 && d <= 7 })
      .sort((a, b) => daysAgo(b.eta, now) - daysAgo(a.eta, now))

    // delivered in the last 7 days (the finished boxes' date, else the job's last update)
    const delivered = rows.filter((r) => keep(r.job) && !ids.has(r.job.id) && (Number(r.job.stage) >= 10 || r.j.phase === 'delivered'))
      .map((r) => ({ ...r, at: (r.j.containers?.finishedOn && r.j.containers.finishedOn !== 'yes' ? r.j.containers.finishedOn : null) || r.job.updated_at }))
      .filter((r) => { const d = daysAgo(r.at, now); return d !== null && d >= 0 && d < 7 })
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))

    return { act, all, byId, boxes, road, risk, need, ooc, action, watching, arriving, delivered, shown: new Set([...ids, ...delivered.map((r) => r.job.id)]) }
  }, [active, rows, facts, kind, mine, me, data, now])

  const dash = loading && !data

  // ── the list under the KPIs: Need action by default, else the chosen KPI's jobs ──
  const listRows = useMemo(() => {
    const ids = {
      action: null,
      active: v.all.map((x) => x.id),
      risk: v.risk.map((r) => r.job.id),
      move: v.need.map((r) => r.job.id),
      ooc: v.ooc.map((r) => r.job.id),
      road: [...new Set(v.road.map((e) => e.jobId))],
      arriving: v.arriving.map((x) => x.id),
    }[kf]
    return ids ? ids.map((id) => v.byId[id]).filter(Boolean) : v.action
  }, [kf, v])
  const grouped = useMemo(() => GROUPS.map((g) => ({ ...g, rows: listRows.filter((x) => x.group === g.id).sort(sortRows) })).filter((g) => g.rows.length), [listRows])

  // ── KPI figures ──
  const red = v.action.filter((x) => x.level === 'red').length
  const firstRisk = [...v.risk].sort((a, b) => a.j.freeDaysLeft - b.j.freeDaysLeft)[0]
  const oldestMove = v.need.map((r) => ({ r, d: daysAgo(r.j.oocDate, now) })).filter((x) => x.d !== null).sort((a, b) => b.d - a.d)[0]
  const oocDays = v.ooc.map((r) => ({ r, d: daysAgo(r.job.be_date, now) })).filter((x) => x.d !== null).sort((a, b) => b.d - a.d)
  const roadJobs = jobCount(v.road)
  const lastRoad = v.road[0]
  const openBoxes = v.boxes.filter((c) => !c.finishedOn).length
  const firstArr = v.arriving[0]
  // one job waiting: 'J-689 · 9 d since BE'; more: 'oldest 12 d · avg 7 d' (audit)
  const oocSub = !oocDays.length ? (v.ooc.length ? null : 'none waiting')
    : oocDays.length === 1 ? <><JobNo no={oocDays[0].r.job.job_no} /> · {oocDays[0].d} d since BE</>
      : `oldest ${oocDays[0].d} d · avg ${Math.round(oocDays.reduce((s, x) => s + x.d, 0) / oocDays.length)} d`
  const etaText = (eta) => { const d = daysAgo(eta, now); return d === 0 ? 'ETA today' : d < 0 ? `ETA ${fmtDate(eta)}` : `ETA was ${fmtDate(eta)}` }
  const pick = (id) => setKf((cur) => (cur === id ? 'action' : id))

  const openView = (view) => { savePref('ix_jobs_view', view); onGo?.('jobs') }
  const open = (id, tab) => onOpenJob?.(id, tab)

  // ── page head: 'Saturday 31 Oct · refreshed 19:42 IST · 12 active jobs' ──
  const dateText = now ? `${WEEKDAY[new Date(now + IST).getUTCDay()]} ${fmtDate(data.loadedAt)}` : null
  const sub = [
    dateText,
    data && <span title={`Loaded ${timeAgo(data.loadedAt)}`}>refreshed {fmtTime(data.loadedAt)} IST</span>,
    !dash && `${v.act.length} active ${v.act.length === 1 ? 'job' : 'jobs'}${kind !== 'all' ? ` (${kind === 'export' ? 'exports' : 'imports'})` : ''}${mine ? ', mine' : ''}`,
  ]

  return (
    <>
      <PageHead title="Today" sub={sub} actions={<>
        <Segmented label="Job type" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'import', label: 'Import' }, { value: 'export', label: 'Export' }]} />
        {me && <Segmented label="Whose jobs" value={who} onChange={setWho} options={[{ value: 'all', label: 'Everyone' }, { value: 'mine', label: 'My jobs' }]} />}
        <Button variant="ghost" size="sm" icon="refresh" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
      </>} />

      {error && <div className="ix-error">Could not load the latest data: {error}. Press Refresh.</div>}

      <KpiStrip>
        <Kpi label="Active jobs" value={dash ? null : v.act.length} sub={!dash && (openBoxes ? `${openBoxes} container${openBoxes === 1 ? '' : 's'} open` : 'no containers open')}
          onClick={() => pick('active')} selected={kf === 'active'} title="Show every active job in the list below" />
        <Kpi label="Need action" dot="amber" value={dash ? null : v.action.length} unit={v.action.length === 1 ? 'job' : 'jobs'}
          sub={!dash && (v.action.length ? `${red} act today · ${v.action.length - red} soon` : 'nothing waiting')}
          onClick={() => setKf('action')} selected={kf === 'action'} title="Jobs with a problem to act on" />
        <Kpi label="Free days ≤ 2" dot="red" tone={v.risk.length ? 'red' : undefined} value={dash ? null : v.risk.length} unit={v.risk.length ? 'at risk' : undefined}
          sub={!dash && (firstRisk
            ? <><JobNo no={firstRisk.job.job_no} /> {firstRisk.j.freeDaysLeft < 0 ? `${-firstRisk.j.freeDaysLeft} d over` : firstRisk.j.freeTill ? `free till ${fmtDate(firstRisk.j.freeTill)}` : `${firstRisk.j.freeDaysLeft} d left`}</>
            : 'no risk today')}
          onClick={() => pick('risk')} selected={kf === 'risk'} title="Jobs at detention risk (2 free days or less)" />
        <Kpi label="Move not arranged" tone={v.need.length ? 'amber' : undefined} value={dash ? null : v.need.length} unit={v.need.length ? (v.need.length === 1 ? 'job' : 'jobs') : undefined}
          sub={!dash && (oldestMove ? <>oldest <JobNo no={oldestMove.r.job.job_no} /> · OOC {oldestMove.d} d ago</> : v.need.length ? 'arrange truck or rail' : 'all arranged')}
          onClick={() => pick('move')} selected={kf === 'move'} title="OOC done, no truck or rail arranged" />
        <Kpi label="Waiting for OOC" value={dash ? null : v.ooc.length} sub={!dash && oocSub}
          onClick={() => pick('ooc')} selected={kf === 'ooc'} title="BE filed, OOC not yet" />
        <Kpi label="On the road" value={dash ? null : roadJobs}
          sub={!dash && (lastRoad
            ? <><JobNo no={lastRoad.job.job_no} /> · {lastRoad.place || (lastRoad.kind === 'left' ? `left ${fmtDate(lastRoad.at)}` : lastRoad.mode === 'rail' ? 'on rail' : 'moving')}</>
            : v.need.length ? `${v.need.length} ready for a truck` : 'no truck seen')}
          onClick={() => pick('road')} selected={kf === 'road'} title="Trucks seen at a toll, or containers moving, in the last 4 days" />
        <Kpi label="Arriving ≤ 7 days" value={dash ? null : v.arriving.length}
          sub={!dash && (firstArr ? <><JobNo no={firstArr.job.job_no} /> · {etaText(firstArr.eta)}</> : 'none due')}
          onClick={() => pick('arriving')} selected={kf === 'arriving'} title="Ships and flights due within 7 days, or due and not in yet" />
      </KpiStrip>

      <Pipeline v={v} kind={kind} dash={dash} now={now} onOpenJob={open} openView={openView} />

      <Panel className="ix-td-action"
        title={KF_TITLE[kf]}
        meta={dash ? null : `${listRows.length} ${listRows.length === 1 ? 'job' : 'jobs'}${kf === 'action' ? ' · worst problem first' : ''}`}
        actions={<>
          {kf !== 'action' && <Button variant="ghost" size="sm" icon="x" onClick={() => setKf('action')}>Needs action</Button>}
          <Button variant="ghost" size="sm" onClick={() => openView(JOBS_VIEW[kf])}>In All jobs <Icon name="arrow-right" /></Button>
        </>}>
        {dash ? <Skeleton rows={6} />
          : !listRows.length ? (kf === 'action'
            ? <EmptyState icon="circle-check" tone="green" title="Nothing needs action right now">{v.watching.length ? `${v.watching.length} ${v.watching.length === 1 ? 'job' : 'jobs'} to keep an eye on below.` : null}</EmptyState>
            : <EmptyState line icon="circle-check" title={`No jobs under ${KF_TITLE[kf].toLowerCase()} right now.`} />)
            : (
              <div className="ix-tbl-wrap">
                <table className="ix-tbl click ix-td-tbl">
                  <thead><tr>
                    <th className="lvl" /><th>Job</th><th>Client</th><th>Issue</th><th className="r">Free days</th><th>Since</th><th>Where now</th><th className="r">Action</th>
                  </tr></thead>
                  <tbody>
                    {grouped.map((g) => [
                      <tr key={`g-${g.id}`} className="grp">
                        <td className="lvl" />
                        <td colSpan={7}>{g.id === 'today' ? <Status tone="red">Act today</Status> : g.title}<span className="n">{g.rows.length}</span></td>
                      </tr>,
                      ...g.rows.map((x) => (
                        <tr key={x.id} className={x.level === 'red' || x.level === 'amber' ? x.level : ''} onClick={() => open(x.id)}>
                          <td className="lvl" />
                          <td><JobNo no={x.job.job_no} onClick={() => open(x.id)} /></td>
                          <td className="cl" title={x.job.client || undefined}>{x.job.client || <Dash />}</td>
                          <td>
                            <div className="ix-td-issue">
                              <span className="txt" title={x.main ? plain(x.main.text) : undefined}>{x.main ? plain(x.main.text) : <span className="none">Nothing to do</span>}</span>
                              {x.tags.map((t, i) => <Chip key={i} tone={t.tone} icon={t.icon} title={t.title}>{t.t}</Chip>)}
                            </div>
                          </td>
                          <td className="r" title={x.j.freeBox ? `Runs out first: ${x.j.freeBox}` : undefined}>
                            <FreeDays value={x.free} till={x.j.freeTill ? fmtDate(x.j.freeTill) : null} />
                          </td>
                          <td className="ix-td-since"><SinceCell s={x.since} /></td>
                          <td className="ix-td-where" title={x.where || undefined}>{x.where || <Dash />}</td>
                          <td className="r">
                            {x.main
                              ? <Button size="sm" variant={x.level === 'red' ? 'primary' : 'secondary'} urgent={x.level === 'red'} icon={x.act.icon}
                                onClick={(e) => { e.stopPropagation(); open(x.id, x.act.tab) }}>{x.act.label}</Button>
                              : <Button size="sm" variant="ghost" icon="eye" onClick={(e) => { e.stopPropagation(); open(x.id) }}>Review</Button>}
                          </td>
                        </tr>
                      )),
                    ])}
                  </tbody>
                </table>
              </div>
            )}
        {/* jobs with only a note: listed so every active job is explained, and the
            'add the truck number' prompt is still offered (D2/D3 graft, Jose 31 Oct 2026) */}
        {!dash && kf === 'action' && v.watching.length > 0 && (
          <div className="ix-td-watch">
            <div className="h">Also watching, no action needed <span className="n">{v.watching.length}</span></div>
            {[...v.watching].sort(sortRows).map((x) => (
              <div key={x.id} className="row" onClick={() => open(x.id)}>
                <JobNo no={x.job.job_no} onClick={() => open(x.id)} />
                <span className="cl">{x.job.client || '—'}</span>
                <span className="txt" title={plain(x.main?.text)}>{plain(x.main?.text)}</span>
                <button type="button" className="ix-link" onClick={(e) => { e.stopPropagation(); open(x.id, x.act.tab) }}>{x.act.label}</button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className={`ix-td-grid${kind === 'export' ? ' one' : ''}`}>
        {kind !== 'export' && <Runway v={v} dash={dash} now={now} onOpenJob={open} />}
        <Updates log={log} v={v} filtered={kind !== 'all' || mine} dash={dash} now={now} onOpenJob={open} />
      </div>
    </>
  )
}

// ── Pipeline: one cell per stage, with that stage's job numbers as chips ──
const IMPORT_STAGES = [
  { id: 'arrival', label: 'Ship due', view: 'open' },
  { id: 'docs', label: 'BE to file', view: 'open' },
  { id: 'ooc', label: 'Waiting OOC', view: 'ooc' },
  { id: 'release', label: 'To move', view: 'truck', wide: true },
  { id: 'truck', label: 'On the move', view: 'onroad' },
]
const EXPORT_STAGES = [
  { id: 'sb', label: 'SB to file', view: 'open' },
  { id: 'leo', label: 'Waiting LEO', view: 'open', wide: true },
  { id: 'sail', label: 'LEO given', view: 'open' },
]
const CHIP_CAP = 14
const chipTone = (x) => (x.level === 'red' ? 'red' : x.level === 'amber' ? 'amber' : ['arrival', 'truck', 'sail'].includes(x.j.phase) ? 'navy' : '')

function Pipeline({ v, kind, dash, now, onOpenJob, openView }) {
  const imports = v.all.filter((x) => !isExportJob(x.job))
  const exports = v.all.filter((x) => isExportJob(x.job))
  const stages = []
  if (kind !== 'export') {
    for (const s of IMPORT_STAGES) {
      const jobs = imports.filter((x) => x.j.phase === s.id)
      let em = null
      if (s.id === 'arrival') { const n = jobs.filter((x) => v.arriving.includes(x)).length; em = n ? `${n} due ≤ 7 d` : null }
      if (s.id === 'docs' && jobs.length) em = 'in LiveImpex'
      if (s.id === 'ooc') { const d = jobs.map((x) => daysAgo(x.job.be_date, now)).filter((n) => n !== null); em = d.length ? `oldest ${Math.max(...d)} d` : null }
      if (s.id === 'release' && jobs.length) em = 'truck or rail'
      stages.push({ ...s, jobs, em, hot: s.id === 'release' && jobs.length > 0 })
    }
  } else {
    for (const s of EXPORT_STAGES) stages.push({ ...s, jobs: exports.filter((x) => x.j.phase === s.id) })
  }
  // with All selected, open exports get one cell of their own so the pipeline adds up
  if (kind === 'all' && exports.length) stages.push({ id: 'exports', label: 'Exports', view: 'open', jobs: exports })
  const max = Math.max(1, ...stages.map((s) => s.jobs.length), v.delivered.length)
  const cols = [...stages.map((s) => (s.wide ? '1.9fr' : '1fr')), '1fr'].join(' ')

  return (
    <div className="ix-td-flow" style={{ '--cols': cols }}>
      {stages.map((s) => (
        <div key={s.id} className={`stage${s.hot ? ' hot' : ''}`}>
          <button type="button" className="h" onClick={() => openView(s.view)} title={`Open in All jobs`}>
            <b>{dash ? '–' : s.jobs.length}</b><span>{s.label}</span>{s.em ? <em>{s.em}</em> : null}
          </button>
          <div className="bar"><i style={{ width: `${(s.jobs.length / max) * 100}%` }} /></div>
          <div className="jobs">
            {[...s.jobs].sort(sortRows).slice(0, CHIP_CAP).map((x) => (
              <button key={x.id} type="button" className={`ix-td-jt ${chipTone(x)}`} onClick={() => onOpenJob(x.id)} title={`${x.job.job_no}${x.job.client ? ` · ${x.job.client}` : ''}`}>
                <i />{x.job.job_no}
              </button>
            ))}
            {s.jobs.length > CHIP_CAP && <button type="button" className="ix-link more" onClick={() => openView(s.view)}>+{s.jobs.length - CHIP_CAP} more</button>}
          </div>
        </div>
      ))}
      <div className="stage done">
        <div className="h static"><b>{dash ? '–' : v.delivered.length}</b><span>{kind === 'export' ? 'Shipped' : 'Delivered'}</span><em>7 days</em></div>
        <div className="bar"><i style={{ width: `${(v.delivered.length / max) * 100}%` }} /></div>
        <div className="jobs">
          {v.delivered.slice(0, 6).map((r) => (
            <button key={r.job.id} type="button" className="ix-td-jt green" onClick={() => onOpenJob(r.job.id)} title={`${r.job.job_no} · ${fmtDate(r.at)}`}><i />{r.job.job_no}</button>
          ))}
          {v.delivered.length > 6 && <button type="button" className="ix-link more" onClick={() => openView('all')}>see list</button>}
          {!v.delivered.length && !dash && <span className="none">None this week</span>}
        </div>
      </div>
    </div>
  )
}

// ── Free-time runway: the next 14 days, one bar per job to its last free day ──
function Runway({ v, dash, now, onOpenJob }) {
  const today = Math.floor((now + IST) / DAY)
  const days = Array.from({ length: 14 }, (_, k) => { const t = new Date((today + k) * DAY); return { d: t.getUTCDate(), w: t.getUTCDay() } })
  const imports = v.all.filter((x) => !isExportJob(x.job))
  const freeRows = imports.filter((x) => x.free !== null && x.free !== undefined)
  // not arrived yet: a diamond on the ETA day
  const etaRows = imports.filter((x) => x.eta && (x.free === null || x.free === undefined))
    .map((x) => ({ ...x, until: -daysAgo(x.eta, now) })).filter((x) => x.until >= 0)
  const rowsIn = [
    ...freeRows.filter((x) => x.free <= 13).map((x) => ({ ...x, pos: Math.max(x.free, 0), k: x.free, type: 'free' })),
    ...etaRows.filter((x) => x.until <= 13).map((x) => ({ ...x, pos: x.until, k: x.until, type: 'eta' })),
  ].sort((a, b) => a.k - b.k)
  const later = [
    ...freeRows.filter((x) => x.free > 13).map((x) => ({ x, text: `free till ${fmtDate(x.j.freeTill)}`, k: x.free })),
    ...etaRows.filter((x) => x.until > 13).map((x) => ({ x, text: `ETA ${fmtDate(x.eta)}`, k: x.until })),
  ].sort((a, b) => a.k - b.k)
  const shown = rowsIn.slice(0, 14)

  return (
    <Panel title="Free time runway" meta="next 14 days · per job, earliest box" className="ix-td-runway">
      {dash ? <Skeleton rows={5} /> : !rowsIn.length ? (
        <EmptyState line icon="clock" tone="green" title="No free time ends in the next 14 days.">{later.length ? `Next: ${later[0].x.job.job_no}, ${later[0].text}.` : null}</EmptyState>
      ) : (
        <div className="runway">
          <div className="rw-row rw-head">
            <div className="who">Job</div>
            <div className="rw-track">{days.map((d, k) => <div key={k} className={k === 0 ? 'today' : ''}><b>{d.d}</b>{WD1[d.w]}</div>)}</div>
          </div>
          <div className="rw-body">
            <div className="rw-row rw-under" aria-hidden="true">
              <div />
              <div className="rw-bg">{days.map((d, k) => <div key={k} className={`${k === 0 ? 'today' : ''}${d.w === 0 ? ' we' : ''}`} />)}</div>
            </div>
            {shown.map((x) => {
              const lvl = x.type === 'free' ? detentionLevel(x.free) : null
              const tone = lvl === 'over' || lvl === 'risk' ? 'red' : lvl === 'soon' ? 'amber' : ''
              const label = x.type === 'eta' ? `ETA ${fmtDate(x.eta)}` : x.free < 0 ? `${-x.free} d over` : fmtDate(x.j.freeTill)
              const n = (x.j.containers?.nos || []).length
              return (
                <div key={x.id} className="rw-row click" onClick={() => onOpenJob(x.id, x.type === 'free' ? 'containers' : undefined)} title={`${x.job.job_no} · ${label}`}>
                  <div className="who"><JobNo no={x.job.job_no} size="sm" /><span>{x.job.client || ''}{n > 1 ? ` · ${n} boxes` : ''}</span></div>
                  <div className="rw-track">
                    {x.type === 'eta'
                      ? <span className="rw-eta" style={{ gridColumn: x.pos + 1 }} />
                      : <div className={`rw-bar ${tone}`} style={{ gridColumn: `1 / span ${x.pos + 1}` }}><span>{label}</span></div>}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="rw-foot">
            <span className="ix-td-legend">
              <span><i className="red" />≤ 2 d</span><span><i className="amber" />3–5 d</span><span><i className="navy" />6 d +</span>
              {etaRows.length > 0 && <span><i className="eta" />ETA</span>}
            </span>
            {(later.length > 0 || rowsIn.length > shown.length) && (
              <span className="later">
                {rowsIn.length > shown.length && `+${rowsIn.length - shown.length} more · `}
                {later.length > 0 && <>Later: <JobNo no={later[0].x.job.job_no} size="sm" /> {later[0].text}{later.length > 1 ? ` · +${later.length - 1}` : ''}</>}
              </span>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}

// ── Latest updates: the last 24 h of saved updates plus this trip's container moves ──
const EV_ICON = (label) => (/road/i.test(label) ? ['road', ''] : /rail/i.test(label) ? ['train', ''] : /empty/i.test(label) ? ['box', 'ok'] : ['anchor', 'port'])
function Updates({ log, v, filtered, dash, now, onOpenJob }) {
  const events = useMemo(() => {
    if (!now) return []
    const out = []
    for (const r of log) {
      // a job hidden by the Import/Export or My jobs toggle stays hidden here too
      if (filtered && (!r.job_id || !v.shown.has(r.job_id))) continue
      const type = r.type || r.action
      const no = r.job_no ? String(r.job_no) : null
      let text = plain(r.title || String(type || '').replace(/_/g, ' '))
      if (no) text = text.replace(new RegExp(`\\s*${reEscape(no)}\\s*`), ' ').replace(/^[\s,—-]+|[\s,—-]+$/g, '').trim()
      const [icon, cls] = FEED_ICON[type] || ['point', '']
      out.push({
        key: `l${r.id}`, at: r.created_at, jobId: r.job_id || null, jobNo: no, text: text || 'Update',
        small: [NO_NOTE.includes(type) ? null : plain(r.note), r.done_by_name].filter(Boolean).join(' · '), icon, cls,
      })
    }
    for (const c of v.boxes) {
      for (const m of c.milestones || []) {
        const t = new Date(m.at).getTime()
        if (isNaN(t) || t < now - DAY || t > now + 3600000) continue
        const [icon, cls] = EV_ICON(m.label || '')
        out.push({ key: `c${c.no}${m.at}${m.raw}`, at: m.at, jobId: c.jobId, jobNo: c.jobNo, text: m.label || 'Container update', small: [c.no, m.place].filter(Boolean).join(' · '), mono: true, icon, cls })
      }
    }
    return out.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 15)
  }, [log, v, filtered, now])

  const today = Math.floor((now + IST) / DAY)
  const dayOf = (iso) => Math.floor((new Date(iso).getTime() + IST) / DAY)
  return (
    <Panel title="Latest updates" meta="last 24 h · IST" className="ix-td-updates">
      {dash ? <Skeleton rows={4} /> : !events.length ? (
        <EmptyState line icon="activity" title="No updates in the last 24 hours." />
      ) : (
        <div className="ix-td-feed">
          {events.map((e, i) => {
            const dn = dayOf(e.at)
            const newDay = i === 0 || dayOf(events[i - 1].at) !== dn
            return [
              newDay ? <div className="day" key={`d${dn}`}>{dn === today ? 'Today · ' : dn === today - 1 ? 'Yesterday · ' : ''}{fmtDate(e.at)}</div> : null,
              <div key={e.key} className={`ev${e.jobId ? ' click' : ''}`} onClick={() => e.jobId && onOpenJob(e.jobId)}>
                <time>{fmtTime(e.at)}</time>
                <span className={`ic ${e.cls}`}><Icon name={e.icon} /></span>
                <p>
                  {e.jobNo && <><JobNo no={e.jobNo} size="sm" /> </>}{e.text}
                  {e.small ? <small className={e.mono ? 'boxno' : undefined}>{e.small}</small> : null}
                </p>
              </div>,
            ]
          })}
        </div>
      )}
    </Panel>
  )
}
