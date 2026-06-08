function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '\u2014'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatUploadDate(ts) {
  if (!ts) return '\u2014'
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const DOC_TYPE_COLORS = {
  BL: 'bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]',
  Invoice: 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]',
  'Packing List': 'bg-[#f0fdfa] text-[#0f766e] border border-[#99f6e4]',
  COO: 'bg-[#f5f3ff] text-[#5b21b6] border border-[#ddd6fe]',
  Insurance: 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]',
  BE: 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]',
  'Examination Order': 'bg-[#fff7ed] text-[#c2410c] border border-[#fed7aa]',
  OOC: 'bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]',
  'E-Way Bill': 'bg-[#eef2ff] text-[#3730a3] border border-[#c7d2fe]',
  POD: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]',
  Other: 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]',
}

const btnBase = 'h-8 px-3 text-xs rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

function fileIcon(doc) {
  const ext = (doc.file_type || '').toLowerCase()
  if (['pdf'].includes(ext)) return <span className="text-red-500 font-bold text-sm">PDF</span>
  if (['jpg', 'jpeg', 'png'].includes(ext)) return <span className="text-green-500 font-bold text-sm">IMG</span>
  return <span className="text-[#8a96a8] font-bold text-sm">DOC</span>
}

export default function DocumentsDesktop({
  accordionItems,
  expandedJobId,
  setExpandedJobId,
  onUpload,
  onPreview,
  onDownload,
  onDelete,
  isAdmin,
  userId,
  docSearch,
  setDocSearch,
  loadingDocs,
}) {
  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-lg font-bold text-[#1a2233]">Documents</div>
          <div className="text-sm text-[#8a96a8]">Operational document register \u2014 all jobs</div>
        </div>
        <div className="flex items-center h-9 px-3 bg-[#f8f9fb] border-[1.5px] border-[#e2e6ed] rounded-lg min-w-[240px]">
          <input value={docSearch} onChange={(e) => setDocSearch(e.target.value)}
            placeholder="Search job no., client, file name..."
            className="w-full bg-transparent outline-none text-sm text-[#1a2233] placeholder:text-[#8a96a8]" />
        </div>
      </div>

      {loadingDocs ? (
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-10 flex justify-center">
          <div className="h-9 w-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : accordionItems.length === 0 ? (
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-10 text-center text-[#8a96a8]">
          {docSearch.trim() ? 'No jobs match your search.' : 'No jobs found.'}
        </div>
      ) : (
        <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
          {accordionItems.map((job) => {
            const isExpanded = expandedJobId === job.id
            const docCount = job.docs.length
            return (
              <div key={job.id} id={`doc-job-${job.id}`} className="border-b border-[#e2e6ed] last:border-b-0">
                <div
                  role="button" tabIndex={0}
                  onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setExpandedJobId(isExpanded ? null : job.id) }}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-[#f8f9fb] hover:bg-[#e8eef8] border-b border-[#e2e6ed] transition-colors"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span className="text-sm font-bold text-[#1a2233]">{job.job_no || '\u2014'}</span>
                    <span className="text-xs text-[#8a96a8] truncate">{job.client || ''}</span>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${docCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]'}`}>
                    {docCount} document{docCount !== 1 ? 's' : ''}
                  </span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); onUpload(job); setExpandedJobId(null) }}
                    className={`${btnBase} bg-[#1a4fa0] text-white hover:bg-[#153d82]`}>
                    Upload Document
                  </button>
                  <span className={`text-[#8a96a8] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                </div>
                {isExpanded && (
                  <div className="bg-white px-4 py-4">
                    {docCount === 0 ? (
                      <p className="text-sm text-[#8a96a8] text-center py-6">No documents uploaded yet for this job.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[#8a96a8] border-b border-[#e2e6ed]">
                              <th className="text-left font-semibold uppercase tracking-wide text-xs pb-3 pr-3">File Name</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-xs pb-3 pr-3">Doc Type</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-xs pb-3 pr-3">Uploaded By</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-xs pb-3 pr-3">Date & Time</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-xs pb-3 pr-3">Size</th>
                              <th className="text-left font-semibold uppercase tracking-wide text-xs pb-3">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {job.docs.map((doc) => {
                              const colorClass = DOC_TYPE_COLORS[doc.doc_type] || 'bg-[#f9fafb] text-[#4a5568] border border-[#d0d6e0]'
                              const canDelete = isAdmin || doc.uploaded_by === userId
                              return (
                                <tr key={doc.id} className="border-b border-[#e2e6ed] last:border-b-0">
                                  <td className="py-3 pr-3">
                                    <div className="flex items-center gap-2">
                                      {fileIcon(doc)}
                                      <span className="text-[#1a2233] font-medium truncate max-w-[200px]" title={doc.file_name}>{doc.file_name}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 pr-3">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${colorClass}`}>{doc.doc_type}</span>
                                  </td>
                                  <td className="py-3 pr-3 text-[#4a5568]">{doc.uploaded_by_name || '\u2014'}</td>
                                  <td className="py-3 pr-3 text-[#8a96a8] whitespace-nowrap">{formatUploadDate(doc.created_at)}</td>
                                  <td className="py-3 pr-3 text-[#8a96a8] whitespace-nowrap">{formatFileSize(doc.file_size)}</td>
                                  <td className="py-2">
                                    <div className="flex items-center gap-1.5">
                                      <button type="button" onClick={() => onPreview(doc)}
                                        className="h-7 px-2.5 text-xs rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-semibold">
                                        View
                                      </button>
                                      <a href={doc.file_url} download={doc.file_name}
                                        className="h-7 px-2.5 text-xs rounded-md bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0] hover:text-[#1a4fa0] hover:bg-[#e8eef8] font-semibold inline-flex items-center no-underline">
                                        Download
                                      </a>
                                      {canDelete && (
                                        <button type="button" onClick={() => onDelete(doc)}
                                          className="h-7 px-2.5 text-xs rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-semibold">
                                          Delete
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
