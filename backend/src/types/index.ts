export interface TrackingEvent {
  status: string
  location: string
  timestamp: string
  description: string
  source: 'carrier' | 'pcs' | 'manual'
}

export interface UnifiedTrackingData {
  containerNumber: string
  carrier: string
  currentStatus: string
  currentLocation: string
  vessel: string
  voyage: string
  eta: string | null
  vesselArrival: string | null
  portIn: string | null
  portOut: string | null
  cfsGateIn: string | null
  lastUpdate: string
  events: TrackingEvent[]
}

export interface JobLink {
  jobId: string
  jobNumber: string
  containerNumber: string
}

export interface TrackingRecord {
  id: string
  containerNo: string
  jobId: string | null
  jobNumber: string | null
  carrier: string
  currentStatus: string
  currentLocation: string
  vessel: string
  voyage: string
  eta: string | null
  vesselArrival: string | null
  portIn: string | null
  portOut: string | null
  cfsGateIn: string | null
  lastUpdate: string
  events: TrackingEvent[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CarrierAdapter {
  name: string
  prefixes: string[]
  track(containerNo: string): Promise<UnifiedTrackingData | null>
}

export interface PCSResult {
  containerNumber: string
  vesselArrival: string | null
  portIn: string | null
  portOut: string | null
  cfsGateIn: string | null
  events: TrackingEvent[]
}

export type ScrapeSource = 'hidden_api' | 'playwright' | 'cheerio' | 'simulated'

export interface ScrapeResult {
  source: ScrapeSource
  data: UnifiedTrackingData | null
}
