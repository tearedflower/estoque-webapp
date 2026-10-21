import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import { matchesSearchTokens, searchTokens } from '../src/utils/globalSearch.js'

const source = readFileSync(new URL('../src/components/ui/DestinationTreePicker.vue', import.meta.url), 'utf8')
  .split('<script setup>')[1].split('</script>')[0].replace(/^import .*$/gm, '')
const groups = [
  { parent: { id: 'salao', name: 'Salão', description: 'Mecânico' }, children: [{ id: 'oficina', name: 'Oficina São José' }, { id: 'norte', name: 'Oficina Norte' }] },
  { parent: { id: 'epi', name: 'EPI' }, children: [] },
]
const names = { salao: 'Salão', oficina: 'Salão > Oficina São José', norte: 'Salão > Oficina Norte', epi: 'EPI' }

function picker(overrides = {}) {
  const props = reactive({ modelValue: '', multiple: false, source: 'destinations', allowOther: false, ...overrides })
  const events = []
  const scope = effectScope()
  const api = scope.run(() => new Function('computed', 'nextTick', 'onBeforeUnmount', 'onMounted', 'ref', 'watch',
    'useDestinations', 'useLocations', 'matchesSearchTokens', 'searchTokens', 'defineProps', 'defineEmits', 'defineExpose', 'window',
    `${source}\nreturn { search, open, activeIndex, keyboardOptions, moveActive, handleInput, handleEnter, handleTab, toggleGroup, inputEl }`
  )(computed, nextTick, () => {}, () => {}, ref, watch,
    () => ({ groupedDestinations: ref(groups), getDestFullName: id => names[id] || id }),
    () => ({ groupedLocais: ref(groups), getFullName: id => names[id] || id }),
    matchesSearchTokens, searchTokens, () => props, () => (...args) => events.push(args), () => {}, { dispatchEvent() {} }))
  return { ...api, props, events, stop: () => scope.stop() }
}

test('destination keyboard navigation follows only visible hierarchy and selects with Enter', async () => {
  const p = picker()
  try {
    p.moveActive(1)
    assert.equal(p.keyboardOptions.value[p.activeIndex.value].destination.id, 'salao')
    p.moveActive(1)
    assert.equal(p.keyboardOptions.value[p.activeIndex.value].destination.id, 'epi')
    p.moveActive(1)
    assert.equal(p.activeIndex.value, 0)
    p.toggleGroup('salao')
    await nextTick()
    p.moveActive(1)
    p.moveActive(1)
    assert.equal(p.keyboardOptions.value[p.activeIndex.value].destination.id, 'oficina')
    p.moveActive(-1)
    assert.equal(p.keyboardOptions.value[p.activeIndex.value].destination.id, 'salao')
    p.moveActive(1)
    p.handleEnter()
    assert.deepEqual(p.events.find(([name]) => name === 'select')[1], { destination: groups[0].children[0], fullName: names.oficina })
    assert.deepEqual(p.events.find(([name]) => name === 'update:modelValue'), ['update:modelValue', 'oficina'])
    assert.equal(p.open.value, false)
  } finally { p.stop() }
})

test('destination name search handles accents and token order; Tab selects without trapping focus', async () => {
  const p = picker()
  try {
    p.search.value = 'jose oficina'
    p.handleInput()
    await nextTick()
    assert.equal(p.activeIndex.value, 0)
    assert.equal(p.keyboardOptions.value.length, 1)
    p.handleTab({ shiftKey: false })
    assert.deepEqual(p.events.find(([name]) => name === 'update:modelValue'), ['update:modelValue', 'oficina'])
    assert.equal(p.open.value, false)
    p.events.length = 0
    p.search.value = 'mecanico'
    p.handleInput()
    await nextTick()
    assert.equal(p.keyboardOptions.value.length, 0)
    p.moveActive(1)
    p.handleEnter()
    p.handleTab({ shiftKey: false })
    assert.equal(p.events.length, 0)
    p.search.value = 'epi'
    p.handleInput()
    await nextTick()
    p.handleTab({ shiftKey: true })
    assert.equal(p.events.length, 0)
  } finally { p.stop() }
})

test('Other is keyboard selectable and multiple locations retain paths without refocusing on Tab', async () => {
  const other = picker({ allowOther: true })
  const multiple = picker({ multiple: true, source: 'locations', modelValue: ['Salão'] })
  try {
    other.search.value = 'inexistente'
    other.handleInput()
    await nextTick()
    other.handleEnter()
    assert.ok(other.events.some(([name]) => name === 'other'))
    assert.equal(other.open.value, false)
    let focusCalls = 0
    multiple.inputEl.value = { focus() { focusCalls++ } }
    multiple.search.value = 'jose'
    multiple.handleInput()
    await nextTick()
    multiple.handleTab({ shiftKey: false })
    await nextTick()
    assert.deepEqual(multiple.events.find(([name]) => name === 'update:modelValue'), ['update:modelValue', ['Salão', names.oficina]])
    assert.equal(multiple.open.value, false)
    assert.equal(focusCalls, 0)
  } finally { other.stop(); multiple.stop() }
})
