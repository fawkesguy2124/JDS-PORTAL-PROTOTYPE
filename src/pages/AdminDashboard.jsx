import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { getStageName, isEtaThisWeek } from '../utils/jobHelpers'

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

function formatDateSlash(value) {
  if (!value) return '—'
  const d = new Date(value)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
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
  const tones = { blue: 'text-blue-600', red: 'text-red-600', amber: 'text-amber-600', green: 'text-green-600' }
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm relative overflow-hidden">
      <p className="text-[11px] font-medium text-slate-600 mb-1">{label}</p>
      <p className={classNames('text-2xl font-extrabold leading-none', tones[tone] || tones.blue)}>{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
      {icon && <div className={classNames('absolute right-3 top-1/2 -translate-y-1/2 text-3xl opacity-[0.08]', tones[tone] || tones.blue)}>{icon}</div>}
    </div>
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
    <div className="mt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 truncate">Stage {s}: {getStageName(s)}</span>
        <span className="text-[11px] text-slate-400">{pct}%</span>
      </div>
      <div className="mt-1 h-1 bg-slate-200 rounded overflow-hidden">
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
      className={classNames('bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-3 cursor-pointer transition-all hover:border-blue-300 hover:shadow-md border-l-4', priorityBorder)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold text-slate-900 truncate">{job.job_no || '—'}</div>
          <div className="text-sm text-slate-700 mt-0.5">{job.client || '—'} <span className="text-slate-400">· {job.goods || '—'}</span></div>
          <div className="text-[11px] text-slate-400 font-mono mt-1">
            {job.be_no ? `BE:${job.be_no}` : ''}
            {job.bl_no ? `${job.be_no ? ' · ' : ''}BL:${job.bl_no}` : ''}
            {job.containers ? `${job.be_no || job.bl_no ? ' · ' : ''}${job.containers}` : ''}
            {!job.be_no && !job.bl_no && !job.containers ? '—' : ''}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {lastUpdatedName || lastUpdatedTs ? (
              <>Last updated by: <span className="text-slate-500 font-medium">{lastUpdatedName || '—'}</span> · <span>{lastUpdatedTs ? timeAgo(lastUpdatedTs) : '—'}</span></>
            ) : <span>Last updated by: —</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex flex-wrap justify-end gap-2">
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', priority.cls)}>{priority.text}</span>
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', mode.cls)}>{mode.text}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', rms.cls)}>{rms.text}</span>
            <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', risk.cls)}>{risk.text}</span>
          </div>
        </div>
      </div>
      <JobProgress stage={job.stage} />
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-slate-400">
          <span className="text-slate-500 font-medium">{assignedName}</span> · {job.destination || '—'} ·{' '}
          <span className={classNames(daysOld >= 4 ? 'text-red-600 font-semibold' : daysOld >= 2 ? 'text-amber-700 font-semibold' : '')}>{daysOld}d old</span>
          {job.delay_reason ? <> · <span className="text-amber-700 font-semibold">{job.delay_reason}</span></> : null}
        </div>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="h-8 px-3 text-xs rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100">
          Delete
        </button>
      </div>
    </div>
  )
}

