import { useState } from 'react'
import { supabase } from '../supabase'
import { setStage } from '../services/jobActions'
import { getStageName, parseContainerNos } from '../utils/jobHelpers'
import CustomsStatusCard from '../components/CustomsStatusCard'
import UlipSection from '../components/ulip/UlipSection'
import { useJourney } from './JourneyContext'
import { Icon, JobNo, PhaseStatus, Status, Chip, FreeDays, Dash, Button, SearchBox, EmptyState, fmtDate, fmtDateTime } from './ui'
import BeStage from './BeStage'
import { truckNos, daysAgo } from '../services/journey'
import './styles/customs.css'

// Left: find a job (search + short lists). Right: that job's government checks.
// Used by BE & OOC (customs checks) and Trucks (truck & driver checks).
// Control tower look (Jose, 31 Oct 2026): dense rows, job number first, client on one line.

// lists = [{ title, rows, empty, sub(r), note, tag(r) → node, level(r) → 'red' | 'amber' | '' }]
// (icon / color are still accepted from older callers; the group head is a plain caps line)
export function JobPicker({ title, rows, selectedId, onSelect, lists = [], placeholder, className = '' }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase().replace(/\s+/g, '')
  const hits = needle
    ? rows.filter(({ job }) => [job.job_no, job.client, job.be_no, job.bl_no, ...truckNos(job), job.ulip_refs?.igm_no, ...parseContainerNos(job.containers)]
      .filter(Boolean).some((x) => String(x).toLowerCase().replace(/\s+/g, '').includes(needle))).slice(0, 30)
    : null
  const item = (r, l) => {
    const { job, j } = r
    const level = l?.level ? l.level(r) : ''
    return (
      <button key={job.id} type="button" onClick={() => onSelect(job.id)}
        className={`cu-row${level ? ` ${level}` : ''}`} aria-current={selectedId === job.id}>
        <span className="t"><JobNo no={job.job_no} /><span className="cl">{job.client || 'No client'}</span></span>
        <span className="m">{l?.sub ? l.sub(r) : (job.be_no ? <>BE <span className="mono">{job.be_no}</span></> : 'No BE yet')}</span>
        <span className="tg">{l?.tag ? l.tag(r) : <PhaseStatus job={job} j={j} />}</span>
      </button>
    )
  }
  return (
    <section className={`ix-card cu-list${className ? ` ${className}` : ''}`} aria-label={title}>
      <div className="cu-list-top">
        <SearchBox value={q} onChange={setQ} placeholder={placeholder || 'Job no, client, BE, container…'} />
      </div>
      <div className="cu-list-body">
        {hits ? (
          hits.length
            ? <><div className="cu-grp">Matches<span className="n">{hits.length}</span></div>{hits.map((r) => item(r))}</>
            : <EmptyState line icon="search" title={`No job matches “${q}”.`} />
        ) : lists.map((l) => (
          <div key={l.title}>
            <div className="cu-grp">{l.title}<span className="n">{l.rows.length}</span></div>
            {l.note && <div className="cu-grp-note">{l.note}</div>}
            {l.rows.length === 0 ? <div className="cu-none">{l.empty}</div> : l.rows.map((r) => item(r, l))}
          </div>
        ))}
      </div>
    </section>
  )
}

export function NoJobChosen({ text }) {
  return (
    <div className="ix-card">
      <EmptyState icon="hand-click" title="Pick a job">{text}</EmptyState>
    </div>
  )
}

// Title row of the job on the right: job number first, then client, mode and port
function JobHead({ job, j, onOpenJob, onClose, children }) {
  return (
    <div className="ix-card-head">
      <JobNo no={job.job_no} size="lg" />
      <span className="cl">{[job.client || 'No client', job.mode, job.port].filter(Boolean).join(' · ')}</span>
      <PhaseStatus job={job} j={j} />
      <div className="right">
        {children}
        <Button size="sm" icon="layout-sidebar-right" onClick={() => onOpenJob(job.id)}>Job summary</Button>
        {onClose && <button type="button" className="ix-icon-btn sm" onClick={onClose} aria-label="Back to the list" title="Back to the list"><Icon name="x" /></button>}
      </div>
    </div>
  )
}

// After a check or save: read the job again and put it into the shared data
async function reloadJob(id, patchJob) {
  const { data } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle()
  if (data) patchJob(data)
}

