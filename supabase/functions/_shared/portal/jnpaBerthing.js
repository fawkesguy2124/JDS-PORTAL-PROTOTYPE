// JNPA's daily berthing reports (Jose, 7 Nov 2026: staff open them on jnport.gov.in to see
// when a ship berths; a free check that needs no tracking service). The page
// https://www.jnport.gov.in/page/daily-berthing-report/… has a table of the ships at berth
// now, with one PDF per terminal listing the ships that sailed in the last 24 hours, the
// ships at berth and the ships expected (with ETA), each terminal in its own layout.
// The reader does not try to understand every layout: it looks for each JDS ship by name and
// reads the row it is on (which part of the report, and the date on that row). All times are
// India time. Pure functions, used by the port-berthing function and tested in bot-check.

// the container terminals; the rest of the page is liquid / bulk berths
export const CONTAINER_TERMINALS = ['NSFT', 'NSICT', 'NSIGT', 'APMT', 'BMCT']

const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 }
const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d, hh, mm) => `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00+05:30`

// a ship's name as the reports print it: capitals, no dots or dashes ("X-PRESS" = "XPRESS")
export function shipKey(name) {
  return String(name || '').toUpperCase()
    .replace(/\s*\/.*$/, '') // "MSC ANNA / 512W": the voyage goes
    .replace(/^(M\.?\s?V\.?|MV)\s+/, '')
    .replace(/[^A-Z0-9]+/g, ' ').replace(/\bX PRESS\b/g, 'XPRESS').trim()
}
const lineKey = (s) => ` ${shipKey(String(s || '').replace(/\//g, ' '))} `
// Is this ship named on the line, as itself and not as the start of a longer name? A Roman
// numeral after it is another ship (MSC YORK ≠ MSC YORK VII), and a one-word name followed by
// another word is part of a longer name ("EVER" in "EVER BRACE"). Service codes after a name
// ("MSC TINA SENTOSA MSC") are allowed for names of two words or more.
const ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/
export function namedOn(line, key) {
  const L = lineKey(line)
  const oneWord = !key.includes(' ')
  let from = 0
  for (;;) {
    const i = L.indexOf(` ${key} `, from)
    if (i < 0) return false
    const after = L.slice(i + key.length + 2).split(' ')[0] || ''
    if (!ROMAN.test(after) && !(oneWord && /^[A-Z]{2,}$/.test(after))) return true
    from = i + 1
  }
}

// the year of a date printed without one: the report's year, or the next one around New Year
function yearFor(month, ref) {
  const y = ref.getUTCFullYear(), m = ref.getUTCMonth() + 1
  return month < m - 6 ? y + 1 : month > m + 6 ? y - 1 : y
}

// Every date-time on a line, in order, as ISO (India time). Formats seen 7 Nov 2026:
// 06-11-2026 10:48 · 06/11/2026 18:24 · Sun/08/11 03:00 · 07-Nov 08:00 · 07-Nov-26 01:00
export function dateTimes(text, ref = new Date()) {
  const out = []
  const s = String(text || '')
  const re = /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})|\b(?:MON|TUE|WED|THU|FRI|SAT|SUN)\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})|\b(\d{1,2})-([A-Z]{3})(?:-(\d{2,4}))?\s+(\d{1,2}):(\d{2})/gi
  let m
  while ((m = re.exec(s))) {
    if (m[1]) out.push({ at: iso(+m[3], +m[2], +m[1], +m[4], +m[5]), i: m.index })
    else if (m[6]) out.push({ at: iso(yearFor(+m[7], ref), +m[7], +m[6], +m[8], +m[9]), i: m.index })
    else {
      const mon = MON[m[11].toUpperCase()]
      if (!mon) continue
      const y = m[12] ? (m[12].length === 2 ? 2000 + +m[12] : +m[12]) : yearFor(mon, ref)
      out.push({ at: iso(y, mon, +m[10], +m[13], +m[14]), i: m.index })
    }
  }
  return out.map((x) => x.at)
}

