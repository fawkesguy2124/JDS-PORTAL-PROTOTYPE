import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { PageHead, Panel, Status, Chip, Button, Dash, EmptyState, Skeleton, fmtTime, fmtDateTime, timeAgo } from '../ui'
import { healthTones } from '../AutoStatus'
import '../styles/records.css'

// System health (Jose, 25 Oct 2026): is every background service running?
// One database call (system_health), re-read every minute. Reading it never starts a
// government check. The green / amber / red rules are shared with the sidebar dots
// (healthTones in AutoStatus.jsx), so the page and the sidebar always agree.

const MIN = 60000

// plain names for the schedules (no system or vendor names on screen, Jose 31 Oct 2026)
const CRON_NAMES = {
  'auto-check': ['Automatic checks', 'every 5 minutes'],
  'sea-track': ['Ship tracking', 'every hour'],
  'vessel-track': ['Ship positions (old)', ''],
  'refresh-containers-every-30-min': ['Container tracking', 'every 30 minutes'],
  'wa-bot-alerts': ['WhatsApp & desktop alerts', 'every 5 minutes'],
  'wa-bot-warm': ['Keep WhatsApp assistant awake', ''],
  'wa-bot-morning': ['8:00 morning summary', ''],
  'weekly-backup': ['Weekly backup', ''],
}
const KIND_NAMES = { ooc: 'OOC check', truck: 'Truck at tolls', papers: 'Truck papers' }
const KIND_MANY = { ooc: 'OOC checks', truck: 'trucks at tolls', papers: 'truck paper checks' }
const API_NAMES = {
  'ICEGATE/01': 'Customs (BE status)', 'ICEGATE/02': 'Customs (BE details)', 'ICEGATE/03': 'Customs (OOC)', 'ICEGATE/07': 'Customs (shipping bill)',
  'ICEGATE/09': 'Customs (air IGM)', 'LDB/01': 'Container movement', 'JNPT/02': 'Port (JNPT)', 'CFSICD/01': 'Containers at CFS / ICD',
  'FASTAG/01': 'Toll plazas (trucks)', 'FASTAG/02': 'Toll tag status', 'VAHAN/04': 'Truck papers', 'VAHAN/05': 'Truck papers (owner)',
  'DGFT/01': 'Client IEC check', 'SARATHI/01': 'Driver licence', 'EWAYBILL/01': 'E-way bill',
  'PCS/01': 'Port backup (IGM containers)', 'PCS/02': 'Port backup (shipping bill)', 'PCS/03': 'Port backup (LEO)',
  'PCS/04': 'Port backup (BE details)', 'PCS/05': 'Port backup (OOC)',
}
// a lookup with no plain name keeps its own row, not three alike "Other" rows (Jose, 1 Nov 2026)
const apiName = (api) => API_NAMES[api] || `Other lookup (${api})`
// the toll time in a result comes as '2026-11-01T05:24:02' (IST, no zone): show '1 Nov, 05:24'
const ISO_IN_TEXT = /\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(Z|[+-]\d\d:?\d\d)?/g
const readable = (text) => String(text).replace(ISO_IN_TEXT, (m, zone) => fmtDateTime(zone ? m : `${m}+05:30`))
const TONE_WORD = { green: 'Running', amber: 'Needs a look', red: 'Problem' }

// an absolute IST time on screen, the "x min ago" in the tooltip
const When = ({ iso, empty = 'not yet' }) => (iso
  ? <span title={timeAgo(iso)}>{fmtDateTime(iso)}</span>
  : <span className="muted">{empty}</span>)

