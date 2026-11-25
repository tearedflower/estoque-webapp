<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuth } from '../../composables/useAuth.js'
import { useItems } from '../../composables/useItems.js'
import { useMovements } from '../../composables/useMovements.js'
import { useSuppliers } from '../../composables/useSuppliers.js'
import { useToast } from '../../composables/useToast.js'
import { suggestCatalogFromImage } from '../../services/api.js'
import {
  cleanupExpiredPhotoBatches,
  deleteBatchPhoto,
  deletePhotoBatch,
  isPhotoStorageQuotaError,
  listBatchPhotos,
  listPhotoBatches,
  newPhotoId,
  photoSyncState,
  requestPersistentPhotoStorage,
  resetInterruptedPhotoAnalyses,
  saveBatchPhoto,
  savePhotoBatch,
} from '../../services/photoMovementDrafts.js'
import { compressImageFile, fileAsDataUrl } from '../../utils/imageFile.js'
import { units } from '../../utils/units.js'
import {
  buildPhotoMovementLine,
  canDeletePhotoBatch,
  canEditPhotoBatch,
  effectivePhotoFields,
  findExactPhotoMatch,
  displayPhotoUnitCost,
  maskPhotoUnitCost,
  photoBatchBlockReason,
  photoCatalogBlockReason,
  photoCatalogDraft,
  photoSuggestionSearch,
  searchPhotoVariations,
  variationDescription,
} from '../../utils/photoMovement.js'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import ConfirmInline from '../ui/ConfirmInline.vue'
import DestinationTreePicker from '../ui/DestinationTreePicker.vue'
import EntryDocumentField from '../ui/EntryDocumentField.vue'
import PersonPicker from '../ui/PersonPicker.vue'
import SupplierPicker from '../ui/SupplierPicker.vue'

const PHOTO_MAX_BYTES = Math.round(1.5 * 1024 * 1024)
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

const { user, isAdmin } = useAuth()
const {
  items,
  variations,
  uniqueGroups,
  getCategoriesForGroup,
  getSubcategoriesForCategory,
  getVariationsForItem,
  findDuplicateItem,
  loadData: loadItemData,
} = useItems()
const { addMovementBatch } = useMovements()
const { ensureSupplier } = useSuppliers()
const { success, error } = useToast()

const loading = ref(true)
const storageError = ref('')
const batches = ref([])
const photos = ref([])
const selectedBatchId = ref('')
const selectedPhotoId = ref('')
const manualSearch = ref('')
const showManualSearch = ref(false)
const processing = ref(false)
const saving = ref(false)
const deleteBatchId = ref('')
const deletePhotoId = ref('')
const editingBatchId = ref('')
const batchPickerOpen = ref(false)
const expandedPhoto = ref(null)
const objectUrls = new Map()
const removedBatchIds = new Set()
const removedPhotoIds = new Set()
let photosLoadRun = 0

const currentBatch = computed(() => batches.value.find(batch => batch.id === selectedBatchId.value) || null)
const canEditCurrentBatch = computed(() => canEditPhotoBatch(currentBatch.value, user.value?.id, isAdmin.value, editingBatchId.value))
const canDeleteCurrentBatch = computed(() => canDeletePhotoBatch(currentBatch.value, user.value?.id, isAdmin.value))
const needsAdminEditToggle = computed(() => Boolean(
  isAdmin.value &&
  currentBatch.value?.status === 'pending' &&
  currentBatch.value.ownerUserId !== user.value?.id
))
const selectedPhoto = computed(() => photos.value.find(photo => photo.id === selectedPhotoId.value) || null)
const pendingBatches = computed(() => batches.value.filter(batch => batch.status === 'pending'))
const completedBatches = computed(() => batches.value.filter(batch => batch.status === 'completed'))
const currentItem = computed(() => items.value.find(item => item.id === selectedPhoto.value?.itemId) || null)
const currentVariation = computed(() => variations.value.find(variation => variation.id === selectedPhoto.value?.variationId) || null)
const currentItemVariations = computed(() => currentItem.value ? getVariationsForItem(currentItem.value.id) : [])
const manualResults = computed(() => searchPhotoVariations(manualSearch.value, items.value, variations.value))
const catalogCategories = computed(() => getCategoriesForGroup(selectedPhoto.value?.catalog?.group || ''))
const catalogSubcategories = computed(() => getSubcategoriesForCategory(
  selectedPhoto.value?.catalog?.group || '',
  selectedPhoto.value?.catalog?.category || '',
))
const blockReason = computed(() => {
  if (currentBatch.value?.status !== 'pending') return ''
  if (!isAdmin.value && photos.value.some(photo => photo.createCatalog)) return 'Um administrador precisa revisar e confirmar os novos cadastros deste lote.'
  return photoBatchBlockReason(currentBatch.value, photos.value, items.value, variations.value)
})
const queueCount = computed(() => photos.value.filter(photo => ['queued', 'analyzing'].includes(photo.status)).length)
const syncPendingCount = computed(() =>
  batches.value.filter(batch => batch.syncPending).length + photos.value.filter(photo => photo.syncPending).length
)
const syncMessage = computed(() => syncPendingCount.value
  ? `${syncPendingCount.value} alteração(ões) salva(s) neste aparelho aguardando conexão para sincronizar.`
  : photoSyncState.warning)

