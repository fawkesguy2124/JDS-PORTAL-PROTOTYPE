import { useState } from 'react'
import { supabase } from '../supabase'
import { useJourney } from './JourneyContext'
import { BE_STAGES, beStageOf } from '../services/journey'
import { Icon, timeAgo } from './ui'

// Customs stage after the BE, set with one tap (Jose, 25 Oct 2026). ICEGATE through ULIP
// only tells the OOC; staff see RMS / AO / query / AC / assessed / duty paid in LiveImpex
// and mark it here, so the whole team (and the alerts) know where every BE stands.
// Saved on the job (field_meta.be_stage, for this BE) and in the activity log.
export async function saveBeStage(job, stageId, byName, note) {
  const def = BE_STAGES.find((s) => s.id === stageId)
  const meta = job.field_meta && typeof job.field_meta === 'object' ? job.field_meta : {}
  const field_meta = { ...meta, be_stage: { stage: stageId, be_no: job.be_no || null, at: new Date().toISOString(), by: byName || null, note: note || null } }
  const { data: saved, error } = await supabase.from('jobs').update({ field_meta, updated_at: new Date().toISOString() }).eq('id', job.id).select().single()
  if (error) throw new Error(error.message)
  await supabase.from('activity_log').insert({
    type: 'be_stage', action: 'be_stage', title: `${job.job_no} — Customs: ${def.label}`, note: note || `BE ${job.be_no || ''}`.trim(),
    job_id: job.id, job_no: job.job_no, done_by_name: byName || null,
    meta: { job_id: job.id, job_no: job.job_no, stage: stageId, be_no: job.be_no || null },
  })
  return saved
}

// compact = one row of chips (lists); full = with the label and who set it (job sidebar)
export default function BeStage({ job, userName, showToast, compact = false }) {
  const { patchJob } = useJourney()
  const [busy, setBusy] = useState(null)
  const now = beStageOf(job)
  const set = async (id) => {
    if (busy || now?.id === id) return
    setBusy(id)
    try {
      const saved = await saveBeStage(job, id, userName)
      patchJob(saved)
      showToast?.(`${job.job_no}: ${BE_STAGES.find((s) => s.id === id).label}`, 'success')
    } catch (e) { showToast?.(`Could not save: ${e.message}`, 'error') }
    setBusy(null)
  }
  return (
    <div className={`ix-bestage ${compact ? 'compact' : ''}`} onClick={(e) => e.stopPropagation()}>
      {!compact && (
        <div className="hd">
          <Icon name="building-bank" />
          <span className="t">Customs stage</span>
          <span className="s">{now ? `${now.label}${now.by ? ` · ${now.by}` : ''}${now.at ? ` · ${timeAgo(now.at)}` : ''}` : 'Not set: tap where the BE is now (as seen in LiveImpex)'}</span>
        </div>
      )}
      <div className="chips" role="group" aria-label={`Customs stage of ${job.job_no}`}>
        {BE_STAGES.map((s) => (
          <button key={s.id} type="button" className={`st ${s.tone} ${now?.id === s.id ? 'on' : ''}`} disabled={!!busy} onClick={() => set(s.id)} aria-pressed={now?.id === s.id}
            title={s.label}>
            {busy === s.id ? '…' : s.short}
          </button>
        ))}
      </div>
    </div>
  )
}
