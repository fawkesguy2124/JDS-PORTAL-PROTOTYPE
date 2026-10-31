import { useMemo, useState } from 'react'
import { isDelivered, isExportJob, displayLine } from '../../services/journey'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import ShipMap, { vesselsOf, shipIdOf, shipPosition, voyage, toneOf } from '../ShipMap'
import { cargoOnShip, seaOf } from '../../../supabase/functions/_shared/portal/ships.js'
import { Icon, Skeleton, fmtDate, PageHead, JobNo, Status, EmptyState } from '../ui'
import { shipChecks, realMs } from '../shipChecks'
import { polText, seaWhere, portName, notSailed, moveText, nextStop, atPort } from '../SeaTracking'
import '../styles/tracking.css'

const TONE_ORDER = { sea: 0, port: 1, old: 2 }
const pad = (n) => String(n).padStart(2, '0')

// The line's ETA as a date (audit, 31 Oct 2026: every ETA ended in "6:30 pm"). A value
// at exactly 18:30 UTC is a date-only ETA at India midnight, so it shows as that India
// date alone; 00:00 UTC is a date alone too. Any other time is port time, as given.
const etaParts = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d)) return { day: String(iso), time: '' }
  const h = d.getUTCHours(), mi = d.getUTCMinutes(), whole = !d.getUTCSeconds() && !d.getUTCMilliseconds()
  if (whole && h === 18 && mi === 30) return { day: fmtDate(iso), time: '' } // fmtDate prints the India date
  const day = fmtDate(d.toISOString().slice(0, 10))
  return { day, time: whole && !h && !mi ? '' : `${pad(h)}:${pad(mi)}` }
}
const portEta = (iso) => { const p = etaParts(iso); return p ? (p.time ? `${p.day}, ${p.time}` : p.day) : null }
// how far the line moved the ETA since tracking started: later is amber, earlier is plain
const delayText = (d) => (d.days > 0 ? `ETA +${d.days} d` : `ETA ${-d.days} d earlier`)
const statusOf = (r) => (r.m.waiting ? ['grey', 'Not sailed'] : r.m.arrived || r.m.atPod ? ['teal', 'At port'] : r.tone === 'old' ? ['grey', 'Old position'] : ['blue', 'At sea'])

