// A BE / OOC PDF sent on WhatsApp is read by the portal's own BE reader (no AI:
// ICEGATE PDFs carry real text), so the bot can offer "record BE … on J-…" with a
// Yes / No, instead of anyone typing the numbers (Jose, 24 Oct 2026).
import { pdfToLines, parseBeLines } from '../_shared/portal/beParser.js'
import { parseContainerNos, isDelivered } from '../_shared/portal/journeyCore.js'

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

// One line about the BE, for the reply
export function beLine(be: any) {
  const d = (s: string) => new Date(`${s}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return [`${be.copy_type === 'OOC' ? 'OOC copy of BE' : 'BE'} *${be.be_no}* dated ${d(be.be_date)}`,
    be.igm_no && isoDay(be.igm_date) ? `IGM ${be.igm_no} (${d(be.igm_date)})` : null,
    be.bl_no ? `BL ${be.bl_no}` : null,
    be.client ? String(be.client) : null].filter(Boolean).join(' · ')
}
