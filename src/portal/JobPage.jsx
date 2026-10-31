import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useJourney } from '../industrial/JourneyContext'
import { useAutoChecks } from '../industrial/autoChecks'
import { usePortal } from './PortalContext'
import { riskOf, ownerOf } from './model'
import { autoChecksFor } from './actions'
import WhereCard from './WhereCard'
import Papers from './Papers'
import { Containers, History } from './JobExtras'
import './jobpage.css'

const BackIcon = () => (
  <svg className="pt-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
)

// The job's papers and activity: exactly the JobDrawer queries
function useJobFiles(jobId) {
  const [state, setState] = useState({ docs: [], activity: [], n: 0 })
  const reload = useCallback(() => setState((s) => ({ ...s, n: s.n + 1 })), [])
  const n = state.n
  useEffect(() => {
    if (!jobId) return undefined
    let cancelled = false
    Promise.all([
      supabase.from('documents').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
      supabase.from('activity_log').select('*').eq('job_id', jobId).order('created_at', { ascending: false }).limit(80),
    ]).then(([d, l]) => {
      if (cancelled) return
      setState((s) => ({ ...s, docs: d.data || [], activity: l.data || [] }))
    }).catch((e) => console.warn('[portal] could not load the job papers:', e?.message))
    return () => { cancelled = true }
  }, [jobId, n])
  return { docs: state.docs, activity: state.activity, reload }
}

function Page({ row, layout, onClose }) {
  const { job } = row
  const { data, profiles, refresh } = useJourney()
  const { toast, openEdit } = usePortal()
  const { docs, activity, reload } = useJobFiles(job.id)

  // checks made by themselves when a person opens the job (customs OOC, truck FASTag / papers)
  useAutoChecks(autoChecksFor(row, data, toast), true, refresh)

  const owner = ownerOf(job, profiles)
  const risk = riskOf(row, data)

  return (
    <article className="pt-pg" aria-label={`Job ${job.job_no}`}>
      <header className="pt-ph">
        {layout === 'm' && (
          <button type="button" className="pt-back" onClick={onClose} aria-label="Back"><BackIcon /></button>
        )}
        <div className="pt-ph-main">
          <h2>{job.job_no}</h2>
          <div className="pt-client">{job.client || '—'}</div>
        </div>
        {(owner || risk) && (
          <div className="pt-side">
            {owner && (
              <span className="pt-owner" title={owner.name}>
                <span className="pt-av" aria-hidden="true">{owner.initials}</span>
                <span className="pt-owner-name">{owner.name}</span>
              </span>
            )}
            {risk && <span className="pt-risk">{risk}</span>}
          </div>
        )}
      </header>
      <WhereCard row={row} layout={layout} activity={activity} onDone={reload} />
      <Papers row={row} docs={docs} layout={layout} onChanged={reload} />
      <Containers job={job} />
      <History row={row} activity={activity} />
      <button type="button" className="pt-link pt-editlink" onClick={() => openEdit(job.id)}>Edit details</button>
    </article>
  )
}

// <JobPage row={{ job, j }} layout="d"|"m" onClose={fn} /> — keyed by job id, so
// each opening starts fresh (inputs, history, automatic checks)
export default function JobPage({ row, layout, onClose }) {
  if (!row?.job) return null
  return <Page key={row.job.id} row={row} layout={layout} onClose={onClose} />
}
