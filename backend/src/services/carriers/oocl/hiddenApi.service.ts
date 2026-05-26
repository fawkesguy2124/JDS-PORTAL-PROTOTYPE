import { http } from '../../../utils/requestManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'

interface OOCLEvent {
  eventType?: string
  eventDescription?: string
  eventDate?: string
  location?: string
  locationName?: string
  facility?: string
}

interface OOCLResponse {
  containerNumber?: string
  containerNo?: string
  events?: OOCLEvent[]
  milestones?: OOCLEvent[]
  vessel?: { name?: string; voyage?: string; imo?: string }
  vesselName?: string
  voyage?: string
  pol?: string
  pod?: string
  eta?: string
  etd?: string
}

// Hidden API endpoints from oocl.com
const API_ENDPOINTS = [
  'https://www.oocl.com/shipmenttracking/rest/container/{containerNo}',
  'https://www.oocl.com/cargotracking/rest/container/{containerNo}',
  'https://api.oocl.com/tracking/v1/containers/{containerNo}',
  'https://www.oocl.com/tracking/api/container/{containerNo}',
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
  RECEIVED: 'at_cfs',
  BOOKED: 'in_transit',
}

export async function tryOoclHiddenAPI(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)

  const attempts = API_ENDPOINTS.map(async (template) => {
    const url = template.replace('{containerNo}', cn)
    const { data } = await http.get<OOCLResponse>(url, {
      timeout: 5000,
      headers: {
        Accept: 'application/json',
        Origin: 'https://www.oocl.com',
        Referer: 'https://www.oocl.com/',
      },
    })
    return data
  })

  const settled = await Promise.allSettled(attempts)
  for (const result of settled) {
    if (result.status !== 'fulfilled' || !result.value) continue
    const data = result.value
    const events = data.events || data.milestones || []
    if (events.length === 0) continue

    const normalized: TrackingEvent[] = events.map((e) => ({
      status: STATUS_MAP[e.eventType || ''] || e.eventType?.toLowerCase().replace(/\s+/g, '_') || 'unknown',
      location: e.location || e.locationName || e.facility || '',
      timestamp: e.eventDate || '',
      description: e.eventDescription || e.eventType || '',
      source: 'carrier' as const,
    }))

    const last = normalized[normalized.length - 1]
    return buildUnifiedResponse({
      containerNumber: cn,
      carrier: 'OOCL',
      currentStatus: last?.status || 'in_transit',
      currentLocation: last?.location || '',
      vessel: data.vessel?.name || data.vesselName || '',
      voyage: data.vessel?.voyage || data.voyage || '',
      eta: data.eta || null,
      lastUpdate: last?.timestamp || undefined,
      events: normalized,
    })
  }

  return null
}
