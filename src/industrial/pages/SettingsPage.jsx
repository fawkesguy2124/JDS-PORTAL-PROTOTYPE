import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { Button, Icon, PageHead, Panel, Segmented, Status, fmtDate, fmtTime } from '../ui'
import {
  BELL_KINDS, LANDING_PAGES, beep, clearSavedData, resetPrefs, usePrefs,
} from '../settings'
import {
  ALERT_KINDS, ALL_KINDS, disablePush, enablePush, pushState, runningAsApp, setPushKinds, showTestAlert, useInstallApp,
} from '../../services/desktopApp'
import { askConfirm } from '../confirm'
import '../styles/settings.css'

// Settings (Jose, 31 Oct 2026: "dark mode and stuff like that"). Everything here is
// saved on this computer the moment it changes (settings.js); the password and the
// desktop alerts are the only things that go to the server.
// Desktop: a list of sections on the left, one shown at a time. Phone: all stacked.
const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'startup', label: 'Start-up & formats', icon: 'clock' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'account', label: 'Account', icon: 'user-circle' },
  { id: 'app', label: 'App & data', icon: 'device-desktop' },
]

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match my computer' },
]

// the shortcuts the portal really has (Ctrl K in Shell, the rest on All jobs,
// the job panel and a container's panel)
const SHORTCUTS = [
  [['Ctrl', 'K'], 'Search jobs, BE, BL, containers, trucks and pages, from any page'],
  [['↑', '↓', 'Enter'], 'Move through the search results and open one'],
  [['/'], 'Jump to the search box on All jobs'],
  [['J', 'K'], 'Next / previous job on All jobs, in the job panel and in a container’s panel'],
  [['Enter'], 'Open the highlighted job on All jobs'],
  [['←', '→'], 'Previous / next container in a container’s panel'],
  [['Esc'], 'Close the search box, a panel, a menu or a full-screen map'],
]

const ROLE_NAMES = { admin: 'Admin', employee: 'Employee', field_ops: 'Field ops' }

export default function SettingsPage({ profile, user, showToast, onLogout, onRefresh }) {
  const [prefs, setPref] = usePrefs()
  const [sec, setSec] = useState(() => {
    const s = new URLSearchParams(window.location.search).get('sec')
    return SECTIONS.some((x) => x.id === s) ? s : 'appearance'
  })
  const saved = (msg = 'Saved') => showToast?.(msg, 'success')
  const save = (key, value) => { setPref(key, value); saved() }
  const reset = () => { resetPrefs(); saved('Settings back to the defaults') }

  return (
    <>
      <PageHead title="Settings" sub="Saved on this computer as soon as you change them"
        actions={<Button variant="ghost" icon="restore" onClick={reset}>Reset to defaults</Button>} />
      <div className="set-wrap">
        <nav className="set-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={sec === s.id ? 'on' : ''} aria-current={sec === s.id ? 'true' : undefined} onClick={() => setSec(s.id)}>
              <Icon name={s.icon} />{s.label}
            </button>
          ))}
        </nav>
        <div className="set-body">
          <Panel title="Appearance" className={`set-sec${sec === 'appearance' ? ' on' : ''}`}>
            <Appearance prefs={prefs} save={save} />
          </Panel>
          <Panel title="Start-up & formats" className={`set-sec${sec === 'startup' ? ' on' : ''}`}>
            <Startup prefs={prefs} save={save} />
          </Panel>
          <Panel title="Notifications" className={`set-sec${sec === 'notifications' ? ' on' : ''}`}>
            <Notifications prefs={prefs} save={save} profile={profile} showToast={showToast} />
          </Panel>
          <Panel title="Account" className={`set-sec${sec === 'account' ? ' on' : ''}`}>
            <Account profile={profile} user={user} showToast={showToast} onLogout={onLogout} />
          </Panel>
          <Panel title="App & data" className={`set-sec${sec === 'app' ? ' on' : ''}`}>
            <AppData showToast={showToast} onRefresh={onRefresh} />
          </Panel>
        </div>
      </div>
    </>
  )
}

// One setting: its name and a one-line help on the left, the control on the right
// (below on a phone). block = the control takes the full width under the text.
function Row({ label, help, id, block, children }) {
  return (
    <div className={`set-row${block ? ' block' : ''}`}>
      <div className="set-l">
        {id ? <label htmlFor={id}>{label}</label> : <b>{label}</b>}
        {help && <p>{help}</p>}
      </div>
      {children !== undefined && <div className="set-c">{children}</div>}
    </div>
  )
}

