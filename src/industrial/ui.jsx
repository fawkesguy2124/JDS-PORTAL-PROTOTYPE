// Shared pieces of the industrial design (Control tower, Jose 31 Oct 2026).
// How to use each one: src/industrial/DESIGN.md
// The format helpers (fmtDate, worst, phaseChip …) stay here next to the
// components because every page already imports them from this file.
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'

export const Icon = ({ name, style, className = '' }) => <i className={`ti ti-${name}${className ? ` ${className}` : ''}`} style={style} aria-hidden="true" />

// ── formats: one helper each, used on every page ──
// Dates as '29 Oct' ('Sep', never 'Sept'), the year only when it is not this year,
// times as 24 h IST. A date-only value ('2026-10-29') is taken as that day, not
// shifted by time zone.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const IST_MS = 5.5 * 3600000
const istParts = (ms) => {
  const t = new Date(ms + IST_MS)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes() }
}
function parts(iso) {
  if (!iso) return null
  const s = String(iso)
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (day) return { y: +day[1], m: +day[2] - 1, d: +day[3], dateOnly: true }
  const ms = new Date(s).getTime()
  return isNaN(ms) ? null : istParts(ms)
}
const pad = (n) => String(n).padStart(2, '0')

export const fmtDate = (iso) => {
  if (!iso) return '—'
  const p = parts(iso)
  if (!p) return String(iso)
  const year = p.y !== istParts(Date.now()).y ? ` ${p.y}` : ''
  return `${p.d} ${MONTHS[p.m]}${year}`
}
// '18:20' (IST)
export const fmtTime = (iso) => {
  const p = parts(iso)
  return p && !p.dateOnly ? `${pad(p.h)}:${pad(p.min)}` : ''
}
// '31 Oct, 18:20' (IST); a date-only value prints as the date alone
export const fmtDateTime = (iso) => {
  if (!iso) return '—'
  const t = fmtTime(iso)
  return t ? `${fmtDate(iso)}, ${t}` : fmtDate(iso)
}
// ₹4,82,310 (Indian grouping, no paise)
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
export const fmtINR = (n) => (n === null || n === undefined || n === '' || isNaN(Number(n)) ? '—' : INR.format(Number(n)))

// A missing value: a muted dash (sort it last, whatever the direction)
export const Dash = () => <span className="ix-dash">—</span>

export const Chip = ({ tone = 'grey', icon, children, className = '', title }) => (
  <span className={`ix-chip ${tone} ${className}`} title={title}>{icon && <Icon name={icon} />}{children}</span>
)

// Status: a 7px dot plus a label. Tones: red, amber, green, teal, blue, grey.
// pill = tinted background, only for a stage cell in a wide table.
export const Status = ({ tone = 'grey', pill, sub, title, children }) => (
  <span className={`ix-st ${tone}${pill ? ' pill' : ''}`} title={title}>{children}{sub ? <span className="x">{sub}</span> : null}</span>
)

// Job number, mono, first on every row. With onClick it is a button (the row's
// own click is not fired twice).
export function JobNo({ no, job, onClick, size, title, className = '' }) {
  const text = no ?? job?.job_no ?? '—'
  const cls = `ix-jobno${size ? ` ${size}` : ''}${className ? ` ${className}` : ''}`
  if (!onClick) return <span className={cls} title={title}>{text}</span>
  return (
    <button type="button" className={cls} title={title || `Open ${text}`} onClick={(e) => { e.stopPropagation(); onClick(e) }}>{text}</button>
  )
}

