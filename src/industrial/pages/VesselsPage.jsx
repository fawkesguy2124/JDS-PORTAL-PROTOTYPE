import { useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isDelivered, isExportJob } from '../../services/journey'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import ShipMap, { vesselsOf, shipIdOf } from '../ShipMap'
import { Icon, Chip, fmtDate } from '../ui'

// Vessels: every ship of the open sea jobs, live on VesselFinder's free map, one
// row per ship with all its jobs (Jose, 22 Oct 2026). Staff type the IMO once
// (saved on every job of that ship); behind the scenes the IGM check and the
// vessel-track finder may also supply it (never shown on screen). Not ULIP.
export default function VesselsPage({ onOpenJob, showToast }) {
  const { data, active, loading, patchJob } = useJourney()
  useFreshOnOpen()
  const [selected, setSelected] = useState(null) // ship row key
  const [typing, setTyping] = useState({}) // row key -> IMO being typed
  const [naming, setNaming] = useState({}) // job id -> ship name being typed
  const [saving, setSaving] = useState(null)

  // one row per ship: same IMO (or radio number, or name) = same ship; a job
  // whose ship isn't known yet gets its own row, to type the ship name
  const ships = useMemo(() => {
    const groups = new Map()
    for (const { job, j } of active || []) {
      if (isDelivered(job) || isExportJob(job) || /air/i.test(job.mode || '')) continue
      const names = vesselsOf(job, data)
      if (!names.length) {
        groups.set(`job:${job.id}`, { key: `job:${job.id}`, name: null, imo: null, mmsi: null, jobs: [{ job, arrived: j.arrivedAt, first: true }] })
        continue
      }
      names.forEach((name, i) => {
        const id = shipIdOf(job, name, data)
        const key = id.imo ? `imo:${id.imo}` : id.mmsi ? `mmsi:${id.mmsi}` : `name:${name}`
        const g = groups.get(key) || { key, name, imo: id.imo, mmsi: id.mmsi, jobs: [] }
        if (!g.jobs.some((x) => x.job.id === job.id)) g.jobs.push({ job, arrived: j.arrivedAt, first: i === 0 })
        groups.set(key, g)
      })
    }
    return [...groups.values()].map((g) => {
      // the ship is "at sea" until any of its jobs' containers reached port
      const dates = g.jobs.map((x) => x.arrived).filter(Boolean).sort()
      return { ...g, arrived: dates[0] || null, jobs: g.jobs.sort((a, b) => String(a.job.job_no).localeCompare(String(b.job.job_no), undefined, { numeric: true })) }
    }).sort((a, b) => (!!a.arrived - !!b.arrived) || String(b.arrived || '').localeCompare(String(a.arrived || '')))
  }, [active, data])

  const shown = (s) => !!(s.imo || s.mmsi)
  const sel = ships.find((s) => s.key === selected) || ships.find((s) => shown(s) && !s.arrived) || ships.find(shown) || null

  const saveShip = async (job) => {
    const name = String(naming[job.id] || '').trim().toUpperCase()
    if (name.length < 3) { showToast?.('Type the ship name, for example CSCL MARS.', 'error'); return }
    setSaving(job.id)
    const { data: rows, error } = await supabase.from('jobs').update({ vessel: name, updated_at: new Date().toISOString() }).eq('id', job.id).select()
    setSaving(null)
    if (error || !rows?.length) { showToast?.(`Could not save: ${error?.message || 'no permission'}`, 'error'); return }
    patchJob(rows[0])
    setNaming((p) => ({ ...p, [job.id]: undefined }))
    showToast?.(`Ship ${name} saved on ${job.job_no}`, 'success')
  }

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
    showToast?.(`IMO ${no} saved for ${s.name} (${s.jobs.map((x) => x.job.job_no).join(', ')})`, 'success')
  }

  return (
    <div className="ix-page">
      <div className="ix-page-head">
        <div>
          <h1>Vessels</h1>
          <p>Where the ship of each open job is, live from VesselFinder</p>
        </div>
      </div>

      <div className="ix-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div className="ix-card-head">
          <Icon name="ship" style={{ color: 'var(--navy)' }} />
          <h2>{sel && shown(sel) ? `${sel.name} · ${sel.jobs.map((x) => x.job.job_no).join(', ')}` : 'Ships near Nhava Sheva'}</h2>
        </div>
        <ShipMap imo={sel?.imo} mmsi={sel?.mmsi} height={440} />
      </div>

      <div className="ix-card">
        <div className="ix-card-head">
          <Icon name="list-details" style={{ color: 'var(--navy)' }} />
          <h2>Ships of open jobs</h2><span className="ix-chip grey">{ships.length}</span>
          <span className="sub hide-m">One row per ship. Type the ship's IMO once to see it on the map.</span>
        </div>
        {loading && !data && <div className="ix-empty">Loading…</div>}
        {data && ships.length === 0 && <div className="ix-empty">No open sea job right now.</div>}
        {ships.map((s) => (
          <div key={s.key} className={`ix-ship-row ${sel?.key === s.key ? 'sel' : ''}`}>
            <div className="who">
              <button type="button" className="ix-plate" disabled={!shown(s)} onClick={() => setSelected(s.key)} title={shown(s) ? 'Show this ship on the map' : 'The ship\'s number is not known yet'} style={{ cursor: shown(s) ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                {s.name || 'Ship ?'}
              </button>
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
                  {!s.name ? 'Ship not known yet (upload the BL, or type the ship name)' : s.imo ? `IMO ${s.imo}` : s.mmsi ? 'Live position available' : 'IMO not added yet'}
                  {s.jobs.length === 1 && s.jobs[0].job.eta ? ` · ETA ${fmtDate(s.jobs[0].job.eta)}` : ''}
                </div>
              </div>
            </div>
            <div className="act">
              {s.name && (s.arrived ? <Chip tone="green" icon="anchor">Arrived {fmtDate(s.arrived)}</Chip> : <Chip tone="blue" icon="ship">At sea</Chip>)}
              {shown(s) && (
                <button type="button" className={`ix-btn sm ${sel?.key === s.key ? 'primary' : ''}`} onClick={() => setSelected(s.key)}><Icon name="map-pin" />Show</button>
              )}
              {/* no ship yet: type its name */}
              {!s.name && (
                <>
                  <input value={naming[s.jobs[0].job.id] || ''} onChange={(e) => setNaming((p) => ({ ...p, [s.jobs[0].job.id]: e.target.value.toUpperCase().slice(0, 40) }))}
                    placeholder="Ship name" aria-label={`Ship name for ${s.jobs[0].job.job_no}`} style={{ width: 160, fontFamily: 'Inter, sans-serif' }} />
                  <button type="button" className="ix-btn sm primary" disabled={saving === s.jobs[0].job.id || String(naming[s.jobs[0].job.id] || '').trim().length < 3} onClick={() => saveShip(s.jobs[0].job)}>{saving === s.jobs[0].job.id ? 'Saving…' : 'Save'}</button>
                </>
              )}
              {/* the IMO box, until the ship can be shown (saved on all its jobs) */}
              {s.name && !shown(s) && (
                <>
                  <input value={typing[s.key] || ''} onChange={(e) => setTyping((p) => ({ ...p, [s.key]: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                    placeholder="IMO (7 digits)" inputMode="numeric" aria-label={`IMO number for ${s.name}`} />
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
