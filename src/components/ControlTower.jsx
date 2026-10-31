import { useMemo, useState } from 'react'
import { daysAgo, isExportJob, jobCount } from '../services/journey'
import { useJourney, useFreshOnOpen } from '../industrial/JourneyContext'
import { Button, JobNo, Kpi, KpiStrip, PageHead, fmtTime, phaseChip, timeAgo, worst } from '../industrial/ui'
import { OwnerTable, StageBoard } from './desktop/ControlTowerDesktop'
import TeamFeed from './mobile/ControlTowerMobile'
import '../industrial/styles/team.css'

// Team & stages (Control tower rebuild, Jose 31 Oct 2026): who holds which open jobs,
// where every open job is, and what the team did. Every count comes from useJourney()
// (active / facts), so the stage figures match Today's pipeline and the sidebar. The old
// screen counted every loaded job ("Active jobs 71") and greeted the user twice.

// owner filter value for jobs nobody is assigned to
const NONE = 'none'

// the same stages, in the same order, as Today's pipeline; `view` = the All jobs tab
// that lists the same jobs
const IMPORT_STAGES = [
  { id: 'arrival', view: 'open' },
  { id: 'docs', view: 'open' },
  { id: 'ooc', view: 'ooc' },
  { id: 'release', view: 'truck' },
  { id: 'truck', view: 'onroad' },
]
const EXPORT_STAGES = [{ id: 'sb', view: 'open' }, { id: 'leo', view: 'open' }, { id: 'sail', view: 'open' }]

// red first, then amber, then by job number
const LEVEL_RANK = { red: 0, amber: 1, info: 2, none: 3 }
const byLevel = (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]
  || String(a.job.job_no).localeCompare(String(b.job.job_no), undefined, { numeric: true })

const savePref = (k, val) => { try { localStorage.setItem(k, val) } catch { /* private mode: the choice just isn't remembered */ } }

