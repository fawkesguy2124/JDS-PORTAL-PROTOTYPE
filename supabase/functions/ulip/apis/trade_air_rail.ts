// DGFT, air cargo terminals (AAICLAS, ACMES), Indian Railways (FOIS) and container tracking (LDB).
// Spec: docs/ulip-specs/TRADE_AIR_RAIL.md
import type { ApiDef, Field, Parsed, Table } from './types.ts'
import { field, filled, payloadOf, prettyDate, text } from './helpers.ts'

// ---------- small local helpers ----------

// text() but also treats "N/A", "NA", "-" as empty (ULIP uses them for "nothing")
function clean(v: unknown): string | null {
  const s = text(v)
  if (s === null) return null
  return /^(n\/a|na|nil|-|--)$/i.test(s) ? null : s
}

function f(label: string, v: unknown, kind: 'text' | 'date' = 'text'): Field {
  return field(label, clean(v), kind)
}

function obj(v: unknown): Record<string, any> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : null
}

function arr(v: unknown): Record<string, any>[] {
  return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []
}

function last<T>(a: T[]): T | undefined {
  return a.length ? a[a.length - 1] : undefined
}

function tbl(title: string, columns: string[], rows: (string | null)[][]): Table[] {
  return rows.length ? [{ title, columns, rows }] : []
}

function bad(summary: string): Parsed {
  return { found: false, tone: 'bad', summary, fields: [] }
}

function warn(summary: string): Parsed {
  return { found: false, tone: 'warn', summary, fields: [] }
}

function prettyKey(k: string): string {
  const s = k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// dd/mm/yyyy [hh:mm] style values are made readable, everything else stays as is
function nice(v: unknown): string | null {
  const s = clean(v)
  if (s === null) return null
  const dated = /^\d{1,2}[/-]\d{1,2}[/-]\d{4}/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}[- ][A-Za-z]{3}[- ]\d{4}/.test(s)
  return dated ? prettyDate(s) : s
}

// A table for lists whose columns we do not know in advance (location history, shipping bills ...)
function genericTable(title: string, list: Record<string, any>[]): Table[] {
  if (!list.length) return []
  const keys: string[] = []
  for (const r of list) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k)
  const used = keys.filter((k) => list.some((r) => clean(r[k]) !== null))
  if (!used.length) return []
  return [{ title, columns: used.map(prettyKey), rows: list.map((r) => used.map((k) => nice(r[k]))) }]
}

// Handles every answer that is not a normal data record: ULIP errors, strings, empty bodies.
// Returns null when the body looks like a normal answer that the caller should read.
function early(body: any): Parsed | null {
  const b = obj(body)
  if (!b) return bad('ULIP did not send a readable answer. Please try again.')
  const outer = b.response
  const item = Array.isArray(outer) ? obj(outer[0]) : null
  if (outer === null || outer === undefined || (Array.isArray(outer) && !item)) {
    const msg = typeof b.message === 'string' ? clean(b.message) : null
    if (msg && !/^success$/i.test(msg)) return bad(`ULIP rejected this request: ${msg}`)
    return warn('ULIP sent no data for this request.')
  }
  const payload = item ? item.response : outer
  if (typeof payload === 'string') {
    const t = clean(payload.replace(/^"+|"+$/g, ''))
    if (t && /remoteAddress|Value cannot be null/i.test(t)) {
      return bad('This location code is not known to the cargo terminal. Check the 3-letter airport code (for example CCU).')
    }
    return bad(`The service reports a problem: ${t ?? 'no details given'}`)
  }
  if ((payload === null || payload === undefined) && item) {
    const m = item.message
    const msg = clean(typeof m === 'string' ? m : obj(m)?.text)
    if (msg) return /not found|no record/i.test(msg) ? warn(msg) : bad(`The service reports a problem: ${msg}`)
    return warn('No record found for this number.')
  }
  return null
}

// Never lets a parser throw on strange input
function safe(fn: (body: any) => Parsed): (body: any) => Parsed {
  return (body) => {
    try {
      return fn(body)
    } catch {
      return bad('ULIP sent an answer in a shape this portal could not read.')
    }
  }
}

// ---------- DGFT ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// "Jan 27, 2016 6:30:00 PM" -> "27 Jan 2016"
function usDate(v: unknown): string | null {
  const s = clean(v)
  if (!s) return null
  const m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})/)
  if (m) {
    const i = MONTHS.indexOf(m[1].toLowerCase())
    if (i >= 0) return `${Number(m[2])} ${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[3]}`
  }
  return prettyDate(s)
}

