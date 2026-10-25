import { useMemo, useState } from 'react'
import { parseContainerNos } from '../../utils/jobHelpers'
import { isDelivered, truckNos } from '../../services/journey'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import { FreeDays, Icon, Owner, PhaseChip, Skeleton, jobOwnerName, timeAgo, worst } from '../ui'

const num = (job) => parseInt(String(job.job_no || '').replace(/\D/g, ''), 10) || 0

// Saved views across the top. Each is a plain filter on the job + its journey.
const VIEWS = [
  { id: 'action', label: 'Needs action', test: ({ j }) => j.attention.some((a) => a.level !== 'info') },
  { id: 'mine', label: 'My jobs', test: ({ job }, me) => !!me && job.assigned_to === me },
  { id: 'ooc', label: 'Waiting OOC', test: ({ j }) => j.phase === 'ooc' },
  { id: 'truck', label: 'Needs truck / rail', test: ({ j }) => j.readyForTruck },
  { id: 'onroad', label: 'On the road', test: ({ j }) => j.phase === 'truck' },
  { id: 'detention', label: 'Detention risk', test: ({ job, j }) => !isDelivered(job) && j.phase !== 'delivered' && j.freeDaysLeft !== null && j.freeDaysLeft <= 2 },
  { id: 'open', label: 'All open', test: ({ job, j }) => !isDelivered(job) && j.phase !== 'delivered' },
  { id: 'all', label: 'Everything', test: () => true },
]
const SORTS = {
  job: (a, b) => num(a.job) - num(b.job),
  client: (a, b) => String(a.job.client || '').localeCompare(String(b.job.client || '')),
  free: (a, b) => (a.j.freeDaysLeft ?? 9999) - (b.j.freeDaysLeft ?? 9999),
  eta: (a, b) => String(a.job.eta || '9999').localeCompare(String(b.job.eta || '9999')),
  updated: (a, b) => new Date(a.job.updated_at || 0) - new Date(b.job.updated_at || 0),
}

