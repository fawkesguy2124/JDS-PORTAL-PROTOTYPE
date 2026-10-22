import { useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isDelivered, isExportJob } from '../../services/journey'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import ShipMap, { vesselOf, imoOf, vesselFinderLink } from '../ShipMap'
import { Icon, Chip, fmtDate } from '../ui'

// Vessels: the ship of every open job, with its live position on VesselFinder's
// free map (by IMO number). The IMO comes from the job's IGM check, or staff
// type it once here. Not ULIP; nothing is checked by itself.
export default function VesselsPage({ onOpenJob, showToast }) {
  const { data, active, loading, patchJob } = useJourney()
  useFreshOnOpen()
  const [selected, setSelected] = useState(null)
  const [typing, setTyping] = useState({}) // jobId -> IMO being typed
  const [saving, setSaving] = useState(null)

  const ships = useMemo(() => (active || [])
    .filter(({ job }) => !isDelivered(job) && !isExportJob(job))
    .map(({ job, j }) => ({ job, j, name: vesselOf(job, data), imo: imoOf(job, data), arrived: j.arrivedAt }))
    .filter((s) => s.name || s.imo)
    // still at sea first, then the most recently arrived
    .sort((a, b) => (!!a.arrived - !!b.arrived) || String(b.arrived || '').localeCompare(String(a.arrived || ''))), [active, data])

  const sel = ships.find((s) => s.job.id === selected) || ships.find((s) => s.imo && !s.arrived) || ships.find((s) => s.imo) || null

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
    setSelected(job.id)
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
          <h2>{sel?.imo ? `${sel.name || 'Ship'} · ${sel.job.job_no}` : 'Ships near Nhava Sheva'}</h2>
          {sel?.imo && <a className="ix-link" href={vesselFinderLink(sel.imo, sel.name)} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>Open on VesselFinder ↗</a>}
        </div>
        <ShipMap imo={sel?.imo} height={440} />
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--muted)' }}>
          Map and positions by VesselFinder. The line shows the ship's last 24 hours. Pick a ship below.
        </div>
      </div>

      <div className="ix-card">
        <div className="ix-card-head">
          <Icon name="list-details" style={{ color: 'var(--navy)' }} />
          <h2>Ships of open jobs</h2><span className="ix-chip grey">{ships.length}</span>
          <span className="sub hide-m">The IMO number comes from the job's IGM check, or type it once here.</span>
        </div>
        {loading && !data && <div className="ix-empty">Loading…</div>}
        {data && ships.length === 0 && <div className="ix-empty">No open job has a ship name yet. Ship names come from container tracking.</div>}
        {ships.map((s) => (
          <div key={s.job.id} className={`ix-truck-row ${sel?.job.id === s.job.id ? 'sel' : ''}`}>
            <div>
              <button type="button" className="ix-plate" disabled={!s.imo} onClick={() => setSelected(s.job.id)} title={s.imo ? 'Show this ship on the map' : 'Add the IMO number to see it on the map'} style={{ cursor: s.imo ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                {s.name || `IMO ${s.imo}`}
              </button>
            </div>
            <div style={{ minWidth: 0 }}>
              <button type="button" className="ix-link" style={{ margin: 0 }} onClick={() => onOpenJob?.(s.job.id)}><b className="mono">{s.job.job_no}</b></button>
              <span style={{ color: 'var(--text-2)' }}> · {s.job.client || 'No client'}</span>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.imo ? `IMO ${s.imo}` : 'IMO number not known yet'}{s.job.eta ? ` · ETA ${fmtDate(s.job.eta)}` : ''}</div>
            </div>
            <div style={{ fontSize: 13 }}>
              {s.arrived ? <Chip tone="green" icon="anchor">Arrived {fmtDate(s.arrived)}</Chip> : <Chip tone="blue" icon="ship">At sea</Chip>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {s.imo ? (
                <>
                  <button type="button" className={`ix-btn sm ${sel?.job.id === s.job.id ? 'primary' : ''}`} onClick={() => setSelected(s.job.id)}><Icon name="map-pin" />Show</button>
                  <a className="ix-btn sm ghost" href={vesselFinderLink(s.imo, s.name)} target="_blank" rel="noreferrer">VesselFinder ↗</a>
                </>
              ) : (
                <>
                  <input value={typing[s.job.id] || ''} onChange={(e) => setTyping((p) => ({ ...p, [s.job.id]: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                    placeholder="IMO (7 digits)" inputMode="numeric" aria-label={`IMO number for ${s.job.job_no}`} style={{ width: 120 }} />
                  <button type="button" className="ix-btn sm primary" disabled={saving === s.job.id || String(typing[s.job.id] || '').length !== 7} onClick={() => saveImo(s.job)}>{saving === s.job.id ? 'Saving…' : 'Save'}</button>
                  <a className="ix-btn sm ghost" href={vesselFinderLink(null, s.name)} target="_blank" rel="noreferrer" title="Find the IMO by ship name">Find IMO ↗</a>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
