import test from 'node:test'
import assert from 'node:assert/strict'
import { epiRoleOverview } from '../src/utils/epiRoleOverview.js'

test('visão por cargo distingue inativos, quantidades, prazos e motivos, sem duplicar cargos por acento', () => {
  const rules = [
    { id: 'a', roleName: 'Mecanico', targetType: 'item', targetKey: 'glove', quantity: 2, days: 30, active: true, usageReason: 'Corte' },
    { id: 'b', roleName: 'Mecânico', targetType: 'item', targetKey: 'boot', quantity: 1, days: 0, active: false },
    { id: 'c', roleName: 'Mecânico', targetType: 'categoria', targetKey: 'outro', targetLabel: 'Óculos', quantity: 1, days: 0, active: true, usageReason: ' ' },
    { id: 'd', roleName: 'Cargo antigo', targetType: 'item', targetKey: 'boot', quantity: 1, days: 0, active: false },
  ]
  const before = structuredClone(rules)
  const groups = epiRoleOverview([{ name: 'Mecânico' }, { name: 'Administrativo' }], rules, [{ id: 'glove', name: 'Luva', unit: 'PAR' }], [
    { role: 'MECANICO', status: 'ativo' }, { role: 'Mecânico', status: 'afastado', active: true }, { role: 'Mecânico', active: true },
  ])
  const mechanic = groups.find(group => group.name === 'Mecânico')
  assert.equal(groups.length, 3)
  assert.equal(mechanic.people, 2)
  assert.equal(mechanic.activeCount, 2)
  assert.equal(mechanic.inactiveCount, 1)
  assert.equal(mechanic.withoutPeriod, 1)
  assert.equal(mechanic.withoutReason, 1)
  assert.equal(mechanic.rules.find(rule => rule.id === 'a').unit, 'PAR')
  assert.equal(mechanic.rules.find(rule => rule.id === 'a').quantity, 2)
  assert.equal(mechanic.rules.at(-1).active, false)
  assert.equal(groups.find(group => group.name === 'Administrativo').activeCount, 0)
  assert.deepEqual(rules, before)
})
