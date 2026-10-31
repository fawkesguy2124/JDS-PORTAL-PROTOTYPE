import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import lazyPage from '../utils/lazyPage'
import { loadDocs } from '../services/docCache'
import '../industrial/industrial.css'
import { JourneyProvider, useJourney } from '../industrial/JourneyContext'
import { rememberJob } from '../industrial/recentJobs'
import Shell from '../industrial/Shell'
import JobDrawer from '../industrial/JobDrawer'
import { PageHead, Skeleton } from '../industrial/ui'
import { usePrefs, LANDING_PAGES } from '../industrial/settings'
import IxTodayPage from '../industrial/pages/TodayPage'
import IxJobsPage from '../industrial/pages/JobsPage'
import IxCustomsPage from '../industrial/pages/CustomsPage'
import { forceRefreshAllContainers } from '../services/tracking/ldbProvider'
import { askConfirm } from '../industrial/confirm'

// Opened less often (or heavy, like the maps): loaded the first time they are opened
const IxTrucksPage = lazyPage(() => import('../industrial/pages/TrucksPage'))
const IxVesselsPage = lazyPage(() => import('../industrial/pages/VesselsPage'))
const IxHealthPage = lazyPage(() => import('../industrial/pages/HealthPage'))
const IxContainersPage = lazyPage(() => import('../industrial/pages/ContainersPage'))
const JobDetailView = lazyPage(() => import('../components/JobDetailView'))
const DocumentsSection = lazyPage(() => import('../components/DocumentsSection'))
const ComplianceSection = lazyPage(() => import('../components/ComplianceSection'))
const SearchPage = lazyPage(() => import('./v2/SearchPage'))
const ClientsPage = lazyPage(() => import('./v2/ClientsPage'))
const BotPreviewPage = lazyPage(() => import('./v2/BotPreviewPage'))
const IxSettingsPage = lazyPage(() => import('../industrial/pages/SettingsPage'))
const CreateJob = lazyPage(() => import('./CreateJob'))

const NAV_SECTIONS = [
  { label: 'TODAY', items: [{ id: 'today', label: 'Today', icon: 'home' }] },
  // in work order (Jose, 25 Oct 2026): the jobs, then where the cargo is as it moves
  // (sea → port → road), the paperwork, money; records and admin last
  { label: 'JOBS', items: [{ id: 'jobs', label: 'All jobs', icon: 'list-details' }] },
  { label: 'TRACKING', items: [
    { id: 'vessels', label: 'Vessels', icon: 'ship' },
    { id: 'containers', label: 'Containers', icon: 'box' },
    { id: 'trucks', label: 'Trucks', icon: 'truck' },
  ] },
  { label: 'CUSTOMS & PAPERS', items: [
    { id: 'customs', label: 'BE & OOC', icon: 'file-certificate' },
    { id: 'documents', label: 'Documents', icon: 'files' },
  ] },
  // (Payments, Detention and Team & stages left the menu on 31 Oct 2026 (Jose): Payments had
  // nothing to show, Detention is the Containers page's "Detention risk" tab, and Team &
  // stages repeated Today until jobs can be given an owner. Their old links still land.)
  { label: 'RECORDS', items: [
    { id: 'clients', label: 'Clients', icon: 'users' },
    { id: 'compliance', label: 'BIS & Licences', icon: 'certificate' },
  ] },
  { label: 'ADMIN', items: [
    { id: 'bot', label: 'WhatsApp bot', icon: 'brand-whatsapp' },
    { id: 'health', label: 'System health', icon: 'heart-rate-monitor' },
    // reached from Ctrl K → "Look up on ULIP" (Jose, 25 Oct 2026: one search box, not two)
    { id: 'search', label: 'ULIP lookup', icon: 'search', hidden: true },
    // theme, rows, text size, start page, alerts, password (Jose, 31 Oct 2026)
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ] },
]

// Old page names still work (bookmarks, bell links)
// (the shipment board was removed on 25 Oct 2026: All jobs does the job)
const OLD_TAB_NAMES = { lookup: 'search', 'shipment-tracker': 'jobs', board: 'jobs', 'be-filing': 'customs', detention: 'containers', payments: 'today', overview: 'today' }

const NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items)

