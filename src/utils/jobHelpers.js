// src/utils/jobHelpers.js

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
  return STAGE_NAMES[Number(stage)] || 'Unknown'
}

export function isEtaThisWeek(eta) {
  if (!eta) return false
  const etaDate = new Date(eta)
  if (isNaN(etaDate.getTime())) return false
  const now = new Date()
  const weekFromNow = new Date()
  weekFromNow.setDate(now.getDate() + 7)
  now.setHours(0, 0, 0, 0)
  etaDate.setHours(0, 0, 0, 0)
  return etaDate >= now && etaDate <= weekFromNow
}

export function priorityBadgeClass(priority) {
  const p = String(priority || 'normal').toLowerCase()
  if (p === 'urgent') return 'bg-red-100 text-red-800'
  if (p === 'high') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-700'
}
