export default function ComplianceDesktop({ showToast }) {
  return (
    <div>
      {/* Alert Banner */}
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#fffbeb] border-[1.5px] border-[#fde68a] text-[#92400e] text-sm mb-4">
        <span className="text-lg">&#9888;</span>
        <span>2 certificates expiring within 60 days. Please arrange renewal.</span>
      </div>

      {/* BIS & Licence Register */}
      <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e2e6ed] flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-[#1a2233]">BIS &amp; Licence Register</div>
            <div className="text-xs text-[#8a96a8] mt-0.5">Certificate and licence expiry tracking</div>
          </div>
          <button type="button" onClick={() => showToast('Coming soon', 'info')}
            className="h-8 px-3 text-xs font-semibold rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] transition-colors">+ Add Certificate</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#f8f9fb]">
              <tr>
                <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Client</th>
                <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Cert Type</th>
                <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Cert Number</th>
                <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Product / Scope</th>
                <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Expiry Date</th>
                <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Status</th>
                <th className="text-xs font-semibold uppercase tracking-wide text-[#8a96a8] px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {[
                {client:'Green Soul Agri',type:'BIS',num:'R-41234567',scope:'Sprinkler systems',exp:'15 Jun 2026',status:'Expiring in 19 days',badge:'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]',act:'Renew'},
                {client:'NNC Industries',type:'LMPC',num:'LMPC-MH-2345',scope:'Electronic instruments',exp:'30 Jul 2026',status:'Renew in 64 days',badge:'bg-[#fffbeb] text-[#92400e] border-[#fde68a]',act:'Renew'},
                {client:'Jiger Plastics',type:'Advance Licence',num:'ALU/2324/123456',scope:'HDPE raw material',exp:'15 Mar 2027',status:'Valid',badge:'bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]',act:'View'},
                {client:'PCM India',type:'BIS',num:'R-52345678',scope:'Concrete pump parts',exp:'20 Sep 2026',status:'Valid',badge:'bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]',act:'View'},
              ].map((r,i) => (
                <tr key={i} className="border-b border-[#e2e6ed] text-sm hover:bg-[#e8eef8]">
                  <td className="px-4 py-3 text-[#1a2233] font-medium">{r.client}</td>
                  <td className="px-4 py-3 text-[#4a5568]">{r.type}</td>
                  <td className="px-4 py-3 font-mono text-[#1a4fa0]">{r.num}</td>
                  <td className="px-4 py-3 text-[#4a5568]">{r.scope}</td>
                  <td className="px-4 py-3 text-[#4a5568]">{r.exp}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${r.badge}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => showToast('Coming soon', 'info')}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#e8eef8] border border-[#bfdbfe] text-[#1a4fa0] hover:bg-[#1a4fa0] hover:text-white transition-all">{r.act}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
