import { supabase } from '../../supabase'

// In-memory dedup set — cleared on each forceRefreshAllContainers/refreshAllContainers run
const _loggedThisRun = new Set()
const MAX_LOG_SET_SIZE = 500
function safeLogAdd(key) {
  if (_loggedThisRun.size > MAX_LOG_SET_SIZE) _loggedThisRun.clear()
  safeLogAdd(key)
}

const LDB_PROXY_URL = '/api/ldb-track'
const FRESHNESS_DAYS = 30
const CACHE_HOURS = 12

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

  if (e === 'GATE OUT' || e === 'GATEOUT')               return 'delivered'
  if (e === 'GATE IN'  || e === 'CFS GATE IN')           return 'at_cfs'
  if (e === 'DPD')                                       return 'at_cfs'
  if (e === 'PORT OUT' || e === 'PORTOUT')               return 'at_cfs'
  if (e === 'VESSEL ARRIVED' || e === 'PORT IN'
    || e === 'PORTIN' || e.includes('DISCHARGE'))        return 'arrived'
  if (e.includes('EMPTY'))                               return 'empty_returned'
  if (e.includes('CUSTOMS') || e.includes('HOLD'))       return 'customs_hold'
  if (e.includes('RAIL'))                                return 'on_rail'

  return 'in_transit'
}

