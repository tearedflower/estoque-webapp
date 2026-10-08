import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const nameKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
const rows = (db, table) => db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
const net = m => m.affects_stock === 0 || m.voided_at ? 0 : m.type === 'entrada' ? m.qty : -m.qty
const markerKey = 'stock_merge_dev_snapshot_v1'

// One reviewed snapshot: a later synchronization needs a new reconciliation plan.
export async function mergeStockDatabases({ sourcePath, targetPath, plan, apply = false, backupDir }) {
  assert.notEqual(resolve(sourcePath), resolve(targetPath), 'Origem e destino devem ser diferentes.')
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true })
  const target = new Database(targetPath, { fileMustExist: true })
  const timestamp = new Date().toISOString()
  const report = { timestamp, applied: apply, itemsInserted: 0, variationsInserted: 0, movementsInserted: 0, adjustments: [], matchedVariations: [], unresolvedPeople: [], protectedTables: {} }
  try {
    target.pragma('foreign_keys = ON')
    target.pragma('busy_timeout = 5000')
    assert.equal(source.pragma('user_version', { simple: true }), target.pragma('user_version', { simple: true }), 'Versões de banco diferentes.')
    const data = source.transaction(() => Object.fromEntries(['items', 'variations', 'movements', 'movement_import_mappings', 'people', 'users', 'stock_confirmations'].map(t => [t, rows(source, t)])))()
    assert.equal(data.stock_confirmations.length, 0, 'Conferências de estoque na origem exigem revisão do plano.')
    const fingerprint = digest({ data, plan })
    const oldMarker = target.prepare('SELECT value FROM app_settings WHERE key=?').get(markerKey)
    if (oldMarker) {
      assert.equal(oldMarker.value, fingerprint, 'Outra sincronização já foi aplicada. Revise os novos dados antes de mesclar novamente.')
      return { ...report, alreadyApplied: true }
    }
    if (apply) {
      mkdirSync(backupDir, { recursive: true })
      report.backupPath = join(backupDir, `antes-mescla-prod-${timestamp.replace(/[:.]/g, '-')}.db`)
      await target.backup(report.backupPath)
    }
    target.exec('BEGIN IMMEDIATE')
    // Everything outside this allowlist must remain byte-for-byte identical as rows.
    const allowed = new Set(['items', 'variations', 'movements', 'movement_import_mappings', 'app_settings'])
    const protectedTables = target.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name).filter(t => !allowed.has(t))
    const before = Object.fromEntries(protectedTables.map(t => [t, digest(rows(target, t))]))
    const originalMovements = rows(target, 'movements')
    const originalVariations = rows(target, 'variations')
    const originalItems = rows(target, 'items')
    const originalSettings = rows(target, 'app_settings')
    const itemMap = new Map(Object.entries(plan.items))
    const variationMap = new Map(Object.entries(plan.variations))
    assert.equal(new Set(variationMap.values()).size, variationMap.size, 'Duas variações da origem não podem sobrescrever o mesmo saldo.')
    const insert = (table, row) => {
      const keys = Object.keys(row)
      target.prepare(`INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => row[k]))
    }
    for (const item of data.items) {
      const id = itemMap.get(item.id) || item.id
      itemMap.set(item.id, id)
      const existing = target.prepare('SELECT * FROM items WHERE id=?').get(id)
      if (existing) {
        assert.ok(Object.hasOwn(plan.items, item.id), `Colisão de item sem mapeamento: ${id}`)
        const attributes = [...new Set([...JSON.parse(existing.attributes), ...JSON.parse(item.attributes)])]
        target.prepare('UPDATE items SET attributes=? WHERE id=?').run(JSON.stringify(attributes), id)
      } else {
        assert.ok(!Object.hasOwn(plan.items, item.id), `Item de destino inexistente: ${id}`)
        insert('items', item)
        report.itemsInserted++
      }
    }
    for (const variation of data.variations) {
      const id = variationMap.get(variation.id) || variation.id
      variationMap.set(variation.id, id)
      const existing = target.prepare('SELECT * FROM variations WHERE id=?').get(id)
      if (existing) {
        assert.ok(Object.hasOwn(plan.variations, variation.id), `Colisão de variação sem mapeamento: ${id}`)
        assert.equal(existing.item_id, itemMap.get(variation.item_id), 'Variação pertence a outro item.')
        assert.ok(!target.prepare('SELECT 1 FROM stock_confirmations WHERE variation_id=?').get(id), 'Saldo já conferido em produção exige revisão.')
        report.matchedVariations.push({ sourceId: variation.id, targetId: id, previousStock: existing.stock, sourceStock: variation.stock })
        // Keep richer production details, locations, minimum stock and existing links.
        const vals = { ...JSON.parse(variation.vals), ...JSON.parse(existing.vals) }
        const extras = { ...JSON.parse(variation.extras), ...JSON.parse(existing.extras) }
        target.prepare('UPDATE variations SET vals=?,extras=? WHERE id=?').run(JSON.stringify(vals), JSON.stringify(extras), id)
      } else {
        assert.ok(!Object.hasOwn(plan.variations, variation.id), `Variação de destino inexistente: ${id}`)
        insert('variations', { ...variation, item_id: itemMap.get(variation.item_id) })
        report.variationsInserted++
      }
    }
    const targetPeople = rows(target, 'people')
    const targetUsers = rows(target, 'users')
    const sourcePeople = new Map(data.people.map(p => [p.id, p]))
    const uniquePerson = (list, name) => {
      if (!nameKey(name)) return ''
      const matches = list.filter(p => nameKey(p.name) === nameKey(name))
      return matches.length === 1 ? matches[0].id : ''
    }
    for (const movement of data.movements) {
      const variationId = variationMap.get(movement.variation_id)
      const itemId = itemMap.get(movement.item_id)
      assert.ok(variationId && itemId, `Movimentação sem cadastro: ${movement.id}`)
      assert.equal(target.prepare('SELECT item_id FROM variations WHERE id=?').get(variationId)?.item_id, itemId, 'Movimentação vinculada a outro item.')
      const personName = sourcePeople.get(movement.requested_by_person_id)?.name || movement.requested_by
      const personId = uniquePerson(targetPeople, personName)
      if (movement.requested_by_person_id && !personId && !report.unresolvedPeople.includes(personName)) report.unresolvedPeople.push(personName)
      insert('movements', { ...movement, variation_id: variationId, item_id: itemId,
        requested_by_person_id: personId,
        operator_id: uniquePerson(targetUsers, movement.operator_name),
        voided_by_id: uniquePerson(targetUsers, movement.voided_by_name) })
      report.movementsInserted++
    }
    for (const match of report.matchedVariations) {
      const variation = target.prepare('SELECT * FROM variations WHERE id=?').get(match.targetId)
      const item = target.prepare('SELECT * FROM items WHERE id=?').get(variation.item_id)
      const ledgerStock = variation.initial_stock + target.prepare('SELECT * FROM movements WHERE variation_id=?').all(variation.id).reduce((sum, m) => sum + net(m), 0)
      const delta = match.sourceStock - ledgerStock
      if (Math.abs(delta) > 0.000001) {
        const adjustment = { id: `mov_sync_${fingerprint.slice(0, 12)}_${variation.id}`, type: delta > 0 ? 'entrada' : 'saida', variation_id: variation.id,
          item_id: item.id, item_name: item.name, item_group: item.group_name, item_category: item.category, item_subcategory: item.subcategory,
          item_unit: item.unit, variation_values: variation.vals, variation_extras: variation.extras,
          qty: Math.abs(delta), stock_before: ledgerStock, stock_after: match.sourceStock, date: timestamp,
          doc_ref: 'MESCLA DEV → PROD', operator_name: 'Sincronização DEV → PROD',
          note: `Conciliação do histórico mesclado com o saldo DEV. Saldo PROD anterior: ${match.previousStock}; saldo DEV: ${match.sourceStock}. Registros originais preservados; não é contagem física.` }
        insert('movements', adjustment)
        report.adjustments.push(adjustment)
      }
      target.prepare('UPDATE variations SET stock=? WHERE id=?').run(match.sourceStock, variation.id)
    }
    for (const mapping of data.movement_import_mappings) {
      const mappedId = variationMap.get(mapping.variation_id)
      assert.ok(mappedId, 'Vínculo de importação sem variação.')
      const existing = target.prepare('SELECT * FROM movement_import_mappings WHERE name_key=?').get(mapping.name_key)
      if (existing) assert.equal(existing.variation_id, mappedId, 'Vínculo de importação conflitante.')
      else insert('movement_import_mappings', { ...mapping, variation_id: mappedId })
    }
    target.prepare('INSERT INTO app_settings (key,value) VALUES (?,?)').run(markerKey, fingerprint)
    assert.deepEqual(target.pragma('foreign_key_check'), [], 'Referências inválidas após a mesclagem.')
    assert.equal(target.pragma('integrity_check', { simple: true }), 'ok')
    for (const t of protectedTables) {
      assert.equal(digest(rows(target, t)), before[t], `Tabela protegida alterada: ${t}`)
      report.protectedTables[t] = { rows: rows(target, t).length, sha256: before[t] }
    }
    for (const row of originalSettings) assert.deepEqual(target.prepare('SELECT * FROM app_settings WHERE key=?').get(row.key), row)
    for (const row of originalMovements) assert.deepEqual(target.prepare('SELECT * FROM movements WHERE id=?').get(row.id), row)
    for (const row of originalItems) {
      const { attributes, ...actual } = target.prepare('SELECT * FROM items WHERE id=?').get(row.id)
      const { attributes: oldAttributes, ...original } = row
      assert.deepEqual(actual, original, 'Dados existentes do item foram alterados.')
    }
    for (const row of originalVariations) {
      if (!Object.values(plan.variations).includes(row.id)) assert.deepEqual(target.prepare('SELECT * FROM variations WHERE id=?').get(row.id), row)
    }
    for (const v of data.variations) {
      const actual = target.prepare('SELECT * FROM variations WHERE id=?').get(variationMap.get(v.id))
      assert.equal(actual.stock, v.stock, `Saldo divergente: ${v.id}`)
    }
    report.totals = Object.fromEntries(['items', 'variations', 'movements', 'people', 'work_orders'].map(t => [t, rows(target, t).length]))
    report.prodOnlyVariations = rows(target, 'variations').filter(v => ![...variationMap.values()].includes(v.id)).map(v => ({ id: v.id, stock: v.stock, vals: JSON.parse(v.vals) }))
    report.fingerprint = fingerprint
    target.exec(apply ? 'COMMIT' : 'ROLLBACK')
    return report
  } catch (error) {
    if (target.inTransaction) target.exec('ROLLBACK')
    throw error
  } finally {
    source.close()
    target.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [sourcePath, targetPath, planPath, reportPath] = process.argv.slice(2).filter(x => x !== '--apply')
  assert.ok(sourcePath && targetPath && planPath && reportPath, 'Uso: node server/scripts/mergeStockDatabases.js origem.db destino.db mapa.json relatorio.json [--apply]')
  const report = await mergeStockDatabases({ sourcePath, targetPath, plan: JSON.parse(readFileSync(planPath, 'utf8')), apply: process.argv.includes('--apply'), backupDir: join(dirname(resolve(targetPath)), 'backups') })
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, adjustments: report.adjustments.length, matchedVariations: report.matchedVariations.length, protectedTables: Object.keys(report.protectedTables), prodOnlyVariations: report.prodOnlyVariations?.length }, null, 2))
}
