// Run: node --experimental-strip-types --test supabase/functions/ulip/apis/icegate_sea.test.ts
// Samples are copied from the official ULIP ICEGATE document.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ICEGATE_SEA_APIS } from './icegate_sea.ts'

const api = (id: string) => ICEGATE_SEA_APIS.find((a) => a.id === id)!
const wrap = (response: unknown) => ({
  response: [{ response, responseStatus: 'SUCCESS', message: null }],
  error: 'false', code: '200', message: 'Success',
})
const NOT_FOUND_ERR = wrap({ errCode: 'ERROR0004', errMsg: 'No Records Available' })
const DOWN = { response: [{ response: 'X - 3rd party service is down!', responseStatus: 'ERROR' }], error: 'true' }

const IDS = ['03', '01', '02', '04', '05', '06', '07', '08', '12', '13'].map((n) => `ICEGATE/${n}`)

test('all assigned ids exist', () => {
  for (const id of IDS) assert.ok(api(id), id)
  assert.equal(ICEGATE_SEA_APIS.length, 10)
})

test('odd shapes never throw', () => {
  for (const id of IDS) {
    for (const odd of [null, undefined, {}, [], 'text', { response: [] }, { response: [{}] }, DOWN, NOT_FOUND_ERR, wrap([]), wrap({})]) {
      const r = api(id).parse(odd)
      assert.equal(typeof r.summary, 'string', id)
      assert.equal(r.found, false, id)
    }
    const d = api(id).parse(DOWN)
    assert.equal(d.tone, 'bad')
    assert.match(d.summary, /service is down/)
  }
})

test('ICEGATE/01 found', () => {
  const r = api('ICEGATE/01').parse(wrap({
    voyageNo: 'NILLL', vesselType: 'C',
    containerNo: ['MLCU1234567', 'TRLU1234567', 'TTNU1234567', 'YMLU1234567'],
    expDtOfArrival: '12102018', portOfArrival: 'INCCU1', imoCodeOfVessel: '-', igmDt: '11102018',
    igmNo: 2001362, vesselCode: '394137', totalNoOfLines: 4, masterName: '.',
  }))
  assert.equal(r.found, true)
  assert.equal(r.summary, 'IGM 2001362 found: expected to arrive 12 Oct 2018 at INCCU1, 4 containers listed.')
  assert.equal(r.tables![0].rows.length, 4)
  assert.ok(!r.fields.some((f) => f.label === 'IMO number' || f.label === 'Master name'))
  assert.equal((r.extra as any).igmDate, '2018-10-11')
})

test('ICEGATE/01 not found', () => {
  const r = api('ICEGATE/01').parse(wrap({
    voyageNo: null, vesselType: null, containerNo: null, expDtOfArrival: null, portOfArrival: null,
    imoCodeOfVessel: null, igmDt: null, igmNo: null, vesselCode: null, totalNoOfLines: null, masterName: null,
  }))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
})

test('ICEGATE/01 and 07 inputs', () => {
  for (const id of ['ICEGATE/01', 'ICEGATE/07']) {
    const [no, dt] = api(id).inputs
    assert.ok(no.pattern.test('2001362') && no.pattern.test('1'))
    assert.ok(!no.pattern.test('') && !no.pattern.test('12345678'))
    assert.ok(dt.pattern.test('11102018'))
    assert.equal(dt.kind, 'date8')
  }
})

test('ICEGATE/02 found', () => {
  const r = api('ICEGATE/02').parse(wrap({
    boeDetails: [{
      imoCode: '1000000', containerNo: ['MSCU7786602'], unitOfQt: 'MTS', igmDt: '04072011',
      natureOfCargo: 'C', countryOrig: 'BR', grossWt: 25.99, totNoPkg: 56,
    }],
  }))
  assert.equal(r.found, true)
  assert.deepEqual(r.tables![0].rows, [['MSCU7786602', '1']])
  assert.deepEqual(r.tables![1].rows, [['1', '56', '25.99 MTS', 'BR', 'C']])
  assert.equal(r.summary, 'BE cargo details found: 1 container, 56 packages.')
  assert.equal((r.extra as any).imoCode, undefined)
  assert.equal((r.extra as any).igmDate, '2011-07-04')
  assert.ok(r.fields.some((f) => f.label === 'Gross weight' && f.value === '25.99 MTS'))
  assert.ok(r.fields.some((f) => f.label === 'IMO (hazard) code'))
})

test('ICEGATE/02 not found', () => {
  const r = api('ICEGATE/02').parse(wrap({ boeDetails: [] }))
  assert.equal(r.found, false)
})

test('ICEGATE/02 inputs', () => {
  const [no, dt] = api('ICEGATE/02').inputs
  assert.ok(no.pattern.test('2002892') && !no.pattern.test('BE5787'))
  assert.ok(dt.pattern.test('16072011'))
})

