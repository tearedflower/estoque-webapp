<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { normalizeSearchText as normalizeText } from '../../utils/globalSearch.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Todos os motores' },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])
const search = ref('')
const open = ref(false)
const rootEl = ref(null)
const pickerId = `motor-${Math.random().toString(36).slice(2)}`

const selectedOption = computed(() =>
  props.options.find(option => option.id === props.modelValue) || null
)

const filteredOptions = computed(() => {
  const query = normalizeText(search.value)
  if (!query || selectedOption.value?.label === search.value) return props.options
  return props.options.filter(option => normalizeText(option.label).includes(query))
})

watch(() => props.modelValue, () => {
  if (selectedOption.value) search.value = selectedOption.value.label
  else if (!open.value) search.value = ''
}, { immediate: true })

function openPicker() {
  if (props.disabled) return
  window.dispatchEvent(new CustomEvent('app-picker-open', { detail: pickerId }))
  open.value = true
}

function select(option = null) {
  emit('update:modelValue', option?.id || '')
  search.value = option?.label || ''
  open.value = false
}

function handleInput() {
  openPicker()
  if (selectedOption.value?.label !== search.value) emit('update:modelValue', '')
}

function handleOtherPickerOpen(event) {
  if (event.detail !== pickerId) open.value = false
}

function handlePointerDownOutside(event) {
  if (open.value && !rootEl.value?.contains(event.target)) open.value = false
}

onMounted(() => {
  window.addEventListener('app-picker-open', handleOtherPickerOpen)
  document.addEventListener('pointerdown', handlePointerDownOutside, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('app-picker-open', handleOtherPickerOpen)
  document.removeEventListener('pointerdown', handlePointerDownOutside, true)
})
</script>

<template>
  <div ref="rootEl" class="relative" :class="open ? 'z-50' : 'z-0'">
    <input
      v-model="search"
      type="search"
      autocomplete="off"
      :disabled="disabled"
      :placeholder="placeholder"
      class="ds-input"
      role="combobox"
      aria-label="Motor"
      aria-autocomplete="list"
      :aria-expanded="open"
      @focus="openPicker"
      @input="handleInput"
      @keydown.tab="open = false"
      @keydown.escape.stop="open = false"
      @keydown.enter.prevent="filteredOptions.length === 1 && select(filteredOptions[0])"
    />
    <div
      v-if="open"
      role="listbox"
      class="ds-pop absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 max-h-60 overflow-auto rounded-lg border border-gray-300 bg-white text-sm text-gray-900 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
    >
      <button
        type="button"
        role="option"
        :aria-selected="!modelValue"
        class="w-full px-3 py-2 text-left text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        @mousedown.prevent="select()"
      >
        Todos os motores
      </button>
      <button
        v-for="option in filteredOptions"
        :key="option.id"
        type="button"
        role="option"
        :aria-selected="option.id === modelValue"
        class="w-full px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
        :class="option.id === modelValue ? 'bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300' : ''"
        @mousedown.prevent="select(option)"
      >
        <span class="block truncate font-medium">{{ option.label }}</span>
      </button>
      <p v-if="!filteredOptions.length" class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
        Nenhum motor encontrado.
      </p>
    </div>
  </div>
</template>
