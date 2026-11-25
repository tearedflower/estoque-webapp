import assert from 'node:assert/strict'
import test from 'node:test'
import { createResourceLoader } from '../src/services/resourceLoader.js'

test('carregamentos simultâneos compartilham pedido; cache expira e falha permite tentar novamente', async () => {
  let now = 0
  let calls = 0
  let fail = false
  const loader = createResourceLoader({ items: async () => { calls++; await Promise.resolve(); if (fail) throw new Error('offline') } }, { ttl: 30, now: () => now })
  await Promise.all([loader.load('items'), loader.load('items')])
  assert.equal(calls, 1)
  await loader.load('items')
  assert.equal(calls, 1)
  now = 31
  await loader.load('items')
  assert.equal(calls, 2)
  loader.invalidate(['items'])
  fail = true
  await assert.rejects(loader.load('items'), /offline/)
  fail = false
  await loader.load('items')
  assert.equal(calls, 4)
})

test('invalidar durante pedido não deixa resultado antigo no cache', async () => {
  let finish
  let calls = 0
  const loader = createResourceLoader({ people: () => { calls++; return new Promise(r => { finish = r }) } })
  const pending = loader.load('people')
  await Promise.resolve()
  loader.invalidate(['people'])
  finish()
  await pending
  const next = loader.load('people')
  await Promise.resolve()
  finish()
  await next
  assert.equal(calls, 2)
})
