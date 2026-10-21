import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'
import { orderedAttributeNames } from '../src/utils/attributes.js'

test('manual attribute order persists by model, reloads and remains unchanged when saving fails', async () => {
  const source = readFileSync(new URL('../src/composables/useItems.js', import.meta.url), 'utf8')
  const load = source.slice(source.indexOf('  async function loadData()'), source.indexOf('  // ===== CRUD ====='))
  const splice = source.slice(source.indexOf('  function _splice('), source.indexOf('  async function reorderGroups('))
  const reorder = source.slice(source.indexOf('  async function reorderItemAttributes('), source.indexOf('  // ===== Reset ====='))
  const rows = [{ id: 'one', attributes: ['Tipo', 'Modelo', 'Marca'] }, { id: 'two', attributes: ['Tipo', 'Marca'] }]
  let persisted = { groups: ['Transmissão'] }
  let fail = false
  let saves = 0
  const items = ref([]), variations = ref([]), orderData = ref({})
  const api = {
    getItems: async () => structuredClone(rows), getVariations: async () => [], getDisplayOrder: async () => structuredClone(persisted),
    saveDisplayOrder: async data => {
      if (fail) throw new Error('Falha de rede')
      saves++
      persisted = JSON.parse(JSON.stringify(data))
    },
  }
  const store = new Function('items', 'variations', 'orderData', 'api', 'orderedAttributeNames', 'sortItems', 'sortVariations',
    `${load}\n${splice}\n${reorder}\nreturn { loadData, reorderItemAttributes }`
  )(items, variations, orderData, api, orderedAttributeNames, value => value, value => value)
  await store.loadData()
  assert.deepEqual(orderedAttributeNames(items.value[0]), ['Marca', 'Modelo', 'Tipo'])
  await store.reorderItemAttributes('one', 1, 0)
  assert.deepEqual(orderedAttributeNames(items.value[0]), ['Modelo', 'Marca', 'Tipo'])
  assert.deepEqual(persisted, { groups: ['Transmissão'], itemAttributes: { one: ['Modelo', 'Marca', 'Tipo'] } })
  await store.loadData()
  assert.deepEqual(orderedAttributeNames(items.value[0]), ['Modelo', 'Marca', 'Tipo'])
  assert.deepEqual(orderedAttributeNames(items.value[1]), ['Marca', 'Tipo'])
  assert.deepEqual(items.value[0].attributes, rows[0].attributes)
  await store.reorderItemAttributes('one', 0, -1)
  assert.equal(saves, 1)
  fail = true
  await assert.rejects(store.reorderItemAttributes('one', 0, 1), /Falha de rede/)
  assert.deepEqual(orderedAttributeNames(items.value[0]), ['Modelo', 'Marca', 'Tipo'])
  assert.deepEqual(orderData.value.itemAttributes.one, ['Modelo', 'Marca', 'Tipo'])
})