function iecState(v: unknown): { label: string; tone: 'good' | 'bad' | 'warn' } {
  const s = (clean(v) ?? '').toUpperCase()
  if (s === '0' || s === 'ACTIVE' || s === 'A') return { label: 'ACTIVE', tone: 'good' }
  if (/CANCEL|SUSPEND|BLACKLIST|SURRENDER|REVOK|INACTIVE|DEACTIV/.test(s)) {
    const word = /CANCEL/.test(s) ? 'CANCELLED' : /SUSPEND/.test(s) ? 'SUSPENDED' : s
    return { label: word, tone: 'bad' }
  }
  if (s === '') return { label: 'UNKNOWN', tone: 'warn' }
  return { label: `NOT ACTIVE (status code ${s})`, tone: 'warn' }
}

const dgft01: ApiDef = {
  id: 'DGFT/01',
  name: 'Check an importer-exporter code (IEC)',
  inputs: [{ key: 'iecnumber', label: 'IEC number', pattern: /^[0-9]{10}$/, hint: '10 digits, like 0388197021' }],
  parse: safe((body) => {
    const e = early(body)
    if (e) return e
    const p = obj(payloadOf(body))
    if (!p) return warn('No record found for this IEC number.')
    if (clean(p.error) || clean(p.errorDescription)) {
      const why = clean(p.errorDescription) ?? clean(p.error)
      return warn(`No record found for this IEC number${why ? ` (${why})` : ''}.`)
    }
    const iecNo = clean(p.iecNumber)
    const name = clean(p.entityName)
    if (!iecNo && !name) return warn('No record found for this IEC number.')
    const st = iecState(p.iecStatus)
    const address = [clean(p.address1), clean(p.address2)].filter(Boolean).join(', ') || null
    return {
      found: true,
      tone: st.tone,
      summary: `IEC ${iecNo ?? ''} is ${st.label}${name ? ` for ${name}` : ''}.`.replace('IEC  ', 'IEC '),
      fields: filled([
        f('Entity name', name),
        { label: 'IEC status', value: st.label },
        field('IEC issue date', usDate(p.iecIssueDate)),
        f('PAN', p.pan),
        field('Address', address),
        f('City', p.city),
        f('State', p.state),
        f('PIN code', p.pinCode),
      ]),
      extra: { iecNumber: iecNo, entityName: name, iecActive: st.label === 'ACTIVE' },
    }
  }),
}

// Reads a policy word out of whatever field the answer has (not in the document's sample).
function policyWord(...vals: unknown[]): 'FREE' | 'RESTRICTED' | 'PROHIBITED' | null {
  for (const v of vals) {
    const s = (clean(v) ?? '').toUpperCase()
    if (/^PROHIBIT/.test(s)) return 'PROHIBITED'
    if (/^RESTRICT/.test(s)) return 'RESTRICTED'
    if (/^FREE/.test(s)) return 'FREE'
  }
  return null
}

const dgft02: ApiDef = {
  id: 'DGFT/02',
  name: 'Import policy for an ITC-HS code',
  inputs: [{ key: 'itchs', label: 'ITC-HS code', pattern: /^[0-9]{8}$/, hint: '8 digits, like 29035100' }],
  parse: safe((body) => {
    const e = early(body)
    if (e) return e
    const p = obj(payloadOf(body))
    if (!p) return warn('No import policy found for this code.')
    const err = clean(p.error)
    const descs = arr(p.productDescriptionImportPolicy)
    // the document spells it "poliicyCondition"; accept the correct spelling too
    const conds = arr(p.poliicyCondition ?? p.policyCondition)
    const main = arr(p.main)
    if (err && !descs.length && !conds.length) {
      return /record_not_found/i.test(err) || clean(p.errorDescription)
        ? warn(`No import policy found for this code${clean(p.errorDescription) ? ` (${clean(p.errorDescription)})` : ''}.`)
        : bad(`DGFT reports a problem: ${err}`)
    }
    if (!descs.length && !conds.length && !main.length && !clean(p.description)) {
      return warn('No import policy found for this code.')
    }
    const d0 = descs[0] ?? {}
    const code = clean(d0.hsCode)
    const word = policyWord(d0.policy, d0.importPolicy, d0.policyType, p.policy, p.importPolicy)
    const hs = `HS ${code ?? ''}`.trim()
    let summary: string
    let tone: 'good' | 'warn' | 'bad' | 'info'
    if (word === 'FREE') { summary = `${hs}: import policy FREE.`; tone = 'good' }
    else if (word) { summary = `${hs}: import policy ${word}.`; tone = 'bad' }
    else if (conds.length) {
      summary = `${hs}: import policy has ${conds.length} condition${conds.length > 1 ? 's' : ''}; read them before importing.`
      tone = 'warn'
    } else { summary = `${hs}: no import conditions listed (policy appears FREE).`; tone = 'good' }
    const short = (s: unknown) => { const t = clean(s); return t ? t.replace(/\s+/g, ' ') : null }
    return {
      found: true,
      tone,
      summary,
      fields: filled([
        f('HS code', code),
        field('Goods', short(d0.description)),
        f('Chapter', p.chapter),
        field('Chapter name', short(p.description)),
        f('Notification', d0.notificationNumber),
        f('Conditions', conds.length ? `${conds.length} (see table)` : null),
      ]),
      tables: [
        ...tbl('Import policy conditions', ['No.', 'Condition', 'Notification', 'Date'],
          conds.map((c) => [clean(c.slNo), short(c.notes), clean(c.notificationNumber), nice(c.notificationDate)])),
        ...tbl('Chapter notes', ['No.', 'Note'], main.map((c) => [clean(c.slNo), short(c.notes)])),
      ],
      extra: { hsCode: code, policy: word, conditionCount: conds.length },
    }
  }),
}

