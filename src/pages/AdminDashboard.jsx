import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { getStageName, isEtaThisWeek } from '../utils/jobHelpers'
import ControlTowerSection from '../components/ControlTower'
import JobDetailView from '../components/JobDetailView'
import DocumentsSection from '../components/DocumentsSection'
import ContainerTrackingSection from '../components/ContainerTrackingSection'
import PaymentsSection from '../components/PaymentsSection'
import ComplianceSection from '../components/ComplianceSection'
import OCRSection from '../components/OCRSection'
import CreateJob from './CreateJob'

const NAV_SECTIONS = [
  {
    label: 'OPERATIONS',
    items: [
      { id: 'overview', label: 'Control Tower', icon: '⊞' },
      { id: 'jobs', label: 'All Jobs', icon: '≡' },
      { id: 'containers', label: 'Container Tracking', icon: '⊟' },
      { id: 'documents', label: 'Documents', icon: '📄' },
    ]
  },
  {
    label: 'FINANCE',
    items: [
      { id: 'payments', label: 'Payments', icon: '₹' },
    ]
  },
  {
    label: 'COMPLIANCE',
    items: [
      { id: 'compliance', label: 'BIS & Licences', icon: '✓' },
    ]
  },
  {
    label: 'AI TOOLS',
    items: [
      { id: 'ocr', label: 'OCR Extract', icon: '✦' },
    ]
  },
]

const NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items)

const STAGE_OPTIONS = [
  { value: '', label: 'All stages' },
  ...Array.from({ length: 11 }).map((_, i) => ({
    value: String(i),
    label: `${i} — ${getStageName(i)}`,
  })),
]

