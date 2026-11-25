import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSeedData } from '../src/data/seedData.js'

const DAY_MS = 86_400_000

function epiStatuses(data) {
  const itemById = new Map(data.items.map(row => [row.id, row]))
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const result = []

  for (const person of data.people) {
    const rules = data.epiRoleRules.filter(rule => rule.active !== false && rule.roleName === person.role)
    for (const rule of rules) {
      const rows = data.movements.filter(row => {
        if (row.type !== 'saida' || row.requestedByPersonId !== person.id) return false
        if (rule.targetType === 'item') return row.itemId === rule.targetKey
        if (rule.targetType === 'variacao') return row.variationId === rule.targetKey
        if (rule.targetType === 'grupo') return row.itemGroup === rule.targetKey
        if (rule.targetType === 'categoria') return `${row.itemGroup}|${row.itemCategory}` === rule.targetKey
        const item = itemById.get(row.itemId)
        return rule.targetType === 'subcategoria' &&
          `${item?.group || ''}|${item?.category || ''}|${item?.subcategory || ''}` === rule.targetKey
      }).sort((a, b) => new Date(b.date) - new Date(a.date))

      if (!rows.length) {
        result.push('Pendente')
        continue
      }
      const due = new Date(rows[0].date)
      due.setDate(due.getDate() + Number(rule.days))
      due.setHours(0, 0, 0, 0)
      const daysLeft = Math.ceil((due - now) / DAY_MS)
      result.push(
        daysLeft < 0 ? 'Vencido' :
          daysLeft <= 7 ? 'Vence em breve' :
            daysLeft <= 30 ? 'Programar troca' :
              'Em dia'
      )
    }
  }
  return new Set(result)
}

test('seed operacional cobre os cadastros e atalhos do sistema', () => {
  const data = generateSeedData()

  assert.ok(data.items.length >= 100)
  assert.ok(data.variations.length >= 400)
  for (const key of [
    'movements',
    'destinations',
    'locations',
    'people',
    'suppliers',
    'roles',
    'epiRoleRules',
    'epiPeriodicities',
    'workOrders',
    'workOrderItems',
    'workOrderEvents',
    'motors',
    'motorEvents',
    'motorMaterials',
    'monthlyClosings',
  ]) {
    assert.ok(data[key].length > 0, `${key} deveria ter dados`)
  }

  assert.ok(data.people.some(row => row.status === 'afastado'))
  assert.ok(data.people.some(row => row.status === 'demitido'))
  assert.ok(data.destinations.some(row => row.parentId))
  assert.ok(data.destinations.some(row => row.materialRules?.length))
  assert.ok(data.items.some(row => row.active === false))
  assert.ok(data.suppliers.some(row => row.active === false))
  assert.ok(data.motors.some(row => row.status === 'em_manutencao'))
  assert.ok(data.workOrders.some(row => row.maintenanceExternalOrderNumber))
  assert.ok(data.monthlyClosings[0].data.rows.length > 0)
})

test('seed mantém referências e saldos de movimentação íntegros', () => {
  const data = generateSeedData()
  const itemIds = new Set(data.items.map(row => row.id))
  const variationIds = new Set(data.variations.map(row => row.id))
  const personIds = new Set(data.people.map(row => row.id))
  const workOrderIds = new Set(data.workOrders.map(row => row.id))
  const movementIds = new Set(data.movements.map(row => row.id))
  const motorIds = new Set(data.motors.map(row => row.id))

  for (const variation of data.variations) assert.ok(itemIds.has(variation.itemId))
  for (const row of data.movements) {
    assert.ok(itemIds.has(row.itemId))
    assert.ok(variationIds.has(row.variationId))
    if (row.requestedByPersonId) assert.ok(personIds.has(row.requestedByPersonId))
    const expected = row.type === 'entrada'
      ? row.stockBefore + row.qty
      : row.stockBefore - row.qty
    assert.equal(row.stockAfter, expected)
  }
  for (const row of data.workOrderItems) {
    assert.ok(workOrderIds.has(row.workOrderId))
    assert.ok(variationIds.has(row.variationId))
    assert.ok(movementIds.has(row.movementId))
  }
  for (const row of data.workOrderEvents) assert.ok(workOrderIds.has(row.workOrderId))
  for (const row of data.motorEvents) {
    assert.ok(motorIds.has(row.motorId))
    if (row.workOrderId) assert.ok(workOrderIds.has(row.workOrderId))
  }
  for (const row of data.motorMaterials) {
    assert.ok(motorIds.has(row.motorId))
    assert.ok(itemIds.has(row.itemId))
    assert.ok(variationIds.has(row.variationId))
  }
  const rowsByVariation = new Map()
  for (const row of data.movements) {
    if (!rowsByVariation.has(row.variationId)) rowsByVariation.set(row.variationId, [])
    rowsByVariation.get(row.variationId).push(row)
  }
  for (const [variationId, rows] of rowsByVariation) {
    const sorted = rows.sort((a, b) => new Date(a.date) - new Date(b.date))
    for (let index = 1; index < sorted.length; index += 1) {
      assert.equal(sorted[index].stockBefore, sorted[index - 1].stockAfter, variationId)
    }
    assert.equal(sorted.at(-1).stockAfter, data.variations.find(row => row.id === variationId).stock)
  }
})

test('seed alimenta todos os estados do controle de EPI', () => {
  const data = generateSeedData()

  assert.deepEqual(
    epiStatuses(data),
    new Set(['Pendente', 'Em dia', 'Programar troca', 'Vence em breve', 'Vencido'])
  )

  const previousMonth = new Date()
  previousMonth.setDate(1)
  previousMonth.setMonth(previousMonth.getMonth() - 1)
  assert.ok(!data.monthlyClosings.some(row =>
    row.year === previousMonth.getFullYear() && row.month === previousMonth.getMonth() + 1
  ))
})
