/* eslint-disable react-refresh/only-export-components -- VesselsPage and shipChecks import these formatters from here */
import { useState } from 'react'
import { supabase } from '../supabase'
import { useJourney } from './JourneyContext'
import { seaArea, seaOf } from '../../supabase/functions/_shared/portal/ships.js'
import { Button, Chip, Icon, fmtDateTime, timeAgo } from './ui'
import { voyage, viaText } from './ShipMap'
import { askConfirm } from './confirm'

// Ship tracking on the job (Jose, 24 Oct 2026): what JDS used to look up on each
// shipping line's website by container number: ETA, the ship (IMO), where it is
// and the latest move. The sea-track function fills it every 3 hours for new sea
// jobs; older jobs start with "Track this ship". The trial has 50 shipments, so
// starting one asks first. (No vendor name on screen; Jose's rule.)
const SHIP_STATUS = { PLANNED: 'Not sailed yet', IN_TRANSIT: 'At sea', DELIVERED: 'Arrived', UNKNOWN: 'Status not given' }

// The line's dates are the port's local time: shown as given, not converted.
// '19 Nov, 18:30' (24 h, 'Sep' never 'Sept'); the year only when it isn't this year
// (J-674: ETA 23 Jan 2027); a date with no time of day (midnight) shows as the date alone.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n) => String(n).padStart(2, '0')
export const portTime = (iso, withTime = true) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return String(iso)
  const year = d.getUTCFullYear() !== new Date().getFullYear() ? ` ${d.getUTCFullYear()}` : ''
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year}`
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  return !withTime || (h === 0 && m === 0) ? date : `${date}, ${pad(h)}:${pad(m)}`
}

// The cargo hasn't sailed yet: the line plans the sailing later, or the latest
// move is still the box arriving at the port of loading (J-674, 24 Oct 2026: shown
// as "At sea" with a heading while the box sat at Tianjin)
export function notSailed(sea) {
  if (!sea || sea.error || sea.pod_actual) return false
  if (sea.status === 'PLANNED') return true
  if (sea.pol_date && new Date(sea.pol_date).getTime() > Date.now()) return true
  return ['GTIN', 'GTOT'].includes(sea.last_event?.code) && !!sea.pol && portName(sea.last_event?.where) === portName(sea.pol)
}

// The cargo is at a port right now: not sailed yet, sitting at a port on the way
// (e.g. waiting to change ship), or arrived. Only then are "last move" and "next
// stop" worth showing; at sea the route and progress say it (Jose, 24 Oct 2026)
export function atPort(sea) {
  if (!sea || sea.error) return false
  return notSailed(sea) || !!sea.pod_actual || (sea.route?.via || []).some((p) => p.arrived && !p.left)
}

// "Left 4 Oct" or, for a planned sailing, "Sails 17 Dec"
export const polText = (sea) => (sea?.pol_date ? `${new Date(sea.pol_date).getTime() > Date.now() ? 'Sails' : 'Left'} ${portTime(sea.pol_date, false)}` : null)

export function seaWhere(sea) {
  if (!sea) return null
  if (notSailed(sea)) return `Waiting at ${portName(sea.last_event?.where || sea.pol) || 'the port of loading'}`
  if (typeof sea.lat === 'number' && typeof sea.lng === 'number') return seaArea(sea.lat, sea.lng)
  return sea.last_event?.where ? `Last at ${sea.last_event.where}` : null
}

// The job panel's ship card. shipName / imo (optional) head the card: the ship's
// name and IMO appear only here (Jose, 31 Oct 2026). onVessels opens the map.
export default function SeaTracking({ job, showToast, shipName, imo, onVessels }) {
  const { data, patchSea } = useJourney()
  const [busy, setBusy] = useState(false)
  const sea = seaOf(job, data)

  const run = async (start) => {
    if (start && !(await askConfirm({ title: `Start tracking the ship of ${job.job_no}?`, text: 'This uses 1 of the trial shipments. Only do it for a ship that hasn’t arrived yet.', ok: 'Start tracking' }))) return
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

  const head = shipName ? (
    <div className="ship">
      <b>{shipName}</b>{imo ? <span className="mono">IMO {imo}</span> : null}
      {onVessels && <button type="button" className="ix-link" onClick={onVessels}>Vessels <Icon name="arrow-right" /></button>}
    </div>
  ) : null

  // not tracked: offer it (a sea import only). Secondary: the panel's one primary
  // button is the job's next step.
  if (!sea) {
    return (
      <div className="ix-seacard">
        {head}
        <div className="hd">
          <span className="ic grey"><Icon name="ship" /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="t">Ship tracking</div>
            <div className="note" style={{ margin: 0 }}>Not tracked yet. New jobs are tracked by themselves; this one needs a tap (uses 1 of the 50 trial shipments).</div>
          </div>
          <Button size="sm" icon="ship" disabled={busy} onClick={() => run(true)}>{busy ? 'Checking…' : 'Track this ship'}</Button>
        </div>
      </div>
    )
  }

  const ev = sea.last_event || {}
  const refresh = !sea.done && (
    <button type="button" className="ix-icon-btn sm" disabled={busy} onClick={() => run(false)} title="Check again now" aria-label="Check the ship again now">
      <Icon name={busy ? 'loader-2' : 'refresh'} />
    </button>
  )
  if (sea.error) {
    return (
      <div className="ix-seacard">
        {head}
        <div className="hd"><span className="ic grey"><Icon name="ship" /></span><div className="t" style={{ flex: 1 }}>Ship tracking</div>{refresh}</div>
        <div className="note">Could not track {sea.number_type === 'BL' ? 'BL' : 'container'} <span className="mono">{sea.number}</span>: {sea.error}</div>
      </div>
    )
  }
  // the voyage: progress along the route and the distance left (same as the map's card)
  const v = typeof sea.lat === 'number' ? voyage({ pos: [sea.lat, sea.lng], route: sea.route, track: sea.track }) : null
  const waiting = notSailed(sea)
  // at port = teal (calm), at sea = navy (moving), not sailed = grey (audit, 31 Oct 2026)
  const tone = sea.pod_actual ? 'port' : waiting ? 'grey' : 'sea'
  return (
    <div className="ix-seacard">
      {head}
      <div className="hd">
        <span className={`ic ${tone}`}><Icon name={sea.pod_actual ? 'anchor' : 'ship'} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="k">{sea.pod_actual ? 'Arrived' : 'ETA'} · {portName(sea.pod) || 'port'}</div>
          <div className="eta">{portTime(sea.pod_date)}</div>
        </div>
        <Chip tone={tone === 'sea' ? 'blue' : tone === 'port' ? 'teal' : 'grey'}>{sea.pod_actual ? 'At port' : waiting ? 'Not sailed yet' : SHIP_STATUS[sea.status] || 'At sea'}</Chip>
        {sea.fetched_at && <span className="upd" title={timeAgo(sea.fetched_at)}>Checked {fmtDateTime(sea.fetched_at)}</span>}
        {refresh}
      </div>
      {sea.pol && (
        <div className="legs">
          <div><div className="k">From</div><div className="v">{portName(sea.pol)}</div>{sea.pol_date && <div className="d">{polText(sea)}</div>}</div>
          <Icon name="arrow-right" />
          <div style={{ textAlign: 'right' }}><div className="k">To</div><div className="v">{portName(sea.pod) || '—'}</div>{sea.pod_date && <div className="d">{sea.pod_actual ? 'Arrived' : 'ETA'} {portTime(sea.pod_date, false)}</div>}</div>
        </div>
      )}
      {viaText(sea.route) && <div className="via"><Icon name="transfer" />{viaText(sea.route)}</div>}
      {v?.pct != null && (
        <>
          <div className="bar"><span style={{ width: `${sea.pod_actual ? 100 : waiting ? 0 : v.pct}%` }} /></div>
          <div className="prog">
            <span>{sea.pod_actual ? 'Arrived' : waiting ? 'Not sailed yet' : `${v.pct}% of the way`}</span>
            {!sea.pod_actual && v.left != null && <span>{Math.round(v.left * 1.852).toLocaleString('en-IN')} km {waiting ? 'voyage' : 'to go'}</span>}
          </div>
        </>
      )}
      <div className="facts">
        {sea.sealine_name && <div><div className="k">Line</div><div className="v">{sea.sealine_name}</div></div>}
        {seaWhere(sea) && <div><div className="k">Where now</div><div className="v">{seaWhere(sea)}{sea.position_at && !waiting && <span className="muted" title={timeAgo(sea.position_at)}> · {fmtDateTime(sea.position_at)}</span>}</div></div>}
        {ev.what && atPort(sea) && <div><div className="k">Last move</div><div className="v">{moveText(ev, false)}</div></div>}
        {nextStop(sea) && atPort(sea) && <div><div className="k">Next stop</div><div className="v">{nextStop(sea)}</div></div>}
      </div>
    </div>
  )
}

// JDS says Nhava Sheva, the lines say "Jawaharlal Nehru"
export const portName = (p) => (p ? String(p).replace(/^Jawaharlal Nehru(, IN)?/i, 'Nhava Sheva') : p)

// a carrier event in plain words: "Left Shanghai, CN · 4 Oct"
const VERB = { DEPA: ['Left', 'Leaves'], ARRI: ['Arrived at', 'Arrives at'], LOAD: ['Loaded at', 'Loads at'], DISC: ['Unloaded at', 'Unloads at'], GTIN: ['Gate in at', 'Gate in at'], GTOT: ['Gate out at', 'Gate out at'] }
export function moveText(e, future) {
  if (!e?.what && !e?.code) return null
  const verb = VERB[e.code]?.[future ? 1 : 0]
  const where = portName(e.where)
  const what = verb ? `${verb} ${where || ''}`.trim() : [e.what, where].filter(Boolean).join(' · ')
  return `${what}${e.when ? ` · ${portTime(e.when, false)}` : ''}`
}

// The next port the cargo reaches, moving on by itself as it goes (Jose, 24 Oct
// 2026: "Arrives at Busan · 28 Oct", then Ningbo, Shekou… then Nhava Sheva)
export function nextStop(sea) {
  if (!sea || sea.error || sea.pod_actual) return null
  const p = (sea.route?.via || []).find((x) => !x.arrived && x.arrive)
  if (p) return `Arrives at ${portName(p.name)}${p.change ? ' (change ship)' : ''} · ${portTime(p.arrive, false)}`
  return sea.pod_date ? `Arrives at ${portName(sea.pod) || 'the port'} · ${portTime(sea.pod_date, false)}` : moveText(sea.last_event?.next, true)
}
