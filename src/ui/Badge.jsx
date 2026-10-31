import { Icon } from './Icon'
import { cx } from './utils'

/**
 * <Badge tone="success" icon="circle-check">OOC granted</Badge>
 * tone: neutral (default) | brand | success | warning | danger | info.
 * `dot` shows a leading status dot. `size="sm"` for dense rows. 22px tall.
 * Status colour is for state only, never decoration.
 */
export function Badge({ tone = 'neutral', icon, dot = false, size, className, children, ...rest }) {
  return (
    <span className={cx('ix-badge', tone, size === 'sm' && 'sm', className)} {...rest}>
      {dot && <span className="ix-badge-dot" aria-hidden="true" />}
      {icon && <Icon name={icon} />}
      {children}
    </span>
  )
}