function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="set-switch" onClick={() => onChange(!on)}>
      <span className={`ix-switch ${on ? 'on' : ''}`} />
    </button>
  )
}

// a small drawing of the portal in each theme (sidebar, canvas, a panel)
function Preview({ theme }) {
  const draw = () => <><i className="nav" /><i className="card" /></>
  if (theme === 'system') {
    return (
      <span className="set-prev system" aria-hidden="true">
        <span className="half light">{draw()}</span>
        <span className="half dark">{draw()}</span>
      </span>
    )
  }
  return <span className={`set-prev ${theme}`} aria-hidden="true">{draw()}</span>
}

function Appearance({ prefs, save }) {
  return (
    <>
      <Row label="Theme" help="Dark is easier on the eyes at night. “Match my computer” follows the Windows setting." block>
        <div className="set-theme" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.value} type="button" role="radio" aria-checked={prefs.theme === t.value}
              className={`set-theme-opt${prefs.theme === t.value ? ' on' : ''}`} onClick={() => save('theme', t.value)}>
              <Preview theme={t.value} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </Row>
      <Row label="Rows" help="Compact fits more jobs on the screen. Also in your menu at the top right.">
        <Segmented label="Rows" value={prefs.density} onChange={(v) => save('density', v)}
          options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
      </Row>
      <Row label="Text size" help="Makes all the text in the portal smaller or larger.">
        <Segmented label="Text size" value={prefs.text} onChange={(v) => save('text', v)}
          options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Normal' }, { value: 'lg', label: 'Large' }]} />
      </Row>
      <Row label="Reduce motion" help="Turns off sliding and fading: panels and menus appear at once.">
        <Switch label="Reduce motion" on={prefs.motion === 'reduce'} onChange={(on) => save('motion', on ? 'reduce' : 'full')} />
      </Row>
      <Row label="Start with the menu collapsed" help="The menu on the left shows only icons. The button at the top left of the bar switches it too.">
        <Switch label="Start with the menu collapsed" on={prefs.navCollapsed} onChange={(on) => save('navCollapsed', on)} />
      </Row>
    </>
  )
}

