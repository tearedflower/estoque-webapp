<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDestinations } from '../../composables/useDestinations.js'
import { useLocations } from '../../composables/useLocations.js'
import { matchesSearchTokens, searchTokens } from '../../utils/globalSearch.js'

const props = defineProps({
  modelValue: { type: [String, Array], default: '' },
  placeholder: { type: String, default: 'Buscar destino...' },
  linkedIds: { type: Array, default: () => [] },
  allowOther: { type: Boolean, default: false },
  otherLabel: { type: String, default: 'Outro (digitar)...' },
  compact: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  source: { type: String, default: 'destinations', validator: value => ['destinations', 'locations'].includes(value) },
})

const emit = defineEmits(['update:modelValue', 'select', 'other', 'clear'])

const destinationSource = useDestinations()
const locationSource = useLocations()
const sourceGroups = computed(() =>
  props.source === 'locations' ? locationSource.groupedLocais.value : destinationSource.groupedDestinations.value
)
const entityLabel = computed(() => props.source === 'locations' ? 'local' : 'destino')
const search = ref('')
const open = ref(false)
const expandedGroups = ref(new Set())
const inputEl = ref(null)
const rootEl = ref(null)
const listEl = ref(null)
const activeIndex = ref(-1)
const pickerId = `${props.source}-${Math.random().toString(36).slice(2)}`

function fullName(idOrName) {
  return props.source === 'locations'
    ? locationSource.getFullName(idOrName)
    : destinationSource.getDestFullName(idOrName)
}

function selectionValue(item) {
  return props.source === 'locations' ? fullName(item.id) : item.id
}

const selectedValues = computed(() =>
  props.multiple
    ? (Array.isArray(props.modelValue) ? props.modelValue : [])
    : (props.modelValue ? [props.modelValue] : [])
)
const selectedPath = computed(() => props.modelValue ? fullName(props.modelValue) : '')

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

watch(() => props.modelValue, (id, oldId) => {
  if (props.multiple) {
    search.value = ''
    return
  }
  if (id && id !== oldId) {
    search.value = selectedPath.value
    return
  }
  if (!id && !open.value) search.value = ''
}, { deep: true, immediate: true })

const filteredGroups = computed(() => {
  const tokens = searchTokens(search.value)
  return sourceGroups.value
    .map(group => {
      const parentPath = fullName(group.parent.id)
      const parentMatches = matchesSearchTokens(parentPath, tokens)
      const children = !tokens.length || parentMatches
        ? group.children
        : group.children.filter(child =>
          matchesSearchTokens(fullName(child.id), tokens)
        )
      if (!parentMatches && !children.length) return null
      return { parent: group.parent, children, parentMatches }
    })
    .filter(Boolean)
})

const filteredCount = computed(() =>
  filteredGroups.value.reduce((sum, group) => sum + (group.parentMatches ? 1 : 0) + group.children.length, 0)
)

const keyboardOptions = computed(() => [
  filteredGroups.value.flatMap(group => [
    ...(group.parentMatches ? [{ destination: group.parent }] : []),
    ...(isGroupOpen(group) ? group.children.map(destination => ({ destination })) : []),
  ]),
  props.allowOther ? [{ other: true }] : [],
].flat())
const activeOption = computed(() => keyboardOptions.value[activeIndex.value])
const activeOptionId = computed(() => activeOption.value
  ? `${pickerId}-${activeOption.value.other ? 'other' : `destination-${activeOption.value.destination.id}`}` : undefined)
watch(keyboardOptions, options => { activeIndex.value = search.value.trim() && options.length ? 0 : -1 })

function selectedParentId() {
  if (!selectedValues.value.length) return ''
  for (const group of sourceGroups.value) {
    if (selectedValues.value.includes(selectionValue(group.parent))) return group.parent.id
    if (group.children.some(child => selectedValues.value.includes(selectionValue(child)))) return group.parent.id
  }
  return ''
}

function isGroupOpen(group) {
  return Boolean(search.value.trim()) ||
    expandedGroups.value.has(group.parent.id) ||
    selectedParentId() === group.parent.id
}

function toggleGroup(groupId) {
  const next = new Set(expandedGroups.value)
  if (next.has(groupId)) next.delete(groupId)
  else next.add(groupId)
  expandedGroups.value = next
}

function selectDestination(destination, focusInput = true) {
  const path = fullName(destination.id)
  const value = selectionValue(destination)
  if (props.multiple) {
    if (!selectedValues.value.includes(value)) emit('update:modelValue', [...selectedValues.value, value])
    emit('select', { destination, fullName: path })
    search.value = ''
    if (focusInput) nextTick(() => inputEl.value?.focus?.())
    return
  }
  emit('update:modelValue', value)
  emit('select', { destination, fullName: path })
  search.value = path
  open.value = false
  activeIndex.value = -1
}

