// ROAD APIs: FASTag, VAHAN (vehicle RC), SARATHI (driving licence), e-challan, e-way bill, toll rates.
// Spec: docs/ulip-specs/ROAD.md
import type { ApiDef, Field, InputDef, Parsed, Table } from './types.ts'
import { field, filled, payloadOf, prettyDate, text } from './helpers.ts'

// ---------------------------------------------------------------- small shared helpers

const MONTHS3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const p2 = (n: number | string) => String(n).padStart(2, '0')

// Any ULIP date style -> 'yyyy-mm-dd', or null
function isoDate(v: unknown): string | null {
  const s = text(v)
  if (!s) return null
  let y: string | undefined, m: number | undefined, d: string | undefined
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (r) { y = r[1]; m = +r[2]; d = r[3] }
  if (!r) { r = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); if (r) { d = r[1]; m = +r[2]; y = r[3] } }
  if (!r) {
    r = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[A-Za-z]*[- ](\d{4})/)
    if (r) { const i = MONTHS3.indexOf(r[2].toLowerCase()); if (i >= 0) { d = r[1]; m = i + 1; y = r[3] } }
  }
  if (!r) { r = s.match(/^(\d{2})(\d{2})(\d{4})$/); if (r) { d = r[1]; m = +r[2]; y = r[3] } }
  if (!y || !m || !d || m < 1 || m > 12 || +d < 1 || +d > 31) return null
  return `${y}-${p2(m)}-${p2(d)}`
}

// ULIP dates are Indian time but the function runs on UTC, so "now" is always built in IST (UTC+5:30).
function istNow(nowMs: number = Date.now()): { iso: string; hm: string } {
  const d = new Date(nowMs + 5.5 * 3600 * 1000)
  return {
    iso: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`,
    hm: `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`,
  }
}

function todayISO(nowMs?: number): string {
  return istNow(nowMs).iso
}

// A paper is valid through its "upto" date. true = ended before today.
function isPast(v: unknown, nowMs?: number): boolean {
  const i = isoDate(v)
  return !!i && i < todayISO(nowMs)
}

// "15 Sep 2020 (expired)" style value for a valid-upto date
function expField(label: string, v: unknown): Field {
  const f = field(label, v, 'date')
  if (f.value && isPast(v)) f.value += ' (expired)'
  return f
}

// Indian digit grouping: 1234567 -> ₹12,34,567
function inr(n: number): string {
  if (!isFinite(n)) return '₹0'
  const [i, d] = Math.abs(n).toFixed(2).split('.')
  const last3 = i.slice(-3)
  const rest = i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${n < 0 ? '-' : ''}₹${rest ? rest + ',' : ''}${last3}${d !== '00' ? '.' + d : ''}`
}

function num(v: unknown): number | null {
  const s = text(v)
  if (!s) return null
  const n = Number(s.replace(/[^\d.-]/g, ''))
  return isFinite(n) && /\d/.test(s) ? n : null
}

function asList(v: unknown): any[] {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object')
  if (v && typeof v === 'object') return [v]
  return []
}

const looksXml = (s: unknown): s is string => typeof s === 'string' && /<\s*[A-Za-z?]/.test(s) && s.includes('>')

// Answers that are not a normal record: no body, a text message ("service is down"), or a rejected request.
function oddShape(body: any): Parsed | null {
  if (!body || typeof body !== 'object') {
    return { found: false, tone: 'warn', summary: 'ULIP did not send a usable answer.', fields: [] }
  }
  const p = payloadOf(body)
  if (typeof p === 'string' && !looksXml(p)) {
    const t = text(p)
    return { found: false, tone: 'bad', summary: t ? `ULIP says: ${t}` : 'ULIP sent an empty message.', fields: [] }
  }
  const err = body.error === true || String(body.error).toLowerCase() === 'true'
  if (err && (p === null || p === undefined)) {
    const t = text(body.message)
    return { found: false, tone: 'bad', summary: t ? `ULIP rejected the request: ${t}` : 'ULIP rejected the request.', fields: [] }
  }
  return null
}

// Wraps a parser so that it can never throw
function safe(fn: (body: any) => Parsed): (body: any) => Parsed {
  return (body: any) => {
    try {
      return oddShape(body) ?? fn(body)
    } catch {
      return { found: false, tone: 'warn', summary: 'ULIP sent an answer in a shape this portal could not read.', fields: [] }
    }
  }
}

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '')

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&')
    .trim()
}

// Small <tag>value</tag> reader (no XML library). Never throws.
function xmlTag(xml: string, tag: string): string | null {
  try {
    const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = xml.match(new RegExp(`<${esc}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc}>`))
    return m ? text(decodeXml(m[1])) : null
  } catch {
    return null
  }
}

// Every simple <tag>value</tag> in an XML string as a flat map
function xmlFlat(xml: string): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  try {
    const re = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(xml))) {
      const k = norm(m[1])
      if (!(k in out) || out[k] === null) out[k] = text(decodeXml(m[2]))
    }
  } catch { /* leave what we have */ }
  return out
}

// ---------------------------------------------------------------- FASTAG

const TRUCK_NO = /^[A-Z0-9]{5,11}$|^[A-Z0-9]{17,20}$/

