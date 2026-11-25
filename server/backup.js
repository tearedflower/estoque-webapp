import Database from 'better-sqlite3'
import { copyFile, mkdir, readdir, rename, rm, stat } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { copyVerifiedPhotos, photoUploadDir, snapshotPhotos } from './utils/backupPhotos.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_BACKUP_DIR = join(__dirname, 'backups')
const BACKUP_PREFIX = 'estoque-'
const BACKUP_EXT = '.db'

function envInt(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function getBackupSettings() {
  const legacyKeep = envInt('BACKUP_KEEP', 24)
  return {
    enabled: process.env.BACKUP_ENABLED !== 'false',
    dir: process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR,
    keep: legacyKeep,
    keepHourly: envInt('BACKUP_KEEP_HOURLY', legacyKeep),
    keepDaily: envInt('BACKUP_KEEP_DAILY', 30),
    keepMonthly: envInt('BACKUP_KEEP_MONTHLY', 12),
    intervalHours: envInt('BACKUP_INTERVAL_HOURS', 24),
    mirrorDir: String(process.env.BACKUP_MIRROR_DIR || '').trim(),
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function retentionSet(backups, { keepHourly, keepDaily, keepMonthly }) {
  const keep = new Set(backups.slice(0, keepHourly).map(file => file.name))
  const daily = new Set()
  const monthly = new Set()
  for (const file of backups) {
    const day = file.modified.toISOString().slice(0, 10)
    const month = day.slice(0, 7)
    if (daily.size < keepDaily && !daily.has(day)) {
      daily.add(day)
      keep.add(file.name)
    }
    if (monthly.size < keepMonthly && !monthly.has(month)) {
      monthly.add(month)
      keep.add(file.name)
    }
  }
  return keep
}

async function cleanupOldBackups(dir, settings) {
  const files = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const names = files
    .filter(file => file.isFile() && file.name.startsWith(BACKUP_PREFIX) && file.name.endsWith(BACKUP_EXT))
    .map(file => file.name)
  const backups = await Promise.all(names.map(async name => ({
    name,
    modified: (await stat(join(dir, name))).mtime,
  })))
  backups.sort((a, b) => b.modified - a.modified || b.name.localeCompare(a.name))
  const keep = retentionSet(backups, settings)
  for (const file of backups.filter(file => !keep.has(file.name))) {
    await rm(join(dir, file.name), { force: true })
    await rm(join(dir, file.name) + '.photos', { recursive: true, force: true })
  }
}

export function verifyBackup(path) {
  const check = new Database(path, { readonly: true, fileMustExist: true })
  try {
    const integrity = check.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') throw new Error(`integrity_check: ${integrity}`)
    check.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get()
    return true
  } finally {
    check.close()
  }
}

async function restoreDrill(path) {
  const drillPath = `${path}.restore-drill.tmp`
  await copyFile(path, drillPath)
  try {
    verifyBackup(drillPath)
  } finally {
    await rm(drillPath, { force: true })
  }
}

async function mirrorBackup(path, mirrorDir) {
  if (!mirrorDir || resolve(mirrorDir) === resolve(dirname(path))) return ''
  await mkdir(mirrorDir, { recursive: true })
  const mirroredPath = join(mirrorDir, path.split(/[\\/]/).pop())
  await copyVerifiedPhotos(path + '.photos', mirroredPath + '.photos')
  await copyFile(path, mirroredPath + '.tmp')
  verifyBackup(mirroredPath + '.tmp')
  await rename(mirroredPath + '.tmp', mirroredPath)
  return mirroredPath
}

export async function createBackup(db, options = {}) {
  const settings = getBackupSettings()
  const dir = options.dir || settings.dir
  const retention = {
    keepHourly: options.keepHourly || options.keep || settings.keepHourly,
    keepDaily: options.keepDaily || settings.keepDaily,
    keepMonthly: options.keepMonthly || settings.keepMonthly,
  }
  const mirrorDir = options.mirrorDir ?? settings.mirrorDir
  await mkdir(dir, { recursive: true })

  const finalPath = join(dir, `${BACKUP_PREFIX}${timestamp()}${BACKUP_EXT}`)
  const tmpPath = `${finalPath}.tmp`

  try {
    await db.backup(tmpPath)
    verifyBackup(tmpPath)
    await snapshotPhotos(tmpPath, tmpPath + '.photos', options.photoDir ?? photoUploadDir())
    await rename(tmpPath + '.photos', finalPath + '.photos')
    await rename(tmpPath, finalPath)
  } catch (error) {
    await rm(tmpPath, { force: true })
    await rm(tmpPath + '.photos', { recursive: true, force: true })
    throw error
  }
  await restoreDrill(finalPath)
  await mirrorBackup(finalPath, mirrorDir)
  await cleanupOldBackups(dir, retention)

  return finalPath
}

export function startBackupScheduler(db) {
  const settings = getBackupSettings()
  const state = {
    status: settings.enabled ? 'pending' : 'disabled',
    lastSuccessAt: '',
    lastFailureAt: '',
    lastVerifiedAt: '',
    lastPath: '',
    integrity: settings.enabled ? 'pending' : 'disabled',
    mirror: settings.mirrorDir ? 'pending' : 'not-configured',
    nextRunAt: '',
    intervalHours: settings.intervalHours,
  }
  if (!settings.enabled) {
    console.log('Backups automaticos desativados por BACKUP_ENABLED=false')
    return {
      runNow: async () => null,
      status: () => ({ ...state }),
      stop() {},
    }
  }

  const intervalHours = settings.intervalHours
  const intervalMs = intervalHours * 60 * 60 * 1000
  let timer = null

  const run = async () => {
    state.status = 'running'
    state.nextRunAt = ''
    try {
      const path = await createBackup(db)
      state.status = 'ok'
      state.lastSuccessAt = new Date().toISOString()
      state.lastVerifiedAt = state.lastSuccessAt
      state.lastPath = path
      state.integrity = 'ok'
      state.mirror = settings.mirrorDir ? 'ok' : 'not-configured'
      console.log(`Backup SQLite criado: ${path}`)
      return path
    } catch (err) {
      state.status = 'error'
      state.lastFailureAt = new Date().toISOString()
      state.integrity = 'error'
      if (settings.mirrorDir) state.mirror = 'error'
      console.error('Falha ao criar backup SQLite:', err.message)
      return null
    }
  }

  const schedule = delay => {
    state.nextRunAt = new Date(Date.now() + delay).toISOString()
    timer = setTimeout(async () => {
      await run()
      schedule(intervalMs)
    }, delay)
    timer.unref?.()
  }

  schedule(5000)

  return {
    runNow: async () => {
      clearTimeout(timer)
      const result = await run()
      schedule(intervalMs)
      return result
    },
    status: () => ({ ...state }),
    stop() {
      clearTimeout(timer)
    }
  }
}
