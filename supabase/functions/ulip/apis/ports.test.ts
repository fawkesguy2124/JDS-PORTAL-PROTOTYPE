// Run: node --experimental-strip-types --test supabase/functions/ulip/apis/
// Samples are copied from the official ULIP JNPT / MBPT / IPORTMAN documents (docs/ulip-specs/PORTS.md).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PORT_APIS } from './ports.ts'

const api = (id: string) => PORT_APIS.find((a) => a.id === id)!
const wrap = (response: unknown) => ({
  response: [{ response, responseStatus: 'SUCCESS' }],
  error: 'false', code: '200', message: 'Success',
})
const val = (r: { fields: { label: string; value: string | null }[] }, label: string) =>
  r.fields.find((f) => f.label === label)?.value

test('registry has the nine port APIs', () => {
  assert.deepEqual(PORT_APIS.map((a) => a.id), [
    'JNPT/01', 'JNPT/02', 'JNPT/03', 'MBPT/01', 'MBPT/02', 'MBPT/03', 'IPORTMAN/01', 'IPORTMAN/02', 'IPORTMAN/03',
  ])
})

// ---------- JNPT/01 ----------
test('JNPT/01 found (only expected, not arrived)', () => {
  const r = api('JNPT/01').parse(wrap([{
    'Application Type': 'I', 'IMO Numner': '9804928', 'Shipping Line Code': '', ShippingAgentCode: 'GAC02',
    'Vessel Name': 'MT FURANO GALAXY', ATA: null, ATD: null, ETA: '20/07/2021 20:20', 'VCN No': 'M7264',
    ETD: '21/07/2021 16:17', 'Port Of Arrival Name': 'HaziraPort/Surat', 'Vessel Type': 'F',
  }]))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'info')
  assert.equal(r.summary, 'Vessel MT FURANO GALAXY is expected at HaziraPort/Surat on 20 Jul 2021, 20:20.')
  assert.equal(val(r, 'IMO number'), '9804928')
  assert.equal(r.extra?.vcnNo, 'M7264')
  assert.equal(r.extra?.eta, '2021-07-20T20:20')
  assert.equal(r.extra?.ata, null)
})

test('JNPT/01 arrived', () => {
  const r = api('JNPT/01').parse(wrap([{ 'Vessel Name': 'MSC ANNA', ATA: '12/10/2026 14:30', 'VCN No': 'M1234' }]))
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'Vessel MSC ANNA arrived at JNPT on 12 Oct 2026, 14:30.')
  assert.equal(r.extra?.ata, '2026-10-12T14:30')
})

test('JNPT/01 not found', () => {
  const r = api('JNPT/01').parse(wrap([]))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
})

test('JNPT/01 inputs match the document format', () => {
  const [vcn] = api('JNPT/01').inputs
  assert.ok(vcn.pattern.test('M7264'))
  assert.ok(!vcn.pattern.test('M'))
  assert.ok(!vcn.pattern.test('M 7264'))
})

// ---------- JNPT/02 ----------
const jnptBe = {
  'Marks No': null, 'IGM Date': '26/07/2021 00:00', 'Out of Charge Date': null, 'Mode of Transport': 'R', 'CHA Code': 'AAK02',
  'IGM NO': 312, 'Out of Charge No': null, 'Survey Date': null, 'DO Date': null, 'Goods Description': null,
  'Importer Address': null, 'Nature of Cargo': 'C', 'Type of Packages': 'PROJECT COACHES',
  'Vehicle Info': [{ 'Vehicle Number': 'TRK145570', 'Truck Entry Permit No': null, 'Truck Entry Time': null, 'Truck Exit Time': null, vehicleNum: 'TRK145570' }],
  'Unit of Measurement': null, 'Be No': 'BE5787', 'Line No': null, 'Delivery Oder No': 109, 'BL No': null,
  'Be Date': '26/07/2021 00:00', 'Importer Name': null, 'Surveyor Code': '', 'No of Packages Qty': null, 'Sub Line No': null,
  'Cargo Type': 'PROJECT', 'Country of Origin': null,
}

