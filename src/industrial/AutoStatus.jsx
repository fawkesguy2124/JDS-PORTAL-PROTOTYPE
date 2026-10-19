import { Icon } from './ui'

// One line under a page title saying what the page is updating by itself
// (see autoChecks.js), so nobody wonders whether to press a button.
export default function AutoStatus({ auto, fresh, what, idle }) {
  let icon = 'refresh'
  let text = idle
  let tone = 'var(--muted)'
  if (!fresh) text = 'Loading the latest from the portal…'
  else if (auto.running) {
    icon = 'loader-2'
    tone = 'var(--navy)'
    text = `Checking ${what} for ${auto.label} (${auto.done + 1} of ${auto.total})… government systems can take up to a minute.`
  } else if (auto.total > 0) {
    icon = 'circle-check'
    tone = 'var(--green)'
    text = `Updated just now: ${what} checked for ${auto.total} ${auto.total === 1 ? 'item' : 'items'}.`
  }
  return (
    <div className="ix-autostatus" style={{ color: tone }} role="status" aria-live="polite">
      <Icon name={icon} style={auto.running ? { animation: 'ixSpin 1s linear infinite', display: 'inline-block' } : undefined} />
      <span>{text}</span>
    </div>
  )
}
