import assert from 'node:assert/strict'
import test from 'node:test'
import { formatRoleName } from '../src/composables/usePeople.js'
import { roleNameKey } from '../src/utils/nameFormat.js'
import { useRoles } from '../src/composables/useRoles.js'

test('formata nome de cargo com inicial maiuscula em cada palavra', () => {
  assert.equal(formatRoleName('OPERADOR DE RAMEUSE'), 'Operador De Rameuse')
})

test('impede criar ou renomear cargo duplicado por acento, caixa ou espaços', async () => {
  assert.equal(roleNameKey('  LÍDER   de Sala de Pano '), roleNameKey('Lider De Sala De Pano'))
  assert.notEqual(roleNameKey('Mecânico Junior'), roleNameKey('Mecânico Pleno'))
  const state = useRoles()
  const previous = state.roles.value
  try {
    state.roles.value = [{ id: 'junior', name: 'Mecânico Junior', active: true }, { id: 'pleno', name: 'Mecânico Pleno', active: true }]
    assert.equal((await state.addRole(' MECANICO  JUNIOR ')).ok, false)
    assert.equal((await state.editRole('pleno', { name: 'Mecanico Junior' })).ok, false)
    assert.equal(state.roles.value.length, 2)
  } finally { state.roles.value = previous }
})
