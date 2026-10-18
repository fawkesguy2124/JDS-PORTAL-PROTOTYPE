import { useMemo, useRef, useState } from 'react'
import { journeyFor, isDelivered, isExportJob } from '../../services/journey'
import { assignTruck, setStage } from '../../services/jobActions'
import UlipCheck from '../../components/ulip/UlipCheck'
import { JOB_TABS } from '../../components/ulip/ulipChecks'
import { JobPicker, TruckWorkspace, NoJobChosen } from '../JobChecks'

const TRUCK_GROUPS = JOB_TABS.find((t) => t.id === 'truck')?.groups || []
import { useJourney } from '../JourneyContext'
import { Icon, Chip, fmtDate, timeAgo } from '../ui'
import TruckMap from '../TruckMap'
import { truckPoints } from '../truckPoints'

// Trucks: where each truck was last seen (saved FASTag answers), and jobs
// waiting for one. Truck checks run ONLY when staff press the check button.

const WHERE_CHECK = {
  api: 'FASTAG/01', title: 'Where is the truck now?', description: 'Asks FASTag for the toll plazas this truck crossed in the last 72 hours.',
  button: 'Find truck', refs: { vehiclenumber: 'vehicle_no' }, labels: { vehiclenumber: 'Truck number' },
}
const PAPERS_CHECK = {
  api: 'VAHAN/04', title: 'Truck papers', description: 'Registration, fitness and insurance from VAHAN.',
  button: 'Check truck papers', refs: { vehiclenumber: 'vehicle_no' }, labels: { vehiclenumber: 'Truck number' },
}

const sameNo = (a, b) => !!a && !!b && String(a).toUpperCase().replace(/\s+/g, '') === String(b).toUpperCase().replace(/\s+/g, '')
const fmtTime = (v) => {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d) ? String(v) : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
const containersText = (nos) => (!nos?.length ? '—' : nos.length > 2 ? `${nos.length} containers` : nos.join(', '))

// Answers from checks made on this page, laid over the loaded data until the next full load
function useOverlay(data, rows) {
  const [extra, setExtra] = useState({ loadedAt: null, results: {} })
  const live = !!data && extra.loadedAt === data.loadedAt
  const add = (jobId, value) => setExtra((p) => {
    const base = p.loadedAt === data?.loadedAt ? p : { loadedAt: data?.loadedAt, results: {} }
    const id = String(jobId)
    return { ...base, results: { ...base.results, [id]: { ...(base.results[id] || {}), ...value } } }
  })
  const resultsFor = (jobId) => ({ ...(data?.resultsByJob?.[jobId] || {}), ...(live ? extra.results[String(jobId)] || {} : {}) })
  const view = useMemo(() => {
    if (!data || extra.loadedAt !== data.loadedAt || !Object.keys(extra.results).length) return rows
    const resultsByJob = { ...data.resultsByJob }
    for (const [id, r] of Object.entries(extra.results)) resultsByJob[id] = { ...(data.resultsByJob[id] || {}), ...r }
    const d2 = { ...data, resultsByJob }
    return rows.map((r) => (extra.results[String(r.job.id)] ? { job: r.job, j: journeyFor(r.job, d2) } : r))
  }, [data, rows, extra])
  return [view, add, resultsFor]
}

