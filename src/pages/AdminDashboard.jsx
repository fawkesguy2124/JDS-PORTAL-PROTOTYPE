import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { getStageName, isEtaThisWeek } from '../utils/jobHelpers'
import CreateJob from './CreateJob'
import { fetchAllTracking, deleteTracking, lookupAndSaveContainer, checkContainerStatus } from '../services/trackingService'
import * as XLSX from 'xlsx'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

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

function FieldMetaChip({ meta, profiles }) {
  if (!meta || typeof meta !== 'object') return null
  const { by, ts } = meta
  if (!by && !ts) return null
  const name = by && profiles && profiles[by] ? profiles[by] : by
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0] px-2 py-0.5 text-xs font-medium">
      {name || '—'} · {ts ? timeAgo(ts) : '—'}
    </span>
  )
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

function MiniStatus({ title, value, tone }) {
  const tones = { blue: 'border-t-blue-500', amber: 'border-t-amber-500', green: 'border-t-green-500', gray: 'border-t-[#8a96a8]' }
  return (
    <div className={classNames('bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-3 border-t-4', tones[tone] || tones.blue)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8]">{title}</p>
      <p className="text-sm font-semibold text-[#1a2233] mt-1 truncate" title={value}>{value}</p>
    </div>
  )
}

function DetailField({ label, value, meta, profiles }) {
  return (
    <div>
      <div className="flex items-center flex-wrap gap-1">
        <p className="text-xs uppercase tracking-wide text-[#8a96a8] font-medium">{label}</p>
        <FieldMetaChip meta={meta} profiles={profiles} />
      </div>
      <p className="text-sm text-[#1a2233] font-medium mt-0.5">{value}</p>
    </div>
  )
}

