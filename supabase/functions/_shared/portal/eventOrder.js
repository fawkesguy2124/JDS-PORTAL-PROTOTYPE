// Some CFS systems report "CFS IN" and "CFS OUT" with the labels reversed
// (OUT a few hours after the port, IN days later). This puts them right, but
// ONLY in the clear-cut case, and never changes the saved data:
//   - exactly one CFS/ICD IN and one CFS/ICD OUT
//   - both at the same CFS
//   - the OUT comes before the IN
//   - no later port / CFS / ICD / terminal / gate event (so it is not a
//     container that went back for a second trip)
// Anything else is left exactly as reported.

const IN = ['CFS IN', 'CFS GATE IN', 'ICD IN', 'ICD GATE IN']
const OUT = ['CFS OUT', 'CFS GATE OUT', 'ICD OUT', 'ICD GATE OUT']
const name = (m) => String(m?.description || '').toUpperCase().trim()
const place = (m) => String(m?.location || '').toUpperCase().replace(/\s+/g, ' ').trim()
const time = (m) => (m?.date ? new Date(m.date).getTime() : NaN)

export function fixCfsOrder(milestones) {
  const ms = Array.isArray(milestones) ? milestones : []
  const ins = ms.filter((m) => IN.includes(name(m)))
  const outs = ms.filter((m) => OUT.includes(name(m)))
  const no = { milestones: ms, swapped: false }
  if (ins.length !== 1 || outs.length !== 1) return no
  const [i] = ins
  const [o] = outs
  if (!(time(o) < time(i))) return no
  if (!place(i) || place(i) !== place(o)) return no
  const later = ms.some((m) => m !== i && m !== o && time(m) > time(i) && /PORT|ICD|CFS|TERMINAL|GATE/.test(name(m)))
  if (later) return no
  const fixed = ms.map((m) => (m === o ? { ...m, description: i.description, corrected: true }
    : m === i ? { ...m, description: o.description, corrected: true } : m))
  return { milestones: fixed, swapped: true, gateIn: o.date, gateOut: i.date, outName: o.description }
}

// Tracking entry as the Containers screen keeps it (camelCase)
export function correctTracking(t) {
  if (!t || t.cfsOrderCorrected) return t
  const r = fixCfsOrder(t.milestones)
  if (!r.swapped) return t
  return { ...t, milestones: r.milestones, cfsGateIn: r.gateIn, status: 'delivered', statusText: r.outName, cfsOrderCorrected: true }
}

// container_tracking row as stored in the database (snake_case)
export function correctTrackingRow(row) {
  if (!row || row.cfs_order_corrected) return row
  const r = fixCfsOrder(row.milestones)
  if (!r.swapped) return row
  return { ...row, milestones: r.milestones, cfs_gate_in: r.gateIn, status: 'delivered', status_text: r.outName, cfs_order_corrected: true }
}
