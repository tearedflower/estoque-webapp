import assert from 'node:assert/strict'
import test from 'node:test'
import { useMovements } from '../src/composables/useMovements.js'

test('gravação confirmada não vira falha quando só a recarga cai; saldo vem do servidor', async t => {
  let loaded = false
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'PUT') return Response.json({ id: 'm1', type: 'entrada', qty: 8, revision: 1, currentStock: 8 })
    if (loaded) throw new TypeError('offline during refresh')
    loaded = true
    return Response.json([{ id: 'm1', type: 'entrada', qty: 10, revision: 0 }])
  })
  const state = useMovements()
  await state.loadData()
  const variation = { stock: 100 }
  const result = await state.editMovement('m1', { qty: 8 }, variation)
  assert.equal(result.ok, true)
  assert.equal(result.refreshFailed, true)
  assert.equal(variation.stock, 8)
  assert.equal(state.movements.value[0].qty, 8)
})

test('exclusão confirmada informa separadamente a falha de recarga', async t => {
  let loaded = false
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'DELETE') return Response.json({ ok: true, variationId: 'v1', newStock: 5 })
    if (loaded) throw new TypeError('offline during refresh')
    loaded = true
    return Response.json([{ id: 'm2', type: 'entrada', qty: 3 }])
  })
  const state = useMovements()
  await state.loadData()
  const result = await state.deleteMovement('m2', 'Duplicado')
  assert.equal(result.ok, true)
  assert.equal(result.refreshFailed, true)
  assert.equal(result.newStock, 5)
  assert.equal(state.movements.value.length, 0)
})
