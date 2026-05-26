import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lokiszscjahxabturzoo.supabase.co'
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxva2lzenNjamFoeGFidHVyem9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NzA1NDEsImV4cCI6MjA5NTM0NjU0MX0.eyWumyCKUKVcVXegPm3ooqo03KGC_wb1xL2DayoL9no'

const STORAGE_KEY = 'jds-logistics-portal-auth'

const authOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
  storageKey: STORAGE_KEY,
}

function createSupabaseClient() {
  return createClient(supabaseUrl, supabaseKey, { auth: authOptions })
}

// Module-level singleton; globalThis guard prevents duplicate GoTrueClient during Vite HMR
const globalCache = globalThis

export const supabase =
  globalCache.__jdsSupabaseClient ?? createSupabaseClient()

if (!globalCache.__jdsSupabaseClient) {
  globalCache.__jdsSupabaseClient = supabase
}
