import { Suspense, lazy, useRef, useState } from 'react'
import { useJourney } from '../industrial/JourneyContext'
import { isAirJob } from '../services/journey'
import { vesselOf } from '../industrial/shipInfo'
import { truckPoints } from '../industrial/truckPoints'
import UlipCheck from '../components/ulip/UlipCheck'
import { usePortal } from './PortalContext'
import { whereOf, nextAction, customsSteps, deliveredSteps } from './model'
import { runAction, LEO_CHECK, todayIso } from './actions'

// maps (and their map libraries) load only when a job page with a map opens
const SeaMap = lazy(() => import('./SeaMap'))
const RoadMap = lazy(() => import('./RoadMap'))

const CheckIcon = () => (
  <svg className="pt-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)

const CHECK_KINDS = ['check_ooc', 'locate']

// A step tracker (customs / delivered): done = check + date, cur = ring (+ red note), next = muted
function Steps({ steps, label }) {
  return (
    <ol className="pt-steps" style={{ '--n': steps.length }} aria-label={label}>
      {steps.map((s) => {
        const st = s.done ? 'done' : s.cur ? 'cur' : 'next'
        const small = s.done ? s.date || '' : s.cur ? s.note || '' : ''
        return (
          <li key={s.id} className={`pt-sp ${st}${s.cur && s.bad ? ' bad' : ''}`} aria-current={s.cur ? 'step' : undefined}>
            <i>{s.done ? <CheckIcon /> : null}</i>
            <b>{s.label}</b>
            <small>{small}</small>
          </li>
        )
      })}
    </ol>
  )
}

function MapWait({ road }) {
  return <div className="pt-map pt-map-wait" style={{ background: road ? 'var(--pt-land)' : 'var(--pt-sea)' }} aria-hidden="true" />
}

// The one next action: an inline input where the action needs one (BE / SB number
// + date, truck number), or the ULIP LEO check; then exactly one primary button.
function ActionBar({ row, action, onDone, padTop }) {
  const { job } = row
  const { patchJob, refresh } = useJourney()
  const { perms, toast } = usePortal()
  const [open, setOpen] = useState(action.input === 'truck')
  const [no, setNo] = useState('')
  const [date, setDate] = useState('')
  const [truckNo, setTruckNo] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const numRef = useRef(null)

  const needsReveal = action.input === 'be' || action.input === 'sb' || action.input === 'leo'

  const go = async () => {
    if (lock.current) return
    if (needsReveal && !open) {
      setOpen(true)
      if (action.input !== 'leo') requestAnimationFrame(() => numRef.current?.focus())
      return
    }
    if (action.input === 'leo') return
    const input = action.input === 'truck' ? { truckNo } : (action.input === 'be' || action.input === 'sb') ? { no, date } : null
    lock.current = true
    setBusy(true)
    try {
      const res = await runAction(action.kind, row, input, { userName: perms.userName, patchJob, refresh })
      if (res.ok) {
        toast(`${job.job_no}: ${res.message}`)
        onDone?.()
      } else if (!res.cancelled) {
        toast(res.error, 'error')
      }
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); go() } }
  const isCheck = CHECK_KINDS.includes(action.kind)
  const label = busy ? (isCheck ? 'Checking…' : 'Saving…') : action.label
  const numLabel = action.input === 'sb' ? 'Shipping bill number' : 'BE number'
  const dateLabel = action.input === 'sb' ? 'Shipping bill date' : 'BE date'

  return (
    <>
      {action.input === 'leo' && open && (
        <div className="pt-ulip">
          <UlipCheck check={LEO_CHECK} job={job} compact
            onResult={(r) => { if (r?.parsed?.extra?.leoDate) toast(`${job.job_no}: LEO given`); refresh() }}
            onJobChange={patchJob} />
        </div>
      )}
      {!(action.input === 'leo' && open) && (
        <div className="pt-wf" style={padTop ? { paddingTop: 18 } : undefined}>
          {(action.input === 'be' || action.input === 'sb') && open && (
            <>
              <input ref={numRef} className="pt-tin" value={no} inputMode="numeric" autoComplete="off"
                placeholder={numLabel} aria-label={numLabel} disabled={busy}
                onChange={(e) => setNo(e.target.value.replace(/\D/g, '').slice(0, 7))} onKeyDown={onKey} />
              <input className="pt-tin pt-tin-date" type="date" value={date} max={todayIso()} aria-label={dateLabel} disabled={busy}
                onChange={(e) => setDate(e.target.value)} onKeyDown={onKey} />
            </>
          )}
          {action.input === 'truck' && (
            <input className="pt-tin" value={truckNo} placeholder="Truck number" aria-label="Truck number" autoComplete="off"
              autoCapitalize="characters" spellCheck={false} disabled={busy}
              onChange={(e) => setTruckNo(e.target.value.toUpperCase())} onKeyDown={onKey} />
          )}
          <button type="button" className="pt-pbtn" onClick={go} disabled={busy} aria-busy={busy || undefined}>{label}</button>
        </div>
      )}
    </>
  )
}

// The WHERE card: where the job is, in the form that fits the stage, and its one next action
export default function WhereCard({ row, layout, activity, onDone }) {
  const { job, j } = row
  const { data } = useJourney()
  const { perms } = usePortal()
  const where = whereOf(row, data)
  const next = nextAction(row, perms)
  const action = next && next.allowed ? next : null

  const head = (
    <div className="pt-wh"><b>{where.title}</b>{where.sub ? <span>{where.sub}</span> : null}</div>
  )
  const bar = action ? <ActionBar key={`${job.id}:${action.kind}`} row={row} action={action} onDone={onDone} padTop={where.kind === 'truck_needed'} /> : null

  let body = null
  if (where.kind === 'sea' || where.kind === 'air') {
    const vessel = vesselOf(job, data) || null
    body = (
      <div className="pt-viz">
        <Suspense fallback={<MapWait />}>
          <SeaMap job={job} j={j} sea={data?.seaByJob?.[job.id] || null}
            found={vessel ? data?.shipIds?.[vessel] || null : null}
            vessel={vessel} air={isAirJob(job)} layout={layout} />
        </Suspense>
      </div>
    )
  } else if (where.kind === 'road') {
    body = (
      <div className="pt-viz">
        <Suspense fallback={<MapWait road />}>
          <RoadMap job={job} j={j} layout={layout}
            trucks={(j.trucks || []).map((t) => ({ no: t.no, points: truckPoints(job, j, data?.resultsByJob?.[job.id], t.no) }))} />
        </Suspense>
      </div>
    )
  } else if (where.kind === 'customs') {
    body = <Steps steps={customsSteps(row, activity)} label="Customs steps" />
  } else if (where.kind === 'delivered') {
    body = <Steps steps={deliveredSteps(row, activity)} label="Delivery steps" />
  }

  return (
    <section className="pt-where" aria-label="Where it is">
      {head}
      {body}
      {bar}
      {!bar && <div className="pt-wend" />}
    </section>
  )
}
