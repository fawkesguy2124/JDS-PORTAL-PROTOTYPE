import { UnifiedTrackingData, TrackingEvent } from '../types/index.js'

export function normalizeContainerNo(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

export function buildUnifiedResponse(data: {
  containerNumber: string
  carrier: string
  currentStatus?: string
  currentLocation?: string
  vessel?: string
  voyage?: string
  eta?: string | null
  vesselArrival?: string | null
  portIn?: string | null
  portOut?: string | null
  cfsGateIn?: string | null
  lastUpdate?: string
  events?: TrackingEvent[]
}): UnifiedTrackingData {
  const events = data.events || []
  const last = events[events.length - 1]

  return {
    containerNumber: normalizeContainerNo(data.containerNumber),
    carrier: data.carrier,
    currentStatus: data.currentStatus || last?.status || 'unknown',
    currentLocation: data.currentLocation || last?.location || '',
    vessel: data.vessel || '',
    voyage: data.voyage || '',
    eta: data.eta || null,
    vesselArrival: data.vesselArrival || null,
    portIn: data.portIn || null,
    portOut: data.portOut || null,
    cfsGateIn: data.cfsGateIn || null,
    lastUpdate: data.lastUpdate || last?.timestamp || new Date().toISOString(),
    events,
  }
}

export function mergeCarrierAndPCS(
  carrier: UnifiedTrackingData,
  pcs: { vesselArrival?: string | null; portIn?: string | null; portOut?: string | null; cfsGateIn?: string | null; events?: TrackingEvent[] } | null
): UnifiedTrackingData {
  if (!pcs) return carrier

  return {
    ...carrier,
    vesselArrival: carrier.vesselArrival || pcs.vesselArrival || null,
    portIn: carrier.portIn || pcs.portIn || null,
    portOut: carrier.portOut || pcs.portOut || null,
    cfsGateIn: carrier.cfsGateIn || pcs.cfsGateIn || null,
    events: [
      ...(pcs.events || []).filter(
        (pe) => !carrier.events.some((ce) => ce.timestamp === pe.timestamp && ce.status === pe.status)
      ),
      ...carrier.events,
    ],
  }
}
