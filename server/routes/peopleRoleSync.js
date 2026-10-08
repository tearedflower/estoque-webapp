import { Router } from 'express'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import {
  peopleRoleSyncStatus,
  runPeopleRoleSync,
  setPeopleRoleSyncEnabled,
} from '../peopleRoleSync.js'

const router = Router()

router.get('/', requireAuth, (req, res) => {
  res.json(peopleRoleSyncStatus())
})

router.put('/', requireAuth, requireAdmin, (req, res) => {
  res.json(setPeopleRoleSyncEnabled(req.body.enabled === true))
})

router.post('/run', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json(await runPeopleRoleSync())
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
