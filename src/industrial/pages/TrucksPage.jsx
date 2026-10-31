import { Fragment, Suspense, lazy, useMemo, useRef, useState } from 'react'
import {
  journeyFor, isDelivered, isExportJob, isActiveRow, truckNos, onTheRoad, needATruck, jobTruckEntries, truckTripOver, jobCount, daysAgo,
} from '../../services/journey'
import { assignTruck, removeTruck, setStage } from '../../services/jobActions'
import UlipCheck from '../../components/ulip/UlipCheck'
import { JOB_TABS } from '../../components/ulip/ulipChecks'
import { JobPicker, TruckWorkspace, NoJobChosen } from '../JobChecks'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import { useAutoChecks, checkTruck, isDue } from '../autoChecks'
import AutoStatus from '../AutoStatus'
import {
  Icon, Chip, fmtDate, fmtDateTime, fmtTime, timeAgo, Skeleton, PageHead, JobNo, Status, Tabs, Button, SearchBox, FreeDays, EmptyState, Dash,
} from '../ui'
import { truckPoints } from '../truckPoints'
import { askConfirm } from '../confirm'
import '../styles/tracking.css'

// the map (and its map library) loads only when this page opens
const TruckMap = lazy(() => import('../TruckMap'))
const TRUCK_GROUPS = JOB_TABS.find((t) => t.id === 'truck')?.groups || []

// Trucks: where each truck was last seen (toll crossings), what container tracking
// shows moving, and jobs waiting for a truck. Opening the page looks up every truck
// on an open job by itself and checks each truck's papers once (limits in
// autoChecks.js). "Where is it?" still works by hand.
// One "on the road" list (onTheRoad) drives the map, the count and the table, so they
// always agree (audit, Jose 31 Oct 2026). Each fact once (Jose, 31 Oct 2026): no figures
// strip (the panel heads carry the counts), the status line only when trucks are looked up.

const WHERE_CHECK = {
  api: 'FASTAG/01', title: 'Where is the truck now?', description: 'Asks the toll system for the plazas this truck crossed in the last 72 hours.',
  button: 'Find truck', refs: { vehiclenumber: 'vehicle_no' }, labels: { vehiclenumber: 'Truck number' },
}
const PAPERS_CHECK = {
  api: 'VAHAN/04', title: 'Truck papers', description: 'Registration, fitness and insurance from the transport department.',
  button: 'Check truck papers', refs: { vehiclenumber: 'vehicle_no' }, labels: { vehiclenumber: 'Truck number' },
}
const COLS = 8 // columns of every table on this page

const sameNo = (a, b) => !!a && !!b && String(a).toUpperCase().replace(/\s+/g, '') === String(b).toUpperCase().replace(/\s+/g, '')
const containersText = (nos) => (!nos?.length ? null : nos.length > 2 ? `${nos.length} containers` : nos.join(', '))
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
// a place name from container tracking ("KHALAPUR TOLL PLAZA") as a map point, through
// truckPoints' own list of known plazas (it reads a saved last place the same way)
const placePoint = (x) => truckPoints({ truck_no: x.key }, { truckLocation: { truck: x.key, plaza: x.place, at: x.at } }, {}, x.key)
// most urgent first: fewest free days, then the oldest OOC; missing values last
const byUrgency = (a, b) => {
  const fa = a.j.freeDaysLeft ?? Infinity, fb = b.j.freeDaysLeft ?? Infinity
  if (fa !== fb) return fa - fb
  return String(a.j.oocDate || '9').localeCompare(String(b.j.oocDate || '9'))
}

