import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabase'
import { alertUrl } from '../../supabase/functions/_shared/portal/alertLinks.js'
import DesktopAlerts from './DesktopAlerts'
import { fmtDate, fmtTime } from '../industrial/ui'
import { bellKindOf, beep, getPrefs, usePrefs } from '../industrial/settings'

const getStorageKey = (userId) => `jds_notif_last_seen_${userId || 'unknown'}`

// Light token values (same as industrial.css) for when the bell is not inside .ix
// (EmployeeDashboard). Inside .ix the shell's tokens, light or dark, are used.
const BELL_TOKENS = `.jds-bell:not(.ix *) {
  --navy: #1a4fa0; --navy-50: #eef3fb; --navy-100: #dce6f6; --navy-200: #b8cbec;
  --primary: #1a4fa0; --on-fill: #fff; --red-fill: #c81e1e;
  --surface: #fff; --surface-2: #f8f9fb; --line: #e3e7ed; --line-2: #d3d9e2;
  --text: #101828; --text-2: #475467; --muted: #8792a5;
  --green: #16803c; --amber: #b45309; --amber-bg: #fff6e8; --amber-line: #f5d6a3;
  --red: #c81e1e; --red-bg: #fdefef; --red-line: #f3c3c3;
  --teal: #0f766e; --teal-bg: #e8f4f3; --teal-line: #b7ddd8;
  --blue: var(--navy); --blue-bg: var(--navy-50); --blue-line: var(--navy-200);
  --grey-bg: #f1f3f6; --grey-line: #dde2e9; --r-lg: 8px;
  --mono: ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas, monospace;
  --shadow-pop: 0 8px 24px rgba(16, 24, 40, .12), 0 2px 6px rgba(16, 24, 40, .06);
}`

// '14:43' today, 'Yesterday, 14:43', else '29 Oct, 14:43' (IST; 12 h or 24 h as
// chosen in Settings)
function formatNotifTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const notifDay = new Date(d)
  notifDay.setHours(0, 0, 0, 0)

  const timeStr = fmtTime(ts)
  if (notifDay.getTime() === today.getTime()) {
    return timeStr
  }
  if (notifDay.getTime() === yesterday.getTime()) {
    return `Yesterday, ${timeStr}`
  }
  return `${fmtDate(ts)}, ${timeStr}`
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

// Only what the systems report by themselves (Jose, 1 Nov 2026: "notifications only for
// updates from the API side; nothing JDS entered by hand"): container moves and free days
// (port / CFS), OOC from Customs, the air manifest, ship arrivals and ETA changes, truck
// papers and trucks that stopped moving. Jobs created, trucks added, papers uploaded, BE
// stages and stage changes are what staff did themselves, so they never reach the bell
// (they stay in each job's timeline). Same list for every role.
const BELL_TYPES = ['container_update', 'detention_alert', 'ooc_granted', 'air_igm', 'ship_arrived', 'eta_changed', 'truck_papers', 'truck_stuck']

