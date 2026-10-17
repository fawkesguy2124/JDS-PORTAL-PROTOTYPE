import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LDB_BASE_URL     = 'https://ldb.co.in/api/ldb/container/search'
const BATCH_SIZE       = 5
const BATCH_DELAY_MS   = 800
const LDB_TIMEOUT_MS   = 9000
const FRESHNESS_MINS   = 25  // skip containers refreshed within last 25 mins
const TERMINAL_STATUSES = ['delivered', 'empty_returned']

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(cn: string, msg: string) {
  console.log(`[LDB-CRON] [${new Date().toISOString()}] [${cn}] ${msg}`)
}

function mapEventToStatus(eventName: string): string {
  if (!eventName) return 'in_transit'
  const e = eventName.toUpperCase().trim()
  if (e === 'CFS OUT' || e === 'GATE OUT' || e === 'GATEOUT' || e === 'GATE CROSSED')
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

function derivePortEvents(trackLog: any[]) {
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

function buildMilestones(trackLog: any[]) {
  if (!Array.isArray(trackLog)) return []
  return [...trackLog]
    .sort((a, b) => {
      const ta = a.timestampTimezone ? new Date(a.timestampTimezone).getTime() : 0
      const tb = b.timestampTimezone ? new Date(b.timestampTimezone).getTime() : 0
      return tb - ta
    })
    .map(e => ({
      description:   e.eventName       || 'Unknown Event',
      location:      e.currentLocation || '',
      date:          e.timestampTimezone || null,
      transportMode: e.transportmode    || '',
    }))
}

// ── LDB Fetch ─────────────────────────────────────────────────────────────────

async function fetchLDB(cn: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  const url = `${LDB_BASE_URL}?cntrNo=${encodeURIComponent(cn)}&searchType=39`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LDB_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const raw = await res.json()
    if (!raw || raw.result === 'No Record Found' || !raw.object) {
      return { ok: false, error: 'NO_TRACKING_FOUND' }
    }
    const obj = raw.object
    if (!obj.lastEvent || !obj.cntrDetail) {
      return { ok: false, error: 'INVALID_RESPONSE' }
    }
    const lastEventTs = obj.lastEvent.timestampTimezone
    if (lastEventTs) {
      const ageDays = (Date.now() - new Date(lastEventTs).getTime()) / 86400000
      if (ageDays > 30) return { ok: false, error: 'OUTDATED' }
    }
    const vesselInfo  = obj.vesselStatusImportArv || {}
    const eventName   = obj.lastEvent.eventName || ''
    const status      = mapEventToStatus(eventName)
    const portEvents  = derivePortEvents(obj.trackLog)
    const milestones  = buildMilestones(obj.trackLog)
    const dpdFlag     = Array.isArray(obj.trackLog) &&
                        obj.trackLog.some((e: any) => (e.eventName || '').toUpperCase() === 'DPD')
    return {
      ok: true,
      data: {
        status,
        statusText:      eventName,
        currentLocation: obj.lastEvent.currentLocation || null,
        vessel:          vesselInfo.vesselname          || null,
        eta:             vesselInfo.timetimestamp       ? vesselInfo.timetimestamp.slice(0, 10) : null,
        portIn:          portEvents.portIn              || null,
        portOut:         portEvents.portOut             || null,
        cfsGateIn:       portEvents.cfsGateIn           || null,
        milestones,
        dpdFlag,
        lastUpdate:      new Date().toISOString(),
      },
    }
  } catch (err: any) {
    clearTimeout(timeout)
    return { ok: false, error: err.name === 'AbortError' ? 'TIMEOUT' : err.message }
  }
}

// ── Persist + Notify ──────────────────────────────────────────────────────────

const _loggedThisRun = new Set<string>()

async function wasAlreadyLogged(title: string, jobNo: string | null): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('activity_log')
      .select('id')
      .eq('title', title)
      .eq('job_no', jobNo || '')
      .limit(1)
    return !!(data && data.length > 0)
  } catch {
    return false
  }
}