function derivePortEvents(trackLog) {
  if (!Array.isArray(trackLog)) return {}

  const portInEvent  = trackLog.find(e => (e.eventName || '').toUpperCase() === 'PORT IN')
  const portOutEvent = trackLog.find(e => (e.eventName || '').toUpperCase() === 'PORT OUT')
  const cfsEvent     = trackLog.find(e => {
    const n = (e.eventName || '').toUpperCase()
    return n === 'GATE IN' || n === 'CFS GATE IN' || n === 'ICD GATE IN'
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

  const terminalRaw = (obj.cntrInTransit && obj.cntrInTransit[0])
    ? obj.cntrInTransit[0].currentLocation
    : obj.lastEvent.currentLocation || null

  const isEmpty = obj.lastEvent.isEmpty === 'Y'

  const dpdFlag = Array.isArray(obj.trackLog)
    && obj.trackLog.some(e => (e.eventName || '').toUpperCase() === 'DPD')

  const expectedPortOut = obj.lastEvent.expectedEventTime || null

  const shippingLine = vesselInfo.shippingline || null
  const vesselImo    = vesselInfo.vesselimo    || null

  const containerSize = obj.cntrDetail.containerType || obj.cntrDetail.size || null

  return {
    ok: true,
    data: {
      status,
      statusText:       eventName,
      currentLocation:  obj.lastEvent.currentLocation || null,
      terminal:         terminalRaw,
      dpdFlag,
      isEmpty,
      vessel,
      vesselImo,
      shippingLine,
      containerSize,
      eta:              eta ? eta.slice(0, 10) : null,
      expectedPortOut,
      freeDays:         null,
      lastUpdate:       new Date().toISOString(),
      milestones,
      portIn:           portEvents.portIn,
      portOut:          portEvents.portOut,
      cfsGateIn:        portEvents.cfsGateIn,
      ldbContainerNo:   obj.cntrDetail.cntrNumber   || containerNo,
      ldbSize:          obj.cntrDetail.size         || null,
      ldbType:          obj.cntrDetail.containerType || null,
      ldbIsoCode:       obj.cntrDetail.isoCode      || null,
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
    console.log('[LDB] Raw response for', cn, ':', JSON.stringify(raw, null, 2))
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
    .select('free_days, notes, status, milestones')
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
    vessel_imo:        ldbData.vesselImo       || null,
    shipping_line_ldb: ldbData.shippingLine    || null,
    container_size:    ldbData.containerSize   || null,
    expected_port_out: ldbData.expectedPortOut || null,
    eta:              ldbData.eta        || jobContext.eta    || null,
    free_days: (() => {
      // Contractual free days comes from BL (stored on job) — never from LDB
      const contractual = Number(jobContext.free_days) || null
      if (!contractual) return existing?.free_days ?? null // preserve manual entry if no BL data
      if (!ldbData.portIn) return contractual // not arrived yet — full free days remain
      const portInDate = new Date(ldbData.portIn)
      if (isNaN(portInDate.getTime())) return contractual
      // Calculate days in IST (UTC+5:30) to avoid ±1 day error at midnight
      const IST_OFFSET = 5.5 * 60 * 60 * 1000
      const nowIST = Date.now() + IST_OFFSET
      const portInIST = portInDate.getTime() + IST_OFFSET
      const daysSincePortIn = Math.floor((nowIST - portInIST) / 86400000)
      return Math.max(0, contractual - daysSincePortIn)
    })(),
    notes:            existing?.notes    || null,
    last_update:      ldbData.lastUpdate,
    milestones:       ldbData.milestones || [],
    port_in:          ldbData.portIn     || null,
    port_out:         ldbData.portOut    || null,
    terminal:         ldbData.terminal  || null,
    dpd_flag:         ldbData.dpdFlag   || false,
    is_empty:         ldbData.isEmpty   || false,
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

  // Log notifications — with in-memory dedup per refresh run
  const entryBase = {
    job_no: jobContext.job_no || null,
    job_id: jobContext.id || null,
  }

  // Status changed
  if (existing?.status && existing.status !== ldbData.status) {
    const dedupKey = `${containerNo}__status__${ldbData.status}`
    if (!_loggedThisRun.has(dedupKey)) {
      safeLogAdd(dedupKey)
      try {
        await supabase.from('activity_log').insert({
          ...entryBase,
          type: 'container_update',
          action: 'container_update',
          title: `${containerNo} — ${ldbData.statusText || ldbData.status}`,
          note: `Status: ${existing.status} → ${ldbData.status}`,
          meta: { job_id: jobContext.id, container_no: containerNo, old_status: existing.status, new_status: ldbData.status },
          created_at: ldbData.milestones?.[0]?.date || new Date().toISOString(),
        })
      } catch (logErr) {
        console.warn('[LDB] activity_log insert failed:', logErr.message)
      }
    }
  }

  // New milestones — robust dedup using description + date
  const existingKeys = new Set(
    (existing?.milestones || []).map(m =>
      `${(m.description || '').toUpperCase().trim()}__${m.date ? new Date(m.date).toISOString().slice(0, 16) : ''}`
    )
  )
  const newMilestones = (ldbData.milestones || []).filter(m => {
    const key = `${(m.description || '').toUpperCase().trim()}__${m.date ? new Date(m.date).toISOString().slice(0, 16) : ''}`
    return m.date && !existingKeys.has(key)
  })
  if (newMilestones.length > 0) {
    const latest = newMilestones[0]
    const dedupKey = `${containerNo}__${latest.description}`
    if (!_loggedThisRun.has(dedupKey)) {
      safeLogAdd(dedupKey)
      try {
        await supabase.from('activity_log').insert({
          ...entryBase,
          type: 'container_update',
          action: 'container_update',
          title: `${containerNo} — ${latest.description}`,
          note: newMilestones.length > 1
            ? `${newMilestones.length} new events · Latest: ${latest.description}`
            : `${latest.description} · ${latest.location || ''}`,
          meta: { job_id: jobContext.id, container_no: containerNo },
          created_at: latest.date || new Date().toISOString(),
        })
      } catch (logErr) {
        console.warn('[LDB] activity_log insert failed:', logErr.message)
      }
    }
  }

  // Detention alert (only if newly triggered)
  const calculatedFreeDays = (() => {
    const contractual = Number(jobContext.free_days) || null
    if (!contractual || !ldbData.portIn) return null
    const portInDate = new Date(ldbData.portIn)
    if (isNaN(portInDate.getTime())) return null
    // Calculate days in IST
    const IST_OFFSET = 5.5 * 60 * 60 * 1000
    const nowIST = Date.now() + IST_OFFSET
    const portInIST = portInDate.getTime() + IST_OFFSET
    const daysSincePortIn = Math.floor((nowIST - portInIST) / 86400000)
    return Math.max(0, contractual - daysSincePortIn)
  })()
  const isTerminal = ['delivered', 'empty_returned', 'gate_out'].includes(ldbData.status)
  if (calculatedFreeDays != null && calculatedFreeDays <= 2 && !isTerminal && (existing?.free_days == null || existing.free_days > 2)) {
    const dedupKey = `${containerNo}__detention`
    if (!_loggedThisRun.has(dedupKey)) {
      safeLogAdd(dedupKey)
      try {
        await supabase.from('activity_log').insert({
          ...entryBase,
          type: 'detention_alert',
          action: 'detention_alert',
          title: `${containerNo} — Detention risk`,
          note: `Only ${calculatedFreeDays} free day${calculatedFreeDays !== 1 ? 's' : ''} left · Port in: ${ldbData.portIn ? new Date(ldbData.portIn).toLocaleDateString('en-IN', { day:'2-digit', month:'short', timeZone:'Asia/Kolkata' }) : '—'} · ${jobContext.job_no}`,
          meta: {
            job_id: jobContext.id,
            container_no: containerNo,
            port_in: ldbData.portIn || null,
            free_days_remaining: calculatedFreeDays,
          },
          created_at: ldbData.portIn || new Date().toISOString(),
        })
      } catch (logErr) {
        console.warn('[LDB] activity_log insert failed:', logErr.message)
      }
    }
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
      const { data: dbRow, error: dbErr } = await supabase
        .from('container_tracking')
        .select('last_refreshed_at')
        .eq('container_no', cn)
        .single()
      // 406 = no row exists yet, treat as stale
      if (!dbErr && !isCacheStale(dbRow?.last_refreshed_at)) {
        log(cn, `Cache still fresh (refreshed: ${dbRow.last_refreshed_at}), skipping`)
        summary.skipped.push(cn)
        continue
      }
      // Polite delay — avoid triggering LDB rate limits
      await new Promise(r => setTimeout(r, 800 + Math.random() * 400))
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
  _loggedThisRun.clear()
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

export async function forceRefreshAllContainers(jobs, onProgress = null) {
  _loggedThisRun.clear()
  const allJobs = (jobs || []).filter(j => j.containers)
  const totals = { updated: 0, skipped: 0, failed: 0, messages: [] }

  // Collect all containers across all jobs
  const allContainers = []
  for (const job of allJobs) {
    const cnList = (job.containers || '')
      .split(/[\s,;/]+/)
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length >= 4)
    for (const cn of cnList) {
      allContainers.push({ cn, job })
    }
  }

  // Process in batches of 5 in parallel
  const BATCH_SIZE = 5
  for (let i = 0; i < allContainers.length; i += BATCH_SIZE) {
    const batch = allContainers.slice(i, i + BATCH_SIZE)

    await Promise.all(batch.map(async ({ cn, job }) => {
      try {
        const result = await fetchLDBTracking(cn)

        if (!result.ok) {
          totals.messages.push(result.userMessage || `${cn}: ${result.status}`)
          if (result.status === 'OUTDATED_TRACKING' || result.status === 'NO_TRACKING_FOUND') {
            await supabase.from('container_tracking')
              .update({ last_refreshed_at: new Date().toISOString() })
              .eq('container_no', cn)
            totals.skipped++
          } else {
            totals.failed++
          }
          return
        }

        await persistLDBTracking(cn, job, result.data)
        totals.updated++
        log(cn, 'Force refreshed successfully')
        if (onProgress) onProgress(`Updated: ${cn}`)

      } catch (err) {
        log(cn, 'Force refresh error', { error: err.message })
        totals.failed++
        totals.messages.push(`${cn}: ${err.message}`)
      }
    }))

    // Small delay between batches to be polite to LDB
    if (i + BATCH_SIZE < allContainers.length) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  return totals
}
