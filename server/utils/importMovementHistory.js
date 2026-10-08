import crypto from 'node:crypto'
import { calculateStockAfter, parsePositiveQty } from './stockMath.js'

const clean = value => String(value ?? '').trim()

function normalizeImportName(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function isImportAdjustment(value) {
  return ['acerto estoque', 'acerto de estoque'].includes(normalizeImportName(value))
}

export function importMovementHistory(db, payload, operator = {}) {
  payload ||= {}
  const rows = Array.isArray(payload.rows) ? payload.rows : []
  const mappings = Array.isArray(payload.mappings) ? payload.mappings : []
  const formerPeople = Array.isArray(payload.formerPeople) ? payload.formerPeople : []
  const minimumStocks = Array.isArray(payload.minimumStocks) ? payload.minimumStocks : []
  if (!rows.length || rows.length > 10000) {
    throw Object.assign(new Error('A importacao precisa ter entre 1 e 10.000 movimentacoes.'), { status: 400 })
  }
  if (minimumStocks.length > 10000) {
    throw Object.assign(new Error('A importacao possui quantidades minimas demais.'), { status: 400 })
  }

  const mappingByName = new Map()
  const variationIds = new Set()
  for (const mapping of mappings) {
    const nameKey = normalizeImportName(mapping?.sourceName)
    const variationId = clean(mapping?.variationId)
    if (!nameKey || !variationId) continue
    mappingByName.set(nameKey, { sourceName: clean(mapping.sourceName), variationId })
    variationIds.add(variationId)
  }

  const catalog = new Map()
  if (variationIds.size) {
    const placeholders = [...variationIds].map(() => '?').join(',')
    for (const row of db.prepare(`
      SELECT
        v.id AS variation_id, v.item_id, v.vals, v.extras, v.stock,
        i.name, i.group_name, i.category, i.subcategory, i.unit
      FROM variations v
      JOIN items i ON i.id = v.item_id
      WHERE v.active = 1 AND i.active = 1 AND v.id IN (${placeholders})
    `).all(...variationIds)) catalog.set(row.variation_id, row)
  }
  if (catalog.size !== variationIds.size) {
    throw Object.assign(new Error('Uma ou mais variacoes associadas nao existem mais.'), { status: 400 })
  }

  const minimumByVariation = new Map()
  for (const raw of minimumStocks) {
    const sourceName = clean(raw?.sourceName)
    const mapping = mappingByName.get(normalizeImportName(sourceName))
    const rawValue = raw?.minStock
    const value = Number(rawValue)
    if (
      rawValue === null || rawValue === undefined || String(rawValue).trim() === '' ||
      !sourceName || !mapping || !catalog.has(mapping.variationId) ||
      !Number.isFinite(value) || value < 0
    ) {
      throw Object.assign(new Error(`Quantidade minima invalida para "${sourceName || 'produto sem nome'}".`), { status: 400 })
    }
    const minStock = Math.round(value)
    const previous = minimumByVariation.get(mapping.variationId)
    if (previous !== undefined && previous !== minStock) {
      throw Object.assign(new Error(`Quantidades minimas conflitantes para "${sourceName}".`), { status: 400 })
    }
    minimumByVariation.set(mapping.variationId, minStock)
  }

  const preparedRows = []
  const seenRows = new Set()
  for (const raw of rows) {
    const type = clean(raw?.type)
    const rowNumber = Number(raw?.rowNumber)
    const sourceName = clean(raw?.sourceName)
    const qty = parsePositiveQty(raw?.qty)
    const date = new Date(raw?.date || NaN)
    const mapping = mappingByName.get(normalizeImportName(sourceName))
    if (!['entrada', 'saida'].includes(type) || !Number.isInteger(rowNumber) || rowNumber < 2 || !sourceName || !qty || !Number.isFinite(date.getTime())) {
      throw Object.assign(new Error(`Linha invalida na importacao: ${type || 'sem tipo'} ${rowNumber || ''}`.trim()), { status: 400 })
    }
    if (!mapping || !catalog.has(mapping.variationId)) {
      throw Object.assign(new Error(`Resolva o produto "${sourceName}" antes de importar.`), { status: 400 })
    }
    const id = `mov_imp_${crypto.createHash('sha256')
      .update(`controle-almoxarifado|${type}|${rowNumber}`)
      .digest('hex').slice(0, 24)}`
    if (seenRows.has(id)) throw Object.assign(new Error(`Linha repetida: ${type} ${rowNumber}.`), { status: 400 })
    seenRows.add(id)
    preparedRows.push({
      id,
      type,
      rowNumber,
      sourceName,
      qty,
      date: date.toISOString(),
      supplier: clean(raw.supplier),
      unitCost: type === 'entrada' && raw.unitCost !== null && raw.unitCost !== undefined && clean(raw.unitCost) !== '' && Number.isFinite(Number(raw.unitCost)) && Number(raw.unitCost) >= 0 ? Number(raw.unitCost) : null,
      docRef: clean(raw.docRef),
      requestedBy: clean(raw.requestedBy),
      destination: clean(raw.destination),
      sourceOperator: clean(raw.operator),
      variationId: mapping.variationId,
    })
  }

  const operatorId = operator.id || ''
  const operatorName = operator.name || ''
  const result = { movementsCreated: 0, movementsUpdated: 0, movementsSkipped: 0, peopleCreated: 0, minimumStocksUpdated: 0 }

  const importHistory = db.transaction(() => {
    // Include the former variation when a corrected spreadsheet line changes product.
    const existingById = new Map(db.prepare("SELECT * FROM movements WHERE id GLOB 'mov_imp_*'").all().map(row => [row.id, row]))
    const affected = new Set(catalog.keys())
    for (const row of preparedRows) {
      const previous = existingById.get(row.id)
      if (previous) affected.add(previous.variation_id)
    }
    const previousImport = db.prepare(`
      SELECT
        COUNT(*) AS row_count,
        COALESCE(SUM(CASE WHEN affects_stock = 0 THEN 0 WHEN type = 'entrada' THEN qty ELSE -qty END), 0) AS balance,
        COALESCE(SUM(affects_stock = 0 AND id GLOB 'mov_imp_*'), 0) AS legacy_rows
      FROM movements
      WHERE variation_id = ?
    `)
    const stockBaseByVariation = new Map()
    for (const variationId of affected) {
      const item = db.prepare('SELECT stock FROM variations WHERE id = ?').get(variationId)
      if (!item) throw Object.assign(new Error('Uma variacao do historico nao existe mais.'), { status: 409 })
      const previous = previousImport.get(variationId)
      stockBaseByVariation.set(
        variationId,
        previous.legacy_rows === 0
          ? Number(item.stock || 0) - Number(previous.balance || 0)
          : 0
      )
    }

    const people = db.prepare('SELECT id, name FROM people').all()
    const peopleByName = new Map(people.map(person => [normalizeImportName(person.name), person]))
    const createPerson = db.prepare(`
      INSERT INTO people (id, name, role_text, registration, active, status)
      VALUES (?, ?, ?, ?, 0, 'inativo')
    `)

    for (const rawPerson of formerPeople) {
      const name = clean(rawPerson?.name)
      const key = normalizeImportName(name)
      if (!key || isImportAdjustment(name)) continue
      let person = peopleByName.get(key)
      if (!person) {
        person = {
          id: 'person_' + crypto.randomBytes(6).toString('hex'),
          name,
        }
        createPerson.run(person.id, name, clean(rawPerson.role), clean(rawPerson.registration))
        peopleByName.set(key, person)
        result.peopleCreated += 1
      }
      for (const alias of Array.isArray(rawPerson.aliases) ? rawPerson.aliases : []) {
        const aliasKey = normalizeImportName(alias)
        if (aliasKey) peopleByName.set(aliasKey, person)
      }
    }

    for (const row of preparedRows) {
      const name = row.type === 'saida' ? row.requestedBy : ''
      const key = normalizeImportName(name)
      if (!key || isImportAdjustment(name) || peopleByName.has(key)) continue
      const person = {
        id: 'person_' + crypto.randomBytes(6).toString('hex'),
        name,
      }
      createPerson.run(person.id, name, '', '')
      peopleByName.set(key, person)
      result.peopleCreated += 1
    }

    const upsertMapping = db.prepare(`
      INSERT INTO movement_import_mappings (name_key, source_name, variation_id, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(name_key) DO UPDATE SET
        source_name = excluded.source_name,
        variation_id = excluded.variation_id,
        updated_at = excluded.updated_at
    `)
    for (const [nameKey, mapping] of mappingByName) {
      upsertMapping.run(nameKey, mapping.sourceName, mapping.variationId)
    }

    const updateMinimumStock = db.prepare(`
      UPDATE variations
      SET min_stock = ?, min_stock_defined = 1
      WHERE id = ? AND (min_stock IS NOT ? OR min_stock_defined <> 1)
    `)
    for (const [variationId, minStock] of minimumByVariation) {
      result.minimumStocksUpdated += updateMinimumStock.run(minStock, variationId, minStock).changes
    }

    const insertMovement = db.prepare(`
      INSERT OR IGNORE INTO movements (
        id, type, variation_id, item_id, item_name, item_group, item_category, item_subcategory,
        item_unit, variation_values, variation_extras, qty, stock_before, stock_after, date,
        supplier, unit_cost, requested_by, requested_by_person_id, destination, doc_ref, note,
        operator_id, operator_name, affects_stock
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `)
    const updateMovement = db.prepare(`UPDATE movements SET
      variation_id = ?, item_id = ?, item_name = ?, item_group = ?, item_category = ?, item_subcategory = ?,
      item_unit = ?, variation_values = ?, variation_extras = ?, qty = ?, date = ?, supplier = ?, unit_cost = ?,
      requested_by = ?, requested_by_person_id = ?, destination = ?, doc_ref = ?, note = ? WHERE id = ?`)

    for (const row of preparedRows) {
      const item = catalog.get(row.variationId)
      const adjustment = row.type === 'saida' && isImportAdjustment(row.requestedBy)
      const person = adjustment ? null : peopleByName.get(normalizeImportName(row.requestedBy))
      // ponytail: one workbook, row-based identity; reject changed rows unless explicitly reconciling a reviewed snapshot.
      const id = row.id
      const previous = existingById.get(id)
      const sourceNote = `Historico importado da planilha, linha ${row.rowNumber}. Produto: ${row.sourceName}.${row.sourceOperator ? ` Operador na planilha: ${row.sourceOperator}.` : ''}`
      const note = previous?.note && !previous.note.startsWith('Historico importado da planilha, linha ')
        ? previous.note : sourceNote
      const fields = [
        row.variationId, item.item_id, item.name, item.group_name, item.category || '', item.subcategory || '',
        item.unit || '', item.vals || '{}', item.extras || '{}', row.qty, row.date,
        row.type === 'entrada' ? row.supplier : '', row.type === 'entrada' ? row.unitCost : null,
        adjustment ? '' : (person?.name || row.requestedBy), person?.id || '',
        row.type === 'saida' ? row.destination : '', adjustment ? 'AJUSTE' : row.docRef,
        note,
      ]
      const keys = ['variation_id', 'item_id', 'item_name', 'item_group', 'item_category', 'item_subcategory',
        'item_unit', 'variation_values', 'variation_extras', 'qty', 'date', 'supplier', 'unit_cost',
        'requested_by', 'requested_by_person_id', 'destination', 'doc_ref', 'note']
      // Catalog renames do not rewrite historical snapshots on an ordinary reimport.
      const changed = previous && keys.some((key, index) => index !== 1 && (index === 0 || index >= 9) && previous[key] !== fields[index])
      if (changed) {
        if (payload.updateExisting !== true) {
          throw Object.assign(new Error(`A linha ${row.rowNumber} de ${row.type} mudou desde a ultima importacao. Revise e habilite a atualizacao das linhas existentes.`), { status: 409 })
        }
        updateMovement.run(...fields, id)
        db.prepare('UPDATE work_order_items SET qty = ?, variation_id = ?, item_id = ? WHERE movement_id = ?')
          .run(row.qty, row.variationId, item.item_id, id)
        result.movementsUpdated += 1
        continue
      }
      const stock = Number(item.stock || 0)
      const inserted = insertMovement.run(
        id, row.type, row.variationId, item.item_id,
        item.name, item.group_name, item.category || '', item.subcategory || '', item.unit || '',
        item.vals || '{}', item.extras || '{}',
        row.qty, stock, stock, row.date,
        row.type === 'entrada' ? row.supplier : '',
        row.type === 'entrada' ? row.unitCost : null,
        adjustment ? '' : (person?.name || row.requestedBy),
        person?.id || '',
        row.type === 'saida' ? row.destination : '',
        adjustment ? 'AJUSTE' : row.docRef,
        note,
        operatorId, operatorName
      ).changes
      if (inserted) result.movementsCreated += 1
      else result.movementsSkipped += 1
    }

    const importedMovements = db.prepare(`
      SELECT id, type, qty
      FROM movements
      WHERE variation_id = ? AND (affects_stock <> 0 OR id GLOB 'mov_imp_*')
      ORDER BY date, CASE type WHEN 'entrada' THEN 0 ELSE 1 END, rowid
    `)
    const updateImportedMovement = db.prepare(`
      UPDATE movements
      SET stock_before = ?, stock_after = ?, affects_stock = 1
      WHERE id = ?
    `)
    const updateVariationStock = db.prepare('UPDATE variations SET stock = ? WHERE id = ?')

    for (const variationId of affected) {
      let importedStock = stockBaseByVariation.get(variationId)
      for (const movement of importedMovements.all(variationId)) {
        const stockBefore = importedStock
        importedStock = calculateStockAfter(movement.type, stockBefore, movement.qty)
        updateImportedMovement.run(stockBefore, importedStock, movement.id)
      }
      updateVariationStock.run(
        importedStock,
        variationId
      )
    }
  })

  importHistory()
  return result
}
