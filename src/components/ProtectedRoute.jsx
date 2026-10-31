import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// While the sign-in is checked (token colours: dark on a dark /admin start). After 15 seconds a Reload button appears: a
// stuck connection or an expired sign-in otherwise leaves only a spinning circle.
function FullPageSpinner() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 15000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-bg px-6 text-center" role="status" aria-label="Checking your sign-in">
      <div className="h-10 w-10 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      {slow && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-fg-2">This is taking longer than usual.</p>
          <button type="button" onClick={() => window.location.reload()}
            className="ix-btn primary lg">Reload</button>
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
