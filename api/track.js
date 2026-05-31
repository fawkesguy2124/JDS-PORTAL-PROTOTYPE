export const config = { runtime: 'nodejs' }

function normalize(raw) {
  const statusMap = {
    'discharged':     { status: 'arrived',      text: 'Discharged at Port' },
    'gate out':       { status: 'delivered',    text: 'Gate Out'           },
    'gate in':        { status: 'at_cfs',       text: 'Gate In at CFS'     },
    'on board':       { status: 'in_transit',   text: 'On Board Vessel'    },
    'loaded':         { status: 'in_transit',   text: 'Loaded on Vessel'   },
    'arrival':        { status: 'arrived',      text: 'Vessel Arrived'     },
    'vessel arrival': { status: 'arrived',      text: 'Vessel Arrived'     },
    'nhava sheva':    { status: 'arrived',      text: 'Arrived at JNPT'    },
    'delivered':      { status: 'delivered',    text: 'Delivered'          },
    'customs':        { status: 'customs_hold', text: 'Customs Hold'       },
    'examination':    { status: 'customs_hold', text: 'Under Examination'  },
    'ooc':            { status: 'delivered',    text: 'Out of Charge'      },
    'out of charge':  { status: 'delivered',    text: 'Out of Charge'      },
  }
  const rawLower   = (raw.rawStatus || '').toLowerCase()
  const match      = Object.entries(statusMap).find(([k]) => rawLower.includes(k))
  const status     = match?.[1].status   || 'in_transit'
  const statusText = match?.[1].text     || raw.rawStatus || 'In Transit'
  return {
    containerNumber: raw.containerNumber,
    carrier:         raw.carrier,
    status, statusText,
    currentLocation: raw.currentLocation || null,
    vessel:          raw.vessel          || null,
    voyage:          raw.voyage          || null,
    eta:             raw.eta             || null,
    portIn:          raw.portIn          || null,
    portOut:         raw.portOut         || null,
    cfsGateIn:       raw.cfsGateIn       || null,
    freeDays:        raw.freeDays        || null,
    lastUpdate:      raw.lastUpdate      || new Date().toISOString(),
    milestones:      (raw.milestones || []).slice(0, 20),
  }
}

async function getONETracking(containerNumber) {
  const HEADERS = {
    'Content-Type':   'application/json',
    'Accept':         'application/json',
    'User-Agent':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer':        'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking',
    'Origin':         'https://ecomm.one-line.com',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
  }

  const searchRes = await fetch(
    'https://ecomm.one-line.com/api/v1/edh/containers/track-and-trace/search',
    {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ containerNo: containerNumber, searchType: 'CN' }),
    }
  )
  if (!searchRes.ok) throw new Error(`ONE search returned ${searchRes.status}`)
  const searchData = await searchRes.json()

  const bookingNo =
    searchData?.data?.bookingNo ||
    searchData?.data?.result?.bookingNo ||
    searchData?.data?.containers?.[0]?.bookingNo ||
    searchData?.bookingNo ||
    searchData?.data?.result?.list?.[0]?.bkgNo ||
    searchData?.data?.list?.[0]?.bkgNo ||
    null

  if (!bookingNo) {
    console.warn('ONE search shape:', JSON.stringify(searchData).slice(0, 800))
    throw new Error('ONE: could not extract booking number. Check Vercel logs.')
  }

  const eventsRes = await fetch(
    `https://ecomm.one-line.com/api/v1/edh/containers/track-and-trace/cop-events?booking_no=${encodeURIComponent(bookingNo)}&container_no=${encodeURIComponent(containerNumber)}`,
    { method: 'GET', headers: HEADERS }
  )
  if (!eventsRes.ok) throw new Error(`ONE cop-events returned ${eventsRes.status}`)
  const eventsData = await eventsRes.json()

  const rawEvents = eventsData?.data?.list || eventsData?.data || eventsData?.list || []
  const milestones = rawEvents.map(e => ({
    description: e.eventName || e.eventNm || '',
    location:    e.location?.locationName
      ? `${e.location.locationName}${e.location.countryName ? ', ' + e.location.countryName : ''}`
      : e.placeNm || '',
    date:   e.eventDate  || e.actDt  || '',
    vessel: e.vessel?.name || null,
    voyage: e.vessel?.voyNo || null,
  })).filter(m => m.description).sort((a, b) => new Date(b.date) - new Date(a.date))

  const latest       = milestones[0] || {}
  const arrivalEvent = rawEvents.find(e => (e.eventName || '').toLowerCase().includes('arrival'))
  const vesselEvent  = rawEvents.find(e => e.vessel?.name)

  return normalize({
    containerNumber,
    carrier:         'ONE',
    rawStatus:       latest.description || 'In Transit',
    currentLocation: latest.location    || null,
    vessel:          vesselEvent?.vessel?.name  || null,
    voyage:          vesselEvent?.vessel?.voyNo || null,
    eta:             arrivalEvent?.eventDate    || null,
    portIn: null, portOut: null, cfsGateIn: null,
    lastUpdate:      latest.date || new Date().toISOString(),
    milestones,
  })
}

