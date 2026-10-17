// The registry of approved ULIP APIs. Only APIs listed here can be called.
// JDS is approved for exactly these 50 (see APPROVED below).
import type { ApiDef } from './types.ts'
import { ICEGATE_APIS } from './icegate.ts'
import { ICEGATE_SEA_APIS } from './icegate_sea.ts'
import { ICEGATE_AIR_APIS } from './icegate_air.ts'
import { PORT_APIS } from './ports.ts'
import { PCS_APIS } from './pcs.ts'
import { ROAD_APIS } from './road.ts'
import { TRADE_AIR_RAIL_APIS } from './trade_air_rail.ts'

export const APPROVED = [
  'AAICLAS/01', 'AAICLAS/02', 'ACMES/01', 'ACMES/02',
  'DGFT/01', 'DGFT/02', 'ECHALLAN/01', 'EWAYBILL/01',
  'FASTAG/01', 'FASTAG/02', 'FOIS/01', 'FOIS/02', 'FOIS/04',
  'ICEGATE/01', 'ICEGATE/02', 'ICEGATE/03', 'ICEGATE/04', 'ICEGATE/05', 'ICEGATE/06', 'ICEGATE/07',
  'ICEGATE/08', 'ICEGATE/09', 'ICEGATE/10', 'ICEGATE/11', 'ICEGATE/12', 'ICEGATE/13',
  'IPORTMAN/01', 'IPORTMAN/02', 'IPORTMAN/03', 'JNPT/01', 'JNPT/02', 'JNPT/03', 'LDB/01',
  'MBPT/01', 'MBPT/02', 'MBPT/03', 'PCS/01', 'PCS/02', 'PCS/03', 'PCS/04', 'PCS/05',
  'SARATHI/01', 'SARATHI/02', 'TOLL/01',
  'VAHAN/01', 'VAHAN/02', 'VAHAN/03', 'VAHAN/04', 'VAHAN/05', 'VAHAN/06',
] as const

export const ALL_APIS: ApiDef[] = [
  ...ICEGATE_APIS,
  ...ICEGATE_SEA_APIS,
  ...ICEGATE_AIR_APIS,
  ...PORT_APIS,
  ...PCS_APIS,
  ...ROAD_APIS,
  ...TRADE_AIR_RAIL_APIS,
].filter((a) => (APPROVED as readonly string[]).includes(a.id))

export function findApi(id: string): ApiDef | undefined {
  return ALL_APIS.find((a) => a.id === id)
}

// Checks and cleans the values staff typed. Returns the clean values or an error.
export function cleanParams(api: ApiDef, params: Record<string, unknown>):
  { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  const values: Record<string, string> = {}
  for (const input of api.inputs) {
    let v = String(params?.[input.key] ?? '').trim()
    if (input.upper) v = v.toUpperCase().replace(/\s+/g, '')
    if (!v) {
      if (input.optional) continue
      return { ok: false, error: `Please enter the ${input.label}.` }
    }
    if (!input.pattern.test(v)) return { ok: false, error: `${input.label} looks wrong: ${input.hint}.` }
    values[input.key] = v
  }
  // Checks where every box is optional (e.g. truck number OR FASTag ID) need at least one
  if (api.inputs.length > 0 && api.inputs.every((i) => i.optional) && Object.keys(values).length === 0) {
    return { ok: false, error: `Please fill in one of: ${api.inputs.map((i) => i.label).join(', ')}.` }
  }
  if (api.oneOf && Object.keys(values).length > 1) {
    return { ok: false, error: `Please fill in only one of: ${api.inputs.map((i) => i.label).join(', ')}.` }
  }
  return { ok: true, values }
}
