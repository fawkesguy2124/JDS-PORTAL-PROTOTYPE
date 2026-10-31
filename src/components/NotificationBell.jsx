import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabase'
import { alertUrl } from '../../supabase/functions/_shared/portal/alertLinks.js'
import DesktopAlerts from './DesktopAlerts'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/Button'
import { pushLayer, trapTab, useIsPhone } from '../ui/hooks'

const getStorageKey = (userId) => `jds_notif_last_seen_${userId || 'unknown'}`

function formatNotifTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const notifDay = new Date(d)
  notifDay.setHours(0, 0, 0, 0)

  // 24-hour times, "14:05" (docs/DESIGN.md Writing)
  const timeStr = d.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone: 'Asia/Kolkata'
  })

  if (notifDay.getTime() === today.getTime()) {
    return timeStr
  }
  if (notifDay.getTime() === yesterday.getTime()) {
    return `Yesterday, ${timeStr}`
  }
  const dateStr = d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata'
  })
  return `${dateStr}, ${timeStr}`
}

function groupByDay(notifications) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const groups = { Today: [], Yesterday: [], Earlier: [] }
  notifications.forEach(n => {
    const d = new Date(n.created_at)
    d.setHours(0, 0, 0, 0)
    if (d.getTime() === today.getTime()) groups.Today.push(n)
    else if (d.getTime() === yesterday.getTime()) groups.Yesterday.push(n)
    else groups.Earlier.push(n)
  })
  const sortDesc = (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  groups.Today.sort(sortDesc)
  groups.Yesterday.sort(sortDesc)
  groups.Earlier.sort(sortDesc)
  return groups
}

