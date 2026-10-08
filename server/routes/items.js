import { Router } from 'express'
import crypto from 'crypto'
import db from '../db.js'
import { requireAdmin, requireAuth, requireOperator } from '../middleware/auth.js'
import { analyzeCatalogImage } from '../utils/catalogSuggestion.js'
import { findDuplicateItem, normalizeItemIdentity } from '../utils/catalogIdentity.js'

const router = Router()

function normalizeLocations(locations, legacyLocation = '') {
  const values = (Array.isArray(locations) ? locations : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)
  const fallback = String(legacyLocation || '').trim()
  return [...new Set(values.length ? values : [fallback].filter(Boolean))]
}

function parseJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

function variationSignature(values) {
  return JSON.stringify(Object.entries(values || {})
    .map(([key, value]) => [normalizeItemIdentity(key), normalizeItemIdentity(value)])
    .sort(([left], [right]) => left.localeCompare(right)))
}

function minimumStock(value, fallback = { value: 0, defined: false }) {
  if (value === undefined) return fallback
  if (value === null || String(value).trim() === '') return { value: 0, defined: false }
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return null
  return { value: Math.round(number), defined: true }
}

function serializedMinimumStock(row) {
  return row.min_stock_defined ? row.min_stock : null
}

router.post('/suggest', requireAuth, requireOperator, async (req, res) => {
  const { image } = req.body
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Configure GEMINI_API_KEY ou GOOGLE_API_KEY no servidor.' })
  if (typeof image !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,/i.test(image)) {
    return res.status(400).json({ error: 'Envie uma imagem JPG, PNG ou WEBP.' })
  }
  if (image.length > 8_500_000) return res.status(413).json({ error: 'A imagem deve ter no máximo 6 MB.' })

  const rows = db.prepare(`
    SELECT id, name, group_name, category, subcategory, unit, attributes
    FROM items WHERE active = 1 ORDER BY group_name, category, subcategory, name LIMIT 300
  `).all()
  const itemIds = new Set(rows.map(row => row.id))
  const variationsByItem = new Map()
  for (const row of db.prepare('SELECT item_id, vals FROM variations WHERE active = 1 LIMIT 1000').all()) {
    if (!itemIds.has(row.item_id)) continue
    const values = parseJson(row.vals, {})
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue
    const list = variationsByItem.get(row.item_id) || []
    list.push(values)
    variationsByItem.set(row.item_id, list)
  }
  const catalog = {
    hierarchy: [...new Set(rows.map(row => [row.group_name, row.category, row.subcategory].filter(Boolean).join(' > ')))],
    examples: rows
      .filter(row => row.name !== (row.subcategory || row.category || row.group_name))
      .slice(0, 100)
      .map(row => {
        const variationExamples = (variationsByItem.get(row.id) || []).slice(0, 6)
        return {
          path: [row.group_name, row.category, row.subcategory].filter(Boolean).join(' > '),
          name: row.name,
          unit: row.unit,
          attributes: parseJson(row.attributes, []),
          variationAttributes: [...new Set(variationExamples.flatMap(values => Object.keys(values)))],
          variationExamples
        }
      })
  }

  try {
    const suggestion = await analyzeCatalogImage({
      image,
      catalog,
      apiKey,
      model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
    })
    res.json(suggestion)
  } catch (error) {
    const status = error.name === 'TimeoutError' ? 504 : (error.status === 429 ? 429 : 502)
    res.status(status).json({ error: error.name === 'TimeoutError' ? 'A análise demorou demais. Tente novamente.' : error.message })
  }
})

// ===== Items =====

// GET /api/items
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM items WHERE active = 1 ORDER BY group_name, category, subcategory, name').all()
  res.json(rows.map(r => ({
    ...r,
    attributes: JSON.parse(r.attributes),
    group: r.group_name,
    minStock: serializedMinimumStock(r)
  })))
})