export default function ControlTowerSection({ onOpenJob, onGo, onStageFilter }) {
  const { data, active, facts, profiles, loading, error, refresh } = useJourney()
  useFreshOnOpen() // opening the page shows the latest saved data
  const [owner, setOwner] = useState(null) // null = everyone, NONE = unassigned, else a profile id
  const dash = loading && !data
  // 'now' is when the data was loaded: every figure on the page is from that moment
  const now = data ? new Date(data.loadedAt).getTime() : 0

  // With the new page props (onGo present) onOpenJob takes (id, tab); the old mount
  // passes (job) => openJob(job.id). Both work until AdminDashboard switches over.
  const open = (id, tab) => {
    if (onGo) return onOpenJob?.(id, tab)
    const job = active.find((r) => r.job.id === id)?.job
    return onOpenJob?.(job || { id })
  }
  // a stage's jobs in All jobs: the same view Today's pipeline opens
  const openView = (view) => {
    savePref('ix_jobs_view', view)
    if (onGo) onGo('jobs')
    else onStageFilter?.()
  }

  const m = useMemo(() => {
    const needIds = new Set(facts.needTruck.map((r) => r.job.id))
    const roadIds = new Set(facts.onRoad.map((e) => e.jobId))
    const items = active.map((r) => {
      const level = worst(r.j)
      const ownerId = r.job.assigned_to || null
      return {
        ...r, id: r.job.id, level, ownerId,
        ownerName: ownerId ? (profiles?.[ownerId] || 'Unknown person') : null,
        // the same test as Today's "Need action": a red or amber problem
        needsAction: level === 'red' || level === 'amber',
        age: daysAgo(r.job.created_at, now), // days since the job was opened
      }
    })

    // one row per owner, busiest first; jobs with no owner go last as "Unassigned"
    const map = new Map()
    for (const x of items) {
      const key = x.ownerId || NONE
      if (!map.has(key)) map.set(key, { key, name: x.ownerName, jobs: [] })
      map.get(key).jobs.push(x)
    }
    const owners = [...map.values()].map((o) => ({
      ...o,
      action: o.jobs.filter((x) => x.needsAction).length,
      red: o.jobs.filter((x) => x.level === 'red').length,
      ooc: o.jobs.filter((x) => x.j.phase === 'ooc').length,
      move: o.jobs.filter((x) => x.j.phase === 'release').length,
      oldest: o.jobs.filter((x) => x.age !== null).sort((a, b) => b.age - a.age)[0] || null,
    })).sort((a, b) => (a.key === NONE) - (b.key === NONE) || b.jobs.length - a.jobs.length
      || String(a.name).localeCompare(String(b.name)))

    // stage lists over every open job (the KPIs); the board narrows them by owner
    const imports = items.filter((x) => !isExportJob(x.job))
    const exports = items.filter((x) => isExportJob(x.job))
    const stage = (s, pool) => {
      const c = phaseChip(null, { phase: s.id })
      return { ...s, label: c.label, tone: c.tone, jobs: pool.filter((x) => x.j.phase === s.id).sort(byLevel) }
    }
    const importStages = IMPORT_STAGES.map((s) => stage(s, imports))
    const exportStages = exports.length ? EXPORT_STAGES.map((s) => stage(s, exports)) : []
    return { owners, imports, exports, importStages, exportStages, needIds, roadIds }
  }, [active, facts, profiles, now])

  const unassigned = m.owners.find((o) => o.key === NONE)
  const people = m.owners.filter((o) => o.key !== NONE).length
  const st = Object.fromEntries(m.importStages.map((s) => [s.id, s]))
  const oocDays = st.ooc.jobs.map((x) => daysAgo(x.job.be_date, now)).filter((d) => d !== null)
  const needInMove = st.release.jobs.filter((x) => m.needIds.has(x.id)).length
  const seenOnRoad = jobCount(facts.onRoad)
  const oldestUnassigned = unassigned?.oldest

  // the stage board for the chosen owner (or everyone)
  const keep = (x) => !owner || (owner === NONE ? !x.ownerId : x.ownerId === owner)
  const boardStages = [...m.importStages, ...m.exportStages].map((s) => ({ ...s, jobs: s.jobs.filter(keep) }))
  const ownerName = owner === NONE ? 'Unassigned' : owner ? (profiles?.[owner] || 'Unknown person') : null
  const pickOwner = (key) => setOwner((cur) => (cur === key ? null : key))

  const n = (v) => (dash ? null : v)
  const sub = [
    !dash && `${active.length} open ${active.length === 1 ? 'job' : 'jobs'}`,
    !dash && `${people} ${people === 1 ? 'person' : 'people'} with jobs`,
    data && <span title={`Loaded ${timeAgo(data.loadedAt)}`}>refreshed {fmtTime(data.loadedAt)} IST</span>,
  ]

  return (
    <div className="tm-page">
      <PageHead title="Team & stages" sub={sub}
        actions={<Button variant="ghost" size="sm" icon="refresh" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</Button>} />

      {error && <div className="ix-error">Could not load the latest data: {error}. Press Refresh.</div>}

      <KpiStrip>
        <Kpi label="Open jobs" value={n(active.length)}
          sub={!dash && `${m.imports.length} import · ${m.exports.length} export`}
          onClick={() => setOwner(null)} selected={!owner} title="Show every open job on the stage board" />
        <Kpi label="Unassigned" dot={unassigned ? 'amber' : undefined} tone={unassigned ? 'amber' : undefined} value={n(unassigned?.jobs.length || 0)}
          sub={!dash && (oldestUnassigned
            ? <>oldest <JobNo no={oldestUnassigned.job.job_no} /> · {oldestUnassigned.age} d</>
            : unassigned ? 'assign in the job panel' : 'every job has an owner')}
          onClick={unassigned ? () => pickOwner(NONE) : undefined} selected={owner === NONE} title="Open jobs with no owner: show them on the stage board" />
        <Kpi label={st.arrival.label} value={n(st.arrival.jobs.length)} title="Ship or flight not arrived yet" />
        <Kpi label={st.docs.label} value={n(st.docs.jobs.length)} sub={!dash && st.docs.jobs.length > 0 && 'file in LiveImpex'} title="BE not filed yet" />
        <Kpi label={st.ooc.label} value={n(st.ooc.jobs.length)}
          sub={!dash && (oocDays.length ? `oldest ${Math.max(...oocDays)} d since BE` : st.ooc.jobs.length ? null : 'none waiting')} title="BE filed, OOC not yet" />
        <Kpi label={st.release.label} tone={st.release.jobs.length ? 'amber' : undefined} value={n(st.release.jobs.length)}
          sub={!dash && (needInMove ? `${needInMove} need a truck` : st.release.jobs.length ? 'truck or rail arranged' : null)} title="OOC granted, cargo still at the port or CFS" />
        <Kpi label={st.truck.label} value={n(st.truck.jobs.length)}
          sub={!dash && (seenOnRoad ? `${seenOnRoad} seen on the road` : null)} title="Out of the port or CFS by truck or rail" />
      </KpiStrip>

      <div className="ix-grid-2 tm-grid">
        <div className="tm-col">
          <OwnerTable owners={m.owners} total={active.length} dash={dash} selected={owner} none={NONE} onPick={pickOwner} onOpenJob={open} />
          <StageBoard stages={boardStages} dash={dash} now={now} ownerName={ownerName} showOwner={!owner}
            needIds={m.needIds} roadIds={m.roadIds} onClear={() => setOwner(null)} onOpenJob={open} openView={openView} />
        </div>
        <TeamFeed data={data} profiles={profiles} dash={dash} onOpenJob={open} />
      </div>
    </div>
  )
}