// ---------- Air cargo terminals (AAICLAS, ACMES) ----------

const AWB_INPUT = (key: string) => ({ key, label: 'Air waybill (AWB) number', pattern: /^[0-9]{11}$/, hint: '11 digits, like 61835488224' })
const LOCATION_INPUT = { key: 'location', label: 'Airport code', pattern: /^[A-Z]{1,3}$/, hint: '1 to 3 capital letters, like CCU', upper: true }
const HAWB_INPUT = { key: 'hawb', label: 'House air waybill (HAWB) number', pattern: /^[a-zA-Z0-9]{0,20}$/, hint: 'letters and digits only, up to 20; leave empty if none', optional: true }

function parseAirExport(body: any): Parsed {
  const e = early(body)
  if (e) return e
  const p = obj(payloadOf(body))
  const d = obj(p?.ExportTrackingData) ?? p
  if (!d) return warn('No record found for this AWB number.')
  const awb = obj(d.AWB)
  const hasAwb = !!awb && Object.values(awb).some((v) => clean(v) !== null)
  const sb = arr(d.SHIPPING_BILL), loc = arr(d.LOCATION_DETAILS), xr = arr(d.XRAY_DETAILS)
  const uld = arr(d.ULD_DETAILS), egm = arr(d.EGM_DETAILS)
  if (!hasAwb && ![sb, loc, xr, uld, egm].some((a) => a.length)) {
    return warn('No record found for this AWB number. Check the number (and airport) and try again.')
  }
  const dest = clean(awb?.Destination)
  const lastEgm = last(egm), lastUld = last(uld), lastXr = last(xr)
  let summary: string
  let tone: 'good' | 'info' = 'info'
  if (lastEgm) {
    summary = `Shipped: export manifest (EGM ${clean(lastEgm.EGMNo) ?? ''}) filed for flight ${clean(lastEgm.FlightNo) ?? '?'} on ${nice(lastEgm.FlightDate) ?? 'unknown date'}.`.replace('EGM  ', 'EGM ')
    tone = 'good'
  } else if (lastUld) {
    summary = `Loaded for flight ${clean(lastUld.FlightNo) ?? '?'} on ${nice(lastUld.FlightDate) ?? 'unknown date'} (container ${(clean(lastUld.ULDNo) ?? '').replace(/:$/, '') || 'not named'}).`
  } else if (lastXr) {
    summary = `X-ray done on ${nice(lastXr.XRayDate) ?? 'unknown date'}; waiting to be loaded.`
  } else if (hasAwb) {
    summary = `Cargo is at the terminal${dest ? `, going to ${dest}` : ''}.`
  } else {
    summary = 'Cargo record found at the terminal (shipping bill or location entries only).'
  }
  const flight = lastEgm ?? lastUld
  const lastLoc = last(loc)
  const locText = lastLoc ? Object.values(lastLoc).map(nice).filter(Boolean).join(' / ') || null : null
  return {
    found: true,
    tone,
    summary,
    fields: filled([
      field('Flight', flight ? [clean(flight.FlightNo), nice(flight.FlightDate)].filter(Boolean).join(', ') : null),
      field('X-ray done', lastXr ? [nice(lastXr.XRayDate), clean(lastXr.XRayBy)].filter(Boolean).join(', by ') : null),
      f('Going to', dest),
      f('Packages', awb?.Packages),
      field('Gross weight (kg)', clean(awb?.GrossWeight)),
      field('Chargeable weight (kg)', clean(awb?.ChargeableWeight)),
      field('Gate pass', nice(awb?.GatePassDateTime)),
      field('Handed over', nice(awb?.HandOverDateTime)),
      field('Cargo tendered (TDG)', nice(awb?.TDGDateTime)),
      field('Cargo bagged (BAG)', nice(awb?.BAGDateTime)),
      field('Last location entry', locText),
      f('Goods', lastEgm?.Commodity),
    ]),
    tables: [
      ...genericTable('Shipping bills', sb),
      ...genericTable('Location history', loc),
      ...tbl('X-ray', ['Date', 'Machine', 'Done by'], xr.map((r) => [nice(r.XRayDate), clean(r.XRayMachine), clean(r.XRayBy)])),
      ...tbl('Containers (ULD) loaded', ['ULD number', 'Type', 'Status', 'Flight', 'Flight date'],
        uld.map((r) => [(clean(r.ULDNo) ?? '').replace(/:$/, '') || null, clean(r.ULDType), clean(r.Status), clean(r.FlightNo), nice(r.FlightDate)])),
      ...tbl('Export manifest (EGM)', ['EGM no.', 'EGM date', 'Flight', 'Flight date', 'Departed', 'Goods', 'Packages', 'Weight (kg)'],
        egm.map((r) => [clean(r.EGMNo), nice(r.EGMYear), clean(r.FlightNo), nice(r.FlightDate), nice(r.ATD), clean(r.Commodity), clean(r.Packages), clean(r.GrossWeight)])),
    ],
    extra: {
      destination: dest,
      flightNo: clean(flight?.FlightNo),
      egmNo: clean(lastEgm?.EGMNo),
      shippingBillCount: sb.length,
      xrayDone: xr.length > 0,
    },
  }
}

