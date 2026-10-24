import { useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isDelivered, isExportJob } from '../../services/journey'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import ShipMap, { vesselsOf, shipIdOf, shipPosition } from '../ShipMap'
import { cargoOnShip } from '../../../supabase/functions/_shared/portal/ships.js'
import { lineName } from '../../../supabase/functions/_shared/portal/shippingLines.js'
import { Icon, Chip, Skeleton, fmtDate } from '../ui'
import { portTime, seaWhere, portName, notSailed, polText } from '../SeaTracking'

// Vessels: every ship that still carries our cargo, on the portal's own map with
// Safecube's positions (VesselFinder removed 24 Oct 2026), one row per ship with
// all its jobs (Jose, 22 Oct 2026). Once the cargo is
// unloaded (cargoOnShip) the ship leaves this page. Staff type the IMO once
// (saved on every job of that ship); behind the scenes the IGM check and the
// vessel-track finder may also supply it (never shown on screen). Not ULIP.
export default function VesselsPage({ onOpenJob, showToast, onGo }) {
  const { data, active, loading, patchJob } = useJourney()
  useFreshOnOpen()
  const [selected, setSelected] = useState(null) // ship row key
  const [typing, setTyping] = useState({}) // row key -> IMO being typed
  const [saving, setSaving] = useState(null)

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
  const sel = ships.find((s) => s.key === selected) || ships.find((s) => shown(s) && !s.arrived) || ships.find(shown) || null
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
      polName: ok ? portName(sea.pol) : null, polDate: ok ? polText(sea) : null, waiting: notSailed(sea), podName: ok ? portName(sea.pod) : null,
    }
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

  return (
    <div className="ix-page">
      <div className="ix-page-head">
        <div>
          <h1>Vessels</h1>
          <p>Where the ship of each open job is, live</p>
        </div>
      </div>

      <div className="ix-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div className="ix-card-head">
          <Icon name="ship" style={{ color: 'var(--navy)' }} />
          <h2>{sel && shown(sel) ? sel.jobs.map((x) => x.job.job_no).join(', ') : 'Ships with our cargo'}</h2>
        </div>
        <ShipMap ships={mapShips} selectedKey={sel?.key} onSelect={setSelected} height={typeof window !== 'undefined' && window.innerWidth < 760 ? 380 : 540} />
      </div>

      <div className="ix-card">
        <div className="ix-card-head">
          <Icon name="list-details" style={{ color: 'var(--navy)' }} />
          <h2>Ships with our cargo on board</h2><span className="ix-chip grey">{ships.length}</span>
          <span className="sub hide-m">Click a ship to see it on the map. A ship leaves this list by itself once it has arrived and our cargo is unloaded.</span>
        </div>
        {loading && !data && <Skeleton rows={4} />}
        {data && ships.length === 0 && <div className="ix-empty">No ship is carrying our cargo right now.</div>}
        {ships.map((s) => (
          // the whole row shows the ship on the map (job numbers open the job instead)
          <div key={s.key} className={`ix-ship-row ${sel?.key === s.key ? 'sel' : ''}`}
            onClick={() => shown(s) && setSelected(s.key)}
            role={shown(s) ? 'button' : undefined} tabIndex={shown(s) ? 0 : undefined}
            onKeyDown={(e) => { if (shown(s) && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelected(s.key) } }}
            title={shown(s) ? 'Show this ship on the map' : undefined}
            style={{ cursor: shown(s) ? 'pointer' : 'default' }}>
            <div className="who">
              {/* the job is what JDS knows a ship by; its IMO shows in the map's card (Jose, 24 Oct 2026) */}
              <span className={`ix-ship-ic ${s.arrived ? 'port' : shown(s) ? 'sea' : ''}`}><Icon name="ship" /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                  {s.jobs.map(({ job }) => (
                    <span key={job.id}>
                      <button type="button" className="ix-link" style={{ margin: 0 }} onClick={(e) => { e.stopPropagation(); onOpenJob?.(job.id) }}><b className="mono">{job.job_no}</b></button>
                      <span style={{ color: 'var(--text-2)' }}> · {job.client || 'No client'}</span>
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {(() => {
                    // Safecube's ETA and position, when one of the ship's jobs is tracked
                    const sea = seaOfShip(s)
                    const eta = sea && !sea.error ? (sea.pod_actual ? `Arrived ${portTime(sea.pod_date)}` : `ETA ${portTime(sea.pod_date)}`) : s.jobs.length === 1 && s.jobs[0].job.eta ? `ETA ${fmtDate(s.jobs[0].job.eta)}` : null
                    return [lineOf(s), s.imo ? null : unknownHint(s), eta, sea && !sea.error ? seaWhere(sea) : null,
                      !shown(s) && !sea ? 'No position yet: open the job and tap Track this ship' : null].filter(Boolean).join(' · ')
                  })()}
                </div>
              </div>
            </div>
            <div className="act" onClick={(e) => e.stopPropagation()}>
              {(s.name || s.imo) && (s.arrived ? <Chip tone="amber" icon="anchor">At port, unloading</Chip> : notSailed(seaOfShip(s)) ? <Chip tone="grey" icon="clock">Not sailed yet</Chip> : <Chip tone="blue" icon="ship">At sea</Chip>)}
              {/* no IMO yet: the IGM check finds it (one check, by a person), or type it */}
              {!s.imo && igmOf(s.jobs[0].job) && (
                <button type="button" className="ix-btn sm" onClick={() => onGo?.(`customs&job=${s.jobs[0].job.id}`)} title="Opens this job's IGM check on the BE & OOC page">
                  <Icon name="search" />Check IGM
                </button>
              )}
              {/* the IMO box, until the ship's IMO is known (saved on all its jobs) */}
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
    </div>
  )
}
