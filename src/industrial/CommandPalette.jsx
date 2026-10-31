import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { parseContainerNos } from '../utils/jobHelpers'
import { useJourney } from './JourneyContext'
import { phaseChip } from './ui'
import { Icon } from '../ui/Icon'
import { Kbd } from '../ui/Feedback'
import { lockScroll, pushLayer, trapTab } from '../ui/hooks'
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
  const listRef = useRef(null)
  const palRef = useRef(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  const uid = useId()

  // focus the box, lock the page behind, give focus back on close. Esc closes
  // wherever focus is, but only while the palette is the top overlay.
  useEffect(() => {
    const prev = document.activeElement
    const unlock = lockScroll()
    const layer = pushLayer(Symbol('palette'))
    const onEsc = (e) => { if (e.key === 'Escape' && layer.isTop()) { e.preventDefault(); closeRef.current() } }
    document.addEventListener('keydown', onEsc, true)
    inputRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onEsc, true)
      layer.release()
      unlock()
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus({ preventScroll: true })
    }
  }, [])

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
  }
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [hl, items])

  const jobItems = items.filter((i) => i.type === 'job')
  const optId = (idx) => `${uid}-o${idx}`
  const pageItems = items.filter((i) => i.type === 'page')

  return (
    <div className="ix-pal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ix-pal" ref={palRef} role="dialog" aria-modal="true" aria-label="Search" onKeyDown={(e) => trapTab(e, palRef.current)}>
        <div className="ix-pal-input">
          <Icon name="search" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setHl(0) }} onKeyDown={onKey}
            placeholder="Job no, client, BE, BL, container or truck" autoComplete="off" spellCheck={false}
            role="combobox" aria-expanded="true" aria-controls={`${uid}-list`} aria-autocomplete="list"
            aria-activedescendant={items[hl] ? optId(hl) : undefined} />
          <Kbd>Esc</Kbd>
          <button type="button" className="ix-pal-cancel" onClick={onClose}>Cancel</button>
        </div>
        <div className="ix-pal-res" ref={listRef} id={`${uid}-list`} role="listbox" aria-label="Results">
          {jobItems.length > 0 && <div className="ix-pal-group" role="presentation">{jobItems[0].recent ? 'Recent' : 'Jobs'}</div>}
          {jobItems.map((it) => {
            const idx = items.indexOf(it)
            const c = phaseChip(it.job, it.j)
            return (
              <div key={it.id} id={optId(idx)} role="option" aria-selected={idx === hl} className={`ix-pal-item ${idx === hl ? 'hl' : ''}`} onMouseEnter={() => setHl(idx)} onClick={() => pick(it)}>
                <Icon name="package" /><b className="mono">{it.job.job_no}</b>
                <span className="c">{it.job.client}</span>
                <span className="k">{it.hit ? `${it.hit[0]} ${it.hit[1]}` : c.label}</span>
              </div>
            )
          })}
          {items.filter((i) => i.type === 'lookup').map((it) => {
            const idx = items.indexOf(it)
            return (
              <div key={it.id} id={optId(idx)} role="option" aria-selected={idx === hl} className={`ix-pal-item ${idx === hl ? 'hl' : ''}`} onMouseEnter={() => setHl(idx)} onClick={() => pick(it)}>
                <Icon name="world-search" /><span>Look up <b className="mono">{it.q}</b> on ULIP</span><span className="k">BE, container, truck…</span>
              </div>
            )
          })}
          {pageItems.length > 0 && <div className="ix-pal-group" role="presentation">Go to</div>}
          {pageItems.map((it) => {
            const idx = items.indexOf(it)
            return (
              <div key={it.id} id={optId(idx)} role="option" aria-selected={idx === hl} className={`ix-pal-item ${idx === hl ? 'hl' : ''}`} onMouseEnter={() => setHl(idx)} onClick={() => pick(it)}>
                <Icon name={it.icon} />{it.label}<span className="k">Page</span>
              </div>
            )
          })}
          {items.length === 0 && (
            <div className="ix-empty-state compact">
              <span className="ico"><Icon name="search" /></span>
              <div className="t">Nothing matches “{q}”</div>
              <div className="d">Try a job number, client name, BE, BL, container or truck number.</div>
            </div>
          )}
        </div>
        <div className="ix-pal-foot" aria-hidden="true">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd>to move</span><span><Kbd>Enter</Kbd>to open</span><span><Kbd>Esc</Kbd>to close</span>
        </div>
      </div>
    </div>
  )
}
