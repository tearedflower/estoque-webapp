import { Router } from 'express'
import db, { ENV_FILE } from '../db.js'
import { requireAdmin, requireAuth, requireRole } from '../middleware/auth.js'
import { seedMutationAllowed } from '../utils/maintenanceGuard.js'
import { populateSeedData, resetBusinessData } from '../utils/seedDataStore.js'

const router = Router()

function requireSeedEnvironment(req, res, next) {
  if (!seedMutationAllowed(ENV_FILE, process.env.ENABLE_SEED_ROUTES === 'true')) {
    return res.status(403).json({ error: 'Ferramentas de seed desativadas neste ambiente.' })
  }
  next()
}

router.get('/order', (req, res) => {
  const row = db.prepare('SELECT data FROM display_order WHERE id = 1').get()
  res.json(JSON.parse(row?.data || '{}'))
})

router.put('/order', requireAuth, requireAdmin, (req, res) => {
  db.prepare('UPDATE display_order SET data = ? WHERE id = 1').run(JSON.stringify(req.body || {}))
  res.json({ ok: true })
})

router.post('/populate', requireAuth, requireRole('admin'), requireSeedEnvironment, (req, res) => {
  if (!Array.isArray(req.body.items) || !Array.isArray(req.body.variations)) {
    return res.status(400).json({ error: 'items e variations obrigatórios' })
  }

  const result = db.transaction(() => {
    resetBusinessData(db)
    return populateSeedData(db, req.body)
  })()
  res.json({ ok: true, ...result })
})

router.post('/reset', requireAuth, requireRole('admin'), requireSeedEnvironment, (req, res) => {
  db.transaction(() => resetBusinessData(db))()
  res.json({ ok: true })
})

export default router
