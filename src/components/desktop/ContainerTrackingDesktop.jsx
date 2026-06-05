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
}) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

      {/* ── KPI STRIP ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'10px' }}>
        {[
          { label:'Total Containers', value: kpis.total,            bg:'#f8f9fb', color:'#1a2233',  sub:'across all jobs'  },
          { label:'In Transit',       value: kpis.inTransit,        bg:'#FAEEDA', color:'#633806',  sub:'on the water'     },
          { label:'At CFS / Arrived', value: kpis.atCFS,            bg:'#EAF3DE', color:'#27500A',  sub:'at destination'   },
          { label:'Detention Risk',   value: kpis.detained,         bg: kpis.detained > 0 ? '#FCEBEB' : '#f8f9fb', color: kpis.detained > 0 ? '#791F1F' : '#1a2233', sub: kpis.detained > 0 ? 'act immediately' : 'none' },
          { label:'ETA This Week',    value: kpis.arrivingThisWeek, bg:'#E6F1FB', color:'#0C447C',  sub:'arriving soon'    },
        ].map(k => (
          <div key={k.label} style={{ background:k.bg, borderRadius:'10px', padding:'12px 14px' }}>
            <div style={{ fontSize:'10px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:k.color, opacity:0.75, marginBottom:'4px' }}>{k.label}</div>
            <div style={{ fontSize:'26px', fontWeight:500, color:k.color, lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:'11px', color:k.color, opacity:0.65, marginTop:'3px' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── FILTER BAR ── */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'white', border:'1.5px solid #e2e6ed', borderRadius:'8px', padding:'0 12px', height:'34px', flex:'1', maxWidth:'360px' }}>
          <span style={{ fontSize:'14px', color:'#8a96a8' }}>🔍</span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search job, client, container, BL..."
            style={{ border:'none', outline:'none', background:'transparent', fontSize:'13px', color:'#1a2233', width:'100%' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#8a96a8', fontSize:'13px', lineHeight:1 }}>✕</button>
          )}
        </div>
        <select value={filterLine} onChange={e => setFilterLine(e.target.value)}
          style={{ height:'34px', padding:'0 10px', border:'1.5px solid #e2e6ed', borderRadius:'8px', fontSize:'13px', color:'#4a5568', background:'white', outline:'none' }}>
          <option value="">All Lines</option>
          {carriers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ height:'34px', padding:'0 10px', border:'1.5px solid #e2e6ed', borderRadius:'8px', fontSize:'13px', color:'#4a5568', background:'white', outline:'none' }}>
          <option value="">All Status</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button
          onClick={refreshAll}
          style={{ height:'34px', padding:'0 14px', background:'#1a4fa0', border:'none', borderRadius:'8px', color:'white', fontSize:'13px', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}
        >
          ↻ Refresh All
        </button>
        <span style={{ marginLeft:'auto', fontSize:'12px', color:'#8a96a8' }}>
          {sortedJobCards.length} job{sortedJobCards.length !== 1 ? 's' : ''} · {kpis.total} container{kpis.total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── EMPTY STATE ── */}
      {sortedJobCards.length === 0 ? (
        <div style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', padding:'48px 24px', textAlign:'center' }}>
          <div style={{ fontSize:'32px', color:'#8a96a8', marginBottom:'12px' }}>⊟</div>
          <p style={{ fontSize:'14px', fontWeight:500, color:'#1a2233' }}>
            {searchQuery || filterLine || filterStatus ? 'No jobs match your filters.' : 'No jobs with containers yet.'}
          </p>
          <p style={{ fontSize:'12px', color:'#8a96a8', marginTop:'6px' }}>
            Go to All Jobs → open a job → Edit → add container numbers.
          </p>
        </div>
      ) : (
        <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
          <div style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', overflow:'hidden', minWidth:'700px' }}>

            {/* Column headers */}
            <div style={{ display:'grid', gridTemplateColumns:'32px 100px 140px 1fr 110px 130px 80px', gap:'12px', alignItems:'center', padding:'8px 16px', background:'#f8f9fb', borderBottom:'1.5px solid #e2e6ed' }}>
              {['', 'Job', 'Client', 'Containers', 'Shipping Line', 'Status', 'ETA'].map((h, i) => (
                <div key={i} style={{ fontSize:'10px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:'#8a96a8' }}>{h}</div>
              ))}
            </div>

            {/* Job rows */}
            {sortedJobCards.map(({ job, cnList }, jobIdx) => {
              const isExpanded   = !!expandedContainers[`job_${job.id}`]
              const statuses     = cnList.map(cn => trackingData[cn]?.status || 'in_transit')
              const hasDetention = cnList.some(cn => (trackingData[cn]?.freeDays ?? 99) <= 2)
              const allDelivered = statuses.every(s => s === 'delivered')
              const anyDelayed   = statuses.includes('delayed') || statuses.includes('customs_hold')
              const isLast       = jobIdx === sortedJobCards.length - 1

              const jobBadge = hasDetention
                ? { text:'⚠ Detention Risk', bg:'#FCEBEB', color:'#991b1b', border:'#fecaca' }
                : allDelivered
                ? { text:'Delivered',         bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' }
                : anyDelayed
                ? { text:'Delayed / Hold',    bg:'#fef2f2', color:'#991b1b', border:'#fecaca' }
                : statuses.includes('at_cfs') || statuses.includes('arrived')
                ? { text:'At CFS / Arrived',  bg:'#f0fdfa', color:'#0f766e', border:'#99f6e4' }
                : { text:'In Transit',        bg:'#fffbeb', color:'#92400e', border:'#fde68a' }

              const displayEta = job.eta
                ? new Date(job.eta).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })
                : '—'
              const etaColor = (() => {
                if (!job.eta) return '#8a96a8'
                const days = Math.ceil((new Date(job.eta) - new Date()) / 86400000)
                if (days < 0) return '#991b1b'
                if (days <= 3) return '#b45309'
                return '#1a2233'
              })()

              return (
                <div key={job.id} style={{ borderBottom: isLast ? 'none' : '0.5px solid #e2e6ed' }}>

                  {/* Job row */}
                  <div
                    onClick={() => setExpandedContainers(prev => ({ ...prev, [`job_${job.id}`]: !prev[`job_${job.id}`] }))}
                    style={{ display:'grid', gridTemplateColumns:'32px 100px 140px 1fr 110px 130px 80px', gap:'12px', alignItems:'center', padding:'11px 16px', cursor:'pointer', background: hasDetention ? '#fff8f8' : 'white', transition:'background 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = hasDetention ? '#fff0f0' : '#f8f9fb' }}
                    onMouseLeave={e => { e.currentTarget.style.background = hasDetention ? '#fff8f8' : 'white' }}
                  >
                    <span style={{ fontSize:'11px', color:'#8a96a8', display:'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none', transition:'transform 0.15s' }}>▶</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'13px', fontWeight:600, color:'#1a4fa0' }}>{job.job_no}</span>
                    <span style={{ fontSize:'13px', color:'#1a2233', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{job.client}</span>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', alignItems:'center' }}>
                      {cnList.slice(0, 3).map(cn => (
                        <span
                          key={cn}
                          onClick={e => {
                            e.stopPropagation()
                            setActiveContainer({ jobId: job.id, cn })
                            setDetailJob(job)
                          }}
                          style={{
                            fontFamily:"'JetBrains Mono',monospace",
                            fontSize:'10px', color:'#1a4fa0',
                            background:'#eff6ff',
                            border:'0.5px solid #bfdbfe',
                            borderRadius:'4px',
                            padding:'2px 6px',
                            whiteSpace:'nowrap',
                            cursor:'pointer',
                            transition:'all 0.15s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = '#1a4fa0'
                            e.currentTarget.style.color = 'white'
                            e.currentTarget.style.borderColor = '#1a4fa0'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = '#eff6ff'
                            e.currentTarget.style.color = '#1a4fa0'
                            e.currentTarget.style.borderColor = '#bfdbfe'
                          }}
                          title={`Click to view ${cn} details`}
                        >
                          {cn}
                        </span>
                      ))}
                      {cnList.length > 3 && (
                        <span style={{ fontSize:'10px', color:'#8a96a8' }}>+{cnList.length - 3}</span>
                      )}
                    </div>
                    <span style={{ fontSize:'12px', color:'#8a96a8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{job.shipping_line || '—'}</span>
                    <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 8px', borderRadius:'9999px', fontSize:'11px', fontWeight:500, border:`0.5px solid ${jobBadge.border}`, background:jobBadge.bg, color:jobBadge.color, whiteSpace:'nowrap' }}>
                      {jobBadge.text}
                    </span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'12px', fontWeight:500, color:etaColor }}>{displayEta}</span>
                  </div>

                  {/* Expanded container rows */}
                  {isExpanded && (
                    <div style={{ borderTop:'0.5px solid #e2e6ed', background:'#f8f9fb' }}>
                      {/* Container column headers */}
                      <div style={{ display:'grid', gridTemplateColumns:'48px 180px 120px 1fr 100px 80px 100px', gap:'12px', alignItems:'center', padding:'6px 16px 6px 48px', borderBottom:'1px solid #e2e6ed' }}>
                        {['', 'Container', 'Status', 'Progress', 'Location', 'Free Days', ''].map((h, i) => (
                          <div key={i} style={{ fontSize:'9px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:'#8a96a8' }}>{h}</div>
                        ))}
                      </div>
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
                              setActiveContainer(prev =>
                                prev?.jobId === job.id && prev?.cn === cn ? null : { jobId: job.id, cn }
                              )
                              setDetailJob(job)
                            }}
                            style={{
                              display:'grid', gridTemplateColumns:'48px 180px 120px 1fr 100px 80px 100px',
                              gap:'12px', alignItems:'center', padding:'10px 16px 10px 48px',
                              borderBottom: isLastCn ? 'none' : '0.5px solid #e2e6ed',
                              background: activeContainer?.cn === cn && activeContainer?.jobId === job.id
                                ? '#f0f4fb' : 'white',
                              cursor:'pointer',
                              transition:'background 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f8f9fb' }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background =
                                activeContainer?.cn === cn && activeContainer?.jobId === job.id
                                  ? '#f0f4fb' : 'white'
                            }}
                          >
                            <span style={{ fontSize:'11px', color:'#8a96a8' }}>#{cnIdx+1}</span>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'12px', fontWeight:600, color:'#1a2233' }}>{cn}</span>
                            <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 8px', borderRadius:'9999px', fontSize:'10px', fontWeight:500, border:`0.5px solid ${isDetention ? '#fecaca' : st.border}`, background: isDetention ? '#fef2f2' : st.bg, color: isDetention ? '#991b1b' : st.color, whiteSpace:'nowrap' }}>
                              {isDetention ? '⚠ Detention' : (td.statusText || 'Not Updated')}
                            </span>
                            <div>
                              <div style={{ height:'4px', background:'#e2e6ed', borderRadius:'4px', overflow:'hidden', marginBottom:'3px' }}>
                                <div style={{ height:'100%', borderRadius:'4px', width:`${pct}%`, background:pColor }} />
                              </div>
                              <div style={{ fontSize:'10px', color:pColor, fontWeight:600 }}>{pct}%</div>
                            </div>
                            <span style={{ fontSize:'11px', color:'#8a96a8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{td.currentLocation || '—'}</span>
                            <span style={{ fontSize:'12px', fontWeight:500, color: isDetention ? '#991b1b' : td.freeDays != null && td.freeDays <= 5 ? '#b45309' : '#8a96a8' }}>
                              {td.freeDays != null ? `${td.freeDays}d` : '—'}
                            </span>
                            <div style={{ display:'flex', gap:'5px' }}>
                              <button onClick={async e => {
                                  e.stopPropagation()
                                  setActiveContainer({ jobId: job.id, cn })
                                  setDetailJob(job)
                                  await handleLDBRefresh(job, cn)
                                }}
                                style={{ padding:'5px 8px', background:'#f0f4fb', border:'0.5px solid #bfdbfe', borderRadius:'5px', fontSize:'13px', color:'#1a4fa0', cursor:'pointer', minHeight:'32px', minWidth:'32px' }}
                                onMouseEnter={e => { e.currentTarget.style.background='#1a4fa0'; e.currentTarget.style.color='white' }}
                                onMouseLeave={e => { e.currentTarget.style.background='#f0f4fb'; e.currentTarget.style.color='#1a4fa0' }}
                                title="Refresh">
                                ↻
                              </button>
                              <button onClick={e => { e.stopPropagation(); openCarrierTracking(cn, job.shipping_line, showToast) }}
                                style={{ padding:'5px 8px', background:'#f8f9fb', border:'0.5px solid #e2e6ed', borderRadius:'5px', fontSize:'13px', color:'#4a5568', cursor:'pointer', minHeight:'32px', minWidth:'32px' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor='#1a4fa0'; e.currentTarget.style.color='#1a4fa0' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor='#e2e6ed'; e.currentTarget.style.color='#4a5568' }}
                                title="Open carrier tracking">
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
        </div>
      )}
    </div>
  )
}
