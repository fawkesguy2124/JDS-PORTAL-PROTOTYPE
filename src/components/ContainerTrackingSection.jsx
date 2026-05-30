import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { updateContainerStatus, addMilestone, checkContainerStatus } from '../services/trackingService'

function formatContainerDate(ts) {
  if (!ts) return '\u2014'
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function JobDetailPanel({ job, trackingData, onClose, onUpdate, onAddEvent }) {
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
        position:'fixed', right:0, top:0, bottom:0, width:'520px',
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

        <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
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
                  <div key={cn} style={{ border:'1.5px solid #e2e6ed', borderRadius:'12px', overflow:'hidden', borderTop:`3px solid ${pColor}` }}>

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
        position:'fixed', right:0, top:0, bottom:0, width:'480px',
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
        position:'fixed', right:0, top:0, bottom:0, width:'480px',
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

function ContainerTrackingSection({ showToast, jobs }) {
  const [trackingData, setTrackingData]         = useState({})
  const [loadingTracking, setLoadingTracking]   = useState(true)
  const [searchQuery, setSearchQuery]           = useState('')
  const [expandedContainers, setExpandedContainers] = useState({})
  const [detailJob, setDetailJob]               = useState(null)
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

      <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'white', border:'1.5px solid #e2e6ed', borderRadius:'8px', padding:'0 12px', height:'36px', flex:'1', maxWidth:'360px' }}>
          <span style={{ color:'#8a96a8' }}>🔍</span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search job number, client, container, BL..."
            style={{ border:'none', outline:'none', background:'transparent', fontSize:'13px', color:'#1a2233', width:'100%' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#8a96a8', fontSize:'14px' }}>✕</button>
          )}
        </div>
        <select value={filterLine} onChange={e => setFilterLine(e.target.value)}
          style={{ height:'36px', padding:'0 10px', border:'1.5px solid #e2e6ed', borderRadius:'8px', fontSize:'13px', color:'#4a5568', background:'white', outline:'none' }}>
          <option value="">All Lines</option>
          {carriers.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ height:'36px', padding:'0 10px', border:'1.5px solid #e2e6ed', borderRadius:'8px', fontSize:'13px', color:'#4a5568', background:'white', outline:'none' }}>
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
          style={{ height:'36px', padding:'0 14px', background:'#1a4fa0', border:'none', borderRadius:'8px', color:'white', fontSize:'13px', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}
        >
          ↻ Refresh All
        </button>
        <span style={{ marginLeft:'auto', fontSize:'13px', color:'#8a96a8' }}>
          {filteredJobCards.length} job{filteredJobCards.length !== 1 ? 's' : ''} · {totalContainerCount} container{totalContainerCount !== 1 ? 's' : ''}
        </span>
      </div>

      {filteredJobCards.length === 0 && (
        <div style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', padding:'48px 24px', textAlign:'center' }}>
          <div style={{ fontSize:'32px', marginBottom:'12px' }}>⊟</div>
          <p style={{ fontSize:'14px', fontWeight:600, color:'#4a5568' }}>
            {searchQuery || filterLine || filterStatus ? 'No jobs match your filters.' : 'No jobs with containers yet.'}
          </p>
          <p style={{ fontSize:'12px', color:'#8a96a8', marginTop:'6px' }}>
            Go to All Jobs → open a job → Edit → add container numbers in the Containers field.
          </p>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px', alignItems:'start' }}>
        {filteredJobCards.map(({ job, cnList }) => {
          const statuses    = cnList.map(cn => trackingData[cn]?.status || 'in_transit')
          const worstStatus = statuses.includes('delayed')        ? 'delayed'
            : statuses.includes('customs_hold')   ? 'customs_hold'
            : statuses.includes('in_transit')     ? 'in_transit'
            : statuses.includes('arrived')        ? 'arrived'
            : statuses.includes('at_cfs')         ? 'at_cfs'
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
              style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', padding:'16px', position:'relative', overflow:'hidden', cursor:'pointer', transition:'all 0.2s', boxSizing:'border-box' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.09)'; e.currentTarget.style.borderColor='#d0d6e0' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='#e2e6ed' }}
            >
              <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'3px', background:stripeColor }} />

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px' }}>
                <div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'13px', fontWeight:700, color:'#1a4fa0' }}>{job.job_no}</div>
                  <div style={{ fontSize:'12px', fontWeight:600, color:'#1a2233', marginTop:'2px' }}>{job.client}</div>
                  <div style={{ fontSize:'11px', color:'#8a96a8', marginTop:'1px' }}>{job.mode || '\u2014'}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:'12px', fontWeight:600, color:'#4a5568' }}>{job.shipping_line || '\u2014'}</div>
                  <div style={{ fontSize:'11px', color:'#8a96a8', marginTop:'2px' }}>Stage {job.stage ?? 0}</div>
                </div>
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', marginBottom:'12px' }}>
                <span style={{ fontWeight:600, color:'#1a2233', maxWidth:'90px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {job.vessel || 'Origin'}
                </span>
                <span style={{ color:'#d0d6e0', flex:1, textAlign:'center', fontSize:'10px', letterSpacing:'2px' }}>────→</span>
                <span style={{ fontWeight:600, color:'#1a2233', maxWidth:'90px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {job.destination || 'JNPT, IN'}
                </span>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'12px' }}>
                {cnList.map(cn => {
                  const td     = trackingData[cn] || {}
                  const status = td.status || 'in_transit'
                  const st     = STATUS_STYLES_MAP[status] || STATUS_STYLES_MAP['in_transit']
                  const isDetention = td.freeDays != null && td.freeDays <= 2
                  const key    = `${job.id}-${cn}`
                  const isOpen = !!expandedContainers[key]
                  const pct    = statusProgress(status)
                  const pColor = getProgressColor(status, td.freeDays)

                  return (
                    <div key={cn}>
                      <div
                        onClick={e => { e.stopPropagation(); setExpandedContainers(prev => ({ ...prev, [key]: !prev[key] })) }}
                        style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', borderRadius:'8px', cursor:'pointer', background: isOpen ? '#f0f4fb' : '#f8f9fb', border:`1.5px solid ${isOpen ? '#bfdbfe' : '#e2e6ed'}`, transition:'all 0.15s' }}
                      >
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'12px', fontWeight:600, color:'#1a2233', flex:1 }}>{cn}</span>
                        <span style={{ borderRadius:'9999px', padding:'2px 8px', fontSize:'10px', fontWeight:700, whiteSpace:'nowrap', background: isDetention ? '#fef2f2' : st.bg, color: isDetention ? '#991b1b' : st.color, border:`1px solid ${isDetention ? '#fecaca' : st.border}` }}>
                          {isDetention ? '⚠ Detention' : (td.statusText || 'Not Updated')}
                        </span>
                        <span style={{ color:'#8a96a8', fontSize:'10px' }}>{isOpen ? '▲' : '▼'}</span>
                      </div>

                      {isOpen && (
                        <div style={{ margin:'4px 0 2px', padding:'10px 12px', background:'white', border:'1.5px solid #bfdbfe', borderRadius:'8px' }}>
                          <div style={{ height:'5px', background:'#f4f6f9', borderRadius:'6px', overflow:'hidden', marginBottom:'3px' }}>
                            <div style={{ height:'100%', borderRadius:'6px', width:`${pct}%`, background:pColor }} />
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'#8a96a8', marginBottom:'8px' }}>
                            <span>Loaded</span>
                            <span style={{ color:pColor, fontWeight:600 }}>{pct}%</span>
                            <span>Discharged</span>
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', fontSize:'11px' }}>
                            {[
                              { label:'Location', value: td.currentLocation },
                              { label:'Vessel',   value: td.vessel || job.vessel },
                              { label:'ETA',      value: formatD(td.eta || job.eta) },
                              { label:'Free Days', value: td.freeDays != null ? `${td.freeDays}d` : '\u2014', color: td.freeDays != null && td.freeDays <= 2 ? '#dc2626' : td.freeDays != null && td.freeDays <= 5 ? '#b45309' : '#1a2233' },
                            ].map(f => (
                              <div key={f.label}>
                                <div style={{ color:'#8a96a8', fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'2px' }}>{f.label}</div>
                                <div style={{ fontWeight:500, color: f.color || (f.value ? '#1a2233' : '#d0d6e0') }}>{f.value || '\u2014'}</div>
                              </div>
                            ))}
                          </div>
                          {td.notes && (
                            <div style={{ marginTop:'8px', padding:'5px 8px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'5px', fontSize:'11px', color:'#92400e' }}>
                              📝 {td.notes}
                            </div>
                          )}
                          <div style={{ display:'flex', gap:'6px', marginTop:'10px' }}>
                            <button onClick={e => { e.stopPropagation(); handleOpenUpdate(job, cn) }}
                              style={{ flex:1, padding:'6px 0', background:'#e8eef8', border:'1.5px solid #bfdbfe', color:'#1a4fa0', borderRadius:'7px', fontSize:'12px', fontWeight:600, cursor:'pointer' }}
                              onMouseEnter={e => { e.currentTarget.style.background='#1a4fa0'; e.currentTarget.style.color='white' }}
                              onMouseLeave={e => { e.currentTarget.style.background='#e8eef8'; e.currentTarget.style.color='#1a4fa0' }}>
                              Update Status
                            </button>
                            <button onClick={e => { e.stopPropagation(); handleOpenMilestone(job, cn) }}
                              style={{ flex:1, padding:'6px 0', background:'#f8f9fb', border:'1.5px solid #e2e6ed', color:'#4a5568', borderRadius:'7px', fontSize:'12px', fontWeight:600, cursor:'pointer' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor='#1a4fa0'; e.currentTarget.style.color='#1a4fa0' }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor='#e2e6ed'; e.currentTarget.style.color='#4a5568' }}>
                              + Add Event
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #e2e6ed', paddingTop:'10px' }}>
                <div>
                  <div style={{ fontSize:'11px', color:'#8a96a8' }}>ETA JNPT</div>
                  <div style={{ fontSize:'13px', fontWeight:700, fontFamily:"'JetBrains Mono',monospace", marginTop:'2px', color:etaCol }}>{formatD(job.eta)}</div>
                </div>
                <span style={{ fontSize:'11px', fontWeight:700, background:'#f8f9fb', color:'#4a5568', border:'1px solid #e2e6ed', borderRadius:'9999px', padding:'3px 10px' }}>
                  {cnList.length} container{cnList.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )
        })}
      </div>

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
          onClose={() => setDetailJob(null)}
          onUpdate={(job, cn) => { setDetailJob(null); handleOpenUpdate(job, cn) }}
          onAddEvent={(job, cn) => { setDetailJob(null); handleOpenMilestone(job, cn) }}
        />
      )}
    </div>
  )
}

export default ContainerTrackingSection
