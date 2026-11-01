// A BE / OOC PDF sent on WhatsApp is read by the portal's own BE reader (no AI:
// ICEGATE PDFs carry real text), so the bot can offer "record BE … on J-…" with a
// Yes / No, instead of anyone typing the numbers (Jose, 24 Oct 2026).
import { pdfToLines, parseBeLines } from '../_shared/portal/beParser.js'
import { parseContainerNos, isDelivered } from '../_shared/portal/journeyCore.js'
import { lineFromBl } from '../_shared/portal/shippingLines.js'

const norm = (s: unknown) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const isoDay = (s: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null)

// The BE fields of a PDF, or null when it is not an ICEGATE BE / OOC copy
export async function readBeFile(bytes: Uint8Array): Promise<any | null> {
  const { getDocumentProxy }: any = await import('https://esm.sh/unpdf@0.12.1')
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const be = parseBeLines(await pdfToLines(pdf))
  return be && /^\d{6,7}$/.test(String(be.be_no || '')) && isoDay(be.be_date) ? be : null
}

// Which open job a BE belongs to: the same BE number, else its BL / house BL,
// else one of its containers. Returns the job and how it was matched.
export function jobForBe(be: any, jobs: any[]): { job: any; how: string } | null {
  const open = (jobs || []).filter((j) => !isDelivered(j) && j.job_type !== 'export')
  const byBe = open.find((j) => norm(j.be_no) === norm(be.be_no))
  if (byBe) return { job: byBe, how: `BE ${be.be_no}` }
  const bls = [be.bl_no, be.hbl_no].map(norm).filter((x) => x.length >= 6)
  const byBl = bls.length ? open.find((j) => bls.includes(norm(j.bl_no))) : null
  if (byBl) return { job: byBl, how: `BL ${byBl.bl_no}` }
  const boxes = parseContainerNos(Array.isArray(be.containers) ? be.containers.join(' ') : be.containers)
  const byBox = boxes.length ? open.filter((j) => parseContainerNos(j.containers).some((c: string) => boxes.includes(c))) : []
  if (byBox.length === 1) return { job: byBox[0], how: `container ${parseContainerNos(byBox[0].containers).find((c: string) => boxes.includes(c))}` }
  return null
}

// What a BE fills on its job (Jose, 1 Nov 2026: "shouldn't the BE autofill the entire
// job?"): the same fields the portal's Create job takes from a BE: containers, BL /
// house BL, port, mode, shipping line, goods, HS code, arrival (inward date). Only what
// the job doesn't have yet is filled, never over what someone typed. A job the bot made
// from a BE post had its mode and port guessed from the post: there the BE corrects them.
export function beFill(be: any, job: any): { fields: Record<string, unknown>; said: string[] } {
  const fields: Record<string, unknown> = {}
  const said: string[] = []
  if (!be || !job) return { fields, said }
  const madeFromPost = job.field_meta?.created_via === 'whatsapp_post'
  const beMode = be.mode === 'Air' ? 'Air' : /^sea$/i.test(String(be.mode || '')) ? (be.load === 'LCL' ? 'Sea LCL' : 'Sea FCL') : null
  if (beMode && (!job.mode || (madeFromPost && job.mode !== beMode && !(job.mode === 'BPT/MBPT' && beMode !== 'Air')))) { fields.mode = beMode; said.push(beMode) }
  if (be.port_code && (!job.port_code || (madeFromPost && job.port_code !== be.port_code))) { fields.port_code = be.port_code; said.push(`port ${be.port_code}`) }
  const sea = (fields.mode || job.mode) !== 'Air'
  const boxes = parseContainerNos(Array.isArray(be.containers) ? be.containers.join(' ') : be.containers)
  if (sea && boxes.length && !parseContainerNos(job.containers).length) { fields.containers = boxes.join(' '); said.push(`${boxes.length === 1 ? 'container' : `${boxes.length} containers`} ${boxes.join(', ')}`) }
  if (be.bl_no && !job.bl_no) { fields.bl_no = String(be.bl_no); said.push(`${sea ? 'BL' : 'MAWB'} ${be.bl_no}`) }
  if (be.hbl_no && !job.ulip_refs?.hawb_no) { fields.ulip_refs = { ...(job.ulip_refs || {}), hawb_no: String(be.hbl_no) }; said.push(`${sea ? 'house BL' : 'HAWB'} ${be.hbl_no}`) }
  // the IGM (it finds the ship and the arrival), also when the BE number was already there
  if (be.igm_no && isoDay(be.igm_date) && !job.ulip_refs?.igm_no) {
    fields.ulip_refs = { ...((fields.ulip_refs as any) || job.ulip_refs || {}), igm_no: String(be.igm_no), igm_date: be.igm_date }
    said.push(`IGM ${be.igm_no}`)
  }
  const line = sea ? lineFromBl(be.bl_no) : null
  if (line && !job.shipping_line) { fields.shipping_line = line; said.push(`line ${line}`) }
  if (be.goods && !job.goods) { fields.goods = String(be.goods).slice(0, 300); said.push(`goods "${String(be.goods).slice(0, 60)}${String(be.goods).length > 60 ? '…' : ''}"`) }
  if (be.hs_code && !job.hs_code) { fields.hs_code = String(be.hs_code); said.push(`HS ${be.hs_code}`) }
  if (isoDay(be.inward_date) && !job.eta) { fields.eta = be.inward_date; said.push(`arrived ${new Date(`${be.inward_date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`) }
  return { fields, said }
}
// the part of a BE the fill needs, kept on the waiting change until the YES
export const beForFill = (be: any) => ({
  mode: be.mode || null, load: be.load || null, port_code: be.port_code || null, containers: be.containers || [], bl_no: be.bl_no || null,
  hbl_no: be.hbl_no || null, goods: be.goods || null, hs_code: be.hs_code || null, inward_date: be.inward_date || null,
  igm_no: be.igm_no || null, igm_date: be.igm_date || null,
})

// One line about the BE, for the reply
export function beLine(be: any) {
  const d = (s: string) => new Date(`${s}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return [`${be.copy_type === 'OOC' ? 'OOC copy of BE' : 'BE'} *${be.be_no}* dated ${d(be.be_date)}`,
    be.igm_no && isoDay(be.igm_date) ? `IGM ${be.igm_no} (${d(be.igm_date)})` : null,
    be.bl_no ? `BL ${be.bl_no}` : null,
    be.client ? String(be.client) : null].filter(Boolean).join(' · ')
}
