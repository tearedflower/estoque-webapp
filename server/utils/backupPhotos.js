import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

export function photoUploadDir() {
  return resolve(process.env.PHOTO_UPLOAD_DIR || `server/photo-uploads-${process.argv.some(a => a.endsWith('.env.prod')) ? 'prod' : 'dev'}`)
}

function safeName(name) {
  if (typeof name !== 'string' || !name || basename(name) !== name || /[\\/]/.test(name) || name === '..' || name === '.' || name === 'manifest.json') {
    throw new Error('Nome de foto inválido no backup.')
  }
  return name
}

const digest = bytes => createHash('sha256').update(bytes).digest('hex')

export async function snapshotPhotos(databasePath, destination, sourceDir) {
  const db = new Database(databasePath, { readonly: true })
  let names
  try {
    names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='photo_batch_photos'").get()
      ? db.prepare("SELECT DISTINCT image_path FROM photo_batch_photos WHERE image_path IS NOT NULL AND image_path <> ''").all().map(r => safeName(r.image_path))
      : []
  } finally { db.close() }
  await mkdir(destination, { recursive: true })
  const files = []
  for (const name of names) {
    const bytes = await readFile(join(sourceDir, name))
    await writeFile(join(destination, name), bytes)
    files.push({ name, sha256: digest(bytes) })
  }
  await writeFile(join(destination, 'manifest.json'), JSON.stringify({ version: 1, files }))
  return files.length
}

export async function verifyPhotos(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('Manifesto de fotos inválido.')
  const names = new Set()
  for (const file of manifest.files) {
    const name = safeName(file.name)
    if (names.has(name) || name === 'manifest.json') throw new Error('Foto duplicada ou reservada no manifesto.')
    names.add(name)
    if (digest(await readFile(join(directory, name))) !== file.sha256) throw new Error(`Foto corrompida: ${name}`)
  }
  return manifest.files
}

export async function copyVerifiedPhotos(source, target) {
  const files = await verifyPhotos(source)
  await mkdir(target, { recursive: true })
  for (const { name } of files) await copyFile(join(source, name), join(target, name))
  await copyFile(join(source, 'manifest.json'), join(target, 'manifest.json'))
  await verifyPhotos(target)
  return files.length
}
