// Where an alert opens (Jose, 25 Oct 2026: every alert took him to the job's edit
// screen). The page that alert is about, with that job picked:
//   OOC / BE / customs → BE & OOC · ship arrived / due / ETA moved → Vessels ·
//   container moves → Containers · trucks → Trucks · free days → Containers ·
//   documents → Documents · the system → System health · anything else → the job's
//   side panel (not the edit screen).
// Used by the bell (portal) and the desktop alerts (wa-bot/push.ts).

const PAGE = [
  [/^(ooc|ooc_granted|customs|be_stage|be_status_check|be_not_filed|be_filed|sb_filed|air_igm)$/, 'customs'],
  [/^(ship_arrived|ship_due|ship_unloaded|eta_changed)$/, 'vessels'],
  [/^(truck|truck_stuck|truck_papers|truck_dispatched)$/, 'trucks'],
  [/^(container|container_update|free_days|detention_alert)$|container/, 'containers'],
  [/upload|document/, 'documents'],
  [/^(system|auto_check_paused)$/, 'health'],
]

// type: the alert's kind (desktop) or activity type (bell); cn: a container number
export function alertUrl(type, jobId, cn) {
  const t = String(type || '')
  const page = PAGE.find(([re]) => re.test(t))?.[1]
  const job = jobId ? `&job=${encodeURIComponent(jobId)}` : ''
  if (page === 'health') return '/admin?tab=health'
  if (page === 'containers') return `/admin?tab=containers${job}${cn ? `&cn=${encodeURIComponent(cn)}` : ''}`
  if (page) return `/admin?tab=${page}${job}`
  return jobId ? `/admin?tab=jobs&open=${encodeURIComponent(jobId)}` : '/admin?tab=today'
}
