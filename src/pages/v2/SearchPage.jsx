import { useEffect, useState } from 'react'
import { loadJourneyData, journeyFor } from '../../services/journey'
import JourneyStrip from '../../components/journey/JourneyStrip'
import UlipCheck from '../../components/ulip/UlipCheck'
import { LOOKUP_CATEGORIES } from '../../components/ulip/ulipChecks'
import { useJourney } from '../../industrial/JourneyContext'
import { PageHead, JobNo } from '../../industrial/ui'
import '../../industrial/industrial.css'
import '../../industrial/styles/records.css'
import { detectNumberType, jobMatches, jobExactlyMatches, cleanNumber } from './search.helpers'

// blocks on the shared hairline look (Control tower, Jose 31 Oct 2026)
const card = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '12px 16px', marginBottom: '12px' }

// a number typed in Ctrl K → "Look up on government systems"
function takeLookup() {
  try { const q = sessionStorage.getItem('ix_lookup') || ''; sessionStorage.removeItem('ix_lookup'); return q } catch { return '' }
}

export default function SearchPage({ onOpenJob }) {
  const journey = useJourney()
  const shared = journey?.data // the admin screens already have every job loaded
  const [own, setData] = useState(null)
  const data = shared || own
  const [loadError, setLoadError] = useState('')
  const [first] = useState(takeLookup)
  const [text, setText] = useState(first)
  const [searched, setSearched] = useState(first)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    const on = (e) => { takeLookup(); setText(e.detail); setSearched(e.detail); setShowAll(false) }
    window.addEventListener('ix-lookup', on)
    return () => window.removeEventListener('ix-lookup', on)
  }, [])

  useEffect(() => {
    if (shared) return undefined
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
  }, [shared])

  const go = (e) => {
    e?.preventDefault()
    setSearched(text.trim())
    setShowAll(false)
  }

  const jobs = data && searched ? data.jobs.filter((j) => jobMatches(j, searched)).slice(0, 20) : []
  const detected = searched ? detectNumberType(searched) : null
  const exact = detected && data ? data.jobs.filter((j) => jobExactlyMatches(j, detected.kind, searched)) : []
  const firstJob = exact.length === 1 ? exact[0] : null
  const failed = !!(loadError || data?.error)
  const keyBase = cleanNumber(searched)

  const page = (
    <>
      <PageHead title="Search" sub="Any number: BE, container, truck, IEC, airway bill, job no. Nothing is checked with government systems until you press a button." />
      <form onSubmit={go} className="rec-search">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type any number — BE, container, truck, IEC, airway bill, job no…"
          aria-label="Search any number"
        />
        <button type="submit" className="ix-btn primary">Search</button>
      </form>
      <div className="rec-hint">
        For example: MSKU1234567 (container), MH04AB1234 (truck), 2237841 (BE), 61835488224 (airway bill), or part of a job number or client name.
      </div>

      {failed && <div className="ix-error">Could not load the latest data — {loadError || data.error}. Reload the page to try again.</div>}

      {searched && (
        <>
          <div className="rec-h">In our jobs</div>
          {!data && !failed && <div style={{ ...card, color: 'var(--text-2)' }}>Looking through our jobs…</div>}
          {data && !failed && jobs.length === 0 && (
            <div style={{ ...card, color: 'var(--text-2)' }}>No job of ours has “{searched}”.</div>
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
                  <JobNo no={job.job_no} />
                  <span style={{ color: 'var(--text-2)' }}>{job.client}</span>
                </div>
                <JourneyStrip steps={j.steps} compact />
              </div>
            )
          })}
          {jobs.length >= 20 && <div className="rec-hint">Showing the first 20. Type more of the number to narrow it down.</div>}

          <div className="rec-h">Check with the government systems</div>
          {detected && detected.kind !== 'unknown' && detected.kind !== 'empty' && (
            <>
              <div className="rec-hint">
                {detected.label}. Nothing is checked until you press a button.
              </div>
              {detected.checks.map((c) => (
                <UlipCheck key={`${keyBase}-${c.api}`} check={c} job={firstJob} />
              ))}
              {detected.also.length > 0 && (
                <>
                  <div className="rec-h">Could also be</div>
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
              <button type="button" className="ix-link" style={{ marginLeft: 0, minHeight: '32px' }} onClick={() => setShowAll((v) => !v)}>
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
    </>
  )

  // inside the shell the frame (padding, background) comes from AdminDashboard;
  // the staff dashboard shows this page on its own
  return journey ? page : <div className="ix ix-page rec-standalone">{page}</div>
}
