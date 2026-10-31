import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { lockScroll, pushLayer, trapTab } from '../ui/hooks'
import { searchAll } from './model'

// Search (prototype "search"): a centred card on desktop, a bottom sheet with the
// box at the bottom on a phone. Finds jobs by number, client, container, BE, BL,
// SB, AWB, IGM and truck number, and people (picking one filters the list).
// A number of 5+ characters can also be looked up on government systems (ULIP).

// <mark> the needle inside `text`, ignoring spaces (as the search does)
function Mark({ text, needle }) {
  const s = String(text ?? '')
  const n = String(needle || '').toLowerCase().replace(/\s+/g, '')
  if (!n) return s
  const map = []
  let flat = ''
  for (let i = 0; i < s.length; i++) if (!/\s/.test(s[i])) { map.push(i); flat += s[i].toLowerCase() }
  const at = flat.indexOf(n)
  if (at < 0) return s
  const from = map[at], to = map[at + n.length - 1] + 1
  return <>{s.slice(0, from)}<mark>{s.slice(from, to)}</mark>{s.slice(to)}</>
}

export default function Spotlight({ open, seed = '', rows, data, profiles, listItems, onClose, onPickJob, onPickPerson, onLookup }) {
  const [q, setQ] = useState('')
  const [hl, setHl] = useState(0)
  const [wasOpen, setWasOpen] = useState(false)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const resRef = useRef(null)

  // each opening starts from the seed (the key typed to open it)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setQ(seed); setHl(0) }
  }

  const res = useMemo(() => (open ? searchAll(rows, data, q, profiles, listItems) : { people: [], jobs: [], lookup: null }), [open, rows, data, q, profiles, listItems])
  const needle = q.trim()
  const list = [
    ...res.people.map((p) => ({ type: 'person', key: `p-${p.id}`, ...p })),
    ...res.jobs.map((j) => ({ type: 'job', key: `j-${j.id}`, ...j })),
    ...(res.lookup ? [{ type: 'lookup', key: 'lookup', q: res.lookup }] : []),
  ]
  const hlIdx = list.length ? Math.min(hl, list.length - 1) : -1

  const pick = (it) => {
    if (!it) return
    if (it.type === 'person') onPickPerson(it.id)
    else if (it.type === 'job') onPickJob(it.id)
    else onLookup(it.q)
  }

  const close = useEffectEvent(() => onClose())
  useEffect(() => {
    if (!open) return undefined
    const prev = document.activeElement
    const unlock = lockScroll()
    const layer = pushLayer(Symbol('pt-spot'))
    const t = setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus({ preventScroll: true })
      try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* type=search in old Safari */ }
    }, 30)
    const onKey = (e) => {
      if (!layer.isTop()) return
      if (e.key === 'Escape') { e.preventDefault(); close() }
      else if (e.key === 'Tab') trapTab(e, boxRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      layer.release()
      unlock()
      if (prev && typeof prev.focus === 'function' && document.contains(prev) && !prev.closest?.('.pt-row')) prev.focus({ preventScroll: true })
    }
  }, [open])

  // keep the highlighted row in view
  useEffect(() => {
    if (!open || hlIdx < 0) return
    resRef.current?.querySelectorAll('button')[hlIdx]?.scrollIntoView({ block: 'nearest' })
  }, [open, hlIdx])

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!list.length) return
      setHl((hlIdx + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (hlIdx >= 0) pick(list[hlIdx])
    }
  }

  const hasResults = list.length > 0
  return (
    <div ref={boxRef} className={`pt-spot${open ? ' on' : ''}`} role="dialog" aria-modal="true" aria-label="Search" inert={open ? undefined : true}>
      <input ref={inputRef} type="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go"
        placeholder="Job, client, person, container, BE, BL, truck" aria-label="Search"
        role="combobox" aria-expanded={hasResults} aria-controls="pt-res" aria-activedescendant={hlIdx >= 0 ? `pt-res-${hlIdx}` : undefined}
        value={q} onChange={(e) => { setQ(e.target.value); setHl(0) }} onKeyDown={onKeyDown} />
      <div className="pt-res" id="pt-res" ref={resRef} role="listbox" aria-label="Results">
        {list.map((it, i) => (
          <button key={it.key} id={`pt-res-${i}`} type="button" role="option" aria-selected={i === hlIdx} tabIndex={-1}
            className={`${i === hlIdx ? 'hl' : ''}${it.type === 'lookup' ? ' lk' : ''}`.trim() || undefined}
            onMouseMove={() => { if (i !== hlIdx) setHl(i) }} onClick={() => pick(it)}>
            {it.type === 'person' && (<>
              <span className="a"><Mark text={it.name} needle={needle} /></span>
              <span className="b">{it.count} job{it.count === 1 ? '' : 's'}</span>
              <span className="c">Person</span>
            </>)}
            {it.type === 'job' && (<>
              <span className="a">{it.hlIn === 'a' ? <Mark text={it.a} needle={needle} /> : it.a}</span>
              <span className="b">{it.hlIn === 'b' && it.b.endsWith(it.hl) && it.b !== it.hl
                ? <>{it.b.slice(0, it.b.length - it.hl.length)}<span className="pt-num"><Mark text={it.hl} needle={needle} /></span></>
                : it.hlIn === 'b' ? <Mark text={it.b} needle={needle} /> : it.b}</span>
              <span className="c">{it.c}</span>
            </>)}
            {it.type === 'lookup' && (<>
              <span className="a">Look up “{it.q}” on government systems</span>
              <span className="c">ULIP</span>
            </>)}
          </button>
        ))}
        {!hasResults && needle && <div className="none">Nothing matches “{needle}”.</div>}
      </div>
    </div>
  )
}
