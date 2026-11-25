<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePeople } from '../../composables/usePeople.js'
import { filterPeopleByName, normalizeSearchText as normalizeText } from '../../utils/globalSearch.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Buscar pessoa...' },
  invalid: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'select', 'clear', 'commit'])

const { activePeople } = usePeople()
const search = ref(props.modelValue || '')
const open = ref(false)
const inputEl = ref(null)
const rootEl = ref(null)
const listEl = ref(null)
const activeIndex = ref(-1)
const pickerId = `person-${Math.random().toString(36).slice(2)}`

const filteredPeople = computed(() => filterPeopleByName(activePeople.value, search.value))
watch(filteredPeople, people => { activeIndex.value = search.value.trim() && people.length ? 0 : -1 })

const selectedPerson = computed(() =>
  activePeople.value.find(person => normalizeText(person.name) === normalizeText(props.modelValue)) || null
)

function openPicker() {
  window.dispatchEvent(new CustomEvent('app-picker-open', { detail: pickerId }))
  open.value = true
}

function handleOtherPickerOpen(event) {
  if (event.detail !== pickerId) open.value = false
}

function handlePointerDownOutside(event) {
  if (!open.value) return
  if (rootEl.value?.contains(event.target)) return
  open.value = false
}

onMounted(() => {
  window.addEventListener('app-picker-open', handleOtherPickerOpen)
  document.addEventListener('pointerdown', handlePointerDownOutside, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('app-picker-open', handleOtherPickerOpen)
  document.removeEventListener('pointerdown', handlePointerDownOutside, true)
})

watch(() => props.modelValue, value => {
  search.value = value || ''
})

function selectPerson(person) {
  search.value = person.name
  emit('update:modelValue', person.name)
  emit('select', person)
  open.value = false
  activeIndex.value = -1
}

function handleInput() {
  openPicker()
  emit('update:modelValue', search.value)
}

function handleEnter() {
  const person = open.value && (filteredPeople.value[activeIndex.value]
    || (filteredPeople.value.length === 1 ? filteredPeople.value[0] : null))
  if (person) selectPerson(person)
  emit('commit')
}

function handleTab(event) {
  if (event.shiftKey || !open.value) return
  const person = filteredPeople.value[activeIndex.value]
    || (filteredPeople.value.length === 1 ? filteredPeople.value[0] : null)
  if (person) selectPerson(person)
  open.value = false
}

function moveActive(direction) {
  openPicker()
  const count = filteredPeople.value.length
  if (!count) return
  activeIndex.value = activeIndex.value < 0
    ? (direction > 0 ? 0 : count - 1)
    : (activeIndex.value + direction + count) % count
  nextTick(() => listEl.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }))
}

function clearSelection() {
  search.value = ''
  emit('update:modelValue', '')
  emit('clear')
  inputEl.value?.focus()
  openPicker()
}

function focus() {
  inputEl.value?.focus?.()
}

defineExpose({ focus })
</script>

<template>
  <div ref="rootEl" class="relative" :class="open ? 'z-50' : 'z-0'">
    <input
      ref="inputEl"
      v-model="search"
      type="text"
      role="combobox"
      :aria-label="placeholder"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="`${pickerId}-list`"
      :aria-activedescendant="open && activeIndex >= 0 ? `${pickerId}-option-${activeIndex}` : undefined"
      :aria-invalid="invalid"
      autocomplete="off"
      :placeholder="placeholder"
      class="relative z-40 w-full border bg-white pr-9 text-gray-900 outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
      :class="[
        compact ? 'min-h-10 rounded-none border-0 px-3 py-2 text-sm dark:bg-gray-900' : 'rounded-lg px-3 py-2 text-sm',
        invalid ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500 dark:border-amber-700' : 'border-gray-300 focus:border-transparent dark:border-gray-600'
      ]"
      @input="handleInput"
      @focus="openPicker"
      @keydown.down.prevent="moveActive(1)"
      @keydown.up.prevent="moveActive(-1)"
      @keydown.enter.stop.prevent="handleEnter"
      @keydown.tab="handleTab"
      @keydown.escape.stop="open = false"
      @blur="open = false"
    />
    <button
      v-if="modelValue"
      type="button"
      tabindex="-1"
      class="absolute right-2 top-1/2 z-40 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      title="Limpar pessoa"
      @mousedown.prevent
      @click.stop="clearSelection"
    >
      <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    </button>

    <div
      v-if="open"
      class="ds-pop person-picker-panel absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 overflow-hidden rounded-lg border text-sm shadow-lg"
    >
      <p class="person-picker-hint px-3 py-2 text-xs">Buscar pelo nome · {{ filteredPeople.length }} {{ filteredPeople.length === 1 ? 'pessoa' : 'pessoas' }}</p>
      <div :id="`${pickerId}-list`" ref="listEl" role="listbox" aria-label="Pessoas cadastradas" class="max-h-56 overflow-y-auto py-1">
      <button
        v-for="(person, index) in filteredPeople"
        :key="person.id"
        :id="`${pickerId}-option-${index}`"
        type="button"
        role="option"
        tabindex="-1"
        :aria-selected="selectedPerson?.id === person.id"
        :data-active="activeIndex === index"
        class="person-picker-option flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors"
        :class="{ 'person-picker-active': activeIndex === index || selectedPerson?.id === person.id }"
        @pointerdown.prevent
        @click="selectPerson(person)"
      >
        <span class="min-w-0">
          <span class="block break-words font-medium">{{ person.name }}</span>
          <span v-if="person.role" class="person-picker-role block break-words text-xs">{{ person.role }}</span>
        </span>
        <span v-if="selectedPerson?.id === person.id" aria-hidden="true">✓</span>
      </button>
      </div>
      <p v-if="!filteredPeople.length" class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
        Nenhuma pessoa cadastrada encontrada.
      </p>
    </div>
  </div>
</template>

<style scoped>
.person-picker-panel { background: var(--ds-panel); border-color: var(--ds-border); color: var(--ds-text); }
.person-picker-hint { color: var(--ds-text-soft); border-bottom: 1px solid var(--ds-border-subtle); }
.person-picker-role { color: var(--ds-text-soft); margin-top: 2px; }
.person-picker-option:hover { background: var(--ds-surface-hover); }
.person-picker-option.person-picker-active { background: var(--ds-active-bg); color: var(--ds-active-text); }
.person-picker-active .person-picker-role { color: inherit; }
</style>
