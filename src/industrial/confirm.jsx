/* eslint-disable react-refresh/only-export-components -- askConfirm and its host live together */
import { useEffect, useSyncExternalStore } from 'react'
import { Button, Icon } from './ui'

// The portal's own "Are you sure?" box, instead of the browser's confirm() pop-up
// (Jose, 1 Nov 2026: "Delete job is not working"; the app's browser pane, and some
// installed-app windows, block confirm() and answer No without showing anything).
//   if (!(await askConfirm({ title: 'Delete J-1000?', text: 'This cannot be undone.', ok: 'Delete job', danger: true }))) return
// <ConfirmHost /> is mounted once by the Shell; on a screen without it, the browser's
// confirm() is used as before.
const store = { ask: null, subs: new Set(), hosts: 0 }
const tell = () => store.subs.forEach((fn) => fn())
const subscribe = (fn) => { store.subs.add(fn); return () => { store.subs.delete(fn) } }

export function askConfirm({ title, text = '', ok = 'OK', danger = false }) {
  if (!store.hosts) return Promise.resolve(window.confirm([title, text].filter(Boolean).join('\n\n')))
  // a second question replaces an open one (the first counts as No)
  store.ask?.resolve(false)
  return new Promise((resolve) => {
    store.ask = { title, text, ok, danger, resolve }
    tell()
  })
}

const answer = (yes) => {
  const a = store.ask
  store.ask = null
  tell()
  a?.resolve(yes)
}

export function ConfirmHost() {
  const ask = useSyncExternalStore(subscribe, () => store.ask)
  useEffect(() => { store.hosts += 1; return () => { store.hosts -= 1; answer(false) } }, [])
  useEffect(() => {
    if (!ask) return undefined
    const onKey = (e) => {
      // Esc = Cancel; Enter = the main button, except for a delete (a click only)
      if (e.key === 'Escape') { e.stopPropagation(); answer(false) }
      else if (e.key === 'Enter' && !ask.danger) { e.preventDefault(); e.stopPropagation(); answer(true) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ask])
  if (!ask) return null
  return (
    <div className="ix-modal-bg ix-confirm-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) answer(false) }}>
      <div className="ix-modal ix-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ix-confirm-t">
        <div className="bd">
          <span className={`ic${ask.danger ? ' red' : ''}`}><Icon name={ask.danger ? 'alert-triangle' : 'help-circle'} /></span>
          <div>
            <b id="ix-confirm-t">{ask.title}</b>
            {ask.text && <p>{ask.text}</p>}
          </div>
        </div>
        <div className="ft">
          <Button onClick={() => answer(false)}>Cancel</Button>
          <Button variant={ask.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>
            {ask.ok}
          </Button>
        </div>
      </div>
    </div>
  )
}
