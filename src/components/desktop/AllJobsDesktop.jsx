import { useState } from 'react'

function classNames(...xs) { return xs.filter(Boolean).join(' ') }

function priorityChip(priority) {
  const p = String(priority || 'normal').toLowerCase()
  if (p === 'urgent') return { text: 'Urgent', cls: 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]' }
  if (p === 'high') return { text: 'High', cls: 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]' }
  return { text: 'Normal', cls: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]' }
}

function modeChip(mode) {
  const m = String(mode || '').trim()
  if (m === 'Air') return { text: 'Air', cls: 'bg-[#f5f3ff] text-[#5b21b6] border border-[#ddd6fe]' }
  if (m === 'BPT/MBPT') return { text: 'BPT', cls: 'bg-purple-100 text-purple-800' }
  if (m === 'Sea LCL') return { text: 'LCL', cls: 'bg-[#f0fdfa] text-[#0f766e] border border-[#99f6e4]' }
  if (m === 'Sea FCL') return { text: 'FCL', cls: 'bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]' }
  return { text: m || '—', cls: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]' }
}

function rmsChip(rms) {
  const r = String(rms || '').toLowerCase()
  const map = {
    pending: { text: 'Awaiting', cls: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]' },
    rms: { text: 'RMS OK', cls: 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]' },
    apr: { text: 'APR', cls: 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]' },
    acl: { text: 'ACL', cls: 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]' },
    check: { text: '1st Check', cls: 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]' },
    hold: { text: 'HOLD', cls: 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]' },
  }
  return map[r] || { text: rms ? String(rms).toUpperCase() : '—', cls: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]' }
}

function riskChip(risk) {
  const r = String(risk || '').toLowerCase()
  if (r === 'high') return { text: 'High Risk', cls: 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]' }
  if (r === 'medium') return { text: 'Medium', cls: 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]' }
  if (r === 'low') return { text: 'Low', cls: 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]' }
  return { text: rms || '—', cls: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]' }
}

function timeAgo(ts) {
  if (!ts) return '—'
  const ms = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : new Date(ts).getTime()
  if (!Number.isFinite(ms)) return '—'
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

function JobCard({ job, profiles, onOpen }) {
  const priority = priorityChip(job.priority)
  const mode = modeChip(job.mode)
  const rms = rmsChip(job.rms_status)
  const risk = riskChip(job.detention_risk)
  const assignedName = job.assigned_to ? profiles[job.assigned_to] ?? '—' : '—'
  const daysOld = (() => {
    if (!job.created_at && !job.updated_at) return 0
    return Math.floor(Math.max(0, Date.now() - new Date(job.created_at || job.updated_at).getTime()) / (1000 * 60 * 60 * 24))
  })()
  const meta = job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : null
  const lastUpdatedBy = meta?.updated_by?.by || meta?.stage?.by || meta?.notes?.by || meta?.job_no?.by || null
  const lastUpdatedTs = meta?.updated_by?.ts || meta?.stage?.ts || meta?.notes?.ts || meta?.job_no?.ts || null
  const lastUpdatedName = lastUpdatedBy && profiles[lastUpdatedBy] ? profiles[lastUpdatedBy] : lastUpdatedBy
  const priorityBorder = String(job.priority || '').toLowerCase() === 'urgent' ? 'border-l-red-600'
    : String(job.priority || '').toLowerCase() === 'high' ? 'border-l-amber-500' : 'border-l-blue-600'

  return (
    <div
      role="button" tabIndex={0}
      onClick={(e) => {
        const tag = e.target?.tagName?.toLowerCase?.() || ''
        if (['input','select','textarea','button'].includes(tag)) return
        onOpen()
      }}
      onKeyDown={(e) => {
        const tag = e.target?.tagName?.toLowerCase?.() || ''
        if (['input','select','textarea','button'].includes(tag)) return
        if (e.key === 'Enter') { e.preventDefault(); onOpen() }
      }}
      className={classNames('bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-3 mb-2 cursor-pointer transition-all hover:border-[#d0d6e0] hover:shadow-md border-l-4', priorityBorder)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-[#1a2233] truncate font-mono text-[#1a4fa0]">{job.job_no || '—'}</div>
          <div className="text-xs text-[#4a5568]">{job.client || '—'} <span className="text-[#8a96a8]">· {job.goods || '—'}</span></div>
          <div className="text-xs text-[#8a96a8] font-mono mt-0.5">
            {job.be_no ? `BE:${job.be_no}` : ''}
            {job.bl_no ? `${job.be_no ? ' · ' : ''}BL:${job.bl_no}` : ''}
            {job.containers ? `${job.be_no || job.bl_no ? ' · ' : ''}${(job.containers || '').split(',').map(c => c.trim()).filter(Boolean).join(' · ')}` : ''}
            {!job.be_no && !job.bl_no && !job.containers ? '—' : ''}
          </div>
          <div className="text-xs text-[#8a96a8] mt-0.5">
            {lastUpdatedName || lastUpdatedTs ? (
              <>Last updated by: <span className="text-[#4a5568] font-medium">{lastUpdatedName || '—'}</span> · <span>{lastUpdatedTs ? timeAgo(lastUpdatedTs) : '—'}</span></>
            ) : <span>Last updated by: —</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex flex-wrap justify-end gap-1">
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', priority.cls)}>{priority.text}</span>
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', mode.cls)}>{mode.text}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', rms.cls)}>{rms.text}</span>
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', risk.cls)}>{risk.text}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-[#8a96a8]">
          <span className="text-[#4a5568] font-medium">{assignedName}</span> · {job.destination || '—'} ·{' '}
          <span className={classNames(daysOld >= 4 ? 'text-red-600 font-semibold' : daysOld >= 2 ? 'text-amber-700 font-semibold' : '')}>{daysOld}d old</span>
          {job.delay_reason ? <> · <span className="text-amber-700 font-semibold">{job.delay_reason}</span></> : null}
        </div>
      </div>
    </div>
  )
}

export default function AllJobsDesktop({
  jobs,
  searchQuery,
  setSearchQuery,
  stageFilter,
  setStageFilter,
  priorityFilter,
  setPriorityFilter,
  onOpenJob,
  getStageName,
  canCreateJob,
  onCreateJob,
  profiles,
  currentUserName,
  isAdmin,
  filteredJobs,
  loadingJobs,
  selectedJob,
}) {
  return (
    <div>
      {loadingJobs ? (
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-10 flex justify-center">
          <div className="h-9 w-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-10 text-center text-[#8a96a8]">
          No jobs match your search/filters.
        </div>
      ) : (
        <div>
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} profiles={profiles}
              onOpen={() => onOpenJob(job)} />
          ))}
        </div>
      )}
    </div>
  )
}
