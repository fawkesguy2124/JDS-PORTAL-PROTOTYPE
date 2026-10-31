// Reads shipping documents straight from the text inside the PDF. No AI, and
// nothing leaves the computer. Works on original soft-copy PDFs (ICEGATE BE /
// OOC, bills of lading, air waybills, invoices, packing lists, stamp duty
// challans, airport terminal charges, insurance policies), including bundles
// with several documents in one PDF. Pages that are pictures, or whose text is
// scrambled by the font, are reported as unreadable instead of guessed.

import { pdfToLines, parseBeLines } from './beParser'
import { matchClient } from './clients'
import { lineFromBl } from '../../supabase/functions/_shared/portal/shippingLines.js'

// ── small helpers ───────────────────────────────────────────────────────────
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 }
const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => (y > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null)

// Dates as they appear on shipping papers -> YYYY-MM-DD
export function toIsoDate(s) {
  if (!s) return null
  const t = String(s).toUpperCase().replace(/\s+/g, ' ').trim()
  let m
  if ((m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) return iso(+m[1], +m[2], +m[3])
  if ((m = t.match(/\b(\d{1,2})[-/. ]([A-Z]{3,4})[-/., ]+(\d{2,4})\b/)) && MONTHS[m[2]]) return iso(+m[3] < 100 ? 2000 + +m[3] : +m[3], MONTHS[m[2]], +m[1])
  if ((m = t.match(/\b([A-Z]{3,4})[-/., ]+(\d{1,2})[-/., ]+(\d{4})\b/)) && MONTHS[m[1]]) return iso(+m[3], MONTHS[m[1]], +m[2])
  if ((m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/))) return iso(+m[3], +m[2], +m[1])
  return null
}
const DATE_RE = /\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[-/. ][A-Za-z]{3,4}[-/., ]+\d{2,4}|[A-Za-z]{3,4}[-/., ]+\d{1,2}[-/., ]+\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\b/
const num = (s) => {
  if (s == null) return null
  const n = Number(String(s).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
const uniq = (a) => [...new Set(a.filter(Boolean))]

// ISO 6346 container number with its check digit
const CONTAINER_RE = /\b([A-Z]{3}[UJZ])\s?(\d{6})\s?(\d)\b/g
function containerOk(no) {
  const letters = {}
  let v = 10
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') { if (v % 11 === 0) v++; letters[c] = v++ }
  let sum = 0
  for (let i = 0; i < 10; i++) sum += (/\d/.test(no[i]) ? Number(no[i]) : letters[no[i]]) * 2 ** i
  return (sum % 11) % 10 === Number(no[10])
}
export function findContainers(text) {
  return uniq([...String(text).matchAll(CONTAINER_RE)].map((m) => m[1] + m[2] + m[3]).filter(containerOk))
}

const GSTIN_RE = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d])\b/g
const IEC_RE = /\b(?:IEC|IE\s*CODE|IEC\s*NO|IMPORTER[- ]EXPORTER CODE)\s*[:.\-]?\s*(?:NO\.?\s*[:.]?\s*)?([A-Z0-9]{10})\b/gi
const HS_RE = /\b(?:HS|HSN|H\.S\.|CTH)[\s.-]*(?:CODE)?\s*[:.\-]?\s*(\d{4}[\s.]?\d{2}(?:[\s.]?\d{2})?)\b/gi

const CARRIERS = [
  ['MSC', /MEDITERRANEAN SHIPPING|\bMSC\b|\bMEDU/],
  ['Maersk', /MAERSK|\bMAEU|\bMRKU/],
  ['Hapag-Lloyd', /HAPAG|\bHLCU|\bHLXU/],
  ['CMA CGM', /CMA CGM|\bCMDU/],
  ['Evergreen', /EVERGREEN|\bEGLV|\bEVER [A-Z]/],
  ['ONE', /OCEAN NETWORK EXPRESS|\bONEY|\bONE [A-Z]{3,}/],
  ['OOCL', /\bOOCL|ORIENT OVERSEAS/],
  ['COSCO', /COSCO|\bCOSU/],
  ['ZIM', /\bZIM\b|\bZIMU/],
  ['HMM', /\bHMM\b|HYUNDAI MERCHANT/],
  ['Yang Ming', /YANG MING|\bYMLU/],
  ['Wan Hai', /WAN HAI|\bWHLC/],
  ['TS Line', /\bTS LINES?\b/],
  ['Interasia', /INTERASIA/],
  ['RCL', /REGIONAL CONTAINER LINES|\bRCL\b/],
  ['Emirates', /EMIRATES SHIPPING/],
]
// The shipping line from its own codes: the BL number prefix, else the
// prefix of its own containers (leasing companies' boxes are ignored)
// Shipping line: only from a carrier BL's first 4 letters. Container letters only say
// who OWNS the box (see shippingLines.js), so they are never used to fill the line.
export const lineFromCodes = (bl) => lineFromBl(bl)