// Stage labels and tones. Green only for delivered; 'OOC granted' is a job that
// still has to move, so it is amber 'To move' (audit, 31 Oct 2026).
const PHASE_CHIPS = {
  arrival: ['blue', 'ship', 'Ship due'],
  docs: ['grey', 'file-text', 'BE to file'],
  ooc: ['amber', 'hourglass', 'Waiting OOC'],
  release: ['amber', 'truck-loading', 'To move'],
  truck: ['blue', 'truck', 'On the move'],
  delivered: ['green', 'flag', 'Delivered'],
  sb: ['grey', 'file-text', 'SB to file'],
  leo: ['amber', 'hourglass', 'Waiting LEO'],
  sail: ['blue', 'circle-check', 'LEO given'],
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
// The same stage as a dot + label (tables, lists)
export const PhaseStatus = ({ job, j, pill, sub }) => {
  const c = phaseChip(job, j)
  return <Status tone={c.tone} pill={pill} sub={sub}>{c.label}</Status>
}

// Free days left: '13 d', 'Today', '3 d over'. Red at 2 or less, amber at 5 or
// less, plain otherwise. till = the date free time ends ('6 Nov'), optional.
export function FreeDays({ value, till }) {
  if (value === null || value === undefined) return <span className="ix-fd grey">—</span>
  const tone = value <= 2 ? 'red' : value <= 5 ? 'amber' : ''
  const text = value < 0 ? `${-value} d over` : value === 0 ? 'Today' : `${value} d`
  return (
    <span className={`ix-fd ${tone}${value < 0 ? ' over' : ''}`} title={value > 0 ? `${value} free day${value === 1 ? '' : 's'} left` : undefined}>
      {till && <small>till {till}</small>}<b>{text}</b>
    </span>
  )
}

export const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

export const Owner = ({ name, short }) => (name
  ? <span className="ix-owner"><span className="ix-avatar sm">{initials(name)}</span>{!short && name}</span>
  : <Dash />)

// Worst attention level on a job: red > amber > info > none
export const worst = (j) => (j?.attention?.some((a) => a.level === 'red') ? 'red'
  : j?.attention?.some((a) => a.level === 'amber') ? 'amber'
  : j?.attention?.some((a) => a.level === 'info') ? 'info' : 'none')

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
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', marginTop: 6 }} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={xs} />
    </svg>
  )
}

export const jobOwnerName = (job, profiles) => profiles?.[job?.assigned_to] || null

// ── page building blocks ──

// Page title row: title, a sub line (string, node, or a list joined with ' · '),
// and the page's actions on the right. The top bar already has Create job.
export function PageHead({ title, sub, actions, children }) {
  const subLine = Array.isArray(sub)
    ? sub.filter(Boolean).map((s, i) => <span key={i}>{i > 0 && <span className="sep">· </span>}{s}</span>)
    : sub
  const right = actions || children
  return (
    <div className="ix-page-head">
      <div>
        <h1>{title}</h1>
        {subLine && (!Array.isArray(subLine) || subLine.length > 0) ? <div className="sub">{subLine}</div> : null}
      </div>
      {right ? <div className="right">{right}</div> : null}
    </div>
  )
}

// Buttons: variant primary | secondary (default) | ghost | danger; size 'sm'.
// One primary per view. urgent (with primary) = red fill, only on an 'act today' row.
export function Button({ variant = 'secondary', size, icon, urgent, className = '', type = 'button', children, ...rest }) {
  const cls = ['ix-btn', variant !== 'secondary' && variant, size === 'sm' && 'sm', urgent && 'urgent', className].filter(Boolean).join(' ')
  return <button type={type} className={cls} {...rest}>{icon && <Icon name={icon} />}{children}</button>
}

// KPI strip: <KpiStrip><Kpi …/><Kpi …/></KpiStrip>. Tone colours the value only.
// With onClick the tile is a filter (selected = navy-50 with a navy underline).
export const KpiStrip = ({ children, className = '' }) => <div className={`ix-kstrip${className ? ` ${className}` : ''}`}>{children}</div>
export function Kpi({ label, value, unit, sub, tone, dot, onClick, selected, title }) {
  const cls = `ix-kstat${tone ? ` ${tone}` : ''}${selected ? ' sel' : ''}`
  const none = value === null || value === undefined || value === ''
  const body = (
    <>
      <div className="l">{dot && <span className={`d ${dot}`} />}<span>{label}</span>{onClick && <Icon name="chevron-right" className="chev" />}</div>
      <div className="v"><b className={none ? 'none' : undefined}>{none ? '—' : value}</b>{unit && !none ? <span className="u">{unit}</span> : null}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </>
  )
  return onClick
    ? <button type="button" className={cls} onClick={onClick} aria-pressed={!!selected} title={title}>{body}</button>
    : <div className={cls} title={title}>{body}</div>
}

