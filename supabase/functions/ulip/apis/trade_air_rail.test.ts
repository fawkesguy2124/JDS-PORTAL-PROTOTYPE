// Run: node --experimental-strip-types --no-warnings --test supabase/functions/ulip/apis/trade_air_rail.test.ts
// Samples are copied from the official ULIP DGFT / AAICLAS / ACMES / FOIS / LDB documents
// and from the July 2026 staging answers. Personal names are replaced with "TEST NAME".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRADE_AIR_RAIL_APIS } from './trade_air_rail.ts'

const api = (id: string) => TRADE_AIR_RAIL_APIS.find((a) => a.id === id)!
const wrap = (response: unknown, status = 'SUCCESS') => ({
  response: [{ response, responseStatus: status, message: null }], error: 'false', code: '200', message: 'Success',
})
const val = (r: any, label: string) => r.fields.find((x: any) => x.label === label)?.value
const down = { response: [{ response: 'X - 3rd party service is down!', responseStatus: 'ERROR' }], error: 'true' }

test('all ten APIs are registered', () => {
  assert.deepEqual(TRADE_AIR_RAIL_APIS.map((a) => a.id),
    ['DGFT/01', 'DGFT/02', 'AAICLAS/01', 'AAICLAS/02', 'ACMES/01', 'ACMES/02', 'FOIS/01', 'FOIS/02', 'FOIS/04', 'LDB/01'])
})

for (const a of TRADE_AIR_RAIL_APIS) {
  test(`${a.id} odd shapes do not throw`, () => {
    for (const odd of [null, undefined, {}, [], 'text', 5, { response: [] }, { response: [null] }, { response: 'x' },
      { response: [{ response: [] }] }, { response: [{ response: [null, 5] }] }, { response: [{ response: {} }] }, down]) {
      const r = a.parse(odd)
      assert.equal(typeof r.summary, 'string')
      assert.ok(r.summary.length > 0)
      assert.equal(r.found, false, `${a.id} should be not found for ${JSON.stringify(odd)}`)
      assert.ok(Array.isArray(r.fields))
    }
    const r = a.parse(down)
    assert.equal(r.tone, 'bad')
    assert.match(r.summary, /3rd party service is down/)
  })
}

// ---------- DGFT/01 ----------
const iecFound = wrap({
  exporterType: 1, address2: 'S*c*o* 4*', city: 'Gurugram', address1: '1*1*', responseTime: '09:53:34',
  iecIssueDate: 'Jan 27, 2016 6:30:00 PM', requestTime: '09:53:21', natureOfConcern: 111000113,
  entityName: 'HAMLET E COMMERCE PRIVATE LIMITED', pinCode: 122001, iecStatus: 0, state: 'HARYANA', pan: 'A*D*H*6*1*', iecNumber: '0515920797',
})

test('DGFT/01 found (active)', () => {
  const r = api('DGFT/01').parse(iecFound)
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'IEC 0515920797 is ACTIVE for HAMLET E COMMERCE PRIVATE LIMITED.')
  assert.equal(val(r, 'IEC issue date'), '28 Jan 2016') // UTC 27 Jan 18:30 = 28 Jan IST
  assert.equal(val(r, 'City'), 'Gurugram')
  assert.equal(val(r, 'State'), 'HARYANA')
})

