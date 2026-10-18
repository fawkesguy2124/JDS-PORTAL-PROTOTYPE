// Turns what the PDF reader (docReader.js) found into the field lists the
// "Documents & OCR" page and the staff "Extract" checklist use. No AI: the
// documents are fetched from storage and read in the browser, nothing else.

import { readPdf, describeDocuments } from './docReader'

// Which document wins when two say different things (Bill of Entry first)
const PRIORITY = ['be', 'ooc', 'bl', 'awb', 'invoice', 'packing_list', 'stamp_duty', 'terminal_charges', 'insurance']
const SURE_SOURCES = ['Bill of Entry', 'Out of Charge']

const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)
const uniq = (a) => [...new Set(a.filter((x) => !isEmpty(x)))]
const str = (v) => {
  if (isEmpty(v)) return null
  if (Array.isArray(v)) return v.map((x) => (x == null ? '' : String(x))).join(', ')
  return String(v)
}

// "Pages 1–8 are pictures..." with runs of pages shortened
export function unreadableMessage(pages) {
  if (!pages?.length) return ''
  const runs = []
  for (const p of [...pages].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1]
    if (last && p === last[1] + 1) last[1] = p
    else runs.push([p, p])
  }
  const text = runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ')
  return pages.length === 1
    ? `Page ${text} is a picture with no text — please type those details by hand.`
    : `Pages ${text} are pictures with no text — please type those details by hand.`
}

// Merge the documents found in several PDFs into one set of fields.
// Returns { fields, sources } where sources[key] is the document label the value came from.
export function mergeDocuments(documents) {
  const fields = {}
  const sources = {}
  for (const type of [...PRIORITY].reverse()) {
    for (const d of documents.filter((x) => x.type === type)) {
      for (const [k, v] of Object.entries(d.fields || {})) {
        if (isEmpty(v)) continue
        fields[k] = v
        sources[k] = d.label
      }
    }
  }

  // Containers: the Bill of Entry list is final; otherwise every document's list together
  const beDocs = documents.filter((d) => ['be', 'ooc'].includes(d.type) && d.fields?.container_numbers?.length)
  if (!beDocs.length) {
    const all = uniq(documents.flatMap((d) => d.fields?.container_numbers || []))
    if (all.length) { fields.container_numbers = all; if (documents.filter((d) => d.fields?.container_numbers?.length).length > 1) sources.container_numbers = 'Several documents' }
  }
  const seals = uniq(documents.flatMap((d) => d.fields?.seal_numbers || []))
  if (seals.length) fields.seal_numbers = seals
  const hs = uniq(documents.flatMap((d) => d.fields?.hs_codes || []))
  if (hs.length) fields.hs_codes = hs

  // Invoices: one row per invoice found, kept in line (number, date, amount, currency)
  const invoices = []
  for (const d of documents.filter((x) => x.type === 'invoice')) {
    const f = d.fields || {}
    const no = f.invoice_numbers?.[0]
    if (!no || invoices.some((i) => i.no === no)) continue
    invoices.push({ no, date: f.invoice_dates?.[0] || '', amount: f.invoice_amounts?.[0] ?? '', currency: f.invoice_currencies?.[0] || '' })
  }
  if (invoices.length) {
    fields.invoice_numbers = invoices.map((i) => i.no)
    fields.invoice_dates = invoices.some((i) => i.date) ? invoices.map((i) => i.date) : []
    fields.invoice_amounts = invoices.some((i) => i.amount !== '') ? invoices.map((i) => i.amount) : []
    fields.invoice_currencies = invoices.some((i) => i.currency) ? invoices.map((i) => i.currency) : []
    if (invoices.length > 1) for (const k of ['invoice_numbers', 'invoice_dates', 'invoice_amounts', 'invoice_currencies']) if (fields[k].length) sources[k] = 'Commercial Invoices'
  }

  if (!fields.hs_code && fields.hs_codes?.length) { fields.hs_code = fields.hs_codes[0]; sources.hs_code = sources.hs_codes }
  if (!fields.bl_number && fields.awb_number) { fields.bl_number = fields.awb_number; sources.bl_number = sources.awb_number }
  return { fields, sources }
}

// Main number and date of each document, for the "Supporting Documents" list
function docReference(d) {
  const f = d.fields || {}
  switch (d.type) {
    case 'be': return { reference_no: f.be_number, date: f.be_date }
    case 'ooc': return { reference_no: f.ooc_number || f.be_number, date: f.ooc_date || f.be_date }
    case 'bl': return { reference_no: f.bl_number, date: f.bl_date }
    case 'awb': return { reference_no: f.awb_number, date: null }
    case 'invoice': return { reference_no: f.invoice_numbers?.[0], date: f.invoice_dates?.[0] }
    case 'stamp_duty': return { reference_no: f.stamp_duty_grn, date: f.stamp_duty_date }
    case 'terminal_charges': return { reference_no: f.terminal_invoice_no, date: null }
    case 'insurance': return { reference_no: f.policy_no, date: f.policy_date }
    default: return { reference_no: null, date: null }
  }
}

export function supportingDocuments(documents) {
  const out = []
  for (const d of documents || []) {
    if (d.type === 'other' || d.type === 'unreadable') continue
    const ref = docReference(d)
    const row = { type: d.label, reference_no: ref.reference_no || '', date: ref.date || '', present: true }
    if (!out.some((r) => r.type === row.type && r.reference_no === row.reference_no)) out.push(row)
  }
  return out
}

