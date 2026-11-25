const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

export const compareAttributeNames = (a, b, order = []) => {
  const preferred = Array.isArray(order) ? order : []
  const left = preferred.indexOf(a), right = preferred.indexOf(b)
  if (left >= 0 || right >= 0) return (left < 0 ? Infinity : left) - (right < 0 ? Infinity : right)
  return collator.compare(a, b)
}

export function sortedAttributeNames(attributes = [], order = []) {
  return [...attributes].sort((a, b) => compareAttributeNames(a, b, order))
}

export const orderedAttributeNames = item => sortedAttributeNames(item?.attributes, item?.attributeOrder)

export function variationAttributeRows(item, variation, includeEmpty = false) {
  const keys = new Set([...(item?.attributes || []), ...Object.keys(variation?.values || {})])
  return [
    ...[...keys].map(key => ({ key, value: variation?.values?.[key] ?? '', extra: false })),
    ...Object.entries(variation?.extras || {}).map(([key, value]) => ({ key, value, extra: true })),
  ].filter(row => includeEmpty || String(row.value ?? '').trim())
    .sort((a, b) => compareAttributeNames(a.key, b.key, item?.attributeOrder))
}
