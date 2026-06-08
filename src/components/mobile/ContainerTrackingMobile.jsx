import { useState } from 'react'

export default function ContainerTrackingMobile({
  sortedJobCards,
  trackingData,
  searchQuery,
  setSearchQuery,
  filterLine,
  setFilterLine,
  filterStatus,
  setFilterStatus,
  carriers,
  STATUS_OPTIONS,
  expandedContainers,
  setExpandedContainers,
  setDetailJob,
  handleOpenUpdate,
  openCarrierTracking,
  activeContainer,
  setActiveContainer,
  statusProgress,
  getProgressColor,
  STATUS_STYLES_MAP,
  kpis,
  showToast,
  refreshAll,
  handleLDBRefresh,
}) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

      {/* ── SEARCH BAR ── */}
      <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'white', border:'1.5px solid #e2e6ed', borderRadius:'10px', padding:'0 14px', height:'46px' }}>
        <span style={{ fontSize:'16px', color:'#8a96a8' }}>🔍</span>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search job, client, container..."
          style={{ border:'none', outline:'none', background:'transparent', fontSize:'16px', color:'#1a2233', width:'100%' }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#8a96a8', fontSize:'18px', padding:'4px', lineHeight:1 }}>✕</button>
        )}
      </div>

      {/* ── FILTERS ROW ── */}
      <div style={{ display:'flex', gap:'6px', overflowX:'auto', scrollbarWidth:'none', paddingBottom:'2px' }}>
        {[
          { label:'All',        value:'' },
          { label:'In Transit', value:'in_transit' },
          { label:'At CFS',     value:'at_cfs' },
          { label:'Arrived',    value:'arrived' },
        ].map(p => (
          <button
            key={p.value}
            onClick={() => setFilterStatus(p.value)}
            style={{
              padding:'6px 14px', borderRadius:'9999px', fontSize:'13px', fontWeight:500, cursor:'pointer', flexShrink:0, whiteSpace:'nowrap',
              border: filterStatus === p.value ? '1.5px solid #185FA5' : '1.5px solid var(--color-border-tertiary)',
              background: filterStatus === p.value ? '#185FA5' : 'var(--color-background-primary)',
              color: filterStatus === p.value ? 'white' : 'var(--color-text-secondary)',
            }}
          >{p.label}</button>
        ))}
        <button
          onClick={refreshAll}
          style={{ height:'40px', width:'44px', background:'#1a4fa0', border:'none', borderRadius:'8px', color:'white', fontSize:'16px', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}
          title="Refresh all"
        >↻</button>
      </div>

      {/* ── COUNT ── */}
      <div style={{ fontSize:'12px', color:'#8a96a8' }}>
        {sortedJobCards.length} job{sortedJobCards.length !== 1 ? 's' : ''} · {kpis.total} container{kpis.total !== 1 ? 's' : ''}
      </div>

      {/* ── EMPTY STATE ── */}
      {sortedJobCards.length === 0 && (
        <div style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', padding:'40px 20px', textAlign:'center' }}>
          <div style={{ fontSize:'28px', marginBottom:'10px' }}>⊟</div>
          <p style={{ fontSize:'14px', fontWeight:500, color:'#1a2233' }}>
            {searchQuery || filterLine || filterStatus ? 'No jobs match your filters.' : 'No jobs with containers yet.'}
          </p>
        </div>
      )}

      {/* ── JOB CARDS ── */}
      {sortedJobCards.map(({ job, cnList }) => {
        const statuses     = cnList.map(cn => trackingData[cn]?.status || 'in_transit')
        const hasDetention = cnList.some(cn => (trackingData[cn]?.freeDays ?? 99) <= 2)
        const allDelivered = statuses.every(s => s === 'delivered')
        const anyDelayed   = statuses.includes('delayed') || statuses.includes('customs_hold')
        const isExpanded   = !!expandedContainers[`job_${job.id}`]

        const jobBadge = hasDetention
          ? { text:'⚠ Detention', bg:'#FCEBEB', color:'#991b1b', border:'#fecaca' }
          : allDelivered
          ? { text:'Delivered',   bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' }
          : anyDelayed
          ? { text:'Delayed',     bg:'#fef2f2', color:'#991b1b', border:'#fecaca' }
          : statuses.includes('at_cfs') || statuses.includes('arrived')
          ? { text:'At CFS',      bg:'#f0fdfa', color:'#0f766e', border:'#99f6e4' }
          : { text:'In Transit',  bg:'#fffbeb', color:'#92400e', border:'#fde68a' }

        const stripeColor = hasDetention ? '#dc2626'
          : allDelivered ? '#16a34a'
          : anyDelayed ? '#dc2626'
          : statuses.includes('at_cfs') || statuses.includes('arrived') ? '#16a34a'
          : '#f59e0b'

        const etaText = job.eta
          ? new Date(job.eta).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })
          : '—'
        const etaColor = !job.eta ? '#8a96a8'
          : Math.ceil((new Date(job.eta) - new Date()) / 86400000) < 0 ? '#dc2626'
          : Math.ceil((new Date(job.eta) - new Date()) / 86400000) <= 3 ? '#b45309'
          : '#1a2233'

        return (
          <div key={job.id} style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'14px', overflow:'hidden', position:'relative', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>

            {/* Top stripe */}
            <div style={{ position:'absolute', top:0, left:0, right:0, height:'4px', background: hasDetention ? '#E24B4A' : allDelivered ? '#1D9E75' : anyDelayed ? '#E24B4A' : statuses.includes('at_cfs') || statuses.includes('arrived') ? '#0F6E56' : '#EF9F27' }} />

            {/* Job header */}
            <div
              onClick={() => setExpandedContainers(prev => ({ ...prev, [`job_${job.id}`]: !prev[`job_${job.id}`] }))}
              style={{ padding:'16px 16px 12px', cursor:'pointer', userSelect:'none' }}
            >
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px' }}>
                <div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'16px', fontWeight:700, color:'#1a4fa0', letterSpacing:'0.02em' }}>{job.job_no}</div>
                  <div style={{ fontSize:'14px', fontWeight:600, color:'#1a2233', marginTop:'3px' }}>{job.client}</div>
                  <div style={{ fontSize:'12px', color:'#8a96a8', marginTop:'2px' }}>
                    {job.shipping_line || '—'}{job.mode ? ` · ${job.mode}` : ''}
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'8px' }}>
                  <span style={{ display:'inline-flex', alignItems:'center', padding:'4px 12px', borderRadius:'9999px', fontSize:'12px', fontWeight:600, border:`1px solid ${jobBadge.border}`, background:jobBadge.bg, color:jobBadge.color }}>
                    {jobBadge.text}
                  </span>
                  <span style={{ fontSize:'12px', color:'#8a96a8' }}>
                    {cnList.length} container{cnList.length !== 1 ? 's' : ''} {isExpanded ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {/* ETA + Details */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:'10px', borderTop:'1px solid #f4f6f9' }}>
                <div>
                  <div style={{ fontSize:'10px', color:'#8a96a8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'2px' }}>ETA JNPT</div>
                  <div style={{ fontSize:'14px', fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color:etaColor }}>{etaText}</div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setDetailJob(job) }}
                  style={{ padding:'8px 16px', background:'#f0f4fb', border:'1.5px solid #bfdbfe', borderRadius:'10px', fontSize:'13px', fontWeight:600, color:'#1a4fa0', cursor:'pointer' }}
                >
                  View Details →
                </button>
              </div>
            </div>

            {/* Expanded containers */}
            {isExpanded && (
              <div style={{ borderTop:'1.5px solid #e2e6ed' }}>
                {cnList.map((cn, cnIdx) => {
                  const td     = trackingData[cn] || {}
                  const status = td.status || 'in_transit'
                  const st     = STATUS_STYLES_MAP[status] || STATUS_STYLES_MAP['in_transit']
                  const pct    = statusProgress(status)
                  const pColor = getProgressColor(status, td.freeDays)
                  const isDetention = td.freeDays != null && td.freeDays <= 2
                  const isLastCn    = cnIdx === cnList.length - 1

                  return (
                    <div
                      key={cn}
                      onClick={() => {
                        const key = `${job.id}-${cn}`
                        setActiveContainer(prev =>
                          prev?.jobId === job.id && prev?.cn === cn ? null : { jobId: job.id, cn }
                        )
                        setDetailJob(job)
                      }}
                      style={{
                        padding:'14px 16px',
                        borderBottom: isLastCn ? 'none' : '1px solid #f0f2f5',
                        background: activeContainer?.cn === cn && activeContainer?.jobId === job.id
                          ? '#f0f4fb' : '#fafbfc',
                        cursor:'pointer',
                        transition:'background 0.15s',
                      }}
                    >

                      {/* Container # + status */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'14px', fontWeight:700, color:'#1a2233' }}>{cn}</span>
                        <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:'9999px', fontSize:'12px', fontWeight:600, background: isDetention ? '#fef2f2' : st.bg, color: isDetention ? '#991b1b' : st.color, border:`1px solid ${isDetention ? '#fecaca' : st.border}` }}>
                          {isDetention ? '⚠ Detention' : (td.statusText || 'Not Updated')}
                        </span>
                      </div>

                      {/* Traffic light + free days */}
                      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px', padding:'8px 10px', borderRadius:'8px', background: isDetention ? '#FCEBEB' : td.freeDays != null && td.freeDays <= 7 ? '#FAEEDA' : '#EAF3DE', border:`0.5px solid ${isDetention ? '#F7C1C1' : td.freeDays != null && td.freeDays <= 7 ? '#FAC775' : '#C0DD97'}` }}>
                        <div style={{ width:'10px', height:'10px', borderRadius:'50%', flexShrink:0, background: isDetention ? '#E24B4A' : td.freeDays != null && td.freeDays <= 7 ? '#EF9F27' : '#1D9E75' }} />
                        <span style={{ fontSize:'13px', fontWeight:500, color: isDetention ? '#A32D2D' : td.freeDays != null && td.freeDays <= 7 ? '#854F0B' : '#27500A' }}>
                          {td.freeDays != null ? `${td.freeDays} free days remaining` : 'Free days not set'}
                        </span>
                        {td.currentLocation && (
                          <span style={{ fontSize:'11px', color:'var(--color-text-secondary)', marginLeft:'auto', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'120px' }}>
                            {td.currentLocation.split('/').pop()?.trim() || td.currentLocation}
                          </span>
                        )}
                      </div>

                      {/* Fields 2-col grid */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
                        {[
                          { label:'Location',    value: td.currentLocation },
                          { label:'Vessel',      value: td.vessel || job.vessel },
                          { label:'ETA',         value: (td.eta || job.eta) ? new Date(td.eta || job.eta).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : null },
                          { label:'Free Days',   value: td.freeDays != null ? `${td.freeDays} days` : null, color: td.freeDays != null && td.freeDays <= 2 ? '#dc2626' : td.freeDays != null && td.freeDays <= 5 ? '#b45309' : '#1a2233' },
                          { label:'Port In',     value: td.portIn },
                          { label:'Port Out',    value: td.portOut },
                          { label:'CFS Gate In', value: td.cfsGateIn },
                          { label:'Last Update', value: td.lastUpdate ? new Date(td.lastUpdate).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : null },
                        ].map(f => (
                          <div key={f.label}>
                            <div style={{ fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#8a96a8', marginBottom:'3px' }}>{f.label}</div>
                            <div style={{ fontSize:'13px', fontWeight:500, color: f.color || (f.value ? '#1a2233' : '#d0d6e0') }}>{f.value || '—'}</div>
                          </div>
                        ))}
                      </div>

                      {/* Notes */}
                      {td.notes && (
                        <div style={{ marginBottom:'12px', padding:'8px 10px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'8px', fontSize:'12px', color:'#92400e' }}>
                          📝 {td.notes}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display:'flex', gap:'8px' }}>
                        <button
                          onClick={async e => {
                            e.stopPropagation()
                            setActiveContainer({ jobId: job.id, cn })
                            setDetailJob(job)
                            await handleLDBRefresh(job, cn)
                          }}
                          style={{ width:'48px', height:'48px', background:'#f0f4fb', border:'1.5px solid #bfdbfe', color:'#1a4fa0', borderRadius:'10px', fontSize:'20px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                          title="Refresh"
                        >
                          ↻
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); openCarrierTracking(cn, job.shipping_line, showToast) }}
                          style={{ width:'48px', height:'48px', background:'#f8f9fb', border:'1.5px solid #e2e6ed', color:'#4a5568', borderRadius:'10px', fontSize:'20px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                          title="Open carrier tracking"
                        >
                          🌐
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
