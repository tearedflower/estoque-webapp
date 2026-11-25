import { normalizeSearchText } from './globalSearch.js'

const DESCRIPTION_KEYS = ['fabricante', 'marca', 'modelo']
const SIZE_KEYS = ['tamanho', 'numero', 'numeracao', 'medida']
const CA_KEYS = ['ca', 'numero do ca', 'numero ca', 'certificado de aprovacao']

function attributeValue(attributes, keys) {
  for (const [key, value] of Object.entries(attributes)) {
    if (value && keys.includes(normalizeSearchText(key))) return String(value)
  }
  return ''
}

export function epiRuleMatchesPerson(rule, person) {
  if (!person) return false
  if (rule.personId) return rule.personId === person.id
  return Boolean(person.role) && normalizeSearchText(rule.roleName) === normalizeSearchText(person.role)
}

export function movementPersonMatches(movement, person) {
  if (!person || movement?.type !== 'saida') return false
  if (movement.requestedByPersonId) return movement.requestedByPersonId === person.id
  return normalizeSearchText(movement.requestedBy) === normalizeSearchText(person.name)
}

export function createEpiMovementLookup(movements) {
  const byId = new Map()
  const byName = new Map()
  for (const [index, movement] of movements.entries()) {
    if (movement?.type !== 'saida') continue
    const key = movement.requestedByPersonId || normalizeSearchText(movement.requestedBy)
    const map = movement.requestedByPersonId ? byId : byName
    if (!map.has(key)) map.set(key, [])
    map.get(key).push({ index, movement })
  }

  return person => {
    const identified = byId.get(person.id) || []
    const legacy = byName.get(normalizeSearchText(person.name)) || []
    if (!identified.length) return legacy.map(entry => entry.movement)
    if (!legacy.length) return identified.map(entry => entry.movement)
    return [...identified, ...legacy].sort((a, b) => a.index - b.index).map(entry => entry.movement)
  }
}

export function epiVariationCa(values, extras) {
  return attributeValue({ ...extras, ...values }, CA_KEYS).trim().replace(/[.\s]/g, '')
}

export function matchesAllowedCa(target, values, extras) {
  return !Array.isArray(target?.allowedCas) || target.allowedCas.includes(epiVariationCa(values, extras))
}

export function matchesRequiredEpiAttributes(target, values, extras) {
  return Object.entries(target?.requiredAttributes || {}).every(([key, expected]) =>
    normalizeSearchText(attributeValue({ ...extras, ...values }, [normalizeSearchText(key)])) === normalizeSearchText(expected)
  )
}

export function targetMatchesCatalogRow(target, item, variation) {
  if (!target || !item || !variation) return false
  if (!matchesAllowedCa(target, variation.values, variation.extras)) return false
  if (!matchesRequiredEpiAttributes(target, variation.values, variation.extras)) return false
  if (target.targetType === 'grupo') return item.group === target.targetKey
  if (target.targetType === 'categoria') return `${item.group || ''}|${item.category || ''}` === target.targetKey
  if (target.targetType === 'subcategoria') return `${item.group || ''}|${item.category || ''}|${item.subcategory || ''}` === target.targetKey
  if (target.targetType === 'item') return item.id === target.targetKey
  if (target.targetType === 'variacao') return variation.id === target.targetKey
  return false
}

export function catalogRowsForTarget(items, variations, target) {
  const itemById = new Map(items.map(item => [item.id, item]))
  return variations
    .map(variation => ({ variation, item: itemById.get(variation.itemId) }))
    .filter(row =>
      row.item?.active !== false &&
      row.variation.active !== false &&
      targetMatchesCatalogRow(target, row.item, row.variation)
    )
}

export function buildEpiKitRows(rules, items, variations) {
  return rules.flatMap(rule => {
    const candidates = catalogRowsForTarget(items, variations, rule)
    if (!candidates.length) return []
    const selected = candidates.length === 1 ? candidates[0] : null
    return [{
      id: `rule:${rule.id}`,
      ruleId: rule.id,
      targetType: rule.targetType,
      targetKey: rule.targetKey,
      targetLabel: rule.targetLabel,
      ...(rule.allowedCas ? { allowedCas: rule.allowedCas } : {}),
      ...(rule.requiredAttributes ? { requiredAttributes: rule.requiredAttributes } : {}),
      quantity: Number(rule.quantity || 1),
      itemId: selected?.item.id || '',
      variationId: selected?.variation.id || '',
    }]
  })
}

export function buildCatalogEpiSheetRow(item, variation, fields = {}) {
  const attributes = { ...(variation?.values || {}), ...(variation?.extras || {}) }
  const details = DESCRIPTION_KEYS.map(key => attributeValue(attributes, [key])).filter(Boolean)
  return {
    id: fields.id || variation?.id || item?.id || '',
    quantity: Number(fields.quantity || 1),
    description: [item?.name, ...new Set(details)].filter(Boolean).join(' / '),
    size: attributeValue(attributes, SIZE_KEYS),
    ca: attributeValue(attributes, CA_KEYS),
    date: fields.date || '',
    observation: fields.observation || '',
  }
}

export function buildEpiSheetRows(movements, person) {
  return movements
    .filter(movement =>
      movementPersonMatches(movement, person) &&
      ['epi', 'epis'].includes(normalizeSearchText(movement.itemGroup))
    )
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(movement => {
      return buildCatalogEpiSheetRow(
        { id: movement.itemId, name: movement.itemName },
        { id: movement.variationId, values: movement.variationValues, extras: movement.variationExtras },
        { id: movement.id, quantity: movement.qty, date: movement.date, observation: movement.note },
      )
    })
}
