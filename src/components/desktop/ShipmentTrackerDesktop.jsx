import { useState, useEffect } from 'react'

function formatJobNo(jobNo) {
  if (!jobNo) return '—'
  const parts = jobNo.split('/')
  const num = parts[parts.length - 1]
  const stripped = num.replace(/^0+/, '') || '0'
  return `J-${stripped.padStart(3, '0')}`
}

function getContainerList(job) {
  if (!job?.containers) return []
  return job.containers.split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
}

function getInitials(name) {
  if (!name) return 'JD'
  return name.split(' ').map(n => n[0]).filter(Boolean).join('').toUpperCase().substring(0, 2)
}

const BADGE_STYLES = {
  green:  { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  red:    { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' },
  amber:  { bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
  blue:   { bg: '#dbeafe', color: '#1a4fa0', border: '#93c5fd' },
  gray:   { bg: '#f4f6f9', color: '#8a96a8', border: '#e2e6ed' },
}

const KPI_COLORS = {
  ooc:      { color: '#15803d' },
  customs:  { color: '#b45309' },
  detention:{ color: '#b91c1c' },
  vesselEta:{ color: '#1a4fa0' },
}

const KPI_CONFIG = [
  { key: 'ooc',       label: 'OOC GRANTED' },
  { key: 'customs',   label: 'IN CUSTOMS' },
  { key: 'detention', label: 'DETENTION RISK' },
  { key: 'vesselEta', label: 'VESSEL ETA' },
]

const JOURNEY_PILLS = [
  { key: 'arr', label: 'Arr', stepIdx: 0 },
  { key: 'igm', label: 'IGM', stepIdx: 1 },
  { key: 'dsc', label: 'Dsc', stepIdx: 2 },
  { key: 'cfs', label: 'CFS', stepIdx: 3 },
  { key: 'ooc', label: 'OOC', stepIdx: 4 },
]

export default function ShipmentTrackerDesktop({
  jobs, profiles, currentUserName, showToast,
  search, setSearch, selectedJob, setSelectedJob,
  ulipData, loadingUlip, truckInputs, setTruckInputs,
  savingTruck, saveTruckNumber, markDelivered,
  loadUlipData, getJourneySteps, getJobStatus,
}) {
  const [expandedJobs, setExpandedJobs] = useState({})
  const [activeContainer, setActiveContainer] = useState(null)
  const [editingTruck, setEditingTruck] = useState(null)
  const [truckEdit, setTruckEdit] = useState('')

  const ulip = selectedJob ? (ulipData[selectedJob.id] || {}) : {}
  const steps = selectedJob ? getJourneySteps(selectedJob, ulip) : []
  const toll = ulip?.fastagStatus?.tollCrossings || []
  const truckNo = selectedJob?.truck_no || truckInputs[selectedJob?.id] || ulip?.beStatus?.vehicleNumbers?.[0]

  const sidebarStatus = selectedJob ? getJobStatus(selectedJob, ulipData[selectedJob.id] || {}) : { label: '', color: 'gray' }
  const sidebarBadge = BADGE_STYLES[sidebarStatus.color] || BADGE_STYLES.gray

  const kpis = {
    ooc: jobs.filter(j => ulipData[j.id]?.beStatus?.oocDate).length,
    customs: jobs.filter(j => j.be_no && !ulipData[j.id]?.beStatus?.oocDate && Number(j.stage) < 10).length,
    detention: jobs.filter(j => {
      const u = ulipData[j.id]
      if (!u?.beStatus?.oocDate) return false
      if (Number(j.stage) === 10) return false
      if (j.truck_no || truckInputs[j.id]) return false
      return true
    }).length,
    vesselEta: jobs.filter(j => j.eta && new Date(j.eta) > new Date()).length,
  }

  const handleJobRowClick = (job) => {
    setExpandedJobs(prev => ({ ...prev, [job.id]: !prev[job.id] }))
    if (activeContainer?.jobId !== job.id) setActiveContainer(null)
    setSelectedJob(job)
  }

  const handleContainerClick = (job, cn) => {
    setSelectedJob(job)
    setActiveContainer({ jobId: job.id, cn })
    if (!ulipData[job.id]) {
      loadUlipData(job)
    }
  }

  const totalContainers = jobs.reduce((sum, j) => sum + getContainerList(j).length, 0)

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid #e2e6ed',
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
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

      {/* Top bar */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #e2e6ed',
        padding: '13px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a2233', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🚢</span> Shipment tracker
          </div>
          <div style={{ fontSize: '11px', color: '#8a96a8', marginTop: '2px' }}>
            {totalContainers} containers across {jobs.length} active jobs · sorted latest first · updated just now
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: '#fff', border: '1px solid #e2e6ed',
            borderRadius: '8px', padding: '0 12px', height: '34px',
          }}>
            <span style={{ color: '#8a96a8', fontSize: '13px' }}>🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Job, container, BE, client..."
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                fontSize: '13px', color: '#1a2233', width: '220px',
                fontFamily: 'inherit',
              }}
            />
          </div>
          {selectedJob && (
            <button
              onClick={() => loadUlipData(selectedJob, { refresh: true })}
              style={{
                height: '34px', padding: '0 12px', fontSize: '12px', fontWeight: 500,
                border: '1px solid #e2e6ed', borderRadius: '8px',
                background: '#fff', color: '#4a5568', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              ↻ Refresh
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex' }}>

        {/* Left area: KPI + table */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

          {/* KPI row */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e6ed' }}>
            {KPI_CONFIG.map((kpi, i) => (
              <div
                key={kpi.key}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  borderRight: i < KPI_CONFIG.length - 1 ? '1px solid #e2e6ed' : 'none',
                }}
              >
                <div style={{
                  fontSize: '28px', fontWeight: 600,
                  color: KPI_COLORS[kpi.key].color,
                  lineHeight: 1.1,
                }}>
                  {kpis[kpi.key]}
                </div>
                <div style={{
                  fontSize: '11px', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: '#8a96a8', marginTop: '2px',
                }}>
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '36px minmax(0,1.4fr) 160px 80px 200px 80px',
            borderBottom: '1px solid #e2e6ed',
            background: '#f8f9fb',
          }}>
            {['', 'JOB / CLIENT', 'CONTAINERS', 'ETA', 'STATUS', 'MODE'].map(h => (
              <div
                key={h}
                style={{
                  padding: '8px 20px',
                  fontSize: '10px', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  color: '#8a96a8',
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Job rows */}
          <div style={{ overflowY: 'auto' }}>
            {jobs.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: '13px', color: '#8a96a8' }}>
                No jobs found
              </div>
            )}
            {jobs.map((job, jobIdx) => {
              const isExpanded = !!expandedJobs[job.id]
              const cnList = getContainerList(job)
              const status = getJobStatus(job, ulipData[job.id] || {})
              const badge = BADGE_STYLES[status.color] || BADGE_STYLES.gray
              const displayEta = job.eta
                ? new Date(job.eta).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })
                : '—'

              return (
                <div key={job.id}>
                  {/* Job row */}
                  <div
                    onClick={() => handleJobRowClick(job)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '36px minmax(0,1.4fr) 160px 80px 200px 80px',
                      padding: '13px 20px',
                      borderBottom: isExpanded ? 'none' : '1px solid #e2e6ed',
                      cursor: 'pointer',
                      background: isExpanded ? '#f0f4fb' : '#fff',
                      transition: 'background 0.12s',
                      alignItems: 'center',
                    }}
                    onMouseEnter={e => {
                      if (!isExpanded) e.currentTarget.style.background = '#f8f9fb'
                    }}
                    onMouseLeave={e => {
                      if (!isExpanded) e.currentTarget.style.background = '#fff'
                    }}
                  >
                    {/* Chevron */}
                    <div style={{
                      fontSize: '12px', color: '#8a96a8',
                      transform: isExpanded ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s',
                      textAlign: 'center',
                    }}>
                      ›
                    </div>

                    {/* Job + Client */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px', fontWeight: 600,
                        color: '#1a4fa0', fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {formatJobNo(job.job_no)}
                      </div>
                      <div style={{
                        fontSize: '12px', color: '#1a2233',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {job.client}
                      </div>
                    </div>

                    {/* Container chips */}
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {cnList.slice(0, 3).map(cn => (
                        <span
                          key={cn}
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '11px', padding: '3px 8px', borderRadius: '5px',
                            background: '#E6F1FB', color: '#185FA5',
                            border: '0.5px solid #B5D4F4',
                          }}
                        >
                          {cn}
                        </span>
                      ))}
                      {cnList.length > 3 && (
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: '11px', padding: '3px 8px', borderRadius: '5px',
                          background: '#f4f6f9', color: '#8a96a8',
                          border: '0.5px solid #e2e6ed',
                        }}>
                          +{cnList.length - 3}
                        </span>
                      )}
                    </div>

                    {/* ETA */}
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '12px', color: '#4a5568',
                    }}>
                      {displayEta}
                    </div>

                    {/* Status badge */}
                    <div>
                      <span style={{
                        borderRadius: '99px', fontSize: '12px', fontWeight: 500,
                        padding: '4px 10px',
                        background: badge.bg, color: badge.color,
                        border: `1px solid ${badge.border}`,
                        whiteSpace: 'nowrap',
                      }}>
                        {status.label}
                      </span>
                    </div>

                    {/* Mode */}
                    <div style={{
                      fontSize: '11px', color: '#8a96a8',
                    }}>
                      {job.mode || '—'}
                    </div>
                  </div>

                  {/* Expanded container sub-rows */}
                  {isExpanded && cnList.length > 0 && (
                    <div style={{
                      display: 'grid',
                      animation: 'expandDown 0.25s cubic-bezier(0.16,1,0.3,1) forwards',
                    }}>
                      <div style={{ overflow: 'hidden' }}>
                        {/* Sub-header */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '36px 180px 140px 1fr 90px 60px',
                          padding: '7px 20px 7px 52px',
                          background: '#e8eef8',
                          borderBottom: '0.5px solid #dde3ef',
                          fontSize: '9px', fontWeight: 500,
                          textTransform: 'uppercase', letterSpacing: '0.07em',
                          color: '#8a96a8',
                        }}>
                          {['#', 'Container', 'Status', 'Journey steps', 'Size', ''].map(h => (
                            <div key={h}>{h}</div>
                          ))}
                        </div>

                        {cnList.map((cn, cnIdx) => {
                          const jobSteps = selectedJob?.id === job.id ? steps : getJourneySteps(job, ulipData[job.id] || {})
                          const isActive = activeContainer?.cn === cn && activeContainer?.jobId === job.id

                          return (
                            <div
                              key={cn}
                              onClick={() => handleContainerClick(job, cn)}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '36px 180px 140px 1fr 90px 60px',
                                padding: '11px 20px 11px 52px',
                                borderBottom: cnIdx < cnList.length - 1 ? '0.5px solid #dde3ef' : 'none',
                                borderLeft: `3px solid ${isActive ? '#185FA5' : 'transparent'}`,
                                background: isActive ? '#E6F1FB' : '#f0f4fb',
                                cursor: 'pointer',
                                transition: 'background 0.15s, border-left-color 0.15s',
                                alignItems: 'center',
                                fontSize: '12px', color: '#1a2233',
                              }}
                              onMouseEnter={e => {
                                if (!isActive) {
                                  e.currentTarget.style.background = '#e8eef8'
                                  e.currentTarget.style.borderLeftColor = '#7ab3e0'
                                }
                              }}
                              onMouseLeave={e => {
                                if (!isActive) {
                                  e.currentTarget.style.background = '#f0f4fb'
                                  e.currentTarget.style.borderLeftColor = 'transparent'
                                }
                              }}
                            >
                              {/* # */}
                              <div style={{ color: '#8a96a8', fontSize: '11px' }}>
                                {cnIdx + 1}
                              </div>

                              {/* Container */}
                              <div style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '12px', fontWeight: 500,
                                color: '#1a2233',
                              }}>
                                {cn}
                              </div>

                              {/* Status */}
                              <div>
                                <span style={{
                                  borderRadius: '99px', fontSize: '11px', fontWeight: 500,
                                  padding: '3px 8px',
                                  background: badge.bg, color: badge.color,
                                  border: `1px solid ${badge.border}`,
                                }}>
                                  {status.label}
                                </span>
                              </div>

                              {/* Journey step pills */}
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {JOURNEY_PILLS.map(pill => {
                                  const step = jobSteps[pill.stepIdx]
                                  const done = step?.done
                                  return (
                                    <span
                                      key={pill.key}
                                      style={{
                                        fontSize: '9px', fontWeight: 600,
                                        padding: '2px 6px', borderRadius: '4px',
                                        background: done ? '#dcfce7' : '#f4f6f9',
                                        color: done ? '#15803d' : '#8a96a8',
                                        border: `0.5px solid ${done ? '#86efac' : '#e2e6ed'}`,
                                        fontFamily: "'JetBrains Mono', monospace",
                                        letterSpacing: '0.02em',
                                      }}
                                    >
                                      {done ? `${pill.label} ✓` : pill.label}
                                    </span>
                                  )
                                })}
                              </div>

                              {/* Size */}
                              <div style={{
                                fontSize: '11px', color: '#8a96a8',
                                fontFamily: "'JetBrains Mono', monospace",
                              }}>
                                {job.container_sizes?.[cn] || '—'}
                              </div>

                              {/* Action */}
                              <div style={{ color: '#185FA5', fontSize: '13px', textAlign: 'center' }}>
                                ›
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right sidebar — 280px */}
        <div style={{
          width: '280px',
          flexShrink: 0,
          borderLeft: '1px solid #e2e6ed',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          minHeight: '400px',
        }}>
          {!activeContainer || !selectedJob ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '32px 20px',
              textAlign: 'center',
              flex: 1,
            }}>
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>📦</div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#1a2233', marginBottom: '4px' }}>
                Select a container
              </div>
              <div style={{ fontSize: '12px', color: '#8a96a8' }}>
                Click any job row to expand, then click a container to view its shipment journey
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Section 1 — Header */}
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{
                    fontSize: '14px', fontWeight: 600,
                    color: '#1a4fa0', fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {formatJobNo(selectedJob.job_no)}
                  </div>
                  <span style={{
                    borderRadius: '99px', fontSize: '11px', fontWeight: 500,
                    padding: '3px 8px',
                    background: sidebarBadge.bg, color: sidebarBadge.color,
                    border: `1px solid ${sidebarBadge.border}`,
                  }}>
                    {sidebarStatus.label}
                  </span>
                </div>
                <div style={{
                  fontSize: '12px', color: '#8a96a8',
                  fontFamily: "'JetBrains Mono', monospace", marginBottom: '2px',
                }}>
                  {activeContainer.cn}
                </div>
                <div style={{ fontSize: '12px', color: '#8a96a8' }}>
                  {selectedJob.client} · {selectedJob.mode || '—'} · {selectedJob.cfs_name || 'Gateway CFS'}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e2e6ed' }} />

              {/* Section 2 — Job Details */}
              <div>
                <div style={{
                  fontSize: '10px', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  color: '#8a96a8', marginBottom: '8px',
                }}>
                  Job details
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    { label: 'BE number',  value: ulip?.beStatus?.beNumber || selectedJob.be_no || '—' },
                    { label: 'Importer',   value: ulip?.beStatus?.importerName || selectedJob.client || '—' },
                    { label: 'Container size', value: selectedJob.container_sizes?.[activeContainer.cn] || '—' },
                    { label: 'DO number',  value: ulip?.beStatus?.doNumber || '—' },
                    { label: 'DO date',    value: ulip?.beStatus?.doDate || '—' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#8a96a8', flexShrink: 0 }}>{row.label}</span>
                      <span style={{
                        fontSize: '12px', color: '#1a2233', fontWeight: 500,
                        textAlign: 'right', fontFamily: "'JetBrains Mono', monospace",
                        wordBreak: 'break-word',
                      }}>
                        {row.value}
                      </span>
                    </div>
                  ))}

                  {/* Vessel ETA */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#8a96a8' }}>Vessel ETA</span>
                    {selectedJob.eta ? (() => {
                      const etaDate = new Date(selectedJob.eta)
                      const onTime = etaDate >= new Date()
                      return (
                        <span style={{
                          fontSize: '12px', fontWeight: 500,
                          color: onTime ? '#15803d' : '#b91c1c',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          {etaDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          {' · '}
                          {onTime ? 'On time ✓' : 'Overdue'}
                        </span>
                      )
                    })() : (
                      <span style={{ fontSize: '12px', color: '#8a96a8', fontFamily: "'JetBrains Mono', monospace" }}>—</span>
                    )}
                  </div>

                  {/* Examination */}
                  {(() => {
                    const exam = ulip?.beStatus?.examination
                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#8a96a8' }}>Examination</span>
                        {exam ? (
                          <span style={{
                            fontSize: '11px', fontWeight: 600,
                            padding: '2px 6px', borderRadius: '4px',
                            background: '#fee2e2', color: '#b91c1c',
                            border: '1px solid #fca5a5',
                          }}>
                            ⚠ Examination ordered — RMS
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#8a96a8' }}>None</span>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e2e6ed' }} />

              {/* Section 3 — Shipment Journey */}
              <div>
                <div style={{
                  fontSize: '10px', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  color: '#8a96a8', marginBottom: '8px',
                }}>
                  Shipment journey
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {steps.map((step, i) => {
                    if (step.id === 'ooc' && step.done) {
                      return (
                        <div key={step.id}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '6px 0',
                          }}>
                            <div style={{
                              width: '20px', height: '20px', borderRadius: '50%',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: '#dcfce7', border: '1.5px solid #86efac',
                              flexShrink: 0, fontSize: '10px', color: '#15803d',
                            }}>
                              ✓
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 500, color: '#15803d' }}>
                                {step.label}
                              </div>
                              {step.sub && (
                                <div style={{ fontSize: '11px', color: '#15803d', opacity: 0.85 }}>
                                  {step.sub}
                                </div>
                              )}
                            </div>
                          </div>
                          {/* OOC green banner */}
                          <div style={{
                            background: '#dcfce7', border: '1px solid #86efac',
                            borderRadius: '7px', padding: '8px 10px', marginTop: '4px', marginBottom: '6px',
                          }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#15803d' }}>
                              ✓ Cleared · {ulip?.beStatus?.oocDate || '—'} {ulip?.beStatus?.oocTime || ''}
                            </div>
                            <div style={{ fontSize: '11px', color: '#15803d', marginTop: '2px', opacity: 0.85 }}>
                              DO No: {ulip?.beStatus?.doNumber || '—'} · OOC No: {ulip?.beStatus?.oocNo || '—'}
                            </div>
                          </div>
                        </div>
                      )
                    }
                    if (step.id === 'truck') {
                      const oocDone = steps.find(s => s.id === 'ooc')?.done
                      if (!oocDone) return null
                      return (
                        <div key={step.id}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '6px 0',
                          }}>
                            <div style={{
                              width: '20px', height: '20px', borderRadius: '50%',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, fontSize: '10px',
                              background: truckNo ? '#dcfce7' : '#e8eef8',
                              border: truckNo ? '1.5px solid #86efac' : '2px solid #1a4fa0',
                              color: truckNo ? '#15803d' : '#1a4fa0',
                            }}>
                              {truckNo ? '✓' : <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1a4fa0' }} />}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{
                                fontSize: '13px', fontWeight: 500,
                                color: truckNo ? '#15803d' : '#1a4fa0',
                              }}>
                                {step.label}
                              </div>
                              {/* Truck number box */}
                              {truckNo && (
                                <div style={{
                                  background: '#f4f6f9', border: '1px solid #e2e6ed',
                                  borderRadius: '7px', padding: '8px 10px', marginTop: '6px',
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                }}>
                                  <span style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: '13px', fontWeight: 600, color: '#1a4fa0',
                                  }}>
                                    {truckNo}
                                  </span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); if (selectedJob) { setEditingTruck(selectedJob.id); setTruckInputs(prev => ({ ...prev, [selectedJob.id]: truckNo })) } }}
                                    style={{
                                      fontSize: '11px', color: '#8a96a8',
                                      border: '1px solid #e2e6ed', borderRadius: '5px',
                                      padding: '3px 8px', background: '#fff', cursor: 'pointer',
                                    }}
                                  >
                                    ✎ Edit
                                  </button>
                                </div>
                              )}
                              {/* Truck edit input */}
                              {editingTruck === selectedJob?.id && (
                                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                  <input
                                    value={truckInputs[selectedJob?.id] || ''}
                                    onChange={e => setTruckInputs(prev => ({ ...prev, [selectedJob.id]: e.target.value.toUpperCase() }))}
                                    placeholder="Enter truck number"
                                    style={{
                                      flex: 1, height: '32px', padding: '0 8px',
                                      fontSize: '12px', fontFamily: "'JetBrains Mono', monospace",
                                      border: '1px solid #e2e6ed', borderRadius: '6px',
                                      outline: 'none', background: '#fff',
                                    }}
                                  />
                                  <button
                                    onClick={async () => {
                                      await saveTruckNumber(selectedJob, truckInputs[selectedJob?.id])
                                      setEditingTruck(null)
                                    }}
                                    disabled={savingTruck[selectedJob?.id] || !truckInputs[selectedJob?.id]}
                                    style={{
                                      height: '32px', padding: '0 12px',
                                      fontSize: '11px', fontWeight: 500,
                                      borderRadius: '6px', border: 'none',
                                      background: savingTruck[selectedJob?.id] ? '#8a96a8' : '#1a4fa0',
                                      color: '#fff', cursor: 'pointer',
                                    }}
                                  >
                                    {savingTruck[selectedJob?.id] ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    }
                    if (step.id === 'delivered') return null
                    if (step.id === 'transit') return null
                    return (
                      <div key={step.id} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 0',
                      }}>
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, fontSize: '10px',
                          background: step.done ? '#dcfce7' : step.current ? '#e8eef8' : '#f4f6f9',
                          border: step.done ? '1.5px solid #86efac' : step.current ? '2px solid #1a4fa0' : '1.5px solid #e2e6ed',
                          color: step.done ? '#15803d' : step.current ? '#1a4fa0' : '#d0d6e0',
                        }}>
                          {step.done ? '✓' : step.current ? <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1a4fa0' }} /> : <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#d0d6e0' }} />}
                        </div>
                        <div>
                          <div style={{
                            fontSize: '13px', fontWeight: 500,
                            color: step.done ? '#15803d' : step.current ? '#1a4fa0' : '#8a96a8',
                          }}>
                            {step.label}
                          </div>
                          {step.detail && (
                            <div style={{
                              fontSize: '11px', color: step.done ? '#15803d' : '#8a96a8',
                              fontFamily: "'JetBrains Mono', monospace", opacity: 0.85, marginTop: '1px',
                            }}>
                              {step.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Mark as delivered button */}
                {(() => {
                  const deliveredStep = steps.find(s => s.id === 'delivered')
                  const truckStep = steps.find(s => s.id === 'truck')
                  if (deliveredStep?.done) {
                    return (
                      <div style={{
                        marginTop: '8px',
                        background: '#dcfce7', border: '1px solid #86efac',
                        borderRadius: '8px', padding: '10px',
                        fontSize: '13px', fontWeight: 600, color: '#15803d',
                        textAlign: 'center',
                      }}>
                        ✓ Delivered
                      </div>
                    )
                  }
                  if (truckStep?.done) {
                    return (
                      <button
                        onClick={() => markDelivered(selectedJob)}
                        style={{
                          width: '100%', marginTop: '8px', padding: '10px',
                          borderRadius: '8px', background: '#dcfce7',
                          border: '1px solid #86efac', color: '#15803d',
                          fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        }}
                      >
                        ✓ Mark as delivered
                      </button>
                    )
                  }
                  return null
                })()}
              </div>

              <div style={{ borderTop: '1px solid #e2e6ed' }} />

              {/* Section 4 — Truck entered by */}
              {truckNo && (() => {
                const truckLog = ulip?.truckLog
                const name = truckLog?.enteredBy || currentUserName || 'Field worker'
                const ts = truckLog?.timestamp
                return (
                  <div>
                    <div style={{
                      fontSize: '10px', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      color: '#8a96a8', marginBottom: '6px',
                    }}>
                      Truck entered by
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: '#e8eef8', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: 600, color: '#1a4fa0', flexShrink: 0,
                      }}>
                        {getInitials(name)}
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#1a2233', fontWeight: 500 }}>
                          {name}
                        </div>
                        {ts && (
                          <div style={{ fontSize: '11px', color: '#8a96a8' }}>
                            {new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            {' · '}
                            {new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Section 5 — Toll Crossings */}
              {truckNo && (
                <div>
                  <div style={{ borderTop: '1px solid #e2e6ed', marginBottom: '12px' }} />
                  <div style={{
                    fontSize: '10px', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    color: '#8a96a8', marginBottom: '8px',
                  }}>
                    Toll crossings
                  </div>
                  {toll.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#8a96a8' }}>
                      {truckNo ? 'No crossings in last 72h' : 'Enter truck number to track'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {toll.slice(0, 5).map((t, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <div style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            marginTop: '4px', flexShrink: 0,
                            background: i === 0 ? '#1a4fa0' : '#d0d6e0',
                          }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '12px', color: '#1a2233', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.tollPlazaName || 'Unknown plaza'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#8a96a8' }}>
                              {t.readTime ? new Date(t.readTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                              {t.laneDirection ? ` · ${t.laneDirection}` : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                      {toll[0] && selectedJob?.destination && (
                        <div style={{
                          background: '#f4f6f9', border: '1px solid #e2e6ed',
                          borderRadius: '7px', padding: '8px 10px', marginTop: '2px',
                        }}>
                          <div style={{ fontSize: '12px', color: '#8a96a8' }}>
                            📍 Last seen {toll[0].tollPlazaName || 'last toll'} · heading to {selectedJob.destination} · ~85 km remaining
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
