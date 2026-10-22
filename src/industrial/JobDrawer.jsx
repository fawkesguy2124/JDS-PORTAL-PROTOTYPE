import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { getStageName, parseContainerNos, getContainerSize } from '../utils/jobHelpers'
import { portLabel } from '../utils/ports'
import { useJourney } from './JourneyContext'
import { containerFinishedOn, deliveryBy } from '../services/journey'
import { Chip, FreeDays, Icon, PhaseChip, fmtDate, initials, jobOwnerName, timeAgo } from './ui'
import ShipMap, { vesselOf, shipIdOf, vesselFinderLink } from './ShipMap'

// The side panel that opens when a job is clicked: what it is, where it is,
// what is next, its containers, timeline, documents and team notes. Editing
// and government checks stay on the full job page ("Open full job").
export default function JobDrawer({ jobId, initialTab = 'overview', onClose, onOpenFull, onOpenTruck, currentUserName, showToast }) {
  const { byId, data, profiles, patchJob } = useJourney()
  const row = byId[jobId]
  const job = row?.job
  const j = row?.j
  const [tab, setTab] = useState(initialTab)
  const [showShip, setShowShip] = useState(false)
  const [log, setLog] = useState([])
  const [docs, setDocs] = useState([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [ctrFilter, setCtrFilter] = useState('all')
  const [ctrQ, setCtrQ] = useState('')

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    Promise.all([
      supabase.from('activity_log').select('*').eq('job_id', jobId).order('created_at', { ascending: false }).limit(80),
      supabase.from('documents').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
    ]).then(([l, d]) => {
      if (cancelled) return
      setLog(l.data || [])
      setDocs(d.data || [])
    })
    return () => { cancelled = true }
  }, [jobId])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const containers = useMemo(() => {
    if (!job) return []
    const tracked = Object.fromEntries((j?.containers?.tracked || []).map((t) => [t.container_no?.toUpperCase(), t]))
    return parseContainerNos(job.containers).map((no) => {
      const t = data?.containersByNo?.[no] || null
      const live = tracked[no]
      const finishedOn = t ? containerFinishedOn(t, job) : null
      const status = !t ? 'Not tracked yet'
        : finishedOn ? (deliveryBy(job) === 'client' ? 'Collected by client' : 'Empty back')
        : ['delivered', 'empty_returned'].includes(t.status) ? 'Delivered'
        : t.port_out ? 'Out of port'
        : t.cfs_gate_in ? 'At CFS'
        : t.port_in ? 'At port'
        : (t.status_text || 'On the way')
      return { no, size: getContainerSize(job, no) || '—', status, where: t?.current_location || null, freeLeft: live?.freeLeft ?? null, stale: live?.stale, raw: t, finishedOn }
    })
  }, [job, j, data])

  if (!job) return null

  const notes = log.filter((r) => r.type === 'note')
  const next = j.steps.find((s) => s.current)
  const topAttention = j.attention[0]
  const isExport = job.job_type === 'export'
  const ownerName = jobOwnerName(job, profiles)

  // Save one choice into the job's field_meta (delivery_by, onward_mode)
  const setMeta = async (key, value, done) => {
    const field_meta = { ...(job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : {}), [key]: value }
    const { data: saved, error } = await supabase.from('jobs').update({ field_meta, updated_at: new Date().toISOString() }).eq('id', job.id).select().single()
    if (error) { showToast?.(`Could not save: ${error.message}`, 'error'); return }
    patchJob(saved)
    showToast?.(done, 'success')
  }

  // Who takes the cargo to the client's warehouse (decides when JDS's part ends)
  const setDelivery = async (by) => {
    const field_meta = { ...(job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : {}), delivery_by: by }
    const { data: saved, error } = await supabase.from('jobs').update({ field_meta, updated_at: new Date().toISOString() }).eq('id', job.id).select().single()
    if (error) { showToast?.(`Could not save: ${error.message}`, 'error'); return }
    patchJob(saved)
    showToast?.(by === 'client' ? 'Saved: the client collects the cargo' : 'Saved: JDS delivers the cargo', 'success')
  }

  const addNote = async () => {
    const text = note.trim()
    if (!text) return
    setSaving(true)
    const { data: inserted, error } = await supabase.from('activity_log').insert({
      type: 'note', action: 'note', title: text.length > 80 ? `${text.slice(0, 77)}…` : text, note: text,
      job_id: job.id, job_no: job.job_no, done_by_name: currentUserName || null,
      meta: { job_id: job.id, job_no: job.job_no },
    }).select()
    setSaving(false)
    if (error) { showToast?.(`Could not save the note: ${error.message}`, 'error'); return }
    setLog((l) => [...(inserted || []), ...l])
    setNote('')
  }

  // ── action for the "next step" box ──
  let action = null
  if (!isExport && j.phase === 'release' && j.onwardMode !== 'rail') action = { label: 'Assign truck', run: () => onOpenTruck(job.id) }
  else if (!isExport && j.phase === 'ooc') action = { label: 'Check OOC', run: () => onOpenFull(job.id, 'customs') }
  else if (!isExport && (j.phase === 'docs' || j.phase === 'arrival') && !job.be_no) action = { label: 'Record BE no', run: () => onOpenFull(job.id, 'customs') }
  else if (isExport && !j.sbNo) action = { label: 'Record SB no', run: () => onOpenFull(job.id, job.mode === 'Air' ? 'air' : 'export') }

  // ── timeline: saved events, newest first ──
  const events = []
  for (const r of log) {
    if (r.type === 'note') continue
    const src = /ooc|be_|sb_|icegate|customs/i.test(r.type || r.action || '') ? 'icegate'
      : /container|ldb|port|cfs/i.test(r.type || '') ? 'ldb'
      : /truck|fastag/i.test(r.type || '') ? 'fastag' : 'portal'
    events.push({ at: r.created_at, t: r.title || String(r.type || r.action || '').replace(/_/g, ' '), src, by: r.done_by_name })
  }
  for (const c of containers) {
    if (c.raw?.port_in) events.push({ at: c.raw.port_in, t: `${c.no} arrived at port`, src: 'ldb' })
    if (c.raw?.cfs_gate_in) events.push({ at: c.raw.cfs_gate_in, t: `${c.no} entered CFS`, src: 'ldb' })
    if (c.raw?.port_out) events.push({ at: c.raw.port_out, t: `${c.no} left the port`, src: 'ldb' })
  }
  if (j.oocDate && !log.some((r) => r.type === 'ooc_granted')) events.push({ at: j.oocDate, t: `OOC granted${j.customs?.ooc_no ? ` (${j.customs.ooc_no})` : ''}`, src: 'icegate' })
  if (job.created_at) events.push({ at: job.created_at, t: 'Job created', src: 'portal' })
  events.sort((a, b) => new Date(b.at) - new Date(a.at))
  // many containers: keep the timeline short by folding container events
  const ctrEvents = events.filter((e) => e.src === 'ldb' && /^[A-Z]{4}\d{7} /.test(e.t))
  const shownEvents = containers.length > 3 ? [...events.filter((e) => !ctrEvents.includes(e))] : events
  if (containers.length > 3 && ctrEvents.length) shownEvents.splice(0, 0, { at: ctrEvents[0].at, t: `${ctrEvents.length} container updates — see the Containers tab`, src: 'ldb', ctr: true })
  shownEvents.sort((a, b) => new Date(b.at) - new Date(a.at))

  const timeline = shownEvents.length === 0 ? <div className="ix-empty">No events yet.</div> : (
    <div className="ix-timeline">
      {shownEvents.map((e, i) => (
        <div key={i} className={`ix-tl ${i === 0 ? 'latest' : 'ok'}`}>
          <div className="t">{e.ctr ? <button type="button" className="ix-link" style={{ margin: 0 }} onClick={() => setTab('containers')}>{e.t}</button> : e.t}</div>
          <div className="m"><span className={`ix-src ${e.src}`}>{e.src}</span>{fmtDate(e.at)}{e.at && String(e.at).length > 10 ? ` · ${timeAgo(e.at)}` : ''}{e.by ? ` · ${e.by}` : ''}</div>
        </div>
      ))}
    </div>
  )

  // ── containers tab ──
  const groups = [
    ['all', 'All', () => true],
    ['port', 'At port / CFS', (c) => c.status === 'At port' || c.status === 'At CFS'],
    ['out', 'Out / delivered', (c) => ['Out of port', 'Delivered', 'Empty back', 'Collected by client'].includes(c.status)],
    ['risk', 'Free days ≤ 2', (c) => c.freeLeft !== null && c.freeLeft <= 2],
  ]
  const cf = groups.find((g) => g[0] === ctrFilter) || groups[0]
  const ctrRows = containers.filter(cf[2]).filter((c) => !ctrQ || c.no.includes(ctrQ.trim().toUpperCase()))
  const statusTone = (s) => (s === 'Delivered' || s === 'Empty back' || s === 'Collected by client' ? ['grey', 'flag'] : s === 'Out of port' ? ['blue', 'truck'] : s === 'At CFS' ? ['grey', 'building-warehouse'] : s === 'At port' ? ['amber', 'anchor'] : ['grey', 'ship'])

  const kv = [
    [isExport ? 'Shipping bill' : 'BE number', isExport ? (j.sbNo || '—') : (job.be_no || '—'), true],
    [isExport ? 'LEO' : 'BE date', isExport ? fmtDate(j.leoDate) : fmtDate(job.be_date)],
    ['Vessel / flight', job.vessel || '—'],
    ['Port', portLabel?.(job.port_code) || job.port_code || '—'],
    ['BL / AWB', job.bl_no || '—', true],
    ['IGM', job.ulip_refs?.igm_no ? `${job.ulip_refs.igm_no}${job.ulip_refs.igm_date ? ` · ${fmtDate(job.ulip_refs.igm_date)}` : ''}` : '—', true],
    ['Shipping line', job.shipping_line || '—'],
    ['RMS', job.rms_status ? String(job.rms_status).toUpperCase() : '—'],
    ['CFS', job.cfs_name || '—'],
  ]

  const tabs = [
    ['overview', 'Overview'],
    ...(containers.length ? [['containers', `Containers · ${containers.length}`]] : []),
    ['timeline', 'Timeline'],
    ['docs', `Documents${docs.length ? ` · ${docs.length}` : ''}`],
    ['notes', `Notes${notes.length ? ` · ${notes.length}` : ''}`],
  ]

  return (
    <>
      <div className="ix-backdrop" onClick={onClose} />
      <aside className="ix-drawer" aria-label={`Job ${job.job_no}`}>
        <div className="ix-dr-head">
          <div className="ix-dr-title">
            <h2>{job.job_no}</h2>
            <PhaseChip job={job} j={j} />
            {String(job.priority).toLowerCase() === 'urgent' && <Chip tone="red" icon="flame">Urgent</Chip>}
            <div className="x">
              <button type="button" className="ix-btn sm" onClick={() => onOpenFull(job.id, 'details')}><Icon name="external-link" />Open full job</button>
              <button type="button" className="ix-icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
            </div>
          </div>
          <div style={{ color: 'var(--text-2)', marginTop: 2 }}>{job.client || '—'} · {job.mode || '—'} · {isExport ? 'Export' : 'Import'}</div>
          <div className="ix-facts">
            <div className="ix-fact"><div className="k">ETA</div><div className="v">{fmtDate(job.eta)}</div></div>
            <div className="ix-fact"><div className="k">Stage</div><div className="v" title={getStageName(job.stage)}>{getStageName(job.stage)}</div></div>
            <div className="ix-fact"><div className="k">Free days</div><div className="v"><FreeDays value={j.freeDaysLeft} /></div></div>
            <div className="ix-fact"><div className="k">Owner</div><div className="v">{ownerName || '—'}</div></div>
          </div>
        </div>

        <div className="ix-stepper">
          {j.steps.map((s) => (
            <div key={s.id} className={`ix-step ${s.done ? 'done' : ''} ${s.current ? 'current' : ''}`}>
              <div className="c">{s.done ? <Icon name="check" /> : <Icon name={STEP_ICON[s.id] || 'circle'} />}</div>
              {s.label}
              {s.when && <div className="w">{s.when}</div>}
            </div>
          ))}
        </div>

        <div className="ix-dr-tabs">
          {tabs.map(([id, l]) => <button key={id} type="button" className={`ix-dr-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{l}</button>)}
        </div>

        <div className="ix-dr-body">
          {tab === 'overview' && (
            <>
              <div className={`ix-next ${topAttention?.level === 'red' ? 'red' : ''}`}>
                <Icon name={topAttention?.level === 'red' ? 'alert-triangle' : 'arrow-big-right-lines'} />
                <div>
                  <div className="t">{next?.nextText || 'Nothing left to do'}</div>
                  <div className="s">{topAttention ? topAttention.text : 'Nothing urgent on this job'}</div>
                </div>
                {action && <button type="button" className="ix-btn sm primary" onClick={action.run}>{action.label}</button>}
              </div>
              {j.attention.length > 1 && (
                <div style={{ marginTop: -8, marginBottom: 16 }}>
                  {j.attention.slice(1).map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '4px 2px' }}><span className={`ix-dot ${a.level}`} />{a.text}</div>
                  ))}
                </div>
              )}
              <div className="ix-kv">
                {kv.map(([k, v, mono]) => <div key={k}><div className="k">{k}</div><div className={`v ${mono ? 'mono' : ''}`}>{v}</div></div>)}
                <div>
                  <div className="k">Containers</div>
                  <div className="v">
                    {containers.length === 0 ? '—'
                      : containers.length === 1 ? <span className="mono">{containers[0].no}</span>
                      : <><b>{containers.length}</b> containers<button type="button" className="ix-link" onClick={() => setTab('containers')}>See all →</button></>}
                  </div>
                </div>
                <div><div className="k">Goods</div><div className="v">{job.goods || '—'}</div></div>
                {(() => {
                  // the ship, live on VesselFinder's free map (by IMO number)
                  const ship = vesselOf(job, data)
                  if (!ship) return null
                  const { imo, mmsi } = shipIdOf(job, ship, data)
                  return (
                    <div>
                      <div className="k">Ship</div>
                      <div className="v" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>{ship}{imo || mmsi ? <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{imo ? `IMO ${imo}` : `MMSI ${mmsi}`}</span> : null}</span>
                        {imo || mmsi
                          ? <button type="button" className="ix-link" style={{ margin: 0 }} onClick={() => setShowShip((v) => !v)}>{showShip ? 'Hide map' : 'Where is it now? →'}</button>
                          : <a className="ix-link" style={{ margin: 0 }} href={vesselFinderLink(null, ship)} target="_blank" rel="noreferrer">Find on VesselFinder ↗</a>}
                      </div>
                    </div>
                  )
                })()}
                <div>
                  <div className="k">{(j.trucks || []).length > 1 ? `Trucks · ${j.trucks.length}` : 'Truck'}</div>
                  <div className="v" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(j.trucks || []).length === 0 && <span>—</span>}
                    {(j.trucks || []).map((t) => (
                      <span key={t.no} title={t.location ? `Last seen ${t.location.plaza}` : 'Not checked yet'}>
                        <span className="ix-plate" style={{ fontSize: 12 }}>{t.no}</span>
                        {t.container && <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>{t.container}</span>}
                      </span>
                    ))}
                    {!isExport && j.oocDone && j.onwardMode !== 'rail' && (
                      <button type="button" className="ix-link" style={{ margin: 0 }} onClick={() => onOpenTruck(job.id)}>
                        {(j.trucks || []).length ? 'Add / manage trucks →' : 'Assign truck →'}
                      </button>
                    )}
                  </div>
                </div>
                {!isExport && (
                  <div>
                    <div className="k">Leaves the port / CFS by</div>
                    <div className="v" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[['truck', 'Truck'], ['rail', 'Rail']].map(([id, l]) => (
                        <button key={id} type="button" className={`ix-btn sm ${j.onwardMode === id ? 'primary' : ''}`}
                          onClick={() => job.field_meta?.onward_mode !== id && setMeta('onward_mode', id, id === 'rail' ? 'Saved: goes by rail' : 'Saved: goes by truck')}>{l}</button>
                      ))}
                      {!job.field_meta?.onward_mode && j.onwardMode && <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>(from tracking)</span>}
                    </div>
                  </div>
                )}
                {!isExport && (
                  <div>
                    <div className="k">Delivery to warehouse</div>
                    <div className="v" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[['jds', 'JDS delivers'], ['client', 'Client collects']].map(([id, l]) => (
                        <button key={id} type="button" className={`ix-btn sm ${deliveryBy(job) === id ? 'primary' : ''}`} onClick={() => deliveryBy(job) !== id && setDelivery(id)}>{l}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {showShip && (() => { const id = shipIdOf(job, vesselOf(job, data), data); return id.imo || id.mmsi })() && (
                <div style={{ margin: '4px 0 16px' }}>
                  <ShipMap {...shipIdOf(job, vesselOf(job, data), data)} height={400} />
                </div>
              )}
              <div className="ix-section-t">Latest events</div>
              {shownEvents.length ? (
                <div className="ix-timeline">
                  {shownEvents.slice(0, 4).map((e, i) => (
                    <div key={i} className={`ix-tl ${i === 0 ? 'latest' : 'ok'}`}>
                      <div className="t">{e.t}</div>
                      <div className="m"><span className={`ix-src ${e.src}`}>{e.src}</span>{fmtDate(e.at)}{e.by ? ` · ${e.by}` : ''}</div>
                    </div>
                  ))}
                  {shownEvents.length > 4 && <button type="button" className="ix-link" style={{ margin: 0 }} onClick={() => setTab('timeline')}>See the full timeline →</button>}
                </div>
              ) : <div className="ix-empty" style={{ padding: 0 }}>No events yet.</div>}
            </>
          )}

          {tab === 'containers' && (
            <>
              <div className="ix-ctr-sum">
                {groups.map(([id, l, fn]) => (
                  <button key={id} type="button" className={ctrFilter === id ? 'on' : ''} onClick={() => setCtrFilter(id)}>
                    <b>{containers.filter(fn).length}</b><span>{l}</span>
                  </button>
                ))}
              </div>
              {containers.length > 6 && (
                <div className="ix-ctr-tools"><input value={ctrQ} onChange={(e) => setCtrQ(e.target.value)} placeholder="Find a container…" /></div>
              )}
              <div className="ix-ctr-list">
                <table>
                  <thead><tr><th>Container</th><th>Size</th><th>Status</th><th>Free days</th><th>Where</th></tr></thead>
                  <tbody>
                    {ctrRows.map((c) => {
                      const [tone, ic] = statusTone(c.status)
                      return (
                        <tr key={c.no}>
                          <td className="mono"><b>{c.no}</b></td>
                          <td style={{ color: 'var(--text-2)' }}>{c.size}</td>
                          <td><Chip tone={tone} icon={ic}>{c.status}</Chip>{c.stale && <span title="No movement for 30+ days" style={{ marginLeft: 6, color: 'var(--muted)' }}><Icon name="clock-question" /></span>}</td>
                          <td><FreeDays value={c.freeLeft} /></td>
                          <td style={{ color: 'var(--text-2)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.where || ''}>{c.where || '—'}</td>
                        </tr>
                      )
                    })}
                    {ctrRows.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No containers match</td></tr>}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                Showing {ctrRows.length} of {containers.length} · from container tracking (LDB). Trucks are assigned on the Trucks page.
              </div>
            </>
          )}

          {tab === 'timeline' && timeline}

          {tab === 'docs' && (
            <>
              {docs.length === 0 && <div className="ix-empty" style={{ padding: '0 0 12px' }}>No documents uploaded yet.</div>}
              {docs.map((d) => (
                <div key={d.id} className="ix-doc">
                  <Icon name={/pdf/i.test(d.file_type || d.file_name) ? 'file-type-pdf' : 'file-text'} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.doc_type ? `${d.doc_type} · ` : ''}{d.file_name}</div>
                    <div className="s">{d.uploaded_by_name ? `by ${d.uploaded_by_name} · ` : ''}{timeAgo(d.created_at)}</div>
                  </div>
                  {d.file_url && <a className="ix-btn sm" style={{ marginLeft: 'auto', textDecoration: 'none' }} href={d.file_url} target="_blank" rel="noreferrer">View</a>}
                </div>
              ))}
              <button type="button" className="ix-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} onClick={() => onOpenFull(job.id, 'documents')}>
                <Icon name="upload" />Upload on the full job page
              </button>
            </>
          )}

          {tab === 'notes' && (
            notes.length === 0
              ? <div className="ix-empty" style={{ padding: 0 }}>No notes yet. Notes are seen by everyone at JDS who opens this job.</div>
              : [...notes].reverse().map((n) => (
                <div key={n.id} className="ix-note">
                  <span className="ix-avatar">{initials(n.done_by_name)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="who">{n.done_by_name || 'Someone'} · {timeAgo(n.created_at)}</div>
                    <div className="bubble">{n.note || n.title}</div>
                  </div>
                </div>
              ))
          )}
        </div>

        {tab === 'notes' && (
          <div className="ix-composer">
            <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !saving && addNote()} placeholder="Write a note for the team…" maxLength={1000} />
            <button type="button" className="ix-btn primary" onClick={addNote} disabled={saving || !note.trim()}>{saving ? 'Saving…' : 'Send'}</button>
          </div>
        )}
      </aside>
    </>
  )
}

const STEP_ICON = { arrival: 'ship', be: 'file-certificate', ooc: 'circle-check', out: 'box', truck: 'truck', delivered: 'flag', sb: 'file-text', leo: 'hourglass', egm: 'ship' }