function Startup({ prefs, save }) {
  const now = fmtTime(new Date().toISOString())
  return (
    <>
      <Row label="Open this page after login" help="The page the portal opens on when you sign in or open the app." id="set-landing">
        <select id="set-landing" className="set-select" value={prefs.landing} onChange={(e) => save('landing', e.target.value)}>
          {LANDING_PAGES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </Row>
      <Row label="Time format" help={<>Every time in the portal (Indian time). Now: <b className="num">{now}</b></>}>
        <Segmented label="Time format" value={prefs.timeFormat} onChange={(v) => save('timeFormat', v)}
          options={[{ value: '24h', label: '24-hour' }, { value: '12h', label: '12-hour' }]} />
      </Row>
      <Row label="Today page starts on" help="Which jobs the Today page shows first. Changing it on the Today page changes it here too.">
        <Segmented label="Job type" value={prefs.todayType} onChange={(v) => save('todayType', v)}
          options={[{ value: 'all', label: 'All' }, { value: 'import', label: 'Import' }, { value: 'export', label: 'Export' }]} />
        <Segmented label="Whose jobs" value={prefs.todayScope} onChange={(v) => save('todayScope', v)}
          options={[{ value: 'everyone', label: 'Everyone' }, { value: 'mine', label: 'My jobs' }]} />
      </Row>
    </>
  )
}

function Notifications({ prefs, save, profile, showToast }) {
  const muted = prefs.bellMuted
  const toggleKind = (id) => save('bellMuted', muted.includes(id) ? muted.filter((x) => x !== id) : [...muted, id])
  return (
    <>
      <DesktopAlerts profile={profile} showToast={showToast} />
      <Row label="Bell: which updates to show" help="Unticked kinds are left out of the bell’s list and its count. Nothing is deleted." block>
        <div className="set-checks">
          {BELL_KINDS.map((k) => (
            <label key={k.id}>
              <input type="checkbox" checked={!muted.includes(k.id)} onChange={() => toggleKind(k.id)} />
              {k.label}
            </label>
          ))}
        </div>
      </Row>
      <Row label="Play a sound for new updates" help="A short beep when a new update reaches the bell while the portal is open.">
        <Button size="sm" variant="ghost" icon="volume" onClick={beep}>Hear it</Button>
        <Switch label="Play a sound for new updates" on={prefs.bellSound} onChange={(on) => { save('bellSound', on); if (on) beep() }} />
      </Row>
    </>
  )
}

// Desktop alerts on this computer: the same switch as at the bottom of the bell
// (services/desktopApp.js), with the browser's real state
function DesktopAlerts({ profile, showToast }) {
  const [st, setSt] = useState(null) // null while checking; { supported, permission, on, kinds }
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    let live = true
    // a copy of the portal without its background worker never answers: say so after 5 s
    const t = setTimeout(() => { if (live) setSt((s) => s || { supported: false, noWorker: true }) }, 5000)
    pushState().then((s) => { if (live) setSt(s) }).catch(() => { if (live) setSt({ supported: false }) })
    return () => { live = false; clearTimeout(t) }
  }, [])

  const run = async (work, done) => {
    setBusy(true); setProblem('')
    try {
      await work()
      setSt(await pushState())
      if (done) showToast?.(done, 'success')
    } catch (e) { setProblem(e?.message || 'That did not work. Try again.') }
    setBusy(false)
  }
  const kinds = st?.kinds || ALL_KINDS
  const blocked = st?.supported && st.permission === 'denied'

  let status
  if (!st) status = <Status tone="grey">Checking…</Status>
  else if (!st.supported) status = <Status tone="grey">Not available here</Status>
  else if (blocked) status = <Status tone="red">Blocked by the browser</Status>
  else if (st.on) status = <Status tone="teal">On for this computer</Status>
  else status = <Status tone="grey">Off</Status>

  const help = !st ? 'Windows notifications for OOC, free days, containers and trucks, even when the portal is closed.'
    : !st.supported ? (st.noWorker
      ? 'This copy of the portal cannot show them. Open the published portal in Chrome or Edge, or the installed app.'
      : 'This browser cannot show desktop alerts. Use Chrome or Edge.')
    : st.on ? 'They pop up even when the portal is closed. Each computer is switched on separately.'
    : 'Windows notifications for OOC, free days, containers and trucks, even when the portal is closed.'

  return (
    <>
      <Row label="Desktop alerts on this computer" help={help}>
        {status}
        {st?.supported && !blocked && (st.on
          ? <Button size="sm" disabled={busy} onClick={() => run(disablePush, 'Desktop alerts off for this computer')}>Turn off</Button>
          : <Button size="sm" icon="bell-ringing" disabled={busy} onClick={() => run(() => enablePush(profile), 'Desktop alerts on for this computer')}>{busy ? 'Turning on…' : 'Turn on'}</Button>)}
        {blocked && <Button size="sm" variant="ghost" icon="refresh" disabled={busy} onClick={() => run(async () => {})}>Check again</Button>}
      </Row>
      {blocked && (
        <div className="set-note">
          <Icon name="lock" />
          <div>
            <b>To unblock:</b> click the lock icon left of the address bar, open <b>Site settings</b>, set <b>Notifications</b> to <b>Allow</b>,
            then reload this page and press Turn on. In the installed app the same menu is under the <b>⋯</b> button at the top.
            If they still do not appear, check <b>Windows Settings → System → Notifications</b>.
          </div>
        </div>
      )}
      {problem && <div className="set-err" role="alert">{problem}</div>}
      {st?.on && (
        <>
          <Row label="Which desktop alerts" help="Pick the kinds that pop up on this computer." block>
            <div className="set-checks">
              {ALERT_KINDS.map((k) => (
                <label key={k.id}>
                  <input type="checkbox" checked={!!kinds[k.id]} disabled={busy} onChange={() => run(() => setPushKinds({ ...kinds, [k.id]: !kinds[k.id] }), 'Saved')} />
                  {k.label}
                </label>
              ))}
            </div>
          </Row>
          {st.permission === 'granted' && (
            <Row label="Send a test alert" help="Shows one on this computer now, so you can see what they look like. Nobody else gets it.">
              <Button size="sm" icon="send" disabled={busy} onClick={() => run(showTestAlert, 'Test alert sent to this computer')}>Send a test alert</Button>
            </Row>
          )}
        </>
      )}
    </>
  )
}

