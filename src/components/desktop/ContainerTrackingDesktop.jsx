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
          onClick={refreshAll}
          style={{ marginLeft:'auto', height:'36px', padding:'0 16px', background:'#185FA5', border:'none', borderRadius:'8px', color:'white', fontSize:'13px', fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', gap:'6px' }}
        >
          ↻ Refresh all
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
        <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
          <div style={{ background:'var(--color-background-primary)', border:'1.5px solid #d0d9e8', borderRadius:'12px', overflow:'hidden', minWidth:'700px' }}>

            {/* Column headers */}
            <div style={{ display:'grid', gridTemplateColumns:'32px 100px 140px 180px 1fr 120px 130px 72px', gap:'10px', alignItems:'center', padding:'8px 16px', background:'#e8eef8', borderBottom:'0.5px solid var(--color-border-tertiary)' }}>
              {['', 'Job', 'Client', 'Containers', 'Overview', 'Shipping line', 'Status', 'ETA'].map((h, i) => (
                <div key={i} style={{ fontSize:'10px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--color-text-secondary)' }}>{h}</div>
              ))}
            </div>

            {sortedJobCards.map(({ job, cnList }, jobIdx) => {
              const isExpanded   = !!expandedContainers[`job_${job.id}`]
              const statuses     = cnList.map(cn => trackingData[cn]?.status || 'in_transit')
              const hasDetention = cnList.some(cn => (trackingData[cn]?.freeDays ?? 99) <= 2)
              const allDelivered = statuses.every(s => s === 'delivered')
              const anyDelayed   = statuses.includes('delayed') || statuses.includes('customs_hold')
              const isLast       = jobIdx === sortedJobCards.length - 1

              const jobBadge = hasDetention
                ? { text:'⚠ Detention',      bg:'#FCEBEB', color:'#791F1F', border:'#F7C1C1' }
                : allDelivered
                ? { text:'Delivered',         bg:'#EAF3DE', color:'#27500A', border:'#C0DD97' }
                : anyDelayed
                ? { text:'Delayed / Hold',    bg:'#FCEBEB', color:'#791F1F', border:'#F7C1C1' }
                : statuses.includes('at_cfs') || statuses.includes('arrived')
                ? { text:'At CFS / Arrived',  bg:'#E1F5EE', color:'#085041', border:'#9FE1CB' }
                : { text:'In Transit',        bg:'#FAEEDA', color:'#633806', border:'#FAC775' }

              const displayEta = job.eta
                ? new Date(job.eta).toLocaleDateString('en-IN', { day:'2-digit', month:'short', timeZone:'Asia/Kolkata' })
                : '—'
              const etaDays = job.eta ? Math.ceil((new Date(job.eta) - new Date()) / 86400000) : null
              const etaColor = !job.eta ? 'var(--color-text-secondary)' : etaDays < 0 ? '#A32D2D' : etaDays <= 3 ? '#854F0B' : 'var(--color-text-primary)'

              return (
                <div key={job.id} style={{
                  borderBottom: isLast ? 'none' : '2px solid #d0d9e8',
                }}>

                  {/* Job row */}
                  <div
                    onClick={() => setExpandedContainers(prev => ({ ...prev, [`job_${job.id}`]: !prev[`job_${job.id}`] }))}
                    style={{
                      display:'grid', gridTemplateColumns:'32px 100px 140px 180px 1fr 120px 130px 72px',
                      gap:'10px', alignItems:'center', padding:'11px 16px',
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
                    <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                      {cnList.slice(0, 3).map(cn => {
                        const cnStatus = trackingData[cn]?.status || 'in_transit'
                        const cnSt     = STATUS_STYLES_MAP[cnStatus] || STATUS_STYLES_MAP['in_transit']
                        const isDet    = (trackingData[cn]?.freeDays ?? 99) <= 2
                        return (
                          <span
                            key={cn}
                            onClick={e => { e.stopPropagation(); setActiveContainer({ jobId: job.id, cn }); setDetailJob(job) }}
                            style={{
                              fontFamily:"'JetBrains Mono',monospace", fontSize:'10px', padding:'2px 7px',
                              borderRadius:'5px', cursor:'pointer', transition:'all 0.12s',
                              background: isDet ? '#FCEBEB' : cnSt.bg,
                              color:      isDet ? '#A32D2D' : cnSt.color,
                              border:     `0.5px solid ${isDet ? '#F7C1C1' : cnSt.border}`,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = isDet ? '#A32D2D' : cnSt.color; e.currentTarget.style.color = 'white' }}
                            onMouseLeave={e => { e.currentTarget.style.background = isDet ? '#FCEBEB' : cnSt.bg; e.currentTarget.style.color = isDet ? '#A32D2D' : cnSt.color }}
                          >{isDet ? '⚠ ' : ''}{cn}</span>
                        )
                      })}
                      {cnList.length > 3 && <span style={{ fontSize:'10px', color:'var(--color-text-secondary)', alignSelf:'center' }}>+{cnList.length - 3}</span>}
                    </div>

                    {/* Overview */}
                    <div style={{ display:'flex', alignItems:'center', gap:'10px', overflow:'hidden' }}>
                      {job.bl_no && (
                        <span style={{ fontSize:'11px', color:'var(--color-text-secondary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          BL: <span style={{ fontFamily:"'JetBrains Mono',monospace", color:'var(--color-text-primary)', fontWeight:500 }}>{job.bl_no}</span>
                        </span>
                      )}
                      {job.bl_no && cnList.length > 0 && (
                        <span style={{ color:'var(--color-border-tertiary)', fontSize:'12px', flexShrink:0 }}>|</span>
                      )}
                      <span style={{ fontSize:'11px', color:'var(--color-text-secondary)', whiteSpace:'nowrap', flexShrink:0 }}>
                        {(() => {
                          const counts = {}
                          cnList.forEach(cn => {
                            const s = trackingData[cn]?.status || 'in_transit'
                            const label =
                              s === 'arrived' || s === 'at_cfs' ? 'arrived' :
                              s === 'delivered' || s === 'empty_returned' ? 'delivered' :
                              s === 'customs_hold' || s === 'delayed' ? 'on hold' :
                              'in transit'
                            counts[label] = (counts[label] || 0) + 1
                          })
                          return Object.entries(counts)
                            .map(([label, count]) => `${count} ${label}`)
                            .join(' · ')
                        })()}
                      </span>
                    </div>

                    <span style={{ fontSize:'12px', color:'var(--color-text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{job.shipping_line || '—'}</span>
                    <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:'9999px', fontSize:'11px', fontWeight:500, border:`0.5px solid ${jobBadge.border}`, background:jobBadge.bg, color:jobBadge.color, whiteSpace:'nowrap' }}>
                      {jobBadge.text}
                    </span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'12px', fontWeight:500, color:etaColor }}>{displayEta}</span>
                  </div>

                  {/* Expanded container rows */}
                  {isExpanded && (
                    <div style={{ borderTop:'2px solid var(--color-background-secondary)', background:'#f0f4fb' }}>
                      <div style={{ display:'grid', gridTemplateColumns:'40px 180px 130px 1fr 100px 72px 80px', gap:'10px', alignItems:'center', padding:'5px 16px 5px 42px', borderBottom:'0.5px solid #dde3ef', background:'#e8eef8' }}>
                        {['#', 'Container', 'Status', 'Progress', 'Location', 'Free days', ''].map((h, i) => (
                          <div key={i} style={{ fontSize:'9px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--color-text-secondary)' }}>{h}</div>
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
                        const isActive    = activeContainer?.cn === cn && activeContainer?.jobId === job.id

                        return (
                            <div
                              key={cn}
                              onClick={() => { setActiveContainer(prev => prev?.jobId === job.id && prev?.cn === cn ? null : { jobId: job.id, cn }); setDetailJob(job) }}
                              style={{
                                display:'grid', gridTemplateColumns:'40px 180px 130px 1fr 100px 72px 80px',
                                gap:'10px', alignItems:'center', padding:'9px 16px 9px 42px',
                                borderBottom: isLastCn ? 'none' : '0.5px solid #dde3ef',
                                borderLeft: `3px solid ${isActive ? '#185FA5' : 'transparent'}`,
                                background: isActive ? '#E6F1FB' : 'white',
                                cursor:'pointer', transition:'all 0.15s',
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
                            <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 8px', borderRadius:'9999px', fontSize:'10px', fontWeight:500, border:`0.5px solid ${isDetention ? '#F7C1C1' : st.border}`, background: isDetention ? '#FCEBEB' : st.bg, color: isDetention ? '#791F1F' : st.color, whiteSpace:'nowrap' }}>
                              {isDetention ? '⚠ Detention' : (td.statusText || 'Not Updated')}
                            </span>
                            <div>
                              <div style={{ height:'4px', background:'var(--color-border-tertiary)', borderRadius:'4px', overflow:'hidden', marginBottom:'2px' }}>
                                <div style={{ height:'100%', borderRadius:'4px', width:`${pct}%`, background:pColor }} />
                              </div>
                              <div style={{ fontSize:'10px', color:pColor, fontWeight:500 }}>{pct}%</div>
                            </div>
                            <span style={{ fontSize:'11px', color:'var(--color-text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{td.currentLocation || '—'}</span>
                            <span style={{ fontSize:'12px', fontWeight:500, color: isDetention ? '#A32D2D' : td.freeDays != null && td.freeDays <= 5 ? '#854F0B' : 'var(--color-text-secondary)' }}>
                              {td.freeDays != null ? `${td.freeDays}d` : '—'}
                            </span>
                            <div style={{ display:'flex', gap:'4px' }}>
                              <button
                                onClick={async e => { e.stopPropagation(); setActiveContainer({ jobId: job.id, cn }); setDetailJob(job); await handleLDBRefresh(job, cn) }}
                                style={{ width:'28px', height:'28px', borderRadius:'6px', border:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-primary)', color:'var(--color-text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px' }}
                                onMouseEnter={e => { e.currentTarget.style.background='#185FA5'; e.currentTarget.style.color='white'; e.currentTarget.style.borderColor='#185FA5' }}
                                onMouseLeave={e => { e.currentTarget.style.background='var(--color-background-primary)'; e.currentTarget.style.color='var(--color-text-secondary)'; e.currentTarget.style.borderColor='var(--color-border-tertiary)' }}
                                title="Refresh"
                              >↻</button>
                              <button
                                onClick={e => { e.stopPropagation(); openCarrierTracking(cn, job.shipping_line, showToast) }}
                                style={{ width:'28px', height:'28px', borderRadius:'6px', border:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-primary)', color:'var(--color-text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px' }}
                                onMouseEnter={e => { e.currentTarget.style.background='#0F6E56'; e.currentTarget.style.color='white'; e.currentTarget.style.borderColor='#0F6E56' }}
                                onMouseLeave={e => { e.currentTarget.style.background='var(--color-background-primary)'; e.currentTarget.style.color='var(--color-text-secondary)'; e.currentTarget.style.borderColor='var(--color-border-tertiary)' }}
                                title="Carrier site"
                              >🌐</button>
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