test('DGFT/01 cancelled is bad', () => {
  const r = api('DGFT/01').parse(wrap({ iecNumber: '0515920797', entityName: 'ABC LTD', iecStatus: 'Cancelled' }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'bad')
  assert.match(r.summary, /CANCELLED/)
  const code = (n: number) => api('DGFT/01').parse(wrap({ iecNumber: '0515920797', entityName: 'ABC LTD', iecStatus: n }))
  assert.match(code(1).summary, /BLACKLISTED/)
  assert.match(code(2).summary, /SUSPENDED/)
  assert.match(code(3).summary, /CANCELLED/)
  for (const n of [1, 2, 3]) assert.equal(code(n).tone, 'bad')
  for (const n of [4, 5, 6]) { assert.equal(code(n).tone, 'good'); assert.match(code(n).summary, /ACTIVE.*\(/) }
  assert.equal(code(9).tone, 'warn')
  assert.match(code(9).summary, /status code 9 \(unknown\)/)
})

test('DGFT/01 not found', () => {
  const r = api('DGFT/01').parse(wrap({ errorDescription: 'No record found - IEC Not Found', error: 'record_not_found' }, 'ERROR'))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
})

test('DGFT/01 invalid input answer', () => {
  const r = api('DGFT/01').parse({ response: null, error: 'true', code: '400', message: 'Data format failed OR wrong value entered at: iecnumber. Format should follow [0-9]{10}' })
  assert.equal(r.found, false)
  assert.equal(r.tone, 'bad')
})

test('DGFT/01 inputs', () => {
  const [i] = api('DGFT/01').inputs
  assert.equal(i.key, 'iecnumber')
  assert.ok(i.pattern.test('0388197021'))
  assert.ok(!i.pattern.test('038819702'))
})

// ---------- DGFT/02 ----------
const policyFound = wrap({
  chapter: '29',
  productDescriptionImportPolicy: [{ hsCode: '29035100', description: 'Unsaturated fluorinated derivatives:\n- - 2,3,3,3-Tetrafluoropropene', notificationNumber: '08.11.2020' }],
  description: 'PRODUCTS OF THE CHEMICAL OR ALLIED INDUSTRIES',
  main: [{ notes: 'Note 3 to this Chapter shall not be applicable.', notificationNumber: '', slNo: '2', notificationDate: '' }],
  poliicyCondition: [
    { notes: 'Import is permitted by actual users against a licence.\r\n\r\nMore text.', notificationNumber: '', slNo: '1', notificationDate: '' },
    { notes: 'Submit a copy of the Bill of Entry within 30 days.', notificationNumber: '08.11.2020', slNo: '4', notificationDate: '' },
  ],
})

test('DGFT/02 found with the misspelled key', () => {
  const r = api('DGFT/02').parse(policyFound)
  assert.equal(r.found, true)
  assert.equal(r.tone, 'info')
  assert.equal(r.summary, 'DGFT did not state the policy for HS 29035100; check the ITC-HS schedule.')
  assert.equal(r.tables![0].rows.length, 2)
  assert.equal(r.tables![0].rows[0][1], 'Import is permitted by actual users against a licence. More text.')
})

test('DGFT/02 accepts the correct spelling and an explicit policy word', () => {
  const p = (policy: string) => api('DGFT/02').parse(wrap({
    productDescriptionImportPolicy: [{ hsCode: '12345678', description: 'X', policy }],
    policyCondition: [{ notes: 'cond', slNo: '1' }],
  }))
  const free = p('Free')
  assert.equal(free.summary, 'HS 12345678: import policy FREE.')
  assert.equal(free.tone, 'good')
  assert.equal(p('Restricted').tone, 'bad')
  assert.equal(p('Prohibited').summary, 'HS 12345678: import policy PROHIBITED.')
  assert.equal(p('Free').tables![0].rows.length, 1)
})

test('DGFT/02 not found and system error', () => {
  const nf = api('DGFT/02').parse(wrap({ errorDescription: 'No record found', error: 'record_not_found' }, 'ERROR'))
  assert.equal(nf.found, false)
  assert.equal(nf.tone, 'warn')
  const sys = api('DGFT/02').parse(wrap({ chapter: null, productDescriptionImportPolicy: null, description: null, error: 'System exception while processing request', main: null, poliicyCondition: null }))
  assert.equal(sys.found, false)
  assert.equal(sys.tone, 'bad')
  assert.match(sys.summary, /System exception/)
})

test('DGFT/02 inputs', () => {
  const [i] = api('DGFT/02').inputs
  assert.equal(i.key, 'itchs')
  assert.ok(i.pattern.test('29035100'))
  assert.ok(!i.pattern.test('2903510'))
})

// ---------- Air export (AAICLAS/01, ACMES/01) ----------
const acmesExport = wrap({
  ExportTrackingData: {
    AWB: { Destination: 'DXB', Packages: '24', GrossWeight: '464', ChargeableWeight: '464', TDGDateTime: '08/03/2021 16:57:00', BAGDateTime: '08/03/2021 21:13:00', GatePassDateTime: 'N/A', HandOverDateTime: '' },
    SHIPPING_BILL: [], LOCATION_DETAILS: [],
    XRAY_DETAILS: [{ XRayDate: '08/03/2021 20:33', XRayMachine: '40011512', XRayBy: 'XRAY05' }],
    ULD_DETAILS: [{ ULDNo: 'BT07IND:', ULDType: 'BT', Status: 'A', FlightNo: '6E9602', FlightDate: '10/03/2021' }],
    EGM_DETAILS: [{ EGMNo: '341511', EGMYear: '11/03/2021', FlightNo: '6E23', FlightDate: '11/03/2021', ATD: ' ', Commodity: 'CONSOL COURIER', Packages: '24', GrossWeight: '464' }],
  },
})
const aaiExport = wrap({
  ExportTrackingData: {
    AWB: null, SHIPPING_BILL: [], LOCATION_DETAILS: [], XRAY_DETAILS: [],
    ULD_DETAILS: [{ ULDNo: 'BT-SQ517', ULDType: 'BULK', Status: 'R', FlightNo: 'SQ517', FlightDate: '19/12/2021' }],
    EGM_DETAILS: [{ EGMNo: '7066', EGMYear: '19/12/2021', FlightNo: 'SQ517', FlightDate: '19/12/2021', ATD: ' ', Commodity: 'CRABS', Packages: '33', GrossWeight: '523' }],
  },
})
const exportEmpty = wrap({ ExportTrackingData: { AWB: null, SHIPPING_BILL: [], LOCATION_DETAILS: [], XRAY_DETAILS: [], ULD_DETAILS: [], EGM_DETAILS: [] } })
const locationUnknown = { response: [{ response: '"Value cannot be null.\\r\\nParameter name: remoteAddress"', responseStatus: 'ERROR' }], error: 'false', code: '200', message: 'Success' }

test('ACMES/01 found (July staging shape)', () => {
  const r = api('ACMES/01').parse(acmesExport)
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'Shipped: export manifest (EGM 341511) filed for flight 6E23 on 11 Mar 2021.')
  assert.equal(val(r, 'Going to'), 'DXB')
  assert.equal(val(r, 'Packages'), '24')
  assert.equal(val(r, 'Gate pass'), undefined) // "N/A" is not shown
  assert.equal(val(r, 'Handed over'), undefined)
  assert.equal(val(r, 'X-ray done'), '8 Mar 2021, 20:33, by XRAY05')
  const uld = r.tables!.find((t) => t.title.startsWith('Containers'))!
  assert.equal(uld.rows[0][0], 'BT07IND')
  assert.equal(uld.rows[0][4], '10 Mar 2021')
})

test('AAICLAS/01 found (document sample, AWB empty)', () => {
  const r = api('AAICLAS/01').parse(aaiExport)
  assert.equal(r.found, true)
  assert.match(r.summary, /flight SQ517 on 19 Dec 2021/)
  assert.equal(val(r, 'Goods'), 'CRABS')
})

test('AAICLAS/01 and ACMES/01 not found', () => {
  for (const id of ['AAICLAS/01', 'ACMES/01']) {
    const r = api(id).parse(exportEmpty)
    assert.equal(r.found, false)
    assert.equal(r.tone, 'warn')
  }
})

test('AAICLAS unknown location gives a plain message', () => {
  for (const id of ['AAICLAS/01', 'AAICLAS/02']) {
    const r = api(id).parse(locationUnknown)
    assert.equal(r.found, false)
    assert.equal(r.tone, 'bad')
    assert.match(r.summary, /airport code/)
    assert.ok(!/remoteAddress/.test(r.summary))
  }
})

test('export stages: only X-ray, only AWB, location table', () => {
  const xr = api('ACMES/01').parse(wrap({ ExportTrackingData: { AWB: null, XRAY_DETAILS: [{ XRayDate: '08/03/2021 20:33', XRayMachine: '1', XRayBy: 'A' }] } }))
  assert.match(xr.summary, /^X-ray done on 8 Mar 2021, 20:33/)
  const awb = api('ACMES/01').parse(wrap({ ExportTrackingData: { AWB: { Destination: 'LHR', Packages: '3' } } }))
  assert.equal(awb.summary, 'Cargo is at the terminal, going to LHR.')
  const loc = api('AAICLAS/01').parse(wrap({ ExportTrackingData: { AWB: null, LOCATION_DETAILS: [{ LocationName: 'SHED A', MovedOn: '08/03/2021 10:00' }] } }))
  assert.equal(loc.found, true)
  assert.deepEqual(loc.tables![0].columns, ['Location name', 'Moved on'])
  assert.equal(loc.tables![0].rows[0][1], '8 Mar 2021, 10:00')
})

test('air export inputs', () => {
  const aai = api('AAICLAS/01').inputs
  assert.deepEqual(aai.map((i) => i.key), ['awbNumber', 'location'])
  assert.ok(aai[0].pattern.test('61835488224'))
  assert.ok(!aai[0].pattern.test('6183548822'))
  assert.ok(aai[1].pattern.test('CCU'))
  assert.ok(!aai[1].pattern.test('CCUU'))
  assert.equal(aai[1].upper, true)
  const ac = api('ACMES/01').inputs
  assert.deepEqual(ac.map((i) => i.key), ['awbnumber'])
  assert.ok(ac[0].pattern.test('40689348000'))
})

// ---------- Air import (AAICLAS/02, ACMES/02) ----------
const importFound = (awbNo: string, hawb: string) => wrap({
  ImportTrackingData: {
    AWB_DETAILS: { IgmNo: '1896697', IgmYear: '2021', AwbNo: awbNo, HawbNo: hawb, ArrivedPackages: '1', ArrivedWeight: '70', ChargeableWeight: '192', DamagedPackages: '0' },
    IGM_DETAILS: [{ IgmNo: '1896697', IgmYear: '2021', FlightNo: 'TK6448', FlightDate: '16/03/2021', SegregationDate: '16/03/2021 15:30', SegregationStatus: 'DONE', ATA: '16/03/2021 04:45' }],
    DO_DETAILS: [
      { DOIssuedBy: 'TURKISH AIRLINES', DODate: '17/03/2021 12:02:21', HawbNo: '0', DOIssuedTo: 'SUNRISE FREIGHT FORWARDERS PVT. LTD.' },
      { DOIssuedBy: 'SUNRISE FREIGHT FORWARDERS PVT. LTD.', DODate: '17/03/2021 12:34:28', HawbNo: hawb, DOIssuedTo: 'REGENT GARAGE (P) LTD.' },
    ],
    GP_DETAILS: [{ GatePassNo: 'NN202103232098', DeliveryPackages: '1', GeneratedOn: '23/03/2021 11:48:00', DocStatus: 'DELIVERED' }],
    LOC_DETAILS: [],
  },
})
const importEmpty = wrap({ ImportTrackingData: { AWB_DETAILS: null, IGM_DETAILS: [], DO_DETAILS: [], GP_DETAILS: [], LOC_DETAILS: [] } })
const hawbMissing = wrap({
  ImportTrackingData: {
    AWB_DETAILS: null, IGM_DETAILS: [],
    DO_DETAILS: [{ DOIssuedBy: '', DODate: '20/12/2021 03:35:13', HawbNo: '0', DOIssuedTo: 'UNIQUE LOGISTICS INTERNATIONAL (INDIA) PVT LTD' }],
    GP_DETAILS: [], LOC_DETAILS: [],
  },
})

test('ACMES/02 found: delivered', () => {
  const r = api('ACMES/02').parse(importFound('23552194682', 'MUC75007115'))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'Delivered: gate pass NN202103232098 issued on 23 Mar 2021, 11:48.')
  assert.equal(val(r, 'Flight'), 'TK6448, 16 Mar 2021')
  assert.equal(val(r, 'Arrived (ATA)'), '16 Mar 2021, 04:45')
  assert.equal(val(r, 'Packages arrived'), '1')
  const dos = r.tables!.find((t) => t.title === 'Delivery orders')!
  assert.equal(dos.rows.length, 2)
  assert.equal(dos.rows[0][3], 'Master (airline) delivery order')
  assert.deepEqual(r.extra, { awbNo: '23552194682', hawbNo: 'MUC75007115', igmNo: '1896697', igmYear: '2021', gatePassNo: 'NN202103232098', delivered: true })
})