test('ICEGATE/04 found', () => {
  const r = api('ICEGATE/04').parse(wrap({
    shippingLineCode: 'MSC', shippingAgentCode: 'JMB01', rotationNumber: '1000045', rotationDt: '24012020',
  }))
  assert.equal(r.found, true)
  assert.match(r.summary, /Rotation number 1000045 dated 24 Jan 2020/)
  assert.equal((r.extra as any).rotationDate, '2020-01-24')
})

test('ICEGATE/04 not found', () => {
  assert.equal(api('ICEGATE/04').parse(wrap({})).found, false)
})

test('ICEGATE/04 inputs', () => {
  const [site, imo, vessel, arr] = api('ICEGATE/04').inputs
  assert.ok(site.pattern.test('INBOM1') && !site.pattern.test('INBOM'))
  assert.ok(imo.pattern.test('9241205') && vessel.pattern.test('DCNT2'))
  assert.ok(!imo.pattern.test('') && !vessel.pattern.test('AB-C'))
  assert.ok(arr.pattern.test('15012020'))
  assert.equal(site.upper, true)
})

test('ICEGATE/05 found (with the string "null" from the document)', () => {
  const r = api('ICEGATE/05').parse(wrap({
    sbNo: '6845161', unitOfQt: 'null', natureOfCargo: 'C', noOfPkgs: 287, portOfDest: 'LKCMB', sbDt: '02042016', grossQt: null,
  }))
  assert.equal(r.found, true)
  assert.equal(r.summary, 'Shipping bill 6845161 found: 287 packages, going to LKCMB.')
  assert.ok(!r.fields.some((f) => f.label === 'Gross quantity'))
})

test('ICEGATE/05 not found', () => {
  const r = api('ICEGATE/05').parse(wrap({
    sbNo: null, unitOfQt: null, natureOfCargo: null, noOfPkgs: null, portOfDest: null, sbDt: null, grossQt: null,
  }))
  assert.equal(r.found, false)
})

test('ICEGATE/05 and 06 inputs', () => {
  for (const id of ['ICEGATE/05', 'ICEGATE/06']) {
    const [no, dt] = api(id).inputs
    assert.ok(no.pattern.test('6845161') && !no.pattern.test('123456'))
    assert.ok(dt.pattern.test('02042016'))
  }
})

test('ICEGATE/06 found is good', () => {
  const r = api('ICEGATE/06').parse(wrap({ leoDt: '23092011' }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'LEO given on 23 Sep 2011.')
  assert.equal((r.extra as any).leoDate, '2011-09-23')
})

test('ICEGATE/06 not found', () => {
  const r = api('ICEGATE/06').parse(wrap({ leoDt: null }))
  assert.equal(r.found, false)
  assert.equal(r.tone, 'warn')
})

test('ICEGATE/07 found', () => {
  const r = api('ICEGATE/07').parse(wrap({
    imoCodeOfVessel: '12345', vesselCode: 'TETS1', voyageNo: '03', portOfDest: 'INBOM1', portOfShipment: 'INPAV1',
    importerName: 'HINDUSTAN CARGO', modeOfTransport: 'T',
    containerDetails: [{ containerNo: 'MMAU1162485', totNoPkg: 1 }],
  }))
  assert.equal(r.found, true)
  assert.match(r.summary, /HINDUSTAN CARGO/)
  assert.deepEqual(r.tables![0].rows, [['MMAU1162485', '1']])
})

test('ICEGATE/07 not found', () => {
  const r = api('ICEGATE/07').parse(wrap({
    imoCodeOfVessel: null, vesselCode: null, voyageNo: null, portOfDest: null, portOfShipment: null,
    importerName: null, modeOfTransport: null, containerDetails: null,
  }))
  assert.equal(r.found, false)
})

test('ICEGATE/08 found', () => {
  const r = api('ICEGATE/08').parse(wrap({
    sbDetails: [
      { containerNo: ['GESU5599051'], sbNo: 6825667, noOfPckgs: 25, portOfDest: 'SAJED' },
      { containerNo: ['TCKU1732080'], sbNo: 6828170, noOfPckgs: 33, portOfDest: 'GBCHD' },
    ],
    egmNo: 21889, egmDt: '20112008',
  }))
  assert.equal(r.found, true)
  assert.equal(r.summary, 'EGM 21889 dated 20 Nov 2008 found with 2 shipping bills.')
  assert.deepEqual(r.tables![0].rows[0], ['6825667', 'GESU5599051', '25', 'SAJED'])
})

test('ICEGATE/08 not found', () => {
  const r = api('ICEGATE/08').parse(wrap({
    egmNo: null, egmDt: null, sbNo: null, portOfDest: null, noOfPckgs: null, containerNo: null,
  }))
  assert.equal(r.found, false)
})

test('ICEGATE/08 inputs (6-digit example from the document is allowed)', () => {
  const [no, dt] = api('ICEGATE/08').inputs
  assert.ok(no.pattern.test('103978') && no.pattern.test('21889'))
  assert.ok(!no.pattern.test('abc') && !no.pattern.test(''))
  assert.ok(dt.pattern.test('29032016'))
})

test('ICEGATE/12 found (masked sample)', () => {
  const r = api('ICEGATE/12').parse(wrap({
    expName: 'TEST NAME', sbType: 'F', egmNo: '3063019', egmDt: '28102024', iec: 'AM****7A', leoDt: '28102024', chaNo: 'SE****01',
  }))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'good')
  assert.equal(r.summary, 'Shipping bill found. LEO given on 28 Oct 2024.')
})

