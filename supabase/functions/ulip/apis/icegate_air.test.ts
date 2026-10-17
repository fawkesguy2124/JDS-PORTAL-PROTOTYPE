// Run: node --experimental-strip-types --no-warnings --test supabase/functions/ulip/apis/icegate_air.test.ts
// Samples are copied from the official ULIP ICEGATE document.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ICEGATE_AIR_APIS } from './icegate_air.ts'

const api = (id: string) => ICEGATE_AIR_APIS.find((a) => a.id === id)!
const wrap = (response: unknown) => ({ response: [{ response, responseStatus: 'SUCCESS', message: null }], error: 'false', code: '200', message: 'Success' })
const NOT_FOUND = { response: [{ response: { errCode: 'ERROR0004', errMsg: 'No Records Available' }, responseStatus: 'ERROR', message: null }], error: 'false', code: '200', message: 'Success' }
const DOWN = { response: [{ response: 'X - 3rd party service is down!', responseStatus: 'ERROR' }], error: 'true' }

const rec09 = {
  grossWeight: '100', flightDate: '15022025 12:02', igmRtn: '71074', dateOfIntegration: null, mawbNumber: '06536234962',
  totalPackage: '100', igmDate: '25022025 12:02', custSite: 'INDEL4', remarks: null, flightNumber: 'SV758', status: 'C',
}

const hawb = {
  icdBlStatusResponceDto: {
    subLineNo: '1', voyageNo: 'null', mawbDT: '25052019', portDest: 'INJJK6', uqc: 'KGS', igmDT: '31072019', beLoc: '4',
    containerDtlsResponseDtos: [
      { subLineNo: '1', lineNo: '1', igmRTN: '2001935', errCode: '40|41', contNo: 'MAEU4698704', contStatus: 'FCL', arrDT: 'null', arrStatus: 'null' },
      { subLineNo: '1', lineNo: '1', igmRTN: '2001935', errCode: '100', contNo: 'MAEU4698704', contStatus: 'FCL', arrDT: 'null', arrStatus: 'null' },
    ],
    getewayPort: '1', grossWeight: '21200', hawbDT: '25052019', lineNo: '1', igmRTN: '2001935', packageCode: 'PCS',
    descOfGoods: 'ROLLED WORK', totalPackage: '2', inwDT: '31072019', vesselCode: 'null', cargoMovement: 'LC',
  },
}

const ST = 'Inserted Successfully in Database. Sent to ICES for validation.'
const f11 = (recv: string, sent: string) => ({
  ackSentTime: null, flightDate: '19012022', ackReceivedTime: null, receivedTime: recv, sentTime: sent,
  customLocation: 'INDEL4', flightNumber: 'KU332', status: ST,
})

for (const id of ['ICEGATE/09', 'ICEGATE/10', 'ICEGATE/11']) {
  test(`${id} odd shapes do not throw`, () => {
    const odds = [null, undefined, {}, [], 'text', 5, DOWN, { response: [] }, { response: [{}] }, wrap(null), wrap([]), wrap({}), wrap(['x']), wrap({ icdBlStatusResponceDto: null })]
    for (const odd of odds) {
      const r = api(id).parse(odd)
      assert.equal(r.found, false)
      assert.ok(r.summary.length > 0)
      assert.ok(Array.isArray(r.fields))
    }
    const d = api(id).parse(DOWN)
    assert.equal(d.tone, 'bad')
    assert.match(d.summary, /service is down/)
  })
  test(`${id} not found`, () => {
    const r = api(id).parse(NOT_FOUND)
    assert.equal(r.found, false)
    assert.equal(r.tone, 'warn')
  })
}

test('ICEGATE/09 found (array of records)', () => {
  const r = api('ICEGATE/09').parse(wrap([rec09]))
  assert.equal(r.found, true)
  assert.equal(r.summary, 'MAWB 06536234962 is on flight SV758 of 15 Feb 2025, 12:02, IGM/RTN 71074.')
  assert.equal(r.fields[0].label, 'MAWB number')
  assert.ok(r.fields.every((f) => f.value !== null))
  assert.equal((r.extra as any).igmRtn, '71074')
  assert.equal((r.extra as any).igmDate, '2025-02-25')
})

test('ICEGATE/09 found (single object and several records)', () => {
  assert.equal(api('ICEGATE/09').parse(wrap(rec09)).found, true)
  const r = api('ICEGATE/09').parse(wrap([rec09, { ...rec09, flightNumber: 'AI101' }]))
  assert.match(r.summary, /2 records/)
  assert.equal(r.tables![0].rows.length, 2)
})

