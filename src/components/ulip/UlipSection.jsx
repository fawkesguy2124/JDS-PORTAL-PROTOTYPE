import { useEffect, useState } from 'react'
import UlipCheck from './UlipCheck'
import { loadJobResults } from '../../services/ulip/ulipClient'
import { Panel, Icon, Skeleton } from '../../industrial/ui'
import '../../industrial/industrial.css'
import './ulipCards.css'

// A set of button-press government checks for one job (e.g. the truck and
// driver checks). Loads the job's saved answers once, so each check shows its
// last result without asking again. One hairline panel per group, the checks
// as rows inside it (Control tower look, Jose 31 Oct 2026).
//
// groups = [{ title, description, collapsed, checks: [check, ...] }]
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
    <div className="ix-uc uc-section">
      {intro && <div className="uc-intro">{intro}</div>}
      {saved === null ? (
        <div className="ix-card"><Skeleton rows={3} /></div>
      ) : (
        visibleGroups.map((g) => g.collapsed && !opened[g.title] ? (
          // backup groups stay folded until asked for, so the pane stays short
          <button key={g.title} type="button" className="uc-more" aria-expanded="false"
            onClick={() => setOpened((p) => ({ ...p, [g.title]: true }))}>
            <Icon name="plus" />
            <span>
              <span className="t">{g.title} <span className="n">· {g.checks.length} more {g.checks.length === 1 ? 'check' : 'checks'}</span></span>
              {g.description && <span className="d">{g.description}</span>}
            </span>
          </button>
        ) : (
          <Panel key={g.title} className="uc-group" title={g.title}
            meta={`${g.checks.length} ${g.checks.length === 1 ? 'check' : 'checks'}`}>
            {g.description && <div className="uc-group-note">{g.description}</div>}
            {g.checks.map((c) => (
              <UlipCheck key={`${c.api}-${c.title}`} check={c} job={job} saved={saved[c.api]} onJobChange={handleJobChange} />
            ))}
          </Panel>
        ))
      )}
    </div>
  )
}