test('ICEGATE/12 not found', () => {
  assert.equal(api('ICEGATE/12').parse(NOT_FOUND_ERR).found, false)
  assert.equal(api('ICEGATE/12').parse(NOT_FOUND_ERR).tone, 'warn')
})

test('ICEGATE/12 inputs', () => {
  const [loc, no, dt] = api('ICEGATE/12').inputs
  assert.ok(loc.pattern.test('INCCU5') && !loc.pattern.test('INCCU'))
  assert.ok(no.pattern.test('1340721'))
  assert.ok(dt.pattern.test('23102024'))
  assert.equal(loc.upper, true)
})

test('ICEGATE/13 found', () => {
  const r = api('ICEGATE/13').parse(wrap({
    esealNumber: '000000000045', containerNumber: 'TU679', sealDateTime: '12042021 12:34', sbNumber: '2323134',
    sbDate: '12042021', truckNumber: 'UP16380', portCode: null, esealStatus: 'null', verificationTime: 'null',
  }))
  assert.equal(r.found, true)
  assert.equal(r.summary, 'E-seal 000000000045 on container TU679 was sealed on 12 Apr 2021, 12:34.')
  assert.ok(!r.fields.some((f) => f.label === 'E-seal status'))
  assert.deepEqual((r.extra as any).truckNumbers, ['UP16380'])
})

test('ICEGATE/13 not found', () => {
  assert.equal(api('ICEGATE/13').parse(NOT_FOUND_ERR).found, false)
})

test('ICEGATE/13 inputs', () => {
  const [seal, cont] = api('ICEGATE/13').inputs
  assert.ok(seal.pattern.test('000000000045') && !seal.pattern.test('') && !seal.pattern.test('AB12'))
  assert.ok(cont.pattern.test('TU679') && cont.pattern.test('MSCU7786602'))
  assert.ok(!cont.pattern.test(''))
})

test('ICEGATE/02 adds packages over all lines', () => {
  const r = api('ICEGATE/02').parse(wrap({ boeDetails: [
    { containerNo: ['A1'], totNoPkg: 10, grossWt: 1, unitOfQt: 'MTS' },
    { containerNo: ['B2', 'C3'], totNoPkg: 5, grossWt: 2, unitOfQt: 'MTS' },
  ] }))
  assert.equal(r.summary, 'BE cargo details found: 3 containers, 15 packages.')
  assert.equal(r.tables![1].rows.length, 2)
})

test('ICEGATE/01 and 07 expose vessel IMO', () => {
  assert.equal((api('ICEGATE/01').parse(wrap({ igmNo: 1, imoCodeOfVessel: '9241205' })).extra as any).imoCode, '9241205')
  const r = api('ICEGATE/07').parse(wrap({ igmNo: 2000690, igmDt: '31012014', imoCodeOfVessel: '12345', vesselCode: 'X1' }))
  assert.equal((r.extra as any).imoCode, '12345')
  assert.equal((r.extra as any).igmDate, '2014-01-31')
})

test('ICEGATE/03 found', () => {
  const r = api('ICEGATE/03').parse(wrap({ oocNo: 2004296615, oocDt: '26032012' }))
  assert.equal(r.found, true)
  assert.equal(r.summary, 'OOC granted on 26 Mar 2012.')
  assert.deepEqual(r.fields, [
    { label: 'OOC number', value: '2004296615' },
    { label: 'OOC date', value: '26 Mar 2012' },
  ])
  assert.deepEqual(r.extra, { oocNo: '2004296615', oocDate: '2012-03-26' })
})

test('ICEGATE/03 not found vs ICEGATE failure', () => {
  const nf = api('ICEGATE/03').parse(wrap({ oocNo: null, oocDt: null }))
  assert.equal(nf.found, false)
  assert.equal(nf.tone, 'warn')
  assert.equal(api('ICEGATE/03').parse(wrap('Service temporarily unavailable')).tone, 'bad')
  assert.equal(api('ICEGATE/03').parse(wrap({ errCode: 'ERROR0001', errMsg: 'Internal error' })).tone, 'bad')
  assert.equal(api('ICEGATE/03').parse(NOT_FOUND_ERR).tone, 'warn')
})

test('ICEGATE/03 inputs match the document format', () => {
  const [beNo, beDt] = api('ICEGATE/03').inputs
  assert.ok(beNo.pattern.test('6330973'))
  assert.ok(!beNo.pattern.test('BE5787'))
  assert.ok(beDt.pattern.test('22032012'))
})
