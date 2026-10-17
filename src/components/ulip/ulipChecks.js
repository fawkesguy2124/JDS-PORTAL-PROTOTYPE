// Where every ULIP check appears in the portal, with plain titles for staff.
// Job tabs show only what fits that job (import/export, sea/air, which port).
// Quick Lookup lists every approved check, grouped by what you have in hand.
import { ALL_APIS } from '../../../supabase/functions/ulip/apis/index.ts'
import { portSystem } from '../../utils/ports'

const isAir = (job) => job?.mode === 'Air'
const isExport = (job) => job?.job_type === 'export'
const isImport = (job) => !isExport(job)
const at = (system) => (job) => portSystem(job) === system

// Airport code used by the air cargo terminals (3 letters)
const airportCode = (job) => ({ INBOM4: 'BOM', INDEL4: 'DEL' }[job?.port_code] || '')
const portCodeOf = (job) => job?.port_code || ''

// ── Job tab: Customs & BE (import) ──────────────────────────────────────────
// The "Customs status" card (OOC + JNPT record) sits above these.
const CUSTOMS_GROUPS = [
  {
    title: 'More from Customs (ICEGATE)',
    checks: [
      {
        api: 'ICEGATE/02', title: 'Cargo details on the Bill of Entry',
        description: 'Containers, packages, weight and country of origin as Customs has them.',
        button: 'Check BE cargo', refs: { beNo: 'be_no', beDt: 'be_date' },
      },
      {
        api: 'ICEGATE/07', title: 'Import manifest (IGM) details', showIf: (job) => !isAir(job),
        description: 'Vessel, voyage, importer and containers on the IGM.',
        button: 'Check IGM', refs: { igmNo: 'igm_no', igmDt: 'igm_date' },
      },
      {
        api: 'ICEGATE/01', title: 'Ship arrival from the IGM', showIf: (job) => !isAir(job),
        description: 'Which ship, when it is expected and at which port, from the IGM number.',
        button: 'Check ship arrival', refs: { igmNo: 'igm_no', igmDt: 'igm_date' },
      },
    ],
  },
  {
    title: 'At the port',
    checks: [
      {
        api: 'MBPT/02', title: 'Cargo at Mumbai Port', showIf: at('MBPT'),
        description: 'Out of charge, delivery order and truck gate times at Mumbai Port.',
        button: 'Check Mumbai Port', refs: { igmNo: 'igm_no', igmDate: 'igm_date', itemNo: 'igm_item_no' },
        labels: { itemNo: 'IGM line (item) number' },
      },
      {
        api: 'IPORTMAN/02', title: 'Bill of Entry at the port', showIf: at('IPORTMAN'),
        description: 'Out of charge, delivery order and trucks at this port.',
        button: 'Check at port', refs: { beNo: 'be_no', beDate: 'be_date' },
        fixed: { portCode: portCodeOf }, fixedHint: 'Please set the job\'s Port in Job Details first.',
      },
    ],
  },
  {
    title: 'Port Community System (works for every port)',
    description: 'Use these if the port check above has no record yet.',
    checks: [
      { api: 'PCS/05', title: 'Out of charge (PCS)', button: 'Check OOC in PCS', refs: { boeNumber: 'be_no' } },
      { api: 'PCS/04', title: 'Bill of Entry details (PCS)', button: 'Check BE in PCS', refs: { boeNumber: 'be_no' } },
      { api: 'PCS/01', title: 'Containers on the IGM (PCS)', showIf: (job) => !isAir(job), button: 'Check IGM in PCS', refs: { igmNumber: 'igm_no' } },
    ],
  },
  {
    title: 'Client and goods',
    checks: [
      {
        api: 'DGFT/01', title: 'Is the client\'s IEC valid?',
        description: 'Checks the importer-exporter code with DGFT.',
        button: 'Check IEC', refs: { iecnumber: 'iec_no' },
      },
      {
        api: 'DGFT/02', title: 'Import policy for the HS code',
        description: 'Is the item free to import, or are there conditions?',
        button: 'Check policy', refs: { itchs: 'hs_code' }, labels: { itchs: 'HS code (8 digits)' },
      },
    ],
  },
]

