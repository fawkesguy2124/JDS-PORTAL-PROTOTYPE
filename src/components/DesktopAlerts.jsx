import { useEffect, useState } from 'react'
import { ALERT_KINDS, ALL_KINDS, disablePush, enablePush, pushState, setPushKinds } from '../services/desktopApp'

// "Desktop alerts" at the bottom of the notifications panel (Jose, 24 Oct 2026):
// switch Windows notifications on for this computer and pick which alerts pop up.
export default function DesktopAlerts({ profile }) {
  const [state, setState] = useState(null) // { supported, permission, on, kinds }
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  useEffect(() => { pushState().then(setState).catch(() => setState({ supported: false })) }, [])
  if (!state) return null

  const run = async (work) => {
    setBusy(true); setProblem('')
    try { await work(); setState(await pushState()) } catch (e) { setProblem(e.message) }
    setBusy(false)
  }
  const kinds = state.kinds || ALL_KINDS
  const toggleKind = (id) => run(() => setPushKinds({ ...kinds, [id]: !kinds[id] }))

  const row = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#1a2233', padding: '3px 0', cursor: 'pointer' }
  return (
    <div style={{ borderTop: '0.5px solid #e4e8ef', padding: '10px 16px', background: '#fafbfd' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <i className="ti ti-device-desktop" style={{ fontSize: '16px', color: '#1a4fa0' }} aria-hidden="true" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#1a2233' }}>Desktop alerts</div>
          <div style={{ fontSize: '11px', color: '#8a96a8' }}>
            {!state.supported ? 'This browser cannot show them.'
              : state.on ? 'On for this computer: they pop up even when the portal is closed.'
              : 'Get OOC, free-day and container alerts as Windows notifications.'}
          </div>
        </div>
        {state.supported && (state.on
          ? <button type="button" onClick={() => setOpen((v) => !v)} style={linkBtn}>{open ? 'Done' : 'Choose'}</button>
          : <button type="button" disabled={busy} onClick={() => run(() => enablePush(profile))} style={mainBtn}>{busy ? 'Turning on…' : 'Turn on'}</button>)}
      </div>
      {state.on && open && (
        <div style={{ marginTop: '8px', paddingLeft: '24px' }}>
          {ALERT_KINDS.map((k) => (
            <label key={k.id} style={row}>
              <input type="checkbox" checked={!!kinds[k.id]} disabled={busy} onChange={() => toggleKind(k.id)} />
              {k.label}
            </label>
          ))}
          <button type="button" disabled={busy} onClick={() => run(disablePush)} style={{ ...linkBtn, color: '#b42318', marginTop: '6px', padding: 0 }}>
            Turn off on this computer
          </button>
        </div>
      )}
      {problem && <div style={{ marginTop: '6px', fontSize: '11px', color: '#b42318' }}>{problem}</div>}
    </div>
  )
}

const linkBtn = { fontSize: '11px', fontWeight: 600, color: '#1a4fa0', background: 'none', border: 'none', cursor: 'pointer' }
const mainBtn = { fontSize: '11px', fontWeight: 600, color: '#fff', background: '#1a4fa0', border: 'none', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }
