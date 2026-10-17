// Run: node --experimental-strip-types --test supabase/functions/ulip/apis/
// Samples are copied from the official ULIP ROAD documents (docs/ulip-specs/ROAD.md).
// Person names are replaced with "TEST NAME". The SARATHI/01 "found" test uses a built shape (see note there).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROAD_APIS, _internal } from './road.ts'

const api = (id: string) => ROAD_APIS.find((a) => a.id === id)!
const wrap = (payload: unknown, status = 'SUCCESS') => ({
  response: [{ response: payload, responseStatus: status }], error: 'false', code: '200', message: 'Success',
})
const DOWN = { response: [{ response: 'X - 3rd party service is down!', responseStatus: 'ERROR' }], error: 'true' }
const clean = (id: string, params: Record<string, string>) => {
  // same cleaning as cleanParams in index.ts, without importing it
  for (const i of api(id).inputs) {
    let v = String(params[i.key] ?? '').trim()
    if (i.upper) v = v.toUpperCase().replace(/\s+/g, '')
    if (!v && i.optional) continue
    assert.ok(i.pattern.test(v), `${id} ${i.key} "${v}" should pass ${i.pattern}`)
  }
}

const VAHAN_XML = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<VehicleDetails>\n<stautsMessage>OK</stautsMessage>\n<rc_regn_no>UP91L0001</rc_regn_no>\n<rc_regn_dt>26-Jan-2017</rc_regn_dt>\n<rc_regn_upto>25-Jan-2032</rc_regn_upto>\n<rc_purchase_dt>24-Jan-2017</rc_purchase_dt>\n<rc_owner_sr>1</rc_owner_sr>\n<rc_owner_name>R***L K***R</rc_owner_name>\n<state_cd>UP</state_cd>\n<rto_cd>91</rto_cd>\n<rc_present_address>, 999999</rc_present_address>\n<rc_permanent_address>, 999999</rc_permanent_address>\n<rc_vch_catg>2WN</rc_vch_catg>\n<rc_vh_class_desc>M-Cycle/Scooter(2WN)</rc_vh_class_desc>\n<rc_vhclass_desc>M-Cycle/Scooter</rc_vhclass_desc>\n<rc_chasi_no>ME4JF509AH70*****</rc_chasi_no>\n<rc_eng_no>JF50E760*****</rc_eng_no>\n<rc_maker_desc>HONDA MOTORCYCLE AND SCOOTER INDIA (P) LTD</rc_maker_desc>\n<rc_maker_model>HONDA ACTIVA</rc_maker_model>\n<rc_body_type_desc>SOLO</rc_body_type_desc>\n<rc_fuel_desc>PETROL</rc_fuel_desc>\n<rc_color>P A WHITE</rc_color>\n<rc_norms_desc>BHARAT STAGE II</rc_norms_desc>\n<rc_fit_upto>25-Jan-2032</rc_fit_upto>\n<rc_tax_upto>25-01-2032</rc_tax_upto>\n<rc_financer></rc_financer>\n<rc_insurance_comp>HDFC ERGO General Insurance Company Ltd</rc_insurance_comp>\n<rc_insurance_policy_no>2320100501934300000</rc_insurance_policy_no>\n<rc_insurance_upto>15-Sep-2020</rc_insurance_upto>\n<rc_manu_month_yr>1/2017</rc_manu_month_yr>\n<rc_unld_wt>108</rc_unld_wt>\n<rc_gvw>269</rc_gvw>\n<rc_no_cyl>1</rc_no_cyl>\n<rc_cubic_cap>109.00</rc_cubic_cap>\n<rc_seat_cap>2</rc_seat_cap>\n<rc_sleeper_cap></rc_sleeper_cap>\n<rc_stand_cap>0</rc_stand_cap>\n<rc_wheelbase>1230</rc_wheelbase>\n<rc_registered_at>HAMIRPUR(UP), Uttar Pradesh</rc_registered_at>\n<rc_status_as_on>03-Feb-2026</rc_status_as_on>\n<rc_status>ACTIVE</rc_status>\n<rc_blacklist_status></rc_blacklist_status>\n<rc_noc_details></rc_noc_details>\n<rc_vh_type>N</rc_vh_type>\n<rc_vh_class>1</rc_vh_class>\n<rc_noc_dt></rc_noc_dt>\n<rc_fuel_cd>1</rc_fuel_cd>\n<rc_maker_cd>36</rc_maker_cd>\n<rc_model_cd>HONDA ACTIVA</rc_model_cd>\n<rc_norms_cd>0</rc_norms_cd>\n<rc_sale_amt>51129.0</rc_sale_amt>\n<rc_own_catg_desc>OTHERS</rc_own_catg_desc>\n<rc_vch_catg_desc>TWO WHEELER(NT)</rc_vch_catg_desc>\n<rc_owner_cd_desc>INDIVIDUAL</rc_owner_cd_desc>\n<rc_vehicle_surrendered_to_dealer>0</rc_vehicle_surrendered_to_dealer>\n<rc_currentadd_districtcode>0</rc_currentadd_districtcode>\n<rc_non_use>false</rc_non_use>\n<rc_passenger_tax></rc_passenger_tax>\n<rc_goods_tax></rc_goods_tax>\n<rc_tax_mode>L</rc_tax_mode>\n</VehicleDetails>\n"

