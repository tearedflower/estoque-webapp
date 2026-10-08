import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { importMovementHistory } from '../server/utils/importMovementHistory.js'

test('reimportação corrige linhas e associações sem perder ajustes ou duplicar movimentos', async t => {
  const root = await mkdtemp(join(tmpdir(), 'estoque-import-'))
  process.env.DB_PATH = join(root, 'import.db')
  process.env.BACKUP_ENABLED = 'false'
  const { default: db } = await import('../server/db.js')
  t.after(async () => { db.close(); await rm(root, { recursive: true, force: true }) })
  db.prepare("INSERT INTO items (id, name, group_name) VALUES ('item', 'Parafuso', 'Ferragens')").run()
  db.prepare("INSERT INTO variations (id, item_id, stock) VALUES ('a', 'item', 7), ('b', 'item', 0)").run()
  const payload = {
    mappings: [{ sourceName: 'Parafuso curto', variationId: 'a' }],
    rows: [
      { type: 'saida', rowNumber: 2, sourceName: 'Parafuso curto', qty: 3, date: '2026-09-01T03:00:00Z' },
      { type: 'entrada', rowNumber: 2, sourceName: 'Parafuso curto', qty: 5, date: '2026-09-01T03:00:00Z', unitCost: null },
    ],
  }
  const stock = id => db.prepare('SELECT stock FROM variations WHERE id = ?').pluck().get(id)
  const first = importMovementHistory(db, payload)
  assert.equal(first.movementsCreated, 2)
  assert.equal(stock('a'), 9)
  assert.equal(db.prepare("SELECT unit_cost FROM movements WHERE type = 'entrada'").pluck().get(), null)
  assert.equal(db.prepare("SELECT stock_before FROM movements WHERE type = 'saida'").pluck().get(), 12)
  const again = importMovementHistory(db, payload)
  assert.equal(again.movementsSkipped, 2)
  assert.equal(stock('a'), 9)
  db.prepare(`INSERT INTO movements (id, type, variation_id, item_id, qty, stock_before, stock_after, date)
    VALUES ('manual', 'saida', 'a', 'item', 1, 9, 8, '2026-09-02T03:00:00.000Z')`).run()
  db.prepare("UPDATE variations SET stock = 8 WHERE id = 'a'").run()
  const corrected = structuredClone(payload)
  corrected.rows[1].qty = 6
  assert.throws(() => importMovementHistory(db, corrected), /mudou/)
  assert.equal(stock('a'), 8)
  corrected.updateExisting = true
  assert.equal(importMovementHistory(db, corrected).movementsUpdated, 1)
  assert.equal(stock('a'), 9)
  corrected.mappings[0].variationId = 'b'
  assert.equal(importMovementHistory(db, corrected).movementsUpdated, 2)
  assert.equal(stock('a'), 6) // Original balance 7, less the manual withdrawal.
  assert.equal(stock('b'), 3)
  const manual = db.prepare("SELECT * FROM movements WHERE id = 'manual'").get()
  assert.equal(manual.qty, 1)
  assert.equal(manual.stock_before, 7)
  assert.equal(manual.stock_after, 6)
  assert.equal(importMovementHistory(db, corrected).movementsSkipped, 2)
  assert.equal(db.prepare('SELECT COUNT(*) FROM movements').pluck().get(), 3)
  assert.throws(() => importMovementHistory(db, { ...corrected, rows: [corrected.rows[0], corrected.rows[0]] }), /repetida/)
  assert.throws(() => importMovementHistory(db, { ...corrected, rows: [{ ...corrected.rows[0], date: null }] }), /invalida/)
})