const DIRECTIONS: Record<string, string> = { N: 'North', S: 'South', E: 'East', W: 'West' }

// "18.7963,73.2921" → [lat, lng] when it is a real place in India, else null
function geocode(v: unknown): [number, number] | null {
  const m = String(v ?? '').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const lat = Number(m[1]), lng = Number(m[2])
  return lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 97.5 ? [lat, lng] : null
}

function txnIso(v: unknown): string | null {
  const m = String(v ?? '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/)
  if (m) return `${m[1]}T${m[2].length === 5 ? m[2] + ':00' : m[2]}`
  return isoDate(v)
}

const FASTAG_01: ApiDef = {
  id: 'FASTAG/01',
  name: 'Truck toll crossings (FASTag)',
  inputs: [
    { key: 'vehiclenumber', label: 'Truck number', pattern: TRUCK_NO, hint: 'Truck number without spaces, like MH04AB1234', upper: true },
  ],
  parse: safe((body) => {
    const p = payloadOf(body) || {}
    const veh = p.vehicle || {}
    const list = asList(veh.vehltxnList?.txn)
    const failed = String(p.result ?? '').toUpperCase() === 'FAILURE' || String(veh.errCode ?? '') === '740'
    if (failed || list.length === 0) {
      return { found: false, tone: 'warn', summary: 'No FASTag toll crossing found for this truck in the last 72 hours.', fields: [] }
    }
    const rows = list
      .map((t) => ({ t, iso: txnIso(t.readerReadTime) }))
      .sort((a, b) => (b.iso ?? '').localeCompare(a.iso ?? ''))
    const last = rows[0]
    const truck = text(last.t.vehicleRegNo) ?? 'This truck'
    const plaza = text(last.t.tollPlazaName) ?? 'a toll plaza'
    const when = prettyDate(last.iso ?? last.t.readerReadTime)
    const table: Table = {
      title: 'Toll crossings (newest first)',
      columns: ['Toll plaza', 'Time', 'Direction'],
      rows: rows.map(({ t, iso }) => [
        text(t.tollPlazaName),
        prettyDate(iso ?? t.readerReadTime),
        (() => { const d = text(t.laneDirection); return d === null ? null : (DIRECTIONS[d.toUpperCase()] ?? d) })(),
      ]),
    }
    return {
      found: true,
      tone: 'info',
      summary: `Truck ${truck} last crossed ${plaza}${when ? ` on ${when}` : ''}.`,
      fields: filled([
        field('Truck number', last.t.vehicleRegNo),
        field('Last toll plaza', last.t.tollPlazaName),
        field('Last seen', last.iso ?? last.t.readerReadTime, 'date'),
        field('Crossings in last 72 hours', rows.length),
      ]),
      tables: [table],
      extra: {
        lastPlaza: text(last.t.tollPlazaName), lastSeenAt: last.iso, crossings: rows.length,
        // for the map: newest first, with the plaza's position when FASTag gives one
        points: rows.map(({ t, iso }) => ({ plaza: text(t.tollPlazaName), at: iso, dir: text(t.laneDirection), pos: geocode(t.tollPlazaGeocode) })),
      },
    }
  }),
}

// FASTAG/02 answers name/value pairs: detail: [{name:'TAGID', value:'...'}, ...]
function pairsToRecord(detail: unknown): Record<string, string | null> {
  const rec: Record<string, string | null> = {}
  for (const d of asList(detail)) {
    const k = text(d.name)
    if (k) rec[k.toUpperCase()] = text(d.value)
  }
  return rec
}

// NPCI NETC exception codes
const EXC_CODES: Record<string, { text: string; bad: boolean }> = {
  '01': { text: 'hotlisted', bad: true },
  '02': { text: 'exempted vehicle', bad: false },
  '03': { text: 'low balance', bad: true },
  '04': { text: 'invalid carriage', bad: true },
  '05': { text: 'BLACKLISTED', bad: true },
  '06': { text: 'tag closed/replaced', bad: true },
}

const FASTAG_02: ApiDef = {
  id: 'FASTAG/02',
  oneOf: true,
  name: 'FASTag status of a truck or tag',
  inputs: [
    { key: 'vehiclenumber', label: 'Truck number', pattern: TRUCK_NO, hint: 'Truck number, like MH04AB1234 (give this OR the FASTag ID)', upper: true, optional: true },
    { key: 'tagid', label: 'FASTag ID', pattern: /^[A-Z0-9]{1,25}$/, hint: 'FASTag ID from the tag, up to 25 letters/digits (give this OR the truck number)', upper: true, optional: true },
  ],
  // ULIP wants exactly one of the two filled; the other is sent empty
  buildBody: (params) => ({ vehiclenumber: params.vehiclenumber ?? '', tagid: params.tagid ?? '' }),
  parse: safe((body) => {
    const p = payloadOf(body) || {}
    const veh = p.vehicle || {}
    const tags = asList(veh.vehicledetails).map((g) => pairsToRecord(g.detail)).filter((r) => Object.keys(r).length > 0)
    const failed = String(p.result ?? '').toUpperCase() === 'FAILURE'
    if (failed || tags.length === 0) {
      return { found: false, tone: 'warn', summary: 'No FASTag found for this truck or tag ID.', fields: [] }
    }
    const isActive = (r: Record<string, string | null>) => (r.TAGSTATUS ?? '').toUpperCase() === 'A'
    const active = tags.filter(isActive)
    const shown = active[0] ?? tags[0]
    const truck = shown.REGNUMBER ?? 'this vehicle'
    const exc = (r: Record<string, string | null>) => (r.EXCCODE ?? '').trim()
    const codesOf = (r: Record<string, string | null>) => exc(r).split(',').map((c) => c.trim()).filter((c) => c !== '' && !/^0+$/.test(c)).map((c) => c.padStart(2, '0'))
    const problems: string[] = []
    let blacklisted = false
    let lowBalance = false
    for (const r of active) {
      for (const c of codesOf(r)) {
        const meaning = EXC_CODES[c]
        if (!meaning) problems.push(`FASTag has a bank flag (code ${c})`)
        else if (meaning.bad) problems.push(`FASTag is ${meaning.text}`)
        if (c === '01' || c === '05') blacklisted = true
        if (c === '03') lowBalance = true
      }
    }
    let tone: Parsed['tone']
    let summary: string
    if (active.length === 0) {
      tone = 'bad'
      summary = `No active FASTag for ${truck}: all ${tags.length} tag${tags.length === 1 ? '' : 's'} on record are inactive.`
    } else if (problems.length) {
      tone = 'bad'
      summary = `${truck}: ${[...new Set(problems)].join('; ')}. (Flag meanings are from the NPCI NETC code list.)`
    } else {
      tone = 'good'
      summary = `FASTag for ${truck} is active${tags.length > 1 ? ` (${active.length} of ${tags.length} tags on record are active)` : ''}.`
    }
    const statusWord = (r: Record<string, string | null>) =>
      isActive(r) ? 'Active' : (r.TAGSTATUS ?? '').toUpperCase() === 'I' ? 'Inactive' : (r.TAGSTATUS ?? null)
    const yesNo = (v: string | null | undefined) => (v == null ? null : v.toUpperCase() === 'T' ? 'Yes' : v.toUpperCase() === 'F' ? 'No' : v)
    return {
      found: true,
      tone,
      summary,
      fields: filled([
        field('Truck number', shown.REGNUMBER),
        field('Tag status', statusWord(shown)),
        field('FASTag ID', shown.TAGID),
        field('Vehicle class code', shown.VEHICLECLASS),
        field('Commercial vehicle', yesNo(shown.COMVEHICLE)),
        field('Tag issued on', shown.ISSUEDATE, 'date'),
        field('Bank flag', codesOf(shown).map((c) => EXC_CODES[c]?.text ?? `code ${c}`).join(', ') || null),
        field('Tags on record', tags.length),
      ]),
      tables: [{
        title: 'FASTags on record',
        columns: ['FASTag ID', 'Truck number', 'Status', 'Issued on', 'Bank flag'],
        rows: tags.map((r) => [r.TAGID, r.REGNUMBER, statusWord(r), prettyDate(r.ISSUEDATE), codesOf(r).map((c) => EXC_CODES[c]?.text ?? `code ${c}`).join(', ') || null]),
      }],
      extra: {
        vehicleNumber: shown.REGNUMBER,
        activeTagIds: active.map((r) => r.TAGID).filter(Boolean),
        blacklisted,
        lowBalance,
      },
    }
  }),
}

// ---------------------------------------------------------------- VAHAN (vehicle RC)

type Flat = Record<string, string | null>

// One flat map for both answer styles: XML text (rc_regn_no) or JSON object (rcRegnNo)
function vahanFlat(payload: any): Flat {
  if (typeof payload === 'string') return xmlFlat(payload)
  const out: Flat = {}
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    for (const [k, v] of Object.entries(payload)) {
      if (v === null || typeof v === 'object') { out[norm(k)] = null; continue }
      out[norm(k)] = text(v)
    }
  }
  return out
}

