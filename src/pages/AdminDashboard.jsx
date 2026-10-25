import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { getStageName, isEtaThisWeek } from '../utils/jobHelpers'
import lazyPage from '../utils/lazyPage'
import { loadDocs } from '../services/docCache'
import '../industrial/industrial.css'
import { JourneyProvider, useJourney } from '../industrial/JourneyContext'
import { rememberJob } from '../industrial/recentJobs'
import Shell from '../industrial/Shell'
import JobDrawer from '../industrial/JobDrawer'
import { Skeleton } from '../industrial/ui'
import IxTodayPage from '../industrial/pages/TodayPage'
import IxJobsPage from '../industrial/pages/JobsPage'
import IxCustomsPage from '../industrial/pages/CustomsPage'
import { forceRefreshAllContainers } from '../services/tracking/ldbProvider'

// Opened less often (or heavy, like the maps): loaded the first time they are opened
const IxTrucksPage = lazyPage(() => import('../industrial/pages/TrucksPage'))
const IxVesselsPage = lazyPage(() => import('../industrial/pages/VesselsPage'))
const IxHealthPage = lazyPage(() => import('../industrial/pages/HealthPage'))
const ControlTowerSection = lazyPage(() => import('../components/ControlTower'))
const JobDetailView = lazyPage(() => import('../components/JobDetailView'))
const DocumentsSection = lazyPage(() => import('../components/DocumentsSection'))
const ContainerTrackingSection = lazyPage(() => import('../components/ContainerTrackingSection'))
const PaymentsSection = lazyPage(() => import('../components/PaymentsSection'))
const ComplianceSection = lazyPage(() => import('../components/ComplianceSection'))
const SearchPage = lazyPage(() => import('./v2/SearchPage'))
const ClientsPage = lazyPage(() => import('./v2/ClientsPage'))
const DetentionPage = lazyPage(() => import('./v2/DetentionPage'))
const BotPreviewPage = lazyPage(() => import('./v2/BotPreviewPage'))
const CreateJob = lazyPage(() => import('./CreateJob'))

const NAV_SECTIONS = [
  { label: 'TODAY', items: [{ id: 'today', label: 'Today', icon: 'home' }] },
  // in work order (Jose, 25 Oct 2026): the jobs, then where the cargo is as it moves
  // (sea → port → road), the paperwork, money; records and admin last
  { label: 'JOBS', items: [{ id: 'jobs', label: 'All jobs', icon: 'list-details' }] },
  { label: 'TRACKING', items: [
    { id: 'vessels', label: 'Vessels', icon: 'ship' },
    { id: 'containers', label: 'Containers', icon: 'box' },
    { id: 'trucks', label: 'Trucks', icon: 'truck' },
  ] },
  { label: 'CUSTOMS & PAPERS', items: [
    { id: 'customs', label: 'BE & OOC', icon: 'file-certificate' },
    { id: 'documents', label: 'Documents', icon: 'files' },
  ] },
  { label: 'MONEY', items: [
    { id: 'payments', label: 'Payments', icon: 'currency-rupee' },
    { id: 'detention', label: 'Detention', icon: 'clock-exclamation', alert: true },
  ] },
  { label: 'RECORDS', items: [
    { id: 'clients', label: 'Clients', icon: 'users' },
    { id: 'compliance', label: 'BIS & Licences', icon: 'certificate' },
  ] },
  { label: 'ADMIN', items: [
    { id: 'overview', label: 'Team & stages', icon: 'chart-bar' },
    { id: 'bot', label: 'WhatsApp bot', icon: 'brand-whatsapp' },
    { id: 'health', label: 'System health', icon: 'heart-rate-monitor' },
    // reached from Ctrl K → "Look up on ULIP" (Jose, 25 Oct 2026: one search box, not two)
    { id: 'search', label: 'ULIP lookup', icon: 'search', hidden: true },
  ] },
]