function AdminDashboardInner() {
  const journey = useJourney()
  const [drawer, setDrawer] = useState(null) // { id, tab }
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile } = useAuth()
  // re-render every page when a preference changes (12 h / 24 h times, start page)
  const [prefs] = usePrefs()
  const [jobs, setJobs] = useState([])
  const [profiles, setProfiles] = useState({})
  const [selectedJob, setSelectedJob] = useState(null)
  const [showCreateJob, setShowCreateJob] = useState(false)
  // a file sent to the WhatsApp bot: its "create a new job" link opens Create job with it
  const [createFromFile, setCreateFromFile] = useState(null)
  // These effects react to a link (URL, bell or alert) once and then clear it, so
  // setting state inside them is the point, not a render loop.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const path = params.get('createFrom')
    if (!path) return
    setCreateFromFile(path)
    setShowCreateJob(true)
    params.delete('createFrom')
    navigate(`/admin?${params.toString()}`, { replace: true })
  }, [location.search]) // eslint-disable-line react-hooks/exhaustive-deps
  const [pendingNavAction, setPendingNavAction] = useState(null)
  const [documentExpandJobId, setDocumentExpandJobId] = useState(null)
  const [toastState, setToastState] = useState(null)

  // no ?tab= (just signed in): the start page chosen in Settings
  const landing = LANDING_PAGES.some((p) => p.value === prefs.landing) ? prefs.landing : 'today'
  const activeNav = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const t = params.get('tab') || landing
    return OLD_TAB_NAMES[t] || t
  }, [location.search, landing])

  useEffect(() => {
    if (location.state?.tab) {
      navigate(`/admin?tab=${location.state.tab}`, { replace: true })
      window.history.replaceState({}, '')
    }
  }, [])

  useEffect(() => {
    let mounted = true
    async function load() {
      const [{ data: jobsData }, { data: profilesData }] = await Promise.all([
        supabase.from('jobs').select('*').order('updated_at', { ascending: false }),
        supabase.from('profiles').select('id, name'),
      ])
      if (!mounted) return
      setJobs(jobsData ?? [])
      // Background LDB refresh on login — only if last refresh was 6+ hours ago
      if ((jobsData || []).some(j => j.containers)) {
        const REFRESH_GAP_HOURS = 6
        const loginKey = `jds_last_login_refresh_${user?.id || 'unknown'}`
        const lastLoginRefresh = localStorage.getItem(loginKey)
        const hoursSince = lastLoginRefresh
          ? (Date.now() - new Date(lastLoginRefresh).getTime()) / (1000 * 60 * 60)
          : Infinity
        if (hoursSince >= REFRESH_GAP_HOURS) {
          localStorage.setItem(loginKey, new Date().toISOString())
          forceRefreshAllContainers(jobsData).catch(err =>
            console.warn('[LDB] Background refresh on login failed:', err)
          )
        }
      }
      // Restore selected job from URL
      const params = new URLSearchParams(window.location.search)
      const jobId = params.get('jobId')
      if (jobId && jobsData) {
        const found = jobsData.find(j => j.id === jobId)
        if (found) setSelectedJob(found)
      }
      const map = {}
      ;(profilesData ?? []).forEach((p) => { map[p.id] = p.name })
      setProfiles(map)
    }
    load()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (pendingNavAction?.tab === 'jobs' && pendingNavAction?.jobId && jobs.length > 0) {
      const job = jobs.find(j => j.id === pendingNavAction.jobId)
      if (job) {
        setSelectedJob(job)
        setPendingNavAction(null)
      }
    }
    if (pendingNavAction?.tab === 'documents' && pendingNavAction?.jobNo && jobs.length > 0) {
      setDocumentExpandJobId(pendingNavAction.jobNo)
      setPendingNavAction(null)
      setTimeout(() => {
        const el = document.getElementById(`doc-job-${pendingNavAction.jobNo}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 200)
    }
  }, [pendingNavAction, jobs])
  /* eslint-enable react-hooks/set-state-in-effect */

  const showToast = (message, type = 'success') => {
    const id = Date.now()
    setToastState({ id, message, type })
    window.setTimeout(() => setToastState((prev) => (prev?.id === id ? null : prev)), 2800)
  }

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.replace('/login') }
  const handleNavClick = (id) => {
    navigate(`/admin?tab=${id}`, { replace: true })
    setSelectedJob(null)
  }

  const handleDeleteJob = async (job) => {
    if (!(await askConfirm({ title: `Delete job ${job.job_no || ''}?`, text: 'The job, its papers and its tracking are removed. Its history is kept. This cannot be undone.', ok: 'Delete job', danger: true }))) return

    try {
      // 1. Delete related documents from storage (best-effort — RLS may block)
      try {
        const { data: docs } = await supabase.from('documents').select('file_path').eq('job_id', job.id)
        if (docs && docs.length > 0) {
          const filePaths = docs.map((d) => d.file_path).filter(Boolean)
          if (filePaths.length > 0) {
            await supabase.storage.from('job-documents').remove(filePaths)
          }
        }
      } catch { /* storage delete is best-effort */ }

      // 2. Delete document records
      await supabase.from('documents').delete().eq('job_id', job.id)

      // 3. Delete job extractions
      await supabase.from('job_extractions').delete().eq('job_id', job.id)

      // 3b. Keep the job's history but unlink it (it still says "J-1002 …"), in case the
      // database rule that does this by itself (sql/014) is not in place
      await supabase.from('activity_log').update({ job_id: null }).eq('job_id', job.id)

      // 4. Delete the job itself — use .select() to verify the row was actually removed
      const { data: deleted, error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', job.id)
        .select()

      if (error) {
        showToast(error.message || 'Delete failed.', 'error')
        return
      }

      if (!deleted || deleted.length === 0) {
        showToast(
          'Delete blocked by database permissions. Apply backend/src/db/migrations/002_jobs_rls.sql in Supabase SQL Editor.',
          'error'
        )
        return
      }

      // 5. Update frontend state — remove from jobs list, clear selection, and refresh the
      // shared job list so the job leaves All jobs, Today and the menu counts at once
      // (Jose, 31 Oct 2026: "delete job is not working" — the job stayed on screen)
      setJobs((prev) => prev.filter((j) => j.id !== job.id))
      if (selectedJob?.id === job.id) {
        setSelectedJob(null)
        navigate('/admin?tab=jobs', { replace: true })
      }
      journey?.refresh()
      try {
        await supabase.from('activity_log').insert({
          type: 'job_deleted', action: 'job_deleted', title: `${job.job_no} — Job deleted`,
          note: `${job.client || ''} · deleted by ${profile?.name || 'staff'}`, job_no: job.job_no,
          done_by_name: profile?.name || null, meta: { job_no: job.job_no }, created_at: new Date().toISOString(),
        })
      } catch { /* history line is best-effort */ }
      showToast(`${job.job_no} deleted.`, 'success')
    } catch (e) {
      showToast(e?.message || 'Delete failed.', 'error')
    }
  }

  const refreshJobs = async () => {
    journey?.refresh()
    const { data: jobsData } = await supabase.from('jobs').select('*').order('updated_at', { ascending: false })
    setJobs(jobsData ?? [])
    if (selectedJob?.id) {
      const refreshed = (jobsData ?? []).find((j) => j.id === selectedJob.id)
      if (refreshed) setSelectedJob(refreshed)
    }
  }

  const currentUserName = profile?.name || '—'
  const isAdmin = profile?.role === 'admin'
  const canUpdateStage = isAdmin || ['Trupti', 'Uphadhya'].includes(currentUserName)

  // Open a job on a given tab (used by Today, Board, Trucks, Customs, Search …).
  // 'truck' goes to the Trucks page, where trucks are assigned. Each open is a
  // new history entry, so the browser's Back button returns to the page you came from.
  const DRAWER_TABS = ['overview', 'containers', 'timeline', 'docs', 'notes']
  const openFullJob = async (jobId, tab = 'details') => {
    setDrawer(null)
    rememberJob(jobId)
    // customs and truck checks now live on their own pages
    if (tab === 'customs') { navigate(`/admin?tab=customs&job=${jobId}`); return }
    if (tab === 'truck') { navigate(`/admin?tab=trucks&job=${jobId}`); return }
    // papers are uploaded on the Documents page (the full job page has no papers tab)
    if (tab === 'documents') { navigate(`/admin?tab=documents&job=${jobId}`); return }
    const { data: fresh } = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle()
    navigate(`/admin?tab=jobs&jobId=${jobId}#${tab}`)
    if (fresh) {
      setSelectedJob(fresh)
      setJobs(prev => prev.map(j => (j.id === fresh.id ? fresh : j)))
    }
  }
  const openTruck = (jobId) => {
    setDrawer(null)
    const job = journey?.byId?.[jobId]?.job || jobs.find((j) => j.id === jobId)
    navigate(`/admin?tab=trucks&q=${encodeURIComponent(job?.job_no || '')}`)
  }
  const openJob = async (jobId, tab = 'overview') => {
    rememberJob(jobId)
    if (tab === 'truck') return openTruck(jobId)
    // a job the shared data has not loaded yet (just created): open it in full
    if (!journey?.byId?.[jobId]) return openFullJob(jobId, DRAWER_TABS.includes(tab) ? 'details' : tab)
    setDrawer({ id: jobId, tab: DRAWER_TABS.includes(tab) ? tab : 'overview' })
  }
  // once the portal has its data: fetch the busy pages' code and the documents list in
  // the background, so opening them later is instant (Jose, 25 Oct 2026)
  const warmed = useRef(false)
  useEffect(() => {
    if (warmed.current || !journey?.data) return
    warmed.current = true
    const t = setTimeout(() => {
      loadDocs()
      import('../components/DocumentsSection')
      import('../components/ContainerTrackingSection').then((m) => m.warmContainers?.())
      import('../industrial/pages/ContainersPage')
      import('../industrial/pages/VesselsPage')
      import('../industrial/pages/TrucksPage')
    }, 1500)
    return () => clearTimeout(t)
  }, [journey?.data])

  // links from alerts (bell and desktop; alertLinks.js): pick the alert's job on its page
  /* eslint-disable react-hooks/set-state-in-effect -- reacts to the link once, then clears it */
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tab = params.get('tab')
    const open = params.get('open')
    const job = params.get('job')
    if (tab === 'jobs' && open && journey?.data) {
      openJob(open)
      params.delete('open')
      navigate(`/admin?${params.toString()}`, { replace: true })
    } else if (tab === 'containers' && job && jobs.length) {
      setPendingNavAction({ tab: 'containers', jobId: job, cn: params.get('cn') })
    } else if (tab === 'documents' && job && jobs.length) {
      const no = jobs.find((j) => j.id === job)?.job_no
      if (no) setDocumentExpandJobId(no)
    }
  }, [location.search, jobs.length, !!journey?.data]) // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  const canEditBE = isAdmin || ['Akshyani', 'Trupti'].includes(currentUserName)
  const pageProps = { profile, currentUserName, onOpenJob: openJob, showToast, canUpdateStage, canEditBE }
  // sidebar badges: neutral for totals, status-amber for jobs waiting on an action,
  // red for urgent (Jose, 31 Oct 2026: never the brand amber). Trucks and Detention
  // read the shared lists (JOURNEY_FACTS.md), the same ones Today, Trucks and Detention use
  const truckCount = journey?.facts?.needTruck?.length || 0
  const detentionCount = journey?.facts?.detention?.length || 0
  const navCounts = {
    jobs: journey?.active?.length || null,
    customs: journey?.active?.filter((r) => r.j.phase === 'ooc').length || null,
    trucks: truckCount ? { n: truckCount, tone: 'amber', title: `${truckCount} ${truckCount === 1 ? 'job needs' : 'jobs need'} a truck` } : null,
    containers: detentionCount ? { n: detentionCount, tone: 'red', title: `${detentionCount} ${detentionCount === 1 ? 'job' : 'jobs'} at detention risk (2 free days or less)` } : null,
  }
  const urlJob = new URLSearchParams(location.search).get('job')
  // an older screen that draws no heading of its own: the same page heading as the new ones
  const legacyPage = (title, sub, node) => (
    <>
      <PageHead title={title} sub={sub} />
      {node}
    </>
  )
  const fullJob = selectedJob && activeNav === 'jobs'
  const closeFullJob = () => {
    setSelectedJob(null)
    const params = new URLSearchParams(window.location.search)
    params.delete('jobId')
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }
  const ixProps = { ...pageProps, onGo: handleNavClick, onCreateJob: () => setShowCreateJob(true) }

  return (
    <Shell
      sections={NAV_SECTIONS}
      active={activeNav}
      counts={navCounts}
      onGo={handleNavClick}
      onOpenJob={(id) => openJob(id)}
      onCreateJob={() => setShowCreateJob(true)}
      onLogout={handleLogout}
      profile={profile}
      onBellNavigate={(action) => {
        // the alert's own page, with its job picked (alertLinks.js)
        if (action.url) { setSelectedJob(null); navigate(action.url); return }
        setPendingNavAction(action)
        handleNavClick(action.tab)
        if (action.hash) setTimeout(() => { window.location.hash = action.hash }, 100)
      }}
    >
      {/* every page mounts the same way: one .ix-page frame here, and the page draws
          only its own PageHead and content, no outer padding, background or h1 (Jose, 31 Oct 2026) */}
      <div className={`ix-page${activeNav === 'vessels' ? ' ix-page-wide' : ''}`}>
      <Suspense fallback={<div className="ix-card"><Skeleton rows={6} /></div>}>
      {fullJob && (
        <JobDetailView
          job={selectedJob} profiles={profiles} currentUserName={currentUserName}
          isAdmin={isAdmin} canUpdateStage={canUpdateStage}
          hideTabs={['customs', 'vessel', 'truck']}
          onBack={closeFullJob}
          onSaved={refreshJobs} toast={showToast}
          onDelete={() => handleDeleteJob(selectedJob)}
        />
      )}

      {!fullJob && activeNav === 'today' && <IxTodayPage {...ixProps} />}
      {!fullJob && activeNav === 'jobs' && <IxJobsPage {...ixProps} selectedId={drawer?.id} />}
      {activeNav === 'customs' && <IxCustomsPage key={urlJob || 'none'} {...ixProps} />}
      {activeNav === 'trucks' && <IxTrucksPage key={urlJob || 'none'} {...ixProps} />}
      {activeNav === 'vessels' && <IxVesselsPage key={urlJob || 'none'} {...ixProps} />}


      {activeNav === 'containers' && (
        <IxContainersPage
          showToast={showToast}
          jobs={jobs}
          pendingNavAction={activeNav === 'containers' ? pendingNavAction : null}
          onNavActionConsumed={() => setPendingNavAction(null)}
          onOpenJob={openJob}
        />
      )}

      {activeNav === 'documents' && legacyPage('Documents', undefined,
        <DocumentsSection
          jobs={jobs} profiles={profiles} currentUserName={currentUserName} showToast={showToast}
          initialExpandJobId={documentExpandJobId} onExpandConsumed={() => setDocumentExpandJobId(null)}
        />
      )}
      {activeNav === 'search' && <SearchPage {...pageProps} />}
      {activeNav === 'clients' && <ClientsPage {...pageProps} />}
      {activeNav === 'compliance' && legacyPage('BIS & Licences', undefined, <ComplianceSection showToast={showToast} />)}
      {activeNav === 'bot' && <BotPreviewPage {...pageProps} />}
      {activeNav === 'health' && <IxHealthPage />}
      {activeNav === 'settings' && (
        <IxSettingsPage {...ixProps} user={user} onLogout={handleLogout} onRefresh={refreshJobs} />
      )}

      {!NAV_ITEMS.some(n => n.id === activeNav) && (
        <div className="ix-card ix-empty">This page does not exist. Pick one from the menu.</div>
      )}
      </Suspense>
      </div>

      <Suspense fallback={null}>
      {drawer && (
        <JobDrawer
          key={`${drawer.id}-${drawer.tab}`}
          jobId={drawer.id}
          initialTab={drawer.tab}
          onClose={() => setDrawer(null)}
          onOpenFull={openFullJob}
          onOpenTruck={openTruck}
          currentUserName={currentUserName}
          showToast={showToast}
        />
      )}

      {showCreateJob && (
        <div className="ix-modal-bg">
          <div className="ix-modal">
            <CreateJob
              isModal
              initialFilePath={createFromFile}
              onCancel={() => { setShowCreateJob(false); setCreateFromFile(null) }}
              onCreated={async () => {
                setShowCreateJob(false)
                setCreateFromFile(null)
                await refreshJobs()
                showToast('Job created.', 'success')
              }}
            />
          </div>
        </div>
      )}
      </Suspense>

      {toastState && <div className={`ix-toast ${toastState.type}`} role="status">{toastState.message}</div>}
    </Shell>
  )
}

export default function AdminDashboard() {
  return (
    <JourneyProvider>
      <AdminDashboardInner />
    </JourneyProvider>
  )
}