test('ICEGATE/09 inputs', () => {
  const [mawb, site] = api('ICEGATE/09').inputs
  assert.ok(mawb.pattern.test('06536234962'))
  assert.ok(!mawb.pattern.test(''))
  assert.ok(!mawb.pattern.test('065-36234962'))
  assert.ok(site.pattern.test('INDEL4'))
  assert.ok(!site.pattern.test('INDEL42iio2oo21')) // document's 15-char sample breaks its own rule
  assert.ok(!site.pattern.test('INBOM'))
})

test('ICEGATE/10 found', () => {
  const r = api('ICEGATE/10').parse(wrap(hawb))
  assert.equal(r.found, true)
  assert.equal(r.summary, 'House air waybill found, IGM/RTN 2001935, goods: ROLLED WORK, 2 packages.')
  assert.ok(r.fields.some((f) => f.label === 'Description of goods'))
  assert.equal(r.fields.find((f) => f.label === 'MAWB date')!.value, '25 May 2019')
  assert.equal(r.tables![0].rows.length, 2)
  assert.deepEqual((r.extra as any).containerNumbers, ['MAEU4698704', 'MAEU4698704'])
})

test('ICEGATE/10 inputs', () => {
  const [mawb, hawbIn] = api('ICEGATE/10').inputs
  assert.ok(mawb.pattern.test('15754138070'))
  assert.ok(hawbIn.pattern.test('1575103333')) // curl sample
  assert.ok(!hawbIn.pattern.test('15751033332m23322')) // 17-char JSON sample is over the 15 limit
  assert.ok(!hawbIn.pattern.test(''))
})

test('ICEGATE/11 found, latest filing first, not yet acknowledged', () => {
  const r = api('ICEGATE/11').parse(wrap([
    f11('20/01/2025 12:06', '20032025 12:03'),
    f11('29/01/2025 15:40', '29012025 03:01'),
    f11('10/01/2025 13:09', '10012025 01:01'),
  ]))
  assert.equal(r.found, true)
  assert.equal(r.tone, 'warn')
  assert.match(r.summary, /^Flight KU332: Inserted Successfully/)
  assert.match(r.summary, /No acknowledgement from customs yet\.$/)
  assert.equal(r.fields.find((f) => f.label === 'Received by ICEGATE')!.value, '29 Jan 2025, 15:40')
  assert.equal(r.tables![0].rows.length, 3)
  assert.equal((r.extra as any).acknowledged, false)
})

test('ICEGATE/11 acknowledged is good', () => {
  const r = api('ICEGATE/11').parse(wrap([{ ...f11('20/01/2025 12:06', '20032025 12:03'), ackReceivedTime: '21/01/2025 10:00' }]))
  assert.equal(r.tone, 'good')
  assert.match(r.summary, /Acknowledgement received/)
})

test('ICEGATE/11 inputs', () => {
  const [loc, dt, no, flag] = api('ICEGATE/11').inputs
  assert.ok(loc.pattern.test('IMMUN1'))
  assert.ok(dt.pattern.test('15042025'))
  assert.ok(!dt.pattern.test('32042025'))
  assert.ok(!dt.pattern.test('15132025'))
  assert.equal(dt.kind, 'date8')
  assert.ok(no.pattern.test('123G'))
  assert.ok(!no.pattern.test('6E 23'))
  assert.ok(flag.pattern.test('EGM'))
  assert.ok(!flag.pattern.test(''))
})

test('ICEGATE/10 corrected spelling and unwrapped record', () => {
  const inner = hawb.icdBlStatusResponceDto
  const a = api('ICEGATE/10').parse(wrap({ icdBlStatusResponseDto: inner }))
  assert.equal(a.found, true)
  const b = api('ICEGATE/10').parse(wrap(inner))
  assert.equal(b.found, true)
  assert.equal(b.summary, a.summary)
})

test('ICEGATE/11 summary has a separator after the status', () => {
  const rej = api('ICEGATE/11').parse(wrap([{ ...f11('20/01/2025 12:06', '20032025 12:03'), status: 'Rejected: invalid flight', ackReceivedTime: '21/01/2025 10:00' }]))
  assert.equal(rej.summary, 'Flight KU332: Rejected: invalid flight. Acknowledgement received from customs.')
  const ok = api('ICEGATE/11').parse(wrap([f11('20/01/2025 12:06', '20032025 12:03')]))
  assert.match(ok.summary, /validation\. No acknowledgement/)
  assert.ok(!ok.summary.includes('..'))
})
