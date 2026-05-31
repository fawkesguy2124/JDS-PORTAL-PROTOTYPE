import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { updateContainerStatus, addMilestone, checkContainerStatus } from '../services/trackingService'

function formatContainerDate(ts) {
  if (!ts) return '\u2014'
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function JobDetailPanel({ job, trackingData, onClose, onUpdate, onAddEvent, showToast, activeContainer }) {
  const scrollBodyRef = useRef(null)

  useEffect(() => {
    if (!activeContainer || !scrollBodyRef.current) return
    const timer = setTimeout(() => {
      const el = scrollBodyRef.current.querySelector(`[data-cn="${activeContainer}"]`)
      if (el) {
        el.scrollIntoView({ behavior:'smooth', block:'start' })
        el.style.transition = 'background 0.3s'
        el.style.background = '#eff6ff'
        setTimeout(() => { el.style.background = '' }, 1200)
      }
    }, 80)
    return () => clearTimeout(timer)
  }, [activeContainer])
  const cnList = (job.containers || '')
    .split(/[\s,;/]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length >= 4)

  const formatD  = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '\u2014'
  const formatDT = (d) => d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '\u2014'

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
    if (freeDays != null && freeDays <= 2) return '#dc2626'
    if (['delivered','arrived','at_cfs','on_rail'].includes(status)) return '#16a34a'
    if (['customs_hold','delayed'].includes(status)) return '#dc2626'
    return '#f59e0b'
  }

  const priorityBadge = job.priority === 'urgent'
    ? { label:'URGENT', bg:'#fef2f2', color:'#991b1b', border:'#fecaca' }
    : job.priority === 'high'
    ? { label:'HIGH',   bg:'#fffbeb', color:'#92400e', border:'#fde68a' }
    : null

  return (
    <>
      <div
        onClick={onClose}
        style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:199, cursor:'pointer' }}
      />

      <div style={{
        position:'fixed', right:0, top:0, bottom:0, width:'min(520px, 100vw)',
        background:'white', borderLeft:'1.5px solid #e2e6ed',
        zIndex:200, display:'flex', flexDirection:'column',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.12)',
        animation:'slideInRight 0.25s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <style>{`@keyframes slideInRight { from { transform:translateX(100%) } to { transform:translateX(0) } }`}</style>

        <div style={{ padding:'18px 22px', borderBottom:'1.5px solid #e2e6ed', background:'#f8f9fb', display:'flex', alignItems:'flex-start', gap:'14px', flexShrink:0 }}>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background:'white', border:'1.5px solid #e2e6ed', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:'14px', color:'#4a5568', flexShrink:0 }}
            onMouseEnter={e => { e.currentTarget.style.background='#fef2f2'; e.currentTarget.style.color='#dc2626' }}
            onMouseLeave={e => { e.currentTarget.style.background='white'; e.currentTarget.style.color='#4a5568' }}
          >✕</button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
              <span style={{ fontSize:'16px', fontWeight:700, color:'#1a2233', fontFamily:"'JetBrains Mono',monospace" }}>{job.job_no}</span>
              {priorityBadge && (
                <span style={{ borderRadius:'9999px', padding:'2px 8px', fontSize:'11px', fontWeight:700, background:priorityBadge.bg, color:priorityBadge.color, border:`1px solid ${priorityBadge.border}` }}>
                  {priorityBadge.label}
                </span>
              )}
              {job.mode && (
                <span style={{ borderRadius:'9999px', padding:'2px 8px', fontSize:'11px', fontWeight:600, background:'#eff6ff', color:'#1e40af', border:'1px solid #bfdbfe' }}>
                  {job.mode}
                </span>
              )}
            </div>
            <div style={{ fontSize:'13px', color:'#4a5568', marginTop:'3px' }}>
              {job.client}{job.shipping_line ? ` · ${job.shipping_line}` : ''} · {cnList.length} container{cnList.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div ref={scrollBodyRef} style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
          {cnList.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:'#8a96a8', fontSize:'14px' }}>
              No container numbers found for this job.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              {cnList.map((cn, idx) => {
                const td     = trackingData[cn] || {}
                const status = td.status || 'in_transit'
                const st     = STATUS_STYLES_MAP[status] || STATUS_STYLES_MAP['in_transit']
                const pct    = statusProgress(status)
                const pColor = progressColor(status, td.freeDays)
                const isDetention = td.freeDays != null && td.freeDays <= 2

                return (
                  <div key={cn} data-cn={cn} style={{ border:'1.5px solid #e2e6ed', borderRadius:'12px', overflow:'hidden', borderTop:`3px solid ${pColor}`, outline: activeContainer === cn ? '2px solid #185FA5' : 'none', outlineOffset:'2px' }}>

                    <div style={{ padding:'12px 16px', background:'#f8f9fb', borderBottom:'1px solid #e2e6ed', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'14px', fontWeight:700, color:'#1a2233' }}>{cn}</span>
                        <span style={{ borderRadius:'9999px', padding:'2px 10px', fontSize:'11px', fontWeight:700, background: isDetention ? '#fef2f2' : st.bg, color: isDetention ? '#991b1b' : st.color, border:`1px solid ${isDetention ? '#fecaca' : st.border}` }}>
                          {isDetention ? '⚠ Detention Risk' : (td.statusText || 'Not Updated')}
                        </span>
                      </div>
                      <span style={{ fontSize:'11px', color:'#8a96a8' }}>#{idx + 1} of {cnList.length}</span>
                    </div>

                    <div style={{ padding:'10px 16px', borderBottom:'1px solid #e2e6ed', background:'white' }}>
                      <div style={{ height:'5px', background:'#f4f6f9', border:'1px solid #e2e6ed', borderRadius:'6px', overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:'6px', width:`${pct}%`, background:pColor }} />
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'#8a96a8', marginTop:'3px' }}>
                        <span>Loaded</span>
                        <span style={{ color:pColor, fontWeight:600 }}>{pct}% complete</span>
                        <span>Discharged</span>
                      </div>
                    </div>

                    <div style={{ padding:'14px 16px', background:'white' }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
                        {[
                          { label:'Current Location', value: td.currentLocation },
                          { label:'Vessel',           value: td.vessel || job.vessel },
                          { label:'Vessel Arrival',   value: formatD(td.eta || job.eta) },
                          { label:'Port In',          value: td.portIn },
                          { label:'Port Out',         value: td.portOut },
                          { label:'CFS Gate In',      value: td.cfsGateIn },
                          { label:'Free Days Left',   value: td.freeDays != null ? `${td.freeDays} days${td.freeDays <= 2 ? ' ⚠' : ''}` : '\u2014',
                            color: td.freeDays != null && td.freeDays <= 2 ? '#dc2626' : td.freeDays != null && td.freeDays <= 5 ? '#b45309' : '#1a2233' },
                          { label:'Last Update',      value: formatDT(td.lastUpdate) },
                        ].map(f => (
                          <div key={f.label}>
                            <div style={{ fontSize:'10px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:'#8a96a8', marginBottom:'3px' }}>
                              {f.label}
                            </div>
                            <div style={{ fontSize:'13px', fontWeight:500, color: f.color || (f.value ? '#1a2233' : '#d0d6e0') }}>
                              {f.value || '\u2014'}
                            </div>
                          </div>
                        ))}
                      </div>

                      {td.notes && (
                        <div style={{ marginBottom:'12px', padding:'8px 10px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'7px', fontSize:'12px', color:'#92400e' }}>
                          📝 {td.notes}
                        </div>
                      )}

                      {td.milestones?.length > 0 && (
                        <div style={{ marginBottom:'12px' }}>
                          <div style={{ fontSize:'10px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:'#8a96a8', marginBottom:'8px' }}>
                            Event History
                          </div>
                          {td.milestones.map((m, i) => (
                            <div key={i} style={{ display:'flex', gap:'10px', alignItems:'flex-start', marginBottom:'6px' }}>
                              <div style={{ width:'8px', height:'8px', borderRadius:'50%', flexShrink:0, marginTop:'4px', background: i === 0 ? '#1a4fa0' : '#d0d6e0' }} />
                              <div>
                                <div style={{ fontSize:'12px', fontWeight:600, color:'#1a2233' }}>{m.description}</div>
                                <div style={{ fontSize:'11px', color:'#8a96a8', marginTop:'1px' }}>
                                  {m.location && `${m.location} · `}
                                  {m.date ? new Date(m.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : ''}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ display:'flex', gap:'8px' }}>
                        <button
                          onClick={() => onUpdate(job, cn)}
                          style={{ flex:1, padding:'8px 0', background:'#e8eef8', border:'1.5px solid #bfdbfe', color:'#1a4fa0', borderRadius:'8px', fontSize:'12px', fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif' }}
                          onMouseEnter={e => { e.currentTarget.style.background='#1a4fa0'; e.currentTarget.style.color='white' }}
                          onMouseLeave={e => { e.currentTarget.style.background='#e8eef8'; e.currentTarget.style.color='#1a4fa0' }}
                        >
                          Update Status
                        </button>
                        <button
                          onClick={() => onAddEvent(job, cn)}
                          style={{ flex:1, padding:'8px 0', background:'#f8f9fb', border:'1.5px solid #e2e6ed', color:'#4a5568', borderRadius:'8px', fontSize:'12px', fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor='#1a4fa0'; e.currentTarget.style.color='#1a4fa0' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor='#e2e6ed'; e.currentTarget.style.color='#4a5568' }}
                        >
                          + Add Event
                        </button>
                        <button
                          onClick={() => openCarrierTracking(cn, job.shipping_line, showToast)}
                          style={{ flex:1, padding:'8px 0', background:'#f8f9fb', border:'1.5px solid #e2e6ed', color:'#4a5568', borderRadius:'8px', fontSize:'12px', fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor='#1a4fa0'; e.currentTarget.style.color='#1a4fa0' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor='#e2e6ed'; e.currentTarget.style.color='#4a5568' }}
                        >
                          🌐 Carrier Site
                        </button>
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

function UpdateStatusModal({ container, statusOptions, onClose, onSaved, showToast }) {
  const [fields, setFields] = useState({
    status: container.status || 'in_transit',
    statusText: container.statusText || '',
    currentLocation: container.currentLocation || '',
    vessel: container.vessel || '',
    eta: container.eta || '',
    freeDays: container.freeDays ?? '',
    portIn: container.portIn || '',
    portOut: container.portOut || '',
    cfsGateIn: container.cfsGateIn || '',
    notes: container.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateContainerStatus(container.containerNo, fields)
      showToast?.('Status updated successfully', 'success')
      onSaved()
    } catch (e) {
      showToast?.('Failed to update status', 'error')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = {
    width:'100%', padding:'8px 10px', border:'1.5px solid #e2e6ed', borderRadius:'7px',
    fontSize:'13px', color:'#1a2233', outline:'none', boxSizing:'border-box',
    fontFamily:'Inter,sans-serif',
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:299, cursor:'pointer' }}
      />
      <div style={{
        position:'fixed', right:0, top:0, bottom:0, width:'min(480px, 100vw)',
        background:'white', borderLeft:'1.5px solid #e2e6ed',
        zIndex:300, display:'flex', flexDirection:'column',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.12)',
      }}>
        <div style={{ padding:'16px 20px', borderBottom:'1.5px solid #e2e6ed', background:'#f8f9fb', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:'15px', fontWeight:700, color:'#1a2233' }}>Update Status</span>
          <button onClick={onClose} style={{ width:'28px', height:'28px', borderRadius:'7px', background:'white', border:'1.5px solid #e2e6ed', cursor:'pointer', fontSize:'13px', display:'flex', alignItems:'center', justifyContent:'center', color:'#4a5568' }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Container Number</label>
            <input style={{ ...fieldStyle, background:'#f4f6f9', color:'#8a96a8' }} value={container.containerNo} readOnly />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Carrier</label>
            <input style={{ ...fieldStyle, background:'#f4f6f9', color:'#8a96a8' }} value={container.carrier || ''} readOnly />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Status</label>
            <select
              value={fields.status}
              onChange={e => setFields(prev => ({ ...prev, status: e.target.value }))}
              style={fieldStyle}
            >
              {statusOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Status Text</label>
            <input
              value={fields.statusText}
              onChange={e => setFields(prev => ({ ...prev, statusText: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. In Transit"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Current Location</label>
            <input
              value={fields.currentLocation}
              onChange={e => setFields(prev => ({ ...prev, currentLocation: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. JNPT, Navi Mumbai"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Vessel</label>
            <input
              value={fields.vessel}
              onChange={e => setFields(prev => ({ ...prev, vessel: e.target.value }))}
              style={fieldStyle}
              placeholder="Vessel name"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>ETA Date</label>
            <input
              type="date"
              value={fields.eta}
              onChange={e => setFields(prev => ({ ...prev, eta: e.target.value }))}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Free Days</label>
            <input
              type="number"
              value={fields.freeDays}
              onChange={e => setFields(prev => ({ ...prev, freeDays: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. 7"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Port In</label>
            <input
              value={fields.portIn}
              onChange={e => setFields(prev => ({ ...prev, portIn: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. Nhava Sheva"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Port Out</label>
            <input
              value={fields.portOut}
              onChange={e => setFields(prev => ({ ...prev, portOut: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. JNPT"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>CFS Gate In</label>
            <input
              value={fields.cfsGateIn}
              onChange={e => setFields(prev => ({ ...prev, cfsGateIn: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. CFS Nhava Sheva"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Notes</label>
            <textarea
              value={fields.notes}
              onChange={e => setFields(prev => ({ ...prev, notes: e.target.value }))}
              style={{ ...fieldStyle, minHeight:'72px', resize:'vertical' }}
              placeholder="Optional notes..."
            />
          </div>
        </div>

        <div style={{ padding:'14px 20px', borderTop:'1.5px solid #e2e6ed', display:'flex', gap:'10px', justifyContent:'flex-end' }}>
          <button onClick={onClose}
            style={{ padding:'8px 20px', borderRadius:'8px', border:'1.5px solid #e2e6ed', background:'white', color:'#4a5568', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding:'8px 20px', borderRadius:'8px', border:'none', background: saving ? '#8a96a8' : '#1a4fa0', color:'white', fontSize:'13px', fontWeight:600, cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}

function AddMilestoneModal({ container, onClose, onSaved, showToast }) {
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  const quickEvents = [
    'Vessel Arrived', 'Gate In', 'Customs Hold',
    'CFS Received', 'Delivery Scheduled', 'Empty Returned',
  ]

  const handleAdd = async () => {
    if (!description.trim()) {
      showToast?.('Please enter a description', 'warning')
      return
    }
    setSaving(true)
    try {
      await addMilestone(container.containerNo, {
        description: description.trim(),
        location: location.trim(),
        date: date || new Date().toISOString().slice(0, 10),
      })
      showToast?.('Milestone added successfully', 'success')
      onSaved()
    } catch (e) {
      showToast?.('Failed to add milestone', 'error')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = {
    width:'100%', padding:'8px 10px', border:'1.5px solid #e2e6ed', borderRadius:'7px',
    fontSize:'13px', color:'#1a2233', outline:'none', boxSizing:'border-box',
    fontFamily:'Inter,sans-serif',
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:299, cursor:'pointer' }}
      />
      <div style={{
        position:'fixed', right:0, top:0, bottom:0, width:'min(480px, 100vw)',
        background:'white', borderLeft:'1.5px solid #e2e6ed',
        zIndex:300, display:'flex', flexDirection:'column',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.12)',
      }}>
        <div style={{ padding:'16px 20px', borderBottom:'1.5px solid #e2e6ed', background:'#f8f9fb', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:'15px', fontWeight:700, color:'#1a2233' }}>Add Milestone</span>
          <button onClick={onClose} style={{ width:'28px', height:'28px', borderRadius:'7px', background:'white', border:'1.5px solid #e2e6ed', cursor:'pointer', fontSize:'13px', display:'flex', alignItems:'center', justifyContent:'center', color:'#4a5568' }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Container Number</label>
            <input style={{ ...fieldStyle, background:'#f4f6f9', color:'#8a96a8' }} value={container.containerNo} readOnly />
          </div>

          {container.milestones?.length > 0 && (
            <div>
              <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'6px' }}>Existing Milestones</label>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {container.milestones.map((m, i) => (
                  <div key={i} style={{ padding:'6px 10px', background:'#f8f9fb', border:'1px solid #e2e6ed', borderRadius:'6px', fontSize:'12px' }}>
                    <div style={{ fontWeight:600, color:'#1a2233' }}>{m.description}</div>
                    <div style={{ color:'#8a96a8', fontSize:'11px' }}>
                      {m.location && `${m.location} · `}
                      {m.date ? new Date(m.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'6px' }}>Quick Events</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {quickEvents.map(ev => (
                <button
                  key={ev}
                  onClick={() => setDescription(ev)}
                  style={{
                    padding:'5px 12px', borderRadius:'9999px', border:'1.5px solid #bfdbfe',
                    background: description === ev ? '#1a4fa0' : '#eff6ff',
                    color: description === ev ? 'white' : '#1e40af',
                    fontSize:'11px', fontWeight:600, cursor:'pointer',
                    fontFamily:'Inter,sans-serif',
                  }}
                >
                  {ev}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={fieldStyle}
              placeholder="Milestone description"
            />
          </div>

          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Location</label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              style={fieldStyle}
              placeholder="e.g. JNPT, Navi Mumbai"
            />
          </div>

          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={fieldStyle}
            />
          </div>
        </div>

        <div style={{ padding:'14px 20px', borderTop:'1.5px solid #e2e6ed', display:'flex', gap:'10px', justifyContent:'flex-end' }}>
          <button onClick={onClose}
            style={{ padding:'8px 20px', borderRadius:'8px', border:'1.5px solid #e2e6ed', background:'white', color:'#4a5568', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={handleAdd} disabled={saving || !description.trim()}
            style={{ padding:'8px 20px', borderRadius:'8px', border:'none', background: (saving || !description.trim()) ? '#8a96a8' : '#1a4fa0', color:'white', fontSize:'13px', fontWeight:600, cursor: (saving || !description.trim()) ? 'default' : 'pointer' }}>
            {saving ? 'Adding...' : 'Add Milestone'}
          </button>
        </div>
      </div>
    </>
  )
}

function ContainerTimeline({ container, onClose }) {
  if (!container) return null
  return (
    <div className="border-t border-[#e2e6ed] bg-white px-4 sm:px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-[#1a2233]">Milestones &mdash; {container.containerNo}</div>
        <button type="button" onClick={onClose}
          className="text-xs font-semibold text-blue-700 hover:text-blue-800">Close</button>
      </div>
      {container.milestones.length === 0 ? (
        <p className="text-xs text-[#8a96a8] py-4 text-center">No milestone data available.</p>
      ) : (
        <div className="relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-[#e2e6ed]" />
          <div className="space-y-3">
            {container.milestones.map((m, i) => (
              <div key={i} className="flex items-start gap-3 relative">
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 z-10 ${
                  i === container.milestones.length - 1
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-white border-[#d0d6e0]'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#1a2233]">{m.description}</p>
                  <p className="text-xs text-[#8a96a8]">
                    {m.location} &middot; {formatContainerDate(m.date)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const AUTO_FILL_CARRIERS = [
  'one', 'evergreen', 'zim', 'yang ming', 'yangming',
  'hmm', 'cosco', 'oocl', 'wan hai', 'wanhai', 'pil', 'sinokor',
]

function getCarrierUrl(containerNo, shippingLine) {
  const cn = (containerNo || '').trim().toUpperCase()
  const sl = (shippingLine || '').toLowerCase().trim()

  if (sl.includes('msc'))
    return `https://www.msc.com/en/track-a-shipment?agencyPath=msc&Type=Container&Information=${cn}`
  if (sl.includes('maersk'))
    return `https://www.maersk.com/tracking/${cn}`
  if (sl.includes('hapag'))
    return `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${cn}`
  if (sl.includes('cma'))
    return `https://www.cma-cgm.com/ebusiness/tracking/search?SearchViewModel.SearchBy=Container&SearchViewModel.Reference=${cn}`
  if (sl.includes('one'))
    return `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?ctrack-field=${cn}&trakNoParam=${cn}`
  if (sl.includes('evergreen'))
    return `https://www.evergreen-line.com/servlet/TDB1_CargoTracking.do?TYPE=CNTR&CNTR=${cn}`
  if (sl.includes('zim'))
    return `https://www.zim.com/tools/track-a-shipment?consnumber=${cn}`
  if (sl.includes('yang ming') || sl.includes('yangming'))
    return `https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx?SearchType=CNTR_NO&strSearch=${cn}`
  if (sl.includes('hmm'))
    return `https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp?trackingType=CNTR&trackingNo=${cn}`
  if (sl.includes('cosco'))
    return `https://elines.coscoshipping.com/ebtracking/public/container/searchNo?containerNo=${cn}`
  if (sl.includes('oocl'))
    return `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?ContainerNo=${cn}`
  if (sl.includes('wan hai') || sl.includes('wanhai'))
    return `https://www.wanhai.com/views/cargoTrack/CargoTrack.xhtml?blNo=${cn}`
  if (sl.includes('pil'))
    return `https://www.pilship.com/en-PIL-Container-Tracking/114.html?number=${cn}`
  if (sl.includes('ts line') || sl.includes('tsline'))
    return `https://www.tslines.com/cargo_track?cntr_no=${cn}`
  if (sl.includes('interasia'))
    return `https://www.interasia.com.tw/cargo_trace/cargo_trace.aspx?cntr_no=${cn}`
  if (sl.includes('sinokor'))
    return `https://www.sinokor.co.kr/Tracking?blNo=${cn}`
  if (sl.includes('emirates'))
    return `https://www.emiratesline.com/cargo-tracking?containerNo=${cn}`

  return `https://www.track-trace.com/container#${cn}`
}

function openCarrierTracking(containerNo, shippingLine, showToast) {
  const cn  = (containerNo  || '').trim().toUpperCase()
  const sl  = (shippingLine || '').toLowerCase().trim()
  const url = getCarrierUrl(cn, sl)

  const autoFill = AUTO_FILL_CARRIERS.some(c => sl.includes(c))
  if (!autoFill && cn) {
    copyToClipboard(cn, showToast, shippingLine)
  }

  const width  = Math.min(1200, window.screen.width  * 0.85)
  const height = Math.min(800,  window.screen.height * 0.85)
  const left   = (window.screen.width  - width)  / 2
  const top    = (window.screen.height - height) / 2

  window.open(
    url,
    `carrier_tracking_${cn}`,
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
  )
}

function copyToClipboard(text, showToast, carrierName) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => showToast(`${text} copied — paste it in the ${carrierName || 'carrier'} search box`, 'success'))
      .catch(() => fallbackCopy(text, showToast, carrierName))
  } else {
    fallbackCopy(text, showToast, carrierName)
  }
}

function fallbackCopy(text, showToast, carrierName) {
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (success) {
      showToast(`${text} copied — paste it in the ${carrierName || 'carrier'} search box`, 'success')
    } else {
      showToast(`${text} — type this in the ${carrierName || 'carrier'} search box`, 'info')
    }
  } catch (e) {
    showToast(`${text} — type this in the ${carrierName || 'carrier'} search box`, 'info')
  }
}

function ContainerTrackingSection({ showToast, jobs }) {
  const [trackingData, setTrackingData]         = useState({})
  const [loadingTracking, setLoadingTracking]   = useState(true)
  const [searchQuery, setSearchQuery]           = useState('')
  const [expandedContainers, setExpandedContainers] = useState({})
  const [detailJob, setDetailJob]               = useState(null)
  const [activeContainer, setActiveContainer]   = useState(null) // { jobId, cn }
  const [updateModal, setUpdateModal]           = useState(null)
  const [milestoneModal, setMilestoneModal]     = useState(null)
  const [filterLine, setFilterLine]             = useState('')
  const [filterStatus, setFilterStatus]         = useState('')

  const STATUS_OPTIONS = [
    { value: 'in_transit',     label: 'In Transit'     },
    { value: 'arrived',        label: 'Arrived'        },
    { value: 'at_cfs',         label: 'At CFS'         },
    { value: 'customs_hold',   label: 'Customs Hold'   },
    { value: 'on_rail',        label: 'On Rail'        },
    { value: 'delivered',      label: 'Delivered'      },
    { value: 'empty_returned', label: 'Empty Returned' },
    { value: 'delayed',        label: 'Delayed'        },
  ]

  const carriers = ['Maersk','MSC','Hapag-Lloyd','CMA-CGM','Evergreen','ONE','OOCL','COSCO','ZIM','HMM','Yang Ming','Wan Hai','TS Line','Interasia','Emirates','Akkon','Other']

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

  const refreshTracking = async () => {
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
  }

  const parseContainers = (str) => {
    if (!str || typeof str !== 'string') return []
    return str.split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(s => s.length >= 4)
  }

  // One entry per job that has containers
  const allJobCards = useMemo(() => {
    return (jobs || [])
      .map(job => ({ job, cnList: parseContainers(job.containers) }))
      .filter(({ cnList }) => cnList.length > 0)
  }, [jobs])

  const filteredJobCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return allJobCards.filter(({ job, cnList }) => {
      if (filterLine && job.shipping_line !== filterLine) return false
      if (filterStatus) {
        const anyMatch = cnList.some(cn => (trackingData[cn]?.status || 'in_transit') === filterStatus)
        if (!anyMatch) return false
      }
      if (!q) return true
      return (
        (job.job_no  || '').toLowerCase().includes(q) ||
        (job.client  || '').toLowerCase().includes(q) ||
        (job.bl_no   || '').toLowerCase().includes(q) ||
        cnList.some(cn => cn.toLowerCase().includes(q))
      )
    })
  }, [allJobCards, searchQuery, filterLine, filterStatus, trackingData])

  const totalContainerCount = allJobCards.reduce((s, { cnList }) => s + cnList.length, 0)

  const statusProgress = (status) => {
    if (status === 'delivered' || status === 'empty_returned') return 100
    if (status === 'at_cfs')       return 85
    if (status === 'arrived')      return 75
    if (status === 'customs_hold') return 70
    if (status === 'on_rail')      return 90
    if (status === 'delayed')      return 45
    return 55
  }

  const getProgressColor = (status, freeDays) => {
    if (freeDays != null && freeDays <= 2) return '#dc2626'
    if (['delivered','arrived','at_cfs','on_rail'].includes(status)) return '#16a34a'
    if (['customs_hold','delayed'].includes(status)) return '#dc2626'
    return '#f59e0b'
  }

  const formatD = (d) => d
    ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    : '\u2014'

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

  const ensureTrackingRow = async (job, cn) => {
    if (trackingData[cn]) return
    await supabase.from('container_tracking').upsert({
      container_no:     cn,
      job_no:           job.job_no,
      job_id:           job.id,
      carrier:          job.shipping_line || null,
      status:           'in_transit',
      status_text:      'In Transit',
      vessel:           job.vessel || null,
      eta:              job.eta || null,
      free_days:        job.free_days || null,
      last_update:      new Date().toISOString(),
      milestones:       [],
    }, { onConflict: 'container_no' })
    await refreshTracking()
  }

  const handleOpenUpdate = async (job, cn) => {
    await ensureTrackingRow(job, cn)
    const carrier = job.shipping_line || ''
    const supported = ['MSC','ONE','Evergreen','CMA-CGM','CMA CGM','Hapag-Lloyd','Hapag Lloyd']

    if (supported.some(s => carrier.toLowerCase().includes(s.toLowerCase()))) {
      try {
        showToast(`Fetching live status for ${cn}...`, 'info')
        await checkContainerStatus(cn, carrier)
        await refreshTracking()
        showToast(`${cn} updated from ${carrier}`, 'success')
        return
      } catch (e) {
        showToast(`Live fetch failed: ${e.message}. Opening manual update.`, 'error')
      }
    }

    const td = trackingData[cn] || {}
    setUpdateModal({
      containerNo:     cn,
      carrier:         carrier,
      status:          td.status || 'in_transit',
      statusText:      td.statusText || 'In Transit',
      currentLocation: td.currentLocation || '',
      vessel:          td.vessel || job.vessel || '',
      eta:             (td.eta || job.eta || '').slice(0, 10),
      freeDays:        td.freeDays ?? job.free_days ?? '',
      notes:           td.notes || '',
      portIn:          td.portIn || '',
      portOut:         td.portOut || '',
      cfsGateIn:       td.cfsGateIn || '',
    })
  }

  const handleOpenMilestone = async (job, cn) => {
    await ensureTrackingRow(job, cn)
    const td = trackingData[cn] || {}
    setMilestoneModal({ containerNo: cn, milestones: td.milestones || [] })
  }

  // ── KPI calculations ─────────────────────────── MUST be before early return
  const kpis = useMemo(() => {
    let inTransit = 0, atCFS = 0, detained = 0, arrivingThisWeek = 0
    const today = new Date()
    const weekOut = new Date(); weekOut.setDate(today.getDate() + 7)
    for (const { cnList } of allJobCards) {
      for (const cn of cnList) {
        const td = trackingData[cn] || {}
        const status = td.status || 'in_transit'
        if (td.freeDays != null && td.freeDays <= 2) detained++
        else if (status === 'in_transit')  inTransit++
        else if (status === 'at_cfs' || status === 'arrived') atCFS++
        const eta = td.eta || null
        if (eta) {
          const etaD = new Date(eta)
          if (etaD >= today && etaD <= weekOut) arrivingThisWeek++
        }
      }
    }
    return { inTransit, atCFS, detained, arrivingThisWeek, total: totalContainerCount }
  }, [allJobCards, trackingData, totalContainerCount])

  const sortedJobCards = useMemo(() => {
    return [...filteredJobCards].sort((a, b) => {
      const aHasDetention = a.cnList.some(cn => (trackingData[cn]?.freeDays ?? 99) <= 2)
      const bHasDetention = b.cnList.some(cn => (trackingData[cn]?.freeDays ?? 99) <= 2)
      if (aHasDetention && !bHasDetention) return -1
      if (!aHasDetention && bHasDetention) return 1
      const aEta = a.job.eta || '9999'
      const bEta = b.job.eta || '9999'
      return aEta.localeCompare(bEta)
    })
  }, [filteredJobCards, trackingData])

  useEffect(() => {
    if (!searchQuery.trim()) return
    const q = searchQuery.trim().toLowerCase()
    const toExpand = {}
    for (const { job, cnList } of allJobCards) {
      const containerMatch = cnList.some(cn => cn.toLowerCase().includes(q))
      if (containerMatch) toExpand[`job_${job.id}`] = true
    }
    if (Object.keys(toExpand).length > 0) {
      setExpandedContainers(prev => ({ ...prev, ...toExpand }))
    }
  }, [searchQuery, allJobCards])

  if (loadingTracking) return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ background:'var(--color-background-primary)', border:'0.5px solid var(--color-border-tertiary)', borderRadius:'12px', padding:'16px' }}>
          <div style={{ height:'16px', width:'120px', background:'var(--color-border-tertiary)', borderRadius:'6px' }} />
          <div style={{ height:'36px', background:'var(--color-border-tertiary)', borderRadius:'8px', marginTop:'10px' }} />
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

      <style>{`
  .kpi-grid { grid-template-columns: repeat(2,1fr); }
  @media(min-width:640px){ .kpi-grid { grid-template-columns: repeat(3,1fr); } }
  @media(min-width:1024px){ .kpi-grid { grid-template-columns: repeat(5,1fr); } }
  .ct-desktop { display: none; }
  .ct-mobile  { display: block; }
  @media(min-width:768px){
    .ct-desktop { display: block; }
    .ct-mobile  { display: none; }
  }
`}</style>

      {/* ── KPI STRIP ─────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'10px' }}>
        {[
          { label:'Total Containers', value: kpis.total,            bg:'#f8f9fb',                           color:'#1a2233',                     sub:'across all jobs' },
          { label:'In Transit',       value: kpis.inTransit,        bg:'#FAEEDA',                           color:'#633806',                     sub:'on the water' },
          { label:'At CFS / Arrived', value: kpis.atCFS,            bg:'#EAF3DE',                           color:'#27500A',                     sub:'at destination' },
          { label:'Detention Risk',   value: kpis.detained,         bg: kpis.detained > 0 ? '#FCEBEB' : '#f8f9fb', color: kpis.detained > 0 ? '#791F1F' : '#1a2233', sub: kpis.detained > 0 ? 'act immediately' : 'none' },
          { label:'ETA This Week',    value: kpis.arrivingThisWeek, bg:'#E6F1FB',                           color:'#0C447C',                     sub:'arriving soon' },
        ].map(k => (
          <div key={k.label} style={{ background:k.bg, borderRadius:'10px', padding:'12px 14px' }}>
            <div style={{ fontSize:'10px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:k.color, opacity:0.75, marginBottom:'4px' }}>{k.label}</div>
            <div style={{ fontSize:'26px', fontWeight:500, color:k.color, lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:'11px', color:k.color, opacity:0.65, marginTop:'3px' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── FILTER / SEARCH BAR ───────────────────────────────────── */}
      <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
        {/* Row 1: Search full width */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'white', border:'1.5px solid #e2e6ed', borderRadius:'8px', padding:'0 12px', height:'42px', width:'100%' }}>
          <span style={{ fontSize:'14px', color:'#8a96a8' }}>🔍</span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search job, client, container, BL..."
            style={{ border:'none', outline:'none', background:'transparent', fontSize:'16px', color:'#1a2233', width:'100%' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#8a96a8', fontSize:'16px', padding:'4px' }}>✕</button>
          )}
        </div>

        {/* Row 2: Filters + Refresh + Count */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
          <select value={filterLine} onChange={e => setFilterLine(e.target.value)}
            style={{ flex:1, minWidth:'120px', height:'38px', padding:'0 10px', border:'1.5px solid #e2e6ed', borderRadius:'8px', fontSize:'14px', color:'#4a5568', background:'white', outline:'none' }}>
            <option value="">All Lines</option>
            {carriers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ flex:1, minWidth:'120px', height:'38px', padding:'0 10px', border:'1.5px solid #e2e6ed', borderRadius:'8px', fontSize:'14px', color:'#4a5568', background:'white', outline:'none' }}>
            <option value="">All Status</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button
            onClick={async () => {
              showToast('Refreshing all containers...', 'info')
              const supported = ['MSC','ONE','Evergreen','CMA-CGM','Hapag-Lloyd']
              const tasks = allJobCards.flatMap(({ job, cnList }) =>
                cnList
                  .filter(() => supported.some(s => (job.shipping_line||'').toLowerCase().includes(s.toLowerCase())))
                  .map(cn => checkContainerStatus(cn, job.shipping_line).catch(e => ({ error: e.message, cn })))
              )
              const results = await Promise.allSettled(tasks)
              const failed  = results.filter(r => r.status === 'rejected').length
              await refreshTracking()
              showToast(
                failed > 0
                  ? `Refreshed. ${failed} container(s) failed — check manually.`
                  : `All containers refreshed successfully.`,
                failed > 0 ? 'error' : 'success'
              )
            }}
            style={{ height:'38px', padding:'0 14px', background:'#1a4fa0', border:'none', borderRadius:'8px', color:'white', fontSize:'13px', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}
          >
            ↻ Refresh
          </button>
          <span style={{ fontSize:'12px', color:'#8a96a8', whiteSpace:'nowrap' }}>
            {sortedJobCards.length} jobs · {kpis.total} ctrs
          </span>
        </div>
      </div>
      {/* ── ACCORDION TABLE ───────────────────────────────────────── */}
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
        <>
          {/* ── MOBILE VIEW: stacked cards ──────────────────────────── */}
          <div className="ct-mobile" style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {sortedJobCards.map(({ job, cnList }) => {
              const statuses     = cnList.map(cn => trackingData[cn]?.status || 'in_transit')
              const hasDetention = cnList.some(cn => (trackingData[cn]?.freeDays ?? 99) <= 2)
              const allDelivered = statuses.every(s => s === 'delivered')
              const anyDelayed   = statuses.includes('delayed') || statuses.includes('customs_hold')
              const isExpanded   = !!expandedContainers[`job_${job.id}`]

              const jobBadge = hasDetention
                ? { text:'⚠ Detention', bg:'#FCEBEB', color:'#991b1b', border:'#fecaca' }
                : allDelivered
                ? { text:'Delivered',    bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' }
                : anyDelayed
                ? { text:'Delayed',      bg:'#fef2f2', color:'#991b1b', border:'#fecaca' }
                : statuses.includes('at_cfs') || statuses.includes('arrived')
                ? { text:'At CFS',       bg:'#f0fdfa', color:'#0f766e', border:'#99f6e4' }
                : { text:'In Transit',   bg:'#fffbeb', color:'#92400e', border:'#fde68a' }

              const stripeColor = hasDetention ? '#dc2626'
                : allDelivered ? '#16a34a'
                : anyDelayed ? '#dc2626'
                : statuses.includes('at_cfs') || statuses.includes('arrived') ? '#16a34a'
                : '#f59e0b'

              return (
                <div key={job.id} style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', overflow:'hidden', position:'relative' }}>
                  {/* colored top stripe */}
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:stripeColor }} />

                  {/* Job header — tappable */}
                  <div
                    onClick={() => setExpandedContainers(prev => ({ ...prev, [`job_${job.id}`]: !prev[`job_${job.id}`] }))}
                    style={{ padding:'14px 16px 12px', cursor:'pointer', userSelect:'none' }}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px' }}>
                      <div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'15px', fontWeight:700, color:'#1a4fa0' }}>{job.job_no}</div>
                        <div style={{ fontSize:'13px', fontWeight:600, color:'#1a2233', marginTop:'2px' }}>{job.client}</div>
                        <div style={{ fontSize:'11px', color:'#8a96a8', marginTop:'1px' }}>{job.shipping_line || '—'} · {job.mode || '—'}</div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'6px' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:'9999px', fontSize:'11px', fontWeight:600, border:`1px solid ${jobBadge.border}`, background:jobBadge.bg, color:jobBadge.color, whiteSpace:'nowrap' }}>
                          {jobBadge.text}
                        </span>
                        <span style={{ fontSize:'11px', color:'#8a96a8' }}>
                          {cnList.length} container{cnList.length !== 1 ? 's' : ''} {isExpanded ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>

                    {/* ETA + Details button row */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <span style={{ fontSize:'10px', color:'#8a96a8', textTransform:'uppercase', letterSpacing:'0.05em' }}>ETA JNPT </span>
                        <span style={{ fontSize:'13px', fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color: !job.eta ? '#8a96a8' : Math.ceil((new Date(job.eta)-new Date())/86400000) < 0 ? '#dc2626' : Math.ceil((new Date(job.eta)-new Date())/86400000) <= 3 ? '#b45309' : '#1a2233' }}>
                          {job.eta ? new Date(job.eta).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : '—'}
                        </span>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setDetailJob(job) }}
                        style={{ padding:'6px 14px', background:'#f0f4fb', border:'1px solid #bfdbfe', borderRadius:'8px', fontSize:'12px', fontWeight:600, color:'#1a4fa0', cursor:'pointer' }}
                      >
                        View Details →
                      </button>
                    </div>
                  </div>

                  {/* Expanded container list */}
                  {isExpanded && (
                    <div style={{ borderTop:'1px solid #e2e6ed' }}>
                      {cnList.map((cn, cnIdx) => {
                        const td     = trackingData[cn] || {}
                        const status = td.status || 'in_transit'
                        const st     = STATUS_STYLES_MAP[status] || STATUS_STYLES_MAP['in_transit']
                        const pct    = statusProgress(status)
                        const pColor = getProgressColor(status, td.freeDays)
                        const isDetention = td.freeDays != null && td.freeDays <= 2
                        const isLastCn    = cnIdx === cnList.length - 1

                        return (
                          <div key={cn} style={{ padding:'12px 16px', borderBottom: isLastCn ? 'none' : '1px solid #f4f6f9', background:'#fafbfc' }}>
                            {/* Container number + status */}
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'13px', fontWeight:700, color:'#1a2233' }}>{cn}</span>
                              <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 10px', borderRadius:'9999px', fontSize:'11px', fontWeight:600, background: isDetention ? '#fef2f2' : st.bg, color: isDetention ? '#991b1b' : st.color, border:`1px solid ${isDetention ? '#fecaca' : st.border}`, whiteSpace:'nowrap' }}>
                                {isDetention ? '⚠ Detention' : (td.statusText || 'Not Updated')}
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div style={{ height:'4px', background:'#e2e6ed', borderRadius:'4px', overflow:'hidden', marginBottom:'4px' }}>
                              <div style={{ height:'100%', borderRadius:'4px', width:`${pct}%`, background:pColor }} />
                            </div>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'#8a96a8', marginBottom:'10px' }}>
                              <span>Loaded</span>
                              <span style={{ color:pColor, fontWeight:600 }}>{pct}%</span>
                              <span>Discharged</span>
                            </div>

                            {/* Key fields — 2 col */}
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px' }}>
                              {[
                                { label:'Location', value: td.currentLocation },
                                { label:'ETA', value: td.eta || job.eta ? new Date(td.eta || job.eta).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : null },
                                { label:'Free Days', value: td.freeDays != null ? `${td.freeDays}d` : null, color: td.freeDays <= 2 ? '#dc2626' : td.freeDays <= 5 ? '#b45309' : '#1a2233' },
                                { label:'Last Update', value: td.lastUpdate ? new Date(td.lastUpdate).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : null },
                              ].map(f => (
                                <div key={f.label}>
                                  <div style={{ fontSize:'9px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:'#8a96a8', marginBottom:'2px' }}>{f.label}</div>
                                  <div style={{ fontSize:'12px', fontWeight:500, color: f.color || (f.value ? '#1a2233' : '#d0d6e0') }}>{f.value || '—'}</div>
                                </div>
                              ))}
                            </div>

                            {/* Action buttons — full width on mobile */}
                            <div style={{ display:'flex', gap:'8px' }}>
                              <button
                                onClick={() => handleOpenUpdate(job, cn)}
                                style={{ flex:1, padding:'9px 0', background:'#e8eef8', border:'1.5px solid #bfdbfe', color:'#1a4fa0', borderRadius:'8px', fontSize:'13px', fontWeight:600, cursor:'pointer' }}
                              >
                                Update Status
                              </button>
                              <button
                                onClick={() => openCarrierTracking(cn, job.shipping_line, showToast)}
                                style={{ width:'44px', height:'44px', background:'#f8f9fb', border:'1.5px solid #e2e6ed', color:'#4a5568', borderRadius:'8px', fontSize:'18px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
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

          {/* ── DESKTOP VIEW: accordion table ───────────────────────── */}
          <div className="ct-desktop" style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
            <div style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', overflow:'hidden', minWidth:'700px' }}>

              {/* Table column headers */}
              <div className="ct-job-row" style={{ display:'grid', gridTemplateColumns:'32px 120px 1fr 110px 130px 100px 80px 70px', gap:'12px', alignItems:'center', padding:'8px 16px', background:'#f8f9fb', borderBottom:'1.5px solid #e2e6ed' }}>
                {['', 'Job', 'Client', 'Shipping Line', 'Status', 'ETA', 'Containers', ''].map((h, i) => (
                  <div key={i} style={{ fontSize:'10px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:'#8a96a8' }}>{h}</div>
                ))}
              </div>
              {/* Job rows — desktop accordion */}
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

                const displayEta = job.eta ? new Date(job.eta).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : '—'
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
                      className="ct-job-row"
                      onClick={() => setExpandedContainers(prev => ({ ...prev, [`job_${job.id}`]: !prev[`job_${job.id}`] }))}
                      style={{ display:'grid', gridTemplateColumns:'32px 120px 1fr 110px 130px 100px 80px 70px', gap:'12px', alignItems:'center', padding:'11px 16px', cursor:'pointer', background: hasDetention ? '#fff8f8' : 'white' }}
                      onMouseEnter={e => { e.currentTarget.style.background = hasDetention ? '#fff0f0' : '#f8f9fb' }}
                      onMouseLeave={e => { e.currentTarget.style.background = hasDetention ? '#fff8f8' : 'white' }}
                    >
                      <span style={{ fontSize:'11px', color:'#8a96a8', display:'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none', transition:'transform 0.15s' }}>▶</span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'13px', fontWeight:600, color:'#1a4fa0' }}>{job.job_no}</span>
                      <span style={{ fontSize:'13px', color:'#1a2233', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{job.client}</span>
                      <span style={{ fontSize:'12px', color:'#8a96a8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{job.shipping_line || '—'}</span>
                      <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 8px', borderRadius:'9999px', fontSize:'11px', fontWeight:500, border:`0.5px solid ${jobBadge.border}`, background:jobBadge.bg, color:jobBadge.color, whiteSpace:'nowrap' }}>
                        {jobBadge.text}
                      </span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'12px', fontWeight:500, color:etaColor }}>{displayEta}</span>
                      <span style={{ fontSize:'12px', color:'#8a96a8' }}>{cnList.length} ctr{cnList.length !== 1 ? 's' : ''}</span>
                      <button
                        onClick={e => { e.stopPropagation(); setDetailJob(job) }}
                        style={{ padding:'4px 10px', background:'#f8f9fb', border:'0.5px solid #e2e6ed', borderRadius:'6px', fontSize:'11px', fontWeight:500, color:'#8a96a8', cursor:'pointer', whiteSpace:'nowrap' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor='#1a4fa0'; e.currentTarget.style.color='#1a4fa0' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor='#e2e6ed'; e.currentTarget.style.color='#8a96a8' }}
                      >
                        Details
                      </button>
                    </div>

                    {/* Expanded container rows — desktop */}
                    {isExpanded && (
                      <div style={{ borderTop:'0.5px solid #e2e6ed', background:'#f8f9fb' }}>
                        <div className="ct-cn-row" style={{ display:'grid', gridTemplateColumns:'48px 180px 120px 1fr 100px 80px 100px', gap:'12px', alignItems:'center', padding:'6px 16px 6px 48px', borderBottom:'1px solid #e2e6ed' }}>
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
                            <div key={cn} className="ct-cn-row" style={{ display:'grid', gridTemplateColumns:'48px 180px 120px 1fr 100px 80px 100px', gap:'12px', alignItems:'center', padding:'10px 16px 10px 48px', borderBottom: isLastCn ? 'none' : '0.5px solid #e2e6ed', background:'white' }}>
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
                                <button onClick={() => handleOpenUpdate(job, cn)}
                                  style={{ padding:'5px 8px', background:'#e8eef8', border:'0.5px solid #bfdbfe', borderRadius:'5px', fontSize:'11px', fontWeight:500, color:'#1a4fa0', cursor:'pointer', minHeight:'32px' }}
                                  onMouseEnter={e => { e.currentTarget.style.background='#1a4fa0'; e.currentTarget.style.color='white' }}
                                  onMouseLeave={e => { e.currentTarget.style.background='#e8eef8'; e.currentTarget.style.color='#1a4fa0' }}>
                                  Update
                                </button>
                                <button onClick={() => openCarrierTracking(cn, job.shipping_line, showToast)}
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
        </>
      )}
      {/* ── MODALS ────────────────────────────────────────────────── */}
      {updateModal && (
        <UpdateStatusModal
          container={updateModal}
          statusOptions={STATUS_OPTIONS}
          onClose={() => setUpdateModal(null)}
          onSaved={async () => { setUpdateModal(null); await refreshTracking() }}
          showToast={showToast}
        />
      )}
      {milestoneModal && (
        <AddMilestoneModal
          container={milestoneModal}
          onClose={() => setMilestoneModal(null)}
          onSaved={async () => { setMilestoneModal(null); await refreshTracking() }}
          showToast={showToast}
        />
      )}
      {detailJob && (
        <JobDetailPanel
          job={detailJob}
          trackingData={trackingData}
          showToast={showToast}
          activeContainer={activeContainer?.cn || null}
          onClose={() => { setDetailJob(null); setActiveContainer(null) }}
          onUpdate={(job, cn) => { setDetailJob(null); setActiveContainer(null); handleOpenUpdate(job, cn) }}
          onAddEvent={(job, cn) => { setDetailJob(null); setActiveContainer(null); handleOpenMilestone(job, cn) }}
        />
      )}

    </div>
  )
}

export default ContainerTrackingSection
