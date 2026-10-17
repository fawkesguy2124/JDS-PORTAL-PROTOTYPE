// PCS (Port Community System) APIs. Spec: docs/ulip-specs/PCS.md
// PCS covers all ports, so it is the fallback when a job is not at JNPT.
// PCS/06 is not approved and is deliberately not built.
import type { ApiDef, Parsed, Table } from './types.ts'
import { field, filled, payloadOf, prettyDate, text } from './helpers.ts'

type Row = Record<string, any>
type Look = { rows: Row[]; problem: string | null }

// Real records only: drops the "not found" placeholder row (all values null).
// problem = plain text when ULIP gave a message instead of data (service down, bad input).
function look(body: any): Look {
  let p: any = null
  try { p = payloadOf(body) } catch { p = null }
  if (typeof p === 'string') return { rows: [], problem: text(p) ?? 'ULIP gave an unreadable answer.' }
  if (p === null || p === undefined) {
    const msg = body && typeof body === 'object' && String(body.error) === 'true' ? text(body.message) : null
    return { rows: [], problem: msg ? msg.replace(/\s+/g, ' ') : null }
  }
  const list = Array.isArray(p) ? p : [p]
  const rows = list.filter((r) => {
    if (!r || typeof r !== 'object') return false
    if (String(r.responseMsg ?? '').toLowerCase() === 'not found') return false
    return Object.entries(r).some(([k, v]) => k !== 'responseMsg' && text(v) !== null)
  })
  return { rows, problem: null }
}

function notFound(l: Look, what: string): Parsed | null {
  if (l.rows.length) return null
  if (l.problem) return { found: false, tone: 'bad', summary: `ULIP could not check this: ${l.problem}`, fields: [] }
  return { found: false, tone: 'warn', summary: `No record found for this ${what}.`, fields: [] }
}

const pick = (rows: Row[], ...keys: string[]): unknown => {
  for (const r of rows) for (const k of keys) if (text(r[k]) !== null) return r[k]
  return null
}

