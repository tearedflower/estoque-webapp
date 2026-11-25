import { matchesSearchTokens, normalizeSearchText, searchTokens } from './globalSearch.js'

function sameText(a, b) {
  return normalizeSearchText(String(a || '').trim()) === normalizeSearchText(String(b || '').trim())
}

function suggestionValues(suggestion) {
  return Object.fromEntries((suggestion?.attributes || [])
    .map(attribute => [String(attribute?.name || '').trim(), String(attribute?.value || '').trim()])
    .filter(([name, value]) => name && value))
}

function variationValue(variation, key) {
  const wanted = normalizeSearchText(key)
  const entry = Object.entries(variation?.values || {})
    .find(([name]) => normalizeSearchText(name) === wanted)
  return entry?.[1] ?? ''
}

export function findExactPhotoMatch(suggestion, items, variations) {
  const item = items.find(candidate =>
    sameText(candidate.group, suggestion?.group) &&
    sameText(candidate.category, suggestion?.category) &&
    (sameText(candidate.subcategory, suggestion?.subcategory) ||
      (!candidate.subcategory && sameText(suggestion?.subcategory, suggestion?.name))) &&
    sameText(candidate.name, suggestion?.name)
  ) || null

  if (!item) return { item: null, variation: null }

  const itemVariations = variations.filter(variation => variation.itemId === item.id)
  const registeredKeys = new Set(itemVariations.flatMap(variation =>
    Object.keys(variation.values || {}).map(normalizeSearchText)
  ))
  const values = Object.entries(suggestionValues(suggestion))
    .filter(([key]) => registeredKeys.has(normalizeSearchText(key)))
  if (!values.length) return { item, variation: null }

  const candidates = itemVariations.filter(variation =>
    values.every(([key, value]) => sameText(variationValue(variation, key), value))
  )

  return { item, variation: candidates.length === 1 ? candidates[0] : null }
}

export function photoSuggestionSearch(suggestion) {
  return [
    suggestion?.group,
    suggestion?.category,
    suggestion?.subcategory,
    suggestion?.name,
    ...Object.values(suggestionValues(suggestion)),
  ].filter(Boolean).join(' ')
}

export function photoCatalogDraft(suggestion) {
  return {
    group: String(suggestion?.group || '').trim(),
    category: String(suggestion?.category || '').trim(),
    subcategory: String(suggestion?.subcategory || '').trim(),
    name: String(suggestion?.name || '').trim(),
    unit: String(suggestion?.unit || 'UN').trim() || 'UN',
    attributes: (suggestion?.attributes || []).map(attribute => ({
      name: String(attribute?.name || '').trim(),
      value: String(attribute?.value || '').trim(),
    })).filter(attribute => attribute.name),
    initialStock: 0,
  }
}

export function photoCatalogBlockReason(catalog = {}) {
  if (!String(catalog.group || '').trim() || !String(catalog.name || '').trim()) return 'Revise o grupo e o nome do novo item.'
  if (String(catalog.subcategory || '').trim() && !String(catalog.category || '').trim()) return 'Defina o subgrupo antes do subnível.'
  const initialStock = Number(catalog.initialStock ?? 0)
  if (!Number.isFinite(initialStock) || initialStock < 0) return 'Revise o saldo já existente do novo item.'
  if ((catalog.attributes || []).some(attribute => !String(attribute?.name || '').trim() && String(attribute?.value || '').trim())) return 'Informe o nome dos atributos preenchidos.'
  return ''
}

export function parsePhotoUnitCost(value) {
  if (value === '' || value == null) return null
  const text = String(value).trim()
  const parsed = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text)
  return Number.isFinite(parsed) ? parsed : NaN
}

export function maskPhotoUnitCost(value) {
  const digits = String(value || '').replace(/\D/g, '').replace(/^0+/, '').slice(0, 15)
  return digits ? (Number(digits) / 100).toFixed(2).replace('.', ',') : ''
}

export function displayPhotoUnitCost(value) {
  const parsed = parsePhotoUnitCost(value)
  return parsed == null || !Number.isFinite(parsed) ? '' : parsed.toFixed(2).replace('.', ',')
}

export function variationDescription(variation) {
  return [
    ...Object.entries(variation?.values || {}).map(([key, value]) => `${key}: ${value}`),
    ...Object.entries(variation?.extras || {}).map(([key, value]) => `${key}: ${value}`),
  ].filter(Boolean).join(' · ') || 'Variação única'
}

export function searchPhotoVariations(query, items, variations, limit = 40) {
  const tokens = searchTokens(query)
  if (!tokens.length) return []
  const byItem = new Map(items.map(item => [item.id, item]))
  const results = []

  for (const variation of variations) {
    const item = byItem.get(variation.itemId)
    if (!item) continue
    const text = [
      item.group,
      item.category,
      item.subcategory,
      item.name,
      variationDescription(variation),
      variation.location,
    ].filter(Boolean).join(' ')
    if (!matchesSearchTokens(text, tokens)) continue
    results.push({ item, variation })
    if (results.length >= limit) break
  }
  return results
}