test('AAICLAS/02 found', () => {
  const r = api('AAICLAS/02').parse(importFound('15770597822', '21120039'))
  assert.equal(r.found, true)
  assert.equal(val(r, 'House AWB'), '21120039')
})

test('air import: delivery order only, flight only, damaged', () => {
  const body = (extra: any) => wrap({ ImportTrackingData: { AWB_DETAILS: { AwbNo: '1', DamagedPackages: '0' }, IGM_DETAILS: [], DO_DETAILS: [], GP_DETAILS: [], ...extra } })
  const doOnly = api('ACMES/02').parse(body({ DO_DETAILS: [{ DOIssuedBy: 'A', DODate: '17/03/2021 12:02:21', HawbNo: '0', DOIssuedTo: 'B LTD' }] }))
  assert.equal(doOnly.summary, 'Delivery order issued on 17 Mar 2021, 12:02 to B LTD; gate pass not issued yet.')
  const flt = api('ACMES/02').parse(body({ IGM_DETAILS: [{ FlightNo: 'QR1', ATA: '20/12/2021 02:25' }] }))
  assert.equal(flt.tone, 'warn')
  assert.match(flt.summary, /^Arrived on flight QR1 at 20 Dec 2021, 02:25; delivery order not issued yet/)
  const dmg = api('ACMES/02').parse(wrap({ ImportTrackingData: { AWB_DETAILS: { AwbNo: '1', DamagedPackages: '2' }, GP_DETAILS: [] } }))
  assert.equal(dmg.tone, 'bad')
  assert.match(dmg.summary, /2 damaged packages/)
})

