import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { readSheet } from 'read-excel-file/node'
import { argValue } from '../env.js'
import { createBackup } from '../backup.js'
import { importMovementHistory } from '../utils/importMovementHistory.js'
import { normalizeImportText, parseMovementWorkbookSheets } from '../../src/utils/movementSpreadsheetImport.js'

const file = argValue('file')
const envFile = argValue('env')
if (!file || !envFile) throw new Error('Informe --file=planilha.xlsm e --env=.env.dev. Sem --apply, somente simula.')
const { default: db, DB_PATH } = await import('../db.js')
const apply = process.argv.includes('--apply')
const source = readFileSync(file)
const sheets = []
for (const sheet of ['LANÇAR - ENTRADA', 'LANÇAR - SAÍDA', 'ESTOQUE', 'CADASTROS', 'Nomes e Cargos']) {
  sheets.push({ sheet, data: await readSheet(source, sheet) })
}
const parsed = parseMovementWorkbookSheets(sheets)
const catalogFile = argValue('catalog')
const newCatalog = catalogFile ? JSON.parse(readFileSync(catalogFile, 'utf8')) : []
const reportPath = resolve(argValue('report', 'server/backups/importacao-almoxarifado.json'))
const operator = db.prepare("SELECT id, name FROM users WHERE role = 'admin' AND active = 1 ORDER BY id = 'user_admin' DESC LIMIT 1").get()
if (!operator) throw new Error('Nenhum administrador ativo no banco.')
const backup = apply ? await createBackup(db) : null
const report = { source: resolve(file), sha256: createHash('sha256').update(source).digest('hex'), database: DB_PATH, applied: apply, backup }
report.catalogPlan = newCatalog
const rollback = new Error('Simulacao concluida')
try {
  db.transaction(() => {
    const mappings = new Map(db.prepare('SELECT source_name, variation_id FROM movement_import_mappings').all()
      .map(row => [normalizeImportText(row.source_name), { sourceName: row.source_name, variationId: row.variation_id }]))
    report.catalogCreated = []
    for (const row of newCatalog) {
      const key = normalizeImportText(row.sourceName)
      if (mappings.has(key) && row.remap !== true) continue
      if (!parsed.rows.some(m => normalizeImportText(m.sourceName) === key)) throw new Error(`Produto ausente da planilha: ${row.sourceName}`)
      let item = row.itemId ? db.prepare('SELECT * FROM items WHERE id = ? AND active = 1').get(row.itemId) : null
      if (row.itemId && !item) throw new Error(`Modelo inexistente: ${row.itemId}`)
      const values = row.values || {}
      if (!item) {
        if (!row.name || !row.group || !row.unit) throw new Error(`Cadastro incompleto: ${row.sourceName}`)
        item = db.prepare('SELECT * FROM items WHERE name = ? AND group_name = ? AND active = 1').get(row.name, row.group)
        if (!item) {
          item = { id: `item_${randomUUID()}` }
          db.prepare('INSERT INTO items (id, name, group_name, category, subcategory, unit, attributes) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(item.id, row.name, row.group, row.category || '', row.subcategory || '', row.unit, JSON.stringify(Object.keys(values)))
        }
      }
      const signature = value => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      let variation = db.prepare('SELECT id, vals FROM variations WHERE item_id = ? AND active = 1').all(item.id)
        .find(v => signature(JSON.parse(v.vals)) === signature(values))
      if (!variation) {
        variation = { id: `var_${randomUUID()}` }
        db.prepare('INSERT INTO variations (id, item_id, vals, extras) VALUES (?, ?, ?, ?)')
          .run(variation.id, item.id, JSON.stringify(values), JSON.stringify(row.extras || {}))
        const attributes = JSON.parse(db.prepare('SELECT attributes FROM items WHERE id = ?').get(item.id).attributes)
        db.prepare('UPDATE items SET attributes = ? WHERE id = ?').run(JSON.stringify([...new Set([...attributes, ...Object.keys(values)])]), item.id)
        report.catalogCreated.push({ sourceName: row.sourceName, itemId: item.id, variationId: variation.id })
      }
      mappings.set(key, { sourceName: row.sourceName, variationId: variation.id })
    }
    const usedKeys = new Set(parsed.rows.map(row => normalizeImportText(row.sourceName)))
    const usedMappings = [...mappings].filter(([key]) => usedKeys.has(key)).map(([, mapping]) => mapping)
    report.result = importMovementHistory(db, {
      rows: parsed.rows, mappings: usedMappings,
      updateExisting: process.argv.includes('--update-existing'),
      minimumStocks: parsed.minimumMatches.filter(row => row.status === 'valid'),
    }, operator)
    report.validRows = parsed.rows.length
    report.sourceTotals = ['entrada', 'saida'].map(type => ({ type,
      count: parsed.rows.filter(row => row.type === type).length,
      quantity: parsed.rows.filter(row => row.type === type).reduce((sum, row) => sum + row.qty, 0),
    }))
    report.ignored = parsed.ignored
    report.invalidMinimumStocks = parsed.minimumMatches.filter(row => row.status === 'invalid')
    report.movementTotals = db.prepare('SELECT type, COUNT(*) count, SUM(qty) quantity FROM movements GROUP BY type').all()
    report.negativeStocks = db.prepare('SELECT i.name, v.vals, v.stock FROM variations v JOIN items i ON i.id = v.item_id WHERE v.stock < 0').all()
    report.stockDifferences = parsed.stockRows.flatMap(row => {
      const mapping = mappings.get(normalizeImportText(row.sourceName))
      if (!mapping) return []
      const stock = db.prepare('SELECT stock FROM variations WHERE id = ?').get(mapping.variationId)?.stock
      return Math.abs(stock - row.stock) > 0.000001 ? [{ sourceName: row.sourceName, spreadsheetStock: row.stock, systemStock: stock }] : []
    })
    const integrity = db.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok' || db.pragma('foreign_key_check').length) throw new Error('Falha na integridade do banco.')
    if (!apply) throw rollback
  })()
} catch (error) {
  if (error !== rollback) throw error
} finally {
  db.close()
}
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ applied: apply, database: DB_PATH, backup, ...report.result, variationsCreated: report.catalogCreated.length,
  ignored: report.ignored.length, negativeStocks: report.negativeStocks.length, stockDifferences: report.stockDifferences.length, report: reportPath }, null, 2))
