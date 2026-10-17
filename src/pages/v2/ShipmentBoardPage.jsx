import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadJourneyData, journeyFor, PHASES, EXPORT_PHASES, isExportJob } from '../../services/journey'

const C = { navy: '#1a4fa0', text: '#1a2233', muted: '#5b6678', faint: '#8a96a8', bg: '#f4f6f9', border: '#e2e6ed', red: '#d93025', amber: '#e08a00' }
const MONO = "'JetBrains Mono', ui-monospace, monospace"
const LEVEL_RANK = { red: 0, amber: 1, info: 2 }

function worstLevel(attention) {
  let best = null
  for (const a of attention || []) {
    if (a.level === 'info') continue
    if (best === null || LEVEL_RANK[a.level] < LEVEL_RANK[best]) best = a.level
  }
  return best
}

function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const on = () => setPhone(window.innerWidth < 768)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return phone
}

function Card({ item, onOpen }) {
  const { job, journey, level } = item
  const current = journey.steps.find((s) => s.current)
  const free = journey.freeDaysLeft
  const showFree = free !== null && free !== undefined && free <= 5
  const freeColor = free <= 2 ? C.red : C.amber
  const attnText = journey.attention.map((a) => `• ${a.text}`).join('\n')
  const containers = (journey.containers?.nos || []).length
  return (
    <button
      type="button"
      onClick={() => onOpen(job.id, 'details')}
      title={attnText || undefined}
      style={{ display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit', color: C.text, minHeight: 40 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 14 }}>{job.job_no}</span>
        {level && (
          <span title={attnText} aria-label="Needs attention" style={{ width: 10, height: 10, borderRadius: '50%', background: level === 'red' ? C.red : C.amber, flexShrink: 0 }} />
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted }}>{job.mode || ''}</span>
      </div>
      <div style={{ fontSize: 14, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.client || '—'}</div>
      {current && (
        <div style={{ fontSize: 13, color: C.navy, marginTop: 6, fontWeight: 600 }}>
          {current.label}
          {current.sub && <span style={{ color: C.muted, fontWeight: 400 }}> · {current.sub}</span>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
        {showFree && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: freeColor, borderRadius: 999, padding: '2px 8px' }}>
            {free <= 0 ? 'Free days over' : `${free} free day${free === 1 ? '' : 's'}`}
          </span>
        )}
        {containers > 0 && <span style={{ fontSize: 12, color: C.faint }}>{containers} container{containers === 1 ? '' : 's'}</span>}
      </div>
    </button>
  )
}

function Column({ phase, items, onOpen, fullWidth }) {
  return (
    <div style={{ flex: fullWidth ? '1 1 auto' : '0 0 260px', width: fullWidth ? '100%' : 260, background: '#eef1f6', borderRadius: 14, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'flex-start', maxHeight: fullWidth ? 'none' : '100%', minHeight: 0 }}>
      <div style={{ padding: '2px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{phase.label}</span>
          <span style={{ marginLeft: 'auto', background: C.navy, color: '#fff', borderRadius: 999, fontSize: 12, fontWeight: 700, padding: '1px 9px', fontFamily: MONO }}>{items.length}</span>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{phase.hint}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: fullWidth ? 'visible' : 'auto', minHeight: 0 }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: C.faint, padding: '12px 4px', textAlign: 'center' }}>No jobs here</div>
        ) : items.map((it) => <Card key={it.job.id} item={it} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

export default function ShipmentBoardPage({ onOpenJob, showToast }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const [kind, setKind] = useState('import')
  const [query, setQuery] = useState('')
  const [hideDelivered, setHideDelivered] = useState(true)
  const [phonePhase, setPhonePhase] = useState(null)
  const phone = useIsPhone()

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const d = await loadJourneyData()
        if (!cancelled) setData(d)
      } catch (e) {
        if (!cancelled) showToast?.(`Could not load shipments: ${e.message || e}`, 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [tick, showToast])

  const refresh = useCallback(() => { setLoading(true); setTick((t) => t + 1) }, [])

  const phases = kind === 'import' ? PHASES : EXPORT_PHASES

  const grouped = useMemo(() => {
    const out = Object.fromEntries(phases.map((p) => [p.id, []]))
    if (!data) return out
    const q = query.trim().toLowerCase()
    for (const job of data.jobs) {
      if (isExportJob(job) !== (kind === 'export')) continue
      if (q) {
        const hay = [job.job_no, job.client, job.containers, job.be_no].map((v) => (Array.isArray(v) ? v.join(' ') : String(v ?? ''))).join(' ').toLowerCase()
        if (!hay.includes(q)) continue
      }
      const journey = journeyFor(job, data)
      if (hideDelivered && journey.phase === 'delivered') continue
      if (!out[journey.phase]) continue
      out[journey.phase].push({ job, journey, level: worstLevel(journey.attention) })
    }
    for (const list of Object.values(out)) {
      list.sort((a, b) => {
        const la = a.level === null ? 3 : LEVEL_RANK[a.level]
        const lb = b.level === null ? 3 : LEVEL_RANK[b.level]
        return la - lb || String(b.job.job_no).localeCompare(String(a.job.job_no), undefined, { numeric: true })
      })
    }
    return out
  }, [data, kind, query, hideDelivered, phases])

  const visiblePhases = hideDelivered ? phases.filter((p) => p.id !== 'delivered') : phases
  const activePhaseId = visiblePhases.some((p) => p.id === phonePhase) ? phonePhase : visiblePhases[0]?.id
  const activePhase = visiblePhases.find((p) => p.id === activePhaseId)

  const tabBtn = (id, label) => (
    <button
      type="button"
      onClick={() => { setKind(id); setPhonePhase(null) }}
      style={{ minHeight: 40, padding: '0 18px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: `1.5px solid ${C.navy}`, background: kind === id ? C.navy : '#fff', color: kind === id ? '#fff' : C.navy, borderRadius: id === 'import' ? '10px 0 0 10px' : '0 10px 10px 0' }}
    >{label}</button>
  )

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, padding: phone ? 12 : 20, display: 'flex', flexDirection: 'column', gap: 12, height: phone ? 'auto' : 'calc(100vh - 80px)', minHeight: 400, boxSizing: 'border-box', maxWidth: '100%', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, marginRight: 8 }}>Shipment board</h1>
        <div style={{ display: 'flex' }}>{tabBtn('import', 'Imports')}{tabBtn('export', 'Exports')}</div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search job no, client, container, BE no"
          style={{ flex: '1 1 220px', minWidth: 0, minHeight: 40, padding: '0 12px', fontSize: 14, fontFamily: 'inherit', border: `1.5px solid ${C.border}`, borderRadius: 10, background: '#fff', color: C.text, boxSizing: 'border-box' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, cursor: 'pointer' }}>
          <input type="checkbox" checked={hideDelivered} onChange={(e) => setHideDelivered(e.target.checked)} style={{ width: 18, height: 18 }} />
          Hide delivered
        </label>
        <button type="button" onClick={refresh} disabled={loading} style={{ minHeight: 40, padding: '0 16px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${C.border}`, background: '#fff', color: C.navy, borderRadius: 10, cursor: loading ? 'default' : 'pointer' }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {loading && !data ? (
        <div style={{ color: C.muted, padding: 24, textAlign: 'center' }}>Loading shipments…</div>
      ) : phone ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <select
            value={activePhaseId || ''}
            onChange={(e) => setPhonePhase(e.target.value)}
            style={{ minHeight: 44, fontSize: 14, fontFamily: 'inherit', padding: '0 10px', border: `1.5px solid ${C.border}`, borderRadius: 10, background: '#fff', color: C.text, width: '100%' }}
          >
            {visiblePhases.map((p) => <option key={p.id} value={p.id}>{p.label} ({grouped[p.id].length})</option>)}
          </select>
          {activePhase && <Column phase={activePhase} items={grouped[activePhase.id]} onOpen={onOpenJob} fullWidth />}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 6 }}>
          {visiblePhases.map((p) => <Column key={p.id} phase={p} items={grouped[p.id]} onOpen={onOpenJob} />)}
        </div>
      )}
    </div>
  )
}
