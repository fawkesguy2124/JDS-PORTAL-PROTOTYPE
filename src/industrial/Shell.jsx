import { useEffect, useRef, useState } from 'react'
import NotificationBell from '../components/NotificationBell'
import CommandPalette from './CommandPalette'
import { useInstallApp } from '../services/desktopApp'
import { Icon } from '../ui/Icon'
import { Avatar, Kbd } from '../ui/Feedback'
import { Drawer } from '../ui/Overlay'
import { Segmented } from '../ui/Tabs'
import { useForcedTheme, useIsPhone, useIsTablet, useTheme } from '../ui/hooks'
import { cx } from '../ui/utils'

// The phone's bottom tabs when a page does not pass its own (the admin four).
const DEFAULT_TABS = [
  { id: 'today', icon: 'home', label: 'Today' },
  { id: 'jobs', icon: 'list-details', label: 'Jobs' },
  { id: 'trucks', icon: 'truck', label: 'Trucks' },
  { id: 'customs', icon: 'file-certificate', label: 'BE & OOC' },
]

const readFlag = (key) => { try { return localStorage.getItem(key) === '1' } catch { return false } }
const saveFlag = (key, on) => { try { localStorage.setItem(key, on ? '1' : '0') } catch { /* private mode */ } }
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')

/**
 * The frame around every signed-in page: dark sidebar (desktop; icon rail on
 * tablets), top bar (search, Create job, bell, theme, user menu), and on
 * phones a compact top bar, bottom tabs and a "More" drawer.
 *
 * sections  [{ label, items: [{ id, label, icon, alert?, hidden? }] }]
 * active    id of the open page          counts  { [itemId]: number }
 * onGo(id)  open a page                  onOpenJob(id)  open a job (search)
 * onCreateJob()  optional: shows "Create job"     onLogout()
 * profile   { name, role, id }           onBellNavigate(action)  notification click
 * tabs      optional phone tabs [{ id, icon, label }] (default: Today, Jobs, Trucks, BE & OOC)
 * brand     optional { title, subtitle } for the sidebar
 * lightOnly optional: the open page is not on the design system yet, so it is
 *           shown light whatever theme is saved, and the theme toggle is hidden.
 *           Drop it for a page once it is migrated.
 * Remembers ix_nav_collapsed and ix_compact in localStorage. Ctrl/Cmd K opens search.
 */