const PRIORITY_OPTIONS = [
  { value: '', label: 'All priority' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
]

const MODE_OPTIONS = [
  { value: '', label: 'All modes' },
  { value: 'Sea FCL', label: 'Sea FCL' },
  { value: 'Sea LCL', label: 'Sea LCL' },
  { value: 'Air', label: 'Air' },
  { value: 'BPT/MBPT', label: 'BPT/MBPT' },
]

const STAGE_LIST = Array.from({ length: 11 }).map((_, i) => ({
  value: i,
  label: getStageName(i),
}))

const FIELD_LABELS = {
  job_no: 'Job Number',
  client: 'Client',
  mode: 'Mode',
  bl_no: 'BL Number',
  containers: 'Containers',
  shipping_line: 'Shipping Line',
  vessel: 'Vessel / Flight',
  eta: 'ETA',
  cfs_name: 'CFS Name',
  be_no: 'BE Number',
  be_date: 'BE Date',
  hs_code: 'HS Code',
  container_size: 'Container Size',
  rms_status: 'RMS Status',
  bg_required: 'BG Required',
  cfs_amount: 'CFS Amount',
  destination: 'Destination',
  priority: 'Priority',
  goods: 'Goods',
  free_days: 'Free Days',
  detention_risk: 'Detention Risk',
  stage: 'Current Stage',
  delay_reason: 'Delay Reason',
  notes: 'Notes',
  assigned_to: 'Assigned To',
  created_by: 'Created By',
  created_at: 'Created At',
  updated_at: 'Updated At',
}

const FIELD_PERMS = {
  job_no: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  client: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  mode: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  bl_no: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  containers: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  shipping_line: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  vessel: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  eta: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  cfs_name: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  be_no: { can: ['Akshyani', 'Trupti'] },
  be_date: { can: ['Akshyani', 'Trupti'] },
  container_size: { can: ['Uphadhya', 'Akshyani', 'Durgesh'] },
  hs_code: { can: ['Akshyani', 'Trupti', 'Durgesh'] },
  rms_status: { can: ['Akshyani', 'Trupti', 'Durgesh'] },
  bg_required: { can: ['Anil', 'Akshyani', 'Durgesh'] },
  cfs_amount: { can: ['Kiran', 'Virendra', 'Mayur', 'Anil'] },
  destination: { can: 'all' },
  priority: { can: 'all' },
  goods: { can: 'all' },
  free_days: { can: 'all' },
  detention_risk: { can: 'all' },
  delay_reason: { can: 'all' },
  notes: { can: 'all' },
  stage: { can: ['Trupti', 'Uphadhya'] },
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function daysOldFrom(value) {
  if (!value) return 0
  return Math.floor(Math.max(0, Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24))
}

function daysUntilDate(value) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function freeDaysLeft(job) {
  const etaOffset = daysUntilDate(job.eta)
  if (etaOffset === null) return null
  return etaOffset + (Number(job.free_days) || 0)
}

function lastUpdateAgeHours(job) {
  const ts = new Date(job.updated_at || job.created_at || 0).getTime()
  if (!ts) return 9999
  return Math.floor(Math.max(0, Date.now() - ts) / (1000 * 60 * 60))
}

function dayLabel(days) {
  if (days === null || days === undefined) return 'No ETA'
  if (days < 0) return `${Math.abs(days)}d expired`
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

function formatDateSlash(value) {
  if (!value) return '—'
  const d = new Date(value)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function displayValue(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

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
  return { text: displayValue(risk), cls: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]' }
}

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

function formatAccountabilityWhen(ts) {
  const ms = normalizeMetaTs(ts)
  if (!ms) return '-'
  const diff = Math.max(0, Date.now() - ms)
  const minutes = Math.floor(diff / (1000 * 60))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  return new Date(ms).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function progressColor(stage) {
  const s = Number(stage) || 0
  if (s <= 3) return 'bg-red-600'
  if (s <= 6) return 'bg-amber-500'
  if (s <= 9) return 'bg-blue-600'
  return 'bg-green-600'
}

function JobCard({ job, profiles, onOpen, onDelete }) {
  const priority = priorityChip(job.priority)
  const mode = modeChip(job.mode)
  const rms = rmsChip(job.rms_status)
  const risk = riskChip(job.detention_risk)
  const assignedName = job.assigned_to ? profiles[job.assigned_to] ?? '—' : '—'
  const daysOld = daysOldFrom(job.created_at || job.updated_at)
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
      <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[#8a96a8]">{getStageName(Number(job.stage) || 0)}</span>
              <span className="text-xs text-[#8a96a8]">{Math.round(((Number(job.stage)||0)/10)*100)}%</span>
            </div>
            <div className="h-1.5 bg-[#e2e6ed] rounded-full overflow-hidden">
              <div className="h-full bg-[#1a4fa0] rounded-full" style={{ width: `${Math.round(((Number(job.stage)||0)/10)*100)}%` }} />
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

export default function AdminDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile } = useAuth()
  const [jobs, setJobs] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterMode, setFilterMode] = useState('')
  const [selectedJob, setSelectedJob] = useState(null)
  const [showCreateJob, setShowCreateJob] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toastState, setToastState] = useState(null)

  const activeNav = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('tab') || 'overview'
  }, [location.search])

  useEffect(() => {
    if (location.state?.tab) {
      navigate(`/admin?tab=${location.state.tab}`, { replace: true })
      window.history.replaceState({}, '')
    }
  }, [])

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoadingJobs(true)
      const [{ data: jobsData }, { data: profilesData }] = await Promise.all([
        supabase.from('jobs').select('*').order('updated_at', { ascending: false }),
        supabase.from('profiles').select('id, name'),
      ])
      if (!mounted) return
      setJobs(jobsData ?? [])
      const map = {}
      ;(profilesData ?? []).forEach((p) => { map[p.id] = p.name })
      setProfiles(map)
      setLoadingJobs(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  const showToast = (message, type = 'success') => {
    const id = Date.now()
    setToastState({ id, message, type })
    window.setTimeout(() => setToastState((prev) => (prev?.id === id ? null : prev)), 2800)
  }

  const stats = useMemo(() => {
    const active = jobs.filter((j) => j.stage !== 10)
    const urgent = jobs.filter((j) => String(j.priority||'').toLowerCase() === 'urgent' && j.stage !== 10)
    const etasWeek = jobs.filter((j) => isEtaThisWeek(j.eta) && j.stage !== 10)
    const paymentsPending = active.filter((j) => [6, 8].includes(Number(j.stage)))
    const freeDaysAtRisk = active.filter((j) => {
      const left = freeDaysLeft(j)
      return left !== null && left <= 2
    })
    const stale = active.filter((j) => {
      const hours = lastUpdateAgeHours(j)
      return String(j.priority || '').toLowerCase() === 'urgent' ? hours >= 12 : hours >= 24
    })
    return {
      active: active.length,
      urgent: urgent.length,
      etasWeek: etasWeek.length,
      paymentsPending: paymentsPending.length,
      freeDaysAtRisk: freeDaysAtRisk.length,
      stale: stale.length,
    }
  }, [jobs])

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase()
    const pRank = { urgent: 0, high: 1, normal: 2 }
    return (jobs || [])
      .filter((j) => {
        if (q) {
          const num = (j.job_no || '').replace(/^j-/i, '').toLowerCase()
          if (!num.startsWith(q)) return false
        }
        if (filterStage !== '' && String(j.stage) !== String(filterStage)) return false
        if (filterPriority && String(j.priority||'').toLowerCase() !== filterPriority) return false
        if (filterMode && String(j.mode||'') !== filterMode) return false
        return true
      })
      .sort((a, b) => {
        const pa = pRank[String(a.priority||'normal').toLowerCase()] ?? 3
        const pb = pRank[String(b.priority||'normal').toLowerCase()] ?? 3
        if (pa !== pb) return pa - pb
        return new Date(b.updated_at||b.created_at||0).getTime() - new Date(a.updated_at||a.created_at||0).getTime()
      })
  }, [jobs, search, filterStage, filterPriority, filterMode])

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.replace('/login') }
  const handleNavClick = (id) => {
    navigate(`/admin?tab=${id}`, { replace: true })
    setSelectedJob(null)
    setSearch('')
    setFilterStage('')
    setFilterPriority('')
    setFilterMode('')
  }

  const handleDeleteJob = async (job) => {
    if (!window.confirm(`Delete job ${job.job_no || ''}? This cannot be undone.`)) return

    try {
      // 1. Delete related documents from storage (best-effort — RLS may block)
      try {
        const { data: docs } = await supabase.from('documents').select('file_path').eq('job_id', job.id)
        if (docs && docs.length > 0) {
          const filePaths = docs.map((d) => d.file_path).filter(Boolean)
          if (filePaths.length > 0) {
            await supabase.storage.from('job-documents').remove(filePaths)
          }
        }
      } catch { /* storage delete is best-effort */ }

      // 2. Delete document records
      await supabase.from('documents').delete().eq('job_id', job.id)

      // 3. Delete job extractions
      await supabase.from('job_extractions').delete().eq('job_id', job.id)

      // 4. Delete the job itself — use .select() to verify the row was actually removed
      const { data: deleted, error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', job.id)
        .select()

      if (error) {
        showToast(error.message || 'Delete failed.', 'error')
        return
      }

      if (!deleted || deleted.length === 0) {
        showToast(
          'Delete blocked by database permissions. Apply backend/src/db/migrations/002_jobs_rls.sql in Supabase SQL Editor.',
          'error'
        )
        return
      }

      // 5. Update frontend state — remove from jobs list, clear selection
      setJobs((prev) => prev.filter((j) => j.id !== job.id))
      if (selectedJob?.id === job.id) setSelectedJob(null)
      showToast('Job deleted.', 'success')
    } catch (e) {
      showToast(e?.message || 'Delete failed.', 'error')
    }
  }

  const refreshJobs = async () => {
    const { data: jobsData } = await supabase.from('jobs').select('*').order('updated_at', { ascending: false })
    setJobs(jobsData ?? [])
    if (selectedJob?.id) {
      const refreshed = (jobsData ?? []).find((j) => j.id === selectedJob.id)
      if (refreshed) setSelectedJob(refreshed)
    }
  }

  const currentUserName = profile?.name || '—'
  const isAdmin = profile?.role === 'admin'
  const canUpdateStage = isAdmin || ['Trupti', 'Uphadhya'].includes(currentUserName)
  const pageTitle = NAV_ITEMS.find((n) => n.id === activeNav)?.label ?? 'Control Tower'
  const jobWorkspace = (
    <>
      {!selectedJob && (
        <div className="bg-[#f8f9fb] border-b border-[#e2e6ed] rounded-xl shadow-sm mb-2">
          <div className="p-2 flex flex-wrap gap-1 items-center">
            <div className="flex items-center h-6 px-2 bg-[#f8f9fb] border-[1.5px] border-[#e2e6ed] rounded-lg flex-1 min-w-[180px] max-w-[240px]">
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by job number..."
                className="w-full bg-transparent outline-none text-xs text-[#1a2233] placeholder:text-[#8a96a8]" />
            </div>
            <span className="text-xs text-[#8a96a8] whitespace-nowrap">{filteredJobs.length} shown</span>
            <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} className="h-6 px-2 text-xs bg-white border-[1.5px] border-[#e2e6ed] rounded-lg text-[#4a5568] outline-none focus:border-[#1a4fa0]">
              {STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="h-6 px-2 text-xs bg-white border-[1.5px] border-[#e2e6ed] rounded-lg text-[#4a5568] outline-none focus:border-[#1a4fa0]">
              {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} className="h-6 px-2 text-xs bg-white border-[1.5px] border-[#e2e6ed] rounded-lg text-[#4a5568] outline-none focus:border-[#1a4fa0]">
              {MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button type="button" onClick={() => { setSearch(''); setFilterStage(''); setFilterPriority(''); setFilterMode('') }}
              className="h-6 px-2.5 text-xs rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8]">
              Clear
            </button>
          </div>
        </div>
      )}

      {loadingJobs ? (
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-10 flex justify-center">
          <div className="h-9 w-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : selectedJob ? (
        <JobDetailView
          job={selectedJob} profiles={profiles} currentUserName={currentUserName}
          isAdmin={isAdmin} canUpdateStage={canUpdateStage}
          onBack={() => setSelectedJob(null)} onSaved={refreshJobs} toast={showToast}
          onDelete={() => handleDeleteJob(selectedJob)}
        />
      ) : filteredJobs.length === 0 ? (
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-10 text-center text-[#8a96a8]">
          No jobs match your search/filters.
        </div>
      ) : (
        <div>
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} profiles={profiles}
              onOpen={() => setSelectedJob(job)} />
          ))}
        </div>
      )}
    </>
  )

  return (
    <div className="min-h-screen flex bg-[#f4f6f9] text-[14px]">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={[
        'w-[230px] bg-[#1a4fa0] flex flex-col h-screen fixed left-0 top-0 z-50 transition-transform duration-300',
        'lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}>

        <div className="px-5 py-4 border-b border-white/15 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white text-[#1a4fa0] flex items-center justify-center font-extrabold text-sm">JDS</div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">JDS Logistics</div>
            <div className="text-xs text-white/60 truncate">Operations Portal</div>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-white/70 hover:text-white p-1">✕</button>
        </div>
        <nav className="flex-1 overflow-y-auto py-1">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="px-4 pt-4 pb-1 text-[10px] font-bold text-white/45 uppercase tracking-[0.1em]">
                {section.label}
              </div>
              {section.items.map((item) => {
                const isActive = activeNav === item.id
                let badge = null
                if (item.id === 'jobs' && stats?.active > 0)
                  badge = <span className="ml-auto bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{stats.active}</span>
                if (item.id === 'containers' && stats?.freeDaysAtRisk > 0)
                  badge = <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{stats.freeDaysAtRisk}</span>
                if (item.id === 'payments' && stats?.paymentsPending > 0)
                  badge = <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{stats.paymentsPending}</span>
                if (item.id === 'compliance')
                  badge = <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">2</span>
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { handleNavClick(item.id); setSidebarOpen(false) }}
                    className={[
                      'w-full text-left px-5 py-2.5 text-sm flex items-center gap-2.5 border-l-2 transition-colors',
                      isActive
                        ? 'bg-white/15 text-white border-white font-semibold'
                        : 'text-white/70 hover:bg-white/10 hover:text-white border-transparent'
                    ].join(' ')}
                  >
                    <span className="w-4 text-center shrink-0 text-sm opacity-90">{item.icon}</span>
                    <span className="truncate flex-1">{item.label}</span>
                    {item.id === 'overview' && isActive
                      ? <span className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                      : badge
                    }
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/15 px-5 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-white/20 border-2 border-white/30 text-white flex items-center justify-center text-xs font-bold">
            {(profile?.name || 'A').slice(0,2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">{profile?.name || 'Admin'}</div>
            <div className="text-xs text-white/55 truncate">Administrator</div>
          </div>
          <span className="ml-auto w-2 h-2 rounded-full bg-green-400" title="Live" />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden lg:ml-[230px] bg-[#f4f6f9]">
        <header className="h-[60px] bg-white border-b border-[#e2e6ed] shadow-sm px-4 sm:px-6 flex items-center gap-3 flex-shrink-0">

          <button type="button" onClick={() => setSidebarOpen(true)}
            className="lg:hidden flex flex-col justify-center items-center w-9 h-9 rounded-lg hover:bg-[#f4f6f9] gap-1.5 shrink-0"
            aria-label="Open menu">
            <span className="w-5 h-0.5 bg-[#1a2233] rounded-full" />
            <span className="w-5 h-0.5 bg-[#1a2233] rounded-full" />
            <span className="w-3.5 h-0.5 bg-[#1a2233] rounded-full" />
          </button>

          <div className="min-w-0">
            <div className="text-[17px] font-bold text-[#1a2233] truncate">{pageTitle}</div>
            <div className="text-sm text-[#8a96a8] truncate">Live operations overview</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setShowCreateJob(true)}
              className="h-9 px-3 sm:px-4 text-sm rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold">
              <span className="hidden sm:inline">+ Create Job</span>
              <span className="sm:hidden">+</span>
            </button>
            <button type="button" onClick={handleLogout}
              className="h-9 px-3 sm:px-4 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-red-600 hover:bg-[#fef2f2] hover:border-red-300 font-semibold">
              <span className="hidden sm:inline">Logout</span>
              <span className="sm:hidden">⏻</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeNav === 'overview' && (
            selectedJob ? (
              <JobDetailView
                job={selectedJob} profiles={profiles} currentUserName={currentUserName}
                isAdmin={isAdmin} canUpdateStage={canUpdateStage}
                onBack={() => setSelectedJob(null)} onSaved={refreshJobs} toast={showToast}
                onDelete={() => handleDeleteJob(selectedJob)}
              />
            ) : (
              <ControlTowerSection
                jobs={jobs} profiles={profiles} currentUserName={currentUserName}
                selectedJob={selectedJob}
                onOpenJob={setSelectedJob}
                onStageFilter={(stage) => { setFilterStage(stage); navigate('/admin?tab=jobs') }}
                showToast={showToast}
              />
            )
          )}

          {activeNav === 'jobs' && jobWorkspace}

          {activeNav === 'documents' && (
            <DocumentsSection jobs={jobs} profiles={profiles} currentUserName={currentUserName} showToast={showToast} />
          )}

          {activeNav === 'containers' && (
            <ContainerTrackingSection showToast={showToast} jobs={jobs} />
          )}

          {activeNav === 'payments' && (
            <PaymentsSection jobs={jobs} profiles={profiles} showToast={showToast} getStageName={getStageName} />
          )}

          {activeNav === 'compliance' && (
            <ComplianceSection showToast={showToast} />
          )}

          {activeNav === 'ocr' && (
            <OCRSection jobs={jobs} currentUserName={currentUserName} showToast={showToast} user={user} profile={profile} />
          )}

          {activeNav !== 'overview' && activeNav !== 'jobs' && activeNav !== 'documents' && activeNav !== 'containers' && activeNav !== 'ocr' && activeNav !== 'payments' && activeNav !== 'compliance' && (
            <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-10 text-center text-[#8a96a8]">
              Coming soon
            </div>
          )}
        </main>
      </div>

      {toastState && (
        <div className={classNames('fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-lg',
          toastState.type === 'success' && 'bg-[#16a34a] text-white rounded-xl',
          toastState.type === 'error' && 'bg-[#dc2626] text-white rounded-xl',
          toastState.type === 'info' && 'bg-[#1a2233] text-white rounded-xl')}>
          {toastState.message}
        </div>
      )}

      {showCreateJob && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl border border-[#e2e6ed]">
            <CreateJob
              isModal
              onCancel={() => setShowCreateJob(false)}
              onCreated={async () => {
                setShowCreateJob(false)
                await refreshJobs()
                showToast('Job created.', 'success')
              }}
            />
          </div>
        </div>
      )}

    </div>
  )
}
