import { supabase } from '../../supabase'

const LDB_PROXY_URL = '/api/ldb-track'
const FRESHNESS_DAYS = 30
const CACHE_HOURS = 6

function log(containerNo, message, extra = {}) {
  const ts = new Date().toISOString()
  console.log(`[LDB] [${ts}] [${containerNo}] ${message}`, extra)
}

function daysDiff(dateStr) {
  if (!dateStr) return Infinity
  const d = new Date(dateStr)
  if (isNaN(d)) return Infinity
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
}

function isCacheStale(lastRefreshedAt) {
  if (!lastRefreshedAt) return true
  const hours = (Date.now() - new Date(lastRefreshedAt).getTime()) / (1000 * 60 * 60)
  return hours >= CACHE_HOURS
}

function mapEventToStatus(eventName) {
  if (!eventName) return 'in_transit'
  const e = eventName.toUpperCase()
  if (e.includes('GATE OUT') || e.includes('GATEOUT'))             return 'delivered'
  if (e.includes('CFS') || e.includes('DPD') || e.includes('ICD')) return 'at_cfs'
  if (e.includes('PORT OUT') || e.includes('PORTOUT'))              return 'at_cfs'
  if (e.includes('VESSEL ARRIVED') || e.includes('DISCHARGE') || e.includes('PORT IN') || e.includes('PORTIN')) return 'arrived'
  if (e.includes('EMPTY'))                                          return 'empty_returned'
  if (e.includes('CUSTOMS') || e.includes('HOLD'))                  return 'customs_hold'
  if (e.includes('RAIL'))                                           return 'on_rail'
  return 'in_transit'
}

function derivePortEvents(trackLog) {
  if (!Array.isArray(trackLog)) return {}
  const portInEvent  = trackLog.find(e => (e.eventName || '').toUpperCase().includes('PORT IN'))
  const portOutEvent = trackLog.find(e => (e.eventName || '').toUpperCase().includes('PORT OUT'))
  const cfsEvent     = trackLog.find(e => {
    const n = (e.eventName || '').toUpperCase()
    return n.includes('CFS') || n.includes('DPD') || n.includes('ICD')
  })
  return {
    portIn:    portInEvent  ? portInEvent.timestampTimezone  : null,
    portOut:   portOutEvent ? portOutEvent.timestampTimezone : null,
    cfsGateIn: cfsEvent     ? cfsEvent.timestampTimezone     : null,
  }
}

function buildMilestones(trackLog) {
  if (!Array.isArray(trackLog)) return []
  return [...trackLog]
    .sort((a, b) => {
      const ta = a.timestampTimezone ? new Date(a.timestampTimezone).getTime() : 0
      const tb = b.timestampTimezone ? new Date(b.timestampTimezone).getTime() : 0
      return tb - ta
    })
    .map(e => ({
      description:   e.eventName      || 'Unknown Event',
      location:      e.currentLocation || '',
      date:          e.timestampTimezone || null,
      transportMode: e.transportmode   || '',
    }))
}

function normaliseLDBResponse(containerNo, raw) {
  if (!raw || raw.result === 'No Record Found' || !raw.object) {
    log(containerNo, 'No record found in LDB response')
    return { ok: false, status: 'NO_TRACKING_FOUND' }
  }
  const obj = raw.object
  if (!obj.lastEvent || !obj.cntrDetail) {
    log(containerNo, 'Invalid response: missing lastEvent or cntrDetail', { obj })
    return { ok: false, status: 'INVALID_TRACKING_RESPONSE' }
  }
  const lastEventTs = obj.lastEvent.timestampTimezone
  const age = daysDiff(lastEventTs)
  log(containerNo, `Last event timestamp: ${lastEventTs} (${age.toFixed(1)} days ago)`)
  if (age > FRESHNESS_DAYS) {
    log(containerNo, `OUTDATED: last event is ${age.toFixed(1)} days old, exceeds ${FRESHNESS_DAYS}-day threshold`)
    return { ok: false, status: 'OUTDATED_TRACKING' }
  }
  const vesselInfo = obj.vesselStatusImportArv || {}
  const vessel     = vesselInfo.vesselname || null
  const eta        = vesselInfo.timetimestamp || null
  const eventName  = obj.lastEvent.eventName || ''
  const status     = mapEventToStatus(eventName)
  const portEvents = derivePortEvents(obj.trackLog)
  const milestones = buildMilestones(obj.trackLog)
  return {
    ok: true,
    data: {
      status,
      statusText:      eventName,
      currentLocation: obj.lastEvent.currentLocation || null,
      vessel,
      eta:             eta ? eta.slice(0, 10) : null,
      freeDays:        null,
      lastUpdate:      new Date().toISOString(),
      milestones,
      portIn:          portEvents.portIn,
      portOut:         portEvents.portOut,
      cfsGateIn:       portEvents.cfsGateIn,
      ldbContainerNo:  obj.cntrDetail.cntrNumber  || containerNo,
      ldbSize:         obj.cntrDetail.size        || null,
      ldbType:         obj.cntrDetail.containerType || null,
      ldbIsoCode:      obj.cntrDetail.isoCode     || null,
    },
  }
}