function PapersChip({ papers, onClick, disabled }) {
  let tone = 'grey', icon = 'shield', text = 'Papers not checked'
  if (papers) {
    if (!papers.found) { tone = 'amber'; icon = 'alert-triangle'; text = 'Papers not found' }
    else if (papers.tone === 'good') { tone = 'green'; icon = 'shield-check'; text = 'Papers OK' }
    else if (papers.tone === 'bad') { tone = 'red'; icon = 'alert-triangle'; text = 'Papers problem' }
    else { tone = 'amber'; icon = 'alert-triangle'; text = 'Check papers' }
  }
  const title = papers ? `${papers.summary || ''}${papers.checkedAt ? ` (checked ${timeAgo(papers.checkedAt)})` : ''}` : 'Press to check the truck papers'
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left' }}>
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
  const [panel, setPanel] = useState(null)          // { jobId, kind: 'where' | 'papers' }
  const [forms, setForms] = useState({})            // jobId -> { truckNo, dlNo, error }
  const [busyId, setBusyId] = useState(null)        // one save at a time
  const lock = useRef(false)
  const anyBusy = busyId !== null

  const lists = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = (j) => !q || [j.truck_no, j.job_no, j.client].some((v) => String(v || '').toLowerCase().includes(q))
    const ready = [], road = [], carting = []
    for (const r of rows) {
      const { job, j } = r
      if (isDelivered(job) || j.phase === 'delivered' || !match(job)) continue
      if (isExportJob(job)) carting.push(r)
      else if (job.truck_no) road.push(r)
      else if (j.readyForTruck) ready.push(r)
    }
    return { ready, road, carting }
  }, [rows, search])

  // the ?q= job (from a link elsewhere) is highlighted and shown on the map
  const isLinked = (job) => !!urlQ && (sameNo(job.job_no, urlQ) || sameNo(job.truck_no, urlQ))
  const onRoad = [...lists.road, ...lists.carting.filter((r) => r.job.truck_no)]
  const sel = onRoad.find((r) => r.job.id === selectedId)
    || onRoad.find((r) => isLinked(r.job))
    || onRoad.find((r) => r.j.truckLocation)
    || onRoad[0] || null

  const setForm = (jobId, patch) => setForms((p) => ({ ...p, [jobId]: { ...p[jobId], ...patch } }))
  const togglePanel = (jobId, kind) => setPanel((p) => (p?.jobId === jobId && p.kind === kind ? null : { jobId, kind }))

  const guarded = async (jobId, fn) => {
    if (lock.current) return
    lock.current = true
    setBusyId(jobId)
    try { await fn() } finally { lock.current = false; setBusyId(null) }
  }

  const assign = (job) => guarded(job.id, async () => {
    const f = forms[job.id] || {}
    const res = await assignTruck(job, { truckNo: f.truckNo, dlNo: f.dlNo }, currentUserName)
    if (!res.ok) {
      if (!f.dlNo && /licence/i.test(res.error || '')) { showToast?.(`Truck assigned to ${job.job_no}`, 'success'); setForms((p) => ({ ...p, [job.id]: undefined })); refresh(); return }
      setForm(job.id, { error: res.error }); return
    }
    showToast?.(`Truck assigned to ${job.job_no}`, 'success')
    setForms((p) => ({ ...p, [job.id]: undefined }))
    patchJob(res.job)
  })

  const deliver = (job) => {
    if (!window.confirm(`Mark job ${job.job_no} as delivered?`)) return
    return guarded(job.id, async () => {
      const res = await setStage(job, 10, 'Delivered', currentUserName)
      if (!res.ok) { showToast?.(res.error, 'error'); return }
      showToast?.(`${job.job_no} marked delivered`, 'success')
      if (panel?.jobId === job.id) setPanel(null)
      patchJob(res.job)
    })
  }

  const jobLink = (job) => (
    <button type="button" onClick={() => onOpenJob?.(job.id, isExportJob(job) ? 'export' : undefined)}
      style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', minWidth: 0, maxWidth: '100%' }}>
      <b className="mono">{job.job_no}</b> <span style={{ color: 'var(--text-2)' }}>· {job.client || 'No client'}</span>
    </button>
  )

  const renderRoad = ({ job, j }) => {
    const loc = j.truckLocation
    const open = panel?.jobId === job.id ? panel.kind : null
    const cls = ['ix-truck-row', sel?.job.id === job.id ? 'sel' : '', isLinked(job) ? 'hl' : ''].join(' ')
    return (
      <div key={job.id}>
        <div className={cls}>
          <div>
            <button type="button" className="ix-plate" onClick={() => setSelectedId(job.id)} title="Show this truck on the map" style={{ cursor: 'pointer' }}>
              {job.truck_no}
            </button>
          </div>
          <div style={{ minWidth: 0 }}>
            {jobLink(job)}
            <div style={{ fontSize: 12, color: 'var(--muted)' }} className="mono">{j.containers?.nos?.[0] || ''}</div>
          </div>
          <div style={{ fontSize: 13, minWidth: 0 }}>
            <Icon name="map-pin" style={{ color: 'var(--navy)' }} />{' '}
            {loc
              ? <>{loc.plaza}<div style={{ fontSize: 12, color: 'var(--muted)' }}>{loc.at ? fmtTime(loc.at) : ''}{loc.checkedAt ? ` · checked ${timeAgo(loc.checkedAt)}` : ''}</div></>
              : <span style={{ color: 'var(--muted)' }}>Not checked yet</span>}
          </div>
          <div><PapersChip papers={j.truckPapers} onClick={() => togglePanel(job.id, 'papers')} /></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className={`ix-btn sm ${open === 'where' ? 'primary' : ''}`} onClick={() => { togglePanel(job.id, 'where'); setSelectedId(job.id) }}>
              <Icon name="map-pin" />Where is it?
            </button>
            {canUpdateStage && (
              <button type="button" className="ix-btn sm" disabled={anyBusy} onClick={() => deliver(job)}>
                <Icon name="flag" />{busyId === job.id ? 'Saving…' : 'Mark delivered'}
              </button>
            )}
          </div>
        </div>
        {open && (
          <div style={{ padding: '0 16px 14px' }}>
            <UlipCheck key={open} check={open === 'where' ? WHERE_CHECK : PAPERS_CHECK} job={job} compact
              onResult={(row) => { if (row) addResults(job.id, { [open === 'where' ? 'FASTAG/01' : 'VAHAN/04']: row }) }}
              onJobChange={patchJob} />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button type="button" className="ix-btn sm ghost" onClick={() => onOpenJob?.(job.id, 'truck')}>More truck and driver checks</button>
              <button type="button" className="ix-btn sm ghost" onClick={() => setPanel(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderReady = ({ job, j }) => {
    const f = forms[job.id] || {}
    return (
      <div key={job.id}>
        <div className={`ix-truck-row ready ${isLinked(job) ? 'hl' : ''}`}>
          <div>
            <button type="button" onClick={() => onOpenJob?.(job.id, isExportJob(job) ? 'export' : undefined)} style={{ border: 'none', background: 'none', padding: 0 }}>
              <b className="mono">{job.job_no}</b>
            </button>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.client || 'No client'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {j.oocDate ? `OOC ${fmtDate(j.oocDate)}` : isExportJob(job) ? 'Export cargo to the port' : 'OOC recorded'} · <span className="mono">{containersText(j.containers?.nos)}</span>
            </div>
          </div>
          <input value={f.truckNo || ''} placeholder="Truck no, like MH04AB1234" aria-label={`Truck number for ${job.job_no}`} disabled={anyBusy}
            onChange={(e) => setForm(job.id, { truckNo: e.target.value.toUpperCase(), error: '' })} />
          <input value={f.dlNo || ''} placeholder="Driver licence (optional)" aria-label={`Driver licence for ${job.job_no} (optional)`} disabled={anyBusy}
            onChange={(e) => setForm(job.id, { dlNo: e.target.value.toUpperCase(), error: '' })} style={{ fontFamily: 'Inter, sans-serif' }} />
          <button type="button" className="ix-btn sm primary" disabled={anyBusy || !f.truckNo} onClick={() => assign(job)}>
            {busyId === job.id ? 'Saving…' : 'Assign'}
          </button>
        </div>
        {f.error && <div className="ix-error" style={{ margin: '0 16px 10px' }}><Icon name="alert-triangle" /> {f.error}</div>}
      </div>
    )
  }

  const searchBox = (
    <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search truck, job or client" aria-label="Search trucks"
      style={{ height: 30, border: '1px solid var(--line)', borderRadius: 8, padding: '0 10px', font: '13px Inter, sans-serif', background: '#fff', color: 'var(--text)', width: 240, maxWidth: '100%' }} />
  )

  return (
    <div className="ix-page">
      <div className="ix-page-head">
        <div>
          <h1>Trucks</h1>
          <p>Every truck moving JDS cargo, from FASTag toll crossings</p>
        </div>
        <div className="right">
          {searchBox}
          <button type="button" className="ix-btn sm ghost" onClick={refresh} disabled={loading}><Icon name="refresh" />{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      {error && (
        <div className="ix-error">
          Could not load the latest data — {error}.{' '}
          <button type="button" className="ix-btn sm" onClick={refresh} style={{ marginLeft: 8 }}>Refresh</button>
        </div>
      )}

      {loading && !data ? (
        <div className="ix-card"><div className="ix-empty">Loading…</div></div>
      ) : error ? null : (
        <>
          <div className="ix-card" style={{ marginBottom: 16 }}>
            <TruckMap trucks={onRoad.map((r) => ({ job: r.job, points: truckPoints(r.job, r.j, resultsFor(r.job.id)) }))} selectedId={sel?.job.id || null} onSelect={setSelectedId} />
            <div className="ix-card-head">
              <Icon name="truck" style={{ color: 'var(--navy)' }} />
              <h2>On the road</h2><span className="ix-chip grey">{lists.road.length}</span>
              <span className="sub hide-m">Each check asks FASTag. Check when you need to know.</span>
            </div>
            {lists.road.length === 0 && <div className="ix-empty">{search ? 'No truck on the road matches your search.' : 'No trucks on the road right now.'}</div>}
            {lists.road.map(renderRoad)}
          </div>

          <div className="ix-card" style={{ marginBottom: 16 }}>
            <div className="ix-card-head">
              <Icon name="circle-check" style={{ color: 'var(--green)' }} />
              <h2>Ready for a truck</h2><span className="ix-chip grey">{lists.ready.length}</span>
              <span className="sub">OOC granted, no truck yet</span>
            </div>
            {lists.ready.length === 0 && <div className="ix-empty">{search ? 'No waiting job matches your search.' : 'No jobs waiting for a truck.'}</div>}
            {lists.ready.map(renderReady)}
          </div>

          <div className="ix-card">
            <div className="ix-card-head">
              <Icon name="package" style={{ color: 'var(--muted)' }} />
              <h2>Export carting</h2><span className="ix-chip grey">{lists.carting.length}</span>
              <span className="sub">Export cargo going to the port</span>
            </div>
            {lists.carting.length === 0 && <div className="ix-empty">No export jobs waiting for cargo to reach the port.</div>}
            {lists.carting.map((r) => (r.job.truck_no ? renderRoad(r) : renderReady(r)))}
          </div>

          <div className="ix-page-head" style={{ marginTop: 24 }}>
            <div><h1 style={{ fontSize: 17 }}>Truck & driver checks</h1><p>Pick a job to see every truck check: FASTag, papers, driver licence, e-challan, e-way bill</p></div>
          </div>
          <div className="ix-split">
            <JobPicker
              title="Find a job or truck"
              rows={allRows.filter((r) => !isDelivered(r.job))}
              selectedId={checkId}
              onSelect={setCheckId}
              placeholder="Job no, client, truck no…"
              lists={[
                { title: 'On the road', icon: 'truck', color: 'var(--navy)', rows: lists.road, empty: 'No trucks on the road.', sub: ({ job }) => `Truck ${job.truck_no}` },
                { title: 'Ready for a truck', icon: 'circle-check', color: 'var(--green)', rows: lists.ready, empty: 'No jobs waiting for a truck.', sub: () => 'OOC granted, no truck yet' },
              ]}
            />
            {checkId
              ? <TruckWorkspace jobId={checkId} onOpenJob={onOpenJob} groups={TRUCK_GROUPS} />
              : <NoJobChosen text="Pick a job on the left. Each check asks the government system only when you press its button." />}
          </div>
        </>
      )}
    </div>
  )
}