// POST /api/items
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, group, category, subcategory, unit, minStock, attributes, location } = req.body
  const item = {
    name: String(name || '').trim(),
    group: String(group || '').trim(),
    category: String(category || '').trim() || null,
    subcategory: String(subcategory || '').trim() || null,
  }
  if (!item.name || !item.group) return res.status(400).json({ error: 'Nome e grupo obrigatórios' })
  const minimum = minimumStock(minStock)
  if (!minimum) return res.status(400).json({ error: 'Estoque mínimo deve ser zero ou um número positivo.' })

  const duplicate = findDuplicateItem(item)
  if (duplicate) return res.status(409).json({ error: `Já existe este item no catálogo: "${duplicate.name}".` })

  const id = 'item_' + crypto.randomBytes(6).toString('hex')
  db.prepare(`INSERT INTO items (id, name, group_name, category, subcategory, unit, min_stock, min_stock_defined, attributes, location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, item.name, item.group, item.category, item.subcategory,
    unit || 'UN', minimum.value, minimum.defined ? 1 : 0, JSON.stringify(attributes || []), location || ''
  )

  res.json({ id, ...item, unit: unit || 'UN', minStock: minimum.defined ? minimum.value : null, attributes: attributes || [], location: location || '' })
})

// PUT /api/items/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT id, min_stock, min_stock_defined FROM items WHERE id = ? AND active = 1').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Item não encontrado' })

  const { name, group, category, subcategory, unit, minStock, attributes, location } = req.body
  const item = {
    name: String(name || '').trim(),
    group: String(group || '').trim(),
    category: String(category || '').trim() || null,
    subcategory: String(subcategory || '').trim() || null,
  }
  if (!item.name || !item.group) return res.status(400).json({ error: 'Nome e grupo obrigatórios' })
  const minimum = minimumStock(minStock, {
    value: existing.min_stock,
    defined: Boolean(existing.min_stock_defined),
  })
  if (!minimum) return res.status(400).json({ error: 'Estoque mínimo deve ser zero ou um número positivo.' })

  const duplicate = findDuplicateItem(item, req.params.id)
  if (duplicate) return res.status(409).json({ error: `Já existe este item no catálogo: "${duplicate.name}".` })

  db.prepare(`UPDATE items SET name=?, group_name=?, category=?, subcategory=?, unit=?, min_stock=?, min_stock_defined=?, attributes=?, location=? WHERE id=?`).run(
    item.name, item.group, item.category, item.subcategory,
    unit || 'UN', minimum.value, minimum.defined ? 1 : 0, JSON.stringify(attributes || []), location || '',
    req.params.id
  )

  res.json({ id: req.params.id, ...item, unit: unit || 'UN', minStock: minimum.defined ? minimum.value : null, attributes: attributes || [], location: location || '' })
})

// DELETE /api/items/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const changed = db.transaction(() => {
    db.prepare('DELETE FROM variation_photos WHERE variation_id IN (SELECT id FROM variations WHERE item_id = ?)').run(req.params.id)
    db.prepare('UPDATE variations SET active = 0 WHERE item_id = ?').run(req.params.id)
    return db.prepare('UPDATE items SET active = 0 WHERE id = ? AND active = 1').run(req.params.id).changes
  })()
  if (!changed) return res.status(404).json({ error: 'Item não encontrado' })
  res.json({ ok: true })
})

// ===== Variations =====

// GET /api/items/variations (all variations)
router.get('/variations', (req, res) => {
  const rows = db.prepare(`SELECT v.*, c.confirmed_at FROM variations v
    LEFT JOIN stock_confirmations c ON c.variation_id = v.id WHERE v.active = 1 ORDER BY v.item_id`).all()
  res.json(rows.map(r => ({
    id: r.id,
    itemId: r.item_id,
    values: JSON.parse(r.vals),
    stock: r.stock,
    stockConfirmed: Boolean(r.confirmed_at),
    minStock: serializedMinimumStock(r),
    initialStock: r.initial_stock,
    extras: JSON.parse(r.extras),
    location: r.location,
    locations: normalizeLocations(JSON.parse(r.locations || '[]'), r.location),
    destinations: JSON.parse(r.destinations)
  })))
})

// POST /api/items/variations
router.post('/variations', requireAuth, requireAdmin, (req, res) => {
  const { itemId, values, stock, minStock, initialStock, extras, location, locations, destinations } = req.body
  if (!itemId) return res.status(400).json({ error: 'itemId obrigatório' })

  const item = db.prepare('SELECT id, min_stock, min_stock_defined FROM items WHERE id = ? AND active = 1').get(itemId)
  if (!item) return res.status(404).json({ error: 'Item não encontrado' })

  const id = 'var_' + crypto.randomBytes(6).toString('hex')
  const s = Number(stock ?? 0)
  const initial = Number(initialStock ?? s)
  if (!Number.isFinite(s) || s < 0 || !Number.isFinite(initial) || initial < 0) {
    return res.status(400).json({ error: 'Estoque e saldo inicial devem ser numeros finitos, zero ou positivos.' })
  }
  const safeValues = values && typeof values === 'object' && !Array.isArray(values) ? values : {}
  const duplicate = db.prepare('SELECT vals FROM variations WHERE item_id = ? AND active = 1').all(itemId)
    .some(row => variationSignature(parseJson(row.vals, {})) === variationSignature(safeValues))
  if (duplicate) return res.status(409).json({ error: 'Já existe uma variação com esses mesmos atributos no modelo.' })
  const minimum = minimumStock(minStock, {
    value: item.min_stock,
    defined: Boolean(item.min_stock_defined),
  })
  if (!minimum) return res.status(400).json({ error: 'Estoque mínimo deve ser zero ou um número positivo.' })
  const normalizedLocations = normalizeLocations(locations, location)
  const primaryLocation = normalizedLocations[0] || ''
  db.prepare(`INSERT INTO variations (id, item_id, vals, stock, min_stock, min_stock_defined, initial_stock, extras, location, locations, destinations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, itemId, JSON.stringify(safeValues), s, minimum.value, minimum.defined ? 1 : 0,
    initial,
    JSON.stringify(extras || {}), primaryLocation, JSON.stringify(normalizedLocations), JSON.stringify(destinations || [])
  )

  res.json({ id, itemId, values: safeValues, stockConfirmed: false, stock: s, minStock: minimum.defined ? minimum.value : null, initialStock: initial, extras: extras || {}, location: primaryLocation, locations: normalizedLocations, destinations: destinations || [] })
})

