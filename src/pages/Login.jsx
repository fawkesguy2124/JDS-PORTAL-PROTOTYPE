import { useState, useRef, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="h-10 w-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024)
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isDesktop
}

export default function Login() {
  const { user, profile, loading: authLoading } = useAuth()

  const [phone, setPhone]               = useState('')
  const [password, setPassword]         = useState('')
  const [error, setError]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const submittingRef                   = useRef(false)
  const isDesktop = useIsDesktop()

  if (authLoading) return <FullPageSpinner />

  if (user && profile) {
    if (profile.role === 'admin') return <Navigate to="/admin" replace />
    if (profile.role === 'field_ops') return <Navigate to="/field" replace />
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submittingRef.current) return
    setError('')

    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit phone number.')
      return
    }

    submittingRef.current = true
    setLoading(true)
    try {
      // Convert phone number to internal email format
      const email = `${digits}@jds.local`

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError('Incorrect phone number or password. Contact Jose if you need help.')
        return
      }

      if (!data?.user) {
        setError('Sign in failed. Please try again.')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()

      if (profileError || !profile) {
        setError('Account not set up. Contact Jose.')
        await supabase.auth.signOut()
        return
      }

      if (profile.role === 'admin') {
        window.location.replace('/admin')
        return
      }

      if (profile.role === 'employee') {
        window.location.replace('/dashboard')
        return
      }

      if (profile.role === 'field_ops') {
        window.location.replace('/field')
        return
      }

      setError('Invalid role. Contact Jose.')
      await supabase.auth.signOut()
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  // Format phone number as user types — adds spaces: 98765 43210
  const handlePhoneChange = (e) => {
    let digits = e.target.value.replace(/\D/g, '')
    if (digits.length === 12 && digits.startsWith('91')) {
      digits = digits.slice(2)
    } else if (digits.length === 11 && digits.startsWith('0')) {
      digits = digits.slice(1)
    }
    digits = digits.slice(0, 10)
    let formatted = digits
    if (digits.length > 5) {
      formatted = digits.slice(0, 5) + ' ' + digits.slice(5)
    }
    setPhone(formatted)
  }

  if (isDesktop) {
    return (
      <div style={{
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: '8%',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>

        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'url(/assets/port-background.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }} />

        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,30,53,0.12)' }} />

        <div style={{
          position: 'relative',
          width: '100%', maxWidth: '380px',
          background: 'white',
          borderRadius: '20px',
          padding: '36px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
          marginBottom: '15vh',
        }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
            <div style={{
              width: '38px', height: '38px',
              background: '#0f1e35', borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '13px', color: 'white', flexShrink: 0,
            }}>JDS</div>
            <div>
              <p style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#0f1e35' }}>JDS Logistics</p>
              <p style={{ fontSize: '12px', margin: 0, color: '#8a96a8' }}>Operations portal</p>
            </div>
          </div>

          <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f1e35', marginBottom: '24px' }}>
            Sign in
          </div>

          <form onSubmit={handleSubmit}>

            <div style={{ marginBottom: '18px' }}>
              <label style={{
                display: 'block', fontSize: '11px', fontWeight: 700,
                color: '#4a5568', marginBottom: '7px',
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                Phone Number
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <div style={{
                  position: 'absolute', left: '1.5px', top: '1.5px', bottom: '1.5px',
                  width: '48px',
                  background: '#f1f5f9',
                  borderRight: '1.5px solid #e2e6ed',
                  borderRadius: '8px 0 0 8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 700, color: '#4a5568',
                  pointerEvents: 'none', userSelect: 'none',
                }}>
                  +91
                </div>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={handlePhoneChange}
                  autoComplete="tel"
                  inputMode="numeric"
                  style={{
                    width: '100%', height: '48px',
                    paddingLeft: '62px', paddingRight: '14px',
                    border: '1.5px solid #e2e6ed',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600,
                    color: '#0f1e35',
                    outline: 'none',
                    background: '#f8fafc',
                    letterSpacing: '0.08em',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#1a4fa0'
                    e.target.style.boxShadow = '0 0 0 3px rgba(26,79,160,0.1)'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#e2e6ed'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block', fontSize: '11px', fontWeight: 700,
                color: '#4a5568', marginBottom: '7px',
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  style={{
                    width: '100%', height: '48px',
                    padding: '0 48px 0 14px',
                    border: '1.5px solid #e2e6ed',
                    borderRadius: '10px',
                    fontSize: '14px',
                    color: '#0f1e35',
                    outline: 'none',
                    background: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#1a4fa0'
                    e.target.style.boxShadow = '0 0 0 3px rgba(26,79,160,0.1)'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#e2e6ed'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  style={{
                    position: 'absolute', right: '14px', top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: '15px',
                    color: '#8a96a8', padding: '2px', lineHeight: 1,
                  }}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1.5px solid #fecaca',
                borderRadius: '10px', padding: '12px 14px',
                fontSize: '13px', color: '#991b1b',
                marginBottom: '18px',
                display: 'flex', alignItems: 'flex-start', gap: '8px',
              }}>
                <span style={{ flexShrink: 0, marginTop: '1px' }}>⚠</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', height: '50px',
                background: loading ? '#94a3b8' : 'linear-gradient(135deg, #1a4fa0 0%, #1565c0 100%)',
                color: 'white', border: 'none',
                borderRadius: '12px',
                fontSize: '15px', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '8px',
                boxShadow: loading ? 'none' : '0 6px 20px rgba(26,79,160,0.35)',
                letterSpacing: '0.02em',
              }}
            >
              {loading && (
                <span style={{
                  width: '18px', height: '18px',
                  border: '2.5px solid rgba(255,255,255,0.35)',
                  borderTopColor: 'white', borderRadius: '50%',
                  animation: 'loginSpin 0.7s linear infinite',
                  flexShrink: 0,
                }} />
              )}
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>

          </form>

          <div style={{
            marginTop: '24px', paddingTop: '20px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '12px', color: '#8a96a8' }}>Having trouble signing in?</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a4fa0', cursor: 'pointer' }}>Contact Jose</span>
          </div>

          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: '#c4cad4', letterSpacing: '0.02em' }}>
            © 2026 JDS Logistics Pvt Ltd · CBD Belapur, Navi Mumbai
          </div>

        </div>

        <style>{`
          @keyframes loginSpin { to { transform: rotate(360deg) } }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1e35',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'Inter, system-ui, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Background subtle pattern */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(26,79,160,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(21,101,192,0.2) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: '420px',
        background: 'white',
        borderRadius: '20px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
      }}>

        {/* Top header strip */}
        <div style={{
          background: 'linear-gradient(135deg, #0f2744 0%, #1a4fa0 100%)',
          padding: '36px 36px 32px',
          textAlign: 'center',
          position: 'relative',
        }}>
          {/* Decorative circles */}
          <div style={{ position:'absolute', top:'-20px', right:'-20px', width:'100px', height:'100px', borderRadius:'50%', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:'-30px', left:'-10px', width:'80px', height:'80px', borderRadius:'50%', background:'rgba(255,255,255,0.03)', pointerEvents:'none' }} />

          {/* Logo */}
          <div style={{
            width: '60px', height: '60px',
            background: 'rgba(255,255,255,0.12)',
            borderRadius: '16px',
            border: '1.5px solid rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
          }}>
            <span style={{ fontSize: '16px', fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>JDS</span>
          </div>

          <div style={{ fontSize: '22px', fontWeight: 800, color: 'white', marginBottom: '6px', letterSpacing: '-0.3px' }}>
            JDS Logistics
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '9999px',
            padding: '3px 12px',
            fontSize: '11px', fontWeight: 500,
            color: 'rgba(255,255,255,0.7)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            <span style={{ width:'5px', height:'5px', borderRadius:'50%', background:'#4ade80', display:'inline-block' }} />
            Operations Portal
          </div>
        </div>

        {/* Form area */}
        <div style={{ padding: '36px' }}>

          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f1e35', marginBottom: '6px' }}>
              Sign in
            </div>
            <div style={{ fontSize: '13px', color: '#8a96a8', lineHeight: 1.5 }}>
              Enter your registered phone number and password to access the portal.
            </div>
          </div>

          <form onSubmit={handleSubmit}>

            {/* Phone field */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{
                display: 'block', fontSize: '11px', fontWeight: 700,
                color: '#4a5568', marginBottom: '7px',
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                Phone Number
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                {/* +91 prefix box */}
                <div style={{
                  position: 'absolute', left: '1.5px', top: '1.5px', bottom: '1.5px',
                  width: '48px',
                  background: '#f1f5f9',
                  borderRight: '1.5px solid #e2e6ed',
                  borderRadius: '8px 0 0 8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 700, color: '#4a5568',
                  pointerEvents: 'none', userSelect: 'none',
                }}>
                  +91
                </div>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder=""
                  autoComplete="tel"
                  inputMode="numeric"
                  style={{
                    width: '100%', height: '48px',
                    paddingLeft: '62px', paddingRight: '14px',
                    border: '1.5px solid #e2e6ed',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600,
                    color: '#0f1e35',
                    outline: 'none',
                    background: '#f8fafc',
                    letterSpacing: '0.08em',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#1a4fa0'
                    e.target.style.boxShadow = '0 0 0 3px rgba(26,79,160,0.1)'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#e2e6ed'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>

            {/* Password field */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block', fontSize: '11px', fontWeight: 700,
                color: '#4a5568', marginBottom: '7px',
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  style={{
                    width: '100%', height: '48px',
                    padding: '0 48px 0 14px',
                    border: '1.5px solid #e2e6ed',
                    borderRadius: '10px',
                    fontSize: '14px',
                    color: '#0f1e35',
                    outline: 'none',
                    background: '#f8fafc',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#1a4fa0'
                    e.target.style.boxShadow = '0 0 0 3px rgba(26,79,160,0.1)'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#e2e6ed'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  style={{
                    position: 'absolute', right: '14px', top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: '15px',
                    color: '#8a96a8', padding: '2px', lineHeight: 1,
                  }}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: '#fef2f2', border: '1.5px solid #fecaca',
                borderRadius: '10px', padding: '12px 14px',
                fontSize: '13px', color: '#991b1b',
                marginBottom: '18px',
                display: 'flex', alignItems: 'flex-start', gap: '8px',
              }}>
                <span style={{ flexShrink: 0, marginTop: '1px' }}>⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', height: '50px',
                background: loading
                  ? '#94a3b8'
                  : 'linear-gradient(135deg, #1a4fa0 0%, #1565c0 100%)',
                color: 'white', border: 'none',
                borderRadius: '12px',
                fontSize: '15px', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '8px',
                boxShadow: loading ? 'none' : '0 6px 20px rgba(26,79,160,0.35)',
                transition: 'all 0.2s',
                letterSpacing: '0.02em',
              }}
              onMouseEnter={e => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(26,79,160,0.45)'
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = loading ? 'none' : '0 6px 20px rgba(26,79,160,0.35)'
              }}
            >
              {loading && (
                <span style={{
                  width: '18px', height: '18px',
                  border: '2.5px solid rgba(255,255,255,0.35)',
                  borderTopColor: 'white', borderRadius: '50%',
                  animation: 'loginSpin 0.7s linear infinite',
                  flexShrink: 0,
                }} />
              )}
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>

          </form>

          {/* Footer */}
          <div style={{
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '12px', color: '#8a96a8' }}>
              Having trouble signing in?
            </span>
            <span style={{
              fontSize: '12px', fontWeight: 600, color: '#1a4fa0',
              cursor: 'pointer',
            }}>
              Contact Jose
            </span>
          </div>
          {/* Copyright inside card */}
          <div style={{
            marginTop: '20px',
            textAlign: 'center',
            fontSize: '11px',
            color: '#c4cad4',
            letterSpacing: '0.02em',
          }}>
            © 2026 JDS Logistics Pvt Ltd · CBD Belapur, Navi Mumbai
          </div>
        </div>
      </div>

      <style>{`
        @keyframes loginSpin { to { transform: rotate(360deg) } }
      `}</style>

    </div>
  )
}
