import { http } from '../../../utils/requestManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'

interface COSCOEvent {
  eventType?: string
  eventDesc?: string
  eventDescription?: string
  eventDate?: string
  location?: string
  locationName?: string
  port?: string
  facility?: string
}

interface COSCOVessel {
  name?: string
  voyage?: string
  imo?: string
}

interface COSCOResponse {
  containerNumber?: string
  containerNo?: string
  events?: COSCOEvent[]
  milestones?: COSCOEvent[]
  vessel?: COSCOVessel
  vesselName?: string
  voyage?: string
  pol?: string
  pod?: string
  eta?: string
  etd?: string
  data?: {
    containerNumber?: string
    events?: COSCOEvent[]
    vessel?: COSCOVessel
  }
}

// COSCO uses a POST-based API behind their tracking portal
const API_ENDPOINTS = [
  'https://lines.coscoshipping.com/ebusiness/cargoTracking/queryCargoTrackingList',
  'https://lines.coscoshipping.com/ebusiness/cargoTracking/{containerNo}',
  'https://api.coscoshipping.com/tracking/v1/containers/{containerNo}',
]

const STATUS_MAP: Record<string, string> = {
  'ARRIVE': 'arrived',
  'DEPART': 'in_transit',
  'LOAD': 'in_transit',
  'DISC': 'arrived',
  'GATEIN': 'at_cfs',
  'GATEOUT': 'delivered',
  'EMPTY': 'empty_returned',
  'CUSTOMS': 'customs_hold',
  'RECEIVED': 'at_cfs',
  'BOOKED': 'in_transit',
}

export async function tryCoscoHiddenAPI(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)

  try {
    const { data } = await http.post<COSCOResponse>(
      'https://lines.coscoshipping.com/ebusiness/cargoTracking/queryCargoTrackingList',
      { containerNo: cn, searchType: 'CONTAINER' },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: 'https://lines.coscoshipping.com',
          Referer: 'https://lines.coscoshipping.com/',
        },
      }
    )
    if (data) {
      const events = data.events || data.data?.events || data.milestones || []
      if (events.length > 0) {
        return normalizeCOSCOEvents(events, cn, data)
      }
    }
  } catch {}

  for (const endpointTemplate of API_ENDPOINTS.slice(1)) {
    try {
      const url = endpointTemplate.replace('{containerNo}', cn)
      const { data } = await http.get<COSCOResponse>(url, {
        headers: {
          Accept: 'application/json',
          Origin: 'https://lines.coscoshipping.com',
          Referer: 'https://lines.coscoshipping.com/',
        },
      })
      if (!data) continue
      const events = data.events || data.data?.events || data.milestones || []
      if (events.length > 0) return normalizeCOSCOEvents(events, cn, data)
    } catch {}
  }

  return null
}

function normalizeCOSCOEvents(events: COSCOEvent[], containerNo: string, raw: COSCOResponse): UnifiedTrackingData {
  const normalized: TrackingEvent[] = events.map((e) => {
    const typeCode = e.eventType || ''
    return {
      status: STATUS_MAP[typeCode] || typeCode.toLowerCase().replace(/\s+/g, '_') || 'unknown',
      location: e.location || e.locationName || e.port || e.facility || '',
      timestamp: e.eventDate || '',
      description: e.eventDesc || e.eventDescription || e.eventType || '',
      source: 'carrier' as const,
    }
  })

  const last = normalized[normalized.length - 1]
  const vessel = raw.vessel?.name || raw.vesselName || raw.data?.vessel?.name || ''
  const voyage = raw.vessel?.voyage || raw.voyage || raw.data?.vessel?.voyage || ''

  return buildUnifiedResponse({
    containerNumber: normalizeContainerNo(containerNo),
    carrier: 'COSCO',
    currentStatus: last?.status || 'in_transit',
    currentLocation: last?.location || '',
    vessel,
    voyage,
    eta: raw.eta || null,
    lastUpdate: last?.timestamp || undefined,
    events: normalized,
  })
}