async function persistAndNotify(cn: string, job: any, ldbData: any) {
  const { data: existing } = await supabase
    .from('container_tracking')
    .select('free_days, notes, status, milestones')
    .eq('container_no', cn)
    .single()

  const contractual = Number(job.free_days) || null
  let freeDays = existing?.free_days ?? null
  if (contractual && ldbData.portIn) {
    const portInDate = new Date(ldbData.portIn)
    if (!isNaN(portInDate.getTime())) {
      const IST_OFFSET = 5.5 * 60 * 60 * 1000
      const nowIST     = Date.now() + IST_OFFSET
      const portInIST  = portInDate.getTime() + IST_OFFSET
      const daysSince  = Math.floor((nowIST - portInIST) / 86400000)
      freeDays         = Math.max(0, contractual - daysSince)
    }
  } else if (contractual && !ldbData.portIn) {
    freeDays = contractual
  }

  await supabase.from('container_tracking').upsert({
    container_no:      cn,
    job_no:            job.job_no        || null,
    job_id:            job.id            || null,
    carrier:           job.shipping_line || null,
    status:            ldbData.status,
    status_text:       ldbData.statusText,
    current_location:  ldbData.currentLocation,
    vessel:            ldbData.vessel    || job.vessel || null,
    eta:               ldbData.eta       || job.eta    || null,
    free_days:         freeDays,
    notes:             existing?.notes   || null,
    last_update:       ldbData.lastUpdate,
    milestones:        ldbData.milestones || [],
    port_in:           ldbData.portIn    || null,
    port_out:          ldbData.portOut   || null,
    cfs_gate_in:       ldbData.cfsGateIn || null,
    dpd_flag:          ldbData.dpdFlag   || false,
    last_refreshed_at: new Date().toISOString(),
  }, { onConflict: 'container_no' })

  const entryBase = { job_no: job.job_no || null, job_id: job.id || null }

  // ── Status change notification ──
  if (existing?.status && existing.status !== ldbData.status) {
    const key = `${cn}__status__${ldbData.status}`
    if (!_loggedThisRun.has(key)) {
      _loggedThisRun.add(key)
      const notifTitle = `${cn} — ${ldbData.statusText || ldbData.status}`
      if (!(await wasAlreadyLogged(notifTitle, job.job_no))) {
        try {
          const { error: logErr } = await supabase.from('activity_log').upsert({
            ...entryBase,
            type:       'container_update',
            action:     'container_update',
            title:      notifTitle,
            note:       `Status: ${existing.status} → ${ldbData.status}`,
            meta:       { job_id: job.id, container_no: cn, old_status: existing.status, new_status: ldbData.status },
            created_at: ldbData.milestones?.[0]?.date || new Date().toISOString(),
          }, { onConflict: 'title,job_no', ignoreDuplicates: true })
          if (logErr) console.warn('[CRON] activity_log status insert failed:', logErr.message)
        } catch (e: any) { console.warn('[CRON] activity_log status insert failed:', e.message) }
      }
    }
  }

  // ── New milestones notification ──
  const existingKeys = new Set(
    (existing?.milestones || []).map((m: any) =>
      `${(m.description || '').toUpperCase().trim()}__${m.date ? new Date(m.date).toISOString().slice(0, 16) : ''}`
    )
  )
  const newMilestones = (ldbData.milestones || []).filter((m: any) => {
    const key = `${(m.description || '').toUpperCase().trim()}__${m.date ? new Date(m.date).toISOString().slice(0, 16) : ''}`
    return m.date && !existingKeys.has(key)
  })
  if (newMilestones.length > 0) {
    const latest   = newMilestones[0]
    const dedupKey = `${cn}__${latest.description}__${latest.date ? new Date(latest.date).toISOString().slice(0, 16) : 'nodate'}`
    if (!_loggedThisRun.has(dedupKey)) {
      _loggedThisRun.add(dedupKey)
      const notifTitle = `${cn} — ${latest.description}`
      if (!(await wasAlreadyLogged(notifTitle, job.job_no))) {
        try {
          const { error: logErr } = await supabase.from('activity_log').upsert({
            ...entryBase,
            type:       'container_update',
            action:     'container_update',
            title:      notifTitle,
            note:       newMilestones.length > 1
              ? `${newMilestones.length} new events · Latest: ${latest.description}`
              : `${latest.description} · ${latest.location || ''}`,
            meta:       { job_id: job.id, container_no: cn },
            created_at: latest.date || new Date().toISOString(),
          }, { onConflict: 'title,job_no', ignoreDuplicates: true })
          if (logErr) console.warn('[CRON] activity_log milestone insert failed:', logErr.message)
        } catch (e: any) { console.warn('[CRON] activity_log milestone insert failed:', e.message) }
      }
    }
  }

  // ── Detention alert ──
  const isTerminal = TERMINAL_STATUSES.includes(ldbData.status) ||
    (ldbData.milestones || []).some(m => 
      ['CFS OUT', 'GATE OUT', 'GATEOUT', 'GATE CROSSED'].includes((m.description || '').toUpperCase().trim())
    )
  if (!isTerminal && freeDays != null && freeDays <= 2 && (existing?.free_days == null || existing.free_days > 2)) {
    const dedupKey = `${cn}__detention`
    if (!_loggedThisRun.has(dedupKey)) {
      _loggedThisRun.add(dedupKey)
      const notifTitle = `${cn} — Detention risk`
      if (!(await wasAlreadyLogged(notifTitle, job.job_no))) {
        try {
          const { error: logErr } = await supabase.from('activity_log').upsert({
            ...entryBase,
            type:       'detention_alert',
            action:     'detention_alert',
            title:      notifTitle,
            note:       `Only ${freeDays} free day${freeDays !== 1 ? 's' : ''} left · Port in: ${ldbData.portIn ? new Date(ldbData.portIn).toLocaleDateString('en-IN', { day:'2-digit', month:'short', timeZone:'Asia/Kolkata' }) : '—'} · ${job.job_no}`,
            meta:       { job_id: job.id, container_no: cn, port_in: ldbData.portIn || null, free_days_remaining: freeDays },
            created_at: ldbData.portIn || new Date().toISOString(),
          }, { onConflict: 'title,job_no', ignoreDuplicates: true })
          if (logErr) console.warn('[CRON] activity_log detention insert failed:', logErr.message)
        } catch (e: any) { console.warn('[CRON] activity_log detention insert failed:', e.message) }
      }
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const expectedKey = Deno.env.get('CRON_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  _loggedThisRun.clear()
  const startTime = Date.now()
  console.log('[LDB-CRON] Starting container refresh run')

  try {
    const { data: jobs, error: jobsErr } = await supabase
      .from('jobs')
      .select('id, job_no, containers, shipping_line, vessel, eta, free_days')
      .not('containers', 'is', null)
      .neq('containers', '')

    if (jobsErr) throw new Error(`Failed to load jobs: ${jobsErr.message}`)
    if (!jobs?.length) {
      return new Response(JSON.stringify({ message: 'No jobs with containers', updated: 0 }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const allContainers: { cn: string; job: any }[] = []
    for (const job of jobs) {
      const cnList = (job.containers || '')
        .split(/[\s,;/]+/)
        .map((s: string) => s.trim().toUpperCase())
        .filter((s: string) => s.length >= 4)
      for (const cn of cnList) {
        allContainers.push({ cn, job })
      }
    }

    const cutoff = new Date(Date.now() - FRESHNESS_MINS * 60 * 1000).toISOString()
    const { data: recentRows } = await supabase
      .from('container_tracking')
      .select('container_no, status, last_refreshed_at')
      .in('container_no', allContainers.map(c => c.cn))

    const recentMap = new Map((recentRows || []).map((r: any) => [r.container_no, r]))

    const toRefresh = allContainers.filter(({ cn }) => {
      const row = recentMap.get(cn)
      if (!row) return true
      if (TERMINAL_STATUSES.includes(row.status)) return false
      if (row.last_refreshed_at && row.last_refreshed_at > cutoff) return false
      return true
    })

    console.log(`[LDB-CRON] ${toRefresh.length} containers to refresh (${allContainers.length - toRefresh.length} skipped)`)

    const totals = { updated: 0, skipped: 0, failed: 0 }

    for (let i = 0; i < toRefresh.length; i += BATCH_SIZE) {
      const batch = toRefresh.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(async ({ cn, job }) => {
        try {
          const result = await fetchLDB(cn)
          if (!result.ok) {
            log(cn, `Skipped: ${result.error}`)
            await supabase
              .from('container_tracking')
              .update({ last_refreshed_at: new Date().toISOString() })
              .eq('container_no', cn)
            totals.skipped++
            return
          }
          await persistAndNotify(cn, job, result.data)
          totals.updated++
          log(cn, 'Updated successfully')
        } catch (err: any) {
          log(cn, `Error: ${err.message}`)
          totals.failed++
        }
      }))

      if (i + BATCH_SIZE < toRefresh.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[LDB-CRON] Done in ${elapsed}s — updated: ${totals.updated}, skipped: ${totals.skipped}, failed: ${totals.failed}`)

    return new Response(JSON.stringify({ ...totals, elapsed_seconds: elapsed }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[LDB-CRON] Fatal error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
