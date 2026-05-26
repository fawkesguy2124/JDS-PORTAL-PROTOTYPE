import { http } from '../../../utils/requestManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'

interface HapagEvent {
  milestoneTypeCode?: string
  milestoneDescription?: string
  milestoneDate?: string
  locationName?: string
  location?: { name?: string; country?: string }
  facilityName?: string
  equipmentEventTypeCode?: string
  equipmentEventCreatedDateTime?: string
}

interface HapagResponse {
  milestones?: HapagEvent[]
  events?: HapagEvent[]
  equipmentEvents?: HapagEvent[]
  transportInfo?: {
    vesselName?: string
    voyage?: string
    bookingNumber?: string
  }
  vessel?: { name?: string; imo?: string }
}

// Hidden API endpoints discovered from hapag-lloyd.com tracking
const API_ENDPOINTS = [
  'https://www.hapag-lloyd.com/tracking/api/track/by-cntr/{containerNo}',
  'https://www.hapag-lloyd.com/tracking/api/track/equipment/{containerNo}',
  'https://api.hapag-lloyd.com/tracking/v1/containers/{containerNo}',
  'https://www.hapag-lloyd.com/tracking/api/v2/containers/{containerNo}',
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
  BOOKING: 'in_transit',
  STRIPPED: 'delivered',
  DELAYED: 'delayed',
}

function normalizeHapagEvents(events: any[]): TrackingEvent[] {
  return (events || []).map((e: any) => {
    const typeCode = e.milestoneTypeCode || e.equipmentEventTypeCode || e.type || ''
    const desc = e.milestoneDescription || e.description || e.equipmentEventTypeCode || ''
    const loc = e.locationName || e.location?.name || e.facilityName || e.city || ''
    const dateStr = e.milestoneDate || e.date || e.equipmentEventCreatedDateTime || e.timestamp || ''
    return {
      status: STATUS_MAP[typeCode] || typeCode.toLowerCase().replace(/\s+/g, '_') || 'unknown',
      location: loc,
      timestamp: dateStr,
      description: desc,
      source: 'carrier' as const,
    }
  }).filter((e: TrackingEvent) => e.timestamp || e.description)
}

export async function tryHapagHiddenAPI(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)

  for (const endpointTemplate of API_ENDPOINTS) {
    try {
      const url = endpointTemplate.replace('{containerNo}', cn)
      const { data } = await http.get<HapagResponse>(url, {
        headers: {
          Accept: 'application/json',
          Origin: 'https://www.hapag-lloyd.com',
          Referer: 'https://www.hapag-lloyd.com/',
        },
      })

      if (!data) continue

      const events = data.milestones || data.events || data.equipmentEvents || []
      if (events.length === 0) continue

      const normalized = normalizeHapagEvents(events)
      const last = normalized[normalized.length - 1]
      const vessel = data.transportInfo?.vesselName || data.vessel?.name || ''

      return buildUnifiedResponse({
        containerNumber: cn,
        carrier: 'Hapag-Lloyd',
        currentStatus: last?.status || 'in_transit',
        currentLocation: last?.location || '',
        vessel,
        voyage: data.transportInfo?.voyage || '',
        lastUpdate: last?.timestamp || undefined,
        events: normalized,
      })
    } catch {}
  }

  return null
}
