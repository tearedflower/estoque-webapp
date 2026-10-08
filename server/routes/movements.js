import { Router } from 'express'
import crypto from 'crypto'
import db from '../db.js'
import { importMovementHistory } from '../utils/importMovementHistory.js'
import { createBackup } from '../backup.js'
import { prepareStockConfirmations, applyStockConfirmations, confirmStockAdjustment } from '../utils/stockConfirmation.js'
import { requireAdmin, requireAuth, requireOperator } from '../middleware/auth.js'
import { findDuplicateItem, normalizeItemIdentity } from '../utils/catalogIdentity.js'
import { calculateStockAfter, hasEnoughStock, isAdminStockAdjustment, parsePositiveQty } from '../utils/stockMath.js'
import { getDestinationFullName } from '../utils/destinations.js'

const router = Router()

function movementField(line, fields, key) {
  return line[key] !== undefined ? line[key] : (fields[key] || '')
}

function clean(value) {
  return String(value ?? '').trim()
}

function parseOptionalCostStrict(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null }
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Custo unitario deve ser zero ou positivo.' }
  return { ok: true, value: n }
}

function findActiveDestinationByName(name) {
  const wanted = clean(name).toLowerCase()
  if (!wanted) return null
  const rows = db.prepare('SELECT * FROM destinations WHERE active = 1').all()
  return rows.find(row => getDestinationFullName(db, row).toLowerCase() === wanted || row.name.toLowerCase() === wanted) || null
}

function validateMovementDestination(fields) {
  const destination = clean(fields.destination)
  const destinationId = clean(fields.destinationId)
  const destinationOther = fields.destinationOther === true

  if (destinationOther) {
    if (!destination) return { ok: false, error: 'Destino "Outro" precisa de descricao.' }
    return { ok: true, destination }
  }

  if (destinationId) {
    const row = db.prepare('SELECT * FROM destinations WHERE id = ? AND active = 1').get(destinationId)
    if (!row) return { ok: false, error: 'Destino selecionado nao existe ou esta inativo.' }
    return { ok: true, destination: getDestinationFullName(db, row) }
  }

  const row = findActiveDestinationByName(destination)
  if (!row) return { ok: false, error: 'Selecione um destino cadastrado ou marque Outro.' }
  return { ok: true, destination: getDestinationFullName(db, row) }
}

function validateMovementPerson(fields) {
  const requestedBy = clean(fields.requestedBy)
  const requestedByPersonId = clean(fields.requestedByPersonId)
  const row = requestedByPersonId
    ? db.prepare('SELECT * FROM people WHERE id = ? AND active = 1').get(requestedByPersonId)
    : db.prepare('SELECT * FROM people WHERE lower(name) = lower(?) AND active = 1').get(requestedBy)

  if (!row) return { ok: false, error: 'Selecione uma pessoa cadastrada e ativa em Quem retirou.' }
  if (requestedBy && row.name.toLowerCase() !== requestedBy.toLowerCase()) {
    return { ok: false, error: 'Quem retirou nao confere com a pessoa cadastrada selecionada.' }
  }
  return { ok: true, requestedBy: row.name, requestedByPersonId: row.id }
}

function validateMovementSupplier(fields) {
  const supplier = clean(fields.supplier)
  if (!supplier) return { ok: true, supplier: '' }
  const row = db.prepare('SELECT * FROM suppliers WHERE lower(name) = lower(?)').get(supplier)
  if (!row) return { ok: false, error: 'Fornecedor precisa estar cadastrado antes de registrar a entrada.' }
  if (!row.active) return { ok: false, error: 'Fornecedor selecionado esta inativo.' }
  return { ok: true, supplier: row.name }
}

