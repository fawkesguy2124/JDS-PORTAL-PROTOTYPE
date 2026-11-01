import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { setStage } from '../services/jobActions'
import { getStageName, parseContainerNos } from '../utils/jobHelpers'
import { truckNos, daysAgo } from '../services/journey'
import CustomsStatusCard from '../components/CustomsStatusCard'
import UlipSection from '../components/ulip/UlipSection'
import { useJourney } from './JourneyContext'
import { DayTag } from './JobChecks'
import BeStage from './BeStage'
import { Icon, JobNo, PhaseStatus, Status, Chip, FreeDays, Dash, Button, SearchBox, worst, fmtDate, fmtDateTime } from './ui'
import './styles/customs.css'

// BE & OOC as a board (Jose, 2 Nov 2026: "every API, I just scroll down… this is not the
// way it's done"). Each column is a step a BE goes through at Customs, each job a card
// that moves right; the oldest wait is on top. A card opens a side panel with that job's
// customs story (where it is, what comes next, one button to ask Customs), and the other
// government records stay folded away at the bottom of the panel.

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
const levelOf = (j) => { const w = worst(j); return w === 'red' || w === 'amber' ? w : '' }
// oldest first, a missing date last
const byDate = (get) => (a, b) => {
  const x = get(a), y = get(b)
  if (!x) return y ? 1 : 0
  if (!y) return -1
  return String(x).localeCompare(String(y))
}
const AT_CUSTOMS = ['rms', 'ao', 'ac', 'query', 'exam']

// The columns, left to right as a BE moves. 'always' columns show even when empty, so the
// whole process stays readable; the others only when a job is in them.
function lanesOf(rows) {
  const inPhase = (p) => rows.filter((r) => r.j.phase === p)
  const waiting = inPhase('ooc')
  const stageIs = (ids) => (r) => ids.includes(r.j.beStage?.id || 'none')
  return [
    { id: 'file', title: 'BE to file', hint: 'Cargo arrived, file in LiveImpex', tone: 'grey', always: true,
      rows: inPhase('docs').sort(byDate((r) => r.j.arrivedAt)) },
    { id: 'ahead', title: 'Filed early', hint: 'BE filed, ship not in yet', tone: 'blue',
      rows: rows.filter((r) => r.j.phase === 'arrival' && r.j.beFiled).sort(byDate((r) => r.job.be_date)) },
    { id: 'customs', title: 'With Customs', hint: 'RMS · AO · AC · query · exam', tone: 'blue', always: true,
      rows: waiting.filter(stageIs(['none', ...AT_CUSTOMS])).sort(byDate((r) => r.job.be_date)) },
    { id: 'assessed', title: 'Assessed', hint: 'Pay the duty', tone: 'amber', always: true,
      rows: waiting.filter(stageIs(['assessed'])).sort(byDate((r) => r.job.be_date)) },
    { id: 'paid', title: 'Duty paid', hint: 'Waiting for OOC', tone: 'blue', always: true,
      rows: waiting.filter(stageIs(['duty_paid'])).sort(byDate((r) => r.job.be_date)) },
    { id: 'ooc', title: 'OOC granted', hint: 'Move the cargo', tone: 'teal', always: true,
      rows: inPhase('release').sort(byDate((r) => r.j.oocDate)) },
  ]
}

// One short line about the whole desk, so the page says what matters before any card
function Pulse({ lanes }) {
  const get = (id) => lanes.find((l) => l.id === id)?.rows || []
  const atCustoms = [...get('customs'), ...get('assessed'), ...get('paid')]
  const oldest = [...atCustoms].sort(byDate((r) => r.job.be_date))[0]
  const queries = atCustoms.filter((r) => r.j.beStage?.id === 'query')
  const toMove = get('ooc'), toFile = get('file')
  const parts = []
  if (atCustoms.length) parts.push(<span key="c"><b>{plural(atCustoms.length, 'BE')}</b> at Customs{oldest?.job.be_date ? <>, oldest <b>{oldest.job.job_no}</b> on day {Math.max(0, daysAgo(oldest.job.be_date))}</> : null}</span>)
  if (queries.length) parts.push(<span key="q" className="red"><b>{plural(queries.length, 'query')}</b> to answer</span>)
  if (toMove.length) parts.push(<span key="m"><b>{toMove.length}</b> OOC to move</span>)
  if (toFile.length) parts.push(<span key="f"><b>{plural(toFile.length, 'BE')}</b> to file</span>)
  if (!parts.length) return <div className="cb-pulse"><Icon name="circle-check" />Nothing waiting at Customs.</div>
  return <div className="cb-pulse"><Icon name="activity" />{parts.reduce((a, p, i) => (i ? [...a, <span key={`d${i}`} className="dot">·</span>, p] : [p]), [])}</div>
}

