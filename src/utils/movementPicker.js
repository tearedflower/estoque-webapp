import { normalizeSearchText, searchTokens } from './globalSearch.js'

// Build once when the catalog changes, rather than normalizing it on each keystroke.
export function buildMovementRows(items, variations) {
  const byId = new Map(items.map(item => [item.id, item]))
  return variations.flatMap(variation => {
    const item = byId.get(variation.itemId)
    if (!item) return []
    const label = Object.entries({ ...variation.values, ...variation.extras })
      .map(([key, value]) => `${key}: ${value}`).join(' · ')
    const text = normalizeSearchText([
      item.name, item.group, item.category, item.subcategory, item.unit,
      item.location, variation.location, label,
    ].filter(Boolean).join(' '))
    return [{ item, variation, text, label }]
  }).sort((a, b) => a.item.name.localeCompare(b.item.name, 'pt-BR', { numeric: true, sensitivity: 'base' })
    || a.label.localeCompare(b.label, 'pt-BR', { numeric: true, sensitivity: 'base' }))
}

export function filterMovementRows(rows, search, { group, category, subcategory } = {}) {
  const tokens = searchTokens(search)
  return rows.filter(row => (!group || row.item.group === group)
    && (!category || row.item.category === category)
    && (!subcategory || row.item.subcategory === subcategory)
    && tokens.every(token => row.text.includes(token)))
}
