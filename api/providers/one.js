export async function getONETracking(containerNumber) {
  const searchRes = await fetch(
    'https://ecomm.one-line.com/api/v1/edh/containers/track-and-trace/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ containerNo: containerNumber })
    }
  )
  if (!searchRes.ok) throw new Error(`ONE search returned ${searchRes.status}`)
  const searchData = await searchRes.json()

  const container = searchData?.data?.[0] || searchData?.[0] || {}
  const events    = container?.events || container?.movements || []

  const milestones = events.map(e => ({
    description: e.statusName || e.description || e.event || '',
    location:    e.portName || e.location || '',
    date:        e.eventDate || e.date || '',
  })).filter(m => m.description)

  const latest = events[0] || {}

  return normalize({
    containerNumber,
    carrier: 'ONE',
    rawStatus: container.statusName || latest.statusName || 'In Transit',
    currentLocation: container.podName || latest.portName || null,
    vessel:    container.vesselName || null,
    voyage:    container.voyageNo   || null,
    eta:       container.eta        || null,
    portIn:    null,
    portOut:   null,
    cfsGateIn: null,
    lastUpdate: latest.eventDate || new Date().toISOString(),
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
