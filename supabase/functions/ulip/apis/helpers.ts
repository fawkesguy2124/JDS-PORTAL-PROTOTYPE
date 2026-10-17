// Small helpers shared by registry parsers. Plain TypeScript only.
import type { Field } from './types.ts'

// Most ULIP answers look like { response: [ { response: <payload>, responseStatus } ] }
export function payloadOf(body: any): any {
  const outer = body?.response
  if (Array.isArray(outer)) return outer[0]?.response ?? null
  return outer ?? null
}

// payload as a list of records (accepts a single object too)
export function recordsOf(body: any): any[] {
  const p = payloadOf(body)
  if (Array.isArray(p)) return p.filter((r) => r && typeof r === 'object')
  if (p && typeof p === 'object') return [p]
  return []
}

export function text(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(', ') : null
  const s = String(v).trim()
  return s === '' || s.toLowerCase() === 'null' ? null : s
}

// True when every given value is empty, i.e. ULIP had no record
export function allEmpty(values: unknown[]): boolean {
  return values.every((v) => text(v) === null)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Turns ULIP's many date styles into "26 Mar 2012" (keeps time if present).
// Handles: DDMMYYYY, DD/MM/YYYY[ HH:MM], DD-MM-YYYY, YYYY-MM-DD[THH:MM], DD-MMM-YYYY.
export function prettyDate(v: unknown): string | null {
  const s = text(v)
  if (!s) return null
  let d: string | undefined, m: number | undefined, y: string | undefined, time = ''
  let r = s.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (r) { d = r[1]; m = +r[2]; y = r[3] }
  if (!r) {
    r = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}:\d{2}))?/)
    if (r) { d = r[1]; m = +r[2]; y = r[3]; time = r[4] || '' }
  }
  if (!r) {
    r = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/)
    if (r) { y = r[1]; m = +r[2]; d = r[3]; time = r[4] || '' }
  }
  if (!r) {
    r = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})(?:[ T](\d{1,2}:\d{2}))?/)
    if (r) {
      const idx = MONTHS.findIndex((x) => x.toLowerCase() === r![2].toLowerCase())
      if (idx >= 0) { d = r[1]; m = idx + 1; y = r[3]; time = r[4] || '' }
    }
  }
  if (!d || !m || !y || m < 1 || m > 12) return s
  if (time === '00:00') time = ''
  return `${Number(d)} ${MONTHS[m - 1]} ${y}${time ? `, ${time}` : ''}`
}

export function field(label: string, value: unknown, kind: 'text' | 'date' = 'text'): Field {
  return { label, value: kind === 'date' ? prettyDate(value) : text(value) }
}

// Drops fields with no value, so staff only see what ULIP actually returned
export function filled(fields: Field[]): Field[] {
  return fields.filter((f) => f.value !== null)
}
