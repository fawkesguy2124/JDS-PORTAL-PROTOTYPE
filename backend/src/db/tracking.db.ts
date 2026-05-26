import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config.js'
import { TrackingRecord, TrackingEvent, UnifiedTrackingData } from '../types/index.js'

let supabase: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!supabase) {
    if (!config.supabase.url) {
      throw new Error('Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
    }
    supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false },
    })
  }
  return supabase
}

export async function upsertTracking(data: UnifiedTrackingData & { jobId?: string | null; jobNumber?: string | null }): Promise<TrackingRecord> {
  const client = getClient()
  const record = {
    container_no: data.containerNumber,
    job_id: data.jobId || null,
    job_number: data.jobNumber || null,
    carrier: data.carrier,
    current_status: data.currentStatus,
    current_location: data.currentLocation,
    vessel: data.vessel,
    voyage: data.voyage,
    eta: data.eta,
    vessel_arrival: data.vesselArrival,
    port_in: data.portIn,
    port_out: data.portOut,
    cfs_gate_in: data.cfsGateIn,
    last_update: data.lastUpdate,
    events: JSON.stringify(data.events || []),
    is_active: true,
  }

  const { data: result, error } = await client
    .from('tracking')
    .upsert(record, { onConflict: 'container_no', ignoreDuplicates: false })
    .select()
    .single()

  if (error) throw error
  return mapRow(result)
}

import { trackingCache } from '../utils/cache.js'

export async function getAllTracking(): Promise<TrackingRecord[]> {
  if (!config.supabase.url) {
    const all = trackingCache.getAll()
    return all.map((entry: any) => ({
      id: entry.containerNumber || '',
      containerNo: entry.containerNumber || '',
      jobId: null,
      jobNumber: null,
      carrier: entry.carrier || '',
      currentStatus: entry.currentStatus || '',
      currentLocation: entry.currentLocation || '',
      vessel: entry.vessel || '',
      voyage: entry.voyage || '',
      eta: entry.eta || null,
      vesselArrival: entry.vesselArrival || null,
      portIn: entry.portIn || null,
      portOut: entry.portOut || null,
      cfsGateIn: entry.cfsGateIn || null,
      lastUpdate: entry.lastUpdate || null,
      events: entry.events || [],
      isActive: true,
      createdAt: '',
      updatedAt: entry.lastUpdate || '',
    }))
  }
  const client = getClient()
  const { data, error } = await client
    .from('tracking')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data || []).map(mapRow)
}

export async function getTrackingByContainer(containerNo: string): Promise<TrackingRecord | null> {
  const client = getClient()
  const { data, error } = await client
    .from('tracking')
    .select('*')
    .eq('container_no', containerNo)
    .single()

  if (error) return null
  return mapRow(data)
}

export async function getActiveTracking(): Promise<TrackingRecord[]> {
  const client = getClient()
  const { data, error } = await client
    .from('tracking')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data || []).map(mapRow)
}

export async function linkContainerToJob(containerNo: string, jobId: string, jobNumber: string, carrier?: string): Promise<void> {
  const client = getClient()
  const updates: any = { job_id: jobId, job_number: jobNumber }
  if (carrier) updates.carrier = carrier
  await client
    .from('tracking')
    .update(updates)
    .eq('container_no', containerNo)
}

export async function deactivateTracking(containerNo: string): Promise<void> {
  const client = getClient()
  await client
    .from('tracking')
    .update({ is_active: false })
    .eq('container_no', containerNo)
}

export async function deleteTracking(containerNo: string): Promise<void> {
  const client = getClient()
  await client.from('tracking').delete().eq('container_no', containerNo)
}

function mapRow(row: any): TrackingRecord {
  return {
    id: row.id,
    containerNo: row.container_no,
    jobId: row.job_id,
    jobNumber: row.job_number,
    carrier: row.carrier,
    currentStatus: row.current_status,
    currentLocation: row.current_location || '',
    vessel: row.vessel || '',
    voyage: row.voyage || '',
    eta: row.eta || null,
    vesselArrival: row.vessel_arrival || null,
    portIn: row.port_in || null,
    portOut: row.port_out || null,
    cfsGateIn: row.cfs_gate_in || null,
    lastUpdate: row.last_update || null,
    events: (typeof row.events === 'string' ? JSON.parse(row.events) : row.events || []) as TrackingEvent[],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
