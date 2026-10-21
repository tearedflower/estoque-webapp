import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'estoque-browser-'))
const env = { ...process.env, DB_PATH: join(root, 'browser.db'), PHOTO_UPLOAD_DIR: join(root, 'photos'),
  BACKUP_DIR: join(root, 'backups'), BACKUP_ENABLED: 'false', PORT: '3101', API_PORT: '3101', GEMINI_API_KEY: '', GOOGLE_API_KEY: '' }
const children = [
  spawn(process.execPath, ['server/index.js', '--env=.env.e2e'], { env, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'e2e', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { env, stdio: 'inherit' }),
]
let stopping = false
async function stop(code = 0) {
  if (stopping) return
  stopping = true
  await Promise.all(children.map(async child => {
    if (child.exitCode === null && child.signalCode === null) { const done = once(child, 'exit'); child.kill(); await done }
  }))
  await rm(root, { recursive: true, force: true })
  process.exit(code)
}
children.forEach(child => {
  child.on('error', error => { console.error(error); stop(1) })
  child.on('exit', code => { if (!stopping) stop(code || 1) })
})
process.on('SIGTERM', () => stop())
process.on('SIGINT', () => stop())
