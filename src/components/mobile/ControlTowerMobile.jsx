import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { EmptyState, Icon, JobNo, Panel, Segmented, Skeleton, fmtDate, fmtDateTime, fmtTime } from '../../industrial/ui'

// Team & stages: the team activity feed. (The file name is from the old Tailwind
// screen; since the Control tower rebuild, Jose 31 Oct 2026, it renders at every width.)
// Repeated identical notices on one day ("Automatic checks paused for 2 hours" x 9)
// collapse into one line with a count, so people's own updates are not buried.

const DAY = 86400000
const IST = 5.5 * 3600000
const DAYS = 7 // how far back the feed reads
const SHOW = 30 // lines shown before "Show all"

// the notes of these types can carry a ship name: rows are never labelled by ship (Jose)
const NO_NOTE = ['ship_arrived', 'eta_changed']
const FEED_ICON = {
  ooc_granted: ['building-bank', 'cus'], be_filed: ['building-bank', 'cus'], sb_filed: ['building-bank', 'cus'],
  be_stage: ['building-bank', 'cus'], air_igm: ['plane', 'cus'],
  ship_arrived: ['anchor', 'port'], eta_changed: ['anchor', 'port'],
  truck_dispatched: ['truck', ''], truck_stuck: ['alert-triangle', 'bad'], truck_papers: ['alert-triangle', 'bad'],
  detention_alert: ['alert-triangle', 'bad'], job_delivered: ['flag', 'ok'], auto_check_paused: ['player-pause', 'warn'],
  stage_update: ['arrow-big-right-lines', ''], job_update: ['arrow-big-right-lines', ''], note: ['message-circle', ''],
  job_created: ['plus', ''], document_upload: ['file-upload', ''],
}

// vendor and system names never reach the screen: plain words instead
const plain = (s) => String(s || '')
  .replace(/\s*\((ICEGATE|LDB|ULIP|FASTag|Safecube|VAHAN)\)/gi, '')
  .replace(/\bICEGATE\b/gi, 'Customs').replace(/\bLDB\b/g, 'container tracking')
  .replace(/\bFASTag\b/gi, 'toll').replace(/\bVAHAN\b/gi, 'vehicle records')
  .replace(/\bULIP\b/g, 'government systems').replace(/\bSafecube\b/gi, 'ship tracking')
  .replace(/\s+—\s+/g, ', ')
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
const dayOf = (iso) => Math.floor((new Date(iso).getTime() + IST) / DAY)

// rows come newest first; a repeat of the same notice (same type, job, words and
// person on the same India day) adds to the first line instead of a new one
function collapse(rows, staff, staffOnly) {
  const out = []
  const seen = new Map()
  for (const r of rows) {
    const who = r.done_by_name || null
    const isStaff = !!who && staff.has(who)
    if (staffOnly && !isStaff) continue
    const type = r.type || r.action || ''
    const no = r.job_no ? String(r.job_no) : null
    let text = plain(r.title || type.replace(/_/g, ' '))
    // the job number is shown first on its own, so it comes out of the sentence
    if (no) text = text.replace(new RegExp(`\\s*${reEscape(no)}\\s*`), ' ').replace(/^[\s,—-]+|[\s,—-]+$/g, '').trim()
    const key = `${dayOf(r.created_at)}|${type}|${r.job_id || ''}|${text.toLowerCase()}|${who || ''}`
    const hit = seen.get(key)
    if (hit) { hit.n += 1; hit.first = r.created_at; continue }
    const [icon, cls] = FEED_ICON[type] || ['point', '']
    const e = {
      key: `l${r.id}`, at: r.created_at, first: r.created_at, n: 1, jobId: r.job_id || null, jobNo: no,
      text: text || 'Update', note: NO_NOTE.includes(type) ? '' : plain(r.note), who, isStaff, icon, cls,
    }
    seen.set(key, e)
    out.push(e)
  }
  return out
}

