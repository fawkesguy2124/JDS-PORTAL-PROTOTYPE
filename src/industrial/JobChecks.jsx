import { useState } from 'react'
import { supabase } from '../supabase'
import { setStage } from '../services/jobActions'
import { getStageName, parseContainerNos } from '../utils/jobHelpers'
import CustomsStatusCard from '../components/CustomsStatusCard'
import UlipSection from '../components/ulip/UlipSection'
import { useJourney } from './JourneyContext'
import { Icon, PhaseChip } from './ui'
import { truckNos } from '../services/journey'

// Left: find a job (search + short lists). Right: that job's government checks.
// Used by BE & OOC (customs checks) and Trucks (truck & driver checks).

export function JobPicker({ title, rows, selectedId, onSelect, lists = [], placeholder }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase().replace(/\s+/g, '')
  const hits = needle
    ? rows.filter(({ job }) => [job.job_no, job.client, job.be_no, job.bl_no, ...truckNos(job), job.ulip_refs?.igm_no, ...parseContainerNos(job.containers)]
      .filter(Boolean).some((x) => String(x).toLowerCase().replace(/\s+/g, '').includes(needle))).slice(0, 30)
    : null
  const item = ({ job, j }, sub) => (
    <button key={job.id} type="button" onClick={() => onSelect(job.id)}
      className="ix-pick-row" aria-current={selectedId === job.id}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div><b className="mono">{job.job_no}</b> <span style={{ color: 'var(--text-2)' }}>· {job.client || '—'}</span></div>
        <div className="s">{sub ? sub({ job, j }) : (job.be_no ? `BE ${job.be_no}` : 'No BE yet')}</div>
      </div>
      <PhaseChip job={job} j={j} />
    </button>
  )
  return (
    <div className="ix-card ix-picker">
      <div className="ix-card-head"><Icon name="search" style={{ color: 'var(--navy)' }} /><h2>{title}</h2></div>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || 'Job no, client, BE, container…'}
          style={{ width: '100%', height: 34, border: '1px solid var(--line)', borderRadius: 8, padding: '0 10px', font: '13px Inter, sans-serif' }} />
      </div>
      <div className="ix-pick-list">
        {hits ? (
          hits.length ? hits.map((r) => item(r)) : <div className="ix-empty">No job matches “{q}”.</div>
        ) : lists.map((l) => (
          <div key={l.title}>
            <div className="ix-att-group" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name={l.icon} style={{ color: l.color }} />{l.title} · {l.rows.length}
            </div>
            {l.note && <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--muted)' }}>{l.note}</div>}
            {l.rows.length === 0 ? <div className="ix-empty" style={{ padding: '8px 12px' }}>{l.empty}</div> : l.rows.map((r) => item(r, l.sub))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function NoJobChosen({ text }) {
  return (
    <div className="ix-card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
      <Icon name="hand-click" style={{ fontSize: 36 }} />
      <div style={{ marginTop: 8 }}>{text}</div>
    </div>
  )
}

function JobHead({ job, j, onOpenJob, children }) {
  return (
    <div className="ix-card-head" style={{ flexWrap: 'wrap' }}>
      <b className="mono" style={{ fontSize: 16 }}>{job.job_no}</b>
      <span style={{ color: 'var(--text-2)' }}>{job.client || '—'} · {job.mode || '—'}</span>
      <PhaseChip job={job} j={j} />
      <div className="right" style={{ display: 'flex', gap: 6 }}>
        {children}
        <button type="button" className="ix-btn sm" onClick={() => onOpenJob(job.id)}><Icon name="layout-sidebar-right" />Job summary</button>
      </div>
    </div>
  )
}

// After a check or save: read the job again and put it into the shared data
async function reloadJob(id, patchJob) {
  const { data } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle()
  if (data) patchJob(data)
}

export function CustomsWorkspace({ jobId, onOpenJob, canEditBE, canUpdateStage, currentUserName, showToast, groups }) {
  const { byId, patchJob, refresh } = useJourney()
  const row = byId[jobId]
  if (!row) return <NoJobChosen text="That job is not in the list any more." />
  const { job, j } = row
  return (
    <div className="ix-card">
      <JobHead job={job} j={j} onOpenJob={onOpenJob} />
      <div style={{ padding: 16 }}>
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
        <div style={{ marginTop: 20 }}>
          <UlipSection key={job.id} job={job} groups={groups} onJobChange={() => reloadJob(job.id, patchJob)} />
        </div>
      </div>
    </div>
  )
}

export function TruckWorkspace({ jobId, onOpenJob, groups }) {
  const { byId, patchJob } = useJourney()
  const row = byId[jobId]
  if (!row) return <NoJobChosen text="That job is not in the list any more." />
  const { job, j } = row
  return (
    <div className="ix-card">
      <JobHead job={job} j={j} onOpenJob={onOpenJob}>
        {truckNos(job).map((t) => <span key={t} className="ix-plate" style={{ fontSize: 12 }}>{t}</span>)}
      </JobHead>
      <div style={{ padding: 16 }}>
        {!truckNos(job).length && <div className="ix-next" style={{ marginBottom: 16 }}><Icon name="info-circle" /><div><div className="t">No truck assigned yet</div><div className="s">Type the truck number in a check below, or assign it from the list.</div></div></div>}
        <UlipSection key={job.id} job={job} groups={groups} onJobChange={() => reloadJob(job.id, patchJob)} />
      </div>
    </div>
  )
}