function removeSelection(value) {
  emit('update:modelValue', selectedValues.value.filter(selected => selected !== value))
  emit('clear', value)
}

function clearSelection() {
  emit('update:modelValue', props.multiple ? [] : '')
  emit('clear')
  search.value = ''
  inputEl.value?.focus()
  openPicker()
}

function handleInput() {
  openPicker()
  if (!props.multiple && props.modelValue && search.value !== selectedPath.value) {
    emit('update:modelValue', '')
    emit('clear')
  }
}

function isSelected(item) {
  return selectedValues.value.includes(selectionValue(item))
}

function selectActive(focusInput = true) {
  const destinations = keyboardOptions.value.filter(option => !option.other)
  const option = activeOption.value || (destinations.length === 1 ? destinations[0] : null)
  if (option?.other) chooseOther()
  else if (option?.destination) selectDestination(option.destination, focusInput)
}

function handleEnter() {
  if (open.value) selectActive()
}

function handleTab(event) {
  if (event.shiftKey || !open.value) return
  selectActive(false)
  open.value = false
}

function moveActive(direction) {
  openPicker()
  const count = keyboardOptions.value.length
  if (!count) return
  activeIndex.value = activeIndex.value < 0
    ? (direction > 0 ? 0 : count - 1)
    : (activeIndex.value + direction + count) % count
  nextTick(() => listEl.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }))
}

function chooseOther() {
  emit('update:modelValue', '')
  emit('other')
  search.value = ''
  open.value = false
}

function focus() {
  inputEl.value?.focus?.()
}

defineExpose({ focus })
</script>

