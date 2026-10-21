import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { effectScope, nextTick, ref, watch } from 'vue'

test('opening an item from stock highlights and scrolls to the variation without filtering or opening its sheet', async () => {
  const source = readFileSync(new URL('../src/views/CatalogView.vue', import.meta.url), 'utf8')
  const setup = source.slice(source.indexOf("const highlightedVariationId = ref('')"), source.indexOf('function closeItem()'))
  const navigate = source.slice(source.indexOf('function openItemById('), source.indexOf('function variationQueryText('))
  const item = { id: 'bearing', name: 'Rolamento', group: 'Transmissão', category: 'Rolamentos' }
  const variations = [{ id: 'v1', itemId: item.id }, { id: 'v2', itemId: item.id }]
  const viewingItem = ref(null)
  const varSearchQuery = ref('busca antiga')
  const events = []
  const scrolled = []
  const scope = effectScope()
  try {
    const catalog = scope.run(() => new Function('ref', 'watch', 'nextTick', 'requestAnimationFrame', 'viewingItem', 'varSearchQuery', 'getVariationsForItem', 'setViewingItem', 'emit', 'items', 'activeGroup', 'setActiveGroup', 'setActiveCategory', 'setActiveSubcategory',
      `${setup}\n${navigate}\nreturn { openItemById, highlightedVariationId, variationTable }`
    )(ref, watch, nextTick, callback => callback(), viewingItem, varSearchQuery,
      id => variations.filter(row => row.itemId === id), () => {}, (...args) => events.push(args), ref([item]), ref(null), () => {}, () => {}, () => {}))
    catalog.variationTable.value = { querySelector: selector => {
      assert.equal(selector, '[data-catalog-highlight="true"]')
      return { scrollIntoView: options => scrolled.push(options) }
    } }
    assert.equal(catalog.openItemById(item.id, 'v2'), true)
    await nextTick()
    await nextTick()
    await nextTick()
    assert.equal(viewingItem.value.id, item.id)
    assert.equal(varSearchQuery.value, '')
    assert.equal(variations.length, 2)
    assert.equal(catalog.highlightedVariationId.value, 'v2')
    assert.deepEqual(events.at(-1), ['update:record', { itemId: item.id, variationId: '', highlightVariationId: 'v2' }])
    assert.deepEqual(scrolled, [{ block: 'center' }])
    catalog.openItemById(item.id)
    await nextTick()
    assert.equal(catalog.highlightedVariationId.value, '')
  } finally { scope.stop() }
})
