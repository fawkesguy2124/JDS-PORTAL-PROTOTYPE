import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { attentionList, PHASES } from '../../services/journey'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import { Icon, Skeleton, timeAgo } from '../ui'

const GOV_TYPES = ['ooc_granted', 'be_filed', 'sb_filed', 'truck_dispatched', 'stage_update', 'note']
const LEVELS = [
  { id: 'red', title: 'Act today' },
  { id: 'amber', title: 'Soon' },
  { id: 'info', title: 'Worth a look' },
]
const PHASE_ICON = { arrival: 'ship', docs: 'file-text', ooc: 'hourglass', release: 'circle-check', truck: 'truck', delivered: 'flag' }
const FEED_ICON = {
  ooc_granted: ['circle-check', 'var(--green-bg)', 'var(--green)'],
  be_filed: ['file-certificate', '#fdf4ff', '#86198f'],
  sb_filed: ['file-certificate', '#fdf4ff', '#86198f'],
  truck_dispatched: ['truck', '#fff7ed', '#9a3412'],
  stage_update: ['arrow-big-right-lines', 'var(--navy-50)', 'var(--navy)'],
  note: ['message-circle', 'var(--grey-bg)', 'var(--text-2)'],
}

function feedText(row) {
  const t = row.title || row.note || String(row.type || row.action || '').replace(/_/g, ' ')
  return row.job_no && !t.includes(String(row.job_no)) ? `${row.job_no}: ${t}` : t
}
const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function TodayPage({ onOpenJob, currentUserName, onGo }) {
  const { data, active, loading, error, refresh } = useJourney()
  useFreshOnOpen() // opening the page shows the latest saved data
  const [log, setLog] = useState([])
  const [showAllInfo, setShowAllInfo] = useState(false)

  useEffect(() => {
    let cancelled = false
    // today's updates only (from midnight India time; Jose, 22 Oct 2026)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    supabase.from('activity_log').select('*')
      .or(`type.in.(${GOV_TYPES.join(',')}),action.eq.stage_update`)
      .gte('created_at', new Date(`${today}T00:00:00+05:30`).toISOString())
      .order('created_at', { ascending: false }).limit(25)
      .then(({ data: rows }) => { if (!cancelled) setLog(rows || []) })
    return () => { cancelled = true }
  }, [data])

  const sets = useMemo(() => {
    const s = { active: new Set(), ooc: new Set(), nottruck: new Set(), truck: new Set(), free: new Set() }
    for (const { job, j } of active) {
      s.active.add(job.id)
      if (j.phase === 'ooc') s.ooc.add(job.id)
      if (j.readyForTruck) s.nottruck.add(job.id)
      if (j.phase === 'truck') s.truck.add(job.id)
      if (j.freeDaysLeft !== null && j.freeDaysLeft <= 2) s.free.add(job.id)
    }
    return s
  }, [active])

  const oocWaitDays = useMemo(() => {
    const now = data ? new Date(data.loadedAt).getTime() : 0
    const ds = active.filter(({ j }) => j.phase === 'ooc').map(({ job }) => job.be_date ? (now - new Date(job.be_date).getTime()) / 86400000 : null).filter((d) => d !== null)
    return ds.length ? (ds.reduce((a, b) => a + b, 0) / ds.length).toFixed(1) : null
  }, [active, data])

  const items = useMemo(() => (data ? attentionList(data) : []), [data])

  const counts = useMemo(() => Object.fromEntries(PHASES.map((p) => [p.id, active.filter(({ j }) => j.phase === p.id).length])), [active])
  const maxCount = Math.max(1, ...Object.values(counts))
  const dash = loading && !data

  const kpis = [
    // view: the Jobs list view that shows exactly these jobs
    { id: 'active', view: 'open', icon: 'package', label: 'Active jobs', value: sets.active.size, trend: `${active.filter(({ job }) => job.job_type === 'export').length} exports · ${active.filter(({ job }) => job.mode === 'Air').length} air` },
    { id: 'ooc', view: 'ooc', icon: 'hourglass', label: 'Waiting for OOC', value: sets.ooc.size, trend: oocWaitDays ? `avg ${oocWaitDays} days since BE` : 'none waiting' },
    { id: 'nottruck', view: 'truck', icon: 'truck', label: 'OOC, move not arranged', value: sets.nottruck.size, trend: sets.nottruck.size ? 'arrange truck or rail' : 'all arranged', bad: sets.nottruck.size > 0 },
    { id: 'truck', view: 'onroad', icon: 'road', label: 'Trucks on the road', value: sets.truck.size, trend: 'from FASTag and stages' },
    { id: 'free', view: 'detention', icon: 'clock-exclamation', label: 'Free days ≤ 2', value: sets.free.size, trend: sets.free.size ? 'detention risk' : 'no risk today', bad: sets.free.size > 0, red: true },
  ]
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const openItem = (it) => {
    let tab = it.action
    if (tab === 'containers') tab = 'containers'
    onOpenJob?.(it.jobId, tab === 'truck' ? 'truck' : tab === 'details' ? 'overview' : tab)
  }
  const openView = (view) => {
    try { localStorage.setItem('ix_jobs_view', view) } catch { /* private mode: the list opens on its last view */ }
    onGo?.('jobs')
  }

  return (
    <div className="ix-page">
      <div className="ix-page-head">
        <div>
          <h1>{greeting()}{currentUserName && currentUserName !== '—' ? `, ${currentUserName}` : ''}</h1>
          <p>{today} · {sets.active.size} active shipments · updated {data ? timeAgo(data.loadedAt) : '—'}</p>
        </div>
        <div className="right">
          <button type="button" className="ix-btn" onClick={refresh} disabled={loading}><Icon name="refresh" />{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      {error && <div className="ix-error">Could not load the latest data — {error}. Press Refresh.</div>}

      <div className="ix-kpis">
        {kpis.map((k) => (
          <button key={k.id} type="button" className="ix-card ix-kpi" onClick={() => openView(k.view)} title={`Open these ${k.value} jobs in the Jobs list`}>
            <div className="label"><Icon name={k.icon} />{k.label}</div>
            <div className="value" style={k.red && k.value ? { color: 'var(--red)' } : undefined}>{dash ? '–' : k.value}</div>
            <div className={`trend ${k.bad ? 'bad' : ''}`}>{dash ? ' ' : k.trend}</div>
          </button>
        ))}
      </div>

      <div className="ix-grid-2">
        <div className="ix-card">
          <div className="ix-card-head">
            <Icon name="alert-triangle" style={{ color: 'var(--amber)' }} />
            <h2>Needs action</h2>
            <span className="sub">{items.filter((i) => i.level !== 'info').length} items</span>
            <div className="right">
              <button type="button" className="ix-btn sm ghost" onClick={() => openView('action')}>See in jobs <Icon name="arrow-right" /></button>
            </div>
          </div>
          {dash ? <Skeleton rows={5} />
            : items.length === 0 ? <div className="ix-empty">All clear — nothing needs action right now.</div>
            : LEVELS.map((lv) => {
              const all = items.filter((i) => i.level === lv.id)
              if (!all.length) return null
              const folded = lv.id === 'info' && !showAllInfo && all.length > 5
              const rows = folded ? all.slice(0, 5) : all
              return (
                <div key={lv.id}>
                  <div className="ix-att-group">{lv.title} · {all.length}</div>
                  {rows.map((it, idx) => (
                    <div key={`${it.jobId}-${idx}`} className="ix-att-row" onClick={() => openItem(it)}>
                      <span className={`ix-dot ${lv.id}`} />
                      <div className="what">
                        <b>{it.jobNo}</b>{it.client ? <span className="client"> · {it.client}</span> : null}
                        <div className="txt">{it.text}</div>
                      </div>
                      <button type="button" className="ix-btn sm" onClick={(e) => { e.stopPropagation(); openItem(it) }}>Open</button>
                    </div>
                  ))}
                  {folded && <button type="button" className="ix-more" onClick={() => setShowAllInfo(true)}>Show all {all.length}</button>}
                </div>
              )
            })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ix-card">
            <div className="ix-card-head"><Icon name="chart-funnel" style={{ color: 'var(--navy)' }} /><h2>Pipeline</h2><span className="sub">import jobs by stage</span></div>
            <div style={{ padding: '8px 0' }}>
              {PHASES.map((p) => (
                <button key={p.id} type="button" className="ix-funnel-row" onClick={() => onGo?.('board')} title={p.hint}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><Icon name={PHASE_ICON[p.id]} style={{ color: 'var(--muted)' }} />{p.label}</span>
                  <div className="ix-funnel-bar"><span style={{ width: `${(counts[p.id] / maxCount) * 100}%` }} /></div>
                  <b className="num" style={{ textAlign: 'right' }}>{dash ? '–' : counts[p.id]}</b>
                </button>
              ))}
            </div>
          </div>

          <div className="ix-card">
            <div className="ix-card-head"><Icon name="activity" style={{ color: 'var(--navy)' }} /><h2>Latest updates</h2></div>
            {log.length === 0 ? <div className="ix-empty">No updates yet today.</div> : log.map((r, i) => {
              const [ic, bg, fg] = FEED_ICON[r.type] || FEED_ICON[r.action] || ['point', 'var(--grey-bg)', 'var(--text-2)']
              return (
                <div key={r.id ?? i} className={`ix-feed-row ${r.job_id ? 'click' : ''}`} onClick={() => r.job_id && onOpenJob?.(r.job_id)}>
                  <div className="ix-feed-ico" style={{ background: bg, color: fg }}><Icon name={ic} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{feedText(r)}</div>
                    <div className="m">{timeAgo(r.created_at)}{r.done_by_name ? ` · ${r.done_by_name}` : ''}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
