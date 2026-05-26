import dotenv from 'dotenv'
dotenv.config()

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  pcs: {
    apiKey: process.env.PCS_API_KEY || '',
    apiUrl: process.env.PCS_API_URL || 'https://api.pcs1x.com/v1',
  },
  redis: {
    url: process.env.REDIS_URL || '',
  },
  proxy: {
    url: process.env.PROXY_URL || '',
  },
  playwright: {
    browserPath: process.env.PLAYWRIGHT_BROWSER_PATH || '',
  },
  cache: {
    ttlMs: 5 * 60 * 1000,
    maxSize: 500,
  },

}