test('all 13 road APIs are registered with unique ids', () => {
  const ids = ROAD_APIS.map((a) => a.id).sort()
  assert.deepEqual(ids, [
    'ECHALLAN/01', 'EWAYBILL/01', 'FASTAG/01', 'FASTAG/02', 'SARATHI/01', 'SARATHI/02', 'TOLL/01',
    'VAHAN/01', 'VAHAN/02', 'VAHAN/03', 'VAHAN/04', 'VAHAN/05', 'VAHAN/06',
  ])
})

test('every road API survives odd shapes without throwing', () => {
  const odd: unknown[] = [
    null, undefined, {}, [], 'text', 42, DOWN,
    { response: null, error: 'true', code: '400', message: 'Data format failed' },
    { response: [] }, { response: [null] }, { response: [{ response: [] }] },
    { response: [{ response: {} }] }, { response: [{ response: { vehicle: null, data: 5, DLinformation: 'x', dldetobj: 'x' } }] },
    { response: [{ response: '<xml>' }] }, { response: [{ response: '<a></a>' }] },
  ]
  for (const a of ROAD_APIS) {
    for (const o of odd) {
      const r = a.parse(o)
      assert.equal(typeof r.found, 'boolean', `${a.id} found`)
      assert.equal(typeof r.summary, 'string', `${a.id} summary`)
      assert.ok(Array.isArray(r.fields), `${a.id} fields`)
    }
    const d = a.parse(DOWN)
    assert.equal(d.found, false)
    assert.equal(d.tone, 'bad')
    assert.match(d.summary, /3rd party service is down/)
  }
})

// ------------------------------------------------------------ FASTAG/01

const FASTAG1_FOUND = wrap({
  result: 'SUCCESS', respCode: '000', ts: '2021-11-01T19:20:47',
  vehicle: {
    errCode: '000',
    vehltxnList: {
      totalTagsInMsg: '2', msgNum: '1', totalTagsInresponse: '2', totalMsg: '1',
      txn: [
        { readerReadTime: '2021-10-30 12:26:09.0', seqNo: 'a', laneDirection: 'N', tollPlazaGeocode: '11.0001,11.0001', tollPlazaName: 'GMR Chillakallu Toll Plaza', vehicleType: 'VC7', vehicleRegNo: 'MH19JK3923' },
        { readerReadTime: '2021-10-30 12:41:23.0', seqNo: 'b', laneDirection: 'N', tollPlazaGeocode: '11.0001,11.0001', tollPlazaName: 'GMR Chillakallu Toll Plaza', vehicleType: 'VC7', vehicleRegNo: 'MH19JK3923' },
      ],
    },
  },
})

test('FASTAG/01 found', () => {
  const r = api('FASTAG/01').parse(FASTAG1_FOUND)
  assert.equal(r.found, true)
  assert.equal(r.tone, 'info')
  assert.equal(r.summary, 'Truck MH19JK3923 last crossed GMR Chillakallu Toll Plaza on 30 Oct 2021, 12:41.')
  assert.equal(r.tables![0].rows.length, 2)
  assert.deepEqual(r.tables![0].rows[0], ['GMR Chillakallu Toll Plaza', '30 Oct 2021, 12:41', 'North'])  // newest first
  assert.equal(r.extra!.lastPlaza, 'GMR Chillakallu Toll Plaza')
  assert.equal(r.extra!.lastSeenAt, '2021-10-30T12:41:23')
})

test('FASTAG/01 single crossing as an object, not a list', () => {
  const r = api('FASTAG/01').parse(wrap({ result: 'SUCCESS', vehicle: { errCode: '000', vehltxnList: { txn: { readerReadTime: '2021-10-30 12:26:09.0', tollPlazaName: 'ABC Plaza', vehicleRegNo: 'MH04AB1234' } } } }))
  assert.equal(r.found, true)
  assert.match(r.summary, /MH04AB1234 last crossed ABC Plaza/)
})

test('FASTAG/01 not found', () => {
  const r = api('FASTAG/01').parse(wrap({ result: 'FAILURE', respCode: '000', ts: '2022-02-15T11:34:31', vehicle: { errCode: '740' } }))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
})

