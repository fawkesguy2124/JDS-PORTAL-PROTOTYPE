// Run: node --experimental-strip-types --test supabase/functions/ulip/apis/pcs.test.ts
// Samples are copied from the official ULIP PCS document (truncated ones closed minimally).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PCS_APIS } from './pcs.ts'

const api = (id: string) => PCS_APIS.find((a) => a.id === id)!
const wrap = (inner: unknown) => ({
  response: [{ response: inner, responseStatus: 'SUCCESS', message: null }],
  error: 'false', code: '200', message: 'Success',
})
const down = { response: [{ response: 'X - 3rd party service is down!', responseStatus: 'ERROR' }], error: 'true' }

const nullRow = (keys: string[]) => ({ ...Object.fromEntries(keys.map((k) => [k, null])), responseMsg: 'not found' })

test('PCS ids and bodies carry the constant interfaceName', () => {
  assert.deepEqual(PCS_APIS.map((a) => a.id), ['PCS/01', 'PCS/02', 'PCS/03', 'PCS/04', 'PCS/05'])
  assert.deepEqual(api('PCS/01').buildBody!({ igmNumber: '1' }), { interfaceName: 'CHPOI03', igmNumber: '1' })
  assert.deepEqual(api('PCS/02').buildBody!({ sbNumber: '1' }), { interfaceName: 'CHPOE05', sbNumber: '1' })
  assert.deepEqual(api('PCS/03').buildBody!({ sbNumber: '1' }), { interfaceName: 'CHPOE07', sbNumber: '1' })
  assert.deepEqual(api('PCS/04').buildBody!({ boeNumber: '1' }), { interfaceName: 'CHPOI09', boeNumber: '1' })
  assert.deepEqual(api('PCS/05').buildBody!({ boeNumber: '1' }), { interfaceName: 'CHPOI10', boeNumber: '1' })
  for (const a of PCS_APIS) assert.ok(!a.inputs.some((i) => i.key === 'interfaceName'))
})

test('PCS/01 found', () => {
  const r = api('PCS/01').parse(wrap([{
    voyage_no: '909E', bill_date: '30012023', port_of_arrival: 'INMUN1', goods_description: 'PATCRGIDH',
    port_of_loading: 'JPYOK', bill_no: '010DW06169', total_no_of_packages: '29', mode_of_transport: null,
    sub_line_number: '0', container_seal_no: 'WHLU045961', line_number: '40', container_no: 'WHSU6942383',
    number_of_packages: '55', container_weight: 25.65, terminal_operator_code: 'INMUN1MCT1', nature_of_cargo: 'C',
    responseMsg: 'SUCCESS', shipping_line_code: 'AAFCT5861J', port_of_destination: 'INMUN1', line_no: '40',
    custom_house_code: 'INMUN1', grossWeight: 50847, expected_date_and_time_of_arrival: '02032023:21:18',
    sub_line_no: '0', igm_date: '27022023', shipping_agent_code: 'AAFCT5861J', cargo_imo_code: 'ZZZ',
    igm_no: '2336612', iso_code: '4410', port_of_discharge: 'INMUN1SMS1',
  }]))
  assert.equal(r.found, true)
  assert.equal(r.summary, 'IGM 2336612 found with 1 container, filed 27 Feb 2023.')
  assert.equal(r.fields[0].label, 'IGM number')
  assert.ok(r.fields.some((f) => f.label === 'Expected arrival' && f.value === '2 Mar 2023, 21:18'))
  assert.deepEqual(r.extra, { igmNo: '2336612', igmDate: '2023-02-27', containerNumbers: ['WHSU6942383'] })
  assert.equal(r.tables![0].rows[0][0], 'WHSU6942383')
})

test('PCS/01 not found', () => {
  const r = api('PCS/01').parse(wrap([nullRow(['igm_no', 'igm_date', 'container_no', 'grossWeight'])]))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
})

test('PCS/02 found', () => {
  const r = api('PCS/02').parse(wrap([{
    grossQuantity: 736.4, sbNo: '9023937', natureOfCargo: 'P', portOfOrigin: 'INNSA1', portOfDestination: 'MXLZC',
    unitOfQuantity: 'KGS', totalNoOfPackages: '263', chaCode: 'AAECS5612BCH001', sbDate: '02042023', responseMsg: 'SUCCESS',
  }]))
  assert.equal(r.found, true)
  assert.equal(r.summary, 'Shipping bill 9023937 found, dated 2 Apr 2023.')
  assert.ok(r.fields.some((f) => f.label === 'Gross quantity' && f.value === '736.4 KGS'))
})

test('PCS/02 not found', () => {
  const r = api('PCS/02').parse(wrap([nullRow(['sbNo', 'sbDate', 'grossQuantity', 'chaCode'])]))
  assert.equal(r.found, false)
  assert.equal(r.summary, 'No record found for this shipping bill number.')
})

test('PCS/03 found with LEO', () => {
  const r = api('PCS/03').parse(wrap([{
    leoDate: '03042023', rotationDate: '31032023', natureOfCargo: 'C', rotationNo: '269212',
    sbNumber: '8932488', sbDate: '30032023', responseMsg: 'SUCCESS',
  }]))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'Shipping bill 8932488 found. LEO given on 3 Apr 2023.')
  assert.equal((r.extra as any).leoDate, '2023-04-03')
})

