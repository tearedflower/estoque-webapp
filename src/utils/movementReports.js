import { normalizeSearchText } from './globalSearch.js'
import { variationAttributeRows } from './attributes.js'

export function movementMonthKey(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function shiftReportMonth(month, offset) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return ''
  const [year, value] = month.split('-').map(Number)
  return movementMonthKey(new Date(year, value - 1 + offset, 1, 12))
}

export function buildMovementReport(movements, period, { group = '', category = '', destination = null } = {}) {
  const isAdjustment = movement => ['ajuste', 'conferencia inicial'].includes(normalizeSearchText(movement.docRef))
  const movementKey = movement => JSON.stringify([movement.variationId || [movement.itemId || movement.itemName,
    variationAttributeRows(null, { values: movement.variationValues, extras: movement.variationExtras })], String(movement.itemUnit || '').trim() || 'Sem unidade'])
  const lastCosts = new Map(), exitCosts = new Map()
  // Prioriza o custo histórico; uma entrada posterior serve apenas como referência na falta dele.
  const timeline = movements.filter(row => !isAdjustment(row) && Number(row.qty) > 0 && Number.isFinite(Number(row.qty)) && Number.isFinite(new Date(row.date).getTime()))
    .slice().sort((a, b) => new Date(a.date) - new Date(b.date) || (a.type === 'entrada' ? 0 : 1) - (b.type === 'entrada' ? 0 : 1))
  for (const movement of timeline) {
    const key = movementKey(movement)
    if (movement.type === 'entrada' && movement.unitCost !== null && movement.unitCost !== undefined && String(movement.unitCost).trim() !== ''
      && Number.isFinite(Number(movement.unitCost)) && Number(movement.unitCost) >= 0) lastCosts.set(key, Number(movement.unitCost))
    if (movement.type === 'saida') exitCosts.set(movement, lastCosts.get(key) ?? null)
  }
  const selected = /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(period)
    ? movements.filter(movement => movementMonthKey(movement.date).slice(0, period.length) === period
      && (!group || movement.itemGroup === group)
      && (!category || movement.itemCategory === category)
      && (destination === null || (String(movement.destination || '').trim() || 'Sem destino informado') === destination)) : []
  const adjustments = selected.filter(isAdjustment)
  const adjustmentSet = new Set(adjustments)
  const regular = selected.filter(movement => !adjustmentSet.has(movement) && ['entrada', 'saida'].includes(movement.type))
  const materials = new Map(), destinations = new Map()
  const variationIds = new Set()
  for (const movement of regular) {
    const qty = Number(movement.qty)
    if (!Number.isFinite(qty) || qty <= 0) continue
    const unit = String(movement.itemUnit || '').trim() || 'Sem unidade'
    const key = movementKey(movement)
    variationIds.add(key)
    if (movement.type !== 'saida') continue
    const material = materials.get(key) || { id: key, itemId: movement.itemId, variationId: movement.variationId, name: movement.itemName || 'Material sem nome', unit, qty: 0, count: 0, costCents: 0, pricedQty: 0, unpricedCount: 0, referenceCostCount: 0, values: movement.variationValues, extras: movement.variationExtras }
    material.qty += qty
    material.count++
    materials.set(key, material)
    const destinationName = String(movement.destination || '').trim() || 'Sem destino informado'
    const destination = destinations.get(destinationName) || { id: destinationName, name: destinationName, count: 0, units: new Map(), costCents: 0, unpricedCount: 0, referenceCostCount: 0 }
    destination.count++
    destination.units.set(unit, (destination.units.get(unit) || 0) + qty)
    const historicalCost = exitCosts.get(movement) ?? null
    const unitCost = historicalCost ?? lastCosts.get(key) ?? null
    if (unitCost === null) {
      material.unpricedCount++
      destination.unpricedCount++
    } else {
      const cents = Math.round((qty * unitCost + Number.EPSILON) * 100)
      material.costCents += cents
      material.pricedQty += qty
      destination.costCents += cents
      if (historicalCost === null) {
        material.referenceCostCount++
        destination.referenceCostCount++
      }
    }
    destinations.set(destinationName, destination)
  }
  const rank = (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR')
  return {
    entries: regular.filter(movement => movement.type === 'entrada').length,
    exits: regular.filter(movement => movement.type === 'saida').length,
    adjustments: adjustments.length,
    variations: variationIds.size,
    estimatedExitValue: materials.size && [...materials.values()].some(row => row.count > row.unpricedCount) ? [...materials.values()].reduce((sum, row) => sum + row.costCents, 0) / 100 : null,
    unpricedExits: [...materials.values()].reduce((sum, row) => sum + row.unpricedCount, 0),
    referenceCostExits: [...materials.values()].reduce((sum, row) => sum + row.referenceCostCount, 0),
    materials: [...materials.values()].sort(rank).map(row => ({ ...row, estimatedValue: row.count > row.unpricedCount ? row.costCents / 100 : null,
      averageUnitCost: row.pricedQty ? row.costCents / 100 / row.pricedQty : null })),
    destinations: [...destinations.values()].sort(rank).map(row => ({ ...row, estimatedValue: row.count > row.unpricedCount ? row.costCents / 100 : null, units: [...row.units].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')) })),
  }
}
