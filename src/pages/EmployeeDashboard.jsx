import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  getStageName,
  priorityBadgeClass,
  priorityBorderClass,
  getGreeting,
} from '../utils/jobHelpers'

export default function EmployeeDashboard() {
  const { user, profile } = useAuth()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('jobs')
        .select('*')
        .eq('assigned_to', user.id)
        .order('updated_at', { ascending: false })
      setJobs(data ?? [])
      setLoading(false)
    }
    load()
  }, [user?.id])

  const stats = useMemo(
    () => ({
      active: jobs.filter((j) => j.stage !== 10).length,
      urgent: jobs.filter((j) => j.priority?.toLowerCase() === 'urgent' && j.stage !== 10).length,
      completed: jobs.filter((j) => j.stage === 10).length,
    }),
    [jobs]
  )

  const activeJobs = jobs.filter((j) => j.stage !== 10)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  const firstName = profile?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1e3a5f] text-white px-6 py-4 flex items-center justify-between shadow">
        <span className="font-semibold text-lg">JDS Logistics</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-blue-100">{profile?.name}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-gray-800 mb-6">
          {getGreeting()}, {firstName}
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-5 border-t-4 border-t-blue-500">
            <p className="text-sm text-gray-500">My Active Jobs</p>
            <p className="text-3xl font-bold text-gray-800">{stats.active}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-5 border-t-4 border-t-red-500">
            <p className="text-sm text-gray-500">Urgent</p>
            <p className="text-3xl font-bold text-gray-800">{stats.urgent}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-5 border-t-4 border-t-green-500">
            <p className="text-sm text-gray-500">Completed</p>
            <p className="text-3xl font-bold text-gray-800">{stats.completed}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeJobs.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            No jobs assigned to you yet. Check back later or contact your admin.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeJobs.map((job) => (
              <div
                key={job.id}
                className={`bg-white rounded-lg shadow p-4 ${priorityBorderClass(job.priority)}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold text-gray-800">{job.job_no}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityBadgeClass(job.priority)}`}
                  >
                    {job.priority || 'normal'}
                  </span>
                </div>
                <p className="text-gray-600 text-sm mb-2">{job.client}</p>
                <p className="text-sm text-gray-500">
                  Stage {job.stage}: {getStageName(job.stage)}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  ETA: {job.eta ? new Date(job.eta).toLocaleDateString('en-IN') : '—'}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
