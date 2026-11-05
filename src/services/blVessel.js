import { readPdf, readScanText, shipText } from '../utils/docReader'

// (shipText now lives with the shared PDF reader; still exported here for older callers)
export { shipText }

// What a BL says, soft copy, scan or photo, with the portal's own reader (no AI, the paper
// never leaves the browser): { vessel: "MSC AURORA / 543W" | null, bl_no, containers: [..], shipping_line }.
// Used when a BL is uploaded to a job, so the job gets what it is missing (never
// overwritten) and ship tracking can start from it (Jose, 1 Nov 2026).
export async function readBlFile(file) {
  const none = { vessel: null, bl_no: null, containers: [], shipping_line: null }
  if (!file) return none
  const isPdf = /\.pdf$/i.test(file.name || '') || file.type === 'application/pdf'
  const isImage = /\.(jpe?g|png)$/i.test(file.name || '') || /^image\/(jpeg|png)$/.test(file.type || '')
  if (!isPdf && !isImage) return none
  const { ocrImage, ocrPdfPage, pdfOptions } = await import('../utils/ocr')
  let result
  if (isPdf) {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href
    result = await readPdf(pdfjs, new Uint8Array(await file.arrayBuffer()), { ocrPage: ocrPdfPage, isBl: true, docOptions: pdfOptions(pdfjs) })
  } else result = readScanText(await ocrImage(file))
  const f = result?.fields || {}
  return {
    vessel: shipText(f.vessel_name, f.voyage_no),
    bl_no: f.bl_number || null,
    containers: f.container_numbers || [],
    shipping_line: f.shipping_line || null,
    fromScan: !!result?.fromScan,
  }
}

// (kept for older callers) the ship name alone
export async function vesselFromBl(file) {
  return (await readBlFile(file)).vessel
}
