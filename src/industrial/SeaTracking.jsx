import { useState } from 'react'
import { supabase } from '../supabase'
import { useJourney } from './JourneyContext'
import { seaArea } from '../../supabase/functions/_shared/portal/ships.js'
import { Icon, timeAgo } from './ui'

// Ship tracking from Safecube on the job (Jose, 24 Oct 2026): what JDS used to
// look up on each shipping line's website by container number: ETA, the ship
// (IMO), where it is and the latest move. The sea-track function fills it every
// 3 hours for new sea jobs; older jobs start with "Track this ship". The free
// trial has 50 shipments, so starting one asks first.
const SHIP_STATUS = { PLANNED: 'Not sailed yet', IN_TRANSIT: 'At sea', DELIVERED: 'Arrived / delivered', UNKNOWN: 'Status not given' }

// The line's dates are the port's local time: shown as given, not converted
export const portTime = (iso, withTime = true) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return String(iso)
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}), timeZone: 'UTC' })
}

export function seaWhere(sea) {
  if (!sea) return null
  if (sea.status === 'PLANNED') return sea.pol ? `Waiting at ${sea.pol}` : 'Not sailed yet'
  if (typeof sea.lat === 'number' && typeof sea.lng === 'number') return seaArea(sea.lat, sea.lng)
  return sea.last_event?.where ? `Last at ${sea.last_event.where}` : null
}

export default function SeaTracking({ job, showToast }) {
  const { data, patchSea } = useJourney()
  const [busy, setBusy] = useState(false)
  const sea = data?.seaByJob?.[job.id] || null

  const run = async (start) => {
    if (start && !window.confirm(`Track ${job.job_no} on Safecube?\n\nThis uses 1 of the 50 free trial shipments. Only do it for a ship that hasn't arrived yet.`)) return
    setBusy(true)
    try {
      const { data: res, error } = await supabase.functions.invoke('sea-track', { body: { jobId: job.id, start } })
      if (error) throw new Error(error.message)
      if (res?.skipped) showToast?.(res.skipped === 'checked a few minutes ago' ? 'Checked a few minutes ago: no change yet' : `Not tracked: ${res.skipped}`, 'info')
      else if (res?.error) showToast?.(`Safecube: ${res.error}`, 'error')
      else showToast?.(`Updated from Safecube${res?.used ? ` · ${res.used} of ${res.cap} used this month` : ''}`, 'success')
      const { data: row } = await supabase.from('sea_tracking').select('*').eq('job_id', job.id).maybeSingle()
      if (row) patchSea(row)
    } catch (e) {
      showToast?.(`Could not reach Safecube: ${e.message}`, 'error')
    }
    setBusy(false)
  }

  // not tracked: offer it (a sea import only)
  if (!sea) {
    return (
      <div className="ix-sea">
        <Icon name="ship" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t">Ship tracking</div>
          <div className="s">Not tracked yet. New jobs are tracked by themselves; for this one, tap Track (uses 1 of the 50 free shipments).</div>
        </div>
        <button type="button" className="ix-btn sm" disabled={busy} onClick={() => run(true)}>{busy ? 'Checking…' : 'Track this ship'}</button>
      </div>
    )
  }

  const ev = sea.last_event || {}
  const next = ev.next || null
  const where = seaWhere(sea)
  return (
    <div className="ix-sea">
      <Icon name="ship" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t">
          {sea.error ? 'Ship tracking: not found' : sea.pod_actual ? `Arrived ${sea.pod || ''} · ${portTime(sea.pod_date)}` : `ETA ${sea.pod || 'port'} · ${portTime(sea.pod_date)}`}
        </div>
        {sea.error ? (
          <div className="s">Safecube could not track {sea.number_type === 'BL' ? 'BL' : 'container'} {sea.number}: {sea.error}</div>
        ) : (
          <div className="rows">
            <div><span className="k">Ship</span>{sea.vessel_imo ? <span className="mono">IMO {sea.vessel_imo}</span> : '—'}{sea.sealine_name ? ` · ${sea.sealine_name}` : ''}</div>
            <div><span className="k">Where</span>{[SHIP_STATUS[sea.status] || sea.status, where].filter(Boolean).join(' · ')}{sea.position_at ? <span className="muted"> (position {timeAgo(sea.position_at)})</span> : null}</div>
            {ev.what && <div><span className="k">Last move</span>{ev.what}{ev.where ? ` · ${ev.where}` : ''}{ev.when ? ` · ${portTime(ev.when, false)}` : ''}</div>}
            {next?.what && !sea.pod_actual && <div><span className="k">Next</span>{next.what}{next.where ? ` · ${next.where}` : ''}{next.when ? ` · ${portTime(next.when, false)}` : ''}</div>}
            {sea.pol && <div><span className="k">Route</span>{sea.pol}{sea.pol_date ? ` (${portTime(sea.pol_date, false)})` : ''} → {sea.pod || '—'}</div>}
          </div>
        )}
        <div className="s" style={{ marginTop: 4 }}>
          From Safecube by {sea.number_type === 'BL' ? 'BL' : 'container'} <span className="mono">{sea.number}</span> · updated {timeAgo(sea.fetched_at)}{sea.done ? ' · arrived, no more checks' : ' · checks every 3 hours'}
        </div>
      </div>
      {!sea.done && <button type="button" className="ix-btn sm" disabled={busy} onClick={() => run(false)}>{busy ? 'Checking…' : 'Refresh'}</button>}
    </div>
  )
}
