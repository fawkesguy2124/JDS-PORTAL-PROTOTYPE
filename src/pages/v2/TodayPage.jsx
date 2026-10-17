import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { loadJourneyData, journeyFor, attentionList, isDelivered } from '../../services/journey'

const FONT = "'Inter', system-ui, sans-serif"
const MONO = "'JetBrains Mono', monospace"
const LEVELS = [
  { id: 'red', title: 'Act today', color: '#d93025' },
  { id: 'amber', title: 'Soon', color: '#e8a100' },
  { id: 'info', title: 'Worth a look', color: '#1a4fa0' },
]
const GOV_TYPES = ['ooc_granted', 'be_filed', 'sb_filed', 'truck_dispatched', 'stage_update']

const card = { background: '#fff', border: '1.5px solid #e2e6ed', borderRadius: 14 }

function timeAgo(iso) {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (isNaN(mins)) return ''
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

function sentence(row) {
  const job = row.job_no ? `Job ${row.job_no}` : 'A job'
  const t = row.title || row.note || ''
  if (t) return row.job_no && t.includes(String(row.job_no)) ? t : `${job}: ${t}`
  return `${job}: ${String(row.type || '').replace(/_/g, ' ')}`
}

export default function TodayPage({ onOpenJob }) {
  const [data, setData] = useState(null)
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [filter, setFilter] = useState(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const [d, logRes] = await Promise.all([
        loadJourneyData(),
        supabase.from('activity_log').select('*').in('type', GOV_TYPES)
          .order('created_at', { ascending: false }).limit(10),
      ])
      if (cancelled) return
      setData(d)
      setLog(logRes.data || [])
      setLoading(false)
    }
    run().catch((e) => { console.warn('[today] load failed:', e?.message); if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reloadKey])

  const refresh = () => { setLoading(true); setReloadKey((k) => k + 1) }

  const { tiles, jobSets } = useMemo(() => {
    const sets = { active: new Set(), ooc: new Set(), nottruck: new Set(), truck: new Set(), free: new Set() }
    if (data) {
      for (const job of data.jobs) {
        if (isDelivered(job)) continue
        const j = journeyFor(job, data)
        if (j.phase === 'delivered') continue
        sets.active.add(job.id)
        if (j.phase === 'ooc') sets.ooc.add(job.id)
        if (j.oocDate && !j.truck) sets.nottruck.add(job.id)
        if (j.phase === 'truck') sets.truck.add(job.id)
        if (j.freeDaysLeft !== null && j.freeDaysLeft !== undefined && j.freeDaysLeft <= 2) sets.free.add(job.id)
      }
    }
    return {
      jobSets: sets,
      tiles: [
        { id: 'active', label: 'Active jobs', n: sets.active.size, color: '#1a4fa0' },
        { id: 'ooc', label: 'Waiting for OOC', n: sets.ooc.size, color: '#1a4fa0' },
        { id: 'nottruck', label: 'OOC granted, no truck', n: sets.nottruck.size, color: '#b57800' },
        { id: 'truck', label: 'Trucks on the road', n: sets.truck.size, color: '#1a4fa0' },
        { id: 'free', label: 'Free days ≤ 2', n: sets.free.size, color: '#d93025' },
      ],
    }
  }, [data])

  const items = useMemo(() => {
    if (!data) return []
    const all = attentionList(data)
    return filter ? all.filter((i) => jobSets[filter].has(i.jobId)) : all
  }, [data, filter, jobSets])

  const open = (item) => onOpenJob?.(item.jobId, item.action === 'containers' ? 'details' : item.action)
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const activeTile = tiles.find((t) => t.id === filter)

  return (
    <div style={{ fontFamily: FONT, color: '#1a2233', fontSize: 14, background: '#f4f6f9', padding: 16, maxWidth: 960, margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 14 }}>{today}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
        {tiles.map((t) => {
          const on = filter === t.id
          return (
            <button key={t.id} onClick={() => setFilter(on ? null : t.id)} aria-pressed={on}
              style={{ ...card, padding: '12px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: FONT, minHeight: 40,
                borderColor: on ? t.color : '#e2e6ed', boxShadow: on ? `0 0 0 2px ${t.color}33` : 'none' }}>
              <div style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: t.color, lineHeight: 1.1 }}>
                {loading && !data ? '–' : t.n}
              </div>
              <div style={{ fontSize: 13, color: '#5b6678', marginTop: 4 }}>{t.label}</div>
            </button>
          )
        })}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
        Needs attention{activeTile ? ` — ${activeTile.label}` : ''}
        {filter && <button onClick={() => setFilter(null)} style={{ marginLeft: 10, border: 'none', background: 'none', color: '#1a4fa0', cursor: 'pointer', fontSize: 13, fontFamily: FONT, minHeight: 40 }}>Show all</button>}
      </h2>

      {loading && !data ? (
        <div style={{ ...card, padding: 16, color: '#5b6678' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ ...card, padding: 16, color: '#5b6678' }}>
          {filter ? 'Nothing needs action for these jobs 🎉' : 'All clear — nothing needs action right now ✅'}
        </div>
      ) : (
        LEVELS.map((lv) => {
          const rows = items.filter((i) => i.level === lv.id)
          if (!rows.length) return null
          return (
            <div key={lv.id} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: lv.color, margin: '0 0 6px' }}>{lv.title} ({rows.length})</div>
              <div style={{ ...card, overflow: 'hidden' }}>
                {rows.map((it, idx) => (
                  <div key={`${it.jobId}-${idx}`} onClick={() => open(it)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', borderTop: idx ? '1px solid #eef0f4' : 'none', flexWrap: 'wrap' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: lv.color, flexShrink: 0 }} />
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>
                        <span style={{ fontFamily: MONO }}>{it.jobNo}</span>
                        {it.client ? <span style={{ color: '#5b6678', fontWeight: 500 }}> · {it.client}</span> : null}
                      </div>
                      <div style={{ color: '#1a2233', marginTop: 2 }}>{it.text}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); open(it) }}
                      style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1.5px solid #1a4fa0', background: '#fff', color: '#1a4fa0', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: FONT }}>
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '22px 0 8px' }}>Latest government updates</h2>
      <div style={{ ...card, overflow: 'hidden' }}>
        {log.length === 0 ? (
          <div style={{ padding: 16, color: '#5b6678' }}>No updates yet.</div>
        ) : log.map((r, idx) => (
          <div key={r.id ?? idx} onClick={() => r.job_id && onOpenJob?.(r.job_id)}
            style={{ padding: '10px 12px', borderTop: idx ? '1px solid #eef0f4' : 'none', cursor: r.job_id ? 'pointer' : 'default' }}>
            <div>{sentence(r)}</div>
            <div style={{ fontSize: 12, color: '#8a96a8', marginTop: 2 }}>
              {timeAgo(r.created_at)}{r.done_by_name ? ` · ${r.done_by_name}` : ''}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: '#8a96a8' }}>
        Updated {data ? new Date(data.loadedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—'} ·{' '}
        <button onClick={refresh} disabled={loading}
          style={{ border: 'none', background: 'none', color: '#1a4fa0', cursor: loading ? 'default' : 'pointer', fontSize: 13, fontFamily: FONT, minHeight: 40, padding: 0 }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}
