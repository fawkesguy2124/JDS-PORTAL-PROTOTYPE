// Any shipping document sent on WhatsApp fills its job (Jose, 1 Nov 2026: "if a BL, a
// packing list, any document is uploaded through WhatsApp, the details should be added").
// The PDF is read by the portal's own reader (docReader.js, no AI: the same code Create
// job uses), so a BE, OOC, BL, air waybill, invoice, packing list or a bundle of them gives
// the same fields on WhatsApp as in the portal. Only what the job doesn't have yet is
// filled, never over what someone typed; a document of another shipment fills nothing.
import { readPdf, shipText } from '../_shared/portal/docReader.js'
import { parseContainerNos, isDelivered } from '../_shared/portal/journeyCore.js'

const norm = (s: unknown) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const isoDay = (s: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null)
const day = (s: string) => new Date(`${s}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

// what the reader found, as the portal's paper types (an air waybill counts as the BL)
const FROM_READER: Record<string, string> = { be: 'BE', ooc: 'OOC', bl: 'BL', awb: 'BL', invoice: 'Invoice', packing_list: 'Packing List', insurance: 'Insurance', coo: 'COO' }

export type DocRead = {
  types: string[] // e.g. ['BL'] or ['BE', 'Invoice'] for a bundle
  found: string // "Bill of Lading (p1–2)"
  be: any | null // the ICEGATE BE / OOC, when there is one
  fields: Record<string, any> // the job fields, named as on the job
}

// Reads a PDF the way Create job does. null when it has no readable text (a scan / photo).
export async function readDocFile(bytes: Uint8Array): Promise<DocRead | null> {
  const { getDocumentProxy }: any = await import('https://esm.sh/unpdf@0.12.1')
  // the reader asks for pdf.js; unpdf gives the same document object
  const pdfjs = { getDocument: ({ data }: { data: Uint8Array }) => ({ promise: getDocumentProxy(new Uint8Array(data)) }) }
  const r: any = await readPdf(pdfjs, bytes)
  const f = r?.fields || {}
  const types = [...new Set((r?.documents || []).map((d: any) => FROM_READER[d.type]).filter(Boolean))] as string[]
  const range = (ps: number[]) => (ps.length === 1 ? `p${ps[0]}` : `p${ps[0]}–${ps[ps.length - 1]}`)
  const found = (r?.documents || []).filter((d: any) => d.type !== 'other' && d.type !== 'unreadable').map((d: any) => `${d.label} (${range(d.pages)})`).join(', ')
  const be = r?.be && /^\d{6,7}$/.test(String(r.be.be_no || '')) && isoDay(r.be.be_date) ? r.be : null
  // the same names Create job uses for these fields
  const fields = {
    client: f.client || null,
    bl_no: f.bl_number || null,
    hawb_no: f.hawb_number || null,
    containers: f.container_numbers || [],
    container_size: f.container_size || null,
    container_load: f.container_load || null,
    shipping_line: f.shipping_line || null,
    vessel: shipText(f.vessel_name, f.voyage_no),
    goods: f.goods_description || null,
    eta: f.eta || null,
    hs_code: f.hs_code || null,
    be_no: f.be_number || null,
    be_date: f.be_date || null,
    igm_no: f.igm_number || null,
    igm_date: f.igm_date || null,
    port_code: f.port_code || null,
    mode: f.mode || null, // the BE's "Sea" / "Air"
    ooc_no: f.ooc_number || null,
    ooc_date: f.ooc_date || null,
  }
  // nothing read at all (a scan, a photo saved as PDF): the bot says so
  if (!types.length && !found && !fields.bl_no && !fields.be_no && !fields.containers.length) return null
  return { types, found, be, fields }
}

// Which open job a document belongs to: its BE, then its BL / house BL / AWB, then one of
// its containers. Returns the job and how it was matched.
export function jobForDoc(d: DocRead, jobs: any[]): { job: any; how: string } | null {
  const open = (jobs || []).filter((j) => !isDelivered(j) && j.job_type !== 'export')
  const f = d.fields
  if (f.be_no) { const j = open.find((x) => norm(x.be_no) === norm(f.be_no)); if (j) return { job: j, how: `BE ${f.be_no}` } }
  const refs = [f.bl_no, f.hawb_no].map(norm).filter((x) => x.length >= 6)
  if (refs.length) {
    const j = open.find((x) => refs.includes(norm(x.bl_no)) || refs.includes(norm(x.ulip_refs?.hawb_no)))
    if (j) return { job: j, how: `${d.types.includes('BL') ? 'BL' : 'number'} ${refs[0]}` }
  }
  const boxes = parseContainerNos((f.containers || []).join(' '))
  const byBox = boxes.length ? open.filter((x) => parseContainerNos(x.containers).some((c: string) => boxes.includes(c))) : []
  if (byBox.length === 1) return { job: byBox[0], how: `container ${parseContainerNos(byBox[0].containers).find((c: string) => boxes.includes(c))}` }
  return null
}

// What the document fills on the job: only empty fields. A job the bot made from a BE post
// had its mode and port guessed from the post: there the papers correct them.
// mismatch = the document's containers are all different from the job's (another shipment)
export function docFill(f: Record<string, any>, job: any): { fields: Record<string, unknown>; said: string[]; mismatch: string | null } {
  const fields: Record<string, unknown> = {}
  const said: string[] = []
  if (!f || !job) return { fields, said, mismatch: null }
  const have = parseContainerNos(job.containers)
  const boxes = parseContainerNos((f.containers || []).join(' '))
  if (have.length && boxes.length && !boxes.some((b: string) => have.includes(b))) {
    return { fields, said, mismatch: `its containers (${boxes.slice(0, 3).join(', ')}) are not ${job.job_no}'s (${have.slice(0, 3).join(', ')})` }
  }
  const madeFromPost = job.field_meta?.created_via === 'whatsapp_post'
  // mode: the BE says Sea / Air; the BL says FCL / LCL
  const sea = /^sea$/i.test(String(f.mode || '')) || (!f.mode && (boxes.length > 0 || !!f.container_load))
  const docMode = f.mode === 'Air' ? 'Air' : sea ? (f.container_load === 'LCL' ? 'Sea LCL' : f.container_load === 'FCL' || /^sea$/i.test(String(f.mode || '')) ? 'Sea FCL' : null) : null
  if (docMode && (!job.mode || (madeFromPost && job.mode !== docMode && !(job.mode === 'BPT/MBPT' && docMode !== 'Air')))) { fields.mode = docMode; said.push(docMode) }
  if (f.port_code && (!job.port_code || (madeFromPost && job.port_code !== f.port_code))) { fields.port_code = f.port_code; said.push(`port ${f.port_code}`) }
  const isAir = (fields.mode || job.mode) === 'Air'
  if (!isAir && boxes.length && !have.length) {
    fields.containers = boxes.join(' ')
    if (f.container_size) fields.container_sizes = Object.fromEntries(boxes.map((b: string) => [b, f.container_size]))
    said.push(`${boxes.length === 1 ? 'container' : `${boxes.length} containers`} ${boxes.join(', ')}${f.container_size ? ` (${f.container_size})` : ''}`)
  }
  if (f.bl_no && !job.bl_no) { fields.bl_no = String(f.bl_no); said.push(`${isAir ? 'MAWB' : 'BL'} ${f.bl_no}`) }
  let refs = job.ulip_refs || {}
  if (f.hawb_no && !refs.hawb_no) { refs = { ...refs, hawb_no: String(f.hawb_no) }; fields.ulip_refs = refs; said.push(`${isAir ? 'HAWB' : 'house BL'} ${f.hawb_no}`) }
  if (f.igm_no && isoDay(f.igm_date) && !refs.igm_no) { refs = { ...refs, igm_no: String(f.igm_no), igm_date: f.igm_date }; fields.ulip_refs = refs; said.push(`IGM ${f.igm_no}`) }
  if (!isAir && f.shipping_line && !job.shipping_line) { fields.shipping_line = f.shipping_line; said.push(`line ${f.shipping_line}`) }
  if (!isAir && f.vessel && !job.vessel) { fields.vessel = f.vessel; said.push(`ship ${f.vessel}`) }
  if (f.goods && !job.goods) { fields.goods = String(f.goods).slice(0, 300); said.push(`goods "${String(f.goods).slice(0, 60)}${String(f.goods).length > 60 ? '…' : ''}"`) }
  if (f.hs_code && !job.hs_code) { fields.hs_code = String(f.hs_code); said.push(`HS ${f.hs_code}`) }
  if (isoDay(f.eta) && !job.eta) { fields.eta = f.eta; said.push(`arrived ${day(f.eta)}`) }
  return { fields, said, mismatch: null }
}

// the part of the reading the fill needs, kept on the waiting change until the YES
export const fillArgs = (f: Record<string, any>) => Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)))
