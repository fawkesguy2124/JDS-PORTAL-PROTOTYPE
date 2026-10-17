import { supabase } from '../../supabase'

// Runs one ULIP check through the "ulip" Edge Function.
// Returns { ok, data, cached, error } and never throws.
export async function runUlipCheck({ api, params, jobId }) {
  const { data, error } = await supabase.functions.invoke('ulip', { body: { api, params, jobId: jobId || null } })
  if (!error && data?.success) return { ok: true, data: data.data, cached: !!data.cached }
  let message = data?.error
  if (!message && error?.context?.json) {
    try { message = (await error.context.json())?.error } catch { /* ignore */ }
  }
  return { ok: false, data: data?.data ?? null, error: message || error?.message || 'The check failed. Please try again.' }
}

// Latest saved answer per API for one job: { 'ICEGATE/03': row, ... }
export async function loadJobResults(jobId) {
  if (!jobId) return {}
  const { data, error } = await supabase
    .from('ulip_results')
    .select('*')
    .eq('job_id', jobId)
    .order('checked_at', { ascending: false, nullsFirst: false })
  if (error) {
    console.warn('[ulip] could not load saved results:', error.message)
    return {}
  }
  const byApi = {}
  for (const row of data || []) if (!byApi[row.api]) byApi[row.api] = row
  return byApi
}

// "2026-10-17" -> "17102026" (ULIP's DDMMYYYY), and back
export function isoToDate8(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}${m[2]}${m[1]}` : ''
}
export function date8ToIso(d8) {
  const m = String(d8 || '').match(/^(\d{2})(\d{2})(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}
