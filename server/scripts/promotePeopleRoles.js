import Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { argValue, resolveEnvPath } from '../env.js'
import { formatPersonName, formatRoleName, roleNameKey } from '../../src/utils/nameFormat.js'

export const PROMOTE_CONFIRMATION = 'ENVIAR_PESSOAS_CARGOS_PARA_PROD'
const PERSON_STATUSES = new Set(['ativo', 'inativo', 'demitido', 'afastado'])

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function readEnvFile(envFile) {
  const envPath = resolve(process.cwd(), envFile)
  const values = {}
  if (!existsSync(envPath)) return values

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const index = trimmed.indexOf('=')
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key) values[key] = value
  }
  return values
}

export function resolveDbPathFromEnv(envFile, fallback) {
  return resolveEnvPath(readEnvFile(envFile).DB_PATH, fallback)
}

export function assertPromoteAllowed(confirmation) {
  if (confirmation !== PROMOTE_CONFIRMATION) {
    throw new Error(`Promocao bloqueada. Confirme com --confirm=${PROMOTE_CONFIRMATION}`)
  }
}

function key(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR')
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function assertRequiredTables(db, label) {
  for (const table of ['roles', 'people']) {
    if (!tableExists(db, table)) throw new Error(`Tabela ${table} nao encontrada no banco ${label}. Inicie o servidor desse ambiente uma vez antes de promover.`)
  }
}

function generateId(prefix, usedIds) {
  let id = ''
  do {
    id = `${prefix}_${randomBytes(6).toString('hex')}`
  } while (usedIds.has(id))
  usedIds.add(id)
  return id
}

function chooseId(preferred, prefix, usedIds) {
  if (preferred && !usedIds.has(preferred)) {
    usedIds.add(preferred)
    return preferred
  }
  return generateId(prefix, usedIds)
}

export async function promotePeopleRoles({ devPath, prodPath, backupDir = join(dirname(prodPath), 'backups') }) {
  const sourcePath = resolve(devPath)
  const targetPath = resolve(prodPath)
  if (sourcePath === targetPath) throw new Error('DEV e PROD estao apontando para o mesmo banco.')
  if (!existsSync(sourcePath)) throw new Error(`Banco DEV nao encontrado: ${sourcePath}`)
  if (!existsSync(targetPath)) throw new Error(`Banco PROD nao encontrado: ${targetPath}`)

  const dev = new Database(sourcePath, { readonly: true, fileMustExist: true })
  const prod = new Database(targetPath, { fileMustExist: true })
  try {
    prod.pragma('busy_timeout = 1000')
    assertRequiredTables(dev, 'DEV')
    assertRequiredTables(prod, 'PROD')

    await mkdir(backupDir, { recursive: true })
    const backupPath = join(backupDir, `antes-pessoas-cargos-${timestamp()}.db`)
    await prod.backup(backupPath)

    const devRoles = dev.prepare('SELECT id, name, description, active FROM roles ORDER BY name').all()
    const devPeople = dev.prepare('SELECT id, name, role_text, registration, active, status FROM people ORDER BY name').all()
    const prodRoles = prod.prepare('SELECT id, name FROM roles').all()
    const prodPeople = prod.prepare('SELECT id, name FROM people').all()
    const usedRoleIds = new Set(prodRoles.map(row => row.id))
    const usedPersonIds = new Set(prodPeople.map(row => row.id))
    const roleByName = new Map(prodRoles.map(row => [roleNameKey(row.name), row]))
    const personByName = new Map(prodPeople.map(row => [key(row.name), row]))
    const result = { rolesInserted: 0, rolesUpdated: 0, peopleInserted: 0, peopleUpdated: 0, backupPath }

    const insertRole = prod.prepare('INSERT INTO roles (id, name, description, active) VALUES (?, ?, ?, ?)')
    const updateRole = prod.prepare('UPDATE roles SET name = ?, description = ?, active = ? WHERE id = ?')
    const insertPerson = prod.prepare('INSERT INTO people (id, name, role_text, registration, active, status) VALUES (?, ?, ?, ?, ?, ?)')
    const updatePerson = prod.prepare('UPDATE people SET name = ?, role_text = ?, registration = ?, active = ?, status = ? WHERE id = ?')

    prod.transaction(() => {
      for (const role of devRoles) {
        const name = formatRoleName(role.name)
        if (!name) continue
        const existing = roleByName.get(roleNameKey(name))
        if (existing) {
          updateRole.run(name, role.description || '', role.active ? 1 : 0, existing.id)
          result.rolesUpdated += 1
        } else {
          const id = chooseId(role.id, 'role', usedRoleIds)
          insertRole.run(id, name, role.description || '', role.active ? 1 : 0)
          roleByName.set(roleNameKey(name), { id, name })
          result.rolesInserted += 1
        }
      }

      for (const person of devPeople) {
        const name = formatPersonName(person.name)
        if (!name) continue
        const role = formatRoleName(person.role_text)
        const status = PERSON_STATUSES.has(person.status) ? person.status : (person.active ? 'ativo' : 'inativo')
        const existing = personByName.get(key(name))
        if (existing) {
          updatePerson.run(name, role, person.registration || '', status === 'ativo' ? 1 : 0, status, existing.id)
          result.peopleUpdated += 1
        } else {
          const id = chooseId(person.id, 'person', usedPersonIds)
          insertPerson.run(id, name, role, person.registration || '', status === 'ativo' ? 1 : 0, status)
          personByName.set(key(name), { id, name })
          result.peopleInserted += 1
        }
      }
    })()

    return result
  } finally {
    dev.close()
    prod.close()
  }
}

async function main() {
  const fromEnv = argValue('from', '.env.dev')
  const toEnv = argValue('to', '.env.prod')
  assertPromoteAllowed(argValue('confirm'))

  const prodEnv = readEnvFile(toEnv)
  const devPath = resolveDbPathFromEnv(fromEnv, './server/estoque-dev.db')
  const prodPath = resolveDbPathFromEnv(toEnv, './server/estoque-prod.db')
  const backupDir = resolveEnvPath(prodEnv.BACKUP_DIR, './server/backups')
  const result = await promotePeopleRoles({ devPath, prodPath, backupDir })
  console.log(JSON.stringify({ ok: true, fromEnv, toEnv, devPath, prodPath, ...result }, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error.message)
    process.exit(1)
  })
}
