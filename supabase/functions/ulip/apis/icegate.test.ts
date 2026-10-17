// ICEGATE/03 tests now live in icegate_sea.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ICEGATE_APIS } from './icegate.ts'

test('icegate.ts is intentionally empty', () => {
  assert.deepEqual(ICEGATE_APIS, [])
})
