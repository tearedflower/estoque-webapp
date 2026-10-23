import { Router } from 'express'
import crypto from 'crypto'
import db from '../db.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'

const router = Router()
const targetTypes = new Set(['grupo', 'categoria', 'subcategoria', 'item', 'variacao'])

function cleanTarget(body) {
  const targetType = String(body.targetType || '').trim()
  const targetKey = String(body.targetKey || '').trim()
  const targetLabel = String(body.targetLabel || '').trim()
  if (!targetTypes.has(targetType)) return { error: 'Tipo de alvo invalido.' }
  if (!targetKey) return { error: 'Alvo obrigatorio.' }
  return { targetType, targetKey, targetLabel }
}

function toRule(row) {
  return {
    id: row.id,
    roleName: row.role_name,
    targetType: row.target_type,
    targetKey: row.target_key,
    targetLabel: row.target_label || '',
    days: Number(row.days ?? 30),
    quantity: Number(row.quantity || 1),
    usageReason: row.usage_reason || '',
    active: !!row.active,
  }
}

function toPeriodicity(row) {
  return {
    id: row.id,
    targetType: row.target_type,
    targetKey: row.target_key,
    targetLabel: row.target_label || '',
    days: row.days,
    active: !!row.active,
  }
}

router.get('/role-rules', (req, res) => {
  const rows = db.prepare('SELECT * FROM epi_role_rules ORDER BY role_name, target_label, target_key').all()
  res.json(rows.map(toRule))
})