export function effectivePhotoFields(batch, photo) {
  return {
    ...(batch?.defaults || {}),
    ...(photo?.useOverrides ? (photo.overrides || {}) : {}),
  }
}

export function canEditPhotoBatch(batch, ownerUserId, isAdmin, editingBatchId = '') {
  if (!batch || batch.status !== 'pending') return false
  return batch.ownerUserId === ownerUserId || (isAdmin && editingBatchId === batch.id)
}

export function canDeletePhotoBatch(batch, ownerUserId, isAdmin) {
  if (!batch) return false
  return Boolean(isAdmin || batch.ownerUserId === ownerUserId)
}

export function buildPhotoMovementLine(batch, photo, item, variation) {
  const fields = effectivePhotoFields(batch, photo)
  return {
    ...(photo.createCatalog
      ? { newCatalog: { ...photo.catalog, attributes: (photo.catalog?.attributes || []).map(attribute => ({ ...attribute })) } }
      : {
          variationId: variation.id,
          itemId: item.id,
          itemName: item.name,
          itemGroup: item.group,
          itemCategory: item.category || '',
          itemSubcategory: item.subcategory || '',
          itemUnit: item.unit,
          variationValues: { ...(variation.values || {}) },
          variationExtras: { ...(variation.extras || {}) },
        }),
    qty: Number(photo.qty),
    ...(batch.type === 'entrada'
      ? {
          supplier: fields.supplier || '',
          unitCost: parsePhotoUnitCost(photo.unitCost),
          docRef: fields.docRef || '',
          note: fields.note || '',
        }
      : {
          requestedBy: fields.requestedBy || '',
          requestedByPersonId: fields.requestedByPersonId || '',
          destination: fields.destination || '',
          destinationId: fields.destinationId || '',
          destinationOther: fields.destinationOther === true,
          note: fields.note || '',
        }),
  }
}

export function photoBatchBlockReason(batch, photos, items, variations) {
  if (!photos.length) return 'Adicione ao menos uma foto.'
  const itemIds = new Set(items.map(item => item.id))
  const variationById = new Map(variations.map(variation => [variation.id, variation]))
  const requestedByVariation = new Map()
  const newCatalogNames = new Set()

  for (const photo of photos) {
    let variation = null
    let availableStock = 0
    let stockKey = ''
    if (photo.createCatalog) {
      const catalog = photo.catalog || {}
      const catalogReason = photoCatalogBlockReason(catalog)
      if (catalogReason) return catalogReason
      if (photo.status !== 'matched') return 'Confirme a revisão dos novos cadastros.'
      const initialStock = Number(catalog.initialStock ?? 0)
      const identity = normalizeSearchText(catalog.name)
      if (newCatalogNames.has(identity)) return `O lote tenta cadastrar "${catalog.name}" mais de uma vez. Una as quantidades em uma foto.`
      newCatalogNames.add(identity)
      availableStock = initialStock
      stockKey = `new:${identity}`
    } else {
      if (!photo.itemId || !itemIds.has(photo.itemId)) return 'Revise o item de todas as fotos.'
      variation = variationById.get(photo.variationId)
      if (!variation || variation.itemId !== photo.itemId) return 'Selecione a variação de todas as fotos.'
      availableStock = Number(variation.stock || 0)
      stockKey = variation.id
    }
    const qty = Number(photo.qty)
    if (!Number.isFinite(qty) || qty <= 0) return 'Informe uma quantidade positiva em todas as fotos.'

    const fields = effectivePhotoFields(batch, photo)
    if (batch.type === 'entrada') {
      const cost = parsePhotoUnitCost(photo.unitCost)
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return 'Revise os custos unitários do lote.'
    } else {
      if (!fields.requestedByPersonId || !fields.requestedBy) return 'Selecione quem retirou em todas as fotos.'
      if (!fields.destinationId && !fields.destinationOther) return 'Selecione o destino em todas as fotos.'
      if (fields.destinationOther && !String(fields.destination || '').trim()) return 'Descreva os destinos informados como Outro.'
      const accumulated = (requestedByVariation.get(stockKey) || 0) + qty
      if (variation?.stockConfirmed !== false && !photo.createCatalog && accumulated > availableStock) return `A saída acumulada de ${variation ? variationDescription(variation) : photo.catalog.name} excede o saldo disponível.`
      requestedByVariation.set(stockKey, accumulated)
    }
  }
  return ''
}

export function photoBatchExpired(batch, now = Date.now()) {
  return batch?.status === 'completed' && Boolean(batch.expiresAt) && new Date(batch.expiresAt).getTime() <= now
}
