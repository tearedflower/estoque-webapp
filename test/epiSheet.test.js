import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEpiKitRows, buildEpiSheetRows, movementPersonMatches } from '../src/utils/epiSheet.js'

test('ficha de EPI usa somente saídas da pessoa e extrai os campos da variação', () => {
  const person = { id: 'p1', name: 'João da Silva' }
  const movements = [
    { id: '2', type: 'saida', requestedByPersonId: 'p1', itemGroup: 'EPI', itemName: 'Protetor auditivo', qty: 1, date: '2026-07-13T12:00:00Z', variationValues: { Tamanho: '42', CA: '26.092' } },
    { id: '1', type: 'saida', requestedBy: 'Joao da Silva', itemGroup: 'EPI', itemName: 'Uniforme polo', qty: 3, date: '2026-07-12T12:00:00Z', variationExtras: { Marca: 'Colorindo', Modelo: 'Polo', Tamanho: 'M' } },
    { id: '3', type: 'entrada', requestedByPersonId: 'p1', itemGroup: 'EPI', itemName: 'Ignorar', qty: 1, date: '2026-07-14T12:00:00Z' },
    { id: '4', type: 'saida', requestedByPersonId: 'p1', itemGroup: 'Ferramentas', itemName: 'Ignorar', qty: 1, date: '2026-07-14T12:00:00Z' },
  ]

  assert.equal(movementPersonMatches(movements[1], person), true)
  assert.deepEqual(buildEpiSheetRows(movements, person), [
    { id: '1', quantity: 3, description: 'Uniforme polo / Colorindo / Polo', size: 'M', ca: '', date: '2026-07-12T12:00:00Z', observation: '' },
    { id: '2', quantity: 1, description: 'Protetor auditivo', size: '42', ca: '26.092', date: '2026-07-13T12:00:00Z', observation: '' },
  ])
})

test('kit do cargo preserva quantidade e exige escolha quando ha varias variacoes', () => {
  const items = [
    { id: 'mask', name: 'Mascara', group: 'EPI' },
    { id: 'boot', name: 'Botina', group: 'EPI' },
    { id: 'inactive', name: 'EPI inativo', group: 'EPI', active: false },
  ]
  const variations = [
    { id: 'mask_m', itemId: 'mask', values: { Tamanho: 'M' } },
    { id: 'mask_g', itemId: 'mask', values: { Tamanho: 'G' } },
    { id: 'boot_42', itemId: 'boot', values: { Tamanho: '42' } },
    { id: 'inactive_1', itemId: 'inactive', values: {} },
  ]
  const rules = [
    { id: 'r1', targetType: 'item', targetKey: 'mask', targetLabel: 'Mascara', quantity: 4 },
    { id: 'r2', targetType: 'variacao', targetKey: 'boot_42', targetLabel: 'Botina 42', quantity: 1 },
    { id: 'r3', targetType: 'item', targetKey: 'inactive', targetLabel: 'EPI inativo', quantity: 1 },
  ]

  assert.deepEqual(buildEpiKitRows(rules, items, variations), [
    { id: 'rule:r1', ruleId: 'r1', targetType: 'item', targetKey: 'mask', targetLabel: 'Mascara', quantity: 4, itemId: '', variationId: '' },
    { id: 'rule:r2', ruleId: 'r2', targetType: 'variacao', targetKey: 'boot_42', targetLabel: 'Botina 42', quantity: 1, itemId: 'boot', variationId: 'boot_42' },
  ])
})
