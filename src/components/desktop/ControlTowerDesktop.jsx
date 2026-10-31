import { daysAgo } from '../../services/journey'
import { Button, Dash, EmptyState, Icon, JobNo, Owner, Panel, Skeleton, Status, initials } from '../../industrial/ui'

// Team & stages: the two work tables (open jobs per owner, and the stage board).
// The file name is from the old Tailwind screen; since the Control tower rebuild
// (Jose, 31 Oct 2026) these render at every width and scroll inside .ix-tbl-wrap on a phone.

// a count cell: grey zero, coloured number otherwise (DESIGN: zeros are grey, not red)
function Count({ n, tone, title }) {
  return <span className={`tm-n${n ? ` ${tone}` : ' zero'}`} title={n ? title : undefined}>{n}</span>
}

// ── Open jobs per owner; a row click narrows the stage board to that person ──
export function OwnerTable({ owners, total, dash, selected, none, onPick, onOpenJob }) {
  const people = owners.filter((o) => o.key !== none).length
  return (
    <Panel title="Open jobs by owner" className="tm-owners"
      meta={dash ? null : selected ? 'click the row again to show everyone' : 'click a row to see that person’s jobs by stage'}>
      {dash ? <Skeleton rows={4} /> : !owners.length ? (
        <EmptyState icon="circle-check" tone="green" title="No open jobs" />
      ) : (
        <>
          <div className="ix-tbl-wrap">
            <table className="ix-tbl click tm-own-tbl">
              <thead><tr>
                <th className="lvl" /><th>Owner</th><th className="r">Jobs</th><th className="r">Need action</th>
                <th className="r">Waiting OOC</th><th className="r">To move</th><th>Oldest open</th>
              </tr></thead>
              <tbody>
                {owners.map((o) => {
                  const isNone = o.key === none
                  // the row's edge carries its worst level: red problems, or nobody owns the jobs
                  const lvl = o.red ? 'red' : isNone ? 'amber' : ''
                  return (
                    <tr key={o.key} className={`${lvl}${selected === o.key ? ' sel' : ''}`} tabIndex={0} aria-selected={selected === o.key}
                      onClick={() => onPick(o.key)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(o.key) } }}>
                      <td className="lvl" />
                      <td>{isNone ? <span className="tm-noowner"><Icon name="user-question" />Unassigned</span> : <Owner name={o.name} />}</td>
                      <td className="r tm-jobs-n">{o.jobs.length}</td>
                      <td className="r"><Count n={o.action} tone={o.red ? 'red' : 'amber'} title={o.red ? `${o.red} to act on today` : 'need action soon'} /></td>
                      <td className="r"><Count n={o.ooc} tone="amber" title="BE filed, OOC not yet" /></td>
                      <td className="r"><Count n={o.move} tone="amber" title="OOC granted, cargo still at the port or CFS" /></td>
                      <td>
                        {o.oldest
                          ? <span className="tm-oldest"><JobNo no={o.oldest.job.job_no} onClick={() => onOpenJob(o.oldest.id)} /><span>{o.oldest.age} d</span></span>
                          : <Dash />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="ix-tbl-foot">
            <span>{total} open {total === 1 ? 'job' : 'jobs'} · {people} {people === 1 ? 'person' : 'people'}</span>
            <span className="right">Oldest open = days since the job was opened</span>
          </div>
        </>
      )}
    </Panel>
  )
}

// ── Stage board: each stage with its job numbers (same stages as Today's pipeline) ──
const CHIP_CAP = 40
// red / amber problems first; moving stages (ship due, on the move, LEO given) navy
const chipTone = (x) => (x.level === 'red' ? 'red' : x.level === 'amber' ? 'amber' : ['arrival', 'truck', 'sail'].includes(x.j.phase) ? 'navy' : '')

export function StageBoard({ stages, dash, now, ownerName, showOwner, needIds, roadIds, onClear, onOpenJob, openView }) {
  const total = stages.reduce((s, x) => s + x.jobs.length, 0)
  // a short fact under each stage name, from the shared lists (never recounted here)
  const emOf = (s) => {
    if (!s.jobs.length) return null
    if (s.id === 'docs') return 'file in LiveImpex'
    if (s.id === 'ooc') {
      const d = s.jobs.map((x) => daysAgo(x.job.be_date, now)).filter((v) => v !== null)
      return d.length ? `oldest ${Math.max(...d)} d since BE` : null
    }
    if (s.id === 'release') { const k = s.jobs.filter((x) => needIds.has(x.id)).length; return k ? `${k} need a truck` : null }
    if (s.id === 'truck') { const k = s.jobs.filter((x) => roadIds.has(x.id)).length; return k ? `${k} seen on the road` : null }
    return null
  }

  return (
    <Panel title="Jobs by stage" className="tm-board"
      meta={dash ? null : ownerName ? `${ownerName} · ${total} ${total === 1 ? 'job' : 'jobs'}` : `${total} open ${total === 1 ? 'job' : 'jobs'} · worst problem first`}
      actions={ownerName ? <Button variant="ghost" size="sm" icon="x" onClick={onClear}>Everyone</Button> : null}>
      {dash ? <Skeleton rows={5} /> : (
        <div className="tm-stages">
          {stages.map((s) => {
            const em = emOf(s)
            return [
              // exports get their own heading under the import stages
              s.id === 'sb' ? <div key="exports" className="tm-sgrp">Exports</div> : null,
              <div key={s.id} className={`tm-stage${s.id === 'release' && s.jobs.length ? ' hot' : ''}`}>
                <button type="button" className="tm-sh" onClick={() => openView(s.view)} title="Open these jobs in All jobs">
                  <Status tone={s.tone}>{s.label}</Status>
                  <b>{s.jobs.length}</b>
                  {em ? <em>{em}</em> : null}
                </button>
                <div className="tm-chips">
                  {s.jobs.slice(0, CHIP_CAP).map((x) => (
                    <button key={x.id} type="button" className={`tm-jt ${chipTone(x)}`} onClick={() => onOpenJob(x.id)}
                      title={[x.job.job_no, x.job.client, x.ownerName || 'no owner'].filter(Boolean).join(' · ')}>
                      <i />{x.job.job_no}
                      {showOwner && <span className={`o${x.ownerName ? '' : ' none'}`}>{x.ownerName ? initials(x.ownerName) : '?'}</span>}
                    </button>
                  ))}
                  {s.jobs.length > CHIP_CAP && <button type="button" className="ix-link" onClick={() => openView(s.view)}>+{s.jobs.length - CHIP_CAP} more</button>}
                  {!s.jobs.length && <span className="tm-empty">None</span>}
                </div>
              </div>,
            ]
          })}
          <div className="tm-legend">
            <span><i className="red" />act today</span><span><i className="amber" />needs action</span><span><i className="navy" />moving</span>
            {showOwner && <span><b className="o">AB</b>owner’s initials · <b className="o none">?</b>no owner</span>}
          </div>
        </div>
      )}
    </Panel>
  )
}
