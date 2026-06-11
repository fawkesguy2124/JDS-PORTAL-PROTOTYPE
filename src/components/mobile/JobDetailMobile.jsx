export default function JobDetailMobile({ job, onBack, onEdit, children }) {
  return (
    <div style={{ minHeight:'100vh', background:'white' }}>
      {/* Back button */}
      <div style={{ padding:'14px 16px', borderBottom:'1px solid #e2e6ed', background:'white', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <button onClick={onBack}
              style={{ padding:'8px 12px', background:'#f4f6f9', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:600, color:'#4a5568', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px' }}>
              &larr; Back
            </button>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'15px', fontWeight:700, color:'#1a4fa0' }}>{job.job_no}</span>
            <span style={{ fontSize:'14px', color:'#1a2233' }}>{job.client}</span>
          </div>
          {onEdit && (
            <button onClick={onEdit}
              style={{ padding:'8px 14px', background:'#1a4fa0', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:600, color:'white', cursor:'pointer' }}>
              Edit
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
