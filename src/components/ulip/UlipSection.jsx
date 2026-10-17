import { useEffect, useState } from 'react'
import UlipCheck from './UlipCheck'
import { loadJobResults } from '../../services/ulip/ulipClient'

// A group of ULIP checks for one job (e.g. everything in the "Truck" tab).
// Loads the job's saved answers once, so each check shows its last result
// without calling ULIP again.
//
// groups = [{ title, description, checks: [check, ...] }]
export default function UlipSection({ job: jobProp, groups, intro, onJobChange }) {
  // Numbers just remembered by a check, laid over the job from the parent
  // until the parent's own copy catches up (the database already has them).
  const [patch, setPatch] = useState({})
  const job = { ...jobProp, ...patch, ulip_refs: { ...(jobProp.ulip_refs || {}), ...(patch.ulip_refs || {}) } }
  const [saved, setSaved] = useState(null)
  const [opened, setOpened] = useState({})

  useEffect(() => {
    let cancelled = false
    loadJobResults(jobProp.id).then((rows) => { if (!cancelled) setSaved(rows) })
    return () => { cancelled = true }
  }, [jobProp.id])

  const handleJobChange = (updated) => {
    setPatch({ ...(updated.truck_no ? { truck_no: updated.truck_no } : {}), ulip_refs: updated.ulip_refs || {} })
    onJobChange?.(updated)
  }

  const visibleGroups = groups
    .map((g) => ({ ...g, checks: g.checks.filter((c) => !c.showIf || c.showIf(job)) }))
    .filter((g) => g.checks.length > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {intro && <div style={{ fontSize: '13px', color: '#5b6678', lineHeight: 1.6 }}>{intro}</div>}
      {saved === null ? (
        <div style={{ fontSize: '13px', color: '#8a96a8', padding: '20px 0' }}>Loading…</div>
      ) : (
        visibleGroups.map((g) => g.collapsed && !opened[g.title] ? (
          <button key={g.title} type="button" onClick={() => setOpened((p) => ({ ...p, [g.title]: true }))}
            style={{ textAlign: 'left', padding: '14px 16px', borderRadius: '12px', border: '1.5px dashed #c9d2e0', background: '#f8fafc', cursor: 'pointer', fontFamily: 'inherit' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a4fa0' }}>＋ {g.title} ({g.checks.length} more {g.checks.length === 1 ? 'check' : 'checks'})</div>
            {g.description && <div style={{ fontSize: '13px', color: '#5b6678', marginTop: '3px' }}>{g.description}</div>}
          </button>
        ) : (
          <section key={g.title}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1a4fa0', marginBottom: '4px' }}>
              {g.title}
            </div>
            {g.description && <div style={{ fontSize: '13px', color: '#5b6678', marginBottom: '10px' }}>{g.description}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {g.checks.map((c) => (
                <UlipCheck key={`${c.api}-${c.title}`} check={c} job={job} saved={saved[c.api]} onJobChange={handleJobChange} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
