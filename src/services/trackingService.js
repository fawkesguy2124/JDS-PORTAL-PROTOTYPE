// src/services/trackingService.js
// Placeholder tracking service - real API integration to be added later
import { supabase } from '../supabase'

export async function fetchAllTracking() {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, job_no, client, containers, vessel, eta, stage, updated_at, shipping_line')
    .not('containers', 'is', null)
    .order('updated_at', { ascending: false })

  if (error) throw error

  return (data || []).flatMap((job) => {
    const containerList = (job.containers || '')
      .split(/[\s,;]+/)
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)

    return containerList.map((containerNo) => ({
      containerNo,
      jobNumber: job.job_no,
      jobId: job.id,
      carrier: job.shipping_line || 'Unknown',
      vessel: job.vessel || null,
      eta: job.eta || null,
      status: 'unknown',
      statusText: 'Not checked yet',
      currentLocation: null,
      lastUpdate: job.updated_at,
      milestones: [],
    }))
  })
}

export async function lookupAndSaveContainer(containerNo, carrier) {
  // Placeholder - will connect to real tracking API later
  return {
    containerNo,
    carrier,
    status: 'unknown',
    statusText: 'Not checked yet',
    currentLocation: null,
    lastUpdate: new Date().toISOString(),
    milestones: [],
  }
}

export async function checkContainerStatus(containerNo, carrier) {
  // Placeholder - will connect to real tracking API later
  // For now returns a simulated "pending" status
  await new Promise((resolve) => setTimeout(resolve, 1200))
  return {
    containerNo,
    carrier,
    status: 'unknown',
    statusText: 'Live tracking coming soon',
    currentLocation: 'API integration pending',
    lastUpdate: new Date().toISOString(),
    milestones: [],
  }
}

export async function deleteTracking(containerNo) {
  // Placeholder
  return true
}
