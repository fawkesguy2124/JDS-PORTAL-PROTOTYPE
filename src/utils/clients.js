// JDS clients. `name` is what the portal shows and saves on jobs; `legal` and
// `iec` come from the clients' Bills of Entry so an uploaded BE can be matched
// to the right client automatically (IEC first, then name).
// Built from 29 ICEGATE BE / OOC copies (Jun–Oct 2026) plus the earlier list.
export const CLIENTS = [
  { name: 'PCM', legal: 'PUTZMEISTER CONCRETE MACHINES PRIVATE LIMITED', iec: '1705001432' },
  { name: 'Adorn (ALS Series)' },
  { name: 'Deepa Traders', legal: 'DEEPA TRADERS', iec: '3115901062' },
  { name: 'Denso Thermal Systems', legal: 'DENSO THERMAL SYSTEMS PUNE PRIVATE LIMITED', iec: '0598044876' },
  { name: 'Divine / NNC', legal: 'NNC ELECTRIC INDIA PRIVATE LIMITED', iec: 'AAICN3412C' },
  { name: 'Eboney' },
  { name: 'Electrica', legal: 'ELECTRICA ENGINEERS (INDIA) PRIVATE LIMITED', iec: '0304012840' },
  { name: 'Enkay Machinery', legal: 'ENKAY MACHINERY', iec: 'AALFE3972G' },
  { name: 'Finearc', legal: 'FINEARC SYSTEMS PVT LTD', iec: '3192005840' },
  { name: 'Gefit', legal: 'GEFIT INDIA TECHNOLOGIES PRIVATE LIMITED', iec: 'AAHCG7531L' },
  { name: 'GIVI India', legal: 'GIVI INDIA PRIVATE LIMITED', iec: 'AALCG5303Q' },
  { name: 'GM Enterprises', legal: 'GM ENTERPRISES', iec: '0312007663' },
  { name: 'Green Soul', legal: 'GREEN SOUL ERGONOMICS PRIVATE LIMITED', iec: 'AAGCT6313C' },
  { name: 'Grupo', legal: 'GRUPO ANTOLIN INDIA PRIVATE LIMITED', iec: '3101001072' },
  { name: 'IAC International Automotive', legal: 'IAC INTERNATIONAL AUTOMOTIVE INDIA PRIVATE LIMITED', iec: 'AAACD4489M' },
  { name: 'IndoDTM Automation', legal: 'INDODTM AUTOMATION PRIVATE LIMITED', iec: 'AADCI8841H' },
  { name: 'Infinite EXIM', legal: 'INFINITE', iec: '0312063601' },
  { name: 'Innovative Automation', legal: 'INNOVATIVE AUTOMATION PRODUCTS', iec: '3100003071' },
  { name: 'Integral' },
  { name: 'INTO', legal: 'INTO WELLNESS PRIVATE LIMITED', iec: '3116915792' },
  { name: 'Ishita' },
  { name: 'Jiger Plast', legal: 'JIGER PLAST INDIA', iec: '0397056478' },
  { name: 'Leon International' },
  { name: 'Limitless Components EXIM', legal: 'LIMITLESS COMPONENTS', iec: 'BMSPM3559F' },
  { name: 'Macksmatec' },
  { name: 'Mahalaxmi', legal: 'MAHALAXMI LIGHTING CO', iec: '0315017040' },
  { name: 'Maxlord' },
  { name: 'Mogora Cosmic', legal: 'MOGORA COSMIC PRIVATE LIMITED', iec: '0788004620' },
  { name: 'Mylab Discovery', legal: 'MYLAB DISCOVERY SOLUTIONS PRIVATE LIMITED', iec: '3116918121' },
  { name: 'Neosym Industry', legal: 'NEOSYM INDUSTRY LIMITED', iec: '0388135085' },
  { name: 'Nikam' },
  { name: 'REAL' },
  { name: 'Rivaan' },
  { name: 'Studio Velocity', legal: 'STUDIO VELOCITY', iec: 'AJBPG5478Q' },
  { name: 'TRW', legal: 'TRW SUN STEERING WHEELS PRIVATE LIMITED', iec: '0594048630' },
  { name: 'Cotswold' },
  { name: 'Uddaybharat Techno Pvt. Ltd.' },
  { name: 'Varun Udyog', legal: 'VARUN UDYOG TOOLS AND DIES PRIVATE LIMITED', iec: 'AAKCV7063R' },
  { name: 'Vendekin Technologies', legal: 'VENDEKIN TECHNOLOGIES PRIVATE LIMITED', iec: 'AAGCC6598N' },
].sort((a, b) => a.name.localeCompare(b.name))

export const CLIENT_NAMES = CLIENTS.map((c) => c.name)

const norm = (s) => String(s || '').toUpperCase().replace(/&AMP;/g, '&')
  .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INDIA|CO|THE)\b/g, '').replace(/[^A-Z0-9]/g, '')

// Match a BE importer (IEC + name) to a client. Returns the client or null.
export function matchClient({ iec, name } = {}) {
  if (iec) {
    const byIec = CLIENTS.find((c) => c.iec && c.iec === String(iec).trim().toUpperCase())
    if (byIec) return byIec
  }
  const n = norm(name)
  if (!n) return null
  return CLIENTS.find((c) => c.legal && norm(c.legal) === n)
    || CLIENTS.find((c) => { const k = norm(c.legal || c.name); return k.length >= 4 && (n.includes(k) || k.includes(n)) })
    || null
}
