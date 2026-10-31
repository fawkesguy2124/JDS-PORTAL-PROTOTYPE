import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { focusables, lockScroll, pushLayer, trapTab } from './hooks'
import { cx } from './utils'

const EXIT_MS = 200

// Keeps the overlay mounted while its exit animation plays. Layout effects, so
// a close timer is always cancelled in the same commit that reopens it.
function usePresence(open) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  const openRef = useRef(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setMounted(true)
  }
  useLayoutEffect(() => {
    openRef.current = open
    let raf2 = 0
    if (open) {
      const raf = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setShown(true)) })
      return () => { cancelAnimationFrame(raf); cancelAnimationFrame(raf2) }
    }
    const t = setTimeout(() => {
      if (openRef.current) return
      setShown(false)
      setMounted(false)
    }, EXIT_MS)
    return () => clearTimeout(t)
  }, [open])
  return { mounted: mounted || open, state: open && shown ? 'open' : 'closed' }
}

// Esc, focus trap + return, scroll lock, only for the top-most overlay.
function useDialogBehaviour(open, panelRef, { onClose, closeOnEsc, initialFocus }) {
  const close = useEffectEvent(() => onClose?.())
  const canEsc = useEffectEvent(() => closeOnEsc)
  const focusFirst = useEffectEvent(() => {
    const panel = panelRef.current
    if (!panel) return
    const target = (initialFocus && initialFocus.current) || panel.querySelector('[data-autofocus]') || focusables(panel.querySelector('.ix-modal-body, .ix-drawer-body') || panel)[0]
    ;(target || panel).focus({ preventScroll: true })
  })
  useEffect(() => {
    if (!open) return undefined
    const prev = document.activeElement
    const unlock = lockScroll()
    const layer = pushLayer(Symbol('dialog'))
    const raf = requestAnimationFrame(focusFirst)
    const onKey = (e) => {
      if (!layer.isTop()) return
      if (e.key === 'Escape' && canEsc()) { e.preventDefault(); e.stopPropagation(); close() }
      else if (e.key === 'Tab') trapTab(e, panelRef.current)
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey, true)
      layer.release()
      unlock()
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus({ preventScroll: true })
    }
  }, [open, panelRef])
}

/**
 * <Modal open={open} onClose={close} title="Delete job" description="…" footer={<>…buttons…</>} size="sm|md|lg">
 * Centred dialog (560 / 720 / 960 px) on desktop, bottom sheet on phones.
 * role="dialog", aria-modal, Esc closes, focus trapped and returned, page
 * scroll locked. `dismissible={false}` (e.g. a dirty form) stops the backdrop
 * and Esc from closing it. Mark the field to focus first with data-autofocus,
 * or pass `initialFocus` (a ref).
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'sm', dismissible = true, hideClose = false, initialFocus, className, labelledBy }) {
  const { mounted, state } = usePresence(open)
  const panelRef = useRef(null)
  const titleId = useId()
  const descId = useId()
  useDialogBehaviour(open, panelRef, { onClose, closeOnEsc: dismissible, initialFocus })
  if (!mounted) return null
  return createPortal(
    <div className="ix-overlay" data-state={state} onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose?.() }}>
      <div ref={panelRef} className={cx('ix-modal', size !== 'sm' && size, className)} role="dialog" aria-modal="true" tabIndex={-1}
        aria-labelledby={labelledBy || (title ? titleId : undefined)} aria-describedby={description ? descId : undefined}>
        <span className="ix-modal-grab" aria-hidden="true" />
        {(title || !hideClose) && (
          <div className="ix-modal-head">
            <div style={{ minWidth: 0 }}>
              {title && <h2 id={titleId}>{title}</h2>}
              {description && <p id={descId}>{description}</p>}
            </div>
            {!hideClose && <button type="button" className="ix-icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>}
          </div>
        )}
        <div className="ix-modal-body">{children}</div>
        {footer && <div className="ix-modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/**
 * <Drawer open={open} onClose={close} title="J-701" description="…" footer={…} side="right|left" width={560}>
 * Slides in from the side on desktop (min(width, 100vw)); full screen on
 * phones. Same dialog behaviour as Modal. `header` replaces the default
 * title row; `bodyClassName` styles the scrolling body.
 */
export function Drawer({ open, onClose, title, description, children, footer, header, side = 'right', width = 560, dismissible = true, initialFocus, className, bodyClassName, label }) {
  const { mounted, state } = usePresence(open)
  const panelRef = useRef(null)
  const titleId = useId()
  useDialogBehaviour(open, panelRef, { onClose, closeOnEsc: dismissible, initialFocus })
  if (!mounted) return null
  return createPortal(
    <div className="ix-overlay drawer-overlay" data-state={state} onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose?.() }}>
      <aside ref={panelRef} className={cx('ix-drawer', side === 'left' && 'left', className)} role="dialog" aria-modal="true" tabIndex={-1}
        aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : label}
        style={{ width: `min(${typeof width === 'number' ? `${width}px` : width}, 100vw)` }}>
        {header ?? (
          <div className="ix-drawer-head">
            <div style={{ minWidth: 0, flex: 1 }}>
              {title && <h2 id={titleId}>{title}</h2>}
              {description && <p>{description}</p>}
            </div>
            <button type="button" className="ix-icon-btn close" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
        )}
        <div className={cx('ix-drawer-body', bodyClassName)}>{children}</div>
        {footer && <div className="ix-drawer-foot">{footer}</div>}
      </aside>
    </div>,
    document.body,
  )
}
