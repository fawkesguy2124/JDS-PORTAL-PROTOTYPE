// Ports, airports and ICDs JDS works with. The code is what Customs/ULIP use.
// "system" tells the portal which port system to ask for port-level data:
// JNPT (Nhava Sheva), MBPT (Mumbai Port), IPORTMAN (other major ports), or none.
export const PORTS = [
  { code: 'INNSA1', name: 'JNPT / Nhava Sheva', system: 'JNPT' },
  { code: 'INBOM1', name: 'Mumbai Port (Ballard Estate)', system: 'MBPT' },
  { code: 'INBOM4', name: 'Mumbai Air Cargo (CSMIA)', system: 'AIR' },
  { code: 'INMUN1', name: 'Mundra', system: 'IPORTMAN' },
  { code: 'INPAV1', name: 'Pipavav', system: 'IPORTMAN' },
  { code: 'INHZA1', name: 'Hazira', system: 'IPORTMAN' },
  { code: 'INIXY1', name: 'Kandla', system: 'IPORTMAN' },
  { code: 'INMAA1', name: 'Chennai', system: 'IPORTMAN' },
  { code: 'INKAT1', name: 'Kattupalli', system: 'IPORTMAN' },
  { code: 'INCCU1', name: 'Kolkata', system: 'IPORTMAN' },
  { code: 'INVTZ1', name: 'Visakhapatnam', system: 'IPORTMAN' },
  { code: 'INCOK1', name: 'Cochin', system: 'IPORTMAN' },
  { code: 'INTUT1', name: 'Tuticorin', system: 'IPORTMAN' },
  { code: 'INMRM1', name: 'Mormugao', system: 'IPORTMAN' },
  { code: 'INNML1', name: 'New Mangalore', system: 'IPORTMAN' },
  { code: 'INPRT1', name: 'Paradip', system: 'IPORTMAN' },
  { code: 'INDEL4', name: 'Delhi Air Cargo', system: 'AIR' },
]

export function portByCode(code) {
  return PORTS.find((p) => p.code === code) || null
}

// Which port system a job's port uses (defaults to JNPT, JDS's main port)
export function portSystem(job) {
  if (!job?.port_code) return job?.mode === 'Air' ? 'AIR' : 'JNPT'
  return portByCode(job.port_code)?.system || 'IPORTMAN'
}

export function portLabel(code) {
  const p = portByCode(code)
  return p ? `${p.name} (${p.code})` : code || '—'
}
