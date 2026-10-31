import { Icon } from './Icon'
import { Spinner } from './Feedback'
import { cx } from './utils'

const VARIANT = { primary: 'primary', secondary: '', ghost: 'ghost', danger: 'danger' }
const SIZE = { sm: 'sm', md: '', lg: 'lg' }

/**
 * <Button variant="primary" size="md" icon="plus" loading={busy}>Create job</Button>
 * variant: primary | secondary (default) | ghost | danger. size: sm | md | lg.
 * Pass `href` to render a link that looks like a button. One primary per view.
 */
export function Button({ variant = 'secondary', size = 'md', icon, iconRight, loading = false, block = false, type = 'button', className, children, disabled, href, ref, ...rest }) {
  const cls = cx('ix-btn', VARIANT[variant], SIZE[size], block && 'block', loading && 'is-loading', className)
  const inner = (
    <>
      {icon && <Icon name={icon} />}
      {children != null && children !== false && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} />}
      {loading && <span className="ix-btn-spin"><Spinner size={size === 'lg' ? 18 : 16} label="" /></span>}
    </>
  )
  if (href) {
    return <a ref={ref} href={href} className={cls} aria-disabled={disabled || loading || undefined} {...rest}>{inner}</a>
  }
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {inner}
    </button>
  )
}

/**
 * <IconButton icon="x" label="Close" />: `label` is required (aria-label + tooltip).
 * size: sm | md | lg. variant: ghost (default) | outline.
 */
export function IconButton({ icon, label, size = 'md', variant = 'ghost', className, type = 'button', children, ref, ...rest }) {
  return (
    <button ref={ref} type={type} className={cx('ix-icon-btn', SIZE[size], variant === 'outline' && 'outline', className)} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
      {children}
    </button>
  )
}