// Change one chosen field atomically across selected variations; stock is never edited here.
router.put('/variations/bulk', requireAuth, requireAdmin, (req, res) => {
  const { ids, change } = req.body
  const fields = ['attribute', 'locations', 'destinations', 'minStock']
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some(id => typeof id !== 'string') || !change || !fields.includes(change.field)) {
    return res.status(400).json({ error: 'Selecione até 1.000 variações e um campo válido.' })
  }
  if (change.onlyEmpty !== undefined && typeof change.onlyEmpty !== 'boolean') return res.status(400).json({ error: 'Opção de campos vazios inválida.' })
  const field = change.field
  let name = '', value = change.value
  if (field === 'attribute') {
    if (typeof change.name !== 'string' || typeof value !== 'string' || !change.name.trim() || !value.trim() || change.name.length > 128 || value.length > 500) return res.status(400).json({ error: 'Informe o nome do atributo e seu valor.' })
    name = change.name.trim()
    if (['__proto__', 'prototype', 'constructor'].includes(name)) return res.status(400).json({ error: 'Nome de atributo inválido.' })
    value = value.trim()
  } else if (field === 'minStock') {
    if (!['number', 'string'].includes(typeof value)) return res.status(400).json({ error: 'Informe um estoque mínimo válido.' })
    const minimum = minimumStock(value)
    if (!minimum || !minimum.defined) return res.status(400).json({ error: 'Informe um estoque mínimo válido.' })
    value = minimum.value
  } else {
    if (!['add', 'replace', 'remove'].includes(change.mode) || !Array.isArray(value) || value.length > 100 || value.some(v => typeof v !== 'string' || !v.trim() || v.length > 500)) return res.status(400).json({ error: 'Informe uma operação e uma lista válida de locais ou destinos.' })
    value = [...new Set(value.map(v => v.trim()))]
    if (!value.length && change.mode !== 'replace') return res.status(400).json({ error: 'Selecione pelo menos um local ou destino.' })
    if (field === 'destinations' && value.some(id => !db.prepare('SELECT 1 FROM destinations WHERE id=? AND active=1').get(id))) return res.status(400).json({ error: 'Destino não encontrado.' })
  }
  try {
    const result = db.transaction(() => {
      const updates = new Map()
      const itemAttributes = new Map()
      for (const id of new Set(ids)) {
        const row = db.prepare('SELECT v.* FROM variations v JOIN items i ON i.id=v.item_id WHERE v.id=? AND v.active=1 AND i.active=1').get(id)
        if (!row) throw Object.assign(new Error('Uma variação foi removida. Atualize a lista.'), { status: 404 })
        if (field === 'attribute') {
          const vals = parseJson(row.vals, {})
          if (change.onlyEmpty && String(vals[name] ?? '').trim()) continue
          if (vals[name] === value) continue
          row.vals = JSON.stringify({ ...vals, [name]: value })
          const attrs = itemAttributes.get(row.item_id) || parseJson(db.prepare('SELECT attributes FROM items WHERE id=?').get(row.item_id).attributes, [])
          if (!attrs.includes(name)) attrs.push(name)
          itemAttributes.set(row.item_id, attrs)
        } else if (field === 'minStock') {
          if (change.onlyEmpty && row.min_stock_defined) continue
          if (row.min_stock_defined && row.min_stock === value) continue
          row.min_stock = value
          row.min_stock_defined = 1
        } else {
          const current = field === 'locations' ? normalizeLocations(parseJson(row.locations, []), row.location) : parseJson(row.destinations, [])
          if (change.onlyEmpty && current.length) continue
          const next = change.mode === 'add' ? [...new Set([...current, ...value])] : change.mode === 'remove' ? current.filter(v => !value.includes(v)) : value
          if (JSON.stringify(current) === JSON.stringify(next)) continue
          row[field] = JSON.stringify(next)
          if (field === 'locations') row.location = next[0] || ''
        }
        updates.set(id, row)
      }
      if (field === 'attribute') {
        for (const row of updates.values()) {
          const duplicate = db.prepare('SELECT id,vals FROM variations WHERE item_id=? AND id<>? AND active=1').all(row.item_id, row.id).some(other => variationSignature(parseJson(updates.get(other.id)?.vals || other.vals, {})) === variationSignature(parseJson(row.vals, {})))
          if (duplicate) throw Object.assign(new Error('Essa alteração criaria variações iguais no mesmo modelo. Revise a seleção ou os atributos.'), { status: 409 })
        }
      }
      for (const [id, attrs] of itemAttributes) db.prepare('UPDATE items SET attributes=? WHERE id=?').run(JSON.stringify(attrs), id)
      for (const row of updates.values()) db.prepare('UPDATE variations SET vals=?,location=?,locations=?,destinations=?,min_stock=?,min_stock_defined=? WHERE id=?').run(row.vals, row.location, row.locations, row.destinations, row.min_stock, row.min_stock_defined, row.id)
      return { updated: updates.size, selected: new Set(ids).size }
    })()
    res.json(result)
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message })
    throw error
  }
})

