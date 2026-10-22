import { useMemo, useState } from 'react'
import { PHASES, EXPORT_PHASES, isExportJob, truckNos } from '../../services/journey'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import { Icon, Chip, FreeDays, Owner, worst, jobOwnerName, Skeleton } from '../ui'

// Shipment board: one column per phase of the journey. Saved data only.

const PHASE_ICONS = {
  arrival: 'ship', docs: 'file-text', ooc: 'hourglass', release: 'circle-check', truck: 'truck', delivered: 'flag',
  sb: 'file-text', leo: 'hourglass', sail: 'circle-check',
}
const LEVEL_RANK = { red: 0, amber: 1, info: 2, none: 3 }
const DELIVERED_SHOWN = 20

const byJobNoDesc = (a, b) => String(b.job.job_no).localeCompare(String(a.job.job_no), undefined, { numeric: true })
const newestFirst = (a, b) => String(b.job.updated_at || '').localeCompare(String(a.job.updated_at || '')) || byJobNoDesc(a, b)

const searchInput = { height: 30, border: '1px solid var(--line)', borderRadius: 8, padding: '0 10px', font: '13px Inter, sans-serif', background: '#fff', color: 'var(--text)', width: 260, maxWidth: '100%' }

function BoardCard({ job, j, level, owner, onOpen }) {
  const next = j.steps.find((s) => s.current)?.nextText
  const tip = j.attention.map((a) => a.text).join('\n')
  return (
    <button type="button" className="ix-bcard" onClick={() => onOpen(job.id)} title={tip || undefined}>
      <div className="top">
        {level !== 'none' && <span className={`ix-dot ${level}`} aria-label="Needs attention" />}
        <b>{job.job_no}</b>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{job.mode || ''}</span>
      </div>
      <div className="cl">{job.client || 'No client'}</div>
      {next && <div className="nx">{next}</div>}
      <div className="meta">
        {j.freeDaysLeft !== null && j.freeDaysLeft !== undefined && <FreeDays value={j.freeDaysLeft} />}
        {truckNos(job).length > 0 && <Chip tone="grey" icon="truck" className="mono">{truckNos(job).length > 1 ? `${truckNos(job)[0]} +${truckNos(job).length - 1}` : truckNos(job)[0]}</Chip>}
        <span style={{ marginLeft: 'auto' }}><Owner name={owner} short /></span>
      </div>
    </button>
  )
}

export default function BoardPage({ onOpenJob }) {
  const { rows, profiles, loading, error, refresh, data } = useJourney()
  useFreshOnOpen() // opening the page shows the latest saved data
  const [kind, setKind] = useState('import')
  const [query, setQuery] = useState('')
  const [allDelivered, setAllDelivered] = useState(false)

  const phases = kind === 'import' ? PHASES : EXPORT_PHASES

  const grouped = useMemo(() => {
    const out = Object.fromEntries(phases.map((p) => [p.id, []]))
    const q = query.trim().toLowerCase()
    for (const { job, j } of rows) {
      if (isExportJob(job) !== (kind === 'export')) continue
      if (!out[j.phase]) continue
      if (q) {
        const hay = [job.job_no, job.client, job.containers, job.be_no, ...truckNos(job)]
          .map((v) => (Array.isArray(v) ? v.join(' ') : String(v ?? ''))).join(' ').toLowerCase()
        if (!hay.includes(q)) continue
      }
      out[j.phase].push({ job, j, level: worst(j) })
    }
    for (const [id, list] of Object.entries(out)) {
      if (id === 'delivered') list.sort(newestFirst)
      else list.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || byJobNoDesc(a, b))
    }
    return out
  }, [rows, kind, query, phases])

  // phones: slide the board sideways to one column (the page itself stays put)
  const jumpTo = (id) => {
    const board = document.querySelector('.ix-board')
    const col = document.getElementById(`ix-col-${id}`)
    if (!board || !col) return
    const left = board.scrollLeft + col.getBoundingClientRect().left - board.getBoundingClientRect().left
    board.scrollTo({ left, behavior: 'smooth' })
  }

  const kindBtn = (id, label, icon) => (
    <button type="button" className={`ix-btn sm ${kind === id ? 'primary' : ''}`} onClick={() => { setKind(id); setAllDelivered(false) }} aria-pressed={kind === id}>
      <Icon name={icon} />{label}
    </button>
  )

  return (
    <div className="ix-page">
      <div className="ix-page-head">
        <div>
          <h1>Shipment board</h1>
          <p>Every {kind === 'import' ? 'import' : 'export'} job, by where it is right now</p>
        </div>
        <div className="right">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search job, client, container, BE, truck" style={searchInput} aria-label="Search the board" />
          {kindBtn('import', 'Imports', 'package')}
          {kindBtn('export', 'Exports', 'ship')}
          <button type="button" className="ix-btn sm ghost" onClick={refresh} disabled={loading} title="Load the latest saved data">
            <Icon name="refresh" />{loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="ix-error">
          Could not load the latest data — {error}.{' '}
          <button type="button" className="ix-btn sm" onClick={refresh} style={{ marginLeft: 8 }}>Refresh</button>
        </div>
      )}

      {loading && !data ? (
        <div className="ix-card"><Skeleton rows={6} /></div>
      ) : error ? null : (
        <>
        <div className="ix-board-jump show-m" role="tablist" aria-label="Jump to a column">
          {phases.map((p) => (
            <button key={p.id} type="button" className={grouped[p.id].length ? 'has' : ''}
              onClick={() => jumpTo(p.id)}>
              {p.label}<span className="n">{grouped[p.id].length}</span>
            </button>
          ))}
        </div>
        <div className="ix-board">
          {phases.map((p) => {
            const list = grouped[p.id]
            const capped = p.id === 'delivered' && !allDelivered && list.length > DELIVERED_SHOWN
            const shown = capped ? list.slice(0, DELIVERED_SHOWN) : list
            return (
              <div key={p.id} id={`ix-col-${p.id}`} className="ix-col">
                <div className="ix-col-h" title={p.hint}>
                  <Icon name={PHASE_ICONS[p.id] || 'circle'} style={{ color: 'var(--muted)' }} />
                  {p.label}
                  <span className="n">{list.length}</span>
                </div>
                {shown.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12, padding: 8 }}>No jobs here</div>}
                {shown.map(({ job, j, level }) => (
                  <BoardCard key={job.id} job={job} j={j} level={level} owner={jobOwnerName(job, profiles)} onOpen={onOpenJob} />
                ))}
                {p.id === 'delivered' && list.length > DELIVERED_SHOWN && (
                  <button type="button" className="ix-btn sm" style={{ justifyContent: 'center', flexShrink: 0 }} onClick={() => setAllDelivered((v) => !v)}>
                    {allDelivered ? `Show the latest ${DELIVERED_SHOWN} only` : `Show all ${list.length}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        </>
      )}
    </div>
  )
}