function pick(d: Flat, ...names: string[]): string | null {
  for (const n of names) {
    const v = d[norm(n)]
    if (v) return v
  }
  return null
}

// finds the first value whose key matches (used for the permit date, whose exact tag is not in the document)
function pickLike(d: Flat, re: RegExp): string | null {
  for (const [k, v] of Object.entries(d)) if (v && re.test(k)) return v
  return null
}

function parseVahan(what: string) {
  return safe((body) => {
    const outer = Array.isArray(body?.response) ? body.response[0] : null
    const payload = payloadOf(body)
    const d = vahanFlat(payload)
    const regNo = pick(d, 'rc_regn_no', 'rcRegnNo')
    const statusMsg = pick(d, 'stautsMessage', 'statusMessage')
    const notFoundText = (outer && typeof outer.message === 'object' && outer.message ? text(outer.message.text) : null)
    if (!regNo || (statusMsg && /not\s*found/i.test(statusMsg))) {
      return {
        found: false,
        tone: 'warn',
        summary: `No vehicle found for this ${what}${notFoundText ? ` (ULIP says: ${notFoundText})` : ''}.`,
        fields: [],
      }
    }

    const status = pick(d, 'rc_status', 'rcStatus')
    const blacklist = pick(d, 'rc_blacklist_status', 'rcBlacklistStatus')
    const regUpto = pick(d, 'rc_regn_upto', 'rcRegnUpto')
    const fitUpto = pick(d, 'rc_fit_upto', 'rcFitUpto')
    const insUpto = pick(d, 'rc_insurance_upto', 'rcInsuranceUpto')
    const pucUpto = pick(d, 'rc_pucc_upto', 'rcPuccUpto', 'rc_puc_upto')
    const permitUpto = pick(d, 'rc_permit_valid_upto', 'rcPermitValidUpto', 'rc_permit_upto', 'rcPermitUpto')
      ?? pickLike(d, /^(?!.*(from|issue|frm|start)).*permit.*(upto|valid|todt|enddt)/)
    const npUpto = pick(d, 'rc_np_upto', 'rcNpUpto')
    const taxUpto = pick(d, 'rc_tax_upto', 'rcTaxUpto')
    const maker = pick(d, 'rc_maker_desc', 'rcMakerDesc')
    const model = pick(d, 'rc_maker_model', 'rcMakerModel')

    const problems: string[] = []
    const okPapers: string[] = []
    if (status && !/^\s*active/i.test(status)) problems.push(`RC is not active (status: ${status})`)
    if (blacklist && !/^(n|no|none|na|nil|0|false|not blacklisted)\.?$/i.test(blacklist.trim())) {
      problems.push(`vehicle is BLACKLISTED (${blacklist})`)
    }
    const checks: [string, string | null][] = [
      ['registration', regUpto], ['fitness', fitUpto], ['insurance', insUpto], ['PUC', pucUpto], ['permit', permitUpto],
      ['national permit', npUpto], ['road tax', taxUpto],
    ]
    for (const [label, v] of checks) {
      if (!v) continue
      if (isPast(v)) problems.push(`${label} expired on ${prettyDate(v)}`)
      else if (label !== 'registration') okPapers.push(label)
    }

    let tone: Parsed['tone']
    let summary: string
    if (problems.length) {
      tone = 'bad'
      summary = `${regNo}: ${problems.join('; ')}.`
    } else {
      tone = 'good'
      summary = `Vehicle ${regNo} is ${status ? status.toLowerCase() : 'registered'}${okPapers.length ? `; ${okPapers.join(', ')} in date` : ''}.`
    }

    const iso = (v: string | null) => isoDate(v)
    return {
      found: true,
      tone,
      summary,
      fields: filled([
        field('Vehicle number', regNo),
        field('RC status', status),
        field('Blacklist status', blacklist),
        field('Owner', pick(d, 'rc_owner_name', 'rcOwnerName')),
        field('Vehicle class', pick(d, 'rc_vhclass_desc', 'rcVhClassDesc', 'rc_vh_class_desc')),
        field('Maker and model', [maker, model].filter(Boolean).join(' - ') || null),
        field('Registered at', pick(d, 'rc_registered_at', 'rcRegisteredAt')),
        expField('Fitness valid until', fitUpto),
        expField('Insurance valid until', insUpto),
        expField('PUC valid until', pucUpto),
        expField('Permit valid until', permitUpto),
        expField('National permit valid until', npUpto),
        expField('Road tax paid until', taxUpto),
        expField('RC valid until', regUpto),
        field('Chassis number', pick(d, 'rc_chasi_no', 'rcChasiNo')),
        field('Engine number', pick(d, 'rc_eng_no', 'rcEngNo')),
      ]),
      extra: {
        vehicleNumber: regNo,
        rcStatus: status,
        blacklisted: !!blacklist && !/^(n|no|none|na|nil|0|false|not blacklisted)\.?$/i.test(blacklist.trim()),
        fitnessUpto: iso(fitUpto),
        insuranceUpto: iso(insUpto),
        pucUpto: iso(pucUpto),
        permitUpto: iso(permitUpto),
        nationalPermitUpto: iso(npUpto),
        taxUpto: iso(taxUpto),
        problems,
      },
    }
  })
}

