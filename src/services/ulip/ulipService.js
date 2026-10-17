import { supabase } from '../../supabase'

/**
 * Invoke the ulip-auth Edge Function and return the ULIP JWT token.
 * Intended for debug/diagnostics only — production code should call
 * jnpt-be-status (which fetches its own token internally).
 *
 * @returns {Promise<string>} the ULIP bearer token
 * @throws on any failure
 */
export async function testUlipAuth() {
  const { data, error } = await supabase.functions.invoke('ulip-auth')
  if (error) throw new Error(error.message)
  if (!data?.success) throw new Error(data?.error || 'ULIP auth failed')
  return data.token
}

/**
 * Fetch Bill of Entry status from JNPT via the jnpt-be-status Edge Function.
 * JNPT/02 does not take a portCode — it is JNPT Nhava Sheva only.
 *
 * @param {string} beNumber - Bill of Entry number (exactly 7 alphanumeric chars)
 * @returns {Promise<object>} normalised BE status data
 * @throws on any failure
 */
export async function fetchBEStatus(beNumber) {
  const trimmed = beNumber?.trim() || ''
  if (!/^[a-zA-Z0-9]{7}$/.test(trimmed)) {
    throw new Error('BE number must be exactly 7 alphanumeric characters')
  }
  const { data, error } = await supabase.functions.invoke('jnpt-be-status', {
    body: { beNumber: trimmed },
  })
  if (error) throw new Error(error.message)
  if (!data?.success) throw new Error(data?.error || 'BE status lookup failed')
  return data.data
}

/**
 * Check whether Out Of Charge (OOC) has been granted for a BE, and return
 * the vehicle numbers registered against it (used for FASTAG truck tracking).
 *
 * @param {string} beNumber - exactly 7 alphanumeric chars
 * @returns {Promise<{ oocGranted: boolean, oocDate: string, vehicleNumbers: string[], beStatus: string }>}
 */
export async function isOOCGranted(beNumber) {
  const status = await fetchBEStatus(beNumber)
  return {
    oocGranted: !!status.oocDate,
    oocDate: status.oocDate,
    vehicleNumbers: status.vehicleNumbers,
    beStatus: status.beStatus || '',
  }
}

/**
 * Fetch toll plaza rates by toll code, name, or state.
 * Exactly one parameter must be provided.
 *
 * @param {{ tollCode?: string, tollName?: string, stateName?: string }} params
 * @returns {Promise<Array>} array of toll plaza rate objects
 */
export async function fetchTollRates({ tollCode = '', tollName = '', stateName = '' } = {}) {
  const provided = [tollCode, tollName, stateName].filter(v => v.trim().length > 0)
  if (provided.length !== 1) throw new Error('Provide exactly one of: tollCode, tollName, stateName')
  const { data, error } = await supabase.functions.invoke('toll-plaza', {
    body: { tollCode, tollName, stateName },
  })
  if (error) throw new Error(error.message)
  if (!data?.success) throw new Error(data?.error || 'Toll rate lookup failed')
  return data.data ?? []
}
