// Reads a scanned page or a photo (Jose, 5 Nov 2026: a BL starts ship tracking, "either scanned or
// a soft copy"). Tesseract runs in this browser: free, no AI service, and the paper never leaves
// the computer. Only its language file is downloaded, once, then kept by the browser.
// How pdf.js gets a PDF's Chinese / Japanese / Korean font tables: without them, the text of many
// BLs from China comes out as stray letters (J-673: "i i i i i"). Only for the fonts; no paper is sent.
export const pdfOptions = (pdfjs) => ({
  cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
})

const PAGE_LIMIT_MS = 120_000
const IDLE_MS = 120_000
const MAX_WIDTH = 2800
const HARD_WIDTH = 3600

let worker = null
let idleTimer = null

async function getWorker() {
  clearTimeout(idleTimer)
  if (!worker) {
    worker = import('tesseract.js').then(({ createWorker }) => createWorker('eng'))
    worker.catch(() => { worker = null })
  }
  return worker
}

// the engine takes a lot of memory: let go of it once the upload is done
function releaseLater() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    const w = worker
    worker = null
    w?.then((x) => x.terminate()).catch(() => {})
  }, IDLE_MS)
}

async function readOnce(source, sparse = false) {
  let timer
  try {
    const w = await getWorker()
    // (sparse: scattered text such as a number in a table cell, for the second, harder reading)
    await w.setParameters({ tessedit_pageseg_mode: sparse ? '11' : '3' })
    const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('took too long')), PAGE_LIMIT_MS) })
    const { data } = await Promise.race([w.recognize(source), limit])
    return { text: data?.text || '', confidence: data?.confidence || 0 }
  } catch (e) {
    console.warn('[ocr] could not read the page:', e?.message)
    // the engine may be stuck on that page: the next one gets a fresh engine
    const stuck = worker
    worker = null
    stuck?.then((x) => x.terminate()).catch(() => {})
    return { text: '', confidence: 0 }
  } finally {
    clearTimeout(timer)
    releaseLater()
  }
}

// the engine's own confidence in its reading (0-100): a page on its side reads as noise, with low
// confidence; one the right way up is well above this
const SURE = 60

function turned(source, degrees) {
  const wide = degrees % 180 !== 0
  const c = document.createElement('canvas')
  c.width = wide ? source.height : source.width
  c.height = wide ? source.width : source.height
  const x = c.getContext('2d')
  x.translate(c.width / 2, c.height / 2)
  x.rotate((degrees * Math.PI) / 180)
  x.drawImage(source, -source.width / 2, -source.height / 2)
  return c
}

// twice the size, for the harder reading of a low-resolution photo
function enlarged(source) {
  const c = document.createElement('canvas')
  c.width = source.width * 2
  c.height = source.height * 2
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height)
  return c
}

// A canvas or an image file → its text. Scans are often sideways or upside down: a reading the
// engine isn't sure of is tried with the page turned, and the surest one kept. A page that can't be
// read gives '', never an error, so an unclear scan can't stop the upload.
// opts.hard: the second reading, larger and as scattered text.
export async function ocrImage(source, opts = {}) {
  // a damaged image is known at once, before the engine is asked (one in the JD group chat's photos
  // stopped the engine dead)
  let drawable = source
  if (!(source instanceof HTMLCanvasElement)) {
    try { drawable = await createImageBitmap(source) } catch { return '' }
  }
  if (opts.hard) {
    const big = source instanceof HTMLCanvasElement ? drawable : enlarged(drawable)
    return (await readOnce(big, true)).text
  }
  let best = await readOnce(source)
  if (best.confidence >= SURE) return best.text
  for (const degrees of [90, 270, 180]) {
    const next = await readOnce(turned(drawable, degrees))
    if (next.confidence > best.confidence) best = next
    if (best.confidence >= SURE) break
  }
  return best.text
}

// One page of an open PDF (pdf.js) → its text
export async function ocrPdfPage(pdf, pageNo, opts = {}) {
  const page = await pdf.getPage(pageNo)
  const plain = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: opts.hard ? Math.min(300 / 72, HARD_WIDTH / plain.width) : Math.min(3, MAX_WIDTH / plain.width) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  // ('print': the screen's frame timer stops in a background tab, and staff switch tabs while it reads)
  let timer
  const task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, intent: 'print' })
  try {
    const limit = new Promise((_, reject) => { timer = setTimeout(() => { task.cancel(); reject(new Error('the page took too long to draw')) }, PAGE_LIMIT_MS) })
    await Promise.race([task.promise, limit])
  } catch (e) {
    console.warn('[ocr] could not draw the page:', e?.message)
    return ''
  } finally {
    clearTimeout(timer)
  }
  const text = await ocrImage(canvas, opts)
  canvas.width = 0
  return text
}
