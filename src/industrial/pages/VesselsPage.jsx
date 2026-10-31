import { useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isDelivered, isExportJob } from '../../services/journey'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import ShipMap from '../ShipMap'
import { vesselsOf, shipIdOf, shipPosition, voyage, toneOf, TONE_COLOR } from '../shipInfo'
import { cargoOnShip } from '../../../supabase/functions/_shared/portal/ships.js'
import { lineName } from '../../../supabase/functions/_shared/portal/shippingLines.js'
import { Icon, Skeleton, fmtDate } from '../ui'
import { shipChecks } from '../shipChecks'
import { portTime, seaWhere, portName, notSailed, polText, moveText, nextStop, atPort } from '../SeaTracking'

const TONE_ORDER = { sea: 0, port: 1, old: 2 }

// Vessels: every ship that still carries our cargo, on the portal's own map with
// Safecube's positions (VesselFinder removed 24 Oct 2026), one row per ship with
// all its jobs (Jose, 22 Oct 2026). Once the cargo is
// unloaded (cargoOnShip) the ship leaves this page. Staff type the IMO once
// (saved on every job of that ship); behind the scenes the IGM check and the
// vessel-track finder may also supply it (never shown on screen). Not ULIP.
export default function VesselsPage({ onOpenJob, showToast, onGo }) {
  const { data, active, loading, patchJob } = useJourney()
  useFreshOnOpen()
  // ship row key; an alert link (?job=) picks the ship carrying that job
  const [selected, setSelected] = useState(() => { const j = new URLSearchParams(window.location.search).get('job'); return j ? `link:${j}` : null })
  const [typing, setTyping] = useState({}) // row key -> IMO being typed
  const [saving, setSaving] = useState(null)
  const [filter, setFilter] = useState('all') // ship list: all / at sea / at port

  const igmOf = (job) => { const n = String(job.ulip_refs?.igm_no || '').replace(/\D/g, ''); return n.length >= 5 && !/^0+$/.test(n) ? n : null }

  // one row per ship: same IMO (or radio number, or name) = same ship; a job
  // whose ship isn't known yet gets its own row, to type the ship name. Only
  // ships with our cargo still on board.
  const ships = useMemo(() => {
    const groups = new Map()
    for (const { job, j } of active || []) {
      if (isDelivered(job) || isExportJob(job) || /air/i.test(job.mode || '')) continue
      const names = vesselsOf(job, data)
      if (!names.length) {
        if (!cargoOnShip(job, null, data, j).onBoard) continue
        // no ship name yet, but the IGM check may already have given the IMO: the map works with it
        const id = shipIdOf(job, null, data)
        const igm = igmOf(job)
        const key = id.imo ? `imo:${id.imo}` : igm ? `igm:${job.port_code}:${igm}` : `job:${job.id}`
        const g = groups.get(key) || { key, name: null, imo: id.imo, mmsi: null, jobs: [] }
        if (!g.jobs.some((x) => x.job.id === job.id)) g.jobs.push({ job, arrived: j.arrivedAt, first: true })
        groups.set(key, g)
        continue
      }
      names.forEach((name, i) => {
        if (!cargoOnShip(job, name, data, j).onBoard) return
        const id = shipIdOf(job, name, data)
        const key = id.imo ? `imo:${id.imo}` : id.mmsi ? `mmsi:${id.mmsi}` : `name:${name}`
        const g = groups.get(key) || { key, name, imo: id.imo, mmsi: id.mmsi, jobs: [] }
        g.name ||= name // a row made from an IMO alone gets the name once a job knows it
        if (!g.jobs.some((x) => x.job.id === job.id)) g.jobs.push({ job, arrived: j.arrivedAt, first: i === 0 })
        groups.set(key, g)
      })
    }
    return [...groups.values()].map((g) => {
      // "at sea" until the ship reaches port (then unloading, for up to 2 days)
      const dates = g.jobs.map((x) => x.arrived).filter(Boolean).sort()
      return { ...g, arrived: dates[0] || null, jobs: g.jobs.sort((a, b) => String(a.job.job_no).localeCompare(String(b.job.job_no), undefined, { numeric: true })) }
    }).sort((a, b) => (!!a.arrived - !!b.arrived) || String(b.arrived || '').localeCompare(String(a.arrived || '')))
  }, [active, data])

  // a ship is on the map once its position is known (Safecube, else the finder)
  const positionOf = (s) => shipPosition(seaOfShip(s), s.name ? data?.shipIds?.[s.name] : null)
  const shown = (s) => !!positionOf(s)
  // the shipping line of a ship's jobs ("MSC", "HUNGA A LINE"): with the IMO that is
  // all JDS needs; the ship's own name is not asked for (Jose, 24 Oct 2026)
  const lineOf = (s) => { const j = s.jobs.find((x) => x.job.shipping_line)?.job; return j ? lineName(j.shipping_line) || j.shipping_line : null }
  // a ship the map cannot show yet: what is known, and how to get the IMO
  const unknownHint = (s) => {
    const job = s.jobs[0].job
    const known = [igmOf(job) && `IGM ${igmOf(job)}${job.ulip_refs?.igm_date ? ` (${fmtDate(job.ulip_refs.igm_date)})` : ''}`].filter(Boolean)
    return `IMO not known yet${known.length ? ` · ${known.join(' · ')}` : ''}. Check the IGM or type the IMO.`
  }
  // the Safecube tracking of one of the ship's jobs (the one on this IMO first)
  const seaOfShip = (s) => {
    const rows = s.jobs.map((x) => data?.seaByJob?.[x.job.id]).filter(Boolean)
    return rows.find((r) => s.imo && r.vessel_imo === s.imo) || rows[0] || null
  }
  // nothing chosen at first: the map opens on all the ships
  const linked = typeof selected === 'string' && selected.startsWith('link:') ? selected.slice(5) : null
  const sel = ships.find((s) => shown(s) && (linked ? s.jobs.some((x) => x.job.id === linked) : s.key === selected)) || null
  // the map's pins: one per ship with a known position
  const mapShips = ships.map((s) => {
    const sea = seaOfShip(s)
    const p = positionOf(s)
    const ok = sea && !sea.error
    return {
      key: s.key, label: s.imo ? `IMO ${s.imo}` : null, jobs: s.jobs.map((x) => x.job.job_no).join(', '),
      clients: [...new Set(s.jobs.map((x) => x.job.client).filter(Boolean))].join(', '), line: lineOf(s),
      pos: p?.pos || null, at: p?.at || null, from: p?.from || null, track: ok ? sea.track : null,
      eta: ok && sea.pod_date ? `${sea.pod_actual ? 'Arrived' : 'ETA'} ${portTime(sea.pod_date)}` : null, arrived: !!s.arrived || !!(ok && sea.pod_actual),
      where: ok ? seaWhere(sea) : null, route: ok ? sea.route : null,
      lastMove: ok && atPort(sea) ? moveText(sea.last_event, false) : null, nextStop: ok && atPort(sea) ? nextStop(sea) : null,
      polName: ok ? portName(sea.pol) : null, polDate: ok ? polText(sea) : null, waiting: notSailed(sea), podName: ok ? portName(sea.pod) : null,
    }
  }).map((m, i) => {
    // at the port before the line confirms it, ETA passed, delays (shipChecks)
    const sea = seaOfShip(ships[i])
    const c = shipChecks(sea && !sea.error ? sea : null, m, voyage(m))
    return { ...m, atPod: c.atPod, delay: c.delay, flags: c.flags }
  })

  // one IMO for the ship, saved on every job on it
  const saveImo = async (s) => {
    const no = String(typing[s.key] || '').replace(/\D/g, '')
    if (no.length !== 7) { showToast?.('The IMO number has 7 digits, for example 9467287.', 'error'); return }
    setSaving(s.key)
    let failed = null
    // (a job's saved IMO is its first ship's: jobs where this ship is a second ship are skipped)
    for (const { job } of s.jobs.filter((x) => x.first)) {
      const { data: row, error } = await supabase.rpc('merge_job_refs', { p_job: job.id, p_found: {}, p_typed: { imo_code: no }, p_truck: null })
      const saved = Array.isArray(row) ? row[0] : row
      if (error || !saved?.id) { failed = error?.message || 'no permission'; continue }
      patchJob(saved)
    }
    setSaving(null)
    if (failed) { showToast?.(`Could not save on every job: ${failed}`, 'error'); return }
    setTyping((p) => ({ ...p, [s.key]: undefined }))
    setSelected(`imo:${no}`)
    showToast?.(`IMO ${no} saved on ${s.jobs.map((x) => x.job.job_no).join(', ')}`, 'success')
  }

  // (no "Ship has left" button any more: Safecube says when the ship arrives and the
  // ship leaves this list by itself two days later; Jose, 24 Oct 2026)

  // the tracking console (Jose, 25 Oct 2026: "a professional map tracking for vessels"):
  // the ship list on the left, the map beside it, a few figures on top
  const rows = ships.filter(shown).map((s) => {
    const m = mapShips.find((x) => x.key === s.key)
    const sea = seaOfShip(s)
    return { s, m, sea, tone: toneOf(m), trip: voyage(m), podAt: sea && !sea.error && !sea.pod_actual ? sea.pod_date : null }
  }).sort((a, b) => (TONE_ORDER[a.tone] - TONE_ORDER[b.tone]) || String(a.podAt || '9').localeCompare(String(b.podAt || '9')))
  const inPort = (r) => r.m.arrived || r.m.atPod
  const count = (t) => rows.filter((r) => (t === 'port' ? inPort(r) : t === 'sea' ? r.tone === 'sea' : true)).length
  const listed = rows.filter((r) => filter === 'all' || (filter === 'port' ? inPort(r) : r.tone === 'sea'))
  // everything worth a look, most serious first (Jose, 25 Oct 2026)
  const RANK = { red: 0, amber: 1, grey: 2, info: 3 }
  const alerts = rows.flatMap((r) => r.m.flags.map((f) => ({ ...f, key: r.s.key, jobs: r.m.jobs }))).sort((a, b) => RANK[a.tone] - RANK[b.tone])
  const serious = alerts.filter((a) => a.tone === 'red' || a.tone === 'amber').length
  // the next ship due (port time, written as UTC; Nhava Sheva is India time)
  const next = rows.filter((r) => r.podAt && r.tone === 'sea' && new Date(r.podAt).getTime() - 5.5 * 3600e3 > Date.now())
    .sort((a, b) => String(a.podAt).localeCompare(String(b.podAt)))[0]
  const noPosition = ships.filter((s) => !shown(s))
  const mapH = typeof window !== 'undefined' ? (window.innerWidth < 900 ? 420 : Math.max(560, window.innerHeight - 190)) : 560
  const statusText = (r) => (r.m.waiting ? 'Not sailed' : r.m.arrived ? 'At port' : r.m.atPod ? 'At port' : r.tone === 'old' ? 'Old position' : 'At sea')

  return (
    <div className="ix-page ix-page-wide">
      <div className="ix-page-head">
        <div>
          <h1>Vessels</h1>
          <p>Live position of every ship carrying our cargo · updated every hour</p>
        </div>
        <div className="right ix-vt-stats">
          <div><b>{rows.length}</b><span>ships tracked</span></div>
          <div><b style={{ color: TONE_COLOR.sea }}>{count('sea')}</b><span>at sea</span></div>
          <div><b style={{ color: TONE_COLOR.port }}>{count('port')}</b><span>at port</span></div>
          {next && <div className="wide"><b>{next.s.jobs.map((x) => x.job.job_no).join(', ')}</b><span>next arrival · {portTime(next.podAt)}{next.m.flags.some((f) => f.id === 'early') ? ' (likely later)' : ''}</span></div>}
        </div>
      </div>

      {data && rows.length > 0 && (
        <div className={`ix-card ix-vt-alerts ${serious ? '' : 'ok'}`}>
          <div className="hd">
            <Icon name={serious ? 'alert-triangle' : 'circle-check'} />
            <b>{serious ? `Needs attention · ${serious}` : 'All ships on schedule'}</b>
          </div>
          <div className="items">
            {alerts.map((a) => (
              <button key={`${a.key}-${a.id}`} type="button" className={`ix-vt-alert ${a.tone} ${sel?.key === a.key ? 'on' : ''}`} onClick={() => setSelected(a.key)} title="Show this ship on the map">
                <Icon name={a.icon} /><b>{a.jobs}</b><span>{a.text}</span>
              </button>
            ))}
            {!alerts.length && <span className="none">No delays, no missed ETAs, every position is fresh.</span>}
          </div>
        </div>
      )}

      <div className="ix-card ix-vt" style={{ "--vt-h": `${mapH}px` }}>
        <aside className="ix-vt-list">
          <div className="ix-vt-tabs" role="tablist">
            {[['all', 'All'], ['sea', 'At sea'], ['port', 'At port']].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>
                {label}<span>{count(id)}</span>
              </button>
            ))}
          </div>
          <div className="ix-vt-rows">
            {loading && !data && <Skeleton rows={4} />}
            {data && !listed.length && <div className="ix-empty">{rows.length ? 'No ship in this group.' : 'No ship is carrying our cargo right now.'}</div>}
            {listed.map((r) => {
              const { s, m, sea, trip } = r
              const pct = m.arrived || m.atPod ? 100 : m.waiting ? 0 : trip?.pct
              const kmLeft = !m.arrived && !m.atPod && !m.waiting && trip?.left != null ? Math.round(trip.left * 1.852) : null
              return (
                <div key={s.key} className={`ix-vrow ${r.tone} ${sel?.key === s.key ? 'sel' : ''}`} role="button" tabIndex={0}
                  onClick={() => setSelected(sel?.key === s.key ? null : s.key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(s.key) } }}>
                  <div className="top">
                    <span className="dot" />
                    <span className="jobs">
                      {s.jobs.map(({ job }) => (
                        <button key={job.id} type="button" className="job" title="Open the job" onClick={(e) => { e.stopPropagation(); onOpenJob?.(job.id) }}>{job.job_no}</button>
                      ))}
                    </span>
                    <span className={`st ${r.tone}`}>{statusText(r)}</span>
                  </div>
                  <div className="cl">{m.clients || 'No client'}{m.line ? <span> · {m.line}</span> : null}</div>
                  <div className="meta">
                    {sea && !sea.error && sea.pod_date && <span><Icon name="flag" />{sea.pod_actual ? 'Arrived' : 'ETA'} {portTime(sea.pod_date)}{m.delay && !m.arrived && <em className={`ix-delay ${m.delay.tone}`}>{m.delay.text}</em>}</span>}
                    {m.flags.filter((f) => f.tone === 'red' || f.tone === 'amber').slice(0, 1).map((f) => <span key={f.id} className={`warn ${f.tone}`}><Icon name={f.icon} />{f.text}</span>)}
                    {m.where && <span><Icon name="map-pin" />{m.where}</span>}
                  </div>
                  {pct != null && (
                    <div className="prog">
                      <div className="bar"><span style={{ width: `${pct}%` }} /></div>
                      <span className="n">{m.arrived ? 'Arrived' : m.atPod ? 'At the port' : m.waiting ? 'Not sailed yet' : kmLeft != null ? `${kmLeft.toLocaleString('en-IN')} km to go` : `${pct}%`}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>
        <div className="ix-vt-map">
          <ShipMap ships={mapShips} selectedKey={sel?.key || null} onSelect={setSelected} height={mapH} />
        </div>
      </div>

      {noPosition.length > 0 && (
        <div className="ix-card" style={{ marginTop: 16 }}>
          <div className="ix-card-head">
            <Icon name="map-pin-off" style={{ color: 'var(--muted)' }} />
            <h2>Ships without a position yet</h2><span className="ix-chip grey">{noPosition.length}</span>
            <span className="sub hide-m">Open the job and tap Track this ship, or type the IMO.</span>
          </div>
          {noPosition.map((s) => (
            <div key={s.key} className="ix-ship-row">
              <div className="who">
                <span className="ix-ship-ic"><Icon name="ship" /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                    {s.jobs.map(({ job }) => (
                      <span key={job.id}>
                        <button type="button" className="ix-link" style={{ margin: 0 }} onClick={() => onOpenJob?.(job.id)}><b className="mono">{job.job_no}</b></button>
                        <span style={{ color: 'var(--text-2)' }}> · {job.client || 'No client'}</span>
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {[lineOf(s), s.imo ? null : unknownHint(s), s.jobs.length === 1 && s.jobs[0].job.eta ? `ETA ${fmtDate(s.jobs[0].job.eta)}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
              <div className="act">
                {!s.imo && igmOf(s.jobs[0].job) && (
                  <button type="button" className="ix-btn sm" onClick={() => onGo?.(`customs&job=${s.jobs[0].job.id}`)} title="Opens this job's IGM check on the BE & OOC page">
                    <Icon name="search" />Check IGM
                  </button>
                )}
                {!s.imo && (
                  <>
                    <input value={typing[s.key] || ''} onChange={(e) => setTyping((p) => ({ ...p, [s.key]: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                      placeholder="IMO (7 digits)" inputMode="numeric" aria-label={`IMO number for ${s.jobs.map((x) => x.job.job_no).join(', ')}`} />
                    <button type="button" className="ix-btn sm primary" disabled={saving === s.key || String(typing[s.key] || '').length !== 7} onClick={() => saveImo(s)}>{saving === s.key ? 'Saving…' : 'Save'}</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