export default function HealthPage() {
  const [h, setH] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0) // "Check now" reads it again

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

  const checkNow = <Button icon="refresh" onClick={() => { setBusy(true); setTick((n) => n + 1) }} disabled={busy}>{busy ? 'Checking…' : 'Check now'}</Button>

  if (!h) {
    return (
      <>
        <PageHead title="System health" sub="Checking every background service…" actions={err ? checkNow : null} />
        {err ? <div className="ix-error">Could not check — {err}</div> : <div className="ix-card"><Skeleton rows={6} /></div>}
      </>
    )
  }

  const now = new Date(h.now).getTime()
  const t = healthTones(h)
  const cron = h.cron || []

  const a = h.auto || {}
  const kinds = Object.entries(a.by_kind || {}).map(([k, n]) => `${n} ${(n === 1 ? KIND_NAMES : KIND_MANY)[k] || k}`).join(' · ')
  const s = h.ships || {}
  const c = h.containers || {}
  const w = h.whatsapp_24h || {}
  const gov = Object.entries(h.ulip_24h || {}).sort((x, y) => x[0].localeCompare(y[0]))
  const govOk = gov.reduce((n, [, u]) => n + (u.ok || 0), 0)
  const govFailed = gov.reduce((n, [, u]) => n + (u.failed || 0), 0)
  const govLast = gov.map(([, u]) => u.last).filter(Boolean).sort().at(-1) || null
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

  const services = [
    {
      id: 'auto', name: 'Automatic checks', tone: t.auto, last: a.last_run, next: a.next_due,
      status: t.paused ? `Paused after errors until ${fmtTime(a.paused_until)}` : a.watching ? `Watching ${plural(a.watching, 'item', 'items')}` : 'Nothing to watch right now',
      details: [kinds, a.failing ? `${a.failing} with errors` : null],
    },
    {
      id: 'ships', name: 'Ship tracking', tone: t.ships, last: s.last_update,
      status: s.tracked ? `${plural(s.tracked, 'ship', 'ships')} on the way` : 'No ships being tracked',
      details: [`${h.safecube_used || 0} of 45 tracked shipments used this month`,
        s.refresh_errors ? `last refresh failed (${s.refresh_errors}), showing the last good data` : null,
        s.errors ? `could not track ${s.errors}` : null],
    },
    { id: 'boxes', name: 'Container tracking', tone: t.boxes, last: c.last_refresh, status: plural(c.tracked || 0, 'container', 'containers'), details: [] },
    {
      id: 'wa', name: 'WhatsApp & alerts', tone: t.whatsapp, last: w.last_sent,
      status: `${plural(w.sent || 0, 'message', 'messages')} sent in the last 24 hours`,
      details: [h.last_summary ? `morning summary ${fmtDateTime(h.last_summary)}` : 'no morning summary yet',
        `${w.held || 0} held (outside the 24 h window)`, w.failed ? `${w.failed} failed` : null,
        `desktop alerts ${w.desktop || 0} sent · ${plural(h.desktop_computers || 0, 'computer', 'computers')}`],
    },
    { id: 'gov', name: 'Government lookups', tone: t.gov, last: govLast, status: `${govOk} answered · ${govFailed} failed in 24 hours`, details: [] },
  ]
  const headline = t.overall === 'green' ? 'Everything is running normally'
    : t.overall === 'amber' ? 'Running, but something needs a look' : 'Something has stopped, see the red row'

  return (
    <>
      <PageHead title="System health"
        sub={[<Status key="o" tone={t.overall}>{headline}</Status>, `checked ${fmtTime(h.now)} IST`]}
        actions={checkNow} />
      {err && <div className="ix-error">Last check failed — {err}. Showing the previous result.</div>}

      {/* no count tiles: they repeated the Services rows below (Jose, 31 Oct 2026) */}
      <Panel title="Services" className="rec-panel">
        <div className="ix-tbl-wrap">
          <table className="ix-tbl rec-tbl rec-cards">
            <thead><tr><th className="lvl" /><th>Service</th><th>State</th><th>Now</th><th>Last</th><th>Next</th><th>Details</th></tr></thead>
            <tbody>
              {services.map((x) => (
                <tr key={x.id} className={x.tone === 'green' ? '' : x.tone}>
                  <td className="lvl" />
                  <td className="c-main"><b className="rec-n">{x.name}</b></td>
                  <td><Status tone={x.tone}>{TONE_WORD[x.tone]}</Status></td>
                  <td className="c-full">{x.status}</td>
                  <td className="dim" data-l="Last"><When iso={x.last} /></td>
                  <td className="dim" data-l="Next">{x.next ? (new Date(x.next).getTime() <= now ? 'due now' : fmtTime(x.next)) : <Dash />}</td>
                  <td className="dim wide c-full" title={x.details.filter(Boolean).join(' · ')}>{x.details.filter(Boolean).join(' · ') || <Dash />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="rec-health-grid">
        <div>
          <Panel title="Recent automatic checks" meta={kinds || null} className="rec-panel">
            {(h.auto_recent || []).length === 0 ? <EmptyState line icon="history" title="No automatic checks have run yet." /> : (
              <div className="ix-tbl-wrap">
                <table className="ix-tbl rec-tbl rec-cards narrow">
                  <thead><tr><th>Check</th><th>Result</th><th>When</th><th>Next</th></tr></thead>
                  <tbody>
                    {h.auto_recent.map((r, i) => (
                      <tr key={i}>
                        <td className="c-full"><b className="rec-n">{KIND_NAMES[r.kind] || r.kind}</b>{r.label ? <span className="rec-x">{r.label}</span> : null}</td>
                        <td className="wide c-full" title={r.result ? readable(r.result) : ''}>{r.fails ? <><Chip tone="red">error</Chip> </> : null}{r.result ? readable(r.result) : <Dash />}</td>
                        <td className="dim" data-l="Checked"><When iso={r.last_run} empty="—" /></td>
                        <td className="dim" data-l="Next">{r.next_due ? fmtTime(r.next_due) : <Dash />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div>
          <Panel title="Government lookups" meta="last 24 hours" className="rec-panel">
            {gov.length === 0 ? <EmptyState line icon="building-bank" title="No lookups in the last 24 hours." /> : (
              <div className="ix-tbl-wrap">
                <table className="ix-tbl rec-tbl rec-cards narrow">
                  <thead><tr><th>Source</th><th className="r">OK</th><th className="r">Failed</th><th>Last</th></tr></thead>
                  <tbody>
                    {gov.map(([api, u]) => (
                      <tr key={api} className={u.failed && !u.ok ? 'red' : ''}>
                        <td className="c-full">{apiName(api)}</td>
                        <td className="r" data-l="OK">{u.ok || <Dash />}</td>
                        <td className="r" data-l="Failed">{u.failed ? <b className="rec-bad">{u.failed}</b> : <Dash />}</td>
                        <td className="dim" data-l="Last"><When iso={u.last} empty="—" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Schedules" className="rec-panel">
            <div className="ix-tbl-wrap">
              <table className="ix-tbl rec-tbl rec-cards narrow">
                <thead><tr><th>Schedule</th><th>How often</th><th>Last run</th></tr></thead>
                <tbody>
                  {cron.filter((j) => j.active).map((j) => {
                    const [name, every] = CRON_NAMES[j.name] || [j.name, j.schedule]
                    const ok = !j.last_status || j.last_status === 'succeeded'
                    return (
                      <tr key={j.name} title={j.last_message || ''}>
                        <td className="c-main"><Status tone={ok ? 'green' : 'red'}>{name}</Status></td>
                        <td className="dim">{every || <Dash />}</td>
                        <td className="dim c-full" data-l="Last run">{j.last_start ? <When iso={j.last_start} /> : 'not run yet'}{ok ? '' : ' · failed'}
                          {/* phones have no hover: the reason it failed shows as text there */}
                          {!ok && j.last_message ? <span className="rec-msg">{j.last_message}</span> : null}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