function prepareNewCatalog(raw) {
  const group = clean(raw?.group).slice(0, 160)
  const category = clean(raw?.category).slice(0, 160)
  const subcategory = clean(raw?.subcategory).slice(0, 160)
  const name = clean(raw?.name).slice(0, 240)
  const unit = clean(raw?.unit).slice(0, 16) || 'UN'
  const initialStock = Number(raw?.initialStock ?? 0)
  if (!group || !name) return { error: 'Revise o grupo e o nome dos novos itens.' }
  if (subcategory && !category) return { error: 'Defina o subgrupo antes do subnivel.' }
  if (!Number.isFinite(initialStock) || initialStock < 0) return { error: 'Saldo ja existente deve ser zero ou positivo.' }

  const attributes = []
  const values = {}
  const seen = new Set()
  for (const row of Array.isArray(raw?.attributes) ? raw.attributes.slice(0, 30) : []) {
    const attribute = clean(row?.name).slice(0, 80)
    const key = normalizeItemIdentity(attribute)
    if (!attribute || !key || seen.has(key)) continue
    seen.add(key)
    attributes.push(attribute)
    const value = clean(row?.value).slice(0, 240)
    if (value) values[attribute] = value
  }

  return {
    catalog: {
      group,
      category,
      subcategory,
      name,
      unit,
      attributes,
      values,
      initialStock,
    },
  }
}

