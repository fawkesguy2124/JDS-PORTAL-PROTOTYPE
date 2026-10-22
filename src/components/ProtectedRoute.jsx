import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// While the sign-in is checked. After 15 seconds a Reload button appears: a
// stuck connection or an expired sign-in otherwise leaves only a spinning circle.
function FullPageSpinner() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 15000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center">
      <div className="h-10 w-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
      {slow && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-gray-600">This is taking longer than usual.</p>
          <button type="button" onClick={() => window.location.reload()}
            className="h-11 px-5 rounded-lg bg-[#1a4fa0] text-white text-sm font-semibold">Reload</button>
        </div>
      )}
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
