import { memo, useState, useRef, useEffect } from 'react'

function normalizeTrackingData(td) {
  if (!td || typeof td !== 'object') return {}
  const freeDaysRaw = Number(td.freeDays)
  return {
    ...td,
    status: typeof td.status === 'string' ? td.status : 'in_transit',
    freeDays: Number.isFinite(freeDaysRaw) ? freeDaysRaw : null,
    currentLocation: typeof td.currentLocation === 'string' ? td.currentLocation : '',
    portIn: td.portIn && !isNaN(new Date(td.portIn).getTime()) ? td.portIn : null,
    portOut: td.portOut && !isNaN(new Date(td.portOut).getTime()) ? td.portOut : null,
    eta: td.eta && !isNaN(new Date(td.eta).getTime()) ? td.eta : null,
  }
}

const ExpandedContainerRows = memo(function ExpandedContainerRows({
  job, cnList, trackingData, activeContainer, STATUS_STYLES_MAP,
  statusProgress, getProgressColor, setActiveContainer, setDetailJob,
  handleChipClick, handleLDBRefresh, openCarrierTracking, showToast, isClosing,
}) {
  return (
    <div style={{
      display: 'grid',
      willChange: 'grid-template-rows, opacity',
      animation: isClosing
        ? 'collapseUp 0.3s cubic-bezier(0.4,0,0.2,1) forwards'
        : 'expandDown 0.25s cubic-bezier(0.16,1,0.3,1) forwards',
    }}>
    <div style={{ overflow:'hidden' }}>
    <div
      key={`expanded-${job.id}`}
      style={{
        borderTop:'2px solid var(--color-background-secondary)',
        background:'#f0f4fb',
      }}
    >
      <div style={{ display:'grid', gridTemplateColumns:'40px 180px 130px 1fr 120px 80px', gap:'10px', alignItems:'center', padding:'5px 16px 5px 42px', borderBottom:'0.5px solid #dde3ef', background:'#e8eef8' }}>
        {['#', 'Container', 'Status', 'Progress', 'Location', ''].map((h, i) => (
          <div key={i} style={{ fontSize:'9px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--color-text-secondary)' }}>{h}</div>
        ))}
      </div>
      {cnList.map((cn, cnIdx) => {
        const td          = normalizeTrackingData(trackingData[cn] || {})
        const status      = td.status || 'in_transit'
        const st          = STATUS_STYLES_MAP[status] || STATUS_STYLES_MAP['in_transit']
        const isDetention = td.freeDays != null && td.freeDays <= 2
        const isLastCn    = cnIdx === cnList.length - 1
        const isActive    = activeContainer?.cn === cn && activeContainer?.jobId === job.id

        return (
          <div
            key={`${cn}-${cnIdx}`}
            onClick={() => {
              if (activeContainer?.jobId === job.id && activeContainer?.cn === cn) {
                handleChipClick(job.id, cn, job)
              } else {
                setActiveContainer({ jobId: job.id, cn })
                setDetailJob(job)
              }
            }}
            style={{
              display:'grid', gridTemplateColumns:'40px 180px 130px 1fr 120px 80px',
              gap:'10px', alignItems:'center', padding:'9px 16px 9px 42px',
              borderBottom: isLastCn ? 'none' : '0.5px solid #dde3ef',
              borderLeft: `3px solid ${isActive ? '#185FA5' : 'transparent'}`,
              background: isActive ? '#E6F1FB' : 'white',
              cursor:'pointer', transition:'background 0.15s, border-left-color 0.15s',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.background = '#EEF4FC'
                e.currentTarget.style.borderLeftColor = '#7ab3e0'
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.background = 'white'
                e.currentTarget.style.borderLeftColor = 'transparent'
              }
            }}
          >
            <span style={{ fontSize:'11px', color:'var(--color-text-secondary)' }}>#{cnIdx+1}</span>
            <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'12px', fontWeight:500, color:'var(--color-text-primary)' }}>{cn}</span>
              <span style={{ fontSize:'10px', color:'#185FA5', opacity:0.7 }}>View details →</span>
            </div>
            <div style={{ display:'flex', alignItems:'center' }}>
              <span style={{ display:'inline-flex', alignItems:'center', padding:'0px 7px', borderRadius:'9999px', fontSize:'10px', fontWeight:500, border:`0.5px solid ${isDetention ? '#F7C1C1' : st.border}`, background: isDetention ? '#FCEBEB' : st.bg, color: isDetention ? '#791F1F' : st.color, whiteSpace:'nowrap', height:'20px', flexShrink:0 }}>
                {isDetention ? '⚠ Detention' : (td.statusText || 'Not Updated')}
              </span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                <span style={{ width:'8px', height:'8px', borderRadius:'50%', flexShrink:0, background: isDetention ? '#E24B4A' : td.freeDays != null && td.freeDays <= 7 ? '#EF9F27' : '#1D9E75' }} />
                <span style={{ fontSize:'11px', fontWeight:500, color: isDetention ? '#A32D2D' : td.freeDays != null && td.freeDays <= 7 ? '#854F0B' : '#27500A' }}>
                  {td.freeDays != null ? isDetention ? `⚠ ${td.freeDays}d free left` : `${td.freeDays}d free` : 'Free days —'}
                </span>
              </div>
              <div style={{ fontSize:'10px', color:'var(--color-text-secondary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {td.currentLocation ? `${td.currentLocation.split('/').pop()?.trim() || td.currentLocation}` : '—'}
                {(() => {
  if (!td.portIn) return null
  const days = Math.floor((Date.now() - new Date(td.portIn).getTime()) / 86400000)
  return Number.isFinite(days) && days >= 0 ? ` · ${days}d at port` : null
})()}
              </div>
            </div>
            <span style={{ fontSize:'11px', color:'var(--color-text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{td.currentLocation || '—'}</span>
            <div style={{ display:'flex', gap:'4px' }}>
              <button
                onClick={async e => { e.stopPropagation(); setActiveContainer({ jobId: job.id, cn }); setDetailJob(job); await handleLDBRefresh(job, cn) }}
                style={{ width:'28px', height:'28px', borderRadius:'6px', border:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-primary)', color:'var(--color-text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px' }}
                onMouseEnter={e => { e.currentTarget.style.background='#185FA5'; e.currentTarget.style.color='white'; e.currentTarget.style.borderColor='#185FA5' }}
                onMouseLeave={e => { e.currentTarget.style.background='var(--color-background-primary)'; e.currentTarget.style.color='var(--color-text-secondary)'; e.currentTarget.style.borderColor='var(--color-border-tertiary)' }}
                title="Refresh"
                aria-label="Refresh container tracking"
              >↻</button>
              <button
                onClick={e => { e.stopPropagation(); openCarrierTracking(cn, job.shipping_line, showToast) }}
                style={{ width:'28px', height:'28px', borderRadius:'6px', border:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-primary)', color:'var(--color-text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px' }}
                onMouseEnter={e => { e.currentTarget.style.background='#0F6E56'; e.currentTarget.style.color='white'; e.currentTarget.style.borderColor='#0F6E56' }}
                onMouseLeave={e => { e.currentTarget.style.background='var(--color-background-primary)'; e.currentTarget.style.color='var(--color-text-secondary)'; e.currentTarget.style.borderColor='var(--color-border-tertiary)' }}
                title="Carrier site"
                aria-label="Open carrier tracking site"
              >🌐</button>
            </div>
          </div>
        )
      })}
    </div>
    </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Only re-render if closing state changes, tracking data changes, or active container changes
  // BUT don't re-render if activeContainer changes to a different job — avoids animation restart
  if (prevProps.isClosing !== nextProps.isClosing) return false
  if (prevProps.trackingData !== nextProps.trackingData) return false
  if (prevProps.cnList !== nextProps.cnList) return false

  // Active container changed — only re-render if it affects THIS job's rows
  const prevJobActive = prevProps.activeContainer?.jobId === prevProps.job.id
  const nextJobActive = nextProps.activeContainer?.jobId === nextProps.job.id
  const prevCn = prevJobActive ? prevProps.activeContainer?.cn : null
  const nextCn = nextJobActive ? nextProps.activeContainer?.cn : null
  if (prevCn !== nextCn) return false // need re-render to update chip highlight

  return true // skip re-render
})

export default function ContainerTrackingDesktop({
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
  handleChipClick,
}) {
  const [closingJobs, setClosingJobs] = useState({})
  const [refreshingAll, setRefreshingAll] = useState(false)
  const timeoutRefs = useRef({})
  useEffect(() => {
    const refs = timeoutRefs.current
    return () => {
      Object.values(refs).forEach(t => clearTimeout(t))
    }
  }, [])
  return (
  <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
    <style>{`
      @keyframes expandDown {
        from { grid-template-rows: 0fr; opacity: 0; }
        to   { grid-template-rows: 1fr; opacity: 1; }
      }
      @keyframes collapseUp {
        from { grid-template-rows: 1fr; opacity: 1; }
        to   { grid-template-rows: 0fr; opacity: 0; }
      }
    `}</style>

      {/* KPI Strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'8px' }}>
        {[
          { label:'Total containers', value: kpis.total,    bg:'#E6F1FB', valColor:'#0C447C', sub:'across all jobs', border:'0.5px solid #B5D4F4' },
          { label:'In transit',       value: kpis.inTransit,        bg:'#FAEEDA',                         valColor:'#633806',                    sub:'on the water',     border:'0.5px solid #FAC775' },
          { label:'At CFS / arrived', value: kpis.atCFS,            bg:'#EAF3DE',                         valColor:'#27500A',                    sub:'at destination',   border:'0.5px solid #C0DD97' },
          { label:'Detention risk',   value: kpis.detained, bg: kpis.detained > 0 ? '#FCEBEB' : '#FFF5F5', valColor: kpis.detained > 0 ? '#A32D2D' : '#E24B4A', sub: kpis.detained > 0 ? 'act immediately' : 'none', border: kpis.detained > 0 ? '0.5px solid #F7C1C1' : '0.5px solid #F09595' },
          { label:'ETA this week',    value: kpis.arrivingThisWeek, bg:'#E6F1FB',                         valColor:'#0C447C',                    sub:'arriving soon',    border:'0.5px solid #B5D4F4' },
        ].map(k => (
          <div key={k.label} style={{ background:k.bg, border:k.border, borderRadius:'10px', padding:'12px 14px' }}>
            <div style={{ fontSize:'10px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:k.valColor, opacity:0.75, marginBottom:'4px' }}>{k.label}</div>
            <div style={{ fontSize:'26px', fontWeight:500, color:k.valColor, lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:'11px', color:k.valColor, opacity:0.65, marginTop:'3px' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'var(--color-background-primary)', border:'0.5px solid var(--color-border-tertiary)', borderRadius:'8px', padding:'0 12px', height:'36px', flex:'1', maxWidth:'360px' }}>
          <span style={{ fontSize:'14px', color:'var(--color-text-secondary)' }}>🔍</span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search job, client, container, BL..."
            style={{ border:'none', outline:'none', background:'transparent', fontSize:'13px', color:'var(--color-text-primary)', width:'100%', fontFamily:'inherit' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-secondary)', fontSize:'13px', lineHeight:1 }}>✕</button>
          )}
        </div>

        {/* Status pills */}
        <div style={{ display:'flex', gap:'5px', alignItems:'center' }}>
          {[
            { label:'All',        value:'' },
            { label:'In Transit', value:'in_transit' },
            { label:'At CFS',     value:'at_cfs' },
            { label:'Arrived',    value:'arrived' },
            { label:'Detention Risk',   value:'detained' },
          ].map(p => (
            <button
              key={p.value}
              onClick={() => setFilterStatus(p.value)}
              style={{
                padding:'5px 12px', borderRadius:'9999px', fontSize:'12px', fontWeight:500, cursor:'pointer',
                border: filterStatus === p.value ? '0.5px solid #185FA5' : '0.5px solid var(--color-border-tertiary)',
                background: filterStatus === p.value ? '#185FA5' : 'var(--color-background-primary)',
                color: filterStatus === p.value ? 'white' : 'var(--color-text-secondary)',
              }}
            >{p.label}</button>
          ))}
        </div>

        <button
          onClick={async () => {
            setRefreshingAll(true)
            try { await refreshAll() }
            finally { setRefreshingAll(false) }
          }}
          disabled={refreshingAll}
          style={{ marginLeft:'auto', height:'36px', padding:'0 16px', background:'#185FA5', border:'none', borderRadius:'8px', color:'white', fontSize:'13px', fontWeight:500, cursor: refreshingAll ? 'default' : 'pointer', display:'flex', alignItems:'center', gap:'6px', opacity: refreshingAll ? 0.8 : 1 }}
        >
          <span style={{ display:'inline-block', animation: refreshingAll ? 'spin 0.7s linear infinite' : 'none' }}>↻</span>
          {refreshingAll ? 'Refreshing...' : 'Refresh all'}
        </button>

        <span style={{ fontSize:'12px', color:'var(--color-text-secondary)' }}>
          {sortedJobCards.length} job{sortedJobCards.length !== 1 ? 's' : ''} · {kpis.total} container{kpis.total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Empty state */}
      {sortedJobCards.length === 0 ? (
        <div style={{ background:'var(--color-background-primary)', border:'0.5px solid var(--color-border-tertiary)', borderRadius:'12px', padding:'48px 24px', textAlign:'center' }}>
          <div style={{ fontSize:'32px', color:'var(--color-text-secondary)', marginBottom:'12px' }}>⊟</div>
          <p style={{ fontSize:'14px', fontWeight:500, color:'var(--color-text-primary)' }}>
            {filterStatus === 'detained' ? 'No containers at detention risk.' :
            (searchQuery || filterLine || filterStatus) ? 'No jobs match your filters.' :
            'No jobs with containers yet.'}
          </p>
          {!filterStatus && (
            <p style={{ fontSize:'12px', color:'var(--color-text-secondary)', marginTop:'6px' }}>
              Go to All Jobs → open a job → Edit → add container numbers.
            </p>
          )}
        </div>
      ) : (
        <div data-area="job-cards" style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
          <div style={{ background:'var(--color-background-primary)', border:'1.5px solid #d0d9e8', borderRadius:'12px', overflow:'hidden', minWidth:'700px', willChange:'transform' }}>

            {/* Column headers */}
            <div style={{ display:'grid', gridTemplateColumns:'32px 80px 110px 460px 1fr 130px 60px', gap:'20px', alignItems:'center', padding:'8px 16px', background:'#e8eef8', borderBottom:'0.5px solid var(--color-border-tertiary)' }}>
              {['', 'Job', 'Client', 'Containers', 'Overview', 'Shipping line', 'ETA'].map((h, i) => (
                <div key={i} style={{ fontSize:'10px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--color-text-secondary)', textAlign: i === 5 ? 'center' : 'left' }}>{h}</div>
              ))}
            </div>

            {sortedJobCards.map(({ job, cnList }, jobIdx) => {
              const isExpanded   = !!expandedContainers[`job_${job.id}`]
              const isClosing = !!closingJobs[`job_${job.id}`]
              const isLast       = jobIdx === sortedJobCards.length - 1

              const displayEta = job.eta
                ? new Date(job.eta).toLocaleDateString('en-IN', { day:'2-digit', month:'short', timeZone:'Asia/Kolkata' })
                : '—'
              const etaDate = job.eta ? new Date(job.eta) : null
              const validEta = etaDate && !isNaN(etaDate.getTime())
              const etaDays = validEta ? Math.ceil((etaDate.getTime() - Date.now()) / 86400000) : null
              const etaColor = !validEta ? 'var(--color-text-secondary)' : etaDays < 0 ? '#A32D2D' : etaDays <= 3 ? '#854F0B' : 'var(--color-text-primary)'

              return (
                <div key={job.id} style={{
                  borderBottom: isLast ? 'none' : '2px solid #d0d9e8',
                  transition: 'border-color 0.3s',
                  borderColor: isClosing ? 'transparent' : '#d0d9e8',
                }}>

                  {/* Job row */}
                  <div
                    onClick={() => {
                      if (isClosing) return
                      if (isExpanded) {
                        setClosingJobs(prev => ({ ...prev, [`job_${job.id}`]: true }))
                        timeoutRefs.current[job.id] = setTimeout(() => {
                          setExpandedContainers(prev => ({ ...prev, [`job_${job.id}`]: false }))
                          setClosingJobs(prev => ({ ...prev, [`job_${job.id}`]: false }))
                        }, 300)
                      } else {
                        setExpandedContainers(prev => ({ ...prev, [`job_${job.id}`]: true }))
                      }
                    }}
                    style={{
                      display:'grid', gridTemplateColumns:'32px 80px 110px 460px 1fr 130px 60px',
                      gap:'20px', alignItems:'start', padding:'11px 16px',
                      cursor:'pointer', transition:'background 0.12s',
                      background: activeContainer?.jobId === job.id ? '#E6F1FB' : 'var(--color-background-primary)',
                    }}
                    onMouseEnter={e => { if (activeContainer?.jobId !== job.id) e.currentTarget.style.background = 'var(--color-background-secondary)' }}
                    onMouseLeave={e => { if (activeContainer?.jobId !== job.id) e.currentTarget.style.background = 'var(--color-background-primary)' }}
                  >
                    <span style={{ fontSize:'12px', color:'var(--color-text-secondary)' }}>{isExpanded ? '▾' : '▸'}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'13px', fontWeight:500, color:'#185FA5' }}>{job.job_no}</span>
                    <span style={{ fontSize:'13px', fontWeight:500, color:'var(--color-text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{job.client}</span>

                    {/* Container chips */}
                    <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                      {Array.from({ length: Math.ceil(cnList.length / 5) }, (_, rowIdx) =>
                        cnList.slice(rowIdx * 5, rowIdx * 5 + 5)
                      ).map((row, rowIdx) => (
                        row.length > 0 && (
                          <div key={rowIdx} style={{ display:'flex', gap:'4px' }}>
                            {row.map(cn => {
                              const cnNorm = normalizeTrackingData(trackingData[cn] || {})
                              const cnStatus = cnNorm.status || 'in_transit'
                              const cnSt     = STATUS_STYLES_MAP[cnStatus] || STATUS_STYLES_MAP['in_transit']
                              const isDet    = cnNorm.freeDays !== null && cnNorm.freeDays <= 2
                              return (
                                <span
                                  key={`${cn}-${rowIdx}-chip`}
                                  onClick={e => { e.stopPropagation(); handleChipClick(job.id, cn, job) }}
                                  style={{
                                    ...(() => {
                                      const isActiveChip = activeContainer?.jobId === job.id && activeContainer?.cn === cn
                                      return {
                                        fontFamily:"'JetBrains Mono',monospace", fontSize:'10px', padding:'2px 7px',
                                        borderRadius:'5px', cursor:'pointer', transition:'all 0.12s',
                                        background: isActiveChip ? '#185FA5' : isDet ? '#FCEBEB' : cnSt.bg,
                                        color:      isActiveChip ? 'white'   : isDet ? '#A32D2D' : cnSt.color,
                                        border:     `0.5px solid ${isActiveChip ? '#185FA5' : isDet ? '#F7C1C1' : cnSt.border}`,
                                        whiteSpace: 'nowrap',
                                      }
                                    })(),
                                  }}
                                  onMouseEnter={e => {
                                    if (!(activeContainer?.jobId === job.id && activeContainer?.cn === cn)) {
                                      e.currentTarget.style.background = isDet ? '#A32D2D' : '#185FA5'
                                      e.currentTarget.style.color = 'white'
                                    }
                                  }}
                                  onMouseLeave={e => {
                                    const isActiveChip = activeContainer?.jobId === job.id && activeContainer?.cn === cn
                                    if (!isActiveChip) {
                                      e.currentTarget.style.background = isDet ? '#FCEBEB' : cnSt.bg
                                      e.currentTarget.style.color = isDet ? '#A32D2D' : cnSt.color
                                    }
                                  }}
                                >{cn}</span>
                              )
                            })}
                          </div>
                        )
                      ))}
                    </div>

                    {/* Overview — BL + status pills on single line */}
                    <div style={{ display:'flex', flexDirection:'column', gap:'4px', overflow:'hidden' }}>
                      {/* BL Number — only if exists */}
                      {job.bl_no && (
                        <span style={{ fontSize:'11px', color:'var(--color-text-secondary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          BL: <span style={{ fontFamily:"'JetBrains Mono',monospace", color:'var(--color-text-primary)', fontWeight:500 }}>{job.bl_no}</span>
                        </span>
                      )}
                      {/* Status pills — always shown on one line */}
                      <div style={{ display:'flex', gap:'5px', alignItems:'center', flexWrap:'nowrap' }}>
                        {(() => {
                          const pillStyles = {
                            'in transit': { dot:'#EF9F27', text:'#854F0B' },
                            'arrived':    { dot:'#1D9E75', text:'#27500A' },
                            'delivered':  { dot:'#0F6E56', text:'#085041' },
                            'on hold':    { dot:'#E24B4A', text:'#791F1F' },
                            'detention':  { dot:'#E24B4A', text:'#791F1F' },
                          }

                          const counts = {}
                          cnList.forEach(cn => {
                            const s = trackingData[cn]?.status || 'in_transit'
                            const isDetention = (trackingData[cn]?.freeDays ?? 99) <= 2
                            const label = isDetention ? 'detention' :
                              s === 'arrived' || s === 'at_cfs' ? 'arrived' :
                              s === 'delivered' || s === 'empty_returned' ? 'delivered' :
                              s === 'customs_hold' || s === 'delayed' ? 'on hold' :
                              'in transit'
                            counts[label] = (counts[label] || 0) + 1
                          })

                          const entries = Object.entries(counts)
                          return entries.map(([label, count], i) => {
                            const ps = pillStyles[label] || pillStyles['in transit']
                            return (
                              <span key={label} style={{ display:'inline-flex', alignItems:'center', gap:'4px', whiteSpace:'nowrap' }}>
                                <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:ps.dot, flexShrink:0 }} />
                                <span style={{ fontSize:'11px', fontWeight:500, color:ps.text }}>
                                  {count} {label}
                                </span>
                                {i < entries.length - 1 && (
                                  <span style={{ color:'var(--color-border-tertiary)', fontSize:'11px', margin:'0 2px' }}>·</span>
                                )}
                              </span>
                            )
                          })
                        })()}
                      </div>
                    </div>

                    <span style={{ fontSize:'12px', color:'var(--color-text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'center', display:'block' }}>{job.shipping_line || '—'}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'12px', fontWeight:500, color:etaColor }}>{displayEta}</span>
                  </div>

                  {/* Expanded container rows */}
                  {(isExpanded || isClosing) && (
                    <ExpandedContainerRows
                      job={job}
                      cnList={cnList}
                      trackingData={trackingData}
                      activeContainer={activeContainer}
                      STATUS_STYLES_MAP={STATUS_STYLES_MAP}
                      statusProgress={statusProgress}
                      getProgressColor={getProgressColor}
                      setActiveContainer={setActiveContainer}
                      setDetailJob={setDetailJob}
                      handleChipClick={handleChipClick}
                      handleLDBRefresh={handleLDBRefresh}
                      openCarrierTracking={openCarrierTracking}
                      showToast={showToast}
                      isClosing={isClosing}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
