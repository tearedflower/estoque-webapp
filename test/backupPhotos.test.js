import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createBackup } from '../server/backup.js'
import { restoreBackup } from '../server/scripts/restoreBackup.js'

test('backup e espelho preservam fotos referenciadas e restauram banco e imagens juntos', async t => {
  const root = await mkdtemp(join(tmpdir(), 'estoque-photos-'))
  const photos = join(root, 'photos')
  await mkdir(photos)
  await writeFile(join(photos, 'produto.jpg'), 'imagem-original')
  const db = new Database(join(root, 'source.db'))
  db.exec("CREATE TABLE photo_batch_photos (image_path TEXT); INSERT INTO photo_batch_photos VALUES ('produto.jpg')")
  t.after(async () => { db.close(); await rm(root, { recursive: true, force: true }) })
  const backup = await createBackup(db, { dir: join(root, 'backups'), mirrorDir: join(root, 'mirror'), photoDir: photos })
  assert.equal(await readFile(backup + '.photos/produto.jpg', 'utf8'), 'imagem-original')
  assert.equal(await readFile(join(root, 'mirror', basename(backup)) + '.photos/produto.jpg', 'utf8'), 'imagem-original')
  await writeFile(join(photos, 'produto.jpg'), 'imagem-alterada')
  const restored = await restoreBackup({ source: backup, target: join(root, 'restored.db'), backupDir: join(root, 'safety'), photoDir: photos })
  assert.equal(await readFile(join(photos, 'produto.jpg'), 'utf8'), 'imagem-original')
  assert.equal(restored.photosRestored, 1)
})

test('foto ausente impede publicar um backup incompleto', async t => {
  const root = await mkdtemp(join(tmpdir(), 'estoque-missing-photo-'))
  const db = new Database(join(root, 'source.db'))
  db.exec("CREATE TABLE photo_batch_photos (image_path TEXT); INSERT INTO photo_batch_photos VALUES ('ausente.jpg')")
  t.after(async () => { db.close(); await rm(root, { recursive: true, force: true }) })
  await assert.rejects(createBackup(db, { dir: join(root, 'backups'), photoDir: join(root, 'photos') }), /ausente|ENOENT/)
})

test('restauração recusa foto corrompida sem substituir o banco e as imagens atuais', async t => {
  const root = await mkdtemp(join(tmpdir(), 'estoque-corrupt-photo-'))
  const photos = join(root, 'photos')
  await mkdir(photos)
  await writeFile(join(photos, 'produto.jpg'), 'imagem-original')
  const target = join(root, 'current.db')
  const db = new Database(target)
  db.exec("CREATE TABLE photo_batch_photos (image_path TEXT); INSERT INTO photo_batch_photos VALUES ('produto.jpg')")
  t.after(async () => { await rm(root, { recursive: true, force: true }) })
  const backup = await createBackup(db, { dir: join(root, 'backups'), photoDir: photos })
  db.exec("INSERT INTO photo_batch_photos VALUES ('preservar')")
  db.close()
  await writeFile(backup + '.photos/produto.jpg', 'corrompida')
  await assert.rejects(restoreBackup({ source: backup, target, backupDir: join(root, 'safety'), photoDir: photos }), /corrompida/)
  assert.equal(await readFile(join(photos, 'produto.jpg'), 'utf8'), 'imagem-original')
  const check = new Database(target, { readonly: true })
  try { assert.equal(check.prepare('SELECT count(*) FROM photo_batch_photos').pluck().get(), 2) } finally { check.close() }
})
