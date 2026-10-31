import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'

// The job list as an endless picker (prototype "list" script, Jose 31 Oct 2026):
// with 6 or more jobs the rows repeat (5 copies) like the iOS timer picker; the
// row in the lens (the band in the middle) is slightly larger and sharp, the
// others shrink, fade and blur with distance. Scrolling snaps a row into the lens.
// Painting writes styles straight onto the rows (no React render per frame).
//
// ref handle: center(id, instant), step(dir) → id, focusedId(), rectFor(id) → DOMRect
export const ROWH = 76
const COPIES = 5

export default function PickerList({ ref, items, layout, openId, keepId, onOpen, empty }) {
  const feedRef = useRef(null)
  const st = useRef({ pad: 0, raf: 0, endT: 0, focus: null })
  const n = items.length
  const loop = n >= 6
  const copies = n ? (loop ? COPIES : 1) : 0
  const setH = n * ROWH
  const layoutRef = useRef(layout)
  useEffect(() => { layoutRef.current = layout }, [layout])

  // index (over every rendered row) → the row's .pt-ri
  const riAt = (i) => feedRef.current?.children[i + 1]?.firstElementChild || null
  const total = n * copies

  const topFor = (i) => i * ROWH + st.current.pad + ROWH / 2 - (feedRef.current?.clientHeight || 0) / 2
  const nearestIndex = useCallback(() => {
    const f = feedRef.current
    if (!f || !total) return -1
    const i = Math.round((f.scrollTop + f.clientHeight / 2 - st.current.pad - ROWH / 2) / ROWH)
    return Math.max(0, Math.min(total - 1, i))
  }, [total])

  const paint = useCallback(() => {
    const f = feedRef.current
    if (!f || !total) return
    const fh = f.clientHeight, span = fh / 2 || 1, top = f.scrollTop
    const first = Math.max(0, Math.floor((top - st.current.pad) / ROWH) - 2)
    const last = Math.min(total - 1, Math.ceil((top + fh - st.current.pad) / ROWH) + 2)
    const big = layoutRef.current === 'm' ? 1.03 : 1.06
    for (let i = first; i <= last; i++) {
      const ri = riAt(i)
      if (!ri) continue
      const c = i * ROWH + st.current.pad + ROWH / 2 - top
      const k = Math.min(1, Math.abs(c - fh / 2) / span)
      const near = k < 0.09
      ri.style.transform = `scale(${near ? big : 1 - k * 0.1})`
      ri.style.opacity = String(near ? 1 : 0.85 - k * 0.6)
      ri.style.filter = near ? '' : `blur(${(0.4 + k * 2.4).toFixed(2)}px)`
    }
    const ni = nearestIndex()
    st.current.focus = ni >= 0 ? items[ni % n]?.id ?? null : null
  }, [total, items, n, nearestIndex])

  const wrap = useCallback(() => {
    const f = feedRef.current
    if (!f || !loop) return
    if (f.scrollTop < setH * 1.5) f.scrollTop += setH
    else if (f.scrollTop > setH * 3.5) f.scrollTop -= setH
  }, [loop, setH])

  const pads = useCallback(() => {
    const f = feedRef.current
    if (!f) return
    const h = Math.max(0, f.clientHeight / 2 - ROWH / 2)
    st.current.pad = h
    const a = f.firstElementChild, b = f.lastElementChild
    if (a) a.style.height = `${h}px`
    if (b && b !== a) b.style.height = `${h}px`
  }, [])

  // the rendered index of `id` closest to where the list is (or the middle copy)
  const indexOf = useCallback((id, middle) => {
    const f = feedRef.current
    const base = items.findIndex((it) => it.id === id)
    if (base < 0 || !f) return -1
    const all = Array.from({ length: copies }, (_, c) => base + c * n)
    if (middle && loop) return all[Math.floor(copies / 2)]
    const want = f.scrollTop
    return all.reduce((a, i) => (Math.abs(topFor(i) - want) < Math.abs(topFor(a) - want) ? i : a), all[0])
  }, [items, copies, n, loop])

  const center = useCallback((id, instant) => {
    const f = feedRef.current
    const i = indexOf(id, instant)
    if (!f || i < 0) return false
    f.scrollTo({ top: topFor(i), behavior: instant ? 'auto' : 'smooth' })
    if (instant) paint()
    return true
  }, [indexOf, paint])

  useImperativeHandle(ref, () => ({
    center,
    focusedId: () => st.current.focus,
    step(dir) {
      const f = feedRef.current
      const i = nearestIndex()
      if (!f || i < 0) return null
      const to = i + (dir > 0 ? 1 : -1)
      if (to < 0 || to >= total) return null
      f.scrollTo({ top: topFor(to), behavior: 'smooth' })
      st.current.focus = items[to % n].id
      return st.current.focus
    },
    rectFor(id) {
      const i = id ? indexOf(id, false) : nearestIndex()
      const ni = nearestIndex()
      const f = feedRef.current
      const pick = (k) => (k >= 0 ? riAt(k) : null)
      let el = pick(i)
      if (el && f) {
        const r = el.getBoundingClientRect(), fr = f.getBoundingClientRect()
        if (r.bottom < fr.top || r.top > fr.bottom) el = pick(ni)
      }
      return (el || pick(ni))?.getBoundingClientRect() || null
    },
  }), [center, nearestIndex, total, items, n, indexOf])

  // scroll: paint each frame; wrap round and repaint once scrolling stops
  useEffect(() => {
    const f = feedRef.current
    if (!f) return undefined
    const s = st.current
    const onScroll = () => {
      if (!s.raf) s.raf = requestAnimationFrame(() => { s.raf = 0; paint() })
      clearTimeout(s.endT)
      s.endT = setTimeout(() => { wrap(); paint() }, 160)
    }
    f.addEventListener('scroll', onScroll, { passive: true })
    return () => { f.removeEventListener('scroll', onScroll); cancelAnimationFrame(s.raf); s.raf = 0; clearTimeout(s.endT) }
  }, [paint, wrap])

  // size: pads keep the first and last rows able to reach the lens
  useEffect(() => {
    const f = feedRef.current
    if (!f || typeof ResizeObserver === 'undefined') return undefined
    let last = f.clientHeight
    const ro = new ResizeObserver(() => {
      if (f.clientHeight === last) return
      last = f.clientHeight
      const keep = st.current.focus
      pads()
      if (keep) center(keep, true)
      paint()
    })
    ro.observe(f)
    return () => ro.disconnect()
  }, [pads, paint, center])

  // a new or re-sorted list: keep the open job (else the job in the lens) in the
  // lens; first time: the first job at risk, else the first job
  const order = items.map((it) => it.id).join('|')
  const placed = useRef(null)
  useLayoutEffect(() => {
    pads()
    if (!n) { placed.current = order; return }
    const prev = placed.current
    placed.current = order
    const want = openId || (prev !== null ? st.current.focus : null) || keepId
    const id = (want && items.some((it) => it.id === want) ? want : null) || (items.find((it) => it.risk) || items[0]).id
    center(id, true)
    paint()
  }, [order, layout]) // eslint-disable-line react-hooks/exhaustive-deps

  // the open job changed from outside (search, deep link, ↑ ↓): bring it to the lens
  useEffect(() => {
    if (!openId || st.current.focus === openId) return
    center(openId, false)
  }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps

  // rows repaint when their contents change (risk dot, labels)
  useLayoutEffect(() => { paint() }, [items, paint])

  const onClick = (e) => {
    const b = e.target.closest('.pt-row')
    if (!b || !feedRef.current?.contains(b)) return
    const i = Number(b.dataset.i)
    feedRef.current.scrollTo({ top: topFor(i), behavior: 'smooth' })
    st.current.focus = items[i % n].id
    onOpen(items[i % n].id, b.firstElementChild?.getBoundingClientRect() || null)
  }

  const rows = []
  for (let c = 0; c < copies; c++) {
    const live = !loop || c === Math.floor(copies / 2)
    items.forEach((it, k) => {
      const i = c * n + k
      rows.push(
        <button key={`${c}:${it.id}`} type="button" className="pt-row" data-i={i} data-id={it.id}
          aria-hidden={live ? undefined : 'true'} tabIndex={live ? undefined : -1}
          aria-current={it.id === openId ? 'true' : undefined}>
          <span className="pt-ri">
            <span className="pt-jn">{it.jobNo}</span>
            <span className="pt-cl">{it.client}</span>
            <span className="pt-stt">
              {it.risk && <span className="pt-flag" title={it.risk} />}
              {it.risk && <span className="pt-sr">{it.risk}, </span>}
              {it.stageLabel}
            </span>
          </span>
        </button>,
      )
    })
  }

  return (
    <>
      <div className="pt-lens" aria-hidden="true" hidden={!n} />
      <div className="pt-feed" ref={feedRef} role="group" aria-label="Jobs" onClick={onClick}
        onFocus={(e) => { const b = e.target.closest?.('.pt-row'); if (b) { const i = Number(b.dataset.i); feedRef.current.scrollTo({ top: topFor(i), behavior: 'smooth' }) } }}>
        <div className="pt-pad" aria-hidden="true" />
        {n ? rows : empty}
        <div className="pt-pad" aria-hidden="true" />
      </div>
    </>
  )
}