test('FASTAG/01 inputs match the document format', () => {
  clean('FASTAG/01', { vehiclenumber: 'GA060000' })
  clean('FASTAG/01', { vehiclenumber: 'mh 04 ab 1234' })
  assert.ok(!api('FASTAG/01').inputs[0].pattern.test('AB12'))
  assert.ok(!api('FASTAG/01').inputs[0].pattern.test('MH04AB123456'))  // 12 chars is between the two allowed ranges
})

// ------------------------------------------------------------ FASTAG/02

const pairs = (o: Record<string, string>) => ({ detail: Object.entries(o).map(([name, value]) => ({ name, value })) })
const tag = (extra: Record<string, string>) => pairs({
  TAGID: '34161FA82033E764D9F45341', REGNUMBER: 'MP09HF4987', TID: 'T', VEHICLECLASS: 'VC11', TAGSTATUS: 'A',
  ISSUEDATE: '2019-10-11', EXCCODE: '00', BANKID: '652210', COMVEHICLE: 'T', ...extra,
})
const fastag2 = (...tags: unknown[]) => wrap({ result: 'SUCCESS', successReqCnt: '1', totReqCnt: '1', respCode: '000', ts: 't', vehicle: { errCode: '000', vehicledetails: tags } })

test('FASTAG/02 found (document sample 6: three tags, one active)', () => {
  const r = api('FASTAG/02').parse(fastag2(
    tag({ TAGID: '34161FA820328972020FB320', TAGSTATUS: 'I', EXCCODE: '06', ISSUEDATE: '2017-07-14' }),
    tag({ TAGID: '34161FA8203289720E14EEA0', TAGSTATUS: 'I', EXCCODE: '06', ISSUEDATE: '2019-01-09' }),
    tag({}),
  ))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.match(r.summary, /FASTag for MP09HF4987 is active \(1 of 3 tags/)
  assert.equal(r.tables![0].rows.length, 3)
  assert.equal((r.extra!.activeTagIds as string[])[0], '34161FA82033E764D9F45341')
})

test('FASTAG/02 flags blacklisted, low balance and no active tag', () => {
  const bl = api('FASTAG/02').parse(fastag2(tag({ EXCCODE: '01' })))
  assert.equal(bl.tone, 'bad')
  assert.match(bl.summary, /BLACKLISTED/)
  assert.equal(bl.extra!.blacklisted, true)
  const low = api('FASTAG/02').parse(fastag2(tag({ EXCCODE: '03' })))
  assert.equal(low.tone, 'bad')
  assert.match(low.summary, /LOW/)
  const none = api('FASTAG/02').parse(fastag2(tag({ TAGSTATUS: 'I', EXCCODE: '06' })))
  assert.equal(none.tone, 'bad')
  assert.match(none.summary, /No active FASTag/)
})

test('FASTAG/02 not found and empty-input message', () => {
  const nf = api('FASTAG/02').parse(wrap({ result: 'FAILURE', successReqCnt: '0', totReqCnt: '1', respCode: '239', ts: 't', vehicle: { errCode: '239' } }))
  assert.equal(nf.found, false)
  assert.equal(nf.tone, 'warn')
  const empty = api('FASTAG/02').parse(wrap('vehiclenumber or tagid :must not be Empty or null, Please enter vehiclenumber or tagid', 'ERROR'))
  assert.equal(empty.found, false)
  assert.equal(empty.tone, 'bad')
})

test('FASTAG/02 inputs and request body', () => {
  clean('FASTAG/02', { vehiclenumber: 'MP09HF4987' })
  clean('FASTAG/02', { tagid: '34161FA8203286140F4064E0' })
  assert.deepEqual(api('FASTAG/02').buildBody!({ tagid: '34161FA8203286140F4064E0' }), { vehiclenumber: '', tagid: '34161FA8203286140F4064E0' })
  assert.deepEqual(api('FASTAG/02').buildBody!({ vehiclenumber: 'MP09HF4987' }), { vehiclenumber: 'MP09HF4987', tagid: '' })
})

// ------------------------------------------------------------ VAHAN XML (01, 02, 03)

const xmlBody = (xml: string) => ({ response: [{ response: xml, responseStatus: 'SUCCESS', message: null }], error: 'false', code: '200', message: 'Success' })
const XML_NOT_FOUND = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<VehicleDetails>\n <stautsMessage>Vehicle Data Not Found</stautsMessage>\n</VehicleDetails>\n'
// the document sample has an insurance date in 2020 (expired) and fitness in 2032
const XML_ALL_GOOD = VAHAN_XML.replace('15-Sep-2020', '15-Sep-2099')

for (const id of ['VAHAN/01', 'VAHAN/02', 'VAHAN/03']) {
  test(`${id} found (document sample: insurance expired)`, () => {
    const r = api(id).parse(xmlBody(VAHAN_XML))
    assert.equal(r.found, true)
    assert.equal(r.tone, 'bad')
    assert.match(r.summary, /^UP91L0001: insurance expired on 15 Sep 2020/)
    const f = Object.fromEntries(r.fields.map((x) => [x.label, x.value]))
    assert.equal(f['RC status'], 'ACTIVE')
    assert.equal(f['Insurance valid until'], '15 Sep 2020 (expired)')
    assert.equal(f['Fitness valid until'], '25 Jan 2032')
    assert.equal(f['Maker and model'], 'HONDA MOTORCYCLE AND SCOOTER INDIA (P) LTD - HONDA ACTIVA')
    assert.equal(r.extra!.insuranceUpto, '2020-09-15')
    assert.equal(r.extra!.fitnessUpto, '2032-01-25')
    assert.equal(r.extra!.blacklisted, false)
  })

  test(`${id} good when all papers are in date`, () => {
    const r = api(id).parse(xmlBody(XML_ALL_GOOD))
    assert.equal(r.tone, 'good')
    assert.match(r.summary, /^Vehicle UP91L0001 is active; fitness, insurance in date/)
  })

  test(`${id} not found`, () => {
    const r = api(id).parse(xmlBody(XML_NOT_FOUND))
    assert.equal(r.found, false)
    assert.equal(r.tone, 'warn')
  })
}

test('VAHAN XML: blacklisted, not-active RC and broken XML', () => {
  const bl = api('VAHAN/01').parse(xmlBody(XML_ALL_GOOD.replace('<rc_blacklist_status></rc_blacklist_status>', '<rc_blacklist_status>Y</rc_blacklist_status>')))
  assert.equal(bl.tone, 'bad')
  assert.match(bl.summary, /BLACKLISTED/)
  const inactive = api('VAHAN/01').parse(xmlBody(XML_ALL_GOOD.replace('<rc_status>ACTIVE</rc_status>', '<rc_status>SCRAPPED</rc_status>')))
  assert.equal(inactive.tone, 'bad')
  assert.match(inactive.summary, /RC is not active/)
  const broken = api('VAHAN/01').parse(xmlBody('<VehicleDetails><rc_regn_no>UP91L0001</rc_regn_no><rc_status>ACT'))
  assert.equal(typeof broken.summary, 'string')
})

test('xmlTag helper reads tags, empty tags and entities', () => {
  assert.equal(_internal.xmlTag(VAHAN_XML, 'rc_regn_no'), 'UP91L0001')
  assert.equal(_internal.xmlTag(VAHAN_XML, 'rc_financer'), null)
  assert.equal(_internal.xmlTag('<a>A &amp; B</a>', 'a'), 'A & B')
  assert.equal(_internal.xmlTag('nothing', 'a'), null)
})

test('VAHAN/01-03 inputs match the document format', () => {
  clean('VAHAN/01', { vehiclenumber: 'UP91L0001' })
  clean('VAHAN/02', { chasisnumber: ' ME4JF509AH7069705' })   // the document example has a leading space
  clean('VAHAN/03', { enginenumber: 'JF50E76069768' })
  assert.ok(!api('VAHAN/01').inputs[0].pattern.test('AB1'))
})

// ------------------------------------------------------------ VAHAN JSON (04, 05, 06)

const VAHAN_JSON = {
  stautsMessage: 'OK', stateCd: 'UP', rtoCd: '91', rcRegnNo: 'UP91L0001', rcRegnDt: '26-Jan-2017', rcPurchaseDt: '24-Jan-2017',
  rcChasiNo: 'ME4JF509AH70*****', rcEngNo: 'JF50E760*****', rcVhClassDesc: 'M-Cycle/Scooter',
  rcMakerDesc: 'HONDA MOTORCYCLE AND SCOOTER INDIA (P) LTD', rcMakerModel: 'HONDA ACTIVA', rcBodyTypeDesc: 'SOLO', rcFuelDesc: 'PETROL',
  rcColor: 'P A WHITE', rcOwnerName: 'R***L K***R', rcPermanentAddress: ', 999999', rcPresentAddress: ', 999999', rcFitUpto: '25-Jan-2032',
  rcNormsDesc: 'BHARAT STAGE II', rcFinancer: '', rcRegisteredAt: 'HAMIRPUR(UP), Uttar Pradesh', rcStatusAsOn: '03-Feb-2026 05:02:62604',
  rcManuMonthYr: '1/2017', rcUnldWt: '108', rcVchCatg: '2WN', rcGvw: '269', rcNoCyl: '1', rcCubicCap: '109.00', rcSeatCap: '2',
  rcWheelbase: '1230', rcStandCap: '0', rcSleeperCap: '', rcOwnerSr: '1', rcPuccUpto: '', rcPuccNo: '', rcBlacklistStatus: '',
  rcNocDetails: '', rcNocDt: '', rcVhClass: 1, rcVhType: 'N', rcFuelCd: '1', rcMakerCd: '36', rcModelCd: 'HONDA ACTIVA', rcSaleAmt: '51129',
  rcRegnUpto: '25-Jan-2032', rcOwnCatgDesc: 'OTHERS', rcVchCatgDesc: 'TWO WHEELER(NT)', rcOwnerCdDesc: 'INDIVIDUAL', rcPassengerTax: '',
  rcGoodsTax: '', rcOwnerHistory: [{ stateCd: '', offName: '', ownerSr: 0, ownerName: '' }], rcTaxUpto: '25-Jan-2032', rcTaxMode: 'L',
  rcInsuranceComp: 'HDFC ERGO General Insurance Company Ltd', rcInsurancePolicyNo: '2320100501934300000', rcInsuranceUpto: '15-Sep-2020',
  rcStatus: 'ACTIVE',
}
const JSON_NOT_FOUND = { response: [{ response: null, responseStatus: 'ERROR', message: { id: null, code: '231', params: null, text: 'Vehicle Details not Found' } }], error: 'false', code: '200', message: 'Success' }

for (const id of ['VAHAN/04', 'VAHAN/05', 'VAHAN/06']) {
  test(`${id} found (document sample: insurance expired)`, () => {
    const r = api(id).parse(wrap(VAHAN_JSON))
    assert.equal(r.found, true)
    assert.equal(r.tone, 'bad')
    assert.match(r.summary, /^UP91L0001: insurance expired on 15 Sep 2020/)
    const f = Object.fromEntries(r.fields.map((x) => [x.label, x.value]))
    assert.equal(f['Vehicle class'], 'M-Cycle/Scooter')
    assert.equal(f['RC valid until'], '25 Jan 2032')
    assert.equal(f['PUC valid until'], undefined)   // empty, so dropped
  })

  test(`${id} not found`, () => {
    const r = api(id).parse(JSON_NOT_FOUND)
    assert.equal(r.found, false)
    assert.equal(r.tone, 'warn')
    assert.match(r.summary, /Vehicle Details not Found/)
  })
}

test('VAHAN JSON: expired fitness, PUC and permit are flagged, good case is good', () => {
  const good = { ...VAHAN_JSON, rcInsuranceUpto: '15-Sep-2099', rcPuccUpto: '01-01-2099' }
  const g = api('VAHAN/04').parse(wrap(good))
  assert.equal(g.tone, 'good')
  assert.match(g.summary, /fitness, insurance, PUC in date/)
  const bad = api('VAHAN/04').parse(wrap({ ...good, rcFitUpto: '01-Jan-2020', rcPuccUpto: '02-Jan-2021', rcPermitValidUpto: '03-Feb-2022' }))
  assert.equal(bad.tone, 'bad')
  assert.match(bad.summary, /fitness expired on 1 Jan 2020; PUC expired on 2 Jan 2021; permit expired on 3 Feb 2022/)
  const bl = api('VAHAN/04').parse(wrap({ ...good, rcBlacklistStatus: 'BLACKLISTED' }))
  assert.equal(bl.tone, 'bad')
  assert.equal(bl.extra!.blacklisted, true)
})

test('VAHAN/04-06 inputs match the document format', () => {
  clean('VAHAN/04', { vehiclenumber: 'UP91L0001' })
  clean('VAHAN/05', { chasisnumber: ' ME4JF509AH7069705' })
  clean('VAHAN/06', { enginenumber: 'JF50E76069768' })
  assert.ok(!api('VAHAN/05').inputs[0].pattern.test('ABC'))   // minimum 5
})

// ------------------------------------------------------------ SARATHI

const SARATHI2_FOUND = wrap({
  DLinformation: {
    Classofcovs: [
      { CovDiscription: 'Motor Cycle with Gear(Non Transport)', CovCode: 3 },
      { CovDiscription: 'LIGHT MOTOR VEHICLE', CovCode: 4 },
      { CovDiscription: 'Transport Vehicle-M/HMV (Goods and Passenger)', CovCode: 10 },
    ],
    NonTransportValidityTodate: '27-04-2031',
    TransportValidityTodate: '16-02-2099',
    DL_Holder_FullName: 'TEST NAME',
    DL_status: 'Active.',
  },
})

test('SARATHI/02 found: valid for trucks', () => {
  const r = api('SARATHI/02').parse(SARATHI2_FOUND)
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'Licence is valid for driving trucks until 16 Feb 2099 (status Active).')
  assert.equal(r.tables![0].rows.length, 3)
  assert.equal(r.extra!.transportValidUpto, '2099-02-16')
})

