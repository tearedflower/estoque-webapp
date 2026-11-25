<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSuppliers } from '../../composables/useSuppliers.js'
import { normalizeSearchText as normalizeText } from '../../utils/globalSearch.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Buscar fornecedor...' },
})

const emit = defineEmits(['update:modelValue', 'select', 'change', 'clear'])
const { activeSuppliers } = useSuppliers()
const search = ref(props.modelValue || '')
const open = ref(false)
const rootEl = ref(null)
const pickerId = `supplier-${Math.random().toString(36).slice(2)}`

const filteredSuppliers = computed(() => {
  const query = normalizeText(search.value)
  if (!query) return activeSuppliers.value
  return activeSuppliers.value.filter(supplier =>
    normalizeText(`${supplier.name} ${supplier.description || ''}`).includes(query)
  )
})
const typedName = computed(() => String(search.value || '').trim())
const exactSupplier = computed(() => activeSuppliers.value.find(supplier =>
  normalizeText(supplier.name) === normalizeText(typedName.value)
) || null)

function openPicker() {
  window.dispatchEvent(new CustomEvent('app-picker-open', { detail: pickerId }))
  open.value = true
}

function closePicker() {
  open.value = false
  search.value = props.modelValue || ''
}

function handleOtherPickerOpen(event) {
  if (event.detail !== pickerId) closePicker()
}

function handlePointerDownOutside(event) {
  if (open.value && !rootEl.value?.contains(event.target)) commitSearch()
}

function selectSupplier(supplier) {
  search.value = supplier.name
  emit('update:modelValue', supplier.name)
  emit('select', supplier)
  open.value = false
}

function clearSelection() {
  search.value = ''
  emit('update:modelValue', '')
  emit('clear')
  open.value = false
}

function commitSearch() {
  if (!typedName.value) return clearSelection()
  if (exactSupplier.value) return selectSupplier(exactSupplier.value)
  search.value = typedName.value
  emit('update:modelValue', typedName.value)
  emit('change', typedName.value)
  open.value = false
}

function handleEnter() {
  const supplier = exactSupplier.value || (filteredSuppliers.value.length === 1 ? filteredSuppliers.value[0] : null)
  if (supplier) selectSupplier(supplier)
  else commitSearch()
}

watch(() => props.modelValue, value => {
  if (!open.value) search.value = value || ''
})

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
      role="combobox"
      :aria-controls="`supplier-options-${pickerId}`"
      :aria-expanded="open"
      :placeholder="placeholder"
      class="relative z-40 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      @focus="openPicker"
      @input="openPicker"
      @keydown.enter.prevent="handleEnter"
      @keydown.tab="commitSearch"
      @keydown.escape.stop="closePicker"
    />
    <button
      v-if="modelValue && !open"
      type="button"
      class="absolute right-2 top-1/2 z-40 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      title="Limpar fornecedor"
      @click.stop="clearSelection"
    >
      <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
    </button>

    <div v-if="open" :id="`supplier-options-${pickerId}`" role="listbox" class="ds-pop absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 max-h-60 overflow-auto rounded-lg border border-gray-300 bg-white text-sm text-gray-900 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
      <button type="button" role="option" :aria-selected="!modelValue" class="w-full px-3 py-2 text-left text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" @mousedown.prevent="clearSelection">Sem fornecedor</button>
      <button v-if="typedName && !exactSupplier" type="button" role="option" aria-selected="false" class="w-full border-y border-gray-200 px-3 py-2 text-left text-xs font-semibold text-primary-700 hover:bg-primary-50 dark:border-gray-700 dark:text-primary-300 dark:hover:bg-primary-950/40" @mousedown.prevent="commitSearch">Cadastrar “{{ typedName }}” ao confirmar</button>
      <button
        v-for="supplier in filteredSuppliers"
        :key="supplier.id"
        type="button"
        role="option"
        :aria-selected="normalizeText(modelValue) === normalizeText(supplier.name)"
        class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
        :class="normalizeText(modelValue) === normalizeText(supplier.name) ? 'bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300' : ''"
        @mousedown.prevent="selectSupplier(supplier)"
      >
        <span class="min-w-0 truncate font-medium">{{ supplier.name }}</span>
        <span v-if="supplier.description" class="shrink-0 text-xs text-gray-500 dark:text-gray-400">{{ supplier.description }}</span>
      </button>
      <p v-if="!filteredSuppliers.length" class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Nenhum fornecedor encontrado.</p>
    </div>
  </div>
</template>
