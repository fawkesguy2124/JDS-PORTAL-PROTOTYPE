import { useEffect, useState } from 'react'
import UlipCheck from './UlipCheck'
import { loadJobResults } from '../../services/ulip/ulipClient'

// A group of ULIP checks for one job (e.g. everything in the "Truck" tab).
// Loads the job's saved answers once, so each check shows its last result
// without calling ULIP again.
//
// groups = [{ title, description, checks: [check, ...] }]
export default function UlipSection({ job: jobProp, groups, intro }) {
  const [job, setJob] = useState(jobProp)
  const [saved, setSaved] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadJobResults(job.id).then((rows) => { if (!cancelled) setSaved(rows) })
    return () => { cancelled = true }
  }, [job.id])

  const visibleGroups = groups
    .map((g) => ({ ...g, checks: g.checks.filter((c) => !c.showIf || c.showIf(job)) }))
    .filter((g) => g.checks.length > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {intro && <div style={{ fontSize: '13px', color: '#5b6678', lineHeight: 1.6 }}>{intro}</div>}
      {saved === null ? (
        <div style={{ fontSize: '13px', color: '#8a96a8', padding: '20px 0' }}>Loading…</div>
      ) : (
        visibleGroups.map((g) => (
          <section key={g.title}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1a4fa0', marginBottom: '4px' }}>
              {g.title}
            </div>
            {g.description && <div style={{ fontSize: '13px', color: '#5b6678', marginBottom: '10px' }}>{g.description}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {g.checks.map((c) => (
                <UlipCheck key={`${c.api}-${c.title}`} check={c} job={job} saved={saved[c.api]} onJobChange={setJob} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
