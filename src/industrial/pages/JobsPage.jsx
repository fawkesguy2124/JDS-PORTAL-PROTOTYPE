import { useEffect, useMemo, useRef, useState } from 'react'
import { parseContainerNos } from '../../utils/jobHelpers'
import { daysAgo, displayLine, isActiveRow, truckNos } from '../../services/journey'
import { seaOf } from '../../../supabase/functions/_shared/portal/ships.js'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import { StageBar, boxesText, jobNum, nextStepText, plain, setPagerList, stageDays, subscribePager, usePagerCurrent } from '../JobDrawer'
import { portTime, seaWhere } from '../SeaTracking'
import { Button, Chip, Dash, EmptyState, FilterSelect, FreeDays, Icon, JobNo, PageHead, PhaseStatus, RowMenu, SearchBox, Skeleton, Tabs, fmtDate, fmtDateTime, timeAgo, worst } from '../ui'
import '../styles/jobs.css'

// Filter tabs. Every count comes from the shared journey (useJourney), so the
// sidebar, Today and this page agree (Jose, 31 Oct 2026: one number, one source).
const TABS = [
  { id: 'action', label: 'Needs action', tone: 'red', test: (r) => isActiveRow(r) && r.j.attention.some((a) => a.level !== 'info') },
  { id: 'open', label: 'Active', test: isActiveRow },
  { id: 'arriving', label: 'Arriving', test: (r) => isActiveRow(r) && r.j.phase === 'arrival' },
  { id: 'customs', label: 'At customs', test: (r) => isActiveRow(r) && ['docs', 'ooc', 'sb', 'leo'].includes(r.j.phase) },
  { id: 'move', label: 'To move', test: (r) => isActiveRow(r) && r.j.phase === 'release' },
  { id: 'road', label: 'On the road', test: (r, f) => f.road.has(r.job.id) },
  // shown only while a job is at risk (or when Today's 'Free days ≤ 2' tile opens it)
  { id: 'detention', label: 'Detention risk', tone: 'red', test: (r, f) => f.detention.has(r.job.id), optional: true },
  { id: 'delivered', label: 'Delivered', test: (r) => !isActiveRow(r) },
  { id: 'all', label: 'All', test: () => true },
]
// view names saved by older screens (Today's tiles, an old visit)
const ALIAS = { truck: 'move', onroad: 'road', ooc: 'customs', mine: 'open' }
const PHASE_ORDER = { arrival: 0, docs: 1, sb: 1, ooc: 2, leo: 2, release: 3, sail: 3, truck: 4, delivered: 5 }

// Sort keys: a missing value is null and always sorts last, whatever the direction
const SORTS = {
  job: (r) => jobNum(r.job),
  client: (r) => (r.job.client ? String(r.job.client).toLowerCase() : null),
  line: (r) => (r.line ? r.line.toLowerCase() : null),
  arrival: (r) => r.arr?.ms ?? null,
  be: (r) => (r.be ? parseInt(String(r.be).replace(/\D/g, ''), 10) || null : null),
  // stage first, then the longest wait in it (the OOC age column was merged into
  // Status: its '· 5 d' is the same number, and the table must fit at 1366px)
  status: (r) => (PHASE_ORDER[r.j.phase] === undefined ? null : PHASE_ORDER[r.j.phase] * 1000 - Math.min(r.stageDays ?? 0, 999)),
  free: (r) => r.j.freeDaysLeft ?? null,
  updated: (r) => (r.job.updated_at ? new Date(r.job.updated_at).getTime() : null),
}

// Extra problems on a row become small tags next to the next step (one row per job)
const TAGS = [
  [/papers problem/i, 'red', 'Truck papers'],
  [/query raised/i, 'red', 'Customs query'],
  [/high detention risk/i, 'red', 'High risk'],
  [/assessed/i, 'amber', 'Pay duty'],
  [/examination/i, 'amber', 'Examination'],
  [/follow up/i, 'amber', 'Follow up'],
  [/add the truck number/i, 'grey', 'Add truck no.'],
  [/no container movement/i, 'grey', 'No movement'],
]
const tagsOf = (j) => {
  const out = []
  for (const a of j.attention || []) {
    const hit = TAGS.find(([re]) => re.test(a.text))
    if (hit && !out.some((t) => t.label === hit[2])) out.push({ tone: hit[1], label: hit[2], title: plain(a.text) })
  }
  return out
}

