import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const AuthContext = createContext(null)

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) {
    console.warn('[Auth] Profile fetch failed:', error.message)
    return null
  }
  return data ?? null
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function restoreSession() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) console.warn('[Auth] getSession error:', error.message)
        if (!mounted) return
        if (session?.user) {
          setUser(session.user)
          const p = await fetchProfile(session.user.id)
          if (mounted) setProfile(p)
        } else {
          setUser(null)
          setProfile(null)
        }
      } catch (err) {
        console.warn('[Auth] restoreSession failed:', err.message)
        if (mounted) { setUser(null); setProfile(null) }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    restoreSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_OUT' || !session?.user) {
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setUser(session.user)
          setProfile(prev => {
            if (prev?.id === session.user.id) return prev
            fetchProfile(session.user.id).then(p => {
              if (mounted) setProfile(p)
            })
            return prev
          })
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) console.warn('[Auth] signOut error:', error.message)
    } catch (err) {
      console.warn('[Auth] signOut failed:', err.message)
    } finally {
      setUser(null)
      setProfile(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