// PUT /api/items/variations/:id
router.put('/variations/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT id, item_id, stock, min_stock, min_stock_defined, initial_stock FROM variations WHERE id = ? AND active = 1').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Variação não encontrada' })

  const { itemId, values, minStock, initialStock, extras, location, locations, destinations } = req.body
  const targetItemId = String(itemId || existing.item_id)
  const targetItem = db.prepare('SELECT id, unit FROM items WHERE id = ? AND active = 1').get(targetItemId)
  if (!targetItem) return res.status(404).json({ error: 'Modelo de destino não encontrado.' })
  const sourceItem = db.prepare('SELECT unit FROM items WHERE id = ?').get(existing.item_id)
  if (sourceItem?.unit !== targetItem.unit) {
    return res.status(400).json({ error: 'A variação só pode ser movida para um modelo com a mesma unidade.' })
  }
  const safeValues = values && typeof values === 'object' && !Array.isArray(values) ? values : {}
  const signature = variationSignature(safeValues)
  const duplicate = db.prepare(
    'SELECT id, vals FROM variations WHERE item_id = ? AND id <> ? AND active = 1'
  ).all(targetItemId, req.params.id).some(row => variationSignature(parseJson(row.vals, {})) === signature)
  if (duplicate) return res.status(409).json({ error: 'Já existe uma variação com esses mesmos atributos no modelo de destino.' })

  const requestedInitialStock = initialStock === undefined ? Number(existing.initial_stock || 0) : Number(initialStock)
  const initialStockChanged = initialStock !== undefined && requestedInitialStock !== Number(existing.initial_stock || 0)
  if (initialStockChanged && req.user?.id !== 'user_admin') {
    return res.status(403).json({ error: 'Somente o admin mestre pode alterar estoque inicial.' })
  }
  const safeInitialStock = initialStockChanged && Number.isFinite(requestedInitialStock)
    ? Math.max(0, Math.round(requestedInitialStock))
    : Number(existing.initial_stock || 0)
  const minimum = minimumStock(minStock, {
    value: existing.min_stock,
    defined: Boolean(existing.min_stock_defined),
  })
  if (!minimum) return res.status(400).json({ error: 'Estoque mínimo deve ser zero ou um número positivo.' })
  const normalizedLocations = normalizeLocations(locations, location)
  const primaryLocation = normalizedLocations[0] || ''
  db.transaction(() => {
    db.prepare(`UPDATE variations SET item_id=?, vals=?, min_stock=?, min_stock_defined=?, initial_stock=?, extras=?, location=?, locations=?, destinations=? WHERE id=?`).run(
      targetItemId, JSON.stringify(safeValues), minimum.value, minimum.defined ? 1 : 0, safeInitialStock,
      JSON.stringify(extras || {}), primaryLocation, JSON.stringify(normalizedLocations), JSON.stringify(destinations || []),
      req.params.id
    )
    if (targetItemId !== existing.item_id) {
      db.prepare('UPDATE motor_materials SET item_id = ? WHERE variation_id = ?').run(targetItemId, req.params.id)
      db.prepare('UPDATE work_order_items SET item_id = ? WHERE variation_id = ?').run(targetItemId, req.params.id)
    }
  })()

  res.json({ id: req.params.id, itemId: targetItemId, values: safeValues, stock: Number(existing.stock || 0), minStock: minimum.defined ? minimum.value : null, initialStock: safeInitialStock, extras: extras || {}, location: primaryLocation, locations: normalizedLocations, destinations: destinations || [] })
})

// DELETE /api/items/variations/:id
router.delete('/variations/:id', requireAuth, requireAdmin, (req, res) => {
  const result = db.transaction(() => {
    const changed = db.prepare('UPDATE variations SET active = 0 WHERE id = ? AND active = 1').run(req.params.id)
    if (changed.changes) db.prepare('DELETE FROM variation_photos WHERE variation_id = ?').run(req.params.id)
    return changed
  })()
  if (!result.changes) return res.status(404).json({ error: 'Variação não encontrada' })
  res.json({ ok: true })
})

export default router
