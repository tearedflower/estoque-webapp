import { Router } from 'express'
import crypto from 'crypto'
import db from '../db.js'
import { requireAdmin, requireAuth, requireOperator } from '../middleware/auth.js'
import { queuePeopleRoleSync } from '../peopleRoleSync.js'

const router = Router()

function clean(value) {
  return String(value ?? '').trim()
}

function parseWorkHours(value) {
  const hours = clean(value)
  if (!hours) return ''
  const match = /^([01]\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]\d|2[0-3]):([0-5]\d)$/.exec(hours)
  if (!match) return null
  const [, startHour, startMinute, endHour, endMinute] = match
  return `${startHour}:${startMinute} - ${endHour}:${endMinute}`
}

const PERSON_STATUSES = new Set(['ativo', 'inativo', 'demitido', 'afastado'])

function normalizeStatus(value, fallbackActive = true) {
  const status = clean(value).toLowerCase()
  if (PERSON_STATUSES.has(status)) return status
  return fallbackActive ? 'ativo' : 'inativo'
}

function presentPerson(row) {
  const status = normalizeStatus(row.status, !!row.active)
  return {
    id: row.id,
    name: row.name,
    role: row.role_text,
    registration: row.registration || '',
    workHours: row.work_hours || '',
    registrationOrder: row.registration_order || 0,
    active: status === 'ativo',
    status,
  }
}

// GET /api/people
router.get('/', requireAuth, requireOperator, (req, res) => {
  const rows = db.prepare('SELECT *, rowid AS registration_order FROM people ORDER BY name').all()
  res.json(rows.map(presentPerson))
})

// POST /api/people
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const name = clean(req.body.name)
  const role = clean(req.body.role)
  const registration = clean(req.body.registration)
  const workHours = parseWorkHours(req.body.workHours)
  const status = normalizeStatus(req.body.status, req.body.active !== false)
  const active = status === 'ativo'
  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' })
  if (workHours === null) return res.status(400).json({ error: 'Informe o horário no formato HH:MM - HH:MM.' })

  const dup = db.prepare('SELECT id FROM people WHERE lower(name) = lower(?)').get(name)
  if (dup) return res.status(409).json({ error: 'Nome ja existe' })

  const id = 'person_' + crypto.randomBytes(6).toString('hex')
  db.prepare('INSERT INTO people (id, name, role_text, registration, work_hours, active, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, name, role, registration, workHours, active ? 1 : 0, status
  )
  queuePeopleRoleSync()

  res.json({ id, name, role, registration, workHours, active, status, registrationOrder: db.prepare('SELECT rowid AS n FROM people WHERE id = ?').get(id).n })
})

// PUT /api/people/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const current = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id)
  if (!current) return res.status(404).json({ error: 'Pessoa nao encontrada' })

  const name = clean(req.body.name ?? current.name)
  const role = clean(req.body.role ?? current.role_text)
  const registration = clean(req.body.registration ?? current.registration)
  const workHours = parseWorkHours(req.body.workHours ?? current.work_hours)
  const status = normalizeStatus(
    req.body.status,
    req.body.active !== undefined ? req.body.active !== false : !!current.active
  )
  const active = status === 'ativo'
  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' })
  if (workHours === null) return res.status(400).json({ error: 'Informe o horário no formato HH:MM - HH:MM.' })

  const dup = db.prepare('SELECT id FROM people WHERE lower(name) = lower(?) AND id != ?').get(name, req.params.id)
  if (dup) return res.status(409).json({ error: 'Nome ja existe' })

  db.transaction(() => {
    db.prepare('UPDATE people SET name=?, role_text=?, registration=?, work_hours=?, active=?, status=? WHERE id=?').run(
      name, role, registration, workHours, active ? 1 : 0, status, req.params.id
    )
    if (current.name.toLowerCase() !== name.toLowerCase()) {
      db.prepare('UPDATE movements SET requested_by = ? WHERE requested_by_person_id = ? OR lower(requested_by) = lower(?)').run(name, req.params.id, current.name)
      db.prepare('UPDATE work_orders SET requested_by = ? WHERE lower(requested_by) = lower(?)').run(name, current.name)
      db.prepare('UPDATE work_orders SET maintenance_professional = ? WHERE lower(maintenance_professional) = lower(?)').run(name, current.name)
      db.prepare('UPDATE motor_events SET performed_by = ? WHERE lower(performed_by) = lower(?)').run(name, current.name)
    }
  })()
  queuePeopleRoleSync()
  res.json({ id: req.params.id, name, role, registration, workHours, active, status })
})

// DELETE /api/people/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM people WHERE id = ?').run(req.params.id)
  queuePeopleRoleSync()
  res.json({ ok: true })
})

export default router
