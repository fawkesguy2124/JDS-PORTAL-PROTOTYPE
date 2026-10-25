import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { fetchAllTracking } from '../services/trackingService'
import { useAuth } from '../contexts/AuthContext'
import { getStageName, parseContainerNos } from '../utils/jobHelpers'
import CreateJob from './CreateJob'
import * as XLSX from 'xlsx'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { readJobDocuments, toExtractFields, unreadableMessage } from '../utils/docReaderMap'
import NotificationBell from '../components/NotificationBell'
import ContainerTrackingSection from '../components/ContainerTrackingSection'
import ShipmentTracker from '../components/ShipmentTracker'
import TodayPage from './v2/TodayPage'
import TrucksPage from './v2/TrucksPage'
import CustomsDeskPage from './v2/CustomsDeskPage'
import SearchPage from './v2/SearchPage'
import ClientsPage from './v2/ClientsPage'
import DetentionPage from './v2/DetentionPage'
import JobDetailView from '../components/JobDetailView'
import { forceRefreshAllContainers } from '../services/tracking/ldbProvider'
import { availableTypes } from '../utils/docTypes'
import { downloadDoc, useDocUrl } from '../services/docFiles'
import PdfPreview from '../components/PdfPreview'

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

function formatDateSlash(value) {
  if (!value) return '—'
  const d = new Date(value)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function EmpContainerSection({ jobs, showToast, pendingNavAction, onNavActionConsumed }) {
  const [trackingData, setTrackingData] = useState({})
  const [loadingTracking, setLoadingTracking] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [detailJob, setDetailJob] = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoadingTracking(true)
      try {
        const { data } = await supabase.from('container_tracking').select('*')
        const map = {}
        for (const row of (data || [])) {
          map[row.container_no] = {
            status:          row.status || 'in_transit',
            statusText:      row.status_text || 'In Transit',
            currentLocation: row.current_location,
            vessel:          row.vessel,
            freeDays:        row.free_days,
            notes:           row.notes,
            lastUpdate:      row.last_update,
            milestones:      row.milestones || [],
            eta:             row.eta,
            portIn:          row.port_in,
            portOut:         row.port_out,
            cfsGateIn:       row.cfs_gate_in,
          }
        }
        setTrackingData(map)
      } catch (e) {
        console.warn('Could not load tracking data:', e)
      } finally {
        setLoadingTracking(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!pendingNavAction || pendingNavAction.tab !== 'containers') return
    if (!pendingNavAction.jobId) return
    const job = (jobs || []).find(j => j.id === pendingNavAction.jobId)
    if (job) {
      setDetailJob(job)
      onNavActionConsumed?.()
    }
  }, [pendingNavAction, jobs])

  const allJobCards = useMemo(() => {
    return (jobs || [])
      .map(job => ({ job, cnList: parseContainerNos(job.containers) }))
      .filter(({ cnList }) => cnList.length > 0)
      .sort((a, b) => {
        const na = parseInt((a.job.job_no || '').replace(/\D/g, '')) || 0
        const nb = parseInt((b.job.job_no || '').replace(/\D/g, '')) || 0
        return nb - na
      })
  }, [jobs])

  const filteredJobCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return allJobCards
    return allJobCards.filter(({ job, cnList }) =>
      (job.job_no  || '').toLowerCase().includes(q) ||
      (job.client  || '').toLowerCase().includes(q) ||
      (job.bl_no   || '').toLowerCase().includes(q) ||
      cnList.some(cn => cn.toLowerCase().includes(q))
    )
  }, [allJobCards, searchQuery])

  const totalContainers = allJobCards.reduce((s, { cnList }) => s + cnList.length, 0)

  const formatD = (d) => d
    ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    : '—'

  const STATUS_STYLES_MAP = {
    in_transit:     { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
    arrived:        { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
    at_cfs:         { bg:'#f0fdfa', color:'#0f766e', border:'#99f6e4' },
    customs_hold:   { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
    on_rail:        { bg:'#eef2ff', color:'#3730a3', border:'#c7d2fe' },
    delivered:      { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
    empty_returned: { bg:'#f9fafb', color:'#4a5568', border:'#d0d6e0' },
    delayed:        { bg:'#fef2f2', color:'#991b1b', border:'#fecaca' },
  }

  if (loadingTracking) return (
    <div className="space-y-3">
      {[1,2,3].map(i => (
        <div key={i} className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl p-4 space-y-3">
          <div className="h-5 w-32 bg-[#e2e6ed] rounded animate-pulse" />
          <div className="h-12 bg-[#e2e6ed] rounded-lg animate-pulse" />
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center h-9 px-3 bg-white border-[1.5px] border-[#e2e6ed] rounded-lg flex-1 min-w-[200px] max-w-[420px] focus-within:border-[#1a4fa0] transition-colors">
          <span className="text-[#8a96a8] mr-2">🔍</span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by job number, client, or container number..."
            className="flex-1 bg-transparent outline-none text-sm text-[#1a2233] placeholder:text-[#8a96a8]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-[#8a96a8] hover:text-[#1a2233] ml-1">✕</button>
          )}
        </div>
        <span className="text-sm text-[#8a96a8] ml-auto">
          {totalContainers} container{totalContainers !== 1 ? 's' : ''} across {allJobCards.length} job{allJobCards.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Info banner */}
      <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl px-4 py-2.5 text-xs text-[#1e40af] flex items-center gap-2">
        <span>💡</span>
        <span>Containers are pulled from jobs. Status updates are made by admins — contact Jose or Durgesh to update a container's status.</span>
      </div>

      {/* Empty state */}
      {filteredJobCards.length === 0 && (
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-12 text-center">
          <div className="text-3xl mb-3">⊟</div>
          <p className="text-sm font-semibold text-[#4a5568]">
            {searchQuery ? `No results for "${searchQuery}"` : 'No jobs with containers yet.'}
          </p>
        </div>
      )}

      <style>{`@media(min-width:640px){ .emp-card-grid { grid-template-columns:repeat(2,1fr) !important } } @media(min-width:1024px){ .emp-card-grid { grid-template-columns:repeat(3,1fr) !important } }`}</style>

      {/* Responsive job card grid */}
      <div className="emp-card-grid" style={{ display:'grid', gridTemplateColumns:'1fr', gap:'14px', alignItems:'start' }}>
        {filteredJobCards.map(({ job, cnList }) => {
          const statuses   = cnList.map(cn => trackingData[cn]?.status || 'in_transit')
          const worstStatus = statuses.includes('delayed') ? 'delayed'
            : statuses.includes('customs_hold')  ? 'customs_hold'
            : statuses.includes('in_transit')    ? 'in_transit'
            : statuses.includes('arrived')       ? 'arrived'
            : statuses.includes('at_cfs')        ? 'at_cfs'
            : statuses.every(s => s === 'delivered') ? 'delivered'
            : 'in_transit'

          const stripeColor = ['delivered','arrived','at_cfs'].includes(worstStatus) ? '#16a34a'
            : ['customs_hold','delayed'].includes(worstStatus) ? '#dc2626'
            : worstStatus === 'in_transit' ? '#f59e0b'
            : '#d0d6e0'

          const etaCol = (() => {
            if (!job.eta) return '#4a5568'
            const days = Math.ceil((new Date(job.eta) - new Date()) / 86400000)
            if (days < 0) return '#dc2626'
            if (days <= 3) return '#b45309'
            return '#4a5568'
          })()

          return (
            <div
              key={job.id}
              onClick={() => setDetailJob(job)}
              style={{
                background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px',
                padding:'16px', position:'relative', overflow:'hidden',
                cursor:'pointer', transition:'all 0.2s', boxSizing:'border-box',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.09)'; e.currentTarget.style.borderColor='#d0d6e0' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='#e2e6ed' }}
            >
              <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'3px', background:stripeColor }} />

              {/* Job header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px' }}>
                <div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'13px', fontWeight:700, color:'#1a4fa0' }}>{job.job_no}</div>
                  <div style={{ fontSize:'12px', fontWeight:600, color:'#1a2233', marginTop:'2px' }}>{job.client}</div>
                  <div style={{ fontSize:'11px', color:'#8a96a8', marginTop:'1px' }}>{job.mode || '—'}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:'12px', fontWeight:600, color:'#4a5568' }}>{job.shipping_line || '—'}</div>
                  <div style={{ fontSize:'11px', color:'#8a96a8', marginTop:'2px' }}>
                    Stage {job.stage ?? 0}
                  </div>
                </div>
              </div>

              {/* Route */}
              <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', marginBottom:'12px' }}>
                <span style={{ fontWeight:600, color:'#1a2233', maxWidth:'90px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {job.vessel || 'Origin'}
                </span>
                <span style={{ color:'#d0d6e0', flex:1, textAlign:'center', fontSize:'10px', letterSpacing:'2px' }}>────→</span>
                <span style={{ fontWeight:600, color:'#1a2233', maxWidth:'90px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {job.destination || 'JNPT, IN'}
                </span>
              </div>

              {/* Container rows */}
              <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'12px' }}>
                {cnList.map(cn => {
                  const td     = trackingData[cn] || {}
                  const status = td.status || 'in_transit'
                  const st     = STATUS_STYLES_MAP[status] || STATUS_STYLES_MAP['in_transit']
                  const isDetention = !['delivered', 'empty_returned'].includes(td.status || 'in_transit') && td.freeDays != null && td.freeDays <= 2

                  return (
                    <div key={cn}>
                      <div
                        onClick={e => { e.stopPropagation(); setDetailJob(job) }}
                        style={{
                          display:'flex', alignItems:'center', gap:'8px',
                          padding:'8px 10px', borderRadius:'8px', cursor:'pointer',
                          background:'#f8f9fb', border:'1.5px solid #e2e6ed', transition:'all 0.15s',
                        }}
                      >
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'12px', fontWeight:600, color:'#1a2233', flex:1 }}>
                          {cn}
                        </span>
                        <span style={{
                          borderRadius:'9999px', padding:'2px 8px', fontSize:'10px', fontWeight:700,
                          background: isDetention ? '#fef2f2' : st.bg,
                          color:      isDetention ? '#991b1b' : st.color,
                          border:     `1px solid ${isDetention ? '#fecaca' : st.border}`,
                          whiteSpace:'nowrap',
                        }}>
                          {isDetention ? '⚠ Detention' : (td.statusText || 'Not Updated')}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #e2e6ed', paddingTop:'10px' }}>
                <div>
                  <div style={{ fontSize:'11px', color:'#8a96a8' }}>ETA JNPT</div>
                  <div style={{ fontSize:'13px', fontWeight:700, fontFamily:"'JetBrains Mono',monospace", marginTop:'2px', color:etaCol }}>
                    {formatD(job.eta)}
                  </div>
                </div>
                <span style={{ fontSize:'11px', fontWeight:700, background:'#f8f9fb', color:'#4a5568', border:'1px solid #e2e6ed', borderRadius:'9999px', padding:'3px 10px' }}>
                  {cnList.length} container{cnList.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Read-only job detail panel */}
      {detailJob && (
        <EmpJobDetailPanel
          job={detailJob}
          trackingData={trackingData}
          onClose={() => setDetailJob(null)}
        />
      )}
    </div>
  )
}

function EmpJobDetailPanel({ job, trackingData, onClose }) {
  const cnList = parseContainerNos(job.containers)

  const formatD  = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'
  const formatDT = (d) => d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'

  const STATUS_STYLES_MAP = {
    in_transit:     { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
    arrived:        { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
    at_cfs:         { bg:'#f0fdfa', color:'#0f766e', border:'#99f6e4' },
    customs_hold:   { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
    on_rail:        { bg:'#eef2ff', color:'#3730a3', border:'#c7d2fe' },
    delivered:      { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
    empty_returned: { bg:'#f9fafb', color:'#4a5568', border:'#d0d6e0' },
    delayed:        { bg:'#fef2f2', color:'#991b1b', border:'#fecaca' },
  }

  const statusProgress = (status) => {
    if (status === 'delivered' || status === 'empty_returned') return 100
    if (status === 'at_cfs')       return 85
    if (status === 'arrived')      return 75
    if (status === 'customs_hold') return 70
    if (status === 'on_rail')      return 90
    if (status === 'delayed')      return 45
    return 55
  }

  const progressColor = (status, freeDays) => {
    if (!['delivered', 'empty_returned'].includes(status) && freeDays != null && freeDays <= 2) return '#dc2626'
    if (['delivered','arrived','at_cfs','on_rail'].includes(status)) return '#16a34a'
    if (['customs_hold','delayed'].includes(status)) return '#dc2626'
    return '#f59e0b'
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:199, cursor:'pointer' }} />
      <div style={{
        position:'fixed', right:0, top:0, bottom:0, width:'min(520px, 100vw)',
        background:'white', borderLeft:'1.5px solid #e2e6ed',
        zIndex:200, display:'flex', flexDirection:'column',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.12)',
        animation:'slideInRight 0.25s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <style>{`@keyframes slideInRight { from { transform:translateX(100%) } to { transform:translateX(0) } }`}</style>

        {/* Header */}
        <div style={{ padding:'18px 22px', borderBottom:'1.5px solid #e2e6ed', background:'#f8f9fb', display:'flex', alignItems:'flex-start', gap:'14px', flexShrink:0 }}>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background:'white', border:'1.5px solid #e2e6ed', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:'14px', color:'#4a5568', flexShrink:0 }}
            onMouseEnter={e => { e.currentTarget.style.background='#fef2f2'; e.currentTarget.style.color='#dc2626' }}
            onMouseLeave={e => { e.currentTarget.style.background='white'; e.currentTarget.style.color='#4a5568' }}
          >✕</button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
              <span style={{ fontSize:'16px', fontWeight:700, color:'#1a2233', fontFamily:"'JetBrains Mono',monospace" }}>{job.job_no}</span>
              {job.mode && <span style={{ borderRadius:'9999px', padding:'2px 8px', fontSize:'11px', fontWeight:600, background:'#eff6ff', color:'#1e40af', border:'1px solid #bfdbfe' }}>{job.mode}</span>}
            </div>
            <div style={{ fontSize:'13px', color:'#4a5568', marginTop:'3px' }}>
              {job.client}{job.shipping_line ? ` · ${job.shipping_line}` : ''} · {cnList.length} container{cnList.length !== 1 ? 's' : ''}
            </div>
            <div style={{ fontSize:'12px', color:'#8a96a8', marginTop:'2px' }}>
              Read-only view · Contact admin to update status
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
          {cnList.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:'#8a96a8' }}>No container numbers found.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              {cnList.map((cn, idx) => {
                const td     = trackingData[cn] || {}
                const status = td.status || 'in_transit'
                const st     = STATUS_STYLES_MAP[status] || STATUS_STYLES_MAP['in_transit']
                const pct    = statusProgress(status)
                const pColor = progressColor(status, td.freeDays)
                const isDetention = !['delivered', 'empty_returned'].includes(td.status || 'in_transit') && td.freeDays != null && td.freeDays <= 2

                return (
                  <div key={cn} style={{ border:'1.5px solid #e2e6ed', borderRadius:'12px', overflow:'hidden', borderTop:`3px solid ${pColor}` }}>
                    {/* Container header */}
                    <div style={{ padding:'12px 16px', background:'#f8f9fb', borderBottom:'1px solid #e2e6ed', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'14px', fontWeight:700, color:'#1a2233' }}>{cn}</span>
                        <span style={{ borderRadius:'9999px', padding:'2px 10px', fontSize:'11px', fontWeight:700, background: isDetention ? '#fef2f2' : st.bg, color: isDetention ? '#991b1b' : st.color, border:`1px solid ${isDetention ? '#fecaca' : st.border}` }}>
                          {isDetention ? '⚠ Detention Risk' : (td.statusText || 'Not Updated')}
                        </span>
                      </div>
                      <span style={{ fontSize:'11px', color:'#8a96a8' }}>#{idx+1} of {cnList.length}</span>
                    </div>

                    {/* Progress bar */}
                    <div style={{ padding:'10px 16px', borderBottom:'1px solid #e2e6ed' }}>
                      <div style={{ height:'5px', background:'#f4f6f9', borderRadius:'6px', overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:'6px', width:`${pct}%`, background:pColor }} />
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'#8a96a8', marginTop:'3px' }}>
                        <span>Loaded</span>
                        <span style={{ color:pColor, fontWeight:600 }}>{pct}%</span>
                        <span>Discharged</span>
                      </div>
                    </div>

                    {/* Fields grid */}
                    <div style={{ padding:'14px 16px' }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                        {[
                          { label:'Current Location', value: td.currentLocation },
                          { label:'Vessel',           value: td.vessel || job.vessel },
                          { label:'Vessel Arrival',   value: formatD(td.eta || job.eta) },
                          { label:'Port In',          value: td.portIn },
                          { label:'Port Out',         value: td.portOut },
                          { label:'CFS Gate In',      value: td.cfsGateIn },
                          { label:'Free Days Left',   value: td.freeDays != null ? `${td.freeDays} days${(!['delivered','empty_returned'].includes(status) && td.freeDays <= 2) ? ' ⚠' : ''}` : '—',
                            color: (!['delivered','empty_returned'].includes(status) && td.freeDays != null && td.freeDays <= 2) ? '#dc2626' : td.freeDays != null && td.freeDays <= 5 ? '#b45309' : '#1a2233' },
                          { label:'Last Update',      value: formatDT(td.lastUpdate) },
                        ].map(f => (
                          <div key={f.label}>
                            <div style={{ fontSize:'10px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:'#8a96a8', marginBottom:'3px' }}>{f.label}</div>
                            <div style={{ fontSize:'13px', fontWeight:500, color: f.color || (f.value ? '#1a2233' : '#d0d6e0') }}>{f.value || '—'}</div>
                          </div>
                        ))}
                      </div>

                      {td.notes && (
                        <div style={{ marginTop:'12px', padding:'8px 10px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'7px', fontSize:'12px', color:'#92400e' }}>
                          📝 {td.notes}
                        </div>
                      )}

                      {td.milestones?.length > 0 && (
                        <div style={{ marginTop:'12px' }}>
                          <div style={{ fontSize:'10px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:'#8a96a8', marginBottom:'8px' }}>Event History</div>
                          {td.milestones.map((m, i) => (
                            <div key={i} style={{ display:'flex', gap:'10px', alignItems:'flex-start', marginBottom:'6px' }}>
                              <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: i===0 ? '#1a4fa0' : '#d0d6e0', marginTop:'4px', flexShrink:0 }} />
                              <div>
                                <div style={{ fontSize:'12px', fontWeight:600, color:'#1a2233' }}>{m.description}</div>
                                <div style={{ fontSize:'11px', color:'#8a96a8' }}>
                                  {m.location && `${m.location} · `}
                                  {m.date ? new Date(m.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : ''}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Read-only note */}
                      <div style={{ marginTop:'14px', padding:'8px 12px', background:'#f8f9fb', border:'1px solid #e2e6ed', borderRadius:'8px', fontSize:'11px', color:'#8a96a8', textAlign:'center' }}>
                        🔒 Read-only · Only admins can update container status
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
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
  const [sortBy, setSortBy] = useState('number_desc')
  const [showMyJobs, setShowMyJobs] = useState(false)
  const [expandedJobId, setExpandedJobId] = useState(null)
  const [editingJobId, setEditingJobId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [toastState, setToastState] = useState(null)
  const [showCreateJob, setShowCreateJob] = useState(false)
  const [pendingNavAction, setPendingNavAction] = useState(null)
  const [previewModal, setPreviewModal] = useState({ open: false, doc: null })
  // the files are private: the preview uses a 1-hour link made for this user
  const previewUrl = useDocUrl(previewModal.open ? previewModal.doc : null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [expandedDocJobId, setExpandedDocJobId] = useState(null)
  const [extractModal, setExtractModal] = useState({ open: false, job: null })
  const [uploadModal, setUploadModal] = useState({ open: false, job: null })
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadDocType, setUploadDocType] = useState('BL')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [documents, setDocuments] = useState([])
  const [extractedFields, setExtractedFields] = useState(null)
  const [extractEdits, setExtractEdits] = useState(null)
  const [extractError, setExtractError] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState('')
  const [extractFiles, setExtractFiles] = useState([])

  useEffect(() => {
    if (!pendingNavAction || jobs.length === 0) return

    if (pendingNavAction.tab === 'jobs' && pendingNavAction.jobId) {
      const job = jobs.find(j => j.id === pendingNavAction.jobId)
      if (job) {
        setSelectedJob(job)
        setPendingNavAction(null)
      }
    }

    if (pendingNavAction.tab === 'documents' && pendingNavAction.jobNo) {
      const job = jobs.find(j => j.job_no === pendingNavAction.jobNo)
      if (job) {
        setExpandedDocJobId(job.job_no)
        setPendingNavAction(null)
        setTimeout(() => {
          const el = document.getElementById(`doc-job-${job.job_no}`)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 200)
      }
    }

    if (pendingNavAction.tab === 'containers' && pendingNavAction.cn) {
      setPendingNavAction(null)
    }
  }, [pendingNavAction, jobs])

  const isFieldOps = profile?.role === 'field_ops'

  // Field staff (phones) see only what they need on the road; office staff see the customs desk too
  const NAV_SECTIONS = useMemo(() => isFieldOps ? [
    {
      label: 'ON THE ROAD',
      items: [
        { id: 'trucks',     label: 'Trucks',             icon: '🚚' },
        { id: 'containers', label: 'Containers',         icon: '⊟' },
        { id: 'jobs',       label: 'All Jobs',           icon: '≡'  },
      ],
    },
    {
      label: 'TOOLS',
      items: [
        { id: 'search',     label: 'Search anything',    icon: '🔎' },
        { id: 'documents',  label: 'Documents',          icon: '📄' },
      ],
    },
  ] : [
    {
      label: 'TODAY',
      items: [
        { id: 'today',      label: 'Today',              icon: '🏠' },
      ],
    },
    {
      label: 'SHIPMENTS',
      items: [
        { id: 'jobs',       label: 'All Jobs',           icon: '≡'  },
        { id: 'containers', label: 'Containers',         icon: '⊟' },
        { id: 'trucks',     label: 'Trucks',             icon: '🚚' },
      ],
    },
    {
      label: 'CUSTOMS',
      items: [
        { id: 'customs',    label: 'BE & OOC',           icon: '🧾' },
      ],
    },
    {
      label: 'DOCUMENTS',
      items: [
        { id: 'documents',  label: 'Documents',          icon: '📄' },
      ],
    },
    {
      label: 'MORE',
      items: [
        { id: 'detention',  label: 'Detention',          icon: '⏱' },
        { id: 'search',     label: 'Search anything',    icon: '🔎' },
        { id: 'clients',    label: 'Clients',            icon: '👥' },
      ],
    },
  ], [isFieldOps])

  const NAV_ITEMS = useMemo(() => NAV_SECTIONS.flatMap(s => s.items), [NAV_SECTIONS])

  const activeNav = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const t = params.get('tab') || (isFieldOps ? 'trucks' : 'today')
    const id = ({ lookup: 'search', 'shipment-tracker': 'jobs', board: 'jobs' })[t] || t
    const allowed = NAV_SECTIONS.flatMap(s => s.items).map(i => i.id)
    return allowed.includes(id) ? id : (isFieldOps ? 'trucks' : 'today')
  }, [location.search, isFieldOps, NAV_SECTIONS])

  const handleNavClick = (id) => {
    const base = isFieldOps ? '/field' : '/dashboard'
    navigate(`${base}?tab=${id}`, { replace: true })
  }

  const isAkshyani = profile?.name === 'Akshyani'

  const refreshJobs = async () => {
    const { data } = await supabase.from('jobs').select('*').order('updated_at', { ascending: false })
    setJobs(data ?? [])
  }

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

  const canCreateJob = isFieldOps || ['Uphadhya', 'Akshyani'].includes(currentUserName)
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

  const FIELD_PERMS_BY_NAME = {}

  const ALL_EMPLOYEE_FIELDS = ['free_days']

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
      if (showMyJobs && user?.id && j.created_by !== user.id) return false
      return true
    }

    return (jobs || [])
      .filter((j) => matchesQuery(j) && matchesFilters(j))
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
  }, [jobs, search, filterStage, filterPriority, filterMode, sortBy, showMyJobs, user?.id])

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

  const setJobParam = (job) => {
    const params = new URLSearchParams(window.location.search)
    if (job) {
      params.set('jobId', job.id)
    } else {
      params.delete('jobId')
    }
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`)
  }

  const handleJobOpen = (job) => {
    setSelectedJob(job)
    setJobParam(job)
  }

  // Open a job on a given tab (used by Today, Board, Trucks, Customs, Search …).
  // 'truck' goes to the Trucks page, where trucks are assigned. Each open is a
  // new history entry, so the browser's Back button returns to the page you came from.
  const openJob = async (jobId, tab = 'details') => {
    const { data: fresh } = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle()
    if (tab === 'truck') {
      navigate(`${isFieldOps ? '/field' : '/dashboard'}?tab=trucks&q=${encodeURIComponent(fresh?.job_no || '')}`)
      return
    }
    navigate(`${isFieldOps ? '/field' : '/dashboard'}?tab=jobs&jobId=${jobId}#${tab}`)
    if (fresh) {
      setSelectedJob(fresh)
      setJobs(prev => prev.map(j => (j.id === fresh.id ? fresh : j)))
    }
  }
  // Same rule as the job screen: Akshyani (and admins) record BEs
  const canEditBE = profile?.role === 'admin' || currentUserName === 'Akshyani'
  const pageProps = { profile, currentUserName, onOpenJob: openJob, showToast, canUpdateStage, canEditBE }

  const handleCardClick = (e, job) => {
    const tag = e.target?.tagName?.toLowerCase?.() || ''
    if (['input', 'select', 'textarea', 'button'].includes(tag)) return
    setSelectedJob(job)
    setJobParam(job)
  }

  const handleCardKeyDown = (e, job) => {
    const tag = e.target?.tagName?.toLowerCase?.() || ''
    if (['input', 'select', 'textarea', 'button'].includes(tag)) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setSelectedJob(job)
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

  // Types this job already has are not offered again (except Other)
  const jobDocTypes = uploadModal.job ? documents.filter((d) => d.job_id === uploadModal.job.id).map((d) => d.doc_type) : []
  const docTypeOptions = availableTypes(jobDocTypes)
  const docType = docTypeOptions.includes(uploadDocType) ? uploadDocType : docTypeOptions[0]

  const uploadDocument = async () => {
    const job = uploadModal.job
    if (!job || !uploadFile || !docType) return
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
          doc_type: docType,
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
      await supabase.from('activity_log').insert({
        type: 'document_upload',
        action: 'document_upload',
        title: `${job.job_no} — ${docType} uploaded`,
        note: `${uploadFile.name} uploaded by ${profile?.name || 'Unknown'}`,
        job_no: job.job_no,
        job_id: job.id,
        done_by: user.id,
        done_by_name: profile?.name || 'Unknown',
        meta: {
          job_id: job.id,
          job_no: job.job_no,
          file_name: uploadFile.name,
          doc_type: docType,
        },
        created_at: new Date().toISOString(),
      })
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
    setExtractFiles([])
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
    const docs = extractModal.docs || []
    if (!docs.length) { setExtractError('There are no documents to read for this job.'); return }

    setExtracting(true)
    setExtractError(null)
    setExtractedFields(null)
    setExtractEdits(null)
    setExtractFiles([])
    setExtractProgress('Opening documents...')

    try {
      // Read straight from the text inside each PDF, in the browser. Nothing is sent to any outside service.
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      const read = await readJobDocuments(pdfjs, docs, (msg) => setExtractProgress(msg))
      setExtractFiles(read.files)

      const readOk = read.files.filter((f) => !f.notPdf && !f.error)
      if (readOk.length === 0) {
        setExtractError(read.files.every((f) => f.notPdf)
          ? 'Only PDF soft copies can be read. Photos and scanned images (JPG, PNG) cannot be read — please upload the original PDF, or type the details by hand.'
          : `The documents could not be opened: ${read.files.map((f) => `${f.name} (${f.notPdf ? 'not a PDF' : f.error})`).join('; ')}. Please check the files and try again.`)
        return
      }

      const merged = toExtractFields(read.fields, read.sources)
      const nonNullCount = Object.values(merged).filter((f) => f?.value).length
      if (nonNullCount === 0) {
        setExtractError('Nothing could be read from these documents. They may be photos or scanned pages — please type the details by hand.')
        return
      }
      if (nonNullCount < 5) {
        showToast(`Only ${nonNullCount} of ${EXTRACT_FIELDS.length} fields were found. Please check this is the right document and fill in the rest by hand.`, 'error')
      }
      setExtractedFields(merged)
      setExtractEdits(JSON.parse(JSON.stringify(merged)))
    } catch (err) {
      setExtractError(`The documents could not be read: ${err?.message || 'unknown problem'}. Please try again.`)
    } finally {
      setExtracting(false)
      setExtractProgress('')
    }
  }

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
          {NAV_SECTIONS.map((section) => {
            if (false) return null
            return (
              <div key={section.label}>
                <div className="px-4 pt-4 pb-1 text-[10px] font-bold text-white/45 uppercase tracking-[0.1em]">
                  {section.label}
                </div>
                {section.items.map((item) => {
                  const isActive = activeNav === item.id
                  const badge = item.id === 'jobs' ? jobs.length : null
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { handleNavClick(item.id); setSidebarOpen(false) }}
                      className={[
                        'w-full text-left px-5 py-2.5 text-sm flex items-center gap-2.5 border-l-2 transition-colors',
                        isActive
                          ? 'bg-white/15 text-white border-white font-semibold'
                          : 'text-white/70 hover:bg-white/10 hover:text-white border-transparent',
                      ].join(' ')}
                    >
                      <span className="w-4 text-center shrink-0 text-sm opacity-90">{item.icon}</span>
                      <span className="truncate flex-1">{item.label}</span>
                      {badge !== null && badge > 0 && (
                        <span style={{ background:'rgba(255,255,255,0.2)', color:'white', borderRadius:'9999px', fontSize:'11px', fontWeight:700, padding:'1px 7px', minWidth:'20px', textAlign:'center', flexShrink:0 }}>
                          {badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>
        <div className="mt-auto border-t border-white/15 px-5 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-white/20 border-2 border-white/30 text-white flex items-center justify-center text-xs font-bold">
            {(profile?.name || 'E').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{profile?.name || 'Employee'}</div>
            <div className="text-xs text-white/55 truncate">Employee</div>
          </div>
          <span className="ml-auto w-2 h-2 rounded-full bg-green-400" title="Live" />
        </div>
      </aside>

      <div className="bg-[#f4f6f9] flex-1 flex flex-col min-w-0 overflow-hidden lg:ml-[230px]">
        <header className="h-[60px] bg-white border-b border-[#e2e6ed] shadow-sm px-4 sm:px-6 flex items-center gap-3 flex-shrink-0">

          <button type="button" onClick={() => setSidebarOpen(true)}
            className="lg:hidden flex flex-col justify-center items-center w-9 h-9 rounded-lg hover:bg-[#f4f6f9] gap-1.5 shrink-0"
            aria-label="Open menu">
            <span className="w-5 h-0.5 bg-[#1a2233] rounded-full" />
            <span className="w-5 h-0.5 bg-[#1a2233] rounded-full" />
            <span className="w-3.5 h-0.5 bg-[#1a2233] rounded-full" />
          </button>

          <div className="min-w-0">
            <div className="text-[17px] font-bold text-[#1a2233] truncate">
              {activeNav === 'documents' ? 'Documents'
               : activeNav === 'containers' ? 'Container Tracking'
               : activeNav === 'shipment-tracker' ? 'Shipment Tracker'
               : activeNav === 'search' ? 'Search anything'
               : activeNav === 'today' ? 'Today'
               : activeNav === 'trucks' ? 'Trucks'
               : activeNav === 'customs' ? 'BE & OOC'
               : activeNav === 'clients' ? 'Clients'
               : activeNav === 'detention' ? 'Detention'
              : 'All Jobs'}
            </div>
            {activeNav === 'jobs' && (
              <div className="text-sm text-[#8a96a8] truncate">
                {getGreeting()}, {profile?.name || 'there'}
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell
              onNavigate={action => {
                // pages the staff screen does not have open the job instead
                const tab = ['vessels', 'health'].includes(action.tab) ? 'jobs' : action.tab
                setPendingNavAction({ ...action, tab })
                handleNavClick(tab)
              }}
              profile={profile}
            />
            {canCreateJob && (
              <button
                type="button"
                onClick={() => setShowCreateJob(true)}
                className="h-9 px-3 sm:px-4 text-sm rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold"
              >
                <span className="hidden sm:inline">+ Create Job</span>
                <span className="sm:hidden">+</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="h-9 px-3 sm:px-4 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-red-600 hover:bg-[#fef2f2] hover:border-red-300 font-semibold"
            >
              <span className="hidden sm:inline">Logout</span>
              <span className="sm:hidden">⏻</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeNav === 'jobs' && (
            <>
              {selectedJob ? (
                <JobDetailView
                  job={selectedJob}
                  onBack={() => { setSelectedJob(null); setJobParam(null) }}
                  profile={profile}
                  profiles={profiles}
                  currentUserName={currentUserName}
                  showToast={showToast}
                  isAdmin={profile?.role === 'admin'}
                  canUpdateStage={canUpdateStage}
                  onJobUpdated={async () => {
                    const { data } = await supabase
                      .from('jobs')
                      .select('*')
                      .eq('id', selectedJob.id)
                      .single()
                    if (data) setSelectedJob(data)
                    await refreshJobs()
                  }}
                />
              ) : (
                <>
              <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm mb-4">
                <div className="px-5 py-3 bg-[#f8f9fb] border-b border-[#e2e6ed] flex items-center justify-between">
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
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="h-9 px-3 text-sm bg-white border-[1.5px] border-[#e2e6ed] rounded-lg text-[#4a5568] outline-none focus:border-[#1a4fa0]"
                  >
                    <option value="number_desc">Job No ↓</option>
                    <option value="number_asc">Job No ↑</option>
                    <option value="updated">Recently Updated</option>
                    <option value="latest">Latest Added</option>
                    <option value="eta">ETA Soonest</option>
                    <option value="stage_asc">Stage ↑ (needs attention)</option>
                    <option value="stage_desc">Stage ↓ (nearly done)</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('')
                      setFilterStage('')
                      setFilterPriority('')
                      setFilterMode('')
                      setSortBy('number_desc')
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
                  <div className="h-9 w-9 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
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
                        onClick={(e) => handleCardClick(e, job)}
                        onKeyDown={(e) => handleCardKeyDown(e, job)}
                        className={classNames(
                          'bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-4 mb-3 cursor-pointer transition-all',
                          'hover:border-[#d0d6e0] hover:shadow-md hover:bg-[#fafbfc]',
                          'border-l-[4px]',
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
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
            )}
          </>
          )}

          {activeNav === 'documents' && (
            <div>
              <div className="text-lg font-bold text-[#1a2233] mb-4">Documents</div>
              {loadingDocs ? (
                <div className="bg-white border border-[#e2e6ed] rounded-xl shadow-sm p-10 flex justify-center">
                  <div className="h-9 w-9 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
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
                      <div key={jobNo} id={`doc-job-${jobNo}`} className="border-b border-[#e2e6ed] last:border-b-0">
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
                              <table className="w-full text-xs" style={{ minWidth:'500px' }}>
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
                                        <button type="button" onClick={() => downloadDoc(doc).catch((e) => alert(`Could not download: ${e.message}`))}
                                          className="h-7 px-2.5 text-xs rounded-md bg-white text-[#4a5568] border border-[#e2e6ed] hover:bg-[#e8eef8] font-semibold inline-flex items-center no-underline">
                                          Download
                                        </button>
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

          {activeNav === 'containers' && (
            <ContainerTrackingSection
              jobs={jobs}
              showToast={showToast}
              profile={profile}
              currentUserName={currentUserName}
              pendingNavAction={activeNav === 'containers' ? pendingNavAction : null}
              onNavActionConsumed={() => setPendingNavAction(null)}
            />
          )}

          {activeNav === 'shipment-tracker' && (
            <ShipmentTracker
              jobs={jobs}
              profiles={profiles}
              currentUserName={currentUserName}
              showToast={showToast}
            />
          )}
          {activeNav === 'today' && <TodayPage {...pageProps} />}
          {activeNav === 'trucks' && <TrucksPage {...pageProps} />}
          {activeNav === 'customs' && <CustomsDeskPage {...pageProps} />}
          {activeNav === 'search' && <SearchPage {...pageProps} />}
          {activeNav === 'clients' && <ClientsPage {...pageProps} />}
          {activeNav === 'detention' && <DetentionPage {...pageProps} />}
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
                <PdfPreview doc={previewModal.doc} />
              ) : ['jpg', 'jpeg', 'png'].includes((previewModal.doc.file_type || '').toLowerCase()) ? (
                !previewUrl ? <p className="text-sm text-[#8a96a8]">Opening…</p> : <img src={previewUrl} alt={previewModal.doc.file_name} className="max-w-full max-h-[600px] rounded-lg shadow-sm object-contain" />
              ) : (
                <div className="text-center text-[#8a96a8]">
                  <p className="text-sm font-semibold">Preview not available</p>
                  <p className="text-xs mt-1">This file type cannot be previewed.</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-[#e2e6ed] flex items-center justify-end gap-2 shrink-0">
              <button type="button" onClick={() => downloadDoc(previewModal.doc).catch((e) => alert(`Could not download: ${e.message}`))}
                className="h-9 px-4 text-sm rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] font-semibold no-underline inline-flex items-center">
                Download
              </button>
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
                <div className="text-sm font-bold text-[#1a2233]">Read from the Documents &mdash; {extractModal.job.job_no}</div>
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
                    {extracting ? 'Reading...' : 'Read Documents'}
                  </button>
                  <p className="text-xs text-[#8a96a8] mt-2">Only PDF soft copies can be read. Photos and scanned pages must be typed by hand.</p>
                </div>
              )}

              {extracting && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="h-10 w-10 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-sm font-semibold text-[#4a5568]">{extractProgress || 'Reading the documents...'}</p>
                  <p className="text-sm text-[#8a96a8]">This usually takes a few seconds</p>
                </div>
              )}

              {extractError && !extracting && (
                <div className="flex flex-col items-center py-10">
                  <p className="text-sm text-red-600 font-semibold mb-3">{extractError}</p>
                  <button type="button" onClick={runExtraction}
                    className="h-9 px-4 text-sm rounded-lg bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold">
                    Try Again
                  </button>
                </div>
              )}

              {!extracting && extractFiles.length > 0 && (
                <div className="space-y-1.5">
                  {extractFiles.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="text-xs px-3 py-2 bg-[#f8f9fb] rounded-lg border border-[#e2e6ed]">
                      <span className="font-semibold text-[#1a2233]">📄 {f.name}</span>
                      {f.notPdf ? (
                        <span className="text-amber-700"> &mdash; not a PDF soft copy, so it could not be read. Please type these details by hand.</span>
                      ) : f.error ? (
                        <span className="text-red-600"> &mdash; could not be opened ({f.error}).</span>
                      ) : (
                        <>
                          <span className="text-[#4a5568]"> &mdash; {f.found ? `found: ${f.found}` : 'no shipping documents recognised'}</span>
                          {f.unreadable?.length > 0 && <span className="block text-amber-700 mt-0.5">{unreadableMessage(f.unreadable)}</span>}
                        </>
                      )}
                    </div>
                  ))}
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
                <button type="button" onClick={() => { setExtractedFields(null); setExtractEdits(null); setExtractError(null); setExtractFiles([]); }}
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
                <select value={docType} onChange={(e) => setUploadDocType(e.target.value)}
                  className="w-full h-9 px-3 text-sm rounded-lg border border-[#e2e6ed] bg-[#f8f9fb] text-[#1a2233] outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300">
                  {docTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
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
              <button type="button" disabled={!uploadFile || !docType || uploading} onClick={uploadDocument}
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
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
