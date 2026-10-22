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

test('exit values use the last known purchase at the time, even outside period and classification filters', () => {
  const base = { itemName: 'Rolamento', itemUnit: 'UN', variationId: 'r1', itemGroup: 'Transmissão', qty: 2, destination: 'Oficina', type: 'saida' }
  const rows = [
    { ...base, date: '2026-10-20T12:00:00', type: 'entrada', unitCost: 999 },
    { ...base, date: '2026-10-15T12:00:00', qty: 3 },
    { ...base, date: '2026-10-12T12:00:00', type: 'entrada', unitCost: 30 },
    { ...base, date: '2026-10-11T12:00:00', type: 'entrada', unitCost: 888, docRef: 'AJUSTE' },
    { ...base, date: '2026-10-10T12:00:00' },
    { ...base, date: '2026-09-10T12:00:00', type: 'entrada', itemGroup: 'Peças Industriais', unitCost: 10, destination: '' },
    { ...base, variationId: 'r2', date: '2026-10-14T12:00:00' },
    { ...base, date: '2026-10-01T12:00:00', qty: 100, docRef: 'CONFERÊNCIA INICIAL' },
  ]
  const report = buildMovementReport(rows, '2026-10', { group: 'Transmissão', destination: 'Oficina' })
  assert.equal(report.estimatedExitValue, 110)
  assert.equal(report.unpricedExits, 1)
  const material = report.materials.find(row => row.id.includes('r1'))
  assert.equal(material.estimatedValue, 110)
  assert.equal(material.averageUnitCost, 22)
  assert.equal(material.qty, 5)
  assert.equal(material.unpricedCount, 0)
  assert.equal(report.materials.find(row => row.id.includes('r2')).estimatedValue, null)
  assert.equal(report.destinations[0].estimatedValue, 110)
  assert.equal(report.destinations[0].unpricedCount, 1)
  assert.equal(buildMovementReport(rows, '2026').estimatedExitValue, 110)
})

test('valuation distinguishes unknown costs from free purchases and isolates variations and units', () => {
  const base = { itemName: 'Peça', itemUnit: 'UN', variationId: 'v', qty: 1, type: 'entrada' }
  const rows = [
    { ...base, date: '2026-10-01', unitCost: null },
    { ...base, date: '2026-10-02', type: 'saida' },
    { ...base, date: '2026-10-03', unitCost: 0 },
    { ...base, date: '2026-10-04', unitCost: '' },
    { ...base, date: '2026-10-05', unitCost: -9 },
    { ...base, date: '2026-10-06', type: 'saida', qty: 2 },
    { ...base, date: '2026-10-07', type: 'saida', itemUnit: 'PAR' },
    { ...base, date: '2026-10-08', unitCost: 0.1 },
    { ...base, date: '2026-10-09', type: 'saida', qty: 3 },
    { ...base, date: 'invalid', unitCost: 999 },
  ]
  const report = buildMovementReport(rows, '2026-10')
  assert.equal(report.estimatedExitValue, 0.4)
  assert.equal(report.unpricedExits, 1)
  assert.equal(report.referenceCostExits, 1)
  assert.equal(report.materials.find(row => row.unit === 'UN').pricedQty, 6)
  assert.equal(report.materials.find(row => row.unit === 'UN').averageUnitCost, 0.4 / 6)
  assert.equal(report.materials.find(row => row.unit === 'PAR').estimatedValue, null)
  const free = buildMovementReport(rows.slice(2, 6), '2026-10')
  assert.equal(free.estimatedExitValue, 0)
  assert.equal(free.unpricedExits, 0)
  assert.equal(buildMovementReport(rows.slice(0, 2), '2026-10').estimatedExitValue, null)
})

test('later purchase cost fills missing references, is marked as estimated and never overrides a known historical cost', () => {
  const base = { itemName: 'Respirador', itemUnit: 'UN', variationId: 'respirador', qty: 4, type: 'saida', date: '2026-10-08', destination: 'EPI' }
  const rows = [base, { ...base }, { ...base, type: 'entrada', date: '2026-10-22', qty: 1, unitCost: 4.85 }]
  const report = buildMovementReport(rows, '2026-10', { destination: 'EPI' })
  assert.equal(report.estimatedExitValue, 38.8)
  assert.equal(report.materials[0].averageUnitCost, 4.85)
  assert.equal(report.unpricedExits, 0)
  assert.equal(report.referenceCostExits, 2)
  assert.equal(report.materials[0].referenceCostCount, 2)
  assert.equal(report.destinations[0].referenceCostCount, 2)
  const historical = buildMovementReport([...rows, { ...base, type: 'entrada', date: '2026-09-01', qty: 10, unitCost: 2 }], '2026-10')
  assert.equal(historical.estimatedExitValue, 16)
  assert.equal(historical.referenceCostExits, 0)
})
