import { useEffect, useRef, useState } from 'react'
import NotificationBell from '../components/NotificationBell'
import CommandPalette from './CommandPalette'
import { useSystemHealth, healthTones, autoCheckLine } from './AutoStatus'
import { Icon, initials } from './ui'
import { useInstallApp } from '../services/desktopApp'

// The frame around every page (Control tower, Jose 31 Oct 2026): navy sidebar with
// the brand cell on top, a slim top bar (search, Create job, bell, you), and a
// bottom tab bar on phones.
// counts[id] is a number (neutral badge) or { n, tone: 'red' | 'amber', title }.
// Items with alert: true show their count in red.
export default function Shell({ sections, active, counts = {}, onGo, onOpenJob, onCreateJob, onLogout, profile, onBellNavigate, children }) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('ix_nav_collapsed') === '1' } catch { return false } })
  const [compact, setCompact] = useState(() => { try { return localStorage.getItem('ix_compact') === '1' } catch { return false } })
  const [palette, setPalette] = useState(false)
  const [mnav, setMnav] = useState(false)
  const app = useInstallApp() // the portal as a desktop app
  const health = useSystemHealth()
  const tones = healthTones(health)
  const checkLine = autoCheckLine(health)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const toggle = (setter, key) => setter((v) => { try { localStorage.setItem(key, v ? '0' : '1') } catch { /* private mode */ } return !v })

  const pages = sections.flatMap((s) => s.items).filter((it) => !it.hidden)
  const pageLabel = pages.find((p) => p.id === active)?.label
  const go = (id) => { setMnav(false); onGo(id) }
  // small status dots on the services' own pages (green / amber / red)
  const dots = tones ? { bot: tones.whatsapp, health: tones.overall } : {}
  const DOT_WORD = { green: 'running normally', amber: 'needs a look', red: 'has a problem' }

  const navList = sections.map((s) => {
    const items = s.items.filter((it) => !it.hidden)
    // a section that is just its one page (Today) needs no label above it
    const showLabel = !(items.length === 1 && items[0].label.toLowerCase() === s.label.toLowerCase())
    return (
      <div key={s.label} className="ix-nav-group">
        {showLabel && <div className="ix-nav-label">{s.label}</div>}
        {items.map((it) => {
          const c = counts[it.id]
          const n = c && typeof c === 'object' ? c.n : c
          const tone = (c && typeof c === 'object' && c.tone) || (it.alert ? 'red' : '')
          const tip = (c && typeof c === 'object' && c.title) || it.label
          const dot = dots[it.id]
          return (
            <button key={it.id} type="button" className={`ix-nav-item ${active === it.id ? 'active' : ''}`} onClick={() => go(it.id)}
              title={dot ? `${it.label} · ${DOT_WORD[dot]}` : tip} aria-current={active === it.id ? 'page' : undefined}>
              <Icon name={it.icon} /><span>{it.label}</span>
              {n ? <span className={`count ${tone}`}>{n}</span> : dot ? <span className={`sdot ${dot}`} /> : null}
            </button>
          )
        })}
      </div>
    )
  })
  // when the automatic checks last ran (read only; opens System health)
  const navFoot = checkLine && (
    <button type="button" className="ix-nav-foot" onClick={() => go('health')} title="Automatic checks of customs, port and tolls · open System health">
      <span className={`sdot ${tones?.auto || ''}`} /><span>{checkLine}</span>
    </button>
  )
  const name = profile?.name || 'Admin'
  const role = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : ''

  return (
    <div className={`ix ${collapsed ? 'nav-collapsed' : ''} ${compact ? 'compact' : ''}`}>
      <div className="ix-app">
        <div className="ix-brandcell">
          <div className="ix-logo">JDS</div>
          <div className="ix-brand-text"><b>JDS Logistics</b><small>Operations portal</small></div>
        </div>

        <header className="ix-top">
          <button type="button" className="ix-icon-btn hide-m" onClick={() => toggle(setCollapsed, 'ix_nav_collapsed')}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
            <Icon name={collapsed ? 'layout-sidebar-left-expand' : 'layout-sidebar-left-collapse'} />
          </button>
          {pageLabel && <div className="ix-crumb">{pageLabel}</div>}
          <div className="ix-search" role="button" tabIndex={0} aria-label="Search (Ctrl K)" onClick={() => setPalette(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPalette(true) } }}>
            <Icon name="search" /><span>Search jobs, BE, BL, containers, trucks, clients</span><kbd>Ctrl</kbd><kbd>K</kbd>
          </div>
          <div className="ix-top-actions">
            <button type="button" className="ix-btn primary hide-m" onClick={onCreateJob}><Icon name="plus" />Create job</button>
            <div className="ix-bell"><NotificationBell onNavigate={onBellNavigate} profile={profile} /></div>
            <MeMenu name={name} role={role} compact={compact} onCompact={() => toggle(setCompact, 'ix_compact')}
              canInstall={app.canInstall} onInstall={app.install} onLogout={onLogout} />
          </div>
        </header>

        <nav className="ix-nav" aria-label="Main menu">
          <div className="ix-nav-scroll">{navList}</div>
          {navFoot}
        </nav>
        <main className="ix-main" id="ix-main">{children}</main>

        <nav className="ix-tabbar" aria-label="Main menu">
          {[['today', 'home', 'Today'], ['jobs', 'list-details', 'Jobs'], ['trucks', 'truck', 'Trucks'], ['customs', 'file-certificate', 'BE & OOC']].map(([id, ic, l]) => (
            <button key={id} type="button" className={active === id ? 'active' : ''} onClick={() => go(id)}><Icon name={ic} />{l}</button>
          ))}
          <button type="button" onClick={() => setMnav(true)}><Icon name="menu-2" />More</button>
        </nav>
      </div>

      {mnav && (
        <>
          <div className="ix-mnav-bg" onClick={() => setMnav(false)} />
          <div className="ix-mnav">
            <div className="ix-mnav-acts">
              <button type="button" className="ix-btn primary" onClick={() => { setMnav(false); onCreateJob() }}><Icon name="plus" />Create job</button>
              <button type="button" className="ix-btn" onClick={() => { setMnav(false); setPalette(true) }}><Icon name="search" />Search</button>
            </div>
            {navList}
            {navFoot}
          </div>
        </>
      )}

      <CommandPalette open={palette} onClose={() => setPalette(false)} pages={pages} onGo={go} onOpenJob={onOpenJob}
        onLookup={sections.some((s) => s.items.some((it) => it.id === 'search')) ? (q) => {
          try { sessionStorage.setItem('ix_lookup', q) } catch { /* private mode: the page opens empty */ }
          go('search')
          window.dispatchEvent(new CustomEvent('ix-lookup', { detail: q })) // page already open
        } : null} />
    </div>
  )
}

