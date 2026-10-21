import Database from 'better-sqlite3'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function normalizeVariationLabels(itemName, values) {
  const result = { ...values }
  for (const [key, value] of Object.entries(result)) {
    if (typeof value !== 'string') continue
    if (['linha', 'qualidade'].includes(key.trim().toLowerCase())) {
      const line = value.trim().match(/^([12])\s*[°ºªoa]?\s*(?:linha)?$/i)
      if (line) result[key] = `${line[1]}° Linha`
      else if (/^primeira\s+linha$/i.test(value.trim())) result[key] = '1° Linha'
      else if (/^segunda\s+linha$/i.test(value.trim())) result[key] = '2° Linha'
    }
    if (key.trim().toLowerCase() === 'modelo' && /^rolamentos?\b/i.test(itemName)) {
      result[key] = value.trim().replace(/\s+/g, ' ')
        .replace(/^([a-z]*[- ]*\d{3,5}?)[ -]*(?=2RS|2Z|[a-z])/i, '$1 ')
    }
  }
  return result
}

export function planVariationLabelChanges(db) {
  return db.prepare(`SELECT v.id, v.vals, i.name FROM variations v
    JOIN items i ON i.id = v.item_id WHERE v.active = 1 AND i.active = 1`).all().flatMap(row => {
    const before = JSON.parse(row.vals)
    const after = normalizeVariationLabels(row.name, before)
    const fields = Object.keys(after).filter(key => after[key] !== before[key])
    return fields.length ? [{ id: row.id, before, after, original: row.vals, fields }] : []
  })
}

export function applyVariationLabelChanges(db, changes) {
  const update = db.prepare('UPDATE variations SET vals = ? WHERE id = ? AND vals = ?')
  db.transaction(() => {
    for (const row of changes) {
      if (update.run(JSON.stringify(row.after), row.id, row.original).changes !== 1) {
        throw new Error(`A variação ${row.id} mudou durante a revisão. Nenhuma alteração foi aplicada.`)
      }
    }
  })()
}

async function main() {
  const databasePath = process.argv[2]
  if (!databasePath || databasePath.startsWith('--')) throw new Error('Informe o caminho do banco. Use --apply para aplicar após backup; sem ele, apenas lista a prévia.')
  const apply = process.argv.includes('--apply')
  const db = new Database(resolve(databasePath), { readonly: !apply, fileMustExist: true })
  try {
    const changes = planVariationLabelChanges(db)
    let backup = null
    if (apply && changes.length) {
      backup = resolve(dirname(databasePath), 'backups', `before-label-normalization-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
      await mkdir(dirname(backup), { recursive: true })
      await db.backup(backup)
      applyVariationLabelChanges(db, changes)
    }
    console.log(JSON.stringify({ applied: apply, backup, variations: changes.length,
      fields: changes.reduce((counts, row) => {
        for (const key of row.fields) counts[key] = (counts[key] || 0) + 1
        return counts
      }, {}),
      changes: changes.map(({ id, before, after, fields }) => ({ id, fields: fields.map(key => ({ key, before: before[key], after: after[key] })) })),
    }, null, 2))
  } finally { db.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
