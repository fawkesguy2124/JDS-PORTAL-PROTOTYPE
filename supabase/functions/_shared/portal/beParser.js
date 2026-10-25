// Shared by the portal (src/utils/beParser.js re-exports it) and the WhatsApp bot.
// Reads an ICEGATE Bill of Entry / Out of Charge PDF straight from its text.
// No AI and nothing leaves the computer: ICEGATE PDFs carry real text, so the
// fields can be read exactly. Scanned (image-only) PDFs return null and the
// caller falls back to the AI reader.

const DATE = /^\d{2}\/\d{2}\/\d{4}$/
const CONTAINER = /\b([A-Z]{4}\d{7})\b/g

const ddmmyyyyToIso = (s) => {
  const m = String(s || '').match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}
const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' }
// "09-OCT-26" -> "2026-10-09"
const dmonyyToIso = (s) => {
  const m = String(s || '').match(/^(\d{2})-([A-Z]{3})-(\d{2})$/)
  return m && MONTHS[m[2]] ? `20${m[3]}-${MONTHS[m[2]]}-${m[1]}` : null
}

// pdfjs text items -> page lines (top to bottom), words joined by single spaces
export async function pdfToLines(pdf) {
  const lines = []
  const positions = {}
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const byY = new Map()
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue
      const y = Math.round(it.transform[5])
      if (!byY.has(y)) byY.set(y, [])
      byY.get(y).push([it.transform[4], it.str])
    }
    lines.push(`=== PAGE ${p} ===`)
    for (const [, xs] of [...byY.entries()].sort((a, b) => b[0] - a[0])) {
      xs.sort((a, b) => a[0] - b[0])
      const line = xs.map((x) => x[1]).join(' ').replace(/\s+/g, ' ').trim()
      if (!line) continue
      positions[lines.length] = xs
      lines.push(line)
    }
  }
  lines.positions = positions
  return lines
}

const after = (lines, re, from = 0) => {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i
  return -1
}

// What Customs' risk system (RMS) decided, from the ASSESS / EXAM flags and Part V
// The ASSESS / EXAM flags hold the final decision (an officer can order an
// examination "over and above" RMS); Part V explains it in words.
function rmsFrom(assess, exam, orderText, officerText) {
  const order = (orderText || '').trim() || null
  const officer = (officerText || '').trim() || null
  const rmsCleared = /not been prescribed/i.test(order || '')
  if (exam === 'Y') {
    const label = assess === 'Y' ? 'Assessment and examination ordered'
      : rmsCleared && /over and above/i.test(officer || '') ? 'RMS cleared, but officer ordered examination'
      : 'Examination ordered'
    return { code: 'check', label, order, officer }
  }
  if (assess === 'Y') return { code: 'apr', label: 'Assessment by officer, no examination', order, officer }
  if (assess === 'N' && exam === 'N') return { code: 'rms', label: 'RMS cleared: no assessment, no examination', order, officer }
  return { code: 'pending', label: 'Not decided yet', order, officer }
}

