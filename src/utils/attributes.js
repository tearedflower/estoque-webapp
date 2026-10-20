const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

export const compareAttributeNames = (a, b) => collator.compare(a, b)

export function sortedAttributeNames(attributes = []) {
  return [...attributes].sort(compareAttributeNames)
}

export function variationAttributeRows(item, variation, includeEmpty = false) {
  const keys = new Set([...(item?.attributes || []), ...Object.keys(variation?.values || {})])
  return [
    ...[...keys].map(key => ({ key, value: variation?.values?.[key] ?? '', extra: false })),
    ...Object.entries(variation?.extras || {}).map(([key, value]) => ({ key, value, extra: true })),
  ].filter(row => includeEmpty || String(row.value ?? '').trim())
    .sort((a, b) => compareAttributeNames(a.key, b.key))
}
