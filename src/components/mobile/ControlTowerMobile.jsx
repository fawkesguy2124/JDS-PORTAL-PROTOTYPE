export default function ControlTowerMobile({ jobs, profiles, onOpenJob, activityLog = [] }) {
  const urgent = (jobs || []).filter(j => j.priority?.toLowerCase() === 'urgent' && Number(j.stage) < 10)
  const detained = (jobs || []).filter(j => j.free_days != null && Number(j.free_days) <= 2)
  const stale = (jobs || []).filter(j => {
    if (!j.updated_at) return false
    return Math.floor((Date.now() - new Date(j.updated_at).getTime()) / 86400000) >= 5
  })

  const Section = ({ title, items, color, emptyText }) => (
    <div style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', overflow:'hidden', marginBottom:'10px' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e6ed', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:'13px', fontWeight:700, color:'#1a2233' }}>{title}</span>
        <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 8px', borderRadius:'9999px', fontSize:'11px', fontWeight:700, background:color+'22', color }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ padding:'16px', textAlign:'center', fontSize:'12px', color:'#8a96a8' }}>{emptyText}</div>
      ) : items.map(job => (
        <div key={job.id} onClick={() => onOpenJob(job)}
          style={{ padding:'12px 16px', borderBottom:'1px solid #f4f6f9', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
        >
          <div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'13px', fontWeight:600, color:'#1a4fa0' }}>{job.job_no}</div>
            <div style={{ fontSize:'12px', color:'#4a5568', marginTop:'2px' }}>{job.client}</div>
          </div>
          <span style={{ fontSize:'11px', color:'#8a96a8' }}>Stage {job.stage} →</span>
        </div>
      ))}
    </div>
  )

  return (
    <div>
      <Section title="Urgent Jobs"       items={urgent}   color="#dc2626" emptyText="No urgent jobs" />
      <Section title="Detention Risk"     items={detained} color="#f59e0b" emptyText="No detention risks" />
      <Section title="Stale (5+ days)"   items={stale}    color="#8a96a8" emptyText="All jobs recently updated" />

      {/* Team Activity */}
      <div style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', overflow:'hidden', marginBottom:'10px' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e6ed', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:'13px', fontWeight:700, color:'#1a2233' }}>Team Activity</span>
          <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', fontSize:'11px', fontWeight:600, color:'#16a34a' }}>
            <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#16a34a', display:'inline-block' }} />
            Live
          </span>
        </div>
        <div style={{ padding:'12px 16px' }}>
          {activityLog.length === 0 ? (
            <div style={{ textAlign:'center', fontSize:'12px', color:'#8a96a8', padding:'8px 0' }}>No recent activity.</div>
          ) : activityLog.slice(0, 6).map((a, i) => {
            const dotColor =
              a.action?.includes('stage')    ? '#16a34a'
              : a.action?.includes('upload') ? '#2563eb'
              : a.action?.includes('payment')? '#f59e0b'
              : a.action?.includes('delete') ? '#dc2626'
              : a.action?.includes('create') ? '#7c3aed'
              : '#8a96a8'

            const relTime = (() => {
              if (!a.created_at) return ''
              const diff = Date.now() - new Date(a.created_at).getTime()
              const mins = Math.floor(diff / 60000)
              if (mins < 1)  return 'just now'
              if (mins < 60) return `${mins}m ago`
              const hrs = Math.floor(mins / 60)
              if (hrs < 24)  return `${hrs}h ago`
              return `${Math.floor(hrs / 24)}d ago`
            })()

            return (
              <div key={a.id || i} style={{ display:'flex', gap:'10px', alignItems:'flex-start', marginBottom: i < activityLog.slice(0,6).length - 1 ? '12px' : 0 }}>
                <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:dotColor, marginTop:'5px', flexShrink:0 }} />
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:'13px', color:'#1a2233', lineHeight:1.4 }}>
                    {a.user_name && <span style={{ fontWeight:600 }}>{a.user_name} </span>}
                    {a.description || a.action || 'updated a job'}
                    {a.job_no && <span style={{ fontFamily:"'JetBrains Mono',monospace", color:'#1a4fa0' }}> {a.job_no}</span>}
                  </div>
                  <div style={{ fontSize:'11px', color:'#8a96a8', marginTop:'2px', fontFamily:"'JetBrains Mono',monospace" }}>{relTime}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
