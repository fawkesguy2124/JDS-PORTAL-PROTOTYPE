import { useState } from 'react'
import { useJourney } from './JourneyContext'
import { Icon, timeAgo } from './ui'
import { refValue, rememberRefs } from '../components/ulip/jobRefs'
import { runUlipCheck } from '../services/ulip/ulipClient'

// Air cargo (Jose, 25 Oct 2026): is the air waybill in Customs' air import manifest
// (IGM) yet? ICEGATE/09 by MAWB + airport, through ULIP. The automatic checks ask
// about every hour until it is; this box shows the answer and lets staff check now.
// (ICEGATE/10, by HAWB, answered "no records" for a real air job: not used here.)

const AIRPORT = /^[A-Z0-9]{6}$/
export const airportOf = (job) => (AIRPORT.test(String(job?.port_code || '').toUpperCase()) ? String(job.port_code).toUpperCase() : 'INBOM4')

export default function AirCargo({ job, showToast }) {
  const { data, patchJob } = useJourney()
  const saved = data?.resultsByJob?.[job.id]?.['ICEGATE/09']?.[0] || null
  const [latest, setLatest] = useState(saved)
  const [busy, setBusy] = useState(false)
  const mawb = refValue(job, 'mawb_no')
  const hawb = refValue(job, 'hawb_no')
  const [editing, setEditing] = useState(!mawb)
  const [typed, setTyped] = useState({ mawb: mawb || '', hawb: hawb || '' })

  const row = latest || saved
  const p = row?.parsed || {}
  const x = p.extra || {}
  const field = (label) => p.fields?.find((f) => f.label === label)?.value

  const save = async () => {
    const m = typed.mawb.replace(/\D/g, '')
    if (m.length !== 11) { showToast?.('The MAWB has 11 digits, for example 73808410065.', 'error'); return }
    setBusy(true)
    const r = await rememberRefs(job, { mawb_no: m, hawb_no: typed.hawb.trim().toUpperCase() || null })
    setBusy(false)
    if (r.error) { showToast?.(r.error, 'error'); return }
    if (r.job) patchJob?.(r.job)
    setEditing(false)
    showToast?.('Air waybill numbers saved.', 'success')
  }

  const check = async () => {
    if (!mawb) return
    setBusy(true)
    const r = await runUlipCheck({ api: 'ICEGATE/09', params: { mawbNumber: mawb, custSite: airportOf(job) }, jobId: job.id })
    setBusy(false)
    if (!r.ok) { showToast?.(r.error, 'error'); return }
    setLatest(r.data)
    showToast?.(r.data?.found ? 'In the air manifest.' : 'Not in the air manifest yet.', r.data?.found ? 'success' : 'info')
  }

  return (
    <div className="ix-air">
      <Icon name="plane-arrival" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="hd">
          <span className="t">Air cargo</span>
          {mawb && !editing && (
            <button type="button" className="ix-btn sm" onClick={check} disabled={busy} title="Asks Customs (ICEGATE, through ULIP) once">
              <Icon name="refresh" />{busy ? 'Checking…' : 'Check now'}
            </button>
          )}
        </div>

        {editing ? (
          <div className="ix-air-edit">
            <input value={typed.mawb} onChange={(e) => setTyped((t) => ({ ...t, mawb: e.target.value.replace(/[^\d -]/g, '') }))} placeholder="MAWB (11 digits)" inputMode="numeric" aria-label="Master air waybill number" />
            <input value={typed.hawb} onChange={(e) => setTyped((t) => ({ ...t, hawb: e.target.value }))} placeholder="HAWB (optional)" aria-label="House air waybill number" />
            <button type="button" className="ix-btn sm primary" onClick={save} disabled={busy}>Save</button>
            {mawb && <button type="button" className="ix-btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        ) : (
          <div className="nums">
            MAWB <b className="mono">{mawb}</b>{hawb ? <> · HAWB <b className="mono">{hawb}</b></> : null} · {airportOf(job)}
            <button type="button" className="ix-link" onClick={() => setEditing(true)}>Edit</button>
          </div>
        )}

        {!editing && mawb && (
          !row ? <div className="st muted">Not checked yet. The automatic checks look about every hour until it is in the manifest.</div>
            : row.found ? (
              <div className="st good">
                <Icon name="circle-check" />In the air manifest: IGM <b>{x.igmRtn || field('IGM/RTN number')}</b>
                {field('IGM date') ? ` · ${field('IGM date')}` : ''}
                {x.flightNumber ? ` · flight ${x.flightNumber}` : ''}
                {field('Total packages') ? ` · ${field('Total packages')} pkg` : ''}
                {field('Gross weight') ? ` · ${field('Gross weight')} kg` : ''}
              </div>
            ) : (
              <div className="st">Not in the air manifest yet{row.checked_at ? ` · checked ${timeAgo(row.checked_at)}` : ''}</div>
            )
        )}
      </div>
    </div>
  )
}
