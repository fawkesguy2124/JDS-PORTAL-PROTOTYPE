import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabase'

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

  const timeStr = d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
    hour12: true, timeZone: 'Asia/Kolkata'
  }).toUpperCase()

  if (notifDay.getTime() === today.getTime()) {
    return timeStr
  }
  if (notifDay.getTime() === yesterday.getTime()) {
    return `Yesterday, ${timeStr}`
  }
  const dateStr = d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata'
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

const ROLE_FILTERS = {
  admin:     null,
  field_ops: ['container_update', 'detention_alert', 'ooc_granted'],
  employee:  ['container_update', 'detention_alert', 'job_created', 'stage_update', 'document_upload', 'ooc_granted'],
}

export default function NotificationBell({ onNavigate, profile }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [filter, setFilter] = useState('all')
  const [lastSeen, setLastSeen] = useState(null)
  const dropdownRef = useRef(null)
  const bellRef = useRef(null)

  // Load lastSeen after profile is available
  useEffect(() => {
    if (profile?.id) {
      const stored = localStorage.getItem(getStorageKey(profile.id))
      setLastSeen(stored || null)
    }
  }, [profile?.id])

  useEffect(() => {
    const load = async () => {
      const allowedTypes = ROLE_FILTERS[profile?.role] ?? ['container_update', 'detention_alert', 'ooc_granted']
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
        const allowedTypes = ROLE_FILTERS[profile?.role] ?? ['container_update', 'detention_alert', 'ooc_granted']
        if (profile?.role === 'admin' || allowedTypes.includes(payload.new.type)) {
          setNotifications(prev => [payload.new, ...prev].slice(0, 50))
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [profile?.role])

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          bellRef.current && !bellRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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

    if (t === 'be_status_check' || t === 'ooc_granted') {
      onNavigate({ tab: 'jobs', jobId: meta.job_id || n.job_id, hash: 'customs' })
      return
    }
    if (t === 'container_update' || t === 'detention_alert' || t.includes('container')) {
      onNavigate({ tab: 'containers', jobId: meta.job_id || n.job_id, cn: meta.container_no })
    } else if (t.includes('stage') || t.includes('job') || t === 'job_update' || t === 'job_created') {
      onNavigate({ tab: 'jobs', jobId: meta.job_id || n.job_id })
    } else if (t.includes('upload') || t.includes('document')) {
      onNavigate({ tab: 'documents', jobNo: meta.job_no || n.job_no })
    }
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

  const tagStyles = {
    alert:     { bg: '#FCEBEB', color: '#791F1F', border: '#F7C1C1' },
    container: { bg: '#E6F1FB', color: '#0C447C', border: '#B5D4F4' },
    job:       { bg: '#EAF3DE', color: '#27500A', border: '#C0DD97' },
    document:  { bg: '#FAEEDA', color: '#633806', border: '#FAC775' },
    ulip:      { bg: '#ecfdf5', color: '#065f46', border: '#d1fae5' },
    default:   { bg: '#f4f6f9', color: '#4a5568', border: '#e2e6ed' },
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={bellRef}
        onClick={handleOpen}
        style={{
          width: '36px', height: '36px', borderRadius: '8px', position: 'relative',
          border: unreadCount > 0 ? '1.5px solid #fecaca' : '1.5px solid #e2e6ed',
          background: unreadCount > 0 ? '#fef2f2' : open ? '#E6F1FB' : 'white',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#1a4fa0'; e.currentTarget.style.background = '#E6F1FB' }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = unreadCount > 0 ? '#fecaca' : open ? '#1a4fa0' : '#e2e6ed'
          e.currentTarget.style.background = unreadCount > 0 ? '#fef2f2' : open ? '#E6F1FB' : 'white'
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: '-5px', right: '-5px',
            background: '#dc2626', color: 'white', borderRadius: '9999px',
            fontSize: '9px', fontWeight: 700, minWidth: '16px', height: '16px',
            padding: '0 3px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid white', animation: 'bellBadgePop 0.25s cubic-bezier(0.16,1,0.3,1)',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: window.innerWidth >= 768 ? '56px' : '68px',
            right: window.innerWidth >= 768 ? '72px' : '8px',
            width: 'min(360px, calc(100vw - 16px))', background: 'white',
            border: '1.5px solid #d0d9e8', borderRadius: '14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)', zIndex: 9999,
            overflow: 'hidden',
            maxHeight: 'calc(100vh - 88px)',
            animation: 'bellDropdown 0.18s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <style>{`
            @keyframes bellBadgePop { from { transform: scale(0) } to { transform: scale(1) } }
            @keyframes bellDropdown { from { opacity:0; transform: translateY(-6px) scale(0.97) } to { opacity:1; transform: translateY(0) scale(1) } }
          `}</style>

          <div style={{ padding: '12px 16px 10px', borderBottom: '0.5px solid #e2e6ed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#1a2233' }}>
              Notifications
              {unreadCount > 0 && (
                <span style={{ background: '#dc2626', color: 'white', borderRadius: '9999px', fontSize: '10px', fontWeight: 700, padding: '2px 7px' }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            <button
              onClick={markAllRead}
              style={{ fontSize: '11px', fontWeight: 600, color: '#1a4fa0', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Mark all read
            </button>
          </div>

          <div style={{ display: 'flex', gap: '5px', padding: '8px 16px', borderBottom: '0.5px solid #f4f6f9', overflowX: 'auto' }}>
            {['all', 'container', 'alert', 'job', 'document', 'ulip'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 500,
                  border: `0.5px solid ${filter === f ? '#1a4fa0' : '#e2e6ed'}`,
                  background: filter === f ? '#1a4fa0' : 'white',
                  color: filter === f ? 'white' : '#8a96a8',
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.12s',
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ overflowY: 'auto', maxHeight: '360px' }}>
            {filteredNotifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🎉</div>
                <p style={{ fontSize: '12px', color: '#8a96a8' }}>All caught up! No notifications.</p>
              </div>
            ) : (
              Object.entries(groups).map(([day, items]) => {
                if (items.length === 0) return null
                return (
                  <div key={day}>
                    <div style={{ padding: '6px 16px 4px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a96a8', background: '#f8f9fb', borderBottom: '0.5px solid #f4f6f9', position: 'sticky', top: 0 }}>
                      {day}
                    </div>
                    {items.map((n, i) => {
                      const isUnread = !lastSeen || new Date(n.created_at) > new Date(lastSeen)
                      const t = n.type || n.action || ''
                      const tagCls = t === 'detention_alert' ? 'alert' : t.includes('container') ? 'container' : t.includes('job') || t.includes('stage') ? 'job' : t.includes('upload') || t.includes('document') ? 'document' : t === 'be_status_check' || t === 'ooc_granted' || t.includes('ulip') ? 'ulip' : 'default'
                      const ts = tagStyles[tagCls] || tagStyles.default
                      return (
                        <div
                          key={n.id || i}
                          onClick={() => handleItemClick(n)}
                          style={{
                            padding: '10px 16px', display: 'flex', gap: '8px', alignItems: 'flex-start',
                            borderBottom: '0.5px solid #f4f6f9', cursor: 'pointer',
                            background: isUnread ? '#f0f5ff' : 'white',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = isUnread ? '#e6eeff' : '#f8f9fb'}
                          onMouseLeave={e => e.currentTarget.style.background = isUnread ? '#f0f5ff' : 'white'}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 500, color: '#1a2233', lineHeight: 1.4, marginBottom: '3px' }}>
                              {n.title || n.action || 'Update'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#8a96a8', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: '9999px', fontSize: '10px', fontWeight: 600, background: ts.bg, color: ts.color, border: `0.5px solid ${ts.border}` }}>
                                {(n.type || n.action)?.replace(/_/g, ' ') || 'update'}
                              </span>
                              {n.job_no && <span style={{ fontFamily: 'monospace', color: '#185FA5' }}>{n.job_no}</span>}
                              {n.done_by_name && <span>· {n.done_by_name}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                            <span style={{ fontSize: '10px', color: '#8a96a8', whiteSpace: 'nowrap' }}>{formatNotifTime(n.created_at)}</span>
                            {isUnread && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1a4fa0' }} />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>

        </div>
      )}
    </div>
  )
}