import { Router } from 'express'
import db from '../db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

function nowIso() {
  return new Date().toISOString()
}

function parseClosing(row, includeData = false) {
  const data = JSON.parse(row.data || '{}')
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    closedAt: row.closed_at,
    closedById: row.closed_by_id || '',
    closedByName: row.closed_by_name || '',
    notes: row.notes || '',
    summary: data.summary || {},
    ...(includeData ? { data } : {}),
  }
}

function monthWindow(year, month) {
  const from = new Date(year, month - 1, 1)
  const to = new Date(year, month, 1)
  const end = new Date(to.getTime() - 1)
  return { from, to, end }
}

function buildClosingData(year, month) {
  const { from, to, end } = monthWindow(year, month)
  const toIso = to.toISOString()

  const items = db.prepare('SELECT * FROM items ORDER BY group_name, category, subcategory, name').all()
  const variations = db.prepare('SELECT * FROM variations ORDER BY item_id').all()
  const movements = db.prepare('SELECT * FROM movements WHERE date < ? ORDER BY date ASC').all(toIso)
  const laterMovements = db.prepare('SELECT variation_id, type, qty FROM movements WHERE date >= ?').all(toIso)

  const itemById = new Map(items.map(item => [item.id, item]))
  const laterNetByVariation = new Map()
  for (const movement of laterMovements) {
    const signed = movement.type === 'entrada' ? movement.qty : -movement.qty
    laterNetByVariation.set(movement.variation_id, (laterNetByVariation.get(movement.variation_id) || 0) + signed)
  }

  const monthTotalsByVariation = new Map()
  let movementMath = 0
  let partialMovements = 0
  let movementCount = 0
  for (const movement of movements) {
    const date = new Date(movement.date)
    if (date < from || date >= to) continue
    movementCount += 1
    const expectedStock = movement.type === 'entrada'
      ? Number(movement.stock_before) + Number(movement.qty)
      : Number(movement.stock_before) - Number(movement.qty)
    if (Number.isFinite(expectedStock) && Math.abs(expectedStock - Number(movement.stock_after)) > 0.0001) {
      movementMath += 1
    }
    if (
      (movement.type === 'entrada' && !String(movement.supplier || '').trim()) ||
      (movement.type === 'saida' && (!String(movement.requested_by || '').trim() || !String(movement.destination || '').trim()))
    ) {
      partialMovements += 1
    }
    const current = monthTotalsByVariation.get(movement.variation_id) || { entradas: 0, saidas: 0 }
    if (movement.type === 'entrada') current.entradas += movement.qty
    else current.saidas += movement.qty
    monthTotalsByVariation.set(movement.variation_id, current)
  }

  const rows = variations.map(variation => {
    const item = itemById.get(variation.item_id) || {}
    const monthTotals = monthTotalsByVariation.get(variation.id) || { entradas: 0, saidas: 0 }
    const currentStock = variation.stock || 0
    const stockAtClose = currentStock - (laterNetByVariation.get(variation.id) || 0)
    const stockMonthStart = stockAtClose - monthTotals.entradas + monthTotals.saidas
    return {
      variationId: variation.id,
      itemId: variation.item_id,
      itemName: item.name || '',
      group: item.group_name || '',
      category: item.category || '',
      subcategory: item.subcategory || '',
      unit: item.unit || 'UN',
      variationValues: JSON.parse(variation.vals || '{}'),
      variationExtras: JSON.parse(variation.extras || '{}'),
      location: variation.location || '',
      destinations: JSON.parse(variation.destinations || '[]'),
      minStock: variation.min_stock_defined ? variation.min_stock : null,
      stockMonthStart,
      stockAtClose,
      currentStock,
      monthEntradas: monthTotals.entradas,
      monthSaidas: monthTotals.saidas,
    }
  })

  const groupTotals = {}
  for (const row of rows) {
    const key = row.group || 'Sem grupo'
    if (!groupTotals[key]) groupTotals[key] = { group: key, variations: 0, stockAtClose: 0, monthEntradas: 0, monthSaidas: 0 }
    groupTotals[key].variations += 1
    groupTotals[key].stockAtClose += row.stockAtClose
    groupTotals[key].monthEntradas += row.monthEntradas
    groupTotals[key].monthSaidas += row.monthSaidas
  }

  const summary = {
    year,
    month,
    closedThrough: end.toISOString(),
    variations: rows.length,
    items: items.length,
    totalStockAtClose: rows.reduce((sum, row) => sum + row.stockAtClose, 0),
    monthEntradas: rows.reduce((sum, row) => sum + row.monthEntradas, 0),
    monthSaidas: rows.reduce((sum, row) => sum + row.monthSaidas, 0),
    movementCount,
    zeroStock: rows.filter(row => row.stockAtClose <= 0).length,
    belowMin: rows.filter(row => row.minStock > 0 && row.stockAtClose > 0 && row.stockAtClose <= row.minStock).length,
    inconsistencies: {
      negativeStock: rows.filter(row => row.stockAtClose < 0).length,
      movementMath,
      partialMovements,
    },
    groups: Object.values(groupTotals).sort((a, b) => a.group.localeCompare(b.group)),
  }

  return { summary, rows }
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM monthly_closings ORDER BY year DESC, month DESC').all()
  res.json(rows.map(row => parseClosing(row)))
})

router.get('/preview', requireAuth, requireRole('admin'), (req, res) => {
  const year = Number(req.query.year)
  const month = Number(req.query.month)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ error: 'Ano invalido' })
  if (!Number.isInteger(month) || month < 1 || month > 12) return res.status(400).json({ error: 'Mes invalido' })
  res.json(buildClosingData(year, month).summary)
})

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM monthly_closings WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Fechamento nao encontrado' })
  res.json(parseClosing(row, true))
})

router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  const year = Number(req.body.year)
  const month = Number(req.body.month)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ error: 'Ano invalido' })
  if (!Number.isInteger(month) || month < 1 || month > 12) return res.status(400).json({ error: 'Mes invalido' })

  const id = `close_${year}_${String(month).padStart(2, '0')}`
  const data = buildClosingData(year, month)
  const expectedMovementCount = Number(req.body.expectedMovementCount)
  if (Number.isInteger(expectedMovementCount) && expectedMovementCount !== data.summary.movementCount) {
    return res.status(409).json({ error: 'As movimentações mudaram desde a prévia. Revise o fechamento novamente.' })
  }
  const closedAt = nowIso()

  db.prepare(`INSERT INTO monthly_closings (
    id, year, month, closed_at, closed_by_id, closed_by_name, notes, data
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(year, month) DO UPDATE SET
    closed_at=excluded.closed_at,
    closed_by_id=excluded.closed_by_id,
    closed_by_name=excluded.closed_by_name,
    notes=excluded.notes,
    data=excluded.data`).run(
    id,
    year,
    month,
    closedAt,
    req.user?.id || '',
    req.user?.name || '',
    req.body.notes || '',
    JSON.stringify(data)
  )

  const row = db.prepare('SELECT * FROM monthly_closings WHERE id = ?').get(id)
  res.json(parseClosing(row, true))
})

router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM monthly_closings WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