// Fields for the "Documents & OCR" page: { key: { value, confidence, source } }, values as text
export function toOcrFields(readerFields, documents = [], sources = {}) {
  const f = readerFields || {}
  const docs = supportingDocuments(documents)
  const raw = {
    bl_number: f.bl_number || f.awb_number,
    bl_date: f.bl_date,
    vessel_name: f.vessel_name,
    container_numbers: f.container_numbers,
    seal_numbers: f.seal_numbers,
    container_size: f.container_size,
    shipping_line: f.shipping_line,
    consignee_name: f.consignee_name,
    consignee_address: f.consignee_address,
    importer_gstin: f.importer_gstin,
    importer_iec: f.importer_iec,
    ad_code: null,
    supplier_name: f.supplier_name,
    supplier_address: null,
    supplier_country: null,
    country_of_origin: f.country_of_origin,
    country_of_consignment: null,
    port_of_loading: f.port_of_loading,
    port_of_shipment: null,
    port_of_discharge: f.port_of_discharge,
    place_of_delivery: f.place_of_delivery,
    igm_number: f.igm_number,
    igm_date: f.igm_date,
    hawb_number: f.hawb_number,
    hawb_date: null,
    invoice_numbers: f.invoice_numbers,
    invoice_dates: f.invoice_dates,
    invoice_amounts: f.invoice_amounts,
    invoice_currencies: f.invoice_currencies,
    payment_terms: f.payment_terms,
    freight_amount: null,
    insurance_amount: null,
    exchange_rates: null,
    package_count: f.package_count,
    gross_weight: f.gross_weight,
    net_weight: f.net_weight,
    goods_description: f.goods_description,
    hs_code: f.hs_code,
    invoice_line_items: f.invoice_line_items?.length ? JSON.stringify(f.invoice_line_items) : null,
    supporting_documents: docs.length ? JSON.stringify(docs) : null,
  }
  const srcKey = { bl_number: f.bl_number ? 'bl_number' : 'awb_number' }
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    const value = str(v)
    if (value == null) { out[k] = { value: null, confidence: null, source: null }; continue }
    const source = k === 'supporting_documents' ? null : sources[srcKey[k] || k] || null
    const sure = SURE_SOURCES.includes(source) || k === 'container_numbers' || k === 'supporting_documents'
    out[k] = { value, confidence: sure ? 'high' : 'medium', source }
  }
  return out
}

// Fields for the staff "Extract" checklist: { key: { value, confidence } }
export function toExtractFields(readerFields, sources = {}) {
  const f = readerFields || {}
  const pk = f.package_count != null ? [f.package_count, f.package_unit].filter(Boolean).join(' ') : null
  const raw = {
    bl_number: [f.bl_number || f.awb_number, f.bl_number ? 'bl_number' : 'awb_number'],
    bl_date: [f.bl_date, 'bl_date'],
    vessel_name: [f.vessel_name, 'vessel_name'],
    voyage_number: [f.voyage_no, 'voyage_no'],
    container_numbers: [f.container_numbers, 'container_numbers'],
    port_of_loading: [f.port_of_loading, 'port_of_loading'],
    port_of_discharge: [f.port_of_discharge, 'port_of_discharge'],
    shipper_name: [f.supplier_name, 'supplier_name'],
    consignee_name: [f.consignee_name, 'consignee_name'],
    notify_party: [null],
    hs_code: [f.hs_code, 'hs_code'],
    goods_description: [f.goods_description, 'goods_description'],
    invoice_number: [f.invoice_numbers, 'invoice_numbers'],
    invoice_date: [f.invoice_dates, 'invoice_dates'],
    invoice_value: [f.invoice_amounts, 'invoice_amounts'],
    currency: [f.invoice_currencies?.length ? uniq(f.invoice_currencies) : null, 'invoice_currencies'],
    shipment_terms: [f.payment_terms, 'payment_terms'],
    country_of_origin: [f.country_of_origin, 'country_of_origin'],
    number_of_packages: [pk, 'package_count'],
    gross_weight: [f.gross_weight, 'gross_weight'],
    net_weight: [f.net_weight, 'net_weight'],
  }
  const out = {}
  for (const [k, [v, srcKey]] of Object.entries(raw)) {
    const value = str(v)
    if (value == null) { out[k] = { value: null, confidence: null }; continue }
    const sure = SURE_SOURCES.includes(sources[srcKey]) || k === 'container_numbers'
    out[k] = { value, confidence: sure ? 'high' : 'medium' }
  }
  return out
}

const looksLikePdf = (bytes) => bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 // %PDF

// Fetch each stored document (by its file_url) and read it.
// Returns { fields, sources, documents, files: [{ name, found, unreadable, notPdf, error }] }
export async function readJobDocuments(pdfjs, docs, onProgress = () => {}) {
  const documents = []
  const files = []
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]
    const name = doc.file_name || `Document ${i + 1}`
    onProgress(`Reading ${name} (${i + 1} of ${docs.length})...`)
    const file = { name, found: '', unreadable: [], notPdf: false, error: null }
    files.push(file)
    try {
      const res = await fetch(doc.file_url)
      if (!res.ok) throw new Error(`could not open the file (error ${res.status})`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (!looksLikePdf(bytes)) { file.notPdf = true; continue }
      const result = await readPdf(pdfjs, bytes)
      // picture pages get their own message, so leave them out of the list of what was found
      file.found = describeDocuments({ documents: result.documents.filter((d) => d.type !== 'unreadable') })
      file.unreadable = result.unreadablePages || []
      documents.push(...result.documents.map((d) => ({ ...d, fileName: name })))
    } catch (e) {
      file.error = e?.message || 'could not be read'
    }
  }
  const { fields, sources } = mergeDocuments(documents)
  return { fields, sources, documents, files }
}
