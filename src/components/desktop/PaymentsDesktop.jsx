import { useMemo } from 'react'
import { getStageName } from '../../utils/jobHelpers'

function classNames(...xs) { return xs.filter(Boolean).join(' ') }

function KpiCard({ label, value, hint, tone }) {
  const tones = { blue: 'text-blue-600', red: 'text-red-600', amber: 'text-amber-600', green: 'text-green-600', violet: 'text-violet-600' }
  return (
    <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl p-5 shadow-sm hover:shadow-md hover:border-[#d0d6e0] transition-all">
      <p className="text-xs font-medium text-[#8a96a8] mb-2">{label}</p>
      <p className={classNames('text-2xl font-extrabold leading-none', tones[tone] || tones.blue)}>{value}</p>
      {hint && <p className="text-xs text-[#8a96a8] mt-1.5">{hint}</p>}
    </div>
  )
}

export default function PaymentsDesktop({ jobs, profiles, showToast }) {
  const stats = useMemo(() => {
    const active = (jobs || []).filter((j) => j.stage !== 10)
    const paymentsPending = active.filter((j) => [6, 8].includes(Number(j.stage)))
    return { paymentsPending: paymentsPending.length }
  }, [jobs])

  const pendingJobs = useMemo(() => (jobs || []).filter(j => [6,8].includes(Number(j.stage))), [jobs])

  return (
    <div>
      {/* Payments KPI */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <KpiCard label="Pending Approval" value={stats.paymentsPending} hint="Total value pending" tone="red" />
        <KpiCard label="Approved Today" value="0" hint="Approved so far" tone="green" />
        <KpiCard label="Monthly Total" value={'\u2014'} hint="All payments this month" tone="blue" />
      </div>

      {/* Payment Queue */}
      <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-[#1a2233]">Payment Approval Queue</div>
            <div className="text-xs text-[#8a96a8] mt-0.5">Jobs in duty payment or CFS stage</div>
          </div>
        </div>
        {pendingJobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#f8f9fb]">
                <tr>
                  <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Job No.</th>
                  <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Client</th>
                  <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Stage</th>
                  <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">CFS Name</th>
                  <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Amount</th>
                  <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Assigned To</th>
                  <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingJobs.map(job => (
                  <tr key={job.id} className="border-b border-[#e2e6ed] text-sm hover:bg-[#e8eef8]">
                    <td className="px-4 py-3 font-mono text-[#1a4fa0] font-medium">{job.job_no || '\u2014'}</td>
                    <td className="px-4 py-3 text-[#4a5568]">{job.client || '\u2014'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]">
                        {getStageName(Number(job.stage) || 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#4a5568]">{job.cfs_name || '\u2014'}</td>
                    <td className="px-4 py-3 text-[#1a2233] font-medium">
                      {job.cfs_amount ? `\u20B9${Number(job.cfs_amount).toLocaleString()}` : 'Pending'}
                    </td>
                    <td className="px-4 py-3 text-[#4a5568]">{job.assigned_to ? (profiles[job.assigned_to] || '\u2014') : '\u2014'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => showToast(`Payment approved for ${job.job_no}`, 'success')}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-[#15803d] hover:bg-[#16a34a] hover:text-white transition-all">\u2713 Approve</button>
                        <button type="button" onClick={() => showToast(`Query raised for ${job.job_no}`, 'info')}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#fef2f2] border border-[#fecaca] text-[#991b1b] hover:bg-[#dc2626] hover:text-white transition-all">Query</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-[#8a96a8]">No payments pending approval right now.</div>
        )}
      </div>
    </div>
  )
}
