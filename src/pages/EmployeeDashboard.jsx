import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { getStageName } from '../utils/jobHelpers'
import CreateJob from './CreateJob'

export default function EmployeeDashboard() {
  const { user, profile } = useAuth()
  const [jobs, setJobs] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterMode, setFilterMode] = useState('')
  const [expandedJobId, setExpandedJobId] = useState(null)
  const [editingJobId, setEditingJobId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [showCreateJob, setShowCreateJob] = useState(false)
  const [toastState, setToastState] = useState(null)

  useEffect(() => {
    if (!user?.id) return
    let mounted = true
    async function loadAll() {
      setLoading(true)
      const [{ data: jobsData }, { data: profilesData }] = await Promise.all([
        supabase.from('jobs').select('*').order('updated_at', { ascending: false }),
        supabase.from('profiles').select('id, name').order('name'),
      ])
      if (!mounted) return
      setJobs(jobsData ?? [])
      const map = {}
      ;(profilesData ?? []).forEach((p) => {
        map[p.id] = p.name
      })
      setProfiles(map)
      setLoading(false)
    }
    loadAll()
    return () => {
      mounted = false
    }
  }, [user?.id])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  const showToast = (message, type = 'success') => {
    const id = Date.now()
    setToastState({ id, message, type })
    window.setTimeout(() => {
      setToastState((prev) => (prev?.id === id ? null : prev))
    }, 2800)
  }

  const currentUserName = profile?.name || '—'

  const canCreateJob = ['Uphadhya', 'Akshyani', 'Durgesh'].includes(currentUserName)
  const canUpdateStage = ['Trupti', 'Uphadhya'].includes(currentUserName)

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

  const FIELD_PERMS_BY_NAME = {
    Uphadhya: [
      'job_no',
      'client',
      'mode',
      'bl_no',
      'containers',
      'shipping_line',
      'vessel',
      'eta',
      'cfs_name',
    ],
    Akshyani: [
      'job_no',
      'client',
      'mode',
      'bl_no',
      'containers',
      'shipping_line',
      'vessel',
      'eta',
      'cfs_name',
      'be_no',
      'hs_code',
      'rms_status',
      'bg_required',
    ],
    Trupti: ['be_no', 'hs_code', 'rms_status', 'stage'],
    Kiran: ['cfs_amount'],
    Virendra: ['cfs_amount'],
    Mayur: ['cfs_amount'],
    Anil: ['cfs_amount', 'bg_required'],
  }

  const ALL_EMPLOYEE_FIELDS = [
    'destination',
    'priority',
    'goods',
    'free_days',
    'detention_risk',
    'delay_reason',
    'notes',
  ]

  const editableFields = useMemo(() => {
    const base = new Set([...(FIELD_PERMS_BY_NAME[currentUserName] || []), ...ALL_EMPLOYEE_FIELDS])
    // stage is not globally editable; only Trupti/Uphadhya can update stage via stage control (not edit form)
    if (!canUpdateStage) base.delete('stage')
    return base
  }, [currentUserName, canUpdateStage])

  const isFieldEditable = (fieldKey) => editableFields.has(fieldKey)

  const classNames = (...xs) => xs.filter(Boolean).join(' ')

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

  const STAGE_LIST = Array.from({ length: 11 }).map((_, i) => ({ value: i, label: getStageName(i) }))

  const normalizeMetaTs = (ts) => {
    if (!ts) return null
    const n = Number(ts)
    if (!Number.isFinite(n)) return null
    return n < 1e12 ? n * 1000 : n
  }

  const timeAgo = (ts) => {
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
    const yr = Math.floor(mo / 12)
    return `${yr}y ago`
  }

  const formatDateSlash = (value) => {
    if (!value) return '—'
    const d = new Date(value)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear())
    return `${dd}/${mm}/${yy}`
  }

  const formatDateTime = (value) => {
    if (!value) return '—'
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const displayValue = (v) => {
    if (v === null || v === undefined || v === '') return '—'
    if (typeof v === 'boolean') return v ? 'Yes' : 'No'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  const daysOldFrom = (value) => {
    if (!value) return 0
    const d = new Date(value)
    const now = new Date()
    const diff = Math.max(0, now.getTime() - d.getTime())
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  const priorityChip = (priority) => {
    const p = String(priority || 'normal').toLowerCase()
    if (p === 'urgent') return { text: 'Urgent', cls: 'bg-red-100 text-red-800' }
    if (p === 'high') return { text: 'High', cls: 'bg-amber-100 text-amber-800' }
    return { text: 'Normal', cls: 'bg-slate-100 text-slate-700' }
  }

  const modeChip = (mode) => {
    const m = String(mode || '').trim()
    if (m === 'Air') return { text: 'Air', cls: 'bg-green-100 text-green-800' }
    if (m === 'BPT/MBPT') return { text: 'BPT', cls: 'bg-purple-100 text-purple-800' }
    if (m === 'Sea LCL') return { text: 'LCL', cls: 'bg-teal-100 text-teal-800' }
    if (m === 'Sea FCL') return { text: 'FCL', cls: 'bg-blue-100 text-blue-800' }
    return { text: m || '—', cls: 'bg-slate-100 text-slate-700' }
  }

  const rmsChip = (rms) => {
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

  const riskChip = (risk) => {
    const r = String(risk || '').toLowerCase()
    if (r === 'high') return { text: 'High Risk', cls: 'bg-red-100 text-red-800' }
    if (r === 'medium') return { text: 'Medium', cls: 'bg-amber-100 text-amber-800' }
    if (r === 'low') return { text: 'Low', cls: 'bg-green-100 text-green-800' }
    return { text: displayValue(risk), cls: 'bg-slate-100 text-slate-700' }
  }

  const progressColor = (stage) => {
    const s = Number(stage) || 0
    if (s <= 3) return 'bg-red-600'
    if (s <= 6) return 'bg-amber-500'
    if (s <= 9) return 'bg-blue-600'
    return 'bg-green-600'
  }

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matchesQuery = (j) => {
      if (!q) return true
      const hay = [
        j.job_no,
        j.client,
        j.goods,
        j.be_no,
        j.bl_no,
        j.containers,
        j.destination,
        j.mode,
        j.priority,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    }

    const matchesFilters = (j) => {
      if (filterStage !== '' && String(j.stage) !== String(filterStage)) return false
      if (filterPriority && String(j.priority || '').toLowerCase() !== filterPriority) return false
      if (filterMode && String(j.mode || '') !== filterMode) return false
      return true
    }

    const pRank = { urgent: 0, high: 1, normal: 2 }
    return (jobs || [])
      .filter((j) => matchesQuery(j) && matchesFilters(j))
      .sort((a, b) => {
        const pa = pRank[String(a.priority || 'normal').toLowerCase()] ?? 3
        const pb = pRank[String(b.priority || 'normal').toLowerCase()] ?? 3
        if (pa !== pb) return pa - pb
        return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
      })
  }, [jobs, search, filterStage, filterPriority, filterMode])

  const refreshJobs = async () => {
    const { data } = await supabase.from('jobs').select('*').order('updated_at', { ascending: false })
    setJobs(data ?? [])
  }

  const handleCardClick = (e, jobId) => {
    const tag = e.target?.tagName?.toLowerCase?.() || ''
    if (['input', 'select', 'textarea', 'button'].includes(tag)) return
    setExpandedJobId((prev) => (prev === jobId ? null : jobId))
  }

  const handleCardKeyDown = (e, jobId) => {
    const tag = e.target?.tagName?.toLowerCase?.() || ''
    if (['input', 'select', 'textarea', 'button'].includes(tag)) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setExpandedJobId((prev) => (prev === jobId ? null : jobId))
    }
  }

  const startEditing = (job) => {
    setExpandedJobId(job.id)
    setEditingJobId(job.id)
    setEditForm({ ...job })
  }

  const cancelEditing = () => {
    setEditingJobId(null)
    setEditForm({})
  }

  const updateEditField = (key) => (e) => {
    setEditForm((prev) => ({ ...prev, [key]: e.target.value }))
  }

  const saveEdits = async (job) => {
    setSaving(true)
    try {
      const meta = job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : {}
      const newMeta = { ...meta }
      const updates = {}

      const track = (k, v) => {
        updates[k] = v
        newMeta[k] = { by: currentUserName, ts: Date.now() }
      }

      const candidates = [
        'job_no',
        'client',
        'mode',
        'bl_no',
        'containers',
        'shipping_line',
        'vessel',
        'eta',
        'cfs_name',
        'be_no',
        'hs_code',
        'rms_status',
        'bg_required',
        'cfs_amount',
        'destination',
        'priority',
        'goods',
        'free_days',
        'detention_risk',
        'delay_reason',
        'notes',
      ]

      candidates.forEach((k) => {
        if (!isFieldEditable(k)) return
        const prev = job[k]
        let next = editForm[k]

        if (k === 'free_days') next = next === '' ? null : Number(next)
        if (k === 'cfs_amount') next = next === '' ? null : Number(next)
        if (k === 'eta') next = next ? next : null
        if (typeof next === 'string') {
          next = next.trim()
          if (next === '') next = null
        }

        if ((prev ?? null) !== (next ?? null)) track(k, next)
      })

      if (Object.keys(updates).length === 0) {
        showToast('No changes to save.', 'info')
        cancelEditing()
        return
      }

      updates.field_meta = newMeta
      updates.updated_at = new Date().toISOString()

      const { error } = await supabase.from('jobs').update(updates).eq('id', job.id)
      if (error) throw error

      showToast('Saved successfully.', 'success')
      cancelEditing()
      await refreshJobs()
    } catch (e) {
      showToast(e?.message || 'Save failed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateStage = async (job, nextStage) => {
    if (!canUpdateStage) return
    setSaving(true)
    try {
      const meta = job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : {}
      const newMeta = { ...meta, stage: { by: currentUserName, ts: Date.now() } }
      const { error } = await supabase
        .from('jobs')
        .update({ stage: Number(nextStage), field_meta: newMeta, updated_at: new Date().toISOString() })
        .eq('id', job.id)
      if (error) throw error
      showToast(`Stage updated to: ${getStageName(Number(nextStage))}`, 'success')
      await refreshJobs()
    } catch (e) {
      showToast(e?.message || 'Stage update failed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const inputBase =
    'w-full h-9 px-3 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 disabled:opacity-60 disabled:cursor-not-allowed'

  const FieldLabel = ({ label, locked }) => (
    <div className="flex items-center gap-2 mb-1">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      {locked && <span className="text-slate-400 text-[12px]" title="No permission">🔒</span>}
    </div>
  )

  const MiniStatus = ({ title, value, tone }) => {
    const tones = {
      blue: 'border-t-blue-500',
      amber: 'border-t-amber-500',
      green: 'border-t-green-500',
      gray: 'border-t-slate-400',
    }
    return (
      <div className={classNames('bg-white border border-slate-200 rounded-xl shadow-sm p-3 border-t-4', tones[tone] || tones.blue)}>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{title}</p>
        <p className="text-sm font-semibold text-slate-800 mt-1 truncate" title={value}>
          {value}
        </p>
      </div>
    )
  }

  const JobProgress = ({ stage }) => {
    const s = Number(stage) || 0
    const pct = Math.min(100, Math.round((s / 10) * 100))
    return (
      <div className="mt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400 truncate">Stage {s}: {getStageName(s)}</span>
          <span className="text-[11px] text-slate-400">{pct}%</span>
        </div>
        <div className="mt-1 h-1 bg-slate-200 rounded overflow-hidden">
          <div className={classNames('h-full rounded', progressColor(s))} style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-slate-100 text-[14px]">
      <aside className="w-[205px] bg-slate-900 border-r border-slate-700/60 text-slate-200 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-extrabold text-sm">
            JD
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-100 truncate">JDS Logistics</div>
            <div className="text-[11px] text-slate-400 truncate">Employee — Command Center</div>
          </div>
        </div>
        <div className="px-4 pt-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Operations
        </div>
        <nav className="flex-1 py-1">
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 border-l-4 bg-slate-700 text-blue-300 border-l-blue-300 font-semibold"
          >
            <span className="w-4 text-center shrink-0 opacity-90">■</span>
            <span className="truncate">All Jobs</span>
          </button>
        </nav>
        <div className="mt-auto border-t border-slate-700/60 px-4 py-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-700 text-white flex items-center justify-center text-[10px] font-bold">
            {(profile?.name || 'E').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-100 truncate">{profile?.name || 'Employee'}</div>
            <div className="text-[11px] text-slate-400 truncate">Employee</div>
          </div>
          <span className="ml-auto w-2 h-2 rounded-full bg-green-500" title="Live" />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-[54px] bg-white border-b border-slate-200 shadow-sm px-4 sm:px-6 flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-base font-bold text-slate-900 truncate">All Jobs</div>
            <div className="text-sm text-slate-400 truncate">Team-wide shipment register</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {canCreateJob && (
              <button
                type="button"
                onClick={() => setShowCreateJob(true)}
                className="h-9 px-4 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold"
              >
                + Create Job
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="h-9 px-4 text-sm rounded-lg border border-slate-300 bg-slate-50 text-red-600 hover:bg-slate-100 font-semibold"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-4">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Jobs</div>
              <div className="text-xs text-slate-400">{filteredJobs.length} shown</div>
            </div>
            <div className="p-4 flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-2 h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg flex-1 min-w-[220px] max-w-[320px]">
                <span className="text-slate-400 text-sm">⎆</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search job, client, BE, BL, container..."
                  className="w-full bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>
              <select
                value={filterStage}
                onChange={(e) => setFilterStage(e.target.value)}
                className="h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none"
              >
                {STAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none"
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
                className="h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none"
              >
                {MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setFilterStage('')
                  setFilterPriority('')
                  setFilterMode('')
                }}
                className="h-9 px-4 text-sm rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
              >
                Clear
              </button>
            </div>
          </div>

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 flex justify-center">
              <div className="h-9 w-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 text-center text-slate-400">
              No jobs match your search/filters.
            </div>
          ) : (
            <div>
              {filteredJobs.map((job) => {
                const isAssignedToMe = user?.id && job.assigned_to === user.id
                const priority = priorityChip(job.priority)
                const mode = modeChip(job.mode)
                const rms = rmsChip(job.rms_status)
                const risk = riskChip(job.detention_risk)
                const expanded = expandedJobId === job.id
                const isEditing = editingJobId === job.id
                const assignedName = job.assigned_to ? profiles[job.assigned_to] ?? '—' : '—'
                const daysOld = daysOldFrom(job.created_at || job.updated_at)
                const meta = job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : {}
                const cfsDisplay =
                  job.cfs_amount !== null && job.cfs_amount !== undefined && job.cfs_amount !== ''
                    ? `Rs. ${Number(job.cfs_amount).toLocaleString('en-IN')}`
                    : 'Pending'

                return (
                  <div
                    key={job.id}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleCardClick(e, job.id)}
                    onKeyDown={(e) => handleCardKeyDown(e, job.id)}
                    className={classNames(
                      'bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-3 cursor-pointer transition-all',
                      'hover:border-blue-300 hover:shadow-md',
                      'border-l-4',
                      String(job.priority || '').toLowerCase() === 'urgent'
                        ? 'border-l-red-600'
                        : String(job.priority || '').toLowerCase() === 'high'
                          ? 'border-l-amber-500'
                          : 'border-l-blue-600'
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-[15px] font-extrabold text-slate-900 truncate">
                            {job.job_no || '—'}
                          </div>
                          {isAssignedToMe && (
                            <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[11px] font-semibold">
                              Assigned to me
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-700 mt-0.5">
                          {job.client || '—'}{' '}
                          <span className="text-slate-400">· {job.goods || '—'}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-1">
                          {job.be_no ? `BE:${job.be_no}` : ''}
                          {job.bl_no ? `${job.be_no ? ' · ' : ''}BL:${job.bl_no}` : ''}
                          {job.containers ? `${job.be_no || job.bl_no ? ' · ' : ''}${job.containers}` : ''}
                          {!job.be_no && !job.bl_no && !job.containers ? '—' : ''}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {meta?.stage?.by || meta?.stage?.ts ? (
                            <>
                              Last updated by:{' '}
                              <span className="text-slate-500 font-medium">{meta.stage.by || '—'}</span>{' '}
                              <span className="text-slate-300">·</span>{' '}
                              <span>{meta.stage.ts ? timeAgo(meta.stage.ts) : '—'}</span>
                            </>
                          ) : (
                            <span>Last updated by: —</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex flex-wrap justify-end gap-2">
                          <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold', priority.cls)}>
                            {priority.text}
                          </span>
                          <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold', mode.cls)}>
                            {mode.text}
                          </span>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold', rms.cls)}>
                            {rms.text}
                          </span>
                          <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold', risk.cls)}>
                            {risk.text}
                          </span>
                        </div>
                      </div>
                    </div>

                    <JobProgress stage={job.stage} />

                    <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-[12px] text-slate-400">
                        <span className="text-slate-500 font-medium">{assignedName}</span> · {job.destination || '—'} ·{' '}
                        <span className={classNames(daysOld >= 4 ? 'text-red-600 font-semibold' : daysOld >= 2 ? 'text-amber-700 font-semibold' : '')}>
                          {daysOld}d old
                        </span>
                        {job.delay_reason ? (
                          <>
                            {' '}
                            · <span className="text-amber-700 font-semibold">{job.delay_reason}</span>
                          </>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditing(job)
                          }}
                          className="h-8 px-3 text-sm rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-4 border-t border-slate-200 pt-4" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                          <MiniStatus title="CUSTOMS" value={job.rms_status ? String(job.rms_status).toUpperCase() : '—'} tone="blue" />
                          <MiniStatus title="CFS" value={cfsDisplay} tone="amber" />
                          <MiniStatus title="TRANSPORT" value={job.vessel?.trim() ? job.vessel : 'Not Yet'} tone="gray" />
                          <MiniStatus title="DELIVERY" value={job.destination?.trim() ? job.destination : 'Pending'} tone="green" />
                        </div>

                        {canUpdateStage && (
                          <div className="mb-4 flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Update Stage</span>
                            <select
                              disabled={saving}
                              value={Number(isEditing ? editForm.stage ?? job.stage : job.stage)}
                              onChange={(e) => updateStage(job, e.target.value)}
                              className={classNames(inputBase, 'h-9 text-sm max-w-[320px]')}
                            >
                              {STAGE_LIST.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.value} — {s.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                          {[
                            'job_no',
                            'client',
                            'mode',
                            'priority',
                            'goods',
                            'bl_no',
                            'be_no',
                            'containers',
                            'shipping_line',
                            'vessel',
                            'eta',
                            'cfs_name',
                            'cfs_amount',
                            'hs_code',
                            'rms_status',
                            'bg_required',
                            'destination',
                            'free_days',
                            'detention_risk',
                            'delay_reason',
                            'notes',
                          ].map((k) => {
                            const locked = !isFieldEditable(k)
                            const value = isEditing ? (editForm[k] ?? '') : job[k]
                            const disabled = locked || saving || !isEditing

                            const renderInput = () => {
                              if (!isEditing) {
                                let shown = displayValue(value)
                                if (k === 'eta') shown = formatDateSlash(value)
                                if (k === 'cfs_amount') {
                                  shown = value !== null && value !== undefined && value !== '' ? `Rs. ${Number(value).toLocaleString('en-IN')}` : 'Pending'
                                }
                                return <div className="text-sm text-slate-900">{shown}</div>
                              }

                              if (k === 'mode') {
                                return (
                                  <select value={value || ''} onChange={updateEditField(k)} disabled={disabled} className={inputBase} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                    <option value="">—</option>
                                    <option value="Sea FCL">Sea FCL</option>
                                    <option value="Sea LCL">Sea LCL</option>
                                    <option value="Air">Air</option>
                                    <option value="BPT/MBPT">BPT/MBPT</option>
                                  </select>
                                )
                              }
                              if (k === 'priority') {
                                return (
                                  <select value={value || 'normal'} onChange={updateEditField(k)} disabled={disabled} className={inputBase} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                    <option value="normal">Normal</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                  </select>
                                )
                              }
                              if (k === 'rms_status') {
                                return (
                                  <select value={value || 'pending'} onChange={updateEditField(k)} disabled={disabled} className={inputBase} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                    <option value="pending">pending</option>
                                    <option value="rms">rms</option>
                                    <option value="apr">apr</option>
                                    <option value="acl">acl</option>
                                    <option value="check">check</option>
                                    <option value="hold">hold</option>
                                  </select>
                                )
                              }
                              if (k === 'bg_required') {
                                return (
                                  <select value={value || 'no'} onChange={updateEditField(k)} disabled={disabled} className={inputBase} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                    <option value="no">no</option>
                                    <option value="yes">yes</option>
                                    <option value="100percent">100percent</option>
                                  </select>
                                )
                              }
                              if (k === 'detention_risk') {
                                return (
                                  <select value={value || 'low'} onChange={updateEditField(k)} disabled={disabled} className={inputBase} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                    <option value="low">low</option>
                                    <option value="medium">medium</option>
                                    <option value="high">high</option>
                                  </select>
                                )
                              }
                              if (k === 'eta') {
                                return <input type="date" value={value || ''} onChange={updateEditField(k)} disabled={disabled} className={inputBase} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} />
                              }
                              if (k === 'free_days' || k === 'cfs_amount') {
                                return <input type="number" value={value ?? ''} onChange={updateEditField(k)} disabled={disabled} className={inputBase} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} />
                              }
                              if (k === 'notes') {
                                return <textarea rows={3} value={value || ''} onChange={updateEditField(k)} disabled={disabled} className={classNames(inputBase, 'h-auto py-2')} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} />
                              }
                              if (k === 'shipping_line') {
                                return (
                                  <select value={value || ''} onChange={updateEditField(k)} disabled={disabled} className={inputBase} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
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
                              return <input type="text" value={value || ''} onChange={updateEditField(k)} disabled={disabled} className={inputBase} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} />
                            }

                            return (
                              <div key={k} className={k === 'notes' ? 'md:col-span-2' : ''}>
                                <FieldLabel label={FIELD_LABELS[k] || k} locked={locked} />
                                {renderInput()}
                              </div>
                            )
                          })}
                        </div>

                        {job.delay_reason?.trim() && (
                          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            <span className="font-semibold">⚠ Delay:</span> {job.delay_reason}
                          </div>
                        )}

                        {job.notes?.trim() && !isEditing && (
                          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</p>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.notes}</p>
                          </div>
                        )}

                        {isEditing && (
                          <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
                              className="h-9 px-4 text-sm rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold disabled:opacity-60"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={(e) => { e.stopPropagation(); saveEdits(job); }}
                              className="h-9 px-4 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold disabled:opacity-60 inline-flex items-center gap-2"
                            >
                              {saving && <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>

      {toastState && (
        <div
          className={classNames(
            'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-lg border',
            toastState.type === 'success' && 'bg-green-600 text-white border-green-700',
            toastState.type === 'error' && 'bg-red-600 text-white border-red-700',
            toastState.type === 'info' && 'bg-slate-900 text-white border-slate-800'
          )}
        >
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
