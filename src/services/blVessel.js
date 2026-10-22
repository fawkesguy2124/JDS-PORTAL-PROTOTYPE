import { readPdf } from '../utils/docReader'

// The ship name (and voyage) from a BL PDF, with the portal's own PDF reader (no AI,
// nothing leaves the browser). Returns "MSC AURORA / 543W", or null.
// Used when a BL is uploaded to a job that has no vessel yet, so the Vessels page
// can follow the ship from the pre-alert, long before the IGM.
export async function vesselFromBl(file) {
  if (!file || !/\.pdf$/i.test(file.name || '') && file.type !== 'application/pdf') return null
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href
  const result = await readPdf(pdfjs, new Uint8Array(await file.arrayBuffer()))
  const f = result?.fields || {}
  return f.vessel_name ? `${f.vessel_name}${f.voyage_no ? ` / ${f.voyage_no}` : ''}` : null
}