function parseAirImport(body: any): Parsed {
  const e = early(body)
  if (e) return e
  const p = obj(payloadOf(body))
  const d = obj(p?.ImportTrackingData) ?? p
  if (!d) return warn('No record found for this AWB number.')
  const awb = obj(d.AWB_DETAILS)
  const igm = arr(d.IGM_DETAILS), dos = arr(d.DO_DETAILS), gps = arr(d.GP_DETAILS), loc = arr(d.LOC_DETAILS)
  // A stray delivery-order line alone (ULIP does this when the HAWB is wrong) is not a real record.
  if (!awb && !igm.length && !gps.length && !loc.length) {
    return warn('No record found for this AWB number. Check the AWB, house AWB and airport, then try again.')
  }
  const gp = last(gps), dord = last(dos), flt = last(igm)
  const who = (v: unknown) => (clean(v) === '0' ? 'Master (airline) delivery order' : clean(v))
  const delivered = !!gp && /DELIVER/i.test(clean(gp.DocStatus) ?? '')
  let summary: string
  let tone: 'good' | 'info' | 'warn' = 'info'
  if (gp) {
    summary = delivered
      ? `Delivered: gate pass ${clean(gp.GatePassNo) ?? ''} issued on ${nice(gp.GeneratedOn) ?? 'unknown date'}.`.replace('pass  ', 'pass ')
      : `Gate pass ${clean(gp.GatePassNo) ?? ''} issued on ${nice(gp.GeneratedOn) ?? 'unknown date'} (${clean(gp.DocStatus) ?? 'status not given'}).`.replace('pass  ', 'pass ')
    tone = delivered ? 'good' : 'info'
  } else if (dord) {
    summary = `Delivery order issued on ${nice(dord.DODate) ?? 'unknown date'}${clean(dord.DOIssuedTo) ? ` to ${clean(dord.DOIssuedTo)}` : ''}; gate pass not issued yet.`
  } else if (flt) {
    summary = `Arrived on flight ${clean(flt.FlightNo) ?? '?'}${nice(flt.ATA) ? ` at ${nice(flt.ATA)}` : ''}; delivery order not issued yet.`
    tone = 'warn'
  } else {
    summary = 'Cargo record found, but no flight, delivery order or gate pass is shown yet.'
    tone = 'warn'
  }
  const damaged = Number(clean(awb?.DamagedPackages) ?? 0)
  if (damaged > 0) {
    summary += ` Warning: ${damaged} damaged package${damaged > 1 ? 's' : ''}.`
    tone = 'bad'
  }
  return {
    found: true,
    tone,
    summary,
    fields: filled([
      field('Flight', flt ? [clean(flt.FlightNo), nice(flt.FlightDate)].filter(Boolean).join(', ') : null),
      field('Arrived (ATA)', nice(flt?.ATA)),
      f('Cargo sorted (segregation)', flt?.SegregationStatus),
      f('IGM number', awb?.IgmNo ?? flt?.IgmNo),
      f('IGM year', awb?.IgmYear ?? flt?.IgmYear),
      f('Packages arrived', awb?.ArrivedPackages),
      field('Weight arrived (kg)', clean(awb?.ArrivedWeight)),
      field('Chargeable weight (kg)', clean(awb?.ChargeableWeight)),
      f('Damaged packages', awb?.DamagedPackages),
      field('Delivery order', dord ? [nice(dord.DODate), clean(dord.DOIssuedTo) ? `to ${clean(dord.DOIssuedTo)}` : null].filter(Boolean).join(' ') : null),
      f('Gate pass number', gp?.GatePassNo),
      f('Gate pass status', gp?.DocStatus),
      f('House AWB', awb?.HawbNo),
    ]),
    tables: [
      ...tbl('Flight arrival', ['IGM no.', 'Year', 'Flight', 'Flight date', 'Arrived (ATA)', 'Sorting date', 'Sorting status'],
        igm.map((r) => [clean(r.IgmNo), clean(r.IgmYear), clean(r.FlightNo), nice(r.FlightDate), nice(r.ATA), nice(r.SegregationDate), clean(r.SegregationStatus)])),
      ...tbl('Delivery orders', ['Date', 'Issued by', 'Issued to', 'House AWB'],
        dos.map((r) => [nice(r.DODate), clean(r.DOIssuedBy), clean(r.DOIssuedTo), who(r.HawbNo)])),
      ...tbl('Gate passes', ['Gate pass no.', 'Packages delivered', 'Issued on', 'Status'],
        gps.map((r) => [clean(r.GatePassNo), clean(r.DeliveryPackages), nice(r.GeneratedOn), clean(r.DocStatus)])),
      ...genericTable('Location history', loc),
    ],
    extra: {
      awbNo: clean(awb?.AwbNo),
      hawbNo: clean(awb?.HawbNo),
      igmNo: clean(awb?.IgmNo ?? flt?.IgmNo),
      igmYear: clean(awb?.IgmYear ?? flt?.IgmYear),
      gatePassNo: clean(gp?.GatePassNo),
      delivered,
    },
  }
}

