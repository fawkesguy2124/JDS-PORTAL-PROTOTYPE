// Port APIs: JNPT (Nhava Sheva), MBPT (Mumbai Port), IPORTMAN (other major ports).
// Spec: docs/ulip-specs/PORTS.md
import type { ApiDef, InputDef, Parsed, Table } from './types.ts'
import { field, filled, payloadOf, text } from './helpers.ts'

// ---------- small local helpers ----------

// compare keys ignoring case, spaces, underscores, dots and trailing spaces
const nk = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function isEmptyVal(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0
  return v === null || v === undefined || (typeof v === 'string' && (v.trim() === '' || v.trim().toLowerCase() === 'null'))
}

// first non-empty value among the given key spellings (priority = order given)
function g(o: any, ...names: string[]): any {
  if (!o || typeof o !== 'object') return null
  const keys = Object.keys(o)
  for (const n of names) {
    const w = nk(n)
    for (const k of keys) if (nk(k) === w && !isEmptyVal(o[k])) return o[k]
  }
  return null
}

type DT = { y: string; m: string; d: string; time: string }
function parseDt(v: unknown): DT | null {
  const s = text(v)
  if (!s) return null
  const p2 = (x: string) => x.padStart(2, '0')
  let r = s.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (r) return { d: r[1], m: r[2], y: r[3], time: '' }
  r = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[: T](\d{1,2}):(\d{2}))?/)
  if (r) return { d: p2(r[1]), m: p2(r[2]), y: r[3], time: r[4] ? `${p2(r[4])}:${r[5]}` : '' }
  r = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (r) return { y: r[1], m: r[2], d: r[3], time: r[4] ? `${r[4]}:${r[5]}` : '' }
  return null
}

// nice text such as "12 Oct 2026, 14:30" (a 00:00 time is dropped)
function pretty(v: unknown): string | null {
  const s = text(v)
  if (!s) return null
  const p = parseDt(v)
  if (!p) return s
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p.m - 1]
  if (!m) return s
  const time = p.time && p.time !== '00:00' ? `, ${p.time}` : ''
  return `${Number(p.d)} ${m} ${p.y}${time}`
}

// plain ISO date yyyy-mm-dd
function iso(v: unknown): string | null {
  const p = parseDt(v)
  return p ? `${p.y}-${p.m}-${p.d}` : null
}

// ISO with time (yyyy-mm-ddTHH:MM) when a real time is present, else the plain date
function isoAt(v: unknown): string | null {
  const p = parseDt(v)
  if (!p) return null
  return `${p.y}-${p.m}-${p.d}${p.time && p.time !== '00:00' ? `T${p.time}` : ''}`
}

const F = (label: string, v: unknown) => field(label, v)
const D = (label: string, v: unknown) => field(label, pretty(v))

function bad(summary: string): Parsed {
  return { found: false, tone: 'bad', summary, fields: [] }
}
function notFound(summary = 'No record found for this number.'): Parsed {
  return { found: false, tone: 'warn', summary, fields: [] }
}

// Handles the shapes shared by every port API. Returns a Parsed when we can already answer.
function early(body: any): Parsed | null {
  const p = payloadOf(body)
  if (typeof p === 'string') return bad(p.trim() ? `The port system said: ${p.trim()}` : 'The port system sent an empty answer.')
  if (p === null || p === undefined) {
    if (body && typeof body === 'object' && String(body.error) === 'true') {
      return bad(`ULIP rejected this request${text(body.message) ? `: ${text(body.message)}` : '.'}`)
    }
    return notFound()
  }
  return null
}

// ---------- vehicles ----------

type Truck = { no: string; permit: string | null; inTime: string | null; outTime: string | null }