// Answers from checks made on this page, laid over the loaded data until the next full load
function useOverlay(data, rows) {
  const [extra, setExtra] = useState({ loadedAt: null, results: {} })
  const live = !!data && extra.loadedAt === data.loadedAt
  const resultsFor = (jobId) => ({ ...(data?.resultsByJob?.[jobId] || {}), ...(live ? extra.results[String(jobId)] || {} : {}) })
  // a new answer for one truck replaces only that truck's older answer (a job can have several trucks)
  const add = (jobId, api, row) => {
    const others = [].concat(resultsFor(jobId)[api] || []).filter((r) => r && !sameNo(r.params?.vehiclenumber, row.params?.vehiclenumber))
    const value = { [api]: [row, ...others] }
    setExtra((p) => {
      const base = p.loadedAt === data?.loadedAt ? p : { loadedAt: data?.loadedAt, results: {} }
      const id = String(jobId)
      return { ...base, results: { ...base.results, [id]: { ...(base.results[id] || {}), ...value } } }
    })
  }
  const view = useMemo(() => {
    if (!data || extra.loadedAt !== data.loadedAt || !Object.keys(extra.results).length) return rows
    const resultsByJob = { ...data.resultsByJob }
    for (const [id, r] of Object.entries(extra.results)) resultsByJob[id] = { ...(data.resultsByJob[id] || {}), ...r }
    const d2 = { ...data, resultsByJob }
    return rows.map((r) => (extra.results[String(r.job.id)] ? { job: r.job, j: journeyFor(r.job, d2) } : r))
  }, [data, rows, extra])
  return [view, add, resultsFor]
}

// papers: OK is a calm state (teal); green is kept for delivered / done
function PapersChip({ papers, onClick, disabled }) {
  let tone = 'grey', icon = 'shield', text = 'Not checked'
  if (papers) {
    if (!papers.found) { tone = 'amber'; icon = 'alert-triangle'; text = 'Papers not found' }
    else if (papers.tone === 'good') { tone = 'teal'; icon = 'shield-check'; text = 'Papers OK' }
    else if (papers.tone === 'bad') { tone = 'red'; icon = 'alert-triangle'; text = 'Papers problem' }
    else { tone = 'amber'; icon = 'alert-triangle'; text = 'Check papers' }
  }
  const title = papers ? `${papers.summary || ''}${papers.checkedAt ? ` (checked ${timeAgo(papers.checkedAt)})` : ''}` : 'Press to check the truck papers'
  return (
    <button type="button" className="ix-trk-chipbtn" onClick={onClick} disabled={disabled} title={title}>
      <Chip tone={tone} icon={icon}>{text}</Chip>
    </button>
  )
}