test('JNPT/02 found (no OOC yet, one truck)', () => {
  const r = api('JNPT/02').parse(wrap([jnptBe]))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'warn')
  assert.equal(r.summary, 'BE BE5787 found at JNPT, but Out of Charge is not given yet.')
  assert.equal(val(r, 'Delivery order number'), '109')
  assert.equal(val(r, 'IGM number'), '312')
  assert.equal(val(r, 'IGM date'), '26 Jul 2021')
  assert.deepEqual(r.extra?.truckNumbers, ['TRK145570'])
  assert.equal(r.extra?.igmNo, '312')
  assert.equal(r.extra?.igmDate, '2021-07-26')
  assert.equal(r.extra?.oocDate, null)
  assert.equal(r.tables?.[0].rows[0][0], 'TRK145570')
})

test('JNPT/02 with OOC given puts OOC date first', () => {
  const r = api('JNPT/02').parse(wrap([{ ...jnptBe, 'Out of Charge Date': '29/07/2021 10:15', 'Out of Charge No': 555 }]))
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'BE BE5787: Out of Charge given on 29 Jul 2021, 10:15 at JNPT.')
  assert.equal(r.fields[0].label, 'Out of Charge date')
  assert.equal(r.extra?.oocDate, '2021-07-29T10:15')
})

test('JNPT/02 not found', () => {
  const r = api('JNPT/02').parse(wrap([]))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
})

test('JNPT/02 inputs match the document format', () => {
  const [beNo] = api('JNPT/02').inputs
  assert.ok(beNo.pattern.test('BEK7262'))
  assert.ok(beNo.pattern.test('4756840'))
  assert.ok(!beNo.pattern.test('BEK726'))
})

// ---------- JNPT/03 ----------
test('JNPT/03 found (no LEO, no trucks)', () => {
  const r = api('JNPT/03').parse(wrap([{
    'Leo Date': null, 'Nature of Cargo': null, 'Vehicle Info': null, 'Vcn No': 'KJ8777', 'Port of Loading': 'SAIM PORT',
    'Exporter Name': 'ACT INFRAPORT LTD.,', 'Port of Destination Code': null, 'Port of Origin': null, 'Rotation Date': null,
    'Shipping Bill No': '2321654', 'Port Where SB Filed': null, 'Allow for Shipment Date': null,
    'Shipping Date': '29/06/2021 00:00', 'EGM Date': null, 'EGM No': null, 'Cargo Type': 'LIQUID', 'Rotation No': null,
  }]))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'warn')
  assert.equal(r.summary, 'Shipping bill 2321654 found at JNPT. LEO not given yet.')
  assert.equal(val(r, 'Shipping bill date'), '29 Jun 2021')
  assert.deepEqual(r.extra?.truckNumbers, [])
  assert.equal(r.tables?.length ?? 0, 0)
})

test('JNPT/03 with LEO and trucks', () => {
  const r = api('JNPT/03').parse(wrap([{
    'Shipping Bill No': '2321654', 'Leo Date': '03/10/2026 00:00',
    'Vehicle Info': [{ 'Vehicle Number': 'MH43AB1234', 'Truck Entry Time': '02/10/2026 09:00', 'Truck Exit Time': '02/10/2026 11:30' }],
  }]))
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'Shipping bill 2321654 found at JNPT. LEO given on 3 Oct 2026.')
  assert.deepEqual(r.extra?.truckNumbers, ['MH43AB1234'])
  assert.deepEqual(r.tables?.[0].rows[0], ['MH43AB1234', '2 Oct 2026, 09:00', '2 Oct 2026, 11:30'])
})

test('JNPT/03 not found', () => {
  assert.equal(api('JNPT/03').parse(wrap([])).found, false)
})

test('JNPT/03 inputs match the document format', () => {
  const [sb] = api('JNPT/03').inputs
  assert.equal(sb.key, 'sbillNo')
  assert.ok(sb.pattern.test('2321654'))
  assert.ok(!sb.pattern.test('232165'))
})