function carrierOf(text) {
  const t = String(text).toUpperCase()
  return CARRIERS.find(([, re]) => re.test(t))?.[0] || null
}

const INCOTERMS = /\b(EXW|FCA|FAS|FOB|CFR|CNF|C&F|CIF|CPT|CIP|DAP|DPU|DDP)\b/
const CURRENCY = /\b(USD|EUR|CNY|RMB|GBP|JPY|AED|SGD|CHF|INR|KRW|THB|HKD|AUD)\b/

// The value after a label: same line after the label, else the next non-empty
// line. Text that is only another printed label is skipped.
const LABELISH = /PORT OF|PLACE OF|COMBINED TRANSPORT|PRE-CARRIAGE|VOY\.?\s*NO|VOYAGE|B\/L\s*No|BOOKING REF|SHIPPER'S REF|NO\. OF PACKAGES|GROSS WEIGHT|MEASUREMENT|\(see Clause|^X{4,}/i
function afterLabel(lines, labelRe, valueRe = /\S/, look = 4) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(labelRe)
    if (!m) continue
    const rest = lines[i].slice(m.index + m[0].length).replace(/^[\s:.\-#]+/, '').trim()
    if (rest && !LABELISH.test(rest) && valueRe.test(rest)) return rest
    for (let k = 1; k <= look && i + k < lines.length; k++) {
      const v = lines[i + k].trim()
      if (v && !LABELISH.test(v) && valueRe.test(v)) return v
    }
  }
  return null
}
const firstMatch = (text, re) => String(text).match(re)?.[1] || null

