import { Suspense, lazy, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { Icon, Chip, timeAgo } from '../ui'
import { useJourney } from '../JourneyContext'

// Vessels: where the ships of open jobs are, from live AIS (aisstream.io, free).
// The positions are collected by the vessel-track function every 30 minutes;
// opening this page asks for a fresh listen if the last one is over 10 minutes
// old. Not ULIP.
const VesselMap = lazy(() => import('../VesselMap'))
const NHAVA_SHEVA = [18.95, 72.95]
const FRESH_MIN = 10
const STALE_HOURS = 12

// sea distance is longer than a straight line; this is the straight line (nautical miles)
function nmTo([lat2, lon2], lat1, lon1) {
  const r = (d) => (d * Math.PI) / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2
  return 3440.1 * 2 * Math.asin(Math.sqrt(a))
}
const NAV = { 0: 'Under way', 1: 'At anchor', 2: 'Not under command', 3: 'Restricted', 5: 'Moored', 8: 'Sailing' }

export default function VesselsPage({ onOpenJob, showToast }) {
  const [ships, setShips] = useState(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [selected, setSelected] = useState(null)
  const { rows } = useJourney()
  const openNo = (no) => { const r = rows.find((x) => x.job.job_no === no); if (r) onOpenJob?.(r.job.id) }

  const load = async () => {
    const { data, error: e } = await supabase.from('vessel_positions').select('*').order('name')
    if (e) { setError(/relation|does not exist/i.test(e.message) ? 'Ship tracking is not switched on yet.' : e.message); setShips([]); return [] }
    setShips(data || [])
    return data || []
  }

  const listen = async (byHand) => {
    setChecking(true)
    const { data, error: e } = await supabase.functions.invoke('vessel-track', { body: {} })
    setChecking(false)
    if (e || !data?.success) {
      let msg = data?.error
      if (!msg && e?.context?.json) { try { msg = (await e.context.json())?.error } catch { /* ignore */ } }
      if (byHand) showToast?.(msg || 'Could not check the ships right now.', 'error')
      return
    }
    if (byHand) showToast?.(data.skipped ? 'Ships were checked a few minutes ago.' : `Ships checked: ${data.placed} of ${data.ships} placed`, 'success')
    await load()
  }

  // open: show what is saved, and listen again if it is old
  useEffect(() => {
    let gone = false
    ;(async () => {
      const rows = await load()
      if (gone) return
      const last = rows.map((r) => r.checked_at).filter(Boolean).sort().at(-1)
      if (!last || Date.now() - new Date(last).getTime() > FRESH_MIN * 60_000) listen(false)
    })()
    return () => { gone = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const list = (ships || []).map((s) => {
    const placed = typeof s.lat === 'number'
    const nm = placed ? nmTo(NHAVA_SHEVA, s.lat, s.lon) : null
    const stale = !s.seen_at || Date.now() - new Date(s.seen_at).getTime() > STALE_HOURS * 3600e3
    const days = nm !== null && s.sog > 3 ? nm / (s.sog * 24) : null
    return { ...s, placed, nm, stale, days }
  }).sort((a, b) => (a.placed === b.placed ? (a.nm ?? 1e9) - (b.nm ?? 1e9) : a.placed ? -1 : 1))
  const lastCheck = (ships || []).map((r) => r.checked_at).filter(Boolean).sort().at(-1)

  return (
    <div className="ix-page">
      <div className="ix-page-head">
        <div>
          <h1>Vessels</h1>
          <p>Where the ships of open jobs are, from live ship signals (AIS)</p>
        </div>
        <div className="right">
          <button type="button" className="ix-btn sm ghost" onClick={() => listen(true)} disabled={checking}>
            <Icon name="refresh" />{checking ? 'Listening… (about a minute)' : 'Check ships now'}
          </button>
        </div>
      </div>

      <div className="ix-autostatus" style={{ color: checking ? 'var(--navy)' : 'var(--muted)' }} role="status">
        <Icon name={checking ? 'loader-2' : 'ship'} style={checking ? { animation: 'ixSpin 1s linear infinite', display: 'inline-block' } : undefined} />
        <span>{checking ? 'Listening to ship signals for about a minute…' : `Checked by itself every 30 minutes${lastCheck ? ` · last check ${timeAgo(lastCheck)}` : ''}. Ships far out at sea may not be heard until they come near a coast.`}</span>
      </div>

      {error && <div className="ix-error"><Icon name="alert-triangle" /> {error}</div>}

      {ships === null ? <div className="ix-card"><div className="ix-empty">Loading…</div></div> : (
        <>
          <div className="ix-card" style={{ marginBottom: 16 }}>
            <Suspense fallback={<div className="ix-realmap"><div className="ix-realmap-msg">Loading map…</div></div>}>
              <VesselMap ships={list} selected={selected} onSelect={setSelected} />
            </Suspense>
            <div className="ix-card-head">
              <Icon name="ship" style={{ color: 'var(--navy)' }} />
              <h2>Ships of open jobs</h2><span className="ix-chip grey">{list.length}</span>
              <span className="sub hide-m">Distance is a straight line to Nhava Sheva; the sea route is longer.</span>
            </div>
            {list.length === 0 && <div className="ix-empty">No open job has a ship name yet. Ship names come from container tracking.</div>}
            {list.map((s) => (
              <div key={s.name} className={`ix-truck-row ${selected === s.name ? 'sel' : ''}`}>
                <div>
                  <button type="button" className="ix-plate" onClick={() => setSelected(s.name)} title="Show this ship on the map" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </button>
                </div>
                <div style={{ minWidth: 0 }}>
                  {(s.jobs || []).map((no) => (
                    <button key={no} type="button" className="ix-link" style={{ margin: '0 8px 0 0' }} onClick={() => openNo(no)}>{no}</button>
                  ))}
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.destination ? `To: ${s.destination}` : 'Destination not heard yet'}{s.eta_text ? ` · ship's ETA ${s.eta_text}` : ''}</div>
                </div>
                <div style={{ fontSize: 13, minWidth: 0 }}>
                  {s.placed ? (
                    <>
                      <Icon name="map-pin" style={{ color: s.stale ? 'var(--red)' : 'var(--navy)' }} />{' '}
                      {Math.round(s.nm).toLocaleString('en-IN')} nm from Nhava Sheva
                      {s.days !== null && <> · ~{s.days < 1 ? `${Math.round(s.days * 24)} h` : `${s.days.toFixed(1)} days`}</>}
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {typeof s.sog === 'number' ? `${s.sog.toFixed(1)} kn · ` : ''}{NAV[s.nav_status] || ''}{s.seen_at ? ` · seen ${timeAgo(s.seen_at)}` : ''}
                      </div>
                    </>
                  ) : <span style={{ color: 'var(--muted)' }}>Not heard yet</span>}
                </div>
                <div>
                  {s.placed && !s.stale && <Chip tone="green" icon="broadcast">Live</Chip>}
                  {s.placed && s.stale && <Chip tone="amber" icon="clock">Old position</Chip>}
                  {s.candidates?.length > 1 && <Chip tone="grey" icon="info-circle">{s.candidates.length} ships share this name</Chip>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