function JobProgress({ stage }) {
  const s = Number(stage) || 0
  const pct = Math.min(100, Math.round((s / 10) * 100))
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[#4a5568] truncate">Stage {s}: {getStageName(s)}</span>
        <span className="text-xs text-[#8a96a8]">{pct}%</span>
      </div>
      <div className="mt-0.5 h-0.5 bg-[#e2e6ed] border border-[#e2e6ed] rounded overflow-hidden">
        <div className="h-full bg-[#1a4fa0] rounded" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
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
      <JobProgress stage={job.stage} />
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

function JobDetailView({ job, profiles, currentUserName, isAdmin, canUpdateStage, onBack, onSaved, toast, onDelete }) {
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stageUpdating, setStageUpdating] = useState(false)
  const [showFullAccountability, setShowFullAccountability] = useState(false)
  const [form, setForm] = useState(() => ({ ...job }))
  const meta = job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : {}

  useEffect(() => {
    setEditMode(false); setSaving(false); setStageUpdating(false); setForm({ ...job })
  }, [job?.id])

  const stage = Number(job.stage) || 0
  const pct = Math.min(100, Math.round((stage / 10) * 100))
  const stageName = getStageName(stage)
  const priority = priorityChip(job.priority)
  const mode = modeChip(job.mode)
  const assignedName = job.assigned_to ? profiles[job.assigned_to] ?? '—' : '—'
  const cfsDisplay = job.cfs_amount !== null && job.cfs_amount !== undefined && job.cfs_amount !== ''
    ? `Rs. ${Number(job.cfs_amount).toLocaleString('en-IN')}` : 'Pending'

  const canEditField = (fieldKey) => {
    if (isAdmin) return true
    if (['assigned_to','created_by','created_at','updated_at'].includes(fieldKey)) return false
    const rule = FIELD_PERMS[fieldKey]
    if (!rule) return false
    if (rule.can === 'all') return true
    return Array.isArray(rule.can) && rule.can.includes(currentUserName)
  }

  const fieldRows = [
    { key: 'job_no', label: 'Job Number', value: displayValue(job.job_no) },
    { key: 'client', label: 'Client', value: displayValue(job.client) },
    { key: 'mode', label: 'Mode', value: displayValue(job.mode) },
    { key: 'priority', label: 'Priority', value: displayValue(job.priority) },
    { key: 'goods', label: 'Goods', value: displayValue(job.goods) },
    { key: 'bl_no', label: 'BL Number', value: displayValue(job.bl_no) },
    { key: 'be_no', label: 'BE Number', value: displayValue(job.be_no) },
    { key: 'be_date', label: 'BE Date', value: formatDateSlash(job.be_date) },
    { key: 'containers', label: 'Containers', value: displayValue(job.containers) },
    { key: 'container_size', label: 'Container Size', value: displayValue(job.container_size) },
    { key: 'shipping_line', label: 'Shipping Line', value: displayValue(job.shipping_line) },
    { key: 'vessel', label: 'Vessel / Flight', value: displayValue(job.vessel) },
    { key: 'eta', label: 'ETA', value: formatDateSlash(job.eta) },
    { key: 'cfs_name', label: 'CFS Name', value: displayValue(job.cfs_name) },
    { key: 'cfs_amount', label: 'CFS Amount', value: cfsDisplay },
    { key: 'hs_code', label: 'HS Code', value: displayValue(job.hs_code) },
    { key: 'rms_status', label: 'RMS Status', value: displayValue(job.rms_status) },
    { key: 'bg_required', label: 'BG Required', value: displayValue(job.bg_required) },
    { key: 'destination', label: 'Destination', value: displayValue(job.destination) },
    { key: 'free_days', label: 'Free Days', value: displayValue(job.free_days) },
    { key: 'detention_risk', label: 'Detention Risk', value: displayValue(job.detention_risk) },
    { key: 'stage', label: 'Current Stage', value: `${stage} — ${stageName}` },
    { key: 'delay_reason', label: 'Delay Reason', value: displayValue(job.delay_reason) },
    { key: 'created_by', label: 'Created By', value: job.created_by ? profiles[job.created_by] ?? job.created_by : '—' },
    { key: 'created_at', label: 'Created At', value: formatDateTime(job.created_at) },
    { key: 'updated_at', label: 'Updated At', value: formatDateTime(job.updated_at) },
  ]

  const metaEntries = useMemo(() => {
    return Object.entries(meta || {})
      .filter(([, v]) => v && typeof v === 'object' && (v.by || v.ts))
      .map(([k, v]) => ({ key: k, label: FIELD_LABELS[k] || k, by: v.by || '—', ts: v.ts || null }))
      .sort((a, b) => (normalizeMetaTs(b.ts) || 0) - (normalizeMetaTs(a.ts) || 0))
  }, [meta])

  const updateForm = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates = {}
      const newMeta = { ...(meta || {}) }
      const candidates = ['job_no','client','mode','bl_no','containers','container_size','shipping_line','vessel','eta','cfs_name','be_no','be_date','hs_code','rms_status','bg_required','cfs_amount','destination','priority','goods','free_days','detention_risk','delay_reason','notes']
      candidates.forEach((k) => {
        if (!canEditField(k)) return
        const prev = job[k]
        let next = form[k]
        if (k === 'free_days' || k === 'cfs_amount') next = next === '' || next === null || next === undefined ? null : Number(next)
        if (k === 'eta' || k === 'be_date') next = next ? next : null
        if (typeof next === 'string') { next = next.trim(); if (next === '') next = null }
        if ((prev ?? null) !== (next ?? null)) { updates[k] = next; newMeta[k] = { by: currentUserName, ts: Date.now() } }
      })
      if (Object.keys(updates).length === 0) { toast('No changes to save.', 'info'); setEditMode(false); return }
      updates.field_meta = newMeta
      updates.updated_at = new Date().toISOString()
      const { error } = await supabase.from('jobs').update(updates).eq('id', job.id)
      if (error) throw error
      toast('Saved successfully.', 'success')
      setEditMode(false)
      await onSaved()
    } catch (e) {
      toast(e?.message || 'Save failed.', 'error')
    } finally { setSaving(false) }
  }

  const handleStageChange = async (e) => {
    const nextStage = Number(e.target.value)
    if (!Number.isFinite(nextStage)) return
    if (!canUpdateStage) { toast('You do not have permission to update stage.', 'error'); return }
    setStageUpdating(true)
    try {
      const newMeta = { ...(meta || {}), stage: { by: currentUserName, ts: Date.now() } }
      const { error } = await supabase.from('jobs').update({ stage: nextStage, field_meta: newMeta, updated_at: new Date().toISOString() }).eq('id', job.id)
      if (error) throw error
      toast(`Stage updated to: ${getStageName(nextStage)}`, 'success')
      await onSaved()
    } catch (e2) { toast(e2?.message || 'Stage update failed.', 'error') }
    finally { setStageUpdating(false) }
  }

  const inputBase = 'w-full h-9 px-3 py-2 text-xs rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#e8eef8] disabled:opacity-60 disabled:cursor-not-allowed'

  const renderFieldInput = (key) => {
    const disabled = !canEditField(key) || saving
    const value = form[key] ?? ''
    if (key === 'mode') return <select value={value||''} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="">—</option><option value="Sea FCL">Sea FCL</option><option value="Sea LCL">Sea LCL</option><option value="Air">Air</option><option value="BPT/MBPT">BPT/MBPT</option></select>
    if (key === 'priority') return <select value={value||'normal'} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
    if (key === 'rms_status') return <select value={value||'pending'} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="pending">pending</option><option value="rms">rms</option><option value="apr">apr</option><option value="acl">acl</option><option value="check">check</option><option value="hold">hold</option></select>
    if (key === 'bg_required') return <select value={value||'no'} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="no">no</option><option value="yes">yes</option><option value="100percent">100percent</option></select>
    if (key === 'detention_risk') return <select value={value||'low'} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>
    if (key === 'be_date') return <input type="date" value={value||''} onChange={updateForm(key)} disabled={disabled} className={inputBase} />
    if (key === 'container_size') {
      return (
        <select value={value || ''} onChange={updateForm(key)} disabled={disabled} className={inputBase}>
          <option value="">— Select —</option>
          <option value="20 Feet">20 Feet</option>
          <option value="40 Feet">40 Feet</option>
        </select>
      )
    }
    if (key === 'eta') return <input type="date" value={value||''} onChange={updateForm(key)} disabled={disabled} className={inputBase} />
    if (key === 'free_days' || key === 'cfs_amount') return <input type="number" value={value??''} onChange={updateForm(key)} disabled={disabled} className={inputBase} />
    if (key === 'shipping_line') {
      return (
        <select value={value || ''} onChange={updateForm(key)} disabled={disabled} className={inputBase}>
          <option value="">— Select —</option>
          <option value="Maersk">Maersk</option>
          <option value="MSC">MSC</option>
          <option value="Hapag-Lloyd">Hapag-Lloyd</option>
          <option value="CMA-CGM">CMA-CGM</option>
          <option value="Evergreen">Evergreen</option>
          <option value="ONE">ONE</option>
          <option value="OOCL">OOCL</option>
          <option value="COSCO">COSCO</option>
          <option value="ZIM">ZIM</option>
          <option value="HMM">HMM</option>
          <option value="Yang Ming">Yang Ming</option>
          <option value="Wan Hai">Wan Hai</option>
          <option value="TS Line">TS Line</option>
          <option value="Interasia">Interasia</option>
          <option value="Emirates">Emirates</option>
          <option value="Akkon">Akkon</option>
          <option value="Other">Other</option>
        </select>
      )
    }
    if (key === 'notes') return <textarea value={value||''} onChange={updateForm(key)} disabled={disabled} rows={3} className={classNames(inputBase,'h-auto py-2')} />
    return <input type="text" value={value||''} onChange={updateForm(key)} disabled={disabled} className={inputBase} />
  }

  return (
    <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-[#e2e6ed] flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="h-9 px-3 text-xs rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold">
          &larr; Back to Jobs
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm sm:text-base font-extrabold text-[#1a2233] truncate">{job.job_no} &mdash; {job.client}</div>
          <div className="mt-1 flex flex-wrap gap-2">
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', priority.cls)}>{priority.text}</span>
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', mode.cls)}>{mode.text}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editMode ? (
            <>
              <button type="button" onClick={() => setEditMode(true)} className="h-9 px-4 text-xs rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold">Edit</button>
              <select disabled={!canUpdateStage||stageUpdating} value={stage} onChange={handleStageChange}
                className={classNames('h-9 px-3 text-xs rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#4a5568] outline-none focus:border-[#1a4fa0]', (!canUpdateStage||stageUpdating)?'opacity-60 cursor-not-allowed':'hover:border-[#1a4fa0]')}>
                {STAGE_LIST.map((s) => <option key={s.value} value={s.value}>{s.value} — {s.label}</option>)}
              </select>
              <span className="text-xs text-[#8a96a8] font-semibold">Update Stage</span>
            </>
          ) : (
            <>
              <button type="button" disabled={saving} onClick={() => { setEditMode(false); setForm({...job}) }}
                className="h-9 px-4 text-xs rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold disabled:opacity-60">Cancel</button>
              <button type="button" disabled={saving} onClick={handleSave}
                className="h-9 px-4 text-xs rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold disabled:opacity-60 inline-flex items-center gap-2">
                {saving && <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Save
              </button>
            </>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 border-b border-[#e2e6ed] bg-[#f8f9fb]">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm font-medium text-[#4a5568] truncate">{stageName}</div>
          <div className="text-xs text-[#8a96a8]">{pct}%</div>
        </div>
        <div className="h-2 bg-[#e2e6ed] border border-[#e2e6ed] rounded overflow-hidden">
          <div className={classNames('h-full rounded', progressColor(stage))} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 border-b border-[#e2e6ed]">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStatus title="CUSTOMS" value={job.rms_status ? String(job.rms_status).toUpperCase() : '—'} tone="blue" />
          <MiniStatus title="CFS" value={cfsDisplay} tone="amber" />
          <MiniStatus title="TRANSPORT" value={job.vessel?.trim() ? job.vessel : 'Not Yet'} tone="gray" />
          <MiniStatus title="DELIVERY" value={job.destination?.trim() ? job.destination : 'Pending'} tone="green" />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5">
        <h3 className="text-sm font-semibold text-[#1a2233] mb-3">Job Details</h3>
        {!editMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            {fieldRows.map((f) => <DetailField key={f.key} label={f.label} value={f.value} meta={meta?.[f.key]} profiles={profiles} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            {['job_no','client','mode','priority','goods','bl_no','be_no','be_date','containers','container_size','shipping_line','vessel','eta','cfs_name','cfs_amount','hs_code','rms_status','bg_required','destination','free_days','detention_risk','delay_reason','notes'].map((k) => (
              <div key={k} className={k === 'notes' ? 'md:col-span-2' : ''}>
                <div className="flex items-center flex-wrap gap-1 mb-1">
                  <p className="text-xs text-[#8a96a8] font-medium uppercase tracking-wide">{FIELD_LABELS[k] || k}</p>
                  <FieldMetaChip meta={meta?.[k]} profiles={profiles} />
                </div>
                {renderFieldInput(k)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 sm:px-6 pb-6">
        <div className="bg-white border border-[#e2e6ed] rounded-xl overflow-hidden shadow-sm w-full">
          <div className="px-4 py-3 border-b border-[#e2e6ed] flex items-center justify-between gap-3">
<div className="text-sm font-semibold text-[#1a2233]">Field Accountability</div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-[#8a96a8]">Who updated what</div>
              {metaEntries.length > 5 && (
                <button type="button" onClick={() => setShowFullAccountability(true)} className="text-xs font-semibold text-blue-700 hover:text-blue-800">
                  View Full List
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[228px] overflow-y-auto">
          <table className="w-full table-fixed text-xs">
            <thead className="sticky top-0 z-10 bg-[#f8f9fb] text-[#8a96a8]">
              <tr>
                <th className="w-[36%] text-left px-4 py-3 font-semibold uppercase tracking-wide text-xs">Field Name</th>
                <th className="w-[32%] text-left px-4 py-3 font-semibold uppercase tracking-wide text-xs">Updated By</th>
                <th className="w-[32%] text-left px-4 py-3 font-semibold uppercase tracking-wide text-xs">When</th>
              </tr>
            </thead>
            <tbody>
              {metaEntries.length ? metaEntries.map((m) => (
                <tr key={m.key} className="border-t border-[#e2e6ed]">
                  <td className="px-4 py-2 text-[#4a5568] truncate" title={m.label}>{m.label}</td>
                  <td className="px-4 py-2 text-[#1a2233] font-semibold truncate" title={profiles[m.by] || m.by}>{profiles[m.by] || m.by}</td>
                  <td className="px-4 py-2 text-[#8a96a8]">{formatAccountabilityWhen(m.ts)}</td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-[#8a96a8]">No field updates logged yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {showFullAccountability && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-3xl max-h-[82vh] overflow-hidden rounded-xl bg-white shadow-2xl border border-[#e2e6ed]">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-[#1a2233]">Field Accountability</div>
                <div className="text-xs text-[#8a96a8]">{metaEntries.length} updates shown in IST</div>
              </div>
              <button type="button" onClick={() => setShowFullAccountability(false)}
                className="h-8 px-3 text-xs rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold">
                Close
              </button>
            </div>
            <div className="max-h-[68vh] overflow-y-auto">
              <table className="w-full table-fixed text-xs">
                <thead className="sticky top-0 z-10 bg-[#f8f9fb] text-[#8a96a8]">
                  <tr>
                    <th className="w-[36%] text-left px-5 py-3 font-semibold uppercase tracking-wide text-xs">Field Name</th>
                    <th className="w-[32%] text-left px-5 py-3 font-semibold uppercase tracking-wide text-xs">Updated By</th>
                    <th className="w-[32%] text-left px-5 py-3 font-semibold uppercase tracking-wide text-xs">When</th>
                  </tr>
                </thead>
                <tbody>
                  {metaEntries.map((m) => (
                    <tr key={m.key} className="border-t border-[#e2e6ed]">
                      <td className="px-5 py-2 text-[#4a5568]">{m.label}</td>
                      <td className="px-5 py-2 text-[#1a2233] font-semibold">{profiles[m.by] || m.by}</td>
                      <td className="px-5 py-2 text-[#8a96a8]">{formatAccountabilityWhen(m.ts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {job.delay_reason?.trim() && (
        <div className="mx-4 sm:mx-6 mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Delay:</span> {job.delay_reason}
        </div>
      )}
      {job.notes?.trim() && (
        <div className="mx-4 sm:mx-6 mb-6 rounded-lg border border-[#e2e6ed] bg-white px-4 py-3">
          <p className="text-xs font-semibold text-[#8a96a8] uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm text-[#4a5568] whitespace-pre-wrap">{job.notes}</p>
        </div>
      )}

      <div className="px-4 sm:px-6 pb-6">
        <button type="button" onClick={() => onDelete && onDelete()}
          className="h-9 px-5 text-xs rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 font-semibold">
          Delete Job
        </button>
      </div>
    </div>
  )
}

const EXTRACTION_PROMPT = `You are a customs documentation expert for JDS Logistics, a licensed Customs House Agent (CHA) in Mumbai, India. We clear shipments at JNPT, MBPT, and MIAL.

I am uploading shipping documents for a shipment job. These may include a Bill of Lading, Commercial Invoice, Packing List, Certificate of Origin, Insurance Certificate, or other trade documents.

Extract ALL available shipment data from ALL uploaded documents and intelligently combine them into one unified shipment dataset.

Return ONLY a valid JSON object. No markdown, no backticks, no explanation. Just raw JSON.

For each field provide:
- value: extracted string or null if not found
- confidence: "high", "medium", or "low"
- source: document type e.g. "BL", "Invoice", "Packing List", "COO", "Insurance"

{
  "bl_number": {"value":null,"confidence":"low","source":null},
  "bl_date": {"value":null,"confidence":"low","source":null},
  "vessel_name": {"value":null,"confidence":"low","source":null},
  "voyage_number": {"value":null,"confidence":"low","source":null},
  "container_numbers": {"value":null,"confidence":"low","source":null},
  "container_size": {"value":null,"confidence":"low","source":null},
  "seal_numbers": {"value":null,"confidence":"low","source":null},
  "port_of_loading": {"value":null,"confidence":"low","source":null},
  "port_of_discharge": {"value":null,"confidence":"low","source":null},
  "place_of_delivery": {"value":null,"confidence":"low","source":null},
  "shipper_name": {"value":null,"confidence":"low","source":null},
  "shipper_address": {"value":null,"confidence":"low","source":null},
  "consignee_name": {"value":null,"confidence":"low","source":null},
  "consignee_address": {"value":null,"confidence":"low","source":null},
  "notify_party": {"value":null,"confidence":"low","source":null},
  "freight_terms": {"value":null,"confidence":"low","source":null},
  "shipment_terms": {"value":null,"confidence":"low","source":null},
  "number_of_packages": {"value":null,"confidence":"low","source":null},
  "package_type": {"value":null,"confidence":"low","source":null},
  "gross_weight": {"value":null,"confidence":"low","source":null},
  "net_weight": {"value":null,"confidence":"low","source":null},
  "volume_cbm": {"value":null,"confidence":"low","source":null},
  "invoice_number": {"value":null,"confidence":"low","source":null},
  "invoice_date": {"value":null,"confidence":"low","source":null},
  "invoice_value": {"value":null,"confidence":"low","source":null},
  "currency": {"value":null,"confidence":"low","source":null},
  "country_of_origin": {"value":null,"confidence":"low","source":null},
  "hs_code": {"value":null,"confidence":"low","source":null},
  "goods_description": {"value":null,"confidence":"low","source":null},
  "goods_description_detailed": {"value":null,"confidence":"low","source":null},
  "coo_certificate_number": {"value":null,"confidence":"low","source":null},
  "coo_issuing_authority": {"value":null,"confidence":"low","source":null},
  "insurance_policy_number": {"value":null,"confidence":"low","source":null},
  "insurance_value": {"value":null,"confidence":"low","source":null},
  "insurance_company": {"value":null,"confidence":"low","source":null},
  "iec_code": {"value":null,"confidence":"low","source":null},
  "ad_code": {"value":null,"confidence":"low","source":null},
  "gstin": {"value":null,"confidence":"low","source":null},
  "pan_number": {"value":null,"confidence":"low","source":null},
  "bank_name": {"value":null,"confidence":"low","source":null},
  "lc_number": {"value":null,"confidence":"low","source":null},
  "marks_and_numbers": {"value":null,"confidence":"low","source":null}
}`

const FIELD_LABELS_OCR = {
  bl_number: 'BL Number', bl_date: 'BL Date', vessel_name: 'Vessel Name', voyage_number: 'Voyage Number',
  container_numbers: 'Container Numbers', container_size: 'Container Size', seal_numbers: 'Seal Numbers',
  port_of_loading: 'Port of Loading', port_of_discharge: 'Port of Discharge', place_of_delivery: 'Place of Delivery',
  shipper_name: 'Shipper Name', shipper_address: 'Shipper Address', consignee_name: 'Consignee Name',
  consignee_address: 'Consignee Address', notify_party: 'Notify Party',
  freight_terms: 'Freight Terms', shipment_terms: 'Shipment Terms',
  number_of_packages: 'Number of Packages', package_type: 'Package Type',
  gross_weight: 'Gross Weight', net_weight: 'Net Weight', volume_cbm: 'Volume (CBM)',
  invoice_number: 'Invoice Number', invoice_date: 'Invoice Date', invoice_value: 'Invoice Value',
  currency: 'Currency', country_of_origin: 'Country of Origin', hs_code: 'HS Code',
  goods_description: 'Goods Description', goods_description_detailed: 'Goods Description (Detailed)',
  coo_certificate_number: 'COO Certificate Number', coo_issuing_authority: 'COO Issuing Authority',
  insurance_policy_number: 'Insurance Policy Number', insurance_value: 'Insurance Value',
  insurance_company: 'Insurance Company', iec_code: 'IEC Code', ad_code: 'AD Code',
  gstin: 'GSTIN', pan_number: 'PAN Number', bank_name: 'Bank Name', lc_number: 'LC Number',
  marks_and_numbers: 'Marks & Numbers',
}

const OCR_SECTIONS = [
  { title: 'Bill of Lading Details', fields: ['bl_number','bl_date','vessel_name','voyage_number','container_numbers','container_size','seal_numbers','port_of_loading','port_of_discharge','place_of_delivery','freight_terms','shipment_terms'] },
  { title: 'Parties', fields: ['shipper_name','shipper_address','consignee_name','consignee_address','notify_party'] },
  { title: 'Cargo Details', fields: ['goods_description','goods_description_detailed','hs_code','number_of_packages','package_type','gross_weight','net_weight','volume_cbm','country_of_origin','marks_and_numbers'] },
  { title: 'Invoice & Finance', fields: ['invoice_number','invoice_date','invoice_value','currency','iec_code','ad_code','gstin','pan_number','bank_name','lc_number'] },
  { title: 'COO & Insurance', fields: ['coo_certificate_number','coo_issuing_authority','insurance_policy_number','insurance_value','insurance_company'] },
]

async function urlToBase64(url) {
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1]
      resolve({ base64, mimeType: blob.type })
    }
    reader.readAsDataURL(blob)
  })
}

async function compressImage(base64, mimeType, maxWidth = 1000, quality = 0.6) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let w = img.width; let h = img.height
      if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, w, h)
      const compressed = canvas.toDataURL(mimeType || 'image/jpeg', quality).split(',')[1]
      resolve({ base64: compressed, mimeType: mimeType || 'image/jpeg' })
    }
    img.src = `data:${mimeType || 'image/jpeg'};base64,${base64}`
  })
}

async function pdfToImages(base64) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const maxPages = Math.min(pdf.numPages, 5)
  const images = []
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.min(viewport.width, 1200)
    canvas.height = Math.round(viewport.height * (Math.min(viewport.width, 1200) / viewport.width))
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
    await page.render({ canvasContext: ctx, viewport }).promise
    const imgBase64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
    images.push({ base64: imgBase64, mimeType: 'image/jpeg' })
  }
  return images
}

async function withRetry(fn, maxRetries = 3, baseDelay = 2000) {
  const rateLimitDelays = [3000, 6000, 12000]
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (err.name === 'AbortError') throw new Error('Request timed out. Please try again.')
      const isRateLimit = err.message?.includes('rate_limit') || err.message?.includes('Rate limit') || err.message?.includes('429')
      if (isRateLimit) {
        const delay = rateLimitDelays[attempt] || 12000
        if (attempt < maxRetries) await new Promise((r) => setTimeout(r, delay))
      } else if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelay * (attempt + 1)))
      }
    }
  }
  throw lastError
}

function mergeResults(results, rankMap = { high: 3, medium: 2, low: 1 }) {
  const allKeys = Object.keys(results[0] || {})
  const merged = {}
  for (const key of allKeys) merged[key] = { value: null, confidence: null, source: null }
  for (const partial of results) {
    for (const key of allKeys) {
      const field = partial[key]
      if (!field || field.value === null || field.value === undefined || field.value === '') continue
      const current = merged[key]
      if (!current.value) {
        merged[key] = { value: field.value, confidence: field.confidence, source: field.source || current.source }
      } else if (key === 'container_numbers') {
        const existing = String(current.value).split(',').map((s) => s.trim()).filter(Boolean)
        const incoming = String(field.value).split(',').map((s) => s.trim()).filter(Boolean)
        const combined = [...new Set([...existing, ...incoming])]
        merged[key] = { value: combined.join(', '), confidence: 'medium', source: field.source || current.source }
      } else {
        const currRank = rankMap[current.confidence] || 0
        const newRank = rankMap[field.confidence] || 0
        if (newRank > currRank) {
          merged[key] = { value: field.value, confidence: field.confidence, source: field.source || current.source }
        }
      }
    }
  }
  return merged
}

async function groqExtract(imageChunks, prompt) {
  const key = import.meta.env.VITE_GROQ_API_KEY
  if (!key) throw new Error('Groq API key not configured.')
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        ...imageChunks.map((f) => ({
          type: 'image_url',
          image_url: { url: `data:${f.mimeType};base64,${f.base64}` },
        })),
      ]}],
      max_tokens: 4096,
      temperature: 0.1,
    }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const errMsg = errBody?.error?.message || `Groq API error ${res.status}`
    if (res.status === 429 || errMsg.includes('rate_limit') || errMsg.includes('Rate limit')) throw new Error('Groq rate limit reached.')
    if (res.status === 503 || errMsg.includes('unavailable')) throw new Error('Groq service temporarily unavailable.')
    throw new Error(errMsg)
  }
  const data = await res.json()
  const choice = data?.choices?.[0]
  if (!choice) throw new Error('Groq returned no choices.')
  const msg = choice.message || {}
  if (msg.refusal) throw new Error(`Model refused: ${msg.refusal}`)
  let raw = msg.content
  if (Array.isArray(raw)) raw = raw.map((p) => (p.type === 'text' ? p.text : '')).filter(Boolean).join('\n')
  if (!raw) throw new Error('Groq returned empty response.')
  const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
  return JSON.parse(cleaned)
}

async function geminiExtract(imageChunks, prompt) {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!key) throw new Error('Gemini API key not configured.')
  const parts = [{ text: prompt }]
  for (const img of imageChunks) {
    parts.push({ inline_data: { mime_type: img.mimeType || 'image/jpeg', data: img.base64 } })
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody?.error?.message || `Gemini API error ${res.status}`)
  }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n')
  if (!text) throw new Error('Gemini returned empty response.')
  const cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
  return JSON.parse(cleaned)
}