test('air import not found, including the odd HAWB-missing sample', () => {
  for (const id of ['AAICLAS/02', 'ACMES/02']) {
    for (const b of [importEmpty, hawbMissing]) {
      const r = api(id).parse(b)
      assert.equal(r.found, false)
      assert.equal(r.tone, 'warn')
    }
  }
})

test('air import inputs and body', () => {
  const aai = api('AAICLAS/02')
  assert.deepEqual(aai.inputs.map((i) => i.key), ['awbNumber', 'hawb', 'location'])
  assert.ok(aai.inputs[0].pattern.test('15770597822'))
  assert.ok(aai.inputs[1].pattern.test('21120039'))
  assert.ok(aai.inputs[1].pattern.test(''))
  assert.ok(!aai.inputs[1].pattern.test('21-120039'))
  assert.equal(aai.inputs[1].optional, true)
  assert.ok(aai.inputs[2].pattern.test('CCU'))
  assert.deepEqual(aai.buildBody!({ awbNumber: '15770597822', location: 'CCU' }), { awbNumber: '15770597822', hawb: '', location: 'CCU' })
  const ac = api('ACMES/02')
  assert.deepEqual(ac.inputs.map((i) => i.key), ['awbnumber', 'hawb'])
  assert.ok(ac.inputs[1].pattern.test('MUC75007115'))
  assert.deepEqual(ac.buildBody!({ awbnumber: '23552194682', hawb: 'MUC75007115' }), { awbnumber: '23552194682', hawb: 'MUC75007115' })
})

