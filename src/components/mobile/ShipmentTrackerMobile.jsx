import { useState } from 'react'

const STATUS_COLORS = {
  green: { border: 'border-l-green-500', badge: 'bg-green-50 text-green-700 border border-green-200' },
  blue:  { border: 'border-l-[#1a4fa0]', badge: 'bg-[#e8eef8] text-[#1a4fa0] border border-[#c3d4f0]' },
  amber: { border: 'border-l-amber-500', badge: 'bg-amber-50 text-amber-700 border border-amber-200' },
  gray:  { border: 'border-l-gray-300',  badge: 'bg-gray-50 text-gray-500 border border-gray-200' },
}

export default function ShipmentTrackerMobile({
  jobs, currentUserName, showToast,
  search, setSearch, selectedJob, setSelectedJob,
  ulipData, loadingUlip, truckInputs, setTruckInputs,
  savingTruck, saveTruckNumber, markDelivered,
  loadUlipData, getJourneySteps, getJobStatus,
}) {
  const [screen, setScreen] = useState('list') // 'list' | 'journey' | 'truck'
  const [editingTruck, setEditingTruck] = useState(false)

  const ulip = selectedJob ? (ulipData[selectedJob.id] || {}) : {}
  const steps = selectedJob ? getJourneySteps(selectedJob, ulip) : []
  const toll = ulip?.fastagStatus?.tollCrossings || []
  const truckNo = selectedJob?.truck_no || truckInputs[selectedJob?.id] || ulip?.beStatus?.vehicleNumbers?.[0]
  const oocGranted = steps.find(s => s.id === 'ooc')?.done

  const openJob = (job) => {
    setSelectedJob(job)
    loadUlipData(job)
    setScreen('journey')
  }

  const goBack = () => {
    if (screen === 'truck') { setScreen('journey'); return }
    setSelectedJob(null)
    setScreen('list')
  }

  // SCREEN 1 — Job list
  if (screen === 'list') return (
    <div className="flex flex-col min-h-screen bg-[#f4f6f9]">
      {/* Header */}
      <div className="bg-white border-b border-[#e2e6ed] px-4 py-3">
        <div className="text-[15px] font-semibold text-[#1a2233]">Shipment Tracker</div>
        <div className="text-xs text-[#8a96a8] mt-0.5">{jobs.length} active jobs today</div>
      </div>
      {/* Search */}
      <div className="px-4 py-2.5 bg-white border-b border-[#e2e6ed]">
        <div className="flex items-center gap-2 bg-[#f4f6f9] border border-[#e2e6ed] rounded-lg px-3 py-2">
          <span className="text-[#8a96a8] text-sm">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Job no., container, BE, client..."
            className="text-sm outline-none bg-transparent text-[#1a2233] placeholder-[#8a96a8] flex-1"
          />
        </div>
      </div>
      {/* Job cards */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {jobs.length === 0 && (
          <div className="text-center text-sm text-[#8a96a8] py-10">No jobs found</div>
        )}
        {jobs.map(job => {
          const status = getJobStatus(job, ulipData[job.id] || {})
          const sc = STATUS_COLORS[status.color]
          return (
            <div
              key={job.id}
              onClick={() => openJob(job)}
              className={`bg-white border border-[#e2e6ed] border-l-4 ${sc.border} rounded-xl p-3.5 active:bg-[#f4f6f9]`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-[13px] font-semibold text-[#1a4fa0] font-mono">{job.job_no}</div>
                  <div className="text-[12px] text-[#1a2233] mt-0.5">{job.client}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${sc.badge}`}>{status.label}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-[#8a96a8] font-mono">{job.containers?.split(/[\s,;/]+/)[0]}</div>
                {(job.truck_no || truckInputs[job.id]) && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">🚛</span>
                    <span className="text-[10px] text-[#1a4fa0] font-mono">{job.truck_no || truckInputs[job.id]}</span>
                  </div>
                )}
                <span className="text-[#8a96a8] text-xs">›</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  // SCREEN 2 — Journey
  if (screen === 'journey') return (
    <div className="flex flex-col min-h-screen bg-[#f4f6f9]">
      {/* Header */}
      <div className="bg-white border-b border-[#e2e6ed] px-4 py-3 flex items-center gap-3">
        <button onClick={goBack} className="w-8 h-8 rounded-full bg-[#f4f6f9] flex items-center justify-center text-[#4a5568]">‹</button>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-[#1a2233] font-mono truncate">{selectedJob?.job_no}</div>
          <div className="text-[11px] text-[#8a96a8] truncate">{selectedJob?.client} · {selectedJob?.mode}</div>
        </div>
        <button onClick={() => loadUlipData(selectedJob)} className="text-[#8a96a8] text-lg">↻</button>
      </div>

      {loadingUlip && (
        <div className="flex items-center justify-center gap-2 py-2 bg-[#e8eef8] text-xs text-[#1a4fa0]">
          <div className="h-3 w-3 border border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
          Loading ULIP data...
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#8a96a8] mb-3">Shipment journey</div>
        <div className="flex flex-col">
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1
            const isTruckStep = step.id === 'truck'

            return (
              <div key={step.id} className="flex gap-3 items-stretch">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    step.done ? 'bg-green-50 border-[1.5px] border-green-400' :
                    step.current ? 'bg-[#e8eef8] border-2 border-[#1a4fa0]' :
                    'bg-white border-[1.5px] border-[#e2e6ed]'
                  }`}>
                    {step.done ? <span className="text-green-600 text-xs">✓</span> :
                     step.current ? <div className="w-2 h-2 rounded-full bg-[#1a4fa0]" /> :
                     <div className="w-1.5 h-1.5 rounded-full bg-[#d0d6e0]" />}
                  </div>
                  {!isLast && <div className={`w-px flex-1 my-1 ${step.done ? 'bg-green-300' : 'bg-[#e2e6ed]'}`} style={{ minHeight: '20px' }} />}
                </div>

                <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                  <div className={`text-[13px] font-medium ${step.done ? 'text-green-700' : step.current ? 'text-[#1a4fa0]' : 'text-[#8a96a8]'}`}>{step.label}</div>
                  {step.detail && <div className="text-[11px] text-[#4a5568] mt-0.5 font-mono">{step.detail}</div>}
                  {step.sub && <div className="text-[11px] text-[#8a96a8] mt-0.5">{step.sub}</div>}

                  {/* OOC banner */}
                  {step.id === 'ooc' && step.done && (
                    <div className="mt-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <div className="text-[12px] font-medium text-green-700">✓ Cleared for delivery</div>
                    </div>
                  )}

                  {/* Truck input — mobile */}
                  {isTruckStep && oocGranted && (
                    <div className="mt-2">
                      {(editingTruck || !truckNo) ? (
                        <div className="flex gap-2">
                          <input
                            value={truckInputs[selectedJob?.id] || ''}
                            onChange={e => setTruckInputs(prev => ({ ...prev, [selectedJob.id]: e.target.value.toUpperCase() }))}
                            placeholder="Enter truck number"
                            className="flex-1 h-9 px-3 text-sm font-mono border border-[#e2e6ed] rounded-lg outline-none focus:border-[#1a4fa0] bg-white"
                          />
                          <button
                            onClick={async () => {
                              await saveTruckNumber(selectedJob, truckInputs[selectedJob.id])
                              setEditingTruck(false)
                            }}
                            disabled={savingTruck[selectedJob?.id] || !truckInputs[selectedJob?.id]}
                            className="h-9 px-4 text-sm rounded-lg bg-[#1a4fa0] text-white font-medium disabled:opacity-50"
                          >
                            {savingTruck[selectedJob?.id] ? '...' : 'Save'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-white border border-[#e2e6ed] rounded-lg px-3 py-2">
                          <span>🚛</span>
                          <span className="text-sm font-mono font-medium text-[#1a4fa0]">{truckNo}</span>
                          <button
                            onClick={() => { setEditingTruck(true); setTruckInputs(prev => ({ ...prev, [selectedJob.id]: truckNo })) }}
                            className="ml-auto text-xs text-[#8a96a8] hover:text-[#1a4fa0]"
                          >✎ Edit</button>
                        </div>
                      )}
                      {truckNo && !editingTruck && (
                        <button
                          onClick={() => setScreen('truck')}
                          className="mt-2 w-full h-9 text-sm rounded-lg bg-[#e8eef8] text-[#1a4fa0] font-medium border border-[#c3d4f0]"
                        >
                          📍 Track truck location →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Mark delivered */}
                  {step.id === 'delivered' && !step.done && steps.find(s => s.id === 'truck')?.done && (
                    <button
                      onClick={() => markDelivered(selectedJob)}
                      className="mt-2 w-full h-9 text-sm rounded-lg bg-green-50 border border-green-300 text-green-700 font-medium"
                    >
                      ✓ Mark as delivered
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  // SCREEN 3 — Truck tracking
  return (
    <div className="flex flex-col min-h-screen bg-[#f4f6f9]">
      {/* Header */}
      <div className="bg-white border-b border-[#e2e6ed] px-4 py-3 flex items-center gap-3">
        <button onClick={goBack} className="w-8 h-8 rounded-full bg-[#f4f6f9] flex items-center justify-center text-[#4a5568]">‹</button>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[#1a2233] font-mono">{truckNo}</div>
          <div className="text-[11px] text-[#8a96a8] truncate">{selectedJob?.job_no} · {selectedJob?.containers?.split(/[\s,;/]+/)[0]}</div>
        </div>
        <button onClick={() => loadUlipData(selectedJob)} className="text-[#8a96a8] text-lg">↻</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">

        {/* Status banner */}
        <div className="bg-[#e8eef8] border border-[#c3d4f0] rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#1a4fa0] flex-shrink-0" />
          <div>
            <div className="text-[13px] font-semibold text-[#1a4fa0]">Truck in transit</div>
            <div className="text-[11px] text-[#1a4fa0] opacity-80 mt-0.5">
              {toll[0] ? `Last toll: ${toll[0].tollPlazaName} · ${new Date(toll[0].readTime).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}` : 'No crossings yet'}
            </div>
          </div>
        </div>

        {/* Toll crossings */}
        <div className="bg-white border border-[#e2e6ed] rounded-xl p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#8a96a8] mb-3">Toll crossings (FASTAG)</div>
          {toll.length === 0 ? (
            <div className="text-sm text-[#8a96a8] text-center py-4">No crossings in the last 72 hours</div>
          ) : (
            <div className="flex flex-col gap-3">
              {toll.map((t, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${i === 0 ? 'bg-[#1a4fa0]' : 'bg-[#d0d6e0]'}`} />
                    {i < toll.length - 1 && <div className="w-px h-5 bg-[#e2e6ed] mt-1" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div className="text-[13px] font-medium text-[#1a2233]">{t.tollPlazaName || 'Unknown plaza'}</div>
                      <div className="text-[11px] text-[#8a96a8]">{t.readTime ? new Date(t.readTime).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : '—'}</div>
                    </div>
                    <div className="text-[11px] text-[#8a96a8] mt-0.5">{t.laneDirection || '—'} · {t.vehicleType || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Distance / destination */}
        {selectedJob?.destination && (
          <div className="bg-white border border-[#e2e6ed] rounded-xl px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#8a96a8] mb-1">Destination</div>
            <div className="text-[13px] font-medium text-[#1a2233]">{selectedJob.destination} warehouse</div>
            {toll[0] && <div className="text-[11px] text-[#8a96a8] mt-0.5">Last seen {toll[0].tollPlazaName} · heading to {selectedJob.destination}</div>}
          </div>
        )}

        {/* FASTAG note */}
        <div className="bg-[#f4f6f9] border border-[#e2e6ed] rounded-lg px-3 py-2">
          <div className="text-[11px] text-[#8a96a8]">FASTAG data available for last 72 hours only. Vehicle: <span className="font-mono">{truckNo}</span></div>
        </div>

        {/* Mark delivered */}
        {!steps.find(s => s.id === 'delivered')?.done && (
          <button
            onClick={() => { markDelivered(selectedJob); setScreen('list') }}
            className="w-full h-11 text-sm rounded-xl bg-green-50 border border-green-300 text-green-700 font-semibold"
          >
            ✓ Mark as delivered
          </button>
        )}

      </div>
    </div>
  )
}