function vahanApi(id: string, name: string, input: InputDef, what: string): ApiDef {
  return { id, name, inputs: [input], parse: parseVahan(what) }
}

const VEH_NO_INPUT: InputDef = {
  key: 'vehiclenumber', label: 'Truck number', pattern: /^[A-Z0-9]{5,11}$/, hint: 'Truck number without spaces, like MH04AB1234', upper: true,
}

// ---------------------------------------------------------------- SARATHI (driving licence)

// SARATHI/01 needs the format "GJ04 20120005008" (space) or "GJ-04..."; add the space if staff typed it joined.
function dlForSarathi01(raw: string): string {
  const s = String(raw ?? '').trim().toUpperCase()
  const compact = s.replace(/[\s-]+/g, '')
  const m = compact.match(/^([A-Z]{2}\d{2})((?:19|20)\d{9})$/)
  return m ? `${m[1]} ${m[2]}` : s
}

const DL_INPUT: InputDef = {
  key: 'dlnumber',
  label: 'Driving licence number',
  pattern: /^[A-Za-z0-9][A-Za-z0-9 -]{8,24}$/,
  hint: 'Licence number like GJ04 20120005008 or UP9620110001440',
}

type DlInfo = {
  status: string | null
  holder: string | null
  ntFrom: string | null; ntTo: string | null
  trFrom: string | null; trTo: string | null
  classes: [string | null, string | null][]
  issued: string | null
  rto: string | null
}

