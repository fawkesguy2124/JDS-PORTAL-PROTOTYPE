import { supabase } from '../../supabase'
import { lineName } from '../../../supabase/functions/_shared/portal/shippingLines.js'

// In-memory dedup set — cleared on each forceRefreshAllContainers/refreshAllContainers run
const _loggedThisRun = new Set()
const MAX_LOG_SET_SIZE = 500
function safeLogAdd(key) {
  if (_loggedThisRun.size > MAX_LOG_SET_SIZE) _loggedThisRun.clear()
  _loggedThisRun.add(key)
}

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
  const e = eventName.toUpperCase().trim()
  if (e === 'CFS OUT' || e === 'GATE OUT' || e === 'GATEOUT' || e === 'GATE CROSSED' || e === 'ICD OUT')
    return 'delivered'
  if (e === 'CFS IN' || e === 'GATE IN' || e === 'CFS GATE IN' || e === 'ICD IN' || e === 'ICD GATE IN')
    return 'at_cfs'
  if (e === 'VESSEL ARRIVED' || e === 'PORT IN' || e === 'PORTIN' || e === 'DPD' || e.includes('DISCHARGE'))
    return 'arrived'
  if (e === 'PORT OUT' || e === 'PORTOUT' || e === 'TOLL PLAZA CROSSED')
    return 'in_transit'
  if (e.includes('EMPTY'))
    return 'empty_returned'
  if (e.includes('CUSTOMS') || e.includes('HOLD'))
    return 'customs_hold'
  if (e.includes('RAIL'))
    return 'on_rail'
  return 'in_transit'
}