// A job on the board: the job and client, the BE and its age, and in "With Customs"
// where exactly the BE is (a query in red)
function Card({ r, lane, selected, onPick }) {
  const { job, j } = r
  const level = levelOf(j)
  const stage = j.beStage
  let meta, tag
  if (lane === 'file') {
    meta = [j.arrivedAt ? `Arrived ${fmtDate(j.arrivedAt)}` : job.eta ? `ETA ${fmtDate(job.eta)}` : null, job.mode].filter(Boolean).join(' · ') || 'File in LiveImpex'
    const d = j.arrivedAt ? daysAgo(j.arrivedAt) : null
    tag = d !== null && !isNaN(d) ? <Chip tone={d > 2 ? 'red' : d >= 1 ? 'amber' : 'grey'} title="Days since the cargo arrived">{d <= 0 ? 'Today' : `${d}d`}</Chip> : null
  } else if (lane === 'ooc') {
    meta = [j.oocDate ? `OOC ${fmtDate(j.oocDate)}` : 'OOC recorded', j.steps?.find((s) => s.id === 'out')?.sub].filter(Boolean).join(' · ')
    tag = <FreeDays value={j.freeDaysLeft} />
  } else {
    meta = <>BE <span className="mono">{job.be_no}</span> · {fmtDate(job.be_date)}{lane === 'ahead' && job.eta ? ` · ETA ${fmtDate(job.eta)}` : ''}</>
    tag = <DayTag since={job.be_date} />
  }
  return (
    <button type="button" className={`cb-card${level ? ` ${level}` : ''}`} aria-current={selected} onClick={() => onPick(job.id)}>
      <span className="r1"><JobNo no={job.job_no} />{tag}</span>
      <span className="cl">{job.client || 'No client'}</span>
      <span className="m">{meta}</span>
      {lane === 'customs' && (
        <span className="st">{stage ? <Status tone={stage.tone}>{stage.short}</Status> : <span className="unset">Stage not set</span>}</span>
      )}
      {lane === 'ooc' && j.onwardMode === 'rail' && <span className="st"><Chip>Rail</Chip></span>}
    </button>
  )
}