// ---------- FOIS/01 ----------
test('FOIS/01 found (document and July staging sample)', () => {
  const r = api('FOIS/01').parse(wrap([{
    newFnr: '', etaDstn: '22:10 20-09-2023', cmdt: 'PHC', currentStatus: 'REACHED AT DESTINATION ON 22:10 20-09-2023', lastRepStts: 'AR', locoNumb: '',
    lastRepLocn: 'M/S NABHA POWER LTD.SIDING(NPSB)', lgtd: '76.515312', fnrNo: '23091420258', lttd: '30.538016',
    stationFrom: 'NEW KUSMUNDA COLLIERY SIDING, KORBA(NKCR)', stationTo: 'M/S NABHA POWER LTD.SIDING(NPSB)',
  }]))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'FNR 23091420258: REACHED AT DESTINATION ON 22:10 20-09-2023.')
  assert.equal(val(r, 'Last reported location'), 'M/S NABHA POWER LTD.SIDING(NPSB)')
  assert.equal(val(r, 'Expected arrival (ETA)'), '20 Sep 2023, 22:10')
  assert.equal(val(r, 'Engine number'), undefined)
  assert.equal((r.extra as any).reachedDestination, true)
})

test('FOIS/01 on the way and not found', () => {
  const r = api('FOIS/01').parse(wrap([{ fnrNo: '21030407355', currentStatus: 'IN TRANSIT', lastRepLocn: 'ITARSI JN' }]))
  assert.equal(r.tone, 'info')
  assert.equal(r.summary, 'FNR 21030407355: IN TRANSIT.')
  assert.equal(api('FOIS/01').parse(wrap([])).found, false)
  assert.equal(api('FOIS/01').parse(wrap([{ error: 'Invalid FNR' }])).found, false)
})

