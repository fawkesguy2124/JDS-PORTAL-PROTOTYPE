import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { cx, initials } from './utils'

/** <Spinner size={16} />: only inside buttons and small areas; use Skeleton for page loads. */
export function Spinner({ size = 16, label = 'Loading', className }) {
  return (
    <svg className={cx('ix-spinner', className)} width={size} height={size} viewBox="0 0 24 24" role={label ? 'status' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
      <circle className="track" cx="12" cy="12" r="9" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="9" strokeWidth="2.5" strokeDasharray="14 60" />
    </svg>
  )
}

/**
 * While a page loads: outline rows instead of a blank "Loading…". After 15 s a
 * Reload button appears (a stuck connection or an expired sign-in).
 */
export function Skeleton({ rows = 5 }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 15000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="ix-skel" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ix-skel-row"><span style={{ width: `${30 + ((i * 37) % 45)}%` }} /><span /></div>
      ))}
      {slow && (
        <div className="ix-skel-slow">
          Taking longer than usual.
          <button type="button" className="ix-btn sm" onClick={() => window.location.reload()}><Icon name="refresh" />Reload</button>
        </div>
      )}
    </div>
  )
}

/**
 * <EmptyState icon="inbox" title="No jobs yet" description="Jobs you create appear here." action={<Button/>} />
 * Never a bare "No data": say what will appear and how to make it appear.
 */
export function EmptyState({ icon = 'inbox', title, description, action, compact = false, className }) {
  return (
    <div className={cx('ix-empty-state', compact && 'compact', className)}>
      {icon && <span className="ico"><Icon name={icon} /></span>}
      {title && <div className="t">{title}</div>}
      {description && <div className="d">{description}</div>}
      {action && <div className="a">{action}</div>}
    </div>
  )
}

/** <Avatar name="Jose Kurian" size="sm|md|lg" />: initials on --brand-soft. */
export function Avatar({ name, src, size = 'md', className, title }) {
  return (
    <span className={cx('ix-avatar', size !== 'md' && size, className)} title={title} aria-hidden={title ? undefined : true}>
      {src ? <img src={src} alt="" /> : initials(name)}
    </span>
  )
}

/** <Kbd>Ctrl K</Kbd>: keyboard hint, hidden on touch screens. */
export function Kbd({ children, className }) {
  return <kbd className={cx('ix-kbd', className)}>{children}</kbd>
}
