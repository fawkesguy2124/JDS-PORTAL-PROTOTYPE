import { Suspense, useEffect, useEffectEvent, useRef } from 'react'
import { supabase } from '../supabase'
import lazyPage from '../utils/lazyPage'
import { useForcedTheme, pushLayer, trapTab } from '../ui/hooks'
import { useJourney } from '../industrial/JourneyContext'
import { usePortal } from './PortalContext'

// The older pages, unchanged, in one full-screen frame over the portal (Jose,
// 31 Oct 2026): Team & stages, WhatsApp bot, System health, ULIP lookup, the
// full job form ("Edit details") and Create job. Legacy pages stay light.
const ControlTowerSection = lazyPage(() => import('../components/ControlTower'))
const BotPreviewPage = lazyPage(() => import('../pages/v2/BotPreviewPage'))
const HealthPage = lazyPage(() => import('../industrial/pages/HealthPage'))
const SearchPage = lazyPage(() => import('../pages/v2/SearchPage'))
const JobDetailView = lazyPage(() => import('../components/JobDetailView'))
const CreateJob = lazyPage(() => import('../pages/CreateJob'))

const MANAGE_TITLES = { overview: 'Team & stages', bot: 'WhatsApp bot', health: 'System health', search: 'ULIP lookup', create: 'New job' }

function Light({ children }) {
  useForcedTheme('light')
  return children
}

const Back = () => <svg className="pt-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>

// page = { id: 'overview'|'bot'|'health'|'search'|'edit'|'create', jobId?, file?, path? }
export default function Manage({ page, onClose, onOpenJob, onDeleted }) {
  const { data, profiles, byId, patchJob, refresh } = useJourney()
  const { perms, toast } = usePortal()
  const frameRef = useRef(null)
  const legacyToast = (msg, type) => toast(msg, type === 'error' ? 'error' : 'info')

  const close = useEffectEvent(() => onClose())
  const shown = !!page
  useEffect(() => {
    if (!shown) return undefined
    const prev = document.activeElement
    const layer = pushLayer(Symbol('pt-manage'))
    const raf = requestAnimationFrame(() => frameRef.current?.querySelector(".pt-mback")?.focus({ preventScroll: true }))
    const onKey = (e) => {
      if (!layer.isTop()) return
      // Esc closes the frame, unless a field inside the old page has the focus
      if (e.key === 'Escape' && !e.target.closest?.('input, textarea, select, [contenteditable="true"]')) close()
      else if (e.key === 'Tab') trapTab(e, frameRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      layer.release()
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus({ preventScroll: true })
    }
  }, [shown])

  if (!page) return null
  const id = page.id
  const job = id === 'edit' ? byId[page.jobId]?.job : null
  if (id === 'edit' && !job) return null
  const title = id === 'edit' ? job.job_no : MANAGE_TITLES[id] || 'Manage'

  // verbatim from AdminDashboard handleDeleteJob, with the portal's toast and reload
  const deleteJob = async (j) => {
    if (!window.confirm(`Delete job ${j.job_no || ''}? This cannot be undone.`)) return

    try {
      // 1. Delete related documents from storage (best-effort — RLS may block)
      try {
        const { data: docs } = await supabase.from('documents').select('file_path').eq('job_id', j.id)
        if (docs && docs.length > 0) {
          const filePaths = docs.map((d) => d.file_path).filter(Boolean)
          if (filePaths.length > 0) {
            await supabase.storage.from('job-documents').remove(filePaths)
          }
        }
      } catch { /* storage delete is best-effort */ }

      // 2. Delete document records
      await supabase.from('documents').delete().eq('job_id', j.id)

      // 3. Delete job extractions
      await supabase.from('job_extractions').delete().eq('job_id', j.id)

      // 4. Delete the job itself — use .select() to verify the row was actually removed
      const { data: deleted, error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', j.id)
        .select()

      if (error) {
        toast(error.message || 'Delete failed.', 'error')
        return
      }

      if (!deleted || deleted.length === 0) {
        toast(
          'Delete blocked by database permissions. Apply backend/src/db/migrations/002_jobs_rls.sql in Supabase SQL Editor.',
          'error'
        )
        return
      }

      // 5. Update the portal: back to the list, reload
      onDeleted?.()
      refresh()
      toast('Job deleted.')
    } catch (e) {
      toast(e?.message || 'Delete failed.', 'error')
    }
  }

  let body = null
  if (id === 'overview') {
    body = (
      <Light><div className="ix ix-legacy"><div className="pt-wrap">
        <ControlTowerSection jobs={data?.jobs || []} profiles={profiles} currentUserName={perms.userName} selectedJob={null}
          onOpenJob={(j) => onOpenJob(j.id)} onStageFilter={onClose} showToast={legacyToast} />
      </div></div></Light>
    )
  } else if (id === 'bot') {
    body = <Light><div className="ix ix-legacy"><div className="pt-wrap"><BotPreviewPage /></div></div></Light>
  } else if (id === 'health') {
    body = <div className="ix"><div className="pt-wrap"><HealthPage /></div></div>
  } else if (id === 'search') {
    body = <Light><div className="ix ix-legacy"><div className="pt-wrap"><SearchPage onOpenJob={(jobId) => onOpenJob(jobId)} /></div></div></Light>
  } else if (id === 'edit') {
    body = (
      <Light><div className="ix ix-legacy"><div className="pt-wrap narrow">
        <JobDetailView job={job} profiles={profiles} currentUserName={perms.userName}
          isAdmin={perms.isAdmin} canUpdateStage={perms.canUpdateStage}
          onBack={onClose}
          onSaved={async () => {
            const { data: fresh } = await supabase.from('jobs').select('*').eq('id', job.id).maybeSingle()
            if (fresh) patchJob(fresh)
            refresh()
          }}
          toast={legacyToast}
          onDelete={perms.isAdmin ? () => deleteJob(job) : undefined} />
      </div></div></Light>
    )
  } else if (id === 'create') {
    body = (
      <Light><div className="ix ix-light"><div className="pt-wrap narrow">
        <CreateJob isModal initialFile={page.file || null} initialFilePath={page.path || null}
          onCancel={onClose}
          onCreated={async () => { onClose(); refresh(); toast('Job created.') }} />
      </div></div></Light>
    )
  }

  return (
    <div ref={frameRef} className="pt-manage" role="dialog" aria-modal="true" aria-labelledby="pt-manage-title">
      <div className="pt-manage-bar">
        <button type="button" className="pt-mback" onClick={onClose} aria-label="Back"><Back /></button>
        <h2 id="pt-manage-title">{title}</h2>
      </div>
      <div className="pt-manage-body">
        <Suspense fallback={<div className="pt-manage-wait"><span className="pt-spin" />Loading…</div>}>
          {body}
        </Suspense>
      </div>
    </div>
  )
}