// Text that is there but unusable (fonts that hide the real letters)
function scrambled(text) {
  const t = text.replace(/\s/g, '')
  if (t.length < 40) return false
  const odd = (t.match(/[^A-Za-z0-9.,:;\/\-()&@'"#%+*ऀ-ॿ一-鿿　-〿＀-￯¥€$₹°]/g) || []).length
  const symbols = (t.match(/[%&'()*+,\-/#$!"]/g) || []).length
  const letters = (t.match(/[A-Za-z]/g) || []).length
  return odd / t.length > 0.15 || (symbols / t.length > 0.3 && letters / t.length < 0.4)
}

// ── what kind of page is this? ──────────────────────────────────────────────
const TYPES = [
  ['be', (t) => /Port Code BE No/i.test(t) && /BILL OF ENTRY|OUT OF CHARGE/i.test(t)],
  ['stamp_duty', (t) => /MTR Form Number-6|Stamp Duty on Delivery|\bGRN\b.*\bMH\d{6,}/i.test(t)],
  ['terminal_charges', (t) => /TAX INVOICE CUM BANK CHALLAN|CARGO SERVICE CENTER|Terminal Charges/i.test(t)],
  ['insurance', (t) => /INSURANCE/i.test(t) && /Policy No|Sum Insured/i.test(t)],
  ['packing_list', (t) => /PACKING\s*LIST|PACKING SLIP/i.test(t)],
  ['bl', (t) => /BILL\s+OF\s+LADING|B\/L\s*No|BILL No\.|SEA\s*WAYBILL|\bHBL\b|SHIPPED ON BOARD|OCEAN VESSEL|SHIPPER'S LOAD/i.test(t)],
  ['awb', (t) => /AIR\s*WAYBILL|AIRWAY\s*BILL|\bAWB\b/i.test(t) || /^\s*\d{3}[ -]\d{8}\s*$/m.test(t)],
  ['invoice', (t) => /COMMERCIAL\s+INVOICE|PROFORMA\s+INVOICE|TAX\s+INVOICE|\bINVOICE\s*(NO|NUMBER|#)|^\s*Invoice\s+\d+/im.test(t)],
  ['coo', (t) => /CERTIFICATE OF ORIGIN/i.test(t)],
  ['delivery_order', (t) => /DELIVERY ORDER/i.test(t)],
]
export const DOC_LABELS = {
  be: 'Bill of Entry', ooc: 'Out of Charge', bl: 'Bill of Lading', awb: 'Air Waybill', invoice: 'Commercial Invoice',
  packing_list: 'Packing List', stamp_duty: 'Stamp Duty Challan', terminal_charges: 'Terminal Charges',
  insurance: 'Insurance Policy', coo: 'Certificate of Origin', delivery_order: 'Delivery Order',
  unreadable: 'Unreadable page', other: 'Other',
}
function pageType(text) {
  if (text.replace(/\s/g, '').length < 30) return 'unreadable'
  if (scrambled(text)) return 'unreadable'
  return TYPES.find(([, test]) => test(text))?.[0] || 'other'
}

// ── readers for each document type ──────────────────────────────────────────
function clientFrom(text) {
  const iecs = [...String(text).matchAll(IEC_RE)].map((m) => m[1].toUpperCase())
  const gstins = [...String(text).matchAll(GSTIN_RE)].map((m) => m[1])
  for (const iec of iecs) { const c = matchClient({ iec }); if (c) return { client: c, iec, gstin: gstins[0] || null } }
  for (const g of gstins) { const c = matchClient({ iec: g.slice(2, 12) }); if (c) return { client: c, iec: g.slice(2, 12), gstin: g } }
  for (const line of String(text).split('\n')) {
    const l = line.trim()
    if (l.length < 4 || l.length > 80) continue
    const c = matchClient({ name: l })
    if (c && c.legal) return { client: c, iec: iecs[0] || null, gstin: gstins[0] || null }
  }
  return { client: null, iec: iecs[0] || null, gstin: gstins[0] || null }
}

function cargoTotals(text) {
  const t = String(text)
  const gw = firstMatch(t, /(?:TOTAL\s+GROSS\s+WEIGHT|G\.\s*W\.?|GROSS\s+WEIGHT)\s*[:.]?\s*([\d,]+(?:\.\d+)?)\s*(?:KGS?|KG)/i)
    || firstMatch(t, /([\d,]+\.\d{1,3})\s*KGS\b/i) || firstMatch(t, /([\d,]+(?:\.\d+)?)\s*(?:KGS|kg)\b/)
  const nw = firstMatch(t, /(?:N\.\s*W\.?|NET\s+WEIGHT)\s*[:.]?\s*([\d,]+(?:\.\d+)?)\s*(?:KGS?|KG)/i)
  const totalPk = t.match(/TOTAL\s+(?:ITEMS|PACKAGES|PKGS|NO\.?\s*OF\s*PACKAGES)\s*:?\s*([\d,]+)/i)
  const pk = t.match(/(?:TOTAL\s+ITEMS\s*:?\s*)?\b([\d,]{1,7})\s*(CTNS?|CARTONS?|PKGS?|PACKAGES|PALLETS?|CASES?|WOODEN CASES?|BUNDLES?|PCS|PIECES|BAGS|DRUMS|ROLLS|CRATES|SKIDS)\b/i)
  const sayPk = t.match(/SAY:?\s*(\d+)\s*(WOODEN CASES?|CASES?|PALLETS?|CARTONS?|PACKAGES)/i)
  const p = totalPk ? [null, totalPk[1], (pk && pk[2]) || 'PACKAGES'] : (sayPk || pk)
  return { gross_weight: num(gw), net_weight: num(nw), package_count: p ? num(p[1]) : null, package_unit: p ? String(p[2]).toUpperCase() : null }
}

function containerSize(text) {
  const t = String(text).toUpperCase().replace(/\s+/g, ' ')
  const m = t.match(/\b(20|40|45)\s*['’]?\s*(?:FT|FEET)?\s*(HQ|HC|HIGH CUBE|GP|DV|DC|SD\d*|STD|STANDARD|RF|REEFER|OT|OPEN TOP|FR|FLAT RACK|TK|TANK)\b/)
  if (!m) return /\bLCL\b/.test(t) ? 'LCL' : null
  const kind = /HQ|HC|HIGH|96$/.test(m[2]) ? 'HC' : /RF|REEF/.test(m[2]) ? 'RF' : /OT|OPEN/.test(m[2]) ? 'OT' : /FR|FLAT/.test(m[2]) ? 'FR' : /TK|TANK/.test(m[2]) ? 'TK' : 'GP'
  return `${m[1]}${kind}`
}

function hsCodes(text) {
  return uniq([...String(text).matchAll(HS_RE)].map((m) => m[1].replace(/[\s.]/g, '')).filter((c) => c.length >= 6))
}

function vesselVoyage(lines, text) {
  // "Ocean Vessel: INTERASIA INSPIRATION Voyage No: W071" on one line
  const one = String(text).match(/OCEAN\s+VESSEL\s*:?\s*([A-Z][A-Z0-9 .]{2,40}?)\s+VOYAGE\s*NO\.?\s*:?\s*([A-Z0-9]{3,8})\b/i)
  if (one) return { vessel_name: one[1].trim(), voyage_no: one[2] }
  const v = afterLabel(lines, /(?:OCEAN\s+VESSEL|VESSEL\s+AND\s+VOYAGE(?:\s+NO)?|VESSEL\s*\/\s*VOYAGE(?:-NO\.?)?|VESSEL\s*&\s*VOYAGE|^VESSEL)\s*:?/i, /^[A-Za-z][A-Za-z0-9.]*(?:\s+[A-Za-z0-9.\-\/]+){1,6}$/)
  let vessel = null, voyage = null
  const src = v || ''
  let m = src.match(/^(.*?)(?:\s+VOYAGE\s*NO:?\s*|\s+V\.\s*|\s+-\s+|\s*\/\s*|\s+VOY\.?\s*)([A-Z0-9]{3,8})\b/i)
  if (m) { vessel = m[1]; voyage = m[2] } else if (v) vessel = v
  if (!vessel) {
    // a line like "MSC SILVANA VIII V.GY606R" or "ZHONG GU HANG ZHOU/2602W"
    const line = String(text).split('\n').find((l) => /^[A-Z][A-Z .]{4,40}(?:\s+V\.\s*|\s*\/\s*|\s+-\s+)[A-Z0-9]{3,8}\s*$/.test(l.trim()) && !/NHAVA|INDIA|CHINA|PORT/.test(l))
    if (line) { m = line.trim().match(/^(.*?)(?:\s+V\.\s*|\s*\/\s*|\s+-\s+)([A-Z0-9]{3,8})$/); if (m) { vessel = m[1]; voyage = m[2] } }
  }
  if (vessel) {
    vessel = vessel.replace(/\b(PORT OF DISCHARGE|PLACE OF DELIVERY|COMBINED TRANSPORT).*$/i, '')
    // the port columns and the ship read as one line, ship last: "JIANGMEN NHAVA SHEVA
    // SYNERGY OAKLAND" (port of loading, port of discharge, ship; J-1001, 31 Oct 2026)
    const after = vessel.match(SHIP_AFTER_PORT)
    vessel = (after ? after[1] : vessel.replace(/\s+(NHAVA SHEVA|JNPT|MUNDRA|CHENNAI|MUMBAI|KOLKATA|PIPAVAV|HAZIRA|INDIA).*$/i, ''))
      .replace(/\s{2,}.*/, '').trim() || null
  }
  return { vessel_name: vessel, voyage_no: voyage }
}
const SHIP_AFTER_PORT = /\b(?:NHAVA\s*SHEVA|JNPT|MUNDRA|CHENNAI|MUMBAI|KOLKATA|PIPAVAV|HAZIRA)\s+(?!.*\b(?:NHAVA\s*SHEVA|JNPT|MUNDRA|CHENNAI|MUMBAI|KOLKATA|PIPAVAV|HAZIRA)\b)([A-Z][A-Z0-9 .]{2,40})$/i

const INDIAN_PORTS = /\b(NHAVA\s*SHEVA|JNPT|MUMBAI|MUNDRA|PIPAVAV|HAZIRA|KANDLA|CHENNAI|KATTUPALLI|ENNORE|KOLKATA|HALDIA|VISAKHAPATNAM|VIZAG|COCHIN|KOCHI|TUTICORIN|MANGALORE)\b/i
// a ports-and-ship line ends with the voyage: "JIANGMEN NHAVA SHEVA SYNERGY OAKLAND/27W"
const ENDS_WITH_VOYAGE = /\/\s*[A-Z0-9]{3,8}\s*$/i
function port(lines, labelRe, loading = false) {
  const v = afterLabel(lines, labelRe, /[A-Za-z]{3,}/)
  if (!v || /XXXX|^\(|Combined|Pre-Carriage|Clause/i.test(v)) return null
  const indian = v.match(INDIAN_PORTS)
  // the port of loading is the part before the Indian port on such a line
  if (indian && loading && indian.index > 0 && ENDS_WITH_VOYAGE.test(v)) return v.slice(0, indian.index).replace(/[,:]\s*$/, '').trim()
  if (indian && (/\b(MSC|CMA CGM|MAERSK|EVER|COSCO|ONE|HMM|WAN HAI|INTERASIA|V\.)\b/i.test(v) || ENDS_WITH_VOYAGE.test(v))) return indian[1].replace(/\s+/g, ' ')
  return v.replace(/\s{2,}.*/, '').replace(/[,:]\s*$/, '').trim()
}

function readBl(lines, text) {
  const t = text
  let bl = afterLabel(lines, /(?:B\/L\s*No\.?|BILL\s*No\.?|BILL OF LADING\s*(?:NUMBER|NO\.?)|BL\s*NO\.?|B\/L\s*NUMBER|SEA WAYBILL NO\.?)\s*:?/i, /^(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{6,20}(?:\s|$)/i)
  if (bl) bl = bl.split(/\s+/)[0]
  // European house BLs: "HB/L number" with the value a few lines below, slashes allowed ("900051/2025/FI")
  if (!bl) bl = afterLabel(lines, /\bHB\/?L\s*(?:NUMBER|NO\.?)/i, /^(?=[A-Z0-9/-]*\d)[A-Z0-9][A-Z0-9/-]{5,24}$/i)
  if (!bl) {
    // house BLs often print the number alone near the top
    const top = lines.slice(0, 6).map((l) => l.trim())
    bl = top.find((l) => /^[A-Z]{2,6}\d{6,14}$/.test(l) || /^\d{3}[A-Z]\d{6}$/.test(l)) || null
  }
  const vv = vesselVoyage(lines, t)
  const containers = findContainers(t)
  const seals = uniq([
    ...[...t.matchAll(/SEAL\s*(?:NO\.?|NUMBER|#)?\s*[:.]\s*([A-Z]{0,4}\d{5,10})\b(?![.,]\d)/gi)].map((m) => m[1]),
    ...[...t.matchAll(/Seal Number:[\s\S]{0,40}?\b([A-Z]{1,4}\d{5,10})\b/gi)].map((m) => m[1]),
    ...[...t.matchAll(/[A-Z]{4}\d{7}\s*\/\s*(?:\d{2}['’]?\s*[A-Z]{2}\s*\/\s*)?([A-Z]{0,4}\d{5,10})\b(?![.,]\d|\s*KGS)/gi)].map((m) => m[1]),
  ])
  const onBoard = (() => {
    const i = lines.findIndex((l) => /SHIPPED ON BOARD/i.test(l))
    for (let k = i; i >= 0 && k < Math.min(lines.length, i + 4); k++) { const d = toIsoDate(lines[k]); if (d) return d }
    return null
  })()
  const who = clientFrom(t)
  const carrier = carrierOf(t) || carrierOf(vv.vessel_name || '')
  return {
    bl_number: bl,
    bl_date: onBoard || toIsoDate(afterLabel(lines, /PLACE AND DATE OF ISSUE|DATE OF ISSUE/i, DATE_RE)),
    vessel_name: vv.vessel_name,
    voyage_no: vv.voyage_no,
    shipping_line: carrier,
    container_numbers: containers,
    seal_numbers: seals.filter((s) => !containers.includes(s)),
    container_size: containerSize(t),
    port_of_loading: port(lines, /PORT OF LOADING/i, true),
    port_of_discharge: port(lines, /PORT OF DISCHARGE(?!\s*AGENT)/i) || (/NHAVA SHEVA/i.test(t) ? 'Nhava Sheva' : null),
    place_of_delivery: port(lines, /PLACE OF DELIVERY/i),
    consignee_name: who.client?.legal || null,
    importer_iec: who.iec,
    importer_gstin: who.gstin,
    client: who.client?.name || null,
    hs_codes: hsCodes(t),
    ...cargoTotals(t),
    freight_terms: /FREIGHT\s+COLLECT/i.test(t) ? 'Collect' : /FREIGHT\s+PREPAID/i.test(t) ? 'Prepaid' : null,
    is_house_bl: /\bHBL\b|HOUSE\s+B\/?L|AS AGENT FOR THE CARRIER|FREIGHT FORWARD/i.test(t) && !/MEDITERRANEAN SHIPPING COMPANY|MAERSK A\/S/i.test(t),
  }
}

function readAwb(lines, text) {
  const m = text.match(/\b(\d{3})[ -]?(\d{8})\b/)
  const who = clientFrom(text)
  const origin = lines.slice(0, 4).map((l) => l.trim()).find((l) => /^[A-Z]{3}$/.test(l)) || null
  return {
    awb_number: m ? m[1] + m[2] : null,
    bl_number: m ? m[1] + m[2] : null,
    airport_of_departure: origin,
    client: who.client?.name || null,
    consignee_name: who.client?.legal || null,
    importer_iec: who.iec,
    importer_gstin: who.gstin,
    hs_codes: hsCodes(text),
    invoice_numbers: uniq([...text.matchAll(/INVOICE\s*(?:NO\.?|NUMBER)\s*[:.]?\s*([A-Z0-9][A-Z0-9/-]{3,})/gi)].map((x) => x[1])),
    ...cargoTotals(text),
  }
}

function readInvoice(lines, text) {
  const INV_NO = /^(?=[A-Z0-9/.-]*\d)[A-Z0-9][A-Z0-9/.-]{2,}(?:\s|$)/i
  let no = afterLabel(lines, /INVOICE\s*(?:NO\.?|NUMBER|#)\s*[:.]?|^\s*Invoice\s+(?=\d)/i, INV_NO, 1)
  if (!no) {
    const i = lines.findIndex((l) => /^\s*INVOICE\s*(?:NO\.?|NUMBER)\s*[:.]?\s*$/i.test(l))
    if (i > 0 && INV_NO.test(lines[i - 1].trim())) no = lines[i - 1].trim()
  }
  const invoiceNo = no ? no.split(/\s+/)[0] : null
  const dateRaw = afterLabel(lines, /(?:INVOICE\s+DATE|DATE)\s*[:.]?/i, DATE_RE)
  const cur = (text.toUpperCase().match(CURRENCY) || [])[1]
  // the total: the number on (or just after) the TOTAL line, else the biggest amount
  const amounts = []
  lines.forEach((l, i) => {
    if (/\bTOTAL\b/i.test(l)) {
      const near = /TOTAL\s*:?\s*\d+\s*(PCS|PKGS|CTNS|CARTONS)/i.test(l) ? (lines[i - 1] || '') : [lines[i - 1] || '', l, lines[i + 1] || ''].join(' ')
      const nums = near.match(/\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{1,2}/g)
      if (nums) amounts.push(...nums.map(num))
    }
  })
  const total = amounts.length ? Math.max(...amounts.filter((n) => n != null)) : null
  const terms = text.toUpperCase().match(new RegExp(INCOTERMS.source + '[\\s,]*([A-Z][A-Z ,.-]{2,30})?'))
  const who = clientFrom(text)
  const seller = lines.slice(0, 6).map((l) => l.trim()).find((l) => /(CO\.,?\s*LTD|LIMITED|LTD\.?|S\.A\.|GMBH|INC\.?|LLC|SRL|S\.P\.A|PVT)/i.test(l) && !matchClient({ name: l })) || null
  return {
    invoice_numbers: invoiceNo ? [invoiceNo] : [],
    invoice_dates: dateRaw ? [toIsoDate(dateRaw)].filter(Boolean) : [],
    invoice_amounts: total != null ? [total] : [],
    invoice_currencies: cur ? [cur === 'RMB' ? 'CNY' : cur] : [],
    payment_terms: terms ? (terms[1] === 'CNF' || terms[1] === 'C&F' ? 'CFR' : terms[1]) : null,
    supplier_name: seller,
    country_of_origin: firstMatch(text, /COUNTRY\s+OF\s+ORIGIN\s*[:.]?\s*([A-Z][A-Za-z ]{2,20}?)(?:\s{2,}|$|\n)/i),
    client: who.client?.name || null,
    consignee_name: who.client?.legal || null,
    importer_iec: who.iec,
    importer_gstin: who.gstin,
    hs_codes: hsCodes(text),
    ...cargoTotals(text),
  }
}

function readStampDuty(lines, text) {
  const remark = (text.match(/Remarks \(If Any\)\s*([\s\S]{0,200}?)Amount In/i) || [])[1] || ''
  return {
    stamp_duty_grn: firstMatch(text, /\bGRN\s+([A-Z0-9]{10,})/),
    stamp_duty_date: toIsoDate(firstMatch(text, /Date\s+(\d{2}\/\d{2}\/\d{4})/)),
    stamp_duty_amount: num(firstMatch(text, /Total\s+([\d,]+\.\d{2})/)),
    be_number: firstMatch(remark, /\bBOE\s*(?:NO\.?)?\s*(\d{7})/i),
    igm_number: firstMatch(remark, /\bIGM\s*(?:NO\.?)?\s*(\d{6,7})/i),
    igm_item_no: firstMatch(remark, /\bITEM\s*(?:NO\.?)?\s*(\d{1,4})/i),
    igm_sub_item_no: firstMatch(remark, /SUB\s*ITEM\s*(?:NO\.?)?\s*(\d{1,3})/i),
  }
}

function readTerminalCharges(lines, text) {
  return {
    terminal: firstMatch(text, /^\s*([A-Z][A-Z .]+(?:CENTER|CENTRE|TERMINAL)[A-Z .]*)$/m),
    terminal_invoice_no: firstMatch(text, /INVOICE No\s*:\s*([A-Z0-9]+)/i),
    awb_number: firstMatch(text, /MAWB No\.?\s*:\s*(\d{11})/i),
    be_number: firstMatch(text, /BoE\.?\s*No\s*\/\s*Date\s*:\s*(\d{7})/i),
    ooc_number: firstMatch(text, /OOC Number\s*:\s*(\d{6,})/i),
    igm_number: firstMatch(text, /IGM\/FLIGHT\s+(\d{6,7})/i),
    terminal_charges_total: num(firstMatch(text, /\n\s*([\d,]+\.\d{2})\s*\n\s*Total/i)),
    demurrage_days: num(firstMatch(text, /Demurrage Charges\s+[\d,.]+\s+(\d{1,3})\s/i)),
  }
}

function readInsurance(lines, text) {
  return {
    insurer: lines[0]?.trim() || null,
    policy_no: firstMatch(text, /\b([A-Z]{2,4}\d{8,})\b/),
    policy_date: toIsoDate(firstMatch(text, /\b(\d{1,2}-[A-Za-z]{3}-\d{4})\b/)),
    sum_insured: num(firstMatch(text, /Total Sum Insured\s*Rs\.?\s*([\d,]+(?:\.\d+)?)/i) || firstMatch(text, /Sum Insured\s*Rs\.?\s*([\d,]+(?:\.\d+)?)/i)),
    container_numbers: findContainers(text),
    client: clientFrom(text).client?.name || null,
  }
}

function fromBe(be) {
  if (!be) return {}
  return {
    be_number: be.be_no, be_date: be.be_date, port_code: be.port_code, mode: be.mode, container_load: be.load || null,
    igm_number: be.igm_no, igm_date: be.igm_date, bl_number: be.bl_no, hawb_number: be.hbl_no, bl_date: be.bl_date,
    container_numbers: be.containers, package_count: be.packages, gross_weight: be.gross_weight,
    consignee_name: be.client, consignee_address: be.client_address, importer_iec: be.iec, importer_gstin: be.gstin,
    client: matchClient({ iec: be.iec, name: be.client })?.name || null,
    country_of_origin: be.country_of_origin, port_of_loading: be.port_of_loading,
    hs_code: be.hs_code, rms_status: be.rms_status, rms_label: be.rms_label,
    ooc_number: be.ooc_no, ooc_date: be.ooc_date, copy_type: be.copy_type,
    // arrival: the inward date (the day the ship / flight was let in)
    eta: be.inward_date || null,
    inward_date: be.inward_date || null,
    shipping_line: be.mode === 'Air' ? null : lineFromCodes(be.bl_no),
    goods_description: be.goods || null,
    invoice_line_items: be.items || [],
    invoice_numbers: (be.invoices || []).map((i) => i.no),
    invoice_amounts: (be.invoices || []).map((i) => i.amount),
    invoice_currencies: (be.invoices || []).map((i) => i.currency),
  }
}

// ── the whole PDF ───────────────────────────────────────────────────────────
// Returns { pages, documents, fields, unreadablePages, be }
export async function readPdf(pdfjs, data) {
  const pdf = await pdfjs.getDocument({ data }).promise
  const all = await pdfToLines(pdf)
  // split the flat line list back into pages (keeping word positions for the BE reader)
  const pages = []
  all.forEach((line, idx) => {
    if (/^=== PAGE \d+ ===$/.test(line)) { pages.push({ lines: [], idx: [] }); return }
    pages[pages.length - 1]?.lines.push(line)
    pages[pages.length - 1]?.idx.push(idx)
  })
  const typed = pages.map((p, i) => ({ page: i + 1, text: p.lines.join('\n'), lines: p.lines, idx: p.idx, type: pageType(p.lines.join('\n')) }))

  // rider / continuation pages belong to the document before them
  for (let i = 1; i < typed.length; i++) {
    const p = typed[i]
    if (p.type === 'other' && /RIDER|CONTINUATION|ATTACHMENT|ATTACHED LIST|Page\s+\d+\s+of/i.test(p.text)) p.type = typed[i - 1].type
    if (p.type === 'invoice' && typed[i - 1].type === 'invoice' && /Page\s+\d+\s+of/i.test(p.text)) p.type = 'invoice'
  }

  // group consecutive pages of the same type into documents
  const docs = []
  for (const p of typed) {
    const last = docs[docs.length - 1]
    if (last && last.type === p.type && p.type !== 'unreadable') { last.pages.push(p.page); last.text += '\n' + p.text; last.lines.push(...p.lines); last.idx.push(...p.idx) }
    else docs.push({ type: p.type, pages: [p.page], text: p.text, lines: [...p.lines], idx: [...p.idx] })
  }

  let be = null
  for (const d of docs) {
    if (d.type === 'be') {
      // keep the original word positions so the BE reader can match wrapped numbers
      const lines = [...d.lines]
      lines.positions = Object.fromEntries(d.idx.map((orig, k) => [k, all.positions?.[orig]]).filter(([, v]) => v))
      be = parseBeLines(lines)
      d.fields = fromBe(be)
      if (be?.copy_type === 'OOC') d.type = 'ooc'
    } else if (d.type === 'bl') d.fields = readBl(d.lines, d.text)
    else if (d.type === 'awb') d.fields = readAwb(d.lines, d.text)
    else if (d.type === 'invoice') d.fields = readInvoice(d.lines, d.text)
    else if (d.type === 'packing_list') d.fields = { ...cargoTotals(d.text), container_numbers: findContainers(d.text), hs_codes: hsCodes(d.text) }
    else if (d.type === 'stamp_duty') d.fields = readStampDuty(d.lines, d.text)
    else if (d.type === 'terminal_charges') d.fields = readTerminalCharges(d.lines, d.text)
    else if (d.type === 'insurance') d.fields = readInsurance(d.lines, d.text)
    else d.fields = {}
  }

  // one set of fields for the job: the Bill of Entry wins, then BL / AWB, then the rest
  const order = ['be', 'ooc', 'bl', 'awb', 'invoice', 'packing_list', 'stamp_duty', 'terminal_charges', 'insurance']
  const fields = {}
  for (const type of [...order].reverse()) {
    for (const d of docs.filter((x) => x.type === type)) {
      for (const [k, v] of Object.entries(d.fields || {})) {
        if (v == null || (Array.isArray(v) && v.length === 0) || v === '') continue
        if (Array.isArray(v) && Array.isArray(fields[k]) && ['container_numbers', 'invoice_numbers', 'hs_codes'].includes(k) && !['be', 'ooc'].includes(type)) fields[k] = uniq([...fields[k], ...v])
        else fields[k] = v
      }
    }
  }
  if (!fields.hs_code && fields.hs_codes?.length) fields.hs_code = fields.hs_codes[0]

  return {
    pages: typed.map(({ page, type }) => ({ page, type })),
    documents: docs.map(({ type, pages: ps, fields: f }) => ({ type, label: DOC_LABELS[type] || type, pages: ps, fields: f })),
    fields,
    unreadablePages: typed.filter((p) => p.type === 'unreadable').map((p) => p.page),
    be,
  }
}

// Short plain-English line for the screen, e.g. "Bill of Lading (p1–2), Invoice (p3–6), Bill of Entry (p8–25)"
export function describeDocuments(result) {
  const range = (ps) => (ps.length === 1 ? `p${ps[0]}` : `p${ps[0]}–${ps[ps.length - 1]}`)
  return (result?.documents || []).filter((d) => d.type !== 'other').map((d) => `${d.label} (${range(d.pages)})`).join(', ')
}
