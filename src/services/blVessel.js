import { readPdf } from '../utils/docReader'
import { isLineNotShip, isNotShipName } from '../../supabase/functions/_shared/portal/shippingLines.js'

// What a BL PDF says, with the portal's own PDF reader (no AI, nothing leaves the
// browser): { vessel: "MSC AURORA / 543W" | null, bl_no, containers: [..], shipping_line }.
// Used when a BL is uploaded to a job, so the job gets what it is missing (never
// overwritten) and ship tracking can start from it (Jose, 1 Nov 2026).
export async function readBlFile(file) {
  const none = { vessel: null, bl_no: null, containers: [], shipping_line: null }
  if (!file || !/\.pdf$/i.test(file.name || '') && file.type !== 'application/pdf') return none
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href
  const result = await readPdf(pdfjs, new Uint8Array(await file.arrayBuffer()))
  const f = result?.fields || {}
  return {
    vessel: shipText(f.vessel_name, f.voyage_no),
    bl_no: f.bl_number || null,
    containers: f.container_numbers || [],
    shipping_line: f.shipping_line || null,
  }
}

// "MSC AURORA / 543W", or null when what was read is not a ship: an address line (J-644:
// "ANDHERI EAST.MUMBAI. PINCODE / 400099") or a shipping line's name ("EVERGREEN")
export function shipText(name, voyage) {
  if (!name || isNotShipName(name) || isNotShipName(voyage) || isLineNotShip(name)) return null
  return `${name}${voyage ? ` / ${voyage}` : ''}`
}

// (kept for older callers) the ship name alone
export async function vesselFromBl(file) {
  return (await readBlFile(file)).vessel
}