function dlVerdict(i: DlInfo): Parsed {
  const status = i.status ? i.status.replace(/\.+$/, '').trim() : null
  const badStatus = !!status && /(inactive|suspend|cancel|revok|expire|surrender|disqualif|blacklist|debar)/i.test(status)
  const trPast = isPast(i.trTo)
  const ntPast = isPast(i.ntTo)
  const fields = filled([
    field('Licence status', status),
    field('Holder', i.holder),
    expField('Valid for trucks (transport) until', i.trTo),
    expField('Valid for cars (non-transport) until', i.ntTo),
    field('Issued on', i.issued, 'date'),
    field('Issuing RTO', i.rto),
  ])
  const tables: Table[] = i.classes.length
    ? [{ title: 'Vehicle classes allowed', columns: ['Class', 'Code'], rows: i.classes.map(([a, b]) => [a, b]) }]
    : []
  let tone: Parsed['tone']
  let summary: string
  if (badStatus) {
    tone = 'bad'
    summary = `Licence status is ${status}.`
  } else if (i.trTo && trPast) {
    tone = 'bad'
    summary = `Licence transport validity (for trucks) expired on ${prettyDate(i.trTo)}.`
  } else if (i.trTo) {
    tone = 'good'
    summary = `Licence is valid for driving trucks until ${prettyDate(i.trTo)}${status ? ` (status ${status})` : ''}.`
  } else if (i.ntTo && ntPast) {
    tone = 'bad'
    summary = `Licence expired on ${prettyDate(i.ntTo)} and has no transport (truck) validity.`
  } else if (i.ntTo) {
    tone = 'warn'
    summary = `Licence has no transport (truck) validity; valid for non-transport vehicles until ${prettyDate(i.ntTo)}.`
  } else {
    tone = 'info'
    summary = `Licence record found${status ? `, status ${status}` : ''}; validity dates were not given.`
  }
  return {
    found: true,
    tone,
    summary,
    fields,
    tables,
    extra: {
      dlStatus: status,
      transportValidUpto: isoDate(i.trTo),
      nonTransportValidUpto: isoDate(i.ntTo),
    },
  }
}

const dlNotFound = (msg?: string | null): Parsed => ({
  found: false,
  tone: 'warn',
  summary: `No driving licence found${msg ? ` (ULIP says: ${msg})` : ' for these details'}.`,
  fields: [],
})

const SARATHI_01: ApiDef = {
  id: 'SARATHI/01',
  name: 'Driving licence check (with date of birth)',
  inputs: [
    DL_INPUT,
    { key: 'dob', label: 'Date of birth', pattern: /^\d{4}-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01])$/, hint: 'Date of birth', kind: 'isoDate' },
  ],
  buildBody: (params) => ({ dlnumber: dlForSarathi01(params.dlnumber), dob: params.dob }),
  // The document does not contain the found answer (it is in a Word file we do not have), so this is a defensive reader.
  // It uses the field names seen in the old sarathi-dl-full function (dldetobj[0].dlobj / bioObj / dlcovs) and falls back
  // to "found" when the record has any real content. It never reads Aadhaar, mobile, address or photo.
  parse: safe((body) => {
    const p = payloadOf(body)
    const list = asList(p?.dldetobj)
    const rec = list[0]
    if (!rec) {
      return p && typeof p === 'object' && Object.keys(p).length
        ? { found: false, tone: 'warn', summary: 'ULIP answered, but without a licence record.', fields: [] }
        : dlNotFound()
    }
    const errMsg = text(rec.erormsg) ?? text(rec.errormsg) ?? text(rec.errormessage)
    if (Number(rec.errorcd) === -1 || (errMsg && !rec.dlobj && !rec.bioObj)) return dlNotFound(errMsg)
    const dl = rec.dlobj && typeof rec.dlobj === 'object' ? rec.dlobj : {}
    const bio = rec.bioObj && typeof rec.bioObj === 'object' ? rec.bioObj : {}
    const classes: [string | null, string | null][] = asList(rec.dlcovs).map((c) => {
      const desc = Object.entries(c).find(([k, v]) => /(desc|name|cov)/i.test(k) && typeof v === 'string' && !/code|id$/i.test(k))
      const code = Object.entries(c).find(([k]) => /code|id$/i.test(k))
      return [text(desc?.[1]), text(code?.[1])]
    }).filter(([a, b]) => a || b)
    const info: DlInfo = {
      status: text(dl.dlStatus),
      holder: text(bio.bioFullName),
      ntFrom: text(dl.dlNtValdfrDt), ntTo: text(dl.dlNtValdtoDt),
      trFrom: text(dl.dlTrValdfrDt), trTo: text(dl.dlTrValdtoDt),
      classes,
      issued: text(dl.dlIssuedt),
      rto: text(dl.dlRtoCode),
    }
    const known = info.status || info.holder || info.ntTo || info.trTo || classes.length
    if (!known) {
      const hasContent = Object.values(rec).some((v) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
      return hasContent
        ? { found: true, tone: 'info', summary: 'Licence record found, but its details could not be read by this portal.', fields: [] }
        : dlNotFound()
    }
    return dlVerdict(info)
  }),
}