// Short words for where a job's boxes are, when they are in different places
const WHERE_SHORT = { port: 'At port', to_cfs: 'To CFS', cfs: 'At CFS', out: 'Left', road: 'On road', rail: 'On rail', collected: 'Collected', empty_back: 'Empty back', not_arrived: 'Not arrived' }
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())

function whereNow(job, j, boxes, road, sea) {
  // a truck a toll saw, or a box tracking shows on the move (the 'On the road' list)
  if (road?.place) return { text: `${road.mode === 'rail' ? 'On rail' : 'On road'} · ${titleCase(road.place)}`, title: road.at ? `Seen ${fmtDateTime(road.at)}` : undefined }
  const live = (boxes || []).filter((b) => b.where !== 'unknown' && !b.finishedOn)
  if (live.length) {
    const codes = [...new Set(live.map((b) => b.where))]
    const title = live.map((b) => `${b.no}: ${b.whereText}`).join('\n')
    if (codes.length === 1) {
      const b = live[0]
      const text = b.where === 'out' ? `Left ${b.leftFrom || 'CFS'}` : b.place && ['road', 'rail'].includes(b.where) ? `${WHERE_SHORT[b.where]} · ${titleCase(b.place)}` : b.whereText
      return { text, title }
    }
    return { text: codes.map((c) => `${WHERE_SHORT[c] || c} ${live.filter((b) => b.where === c).length}`).join(' · '), title }
  }
  if (!j.arrivedAt && sea) return { text: seaWhere(sea), title: 'From ship tracking' }
  return null
}

function arrivalOf(job, j, sea) {
  if (j.arrivedAt) return { text: fmtDate(j.arrivedAt), ms: new Date(j.arrivedAt).getTime() }
  if (job.job_type === 'export') return null
  // arrived (by stage or tracking) but no date saved: say so, never an old ETA
  if (j.steps?.[0]?.id === 'arrival' && j.steps[0].done) return { text: null, title: 'Arrived, date not recorded' }
  const eta = sea?.pod_date || job.eta
  if (!eta) return null
  const ms = new Date(String(eta).length <= 10 ? `${eta}T00:00:00+05:30` : eta).getTime()
  // the ETA day has passed and nothing confirms the arrival yet
  const late = !isNaN(ms) && daysAgo(eta) > 0
  return { text: `ETA ${sea?.pod_date ? portTime(sea.pod_date, false) : fmtDate(job.eta)}`, ms, dim: true, late, title: sea?.pod_date ? 'From ship tracking' : 'ETA saved on the job' }
}

