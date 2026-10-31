import { Suspense, useLayoutEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import lazyPage from './utils/lazyPage'
import { releaseTheme } from './ui/hooks'

const AdminDashboard = lazyPage(() => import('./pages/AdminDashboard'))
const CreateJob = lazyPage(() => import('./pages/CreateJob'))
const EmployeeDashboard = lazyPage(() => import('./pages/EmployeeDashboard'))
// the one-screen portal for every role (Jose, 31 Oct 2026); the old dashboards
// stay reachable as "Classic view" (/admin/classic, /dashboard/classic, /field/classic)
const Portal = lazyPage(() => import('./portal/Portal'))

// Classic view lasts for the rest of this tab's session: the old dashboards link to
// /admin?tab=…, /dashboard?tab=…, /field?tab=…, and those must stay in Classic.
// Logging out (→ /login), a new tab, or ?view=new returns to the new portal.
const CLASSIC_KEY = 'jds_classic'
const isClassic = () => { try { return sessionStorage.getItem(CLASSIC_KEY) === '1' } catch { return false } }

function RoleHome({ Classic }) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const wantsNew = new URLSearchParams(search).get('view') === 'new'
  useLayoutEffect(() => {
    if (!wantsNew) return
    try { sessionStorage.removeItem(CLASSIC_KEY) } catch { /* private mode */ }
    const q = new URLSearchParams(search)
    q.delete('view')
    const rest = q.toString()
    navigate(`${pathname}${rest ? `?${rest}` : ''}`, { replace: true })
  }, [wantsNew, pathname, search, navigate])
  if (wantsNew) return null
  if (!isClassic()) return <Portal />
  // the way back from Classic view (outside the old dashboards, which stay untouched)
  return (
    <>
      <Classic />
      <style>{BACK_PILL_CSS}</style>
      <button type="button" className="jds-back-new" onClick={() => navigate(`${pathname}?view=new`, { replace: true })}>
        Back to new view
      </button>
    </>
  )
}

// bottom right; on a phone above the old bottom tab bar
const BACK_PILL_CSS = `
.jds-back-new { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; padding: 9px 16px;
  border: 1px solid rgba(15, 23, 42, .14); border-radius: 999px; background: #fff; color: #1f2937;
  font: 500 14px/1.2 Roboto, system-ui, sans-serif; box-shadow: 0 2px 10px rgba(15, 23, 42, .16); cursor: pointer }
.jds-back-new:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 2px }
@media (max-width: 1023.98px) { .jds-back-new { right: 12px; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); padding: 7px 12px; font-size: 13px } }
`

function EnterClassic({ base }) {
  const { search, hash } = useLocation()
  try { sessionStorage.setItem(CLASSIC_KEY, '1') } catch { /* private mode: this visit only */ }
  return <Navigate to={`${base}${search}${hash}`} replace />
}

function LeaveClassic() {
  useLayoutEffect(() => { try { sessionStorage.removeItem(CLASSIC_KEY) } catch { /* private mode */ } }, [])
  return null
}

// While a page's code loads: the same JDS tile as the boot screen (index.html),
// on token colours, so a dark /admin start stays dark from first frame to Shell.
const Loading = () => (
  <div className="ix-boot" role="status" aria-label="Loading"><div className="ix-boot-logo" aria-hidden="true">JDS</div></div>
)

// Only the portal and Shell pages are themed (src/ui/hooks.js). index.html puts the
// saved theme on <html> for /admin, /dashboard and /field before React loads; any
// other route drops it again (e.g. a signed-out visitor sent to /login). The
// classic employee / field dashboard is not themed (legacy light UI).
const themedPath = (pathname) => /^\/(admin|dashboard|field)\/?$/.test(pathname) && !(isClassic() && !/^\/admin/.test(pathname))
function ThemeScope() {
  const { pathname } = useLocation()
  useLayoutEffect(() => { if (!themedPath(pathname)) releaseTheme() }, [pathname])
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ThemeScope />
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<><LeaveClassic /><Login /></>} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRole="admin">
                <RoleHome Classic={AdminDashboard} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/classic"
            element={
              <ProtectedRoute allowedRole="admin">
                <EnterClassic base="/admin" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/create-job"
            element={
              <ProtectedRoute allowedRole={['admin', 'field_ops']}>
                <CreateJob />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRole="employee">
                <RoleHome Classic={EmployeeDashboard} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/classic"
            element={
              <ProtectedRoute allowedRole="employee">
                <EnterClassic base="/dashboard" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/field"
            element={
              <ProtectedRoute allowedRole="field_ops">
                <RoleHome Classic={EmployeeDashboard} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/field/classic"
            element={
              <ProtectedRoute allowedRole="field_ops">
                <EnterClassic base="/field" />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
