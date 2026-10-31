import { Suspense, lazy, useEffect, useEffectEvent, useRef } from 'react'
import { lockScroll, pushLayer, trapTab } from '../ui/hooks'
import { useInstallApp } from '../services/desktopApp'
import { initials } from '../ui/utils'

// push alerts on/off for this computer (renders nothing where unsupported)
const DesktopAlerts = lazy(() => import('../components/DesktopAlerts'))

const P = {
  team: 'M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1a3 3 0 0 0-2.5-3M17 5.2a3 3 0 0 1 0 5.6M4 19v-1a3 3 0 0 1 2.5-3M7 5.2a3 3 0 0 0 0 5.6',
  bot: 'M5 18l-1 3 4-2h9a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v8M9 11h.01M15 11h.01',
  health: 'M3 12h4l3-7 4 14 3-7h4',
  lookup: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-3.5-3.5M8.5 11h5M11 8.5v5',
  classic: 'M4 5h16v14H4zM9 5v14',
  install: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  out: 'M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2M10 12h10M17 9l3 3-3 3',
}
const Ico = ({ d }) => <svg className="pt-i" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

const ROLE = { admin: 'Admin', employee: 'Office', field_ops: 'Field' }
const MANAGE = [['overview', 'Team & stages', P.team], ['bot', 'WhatsApp bot', P.bot], ['health', 'System health', P.health], ['search', 'ULIP lookup', P.lookup]]

// The avatar menu: who is signed in, Manage (admins), Classic view, theme,
// install / desktop alerts, log out. Popover under the avatar on a desktop,
// bottom sheet on a phone.
export default function UserMenu({ open, anchor, layout, profile, perms, theme, onTheme, onClose, onManage, onClassic, onLogout }) {
  const boxRef = useRef(null)
  const app = useInstallApp()

  const close = useEffectEvent(() => onClose())
  useEffect(() => {
    if (!open) return undefined
    const prev = document.activeElement
    const unlock = lockScroll()
    const layer = pushLayer(Symbol('pt-menu'))
    const raf = requestAnimationFrame(() => boxRef.current?.querySelector('button')?.focus({ preventScroll: true }))
    const onKey = (e) => {
      if (!layer.isTop()) return
      if (e.key === 'Escape') { e.preventDefault(); close() }
      else if (e.key === 'Tab') trapTab(e, boxRef.current)
    }
    // desktop popover: a click outside closes it (the phone sheet has the scrim)
    const onDown = (e) => {
      if (!layer.isTop() || boxRef.current?.contains(e.target) || e.target.closest?.('[data-pt-avatar]')) return
      close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
      layer.release()
      unlock()
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus({ preventScroll: true })
    }
  }, [open])

  const style = layout === 'd' && anchor ? { top: anchor.top, left: anchor.left } : undefined
  const name = profile?.name || 'Signed in'

  return (
    <div ref={boxRef} className={`pt-menu${open ? ' on' : ''}`} style={style} role="dialog" aria-modal="true" aria-label="Your menu" inert={open ? undefined : true}>
      <div className="pt-menu-who">
        <span className="pt-av" aria-hidden="true">{initials(profile?.name)}</span>
        <span><b>{name}</b><small>{ROLE[profile?.role] || 'Signed in'}</small></span>
      </div>
      {perms.canManage && (
        <>
          <div className="pt-menu-sep" />
          <div className="pt-menu-h" id="pt-menu-manage">Manage</div>
          <div role="group" aria-labelledby="pt-menu-manage">
            {MANAGE.map(([id, label, d]) => (
              <button key={id} type="button" className="pt-mi" onClick={() => onManage(id)}><Ico d={d} />{label}</button>
            ))}
          </div>
        </>
      )}
      <div className="pt-menu-sep" />
      <button type="button" className="pt-mi" onClick={onClassic}><Ico d={P.classic} />Classic view</button>
      {app.canInstall && <button type="button" className="pt-mi" onClick={() => { onClose(); app.install() }}><Ico d={P.install} />Install app</button>}
      <div className="pt-menu-h" id="pt-menu-theme">Theme</div>
      <div className="pt-seg" role="group" aria-labelledby="pt-menu-theme">
        {[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={theme === id} onClick={() => onTheme(id)}>{label}</button>
        ))}
      </div>
      {open && (
        <div className="pt-menu-alerts ix">
          <Suspense fallback={null}><DesktopAlerts profile={profile} /></Suspense>
        </div>
      )}
      <div className="pt-menu-sep" />
      <button type="button" className="pt-mi danger" onClick={onLogout}><Ico d={P.out} />Log out</button>
    </div>
  )
}
