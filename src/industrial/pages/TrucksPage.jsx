import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import {
  journeyFor, isExportJob, truckNos, onTheRoad, needATruck, jobTruckEntries, jobCount, daysAgo,
} from '../../services/journey'
import { assignTruck, editTruck, removeTruck, setStage } from '../../services/jobActions'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import { useAutoChecks, checkTruck, isDue } from '../autoChecks'
import {
  Icon, Chip, fmtDate, fmtDateTime, timeAgo, Skeleton, PageHead, JobNo, Status, Button, SearchBox, FreeDays, EmptyState, Dash,
} from '../ui'
import { truckPoints } from '../truckPoints'
import { askConfirm } from '../confirm'
import '../styles/tracking.css'

// the map (and its map library) loads only when this page opens
const TruckMap = lazy(() => import('../TruckMap'))

// Trucks (Jose, 1 Nov 2026: "simpler, less text"): one list of the trucks on the road with
// the map beside it, and the jobs ready for a truck. Opening the page looks up every truck
// on an open job by itself (where it is, and its papers once; limits in autoChecks.js), so
// there is no "Where is it?" button: a truck's ↻ asks again. Each truck has its own colour
// on its row and its map pin. The papers chip opens the saved answer (papers don't change
// from day to day). A truck number is corrected in place (✎); "Mark delivered" and "Take
// truck off" sit in the row's ⋯ menu. One "on the road" list (onTheRoad) drives the map,
// the count and the table, so they always agree.