// Vessels: every ship that still carries our cargo, on the portal's own map, one row
// per ship with all its jobs (Jose, 22 Oct 2026). Rows, pins and tags are labelled by
// job number, never by ship name (Jose, 31 Oct 2026). Once the cargo is unloaded
// (cargoOnShip) the ship leaves this page. Staff type the IMO once (saved on every job
// of that ship); behind the scenes the IGM check and the vessel-track finder may also
// supply it. Nothing here calls a government system.
export default function VesselsPage({ onOpenJob }) {
  const { data, active, loading } = useJourney()
  useFreshOnOpen()
  // ship row key; an alert link (?job=) picks the ship carrying that job
  const [selected, setSelected] = useState(() => { const j = new URLSearchParams(window.location.search).get('job'); return j ? `link:${j}` : null })
  const [openedAt] = useState(() => Date.now()) // 'next arrival' is counted from when the page opened

  const igmOf = (job) => { const n = String(job.ulip_refs?.igm_no || '').replace(/\D/g, ''); return n.length >= 5 && !/^0+$/.test(n) ? n : null }

  // one row per ship: same IMO (or radio number, or name) = same ship; a job
  // whose ship isn't known yet gets its own row, to type the IMO. Only
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
        if (!g.jobs.some((x) => x.job.id === job.id)) g.jobs.push({ job, j, arrived: j.arrivedAt, first: true })
        groups.set(key, g)
        continue
      }
      names.forEach((name, i) => {
        if (!cargoOnShip(job, name, data, j).onBoard) return
        const id = shipIdOf(job, name, data)
        const key = id.imo ? `imo:${id.imo}` : id.mmsi ? `mmsi:${id.mmsi}` : `name:${name}`
        const g = groups.get(key) || { key, name, imo: id.imo, mmsi: id.mmsi, jobs: [] }
        g.name ||= name // a row made from an IMO alone gets the name once a job knows it
        if (!g.jobs.some((x) => x.job.id === job.id)) g.jobs.push({ job, j, arrived: j.arrivedAt, first: i === 0 })
        groups.set(key, g)
      })
    }
    return [...groups.values()].map((g) => {
      // "at sea" until the ship reaches port (then unloading, for up to 2 days)
      const dates = g.jobs.map((x) => x.arrived).filter(Boolean).sort()
      return { ...g, arrived: dates[0] || null, jobs: g.jobs.sort((a, b) => String(a.job.job_no).localeCompare(String(b.job.job_no), undefined, { numeric: true })) }
    }).sort((a, b) => (!!a.arrived - !!b.arrived) || String(b.arrived || '').localeCompare(String(a.arrived || '')))
  }, [active, data])

  // the ship tracking of one of the ship's jobs (the one on this IMO first); old voyages are skipped by seaOf
  const seaOfShip = (s) => {
    const rows = s.jobs.map((x) => seaOf(x.job, data)).filter(Boolean)
    return rows.find((r) => s.imo && r.vessel_imo === s.imo) || rows[0] || null
  }
  // a ship is on the map once its position is known (ship tracking, else the finder)
  const positionOf = (s) => shipPosition(seaOfShip(s), s.name ? data?.shipIds?.[s.name] : null)
  const shown = (s) => !!positionOf(s)
  // the shipping line of a ship's jobs: with the IMO that is all JDS needs; the
  // ship's own name is not asked for (Jose, 24 Oct 2026)
  const lineOf = (s) => { const j = s.jobs.find((x) => x.job.shipping_line)?.job; return j ? displayLine(j.shipping_line) || j.shipping_line : null }
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
      eta: ok && sea.pod_date ? `${sea.pod_actual ? 'Arrived' : 'ETA'} ${portEta(sea.pod_date)}` : null, arrived: !!s.arrived || !!(ok && sea.pod_actual),
      where: ok ? seaWhere(sea) : null, route: ok ? sea.route : null,
      lastMove: ok && atPort(sea) ? moveText(sea.last_event, false) : null, nextStop: ok && atPort(sea) ? nextStop(sea) : null,
      polName: ok ? portName(sea.pol) : null, polDate: ok ? polText(sea) : null, waiting: notSailed(sea), podName: ok ? portName(sea.pod) : null,
    }
  }).map((m, i) => {
    // at the port before the line confirms it, ETA passed, delays (shipChecks)
    const sea = seaOfShip(ships[i])
    const c = shipChecks(sea && !sea.error ? sea : null, m, voyage(m))
    // one wording for an ETA change in the row and in the map card
    return { ...m, atPod: c.atPod, delay: c.delay ? { ...c.delay, text: delayText(c.delay) } : null, flags: c.flags }
  })

  // (no "Ship has left" button any more: ship tracking says when the ship arrives and the
  // ship leaves this list by itself two days later; Jose, 24 Oct 2026)

  // the tracking console (Jose, 25 Oct 2026): the ship list on the left, the map beside
  // it. No figures and no filter tabs (Jose, 1 Nov 2026: each row already says At sea /
  // At port); only the next arrival, at the right of the page title.
  const rows = ships.filter(shown).map((s) => {
    const m = mapShips.find((x) => x.key === s.key)
    const sea = seaOfShip(s)
    const serious = m.flags.filter((f) => f.tone === 'red' || f.tone === 'amber')
    return { s, m, sea, serious, tone: toneOf(m), trip: voyage(m), podAt: sea && !sea.error && !sea.pod_actual ? sea.pod_date : null }
  }).sort((a, b) => (TONE_ORDER[a.tone] - TONE_ORDER[b.tone]) || String(a.podAt || '9').localeCompare(String(b.podAt || '9')))
  const listed = rows
  // the next ship due (the line's port time; Nhava Sheva is India time)
  const next = rows.filter((r) => r.podAt && r.tone === 'sea' && realMs(r.podAt, r.sea?.pod) > openedAt)
    .sort((a, b) => String(a.podAt).localeCompare(String(b.podAt)))[0]
  const nextEta = next ? etaParts(next.podAt) : null
  const mapH = typeof window !== 'undefined' ? (window.innerWidth < 900 ? 420 : Math.max(520, window.innerHeight - 250)) : 560
  const jobNos = (jobs) => jobs.map(({ job }) => <JobNo key={job.id} no={job.job_no} onClick={() => onOpenJob?.(job.id)} />)
  // 'Next arrival J-674 · 20 Nov', job number first; pressing it shows that ship on the map
  const nextLine = next ? (
    <button type="button" className="ix-vs-next" onClick={() => setSelected(next.s.key)} title="Show this ship on the map">
      <span className="ic"><Icon name="anchor" /></span>
      <span className="t">
        <small>Next arrival</small>
        <b><span className="mono">{next.s.jobs.map(({ job }) => job.job_no).join(', ')}</span> · {nextEta.day}{nextEta.time ? `, ${nextEta.time}` : ''}</b>
      </span>
    </button>
  ) : null

  return (
    <>
      <PageHead title="Vessels" actions={nextLine} />

      {loading && !data ? (
        <div className="ix-card"><Skeleton rows={5} /></div>
      ) : (
        <>
          <section className="ix-card ix-trk-console" style={{ '--vt-h': `${mapH}px` }}>
            <aside className="ix-trk-list">
              <div className="ix-trk-rows">
                {!listed.length && (
                  <EmptyState icon="ship" title="No ship is carrying our cargo right now" />
                )}
                {listed.map((r) => {
                  const { s, m, sea, trip } = r
                  const [tone, label] = statusOf(r)
                  const pct = m.arrived || m.atPod ? 100 : m.waiting ? 0 : trip?.pct
                  const kmLeft = !m.arrived && !m.atPod && !m.waiting && trip?.left != null ? Math.round(trip.left * 1.852) : null
                  const boxes = s.jobs.reduce((n, x) => n + (x.j?.containers?.nos?.length || 0), 0)
                  const isSel = sel?.key === s.key
                  return (
                    <div key={s.key} className={`ix-vl-row ${r.tone} ${isSel ? 'sel' : ''}`} role="button" tabIndex={0} aria-pressed={isSel}
                      onClick={() => setSelected(isSel ? null : s.key)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(s.key) } }}>
                      <div className="top">
                        <span className="jobs">{jobNos(s.jobs)}</span>
                        <Status tone={tone}>{label}</Status>
                      </div>
                      <div className="l2">
                        {m.clients || 'No client'}
                        {m.line && <span className="m"> · {m.line}</span>}
                        {boxes > 0 && <span className="m"> · {boxes} container{boxes === 1 ? '' : 's'}</span>}
                      </div>
                      <div className="l3">
                        {sea && !sea.error && sea.pod_date && <span>{sea.pod_actual ? 'Arrived' : 'ETA'} <b>{portEta(sea.pod_date)}</b></span>}
                        {kmLeft != null ? <span>{kmLeft.toLocaleString('en-IN')} km to go</span>
                          // (the status already says At port: no second 'At the port' here)
                          : m.atPod && !m.arrived ? (label === 'At port' ? null : <span>At the port</span>)
                            : m.waiting ? <span>Not sailed yet</span> : null}
                        {m.delay && !m.arrived && (
                          <span className={`ix-delay ${m.delay.tone}`} title="How far the line moved the ETA since tracking started">{m.delay.text}</span>
                        )}
                      </div>
                      {r.serious.slice(0, 1).map((f) => <div key={f.id} className={`warn ${f.tone}`}><Icon name={f.icon} />{f.text}</div>)}
                      {pct != null && <div className="bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>}
                    </div>
                  )
                })}
              </div>
            </aside>
            <div className="ix-trk-map">
              <ShipMap ships={mapShips} selectedKey={sel?.key || null} onSelect={setSelected} height={mapH} />
            </div>
          </section>

          {/* (no 'Ships without a position yet' list: not for JDS; a job shows here once its
              ship has a position; Jose, 1 Nov 2026) */}
        </>
      )}
    </>
  )
}
