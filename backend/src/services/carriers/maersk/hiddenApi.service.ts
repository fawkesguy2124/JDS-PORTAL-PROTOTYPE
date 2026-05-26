import { http } from '../../../utils/requestManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'

interface MaerskEvent {
  eventId?: string
  eventType?: string
  eventDescription?: string
  eventDateTime?: string
  location?: {
    name?: string
    city?: string
    country?: string
    unLocode?: string
  }
  status?: string
}

interface MaerskContainer {
  containerNumber?: string
  size?: string
  type?: string
  weight?: string
  sealNumber?: string
  position?: string
  lastOnlineCheck?: string
  lastUpdatedOn?: string
  events?: MaerskEvent[]
  vessel?: {
    name?: string
    imo?: string
    flag?: string
  }
  transportInfo?: {
    vesselName?: string
    voyage?: string
    departureDate?: string
    arrivalDate?: string
    pol?: string
    pod?: string
  }
  shipName?: string
  voyage?: string
}

interface MaerskResponse {
  containers?: MaerskContainer[]
  containerNumber?: string
  events?: MaerskEvent[]
  errors?: Array<{ code: string; message: string }>
}

// Hidden API endpoint discovered from maersk.com/tracking page XHR network requests
const API_ENDPOINTS = [
  'https://api.maersk.com/tracking/public/state/{containerNo}',
  'https://api.maersk.com/tracking/public/containers/{containerNo}',
  'https://api.maersk.com/tracking/{containerNo}',
  'https://api.maersk.com/tracking/v1/containers/{containerNo}',
]

const STATUS_MAP: Record<string, string> = {
  ARRIVED: 'arrived',
  DEPARTED: 'in_transit',
  LOADED: 'in_transit',
  DISCHARGED: 'arrived',
  GateIn: 'at_cfs',
  GateOut: 'delivered',
  EMPTY_RETURNED: 'empty_returned',
  CUSTOMS_HOLD: 'customs_hold',
  DELAYED: 'delayed',
  ON_RAIL: 'on_rail',
  BOOKING_CONFIRMED: 'in_transit',
  GATE_OUT_EMPTY: 'empty_returned',
}

function normalizeMaerskEvents(events: MaerskEvent[]): TrackingEvent[] {
  return (events || []).map((e) => ({
    status: STATUS_MAP[e.eventType || ''] || e.eventType?.toLowerCase().replace(/\s+/g, '_') || 'unknown',
    location: e.location?.name || e.location?.city || e.location?.country || '',
    timestamp: e.eventDateTime || '',
    description: e.eventDescription || e.eventType || '',
    source: 'carrier' as const,
  })).filter((e) => e.timestamp || e.description)
}

function normalizeMaerskContainer(raw: MaerskContainer, containerNo: string): UnifiedTrackingData {
  const events = normalizeMaerskEvents(raw.events || [])
  const last = events[events.length - 1]
  const vesselName = raw.transportInfo?.vesselName || raw.vessel?.name || raw.shipName || ''
  const voyage = raw.transportInfo?.voyage || raw.voyage || ''

  return buildUnifiedResponse({
    containerNumber: normalizeContainerNo(raw.containerNumber || containerNo),
    carrier: 'Maersk',
    currentStatus: last?.status || 'in_transit',
    currentLocation: last?.location || '',
    vessel: vesselName,
    voyage,
    lastUpdate: raw.lastUpdatedOn || last?.timestamp || undefined,
    events,
  })
}

export async function tryMaerskHiddenAPI(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)

  for (const endpointTemplate of API_ENDPOINTS) {
    try {
      const url = endpointTemplate.replace('{containerNo}', cn)
      const { data } = await http.get<MaerskResponse>(url, {
        headers: {
          Accept: 'application/json',
          'x-api-key': '',
          Origin: 'https://www.maersk.com',
          Referer: 'https://www.maersk.com/',
        },
      })

      if (data?.containers?.[0]) {
        return normalizeMaerskContainer(data.containers[0], cn)
      }

      if (data?.containerNumber || data?.events) {
        return normalizeMaerskContainer(data as any, cn)
      }
    } catch {}
  }

  // Try the old v1 tracking endpoint that some Maersk subdomains use
  try {
    const { data } = await http.get(`https://www.maersk.com/tracking/${cn}`, {
      headers: { Accept: 'application/json' },
    })
    if (data && (data.containerNumber || data.events || data.containers)) {
      const container = data.containers?.[0] || data
      return normalizeMaerskContainer(container, cn)
    }
  } catch {}

  return null
}
