import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isDelivered } from '../../services/journey'
import { getStageName } from '../../utils/jobHelpers'
import UlipCheck from '../../components/ulip/UlipCheck'

// Every client JDS works with. Read-only: client details are edited in the existing client screens.
const norm = (s) => String(s || '').trim().toLowerCase()
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

function iecBadge(row) {
  if (!row) return { text: 'Not checked', bg: '#f1f3f6', border: '#e2e6ed', color: '#5b6678' }
  const when = fmtDate(row.checked_at)
  const p = row.parsed || {}
  if (p.found && p.extra?.iecActive) return { text: `✅ Active (checked ${when})`, bg: '#ecfdf5', border: '#bbf7d0', color: '#065f46' }
  const status = p.fields?.find((f) => f.label === 'IEC status')?.value
  const text = p.found ? (status || 'Not active') : 'Not found'
  return { text: `❌ ${text} (checked ${when})`, bg: '#fef2f2', border: '#fecaca', color: '#991b1b' }
}

export default function ClientsPage({ onOpenJob }) {
  const [master, setMaster] = useState([])
  const [jobs, setJobs] = useState([])
  const [iecRows, setIecRows] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [checking, setChecking] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [mRes, jRes, rRes] = await Promise.all([
        supabase.from('client_master').select('*').order('client_name'),
        supabase.from('jobs').select('id, job_no, client, stage').order('job_no', { ascending: false }),
        supabase.from('ulip_results').select('api, params, found, parsed, checked_at').eq('api', 'DGFT/01')
          .order('checked_at', { ascending: false, nullsFirst: false }),
      ])
      if (cancelled) return
      const byIec = {}
      for (const r of rRes.data || []) {
        const k = r.params?.iecnumber
        if (k && !byIec[k]) byIec[k] = r
      }
      setMaster(mRes.data || [])
      setJobs(jRes.data || [])
      setIecRows(byIec)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const clients = useMemo(() => {
    const jobsByName = {}
    for (const j of jobs) (jobsByName[norm(j.client)] ||= []).push(j)
    const seen = new Set()
    const list = master.map((c) => {
      const keys = [norm(c.client_name), norm(c.legal_name)].filter(Boolean)
      const mine = []
      for (const k of new Set(keys)) { mine.push(...(jobsByName[k] || [])); seen.add(k) }
      return { key: `m-${c.id ?? c.client_name}`, name: c.client_name || c.legal_name, legal: c.legal_name, gstin: c.gstin, iec: c.iec || c.importer_iec || '', place: [c.city, c.state].filter(Boolean).join(', '), jobs: mine, inList: true }
    })
    for (const [k, js] of Object.entries(jobsByName)) {
      if (!k || seen.has(k)) continue
      list.push({ key: `j-${k}`, name: js[0].client, legal: '', gstin: '', iec: '', place: '', jobs: js, inList: false })
    }
    return list
  }, [master, jobs])

  const shown = clients.filter((c) => {
    const q = norm(search)
    return !q || [c.name, c.legal, c.iec, c.gstin].some((v) => norm(v).includes(q))
  })

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: '#1a2233', fontSize: '14px', background: '#f4f6f9', padding: '16px', minHeight: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Clients</h1>
      <p style={{ color: '#5b6678', margin: '4px 0 12px' }}>Everyone JDS works with. To change client details, use the client screens.</p>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, IEC or GSTIN"
        style={{ width: '100%', boxSizing: 'border-box', height: '44px', padding: '0 12px', border: '1.5px solid #e2e6ed', borderRadius: '10px', fontSize: '14px', marginBottom: '14px', background: 'white' }} />

      {loading && <div style={{ color: '#5b6678' }}>Loading…</div>}
      {!loading && shown.length === 0 && (
        <div style={{ background: 'white', border: '1.5px solid #e2e6ed', borderRadius: '12px', padding: '20px', color: '#5b6678' }}>No clients match your search.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {shown.map((c) => {
          const active = c.jobs.filter((j) => !isDelivered(j))
          const open = expanded === c.key
          const iec = String(c.iec || '').trim()
          const iecOk = /^\d{10}$/.test(iec)
          const badge = iecBadge(iecRows[iec])
          return (
            <div key={c.key} style={{ background: 'white', border: '1.5px solid #e2e6ed', borderRadius: '14px', overflow: 'hidden' }}>
              <button type="button" onClick={() => setExpanded(open ? null : c.key)}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '14px 16px', cursor: 'pointer', font: 'inherit', color: 'inherit', minHeight: '56px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '15px', wordBreak: 'break-word' }}>{c.name}</div>
                    {c.legal && c.legal !== c.name && <div style={{ color: '#5b6678', fontSize: '13px' }}>{c.legal}</div>}
                    {!c.inList && <div style={{ color: '#9a3412', fontSize: '12px', marginTop: '2px' }}>Not in client list yet</div>}
                    <div style={{ color: '#8a96a8', fontSize: '12px', marginTop: '3px', fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-word' }}>
                      {[c.place, c.gstin && `GSTIN ${c.gstin}`, iec && `IEC ${iec}`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '20px', fontWeight: 700, color: '#1a4fa0' }}>{active.length}</div>
                    <div style={{ fontSize: '12px', color: '#5b6678' }}>active job{active.length === 1 ? '' : 's'}</div>
                  </div>
                </div>
              </button>

              {c.inList && (
                <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  {!iec && <span style={{ color: '#8a96a8', fontSize: '13px' }}>No IEC on file</span>}
                  {iec && !iecOk && <span style={{ color: '#5b6678', fontSize: '13px' }}>This IEC cannot be checked through ULIP (letters)</span>}
                  {iecOk && (
                    <>
                      <span style={{ background: badge.bg, border: `1.5px solid ${badge.border}`, color: badge.color, borderRadius: '999px', padding: '5px 12px', fontSize: '13px', fontWeight: 600 }}>{badge.text}</span>
                      <button type="button" onClick={() => setChecking(checking === c.key ? null : c.key)}
                        style={{ height: '40px', padding: '0 16px', background: 'white', color: '#1a4fa0', border: '1.5px solid #1a4fa0', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                        {checking === c.key ? 'Close' : 'Check IEC'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {checking === c.key && iecOk && (
                <div style={{ padding: '0 16px 14px' }}>
                  <UlipCheck compact
                    check={{ api: 'DGFT/01', title: `Is the IEC valid? ${c.name}`, description: 'Checks the importer-exporter code with DGFT.', button: 'Check IEC', defaults: { iecnumber: () => iec } }}
                    saved={iecRows[iec] || null}
                    onResult={(row) => setIecRows((prev) => ({ ...prev, [iec]: row }))} />
                </div>
              )}

              {open && (
                <div style={{ borderTop: '1.5px solid #e2e6ed', background: '#f8fafc', padding: '8px 12px 12px' }}>
                  {c.jobs.length === 0 && <div style={{ color: '#5b6678', padding: '8px 4px' }}>No jobs for this client yet.</div>}
                  {c.jobs.map((j) => (
                    <button key={j.id} type="button" onClick={() => onOpenJob?.(j.id, 'details')}
                      style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: '10px', background: 'white', border: '1.5px solid #e2e6ed', borderRadius: '10px', padding: '10px 12px', marginTop: '6px', minHeight: '44px', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{j.job_no}</span>
                      <span style={{ color: '#5b6678' }}>{getStageName(j.stage)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
