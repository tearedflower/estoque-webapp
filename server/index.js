import express from 'express'
import os from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

// Init DB (creates file + tables on first run)
import db, { DB_PATH, ENV_FILE } from './db.js'
import { getBackupSettings, startBackupScheduler } from './backup.js'

import { requireAuth, requireRole } from './middleware/auth.js'
import { apiErrorHandler, corsMiddleware, loginRateLimit, requestLogger, securityHeaders } from './middleware/security.js'
import authRoutes from './routes/auth.js'
import itemRoutes from './routes/items.js'
import movementRoutes from './routes/movements.js'
import locationRoutes from './routes/locations.js'
import destinationRoutes from './routes/destinations.js'
import peopleRoutes from './routes/people.js'
import supplierRoutes from './routes/suppliers.js'
import roleRoutes from './routes/roles.js'
import peopleRoleSyncRoutes from './routes/peopleRoleSync.js'
import epiRoutes from './routes/epis.js'
import seedRoutes from './routes/seed.js'
import workOrderRoutes from './routes/workOrders.js'
import motorRoutes from './routes/motors.js'
import closingRoutes from './routes/closings.js'
import photoBatchRoutes from './routes/photoBatches.js'
import automationRoutes from './routes/automation.js'
import { listThemes } from './utils/themes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.disable('x-powered-by')
app.use(securityHeaders)
app.use(corsMiddleware())
app.use(requestLogger)
app.use(express.json({ limit: '10mb' }))

// ===== API Routes =====

// Auth (no auth required for login)
app.use('/api/auth/login', loginRateLimit)
app.use('/api/auth', authRoutes)
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get()
    res.json({
      ok: true,
      database: 'ok',
      backup: server.backupScheduler?.status() || {
        status: 'starting', lastSuccessAt: '', lastFailureAt: '', nextRunAt: '', intervalHours: 0,
      },
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    })
  } catch {
    res.status(503).json({ ok: false, database: 'error' })
  }
})
app.get('/api/meta', (req, res) => {
  res.json({
    env: ENV_FILE.endsWith('.prod') ? 'PROD' : 'DEV',
    envFile: ENV_FILE,
    port: String(PORT),
  })
})
app.get('/api/themes', (req, res) => {
  const root = join(__dirname, '..', ENV_FILE.endsWith('.prod') ? 'dist' : 'public')
  res.json(listThemes(join(root, 'themes')))
})

// Public read + protected write (auth enforced per-route inside each file)
app.use('/api/items', itemRoutes)
app.use('/api/movements', movementRoutes)
app.use('/api/locations', locationRoutes)
app.use('/api/destinations', destinationRoutes)
app.use('/api/people', peopleRoutes)
app.use('/api/suppliers', supplierRoutes)
app.use('/api/roles', roleRoutes)
app.use('/api/people-role-sync', peopleRoleSyncRoutes)
app.use('/api/epis', epiRoutes)
app.use('/api/seed', seedRoutes)
app.use('/api/work-orders', workOrderRoutes)
app.use('/api/motors', motorRoutes)
app.use('/api/closings', closingRoutes)
app.use('/api/photo-batches', photoBatchRoutes)
app.use('/api/automation', automationRoutes)
app.use('/api', apiErrorHandler)
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

// ===== Serve frontend in production =====
const distPath = join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('/{*path}', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' })
  res.sendFile(join(distPath, 'index.html'))
})

// ===== Start =====
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  server.backupScheduler?.stop()
  server.close(() => {
    db.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

const server = app.listen(PORT, '0.0.0.0', () => {
  server.backupScheduler = startBackupScheduler(db)
  const ip = getLocalIp();
  const backup = getBackupSettings()
  console.log(`✔ Servidor rodando em http://localhost:${PORT}`)
  console.log(`  Acesso na rede: http://${ip}:${PORT}`)
  console.log(`  Ambiente: ${ENV_FILE}`)
  console.log(`  Banco de dados: ${DB_PATH}`)
  console.log(`  Backups: ${backup.enabled ? `${backup.dir} (a cada ${backup.intervalHours}h, mantém ${backup.keep})` : 'desativados'}`)
})
