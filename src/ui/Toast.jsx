import { Icon } from './Icon'
import { dismissToast, useToasts } from './toast'

const ICON = { success: 'circle-check', error: 'alert-circle', warning: 'alert-triangle', info: 'info-circle', neutral: 'info-circle' }

/** Renders the toast stack. Bottom-right on desktop, bottom-centre above the tab bar on phones. */
export function Toaster() {
  const items = useToasts()
  return (
    <div className="ix-toasts" aria-live="polite" aria-relevant="additions">
      {items.map((t) => (
        <div key={t.id} className={`ix-toast ${t.tone} ${t.leaving ? 'leaving' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          <Icon name={ICON[t.tone] || ICON.neutral} />
          <span className="msg">{t.message}</span>
          {t.action && (
            <button type="button" className="ix-btn sm ghost act" onClick={() => { t.action.onClick?.(); dismissToast(t.id) }}>{t.action.label}</button>
          )}
          <button type="button" className="x" onClick={() => dismissToast(t.id)} aria-label="Dismiss"><Icon name="x" /></button>
        </div>
      ))}
    </div>
  )
}

/** Wrap the app once (main.jsx). Children render as-is; toasts render beside them. */
export function ToastProvider({ children }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