// Filter tabs with counts: tabs = [{ id, label, count, tone: 'red'|'amber', icon }]
export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`ix-tabs${className ? ` ${className}` : ''}`} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={`ix-tab${value === t.id ? ' on' : ''}`} onClick={() => onChange(t.id)}>
          {t.icon && <Icon name={t.icon} />}{t.label}
          {t.count !== undefined && t.count !== null && t.count !== '' ? <span className={`c${t.tone ? ` ${t.tone}` : ''}`}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

// Segmented control (Import | Export): options = [{ value, label }] or strings
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="ix-seg" role="group" aria-label={label}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        return <button key={v} type="button" className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{typeof o === 'string' ? o : o.label}</button>
      })}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search', width, autoFocus, inputRef }) {
  return (
    <label className="ix-tsearch" style={width ? { width } : undefined}>
      <Icon name="search" />
      <input ref={inputRef} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder} />
      {value ? <button type="button" className="x" onClick={() => onChange('')} aria-label="Clear search"><Icon name="x" /></button> : null}
    </label>
  )
}

// A native select drawn as a filter chip ('Mode: All'). options = [{ value, label }] or strings;
// the first option should be the 'all' choice with value ''.
export function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className={`ix-fsel${value ? ' set' : ''}`}>
      {label && <span>{label}:</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => (typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
      <Icon name="chevron-down" />
    </label>
  )
}

// Toolbar above a table: search, filter selects, anything else, and a right slot.
// filters = [{ key, label, value, onChange, options }]
export function Toolbar({ search, onSearch, placeholder, filters = [], right, children }) {
  return (
    <div className="ix-toolbar">
      {onSearch && <SearchBox value={search} onChange={onSearch} placeholder={placeholder} />}
      {filters.map((f, i) => <FilterSelect key={f.key || f.label || i} label={f.label} value={f.value} onChange={f.onChange} options={f.options} />)}
      {children}
      {right ? <div className="right">{right}</div> : null}
    </div>
  )
}

// Panel: a hairline box with a 40px title row. flush = children go edge to edge
// (tables, lists); otherwise they get the standard padding.
export function Panel({ title, meta, actions, children, className = '', flush = true }) {
  return (
    <section className={`ix-card ix-panel${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <div className="ix-card-head">
          {title && <h2>{title}</h2>}
          {meta ? <span className="sub">{meta}</span> : null}
          {actions ? <div className="right">{actions}</div> : null}
        </div>
      )}
      {flush ? children : <div className="ix-panel-body">{children}</div>}
    </section>
  )
}

// Section inside a panel or the job panel: small caps title, then content
export function Section({ title, right, children, className = '' }) {
  return (
    <div className={`ix-section${className ? ` ${className}` : ''}`}>
      {title && <div className="ix-section-t">{title}{right ? <span className="right">{right}</span> : null}</div>}
      {children}
    </div>
  )
}

// Empty state: a centred block (icon, title, text, one action), or line = one quiet row.
// tone colours the icon: green for 'all clear', grey for 'nothing yet'.
export function EmptyState({ icon = 'circle-check', tone = 'grey', title, children, action, line }) {
  if (line) {
    return <div className={`ix-emptyline ${tone}`}><Icon name={icon} /><span>{title}{children ? <> {children}</> : null}</span>{action}</div>
  }
  return (
    <div className={`ix-emptystate ${tone}`}>
      <span className="ic"><Icon name={icon} /></span>
      {title && <b>{title}</b>}
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  )
}

// While a page loads: grey outline rows instead of a blank "Loading…". After
// 15 seconds a Reload button appears (a stuck connection or an expired sign-in).
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