function Account({ profile, user, showToast, onLogout }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const role = profile?.role ? (ROLE_NAMES[profile.role] || profile.role.charAt(0).toUpperCase() + profile.role.slice(1).replace(/_/g, ' ')) : null

  const changePassword = async (e) => {
    e.preventDefault()
    setProblem('')
    if (pw.length < 8) { setProblem('Use at least 8 characters.'); return }
    if (pw !== pw2) { setProblem('The two passwords are not the same.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) { setProblem(error.message || 'The password was not changed. Try again.'); return }
    setPw(''); setPw2('')
    showToast?.('Password changed', 'success')
  }

  return (
    <>
      <Row label="Name">{profile?.name ? <span className="set-val">{profile.name}</span> : <span className="set-val muted">—</span>}</Row>
      <Row label="Email">{user?.email ? <span className="set-val">{user.email}</span> : <span className="set-val muted">—</span>}</Row>
      <Row label="Role" help="Set by the admin. It decides which pages and updates you see.">{role ? <span className="set-val">{role}</span> : <span className="set-val muted">—</span>}</Row>
      <Row label="Change password" help="At least 8 characters. You stay signed in on this computer." block>
        <form className="set-pw" onSubmit={changePassword}>
          {/* for password managers: whose password this is */}
          <input type="email" name="username" autoComplete="username" value={user?.email || ''} readOnly hidden />
          <input className="set-input" type="password" name="new-password" autoComplete="new-password" placeholder="New password"
            aria-label="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input className="set-input" type="password" name="confirm-password" autoComplete="new-password" placeholder="Type it again"
            aria-label="Type the new password again" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          <Button type="submit" variant="primary" disabled={busy || !pw || !pw2}>{busy ? 'Saving…' : 'Save password'}</Button>
        </form>
        {problem && <div className="set-err" role="alert">{problem}</div>}
      </Row>
      <Row label="Sign out" help="Signs you out of the portal on this computer.">
        <Button size="sm" icon="logout" onClick={onLogout}>Sign out</Button>
      </Row>
    </>
  )
}

// the build's version when the build gives one; otherwise the day this copy was loaded
// (__BUILD_DATE__ only exists if vite.config defines it)
/* global __BUILD_DATE__ */
function versionInfo() {
  const env = import.meta.env || {}
  const sha = env.VITE_VERCEL_GIT_COMMIT_SHA ? String(env.VITE_VERCEL_GIT_COMMIT_SHA).slice(0, 7) : ''
  const built = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : null
  return {
    version: env.VITE_APP_VERSION || sha || (env.DEV ? 'Development copy' : null),
    date: built ? `Built ${fmtDate(built)}` : `Loaded ${fmtDate(new Date(performance.timeOrigin || Date.now()).toISOString())}`,
  }
}

function AppData({ showToast, onRefresh }) {
  const app = useInstallApp()
  const [busy, setBusy] = useState(false)
  const info = versionInfo()

  const reload = async () => {
    setBusy(true)
    try { await onRefresh?.(); showToast?.('Fresh data loaded', 'success') } catch { showToast?.('Could not reload the data. Try again.', 'error') }
    setBusy(false)
  }
  const clear = async () => {
    if (!(await askConfirm({ title: 'Clear the portal’s saved data on this computer?', text: 'Your settings go back to the defaults and saved lists (recent jobs, page choices) are emptied. You stay signed in.', ok: 'Clear', danger: true }))) return
    clearSavedData()
    window.location.replace('/admin?tab=settings')
  }
  const install = async () => {
    if (await app.install()) showToast?.('Installed: find JDS Portal in the Start menu', 'success')
  }

  return (
    <>
      <Row label="Install as a desktop app" help={app.asApp ? 'You are using the installed app now.'
        : app.canInstall ? 'Opens in its own window, with the JDS icon in the Start menu and taskbar.'
        : 'Open the portal in Chrome or Edge on a computer; the install button appears here when the browser offers it.'}>
        {app.asApp ? <Status tone="teal">Installed</Status>
          : app.canInstall ? <Button size="sm" icon="download" onClick={install}>Install app</Button>
          : <Status tone="grey">Not offered here</Status>}
      </Row>
      <Row label="Reload fresh data" help="Loads every job, container and truck again from the server.">
        <Button size="sm" icon="refresh" disabled={busy} onClick={reload}>{busy ? 'Loading…' : 'Reload data'}</Button>
      </Row>
      <Row label="Clear saved data on this computer" help="Empties the portal’s saved lists and settings in this browser. You stay signed in.">
        <Button size="sm" variant="danger" icon="eraser" onClick={clear}>Clear saved data</Button>
      </Row>
      <Row label="Keyboard shortcuts" block>
        <dl className="set-keys">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={what}>
              <dt>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </Row>
      <Row label="About" help={`JDS Logistics operations portal · ${runningAsApp() ? 'desktop app' : 'browser'}`}>
        <span className="set-val">{info.version ? <><span className="mono">{info.version}</span> · </> : null}{info.date}</span>
      </Row>
    </>
  )
}
