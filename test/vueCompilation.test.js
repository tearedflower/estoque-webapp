import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { parse, compileTemplate, compileScript } from '@vue/compiler-sfc'

test('componentes Vue compilam em modo desenvolvimento, incluindo as telas carregadas por demanda', () => {
  function check(directory) {
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, file.name)
      if (file.isDirectory()) { check(path); continue }
      if (!file.name.endsWith('.vue')) continue
      const { descriptor, errors } = parse(readFileSync(path, 'utf8'), { filename: path })
      const script = descriptor.scriptSetup ? compileScript(descriptor, { id: path }) : null
      const template = descriptor.template ? compileTemplate({ filename: path, id: path,
        source: descriptor.template.content, isProd: false, compilerOptions: { bindingMetadata: script?.bindings } }) : { errors: [] }
      assert.deepEqual([...errors, ...template.errors].map(e => e.message || e), [], path)
    }
  }
  check('src')
})