<template>
  <div ref="rootEl" class="relative" :class="open ? 'z-50' : 'z-0'" @focusout="!rootEl?.contains($event.relatedTarget) && (open = false)">
    <div
      v-if="multiple"
      class="flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 border border-gray-300 bg-white px-2 py-1.5 text-gray-900 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      :class="compact ? 'rounded-none border-0 dark:bg-gray-900' : 'rounded-lg'"
      @click="inputEl?.focus()"
    >
      <span
        v-for="value in selectedValues"
        :key="value"
        class="ds-attribute-tag inline-flex min-h-7 max-w-full items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold"
      >
        <span class="truncate">{{ fullName(value) }}</span>
        <button
          type="button"
          class="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          :aria-label="`Remover ${fullName(value)}`"
          @click.stop="removeSelection(value)"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </span>
      <input
        ref="inputEl"
        v-model="search"
        type="search"
        role="combobox"
        :aria-label="placeholder"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="`${pickerId}-list`"
        :aria-activedescendant="open ? activeOptionId : undefined"
        :placeholder="selectedValues.length ? '' : placeholder"
        autocomplete="off"
        class="min-h-7 min-w-32 flex-1 border-0 bg-transparent px-1 py-0.5 text-sm text-gray-900 outline-none dark:text-gray-100"
        @input="handleInput"
        @focus="openPicker"
        @keydown.down.prevent="moveActive(1)"
        @keydown.up.prevent="moveActive(-1)"
        @keydown.tab="handleTab"
        @keydown.enter.stop.prevent="handleEnter"
        @keydown.escape.stop.prevent="open = false"
      />
    </div>
    <input
      v-else
      ref="inputEl"
      v-model="search"
      type="search"
      role="combobox"
      :aria-label="placeholder"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="`${pickerId}-list`"
      :aria-activedescendant="open ? activeOptionId : undefined"
      :placeholder="placeholder"
      autocomplete="off"
      class="relative z-40 w-full border border-gray-300 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      :class="compact ? 'min-h-10 rounded-none border-0 px-3 py-2 dark:bg-gray-900' : 'rounded-lg px-3 py-2.5'"
      @input="handleInput"
      @focus="openPicker"
      @keydown.down.prevent="moveActive(1)"
      @keydown.up.prevent="moveActive(-1)"
      @keydown.tab="handleTab"
      @keydown.enter.stop.prevent="handleEnter"
      @keydown.escape.stop.prevent="open = false"
    />
    <button
      v-if="!multiple && modelValue && !open"
      type="button"
      tabindex="-1"
      class="absolute right-2 top-1/2 z-40 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      :title="`Limpar ${entityLabel}`"
      @mousedown.prevent
      @click.stop="clearSelection"
    >
      <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    </button>

    <div
      v-if="open"
      class="ds-pop destination-picker-panel absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 overflow-hidden rounded-lg border text-sm shadow-lg"
    >
      <p class="destination-picker-hint px-3 py-2 text-xs">Buscar pelo nome · {{ filteredCount }} {{ source === 'locations' ? (filteredCount === 1 ? 'local' : 'locais') : (filteredCount === 1 ? 'destino' : 'destinos') }}</p>
      <div :id="`${pickerId}-list`" ref="listEl" role="listbox" :aria-label="source === 'locations' ? 'Locais cadastrados' : 'Destinos cadastrados'" :aria-multiselectable="multiple || undefined" class="max-h-56 overflow-y-auto py-1">
      <p v-if="!filteredCount" class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Nenhum {{ entityLabel }} encontrado.</p>

      <div v-for="group in filteredGroups" :key="group.parent.id" class="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
        <div class="flex items-center">
          <button
            type="button"
            class="flex h-9 w-9 shrink-0 items-center justify-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            :class="group.children.length ? 'cursor-pointer' : 'cursor-default opacity-40'"
            :disabled="!group.children.length"
            :title="isGroupOpen(group) ? 'Recolher subníveis' : 'Abrir subníveis'"
            :aria-expanded="isGroupOpen(group)"
            @pointerdown.prevent
            @click="toggleGroup(group.parent.id)"
          >
            <svg class="h-4 w-4 transition-transform" :class="isGroupOpen(group) ? 'rotate-90' : ''" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <button
            v-if="group.parentMatches"
            :id="`${pickerId}-destination-${group.parent.id}`"
            type="button"
            role="option"
            tabindex="-1"
            :aria-selected="isSelected(group.parent)"
            :data-active="activeOption?.destination?.id === group.parent.id"
            class="destination-picker-option min-w-0 flex-1 px-2 py-2 text-left transition-colors cursor-pointer"
            :class="{ 'destination-picker-active': isSelected(group.parent) || activeOption?.destination?.id === group.parent.id }"
            @pointerdown.prevent
            @click="selectDestination(group.parent)"
          >
            <span class="flex items-center gap-2 truncate font-medium">
              <span class="truncate">{{ group.parent.name }}</span>
              <span v-if="isSelected(group.parent)" aria-hidden="true" class="ml-auto">✓</span>
              <span v-if="linkedIds.includes(group.parent.id)" class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Vinculado</span>
            </span>
            <span v-if="group.children.length" class="block text-[11px] text-gray-500 dark:text-gray-400">{{ group.children.length }} descendente(s)</span>
          </button>
          <div v-else class="min-w-0 flex-1 px-2 py-2">
            <span class="block truncate text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ group.parent.name }}</span>
          </div>
        </div>

        <div v-if="group.children.length && isGroupOpen(group)" class="bg-gray-50 dark:bg-gray-950/50">
          <button
            v-for="child in group.children"
            :key="child.id"
            :id="`${pickerId}-destination-${child.id}`"
            type="button"
            role="option"
            tabindex="-1"
            :aria-selected="isSelected(child)"
            :data-active="activeOption?.destination?.id === child.id"
            class="destination-picker-option flex w-full items-center gap-2 px-9 py-2 text-left transition-colors cursor-pointer"
            :class="{ 'destination-picker-active': isSelected(child) || activeOption?.destination?.id === child.id }"
            @pointerdown.prevent
            @click="selectDestination(child)"
          >
            <span class="h-px w-3 bg-gray-300 dark:bg-gray-700"></span>
            <span class="min-w-0 truncate">{{ fullName(child.id) }}</span>
            <span v-if="isSelected(child)" aria-hidden="true" class="ml-auto">✓</span>
            <span v-if="linkedIds.includes(child.id)" class="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Vinculado</span>
          </button>
        </div>
      </div>

      <template v-if="allowOther">
        <div class="mx-2 my-1 border-t border-gray-100 dark:border-gray-700"></div>
        <button
          :id="`${pickerId}-other`"
          type="button"
          role="option"
          tabindex="-1"
          :aria-selected="false"
          :data-active="!!activeOption?.other"
          :class="{ 'destination-picker-active': activeOption?.other }"
          class="destination-picker-option flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors cursor-pointer"
          @pointerdown.prevent
          @click="chooseOther"
        >
          <svg class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
          </svg>
          {{ otherLabel }}
        </button>
      </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.destination-picker-panel { background: var(--ds-panel); border-color: var(--ds-border); color: var(--ds-text); }
.destination-picker-hint { color: var(--ds-text-soft); border-bottom: 1px solid var(--ds-border-subtle); }
.destination-picker-option:hover { background: var(--ds-surface-hover); }
.destination-picker-option.destination-picker-active { background: var(--ds-active-bg); color: var(--ds-active-text); }
</style>