const aaiclas01: ApiDef = {
  id: 'AAICLAS/01',
  name: 'Air export cargo at the terminal (AAICLAS)',
  inputs: [AWB_INPUT('awbNumber'), LOCATION_INPUT],
  parse: safe(parseAirExport),
}

const aaiclas02: ApiDef = {
  id: 'AAICLAS/02',
  name: 'Air import cargo at the terminal (AAICLAS)',
  inputs: [AWB_INPUT('awbNumber'), HAWB_INPUT, LOCATION_INPUT],
  buildBody: (q) => ({ awbNumber: q.awbNumber, hawb: q.hawb ?? '', location: q.location }),
  parse: safe(parseAirImport),
}

const acmes01: ApiDef = {
  id: 'ACMES/01',
  name: 'Air export cargo at the terminal (ACMES)',
  inputs: [AWB_INPUT('awbnumber')],
  parse: safe(parseAirExport),
}

const acmes02: ApiDef = {
  id: 'ACMES/02',
  name: 'Air import cargo at the terminal (ACMES)',
  inputs: [AWB_INPUT('awbnumber'), HAWB_INPUT],
  buildBody: (q) => ({ awbnumber: q.awbnumber, hawb: q.hawb ?? '' }),
  parse: safe(parseAirImport),
}

// ---------- FOIS (Indian Railways freight) ----------

// "22:10 20-09-2023" -> "20 Sep 2023, 22:10"
function foisTime(v: unknown): string | null {
  const s = clean(v)
  if (!s) return null
  const m = s.match(/^(\d{1,2}:\d{2})\s+(\d{1,2}-\d{1,2}-\d{4})$/)
  return m ? `${prettyDate(m[2])}, ${m[1]}` : nice(s)
}

const FOIS_NOT_FOUND = 'No record found for this number.'