// ── Job tab: Vessel (sea jobs) ──────────────────────────────────────────────
const VESSEL_GROUPS = [
  {
    title: 'Vessel arrival',
    description: 'Free days usually start from the vessel\'s arrival. You need the vessel call number (VCN) from the shipping line or port.',
    checks: [
      { api: 'JNPT/01', title: 'Vessel at JNPT', showIf: at('JNPT'), button: 'Check vessel', refs: { vcnNo: 'vcn_no' }, labels: { vcnNo: 'Vessel call number (VCN)' } },
      { api: 'MBPT/01', title: 'Vessel at Mumbai Port', showIf: at('MBPT'), button: 'Check vessel', refs: { vcnNo: 'vcn_no' }, labels: { vcnNo: 'Vessel call number (VCN)' } },
      {
        api: 'IPORTMAN/01', title: 'Vessel at the port', showIf: at('IPORTMAN'), button: 'Check vessel',
        refs: { vcnNo: 'vcn_no' }, labels: { vcnNo: 'Vessel call number (VCN)' },
        fixed: { portCode: portCodeOf }, fixedHint: 'Please set the job\'s Port in Job Details first.',
      },
      {
        api: 'ICEGATE/04', title: 'Shipping line and agent for this arrival (rotation)',
        description: 'Needs the vessel code and IMO number. These are filled in after "Ship arrival from the IGM" on the Customs tab.',
        button: 'Check rotation',
        refs: { siteId: 'port_code', imoCode: 'imo_code', vesselCode: 'vessel_code', arrivalDate: 'eta' },
        labels: { siteId: 'Port code' },
      },
    ],
  },
]

// ── Job tab: Export (sea export jobs) ───────────────────────────────────────
const EXPORT_GROUPS = [
  {
    title: 'Shipping bill and LEO (Customs)',
    checks: [
      { api: 'ICEGATE/06', title: 'Has LEO been given?', button: 'Check LEO', refs: { sbNo: 'sb_no', sbDt: 'sb_date' } },
      { api: 'ICEGATE/05', title: 'Shipping bill details', button: 'Check shipping bill', refs: { sbNo: 'sb_no', sbDt: 'sb_date' } },
    ],
  },
  {
    title: 'At the port',
    checks: [
      { api: 'JNPT/03', title: 'Shipping bill at JNPT', showIf: at('JNPT'), button: 'Check at JNPT', refs: { sbillNo: 'sb_no' } },
      { api: 'MBPT/03', title: 'Shipping bill at Mumbai Port', showIf: at('MBPT'), button: 'Check at Mumbai Port', refs: { shippingBillNo: 'sb_no', shippingBillDate: 'sb_date' } },
      {
        api: 'IPORTMAN/03', title: 'Shipping bill at the port', showIf: at('IPORTMAN'), button: 'Check at port',
        refs: { shippingBillNo: 'sb_no', shippingBillDate: 'sb_date' },
        fixed: { portCode: portCodeOf }, fixedHint: 'Please set the job\'s Port in Job Details first.',
      },
      { api: 'PCS/03', title: 'LEO and rotation (PCS, any port)', button: 'Check in PCS', refs: { sbNumber: 'sb_no' } },
      { api: 'PCS/02', title: 'Shipping bill details (PCS, any port)', button: 'Check in PCS', refs: { sbNumber: 'sb_no' } },
    ],
  },
  {
    title: 'After the vessel sails',
    checks: [
      { api: 'ICEGATE/08', title: 'Export manifest (EGM)', button: 'Check EGM', refs: { egmNo: 'egm_no', egmDt: 'egm_date' } },
      { api: 'ICEGATE/13', title: 'E-seal on the container', button: 'Check e-seal', refs: { esealNumber: 'eseal_no', containerNumber: 'container_no' } },
    ],
  },
]

// ── Job tab: Air (air jobs) ─────────────────────────────────────────────────
const AIR_GROUPS = [
  {
    title: 'Air cargo with Customs (ICEGATE)',
    checks: [
      { api: 'ICEGATE/09', title: 'Air import manifest (IGM)', showIf: isImport, button: 'Check air IGM', refs: { mawbNumber: 'mawb_no', custSite: 'port_code' }, labels: { custSite: 'Airport code (INBOM4 for Mumbai)' } },
      { api: 'ICEGATE/10', title: 'House airway bill (HAWB)', showIf: isImport, button: 'Check HAWB', refs: { mawbNumber: 'mawb_no', hawbNumber: 'hawb_no' } },
      {
        api: 'ICEGATE/11', title: 'Flight manifest filing status', button: 'Check flight',
        refs: { location: 'port_code', flightDt: 'flight_date', flightNo: 'flight_no' },
        fixed: { flag: (job) => (isExport(job) ? 'EGM' : 'IGM') },
        labels: { location: 'Airport code' },
      },
    ],
  },
  {
    title: 'Cargo at the airport terminal',
    description: 'Two terminal systems are connected. If one has no record, try the other.',
    checks: [
      { api: 'ACMES/02', title: 'Import cargo at terminal (ACMES)', showIf: isImport, button: 'Check terminal', refs: { awbnumber: 'mawb_no', hawb: 'hawb_no' } },
      { api: 'AAICLAS/02', title: 'Import cargo at terminal (AAICLAS)', showIf: isImport, button: 'Check terminal', refs: { awbNumber: 'mawb_no', hawb: 'hawb_no' }, defaults: { location: airportCode }, labels: { location: 'Airport (3 letters, e.g. BOM)' } },
      { api: 'ACMES/01', title: 'Export cargo at terminal (ACMES)', showIf: isExport, button: 'Check terminal', refs: { awbnumber: 'mawb_no' } },
      { api: 'AAICLAS/01', title: 'Export cargo at terminal (AAICLAS)', showIf: isExport, button: 'Check terminal', refs: { awbNumber: 'mawb_no' }, defaults: { location: airportCode }, labels: { location: 'Airport (3 letters, e.g. BOM)' } },
    ],
  },
]

