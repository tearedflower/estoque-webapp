import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { industrialItemDestination, planIndustrialReclassification, applyIndustrialReclassification, catalogSnapshot } from '../server/scripts/reclassifyIndustrialItems.js'

test('industrial classification distinguishes electrical, pneumatic and hydraulic connections', () => {
  const destination = (name, category, subcategory = null) => industrialItemDestination({ name, category, subcategory })
  assert.equal(destination('Conector', 'Conexões', 'Eletroduto').group_name, 'Materiais Elétricos')
  assert.equal(destination('União', 'Conexões', 'Galvanizadas').group_name, 'Hidráulica')
  assert.equal(destination('União Emenda Reta', 'Conexões', 'Pneumáticas').group_name, 'Conexões Pneumáticas')
  assert.equal(destination('Conexão pneumática reta', 'Pneumática', 'Conexões').group_name, 'Conexões Pneumáticas')
  assert.equal(destination('Filtro regulador de ar', 'Pneumática').category, 'Filtros e Reguladores')
  assert.equal(destination('Correia Sincronizadora', 'Transmissão').category, 'Correias')
  assert.equal(destination('Parafuso Allen', 'Fixação', 'Parafusos').category, 'Parafusos')
  assert.equal(destination('Tubo Flexível', 'Mangueiras').group_name, 'Manutenção Automotiva e Industrial')
  assert.throws(() => destination('Desconhecido', 'Nova família'), /não revisada/)
})

test('reclassification preserves all other data, rolls back stale plans and is idempotent', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT, group_name TEXT, category TEXT, subcategory TEXT, active INTEGER, attributes TEXT);
      CREATE TABLE variations (id TEXT PRIMARY KEY, item_id TEXT REFERENCES items(id), stock REAL, active INTEGER);
      CREATE TABLE movements (id TEXT, item_id TEXT REFERENCES items(id), item_group TEXT, qty REAL);
      CREATE TABLE work_order_items (id TEXT, variation_id TEXT REFERENCES variations(id));`)
    const insert = db.prepare('INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?)')
    insert.run('a', 'Correia Sincronizadora', 'Peças Industriais', 'Transmissão', null, 1, '["Modelo"]')
    insert.run('b', 'Retentor', 'Peças Industriais', 'Vedação', null, 1, '[]')
    insert.run('c', 'Antigo', 'Peças Industriais', 'Desconhecido', null, 0, '[]')
    db.exec("INSERT INTO variations VALUES ('v', 'a', 12.5, 1); INSERT INTO movements VALUES ('m', 'a', 'Peças Industriais', 3); INSERT INTO work_order_items VALUES ('w', 'v');")
    const plan = planIndustrialReclassification(db)
    db.prepare('UPDATE items SET category = ? WHERE id = ?').run('Alterada', 'b')
    assert.throws(() => applyIndustrialReclassification(db, plan), /mudou durante/)
    assert.equal(db.prepare('SELECT group_name FROM items WHERE id = ?').get('a').group_name, 'Peças Industriais')
    db.prepare('UPDATE items SET category = ? WHERE id = ?').run('Vedação', 'b')
    const baseline = catalogSnapshot(db)
    db.prepare('UPDATE variations SET stock = 13 WHERE id = ?').run('v')
    assert.throws(() => applyIndustrialReclassification(db, plan, baseline), /mudou após o backup/)
    db.prepare('UPDATE variations SET stock = 12.5 WHERE id = ?').run('v')
    applyIndustrialReclassification(db, plan, baseline)
    assert.equal(planIndustrialReclassification(db).length, 0)
    const after = catalogSnapshot(db)
    for (const table of ['variations', 'movements', 'work_order_items']) assert.deepEqual(after[table], baseline[table])
    assert.equal(db.prepare('SELECT attributes FROM items WHERE id = ?').get('a').attributes, '["Modelo"]')
    assert.equal(db.prepare('SELECT group_name FROM items WHERE id = ?').get('c').group_name, 'Peças Industriais')
  } finally { db.close() }
})
