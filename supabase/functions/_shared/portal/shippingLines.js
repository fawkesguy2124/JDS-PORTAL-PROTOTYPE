// Shipping line names, shared by the portal and the server.
//
// Where a job's shipping line comes from, most reliable first:
//   1. What LDB reports as the line carrying the box (agency names like
//      "MSC AGENCY(INDIA)PVT.LTD" are turned into "MSC" here). On JDS's jobs this
//      matched the saved line 36 times out of 37.
//   2. The first 4 letters of a carrier BL (MEDU → MSC). Most JDS BLs are house
//      BLs from forwarders, so this rarely applies, but it is right when it does.
//   The first 4 letters of a CONTAINER only say who OWNS the box (COSCO boxes often
//   sail on OOCL BLs; leasing boxes on any line), so they are shown as a hint only.

const LINES = [
  [/^(MSC|MEDITERRANEAN)/, 'MSC'], [/MAERSK|SEALAND/, 'Maersk'], [/OCEAN NETWORK|OCIAN NEXWORK|^ONE\b/, 'ONE'],
  [/HAPAG/, 'Hapag-Lloyd'], [/^CMA|CMA CGM/, 'CMA CGM'], [/COSCO/, 'COSCO'], [/EVERGREEN/, 'Evergreen'],
  [/ORIENT OVERSEAS|^OOCL/, 'OOCL'], [/HYUNDAI|^HMM/, 'HMM'], [/YANG ?MING|^YML/, 'Yang Ming'], [/WAN ?HAI/, 'Wan Hai'],
  [/^ZIM/, 'ZIM'], [/^RCL|REGIONAL CONTAINER/, 'RCL'], [/INTERASIA/, 'Interasia'], [/EMIRATES/, 'Emirates'],
  [/^TS LINE|^T\.?S\.? LINES?/, 'TS Line'], [/UNIFEEDER/, 'Unifeeder'], [/^PIL|PACIFIC INTERNATIONAL/, 'PIL'],
  [/KMTC|KOREA MARINE/, 'KMTC'], [/^SITC/, 'SITC'], [/GOLD ?STAR/, 'Gold Star'], [/SHREYAS|^SNL\b/, 'SNL'],
]

// "MSC AGENCY(INDIA)PVT.LTD" → "MSC"; unknown names are tidied, not guessed
export function lineName(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, ' ').trim()
  if (!s) return null
  const hit = LINES.find(([re]) => re.test(s))
  if (hit) return hit[1]
  return String(raw).replace(/\s*[-–(].*$/, '').replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|P L|AGENC(Y|IES)|INDIA|SHIPPING AGENCY)\b\.?/gi, '').replace(/\s+/g, ' ').trim() || null
}

const BL_PREFIX = { MEDU: 'MSC', MSCU: 'MSC', MAEU: 'Maersk', ONEY: 'ONE', HLCU: 'Hapag-Lloyd', CMDU: 'CMA CGM', COSU: 'COSCO', EGLV: 'Evergreen', OOLU: 'OOCL', HDMU: 'HMM', ZIMU: 'ZIM', YMLU: 'Yang Ming', WHLC: 'Wan Hai' }

// The line from a carrier BL number, or null (house BLs give nothing)
export const lineFromBl = (bl) => BL_PREFIX[String(bl || '').toUpperCase().replace(/\s+/g, '').slice(0, 4)] || null

const BOX_OWNER = {
  MSCU: 'MSC', MSDU: 'MSC', MSMU: 'MSC', MSNU: 'MSC', MEDU: 'MSC', MSKU: 'Maersk', MRKU: 'Maersk', MAEU: 'Maersk', MRSU: 'Maersk',
  ONEU: 'ONE', HLXU: 'Hapag-Lloyd', HLBU: 'Hapag-Lloyd', HAMU: 'Hapag-Lloyd', CMAU: 'CMA CGM', EGSU: 'Evergreen', EGHU: 'Evergreen',
  EMCU: 'Evergreen', EISU: 'Evergreen', OOLU: 'OOCL', OOCU: 'OOCL', CSNU: 'COSCO', CBHU: 'COSCO', CCLU: 'COSCO', HDMU: 'HMM',
  ZIMU: 'ZIM', ZCSU: 'ZIM', YMLU: 'Yang Ming', YMMU: 'Yang Ming', WHLU: 'Wan Hai', WHSU: 'Wan Hai',
}
const GROUP = { COSCO: 'COSCO / OOCL group', OOCL: 'COSCO / OOCL group' }

// A hint only: who owns most of the boxes, e.g. "COSCO / OOCL group"; null for leased boxes
export function boxOwnerHint(containers = []) {
  const votes = {}
  for (const c of containers || []) { const o = BOX_OWNER[String(c?.no || c).toUpperCase().slice(0, 4)]; if (o) votes[o] = (votes[o] || 0) + 1 }
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0]
  return top ? GROUP[top] || top : null
}

// A shipping line's name typed where a SHIP's name belongs ("EVERGREEN",
// "MSC LINE", or the job's own line): not a ship (Jose, 23 Oct 2026). Ship names
// that start with a line's name ("MSC SILVANA VIII", "EVER LENIENT") pass.
const tidy = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const TAIL = /\s+(LINES?|SHIPPING|CONTAINERS?|MARINE|CO|CORP|CORPORATION|LTD|LIMITED|AGENCY|AGENCIES|INDIA|PVT)$/
const LINE_NAMES = new Set([
  ...LINES.map(([, n]) => tidy(n)),
  'MEDITERRANEAN SHIPPING COMPANY', 'OCEAN NETWORK EXPRESS', 'ORIENT OVERSEAS', 'HAPAG LLOYD', 'HYUNDAI MERCHANT', 'EVERGREEN MARINE',
  'COSCO SHIPPING', 'EMIRATES SHIPPING', 'PACIFIC INTERNATIONAL', 'REGIONAL CONTAINER', 'KOREA MARINE TRANSPORT', 'HEUNG A', 'HUNGA A', 'SINOKOR', 'TS', // (HUNGA A: as typed on J-689)
].map(tidy))
export function isLineNotShip(raw, jobLine) {
  const s = tidy(raw)
  if (!s) return false
  if (jobLine && tidy(jobLine) === s) return true
  let core = s
  for (let i = 0; i < 4; i++) core = core.replace(TAIL, '')
  return LINE_NAMES.has(s) || LINE_NAMES.has(core)
}

// Text that is clearly not a ship's name: an address, PIN code or company line the
// BL reader picked up (Jose, 25 Oct 2026: J-644 got "ANDHERI EAST.MUMBAI. PINCODE /
// 400099" as its ship). Real ship names never carry these.
const ADDRESS = /\bPIN\s?CODE\b|\bPIN\b|\b\d{6}\b|\b(ROAD|RD|STREET|ST|LANE|MARG|NAGAR|COLONY|FLOOR|BLDG|BUILDING|PLOT|SECTOR|PHASE|ESTATE|MIDC|TALUKA|DIST|DISTRICT|STATE|MAHARASHTRA|GUJARAT|ANDHERI|BHIWANDI|THANE|NAVI)\b|\b(PVT|LTD|LIMITED|LLP|COMPANY|CO\.)\b|\b(EAST|WEST)\s*[.,]\s*MUMBAI\b|@|\bTEL\b|\bPHONE\b|\bGSTIN?\b|\bEMAIL\b/
export function isNotShipName(raw) {
  const s = String(raw || '').toUpperCase()
  return !!s.trim() && ADDRESS.test(s)
}