const fois01: ApiDef = {
  id: 'FOIS/01',
  name: 'Where is my rail consignment (FNR)',
  inputs: [{ key: 'fnrnumber', label: 'FNR number', pattern: /^[0-9]{11}$/, hint: '11 digits, like 21030407355' }],
  parse: safe((body) => {
    const e = early(body)
    if (e) return e
    const recs = arr(Array.isArray(payloadOf(body)) ? payloadOf(body) : [payloadOf(body)])
    const r = recs.find((x) => clean(x.fnrNo) || clean(x.currentStatus) || clean(x.lastRepLocn))
    if (!r) {
      const err = clean(recs[0]?.error)
      return warn(err ? `${FOIS_NOT_FOUND} (${err})` : FOIS_NOT_FOUND)
    }
    const status = clean(r.currentStatus)
    const fnr = clean(r.fnrNo)
    const reached = /REACHED|DELIVER|ARRIV/i.test(status ?? '')
    const where = clean(r.lastRepLocn)
    return {
      found: true,
      tone: reached ? 'good' : 'info',
      summary: status
        ? `FNR ${fnr ?? ''}: ${status}.`.replace('FNR : ', '')
        : `FNR ${fnr ?? ''}: last reported at ${where ?? 'an unknown place'}.`.replace('FNR : ', ''),
      fields: filled([
        f('Current status', status),
        f('Last reported location', where),
        field('Expected arrival (ETA)', foisTime(r.etaDstn)),
        f('From', r.stationFrom),
        f('To', r.stationTo),
        f('Goods', r.cmdt),
        f('Last report code', r.lastRepStts),
        f('Engine number', r.locoNumb),
        f('New FNR', r.newFnr),
        f('FNR number', fnr),
      ]),
      extra: {
        fnrNo: fnr,
        reachedDestination: reached,
        lastLocation: where,
        latitude: clean(r.lttd),
        longitude: clean(r.lgtd),
      },
    }
  }),
}

const STATION = (key: string, label: string) => ({ key, label, pattern: /^[A-Za-z0-9]{2,10}$/, hint: 'station code, like NZM', upper: true })

function money(v: unknown): string | null {
  const s = clean(v)
  return s ? `Rs ${s}` : null
}

const fois02: ApiDef = {
  id: 'FOIS/02',
  name: 'Rail freight charges for a route',
  inputs: [
    STATION('sttnfrom', 'From station'),
    STATION('sttnto', 'To station'),
    { key: 'cmdt', label: 'Goods (commodity)', pattern: /^[A-Za-z0-9]{2,10}$/, hint: 'commodity name or code, like CEMENT', upper: true },
    { key: 'wgontype', label: 'Wagon type', pattern: /^[A-Za-z0-9]{2,10}$/, hint: 'wagon type, like BOXN', upper: true },
  ],
  parse: safe((body) => {
    const e = early(body)
    if (e) return e
    const p = obj(payloadOf(body))
    const stts = obj(p?.stts)
    const fr = obj(p?.frgt)
    const err = clean(stts?.error) ?? clean(p?.error)
    if (!fr || !Object.values(fr).some((v) => clean(v) !== null)) {
      return err ? bad(`Railways reports a problem: ${err}`) : warn('No freight calculation returned for these stations, goods and wagon type.')
    }
    const trainTotal = clean(fr.trantotlfrgt) ?? clean(fr.tranfinlfrgt)
    const wagonTotal = clean(fr.wgontotlfrgt) ?? clean(fr.wgonfinlfrgt)
    const dtl = (list: unknown) => arr(list).map((r) => [clean(r.rebtcode), clean(r.desc), clean(r.prcn) ? `${clean(r.prcn)}%` : null, clean(r.rebtamnt)])
    const route = arr(fr.atlrout).map((r) => [clean(r.sttnfrom), clean(r.sttnto)])
    const parts = [
      trainTotal ? `Rs ${trainTotal} for a full train load (rake)` : null,
      wagonTotal ? `Rs ${wagonTotal} as wagon load` : null,
    ].filter(Boolean)
    return {
      found: true,
      tone: 'info',
      summary: parts.length ? `Total freight: ${parts.join(', or ')}.` : 'Freight calculation received; see the details below.',
      fields: filled([
        field('Total freight, train load (rake)', money(trainTotal)),
        field('Total freight, wagon load', money(wagonTotal)),
        field('Distance (km)', clean(fr.dist)),
        f('Route type', fr.routInfo),
        f('Via', fr.viaDesc),
        f('Goods class (train / wagon load)', [clean(fr.cmdtClssTL), clean(fr.cmdtClssWL)].filter(Boolean).join(' / ') || null),
        field('Rate per tonne (train / wagon load)', [clean(fr.rateTL), clean(fr.rateWL)].filter(Boolean).join(' / ') || null),
        field('Chargeable weight (tonnes)', clean(fr.totlchblwght)),
        f('Wagons in a rake', fr.rakeSize),
        field('Wagon carrying capacity (tonnes)', clean(fr.PCC)),
        field('GST, train load', money(fr.trangsttax)),
        field('GST, wagon load', money(fr.wgongsttax)),
        f('Surcharge', fr.surchrg),
        f('Other charges', fr.othrchrg),
        f('Transit time (ETA)', fr.ETA),
      ]),
      tables: [
        ...tbl('Surcharges', ['Code', 'Description', 'Percent', 'Amount'], dtl(fr.transurchrgdtls)),
        ...tbl('Other charges', ['Code', 'Description', 'Percent', 'Amount'], dtl(fr.tranothrchrgdtls)),
        ...tbl('Rebates', ['Code', 'Description', 'Percent', 'Amount'], dtl(fr.tranrebtchrgdtls)),
        ...tbl('Stations', ['From', 'To'], route),
      ],
      extra: { trainLoadTotal: trainTotal, wagonLoadTotal: wagonTotal, distanceKm: clean(fr.dist) },
    }
  }),
}

