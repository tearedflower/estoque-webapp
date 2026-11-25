import test from 'node:test'
import assert from 'node:assert/strict'
import { epiPeriodGroups } from '../src/utils/epiPeriodGroups.js'

test('agrupa EPIs por alvo, preserva inativos e mostra prazos diferentes sem alterar regras', () => {
  const rules = [
    { id: 'a', targetType: 'item', targetKey: 'glove', roleName: 'Mecânico', days: 0, active: true },
    { id: 'b', targetType: 'item', targetKey: 'glove', roleName: 'Almoxarife', days: 90, active: true },
    { id: 'c', targetType: 'item', targetKey: 'glove', roleName: 'Operador', days: 90, active: true },
    { id: 'd', targetType: 'item', targetKey: 'glove', roleName: 'Inativo', days: 30, active: false },
    { id: 'e', targetType: 'categoria', targetKey: 'glove', targetLabel: 'Outra abrangência', roleName: 'Outro', days: 0, active: true },
  ]
  const before = structuredClone(rules)
  const groups = epiPeriodGroups(rules, [{ id: 'glove', name: 'Luva', category: 'Mãos', unit: 'PAR' }])
  const glove = groups.find(group => group.name === 'Luva')
  assert.equal(groups.length, 2)
  assert.deepEqual(glove.periods, [{ days: 90, count: 2 }, { days: 0, count: 1 }, { days: 30, count: 1 }])
  assert.equal(glove.majorityDays, null)
  assert.equal(glove.activeCount, 3)
  assert.equal(glove.inactiveCount, 1)
  const inactive = epiPeriodGroups([{ ...rules[0], active: false }], [])[0]
  assert.equal(inactive.activeCount, 0)
  assert.equal(inactive.inactiveCount, 1)
  assert.equal(glove.different, true)
  assert.equal(glove.unit, 'PAR')
  assert.deepEqual(glove.quantities, [1])
  assert.deepEqual(epiPeriodGroups([{ ...rules[0], quantity: 3 }, { ...rules[1], quantity: 2 }], [])[0].quantities, [2, 3])
  assert.equal(glove.rules[0].roleName, 'Almoxarife')
  const tie = epiPeriodGroups(rules.slice(0, 2), [])[0]
  assert.equal(tie.majorityDays, null)
  assert.equal(groups.find(group => group.name === 'Outra abrangência').different, false)
  assert.deepEqual(rules, before)
  assert.deepEqual(epiPeriodGroups([], []), [])
})
