// Run: node --experimental-strip-types --test supabase/functions/ulip/apis/
// Samples are copied from the official ULIP ICEGATE document.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ICEGATE_APIS } from './icegate.ts'

const api = (id: string) => ICEGATE_APIS.find((a) => a.id === id)!

test('ICEGATE/03 found', () => {
  const r = api('ICEGATE/03').parse({
    response: [{ response: { oocNo: 2004296615, oocDt: '26032012' }, responseStatus: 'SUCCESS' }],
    error: 'false', code: '200', message: 'Success',
  })
  assert.equal(r.found, true)
  assert.equal(r.summary, 'OOC granted on 26 Mar 2012.')
  assert.deepEqual(r.fields, [
    { label: 'OOC number', value: '2004296615' },
    { label: 'OOC date', value: '26 Mar 2012' },
  ])
})

test('ICEGATE/03 not found', () => {
  const r = api('ICEGATE/03').parse({
    response: [{ response: { oocNo: null, oocDt: null }, responseStatus: 'SUCCESS' }],
    error: 'false', code: '200', message: 'Success',
  })
  assert.equal(r.found, false)
})

test('ICEGATE/03 inputs match the document format', () => {
  const [beNo, beDt] = api('ICEGATE/03').inputs
  assert.ok(beNo.pattern.test('6330973'))
  assert.ok(!beNo.pattern.test('BE5787'))
  assert.ok(beDt.pattern.test('22032012'))
})