const SARATHI_02: ApiDef = {
  id: 'SARATHI/02',
  name: 'Driving licence check',
  inputs: [DL_INPUT],
  buildBody: (params) => ({ dlnumber: String(params.dlnumber ?? '').trim().toUpperCase() }),
  parse: safe((body) => {
    const p = payloadOf(body) || {}
    const info = p.DLinformation
    if (!info || typeof info !== 'object') return dlNotFound(text(p.errormessage))
    const classes: [string | null, string | null][] = asList(info.Classofcovs).map((c) => [text(c.CovDiscription), text(c.CovCode)])
    return dlVerdict({
      status: text(info.DL_status),
      holder: text(info.DL_Holder_FullName),
      ntFrom: null, ntTo: text(info.NonTransportValidityTodate),
      trFrom: null, trTo: text(info.TransportValidityTodate),
      classes,
      issued: null,
      rto: null,
    })
  }),
}

// ---------------------------------------------------------------- ECHALLAN

function challanOffence(c: any): string | null {
  const names = asList(c?.offence_details).map((o) => text(o.name)).filter(Boolean) as string[]
  if (!names.length) return text(c?.remark) && c.remark !== 'NA' ? text(c.remark) : null
  const s = names.join('; ')
  return s.length > 140 ? s.slice(0, 137) + '...' : s
}

const challanAmount = (c: any): number | null => num(c?.fine_imposed) ?? num(c?.amount_of_fine_imposed)

const ECHALLAN_01: ApiDef = {
  id: 'ECHALLAN/01',
  name: 'Pending traffic fines (e-challan)',
  inputs: [
    { key: 'vehicleNumber', label: 'Truck number', pattern: /^[A-Z0-9]{5,11}$/, hint: 'Truck number without spaces, like MH04AB1234', upper: true },
  ],
  parse: safe((body) => {
    const p = payloadOf(body) || {}
    const data = p.data
    if (String(p.code ?? '') === '305') {
      return { found: false, tone: 'good', summary: 'No pending challans (no challan records for this truck).', fields: [] }
    }
    if (!data || typeof data !== 'object') {
      const why = text(p.message) ?? text(p.status) ?? 'no answer from the e-challan service'
      return { found: false, tone: 'warn', summary: `Could not get e-challan details: ${why}`, fields: [] }
    }
    const pending = asList(data.Pending_data)
    const disposed = asList(data.Disposed_data)
    const total = pending.reduce((s, c) => s + (challanAmount(c) ?? 0), 0)
    const dated = pending.map((c) => ({ c, iso: isoDate(c.challan_date_time) })).filter((x) => x.iso).sort((a, b) => a.iso!.localeCompare(b.iso!))
    const rowOf = (c: any) => [text(c.challan_no), prettyDate(c.challan_date_time), text(c.challan_place), challanOffence(c), num(challanAmount(c)) === null ? null : inr(challanAmount(c)!)]
    const columns = ['Challan number', 'Date', 'Place', 'Offence', 'Fine']
    const tables: Table[] = []
    if (pending.length) tables.push({ title: 'Pending challans', columns, rows: pending.map(rowOf) })
    if (disposed.length) tables.push({ title: 'Already paid / closed challans', columns, rows: disposed.slice(0, 20).map(rowOf) })
    const summary = pending.length
      ? `${pending.length} pending challan${pending.length === 1 ? '' : 's'}, ${inr(total)}.`
      : `No pending challans${disposed.length ? ` (${disposed.length} already paid or closed)` : ''}.`
    return {
      found: true,
      tone: pending.length ? 'bad' : 'good',
      summary,
      fields: filled([
        field('Pending challans', pending.length),
        pending.length ? field('Total pending fine', inr(total)) : { label: 'Total pending fine', value: null },
        field('Oldest pending challan', dated[0]?.c.challan_date_time, 'date'),
        field('Paid / closed challans', disposed.length),
      ]),
      tables,
      extra: {
        pendingCount: pending.length,
        pendingAmount: total,
        paidCount: disposed.length,
        pendingChallanNos: pending.map((c) => text(c.challan_no)).filter(Boolean),
      },
    }
  }),
}

// ---------------------------------------------------------------- EWAYBILL

const EWB_STATUS: Record<string, string> = { ACT: 'Active', CNL: 'Cancelled', REJ: 'Rejected', EXP: 'Expired' }
const TRANS_MODE: Record<string, string> = { '1': 'Road', '2': 'Rail', '3': 'Air', '4': 'Ship' }

// "29/11/2017 11:59:00 PM" -> { iso: '2017-11-29', hhmm: '23:59' }. Time-only values give iso null.
function ewbWhen(v: unknown): { iso: string | null; hhmm: string | null } {
  const s = text(v)
  if (!s) return { iso: null, hhmm: null }
  const iso = isoDate(s)
  const t = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/)
  let hhmm: string | null = null
  if (t) {
    let h = +t[1]
    if (t[3]) {
      const pm = t[3].toLowerCase() === 'pm'
      if (pm && h < 12) h += 12
      if (!pm && h === 12) h = 0
    }
    hhmm = `${p2(h)}:${t[2]}`
  }
  return { iso, hhmm }
}