export default function Shell({ sections, active, counts = {}, onGo, onOpenJob, onCreateJob, onLogout, profile, onBellNavigate, tabs = DEFAULT_TABS, brand, lightOnly = false, children }) {
  const [collapsed, setCollapsed] = useState(() => readFlag('ix_nav_collapsed'))
  const [compact, setCompact] = useState(() => readFlag('ix_compact'))
  const [peek, setPeek] = useState(false) // tablet: sidebar opened over the page
  const [palette, setPalette] = useState(false)
  const [mnav, setMnav] = useState(false)
  const app = useInstallApp() // the portal as a desktop app
  const theme = useTheme()
  useForcedTheme(lightOnly ? 'light' : null) // after useTheme(): both run before the first paint
  const isPhone = useIsPhone()
  const isTablet = useIsTablet()
  const rail = isTablet ? !peek : collapsed

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // tablet: Esc closes the sidebar opened over the page
  useEffect(() => {
    if (!peek) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setPeek(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [peek])

  const toggleNav = () => {
    if (isTablet) { setPeek((v) => !v); return }
    setCollapsed((v) => { saveFlag('ix_nav_collapsed', !v); return !v })
  }
  const toggleCompact = () => setCompact((v) => { saveFlag('ix_compact', !v); return !v })

  const pages = sections.flatMap((s) => s.items).filter((it) => !it.hidden)
  const go = (id) => { setMnav(false); setPeek(false); onGo(id) }
  const openSearch = () => { setMnav(false); setPalette(true) }
  const name = profile?.name || 'Admin'
  const brandTitle = brand?.title || 'JDS Logistics'
  const brandSub = brand?.subtitle || 'Operations portal'

  const navList = sections.map((s) => {
    const items = s.items.filter((it) => !it.hidden)
    if (!items.length) return null
    return (
      <div key={s.label} className="ix-nav-group" role="group" aria-label={s.label}>
        <div className="ix-nav-label" aria-hidden="true">{s.label}</div>
        {items.map((it) => {
          const n = counts[it.id]
          const on = active === it.id
          return (
            <button key={it.id} type="button" className={cx('ix-nav-item', on && 'active')} onClick={() => go(it.id)}
              aria-current={on ? 'page' : undefined} title={rail && !isPhone ? (n ? `${it.label} · ${n}` : it.label) : undefined}>
              <Icon name={it.icon} /><span>{it.label}</span>
              {n ? <span className={cx('count', it.alert && 'red')} aria-label={`${n}${it.alert ? ' need attention' : ''}`}>{n}</span> : null}
            </button>
          )
        })}
      </div>
    )
  })

  const onPalLookup = sections.some((s) => s.items.some((it) => it.id === 'search')) ? (q) => {
    try { sessionStorage.setItem('ix_lookup', q) } catch { /* private mode: the page opens empty */ }
    go('search')
    window.dispatchEvent(new CustomEvent('ix-lookup', { detail: q })) // page already open
  } : null

  return (
    <div className={cx('ix', rail && !isPhone && 'nav-collapsed', isTablet && peek && 'nav-peek', compact && 'compact')}>
      <div className="ix-app">
        {!isPhone && (
          <nav className="ix-nav" aria-label="Main menu">
            <div className="ix-nav-brand">
              <div className="ix-logo" aria-hidden="true">JDS</div>
              <div className="ix-brand-text"><b>{brandTitle}</b><small>{brandSub}</small></div>
            </div>
            <div className="ix-nav-scroll">{navList}</div>
            <div className="ix-nav-foot">
              <button type="button" className="ix-nav-item" onClick={toggleNav} aria-expanded={!rail}
                title={rail ? 'Expand menu' : 'Collapse menu'}>
                <Icon name={rail ? 'layout-sidebar-left-expand' : 'layout-sidebar-left-collapse'} />
                <span>{isTablet ? 'Close menu' : 'Collapse menu'}</span>
              </button>
            </div>
          </nav>
        )}
        {isTablet && peek && <div className="ix-nav-scrim" onClick={() => setPeek(false)} aria-hidden="true" />}

        <header className="ix-top">
          <div className="ix-brand"><div className="ix-logo" aria-hidden="true">JDS</div><span className="ix-sr-only">{brandTitle}</span></div>
          {!isPhone && (
            <button type="button" className="ix-search" onClick={() => setPalette(true)} aria-label="Search (Ctrl K)">
              <Icon name="search" /><span>Search jobs, BE, container, truck, client…</span><Kbd>{isMac ? '⌘ K' : 'Ctrl K'}</Kbd>
            </button>
          )}
          <div className="ix-top-actions">
            {isPhone && (
              <button type="button" className="ix-icon-btn" onClick={openSearch} aria-label="Search" title="Search"><Icon name="search" /></button>
            )}
            {onCreateJob && !isPhone && (
              <button type="button" className="ix-btn primary" onClick={onCreateJob}><Icon name="plus" />Create job</button>
            )}
            <NotificationBell onNavigate={onBellNavigate} profile={profile} />
            {!isPhone && !theme.forced && (
              <button type="button" className="ix-icon-btn" onClick={theme.toggle}
                aria-label={theme.resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                title={theme.resolved === 'dark' ? 'Light theme' : 'Dark theme'}>
                <Icon name={theme.resolved === 'dark' ? 'sun' : 'moon'} />
              </button>
            )}
            <UserMenu name={name} role={profile?.role} compact={compact} onCompact={toggleCompact} theme={theme} app={app} onLogout={onLogout} />
          </div>
        </header>

        <main className="ix-main" id="ix-main">{children}</main>

        {isPhone && (
          <nav className="ix-tabbar" aria-label="Main menu">
            {tabs.map((t) => (
              <button key={t.id} type="button" className={active === t.id ? 'active' : ''} onClick={() => go(t.id)} aria-current={active === t.id ? 'page' : undefined}>
                <Icon name={t.icon} /><span>{t.label}</span>
              </button>
            ))}
            <button type="button" className={mnav || !tabs.some((t) => t.id === active) ? 'active' : ''} onClick={() => setMnav(true)} aria-haspopup="dialog" aria-expanded={mnav}>
              <Icon name="menu-2" /><span>More</span>
            </button>
          </nav>
        )}
      </div>

      {isPhone && (
        <Drawer open={mnav} onClose={() => setMnav(false)} title="Menu" label="Menu" bodyClassName="ix-mnav">
          <div className="ix-mnav-actions">
            {onCreateJob && <button type="button" className="ix-btn primary lg" onClick={() => { setMnav(false); onCreateJob() }}><Icon name="plus" />Create job</button>}
            <button type="button" className="ix-btn lg" style={onCreateJob ? undefined : { gridColumn: '1 / -1' }} onClick={openSearch}><Icon name="search" />Search</button>
          </div>
          {navList}
        </Drawer>
      )}

      <CommandPalette open={palette} onClose={() => setPalette(false)} pages={pages} onGo={go} onOpenJob={onOpenJob} onLookup={onPalLookup} />
    </div>
  )
}

// Avatar → name, role, compact rows, theme, install app, log out.
function UserMenu({ name, role, compact, onCompact, theme, app, onLogout }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const btn = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...(box.current?.querySelectorAll('.ix-menu button') || [])]
        if (!items.length) return
        e.preventDefault()
        const i = items.indexOf(document.activeElement)
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    const raf = requestAnimationFrame(() => box.current?.querySelector('.ix-menu button')?.focus())
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); cancelAnimationFrame(raf) }
  }, [open])

  const run = (fn) => () => { setOpen(false); fn?.() }

  return (
    <div className="ix-menu-anchor" ref={box}>
      <button ref={btn} type="button" className="ix-avatar-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Account: ${name}`} title={`${name}${role ? ` · ${role}` : ''}`}>
        <Avatar name={name} />
      </button>
      {open && (
        <div className="ix-menu" role="dialog" aria-label="Account">
          <div className="ix-menu-head">
            <Avatar name={name} size="lg" />
            <div style={{ minWidth: 0 }}><b>{name}</b><small>{String(role || '').replace(/_/g, ' ')}</small></div>
          </div>
          <div className="ix-menu-sep" />
          <button type="button" className="ix-menu-item" role="switch" aria-checked={compact} onClick={onCompact}>
            <Icon name={compact ? 'baseline-density-small' : 'baseline-density-medium'} />Compact rows
            <span className={cx('ix-switch', compact && 'on')} aria-hidden="true" />
          </button>
          <div className="ix-menu-row">
            <Icon name={theme.theme === 'dark' ? 'moon' : 'sun'} />Theme
            <Segmented size="sm" label="Theme" value={theme.theme} onChange={theme.setTheme} options={[
              { value: 'light', icon: 'sun', title: 'Light' },
              { value: 'dark', icon: 'moon', title: 'Dark' },
              { value: 'system', icon: 'device-laptop', title: 'Same as this device' },
            ]} />
          </div>
          {theme.forced && <p className="ix-menu-note">This page is light only for now. Your choice applies to the other pages.</p>}
          {app?.canInstall && (
            <button type="button" className="ix-menu-item" onClick={run(app.install)} title="Install the JDS Portal as an app on this computer (own window, Start menu and taskbar icon)">
              <Icon name="download" />Install app
            </button>
          )}
          <div className="ix-menu-sep" />
          <button type="button" className="ix-menu-item danger" onClick={run(onLogout)}>
            <Icon name="logout" />Log out
          </button>
        </div>
      )}
    </div>
  )
}