export async function fetchLDBTracking(containerNo) {
  const cn = (containerNo || '').trim().toUpperCase()
  if (!cn) return { ok: false, status: 'INVALID_TRACKING_RESPONSE' }
  const requestedAt = new Date().toISOString()
  log(cn, `Requesting LDB tracking. Proxy: ${LDB_PROXY_URL}`)
  let raw
  try {
    const res = await fetch(`${LDB_PROXY_URL}?cntrNo=${encodeURIComponent(cn)}`)
    const respondedAt = new Date().toISOString()
    log(cn, `LDB response received`, { httpStatus: res.status, respondedAt })
    if (!res.ok) {
      log(cn, `HTTP error from proxy`, { status: res.status })
      return { ok: false, status: 'TRACKING_PROVIDER_ERROR', userMessage: `LDB returned HTTP ${res.status} for ${cn}` }
    }
    raw = await res.json()
  } catch (err) {
    log(cn, `Network/parse error`, { error: err.message })
    return { ok: false, status: 'TRACKING_PROVIDER_ERROR', userMessage: `Could not reach LDB for ${cn}: ${err.message}` }
  }
  const result = normaliseLDBResponse(cn, raw)
  log(cn, result.ok ? 'Tracking normalised successfully' : `Rejected: ${result.status}`, { requestedAt, lastEventTs: raw?.object?.lastEvent?.timestampTimezone, resultStatus: result.ok ? result.data.status : result.status })
  if (!result.ok) {
    const messages = {
      OUTDATED_TRACKING:          `Tracking data for ${cn} is more than 30 days old and has been skipped.`,
      NO_TRACKING_FOUND:          `No LDB record found for ${cn}.`,
      INVALID_TRACKING_RESPONSE:  `LDB returned an unexpected format for ${cn}.`,
      TRACKING_PROVIDER_ERROR:    `LDB is currently unavailable for ${cn}.`,
    }
    return { ...result, userMessage: messages[result.status] || 'Unknown tracking error.' }
  }
  return result
}

export async function persistLDBTracking(containerNo, jobContext, ldbData) {
  const { data: existing } = await supabase
    .from('container_tracking')
    .select('free_days, notes')
    .eq('container_no', containerNo)
    .single()
  const row = {
    container_no:     containerNo,
    job_no:           jobContext.job_no   || null,
    job_id:           jobContext.id       || null,
    carrier:          jobContext.shipping_line || null,
    status:           ldbData.status,
    status_text:      ldbData.statusText,
    current_location: ldbData.currentLocation,
    vessel:           ldbData.vessel     || jobContext.vessel || null,
    eta:              ldbData.eta        || jobContext.eta    || null,
    free_days:        existing?.free_days ?? jobContext.free_days ?? null,
    notes:            existing?.notes    || null,
    last_update:      ldbData.lastUpdate,
    milestones:       ldbData.milestones || [],
    port_in:          ldbData.portIn     || null,
    port_out:         ldbData.portOut    || null,
    cfs_gate_in:      ldbData.cfsGateIn  || null,
    last_refreshed_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('container_tracking')
    .upsert(row, { onConflict: 'container_no' })
  if (error) {
    console.error(`[LDB] Failed to persist tracking for ${containerNo}:`, error.message)
    throw error
  }
}

export async function refreshJobContainers(job, existingTrackingData = {}) {
  const cnList = (job.containers || '')
    .split(/[\s,;/]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length >= 4)
  const summary = { updated: [], skipped: [], failed: [], messages: [] }
  for (const cn of cnList) {
    try {
      const { data: dbRow } = await supabase
        .from('container_tracking')
        .select('last_refreshed_at')
        .eq('container_no', cn)
        .single()
      if (!isCacheStale(dbRow?.last_refreshed_at)) {
        log(cn, `Cache still fresh (refreshed: ${dbRow.last_refreshed_at}), skipping`)
        summary.skipped.push(cn)
        continue
      }
      const result = await fetchLDBTracking(cn)
      if (!result.ok) {
        summary.messages.push(result.userMessage || `${cn}: ${result.status}`)
        if (result.status === 'OUTDATED_TRACKING' || result.status === 'NO_TRACKING_FOUND') {
          await supabase.from('container_tracking').update({ last_refreshed_at: new Date().toISOString() }).eq('container_no', cn)
          summary.skipped.push(cn)
        } else {
          summary.failed.push(cn)
        }
        continue
      }
      await persistLDBTracking(cn, job, result.data)
      summary.updated.push(cn)
      log(cn, `Successfully updated from LDB`)
    } catch (err) {
      log(cn, `Unexpected error during refresh`, { error: err.message })
      summary.failed.push(cn)
      summary.messages.push(`${cn}: ${err.message}`)
    }
  }
  return summary
}

export async function refreshAllContainers(jobs, existingTracking = {}, onProgress = null) {
  const allJobs = (jobs || []).filter(j => j.containers)
  const totals = { updated: 0, skipped: 0, failed: 0, messages: [] }
  for (const job of allJobs) {
    const summary = await refreshJobContainers(job, existingTracking)
    totals.updated  += summary.updated.length
    totals.skipped  += summary.skipped.length
    totals.failed   += summary.failed.length
    totals.messages.push(...summary.messages)
    if (onProgress && summary.updated.length > 0) {
      onProgress(`Updated: ${summary.updated.join(', ')}`)
    }
  }
  return totals
}
