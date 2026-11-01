import { useState } from 'react'
import { isExportJob } from '../../services/journey'
import { CUSTOMS_TAB_GROUPS, SHIP_GROUPS } from '../../components/ulip/ulipChecks'
import { CustomsBoard, CustomsPanel } from '../CustomsBoard'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import { useAutoChecks, checkCustoms, isDue } from '../autoChecks'
import { Button, PageHead, SearchBox, Skeleton } from '../ui'
import '../styles/customs.css'

// BE & OOC: a board, one column per step at Customs (BE to file, with Customs, assessed,
// duty paid, OOC granted), each import job a card; a card opens the job's customs panel
// (Jose, 2 Nov 2026: no long page of checks; no summary line, no "checked automatically"
// line and no imports / exports switch above it).
// Opening the page still checks customs by itself for import jobs waiting for OOC (see
// autoChecks.js for the limits); once OOC is granted a job is never checked again.

export default function CustomsPage({ currentUserName, onOpenJob, showToast, canEditBE, canUpdateStage }) {
  const { data, active, rows, loading, error, refresh } = useJourney()
  const fresh = useFreshOnOpen()
  const [q, setQ] = useState('')

  // jobs waiting for OOC whose last customs answer is older than the cool-down
  const toCheck = active
    // (a BE filed before the ship came in is checked too: an OOC must never be missed)
    .filter(({ job, j }) => !isExportJob(job) && (j.phase === 'ooc' || (j.phase === 'arrival' && j.beFiled)) && /^\d{7}$/.test(String(job.be_no || '').trim()) && job.be_date)
    .filter(({ job }) => { const cs = data?.customsByJob?.[job.id]; return isDue(cs?.checked_at, cs?.last_error_at) })
    .map(({ job }) => ({
      key: job.id, label: job.job_no,
      run: async () => { const r = await checkCustoms(job.id); if (r.oocDate) showToast?.(`OOC granted — ${job.job_no}`, 'success') },
    }))
  useAutoChecks(toCheck, fresh, refresh)

  const [selId, setSelId] = useState(() => new URLSearchParams(window.location.search).get('job'))
  const setJobParam = (id) => {
    const params = new URLSearchParams(window.location.search)
    if (id) params.set('job', id)
    else params.delete('job')
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }
  const select = (id) => { setSelId(id); setJobParam(id) }
  const unselect = () => { setSelId(null); setJobParam(null) }

  return (
    <>
      <PageHead title="BE & OOC"
        actions={<>
          <span className="cb-search"><SearchBox value={q} onChange={setQ} placeholder="Find a job, client, BE, container…" /></span>
          <Button size="sm" variant="ghost" icon="refresh" onClick={refresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        </>} />

      {error && (
        <div className="ix-error">
          Could not load the latest data — {error}.{' '}
          <Button size="sm" onClick={refresh} style={{ marginLeft: 8 }}>Refresh</Button>
        </div>
      )}

      {loading && !data ? (
        <div className="ix-card"><Skeleton rows={6} /></div>
      ) : error ? null : (
        <>
          <CustomsBoard rows={active.filter((r) => !isExportJob(r.job))} allRows={rows.filter((r) => !isExportJob(r.job))} q={q} selectedId={selId} onPick={select} />
          {selId && (
            <CustomsPanel jobId={selId} onOpenJob={onOpenJob} canEditBE={canEditBE} canUpdateStage={canUpdateStage} onClose={unselect}
              currentUserName={currentUserName} showToast={showToast} groups={[...CUSTOMS_TAB_GROUPS, ...SHIP_GROUPS]} />
          )}
        </>
      )}
    </>
  )
}
