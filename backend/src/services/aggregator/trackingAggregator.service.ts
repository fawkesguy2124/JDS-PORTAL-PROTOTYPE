import { UnifiedTrackingData, ScrapeResult, TrackingEvent } from '../../types/index.js'
import { trackContainer } from '../carriers/index.js'
import { fetchPCSData } from '../pcs/pcs.service.js'
import { trackingCache } from '../../utils/cache.js'
import { mergeCarrierAndPCS, normalizeContainerNo } from '../../utils/normalizer.js'
import { upsertTracking, getTrackingByContainer } from '../../db/tracking.db.js'

export interface AggregatedResult {
  data: UnifiedTrackingData
  source: 'hidden_api' | 'playwright' | 'cheerio' | 'simulated' | 'cache' | 'db'
}

export async function getTracking(
  containerNo: string,
  options?: { useCache?: boolean; useDb?: boolean; forceRefresh?: boolean; carrierHint?: string }
): Promise<AggregatedResult> {
  const cn = normalizeContainerNo(containerNo)
  const { useCache = true, useDb = true, forceRefresh = false, carrierHint } = options || {}

  // Resolve carrier hint from DB if not provided but container exists
  let resolvedCarrier = carrierHint
  if (!resolvedCarrier && useDb && !forceRefresh) {
    try {
      const dbRecord = await getTrackingByContainer(cn)
      if (dbRecord?.carrier) resolvedCarrier = dbRecord.carrier
    } catch {}
  }

  if (!forceRefresh) {
    // Check memory cache first
    if (useCache) {
      const cached = trackingCache.get(cn)
      if (cached) return { data: cached, source: 'cache' }
    }

    // Check database next
    if (useDb) {
      try {
        const dbRecord = await getTrackingByContainer(cn)
        if (dbRecord) {
          const dbData: UnifiedTrackingData = {
            containerNumber: dbRecord.containerNo,
            carrier: dbRecord.carrier,
            currentStatus: dbRecord.currentStatus,
            currentLocation: dbRecord.currentLocation,
            vessel: dbRecord.vessel,
            voyage: dbRecord.voyage,
            eta: dbRecord.eta,
            vesselArrival: dbRecord.vesselArrival,
            portIn: dbRecord.portIn,
            portOut: dbRecord.portOut,
            cfsGateIn: dbRecord.cfsGateIn,
            lastUpdate: dbRecord.lastUpdate,
            events: dbRecord.events,
          }
          trackingCache.set(cn, dbData)
          return { data: dbData, source: 'db' }
        }
      } catch {}
    }
  }

  // Fetch fresh data from carrier + PCS (with overall timeout)
  const [carrierResult, pcsResult] = await Promise.all([
    Promise.race([
      trackContainer(cn, resolvedCarrier),
      new Promise<ScrapeResult>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 15000)
      ),
    ]).catch(() => ({ source: 'simulated' as const, data: null })),
    fetchPCSData(cn).catch(() => null),
  ])

  if (carrierResult.data) {
    const merged = mergeCarrierAndPCS(carrierResult.data, pcsResult)

    // Persist to DB + cache
    try {
      await upsertTracking(merged)
    } catch {}
    trackingCache.set(cn, merged)

    return { data: merged, source: carrierResult.source }
  }

  // If no real data, try database as final fallback
  if (useDb) {
    try {
      const dbRecord = await getTrackingByContainer(cn)
      if (dbRecord) {
        const dbData: UnifiedTrackingData = {
          containerNumber: dbRecord.containerNo,
          carrier: dbRecord.carrier,
          currentStatus: dbRecord.currentStatus,
          currentLocation: dbRecord.currentLocation,
          vessel: dbRecord.vessel,
          voyage: dbRecord.voyage,
          eta: dbRecord.eta,
          vesselArrival: dbRecord.vesselArrival,
          portIn: dbRecord.portIn,
          portOut: dbRecord.portOut,
          cfsGateIn: dbRecord.cfsGateIn,
          lastUpdate: dbRecord.lastUpdate,
          events: dbRecord.events,
        }
        return { data: dbData, source: 'db' }
      }
    } catch {}
  }

  // Simulated fallback so UI can be tested even when scraping fails
  const simulated = generateSimulatedData(cn, resolvedCarrier || 'Unknown')
  try { await upsertTracking(simulated) } catch {}
  trackingCache.set(cn, simulated)
  return { data: simulated, source: 'simulated' }
}

function generateSimulatedData(cn: string, carrier: string): UnifiedTrackingData {
  const vessel = carrier === 'Maersk' ? 'MAERSK EINDHOVEN / 234W'
    : carrier === 'MSC' ? 'MSC DIANA / 123A'
    : carrier === 'Hapag-Lloyd' ? 'HAPAG LISBON / 051W'
    : carrier === 'CMA-CGM' ? 'CMA CGM TITAN / 078E'
    : carrier === 'ONE' ? 'ONE MANILA / 045N'
    : carrier === 'OOCL' ? 'OOCL BERLIN / 051W'
    : carrier === 'COSCO' ? 'COSCO SHIPPING STAR / 123E'
    : 'UNKNOWN VESSEL'
  const daysAgo = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString()
  }
  const events: TrackingEvent[] = [
    { status: 'gate_in', location: 'Nhava Sheva, IN', timestamp: daysAgo(14), description: 'Container gated in at origin port', source: 'carrier' },
    { status: 'loaded', location: 'Nhava Sheva, IN', timestamp: daysAgo(12), description: 'Container loaded on vessel', source: 'carrier' },
    { status: 'departed', location: 'Nhava Sheva, IN', timestamp: daysAgo(10), description: 'Vessel departed origin port', source: 'carrier' },
    { status: 'arrived', location: 'Colombo, LK', timestamp: daysAgo(5), description: 'Vessel arrived at Colombo', source: 'carrier' },
    { status: 'discharged', location: 'Talegaon CFS, IN', timestamp: daysAgo(1), description: 'Container discharged from vessel', source: 'carrier' },
  ]
  const last = events[events.length - 1]
  return {
    containerNumber: cn,
    carrier,
    currentStatus: 'arrived',
    currentLocation: last.location,
    vessel: 'OOCL BERLIN / 051W',
    voyage: '051W',
    eta: daysAgo(0),
    vesselArrival: daysAgo(3),
    portIn: daysAgo(1),
    portOut: null,
    cfsGateIn: null,
    lastUpdate: new Date().toISOString(),
    events,
  }
}

export async function getBulkTracking(
  containerNos: string[],
  options?: { forceRefresh?: boolean }
): Promise<Map<string, AggregatedResult>> {
  const results = new Map<string, AggregatedResult>()
  const resultsArr = await Promise.allSettled(
    containerNos.map((cn) => getTracking(cn, options))
  )
  containerNos.forEach((cn, i) => {
    const r = resultsArr[i]
    if (r.status === 'fulfilled') {
      results.set(normalizeContainerNo(cn), r.value)
    }
  })
  return results
}