async function extractWithFallback(docs, prompt) {
  const allImages = []
  for (const doc of docs) {
    const { base64, mimeType } = await urlToBase64(doc.file_url)
    if (mimeType === 'application/pdf' || doc.file_name?.toLowerCase().endsWith('.pdf')) {
      const pages = await pdfToImages(base64)
      allImages.push(...pages)
    } else {
      const compressed = await compressImage(base64, mimeType)
      allImages.push({ base64: compressed.base64, mimeType: compressed.mimeType })
    }
  }
  const MAX_IMAGES_PER_REQUEST = 5
  const chunks = []
  for (let i = 0; i < allImages.length; i += MAX_IMAGES_PER_REQUEST) {
    chunks.push(allImages.slice(i, i + MAX_IMAGES_PER_REQUEST))
  }
  try {
    const allResults = []
    for (let ci = 0; ci < chunks.length; ci++) {
      if (ci > 0) await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000))
      const parsed = await withRetry(() => groqExtract(chunks[ci], prompt), 2, 1500)
      allResults.push(parsed)
    }
    return { result: mergeResults(allResults), provider: 'groq' }
  } catch (groqError) {
    console.warn('Groq failed, trying Gemini fallback:', groqError.message)
    try {
      const allResults = []
      for (let ci = 0; ci < chunks.length; ci++) {
        if (ci > 0) await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000))
        const parsed = await withRetry(() => geminiExtract(chunks[ci], prompt), 2, 2000)
        allResults.push(parsed)
      }
      return { result: mergeResults(allResults), provider: 'gemini' }
    } catch (geminiError) {
      throw new Error(`Both Groq and Gemini failed. Groq: ${groqError.message} | Gemini: ${geminiError.message}`)
    }
  }
}