// DDMMYYYY (optionally followed by :HH:MM) -> yyyy-mm-dd, else null
function iso(v: unknown): string | null {
  const m = String(v ?? '').trim().match(/^(\d{2})(\d{2})(\d{4})(?::\d{2}:\d{2})?$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

// "02032023:21:18" -> "2 Mar 2023, 21:18"
function dateTime(v: unknown): string | null {
  const m = String(v ?? '').trim().match(/^(\d{2})(\d{2})(\d{4}):(\d{2}:\d{2})$/)
  return prettyDate(m ? `${m[1]}/${m[2]}/${m[3]} ${m[4]}` : v)
}

const uniq = (xs: unknown[]): string[] => [...new Set(xs.map((x) => text(x)).filter((x): x is string => x !== null))]

const mk = (key: string, label: string) => ({
  key, label, pattern: /^[0-9]{1,10}$/, hint: 'Up to 10 digits, like 2272354',
})

const joinQty = (a: unknown, b: unknown): string | null => [text(a), text(b)].filter(Boolean).join(' ') || null

export const PCS_APIS: ApiDef[] = [
  {
    id: 'PCS/01',
    name: 'Import cargo and containers by IGM number (any port)',
    inputs: [mk('igmNumber', 'IGM number')],
    buildBody: (p) => ({ interfaceName: 'CHPOI03', igmNumber: p.igmNumber }),
    parse(body) {
      const l = look(body)
      const nf = notFound(l, 'IGM number')
      if (nf) return nf
      const rows = l.rows
      const igmNo = text(pick(rows, 'igm_no'))
      const igmDate = pick(rows, 'igm_date')
      const withBox = rows.filter((r) => text(r.container_no) !== null)
      const containers = uniq(withBox.map((r) => r.container_no))
      const tables: Table[] = []
      if (withBox.length) {
        tables.push({
          title: 'Containers',
          columns: ['Container', 'Seal', 'Bill no', 'Packages', 'Weight'],
          rows: withBox.map((r) => [
            text(r.container_no), text(r.container_seal_no), text(r.bill_no),
            text(r.number_of_packages), text(r.container_weight ?? r.grossWeight),
          ]),
        })
      }
      const n = containers.length
      const filed = prettyDate(igmDate)
      return {
        found: true,
        tone: 'info',
        summary: `IGM${igmNo ? ' ' + igmNo : ''} found${n ? ` with ${n} container${n === 1 ? '' : 's'}` : ''}${filed ? `, filed ${filed}` : ''}.`,
        fields: filled([
          field('IGM number', igmNo),
          field('IGM date', igmDate, 'date'),
          field('Voyage number', pick(rows, 'voyage_no')),
          field('Expected arrival', dateTime(pick(rows, 'expected_date_and_time_of_arrival'))),
          field('Port of arrival', pick(rows, 'port_of_arrival')),
          field('Port of loading', pick(rows, 'port_of_loading')),
          field('Terminal', pick(rows, 'terminal_operator_code')),
          field('Shipping line code', pick(rows, 'shipping_line_code')),
          field('Bill of lading no', pick(rows, 'bill_no')),
          field('Goods', pick(rows, 'goods_description')),
          field('Total packages', pick(rows, 'total_no_of_packages')),
          field('Gross weight', pick(rows, 'grossWeight')),
        ]),
        tables: tables.length ? tables : undefined,
        extra: { igmNo, igmDate: iso(igmDate), containerNumbers: containers },
      }
    },
  },
  {
    id: 'PCS/02',
    name: 'Shipping bill details (any port)',
    inputs: [mk('sbNumber', 'Shipping bill number')],
    buildBody: (p) => ({ interfaceName: 'CHPOE05', sbNumber: p.sbNumber }),
    parse(body) {
      const l = look(body)
      const nf = notFound(l, 'shipping bill number')
      if (nf) return nf
      const r = l.rows
      const sbNo = text(pick(r, 'sbNo', 'sbNumber'))
      const sbDate = pick(r, 'sbDate')
      const dated = prettyDate(sbDate)
      return {
        found: true,
        tone: 'info',
        summary: `Shipping bill${sbNo ? ' ' + sbNo : ''} found${dated ? `, dated ${dated}` : ''}.`,
        fields: filled([
          field('Shipping bill number', sbNo),
          field('Shipping bill date', sbDate, 'date'),
          field('Port of origin', pick(r, 'portOfOrigin')),
          field('Destination port', pick(r, 'portOfDestination')),
          field('Gross quantity', joinQty(pick(r, 'grossQuantity'), pick(r, 'unitOfQuantity'))),
          field('Total packages', pick(r, 'totalNoOfPackages')),
          field('Cargo type', pick(r, 'natureOfCargo')),
          field('CHA code', pick(r, 'chaCode')),
        ]),
        extra: { sbNo, sbDate: iso(sbDate) },
      }
    },
  },
  {
    id: 'PCS/03',
    name: 'Shipping bill: rotation and LEO (any port)',
    inputs: [mk('sbNumber', 'Shipping bill number')],
    buildBody: (p) => ({ interfaceName: 'CHPOE07', sbNumber: p.sbNumber }),
    parse(body) {
      const l = look(body)
      const nf = notFound(l, 'shipping bill number')
      if (nf) return nf
      const r = l.rows
      const sbNo = text(pick(r, 'sbNumber', 'sbNo'))
      const leo = pick(r, 'leoDate')
      const leoPretty = prettyDate(leo)
      const head = `Shipping bill${sbNo ? ' ' + sbNo : ''} found.`
      return {
        found: true,
        tone: leoPretty ? 'good' : 'warn',
        summary: leoPretty ? `${head} LEO given on ${leoPretty}.` : `${head} LEO not given yet.`,
        fields: filled([
          field('Shipping bill number', sbNo),
          field('Shipping bill date', pick(r, 'sbDate'), 'date'),
          field('LEO date', leo, 'date'),
          field('Rotation number', pick(r, 'rotationNo')),
          field('Rotation date', pick(r, 'rotationDate'), 'date'),
          field('Cargo type', pick(r, 'natureOfCargo')),
        ]),
        extra: { sbNo, leoDate: iso(leo), rotationNo: text(pick(r, 'rotationNo')), rotationDate: iso(pick(r, 'rotationDate')) },
      }
    },
  },
  {
    id: 'PCS/04',
    name: 'Bill of entry details (any port)',
    inputs: [mk('boeNumber', 'BE number')],
    buildBody: (p) => ({ interfaceName: 'CHPOI09', boeNumber: p.boeNumber }),
    parse(body) {
      const l = look(body)
      const nf = notFound(l, 'BE number')
      if (nf) return nf
      const r = l.rows
      const beNo = text(pick(r, 'billOfEntryNo', 'items_BillOfEntryNo'))
      const beDate = pick(r, 'billOfEntryDate', 'items_BillOfEntryDate')
      const igmNo = text(pick(r, 'igmNo', 'items_IgmNo'))
      const igmDate = pick(r, 'igmDate', 'items_IgmDate')
      const withBox = r.filter((x) => text(x.container_no) !== null)
      const containers = uniq(withBox.map((x) => x.container_no))
      const tables: Table[] = []
      if (withBox.length) {
        tables.push({
          title: 'Containers',
          columns: ['Container', 'Packages', 'Weight', 'Country of origin'],
          rows: withBox.map((x) => [text(x.container_no), text(x.numberOfPackages), text(x.grossWeight), text(x.countryOfOrigin)]),
        })
      }
      const dated = prettyDate(beDate)
      return {
        found: true,
        tone: 'info',
        summary: `BE${beNo ? ' ' + beNo : ''} found${dated ? `, dated ${dated}` : ''}${igmNo ? `, under IGM ${igmNo}` : ''}.`,
        fields: filled([
          field('BE number', beNo),
          field('BE date', beDate, 'date'),
          field('IGM number', igmNo),
          field('IGM date', igmDate, 'date'),
          field('Line number', pick(r, 'lineNo', 'line_number')),
          field('Sub line number', pick(r, 'sublineNo', 'sub_line_number')),
          field('Customs house', pick(r, 'customHouseCode')),
          field('Cargo type', pick(r, 'natureOfCargo')),
          field('Packages', pick(r, 'numberOfPackages')),
          field('Gross weight', joinQty(pick(r, 'grossWeight'), pick(r, 'unitOfQuantity'))),
          field('Country of origin', pick(r, 'countryOfOrigin')),
          field('CHA code', pick(r, 'chaCode')),
        ]),
        tables: tables.length ? tables : undefined,
        extra: { beNo, beDate: iso(beDate), igmNo, igmDate: iso(igmDate), containerNumbers: containers },
      }
    },
  },
  {
    id: 'PCS/05',
    name: 'Bill of entry: out of charge (any port)',
    inputs: [mk('boeNumber', 'BE number')],
    buildBody: (p) => ({ interfaceName: 'CHPOI10', boeNumber: p.boeNumber }),
    parse(body) {
      const l = look(body)
      const nf = notFound(l, 'BE number')
      if (nf) return nf
      const r = l.rows
      const beNo = text(pick(r, 'billOfEntryNo', 'items_BillOfEntryNo'))
      const oocNo = pick(r, 'out_of_charge_no')
      const oocDate = pick(r, 'out_of_charge_date')
      const granted = text(oocNo) !== null || text(oocDate) !== null
      const igmNo = text(pick(r, 'igmNo', 'items_IgmNo'))
      const oocPretty = prettyDate(oocDate)
      const be = beNo ? ` ${beNo}` : ''
      return {
        found: true,
        tone: granted ? 'good' : 'warn',
        summary: granted
          ? `OOC granted${oocPretty ? ` on ${oocPretty}` : ''} for BE${be}.`
          : `BE${be} found, but OOC is not granted yet.`,
        fields: filled([
          field('OOC number', oocNo),
          field('OOC date', oocDate, 'date'),
          field('BE number', beNo),
          field('BE date', pick(r, 'billOfEntryDate', 'items_BillOfEntryDate'), 'date'),
          field('IGM number', igmNo),
          field('IGM date', pick(r, 'igmDate', 'items_IgmDate'), 'date'),
          field('Customs house', pick(r, 'customHouseCode', 'items_CustomHouseCode')),
          field('Container', pick(r, 'container_no')),
          field('Packages', pick(r, 'numberOfPackages')),
          field('Country of origin', pick(r, 'countryOfOrigin')),
          field('CHA code', pick(r, 'chaCode')),
        ]),
        extra: { beNo, oocNo: text(oocNo), oocDate: iso(oocDate), igmNo },
      }
    },
  },
]