function ewbExpired(until: { iso: string | null; hhmm: string | null }, nowMs?: number): boolean {
  if (!until.iso) return false
  const n = istNow(nowMs)
  return until.iso < n.iso || (until.iso === n.iso && !!until.hhmm && until.hhmm < n.hm)
}

const EWAYBILL_01: ApiDef = {
  id: 'EWAYBILL/01',
  name: 'E-way bill validity',
  inputs: [
    { key: 'ewbNo', label: 'E-way bill number', pattern: /^[0-9]{12}$/, hint: '12 digits, like 101000609218' },
  ],
  parse: safe((body) => {
    const raw = payloadOf(body)
    // the staging answer wraps the record in an array
    const p = Array.isArray(raw) ? (raw[0] ?? {}) : (raw || {})
    if (p.ewbNo === undefined || p.ewbNo === null || p.ewbNo === '') {
      return { found: false, tone: 'warn', summary: 'No e-way bill found for this number.', fields: [] }
    }
    const ewb = String(p.ewbNo)
    const statusCode = (text(p.status) ?? '').toUpperCase()
    const status = statusCode ? (EWB_STATUS[statusCode] ?? statusCode) : null
    const until = ewbWhen(p.validUpto)
    const made = ewbWhen(p.ewayBillDate)
    const untilText = until.iso ? `${prettyDate(until.iso)}${until.hhmm && until.hhmm !== '00:00' ? `, ${until.hhmm}` : ''}` : null
    const cancelled = statusCode === 'CNL' || statusCode === 'REJ'
    let expired = false
    if (until.iso) {
      expired = ewbExpired(until)
    }
    let tone: Parsed['tone']
    let summary: string
    if (cancelled) {
      tone = 'bad'
      summary = `E-way bill ${ewb} is ${status?.toLowerCase()}.`
    } else if (expired) {
      tone = 'bad'
      summary = `E-way bill ${ewb} expired on ${untilText}.`
    } else if (untilText) {
      tone = 'good'
      summary = `E-way bill ${ewb} is valid until ${untilText}.`
    } else if (statusCode === 'ACT') {
      tone = 'warn'
      summary = `E-way bill ${ewb} is active, but the valid-until date was not given.`
    } else {
      tone = 'info'
      summary = `E-way bill ${ewb} found${status ? `, status ${status}` : ''}.`
    }
    const vehicles = asList(p.VehiclListDetails)
    const truckNumbers = vehicles.map((v) => text(v.vehicleNo)).filter(Boolean) as string[]
    return {
      found: true,
      tone,
      summary,
      fields: filled([
        field('E-way bill number', ewb),
        field('Status', status),
        { label: 'Valid until', value: untilText },
        { label: 'Bill date', value: made.iso ? `${prettyDate(made.iso)}${made.hhmm && made.hhmm !== '00:00' ? `, ${made.hhmm}` : ''}` : null },
        field('From pincode', p.fromPincode),
        field('To pincode', p.toPincode),
        field('HSN code', p.hsnCode),
      ]),
      tables: vehicles.length ? [{
        title: 'Vehicles on this e-way bill',
        columns: ['Vehicle number', 'Added on', 'Mode'],
        rows: vehicles.map((v) => {
          const w = ewbWhen(v.enteredDate)
          const mode = text(v.transMode)
          return [text(v.vehicleNo), w.iso ? `${prettyDate(w.iso)}${w.hhmm && w.hhmm !== '00:00' ? `, ${w.hhmm}` : ''}` : null, mode ? (TRANS_MODE[mode] ?? mode) : null]
        }),
      }] : undefined,
      extra: { ewbNo: ewb, status: statusCode || null, validUpto: until.iso, truckNumbers },
    }
  }),
}

// ---------------------------------------------------------------- TOLL

