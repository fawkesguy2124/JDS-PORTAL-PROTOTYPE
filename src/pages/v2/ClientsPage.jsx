import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { loadJourneyData, journeyFor, activeJobsByClient, clientKey } from '../../services/journey'
import { useJourney } from '../../industrial/JourneyContext'
import { PageHead, JobNo, Chip, Dash, EmptyState, Toolbar, Skeleton, Icon, PhaseStatus, Button, fmtDate } from '../../industrial/ui'
import UlipCheck from '../../components/ulip/UlipCheck'
import '../../industrial/industrial.css'
import '../../industrial/styles/records.css'

// Every client JDS works with. Read-only: nothing here writes client details.
// Open and total jobs come from the shared journey (activeJobsByClient), so they add
// up to the same open-job count as the sidebar and All jobs (Jose, 31 Oct 2026).

function iecStatus(row) {
  if (!row) return { tone: 'grey', icon: 'circle-dashed', text: 'Not checked' }
  const when = fmtDate(row.checked_at)
  const p = row.parsed || {}
  if (p.found && p.extra?.iecActive) return { tone: 'green', icon: 'circle-check', text: `Active · checked ${when}` }
  const status = p.fields?.find((f) => f.label === 'IEC status')?.value
  return { tone: 'red', icon: 'circle-x', text: `${p.found ? status || 'Not active' : 'Not found'} · checked ${when}` }
}

// the last loaded client list and IEC answers, kept for the whole visit
// (shown at once from the last visit, then refreshed; Jose, 25 Oct 2026)
let kept = null

// The staff dashboard shows this page outside the industrial shell (no shared
// journey there): load the same jobs once and count them with the same helper.
function useClientFacts() {
  const shared = useJourney()
  const inShell = !!shared
  const [own, setOwn] = useState(null)
  useEffect(() => {
    if (inShell) return undefined
    let cancelled = false
    ;(async () => {
      let d = null
      let err
      try {
        d = await loadJourneyData()
        err = d?.error || null
      } catch (e) {
        err = e?.message || 'Something went wrong'
      }
      if (cancelled) return
      const rows = d ? d.jobs.map((job) => ({ job, j: journeyFor(job, d) })) : []
      setOwn({ error: err, byClient: activeJobsByClient(rows), byId: Object.fromEntries(rows.map((r) => [r.job.id, r])) })
    })()
    return () => { cancelled = true }
  }, [inShell])
  if (inShell) return { inShell, loading: !shared.data && shared.loading, error: shared.error, byClient: shared.facts.byClient, byId: shared.byId }
  return { inShell, loading: !own, error: own?.error || null, byClient: own?.byClient || {}, byId: own?.byId || {} }
}

const jobNoCmp = (a, b) => String(b).localeCompare(String(a), undefined, { numeric: true })
const newest = (a, b) => String(b.job.created_at || '').localeCompare(String(a.job.created_at || '')) || jobNoCmp(a.job.job_no, b.job.job_no)

