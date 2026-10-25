import { useEffect, useState } from 'react'
import NotificationBell from '../components/NotificationBell'
import CommandPalette from './CommandPalette'
import { Icon, initials } from './ui'
import { useInstallApp } from '../services/desktopApp'

// The frame around every page: top bar (search, create, bell, user),
// the left menu (collapsible), and a bottom tab bar on phones.
export default function Shell({ sections, active, counts = {}, onGo, onOpenJob, onCreateJob, onLogout, profile, onBellNavigate, children }) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('ix_nav_collapsed') === '1' } catch { return false } })
  const [compact, setCompact] = useState(() => { try { return localStorage.getItem('ix_compact') === '1' } catch { return false } })
  const [palette, setPalette] = useState(false)
  const [mnav, setMnav] = useState(false)
  const app = useInstallApp() // the portal as a desktop app

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const toggle = (setter, key) => setter((v) => { try { localStorage.setItem(key, v ? '0' : '1') } catch { /* private mode */ } return !v })

  const pages = sections.flatMap((s) => s.items).filter((it) => !it.hidden)
  const go = (id) => { setMnav(false); onGo(id) }
  const navList = (
    sections.map((s) => (
      <div key={s.label}>
        <div className="ix-nav-label">{s.label}</div>
        {s.items.filter((it) => !it.hidden).map((it) => {
          const n = counts[it.id]
          return (
            <button key={it.id} type="button" className={`ix-nav-item ${active === it.id ? 'active' : ''}`} onClick={() => go(it.id)} title={it.label}>
              <Icon name={it.icon} /><span>{it.label}</span>
              {n ? <span className={`count ${it.alert ? 'red' : ''}`}>{n}</span> : null}
            </button>
          )
        })}
      </div>
    ))
  )
  const name = profile?.name || 'Admin'

  return (
    <div className={`ix ${collapsed ? 'nav-collapsed' : ''} ${compact ? 'compact' : ''}`}>
      <div className="ix-app">
        <header className="ix-top">
          <div className="ix-brand">
            <button type="button" className="ix-icon-btn hide-m" onClick={() => toggle(setCollapsed, 'ix_nav_collapsed')} aria-label="Collapse menu" title="Collapse menu">
              <Icon name={collapsed ? 'layout-sidebar-left-expand' : 'layout-sidebar-left-collapse'} />
            </button>
            <div className="ix-logo">JDS</div>
            <div className="ix-brand-text"><b>JDS Logistics</b><small>Operations portal</small></div>
          </div>
          <div className="ix-search" role="button" tabIndex={0} onClick={() => setPalette(true)} onKeyDown={(e) => e.key === 'Enter' && setPalette(true)}>
            <Icon name="search" /><span>Search jobs, BE, container, truck, client…</span><kbd>Ctrl K</kbd>
          </div>
          <div className="ix-top-actions">
            {app.canInstall && (
              <button type="button" className="ix-btn hide-m" onClick={app.install} title="Install the JDS Portal as an app on this computer (own window, Start menu and taskbar icon)">
                <Icon name="download" />Install app
              </button>
            )}
            <button type="button" className="ix-btn primary hide-m" onClick={onCreateJob}><Icon name="plus" />Create job</button>
            <NotificationBell onNavigate={onBellNavigate} profile={profile} />
            <button type="button" className="ix-icon-btn hide-m" onClick={() => toggle(setCompact, 'ix_compact')} title={compact ? 'Comfortable rows' : 'Compact rows'}>
              <Icon name={compact ? 'baseline-density-medium' : 'baseline-density-small'} />
            </button>
            <div className="ix-avatar" title={`${name} · ${profile?.role || ''}`}>{initials(name)}</div>
            <button type="button" className="ix-icon-btn" onClick={onLogout} title="Log out" aria-label="Log out"><Icon name="logout" /></button>
          </div>
        </header>

        <nav className="ix-nav" aria-label="Main menu">{navList}</nav>
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
            <button type="button" className="ix-btn primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={() => { setMnav(false); onCreateJob() }}><Icon name="plus" />Create job</button>
            <button type="button" className="ix-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setMnav(false); setPalette(true) }}><Icon name="search" />Search</button>
            {navList}
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
