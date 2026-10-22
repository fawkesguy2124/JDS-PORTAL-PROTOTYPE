import { useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isDelivered, isExportJob } from '../../services/journey'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import ShipMap, { vesselsOf, shipIdOf } from '../ShipMap'
import { Icon, Chip, fmtDate } from '../ui'

// Vessels: every ship of every open job, live on VesselFinder's free map. Staff
// type the IMO once; behind the scenes the IGM check and the vessel-track finder
// may also supply it (never shown on screen: Jose, 22 Oct 2026). Not ULIP.
export default function VesselsPage({ onOpenJob, showToast }) {
  const { data, active, loading, patchJob } = useJourney()
  useFreshOnOpen()
  const [selected, setSelected] = useState(null) // `${jobId}:${ship}`
  const [typing, setTyping] = useState({}) // jobId -> IMO being typed
  const [saving, setSaving] = useState(null)

  // one row per ship (a job whose containers sail on two ships has two rows)
  const ships = useMemo(() => (active || [])
    .filter(({ job }) => !isDelivered(job) && !isExportJob(job))
    .flatMap(({ job, j }) => vesselsOf(job, data).map((name, i) => {
      const id = shipIdOf(job, name, data)
      return { key: `${job.id}:${name}`, job, name, first: i === 0, arrived: j.arrivedAt, ...id }
    }))
    // still at sea first, then the most recently arrived
    .sort((a, b) => (!!a.arrived - !!b.arrived) || String(b.arrived || '').localeCompare(String(a.arrived || ''))), [active, data])

  const shown = (s) => !!(s.imo || s.mmsi)
  const sel = ships.find((s) => s.key === selected) || ships.find((s) => shown(s) && !s.arrived) || ships.find(shown) || null

  const saveImo = async (job) => {
    const no = String(typing[job.id] || '').replace(/\D/g, '')
    if (no.length !== 7) { showToast?.('The IMO number has 7 digits, for example 9467287.', 'error'); return }
    setSaving(job.id)
    const { data: row, error } = await supabase.rpc('merge_job_refs', { p_job: job.id, p_found: {}, p_typed: { imo_code: no }, p_truck: null })
    setSaving(null)
    const saved = Array.isArray(row) ? row[0] : row
    if (error || !saved?.id) { showToast?.(`Could not save: ${error?.message || 'no permission'}`, 'error'); return }
    patchJob(saved)
    setTyping((p) => ({ ...p, [job.id]: undefined }))
    showToast?.(`IMO ${no} saved on ${job.job_no}`, 'success')
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
          <h2>{sel && shown(sel) ? `${sel.name} · ${sel.job.job_no}` : 'Ships near Nhava Sheva'}</h2>
        </div>
        <ShipMap imo={sel?.imo} mmsi={sel?.mmsi} height={440} />
      </div>

      <div className="ix-card">
        <div className="ix-card-head">
          <Icon name="list-details" style={{ color: 'var(--navy)' }} />
          <h2>Ships of open jobs</h2><span className="ix-chip grey">{ships.length}</span>
          <span className="sub hide-m">Type the ship's IMO number once to see it on the map.</span>
        </div>
        {loading && !data && <div className="ix-empty">Loading…</div>}
        {data && ships.length === 0 && <div className="ix-empty">No open job has a ship name yet. Ship names come from container tracking.</div>}
        {ships.map((s) => (
          <div key={s.key} className={`ix-ship-row ${sel?.key === s.key ? 'sel' : ''}`}>
            <div className="who">
              <button type="button" className="ix-plate" disabled={!shown(s)} onClick={() => setSelected(s.key)} title={shown(s) ? 'Show this ship on the map' : 'The ship\'s number is not known yet'} style={{ cursor: shown(s) ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                {s.name}
              </button>
              <div style={{ minWidth: 0 }}>
                <button type="button" className="ix-link" style={{ margin: 0 }} onClick={() => onOpenJob?.(s.job.id)}><b className="mono">{s.job.job_no}</b></button>
                <span style={{ color: 'var(--text-2)' }}> · {s.job.client || 'No client'}</span>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {s.imo ? `IMO ${s.imo}` : s.mmsi ? 'Live position available' : 'IMO not added yet'}
                  {s.job.eta ? ` · ETA ${fmtDate(s.job.eta)}` : ''}
                </div>
              </div>
            </div>
            <div className="act">
              {s.arrived ? <Chip tone="green" icon="anchor">Arrived {fmtDate(s.arrived)}</Chip> : <Chip tone="blue" icon="ship">At sea</Chip>}
              {shown(s) && (
                <>
                  <button type="button" className={`ix-btn sm ${sel?.key === s.key ? 'primary' : ''}`} onClick={() => setSelected(s.key)}><Icon name="map-pin" />Show</button>
                </>
              )}
              {/* the IMO box, until the ship can be shown */}
              {s.first && !shown(s) && (
                <>
                  <input value={typing[s.job.id] || ''} onChange={(e) => setTyping((p) => ({ ...p, [s.job.id]: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                    placeholder="IMO (7 digits)" inputMode="numeric" aria-label={`IMO number for ${s.job.job_no}`} />
                  <button type="button" className="ix-btn sm primary" disabled={saving === s.job.id || String(typing[s.job.id] || '').length !== 7} onClick={() => saveImo(s.job)}>{saving === s.job.id ? 'Saving…' : 'Save'}</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
