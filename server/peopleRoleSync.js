import { dirname, join } from 'node:path'
import db, { DB_PATH, ENV_FILE } from './db.js'
import { promotePeopleRoles, resolveDbPathFromEnv } from './scripts/promotePeopleRoles.js'

const SETTING_KEY = 'people_roles_sync_enabled'
let timer = null
let rerunRequested = false
const state = {
  running: false,
  lastSuccessAt: '',
  lastError: '',
  lastResult: null,
}

function available() {
  return ENV_FILE.endsWith('.dev')
}

function enabled() {
  return available() && db.prepare('SELECT value FROM app_settings WHERE key = ?').pluck().get(SETTING_KEY) === '1'
}

export function peopleRoleSyncStatus() {
  return {
    available: available(),
    enabled: enabled(),
    running: state.running,
    pending: Boolean(timer) || rerunRequested,
    lastSuccessAt: state.lastSuccessAt,
    lastError: state.lastError,
    lastResult: state.lastResult,
  }
}

export function setPeopleRoleSyncEnabled(value) {
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(SETTING_KEY, value ? '1' : '0')
  if (!value && timer) {
    clearTimeout(timer)
    timer = null
  }
  if (value) queuePeopleRoleSync()
  return peopleRoleSyncStatus()
}

export function queuePeopleRoleSync() {
  if (!enabled()) return
  if (state.running) {
    rerunRequested = true
    return
  }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    runPeopleRoleSync().catch(() => {})
  }, 750)
  timer.unref?.()
}

export async function runPeopleRoleSync() {
  if (!available()) throw new Error('A sincronizacao de pessoas e cargos so pode ser executada no ambiente DEV.')
  if (state.running) return peopleRoleSyncStatus()
  if (timer) {
    clearTimeout(timer)
    timer = null
  }

  state.running = true
  state.lastError = ''
  try {
    const prodPath = resolveDbPathFromEnv('.env.prod', './server/estoque-prod.db')
    const result = await promotePeopleRoles({
      devPath: DB_PATH,
      prodPath,
      backupDir: join(dirname(prodPath), 'backups'),
    })
    state.lastSuccessAt = new Date().toISOString()
    state.lastResult = result
  } catch (error) {
    state.lastError = error.message || 'Nao foi possivel sincronizar pessoas e cargos.'
    throw error
  } finally {
    state.running = false
    if (rerunRequested) {
      rerunRequested = false
      queuePeopleRoleSync()
    }
  }
  return peopleRoleSyncStatus()
}
