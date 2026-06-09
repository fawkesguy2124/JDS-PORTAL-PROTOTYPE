import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { getStageName, isEtaThisWeek } from '../utils/jobHelpers'
import JobDetailView from './JobDetailView'
import ControlTowerMobile from './mobile/ControlTowerMobile'
import ControlTowerDesktop from './desktop/ControlTowerDesktop'

function ControlTowerSection({ jobs, profiles, currentUserName, selectedJob, onOpenJob, onStageFilter, showToast }) {
  const isAdmin = false
  const canUpdateStage = true

  const handleDeleteJob = async () => {}
  const refreshJobs = () => {}

  const stats = useMemo(() => ({
    active: jobs?.length || 0,
    urgent: jobs?.filter(j => String(j.priority || '').toLowerCase() === 'urgent').length || 0,
    etasWeek: jobs?.filter(j => isEtaThisWeek(j.eta)).length || 0,
    freeDaysAtRisk: jobs?.filter(j => j.free_days != null && Number(j.free_days) <= 2).length || 0,
    paymentsPending: jobs?.filter(j => [6, 8].includes(Number(j.stage))).length || 0,
    stale: jobs?.filter(j => {
      if (!j.updated_at) return false
      const hours = Math.floor(Math.max(0, Date.now() - new Date(j.updated_at).getTime()) / (1000 * 60 * 60))
      return String(j.priority || '').toLowerCase() === 'urgent' ? hours >= 12 : hours >= 24
    }).length || 0,
  }), [jobs])

  const [activityLog, setActivityLog] = useState([])

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('*')
        .not('type', 'in', '("container_update","detention_alert")')
        .order('created_at', { ascending: false })
        .limit(20)
      setActivityLog(data || [])
    }
    load()

    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      {selectedJob ? (
        <JobDetailView
          job={selectedJob} profiles={profiles} currentUserName={currentUserName}
          isAdmin={isAdmin} canUpdateStage={canUpdateStage}
          onBack={() => onOpenJob(null)} onSaved={refreshJobs} toast={showToast}
          onDelete={() => handleDeleteJob(selectedJob)}
        />
      ) : (
        <>
          <div className="block md:hidden">
            <ControlTowerMobile jobs={jobs} profiles={profiles} onOpenJob={onOpenJob} activityLog={activityLog} />
          </div>
          <div className="hidden md:block">
            <ControlTowerDesktop
              jobs={jobs}
              profiles={profiles}
              currentUserName={currentUserName}
              onOpenJob={onOpenJob}
              onStageFilter={onStageFilter}
              showToast={showToast}
              activityLog={activityLog}
            />
          </div>
        </>
      )}
    </>
  )
}

export default ControlTowerSection
