import { useEffect, useMemo, useRef, useState } from 'react'
import { parseContainerNos } from '../utils/jobHelpers'
import { useJourney } from './JourneyContext'
import { Icon, JobNo, phaseChip } from './ui'
import { truckNos } from '../services/journey'
import { recentJobIds } from './recentJobs'

// Ctrl K: one box for every job number, client, BE, BL, container and truck,
// plus the pages. Searches saved data only.
export default function CommandPalette({ open, ...rest }) {
  return open ? <Palette {...rest} /> : null
}

function Palette({ onClose, pages, onGo, onOpenJob, onLookup }) {
  const { rows } = useJourney() || { rows: [] }
  const [q, setQ] = useState('')
  const [hl, setHl] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/\s+/g, '')
    // nothing typed yet: the jobs opened last
    if (!needle) {
      const byId = Object.fromEntries(rows.map((r) => [r.job.id, r]))
      const recent = recentJobIds().map((id) => byId[id]).filter(Boolean)
        .map(({ job, j }) => ({ type: 'job', id: job.id, job, j, hit: null, recent: true }))
      if (recent.length) return [...recent, ...pages.slice(0, 5).map((p) => ({ type: 'page', ...p }))]
    }
    const jobs = rows.filter(({ job }) => {
      if (!needle) return true
      const hay = [job.job_no, job.client, job.be_no, job.bl_no, ...truckNos(job), job.ulip_refs?.igm_no, job.ulip_refs?.sb_no, ...parseContainerNos(job.containers)]
      return hay.filter(Boolean).some((x) => String(x).toLowerCase().replace(/\s+/g, '').includes(needle))
    }).slice(0, 8).map(({ job, j }) => {
      const hit = needle && !String(job.job_no || '').toLowerCase().includes(needle) && !String(job.client || '').toLowerCase().includes(needle)
        ? [['BE', job.be_no], ['BL', job.bl_no], ...truckNos(job).map((t) => ['Truck', t]), ['IGM', job.ulip_refs?.igm_no], ...parseContainerNos(job.containers).map((c) => ['Container', c])]
          .find(([, v]) => v && String(v).toLowerCase().replace(/\s+/g, '').includes(needle)) : null
      return { type: 'job', id: job.id, job, j, hit }
    })
    const pg = pages.filter((p) => !needle || p.label.toLowerCase().replace(/\s+/g, '').includes(needle)).slice(0, 5).map((p) => ({ type: 'page', ...p }))
    // a number that is not one of ours: check it with the government systems
    const look = onLookup && needle.length >= 5 && /\d/.test(needle) ? [{ type: 'lookup', id: '__lookup', q: q.trim() }] : []
    return [...jobs, ...look, ...pg]
  }, [q, rows, pages, onLookup])

  const pick = (it) => {
    onClose()
    if (it.type === 'job') onOpenJob(it.id)
    else if (it.type === 'lookup') onLookup(it.q)
    else onGo(it.id)
  }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(items.length - 1, h + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(0, h - 1)) }
    if (e.key === 'Enter' && items[hl]) { e.preventDefault(); pick(items[hl]) }
    if (e.key === 'Escape') onClose()
  }
  const jobItems = items.filter((i) => i.type === 'job')
  const pageItems = items.filter((i) => i.type === 'page')

  return (
    <div className="ix-pal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ix-pal" role="dialog" aria-label="Search">
        <div className="ix-pal-in">
          <Icon name="search" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setHl(0) }} onKeyDown={onKey}
            placeholder="Type a job no, client, BE, BL, container or truck…" autoComplete="off" aria-label="Search" />
        </div>
        <div className="ix-pal-res">
          {jobItems.length > 0 && <div className="ix-pal-group">{jobItems[0].recent ? 'Recent' : 'Jobs'}</div>}
          {jobItems.map((it) => {
            const idx = items.indexOf(it)
            const c = phaseChip(it.job, it.j)
            return (
              <div key={it.id} className={`ix-pal-item ${idx === hl ? 'hl' : ''}`} onMouseEnter={() => setHl(idx)} onClick={() => pick(it)}>
                <Icon name="package" /><JobNo no={it.job.job_no} />
                <span className="c">{it.job.client}</span>
                <span className="k">{it.hit ? `${it.hit[0]} ${it.hit[1]}` : c.label}</span>
              </div>
            )
          })}
          {items.filter((i) => i.type === 'lookup').map((it) => {
            const idx = items.indexOf(it)
            return (
              <div key={it.id} className={`ix-pal-item ${idx === hl ? 'hl' : ''}`} onMouseEnter={() => setHl(idx)} onClick={() => pick(it)}>
                {/* plain words on screen, no system names (Jose, 31 Oct 2026) */}
                <Icon name="world-search" />Look up <b className="mono">{it.q}</b> on government systems<span className="k">BE, container, truck…</span>
              </div>
            )
          })}
          {pageItems.length > 0 && <div className="ix-pal-group">Go to</div>}
          {pageItems.map((it) => {
            const idx = items.indexOf(it)
            return (
              <div key={it.id} className={`ix-pal-item ${idx === hl ? 'hl' : ''}`} onMouseEnter={() => setHl(idx)} onClick={() => pick(it)}>
                <Icon name={it.icon} />{it.label}<span className="k">Page</span>
              </div>
            )
          })}
          {items.length === 0 && <div className="ix-empty">Nothing matches “{q}”.</div>}
        </div>
        <div className="ix-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd>to move</span><span><kbd>Enter</kbd>to open</span><span><kbd>Esc</kbd>to close</span></div>
      </div>
    </div>
  )
}
