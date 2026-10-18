const LDB_BASE_URL   = 'https://ldb.co.in/api/ldb/container/search'
const LDB_TIMEOUT_MS = 9000

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let cntrNo = ''
  try {
    if (req.method === 'POST') {
      const body = await req.json()
      cntrNo = (body?.cntrNo || '').trim().toUpperCase()
    } else {
      const url = new URL(req.url)
      cntrNo = (url.searchParams.get('cntrNo') || '').trim().toUpperCase()
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body', status: 'INVALID_TRACKING_RESPONSE' }),
      { status: 400, headers: corsHeaders },
    )
  }

  if (!cntrNo || cntrNo.length < 4) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid cntrNo', status: 'INVALID_TRACKING_RESPONSE' }),
      { status: 400, headers: corsHeaders },
    )
  }

  if (!/^[A-Z0-9]+$/.test(cntrNo)) {
    return new Response(
      JSON.stringify({ error: 'Invalid characters in cntrNo', status: 'INVALID_TRACKING_RESPONSE' }),
      { status: 400, headers: corsHeaders },
    )
  }

  const ldbUrl = `${LDB_BASE_URL}?cntrNo=${encodeURIComponent(cntrNo)}&searchType=39`

  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), LDB_TIMEOUT_MS)

    const ldbRes = await fetch(ldbUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    let data
    try {
      data = await ldbRes.json()
    } catch {
      return new Response(
        JSON.stringify({ error: 'LDB returned non-JSON response', status: 'INVALID_TRACKING_RESPONSE' }),
        { status: 502, headers: corsHeaders },
      )
    }

    // "No Record Found" is an answer (LDB has no events for this box yet), not an outage
    const notFound = ldbRes.status === 404 || /no record found/i.test(JSON.stringify(data?.message ?? data?.result ?? ''))
    if (notFound) {
      return new Response(JSON.stringify({ result: 'No Record Found' }), { status: 200, headers: corsHeaders })
    }

    return new Response(JSON.stringify(data), {
      status: ldbRes.ok ? 200 : ldbRes.status,
      headers: corsHeaders,
    })
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError'
    return new Response(
      JSON.stringify({
        error: isTimeout ? 'LDB request timed out' : `LDB unreachable: ${err.message}`,
        status: 'TRACKING_PROVIDER_ERROR',
      }),
      { status: 502, headers: corsHeaders },
    )
  }
})
