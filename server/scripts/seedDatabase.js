import db, { DB_PATH } from '../db.js'
import { generateSeedData } from '../../src/data/seedData.js'
import { createBackup } from '../backup.js'
import { assertResetAllowed, isProductionEnv } from '../utils/maintenanceGuard.js'
import { populateSeedData, resetBusinessData } from '../utils/seedDataStore.js'

function argValue(name, fallback = '') {
  const prefix = `--${name}=`
  const found = process.argv.find(arg => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

const mode = argValue('mode', 'seed')
const envFile = argValue('env', '.env')
assertResetAllowed({ mode, envFile, confirmation: argValue('confirm') })

let backupPath = ''
if (mode === 'reset' && isProductionEnv(envFile)) {
  backupPath = await createBackup(db)
  console.log(`Backup criado antes do reset: ${backupPath}`)
}

const run = db.transaction(() => {
  resetBusinessData(db, { includeSessions: true })
  return mode === 'seed' ? populateSeedData(db, generateSeedData()) : {}
})

const result = run()
console.log(JSON.stringify({ ok: true, mode, dbPath: DB_PATH, backupPath, ...result }, null, 2))
db.close()
