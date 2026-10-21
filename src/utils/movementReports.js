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
  const selected = /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(period)
    ? movements.filter(movement => movementMonthKey(movement.date).slice(0, period.length) === period
      && (!group || movement.itemGroup === group)
      && (!category || movement.itemCategory === category)
      && (destination === null || (String(movement.destination || '').trim() || 'Sem destino informado') === destination)) : []
  const adjustments = selected.filter(movement => ['ajuste', 'conferencia inicial'].includes(normalizeSearchText(movement.docRef)))
  const adjustmentSet = new Set(adjustments)
  const regular = selected.filter(movement => !adjustmentSet.has(movement) && ['entrada', 'saida'].includes(movement.type))
  const materials = new Map(), destinations = new Map()
  const variationIds = new Set()
  for (const movement of regular) {
    const qty = Number(movement.qty)
    if (!Number.isFinite(qty) || qty <= 0) continue
    const unit = String(movement.itemUnit || '').trim() || 'Sem unidade'
    const attributes = variationAttributeRows(null, { values: movement.variationValues, extras: movement.variationExtras })
    const key = JSON.stringify([movement.variationId || [movement.itemId || movement.itemName, attributes], unit])
    variationIds.add(key)
    if (movement.type !== 'saida') continue
    const material = materials.get(key) || { id: key, itemId: movement.itemId, name: movement.itemName || 'Material sem nome', unit, qty: 0, count: 0, values: movement.variationValues, extras: movement.variationExtras }
    material.qty += qty
    material.count++
    materials.set(key, material)
    const destinationName = String(movement.destination || '').trim() || 'Sem destino informado'
    const destination = destinations.get(destinationName) || { id: destinationName, name: destinationName, count: 0, units: new Map() }
    destination.count++
    destination.units.set(unit, (destination.units.get(unit) || 0) + qty)
    destinations.set(destinationName, destination)
  }
  const rank = (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR')
  return {
    entries: regular.filter(movement => movement.type === 'entrada').length,
    exits: regular.filter(movement => movement.type === 'saida').length,
    adjustments: adjustments.length,
    variations: variationIds.size,
    materials: [...materials.values()].sort(rank),
    destinations: [...destinations.values()].sort(rank).map(row => ({ ...row, units: [...row.units].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')) })),
  }
}