function JobDetailView({ job, profiles, currentUserName, isAdmin, canUpdateStage, onBack, onSaved, toast }) {
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stageUpdating, setStageUpdating] = useState(false)
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
      const candidates = ['job_no','client','mode','bl_no','containers','vessel','eta','cfs_name','be_no','hs_code','rms_status','bg_required','cfs_amount','destination','priority','goods','free_days','detention_risk','delay_reason','notes']
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
            {['job_no','client','mode','priority','goods','bl_no','be_no','containers','vessel','eta','cfs_name','cfs_amount','hs_code','rms_status','bg_required','destination','free_days','detention_risk','delay_reason','notes'].map((k) => (
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Field Accountability</div>
            <div className="text-xs text-slate-400">Who updated what</div>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Field Name</th>
                <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">Updated By</th>
                <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide text-[10px]">When</th>
              </tr>
            </thead>
            <tbody>
              {metaEntries.length ? metaEntries.map((m) => (
                <tr key={m.key} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">{m.label}</td>
                  <td className="px-4 py-2 text-slate-900 font-semibold">{profiles[m.by] || m.by}</td>
                  <td className="px-4 py-2 text-slate-500">{m.ts ? timeAgo(m.ts) : '—'}</td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No field updates logged yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
    </div>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [activeNav, setActiveNav] = useState('overview')
  const [jobs, setJobs] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterMode, setFilterMode] = useState('')
  const [selectedJob, setSelectedJob] = useState(null)
  const [toastState, setToastState] = useState(null)

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
    const paymentsPending = jobs.filter((j) => j.stage === 6)
    return { active: active.length, urgent: urgent.length, etasWeek: etasWeek.length, paymentsPending: paymentsPending.length }
  }, [jobs])

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase()
    const pRank = { urgent: 0, high: 1, normal: 2 }
    return (jobs || [])
      .filter((j) => {
        if (q) {
          const hay = [j.job_no,j.client,j.goods,j.be_no,j.bl_no,j.containers,j.destination,j.mode,j.priority].filter(Boolean).join(' ').toLowerCase()
          if (!hay.includes(q)) return false
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
  const handleNavClick = (id) => { setActiveNav(id); setSelectedJob(null) }

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

  return (
    <div className="min-h-screen flex bg-slate-100 text-[14px]">
      <aside className="w-[205px] bg-slate-900 border-r border-slate-700/60 text-slate-200 flex flex-col shrink-0">
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
              className={classNames('w-full text-left px-4 py-2 text-sm flex items-center gap-2 border-l-4 transition-colors',
                activeNav === item.id ? 'bg-slate-700 text-blue-300 border-l-blue-300 font-semibold' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-100 border-l-transparent')}>
              <span className="w-4 text-center shrink-0 opacity-90">{item.icon}</span>
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
            <button type="button" onClick={() => navigate('/admin/create-job')}
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
            <>
              <div className="mb-4 text-sm text-slate-500">
                {getGreeting()}, <span className="font-semibold text-slate-700">{profile?.name || 'there'}</span>
              </div>

              {!selectedJob && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <KpiCard label="Active Jobs" value={stats.active} hint="In progress" tone="blue" icon="☕" />
                  <KpiCard label="Urgent" value={stats.urgent} hint="Needs attention" tone="red" icon="!" />
                  <KpiCard label="ETAs This Week" value={stats.etasWeek} hint="Upcoming arrivals" tone="amber" icon="~" />
                  <KpiCard label="Payments Pending" value={stats.paymentsPending} hint="Duty / CFS queue" tone="green" icon="Rs" />
                </div>
              )}

              {!selectedJob && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-4">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">Jobs</div>
                    <div className="text-xs text-slate-400">{filteredJobs.length} shown</div>
                  </div>
                  <div className="p-4 flex flex-wrap gap-2 items-center">
                    <div className="flex items-center gap-2 h-8 px-3 bg-slate-50 border border-slate-200 rounded-lg flex-1 min-w-[220px] max-w-[320px]">
                      <input value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search job, client, BE, BL, container..."
                        className="w-full bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400" />
                    </div>
                    <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} className="h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none">
                      {STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none">
                      {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} className="h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none">
                      {MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button type="button" onClick={() => { setSearch(''); setFilterStage(''); setFilterPriority(''); setFilterMode('') }}
                      className="h-9 px-4 text-sm rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100">
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
                />
              ) : filteredJobs.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 text-center text-slate-400">
                  No jobs match your search/filters.
                </div>
              ) : (
                <div>
                  {filteredJobs.map((job) => (
                    <JobCard key={job.id} job={job} profiles={profiles}
                      onOpen={() => setSelectedJob(job)}
                      onDelete={() => handleDeleteJob(job)} />
                  ))}
                </div>
              )}
            </>
          )}

          {activeNav !== 'overview' && (
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
    </div>
  )
}