export default function TeamFeed({ data, profiles, dash, onOpenJob }) {
  const [log, setLog] = useState(null) // null = not loaded yet
  const [readAt, setReadAt] = useState(0) // when the feed was last read ('Today' / 'Yesterday')
  const [failed, setFailed] = useState(false)
  const [who, setWho] = useState('all')
  const [all, setAll] = useState(false)

  // the last 7 days, reread when the shared data reloads and once a minute
  // (database only; container moves are left out, the Containers page shows them)
  useEffect(() => {
    let cancelled = false
    const load = () => supabase.from('activity_log')
      .select('id, type, action, title, note, job_id, job_no, done_by_name, created_at')
      .or('type.is.null,type.neq.container_update')
      .gte('created_at', new Date(Date.now() - DAYS * DAY).toISOString())
      .order('created_at', { ascending: false }).limit(400)
      .then(({ data: got, error }) => {
        if (cancelled) return
        setFailed(!!error)
        if (!error) { setLog(got || []); setReadAt(Date.now()) }
      })
    load()
    const t = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(t) }
  }, [data])

  // staff = the portal's own people; everything else (Auto-check, the bot) is a system notice
  const staff = useMemo(() => new Set(Object.values(profiles || {}).filter(Boolean)), [profiles])
  const lines = useMemo(() => collapse(log || [], staff, who === 'staff'), [log, staff, who])
  const shown = all ? lines : lines.slice(0, SHOW)
  const folded = lines.reduce((s, e) => s + (e.n - 1), 0)
  const today = dayOf(readAt)

  return (
    <Panel title="Team activity" className="tm-feed-panel"
      meta={log ? `last ${DAYS} days · IST${folded ? ` · ${folded} repeats folded` : ''}` : null}
      actions={<Segmented label="Whose updates" value={who} onChange={setWho} options={[{ value: 'all', label: 'All' }, { value: 'staff', label: 'Staff only' }]} />}>
      {failed && !log ? <EmptyState line icon="alert-triangle" tone="red" title="Could not load team activity. Press Refresh." />
        : dash || !log ? <Skeleton rows={6} />
          : !lines.length ? <EmptyState line icon="activity" title={who === 'staff' ? `No staff updates in the last ${DAYS} days.` : `No updates in the last ${DAYS} days.`} />
            : (
              <div className="tm-feed">
                {shown.map((e, i) => {
                  const dn = dayOf(e.at)
                  const newDay = i === 0 || dayOf(shown[i - 1].at) !== dn
                  const small = e.n > 1
                    ? [`${e.n} times, first at ${fmtTime(e.first)}`, e.who].filter(Boolean).join(' · ')
                    : [e.note, e.who].filter(Boolean).join(' · ')
                  return [
                    newDay ? <div className="day" key={`d${dn}`}>{dn === today ? 'Today · ' : dn === today - 1 ? 'Yesterday · ' : ''}{fmtDate(e.at)}</div> : null,
                    <div key={e.key} className={`ev${e.jobId ? ' click' : ''}${e.isStaff ? '' : ' sys'}`} title={fmtDateTime(e.at)}
                      onClick={() => e.jobId && onOpenJob(e.jobId)}>
                      <time>{fmtTime(e.at)}</time>
                      <span className={`ic ${e.cls}`}><Icon name={e.icon} /></span>
                      <p>
                        {e.jobNo && <><JobNo no={e.jobNo} size="sm" /> </>}{e.text}
                        {e.n > 1 && <span className="x" title={`${e.n} identical updates on this day`}>×{e.n}</span>}
                        {small ? <small>{small}</small> : null}
                      </p>
                    </div>,
                  ]
                })}
                {lines.length > SHOW && (
                  <div className="more">
                    <button type="button" className="ix-link" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${lines.length}`}</button>
                  </div>
                )}
              </div>
            )}
    </Panel>
  )
}
