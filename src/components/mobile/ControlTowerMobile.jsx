export default function ControlTowerMobile({ jobs, profiles, onOpenJob }) {
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
          <span style={{ fontSize:'11px', color:'#8a96a8' }}>Stage {job.stage} &rarr;</span>
        </div>
      ))}
    </div>
  )

  return (
    <div>
      <Section title="Urgent Jobs"       items={urgent}   color="#dc2626" emptyText="No urgent jobs" />
      <Section title="Detention Risk"     items={detained} color="#f59e0b" emptyText="No detention risks" />
      <Section title="Stale (5+ days)"   items={stale}    color="#8a96a8" emptyText="All jobs recently updated" />
    </div>
  )
}
