import { http } from '../../../utils/requestManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'

interface CMAEvent {
  label?: string
  description?: string
  eventDescription?: string
  location?: string
  place?: string
  date?: string
  timestamp?: string
  type?: string
  eventCode?: string
}

interface CMASearchResult {
  events?: CMAEvent[]
  data?: { events?: CMAEvent[] }
  vessel?: { name?: string; voyage?: string }
  containerNumber?: string
}

// Hidden API endpoints discovered from cma-cgm.com tracking
const API_ENDPOINTS = [
  'https://www.cma-cgm.com/ebusiness/api/tracking/GetSearchResult',
  'https://www.cma-cgm.com/ebusiness/tracking/{containerNo}',
  'https://www.cma-cgm.com/api/tracking/v1/containers/{containerNo}',
]

const STATUS_MAP: Record<string, string> = {
  ARR: 'arrived',
  DEP: 'in_transit',
  LOAD: 'in_transit',
  DISC: 'arrived',
  GATEIN: 'at_cfs',
  GATEOUT: 'delivered',
  MTYRET: 'empty_returned',
  CUS: 'customs_hold',
  DEL: 'delayed',
}

export async function tryCMAHiddenAPI(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)

  // Try POST endpoint (this is what their site uses)
  try {
    const { data } = await http.post<CMASearchResult>(
      'https://www.cma-cgm.com/ebusiness/api/tracking/SearchByReference',
      { reference: cn, type: 'CONTAINER' },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: 'https://www.cma-cgm.com',
          Referer: 'https://www.cma-cgm.com/ebusiness/tracking',
        },
      }
    )
    if (data) {
      const events = data.events || data.data?.events || []
      if (events.length > 0) return normalizeCMAEvent(events, cn, data)
    }
  } catch {}

  // Try GET endpoints
  for (const endpointTemplate of API_ENDPOINTS.slice(1)) {
    try {
      const url = endpointTemplate.replace('{containerNo}', cn)
      const { data } = await http.get<CMASearchResult>(url, {
        headers: {
          Accept: 'application/json',
          Origin: 'https://www.cma-cgm.com',
          Referer: 'https://www.cma-cgm.com/ebusiness/tracking',
        },
      })
      if (!data) continue
      const events = data.events || data.data?.events || []
      if (events.length > 0) return normalizeCMAEvent(events, cn, data)
    } catch {}
  }

  return null
}

function normalizeCMAEvent(events: CMAEvent[], containerNo: string, raw: CMASearchResult): UnifiedTrackingData {
  const normalized: TrackingEvent[] = events.map((e) => ({
    status: STATUS_MAP[e.type || e.eventCode || ''] || 'in_transit',
    location: e.location || e.place || '',
    timestamp: e.date || e.timestamp || '',
    description: e.label || e.description || e.eventDescription || '',
    source: 'carrier' as const,
  }))

  const last = normalized[normalized.length - 1]
  return buildUnifiedResponse({
    containerNumber: normalizeContainerNo(containerNo),
    carrier: 'CMA-CGM',
    currentStatus: last?.status || 'in_transit',
    currentLocation: last?.location || '',
    vessel: raw.vessel?.name || '',
    voyage: raw.vessel?.voyage || '',
    lastUpdate: last?.timestamp || undefined,
    events: normalized,
  })
}
