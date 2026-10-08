import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { prepareStockConfirmations, applyStockConfirmations } from '../server/utils/stockConfirmation.js'
import { requestStockCounts, finishStockConfirmation, stockConfirmation } from '../src/composables/useStockConfirmation.js'

test('conferência física única, válida e atômica, inclusive para saldo negativo e lotes repetidos', async t => {
  const root = await mkdtemp(join(tmpdir(), 'estoque-count-'))
  process.env.DB_PATH = join(root, 'count.db')
  process.env.BACKUP_ENABLED = 'false'
  const { default: db } = await import('../server/db.js')
  t.after(async () => { db.close(); await rm(root, { recursive: true, force: true }) })
  db.exec(`INSERT INTO items (id, name, group_name) VALUES ('item', 'Parafuso', 'Ferragens');
    INSERT INTO variations (id, item_id, stock) VALUES ('a', 'item', -2), ('b', 'item', 8), ('c', 'item', 0);`)
  const lines = [{ variationId: 'a', qty: 2, type: 'saida' }, { variationId: 'a', qty: 3, type: 'saida' }, { variationId: 'b', qty: 1, type: 'entrada' }]
  assert.throws(() => prepareStockConfirmations(db, lines), error => {
    assert.equal(error.code, 'STOCK_CONFIRMATION_REQUIRED')
    assert.equal(error.confirmations.length, 2)
    assert.equal(error.confirmations[0].minimum, 5)
    assert.equal(error.confirmations[0].delta, -5)
    return true
  })
  for (const invalid of ['', ' ', null, true, [], {}, -1, 'abc', Infinity]) {
    assert.throws(() => prepareStockConfirmations(db, [lines[0]], { a: invalid }), { code: 'STOCK_COUNT_INVALID' })
  }
  const stock = id => db.prepare('SELECT stock FROM variations WHERE id = ?').pluck().get(id)
  const pending = prepareStockConfirmations(db, lines, { a: 6, b: 2.5 })
  const operator = { id: 'operator', name: 'Operador' }
  assert.throws(() => db.transaction(() => {
    applyStockConfirmations(db, pending, operator)
    throw new Error('Falha ao salvar a movimentação')
  })(), /Falha/)
  assert.equal(stock('a'), -2)
  assert.equal(db.prepare('SELECT count(*) FROM stock_confirmations').pluck().get(), 0)
  assert.equal(db.prepare('SELECT count(*) FROM movements').pluck().get(), 0)
  const adjustments = db.transaction(() => applyStockConfirmations(db, pending, operator))()
  assert.equal(adjustments.length, 2)
  assert.equal(stock('a'), 6)
  assert.equal(stock('b'), 2.5)
  const rows = db.prepare('SELECT * FROM movements ORDER BY variation_id').all()
  assert.equal(rows[0].type, 'entrada')
  assert.equal(rows[0].qty, 8)
  assert.equal(rows[0].operator_name, 'Operador')
  assert.equal(rows[1].type, 'saida')
  assert.equal(rows[1].qty, 5.5)
  assert.equal(prepareStockConfirmations(db, lines).size, 0)
  assert.throws(() => prepareStockConfirmations(db, lines, { a: 7 }), { code: 'STOCK_COUNT_STALE' })
  const zero = prepareStockConfirmations(db, [{ variationId: 'c', type: 'entrada', qty: 1 }], { c: 0 })
  assert.deepEqual(db.transaction(() => applyStockConfirmations(db, zero, operator))(), [])
  assert.equal(db.prepare("SELECT counted_stock FROM stock_confirmations WHERE variation_id = 'c'").pluck().get(), 0)
  assert.deepEqual(db.pragma('foreign_key_check'), [])
})

test('cancelar conferência não fornece contagem nem mantém uma solicitação pendente', async () => {
  const pending = requestStockCounts([{ key: 'a' }])
  assert.equal(stockConfirmation.value.length, 1)
  finishStockConfirmation()
  await assert.rejects(pending, /cancelada/)
  assert.equal(stockConfirmation.value, null)
  const next = requestStockCounts([{ key: 'a' }])
  finishStockConfirmation({ a: 0 })
  assert.deepEqual(await next, { a: 0 })
})
