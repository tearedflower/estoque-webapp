import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createRenderer, nextTick, ref } from 'vue'
import { useItems } from '../src/composables/useItems.js'

test('catalog keeps search when opening an item and clears it when navigating breadcrumbs', async () => {
  const file = new URL('../src/views/CatalogView.vue', import.meta.url)
  const { descriptor } = parse(await readFile(file, 'utf8'))
  const require = createRequire(import.meta.url)
  // Mount the actual navigation logic; child dialogs are irrelevant to this check.
  const source = compileScript(descriptor, { id: 'catalog-navigation-test' }).content
    .replace(/import (\w+) from ['"][^'"]+\.vue['"]/g, 'const $1 = {}')
    .replace(/from (['"])([^'"]+)\1/g, (_, quote, specifier) =>
      `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, file).href : pathToFileURL(require.resolve(specifier)).href)}`)
    .replaceAll('import.meta.env', '({})')
  const { default: Catalog } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  Catalog.render = () => null
  const renderer = createRenderer({
    createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null,
  })
  const catalog = useItems()
  const item = { id: 'junta', name: 'Junta', group: 'Peças', category: 'Vedação', subcategory: 'Juntas', attributes: [], unit: 'PC' }
  catalog.items.value = [item]
  catalog.variations.value = []
  const updates = []
  const app = renderer.createApp(Catalog, { search: 'Junta', 'onUpdate:search': value => updates.push(value) })
  app.provide('isAdmin', ref(false))
  app.provide('canOperate', ref(false))
  const vm = app.mount({})
  const state = vm.$.setupState
  try {
    vm.openItemById('junta')
    await nextTick()
    assert.equal(state.viewingItem.id, 'junta')
    assert.equal(state.searchQuery, 'Junta')
    assert.equal(state.searchNorm, 'junta')
    assert.equal(updates.length, 0, 'Opening a result must preserve the search.')
    state.goToSubcategory('Vedação', 'Juntas')
    await nextTick()
    assert.equal(updates.at(-1), '')
    assert.equal(state.searchNorm, '', 'The parent folder must not remain filtered by the search.')
    assert.equal(state.viewingItem, null, 'A parent with one item must not reopen that item.')
    assert.equal(catalog.activeSubcategory.value, 'Juntas')
    vm.openItemById('junta')
    await nextTick()
    assert.equal(catalog.activeGroup.value, 'Peças', 'Opening within the same group must not toggle the group off.')
    state.searchCatalog('')
    await nextTick()
    assert.equal(state.viewingItem.id, 'junta', 'Clearing the search must not close the material.')
    state.goToCategory('Vedação')
    await nextTick()
    assert.equal(state.viewingItem, null)
    assert.equal(catalog.activeCategory.value, 'Vedação')
    assert.equal(catalog.activeSubcategory.value, null)
    state.goToGroup()
    await nextTick()
    assert.equal(catalog.activeGroup.value, 'Peças')
    assert.equal(catalog.activeCategory.value, null)
    state.goToRoot()
    await nextTick()
    assert.equal(catalog.activeGroup.value, null)
  } finally {
    app.unmount()
    catalog.items.value = []
  }
})
