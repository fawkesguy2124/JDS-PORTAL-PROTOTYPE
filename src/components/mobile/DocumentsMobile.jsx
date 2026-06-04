export default function DocumentsMobile({
  jobs,
  documents,
  expandedJobId,
  setExpandedJobId,
  onUpload,
  onPreview,
  onDownload,
  onDelete,
  isAdmin,
  docSearch,
  setDocSearch,
}) {
  const grouped = (jobs || []).reduce((acc, job) => {
    acc[job.id] = { job, docs: (documents || []).filter(d => d.job_id === job.id) }
    return acc
  }, {})

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>

      {/* Search */}
      <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'white', border:'1.5px solid #e2e6ed', borderRadius:'10px', padding:'0 14px', height:'46px' }}>
        <span style={{ fontSize:'16px', color:'#8a96a8' }}>🔍</span>
        <input value={docSearch} onChange={e => setDocSearch(e.target.value)}
          placeholder="Search job or client..."
          style={{ border:'none', outline:'none', background:'transparent', fontSize:'16px', color:'#1a2233', width:'100%' }} />
      </div>

      {/* Job accordion */}
      {Object.values(grouped).filter(({ docs, job }) =>
        !docSearch || job.job_no?.toLowerCase().includes(docSearch.toLowerCase()) || job.client?.toLowerCase().includes(docSearch.toLowerCase())
      ).map(({ job, docs }) => {
        const isOpen = expandedJobId === job.id
        return (
          <div key={job.id} style={{ background:'white', border:'1.5px solid #e2e6ed', borderRadius:'12px', overflow:'hidden' }}>
            <div
              onClick={() => setExpandedJobId(isOpen ? null : job.id)}
              style={{ padding:'14px 16px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
            >
              <div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'14px', fontWeight:700, color:'#1a4fa0' }}>{job.job_no}</div>
                <div style={{ fontSize:'12px', color:'#4a5568', marginTop:'2px' }}>{job.client}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                <span style={{ fontSize:'12px', color:'#8a96a8' }}>{docs.length} doc{docs.length !== 1 ? 's' : ''}</span>
                <span style={{ fontSize:'12px', color:'#8a96a8' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop:'1px solid #e2e6ed' }}>
                {/* Upload button */}
                <div style={{ padding:'10px 16px', borderBottom:'1px solid #f4f6f9' }}>
                  <button onClick={() => onUpload(job)}
                    style={{ width:'100%', padding:'10px 0', background:'#e8eef8', border:'1.5px solid #bfdbfe', borderRadius:'8px', color:'#1a4fa0', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
                    Upload Document
                  </button>
                </div>

                {/* Document list */}
                {docs.length === 0 ? (
                  <div style={{ padding:'16px', textAlign:'center', fontSize:'12px', color:'#8a96a8' }}>No documents uploaded yet.</div>
                ) : docs.map(doc => (
                  <div key={doc.id} style={{ padding:'12px 16px', borderBottom:'1px solid #f4f6f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={{ fontSize:'13px', fontWeight:500, color:'#1a2233', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.file_name}</div>
                      <div style={{ fontSize:'11px', color:'#8a96a8', marginTop:'2px' }}>{doc.doc_type} · {doc.uploaded_by_name}</div>
                    </div>
                    <div style={{ display:'flex', gap:'6px', marginLeft:'10px', flexShrink:0 }}>
                      <button onClick={() => onPreview(doc)}
                        style={{ padding:'6px 10px', background:'#f8f9fb', border:'1px solid #e2e6ed', borderRadius:'6px', fontSize:'12px', cursor:'pointer' }}>View</button>
                      <button onClick={() => onDownload(doc)}
                        style={{ padding:'6px 10px', background:'#f8f9fb', border:'1px solid #e2e6ed', borderRadius:'6px', fontSize:'12px', cursor:'pointer' }}>Download</button>
                      {isAdmin && (
                        <button onClick={() => onDelete(doc)}
                          style={{ padding:'6px 10px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'6px', fontSize:'12px', cursor:'pointer', color:'#dc2626' }}>Delete</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
