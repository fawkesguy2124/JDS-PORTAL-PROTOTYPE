export default function ComplianceMobile({ showToast }) {
  const certs = [
    { client:'Green Soul Agri',  type:'BIS',              num:'R-41234567',       scope:'Sprinkler systems',       exp:'15 Jun 2026', status:'Expiring in 19 days', urgency:'red'   },
    { client:'NNC Industries',   type:'LMPC',             num:'LMPC-MH-2345',     scope:'Electronic instruments',  exp:'30 Jul 2026', status:'Renew in 64 days',    urgency:'amber' },
    { client:'Jiger Plastics',   type:'Advance Licence',  num:'ALU/2324/123456',  scope:'HDPE raw material',       exp:'15 Mar 2027', status:'Valid',               urgency:'green' },
    { client:'PCM India',        type:'BIS',              num:'R-52345678',       scope:'Concrete pump parts',     exp:'20 Sep 2026', status:'Valid',               urgency:'green' },
  ]

  const colors = {
    red:   { bg:'#fef2f2', color:'#991b1b', border:'#fecaca' },
    amber: { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
    green: { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>

      {/* Alert */}
      <div style={{ background:'#fffbeb', border:'1.5px solid #fde68a', borderRadius:'10px', padding:'12px 16px', fontSize:'13px', color:'#92400e', display:'flex', alignItems:'center', gap:'8px' }}>
        <span>&#9888;</span>
        <span>2 certificates expiring within 60 days. Please arrange renewal.</span>
      </div>

      {/* Cert cards */}
      {certs.map((cert, i) => {
        const c = colors[cert.urgency]
        return (
          <div key={i} style={{ background:'white', border:`1.5px solid ${c.border}`, borderRadius:'12px', padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px' }}>
              <div>
                <div style={{ fontSize:'14px', fontWeight:600, color:'#1a2233' }}>{cert.client}</div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'12px', color:'#1a4fa0', marginTop:'3px' }}>{cert.num}</div>
              </div>
              <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:'9999px', fontSize:'11px', fontWeight:600, background:c.bg, color:c.color, border:`1px solid ${c.border}` }}>
                {cert.type}
              </span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'12px' }}>
              <div>
                <div style={{ fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#8a96a8', marginBottom:'2px' }}>Scope</div>
                <div style={{ fontSize:'12px', color:'#4a5568' }}>{cert.scope}</div>
              </div>
              <div>
                <div style={{ fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#8a96a8', marginBottom:'2px' }}>Expiry</div>
                <div style={{ fontSize:'12px', fontWeight:600, color: cert.urgency === 'red' ? '#dc2626' : cert.urgency === 'amber' ? '#b45309' : '#15803d' }}>{cert.exp}</div>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:'12px', color:c.color, fontWeight:500 }}>{cert.status}</span>
              <button onClick={() => showToast('Coming soon', 'info')}
                style={{ padding:'7px 14px', background:c.bg, border:`1px solid ${c.border}`, borderRadius:'8px', fontSize:'12px', fontWeight:600, color:c.color, cursor:'pointer' }}>
                {cert.urgency === 'green' ? 'View' : 'Renew'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
