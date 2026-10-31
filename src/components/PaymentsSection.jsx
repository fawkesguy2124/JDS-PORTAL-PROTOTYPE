import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJourney } from '../industrial/JourneyContext'
import { KpiStrip, Kpi, Tabs, JobNo, Status, PhaseStatus, Owner, Dash, EmptyState, Button, Chip, fmtINR } from '../industrial/ui'
import '../industrial/styles/records.css'

// Payments: open jobs at the duty payment or CFS stage, with the CFS amount saved on
// each job (the same field the job details and the WhatsApp bot write). The old
// Approve / Query buttons only showed a message and saved nothing, so they are gone
// until payments are really recorded (audit, Jose 31 Oct 2026).
// The page title comes from AdminDashboard (legacyPage), so this draws only the content.

const PAY_STAGES = { 6: 'Duty payment', 8: 'CFS coordination' }
const amountOf = (job) => (job.cfs_amount === null || job.cfs_amount === undefined || job.cfs_amount === '' || isNaN(Number(job.cfs_amount)) ? null : Number(job.cfs_amount))
const byJobNo = (a, b) => String(b.job.job_no).localeCompare(String(a.job.job_no), undefined, { numeric: true })

export default function PaymentsSection({ jobs, profiles, onOpenJob }) {
  const journey = useJourney()
  const navigate = useNavigate()
  const [tab, setTab] = useState('queue')

  // open jobs from the shared journey (the same set as the sidebar's open jobs);
  // without it, every job not delivered by stage
  const open = useMemo(() => (journey?.data
    ? journey.active
    : (jobs || []).filter((job) => Number(job.stage) < 10).map((job) => ({ job, j: null }))), [journey, jobs])

  const queue = useMemo(() => open.filter((r) => PAY_STAGES[Number(r.job.stage)])
    .sort((a, b) => (Number(a.job.stage) - Number(b.job.stage)) || ((amountOf(a.job) !== null) - (amountOf(b.job) !== null)) || byJobNo(a, b)), [open])
  const withAmount = useMemo(() => open.filter((r) => amountOf(r.job) !== null)
    .sort((a, b) => (amountOf(b.job) - amountOf(a.job)) || byJobNo(a, b)), [open])

  const sum = (list) => list.reduce((t, r) => t + (amountOf(r.job) || 0), 0)
  const queueRecorded = queue.filter((r) => amountOf(r.job) !== null)
  const missing = queue.length - queueRecorded.length
  const duty = queue.filter((r) => Number(r.job.stage) === 6).length

  // opens the job panel; when the page is not given onOpenJob, the same alert-link
  // route the bell uses (?tab=jobs&open=)
  const openJob = (id) => (onOpenJob ? onOpenJob(id, 'details') : navigate(`/admin?tab=jobs&open=${id}`))
  const rows = tab === 'queue' ? queue : withAmount

  return (
    <>
      <KpiStrip>
        <Kpi label="Waiting for payment" dot="amber" value={queue.length} unit={queue.length === 1 ? 'job' : 'jobs'}
          tone={queue.length ? 'amber' : undefined}
          sub={queue.length ? `${duty} duty · ${queue.length - duty} CFS` : 'nothing at the duty or CFS stage'}
          onClick={() => setTab('queue')} selected={tab === 'queue'} />
        <Kpi label="CFS amount, waiting jobs" value={queueRecorded.length ? fmtINR(sum(queueRecorded)) : null}
          sub={queue.length ? `recorded on ${queueRecorded.length} of ${queue.length}` : 'no job waiting'} />
        <Kpi label="Amount not recorded" value={missing} tone={missing ? 'amber' : undefined}
          sub={missing ? "add it in the job's details" : 'every waiting job has one'} />
        <Kpi label="CFS amounts, open jobs" value={withAmount.length ? fmtINR(sum(withAmount)) : null}
          sub={`${withAmount.length} open job${withAmount.length === 1 ? '' : 's'} with an amount`}
          onClick={() => setTab('amounts')} selected={tab === 'amounts'} />
      </KpiStrip>

      <section className="ix-card rec-panel">
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'queue', label: 'Waiting for payment', count: queue.length, tone: queue.length ? 'amber' : undefined },
          { id: 'amounts', label: 'CFS amounts on open jobs', count: withAmount.length },
        ]} />
        {rows.length === 0 ? (
          tab === 'queue' ? (
            <EmptyState icon="receipt-rupee" tone="green" title="No payments waiting"
              action={withAmount.length ? <Button size="sm" onClick={() => setTab('amounts')}>See {withAmount.length} CFS amount{withAmount.length === 1 ? '' : 's'} on open jobs</Button> : null}>
              Open jobs at the duty payment or CFS stage show here with their CFS amount.
            </EmptyState>
          ) : (
            <EmptyState icon="receipt-rupee" title="No CFS amounts recorded">
              The CFS amount is saved in each job's details, or sent to the WhatsApp bot.
            </EmptyState>
          )
        ) : (
          <div className="ix-tbl-wrap rec-wrap">
            <table className="ix-tbl click rec-tbl">
              <thead>
                <tr>
                  <th className="lvl" /><th>Job</th><th>Client</th><th>Stage</th><th>CFS</th>
                  <th className="r">CFS amount</th><th>Owner</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ job, j }) => {
                  const amount = amountOf(job)
                  const payStage = PAY_STAGES[Number(job.stage)]
                  return (
                    <tr key={job.id} className={tab === 'queue' && amount === null ? 'amber' : ''} onClick={() => openJob(job.id)}>
                      <td className="lvl" />
                      <td><JobNo no={job.job_no} onClick={() => openJob(job.id)} /></td>
                      <td className="cl" title={job.client || ''}>{job.client || <Dash />}</td>
                      <td>{tab === 'queue' || !j ? <Status tone={payStage ? 'amber' : 'grey'}>{payStage || 'Open'}</Status> : <PhaseStatus job={job} j={j} />}</td>
                      <td className="cl">{job.cfs_name || <Dash />}</td>
                      <td className="r">{amount !== null ? <b className="rec-n">{fmtINR(amount)}</b> : <Chip tone="amber">Not recorded</Chip>}</td>
                      <td><Owner name={profiles?.[job.assigned_to] || null} /></td>
                      <td className="r">
                        <span className="row-act">
                          <Button size="sm" variant="ghost" icon="arrow-right" onClick={(e) => { e.stopPropagation(); openJob(job.id) }}>
                            {amount === null ? 'Add amount' : 'Open job'}
                          </Button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <div className="ix-tbl-foot">
            <span>{rows.length} job{rows.length === 1 ? '' : 's'} · {fmtINR(sum(rows))} recorded</span>
            <span className="right muted">Amounts come from each job's CFS amount</span>
          </div>
        )}
      </section>
    </>
  )
}
