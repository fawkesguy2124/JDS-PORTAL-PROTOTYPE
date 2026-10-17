import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadJourneyData, journeyFor, isDelivered, isExportJob } from '../../services/journey'
import { assignTruck, setStage } from '../../services/jobActions'
import { runUlipCheck, loadJobResults } from '../../services/ulip/ulipClient'

const NAVY = '#1a4fa0'
const card = { background: '#fff', border: '1.5px solid #e2e6ed', borderRadius: '14px', padding: '14px 16px' }
const mono = { fontFamily: "'JetBrains Mono', monospace" }
const input = { height: '42px', padding: '0 12px', border: '1.5px solid #d5dbe6', borderRadius: '10px', fontSize: '14px', width: '100%', boxSizing: 'border-box', background: '#fff', color: '#1a2233', ...mono }
const label = { fontSize: '12px', fontWeight: 600, color: '#5b6678', marginBottom: '4px', display: 'block' }
const btn = (disabled, primary) => ({
  minHeight: '42px', padding: '0 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
  border: primary ? 'none' : `1.5px solid ${NAVY}`, background: primary ? NAVY : '#fff', color: primary ? '#fff' : NAVY,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: 'inherit',
})
const BLOCK_WORDS = ['many checks', 'login', 'busy', 'limits']
const PAUSE_MS = 3000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fmtTime = (v) => {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d) ? String(v) : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
const fmtDay = (v) => {
  if (!v) return '—'
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v)
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
function ago(iso) {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`
  return `${Math.round(h / 24)} days ago`
}

export default function TrucksPage({ currentUserName, onOpenJob, showToast, canUpdateStage }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('q') || '' } catch { return '' }
  })
  const [loadError, setLoadError] = useState('')
  const mounted = useRef(true)
  const [busy, setBusy] = useState(null) // { jobId, text } while ONE action runs
  const [forms, setForms] = useState({}) // jobId -> { truckNo, dlNo, error }
  const [outcome, setOutcome] = useState({}) // jobId -> { lines:[{tone,text}] }
  const running = useRef(false)

  const reload = useCallback(async () => {
    try {
      const d = await loadJourneyData()
      if (!mounted.current) return
      setData(d)
      setLoadError(d?.error || '')
    } catch (e) {
      if (mounted.current) setLoadError(e?.message || 'Something went wrong')
    }
    if (mounted.current) setLoading(false)
  }, [])

  useEffect(() => {
    mounted.current = true
    async function load() {
      try {
        const d = await loadJourneyData()
        if (!mounted.current) return
        setData(d)
        setLoadError(d?.error || '')
      } catch (e) {
        if (mounted.current) setLoadError(e?.message || 'Something went wrong')
      }
      if (mounted.current) setLoading(false)
    }
    load()
    return () => { mounted.current = false }
  }, [])

  const rows = useMemo(() => {
    if (!data) return { ready: [], road: [], carting: [] }
    const q = search.trim().toLowerCase()
    const match = (j) => !q || [j.truck_no, j.job_no, j.client].some((v) => String(v || '').toLowerCase().includes(q))
    const ready = []
    const road = []
    const carting = []
    for (const job of data.jobs) {
      if (isDelivered(job) || !match(job)) continue
      const jf = journeyFor(job, data)
      if (isExportJob(job)) carting.push({ job, jf })
      else if (job.truck_no) road.push({ job, jf })
      else if (jf.readyForTruck) ready.push({ job, jf })
    }
    return { ready, road, carting }
  }, [data, search])

  const refreshJobResults = async (jobId) => {
    const saved = await loadJobResults(jobId)
    setData((prev) => prev && { ...prev, resultsByJob: { ...prev.resultsByJob, [jobId]: saved } })
  }

  // Run one action at a time for the whole page
  const guarded = async (jobId, text, fn) => {
    if (running.current) return
    running.current = true
    setBusy({ jobId, text })
    try { await fn() } finally { running.current = false; setBusy(null) }
  }

  const setForm = (jobId, patch) => setForms((p) => ({ ...p, [jobId]: { ...p[jobId], ...patch } }))

  const assign = (job) => guarded(job.id, 'Saving…', async () => {
    const f = forms[job.id] || {}
    const res = await assignTruck(job, { truckNo: f.truckNo, dlNo: f.dlNo }, currentUserName)
    if (!res.ok) {
      if (!f.dlNo && /licence/i.test(res.error || '')) { showToast?.(`Truck assigned to ${job.job_no}`, 'success'); setForms((p) => ({ ...p, [job.id]: undefined })); await reload(); return }
      setForm(job.id, { error: res.error }); return
    }
    showToast?.(`Truck assigned to ${job.job_no}`, 'success')
    setForms((p) => ({ ...p, [job.id]: undefined }))
    await reload()
  })

  const whereNow = (job) => guarded(job.id, 'Checking…', async () => {
    const res = await runUlipCheck({ api: 'FASTAG/01', params: { vehiclenumber: job.truck_no }, jobId: job.id })
    const parsed = res.data?.parsed
    setOutcome((p) => ({ ...p, [job.id]: { lines: [res.ok && parsed
      ? { tone: parsed.tone, text: parsed.summary }
      : { tone: 'bad', text: res.error || 'The check failed. Please try again.' }] } }))
    await refreshJobResults(job.id)
  })

  const checkPapers = (job) => guarded(job.id, 'Checking truck papers…', async () => {
    const dl = job.ulip_refs?.dl_no
    const steps = [
      { name: 'Truck papers', api: 'VAHAN/04', params: { vehiclenumber: job.truck_no } },
      { name: 'Challans (fines)', api: 'ECHALLAN/01', params: { vehicleNumber: job.truck_no } },
      ...(dl ? [{ name: 'Driver licence', api: 'SARATHI/02', params: { dlnumber: dl } }] : []),
    ]
    const lines = []
    setOutcome((p) => ({ ...p, [job.id]: { lines: [] } }))
    for (let i = 0; i < steps.length; i++) {
      if (i > 0) await sleep(PAUSE_MS)
      if (!mounted.current) return
      setBusy({ jobId: job.id, text: `Checking truck papers… ${i + 1} of ${steps.length}` })
      const s = steps[i]
      const res = await runUlipCheck({ api: s.api, params: s.params, jobId: job.id })
      if (!mounted.current) return
      const parsed = res.data?.parsed
      if (res.ok && parsed) lines.push({ tone: parsed.found === false ? 'warn' : parsed.tone, text: `${s.name}: ${parsed.summary}` })
      else lines.push({ tone: 'bad', text: `${s.name}: ${res.error || 'The check failed.'}` })
      setOutcome((p) => ({ ...p, [job.id]: { lines: [...lines] } }))
      const err = String(res.error || '').toLowerCase()
      if (!res.ok && BLOCK_WORDS.some((w) => err.includes(w))) {
        lines.push({ tone: 'warn', text: 'Stopped. The government system is busy. Please try again after a while.' })
        setOutcome((p) => ({ ...p, [job.id]: { lines: [...lines] } }))
        break
      }
    }
    if (mounted.current) await refreshJobResults(job.id)
  })

  const deliver = (job) => {
    if (!window.confirm(`Mark job ${job.job_no} as delivered?`)) return
    return guarded(job.id, 'Saving…', async () => {
      const res = await setStage(job, 10, 'Delivered', currentUserName)
      if (!res.ok) { showToast?.(res.error, 'error'); return }
      showToast?.(`${job.job_no} marked delivered`, 'success')
      await reload()
    })
  }

  const anyBusy = !!busy

  const renderReady = ({ job, jf }) => {
              const f = forms[job.id] || {}
              const mine = busy?.jobId === job.id
              return (
                <div key={job.id} style={card}>
                  <JobHead job={job} onOpenJob={onOpenJob} />
                  <div style={{ fontSize: '13px', color: '#5b6678', marginTop: '6px', lineHeight: 1.6 }}>
                    OOC granted {fmtDay(jf.oocDate)}
                    {jf.containers?.nos?.length > 0 && <> · <span style={mono}>{jf.containers.nos.join(', ')}</span></>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                      <span style={label}>Truck number</span>
                      <input value={f.truckNo || ''} placeholder="MH04AB1234" disabled={anyBusy}
                        onChange={(e) => setForm(job.id, { truckNo: e.target.value.toUpperCase(), error: '' })} style={input} />
                    </div>
                    <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                      <span style={label}>Driver licence number (optional)</span>
                      <input value={f.dlNo || ''} disabled={anyBusy}
                        onChange={(e) => setForm(job.id, { dlNo: e.target.value.toUpperCase(), error: '' })} style={input} />
                    </div>
                    <button type="button" style={btn(anyBusy || !f.truckNo, true)} disabled={anyBusy || !f.truckNo} onClick={() => assign(job)}>
                      {mine ? 'Saving…' : 'Assign truck'}
                    </button>
                  </div>
                  {f.error && <div style={{ color: '#991b1b', marginTop: '8px', fontSize: '13px' }}>⚠ {f.error}</div>}
                </div>
              )
  }

  const renderRoad = ({ job, jf }) => {
              const mine = busy?.jobId === job.id
              const loc = jf.truckLocation
              const pap = jf.truckPapers
              const out = outcome[job.id]
              return (
                <div key={job.id} style={card}>
                  <div style={{ ...mono, fontSize: '22px', fontWeight: 700, color: NAVY, letterSpacing: '0.5px' }}>{job.truck_no}</div>
                  <JobHead job={job} onOpenJob={onOpenJob} />
                  <div style={{ marginTop: '10px', lineHeight: 1.6 }}>
                    <div>
                      📍 {loc
                        ? <>Last crossed <b>{loc.plaza}</b>{loc.at ? ` at ${fmtTime(loc.at)}` : ''} <span style={{ color: '#8a96a8', fontSize: '12px' }}>(checked {ago(loc.checkedAt)})</span></>
                        : <span style={{ color: '#5b6678' }}>Location not checked yet</span>}
                    </div>
                    <div>
                      {pap
                        ? <>{pap.found === false ? '⚠️' : pap.tone === 'bad' ? '❌' : '✅'} Papers: {pap.found === false ? 'Could not check' : pap.summary} <span style={{ color: '#8a96a8', fontSize: '12px' }}>(checked {ago(pap.checkedAt)})</span></>
                        : <span style={{ color: '#5b6678' }}>Papers not checked yet</span>}
                    </div>
                  </div>
                  {out && out.lines.length > 0 && (
                    <div style={{ marginTop: '10px', background: '#f4f6f9', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {out.lines.map((l, i) => <div key={i}>{l.tone === 'bad' ? '❌' : l.tone === 'warn' ? '⚠️' : '✅'} {l.text}</div>)}
                    </div>
                  )}
                  {mine && <div style={{ marginTop: '10px', color: '#5b6678', fontSize: '13px' }}>{busy.text} Government systems can take up to a minute.</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                    <button type="button" style={btn(anyBusy, true)} disabled={anyBusy} onClick={() => whereNow(job)}>
                      {mine && busy.text === 'Checking…' ? 'Checking…' : 'Where is it now?'}
                    </button>
                    <button type="button" style={btn(anyBusy)} disabled={anyBusy} onClick={() => checkPapers(job)}>
                      {mine && busy.text.startsWith('Checking truck') ? busy.text : 'Check papers'}
                    </button>
                    {canUpdateStage && (
                      <button type="button" style={btn(anyBusy)} disabled={anyBusy} onClick={() => deliver(job)}>
                        Mark delivered
                      </button>
                    )}
                  </div>
                </div>
              )
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '16px', fontSize: '14px', color: '#1a2233' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 12px' }}>Trucks</h1>
      <input
        type="search" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by truck number, job number or client"
        style={{ ...input, fontFamily: 'inherit', marginBottom: '18px' }}
      />

      {loadError && (
        <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#991b1b', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px' }}>
          Could not load the latest data — {loadError}. Press Refresh.
          <div style={{ marginTop: '8px' }}><button type="button" style={btn(anyBusy)} disabled={anyBusy} onClick={reload}>Refresh</button></div>
        </div>
      )}

      {loading && <div style={{ color: '#5b6678' }}>Loading trucks…</div>}

      {!loading && !loadError && (
        <>
          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 10px' }}>Ready for a truck ({rows.ready.length})</h2>
          {rows.ready.length === 0 && <div style={{ ...card, color: '#5b6678' }}>No jobs waiting for a truck 🎉</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rows.ready.map(renderReady)}
          </div>

          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '26px 0 10px' }}>Trucks on the road ({rows.road.length})</h2>
          {rows.road.length === 0 && <div style={{ ...card, color: '#5b6678' }}>No trucks on the road right now.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rows.road.map(renderRoad)}
          </div>

          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '26px 0 10px' }}>Export carting ({rows.carting.length})</h2>
          {rows.carting.length === 0 && <div style={{ ...card, color: '#5b6678' }}>No export jobs waiting for cargo to reach the port.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rows.carting.map((r) => (r.job.truck_no ? renderRoad(r) : renderReady(r)))}
          </div>
        </>
      )}
    </div>
  )
}

function JobHead({ job, onOpenJob }) {
  return (
    <button type="button" onClick={() => onOpenJob?.(job.id, isExportJob(job) ? 'export' : 'details')}
      style={{ all: 'unset', cursor: 'pointer', display: 'block', marginTop: '4px', color: '#1a2233', maxWidth: '100%' }}>
      <span style={{ ...mono, fontWeight: 700, color: NAVY }}>{job.job_no}</span>
      <span style={{ color: '#5b6678' }}> · {job.client || 'No client'}</span>
    </button>
  )
}