// Old page names still work (bookmarks, bell links)
// (the shipment board was removed on 25 Oct 2026: All jobs does the job)
const OLD_TAB_NAMES = { lookup: 'search', 'shipment-tracker': 'jobs', board: 'jobs', 'be-filing': 'customs' }

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
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const ist = new Date(utc + 3600000 * 5.5)
  const hour = ist.getHours()
  if (hour >= 21 || hour < 5) return 'Good night'
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

function AdminDashboardInner() {
  const journey = useJourney()
  const [drawer, setDrawer] = useState(null) // { id, tab }
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
  const [sortBy, setSortBy] = useState('number_desc')
  const [selectedJob, setSelectedJob] = useState(null)
  const [showCreateJob, setShowCreateJob] = useState(false)
  // a file sent to the WhatsApp bot: its "create a new job" link opens Create job with it
  const [createFromFile, setCreateFromFile] = useState(null)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const path = params.get('createFrom')
    if (!path) return
    setCreateFromFile(path)
    setShowCreateJob(true)
    params.delete('createFrom')
    navigate(`/admin?${params.toString()}`, { replace: true })
  }, [location.search]) // eslint-disable-line react-hooks/exhaustive-deps
  const [pendingNavAction, setPendingNavAction] = useState(null)
  const [documentExpandJobId, setDocumentExpandJobId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toastState, setToastState] = useState(null)

  const activeNav = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const t = params.get('tab') || 'today'
    return OLD_TAB_NAMES[t] || t
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
      // Background LDB refresh on login — only if last refresh was 6+ hours ago
      if ((jobsData || []).some(j => j.containers)) {
        const REFRESH_GAP_HOURS = 6
        const loginKey = `jds_last_login_refresh_${user?.id || 'unknown'}`
        const lastLoginRefresh = localStorage.getItem(loginKey)
        const hoursSince = lastLoginRefresh
          ? (Date.now() - new Date(lastLoginRefresh).getTime()) / (1000 * 60 * 60)
          : Infinity
        if (hoursSince >= REFRESH_GAP_HOURS) {
          localStorage.setItem(loginKey, new Date().toISOString())
          forceRefreshAllContainers(jobsData).catch(err =>
            console.warn('[LDB] Background refresh on login failed:', err)
          )
        }
      }
      // Restore selected job from URL
      const params = new URLSearchParams(window.location.search)
      const jobId = params.get('jobId')
      if (jobId && jobsData) {
        const found = jobsData.find(j => j.id === jobId)
        if (found) setSelectedJob(found)
      }
      const map = {}
      ;(profilesData ?? []).forEach((p) => { map[p.id] = p.name })
      setProfiles(map)
      setLoadingJobs(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (pendingNavAction?.tab === 'jobs' && pendingNavAction?.jobId && jobs.length > 0) {
      const job = jobs.find(j => j.id === pendingNavAction.jobId)
      if (job) {
        setSelectedJob(job)
        setPendingNavAction(null)
      }
    }
    if (pendingNavAction?.tab === 'documents' && pendingNavAction?.jobNo && jobs.length > 0) {
      setDocumentExpandJobId(pendingNavAction.jobNo)
      setPendingNavAction(null)
      setTimeout(() => {
        const el = document.getElementById(`doc-job-${pendingNavAction.jobNo}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 200)
    }
  }, [pendingNavAction, jobs])

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
        if (sortBy === 'number_desc') {
          const na = parseInt((a.job_no || '').replace(/\D/g, '')) || 0
          const nb = parseInt((b.job_no || '').replace(/\D/g, '')) || 0
          return nb - na
        }
        if (sortBy === 'number_asc') {
          const na = parseInt((a.job_no || '').replace(/\D/g, '')) || 0
          const nb = parseInt((b.job_no || '').replace(/\D/g, '')) || 0
          return na - nb
        }
        if (sortBy === 'latest') {
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        }
        if (sortBy === 'updated') {
          return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
        }
        if (sortBy === 'eta') {
          const ea = a.eta ? new Date(a.eta).getTime() : Infinity
          const eb = b.eta ? new Date(b.eta).getTime() : Infinity
          return ea - eb
        }
        if (sortBy === 'stage_asc') {
          return (Number(a.stage) || 0) - (Number(b.stage) || 0)
        }
        if (sortBy === 'stage_desc') {
          return (Number(b.stage) || 0) - (Number(a.stage) || 0)
        }
        return 0
      })
  }, [jobs, search, filterStage, filterPriority, filterMode, sortBy])

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
    journey?.refresh()
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
  const pageTitle = NAV_ITEMS.find((n) => n.id === activeNav)?.label ?? 'Today'

  // Open a job on a given tab (used by Today, Board, Trucks, Customs, Search …).
  // 'truck' goes to the Trucks page, where trucks are assigned. Each open is a
  // new history entry, so the browser's Back button returns to the page you came from.
  const DRAWER_TABS = ['overview', 'containers', 'timeline', 'docs', 'notes']
  const openFullJob = async (jobId, tab = 'details') => {
    setDrawer(null)
    rememberJob(jobId)
    // customs and truck checks now live on their own pages
    if (tab === 'customs') { navigate(`/admin?tab=customs&job=${jobId}`); return }
    if (tab === 'truck') { navigate(`/admin?tab=trucks&job=${jobId}`); return }
    const { data: fresh } = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle()
    navigate(`/admin?tab=jobs&jobId=${jobId}#${tab}`)
    if (fresh) {
      setSelectedJob(fresh)
      setJobs(prev => prev.map(j => (j.id === fresh.id ? fresh : j)))
    }
  }
  const openTruck = (jobId) => {
    setDrawer(null)
    const job = journey?.byId?.[jobId]?.job || jobs.find((j) => j.id === jobId)
    navigate(`/admin?tab=trucks&q=${encodeURIComponent(job?.job_no || '')}`)
  }
  const openJob = async (jobId, tab = 'overview') => {
    rememberJob(jobId)
    if (tab === 'truck') return openTruck(jobId)
    // a job the shared data has not loaded yet (just created): open it in full
    if (!journey?.byId?.[jobId]) return openFullJob(jobId, DRAWER_TABS.includes(tab) ? 'details' : tab)
    setDrawer({ id: jobId, tab: DRAWER_TABS.includes(tab) ? tab : 'overview' })
  }
  // once the portal has its data: fetch the busy pages' code and the documents list in
  // the background, so opening them later is instant (Jose, 25 Oct 2026)
  const warmed = useRef(false)
  useEffect(() => {
    if (warmed.current || !journey?.data) return
    warmed.current = true
    const t = setTimeout(() => {
      loadDocs()
      import('../components/DocumentsSection')
      import('../components/ContainerTrackingSection').then((m) => m.warmContainers?.())
      import('../industrial/pages/VesselsPage')
      import('../industrial/pages/TrucksPage')
    }, 1500)
    return () => clearTimeout(t)
  }, [journey?.data])

  // links from alerts (bell and desktop; alertLinks.js): pick the alert's job on its page
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tab = params.get('tab')
    const open = params.get('open')
    const job = params.get('job')
    if (tab === 'jobs' && open && journey?.data) {
      openJob(open)
      params.delete('open')
      navigate(`/admin?${params.toString()}`, { replace: true })
    } else if (tab === 'containers' && job && jobs.length) {
      setPendingNavAction({ tab: 'containers', jobId: job, cn: params.get('cn') })
    } else if (tab === 'documents' && job && jobs.length) {
      const no = jobs.find((j) => j.id === job)?.job_no
      if (no) setDocumentExpandJobId(no)
    }
  }, [location.search, jobs.length, !!journey?.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const canEditBE = isAdmin || ['Akshyani', 'Trupti'].includes(currentUserName)
  const pageProps = { profile, currentUserName, onOpenJob: openJob, showToast, canUpdateStage, canEditBE }
  const desktopFilters = (
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
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="h-6 px-2 text-xs bg-white border-[1.5px] border-[#e2e6ed] rounded-lg text-[#4a5568] outline-none focus:border-[#1a4fa0]">
          <option value="number_desc">Job No ↓</option>
          <option value="number_asc">Job No ↑</option>
          <option value="updated">Recently Updated</option>
          <option value="latest">Latest Added</option>
          <option value="eta">ETA Soonest</option>
          <option value="stage_asc">Stage ↑ (needs attention)</option>
          <option value="stage_desc">Stage ↓ (nearly done)</option>
        </select>
        <button type="button" onClick={() => { setSearch(''); setFilterStage(''); setFilterPriority(''); setFilterMode(''); setSortBy('number_desc') }}
          className="h-6 px-2.5 text-xs rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8]">
          Clear
        </button>
      </div>
    </div>
  )

  const allJobsProps = {
    jobs: filteredJobs,
    searchQuery: search, setSearchQuery: setSearch,
    stageFilter: filterStage, setStageFilter: setFilterStage,
    priorityFilter: filterPriority, setPriorityFilter: setFilterPriority,
    onOpenJob: (job) => {
      setSelectedJob(job)
      const params = new URLSearchParams(window.location.search)
      params.set('jobId', job.id)
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`)
    },
    getStageName,
    canCreateJob: true,
    onCreateJob: () => setShowCreateJob(true),
    profiles,
    currentUserName,
    isAdmin,
    filteredJobs,
    loadingJobs,
    selectedJob,
  }

  const navCounts = {
    jobs: journey?.active?.length || null,
    customs: journey?.active?.filter((r) => r.j.phase === 'ooc').length || null,
    trucks: journey?.active?.filter((r) => r.j.readyForTruck).length || null,
    detention: journey?.active?.filter((r) => r.j.freeDaysLeft !== null && r.j.freeDaysLeft <= 2).length || null,
  }
  const urlJob = new URLSearchParams(location.search).get('job')
  const legacy = (node) => <div className="ix-legacy">{node}</div>
  // an older screen with the same page heading as the new ones
  const legacyPage = (title, sub, node) => (
    <div className="ix-legacy">
      <div className="ix-page-head"><div><h1>{title}</h1><p>{sub}</p></div></div>
      {node}
    </div>
  )
  const fullJob = selectedJob && (activeNav === 'jobs' || activeNav === 'overview')
  const closeFullJob = () => {
    setSelectedJob(null)
    const params = new URLSearchParams(window.location.search)
    params.delete('jobId')
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }
  const ixProps = { ...pageProps, onGo: handleNavClick, onCreateJob: () => setShowCreateJob(true) }

  return (
    <Shell
      sections={NAV_SECTIONS}
      active={activeNav}
      counts={navCounts}
      onGo={handleNavClick}
      onOpenJob={(id) => openJob(id)}
      onCreateJob={() => setShowCreateJob(true)}
      onLogout={handleLogout}
      profile={profile}
      onBellNavigate={(action) => {
        // the alert's own page, with its job picked (alertLinks.js)
        if (action.url) { setSelectedJob(null); navigate(action.url); return }
        setPendingNavAction(action)
        handleNavClick(action.tab)
        if (action.hash) setTimeout(() => { window.location.hash = action.hash }, 100)
      }}
    >
      <Suspense fallback={<div className="ix-page"><div className="ix-card"><Skeleton rows={6} /></div></div>}>
      {fullJob && legacy(
        <>
          <JobDetailView
            job={selectedJob} profiles={profiles} currentUserName={currentUserName}
            isAdmin={isAdmin} canUpdateStage={canUpdateStage}
            hideTabs={['customs', 'vessel', 'truck']}
            onBack={closeFullJob}
            onSaved={refreshJobs} toast={showToast}
            onDelete={() => handleDeleteJob(selectedJob)}
          />
        </>
      )}

      {!fullJob && activeNav === 'today' && <IxTodayPage {...ixProps} />}
      {!fullJob && activeNav === 'jobs' && <IxJobsPage {...ixProps} selectedId={drawer?.id} />}
      {activeNav === 'customs' && <IxCustomsPage key={urlJob || 'none'} {...ixProps} />}
      {activeNav === 'trucks' && <IxTrucksPage key={urlJob || 'none'} {...ixProps} />}
      {activeNav === 'vessels' && <IxVesselsPage key={urlJob || 'none'} {...ixProps} />}

      {!fullJob && activeNav === 'overview' && legacyPage('Team & stages', 'Urgent jobs, detention risk and jobs that have not moved',
        <ControlTowerSection
          jobs={jobs} profiles={profiles} currentUserName={currentUserName}
          selectedJob={selectedJob}
          onOpenJob={(job) => openJob(job.id)}
          onStageFilter={(stage) => { setFilterStage(stage); navigate('/admin?tab=jobs') }}
          showToast={showToast}
        />
      )}

      {/* Containers: kept exactly as it was */}
      {activeNav === 'containers' && legacyPage('Containers', 'Every container of the open jobs, from container tracking (LDB)',
        <ContainerTrackingSection
          showToast={showToast}
          jobs={jobs}
          pendingNavAction={activeNav === 'containers' ? pendingNavAction : null}
          onNavActionConsumed={() => setPendingNavAction(null)}
        />
      )}

      {activeNav === 'documents' && legacyPage('Documents', 'Every job’s papers in one place',
        <DocumentsSection
          jobs={jobs} profiles={profiles} currentUserName={currentUserName} showToast={showToast}
          initialExpandJobId={documentExpandJobId} onExpandConsumed={() => setDocumentExpandJobId(null)}
        />
      )}
      {activeNav === 'search' && legacy(<SearchPage {...pageProps} />)}
      {activeNav === 'clients' && legacy(<ClientsPage {...pageProps} />)}
      {activeNav === 'detention' && legacy(<DetentionPage {...pageProps} />)}
      {activeNav === 'payments' && legacyPage('Payments', 'Payments waiting for approval', <PaymentsSection jobs={jobs} profiles={profiles} showToast={showToast} getStageName={getStageName} />)}
      {activeNav === 'compliance' && legacyPage('BIS & Licences', 'Certificates and licences, with their expiry dates', <ComplianceSection showToast={showToast} />)}
      {activeNav === 'bot' && legacy(<BotPreviewPage {...pageProps} />)}
      {activeNav === 'health' && <IxHealthPage />}

      {!NAV_ITEMS.some(n => n.id === activeNav) && (
        <div className="ix-page"><div className="ix-card ix-empty">This page does not exist. Pick one from the menu.</div></div>
      )}

      {drawer && (
        <JobDrawer
          key={`${drawer.id}-${drawer.tab}`}
          jobId={drawer.id}
          initialTab={drawer.tab}
          onClose={() => setDrawer(null)}
          onOpenFull={openFullJob}
          onOpenTruck={openTruck}
          currentUserName={currentUserName}
          showToast={showToast}
        />
      )}

      {toastState && <div className={`ix-toast ${toastState.type}`}>{toastState.message}</div>}

      {showCreateJob && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl border border-[#e2e6ed]">
            <CreateJob
              isModal
              initialFilePath={createFromFile}
              onCancel={() => { setShowCreateJob(false); setCreateFromFile(null) }}
              onCreated={async () => {
                setShowCreateJob(false)
                setCreateFromFile(null)
                await refreshJobs()
                showToast('Job created.', 'success')
              }}
            />
          </div>
        </div>
      )}
      </Suspense>
    </Shell>
  )
}

export default function AdminDashboard() {
  return (
    <JourneyProvider>
      <AdminDashboardInner />
    </JourneyProvider>
  )
}
