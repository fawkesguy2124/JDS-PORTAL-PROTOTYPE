import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { getStageName, isEtaThisWeek } from '../utils/jobHelpers'
import CreateJob from './CreateJob'
import { fetchAllTracking, deleteTracking, lookupAndSaveContainer, checkContainerStatus } from '../services/trackingService'
import * as XLSX from 'xlsx'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const NAV_ITEMS = [
  { id: 'overview', label: 'Control Tower', icon: '■' },
  { id: 'jobs', label: 'All Jobs', icon: '☕' },
  { id: 'containers', label: 'Container Tracking', icon: '▶' },
  { id: 'documents', label: 'Documents', icon: '⌁' },
  { id: 'payments', label: 'Payments', icon: '₹' },
  { id: 'compliance', label: 'Compliance', icon: '✓' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

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
  hs_code: 'HS Code',
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
  if (p === 'urgent') return { text: 'Urgent', cls: 'bg-red-100 text-red-800' }
  if (p === 'high') return { text: 'High', cls: 'bg-amber-100 text-amber-800' }
  return { text: 'Normal', cls: 'bg-slate-100 text-slate-700' }
}

function modeChip(mode) {
  const m = String(mode || '').trim()
  if (m === 'Air') return { text: 'Air', cls: 'bg-green-100 text-green-800' }
  if (m === 'BPT/MBPT') return { text: 'BPT', cls: 'bg-purple-100 text-purple-800' }
  if (m === 'Sea LCL') return { text: 'LCL', cls: 'bg-teal-100 text-teal-800' }
  if (m === 'Sea FCL') return { text: 'FCL', cls: 'bg-blue-100 text-blue-800' }
  return { text: m || '—', cls: 'bg-slate-100 text-slate-700' }
}

function rmsChip(rms) {
  const r = String(rms || '').toLowerCase()
  const map = {
    pending: { text: 'Awaiting', cls: 'bg-slate-100 text-slate-700' },
    rms: { text: 'RMS OK', cls: 'bg-green-100 text-green-800' },
    apr: { text: 'APR', cls: 'bg-amber-100 text-amber-800' },
    acl: { text: 'ACL', cls: 'bg-amber-100 text-amber-800' },
    check: { text: '1st Check', cls: 'bg-red-100 text-red-800' },
    hold: { text: 'HOLD', cls: 'bg-red-100 text-red-800' },
  }
  return map[r] || { text: rms ? String(rms).toUpperCase() : '—', cls: 'bg-slate-100 text-slate-700' }
}

function riskChip(risk) {
  const r = String(risk || '').toLowerCase()
  if (r === 'high') return { text: 'High Risk', cls: 'bg-red-100 text-red-800' }
  if (r === 'medium') return { text: 'Medium', cls: 'bg-amber-100 text-amber-800' }
  if (r === 'low') return { text: 'Low', cls: 'bg-green-100 text-green-800' }
  return { text: displayValue(risk), cls: 'bg-slate-100 text-slate-700' }
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
    <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 text-[11px] font-medium">
      {name || '—'} · {ts ? timeAgo(ts) : '—'}
    </span>
  )
}

function KpiCard({ label, value, hint, tone, icon }) {
  const tones = { blue: 'text-blue-600', red: 'text-red-600', amber: 'text-amber-600', green: 'text-green-600', violet: 'text-violet-600' }
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm relative overflow-hidden">
      <p className="text-[11px] font-medium text-slate-600 mb-1">{label}</p>
      <p className={classNames('text-2xl font-extrabold leading-none', tones[tone] || tones.blue)}>{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
      {icon && <div className={classNames('absolute right-3 top-1/2 -translate-y-1/2 text-3xl opacity-[0.08]', tones[tone] || tones.blue)}>{icon}</div>}
    </div>
  )
}

function TowerCard({ title, subtitle, children }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900 truncate">{title}</div>
        {subtitle && <div className="text-xs text-slate-400 shrink-0">{subtitle}</div>}
      </div>
      {children}
    </section>
  )
}

function EmptyTowerState({ children }) {
  return <div className="px-4 py-8 text-sm text-center text-slate-400">{children}</div>
}

function RiskBadge({ tone = 'blue', children }) {
  const tones = {
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    green: 'bg-green-100 text-green-800',
    blue: 'bg-blue-100 text-blue-800',
    violet: 'bg-violet-100 text-violet-800',
  }
  return <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap', tones[tone] || tones.blue)}>{children}</span>
}

