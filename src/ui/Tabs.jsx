import { useRef } from 'react'
import { Icon } from './Icon'
import { cx } from './utils'

const norm = (t) => (typeof t === 'object' ? t : { id: t, label: t })

// arrow keys move between tabs (roving focus)
function onArrows(e, ref) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
  const items = [...(ref.current?.querySelectorAll('[data-tab]:not([disabled])') || [])]
  const i = items.indexOf(document.activeElement)
  if (i < 0) return
  e.preventDefault()
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
  items[next].focus()
  items[next].click()
}

/**
 * Underline tabs for page sections.
 * <Tabs tabs={[{ id: 'open', label: 'Open', count: 12, icon: 'package' }]} value={view} onChange={setView} />
 * Scrolls sideways on phones. `flush` removes the side padding.
 */
export function Tabs({ tabs, value, onChange, flush = false, className, label = 'Sections' }) {
  const ref = useRef(null)
  return (
    <div ref={ref} className={cx('ix-tabs', flush && 'flush', className)} role="tablist" aria-label={label} onKeyDown={(e) => onArrows(e, ref)}>
      {tabs.map(norm).map((t) => {
        const on = t.id === value
        return (
          <button key={t.id} type="button" role="tab" data-tab aria-selected={on} tabIndex={on ? 0 : -1} disabled={t.disabled}
            className={cx('ix-tab', on && 'active')} onClick={() => onChange?.(t.id)}>
            {t.icon && <Icon name={t.icon} />}
            {t.label}
            {t.count != null && <span className="n">{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Segmented control for small toggles.
 * <Segmented options={[{ value: 'list', label: 'List', icon: 'list-details' }]} value={v} onChange={setV} size="sm" label="View" />
 */
export function Segmented({ options, value, onChange, size = 'md', className, label }) {
  const ref = useRef(null)
  return (
    <div ref={ref} className={cx('ix-seg', size === 'sm' && 'sm', className)} role="radiogroup" aria-label={label} onKeyDown={(e) => onArrows(e, ref)}>
      {options.map((o) => {
        const opt = typeof o === 'object' ? o : { value: o, label: o }
        const on = opt.value === value
        return (
          <button key={opt.value} type="button" role="radio" data-tab aria-checked={on} tabIndex={on ? 0 : -1}
            className={cx('ix-seg-item', on && 'on')} onClick={() => onChange?.(opt.value)} title={opt.title} aria-label={opt.label ? undefined : opt.title}>
            {opt.icon && <Icon name={opt.icon} />}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
