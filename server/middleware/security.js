import crypto from 'node:crypto'
import cors from 'cors'
import { StockConfirmationError } from '../utils/stockConfirmation.js'

const loginAttempts = new Map()
const LOGIN_LIMIT = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000

function allowedOrigins() {
  return new Set(String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean))
}

export function corsMiddleware() {
  return cors((req, done) => {
    const origin = req.get('origin')
    let allowed = !origin
    try {
      const url = origin ? new URL(origin) : null
      allowed ||= url?.host === req.get('host')
      allowed ||= ['localhost', '127.0.0.1'].includes(url?.hostname)
      allowed ||= allowedOrigins().has(origin)
    } catch {
      allowed = false
    }
    done(null, { origin: allowed ? origin || false : false, credentials: true })
  })
}

export function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  })
  next()
}

export function requestLogger(req, res, next) {
  if (!req.path.startsWith('/api')) return next()
  const startedAt = performance.now()
  const requestId = crypto.randomUUID()
  req.requestId = requestId
  res.set('X-Request-Id', requestId)
  res.on('finish', () => console.log(JSON.stringify({
    type: 'request',
    requestId,
    method: req.method,
    path: req.path,
    status: res.statusCode,
    durationMs: Math.round(performance.now() - startedAt),
  })))
  next()
}

export function apiErrorHandler(error, req, res, next) {
  if (error instanceof StockConfirmationError && !res.headersSent) {
    return res.status(error.status).json({ error: error.message, code: error.code, confirmations: error.confirmations })
  }
  console.error(JSON.stringify({
    type: 'error',
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    message: error.message,
  }))
  if (res.headersSent) return next(error)
  const status = Number(error.status) >= 400 && Number(error.status) < 500 ? Number(error.status) : 500
  res.status(status).json({ error: status < 500 ? 'Requisicao invalida.' : 'Erro interno do servidor.' })
}

export function loginRateLimit(req, res, next) {
  const now = Date.now()
  const key = req.ip || req.socket.remoteAddress || 'unknown'
  const current = loginAttempts.get(key)
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + LOGIN_WINDOW_MS }
    : current

  if (bucket.count >= LOGIN_LIMIT) {
    res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde e tente novamente.' })
  }

  bucket.count += 1
  loginAttempts.set(key, bucket)
  res.on('finish', () => {
    if (res.statusCode < 400) loginAttempts.delete(key)
  })
  next()
}