export function parseBeLines(lines) {
  const text = lines.join('\n')
  if (!/BILL OF ENTRY/i.test(text) || !/Port Code BE No/i.test(text)) return null

  const out = { _source: 'be-text' }

  // Header: "INNSA1 4298302 09/10/2026 H"
  const h = after(lines, /Port Code BE No/i)
  const hm = lines[h + 1]?.match(/^([A-Z]{5}\d)\s+(\d{6,7})\s+(\d{2}\/\d{2}\/\d{4})\s*([A-Z])?/)
  if (hm) {
    out.port_code = hm[1]
    out.be_no = hm[2]
    out.be_date = ddmmyyyyToIso(hm[3])
    out.be_type = hm[4] || null
  }
  out.iec = text.match(/IEC\/Br\s+([0-9A-Z]{10})/)?.[1] || null
  out.gstin = text.match(/GSTIN\/TYPE\s+([0-9A-Z]{15})/)?.[1] || null
  out.copy_type = /OOC COPY|OUT OF CHARGE COPY/.test(text) ? 'OOC' : 'BE'

  // Flags row under "(Y/N/P)": BE STATUS, MODE, DEF BE, KACHA, SEC48, REIMP, ADV BE, ASSESS, EXAM, HSS, FIRST CHECK, PROV/FINAL
  const f = after(lines, /^\(Y\/N\/P\)/)
  if (f >= 0) {
    const fm = lines[f + 1]?.match(/(Sea|Air|Land|Rail)\s+(.+)$/i)
    if (fm) {
      out.mode = fm[1]
      const flags = fm[2].trim().split(/\s+/)
      if (flags.length >= 10) {
        out.assess_flag = flags[5]
        out.exam_flag = flags[6]
        out.first_check = flags[8]
      }
    }
  }

  // Importer name and address
  const imp = after(lines, /IMPORTER\s+NAME & ADDRESS/i)
  if (imp >= 0) {
    out.client = lines[imp + 1]?.replace(/\s*2\.CB NAME.*$/i, '').trim() || null
    const addr = []
    for (let i = imp + 2; i < Math.min(imp + 8, lines.length); i++) {
      if (/^(B\.|DECLARANT|AD CODE)/.test(lines[i])) break
      const part = lines[i].replace(/\s*\d\.(CB NAME|AEO|UCR).*$/i, '').replace(/^(B\.|\d\.(AEO|UCR))\s*/, '').trim()
      if (part) addr.push(part)
    }
    out.client_address = addr.join(', ') || null
  }
  out.country_of_origin = text.match(/COUNTRY OF ORIGIN\s+(.+?)\s+14\.COUNTRY/)?.[1]?.trim() || null
  out.port_of_loading = text.match(/PORT OF LOADING\s+(.+?)\s+16\.PORT/)?.[1]?.trim() || null

  // Manifest: "1212911 19/09/2026 [inward] 0 ONEYSZPGU 21/09/2026 BNC2609061 21/09/2026 5 5395" + wrapped tail line
  const m = after(lines, /1\.IGM NO\s+2\.IGM DATE/)
  if (m >= 0) {
    const t = (lines[m + 1] || '').split(' ')
    const noIgm = t[0] === '0' && t[1] === '0'
    if (noIgm || (/^\d{1,8}$/.test(t[0]) && DATE.test(t[1] || ''))) {
      out.igm_no = noIgm ? null : t[0]
      out.igm_date = noIgm ? null : ddmmyyyyToIso(t[1])
      out.inward_date = null
      let k = 2
      if (DATE.test(t[k] || '')) { out.inward_date = ddmmyyyyToIso(t[k]); k++ }
      // Gateway IGM: "0" when none, else number + date. A gateway IGM number is short:
      // an 11-digit air waybill (MAWB) right after "0 0" is the MAWB, not a gateway IGM
      // (J-677, 25 Oct 2026: the MAWB was skipped and the HAWB taken as the BL)
      if (/^\d{1,8}$/.test(t[k] || '')) { k++; if (DATE.test(t[k] || '')) k++ }
      const rest = t.slice(k)
      // From the right: packages, gross weight
      const nums = []
      while (rest.length && /^[\d.]+$/.test(rest[rest.length - 1]) && nums.length < 2) nums.unshift(rest.pop())
      out.packages = nums[0] ? Number(nums[0]) : null
      out.gross_weight = nums[1] ? Number(nums[1]) : null
      // rest = MAWB DATE [HAWB DATE]
      let bl = rest[0] || null
      let hbl = DATE.test(rest[1] || '') && rest[2] && !DATE.test(rest[2]) ? rest[2] : null
      out.bl_date = ddmmyyyyToIso(rest[1])
      const tail = (lines[m + 2] || '').split(' ').filter((x) => /^[A-Z0-9-]+$/.test(x) && /\d/.test(x))
      if (!/^(COPY|DETAILS)/.test(lines[m + 2] || '') && tail.length) {
        const pos = lines.positions
        const xOf = (row, word) => pos?.[row]?.find(([, str]) => str.split(/\s+/).includes(word))?.[0]
        const blX = bl && xOf(m + 1, bl), hblX = hbl && xOf(m + 1, hbl)
        // An air waybill (MAWB) is always 11 digits: never add a wrapped tail to it
        const airAwb = out.mode === 'Air' && /^\d{11}$/.test(bl || '')
        if (airAwb) {
          const tx = xOf(m + 2, tail[0])
          if (hbl && tx != null && hblX != null && blX != null && Math.abs(tx - hblX) < Math.abs(tx - blX)) hbl += tail[0]
        } else if (tail.length === 1 && blX != null && hblX != null) {
          const tx = xOf(m + 2, tail[0])
          if (tx != null && Math.abs(tx - hblX) < Math.abs(tx - blX)) hbl += tail[0]
          else bl += tail[0]
        } else {
          if (bl && tail[0]) bl += tail[0]
          if (hbl && tail[1]) hbl += tail[1]
        }
      }
      out.bl_no = bl
      out.hbl_no = hbl
    }
  }

  // Containers: only from the container tables (Part I "J." and Part IV "N."), never from BL numbers
  const containers = new Set()
  const loads = new Set() // the "LCL/FCL" column: F or L per container row
  lines.forEach((ln, i) => {
    if (/CONTAINER NUMBER/.test(ln)) {
      for (let j = i + 1; j < Math.min(i + 400, lines.length); j++) {
        const row = lines[j]
        if (/^(OOC NO|INVOICE DETAILS|O\. INVOICE|=== PAGE|COPY|J\.|GLOSSARY|Page\s+\d)/.test(row) && !/[A-Z]{4}\d{7}/.test(row)) break
        for (const c of row.matchAll(CONTAINER)) containers.add(c[1])
        // Part I: "1 F 0675120 BMOU4978572" · Part IV: "BMOU4978572 0675120 F"
        const load = row.match(/\b\d{1,3}\s+([FL])\s+\S+\s+[A-Z]{4}\d{7}\b/) || row.match(/\b[A-Z]{4}\d{7}\s+\S+\s+([FL])\s*$/)
        if (load) loads.add(load[1])
      }
    }
  })
  out.containers = [...containers]
  // FCL or LCL for the whole BE (mixed or not printed: unknown)
  out.load = loads.size === 1 ? (loads.has('F') ? 'FCL' : 'LCL') : null

  // Processing events
  const ev = (name) => text.match(new RegExp(`${name}\\s+(\\d{2}-[A-Z]{3}-\\d{2})\\s+(\\d{2}:\\d{2})`))
  const sub = ev('Submission'), ass = ev('Assessment'), exm = ev('Examination')
  out.submitted_on = sub ? dmonyyToIso(sub[1]) : null
  out.assessed_on = ass ? dmonyyToIso(ass[1]) : null
  out.examined_on = exm ? dmonyyToIso(exm[1]) : null

  // OOC (only on OOC copies)
  const oocNo = text.match(/OOC NO\.?\s+(\d{6,})/)
  const oocDt = text.match(/OOC DATE\s+(\d{2}-\d{2}-\d{4})/)
  out.ooc_no = oocNo?.[1] || null
  out.ooc_date = oocDt ? ddmmyyyyToIso(oocDt[1]) : null

  // Part V: examination order by RMS
  const block = (startRe, stopRe) => {
    const i0 = after(lines, startRe)
    let t = ''
    if (i0 >= 0) {
      for (let i = i0 + 1; i < Math.min(i0 + 8, lines.length); i++) {
        if (stopRe.test(lines[i])) break
        t += (t ? ' ' : '') + lines[i]
      }
    }
    return t
  }
  const rms = rmsFrom(out.assess_flag, out.exam_flag,
    block(/^A\. EXAMINATION ORDER RMS/, /^A1\.EXAMINATION ORDER/),
    block(/^A1\.EXAMINATION ORDER/, /^B\.\s*EXAMINATION INSTRUCTIONS/))
  out.rms_status = rms.code
  out.rms_label = rms.label
  out.rms_order = rms.order
  out.officer_order = rms.officer

  // Goods: first item description in Part III (optional, best effort)
  const g = text.match(/\n\s*1\s+1\s+(\d{8})\s+([^\n]+)/)
  out.hs_code = g?.[1] || null

  // Invoices (Part IV "INVOICE DETAILS": S NO, INVOICE NO, INVOICE AMOUNT, CUR)
  const invoices = []
  lines.forEach((ln, i) => {
    if (!/S NO\s+2\. INVOICE NO\s+3\. INVOICE AMOUNT\s+4\. CUR/.test(ln)) return
    for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) {
      if (/^(ASSESSED|COPY|FIRST COPY|OOC COPY|)$/.test(lines[j].trim())) continue
      const r = lines[j].trim().match(/^(\d{1,3})\s+(\S+)\s+([\d.]+)\s+([A-Z]{3})$/)
      if (!r) break
      if (!invoices.some((x) => x.no === r[2])) invoices.push({ sno: Number(r[1]), no: r[2], amount: Number(r[3]), currency: r[4] })
    }
  })
  out.invoices = invoices

  // Items (Part II item table: S NO, CTH, DESCRIPTION, UNIT PRICE, QUANTITY, UQC, AMOUNT).
  // A long description runs onto the next lines; item numbers start again at 1 for each invoice.
  const items = []
  let inv = -1
  let lastSno = 0
  // margin labels and stamps printed in the middle of the table are skipped
  const STOP = /^(=== PAGE|GLOSSARY|Page\s+\d|PART\s|\d\.\s?S\s?NO|BILL OF ENTRY|Port Code|[F-Z]\.\s|[F-Z]\.$)/
  const NOISE = /^(COPY|FIRST COPY|ORIGINAL|DUPLICATE|OOC COPY|OUT OF CHARGE COPY|E\.|ITEM DETAILS|ASSESSED|DETAILS)$/
  // numbers may have commas or no digit before the point (".923648")
  const ITEM = /^(\d{1,4})\s+(\d{8})\s+(.+?)\s+([\d,]*\.?\d+)\s+([\d,]*\.?\d+)\s+([A-Z]{2,4})\s+([\d,]*\.?\d+)$/
  const n2 = (x) => Number(String(x).replace(/,/g, ''))
  lines.forEach((ln, i) => {
    if (!/^1\.S NO\.\s+2\.CTH\s+3\.DESCRIPTION/.test(ln)) return
    for (let j = i + 1; j < lines.length; j++) {
      const row = lines[j].trim()
      const m = row.match(ITEM)
      if (m) {
        const sno = Number(m[1])
        if (inv < 0) inv = 0
        else if (sno <= lastSno) inv++
        lastSno = sno
        items.push({ inv, sno, cth: m[2], description: m[3], unit_price: n2(m[4]), quantity: n2(m[5]), uqc: m[6], amount: n2(m[7]) })
        continue
      }
      if (!row || NOISE.test(row)) continue
      if (STOP.test(row)) break
      if (items.length) items[items.length - 1].description += ` ${row}`
    }
  })
  out.items = items.map((it) => ({
    sno: it.sno,
    invoice_no: invoices[it.inv]?.no || null,
    currency: invoices[it.inv]?.currency || null,
    cth: it.cth,
    description: it.description.replace(/\s+/g, ' ').trim(),
    unit_price: it.unit_price,
    quantity: it.quantity,
    uqc: it.uqc,
    amount: it.amount,
    country_of_origin: null,
  }))
  if (!out.hs_code && out.items[0]) out.hs_code = out.items[0].cth

  // One line for the job: the first item, "+ N more items" when there are more
  if (out.items.length) {
    const first = out.items[0].description
    const short = (first.split(/\s+-\s+|\s*\(/)[0] || first).trim()
    const name = short.length >= 4 ? short : first.slice(0, 80)
    const others = new Set(out.items.slice(1).map((x) => (x.description.split(/\s+-\s+|\s*\(/)[0] || x.description).trim()).filter((x) => x !== name))
    out.goods = others.size ? `${name} + ${others.size} more item${others.size === 1 ? '' : 's'}` : name
  } else out.goods = null

  return out
}

// Read a File/ArrayBuffer of a PDF. Returns parsed BE fields, or null when the
// PDF is not an ICEGATE BE or has no text layer.
export async function parseBePdf(pdfjs, data) {
  const pdf = await pdfjs.getDocument({ data }).promise
  const lines = await pdfToLines(pdf)
  return parseBeLines(lines)
}
