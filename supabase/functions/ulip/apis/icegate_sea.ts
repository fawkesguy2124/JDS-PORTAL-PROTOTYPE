// ICEGATE sea-cargo / customs APIs: 01, 02, 04, 05, 06, 07, 08, 12, 13.
// Spec: docs/ulip-specs/ICEGATE.md
import type { ApiDef, Field, InputDef, Parsed, Table } from './types.ts'
import { allEmpty, field, filled, payloadOf, prettyDate, text } from './helpers.ts'

// ---------- shared pieces ----------

const NOT_FOUND = (what: string): Parsed => ({
  found: false, tone: 'warn', summary: `No record found for this ${what}.`, fields: [],
})

// Placeholder values ULIP sometimes sends instead of null
function clean(v: unknown): string | null {
  const s = text(v)
  if (s === null) return null
  return s === '-' || s === '.' || s === '..' ? null : s
}

// DDMMYYYY (optionally followed by " HH:MM") -> nice date. Other styles fall through to prettyDate.
function niceDate(v: unknown): string | null {
  const s = text(v)
  if (!s) return null
  const m = s.match(/^(\d{2})(\d{2})(\d{4})(?:\s+(\d{1,2}:\d{2}))?$/)
  if (m && m[4]) return prettyDate(`${m[1]}/${m[2]}/${m[3]} ${m[4]}`)
  return prettyDate(s)
}

// DDMMYYYY -> yyyy-mm-dd (null if not that shape)
function isoDate(v: unknown): string | null {
  const s = text(v)
  const m = s?.match(/^(\d{2})(\d{2})(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function dateField(label: string, v: unknown): Field {
  return { label, value: niceDate(v) }
}

function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => text(x)).filter((x): x is string => x !== null)
  const s = text(v)
  return s ? [s] : []
}

function withUnit(v: unknown, unit: unknown): string | null {
  const n = text(v)
  if (!n) return null
  const u = clean(unit)
  return u ? n + ' ' + u : n
}

// Looks at ULIP's full answer and sorts out the cases that are not a normal record.
// Returns { p } when there is an object payload to read, or { early } with a ready answer.
function open(body: any, what: string): { p?: any; early?: Parsed } {
  const p = payloadOf(body)
  if (typeof p === 'string') {
    const msg = p.trim()
    return { early: { found: false, tone: 'bad', summary: msg ? 'ICEGATE said: ' + msg : 'ICEGATE did not give a usable answer.', fields: [] } }
  }
  if (p === null || p === undefined) {
    const bad = body && typeof body === 'object' && (body.error === 'true' || body.error === true) && text(body.message)
    if (bad) return { early: { found: false, tone: 'bad', summary: 'ICEGATE said: ' + text(body.message), fields: [] } }
    return { early: NOT_FOUND(what) }
  }
  if (Array.isArray(p) || typeof p !== 'object') {
    return { early: NOT_FOUND(what) }
  }
  if (p.errCode !== undefined || p.errMsg !== undefined) {
    if (String(p.errCode ?? '').toUpperCase() === 'ERROR0004' || /no records?/i.test(String(p.errMsg ?? ''))) {
      return { early: NOT_FOUND(what) }
    }
    return { early: { found: false, tone: 'bad', summary: 'ICEGATE said: ' + (text(p.errMsg) ?? text(p.errCode) ?? 'an error'), fields: [] } }
  }
  if (Object.keys(p).length === 0) return { early: NOT_FOUND(what) }
  return { p }
}

const upperInput = (key: string, label: string, pattern: RegExp, hint: string): InputDef =>
  ({ key, label, pattern, hint, upper: true })

const IGM_NO: InputDef = { key: 'igmNo', label: 'IGM number', pattern: /^\d{1,7}$/, hint: 'Up to 7 digits, like 2001362' }
const IGM_DT: InputDef = { key: 'igmDt', label: 'IGM date', pattern: /^\d{8}$/, hint: 'IGM date', kind: 'date8' }
const SB_NO: InputDef = { key: 'sbNo', label: 'Shipping bill number', pattern: /^\d{7}$/, hint: '7 digits, like 6845161' }
const SB_DT: InputDef = { key: 'sbDt', label: 'Shipping bill date', pattern: /^\d{8}$/, hint: 'Shipping bill date', kind: 'date8' }

const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many)

