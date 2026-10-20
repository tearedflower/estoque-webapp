import test from 'node:test'
import assert from 'node:assert/strict'
import { sortedAttributeNames, variationAttributeRows } from '../src/utils/attributes.js'

test('attributes display alphabetically without changing registration order or losing values', () => {
  const item = { attributes: ['Tamanho', 'Marca', 'Bico', 'Modelo'] }
  const variation = { values: { Tamanho: '42', Marca: 'Teste', Bico: 'Composite', Modelo: '', 'Ângulo': 0 }, extras: { CA: '123' } }
  assert.deepEqual(variationAttributeRows(item, variation).map(row => [row.key, row.value]), [
    ['Ângulo', 0], ['Bico', 'Composite'], ['CA', '123'], ['Marca', 'Teste'], ['Tamanho', '42'],
  ])
  assert.deepEqual(variationAttributeRows(item, variation, true).map(row => row.key), ['Ângulo', 'Bico', 'CA', 'Marca', 'Modelo', 'Tamanho'])
  assert.deepEqual(sortedAttributeNames(item.attributes), ['Bico', 'Marca', 'Modelo', 'Tamanho'])
  assert.deepEqual(item.attributes, ['Tamanho', 'Marca', 'Bico', 'Modelo'])
  assert.equal(variation.values.Tamanho, '42')
})
