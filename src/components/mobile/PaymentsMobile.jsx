import { useMemo } from 'react'
import { getStageName } from '../../utils/jobHelpers'

export default function PaymentsMobile({ jobs, showToast }) {
  const pendingJobs = useMemo(() =>
    (jobs || []).filter(j => [6, 8].includes(Number(j.stage)))
  , [jobs])

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>

      {/* Summary pill */}
      <div style={{ background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:'10px', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:'13px', fontWeight:600, color:'#991b1b' }}>Pending Approval</span>
        <span style={{ fontSize:'20px', fontWeight:700, color:'#991b1b' }}>{pendingJobs.length}</span>
      </div>

      {pendingJobs.length === 0 ? (
        <div style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', padding:'32px', textAlign:'center', fontSize:'13px', color:'#8a96a8' }}>
          No payments pending approval.
        </div>
      ) : pendingJobs.map(job => (
        <div key={job.id} style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', padding:'16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px' }}>
            <div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'14px', fontWeight:700, color:'#1a4fa0' }}>{job.job_no}</div>
              <div style={{ fontSize:'13px', color:'#1a2233', marginTop:'2px' }}>{job.client}</div>
              <div style={{ fontSize:'12px', color:'#8a96a8', marginTop:'2px' }}>{getStageName(Number(job.stage))}</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:'16px', fontWeight:700, color:'#1a2233' }}>
                {job.cfs_amount ? `\u20B9${Number(job.cfs_amount).toLocaleString('en-IN')}` : 'Pending'}
              </div>
              <div style={{ fontSize:'11px', color:'#8a96a8', marginTop:'2px' }}>{job.cfs_name || '\u2014'}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button
              onClick={() => showToast(`Payment approved for ${job.job_no}`, 'success')}
              style={{ flex:1, padding:'10px 0', background:'#f0fdf4', border:'1.5px solid #bbf7d0', borderRadius:'8px', fontSize:'13px', fontWeight:600, color:'#15803d', cursor:'pointer' }}
            >
              \u2713 Approve
            </button>
            <button
              onClick={() => showToast(`Query raised for ${job.job_no}`, 'info')}
              style={{ flex:1, padding:'10px 0', background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:'8px', fontSize:'13px', fontWeight:600, color:'#991b1b', cursor:'pointer' }}
            >
              Query
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
