// ICEGATE (Customs) APIs. Spec: docs/ulip-specs/ICEGATE.md
import type { ApiDef } from './types.ts'
import { allEmpty, field, filled, payloadOf, prettyDate } from './helpers.ts'

const BE_NO = { key: 'beNo', label: 'BE number', pattern: /^\d{7}$/, hint: '7 digits, like 2237841' }
const BE_DT = { key: 'beDt', label: 'BE date', pattern: /^\d{8}$/, hint: 'BE date', kind: 'date8' as const }

export const ICEGATE_APIS: ApiDef[] = [
  {
    id: 'ICEGATE/03',
    name: 'OOC from Customs',
    inputs: [BE_NO, BE_DT],
    parse(body) {
      const p = payloadOf(body) || {}
      if (allEmpty([p.oocNo, p.oocDt])) {
        return { found: false, tone: 'warn', summary: 'OOC not granted yet (or BE not found in ICEGATE).', fields: [] }
      }
      return {
        found: true,
        tone: 'good',
        summary: `OOC granted on ${prettyDate(p.oocDt) ?? 'unknown date'}.`,
        fields: filled([field('OOC number', p.oocNo), field('OOC date', p.oocDt, 'date')]),
      }
    },
  },
]
