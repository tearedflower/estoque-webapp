import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

function clean(value, max = 240) {
  return String(value ?? '').trim().slice(0, max)
}

router.get('/recent-defaults', requireAuth, (req, res) => {
  const variationId = clean(req.query.variationId, 160)
  const type = req.query.type === 'entrada' ? 'entrada' : req.query.type === 'saida' ? 'saida' : ''
  if (!variationId || !type) return res.status(400).json({ error: 'Informe variação e tipo.' })
  const row = db.prepare(`
    SELECT supplier, unit_cost, requested_by, requested_by_person_id, destination, doc_ref
    FROM movements
    WHERE variation_id = ? AND type = ?
    ORDER BY date DESC
    LIMIT 1
  `).get(variationId, type)
  res.json(row ? {
    supplier: row.supplier || '',
    unitCost: row.unit_cost,
    requestedBy: row.requested_by || '',
    requestedByPersonId: row.requested_by_person_id || '',
    destination: row.destination || '',
    docRef: row.doc_ref || '',
  } : {})
})

export default router
