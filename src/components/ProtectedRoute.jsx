import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="h-10 w-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function ProtectedRoute({ allowedRole, children }) {
  const { user, profile, loading } = useAuth()
  const allowed = Array.isArray(allowedRole) ? allowedRole : [allowedRole]

  if (loading) return <FullPageSpinner />

  if (!user) return <Navigate to="/login" replace />

  if (!profile) return <FullPageSpinner />

  if (!allowed.includes(profile.role)) return <Navigate to="/login" replace />

  return children
}
