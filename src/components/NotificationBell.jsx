import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const STORAGE_KEY = 'jds_notif_last_seen'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
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
  return groups
}

export default function NotificationBell({ onNavigate }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [filter, setFilter] = useState('all')
  const [lastSeen, setLastSeen] = useState(() => localStorage.getItem(STORAGE_KEY) || null)
  const dropdownRef = useRef(null)
  const bellRef = useRef(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (data) setNotifications(data)
    }
    load()

    const channel = supabase
      .channel('activity_log_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, payload => {
        setNotifications(prev => [payload.new, ...prev].slice(0, 50))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

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

  const unreadCount = notifications.filter(n =>
    !lastSeen || new Date(n.created_at) > new Date(lastSeen)
  ).length

  const markAllRead = () => {
    const now = new Date().toISOString()
    localStorage.setItem(STORAGE_KEY, now)
    setLastSeen(now)
  }

  const handleOpen = () => {
    setOpen(prev => !prev)
  }

  const handleItemClick = (n) => {
    const now = new Date().toISOString()
    localStorage.setItem(STORAGE_KEY, now)
    setLastSeen(now)
    setOpen(false)

    if (!onNavigate) return
    const meta = n.meta || {}
    const t = n.type || n.action || ''

    if (t === 'container_update' || t === 'detention_alert' || t.includes('container')) {
      onNavigate({ tab: 'containers', jobId: meta.job_id || n.job_id, cn: meta.container_no })
    } else if (t.includes('stage') || t.includes('job') || t === 'job_update' || t === 'job_created') {
      onNavigate({ tab: 'jobs', jobId: meta.job_id || n.job_id })
    } else if (t.includes('upload') || t.includes('document')) {
      onNavigate({ tab: 'documents', jobNo: meta.job_no || n.job_no })
    }
  }

  const getIcon = (n) => {
    const t = n.type || n.action || ''
    if (t === 'detention_alert') return { emoji: '🚨', cls: 'alert' }
    if (t === 'container_update' || t.includes('container')) return { emoji: '📦', cls: 'container' }
    if (t === 'job_update' || t === 'job_created' || t.includes('stage') || t.includes('job')) return { emoji: '📋', cls: 'job' }
    if (t === 'document_upload' || t.includes('upload') || t.includes('document')) return { emoji: '📄', cls: 'document' }
    return { emoji: '🔔', cls: 'default' }
  }

  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => {
        const t = n.type || n.action || ''
        if (filter === 'container') return t.includes('container') || t === 'detention_alert'
        if (filter === 'alert') return t === 'detention_alert'
        if (filter === 'job') return t.includes('job') || t.includes('stage') || t === 'job_created'
        if (filter === 'document') return t.includes('upload') || t.includes('document')
        return true
      })

  const groups = groupByDay(filteredNotifications)

  const iconColors = {
    alert:     { bg: '#FCEBEB', color: '#791F1F' },
    container: { bg: '#E6F1FB', color: '#0C447C' },
    job:       { bg: '#EAF3DE', color: '#27500A' },
    document:  { bg: '#FAEEDA', color: '#633806' },
    default:   { bg: '#f4f6f9', color: '#4a5568' },
  }

  const tagStyles = {
    alert:     { bg: '#FCEBEB', color: '#791F1F', border: '#F7C1C1' },
    container: { bg: '#E6F1FB', color: '#0C447C', border: '#B5D4F4' },
    job:       { bg: '#EAF3DE', color: '#27500A', border: '#C0DD97' },
    document:  { bg: '#FAEEDA', color: '#633806', border: '#FAC775' },
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
            position: 'absolute', top: 'calc(100% + 10px)', right: 0,
            width: '360px', background: 'white',
            border: '1.5px solid #d0d9e8', borderRadius: '14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)', zIndex: 9999,
            overflow: 'hidden',
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
            {['all', 'container', 'alert', 'job', 'document'].map(f => (
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

          <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
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
                      const { emoji, cls } = getIcon(n)
                      const ic = iconColors[cls] || iconColors.default
                      const ts = tagStyles[cls] || tagStyles.default
                      return (
                        <div
                          key={n.id || i}
                          onClick={() => handleItemClick(n)}
                          style={{
                            padding: '10px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start',
                            borderBottom: '0.5px solid #f4f6f9', cursor: 'pointer',
                            background: isUnread ? '#f0f5ff' : 'white',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = isUnread ? '#e6eeff' : '#f8f9fb'}
                          onMouseLeave={e => e.currentTarget.style.background = isUnread ? '#f0f5ff' : 'white'}
                        >
                          <div style={{ width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', background: ic.bg }}>
                            {emoji}
                          </div>
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
                            <span style={{ fontSize: '10px', color: '#8a96a8', whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</span>
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