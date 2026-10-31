import { Suspense, useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import lazyPage from '../utils/lazyPage'
import { JourneyProvider, useJourney } from '../industrial/JourneyContext'
import { rememberJob } from '../industrial/recentJobs'
import { useMediaQuery, useTheme, pushLayer, trapTab } from '../ui/hooks'
import { initials } from '../ui/utils'
import { PortalContext } from './PortalContext'
import { perms as permsOf, buildList, parseDeepLink } from './model'
import PickerList from './PickerList'
import Spotlight from './Spotlight'
import UserMenu from './UserMenu'
import Manage from './Manage'
import './portal.css'

// The portal, one screen for every role (approved design, Jose 31 Oct 2026):
// the jobs as an endless picker on the left (full screen on a phone); a job
// opens in the right pane (desktop) or grows out of its row into a full page
// (phone). Search, new job, the avatar menu and the older pages (Manage) sit
// on top. The open job, Manage page and Edit details live in the URL
// (?job= / ?manage= / ?edit=1) so links work and Back closes them.
const JobPage = lazyPage(() => import('./JobPage'))
const NewJobSheet = lazyPage(() => import('./NewJobSheet'))

const PHONE = '(max-width: 899.98px)'
const FRESH_MS = 60_000
const LDB_GAP_HOURS = 6
const MANAGE_IDS = ['overview', 'bot', 'health', 'search']
const ADMIN_ONLY = ['overview', 'bot', 'health']

const I = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-3.5-3.5',
  x: 'M6 6l12 12M18 6 6 18',
}
const Ico = ({ d }) => <svg className="pt-i" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

// clip the phone page to a rectangle (a row) or open it fully
function clipTo(el, app, r, rad, animate) {
  const a = app.getBoundingClientRect()
  const v = r ? [r.top - a.top, a.right - r.right, a.bottom - r.bottom, r.left - a.left, rad] : [0, 0, 0, 0, 0]
  el.style.transition = animate ? '' : 'none'
  ;['--ct', '--cr', '--cb', '--cl', '--crad'].forEach((k, i) => el.style.setProperty(k, `${Math.max(0, v[i])}px`))
}

// the background LDB refresh both dashboards start on login (6 h gap per person)
function ldbLoginRefresh(jobs, userId) {
  if (!(jobs || []).some((j) => j.containers)) return
  const loginKey = `jds_last_login_refresh_${userId || 'unknown'}`
  let last
  try { last = localStorage.getItem(loginKey) } catch { return }
  const hoursSince = last ? (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60) : Infinity
  if (hoursSince < LDB_GAP_HOURS) return
  try { localStorage.setItem(loginKey, new Date().toISOString()) } catch { /* private mode */ }
  import('../services/tracking/ldbProvider')
    .then((m) => m.forceRefreshAllContainers(jobs))
    .catch((err) => console.warn('[LDB] Background refresh on login failed:', err))
}

const isStale = (loadedAt) => !loadedAt || Date.now() - new Date(loadedAt).getTime() > FRESH_MS

