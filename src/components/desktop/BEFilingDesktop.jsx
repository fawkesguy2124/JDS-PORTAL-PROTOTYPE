import { useEffect, useState } from 'react'

const btnBase = 'h-9 px-4 text-xs font-semibold rounded-lg transition-all inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed'
const inputBase = 'w-full h-9 px-3 text-sm rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#e8eef8] disabled:opacity-60 disabled:cursor-not-allowed'
const labelBase = 'text-[10px] font-bold uppercase tracking-widest text-[#8a96a8] mb-1'

function StatusBadge({ status }) {
  const map = {
    not_started: { bg: '#f4f6f9', text: '#8a96a8', label: 'Not Started' },
    in_progress: { bg: '#fffbeb', text: '#92400e', label: 'In Progress' },
    ready: { bg: '#eff6ff', text: '#1e40af', label: 'Ready to File' },
    filed: { bg: '#f0fdf4', text: '#15803d', label: 'Filed' },
  }
  const s = map[status] || map.not_started
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: s.bg, color: s.text }}>
      {s.label}
    </span>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <p className={labelBase}>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</p>
      {children}
    </div>
  )
}

function Skeleton({ height }) {
  return <div className="rounded-lg bg-[#f4f6f9] animate-pulse" style={{ height: height || '36px' }} />
}

