import { http } from '../../../utils/requestManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'

interface MSCEvent {
  eventType?: string
  eventDescription?: string
  eventDate?: string
  location?: string
  locationName?: string
  port?: string
}

interface MSCResponse {
  containerNumber?: string
  containerNo?: string
  events?: MSCEvent[]
  milestones?: MSCEvent[]
  vessel?: { name?: string; voyage?: string }
  vesselName?: string
  voyage?: string
  size?: string
  type?: string
  weight?: string
}

// Hidden API endpoints from msc.com/tracker
const API_ENDPOINTS = [
  'https://www.msc.com/tracker/api/v2/container/{containerNo}',
  'https://www.msc.com/tracker/api/container/{containerNo}',
  'https://www.msc.com/tracker/api/v1/containers/{containerNo}',
]

const STATUS_MAP: Record<string, string> = {
  ARRIVED: 'arrived',
  DEPARTED: 'in_transit',
  LOADED: 'in_transit',
  DISCHARGED: 'arrived',
  GATE_IN: 'at_cfs',
  GATE_OUT: 'delivered',
  EMPTY_RETURNED: 'empty_returned',
  CUSTOMS_HOLD: 'customs_hold',
  BOOKING_CONFIRMED: 'in_transit',
  STRIPPED: 'delivered',
}

export async function tryMscHiddenAPI(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)

  for (const endpointTemplate of API_ENDPOINTS) {
    try {
      const url = endpointTemplate.replace('{containerNo}', cn)
      const { data } = await http.get<MSCResponse>(url, {
        headers: {
          Accept: 'application/json',
          Origin: 'https://www.msc.com',
          Referer: 'https://www.msc.com/tracker',
        },
      })
      if (!data) continue

      const events = data.events || data.milestones || []
      if (events.length === 0) continue

      const normalized: TrackingEvent[] = events.map((e) => ({
        status: STATUS_MAP[e.eventType || ''] || e.eventType?.toLowerCase().replace(/\s+/g, '_') || 'unknown',
        location: e.location || e.locationName || e.port || '',
        timestamp: e.eventDate || '',
        description: e.eventDescription || e.eventType || '',
        source: 'carrier' as const,
      }))

      const last = normalized[normalized.length - 1]
      return buildUnifiedResponse({
        containerNumber: cn,
        carrier: 'MSC',
        currentStatus: last?.status || 'in_transit',
        currentLocation: last?.location || '',
        vessel: data.vessel?.name || data.vesselName || '',
        voyage: data.vessel?.voyage || data.voyage || '',
        lastUpdate: last?.timestamp || undefined,
        events: normalized,
      })
    } catch {}
  }

  return null
}
