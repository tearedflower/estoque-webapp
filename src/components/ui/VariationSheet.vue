<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { orderedAttributeNames, variationAttributeRows } from '../../utils/attributes.js'
import { useAuth } from '../../composables/useAuth.js'
import { stockAlertStatus, useItems } from '../../composables/useItems.js'
import { useDestinations } from '../../composables/useDestinations.js'
import { useToast } from '../../composables/useToast.js'
import { deleteVariationPhotoImage, putVariationPhotoImage } from '../../services/api.js'
import { compressImageFile } from '../../utils/imageFile.js'
import { extrasListToObject, validateVariationForm, variationFormForEdit } from '../../utils/variationForm.js'
import { summarizeVariationMovements } from '../../utils/variationMovementStats.js'
import AppDialog from './AppDialog.vue'
import ConfirmInline from './ConfirmInline.vue'
import DestinationTreePicker from './DestinationTreePicker.vue'

const props = defineProps({
  item: { type: Object, required: true },
  variation: { type: Object, required: true },
  movements: { type: Array, default: () => [] },
  workOrders: { type: Array, default: () => [] },
  canManage: { type: Boolean, default: false },
  canAdjust: { type: Boolean, default: false },
  canEditDetails: { type: Boolean, default: false },
  showCatalogLink: { type: Boolean, default: false },
  initialTab: { type: String, default: 'data' },
})

const emit = defineEmits(['close', 'quick-movement', 'adjust-stock', 'open-work-order', 'go-to-catalog'])
const { user } = useAuth()
const { getDestFullName } = useDestinations()
const {
  items,
  variations,
  editVariation,
  getCategoriesForGroup,
  getSubcategoriesForCategory,
} = useItems()
const { success, error } = useToast()

const activeTab = ref(props.initialTab)
const dialogRef = ref(null)
const adjustOpen = ref(false)
const adjustValue = ref('')
const editForm = ref(variationFormForEdit(props.item, props.variation))
const editSaving = ref(false)
const initialStockOpen = ref(false)
const initialStockValue = ref(0)
const photoFailed = ref(false)
const photoExpanded = ref(false)
const photoInput = ref(null)
const photoEditInput = ref(null)
const photoUploading = ref(false)
const photoRemoving = ref(false)
const photoRemoveConfirm = ref(false)
const photoRevision = ref(0)
const targetGroup = ref('')
const targetCategory = ref('')
const targetSubcategory = ref('')
const targetItemId = ref('')

onMounted(async () => {
  await nextTick()
  if (dialogRef.value && !dialogRef.value.open) dialogRef.value.showModal()
})
onUnmounted(() => dialogRef.value?.close())

const status = computed(() => stockAlertStatus(props.variation, props.item))
const canSetInitialStock = computed(() => props.canEditDetails && user.value?.id === 'user_admin')
const targetGroups = computed(() =>
  [...new Set(items.value.map(item => item.group))]
    .sort((left, right) => left.localeCompare(right, 'pt-BR', { sensitivity: 'base' }))
)
const targetCategories = computed(() =>
  targetGroup.value ? getCategoriesForGroup(targetGroup.value) : []
)
const targetSubcategories = computed(() =>
  targetGroup.value && targetCategory.value
    ? getSubcategoriesForCategory(targetGroup.value, targetCategory.value)
    : []
)
const targetItems = computed(() => items.value
  .filter(item => item.group === targetGroup.value)
  .filter(item => targetCategory.value ? item.category === targetCategory.value : !item.category)
  .filter(item => targetSubcategory.value ? item.subcategory === targetSubcategory.value : !item.subcategory)
  .filter(item => item.unit === props.item.unit)
  .filter(item => {
    const hierarchyName = item.subcategory || item.category || item.group
    return item.name !== hierarchyName || variations.value.some(variation => variation.itemId === item.id)
  })
  .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base', numeric: true }))
)
const targetItem = computed(() =>
  items.value.find(item => item.id === targetItemId.value) || null
)
const targetPath = computed(() =>
  [targetItem.value?.group, targetItem.value?.category, targetItem.value?.subcategory, targetItem.value?.name]
    .filter(Boolean)
    .join(' › ')
)
const orphanValues = computed(() => {
  if (!targetItem.value || targetItem.value.id === props.item.id) return []
  const attributes = new Set(targetItem.value.attributes || [])
  return Object.entries(props.variation.values || {}).filter(([key, value]) =>
    !attributes.has(key) && String(value || '').trim()
  )
})

