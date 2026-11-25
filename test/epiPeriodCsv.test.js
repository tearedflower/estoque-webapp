import test from 'node:test'
import assert from 'node:assert/strict'
import { epiPeriodCsv } from '../src/utils/epiPeriodCsv.js'

test('relatório exporta um vínculo por linha mesmo com prazo e CAs iguais', () => {
  const item = { id: 'luva', name: 'Luva' }
  const itemRule = { targetType: 'item', targetKey: item.id, targetLabel: 'EPI > Mãos > Luva', active: true }
  const variation = (id, values, active = true) => ({ id, itemId: item.id, values, active })
  const variations = [variation('m', { CA: '50.739' }), variation('g', { CA: '50.739' }),
    variation('thermal', {}), variation('other', { CA: '99.999' }, false)]
  const rules = [
    { ...itemRule, days: 180, allowedCas: ['50739', '43226'], roleName: 'Mecânico' },
    { ...itemRule, days: 180, allowedCas: ['43226', '50739'], roleName: 'Eletricista' },
    { ...itemRule, days: 180, allowedCas: ['50739'], roleName: 'Pesador' },
    { ...itemRule, days: 90, roleName: 'Operador' },
    { ...itemRule, days: 0, roleName: 'Administrativo', active: false },
    { ...itemRule, targetType: 'variacao', targetKey: 'thermal', days: 30, roleName: 'Operador', personId: 'person-1' },
  ]
  const csv = epiPeriodCsv(rules, [item], variations)
  assert.deepEqual(csv.slice(1).split('\r\n'), [
    '"Periodicidade (dias)";"EPI";"CAs aceitos";"Cargo";"Situação do vínculo"',
    '"30";"EPI > Mãos > Luva";"CA pendente";"Operador (vínculo individual)";"Ativo"',
    '"90";"EPI > Mãos > Luva";"50739 | CA pendente";"Operador";"Ativo"',
    '"180";"EPI > Mãos > Luva";"43226 | 50739";"Eletricista";"Ativo"',
    '"180";"EPI > Mãos > Luva";"43226 | 50739";"Mecânico";"Ativo"',
    '"180";"EPI > Mãos > Luva";"50739";"Pesador";"Ativo"',
    '"Sem periodicidade";"EPI > Mãos > Luva";"50739 | CA pendente";"Administrativo";"Inativo"',
  ])
})