const COLS = 7 // columns of the trucks table
// one colour per truck, on its row and its map pin (map layers cannot read CSS variables)
const TRUCK_COLORS = ['#1a4fa0', '#d9480f', '#0f766e', '#7c3aed', '#c2255c', '#0b7285', '#5c940d', '#b08900']

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
// "MH46AR2016: fitness expired on 1 Jan 2026; road tax expired on 3 Feb 2026." → the problems, one per line
const papersLines = (p) => {
  if (!p?.summary) return []
  if (p.tone !== 'bad') return [p.summary]
  return p.summary.replace(/^[^:]*:\s*/, '').replace(/\.\s*$/, '').split(/;\s*/).map((s) => s.charAt(0).toUpperCase() + s.slice(1))
}
// room under a button that a menu or box can open into: inside the table box and inside the
// part of the screen you can see (on a phone the scroll area ends at the tab bar; the box
// opened under it; Jose, 1 Nov 2026)
const roomBelow = (btn) => {
  const bottom = btn.getBoundingClientRect().bottom
  const frame = btn.closest('.ix-tbl-wrap')?.getBoundingClientRect()
  const main = btn.closest('.ix-main')?.getBoundingClientRect()
  return Math.min(frame ? frame.bottom : window.innerHeight, main ? main.bottom : window.innerHeight) - bottom
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
function PapersChip({ papers, onClick, disabled, open }) {
  let tone = 'grey', icon = 'shield', text = 'Not checked'
  if (papers) {
    if (!papers.found) { tone = 'amber'; icon = 'alert-triangle'; text = 'Not found' }
    else if (papers.tone === 'good') { tone = 'teal'; icon = 'shield-check'; text = 'Papers OK' }
    else if (papers.tone === 'bad') { tone = 'red'; icon = 'alert-triangle'; text = 'Papers problem' }
    else { tone = 'amber'; icon = 'alert-triangle'; text = 'Check papers' }
  }
  return (
    <button type="button" className="ix-trk-chipbtn" onClick={onClick} disabled={disabled} aria-expanded={open}
      title={papers ? 'Show what the papers say' : 'Check this truck’s papers'}>
      <Chip tone={tone} icon={icon}>{text}</Chip>
    </button>
  )
}

// the row's ⋯ menu: Mark delivered, Take truck off
function RowMenu({ items, label }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const shown = items.filter(Boolean)
  if (!shown.length) return null
  return (
    <span className="ix-trk-more" ref={box}>
      <button type="button" className="ix-icon-btn sm" aria-haspopup="menu" aria-expanded={open} aria-label={label} title="More"
        onClick={(e) => {
          e.stopPropagation()
          // near the bottom of the list the menu opens upwards (it was cut off on the last row)
          setUp(roomBelow(e.currentTarget) < 110)
          setOpen((v) => !v)
        }}>
        <Icon name="dots" />
      </button>
      {open && (
        <div className={`ix-menu${up ? ' up' : ''}`} role="menu">
          {shown.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={it.danger ? 'danger' : ''} disabled={it.disabled}
              onClick={(e) => { e.stopPropagation(); setOpen(false); it.run() }}>
              <Icon name={it.icon} />{it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

export default function TrucksPage({ currentUserName, onOpenJob, showToast, canUpdateStage }) {
  const { data, rows: allRows, loading, error, refresh, patchJob } = useJourney()
  const [rows, addResults, resultsFor] = useOverlay(data, allRows)
  const [urlQ] = useState(() => { try { return new URLSearchParams(window.location.search).get('q') || '' } catch { return '' } })
  const [search, setSearch] = useState(urlQ)
  const [selectedId, setSelectedId] = useState(null)
  const [papersOpen, setPapersOpen] = useState(null) // the truck (jobId:no) whose papers box is open
  const [papersUp, setPapersUp] = useState(false)
  // the papers box closes on a click elsewhere or Esc
  useEffect(() => {
    if (!papersOpen) return undefined
    const close = (e) => { if (!e.target.closest?.('.ix-trk-papcell')) setPapersOpen(null) }
    const esc = (e) => { if (e.key === 'Escape') setPapersOpen(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [papersOpen])
  const [forms, setForms] = useState({})            // jobId -> { truckNo, container, dlNo, error }
  const [editing, setEditing] = useState(undefined) // the job whose "add a truck" form is open (one at a time)
  const [fixing, setFixing] = useState(null)        // { key, truckNo, container, error }: a truck being corrected
  const [busyId, setBusyId] = useState(null)        // one save / look-up at a time
  const lock = useRef(false)
  const readyRef = useRef(null)
  const anyBusy = busyId !== null

  // ── the shared lists (journeyCore), on the rows with this page's fresh answers ──
  const road = useMemo(() => onTheRoad(rows), [rows])          // the one "on the road" list
  const ready = useMemo(() => needATruck(rows).sort(byUrgency), [rows])
  const entries = useMemo(() => jobTruckEntries(rows), [rows]) // trucks whose trip still runs
  const roadKeys = new Set(road.map((x) => x.key))
  // trucks put on a job that no toll has seen in the last 4 days yet
  const waiting = entries.filter((x) => !isExportJob(x.job) && !roadKeys.has(x.key))
  // (a truck whose box is back, or whose 4 days are up, is not shown at all: nothing left to
  // follow; Jose, 1 Nov 2026)

  const q = search.trim().toLowerCase()
  const match = (job) => !q || [...truckNos(job), job.job_no, job.client].some((v) => String(v || '').toLowerCase().includes(q))
  // the ?q= job (from a link elsewhere) is highlighted and shown on the map
  const isLinked = (job, no) => !!urlQ && (sameNo(job.job_no, urlQ) || (no ? sameNo(no, urlQ) : truckNos(job).some((n) => sameNo(n, urlQ))))
  // a link to a job waiting for a truck opens its truck form straight away
  const linkedReady = urlQ ? ready.find((r) => isLinked(r.job)) : null
  const editId = editing === undefined ? (linkedReady?.job.id ?? null) : editing

  // one colour per truck (the order of the list, so it stays put while the page is open)
  const colorOf = new Map(entries.map((x, i) => [x.key, TRUCK_COLORS[i % TRUCK_COLORS.length]]))

  // map pins: every truck still on its trip, plus moves seen only by container tracking (hollow)
  const pins = [
    ...entries.map((x) => ({ id: x.key, no: x.truck.no, job: x.job, color: colorOf.get(x.key), points: truckPoints(x.job, x.j, resultsFor(x.job.id), x.truck.no), hasLoc: !!x.truck.location })),
    ...road.filter((x) => x.kind !== 'truck' && x.place).map((x) => ({ id: x.key, no: null, job: x.job, hollow: true, mode: x.mode, points: placePoint(x) }))
      .filter((p) => p.points.some((pt) => pt.pos)),
  ]
  const sel = pins.find((p) => p.id === selectedId)
    || pins.find((p) => !p.hollow && isLinked(p.job, p.no))
    || null
  const mapMessage = road.length
    ? { title: `${plural(jobCount(road), 'job')} on the road, not at a place we can put on the map yet.`, sub: '' }
    : { title: 'No truck seen on the road yet.', sub: '' }

  // ── checks this page makes by itself when opened (no line about them on screen) ──
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
  useAutoChecks(autoItems, fresh, refresh)

  const setForm = (jobId, patch) => setForms((p) => ({ ...p, [jobId]: { ...p[jobId], ...patch } }))
  const openEditor = (jobId) => { setEditing(jobId); setForms((p) => ({ ...p, [jobId]: { ...p[jobId], error: '' } })) }
  const closeEditor = (jobId) => { setEditing(null); setForms((p) => ({ ...p, [jobId]: undefined })) }
  const openJob = (job) => onOpenJob?.(job.id, isExportJob(job) ? 'export' : undefined)

  const guarded = async (id, fn) => {
    if (lock.current) return
    lock.current = true
    setBusyId(id)
    try { await fn() } finally { lock.current = false; setBusyId(null) }
  }

  // the job's containers no truck carries yet
  const freeBoxes = (j, exceptNo) => {
    const taken = new Set((j?.trucks || []).filter((t) => t.no !== exceptNo).map((t) => t.container).filter(Boolean))
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

  // ✎: the truck number (and its container) corrected in place
  const startFix = (key, t) => { setFixing({ key, truckNo: t.no, container: t.container || '', error: '' }); setPapersOpen(null) }
  const saveFix = (job, t) => guarded(job.id, async () => {
    const res = await editTruck(job, t.no, { truckNo: fixing.truckNo, container: fixing.container }, currentUserName)
    if (!res.ok) { setFixing((f) => ({ ...f, error: res.error })); return }
    if (res.job !== job) showToast?.(`Truck ${t.no} saved as ${String(fixing.truckNo).toUpperCase()}`, 'success')
    setFixing(null)
    patchJob(res.job)
  })

  const unassign = async (job, no) => {
    if (!(await askConfirm({ title: `Take truck ${no} off ${job.job_no}?`, ok: 'Take it off', danger: true }))) return
    return guarded(job.id, async () => {
      const res = await removeTruck(job, no, currentUserName)
      if (!res.ok) { showToast?.(res.error, 'error'); return }
      showToast?.(`Truck ${no} taken off ${job.job_no}`, 'success')
      patchJob(res.job)
    })
  }

  const deliver = async (job) => {
    if (!(await askConfirm({ title: `Mark ${job.job_no} as delivered?`, ok: 'Mark delivered' }))) return
    return guarded(job.id, async () => {
      const res = await setStage(job, 10, 'Delivered', currentUserName)
      if (!res.ok) { showToast?.(res.error, 'error'); return }
      showToast?.(`${job.job_no} marked delivered`, 'success')
      patchJob(res.job)
    })
  }

  // Refresh (one button on the On the road card; Jose, 1 Nov 2026: no ↻ on every row): where
  // every truck still on its trip is now, one toll look-up per truck, one after the other,
  // then the page's data again. The map moves as each answer comes in.
  const [refreshing, setRefreshing] = useState(null) // { done, total } while running
  const refreshAll = () => guarded('all', async () => {
    const list = entries.filter((x) => !isExportJob(x.job))
    let failed = 0
    for (let i = 0; i < list.length; i++) {
      const { job, truck: t } = list[i]
      setRefreshing({ done: i, total: list.length })
      const res = await checkTruck('FASTAG/01', t.no, job.id)
      if (res.row) addResults(job.id, 'FASTAG/01', res.row)
      if (!res.ok) failed++
    }
    setRefreshing(null)
    refresh()
    if (failed) showToast?.(`${plural(failed, 'truck')} could not be looked up right now. Try again in a few minutes.`, 'error')
    else showToast?.(list.length ? `${plural(list.length, 'truck')} refreshed` : 'Refreshed', 'success')
  })

  // papers: the saved answer (no new look-up); only a truck never checked is looked up, once
  const showPapers = (job, t, key, e) => {
    if (papersOpen === key) { setPapersOpen(null); return }
    // near the bottom of the list the box opens upwards (it would be cut off)
    setPapersUp(!!e?.currentTarget && roomBelow(e.currentTarget) < 130)
    setFixing(null)
    if (t.papers) { setPapersOpen(key); return }
    guarded(key, async () => {
      const res = await checkTruck('VAHAN/04', t.no, job.id)
      if (res.row) addResults(job.id, 'VAHAN/04', res.row)
      if (!res.ok) { showToast?.(`Could not check the papers of ${t.no} right now.`, 'error'); return }
      setPapersOpen(key)
    })
  }

  // the "add a truck" form, inline under the job's row: truck no, which container it carries
  // (when the job has containers) or else the driver licence; one Save
  const editorRow = (job, j) => {
    const f = forms[job.id] || {}
    const boxes = freeBoxes(j)
    return (
      <tr key={`${job.id}:edit`} className="ix-trk-sub">
        <td colSpan={COLS}>
          <form className="ix-trk-form" onSubmit={(e) => { e.preventDefault(); if (f.truckNo && !anyBusy) assign(job, j) }}>
            <span className="lbl">{(j.trucks || []).length ? 'Another truck for' : 'Truck for'} <JobNo no={job.job_no} /></span>
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

  // the job cell: its number, and on its first row the + that adds another truck right beside it
  const jobCell = (job, first) => (
    <td>
      <span className="ix-trk-job">
        <JobNo no={job.job_no} onClick={() => openJob(job)} />
        {first && (
          <button type="button" className="ix-trk-add" disabled={anyBusy} onClick={(e) => { e.stopPropagation(); openEditor(job.id) }}
            title={`Add a truck to ${job.job_no}`} aria-label={`Add a truck to ${job.job_no}`}><Icon name="plus" /></button>
        )}
      </span>
    </td>
  )

  // one row per truck: the whole row picks the truck on the map
  const truckRow = (r, t, { first: firstSet } = {}) => {
    const { job, j } = r
    const key = `${job.id}:${t.no}`
    const first = firstSet ?? firstKey.get(job.id) === key
    const loc = t.location
    const color = colorOf.get(key)
    const fix = fixing?.key === key ? fixing : null
    const boxes = fix ? freeBoxes(j, t.no) : []
    return (
      <Fragment key={key}>
        <tr className={['click', sel?.id === key ? 'sel' : '', isLinked(job, t.no) ? 'hl' : ''].join(' ')} onClick={() => setSelectedId(key)}>
          {jobCell(job, first)}
          <td className="ix-trk-truck">
            {fix ? (
              <form className="ix-trk-fix" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (!anyBusy) saveFix(job, t) }}>
                <input className="plate" autoFocus value={fix.truckNo} aria-label={`Correct truck number ${t.no}`} disabled={anyBusy}
                  onChange={(e) => setFixing((f) => ({ ...f, truckNo: e.target.value.toUpperCase(), error: '' }))} />
                {boxes.length > 1 && (
                  <select value={fix.container} aria-label="Container on this truck" disabled={anyBusy}
                    onChange={(e) => setFixing((f) => ({ ...f, container: e.target.value, error: '' }))}>
                    <option value="">No container noted</option>
                    {boxes.map((no) => <option key={no} value={no}>{no}</option>)}
                  </select>
                )}
                <button type="submit" className="ix-icon-btn sm ok" disabled={anyBusy || !fix.truckNo} title="Save" aria-label="Save"><Icon name="check" /></button>
                <button type="button" className="ix-icon-btn sm" onClick={() => setFixing(null)} title="Cancel" aria-label="Cancel"><Icon name="x" /></button>
                {fix.error && <div className="err" role="alert"><Icon name="alert-triangle" />{fix.error}</div>}
              </form>
            ) : (
              <>
                <span className="dot" style={{ background: color }} />
                <span className="ix-plate">{t.no}</span>
                <button type="button" className="ix-trk-pen" disabled={anyBusy} onClick={(e) => { e.stopPropagation(); startFix(key, t) }}
                  title="Correct this truck" aria-label={`Correct truck ${t.no}`}><Icon name="pencil" /></button>
              </>
            )}
          </td>
          <td className="cl">{job.client || <Dash />}</td>
          <td className="mono">{t.container || j.containers?.nos?.[0] || <Dash />}</td>
          <td className="two">
            {loc
              ? <><span className="ix-trk-place">{loc.plaza}</span><span className="sub" title={loc.checkedAt ? `Looked up ${timeAgo(loc.checkedAt)}` : undefined}>{loc.at ? fmtDateTime(loc.at) : '—'}</span></>
              : <span className="t2">Not seen yet</span>}
          </td>
          <td className="ix-trk-papcell" onClick={(e) => e.stopPropagation()}>
            <PapersChip papers={t.papers} open={papersOpen === key} disabled={busyId === key} onClick={(e) => showPapers(job, t, key, e)} />
            {/* a small box at the chip, not a new row (Jose, 1 Nov 2026) */}
            {papersOpen === key && t.papers && (
              <div className={`ix-trk-pop ${t.papers.tone === 'bad' ? 'bad' : t.papers.tone === 'good' ? 'ok' : ''}${papersUp ? ' up' : ''}`} role="dialog" aria-label={`Papers of truck ${t.no}`}>
                <div className="hd">
                  <Icon name={t.papers.tone === 'good' ? 'shield-check' : 'alert-triangle'} />
                  <b>{t.no}</b>
                  <button type="button" className="ix-icon-btn sm" onClick={() => setPapersOpen(null)} aria-label="Close"><Icon name="x" /></button>
                </div>
                <ul>{papersLines(t.papers).map((l) => <li key={l}>{l}</li>)}</ul>
                {t.papers.checkedAt && <small>From the vehicle register, {fmtDate(t.papers.checkedAt)}</small>}
              </div>
            )}
          </td>
          <td className="act" onClick={(e) => e.stopPropagation()}>
            <div>
              <RowMenu label={`More for truck ${t.no}`} items={[
                first && canUpdateStage && { label: `Mark ${job.job_no} delivered`, icon: 'flag', disabled: anyBusy, run: () => deliver(job) },
                { label: 'Take truck off this job', icon: 'trash', danger: true, disabled: anyBusy, run: () => unassign(job, t.no) },
              ]} />
            </div>
          </td>
        </tr>
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
        <tr className={['click', sel?.id === x.key ? 'sel' : '', isLinked(job) ? 'hl' : ''].join(' ')} onClick={() => pins.some((p) => p.id === x.key) && setSelectedId(x.key)}>
          <td><JobNo no={job.job_no} onClick={() => openJob(job)} /></td>
          <td className="ix-trk-truck"><span className="dot hollow" /><span className="t2">No truck no.</span></td>
          <td className="cl">{job.client || <Dash />}</td>
          <td className="mono">{containersText(j.containers?.nos) || <Dash />}</td>
          <td className="two"><Status tone="blue">{text}{x.place ? ` · ${x.place}` : ''}</Status>{x.at && <span className="sub">{fmtDateTime(x.at)}</span>}</td>
          <td><Dash /></td>
          <td className="act" onClick={(e) => e.stopPropagation()}>
            <div>{x.mode !== 'rail' && editId !== job.id && <Button size="sm" icon="plus" onClick={() => openEditor(job.id)}>Add truck</Button>}</div>
          </td>
        </tr>
        {editId === job.id && !firstKey.has(job.id) && editorRow(job, j)}
      </Fragment>
    )
  }

  // a job with no truck yet (Ready for a truck)
  const readyRow = (r) => {
    const { job, j } = r
    const urgent = j.freeDaysLeft !== null && j.freeDaysLeft !== undefined && j.freeDaysLeft <= 2
    return (
      <Fragment key={job.id}>
        <tr className={[urgent ? 'red' : 'amber', isLinked(job) ? 'hl' : ''].join(' ')}>
          <td className="lvl" />
          <td><JobNo no={job.job_no} onClick={() => openJob(job)} /></td>
          <td className="cl">{job.client || <Dash />}</td>
          <td>{j.oocDate ? <>{fmtDate(j.oocDate)} <span className="t2">· {daysAgo(j.oocDate)} d</span></> : <Chip tone="amber">OOC date missing</Chip>}</td>
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

  const roadShown = road.filter((x) => match(x.job))
  const waitingShown = waiting.filter((x) => match(x.job))
  const readyShown = ready.filter((r) => match(r.job))
  // the job's own + (add a truck) and its truck form go on its first truck row in the table
  const firstKey = new Map()
  for (const x of [...roadShown.filter((e) => e.kind === 'truck'), ...waitingShown]) if (!firstKey.has(x.jobId)) firstKey.set(x.jobId, x.key)
  const anyTruckRows = roadShown.length + waitingShown.length > 0
  const showMap = road.length > 0 || entries.length > 0
  const group = (title, n) => <tr className="grp"><td colSpan={COLS}>{title}<span className="n">{n}</span></td></tr>

  return (
    <>
      <PageHead title="Trucks"
        actions={<>
          <SearchBox value={search} onChange={setSearch} placeholder="Truck, job or client" width={240} />
        </>} />

      {error && (
        <div className="ix-error">
          Could not load the latest data — {error}.{' '}
          <Button size="sm" onClick={refresh} style={{ marginLeft: 8 }}>Refresh</Button>
        </div>
      )}

      {loading && !data ? (
        <div className="ix-card"><Skeleton rows={6} /></div>
      ) : error ? null : (
        <>
          <section className="ix-card ix-trk-panel">
            <div className="ix-card-head">
              <Icon name="road" />
              <h2>On the road</h2><span className="n">{jobCount(road)}</span>
              <Button size="sm" variant="ghost" className="ix-trk-refresh" icon={refreshing || loading ? 'loader-2' : 'refresh'} disabled={anyBusy || loading} onClick={refreshAll}
                title="Where every truck is now (asks the toll system for each truck)">
                {refreshing ? `Refreshing ${refreshing.done + 1} of ${refreshing.total}…` : 'Refresh'}
              </Button>
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
                <table className="ix-tbl ix-trk-tbl">
                  <thead><tr>
                    <th>Job</th><th>Truck</th><th>Client</th><th>Container</th><th>Last seen</th><th>Papers</th><th className="r" aria-label="Actions" />
                  </tr></thead>
                  <tbody>
                    {roadShown.map((x) => {
                      if (x.kind !== 'truck') return movingRow(x)
                      const t = (x.j.trucks || []).find((tr) => tr.no === x.truckNo)
                      return t ? truckRow({ job: x.job, j: x.j }, t) : null
                    })}
                    {waitingShown.length > 0 && group('Not seen by a toll yet', waitingShown.length)}
                    {waitingShown.map((x) => truckRow({ job: x.job, j: x.j }, x.truck))}
                  </tbody>
                </table>
              </div>
            ) : q && road.length + waiting.length > 0 ? <EmptyState line icon="search" title="No truck matches your search." /> : null}
          </section>

          <section className="ix-card ix-trk-panel" ref={readyRef}>
            <div className="ix-card-head">
              <Icon name="truck-loading" />
              <h2>Ready for a truck</h2><span className={`n${ready.length ? ' amber' : ''}`}>{ready.length}</span>
            </div>
            {readyShown.length ? (
              <div className="ix-tbl-wrap">
                <table className="ix-tbl ix-trk-ready">
                  <thead><tr>
                    <th className="lvl" /><th>Job</th><th>Client</th><th>OOC</th><th>Containers</th><th className="r">Free days</th><th className="r" aria-label="Actions" />
                  </tr></thead>
                  <tbody>{readyShown.map(readyRow)}</tbody>
                </table>
              </div>
            ) : (
              <EmptyState line icon={search ? 'search' : 'circle-check'} tone={search ? 'grey' : 'green'}
                title={search ? 'No waiting job matches your search.' : 'No job waiting for a truck.'} />
            )}
          </section>
        </>
      )}
    </>
  )
}