function trucksOf(rec: any): Truck[] {
  const raw = g(rec, 'Vehicle Info', 'vehicle_info', 'vehicleInfo')
  const list = Array.isArray(raw) ? raw : []
  const out: Truck[] = []
  for (const v of list) {
    if (typeof v === 'string' || typeof v === 'number') {
      const no = text(v)
      if (no) out.push({ no, permit: null, inTime: null, outTime: null })
      continue
    }
    if (!v || typeof v !== 'object') continue
    const no = text(g(v, 'Vehicle Number', 'VEHICLE_NUMBER', 'vehicleNum', 'vehNum'))
    if (!no) continue
    out.push({
      no,
      permit: text(g(v, 'Truck Entry Permit No', 'TRUCK_ENTRY_PERMIT_NO')),
      inTime: pretty(g(v, 'Truck Entry Time', 'TRUCK_ENTRY_TIME')),
      outTime: pretty(g(v, 'Truck Exit Time', 'TRUCK_EXIT_TIME')),
    })
  }
  return out
}

function truckTable(trucks: Truck[]): Table[] {
  if (!trucks.length) return []
  const hasPermit = trucks.some((t) => t.permit)
  return [{
    title: 'Trucks',
    columns: hasPermit ? ['Truck number', 'Entry permit', 'Gate in', 'Gate out'] : ['Truck number', 'Gate in', 'Gate out'],
    rows: trucks.map((t) => hasPermit ? [t.no, t.permit, t.inTime, t.outTime] : [t.no, t.inTime, t.outTime]),
  }]
}

const uniq = (a: string[]) => [...new Set(a)]

// ---------- vessel (01) ----------

const VCN: InputDef = { key: 'vcnNo', label: 'Vessel call number (VCN)', pattern: /^[a-zA-Z0-9]{2,14}$/, hint: '2 to 14 letters or digits, like M7264', upper: true }
const PORT_CODE: InputDef = { key: 'portCode', label: 'Port code', pattern: /^[A-Z0-9]{5,6}$/, hint: 'Port code like INMUN1', upper: true }

function appType(v: unknown): string | null {
  const s = text(v)
  if (!s) return null
  const u = s.toUpperCase()
  if (u === 'I') return 'Import'
  if (u === 'E') return 'Export'
  return s
}

function vesselFrom(rec: any, portName: string, usePortFromAnswer: boolean): Parsed {
  const name = text(g(rec, 'Vessel Name'))
  const vcn = text(g(rec, 'VCN No', 'VIA_NO'))
  const ata = g(rec, 'ATA')
  const eta = g(rec, 'ETA')
  const atd = g(rec, 'ATD')
  const etd = g(rec, 'ETD')
  if (!name && !vcn && !ata && !eta) return notFound('No vessel found for this number.')
  const port = (usePortFromAnswer ? text(g(rec, 'Port Of Arrival Name')) : null) ?? portName
  const who = name ? `Vessel ${name}` : `Vessel ${vcn ?? ''}`.trim()
  let summary: string
  let tone: Parsed['tone']
  if (atd) {
    summary = `${who} sailed from ${port} on ${pretty(atd)}.`
    tone = 'info'
  } else if (ata) {
    summary = `${who} arrived at ${port} on ${pretty(ata)}.`
    tone = 'good'
  } else if (eta) {
    summary = `${who} is expected at ${port} on ${pretty(eta)}.`
    tone = 'info'
  } else {
    summary = `${who} found, but no arrival or expected date is given yet.`
    tone = 'info'
  }
  return {
    found: true,
    tone,
    summary,
    fields: filled([
      F('Vessel name', name),
      D('Arrived (actual)', ata),
      D('Expected arrival', eta),
      D('Departed (actual)', atd),
      D('Expected departure', etd),
      F('VCN', vcn),
      F('Port of arrival', usePortFromAnswer ? g(rec, 'Port Of Arrival Name') : null),
      F('Last port', g(rec, 'Last Port of Call Name')),
      F('IMO number', g(rec, 'IMO Numner', 'IMO Number')),
      F('Shipping agent code', g(rec, 'ShippingAgentCode', 'Shipping Agent Code')),
      F('Shipping line code', g(rec, 'Shipping Line Code')),
      F('Vessel type', g(rec, 'Vessel Type')),
      F('Import or export', appType(g(rec, 'Application Type'))),
    ]),
    extra: {
      vcnNo: vcn,
      ata: iso(ata), eta: iso(eta), atd: iso(atd), etd: iso(etd),
      ataAt: isoAt(ata), etaAt: isoAt(eta), atdAt: isoAt(atd), etdAt: isoAt(etd),
    },
  }
}

