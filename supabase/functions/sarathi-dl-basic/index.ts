const ULIP_LOGIN_URL = 'http://13.200.155.29:3000/ulip/v1.0.0/user/login'
const ULIP_API_URL   = 'http://13.200.155.29:3000/ulip/v1.0.0/SARATHI/02'
const ULIP_TIMEOUT_MS = 12000
const ULIP_PROXY_KEY = Deno.env.get('ULIP_PROXY_KEY') ?? ''

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getUlipToken(): Promise<string> {
  const username = Deno.env.get('ULIP_USERNAME')
  const password = Deno.env.get('ULIP_PASSWORD')
  if (!username || !password) throw new Error('ULIP credentials not configured on the server')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ULIP_TIMEOUT_MS)
  const res = await fetch(ULIP_LOGIN_URL, {
    method: 'POST',
    headers: {'x-proxy-key': ULIP_PROXY_KEY,  'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username, password }),
    signal: controller.signal,
  })
  clearTimeout(timeout)
  if (!res.ok) { let b = ''; try { b = await res.text() } catch {} throw new Error(`ULIP login failed HTTP ${res.status}: ${b}`) }
  const data = await res.json()
  const token = data?.response?.id || data?.response?.token || data?.data?.token || data?.token || null
  if (!token) throw new Error('No token in ULIP login response')
  return token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let dlnumber = ''
  try { const body = await req.json(); dlnumber = (body?.dlnumber || '').trim() } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), { status: 400, headers: corsHeaders })
  }

  if (!dlnumber || dlnumber.length > 25) return new Response(JSON.stringify({ success: false, error: 'dlnumber must be 1-25 characters' }), { status: 400, headers: corsHeaders })

  let token: string
  try { token = await getUlipToken() } catch (e: any) { return new Response(JSON.stringify({ success: false, error: `ULIP auth failed: ${e.message}` }), { status: 502, headers: corsHeaders }) }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ULIP_TIMEOUT_MS)
    const res = await fetch(ULIP_API_URL, {
      method: 'POST',
      headers: {'x-proxy-key': ULIP_PROXY_KEY,  'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ dlnumber }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const apiText = await res.text()
    let data: any
    try { data = JSON.parse(apiText) } catch {
      return new Response(JSON.stringify({ success: false, found: false, error: 'Non-JSON response', httpStatus: res.status, rawResponse: apiText.slice(0, 2000) }), { status: 200, headers: corsHeaders })
    }

    if (!res.ok) return new Response(JSON.stringify({ success: false, error: `SARATHI/02 HTTP ${res.status}`, raw: data }), { status: res.status, headers: corsHeaders })

    const inner = data?.[0]?.response ?? data?.response ?? data
    const notFound = inner?.errorcode === -1
    const found = !notFound && inner && Object.keys(inner).length > 0
    return new Response(JSON.stringify({ success: true, found: !!found, data: found ? inner : null, raw: data }), { status: 200, headers: corsHeaders })
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError'
    return new Response(JSON.stringify({ success: false, error: isTimeout ? 'Request timed out' : `Unreachable: ${err.message}` }), { status: 502, headers: corsHeaders })
  }
})
