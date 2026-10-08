import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMovementRows, filterMovementRows } from '../src/utils/movementPicker.js'

test('movement picker combines search with hierarchy and keeps zero/unconfirmed stock visible', () => {
  const items = [
    { id: 'a', name: 'Bóta', group: 'EPI', category: 'Calçados', subcategory: 'Botas', unit: 'PAR' },
    { id: 'b', name: 'Disco', group: 'Abrasivos', unit: 'UN' },
  ]
  const variations = [
    { id: '1', itemId: 'a', values: { Bico: 'Composite', Tamanho: '42' }, extras: { CA: '123' }, location: 'Prateleira 2', stock: 0, stockConfirmed: false },
    { id: '2', itemId: 'a', values: { Bico: 'Aço', Tamanho: '40' }, stock: 5 },
    { id: '3', itemId: 'b', values: {}, stock: 0 },
    { id: 'orphan', itemId: 'missing' },
  ]
  const rows = buildMovementRows(items, variations)
  const ids = (q, filters) => filterMovementRows(rows, q, filters).map(row => row.variation.id)
  assert.equal(rows.length, 3)
  assert.deepEqual(ids('bota composite 42', { group: 'EPI', category: 'Calçados', subcategory: 'Botas' }), ['1'])
  assert.deepEqual(ids('aço'), ['2'])
  assert.deepEqual(ids('prateleira 123'), ['1'])
  assert.deepEqual(ids('bota', { group: 'Abrasivos' }), [])
  assert.deepEqual(ids('', { group: 'Abrasivos' }), ['3'])
  assert.equal(rows.find(row => row.variation.id === '1').variation.stockConfirmed, false)
})
