import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDestinationAlerts } from '../src/utils/stockReports.js'

test('destination alerts preserve manual links, aggregate broad rules and do not truncate totals', () => {
  const destinations = Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: `Destino ${i}`, materialRules: [] }))
  const names = id => destinations.find(row => row.id === id)?.name || ''
  const rows = [{ item: { name: 'Luva', group: 'EPI' }, variation: { stock: 0, minStock: 1, destinations: destinations.map(row => row.id) }, status: 'zero' }]
  assert.equal(buildDestinationAlerts(rows, destinations, names).length, 10)
  const withRule = [{ id: '0', name: 'Destino 0', materialRules: [{ group: 'EPI' }] }]
  const coveredRows = [
    { item: { name: 'Luva A', group: 'EPI' }, variation: { stock: 0, minStock: 1 }, status: 'zero' },
    { item: { name: 'Luva B', group: 'EPI' }, variation: { stock: 12, minStock: 1 }, status: 'ok' },
  ]
  assert.equal(buildDestinationAlerts(coveredRows, withRule, names).length, 0)
  coveredRows[1].variation.stock = 0
  coveredRows[1].status = 'zero'
  const alerts = buildDestinationAlerts(coveredRows, withRule, names)
  assert.equal(alerts[0].total, 1)
  assert.equal(alerts[0].zero, 1)
})