// The avatar button: your name and role, and a menu with Compact rows, Install app
// and Log out (the density toggle moved here: on the bar it looked like a menu icon).
function MeMenu({ name, role, compact, onCompact, canInstall, onInstall, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const pick = (fn) => () => { setOpen(false); fn() }
  return (
    <div className="ix-me" ref={ref}>
      <button type="button" className="ix-me-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title={role ? `${name} · ${role}` : name}>
        <span className="ix-avatar">{initials(name)}</span>
        <span className="who"><b>{name}</b>{role && <small>{role}</small>}</span>
        <Icon name="chevron-down" />
      </button>
      {open && (
        <div className="ix-menu" role="menu">
          <div className="who"><b>{name}</b>{role && <small>{role}</small>}</div>
          <button type="button" role="menuitemcheckbox" aria-checked={compact} onClick={onCompact}>
            <Icon name="layout-rows" />Compact rows<span className={`ix-switch ${compact ? 'on' : ''}`} />
          </button>
          {canInstall && (
            <button type="button" role="menuitem" onClick={pick(onInstall)} title="Install the JDS Portal as an app on this computer (own window, Start menu and taskbar icon)">
              <Icon name="download" />Install app
            </button>
          )}
          <hr />
          <button type="button" role="menuitem" onClick={pick(onLogout)}><Icon name="logout" />Log out</button>
        </div>
      )}
    </div>
  )
}
