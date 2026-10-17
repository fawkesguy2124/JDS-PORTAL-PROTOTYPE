import { useEffect, useMemo, useState } from 'react'
import { loadJourneyData, isDelivered, freeDaysLeftFor } from '../../services/journey'
import { parseContainerNos, getStageName } from '../../utils/jobHelpers'

// Free days and detention risk, per container. Reads saved data only - no ULIP calls.
const TONES = {
  red: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  amber: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  green: { bg: '#ecfdf5', border: '#bbf7d0', text: '#065f46' },
  grey: { bg: '#f1f3f6', border: '#e2e6ed', text: '#5b6678' },
}

function riskOf(days) {
  if (days === null) return { tone: 'grey', label: 'Free days not set' }
  if (days < 0) return { tone: 'red', label: `Detention running (${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} over)` }
  if (days <= 2) return { tone: 'red', label: days === 0 ? 'Last free day today' : `${days} free day${days === 1 ? '' : 's'} left` }
  if (days <= 5) return { tone: 'amber', label: `${days} free days left` }
  return { tone: 'green', label: `${days} free days left` }
}

const shortDate = (v) => {
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v)
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function DetentionPage({ onOpenJob }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      let d = null
      let err
      try {
        d = await loadJourneyData()
        err = d?.error || null
      } catch (e) {
        err = e?.message || 'Something went wrong'
      }
      if (!cancelled) { setData(d); setLoadError(err); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    const out = []
    for (const job of data.jobs) {
      if (isDelivered(job)) continue
      for (const no of parseContainerNos(job.containers)) {
        const ct = data.containersByNo[no]
        if (ct && ['delivered', 'empty_returned'].includes(ct.status)) continue
        const raw = ct ? freeDaysLeftFor(job, ct) : null
        const days = raw === null || raw === undefined || isNaN(Number(raw)) ? null : Number(raw)
        out.push({ key: `${job.id}-${no}`, job, no, days, portIn: ct?.port_in || null, status: ct?.status_text || ct?.status || null })
      }
    }
    // fewest free days first; "not set" last
    return out.sort((a, b) => (a.days === null) - (b.days === null) || (a.days ?? 0) - (b.days ?? 0))
  }, [data])

  const count = (fn) => rows.filter(fn).length
  const tiles = [
    { label: 'In detention', n: count((r) => r.days !== null && r.days < 0), tone: 'red' },
    { label: '2 days or less', n: count((r) => r.days !== null && r.days >= 0 && r.days <= 2), tone: 'red' },
    { label: '5 days or less', n: count((r) => r.days !== null && r.days > 2 && r.days <= 5), tone: 'amber' },
    { label: 'Free days not set', n: count((r) => r.days === null), tone: 'grey' },
  ]

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: '#1a2233', fontSize: '14px', background: '#f4f6f9', padding: '16px', minHeight: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Free days and detention</h1>
      <p style={{ color: '#5b6678', margin: '4px 0 16px' }}>Containers on jobs that are not delivered yet, fewest free days first.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ background: TONES[t.tone].bg, border: `1.5px solid ${TONES[t.tone].border}`, borderRadius: '12px', padding: '12px 14px' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '26px', fontWeight: 700, color: TONES[t.tone].text }}>{loading ? '–' : t.n}</div>
            <div style={{ fontSize: '13px', color: TONES[t.tone].text, fontWeight: 600 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {loading && <div style={{ color: '#5b6678' }}>Loading…</div>}
      {loadError && (
        <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#991b1b', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', fontWeight: 600 }}>
          Could not load the latest data — {loadError}. Press Refresh.
        </div>
      )}
      {!loading && !loadError && rows.length === 0 && (
        <div style={{ background: 'white', border: '1.5px solid #e2e6ed', borderRadius: '12px', padding: '20px', color: '#5b6678' }}>
          No containers waiting on open jobs 🎉
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map((r) => {
          const risk = riskOf(r.days)
          const c = TONES[risk.tone]
          return (
            <button key={r.key} type="button" onClick={() => onOpenJob?.(r.job.id, 'details')}
              style={{ textAlign: 'left', background: 'white', border: '1.5px solid #e2e6ed', borderLeft: `5px solid ${c.text}`, borderRadius: '12px', padding: '12px 14px', cursor: 'pointer', minHeight: '56px', display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', justifyContent: 'space-between', font: 'inherit', color: 'inherit' }}>
              <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{r.no}</div>
                <div style={{ color: '#5b6678', fontSize: '13px', marginTop: '2px', wordBreak: 'break-word' }}>
                  Job {r.job.job_no}{r.job.client ? ` · ${r.job.client}` : ''} · {getStageName(r.job.stage)}
                </div>
                <div style={{ color: '#8a96a8', fontSize: '12px', marginTop: '2px' }}>
                  {r.portIn ? `Port in: ${shortDate(r.portIn)}` : 'Port in: not known'}
                  {r.status ? ` · ${r.status}` : ''}
                </div>
              </div>
              <span style={{ background: c.bg, border: `1.5px solid ${c.border}`, color: c.text, borderRadius: '999px', padding: '6px 12px', fontWeight: 700, fontSize: '13px' }}>{risk.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
