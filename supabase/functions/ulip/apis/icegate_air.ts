// ICEGATE air cargo APIs (09, 10, 11). Spec: docs/ulip-specs/ICEGATE.md
//
// Input rules follow the old Edge Functions that were tested on ULIP staging in July 2026
// (icegate-air-igm, icegate-air-hawb, icegate-air-egm). They match the document's error-message
// regexes (with the $ anchor), not the sample request values that break their own rules.
import type { ApiDef, Parsed, Table } from './types.ts'
import { field as baseField, filled, payloadOf, prettyDate as basePretty, text } from './helpers.ts'

const DOWN = 'ULIP could not answer right now. Please try again later.'

// Odd answers shared by all three APIs. Returns a Parsed when the payload is not a real record.
function notARecord(body: any, what: string): Parsed | null {
  const p = payloadOf(body)
  if (typeof p === 'string') {
    const t = p.trim()
    return { found: false, tone: 'bad', summary: t ? `ULIP says: ${t}` : DOWN, fields: [] }
  }
  const isEmpty = p === null || p === undefined || typeof p !== 'object' ||
    (Array.isArray(p) ? p.length === 0 : Object.keys(p).length === 0)
  if (isEmpty) {
    const msg = text(body?.message)
    if (body?.error === 'true' && msg) return { found: false, tone: 'bad', summary: `ULIP says: ${msg}`, fields: [] }
    return { found: false, tone: 'warn', summary: `No ${what} found for these details.`, fields: [] }
  }
  if (!Array.isArray(p) && (p.errCode || p.errMsg)) {
    const notFound = text(p.errCode) === 'ERROR0004' || /no records/i.test(String(p.errMsg ?? ''))
    if (notFound) return { found: false, tone: 'warn', summary: `No ${what} found for these details.`, fields: [] }
    const why = text(p.errMsg) ?? text(p.errCode)
    return { found: false, tone: 'bad', summary: `ULIP reported a problem: ${why}.`, fields: [] }
  }
  return null
}

// ULIP also sends "15022025 12:02" (DDMMYYYY plus time); make it "15/02/2025 12:02" so prettyDate reads it
const fixDate = (v: unknown) => { const s = text(v); return s ? s.replace(/^(\d{2})(\d{2})(\d{4})(?= \d)/, '$1/$2/$3') : null }
const prettyDate = (v: unknown) => basePretty(fixDate(v))
const field = (label: string, v: unknown, kind: 'text' | 'date' = 'text') => baseField(label, kind === 'date' ? fixDate(v) : v, kind)

const records = (body: any): any[] => {
  const p = payloadOf(body)
  return (Array.isArray(p) ? p : [p]).filter((r) => r && typeof r === 'object')
}

// "20/01/2025 12:06" or "20032025 12:03" or "19012022" -> sortable number (0 if unreadable)
function when(v: unknown): number {
  const s = text(v)
  if (!s) return 0
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?/)
  if (!m) m = s.match(/^(\d{2})(\d{2})(\d{4})(?: (\d{2}):(\d{2}))?/)
  if (!m) return 0
  return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0))
}

