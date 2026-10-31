import { useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'
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

  return (
    <div className="ix-bell-foot">
      <div className="row">
        <Icon name="device-desktop" className="lead" />
        <div className="txt">
          <div className="t">Desktop alerts</div>
          <div className="s">
            {!state.supported ? 'This browser cannot show them.'
              : state.on ? 'On for this computer: they pop up even when the portal is closed.'
              : 'Get OOC, free-day and container alerts as Windows notifications.'}
          </div>
        </div>
        {state.supported && (state.on
          ? <button type="button" className="ix-btn sm ghost" onClick={() => setOpen((v) => !v)}>{open ? 'Done' : 'Choose'}</button>
          : <button type="button" className="ix-btn sm primary" disabled={busy} onClick={() => run(() => enablePush(profile))}>{busy ? 'Turning on…' : 'Turn on'}</button>)}
      </div>
      {state.on && open && (
        <div className="kinds">
          {ALERT_KINDS.map((k) => (
            <label key={k.id} className="ix-check">
              <input type="checkbox" checked={!!kinds[k.id]} disabled={busy} onChange={() => toggleKind(k.id)} />
              {k.label}
            </label>
          ))}
          <button type="button" className="ix-link danger" disabled={busy} onClick={() => run(disablePush)}>
            Turn off on this computer
          </button>
        </div>
      )}
      {problem && <div className="ix-field-error">{problem}</div>}
    </div>
  )
}