const TOLL_TEXT = /^[A-Za-z0-9@#$%^&*()_+!.,":;?\-\s]{1,200}$/

function rate(v: unknown): string | null {
  const n = num(v)
  return n === null ? null : inr(n)
}

const TOLL_01: ApiDef = {
  id: 'TOLL/01',
  oneOf: true,
  name: 'Toll plaza rates',
  inputs: [
    { key: 'tollCode', label: 'Toll plaza code', pattern: /^\d{1,7}$/, hint: 'Up to 7 digits (give only one of code, name or state)', optional: true },
    { key: 'tollName', label: 'Toll plaza name', pattern: TOLL_TEXT, hint: 'Name of the toll plaza (give only one of code, name or state)', optional: true },
    { key: 'stateName', label: 'State name', pattern: TOLL_TEXT, hint: 'State name, like MAHARASHTRA (give only one of code, name or state)', optional: true },
  ],
  // ULIP takes exactly one filled; the other two go as empty text
  buildBody: (params) => ({ tollCode: params.tollCode ?? '', tollName: params.tollName ?? '', stateName: params.stateName ?? '' }),
  parse: safe((body) => {
    const recs = asList(payloadOf(body)).filter((r) => text(r.tollName) || text(r.tollCode))
    if (!recs.length) {
      return { found: false, tone: 'warn', summary: 'No toll plaza found for this search.', fields: [] }
    }
    const rows = recs.map((r) => [
      text(r.tollName), text(r.stateName),
      rate(r.busRateSingle), rate(r.multiAxlerateSingle), rate(r.fourToSixExelSingle), rate(r.sevenOrMoreExelSingle),
      prettyDate(r.dtEffectiveRates), prettyDate(r.dtRateRevision),
    ])
    const table: Table = {
      title: 'One-way toll rates for trucks',
      columns: ['Toll plaza', 'State', '2-axle truck (Bus/Truck)', '3-axle truck', '4–6 axle truck', '7+ axle (oversized)', 'Rates from', 'Rates valid until'],
      rows,
    }
    const plazas = recs.map((r) => ({
      tollCode: num(r.tollCode),
      tollName: text(r.tollName),
      stateName: text(r.stateName),
      twoAxleOneWay: num(r.busRateSingle),
      threeAxleOneWay: num(r.multiAxlerateSingle),
      fourToSixAxleOneWay: num(r.fourToSixExelSingle),
      sevenPlusAxleOneWay: num(r.sevenOrMoreExelSingle),
      ratesFrom: isoDate(r.dtEffectiveRates),
      ratesValidUntil: isoDate(r.dtRateRevision),
    }))
    if (recs.length > 1) {
      return {
        found: true,
        tone: 'info',
        summary: `${recs.length} toll plazas found. Table shows one-way truck rates by axle count.`,
        fields: [],
        tables: [table],
        extra: { plazas },
      }
    }
    const r = recs[0]
    const name = text(r.tollName) ?? `Toll plaza ${text(r.tollCode)}`
    const bits = [
      rate(r.busRateSingle) ? `${rate(r.busRateSingle)} for a 2-axle truck` : null,
      rate(r.multiAxlerateSingle) ? `${rate(r.multiAxlerateSingle)} for a 3-axle truck` : null,
      rate(r.fourToSixExelSingle) ? `${rate(r.fourToSixExelSingle)} for a 4–6 axle truck` : null,
    ].filter(Boolean)
    return {
      found: true,
      tone: 'info',
      summary: `${name}${text(r.stateName) ? ` (${text(r.stateName)})` : ''}, one way: ${bits.length ? bits.join(', ') : 'truck rates not given'}.`,
      fields: filled([
        field('Toll plaza', r.tollName),
        field('State', r.stateName),
        field('Toll code', r.tollCode),
        field('2-axle truck (Bus/Truck), one way', rate(r.busRateSingle)),
        field('2-axle truck (Bus/Truck), return', rate(r.busRateMulti)),
        field('3-axle truck, one way', rate(r.multiAxlerateSingle)),
        field('3-axle truck, return', rate(r.multiAxlerateMulti)),
        field('3-axle truck, monthly pass', rate(r.multiAxlerateMth)),
        field('4–6 axle truck, one way', rate(r.fourToSixExelSingle)),
        field('4–6 axle truck, return', rate(r.fourToSixExelReturn)),
        field('Heavy construction machinery, one way', rate(r.hcmEmeSingle)),
        field('7+ axle (oversized), one way', rate(r.sevenOrMoreExelSingle)),
        field('7+ axle (oversized), return', rate(r.sevenOrMoreExelReturn)),
        field('7+ axle (oversized), monthly pass', rate(r.sevenOrMoreExelMonthly)),
        field('Rates from', r.dtEffectiveRates, 'date'),
        field('Rates valid until', r.dtRateRevision, 'date'),
      ]),
      tables: [table],
      extra: { plazas },
    }
  }),
}

// ---------------------------------------------------------------- registry

export const ROAD_APIS: ApiDef[] = [
  FASTAG_01,
  FASTAG_02,
  vahanApi('VAHAN/01', 'Vehicle registration (RC) by truck number', VEH_NO_INPUT, 'vehicle number'),
  vahanApi('VAHAN/02', 'Vehicle registration (RC) by chassis number', {
    key: 'chasisnumber', label: 'Chassis number', pattern: /^[A-Z0-9]{1,20}$/, hint: 'Chassis number, letters and digits only', upper: true,
  }, 'chassis number'),
  vahanApi('VAHAN/03', 'Vehicle registration (RC) by engine number', {
    key: 'enginenumber', label: 'Engine number', pattern: /^[A-Z0-9]{1,20}$/, hint: 'Engine number, letters and digits only', upper: true,
  }, 'engine number'),
  vahanApi('VAHAN/04', 'Vehicle registration (RC) by truck number, second source', VEH_NO_INPUT, 'vehicle number'),
  vahanApi('VAHAN/05', 'Vehicle registration (RC) by chassis number, second source', {
    key: 'chasisnumber', label: 'Chassis number', pattern: /^\S{5,24}$/, hint: '5 to 24 characters, no spaces', upper: true,
  }, 'chassis number'),
  vahanApi('VAHAN/06', 'Vehicle registration (RC) by engine number, second source', {
    key: 'enginenumber', label: 'Engine number', pattern: /^\S{1,20}$/, hint: 'Up to 20 characters, no spaces', upper: true,
  }, 'engine number'),
  SARATHI_01,
  SARATHI_02,
  ECHALLAN_01,
  EWAYBILL_01,
  TOLL_01,
]

// exported for tests
export const _internal = { xmlTag, isoDate, inr, dlForSarathi01, isPast, istNow, ewbExpired, ewbWhen }
