import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { getStageName, priorityBadgeClass, isEtaThisWeek } from '../utils/jobHelpers'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'jobs', label: 'All Jobs', icon: '📋' },
  { id: 'containers', label: 'Container Tracking', icon: '📦' },
  { id: 'documents', label: 'Documents', icon: '📄' },
  { id: 'payments', label: 'Payments', icon: '💰' },
  { id: 'compliance', label: 'Compliance', icon: '✅' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

function StatCard({ title, value, borderColor }) {
  return (
    <div className={`bg-white rounded-lg shadow border-t-4 ${borderColor} p-5`}>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
    </div>
  )
}

export default function AdminDashboard() {
  const { profile } = useAuth()
  const [activeNav, setActiveNav] = useState('overview')
  const [jobs, setJobs] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loadingJobs, setLoadingJobs] = useState(true)

  useEffect(() => {
    async function load() {
      setLoadingJobs(true)
      const [{ data: jobsData }, { data: profilesData }] = await Promise.all([
        supabase.from('jobs').select('*').order('updated_at', { ascending: false }),
        supabase.from('profiles').select('id, name'),
      ])
      setJobs(jobsData ?? [])
      const map = {}
      ;(profilesData ?? []).forEach((p) => { map[p.id] = p.name })
      setProfiles(map)
      setLoadingJobs(false)
    }
    load()
  }, [])

  const stats = useMemo(() => {
    const active = jobs.filter((j) => j.stage !== 10)
    const urgent = jobs.filter((j) => j.priority?.toLowerCase() === 'urgent' && j.stage !== 10)
    const etasWeek = jobs.filter((j) => isEtaThisWeek(j.eta) && j.stage !== 10)
    const paymentsPending = jobs.filter((j) => j.stage === 6)
    return {
      active: active.length,
      urgent: urgent.length,
      etasWeek: etasWeek.length,
      paymentsPending: paymentsPending.length,
    }
  }, [jobs])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  const pageTitle = NAV_ITEMS.find((n) => n.id === activeNav)?.label ?? 'Overview'

  return (
    <div className="min-h-screen flex bg-gray-100">
      <aside className="w-[220px] bg-[#1e3a5f] text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-white/10">
          <p className="font-semibold">JDS Logistics</p>
          <p className="text-xs text-blue-200">Admin Portal</p>
        </div>
        <nav className="flex-1 py-3">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                activeNav === item.id
                  ? 'bg-white/15 border-l-4 border-amber-400 text-white'
                  : 'text-blue-100 hover:bg-white/10 border-l-4 border-transparent'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800">{pageTitle}</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{profile?.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          {activeNav === 'overview' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard title="Total Active Jobs" value={stats.active} borderColor="border-t-red-500" />
                <StatCard title="Urgent Jobs" value={stats.urgent} borderColor="border-t-amber-500" />
                <StatCard title="ETAs This Week" value={stats.etasWeek} borderColor="border-t-blue-500" />
                <StatCard title="Payments Pending" value={stats.paymentsPending} borderColor="border-t-green-500" />
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h2 className="font-medium text-gray-800">All Jobs</h2>
                </div>
                {loadingJobs ? (
                  <div className="p-8 flex justify-center">
                    <div className="h-8 w-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium">Job No</th>
                          <th className="text-left px-4 py-3 font-medium">Client</th>
                          <th className="text-left px-4 py-3 font-medium">Mode</th>
                          <th className="text-left px-4 py-3 font-medium">Stage</th>
                          <th className="text-left px-4 py-3 font-medium">Priority</th>
                          <th className="text-left px-4 py-3 font-medium">ETA</th>
                          <th className="text-left px-4 py-3 font-medium">Assigned To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.map((job) => (
                          <tr
                            key={job.id}
                            className="border-t border-gray-100 hover:bg-blue-50 cursor-pointer"
                          >
                            <td className="px-4 py-3 font-medium text-gray-800">{job.job_no}</td>
                            <td className="px-4 py-3">{job.client}</td>
                            <td className="px-4 py-3">{job.mode}</td>
                            <td className="px-4 py-3">
                              <span className="text-gray-500">{job.stage}</span>
                              <span className="text-gray-400 mx-1">·</span>
                              {getStageName(job.stage)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityBadgeClass(job.priority)}`}
                              >
                                {job.priority || 'normal'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {job.eta ? new Date(job.eta).toLocaleDateString('en-IN') : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {job.assigned_to ? profiles[job.assigned_to] ?? '—' : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {jobs.length === 0 && (
                      <p className="text-center text-gray-500 py-8">No jobs found.</p>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              {pageTitle} — coming soon
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