function DocumentsSection({ jobs, profiles, currentUserName, showToast }) {
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [expandedJobId, setExpandedJobId] = useState(null)
  const [uploadModal, setUploadModal] = useState({ open: false, job: null })
  const [previewModal, setPreviewModal] = useState({ open: false, doc: null })
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadDocType, setUploadDocType] = useState('BL')
  const [uploadFile, setUploadFile] = useState(null)
  const [docSearch, setDocSearch] = useState('')
  const fileInputRef = useRef(null)

  const DOC_TYPES = ['BL', 'Invoice', 'Packing List', 'COO', 'Insurance', 'BE', 'Examination Order', 'OOC', 'E-Way Bill', 'POD', 'Other']

  const DOC_TYPE_COLORS = {
    BL: 'bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]',
    Invoice: 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]',
    'Packing List': 'bg-[#f0fdfa] text-[#0f766e] border border-[#99f6e4]',
    COO: 'bg-[#f5f3ff] text-[#5b21b6] border border-[#ddd6fe]',
    Insurance: 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]',
    BE: 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]',
    'Examination Order': 'bg-[#fff7ed] text-[#c2410c] border border-[#fed7aa]',
    OOC: 'bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]',
    'E-Way Bill': 'bg-[#eef2ff] text-[#3730a3] border border-[#c7d2fe]',
    POD: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]',
    Other: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]',
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoadingDocs(true)
      const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
      if (mounted) {
        if (!error) setDocuments(data ?? [])
        setLoadingDocs(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const accordionItems = useMemo(() => {
    const docMap = {}
    documents.forEach((d) => {
      if (!docMap[d.job_id]) docMap[d.job_id] = []
      docMap[d.job_id].push(d)
    })
    let items = (jobs || []).map((j) => ({ ...j, docs: docMap[j.id] || [] }))
    const q = docSearch.trim().toLowerCase()
    if (q) {
      items = items.filter((j) => {
        if ((j.job_no || '').toLowerCase().includes(q)) return true
        if ((j.client || '').toLowerCase().includes(q)) return true
        return j.docs.some((d) => (d.file_name || '').toLowerCase().includes(q) || (d.doc_type || '').toLowerCase().includes(q))
      })
    }
    items.sort((a, b) => {
      const aHas = a.docs.length > 0 ? 0 : 1
      const bHas = b.docs.length > 0 ? 0 : 1
      if (aHas !== bHas) return aHas - bHas
      return (a.job_no || '').localeCompare(b.job_no || '')
    })
    return items
  }, [jobs, documents, docSearch])

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return '\u2014'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatUploadDate = (ts) => {
    if (!ts) return '\u2014'
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const sanitizeFilename = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_')

  const handleUpload = async () => {
    if (!uploadFile || !uploadDocType || !uploadModal.job) return
    setUploading(true)
    setUploadProgress(0)
    const sim = setInterval(() => setUploadProgress((p) => Math.min(p + 8, 85)), 250)
    try {
      const job = uploadModal.job
      const safeName = sanitizeFilename(uploadFile.name)
      const filePath = `${job.id}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage.from('job-documents').upload(filePath, uploadFile, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('job-documents').getPublicUrl(filePath)
      const { error: insErr } = await supabase.from('documents').insert({
        job_id: job.id,
        job_no: job.job_no || '',
        file_name: uploadFile.name,
        file_type: uploadFile.name.split('.').pop(),
        doc_type: uploadDocType,
        file_url: publicUrl,
        file_path: filePath,
        uploaded_by: user?.id || '',
        uploaded_by_name: profile?.name || currentUserName,
        file_size: uploadFile.size,
        created_at: new Date().toISOString(),
      })
      if (insErr) throw insErr
      clearInterval(sim)
      setUploadProgress(100)
      showToast('Document uploaded successfully.', 'success')
      setUploadModal({ open: false, job: null })
      setUploadFile(null)
      setUploadDocType('BL')
      const { data: newDocs } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
      setDocuments(newDocs ?? [])
    } catch (e) {
      clearInterval(sim)
      setUploadProgress(0)
      showToast(e?.message || 'Upload failed.', 'error')
    } finally {
      setTimeout(() => setUploading(false), 600)
    }
  }

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.file_name}"?`)) return
    try {
      await supabase.storage.from('job-documents').remove([doc.file_path])
      await supabase.from('documents').delete().eq('id', doc.id)
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
      showToast('Document deleted.', 'success')
    } catch (e) {
      showToast(e?.message || 'Delete failed.', 'error')
    }
  }

  const fileIcon = (doc) => {
    const ext = (doc.file_type || '').toLowerCase()
    if (['pdf'].includes(ext)) return <span className="text-red-500 font-bold text-sm">PDF</span>
    if (['jpg', 'jpeg', 'png'].includes(ext)) return <span className="text-green-500 font-bold text-sm">IMG</span>
    return <span className="text-[#8a96a8] font-bold text-sm">DOC</span>
  }

  const btnBase = 'h-8 px-3 text-xs rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const selectBase = 'w-full h-9 px-3 text-xs rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#4a5568] outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#e8eef8]'

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-lg font-bold text-[#1a2233]">Documents</div>
          <div className="text-sm text-[#8a96a8]">Operational document register \u2014 all jobs</div>
        </div>
        <div className="flex items-center h-9 px-3 bg-[#f8f9fb] border-[1.5px] border-[#e2e6ed] rounded-lg min-w-[240px]">
          <input value={docSearch} onChange={(e) => setDocSearch(e.target.value)}
            placeholder="Search job no., client, file name..."
            className="w-full bg-transparent outline-none text-sm text-[#1a2233] placeholder:text-[#8a96a8]" />
        </div>
      </div>

      {loadingDocs ? (
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-10 flex justify-center">
          <div className="h-9 w-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : accordionItems.length === 0 ? (
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-10 text-center text-[#8a96a8]">
          {docSearch.trim() ? 'No jobs match your search.' : 'No jobs found.'}
        </div>
      ) : (
    <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
          {accordionItems.map((job) => {
            const isExpanded = expandedJobId === job.id
            const docCount = job.docs.length
            return (
              <div key={job.id} className="border-b border-[#e2e6ed] last:border-b-0">
                <div
                  role="button" tabIndex={0}
                  onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setExpandedJobId(isExpanded ? null : job.id) }}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-[#f8f9fb] hover:bg-[#e8eef8] border-b border-[#e2e6ed] transition-colors"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span className="text-sm font-bold text-[#1a2233]">{job.job_no || '\u2014'}</span>
                    <span className="text-xs text-[#8a96a8] truncate">{job.client || ''}</span>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${docCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]'}`}>
                    {docCount} document{docCount !== 1 ? 's' : ''}
                  </span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setUploadModal({ open: true, job }); setExpandedJobId(null) }}
                    className={`${btnBase} bg-[#1a4fa0] text-white hover:bg-[#153d82]`}>
                    Upload Document
                  </button>

                  <span className={`text-[#8a96a8] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                </div>
                {isExpanded && (
                  <div className="bg-white px-4 py-4">
                    {docCount === 0 ? (
                      <p className="text-sm text-[#8a96a8] text-center py-6">No documents uploaded yet for this job.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[#8a96a8] border-b border-[#e2e6ed]">
                              <th className="text-left font-semibold uppercase tracking-wide text-xs pb-3 pr-3">File Name</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-xs pb-3 pr-3">Doc Type</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-xs pb-3 pr-3">Uploaded By</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-xs pb-3 pr-3">Date &amp; Time</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-xs pb-3 pr-3">Size</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-xs pb-3">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {job.docs.map((doc) => {
                              const colorClass = DOC_TYPE_COLORS[doc.doc_type] || 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]'
                              const canDelete = isAdmin || doc.uploaded_by === user?.id
                              return (
                                <tr key={doc.id} className="border-b border-[#e2e6ed] last:border-b-0">
                                  <td className="py-3 pr-3">
                                    <div className="flex items-center gap-2">
                                      {fileIcon(doc)}
                                      <span className="text-[#1a2233] font-medium truncate max-w-[200px]" title={doc.file_name}>{doc.file_name}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 pr-3">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${colorClass}`}>{doc.doc_type}</span>
                                  </td>
                                  <td className="py-3 pr-3 text-[#4a5568]">{doc.uploaded_by_name || '\u2014'}</td>
                                  <td className="py-3 pr-3 text-[#8a96a8] whitespace-nowrap">{formatUploadDate(doc.created_at)}</td>
                                  <td className="py-3 pr-3 text-[#8a96a8] whitespace-nowrap">{formatFileSize(doc.file_size)}</td>
                                  <td className="py-2">
                                    <div className="flex items-center gap-1.5">
                                      <button type="button" onClick={() => setPreviewModal({ open: true, doc })}
                                        className="h-7 px-2.5 text-xs rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-semibold">
                                        View
                                      </button>
                                      <a href={doc.file_url} download={doc.file_name}
                                        className="h-7 px-2.5 text-xs rounded-md bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold inline-flex items-center no-underline">
                                        Download
                                      </a>
                                      {canDelete && (
                                        <button type="button" onClick={() => handleDelete(doc)}
                                          className="h-7 px-2.5 text-xs rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-semibold">
                                          Delete
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {uploadModal.open && uploadModal.job && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-[#e2e6ed] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between">
              <div className="text-sm font-semibold text-[#1a2233]">Upload Document \u2014 {uploadModal.job.job_no} {uploadModal.job.client}</div>
              <button type="button" onClick={() => { setUploadModal({ open: false, job: null }); setUploadFile(null); setUploadDocType('BL'); setUploadProgress(0) }}
                className="h-8 w-8 flex items-center justify-center rounded-lg bg-white border border-[#e2e6ed] hover:bg-[#fef2f2] hover:border-[#fecaca] hover:text-[#dc2626] text-[#8a96a8] transition-colors text-lg leading-none">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#8a96a8] uppercase tracking-wide mb-1">Document Type</label>
                <select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} className={selectBase}>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#8a96a8] uppercase tracking-wide mb-1">File</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-400', 'bg-blue-50') }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50') }}
                  onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50'); const f = e.dataTransfer?.files?.[0]; if (f) { if (f.size > 10 * 1024 * 1024) { showToast('File size must be under 10MB.', 'error') } else { setUploadFile(f) } } }}
                  className={`border-2 border-dashed rounded-xl px-4 py-8 text-center cursor-pointer transition-colors ${uploadFile ? 'border-green-300 bg-green-50' : 'border-[#d0d6e0] hover:border-blue-300'}`}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 10 * 1024 * 1024) { showToast('File size must be under 10MB.', 'error') } else { setUploadFile(f) } } }} className="hidden" />
                  {uploadFile ? (
                    <div>
                      <p className="text-sm font-semibold text-[#1a2233] break-all">{uploadFile.name}</p>
                      <p className="text-xs text-[#8a96a8] mt-1">{formatFileSize(uploadFile.size)}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-[#8a96a8]">Click to select or drag &amp; drop</p>
                      <p className="text-xs text-[#8a96a8] mt-1">PDF, JPG, PNG \u2014 max 10MB</p>
                    </div>
                  )}
                </div>
              </div>
              {uploading && (
                <div>
                  <div className="h-1.5 bg-[#e2e6ed] border border-[#e2e6ed] rounded-full overflow-hidden">
                    <div className="h-full bg-[#1a4fa0] rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-[#e2e6ed] flex items-center justify-end gap-2">
              <button type="button" onClick={() => { setUploadModal({ open: false, job: null }); setUploadFile(null); setUploadDocType('BL'); setUploadProgress(0) }}
                className={`${btnBase} bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8]`}>
                Cancel
              </button>
              <button type="button" onClick={handleUpload} disabled={uploading || !uploadFile || !uploadDocType}
                className={`${btnBase} bg-[#1a4fa0] text-white hover:bg-[#153d82] inline-flex items-center gap-2`}>
                {uploading && <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {uploading ? `${uploadProgress}%` : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewModal.open && previewModal.doc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-2xl border border-[#e2e6ed] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-[#1a2233] truncate">{previewModal.doc.file_name}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${DOC_TYPE_COLORS[previewModal.doc.doc_type] || 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]'}`}>{previewModal.doc.doc_type}</span>
              </div>
              <button type="button" onClick={() => setPreviewModal({ open: false, doc: null })}
                className="h-8 w-8 flex items-center justify-center rounded-lg bg-white border border-[#e2e6ed] hover:bg-[#fef2f2] hover:border-[#fecaca] hover:text-[#dc2626] text-[#8a96a8] transition-colors text-lg leading-none shrink-0">&times;</button>
            </div>
            <div className="flex-1 overflow-auto bg-[#f4f6f9] p-4 flex items-center justify-center min-h-[300px]">
              {['pdf'].includes((previewModal.doc.file_type || '').toLowerCase()) ? (
                <iframe src={previewModal.doc.file_url} title="PDF Preview" className="w-full h-[600px] rounded-lg border border-[#e2e6ed] bg-white" />
              ) : ['jpg', 'jpeg', 'png'].includes((previewModal.doc.file_type || '').toLowerCase()) ? (
                <img src={previewModal.doc.file_url} alt={previewModal.doc.file_name} className="max-w-full max-h-[600px] rounded-lg shadow-sm object-contain" />
              ) : (
                <div className="text-center text-[#8a96a8]">
                  <p className="text-sm font-semibold">Preview not available</p>
                  <p className="text-xs mt-1">This file type cannot be previewed.</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-[#e2e6ed] flex items-center justify-end gap-2 shrink-0">
              <a href={previewModal.doc.file_url} download={previewModal.doc.file_name}
                className={`${btnBase} bg-[#1a4fa0] text-white hover:bg-[#153d82] no-underline inline-flex items-center`}>
                Download
              </a>
              <button type="button" onClick={() => setPreviewModal({ open: false, doc: null })}
                className={`${btnBase} bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8]`}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}

const STATUS_STYLES = {
  in_transit: 'bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]',
  arrived: 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]',
  customs_hold: 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]',
  delivered: 'bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]',
  empty_returned: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]',
  at_cfs: 'bg-[#f0fdfa] text-[#0f766e] border border-[#99f6e4]',
  on_rail: 'bg-[#eef2ff] text-[#3730a3] border border-[#c7d2fe]',
  delayed: 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]',
}

function formatContainerDate(ts) {
  if (!ts) return '\u2014'
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function ContainerTrackingSection({ showToast }) {
  const [containers, setContainers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedContainer, setExpandedContainer] = useState(null)
  const [newContainerNo, setNewContainerNo] = useState('')
  const [addingContainer, setAddingContainer] = useState(false)
  const [checkingContainers, setCheckingContainers] = useState(new Set())

  const [newCarrier, setNewCarrier] = useState('')
  const carriers = ['Maersk', 'MSC', 'Hapag-Lloyd', 'CMA-CGM', 'ONE', 'OOCL', 'COSCO']

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchAllTracking()
      setContainers(data)
    } catch (e) {
      setError(e?.message || 'Failed to load container data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleCheckStatus = async (containerNo, carrier) => {
    setCheckingContainers((prev) => new Set(prev).add(containerNo))
    try {
      const updated = await checkContainerStatus(containerNo, carrier)
      setContainers((prev) => prev.map((c) => c.containerNo === containerNo ? { ...c, ...updated } : c))
      showToast(`Updated status for ${containerNo}`, 'success')
    } catch (e) {
      showToast(e.message || `Check failed for ${containerNo}`, 'error')
    } finally {
      setCheckingContainers((prev) => { const next = new Set(prev); next.delete(containerNo); return next })
    }
  }

  const handleAddContainer = async () => {
    const cn = newContainerNo.trim().toUpperCase()
    if (!cn || cn.length < 4) {
      showToast('Enter a valid container number (min 4 chars)', 'error')
      return
    }
    if (!newCarrier) {
      showToast('Select a shipping line', 'error')
      return
    }
    if (containers.some((c) => c.containerNo === cn)) {
      showToast('Container already tracked', 'error')
      return
    }
    setAddingContainer(true)
    try {
      await lookupAndSaveContainer(cn, newCarrier)
      showToast(`Added container ${cn}`, 'success')
      setNewContainerNo('')
      setNewCarrier('')
      await loadData(true)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setAddingContainer(false)
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return containers
    return containers.filter((c) =>
      (c.containerNo || '').toLowerCase().includes(q) ||
      (c.carrier || '').toLowerCase().includes(q) ||
      (c.vessel || '').toLowerCase().includes(q) ||
      (c.currentLocation || '').toLowerCase().includes(q)
    )
  }, [containers, searchQuery])

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
<div className="text-lg font-bold text-[#1a2233]">Container Tracking</div>
            <div className="text-sm text-[#8a96a8]">On-demand &mdash; click "Check Status" per container</div>
          </div>
        </div>
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl p-4 shadow-sm hover:shadow-md hover:border-[#d0d6e0] space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-[#e2e6ed] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-lg font-bold text-[#1a2233]">Container Tracking</div>
            <div className="text-sm text-[#8a96a8]">On-demand &mdash; click "Check Status" per container</div>
          </div>
        </div>
        <div className="bg-white border border-red-200 rounded-xl shadow-sm p-10 text-center">
          <p className="text-red-600 font-semibold mb-2">Failed to load container data</p>
          <button type="button" onClick={() => loadData()}
            className="h-8 px-4 text-xs font-semibold rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82]">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 bg-white border-[1.5px] border-[#e2e6ed] rounded-xl p-4 shadow-sm hover:shadow-md hover:border-[#d0d6e0]">
        <input value={newContainerNo} onChange={(e) => setNewContainerNo(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleAddContainer()}
          placeholder="Enter container number (e.g. MAEU1234567)"
          className="flex-1 min-w-[180px] h-7 px-2.5 text-xs bg-[#f8f9fb] border-[1.5px] border-[#e2e6ed] rounded-lg outline-none focus:border-[#1a4fa0] text-[#1a2233] placeholder:text-[#8a96a8]" />
        <select value={newCarrier} onChange={(e) => setNewCarrier(e.target.value)}
          className="h-7 px-2 text-xs bg-white border-[1.5px] border-[#e2e6ed] rounded-lg outline-none focus:border-[#1a4fa0] text-[#4a5568]">
          <option value="">Shipping line...</option>
          {carriers.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="button" onClick={handleAddContainer} disabled={addingContainer || !newCarrier}
          className="h-7 px-3 text-xs font-semibold rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] disabled:opacity-50 inline-flex items-center gap-1">
          {addingContainer ? <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '+'}
          {addingContainer ? 'Adding...' : 'Track'}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-lg font-bold text-[#1a2233]">Container Tracking</div>
          <div className="text-sm text-[#8a96a8]">On-demand &mdash; click "Check Status" per container</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center h-8 px-3 bg-[#f8f9fb] border-[1.5px] border-[#e2e6ed] rounded-lg min-w-[200px]">
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search container, carrier, vessel..."
              className="w-full bg-transparent outline-none text-xs text-[#1a2233] placeholder:text-[#8a96a8]" />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-10 text-center text-[#8a96a8]">
          {searchQuery.trim() ? 'No containers match your search.' : 'No container data available.'}
        </div>
      ) : (
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#f8f9fb] text-[#8a96a8] border-b border-[#e2e6ed]">
                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-3 py-3">Job #</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-3 py-3">Container</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-3 py-3">Status</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-3 py-3">Location</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-3 py-3">Last Update</th>
                  <th className="text-center font-semibold uppercase tracking-wide text-xs px-3 py-3">Check</th>
                  <th className="w-8 px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const isExpanded = expandedContainer === c.containerNo
                  const statusCls = STATUS_STYLES[c.status] || 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]'
                  const isChecking = checkingContainers.has(c.containerNo)
                  return (
                    <tr key={c.containerNo} className="border-b border-[#e2e6ed] last:border-b-0">
                      <td className="px-3 py-3 font-mono text-[#1a4fa0] text-xs max-w-[80px] truncate" title={c.jobNumber}>{c.jobNumber || '\u2014'}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[#1a2233] font-bold text-sm">{c.containerNo}</span>
                          <span className="text-xs text-[#8a96a8] font-mono">{c.carrier}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${statusCls}`}>{c.statusText}</span>
                      </td>
                      <td className="px-3 py-3 text-[#4a5568] max-w-[120px] truncate text-xs" title={c.currentLocation}>{c.currentLocation || '\u2014'}</td>
                      <td className="px-3 py-3 text-[#8a96a8] whitespace-nowrap text-xs">{formatContainerDate(c.lastUpdate)}</td>
                      <td className="px-3 py-3 text-center">
                        <button type="button" onClick={() => handleCheckStatus(c.containerNo, c.carrier)} disabled={isChecking}
                          title={`Scrape ${c.carrier} website for live status`}
                          className="bg-[#e8eef8] border border-[#bfdbfe] text-[#1a4fa0] hover:bg-[#1a4fa0] hover:text-white hover:border-[#1a4fa0] text-xs font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50 inline-flex items-center gap-1">
                          {isChecking ? <span className="h-2.5 w-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '\u25C9'}
                          {isChecking ? 'Checking...' : 'Check Status'}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => setExpandedContainer(isExpanded ? null : c.containerNo)}
                          className="text-[#8a96a8] hover:text-[#1a2233] transition-colors text-xs">
                          {isExpanded ? '\u25B2' : '\u25BC'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {expandedContainer && (
            <ContainerTimeline
              container={containers.find((c) => c.containerNo === expandedContainer)}
              onClose={() => setExpandedContainer(null)}
            />
          )}
        </div>
      )}

      <div className="mt-3 text-xs text-[#8a96a8]">
        {filtered.length} container{filtered.length !== 1 ? 's' : ''} tracked &middot; Click "Check Status" to fetch live updates
      </div>
    </div>
  )
}

function ContainerTimeline({ container, onClose }) {
  if (!container) return null
  return (
    <div className="border-t border-[#e2e6ed] bg-white px-4 sm:px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-[#1a2233]">Milestones &mdash; {container.containerNo}</div>
        <button type="button" onClick={onClose}
          className="text-xs font-semibold text-blue-700 hover:text-blue-800">Close</button>
      </div>
      {container.milestones.length === 0 ? (
        <p className="text-xs text-[#8a96a8] py-4 text-center">No milestone data available.</p>
      ) : (
        <div className="relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-[#e2e6ed]" />
          <div className="space-y-3">
            {container.milestones.map((m, i) => (
              <div key={i} className="flex items-start gap-3 relative">
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 z-10 ${
                  i === container.milestones.length - 1
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-white border-[#d0d6e0]'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#1a2233]">{m.description}</p>
                  <p className="text-xs text-[#8a96a8]">
                    {m.location} &middot; {formatContainerDate(m.date)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OCRSection({ jobs, currentUserName, showToast, user: ocrUser, profile: ocrProfile }) {
  const [step, setStep] = useState(1)
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedDocIds, setSelectedDocIds] = useState(new Set())
  const [extracting, setExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState('')
  const [extractError, setExtractError] = useState(null)
  const [extractedData, setExtractedData] = useState(null)
  const [extractEdits, setExtractEdits] = useState({})
  const [savedExtraction, setSavedExtraction] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [ocrSearch, setOcrSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const TEXTAREA_FIELDS = ['goods_description', 'goods_description_detailed', 'shipper_address', 'consignee_address', 'marks_and_numbers']

  const filteredJobs = useMemo(() => {
    const q = ocrSearch.trim().toLowerCase()
    if (!q) return jobs || []
    return (jobs || []).filter((j) =>
      (j.job_no || '').toLowerCase().includes(q) ||
      (j.client || '').toLowerCase().includes(q)
    )
  }, [jobs, ocrSearch])

  const stepInfo = [
    { num: 1, label: 'Select Job' },
    { num: 2, label: 'Select Docs' },
    { num: 3, label: 'Extract' },
    { num: 4, label: 'Review' },
    { num: 5, label: 'Save' },
    { num: 6, label: 'Download' },
    { num: 7, label: 'ICEGATE', manual: true },
  ]

  const fetchDocuments = async (job) => {
    setLoadingDocs(true)
    const { data, error } = await supabase.from('documents').select('*').eq('job_id', job.id)
    if (!error) setDocuments(data ?? [])
    setLoadingDocs(false)
  }

  const handleSelectJob = async (job) => {
    setSelectedJob(job)
    setSelectedDocIds(new Set())
    setExtractedData(null)
    setExtractEdits({})
    setExtractError(null)
    setSavedExtraction(null)
    setDocuments([])
    setLoadingDocs(true)
    const { data: extraction } = await supabase.from('job_extractions').select('*').eq('job_id', job.id).maybeSingle()
    if (extraction) {
      setSavedExtraction(extraction)
      setLoadingDocs(false)
    } else {
      await fetchDocuments(job)
      setStep(2)
    }
  }

  const handleViewSaved = () => {
    if (!savedExtraction) return
    setExtractedData({ result: savedExtraction.extracted_data, provider: 'saved' })
    setExtractEdits({ ...savedExtraction.extracted_data })
    setStep(4)
  }

  const handleExtractAgain = async () => {
    setSavedExtraction(null)
    await fetchDocuments(selectedJob)
    setStep(2)
  }

  const toggleDoc = (id) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedDocIds.size === documents.length) {
      setSelectedDocIds(new Set())
    } else {
      setSelectedDocIds(new Set(documents.map((d) => d.id)))
    }
  }

  const handleExtract = async () => {
    const selectedDocs = documents.filter((d) => selectedDocIds.has(d.id))
    if (selectedDocs.length === 0) { showToast('Select at least one document.', 'error'); return }
    setStep(3)
    setExtracting(true)
    setExtractProgress('Preparing documents...')
    setExtractError(null)
    try {
      setExtractProgress('Extracting data with AI...')
      const { result, provider } = await extractWithFallback(selectedDocs, EXTRACTION_PROMPT)
      setExtractedData({ result, provider })
      setExtractEdits(JSON.parse(JSON.stringify(result)))
      showToast('Extraction complete!', 'success')
      setStep(4)
    } catch (e) {
      setExtractError(e?.message || 'Extraction failed.')
      showToast(e?.message || 'Extraction failed.', 'error')
    } finally {
      setExtracting(false)
      setExtractProgress('')
    }
  }

  const handleSave = async () => {
    if (!selectedJob || !extractedData) return
    setSaving(true)
    try {
      const { error } = await supabase.from('job_extractions').upsert({
        job_id: selectedJob.id,
        job_no: selectedJob.job_no,
        extracted_data: extractEdits,
        extracted_by: ocrUser?.id || '',
        extracted_by_name: currentUserName,
        extracted_at: new Date().toISOString(),
      })
      if (error) throw error
      showToast('Extraction saved to database.', 'success')
      setSavedExtraction({ job_id: selectedJob.id, extracted_data: extractEdits })
    } catch (e) {
      showToast(e?.message || 'Save failed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new()
    const headers = Object.values(FIELD_LABELS_OCR)
    const values = Object.keys(FIELD_LABELS_OCR).map((k) => {
      const v = extractEdits?.[k]?.value
      return v != null ? String(v) : ''
    })
    const data = [
      ['JDS Logistics'],
      [`AI Document Extraction \u2014 ${selectedJob?.job_no || ''}`],
      [],
      headers,
      values,
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }]
    ws['!cols'] = headers.map(() => ({ wch: 20 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Extraction')
    XLSX.writeFile(wb, `OCR_Extraction_${selectedJob?.job_no || 'export'}.xlsx`)
  }

  const btnBase = 'h-9 px-4 text-sm rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const cardBase = 'bg-white border border-[#e2e6ed] rounded-xl shadow-sm'

  const confidenceColor = (conf) => {
    if (conf === 'high') return 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]'
    if (conf === 'medium') return 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]'
    if (conf === 'low') return 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]'
    return 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]'
  }

  const inputBase = 'w-full h-9 px-3 py-2 text-sm rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#e8eef8]'
  const textareaBase = 'w-full px-3 py-2 text-sm rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#e8eef8] resize-none'

  return (
    <div className="flex gap-[18px] items-start">

      {/* ── LEFT MAIN COLUMN ── */}
      <div className="flex-1 min-w-0">

        {/* ── STEP INDICATOR (shown on all steps) ── */}
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden mb-[18px]">
          <div className="px-5 py-4 flex items-center gap-0">
            {stepInfo.map((s, i) => {
              const done   = s.num < step
              const active = s.num === step
              return (
                <div key={s.num} className="flex items-center flex-1 min-w-0">
                  <div className="flex flex-col items-center shrink-0">
                    <div className={[
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                      done    ? 'bg-[#1a4fa0] border-[#1a4fa0] text-white'
                      : active ? 'bg-white border-[#1a4fa0] text-[#1a4fa0]'
                               : 'bg-[#f4f6f9] border-[#d0d6e0] text-[#8a96a8]'
                    ].join(' ')}>
                      {done ? '\u2713' : s.num}
                    </div>
                    <span className={[
                      'text-[10px] font-semibold mt-1 whitespace-nowrap',
                      active ? 'text-[#1a4fa0]' : done ? 'text-[#1a2233]' : 'text-[#8a96a8]'
                    ].join(' ')}>
                      {s.label}
                    </span>
                  </div>
                  {i < stepInfo.length - 1 && (
                    <div className={[
                      'flex-1 h-[2px] mx-1 mb-4',
                      done ? 'bg-[#1a4fa0]' : 'bg-[#e2e6ed]'
                    ].join(' ')} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── STEP 1: SELECT JOB ── */}
        {step === 1 && (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-[#1a2233]">AI Document Extraction</div>
                <div className="text-xs text-[#8a96a8] mt-0.5">Select a job · Groq + Llama 4 Scout reads and extracts all fields</div>
              </div>
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]">✦ AI Ready</span>
            </div>
            <div className="p-5">
              {/* Search */}
              <div className="flex items-center gap-2 h-10 px-4 bg-[#f8f9fb] border-[1.5px] border-[#e2e6ed] rounded-lg mb-4 focus-within:border-[#1a4fa0] focus-within:bg-white transition-colors">
                <span className="text-[#8a96a8] text-sm">🔍</span>
                <input
                  value={ocrSearch}
                  onChange={(e) => setOcrSearch(e.target.value)}
                  placeholder="Search by job no. or client..."
                  className="flex-1 bg-transparent outline-none text-sm text-[#1a2233] placeholder:text-[#8a96a8]"
                />
              </div>

              {/* Saved extraction banner */}
              {savedExtraction && (
                <div className="mb-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#15803d]">Saved extraction found for {selectedJob?.job_no}</p>
                    <p className="text-xs text-[#166534] mt-0.5">
                      Extracted on {savedExtraction.extracted_at ? new Date(savedExtraction.extracted_at).toLocaleDateString('en-IN') : '\u2014'}
                      {savedExtraction.extracted_by_name ? ` · ${savedExtraction.extracted_by_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={handleViewSaved}
                      className="h-8 px-3 text-xs font-semibold rounded-lg bg-[#16a34a] text-white hover:bg-[#15803d] transition-colors">
                      View Saved
                    </button>
                    <button type="button" onClick={handleExtractAgain}
                      className="h-8 px-3 text-xs font-semibold rounded-lg bg-white border border-[#bbf7d0] text-[#15803d] hover:bg-[#f0fdf4] transition-colors">
                      Extract Again
                    </button>
                  </div>
                </div>
              )}

              {/* Job list */}
              <div className="border border-[#e2e6ed] rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-[#f8f9fb] border-b border-[#e2e6ed] flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#8a96a8] uppercase tracking-wider">Select Job</span>
                  <span className="text-xs text-[#8a96a8]">{filteredJobs.length} jobs</span>
                </div>
                <div className="divide-y divide-[#e2e6ed] max-h-[400px] overflow-y-auto scrollbar-thin">
                  {filteredJobs.map((job) => (
                    <div
                      key={job.id}
                      role="button" tabIndex={0}
                      onClick={() => handleSelectJob(job)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSelectJob(job)}
                      className={[
                        'px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors',
                        selectedJob?.id === job.id
                          ? 'bg-[#e8eef8] border-l-[3px] border-l-[#1a4fa0]'
                          : 'hover:bg-[#f8f9fb]'
                      ].join(' ')}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#1a4fa0] font-mono">{job.job_no || '\u2014'}</span>
                          <span className="text-xs text-[#8a96a8] truncate">{job.client || ''}</span>
                        </div>
                        <div className="text-xs text-[#8a96a8] mt-0.5">
                          Stage {job.stage ?? 0} · {job.mode || '\u2014'} · {job.goods ? String(job.goods).slice(0, 32) : '\u2014'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0] ocr-saved-badge" data-jobid={job.id} style={{display:'none'}}>
                          ✓ Saved
                        </span>
                        <span className="text-[#d0d6e0] text-xs">→</span>
                      </div>
                    </div>
                  ))}
                  {filteredJobs.length === 0 && (
                    <div className="px-4 py-10 text-center text-sm text-[#8a96a8]">
                      {ocrSearch.trim() ? 'No jobs match your search.' : 'No jobs available.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: SELECT DOCUMENTS ── */}
        {step === 2 && (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center gap-3">
              <button type="button" onClick={() => setStep(1)}
                className="h-8 px-3 text-xs font-semibold rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] transition-colors">
                ← Back
              </button>
              <div>
                <span className="text-sm font-bold text-[#1a2233]">{selectedJob?.job_no}</span>
                <span className="text-xs text-[#8a96a8] ml-2">{selectedJob?.client}</span>
              </div>
            </div>

            {loadingDocs ? (
              <div className="p-12 flex flex-col items-center gap-3">
                <div className="h-9 w-9 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[#8a96a8]">Loading documents...</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-3xl mb-3">📄</div>
                <p className="text-sm font-semibold text-[#4a5568]">No documents uploaded for this job</p>
                <p className="text-xs text-[#8a96a8] mt-1">Upload documents in the Documents tab first.</p>
              </div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-[#e2e6ed] bg-[#f8f9fb] flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox"
                      checked={selectedDocIds.size === documents.length && documents.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-[#d0d6e0] text-[#1a4fa0]" />
                    <span className="text-[11px] font-bold text-[#8a96a8] uppercase tracking-wider">Select Documents to Extract</span>
                  </label>
                  <span className="text-xs text-[#8a96a8]">{selectedDocIds.size} / {documents.length} selected</span>
                </div>
                <div className="divide-y divide-[#e2e6ed]">
                  {documents.map((doc) => (
                    <label key={doc.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8f9fb] cursor-pointer transition-colors">
                      <input type="checkbox"
                        checked={selectedDocIds.has(doc.id)}
                        onChange={() => toggleDoc(doc.id)}
                        className="h-4 w-4 rounded border-[#d0d6e0] text-[#1a4fa0] shrink-0" />
                      <span className="text-sm">📄</span>
                      <span className="text-sm text-[#1a2233] font-medium flex-1 truncate">{doc.file_name}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe] shrink-0">
                        {doc.doc_type || 'Other'}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="px-5 py-4 border-t border-[#e2e6ed] bg-[#f8f9fb]">
                  <button type="button" onClick={handleExtract} disabled={selectedDocIds.size === 0}
                    className="h-9 px-5 text-sm font-semibold rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2">
                    <span>✦</span>
                    Extract with AI ({selectedDocIds.size} document{selectedDocIds.size !== 1 ? 's' : ''})
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 3: EXTRACTING ── */}
        {step === 3 && (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-12 text-center">
            <div className="text-4xl mb-5">✦</div>
            <div className="h-12 w-12 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin mx-auto mb-5" />
            <p className="text-base font-bold text-[#1a2233] mb-1">Extracting Document Data</p>
            <p className="text-sm text-[#4a5568] mb-1">{extractProgress || 'Processing documents with AI...'}</p>
            <p className="text-xs text-[#8a96a8]">Groq Llama 4 Scout · Gemini 2.5 Flash fallback · This may take 30–60 seconds</p>
            {extractError && (
              <div className="mt-5 p-4 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-left">
                <p className="text-sm font-semibold text-[#991b1b] mb-2">{extractError}</p>
                <button type="button" onClick={handleExtract}
                  className="h-9 px-4 text-sm font-semibold rounded-lg bg-[#dc2626] text-white hover:bg-[#b91c1c] transition-colors">
                  Retry
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: REVIEW EXTRACTED FIELDS ── */}
        {step === 4 && extractedData && (
          <div>
            {/* Provider + job banner */}
            <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl px-5 py-3 mb-4 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <span className={[
                  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold',
                  extractedData.provider === 'groq'   ? 'bg-[#f5f3ff] text-[#5b21b6] border border-[#ddd6fe]'
                  : extractedData.provider === 'gemini' ? 'bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]'
                                                       : 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]'
                ].join(' ')}>
                  {extractedData.provider === 'groq' ? '\u26A1 Groq' : extractedData.provider === 'gemini' ? '\u2726 Gemini' : '\u2713 Saved'}
                </span>
                <div>
                  <span className="text-sm font-bold text-[#1a2233]">{selectedJob?.job_no}</span>
                  <span className="text-xs text-[#8a96a8] ml-2">{selectedJob?.client}</span>
                </div>
              </div>
              {(() => {
                const vals = Object.values(extractEdits || {})
                const high = vals.filter(f => f?.confidence === 'high').length
                const med  = vals.filter(f => f?.confidence === 'medium').length
                const miss = vals.filter(f => !f?.value).length
                return (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-full bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0] text-xs font-semibold">{high} high</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#fffbeb] text-[#92400e] border border-[#fde68a] text-xs font-semibold">{med} medium</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#fef2f2] text-[#991b1b] border border-[#fecaca] text-xs font-semibold">{miss} missing</span>
                  </div>
                )
              })()}
            </div>

            {/* Section cards with fields */}
            <div className="space-y-4 mb-5">
              {OCR_SECTIONS.map((section) => (
                <div key={section.title} className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#e2e6ed] bg-[#f8f9fb]">
                    <span className="text-sm font-bold text-[#1a2233]">{section.title}</span>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {section.fields.map((key) => {
                      const field = extractEdits?.[key] || {}
                      const label = FIELD_LABELS_OCR[key] || key
                      const isLong = TEXTAREA_FIELDS.includes(key)
                      const isEmpty = field.value == null || field.value === ''
                      const leftBorder =
                        isEmpty                         ? 'border-l-[#dc2626]'
                        : field.confidence === 'high'   ? 'border-l-[#16a34a]'
                        : field.confidence === 'medium' ? 'border-l-[#f59e0b]'
                                                        : 'border-l-[#dc2626]'
                      const bgTint =
                        isEmpty                         ? 'bg-[#fffafa]'
                        : field.confidence === 'high'   ? 'bg-white'
                                                        : 'bg-white'
                      return (
                        <div key={key}
                          className={[
                            'rounded-[7px] border-[1.5px] border-[#e2e6ed] border-l-4 p-[10px] transition-all',
                            leftBorder, bgTint,
                            isLong ? 'md:col-span-2' : ''
                          ].join(' ')}>
                          <div className="flex items-center justify-between mb-1.5 gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8a96a8]">{label}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {field.confidence && (
                                <span className={[
                                  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                                  field.confidence === 'high'   ? 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]'
                                  : field.confidence === 'medium' ? 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]'
                                                                 : 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]'
                                ].join(' ')}>
                                  {field.confidence}
                                </span>
                              )}
                              {field.source && (
                                <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-[#f8f9fb] text-[#4a5568] border border-[#d0d6e0]">
                                  {field.source}
                                </span>
                              )}
                            </div>
                          </div>
                          {isEmpty ? (
                            <p className="text-xs text-[#dc2626] italic">Not found — enter manually</p>
                          ) : isLong ? (
                            <textarea
                              value={field.value || ''}
                              onChange={(e) => setExtractEdits(prev => ({ ...prev, [key]: { ...prev[key], value: e.target.value } }))}
                              rows={2}
                              className="w-full px-3 py-2 text-sm rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0] resize-none"
                            />
                          ) : (
                            <input
                              value={field.value || ''}
                              onChange={(e) => setExtractEdits(prev => ({ ...prev, [key]: { ...prev[key], value: e.target.value } }))}
                              className="w-full h-9 px-3 text-sm rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0]"
                            />
                          )}
                          {/* Confidence hint below field */}
                          {!isEmpty && field.confidence && (
                            <div className={[
                              'text-[10px] mt-1',
                              field.confidence === 'high'   ? 'text-[#16a34a]'
                              : field.confidence === 'medium' ? 'text-[#b45309]'
                                                             : 'text-[#dc2626]'
                            ].join(' ')}>
                              {field.confidence === 'high' ? '\u25CF High confidence' : field.confidence === 'medium' ? '\u25CF Medium \u2014 please verify' : '\u25CF Low confidence \u2014 check manually'}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Action footer */}
            <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl px-5 py-4 flex items-center justify-between shadow-sm">
              <button type="button"
                onClick={() => { setStep(1); setSelectedJob(null); setExtractedData(null); setExtractEdits({}) }}
                className="h-9 px-4 text-sm font-semibold rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] transition-colors">
                ← Start Over
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleDownloadExcel}
                  className="h-9 px-4 text-sm font-semibold rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] transition-colors inline-flex items-center gap-1.5">
                  ↓ Download Excel
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="h-9 px-5 text-sm font-semibold rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] disabled:opacity-50 transition-colors inline-flex items-center gap-2 justify-center"
                  style={{minWidth:'160px'}}>
                  {saving && <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Saving...' : '\u2193 Save to Database'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>{/* end left column */}

      {/* ── RIGHT SIDEBAR ── */}
      <div className="w-[300px] shrink-0 flex flex-col gap-[16px]">

        {/* Step 1\u20133: Recent Extractions */}
        {step < 4 && (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e6ed]">
              <div className="text-sm font-bold text-[#1a2233]">Recent Extractions</div>
            </div>
            <div className="py-1">
              {[
                { jobNo: 'J-00071', desc: 'BL + Invoice · 19/21 fields', time: 'Today, 2:34 PM · Akshyani', dot: '#16a34a' },
                { jobNo: 'J-00068', desc: 'BL + COO · All 21 fields', time: 'Today, 11:20 AM · Akshyani', dot: '#16a34a' },
                { jobNo: 'J-00065', desc: 'Invoice only · 14/21 fields', time: 'Yesterday · Akshyani', dot: '#f59e0b' },
              ].map((r) => (
                <div key={r.jobNo} className="flex gap-3 px-5 py-3 border-b border-[#e2e6ed] last:border-b-0">
                  <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: r.dot }} />
                  <div>
                    <div className="text-sm text-[#1a2233]"><strong className="text-[#1a4fa0] font-semibold">{r.jobNo}</strong> — {r.desc}</div>
                    <div className="text-[11px] text-[#8a96a8] mt-0.5 font-mono">{r.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 1\u20133: Performance Stats */}
        {step < 4 && (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e6ed]">
              <div className="text-sm font-bold text-[#1a2233]">Performance Stats</div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {[
                { label: 'Average accuracy',      value: '91.4%',    color: '#16a34a' },
                { label: 'Documents processed',   value: '147',      color: '#1a4fa0' },
                { label: 'Time saved per month',  value: '~18 hours', color: '#b45309' },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between px-3 py-2.5 bg-[#f8f9fb] border-[1.5px] border-[#e2e6ed] rounded-lg">
                  <span className="text-sm text-[#4a5568]">{s.label}</span>
                  <span className="text-base font-bold" style={{ color: s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Extraction Stats */}
        {step === 4 && extractedData && (() => {
          const vals  = Object.values(extractEdits || {})
          const total = vals.length
          const found = vals.filter(f => f?.value).length
          const high  = vals.filter(f => f?.confidence === 'high').length
          const med   = vals.filter(f => f?.confidence === 'medium').length
          const low   = vals.filter(f => f?.confidence === 'low' && f?.value).length
          const miss  = vals.filter(f => !f?.value).length
          return (
            <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#e2e6ed]">
                <div className="text-sm font-bold text-[#1a2233]">Extraction Stats</div>
              </div>
              <div className="p-4 flex flex-col gap-3">
                {/* Fill rate bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-[#8a96a8]">Fill rate</span>
                    <span className="font-bold text-[#1a4fa0]">{total ? Math.round((found/total)*100) : 0}%</span>
                  </div>
                  <div className="h-2 bg-[#e2e6ed] rounded-full overflow-hidden">
                    <div className="h-full bg-[#1a4fa0] rounded-full" style={{ width: `${total ? (found/total)*100 : 0}%` }} />
                  </div>
                </div>
                {/* Stat rows */}
                {[
                  { label: 'Total fields',      value: total,  color: '#1a2233' },
                  { label: 'Fields found',      value: found,  color: '#1a2233' },
                  { label: '\u25CF High confidence', value: high,   color: '#16a34a' },
                  { label: '\u25CF Medium',          value: med,    color: '#b45309' },
                  { label: '\u25CF Low confidence',  value: low,    color: '#dc2626' },
                  { label: '\u25CB Not found',       value: miss,   color: '#8a96a8' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between px-3 py-2 bg-[#f8f9fb] border-[1.5px] border-[#e2e6ed] rounded-lg">
                    <span className="text-sm" style={{ color: s.color }}>{s.label}</span>
                    <span className="text-sm font-bold" style={{ color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Step 4: Tips */}
        {step === 4 && (
          <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-4">
            <p className="text-xs font-bold text-[#1e40af] mb-2">💡 Tips</p>
            <ul className="text-xs text-[#1e40af] space-y-1.5 list-disc list-inside">
              <li>Red border = not found or low confidence</li>
              <li>Green border = high confidence extraction</li>
              <li>Edit any field before saving</li>
              <li>Download Excel for ICEGATE / Live Impex entry</li>
            </ul>
          </div>
        )}

      </div>{/* end right sidebar */}

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

  const controlTower = useMemo(() => {
    const active = (jobs || []).filter((j) => Number(j.stage) !== 10)

    const priorityItems = active.map((job) => {
      const stage = Number(job.stage) || 0
      const left = freeDaysLeft(job)
      const hours = lastUpdateAgeHours(job)
      const urgent = String(job.priority || '').toLowerCase() === 'urgent'
      const highRisk = String(job.detention_risk || '').toLowerCase() === 'high'
      let score = urgent ? 40 : 0
      let issue = urgent ? 'Urgent priority' : 'Needs review'
      let action = 'Open job'
      let tone = urgent ? 'red' : 'blue'

      if (left !== null && left <= 2) {
        score += left <= 0 ? 60 : 45
        issue = left <= 0 ? 'Free days expired' : 'Free days ending soon'
        action = 'Clear / deliver'
        tone = left <= 0 ? 'red' : 'amber'
      } else if ([6, 8].includes(stage)) {
        score += 34
        issue = stage === 6 ? 'Duty payment pending' : 'CFS coordination pending'
        action = stage === 6 ? 'Confirm payment' : 'Coordinate CFS'
        tone = 'violet'
      } else if (job.delay_reason?.trim()) {
        score += 32
        issue = job.delay_reason.trim()
        action = 'Resolve delay'
        tone = 'amber'
      } else if (highRisk) {
        score += 30
        issue = 'High detention risk'
        action = 'Review risk'
        tone = 'red'
      } else if (hours >= (urgent ? 12 : 24)) {
        score += hours >= 48 ? 28 : 20
        issue = 'No recent update'
        action = 'Ask owner'
        tone = hours >= 48 ? 'red' : 'amber'
      } else if (isEtaThisWeek(job.eta)) {
        score += 12
        issue = 'ETA this week'
        action = 'Check readiness'
        tone = 'blue'
      }

      return { job, score, issue, action, tone }
    }).filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || new Date(b.job.updated_at || 0) - new Date(a.job.updated_at || 0))
      .slice(0, 6)

    const freeDaysRisk = active.map((job) => ({ job, days: freeDaysLeft(job) }))
      .filter((x) => x.days !== null && x.days <= 4)
      .map((x) => ({ ...x, tone: x.days <= 0 ? 'red' : x.days <= 2 ? 'amber' : 'green' }))
      .sort((a, b) => a.days - b.days)
      .slice(0, 5)

    const staleUpdates = active.map((job) => ({ job, hours: lastUpdateAgeHours(job) }))
      .filter((x) => x.hours >= (String(x.job.priority || '').toLowerCase() === 'urgent' ? 12 : 24))
      .map((x) => ({ ...x, tone: x.hours >= 48 ? 'red' : 'amber' }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5)

    const stageMap = new Map()
    active.forEach((job) => {
      const stage = Number(job.stage) || 0
      stageMap.set(stage, (stageMap.get(stage) || 0) + 1)
    })
    const stageBottlenecks = [...stageMap.entries()]
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count || a.stage - b.stage)
      .slice(0, 5)

    const ownerMap = new Map()
    active.forEach((job) => {
      const name = job.assigned_to ? profiles[job.assigned_to] || 'Unassigned' : 'Unassigned'
      const row = ownerMap.get(name) || { name, active: 0, urgent: 0, stale: 0 }
      row.active += 1
      if (String(job.priority || '').toLowerCase() === 'urgent') row.urgent += 1
      if (lastUpdateAgeHours(job) >= 24) row.stale += 1
      ownerMap.set(name, row)
    })
    const employeeAccountability = [...ownerMap.values()]
      .sort((a, b) => b.active - a.active || b.urgent - a.urgent || a.name.localeCompare(b.name))
      .slice(0, 5)

    return {
      priorityItems,
      freeDaysRisk,
      staleUpdates,
      stageBottlenecks,
      stageMaxCount: Math.max(0, ...stageBottlenecks.map((x) => x.count)),
      employeeAccountability,
    }
  }, [jobs, profiles])

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
      <aside className="w-[230px] bg-[#1a4fa0] flex flex-col shrink-0 h-screen fixed left-0 top-0 z-50">
        <div className="px-5 py-4 border-b border-white/15 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white text-[#1a4fa0] flex items-center justify-center font-extrabold text-sm">JD</div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">JDS Logistics</div>
            <div className="text-xs text-white/60 truncate">Command Center</div>
          </div>
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
                    onClick={() => handleNavClick(item.id)}
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

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden ml-[230px] bg-[#f4f6f9]">
        <header className="h-[60px] bg-white border-b border-[#e2e6ed] shadow-sm px-6 flex items-center gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-[17px] font-bold text-[#1a2233] truncate">{pageTitle}</div>
            <div className="text-sm text-[#8a96a8] truncate">Live operations overview</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setShowCreateJob(true)}
              className="h-9 px-4 text-sm rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold">
              + Create Job
            </button>
            <button type="button" onClick={handleLogout}
              className="h-9 px-4 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-red-600 hover:bg-[#fef2f2] hover:border-red-300 font-semibold">
              Logout
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
                <TodayPriorityQueue items={controlTower.priorityItems} profiles={profiles} onOpen={setSelectedJob} />

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
                <StageBottlenecks items={controlTower.stageBottlenecks} maxCount={controlTower.stageMaxCount} onStage={(stage) => { setFilterStage(stage); navigate('/admin?tab=jobs') }} />
                <StaleUpdatesPanel items={controlTower.staleUpdates} onOpen={setSelectedJob} />
                <EmployeeAccountability items={controlTower.employeeAccountability} />
              </div>
            </>
            )
          )}

          {activeNav === 'jobs' && jobWorkspace}

          {activeNav === 'documents' && (
            <DocumentsSection jobs={jobs} profiles={profiles} currentUserName={currentUserName} showToast={showToast} />
          )}

          {activeNav === 'containers' && (
            <ContainerTrackingSection showToast={showToast} />
          )}

          {activeNav === 'payments' && (
            <div>
              {/* Payments KPI */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <KpiCard label="Pending Approval" value={stats.paymentsPending} hint="Total value pending" tone="red" />
                <KpiCard label="Approved Today" value="0" hint="Approved so far" tone="green" />
                <KpiCard label="Monthly Total" value="—" hint="All payments this month" tone="blue" />
              </div>

              {/* Payment Queue */}
              <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-[#1a2233]">Payment Approval Queue</div>
                    <div className="text-xs text-[#8a96a8] mt-0.5">Jobs in duty payment or CFS stage</div>
                  </div>
                </div>
                {(jobs || []).filter(j => [6,8].includes(Number(j.stage))).length > 0 ? (
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
                        {(jobs || []).filter(j => [6,8].includes(Number(j.stage))).map(job => (
                          <tr key={job.id} className="border-b border-[#e2e6ed] text-sm hover:bg-[#e8eef8]">
                            <td className="px-4 py-3 font-mono text-[#1a4fa0] font-medium">{job.job_no || '—'}</td>
                            <td className="px-4 py-3 text-[#4a5568]">{job.client || '—'}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]">
                                {getStageName(Number(job.stage) || 0)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[#4a5568]">{job.cfs_name || '—'}</td>
                            <td className="px-4 py-3 text-[#1a2233] font-medium">
                              {job.cfs_amount ? `\u20B9${Number(job.cfs_amount).toLocaleString()}` : 'Pending'}
                            </td>
                            <td className="px-4 py-3 text-[#4a5568]">{job.assigned_to ? (profiles[job.assigned_to] || '—') : '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => showToast(`Payment approved for ${job.job_no}`, 'success')}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-[#15803d] hover:bg-[#16a34a] hover:text-white transition-all">&#10003; Approve</button>
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
          )}

          {activeNav === 'compliance' && (
            <div>
              {/* Alert Banner */}
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#fffbeb] border-[1.5px] border-[#fde68a] text-[#92400e] text-sm mb-4">
                <span className="text-lg">&#9888;</span>
                <span>2 certificates expiring within 60 days. Please arrange renewal.</span>
              </div>

              {/* BIS & Licence Register */}
              <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-[#1a2233]">BIS &amp; Licence Register</div>
                    <div className="text-xs text-[#8a96a8] mt-0.5">Certificate and licence expiry tracking</div>
                  </div>
                  <button type="button" onClick={() => showToast('Coming soon', 'info')}
                    className="h-8 px-3 text-xs font-semibold rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] transition-colors">+ Add Certificate</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#f8f9fb]">
                      <tr>
                        <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Client</th>
                        <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Cert Type</th>
                        <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Cert Number</th>
                        <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Product / Scope</th>
                        <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Expiry Date</th>
                        <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Status</th>
                        <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {client:'Green Soul Agri',type:'BIS',num:'R-41234567',scope:'Sprinkler systems',exp:'15 Jun 2026',status:'Expiring in 19 days',badge:'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]',act:'Renew'},
                        {client:'NNC Industries',type:'LMPC',num:'LMPC-MH-2345',scope:'Electronic instruments',exp:'30 Jul 2026',status:'Renew in 64 days',badge:'bg-[#fffbeb] text-[#92400e] border-[#fde68a]',act:'Renew'},
                        {client:'Jiger Plastics',type:'Advance Licence',num:'ALU/2324/123456',scope:'HDPE raw material',exp:'15 Mar 2027',status:'Valid',badge:'bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]',act:'View'},
                        {client:'PCM India',type:'BIS',num:'R-52345678',scope:'Concrete pump parts',exp:'20 Sep 2026',status:'Valid',badge:'bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]',act:'View'},
                      ].map((r,i) => (
                        <tr key={i} className="border-b border-[#e2e6ed] text-sm hover:bg-[#e8eef8]">
                          <td className="px-4 py-3 text-[#1a2233] font-medium">{r.client}</td>
                          <td className="px-4 py-3 text-[#4a5568]">{r.type}</td>
                          <td className="px-4 py-3 font-mono text-[#1a4fa0]">{r.num}</td>
                          <td className="px-4 py-3 text-[#4a5568]">{r.scope}</td>
                          <td className="px-4 py-3 text-[#4a5568]">{r.exp}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${r.badge}`}>{r.status}</span>
                          </td>
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => showToast('Coming soon', 'info')}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#e8eef8] border border-[#bfdbfe] text-[#1a4fa0] hover:bg-[#1a4fa0] hover:text-white transition-all">{r.act}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
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