const statusConfig = {
  zero: { label: 'Sem estoque', pillClass: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  critical: { label: 'Crítico', pillClass: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' },
  alert: { label: 'Alerta', pillClass: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500' },
  ok: { label: 'OK', pillClass: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
}

const hierarchy = computed(() =>
  [props.item.group, props.item.category, props.item.subcategory].filter(Boolean).join(' › ')
)
const variationPhotoSrc = computed(() => `/api/photo-batches/variation/${encodeURIComponent(props.variation.id)}/image?v=${photoRevision.value}`)

const variationTags = computed(() => variationAttributeRows(props.item, props.variation))

const sortedMovements = computed(() =>
  props.movements
    .filter(m => m.variationId === props.variation.id)
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
)

const recentSupplier = computed(() =>
  sortedMovements.value.find(m => m.type === 'entrada' && String(m.supplier || '').trim())?.supplier || '-'
)

const movementStats = computed(() => summarizeVariationMovements(sortedMovements.value))

const lastUnitCost = computed(() =>
  sortedMovements.value.find(m =>
    m.type === 'entrada' &&
    m.unitCost !== null &&
    m.unitCost !== undefined &&
    m.unitCost !== '' &&
    Number.isFinite(Number(m.unitCost))
  )?.unitCost ?? null
)

const lastWithdrawalBy = computed(() =>
  sortedMovements.value.find(m => m.type === 'saida' && String(m.requestedBy || '').trim())?.requestedBy || '-'
)

const linkedDestinations = computed(() =>
  (props.variation.destinations || [])
    .map(id => getDestFullName(id))
    .filter(Boolean)
)
const linkedLocations = computed(() => {
  if (props.variation.locations?.length) return props.variation.locations
  return [props.variation.location || props.item.location].filter(Boolean)
})

const relatedOrders = computed(() => props.workOrders.filter(order =>
  (order.items || []).some(row => row.variationId === props.variation.id)
))

function resetEditForm() {
  editForm.value = variationFormForEdit(props.item, props.variation)
  targetGroup.value = props.item.group
  targetCategory.value = props.item.category || ''
  targetSubcategory.value = props.item.subcategory || ''
  targetItemId.value = props.item.id
  initialStockOpen.value = false
  initialStockValue.value = Number(props.variation.initialStock ?? props.variation.stock ?? 0)
}

function changeTargetGroup() {
  targetCategory.value = ''
  targetSubcategory.value = ''
  targetItemId.value = ''
}

function changeTargetCategory() {
  targetSubcategory.value = ''
  targetItemId.value = ''
}

function changeTargetSubcategory() {
  targetItemId.value = ''
}

function changeTargetItem() {
  if (!targetItem.value) return
  editForm.value.values = Object.fromEntries(
    (targetItem.value.attributes || []).map(attribute => [
      attribute,
      props.variation.values?.[attribute] || '',
    ])
  )
}

watch(() => props.variation.id, () => {
  photoFailed.value = false
  photoExpanded.value = false
  photoRemoveConfirm.value = false
  photoRevision.value += 1
  activeTab.value = props.initialTab === 'info' || (props.initialTab === 'edit' && !props.canEditDetails)
    ? 'data'
    : props.initialTab
  resetEditForm()
}, { immediate: true })

watch(() => props.initialTab, tab => {
  activeTab.value = tab === 'info' || (tab === 'edit' && !props.canEditDetails) ? 'data' : tab
})

watch(photoExpanded, expanded => {
  if (!expanded) photoRemoveConfirm.value = false
})

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR')
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '-'
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatQuantity(value) {
  if (value === null || value === undefined) return '-'
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${props.item.unit}`
}

function movementResponsible(movement) {
  return movement.type === 'entrada'
    ? movement.supplier || '-'
    : movement.requestedBy || '-'
}

function movementPlace(movement) {
  return movement.destination || movement.location || '-'
}

function submitAdjust() {
  const delta = Math.round(Number(adjustValue.value))
  if (!Number.isFinite(delta) || delta === 0) return
  emit('adjust-stock', delta)
  adjustValue.value = ''
  adjustOpen.value = false
}

async function addVariationPhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || photoUploading.value || !props.canManage) return
  if (!file.type.startsWith('image/')) { error('Selecione uma imagem.'); return }

  photoUploading.value = true
  try {
    const blob = await compressImageFile(file, {
      maxBytes: Math.round(1.5 * 1024 * 1024),
      maxEdge: 1600,
      minEdge: 640,
      alwaysJpeg: true,
    })
    await putVariationPhotoImage(props.variation.id, blob)
    photoRevision.value += 1
    photoFailed.value = false
    success('Foto salva na variação.')
  } catch (cause) {
    error(cause.message || 'Não foi possível adicionar a foto.')
  } finally {
    photoUploading.value = false
  }
}

async function removeVariationPhoto() {
  if (photoRemoving.value || !props.canManage) return
  photoRemoving.value = true
  try {
    await deleteVariationPhotoImage(props.variation.id)
    photoRevision.value += 1
    photoFailed.value = true
    photoExpanded.value = false
    photoRemoveConfirm.value = false
    success('Foto removida da variação.')
  } catch (cause) {
    error(cause.message || 'Não foi possível remover a foto.')
  } finally {
    photoRemoving.value = false
  }
}

function startEdit() {
  if (!props.canEditDetails) return
  resetEditForm()
  activeTab.value = 'edit'
}

function addExtraRow() {
  editForm.value.extrasList.push({ key: '', value: '' })
}

function removeExtraRow(index) {
  editForm.value.extrasList.splice(index, 1)
}

function startInitialStockEdit() {
  initialStockValue.value = Number(props.variation.initialStock ?? props.variation.stock ?? 0)
  initialStockOpen.value = true
}

async function saveEdit() {
  if (editSaving.value) return
  if (!targetItem.value) { error('Escolha o modelo de destino.'); return }
  const validationError = validateVariationForm(targetItem.value, editForm.value)
  if (validationError) { error(validationError); return }
  const nextInitialStock = Number(initialStockValue.value)
  if (initialStockOpen.value && (!Number.isFinite(nextInitialStock) || nextInitialStock < 0)) {
    error('Estoque inicial deve ser um número válido.')
    return
  }

  editSaving.value = true
  try {
    const changes = {
      itemId: targetItem.value.id,
      values: { ...editForm.value.values },
      stock: props.variation.stock,
      minStock: editForm.value.minStock,
      extras: {
        ...Object.fromEntries(orphanValues.value),
        ...extrasListToObject(editForm.value.extrasList),
      },
      location: editForm.value.locations[0] || '',
      locations: [...editForm.value.locations],
      destinations: [...editForm.value.destinations],
    }
    if (initialStockOpen.value && canSetInitialStock.value) changes.initialStock = nextInitialStock
    const result = await editVariation(props.variation.id, changes)
    if (!result.ok) { error(result.error); return }
    if (targetItem.value.id !== props.item.id) {
      success(`Variação movida para "${targetItem.value.name}".`)
      emit('close')
    } else {
      success('Variação atualizada.')
      activeTab.value = 'data'
    }
  } catch (e) {
    error(e.message)
  } finally {
    editSaving.value = false
  }
}
</script>

<template>
  <dialog
    ref="dialogRef"
    class="fixed inset-0 z-50 m-0 h-screen w-screen max-w-none bg-transparent p-0 backdrop:bg-[var(--ds-overlay)]"
    aria-modal="true"
    aria-label="Ficha operacional da variação"
    @cancel.prevent="emit('close')"
  >
    <div class="flex min-h-full items-center justify-center p-4" @click.self="emit('close')">
    <section class="flex w-full max-w-5xl max-h-[88vh] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
      <header class="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
        <div class="flex min-w-0 flex-1 items-start gap-3">
          <div class="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 ring-1 ring-inset ring-black/10 dark:bg-gray-800 dark:ring-white/10 sm:h-24 sm:w-24">
            <button
              v-if="!photoFailed"
              type="button"
              class="h-full w-full cursor-zoom-in rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
              :aria-label="`Ampliar foto de ${item.name}`"
              title="Ampliar foto"
              @click="photoExpanded = true"
            >
              <img
                :src="variationPhotoSrc"
                :alt="`Foto mais recente de ${item.name}`"
                class="h-full w-full object-contain"
                @error="photoFailed = true"
              />
            </button>
            <button
              v-else-if="canManage"
              type="button"
              class="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg text-gray-500 outline-none transition-colors hover:bg-gray-200 hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-wait disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-primary-300"
              :disabled="photoUploading"
              aria-label="Adicionar foto à variação"
              @click="photoInput?.click()"
            >
              <svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v11.25a1.5 1.5 0 0 0 1.5 1.5Z" /></svg>
              <span class="text-[10px] font-semibold">{{ photoUploading ? 'Enviando...' : 'Adicionar foto' }}</span>
            </button>
            <div v-else class="flex flex-col items-center gap-1 text-gray-400 dark:text-gray-500">
              <svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v11.25a1.5 1.5 0 0 0 1.5 1.5Z" /></svg>
              <span class="text-[10px] font-medium">Sem foto</span>
            </div>
          </div>
          <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp,image/*" class="hidden" @change="addVariationPhoto" />
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Ficha da variação</p>
            <h2 class="mt-1 truncate text-xl font-semibold text-gray-900 dark:text-gray-100">{{ item.name }}</h2>
            <div class="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <p class="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">{{ hierarchy }}</p>
              <button
                v-if="showCatalogLink"
                type="button"
                class="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                title="Abrir esta variação no catálogo"
                @click="emit('go-to-catalog')"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75A2.25 2.25 0 0 1 6 4.5h4.086c.597 0 1.17.237 1.591.659l1.164 1.182a2.25 2.25 0 0 0 1.606.659H18A2.25 2.25 0 0 1 20.25 9.25v8A2.25 2.25 0 0 1 18 19.5H6a2.25 2.25 0 0 1-2.25-2.25v-10.5Z" />
                </svg>
                Ver no catálogo
              </button>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <span
                v-for="tag in variationTags"
                :key="`${tag.key}:${tag.value}`"
                class="ds-attribute-tag inline-flex items-center gap-0.5 rounded border px-2 py-0.5 text-[11px]"
              >
                <span class="font-medium">{{ tag.key }}:</span>
                <span>{{ tag.value }}</span>
              </span>
              <span v-if="!variationTags.length" class="text-xs text-gray-400 dark:text-gray-500">Sem atributos específicos.</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          class="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          title="Fechar"
          @click="emit('close')"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-auto">
        <section class="grid grid-cols-2 gap-3 border-b border-gray-200 p-4 dark:border-gray-700 lg:grid-cols-6">
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400">Estoque atual</p>
            <p class="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{{ variation.stock }} {{ item.unit }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400">Mínimo</p>
            <p class="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ variation.minStock ?? 'Não definido' }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400">Status</p>
            <span class="mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusConfig[status].pillClass">{{ statusConfig[status].label }}</span>
          </div>
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400">Último fornecedor</p>
            <p class="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{{ recentSupplier }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400">Último custo</p>
            <p class="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{{ formatCurrency(lastUnitCost) }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400">OS vinculadas</p>
            <p class="mt-1 truncate text-xl font-semibold text-gray-900 dark:text-gray-100">{{ relatedOrders.length }}</p>
          </div>
        </section>

        <section v-if="canManage" class="flex flex-wrap items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-700">
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--ds-success-solid)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--ds-success-hover)]"
            @click="emit('quick-movement', 'entrada')"
          >
            Entrada
          </button>
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--ds-danger-solid)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--ds-danger-hover)]"
            @click="emit('quick-movement', 'saida')"
          >
            Saída
          </button>
          <button
            v-if="canAdjust && !adjustOpen"
            type="button"
            class="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600"
            @click="adjustOpen = true"
          >
            Ajustar
          </button>
          <div
            v-if="canAdjust"
            class="ds-collapse"
            :class="{ 'ds-collapse-open': adjustOpen }"
          >
            <div class="flex items-center gap-2">
              <input
                v-model="adjustValue"
                type="number"
                step="1"
                placeholder="+/-"
                class="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                @keydown.enter.prevent="submitAdjust"
                @keydown.escape.prevent="adjustOpen = false"
              />
              <button type="button" class="rounded-lg bg-[var(--ds-success-solid)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--ds-success-hover)]" @click="submitAdjust">Salvar</button>
              <button type="button" class="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700" @click="adjustOpen = false">Cancelar</button>
            </div>
          </div>
        </section>

        <nav class="flex items-center gap-1 overflow-x-auto border-b border-gray-200 px-4 pt-3 dark:border-gray-700">
          <button
            type="button"
            class="shrink-0 rounded-t-lg px-3 py-2 text-sm font-semibold transition-colors"
            :class="activeTab === 'data'
              ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'"
            :aria-pressed="activeTab === 'data'"
            @click="activeTab = 'data'"
          >
            Dados
          </button>
          <button
            v-if="canEditDetails"
            type="button"
            class="shrink-0 rounded-t-lg px-3 py-2 text-sm font-semibold transition-colors"
            :class="activeTab === 'edit'
              ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'"
            :aria-pressed="activeTab === 'edit'"
            @click="startEdit"
          >
            Editar
          </button>
          <button
            type="button"
            class="shrink-0 rounded-t-lg px-3 py-2 text-sm font-semibold transition-colors"
            :class="activeTab === 'movements'
              ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'"
            :aria-pressed="activeTab === 'movements'"
            @click="activeTab = 'movements'"
          >
            Movimentos
          </button>
        </nav>

        <section v-if="activeTab === 'data'" class="space-y-4 p-4">
          <div>
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Dados de movimentação</h3>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Médias calculadas pelo histórico, sem considerar ajustes de estoque.</p>
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <p class="text-xs text-gray-500 dark:text-gray-400">Pedido médio</p>
              <p class="mt-2 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ formatQuantity(movementStats.averageEntryQty) }}</p>
              <p class="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Por entrada registrada</p>
            </div>
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <p class="text-xs text-gray-500 dark:text-gray-400">Saída média</p>
              <p class="mt-2 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ formatQuantity(movementStats.averageExitQty) }}</p>
              <p class="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Por saída registrada</p>
            </div>
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <p class="text-xs text-gray-500 dark:text-gray-400">Custo médio</p>
              <p class="mt-2 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ formatCurrency(movementStats.averageUnitCost) }}</p>
              <p class="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Entre entradas com custo</p>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <p class="text-xs text-gray-500 dark:text-gray-400">Menor preço encontrado</p>
              <p class="mt-2 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ formatCurrency(movementStats.lowestPrice?.unitCost) }}</p>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ movementStats.lowestPrice ? (movementStats.lowestPrice.supplier || 'Fornecedor não informado') : 'Sem custo registrado' }}</p>
            </div>
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <p class="text-xs text-gray-500 dark:text-gray-400">Maior preço encontrado</p>
              <p class="mt-2 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ formatCurrency(movementStats.highestPrice?.unitCost) }}</p>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ movementStats.highestPrice ? (movementStats.highestPrice.supplier || 'Fornecedor não informado') : 'Sem custo registrado' }}</p>
            </div>
          </div>

          <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Fornecedores</h3>
              <span class="text-xs tabular-nums text-gray-400 dark:text-gray-500">{{ movementStats.suppliers.length }}</span>
            </div>
            <div v-if="movementStats.suppliers.length" class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="supplier in movementStats.suppliers"
                :key="supplier"
                class="ds-attribute-tag rounded border px-2 py-1 text-xs font-medium"
              >
                {{ supplier }}
              </span>
            </div>
            <p v-else class="mt-3 text-sm text-gray-500 dark:text-gray-400">Nenhum fornecedor registrado para esta variação.</p>
          </div>

          <div class="grid grid-cols-1 gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 md:grid-cols-3">
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Destinos vinculados</h3>
              <div v-if="linkedDestinations.length" class="mt-3 flex flex-wrap gap-1.5">
                <span v-for="dest in linkedDestinations" :key="dest" class="rounded bg-primary-50 px-2 py-1 text-xs text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">{{ dest }}</span>
              </div>
              <p v-else class="mt-3 text-sm text-gray-500 dark:text-gray-400">Nenhum destino vinculado.</p>
            </div>
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Resumo</h3>
              <dl class="mt-3 space-y-2 text-sm">
                <div class="flex justify-between gap-3">
                  <dt class="shrink-0 text-gray-500 dark:text-gray-400">Locais</dt>
                  <dd v-if="linkedLocations.length" class="flex flex-wrap justify-end gap-1">
                    <span v-for="location in linkedLocations" :key="location" class="ds-attribute-tag rounded border px-2 py-0.5 text-xs font-semibold">{{ location }}</span>
                  </dd>
                  <dd v-else class="font-medium text-gray-900 dark:text-gray-100">-</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-gray-500 dark:text-gray-400">Último a retirar</dt>
                  <dd class="font-medium text-gray-900 dark:text-gray-100">{{ lastWithdrawalBy }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-gray-500 dark:text-gray-400">Última</dt>
                  <dd class="font-medium text-gray-900 dark:text-gray-100">{{ sortedMovements[0] ? formatDate(sortedMovements[0].date) : '-' }}</dd>
                </div>
              </dl>
            </div>
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Ordens relacionadas</h3>
              <div v-if="relatedOrders.length" class="mt-2 space-y-1">
                <button
                  v-for="order in relatedOrders.slice(0, 5)"
                  :key="order.id"
                  type="button"
                  class="min-h-11 w-full rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
                  @click="emit('open-work-order', order)"
                >
                  <span class="block font-semibold text-gray-900 dark:text-gray-100">OS #{{ order.number }}</span>
                  <span class="mt-0.5 block truncate text-gray-500 dark:text-gray-400">{{ order.title || order.destinationName || 'Manutenção' }}</span>
                </button>
              </div>
              <p v-else class="mt-2 text-xs text-gray-500 dark:text-gray-400">Nenhuma OS usou esta variação.</p>
            </div>
          </div>
        </section>

        <section v-else-if="activeTab === 'edit'" class="space-y-5 p-4">
          <div>
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Editar variação</h3>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">O saldo é alterado por Ajustar para manter o histórico de estoque.</p>
          </div>

          <section class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Modelo do item</h4>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Mova a variação sem alterar saldo, foto ou histórico.</p>
              </div>
              <span class="ds-attribute-tag rounded border px-2 py-1 text-[11px] font-semibold">{{ item.unit }}</span>
            </div>

            <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label class="block">
                <span class="mb-1 block text-xs text-gray-500 dark:text-gray-400">Grupo</span>
                <select
                  v-model="targetGroup"
                  class="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  @change="changeTargetGroup"
                >
                  <option v-for="group in targetGroups" :key="group" :value="group">{{ group }}</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 block text-xs text-gray-500 dark:text-gray-400">Subgrupo</span>
                <select
                  v-model="targetCategory"
                  class="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  @change="changeTargetCategory"
                >
                  <option value="">Sem subgrupo</option>
                  <option v-for="category in targetCategories" :key="category" :value="category">{{ category }}</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 block text-xs text-gray-500 dark:text-gray-400">Subnível opcional</span>
                <select
                  v-model="targetSubcategory"
                  :disabled="!targetCategory"
                  class="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  @change="changeTargetSubcategory"
                >
                  <option value="">Sem subnível</option>
                  <option v-for="subcategory in targetSubcategories" :key="subcategory" :value="subcategory">{{ subcategory }}</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 block text-xs text-gray-500 dark:text-gray-400">Modelo</span>
                <select
                  v-model="targetItemId"
                  :disabled="!targetGroup"
                  class="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  @change="changeTargetItem"
                >
                  <option value="">Selecione o modelo</option>
                  <option v-for="model in targetItems" :key="model.id" :value="model.id">{{ model.name }}</option>
                </select>
              </label>
            </div>

            <div v-if="targetItem" class="mt-3 rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Destino</p>
              <p class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ targetPath }}</p>
            </div>
            <p v-if="orphanValues.length" class="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {{ orphanValues.length }} atributo(s) sem correspondência serão preservados como campos extras.
            </p>
          </section>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Destinos vinculados</h4>
              <DestinationTreePicker
                v-model="editForm.destinations"
                multiple
                :linked-ids="editForm.destinations"
                placeholder="Adicionar destino..."
              />
            </div>
            <div>
              <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Locais</h4>
              <DestinationTreePicker
                v-model="editForm.locations"
                multiple
                source="locations"
                placeholder="Adicionar local..."
              />
            </div>
          </div>

          <div v-if="targetItem?.attributes?.length">
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Atributos</h4>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label v-for="attribute in orderedAttributeNames(targetItem)" :key="attribute" class="block">
                <span class="mb-1 block text-xs text-gray-500 dark:text-gray-400">{{ attribute }}</span>
                <input
                  v-model="editForm.values[attribute]"
                  type="text"
                  :placeholder="attribute"
                  class="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Estoque mínimo</span>
              <input
                v-model.number="editForm.minStock"
                type="number"
                min="0"
                step="1"
                placeholder="Não definido"
                class="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
            <div v-if="canSetInitialStock" class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Estoque inicial</p>
                  <p class="mt-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    Atual: {{ Number(variation.initialStock || 0).toLocaleString('pt-BR') }} {{ item.unit }}
                  </p>
                </div>
                <button
                  v-if="!initialStockOpen"
                  type="button"
                  class="min-h-9 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  @click="startInitialStockEdit"
                >
                  Definir
                </button>
              </div>
              <div class="ds-collapse" :class="{ 'ds-collapse-open': initialStockOpen }">
                <div class="mt-3 flex flex-wrap items-end gap-2">
                  <label class="min-w-36 flex-1">
                    <span class="mb-1 block text-xs text-gray-500 dark:text-gray-400">Novo estoque inicial</span>
                    <input
                      v-model.number="initialStockValue"
                      type="number"
                      min="0"
                      step="1"
                      class="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </label>
                  <button
                    type="button"
                    class="min-h-10 rounded-lg px-3 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    @click="initialStockOpen = false"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between gap-3">
              <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Campos extras</h4>
              <button
                type="button"
                class="min-h-9 rounded-lg px-3 text-xs font-semibold text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
                @click="addExtraRow"
              >
                Adicionar campo
              </button>
            </div>
            <div v-if="editForm.extrasList.length" class="space-y-2">
              <div v-for="(row, index) in editForm.extrasList" :key="index" class="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
                <input
                  v-model="row.key"
                  type="text"
                  placeholder="Campo"
                  class="min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                <input
                  v-model="row.value"
                  type="text"
                  placeholder="Valor"
                  class="min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                <button
                  type="button"
                  class="min-h-10 rounded-lg px-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  @click="removeExtraRow(index)"
                >
                  Remover
                </button>
              </div>
            </div>
            <p v-else class="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">Nenhum campo extra.</p>
          </div>

        </section>

        <section v-else class="p-3">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Movimentos</h3>
          <div>
            <div v-if="!sortedMovements.length" class="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Nenhuma movimentação registrada para esta variação.
            </div>
            <div v-else class="overflow-hidden rounded-lg border border-gray-200 bg-gray-50/70 dark:border-gray-700 dark:bg-gray-800/40">
              <article
                v-for="movement in sortedMovements.slice(0, 8)"
                :key="movement.id"
                class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border-b border-gray-200 px-3 py-2 last:border-b-0 dark:border-gray-700 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <span
                  class="inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  :class="movement.type === 'entrada'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'"
                >
                  {{ movement.type === 'entrada' ? 'Entrada' : 'Saída' }}
                </span>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ movement.qty }} {{ item.unit }}</p>
                    <p v-if="movement.type === 'entrada' && movement.unitCost != null" class="text-xs font-medium tabular-nums text-gray-700 dark:text-gray-300">
                      {{ formatCurrency(movement.unitCost) }}
                    </p>
                    <p class="truncate text-xs text-gray-500 dark:text-gray-400">{{ movementResponsible(movement) }} / {{ movementPlace(movement) }}</p>
                  </div>
                  <p v-if="movement.note" class="truncate text-xs text-gray-600 dark:text-gray-300">{{ movement.note }}</p>
                </div>
                <div class="col-span-2 flex items-center justify-between gap-3 text-xs tabular-nums text-gray-500 dark:text-gray-400 sm:col-span-1 sm:block sm:text-right">
                  <p>{{ formatDate(movement.date) }}</p>
                  <p>Estoque: {{ movement.stockBefore }} → {{ movement.stockAfter }}</p>
                </div>
              </article>
            </div>
          </div>
        </section>
      </div>
      <footer v-if="activeTab === 'edit' && canEditDetails" class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <button
          type="button"
          class="min-h-10 rounded-lg bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          :disabled="editSaving"
          @click="activeTab = 'data'"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="min-h-10 rounded-lg bg-primary-700 px-4 text-sm font-semibold hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-primary-600 dark:hover:bg-primary-500"
          style="color: var(--ds-primary-text)"
          :disabled="editSaving"
          @click="saveEdit"
        >
          {{ editSaving ? 'Salvando...' : 'Salvar alterações' }}
        </button>
      </footer>
    </section>
    </div>
  </dialog>

  <AppDialog :visible="photoExpanded" :aria-label="`Foto ampliada de ${item.name}`" @close="photoExpanded = false">
    <section class="flex max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
      <header class="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Foto do modelo</p>
          <h3 class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{{ item.name }}</h3>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <template v-if="canManage">
            <button type="button" class="min-h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800" :disabled="photoUploading || photoRemoving" @click="photoEditInput?.click()">
              {{ photoUploading ? 'Enviando...' : 'Trocar foto' }}
            </button>
            <button type="button" class="min-h-10 rounded-lg px-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-wait disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30" :disabled="photoUploading || photoRemoving" @click="photoRemoveConfirm = true">
              Remover foto
            </button>
          </template>
          <button type="button" class="min-h-10 rounded-lg px-3 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" @click="photoExpanded = false">Fechar</button>
        </div>
      </header>
      <div v-if="photoRemoveConfirm" class="border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <ConfirmInline message="Remover esta foto da variação?" confirm-label="Remover" cancel-label="Cancelar" @confirm="removeVariationPhoto" @cancel="photoRemoveConfirm = false" />
      </div>
      <div class="flex min-h-0 flex-1 items-center justify-center bg-gray-50 p-2 dark:bg-gray-950">
        <img :src="variationPhotoSrc" :alt="`Foto ampliada de ${item.name}`" class="max-h-[calc(100dvh-7rem)] max-w-full object-contain" @error="photoFailed = true; photoExpanded = false" />
      </div>
      <input ref="photoEditInput" type="file" accept="image/jpeg,image/png,image/webp,image/*" class="hidden" @change="addVariationPhoto" />
    </section>
  </AppDialog>
</template>