// ── Job tab: Truck (all jobs) ───────────────────────────────────────────────
// Input keys follow supabase/functions/ulip/apis/road.ts
const TRUCK_GROUPS = [
  {
    title: 'Where is the truck?',
    checks: [
      { api: 'FASTAG/01', title: 'Truck location from FASTag toll crossings', button: 'Find truck', refs: { vehiclenumber: 'vehicle_no' }, labels: { vehiclenumber: 'Truck number' } },
      { api: 'FASTAG/02', title: 'FASTag status of the truck', button: 'Check FASTag', refs: { vehiclenumber: 'vehicle_no' }, labels: { vehiclenumber: 'Truck number' } },
    ],
  },
  {
    title: 'Truck and driver papers',
    checks: [
      { api: 'VAHAN/04', title: 'Truck registration, fitness and insurance', button: 'Check truck papers', refs: { vehiclenumber: 'vehicle_no' }, labels: { vehiclenumber: 'Truck number' } },
      { api: 'SARATHI/02', title: 'Driver\'s licence', button: 'Check licence', refs: { dlnumber: 'dl_no' } },
      { api: 'ECHALLAN/01', title: 'Pending traffic fines on the truck', button: 'Check fines', refs: { vehicleNumber: 'vehicle_no' }, labels: { vehicleNumber: 'Truck number' } },
      { api: 'EWAYBILL/01', title: 'E-way bill validity', button: 'Check e-way bill', refs: { ewbNo: 'ewb_no' } },
    ],
  },
]

export const JOB_TABS = [
  { id: 'vessel', label: 'Vessel', showIf: (job) => !isAir(job), groups: VESSEL_GROUPS },
  { id: 'export', label: 'Export', showIf: (job) => isExport(job) && !isAir(job), groups: EXPORT_GROUPS },
  { id: 'air', label: 'Air', showIf: isAir, groups: AIR_GROUPS },
  { id: 'truck', label: 'Truck', showIf: () => true, groups: TRUCK_GROUPS },
]

export const CUSTOMS_TAB_GROUPS = CUSTOMS_GROUPS

// ── Quick Lookup ────────────────────────────────────────────────────────────
const CATEGORY_APIS = [
  { id: 'import', icon: '🧾', label: 'Import (BE / IGM)', apis: ['ICEGATE/03', 'ICEGATE/02', 'ICEGATE/07', 'ICEGATE/01', 'JNPT/02', 'MBPT/02', 'IPORTMAN/02', 'PCS/05', 'PCS/04', 'PCS/01'] },
  { id: 'export', icon: '📦', label: 'Export (shipping bill)', apis: ['ICEGATE/06', 'ICEGATE/05', 'ICEGATE/12', 'ICEGATE/08', 'ICEGATE/13', 'JNPT/03', 'MBPT/03', 'IPORTMAN/03', 'PCS/03', 'PCS/02'] },
  { id: 'vessel', icon: '🚢', label: 'Vessel', apis: ['JNPT/01', 'MBPT/01', 'IPORTMAN/01', 'ICEGATE/04'] },
  { id: 'container', icon: '⊟', label: 'Container', apis: ['LDB/01'] },
  { id: 'truck', icon: '🚚', label: 'Truck & driver', apis: ['FASTAG/01', 'FASTAG/02', 'VAHAN/04', 'VAHAN/05', 'VAHAN/06', 'VAHAN/01', 'VAHAN/02', 'VAHAN/03', 'SARATHI/02', 'SARATHI/01', 'ECHALLAN/01', 'EWAYBILL/01', 'TOLL/01'] },
  { id: 'air', icon: '✈', label: 'Air cargo', apis: ['ICEGATE/09', 'ICEGATE/10', 'ICEGATE/11', 'ACMES/02', 'AAICLAS/02', 'ACMES/01', 'AAICLAS/01'] },
  { id: 'client', icon: '🏢', label: 'Client & goods', apis: ['DGFT/01', 'DGFT/02'] },
  { id: 'rail', icon: '🚆', label: 'Rail', apis: ['FOIS/01', 'FOIS/04', 'FOIS/02'] },
]

export const LOOKUP_CATEGORIES = CATEGORY_APIS.map((c) => ({
  ...c,
  checks: c.apis
    .map((id) => ALL_APIS.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => ({ api: a.id, title: a.name, button: 'Check' })),
}))
