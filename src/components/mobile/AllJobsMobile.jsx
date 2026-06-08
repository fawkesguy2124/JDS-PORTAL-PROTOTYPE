import { useState } from 'react'

export default function AllJobsMobile({
  jobs,
  searchQuery,
  setSearchQuery,
  stageFilter,
  setStageFilter,
  priorityFilter,
  setPriorityFilter,
  onOpenJob,
  getStageName,
}) {
  const [expandedId, setExpandedId] = useState(null)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>

      {/* Search */}
      <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'white', border:'1.5px solid #e2e6ed', borderRadius:'10px', padding:'0 14px', height:'46px' }}>
        <span style={{ fontSize:'16px', color:'#8a96a8' }}>🔍</span>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search job, client, BL..."
          style={{ border:'none', outline:'none', background:'transparent', fontSize:'16px', color:'#1a2233', width:'100%' }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#8a96a8', fontSize:'18px', padding:'4px' }}>✕</button>
        )}
      </div>

      {/* Filters row */}
      <div style={{ display:'flex', gap:'8px' }}>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          style={{ flex:1, height:'40px', padding:'0 10px', border:'1.5px solid #e2e6ed', borderRadius:'8px', fontSize:'14px', color:'#4a5568', background:'white', outline:'none' }}>
          <option value="">All Stages</option>
          {Array.from({length:11},(_,i)=>i).map(i => (
            <option key={i} value={i}>Stage {i} — {getStageName(i)}</option>
          ))}
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
          style={{ flex:1, height:'40px', padding:'0 10px', border:'1.5px solid #e2e6ed', borderRadius:'8px', fontSize:'14px', color:'#4a5568', background:'white', outline:'none' }}>
          <option value="">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
        </select>
      </div>

      {/* Job count */}
      <div style={{ fontSize:'12px', color:'#8a96a8' }}>{jobs.length} job{jobs.length !== 1 ? 's' : ''}</div>

      {/* Empty state */}
      {jobs.length === 0 && (
        <div style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', padding:'40px 20px', textAlign:'center' }}>
          <div style={{ fontSize:'28px', marginBottom:'10px' }}>📋</div>
          <p style={{ fontSize:'14px', color:'#4a5568' }}>No jobs found.</p>
        </div>
      )}

      {/* Job cards */}
      {jobs.map(job => {
        const stage = Number(job.stage) || 0
        const pct   = Math.round((stage / 10) * 100)
        const isOpen = expandedId === job.id

        const priorityColors = {
          urgent: { bg:'#fef2f2', color:'#991b1b', border:'#fecaca' },
          high:   { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
          normal: { bg:'#f0f9ff', color:'#0369a1', border:'#bae6fd' },
        }
        const p = priorityColors[job.priority?.toLowerCase()] || priorityColors.normal

        const leftBorderColor = job.priority?.toLowerCase() === 'urgent' ? '#dc2626'
          : job.priority?.toLowerCase() === 'high' ? '#f59e0b'
          : '#1a4fa0'

        return (
          <div key={job.id} style={{ background:'white', border:'1.5px solid #e2e6ed', borderLeft:`4px solid ${leftBorderColor}`, borderRadius:'12px', overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>

            {/* Card header — tappable */}
            <div
              onClick={() => setExpandedId(isOpen ? null : job.id)}
              style={{ padding:'14px 16px', cursor:'pointer', userSelect:'none' }}
            >
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px' }}>
                <div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'15px', fontWeight:700, color:'#1a4fa0' }}>{job.job_no}</div>
                  <div style={{ fontSize:'14px', fontWeight:600, color:'#1a2233', marginTop:'2px' }}>{job.client}</div>
                  <div style={{ fontSize:'12px', color:'#8a96a8', marginTop:'1px' }}>{job.mode || '—'} · {job.shipping_line || '—'}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'6px' }}>
                  <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:'9999px', fontSize:'11px', fontWeight:600, background:p.bg, color:p.color, border:`1px solid ${p.border}` }}>
                    {job.priority || 'Normal'}
                  </span>
                  <span style={{ fontSize:'11px', color:'#8a96a8' }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </div>
              </div>

            </div>

            {/* Expanded details */}
            {isOpen && (
              <div style={{ borderTop:'1px solid #e2e6ed', padding:'12px 16px', background:'#fafbfc' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
                  {[
                    { label:'BL Number',  value: job.bl_no },
                    { label:'ETA',        value: job.eta ? new Date(job.eta).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : null },
                    { label:'Containers', value: job.containers },
                    { label:'Goods',      value: job.goods },
                    { label:'BE Number',  value: job.be_no },
                    { label:'CFS',        value: job.cfs_name },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#8a96a8', marginBottom:'2px' }}>{f.label}</div>
                      <div style={{ fontSize:'12px', fontWeight:500, color: f.value ? '#1a2233' : '#d0d6e0' }}>{f.value || '—'}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onOpenJob(job) }}
                  style={{ width:'100%', padding:'10px 0', background:'#1a4fa0', border:'none', borderRadius:'8px', color:'white', fontSize:'13px', fontWeight:600, cursor:'pointer' }}
                >
                  Open Job →
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
