import { Router } from 'express'
import crypto from 'crypto'
import db from '../db.js'
import { epiVariationCa } from '../../src/utils/epiSheet.js'
import { normalizeSearchText } from '../../src/utils/globalSearch.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'

const router = Router()
const targetTypes = new Set(['grupo', 'categoria', 'subcategoria', 'item', 'variacao'])

function cleanTarget(body) {
  const targetType = String(body.targetType || '').trim()
  const targetKey = String(body.targetKey || '').trim()
  if (!targetTypes.has(targetType)) return { error: 'Tipo de alvo invalido.' }
  if (!targetKey) return { error: 'Alvo obrigatorio.' }
  const item = targetType === 'item'
    ? db.prepare('SELECT group_name, category, subcategory, name FROM items WHERE id = ?').get(targetKey)
    : targetType === 'variacao'
      ? db.prepare('SELECT i.group_name, i.category, i.subcategory, i.name FROM variations v JOIN items i ON i.id = v.item_id WHERE v.id = ?').get(targetKey)
      : null
  const targetLabel = item
    ? [item.group_name, item.category, item.subcategory, item.name].filter(Boolean).join(' > ')
    : ['item', 'variacao'].includes(targetType)
      ? String(body.targetLabel || '').trim()
      : targetKey.split('|').filter(Boolean).join(' > ')
  return { targetType, targetKey, targetLabel }
}

function readRuleFilters(body, current) {
  let attributes = current.required_attributes
  let cas = current.allowed_cas
  if (Object.hasOwn(body, 'requiredAttributes')) {
    const input = body.requiredAttributes
    if (input !== null && (typeof input !== 'object' || Array.isArray(input))) {
      return { error: 'Informe os critérios no formato atributo e valor.' }
    }
    const entries = Object.entries(input || {})
    const names = new Set()
    if (entries.length > 20 || entries.some(([name, value]) => {
      const key = normalizeSearchText(name)
      if (!key || key.length > 100 || names.has(key) || typeof value !== 'string' || !value.trim() || value.length > 200) return true
      names.add(key)
      return false
    })) return { error: 'Use até 20 atributos diferentes, cada um com nome e valor.' }
    attributes = entries.length ? JSON.stringify(Object.fromEntries(entries.map(([name, value]) => [name.trim(), value.trim()]))) : null
  }
  if (Object.hasOwn(body, 'allowedCas')) {
    const input = body.allowedCas
    if (input !== null && (!Array.isArray(input) || input.length > 100 || input.some(ca => typeof ca !== 'string' || !/^\d{0,12}$/.test(ca)))) {
      return { error: 'Informe apenas números de CA. Use a opção própria para aceitar itens sem CA.' }
    }
    cas = input?.length ? JSON.stringify([...new Set(input)]) : null
  }
  return { attributes, cas }
}