const statusMeta = {
  queued: { label: 'Aguardando análise', class: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300' },
  analyzing: { label: 'Analisando', class: 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-300' },
  matched: { label: 'Correspondência encontrada', class: 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300' },
  review: { label: 'Revisão necessária', class: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300' },
  error: { label: 'Erro na análise', class: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300' },
}

function statusFor(photo) {
  if (photo?.createCatalog && photo.status === 'matched') return { ...statusMeta.matched, label: 'Cadastro revisado' }
  return statusMeta[photo?.status] || statusMeta.review
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function itemPath(item) {
  return [item?.group, item?.category, item?.subcategory, item?.name].filter(Boolean).join(' > ')
}

function photoUrl(photo) {
  if (!photo?.blob) return ''
  if (!objectUrls.has(photo.id)) objectUrls.set(photo.id, URL.createObjectURL(photo.blob))
  return objectUrls.get(photo.id)
}

function expandPhoto(photo) {
  selectedPhotoId.value = photo.id
  expandedPhoto.value = photo
}

function clearObjectUrls() {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
}

async function refreshBatches(preferredId = selectedBatchId.value) {
  batches.value = await listPhotoBatches(user.value.id, isAdmin.value)
  selectedBatchId.value = batches.value.some(batch => batch.id === preferredId) ? preferredId : ''
}

async function refreshPhotos() {
  const run = ++photosLoadRun
  const batchId = currentBatch.value?.id || ''
  const rows = batchId ? await listBatchPhotos(batchId) : []
  if (run !== photosLoadRun || batchId !== (currentBatch.value?.id || '')) return
  clearObjectUrls()
  photos.value = rows
  if (!photos.value.some(photo => photo.id === selectedPhotoId.value)) {
    selectedPhotoId.value = photos.value[0]?.id || ''
  }
}

async function initialize() {
  loading.value = true
  storageError.value = ''
  try {
    await requestPersistentPhotoStorage().catch(() => false)
    await cleanupExpiredPhotoBatches(user.value.id)
    await resetInterruptedPhotoAnalyses(user.value.id)
    await refreshBatches()
    await refreshPhotos()
    processQueue()
  } catch (cause) {
    storageError.value = cause.message || 'Não foi possível abrir os lotes salvos para esta conta.'
  } finally {
    loading.value = false
  }
}

watch(selectedBatchId, async () => {
  editingBatchId.value = ''
  deleteBatchId.value = ''
  deletePhotoId.value = ''
  await refreshPhotos()
  processQueue()
})

watch(selectedPhoto, photo => {
  manualSearch.value = photo?.manualSearch || photoSuggestionSearch(photo?.suggestion)
  showManualSearch.value = Boolean(canEditCurrentBatch.value && photo && (photo.status === 'error' || (photo.status === 'review' && !photo.itemId)))
})

onMounted(initialize)
onBeforeUnmount(clearObjectUrls)

async function createBatch(type) {
  const now = new Date().toISOString()
  const batch = {
    id: newPhotoId('photo_batch'),
    ownerUserId: user.value.id,
    operatorName: user.value.name,
    type,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    completedAt: '',
    expiresAt: '',
    defaults: type === 'entrada'
      ? { supplier: '', docType: 'sem', docRef: '', note: '' }
      : { requestedBy: '', requestedByPersonId: '', destination: '', destinationId: '', destinationOther: false, note: '' },
  }
  try {
    await savePhotoBatch(batch)
    await refreshBatches(batch.id)
    await refreshPhotos()
  } catch (cause) {
    handleStorageError(cause)
  }
}

function selectBatch(batchId) {
  selectedBatchId.value = batchId
  batchPickerOpen.value = false
}

async function saveCurrentBatch() {
  if (!currentBatch.value) return
  try {
    await savePhotoBatch(currentBatch.value)
  } catch (cause) {
    handleStorageError(cause)
  }
}

async function savePhoto(photo) {
  try {
    await saveBatchPhoto(photo)
  } catch (cause) {
    handleStorageError(cause)
  }
}

function handleStorageError(cause) {
  const message = isPhotoStorageQuotaError(cause)
    ? 'O navegador ficou sem espaço para guardar as fotos. Exclua lotes concluídos ou libere armazenamento do aparelho.'
    : (cause.message || 'Não foi possível salvar a alteração neste navegador.')
  storageError.value = message
  error(message)
}

async function onFilesSelected(event) {
  const files = [...(event.target.files || [])]
  event.target.value = ''
  if (!files.length || currentBatch.value?.status !== 'pending') return

  let firstId = ''
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      error(`O arquivo "${file.name}" não é uma imagem.`)
      continue
    }
    try {
      const blob = await compressImageFile(file, {
        maxBytes: PHOTO_MAX_BYTES,
        maxEdge: 1600,
        minEdge: 640,
        alwaysJpeg: true,
      })
      const now = new Date().toISOString()
      const photo = {
        id: newPhotoId('photo'),
        batchId: currentBatch.value.id,
        blob,
        fileName: file.name,
        createdAt: now,
        updatedAt: now,
        status: 'queued',
        error: '',
        suggestion: null,
        itemId: '',
        variationId: '',
        createCatalog: false,
        catalog: {},
        qty: 1,
        unitCost: '',
        useOverrides: false,
        overrides: {},
        manualSearch: '',
        movementId: '',
      }
      if (removedBatchIds.has(photo.batchId) || removedPhotoIds.has(photo.id)) continue
      await saveBatchPhoto(photo)
      photos.value.push(photo)
      firstId ||= photo.id
    } catch (cause) {
      if (isPhotoStorageQuotaError(cause)) {
        handleStorageError(cause)
        break
      }
      error(cause.message || `Não foi possível preparar a foto "${file.name}".`)
    }
  }
  if (firstId) selectedPhotoId.value = firstId
  processQueue()
}

async function processQueue() {
  if (processing.value || !canEditCurrentBatch.value) return
  processing.value = true
  try {
    while (true) {
      const photo = photos.value.find(row => row.status === 'queued')
      if (!photo) break
      photo.status = 'analyzing'
      photo.error = ''
      await saveBatchPhoto(photo)
      try {
        const image = await fileAsDataUrl(photo.blob)
        const suggestion = await suggestCatalogFromImage({ image })
        const match = findExactPhotoMatch(suggestion, items.value, variations.value)
        photo.suggestion = suggestion
        photo.itemId = match.item?.id || ''
        photo.variationId = match.variation?.id || ''
        photo.createCatalog = false
        photo.catalog = {}
        photo.manualSearch = photoSuggestionSearch(suggestion)
        photo.status = match.item && match.variation ? 'matched' : 'review'
        photo.error = suggestion.identified ? '' : 'A IA não identificou o produto com segurança. Use a busca manual.'
        if (selectedPhotoId.value === photo.id) {
          manualSearch.value = photo.manualSearch
          showManualSearch.value = !match.item
        }
      } catch (cause) {
        photo.status = 'error'
        photo.error = `${cause.message || 'Não foi possível analisar a foto.'} Você ainda pode selecionar o material manualmente.`
      }
      if (removedBatchIds.has(photo.batchId) || removedPhotoIds.has(photo.id)) continue
      await saveBatchPhoto(photo)
    }
  } catch (cause) {
    handleStorageError(cause)
  } finally {
    processing.value = false
  }
}

function toggleBatchEditing() {
  if (!currentBatch.value) return
  editingBatchId.value = editingBatchId.value === currentBatch.value.id ? '' : currentBatch.value.id
  deletePhotoId.value = ''
  showManualSearch.value = false
  if (canEditCurrentBatch.value) processQueue()
}

async function retryAnalysis(photo) {
  photo.status = 'queued'
  photo.error = ''
  photo.createCatalog = false
  photo.catalog = {}
  await savePhoto(photo)
  processQueue()
}

async function chooseManual(result) {
  const photo = selectedPhoto.value
  if (!photo) return
  photo.itemId = result.item.id
  photo.variationId = result.variation.id
  photo.createCatalog = false
  photo.catalog = {}
  photo.status = 'matched'
  photo.error = ''
  photo.manualSearch = manualSearch.value
  showManualSearch.value = false
  await savePhoto(photo)
}

async function chooseVariation(variation) {
  const photo = selectedPhoto.value
  if (!photo) return
  photo.variationId = variation.id
  photo.status = 'matched'
  photo.error = ''
  await savePhoto(photo)
}

async function startCatalog(photo) {
  const draft = photo.catalog?.name ? photo.catalog : photoCatalogDraft(photo.suggestion)
  const duplicate = findDuplicateItem(draft)
  if (duplicate) {
    photo.createCatalog = false
    photo.catalog = draft
    photo.itemId = duplicate.id
    photo.variationId = ''
    photo.status = 'review'
    photo.error = `Este item já existe no catálogo: "${duplicate.name}". Escolha a variação.`
    showManualSearch.value = false
    await savePhoto(photo)
    return
  }
  photo.createCatalog = true
  photo.catalog = draft
  photo.itemId = ''
  photo.variationId = ''
  photo.status = 'review'
  photo.error = ''
  showManualSearch.value = false
  await savePhoto(photo)
}

async function cancelCatalog(photo) {
  photo.createCatalog = false
  showManualSearch.value = true
  await savePhoto(photo)
}

async function addCatalogAttribute(photo) {
  photo.catalog.attributes ||= []
  photo.catalog.attributes.push({ name: '', value: '' })
  photo.status = 'review'
  await savePhoto(photo)
}

async function removeCatalogAttribute(photo, index) {
  photo.catalog.attributes.splice(index, 1)
  photo.status = 'review'
  await savePhoto(photo)
}

async function saveCatalogDraft(photo) {
  photo.status = 'review'
  await savePhoto(photo)
}

async function confirmCatalogReview(photo) {
  const reason = photoCatalogBlockReason(photo.catalog)
  if (reason) return error(reason)
  photo.status = 'matched'
  await savePhoto(photo)
}

function updateUnitCost(photo, event) {
  photo.unitCost = maskPhotoUnitCost(event.target.value)
  event.target.value = photo.unitCost
}

async function toggleOverrides(photo) {
  photo.useOverrides = !photo.useOverrides
  photo.overrides = photo.useOverrides ? { ...effectivePhotoFields(currentBatch.value, photo) } : {}
  await savePhoto(photo)
}

function updatePerson(target, name) {
  target.requestedBy = name
  target.requestedByPersonId = ''
}

function selectPerson(target, person) {
  target.requestedBy = person.name
  target.requestedByPersonId = person.id
}

function selectDestination(target, payload) {
  target.destinationId = payload.destination.id
  target.destination = payload.fullName
  target.destinationOther = false
}

function chooseOtherDestination(target) {
  target.destinationId = ''
  target.destination = ''
  target.destinationOther = true
}

function impactText(photo) {
  const variation = variations.value.find(row => row.id === photo.variationId)
  const qty = Number(photo.qty)
  const before = photo.createCatalog ? Number(photo.catalog?.initialStock ?? 0) : Number(variation?.stock)
  if (!Number.isFinite(before) || !Number.isFinite(qty) || qty <= 0) return 'Saldo aguardando revisão'
  const entry = currentBatch.value.type === 'entrada'
  const after = entry ? before + qty : before - qty
  return `${before} ${entry ? '+' : '−'} ${qty} = ${after}`
}

async function removePhoto(photoId) {
  removedPhotoIds.add(photoId)
  try {
    await deleteBatchPhoto(photoId)
    deletePhotoId.value = ''
    await refreshPhotos()
  } catch (cause) {
    removedPhotoIds.delete(photoId)
    handleStorageError(cause)
  }
}

async function removeBatch(batchId) {
  removedBatchIds.add(batchId)
  try {
    await deletePhotoBatch(batchId)
    deleteBatchId.value = ''
    editingBatchId.value = ''
    await refreshBatches()
    await refreshPhotos()
  } catch (cause) {
    removedBatchIds.delete(batchId)
    handleStorageError(cause)
  }
}

async function confirmBatch() {
  if (!canEditCurrentBatch.value || blockReason.value) return
  saving.value = true
  try {
    const lines = photos.value.map(photo => {
      const item = items.value.find(row => row.id === photo.itemId)
      const variation = variations.value.find(row => row.id === photo.variationId)
      return buildPhotoMovementLine(currentBatch.value, photo, item, variation)
    })
    if (currentBatch.value.type === 'entrada') {
      const names = [...new Set(lines.map(line => String(line.supplier || '').trim()).filter(Boolean))]
      for (const name of names) await ensureSupplier(name)
    }
    const created = await addMovementBatch(currentBatch.value.type, lines, currentBatch.value.defaults, currentBatch.value.id)
    const createdCatalog = photos.value.some(photo => photo.createCatalog)
    for (let index = 0; index < photos.value.length; index += 1) {
      const movement = created[index]
      const photo = photos.value[index]
      if (movement) {
        photo.itemId = movement.itemId
        photo.variationId = movement.variationId
        photo.createCatalog = false
        photo.status = 'matched'
        photo.error = ''
        photo.movementId = movement.id
        await saveBatchPhoto(photo)
      }
    }
    if (createdCatalog) await loadItemData()
    else {
      for (const movement of created) {
        const variation = variations.value.find(row => row.id === movement.variationId)
        if (variation) { variation.stock = movement.stockAfter; variation.stockConfirmed = movement.stockConfirmed !== false }
      }
    }
    const completedAt = new Date()
    currentBatch.value.status = 'completed'
    currentBatch.value.completedAt = completedAt.toISOString()
    currentBatch.value.expiresAt = new Date(completedAt.getTime() + THIRTY_DAYS).toISOString()
    await savePhotoBatch(currentBatch.value)
    success(`Lote de ${currentBatch.value.type === 'entrada' ? 'entrada' : 'saída'} concluído com ${created.length} movimentação(ões).`)
    await refreshBatches(currentBatch.value.id)
  } catch (cause) {
    if (cause.code === 'ITEM_DUPLICATE') {
      await loadItemData().catch(() => {})
      for (const photo of photos.value.filter(row => row.createCatalog)) {
        const duplicate = findDuplicateItem(photo.catalog)
        if (!duplicate) continue
        photo.createCatalog = false
        photo.itemId = duplicate.id
        photo.variationId = ''
        photo.status = 'review'
        photo.error = `Este item já existe no catálogo: "${duplicate.name}". Escolha a variação.`
        await saveBatchPhoto(photo)
      }
      error(cause.message)
      return
    }
    error(`${cause.message || 'Não foi possível concluir o lote.'} Tente novamente; o estoque não será duplicado.`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-w-0 max-w-full space-y-4 pb-24 lg:pb-4">
    <header class="flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-700">
      <div>
        <p class="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Movimentação assistida</p>
        <h2 class="mt-1 text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">Lotes por foto</h2>
        <p class="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">Fotografe cada produto, confira identificação e quantidade, depois confirme lote inteiro.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <AppButton v-if="batches.length" variant="ghost" size="sm" @click="batchPickerOpen = true">
          {{ pendingBatches.length ? `Ver lotes ativos (${pendingBatches.length})` : 'Ver lotes concluídos' }}
        </AppButton>
        <AppButton variant="success" size="sm" @click="createBatch('entrada')">Novo lote de entrada</AppButton>
        <AppButton variant="secondary" size="sm" @click="createBatch('saida')">Novo lote de saída</AppButton>
      </div>
    </header>

    <p v-if="storageError" role="alert" class="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{{ storageError }}</p>
    <p v-if="syncMessage" role="status" class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{{ syncMessage }}</p>
    <p v-if="loading" class="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">Carregando lotes…</p>

    <template v-else>
      <div
        v-if="currentBatch"
        class="photo-batch-shell min-w-0 max-w-full overflow-hidden rounded-xl border"
        :class="currentBatch.type === 'entrada' ? 'photo-batch-tone-entry' : 'photo-batch-tone-exit'"
      >
        <header
          class="photo-batch-header flex flex-wrap items-center justify-between gap-3 border-b p-4"
        >
          <div>
            <h3 class="text-base font-semibold text-[var(--ds-text)]">{{ currentBatch.status === 'pending' ? 'Lote em andamento' : 'Lote concluído' }}</h3>
            <p class="photo-batch-meta mt-1 text-xs">
              {{ currentBatch.type === 'entrada' ? 'Entrada' : 'Saída' }} · iniciado em {{ formatDate(currentBatch.createdAt) }} · {{ photos.length }} foto(s)<span v-if="queueCount"> · {{ queueCount }} na fila</span><span v-if="isAdmin && currentBatch.operatorName"> · {{ currentBatch.operatorName }}</span>
            </p>
          </div>
          <div v-if="needsAdminEditToggle || canEditCurrentBatch || canDeleteCurrentBatch" class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <AppButton v-if="needsAdminEditToggle" variant="secondary" size="sm" :disabled="canEditCurrentBatch && processing" @click="toggleBatchEditing">{{ canEditCurrentBatch ? 'Sair da edição' : 'Editar lote' }}</AppButton>
            <label v-if="canEditCurrentBatch" class="ds-button ds-button-secondary ds-button-sm inline-flex flex-1 cursor-pointer items-center justify-center gap-2 focus-within:ring-2 focus-within:ring-primary-400 sm:flex-none">
              <input class="sr-only" type="file" multiple accept="image/*" @change="onFilesSelected" />
              Escolher várias fotos
            </label>
            <label v-if="canEditCurrentBatch" class="ds-button ds-button-primary ds-button-md !hidden cursor-pointer items-center justify-center gap-2 focus-within:ring-2 focus-within:ring-primary-400 lg:!inline-flex" style="color: var(--ds-primary-text)">
              <input class="sr-only" type="file" accept="image/*" capture="environment" @change="onFilesSelected" />
              <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6.8 6.2 7.7 4.7A1.5 1.5 0 0 1 9 3.9h6a1.5 1.5 0 0 1 1.3.8l.9 1.5a1.5 1.5 0 0 0 1.3.7h1A1.5 1.5 0 0 1 21 8.4V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V8.4a1.5 1.5 0 0 1 1.5-1.5h1a1.5 1.5 0 0 0 1.3-.7Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15.8 12.8a3.8 3.8 0 1 1-7.6 0 3.8 3.8 0 0 1 7.6 0Z"/></svg>
              Tirar próxima foto
            </label>
            <ConfirmInline v-if="deleteBatchId === currentBatch.id" :message="currentBatch.status === 'completed' ? 'Excluir este lote e suas fotos? As movimentações permanecerão no histórico.' : 'Excluir este lote e suas fotos?'" confirm-label="Excluir" cancel-label="Cancelar" @confirm="removeBatch(currentBatch.id)" @cancel="deleteBatchId = ''" />
            <AppButton v-else-if="canDeleteCurrentBatch" variant="danger" size="sm" @click="deleteBatchId = currentBatch.id">Excluir lote</AppButton>
          </div>
        </header>

        <section v-if="canEditCurrentBatch" class="border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div><h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Padrões do lote</h4><p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Valem para todas as fotos, salvo sobrescritas.</p></div>
          </div>
          <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <template v-if="currentBatch.type === 'entrada'">
              <div><span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Fornecedor</span><SupplierPicker v-model="currentBatch.defaults.supplier" @select="saveCurrentBatch" @change="saveCurrentBatch" @clear="saveCurrentBatch" /></div>
              <EntryDocumentField v-model="currentBatch.defaults.docRef" v-model:document-type="currentBatch.defaults.docType" @change="saveCurrentBatch" />
            </template>
            <template v-else>
              <div><span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Quem retirou</span><PersonPicker :model-value="currentBatch.defaults.requestedBy" placeholder="Buscar pessoa..." @update:model-value="name => updatePerson(currentBatch.defaults, name)" @select="person => { selectPerson(currentBatch.defaults, person); saveCurrentBatch() }" @clear="saveCurrentBatch" /></div>
              <div><span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Destino</span><DestinationTreePicker v-model="currentBatch.defaults.destinationId" allow-other @select="payload => { selectDestination(currentBatch.defaults, payload); saveCurrentBatch() }" @other="() => { chooseOtherDestination(currentBatch.defaults); saveCurrentBatch() }" /></div>
              <label v-if="currentBatch.defaults.destinationOther" class="block"><span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Outro destino</span><input v-model="currentBatch.defaults.destination" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-900" @change="saveCurrentBatch" /></label>
            </template>
            <label class="block" :class="currentBatch.type === 'entrada' ? 'xl:col-span-1' : 'md:col-span-2 xl:col-span-1'"><span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Observação</span><textarea v-model="currentBatch.defaults.note" rows="2" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-900" @change="saveCurrentBatch"></textarea></label>
          </div>
        </section>

        <div v-if="photos.length" class="grid min-h-[520px] min-w-0 max-w-full lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside class="min-w-0 max-w-full overflow-hidden border-b border-gray-200 p-3 dark:border-gray-700 lg:border-b-0 lg:border-r">
            <div class="ds-scroll-x flex w-full min-w-0 max-w-full gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 lg:grid-cols-1">
              <div v-for="(photo, index) in photos" :key="photo.id" class="grid min-h-24 w-[17rem] max-w-[calc(100vw-3.5rem)] shrink-0 grid-cols-[72px_1fr] gap-3 rounded-lg border p-2 transition-colors sm:w-auto sm:max-w-none" :class="selectedPhotoId === photo.id ? 'border-primary-400 bg-primary-50/70 dark:border-primary-700 dark:bg-primary-950/20' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'">
                <button type="button" class="h-[72px] w-[72px] rounded-md outline-none ring-black/10 focus-visible:ring-2 focus-visible:ring-primary-400 dark:ring-white/10" :aria-label="`Ampliar foto ${index + 1} do lote`" title="Ampliar foto" @click="expandPhoto(photo)">
                  <img :src="photoUrl(photo)" alt="" class="h-full w-full rounded-md object-cover ring-1 ring-inset ring-black/10 dark:ring-white/10" />
                </button>
                <button type="button" class="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-400" @click="selectedPhotoId = photo.id">
                  <span class="inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold" :class="statusFor(photo).class">{{ statusFor(photo).label }}</span>
                  <span class="mt-1 block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{{ items.find(item => item.id === photo.itemId)?.name || photo.catalog?.name || photo.suggestion?.name || `Foto ${index + 1}` }}</span>
                  <span class="mt-1 block text-xs tabular-nums text-gray-500 dark:text-gray-400">{{ impactText(photo) }}</span>
                  <span v-if="photo.movementId" class="mt-1 block truncate text-[11px] text-gray-400">Mov. {{ photo.movementId }}</span>
                </button>
              </div>
            </div>
          </aside>

          <main v-if="selectedPhoto" class="min-w-0 p-3 sm:p-4">
            <div class="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <button type="button" class="h-40 w-40 overflow-hidden rounded-lg bg-gray-100 outline-none ring-1 ring-inset ring-black/10 focus-visible:ring-2 focus-visible:ring-primary-400 dark:bg-gray-800 dark:ring-white/10" aria-label="Ampliar foto selecionada" @click="expandPhoto(selectedPhoto)">
                <img :src="photoUrl(selectedPhoto)" alt="" class="h-full w-full object-cover" />
              </button>
              <div class="min-w-0">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <p class="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Conferência da foto</p>
                  <span class="inline-flex rounded border px-2 py-1 text-xs font-semibold" :class="statusFor(selectedPhoto).class">{{ statusFor(selectedPhoto).label }}</span>
                </div>
                <h4 class="mt-2 text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{{ currentItem?.name || selectedPhoto.catalog?.name || selectedPhoto.suggestion?.name || 'Identificação pendente' }}</h4>
                <p v-if="currentItem" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ itemPath(currentItem) }}</p>
                <div class="mt-4">
                  <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Impacto no saldo</span>
                  <p class="mt-0.5 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ impactText(selectedPhoto) }}</p>
                </div>
              </div>
            </div>

            <p v-if="selectedPhoto.error" role="alert" class="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{{ selectedPhoto.error }}</p>
            <div v-if="selectedPhoto.status === 'error' && canEditCurrentBatch" class="mt-2"><AppButton variant="secondary" size="sm" @click="retryAnalysis(selectedPhoto)">Tentar análise novamente</AppButton></div>

            <section class="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h5 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Material e variação</h5>
                <div v-if="canEditCurrentBatch" class="flex flex-wrap gap-2">
                  <AppButton v-if="isAdmin && !currentItem && selectedPhoto.suggestion?.identified && !selectedPhoto.createCatalog" variant="secondary" size="xs" @click="startCatalog(selectedPhoto)">Cadastrar e movimentar</AppButton>
                  <AppButton v-if="!selectedPhoto.createCatalog" variant="ghost" size="xs" @click="showManualSearch = !showManualSearch">{{ showManualSearch ? 'Fechar busca' : 'Buscar manualmente' }}</AppButton>
                </div>
              </div>

              <div v-if="currentItem && !showManualSearch" class="mt-3">
                <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ currentItem.name }}</p>
                <p v-if="currentVariation" class="mt-1 text-xs text-gray-600 dark:text-gray-300">{{ variationDescription(currentVariation) }}</p>
                <div v-else-if="currentItemVariations.length && canEditCurrentBatch" class="mt-3">
                  <p class="mb-2 text-xs font-medium text-amber-700 dark:text-amber-300">A IA encontrou o item, mas você precisa escolher a variação.</p>
                  <div class="grid gap-2 sm:grid-cols-2">
                    <button v-for="variation in currentItemVariations" :key="variation.id" type="button" class="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm hover:border-primary-400 dark:border-gray-600 dark:bg-gray-900" @click="chooseVariation(variation)">
                      <span class="block font-medium text-gray-900 dark:text-gray-100">{{ variationDescription(variation) }}</span>
                      <span class="mt-0.5 block text-xs tabular-nums text-gray-500 dark:text-gray-400">Saldo: {{ variation.stock }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="selectedPhoto.createCatalog" class="mt-3 space-y-3 rounded-lg border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div><p class="text-sm font-semibold text-amber-900 dark:text-amber-200">Novo item sugerido</p><p class="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">Revise o cadastro; ele será criado junto com esta movimentação.</p></div>
                  <div class="flex flex-wrap gap-2"><AppButton v-if="selectedPhoto.status !== 'matched'" variant="primary" size="xs" @click="confirmCatalogReview(selectedPhoto)">OK, cadastro revisado</AppButton><AppButton variant="ghost" size="xs" @click="cancelCatalog(selectedPhoto)">Voltar à busca</AppButton></div>
                </div>
                <p v-if="selectedPhoto.suggestion?.industrialSupply === false" role="status" class="rounded-lg border border-amber-300 bg-white/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-gray-900/60 dark:text-amber-300"><strong>Pode não fazer parte de suprimentos industriais.</strong> Este aviso não impede o cadastro.</p>
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="block"><span class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Grupo</span><input v-model="selectedPhoto.catalog.group" list="photo-catalog-groups" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 dark:border-gray-600 dark:bg-gray-900" @change="saveCatalogDraft(selectedPhoto)" /><datalist id="photo-catalog-groups"><option v-for="group in uniqueGroups" :key="group" :value="group" /></datalist></label>
                  <label class="block"><span class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Subgrupo</span><input v-model="selectedPhoto.catalog.category" list="photo-catalog-categories" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 dark:border-gray-600 dark:bg-gray-900" @change="saveCatalogDraft(selectedPhoto)" /><datalist id="photo-catalog-categories"><option v-for="category in catalogCategories" :key="category" :value="category" /></datalist></label>
                  <label class="block"><span class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Subnível</span><input v-model="selectedPhoto.catalog.subcategory" list="photo-catalog-subcategories" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 dark:border-gray-600 dark:bg-gray-900" @change="saveCatalogDraft(selectedPhoto)" /><datalist id="photo-catalog-subcategories"><option v-for="subcategory in catalogSubcategories" :key="subcategory" :value="subcategory" /></datalist></label>
                  <label class="block"><span class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Unidade</span><select v-model="selectedPhoto.catalog.unit" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 dark:border-gray-600 dark:bg-gray-900" @change="saveCatalogDraft(selectedPhoto)"><option v-for="unit in units" :key="unit.value" :value="unit.value">{{ unit.label }}</option></select></label>
                  <label class="block sm:col-span-2"><span class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Nome do item</span><input v-model="selectedPhoto.catalog.name" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 dark:border-gray-600 dark:bg-gray-900" @change="saveCatalogDraft(selectedPhoto)" /></label>
                </div>
                <div>
                  <div class="mb-2 flex items-center justify-between gap-2"><p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Atributos da variação</p><AppButton variant="secondary" size="xs" @click="addCatalogAttribute(selectedPhoto)">Adicionar atributo</AppButton></div>
                  <div v-if="selectedPhoto.catalog.attributes?.length" class="space-y-2">
                    <div v-for="(attribute, index) in selectedPhoto.catalog.attributes" :key="index" class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <input v-model="attribute.name" :aria-label="`Nome do atributo ${index + 1}`" placeholder="Ex.: Marca" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-600 dark:bg-gray-900" @change="saveCatalogDraft(selectedPhoto)" />
                      <input v-model="attribute.value" :aria-label="`Valor do atributo ${index + 1}`" placeholder="Ex.: Tekbond" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-600 dark:bg-gray-900" @change="saveCatalogDraft(selectedPhoto)" />
                      <AppButton variant="ghost" size="xs" @click="removeCatalogAttribute(selectedPhoto, index)">Remover</AppButton>
                    </div>
                  </div>
                  <p v-else class="text-xs text-gray-500 dark:text-gray-400">Sem atributos: será criada uma variação única.</p>
                </div>
              </div>

              <p v-else-if="canEditCurrentBatch && !isAdmin && !currentItem && selectedPhoto.suggestion?.identified" class="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">O item não foi encontrado. Um administrador pode cadastrar e movimentar por esta mesma ficha.</p>

              <div v-if="showManualSearch && !selectedPhoto.createCatalog" class="mt-3">
                <label class="block"><span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Buscar no catálogo</span><input v-model="manualSearch" type="search" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" placeholder="Nome, grupo, medida, marca…" /></label>
                <div v-if="manualResults.length" class="mt-2 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                  <button v-for="result in manualResults" :key="result.variation.id" type="button" class="flex min-h-11 w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800" @click="chooseManual(result)">
                    <span class="min-w-0"><span class="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{{ result.item.name }}</span><span class="block truncate text-xs text-gray-500 dark:text-gray-400">{{ variationDescription(result.variation) }}</span></span>
                    <span class="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">Saldo {{ result.variation.stock }}</span>
                  </button>
                </div>
                <p v-else-if="manualSearch.trim()" class="mt-2 text-xs text-gray-500 dark:text-gray-400">Nenhuma variação encontrada. Ajuste os termos da busca.</p>
              </div>
            </section>

            <section class="mt-4 grid gap-3 sm:grid-cols-2">
              <label v-if="selectedPhoto.createCatalog" class="block"><span class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Saldo já existente</span><input v-model="selectedPhoto.catalog.initialStock" type="number" min="0" step="1" :disabled="!canEditCurrentBatch" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm tabular-nums text-gray-900 outline-none focus:border-primary-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" @change="saveCatalogDraft(selectedPhoto)" /><span class="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">Quantidade que já estava no estoque antes deste movimento.</span></label>
              <label class="block"><span class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Quantidade</span><input v-model="selectedPhoto.qty" type="number" min="1" step="1" :disabled="!canEditCurrentBatch" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm tabular-nums text-gray-900 outline-none focus:border-primary-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" @change="savePhoto(selectedPhoto)" /></label>
              <label v-if="currentBatch.type === 'entrada'" class="block"><span class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Custo unitário</span><input :value="displayPhotoUnitCost(selectedPhoto.unitCost)" type="text" inputmode="decimal" :disabled="!canEditCurrentBatch" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm tabular-nums text-gray-900 outline-none focus:border-primary-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" placeholder="0,00" @input="updateUnitCost(selectedPhoto, $event)" @change="savePhoto(selectedPhoto)" /></label>
            </section>

            <section v-if="canEditCurrentBatch" class="mt-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div class="flex flex-wrap items-center justify-between gap-2"><div><h5 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Dados desta foto</h5><p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Use os padrões do lote ou sobrescreva somente este produto.</p></div><AppButton variant="secondary" size="xs" @click="toggleOverrides(selectedPhoto)">{{ selectedPhoto.useOverrides ? 'Usar padrões do lote' : 'Sobrescrever' }}</AppButton></div>
              <div v-if="selectedPhoto.useOverrides" class="mt-3 grid gap-3 sm:grid-cols-2">
                <template v-if="currentBatch.type === 'entrada'">
                  <div><span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Fornecedor</span><SupplierPicker v-model="selectedPhoto.overrides.supplier" @select="savePhoto(selectedPhoto)" @change="savePhoto(selectedPhoto)" @clear="savePhoto(selectedPhoto)" /></div>
                  <EntryDocumentField v-model="selectedPhoto.overrides.docRef" v-model:document-type="selectedPhoto.overrides.docType" @change="savePhoto(selectedPhoto)" />
                </template>
                <template v-else>
                  <div><span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Quem retirou</span><PersonPicker :model-value="selectedPhoto.overrides.requestedBy" placeholder="Buscar pessoa..." @update:model-value="name => updatePerson(selectedPhoto.overrides, name)" @select="person => { selectPerson(selectedPhoto.overrides, person); savePhoto(selectedPhoto) }" @clear="savePhoto(selectedPhoto)" /></div>
                  <div><span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Destino</span><DestinationTreePicker v-model="selectedPhoto.overrides.destinationId" allow-other @select="payload => { selectDestination(selectedPhoto.overrides, payload); savePhoto(selectedPhoto) }" @other="() => { chooseOtherDestination(selectedPhoto.overrides); savePhoto(selectedPhoto) }" /></div>
                  <label v-if="selectedPhoto.overrides.destinationOther" class="block sm:col-span-2"><span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Outro destino</span><input v-model="selectedPhoto.overrides.destination" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-800" @change="savePhoto(selectedPhoto)" /></label>
                </template>
                <label class="block sm:col-span-2"><span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Observação</span><textarea v-model="selectedPhoto.overrides.note" rows="2" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-800" @change="savePhoto(selectedPhoto)"></textarea></label>
              </div>
            </section>

            <div v-if="canEditCurrentBatch" class="mt-4 flex justify-end">
              <ConfirmInline v-if="deletePhotoId === selectedPhoto.id" message="Remover esta foto do lote?" confirm-label="Remover" cancel-label="Cancelar" @confirm="removePhoto(selectedPhoto.id)" @cancel="deletePhotoId = ''" />
              <AppButton v-else variant="ghost" size="sm" @click="deletePhotoId = selectedPhoto.id">Remover foto</AppButton>
            </div>
          </main>
        </div>

        <div v-else class="px-4 py-12 text-center"><p class="text-sm font-semibold text-gray-700 dark:text-gray-200">O lote ainda não tem fotos.</p><p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Tire uma foto por produto ou escolha vários arquivos de uma vez.</p></div>

      </div>

      <div v-else class="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-14 text-center dark:border-gray-700 dark:bg-gray-900">
        <p class="text-base font-semibold text-gray-800 dark:text-gray-100">{{ pendingBatches.length ? 'Escolha um lote ativo' : 'Comece um lote de entrada ou saída' }}</p>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ pendingBatches.length ? 'Lotes ficam fora desta tela até você escolher qual continuar.' : 'Fotos serão analisadas em sequência enquanto você continua trabalhando.' }}</p>
        <AppButton v-if="pendingBatches.length" class="mt-4" variant="secondary" size="sm" @click="batchPickerOpen = true">Ver lotes ativos</AppButton>
      </div>
    </template>

    <AppDialog v-if="batchPickerOpen" visible aria-label="Selecionar lote por foto" @close="batchPickerOpen = false">
      <div class="ds-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden shadow-xl">
        <header class="flex items-center justify-between gap-3 border-b border-[var(--ds-border)] px-4 py-3">
          <div>
            <h3 class="text-base font-semibold text-[var(--ds-text)]">Selecionar lote</h3>
            <p class="mt-0.5 text-xs text-[var(--ds-text-muted)]">Escolha lote para abrir na tela de conferência.</p>
          </div>
          <AppButton variant="ghost" size="sm" @click="batchPickerOpen = false">Fechar</AppButton>
        </header>
        <div class="min-h-0 overflow-y-auto p-4">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">Ativos</h4>
          <div v-if="pendingBatches.length" class="mt-2 space-y-2">
            <div
              v-for="batch in pendingBatches"
              :key="batch.id"
              class="photo-batch-row flex min-h-16 flex-col gap-3 px-3 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
              :class="[
                batch.type === 'entrada' ? 'photo-batch-tone-entry' : 'photo-batch-tone-exit',
                selectedBatchId === batch.id ? 'photo-batch-row-selected' : '',
              ]"
            >
              <button v-if="deleteBatchId !== batch.id" type="button" class="flex w-full min-w-0 flex-1 items-center gap-3 text-left outline-none" :aria-label="`Abrir lote de ${batch.type}`" @click="selectBatch(batch.id)">
                <span class="photo-batch-icon" aria-hidden="true">
                  <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" :d="batch.type === 'entrada' ? 'M12 4.5v15m0 0 6-6m-6 6-6-6' : 'M12 19.5v-15m0 0 6 6m-6-6-6 6'" />
                  </svg>
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-sm font-semibold">{{ batch.operatorName || 'Sem operador' }}</span>
                  <span class="photo-batch-meta mt-1 block text-xs">{{ batch.type === 'entrada' ? 'Entrada' : 'Saída' }} · iniciado em {{ formatDate(batch.createdAt) }}</span>
                </span>
              </button>
              <div v-if="deleteBatchId === batch.id" class="flex w-full flex-wrap items-center justify-end gap-2">
                <span class="mr-auto text-xs font-semibold text-[var(--ds-danger)]">Excluir este lote?</span>
                <AppButton variant="dangerSolid" size="xs" @click="removeBatch(batch.id)">Excluir</AppButton>
                <AppButton variant="ghost" size="xs" @click="deleteBatchId = ''">Cancelar</AppButton>
              </div>
              <AppButton v-else-if="canDeletePhotoBatch(batch, user.id, isAdmin)" class="shrink-0" variant="danger" size="xs" @click="deleteBatchId = batch.id">Excluir</AppButton>
            </div>
          </div>
          <p v-else class="mt-2 text-sm text-gray-500 dark:text-gray-400">Nenhum lote ativo.</p>

          <details v-if="completedBatches.length" class="mt-5 border-t border-gray-200 pt-4 dark:border-gray-700">
            <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Concluídos recentes ({{ completedBatches.length }})</summary>
            <div class="mt-2 space-y-2">
              <button
                v-for="batch in completedBatches"
                :key="batch.id"
                type="button"
                class="photo-batch-row photo-batch-row-completed flex min-h-16 w-full items-center gap-3 px-3 py-3 text-left"
                :class="batch.type === 'entrada' ? 'photo-batch-tone-entry' : 'photo-batch-tone-exit'"
                @click="selectBatch(batch.id)"
              >
                <span class="photo-batch-icon" aria-hidden="true">
                  <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m5 12.5 4 4L19 6.5" />
                  </svg>
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium">{{ batch.operatorName || 'Sem operador' }}</span>
                  <span class="photo-batch-meta mt-1 block text-xs">{{ batch.type === 'entrada' ? 'Entrada' : 'Saída' }} · concluído em {{ formatDate(batch.completedAt) }}</span>
                </span>
              </button>
            </div>
          </details>
        </div>
      </div>
    </AppDialog>

    <AppDialog v-if="expandedPhoto" visible aria-label="Foto ampliada do produto" @close="expandedPhoto = null">
      <div class="flex max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <header class="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{{ items.find(item => item.id === expandedPhoto.itemId)?.name || expandedPhoto.suggestion?.name || 'Foto do produto' }}</h3>
          <AppButton variant="ghost" size="sm" @click="expandedPhoto = null">Fechar</AppButton>
        </header>
        <div class="flex min-h-0 flex-1 items-center justify-center bg-gray-50 p-2 dark:bg-gray-950">
          <img :src="photoUrl(expandedPhoto)" alt="Foto ampliada do produto" class="max-h-[calc(100dvh-7rem)] max-w-full object-contain" />
        </div>
      </div>
    </AppDialog>

    <footer v-if="canEditCurrentBatch" class="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 p-3 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95 lg:sticky lg:inset-x-auto lg:rounded-xl lg:border">
      <div class="mx-auto flex max-w-7xl items-center gap-2 lg:justify-between">
        <p class="hidden min-w-0 flex-1 text-xs sm:block" :class="blockReason ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300'">{{ blockReason || `${photos.length} foto(s) pronta(s) para confirmar.` }}</p>
        <div class="flex w-full gap-2 sm:w-auto">
          <label class="ds-button ds-button-secondary ds-button-lg inline-flex flex-1 cursor-pointer items-center justify-center gap-2 focus-within:ring-2 focus-within:ring-primary-400 lg:hidden">
            <input class="sr-only" type="file" accept="image/*" capture="environment" @change="onFilesSelected" />
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6.8 6.2 7.7 4.7A1.5 1.5 0 0 1 9 3.9h6a1.5 1.5 0 0 1 1.3.8l.9 1.5a1.5 1.5 0 0 0 1.3.7h1A1.5 1.5 0 0 1 21 8.4V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V8.4a1.5 1.5 0 0 1 1.5-1.5h1a1.5 1.5 0 0 0 1.3-.7Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15.8 12.8a3.8 3.8 0 1 1-7.6 0 3.8 3.8 0 0 1 7.6 0Z"/></svg>
            Tirar foto
          </label>
          <AppButton class="flex-1 sm:flex-none" variant="primary" size="lg" :loading="saving" :disabled="Boolean(blockReason) || queueCount > 0" @click="confirmBatch">Confirmar lote</AppButton>
        </div>
      </div>
    </footer>
  </div>
</template>