// BE age as a tag: 'Day 9' red after 7 days, amber from 4, grey before (audit, 31 Oct 2026)
export function DayTag({ since }) {
  const d = since ? daysAgo(since) : null
  if (d === null || d === undefined || isNaN(d)) return null
  const n = Math.max(0, d)
  return <Chip tone={n > 7 ? 'red' : n >= 4 ? 'amber' : 'grey'} title={`Filed ${n === 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`}`}>Day {n}</Chip>
}

// The customs facts of one import job, all from the saved data (a missing fact is a dash)
function CustomsFacts({ job, j }) {
  const ooc = j.steps?.find((s) => s.id === 'ooc')
  const out = j.steps?.find((s) => s.id === 'out')
  const boxes = j.containers?.nos?.length || 0
  const stage = j.beStage
  return (
    <dl className="cu-facts">
      <div><dt>BE</dt><dd>{job.be_no ? <span className="mono">{job.be_no}</span> : <Dash />}{job.be_date && <span className="x">{fmtDate(job.be_date)}</span>}{j.beFiled && !j.oocDone && <DayTag since={job.be_date} />}</dd></div>
      {/* OOC granted = the job's phase as the rest of the portal shows it (amber 'To move', green only when delivered) */}
      <div><dt>Customs stage</dt><dd>{j.oocDone ? <PhaseStatus job={job} j={j} /> : stage ? <Status tone={stage.tone}>{stage.short}</Status> : j.beFiled ? <span className="x">Not set</span> : <Dash />}</dd></div>
      <div><dt>OOC</dt><dd>{j.oocDate ? <>{fmtDate(j.oocDate)}{j.customs?.ooc_no && <span className="x mono">{j.customs.ooc_no}</span>}</> : j.oocDone ? <span className="x">{ooc?.sub || 'Recorded by staff'}</span> : <Dash />}</dd></div>
      <div><dt>Last checked</dt><dd>{j.customs?.checked_at ? fmtDateTime(j.customs.checked_at) : j.beFiled ? <span className="x">Not yet</span> : <Dash />}</dd></div>
      <div><dt>{j.arrivedAt ? 'Arrived' : 'ETA'}</dt><dd>{j.arrivedAt ? fmtDate(j.arrivedAt) : job.eta ? fmtDate(job.eta) : <Dash />}</dd></div>
      <div><dt>Containers</dt><dd>{boxes ? <>{boxes}{out?.sub && <span className="x">{out.sub}</span>}</> : <Dash />}</dd></div>
      <div><dt>Free days</dt><dd><FreeDays value={j.freeDaysLeft} till={j.freeTill && fmtDate(j.freeTill)} /></dd></div>
    </dl>
  )
}

// onClose (optional): an X in the head that goes back to the list
export function CustomsWorkspace({ jobId, onOpenJob, canEditBE, canUpdateStage, currentUserName, showToast, groups, onClose }) {
  const { byId, patchJob, refresh } = useJourney()
  const row = byId[jobId]
  if (!row) return <NoJobChosen text="That job is not in the list any more." />
  const { job, j } = row
  const next = j.steps?.find((s) => s.current)
  return (
    <section className="ix-card cu-detail">
      <JobHead job={job} j={j} onOpenJob={onOpenJob} onClose={onClose} />
      <div className="cu-detail-body">
        <CustomsFacts job={job} j={j} />
        {next && j.phase !== 'delivered' && (
          <div className="ix-next">
            <Icon name="arrow-right" />
            <div><div className="t">{next.nextText || next.label}</div>{next.sub && <div className="s">{next.sub}</div>}</div>
          </div>
        )}
        {/* where the BE is now: one tap (Jose, 25 Oct 2026) */}
        {j.beFiled && !j.oocDone && <BeStage job={job} userName={currentUserName} showToast={showToast} />}
        <div className="cu-legacy">
          <CustomsStatusCard
            key={job.id}
            job={job}
            canEditBE={canEditBE}
            canUpdateStage={canUpdateStage}
            onMoveToStage={async (stage) => {
              const res = await setStage(job, Number(stage), getStageName(Number(stage)), currentUserName)
              if (res.ok) { patchJob(res.job); showToast?.(`${job.job_no} moved to ${getStageName(Number(stage))}`, 'success') }
              else showToast?.(res.error, 'error')
            }}
            onSaved={async () => { await reloadJob(job.id, patchJob); refresh() }}
            toast={showToast}
          />
        </div>
        <div className="cu-legacy">
          <UlipSection key={job.id} job={job} groups={groups} onJobChange={() => reloadJob(job.id, patchJob)} />
        </div>
      </div>
    </section>
  )
}

export function TruckWorkspace({ jobId, onOpenJob, groups, onClose }) {
  const { byId, patchJob } = useJourney()
  const row = byId[jobId]
  if (!row) return <NoJobChosen text="That job is not in the list any more." />
  const { job, j } = row
  return (
    <section className="ix-card cu-detail">
      <JobHead job={job} j={j} onOpenJob={onOpenJob} onClose={onClose}>
        {truckNos(job).map((t) => <span key={t} className="ix-plate" style={{ fontSize: 12 }}>{t}</span>)}
      </JobHead>
      <div className="cu-detail-body">
        {!truckNos(job).length && <div className="ix-next"><Icon name="info-circle" /><div><div className="t">No truck assigned yet</div><div className="s">Type the truck number in a check below, or assign it from the list.</div></div></div>}
        <UlipSection key={job.id} job={job} groups={groups} onJobChange={() => reloadJob(job.id, patchJob)} />
      </div>
    </section>
  )
}
