import test from 'node:test'
import assert from 'node:assert/strict'
import { filterPeopleByName } from '../src/utils/globalSearch.js'
import { readFileSync } from 'node:fs'
import { computed, nextTick, ref, watch } from 'vue'
import { normalizeSearchText } from '../src/utils/globalSearch.js'

test('person search matches names and accents, never a role instead of the name', () => {
  const people = [
    { id: '1', name: 'Acácio Dantas', role: 'Líder de Sala de Pano' },
    { id: '2', name: 'Pablo Henrique', role: 'Mecânico' },
    { id: '3', name: 'João Paulo', role: '' },
  ]
  assert.deepEqual(filterPeopleByName(people, 'pa').map(p => p.id), ['2', '3'])
  assert.deepEqual(filterPeopleByName(people, 'JOAO').map(p => p.id), ['3'])
  assert.deepEqual(filterPeopleByName(people, 'henrique pablo').map(p => p.id), ['2'])
  assert.deepEqual(filterPeopleByName(people, 'mecanico'), [])
  assert.deepEqual(filterPeopleByName(people, ''), people)
})

test('person picker arrows navigate, Enter selects, and Tab selects without committing', async () => {
  const source = readFileSync(new URL('../src/components/ui/PersonPicker.vue', import.meta.url), 'utf8')
    .split('<script setup>')[1].split('</script>')[0].replace(/^import .*$/gm, '')
  const events = []
  const people = ref([{ id: '1', name: 'Pablo' }, { id: '2', name: 'Paulo' }])
  const picker = new Function('computed', 'nextTick', 'onBeforeUnmount', 'onMounted', 'ref', 'watch',
    'usePeople', 'filterPeopleByName', 'normalizeText', 'defineProps', 'defineEmits', 'defineExpose', 'window',
    `${source}\nreturn { search, open, activeIndex, moveActive, handleInput, handleEnter, handleTab }`
  )(computed, nextTick, () => {}, () => {}, ref, watch, () => ({ activePeople: people }),
    filterPeopleByName, normalizeSearchText, () => ({ modelValue: '' }),
    () => (...args) => events.push(args), () => {}, { dispatchEvent() {} })

  picker.search.value = 'pa'
  picker.handleInput()
  await nextTick()
  assert.equal(picker.activeIndex.value, 0)
  picker.moveActive(1)
  assert.equal(picker.activeIndex.value, 1)
  picker.moveActive(-1)
  assert.equal(picker.activeIndex.value, 0)
  picker.handleEnter()
  assert.equal(events.find(([event]) => event === 'select')[1].id, '1')
  assert.equal(picker.open.value, false)

  events.length = 0
  picker.search.value = 'pa'
  picker.handleInput()
  await nextTick()
  picker.moveActive(1)
  const expectedId = people.value[picker.activeIndex.value].id
  picker.handleTab({ shiftKey: false })
  assert.equal(events.find(([event]) => event === 'select')[1].id, expectedId)
  assert.equal(events.some(([event]) => event === 'commit'), false)
  assert.equal(picker.open.value, false)

  events.length = 0
  picker.search.value = 'não existe'
  picker.handleInput()
  await nextTick()
  picker.moveActive(1)
  picker.handleTab({ shiftKey: false })
  assert.equal(events.some(([event]) => event === 'select'), false)
})