const fois04: ApiDef = {
  id: 'FOIS/04',
  name: 'Rail parcel status (parcel waybill)',
  inputs: [{ key: 'lngpwbltno', label: 'Parcel waybill number', pattern: /^[0-9]{10}$/, hint: '10 digits, like 4002411032' }],
  parse: safe((body) => {
    const e = early(body)
    if (e) return e
    const pl = payloadOf(body)
    const recs = arr(Array.isArray(pl) ? pl : [pl])
    const first = recs[0]
    const rr = obj(first?.RR) ?? (first && clean(first.PWBLTNO) ? first : null)
    if (!rr) {
      const err = clean(first?.error)
      return warn(err ? `No parcel found for this number (${err.replace(/\.+$/, '')}).` : 'No parcel found for this number.')
    }
    const prnt = obj(rr.ITMDET_PRNT)
    const items = arr(Array.isArray(prnt?.ITMDET) ? prnt?.ITMDET : prnt?.ITMDET ? [prnt.ITMDET] : [])
    const it = last(items)
    const status = clean(it?.STATUS)
    const delivered = /DELIVER/i.test(status ?? '')
    const no = clean(rr.PWBLTNO)
    const when = nice(it?.STATUS_DT)
    return {
      found: true,
      tone: delivered ? 'good' : 'info',
      summary: status
        ? `Parcel ${no ?? ''}: ${status}${when ? ` on ${when}` : ''}.`.replace('Parcel : ', 'Parcel: ')
        : `Parcel ${no ?? ''} found, but no status is shown yet.`,
      fields: filled([
        f('Status', status),
        field('Status date', when),
        f('From station', rr.FSTN),
        f('To station', rr.TSTN),
        field('Booked on', nice(rr.BDT)),
        f('Goods', it?.DESC),
        f('Items', it?.TOTITMS),
        f('Type', rr.SCALE),
        f('Consignor', rr.CNOR),
        f('Consignee', rr.CNEE),
        f('Consignee address', rr.CNEEADD),
        f('Train number (loaded / unloaded)', [clean(it?.LOADTRAIN), clean(it?.UNLOADTRAIN)].filter(Boolean).join(' / ') || null),
      ]),
      tables: tbl('Parcel movement', ['Item', 'Loaded on', 'Unloaded on', 'Status', 'Status date'],
        items.map((r) => [clean(r.DESC), nice(r.LOADSTATUS_DT), nice(r.UNLOADSTATUS_DT), clean(r.STATUS), nice(r.STATUS_DT)])),
      extra: { waybillNo: no, delivered },
    }
  }),
}

// ---------- LDB (container tracking) ----------

function eventRows(list: Record<string, any>[]): (string | null)[][] {
  const sorted = [...list].sort((a, b) => (Number(b.timeinms) || 0) - (Number(a.timeinms) || 0))
  return sorted.map((r) => [
    nice(r.timestamptimezone),
    clean(r.eventname),
    clean(r.currentlocation),
    clean(r.transportmode),
    clean(r.isempty) ? (/^y/i.test(clean(r.isempty)!) ? 'Empty' : 'Loaded') : null,
  ])
}

