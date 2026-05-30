export async function getEvergreenTracking(containerNumber) {
  const params = new URLSearchParams({ TYPE: 'CNTR', CNTR: containerNumber })

  const res = await fetch(
    'https://www.evergreen-line.com/servlet/TDB1_CargoTracking.do',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.evergreen-line.com',
      },
      body: params.toString()
    }
  )
  if (!res.ok) throw new Error(`Evergreen returned ${res.status}`)
  const html = await res.text()

  const milestones = []
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
    if (cells.length >= 3 && cells[0].match(/\d{4}/)) {
      milestones.push({
        description: cells[1] || '',
        location:    cells[2] || '',
        date:        cells[0] || '',
      })
    }
  }

  const vesselMatch = html.match(/vessel[^>]*>([^<]+)/i)
  const etaMatch    = html.match(/ETA[^>]*>([^<]+)/i)
  const statusMatch = html.match(/status[^>]*>([^<]+)/i)

  return normalize({
    containerNumber,
    carrier: 'Evergreen',
    rawStatus: statusMatch?.[1]?.trim() || milestones[0]?.description || 'In Transit',
    currentLocation: milestones[0]?.location || null,
    vessel:    vesselMatch?.[1]?.trim() || null,
    voyage:    null,
    eta:       etaMatch?.[1]?.trim() || null,
    portIn:    null,
    portOut:   null,
    cfsGateIn: null,
    lastUpdate: milestones[0]?.date || new Date().toISOString(),
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
