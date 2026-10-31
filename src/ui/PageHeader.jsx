import { Icon } from './Icon'
import { cx } from './utils'

/**
 * <PageHeader title="All jobs" description="Every open job" actions={<Button variant="primary">Create job</Button>} back={() => …} />
 * Title 22px (18px on phones); actions sit right and wrap below on phones.
 * `back`: a function, or { onClick, label }.
 */
export function PageHeader({ title, description, actions, back, className, children }) {
  const onBack = typeof back === 'function' ? back : back?.onClick
  const backLabel = (typeof back === 'object' && back?.label) || 'Back'
  return (
    <div className={cx('ix-page-head', className)}>
      <div className="ix-page-head-main">
        {onBack && (
          <button type="button" className="ix-icon-btn ix-back" onClick={onBack} aria-label={backLabel} title={backLabel}>
            <Icon name="arrow-left" />
          </button>
        )}
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
      </div>
      {children}
      {actions && <div className="right">{actions}</div>}
    </div>
  )
}

/**
 * <Toolbar>…filters, search, actions…</Toolbar>: consistent gaps, wraps on
 * tablet. Put chip filters in <div className="ix-toolbar-chips"> to make them a
 * sideways-scrolling row on phones; search inputs go full width there.
 */
export function Toolbar({ className, children, ...rest }) {
  return <div className={cx('ix-toolbar', className)} role="toolbar" {...rest}>{children}</div>
}