test('FOIS/01 inputs', () => {
  const [i] = api('FOIS/01').inputs
  assert.equal(i.key, 'fnrnumber')
  assert.ok(i.pattern.test('21030407355'))
  assert.ok(!i.pattern.test(' 23121326682'))
})

// ---------- FOIS/02 ----------
const freight = wrap({
  stts: { evntCode: 'FRGTDTLS', error: '', successFailFlag: 'S' },
  frgt: {
    dist: '488', routInfo: 'Shortest', viaDesc: 'TKD-AST-PWL', cmdtClssTL: '140A', cmdtClssWL: '140B', rateTL: '678.20', rateWL: '746.10',
    totlchblwght: '680.0', rakeSize: '10', PCC: '68.00', trangsttax: '29,204.00', wgongsttax: '31,992.00',
    trantotlfrgt: '5,84,072.40', tranfinlfrgt: '5,84,072.40', wgontotlfrgt: '6,39,825.60', wgonfinlfrgt: '6,39,825.60',
    surchrg: 'DYNAMIC PRICING', othrchrg: 'DEVELOPMENT CHARGE', ETA: '20',
    transurchrgdtls: [{ rebtamnt: '101.73', rebtcode: 'DPO', prcn: '15.00', desc: 'DYNAMIC PRICING (DPO)' }],
    tranothrchrgdtls: [
      { rebtamnt: '39.00', rebtcode: 'DS', prcn: '5.00', desc: 'DEVELOPMENT CHARGE(DS)' },
      { rebtamnt: '20.00', rebtcode: 'OTC', prcn: '0', desc: 'ORIGINATING TERMINAL CHARGES(OTC)' },
    ],
    tranrebtchrgdtls: [],
    atlrout: [{ sttnto: 'HARPALPUR- HPP (NC)', sttnfrom: 'HAZRAT NIZAM-UD-DIN JN.- NZM (NR)' }],
  },
})

