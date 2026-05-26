import { http } from '../../utils/requestManager.js'
import { config } from '../../config.js'
import { PCSResult, TrackingEvent } from '../../types/index.js'
import { normalizeContainerNo } from '../../utils/normalizer.js'

interface PCSEvent {
  eventType?: string
  eventCode?: string
  eventDescription?: string
  eventDate?: string
  location?: string
  locationCode?: string
  containerStatus?: string
  movementType?: string
}

interface PCSResponse {
  containerNumber?: string
  containerNo?: string
  events?: PCSEvent[]
  milestones?: PCSEvent[]
  vesselName?: string
  voyage?: string
  eta?: string
  etd?: string
  pol?: string
  pod?: string
  cfsDetails?: {
    gateIn?: string
    gateOut?: string
    cfsName?: string
  }
}

export async function fetchPCSData(containerNo: string): Promise<PCSResult | null> {
  if (!config.pcs.apiKey) return null

  const cn = normalizeContainerNo(containerNo)

  try {
    const { data } = await http.get<PCSResponse>(
      `${config.pcs.apiUrl}/container/${cn}`,
      {
        headers: {
          'x-api-key': config.pcs.apiKey,
          Accept: 'application/json',
        },
        timeout: 10000,
      }
    )

    if (!data) return null

    const events: TrackingEvent[] = (data.events || data.milestones || []).map((e: PCSEvent) => ({
      status: (e.eventType || e.eventCode || e.movementType || 'unknown').toLowerCase().replace(/\s+/g, '_'),
      location: e.location || e.locationCode || '',
      timestamp: e.eventDate || '',
      description: e.eventDescription || e.eventType || e.containerStatus || '',
      source: 'pcs' as const,
    }))

    return {
      containerNumber: cn,
      vesselArrival: data.eta || null,
      portIn: events.find((e) => e.status.includes('arrive') || e.status.includes('gate_in'))?.timestamp || null,
      portOut: events.find((e) => e.status.includes('gate_out') || e.status.includes('depart'))?.timestamp || null,
      cfsGateIn: data.cfsDetails?.gateIn || events.find((e) => e.status.includes('cfs'))?.timestamp || null,
      events,
    }
  } catch {
    return null
  }
}