// "ooc_granted" → "OOC granted" (sentence case, freight acronyms kept)
const ACRONYMS = { ooc: 'OOC', be: 'BE', sb: 'SB', leo: 'LEO', igm: 'IGM', eta: 'ETA', ulip: 'ULIP', ldb: 'LDB', bl: 'BL', cfs: 'CFS' }
const typeLabel = (t) => {
  const words = String(t || 'update').split('_').map((w) => ACRONYMS[w] || w)
  return words.map((w, i) => (i === 0 && w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')
}

const ROLE_FILTERS = {
  admin:     null,
  field_ops: ['container_update', 'detention_alert', 'ooc_granted', 'ship_arrived', 'eta_changed', 'air_igm', 'truck_stuck', 'truck_papers', 'be_stage'],
  employee:  ['container_update', 'detention_alert', 'job_created', 'stage_update', 'document_upload', 'ooc_granted', 'ship_arrived', 'eta_changed', 'air_igm', 'truck_stuck', 'truck_papers', 'be_stage'],
}

export default function NotificationBell({ onNavigate, profile }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [filter, setFilter] = useState('all')
  const [lastSeen, setLastSeen] = useState(null)
  const dropdownRef = useRef(null)
  const bellRef = useRef(null)
  const headRef = useRef(null)
  const isPhone = useIsPhone() // a modal bottom sheet on phones, a popover otherwise

  // Load lastSeen after profile is available
  useEffect(() => {
    if (profile?.id) {
      const stored = localStorage.getItem(getStorageKey(profile.id))
      setLastSeen(stored || null)
    }
  }, [profile?.id])

  useEffect(() => {
    const load = async () => {
      const allowedTypes = ROLE_FILTERS[profile?.role] ?? ['container_update', 'detention_alert', 'ooc_granted', 'ship_arrived']
      let query = supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (profile?.role !== 'admin') {
        query = query.in('type', allowedTypes)
      }
      const { data } = await query
      if (data) setNotifications(data)
    }
    load()

    const channel = supabase
      .channel('activity_log_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, payload => {
        const allowedTypes = ROLE_FILTERS[profile?.role] ?? ['container_update', 'detention_alert', 'ooc_granted', 'ship_arrived']
        if (profile?.role === 'admin' || allowedTypes.includes(payload.new.type)) {
          setNotifications(prev => [payload.new, ...prev].slice(0, 50))
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [profile?.role])

  useEffect(() => {
    const handler = (e) => {
      if (e.target.classList?.contains('ix-bell-scrim')) return // it closes on its own click (no tap-through)
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          bellRef.current && !bellRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Esc closes the panel (when it is the top overlay) and gives focus back to
  // the bell. On phones the sheet is modal: focus moves into it and Tab stays inside.
  useEffect(() => {
    if (!open) return undefined
    const layer = pushLayer(Symbol('bell'))
    const raf = isPhone ? requestAnimationFrame(() => headRef.current?.focus({ preventScroll: true })) : 0
    const onKey = (e) => {
      if (!layer.isTop()) return
      if (e.key === 'Escape') { setOpen(false); bellRef.current?.focus() }
      else if (isPhone && e.key === 'Tab') trapTab(e, dropdownRef.current)
    }
    document.addEventListener('keydown', onKey)
    return () => { cancelAnimationFrame(raf); layer.release(); document.removeEventListener('keydown', onKey) }
  }, [open, isPhone])

  const closeSheet = () => { setOpen(false); bellRef.current?.focus() }

  const unreadCount = useMemo(() =>
    notifications.filter(n =>
      !lastSeen || new Date(n.created_at) > new Date(lastSeen)
    ).length
  , [notifications, lastSeen])

  const markAllRead = () => {
    const now = new Date().toISOString()
    const key = getStorageKey(profile?.id)
    localStorage.setItem(key, now)
    setLastSeen(now)
  }

  const handleOpen = () => {
    const nowOpen = !open
    setOpen(nowOpen)
    if (nowOpen) {
      const now = new Date().toISOString()
      const key = getStorageKey(profile?.id)
      localStorage.setItem(key, now)
      setLastSeen(now)
    }
  }

  const handleItemClick = (n) => {
    const now = new Date().toISOString()
    const key = getStorageKey(profile?.id)
    localStorage.setItem(key, now)
    setLastSeen(now)
    setOpen(false)

    if (!onNavigate) return
    const meta = n.meta || {}
    const t = n.type || n.action || ''

    // the page the alert is about, with its job picked (shared with the desktop alerts)
    const url = alertUrl(t, meta.job_id || n.job_id, meta.container_no)
    const tab = new URLSearchParams(url.split('?')[1] || '').get('tab') || 'today'
    onNavigate({ url, tab, jobId: meta.job_id || n.job_id, cn: meta.container_no, jobNo: meta.job_no || n.job_no })
  }

  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => {
        const t = n.type || n.action || ''
if (filter === 'container') return t.includes('container') || t === 'detention_alert'
      if (filter === 'alert') return t === 'detention_alert'
      if (filter === 'job') return t.includes('job') || t.includes('stage') || t === 'job_created'
      if (filter === 'document') return t.includes('upload') || t.includes('document')
      if (filter === 'ulip') return t === 'be_status_check' || t === 'ooc_granted' || t.includes('ulip')
        return true
      })

  const groups = groupByDay(filteredNotifications)

  const TAG_TONE = { alert: 'danger', container: 'info', job: 'success', document: 'warning', ulip: 'brand', default: 'neutral' }

  return (
    <div className="ix-bell">
      <button
        ref={bellRef}
        type="button"
        onClick={handleOpen}
        className={`ix-icon-btn ix-bell-btn ${unreadCount > 0 ? 'has-new' : ''}`}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} new` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
      >
        <Icon name="bell" />
        {unreadCount > 0 && <span className="ix-bell-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {/* phone only (CSS): the panel is a bottom sheet over this backdrop; a tap on it closes the panel */}
      {open && <div className="ix-bell-scrim" aria-hidden="true" onClick={() => setOpen(false)} />}
      {open && (
        <div ref={dropdownRef} className="ix-bell-panel" role="dialog" aria-label="Notifications" aria-modal={isPhone || undefined}>
          {isPhone && <span className="ix-modal-grab" aria-hidden="true" />}
          <div className="ix-bell-head">
            <h2 ref={headRef} className="t" tabIndex={-1}>
              Notifications
              {unreadCount > 0 && <span className="ix-badge danger sm">{unreadCount} new</span>}
            </h2>
            <button type="button" className="ix-link" onClick={markAllRead}>Mark all read</button>
            {isPhone && <IconButton icon="x" label="Close" className="ix-bell-close" onClick={closeSheet} />}
          </div>

          <div className="ix-bell-filters" role="group" aria-label="Filter notifications">
            {['all', 'container', 'alert', 'job', 'document', 'ulip'].map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                className={`ix-seg-item ${filter === f ? 'on' : ''}`}>
                {f === 'ulip' ? 'ULIP' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className="ix-bell-list">
            {filteredNotifications.length === 0 ? (
              <div className="ix-empty-state compact">
                <span className="ico"><Icon name="bell-off" /></span>
                <div className="t">You are up to date</div>
                <div className="d">New container, customs and job updates will appear here.</div>
              </div>
            ) : (
              Object.entries(groups).map(([day, items]) => {
                if (items.length === 0) return null
                return (
                  <div key={day}>
                    <div className="ix-bell-day">{day}</div>
                    {items.map((n, i) => {
                      const isUnread = !lastSeen || new Date(n.created_at) > new Date(lastSeen)
                      const t = n.type || n.action || ''
                      const tagCls = t === 'detention_alert' ? 'alert' : t.includes('container') ? 'container' : t.includes('job') || t.includes('stage') ? 'job' : t.includes('upload') || t.includes('document') ? 'document' : t === 'be_status_check' || t === 'ooc_granted' || t.includes('ulip') ? 'ulip' : 'default'
                      return (
                        <button type="button" key={n.id || i} onClick={() => handleItemClick(n)} className={`ix-bell-item ${isUnread ? 'unread' : ''}`}>
                          <span className="body">
                            <span className="title">{n.title || n.action || 'Update'}</span>
                            <span className="meta">
                              <span className={`ix-badge sm ${TAG_TONE[tagCls]}`}>{typeLabel(n.type || n.action)}</span>
                              {n.job_no && <span className="mono">{n.job_no}</span>}
                              {n.done_by_name && <span>· {n.done_by_name}</span>}
                            </span>
                          </span>
                          <span className="side">
                            <span className="time">{formatNotifTime(n.created_at)}</span>
                            {isUnread && <span className="dot" aria-label="New" />}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>

          <DesktopAlerts profile={profile} />
        </div>
      )}
    </div>
  )
}