test('FOIS/02 found: total freight first', () => {
  const r = api('FOIS/02').parse(freight)
  assert.equal(r.found, true)
  assert.equal(r.summary, 'Total freight: Rs 5,84,072.40 for a full train load (rake), or Rs 6,39,825.60 as wagon load.')
  assert.equal(r.fields[0].label, 'Total freight, train load (rake)')
  assert.equal(r.fields[0].value, 'Rs 5,84,072.40')
  assert.equal(val(r, 'Distance (km)'), '488')
  assert.equal(r.tables!.find((t) => t.title === 'Other charges')!.rows.length, 2)
  assert.ok(!r.tables!.some((t) => t.title === 'Rebates')) // empty list is not shown
})

test('FOIS/02 failure flag and empty answers', () => {
  const r = api('FOIS/02').parse(wrap({ stts: { evntCode: 'FRGTDTLS', error: 'Invalid station', successFailFlag: 'F' }, frgt: null }))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'bad')
  assert.match(r.summary, /Invalid station/)
})

test('FOIS/02 inputs accept the documented examples (letters allowed)', () => {
  const ins = api('FOIS/02').inputs
  assert.deepEqual(ins.map((i) => i.key), ['sttnfrom', 'sttnto', 'cmdt', 'wgontype'])
  const ex = ['NZM', 'HPP', 'CEMENT', 'BOXN']
  ins.forEach((i, n) => {
    assert.ok(i.pattern.test(ex[n]), i.key)
    assert.equal(i.upper, true)
    assert.ok(!i.pattern.test(''))
  })
})

// ---------- FOIS/04 ----------
const parcelFound = wrap([{
  RR: {
    PWBLTNO: '4002411032', SCALE: 'Lugguage', BDT: '02-09-2025', CNEE: 'TEST NAME', CNEEADD: 'MIRZAPUR JYG', CNOR: 'TEST NAME', FSTN: 'BAREILLY JN.',
    ITMDET_PRNT: {
      ITMDET: {
        LOADSTNDET: '', UNLOADSTATUS_DT: '05-Sep-2025 00:52', LOADTRAIN: '14650', UNLOADSTNDET: '', DESC: 'BICYCLE (40KG)', UNLOADTRAIN: '14650',
        STATUS_DT: '06-Sep-2025 08:26', STATUS: 'Delivered', STNDET: '', TOTITMS: '2', LOADSTATUS_DT: '04-Sep-2025 03:37',
      },
    },
    CNORADD: 'MIRZAPUR JYG', TSTN: 'JYG-JAYNAGAR',
  },
}])

test('FOIS/04 found', () => {
  const r = api('FOIS/04').parse(parcelFound)
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'Parcel 4002411032: Delivered on 6 Sep 2025, 08:26.')
  assert.equal(val(r, 'Booked on'), '2 Sep 2025')
  assert.equal(val(r, 'To station'), 'JYG-JAYNAGAR')
  assert.ok(!r.fields.some((x) => /address/i.test(x.label)))
  assert.ok(!JSON.stringify(r).includes('MIRZAPUR'))
  assert.equal(r.tables![0].rows[0][1], '4 Sep 2025, 03:37')
})

test('FOIS/04 not found', () => {
  const r = api('FOIS/04').parse(wrap([{ error: 'Invalid Receipt Number..' }]))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
  assert.match(r.summary, /Invalid Receipt Number/)
})

test('FOIS/04 inputs', () => {
  const [i] = api('FOIS/04').inputs
  assert.equal(i.key, 'lngpwbltno')
  assert.ok(i.pattern.test('4002411032'))
  assert.ok(!i.pattern.test('400241103'))
})

