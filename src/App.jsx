import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import lazyPage from './utils/lazyPage'

const AdminDashboard = lazyPage(() => import('./pages/AdminDashboard'))
const CreateJob = lazyPage(() => import('./pages/CreateJob'))
const EmployeeDashboard = lazyPage(() => import('./pages/EmployeeDashboard'))

const Loading = () => <div style={{ padding: 40, color: '#8a96a8', fontFamily: 'Inter, system-ui, sans-serif' }}>Loading…</div>

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