test('PCS/03 found but no LEO yet', () => {
  const r = api('PCS/03').parse(wrap([{ sbNumber: '8932488', sbDate: '30032023', leoDate: null, responseMsg: 'SUCCESS' }]))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'warn')
})

test('PCS/03 not found', () => {
  const r = api('PCS/03').parse(wrap([nullRow(['sbNumber', 'sbDate', 'leoDate', 'rotationNo'])]))
  assert.equal(r.found, false)
})

test('PCS/04 found', () => {
  const r = api('PCS/04').parse(wrap([{
    items_IgmNo: '2337849', items_BillOfEntryDate: '07032023', sublineNo: '1', igmNo: '2337849', natureOfCargo: 'CP',
    items_IgmDate: '13032023', items_sub_line_number: '1', igmDate: '13032023', numberOfPackages: '10',
    sub_line_number: '1', grossWeight: 3600, lineNo: '89', customHouseCode: 'INKAT1', line_number: '89',
    billOfEntryNo: '4940717', container_no: 'BSIU2568595', countryOfOrigin: 'CN', items_line_number: '89',
    chaCode: 'AAKFG4453HCH001', unitOfQuantity: 'KGS', items_BillOfEntryNo: '4940717', billOfEntryDate: '07032023',
    responseMsg: 'SUCCESS',
  }]))
  assert.equal(r.found, true)
  assert.equal(r.summary, 'BE 4940717 found, dated 7 Mar 2023, under IGM 2337849.')
  assert.deepEqual(r.extra, { beNo: '4940717', beDate: '2023-03-07', igmNo: '2337849', igmDate: '2023-03-13', containerNumbers: ['BSIU2568595'] })
})

test('PCS/04 not found', () => {
  const r = api('PCS/04').parse(wrap([nullRow(['billOfEntryNo', 'igmNo', 'container_no', 'grossWeight'])]))
  assert.equal(r.found, false)
})

test('PCS/05 found with OOC', () => {
  const r = api('PCS/05').parse(wrap([{
    subLineNo: '1', items_BillOfEntryDate: '21032023', igmNo: '2338556', out_of_charge_no: '2050911362',
    igmDate: '21032023', numberOfPackages: '40', out_of_charge_date: '28032023', sub_line_number: '1',
    lineNo: '139', line_number: '139', billOfEntryNo: '5159836', container_no: 'ESDU4016990',
    chaCode: 'ABWPV2386DCH001', items_BillOfEntryNo: '5159836', responseMsg: 'SUCCESS', items_SubLineNo: '1',
    items_IgmNo: '2338556', natureOfCargo: 'C', items_IgmDate: '21032023', items_CustomHouseCode: 'INNSA1',
    customHouseCode: 'INNSA1', items_LineNumber: '139', countryOfOrigin: 'VN', unitOfQuantity: 'KGS',
    billOfEntryDate: '21032023',
  }]))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'OOC granted on 28 Mar 2023 for BE 5159836.')
  assert.equal((r.extra as any).oocDate, '2023-03-28')
  assert.equal(r.fields[0].value, '2050911362')
})

test('PCS/05 found, OOC not yet', () => {
  const r = api('PCS/05').parse(wrap([{ billOfEntryNo: '5159836', out_of_charge_no: null, out_of_charge_date: null, responseMsg: 'SUCCESS' }]))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'warn')
})

test('PCS/05 not found', () => {
  const r = api('PCS/05').parse(wrap([nullRow(['billOfEntryNo', 'out_of_charge_no', 'igmNo'])]))
  assert.equal(r.found, false)
})

test('odd shapes never throw', () => {
  const bad400 = { response: null, error: 'true', code: '400', message: 'Data format failed\n\nFormat should follow [0-9]{1,10}' }
  for (const a of PCS_APIS) {
    for (const body of [null, undefined, {}, [], 'x', 5, down, bad400, { response: [] }, { response: [{}] },
      { response: [{ response: [null, 'a', 3] }] }, { response: [{ response: [] }] }]) {
      const r = a.parse(body as any)
      assert.equal(r.found, false, a.id)
      assert.ok(typeof r.summary === 'string' && r.summary.length > 0)
    }
    const d = a.parse(down)
    assert.equal(d.tone, 'bad')
    assert.match(d.summary, /service is down/)
  }
})

test('inputs match the document examples', () => {
  const ex: Record<string, [string, string]> = {
    'PCS/01': ['igmNumber', '2272354'], 'PCS/02': ['sbNumber', '7005705'], 'PCS/03': ['sbNumber', '2405125'],
    'PCS/04': ['boeNumber', '7274213'], 'PCS/05': ['boeNumber', '2219940'],
  }
  for (const [id, [key, val]] of Object.entries(ex)) {
    const inputs = api(id).inputs
    assert.equal(inputs.length, 1)
    assert.equal(inputs[0].key, key)
    assert.ok(inputs[0].pattern.test(val))
    assert.ok(!inputs[0].pattern.test('12AB'))
    assert.ok(!inputs[0].pattern.test(''))
    assert.ok(!inputs[0].pattern.test('12345678901'))
  }
})
