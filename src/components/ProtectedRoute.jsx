import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../supabase'

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="h-10 w-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function ProtectedRoute({ allowedRole, children }) {
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false

    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return

      if (!session?.user) {
        setStatus('denied')
        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (cancelled) return

      if (error || !profile || profile.role !== allowedRole) {
        setStatus('denied')
        return
      }

      setStatus('allowed')
    }

    checkAccess()

    return () => {
      cancelled = true
    }
  }, [allowedRole])

  if (status === 'loading') return <FullPageSpinner />
  if (status === 'denied') return <Navigate to="/login" replace />

  return children
}
