// Prefix-to-carrier display mapping (for reference/info only — NOT used for routing)
// Carrier routing is driven entirely by the Shipping Line selected during job creation.
const PREFIX_MAP: Record<string, string> = {
  MAEU: 'Maersk', MRKU: 'Maersk', MSKU: 'Maersk', MAKU: 'Maersk', MAOU: 'Maersk',
  MATU: 'Maersk', MMCU: 'Maersk', MTTU: 'Maersk', SEKU: 'Maersk', PONU: 'Maersk',
  MSCU: 'MSC',
  HLCU: 'Hapag-Lloyd', HLXU: 'Hapag-Lloyd', HLBU: 'Hapag-Lloyd', HLDU: 'Hapag-Lloyd',
  CMNU: 'CMA-CGM', CMAU: 'CMA-CGM', CGMU: 'CMA-CGM', ANLU: 'CMA-CGM', CNCU: 'CMA-CGM',
  EISU: 'Evergreen', EMCU: 'Evergreen', EVGU: 'Evergreen', EGHU: 'Evergreen', EGCU: 'Evergreen',
  OOLU: 'OOCL', OOCU: 'OOCL',
  YMLU: 'Yang Ming', WHLU: 'Yang Ming',
  COSU: 'COSCO', CBHU: 'COSCO',
  ZIMU: 'ZIM', ONEU: 'ONE',
  HMMU: 'HMM', HYUD: 'HMM',
}

export function detectCarrier(containerNo: string): string {
  const cleaned = containerNo.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const prefix = cleaned.slice(0, 4)
  return PREFIX_MAP[prefix] || 'Unknown'
}
