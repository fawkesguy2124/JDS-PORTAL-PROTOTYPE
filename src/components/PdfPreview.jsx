import { useEffect, useRef, useState } from 'react'
import { docBlob } from '../services/docFiles'

// Shows a PDF by drawing its pages in the portal itself (pdf.js), so it works in
// every browser and on phones, which often can't show a PDF inside a page.
// The file comes from private storage (docBlob); nothing leaves the browser.
const MAX_PAGES = 30

export default function PdfPreview({ doc }) {
  const box = useRef(null)
  const [state, setState] = useState({ status: 'loading', pages: 0, shown: 0 })

  useEffect(() => {
    let live = true
    let pdf = null
    const host = box.current
    if (!host || !doc) return undefined
    host.innerHTML = ''
    setState({ status: 'loading', pages: 0, shown: 0 })
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href
        const bytes = new Uint8Array(await (await docBlob(doc)).arrayBuffer())
        if (!live) return
        pdf = await pdfjs.getDocument({ data: bytes }).promise
        const count = Math.min(pdf.numPages, MAX_PAGES)
        // sharp on high-resolution screens, sized to the window's width
        const width = Math.max(320, host.clientWidth - 8)
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        for (let n = 1; n <= count; n++) {
          if (!live) return
          const page = await pdf.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const view = page.getViewport({ scale: (width / base.width) * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = view.width
          canvas.height = view.height
          canvas.style.width = `${width}px`
          canvas.style.display = 'block'
          canvas.style.margin = '0 auto 12px'
          canvas.style.background = '#fff'
          canvas.style.boxShadow = '0 1px 3px rgba(0,0,0,.15)'
          canvas.setAttribute('aria-label', `Page ${n} of ${pdf.numPages}`)
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: view, canvas }).promise
          if (!live) return
          host.appendChild(canvas)
          setState({ status: 'ok', pages: pdf.numPages, shown: n })
        }
      } catch (e) {
        if (live) setState({ status: 'error', pages: 0, shown: 0, message: e?.message })
      }
    })()
    return () => { live = false; pdf?.destroy?.() }
  }, [doc])

  return (
    <div style={{ width: '100%', alignSelf: 'flex-start' }}>
      {state.status === 'loading' && <p className="text-sm text-[#8a96a8] text-center">Opening…</p>}
      {state.status === 'error' && (
        <p className="text-sm text-[#b91c1c] text-center">This PDF could not be shown here. Use Download to open it.</p>
      )}
      <div ref={box} />
      {state.status === 'ok' && state.pages > MAX_PAGES && state.shown === MAX_PAGES && (
        <p className="text-xs text-[#8a96a8] text-center">Showing the first {MAX_PAGES} of {state.pages} pages. Use Download for the full file.</p>
      )}
    </div>
  )
}
