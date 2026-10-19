// Where a truck has been, from its saved FASTag answer (no ULIP call here).

// FASTag usually sends each plaza's position. Older saved answers did not keep
// it, so common plazas around Mumbai have an approximate position here.
const KNOWN_PLAZAS = [
  [/khalapur/i, [18.796, 73.292]], [/talegaon|urse/i, [18.736, 73.684]], [/palaspe/i, [18.957, 73.113]],
  [/shedung/i, [18.905, 73.183]], [/kharpada/i, [18.733, 73.106]], [/vashi/i, [19.074, 72.999]], [/airoli/i, [19.152, 72.988]],
  [/mulund/i, [19.172, 72.958]], [/anand ?nagar|kharegaon|thane/i, [19.198, 72.983]], [/dahisar/i, [19.261, 72.868]],
  [/khaniwade/i, [19.470, 72.889]], [/charoti/i, [19.889, 72.921]], [/bhilad|bhilaad/i, [20.271, 72.902]], [/boriach/i, [20.749, 72.926]],
  [/chalthan|kamrej/i, [21.233, 72.981]], [/padgha/i, [19.364, 73.188]], [/ghoti/i, [19.711, 73.628]], [/pimpalgaon/i, [20.165, 73.991]],
  [/chandwad/i, [20.330, 74.247]], [/khed ?shivapur/i, [18.316, 73.865]], [/anewadi/i, [17.791, 73.988]], [/chikhali|kalamboli|panvel/i, [19.016, 73.105]],
]
const knownPos = (plaza) => KNOWN_PLAZAS.find(([re]) => re.test(String(plaza || '')))?.[1] || null

const sameNo = (a, b) => !!a && !!b && String(a).toUpperCase().replace(/\s+/g, '') === String(b).toUpperCase().replace(/\s+/g, '')

// Saved toll crossings of one of the job's trucks (the first if none named),
// oldest first, each with a position or null
export function truckPoints(job, j, results, truckNo = job.truck_no) {
  const row = [].concat(results?.['FASTAG/01'] || []).filter(Boolean).find((r) => sameNo(r.params?.vehiclenumber, truckNo))
  const extra = row?.parsed?.found ? row.parsed.extra : null
  let pts = []
  if (extra?.points?.length) {
    pts = extra.points.map((p) => ({ plaza: p.plaza, at: p.at, pos: p.pos || knownPos(p.plaza), approx: !p.pos }))
  } else if (row?.parsed?.found) {
    pts = (row.parsed.tables?.[0]?.rows || []).filter((r) => r?.[0]).map((r) => ({ plaza: r[0], at: r[1] || '', pos: knownPos(r[0]), approx: true }))
  } else if (j?.truckLocation && sameNo(j.truckLocation.truck || job.truck_no, truckNo)) {
    pts = [{ plaza: j.truckLocation.plaza, at: j.truckLocation.at, pos: knownPos(j.truckLocation.plaza), approx: true }]
  }
  return pts.reverse() // newest first in the answer → oldest first for the route
}