export default function JobsPage({ profile, onOpenJob, onEditJob, selectedId }) {
  const { rows, data, facts, profiles, loading, error } = useJourney()
  useFreshOnOpen() // opening the page shows the latest saved data
  const me = profile?.id
  const [view, setView] = useState(() => {
    try { const v = localStorage.getItem('ix_jobs_view') || 'action'; return ALIAS[v] || (TABS.some((t) => t.id === v) ? v : 'action') } catch { return 'action' }
  })
  const [sort, setSort] = useState({ key: 'job', dir: -1 }) // newest job number first (Jose, 22 Oct 2026)
  const [q, setQ] = useState('')
  const [mode, setMode] = useState('')
  const [type, setType] = useState('')
  const [client, setClient] = useState('')
  const [lineF, setLineF] = useState('')
  const [owner, setOwner] = useState(() => { try { return localStorage.getItem('ix_jobs_view') === 'mine' && me ? me : '' } catch { return '' } })
  const [cursor, setCursor] = useState(null)
  const searchRef = useRef(null)
  const tableRef = useRef(null)

  // the job the panel shows (it can page through the list with J / K)
  const panelId = usePagerCurrent() || selectedId || null
  useEffect(() => subscribePager((id) => { if (id) setCursor(id) }), [])

  const pickView = (id) => { setView(id); try { localStorage.setItem('ix_jobs_view', id) } catch { /* private mode */ } }

  // one pass over every job: what each column shows
  const all = useMemo(() => {
    const boxesBy = {}
    for (const b of facts?.containers || []) (boxesBy[b.jobId] ||= []).push(b)
    const roadBy = {}
    for (const e of facts?.onRoad || []) if (!roadBy[e.jobId]) roadBy[e.jobId] = e
    return rows.map(({ job, j }) => {
      const isExport = job.job_type === 'export'
      const sea = isExport || /air/i.test(job.mode || '') ? null : seaOf(job, data)
      const oocMissing = !isExport && j.phase === 'release' && j.oocDone && !j.oocDate
      return {
        job, j,
        line: displayLine(job.shipping_line),
        mismatch: (j.mismatches || []).find((m) => m.field === 'Shipping line'),
        arr: arrivalOf(job, j, sea),
        be: isExport ? j.sbNo : job.be_no,
        beDate: isExport ? job.ulip_refs?.sb_date : job.be_date,
        boxes: boxesText(job, data),
        boxCount: new Set(parseContainerNos(job.containers)).size,
        where: j.phase === 'delivered' ? null : whereNow(job, j, boxesBy[job.id], roadBy[job.id], sea),
        stageDays: stageDays(job, j),
        next: nextStepText(j),
        // no OOC age column any more, so a missing OOC date shows as a tag
        tags: oocMissing ? [...tagsOf(j), { tone: 'amber', label: 'No OOC date', title: 'OOC is done but no date was saved' }] : tagsOf(j),
        level: worst(j),
      }
    })
  }, [rows, data, facts])

  const sets = useMemo(() => ({
    road: new Set((facts?.onRoad || []).map((e) => e.jobId)),
    detention: new Set((facts?.detention || []).map((r) => r.job.id)),
  }), [facts])
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, all.filter((r) => t.test(r, sets)).length])), [all, sets])

  const clients = useMemo(() => [...new Set(rows.map((r) => String(r.job.client || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows])
  const lines = useMemo(() => [...new Set(all.map((r) => r.line).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [all])
  const owners = useMemo(() => [...new Set(rows.map((r) => r.job.assigned_to).filter((id) => id && id !== me))]
    .map((id) => ({ value: id, label: profiles[id] || 'Unknown' })).sort((a, b) => a.label.localeCompare(b.label)), [rows, profiles, me])

  const list = useMemo(() => {
    const t = TABS.find((x) => x.id === view) || TABS[0]
    const needle = q.trim().toLowerCase().replace(/\s+/g, '')
    const get = SORTS[sort.key] || SORTS.job
    return all
      .filter((r) => t.test(r, sets))
      .filter(({ job }) => !mode || job.mode === mode)
      .filter(({ job }) => !type || (job.job_type || 'import') === type)
      .filter(({ job }) => !client || String(job.client || '').trim() === client)
      .filter((r) => !lineF || r.line === lineF)
      .filter(({ job }) => !owner || job.assigned_to === owner)
      .filter(({ job, line }) => !needle || [job.job_no, job.client, job.be_no, job.bl_no, line, ...truckNos(job), job.vessel, job.ulip_refs?.igm_no, job.ulip_refs?.sb_no, ...parseContainerNos(job.containers)]
        .filter(Boolean).some((x) => String(x).toLowerCase().replace(/\s+/g, '').includes(needle)))
      .sort((a, b) => {
        const x = get(a)
        const y = get(b)
        if (x === null && y === null) return jobNum(b.job) - jobNum(a.job)
        if (x === null) return 1
        if (y === null) return -1
        const c = typeof x === 'string' ? x.localeCompare(y) : x - y
        return c * sort.dir || jobNum(b.job) - jobNum(a.job)
      })
  }, [all, sets, view, q, mode, type, client, lineF, owner, sort])

  // the panel's pager walks this list, in this order
  useEffect(() => { setPagerList(list.map((r) => r.job.id)) }, [list])
  useEffect(() => () => setPagerList(null), [])

  // J / K move through the rows, Enter opens, / jumps to the search (the panel
  // takes J / K over while it is open)
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const tag = e.target?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable) return
      if (panelId) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return }
      if (!list.length) return
      const at = list.findIndex((r) => r.job.id === cursor)
      if (e.key === 'j' || e.key === 'J' || e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        const down = e.key.toLowerCase() === 'j'
        const i = at < 0 ? 0 : Math.max(0, Math.min(list.length - 1, at + (down ? 1 : -1)))
        setCursor(list[i].job.id)
      } else if (e.key === 'Enter' && at >= 0 && !['BUTTON', 'A'].includes(tag)) {
        e.preventDefault()
        onOpenJob(list[at].job.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list, cursor, panelId, onOpenJob])

  // keep the cursor row on screen
  useEffect(() => {
    if (!cursor) return
    tableRef.current?.querySelector(`tr[data-id="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const th = (key, label, cls = '') => {
    const on = sort.key === key
    const right = cls.split(' ').includes('r')
    return (
      <th className={`sort${on ? ' sorted' : ''}${cls ? ` ${cls}` : ''}`} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
        onClick={() => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'updated' ? -1 : 1 }))}>
        {right && <Icon name={on ? (sort.dir === 1 ? 'arrow-up' : 'arrow-down') : 'selector'} className={on ? '' : 'hint'} />}
        {label}
        {!right && <Icon name={on ? (sort.dir === 1 ? 'arrow-up' : 'arrow-down') : 'selector'} className={on ? '' : 'hint'} />}
      </th>
    )
  }

  const filtered = !!(mode || type || client || lineF || owner || q)
  const clearAll = () => { setQ(''); setMode(''); setType(''); setClient(''); setLineF(''); setOwner('') }
  const busy = loading && !rows.length
  const tabs = TABS.filter((t) => !t.optional || counts[t.id] > 0 || view === t.id)
    .map((t) => ({ id: t.id, label: t.label, count: busy ? '–' : counts[t.id], tone: t.tone && counts[t.id] ? t.tone : undefined }))
  const COLS = 13

  return (
    <>
      <PageHead
        title="All jobs"
        sub={busy ? 'Loading…' : null /* no counts here: the tabs right below carry them (Jose, 31 Oct 2026) */}
        /* (no Refresh button: the list reloads by itself every 5 minutes and whenever the
           page or the window is opened, JourneyContext; Jose, 1 Nov 2026) */
      />
      {error && <div className="ix-error">Could not load the latest data: {error}. It tries again by itself in a few minutes.</div>}

      <section className="ix-card ix-jb-panel">
        <Tabs tabs={tabs} value={view} onChange={pickView} />
        <div className="ix-toolbar">
          <SearchBox inputRef={searchRef} value={q} onChange={setQ} placeholder="Job, client, BE, BL or container" />
          {/* (on a phone the filters are one row that swipes sideways: styles/mobile.css) */}
          <div className="ix-jb-filters">
          <FilterSelect label="Type" value={type} onChange={setType} options={[{ value: '', label: 'All' }, { value: 'import', label: 'Import' }, { value: 'export', label: 'Export' }]} />
          <FilterSelect label="Mode" value={mode} onChange={setMode} options={[{ value: '', label: 'All' }, 'Sea FCL', 'Sea LCL', 'Air', 'BPT/MBPT']} />
          <FilterSelect label="Client" value={client} onChange={setClient} options={[{ value: '', label: 'Any' }, ...clients]} />
          <FilterSelect label="Line" value={lineF} onChange={setLineF} options={[{ value: '', label: 'All' }, ...lines]} />
          <FilterSelect label="Owner" value={owner} onChange={setOwner} options={[{ value: '', label: 'Anyone' }, ...(me ? [{ value: me, label: 'Me' }] : []), ...owners]} />
          {filtered && <Button size="sm" variant="ghost" icon="x" onClick={clearAll}>Clear</Button>}
          </div>
          {/* (no "Sorted by …" line: the arrow on the column heading shows it; Jose, 1 Nov 2026) */}
        </div>

        <div className="ix-tbl-wrap" ref={tableRef}>
          <table className="ix-tbl click ix-jb-tbl">
            <thead>
              <tr>
                <th className="lvl" />
                {/* c-* columns drop out on narrower screens (jobs.css) so the table
                    fits at 1366px; Job, Client, Status, Where now, Free days and
                    Next step always stay */}
                {th('job', 'Job')}
                {th('client', 'Client', 'c-cl')}
                {th('line', 'Line', 'c-line')}
                {th('arrival', 'Arrival', 'c-arr')}
                {th('be', 'BE no', 'r c-be')}
                {th('status', 'Status')}
                <th className="c-box">Boxes</th>
                <th>Where now</th>
                {th('free', 'Free days', 'r')}
                <th className="ix-jb-next">Next step</th>
                {th('updated', 'Updated', 'c-upd')}
                <th className="act" aria-label="More" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const { job, j } = r
                const lvl = r.level === 'red' || r.level === 'amber' ? r.level : ''
                const cls = [lvl, panelId === job.id ? 'sel' : '', cursor === job.id ? 'cur' : ''].filter(Boolean).join(' ')
                return (
                  <tr key={job.id} data-id={job.id} className={cls} onClick={() => { setCursor(job.id); onOpenJob(job.id) }}>
                    <td className="lvl" />
                    <td className="jobc" title={job.updated_at ? `Updated ${fmtDateTime(job.updated_at)}` : undefined}>
                      <JobNo no={job.job_no} />
                      <div className="ix-jb-sub">{job.client || 'No client'}</div>
                    </td>
                    <td className="cl c-cl" title={job.client || ''}><span className="ix-jb-ell">{job.client || <Dash />}</span></td>
                    <td className="c-line" title={r.line || undefined}>
                      <span className="ix-jb-line">
                        <span className="ix-jb-ell">{r.line || <Dash />}</span>
                        {r.mismatch && <span className="ix-jb-flag" title={`Container tracking says ${r.mismatch.tracking}`}><Icon name="info-circle" /></span>}
                      </span>
                    </td>
                    <td className={`c-arr${r.arr?.dim ? ' dim' : ''}`} title={r.arr?.late ? 'The ETA has passed and the arrival is not confirmed yet' : r.arr?.title}>
                      {r.arr?.text || <Dash />}
                      {r.arr?.late && <Chip tone="amber">not confirmed</Chip>}
                    </td>
                    <td className="r mono c-be" title={r.beDate ? `${job.job_type === 'export' ? 'SB' : 'BE'} date ${fmtDate(r.beDate)}` : undefined}>{r.be || <Dash />}</td>
                    <td>
                      <span className="ix-jb-stage">
                        <PhaseStatus job={job} j={j} pill sub={r.stageDays !== null ? `· ${r.stageDays} d` : null} />
                        <StageBar steps={j.steps} />
                      </span>
                    </td>
                    <td className="c-box">{r.boxes || <Dash />}</td>
                    {/* the boxes go in the tooltip too, for screens without the Boxes column */}
                    {/* (.none: nothing to say, so a phone card shows no lone dash) */}
                    <td className={`ix-jb-where${r.where?.text ? '' : ' none'}`} title={[r.boxes, r.where?.title || r.where?.text].filter(Boolean).join('\n') || undefined}>
                      <span className="ix-jb-ell">{r.where?.text || <Dash />}</span>
                    </td>
                    <td className="r" title={j.freeTill ? `Free till ${fmtDate(j.freeTill)}${j.freeBox ? ` · ${j.freeBox}` : ''}` : undefined}>
                      <FreeDays value={j.freeDaysLeft} />
                    </td>
                    {/* takes the room left over and cuts long text with '…' (full text in the tooltip) */}
                    <td className={`ix-jb-next${r.next ? '' : ' dim'}${!r.next && j.phase === 'delivered' ? ' fin' : ''}`} title={[r.next, ...r.tags.map((t) => t.title)].filter(Boolean).join('\n') || undefined}>
                      <span className="ix-jb-nx">
                        <span className="t">{r.next || (j.phase === 'delivered' ? 'Finished' : <Dash />)}</span>
                        {r.tags.map((t) => <Chip key={t.label} tone={t.tone} title={t.title}>{t.label}</Chip>)}
                      </span>
                    </td>
                    <td className="dim c-upd" title={timeAgo(job.updated_at)}>{job.updated_at ? fmtDateTime(job.updated_at) : <Dash />}</td>
                    {/* ⋯ > Edit opens the full job page ready to edit (Jose, 1 Nov 2026: instead of
                        "Open full job" in the job panel) */}
                    <td className="act" onClick={(e) => e.stopPropagation()}>
                      <RowMenu label={`More for ${job.job_no}`} items={[onEditJob && { label: 'Edit', icon: 'pencil', run: () => onEditJob(job.id) }]} />
                    </td>
                  </tr>
                )
              })}
              {!loading && list.length === 0 && (
                <tr><td colSpan={COLS} style={{ cursor: 'default', padding: 0 }}>
                  {filtered
                    ? <EmptyState line icon="filter-off" title="No jobs match these filters." action={<Button size="sm" variant="ghost" onClick={clearAll}>Clear filters</Button>} />
                    : view === 'action'
                      ? <EmptyState line tone="green" icon="circle-check" title="Nothing needs action right now." />
                      : <EmptyState line icon="list-details" title="No jobs in this view." />}
                </td></tr>
              )}
              {busy && <tr><td colSpan={COLS} style={{ padding: 0, cursor: 'default' }}><Skeleton rows={6} /></td></tr>}
            </tbody>
          </table>
        </div>

        {/* (no "4 jobs · 7 containers / J K move" footer: the tab counts say it; Jose, 1 Nov 2026) */}
      </section>
    </>
  )
}