function insertBatchMovement({ type, item, qty, stockBefore, stockAfter, date, supplier = '', unitCost = null, requestedBy = '', requestedByPersonId = '', destination = '', docRef = '', note = '', operatorId, operatorName }) {
  const id = 'mov_' + crypto.randomBytes(6).toString('hex')
  const movement = {
    id,
    type,
    variationId: item.variationId,
    itemId: item.itemId,
    itemName: item.itemName || '',
    itemGroup: item.itemGroup || '',
    itemCategory: item.itemCategory || '',
    itemSubcategory: item.itemSubcategory || '',
    itemUnit: item.itemUnit || '',
    variationValues: item.variationValues || {},
    variationExtras: item.variationExtras || {},
    qty,
    stockBefore,
    stockAfter,
    date,
    supplier,
    unitCost,
    requestedBy,
    requestedByPersonId,
    destination,
    docRef,
    note,
    operatorId,
    operatorName,
  }
  db.prepare(`INSERT INTO movements (id, type, variation_id, item_id, item_name, item_group, item_category, item_subcategory, item_unit, variation_values, variation_extras, qty, stock_before, stock_after, date, supplier, unit_cost, requested_by, requested_by_person_id, destination, doc_ref, note, operator_id, operator_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, type, item.variationId, item.itemId,
    movement.itemName, movement.itemGroup, movement.itemCategory, movement.itemSubcategory, movement.itemUnit,
    JSON.stringify(movement.variationValues), JSON.stringify(movement.variationExtras),
    qty, stockBefore, stockAfter, date,
    supplier, unitCost, requestedBy, requestedByPersonId, destination, docRef, note,
    operatorId, operatorName
  )
  return movement
}

function toMovement(row) {
  const person = row.requested_by_person_id
    ? db.prepare('SELECT name FROM people WHERE id = ?').get(row.requested_by_person_id)
    : null
  return {
    id: row.id,
    type: row.type,
    variationId: row.variation_id,
    itemId: row.item_id,
    itemName: row.item_name,
    itemGroup: row.item_group,
    itemCategory: row.item_category,
    itemSubcategory: row.item_subcategory,
    itemUnit: row.item_unit,
    variationValues: JSON.parse(row.variation_values || '{}'),
    variationExtras: JSON.parse(row.variation_extras || '{}'),
    qty: row.qty,
    stockBefore: row.stock_before,
    stockAfter: row.stock_after,
    date: row.date,
    supplier: row.supplier,
    unitCost: row.unit_cost ?? null,
    requestedBy: person?.name || row.requested_by,
    requestedByPersonId: row.requested_by_person_id || '',
    destination: row.destination,
    docRef: row.doc_ref,
    note: row.note,
    operatorId: row.operator_id || '',
    operatorName: row.operator_name || '',
    affectsStock: row.affects_stock !== 0,
  }
}

// GET /api/movements
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM movements ORDER BY date DESC').all()
  res.json(rows.map(toMovement))
})

// POST /api/movements
router.post('/', requireAuth, requireOperator, (req, res) => {
  const m = req.body
  const operatorId = req.user?.id || ''
  const operatorName = req.user?.name || ''
  const qty = parsePositiveQty(m.qty)

  if (!m.type || !m.variationId || !m.itemId || !m.qty) {
    return res.status(400).json({ error: 'Campos obrigatorios: type, variationId, itemId, qty' })
  }
  if (!['entrada', 'saida'].includes(m.type)) {
    return res.status(400).json({ error: 'Tipo de movimentacao invalido.' })
  }
  if (!qty) {
    return res.status(400).json({ error: 'Quantidade deve ser positiva.' })
  }

  const variation = db.prepare('SELECT stock, item_id FROM variations WHERE id = ? AND active = 1').get(m.variationId)
  if (!variation) return res.status(404).json({ error: 'Variacao nao encontrada' })
  if (variation.item_id !== m.itemId) {
    return res.status(400).json({ error: 'Variacao nao pertence ao item informado.' })
  }

  const isStockAdjustment = isAdminStockAdjustment(m.docRef, req.user?.role)
  const confirmations = isStockAdjustment ? new Map() : prepareStockConfirmations(db, [m], m.stockCounts)
  const stockBefore = confirmations.get(m.variationId)?.countedStock ?? variation.stock
  const stockAfter = calculateStockAfter(m.type, stockBefore, qty)
  if (!hasEnoughStock(m.type, stockBefore, qty)) return res.status(400).json({ error: 'Estoque insuficiente para essa saida.' })

  const costValidation = parseOptionalCostStrict(m.unitCost)
  if (m.type === 'entrada' && !costValidation.ok) return res.status(400).json({ error: costValidation.error })
  const supplierValidation = m.type === 'entrada' ? validateMovementSupplier(m) : { ok: true, supplier: '' }
  if (!supplierValidation.ok) return res.status(400).json({ error: supplierValidation.error })
  const personValidation = m.type === 'saida' && !isStockAdjustment ? validateMovementPerson(m) : { ok: true, requestedBy: '', requestedByPersonId: '' }
  if (!personValidation.ok) return res.status(400).json({ error: personValidation.error })
  const destinationValidation = m.type === 'saida' && !isStockAdjustment ? validateMovementDestination(m) : { ok: true, destination: '' }
  if (!destinationValidation.ok) return res.status(400).json({ error: destinationValidation.error })

  const unitCost = m.type === 'entrada' ? costValidation.value : null

  const id = 'mov_' + crypto.randomBytes(6).toString('hex')
  const date = m.date || new Date().toISOString()

  const createMovement = db.transaction(() => {
    adjustmentIds = applyStockConfirmations(db, confirmations, req.user, date)
    db.prepare('UPDATE variations SET stock = ? WHERE id = ?').run(stockAfter, m.variationId)
    db.prepare(`INSERT INTO movements (id, type, variation_id, item_id, item_name, item_group, item_category, item_subcategory, item_unit, variation_values, variation_extras, qty, stock_before, stock_after, date, supplier, unit_cost, requested_by, requested_by_person_id, destination, doc_ref, note, operator_id, operator_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, m.type, m.variationId, m.itemId,
      m.itemName || '', m.itemGroup || '', m.itemCategory || '', m.itemSubcategory || '', m.itemUnit || '',
      JSON.stringify(m.variationValues || {}), JSON.stringify(m.variationExtras || {}),
      qty, stockBefore, stockAfter,
      date,
      supplierValidation.supplier, unitCost, personValidation.requestedBy, personValidation.requestedByPersonId, destinationValidation.destination, m.docRef || '', m.note || '',
      operatorId, operatorName
    )
    if (isStockAdjustment) confirmStockAdjustment(db, m.variationId, stockBefore, stockAfter, req.user, id)
  })
  let adjustmentIds = []
  createMovement()

  res.json({
    id,
    type: m.type,
    variationId: m.variationId,
    itemId: m.itemId,
    itemName: m.itemName,
    itemGroup: m.itemGroup,
    itemCategory: m.itemCategory,
    itemSubcategory: m.itemSubcategory,
    itemUnit: m.itemUnit,
    variationValues: m.variationValues || {},
    variationExtras: m.variationExtras || {},
    qty,
    stockBefore,
    stockAfter,
    date,
    supplier: supplierValidation.supplier,
    unitCost,
    requestedBy: personValidation.requestedBy,
    requestedByPersonId: personValidation.requestedByPersonId,
    destination: destinationValidation.destination,
    docRef: m.docRef || '',
    note: m.note || '',
    operatorId,
    operatorName,
    stockConfirmed: true,
    adjustments: adjustmentIds.map(id => toMovement(db.prepare('SELECT * FROM movements WHERE id = ?').get(id)))
  })
})