export default function NotificationBell({ onNavigate, profile }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [filter, setFilter] = useState('all')
  const [lastSeen, setLastSeen] = useState(null)
  const [readAhead, setReadAhead] = useState(() => [])
  const dropdownRef = useRef(null)
  const bellRef = useRef(null)
  // Settings: kinds of update hidden from the bell, and a beep for new ones
  const [prefs] = usePrefs()
  const muted = prefs.bellMuted

  // Load lastSeen after profile is available
  useEffect(() => {
    if (profile?.id) {
      const stored = localStorage.getItem(getStorageKey(profile.id))
      setLastSeen(stored || null)
      try { setReadAhead(JSON.parse(localStorage.getItem(`${getStorageKey(profile.id)}_ahead`) || '[]')) } catch { setReadAhead([]) }
    }
  }, [profile?.id])

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('*')
        .in('type', BELL_TYPES)
        .order('created_at', { ascending: false })
        .limit(50)
      if (data) setNotifications(data)
    }
    load()

    let lastBeep = 0
    const channel = supabase
      .channel('activity_log_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, payload => {
        if (BELL_TYPES.includes(payload.new.type)) {
          setNotifications(prev => [payload.new, ...prev].slice(0, 50))
          // one beep for a new update of a kind that is shown (a burst of
          // updates from one check beeps once)
          const p = getPrefs()
          if (p.bellSound && !p.bellMuted.includes(bellKindOf(payload.new.type || payload.new.action)) && Date.now() - lastBeep > 3000) {
            lastBeep = Date.now()
            beep()
          }
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

  // the updates the bell shows (kinds switched off in Settings are left out)
  const shown = useMemo(() => (muted.length
    ? notifications.filter((n) => !muted.includes(bellKindOf(n.type || n.action)))
    : notifications), [notifications, muted])

  const unreadCount = useMemo(() =>
    shown.filter(n =>
      (!lastSeen || new Date(n.created_at) > new Date(lastSeen)) && !readAhead.includes(n.id)
    ).length
  , [shown, lastSeen, readAhead])

  // Opening the bell marks everything read (Jose, 31 Oct 2026: no "Mark all read" button).
  // "Read up to" is now; alerts stamped later than now (old LDB 11:59 pm stamps) are
  // remembered by id instead, so they cannot stay unread for ever and a real alert that
  // comes in this evening still shows as new. What was new stays highlighted while open.
  const [newSince, setNewSince] = useState(null)
  const [newAhead, setNewAhead] = useState([])
  const markAllRead = () => {
    const now = new Date().toISOString()
    const ahead = notifications.filter((n) => n.created_at > now).map((n) => n.id)
    const seen = [...new Set([...readAhead, ...ahead])].slice(-200)
    localStorage.setItem(getStorageKey(profile?.id), now)
    localStorage.setItem(`${getStorageKey(profile?.id)}_ahead`, JSON.stringify(seen))
    setLastSeen(now)
    setReadAhead(seen)
  }

  // how many were new when the bell was opened (shown in the header while it is open)
  const wasNew = (n) => newSince === '' || (!!newSince && new Date(n.created_at) > new Date(newSince) && !newAhead.includes(n.id))
  const newCount = shown.filter(wasNew).length

  const handleOpen = () => {
    const nowOpen = !open
    setOpen(nowOpen)
    if (nowOpen) {
      setNewSince(lastSeen || '')
      setNewAhead(readAhead)
      markAllRead()
    }
  }

  const handleItemClick = (n) => {
    markAllRead()
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
    ? shown
    : shown.filter(n => {
        const t = n.type || n.action || ''
if (filter === 'container') return t.includes('container') || t === 'detention_alert'
      // Alert = every warning: free days ending, truck papers, a stopped truck
      if (filter === 'alert') return t === 'detention_alert' || t === 'truck_papers' || t === 'truck_stuck'
      if (filter === 'ship') return t === 'ship_arrived' || t === 'eta_changed'
      if (filter === 'truck') return t.startsWith('truck')
      if (filter === 'ulip') return t === 'ooc_granted' || t === 'air_igm'
        return true
      })

  const groups = groupByDay(filteredNotifications)
  // phones: finger-sized filter chips that wrap, readable day headings (Jose, 1 Nov 2026)
  const phone = window.innerWidth <= 760

  // colours are the portal's tokens, so the bell follows the light / dark theme
  const tagStyles = {
    alert:     { bg: 'var(--red-bg)', color: 'var(--red)', border: 'var(--red-line)' },
    container: { bg: 'var(--blue-bg)', color: 'var(--blue)', border: 'var(--blue-line)' },
    job:       { bg: 'var(--grey-bg)', color: 'var(--text-2)', border: 'var(--grey-line)' },
    document:  { bg: 'var(--amber-bg)', color: 'var(--amber)', border: 'var(--amber-line)' },
    ulip:      { bg: 'var(--teal-bg)', color: 'var(--teal)', border: 'var(--teal-line)' },
    default:   { bg: 'var(--grey-bg)', color: 'var(--text-2)', border: 'var(--grey-line)' },
  }

  return (
    <div className="jds-bell" style={{ position: 'relative' }}>
      {/* the staff dashboard draws the bell outside the .ix shell: give it the light tokens there */}
      <style>{BELL_TOKENS}</style>
      <button
        ref={bellRef}
        onClick={handleOpen}
        style={{
          width: '36px', height: '36px', borderRadius: '8px', position: 'relative',
          border: unreadCount > 0 ? '1.5px solid var(--red-line)' : '1.5px solid var(--line-2)',
          background: unreadCount > 0 ? 'var(--red-bg)' : open ? 'var(--navy-50)' : 'var(--surface)',
          color: 'var(--text-2)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.background = 'var(--navy-50)' }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = unreadCount > 0 ? 'var(--red-line)' : open ? 'var(--navy)' : 'var(--line-2)'
          e.currentTarget.style.background = unreadCount > 0 ? 'var(--red-bg)' : open ? 'var(--navy-50)' : 'var(--surface)'
        }}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} new` : 'Notifications'}
        title="Notifications"
      >
        <i className="ti ti-bell" aria-hidden="true" />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: '-5px', right: '-5px',
            background: 'var(--red-fill)', color: 'var(--on-fill)', borderRadius: '9999px',
            fontSize: '10px', fontWeight: 700, minWidth: '16px', height: '16px',
            padding: '0 3px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--surface)', animation: 'bellBadgePop 0.25s cubic-bezier(0.16,1,0.3,1)',
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
            width: 'min(360px, calc(100vw - 16px))', background: 'var(--surface)', color: 'var(--text)',
            border: '1px solid var(--line)', borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--shadow-pop)', zIndex: 9999,
            overflow: 'hidden',
            maxHeight: 'calc(100dvh - 88px)', // dvh: the visible screen, also under iPhone Safari's bars
            animation: 'bellDropdown 0.18s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <style>{`
            @keyframes bellBadgePop { from { transform: scale(0) } to { transform: scale(1) } }
            @keyframes bellDropdown { from { opacity:0; transform: translateY(-6px) scale(0.97) } to { opacity:1; transform: translateY(0) scale(1) } }
          `}</style>

          <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
              Notifications
              {newCount > 0 && (
                <span style={{ background: 'var(--red-fill)', color: 'var(--on-fill)', borderRadius: '9999px', fontSize: '10px', fontWeight: 700, padding: '2px 7px' }}>
                  {newCount} new
                </span>
              )}
            </div>
            {muted.length > 0 && (
              <span style={{ fontSize: '11px', color: 'var(--muted)' }} title="Choose which updates the bell shows in Settings">
                {muted.length} {muted.length === 1 ? 'kind' : 'kinds'} hidden
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: phone ? '6px' : '5px', padding: '8px 16px', borderBottom: '1px solid var(--line)', overflowX: 'auto', flexWrap: phone ? 'wrap' : 'nowrap' }}>
            {['all', 'container', 'ship', 'truck', 'ulip', 'alert'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: phone ? '0 12px' : '3px 10px', minHeight: phone ? '34px' : undefined, borderRadius: '9999px', fontSize: phone ? '13px' : '11px', fontWeight: 500,
                  border: `1px solid ${filter === f ? 'var(--primary)' : 'var(--line)'}`,
                  background: filter === f ? 'var(--primary)' : 'var(--surface)',
                  color: filter === f ? 'var(--on-fill)' : 'var(--text-2)',
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.12s',
                }}
              >
                {f === 'ulip' ? 'Customs' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ overflowY: 'auto', maxHeight: '360px' }}>
            {filteredNotifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <i className="ti ti-circle-check" aria-hidden="true" style={{ display: 'block', fontSize: '28px', marginBottom: '8px', color: 'var(--green)' }} />
                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>{filter === 'all' ? 'All caught up! No notifications.' : 'Nothing under this filter.'}</p>
              </div>
            ) : (
              Object.entries(groups).map(([day, items]) => {
                if (items.length === 0) return null
                return (
                  <div key={day}>
                    <div style={{ padding: '6px 16px 4px', fontSize: phone ? '11px' : '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0 }}>
                      {day}
                    </div>
                    {items.map((n, i) => {
                      const isUnread = wasNew(n)
                      const t = n.type || n.action || ''
                      const tagCls = t === 'detention_alert' ? 'alert' : t.includes('container') ? 'container' : t.includes('job') || t.includes('stage') ? 'job' : t.includes('upload') || t.includes('document') ? 'document' : t === 'be_status_check' || t === 'ooc_granted' || t.includes('ulip') ? 'ulip' : 'default'
                      const ts = tagStyles[tagCls] || tagStyles.default
                      return (
                        <div
                          key={n.id || i}
                          onClick={() => handleItemClick(n)}
                          style={{
                            padding: '10px 16px', display: 'flex', gap: '8px', alignItems: 'flex-start',
                            borderBottom: '1px solid var(--line)', cursor: 'pointer',
                            background: isUnread ? 'var(--navy-50)' : 'var(--surface)',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = isUnread ? 'var(--navy-100)' : 'var(--surface-2)'}
                          onMouseLeave={e => e.currentTarget.style.background = isUnread ? 'var(--navy-50)' : 'var(--surface)'}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)', lineHeight: 1.4, marginBottom: '3px' }}>
                              {n.title || n.action || 'Update'}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: '9999px', fontSize: '10px', fontWeight: 600, background: ts.bg, color: ts.color, border: `0.5px solid ${ts.border}` }}>
                                {(n.type || n.action)?.replace(/_/g, ' ') || 'update'}
                              </span>
                              {n.job_no && <span style={{ fontFamily: 'var(--mono)', color: 'var(--navy)' }}>{n.job_no}</span>}
                              {n.done_by_name && <span>· {n.done_by_name}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                            <span style={{ fontSize: '10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatNotifTime(n.created_at)}</span>
                            {isUnread && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--navy)' }} />}
                          </div>
                        </div>
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