// ---------- LDB/01 ----------
const ev = (n: number, name: string, when: string, ms: number, mode: string) => ({
  serialno: n, eventname: name, currentlocation: 'Raigad/Nhava Sheva Freeport Terminal (NSFT)', division: null, timestamptimezone: when,
  timezoneabvr: 'IST', latitude: 18.95, longitude: 72.95, containernumber: 'NSST1234570', timeinms: ms, transportmode: mode, type: 'I', isempty: 'Y',
})
const ldbFound = wrap({
  eximContainerTrail: {
    cntrDetail: { cntrno: 'NSST1234570', refflg: 'Yes', cntrsize: 40, isocode: '22G3', containertype: null },
    dpd_dpe: { c_import: { dpd: 'N', destination: null }, c_export: null },
    last_event: [ev(1, 'PORT OUT', '2023-03-29 11:00:09', 1680067809000, 'TRUCK')],
    res_Message: 'Success',
    trackLog: [ev(2, 'PORT IN', '2023-03-28 09:00:08', 1679974208000, 'VESSEL'), ev(1, 'PORT OUT', '2023-03-29 11:00:09', 1680067809000, 'TRUCK')],
    vessel_ata: null, vessel_atd: null,
    vessel_eta: [{ eventid: 24, eventname: 'EXPECTED VESSEL ARRIVAL', orgname: 'Nhava Sheva Freeport Terminal (NSFT)', timetimestamp: '2023-03-28 10:03:22', vesselname: 'APR EXPRESSS', shippingline: 'TRANSPORT CORPORATION OF INDIA LTD' }],
    vessel_etd: null, vessel_gate_cutoff: null,
  },
  domesticContainerTrail: { cntrDetail: null, dpd_dpe: null, last_event: null, res_Message: 'NO RECORD FOUND', trackLog: null, vessel_ata: null, vessel_atd: null, vessel_eta: null, vessel_etd: null, vessel_gate_cutoff: null },
})

test('LDB/01 found: latest event first', () => {
  const r = api('LDB/01').parse(ldbFound)
  assert.equal(r.found, true)
  assert.equal(r.summary, 'Container NSST1234570: latest event PORT OUT at Raigad/Nhava Sheva Freeport Terminal (NSFT) on 29 Mar 2023, 11:00.')
  assert.equal(r.fields[0].label, 'Latest event')
  assert.equal(val(r, 'Size (feet)'), '40')
  assert.equal(val(r, 'Expected vessel'), 'APR EXPRESSS')
  const hist = r.tables!.find((t) => t.title.startsWith('Event history'))!
  assert.equal(hist.rows.length, 2)
  assert.equal(hist.rows[0][1], 'PORT OUT') // newest first even though the log lists PORT IN first
  assert.equal(hist.rows[1][1], 'PORT IN')
  assert.equal(hist.rows[0][4], 'Empty')
  assert.ok(!r.tables!.some((t) => t.title.startsWith('Domestic')))
})

test('LDB/01 not found (document sample) and no-record trails', () => {
  const r = api('LDB/01').parse({ response: [{ responseStatus: 'FAILURE', message: { text: 'Container details not found for the given container number: TCLU8538800' } }], error: 'false', code: '200', message: 'Success' })
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
  assert.match(r.summary, /TCLU8538800/)
  const none = api('LDB/01').parse(wrap({ eximContainerTrail: { cntrDetail: null, res_Message: 'NO RECORD FOUND' }, domesticContainerTrail: { cntrDetail: null, res_Message: 'NO RECORD FOUND' } }))
  assert.equal(none.found, false)
})

test('LDB/01 inputs', () => {
  const [i] = api('LDB/01').inputs
  assert.equal(i.key, 'containerNumber')
  assert.equal(i.upper, true)
  assert.ok(i.pattern.test('ACMP1000010'))
  assert.ok(i.pattern.test('TCLU8538800'))
  assert.ok(!i.pattern.test('ACMP10000'))
  assert.ok(!i.pattern.test('acmp1000010'))
})

test('AWB with hyphen or spaces is accepted and sent as 11 digits', () => {
  for (const id of ['AAICLAS/01', 'AAICLAS/02', 'ACMES/01', 'ACMES/02']) {
    const a = api(id)
    const k = a.inputs[0].key
    for (const v of ['618-35488224', '618 35488224', '61835488224']) assert.ok(a.inputs[0].pattern.test(v), v)
    assert.ok(!a.inputs[0].pattern.test('6183548822'))
    assert.ok(!a.inputs[0].pattern.test('618-3548A224'))
    const body: any = a.buildBody!({ [k]: '618-35488224', location: 'CCU' })
    assert.equal(body[k], '61835488224')
  }
})