// ---------- BE / import (02) ----------

function beFrom(rec: any, portName: string): Parsed {
  const beNo = text(g(rec, 'Be No', 'beNo'))
  const oocDate = g(rec, 'Out of Charge Date')
  const oocNo = g(rec, 'Out of Charge No')
  const igmNo = text(g(rec, 'IGM NO'))
  const igmDate = g(rec, 'IGM Date')
  const doNo = g(rec, 'Delivery Oder No', 'Delivery Order No')
  const doDate = g(rec, 'DO Date')
  const trucks = trucksOf(rec)
  const mainValues = [beNo, oocDate, oocNo, igmNo, igmDate, doNo, doDate, g(rec, 'BL No'), g(rec, 'Importer Name'), g(rec, 'Goods Description')]
  if (mainValues.every(isEmptyVal) && !trucks.length) return notFound()
  const label = beNo ? `BE ${beNo}` : 'This BE'
  let summary: string
  let tone: Parsed['tone']
  if (oocDate) {
    summary = `${label}: Out of Charge given on ${pretty(oocDate)} at ${portName}.`
    tone = 'good'
  } else {
    summary = `${label} found at ${portName}, but Out of Charge is not given yet.`
    tone = 'warn'
  }
  const truckNumbers = uniq(trucks.map((t) => t.no))
  return {
    found: true,
    tone,
    summary,
    fields: filled([
      D('Out of Charge date', oocDate),
      F('Out of Charge number', oocNo),
      F('BE number', beNo),
      D('BE date', g(rec, 'Be Date', 'beDate')),
      F('Port IGM number', igmNo),
      D('Port IGM date', igmDate),
      F('Delivery order number', doNo),
      D('Delivery order date', doDate),
      F('BL number', g(rec, 'BL No')),
      F('Importer', g(rec, 'Importer Name')),
      F('Goods', g(rec, 'Goods Description')),
      F('Packages', [text(g(rec, 'No of Packages Qty')), text(g(rec, 'Type of Packages'))].filter(Boolean).join(' ') || null),
      F('CHA code', g(rec, 'CHA Code')),
    ]),
    tables: truckTable(trucks),
    extra: {
      truckNumbers,
      oocDate: iso(oocDate),
      oocAt: isoAt(oocDate),
      // only a real 7-digit ICEGATE IGM number may be reused elsewhere
      igmNo: igmNo && /^\d{7}$/.test(igmNo) ? igmNo : null,
      igmDate: igmNo && /^\d{7}$/.test(igmNo) ? iso(igmDate) : null,
    },
  }
}

// ---------- shipping bill / export (03) ----------