// POST /api/movements/batch
router.post('/batch', requireAuth, requireOperator, (req, res) => {
  const { type, items = [], fields = {}, requestId = '' } = req.body
  const operatorId = req.user?.id || ''
  const operatorName = req.user?.name || ''
  const cleanRequestId = clean(requestId)

  if (cleanRequestId && !/^[a-zA-Z0-9_-]{8,120}$/.test(cleanRequestId)) {
    return res.status(400).json({ error: 'requestId invalido.' })
  }

  if (cleanRequestId) {
    const previous = db.prepare('SELECT user_id, response_json FROM movement_batch_requests WHERE request_id = ?').get(cleanRequestId)
    if (previous) {
      if (previous.user_id !== operatorId) {
        return res.status(409).json({ error: 'Este requestId pertence a outro operador.' })
      }
      return res.json(JSON.parse(previous.response_json))
    }
  }

  if (![undefined, null, '', 'mixed', 'entrada', 'saida'].includes(type)) {
    return res.status(400).json({ error: 'Tipo de movimentacao invalido.' })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Informe ao menos um item.' })
  }

  if (items.some(line => line.newCatalog) && req.user?.role !== 'admin') return res.status(403).json({ error: 'Somente administradores podem cadastrar itens pela movimentacao.' })
  // Validate quantities before requesting a physical count.
  if (items.some(line => !parsePositiveQty(line.qty))) return res.status(400).json({ error: 'Todos os itens do lote precisam de quantidade positiva.' })
  const catalogs = new Map()
  const pendingCatalogNames = new Set()
  for (const [lineIndex, rawItem] of items.entries()) {
    if (rawItem.newCatalog) {
      const preparedCatalog = prepareNewCatalog(rawItem.newCatalog)
      if (preparedCatalog.error) return res.status(400).json({ error: preparedCatalog.error })
      const newCatalog = preparedCatalog.catalog
      const duplicate = findDuplicateItem(newCatalog)
      if (duplicate) {
        return res.status(409).json({
          error: `Este item ja existe no catalogo: "${duplicate.name}". Atualize os dados e selecione a variacao existente.`,
          code: 'ITEM_DUPLICATE',
        })
      }
      const identity = normalizeItemIdentity(newCatalog.name)
      if (pendingCatalogNames.has(identity)) {
        return res.status(409).json({ error: `O lote tenta cadastrar "${newCatalog.name}" mais de uma vez. Una as quantidades em uma foto.`, code: 'ITEM_DUPLICATE' })
      }
      pendingCatalogNames.add(identity)

      catalogs.set(lineIndex, newCatalog)
    }
  }
  const confirmations = prepareStockConfirmations(db, items.map(line => ({ ...line, type: line.type || type })), req.body.stockCounts)

  const liveStockByVariation = new Map()
  const prepared = []

  for (const [lineIndex, rawItem] of items.entries()) {
    const lineType = ['entrada', 'saida'].includes(rawItem.type) ? rawItem.type : type
    if (!['entrada', 'saida'].includes(lineType)) {
      return res.status(400).json({ error: 'Todos os itens do lote precisam de tipo entrada ou saida.' })
    }
    const qty = parsePositiveQty(rawItem.qty)
    if (!qty) return res.status(400).json({ error: 'Todos os itens do lote precisam de quantidade positiva.' })

    let item = rawItem
    let variation
    let newCatalog = null
    if (rawItem.newCatalog) {
      if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Somente administradores podem cadastrar itens pela movimentacao.' })
      newCatalog = catalogs.get(lineIndex)
      const confirmation = confirmations.get(`new:${lineIndex}`)
      if (confirmation) newCatalog.initialStock = confirmation.countedStock
      const itemId = 'item_' + crypto.randomBytes(6).toString('hex')
      const variationId = 'var_' + crypto.randomBytes(6).toString('hex')
      item = {
        ...rawItem,
        itemId,
        variationId,
        itemName: newCatalog.name,
        itemGroup: newCatalog.group,
        itemCategory: newCatalog.category,
        itemSubcategory: newCatalog.subcategory,
        itemUnit: newCatalog.unit,
        variationValues: newCatalog.values,
        variationExtras: {},
      }
      variation = { stock: newCatalog.initialStock, item_id: itemId }
      if (confirmation) confirmation.variationId = variationId
    } else {
      if (!rawItem.variationId || !rawItem.itemId) {
        return res.status(400).json({ error: 'Itens do lote precisam de variationId e itemId.' })
      }
      variation = db.prepare('SELECT stock, item_id FROM variations WHERE id = ? AND active = 1').get(rawItem.variationId)
      if (!variation) return res.status(404).json({ error: `Variacao nao encontrada: ${rawItem.variationId}` })
      if (variation.item_id !== rawItem.itemId) {
        return res.status(400).json({ error: 'Variacao nao pertence ao item informado.' })
      }
    }

    const stockBefore = liveStockByVariation.has(item.variationId)
      ? liveStockByVariation.get(item.variationId)
      : (confirmations.get(item.variationId)?.countedStock ?? variation.stock)
    const stockAfter = calculateStockAfter(lineType, stockBefore, qty)
    if (!hasEnoughStock(lineType, stockBefore, qty)) return res.status(400).json({ error: `Estoque insuficiente para ${item.itemName || 'item do lote'}.` })

    const rawFields = {
      supplier: movementField(item, fields, 'supplier'),
      requestedBy: movementField(item, fields, 'requestedBy'),
      requestedByPersonId: movementField(item, fields, 'requestedByPersonId'),
      destination: movementField(item, fields, 'destination'),
      destinationId: movementField(item, fields, 'destinationId'),
      destinationOther: item.destinationOther !== undefined ? item.destinationOther : fields.destinationOther,
    }
    const costValidation = parseOptionalCostStrict(item.unitCost !== undefined ? item.unitCost : fields.unitCost)
    if (lineType === 'entrada' && !costValidation.ok) return res.status(400).json({ error: costValidation.error })
    const supplierValidation = lineType === 'entrada' ? validateMovementSupplier(rawFields) : { ok: true, supplier: '' }
    if (!supplierValidation.ok) return res.status(400).json({ error: supplierValidation.error })
    const personValidation = lineType === 'saida' ? validateMovementPerson(rawFields) : { ok: true, requestedBy: '', requestedByPersonId: '' }
    if (!personValidation.ok) return res.status(400).json({ error: personValidation.error })
    const destinationValidation = lineType === 'saida' ? validateMovementDestination(rawFields) : { ok: true, destination: '' }
    if (!destinationValidation.ok) return res.status(400).json({ error: destinationValidation.error })

    liveStockByVariation.set(item.variationId, stockAfter)
    prepared.push({
      item,
      type: lineType,
      qty,
      stockBefore,
      stockAfter,
      supplier: supplierValidation.supplier,
      requestedBy: personValidation.requestedBy,
      requestedByPersonId: personValidation.requestedByPersonId,
      destination: destinationValidation.destination,
      unitCost: lineType === 'entrada' ? costValidation.value : null,
      newCatalog,
    })
  }

  const date = fields.date || new Date().toISOString()
  const created = []
  const initialMovements = []

  const createBatch = db.transaction(() => {
    for (const line of prepared.filter(row => row.newCatalog)) {
      const catalog = line.newCatalog
      db.prepare(`INSERT INTO items (id, name, group_name, category, subcategory, unit, min_stock, attributes, location)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, '')`).run(
        line.item.itemId, catalog.name, catalog.group, catalog.category || null, catalog.subcategory || null,
        catalog.unit, JSON.stringify(catalog.attributes)
      )
      db.prepare(`INSERT INTO variations (id, item_id, vals, stock, min_stock, initial_stock, extras, location, locations, destinations)
        VALUES (?, ?, ?, 0, 0, ?, '{}', '', '[]', '[]')`).run(
        line.item.variationId, line.item.itemId, JSON.stringify(catalog.values), catalog.initialStock
      )
    }

    const adjustmentIds = applyStockConfirmations(db, confirmations, req.user, date)
    initialMovements.push(...adjustmentIds.map(id => toMovement(db.prepare('SELECT * FROM movements WHERE id = ?').get(id))))

    for (const [variationId, stock] of liveStockByVariation.entries()) {
      db.prepare('UPDATE variations SET stock = ? WHERE id = ?').run(stock, variationId)
    }

    for (const line of prepared) {
      const m = line.item
      const docRef = movementField(m, fields, 'docRef')
      const note = movementField(m, fields, 'note')
      created.push({ ...insertBatchMovement({
        type: line.type,
        item: m,
        qty: line.qty,
        stockBefore: line.stockBefore,
        stockAfter: line.stockAfter,
        date,
        supplier: line.supplier,
        unitCost: line.unitCost,
        requestedBy: line.requestedBy,
        requestedByPersonId: line.requestedByPersonId,
        destination: line.destination,
        docRef,
        note,
        operatorId,
        operatorName,
      }), stockConfirmed: true })
    }

    const response = { movements: created, initialMovements }
    if (cleanRequestId) {
      db.prepare('INSERT INTO movement_batch_requests (request_id, user_id, response_json) VALUES (?, ?, ?)')
        .run(cleanRequestId, operatorId, JSON.stringify(response))
    }
  })

  createBatch()
  res.json({ movements: created, initialMovements })
})

