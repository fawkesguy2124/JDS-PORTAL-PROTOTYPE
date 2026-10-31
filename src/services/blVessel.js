import { readPdf } from '../utils/docReader'
import { isNotShipName } from '../../supabase/functions/_shared/portal/shippingLines.js'
import { loadPdfjs } from '../utils/pdfjs'

// The ship name (and voyage) from a BL PDF, with the portal's own PDF reader (no AI,
// nothing leaves the browser). Returns "MSC AURORA / 543W", or null.
// Used when a BL is uploaded to a job that has no vessel yet, so the Vessels page
// can follow the ship from the pre-alert, long before the IGM.
export async function vesselFromBl(file) {
  if (!file || !/\.pdf$/i.test(file.name || '') && file.type !== 'application/pdf') return null
  const pdfjs = await loadPdfjs()
  const result = await readPdf(pdfjs, new Uint8Array(await file.arrayBuffer()))
  const f = result?.fields || {}
  // an address line read as the ship (J-644: "ANDHERI EAST.MUMBAI. PINCODE / 400099") is dropped
  if (!f.vessel_name || isNotShipName(f.vessel_name) || isNotShipName(f.voyage_no)) return null
  return `${f.vessel_name}${f.voyage_no ? ` / ${f.voyage_no}` : ''}`
}