// BMCT prints a wrapped row as "KOTA NIPAH 179.7 10.70 03:00 400" + "S2074 RGS PIL 09-Nov YES":
// the time on one line and the day on the next
function splitDateTime(a, b, ref) {
  const t = String(a || '').match(/\b(\d{1,2}):(\d{2})\b/)
  const d = String(b || '').match(/\b(\d{1,2})-([A-Z]{3})\b(?!\s+\d{1,2}:)/i)
  if (!t || !d || !MON[d[2].toUpperCase()]) return null
  const mon = MON[d[2].toUpperCase()]
  return iso(yearFor(mon, ref), mon, +d[1], +t[1], +t[2])
}

// which part of a terminal report a heading starts
function sectionOf(line) {
  const s = String(line || '').toUpperCase()
  // (APMT heads its sailed table only with the column "Sailing Time")
  if (/SAILED|SAILING TIME/.test(s)) return 'sailed'
  if (/EXPECTED/.test(s)) return 'expected'
  if (/(ON|AT)\s+BERTH/.test(s)) return 'berthed'
  return null
}
const VIA = /\b[A-Z]{0,3}(S\d{4}[A-Z]?)\b/

// One ship in one terminal report. lines = the report's text lines (pdfToLines).
// → { status: 'expected' | 'berthed' | 'sailed', at, via, row } or null
export function findShipInReport(lines, name, ref = new Date()) {
  const key = shipKey(name)
  if (key.length < 3) return null
  let section = null
  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '')
    const head = sectionOf(line)
    if (head && !namedOn(line, key)) { section = head; continue }
    if (!section || !namedOn(line, key)) continue
    // the name may sit alone on its line with the row on the next (NSFT), or the row's date
    // may wrap onto the next line (APMT, BMCT)
    const next = String(lines[i + 1] || '')
    const nextIsRow = !sectionOf(next)
    let times = dateTimes(line, ref)
    if (!times.length && nextIsRow) {
      const split = splitDateTime(line, next, ref)
      times = split ? [split] : dateTimes(next, ref)
    }
    if (!times.length) continue
    const at = section === 'sailed' ? times.at(-1) : times[0]
    const via = (line.match(VIA) || (nextIsRow ? next.match(VIA) : null) || String(lines[i - 1] || '').match(VIA) || [])[1] || null
    return { status: section, at, via, row: line.replace(/\s+/g, ' ').trim().slice(0, 200) }
  }
  return null
}

// The page's table of ships at berth now: [{ terminal, berth, via, vessel, cargo, berthedAt, completionAt }]
// and the terminal PDFs: { NSICT: 'https://…/CT_BERTHING.pdf', … }
export function readBerthingPage(html) {
  const text = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
  const atBerth = []
  const reports = {}
  let terminal = null
  for (const tr of String(html || '').match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(text)
    if (!cells.length || /^terminal$/i.test(cells[0])) continue
    const link = (tr.match(/href="([^"]*berthing_report\/pdf\/[^"]+\.pdf)"/i) || [])[1]
    // a terminal's first row starts with its name; the next rows (rowspan) do not
    let c = cells
    if (link || (c.length >= 7 && !/^[A-Z]{1,4}-?\d/.test(c[0]))) { terminal = c[0].toUpperCase(); c = c.slice(1) }
    if (link && terminal) reports[terminal] = link.startsWith('http') ? link : `https://www.jnport.gov.in/${link.replace(/^\//, '')}`
    const [berth, via, vessel, cargo, berthed, completion] = c
    if (!vessel || !/^S\d{4}/i.test(via || '')) continue
    const dt = (s) => { const m = String(s || '').match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/); return m ? iso(+m[3], +m[2], +m[1], +m[4], +m[5]) : null }
    atBerth.push({ terminal, berth, via, vessel, cargo, berthedAt: dt(berthed), completionAt: dt(completion) })
  }
  return { atBerth, reports }
}