export default function BEFilingDesktop({
  jobs, beDrafts, clientMaster, selectedJob, selectingJob, onSelectJob,
  draftTab, setDraftTab, saving, filedJobs,
  getDraft, onSaveDraft, onAutoSave, onMarkFiled,
  onSaveClientMaster, calculateDuties,
  BE_TYPE_OPTIONS, FCL_LCL_OPTIONS, VALUATION_METHODS,
  showToast, currentUserName, user,
}) {
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState(null)
  const [localSaving, setLocalSaving] = useState(false)
  const [showFileConfirm, setShowFileConfirm] = useState(false)

  useEffect(() => {
    if (selectedJob) {
      const existing = getDraft(selectedJob.id)
      if (existing) {
        setDraft({ ...existing })
      } else {
        setDraft(null)
      }
    } else {
      setDraft(null)
    }
  }, [selectedJob, beDrafts])

  const filteredJobs = (jobs || []).filter(j => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (j.job_no || '').toLowerCase().includes(q) || (j.client || '').toLowerCase().includes(q)
  })

  const updateField = (key) => (e) => {
    const val = e.target.value
    setDraft(prev => ({ ...prev, [key]: val }))
  }

  const updateNumber = (key) => (e) => {
    const val = e.target.value === '' ? null : Number(e.target.value)
    setDraft(prev => ({ ...prev, [key]: val }))
  }

  const handleBlur = () => {
    if (draft?.id && draft?.status !== 'not_started' && draft?.status !== 'filed') {
      onAutoSave(draft.id, draft)
    }
  }

  const handleSave = () => {
    if (draft?.id) onSaveDraft(draft.id, draft)
  }

  const FILE_CONFIRM_STYLE = {
    overlay: { position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' },
    modal: { background:'white', borderRadius:'12px', padding:'24px', width:'420px', maxWidth:'90vw', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' },
  }

  const handleExportJSON = () => {
    if (!draft) return
    const exportData = { ...draft }
    delete exportData.id
    delete exportData.created_at
    delete exportData.updated_at
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `BE_Draft_${draft.job_no || 'export'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display:'flex', gap:'16px', alignItems:'flex-start' }}>

      {/* ── LEFT SIDEBAR ── */}
      <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden"
        style={{ width:'320px', minWidth:'320px', maxHeight:'calc(100vh - 120px)', display:'flex', flexDirection:'column' }}>
        <div className="px-4 py-3 border-b border-[#e2e6ed] bg-[#f8f9fb]">
          <div className="text-sm font-bold text-[#1a2233]">BE Filing</div>
          <div className="text-xs text-[#8a96a8] mt-0.5">{jobs?.length || 0} jobs</div>
        </div>
        <div className="px-4 py-2.5 border-b border-[#e2e6ed]">
          <div className="flex items-center gap-2 h-9 px-3 bg-[#f8f9fb] border-[1.5px] border-[#e2e6ed] rounded-lg focus-within:border-[#1a4fa0] focus-within:bg-white transition-colors">
            <span className="text-xs text-[#8a96a8]">🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search job no. or client..."
              className="flex-1 bg-transparent outline-none text-xs text-[#1a2233] placeholder:text-[#8a96a8]" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[#e2e6ed]">
          {filteredJobs.map(job => {
            const draft = getDraft(job.id)
            const status = draft?.status || 'not_started'
            const pct = draft?.completeness_pct || 0
            const isSelected = selectedJob?.id === job.id
            return (
              <div key={job.id} role="button" tabIndex={0}
                onClick={() => onSelectJob(job)}
                onKeyDown={e => e.key === 'Enter' && onSelectJob(job)}
                className="px-4 py-3 cursor-pointer transition-colors"
                style={{
                  background: isSelected ? '#e8eef8' : 'transparent',
                  borderLeft: isSelected ? '3px solid #1a4fa0' : '3px solid transparent',
                }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-bold text-[#1a4fa0] font-mono truncate">{job.job_no || '—'}</span>
                  <StatusBadge status={status} />
                </div>
                <div className="text-xs text-[#8a96a8] truncate">{job.client || '—'}</div>
                {status === 'in_progress' && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-[#e2e6ed] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? '#16a34a' : '#f59e0b' }} />
                    </div>
                    <span className="text-[10px] font-semibold text-[#8a96a8]">{pct}%</span>
                  </div>
                )}
              </div>
            )
          })}
          {filteredJobs.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-[#8a96a8]">
              {search.trim() ? 'No jobs match your search.' : 'No jobs available.'}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT WORKSPACE ── */}
      <div className="flex-1 min-w-0">
        {!selectedJob ? (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-16 text-center">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-base font-bold text-[#1a2233] mb-1">BE Filing Workspace</p>
            <p className="text-sm text-[#8a96a8]">Select a job from the left to begin</p>
          </div>
        ) : selectingJob ? (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-16 text-center">
            <div className="h-10 w-10 border-3 border-[#1a4fa0] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-semibold text-[#1a2233]">Creating BE Draft...</p>
            <p className="text-xs text-[#8a96a8] mt-1">Pre-filling from OCR data</p>
          </div>
        ) : !draft ? (
          <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm p-12 text-center">
            <div className="text-3xl mb-4">📄</div>
            <p className="text-base font-bold text-[#1a2233] mb-1">{selectedJob?.job_no}</p>
            <p className="text-sm text-[#8a96a8]">Unable to create draft. Try again.</p>
          </div>
        ) : (
          <div>
            {/* ── TOP BAR ── */}
            <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden mb-4">
              <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div>
                    <span className="text-sm font-bold text-[#1a2233]">{selectedJob.job_no}</span>
                    <span className="text-xs text-[#8a96a8] ml-2">{selectedJob.client}</span>
                  </div>
                  <StatusBadge status={draft.status} />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-[#8a96a8] font-medium">Completeness:</div>
                    <div className="w-24 h-2 bg-[#e2e6ed] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${draft.completeness_pct || 0}%`, background: (draft.completeness_pct || 0) >= 90 ? '#16a34a' : '#f59e0b' }} />
                    </div>
                    <span className="text-xs font-bold" style={{ color: (draft.completeness_pct || 0) >= 90 ? '#16a34a' : '#f59e0b' }}>{draft.completeness_pct || 0}%</span>
                  </div>
                  <button type="button" onClick={handleSave} disabled={saving || localSaving || draft.status === 'filed'}
                    className={`${btnBase} ${draft.status === 'filed' ? 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]' : 'bg-[#1a4fa0] text-white hover:bg-[#153d82]'}`}>
                    {saving || localSaving ? 'Saving...' : 'Save Draft'}
                  </button>
                  {draft.status !== 'filed' && (
                    <button type="button" onClick={() => setShowFileConfirm(true)}
                      className={`${btnBase} bg-[#16a34a] text-white hover:bg-[#15803d]`}>
                      Mark as Filed
                    </button>
                  )}
                  <button type="button" onClick={handleExportJSON}
                    className={`${btnBase} bg-white border-[1.5px] border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0]`}>
                    ↓ Export JSON
                  </button>
                </div>
              </div>
              {/* Tab bar */}
              <div className="flex gap-0 border-t border-[#e2e6ed] bg-[#f8f9fb]">
                {[
                  { id: 'part1', label: 'Part I — Shipment & Parties' },
                  { id: 'part2', label: 'Part II — Invoices & Items' },
                  { id: 'part3', label: 'Part III — Duties' },
                  { id: 'part4', label: 'Supporting Docs' },
                ].map(t => (
                  <button key={t.id} type="button" onClick={() => setDraftTab(t.id)}
                    className="flex-1 py-2.5 text-xs font-bold transition-colors"
                    style={{
                      background: draftTab === t.id ? 'white' : 'transparent',
                      color: draftTab === t.id ? '#1a4fa0' : '#8a96a8',
                      borderBottom: draftTab === t.id ? '2px solid #1a4fa0' : '2px solid transparent',
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── PART I — SHIPMENT & PARTIES ── */}
            {draftTab === 'part1' && (
              <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e2e6ed] bg-[#f8f9fb]">
                  <span className="text-sm font-bold text-[#1a2233]">BE Details</span>
                </div>
                <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">
                  <Field label="BE Type" required>
                    <select value={draft.be_type || ''} onChange={updateField('be_type')} onBlur={handleBlur} className={inputBase}>
                      <option value="">Select BE Type</option>
                      {BE_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Port Code">
                    <input type="text" value={draft.port_code || ''} onChange={updateField('port_code')} onBlur={handleBlur} className={inputBase} placeholder="e.g. INNSA1" />
                  </Field>
                  <Field label="CB Code">
                    <input type="text" value={draft.cb_code || 'AADCJ9119RCH001'} onChange={updateField('cb_code')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="IGM No">
                    <input type="text" value={draft.igm_no || ''} onChange={updateField('igm_no')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="IGM Date">
                    <input type="date" value={draft.igm_date || ''} onChange={updateField('igm_date')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="HAWB / HBL No">
                    <input type="text" value={draft.hawb_no || ''} onChange={updateField('hawb_no')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="HAWB / HBL Date">
                    <input type="date" value={draft.hawb_date || ''} onChange={updateField('hawb_date')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="BL / AWB Date">
                    <input type="date" value={draft.bl_date || ''} onChange={updateField('bl_date')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="Container No">
                    <input type="text" value={draft.container_no || ''} onChange={updateField('container_no')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="Seal No">
                    <input type="text" value={draft.seal_no || ''} onChange={updateField('seal_no')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="FCL / LCL" required>
                    <select value={draft.fcl_lcl || ''} onChange={updateField('fcl_lcl')} onBlur={handleBlur} className={inputBase}>
                      <option value="">Select</option>
                      {FCL_LCL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Package Count">
                    <input type="number" min="0" value={draft.package_count ?? ''} onChange={updateNumber('package_count')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="Gross Weight (KGS)">
                    <input type="number" min="0" step="0.001" value={draft.gross_weight ?? ''} onChange={updateNumber('gross_weight')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="Net Weight (KGS)">
                    <input type="number" min="0" step="0.001" value={draft.net_weight ?? ''} onChange={updateNumber('net_weight')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                </div>

                <div className="px-5 py-4 border-t border-b border-[#e2e6ed] bg-[#f8f9fb]">
                  <span className="text-sm font-bold text-[#1a2233]">Country & Port</span>
                </div>
                <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">
                  <Field label="Country of Origin">
                    <input type="text" value={draft.country_of_origin || ''} onChange={updateField('country_of_origin')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="Country of Consignment">
                    <input type="text" value={draft.country_of_consignment || ''} onChange={updateField('country_of_consignment')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="Port of Loading">
                    <input type="text" value={draft.port_of_loading || ''} onChange={updateField('port_of_loading')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="Port of Shipment">
                    <input type="text" value={draft.port_of_shipment || ''} onChange={updateField('port_of_shipment')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="Port of Discharge">
                    <input type="text" value={draft.port_of_discharge || ''} onChange={updateField('port_of_discharge')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                </div>

                <div className="px-5 py-4 border-t border-b border-[#e2e6ed] bg-[#f8f9fb]">
                  <span className="text-sm font-bold text-[#1a2233]">Importer Details</span>
                </div>
                <div className="p-5">
                  <ImporterSection draft={draft} setDraft={setDraft} updateField={updateField} handleBlur={handleBlur}
                    clientMaster={clientMaster} onSaveClientMaster={onSaveClientMaster}
                    selectedJob={selectedJob} inputBase={inputBase} labelBase={labelBase} />
                </div>

                <div className="px-5 py-4 border-t border-b border-[#e2e6ed] bg-[#f8f9fb]">
                  <span className="text-sm font-bold text-[#1a2233]">Supplier Details</span>
                </div>
                <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">
                  <Field label="Supplier Name">
                    <input type="text" value={draft.supplier_name || ''} onChange={updateField('supplier_name')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="Supplier Country">
                    <input type="text" value={draft.supplier_country || ''} onChange={updateField('supplier_country')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Supplier Address">
                      <textarea rows={2} value={draft.supplier_address || ''} onChange={updateField('supplier_address')} onBlur={handleBlur}
                        className="w-full px-3 py-2 text-sm rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0] resize-none" />
                    </Field>
                  </div>
                </div>

                <div className="px-5 py-4 border-t border-b border-[#e2e6ed] bg-[#f8f9fb]">
                  <span className="text-sm font-bold text-[#1a2233]">Valuation & Bond</span>
                </div>
                <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">
                  <Field label="Valuation Method">
                    <select value={draft.valuation_method || 'Rule 3'} onChange={updateField('valuation_method')} onBlur={handleBlur} className={inputBase}>
                      {VALUATION_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                  <Field label="SVB Case">
                    <select value={draft.svb_flag ? 'yes' : 'no'} onChange={e => setDraft(prev => ({ ...prev, svb_flag: e.target.value === 'yes' }))} onBlur={handleBlur} className={inputBase}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </Field>
                  {draft.svb_flag && (
                    <Field label="SVB Reference">
                      <input type="text" value={draft.svb_reference || ''} onChange={updateField('svb_reference')} onBlur={handleBlur} className={inputBase} />
                    </Field>
                  )}
                  <Field label="Bond No">
                    <input type="text" value={draft.bond_no || ''} onChange={updateField('bond_no')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="Bond Port">
                    <input type="text" value={draft.bond_port || ''} onChange={updateField('bond_port')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="Bond CD">
                    <input type="text" value={draft.bond_cd || ''} onChange={updateField('bond_cd')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="Debt Amount">
                    <input type="number" min="0" step="0.01" value={draft.debt_amount ?? ''} onChange={updateNumber('debt_amount')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                  <Field label="BG Amount">
                    <input type="number" min="0" step="0.01" value={draft.bg_amount ?? ''} onChange={updateNumber('bg_amount')} onBlur={handleBlur} className={inputBase} />
                  </Field>
                </div>
              </div>
            )}

            {/* ── PART II — INVOICES & ITEMS ── */}
            {draftTab === 'part2' && (
              <PartIIView draft={draft} setDraft={setDraft} handleBlur={handleBlur}
                inputBase={inputBase} labelBase={labelBase} btnBase={btnBase} />
            )}

            {/* ── PART III — DUTIES ── */}
            {draftTab === 'part3' && (
              <PartIIIView draft={draft} setDraft={setDraft} handleBlur={handleBlur}
                inputBase={inputBase} labelBase={labelBase} btnBase={btnBase} calculateDuties={calculateDuties} />
            )}

            {/* ── PART IV — SUPPORTING DOCS ── */}
            {draftTab === 'part4' && (
              <PartIVView draft={draft} setDraft={setDraft} handleBlur={handleBlur}
                inputBase={inputBase} labelBase={labelBase} btnBase={btnBase} />
            )}
          </div>
        )}
      </div>

      {/* ── FILE CONFIRMATION MODAL ── */}
      {showFileConfirm && (
        <div style={FILE_CONFIRM_STYLE.overlay} onClick={() => setShowFileConfirm(false)}>
          <div style={FILE_CONFIRM_STYLE.modal} onClick={e => e.stopPropagation()}>
            <div className="text-lg font-bold text-[#1a2233] mb-2">Mark as Filed</div>
            <p className="text-sm text-[#4a5568] mb-6">
              Mark BE for <strong>{selectedJob?.job_no}</strong> as filed? This will move the job to Customs Review stage.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowFileConfirm(false)}
                className="h-9 px-4 text-sm font-semibold rounded-lg bg-white border border-[#d0d6e0] text-[#4a5568] hover:bg-[#f4f6f9]">
                Cancel
              </button>
              <button type="button" onClick={async () => {
                setShowFileConfirm(false)
                await onMarkFiled(draft.id, selectedJob.id)
              }}
                className="h-9 px-4 text-sm font-semibold rounded-lg bg-[#16a34a] text-white hover:bg-[#15803d]">
                Confirm — Mark as Filed
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

/* ── IMPORTER SUBSECTION ── */
function ImporterSection({ draft, setDraft, updateField, handleBlur, clientMaster, onSaveClientMaster, selectedJob, inputBase, labelBase }) {
  const [showSaveMaster, setShowSaveMaster] = useState(false)
  const [clientSearch, setClientSearch] = useState('')

  const filteredClients = (clientMaster || []).filter(c =>
    c.client_name.toLowerCase().includes(clientSearch.toLowerCase())
  )

  const handleClientSelect = (client) => {
    if (!client) return
    setDraft(prev => ({
      ...prev,
      importer_name: client.legal_name || client.client_name,
      importer_address: client.address || prev.importer_address,
      importer_gstin: client.gstin || prev.importer_gstin,
      importer_iec: client.iec || prev.importer_iec,
      ad_code: client.ad_code || prev.ad_code,
    }))
  }

  const handleSaveToMaster = () => {
    const data = {
      legal_name: draft.importer_name || '',
      address: draft.importer_address || '',
      gstin: draft.importer_gstin || '',
      iec: draft.importer_iec || '',
      ad_code: draft.ad_code || '',
    }
    onSaveClientMaster(selectedJob?.client || draft.importer_name, data)
    setShowSaveMaster(false)
  }

  return (
    <div>
      <div className="mb-4">
        <p className={labelBase}>Select Client (auto-fill from master)</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
              placeholder="Type to search registered clients..."
              className={inputBase} />
            {clientSearch && filteredClients.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e2e6ed] rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                {filteredClients.map(c => (
                  <div key={c.id} role="button" tabIndex={0}
                    onClick={() => { handleClientSelect(c); setClientSearch(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleClientSelect(c)}
                    className="px-3 py-2 text-sm text-[#1a2233] hover:bg-[#e8eef8] cursor-pointer">
                    {c.client_name} {c.legal_name && c.legal_name !== c.client_name ? `(${c.legal_name})` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => setShowSaveMaster(true)}
            className={`${btnBase} bg-white border border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0]`}>
            Save to Master
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Field label="Importer Name" required>
          <input type="text" value={draft.importer_name || ''} onChange={updateField('importer_name')} onBlur={handleBlur} className={inputBase} />
        </Field>
        <Field label="GSTIN">
          <input type="text" value={draft.importer_gstin || ''} onChange={updateField('importer_gstin')} onBlur={handleBlur} className={inputBase} placeholder="15-character GSTIN" />
        </Field>
        <Field label="IEC" required>
          <input type="text" value={draft.importer_iec || ''} onChange={updateField('importer_iec')} onBlur={handleBlur} className={inputBase} placeholder="10-digit IEC" />
        </Field>
        <Field label="AD Code">
          <input type="text" value={draft.ad_code || ''} onChange={updateField('ad_code')} onBlur={handleBlur} className={inputBase} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Importer Address">
            <textarea rows={2} value={draft.importer_address || ''} onChange={updateField('importer_address')} onBlur={handleBlur}
              className="w-full px-3 py-2 text-sm rounded-lg bg-white border-[1.5px] border-[#e2e6ed] text-[#1a2233] outline-none focus:border-[#1a4fa0] resize-none" />
          </Field>
        </div>
      </div>

      {showSaveMaster && (
        <div className="mt-4 p-4 bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl">
          <p className="text-xs font-bold text-[#1a2233] mb-2">Save to Client Master</p>
          <p className="text-xs text-[#8a96a8] mb-3">This will save the current importer details to client_master for future auto-fill.</p>
          <div className="flex gap-3">
            <button type="button" onClick={handleSaveToMaster}
              className="h-8 px-3 text-xs font-semibold rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82]">
              Save
            </button>
            <button type="button" onClick={() => setShowSaveMaster(false)}
              className="h-8 px-3 text-xs font-semibold rounded-lg bg-white border border-[#d0d6e0] text-[#4a5568]">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── PART II — INVOICES & ITEMS ── */
function PartIIView({ draft, setDraft, handleBlur, inputBase, labelBase, btnBase }) {
  const invoices = draft.invoices || []
  const lineItems = draft.line_items || []
  const exchangeRates = draft.exchange_rates || {}
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [bulkCth, setBulkCth] = useState('')
  const [page, setPage] = useState(0)
  const PER_PAGE = 25

  const addInvoice = () => {
    setDraft(prev => ({
      ...prev,
      invoices: [...(prev.invoices || []), { invoice_no: '', date: '', amount: null, currency: 'USD', payment_terms: '', freight_amount: null, insurance_amount: null }],
    }))
  }

  const updateInvoice = (i, key) => (e) => {
    const val = e.target.value
    setDraft(prev => {
      const inv = [...(prev.invoices || [])]
      inv[i] = { ...inv[i], [key]: key === 'amount' || key === 'freight_amount' || key === 'insurance_amount' ? (val === '' ? null : Number(val)) : val }
      return { ...prev, invoices: inv }
    })
  }

  const removeInvoice = (i) => {
    setDraft(prev => ({ ...prev, invoices: (prev.invoices || []).filter((_, idx) => idx !== i) }))
  }

  const addLineItem = () => {
    const invoices = draft.invoices || []
    setDraft(prev => ({
      ...prev,
      line_items: [...(prev.line_items || []), { sno: (prev.line_items || []).length + 1, invoice_no: invoices[0]?.invoice_no || '', cth: '', description: '', unit_price: null, quantity: null, uqc: 'NOS', amount: null, currency: invoices[0]?.currency || 'USD', country_of_origin: '' }],
    }))
    setPage(Math.floor((lineItems.length) / PER_PAGE))
  }

  const updateLineItem = (i, key) => (e) => {
    let val = e.target.value
    if (key === 'unit_price' || key === 'quantity' || key === 'amount') val = val === '' ? null : Number(val)
    setDraft(prev => {
      const items = [...(prev.line_items || [])]
      items[i] = { ...items[i], [key]: val }
      return { ...prev, line_items: items }
    })
  }

  const removeLineItem = (i) => {
    setDraft(prev => ({
      ...prev,
      line_items: (prev.line_items || []).filter((_, idx) => idx !== i).map((item, idx) => ({ ...item, sno: idx + 1 })),
    }))
  }

  const toggleItem = (i) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const applyBulkCth = () => {
    if (!bulkCth.trim()) return
    setDraft(prev => ({
      ...prev,
      line_items: (prev.line_items || []).map((item, idx) =>
        selectedItems.has(idx) ? { ...item, cth: bulkCth.trim() } : item
      ),
    }))
    setSelectedItems(new Set())
    setBulkCth('')
  }

  const updateExchangeRate = (currency) => (e) => {
    const val = e.target.value === '' ? null : Number(e.target.value)
    setDraft(prev => ({
      ...prev,
      exchange_rates: { ...(prev.exchange_rates || {}), [currency]: val },
    }))
  }

  const addCurrency = () => {
    setDraft(prev => ({
      ...prev,
      exchange_rates: { ...(prev.exchange_rates || {}), '': null },
    }))
  }

  const pageCount = Math.ceil(lineItems.length / PER_PAGE)
  const pageItems = lineItems.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  return (
    <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
      {/* Invoices */}
      <div className="px-5 py-4 border-b border-[#e2e6ed] bg-[#f8f9fb] flex items-center justify-between">
        <span className="text-sm font-bold text-[#1a2233]">Invoices</span>
        <button type="button" onClick={addInvoice}
          className={`${btnBase} bg-white border border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0]`}>
          + Add Invoice
        </button>
      </div>
      <div className="p-5 space-y-3">
        {invoices.length === 0 && (
          <p className="text-sm text-[#8a96a8] italic">No invoices extracted. Add one manually.</p>
        )}
        {invoices.map((inv, i) => (
          <div key={i} className="flex items-start gap-3 p-4 bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <p className={labelBase}>Invoice No</p>
              <input type="text" value={inv.invoice_no || ''} onChange={updateInvoice(i, 'invoice_no')} onBlur={handleBlur} className={inputBase} />
            </div>
            <div className="w-[130px]">
              <p className={labelBase}>Date</p>
              <input type="date" value={inv.date || ''} onChange={updateInvoice(i, 'date')} onBlur={handleBlur} className={inputBase} />
            </div>
            <div className="w-[120px]">
              <p className={labelBase}>Amount</p>
              <input type="number" min="0" step="0.01" value={inv.amount ?? ''} onChange={updateInvoice(i, 'amount')} onBlur={handleBlur} className={inputBase} />
            </div>
            <div className="w-[80px]">
              <p className={labelBase}>Currency</p>
              <select value={inv.currency || 'USD'} onChange={updateInvoice(i, 'currency')} onBlur={handleBlur} className={inputBase}>
                {['USD','EUR','GBP','CNY','JPY','AUD','SGD','HKD','INR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="w-[120px]">
              <p className={labelBase}>Payment Terms</p>
              <select value={inv.payment_terms || ''} onChange={updateInvoice(i, 'payment_terms')} onBlur={handleBlur} className={inputBase}>
                <option value="">Select</option>
                <option value="CIF">CIF</option>
                <option value="FOB">FOB</option>
                <option value="CNF">CNF</option>
                <option value="CFR">CFR</option>
                <option value="EXW">EXW</option>
              </select>
            </div>
            <div className="w-[100px]">
              <p className={labelBase}>Freight</p>
              <input type="number" min="0" step="0.01" value={inv.freight_amount ?? ''} onChange={updateInvoice(i, 'freight_amount')} onBlur={handleBlur} className={inputBase} />
            </div>
            <div className="w-[100px]">
              <p className={labelBase}>Insurance</p>
              <input type="number" min="0" step="0.01" value={inv.insurance_amount ?? ''} onChange={updateInvoice(i, 'insurance_amount')} onBlur={handleBlur} className={inputBase} />
            </div>
            <button type="button" onClick={() => removeInvoice(i)}
              className="shrink-0 mt-5 h-9 w-9 flex items-center justify-center rounded-lg border border-[#e2e6ed] text-[#8a96a8] hover:text-red-600 hover:border-red-200 transition-colors text-lg">
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Exchange Rates */}
      <div className="px-5 py-4 border-t border-b border-[#e2e6ed] bg-[#f8f9fb]">
        <span className="text-sm font-bold text-[#1a2233]">Exchange Rates</span>
      </div>
      <div className="p-5">
        <div className="mb-3 px-4 py-2.5 bg-[#fffbeb] border border-[#fde68a] rounded-lg text-xs text-[#92400e]">
          ⚠ Use CBEC weekly notified rates — not market/bank rates. Akshyani fills these manually.
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(exchangeRates || {}).map(([currency, rate]) => (
            <div key={currency} className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#1a2233] w-10">{currency}</span>
              <input type="number" min="0" step="0.01" value={rate ?? ''} onChange={updateExchangeRate(currency)} onBlur={handleBlur}
                className={inputBase} placeholder="Rate" />
              <span className="text-xs text-[#8a96a8]">INR</span>
            </div>
          ))}
          <button type="button" onClick={addCurrency}
            className="h-9 px-3 text-xs font-semibold rounded-lg border border-dashed border-[#d0d6e0] text-[#8a96a8] hover:border-[#1a4fa0] hover:text-[#1a4fa0] transition-colors">
            + Add Currency
          </button>
        </div>
      </div>

      {/* Line Items */}
      <div className="px-5 py-4 border-t border-b border-[#e2e6ed] bg-[#f8f9fb] flex items-center justify-between">
        <div>
          <span className="text-sm font-bold text-[#1a2233]">Line Items</span>
          <span className="text-xs text-[#8a96a8] ml-2">{lineItems.length} items across {new Set(lineItems.map(i => i.invoice_no).filter(Boolean)).size || invoices.length} invoices</span>
        </div>
        <button type="button" onClick={addLineItem}
          className={`${btnBase} bg-white border border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0]`}>
          + Add Row
        </button>
      </div>

      {selectedItems.size > 0 && (
        <div className="px-5 py-2.5 bg-[#eff6ff] border-b border-[#bfdbfe] flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-[#1e40af]">{selectedItems.size} selected</span>
          <input type="text" value={bulkCth} onChange={e => setBulkCth(e.target.value)}
            placeholder="Enter CTH to assign to selected..."
            className="h-8 px-3 text-xs rounded-lg border border-[#bfdbfe] outline-none focus:border-[#1a4fa0] w-48" />
          <button type="button" onClick={applyBulkCth} disabled={!bulkCth.trim()}
            className="h-8 px-3 text-xs font-semibold rounded-lg bg-[#1a4fa0] text-white hover:bg-[#153d82] disabled:opacity-50">
            Assign CTH
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#f8f9fb] text-[#8a96a8] border-b border-[#e2e6ed]">
              <th className="w-8 px-3 py-2.5 text-left">
                <input type="checkbox" onChange={e => {
                  if (e.target.checked) {
                    setSelectedItems(new Set(pageItems.map((_, idx) => page * PER_PAGE + idx)))
                  } else {
                    setSelectedItems(new Set())
                  }
                }}
                  checked={pageItems.every((_, idx) => selectedItems.has(page * PER_PAGE + idx)) && pageItems.length > 0}
                  className="h-3.5 w-3.5 rounded border-[#d0d6e0] text-[#1a4fa0]" />
              </th>
              <th className="px-2 py-2.5 text-left font-semibold uppercase tracking-wider">S.No</th>
              <th className="px-2 py-2.5 text-left font-semibold uppercase tracking-wider">Invoice</th>
              <th className="px-2 py-2.5 text-left font-semibold uppercase tracking-wider">CTH</th>
              <th className="px-2 py-2.5 text-left font-semibold uppercase tracking-wider">Description</th>
              <th className="px-2 py-2.5 text-right font-semibold uppercase tracking-wider">Qty</th>
              <th className="px-2 py-2.5 text-left font-semibold uppercase tracking-wider">UQC</th>
              <th className="px-2 py-2.5 text-right font-semibold uppercase tracking-wider">Unit Price</th>
              <th className="px-2 py-2.5 text-right font-semibold uppercase tracking-wider">Amount</th>
              <th className="px-2 py-2.5 text-left font-semibold uppercase tracking-wider">Ccy</th>
              <th className="px-2 py-2.5 text-left font-semibold uppercase tracking-wider">Origin</th>
              <th className="w-8 px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item, idx) => {
              const realIdx = page * PER_PAGE + idx
              const cthMissing = !item.cth || String(item.cth).trim() === ''
              return (
                <tr key={realIdx} className="border-t border-[#e2e6ed] hover:bg-[#f8f9fb]">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selectedItems.has(realIdx)} onChange={() => toggleItem(realIdx)}
                      className="h-3.5 w-3.5 rounded border-[#d0d6e0] text-[#1a4fa0]" />
                  </td>
                  <td className="px-2 py-2 text-[#4a5568]">{item.sno}</td>
                  <td className="px-2 py-2">
                    <input type="text" value={item.invoice_no || ''} onChange={updateLineItem(realIdx, 'invoice_no')} onBlur={handleBlur}
                      className="w-24 h-7 px-1.5 rounded border border-transparent hover:border-[#e2e6ed] focus:border-[#1a4fa0] outline-none text-xs bg-transparent" />
                  </td>
                  <td className="px-2 py-2">
                    <input type="text" value={item.cth || ''} onChange={updateLineItem(realIdx, 'cth')} onBlur={handleBlur}
                      className="w-20 h-7 px-1.5 rounded border outline-none text-xs bg-transparent"
                      style={{ borderColor: cthMissing ? '#f59e0b' : 'transparent', background: cthMissing ? '#fffbeb' : 'transparent' }}
                      placeholder="CTH..." />
                  </td>
                  <td className="px-2 py-2 min-w-[150px]">
                    <input type="text" value={item.description || ''} onChange={updateLineItem(realIdx, 'description')} onBlur={handleBlur}
                      className="w-full h-7 px-1.5 rounded border border-transparent hover:border-[#e2e6ed] focus:border-[#1a4fa0] outline-none text-xs bg-transparent" />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="0" step="0.001" value={item.quantity ?? ''} onChange={updateLineItem(realIdx, 'quantity')} onBlur={handleBlur}
                      className="w-16 h-7 px-1.5 rounded border border-transparent hover:border-[#e2e6ed] focus:border-[#1a4fa0] outline-none text-xs bg-transparent text-right" />
                  </td>
                  <td className="px-2 py-2">
                    <select value={item.uqc || 'NOS'} onChange={updateLineItem(realIdx, 'uqc')} onBlur={handleBlur}
                      className="w-16 h-7 rounded border border-transparent hover:border-[#e2e6ed] focus:border-[#1a4fa0] outline-none text-xs bg-transparent">
                      {['NOS','KGS','MTR','PCS','SET','LTR','SQM','DOZ'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="0" step="0.0001" value={item.unit_price ?? ''} onChange={updateLineItem(realIdx, 'unit_price')} onBlur={handleBlur}
                      className="w-20 h-7 px-1.5 rounded border border-transparent hover:border-[#e2e6ed] focus:border-[#1a4fa0] outline-none text-xs bg-transparent text-right" />
                  </td>
                  <td className="px-2 py-2 text-right text-[#1a2233] font-medium">{item.amount != null ? Number(item.amount).toLocaleString() : '—'}</td>
                  <td className="px-2 py-2">
                    <select value={item.currency || 'USD'} onChange={updateLineItem(realIdx, 'currency')} onBlur={handleBlur}
                      className="w-14 h-7 rounded border border-transparent hover:border-[#e2e6ed] focus:border-[#1a4fa0] outline-none text-xs bg-transparent">
                      {['USD','EUR','GBP','CNY','JPY','INR'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input type="text" value={item.country_of_origin || ''} onChange={updateLineItem(realIdx, 'country_of_origin')} onBlur={handleBlur}
                      className="w-12 h-7 px-1.5 rounded border border-transparent hover:border-[#e2e6ed] focus:border-[#1a4fa0] outline-none text-xs bg-transparent" />
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => removeLineItem(realIdx)}
                      className="text-[#d0d6e0] hover:text-red-500 transition-colors text-sm">✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="px-5 py-3 border-t border-[#e2e6ed] flex items-center justify-between">
          <span className="text-xs text-[#8a96a8]">Page {page + 1} of {pageCount} ({lineItems.length} items)</span>
          <div className="flex gap-1">
            <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="h-7 px-3 text-xs font-semibold rounded-lg bg-white border border-[#d0d6e0] text-[#4a5568] disabled:opacity-40 hover:border-[#1a4fa0]">←</button>
            <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)}
              className="h-7 px-3 text-xs font-semibold rounded-lg bg-white border border-[#d0d6e0] text-[#4a5568] disabled:opacity-40 hover:border-[#1a4fa0]">→</button>
          </div>
        </div>
      )}

      {/* Search / Filter within items */}
      <div className="px-5 py-3 border-t border-[#e2e6ed] flex items-center gap-3">
        <span className="text-xs text-[#8a96a8]">Search items:</span>
        <input type="text" placeholder="Filter by CTH, description, or invoice..."
          className="flex-1 h-8 px-3 text-xs rounded-lg border border-[#e2e6ed] outline-none focus:border-[#1a4fa0]" />
      </div>
    </div>
  )
}

/* ── PART III — DUTIES ── */
function PartIIIView({ draft, setDraft, handleBlur, inputBase, labelBase, btnBase, calculateDuties }) {
  const lineItems = draft.line_items || []
  const exchangeRates = draft.exchange_rates || {}
  const dutyLines = draft.duty_lines || []

  useEffect(() => {
    if (lineItems.length && !dutyLines.length) {
      const calculated = calculateDuties(lineItems, exchangeRates)
      setDraft(prev => ({ ...prev, duty_lines: calculated }))
    }
  }, [])

  const updateDutyRate = (idx, key) => (e) => {
    const val = e.target.value === '' ? null : Number(e.target.value)
    setDraft(prev => {
      const lines = [...(prev.duty_lines || [])]
      if (!lines[idx]) return prev
      lines[idx] = { ...lines[idx], [key]: val }

      const bcdRate = lines[idx].bcd_rate || 0
      const igstRate = lines[idx].igst_rate || 0
      const av = lines[idx].assessable_value || 0
      const bcd = Math.round(av * bcdRate / 100)
      const sws = Math.round(bcd * 10 / 100)
      const igst = Math.round((av + bcd + sws) * igstRate / 100)
      const total = bcd + sws + igst

      lines[idx].bcd_amt = bcd
      lines[idx].sws_rate = 10
      lines[idx].sws_amt = sws
      lines[idx].igst_amt = igst
      lines[idx].total_duty = total

      const totals = lines.reduce((acc, l) => ({
        assessable: acc.assessable + (l.assessable_value || 0),
        bcd: acc.bcd + (l.bcd_amt || 0),
        sws: acc.sws + (l.sws_amt || 0),
        igst: acc.igst + (l.igst_amt || 0),
        duty: acc.duty + (l.total_duty || 0),
      }), { assessable:0, bcd:0, sws:0, igst:0, duty:0 })

      return {
        ...prev,
        duty_lines: lines,
        total_assessable_value: totals.assessable,
        total_bcd: totals.bcd,
        total_sws: totals.sws,
        total_igst: totals.igst,
        total_duty: totals.duty,
      }
    })
  }

  const formatINR = (v) => v != null ? '₹ ' + Number(v).toLocaleString('en-IN') : '—'

  return (
    <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#e2e6ed] bg-[#f8f9fb]">
        <div className="text-sm font-bold text-[#1a2233]">Per-CTH Duty Calculation</div>
        <div className="text-xs text-[#8a96a8] mt-0.5">Line items grouped by CTH. Enter BCD % and IGST % — amounts auto-calculate.</div>
      </div>

      {dutyLines.length === 0 ? (
        <div className="p-8 text-center text-sm text-[#8a96a8]">
          No line items with CTH yet. Add items in Part II first.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f8f9fb] text-[#8a96a8] border-b border-[#e2e6ed]">
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider">CTH</th>
                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider">Assessable Value</th>
                <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider">BCD %</th>
                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider">BCD Amt</th>
                <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider">SWS %</th>
                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider">SWS Amt</th>
                <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider">IGST %</th>
                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider">IGST Amt</th>
                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider">Total Duty</th>
              </tr>
            </thead>
            <tbody>
              {dutyLines.map((line, idx) => (
                <tr key={idx} className="border-t border-[#e2e6ed] hover:bg-[#f8f9fb]">
                  <td className="px-3 py-2.5 font-bold text-[#1a2233]">{line.cth}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-[#1a2233]">{formatINR(line.assessable_value)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <input type="number" min="0" step="0.1" value={line.bcd_rate ?? ''} onChange={updateDutyRate(idx, 'bcd_rate')} onBlur={handleBlur}
                      className="w-16 h-7 px-1.5 text-center rounded border border-[#e2e6ed] outline-none focus:border-[#1a4fa0] text-xs" />
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium">{line.bcd_amt != null ? formatINR(line.bcd_amt) : '—'}</td>
                  <td className="px-3 py-2.5 text-center text-[#8a96a8]">10*</td>
                  <td className="px-3 py-2.5 text-right font-medium">{line.sws_amt != null ? formatINR(line.sws_amt) : '—'}</td>
                  <td className="px-3 py-2.5 text-center">
                    <input type="number" min="0" step="0.1" value={line.igst_rate ?? ''} onChange={updateDutyRate(idx, 'igst_rate')} onBlur={handleBlur}
                      className="w-16 h-7 px-1.5 text-center rounded border border-[#e2e6ed] outline-none focus:border-[#1a4fa0] text-xs" />
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium">{line.igst_amt != null ? formatINR(line.igst_amt) : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-[#1a2233]">{line.total_duty != null ? formatINR(line.total_duty) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#1a2233] bg-[#f8f9fb]">
                <td className="px-3 py-3 font-bold text-[#1a2233]">TOTAL</td>
                <td className="px-3 py-3 text-right font-bold text-[#1a2233]">{formatINR(draft.total_assessable_value)}</td>
                <td className="px-3 py-3 text-center">—</td>
                <td className="px-3 py-3 text-right font-bold">{formatINR(draft.total_bcd)}</td>
                <td className="px-3 py-3 text-center">—</td>
                <td className="px-3 py-3 text-right font-bold">{formatINR(draft.total_sws)}</td>
                <td className="px-3 py-3 text-center">—</td>
                <td className="px-3 py-3 text-right font-bold">{formatINR(draft.total_igst)}</td>
                <td className="px-3 py-3 text-right font-bold text-[#dc2626]">{formatINR(draft.total_duty)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── PART IV — SUPPORTING DOCS ── */
function PartIVView({ draft, setDraft, handleBlur, inputBase, labelBase, btnBase }) {
  const docs = draft.supporting_docs || []

  const addDoc = () => {
    setDraft(prev => ({
      ...prev,
      supporting_docs: [...(prev.supporting_docs || []), { type: '', reference_no: '', date: '', present: false }],
    }))
  }

  const updateDoc = (i, key) => (e) => {
    const val = key === 'present' ? e.target.checked : e.target.value
    setDraft(prev => {
      const d = [...(prev.supporting_docs || [])]
      d[i] = { ...d[i], [key]: val }
      return { ...prev, supporting_docs: d }
    })
  }

  const removeDoc = (i) => {
    setDraft(prev => ({
      ...prev,
      supporting_docs: (prev.supporting_docs || []).filter((_, idx) => idx !== i),
    }))
  }

  return (
    <div className="bg-white border-[1.5px] border-[#e2e6ed] rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#e2e6ed] bg-[#f8f9fb] flex items-center justify-between">
        <span className="text-sm font-bold text-[#1a2233]">Supporting Documents Checklist</span>
        <button type="button" onClick={addDoc}
          className={`${btnBase} bg-white border border-[#d0d6e0] text-[#4a5568] hover:border-[#1a4fa0]`}>
          + Add Document
        </button>
      </div>
      <div className="p-5">
        {docs.length === 0 && (
          <p className="text-sm text-[#8a96a8] italic">No supporting documents listed yet. Add from OCR or manually.</p>
        )}
        <div className="space-y-2">
          {docs.map((doc, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl">
              <input type="checkbox" checked={doc.present || false} onChange={updateDoc(i, 'present')}
                className="h-4 w-4 rounded border-[#d0d6e0] text-[#1a4fa0] shrink-0" />
              <div className="flex-1 grid grid-cols-3 gap-3">
                <input type="text" value={doc.type || ''} onChange={updateDoc(i, 'type')} onBlur={handleBlur}
                  className="h-8 px-2.5 text-xs rounded-lg border border-[#e2e6ed] outline-none focus:border-[#1a4fa0]" placeholder="Document type" />
                <input type="text" value={doc.reference_no || ''} onChange={updateDoc(i, 'reference_no')} onBlur={handleBlur}
                  className="h-8 px-2.5 text-xs rounded-lg border border-[#e2e6ed] outline-none focus:border-[#1a4fa0]" placeholder="Reference no." />
                <input type="date" value={doc.date || ''} onChange={updateDoc(i, 'date')} onBlur={handleBlur}
                  className="h-8 px-2.5 text-xs rounded-lg border border-[#e2e6ed] outline-none focus:border-[#1a4fa0]" />
              </div>
              {!doc.present && <span className="text-xs font-semibold text-red-500 shrink-0">Missing</span>}
              <button type="button" onClick={() => removeDoc(i)}
                className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-[#8a96a8] hover:text-red-500 transition-colors text-lg">✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
