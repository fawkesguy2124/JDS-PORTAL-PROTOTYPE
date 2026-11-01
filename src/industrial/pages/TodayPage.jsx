import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { daysAgo, detentionLevel, isExportJob } from '../../services/journey'
import { seaOf } from '../../../supabase/functions/_shared/portal/ships.js'
import { useJourney, useFreshOnOpen } from '../JourneyContext'
import {
  Button, EmptyState, Icon, JobNo, Kpi, KpiStrip, PageHead, Panel, Skeleton,
  fmtDate, fmtTime, timeAgo, worst,
} from '../ui'
import '../styles/today.css'

// Today (Jose, 1 Nov 2026: "keep only the main highlights"): the three highlights (Active
// jobs opens All jobs; Need action and Free days ≤ 2 open a short to-do list in plain
// words), the free-time runway and the latest updates. No jobs table and no stage strip
// (All jobs has them), no Import / Export or My jobs switches.
// Every count comes from useJourney() (active / facts), so it matches the sidebar.

const DAY = 86400000
const IST = 5.5 * 3600000
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WD1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// activity_log types shown in Latest updates (container moves come from the
// tracking rows themselves, in plain words, so container_update is left out)
const FEED_TYPES = ['ooc_granted', 'be_filed', 'sb_filed', 'be_stage', 'truck_dispatched', 'stage_update', 'note',
  'ship_arrived', 'eta_changed', 'job_delivered', 'detention_alert', 'air_igm', 'truck_stuck', 'truck_papers', 'job_created']
// the notes of these types can carry a ship name: rows are never labelled by ship (Jose)
const NO_NOTE = ['ship_arrived', 'eta_changed']
const FEED_ICON = {
  ooc_granted: ['building-bank', 'cus'], be_filed: ['building-bank', 'cus'], sb_filed: ['building-bank', 'cus'],
  be_stage: ['building-bank', 'cus'], air_igm: ['plane', 'cus'],
  ship_arrived: ['anchor', 'port'], eta_changed: ['anchor', 'port'],
  truck_dispatched: ['truck', ''], truck_stuck: ['alert-triangle', 'bad'], truck_papers: ['alert-triangle', 'bad'],
  detention_alert: ['alert-triangle', 'bad'], job_delivered: ['flag', 'ok'],
  stage_update: ['arrow-big-right-lines', ''], note: ['message-circle', ''], job_created: ['plus', ''],
}

