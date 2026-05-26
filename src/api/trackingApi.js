// src/api/trackingApi.js
// Placeholder tracking API - real carrier integration to be added later
import { supabase } from '../supabase'

export async function linkContainer(containerNo, jobId, jobNo, carrier) {
  // Placeholder - container is already linked via the jobs table
  // containers field on the job stores the container numbers
  // This function will later create dedicated tracking entries
  console.log(`Container ${containerNo} linked to job ${jobNo} via ${carrier}`)
  return { containerNo, jobId, jobNo, carrier }
}