test('SARATHI/02 document sample dates (transport until 16-02-2028)', () => {
  const doc = JSON.parse(JSON.stringify(SARATHI2_FOUND))
  doc.response[0].response.DLinformation.TransportValidityTodate = '16-02-2028'
  const r = api('SARATHI/02').parse(doc)
  assert.equal(r.found, true)
  assert.equal(r.tone, new Date() > new Date(2028, 1, 17) ? 'bad' : 'good')
})

test('SARATHI/02 expired transport validity, suspended, and no transport class', () => {
  const info = (SARATHI2_FOUND.response[0].response as any).DLinformation
  const mk = (patch: Record<string, unknown>) => wrap({ DLinformation: { ...info, ...patch } })
  const exp = api('SARATHI/02').parse(mk({ TransportValidityTodate: '16-02-2020' }))
  assert.equal(exp.tone, 'bad')
  assert.match(exp.summary, /transport validity \(for trucks\) expired on 16 Feb 2020/)
  const susp = api('SARATHI/02').parse(mk({ DL_status: 'Suspended' }))
  assert.equal(susp.tone, 'bad')
  const none = api('SARATHI/02').parse(mk({ TransportValidityTodate: '' }))
  assert.equal(none.tone, 'warn')
  assert.match(none.summary, /no transport/)
})