export default function TrucksPage({ currentUserName, onOpenJob, showToast, canUpdateStage }) {
  const { data, rows: allRows, loading, error, refresh, patchJob } = useJourney()
  const [rows, addResults, resultsFor] = useOverlay(data, allRows)
  const [urlQ] = useState(() => { try { return new URLSearchParams(window.location.search).get('q') || '' } catch { return '' } })
  const [search, setSearch] = useState(urlQ)
  const [selectedId, setSelectedId] = useState(null)
  const [checkId, setCheckId] = useState(() => new URLSearchParams(window.location.search).get('job'))
  // a ?job= link opens the truck & driver checks for that job
  const [view, setView] = useState(() => (new URLSearchParams(window.location.search).get('job') ? 'checks' : 'trucks'))
  const [panel, setPanel] = useState(null)          // { key: jobId:truckNo, kind: 'where' | 'papers' }
  const [forms, setForms] = useState({})            // jobId -> { truckNo, container, dlNo, error }
  const [editing, setEditing] = useState(undefined) // the job whose truck form is open (one at a time)
  const [busyId, setBusyId] = useState(null)        // one save at a time
  const lock = useRef(false)
  const readyRef = useRef(null)
  const anyBusy = busyId !== null

  // ── the shared lists (journeyCore), on the rows with this page's fresh answers ──
  const road = useMemo(() => onTheRoad(rows), [rows])          // the one "on the road" list
  const ready = useMemo(() => needATruck(rows).sort(byUrgency), [rows])
  const entries = useMemo(() => jobTruckEntries(rows), [rows]) // trucks whose trip still runs
  const open = useMemo(() => rows.filter(isActiveRow), [rows])
  const carting = open.filter((r) => isExportJob(r.job))
  const roadKeys = new Set(road.map((x) => x.key))
  // trucks put on a job that no toll has seen in the last 4 days yet
  const waiting = entries.filter((x) => !isExportJob(x.job) && !roadKeys.has(x.key))
  // import trucks whose 4-day watch is over while the job is still open (mark it delivered?)
  const tripOver = open.filter((r) => !isExportJob(r.job)).flatMap((r) => (r.j.trucks || []).filter((t) => truckTripOver(r, t)).map((t) => ({ key: `${r.job.id}:${t.no}`, jobId: r.job.id, r, t })))
  const papersBad = open.flatMap((r) => (r.j.trucks || []).filter((t) => t.papers?.found && t.papers.tone === 'bad').map((t) => ({ r, t })))
  const roadMoving = road.filter((x) => x.kind !== 'truck').length

  const q = search.trim().toLowerCase()
  const match = (job) => !q || [...truckNos(job), job.job_no, job.client].some((v) => String(v || '').toLowerCase().includes(q))
  // the ?q= job (from a link elsewhere) is highlighted and shown on the map
  const isLinked = (job, no) => !!urlQ && (sameNo(job.job_no, urlQ) || (no ? sameNo(no, urlQ) : truckNos(job).some((n) => sameNo(n, urlQ))))
  // a link to a job waiting for a truck opens its truck form straight away
  const linkedReady = urlQ ? ready.find((r) => isLinked(r.job)) : null
  const editId = editing === undefined ? (linkedReady?.job.id ?? null) : editing

  // map pins: every truck still on its trip, plus moves seen only by container tracking (hollow)
  const pins = [
    ...entries.map((x) => ({ id: x.key, no: x.truck.no, job: x.job, points: truckPoints(x.job, x.j, resultsFor(x.job.id), x.truck.no), hasLoc: !!x.truck.location })),
    ...road.filter((x) => x.kind !== 'truck' && x.place).map((x) => ({ id: x.key, no: null, job: x.job, hollow: true, mode: x.mode, points: placePoint(x) }))
      .filter((p) => p.points.some((pt) => pt.pos)),
  ]
  const sel = pins.find((p) => p.id === selectedId)
    || pins.find((p) => !p.hollow && isLinked(p.job, p.no))
    || pins.find((p) => p.hasLoc)
    || null
  const mapMessage = road.length
    ? { title: `${plural(jobCount(road), 'job')} on the road, not at a place we can put on the map yet.`, sub: roadMoving ? 'Add the truck number to follow it live.' : 'Press “Where is it?” on a truck below.' }
    : { title: 'No truck seen on the road yet.', sub: 'Trucks on open jobs are looked up by themselves when this page opens.' }

  // ── checks this page makes by itself when opened ──
  const fresh = useFreshOnOpen()
  const savedFor = (jobId, api, no) => [].concat(data?.resultsByJob?.[jobId]?.[api] || [])
    .filter((r) => r && sameNo(r.params?.vehiclenumber, no))
  const autoItems = entries.flatMap(({ job, truck: t }) => {
    const out = []
    const where = savedFor(job.id, 'FASTAG/01', t.no)
    // where is it: at most every COOLDOWN_MIN minutes per truck, while its trip lasts
    if (isDue(...where.map((x) => x.checked_at), ...where.map((x) => x.last_error_at)))
      out.push({ key: `w:${t.no}`, label: `truck ${t.no}`, run: () => checkTruck('FASTAG/01', t.no, job.id) })
    // papers don't change from day to day: once per truck
    if (!savedFor(job.id, 'VAHAN/04', t.no).some((x) => x.checked_at))
      out.push({ key: `p:${t.no}`, label: `truck ${t.no} papers`, run: () => checkTruck('VAHAN/04', t.no, job.id) })
    return out
  })
  const auto = useAutoChecks(autoItems, fresh, refresh)
  // the status line shows only when there are trucks to look up (no "nothing to look up" line)
  const lastLook = entries.flatMap(({ job, truck: t }) => savedFor(job.id, 'FASTAG/01', t.no).map((x) => x.checked_at)).filter(Boolean).sort().at(-1)
  const lastLookText = lastLook ? (fmtDate(lastLook) === fmtDate(new Date().toISOString()) ? fmtTime(lastLook) : fmtDateTime(lastLook)) : null
  const showStatus = entries.length > 0 || auto.running || auto.total > 0
  // (each truck at most every COOLDOWN_MIN min, see autoChecks.js)
  const idleText = `Trucks looked up automatically${lastLookText ? ` · last ${lastLookText}` : ''}`

  const setForm = (jobId, patch) => setForms((p) => ({ ...p, [jobId]: { ...p[jobId], ...patch } }))
  const togglePanel = (key, kind) => setPanel((p) => (p?.key === key && p.kind === kind ? null : { key, kind }))
  const openEditor = (jobId) => { setEditing(jobId); setForms((p) => ({ ...p, [jobId]: { ...p[jobId], error: '' } })) }
  const closeEditor = (jobId) => { setEditing(null); setForms((p) => ({ ...p, [jobId]: undefined })) }
  const openJob = (job) => onOpenJob?.(job.id, isExportJob(job) ? 'export' : undefined)

  const guarded = async (jobId, fn) => {
    if (lock.current) return
    lock.current = true
    setBusyId(jobId)
    try { await fn() } finally { lock.current = false; setBusyId(null) }
  }

  // the job's containers no truck carries yet
  const freeBoxes = (j) => {
    const taken = new Set((j?.trucks || []).map((t) => t.container).filter(Boolean))
    return (j?.containers?.nos || []).filter((no) => !taken.has(no))
  }
  // one free container: it is the one on the truck, no need to pick it (Jose, 31 Oct 2026)
  const assign = (job, j) => guarded(job.id, async () => {
    const f = forms[job.id] || {}
    const free = freeBoxes(j)
    const container = f.container || (free.length === 1 ? free[0] : '')
    const res = await assignTruck(job, { truckNo: f.truckNo, dlNo: f.dlNo, container }, currentUserName)
    if (!res.ok) { setForm(job.id, { error: res.error }); return }
    showToast?.(`Truck ${String(f.truckNo).toUpperCase()} added to ${job.job_no}`, 'success')
    setForms((p) => ({ ...p, [job.id]: undefined }))
    setEditing(null)
    patchJob(res.job)
  })

  const unassign = async (job, no) => {
    if (!(await askConfirm({ title: `Take truck ${no} off job ${job.job_no}?`, ok: 'Take it off' }))) return
    return guarded(job.id, async () => {
      const res = await removeTruck(job, no, currentUserName)
      if (!res.ok) { showToast?.(res.error, 'error'); return }
      showToast?.(`Truck ${no} taken off ${job.job_no}`, 'success')
      setPanel(null)
      patchJob(res.job)
    })
  }

  const deliver = async (job) => {
    if (!(await askConfirm({ title: `Mark job ${job.job_no} as delivered?`, ok: 'Mark delivered' }))) return
    return guarded(job.id, async () => {
      const res = await setStage(job, 10, 'Delivered', currentUserName)
      if (!res.ok) { showToast?.(res.error, 'error'); return }
      showToast?.(`${job.job_no} marked delivered`, 'success')
      if (panel?.key?.startsWith(`${job.id}:`)) setPanel(null)
      patchJob(res.job)
    })
  }

  // the truck form, inline under its row: truck no, which container it carries (when the
  // job has containers) or else the driver licence; one Save
  const editorRow = (job, j) => {
    const f = forms[job.id] || {}
    const boxes = freeBoxes(j)
    return (
      <tr key={`${job.id}:edit`} className="ix-trk-sub">
        <td colSpan={COLS}>
          <form className="ix-trk-form" onSubmit={(e) => { e.preventDefault(); if (f.truckNo && !anyBusy) assign(job, j) }}>
            <span className="lbl">{(j.trucks || []).length ? 'Another truck for' : 'Truck for'} <JobNo no={job.job_no} /></span>
            {/* focus goes straight to the truck number: the person just pressed "Assign truck" */}
            <input className="plate" autoFocus value={f.truckNo || ''} placeholder="MH04AB1234" aria-label={`Truck number for ${job.job_no}`} disabled={anyBusy}
              onChange={(e) => setForm(job.id, { truckNo: e.target.value.toUpperCase(), error: '' })} />
            {boxes.length === 1 ? (
              <span className="ix-trk-box mono" title="The job's only container: it goes on this truck">{boxes[0]}</span>
            ) : boxes.length > 1 ? (
              <select value={f.container || ''} aria-label={`Container on this truck for ${job.job_no} (optional)`} disabled={anyBusy}
                onChange={(e) => setForm(job.id, { container: e.target.value, error: '' })}>
                <option value="">Container (optional)</option>
                {boxes.map((no) => <option key={no} value={no}>{no}</option>)}
              </select>
            ) : (
              <input value={f.dlNo || ''} placeholder="Driver licence (optional)" aria-label={`Driver licence for ${job.job_no} (optional)`} disabled={anyBusy}
                onChange={(e) => setForm(job.id, { dlNo: e.target.value.toUpperCase(), error: '' })} />
            )}
            <Button type="submit" variant="primary" size="sm" icon="check" disabled={anyBusy || !f.truckNo}>{busyId === job.id ? 'Saving…' : 'Save truck'}</Button>
            <Button size="sm" variant="ghost" onClick={() => closeEditor(job.id)}>Cancel</Button>
            {f.error && <div className="err" role="alert"><Icon name="alert-triangle" />{f.error}</div>}
          </form>
        </td>
      </tr>
    )
  }

  // one row per truck; the job's own actions (add a truck, delivered) sit on its first truck
  const truckRow = (r, t, { first: firstSet, label } = {}) => {
    const { job, j } = r
    const key = `${job.id}:${t.no}`
    const first = firstSet ?? firstKey.get(job.id) === key
    const loc = t.location
    const kind = panel?.key === key ? panel.kind : null
    const many = (j.trucks || []).length > 1
    return (
      <Fragment key={key}>
        <tr className={[sel?.id === key ? 'sel' : '', isLinked(job, t.no) ? 'hl' : '', t.papers?.found && t.papers.tone === 'bad' ? 'red' : ''].join(' ')}>
          <td className="lvl" />
          <td><JobNo no={job.job_no} onClick={() => openJob(job)} /></td>
          <td className="cl">{job.client || <Dash />}</td>
          <td><button type="button" className="ix-plate" onClick={() => setSelectedId(key)} title="Show this truck on the map">{t.no}</button></td>
          <td className="mono">{t.container || (many ? <span className="dim">Not noted</span> : j.containers?.nos?.[0] || <Dash />)}</td>
          <td className="two">
            {loc
              ? <><span className="ix-trk-place"><Icon name="map-pin" />{loc.plaza}</span><span className="sub" title={loc.checkedAt ? `Looked up ${timeAgo(loc.checkedAt)}` : undefined}>{loc.at ? fmtDateTime(loc.at) : 'Time not given'}</span></>
              : <span className="t2">Not seen by a toll yet</span>}
          </td>
          <td><PapersChip papers={t.papers} onClick={() => togglePanel(key, 'papers')} /></td>
          <td className="act">
            <div>
              <Button size="sm" icon="map-pin" aria-pressed={kind === 'where'} onClick={() => { togglePanel(key, 'where'); setSelectedId(key) }}>Where is it?</Button>
              {first && label && canUpdateStage && (
                <Button size="sm" icon="flag" disabled={anyBusy} onClick={() => deliver(job)}>{busyId === job.id ? 'Saving…' : 'Mark delivered'}</Button>
              )}
              {first && (
                <button type="button" className="ix-icon-btn sm" disabled={anyBusy} onClick={() => openEditor(job.id)} title={`Add another truck to ${job.job_no}`} aria-label={`Add another truck to ${job.job_no}`}>
                  <Icon name="plus" />
                </button>
              )}
              {first && !label && canUpdateStage && (
                <button type="button" className="ix-icon-btn sm" disabled={anyBusy} onClick={() => deliver(job)} title={`Mark ${job.job_no} delivered`} aria-label={`Mark ${job.job_no} delivered`}>
                  <Icon name="flag" />
                </button>
              )}
              <button type="button" className="ix-icon-btn sm" disabled={anyBusy} onClick={() => unassign(job, t.no)} title={`Take truck ${t.no} off this job`} aria-label={`Remove truck ${t.no}`}>
                <Icon name="x" />
              </button>
            </div>
          </td>
        </tr>
        {kind && (
          <tr className="ix-trk-sub">
            <td colSpan={COLS}>
              <div className="in">
                {/* the check is filled in with THIS truck's number */}
                <UlipCheck key={`${key}:${kind}`} check={kind === 'where' ? WHERE_CHECK : PAPERS_CHECK} job={{ ...job, truck_no: t.no }} compact
                  onResult={(row) => { if (row) addResults(job.id, kind === 'where' ? 'FASTAG/01' : 'VAHAN/04', row) }}
                  onJobChange={patchJob} />
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <Button size="sm" variant="ghost" icon="shield-check" onClick={() => { setCheckId(job.id); setView('checks') }}>More truck and driver checks</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>Close</Button>
                </div>
              </div>
            </td>
          </tr>
        )}
        {first && editId === job.id && editorRow(job, j)}
      </Fragment>
    )
  }

  // container tracking shows the box moving, but the job has no truck number
  const movingRow = (x) => {
    const { job, j } = x
    const text = x.kind === 'left' ? `Left ${j.containers?.exitFrom || 'CFS'}` : x.mode === 'rail' ? 'On rail' : 'On the road'
    return (
      <Fragment key={x.key}>
        <tr className={[sel?.id === x.key ? 'sel' : '', isLinked(job) ? 'hl' : ''].join(' ')}>
          <td className="lvl" />
          <td><JobNo no={job.job_no} onClick={() => openJob(job)} /></td>
          <td className="cl">{job.client || <Dash />}</td>
          {/* no truck number: a dash (the Add truck number button is on the row; "On rail" is in the status) */}
          <td><Dash /></td>
          <td className="mono">{containersText(j.containers?.nos) || <Dash />}</td>
          <td className="two">
            <Status tone="blue">{text}{x.place ? ` · ${x.place}` : ''}</Status>
            <span className="sub">{x.at ? `${fmtDateTime(x.at)} · ` : ''}container tracking</span>
          </td>
          <td><Dash /></td>
          <td className="act">
            <div>
              {pins.some((p) => p.id === x.key) && <Button size="sm" variant="ghost" icon="map-pin" onClick={() => setSelectedId(x.key)}>Map</Button>}
              {x.mode !== 'rail' && editId !== job.id && <Button size="sm" icon="plus" onClick={() => openEditor(job.id)}>Add truck number</Button>}
            </div>
          </td>
        </tr>
        {editId === job.id && !firstKey.has(job.id) && editorRow(job, j)}
      </Fragment>
    )
  }

  // a job with no truck yet (Ready for a truck, export carting)
  const readyRow = (r) => {
    const { job, j } = r
    const urgent = j.freeDaysLeft !== null && j.freeDaysLeft !== undefined && j.freeDaysLeft <= 2
    return (
      <Fragment key={job.id}>
        <tr className={[urgent ? 'red' : 'amber', isLinked(job) ? 'hl' : ''].join(' ')}>
          <td className="lvl" />
          <td><JobNo no={job.job_no} onClick={() => openJob(job)} /></td>
          <td className="cl">{job.client || <Dash />}</td>
          <td>{j.oocDate ? fmtDate(j.oocDate) : <Chip tone="amber">OOC date missing</Chip>}</td>
          <td className="r" title={j.oocDate ? 'Days since OOC' : undefined}>{j.oocDate ? `${daysAgo(j.oocDate)} d` : <Dash />}</td>
          <td className="mono">{containersText(j.containers?.nos) || <Dash />}</td>
          <td className="r"><FreeDays value={j.freeDaysLeft} till={j.freeTill ? fmtDate(j.freeTill) : null} /></td>
          <td className="act">
            <div>
              {editId !== job.id && (
                <Button size="sm" icon="truck" variant={urgent ? 'primary' : 'secondary'} urgent={urgent} disabled={anyBusy} onClick={() => openEditor(job.id)}>Assign truck</Button>
              )}
            </div>
          </td>
        </tr>
        {editId === job.id && editorRow(job, j)}
      </Fragment>
    )
  }

  const truckHead = (
    <thead><tr>
      <th className="lvl" /><th>Job</th><th>Client</th><th>Truck</th><th>Container</th><th>Last seen</th><th>Papers</th><th className="r" aria-label="Actions" />
    </tr></thead>
  )
  const group = (icon, title, n, hint) => (
    <tr className="grp"><td colSpan={COLS}><Icon name={icon} />{title}<span className="n">{n}</span>{hint && <span className="hint hide-m">{hint}</span>}</td></tr>
  )
  const roadShown = road.filter((x) => match(x.job))
  const waitingShown = waiting.filter((x) => match(x.job))
  const overShown = tripOver.filter((x) => match(x.r.job))
  const readyShown = ready.filter((r) => match(r.job))
  const cartingShown = carting.filter((r) => match(r.job))
  // the job's own actions (add a truck, delivered, its truck form) go on its first truck row in the table
  const firstKey = new Map()
  for (const x of [...roadShown.filter((e) => e.kind === 'truck'), ...waitingShown, ...overShown]) if (!firstKey.has(x.jobId)) firstKey.set(x.jobId, x.key)
  const anyTruckRows = roadShown.length + waitingShown.length + overShown.length > 0
  const showMap = road.length > 0 || entries.length > 0

  return (
    <>
      <PageHead title="Trucks"
        actions={<>
          {view === 'trucks' && <SearchBox value={search} onChange={setSearch} placeholder="Truck, job or client" width={260} />}
          <Button size="sm" variant="ghost" icon="refresh" onClick={refresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        </>} />

      <Tabs className="ix-trk-tabs" value={view} onChange={setView} tabs={[
        { id: 'trucks', label: 'Trucks', icon: 'truck' },
        { id: 'checks', label: 'Truck & driver checks', icon: 'shield-check' },
      ]} />

      {error && (
        <div className="ix-error">
          Could not load the latest data — {error}.{' '}
          <Button size="sm" onClick={refresh} style={{ marginLeft: 8 }}>Refresh</Button>
        </div>
      )}

      {view === 'checks' ? (
        <div className="ix-split">
          <JobPicker
            title="Find a job or truck"
            rows={allRows.filter((r) => !isDelivered(r.job))}
            selectedId={checkId}
            onSelect={setCheckId}
            placeholder="Job no, client, truck no…"
            lists={[
              { title: 'Trucks on open jobs', icon: 'truck', color: 'var(--navy)', rows: [...new Map(entries.map((x) => [x.jobId, { job: x.job, j: x.j }])).values()], empty: 'No truck on an open job.', sub: ({ job }) => `Truck ${truckNos(job).join(', ')}` },
              { title: 'Ready for a truck', icon: 'truck-loading', color: 'var(--amber)', rows: ready, empty: 'No job waiting for a truck.', sub: ({ j }) => (j.oocDate ? `OOC ${fmtDate(j.oocDate)}, no truck yet` : 'OOC done, no truck yet') },
            ]}
          />
          {checkId
            ? <TruckWorkspace jobId={checkId} onOpenJob={onOpenJob} groups={TRUCK_GROUPS} />
            : <NoJobChosen text="Pick a job on the left. Each check asks the government system only when you press its button." />}
        </div>
      ) : (
        <>
          {showStatus && <AutoStatus auto={auto} fresh={fresh} what="trucks" idle={idleText} />}

          {loading && !data ? (
            <div className="ix-card"><Skeleton rows={6} /></div>
          ) : error ? null : (
            <>
              {/* papers problems: a red line only when there is one */}
              {papersBad.length > 0 && (
                <div className="ix-trk-alerts" role="alert">
                  <div className="ix-trk-al red">
                    <Icon name="alert-triangle" />
                    <p>
                      <span>{papersBad.length === 1 ? 'Truck papers problem' : `${papersBad.length} truck papers problems`}</span>
                      {papersBad.map(({ r, t }) => (
                        <span key={`${r.job.id}:${t.no}`} className="t" title={t.papers?.summary || undefined}>
                          <JobNo no={r.job.job_no} onClick={() => openJob(r.job)} /> truck {t.no}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              )}

              <section className="ix-card ix-trk-panel">
                <div className="ix-card-head">
                  <Icon name="road" />
                  <h2>On the road</h2><span className="n">{jobCount(road)}</span>
                  <span className="sub hide-m">Last toll crossing of each truck (last 4 days), and boxes container tracking sees moving</span>
                </div>
                {showMap ? (
                  <Suspense fallback={<div className="ix-realmap"><div className="ix-realmap-msg">Loading map…</div></div>}>
                    <TruckMap trucks={pins} selectedId={sel?.id || null} onSelect={setSelectedId} message={mapMessage} />
                  </Suspense>
                ) : (
                  <EmptyState line icon="truck" title="No truck on the road ·"
                    action={ready.length
                      ? <button type="button" className="ix-link" onClick={() => readyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{plural(ready.length, 'job')} ready for a truck →</button>
                      : <span className="t2">no job waiting for a truck</span>} />
                )}
                {anyTruckRows ? (
                  <div className="ix-tbl-wrap">
                    <table className="ix-tbl">
                      {truckHead}
                      <tbody>
                        {/* (no 'On the road' group row: the panel head above already says it) */}
                        {roadShown.map((x) => {
                          if (x.kind !== 'truck') return movingRow(x)
                          const t = (x.j.trucks || []).find((tr) => tr.no === x.truckNo)
                          return t ? truckRow({ job: x.job, j: x.j }, t) : null
                        })}
                        {waitingShown.length > 0 && group('clock', 'Waiting for a toll crossing', waitingShown.length, 'Put on the job, no toll has seen it yet')}
                        {waitingShown.map((x) => truckRow({ job: x.job, j: x.j }, x.truck))}
                        {overShown.length > 0 && group('flag', 'Trip over, job still open', overShown.length, 'No more look-ups after 4 days or once the box is back')}
                        {overShown.map((x) => truckRow(x.r, x.t, { label: true }))}
                      </tbody>
                    </table>
                  </div>
                ) : q && road.length + waiting.length + tripOver.length > 0 ? <EmptyState line icon="search" title="No truck matches your search." /> : null}
              </section>

              <section className="ix-card ix-trk-panel" ref={readyRef}>
                <div className="ix-card-head">
                  <Icon name="truck-loading" />
                  <h2>Ready for a truck</h2><span className={`n${ready.length ? ' amber' : ''}`}>{ready.length}</span>
                  <span className="sub hide-m">OOC done, no truck yet · most urgent first</span>
                </div>
                {readyShown.length ? (
                  <div className="ix-tbl-wrap">
                    <table className="ix-tbl">
                      <thead><tr>
                        <th className="lvl" /><th>Job</th><th>Client</th><th>OOC</th><th className="r">Waiting</th><th>Containers</th><th className="r">Free days</th><th className="r" aria-label="Actions" />
                      </tr></thead>
                      <tbody>{readyShown.map(readyRow)}</tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState line icon={search ? 'search' : 'circle-check'} tone={search ? 'grey' : 'green'}
                    title={search ? 'No waiting job matches your search.' : 'No job waiting for a truck.'} />
                )}
              </section>

              <section className="ix-card ix-trk-panel">
                <div className="ix-card-head">
                  <Icon name="package-export" />
                  <h2>Export carting</h2><span className="n">{carting.length}</span>
                  <span className="sub hide-m">Export cargo going to the port</span>
                </div>
                {cartingShown.length ? (
                  <div className="ix-tbl-wrap">
                    <table className="ix-tbl">
                      {truckHead}
                      <tbody>
                        {cartingShown.flatMap((r) => (truckNos(r.job).length
                          ? (r.j.trucks || []).map((t, i) => truckRow(r, t, { first: i === 0, label: true }))
                          : [(
                            <Fragment key={r.job.id}>
                              <tr className={isLinked(r.job) ? 'hl' : ''}>
                                <td className="lvl" />
                                <td><JobNo no={r.job.job_no} onClick={() => openJob(r.job)} /></td>
                                <td className="cl">{r.job.client || <Dash />}</td>
                                <td><span className="ix-plate none">No truck yet</span></td>
                                <td><Dash /></td>
                                <td className="t2">Export cargo to the port</td>
                                <td><Dash /></td>
                                <td className="act"><div>{editId !== r.job.id && <Button size="sm" icon="truck" disabled={anyBusy} onClick={() => openEditor(r.job.id)}>Assign truck</Button>}</div></td>
                              </tr>
                              {editId === r.job.id && editorRow(r.job, r.j)}
                            </Fragment>
                          )]))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState line icon={search ? 'search' : 'package'} title={search ? 'No export job matches your search.' : 'No export jobs waiting for cargo to reach the port.'} />
                )}
              </section>
            </>
          )}
        </>
      )}
    </>
  )
}
