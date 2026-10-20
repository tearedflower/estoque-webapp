import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMovementReport, shiftReportMonth } from '../src/utils/movementReports.js'

test('period navigation crosses year boundaries without skipping February', () => {
  assert.equal(shiftReportMonth('2026-12', 1), '2027-01')
  assert.equal(shiftReportMonth('2026-01', -1), '2025-12')
  assert.equal(shiftReportMonth('2024-03', -1), '2024-02')
  assert.equal(shiftReportMonth('2024-02', 1), '2024-03')
  assert.equal(shiftReportMonth('', 1), '')
})

test('reports keep the selected month, exclude adjustments from consumption and preserve units', () => {
  const movement = { date: '2026-10-12T12:00:00', type: 'saida', itemName: 'Luva', itemUnit: 'PAR', variationId: 'luva', qty: 2, destination: 'Oficina' }
  const rows = [movement, { ...movement, qty: 3 },
    { ...movement, date: '2026-09-12T12:00:00', qty: 900 },
    { ...movement, docRef: 'CONFERÊNCIA INICIAL', qty: 50 },
    { ...movement, docRef: 'AJUSTE', qty: 40 },
    { ...movement, type: 'entrada', qty: 8 },
    { ...movement, variationId: 'peca', itemName: 'Peça', itemUnit: 'PC', qty: 100 },
  ]
  const report = buildMovementReport(rows, '2026-10')
  assert.equal(report.entries, 1)
  assert.equal(report.exits, 3)
  assert.equal(report.adjustments, 2)
  assert.equal(report.variations, 2)
  assert.deepEqual(report.materials.map(row => [row.unit, row.qty]), [['PAR', 5], ['PC', 100]])
  assert.equal(report.materials[0].qty, 5)
  assert.equal(report.materials[0].count, 2)
  assert.deepEqual(report.destinations[0].units, [['PAR', 5], ['PC', 100]])
  assert.equal(buildMovementReport(rows, '2026-08').exits, 0)
  assert.equal(buildMovementReport(rows, '').exits, 0)
})