// vendor and system names never reach the screen: sources are Customs, Port, Toll
const plain = (s) => String(s || '')
  .replace(/\s*\((ICEGATE|LDB|ULIP|FASTag|Safecube)\)/gi, '')
  .replace(/\bICEGATE\b/gi, 'Customs').replace(/\bLDB\b/g, 'container tracking')
  .replace(/\bFASTag\b/gi, 'toll').replace(/\bULIP\b/g, 'government systems').replace(/\bSafecube\b/gi, 'ship tracking')
  // 'assigned — (truck 2)' reads 'assigned (truck 2)', not 'assigned, (truck 2)'
  .replace(/\s+—\s+(?=\()/g, ' ').replace(/\s+—\s+/g, ', ')
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')

// ETA of a job not yet arrived: the ship tracking's date when it has one, else the job's
// (the line's dates for an Indian port are port time saved as UTC, as in journeyFor)
function etaOf(job, data) {
  const sea = seaOf(job, data)
  if (sea && !sea.error && sea.pod_date && !sea.pod_actual) {
    return /,\s*IN$/i.test(String(sea.pod || '')) ? new Date(new Date(sea.pod_date).getTime() - IST).toISOString() : sea.pod_date
  }
  return job.eta || null
}

// The one verb for a row, taken from what the problem is (audit: no more 'Open')
function actionOf(item, j) {
  if (!item) return { label: 'Review', icon: 'eye', tab: 'overview' }
  // free time running out while the boxes wait for a truck: the fix is the truck
  if (item.action === 'truck' || (item.action === 'containers' && j.readyForTruck)) {
    if (j.readyForTruck) return { label: j.onwardMode === 'truck' ? 'Assign truck' : 'Arrange truck', icon: 'truck', tab: 'truck' }
    if (item.action === 'truck' && /add the truck number/i.test(item.text)) return { label: 'Add truck no.', icon: 'truck', tab: 'truck' }
    return { label: 'Check truck', icon: 'truck', tab: 'truck' }
  }
  if (item.action === 'containers') return { label: 'Check boxes', icon: 'box', tab: 'containers' }
  if (item.action === 'customs') return { label: 'Update BE stage', icon: 'file-certificate', tab: 'customs' }
  return { label: 'Review', icon: 'eye', tab: 'overview' }
}

const savePref = (k, val) => { try { localStorage.setItem(k, val) } catch { /* private mode: the choice just isn't remembered */ } }

// The issue without what the Since column beside it already says (Jose, 31 Oct 2026:
// "BE filed 9 days ago, OOC not yet" next to "BE 9 d ago" → "OOC not yet")
function issueWords(text) {
  const t = plain(text).replace(/^BE filed \d+ days? ago[,—\s]*/i, '').replace(/^OOC done[,—\s]*/i, '')
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : plain(text)
}

export default function TodayPage({ onOpenJob, onGo }) {
  const { data, active, facts, loading, error, refresh } = useJourney()
  useFreshOnOpen() // opening the page shows the latest saved data
  const [log, setLog] = useState([])
  // the to-do list under a highlight, shown only when it is tapped (Jose, 1 Nov 2026)
  const [shown, setShown] = useState(null) // null | 'action' | 'risk'

  // the last 24 hours of updates (audit: the feed was empty every evening)
  useEffect(() => {
    let cancelled = false
    supabase.from('activity_log').select('*')
      .or(`type.in.(${FEED_TYPES.join(',')}),action.eq.stage_update`)
      .gte('created_at', new Date(Date.now() - DAY).toISOString())
      .order('created_at', { ascending: false }).limit(40)
      .then(({ data: got }) => { if (!cancelled) setLog(got || []) })
    return () => { cancelled = true }
  }, [data])

  // 'now' is when the data was loaded: every figure on the page is from that moment
  const now = data ? new Date(data.loadedAt).getTime() : 0

  // every active job, import and export alike (Jose, 1 Nov 2026: no All / Import / Export
  // or Everyone / My jobs switches on Today)
  const v = useMemo(() => {
    const act = active.filter((r) => !!r.job)
    const ids = new Set(act.map((r) => r.job.id))
    const boxes = facts.containers.filter((c) => ids.has(c.jobId))
    const risk = facts.detention.filter((r) => ids.has(r.job.id))
    const all = act.map((r) => {
      const items = r.j.attention || []
      const level = worst(r.j)
      const main = items.find((a) => a.level === 'red') || items.find((a) => a.level === 'amber') || items.find((a) => a.level === 'info') || null
      const notIn = !isExportJob(r.job) && r.j.steps?.find((st) => st.id === 'arrival')?.done === false
      return { ...r, id: r.job.id, level, main, eta: notIn ? etaOf(r.job, data) : null, free: r.j.freeDaysLeft, act: actionOf(main, r.j) }
    })
    const byId = Object.fromEntries(all.map((x) => [x.id, x]))
    const action = all.filter((x) => x.level === 'red' || x.level === 'amber')
    return { act, all, byId, boxes, risk, action }
  }, [active, facts, data])

  const dash = loading && !data
  const red = v.action.filter((x) => x.level === 'red').length
  const firstRisk = [...v.risk].sort((a, b) => a.j.freeDaysLeft - b.j.freeDaysLeft)[0]
  const openBoxes = v.boxes.filter((c) => !c.finishedOn).length
  const toggle = (id) => setShown((cur) => (cur === id ? null : id))
  const open = (id, tab) => onOpenJob?.(id, tab)
  // Active jobs opens All jobs (the list is there; Today does not repeat it)
  const openActive = () => { savePref('ix_jobs_view', 'open'); onGo?.('jobs') }

  // the to-do list: one plain line per job, what to do and why, worst first
  const todo = useMemo(() => {
    const list = shown === 'risk' ? v.risk.map((r) => v.byId[r.job.id]).filter(Boolean) : shown === 'action' ? v.action : []
    return [...list].sort((a, b) => (a.level === 'red' ? 0 : 1) - (b.level === 'red' ? 0 : 1) || (a.free ?? 9999) - (b.free ?? 9999))
  }, [shown, v])

  // ── page head: 'Sunday 1 Nov · refreshed 00:43 IST' ──
  const dateText = now ? `${WEEKDAY[new Date(now + IST).getUTCDay()]} ${fmtDate(data.loadedAt)}` : null
  const sub = [dateText, data && <span title={`Loaded ${timeAgo(data.loadedAt)}`}>refreshed {fmtTime(data.loadedAt)} IST</span>]

  return (
    <>
      <PageHead title="Today" sub={sub} actions={
        <Button variant="ghost" size="sm" icon="refresh" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
      } />

      {error && <div className="ix-error">Could not load the latest data: {error}. Press Refresh.</div>}

      {/* the three highlights, and nothing else on top (Jose, 1 Nov 2026) */}
      <KpiStrip className="ix-td-kpis">
        <Kpi label="Active jobs" value={dash ? null : v.act.length} sub={!dash && (openBoxes ? `${openBoxes} container${openBoxes === 1 ? '' : 's'} open` : 'no containers open')}
          onClick={openActive} title="Open All jobs" />
        <Kpi label="Need action" dot="amber" value={dash ? null : v.action.length} unit={v.action.length === 1 ? 'job' : 'jobs'}
          sub={!dash && (v.action.length ? `${red} act today · ${v.action.length - red} soon` : 'nothing waiting')}
          onClick={() => toggle('action')} selected={shown === 'action'} title="What to do, job by job" />
        <Kpi label="Free days ≤ 2" dot="red" tone={v.risk.length ? 'red' : undefined} value={dash ? null : v.risk.length} unit={v.risk.length ? 'at risk' : undefined}
          sub={!dash && (firstRisk
            ? <><JobNo no={firstRisk.job.job_no} /> {firstRisk.j.freeDaysLeft < 0 ? `${-firstRisk.j.freeDaysLeft} d over` : firstRisk.j.freeTill ? `free till ${fmtDate(firstRisk.j.freeTill)}` : `${firstRisk.j.freeDaysLeft} d left`}</>
            : 'no risk today')}
          onClick={() => toggle('risk')} selected={shown === 'risk'} title="Jobs whose free time is about to end" />
      </KpiStrip>

      {/* tapped: a short to-do list in plain words, not a jobs table */}
      {shown && !dash && (
        <section className="ix-td-todo" aria-label={shown === 'risk' ? 'Free days 2 or less' : 'Need action'}>
          <div className="hd">
            <b>{shown === 'risk' ? 'Free time ending' : 'To do'}</b>
            <button type="button" className="ix-icon-btn sm" onClick={() => setShown(null)} aria-label="Close"><Icon name="x" /></button>
          </div>
          {!todo.length
            ? <EmptyState line icon="circle-check" tone="green" title={shown === 'risk' ? 'No job is close to detention.' : 'Nothing needs action right now.'} />
            : todo.map((x) => (
              <div key={x.id} className={`it ${x.level}`} onClick={() => open(x.id)}>
                <span className="dot" />
                <JobNo no={x.job.job_no} onClick={() => open(x.id)} />
                <p>
                  <b>{todoText(x)}</b>
                  <small>{[x.job.client, freeText(x)].filter(Boolean).join(' · ')}</small>
                </p>
                <Button size="sm" variant={x.level === 'red' ? 'primary' : 'secondary'} urgent={x.level === 'red'} icon={x.act.icon}
                  onClick={(e) => { e.stopPropagation(); open(x.id, x.act.tab) }}>{x.act.label}</Button>
              </div>
            ))}
        </section>
      )}

      <div className="ix-td-grid">
        <Runway v={v} dash={dash} now={now} onOpenJob={open} />
        <Updates log={log} v={v} dash={dash} now={now} onOpenJob={open} />
      </div>
    </>
  )
}

// What to do, in a few words: "Arrange a truck", "Pay the duty", "Add the truck number"
function todoText(x) {
  // 'Check truck' is a papers problem or a stopped truck: say that, not 'Arrange a truck'
  // (the truck number once: 'Truck MH46AR2016 papers problem: road tax expired …')
  if (x.act.tab === 'truck') return x.act.label === 'Add truck no.' ? 'Add the truck number' : x.act.label === 'Check truck' && x.main ? issueWords(x.main.text).replace(/\b([A-Z0-9]{6,})\b(.*?): \1: /, '$1$2: ') : 'Arrange a truck'
  if (!x.main) return 'Have a look'
  return issueWords(x.main.text)
}
// "5 free days left (till 6 Nov)", "2 d over free time"
function freeText(x) {
  if (x.free === null || x.free === undefined) return null
  const till = x.j.freeTill ? ` (till ${fmtDate(x.j.freeTill)})` : ''
  return x.free < 0 ? `${-x.free} d over free time` : x.free === 0 ? `last free day today${till}` : `${x.free} free day${x.free === 1 ? '' : 's'} left${till}`
}

// ── Free-time runway: the next 14 days, one bar per job to its last free day ──
function Runway({ v, dash, now, onOpenJob }) {
  const today = Math.floor((now + IST) / DAY)
  const days = Array.from({ length: 14 }, (_, k) => { const t = new Date((today + k) * DAY); return { d: t.getUTCDate(), w: t.getUTCDay() } })
  const imports = v.all.filter((x) => !isExportJob(x.job))
  const freeRows = imports.filter((x) => x.free !== null && x.free !== undefined)
  // not arrived yet: a diamond on the ETA day
  const etaRows = imports.filter((x) => x.eta && (x.free === null || x.free === undefined))
    .map((x) => ({ ...x, until: -daysAgo(x.eta, now) })).filter((x) => x.until >= 0)
  const rowsIn = [
    ...freeRows.filter((x) => x.free <= 13).map((x) => ({ ...x, pos: Math.max(x.free, 0), k: x.free, type: 'free' })),
    ...etaRows.filter((x) => x.until <= 13).map((x) => ({ ...x, pos: x.until, k: x.until, type: 'eta' })),
  ].sort((a, b) => a.k - b.k)
  const later = [
    ...freeRows.filter((x) => x.free > 13).map((x) => ({ x, text: `free till ${fmtDate(x.j.freeTill)}`, k: x.free })),
    ...etaRows.filter((x) => x.until > 13).map((x) => ({ x, text: `ETA ${fmtDate(x.eta)}`, k: x.until })),
  ].sort((a, b) => a.k - b.k)
  const shown = rowsIn.slice(0, 14)

  return (
    <Panel title="Free time runway" meta="next 14 days · per job, earliest box" className="ix-td-runway">
      {dash ? <Skeleton rows={5} /> : !rowsIn.length ? (
        <EmptyState line icon="clock" tone="green" title="No free time ends in the next 14 days.">{later.length ? `Next: ${later[0].x.job.job_no}, ${later[0].text}.` : null}</EmptyState>
      ) : (
        <div className="runway">
          <div className="rw-row rw-head">
            <div className="who">Job</div>
            <div className="rw-track">{days.map((d, k) => <div key={k} className={k === 0 ? 'today' : ''}><b>{d.d}</b>{WD1[d.w]}</div>)}</div>
          </div>
          <div className="rw-body">
            <div className="rw-row rw-under" aria-hidden="true">
              <div />
              <div className="rw-bg">{days.map((d, k) => <div key={k} className={`${k === 0 ? 'today' : ''}${d.w === 0 ? ' we' : ''}`} />)}</div>
            </div>
            {shown.map((x) => {
              const lvl = x.type === 'free' ? detentionLevel(x.free) : null
              const tone = lvl === 'over' || lvl === 'risk' ? 'red' : lvl === 'soon' ? 'amber' : ''
              const label = x.type === 'eta' ? `ETA ${fmtDate(x.eta)}` : x.free < 0 ? `${-x.free} d over` : fmtDate(x.j.freeTill)
              const n = (x.j.containers?.nos || []).length
              return (
                <div key={x.id} className="rw-row click" onClick={() => onOpenJob(x.id, x.type === 'free' ? 'containers' : undefined)} title={`${x.job.job_no} · ${label}`}>
                  <div className="who"><JobNo no={x.job.job_no} size="sm" /><span>{x.job.client || ''}{n > 1 ? ` · ${n} boxes` : ''}</span></div>
                  <div className="rw-track">
                    {x.type === 'eta'
                      ? <>
                        <span className="rw-eta" style={{ gridColumn: x.pos + 1 }} />
                        {/* the ETA date as text beside the diamond (phones only: there is no hover there) */}
                        <em className={`rw-eta-t${x.pos > 9 ? ' before' : ''}`} style={{ gridColumn: x.pos > 9 ? `${x.pos - 3} / span 4` : `${x.pos + 2} / span 4` }}>{fmtDate(x.eta)}</em>
                      </>
                      : <div className={`rw-bar ${tone}`} style={{ gridColumn: `1 / span ${x.pos + 1}` }}><span>{label}</span></div>}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="rw-foot">
            <span className="ix-td-legend">
              <span><i className="red" />≤ 2 d</span><span><i className="amber" />3–5 d</span><span><i className="navy" />6 d +</span>
              {etaRows.length > 0 && <span><i className="eta" />ETA</span>}
            </span>
            {(later.length > 0 || rowsIn.length > shown.length) && (
              <span className="later">
                {rowsIn.length > shown.length && `+${rowsIn.length - shown.length} more · `}
                {later.length > 0 && <>Later: <JobNo no={later[0].x.job.job_no} size="sm" /> {later[0].text}{later.length > 1 ? ` · +${later.length - 1}` : ''}</>}
              </span>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}

// ── Latest updates: the last 24 h of saved updates plus this trip's container moves ──
const EV_ICON = (label) => (/road/i.test(label) ? ['road', ''] : /rail/i.test(label) ? ['train', ''] : /empty/i.test(label) ? ['box', 'ok'] : ['anchor', 'port'])
function Updates({ log, v, dash, now, onOpenJob }) {
  const events = useMemo(() => {
    if (!now) return []
    const out = []
    for (const r of log) {
      const type = r.type || r.action
      const no = r.job_no ? String(r.job_no) : null
      let text = plain(r.title || String(type || '').replace(/_/g, ' '))
      // 'assigned, J-620 (truck 2)' → 'assigned (truck 2)': the comma before the job number goes too
      if (no) text = text.replace(new RegExp(`,?\\s*${reEscape(no)}\\s*`), ' ').replace(/^[\s,—-]+|[\s,—-]+$/g, '').trim()
      const [icon, cls] = FEED_ICON[type] || ['point', '']
      out.push({
        key: `l${r.id}`, at: r.created_at, jobId: r.job_id || null, jobNo: no, text: text || 'Update',
        // the note may already say '(by Jose)': then the name is not added again
        small: [NO_NOTE.includes(type) ? null : plain(r.note), r.done_by_name && !String(r.note || '').includes(r.done_by_name) ? r.done_by_name : null].filter(Boolean).join(' · '), icon, cls,
      })
    }
    for (const c of v.boxes) {
      for (const m of c.milestones || []) {
        const t = new Date(m.at).getTime()
        if (isNaN(t) || t < now - DAY || t > now + 3600000) continue
        const [icon, cls] = EV_ICON(m.label || '')
        out.push({ key: `c${c.no}${m.at}${m.raw}`, at: m.at, jobId: c.jobId, jobNo: c.jobNo, text: m.label || 'Container update', small: [c.no, m.place].filter(Boolean).join(' · '), mono: true, icon, cls })
      }
    }
    return out.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 15)
  }, [log, v, now])

  const today = Math.floor((now + IST) / DAY)
  const dayOf = (iso) => Math.floor((new Date(iso).getTime() + IST) / DAY)
  return (
    <Panel title="Latest updates" meta="last 24 h · IST" className="ix-td-updates">
      {dash ? <Skeleton rows={4} /> : !events.length ? (
        <EmptyState line icon="activity" title="No updates in the last 24 hours." />
      ) : (
        <div className="ix-td-feed">
          {events.map((e, i) => {
            const dn = dayOf(e.at)
            const newDay = i === 0 || dayOf(events[i - 1].at) !== dn
            return [
              newDay ? <div className="day" key={`d${dn}`}>{dn === today ? 'Today · ' : dn === today - 1 ? 'Yesterday · ' : ''}{fmtDate(e.at)}</div> : null,
              <div key={e.key} className={`ev${e.jobId ? ' click' : ''}`} onClick={() => e.jobId && onOpenJob(e.jobId)}>
                <time>{fmtTime(e.at)}</time>
                <span className={`ic ${e.cls}`}><Icon name={e.icon} /></span>
                <p>
                  {e.jobNo && <><JobNo no={e.jobNo} size="sm" /> </>}{e.text}
                  {e.small ? <small className={e.mono ? 'boxno' : undefined}>{e.small}</small> : null}
                </p>
              </div>,
            ]
          })}
        </div>
      )}
    </Panel>
  )
}
