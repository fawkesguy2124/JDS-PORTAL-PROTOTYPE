// The last jobs this person opened, newest first (this browser only), so the
// search box can offer them before anything is typed (Jose, 23 Oct 2026).
const KEY = 'ix_recent_jobs'
const MAX = 6

export function recentJobIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}

export function rememberJob(id) {
  if (!id) return
  try {
    const ids = [String(id), ...recentJobIds().filter((x) => x !== String(id))].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch { /* private mode: nothing remembered */ }
}
