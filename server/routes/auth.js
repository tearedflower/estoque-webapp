import { Router } from 'express'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import db from '../db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { getAuthToken } from '../utils/authToken.js'
import { passwordChangeError } from '../utils/authPolicy.js'

const router = Router()
const AUTH_COOKIE = 'auth_token'
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 30

function clean(value) {
  return String(value ?? '').trim()
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username || user.name,
    role: user.role,
    active: user.active,
    mustChangePassword: Boolean(user.must_change_password),
  }
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  }
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const login = clean(req.body.login ?? req.body.username ?? req.body.name)
  const { pin } = req.body
  if (!login || !pin) return res.status(400).json({ error: 'Login e PIN obrigatorios' })

  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run()

  const user = db.prepare(`
    SELECT * FROM users
    WHERE active = 1
      AND (username = ? OR (COALESCE(username, '') = '' AND name = ?))
  `).get(login, login)
  if (!user) return res.status(401).json({ error: 'Login ou senha incorretos' })

  if (!bcryptjs.compareSync(pin, user.pin_hash)) {
    return res.status(401).json({ error: 'Login ou senha incorretos' })
  }

  const token = crypto.randomBytes(32).toString('hex')
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").run(token, user.id)

  res.cookie(AUTH_COOKIE, token, cookieOptions(req))
  res.json({ user: safeUser(user) })
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = getAuthToken(req)
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  res.clearCookie(AUTH_COOKIE, { path: '/' })
  res.json({ ok: true })
})

// GET /api/auth/me
router.get('/me', (req, res) => {
  const token = getAuthToken(req)
  if (!token) return res.status(401).json({ error: 'Nao autenticado' })

  const session = db.prepare(`
    SELECT u.id, u.name, u.username, u.role, u.active, u.must_change_password
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1
  `).get(token)

  if (!session) return res.status(401).json({ error: 'Sessao invalida' })
  res.json(safeUser(session))
})

// GET /api/auth/users
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  const users = db.prepare('SELECT id, name, username, role, active, must_change_password FROM users ORDER BY name').all()
  res.json(users.map(safeUser))
})

// POST /api/auth/users
router.post('/users', requireAuth, requireRole('admin'), (req, res) => {
  const name = clean(req.body.name)
  const username = clean(req.body.username || req.body.login || name)
  const { role, pin } = req.body
  if (!name || !username || !role || !pin) return res.status(400).json({ error: 'Nome, login, papel e PIN obrigatorios' })
  const pinError = passwordChangeError(pin)
  if (pinError) return res.status(400).json({ error: pinError })
  if (!['admin', 'operador', 'visitante'].includes(role)) return res.status(400).json({ error: 'Papel invalido' })

  if (db.prepare('SELECT id FROM users WHERE name = ?').get(name)) {
    return res.status(409).json({ error: 'Nome ja existe' })
  }
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Login ja existe' })
  }

  const id = 'user_' + crypto.randomBytes(6).toString('hex')
  const pin_hash = bcryptjs.hashSync(pin, 10)
  db.prepare('INSERT INTO users (id, name, username, role, pin_hash, must_change_password) VALUES (?, ?, ?, ?, ?, 1)')
    .run(id, name, username, role, pin_hash)

  res.json({ id, name, username, role, active: 1, mustChangePassword: true })
})

// PUT /api/auth/users/:id
router.put('/users/:id', requireAuth, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!target) return res.status(404).json({ error: 'Usuario nao encontrado' })

  const { role, pin, active } = req.body
  const name = req.body.name !== undefined ? clean(req.body.name) : undefined
  const username = req.body.username !== undefined || req.body.login !== undefined
    ? clean(req.body.username ?? req.body.login)
    : undefined
  const isMasterAdmin = req.user?.id === 'user_admin'
  const isSelf = req.user?.id === req.params.id
  const isAdmin = req.user?.role === 'admin'
  const hasProfileChanges = name !== undefined || username !== undefined || role !== undefined || active !== undefined

  if (pin !== undefined) {
    const pinError = passwordChangeError(pin, bcryptjs.compareSync(String(pin).trim(), target.pin_hash))
    if (pinError) return res.status(400).json({ error: pinError })
  }
  if (pin !== undefined && !isSelf && !isMasterAdmin) {
    return res.status(403).json({ error: 'Somente o admin mestre pode alterar senha de outro usuario.' })
  }
  if (hasProfileChanges && !isAdmin) {
    return res.status(403).json({ error: 'Somente admin pode alterar dados de operador.' })
  }

  if (req.params.id === 'user_admin') {
    if (name !== undefined && name !== target.name) return res.status(403).json({ error: 'Nao e possivel alterar o nome do admin padrao.' })
    if (username !== undefined && username !== (target.username || target.name)) return res.status(403).json({ error: 'Nao e possivel alterar o login do admin padrao.' })
    if (role !== undefined && role !== target.role) return res.status(403).json({ error: 'Nao e possivel alterar o papel do admin padrao.' })
    if (active !== undefined && active !== !!target.active) return res.status(403).json({ error: 'Nao e possivel desativar o admin padrao.' })
  }

  if (name !== undefined) {
    if (!name) return res.status(400).json({ error: 'Nome obrigatorio' })
    const dup = db.prepare('SELECT id FROM users WHERE name = ? AND id != ?').get(name, req.params.id)
    if (dup) return res.status(409).json({ error: 'Nome ja existe' })
  }
  if (username !== undefined) {
    if (!username) return res.status(400).json({ error: 'Login obrigatorio' })
    const dup = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.params.id)
    if (dup) return res.status(409).json({ error: 'Login ja existe' })
  }
  if (role !== undefined && !['admin', 'operador', 'visitante'].includes(role)) {
    return res.status(400).json({ error: 'Papel invalido' })
  }

  const updates = []
  const params = []
  if (name !== undefined) { updates.push('name = ?'); params.push(name) }
  if (username !== undefined) { updates.push('username = ?'); params.push(username) }
  if (role !== undefined) { updates.push('role = ?'); params.push(role) }
  if (pin !== undefined) {
    updates.push('pin_hash = ?')
    params.push(bcryptjs.hashSync(String(pin).trim(), 10))
    updates.push('must_change_password = ?')
    params.push(isSelf ? 0 : 1)
  }
  if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0) }

  if (updates.length) {
    params.push(req.params.id)
    db.transaction(() => {
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params)
      if (pin !== undefined || active === false) {
        const keepToken = isSelf && active !== false ? getAuthToken(req) : ''
        db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(req.params.id, keepToken)
      }
    })()
  }

  const updated = db.prepare('SELECT id, name, username, role, active, must_change_password FROM users WHERE id = ?').get(req.params.id)
  res.json(safeUser(updated))
})

// DELETE /api/auth/users/:id
router.delete('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const targetUser = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id)
  if (!targetUser) return res.status(404).json({ error: 'Usuario nao encontrado' })
  if (req.user && req.user.id === req.params.id) {
    return res.status(400).json({ error: 'Nao pode excluir a si mesmo' })
  }
  if (req.params.id === 'user_admin') {
    return res.status(403).json({ error: 'Nao e possivel excluir o admin padrao.' })
  }
  if (targetUser.role === 'admin' && req.user?.id !== 'user_admin') {
    return res.status(403).json({ error: 'Somente o admin mestre pode excluir outro admin.' })
  }
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id)
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
