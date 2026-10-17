// Small shared pieces of the industrial design.

export const Icon = ({ name, style }) => <i className={`ti ti-${name}`} style={style} aria-hidden="true" />

export const Chip = ({ tone = 'grey', icon, children, className = '' }) => (
  <span className={`ix-chip ${tone} ${className}`}>{icon && <Icon name={icon} />}{children}</span>
)

const PHASE_CHIPS = {
  arrival: ['grey', 'ship', 'Ship due'],
  docs: ['blue', 'file-text', 'BE to file'],
  ooc: ['amber', 'hourglass', 'Waiting OOC'],
  release: ['green', 'circle-check', 'OOC granted'],
  truck: ['blue', 'truck', 'On the road'],
  delivered: ['grey', 'flag', 'Delivered'],
  sb: ['blue', 'file-text', 'SB to file'],
  leo: ['amber', 'hourglass', 'Waiting LEO'],
  sail: ['green', 'circle-check', 'LEO given'],
}
export function phaseChip(job, j) {
  let [tone, icon, label] = PHASE_CHIPS[j?.phase] || ['grey', 'circle', 'Open']
  if (j?.phase === 'arrival' && job?.mode === 'Air') { icon = 'plane'; label = 'Flight due' }
  if (j?.phase === 'delivered' && job?.job_type === 'export') label = 'Shipped'
  return { tone, icon, label }
}
export const PhaseChip = ({ job, j }) => {
  const c = phaseChip(job, j)
  return <Chip tone={c.tone} icon={c.icon}>{c.label}</Chip>
}

export function FreeDays({ value }) {
  if (value === null || value === undefined) return <span className="ix-fd grey">—</span>
  const tone = value <= 2 ? 'red' : value <= 5 ? 'amber' : 'green'
  return <span className={`ix-fd ${tone}`}>{value < 0 ? `${value} d` : `${value} d left`}</span>
}

export const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

export const Owner = ({ name, short }) => (name
  ? <span className="ix-owner"><span className="ix-avatar sm">{initials(name)}</span>{!short && name}</span>
  : <span style={{ color: 'var(--muted)' }}>—</span>)

// Worst attention level on a job: red > amber > info > none
export const worst = (j) => (j?.attention?.some((a) => a.level === 'red') ? 'red'
  : j?.attention?.some((a) => a.level === 'amber') ? 'amber'
  : j?.attention?.some((a) => a.level === 'info') ? 'info' : 'none')

export const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso)
  return isNaN(d) ? String(iso) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function timeAgo(iso) {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (isNaN(mins)) return ''
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d} days ago`
  return fmtDate(iso)
}

export function Sparkline({ points, color = '#1a4fa0' }) {
  if (!points?.length) return null
  const w = 120, h = 28, max = Math.max(...points), min = Math.min(...points)
  const xs = points.map((p, i) => `${(i / Math.max(points.length - 1, 1)) * w},${h - ((p - min) / ((max - min) || 1)) * (h - 4) - 2}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', marginTop: 8 }} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={xs} />
    </svg>
  )
}

export const jobOwnerName = (job, profiles) => profiles?.[job?.assigned_to] || null
