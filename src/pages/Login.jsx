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
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>

        <svg
          width="100%" height="100%" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice"
          style={{ position: 'absolute', inset: 0, display: 'block' }}
        >
          <rect x="0" y="0" width="1000" height="350" fill="#aed7e8" />
          <rect x="0" y="350" width="1000" height="210" fill="#1f5a7a" />

          <circle cx="850" cy="80" r="220" fill="#ffffff" opacity="0.25" />
          <circle cx="180" cy="60" r="180" fill="#ffffff" opacity="0.2" />

          {/* Quay/dock platform */}
          <g>
            <rect x="0" y="300" width="1000" height="50" fill="#9aa6ad" />
            <rect x="0" y="296" width="1000" height="6" fill="#7d8a96" />
          </g>

          {/* Terminal building */}
          <g>
            <rect x="40" y="250" width="170" height="50" fill="#8a97a3" />
            <rect x="40" y="244" width="170" height="8" fill="#6d7a86" />
            <rect x="55" y="260" width="22" height="30" fill="#6d7a86" />
            <rect x="90" y="260" width="22" height="30" fill="#6d7a86" />
            <rect x="125" y="260" width="22" height="30" fill="#6d7a86" />
            <rect x="160" y="260" width="22" height="30" fill="#6d7a86" />
          </g>

          {/* Container yard 1 */}
          <g>
            <rect x="240" y="265" width="36" height="35" fill="#7a93a6" />
            <rect x="285" y="265" width="36" height="35" fill="#7a93a6" />
            <rect x="330" y="265" width="36" height="35" fill="#7a93a6" />
            <rect x="240" y="225" width="36" height="35" fill="#0c447c" />
            <rect x="285" y="225" width="36" height="35" fill="#d85a30" />
            <rect x="330" y="225" width="36" height="35" fill="#1d9e75" />
            <rect x="240" y="185" width="36" height="35" fill="#0c447c" />
            <rect x="285" y="185" width="36" height="35" fill="#993556" />
          </g>

          {/* Container yard 2 — moved to avoid crane 2 legs */}
          <g>
            <rect x="540" y="265" width="36" height="35" fill="#7a93a6" />
            <rect x="585" y="265" width="36" height="35" fill="#7a93a6" />
            <rect x="630" y="265" width="36" height="35" fill="#7a93a6" />
            <rect x="540" y="225" width="36" height="35" fill="#fac775" />
            <rect x="585" y="225" width="36" height="35" fill="#185fa5" />
            <rect x="540" y="185" width="36" height="35" fill="#0f6e56" />
          </g>

          {/* Gantry crane 1 — left, with animated trolley/hoist */}
          <g>
            <rect x="40" y="60" width="8" height="240" fill="#3d4750" />
            <rect x="-30" y="50" width="160" height="14" fill="#3d4750" />
            <rect x="130" y="50" width="8" height="250" fill="#3d4750" />
            <path d="M-30 64 L-30 50 L-100 110 L-86 110 Z" fill="#3d4750" />
            <rect x="-100" y="100" width="16" height="14" fill="#3d4750" />
            <rect x="80" y="64" width="6" height="190" fill="#3d4750" opacity="0.6" />
            <rect x="20" y="64" width="6" height="190" fill="#3d4750" opacity="0.6" />
            <rect x="-30" y="50" width="14" height="-150" fill="#3d4750" />
            <rect x="-44" y="-100" width="28" height="14" fill="#3d4750" />
            <rect x="-30" y="-100" width="6" height="50" fill="#3d4750" />
            <rect x="-50" y="-100" width="40" height="8" fill="#993c1d" />

            {/* Trolley + hoist — anchored to boom rail y=50, traveling x=-20 to x=110 along the rail */}
            <g transform="translate(0,50)">
              <g className="anim-crane1-trolley">
                <rect x="-8" y="-4" width="16" height="8" fill="#fac775" />
                <line x1="0" y1="4" x2="0" y2="44" stroke="#5f5e5a" stroke-width="1.5">
                  <animate attributeName="y2"
                    values="44; 44; 189; 189; 44; 44"
                    keyTimes="0; 0.15; 0.3; 0.5; 0.65; 1"
                    dur="12s" repeatCount="indefinite" />
                </line>
                <rect x="-14" y="44" width="28" height="18" rx="1" fill="#185fa5">
                  <animate attributeName="y"
                    values="44; 44; 189; 189; 44; 44"
                    keyTimes="0; 0.15; 0.3; 0.5; 0.65; 1"
                    dur="12s" repeatCount="indefinite" />
                </rect>
              </g>
            </g>
          </g>

          {/* Container yard 3 — extension behind crane 2 */}
          <g>
            <rect x="850" y="265" width="36" height="35" fill="#7a93a6" />
            <rect x="895" y="265" width="36" height="35" fill="#7a93a6" />
            <rect x="940" y="265" width="36" height="35" fill="#7a93a6" />
            <rect x="850" y="225" width="36" height="35" fill="#185fa5" />
            <rect x="895" y="225" width="36" height="35" fill="#d85a30" />
            <rect x="940" y="225" width="36" height="35" fill="#0f6e56" />
            <rect x="850" y="185" width="36" height="35" fill="#1d9e75" />
            <rect x="895" y="185" width="36" height="35" fill="#fac775" />
          </g>

          {/* Gantry crane 2 — right, with animated trolley/hoist, offset timing */}
          <g>
            <rect x="700" y="40" width="8" height="260" fill="#3d4750" />
            <rect x="600" y="28" width="190" height="14" fill="#3d4750" />
            <rect x="800" y="28" width="8" height="270" fill="#3d4750" />
            <path d="M600 42 L600 28 L520 100 L536 100 Z" fill="#3d4750" />
            <rect x="520" y="90" width="16" height="14" fill="#3d4750" />
            <rect x="760" y="42" width="6" height="210" fill="#3d4750" opacity="0.6" />
            <rect x="680" y="42" width="6" height="210" fill="#3d4750" opacity="0.6" />
            <rect x="600" y="28" width="14" height="-170" fill="#3d4750" />
            <rect x="586" y="-148" width="28" height="14" fill="#3d4750" />
            <rect x="600" y="-148" width="6" height="60" fill="#3d4750" />
            <rect x="570" y="-148" width="40" height="8" fill="#fac775" />

            {/* Trolley + hoist — anchored to boom rail y=28, traveling x=540 to x=770 */}
            <g>
              <g className="anim-crane2-trolley">
                <rect x="-8" y="-4" width="16" height="8" fill="#fac775" />
                <line x1="0" y1="4" x2="0" y2="44" stroke="#5f5e5a" stroke-width="1.5">
                  <animate attributeName="y2"
                    values="44; 44; 244; 244; 44; 44"
                    keyTimes="0; 0.15; 0.3; 0.5; 0.65; 1"
                    dur="14s" begin="-7s" repeatCount="indefinite" />
                </line>
                <rect x="-14" y="44" width="28" height="18" rx="1" fill="#d85a30">
                  <animate attributeName="y"
                    values="44; 44; 244; 244; 44; 44"
                    keyTimes="0; 0.15; 0.3; 0.5; 0.65; 1"
                    dur="14s" begin="-7s" repeatCount="indefinite" />
                </rect>
              </g>
            </g>
          </g>

          {/* Lighting towers */}
          <g opacity="0.7">
            <rect x="395" y="180" width="4" height="130" fill="#3d4750" />
            <rect x="385" y="172" width="24" height="10" fill="#3d4750" />
            <circle cx="389" cy="172" r="3" fill="#fac775" />
            <circle cx="397" cy="172" r="3" fill="#fac775" />
            <circle cx="405" cy="172" r="3" fill="#fac775" />
            <rect x="455" y="180" width="4" height="130" fill="#3d4750" />
            <rect x="445" y="172" width="24" height="10" fill="#3d4750" />
            <circle cx="449" cy="172" r="3" fill="#fac775" />
            <circle cx="457" cy="172" r="3" fill="#fac775" />
            <circle cx="465" cy="172" r="3" fill="#fac775" />
          </g>

          {/* Water shimmer base */}
          <g>
            <rect className="anim-dockline1" x="0" y="330" width="1000" height="8" fill="#2c4a60" opacity="0.5" />
            <rect className="anim-dockline2" x="-200" y="343" width="1000" height="5" fill="#2c4a60" opacity="0.35" />
          </g>

          {/* Container ship — 0-25% */}
          <g className="anim-ship-container">

            {/* Hull — black dominant, thin maroon strip at bottom */}
            <path d="M0 160 L0 130 Q0 110 18 105 L66 96 L450 96 Q478 96 480 122 L480 150 Q480 160 470 160 Z" fill="#0c0c0c" />
            <path d="M0 150 L0 130 Q0 145 18 148 L470 148 Q480 150 480 155 Q480 162 470 162 L10 162 Q0 162 0 152 Z" fill="#791f1f" />

            {/* Rudder/propeller fin near stern */}
            <path d="M5 160 L5 145 L-8 158 Z" fill="#0c0c0c" />

            {/* Bridge tower — bow/left side */}
            <g transform="translate(20,38)">
              <rect x="0" y="0" width="90" height="62" fill="#f1f1ef" />
              <rect x="0" y="-12" width="90" height="12" fill="#dcdcd8" />
              <path d="M0 -12 L-14 0 L0 0 Z" fill="#dcdcd8" />
              <rect x="10" y="10" width="14" height="14" fill="#7d8a96" />
              <rect x="30" y="10" width="14" height="14" fill="#7d8a96" />
              <rect x="50" y="10" width="14" height="14" fill="#7d8a96" />
              <rect x="70" y="10" width="14" height="14" fill="#7d8a96" />
              <rect x="10" y="32" width="14" height="14" fill="#7d8a96" />
              <rect x="30" y="32" width="14" height="14" fill="#7d8a96" />
              <rect x="50" y="32" width="14" height="14" fill="#7d8a96" />
              <rect x="70" y="32" width="14" height="14" fill="#7d8a96" />
              <rect x="42" y="-28" width="4" height="20" fill="#7d8a96" />
              <circle cx="44" cy="-32" r="3" fill="#e24b4a" />
            </g>

            {/* Containers — 2 rows, blue/orange/cream/maroon repeating */}
            <g transform="translate(130,76)">
              <g transform="translate(0,0)">
                <rect x="0" y="0" width="34" height="22" fill="#185fa5" rx="1" />
                <rect x="36" y="0" width="34" height="22" fill="#d85a30" rx="1" />
                <rect x="72" y="0" width="34" height="22" fill="#dcdcd8" rx="1" />
                <rect x="108" y="0" width="34" height="22" fill="#791f1f" rx="1" />
                <rect x="144" y="0" width="34" height="22" fill="#185fa5" rx="1" />
                <rect x="180" y="0" width="34" height="22" fill="#d85a30" rx="1" />
                <rect x="216" y="0" width="34" height="22" fill="#dcdcd8" rx="1" />
                <rect x="252" y="0" width="34" height="22" fill="#791f1f" rx="1" />
                <rect x="288" y="0" width="34" height="22" fill="#185fa5" rx="1" />
              </g>
              <g transform="translate(0,-22)">
                <rect x="0" y="0" width="34" height="22" fill="#d85a30" rx="1" />
                <rect x="36" y="0" width="34" height="22" fill="#dcdcd8" rx="1" />
                <rect x="72" y="0" width="34" height="22" fill="#791f1f" rx="1" />
                <rect x="108" y="0" width="34" height="22" fill="#185fa5" rx="1" />
                <rect x="144" y="0" width="34" height="22" fill="#d85a30" rx="1" />
                <rect x="180" y="0" width="34" height="22" fill="#dcdcd8" rx="1" />
                <rect x="216" y="0" width="34" height="22" fill="#791f1f" rx="1" />
                <rect x="252" y="0" width="34" height="22" fill="#185fa5" rx="1" />
                <rect x="288" y="0" width="34" height="22" fill="#d85a30" rx="1" />
              </g>
            </g>
          </g>

          {/* Crude oil tanker — 25-50% */}
          <g className="anim-ship-tanker">

            {/* Hull — black dominant, thin maroon strip at bottom */}
            <path d="M0 95 L0 70 Q0 58 16 56 L55 50 L390 50 Q418 50 420 70 L420 90 Q420 95 414 95 Z" fill="#0c0c0c" />
            <path d="M0 89 L0 70 Q0 80 16 82 L414 82 Q420 84 420 88 Q420 94 414 94 L8 94 Q0 94 0 90 Z" fill="#791f1f" />

            {/* Bridge with red stripe + funnel */}
            <g transform="translate(15,6)">
              <rect x="0" y="0" width="58" height="42" fill="#f1f1ef" />
              <rect x="0" y="-6" width="58" height="6" fill="#a32d2d" />
              <rect x="0" y="-18" width="58" height="12" fill="#dcdcd8" />
              <rect x="8" y="8" width="12" height="12" fill="#7d8a96" />
              <rect x="24" y="8" width="12" height="12" fill="#7d8a96" />
              <rect x="40" y="8" width="12" height="12" fill="#7d8a96" />
              <rect x="8" y="24" width="12" height="12" fill="#7d8a96" />
              <rect x="24" y="24" width="12" height="12" fill="#7d8a96" />
              <rect x="40" y="24" width="12" height="12" fill="#7d8a96" />
              <rect x="46" y="-32" width="8" height="14" fill="#2c2c2a" />
            </g>

            {/* Deck crane structure mid-deck */}
            <g transform="translate(200,16)">
              <rect x="0" y="0" width="4" height="32" fill="#5f6b75" />
              <path d="M4 0 L60 0 L4 24 Z" fill="none" stroke="#5f6b75" stroke-width="3" />
            </g>

            {/* Stern mast */}
            <rect x="395" y="10" width="3" height="38" fill="#5f6b75" />

            {/* Deck fixtures — light blue/white repeating */}
            <g transform="translate(85,40)">
              <rect x="0" y="0" width="290" height="6" fill="#e6f1fb" />
              <rect x="0" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="20" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="40" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="60" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="80" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="100" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="120" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="140" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="160" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="180" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="200" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="220" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="240" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="260" y="-4" width="8" height="4" fill="#b5d4f4" />
              <rect x="280" y="-4" width="8" height="4" fill="#b5d4f4" />
            </g>
          </g>

          {/* Bulk carrier — 50-75% */}
          <g className="anim-ship-bulk">

            {/* Hull — light gray dominant, thin navy strip at bottom */}
            <path d="M0 105 L0 76 Q0 64 18 60 L60 52 L410 52 Q438 52 440 76 L440 100 Q440 105 432 105 Z" fill="#b4b2a9" />
            <rect x="0" y="98" width="440" height="9" fill="#0c2d4a" />

            {/* Bridge tower — larger, bow/left, matching bulk carrier reference */}
            <g transform="translate(10,-18)">
              <rect x="0" y="0" width="85" height="78" fill="#f1f1ef" />
              <rect x="0" y="-12" width="85" height="12" fill="#dcdcd8" />
              <path d="M0 -12 L-14 0 L0 0 Z" fill="#dcdcd8" />

              <rect x="8" y="10" width="14" height="14" fill="#7d8a96" />
              <rect x="28" y="10" width="14" height="14" fill="#7d8a96" />
              <rect x="48" y="10" width="14" height="14" fill="#7d8a96" />
              <rect x="68" y="10" width="14" height="14" fill="#7d8a96" />

              <rect x="8" y="32" width="14" height="14" fill="#7d8a96" />
              <rect x="28" y="32" width="14" height="14" fill="#7d8a96" />
              <rect x="48" y="32" width="14" height="14" fill="#7d8a96" />
              <rect x="68" y="32" width="14" height="14" fill="#7d8a96" />

              <rect x="8" y="54" width="14" height="14" fill="#7d8a96" />
              <rect x="28" y="54" width="14" height="14" fill="#7d8a96" />
              <rect x="48" y="54" width="14" height="14" fill="#7d8a96" />
              <rect x="68" y="54" width="14" height="14" fill="#7d8a96" />
            </g>

            <path d="M105 60 Q135 30 165 60 L165 60 Z" fill="#fac775" />
            <path d="M185 60 Q215 30 245 60 L245 60 Z" fill="#fac775" />
            <path d="M265 60 Q295 30 325 60 L325 60 Z" fill="#fac775" />
            <path d="M345 60 Q375 30 405 60 L405 60 Z" fill="#fac775" />
          </g>

          {/* General cargo ship — 75-100% */}
          <g className="anim-ship-general">

            {/* Hull with bulbous bow at front (left) and rounded stern (right) */}
            <path d="M-8 88 Q-14 80 -6 75 L0 60 L50 50 L360 50 Q380 50 380 70 L380 85 Q380 92 370 92 L0 92 Z" fill="#5dcaa5" />
            <rect x="0" y="84" width="375" height="10" fill="#9aa6ad" />

            {/* Bridge with funnel */}
            <g transform="translate(12,4)">
              <rect x="0" y="0" width="55" height="46" fill="#f1f1ef" />
              <rect x="0" y="-7" width="55" height="7" fill="#dcdcd8" />
              <rect x="8" y="8" width="10" height="10" fill="#7d8a96" />
              <rect x="22" y="8" width="10" height="10" fill="#7d8a96" />
              <rect x="36" y="8" width="10" height="10" fill="#7d8a96" />
              <rect x="8" y="24" width="10" height="10" fill="#7d8a96" />
              <rect x="22" y="24" width="10" height="10" fill="#7d8a96" />
              <rect x="36" y="24" width="10" height="10" fill="#7d8a96" />
              <rect x="44" y="-22" width="9" height="16" fill="#2c2c2a" />
            </g>

            {/* Two tall portal-frame gantry cranes */}
            <g transform="translate(120,8)">
              <rect x="0" y="0" width="5" height="42" fill="#fac775" />
              <rect x="50" y="0" width="5" height="42" fill="#fac775" />
              <rect x="-3" y="0" width="61" height="6" fill="#fac775" />
            </g>
            <g transform="translate(220,8)">
              <rect x="0" y="0" width="5" height="42" fill="#fac775" />
              <rect x="50" y="0" width="5" height="42" fill="#fac775" />
              <rect x="-3" y="0" width="61" height="6" fill="#fac775" />
            </g>
          </g>

          {/* Water shimmer */}
          <g opacity="0.85">
            <ellipse className="anim-shimmer1" cx="120" cy="400" rx="60" ry="6" fill="#ffffff" opacity="0.15" />
            <ellipse className="anim-shimmer2" cx="520" cy="450" rx="80" ry="5" fill="#ffffff" opacity="0.12" />
            <ellipse className="anim-shimmer3" cx="800" cy="500" rx="70" ry="6" fill="#ffffff" opacity="0.1" />
          </g>
        </svg>

        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,30,53,0.12)' }} />

        <div style={{
          position: 'relative',
          width: '100%', maxWidth: '380px',
          background: 'white',
          borderRadius: '20px',
          padding: '36px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
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
          .anim-dockline1 { animation: dockline1-move 6s linear infinite; }
          @keyframes dockline1-move { from { transform: translateX(-1000px); } to { transform: translateX(0px); } }
          .anim-dockline2 { animation: dockline2-move 9s linear infinite; }
          @keyframes dockline2-move { from { transform: translateX(-1200px); } to { transform: translateX(-200px); } }
          .anim-crane1-trolley { animation: crane1-trolley-move 12s linear infinite; }
          @keyframes crane1-trolley-move { 0%, 80%, 100% { transform: translateX(-20px); } 30%, 50% { transform: translateX(90px); } }
          .anim-crane2-trolley { animation: crane2-trolley-move 14s linear infinite; animation-delay: -7s; }
          @keyframes crane2-trolley-move { 0%, 80%, 100% { transform: translate(770px, 28px); } 30%, 50% { transform: translate(540px, 28px); } }
          .anim-ship-container { animation: ship-container-move 80s linear infinite; }
          @keyframes ship-container-move { 0% { transform: translate(-480px, 200px); } 25% { transform: translate(1100px, 200px); } 100% { transform: translate(1100px, 200px); } }
          .anim-ship-tanker { animation: ship-tanker-move 80s linear infinite; }
          @keyframes ship-tanker-move { 0%, 25% { transform: translate(-1100px, 255px); } 27% { transform: translate(-420px, 255px); } 50%, 100% { transform: translate(1100px, 255px); } }
          .anim-ship-bulk { animation: ship-bulk-move 80s linear infinite; }
          @keyframes ship-bulk-move { 0%, 50% { transform: translate(-1100px, 245px); } 52% { transform: translate(-440px, 245px); } 75%, 100% { transform: translate(1100px, 245px); } }
          .anim-ship-general { animation: ship-general-move 80s linear infinite; }
          @keyframes ship-general-move { 0%, 75% { transform: translate(-1100px, 260px); } 77% { transform: translate(-380px, 260px); } 100% { transform: translate(1100px, 260px); } }
          .anim-shimmer1 { animation: shimmer1-move 14s linear infinite; }
          @keyframes shimmer1-move { 0%, 100% { transform: translateX(0px); } 50% { transform: translateX(800px); } }
          .anim-shimmer2 { animation: shimmer2-move 18s linear infinite; }
          @keyframes shimmer2-move { 0%, 100% { transform: translateX(0px); } 50% { transform: translateX(-620px); } }
          .anim-shimmer3 { animation: shimmer3-move 22s linear infinite; }
          @keyframes shimmer3-move { 0%, 100% { transform: translateX(0px); } 50% { transform: translateX(-700px); } }
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
