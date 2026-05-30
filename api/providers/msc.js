export async function getMSCTracking(containerNumber) {
  const res = await fetch('https://www.msc.com/api/feature/tools/TrackingInfo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.msc.com/en/track-a-shipment',
    },
    body: JSON.stringify({
      trackingNumber: containerNumber,
      trackingMode: '0'
    })
  })

  if (!res.ok) throw new Error(`MSC returned ${res.status}`)
  const data = await res.json()

  const trackingData = data?.trackingDetails?.[0] || data?.[0] || data
  const events = trackingData?.containers?.[0]?.events || trackingData?.events || []

  const milestones = events.map(e => ({
    description: e.description || e.activityDescription || e.event || '',
    location:    [e.portName, e.countryCode].filter(Boolean).join(', '),
    date:        e.activityDate || e.eventDate || e.date || '',
  })).filter(m => m.description)

  const latest = events[0] || {}
  const vessel = trackingData?.containers?.[0]?.vesselName
    || events.find(e => e.vesselName)?.vesselName || null
  const eta = trackingData?.containers?.[0]?.eta
    || trackingData?.eta || null

  return normalize({
    containerNumber,
    carrier: 'MSC',
    rawStatus: latest.description || latest.activityDescription || 'In Transit',
    currentLocation: [latest.portName, latest.countryCode].filter(Boolean).join(', ') || null,
    vessel,
    voyage: trackingData?.containers?.[0]?.voyageNumber || null,
    eta,
    portIn:    null,
    portOut:   null,
    cfsGateIn: null,
    lastUpdate: latest.activityDate || latest.date || new Date().toISOString(),
    milestones,
  })
}

function normalize(raw) {
  const statusMap = {
    'discharged':    { status: 'arrived',      text: 'Discharged at Port' },
    'gate out':      { status: 'delivered',     text: 'Gate Out' },
    'gate in':       { status: 'at_cfs',        text: 'Gate In at CFS'    },
    'on board':      { status: 'in_transit',    text: 'On Board Vessel'   },
    'loaded':        { status: 'in_transit',    text: 'Loaded on Vessel'  },
    'arrival':       { status: 'arrived',       text: 'Vessel Arrived'    },
    'delivered':     { status: 'delivered',     text: 'Delivered'         },
    'customs':       { status: 'customs_hold',  text: 'Customs Hold'      },
    'examination':   { status: 'customs_hold',  text: 'Under Examination' },
    'ooc':           { status: 'delivered',     text: 'Out of Charge'     },
    'out of charge': { status: 'delivered',     text: 'Out of Charge'     },
  }

  const rawLower = (raw.rawStatus || '').toLowerCase()
  const match    = Object.entries(statusMap).find(([k]) => rawLower.includes(k))
  const status   = match?.[1].status   || 'in_transit'
  const statusText = match?.[1].text   || raw.rawStatus || 'In Transit'

  return {
    containerNumber: raw.containerNumber,
    carrier:         raw.carrier,
    status,
    statusText,
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
