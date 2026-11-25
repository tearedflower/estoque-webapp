import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const sourceGroup = 'Peças Industriais'

export function industrialItemDestination(item) {
  const { name, category, subcategory } = item
  if (category === 'Fixação') return { group_name: 'Fixação', category: subcategory || 'Outros fixadores', subcategory: null }
  if (['Transmissão', 'Rolamentos', 'Mancais'].includes(category)) {
    return { group_name: 'Transmissão', category: category === 'Transmissão' ? subcategory || (name.startsWith('Correia') ? 'Correias' : 'Polias e Rodas Dentadas') : category, subcategory: category === 'Rolamentos' ? subcategory : null }
  }
  if (category === 'Vedação') return { group_name: 'Vedação', category: name, subcategory: null }
  if (category === 'Conexões' && subcategory === 'Eletroduto') {
    return { group_name: 'Materiais Elétricos', category: 'Eletrodutos e Acessórios', subcategory: null }
  }
  if ((category === 'Conexões' && subcategory === 'Pneumáticas') || (category === 'Pneumática' && subcategory === 'Conexões')) {
    return { group_name: 'Conexões Pneumáticas', category: 'Conexões de Engate Rápido', subcategory: name }
  }
  if (category === 'Pneumática') return { group_name: 'Pneumática', category: subcategory || (name.startsWith('Filtro') ? 'Filtros e Reguladores' : name.startsWith('Tubo') ? 'Tubos' : 'Válvulas'), subcategory: null }
  if (['Elétrica', 'Automação', 'Sensores'].includes(category) || ['Escova de Carvão', 'Espelho Refletor'].includes(name)) {
    return { group_name: 'Materiais Elétricos', category: category === 'Elétrica' ? subcategory || 'Componentes Elétricos' : category === 'Acessórios' ? 'Sensores' : category, subcategory: null }
  }
  if (category === 'Conexões') return { group_name: 'Hidráulica', category: 'Conexões', subcategory }
  if (['Hidráulica', 'Válvulas'].includes(category) || name === 'Mangueira Hidráulica' || name === 'Filtro hidráulico') {
    return { group_name: 'Hidráulica', category: name.includes('Filtro') ? 'Filtros' : category === 'Mangueiras' ? 'Mangueiras' : 'Válvulas', subcategory: null }
  }
  // Tubos sem aplicação confirmada continuam classificados pela família original.
  const maintenanceCategories = ['Componentes', 'Instrumentação', 'Mangueiras', 'Manutenção', 'Metais', 'Motores', 'Máquinas e Equipamentos', 'Rodas e Pneus', 'Rodízios', 'Tubulações']
  if (maintenanceCategories.includes(category)) return { group_name: 'Manutenção Automotiva e Industrial', category, subcategory }
  throw new Error(`Classificação não revisada: ${item.id} (${name}, ${category}, ${subcategory})`)
}

export function planIndustrialReclassification(db) {
  return db.prepare('SELECT id, name, group_name, category, subcategory FROM items WHERE active = 1 AND group_name = ? ORDER BY id').all(sourceGroup)
    .map(row => ({ id: row.id, name: row.name,
      before: { group_name: row.group_name, category: row.category, subcategory: row.subcategory },
      after: industrialItemDestination(row),
      variations: db.prepare('SELECT count(*) n FROM variations WHERE item_id = ? AND active = 1').get(row.id).n,
    }))
}

export function catalogSnapshot(db) {
  const snapshot = {}
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()) {
    snapshot[name] = db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()
      .map(row => JSON.stringify(row)).sort()
  }
  return snapshot
}

export function applyIndustrialReclassification(db, changes, backupSnapshot) {
  const update = db.prepare('UPDATE items SET group_name = ?, category = ?, subcategory = ? WHERE id = ? AND group_name IS ? AND category IS ? AND subcategory IS ?')
  db.transaction(() => {
    const before = catalogSnapshot(db)
    if (backupSnapshot) assert.ok(isDeepStrictEqual(before, backupSnapshot), 'O banco mudou após o backup. Gere uma nova prévia e tente novamente.')
    const byId = new Map(changes.map(row => [row.id, row.after]))
    const expected = { ...before, items: before.items.map(json => {
      const row = JSON.parse(json)
      return JSON.stringify(byId.has(row.id) ? { ...row, ...byId.get(row.id) } : row)
    }).sort() }
    for (const row of changes) {
      if (update.run(row.after.group_name, row.after.category, row.after.subcategory, row.id,
        row.before.group_name, row.before.category, row.before.subcategory).changes !== 1) {
        throw new Error(`O modelo ${row.id} mudou durante a revisão. Nenhuma alteração foi aplicada.`)
      }
    }
    assert.ok(isDeepStrictEqual(catalogSnapshot(db), expected), 'Uma informação além da classificação foi alterada; operação cancelada.')
    assert.deepEqual(db.pragma('integrity_check'), [{ integrity_check: 'ok' }])
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  }).immediate()
}

async function main() {
  const databasePath = process.argv[2]
  if (!databasePath || databasePath.startsWith('--')) throw new Error('Informe o banco. Sem --apply, apenas mostra a prévia.')
  const apply = process.argv.includes('--apply')
  const db = new Database(resolve(databasePath), { readonly: !apply, fileMustExist: true })
  try {
    const changes = planIndustrialReclassification(db)
    let backup = null
    let report = null
    if (apply && changes.length) {
      backup = resolve(dirname(databasePath), 'backups', `before-industrial-reclassification-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
      await mkdir(dirname(backup), { recursive: true })
      await db.backup(backup)
      const baseline = new Database(backup, { readonly: true, fileMustExist: true })
      let snapshot
      try { snapshot = catalogSnapshot(baseline) } finally { baseline.close() }
      report = backup.replace(/\.db$/, '.json')
      await writeFile(report, JSON.stringify({ status: 'planned', database: resolve(databasePath), backup, changes }, null, 2))
      applyIndustrialReclassification(db, changes, snapshot)
      await writeFile(report, JSON.stringify({ status: 'applied-and-verified', database: resolve(databasePath), backup,
        verification: 'Todas as linhas de todas as tabelas preservadas, exceto os três campos de classificação planejados. Integridade e referências verificadas.',
        tables: Object.fromEntries(Object.entries(snapshot).map(([table, rows]) => [table, rows.length])), changes }, null, 2))
    }
    console.log(JSON.stringify({ applied: apply, backup, report, items: changes.length,
      variations: changes.reduce((n, row) => n + row.variations, 0),
      groups: changes.reduce((groups, row) => {
        const group = groups[row.after.group_name] ||= { items: 0, variations: 0 }
        group.items++
        group.variations += row.variations
        return groups
      }, {}), changes }, null, 2))
  } finally { db.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
