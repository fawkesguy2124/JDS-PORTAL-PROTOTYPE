import { useEffect, useState } from 'react'
import { loadJourneyData, journeyFor } from '../../services/journey'
import JourneyStrip from '../../components/journey/JourneyStrip'
import UlipCheck from '../../components/ulip/UlipCheck'
import { LOOKUP_CATEGORIES } from '../../components/ulip/ulipChecks'
import { detectNumberType, jobMatches, cleanNumber } from './search.helpers'

const card = { background: '#fff', border: '1.5px solid #e2e6ed', borderRadius: '14px', padding: '14px', marginBottom: '12px' }

export default function SearchPage({ onOpenJob }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [text, setText] = useState('')
  const [searched, setSearched] = useState('')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const d = await loadJourneyData()
        if (!cancelled) setData(d)
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || 'Could not load jobs')
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const go = (e) => {
    e?.preventDefault()
    setSearched(text.trim())
    setShowAll(false)
  }

  const jobs = data && searched ? data.jobs.filter((j) => jobMatches(j, searched)).slice(0, 20) : []
  const detected = searched ? detectNumberType(searched) : null
  const firstJob = jobs.length === 1 ? jobs[0] : null
  const keyBase = cleanNumber(searched)

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: '#1a2233', fontSize: '14px', maxWidth: '900px', margin: '0 auto', padding: '16px' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: '20px' }}>Search</h2>
      <form onSubmit={go} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type any number — BE, container, truck, IEC, airway bill, job no…"
          style={{ flex: '1 1 240px', minWidth: 0, height: '52px', padding: '0 16px', fontSize: '16px', border: '1.5px solid #d0d6e0', borderRadius: '12px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
        <button type="submit" style={{ height: '52px', padding: '0 28px', fontSize: '15px', fontWeight: 700, color: '#fff', background: '#1a4fa0', border: 'none', borderRadius: '12px', cursor: 'pointer', flex: '0 0 auto' }}>
          Search
        </button>
      </form>
      <div style={{ color: '#5b6678', fontSize: '13px', margin: '8px 2px 16px', lineHeight: 1.5 }}>
        For example: MSKU1234567 (container), MH04AB1234 (truck), 2237841 (BE), 61835488224 (airway bill), or part of a job number or client name.
      </div>

      {loadError && <div style={{ ...card, color: '#b91c1c' }}>Could not load your jobs: {loadError}</div>}

      {searched && (
        <>
          <div style={{ fontWeight: 700, fontSize: '15px', margin: '4px 0 8px' }}>In our jobs</div>
          {!data && !loadError && <div style={{ ...card, color: '#5b6678' }}>Looking through our jobs…</div>}
          {data && jobs.length === 0 && (
            <div style={{ ...card, color: '#5b6678' }}>No job of ours has “{searched}”.</div>
          )}
          {jobs.map((job) => {
            const j = journeyFor(job, data)
            return (
              <div
                key={job.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenJob?.(job.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpenJob?.(job.id) }}
                style={{ ...card, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{job.job_no}</span>
                  <span style={{ color: '#5b6678' }}>{job.client}</span>
                </div>
                <JourneyStrip steps={j.steps} compact />
              </div>
            )
          })}
          {jobs.length >= 20 && <div style={{ color: '#8a96a8', fontSize: '13px', marginBottom: '12px' }}>Showing the first 20. Type more of the number to narrow it down.</div>}

          <div style={{ fontWeight: 700, fontSize: '15px', margin: '16px 0 8px' }}>Check with the government systems</div>
          {detected && detected.kind !== 'unknown' && detected.kind !== 'empty' && (
            <>
              <div style={{ color: '#5b6678', marginBottom: '10px' }}>
                {detected.label}. Nothing is checked until you press a button.
              </div>
              {detected.checks.map((c) => (
                <UlipCheck key={`${keyBase}-${c.api}`} check={c} job={firstJob} />
              ))}
              {detected.also.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, color: '#5b6678', margin: '14px 0 8px' }}>Could also be</div>
                  {detected.also.map((c) => (
                    <UlipCheck key={`${keyBase}-${c.api}`} check={c} job={firstJob} />
                  ))}
                </>
              )}
            </>
          )}
          {detected?.kind === 'unknown' && (
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>Not sure what this number is.</div>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                style={{ minHeight: '40px', background: 'none', border: 'none', color: '#1a4fa0', fontWeight: 700, fontSize: '14px', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                {showAll ? 'Hide all checks' : 'Show all checks'}
              </button>
            </div>
          )}
          {detected?.kind === 'unknown' && showAll && LOOKUP_CATEGORIES.map((cat) => (
            <details key={cat.id} style={card}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, minHeight: '32px' }}>{cat.icon} {cat.label}</summary>
              <div style={{ marginTop: '10px' }}>
                {cat.checks.map((c) => <UlipCheck key={c.api} check={c} job={null} />)}
              </div>
            </details>
          ))}
        </>
      )}
    </div>
  )
}
