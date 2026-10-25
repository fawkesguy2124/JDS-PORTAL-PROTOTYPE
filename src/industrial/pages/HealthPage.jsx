import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { Chip, Icon, Skeleton, timeAgo } from '../ui'

// System health (Jose, 25 Oct 2026): is every background service running?
// One database call (system_health) — green / amber / red cards, refreshed every minute.

const MIN = 60000
const ageMin = (iso, now) => (iso ? (now - new Date(iso).getTime()) / MIN : Infinity)

// plain names for the schedules
const CRON_NAMES = {
  'auto-check': ['Automatic ULIP checks', 'every 5 minutes'],
  'sea-track': ['Ship tracking', 'every hour'],
  'vessel-track': ['Ship positions (old)', ''],
  'refresh-containers-every-30-min': ['Container tracking', 'every 30 minutes'],
  'wa-bot-alerts': ['WhatsApp & desktop alerts', 'every 15 minutes'],
  'wa-bot-warm': ['Keep WhatsApp assistant awake', ''],
  'wa-bot-morning': ['8:00 morning summary', ''],
  'weekly-backup': ['Weekly backup', ''],
}
const KIND_NAMES = { ooc: 'OOC check', truck: 'Truck FASTag', papers: 'Truck papers' }
const KIND_MANY = { ooc: 'OOC checks', truck: 'trucks on FASTag', papers: 'truck paper checks' }
const API_NAMES = {
  'ICEGATE/01': 'Customs (BE status)', 'ICEGATE/02': 'Customs (BE details)', 'ICEGATE/03': 'Customs (OOC)', 'PCS/01': 'Port (container in/out)', 'ICEGATE/07': 'Customs (shipping bill)',
  'LDB/01': 'Container movement', 'FASTAG/01': 'FASTag tolls', 'VAHAN/04': 'Truck papers',
}

const nextIn = (iso, now) => {
  if (!iso) return '—'
  const m = Math.round((new Date(iso).getTime() - now) / MIN)
  return m <= 0 ? 'due now' : m < 60 ? `in ${m} min` : `in ${Math.round(m / 60)} h`
}

const TONE_ICON = { green: 'circle-check', amber: 'alert-triangle', red: 'alert-octagon' }