function toRule(row) {
  return {
    id: row.id,
    roleName: row.role_name,
    personId: row.person_id || null,
    targetType: row.target_type,
    targetKey: row.target_key,
    targetLabel: row.target_label || '',
    days: Number(row.days ?? 30),
    quantity: Number(row.quantity || 1),
    usageReason: row.usage_reason || '',
    observation: row.observation || '',
    active: !!row.active,
    allowedCas: row.allowed_cas == null ? null : JSON.parse(row.allowed_cas),
    requiredAttributes: row.required_attributes == null ? null : JSON.parse(row.required_attributes),
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

  const approval = target.targetType === 'item' && Object.hasOwn(req.body, 'allowedCas')
    ? approvedCasForItem(target.targetKey, req.body.allowedCas)
    : { cas: null }
  if (approval.error) return res.status(400).json({ error: approval.error })

  const dup = db.prepare(`
    SELECT id FROM epi_role_rules
    WHERE lower(role_name) = lower(?) AND target_type = ? AND target_key = ?
  `).get(roleName, target.targetType, target.targetKey)
  if (dup) return res.status(409).json({ error: 'Este EPI ja esta vinculado ao cargo.' })

  const id = 'epi_rule_' + crypto.randomBytes(6).toString('hex')
  db.prepare(`
    INSERT INTO epi_role_rules (id, role_name, target_type, target_key, target_label, days, quantity, active, usage_reason, allowed_cas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, roleName, target.targetType, target.targetKey, target.targetLabel, days, quantity, req.body.active !== false ? 1 : 0, usageReason.trim(), approval.cas)

  res.json(toRule(db.prepare('SELECT * FROM epi_role_rules WHERE id = ?').get(id)))
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

function approvedCasForItem(itemId, input) {
  if (!Array.isArray(input) || !input.length || input.length > 100 ||
    input.some(ca => typeof ca !== 'string' || !/^\d{1,12}$/.test(ca))) {
    return { error: 'Informe pelo menos um CA aceito para este item.' }
  }
  const rows = db.prepare('SELECT vals, extras FROM variations WHERE item_id = ? AND active = 1').all(itemId)
  const available = new Set(rows.map(row => epiVariationCa(JSON.parse(row.vals || '{}'), JSON.parse(row.extras || '{}'))))
  const missing = input.filter(ca => !available.has(ca))
  if (missing.length) return { error: `CA sem variação ativa neste item: ${missing.join(', ')}.` }
  return { cas: JSON.stringify([...new Set(input)]) }
}

router.put('/role-rules/use-item', requireAuth, requireAdmin, (req, res) => {
  const { changes, allowedCas } = req.body
  if (!Array.isArray(changes) || !changes.length || changes.length > 1000 ||
    changes.some(row => typeof row?.id !== 'string' || (
      typeof row.previousVariationId !== 'string' && (
        typeof row.previousItemId !== 'string' ||
        !(row.previousAllowedCas === null || Array.isArray(row.previousAllowedCas))
      )
    )) ||
    new Set(changes.map(row => row.id)).size !== changes.length) {
    return res.status(400).json({ error: 'Selecione vínculos de item ou variação válidos.' })
  }

  const currentRule = db.prepare('SELECT * FROM epi_role_rules WHERE id = ?')
  const parentItem = db.prepare('SELECT i.* FROM variations v JOIN items i ON i.id = v.item_id WHERE v.id = ? AND i.active = 1')
  const activeItem = db.prepare('SELECT * FROM items WHERE id = ? AND active = 1')
  const duplicate = db.prepare(`
    SELECT 1 FROM epi_role_rules WHERE lower(role_name) = lower(?)
      AND person_id IS ? AND target_type = 'item' AND target_key = ?
  `)
  const update = db.prepare(`
    UPDATE epi_role_rules SET target_type = 'item', target_key = ?, target_label = ?,
      allowed_cas = ? WHERE id = ?
  `)
  const conflict = message => Object.assign(new Error(message), { status: 409 })
  try {
    const updated = db.transaction(() => changes.map(({ id, previousVariationId, previousItemId, previousAllowedCas }) => {
      const rule = currentRule.get(id)
      const converting = typeof previousVariationId === 'string'
      const currentCas = rule?.allowed_cas == null ? null : JSON.parse(rule.allowed_cas)
      if (!rule || rule.target_type !== (converting ? 'variacao' : 'item') ||
        rule.target_key !== (converting ? previousVariationId : previousItemId) ||
        (!converting && JSON.stringify(currentCas) !== JSON.stringify(previousAllowedCas))) {
        throw conflict('Um vínculo mudou. Recarregue os dados e tente novamente.')
      }
      const item = (converting ? parentItem : activeItem).get(rule.target_key)
      if (!item) throw conflict('O item não está disponível.')
      const approval = approvedCasForItem(item.id, allowedCas)
      if (approval.error) throw conflict(approval.error)
      if (converting && duplicate.get(rule.role_name, rule.person_id ?? null, item.id)) {
        throw conflict(`${rule.role_name} já tem um vínculo com ${item.name}. Revise os vínculos antes de continuar.`)
      }
      update.run(item.id, [item.group_name, item.category, item.subcategory, item.name].filter(Boolean).join(' > '), approval.cas, id)
      return toRule(currentRule.get(id))
    })).immediate()
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

  const observation = req.body.observation ?? current.observation ?? ''
  if (typeof observation !== 'string' || observation.length > 2000) {
    return res.status(400).json({ error: 'Observação deve ter até 2000 caracteres.' })
  }

  const filters = readRuleFilters(req.body, current)
  if (filters.error) return res.status(400).json({ error: filters.error })
  const changedTarget = target.targetType !== current.target_type || target.targetKey !== current.target_key
  if (target.targetType === 'item' && (changedTarget || Object.hasOwn(req.body, 'allowedCas'))) {
    const approval = approvedCasForItem(target.targetKey, req.body.allowedCas)
    if (approval.error) return res.status(400).json({ error: approval.error })
    filters.cas = approval.cas
  } else if (changedTarget && current.target_type === 'item' && current.allowed_cas) {
    if (target.targetType !== 'variacao') return res.status(400).json({ error: 'Para substituir um item com CAs aceitos, escolha outro item ou uma variação específica.' })
    filters.cas = null
  }

  const dup = db.prepare(`
    SELECT id FROM epi_role_rules
    WHERE lower(role_name) = lower(?) AND target_type = ? AND target_key = ? AND id != ?
  `).get(roleName, target.targetType, target.targetKey, req.params.id)
  if (dup) return res.status(409).json({ error: 'Este EPI ja esta vinculado ao cargo.' })

  db.prepare(`
    UPDATE epi_role_rules SET role_name=?, target_type=?, target_key=?, target_label=?, days=?, quantity=?, active=?, usage_reason=?, observation=?, required_attributes=?, allowed_cas=? WHERE id=?
  `).run(roleName, target.targetType, target.targetKey, target.targetLabel, days, quantity, (req.body.active ?? !!current.active) ? 1 : 0, usageReason.trim(), observation.trim(), filters.attributes, filters.cas, req.params.id)

  res.json(toRule(db.prepare('SELECT * FROM epi_role_rules WHERE id = ?').get(req.params.id)))
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
