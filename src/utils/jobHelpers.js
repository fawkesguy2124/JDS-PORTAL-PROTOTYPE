export const STAGE_NAMES = {
  0: 'Job Created',
  1: 'Docs Received',
  2: 'Verification',
  3: 'BE Filing',
  4: 'Customs Review',
  5: 'Assessment',
  6: 'Duty Payment',
  7: 'OOC',
  8: 'CFS Coordination',
  9: 'Vehicle Out',
  10: 'Delivered',
}

export function getStageName(stage) {
  return STAGE_NAMES[stage] ?? `Stage ${stage}`
}

export function priorityBadgeClass(priority) {
  switch (priority?.toLowerCase()) {
    case 'urgent':
      return 'bg-red-100 text-red-800'
    case 'high':
      return 'bg-amber-100 text-amber-800'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

export function priorityBorderClass(priority) {
  switch (priority?.toLowerCase()) {
    case 'urgent':
      return 'border-l-4 border-l-red-500'
    case 'high':
      return 'border-l-4 border-l-amber-500'
    default:
      return 'border-l-4 border-l-blue-500'
  }
}

export function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function isEtaThisWeek(eta) {
  if (!eta) return false
  const d = new Date(eta)
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return d >= start && d <= end
}
