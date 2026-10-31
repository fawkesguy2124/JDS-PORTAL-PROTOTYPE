import { Suspense, useLayoutEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import lazyPage from './utils/lazyPage'
import { releaseTheme } from './ui/hooks'

const AdminDashboard = lazyPage(() => import('./pages/AdminDashboard'))
const CreateJob = lazyPage(() => import('./pages/CreateJob'))
const EmployeeDashboard = lazyPage(() => import('./pages/EmployeeDashboard'))

// While a page's code loads: the same JDS tile as the boot screen (index.html),
// on token colours, so a dark /admin start stays dark from first frame to Shell.
const Loading = () => (
  <div className="ix-boot" role="status" aria-label="Loading"><div className="ix-boot-logo" aria-hidden="true">JDS</div></div>
)

// Only Shell pages are themed (src/ui/hooks.js). index.html puts the saved theme
// on <html> for /admin before React loads; any other route drops it again (e.g.
// /admin sends a signed-out visitor to /login).
function ThemeScope() {
  const { pathname } = useLocation()
  useLayoutEffect(() => { if (!/^\/admin\/?$/.test(pathname)) releaseTheme() }, [pathname])
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
          <Route path="/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminDashboard />
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
                <EmployeeDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/field"
            element={
              <ProtectedRoute allowedRole="field_ops">
                <EmployeeDashboard />
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
