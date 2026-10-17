const ULIP_LOGIN_URL = 'http://13.200.155.29:3000/ulip/v1.0.0/user/login'
const ULIP_TIMEOUT_MS = 12000
const ULIP_PROXY_KEY = Deno.env.get('ULIP_PROXY_KEY') ?? ''

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const username = Deno.env.get('ULIP_USERNAME')
  const password = Deno.env.get('ULIP_PASSWORD')

  if (!username || !password) {
    return new Response(
      JSON.stringify({ success: false, error: 'ULIP credentials not configured on the server' }),
      { status: 500, headers: corsHeaders },
    )
  }

  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), ULIP_TIMEOUT_MS)

    const res = await fetch(ULIP_LOGIN_URL, {
      method: 'POST',
      headers: {'x-proxy-key': ULIP_PROXY_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    let data
    try {
      data = await res.json()
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'ULIP returned non-JSON response' }),
        { status: 502, headers: corsHeaders },
      )
    }

    if (!res.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `ULIP login HTTP ${res.status}`, raw: data }),
        { status: res.status, headers: corsHeaders },
      )
    }

    // ULIP token — response shape: { response: { id, token }, error, code, message }
    const token = data?.response?.id || data?.response?.token || data?.data?.token || data?.token || null

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'No token in ULIP response', raw: data }),
        { status: 502, headers: corsHeaders },
      )
    }

    return new Response(
      JSON.stringify({ success: true, token }),
      { status: 200, headers: corsHeaders },
    )
  } catch (err) {
    const isTimeout = err.name === 'AbortError'
    return new Response(
      JSON.stringify({ success: false, error: isTimeout ? 'ULIP login timed out' : `ULIP unreachable: ${err.message}` }),
      { status: 502, headers: corsHeaders },
    )
  }
})
