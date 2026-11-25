import assert from 'node:assert/strict'
import test from 'node:test'
import { closingInconsistencyCount, periodClosing, previousMonthPeriod } from '../src/utils/closingAutomation.js'

test('selects the previous month across year boundaries', () => {
  assert.deepEqual(previousMonthPeriod(new Date(2026, 0, 15)), { year: 2025, month: 12 })
  assert.deepEqual(previousMonthPeriod(new Date(2026, 6, 29)), { year: 2026, month: 6 })
})

test('finds an existing closing and totals its inconsistencies', () => {
  const closings = [{ id: 'close_2026_06', year: 2026, month: 6 }]
  assert.equal(periodClosing(closings, { year: 2026, month: 6 })?.id, 'close_2026_06')
  assert.equal(closingInconsistencyCount({
    inconsistencies: { negativeStock: 2, movementMath: 1, partialMovements: 3 },
  }), 6)
})