function TodayPriorityQueue({ items, profiles, onOpen }) {
  return (
    <TowerCard title="Today's Priority Queue" subtitle="Action-first list">
      {items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="w-[13%] text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Job</th>
                <th className="w-[18%] text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Client</th>
                <th className="w-[18%] text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Stage</th>
                <th className="w-[15%] text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Owner</th>
                <th className="w-[21%] text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Issue</th>
                <th className="w-[15%] text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Next Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ job, issue, action, tone }) => (
                <tr key={job.id} onClick={() => onOpen(job)} className="border-t border-slate-100 hover:bg-blue-50/40 cursor-pointer">
                  <td className="px-4 py-2 font-extrabold text-slate-900 truncate">{job.job_no || '—'}</td>
                  <td className="px-4 py-2 text-slate-700 truncate" title={job.client || '—'}>{job.client || '—'}</td>
                  <td className="px-4 py-2"><RiskBadge tone={tone}>{getStageName(Number(job.stage) || 0)}</RiskBadge></td>
                  <td className="px-4 py-2 text-slate-700 truncate">{job.assigned_to ? profiles[job.assigned_to] || '—' : '—'}</td>
                  <td className="px-4 py-2 text-slate-900 font-semibold truncate" title={issue}>{issue}</td>
                  <td className="px-4 py-2 text-slate-600 truncate">{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyTowerState>No urgent operational actions right now.</EmptyTowerState>}
    </TowerCard>
  )
}

function FreeDaysRiskPanel({ items, onOpen }) {
  return (
    <TowerCard title="Free Days Risk" subtitle="Detention watch">
      {items.length ? items.map(({ job, days, tone }) => (
        <button key={job.id} type="button" onClick={() => onOpen(job)} className="w-full px-4 py-3 border-t border-slate-100 text-left grid grid-cols-[1fr_auto] gap-3 hover:bg-blue-50/40">
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900 truncate">{job.job_no || '—'} · {job.client || '—'}</span>
            <span className="block text-xs text-slate-500 truncate">{job.containers || 'No containers'} · {job.cfs_name || 'CFS pending'}</span>
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
          <button key={stage} type="button" onClick={() => onStage(String(stage))} className="w-full px-4 py-3 border-t border-slate-100 text-left hover:bg-blue-50/40">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-sm font-semibold text-slate-800 truncate">{getStageName(stage)}</span>
              <span className="text-xs text-slate-500">{count} jobs</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
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
        <button key={job.id} type="button" onClick={() => onOpen(job)} className="w-full px-4 py-3 border-t border-slate-100 text-left grid grid-cols-[1fr_auto] gap-3 hover:bg-blue-50/40">
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900 truncate">{job.job_no || '—'} · {job.client || '—'}</span>
            <span className="block text-xs text-slate-500 truncate">{getStageName(Number(job.stage) || 0)}</span>
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
        <div key={x.name} className="px-4 py-3 border-t border-slate-100 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
          <div className="text-sm font-bold text-slate-900 truncate">{x.name}</div>
          <div className="text-xs text-slate-500 text-right">{x.active} active</div>
          <div className="text-xs text-slate-500 text-right">{x.urgent} urgent</div>
          <RiskBadge tone={x.stale > 1 ? 'red' : x.stale ? 'amber' : 'green'}>{x.stale} stale</RiskBadge>
        </div>
      )) : <EmptyTowerState>No assigned active jobs yet.</EmptyTowerState>}
    </TowerCard>
  )
}

function MiniStatus({ title, value, tone }) {
  const tones = { blue: 'border-t-blue-500', amber: 'border-t-amber-500', green: 'border-t-green-500', gray: 'border-t-slate-400' }
  return (
    <div className={classNames('bg-white border border-slate-200 rounded-xl shadow-sm p-3 border-t-4', tones[tone] || tones.blue)}>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{title}</p>
      <p className="text-sm font-semibold text-slate-800 mt-1 truncate" title={value}>{value}</p>
    </div>
  )
}

function DetailField({ label, value, meta, profiles }) {
  return (
    <div>
      <div className="flex items-center flex-wrap gap-1">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <FieldMetaChip meta={meta} profiles={profiles} />
      </div>
      <p className="text-sm text-slate-900 mt-0.5">{value}</p>
    </div>
  )
}

function JobProgress({ stage }) {
  const s = Number(stage) || 0
  const pct = Math.min(100, Math.round((s / 10) * 100))
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400 truncate">Stage {s}: {getStageName(s)}</span>
        <span className="text-[10px] text-slate-400">{pct}%</span>
      </div>
      <div className="mt-0.5 h-0.5 bg-slate-200 rounded overflow-hidden">
        <div className="h-full bg-blue-600 rounded" style={{ width: `${pct}%` }} />
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
      className={classNames('bg-white border border-slate-200 rounded-xl shadow-sm p-3 mb-2 cursor-pointer transition-all hover:border-blue-300 hover:shadow-md border-l-4', priorityBorder)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-slate-900 truncate">{job.job_no || '—'}</div>
          <div className="text-xs text-slate-700">{job.client || '—'} <span className="text-slate-400">· {job.goods || '—'}</span></div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            {job.be_no ? `BE:${job.be_no}` : ''}
            {job.bl_no ? `${job.be_no ? ' · ' : ''}BL:${job.bl_no}` : ''}
            {job.containers ? `${job.be_no || job.bl_no ? ' · ' : ''}${job.containers}` : ''}
            {!job.be_no && !job.bl_no && !job.containers ? '—' : ''}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {lastUpdatedName || lastUpdatedTs ? (
              <>Last updated by: <span className="text-slate-500 font-medium">{lastUpdatedName || '—'}</span> · <span>{lastUpdatedTs ? timeAgo(lastUpdatedTs) : '—'}</span></>
            ) : <span>Last updated by: —</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex flex-wrap justify-end gap-1">
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', priority.cls)}>{priority.text}</span>
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', mode.cls)}>{mode.text}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', rms.cls)}>{rms.text}</span>
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', risk.cls)}>{risk.text}</span>
          </div>
        </div>
      </div>
      <JobProgress stage={job.stage} />
      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[10px] text-slate-400">
          <span className="text-slate-500 font-medium">{assignedName}</span> · {job.destination || '—'} ·{' '}
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
    { key: 'containers', label: 'Containers', value: displayValue(job.containers) },
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
    { key: 'assigned_to', label: 'Assigned To', value: assignedName },
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
      const candidates = ['job_no','client','mode','bl_no','containers','shipping_line','vessel','eta','cfs_name','be_no','hs_code','rms_status','bg_required','cfs_amount','destination','priority','goods','free_days','detention_risk','delay_reason','notes']
      candidates.forEach((k) => {
        if (!canEditField(k)) return
        const prev = job[k]
        let next = form[k]
        if (k === 'free_days' || k === 'cfs_amount') next = next === '' || next === null || next === undefined ? null : Number(next)
        if (k === 'eta') next = next ? next : null
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

  const inputBase = 'w-full h-9 px-3 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 disabled:opacity-60 disabled:cursor-not-allowed'

  const renderFieldInput = (key) => {
    const disabled = !canEditField(key) || saving
    const value = form[key] ?? ''
    if (key === 'mode') return <select value={value||''} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="">—</option><option value="Sea FCL">Sea FCL</option><option value="Sea LCL">Sea LCL</option><option value="Air">Air</option><option value="BPT/MBPT">BPT/MBPT</option></select>
    if (key === 'priority') return <select value={value||'normal'} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
    if (key === 'rms_status') return <select value={value||'pending'} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="pending">pending</option><option value="rms">rms</option><option value="apr">apr</option><option value="acl">acl</option><option value="check">check</option><option value="hold">hold</option></select>
    if (key === 'bg_required') return <select value={value||'no'} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="no">no</option><option value="yes">yes</option><option value="100percent">100percent</option></select>
    if (key === 'detention_risk') return <select value={value||'low'} onChange={updateForm(key)} disabled={disabled} className={inputBase}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>
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
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="h-9 px-3 text-xs rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold">
          &larr; Back to Jobs
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm sm:text-base font-extrabold text-slate-900 truncate">{job.job_no} &mdash; {job.client}</div>
          <div className="mt-1 flex flex-wrap gap-2">
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', priority.cls)}>{priority.text}</span>
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', mode.cls)}>{mode.text}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editMode ? (
            <>
              <button type="button" onClick={() => setEditMode(true)} className="h-9 px-4 text-xs rounded-lg bg-[#1e3a5f] text-white hover:bg-[#16304f] font-semibold">Edit</button>
              <select disabled={!canUpdateStage||stageUpdating} value={stage} onChange={handleStageChange}
                className={classNames('h-9 px-3 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 outline-none', (!canUpdateStage||stageUpdating)?'opacity-60 cursor-not-allowed':'hover:bg-slate-100')}>
                {STAGE_LIST.map((s) => <option key={s.value} value={s.value}>{s.value} — {s.label}</option>)}
              </select>
              <span className="text-[10px] text-slate-400 font-semibold">Update Stage</span>
            </>
          ) : (
            <>
              <button type="button" disabled={saving} onClick={() => { setEditMode(false); setForm({...job}) }}
                className="h-9 px-4 text-xs rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold disabled:opacity-60">Cancel</button>
              <button type="button" disabled={saving} onClick={handleSave}
                className="h-9 px-4 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold disabled:opacity-60 inline-flex items-center gap-2">
                {saving && <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Save
              </button>
            </>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/60">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-xs font-semibold text-slate-500 truncate">{stageName}</div>
          <div className="text-xs font-semibold text-slate-400">{pct}%</div>
        </div>
        <div className="h-2 bg-slate-200 rounded overflow-hidden">
          <div className={classNames('h-full rounded', progressColor(stage))} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStatus title="CUSTOMS" value={job.rms_status ? String(job.rms_status).toUpperCase() : '—'} tone="blue" />
          <MiniStatus title="CFS" value={cfsDisplay} tone="amber" />
          <MiniStatus title="TRANSPORT" value={job.vessel?.trim() ? job.vessel : 'Not Yet'} tone="gray" />
          <MiniStatus title="DELIVERY" value={job.destination?.trim() ? job.destination : 'Pending'} tone="green" />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Job Details</h3>
        {!editMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            {fieldRows.map((f) => <DetailField key={f.key} label={f.label} value={f.value} meta={meta?.[f.key]} profiles={profiles} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            {['job_no','client','mode','priority','goods','bl_no','be_no','containers','shipping_line','vessel','eta','cfs_name','cfs_amount','hs_code','rms_status','bg_required','destination','free_days','detention_risk','delay_reason','notes'].map((k) => (
              <div key={k} className={k === 'notes' ? 'md:col-span-2' : ''}>
                <div className="flex items-center flex-wrap gap-1 mb-1">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{FIELD_LABELS[k] || k}</p>
                  <FieldMetaChip meta={meta?.[k]} profiles={profiles} />
                </div>
                {renderFieldInput(k)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 sm:px-6 pb-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm w-full">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">Field Accountability</div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-400">Who updated what</div>
              {metaEntries.length > 5 && (
                <button type="button" onClick={() => setShowFullAccountability(true)} className="text-xs font-semibold text-blue-700 hover:text-blue-800">
                  View Full List
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[228px] overflow-y-auto">
          <table className="w-full table-fixed text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
              <tr>
                <th className="w-[36%] text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Field Name</th>
                <th className="w-[32%] text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Updated By</th>
                <th className="w-[32%] text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">When</th>
              </tr>
            </thead>
            <tbody>
              {metaEntries.length ? metaEntries.map((m) => (
                <tr key={m.key} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700 truncate" title={m.label}>{m.label}</td>
                  <td className="px-4 py-2 text-slate-900 font-semibold truncate" title={profiles[m.by] || m.by}>{profiles[m.by] || m.by}</td>
                  <td className="px-4 py-2 text-slate-500">{formatAccountabilityWhen(m.ts)}</td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No field updates logged yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {showFullAccountability && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-3xl max-h-[82vh] overflow-hidden rounded-xl bg-white shadow-2xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">Field Accountability</div>
                <div className="text-xs text-slate-500">{metaEntries.length} updates shown in IST</div>
              </div>
              <button type="button" onClick={() => setShowFullAccountability(false)}
                className="h-8 px-3 text-xs rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold">
                Close
              </button>
            </div>
            <div className="max-h-[68vh] overflow-y-auto">
              <table className="w-full table-fixed text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="w-[36%] text-left px-5 py-2 font-semibold uppercase tracking-wide text-[10px]">Field Name</th>
                    <th className="w-[32%] text-left px-5 py-2 font-semibold uppercase tracking-wide text-[10px]">Updated By</th>
                    <th className="w-[32%] text-left px-5 py-2 font-semibold uppercase tracking-wide text-[10px]">When</th>
                  </tr>
                </thead>
                <tbody>
                  {metaEntries.map((m) => (
                    <tr key={m.key} className="border-t border-slate-100">
                      <td className="px-5 py-2 text-slate-700">{m.label}</td>
                      <td className="px-5 py-2 text-slate-900 font-semibold">{profiles[m.by] || m.by}</td>
                      <td className="px-5 py-2 text-slate-500">{formatAccountabilityWhen(m.ts)}</td>
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
        <div className="mx-4 sm:mx-6 mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.notes}</p>
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
  const [extractModal, setExtractModal] = useState({ open: false, job: null })
  const [extracting, setExtracting] = useState(false)
  const [extractedFields, setExtractedFields] = useState(null)
  const [extractEdits, setExtractEdits] = useState(null)
  const [extractError, setExtractError] = useState(null)
  const [extractProgress, setExtractProgress] = useState('')
  const fileInputRef = useRef(null)

  const EXTRACT_FIELDS = [
    'bl_number','bl_date','vessel_name','voyage_number','container_numbers',
    'port_of_loading','port_of_discharge','shipper_name','consignee_name','notify_party',
    'hs_code','goods_description','invoice_number','invoice_date',
    'invoice_value','currency','shipment_terms','country_of_origin',
    'number_of_packages','gross_weight','net_weight',
  ]

  const EXTRACT_LABELS = {
    bl_number:'BL No',bl_date:'BL Date',vessel_name:'Vessel',voyage_number:'Voyage',
    container_numbers:'Containers',port_of_loading:'Port of Loading',port_of_discharge:'Port of Discharge',
    shipper_name:'Shipper',consignee_name:'Consignee',notify_party:'Notify Party',
    hs_code:'HS Code',goods_description:'Goods Description',invoice_number:'Invoice No',
    invoice_date:'Invoice Date',invoice_value:'Invoice Value',currency:'Currency',
    shipment_terms:'Shipment Terms',country_of_origin:'Country of Origin',
    number_of_packages:'Packages',gross_weight:'Gross Weight',net_weight:'Net Weight',
  }

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

  const closeExtract = () => {
    setExtractModal({ open: false, job: null })
    setExtracting(false)
    setExtractedFields(null)
    setExtractEdits(null)
    setExtractError(null)
    setExtractProgress('')
  }

  async function compressImage(base64, mimeType, maxWidth = 1200, quality = 0.7) {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        let w = img.width
        let h = img.height
        if (w > maxWidth) {
          h = Math.round(h * (maxWidth / w))
          w = maxWidth
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, w, h)
        const compressed = canvas.toDataURL(mimeType || 'image/jpeg', quality).split(',')[1]
        resolve({ base64: compressed, mimeType: mimeType || 'image/jpeg' })
      }
      img.src = `data:${mimeType || 'image/jpeg'};base64,${base64}`
    })
  }

  const groqFetch = async (files, prompt, signal) => {
    const key = import.meta.env.VITE_GROQ_API_KEY
    if (!key) throw new Error('Groq API key is not configured. Please contact your administrator.')
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...files.map((f) => ({
              type: 'image_url',
              image_url: { url: `data:${f.mimeType};base64,${f.base64}` },
            })),
          ],
        }],
        max_tokens: 4096,
        temperature: 0.1,
      }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      const errMsg = errBody?.error?.message || `Groq API error ${res.status}`
      if (res.status === 429 || errMsg.includes('rate_limit') || errMsg.includes('Rate limit')) {
        throw new Error('Groq rate limit reached. Please wait a moment and try again.')
      }
      if (res.status === 503 || errMsg.includes('unavailable') || errMsg.includes('overloaded')) {
        throw new Error('Groq service is temporarily unavailable. Please try again later.')
      }
      throw new Error(errMsg)
    }
    const data = await res.json()
    const choice = data?.choices?.[0]
    const model = data?.model || 'unknown'
    if (!choice) throw new Error('AI model returned no choices. Please try again.')
    const msg = choice.message || {}
    if (msg.refusal) throw new Error(`Model refused the request: ${msg.refusal}`)
    let raw = msg.content
    if (Array.isArray(raw)) {
      raw = raw.map((p) => (p.type === 'text' ? p.text : '')).filter(Boolean).join('\n')
    }
    if (!raw) throw new Error('AI model returned an empty response. Please try again.')
    return raw
  }

  const withRetry = async (fn, maxRetries = 2) => {
    let lastError
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err
        if (err.name === 'AbortError') throw new Error('Request timed out after 120 seconds. Please try again.')
        if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
      }
    }
    throw lastError
  }

  const pdfToImages = async (base64) => {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const pdf = await pdfjsLib.getDocument({ data }).promise
    const images = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1.2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(viewport.width, 1200)
      canvas.height = Math.round(viewport.height * (Math.min(viewport.width, 1200) / viewport.width))
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      await page.render({ canvasContext: ctx, viewport }).promise
      const imgBase64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
      images.push({ base64: imgBase64, mimeType: 'image/jpeg' })
    }
    return images
  }

  const runExtraction = async () => {
    const job = extractModal.job
    const key = import.meta.env.VITE_GROQ_API_KEY
    if (!key) { setExtractError('Groq API key is not configured. Please contact your administrator.'); return }

    setExtracting(true)
    setExtractError(null)
    setExtractedFields(null)
    setExtractEdits(null)
    setExtractProgress('Preparing document...')

    try {
      const docs = job.docs
      const validTypes = ['pdf', 'jpg', 'jpeg', 'png']
      const badDoc = docs.find((d) => !validTypes.includes((d.file_type || '').toLowerCase()))
      if (badDoc) {
        showToast(`Unsupported file type: ${badDoc.file_type}. Only PDF and image files can be processed.`, 'error')
        setExtracting(false); return
      }

      const files = []
      for (const doc of docs) {
        setExtractProgress('Rendering PDF pages...')
        const result = await urlToBase64(doc.file_url)
        const isPdf = (doc.file_type || '').toLowerCase() === 'pdf'
        if (isPdf) {
          const pageImages = await pdfToImages(result.base64)
          files.push(...pageImages)
        } else {
          const compressed = await compressImage(result.base64, result.mimeType)
          files.push(compressed)
        }
      }

      setExtractProgress('Extracting shipment data...')

      const prompt = `You are a customs documentation assistant for JDS Logistics, a CHA company in Mumbai, India. Extract shipment details from the uploaded logistics documents. Return ONLY valid JSON. Do not return markdown. Do not return explanations. For each field return: { "value": "...", "confidence": "high|medium|low" }. Fields: bl_number, bl_date, vessel_name, voyage_number, container_numbers, port_of_loading, port_of_discharge, shipper_name, consignee_name, notify_party, hs_code, goods_description, invoice_number, invoice_date, invoice_value, currency, shipment_terms, country_of_origin, number_of_packages, gross_weight, net_weight`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)

      const raw = await withRetry(() => groqFetch(files, prompt, controller.signal))
      clearTimeout(timeout)

      setExtractProgress('Formatting extracted fields...')

      const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      const result = {}
      for (const key of EXTRACT_FIELDS) {
        const field = parsed[key] || {}
        result[key] = { value: field.value ?? null, confidence: field.confidence ?? null }
      }
      const nonNullCount = Object.values(result).filter(
        (f) => f && f.value !== null && f.value !== undefined && f.value !== ''
      ).length
      if (nonNullCount < 3) {
        setExtractError(`This does not appear to be a shipping document. Only ${nonNullCount} field(s) could be extracted. Please upload a Bill of Lading, Commercial Invoice, Packing List, or Certificate of Origin.`)
        setExtracting(false); return
      }
      if (nonNullCount < 8) {
        showToast(`Low confidence extraction — only ${nonNullCount} of 27 fields found. Please verify this is the correct document and review all fields carefully.`, 'error')
      }
      setExtractedFields(result)
      setExtractEdits(JSON.parse(JSON.stringify(result)))
    } catch (err) {
      if (err.message?.includes('Groq API error') || err.message?.includes('API error')) {
        setExtractError(`Extraction failed: ${err.message}`)
      } else if (err.message?.includes('Empty response') || err.message?.includes('returned an empty')) {
        setExtractError(err.message)
      } else if (err.name === 'AbortError' || err.message?.includes('timed out')) {
        setExtractError('Request timed out after 120 seconds. Please try again.')
      } else if (err.message?.includes('JSON') || err.message?.includes('parse') || err.message?.includes('Unexpected token')) {
        setExtractError('Extraction failed — invalid response from AI. Please try again.')
      } else {
        setExtractError(err.message || 'Extraction failed')
      }
    } finally {
      setExtracting(false)
      setExtractProgress('')
    }
  }

  const updateExtractField = (key) => (e) => {
    setExtractEdits((prev) => ({ ...prev, [key]: { ...prev[key], value: e.target.value } }))
  }

  const confidenceColor = (value, confidence) => {
    if (!value) return 'border-l-red-500 bg-red-50'
    if (confidence === 'high') return 'border-l-green-500 bg-green-50/40'
    if (confidence === 'medium') return 'border-l-amber-500 bg-amber-50/40'
    return 'border-l-red-500 bg-red-50'
  }

  const downloadExcel = () => {
    const job = extractModal.job
    const headers = [
      'Job No','Client','BL No','BL Date','Vessel','Voyage','Containers',
      'Port of Loading','Port of Discharge','Shipper','Consignee','Notify Party',
      'HS Code','Goods Description','Invoice No','Invoice Date','Invoice Value',
      'Currency','Shipment Terms','Country of Origin','Packages','Gross Weight','Net Weight',
    ]
    const values = [job.job_no, job.client, ...EXTRACT_FIELDS.map((k) => extractEdits?.[k]?.value ?? '')]
    const ws = XLSX.utils.aoa_to_sheet([headers, values])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, job.job_no || 'Extracted')
    XLSX.writeFile(wb, `JDS_${job.job_no || 'Extract'}_Checklist.xlsx`)
    showToast('Excel downloaded', 'success')
  }

  const summary = extractedFields
    ? EXTRACT_FIELDS.reduce(
        (acc, k) => {
          const f = extractedFields[k]
          if (!f?.value) acc.notFound++
          else if (f.confidence === 'high') acc.high++
          else acc.needsReview++
          return acc
        },
        { high: 0, needsReview: 0, notFound: 0 }
      )
    : null

  const DOC_TYPES = ['BL', 'Invoice', 'Packing List', 'COO', 'Insurance', 'BE', 'Examination Order', 'OOC', 'E-Way Bill', 'POD', 'Other']

  const DOC_TYPE_COLORS = {
    BL: 'bg-blue-100 text-blue-800',
    Invoice: 'bg-green-100 text-green-800',
    'Packing List': 'bg-teal-100 text-teal-800',
    COO: 'bg-purple-100 text-purple-800',
    Insurance: 'bg-amber-100 text-amber-800',
    BE: 'bg-red-100 text-red-800',
    'Examination Order': 'bg-orange-100 text-orange-800',
    OOC: 'bg-emerald-100 text-emerald-800',
    'E-Way Bill': 'bg-indigo-100 text-indigo-800',
    POD: 'bg-gray-100 text-gray-800',
    Other: 'bg-slate-100 text-slate-800',
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
    return <span className="text-slate-400 font-bold text-sm">DOC</span>
  }

  const btnBase = 'h-8 px-3 text-xs rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const selectBase = 'w-full h-9 px-3 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300'

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-lg font-bold text-slate-900">Documents</div>
          <div className="text-sm text-slate-400">Operational document register \u2014 all jobs</div>
        </div>
        <div className="flex items-center h-9 px-3 bg-white border border-slate-200 rounded-lg min-w-[240px]">
          <input value={docSearch} onChange={(e) => setDocSearch(e.target.value)}
            placeholder="Search job no., client, file name..."
            className="w-full bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400" />
        </div>
      </div>

      {loadingDocs ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 flex justify-center">
          <div className="h-9 w-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : accordionItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 text-center text-slate-400">
          {docSearch.trim() ? 'No jobs match your search.' : 'No jobs found.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {accordionItems.map((job) => {
            const isExpanded = expandedJobId === job.id
            const docCount = job.docs.length
            return (
              <div key={job.id} className="border-b border-slate-200 last:border-b-0">
                <div
                  role="button" tabIndex={0}
                  onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setExpandedJobId(isExpanded ? null : job.id) }}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{job.job_no || '\u2014'}</span>
                    <span className="text-xs text-slate-400 truncate">{job.client || ''}</span>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${docCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}`}>
                    {docCount} document{docCount !== 1 ? 's' : ''}
                  </span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setUploadModal({ open: true, job }); setExpandedJobId(null) }}
                    className={`${btnBase} bg-[#1e3a5f] text-white hover:bg-[#16304f]`}>
                    Upload Document
                  </button>
                  {docCount > 0 && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setExtractModal({ open: true, job }); setExpandedJobId(null) }}
                      className={`${btnBase} border border-emerald-600 text-emerald-700 hover:bg-emerald-50`}>
                      &#10026; AI Extract
                    </button>
                  )}
                  <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                </div>
                {isExpanded && (
                  <div className="bg-blue-50/30 px-4 py-4">
                    {docCount === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-6">No documents uploaded yet for this job.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-200">
                              <th className="text-left font-semibold uppercase tracking-wide text-[10px] pb-2 pr-3">File Name</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-[10px] pb-2 pr-3">Doc Type</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-[10px] pb-2 pr-3">Uploaded By</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-[10px] pb-2 pr-3">Date &amp; Time</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-[10px] pb-2 pr-3">Size</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-[10px] pb-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {job.docs.map((doc) => {
                              const colorClass = DOC_TYPE_COLORS[doc.doc_type] || 'bg-slate-100 text-slate-800'
                              const canDelete = isAdmin || doc.uploaded_by === user?.id
                              return (
                                <tr key={doc.id} className="border-b border-slate-100 last:border-b-0">
                                  <td className="py-2 pr-3">
                                    <div className="flex items-center gap-2">
                                      {fileIcon(doc)}
                                      <span className="text-slate-900 font-medium truncate max-w-[200px]" title={doc.file_name}>{doc.file_name}</span>
                                    </div>
                                  </td>
                                  <td className="py-2 pr-3">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${colorClass}`}>{doc.doc_type}</span>
                                  </td>
                                  <td className="py-2 pr-3 text-slate-600">{doc.uploaded_by_name || '\u2014'}</td>
                                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{formatUploadDate(doc.created_at)}</td>
                                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{formatFileSize(doc.file_size)}</td>
                                  <td className="py-2">
                                    <div className="flex items-center gap-1.5">
                                      <button type="button" onClick={() => setPreviewModal({ open: true, doc })}
                                        className="h-7 px-2.5 text-[11px] rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-semibold">
                                        View
                                      </button>
                                      <a href={doc.file_url} download={doc.file_name}
                                        className="h-7 px-2.5 text-[11px] rounded-md bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 font-semibold inline-flex items-center no-underline">
                                        Download
                                      </a>
                                      {canDelete && (
                                        <button type="button" onClick={() => handleDelete(doc)}
                                          className="h-7 px-2.5 text-[11px] rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-semibold">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Upload Document \u2014 {uploadModal.job.job_no} {uploadModal.job.client}</div>
              <button type="button" onClick={() => { setUploadModal({ open: false, job: null }); setUploadFile(null); setUploadDocType('BL'); setUploadProgress(0) }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors text-lg leading-none">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Document Type</label>
                <select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} className={selectBase}>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">File</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-400', 'bg-blue-50') }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50') }}
                  onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50'); const f = e.dataTransfer?.files?.[0]; if (f) { if (f.size > 10 * 1024 * 1024) { showToast('File size must be under 10MB.', 'error') } else { setUploadFile(f) } } }}
                  className={`border-2 border-dashed rounded-xl px-4 py-8 text-center cursor-pointer transition-colors ${uploadFile ? 'border-green-300 bg-green-50' : 'border-slate-300 hover:border-blue-300'}`}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 10 * 1024 * 1024) { showToast('File size must be under 10MB.', 'error') } else { setUploadFile(f) } } }} className="hidden" />
                  {uploadFile ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-900 break-all">{uploadFile.name}</p>
                      <p className="text-xs text-slate-400 mt-1">{formatFileSize(uploadFile.size)}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-slate-400">Click to select or drag &amp; drop</p>
                      <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG \u2014 max 10MB</p>
                    </div>
                  )}
                </div>
              </div>
              {uploading && (
                <div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button type="button" onClick={() => { setUploadModal({ open: false, job: null }); setUploadFile(null); setUploadDocType('BL'); setUploadProgress(0) }}
                className={`${btnBase} border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100`}>
                Cancel
              </button>
              <button type="button" onClick={handleUpload} disabled={uploading || !uploadFile || !uploadDocType}
                className={`${btnBase} bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-2`}>
                {uploading && <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {uploading ? `${uploadProgress}%` : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewModal.open && previewModal.doc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-slate-900 truncate">{previewModal.doc.file_name}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${DOC_TYPE_COLORS[previewModal.doc.doc_type] || 'bg-slate-100 text-slate-800'}`}>{previewModal.doc.doc_type}</span>
              </div>
              <button type="button" onClick={() => setPreviewModal({ open: false, doc: null })}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors text-lg leading-none shrink-0">&times;</button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-4 flex items-center justify-center min-h-[300px]">
              {['pdf'].includes((previewModal.doc.file_type || '').toLowerCase()) ? (
                <iframe src={previewModal.doc.file_url} title="PDF Preview" className="w-full h-[600px] rounded-lg border border-slate-200 bg-white" />
              ) : ['jpg', 'jpeg', 'png'].includes((previewModal.doc.file_type || '').toLowerCase()) ? (
                <img src={previewModal.doc.file_url} alt={previewModal.doc.file_name} className="max-w-full max-h-[600px] rounded-lg shadow-sm object-contain" />
              ) : (
                <div className="text-center text-slate-400">
                  <p className="text-sm font-semibold">Preview not available</p>
                  <p className="text-xs mt-1">This file type cannot be previewed.</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <a href={previewModal.doc.file_url} download={previewModal.doc.file_name}
                className={`${btnBase} bg-[#1e3a5f] text-white hover:bg-[#16304f] no-underline inline-flex items-center`}>
                Download
              </a>
              <button type="button" onClick={() => setPreviewModal({ open: false, doc: null })}
                className={`${btnBase} border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100`}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extraction Modal */}
      {extractModal.open && extractModal.job && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <div className="text-sm font-bold text-slate-900">AI Document Extraction &mdash; {extractModal.job.job_no}</div>
                <div className="text-xs text-slate-400">{extractModal.job.client}</div>
              </div>
              <button type="button" onClick={closeExtract}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 text-lg leading-none">&times;</button>
            </div>

            <div className="p-6 space-y-6">
              {/* Document list + Extract trigger */}
              {!extracting && !extractedFields && !extractError && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">Documents to process ({extractModal.job.docs.length})</p>
                  <div className="space-y-2">
                    {extractModal.job.docs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 text-sm text-slate-600 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-base">&#128196;</span>
                        <span className="truncate">{doc.file_name}</span>
                        <span className="text-[10px] text-slate-400 ml-auto">{doc.doc_type}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={runExtraction}
                    className="mt-4 h-10 px-5 text-sm font-semibold rounded-lg bg-[#1e3a5f] text-white hover:bg-[#16304f] inline-flex items-center gap-2">
                    &#10026; Extract
                  </button>
                </div>
              )}

              {/* Loading */}
              {extracting && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="h-10 w-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-sm font-semibold text-slate-700">{extractProgress || 'AI is extracting shipment data...'}</p>
                  <p className="text-sm text-slate-400">This may take up to 2 minutes for large documents</p>
                </div>
              )}

              {/* Error */}
              {extractError && !extracting && (
                <div className="flex flex-col items-center py-10">
                  <p className="text-sm text-red-600 font-semibold mb-3">{extractError}</p>
                  <button type="button" onClick={runExtraction}
                    className="h-9 px-4 text-sm rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold">
                    Retry
                  </button>
                </div>
              )}

              {/* Review Form */}
              {extractedFields && extractEdits && (
                <>
                  {/* Summary */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-600">Confidence:</span>
                    {summary.high > 0 && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold bg-green-100 text-green-800">{summary.high}</span>
                    )}
                    {summary.needsReview > 0 && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800">{summary.needsReview}</span>
                    )}
                    {summary.notFound > 0 && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold bg-red-100 text-red-800">{summary.notFound}</span>
                    )}
                    <span className="text-[11px] text-slate-400">{summary.high} high &middot; {summary.needsReview} need review &middot; {summary.notFound} not found</span>
                  </div>

                  {/* Fields grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                    {EXTRACT_FIELDS.map((k) => {
                      const f = extractEdits[k] || {}
                      const value = f.value ?? ''
                      const confidence = f.confidence
                      const borderCls = confidenceColor(value, confidence)
                      return (
                        <div key={k}>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{EXTRACT_LABELS[k] || k}</p>
                          <input type="text" value={value} onChange={updateExtractField(k)}
                            placeholder={value ? '' : 'Not found'}
                            className={`w-full h-9 px-3 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 ${borderCls} border-l-4 ${!value ? 'text-red-600 placeholder:text-red-300' : ''}`} />
                          {confidence && (
                            <p className={`text-[10px] mt-0.5 font-medium ${confidence === 'high' ? 'text-green-600' : confidence === 'medium' ? 'text-amber-600' : 'text-red-600'}`}>
                              {confidence} confidence
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            {extractedFields && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-3 sticky bottom-0 bg-white">
                <button type="button" onClick={closeExtract}
                  className="h-9 px-4 text-sm rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold">
                  Close
                </button>
                <button type="button" onClick={() => { setExtractedFields(null); setExtractEdits(null); setExtractError(null); }}
                  className="h-9 px-4 text-sm rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold">
                  Extract Again
                </button>
                <button type="button" onClick={downloadExcel}
                  className="h-9 px-4 text-sm rounded-lg bg-[#1e3a5f] text-white hover:bg-[#16304f] font-semibold ml-auto">
                  &#128229; Download Excel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const STATUS_STYLES = {
  in_transit: 'bg-blue-100 text-blue-800',
  arrived: 'bg-green-100 text-green-800',
  customs_hold: 'bg-amber-100 text-amber-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  empty_returned: 'bg-slate-100 text-slate-600',
  at_cfs: 'bg-teal-100 text-teal-800',
  on_rail: 'bg-indigo-100 text-indigo-800',
  delayed: 'bg-red-100 text-red-800',
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
            <div className="text-lg font-bold text-slate-900">Container Tracking</div>
            <div className="text-sm text-slate-400">On-demand &mdash; click "Check Status" per container</div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
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
            <div className="text-lg font-bold text-slate-900">Container Tracking</div>
            <div className="text-sm text-slate-400">On-demand &mdash; click "Check Status" per container</div>
          </div>
        </div>
        <div className="bg-white border border-red-200 rounded-xl shadow-sm p-10 text-center">
          <p className="text-red-600 font-semibold mb-2">Failed to load container data</p>
          <button type="button" onClick={() => loadData()}
            className="h-8 px-4 text-xs font-semibold rounded-lg bg-[#1e3a5f] text-white hover:bg-[#16304f]">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 bg-white border border-slate-200 rounded-xl shadow-sm p-3">
        <input value={newContainerNo} onChange={(e) => setNewContainerNo(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleAddContainer()}
          placeholder="Enter container number (e.g. MAEU1234567)"
          className="flex-1 min-w-[180px] h-7 px-2.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-[#1e3a5f] placeholder:text-slate-400" />
        <select value={newCarrier} onChange={(e) => setNewCarrier(e.target.value)}
          className="h-7 px-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-[#1e3a5f] bg-white text-slate-700">
          <option value="">Shipping line...</option>
          {carriers.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="button" onClick={handleAddContainer} disabled={addingContainer || !newCarrier}
          className="h-7 px-3 text-xs font-semibold rounded-lg bg-[#1e3a5f] text-white hover:bg-[#16304f] disabled:opacity-50 inline-flex items-center gap-1">
          {addingContainer ? <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '+'}
          {addingContainer ? 'Adding...' : 'Track'}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-lg font-bold text-slate-900">Container Tracking</div>
          <div className="text-sm text-slate-400">On-demand &mdash; click "Check Status" per container</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center h-8 px-3 bg-white border border-slate-200 rounded-lg min-w-[200px]">
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search container, carrier, vessel..."
              className="w-full bg-transparent outline-none text-xs text-slate-900 placeholder:text-slate-400" />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 text-center text-slate-400">
          {searchQuery.trim() ? 'No containers match your search.' : 'No container data available.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <th className="text-left font-semibold uppercase tracking-wide text-[10px] px-3 py-2">Job #</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-[10px] px-3 py-2">Container</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-[10px] px-3 py-2">Status</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-[10px] px-3 py-2">Location</th>
                  <th className="text-left font-semibold uppercase tracking-wide text-[10px] px-3 py-2">Last Update</th>
                  <th className="text-center font-semibold uppercase tracking-wide text-[10px] px-3 py-2">Check</th>
                  <th className="w-8 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const isExpanded = expandedContainer === c.containerNo
                  const statusCls = STATUS_STYLES[c.status] || 'bg-slate-100 text-slate-700'
                  const isChecking = checkingContainers.has(c.containerNo)
                  return (
                    <tr key={c.containerNo} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2 text-slate-600 text-[11px] max-w-[80px] truncate" title={c.jobNumber}>{c.jobNumber || '\u2014'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-900 font-bold text-sm">{c.containerNo}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{c.carrier}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${statusCls}`}>{c.statusText}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate text-[11px]" title={c.currentLocation}>{c.currentLocation || '\u2014'}</td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap text-[10px]">{formatContainerDate(c.lastUpdate)}</td>
                      <td className="px-3 py-2 text-center">
                        <button type="button" onClick={() => handleCheckStatus(c.containerNo, c.carrier)} disabled={isChecking}
                          title={`Scrape ${c.carrier} website for live status`}
                          className="h-6 px-2.5 text-[10px] font-semibold rounded-md bg-[#1e3a5f] text-white hover:bg-[#16304f] disabled:opacity-50 inline-flex items-center gap-1">
                          {isChecking ? <span className="h-2.5 w-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '\u25C9'}
                          {isChecking ? 'Checking...' : 'Check Status'}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => setExpandedContainer(isExpanded ? null : c.containerNo)}
                          className="text-slate-400 hover:text-slate-700 transition-colors text-xs">
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

      <div className="mt-3 text-[10px] text-slate-400">
        {filtered.length} container{filtered.length !== 1 ? 's' : ''} tracked &middot; Click "Check Status" to fetch live updates
      </div>
    </div>
  )
}

function ContainerTimeline({ container, onClose }) {
  if (!container) return null
  return (
    <div className="border-t border-slate-200 bg-blue-50/30 px-4 sm:px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-slate-900">Milestones &mdash; {container.containerNo}</div>
        <button type="button" onClick={onClose}
          className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Close</button>
      </div>
      {container.milestones.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">No milestone data available.</p>
      ) : (
        <div className="relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200" />
          <div className="space-y-3">
            {container.milestones.map((m, i) => (
              <div key={i} className="flex items-start gap-3 relative">
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 z-10 ${
                  i === container.milestones.length - 1
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-white border-slate-300'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900">{m.description}</p>
                  <p className="text-[11px] text-slate-500">
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

export default function AdminDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()
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
    if (!window.confirm(`Delete job ${job.job_no || ''}?`)) return
    const { error } = await supabase.from('jobs').delete().eq('id', job.id)
    if (error) { window.alert(error.message || 'Delete failed.'); return }
    setJobs((prev) => prev.filter((j) => j.id !== job.id))
    if (selectedJob?.id === job.id) setSelectedJob(null)
    showToast('Job deleted.', 'success')
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
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-2">
          <div className="p-2 flex flex-wrap gap-1 items-center">
            <div className="flex items-center h-6 px-2 bg-slate-50 border border-slate-200 rounded-lg flex-1 min-w-[180px] max-w-[240px]">
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by job number..."
                className="w-full bg-transparent outline-none text-xs text-slate-900 placeholder:text-slate-400" />
            </div>
            <span className="text-[10px] text-slate-400 whitespace-nowrap">{filteredJobs.length} shown</span>
            <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} className="h-6 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none">
              {STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="h-6 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none">
              {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} className="h-6 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none">
              {MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button type="button" onClick={() => { setSearch(''); setFilterStage(''); setFilterPriority(''); setFilterMode('') }}
              className="h-6 px-2.5 text-xs rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100">
              Clear
            </button>
          </div>
        </div>
      )}

      {loadingJobs ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 flex justify-center">
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
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 text-center text-slate-400">
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
    <div className="min-h-screen flex bg-slate-100 text-[14px]">
      <aside className="w-[175px] bg-slate-900 border-r border-slate-700/60 text-slate-200 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-extrabold text-sm">JD</div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-100 truncate">JDS Logistics</div>
            <div className="text-[11px] text-slate-400 truncate">Command Center</div>
          </div>
        </div>
        <div className="px-4 pt-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Operations</div>
        <nav className="flex-1 py-1">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} type="button" onClick={() => handleNavClick(item.id)}
              className={classNames('w-full text-left px-3 py-2 text-sm flex items-center gap-1.5 border-l-4 transition-colors',
                activeNav === item.id ? 'bg-slate-700 text-blue-300 border-l-blue-300 font-semibold' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-100 border-l-transparent')}>
              <span className="w-3.5 text-center shrink-0 opacity-90">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-700/60 px-4 py-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-700 text-white flex items-center justify-center text-[10px] font-bold">
            {(profile?.name || 'A').slice(0,2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-100 truncate">{profile?.name || 'Admin'}</div>
            <div className="text-[11px] text-slate-400 truncate">Administrator</div>
          </div>
          <span className="ml-auto w-2 h-2 rounded-full bg-green-500" title="Live" />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-[54px] bg-white border-b border-slate-200 shadow-sm px-4 sm:px-6 flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-base font-bold text-slate-900 truncate">{pageTitle}</div>
            <div className="text-sm text-slate-400 truncate">Live operations overview</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setShowCreateJob(true)}
              className="h-9 px-4 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold">
              + Create Job
            </button>
            <button type="button" onClick={handleLogout}
              className="h-9 px-4 text-sm rounded-lg border border-slate-300 bg-slate-50 text-red-600 hover:bg-slate-100 font-semibold">
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
              <div className="mb-3 text-[20px] font-semibold leading-tight text-slate-800">
                {getGreeting()}, <span className="font-semibold text-slate-900">{profile?.name || 'there'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 mb-4">
                <KpiCard label="Active Jobs" value={stats.active} hint="In progress" tone="blue" icon="A" />
                <KpiCard label="Urgent" value={stats.urgent} hint="Needs attention" tone="red" icon="!" />
                <KpiCard label="ETAs This Week" value={stats.etasWeek} hint="Upcoming arrivals" tone="amber" icon="~" />
                <KpiCard label="Free Days At Risk" value={stats.freeDaysAtRisk} hint="0-2 days left" tone="red" icon="D" />
                <KpiCard label="Payment Blocks" value={stats.paymentsPending} hint="Duty / CFS queue" tone="violet" icon="Rs" />
                <KpiCard label="Stale Updates" value={stats.stale} hint="Needs follow-up" tone="amber" icon="24" />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_0.95fr] gap-4 mb-4">
                <TodayPriorityQueue items={controlTower.priorityItems} profiles={profiles} onOpen={setSelectedJob} />
                <FreeDaysRiskPanel items={controlTower.freeDaysRisk} onOpen={setSelectedJob} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
                <StageBottlenecks items={controlTower.stageBottlenecks} maxCount={controlTower.stageMaxCount} onStage={(stage) => { setFilterStage(stage); setActiveNav('jobs') }} />
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

          {activeNav !== 'overview' && activeNav !== 'jobs' && activeNav !== 'documents' && activeNav !== 'containers' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 text-center text-slate-400">
              Coming soon
            </div>
          )}
        </main>
      </div>

      {toastState && (
        <div className={classNames('fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-lg border',
          toastState.type === 'success' && 'bg-green-600 text-white border-green-700',
          toastState.type === 'error' && 'bg-red-600 text-white border-red-700',
          toastState.type === 'info' && 'bg-slate-900 text-white border-slate-800')}>
          {toastState.message}
        </div>
      )}

      {showCreateJob && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 px-4 py-6">
          <div className="w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl border border-slate-200">
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
