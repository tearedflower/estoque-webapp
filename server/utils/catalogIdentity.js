import db from '../db.js'

export function normalizeItemIdentity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(d[aeo]s?|de|para|por|com|em|a|o|as|os)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function findDuplicateItem(data, excludeId = '') {
  const name = normalizeItemIdentity(data.name)
  const hierarchyName = normalizeItemIdentity(data.subcategory || data.category || data.group)
  const candidateIsHierarchy = name === hierarchyName
  if (!name) return null

  return db.prepare(`
    SELECT i.id, i.name, i.group_name, i.category, i.subcategory,
      EXISTS(SELECT 1 FROM variations v WHERE v.item_id = i.id AND v.active = 1) AS has_variations
    FROM items i WHERE i.active = 1
  `).all().find(item => {
    if (item.id === excludeId) return false
    if (normalizeItemIdentity(item.name) !== name) return false
    const existingHierarchyName = normalizeItemIdentity(item.subcategory || item.category || item.group_name)
    const existingIsHierarchy = !item.has_variations && normalizeItemIdentity(item.name) === existingHierarchyName
    if (!candidateIsHierarchy && !existingIsHierarchy) return true
    return normalizeItemIdentity(item.group_name) === normalizeItemIdentity(data.group) &&
      normalizeItemIdentity(item.category) === normalizeItemIdentity(data.category) &&
      normalizeItemIdentity(item.subcategory) === normalizeItemIdentity(data.subcategory)
  }) || null
}
