import { http } from '../../../utils/requestManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'

interface ONEEvent {
  status?: string
  statusDescription?: string
  location?: string
  locationName?: string
  port?: string
  date?: string
  timestamp?: string
  eventDescription?: string
}

interface ONEResponse {
  containerNumber?: string
  containerNo?: string
  events?: ONEEvent[]
  milestones?: ONEEvent[]
  vessel?: { name?: string; voyage?: string; imo?: string }
  vesselName?: string
  voyage?: string
  pol?: string
  pod?: string
  eta?: string
}

// Hidden API endpoints from one-line.com
const API_ENDPOINTS = [
  'https://ecomm.one-line.com/one/containertracking/GetContainerTracking',
  'https://www.one-line.com/one/containerTracking/{containerNo}',
  'https://api.one-line.com/tracking/v1/containers/{containerNo}',
]

const STATUS_MAP: Record<string, string> = {
  ARRIVED: 'arrived',
  DEPARTED: 'in_transit',
  LOADED: 'in_transit',
  DISCHARGED: 'arrived',
  GATE_IN: 'at_cfs',
  GATE_OUT: 'delivered',
  EMPTY_RETURNED: 'empty_returned',
  CUSTOMS: 'customs_hold',
  BOOKING: 'in_transit',
  STRIPPED: 'delivered',
}

export async function tryOneHiddenAPI(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)

  try {
    const { data } = await http.post<ONEResponse>(
      'https://ecomm.one-line.com/one/containertracking/GetContainerTracking',
      { containerNumber: cn, searchMode: 'CONTAINER' },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: 'https://www.one-line.com',
          Referer: 'https://www.one-line.com/',
        },
      }
    )
    if (data) {
      const events = data.events || data.milestones || []
      if (events.length > 0) return normalizeONEEvents(events, cn, data)
    }
  } catch {}

  for (const endpointTemplate of API_ENDPOINTS.slice(1)) {
    try {
      const url = endpointTemplate.replace('{containerNo}', cn)
      const { data } = await http.get<ONEResponse>(url, {
        headers: {
          Accept: 'application/json',
          Origin: 'https://www.one-line.com',
          Referer: 'https://www.one-line.com/',
        },
      })
      if (!data) continue
      const events = data.events || data.milestones || []
      if (events.length > 0) return normalizeONEEvents(events, cn, data)
    } catch {}
  }

  return null
}

function normalizeONEEvents(events: ONEEvent[], containerNo: string, raw: ONEResponse): UnifiedTrackingData {
  const normalized: TrackingEvent[] = events.map((e) => ({
    status: STATUS_MAP[e.status || ''] || e.status?.toLowerCase().replace(/\s+/g, '_') || 'unknown',
    location: e.location || e.locationName || e.port || '',
    timestamp: e.date || e.timestamp || '',
    description: e.statusDescription || e.eventDescription || e.status || '',
    source: 'carrier' as const,
  }))

  const last = normalized[normalized.length - 1]
  return buildUnifiedResponse({
    containerNumber: normalizeContainerNo(containerNo),
    carrier: 'ONE',
    currentStatus: last?.status || 'in_transit',
    currentLocation: last?.location || '',
    vessel: raw.vessel?.name || raw.vesselName || '',
    voyage: raw.vessel?.voyage || raw.voyage || '',
    eta: raw.eta || null,
    lastUpdate: last?.timestamp || undefined,
    events: normalized,
  })
}
