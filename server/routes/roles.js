import { Router } from 'express'
import crypto from 'crypto'
import db from '../db.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { queuePeopleRoleSync } from '../peopleRoleSync.js'
import { roleNameKey } from '../../src/utils/nameFormat.js'

const router = Router()

// GET /api/roles
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM roles ORDER BY name').all()
  res.json(rows.map(r => ({ id: r.id, name: r.name, description: r.description, sector: r.sector, active: !!r.active })))
})

// POST /api/roles
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, description, sector, active } = req.body
  if (sector !== undefined && (typeof sector !== 'string' || sector.trim().length > 100)) {
    return res.status(400).json({ error: 'Setor deve ter até 100 caracteres.' })
  }
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' })

  const dup = db.prepare('SELECT id, name FROM roles').all().find(role => roleNameKey(role.name) === roleNameKey(name))
  if (dup) return res.status(409).json({ error: 'Nome já existe' })

  const id = 'role_' + crypto.randomBytes(6).toString('hex')
  const nextSector = sector?.trim() || ''
  db.prepare('INSERT INTO roles (id, name, description, sector, active) VALUES (?, ?, ?, ?, ?)').run(
    id, name, description || '', nextSector, active !== false ? 1 : 0
  )
  queuePeopleRoleSync()

  res.json({ id, name, description: description || '', sector: nextSector, active: active !== false })
})

// PUT /api/roles/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const current = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id)
  if (!current) return res.status(404).json({ error: 'Cargo nao encontrado' })
  const { name, description, sector, active } = req.body
  if (sector !== undefined && (typeof sector !== 'string' || sector.trim().length > 100)) {
    return res.status(400).json({ error: 'Setor deve ter até 100 caracteres.' })
  }
  const nextName = String(name ?? current.name).trim()
  if (!nextName) return res.status(400).json({ error: 'Nome obrigatorio' })
  const dup = db.prepare('SELECT id, name FROM roles WHERE id != ?').all(req.params.id).find(role => roleNameKey(role.name) === roleNameKey(nextName))
  if (dup) return res.status(409).json({ error: 'Nome já existe' })

  const nextDescription = description !== undefined ? description || '' : current.description || ''
  const nextSector = sector === undefined ? current.sector : sector.trim()
  const nextActive = active !== undefined ? active !== false : !!current.active
  db.transaction(() => {
    db.prepare('UPDATE roles SET name=?, description=?, sector=?, active=? WHERE id=?').run(
      nextName, nextDescription, nextSector, nextActive ? 1 : 0, req.params.id
    )
    if (current.name.toLowerCase() !== nextName.toLowerCase()) {
      db.prepare('UPDATE people SET role_text = ? WHERE lower(role_text) = lower(?)').run(nextName, current.name)
      db.prepare('UPDATE epi_role_rules SET role_name = ? WHERE lower(role_name) = lower(?)').run(nextName, current.name)
    }
  })()
  queuePeopleRoleSync()
  res.json({ id: req.params.id, name: nextName, description: nextDescription, sector: nextSector, active: nextActive })
})

// DELETE /api/roles/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM roles WHERE id = ?').run(req.params.id)
  queuePeopleRoleSync()
  res.json({ ok: true })
})

export default router
