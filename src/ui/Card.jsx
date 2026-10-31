import { Icon } from './Icon'
import { cx } from './utils'

/**
 * <Card>
 *   <Card.Header title="Pipeline" description="Open jobs by phase" icon="chart-funnel" actions={<Button size="sm">…</Button>} />
 *   <Card.Body>…</Card.Body>
 *   <Card.Footer>…</Card.Footer>
 * </Card>
 * A 1px --line border on --surface, no shadow. `as` changes the element.
 */
export function Card({ as: Tag = 'div', className, children, ...rest }) {
  return <Tag className={cx('ix-card', className)} {...rest}>{children}</Tag>
}

export function CardHeader({ title, description, icon, actions, className, children }) {
  return (
    <div className={cx('ix-card-head', className)}>
      {icon && <Icon name={icon} />}
      <div className="ix-card-head-text">
        {title && <h2>{title}</h2>}
        {description && <p>{description}</p>}
      </div>
      {children}
      {actions && <div className="right">{actions}</div>}
    </div>
  )
}

export function CardBody({ className, children, ...rest }) {
  return <div className={cx('ix-card-body', className)} {...rest}>{children}</div>
}

export function CardFooter({ className, children, ...rest }) {
  return <div className={cx('ix-card-foot', className)} {...rest}>{children}</div>
}

Card.Header = CardHeader
Card.Body = CardBody
Card.Footer = CardFooter