// ---------- the APIs ----------

export const ICEGATE_SEA_APIS: ApiDef[] = [
  {
    id: 'ICEGATE/03',
    name: 'OOC from Customs',
    inputs: [
      { key: 'beNo', label: 'BE number', pattern: /^\d{7}$/, hint: '7 digits, like 2237841' },
      { key: 'beDt', label: 'BE date', pattern: /^\d{8}$/, hint: 'BE date', kind: 'date8' },
    ],
    parse(body) {
      const NOT_GRANTED: Parsed = { found: false, tone: 'warn', summary: 'OOC not granted yet (or BE not found in ICEGATE).', fields: [] }
      const { p, early } = open(body, 'BE number')
      if (early) return early.tone === 'bad' ? early : NOT_GRANTED
      if (allEmpty([p.oocNo, p.oocDt])) return NOT_GRANTED
      return {
        found: true,
        tone: 'good',
        summary: 'OOC granted on ' + (niceDate(p.oocDt) ?? 'unknown date') + '.',
        fields: filled([field('OOC number', p.oocNo), dateField('OOC date', p.oocDt)]),
        extra: { oocNo: text(p.oocNo), oocDate: isoDate(p.oocDt) },
      }
    },
  },

  {
    id: 'ICEGATE/01',
    name: 'Ship arrival details from IGM number',
    inputs: [IGM_NO, IGM_DT],
    parse(body) {
      const { p, early } = open(body, 'IGM number')
      if (early) return early
      const containers = strList(p.containerNo)
      if (allEmpty([p.igmNo, p.voyageNo, p.vesselCode, p.expDtOfArrival, p.portOfArrival]) && containers.length === 0) {
        return NOT_FOUND('IGM number')
      }
      const arrive = niceDate(p.expDtOfArrival)
      const port = clean(p.portOfArrival)
      const bits: string[] = []
      if (arrive) bits.push('expected to arrive ' + arrive)
      if (port) bits.push('at ' + port)
      const parts: string[] = []
      if (bits.length) parts.push(bits.join(' '))
      if (containers.length) parts.push(plural(containers.length, 'container', 'containers') + ' listed')
      const no = text(p.igmNo)
      const tables: Table[] = containers.length
        ? [{ title: 'Containers', columns: ['Container number'], rows: containers.map((c) => [c]) }]
        : []
      return {
        found: true,
        tone: 'info',
        summary: (no ? 'IGM ' + no : 'IGM') + ' found' + (parts.length ? ': ' + parts.join(', ') : '') + '.',
        fields: filled([
          field('IGM number', p.igmNo),
          dateField('IGM date', p.igmDt),
          dateField('Expected arrival', p.expDtOfArrival),
          field('Port of arrival', port),
          field('Vessel code', clean(p.vesselCode)),
          field('Voyage number', clean(p.voyageNo)),
          field('IMO number', clean(p.imoCodeOfVessel)),
          field('Vessel type', clean(p.vesselType)),
          field('Total lines', p.totalNoOfLines),
          field('Master name', clean(p.masterName)),
        ]),
        tables,
        extra: {
          igmNo: no, igmDate: isoDate(p.igmDt), vesselCode: clean(p.vesselCode), voyageNo: clean(p.voyageNo),
          imoCode: clean(p.imoCodeOfVessel), containerNumbers: containers, expectedArrival: isoDate(p.expDtOfArrival), portOfArrival: port,
        },
      }
    },
  },

  {
    id: 'ICEGATE/02',
    name: 'Cargo details from Bill of Entry',
    inputs: [
      { key: 'beNo', label: 'BE number', pattern: /^\d{7}$/, hint: '7 digits, like 2002892' },
      { key: 'beDt', label: 'BE date', pattern: /^\d{8}$/, hint: 'BE date', kind: 'date8' },
    ],
    parse(body) {
      const { p, early } = open(body, 'BE number')
      if (early) return early
      const list: any[] = Array.isArray(p.boeDetails) ? p.boeDetails.filter((x: any) => x && typeof x === 'object') : []
      if (list.length === 0) return NOT_FOUND('BE number')
      const d = list[0]
      const containers: string[] = []
      const cargoRows: (string | null)[][] = []
      const contRows: (string | null)[][] = []
      let pkgTotal = 0
      let pkgSeen = false
      list.forEach((e, i) => {
        const n = Number(text(e.totNoPkg))
        if (text(e.totNoPkg) !== null && Number.isFinite(n)) { pkgTotal += n; pkgSeen = true }
        cargoRows.push([String(i + 1), text(e.totNoPkg), withUnit(e.grossWt, e.unitOfQt), clean(e.countryOrig), clean(e.natureOfCargo)])
        for (const c of strList(e.containerNo)) { containers.push(c); contRows.push([c, String(i + 1)]) }
      })
      const tail: string[] = []
      if (containers.length) tail.push(plural(containers.length, 'container', 'containers'))
      if (pkgSeen) tail.push(pkgTotal + ' packages')
      const tables: Table[] = []
      if (contRows.length) tables.push({ title: 'Containers', columns: ['Container number', 'Cargo line'], rows: contRows })
      tables.push({ title: 'Cargo lines', columns: ['Line', 'Packages', 'Gross weight', 'Country of origin', 'Cargo type code'], rows: cargoRows })
      return {
        found: true,
        tone: 'info',
        summary: 'BE cargo details found' + (tail.length ? ': ' + tail.join(', ') : '') + '.',
        fields: filled([
          field('Total packages', pkgSeen ? pkgTotal : null),
          field('Gross weight', list.length === 1 ? withUnit(d.grossWt, d.unitOfQt) : null),
          field('Country of origin', clean(d.countryOrig)),
          field('Cargo type code', clean(d.natureOfCargo)),
          dateField('IGM date', d.igmDt),
          field('IMO (hazard) code', clean(d.imoCode)),
        ]),
        tables,
        extra: { igmDate: isoDate(d.igmDt), containerNumbers: containers },
      }
    },
  },

  {
    id: 'ICEGATE/04',
    name: 'Shipping line and agent for a vessel arrival',
    inputs: [
      upperInput('siteId', 'Port / customs site code', /^[A-Z0-9]{6}$/, '6 letters or digits, like INBOM1'),
      upperInput('imoCode', 'IMO number', /^[A-Z0-9]{1,25}$/, 'Letters and digits only, like 9241205'),
      upperInput('vesselCode', 'Vessel code', /^[A-Z0-9]{1,25}$/, 'Letters and digits only, like DCNT2'),
      { key: 'arrivalDate', label: 'Expected arrival date', pattern: /^\d{8}$/, hint: 'Arrival date', kind: 'date8' },
    ],
    parse(body) {
      const { p, early } = open(body, 'vessel')
      if (early) return early
      if (allEmpty([p.shippingLineCode, p.shippingAgentCode, p.rotationNumber, p.rotationDt])) return NOT_FOUND('vessel')
      const rot = text(p.rotationNumber)
      const when = niceDate(p.rotationDt)
      return {
        found: true,
        tone: 'info',
        summary: 'Rotation number ' + (rot ?? 'not given') + (when ? ' dated ' + when : '') +
          ', shipping line ' + (clean(p.shippingLineCode) ?? 'not given') + ', agent ' + (clean(p.shippingAgentCode) ?? 'not given') + '.',
        fields: filled([
          field('Rotation number', rot),
          dateField('Rotation date', p.rotationDt),
          field('Shipping line code', clean(p.shippingLineCode)),
          field('Shipping agent code', clean(p.shippingAgentCode)),
        ]),
        extra: {
          rotationNo: rot, rotationDate: isoDate(p.rotationDt),
          shippingLineCode: clean(p.shippingLineCode), shippingAgentCode: clean(p.shippingAgentCode),
        },
      }
    },
  },

  {
    id: 'ICEGATE/05',
    name: 'Cargo details from shipping bill',
    inputs: [SB_NO, SB_DT],
    parse(body) {
      const { p, early } = open(body, 'shipping bill')
      if (early) return early
      if (allEmpty([p.sbNo, p.noOfPkgs, p.portOfDest, p.natureOfCargo, p.grossQt, p.sbDt])) return NOT_FOUND('shipping bill')
      const pk = text(p.noOfPkgs)
      const dest = clean(p.portOfDest)
      const no = text(p.sbNo)
      const tail: string[] = []
      if (pk) tail.push(pk + ' packages')
      if (dest) tail.push('going to ' + dest)
      return {
        found: true,
        tone: 'info',
        summary: (no ? 'Shipping bill ' + no : 'Shipping bill') + ' found' + (tail.length ? ': ' + tail.join(', ') : '') + '.',
        fields: filled([
          field('Shipping bill number', p.sbNo),
          dateField('Shipping bill date', p.sbDt),
          field('Packages', p.noOfPkgs),
          field('Port of destination', dest),
          field('Gross quantity', withUnit(p.grossQt, p.unitOfQt)),
          field('Cargo type code', clean(p.natureOfCargo)),
        ]),
        extra: { sbNo: no, sbDate: isoDate(p.sbDt), portOfDest: dest },
      }
    },
  },

  {
    id: 'ICEGATE/06',
    name: 'LEO (Let Export Order) date of shipping bill',
    inputs: [SB_NO, SB_DT],
    parse(body) {
      const { p, early } = open(body, 'shipping bill')
      if (early) return early
      const leo = text(p.leoDt)
      if (!leo) {
        return { found: false, tone: 'warn', summary: 'LEO not given yet (or shipping bill not found).', fields: [] }
      }
      return {
        found: true,
        tone: 'good',
        summary: 'LEO given on ' + (niceDate(leo) ?? leo) + '.',
        fields: filled([dateField('LEO date', leo)]),
        extra: { leoDate: isoDate(leo) },
      }
    },
  },

  {
    id: 'ICEGATE/07',
    name: 'Import manifest (IGM) details',
    inputs: [IGM_NO, IGM_DT],
    parse(body) {
      const { p, early } = open(body, 'IGM number')
      if (early) return early
      const list: any[] = Array.isArray(p.containerDetails) ? p.containerDetails.filter((x: any) => x && typeof x === 'object') : []
      if (allEmpty([p.vesselCode, p.voyageNo, p.importerName, p.portOfDest, p.portOfShipment, p.imoCodeOfVessel]) && list.length === 0) {
        return NOT_FOUND('IGM number')
      }
      const importer = clean(p.importerName)
      const dest = clean(p.portOfDest)
      const rows = list.map((c) => [text(c.containerNo), text(c.totNoPkg)])
      return {
        found: true,
        tone: 'info',
        // One IGM covers the whole ship; ICEGATE names only one importer for it,
        // which is usually NOT the job's client, so it is kept out of the summary.
        summary: 'IGM found' + (clean(p.vesselCode) ? ': vessel ' + clean(p.vesselCode) : '') +
          (clean(p.voyageNo) ? ', voyage ' + clean(p.voyageNo) : '') + (dest ? ', destination ' + dest : '') +
          ', ' + plural(list.length, 'container', 'containers') + ' on this IGM (the whole ship).',
        fields: filled([
          field('Port of destination', dest),
          field('Port of shipment', clean(p.portOfShipment)),
          field('Vessel code', clean(p.vesselCode)),
          field('Voyage number', clean(p.voyageNo)),
          field('IMO number', clean(p.imoCodeOfVessel)),
          field('Mode of transport code', clean(p.modeOfTransport)),
        ]),
        tables: rows.length ? [{ title: 'Containers', columns: ['Container number', 'Packages'], rows }] : [],
        extra: {
          igmNo: text(p.igmNo), igmDate: isoDate(p.igmDt), imoCode: clean(p.imoCodeOfVessel),
          vesselCode: clean(p.vesselCode), voyageNo: clean(p.voyageNo), firstLineImporter: importer,
          containerNumbers: list.map((c) => text(c.containerNo)).filter((x) => x !== null),
        },
      }
    },
  },

  {
    id: 'ICEGATE/08',
    name: 'Export manifest (EGM) details',
    inputs: [
      { key: 'egmNo', label: 'EGM number', pattern: /^\d{1,7}$/, hint: 'Up to 7 digits, like 103978' },
      { key: 'egmDt', label: 'EGM date', pattern: /^\d{8}$/, hint: 'EGM date', kind: 'date8' },
    ],
    parse(body) {
      const { p, early } = open(body, 'EGM number')
      if (early) return early
      const list: any[] = Array.isArray(p.sbDetails) ? p.sbDetails.filter((x: any) => x && typeof x === 'object') : []
      if (allEmpty([p.egmNo, p.egmDt]) && list.length === 0) return NOT_FOUND('EGM number')
      const rows = list.map((s) => [text(s.sbNo), strList(s.containerNo).join(', ') || null, text(s.noOfPckgs), clean(s.portOfDest)])
      const when = niceDate(p.egmDt)
      const no = text(p.egmNo)
      return {
        found: true,
        tone: 'info',
        summary: (no ? 'EGM ' + no : 'EGM') + (when ? ' dated ' + when : '') + ' found with ' + plural(list.length, 'shipping bill', 'shipping bills') + '.',
        fields: filled([
          field('EGM number', p.egmNo),
          dateField('EGM date', p.egmDt),
          field('Shipping bills listed', list.length || null),
        ]),
        tables: rows.length ? [{ title: 'Shipping bills', columns: ['Shipping bill', 'Containers', 'Packages', 'Port of destination'], rows }] : [],
        extra: {
          egmNo: no, egmDate: isoDate(p.egmDt),
          shippingBills: list.map((s) => text(s.sbNo)).filter((x) => x !== null),
          containerNumbers: list.flatMap((s) => strList(s.containerNo)),
        },
      }
    },
  },

  {
    id: 'ICEGATE/12',
    name: 'Shipping bill details (manual, courier, postal)',
    inputs: [
      upperInput('location', 'Customs location code', /^[A-Za-z0-9]{6}$/, '6 letters or digits, like INCCU5'),
      { key: 'sbNo', label: 'Shipping bill number', pattern: /^\d{7}$/, hint: '7 digits, like 1340721' },
      { key: 'sbDate', label: 'Shipping bill date', pattern: /^\d{8}$/, hint: 'Shipping bill date', kind: 'date8' },
    ],
    parse(body) {
      const { p, early } = open(body, 'shipping bill')
      if (early) return early
      if (allEmpty([p.expName, p.sbType, p.egmNo, p.egmDt, p.iec, p.leoDt, p.chaNo])) return NOT_FOUND('shipping bill')
      const leo = text(p.leoDt)
      return {
        found: true,
        tone: leo ? 'good' : 'info',
        summary: leo ? 'Shipping bill found. LEO given on ' + (niceDate(leo) ?? leo) + '.' : 'Shipping bill found. LEO not given yet.',
        fields: filled([
          dateField('LEO date', leo),
          field('Exporter', p.expName),
          field('IEC', p.iec),
          field('CHA number', p.chaNo),
          field('EGM number', p.egmNo),
          dateField('EGM date', p.egmDt),
          field('Shipping bill type', p.sbType),
        ]),
        extra: { leoDate: isoDate(leo), egmNo: text(p.egmNo), egmDate: isoDate(p.egmDt) },
      }
    },
  },

  {
    id: 'ICEGATE/13',
    name: 'E-seal details of an export container',
    inputs: [
      { key: 'esealNumber', label: 'E-seal number', pattern: /^[0-9]{1,20}$/, hint: 'Digits only, up to 20, like 000000000045' },
      upperInput('containerNumber', 'Container number', /^[A-Za-z0-9]{1,15}$/, 'Container number, like MSCU1234567'),
    ],
    parse(body) {
      const { p, early } = open(body, 'e-seal')
      if (early) return early
      if (allEmpty([p.sealDateTime, p.sbNumber, p.truckNumber, p.portCode, p.esealStatus, p.verificationTime])) return NOT_FOUND('e-seal')
      const sealed = niceDate(p.sealDateTime)
      const seal = text(p.esealNumber)
      const cont = text(p.containerNumber)
      return {
        found: true,
        tone: 'info',
        summary: (seal ? 'E-seal ' + seal : 'E-seal') + (cont ? ' on container ' + cont : '') + (sealed ? ' was sealed on ' + sealed : ' found') + '.',
        fields: filled([
          dateField('Sealed on', p.sealDateTime),
          field('E-seal number', p.esealNumber),
          field('Container number', p.containerNumber),
          field('Shipping bill number', p.sbNumber),
          dateField('Shipping bill date', p.sbDate),
          field('Truck number', p.truckNumber),
          field('Port code', p.portCode),
          field('E-seal status', p.esealStatus),
          dateField('Verified on', p.verificationTime),
        ]),
        extra: { sbNo: text(p.sbNumber), sbDate: isoDate(p.sbDate), truckNumber: text(p.truckNumber), truckNumbers: text(p.truckNumber) ? [text(p.truckNumber)] : [] },
      }
    },
  },
]
