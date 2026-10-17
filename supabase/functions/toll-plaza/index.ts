const ULIP_LOGIN_URL = 'http://13.200.155.29:3000/ulip/v1.0.0/user/login'
const ULIP_API_URL   = 'http://13.200.155.29:3000/ulip/v1.0.0/TOLL/01'
const ULIP_TIMEOUT_MS = 12000

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getUlipToken(): Promise<string> {
  const u = Deno.env.get('ULIP_USERNAME'), p = Deno.env.get('ULIP_PASSWORD')
  if (!u || !p) throw new Error('ULIP credentials not configured')
  const c = new AbortController(), t = setTimeout(() => c.abort(), ULIP_TIMEOUT_MS)
  const r = await fetch(ULIP_LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username: u, password: p }),
    signal: c.signal,
  })
  clearTimeout(t)
  if (!r.ok) { let b = ''; try { b = await r.text() } catch {} throw new Error(`ULIP login failed HTTP ${r.status}: ${b}`) }
  const d = await r.json()
  const tk = d?.response?.id || d?.response?.token || d?.data?.token || d?.token || null
  if (!tk) throw new Error('No token in ULIP login response')
  return tk
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let tollCode = '', tollName = '', stateName = ''
  try {
    const b = await req.json()
    tollCode  = (b?.tollCode  || '').trim()
    tollName  = (b?.tollName  || '').trim()
    stateName = (b?.stateName || '').trim()
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), { status: 400, headers: corsHeaders })
  }

  const provided = [tollCode, tollName, stateName].filter(v => v.length > 0)
  if (provided.length === 0) {
    return new Response(JSON.stringify({ success: false, error: 'Provide one of: tollCode, tollName, or stateName' }), { status: 400, headers: corsHeaders })
  }
  if (provided.length > 1) {
    return new Response(JSON.stringify({ success: false, error: 'Only one of tollCode, tollName, or stateName may be provided per request' }), { status: 400, headers: corsHeaders })
  }

  if (tollCode  && !/^\d{1,7}$/.test(tollCode))   return new Response(JSON.stringify({ success: false, error: 'tollCode must be 1-7 digits' }), { status: 400, headers: corsHeaders })
  if (tollName  && tollName.length  > 200) return new Response(JSON.stringify({ success: false, error: 'tollName max 200 chars' }), { status: 400, headers: corsHeaders })
  if (stateName && stateName.length > 200) return new Response(JSON.stringify({ success: false, error: 'stateName max 200 chars' }), { status: 400, headers: corsHeaders })

  let token: string
  try { token = await getUlipToken() } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: `Auth failed: ${e.message}` }), { status: 502, headers: corsHeaders })
  }

  try {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ULIP_TIMEOUT_MS)
    const res = await fetch(ULIP_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ tollCode: tollCode || '', tollName: tollName || '', stateName: stateName || '' }),
      signal: c.signal,
    })
    clearTimeout(t)

    const txt = await res.text()
    let raw: any
    try { raw = JSON.parse(txt) } catch {
      return new Response(JSON.stringify({ success: false, found: false, error: 'Non-JSON response', httpStatus: res.status, rawResponse: txt.slice(0, 2000) }), { status: 200, headers: corsHeaders })
    }

    if (!res.ok) return new Response(JSON.stringify({ success: false, error: `HTTP ${res.status}`, raw }), { status: res.status, headers: corsHeaders })

    const notFound = raw?.response?.[0]?.responseStatus === 'ERROR'
    if (notFound) {
      return new Response(JSON.stringify({ success: true, found: false, data: null, raw }), { status: 200, headers: corsHeaders })
    }

    const records = raw?.response?.[0]?.response ?? []
    const found = Array.isArray(records) && records.length > 0

    const normalized = found ? records.map((r: any) => ({
      tollCode:               r?.tollCode,
      tollName:               r?.tollName,
      stateName:              r?.stateName,
      ro:                     r?.ro,
      piu:                    r?.piu,
      latitude:               r?.latitude,
      longitude:              r?.longitude,
      dtEffectiveRates:       r?.dtEffectiveRates,
      dtRateRevision:         r?.dtRateRevision,
      carRateSingle:          r?.carRateSingle,
      carRateMulti:           r?.carRateMulti,
      carRateMth:             r?.carRateMth,
      carRateCommReg:         r?.carRateCommReg,
      lcvRateSingle:          r?.lcvRateSingle,
      lcvRateMulti:           r?.lcvRateMulti,
      lcvRateMth:             r?.lcvRateMth,
      lcvRateCommReg:         r?.lcvRateCommReg,
      busRateSingle:          r?.busRateSingle,
      busRateMulti:           r?.busRateMulti,
      busRateMth:             r?.busRateMth,
      busRateCommReg:         r?.busRateCommReg,
      multiAxlerateSingle:    r?.multiAxlerateSingle,
      multiAxlerateMulti:     r?.multiAxlerateMulti,
      multiAxlerateMth:       r?.multiAxlerateMth,
      multiAxlerateCommReg:   r?.multiAxlerateCommReg,
      fourToSixExelSingle:    r?.fourToSixExelSingle,
      fourToSixExelReturn:    r?.fourToSixExelReturn,
      fourToSixExelMonthly:   r?.fourToSixExelMonthly,
      fourToSixExelCommReg:   r?.fourToSixExelCommReg,
      sevenOrMoreExelSingle:  r?.sevenOrMoreExelSingle,
      sevenOrMoreExelReturn:  r?.sevenOrMoreExelReturn,
      sevenOrMoreExelMonthly: r?.sevenOrMoreExelMonthly,
      sevenOrMoreExelCommReg: r?.sevenOrMoreExelCommReg,
      hcmEmeSingle:           r?.hcmEmeSingle,
      hcmEmeReturn:           r?.hcmEmeReturn,
      hcmEmeMonthly:          r?.hcmEmeMonthly,
      hcmEmeCommReg:          r?.hcmEmeCommReg,
    })) : []

    return new Response(
      JSON.stringify({ success: true, found, data: found ? normalized : null, raw }),
      { status: 200, headers: corsHeaders }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.name === 'AbortError' ? 'Timeout' : `Unreachable: ${err.message}` }),
      { status: 502, headers: corsHeaders }
    )
  }
})