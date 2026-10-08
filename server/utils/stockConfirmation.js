import crypto from 'node:crypto'

export class StockConfirmationError extends Error {
  constructor(message, code, confirmations = []) {
    super(message)
    this.status = 409
    this.code = code
    this.confirmations = confirmations
  }
}

// Read-only preparation; persist only inside the movement's transaction.
export function prepareStockConfirmations(db, lines, counts = {}) {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
    throw new StockConfirmationError('Contagens inválidas.', 'STOCK_COUNT_INVALID')
  }
  const pending = new Map()
  for (const [index, line] of lines.entries()) {
    const key = line.newCatalog ? `new:${index}` : line.variationId
    if (!key) continue
    const confirmed = !line.newCatalog && db.prepare('SELECT 1 FROM stock_confirmations WHERE variation_id = ?').get(key)
    if (confirmed) {
      if (Object.hasOwn(counts, key)) throw new StockConfirmationError('Este produto já foi conferido em outra operação. Atualize os dados e tente novamente.', 'STOCK_COUNT_STALE')
      continue
    }
    if (!pending.has(key)) {
      const row = line.newCatalog
        ? { name: line.newCatalog.name, unit: line.newCatalog.unit || 'UN', stock: 0, vals: JSON.stringify(Object.fromEntries((line.newCatalog.attributes || []).map(a => [a.name, a.value]))) }
        : db.prepare(`SELECT v.*, i.name, i.unit, i.group_name, i.category, i.subcategory
            FROM variations v JOIN items i ON i.id = v.item_id WHERE v.id = ? AND v.active = 1 AND i.active = 1`).get(key)
      if (!row) continue // The route reports invalid item IDs.
      pending.set(key, { key, row, variationId: line.newCatalog ? null : key, name: row.name, unit: row.unit, values: JSON.parse(row.vals), previousStock: row.stock, delta: 0, minimum: 0 })
    }
    const entry = pending.get(key)
    entry.delta += (line.type === 'saida' ? -1 : 1) * Number(line.qty || 0)
    entry.minimum = Math.max(entry.minimum, -entry.delta)
  }
  const missing = [...pending.values()].filter(entry => !Object.hasOwn(counts, entry.key))
  if (missing.length) {
    throw new StockConfirmationError('Informe a contagem física antes da primeira movimentação.', 'STOCK_CONFIRMATION_REQUIRED', missing.map(({ row, ...entry }) => entry))
  }
  for (const entry of pending.values()) {
    const raw = counts[entry.key]
    if (!['number', 'string'].includes(typeof raw) || String(raw).trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      throw new StockConfirmationError('A contagem deve ser um número igual ou maior que zero.', 'STOCK_COUNT_INVALID')
    }
    entry.countedStock = Number(raw)
  }
  return pending
}

export function applyStockConfirmations(db, pending, operator, date = new Date().toISOString()) {
  const adjustmentIds = []
  for (const entry of pending.values()) {
    const row = db.prepare(`SELECT v.*, i.name, i.unit, i.group_name, i.category, i.subcategory
      FROM variations v JOIN items i ON i.id = v.item_id WHERE v.id = ?`).get(entry.variationId)
    const delta = entry.countedStock - row.stock
    const movementId = delta === 0 ? null : 'mov_' + crypto.randomBytes(12).toString('hex')
    if (movementId) {
      db.prepare(`INSERT INTO movements (id, type, variation_id, item_id, item_name, item_group, item_category, item_subcategory,
        item_unit, variation_values, variation_extras, qty, stock_before, stock_after, date, doc_ref, note, operator_id, operator_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        movementId, delta > 0 ? 'entrada' : 'saida', row.id, row.item_id, row.name, row.group_name, row.category || '', row.subcategory || '',
        row.unit, row.vals, row.extras || '{}', Math.abs(delta), row.stock, entry.countedStock, date,
        'CONFERÊNCIA INICIAL', 'Contagem física antes da primeira movimentação. Correção do saldo anterior.', operator.id || '', operator.name || '')
      adjustmentIds.push(movementId)
    }
    db.prepare('UPDATE variations SET stock = ? WHERE id = ?').run(entry.countedStock, row.id)
    db.prepare(`INSERT INTO stock_confirmations (variation_id, previous_stock, counted_stock, confirmed_at, operator_id, operator_name, movement_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(row.id, row.stock, entry.countedStock, new Date().toISOString(), operator.id || '', operator.name || '', movementId)
  }
  return adjustmentIds
}

export function confirmStockAdjustment(db, variationId, previousStock, countedStock, operator, movementId) {
  db.prepare(`INSERT INTO stock_confirmations (variation_id, previous_stock, counted_stock, confirmed_at, operator_id, operator_name, movement_id)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(variation_id) DO NOTHING`).run(
    variationId, previousStock, countedStock, new Date().toISOString(), operator.id, operator.name, movementId)
}
