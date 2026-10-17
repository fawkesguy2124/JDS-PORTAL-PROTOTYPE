const ULIP_LOGIN_URL  = 'http://13.200.155.29:3000/ulip/v1.0.0/user/login'
const ULIP_JNPT02_URL = 'http://13.200.155.29:3000/ulip/v1.0.0/JNPT/02'
const ULIP_TIMEOUT_MS = 12000

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Inline token helper — do NOT import from ulip-auth (each function is self-contained)
async function getUlipToken(): Promise<string> {
  const username = Deno.env.get('ULIP_USERNAME')
  const password = Deno.env.get('ULIP_PASSWORD')
  if (!username || !password) throw new Error('ULIP credentials not configured on the server')

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), ULIP_TIMEOUT_MS)

  const res = await fetch(ULIP_LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ username, password }),
    signal: controller.signal,
  })
  clearTimeout(timeout)

  if (!res.ok) {
    let body = ''
    try { body = await res.text() } catch {}
    throw new Error(`ULIP login failed HTTP ${res.status}: ${body}`)
  }

  const data = await res.json()
  // ULIP token — response shape: { response: { id, token }, error, code, message }
  const token = data?.response?.id || data?.response?.token || data?.data?.token || data?.token || null
  if (!token) throw new Error('No token in ULIP login response')
  return token
}

function normaliseBEStatus(raw: any, requestedBeNo: string) {
  // ULIP JNPT/02 response — records nested under [0].response or .response
  const records = raw?.[0]?.response ?? raw?.response ?? raw?.data?.response ?? []
  const first = Array.isArray(records) ? records[0] : records

  if (!first || typeof first !== 'object') {
    return {
      beNumber: requestedBeNo,
      beDate: null, igmNumber: null, igmDate: null, chaCode: null,
      oocDate: null, oocNumber: null, doDate: null, doNumber: null,
      blNumber: null, importerName: null, importerAddress: null,
      goodsDesc: null, cargoType: null, natureOfCargo: null, countryOfOrigin: null,
      modeOfTransport: null, surveyDate: null, surveyorCode: null,
      lineNo: null, subLineNo: null, noOfPackages: null, typeOfPackages: null,
      marksNo: null, vehicleNumbers: [],
    }
  }

  const vehicleInfo = first['Vehicle Info'] ?? first['vehicleInfo'] ?? []
  const vehicleNumbers = (Array.isArray(vehicleInfo) ? vehicleInfo : [])
    .map((v: any) => v['Vehicle Number'] || v['vehicleNum'] || v?.vehNum || '')
    .filter(Boolean)

  return {
    beNumber:        first['Be No']              ?? requestedBeNo,
    beDate:          first['Be Date']            ?? null,
    igmNumber:       first['IGM NO']             ?? null,
    igmDate:         first['IGM Date']           ?? null,
    chaCode:         first['CHA Code']           ?? null,
    oocDate:         first['Out of Charge Date'] ?? null,
    oocNumber:       first['Out of Charge No']   ?? null,
    doDate:          first['DO Date']            ?? null,
    doNumber:        first['Delivery Oder No']   ?? null,
    blNumber:        first['BL No']              ?? null,
    importerName:    first['Importer Name']      ?? null,
    importerAddress: first['Importer Address']   ?? null,
    goodsDesc:       first['Goods Description']  ?? null,
    cargoType:       first['Cargo Type']         ?? null,
    natureOfCargo:   first['Nature of Cargo']    ?? null,
    countryOfOrigin: first['Country of Origin']  ?? null,
    modeOfTransport: first['Mode of Transport']  ?? null,
    surveyDate:      first['Survey Date']        ?? null,
    surveyorCode:    first['Surveyor Code']      ?? null,
    lineNo:          first['Line No']            ?? null,
    subLineNo:       first['Sub Line No']        ?? null,
    noOfPackages:    first['No of Packages Qty'] ?? null,
    typeOfPackages:  first['Type of Packages']   ?? null,
    marksNo:         first['Marks No']           ?? null,
    vehicleNumbers,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let beNumber = ''
  try {
    if (req.method === 'POST') {
      const body = await req.json()
      beNumber = (body?.beNumber || '').trim()
    } else {
      const url = new URL(req.url)
      beNumber = (url.searchParams.get('beNumber') || '').trim()
    }
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid request body' }),
      { status: 400, headers: corsHeaders },
    )
  }

  // beNo must be exactly 7 alphanumeric characters
  if (!beNumber || !/^[a-zA-Z0-9]{7}$/.test(beNumber)) {
    return new Response(
      JSON.stringify({ success: false, error: 'beNo must be exactly 7 alphanumeric characters' }),
      { status: 400, headers: corsHeaders },
    )
  }

  // Step 1 — get a fresh ULIP token
  let token: string
  try {
    token = await getUlipToken()
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: `ULIP auth failed: ${err.message}` }),
      { status: 502, headers: corsHeaders },
    )
  }

  // Step 2 — call JNPT/02
  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), ULIP_TIMEOUT_MS)

    const res = await fetch(ULIP_JNPT02_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ beNo: beNumber }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    let data
    const apiText = await res.text()
    try {
      data = JSON.parse(apiText)
    } catch {
      // Return raw text so we can see what ULIP is actually sending back
      return new Response(
        JSON.stringify({
          success: false,
          error: 'JNPT/02 returned non-JSON response',
          httpStatus: res.status,
          rawResponse: apiText.slice(0, 2000),
        }),
        { status: 200, headers: corsHeaders },
      )
    }

    if (!res.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `JNPT/02 HTTP ${res.status}`, raw: data }),
        { status: res.status, headers: corsHeaders },
      )
    }

    const normalised = normaliseBEStatus(data, beNumber)

    return new Response(
      JSON.stringify({ success: true, data: normalised, raw: data }),
      { status: 200, headers: corsHeaders },
    )
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError'
    return new Response(
      JSON.stringify({ success: false, error: isTimeout ? 'JNPT/02 request timed out' : `JNPT/02 unreachable: ${err.message}` }),
      { status: 502, headers: corsHeaders },
    )
  }
})
