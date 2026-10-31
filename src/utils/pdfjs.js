// The one way the app loads pdf.js (docs/DESIGN.md performance rules): the
// library is fetched only when a PDF is actually read or shown, and every
// caller shares the same worker file, so the build emits a single worker.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let loading = null

/** Resolves to the pdfjs-dist module with its worker set. */
export function loadPdfjs() {
  if (!loading) {
    loading = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      return pdfjs
    }).catch((e) => { loading = null; throw e })
  }
  return loading
}
