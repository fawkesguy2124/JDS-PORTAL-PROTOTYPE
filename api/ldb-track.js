export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  }

  const { searchParams } = new URL(req.url)
  const cntrNo = (searchParams.get('cntrNo') || '').trim().toUpperCase()

  if (!cntrNo || cntrNo.length < 4) {
    return new Response(JSON.stringify({ error: 'Missing or invalid cntrNo', status: 'INVALID_TRACKING_RESPONSE' }), { status: 400, headers: corsHeaders })
  }

  if (!/^[A-Z0-9]+$/.test(cntrNo)) {
    return new Response(JSON.stringify({ error: 'Invalid characters', status: 'INVALID_TRACKING_RESPONSE' }), { status: 400, headers: corsHeaders })
  }

  const ldbUrl = `https://ldb.co.in/api/ldb/container/search?cntrNo=${encodeURIComponent(cntrNo)}&searchType=39`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 9000)

    const ldbRes = await fetch(ldbUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    let data
    try {
      data = await ldbRes.json()
    } catch {
      return new Response(JSON.stringify({ error: 'LDB returned non-JSON', status: 'INVALID_TRACKING_RESPONSE' }), { status: 502, headers: corsHeaders })
    }

    return new Response(JSON.stringify(data), {
      status: ldbRes.ok ? 200 : ldbRes.status,
      headers: corsHeaders,
    })

  } catch (err) {
    const isTimeout = err.name === 'AbortError'
    return new Response(JSON.stringify({
      error: isTimeout ? 'LDB request timed out' : `LDB unreachable: ${err.message}`,
      status: 'TRACKING_PROVIDER_ERROR',
    }), { status: 502, headers: corsHeaders })
  }
}
