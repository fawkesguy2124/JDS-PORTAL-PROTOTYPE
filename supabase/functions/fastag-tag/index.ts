const ULIP_LOGIN_URL = 'http://13.200.155.29:3000/ulip/v1.0.0/user/login'
const ULIP_API_URL   = 'http://13.200.155.29:3000/ulip/v1.0.0/FASTAG/02'
const ULIP_TIMEOUT_MS = 12000

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
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
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

  let vehiclenumber = '', tagid = ''
  try { const body = await req.json(); vehiclenumber = (body?.vehiclenumber || '').trim(); tagid = (body?.tagid || '').trim() } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), { status: 400, headers: corsHeaders })
  }

  // Exactly one must be provided
  if (!vehiclenumber && !tagid) return new Response(JSON.stringify({ success: false, error: 'Either vehiclenumber or tagid must be provided' }), { status: 400, headers: corsHeaders })
  if (vehiclenumber && tagid)   return new Response(JSON.stringify({ success: false, error: 'Provide only one of vehiclenumber or tagid, not both' }), { status: 400, headers: corsHeaders })

  let token: string
  try { token = await getUlipToken() } catch (e: any) { return new Response(JSON.stringify({ success: false, error: `ULIP auth failed: ${e.message}` }), { status: 502, headers: corsHeaders }) }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ULIP_TIMEOUT_MS)
    const res = await fetch(ULIP_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ vehiclenumber: vehiclenumber || '', tagid: tagid || '' }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const apiText = await res.text()
    let data: any
    try { data = JSON.parse(apiText) } catch {
      // FASTAG/02 may return a plain string on not-found
      return new Response(JSON.stringify({ success: true, found: false, data: null, raw: apiText.slice(0, 2000) }), { status: 200, headers: corsHeaders })
    }

    if (!res.ok) return new Response(JSON.stringify({ success: false, error: `FASTAG/02 HTTP ${res.status}`, raw: data }), { status: res.status, headers: corsHeaders })

    const inner = data?.[0]?.response ?? data?.response ?? data
    const vehicle = inner?.vehicle ?? inner
    const notFound = vehicle?.errCode === '239'
    const found = !notFound && vehicle && Object.keys(vehicle).length > 0
    return new Response(JSON.stringify({ success: true, found: !!found, data: found ? vehicle : null, raw: data }), { status: 200, headers: corsHeaders })
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError'
    return new Response(JSON.stringify({ success: false, error: isTimeout ? 'Request timed out' : `Unreachable: ${err.message}` }), { status: 502, headers: corsHeaders })
  }
})
