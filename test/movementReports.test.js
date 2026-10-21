import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMovementReport, shiftReportMonth } from '../src/utils/movementReports.js'

test('period navigation crosses year boundaries without skipping February', () => {
  assert.equal(shiftReportMonth('2026-12', 1), '2027-01')
  assert.equal(shiftReportMonth('2026-01', -1), '2025-12')
  assert.equal(shiftReportMonth('2024-03', -1), '2024-02')
  assert.equal(shiftReportMonth('2024-02', 1), '2024-03')
  assert.equal(shiftReportMonth('2024-02', 12), '2025-02')
  assert.equal(shiftReportMonth('2026-10', -12), '2025-10')
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

test('material ranking combines exact group, category, destination and month without adjustments', () => {
  const movement = { date: '2026-10-12T12:00:00', type: 'saida', itemName: 'Luva', itemGroup: 'EPI', itemCategory: 'Mãos', itemUnit: 'PAR', variationId: 'luva', qty: 2, destination: 'EPI' }
  const rows = [movement, { ...movement, qty: 3 },
    { ...movement, destination: 'Oficina', qty: 100 },
    { ...movement, itemCategory: 'Pés', qty: 100 },
    { ...movement, itemGroup: 'Ferramentas', qty: 100 },
    { ...movement, docRef: 'AJUSTE', qty: 100 },
    { ...movement, date: '2026-09-01T12:00:00', qty: 100 },
    { ...movement, variationId: 'bota', itemName: 'Bota', qty: 10 },
  ]
  const filters = { group: 'EPI', category: 'Mãos', destination: 'EPI' }
  const report = buildMovementReport(rows, '2026-10', filters)
  assert.deepEqual(report.materials.map(row => [row.name, row.qty, row.count]), [['Luva', 5, 2], ['Bota', 10, 1]])
  assert.equal(report.exits, 3)
  assert.equal(buildMovementReport(rows, '2026-10', { ...filters, destination: 'Sem destino informado' }).materials.length, 0)
  assert.equal(buildMovementReport([{ ...movement, destination: '' }], '2026-10', { destination: 'Sem destino informado' }).materials.length, 1)
})

test('annual reports include all months of only the selected year and keep ranking filters', () => {
  const movement = { date: '2026-01-01T12:00:00', type: 'saida', itemName: 'Luva', itemGroup: 'EPI', itemCategory: 'Mãos', itemUnit: 'PAR', variationId: 'luva', qty: 2, destination: 'EPI' }
  const rows = [movement, { ...movement, date: '2026-12-31T12:00:00', qty: 3 },
    { ...movement, date: '2025-12-31T12:00:00', qty: 100 },
    { ...movement, date: '2027-01-01T12:00:00', qty: 100 },
    { ...movement, date: 'invalid', qty: 100 },
    { ...movement, destination: 'Oficina', qty: 100 },
    { ...movement, itemCategory: 'Pés', qty: 100 },
    { ...movement, itemGroup: 'Ferramentas', qty: 100 },
    { ...movement, type: 'entrada', qty: 10 },
    { ...movement, docRef: 'AJUSTE', qty: 100 },
  ]
  const filters = { group: 'EPI', category: 'Mãos', destination: 'EPI' }
  const annual = buildMovementReport(rows, '2026', filters)
  assert.equal(annual.exits, 2)
  assert.equal(annual.entries, 1)
  assert.equal(annual.adjustments, 1)
  assert.deepEqual(annual.materials.map(row => [row.qty, row.count, row.unit]), [[5, 2, 'PAR']])
  assert.deepEqual(annual.destinations[0].units, [['PAR', 5]])
  assert.equal(buildMovementReport(rows, '2026-01', filters).materials[0].qty, 2)
  assert.equal(buildMovementReport(rows, '2025', filters).materials[0].qty, 100)
  assert.equal(buildMovementReport(rows, '2026-13', filters).exits, 0)
})
