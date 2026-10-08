import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

async function waitForServer(url, child, logs) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Servidor encerrou antes da migração:\n${logs()}`)
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Servidor não iniciou em 10 segundos:\n${logs()}`)
}

test('migração versionada cria backup antes de alterar um banco existente', { timeout: 20_000 }, async t => {
  const tempDir = await mkdtemp(join(os.tmpdir(), 'estoque-migration-'))
  const dbPath = join(tempDir, 'legacy.db')
  const backupDir = join(tempDir, 'backups')
  const legacyDb = new Database(dbPath)
  legacyDb.exec(`
    CREATE TABLE legacy_marker (value TEXT);
    INSERT INTO legacy_marker VALUES ('preservado');
    CREATE TABLE epi_role_rules (
      id TEXT PRIMARY KEY,
      role_name TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_key TEXT NOT NULL,
      target_label TEXT DEFAULT '',
      days INTEGER NOT NULL DEFAULT 30,
      active INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO epi_role_rules (id, role_name, target_type, target_key, target_label, days, active)
    VALUES ('legacy_rule', 'Operador', 'item', 'item_1', 'Mascara', 30, 1);
    CREATE TABLE items (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, group_name TEXT NOT NULL, category TEXT,
      subcategory TEXT, unit TEXT NOT NULL DEFAULT 'UN', min_stock REAL NOT NULL DEFAULT 0,
      attributes TEXT NOT NULL DEFAULT '[]', location TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE variations (
      id TEXT PRIMARY KEY, item_id TEXT NOT NULL, vals TEXT NOT NULL DEFAULT '{}',
      stock REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0,
      initial_stock REAL NOT NULL DEFAULT 0, extras TEXT NOT NULL DEFAULT '{}',
      location TEXT DEFAULT '', locations TEXT NOT NULL DEFAULT '[]',
      destinations TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO items (id, name, group_name, min_stock) VALUES ('legacy_item', 'Item legado', 'Teste', 4);
    INSERT INTO variations (id, item_id, min_stock) VALUES ('legacy_variation', 'legacy_item', 0);
  `)
  legacyDb.pragma('user_version = 0')
  legacyDb.close()

  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  let output = ''
  const child = spawn(process.execPath, ['server/index.js', '--env=.env.test'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
      BACKUP_DIR: backupDir,
      BACKUP_ENABLED: 'false',
      CORS_ORIGINS: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })

  t.after(async () => {
    if (child.exitCode === null) child.kill()
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ])
    await rm(tempDir, { recursive: true, force: true })
  })

  await waitForServer(url, child, () => output)

  const backups = (await readdir(backupDir)).filter(name => name.endsWith('.db'))
  assert.equal(backups.length, 1)
  const backupDb = new Database(join(backupDir, backups[0]), { readonly: true })
  assert.equal(backupDb.prepare('SELECT value FROM legacy_marker').pluck().get(), 'preservado')
  assert.equal(backupDb.pragma('user_version', { simple: true }), 0)
  backupDb.close()

  const migratedDb = new Database(dbPath, { readonly: true })
  assert.equal(migratedDb.pragma('user_version', { simple: true }), 8)
  assert.ok(migratedDb.prepare('PRAGMA table_info(sessions)').all().some(column => column.name === 'expires_at'))
  assert.ok(migratedDb.prepare('PRAGMA table_info(items)').all().some(column => column.name === 'active'))
  assert.ok(migratedDb.prepare('PRAGMA table_info(items)').all().some(column => column.name === 'min_stock_defined'))
  assert.ok(migratedDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'movement_batch_requests'").get())
  assert.ok(migratedDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'movement_import_mappings'").get())
  assert.ok(migratedDb.prepare('PRAGMA table_info(movements)').all().some(column => column.name === 'affects_stock'))
  assert.ok(migratedDb.prepare('PRAGMA table_info(variations)').all().some(column => column.name === 'min_stock_defined'))
  assert.equal(migratedDb.prepare("SELECT min_stock_defined FROM items WHERE id = 'legacy_item'").pluck().get(), 1)
  assert.equal(migratedDb.prepare("SELECT min_stock_defined FROM variations WHERE id = 'legacy_variation'").pluck().get(), 0)
  assert.ok(migratedDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'photo_batches'").get())
  assert.ok(migratedDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'photo_batch_photos'").get())
  assert.ok(migratedDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'variation_photos'").get())
  assert.ok(migratedDb.prepare('PRAGMA table_info(epi_role_rules)').all().some(column => column.name === 'quantity'))
  assert.equal(migratedDb.prepare("SELECT quantity FROM epi_role_rules WHERE id = 'legacy_rule'").pluck().get(), 1)
  migratedDb.close()
})
