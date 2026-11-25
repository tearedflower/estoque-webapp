import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'
import test from 'node:test'
import Database from 'better-sqlite3'

test('privacidade, sessões, repetição e auditoria da API', { timeout: 20000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'estoque-hardening-'))
  const dbPath = join(root, 'test.db')
  const probe = net.createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const child = spawn(process.execPath, ['server/index.js', '--env=.env.test'], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, BACKUP_ENABLED: 'false', PHOTO_UPLOAD_DIR: join(root, 'photos') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', b => { output += b })
  child.stderr.on('data', b => { output += b })
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit') }
    await rm(root, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/api/health')).ok) break } catch {}
    if (child.exitCode !== null) throw new Error(output)
    await new Promise(r => setTimeout(r, 50))
  }
  const request = async (path, { token, method, body, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-auth-token': token } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie') }
  }
  const login = async pin => {
    const r = await request('/api/auth/login', { body: { login: 'admin', pin } })
    assert.equal(r.status, 200)
    return r.cookie.match(/auth_token=([^;]+)/)[1]
  }
  const token = await login('admin123')
  await request('/api/auth/users/user_admin', { token, method: 'PUT', body: { pin: 'senha-segura-123' } })

  let visitorToken
  await t.test('pessoas exigem autenticação e permissão operacional', async () => {
    assert.equal((await request('/api/people')).status, 401)
    assert.equal((await request('/api/people', { token })).status, 200)
    const visitor = await request('/api/auth/users', { token, body: { name: 'Leitor', username: 'leitor', role: 'visitante', pin: 'senha-leitor-123' } })
    assert.equal(visitor.status, 200)
    const session = await request('/api/auth/login', { body: { login: 'leitor', pin: 'senha-leitor-123' } })
    visitorToken = session.cookie.match(/auth_token=([^;]+)/)[1]
    await request(`/api/auth/users/${visitor.data.id}`, { token: visitorToken, method: 'PUT', body: { pin: 'nova-leitor-456' } })
    assert.equal((await request('/api/people', { token: visitorToken })).status, 403)
  })
  await t.test('trocar senha revoga as outras sessões e mantém a atual', async () => {
    const other = await login('senha-segura-123')
    const result = await request('/api/auth/users/user_admin', { token, method: 'PUT', body: { pin: 'outra-senha-456' } })
    assert.equal(result.status, 200)
    assert.equal((await request('/api/auth/me', { token: other })).status, 401)
    assert.equal((await request('/api/auth/me', { token })).status, 200)
  })
  const item = (await request('/api/items', { token, body: { name: 'Peça auditada', group: 'Teste', unit: 'UN' } })).data
  const variation = (await request('/api/items/variations', { token, body: { itemId: item.id, values: {}, stock: 0 } })).data
  let first
  const payload = { type: 'entrada', itemName: 'Peça auditada', itemId: item.id, variationId: variation.id, qty: 10, stockCounts: { [variation.id]: 0 } }
  await t.test('mesma chave repete a resposta sem duplicar saldo; conteúdo diferente é rejeitado', async () => {
    const options = { token, headers: { 'idempotency-key': 'entry-test-001' }, body: payload }
    first = await request('/api/movements', options)
    assert.equal(first.status, 200)
    const repeat = await request('/api/movements', options)
    assert.deepEqual(repeat.data, first.data)
    const mismatch = await request('/api/movements', { ...options, body: { ...payload, qty: 20 } })
    assert.equal(mismatch.status, 409)
    const stocks = await request('/api/items/variations')
    assert.equal(stocks.data.find(v => v.id === variation.id).stock, 10)
  })
  await t.test('edição mantém versões originais e rejeita edição baseada em versão antiga', async () => {
    const second = await request('/api/movements', { token, body: { ...payload, stockCounts: undefined, qty: 2 } })
    assert.equal(second.status, 200)
    const changed = await request(`/api/movements/${first.data.id}`, { token, method: 'PUT', body: { qty: 8, expectedRevision: 0, reason: 'Contagem corrigida' } })
    assert.equal(changed.status, 200)
    assert.equal(changed.data.currentStock, 10)
    const stale = await request(`/api/movements/${first.data.id}`, { token, method: 'PUT', body: { qty: 9, expectedRevision: 0 } })
    assert.equal(stale.status, 409)
    const history = await request(`/api/movements/${first.data.id}/audit`, { token })
    assert.equal(history.status, 200)
    assert.equal(history.data[0].before.qty, 10)
    assert.equal(history.data[0].after.qty, 8)
    assert.equal(history.data[0].reason, 'Contagem corrigida')
    const inspection = new Database(dbPath, { readonly: true })
    try {
      const later = inspection.prepare('SELECT stock_before, stock_after FROM movements WHERE id=?').get(second.data.id)
      assert.deepEqual(later, { stock_before: 8, stock_after: 10 })
    } finally { inspection.close() }
  })
  await t.test('consulta paginada filtra e mantém a resposta antiga sem parâmetros', async () => {
    const result = await request(`/api/movements?page=1&pageSize=1&variationId=${variation.id}`)
    assert.equal(result.status, 200)
    assert.equal(result.data.items.length, 1)
    assert.equal(result.data.total, 2)
    assert.equal((await request('/api/movements?page=-1')).status, 400)
    assert.ok(Array.isArray((await request('/api/movements')).data))
  })
  await t.test('exclusão preserva o conteúdo na auditoria', async () => {
    const deleted = await request(`/api/movements/${first.data.id}`, { token, method: 'DELETE' })
    assert.equal(deleted.status, 200)
    const history = await request(`/api/movements/${first.data.id}/audit`, { token })
    assert.equal(history.status, 200)
    assert.equal(history.data.at(-1).action, 'delete')
    assert.equal(history.data.at(-1).before.qty, 8)
    assert.equal(history.data.at(-1).after, null)
  })
  await t.test('materiais de OS repetidos baixam uma vez e remoção preserva auditoria', async () => {
    const destination = await request('/api/destinations', { token, body: { name: 'Bomba', active: true } })
    assert.equal(destination.status, 200)
    const order = await request('/api/work-orders', { token, body: { title: 'OS teste', destinationId: destination.data.id, equipment: 'Bomba', requestedBy: 'admin', serviceType: 'Outros', requestDate: '2026-10-20', requestTime: '09:00' } })
    assert.equal(order.status, 200, JSON.stringify(order.data))
    const options = { token, headers: { 'idempotency-key': 'os-material-001' }, body: { variationId: variation.id, qty: 1 } }
    const added = await request(`/api/work-orders/${order.data.id}/items`, options)
    assert.equal(added.status, 200)
    assert.deepEqual((await request(`/api/work-orders/${order.data.id}/items`, options)).data, added.data)
    const removed = await request(`/api/work-orders/${order.data.id}/items/${added.data.workOrderItem.id}`, { token, method: 'DELETE' })
    assert.equal(removed.status, 200)
    const history = await request(`/api/movements/${added.data.movement.id}/audit`, { token })
    assert.equal(history.data.at(-1)?.action, 'delete')
  })
  await t.test('auditoria administrativa pagina e filtra ação, busca e período sem ocultar exclusões', async () => {
    assert.equal((await request('/api/movements/audit?page=1')).status, 401)
    assert.equal((await request('/api/movements/audit?page=1', { token: visitorToken })).status, 403)
    const deleted = await request('/api/movements/audit?page=1&pageSize=1&action=delete', { token })
    assert.equal(deleted.status, 200)
    assert.equal(deleted.data.total, 2)
    assert.equal(deleted.data.items.length, 1)
    assert.equal(deleted.data.items[0].action, 'delete')
    assert.equal((await request('/api/movements/audit?page=1&q=peca%20auditada&action=delete', { token })).data.total, 2)
    const next = await request('/api/movements/audit?page=2&pageSize=1&action=delete', { token })
    assert.notEqual(next.data.items[0].id, deleted.data.items[0].id)
    const filtered = await request('/api/movements/audit?page=1&q=contagem%20corrigida&action=update', { token })
    assert.equal(filtered.data.total, 1)
    assert.equal(filtered.data.items[0].reason, 'Contagem corrigida')
    assert.equal((await request('/api/movements/audit?page=1&from=2099-01-01T00:00:00.000Z', { token })).data.total, 0)
    assert.equal((await request('/api/movements/audit?page=1&to=2000-01-01T00:00:00.000Z', { token })).data.total, 0)
    for (const query of ['page=0', 'page=1&pageSize=999', 'page=1&action=unknown', 'page=1&from=invalid']) {
      assert.equal((await request('/api/movements/audit?' + query, { token })).status, 400, query)
    }
    assert.ok(Array.isArray((await request('/api/movements/audit', { token })).data))
  })

})