export default function JobsPage({ profile, onOpenJob, onCreateJob, selectedId }) {
  const { rows, profiles, loading, error, refresh } = useJourney()
  useFreshOnOpen() // opening the page shows the latest saved data
  const [view, setView] = useState(() => { try { return localStorage.getItem('ix_jobs_view') || 'action' } catch { return 'action' } })
  const [sort, setSort] = useState({ key: null, dir: 1 })
  const [q, setQ] = useState('')
  const [mode, setMode] = useState('')
  const [type, setType] = useState('')
  const [owner, setOwner] = useState('')

  const me = profile?.id
  const pickView = (id) => { setView(id); try { localStorage.setItem('ix_jobs_view', id) } catch { /* private mode */ } }

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, rows.filter((r) => v.test(r, me)).length])), [rows, me])
  const owners = useMemo(() => [...new Set(rows.map((r) => r.job.assigned_to).filter(Boolean))].map((id) => [id, profiles[id] || 'Unknown']).sort((a, b) => a[1].localeCompare(b[1])), [rows, profiles])

  const list = useMemo(() => {
    const v = VIEWS.find((x) => x.id === view) || VIEWS[0]
    const needle = q.trim().toLowerCase().replace(/\s+/g, '')
    let out = rows.filter((r) => v.test(r, me))
      .filter(({ job }) => !mode || job.mode === mode)
      .filter(({ job }) => !type || (job.job_type || 'import') === type)
      .filter(({ job }) => !owner || job.assigned_to === owner)
      .filter(({ job }) => !needle || [job.job_no, job.client, job.be_no, job.bl_no, ...truckNos(job), job.vessel, job.ulip_refs?.igm_no, ...parseContainerNos(job.containers)]
        .filter(Boolean).some((x) => String(x).toLowerCase().replace(/\s+/g, '').includes(needle)))
    if (sort.key) out = [...out].sort((a, b) => SORTS[sort.key](a, b) * sort.dir)
    // default: newest job number first (Jose, 22 Oct 2026)
    else out = [...out].sort((a, b) => num(b.job) - num(a.job))
    return out
  }, [rows, view, me, q, mode, type, owner, sort])

  const th = (key, label, cls = '') => (
    <th className={`sort ${cls}`} onClick={() => setSort((s) => (s.key === key ? (s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }) : { key, dir: 1 }))}
      aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  )
  const filtered = mode || type || owner || q

  return (
    <div className="ix-page">
      <div className="ix-page-head">
        <div><h1>All jobs</h1><p>Click a row to see the job without leaving the list</p></div>
        <div className="right">
          <button type="button" className="ix-btn hide-m" onClick={refresh} disabled={loading}><Icon name="refresh" />{loading ? 'Refreshing…' : 'Refresh'}</button>
          <button type="button" className="ix-btn primary" onClick={onCreateJob}><Icon name="plus" />Create job</button>
        </div>
      </div>
      {error && <div className="ix-error">Could not load the latest data — {error}. Press Refresh.</div>}

      <div className="ix-card">
        <div className="ix-views">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className={`ix-view-tab ${view === v.id ? 'active' : ''}`} onClick={() => pickView(v.id)}>
              {v.label}<span className="n">{loading && !rows.length ? '–' : counts[v.id]}</span>
            </button>
          ))}
        </div>
        <div className="ix-toolbar">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter: job, client, BE, BL, container…" aria-label="Filter jobs" />
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Import or export">
            <option value="">Import + export</option><option value="import">Import</option><option value="export">Export</option>
          </select>
          <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode">
            <option value="">All modes</option>{['Sea FCL', 'Sea LCL', 'Air', 'BPT/MBPT'].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
            <option value="">Anyone</option>{owners.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
          {filtered && <button type="button" className="ix-btn sm ghost" onClick={() => { setQ(''); setMode(''); setType(''); setOwner('') }}>Clear</button>}
          <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 }}>{list.length} jobs</span>
        </div>
        <div className="ix-tbl-wrap">
          <table className="ix-table">
            <thead>
              <tr>
                {th('job', 'Job')}{th('client', 'Client', 'hide-m')}<th className="hide-m">Mode</th><th>Status</th><th className="hide-m">Next step</th>
                {th('free', 'Free days')}{th('eta', 'ETA', 'hide-m')}<th className="hide-m">BE</th><th className="hide-m">Owner</th>{th('updated', 'Updated', 'hide-m')}
              </tr>
            </thead>
            <tbody>
              {list.map(({ job, j }) => {
                const lvl = worst(j)
                const next = j.phase === 'delivered' ? 'Job finished' : j.attention[0]?.text || j.steps.find((s) => s.current)?.nextText || '—'
                return (
                  <tr key={job.id} className={selectedId === job.id ? 'sel' : ''} onClick={() => onOpenJob(job.id)}>
                    <td><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><span className={`ix-dot ${lvl}`} title={lvl === 'none' ? '' : 'Needs attention'} /><b className="mono">{job.job_no}</b></span><div className="ix-sub-m" title={job.client || ''}>{job.client || 'No client'}</div></td>
                    <td className="ix-cell-client hide-m" title={job.client || ''}>{job.client || '—'}</td>
                    <td className="hide-m">{job.mode || '—'}{job.job_type === 'export' ? ' · Exp' : ''}</td>
                    <td><PhaseChip job={job} j={j} /></td>
                    <td className="ix-cell-next hide-m" title={next}>{next}</td>
                    <td><FreeDays value={j.freeDaysLeft} /></td>
                    <td className="hide-m" style={{ color: 'var(--text-2)' }}>{job.eta ? new Date(`${job.eta}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</td>
                    <td className="hide-m mono" style={{ color: 'var(--text-2)' }}>{job.be_no || '—'}</td>
                    <td className="hide-m"><Owner name={jobOwnerName(job, profiles)} /></td>
                    <td className="hide-m" style={{ color: 'var(--muted)' }}>{timeAgo(job.updated_at)}</td>
                  </tr>
                )
              })}
              {!loading && list.length === 0 && (
                <tr><td colSpan={10} style={{ color: 'var(--muted)', cursor: 'default' }}>{filtered ? 'No jobs match these filters.' : 'No jobs in this view.'}</td></tr>
              )}
              {loading && !rows.length && <tr><td colSpan={10} style={{ padding: 0, cursor: 'default' }}><Skeleton rows={6} /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
