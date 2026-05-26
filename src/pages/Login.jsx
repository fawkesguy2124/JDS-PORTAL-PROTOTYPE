import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        setError(signInError.message || 'Invalid email or password')
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
        setError('Profile not found. Contact your administrator.')
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

      setError('Invalid role assigned to your account.')
      await supabase.auth.signOut()
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-[#1e3a5f] text-white px-6 py-4 shadow-md">
        <h1 className="text-xl font-semibold">JDS Logistics</h1>
        <p className="text-sm text-blue-200 mt-0.5">Internal Operations Portal</p>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6 text-center">
            Sign in
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                placeholder="you@jdslogistics.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1e3a5f] text-white py-2.5 rounded-md font-medium hover:bg-[#16304f] disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {loading && (
                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {loading ? 'Signing in...' : 'Login'}
            </button>
            {error && (
              <p className="text-red-600 text-sm text-center">{error}</p>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