function PortalInner() {
  const { user, profile } = useAuth()
  const { theme, setTheme } = useTheme()
  const layout = useMediaQuery(PHONE) ? 'm' : 'd'
  const { data, rows, byId, profiles, loading, error, refresh, patchJob } = useJourney()
  const location = useLocation()
  const navigate = useNavigate()
  const p = useMemo(() => permsOf(profile), [profile])
  const base = `/${location.pathname.split('/')[1] || 'admin'}`

  const [personId, setPersonId] = useState(null)
  const [spot, setSpot] = useState({ open: false, seed: '' })
  const [menu, setMenu] = useState({ open: false, anchor: null })
  const [newJob, setNewJob] = useState({ open: false, ever: false })
  const [createPage, setCreatePage] = useState(null) // { file } from "Fill in manually"

  const appRef = useRef(null)
  const listRef = useRef(null)
  const paneRef = useRef(null)
  const ppageRef = useRef(null)
  const mpageRef = useRef(null)
  const toastRef = useRef(null)
  const toastT = useRef(0)
  const pendingRect = useRef(null)
  const openRef = useRef(null)

  // ── URL state ──
  const sp = new URLSearchParams(location.search)
  const legacy = [...sp.keys()].some((k) => !['job', 'manage', 'edit'].includes(k))
  const urlJob = !legacy ? sp.get('job') : null
  const openId = data && urlJob && byId[urlJob] ? urlJob : null
  const urlManage = !legacy ? sp.get('manage') : null
  const manageId = urlManage && MANAGE_IDS.includes(urlManage) && (p.canManage || !ADMIN_ONLY.includes(urlManage)) ? urlManage : null
  const createFrom = location.state?.ptCreate || null
  const managePage = createPage ? { id: 'create', file: createPage.file || null }
    : createFrom ? { id: 'create', path: createFrom }
    : openId && sp.get('edit') === '1' ? { id: 'edit', jobId: openId }
    : manageId ? { id: manageId } : null
  const manageOpen = !!managePage

  // the job whose page is on screen: stays during the closing animation
  const [shown, setShown] = useState(null)
  if (openId && openId !== shown) setShown(openId)
  const row = shown ? byId[shown] || null : null

  const items = useMemo(() => buildList(rows, data, { perms: p, personId, profiles }), [rows, data, p, personId, profiles])

  // ── toast (prototype: one line, 2.2 s; errors 4 s) ──
  const toast = useCallback((message, tone = 'info') => {
    const el = toastRef.current
    if (!el || !message) return
    el.textContent = message
    el.classList.toggle('err', tone === 'error')
    el.classList.remove('on')
    void el.offsetWidth
    el.classList.add('on')
    clearTimeout(toastT.current)
    toastT.current = setTimeout(() => el.classList.remove('on'), tone === 'error' ? 4000 : 2200)
  }, [])
  useEffect(() => () => clearTimeout(toastT.current), [])

  // ── navigation ──
  const go = useCallback((params, push, state) => {
    const s = params.toString()
    navigate({ pathname: location.pathname, search: s ? `?${s}` : '' }, push ? { state: { pt: 1 } } : { replace: true, state: state === undefined ? location.state : state })
  }, [navigate, location.pathname, location.state])

  const openJob = useCallback((id) => {
    if (!id) return
    rememberJob(id)
    const q = new URLSearchParams()
    q.set('job', String(id))
    go(q, !openId && !manageOpen)
  }, [go, openId, manageOpen])

  const closeJob = useCallback(() => {
    if (!openId) return
    if (location.state?.pt && !manageOpen) navigate(-1)
    else go(new URLSearchParams(), false, null)
  }, [openId, location.state, manageOpen, navigate, go])

  const openEdit = useCallback((jobId) => {
    const q = new URLSearchParams()
    q.set('job', String(jobId))
    q.set('edit', '1')
    go(q, true)
  }, [go])

  const openManage = useCallback((id, opts = {}) => {
    if (!MANAGE_IDS.includes(id) || (ADMIN_ONLY.includes(id) && !p.canManage)) return
    if (id === 'search' && opts.lookup) {
      try { sessionStorage.setItem('ix_lookup', opts.lookup) } catch { /* private mode: the page opens empty */ }
      if (manageId === 'search') window.dispatchEvent(new CustomEvent('ix-lookup', { detail: opts.lookup }))
    }
    if (manageId === id) return
    const q = new URLSearchParams()
    if (openId) q.set('job', openId)
    q.set('manage', id)
    go(q, !manageOpen)
  }, [p.canManage, manageId, openId, manageOpen, go])

  const closeManage = useCallback(() => {
    if (createPage) { setCreatePage(null); return }
    if (createFrom) { go(new URLSearchParams(location.search), false, null); return }
    if (location.state?.pt) { navigate(-1); return }
    const q = new URLSearchParams()
    if (openId) q.set('job', openId)
    go(q, false, null)
  }, [createPage, createFrom, location.state, location.search, openId, navigate, go])

  // a page inside Manage opened a job: show it in place of the frame
  const manageOpenJob = useCallback((id) => {
    setCreatePage(null)
    rememberJob(id)
    const q = new URLSearchParams()
    q.set('job', String(id))
    go(q, false)
  }, [go])

  const openNewJob = useCallback(() => {
    if (!p.canCreateJob) return
    setMenu((m) => (m.open ? { ...m, open: false } : m))
    setSpot((s) => (s.open ? { ...s, open: false } : s))
    setNewJob({ open: true, ever: true })
  }, [p.canCreateJob])

  const openSearch = useCallback((seed = '') => {
    setMenu((m) => (m.open ? { ...m, open: false } : m))
    setNewJob((n) => (n.open ? { ...n, open: false } : n))
    setSpot({ open: true, seed })
  }, [])

  const ctx = useMemo(() => ({
    profile, user, perms: p, layout, toast, openJob, closeJob, openEdit, openManage, openNewJob,
  }), [profile, user, p, layout, toast, openJob, closeJob, openEdit, openManage, openNewJob])

  // ── deep links (BUILD-SPEC §5): old links from alerts, the bot and bookmarks ──
  const ready = !!data
  useEffect(() => {
    if (!ready) return
    const dl = parseDeepLink(location.search, rows, p)
    if (dl) {
      const q = new URLSearchParams()
      if (dl.create) { go(q, false, { ptCreate: dl.create }); return }
      if (dl.notFound) toast('That job was not found')
      if (dl.job) { rememberJob(dl.job); q.set('job', dl.job) }
      if (dl.manage) q.set('manage', dl.manage)
      go(q, false, null)
      return
    }
    const want = new URLSearchParams(location.search).get('job')
    if (want && !byId[want]) {
      toast('That job was not found')
      go(new URLSearchParams(), false, null)
      return
    }
    const m = new URLSearchParams(location.search).get('manage')
    if (m && !manageId) go(new URLSearchParams(want ? { job: want } : {}), false, null)
  }, [ready, location.search]) // eslint-disable-line react-hooks/exhaustive-deps

  // the job page's code loads while the list is idle, so the first opening is instant
  useEffect(() => {
    if (!ready) return undefined
    const t = setTimeout(() => { import('./JobPage').catch(() => {}) }, 900)
    return () => clearTimeout(t)
  }, [ready])

  // ── data freshness ──
  const ldbDone = useRef(false)
  useEffect(() => {
    if (!data || ldbDone.current) return
    ldbDone.current = true
    ldbLoginRefresh(data.jobs, user?.id)
  }, [data, user?.id])

  const onVisible = useEffectEvent(() => {
    if (document.visibilityState === 'visible' && data && !loading && isStale(data.loadedAt)) refresh()
  })
  useEffect(() => {
    const fn = () => onVisible()
    document.addEventListener('visibilitychange', fn)
    return () => document.removeEventListener('visibilitychange', fn)
  }, [])

  // ── open / close motion (prototype open() / closePage() / clip()) ──
  useEffect(() => { openRef.current = openId }, [openId])
  const prevOpen = useRef(null)
  const prevLayout = useRef(layout)
  useLayoutEffect(() => {
    const was = prevOpen.current
    const layoutChanged = prevLayout.current !== layout
    prevOpen.current = openId
    prevLayout.current = layout
    const m = mpageRef.current, app = appRef.current
    if (layoutChanged && m && app) clipTo(m, app, null, 0, false)
    if (layout === 'd') {
      const pane = paneRef.current
      if (openId && openId !== was && pane) {
        pane.classList.remove('has')
        void pane.offsetHeight
        pane.classList.add('has')
        if (ppageRef.current) ppageRef.current.scrollTop = 0
      }
      if (!openId && was) {
        const t = setTimeout(() => { if (!openRef.current) setShown(null) }, 480)
        return () => clearTimeout(t)
      }
      return undefined
    }
    if (!m || !app) return undefined
    if (openId && openId !== was) {
      const r = pendingRect.current || listRef.current?.rectFor(openId)
      pendingRect.current = null
      m.scrollTop = 0
      if (!was && !layoutChanged) {
        clipTo(m, app, r, 16, false)
        void m.offsetHeight
      }
      const raf = requestAnimationFrame(() => clipTo(m, app, null, 0, true))
      // focus Back once the page is there (its code may still be loading on the first opening)
      let tries = 0, t = 0
      const focusBack = () => {
        const b = m.querySelector('.pt-back')
        if (b) { b.focus({ preventScroll: true }); return }
        if (++tries < 20) t = setTimeout(focusBack, 100)
      }
      t = setTimeout(focusBack, 80)
      return () => { cancelAnimationFrame(raf); clearTimeout(t) }
    }
    if (!openId && was) {
      clipTo(m, app, listRef.current?.rectFor(null), 16, true)
      const t = setTimeout(() => {
        if (openRef.current) return
        setShown(null)
        clipTo(m, app, null, 0, false)
      }, 480)
      return () => clearTimeout(t)
    }
    return undefined
  }, [openId, layout])

  // ── keys: Esc closes the job (overlays handle their own), ↑ ↓ Enter, type to search ──
  const baseLayer = useRef(null)
  const jobLayer = useRef(null)
  useEffect(() => {
    baseLayer.current = pushLayer(Symbol('pt-base'))
    return () => { baseLayer.current?.release(); baseLayer.current = null }
  }, [])
  const jobOpen = !!openId
  useEffect(() => {
    if (!jobOpen) return undefined
    jobLayer.current = pushLayer(Symbol('pt-job'))
    return () => { jobLayer.current?.release(); jobLayer.current = null }
  }, [jobOpen])

  const onKey = useEffectEvent((e) => {
    const top = jobLayer.current ? jobLayer.current.isTop() : !!baseLayer.current?.isTop()
    if (!top || managePage) return
    if (e.key === 'Escape') { if (openId) { e.preventDefault(); closeJob() } return }
    if (e.key === 'Tab') { if (openId && layout === 'm') trapTab(e, mpageRef.current); return }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(''); return }
    if (e.defaultPrevented || e.isComposing) return
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]:not(.pt-mpage)')) return
    if (layout !== 'd') return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      e.preventDefault()
      const id = listRef.current?.step(e.key === 'ArrowDown' ? 1 : -1)
      if (id && openId) openJob(id)
      return
    }
    if (e.key === 'Enter') {
      if (e.target.closest?.('button, a, label, [role="button"]')) return
      const id = listRef.current?.focusedId()
      if (id) { e.preventDefault(); openJob(id) }
      return
    }
    if (e.key.length === 1 && /[\w-]/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      openSearch(e.key)
    }
  })
  useEffect(() => {
    const fn = (e) => onKey(e)
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  // ── handlers ──
  const onRowOpen = (id, rect) => {
    pendingRect.current = rect
    if (id === openId && layout === 'd') return
    openJob(id)
  }
  const pickJob = (id) => {
    setSpot((s) => ({ ...s, open: false }))
    setPersonId(null)
    if (layout === 'm') setTimeout(() => openJob(id), 350)
    else openJob(id)
  }
  const pickPerson = (id) => {
    setSpot((s) => ({ ...s, open: false }))
    setPersonId(id)
    closeJob()
  }
  const lookup = (q) => {
    setSpot((s) => ({ ...s, open: false }))
    openManage('search', { lookup: q })
  }
  const closeOverlays = () => {
    setSpot((s) => (s.open ? { ...s, open: false } : s))
    setMenu((m) => (m.open ? { ...m, open: false } : m))
    setNewJob((n) => (n.open ? { ...n, open: false } : n))
  }
  const toggleMenu = (e) => {
    if (menu.open) { setMenu((m) => ({ ...m, open: false })); return }
    const r = e.currentTarget.getBoundingClientRect()
    const a = appRef.current?.getBoundingClientRect() || { top: 0, left: 0 }
    setMenu({ open: true, anchor: { top: Math.round(r.bottom - a.top + 8), left: Math.max(8, Math.round(r.right - a.left - 300)) } })
  }
  const onCreated = (job) => {
    setNewJob((n) => ({ ...n, open: false }))
    if (job?.id) {
      patchJob(job)
      refresh()
      setPersonId(null)
      openJob(job.id)
      toast(`${job.job_no} created`)
    }
  }
  const onManual = (file) => {
    setNewJob((n) => ({ ...n, open: false }))
    setCreatePage({ file: file || null })
  }
  const logout = async () => { await supabase.auth.signOut(); window.location.replace('/login') }

  // ── view ──
  const title = p.isFieldOps ? 'My moves' : 'Jobs'
  const personName = personId ? profiles[personId] || 'Person' : null
  const receded = layout === 'm' && !!openId
  const scrimOn = spot.open || newJob.open || (menu.open && layout === 'm')

  let empty
  if (!data && loading) empty = <div className="pt-loading" role="status"><span className="pt-spin" />Loading jobs…</div>
  else if (!data && error) empty = <div className="pt-empty" role="alert">Could not load the jobs. <button type="button" className="pt-link" onClick={refresh}>Try again</button></div>
  else if (!data) empty = <div className="pt-loading" role="status"><span className="pt-spin" />Loading jobs…</div>
  else empty = <div className="pt-empty">{personName ? `No jobs for ${personName}.` : 'No jobs here.'}</div>

  const pageFallback = <div className="pt-page-wait"><span className="pt-spin" /></div>
  const jobPage = row ? <Suspense fallback={pageFallback}><JobPage key={row.job.id} row={row} layout={layout} onClose={closeJob} /></Suspense> : null

  return (
    <PortalContext.Provider value={ctx}>
      <div ref={appRef} className={`pt pt-app${receded ? ' receded' : ''}`} data-l={layout}>
        <section className="pt-list" aria-label={title} inert={receded ? true : undefined}>
          <header className="pt-top">
            <div className="pt-mark" aria-hidden="true" />
            <h1>{title}</h1>
            {personName && (
              <button type="button" className="pt-filter" onClick={() => setPersonId(null)} aria-label={`Showing ${personName}'s jobs. Show all jobs`}>
                <span>{personName}</span><Ico d={I.x} />
              </button>
            )}
            <div className="pt-topend">
              {layout === 'd' && p.canCreateJob && (
                <button type="button" className="pt-newbtn" onClick={openNewJob}><Ico d={I.plus} />New job</button>
              )}
              <button type="button" className="pt-av" data-pt-avatar onClick={toggleMenu}
                aria-haspopup="dialog" aria-expanded={menu.open} aria-label={`${profile?.name || 'Your'} menu`}>
                {initials(profile?.name)}
              </button>
            </div>
          </header>
          <div className="pt-feedwrap">
            <PickerList ref={listRef} items={items} layout={layout} openId={openId} keepId={openId} onOpen={onRowOpen} empty={empty} />
          </div>
          {layout === 'd' && (
            <div className="pt-typehint" aria-hidden="true">Type anywhere to search &nbsp;<kbd>↑</kbd> <kbd>↓</kbd> to move &nbsp;<kbd>Enter</kbd> to open</div>
          )}
        </section>

        {layout === 'd' ? (
          <div ref={paneRef} className={`pt-pane${openId ? ' has' : ''}`}>
            <div className="pt-pane-empty">{data ? 'Choose a job' : ''}</div>
            <div ref={ppageRef} className="pt-page" inert={openId ? undefined : true}>{jobPage}</div>
          </div>
        ) : (
          <div ref={mpageRef} className={`pt-page pt-mpage${row ? ' open' : ''}`} role="dialog" aria-modal="true"
            aria-label={row ? `Job ${row.job.job_no}` : 'Job'} inert={openId ? undefined : true}>
            {jobPage}
          </div>
        )}

        {layout === 'm' && (
          <nav className="pt-dock" aria-label="Search and new job" inert={receded ? true : undefined}>
            <button type="button" onClick={() => openSearch('')}><Ico d={I.search} />Search</button>
            {p.canCreateJob && <button type="button" className="plus" onClick={openNewJob} aria-label="New job"><Ico d={I.plus} /></button>}
          </nav>
        )}

        <div className={`pt-scrim${scrimOn ? ' on' : ''}`} onClick={closeOverlays} aria-hidden="true" />
        <Spotlight open={spot.open} seed={spot.seed} rows={rows} data={data} profiles={profiles} listItems={items}
          onClose={() => setSpot((s) => ({ ...s, open: false }))} onPickJob={pickJob} onPickPerson={pickPerson} onLookup={lookup} />
        {newJob.ever && p.canCreateJob && (
          <Suspense fallback={null}>
            <NewJobSheet open={newJob.open} layout={layout} onClose={() => setNewJob((n) => ({ ...n, open: false }))} onCreated={onCreated} onManual={onManual} />
          </Suspense>
        )}
        <UserMenu open={menu.open} anchor={menu.anchor} layout={layout} profile={profile} perms={p} theme={theme} onTheme={setTheme}
          onClose={() => setMenu((m) => ({ ...m, open: false }))}
          onManage={(id) => { setMenu((m) => ({ ...m, open: false })); openManage(id) }}
          onClassic={() => { setMenu((m) => ({ ...m, open: false })); navigate(`${base}/classic`) }}
          onLogout={logout} />
        <Manage page={managePage} onClose={closeManage} onOpenJob={manageOpenJob} onDeleted={() => { setCreatePage(null); go(new URLSearchParams(), false, null) }} />
        <div ref={toastRef} className="pt-toast" role="status" aria-live="polite" />
      </div>
    </PortalContext.Provider>
  )
}

export default function Portal() {
  return (
    <JourneyProvider>
      <PortalInner />
    </JourneyProvider>
  )
}