function Service({ icon, title, tone, status, facts }) {
  return (
    <div className={`ix-card ix-health ${tone}`}>
      <div className="top">
        <span className="ico"><Icon name={icon} /></span>
        <b>{title}</b>
        <Chip tone={tone} icon={TONE_ICON[tone]}>{tone === 'green' ? 'Running' : tone === 'amber' ? 'Check' : 'Problem'}</Chip>
      </div>
      <div className="status">{status}</div>
      <div className="facts">
        {facts.filter(Boolean).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
      </div>
    </div>
  )
}

export default function HealthPage() {
  const [h, setH] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const [tick, setTick] = useState(0) // "Check now" asks again

  useEffect(() => {
    let off = false
    const load = () => supabase.rpc('system_health').then(({ data, error }) => {
      if (off) return
      setBusy(false)
      if (error) { setErr(error.message); return }
      setErr(null)
      setH(data)
    })
    load()
    const t = setInterval(load, MIN)
    return () => { off = true; clearInterval(t) }
  }, [tick])

  if (!h) {
    return (
      <div className="ix-page">
        <div className="ix-page-head"><div><h1>System health</h1><p>Checking every background service…</p></div></div>
        {err ? <div className="ix-error">Could not check — {err}</div> : <div className="ix-card"><Skeleton rows={6} /></div>}
      </div>
    )
  }

  const now = new Date(h.now).getTime()
  const cron = h.cron || []
  const cronOf = (name) => cron.find((c) => c.name === name)
  const cronBad = (c) => c && c.active && c.last_status && c.last_status !== 'succeeded'

  // automatic checks
  const a = h.auto || {}
  const autoAge = ageMin(a.last_run, now)
  const paused = a.paused_until && new Date(a.paused_until).getTime() > now
  const autoTone = paused || cronBad(cronOf('auto-check')) ? 'red'
    : a.watching && autoAge > 90 ? 'amber' : a.failing ? 'amber' : 'green'
  const kinds = Object.entries(a.by_kind || {}).map(([k, n]) => `${n} ${(n === 1 ? KIND_NAMES : KIND_MANY)[k] || k}`).join(' · ')

  // ships
  const s = h.ships || {}
  const shipAge = ageMin(s.last_update, now)
  const shipTone = cronBad(cronOf('sea-track')) ? 'red'
    : s.tracked && shipAge > 90 ? 'amber' : s.refresh_errors || s.errors ? 'amber' : 'green'

  // containers
  const c = h.containers || {}
  const boxAge = ageMin(c.last_refresh, now)
  const boxTone = cronBad(cronOf('refresh-containers-every-30-min')) ? 'red' : c.tracked && boxAge > 90 ? 'amber' : 'green'

  // WhatsApp
  const w = h.whatsapp_24h || {}
  const sumAge = ageMin(h.last_summary, now)
  const waTone = cronBad(cronOf('wa-bot-alerts')) ? 'red' : w.failed ? 'amber' : sumAge > 26 * 60 ? 'amber' : 'green'

  const ulip = Object.entries(h.ulip_24h || {}).sort((x, y) => x[0].localeCompare(y[0]))
  const ulipTone = ulip.some(([, u]) => u.failed && !u.ok) ? 'red' : ulip.some(([, u]) => u.failed) ? 'amber' : 'green'

  const tones = [autoTone, shipTone, boxTone, waTone, ulipTone]
  const overall = tones.includes('red') ? 'red' : tones.includes('amber') ? 'amber' : 'green'
  const headline = overall === 'green' ? 'Everything is running normally.'
    : overall === 'amber' ? 'Running, but something needs a look.' : 'Something has stopped — see the red card.'

  return (
    <div className="ix-page ix-health-page">
      <div className="ix-page-head">
        <div>
          <h1>System health</h1>
          <p>Background services that keep the portal, alerts and WhatsApp up to date · checked {timeAgo(h.now)}</p>
        </div>
        <div className="right">
          <button type="button" className="ix-btn" onClick={() => { setBusy(true); setTick((n) => n + 1) }} disabled={busy}><Icon name="refresh" />{busy ? 'Checking…' : 'Check now'}</button>
        </div>
      </div>
      {err && <div className="ix-error">Last check failed — {err}. Showing the previous result.</div>}

      <div className={`ix-health-banner ${overall}`}>
        <Icon name={TONE_ICON[overall]} /><b>{headline}</b>
      </div>

      <div className="ix-health-grid">
        <Service icon="robot" title="Automatic checks" tone={autoTone}
          status={paused ? `Paused after errors until ${new Date(a.paused_until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
            : a.watching ? `Watching ${a.watching} item${a.watching === 1 ? '' : 's'}` : 'Nothing to watch right now'}
          facts={[
            ['Last check', a.last_run ? timeAgo(a.last_run) : 'not yet'],
            ['Next check', nextIn(a.next_due, now)],
            kinds && ['Watching', kinds],
            a.failing ? ['With errors', a.failing] : null,
          ]} />
        <Service icon="ship" title="Ship tracking" tone={shipTone}
          status={s.tracked ? `${s.tracked} ship${s.tracked === 1 ? '' : 's'} on the way` : 'No ships being tracked'}
          facts={[
            ['Last update', s.last_update ? timeAgo(s.last_update) : 'not yet'],
            ['Shipments used this month', `${h.safecube_used || 0} of 45`],
            s.refresh_errors ? ['Last refresh failed', `${s.refresh_errors} (showing last good data)`] : null,
            s.errors ? ['Could not track', s.errors] : null,
          ]} />
        <Service icon="box" title="Container tracking" tone={boxTone}
          status={`${c.tracked || 0} containers`}
          facts={[['Last refresh', c.last_refresh ? timeAgo(c.last_refresh) : 'not yet']]} />
        <Service icon="brand-whatsapp" title="WhatsApp & alerts" tone={waTone}
          status={`${w.sent || 0} message${w.sent === 1 ? '' : 's'} sent in the last 24 hours`}
          facts={[
            ['Morning summary', h.last_summary ? timeAgo(h.last_summary) : 'not yet'],
            ['Last message sent', w.last_sent ? timeAgo(w.last_sent) : '—'],
            ['Held (outside 24 h window)', w.held || 0],
            w.failed ? ['Failed', w.failed] : null,
            ['Desktop alerts', `${w.desktop || 0} sent · ${h.desktop_computers || 0} computer${h.desktop_computers === 1 ? '' : 's'}`],
          ]} />
      </div>

      <div className="ix-grid-2">
        <div className="ix-card">
          <div className="ix-card-head"><Icon name="history" style={{ color: 'var(--navy)' }} /><h2>Recent automatic checks</h2></div>
          {(h.auto_recent || []).length === 0 ? <div className="ix-empty">No automatic checks have run yet.</div> : (
            <div className="ix-tbl-wrap"><table className="ix-table ix-table-plain">
              <thead><tr><th>Check</th><th>Result</th><th>When</th><th>Next</th></tr></thead>
              <tbody>
                {h.auto_recent.map((r, i) => (
                  <tr key={i}>
                    <td><b>{KIND_NAMES[r.kind] || r.kind}</b> <span className="muted">{r.label}</span></td>
                    <td className="ix-ellipsis" title={r.result || ''}>{r.fails ? <Chip tone="red">error</Chip> : null} {r.result || '—'}</td>
                    <td>{timeAgo(r.last_run)}</td>
                    <td className="muted">{r.next_due ? new Date(r.next_due).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ix-card">
            <div className="ix-card-head"><Icon name="api" style={{ color: 'var(--navy)' }} /><h2>ULIP, last 24 hours</h2></div>
            {ulip.length === 0 ? <div className="ix-empty">No ULIP lookups in the last 24 hours.</div> : (
              <div className="ix-tbl-wrap"><table className="ix-table ix-table-plain">
                <thead><tr><th>Service</th><th>OK</th><th>Failed</th><th>Last</th></tr></thead>
                <tbody>
                  {ulip.map(([api, u]) => (
                    <tr key={api}>
                      <td>{API_NAMES[api] || api}</td>
                      <td className="num">{u.ok}</td>
                      <td className="num" style={u.failed ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{u.failed}</td>
                      <td className="muted">{timeAgo(u.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>

          <div className="ix-card">
            <div className="ix-card-head"><Icon name="calendar-time" style={{ color: 'var(--navy)' }} /><h2>Schedules</h2></div>
            <div className="ix-tbl-wrap"><table className="ix-table ix-table-plain">
              <tbody>
                {cron.filter((j) => j.active).map((j) => {
                  const [name, every] = CRON_NAMES[j.name] || [j.name, j.schedule]
                  const ok = !j.last_status || j.last_status === 'succeeded'
                  return (
                    <tr key={j.name} title={j.last_message || ''}>
                      <td><span className={`ix-dot ${ok ? 'green' : 'red'}`} /> {name} <span className="muted">{every}</span></td>
                      <td className="muted" style={{ textAlign: 'right' }}>{j.last_start ? `ran ${timeAgo(j.last_start)}` : 'not run yet'}{ok ? '' : ' · failed'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          </div>
        </div>
      </div>
    </div>
  )
}
