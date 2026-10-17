import { useState } from 'react'
import { supabase } from '../supabase'
import { fetchBEStatus } from '../services/ulip/ulipService'

export default function BEStatusCard({ jobNo, initialBeNumber = '' }) {
  const [beNumber, setBeNumber]       = useState(initialBeNumber)
  const [beData, setBeData]           = useState(null)
  const [beLoading, setBeLoading]     = useState(false)
  const [beError, setBeError]         = useState('')

  const handleCheck = async () => {
    if (!beNumber.trim()) return
    setBeLoading(true)
    setBeError('')
    setBeData(null)
    try {
      const result = await fetchBEStatus(beNumber.trim())
      setBeData(result)

      // Log to activity_log (upsert to avoid duplicates)
      try {
        const { error: logErr } = await supabase.from('activity_log').upsert({
          type:    'be_status_check',
          action:  'be_status_check',
          title:   `BE ${beNumber.trim()} — ${result.oocDate ? 'OOC granted' : 'checked'}`,
          job_no:  jobNo || null,
          meta:    { beNumber: beNumber.trim(), oocDate: result.oocDate, vehicleNumbers: result.vehicleNumbers },
        }, { onConflict: 'title,job_no', ignoreDuplicates: true })
        if (logErr) console.warn('[BEStatusCard] activity_log insert failed:', logErr.message)
      } catch (logErr) {
        console.warn('[BEStatusCard] activity_log insert failed:', logErr.message)
      }
    } catch (err) {
      setBeError(err.message || 'Failed to fetch BE status from ULIP')
    } finally {
      setBeLoading(false)
    }
  }

  // ── Badge logic (based on OOC date presence) ──
  const getBadgeStyle = () => {
    if (!beData) return null
    if (beData.oocDate)
      return { bg: '#ecfdf5', color: '#065f46', border: '#d1fae5', label: '✓ Out of Charge' }
    if (beData.doDate)
      return { bg: '#E6F1FB', color: '#0C447C', border: '#B5D4F4', label: 'Delivery Order issued' }
    if (beData.surveyDate)
      return { bg: '#fff7ed', color: '#9a3412', border: '#fed7aa', label: '⚠ Survey ordered' }
    return { bg: '#f4f6f9', color: '#4a5568', border: '#e2e6ed', label: 'Filed' }
  }

  const badge = getBadgeStyle()

  return (
    <div style={{
      background: 'white',
      border: '1.5px solid #e2e6ed',
      borderRadius: '14px',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>

      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid #f4f6f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a2233' }}>BE Status Lookup</div>
          <div style={{ fontSize: '11px', color: '#8a96a8', marginTop: '2px' }}>
            Check Bill of Entry status via ULIP (JNPT/02)
          </div>
        </div>
        <span style={{
          padding: '4px 10px', fontSize: '11px', fontWeight: 600,
          borderRadius: '8px', background: '#f4f6f9', color: '#4a5568',
          border: '1px solid #e2e6ed', whiteSpace: 'nowrap',
        }}>
          JNPT Nhava Sheva
        </span>
      </div>

      {/* Input row */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f4f6f9', display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={beNumber}
          onChange={e => setBeNumber(e.target.value.toUpperCase())}
          placeholder="Enter BE number (7 chars, e.g. 2237841)"
          maxLength={7}
          onKeyDown={e => { if (e.key === 'Enter' && beNumber.trim() && !beLoading) handleCheck() }}
          style={{
            flex: 1, height: '40px', padding: '0 12px',
            border: '1.5px solid #e2e6ed', borderRadius: '8px',
            fontSize: '13px', fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600, color: '#1a2233', background: '#f8fafc',
            outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => { e.target.style.borderColor = '#1a4fa0'; e.target.style.boxShadow = '0 0 0 3px rgba(26,79,160,0.1)' }}
          onBlur={e => { e.target.style.borderColor = '#e2e6ed'; e.target.style.boxShadow = 'none' }}
        />
        <button
          type="button"
          onClick={handleCheck}
          disabled={!beNumber.trim() || beLoading}
          style={{
            height: '40px', padding: '0 18px',
            background: !beNumber.trim() || beLoading ? '#94a3b8' : '#1a4fa0',
            color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '13px', fontWeight: 700, cursor: beLoading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (!beLoading && beNumber.trim()) e.currentTarget.style.background = '#153d82' }}
          onMouseLeave={e => { if (!beLoading && beNumber.trim()) e.currentTarget.style.background = '#1a4fa0' }}
        >
          {beLoading ? (
            <>
              <span style={{
                width: '16px', height: '16px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: 'white', borderRadius: '50%',
                animation: 'beSpin 0.7s linear infinite',
              }} />
              Checking...
            </>
          ) : 'Check Status'}
        </button>
      </div>

      {/* Error */}
      {beError && (
        <div style={{
          margin: '14px 18px', padding: '10px 12px',
          background: '#fef2f2', border: '1.5px solid #fecaca',
          borderRadius: '8px', fontSize: '12px', color: '#991b1b',
          display: 'flex', alignItems: 'flex-start', gap: '6px',
        }}>
          <span style={{ flexShrink: 0, marginTop: '1px' }}>⚠</span>
          <span>{beError}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {beLoading && (
        <div style={{ padding: '24px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <span style={{
            width: '18px', height: '18px',
            border: '2.5px solid #e2e6ed',
            borderTopColor: '#1a4fa0', borderRadius: '50%',
            animation: 'beSpin 0.7s linear infinite',
          }} />
          <span style={{ fontSize: '12px', color: '#8a96a8' }}>Querying ULIP...</span>
        </div>
      )}

      {/* Results */}
      {beData && !beLoading && (
        <div style={{ padding: '14px 18px' }}>

          {/* OOC banner */}
          {beData.oocDate && (
            <div style={{
              padding: '10px 12px', marginBottom: '10px',
              background: '#ecfdf5', border: '1.5px solid #d1fae5',
              borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ fontSize: '16px' }}>✓</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#065f46' }}>Out of Charge Granted</div>
                <div style={{ fontSize: '11px', color: '#047857' }}>OOC Date: {beData.oocDate}</div>
              </div>
            </div>
          )}

          {/* Survey warning */}
          {beData.surveyDate && !beData.oocDate && (
            <div style={{
              padding: '10px 12px', marginBottom: '10px',
              background: '#fff7ed', border: '1.5px solid #fed7aa',
              borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ fontSize: '16px' }}>⚠</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#9a3412' }}>Survey Ordered</div>
                <div style={{ fontSize: '11px', color: '#c2410c' }}>Survey Date: {beData.surveyDate}{beData.surveyorCode ? ` · Surveyor: ${beData.surveyorCode}` : ''}</div>
              </div>
            </div>
          )}

          {/* Status badge row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 0', borderBottom: '0.5px solid #f4f6f9', marginBottom: '10px',
          }}>
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a96a8' }}>BE Status</span>
            {badge && (
              <span style={{
                padding: '3px 10px', fontSize: '11px', fontWeight: 700,
                borderRadius: '9999px', border: `1px solid ${badge.border}`,
                background: badge.bg, color: badge.color,
              }}>
                {badge.label}
              </span>
            )}
          </div>

          {/* Details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', marginBottom: '12px' }}>
            <DetailRow label="BE Number" value={beData.beNumber} mono />
            <DetailRow label="BE Date" value={beData.beDate} />
            <DetailRow label="IGM Number" value={beData.igmNumber} mono />
            <DetailRow label="IGM Date" value={beData.igmDate} />
            <DetailRow label="CHA Code" value={beData.chaCode} mono />
            <DetailRow label="BL Number" value={beData.blNumber} mono />
            <DetailRow label="DO Date" value={beData.doDate} />
            <DetailRow label="DO Number" value={beData.doNumber} mono />
            <DetailRow label="OOC Date" value={beData.oocDate} />
            <DetailRow label="OOC Number" value={beData.oocNumber} mono />
            <DetailRow label="Mode of Transport" value={beData.modeOfTransport} />
            <DetailRow label="Country of Origin" value={beData.countryOfOrigin} />
          </div>

          {/* Importer + goods section */}
          {(beData.importerName || beData.goodsDesc) && (
            <div style={{ borderTop: '0.5px solid #f4f6f9', paddingTop: '10px', marginBottom: '12px' }}>
              {beData.importerName && (
                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a96a8', marginBottom: '2px' }}>Importer</div>
                  <div style={{ fontSize: '13px', color: '#1a2233' }}>{beData.importerName}</div>
                  {beData.importerAddress && <div style={{ fontSize: '11px', color: '#8a96a8', marginTop: '2px' }}>{beData.importerAddress}</div>}
                </div>
              )}
              {beData.goodsDesc && (
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a96a8', marginBottom: '2px' }}>Goods Description</div>
                  <div style={{ fontSize: '13px', color: '#1a2233' }}>{beData.goodsDesc}</div>
                </div>
              )}
            </div>
          )}

          {/* Vehicle numbers */}
          {beData.vehicleNumbers && beData.vehicleNumbers.length > 0 && (
            <div style={{ borderTop: '0.5px solid #f4f6f9', paddingTop: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a96a8', marginBottom: '6px' }}>
                Delivery Vehicles (FASTAG)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {beData.vehicleNumbers.map((v, i) => (
                  <span key={i} style={{
                    padding: '3px 10px', fontSize: '11px', fontWeight: 600,
                    fontFamily: "'JetBrains Mono', monospace",
                    borderRadius: '8px', background: '#E6F1FB', color: '#0C447C',
                    border: '1px solid #B5D4F4',
                  }}>
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty hint */}
      {!beData && !beError && !beLoading && (
        <div style={{ padding: '32px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.4 }}>🧾</div>
          <p style={{ fontSize: '12px', color: '#8a96a8', margin: 0 }}>Enter a 7-character BE number above and click "Check Status"</p>
        </div>
      )}

      <style>{`@keyframes beSpin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function DetailRow({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a96a8', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{
        fontSize: '13px', color: '#1a2233',
        fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
        fontWeight: mono ? 600 : 400,
      }}>
        {value || '—'}
      </div>
    </div>
  )
}