router.post('/role-rules', requireAuth, requireAdmin, (req, res) => {
  const roleName = String(req.body.roleName || '').trim()
  if (!roleName) return res.status(400).json({ error: 'Cargo obrigatorio.' })
  const target = cleanTarget(req.body)
  if (target.error) return res.status(400).json({ error: target.error })
  const days = Number(req.body.days ?? 30)
  if (!Number.isInteger(days) || days < 0) return res.status(400).json({ error: 'Periodicidade deve ser zero ou maior.' })
  const quantity = Number(req.body.quantity ?? 1)
  if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero.' })
  const usageReason = req.body.usageReason ?? ''
  if (typeof usageReason !== 'string' || usageReason.length > 2000) return res.status(400).json({ error: 'Motivo de uso deve ser um texto de até 2000 caracteres.' })

  const dup = db.prepare(`
    SELECT id FROM epi_role_rules
    WHERE lower(role_name) = lower(?) AND target_type = ? AND target_key = ?
  `).get(roleName, target.targetType, target.targetKey)
  if (dup) return res.status(409).json({ error: 'Este EPI ja esta vinculado ao cargo.' })

  const id = 'epi_rule_' + crypto.randomBytes(6).toString('hex')
  db.prepare(`
    INSERT INTO epi_role_rules (id, role_name, target_type, target_key, target_label, days, quantity, active, usage_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, roleName, target.targetType, target.targetKey, target.targetLabel, days, quantity, req.body.active !== false ? 1 : 0, usageReason.trim())

  res.json({ id, roleName, ...target, days, quantity, usageReason: usageReason.trim(), active: req.body.active !== false })
})

router.put(['/role-rules/periods', '/role-rules/batch'], requireAuth, requireAdmin, (req, res) => {
  const changes = req.body.changes
  const fields = ['days', 'quantity', 'active']
  const valid = (key, value) => key === 'active' ? typeof value === 'boolean' : Number.isSafeInteger(value) && value >= (key === 'quantity' ? 1 : 0)
  if (!Array.isArray(changes) || !changes.length || changes.length > 10000 || changes.some(row =>
    !row || typeof row.id !== 'string' || !row.id.trim() ||
    !fields.some(key => Object.hasOwn(row, key)) ||
    Object.keys(row).some(key => !['id', 'days', 'previousDays', 'quantity', 'previousQuantity', 'active', 'previousActive'].includes(key)) ||
    fields.some(key => {
      const previous = `previous${key[0].toUpperCase()}${key.slice(1)}`
      return (Object.hasOwn(row, key) || Object.hasOwn(row, previous)) && (!valid(key, row[key]) || !valid(key, row[previous]))
    })
  ) || new Set(changes.map(row => row.id)).size !== changes.length) {
    return res.status(400).json({ error: 'Informe vínculos únicos, prazos inteiros de zero ou mais dias e quantidades inteiras maiores que zero.' })
  }
  try {
    const updated = db.transaction(() => {
      const find = db.prepare('SELECT * FROM epi_role_rules WHERE id = ?')
      const update = db.prepare('UPDATE epi_role_rules SET days = ?, quantity = ?, active = ? WHERE id = ?')
      return changes.map(change => {
        const current = find.get(change.id)
        if (!current || (!current.active && change.active !== true) || fields.some(key => Object.hasOwn(change, key) &&
          (key === 'active' ? !!current[key] : current[key]) !== change[`previous${key[0].toUpperCase()}${key.slice(1)}`])) {
          throw Object.assign(new Error('Um vínculo mudou desde a revisão. Recarregue os dados e tente novamente.'), { status: 409 })
        }
        const next = { ...current, days: change.days ?? current.days, quantity: change.quantity ?? current.quantity, active: change.active === undefined ? current.active : Number(change.active) }
        update.run(next.days, next.quantity, next.active, change.id)
        return toRule(next)
      })
    }).immediate()
    res.json(updated)
  } catch (cause) {
    if (cause.status === 409) return res.status(409).json({ error: cause.message })
    throw cause
  }
})

router.put('/role-rules/:id', requireAuth, requireAdmin, (req, res) => {
  const current = db.prepare('SELECT * FROM epi_role_rules WHERE id = ?').get(req.params.id)
  if (!current) return res.status(404).json({ error: 'Regra de EPI nao encontrada.' })
  const roleName = String(req.body.roleName ?? current.role_name).trim()
  if (!roleName) return res.status(400).json({ error: 'Cargo obrigatorio.' })
  const target = cleanTarget({
    targetType: req.body.targetType ?? current.target_type,
    targetKey: req.body.targetKey ?? current.target_key,
    targetLabel: req.body.targetLabel ?? current.target_label,
  })
  if (target.error) return res.status(400).json({ error: target.error })
  const days = req.body.days !== undefined ? Number(req.body.days) : Number(current.days ?? 30)
  if (!Number.isInteger(days) || days < 0) return res.status(400).json({ error: 'Periodicidade deve ser zero ou maior.' })
  const quantity = req.body.quantity !== undefined ? Number(req.body.quantity) : Number(current.quantity || 1)
  if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero.' })
  const usageReason = req.body.usageReason !== undefined ? req.body.usageReason : current.usage_reason || ''
  if (typeof usageReason !== 'string' || usageReason.length > 2000) return res.status(400).json({ error: 'Motivo de uso deve ser um texto de até 2000 caracteres.' })

  const dup = db.prepare(`
    SELECT id FROM epi_role_rules
    WHERE lower(role_name) = lower(?) AND target_type = ? AND target_key = ? AND id != ?
  `).get(roleName, target.targetType, target.targetKey, req.params.id)
  if (dup) return res.status(409).json({ error: 'Este EPI ja esta vinculado ao cargo.' })

  db.prepare(`
    UPDATE epi_role_rules SET role_name=?, target_type=?, target_key=?, target_label=?, days=?, quantity=?, active=?, usage_reason=? WHERE id=?
  `).run(roleName, target.targetType, target.targetKey, target.targetLabel, days, quantity, req.body.active !== false ? 1 : 0, usageReason.trim(), req.params.id)

  res.json({ id: req.params.id, roleName, ...target, days, quantity, usageReason: usageReason.trim(), active: req.body.active !== false })
})

router.delete('/role-rules/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM epi_role_rules WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

router.get('/periodicities', (req, res) => {
  const rows = db.prepare('SELECT * FROM epi_periodicities ORDER BY target_label, target_key').all()
  res.json(rows.map(toPeriodicity))
})

router.post('/periodicities', requireAuth, requireAdmin, (req, res) => {
  const target = cleanTarget(req.body)
  if (target.error) return res.status(400).json({ error: target.error })
  const days = Number(req.body.days)
  if (!Number.isInteger(days) || days <= 0) return res.status(400).json({ error: 'Periodicidade deve ser maior que zero.' })

  const dup = db.prepare('SELECT id FROM epi_periodicities WHERE target_type = ? AND target_key = ?').get(target.targetType, target.targetKey)
  if (dup) return res.status(409).json({ error: 'Periodicidade ja cadastrada para este EPI.' })

  const id = 'epi_period_' + crypto.randomBytes(6).toString('hex')
  db.prepare(`
    INSERT INTO epi_periodicities (id, target_type, target_key, target_label, days, active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, target.targetType, target.targetKey, target.targetLabel, days, req.body.active !== false ? 1 : 0)

  res.json({ id, ...target, days, active: req.body.active !== false })
})

router.put('/periodicities/:id', requireAuth, requireAdmin, (req, res) => {
  const current = db.prepare('SELECT * FROM epi_periodicities WHERE id = ?').get(req.params.id)
  if (!current) return res.status(404).json({ error: 'Periodicidade nao encontrada.' })
  const target = cleanTarget({
    targetType: req.body.targetType ?? current.target_type,
    targetKey: req.body.targetKey ?? current.target_key,
    targetLabel: req.body.targetLabel ?? current.target_label,
  })
  if (target.error) return res.status(400).json({ error: target.error })
  const days = req.body.days !== undefined ? Number(req.body.days) : current.days
  if (!Number.isInteger(days) || days <= 0) return res.status(400).json({ error: 'Periodicidade deve ser maior que zero.' })

  const dup = db.prepare('SELECT id FROM epi_periodicities WHERE target_type = ? AND target_key = ? AND id != ?').get(target.targetType, target.targetKey, req.params.id)
  if (dup) return res.status(409).json({ error: 'Periodicidade ja cadastrada para este EPI.' })

  db.prepare(`
    UPDATE epi_periodicities SET target_type=?, target_key=?, target_label=?, days=?, active=? WHERE id=?
  `).run(target.targetType, target.targetKey, target.targetLabel, days, req.body.active !== false ? 1 : 0, req.params.id)

  res.json({ id: req.params.id, ...target, days, active: req.body.active !== false })
})

router.delete('/periodicities/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM epi_periodicities WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
