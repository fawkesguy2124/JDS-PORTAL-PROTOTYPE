import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { getStageName } from '../utils/jobHelpers'
import CreateJob from './CreateJob'
import * as XLSX from 'xlsx'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const NAV_ITEMS = [
  { id: 'jobs', label: 'All Jobs', icon: '■' },
  { id: 'documents', label: 'Documents', icon: '⌁' },
]

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDateSlash(value) {
  if (!value) return '—'
  const d = new Date(value)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

export default function EmployeeDashboard() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
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
  const [showMyJobs, setShowMyJobs] = useState(false)
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [expandedDocJobId, setExpandedDocJobId] = useState(null)
  const [previewModal, setPreviewModal] = useState({ open: false, doc: null })
  const [extractModal, setExtractModal] = useState({ open: false, job: null, docs: [] })
  const [extracting, setExtracting] = useState(false)
  const [extractedFields, setExtractedFields] = useState(null)
  const [extractEdits, setExtractEdits] = useState(null)
  const [extractError, setExtractError] = useState(null)
  const [extractProgress, setExtractProgress] = useState('')
  const [uploadModal, setUploadModal] = useState({ open: false, job: null })
  const [uploadDocType, setUploadDocType] = useState('BL')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const activeNav = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('tab') || 'jobs'
  }, [location.search])

  const handleNavClick = (id) => {
    navigate(`/dashboard?tab=${id}`, { replace: true })
  }

  const isAkshyani = profile?.name === 'Akshyani'

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
      'container_size',
    ],
    Akshyani: [
      'job_no',
      'client',
      'mode',
      'bl_no',
      'containers',
      'container_size',
      'shipping_line',
      'vessel',
      'eta',
      'cfs_name',
      'be_no',
      'be_date',
      'hs_code',
      'rms_status',
      'bg_required',
    ],
    Trupti: ['be_no', 'be_date', 'hs_code', 'rms_status', 'stage'],
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
    if (p === 'urgent') return { text: 'Urgent', cls: 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]' }
    if (p === 'high') return { text: 'High', cls: 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]' }
    return { text: 'Normal', cls: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]' }
  }

  const modeChip = (mode) => {
    const m = String(mode || '').trim()
    if (m === 'Air') return { text: 'Air', cls: 'bg-[#f5f3ff] text-[#5b21b6] border border-[#ddd6fe]' }
    if (m === 'BPT/MBPT') return { text: 'BPT', cls: 'bg-purple-100 text-purple-800 border border-[#ddd6fe]' }
    if (m === 'Sea LCL') return { text: 'LCL', cls: 'bg-[#f0fdfa] text-[#0f766e] border border-[#99f6e4]' }
    if (m === 'Sea FCL') return { text: 'FCL', cls: 'bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]' }
    return { text: m || '—', cls: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]' }
  }

  const rmsChip = (rms) => {
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

  const riskChip = (risk) => {
    const r = String(risk || '').toLowerCase()
    if (r === 'high') return { text: 'High Risk', cls: 'bg-red-100 text-red-800' }
    if (r === 'medium') return { text: 'Medium', cls: 'bg-amber-100 text-amber-800' }
    if (r === 'low') return { text: 'Low', cls: 'bg-green-100 text-green-800' }
    return { text: displayValue(risk), cls: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]' }
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
      if (showMyJobs && user?.id && j.assigned_to !== user.id) return false
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
  }, [jobs, search, filterStage, filterPriority, filterMode, showMyJobs, user?.id])

  useEffect(() => {
    if (activeNav !== 'documents') return
    let mounted = true
    setLoadingDocs(true)
    ;(async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
      if (mounted) {
        if (!error) setDocuments(data ?? [])
        setLoadingDocs(false)
      }
    })()
    return () => { mounted = false }
  }, [activeNav])

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
        'container_size',
        'shipping_line',
        'vessel',
        'eta',
        'cfs_name',
        'be_no',
        'be_date',
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
        if (k === 'eta' || k === 'be_date') next = next ? next : null
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
    'w-full h-9 px-3 text-sm rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:ring-2 focus:ring-[#e8eef8] focus:border-[#1a4fa0] disabled:opacity-60 disabled:cursor-not-allowed'

  const FieldLabel = ({ label, locked }) => (
    <div className="flex items-center gap-2 mb-1">
      <p className="text-xs font-semibold text-[#8a96a8] uppercase tracking-wide">{label}</p>
      {locked && <span className="text-[#8a96a8] text-sm" title="No permission">🔒</span>}
    </div>
  )

  const MiniStatus = ({ title, value, tone }) => {
    const tones = {
      blue: 'border-t-blue-500',
      amber: 'border-t-amber-500',
      green: 'border-t-green-500',
      gray: 'border-t-[#8a96a8]',
    }
    return (
      <div className={classNames('bg-white border border-[#e2e6ed] rounded-xl shadow-sm p-3 border-t-4', tones[tone] || tones.blue)}>
        <p className="text-xs font-semibold text-[#8a96a8] uppercase tracking-wide">{title}</p>
        <p className="text-sm font-semibold text-[#1a2233] mt-1 truncate" title={value}>
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
          <span className="text-xs text-[#8a96a8] truncate">Stage {s}: {getStageName(s)}</span>
          <span className="text-xs text-[#8a96a8]">{pct}%</span>
        </div>
        <div className="mt-1 h-1 bg-[#e2e6ed] border border-[#e2e6ed] rounded overflow-hidden">
          <div className={classNames('h-full rounded', progressColor(s))} style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
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

  async function compressImage(base64, mimeType, maxWidth = 1000, quality = 0.6) {
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

  const withRetry = async (fn, maxRetries = 3) => {
    const rateLimitDelays = [3000, 6000, 12000]
    let lastError
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err
        if (err.name === 'AbortError') throw new Error('Request timed out after 120 seconds. Please try again.')
        const isRateLimit = err.message?.includes('rate_limit') || err.message?.includes('Rate limit') || err.message?.includes('429')
        if (isRateLimit) {
          const delay = rateLimitDelays[attempt] || 12000
          if (attempt < maxRetries) await new Promise((r) => setTimeout(r, delay))
        } else if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
        }
      }
    }
    throw lastError
  }

  const pdfToImages = async (base64) => {
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
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      await page.render({ canvasContext: ctx, viewport }).promise
      const imgBase64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
      images.push({ base64: imgBase64, mimeType: 'image/jpeg' })
    }
    return images
  }

  const confidenceColor = (value, confidence) => {
    if (!value) return 'border-l-red-500 bg-red-50'
    if (confidence === 'high') return 'border-l-green-500 bg-green-50/40'
    if (confidence === 'medium') return 'border-l-amber-500 bg-amber-50/40'
    return 'border-l-red-500 bg-red-50'
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return '—'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const uploadDocument = async () => {
    const job = uploadModal.job
    if (!job || !uploadFile || !uploadDocType) return
    setUploading(true)
    setUploadProgress(0)
    try {
      if (uploadFile.size > 10 * 1024 * 1024) {
        showToast('File size exceeds 10MB limit.', 'error')
        setUploading(false)
        return
      }
      setUploadProgress(20)
      const sanitized = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${job.id}/${Date.now()}_${sanitized}`
      const { error: uploadError } = await supabase.storage
        .from('job-documents')
        .upload(filePath, uploadFile)
      if (uploadError) throw uploadError
      setUploadProgress(60)
      const { data: urlData } = supabase.storage
        .from('job-documents')
        .getPublicUrl(filePath)
      const fileUrl = urlData?.publicUrl
      if (!fileUrl) throw new Error('Failed to get public URL')
      setUploadProgress(80)
      const ext = (uploadFile.name.split('.').pop() || '').toLowerCase()
      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          job_id: job.id,
          job_no: job.job_no,
          file_name: uploadFile.name,
          file_type: ext,
          doc_type: uploadDocType,
          file_url: fileUrl,
          file_path: filePath,
          uploaded_by: user.id,
          uploaded_by_name: profile?.name || 'Unknown',
          file_size: uploadFile.size,
        })
      if (insertError) throw insertError
      setUploadProgress(100)
      setUploadModal({ open: false, job: null })
      setUploadFile(null)
      setUploadDocType('BL')
      setUploadProgress(0)
      showToast('Document uploaded successfully', 'success')
      const { data } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
      if (data) setDocuments(data)
    } catch (e) {
      showToast(e?.message || 'Upload failed.', 'error')
    } finally {
      setUploading(false)
    }
  }

  const closeExtract = () => {
    setExtractModal({ open: false, job: null, docs: [] })
    setExtractedFields(null)
    setExtractEdits(null)
    setExtractError(null)
    setExtracting(false)
    setExtractProgress('')
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

  const runExtraction = async () => {
    const job = extractModal.job
    const docs = extractModal.docs
    const key = import.meta.env.VITE_GROQ_API_KEY
    if (!key) { setExtractError('Groq API key is not configured. Please contact your administrator.'); return }

    setExtracting(true)
    setExtractError(null)
    setExtractedFields(null)
    setExtractEdits(null)
    setExtractProgress('Preparing document...')

    try {
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

      const MAX_IMAGES_PER_REQUEST = 5
      const chunks = []
      for (let i = 0; i < files.length; i += MAX_IMAGES_PER_REQUEST) {
        chunks.push(files.slice(i, i + MAX_IMAGES_PER_REQUEST))
      }

      const prompt = `You are a customs documentation assistant for JDS Logistics, a CHA company in Mumbai, India. Extract shipment details from the uploaded logistics documents. Return ONLY valid JSON. Do not return markdown. Do not return explanations. For each field return: { "value": "...", "confidence": "high|medium|low" }. Fields: bl_number, bl_date, vessel_name, voyage_number, container_numbers, port_of_loading, port_of_discharge, shipper_name, consignee_name, notify_party, hs_code, goods_description, invoice_number, invoice_date, invoice_value, currency, shipment_terms, country_of_origin, number_of_packages, gross_weight, net_weight`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)

      const allResults = []
      for (let ci = 0; ci < chunks.length; ci++) {
        setExtractProgress(`Extracting shipment data (batch ${ci + 1}/${chunks.length})...`)
        if (ci > 0) {
          const delay = 2000 + Math.random() * 2000
          await new Promise((r) => setTimeout(r, delay))
        }
        const raw = await withRetry(() => groqFetch(chunks[ci], prompt, controller.signal))
        const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        const partial = {}
        for (const key of EXTRACT_FIELDS) {
          const field = parsed[key] || {}
          partial[key] = { value: field.value ?? null, confidence: field.confidence ?? null }
        }
        allResults.push(partial)
      }
      clearTimeout(timeout)

      setExtractProgress('Formatting extracted fields...')

      const merged = {}
      for (const key of EXTRACT_FIELDS) {
        merged[key] = { value: null, confidence: null }
      }
      const rankMap = { high: 3, medium: 2, low: 1 }
      for (const partial of allResults) {
        for (const key of EXTRACT_FIELDS) {
          const field = partial[key]
          if (!field || field.value === null || field.value === undefined || field.value === '') continue
          const current = merged[key]
          if (!current.value) {
            merged[key] = { value: field.value, confidence: field.confidence }
          } else if (key === 'container_numbers') {
            const existing = String(current.value).split(',').map((s) => s.trim()).filter(Boolean)
            const incoming = String(field.value).split(',').map((s) => s.trim()).filter(Boolean)
            const combined = [...new Set([...existing, ...incoming])]
            merged[key] = { value: combined.join(', '), confidence: 'medium' }
          } else {
            const currRank = rankMap[current.confidence] || 0
            const newRank = rankMap[field.confidence] || 0
            if (newRank > currRank) {
              merged[key] = { value: field.value, confidence: field.confidence }
            }
          }
        }
      }

      const nonNullCount = Object.values(merged).filter(
        (f) => f && f.value !== null && f.value !== undefined && f.value !== ''
      ).length
      if (nonNullCount < 3) {
        setExtractError(`This does not appear to be a shipping document. Only ${nonNullCount} field(s) could be extracted. Please upload a Bill of Lading, Commercial Invoice, Packing List, or Certificate of Origin.`)
        setExtracting(false); return
      }
      if (nonNullCount < 8) {
        showToast(`Low confidence extraction — only ${nonNullCount} of 27 fields found. Please verify this is the correct document and review all fields carefully.`, 'error')
      }
      setExtractedFields(merged)
      setExtractEdits(JSON.parse(JSON.stringify(merged)))
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

  return (
    <div className="min-h-screen flex bg-[#f4f6f9] text-[14px]">
      <aside className="w-[230px] bg-[#1a4fa0] flex flex-col shrink-0 h-screen fixed left-0 top-0 z-50">
        <div className="px-4 py-3 border-b border-white/15 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white text-[#1a4fa0] flex items-center justify-center font-extrabold text-sm">
            JD
          </div>
          <div className="min-w-0">
            <div className="text-white font-bold truncate">JDS Logistics</div>
            <div className="text-white/60 truncate">Employee — Command Center</div>
          </div>
        </div>
        <div className="px-4 pt-3 pb-1 text-xs font-bold text-white/45 uppercase tracking-wider">
          Operations
        </div>
        <nav className="flex-1 py-1">
          {NAV_ITEMS.filter((item) => item.id !== 'documents' || isAkshyani).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={classNames(
                'w-full text-left px-5 py-2.5 text-sm flex items-center gap-1.5 border-l-2 transition-colors',
                activeNav === item.id
                  ? 'bg-white/15 text-white border-l-2 border-white font-semibold'
                  : 'text-white/70 hover:bg-white/10 hover:text-white border-l-2 border-transparent'
              )}
            >
              <span className="w-3.5 text-center shrink-0 opacity-90">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/15 px-4 py-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-white/20 border-2 border-white/30 text-white flex items-center justify-center text-xs font-bold">
            {(profile?.name || 'E').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-white font-semibold truncate">{profile?.name || 'Employee'}</div>
            <div className="text-white/55 truncate">Employee</div>
          </div>
          <span className="ml-auto w-2 h-2 rounded-full bg-green-400" title="Live" />
        </div>
      </aside>

      <div className="bg-[#f4f6f9] flex-1 flex flex-col min-w-0 overflow-hidden ml-[230px]">
        <header className="h-[60px] bg-white border-b border-[#e2e6ed] shadow-sm px-6 flex items-center gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-[17px] font-bold text-[#1a2233] truncate">
              {NAV_ITEMS.find((n) => n.id === activeNav)?.label ?? 'All Jobs'}
            </div>
            <div className="text-sm text-[#8a96a8] truncate">Employee Command Center</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {canCreateJob && (
              <button
                type="button"
                onClick={() => setShowCreateJob(true)}
                className="h-9 px-4 text-sm rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold"
              >
                + Create Job
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="h-9 px-4 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#dc2626] hover:border-[#fecaca] hover:bg-[#fef2f2] font-semibold"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeNav === 'jobs' && (
            <>
              <div className="mb-4 text-sm text-[#8a96a8]">
                {getGreeting()}, <span className="font-semibold text-[#4a5568]">{profile?.name || 'there'}</span>
              </div>

              <div className="bg-white border border-[#e2e6ed] rounded-xl shadow-sm mb-4">
                <div className="px-4 py-3 bg-[#f8f9fb] border-b border-[#e2e6ed] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-[#1a2233]">Jobs</div>
                    <button
                      type="button"
                      onClick={() => setShowMyJobs(!showMyJobs)}
                      className={classNames(
                        'px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors',
                        showMyJobs
                          ? 'bg-[#1a4fa0] text-white border border-[#1a4fa0]'
                          : 'bg-white text-[#4a5568] border-[1.5px] border-[#d0d6e0]'
                      )}
                    >
                      {showMyJobs ? '\u25CF My Jobs' : '\u25CB My Jobs'}
                    </button>
                  </div>
                  <div className="text-xs text-[#8a96a8]">{filteredJobs.length} shown</div>
                </div>
                <div className="p-4 flex flex-wrap gap-2 items-center">
                  <div className="flex items-center gap-2 h-9 px-3 bg-white border-[1.5px] border-[#e2e6ed] rounded-lg flex-1 min-w-[220px] max-w-[320px] focus-within:border-[#1a4fa0]">
                    <span className="text-[#8a96a8] text-sm">⎆</span>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search job, client, BE, BL, container..."
                      className="w-full bg-transparent outline-none text-sm text-[#1a2233] placeholder:text-[#8a96a8]"
                    />
                  </div>
                  <select
                    value={filterStage}
                    onChange={(e) => setFilterStage(e.target.value)}
                    className="h-9 px-3 text-sm bg-white border-[1.5px] border-[#e2e6ed] rounded-lg text-[#4a5568] outline-none focus:border-[#1a4fa0]"
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
                    className="h-9 px-3 text-sm bg-white border-[1.5px] border-[#e2e6ed] rounded-lg text-[#4a5568] outline-none focus:border-[#1a4fa0]"
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
                    className="h-9 px-3 text-sm bg-white border-[1.5px] border-[#e2e6ed] rounded-lg text-[#4a5568] outline-none focus:border-[#1a4fa0]"
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
                      setShowMyJobs(false)
                    }}
                    className="h-9 px-4 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8]"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="bg-white border border-[#e2e6ed] rounded-xl shadow-sm p-10 flex justify-center">
                  <div className="h-9 w-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="bg-white border border-[#e2e6ed] rounded-xl shadow-sm p-10 text-center text-[#8a96a8]">
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
                          'bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-4 mb-3 cursor-pointer transition-all',
                          'hover:border-[#d0d6e0] hover:shadow-md',
                          'border-l-4',
                          String(job.priority || '').toLowerCase() === 'urgent'
                            ? 'border-l-[#dc2626]'
                            : String(job.priority || '').toLowerCase() === 'high'
                              ? 'border-l-[#f59e0b]'
                              : 'border-l-[#1a4fa0]'
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-[15px] font-extrabold text-[#1a2233] truncate">
                                {job.job_no || '—'}
                              </div>
                              {isAssignedToMe && (
                                <span className="inline-flex items-center rounded-full bg-[#e8eef8] text-[#1a4fa0] border border-[#bfdbfe] px-2.5 py-0.5 text-xs font-semibold">
                                  Assigned to me
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-[#4a5568] mt-0.5">
                              {job.client || '—'}{' '}
                              <span className="text-[#8a96a8]">· {job.goods || '—'}</span>
                            </div>
                            <div className="text-xs text-[#8a96a8] font-mono mt-1">
                              {job.be_no ? `BE:${job.be_no}` : ''}
                              {job.bl_no ? `${job.be_no ? ' · ' : ''}BL:${job.bl_no}` : ''}
                              {job.containers ? `${job.be_no || job.bl_no ? ' · ' : ''}${job.containers}` : ''}
                              {!job.be_no && !job.bl_no && !job.containers ? '—' : ''}
                            </div>
                            <div className="text-xs text-[#8a96a8] mt-1">
                              {meta?.stage?.by || meta?.stage?.ts ? (
                                <>
                                  Last updated by:{' '}
                                  <span className="text-[#8a96a8] font-medium">{meta.stage.by || '—'}</span>{' '}
                                  <span className="text-[#d0d6e0]">·</span>{' '}
                                  <span>{meta.stage.ts ? timeAgo(meta.stage.ts) : '—'}</span>
                                </>
                              ) : (
                                <span>Last updated by: —</span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="flex flex-wrap justify-end gap-2">
                              <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', priority.cls)}>
                                {priority.text}
                              </span>
                              <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', mode.cls)}>
                                {mode.text}
                              </span>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', rms.cls)}>
                                {rms.text}
                              </span>
                              <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', risk.cls)}>
                                {risk.text}
                              </span>
                            </div>
                          </div>
                        </div>

                        <JobProgress stage={job.stage} />

                        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                          <div className="text-sm text-[#8a96a8]">
                            <span className="text-[#8a96a8] font-medium">{assignedName}</span> · {job.destination || '—'} ·{' '}
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
                              className="h-8 px-3 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8]"
                            >
                              Edit
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <div className="mt-4 border-t border-[#e2e6ed] pt-4" onClick={(e) => e.stopPropagation()}>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                              <MiniStatus title="CUSTOMS" value={job.rms_status ? String(job.rms_status).toUpperCase() : '—'} tone="blue" />
                              <MiniStatus title="CFS" value={cfsDisplay} tone="amber" />
                              <MiniStatus title="TRANSPORT" value={job.vessel?.trim() ? job.vessel : 'Not Yet'} tone="gray" />
                              <MiniStatus title="DELIVERY" value={job.destination?.trim() ? job.destination : 'Pending'} tone="green" />
                            </div>

                            {canUpdateStage && (
                              <div className="mb-4 flex items-center gap-2">
                                <span className="text-xs font-semibold text-[#8a96a8] uppercase tracking-wide">Update Stage</span>
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
                                'be_date',
                                'containers',
                                'container_size',
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
                                    if (k === 'eta' || k === 'be_date') shown = formatDateSlash(value)
                                    if (k === 'cfs_amount') {
                                      shown = value !== null && value !== undefined && value !== '' ? `Rs. ${Number(value).toLocaleString('en-IN')}` : 'Pending'
                                    }
                                    return <div className="text-sm text-[#1a2233] font-medium">{shown}</div>
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
                                  if (k === 'be_date') {
                                    return <input type="date" value={value || ''} onChange={updateEditField(k)} disabled={disabled} className={inputBase} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} />
                                  }
                                  if (k === 'container_size') {
                                    return (
                                      <select value={value || ''} onChange={updateEditField(k)} disabled={disabled} className={inputBase} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                        <option value="">— Select —</option>
                                        <option value="20 Feet">20 Feet</option>
                                        <option value="40 Feet">40 Feet</option>
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
                                <span className="font-semibold">\u26A0 Delay:</span> {job.delay_reason}
                              </div>
                            )}

                            {job.notes?.trim() && !isEditing && (
                              <div className="mt-4 rounded-lg border border-[#e2e6ed] bg-[#f8f9fb] px-4 py-3">
                                <p className="text-xs font-semibold text-[#8a96a8] uppercase tracking-wide mb-1">Notes</p>
                                <p className="text-sm text-[#4a5568] whitespace-pre-wrap">{job.notes}</p>
                              </div>
                            )}

                            {isEditing && (
                              <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
                                  className="h-9 px-4 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={(e) => { e.stopPropagation(); saveEdits(job); }}
                                  className="h-9 px-4 text-sm rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold disabled:opacity-60 inline-flex items-center gap-2"
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
            </>
          )}

          {activeNav === 'documents' && (
            <div>
              <div className="text-lg font-bold text-[#1a2233] mb-4">Documents</div>
              {loadingDocs ? (
                <div className="bg-white border border-[#e2e6ed] rounded-xl shadow-sm p-10 flex justify-center">
                  <div className="h-9 w-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : documents.length === 0 ? (
                <div className="bg-white border border-[#e2e6ed] rounded-xl shadow-sm p-10 text-center text-[#8a96a8]">
                  No documents uploaded yet. Upload documents when creating a job.
                </div>
              ) : (
                <div className="bg-white border border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
                  {Object.entries(
                    documents.reduce((groups, doc) => {
                      const key = doc.job_no || 'unknown'
                      if (!groups[key]) groups[key] = []
                      groups[key].push(doc)
                      return groups
                    }, {})
                  ).map(([jobNo, docs]) => {
                    const isExpanded = expandedDocJobId === jobNo
                    const docCount = docs.length
                    return (
                      <div key={jobNo} className="border-b border-[#e2e6ed] last:border-b-0">
                        <button
                          type="button"
                          onClick={() => setExpandedDocJobId(isExpanded ? null : jobNo)}
                          className="w-full px-4 py-3 bg-[#f8f9fb] font-semibold text-sm text-[#1a2233] border-b border-[#e2e6ed] flex items-center justify-between gap-2 hover:bg-[#e8eef8] transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate">{jobNo}</span>
                            <span className="text-[#8a96a8] text-xs font-normal truncate">{jobs.find(j => j.job_no === jobNo)?.client || ''}</span>
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0] shrink-0">{docCount}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setUploadModal({ open: true, job: jobs.find(j => j.job_no === jobNo) || { job_no: jobNo, client: '', id: '' } })}
                              className="h-8 px-3 text-xs rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold"
                            >
                              Upload Document
                            </button>
                            {isAkshyani && docCount > 0 && (
                              <button
                                type="button"
                                onClick={() => setExtractModal({ open: true, job: jobs.find(j => j.job_no === jobNo) || { job_no: jobNo, client: '' }, docs })}
                                className="h-8 px-3 text-xs rounded-md border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold"
                              >
                                &#10026; Extract
                              </button>
                            )}
                            <span className="text-[#8a96a8] text-sm">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[#8a96a8] border-b border-[#e2e6ed] bg-[#f8f9fb]">
                                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-4 py-3">File Name</th>
                                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-4 py-3">Doc Type</th>
                                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-4 py-3">Uploaded</th>
                                  <th className="text-left font-semibold uppercase tracking-wide text-xs px-4 py-3">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {docs.map((doc) => (
                                  <tr key={doc.id} className="border-b border-[#e2e6ed] last:border-b-0">
                                    <td className="px-4 py-3 text-[#1a2233] font-medium truncate max-w-[250px]" title={doc.file_name}>{doc.file_name}</td>
                                    <td className="px-4 py-3">
                                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-800 border border-[#bfdbfe]">{doc.doc_type || '—'}</span>
                                    </td>
                                    <td className="px-4 py-3 text-[#8a96a8] whitespace-nowrap">
                                      {doc.created_at ? new Date(doc.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setPreviewModal({ open: true, doc })}
                                          className="h-7 px-2.5 text-xs rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-semibold"
                                        >
                                          Preview
                                        </button>
                                        <a href={doc.file_url} download={doc.file_name}
                                          className="h-7 px-2.5 text-xs rounded-md bg-white text-[#4a5568] border border-[#e2e6ed] hover:bg-[#e8eef8] font-semibold inline-flex items-center no-underline">
                                          Download
                                        </a>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {previewModal.open && previewModal.doc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-2xl border border-[#e2e6ed] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-[#1a2233] truncate">{previewModal.doc.file_name}</span>
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-800 border border-[#bfdbfe]">{previewModal.doc.doc_type}</span>
              </div>
              <button type="button" onClick={() => setPreviewModal({ open: false, doc: null })}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[#fef2f2] hover:text-[#dc2626] transition-colors text-lg leading-none shrink-0">&times;</button>
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
                className="h-9 px-4 text-sm rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold no-underline inline-flex items-center">
                Download
              </a>
              <button type="button" onClick={() => setPreviewModal({ open: false, doc: null })}
                className="h-9 px-4 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {extractModal.open && extractModal.job && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-[#e2e6ed]">
            <div className="px-6 py-4 border-b border-[#e2e6ed] flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <div className="text-sm font-bold text-[#1a2233]">AI Document Extraction &mdash; {extractModal.job.job_no}</div>
                <div className="text-xs text-[#8a96a8]">{extractModal.job.client}</div>
              </div>
              <button type="button" onClick={closeExtract}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[#fef2f2] text-[#8a96a8] hover:text-[#dc2626] text-lg leading-none">&times;</button>
            </div>

            <div className="p-6 space-y-6">
              {!extracting && !extractedFields && !extractError && (
                <div>
                  <p className="text-sm font-semibold text-[#4a5568] mb-3">Documents to process ({extractModal.docs.length})</p>
                  <div className="space-y-2">
                    {extractModal.docs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 text-sm text-[#4a5568] px-3 py-2 bg-[#f8f9fb] rounded-lg border border-[#e2e6ed]">
                        <span className="text-base">📄</span>
                        <span className="truncate">{doc.file_name}</span>
                        <span className="text-xs text-[#8a96a8] ml-auto">{doc.doc_type}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={runExtraction} disabled={extracting}
                    className="mt-4 h-10 px-5 text-sm font-semibold rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2">
                    {extracting ? 'Extraction in progress...' : '✦ Extract'}
                  </button>
                </div>
              )}

              {extracting && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="h-10 w-10 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-sm font-semibold text-[#4a5568]">{extractProgress || 'AI is extracting shipment data...'}</p>
                  <p className="text-sm text-[#8a96a8]">This may take up to 2 minutes for large documents</p>
                </div>
              )}

              {extractError && !extracting && (
                <div className="flex flex-col items-center py-10">
                  <p className="text-sm text-red-600 font-semibold mb-3">{extractError}</p>
                  <button type="button" onClick={runExtraction}
                    className="h-9 px-4 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold">
                    Retry
                  </button>
                </div>
              )}

              {extractedFields && extractEdits && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-[#4a5568]">Confidence:</span>
                    {(() => {
                      const summary = EXTRACT_FIELDS.reduce((acc, k) => {
                        const f = extractedFields[k]
                        if (!f?.value) acc.notFound++
                        else if (f.confidence === 'high') acc.high++
                        else acc.needsReview++
                        return acc
                      }, { high: 0, needsReview: 0, notFound: 0 })
                      return (
                        <>
                          {summary.high > 0 && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-green-100 text-green-800">{summary.high}</span>
                          )}
                          {summary.needsReview > 0 && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800">{summary.needsReview}</span>
                          )}
                          {summary.notFound > 0 && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-red-100 text-red-800">{summary.notFound}</span>
                          )}
                          <span className="text-xs text-[#8a96a8]">{summary.high} high · {summary.needsReview} need review · {summary.notFound} not found</span>
                        </>
                      )
                    })()}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                    {EXTRACT_FIELDS.map((k) => {
                      const f = extractEdits[k] || {}
                      const value = f.value ?? ''
                      const confidence = f.confidence
                      const borderCls = confidenceColor(value, confidence)
                      return (
                        <div key={k}>
                          <p className="text-xs font-semibold text-[#8a96a8] uppercase tracking-wide mb-1">{EXTRACT_LABELS[k] || k}</p>
                          <input type="text" value={value} onChange={(e) => setExtractEdits((prev) => ({ ...prev, [k]: { ...prev[k], value: e.target.value } }))}
                            placeholder={value ? '' : 'Not found'}
                            className={`w-full h-9 px-3 text-xs rounded-lg border border-[#e2e6ed] bg-[#f8f9fb] text-[#1a2233] outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 ${borderCls} border-l-4 ${!value ? 'text-red-600 placeholder:text-red-300' : ''}`} />
                          {confidence && (
                            <p className={`text-xs mt-0.5 font-medium ${confidence === 'high' ? 'text-green-600' : confidence === 'medium' ? 'text-amber-600' : 'text-red-600'}`}>
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

            {extractedFields && (
              <div className="px-6 py-4 border-t border-[#e2e6ed] flex items-center gap-3 sticky bottom-0 bg-white">
                <button type="button" onClick={closeExtract}
                  className="h-9 px-4 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold">
                  Close
                </button>
                <button type="button" onClick={() => { setExtractedFields(null); setExtractEdits(null); setExtractError(null); }}
                  className="h-9 px-4 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold">
                  Extract Again
                </button>
                <button type="button" onClick={downloadExcel}
                  className="h-9 px-4 text-sm rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold ml-auto">
                  &#128229; Download Excel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {uploadModal.open && uploadModal.job && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-[#e2e6ed] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-[#1a2233] truncate">Upload Document &mdash; {uploadModal.job.job_no} {uploadModal.job.client ? `(${uploadModal.job.client})` : ''}</div>
              <button type="button" onClick={() => { setUploadModal({ open: false, job: null }); setUploadFile(null); setUploadDocType('BL'); setUploadProgress(0); }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[#e8eef8] text-[#8a96a8] hover:text-[#4a5568] text-lg leading-none shrink-0">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-[#8a96a8] uppercase tracking-wide mb-1">Document Type</p>
                <select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)}
                  className="w-full h-9 px-3 text-sm rounded-lg border border-[#e2e6ed] bg-[#f8f9fb] text-[#1a2233] outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300">
                  <option value="BL">BL</option>
                  <option value="Invoice">Invoice</option>
                  <option value="Packing List">Packing List</option>
                  <option value="COO">COO</option>
                  <option value="Insurance">Insurance</option>
                  <option value="BE">BE</option>
                  <option value="Examination Order">Examination Order</option>
                  <option value="OOC">OOC</option>
                  <option value="E-Way Bill">E-Way Bill</option>
                  <option value="POD">POD</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#8a96a8] uppercase tracking-wide mb-1">File</p>
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-[#e2e6ed] rounded-lg bg-white cursor-pointer hover:bg-[#e8eef8] hover:border-[#1a4fa0] transition-colors">
                  {uploadFile ? (
                    <div className="flex flex-col items-center gap-1 px-3">
                      <span className="text-sm font-medium text-[#4a5568] truncate max-w-full">{uploadFile.name}</span>
                      <span className="text-xs text-[#8a96a8]">{formatFileSize(uploadFile.size)}</span>
                      <button type="button" onClick={(e) => { e.preventDefault(); setUploadFile(null); }}
                        className="text-xs text-red-600 hover:text-red-700 font-semibold">Remove</button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-lg text-[#8a96a8]">+</span>
                      <span className="text-sm text-[#8a96a8] font-medium">Click to select or drag &amp; drop</span>
                      <span className="text-xs text-[#8a96a8]">PDF, JPG, PNG &mdash; max 10MB</span>
                    </div>
                  )}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFile(f); }} className="hidden" />
                </label>
              </div>
              {uploading && (
                <div>
                  <div className="h-2 bg-[#e2e6ed] border border-[#e2e6ed] rounded overflow-hidden">
                    <div className="h-full bg-[#1a4fa0] rounded transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="text-xs text-[#8a96a8] mt-1">{uploadProgress}%</p>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-[#e2e6ed] flex items-center justify-end gap-2">
              <button type="button" onClick={() => { setUploadModal({ open: false, job: null }); setUploadFile(null); setUploadDocType('BL'); setUploadProgress(0); }}
                className="h-9 px-4 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold">
                Cancel
              </button>
              <button type="button" disabled={!uploadFile || !uploadDocType || uploading} onClick={uploadDocument}
                className="h-9 px-4 text-sm rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastState && (
        <div
          className={classNames(
            'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-lg border',
            toastState.type === 'success' && 'bg-[#16a34a] text-white rounded-xl',
            toastState.type === 'error' && 'bg-[#dc2626] text-white rounded-xl',
            toastState.type === 'info' && 'bg-[#1a2233] text-white rounded-xl'
          )}
        >
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