function derivePortEvents(trackLog) {
  if (!Array.isArray(trackLog)) return {}

  const portInEvent  = trackLog.find(e => (e.eventName || '').toUpperCase() === 'PORT IN')
  const portOutEvent = trackLog.find(e => (e.eventName || '').toUpperCase() === 'PORT OUT')
  const cfsEvent     = trackLog.find(e => {
    const n = (e.eventName || '').toUpperCase()
    return n === 'GATE IN' || n === 'CFS GATE IN' || n === 'CFS IN' || n === 'ICD GATE IN' || n === 'ICD IN'
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
  log(cn, `Requesting LDB tracking via Edge Function`)
  let raw
  try {
    const { data, error: fnError } = await supabase.functions.invoke('ldb-track', { body: { cntrNo: cn } })
    const respondedAt = new Date().toISOString()
    if (fnError) {
      log(cn, `Edge Function error`, { error: fnError.message, respondedAt })
      return { ok: false, status: 'TRACKING_PROVIDER_ERROR', userMessage: `LDB is currently unavailable for ${cn}: ${fnError.message}` }
    }
    raw = data
    log(cn, `LDB response received`, { respondedAt })
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
      NO_TRACKING_FOUND:          `LDB has no tracking for ${cn} yet. The port or shipping line may not have reported it; try again later.`,
      INVALID_TRACKING_RESPONSE:  `LDB returned an unexpected format for ${cn}.`,
      TRACKING_PROVIDER_ERROR:    `LDB is currently unavailable for ${cn}.`,
    }
    return { ...result, userMessage: messages[result.status] || 'Unknown tracking error.' }
  }
  return result
}

// Alerts are stamped with the moment the portal saw the event, never the event's own time
// (Jose, 31 Oct 2026: a date-only LDB event such as DPE comes as 11:59:59 pm, so the bell
// showed it as unread all evening and "mark read" could not clear it). The event's real
// time, when LDB gives one, goes in the text instead. Same rule as the refresh-containers
// server function.
function eventTime(milestones) {
  for (const m of milestones || []) {
    const t = m?.date ? new Date(m.date).getTime() : NaN
    if (isNaN(t) || t > Date.now()) continue
    const ist = new Date(t + 5.5 * 3600e3)
    if (ist.getUTCHours() === 23 && ist.getUTCMinutes() === 59) continue
    if (ist.getUTCHours() === 0 && ist.getUTCMinutes() === 0 && ist.getUTCSeconds() === 0) continue
    return new Date(t).toISOString()
  }
  return null
}
const atText = (iso) => (iso ? ` · at ${new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : '')
// a delivered job's boxes are no longer its business (a reused box is followed through its new job)
const openJobs = (jobs) => (jobs || []).filter((j) => j.containers && !(Number(j.stage) >= 10))

async function wasAlreadyLogged(title, jobNo) {
  try {
    const { data } = await supabase
      .from('activity_log')
      .select('id')
      .eq('title', title)
      .eq('job_no', jobNo || '')
      .limit(1)
    return data && data.length > 0
  } catch {
    return false
  }
}

export async function persistLDBTracking(containerNo, jobContext, ldbData) {
  const { data: existing } = await supabase
    .from('container_tracking')
    .select('free_days, notes, status, milestones')
    .eq('container_no', containerNo)
    .maybeSingle() // a new container has no row yet
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
    shipping_line_ldb: lineName(ldbData.shippingLine) || null,
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

  // The job has no shipping line yet: use the line LDB says carries the box
  if (jobContext.id && !jobContext.shipping_line && row.shipping_line_ldb) {
    await supabase.from('jobs').update({ shipping_line: row.shipping_line_ldb }).eq('id', jobContext.id).is('shipping_line', null)
  }

  // Log notifications — with in-memory dedup per refresh run
  const entryBase = {
    job_no: jobContext.job_no || null,
    job_id: jobContext.id || null,
  }

  // ── Status changed ──
  if (existing?.status && existing.status !== ldbData.status) {
    const dedupKey = `${containerNo}__status__${ldbData.status}`
    if (!_loggedThisRun.has(dedupKey)) {
      safeLogAdd(dedupKey)
      const notifTitle = `${containerNo} — ${ldbData.statusText || ldbData.status}`
      if (!(await wasAlreadyLogged(notifTitle, jobContext.job_no))) {
        try {
          const { error: logErr } = await supabase.from('activity_log').upsert({
            ...entryBase,
            type:       'container_update',
            action:     'container_update',
            title:      notifTitle,
            note:       `Status: ${existing.status} → ${ldbData.status}${atText(eventTime(ldbData.milestones))}`,
            meta:       { job_id: jobContext.id, container_no: containerNo, old_status: existing.status, new_status: ldbData.status, event_at: eventTime(ldbData.milestones) },
            created_at: new Date().toISOString(),
          }, { onConflict: 'title,job_no', ignoreDuplicates: true })
          if (logErr) console.warn('[LDB] activity_log status insert failed:', logErr.message)
        } catch (logErr) {
          console.warn('[LDB] activity_log status insert failed:', logErr.message)
        }
      }
    }
  }

  // ── New milestones ──
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
    const dedupKey = `${containerNo}__${latest.description}__${latest.date ? new Date(latest.date).toISOString().slice(0, 16) : 'nodate'}`
    if (!_loggedThisRun.has(dedupKey)) {
      safeLogAdd(dedupKey)
      const notifTitle = `${containerNo} — ${latest.description}`
      if (!(await wasAlreadyLogged(notifTitle, jobContext.job_no))) {
        try {
          const { error: logErr } = await supabase.from('activity_log').upsert({
            ...entryBase,
            type:       'container_update',
            action:     'container_update',
            title:      notifTitle,
            note:       newMilestones.length > 1
              ? `${newMilestones.length} new events · Latest: ${latest.description}${atText(eventTime([latest]))}`
              : `${latest.description} · ${latest.location || ''}${atText(eventTime([latest]))}`,
            meta:       { job_id: jobContext.id, container_no: containerNo, event_at: eventTime([latest]) },
            created_at: new Date().toISOString(),
          }, { onConflict: 'title,job_no', ignoreDuplicates: true })
          if (logErr) console.warn('[LDB] activity_log milestone insert failed:', logErr.message)
        } catch (logErr) {
          console.warn('[LDB] activity_log milestone insert failed:', logErr.message)
        }
      }
    }
  }

  // ── Detention alert ──
  const calculatedFreeDays = (() => {
    const contractual = Number(jobContext.free_days) || null
    if (!contractual || !ldbData.portIn) return null
    const portInDate = new Date(ldbData.portIn)
    if (isNaN(portInDate.getTime())) return null
    const IST_OFFSET = 5.5 * 60 * 60 * 1000
    const nowIST = Date.now() + IST_OFFSET
    const portInIST = portInDate.getTime() + IST_OFFSET
    const daysSincePortIn = Math.floor((nowIST - portInIST) / 86400000)
    return Math.max(0, contractual - daysSincePortIn)
  })()
  const isTerminal = ['delivered', 'empty_returned'].includes(ldbData.status) ||
    (ldbData.milestones || []).some(m => 
      ['CFS OUT', 'GATE OUT', 'GATEOUT', 'GATE CROSSED'].includes((m.description || '').toUpperCase().trim())
    )
  if (calculatedFreeDays != null && calculatedFreeDays <= 2 && !isTerminal && (existing?.free_days == null || existing.free_days > 2)) {
    const dedupKey = `${containerNo}__detention`
    if (!_loggedThisRun.has(dedupKey)) {
      safeLogAdd(dedupKey)
      const notifTitle = `${containerNo} — Detention risk`
      if (!(await wasAlreadyLogged(notifTitle, jobContext.job_no))) {
        try {
          const { error: logErr } = await supabase.from('activity_log').upsert({
            ...entryBase,
            type:       'detention_alert',
            action:     'detention_alert',
            title:      notifTitle,
            note:       `Only ${calculatedFreeDays} free day${calculatedFreeDays !== 1 ? 's' : ''} left · Port in: ${ldbData.portIn ? new Date(ldbData.portIn).toLocaleDateString('en-IN', { day:'2-digit', month:'short', timeZone:'Asia/Kolkata' }) : '—'} · ${jobContext.job_no}`,
            meta:       { job_id: jobContext.id, container_no: containerNo, port_in: ldbData.portIn || null, free_days_remaining: calculatedFreeDays },
            created_at: new Date().toISOString(),
          }, { onConflict: 'title,job_no', ignoreDuplicates: true })
          if (logErr) console.warn('[LDB] activity_log detention insert failed:', logErr.message)
        } catch (logErr) {
          console.warn('[LDB] activity_log detention insert failed:', logErr.message)
        }
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
        .maybeSingle()
      // no row yet = stale
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
  const allJobs = openJobs(jobs)
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
  const allJobs = openJobs(jobs)
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
