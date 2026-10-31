// Works out what a typed number looks like and which checks to offer.
// Pure: no network, no React. detectNumberType('MSKU1234567').kind === 'container'

const mk = (api, title, description, button, key, value) => ({
  api, title, description, button, defaults: { [key]: () => value },
})

export function cleanNumber(raw) {
  return String(raw || '').trim().toUpperCase()
}

export function detectNumberType(raw) {
  const text = cleanNumber(raw)
  if (!text) return { kind: 'empty', label: '', checks: [], also: [] }
  const compact = text.replace(/[\s-]/g, '')
  const digits = /^\d+$/.test(compact)

  if (/^[A-Z]{4}\d{7}$/.test(compact)) {
    return {
      kind: 'container', label: 'Looks like a container number', checks: [
        mk('LDB/01', 'Container tracking', 'Where is this container, and what is its status?', 'Track container', 'containerNumber', compact),
      ], also: [],
    }
  }
  if (/^[A-Z]{2}\d{13,14}$/.test(compact)) {
    return {
      kind: 'licence', label: 'Looks like a driving licence number', checks: [
        mk('SARATHI/02', 'Driver licence', 'Is the licence valid for driving a truck?', 'Check licence', 'dlnumber', compact),
      ], also: [],
    }
  }
  if (/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(compact) || /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(compact)) {
    return {
      kind: 'truck', label: 'Looks like a truck number', checks: [
        mk('FASTAG/01', 'Where is the truck?', 'Last toll crossings seen for this truck.', 'Find truck', 'vehiclenumber', compact),
        mk('VAHAN/04', 'Truck registration, fitness and insurance', 'Are the truck papers in order?', 'Check truck papers', 'vehiclenumber', compact),
        mk('ECHALLAN/01', 'Pending traffic fines', 'Any unpaid fines on this truck?', 'Check fines', 'vehicleNumber', compact),
      ], also: [],
    }
  }
  if (digits && compact.length === 7) {
    return {
      kind: 'be7', label: 'Looks like a Bill of Entry or shipping bill number (7 digits)', checks: [
        mk('ICEGATE/03', 'Out of charge from Customs', 'Has Customs given out-of-charge? Needs the BE date.', 'Check OOC', 'beNo', compact),
        mk('ICEGATE/06', 'Let Export Order (LEO)', 'For a shipping bill: has the Let Export Order been given? Needs the date.', 'Check LEO', 'sbNo', compact),
      ], also: [],
    }
  }
  if (digits && compact.length === 8) {
    return {
      kind: 'hs', label: 'Looks like an HS (tariff) code', checks: [
        mk('DGFT/02', 'HS code details', 'What goods does this tariff code cover?', 'Check HS code', 'itchs', compact),
      ], also: [],
    }
  }
  if (digits && compact.length === 10) {
    return {
      kind: 'iec', label: 'Looks like an IEC (import-export code)', checks: [
        mk('DGFT/01', 'IEC details', 'Is this import-export code valid, and whose is it?', 'Check IEC', 'iecnumber', compact),
      ], also: [],
    }
  }
  if (digits && compact.length === 11) {
    return {
      kind: 'awb', label: 'Looks like an airway bill number', checks: [
        mk('ACMES/02', 'Import cargo at air terminal', 'Is the cargo at the terminal, and what is its status?', 'Check import cargo', 'awbnumber', compact),
        mk('ACMES/01', 'Export cargo at air terminal', 'Same, for cargo being exported.', 'Check export cargo', 'awbnumber', compact),
      ],
      also: compact.startsWith('2') ? [
        mk('FOIS/01', 'Railway consignment (FNR)', 'Where is this railway consignment?', 'Track by rail', 'fnrnumber', compact),
      ] : [],
    }
  }
  if (digits && compact.length === 12) {
    return {
      kind: 'ewb', label: 'Looks like an e-way bill number', checks: [
        mk('EWAYBILL/01', 'E-way bill', 'Is this e-way bill valid, and for which truck?', 'Check e-way bill', 'ewbNo', compact),
      ], also: [],
    }
  }
  return { kind: 'unknown', label: 'Not sure what this number is', checks: [], also: [] }
}

// Our own jobs: case-insensitive "contains" on the usual number fields.
export function jobMatches(job, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return false
  const fields = [job.job_no, job.client, job.bl_no, job.be_no, job.containers, job.truck_no]
  for (const f of fields) if (f !== null && f !== undefined && String(f).toLowerCase().includes(q)) return true
  const refs = job.ulip_refs
  if (refs && typeof refs === 'object') {
    for (const v of Object.values(refs)) if (v !== null && v !== undefined && String(v).toLowerCase().includes(q)) return true
  }
  return false
}

// A job may be attached to a check only when the number is an EXACT match on
// the field that fits the detected type. Anything else returns false.
export function jobExactlyMatches(job, kind, raw) {
  const n = cleanNumber(raw).replace(/[\s-]/g, '')
  if (!job || !n) return false
  const digitsOf = (v) => String(v || '').replace(/\D/g, '')
  if (kind === 'container') {
    return String(job.containers || '').split(/[\s,;/]+/).some((c) => c.trim().toUpperCase() === n)
  }
  if (kind === 'truck') return String(job.truck_no || '').toUpperCase().replace(/[\s-]/g, '') === n
  if (kind === 'be7') return String(job.be_no || '').trim() === n || String(job.ulip_refs?.sb_no || '').trim() === n
  if (kind === 'awb') return job.mode === 'Air' && digitsOf(job.bl_no) === n
  return false
}