function iso(v: unknown): string | null {
  const s = text(v)
  if (!s) return null
  const m = s.match(/^(\d{2})\/?(\d{2})\/?(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

const MAWB = { key: 'mawbNumber', label: 'Master air waybill (MAWB) number', pattern: /^[0-9]{1,20}$/, hint: 'Digits only, up to 20, like 06536234962' }
const LOCATION = { pattern: /^[A-Za-z0-9]{6}$/, upper: true }

export const ICEGATE_AIR_APIS: ApiDef[] = [
  {
    id: 'ICEGATE/09',
    name: 'Air import manifest (IGM) by master air waybill',
    inputs: [
      MAWB,
      { key: 'custSite', label: 'Airport customs location code', ...LOCATION, hint: '6 letters/digits, like INBOM4 (Mumbai air cargo)' },
    ],
    parse(body) {
      const bad = notARecord(body, 'air manifest')
      if (bad) return bad
      const recs = records(body)
      const r = recs[0]
      const mawb = text(r?.mawbNumber)
      const flight = text(r?.flightNumber)
      const igmRtn = text(r?.igmRtn ?? r?.igmRTN)
      if (!r || (!mawb && !flight && !igmRtn)) return { found: false, tone: 'warn', summary: 'No air manifest found for these details.', fields: [] }
      const more = recs.length > 1 ? ` (${recs.length} records)` : ''
      const parts = [
        mawb ? `MAWB ${mawb}` : 'Air manifest',
        flight ? `is on flight ${flight}` : 'is in the manifest',
        text(r.flightDate) ? `of ${prettyDate(r.flightDate)}` : '',
      ].filter(Boolean)
      const summary = `${parts.join(' ')}${igmRtn ? `, IGM/RTN ${igmRtn}` : ''}${more}.`
      const table: Table = {
        title: 'Manifest records',
        columns: ['MAWB', 'Flight', 'Flight date', 'IGM date', 'IGM/RTN', 'Packages', 'Weight', 'Status'],
        rows: recs.map((x) => [
          text(x.mawbNumber), text(x.flightNumber), prettyDate(x.flightDate), prettyDate(x.igmDate),
          text(x.igmRtn ?? x.igmRTN), text(x.totalPackage), text(x.grossWeight), text(x.status),
        ]),
      }
      return {
        found: true,
        tone: 'info',
        summary,
        fields: filled([
          field('MAWB number', r.mawbNumber), field('Flight number', r.flightNumber),
          field('Flight date', r.flightDate, 'date'), field('IGM date', r.igmDate, 'date'),
          field('IGM/RTN number', r.igmRtn ?? r.igmRTN), field('Total packages', r.totalPackage),
          field('Gross weight', r.grossWeight), field('Customs location', r.custSite),
          field('Status code', r.status), field('Integration date', r.dateOfIntegration, 'date'),
          field('Remarks', r.remarks),
        ]),
        tables: recs.length > 1 ? [table] : undefined,
        extra: { mawbNumber: mawb, flightNumber: flight, igmRtn, igmDate: iso(r.igmDate), flightDate: iso(r.flightDate) },
      }
    },
  },
  {
    id: 'ICEGATE/10',
    name: 'House air waybill (HAWB) details',
    inputs: [
      MAWB,
      { key: 'hawbNumber', label: 'House air waybill (HAWB) number', pattern: /^[A-Za-z0-9]{1,15}$/, upper: true, hint: 'Letters/digits, up to 15, like 1575103333' },
    ],
    parse(body) {
      const bad = notARecord(body, 'house air waybill')
      if (bad) return bad
      const p = payloadOf(body)
      const r = p && typeof p === 'object' ? (p.icdBlStatusResponceDto ?? p.icdBlStatusResponseDto ?? (Array.isArray(p) ? p[0] : p)) : null
      if (!r || typeof r !== 'object') return { found: false, tone: 'warn', summary: 'No house air waybill found for these details.', fields: [] }
      const igmRtn = text(r.igmRTN ?? r.igmRtn)
      const desc = text(r.descOfGoods)
      const conts: any[] = Array.isArray(r.containerDtlsResponseDtos) ? r.containerDtlsResponseDtos.filter((c: any) => c && typeof c === 'object') : []
      if (!igmRtn && !desc && !text(r.totalPackage) && !text(r.grossWeight)) {
        return { found: false, tone: 'warn', summary: 'No house air waybill found for these details.', fields: [] }
      }
      const summary = `House air waybill found${igmRtn ? `, IGM/RTN ${igmRtn}` : ''}${desc ? `, goods: ${desc}` : ''}${text(r.totalPackage) ? `, ${text(r.totalPackage)} packages` : ''}.`
      const tables: Table[] = conts.length
        ? [{
          title: 'Container / package lines',
          columns: ['Number', 'Type', 'Line no', 'Sub line', 'IGM/RTN', 'Error code'],
          rows: conts.map((c) => [text(c.contNo), text(c.contStatus), text(c.lineNo), text(c.subLineNo), text(c.igmRTN ?? c.igmRtn), text(c.errCode)]),
        }]
        : []
      return {
        found: true,
        tone: 'info',
        summary,
        fields: filled([
          field('IGM/RTN number', igmRtn), field('Description of goods', desc),
          field('Total packages', r.totalPackage), field('Package type', r.packageCode),
          field('Gross weight', r.grossWeight), field('Weight unit', r.uqc),
          field('MAWB date', r.mawbDT, 'date'), field('HAWB date', r.hawbDT, 'date'),
          field('IGM date', r.igmDT, 'date'), field('Inward date', r.inwDT, 'date'),
          field('Destination port', r.portDest), field('Cargo movement', r.cargoMovement),
          field('Line number', r.lineNo), field('Sub line number', r.subLineNo),
        ]),
        tables: tables.length ? tables : undefined,
        extra: { igmRtn, igmDate: iso(r.igmDT), mawbDate: iso(r.mawbDT), hawbDate: iso(r.hawbDT), containerNumbers: conts.map((c) => text(c.contNo)).filter(Boolean) },
      }
    },
  },
  {
    id: 'ICEGATE/11',
    name: 'Air manifest filing status by flight',
    inputs: [
      { key: 'location', label: 'Airport customs location code', ...LOCATION, hint: '6 letters/digits, like INBOM4 (Mumbai air cargo)' },
      { key: 'flightDt', label: 'Flight date', pattern: /^(0[1-9]|[12][0-9]|3[01])(0[1-9]|1[012])\d{4}$/, hint: 'Flight date', kind: 'date8' },
      { key: 'flightNo', label: 'Flight number', pattern: /^[A-Za-z0-9]{1,30}$/, upper: true, hint: 'Letters/digits, no spaces, like 6E23' },
      { key: 'flag', label: 'Manifest type (EGM = export, IGM = import)', pattern: /^[A-Za-z0-9]{1,15}$/, upper: true, hint: 'EGM for export, IGM for import' },
    ],
    parse(body) {
      const bad = notARecord(body, 'manifest filing')
      if (bad) return bad
      const recs = records(body).filter((r) => text(r.status) || text(r.flightNumber) || text(r.sentTime) || text(r.receivedTime))
      if (!recs.length) return { found: false, tone: 'warn', summary: 'No manifest filing found for this flight.', fields: [] }
      const sorted = [...recs].sort((a, b) => when(b.receivedTime) - when(a.receivedTime) || when(b.sentTime) - when(a.sentTime))
      const r = sorted[0]
      const status = text(r.status)
      const acked = text(r.ackReceivedTime) !== null || text(r.ackSentTime) !== null
      const failed = !!status && /error|reject|fail|invalid|not ?found/i.test(status) && !/successfully/i.test(status)
      const tone: Parsed['tone'] = failed ? 'bad' : acked ? 'good' : 'warn'
      const flight = text(r.flightNumber)
      const ackNote = acked ? 'Acknowledgement received from customs.' : 'No acknowledgement from customs yet.'
      const statusText = status ?? 'status not given'
      const summary = `${flight ? `Flight ${flight}` : 'Flight'}: ${statusText}${/[.!?]$/.test(statusText) ? '' : '.'} ${ackNote}`
      return {
        found: true,
        tone,
        summary,
        fields: filled([
          field('Flight number', r.flightNumber), field('Flight date', r.flightDate, 'date'),
          field('Customs location', r.customLocation), field('Status', status),
          field('Received by ICEGATE', r.receivedTime, 'date'), field('Sent to customs', r.sentTime, 'date'),
          field('Acknowledgement sent', r.ackSentTime, 'date'), field('Acknowledgement received', r.ackReceivedTime, 'date'),
        ]),
        tables: sorted.length > 1
          ? [{
            title: 'All filings for this flight (latest first)',
            columns: ['Received', 'Sent', 'Ack received', 'Status'],
            rows: sorted.map((x) => [prettyDate(x.receivedTime), prettyDate(x.sentTime), prettyDate(x.ackReceivedTime), text(x.status)]),
          }]
          : undefined,
        extra: { flightNumber: flight, flightDate: iso(r.flightDate), acknowledged: acked, filings: sorted.length },
      }
    },
  },
]