// GET /api/movements/import-mappings
router.get('/import-mappings', requireAuth, requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT name_key AS nameKey, source_name AS sourceName, variation_id AS variationId
    FROM movement_import_mappings
    ORDER BY source_name
  `).all())
})

// POST /api/movements/import-history
router.post('/import-history', requireAuth, requireAdmin, async (req, res) => {
  try {
    await createBackup(db)
    res.json(importMovementHistory(db, req.body, req.user))
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message })
    throw error
  }
})

// PUT /api/movements/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const m = db.prepare('SELECT * FROM movements WHERE id = ?').get(req.params.id)
  if (!m) return res.status(404).json({ error: 'Movimentacao nao encontrada' })

  if (db.prepare('SELECT 1 FROM stock_confirmations WHERE movement_id = ?').get(m.id)) return res.status(409).json({ error: 'A conferência inicial é um registro de auditoria. Registre um novo ajuste para corrigir o saldo.' })

  const changes = req.body
  const oldQty = m.qty
  const newQty = changes.qty !== undefined ? parsePositiveQty(changes.qty) : oldQty
  if (!newQty) return res.status(400).json({ error: 'Quantidade deve ser positiva.' })

  let newStock = null
  if (m.affects_stock !== 0 && newQty !== oldQty) {
    const variation = db.prepare('SELECT stock FROM variations WHERE id = ?').get(m.variation_id)
    if (variation) {
      const diff = newQty - oldQty
      newStock = m.type === 'entrada' ? variation.stock + diff : variation.stock - diff
      if (newStock < 0) return res.status(400).json({ error: 'Estoque ficaria negativo com essa quantidade.' })
    }
  }

  const stockAfter = m.affects_stock === 0
    ? m.stock_after
    : m.stock_before + (m.type === 'entrada' ? newQty : -newQty)
  const costValidation = changes.unitCost !== undefined ? parseOptionalCostStrict(changes.unitCost) : { ok: true, value: m.unit_cost }
  if (m.type === 'entrada' && !costValidation.ok) return res.status(400).json({ error: costValidation.error })
  const supplierValidation = m.type === 'entrada' && changes.supplier !== undefined
    ? validateMovementSupplier({ supplier: changes.supplier })
    : { ok: true, supplier: m.supplier }
  if (!supplierValidation.ok) return res.status(400).json({ error: supplierValidation.error })
  const personValidation = m.type === 'saida' && (changes.requestedBy !== undefined || changes.requestedByPersonId !== undefined)
    ? validateMovementPerson({
        requestedBy: changes.requestedBy !== undefined ? changes.requestedBy : m.requested_by,
        requestedByPersonId: changes.requestedByPersonId !== undefined ? changes.requestedByPersonId : m.requested_by_person_id,
      })
    : { ok: true, requestedBy: m.requested_by, requestedByPersonId: m.requested_by_person_id }
  if (!personValidation.ok) return res.status(400).json({ error: personValidation.error })
  const destinationValidation = m.type === 'saida' && (changes.destination !== undefined || changes.destinationId !== undefined || changes.destinationOther !== undefined)
    ? validateMovementDestination({
        destination: changes.destination !== undefined ? changes.destination : m.destination,
        destinationId: changes.destinationId,
        destinationOther: changes.destinationOther,
      })
    : { ok: true, destination: m.destination }
  if (!destinationValidation.ok) return res.status(400).json({ error: destinationValidation.error })
  const unitCost = m.type === 'entrada' ? costValidation.value : null

  const updateMovement = db.transaction(() => {
    if (newStock !== null) {
      db.prepare('UPDATE variations SET stock = ? WHERE id = ?').run(newStock, m.variation_id)
    }
    db.prepare(`UPDATE movements SET qty=?, stock_after=?, date=?, supplier=?, unit_cost=?, requested_by=?, requested_by_person_id=?, destination=?, doc_ref=?, note=? WHERE id=?`).run(
      newQty,
      stockAfter,
      changes.date !== undefined ? changes.date : m.date,
      supplierValidation.supplier,
      unitCost,
      personValidation.requestedBy,
      personValidation.requestedByPersonId,
      destinationValidation.destination,
      changes.docRef !== undefined ? changes.docRef : m.doc_ref,
      changes.note !== undefined ? changes.note : m.note,
      req.params.id
    )
    db.prepare('UPDATE work_order_items SET qty = ? WHERE movement_id = ?').run(newQty, req.params.id)
  })
  updateMovement()

  const updated = db.prepare('SELECT * FROM movements WHERE id = ?').get(req.params.id)
  res.json(toMovement(updated))
})

// DELETE /api/movements/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const m = db.prepare('SELECT * FROM movements WHERE id = ?').get(req.params.id)
  if (!m) return res.status(404).json({ error: 'Movimentacao nao encontrada' })
  if (db.prepare('SELECT 1 FROM stock_confirmations WHERE movement_id = ?').get(m.id)) return res.status(409).json({ error: 'A conferência inicial é um registro de auditoria. Registre um novo ajuste para corrigir o saldo.' })

  const variation = m.affects_stock === 0 ? null : db.prepare('SELECT stock FROM variations WHERE id = ?').get(m.variation_id)
  const newStock = variation
    ? (m.type === 'entrada' ? variation.stock - m.qty : variation.stock + m.qty)
    : null
  if (newStock !== null && newStock < 0) {
    return res.status(400).json({ error: 'Nao e possivel excluir esta entrada porque o estoque ficaria negativo.' })
  }

  const linkedItems = db.prepare('SELECT id FROM work_order_items WHERE movement_id = ?').all(req.params.id)
  const removedWorkOrderItemIds = linkedItems.map(i => i.id)

  const removeMovement = db.transaction(() => {
    if (newStock !== null) db.prepare('UPDATE variations SET stock = ? WHERE id = ?').run(newStock, m.variation_id)
    db.prepare('DELETE FROM work_order_items WHERE movement_id = ?').run(req.params.id)
    db.prepare('DELETE FROM movements WHERE id = ?').run(req.params.id)
  })
  removeMovement()

  res.json({
    ok: true,
    variationId: m.variation_id,
    newStock,
    removedWorkOrderItemIds,
  })
})

export default router