async function getMSCTracking(containerNumber) {
  const res = await fetch('https://www.msc.com/api/feature/tools/TrackingInfo', {
    method: 'POST',
    headers: {
      'Content-Type':       'application/json',
      'Accept':             'application/json, text/plain, */*',
      'Accept-Language':    'en-US,en;q=0.9',
      'User-Agent':         'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer':            'https://www.msc.com/en/track-a-shipment',
      'Origin':             'https://www.msc.com',
      'sec-fetch-dest':     'empty',
      'sec-fetch-mode':     'cors',
      'sec-fetch-site':     'same-origin',
    },
    body: JSON.stringify({ trackingNumber: containerNumber, trackingMode: '0' }),
  })
  if (!res.ok) throw new Error(`MSC returned ${res.status}`)
  const data = await res.json()
  const trackingData = data?.trackingDetails?.[0] || data?.[0] || {}
  const events = trackingData?.containers?.[0]?.events || trackingData?.events || []
  const milestones = events.map(e => ({
    description: e.description || e.activityDescription || '',
    location:    [e.portName, e.countryCode].filter(Boolean).join(', '),
    date:        e.activityDate || e.date || '',
  })).filter(m => m.description)
  const latest = events[0] || {}
  return normalize({
    containerNumber, carrier: 'MSC',
    rawStatus:       latest.description || 'In Transit',
    currentLocation: [latest.portName, latest.countryCode].filter(Boolean).join(', ') || null,
    vessel:          trackingData?.containers?.[0]?.vesselName || null,
    voyage:          trackingData?.containers?.[0]?.voyageNumber || null,
    eta:             trackingData?.containers?.[0]?.eta || null,
    portIn: null, portOut: null, cfsGateIn: null,
    lastUpdate: latest.activityDate || new Date().toISOString(),
    milestones,
  })
}

async function getEvergreenTracking(containerNumber) {
  const params = new URLSearchParams({ TYPE: 'CNTR', CNTR: containerNumber })
  const res = await fetch('https://www.evergreen-line.com/servlet/TDB1_CargoTracking.do', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':   'Mozilla/5.0',
      'Referer':      'https://www.evergreen-line.com',
    },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`Evergreen returned ${res.status}`)
  const html = await res.text()
  const milestones = []
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean)
    if (cells.length >= 3 && cells[0].match(/\d{4}/)) {
      milestones.push({ description: cells[1] || '', location: cells[2] || '', date: cells[0] || '' })
    }
  }
  const vesselMatch = html.match(/vessel[^>]*>([^<]+)/i)
  const etaMatch    = html.match(/ETA[^>]*>([^<]+)/i)
  const latest      = milestones[0] || {}
  return normalize({
    containerNumber, carrier: 'Evergreen',
    rawStatus:       latest.description || 'In Transit',
    currentLocation: latest.location    || null,
    vessel:          vesselMatch?.[1]?.trim() || null,
    voyage:          null,
    eta:             etaMatch?.[1]?.trim()   || null,
    portIn: null, portOut: null, cfsGateIn: null,
    lastUpdate: latest.date || new Date().toISOString(),
    milestones,
  })
}

async function getCMACGMTracking(containerNumber) {
  const params = new URLSearchParams({
    'SearchViewModel.SearchBy':   'Container',
    'SearchViewModel.Reference':  containerNumber,
  })
  const res = await fetch('https://www.cma-cgm.com/ebusiness/tracking/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':   'Mozilla/5.0',
      'Referer':      'https://www.cma-cgm.com/ebusiness/tracking',
    },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`CMA CGM returned ${res.status}`)
  const html = await res.text()
  const milestones = []
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean)
    if (cells.length >= 2 && cells[0].match(/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/)) {
      milestones.push({ description: cells[1] || '', location: cells[2] || '', date: cells[0] || '' })
    }
  }
  const latest = milestones[0] || {}
  return normalize({
    containerNumber, carrier: 'CMA-CGM',
    rawStatus:       latest.description || 'In Transit',
    currentLocation: latest.location    || null,
    vessel: null, voyage: null, eta: null,
    portIn: null, portOut: null, cfsGateIn: null,
    lastUpdate: latest.date || new Date().toISOString(),
    milestones,
  })
}

async function getHapagTracking(containerNumber) {
  const res = await fetch(
    `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${containerNumber}`,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' } }
  )
  if (!res.ok) throw new Error(`Hapag returned ${res.status}`)
  const html = await res.text()
  const milestones = []
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean)
    if (cells.length >= 2 && cells[0].match(/\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}/)) {
      milestones.push({ description: cells[1] || '', location: cells[2] || '', date: cells[0] || '' })
    }
  }
  const latest = milestones[0] || {}
  return normalize({
    containerNumber, carrier: 'Hapag-Lloyd',
    rawStatus:       latest.description || 'In Transit',
    currentLocation: latest.location    || null,
    vessel: null, voyage: null, eta: null,
    portIn: null, portOut: null, cfsGateIn: null,
    lastUpdate: latest.date || new Date().toISOString(),
    milestones,
  })
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const container = searchParams.get('container')?.trim().toUpperCase()
  const carrier   = searchParams.get('carrier')?.trim()

  if (!container || !carrier) {
    return new Response(JSON.stringify({ error: 'container and carrier required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    let result
    const c = carrier.toLowerCase()
    if      (c === 'msc')                          result = await getMSCTracking(container)
    else if (c === 'one')                          result = await getONETracking(container)
    else if (c === 'evergreen')                    result = await getEvergreenTracking(container)
    else if (c.includes('cma'))                    result = await getCMACGMTracking(container)
    else if (c.includes('hapag'))                  result = await getHapagTracking(container)
    else throw new Error(`Carrier "${carrier}" not yet supported`)

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (e) {
    console.error('Track error:', e.message)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
}