test('SARATHI/02 does not show private data', () => {
  const r = api('SARATHI/02').parse(SARATHI2_FOUND)
  const labels = r.fields.map((f) => f.label.toLowerCase()).join('|')
  assert.ok(!/aadhaar|photo|mobile|address/.test(labels))
})

test('SARATHI/02 not found', () => {
  const r = api('SARATHI/02').parse(wrap({ errormessage: 'Details not Found For Given DLNumber', errorcode: -1 }))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
})

const SARATHI1_NOT_FOUND = wrap({
  dldetobj: [{
    transReqObj: null, dlTest: null, dlEndorsementObj: null, objections: null, psvBadgeissued: null, dbLoc: 'National Register',
    dlHzHillObj: null, errorcd: -1, dlCovHistObj: null, dlcovs: null, bioObj: null, idIdpIssuedpPojo: null, dlobj: null,
    erormsg: 'No Details are available.', bioImgObj: null, dlHistObj: null,
  }],
})

test('SARATHI/01 not found (document sample)', () => {
  const r = api('SARATHI/01').parse(SARATHI1_NOT_FOUND)
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
})

// The document has no found sample (it is in a Word file we do not have). This shape follows the field names
// used by the old sarathi-dl-full function: dldetobj[0].dlobj, bioObj, dlcovs.
test('SARATHI/01 found (built shape: dlobj / bioObj / dlcovs)', () => {
  const r = api('SARATHI/01').parse(wrap({
    dldetobj: [{
      errorcd: 0, erormsg: null,
      bioObj: { bioFullName: 'TEST NAME', bioMobileNo: '9999999999', bioPermAdd1: 'SOME ADDRESS', bioAadhaarNo: '123412341234' },
      bioImgObj: { biPhoto: 'AAAA' },
      dlobj: { dlStatus: 'ACTIVE', dlIssuedt: '2012-03-01', dlRtoCode: 'GJ04', dlNtValdfrDt: '2012-03-01', dlNtValdtoDt: '2032-03-01', dlTrValdfrDt: '2020-01-10', dlTrValdtoDt: '2099-01-09' },
      dlcovs: [{ covdesc: 'LIGHT MOTOR VEHICLE', covabbrv: 'LMV', covcd: 4 }],
    }],
  }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'Licence is valid for driving trucks until 9 Jan 2099 (status ACTIVE).')
  const dump = JSON.stringify(r)
  assert.ok(!dump.includes('9999999999') && !dump.includes('123412341234') && !dump.includes('AAAA') && !dump.includes('SOME ADDRESS'))
})

test('SARATHI/01 unknown found shape still says found when the record has content', () => {
  const r = api('SARATHI/01').parse(wrap({ dldetobj: [{ errorcd: 0, someNewKey: 'value' }] }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'info')
})

test('SARATHI inputs match the document format', () => {
  clean('SARATHI/01', { dlnumber: 'GJ04 20120005008', dob: '1987-05-26' })
  clean('SARATHI/02', { dlnumber: 'UP9620110001440' })
  assert.ok(!api('SARATHI/01').inputs[1].pattern.test('26-05-1987'))
  assert.ok(!api('SARATHI/01').inputs[1].pattern.test('1987-13-01'))
  // a joined number gets the space ULIP wants for SARATHI/01
  assert.deepEqual(api('SARATHI/01').buildBody!({ dlnumber: 'gj0420120005008', dob: '1987-05-26' }), { dlnumber: 'GJ04 20120005008', dob: '1987-05-26' })
  assert.deepEqual(api('SARATHI/01').buildBody!({ dlnumber: 'GJ04 20120005008', dob: '1987-05-26' }), { dlnumber: 'GJ04 20120005008', dob: '1987-05-26' })
})

// ------------------------------------------------------------ ECHALLAN/01

const challan = (no: string, status: string, fine: string, when: string) => ({
  challan_place: 'test', owner_name: 'T**T P*T L*D', challan_date_time: when, fine_imposed: fine, challan_no: no, challan_status: status,
  remark: 'NA', offence_details: [{ act: 'S130(4)', name: 'Fitness certificate (CF) of a transport vehicle not produced on demand' }],
})

test('ECHALLAN/01 found: pending fines (document sample)', () => {
  const r = api('ECHALLAN/01').parse(wrap({
    data: {
      Disposed_data: [challan('KL48648220311113821', 'Disposed', '1', '11-03-2022 11:38:21'), challan('KL48648220225112001', 'Disposed', '1', '25-02-2022 11:20:01')],
      Pending_data: [challan('KL548476230713105383', 'Pending', '7750', '01-09-2023 17:36:00'), challan('KL48648220311114937', 'Pending', '1', '11-03-2022 11:49:37')],
    },
    message: 'Record finds successfully', status: '200',
  }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'bad')
  assert.equal(r.summary, '2 pending challans, ₹7,751.')
  assert.equal(r.tables![0].title, 'Pending challans')
  assert.equal(r.tables![0].rows.length, 2)
  assert.equal(r.tables![0].rows[0][1], '1 Sep 2023, 17:36')
  assert.equal(r.tables![0].rows[0][4], '₹7,750')
  assert.equal(r.extra!.pendingAmount, 7751)
  assert.equal(r.fields.find((f) => f.label === 'Oldest pending challan')!.value, '11 Mar 2022, 11:49')
})

test('ECHALLAN/01 only paid challans means nothing pending', () => {
  const r = api('ECHALLAN/01').parse(wrap({ data: { Disposed_data: [challan('A', 'Disposed', '500', '11-03-2022 11:38:21')], Pending_data: [] } }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'No pending challans (1 already paid or closed).')
})

test('ECHALLAN/01 not found (no records) is good news', () => {
  const r = api('ECHALLAN/01').parse(wrap({ code: '305', message: 'No Records Found!' }))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'good')
  assert.match(r.summary, /^No pending challans/)
})

test('ECHALLAN/01 Indian money format', () => {
  assert.equal(_internal.inr(4500), '₹4,500')
  assert.equal(_internal.inr(1234567), '₹12,34,567')
  assert.equal(_internal.inr(99), '₹99')
})

test('ECHALLAN/01 inputs match the document format', () => {
  clean('ECHALLAN/01', { vehicleNumber: 'UP15AU1291' })
  clean('ECHALLAN/01', { vehicleNumber: 'up93bk9110' })
})

// ------------------------------------------------------------ EWAYBILL/01

test('EWAYBILL/01 found (document sample: validUpto has time only)', () => {
  const r = api('EWAYBILL/01').parse(wrap({
    fromPincode: 301404, hsnCode: '', ewayBillDate: '29/11/2017 04:30:00 PM', validUpto: ' 11:59:00 PM', ewbNo: 101000609218, toPincode: 302014,
    VehiclListDetails: [{ vehicleNo: 'RJ14CG4508', enteredDate: '29/11/2017 04:30:00 PM', transMode: '1' }], status: 'ACT',
  }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')   // no date to compare, status ACT
  assert.match(r.summary, /E-way bill 101000609218 is active/)
  assert.deepEqual(r.tables![0].rows[0], ['RJ14CG4508', '29 Nov 2017, 16:30', 'Road'])
  assert.deepEqual(r.extra!.truckNumbers, ['RJ14CG4508'])
})

test('EWAYBILL/01 staging shape with full validUpto date: expired', () => {
  const r = api('EWAYBILL/01').parse(wrap({
    fromPincode: 301404, hsnCode: '', ewayBillDate: '29/11/2017 04:30:00 PM', validUpto: '29/11/2017 11:59:00 PM', ewbNo: 101000609218, toPincode: 302014,
    VehiclListDetails: [{ vehicleNo: 'RJ14CG4508', enteredDate: '29/11/2017 04:30:00 PM', transMode: '1' }], status: 'ACT', errorCodes: null,
  }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'bad')
  assert.equal(r.summary, 'E-way bill 101000609218 expired on 29 Nov 2017, 23:59.')
  assert.equal(r.extra!.validUpto, '2017-11-29')
})

test('EWAYBILL/01 still valid, and cancelled', () => {
  const base = { ewbNo: 101000609218, ewayBillDate: '29/11/2099 04:30:00 PM', validUpto: '02/12/2099 11:59:00 PM', status: 'ACT', VehiclListDetails: [] }
  const ok = api('EWAYBILL/01').parse(wrap(base))
  assert.equal(ok.tone, 'good')
  assert.equal(ok.summary, 'E-way bill 101000609218 is valid until 2 Dec 2099, 23:59.')
  const cnl = api('EWAYBILL/01').parse(wrap({ ...base, status: 'CNL' }))
  assert.equal(cnl.tone, 'bad')
  assert.match(cnl.summary, /cancelled/)
})

test('EWAYBILL/01 accepts a record wrapped in a list', () => {
  const r = api('EWAYBILL/01').parse(wrap([{ ewbNo: 101000609218, validUpto: '02/12/2099 11:59:00 PM', status: 'ACT' }]))
  assert.equal(r.found, true)
})

test('EWAYBILL/01 not found', () => {
  const r = api('EWAYBILL/01').parse(wrap({ errorCodes: '404' }, 'ERROR'))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
})

test('EWAYBILL/01 inputs match the document format', () => {
  clean('EWAYBILL/01', { ewbNo: '101000609218' })
  assert.ok(!api('EWAYBILL/01').inputs[0].pattern.test('1010006092'))
})

// ------------------------------------------------------------ TOLL/01

const TUNDLA = {
  lcvRateMulti: 260, hcmEmeMonthly: 19085, latitude: 27.218247, multiAxlerateMulti: 595, sevenOrMoreExelSingle: 695, fourToSixExelCommReg: 285,
  sevenOrMoreExelReturn: 1045, dtEffectiveRates: '01-10-2025', fourToSixExelReturn: 860, lcvRateSingle: 175, hcmEmeSingle: 575,
  stateName: 'UTTAR PRADESH', lcvRateMth: 5810, tollName: 'Tundla', carRateMth: 3595, piu: 'AGRA', longitude: 78.272821, lcvRateCommReg: 85,
  busRateMth: 12170, fourToSixExelMonthly: 19085, carRateCommReg: 55, fourToSixExelSingle: 575, hcmEmeReturn: 860, carRateMulti: 160,
  busRateCommReg: 185, busRateSingle: 365, hcmEmeCommReg: 285, multiAxlerateSingle: 400, sevenOrMoreExelMonthly: 23235, dtRateRevision: '31-03-2026',
  tollCode: 180001, multiAxlerateCommReg: 200, multiAxlerateMth: 13280, sevenOrMoreExelCommReg: 350, busRateMulti: 550, ro: 'LUCKNOW (UP WEST)', carRateSingle: 110,
}

test('TOLL/01 found: one plaza, 7+ axle and multi-axle first (document sample)', () => {
  const r = api('TOLL/01').parse(wrap([TUNDLA]))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'info')
  assert.equal(r.summary, 'Tundla (UTTAR PRADESH): ₹695 one way for a 7+ axle truck, ₹400 for a multi-axle truck.')
  assert.equal(r.fields[0].value, 'Tundla')
  assert.equal(r.fields.find((f) => f.label === '7+ axle truck, one way')!.value, '₹695')
  assert.equal(r.fields.find((f) => f.label === 'Rates from')!.value, '1 Oct 2025')
  assert.equal(r.tables![0].rows.length, 1)
})

test('TOLL/01 staging shape (2026 rates, ro and piu null)', () => {
  const r = api('TOLL/01').parse(wrap([{ ...TUNDLA, ro: null, piu: null, dtEffectiveRates: '01-04-2026', dtRateRevision: '31-03-2027', sevenOrMoreExelSingle: 735, multiAxlerateSingle: 420 }]))
  assert.equal(r.found, true)
  assert.match(r.summary, /₹735 one way for a 7\+ axle truck, ₹420 for a multi-axle truck/)
})

test('TOLL/01 many plazas make a table', () => {
  const r = api('TOLL/01').parse(wrap([TUNDLA, { ...TUNDLA, tollName: 'Other Plaza', tollCode: 5 }]))
  assert.equal(r.found, true)
  assert.equal(r.tables![0].rows.length, 2)
  assert.match(r.summary, /^2 toll plazas found/)
  assert.equal((r.extra!.plazas as unknown[]).length, 2)
})

test('TOLL/01 not found and the "more than one input" message', () => {
  const nf = api('TOLL/01').parse(wrap([]))
  assert.equal(nf.found, false)
  assert.equal(nf.tone, 'warn')
  const two = api('TOLL/01').parse(wrap('Input variable cannot be more than one it should be either tollCode or tollName or stateName', 'ERROR'))
  assert.equal(two.found, false)
  assert.equal(two.tone, 'bad')
})

test('TOLL/01 inputs and request body', () => {
  clean('TOLL/01', { tollCode: '180001' })
  clean('TOLL/01', { tollName: 'Tundla' })
  clean('TOLL/01', { stateName: 'UTTAR PRADESH' })
  assert.deepEqual(api('TOLL/01').buildBody!({ tollCode: '180001' }), { tollCode: '180001', tollName: '', stateName: '' })
  assert.ok(!api('TOLL/01').inputs[0].pattern.test('12345678'))
})
