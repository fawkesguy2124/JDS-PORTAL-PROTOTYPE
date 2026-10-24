import { useState } from 'react'
import { supabase } from '../supabase'
import { useJourney } from './JourneyContext'
import { seaArea } from '../../supabase/functions/_shared/portal/ships.js'
import { Icon, timeAgo } from './ui'
import { voyage } from './ShipMap'

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
    if (start && !window.confirm(`Start tracking the ship of ${job.job_no}?\n\nThis uses 1 of the 50 free trial shipments. Only do it for a ship that hasn't arrived yet.`)) return
    setBusy(true)
    try {
      const { data: res, error } = await supabase.functions.invoke('sea-track', { body: { jobId: job.id, start } })
      if (error) throw new Error(error.message)
      if (res?.skipped) showToast?.(res.skipped === 'checked a few minutes ago' ? 'Checked a few minutes ago: no change yet' : `Not tracked: ${res.skipped}`, 'info')
      else if (res?.error) showToast?.(`Ship tracking: ${res.error}`, 'error')
      else showToast?.(`Ship tracking updated${res?.used ? ` · ${res.used} of ${res.cap} used this month` : ''}`, 'success')
      const { data: row } = await supabase.from('sea_tracking').select('*').eq('job_id', job.id).maybeSingle()
      if (row) patchSea(row)
    } catch (e) {
      showToast?.(`Could not reach ship tracking: ${e.message}`, 'error')
    }
    setBusy(false)
  }

  // not tracked: offer it (a sea import only)
  if (!sea) {
    return (
      <div className="ix-seacard">
        <div className="hd">
          <span className="ic grey"><Icon name="ship" /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="t">Ship tracking</div>
            <div className="note" style={{ margin: 0 }}>Not tracked yet. New jobs are tracked by themselves; this one needs a tap (uses 1 of the 50 free shipments).</div>
          </div>
          <button type="button" className="ix-btn sm primary" disabled={busy} onClick={() => run(true)}>{busy ? 'Checking…' : 'Track this ship'}</button>
        </div>
      </div>
    )
  }

  const ev = sea.last_event || {}
  const next = ev.next || null
  const refresh = !sea.done && (
    <button type="button" className="ix-icon-btn sm" disabled={busy} onClick={() => run(false)} title="Check again now" aria-label="Check the ship again now">
      <Icon name={busy ? 'loader-2' : 'refresh'} />
    </button>
  )
  if (sea.error) {
    return (
      <div className="ix-seacard">
        <div className="hd"><span className="ic grey"><Icon name="ship" /></span><div className="t">Ship tracking</div>{refresh}</div>
        <div className="note">Could not track {sea.number_type === 'BL' ? 'BL' : 'container'} <span className="mono">{sea.number}</span>: {sea.error}</div>
      </div>
    )
  }
  // the voyage: progress along the route and the distance left (same as the map's card)
  const v = typeof sea.lat === 'number' ? voyage({ pos: [sea.lat, sea.lng], route: sea.route, track: sea.track }) : null
  const tone = sea.pod_actual ? 'port' : sea.status === 'PLANNED' ? 'grey' : 'sea'
  return (
    <div className="ix-seacard">
      <div className="hd">
        <span className={`ic ${tone}`}><Icon name="ship" /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="k">{sea.pod_actual ? 'Arrived' : 'ETA'} · {portName(sea.pod) || 'port'}</div>
          <div className="eta">{portTime(sea.pod_date)}</div>
        </div>
        <span className={`ix-chip ${tone === 'sea' ? 'blue' : tone === 'port' ? 'amber' : 'grey'}`}>{sea.pod_actual ? 'At port' : SHIP_STATUS[sea.status] || 'At sea'}</span>
        {refresh}
      </div>
      {sea.pol && (
        <div className="legs">
          <div><div className="k">From</div><div className="v">{portName(sea.pol)}</div>{sea.pol_date && <div className="d">Left {portTime(sea.pol_date, false)}</div>}</div>
          <Icon name="arrow-right" />
          <div style={{ textAlign: 'right' }}><div className="k">To</div><div className="v">{portName(sea.pod) || '—'}</div>{sea.pod_date && <div className="d">{sea.pod_actual ? 'Arrived' : 'ETA'} {portTime(sea.pod_date, false)}</div>}</div>
        </div>
      )}
      {v?.pct != null && (
        <>
          <div className="bar"><span style={{ width: `${sea.pod_actual ? 100 : v.pct}%` }} /></div>
          <div className="prog"><span>{sea.pod_actual ? 'Arrived' : `${v.pct}% of the way`}</span>{!sea.pod_actual && v.left != null && <span>{Math.round(v.left * 1.852).toLocaleString('en-IN')} km to go</span>}</div>
        </>
      )}
      <div className="facts">
        {sea.sealine_name && <div><div className="k">Line</div><div className="v">{sea.sealine_name}</div></div>}
        {seaWhere(sea) && <div><div className="k">Where now</div><div className="v">{seaWhere(sea)}{sea.position_at && <span className="muted"> · {timeAgo(sea.position_at)}</span>}</div></div>}
        {ev.what && <div><div className="k">Last move</div><div className="v">{moveText(ev, false)}</div></div>}
        {next?.what && !sea.pod_actual && <div><div className="k">Next</div><div className="v">{moveText(next, true)}</div></div>}
      </div>
      <div className="foot">
        Tracked by {sea.number_type === 'BL' ? 'BL' : 'container'} <span className="mono">{sea.number}</span> · updated {timeAgo(sea.fetched_at)}{sea.done ? ' · arrived, no more checks' : ''}
      </div>
    </div>
  )
}

// JDS says Nhava Sheva, the lines say "Jawaharlal Nehru"
export const portName = (p) => (p ? String(p).replace(/^Jawaharlal Nehru(, IN)?/i, 'Nhava Sheva') : p)

// a carrier event in plain words: "Left Shanghai, CN · 4 Oct"
const VERB = { DEPA: ['Left', 'Leaves'], ARRI: ['Arrived at', 'Arrives at'], LOAD: ['Loaded at', 'Loads at'], DISC: ['Unloaded at', 'Unloads at'], GTIN: ['Gate in at', 'Gate in at'], GTOT: ['Gate out at', 'Gate out at'] }
function moveText(e, future) {
  const verb = VERB[e.code]?.[future ? 1 : 0]
  const where = portName(e.where)
  const what = verb ? `${verb} ${where || ''}`.trim() : [e.what, where].filter(Boolean).join(' · ')
  return `${what}${e.when ? ` · ${portTime(e.when, false)}` : ''}`
}
