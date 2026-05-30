import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStageName, isEtaThisWeek } from '../utils/jobHelpers'

function classNames(...xs) { return xs.filter(Boolean).join(' ') }

function normalizeMetaTs(ts) {
  if (!ts) return null
  const n = Number(ts)
  if (!Number.isFinite(n)) return null
  return n < 1e12 ? n * 1000 : n
}

function timeAgo(ts) {
  const ms = normalizeMetaTs(ts)
  if (!ms) return '—'
  const diff = Math.max(0, Date.now() - ms)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function dayLabel(days) {
  if (days === null || days === undefined) return 'No ETA'
  if (days < 0) return `${Math.abs(days)}d expired`
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

function progressColor(stage) {
  const s = Number(stage) || 0
  if (s <= 3) return 'bg-red-600'
  if (s <= 6) return 'bg-amber-500'
  if (s <= 9) return 'bg-blue-600'
  return 'bg-green-600'
}

function KpiCard({ label, value, hint, tone, icon }) {
  const tones = { blue: 'text-blue-600', red: 'text-red-600', amber: 'text-amber-600', green: 'text-green-600', violet: 'text-violet-600' }
  return (
    <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl p-5 shadow-sm hover:shadow-md hover:border-[#d0d6e0] transition-all">
      <p className="text-xs font-medium text-[#8a96a8] mb-2">{label}</p>
      <p className={classNames('text-2xl font-extrabold leading-none', tones[tone] || tones.blue)}>{value}</p>
      {hint && <p className="text-xs text-[#8a96a8] mt-1.5">{hint}</p>}
      {icon && <div className={classNames('absolute right-3 top-1/2 -translate-y-1/2 text-3xl opacity-[0.08]', tones[tone] || tones.blue)}>{icon}</div>}
    </div>
  )
}

function TowerCard({ title, subtitle, children }) {
  return (
    <section className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between gap-3 bg-white">
<div className="text-sm font-bold text-[#1a2233] truncate">{title}</div>
        {subtitle && <div className="text-xs text-[#8a96a8] shrink-0">{subtitle}</div>}
      </div>
      {children}
    </section>
  )
}

function EmptyTowerState({ children }) {
  return <div className="px-4 py-8 text-sm text-center text-[#8a96a8]">{children}</div>
}

function RiskBadge({ tone = 'blue', children }) {
  const tones = {
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    green: 'bg-green-100 text-green-800',
    blue: 'bg-blue-100 text-blue-800',
    violet: 'bg-violet-100 text-violet-800',
  }
  return <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap', tones[tone] || tones.blue)}>{children}</span>
}

function TodayPriorityQueue({ items, profiles, onOpen }) {
  const nav = useNavigate()
  const modeChip = (m) => {
    if (m === 'Air') return { text: 'Air', cls: 'bg-[#f5f3ff] text-[#5b21b6] border border-[#ddd6fe]' }
    if (m === 'BPT/MBPT') return { text: 'BPT', cls: 'bg-purple-100 text-purple-800 border border-[#ddd6fe]' }
    if (m === 'Sea LCL') return { text: 'LCL', cls: 'bg-[#f0fdfa] text-[#0f766e] border border-[#99f6e4]' }
    if (m === 'Sea FCL') return { text: 'FCL', cls: 'bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]' }
    return { text: m || '—', cls: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]' }
  }
  const formatDate = (d) => { if (!d) return '—'; const x = new Date(d); return `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}` }
  return (
    <TowerCard title="Priority Queue" subtitle="Urgent and high-risk shipments">
      {items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-xs">
            <thead className="bg-[#f8f9fb] text-[#8a96a8]">
              <tr>
                <th className="w-[14%] text-left px-4 py-3 font-semibold uppercase tracking-wide text-xs">Job No.</th>
                <th className="w-[22%] text-left px-4 py-3 font-semibold uppercase tracking-wide text-xs">Client / Goods</th>
                <th className="w-[16%] text-left px-4 py-3 font-semibold uppercase tracking-wide text-xs">Progress</th>
                <th className="w-[10%] text-left px-4 py-3 font-semibold uppercase tracking-wide text-xs">Mode</th>
                <th className="w-[14%] text-left px-4 py-3 font-semibold uppercase tracking-wide text-xs">ETA</th>
                <th className="w-[24%] text-left px-4 py-3 font-semibold uppercase tracking-wide text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ job, issue, tone }) => {
                const mc = modeChip(job.mode)
                const stageName = getStageName(Number(job.stage) || 0)
                return (
                <tr key={job.id} onClick={() => onOpen(job)} className="border-t border-[#e2e6ed] hover:bg-[#e8eef8] cursor-pointer">
                  <td className="px-4 py-2 font-extrabold text-[#1a4fa0] font-mono truncate">{job.job_no || '—'}</td>
                  <td className="px-4 py-2 text-[#4a5568] truncate" title={`${job.client || ''} — ${job.goods || ''}`}>{job.client || '—'}<span className="text-xs text-[#8a96a8] ml-1">{job.goods ? `· ${String(job.goods).slice(0,18)}` : ''}</span></td>
                  <td className="px-4 py-2"><RiskBadge tone={tone}>{stageName}</RiskBadge></td>
                  <td className="px-4 py-2"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${mc.cls}`}>{mc.text}</span></td>
                  <td className="px-4 py-2 font-mono text-xs text-[#8a96a8]">{formatDate(job.eta)}</td>
                  <td className="px-4 py-2 text-xs text-[#1a2233] truncate" title={issue}>{issue}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      ) : <EmptyTowerState>No urgent operational actions right now.</EmptyTowerState>}
      {items.length > 0 && (
        <button type="button" onClick={() => nav('/admin?tab=jobs')}
          className="w-full px-4 py-2.5 text-xs font-semibold text-[#1a4fa0] hover:text-[#153d82] hover:bg-[#e8eef8] border-t border-[#e2e6ed] text-center transition-colors">View all jobs &rarr;</button>
      )}
    </TowerCard>
  )
}

function FreeDaysRiskPanel({ items, onOpen }) {
  return (
    <TowerCard title="Free Days Risk" subtitle="Detention watch">
      {items.length ? items.map(({ job, days, tone }) => (
        <button key={job.id} type="button" onClick={() => onOpen(job)} className="w-full px-4 py-3 border-t border-[#e2e6ed] text-left grid grid-cols-[1fr_auto] gap-3 hover:bg-[#e8eef8]">
          <span className="min-w-0">
            <span className="block text-sm font-bold text-[#1a2233] truncate">{job.job_no || '—'} · {job.client || '—'}</span>
            <span className="block text-xs text-[#8a96a8] truncate">{job.containers || 'No containers'} · {job.cfs_name || 'CFS pending'}</span>
          </span>
          <RiskBadge tone={tone}>{dayLabel(days)}</RiskBadge>
        </button>
      )) : <EmptyTowerState>No free-day risks in the active list.</EmptyTowerState>}
    </TowerCard>
  )
}

function StageBottlenecks({ items, maxCount, onStage }) {
  return (
    <TowerCard title="Stage Bottlenecks" subtitle="Click to filter">
      {items.length ? items.map(({ stage, count }) => {
        const pct = maxCount ? Math.max(8, Math.round((count / maxCount) * 100)) : 0
        return (
          <button key={stage} type="button" onClick={() => onStage(String(stage))} className="w-full px-4 py-3 border-t border-[#e2e6ed] text-left hover:bg-[#e8eef8]">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-sm font-semibold text-[#1a2233] truncate">{getStageName(stage)}</span>
              <span className="text-xs text-[#8a96a8]">{count} jobs</span>
            </div>
<div className="h-2 bg-[#e2e6ed] border border-[#e2e6ed] rounded-full overflow-hidden">
              <div className={classNames('h-full rounded-full', progressColor(stage))} style={{ width: `${pct}%` }} />
            </div>
          </button>
        )
      }) : <EmptyTowerState>No bottlenecks detected.</EmptyTowerState>}
    </TowerCard>
  )
}

function StaleUpdatesPanel({ items, onOpen }) {
  return (
    <TowerCard title="Stale Updates" subtitle="No update in 24h+">
      {items.length ? items.map(({ job, hours, tone }) => (
        <button key={job.id} type="button" onClick={() => onOpen(job)} className="w-full px-4 py-3 border-t border-[#e2e6ed] text-left grid grid-cols-[1fr_auto] gap-3 hover:bg-[#e8eef8]">
          <span className="min-w-0">
            <span className="block text-sm font-bold text-[#1a2233] truncate">{job.job_no || '—'} · {job.client || '—'}</span>
            <span className="block text-xs text-[#8a96a8] truncate">{getStageName(Number(job.stage) || 0)}</span>
          </span>
          <RiskBadge tone={tone}>{hours >= 48 ? `${Math.floor(hours / 24)} days` : `${hours} hours`}</RiskBadge>
        </button>
      )) : <EmptyTowerState>All active jobs have recent updates.</EmptyTowerState>}
    </TowerCard>
  )
}

function EmployeeAccountability({ items }) {
  return (
    <TowerCard title="Employee Accountability" subtitle="Workload snapshot">
      {items.length ? items.map((x) => (
        <div key={x.name} className="px-4 py-3 border-t border-[#e2e6ed] grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
          <div className="text-sm font-bold text-[#1a2233] truncate">{x.name}</div>
          <div className="text-xs text-[#8a96a8] text-right">{x.active} active</div>
          <div className="text-xs text-[#8a96a8] text-right">{x.urgent} urgent</div>
          <RiskBadge tone={x.stale > 1 ? 'red' : x.stale ? 'amber' : 'green'}>{x.stale} stale</RiskBadge>
        </div>
      )) : <EmptyTowerState>No assigned active jobs yet.</EmptyTowerState>}
    </TowerCard>
  )
}

function ControlTowerSection({ jobs, profiles, currentUserName, selectedJob, onOpenJob, onStageFilter, showToast }) {
  const navigate = useNavigate()
  const { user, profile } = { user: null, profile: {} }
  const [filterStage, setFilterStage] = useState(null)
  const isAdmin = profile?.role === 'admin'
  const canUpdateStage = true

  const stats = useMemo(() => ({
    active: jobs?.length || 0,
    urgent: jobs?.filter(j => String(j.priority || '').toLowerCase() === 'urgent').length || 0,
    etasWeek: jobs?.filter(j => isEtaThisWeek(j.eta)).length || 0,
    freeDaysAtRisk: 0,
    paymentsPending: 0,
    stale: 0,
  }), [jobs])

  const controlTower = useMemo(() => ({
    priorityItems: [],
    stageBottlenecks: [],
    stageMaxCount: 0,
    staleUpdates: [],
    employeeAccountability: [],
  }), [])

  const handleDeleteJob = async (job) => {}

  const refreshJobs = () => {}

  return (
    <>
      {selectedJob ? (
        <JobDetailView
          job={selectedJob} profiles={profiles} currentUserName={currentUserName}
          isAdmin={isAdmin} canUpdateStage={canUpdateStage}
          onBack={() => onOpenJob(null)} onSaved={refreshJobs} toast={showToast}
          onDelete={() => handleDeleteJob(selectedJob)}
        />
      ) : (
      <>
        <div className="mb-3 text-[20px] font-semibold leading-tight text-[#1a2233]">
          {getGreeting()}, <span className="font-semibold text-[#1a2233]">{profile?.name || 'there'}</span>
        </div>

        {/* Alert Banners */}
        {(stats.freeDaysAtRisk > 0 || stats.urgent > 0) && (
          <div className="flex gap-4 mb-4">
            {stats.freeDaysAtRisk > 0 && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#fffbeb] border-[1.5px] border-[#fde68a] text-[#92400e] text-sm flex-1">
                <span className="text-lg">&#9888;</span>
                <span className="flex-1">{stats.freeDaysAtRisk} job(s) approaching free day limit &mdash; detention risk increasing.</span>
                <button type="button" onClick={() => navigate('/admin?tab=jobs')}
                  className="h-8 px-3 text-xs font-semibold rounded-lg bg-[#92400e] text-white hover:bg-[#78350f] transition-colors shrink-0">View Jobs</button>
              </div>
            )}
            {stats.urgent > 0 && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#fef2f2] border-[1.5px] border-[#fecaca] text-[#991b1b] text-sm flex-1">
                <span className="text-lg">&#9888;</span>
                <span className="flex-1">{stats.urgent} urgent job(s) have not been updated in 48+ hours.</span>
                <button type="button" onClick={() => navigate('/admin?tab=jobs')}
                  className="h-8 px-3 text-xs font-semibold rounded-lg bg-[#991b1b] text-white hover:bg-[#7f1d1d] transition-colors shrink-0">Review Now</button>
              </div>
            )}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
          <KpiCard label="Active Jobs" value={stats.active} hint="In progress" tone="blue" icon="A" />
          <KpiCard label="Urgent" value={stats.urgent} hint="Needs attention" tone="red" icon="!" />
          <KpiCard label="ETAs This Week" value={stats.etasWeek} hint="Upcoming arrivals" tone="amber" icon="~" />
          <KpiCard label="Free Days At Risk" value={stats.freeDaysAtRisk} hint="0-2 days left" tone="red" icon="D" />
          <KpiCard label="Payment Blocks" value={stats.paymentsPending} hint="Duty / CFS queue" tone="violet" icon="Rs" />
          <KpiCard label="Stale Updates" value={stats.stale} hint="Needs follow-up" tone="amber" icon="24" />
        </div>

        {/* Two-column: Priority Queue + Right sidebar */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 mb-4">
          {/* Priority Queue */}
          <TodayPriorityQueue items={controlTower.priorityItems} profiles={profiles} onOpen={onOpenJob} />

          {/* Right Column: Team Activity + Pending Approvals */}
          <div className="flex flex-col gap-4">
            {/* Team Activity */}
            <TowerCard title="Team Activity" subtitle="Real-time updates from staff">
              <div className="px-4 py-3 border-t border-[#e2e6ed]">
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 ml-auto">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />Live
                  </span>
                </div>
                <div className="space-y-3">
                  {[{dot:'bg-green-500',txt:'Trupti updated stage for J-00068',time:'2 min ago'},{dot:'bg-blue-500',txt:'Akshyani uploaded BL for J-00072',time:'15 min ago'},{dot:'bg-amber-500',txt:'Kiran submitted CFS payment \u20B945,000',time:'1 hr ago'},{dot:'bg-purple-500',txt:'DPM generated E-Way Bill',time:'2 hrs ago'},{dot:'bg-green-500',txt:'Anil approved duty payment for J-00065',time:'3 hrs ago'}].map((a,i)=>(
                    <div key={i} className="flex items-start gap-2.5">
                      <span className={`w-2 h-2 rounded-full ${a.dot} mt-1.5 shrink-0`} />
                      <div className="min-w-0">
                        <p className="text-sm text-[#1a2233]">{a.txt}</p>
                        <p className="text-xs text-[#8a96a8] font-mono mt-0.5">{a.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TowerCard>

            {/* Pending Approvals */}
            <TowerCard title="Pending Approvals" subtitle="CFS payments awaiting Jose">
              <div className="px-4 py-3 border-t border-[#e2e6ed]">
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]">{stats.paymentsPending}</span>
                </div>
                {controlTower.priorityItems.filter(p => [6,8].includes(Number(p.job.stage))).length > 0 ? (
                  <div className="space-y-2">
                    {controlTower.priorityItems.filter(p => [6,8].includes(Number(p.job.stage))).slice(0,4).map(({job}) => (
                      <div key={job.id} className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-[#f8f9fb] border border-[#e2e6ed]">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#1a4fa0] font-mono">{job.job_no}</p>
                          <p className="text-xs text-[#8a96a8] truncate">{job.cfs_name || '—'} &middot; {job.assigned_to ? (profiles[job.assigned_to] || '—') : '—'}</p>
                          {job.cfs_amount && <p className="text-xs font-semibold text-[#1a2233] mt-0.5">&#x20B9;{Number(job.cfs_amount).toLocaleString()}</p>}
                        </div>
                        <button type="button" onClick={() => showToast(`Payment approved for ${job.job_no}`, 'success')}
                          className="h-7 px-2.5 text-xs font-semibold rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-[#15803d] hover:bg-[#16a34a] hover:text-white transition-all shrink-0">&#10003; Approve</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#8a96a8] text-center py-4">No pending approvals right now.</p>
                )}
                {stats.paymentsPending > 0 && (
                  <button type="button" onClick={() => navigate('/admin?tab=payments')}
                    className="w-full mt-3 pt-3 border-t border-[#e2e6ed] text-xs font-semibold text-[#1a4fa0] hover:text-[#153d82] text-center">View all {stats.paymentsPending} pending payments &rarr;</button>
                )}
              </div>
            </TowerCard>
          </div>
        </div>

        {/* Three-column: Bottlenecks + Stale Updates + Accountability */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
          <StageBottlenecks items={controlTower.stageBottlenecks} maxCount={controlTower.stageMaxCount} onStage={(stage) => { onStageFilter(stage); navigate('/admin?tab=jobs') }} />
          <StaleUpdatesPanel items={controlTower.staleUpdates} onOpen={onOpenJob} />
          <EmployeeAccountability items={controlTower.employeeAccountability} />
        </div>
      </>
      )}
    </>
  )
}

export default ControlTowerSection
