import assert from 'node:assert/strict'
import test from 'node:test'
import { createMovement } from '../src/services/api.js'

test('falha de rede repete gravação com a mesma chave e o mesmo conteúdo', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push({ path, options })
    if (calls.length === 1) throw new TypeError('network disconnected')
    return Response.json({ id: 'saved', stockAfter: 8 })
  })
  const result = await createMovement({ type: 'entrada', qty: 8 })
  assert.equal(result.id, 'saved')
  assert.equal(calls.length, 2)
  assert.ok(calls[0].options.headers['Idempotency-Key'])
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key'])
  assert.equal(calls[0].options.body, calls[1].options.body)
})

test('pedidos funcionam em HTTP na rede sem depender de randomUUID', async t => {
  t.mock.method(globalThis.crypto, 'randomUUID', () => { throw new Error('randomUUID indisponível em HTTP') })
  let key
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    key = options.headers['Idempotency-Key']
    return Response.json({ id: 'saved' })
  })
  assert.equal((await createMovement({ type: 'entrada', qty: 1 })).id, 'saved')
  assert.match(key, /^[a-f0-9]{32}$/)
})