function vesselRow(r: Record<string, any>): (string | null)[] {
  return [clean(r.vesselname), clean(r.shippingline), nice(r.timetimestamp), clean(r.orgname)]
}

const ldb01: ApiDef = {
  id: 'LDB/01',
  name: 'Track a container (Logistics Data Bank)',
  inputs: [{ key: 'containerNumber', label: 'Container number', pattern: /^[A-Z]{4}[0-9]{7}$/, hint: '4 letters and 7 digits, like ACMP1000010', upper: true }],
  parse: safe((body) => {
    const e = early(body)
    if (e) return e
    const p = obj(payloadOf(body))
    if (!p) return warn('No record found for this container number.')
    const hasData = (t: Record<string, any> | null) => !!t && (!!obj(t.cntrDetail) || arr(t.last_event).length > 0 || arr(t.trackLog).length > 0)
    const trails = [
      { name: 'Container movement', t: obj(p.eximContainerTrail) },
      { name: 'Domestic container movement', t: obj(p.domesticContainerTrail) },
    ].filter((x) => hasData(x.t))
    if (!trails.length) {
      const m = clean(obj(p.eximContainerTrail)?.res_Message) ?? clean(obj(p.domesticContainerTrail)?.res_Message)
      return warn(`No record found for this container number${m && !/^no record found$/i.test(m) ? ` (${m})` : ''}.`)
    }
    const main = trails[0].t!
    const det = obj(main.cntrDetail)
    const history = arr(main.trackLog)
    const lastEvents = arr(main.last_event)
    const latestRow = eventRows(lastEvents.length ? lastEvents : history)[0]
    const ev = latestRow ? { when: latestRow[0], name: latestRow[1], place: latestRow[2], mode: latestRow[3], empty: latestRow[4] } : null
    const cntr = clean(det?.cntrno) ?? clean(lastEvents[0]?.containernumber) ?? clean(history[0]?.containernumber)
    const eta = arr(main.vessel_eta)
    const ata = arr(main.vessel_ata)
    const etd = arr(main.vessel_etd)
    const atd = arr(main.vessel_atd)
    const dpd = obj(obj(main.dpd_dpe)?.c_import)
    const size = clean(det?.cntrsize)
    const summary = ev && ev.name
      ? `Container ${cntr ?? ''}: latest event ${ev.name}${ev.place ? ` at ${ev.place}` : ''}${ev.when ? ` on ${ev.when}` : ''}.`.replace('Container : ', 'Container: ')
      : `Container ${cntr ?? ''} found, but no movement events yet.`
    const vessels = (title: string, list: Record<string, any>[]) =>
      tbl(title, ['Vessel', 'Shipping line', 'Date and time', 'Port / terminal'], list.map(vesselRow))
    return {
      found: true,
      tone: 'info',
      summary,
      fields: filled([
        field('Latest event', ev?.name),
        field('Where', ev?.place),
        field('When', ev?.when),
        field('Moved by', ev?.mode),
        field('Empty or loaded', ev?.empty),
        field('Size (feet)', size),
        f('ISO type code', det?.isocode),
        f('Container type', det?.containertype),
        f('Reefer (refrigerated)', det?.refflg),
        f('Direct port delivery (DPD)', dpd?.dpd),
        f('Expected vessel', eta[0]?.vesselname),
        field('Vessel expected on', nice(eta[0]?.timetimestamp)),
        f('Shipping line', eta[0]?.shippingline),
      ]),
      tables: [
        ...tbl('Event history (latest first)', ['Date and time', 'Event', 'Place', 'Moved by', 'Empty or loaded'], eventRows(history)),
        ...vessels('Vessel expected', eta),
        ...vessels('Vessel arrived', ata),
        ...vessels('Vessel departure expected', etd),
        ...vessels('Vessel departed', atd),
        ...trails.slice(1).flatMap((x) =>
          tbl(`${x.name} (latest first)`, ['Date and time', 'Event', 'Place', 'Moved by', 'Empty or loaded'], eventRows(arr(x.t!.trackLog)))),
      ],
      extra: { containerNo: cntr, latestEvent: ev?.name ?? null, latestPlace: ev?.place ?? null },
    }
  }),
}

export const TRADE_AIR_RAIL_APIS: ApiDef[] = [
  dgft01, dgft02, aaiclas01, aaiclas02, acmes01, acmes02, fois01, fois02, fois04, ldb01,
]