function sbFrom(rec: any, portName: string): Parsed {
  const sbNo = text(g(rec, 'Shipping Bill No'))
  const leo = g(rec, 'Leo Date')
  const allow = g(rec, 'Allow for Shipment Date')
  const trucks = trucksOf(rec)
  const mainValues = [sbNo, leo, allow, g(rec, 'Exporter Name'), g(rec, 'Vcn No'), g(rec, 'EGM No'), g(rec, 'Rotation No')]
  if (mainValues.every(isEmptyVal) && !trucks.length) return notFound()
  const label = sbNo ? `Shipping bill ${sbNo}` : 'This shipping bill'
  let summary: string
  let tone: Parsed['tone']
  if (leo) {
    summary = `${label} found at ${portName}. LEO given on ${pretty(leo)}.`
    tone = 'good'
  } else if (allow) {
    summary = `${label} found at ${portName}. Allowed for shipment on ${pretty(allow)}, LEO not given yet.`
    tone = 'warn'
  } else {
    summary = `${label} found at ${portName}. LEO not given yet.`
    tone = 'warn'
  }
  return {
    found: true,
    tone,
    summary,
    fields: filled([
      D('LEO date', leo),
      D('Allowed for shipment', allow),
      F('Shipping bill number', sbNo),
      D('Shipping bill date', g(rec, 'Shipping Date', 'Shipping Bill Date')),
      F('Exporter', g(rec, 'Exporter Name')),
      F('VCN', g(rec, 'Vcn No')),
      F('Port of loading', g(rec, 'Port of Loading')),
      F('Destination port', g(rec, 'Port of Destination Code')),
      F('EGM number', g(rec, 'EGM No')),
      D('EGM date', g(rec, 'EGM Date')),
      F('Rotation number', g(rec, 'Rotation No')),
      D('Rotation date', g(rec, 'Rotation Date')),
      F('Cargo type', g(rec, 'Cargo Type')),
    ]),
    tables: truckTable(trucks),
    extra: {
      truckNumbers: uniq(trucks.map((t) => t.no)),
      sbNo,
      vcnNo: text(g(rec, 'Vcn No')),
      egmNo: text(g(rec, 'EGM No')),
      egmDate: iso(g(rec, 'EGM Date')),
      rotationNo: text(g(rec, 'Rotation No')),
      rotationDate: iso(g(rec, 'Rotation Date')),
      leoDate: iso(leo),
      allowForShipmentDate: iso(allow),
    },
  }
}

// ---------- record pickers per port ----------

// JNPT: payload is an array of records
function jnptRec(body: any): any {
  const e = early(body)
  if (e) return e
  const p = payloadOf(body)
  const list = Array.isArray(p) ? p : [p]
  const rec = list.find((r) => r && typeof r === 'object')
  return rec ?? notFound()
}

// MBPT: payload is an object with status/message and one named detail block
function mbptRec(body: any, block: string): any {
  const e = early(body)
  if (e) return e
  const p = payloadOf(body)
  if (!p || typeof p !== 'object') return notFound()
  const d = Array.isArray(p) ? p[0] : p
  const inner = d?.[block]
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner
  if (String(d?.status) === '1' || d?.Error !== undefined) {
    const msg = text(d?.message)
    return notFound(msg && !/no records? found/i.test(msg) ? `Mumbai Port said: ${msg}` : 'No record found for this number.')
  }
  return notFound()
}

// IPORTMAN: payload is a flat object; not-found has every value null plus an "error" text
function iportRec(body: any): any {
  const e = early(body)
  if (e) return e
  const p = payloadOf(body)
  const d = Array.isArray(p) ? p[0] : p
  if (!d || typeof d !== 'object') return notFound()
  const others = Object.entries(d).filter(([k]) => nk(k) !== 'error')
  if (others.every(([, v]) => isEmptyVal(v))) return notFound()
  return d
}

const isParsed = (x: any): x is Parsed => !!x && typeof x.summary === 'string' && typeof x.found === 'boolean'

function run(fn: () => Parsed): Parsed {
  try { return fn() } catch { return bad('The answer from the port could not be read.') }
}

// ---------- registry ----------

const BE_DATE: InputDef = { key: 'beDate', label: 'BE date', pattern: /^\d{8}$/, hint: 'BE date', kind: 'date8' }
const IGM_DATE: InputDef = { key: 'igmDate', label: 'IGM date', pattern: /^\d{8}$/, hint: 'IGM date', kind: 'date8' }
const SB_DATE: InputDef = { key: 'shippingBillDate', label: 'Shipping bill date', pattern: /^\d{8}$/, hint: 'Shipping bill date', kind: 'date8' }

