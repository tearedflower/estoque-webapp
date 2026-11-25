import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { normalizeVariationLabels, planVariationLabelChanges, applyVariationLabelChanges } from '../server/scripts/normalizeVariationLabels.js'

test('variation labels standardize ordinal lines and only separate bearing code suffixes', () => {
  for (const [input, expected] of [['1°', '1° Linha'], ['1º linha', '1° Linha'], ['1ª Linha', '1° Linha'], ['2º linha', '2° Linha'], ['2° Linha', '2° Linha'], ['Segunda Linha', '2° Linha']]) {
    assert.equal(normalizeVariationLabels('Rolamento', { Linha: input }).Linha, expected)
  }
  for (const [input, expected] of [['1210KKC3', '1210 KKC3'], ['6205ZZC3', '6205 ZZC3'], ['62052RS', '6205 2RS'], ['6905-ZZ', '6905 ZZ'], ['1211K', '1211 K'], ['HR32207J', 'HR32207 J'], ['6306 - 2Z/CM', '6306 2Z/CM'], ['6203 ZZ C3', '6203 ZZ C3'], ['UC206', 'UC206'], ['LM 11949', 'LM 11949'], ['6305', '6305']]) {
    const values = { Modelo: input, Marca: 'NSK' }
    const result = normalizeVariationLabels('Rolamento', values)
    assert.equal(result.Modelo, expected, input)
    assert.deepEqual(normalizeVariationLabels('Rolamento', result), result)
    assert.equal(values.Modelo, input)
    assert.equal(result.Marca, 'NSK')
  }
  assert.equal(normalizeVariationLabels('Controlador', { Modelo: '1210KKC3' }).Modelo, '1210KKC3')
  assert.equal(normalizeVariationLabels('Bucha de fixação', { Modelo: 'H-312', Qualidade: '2ª Linha' }).Qualidade, '2° Linha')
  assert.equal(normalizeVariationLabels('Rolamento', { Linha: 'Industrial' }).Linha, 'Industrial')
})

test('label changes preserve IDs and stock, are idempotent and roll back on concurrent edits', () => {
  const db = new Database(':memory:')
  try {
    db.exec('CREATE TABLE items (id TEXT, name TEXT, active INTEGER); CREATE TABLE variations (id TEXT PRIMARY KEY, item_id TEXT, vals TEXT, active INTEGER, stock INTEGER);')
    db.prepare('INSERT INTO items VALUES (?, ?, 1)').run('item', 'Rolamento')
    const insert = db.prepare('INSERT INTO variations VALUES (?, ?, ?, 1, ?)')
    insert.run('one', 'item', JSON.stringify({ Modelo: '1210KKC3', Linha: '2°' }), 12)
    insert.run('two', 'item', JSON.stringify({ Modelo: '6205ZZ' }), 3)
    const changes = planVariationLabelChanges(db)
    db.prepare('UPDATE variations SET vals = ? WHERE id = ?').run('{"Modelo":"6206"}', 'two')
    assert.throws(() => applyVariationLabelChanges(db, changes), /mudou durante/)
    assert.equal(JSON.parse(db.prepare('SELECT vals FROM variations WHERE id = ?').get('one').vals).Modelo, '1210KKC3')
    applyVariationLabelChanges(db, planVariationLabelChanges(db))
    assert.deepEqual(db.prepare('SELECT id, stock FROM variations ORDER BY id').all(), [{ id: 'one', stock: 12 }, { id: 'two', stock: 3 }])
    assert.equal(planVariationLabelChanges(db).length, 0)
  } finally { db.close() }
})