// ---------- MBPT/01 ----------
test('MBPT/01 found (arrived, dot date style)', () => {
  const r = api('MBPT/01').parse(wrap({
    VoyageDetails: {
      IMO_NUMBER: 'M00066', APPLICATION_TYPE: 'I', SHIPPING_AGENT_CODE: 'KHA01', ATA: '04.03.2021:15:45', ATD: null,
      PORT_OF_ARRIVAL_NAME: null, VESSEL_TYPE: 'WATR', ETA: '20.01.2021:17:40', ETD: '06.05.2021:23:59', VIA_NO: '2101485',
      LAST_PORT_OF_CALL_NAME: 'INBOM', VESSEL_NAME: 'AQUA', SHIPPING_LINE_CODE: 'KHA',
    },
    message: 'Success', status: '0',
  }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'Vessel AQUA arrived at Mumbai Port on 4 Mar 2021, 15:45.')
  assert.equal(r.extra?.vcnNo, '2101485')
  assert.equal(r.extra?.ata, '2021-03-04T15:45')
  assert.equal(r.extra?.eta, '2021-01-20T17:40')
})

test('MBPT/01 not found', () => {
  const r = api('MBPT/01').parse(wrap({ status: '1', Error: 256, message: 'Invalid VCN Number' }))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
})

test('MBPT/01 inputs match the document format', () => {
  assert.ok(api('MBPT/01').inputs[0].pattern.test('2101485'))
})

// ---------- MBPT/02 ----------
const igmGp = {
  bl_no: '77SE21050257', no_of_packages_qty: '2', goods_description: 'KNEADER REACTOR', importer_name: 'TEST NAME',
  delivery_order_no: '120210608982541', crg_type: 'G', be_date: '24052021', out_of_charge_date: '04062021',
  unit_of_measurement: 'MT', Item_no: '8', type_of_packages: 'PKG', nature_of_cargo: 'DB', surveyor_code: 'Dummy',
  vehicle_info: [{ TRUCK_ENTRY_PERMIT_NO: null, VEHICLE_NUMBER: 'SSM', TRUCK_EXIT_TIME: '08062021', TRUCK_ENTRY_TIME: '08062021' }],
  do_date: '08062021', marks_no: 'X', line_no: '8', importer_address: 'X', country_of_origin: '2041951813', be_no: '4062308',
  sub_line_no: '0', igm_date: '26052021', survey_date: '', igm_no: '2283545', cha_code: '11/779',
}

test('MBPT/02 found', () => {
  const r = api('MBPT/02').parse(wrap({ IgmGPDtls: igmGp, message: 'Success', status: '0' }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'BE 4062308: Out of Charge given on 4 Jun 2021 at Mumbai Port.')
  assert.equal(val(r, 'Delivery order number'), '120210608982541')
  assert.deepEqual(r.extra?.truckNumbers, ['SSM'])
  assert.equal(r.extra?.oocDate, '2021-06-04')
  assert.equal(r.extra?.igmNo, '2283545')
  assert.equal(r.extra?.igmDate, '2021-05-26')
  assert.deepEqual(r.tables?.[0].rows[0], ['SSM', '8 Jun 2021', '8 Jun 2021'])
})

test('MBPT/02 not found', () => {
  const r = api('MBPT/02').parse(wrap({ status: '1', message: 'No records found ' }))
  assert.equal(r.found, false)
  assert.equal(r.summary, 'No record found for this number.')
})

test('MBPT/02 inputs match the document format', () => {
  const [igmNo, igmDate, itemNo] = api('MBPT/02').inputs
  assert.ok(igmNo.pattern.test('2283545'))
  assert.ok(igmDate.pattern.test('26052021'))
  assert.equal(igmDate.kind, 'date8')
  assert.ok(itemNo.pattern.test('8'))
  assert.ok(!itemNo.pattern.test('123'))
})

// ---------- MBPT/03 ----------
test('MBPT/03 found (trailing-space vehicle_info key)', () => {
  const r = api('MBPT/03').parse(wrap({
    ExpGPDtls: {
      egm_date: '', egm_no: '', exporter_name: 'SKODA AUTO VOLKSWAGEN INDIA PRIVATE LIMITED', port_where_sb_filed: 'INBOM1',
      importer_address: '', goods_description: '', port_of_loading: 'INBOM1', cargo_type: 'BK',
      rotation_date: '07.06.2021:00:00', importer_name: '', allow_for_shipment_date: '12.06.2021:00:00',
      leo_date: '12.06.2021:00:00', rotation_no: '224366', shipping_bill_date: '01062021',
      'vehicle_info ': [
        { TRUCK_ENTRY_PERMIT_NO: null, VEHICLE_NUMBER: 'NC123', TRUCK_EXIT_TIME: null, TRUCK_ENTRY_TIME: '01062021' },
        { TRUCK_ENTRY_PERMIT_NO: null, VEHICLE_NUMBER: 'NL01AD8109', TRUCK_EXIT_TIME: '02062021', TRUCK_ENTRY_TIME: '02062021' },
        { TRUCK_ENTRY_PERMIT_NO: null, VEHICLE_NUMBER: 'NL01AD8109', TRUCK_EXIT_TIME: null, TRUCK_ENTRY_TIME: '03062021' },
      ],
      cha_code: '', port_of_origin: 'INBOM1', shipping_bill_no: '2132144', vcn_no: '2106140', nature_of_cargo: 'BK',
      port_of_destination_code: 'MXVER',
    },
    message: 'Success', status: '0',
  }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'Shipping bill 2132144 found at Mumbai Port. LEO given on 12 Jun 2021.')
  assert.equal(val(r, 'Allowed for shipment'), '12 Jun 2021')
  assert.deepEqual(r.extra?.truckNumbers, ['NC123', 'NL01AD8109'])
  assert.equal(r.tables?.[0].rows.length, 3)
})

test('MBPT/03 not found', () => {
  assert.equal(api('MBPT/03').parse(wrap({ status: '1', message: 'No records found ' })).found, false)
})

test('MBPT/03 inputs match the document format', () => {
  const [no, dt] = api('MBPT/03').inputs
  assert.equal(no.key, 'shippingBillNo')
  assert.ok(no.pattern.test('2132144'))
  assert.ok(dt.pattern.test('01062021'))
  assert.equal(dt.kind, 'date8')
})

// ---------- IPORTMAN/01 ----------
test('IPORTMAN/01 found', () => {
  const r = api('IPORTMAN/01').parse(wrap({
    imo_number: '6680021', shipping_line_code: 'INMAA120210958', last_port_of_call_name: 'Abu Dhabi',
    eta: '2021-08-16 23:00:00', etd: '2021-08-18 23:00:00', application_type: 'IMPORT',
    port_of_arrival_name: 'INMAA120210958', vessel_type: 'Carrier general cargo/container',
    shipping_agent_code: '70001246', vessel_name: 'MV RANOP', vcn_no: 'INMAA120210958',
  }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'info')
  assert.equal(r.summary, 'Vessel MV RANOP is expected at the port on 16 Aug 2021, 23:00.')
  assert.equal(r.extra?.vcnNo, 'INMAA120210958')
  assert.equal(r.extra?.eta, '2021-08-16T23:00')
})

test('IPORTMAN/01 not found', () => {
  const r = api('IPORTMAN/01').parse(wrap({
    imo_number: null, shipping_line_code: null, last_port_of_call_name: null, eta: null, etd: null, application_type: null,
    port_of_arrival_name: null, vessel_type: null, shipping_agent_code: null, vessel_name: null, vcn_no: null,
    error: 'Data is not available for given Vcn No : AA',
  }))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
})

test('IPORTMAN/01 inputs match the document format', () => {
  const [port, vcn] = api('IPORTMAN/01').inputs
  assert.ok(port.pattern.test('INMAA1'))
  assert.equal(port.upper, true)
  assert.ok(vcn.pattern.test('INMAA120210958'))
  assert.ok(!vcn.pattern.test(' INMAA120210958'))
})

// ---------- IPORTMAN/02 ----------
test('IPORTMAN/02 found', () => {
  const r = api('IPORTMAN/02').parse(wrap({
    igm_no: 'CRUDE OIL', igm_date: '2021-08-01 00:00:00', line_no: null, sub_line_no: null, bl_no: null, be_no: 'BL71',
    be_date: '2021-08-01 00:00:00', importer_name: null, importer_address: 'Metric Ton', cha_code: '70001242',
    nature_of_cargo: 'LB', cargo_type: null, goods_description: null, marks_no: null, no_of_packages_qty: null,
    type_of_packages: null, unit_of_measurement: null, country_of_origin: 'AE', out_of_charge_no: 6497453,
    out_of_charge_date: '2021-08-05 11:35:00', delivery_order_no: '7321234', do_date: '2021-08-05 00:00:00',
    mode_of_transport: null, survey_date: null, surveyor_code: null, vehicle_info: null,
  }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'BE BL71: Out of Charge given on 5 Aug 2021, 11:35 at the port.')
  assert.equal(r.fields[0].value, '5 Aug 2021, 11:35')
  assert.equal(val(r, 'Out of Charge number'), '6497453')
  assert.equal(r.extra?.oocDate, '2021-08-05T11:35')
  assert.equal(r.extra?.igmDate, '2021-08-01')
  assert.deepEqual(r.extra?.truckNumbers, [])
})

test('IPORTMAN/02 not found', () => {
  const r = api('IPORTMAN/02').parse(wrap({
    igm_no: null, igm_date: null, be_no: null, be_date: null, out_of_charge_no: null, delivery_order_no: null,
    vehicle_info: null, error: 'Data is not available for given Be No : 89',
  }))
  assert.equal(r.found, false)
})

test('IPORTMAN/02 inputs match the document format', () => {
  const [port, beNo, beDate] = api('IPORTMAN/02').inputs
  assert.ok(port.pattern.test('INMAA1'))
  assert.ok(beNo.pattern.test('8987001'))
  assert.ok(!beNo.pattern.test('89870012'))
  assert.ok(beDate.pattern.test('01082021'))
})

// ---------- IPORTMAN/03 ----------
test('IPORTMAN/03 found', () => {
  const r = api('IPORTMAN/03').parse(wrap({
    egm_no: '159357', egm_date: '2021-08-03 15:17:00', shipping_bill_no: '9847542', shipping_bill_date: '2021-08-01 00:00:00',
    nature_of_cargo: 'DB', cargo_type: null, exporter_name: 'JSW STEELS LIMITED', port_where_sb_filed: 'INMAA1',
    port_of_origin: 'INMAA1', port_of_destination_code: 'AEAUH1', vehicle_info: null, rotation_no: '7266535',
    leo_date: '2021-08-02 00:00:00', rotation_date: '2021-07-26 00:00:00', vcn_no: null, allow_for_shipment_date: null,
    port_of_loading: null,
  }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'Shipping bill 9847542 found at the port. LEO given on 2 Aug 2021.')
  assert.equal(val(r, 'EGM date'), '3 Aug 2021, 15:17')
  assert.deepEqual(r.extra?.truckNumbers, [])
})

test('IPORTMAN/03 not found', () => {
  const r = api('IPORTMAN/03').parse(wrap({
    egm_no: null, shipping_bill_no: null, leo_date: null, vehicle_info: null,
    error: 'Data is not available for given Shipping Bill No : 98',
  }))
  assert.equal(r.found, false)
})

test('IPORTMAN/03 inputs match the document format', () => {
  const [port, sb, dt] = api('IPORTMAN/03').inputs
  assert.ok(port.pattern.test('INMAA1'))
  assert.ok(sb.pattern.test('9847542'))
  assert.ok(dt.pattern.test('01082021'))
})

// ---------- odd shapes, every API ----------
test('every port API survives odd shapes', () => {
  const odd: unknown[] = [
    null, undefined, {}, [], 'text', 42,
    { response: [{ response: 'X - 3rd party service is down!', responseStatus: 'ERROR' }], error: 'true' },
    { response: null, error: 'true', code: '400', message: 'Data format failed OR wrong value entered at: vcnNo.' },
    wrap(null), wrap([]), wrap({}), wrap([null, 'x', 3]), wrap({ status: '1' }),
    wrap({ IgmGPDtls: 'oops' }), wrap({ ExpGPDtls: null }), wrap({ VoyageDetails: [] }),
    wrap([{ 'Vehicle Info': 'abc', 'Be No': 'X' }]), wrap({ vehicle_info: [null, 5, {}], be_no: 'X' }),
  ]
  for (const a of PORT_APIS) {
    for (const o of odd) {
      const r = a.parse(o)
      assert.equal(typeof r.summary, 'string', `${a.id} summary`)
      assert.ok(Array.isArray(r.fields), `${a.id} fields`)
    }
  }
})

test('service-down text is shown as a problem', () => {
  const r = api('JNPT/02').parse({
    response: [{ response: 'X - 3rd party service is down!', responseStatus: 'ERROR' }], error: 'true',
  })
  assert.equal(r.found, false)
  assert.equal(r.tone, 'bad')
  assert.match(r.summary, /3rd party service is down/)
})