export const PORT_APIS: ApiDef[] = [
  {
    id: 'JNPT/01',
    name: 'Vessel arrival at JNPT (Nhava Sheva)',
    inputs: [VCN],
    parse: (body) => run(() => {
      const r = jnptRec(body)
      return isParsed(r) ? r : vesselFrom(r, 'JNPT', true)
    }),
  },
  {
    id: 'JNPT/02',
    name: 'Bill of Entry at JNPT (Nhava Sheva)',
    inputs: [{ key: 'beNo', label: 'BE number', pattern: /^[a-zA-Z0-9]{7}$/, hint: '7 letters or digits, like BEK7262', upper: true }],
    parse: (body) => run(() => {
      const r = jnptRec(body)
      return isParsed(r) ? r : beFrom(r, 'JNPT')
    }),
  },
  {
    id: 'JNPT/03',
    name: 'Shipping bill at JNPT (Nhava Sheva)',
    inputs: [{ key: 'sbillNo', label: 'Shipping bill number', pattern: /^\d{7}$/, hint: '7 digits, like 2321654' }],
    parse: (body) => run(() => {
      const r = jnptRec(body)
      return isParsed(r) ? r : sbFrom(r, 'JNPT')
    }),
  },
  {
    id: 'MBPT/01',
    name: 'Vessel arrival at Mumbai Port',
    inputs: [VCN],
    parse: (body) => run(() => {
      const r = mbptRec(body, 'VoyageDetails')
      return isParsed(r) ? r : vesselFrom(r, 'Mumbai Port', true)
    }),
  },
  {
    id: 'MBPT/02',
    name: 'Import cargo gate details at Mumbai Port',
    inputs: [
      { key: 'igmNo', label: 'IGM number', pattern: /^\d{7}$/, hint: '7 digits, like 2283545' },
      IGM_DATE,
      { key: 'itemNo', label: 'IGM item (line) number', pattern: /^\d{1,2}$/, hint: '1 or 2 digits, like 8' },
    ],
    parse: (body) => run(() => {
      const r = mbptRec(body, 'IgmGPDtls')
      return isParsed(r) ? r : beFrom(r, 'Mumbai Port')
    }),
  },
  {
    id: 'MBPT/03',
    name: 'Shipping bill at Mumbai Port',
    inputs: [
      { key: 'shippingBillNo', label: 'Shipping bill number', pattern: /^\d{1,7}$/, hint: 'Up to 7 digits, like 2132144' },
      SB_DATE,
    ],
    parse: (body) => run(() => {
      const r = mbptRec(body, 'ExpGPDtls')
      return isParsed(r) ? r : sbFrom(r, 'Mumbai Port')
    }),
  },
  {
    id: 'IPORTMAN/01',
    name: 'Vessel arrival at other ports',
    inputs: [PORT_CODE, VCN],
    parse: (body) => run(() => {
      const r = iportRec(body)
      return isParsed(r) ? r : vesselFrom(r, 'the port', false)
    }),
  },
  {
    id: 'IPORTMAN/02',
    name: 'Bill of Entry at other ports',
    inputs: [
      PORT_CODE,
      { key: 'beNo', label: 'BE number', pattern: /^\d{1,7}$/, hint: 'Up to 7 digits, like 8987001' },
      BE_DATE,
    ],
    parse: (body) => run(() => {
      const r = iportRec(body)
      return isParsed(r) ? r : beFrom(r, 'the port')
    }),
  },
  {
    id: 'IPORTMAN/03',
    name: 'Shipping bill at other ports',
    inputs: [
      PORT_CODE,
      { key: 'shippingBillNo', label: 'Shipping bill number', pattern: /^\d{1,7}$/, hint: 'Up to 7 digits, like 9847542' },
      SB_DATE,
    ],
    parse: (body) => run(() => {
      const r = iportRec(body)
      return isParsed(r) ? r : sbFrom(r, 'the port')
    }),
  },
]
