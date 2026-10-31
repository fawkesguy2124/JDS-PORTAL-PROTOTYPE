import { Icon } from './Icon'
import { cx } from './utils'

/**
 * <Stat label="Waiting for OOC" value={12} hint="avg 2 days since BE" icon="hourglass" tone="warning" onClick={…} />
 * value is 28px, tabular. `delta` (number or string) shows up/down before the hint.
 * tone (success | warning | danger) colours the hint line only. With onClick it is a button.
 */
export function Stat({ label, value, hint, delta, icon, tone, onClick, className, title }) {
  const Tag = onClick ? 'button' : 'div'
  const dir = typeof delta === 'number' ? (delta > 0 ? 'up' : delta < 0 ? 'down' : '') : ''
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} title={title} className={cx('ix-card ix-stat', tone, className)}>
      <div className="label">{icon && <Icon name={icon} />}{label}</div>
      <div className="value">{value ?? '—'}</div>
      {(hint || delta != null) && (
        <div className="hint">
          {delta != null && <span className={cx('delta', dir)}>{dir === 'up' ? '+' : ''}{delta}</span>}
          {hint}
        </div>
      )}
    </Tag>
  )
}
