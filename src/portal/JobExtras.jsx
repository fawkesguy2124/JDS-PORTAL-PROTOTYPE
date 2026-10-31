import { useId, useState } from 'react'
import { useJourney } from '../industrial/JourneyContext'
import { containerRows, historyItems } from './model'

const DownIcon = () => (
  <svg className="pt-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
)

// Container(s) with their size; "Cargo" for loose cargo
export function Containers({ job }) {
  const rows = containerRows(job)
  const title = rows.length > 1 ? 'Containers' : rows.length ? 'Container' : 'Cargo'
  return (
    <section className="pt-sec" aria-label={title}>
      <h3>{title}</h3>
      <div className="pt-box">
        {rows.length ? rows.map((c) => (
          <div key={c.no} className="pt-li">
            <span className="pt-nm pt-mono">{c.no}</span>
            {c.size ? <span className="pt-no sans">{c.size}</span> : null}
          </div>
        )) : (
          <div className="pt-li"><span className="pt-nm">{job.goods || 'Loose cargo'}</span></div>
        )}
      </div>
    </section>
  )
}

// History: collapsed by default
export function History({ row, activity }) {
  const { job, j } = row
  const { data } = useJourney()
  const [open, setOpen] = useState(false)
  const id = useId()
  const items = open ? historyItems(job, j, activity, data) : []
  return (
    <section className="pt-sec">
      <button type="button" className="pt-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        History <DownIcon />
      </button>
      <div id={id} className="pt-hist" hidden={!open}>
        {open && (items.length ? items.map((h) => (
          <div key={h.key}><span>{h.date}</span>{h.text}</div>
        )) : <div><span /><em>No events yet.</em></div>)}
      </div>
    </section>
  )
}