// The report date printed at the top of a terminal PDF ("DATE: 07/11/2026", "Date : 7-November-26",
// "07 NOV 2026", "Date 07-Nov-26"), as a Date, or null
export function reportDate(lines) {
  for (const l of (lines || []).slice(0, 12)) {
    const s = String(l || '')
    let m = s.match(/DATE\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i)
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
    m = s.match(/(\d{1,2})[-\s]([A-Z]{3})[A-Z]*[-\s](\d{2,4})\b/i)
    if (m && MON[m[2].toUpperCase()]) return new Date(Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], MON[m[2].toUpperCase()] - 1, +m[1]))
  }
  return null
}

// Where one ship stands across the day's reports: sailed beats berthed beats expected.
// pages = [{ terminal, lines }], atBerth = readBerthingPage(...).atBerth
// near: the ETA already known for the ship (tracking or the job), when there is one: a report
// date far from it is another call of a ship with that name, and is not taken.
// → { terminal, status, at, via, eta, berthedAt, sailedAt, row } or null
export function shipAtJnpa(name, pages, atBerth = [], now = new Date(), near = null) {
  const key = shipKey(name)
  if (key.length < 3) return null
  const rank = { expected: 1, berthed: 2, sailed: 3 }
  const nearMs = near ? new Date(near).getTime() : NaN
  const fits = (at) => isNaN(nearMs) || !at || (new Date(at).getTime() - nearMs > -12 * 864e5 && new Date(at).getTime() - nearMs < 20 * 864e5)
  let best = null
  for (const p of pages) {
    const hit = findShipInReport(p.lines, name, reportDate(p.lines) || now)
    if (hit && fits(hit.at) && (!best || rank[hit.status] > rank[best.status])) best = { terminal: p.terminal, ...hit }
  }
  // the page's own table is the surest word on a ship at berth now
  const here = atBerth.find((b) => shipKey(b.vessel) === key)
  if (here && (!best || best.status !== 'sailed')) best = { terminal: here.terminal, status: 'berthed', at: here.berthedAt, via: here.via || best?.via || null, row: `${here.terminal} ${here.berth}: ${here.vessel}, berthed ${here.berthedAt}` }
  if (!best) return null
  return {
    ...best,
    eta: best.status === 'expected' ? best.at : null,
    berthedAt: best.status === 'berthed' ? best.at : null,
    sailedAt: best.status === 'sailed' ? best.at : null,
  }
}

// ── For the screens and the bot ──
// The berthing row saved for a job (port-berthing function), when a report has listed its ship
export function berthingOf(job, data) {
  const b = data?.berthByJob?.[job?.id]
  return b && b.status && b.status !== 'not_listed' ? b : null
}
const TERMINAL_NAME = { NSFT: 'NSFT', NSICT: 'NSICT (DP World)', NSIGT: 'NSIGT (DP World)', APMT: 'APMT (GTI)', BMCT: 'BMCT (PSA)' }
export const terminalName = (t) => TERMINAL_NAME[t] || t || 'JNPA'
// "Sun 8 Nov, 3:00 am" in India time
export function istWhen(v) {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d)) return ''
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toLowerCase()
  return `${day.replace(',', '')}, ${time}`
}
// one line in plain words: "Berthed at BMCT (PSA) on Fri 6 Nov, 10:42 am"
export function berthingText(b) {
  if (!b) return null
  const at = terminalName(b.terminal)
  if (b.status === 'sailed') return `Sailed from ${at} on ${istWhen(b.sailed_at)} (unloading done)`
  if (b.status === 'berthed') return `Berthed at ${at} on ${istWhen(b.berthed_at)}`
  if (b.status === 'expected') return `Expected at ${at} on ${istWhen(b.eta)}`
  return null
}