export function CustomsBoard({ rows, allRows, selectedId, onPick }) {
  const [q, setQ] = useState('')
  const lanes = useMemo(() => lanesOf(rows), [rows])
  const needle = q.trim().toLowerCase().replace(/\s+/g, '')
  const match = ({ job }) => [job.job_no, job.client, job.be_no, job.bl_no, ...truckNos(job), job.ulip_refs?.igm_no, ...parseContainerNos(job.containers)]
    .filter(Boolean).some((x) => String(x).toLowerCase().replace(/\s+/g, '').includes(needle))
  const shown = lanes.filter((l) => l.always || l.rows.length).map((l) => ({ ...l, rows: needle ? l.rows.filter(match) : l.rows }))
  const onBoard = new Set(lanes.flatMap((l) => l.rows.map((r) => r.job.id)))
  // a job that is not on the board (delivered, not arrived): still findable
  const others = needle ? allRows.filter((r) => !onBoard.has(r.job.id) && match(r)).slice(0, 8) : []
  const hits = shown.reduce((n, l) => n + l.rows.length, 0)

  return (
    <div className="cb">
      <div className="cb-top">
        <Pulse lanes={lanes} />
        <div className="cb-search"><SearchBox value={q} onChange={setQ} placeholder="Find a job, client, BE, container…" /></div>
      </div>
      {needle && (others.length > 0 || hits === 0) && (
        <div className="cb-others">
          {others.length ? <>
            <span className="k">Other jobs</span>
            {others.map(({ job, j }) => (
              <button key={job.id} type="button" className="cb-other" onClick={() => onPick(job.id)}>
                <JobNo no={job.job_no} /><span className="cl">{job.client || 'No client'}</span><PhaseStatus job={job} j={j} />
              </button>
            ))}
          </> : <span className="k">No import job matches “{q}”.</span>}
        </div>
      )}
      <div className="cb-lanes" style={{ '--lanes': shown.length }}>
        {shown.map((l) => (
          <section key={l.id} className={`cb-lane ${l.tone}${l.rows.length ? '' : ' empty'}`} aria-label={l.title}>
            <header>
              <span className="t">{l.title}</span>
              <span className="n">{l.rows.length}</span>
              <span className="h">{l.hint}</span>
            </header>
            <div className="cb-cards">
              {l.rows.length
                ? l.rows.map((r) => <Card key={r.job.id} r={r} lane={l.id} selected={selectedId === r.job.id} onPick={onPick} />)
                : <div className="cb-none">{needle ? 'No match' : 'Nothing here'}</div>}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

// ── the side panel of one job ──

async function reloadJob(id, patchJob) {
  const { data } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle()
  if (data) patchJob(data)
}

// Where the BE is, as one sentence and a tone, for the top of the panel
function storyOf(job, j) {
  const day = job.be_date ? Math.max(0, daysAgo(job.be_date)) : null
  const filed = job.be_date ? `BE ${job.be_no} filed ${fmtDate(job.be_date)}${day !== null ? `, day ${day}` : ''}` : null
  if (j.phase === 'delivered') return { tone: 'green', icon: 'circle-check', title: 'Delivered', sub: filed }
  if (j.oocDone) return { tone: 'teal', icon: 'truck', title: 'OOC granted: move the cargo', sub: [j.oocDate ? `OOC ${fmtDate(j.oocDate)}` : null, j.steps?.find((s) => s.id === 'out')?.sub].filter(Boolean).join(' · ') }
  if (j.phase === 'docs') return { tone: 'grey', icon: 'file-plus', title: 'BE not filed yet', sub: [j.arrivedAt ? `Cargo arrived ${fmtDate(j.arrivedAt)}` : null, 'File it in LiveImpex'].filter(Boolean).join(' · ') }
  if (j.phase === 'arrival' && j.beFiled) return { tone: 'blue', icon: 'ship', title: 'BE filed, ship not in yet', sub: [filed, job.eta ? `ETA ${fmtDate(job.eta)}` : null].filter(Boolean).join(' · ') }
  if (!j.beFiled) return { tone: 'grey', icon: 'clock', title: 'Waiting for the cargo', sub: job.eta ? `ETA ${fmtDate(job.eta)}` : null }
  const s = j.beStage
  if (s?.id === 'query') return { tone: 'red', icon: 'message-question', title: 'Customs raised a query: reply to it', sub: [filed, s.note].filter(Boolean).join(' · ') }
  if (s?.id === 'assessed') return { tone: 'amber', icon: 'receipt', title: 'Assessed: pay the duty', sub: filed }
  if (s?.id === 'duty_paid') return { tone: 'blue', icon: 'hourglass', title: 'Duty paid: waiting for OOC', sub: filed }
  if (s?.id === 'exam') return { tone: 'amber', icon: 'search', title: 'Examination of the goods', sub: filed }
  if (s) return { tone: 'blue', icon: 'building-bank', title: s.label, sub: filed }
  return { tone: 'blue', icon: 'building-bank', title: 'With Customs', sub: filed }
}

// Arrived → BE filed → assessed → duty paid → OOC, with the date under each step done
function Track({ job, j }) {
  const s = j.beStage?.id
  const past = (ids) => j.oocDone || ids.includes(s)
  const steps = [
    { k: 'Arrived', done: !!j.arrivedAt || j.beFiled, d: j.arrivedAt },
    { k: 'BE filed', done: j.beFiled, d: job.be_date },
    { k: 'Assessed', done: past(['assessed', 'duty_paid']), d: s === 'assessed' ? j.beStage?.at : null },
    { k: 'Duty paid', done: past(['duty_paid']), d: s === 'duty_paid' ? j.beStage?.at : null },
    { k: 'OOC', done: j.oocDone, d: j.oocDate },
  ]
  const cur = steps.findIndex((x) => !x.done)
  return (
    <ol className="cb-track" aria-label="Customs steps">
      {steps.map((x, i) => (
        <li key={x.k} className={x.done ? 'done' : i === cur ? 'cur' : ''}>
          <span className="c">{x.done ? <Icon name="check" /> : i + 1}</span>
          <span className="k">{x.k}</span>
          <span className="d">{x.done && x.d ? fmtDate(x.d) : ''}</span>
        </li>
      ))}
    </ol>
  )
}

function Facts({ job, j }) {
  const refs = job.ulip_refs || {}
  const boxes = j.containers?.nos?.length || 0
  const out = j.steps?.find((s) => s.id === 'out')
  const cell = (k, v, x) => <div className="f"><span className="k">{k}</span><span className="v">{v || <Dash />}</span>{x && <span className="x">{x}</span>}</div>
  return (
    <div className="cb-facts">
      {cell('BE', job.be_no && <span className="mono">{job.be_no}</span>, job.be_date && fmtDate(job.be_date))}
      {cell('IGM', refs.igm_no && <span className="mono">{refs.igm_no}</span>, refs.igm_date && fmtDate(refs.igm_date))}
      {cell(j.arrivedAt ? 'Arrived' : 'ETA', j.arrivedAt ? fmtDate(j.arrivedAt) : job.eta && fmtDate(job.eta))}
      {cell('Containers', boxes ? String(boxes) : job.mode === 'Air' ? 'Air' : null, out?.sub)}
      {cell('Free days', j.freeDaysLeft !== null && j.freeDaysLeft !== undefined ? <FreeDays value={j.freeDaysLeft} /> : null, j.freeTill && `till ${fmtDate(j.freeTill)}`)}
      {cell('Last asked Customs', j.customs?.checked_at && fmtDateTime(j.customs.checked_at))}
    </div>
  )
}

export function CustomsPanel({ jobId, onOpenJob, canEditBE, canUpdateStage, currentUserName, showToast, groups, onClose }) {
  const { byId, patchJob, refresh } = useJourney()
  const [more, setMore] = useState(false)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const row = byId[jobId]
  if (!row) return null
  const { job, j } = row
  const story = storyOf(job, j)
  const atCustoms = j.beFiled && !j.oocDone
  return (
    <>
      <div className="ix-backdrop" onClick={onClose} />
      <aside className="ix-drawer cb-panel" role="dialog" aria-label={`${job.job_no} customs`}>
        <header className="cb-ph">
          <div className="r1">
            <JobNo no={job.job_no} size="lg" />
            <PhaseStatus job={job} j={j} />
            <div className="right">
              <Button size="sm" icon="layout-sidebar-right" onClick={() => onOpenJob?.(job.id)}>Open job</Button>
              <button type="button" className="ix-icon-btn" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)"><Icon name="x" /></button>
            </div>
          </div>
          <div className="sub">{[job.client || 'No client', job.mode, job.port_code].filter(Boolean).join(' · ')}</div>
        </header>

        <div className="cb-pbody">
          <div className={`cb-story ${story.tone}`}>
            <Icon name={story.icon} />
            <div><div className="t">{story.title}</div>{story.sub && <div className="s">{story.sub}</div>}</div>
          </div>

          <Track job={job} j={j} />

          {/* where the BE is now: one tap (Jose, 25 Oct 2026) */}
          {atCustoms && <BeStage job={job} userName={currentUserName} showToast={showToast} />}

          <Facts job={job} j={j} />

          {/* the one check that matters here: is the OOC out (and the BE number / date form).
              Once the OOC is granted there is nothing left to ask Customs (Jose, 2 Nov 2026) */}
          {!j.oocDone && <div className="cb-ask">
            <CustomsStatusCard
              key={job.id}
              job={job}
              canEditBE={canEditBE}
              canUpdateStage={canUpdateStage}
              onMoveToStage={async (stage) => {
                const res = await setStage(job, Number(stage), getStageName(Number(stage)), currentUserName)
                if (res.ok) { patchJob(res.job); showToast?.(`${job.job_no} moved to ${getStageName(Number(stage))}`, 'success') }
                else showToast?.(res.error, 'error')
              }}
              onSaved={async () => { await reloadJob(job.id, patchJob); refresh() }}
              toast={showToast}
            />
          </div>}

          {/* everything else from the government systems, folded away until asked for */}
          <div className={`cb-more${more ? ' open' : ''}`}>
            <button type="button" className="cb-more-btn" aria-expanded={more} onClick={() => setMore((v) => !v)}>
              <Icon name="files" />
              <span className="t">More government records</span>
              <span className="h">BE cargo, IGM, ship arrival, port, IEC and HS policy</span>
              <Icon name={more ? 'chevron-up' : 'chevron-down'} />
            </button>
            {more && (
              <div className="cb-more-body cu-legacy">
                <UlipSection key={job.id} job={job} groups={groups} onJobChange={() => reloadJob(job.id, patchJob)} />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