export default function ClientsPage({ onOpenJob }) {
  const journey = useClientFacts()
  const [master, setMaster] = useState(() => kept?.master || [])
  const [iecRows, setIecRows] = useState(() => kept?.iecRows || {})
  const [loading, setLoading] = useState(() => !kept)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('open')
  const [expanded, setExpanded] = useState(null)
  const [checking, setChecking] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      let mRes, rRes
      try {
        [mRes, rRes] = await Promise.all([
          supabase.from('client_master').select('*').order('client_name'),
          supabase.from('ulip_results').select('api, params, found, parsed, checked_at').eq('api', 'DGFT/01')
            .order('checked_at', { ascending: false, nullsFirst: false }),
        ])
      } catch (e) {
        if (!cancelled) { setLoadError(e?.message || 'Something went wrong'); setLoading(false) }
        return
      }
      if (cancelled) return
      const err = [mRes, rRes].find((r) => r.error)?.error
      const byIec = {}
      for (const r of rRes.data || []) {
        const k = r.params?.iecnumber
        if (k && !byIec[k]) byIec[k] = r
      }
      setMaster(mRes.data || [])
      setIecRows(byIec)
      if (!err) kept = { master: mRes.data || [], iecRows: byIec }
      setLoadError(err ? err.message : null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const { byClient, byId } = journey
  const clients = useMemo(() => {
    const seen = new Set()
    const pack = (keys) => {
      const ids = new Set()
      const openIds = new Set()
      for (const k of keys) {
        seen.add(k)
        for (const id of byClient[k]?.jobIds || []) ids.add(id)
        for (const id of byClient[k]?.openJobIds || []) openIds.add(id)
      }
      const jobs = [...ids].map((id) => byId[id]).filter(Boolean).sort(newest)
      return { jobs, open: openIds.size, total: ids.size, openIds, last: jobs[0] || null }
    }
    const list = master.map((c) => {
      const keys = [...new Set([clientKey(c.client_name), clientKey(c.legal_name)].filter(Boolean))]
      return {
        key: `m-${c.id ?? c.client_name}`, name: c.client_name || c.legal_name, legal: c.legal_name, gstin: c.gstin,
        iec: String(c.iec || c.importer_iec || '').trim(), place: [c.city, c.state].filter(Boolean).join(', '), inList: true, ...pack(keys),
      }
    })
    for (const [k, e] of Object.entries(byClient)) {
      if (!k || seen.has(k)) continue
      list.push({ key: `j-${k}`, name: e.name, legal: '', gstin: '', iec: '', place: '', inList: false, ...pack([k]) })
    }
    return list
  }, [master, byClient, byId])

  const q = search.trim().toLowerCase()
  const shown = clients
    .filter((c) => !q || [c.name, c.legal, c.iec, c.gstin].some((v) => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => {
      const byName = String(a.name || '').localeCompare(String(b.name || ''))
      if (sort === 'name') return byName
      if (sort === 'last') return (a.last && b.last ? newest(a.last, b.last) : a.last ? -1 : b.last ? 1 : 0) || byName
      return (b.open - a.open) || (b.total - a.total) || byName
    })

  const withOpen = clients.filter((c) => c.open > 0).length
  const notListed = clients.filter((c) => !c.inList).length
  const busy = (loading && !master.length) || journey.loading
  const error = loadError || journey.error
  const sortTh = (id, label, cls = '') => (
    <th className={`sort${sort === id ? ' sorted' : ''}${cls ? ` ${cls}` : ''}`} onClick={() => setSort(id)} aria-sort={sort === id ? 'descending' : 'none'}>
      {label} {sort === id ? <Icon name={id === 'name' ? 'arrow-up' : 'arrow-down'} /> : <Icon name="selector" className="hint" />}
    </th>
  )
  // say "Not in client list" only when it tells rows apart, and leave out a column
  // that is empty on every row (Jose, 31 Oct 2026: each fact once, no blank columns)
  const tagNotListed = notListed > 0 && notListed < clients.length
  const show = {
    gstin: clients.some((c) => c.gstin),
    iec: clients.some((c) => c.iec),
    city: clients.some((c) => c.place),
    check: clients.some((c) => c.inList && /^\d{10}$/.test(c.iec)),
  }
  const COLS = 4 + (show.gstin ? 1 : 0) + (show.iec ? 2 : 0) + (show.city ? 1 : 0) + (show.check ? 1 : 0)

  const page = (
    <>
      <PageHead title="Clients"
        sub={busy ? 'Loading…' : ['Everyone JDS works with', `${clients.length} client${clients.length === 1 ? '' : 's'}`, `${withOpen} with open jobs`, notListed ? `${notListed} not in the client list` : null]} />
      {error && <div className="ix-error">Could not load the latest data — {error}. Reload the page to try again.</div>}

      <section className="ix-card rec-panel">
        <Toolbar search={search} onSearch={setSearch} placeholder="Name, IEC or GSTIN" />
        {busy ? <Skeleton rows={6} /> : shown.length === 0 ? (
          <EmptyState icon="building" title={q ? 'No clients match your search' : 'No clients yet'}>
            {q ? 'Try part of the name, the IEC or the GSTIN.' : 'Clients show here once a job is created for them.'}
          </EmptyState>
        ) : (
          <div className="ix-tbl-wrap rec-wrap">
            <table className={`ix-tbl click rec-tbl${COLS <= 5 ? ' narrow' : ''}`}>
              <thead>
                <tr>
                  {sortTh('name', 'Client')}
                  {sortTh('open', 'Active jobs', 'r')}
                  <th className="r">Total</th>
                  {sortTh('last', 'Last job')}
                  {show.gstin && <th>GSTIN</th>}
                  {show.iec && <><th>IEC</th><th>IEC status</th></>}
                  {show.city && <th>City</th>}
                  {show.check && <th />}
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const open = expanded === c.key
                  const iecOk = /^\d{10}$/.test(c.iec)
                  const st = iecOk ? iecStatus(iecRows[c.iec]) : null
                  const toggleOpen = () => { setExpanded(open ? null : c.key); if (open) setChecking(null) }
                  return (
                    <Fragment key={c.key}>
                      <tr className={open ? 'open' : ''} onClick={toggleOpen} aria-expanded={open}>
                        <td className="cl wide" title={c.legal && c.legal !== c.name ? `${c.name} · ${c.legal}` : c.name}>
                          <span className="rec-name">{c.name}</span>
                          {c.legal && c.legal !== c.name ? <span className="rec-x">{c.legal}</span> : null}
                          {!c.inList && tagNotListed ? <> <Chip tone="grey">Not in client list</Chip></> : null}
                        </td>
                        <td className="r">{c.open ? <b className="rec-n">{c.open}</b> : <Dash />}</td>
                        <td className="r dim">{c.total || <Dash />}</td>
                        <td>
                          {c.last
                            ? <><JobNo no={c.last.job.job_no} onClick={() => onOpenJob?.(c.last.job.id, 'details')} />{c.last.job.created_at ? <span className="rec-x">{fmtDate(c.last.job.created_at)}</span> : null}</>
                            : <Dash />}
                        </td>
                        {show.gstin && <td className="mono">{c.gstin || <Dash />}</td>}
                        {show.iec && <td className="mono">{c.iec || <Dash />}</td>}
                        {show.iec && (
                          <td>
                            {!c.iec ? <Dash />
                              : !iecOk ? <span className="muted" title="This IEC has letters, so it can't be checked online">Can't check online</span>
                              : <Chip tone={st.tone} icon={st.icon}>{st.text}</Chip>}
                          </td>
                        )}
                        {show.city && <td className="dim">{c.place || <Dash />}</td>}
                        {show.check && (
                          <td className="r">
                            {iecOk && c.inList && (
                              <span className="row-act">
                                <Button size="sm" variant="ghost" icon="id-badge-2"
                                  onClick={(e) => { e.stopPropagation(); setExpanded(c.key); setChecking(checking === c.key ? null : c.key) }}>
                                  {checking === c.key ? 'Close check' : 'Check IEC'}
                                </Button>
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                      {open && (
                        <tr className="rec-more">
                          <td colSpan={COLS}>
                            <div className="rec-more-t">Jobs · {c.open} open of {c.total}</div>
                            {c.jobs.length === 0 ? <span className="muted">No jobs for this client yet.</span> : (
                              <div className="rec-jobs">
                                {[...c.jobs].sort((a, b) => (c.openIds.has(b.job.id) - c.openIds.has(a.job.id)) || newest(a, b)).map((r) => (
                                  <button key={r.job.id} type="button" className="rec-job" onClick={() => onOpenJob?.(r.job.id, 'details')}>
                                    <JobNo no={r.job.job_no} /><PhaseStatus job={r.job} j={r.j} />
                                  </button>
                                ))}
                              </div>
                            )}
                            {checking === c.key && iecOk && (
                              <div className="rec-iec">
                                {/* runs only when the button inside is pressed: never an automatic check */}
                                <UlipCheck compact
                                  check={{ api: 'DGFT/01', title: `Is the IEC valid? ${c.name}`, description: 'Checks the importer-exporter code with DGFT.', button: 'Check IEC now', defaults: { iecnumber: () => c.iec } }}
                                  saved={iecRows[c.iec] || null}
                                  onResult={(row) => setIecRows((prev) => ({ ...prev, [c.iec]: row }))} />
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!busy && shown.length > 0 && (
          <div className="ix-tbl-foot">
            {/* the count is in the line under the title */}
            <span className="right muted">Click a client to see its jobs</span>
          </div>
        )}
      </section>
    </>
  )

  // inside the shell the frame (padding, background) comes from AdminDashboard
  return journey.inShell ? page : <div className="ix ix-page rec-standalone">{page}</div>
}
