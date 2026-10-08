<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuth } from '../../composables/useAuth.js'
import { useDestinations } from '../../composables/useDestinations.js'
import { useItems } from '../../composables/useItems.js'
import { useToast } from '../../composables/useToast.js'
import { filterDestinations, findExactDestination, normalizeSearchText } from '../../utils/globalSearch.js'
import AttributeBadges from '../ui/AttributeBadges.vue'
import AppDialog from '../ui/AppDialog.vue'

const {
  addDestination,
  editDestination,
  reorderDestinations,
  sortDestinationsAlphabetically,
  toggleDestinationActive,
  deleteDestination,
  destinations,
  topLevelDestinations,
  getDestChildren,
  getDestDescendants,
  getDestFullName,
} = useDestinations()
const { items, variations, editVariation } = useItems()
const { isLoggedIn } = useAuth()
const { success, error } = useToast()

const destinationSearch = ref('')
const selectedParentId = ref('')
const selectedMaterialDestId = ref('')
const mobileDetailOpen = ref(false)

const addingDest = ref(false)
const newDestName = ref('')
const newDestDesc = ref('')
const newDestParentId = ref(null)

const editingDestId = ref(null)
const editDestName = ref('')
const editDestDesc = ref('')

const movingDest = ref(null)
const moveDestParentId = ref('')
const contextMenu = ref(null)
const contextMenuRef = ref(null)
const contextMenuFirstRef = ref(null)
const draggedDestinationIndex = ref(null)
const dragTargetDestinationIndex = ref(null)
let contextMenuTarget = null

const addingMaterial = ref(false)
const materialSearch = ref('')
const pendingMaterialIds = ref([])
const materialGroup = ref('')
const materialCategory = ref('')
const materialSubcategory = ref('')
const materialItemId = ref('')
const linkedMaterialsPage = ref(1)
const linkedMaterialsPerPage = 8

const filteredDestinationList = computed(() =>
  filterDestinations(destinations.value, destinationSearch.value)
)

const selectedParent = computed(() =>
  destinations.value.find(d => d.id === selectedParentId.value) || null
)

const selectedChildren = computed(() =>
  selectedParent.value ? getDestChildren(selectedParent.value.id) : []
)

const selectedMaterialDestination = computed(() => selectedParent.value)

const detailDestination = computed(() => selectedMaterialDestination.value || selectedParent.value)

const selectedDestinationPath = computed(() => {
  const path = []
  const byId = new Map(destinations.value.map(destination => [destination.id, destination]))
  const seen = new Set()
  let destination = selectedParent.value
  while (destination && !seen.has(destination.id)) {
    seen.add(destination.id)
    path.unshift(destination)
    destination = destination.parentId ? byId.get(destination.parentId) : null
  }
  return path
})

const visibleChildren = computed(() => {
  const query = normalizeSearchText(destinationSearch.value.trim())
  if (!query || normalizeSearchText(selectedParent.value?.name).includes(query)) return selectedChildren.value
  return selectedChildren.value.filter(destination =>
    normalizeSearchText(`${destination.name} ${destination.description || ''}`).includes(query)
  )
})

const canLinkMaterial = computed(() =>
  isLoggedIn.value && selectedMaterialDestination.value?.active
)

const moveParentOptions = computed(() => {
  if (!movingDest.value) return destinations.value
  const blockedIds = new Set([
    movingDest.value.id,
    ...getDestDescendants(movingDest.value.id).map(destination => destination.id),
  ])
  return destinations.value.filter(destination => !blockedIds.has(destination.id))
})

const moveUnchanged = computed(() =>
  (movingDest.value?.parentId || '') === moveDestParentId.value
)

watch(destinations, (list) => {
  if (!list.length) {
    selectedParentId.value = ''
    selectedMaterialDestId.value = ''
    return
  }

  const hasSelection = list.some(destination => destination.id === selectedParentId.value)
  if (!hasSelection) selectParent(topLevelDestinations.value[0]?.id || list[0].id)
}, { immediate: true })

watch(selectedParent, (parent) => {
  if (!parent) {
    selectedMaterialDestId.value = ''
    return
  }
  const ids = [parent.id, ...getDestChildren(parent.id).map(d => d.id)]
  if (!ids.includes(selectedMaterialDestId.value)) selectedMaterialDestId.value = parent.id
})

watch(destinationSearch, (query) => {
  const destination = findExactDestination(destinations.value, query)
  if (destination) selectDestination(destination)
})

function selectParent(id) {
  selectedParentId.value = id
  selectedMaterialDestId.value = id
  cancelEditDest()
  cancelAddDest()
  cancelMaterialAdd()
}

function selectDestination(destination) {
  selectParent(destination.id)
  mobileDetailOpen.value = true
}

function startDestinationDrag(index, event) {
  if (destinationSearch.value) return
  draggedDestinationIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
}

function overDestination(index, event) {
  if (draggedDestinationIndex.value === null) return
  event.preventDefault()
  dragTargetDestinationIndex.value = index
}

async function dropDestination(index, event) {
  event.preventDefault()
  const from = draggedDestinationIndex.value
  clearDestinationDrag()
  if (from === null || from === index) return
  await reorderDestinations(from, index)
}

function clearDestinationDrag() {
  draggedDestinationIndex.value = null
  dragTargetDestinationIndex.value = null
}

function startAddDest(parentId = null) {
  if (!isLoggedIn.value) return
  addingDest.value = true
  newDestName.value = ''
  newDestDesc.value = ''
  newDestParentId.value = parentId
  cancelEditDest()
}

function cancelAddDest() {
  addingDest.value = false
  newDestParentId.value = null
  newDestName.value = ''
  newDestDesc.value = ''
}

async function confirmAddDest() {
  if (!isLoggedIn.value) return
  const parentId = newDestParentId.value
  const r = await addDestination(newDestName.value, newDestDesc.value, parentId)
  if (!r.ok) { error(r.error); return }

  selectParent(r.destination.id)

  success(parentId ? 'Sub-destino adicionado.' : 'Destino adicionado.')
  cancelAddDest()
}

function startEditDest(dest) {
  if (!isLoggedIn.value) return
  editingDestId.value = dest.id
  editDestName.value = dest.name
  editDestDesc.value = dest.description || ''
  closeContextMenu()
  cancelAddDest()
}

function cancelEditDest() {
  editingDestId.value = null
  editDestName.value = ''
  editDestDesc.value = ''
}

async function confirmEditDest() {
  if (!isLoggedIn.value || !editingDestId.value) return
  const r = await editDestination(editingDestId.value, {
    name: editDestName.value,
    description: editDestDesc.value,
  })
  if (!r.ok) { error(r.error); return }
  success('Destino atualizado.')
  cancelEditDest()
}

function startMoveDest(dest) {
  if (!isLoggedIn.value) return
  movingDest.value = dest
  moveDestParentId.value = dest.parentId || ''
  closeContextMenu()
  cancelEditDest()
  cancelAddDest()
}

function cancelMoveDest() {
  movingDest.value = null
  moveDestParentId.value = ''
}

async function confirmMoveDest() {
  const destination = movingDest.value
  if (!isLoggedIn.value || !destination || moveUnchanged.value) return
  const parentId = moveDestParentId.value || null
  const r = await editDestination(destination.id, { parentId })
  if (!r.ok) { error(r.error); return }

  selectParent(destination.id)
  success(parentId ? 'Destino movido.' : 'Destino transformado em principal.')
  cancelMoveDest()
}

function openContextMenu(event, dest) {
  if (!isLoggedIn.value) return
  event.preventDefault()
  contextMenuTarget = event.currentTarget
  contextMenu.value = {
    dest,
    x: Math.min(event.clientX, window.innerWidth - 184),
    y: Math.min(event.clientY, window.innerHeight - 132),
  }
  nextTick(() => contextMenuFirstRef.value?.focus())
}

function closeContextMenu(restoreFocus = false) {
  contextMenu.value = null
  if (restoreFocus) nextTick(() => contextMenuTarget?.focus())
}

function renameContextDestination() {
  const dest = contextMenu.value?.dest
  if (!dest) return
  selectParent(dest.id)
  startEditDest(dest)
}

function moveContextDestination() {
  const dest = contextMenu.value?.dest
  if (dest) startMoveDest(dest)
}

function deleteContextDestination() {
  const dest = contextMenu.value?.dest
  closeContextMenu()
  if (dest) onDeleteDest(dest)
}

function handleContextMenuKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeContextMenu(true)
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const items = [...contextMenuRef.value.querySelectorAll('[role="menuitem"]')]
  const current = items.indexOf(document.activeElement)
  const index = event.key === 'Home' ? 0
    : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % items.length
        : (current - 1 + items.length) % items.length
  items[index]?.focus()
}

function handleContextPointerDown(event) {
  if (contextMenu.value && !contextMenuRef.value?.contains(event.target)) closeContextMenu()
}

function handleContextEscape(event) {
  if (event.key === 'Escape' && contextMenu.value) closeContextMenu(true)
}

onMounted(() => {
  window.addEventListener('pointerdown', handleContextPointerDown)
  window.addEventListener('keydown', handleContextEscape)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', handleContextPointerDown)
  window.removeEventListener('keydown', handleContextEscape)
})

async function onToggleActive(dest) {
  if (!isLoggedIn.value) return
  await toggleDestinationActive(dest.id)
}

async function onDeleteDest(dest) {
  if (!isLoggedIn.value) return
  const descendants = getDestDescendants(dest.id)
  const msg = descendants.length
    ? `Excluir destino "${dest.name}" e seus ${descendants.length} descendente(s)?`
    : `Excluir destino "${dest.name}"?`
  if (!confirm(msg)) return

  const removedIds = new Set([dest.id, ...descendants.map(destination => destination.id)])
  const linked = variations.value.filter(v =>
    (v.destinations || []).some(id => removedIds.has(id))
  )
  for (const variation of linked) {
    await editVariation(variation.id, {
      destinations: (variation.destinations || []).filter(id => !removedIds.has(id)),
    })
  }

  await deleteDestination(dest.id)
  if (removedIds.has(selectedParentId.value)) {
    const remainingParent = topLevelDestinations.value.find(parent => !removedIds.has(parent.id))
    if (remainingParent) selectParent(remainingParent.id)
    else {
      selectedParentId.value = ''
      selectedMaterialDestId.value = ''
    }
  } else if (removedIds.has(selectedMaterialDestId.value)) {
    selectedMaterialDestId.value = selectedParentId.value
  }
  success('Destino removido.')
}

function itemForVariation(variation) {
  return items.value.find(item => item.id === variation.itemId) || null
}

function variationLabel(variation) {
  const values = Object.entries(variation.values || {})
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => `${key}: ${value}`)
  return values.length ? values.join(' / ') : 'Variacao padrao'
}

function materialLabel(variation) {
  const item = itemForVariation(variation)
  return `${item?.name || 'Item'} - ${variationLabel(variation)}`
}

function materialMeta(variation) {
  const item = itemForVariation(variation)
  return [item?.group, item?.category, item?.subcategory].filter(Boolean).join(' > ')
}

function materialMatchesSearch(variation, query) {
  const item = itemForVariation(variation)
  const extras = Object.entries(variation.extras || {}).map(([k, v]) => `${k} ${v}`).join(' ')
  return [
    item?.name,
    item?.group,
    item?.category,
    item?.subcategory,
    variationLabel(variation),
    extras,
  ].filter(Boolean).join(' ').toLowerCase().includes(query)
}

function itemMatchesMaterialSearch(item, query) {
  if (!query) return true
  const itemVars = variations.value.filter(variation => variation.itemId === item.id)
  return [
    item.name,
    item.group,
    item.category,
    item.subcategory,
    item.location,
    ...itemVars.map(variation => `${variationLabel(variation)} ${Object.entries(variation.extras || {}).map(([k, v]) => `${k} ${v}`).join(' ')}`),
  ].filter(Boolean).join(' ').toLowerCase().includes(query)
}

const linkedMaterials = computed(() => {
  const destination = selectedMaterialDestination.value
  if (!destination) return []
  return variations.value
    .filter(variation => (variation.destinations || []).includes(destination.id))
    .filter(variation => !variationCoveredByRules(variation, destination))
    .sort((a, b) => materialLabel(a).localeCompare(materialLabel(b)))
})

function itemMatchesRule(item, rule) {
  if (!item || !rule?.group || item.group !== rule.group) return false
  if (rule.category && item.category !== rule.category) return false
  if (rule.subcategory && item.subcategory !== rule.subcategory) return false
  return true
}

function variationBelongsToDestination(variation, destination) {
  if ((variation.destinations || []).includes(destination.id)) return true
  const item = items.value.find(i => i.id === variation.itemId)
  return (destination.materialRules || []).some(rule => itemMatchesRule(item, rule))
}

function variationCoveredByRules(variation, destination) {
  const item = itemForVariation(variation)
  return (destination?.materialRules || []).some(rule => itemMatchesRule(item, rule))
}

function isManualMaterialLinked(variation) {
  return (variation.destinations || []).includes(selectedMaterialDestination.value?.id)
}

const linkedMaterialsRuleCount = computed(() => {
  const destination = selectedMaterialDestination.value
  if (!destination) return 0
  return variations.value.filter(variation => variationCoveredByRules(variation, destination)).length
})

const linkedMaterialsTotalCount = computed(() => {
  const destination = selectedMaterialDestination.value
  if (!destination) return 0
  return variations.value.filter(variation => variationBelongsToDestination(variation, destination)).length
})

const linkedMaterialsTotalPages = computed(() =>
  Math.max(1, Math.ceil(linkedMaterials.value.length / linkedMaterialsPerPage))
)

const paginatedLinkedMaterials = computed(() => {
  const start = (linkedMaterialsPage.value - 1) * linkedMaterialsPerPage
  return linkedMaterials.value.slice(start, start + linkedMaterialsPerPage)
})

const linkedMaterialsPageStart = computed(() =>
  linkedMaterials.value.length ? (linkedMaterialsPage.value - 1) * linkedMaterialsPerPage + 1 : 0
)

const linkedMaterialsPageEnd = computed(() =>
  Math.min(linkedMaterialsPage.value * linkedMaterialsPerPage, linkedMaterials.value.length)
)

watch(() => selectedMaterialDestination.value?.id, () => {
  linkedMaterialsPage.value = 1
})

watch(linkedMaterialsTotalPages, (total) => {
  if (linkedMaterialsPage.value > total) linkedMaterialsPage.value = total
})

function materialCountForDestination(destinationId) {
  const destination = [selectedParent.value, ...selectedChildren.value].filter(Boolean).find(d => d.id === destinationId)
  if (!destination) return 0
  return variations.value.filter(variation => variationBelongsToDestination(variation, destination)).length
}

function materialRuleCountForDestination(destinationId) {
  const destination = [selectedParent.value, ...selectedChildren.value].filter(Boolean).find(d => d.id === destinationId)
  return destination?.materialRules?.length || 0
}

function goLinkedMaterialsPage(delta) {
  linkedMaterialsPage.value = Math.min(
    linkedMaterialsTotalPages.value,
    Math.max(1, linkedMaterialsPage.value + delta)
  )
}

const materialSearchResults = computed(() => {
  const destinationId = selectedMaterialDestination.value?.id
  if (!destinationId) return []
  const q = materialSearch.value.trim().toLowerCase()
  return variations.value
    .filter(variation => !(variation.destinations || []).includes(destinationId))
    .filter(variation => !q || materialMatchesSearch(variation, q))
    .sort((a, b) => materialLabel(a).localeCompare(materialLabel(b)))
    .slice(0, 24)
})

function availableVariationsForItem(itemId) {
  const destinationId = selectedMaterialDestination.value?.id
  if (!destinationId) return []
  const q = materialSearch.value.trim().toLowerCase()
  return variations.value
    .filter(variation => variation.itemId === itemId)
    .filter(variation => !(variation.destinations || []).includes(destinationId))
    .filter(variation => !q || materialMatchesSearch(variation, q))
    .sort((a, b) => variationLabel(a).localeCompare(variationLabel(b)))
}

function itemHasAvailableVariation(item) {
  const destinationId = selectedMaterialDestination.value?.id
  if (!destinationId) return false
  const q = materialSearch.value.trim().toLowerCase()
  return variations.value.some(variation =>
    variation.itemId === item.id &&
    !(variation.destinations || []).includes(destinationId) &&
    (!q || itemMatchesMaterialSearch(item, q))
  )
}

const materialGroups = computed(() => {
  const groups = new Set()
  for (const item of items.value) {
    if (itemHasAvailableVariation(item)) groups.add(item.group)
  }
  return [...groups].sort((a, b) => a.localeCompare(b))
})

const materialCategories = computed(() => {
  if (!materialGroup.value) return []
  const categories = new Set()
  for (const item of items.value) {
    if (item.group === materialGroup.value && item.category && itemHasAvailableVariation(item)) {
      categories.add(item.category)
    }
  }
  return [...categories].sort((a, b) => a.localeCompare(b))
})

const materialSubcategories = computed(() => {
  if (!materialGroup.value || !materialCategory.value) return []
  const subcategories = new Set()
  for (const item of items.value) {
    if (
      item.group === materialGroup.value &&
      item.category === materialCategory.value &&
      item.subcategory &&
      itemHasAvailableVariation(item)
    ) {
      subcategories.add(item.subcategory)
    }
  }
  return [...subcategories].sort((a, b) => a.localeCompare(b))
})

const materialItems = computed(() => {
  if (!materialGroup.value) return []
  return items.value
    .filter(item => itemHasAvailableVariation(item))
    .filter(item => item.group === materialGroup.value)
    .filter(item => !materialCategory.value || item.category === materialCategory.value)
    .filter(item => !materialSubcategory.value || item.subcategory === materialSubcategory.value)
    .filter(item => {
      if (materialSubcategory.value) return true
      if (materialCategory.value) return !materialSubcategories.value.length || !item.subcategory
      return !materialCategories.value.length || !item.category
    })
    .sort((a, b) => a.name.localeCompare(b.name))
})

const selectedMaterialItem = computed(() =>
  items.value.find(item => item.id === materialItemId.value) || null
)

const selectedMaterialItemVariations = computed(() =>
  materialItemId.value ? availableVariationsForItem(materialItemId.value) : []
)

const currentScopeMaterialIds = computed(() => {
  if (selectedMaterialItem.value) return selectedMaterialItemVariations.value.map(v => v.id)
  if (!materialGroup.value) return []
  return items.value
    .filter(item => item.group === materialGroup.value)
    .filter(item => !materialCategory.value || item.category === materialCategory.value)
    .filter(item => !materialSubcategory.value || item.subcategory === materialSubcategory.value)
    .flatMap(item => availableVariationsForItem(item.id).map(v => v.id))
})

const allCurrentScopePending = computed(() =>
  currentScopeMaterialIds.value.length > 0 &&
  currentScopeMaterialIds.value.every(id => pendingMaterialIds.value.includes(id))
)

const currentScopeRule = computed(() => {
  if (!materialGroup.value || selectedMaterialItem.value) return null
  return {
    group: materialGroup.value,
    category: materialCategory.value || '',
    subcategory: materialSubcategory.value || '',
  }
})

function ruleKey(rule) {
  return `${rule?.group || ''}\u0000${rule?.category || ''}\u0000${rule?.subcategory || ''}`
}

function ruleLabel(rule) {
  return [rule.group, rule.category, rule.subcategory].filter(Boolean).join(' > ')
}

function variationsForRule(rule) {
  return variations.value.filter(variation => itemMatchesRule(itemForVariation(variation), rule))
}

async function setRuleVariationLinks(rule, destinationId, linked, remainingRules = []) {
  for (const variation of variationsForRule(rule)) {
    const item = itemForVariation(variation)
    const destinations = new Set(variation.destinations || [])
    const hadDestination = destinations.has(destinationId)
    if (linked) destinations.add(destinationId)
    else if (!remainingRules.some(saved => itemMatchesRule(item, saved))) destinations.delete(destinationId)
    if (destinations.has(destinationId) === hadDestination) continue
    const r = await editVariation(variation.id, { destinations: [...destinations] })
    if (!r.ok) return r
  }
  return { ok: true }
}

const destinationMaterialRules = computed(() =>
  selectedMaterialDestination.value?.materialRules || []
)

const currentScopeRuleSaved = computed(() => {
  const rule = currentScopeRule.value
  if (!rule) return false
  return destinationMaterialRules.value.some(saved => ruleKey(saved) === ruleKey(rule))
})

const materialBreadcrumb = computed(() => [
  materialGroup.value,
  materialCategory.value,
  materialSubcategory.value,
  selectedMaterialItem.value?.name,
].filter(Boolean))

const materialModalTitle = computed(() => {
  if (selectedMaterialItem.value) return 'Variacoes'
  if (materialSubcategory.value || (materialCategory.value && !materialSubcategories.value.length) || (materialGroup.value && !materialCategories.value.length)) return 'Itens'
  if (materialCategory.value) return 'Nivel 3'
  if (materialGroup.value) return 'Nivel 2'
  return 'Nivel 1'
})

function resetMaterialNavigation() {
  materialGroup.value = ''
  materialCategory.value = ''
  materialSubcategory.value = ''
  materialItemId.value = ''
}

function selectMaterialGroup(group) {
  materialGroup.value = group
  materialCategory.value = ''
  materialSubcategory.value = ''
  materialItemId.value = ''
}

function selectMaterialCategory(category) {
  materialCategory.value = category
  materialSubcategory.value = ''
  materialItemId.value = ''
}

function selectMaterialSubcategory(subcategory) {
  materialSubcategory.value = subcategory
  materialItemId.value = ''
}

function selectMaterialItem(itemId) {
  materialItemId.value = itemId
}

function goMaterialRoot() {
  resetMaterialNavigation()
}

function goMaterialGroup() {
  materialCategory.value = ''
  materialSubcategory.value = ''
  materialItemId.value = ''
}

function goMaterialCategory() {
  materialSubcategory.value = ''
  materialItemId.value = ''
}

function goMaterialSubcategory() {
  materialItemId.value = ''
}

function startMaterialAdd() {
  if (!canLinkMaterial.value) return
  addingMaterial.value = true
  materialSearch.value = ''
  pendingMaterialIds.value = []
  resetMaterialNavigation()
}

function cancelMaterialAdd() {
  addingMaterial.value = false
  materialSearch.value = ''
  pendingMaterialIds.value = []
  resetMaterialNavigation()
}

function isPendingMaterial(variationId) {
  return pendingMaterialIds.value.includes(variationId)
}

function togglePendingMaterial(variationId) {
  if (!canLinkMaterial.value) return
  const idx = pendingMaterialIds.value.indexOf(variationId)
  if (idx >= 0) pendingMaterialIds.value.splice(idx, 1)
  else pendingMaterialIds.value.push(variationId)
}

function toggleCurrentScopeMaterials() {
  if (!canLinkMaterial.value || !currentScopeMaterialIds.value.length) return
  if (currentScopeRule.value) {
    toggleCurrentScopeRule()
    return
  }
  if (allCurrentScopePending.value) {
    pendingMaterialIds.value = pendingMaterialIds.value.filter(id => !currentScopeMaterialIds.value.includes(id))
    return
  }
  const selected = new Set(pendingMaterialIds.value)
  for (const id of currentScopeMaterialIds.value) selected.add(id)
  pendingMaterialIds.value = [...selected]
}

async function toggleCurrentScopeRule() {
  const destination = selectedMaterialDestination.value
  const rule = currentScopeRule.value
  if (!destination || !rule) return
  const current = destination.materialRules || []
  const key = ruleKey(rule)
  const removing = current.some(saved => ruleKey(saved) === key)
  const next = removing ? current.filter(saved => ruleKey(saved) !== key) : [...current, rule]
  const linkResult = await setRuleVariationLinks(rule, destination.id, !removing, next)
  if (!linkResult.ok) { error(linkResult.error); return }
  const r = await editDestination(destination.id, { materialRules: next })
  if (!r.ok) { error(r.error); return }
  const affected = variationsForRule(rule).length
  success(removing
    ? `Regra removida do destino. ${affected} vínculo(s) removido(s).`
    : `Regra salva para este destino. ${affected} vínculo(s) aplicado(s).`
  )
}

async function removeMaterialRule(rule) {
  const destination = selectedMaterialDestination.value
  if (!isLoggedIn.value || !destination) return
  const next = (destination.materialRules || []).filter(saved => ruleKey(saved) !== ruleKey(rule))
  const linkResult = await setRuleVariationLinks(rule, destination.id, false, next)
  if (!linkResult.ok) { error(linkResult.error); return }
  const r = await editDestination(destination.id, { materialRules: next })
  if (!r.ok) { error(r.error); return }
  success(`Regra removida do destino. ${variationsForRule(rule).length} vínculo(s) removido(s).`)
}

async function savePendingMaterials() {
  if (!canLinkMaterial.value) return
  if (!pendingMaterialIds.value.length) {
    cancelMaterialAdd()
    return
  }
  const destinationId = selectedMaterialDestination.value.id
  for (const variationId of pendingMaterialIds.value) {
    const variation = variations.value.find(v => v.id === variationId)
    if (!variation) continue
    const destinations = new Set(variation.destinations || [])
    destinations.add(destinationId)
    const r = await editVariation(variation.id, { destinations: [...destinations] })
    if (!r.ok) { error(r.error); return }
  }
  success(pendingMaterialIds.value.length === 1 ? 'Material vinculado ao destino.' : 'Materiais vinculados ao destino.')
  cancelMaterialAdd()
}

async function removeMaterialFromDestination(variation) {
  if (!isLoggedIn.value || !selectedMaterialDestination.value) return
  const destinationId = selectedMaterialDestination.value.id
  const r = await editVariation(variation.id, {
    destinations: (variation.destinations || []).filter(id => id !== destinationId),
  })
  if (!r.ok) { error(r.error); return }
  success('Vinculo removido.')
}
</script>

<template>
  <div class="flex min-h-[calc(100dvh-11rem)] gap-0 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 md:min-h-[560px]">
    <!-- Left panel -->
    <aside
      class="destination-management-sidebar w-full flex-shrink-0 flex-col bg-gray-50 dark:bg-gray-800 md:w-64 md:border-r md:border-gray-200 md:dark:border-gray-700"
      :class="mobileDetailOpen ? 'hidden md:flex' : 'flex'"
    >
      <div class="px-3 pt-2.5 pb-2 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Destinos</p>
          <button
            v-if="topLevelDestinations.length && !destinationSearch"
            type="button"
            class="ds-chip cursor-pointer hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            title="Organizar destinos em ordem alfabética"
            @click="sortDestinationsAlphabetically"
          >
            A-Z
          </button>
        </div>
        <div class="relative">
          <svg class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ds-text-subtle)]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" /></svg>
          <input
            v-model="destinationSearch"
            placeholder="Filtrar..."
            class="ds-input !min-h-10 !pl-9 !pr-3 !text-xs"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto py-1">
        <div v-if="!topLevelDestinations.length && !addingDest" class="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500 italic">
          Nenhum destino ainda.
        </div>

        <div v-else-if="destinationSearch && !filteredDestinationList.length" class="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500 italic">
          Nenhum destino encontrado.
        </div>

        <button
          v-for="(destination, destinationIndex) in filteredDestinationList"
          :key="destination.id"
          type="button"
          :draggable="!destinationSearch"
          class="group/row min-h-11 w-[calc(100%-0.5rem)] flex items-center gap-1.5 px-2 py-1.5 mx-1 my-0.5 rounded-lg cursor-pointer transition-colors text-left md:min-h-0"
          :class="[
            selectedMaterialDestId === destination.id
              ? 'bg-primary-600 dark:bg-primary-700 text-[var(--ds-primary-text)]'
              : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200',
            draggedDestinationIndex === destinationIndex ? 'opacity-40' : '',
            dragTargetDestinationIndex === destinationIndex ? 'ring-2 ring-inset ring-primary-500' : '',
          ]"
          :title="getDestFullName(destination.id)"
          @dragstart.stop="startDestinationDrag(destinationIndex, $event)"
          @dragover.stop="overDestination(destinationIndex, $event)"
          @drop.stop="dropDestination(destinationIndex, $event)"
          @dragend.stop="clearDestinationDrag"
          @click="selectDestination(destination)"
          @contextmenu="openContextMenu($event, destination)"
        >
          <svg v-if="!destinationSearch" class="h-3 w-3 flex-shrink-0 cursor-grab text-current opacity-0 group-hover/row:opacity-40 active:cursor-grabbing" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="7" cy="5" r="1.2"/><circle cx="13" cy="5" r="1.2"/>
            <circle cx="7" cy="10" r="1.2"/><circle cx="13" cy="10" r="1.2"/>
            <circle cx="7" cy="15" r="1.2"/><circle cx="13" cy="15" r="1.2"/>
          </svg>
          <svg class="w-4 h-4 flex-shrink-0 opacity-70" :class="destination.parentId ? 'ml-2' : ''" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
          <span class="flex-1 min-w-0 truncate">
            <span class="block truncate text-sm font-medium">{{ destination.name }}</span>
            <span v-if="destination.parentId" class="block truncate text-[10px] opacity-60">{{ getDestFullName(destination.id) }}</span>
          </span>
          <span v-if="!destination.parentId" class="text-[10px] opacity-60 tabular-nums flex-shrink-0">{{ getDestChildren(destination.id).length }}</span>
          <span
            class="w-2 h-2 rounded-full flex-shrink-0"
            :class="destination.active ? 'bg-green-400' : 'bg-gray-400'"
            :title="destination.active ? 'Ativo' : 'Inativo'"
          ></span>
        </button>
      </div>

      <div v-if="isLoggedIn" class="border-t border-gray-200 dark:border-gray-700 p-2">
        <div v-if="addingDest && !newDestParentId" class="flex items-center gap-1">
          <input
            v-model="newDestName"
            placeholder="Nome do destino"
            class="flex-1 min-w-0 px-2 py-1 text-xs rounded-md border border-primary-400 dark:border-primary-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none"
            autofocus
            @keydown.enter="confirmAddDest"
            @keydown.escape="cancelAddDest"
          />
          <button class="p-1 text-green-500 hover:text-green-600 flex-shrink-0" title="Salvar" @click="confirmAddDest">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          </button>
          <button class="p-1 text-gray-400 hover:text-gray-500 flex-shrink-0" title="Cancelar" @click="cancelAddDest">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <button
          v-else
          class="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary-600 px-3 text-xs font-semibold text-[var(--ds-primary-text)] transition-colors duration-100 hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 md:h-9 md:min-h-0"
          @click="startAddDest(null)"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Novo destino
        </button>
      </div>
    </aside>

    <!-- Right panel -->
    <main
      class="min-w-0 flex-1 overflow-y-auto bg-white dark:bg-gray-900"
      :class="mobileDetailOpen ? 'block' : 'hidden md:block'"
    >
      <div v-if="!selectedParent" class="flex flex-col items-center justify-center h-full py-20 text-gray-300 dark:text-gray-600">
        <svg class="w-10 h-10 mb-3" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
        <p class="text-sm">Selecione um destino a esquerda.</p>
      </div>

      <template v-else>
        <div class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900 sm:px-5 sm:py-3">
          <button
            type="button"
            class="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950/30 md:hidden"
            @click="mobileDetailOpen = false"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m15.75 19.5-7.5-7.5 7.5-7.5" /></svg>
            Destinos
          </button>
          <span class="h-5 w-px bg-gray-200 dark:bg-gray-700 md:hidden"></span>
          <template v-for="(destination, index) in selectedDestinationPath" :key="destination.id">
            <button
              type="button"
              class="text-sm font-bold"
              :class="index === selectedDestinationPath.length - 1 ? 'text-gray-800 dark:text-gray-100' : 'text-primary-600 hover:underline dark:text-primary-400'"
              @click="selectParent(destination.id)"
            >{{ destination.name }}</button>
            <svg v-if="index < selectedDestinationPath.length - 1" class="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </template>
          <span
            class="ml-auto px-2 py-0.5 rounded-full text-[11px] font-medium"
            :class="selectedMaterialDestination?.active
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'"
          >
            {{ selectedMaterialDestination?.active ? 'Ativo' : 'Inativo' }}
          </span>
        </div>

        <div class="space-y-5 p-3 sm:space-y-6 sm:p-5">
          <!-- Selected destination details -->
          <section
            class="rounded-xl border border-primary-500 bg-gray-50 ring-1 ring-primary-500/30 dark:border-primary-500 dark:bg-gray-800 overflow-hidden transition-all"
            @contextmenu="openContextMenu($event, detailDestination)"
          >
            <div class="flex flex-wrap items-center gap-3 border-b border-gray-100 px-3 py-3 dark:border-gray-700 sm:px-4">
              <template v-if="editingDestId === detailDestination.id">
                <input
                  v-model="editDestName"
                  class="w-full min-w-0 flex-1 px-2 py-2 text-sm border border-primary-400 dark:border-primary-500 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none sm:w-auto"
                  autofocus
                  @keydown.enter="confirmEditDest"
                  @keydown.escape="cancelEditDest"
                />
                <input
                  v-model="editDestDesc"
                  placeholder="Descricao..."
                  class="w-full min-w-0 flex-1 px-2 py-2 text-sm border border-primary-400 dark:border-primary-500 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none sm:w-auto"
                  @keydown.enter="confirmEditDest"
                  @keydown.escape="cancelEditDest"
                />
                <button class="p-1 text-green-500 hover:text-green-600" title="Salvar" @click="confirmEditDest">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                </button>
                <button class="p-1 text-gray-400 hover:text-gray-600" title="Cancelar" @click="cancelEditDest">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </template>

              <template v-else>
                <div
                  class="min-w-0 basis-full rounded-lg px-2 py-1 -mx-2 text-left transition-colors hover:bg-white dark:hover:bg-gray-700/60 sm:basis-auto sm:flex-1"
                >
                  <p class="text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <span class="truncate">{{ detailDestination.name }}</span>
                  </p>
                  <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ detailDestination.description || 'Sem descricao' }}</p>
                </div>
                <span
                  class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
                >Selecionado</span>
                <div v-if="isLoggedIn" class="ml-auto flex items-center gap-1">
                  <button
                    class="inline-flex min-h-10 items-center px-3 py-0.5 rounded-full text-[11px] font-medium transition-colors"
                    :class="detailDestination.active
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'"
                    @click="onToggleActive(detailDestination)"
                  >{{ detailDestination.active ? 'Ativo' : 'Inativo' }}</button>
                  <button class="inline-flex min-h-10 min-w-10 items-center justify-center rounded text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 bg-white dark:bg-gray-700 shadow-sm" title="Mover" @click="startMoveDest(detailDestination)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5h15m0 0-3-3m3 3-3 3M21 16.5H6m0 0 3 3m-3-3 3-3" /></svg>
                  </button>
                  <button class="inline-flex min-h-10 min-w-10 items-center justify-center rounded text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 bg-white dark:bg-gray-700 shadow-sm" title="Editar" @click="startEditDest(detailDestination)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                  </button>
                  <button class="inline-flex min-h-10 min-w-10 items-center justify-center rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 bg-white dark:bg-gray-700 shadow-sm" title="Excluir" @click="onDeleteDest(detailDestination)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79" /></svg>
                  </button>
                </div>
              </template>
            </div>
          </section>

          <!-- Children cards -->
          <section v-if="selectedMaterialDestId === selectedParent.id">
            <div class="flex items-center justify-between mb-3">
              <p class="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Sub-destinos</p>
              <button
                v-if="isLoggedIn && selectedParent.active && !(addingDest && newDestParentId === selectedParent.id)"
                class="inline-flex min-h-10 items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-[var(--ds-primary-text)] rounded-lg transition-colors"
                @click="startAddDest(selectedParent.id)"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Novo sub-destino
              </button>
            </div>

            <div v-if="addingDest && newDestParentId === selectedParent.id" class="mb-3 flex flex-col gap-2 rounded-xl border border-primary-300 bg-primary-50/40 p-3 dark:border-primary-700 dark:bg-primary-900/10 sm:flex-row sm:items-center">
              <input
                v-model="newDestName"
                placeholder="Nome do sub-destino"
                class="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
                autofocus
                @keydown.enter="confirmAddDest"
                @keydown.escape="cancelAddDest"
              />
              <input
                v-model="newDestDesc"
                placeholder="Descricao"
                class="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
                @keydown.enter="confirmAddDest"
                @keydown.escape="cancelAddDest"
              />
              <button class="p-2 text-green-500 hover:text-green-600" title="Salvar" @click="confirmAddDest">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              </button>
              <button class="p-2 text-gray-400 hover:text-gray-600" title="Cancelar" @click="cancelAddDest">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div v-if="visibleChildren.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="child in visibleChildren"
                :key="child.id"
                class="group/card relative rounded-xl border bg-gray-50 dark:bg-gray-800 hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-sm transition-colors duration-100"
                :class="[
                  selectedMaterialDestId === child.id ? 'border-primary-500 dark:border-primary-500 ring-1 ring-primary-500/30' : 'border-gray-200 dark:border-gray-700',
                  !child.active ? 'opacity-60' : ''
                ]"
                @contextmenu="openContextMenu($event, child)"
              >
                <template v-if="editingDestId === child.id">
                  <div class="p-4 space-y-2">
                    <input
                      v-model="editDestName"
                      class="w-full px-2 py-1 text-sm border border-primary-400 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none"
                      autofocus
                      @keydown.enter="confirmEditDest"
                      @keydown.escape="cancelEditDest"
                    />
                    <input
                      v-model="editDestDesc"
                      placeholder="Descricao..."
                      class="w-full px-2 py-1 text-sm border border-primary-400 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none"
                      @keydown.enter="confirmEditDest"
                      @keydown.escape="cancelEditDest"
                    />
                    <div class="flex justify-end gap-1">
                      <button class="p-1 rounded text-green-500 hover:text-green-600" title="Salvar" @click.stop="confirmEditDest">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                      </button>
                      <button class="p-1 rounded text-gray-400 hover:text-gray-600" title="Cancelar" @click.stop="cancelEditDest">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <button class="w-full cursor-pointer p-4 pb-14 text-left md:pb-4" type="button" @click="selectDestination(child)">
                    <p class="text-sm font-bold text-gray-800 dark:text-gray-100 truncate pr-20">{{ child.name }}</p>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">{{ child.description || 'Sem descricao' }}</p>
                    <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-3">
                      {{ materialCountForDestination(child.id) }} materiais
                      <span v-if="materialRuleCountForDestination(child.id)"> · {{ materialRuleCountForDestination(child.id) }} regra{{ materialRuleCountForDestination(child.id) === 1 ? '' : 's' }}</span>
                    </p>
                  </button>
                  <span
                    v-if="selectedMaterialDestId === child.id"
                    class="absolute bottom-2 left-4 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
                  >Selecionado</span>
                  <span
                    class="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[11px] font-medium"
                    :class="child.active
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'"
                  >{{ child.active ? 'Ativo' : 'Inativo' }}</span>
                  <div v-if="isLoggedIn" class="absolute bottom-2 right-2 flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover/card:opacity-100">
                    <button
                      class="inline-flex min-h-10 min-w-10 items-center justify-center rounded text-gray-400 hover:text-green-500 dark:hover:text-green-400 bg-white dark:bg-gray-700 shadow-sm"
                      :title="child.active ? 'Inativar' : 'Ativar'"
                      @click.stop="onToggleActive(child)"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                    </button>
                    <button class="inline-flex min-h-10 min-w-10 items-center justify-center rounded text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 bg-white dark:bg-gray-700 shadow-sm" title="Mover" @click.stop="startMoveDest(child)">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5h15m0 0-3-3m3 3-3 3M21 16.5H6m0 0 3 3m-3-3 3-3" /></svg>
                    </button>
                    <button class="inline-flex min-h-10 min-w-10 items-center justify-center rounded text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 bg-white dark:bg-gray-700 shadow-sm" title="Editar" @click.stop="startEditDest(child)">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                    </button>
                    <button class="inline-flex min-h-10 min-w-10 items-center justify-center rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 bg-white dark:bg-gray-700 shadow-sm" title="Excluir" @click.stop="onDeleteDest(child)">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79" /></svg>
                    </button>
                  </div>
                </template>
              </div>
            </div>

            <div v-else class="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
              {{ destinationSearch ? 'Nenhum sub-destino encontrado.' : 'Nenhum sub-destino cadastrado.' }}
            </div>
          </section>

          <!-- Linked materials -->
          <section class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
              <div class="flex-1 min-w-0">
                <p class="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Materiais utilizados</p>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                  {{ getDestFullName(selectedMaterialDestination?.id) }}
                </p>
                <p v-if="linkedMaterialsTotalCount" class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {{ linkedMaterialsTotalCount }} materiais contabilizados
                  <template v-if="linkedMaterialsRuleCount">
                    · {{ linkedMaterialsRuleCount }} por regra
                  </template>
                  <template v-if="linkedMaterials.length">
                    · {{ linkedMaterialsPageStart }}-{{ linkedMaterialsPageEnd }} de {{ linkedMaterials.length }} manuais
                  </template>
                </p>
              </div>
              <button
                v-if="canLinkMaterial && !addingMaterial"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-[var(--ds-primary-text)] rounded-lg transition-colors"
                @click="startMaterialAdd"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Adicionar material
              </button>
            </div>

            <div
              v-if="destinationMaterialRules.length"
              class="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 px-4 py-3"
            >
              <p class="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Regras automaticas</p>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="rule in destinationMaterialRules"
                  :key="ruleKey(rule)"
                  class="inline-flex items-center gap-2 rounded-lg bg-primary-50 px-2.5 py-1.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                >
                  {{ ruleLabel(rule) }}
                  <button
                    v-if="isLoggedIn"
                    type="button"
                    class="text-primary-400 hover:text-red-500 dark:text-primary-300 dark:hover:text-red-300"
                    title="Remover regra"
                    @click="removeMaterialRule(rule)"
                  >
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </span>
              </div>
            </div>

            <div v-if="linkedMaterials.length" class="divide-y divide-gray-100 dark:divide-gray-800">
              <div
                v-for="variation in paginatedLinkedMaterials"
                :key="variation.id"
                class="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{{ itemForVariation(variation)?.name || 'Item' }}</p>
                  <AttributeBadges
                    v-if="itemForVariation(variation)"
                    class="mt-1"
                    :item="itemForVariation(variation)"
                    :variation="variation"
                    compact
                  />
                  <p class="mt-1 text-xs text-gray-400 dark:text-gray-500 truncate">{{ materialMeta(variation) || 'Sem hierarquia' }}</p>
                </div>
                <div class="text-right flex-shrink-0">
                  <p class="text-xs text-gray-400 dark:text-gray-500">Estoque</p>
                  <p class="text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-100">{{ variation.stock }}</p>
                </div>
                <div class="text-right flex-shrink-0">
                  <p class="text-xs text-gray-400 dark:text-gray-500">Min.</p>
                  <p class="text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-100">{{ variation.minStock ?? '—' }}</p>
                </div>
                <button
                  v-if="isLoggedIn && isManualMaterialLinked(variation)"
                  class="p-1.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Remover vinculo"
                  @click="removeMaterialFromDestination(variation)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div
                v-if="linkedMaterialsTotalPages > 1"
                class="px-4 py-3 flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800/50"
              >
                <p class="text-xs text-gray-400 dark:text-gray-500">
                  Pagina {{ linkedMaterialsPage }} de {{ linkedMaterialsTotalPages }}
                </p>
                <div class="flex items-center gap-2">
                  <button
                    class="px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-400 dark:hover:border-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    :disabled="linkedMaterialsPage <= 1"
                    @click="goLinkedMaterialsPage(-1)"
                  >Anterior</button>
                  <button
                    class="px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-400 dark:hover:border-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    :disabled="linkedMaterialsPage >= linkedMaterialsTotalPages"
                    @click="goLinkedMaterialsPage(1)"
                  >Proxima</button>
                </div>
              </div>
            </div>

            <div v-else class="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              <template v-if="linkedMaterialsRuleCount">
                Materiais contabilizados pelas regras automaticas. Nenhum vinculo manual para listar.
              </template>
              <template v-else>
                Nenhum material manual vinculado a este destino.
              </template>
            </div>
          </section>
        </div>
      </template>
    </main>
  </div>

  <Teleport to="body">
    <div
      v-if="contextMenu"
      ref="contextMenuRef"
      role="menu"
      aria-label="Ações do destino"
      class="fixed z-[60] w-44 rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl dark:border-white/[0.08] dark:bg-gray-900"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @keydown="handleContextMenuKeydown"
      @contextmenu.prevent
    >
      <button
        ref="contextMenuFirstRef"
        type="button"
        role="menuitem"
        class="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 dark:hover:bg-white/[0.06] dark:focus:bg-white/[0.06]"
        @click="moveContextDestination"
      >Mover</button>
      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 dark:hover:bg-white/[0.06] dark:focus:bg-white/[0.06]"
        @click="renameContextDestination"
      >Renomear</button>
      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 focus:bg-red-50 focus:outline-none dark:text-red-300 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10"
        @click="deleteContextDestination"
      >Excluir</button>
    </div>
  </Teleport>

  <AppDialog
    v-if="movingDest"
    visible
    aria-label="Mover destino"
    @close="cancelMoveDest"
  >
      <div
        class="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div class="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <p class="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Mover destino</p>
          <h3 id="move-destination-title" class="mt-1 text-base font-semibold text-gray-800 dark:text-gray-100">{{ movingDest.name }}</h3>
        </div>
        <div class="space-y-3 px-5 py-4">
          <label for="move-destination-parent" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Novo destino pai</label>
          <select
            id="move-destination-parent"
            v-model="moveDestParentId"
            class="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            autofocus
            @keydown.escape="cancelMoveDest"
            @keydown.enter="confirmMoveDest"
          >
            <option value="">Sem destino pai (destino principal)</option>
            <option v-for="parent in moveParentOptions" :key="parent.id" :value="parent.id">{{ getDestFullName(parent.id) }}</option>
          </select>
        </div>
        <div class="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <button type="button" class="h-10 rounded-md bg-gray-100 px-4 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700" @click="cancelMoveDest">Cancelar</button>
          <button
            type="button"
            class="h-10 rounded-md bg-primary-600 px-4 text-sm font-semibold text-[var(--ds-primary-text)] hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="moveUnchanged"
            @click="confirmMoveDest"
          >Mover</button>
        </div>
      </div>
  </AppDialog>

  <AppDialog
    v-if="addingMaterial"
    visible
    aria-label="Adicionar materiais ao destino"
    @close="cancelMaterialAdd"
  >
      <div class="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Adicionar materiais</p>
            <p class="text-base font-semibold text-gray-800 dark:text-gray-100 truncate">{{ getDestFullName(selectedMaterialDestination?.id) }}</p>
          </div>
          <button
            class="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Fechar"
            @click="cancelMaterialAdd"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div class="p-5 border-b border-gray-100 dark:border-gray-800">
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 dark:text-gray-600 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" /></svg>
            <input
              v-model="materialSearch"
              placeholder="Buscar material, variacao ou categoria..."
              class="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              autofocus
              @keydown.escape="cancelMaterialAdd"
            />
          </div>
          <p class="mt-2 text-xs text-gray-400 dark:text-gray-500">
            {{ pendingMaterialIds.length }} {{ pendingMaterialIds.length === 1 ? 'material selecionado' : 'materiais selecionados' }}
          </p>
          <div class="mt-3 flex items-center gap-1.5 text-sm flex-wrap">
            <button
              class="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              @click="goMaterialRoot"
            >Catalogo</button>
            <template v-if="materialGroup">
              <svg class="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              <button
                class="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                :class="{ 'text-gray-800 dark:text-gray-100 no-underline': !materialCategory }"
                @click="goMaterialGroup"
              >{{ materialGroup }}</button>
            </template>
            <template v-if="materialCategory">
              <svg class="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              <button
                class="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                :class="{ 'text-gray-800 dark:text-gray-100 no-underline': !materialSubcategory }"
                @click="goMaterialCategory"
              >{{ materialCategory }}</button>
            </template>
            <template v-if="materialSubcategory">
              <svg class="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              <button
                class="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                :class="{ 'text-gray-800 dark:text-gray-100 no-underline': !selectedMaterialItem }"
                @click="goMaterialSubcategory"
              >{{ materialSubcategory }}</button>
            </template>
            <template v-if="selectedMaterialItem">
              <svg class="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              <span class="font-semibold text-gray-800 dark:text-gray-100">{{ selectedMaterialItem.name }}</span>
            </template>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-5">
          <div class="flex items-center justify-between mb-3">
            <p class="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{{ materialModalTitle }}</p>
            <div class="flex items-center gap-2 min-w-0">
              <p v-if="materialBreadcrumb.length" class="text-xs text-gray-400 dark:text-gray-500 truncate">{{ materialBreadcrumb.join(' > ') }}</p>
              <button
                v-if="currentScopeMaterialIds.length"
                type="button"
                class="shrink-0 rounded-lg bg-primary-100 px-3 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50"
                @click="toggleCurrentScopeMaterials"
              >
                {{ currentScopeRule ? currentScopeRuleSaved ? 'Remover regra' : 'Salvar regra' : allCurrentScopePending ? 'Remover nível' : 'Selecionar nível' }}
              </button>
            </div>
          </div>

          <div v-if="!materialGroup && materialGroups.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <button
              v-for="group in materialGroups"
              :key="group"
              type="button"
              class="group/block relative rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 text-left hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-sm transition-colors duration-100"
              @click="selectMaterialGroup(group)"
            >
              <p class="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{{ group }}</p>
              <p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {{ items.filter(item => item.group === group && itemHasAvailableVariation(item)).length }} itens
              </p>
            </button>
          </div>

          <div v-else-if="materialGroup && !materialCategory && materialCategories.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <button
              v-for="category in materialCategories"
              :key="category"
              type="button"
              class="group/block relative rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 text-left hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-sm transition-colors duration-100"
              @click="selectMaterialCategory(category)"
            >
              <p class="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{{ category }}</p>
              <p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {{ items.filter(item => item.group === materialGroup && item.category === category && itemHasAvailableVariation(item)).length }} itens
              </p>
            </button>
          </div>

          <div v-else-if="materialCategory && !materialSubcategory && materialSubcategories.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <button
              v-for="subcategory in materialSubcategories"
              :key="subcategory"
              type="button"
              class="group/block relative rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 text-left hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-sm transition-colors duration-100"
              @click="selectMaterialSubcategory(subcategory)"
            >
              <p class="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{{ subcategory }}</p>
              <p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {{ items.filter(item => item.group === materialGroup && item.category === materialCategory && item.subcategory === subcategory && itemHasAvailableVariation(item)).length }} itens
              </p>
            </button>
          </div>

          <div v-else-if="!selectedMaterialItem && materialItems.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              v-for="item in materialItems"
              :key="item.id"
              type="button"
              class="group/block relative rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 text-left hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-sm transition-colors duration-100"
              @click="selectMaterialItem(item.id)"
            >
              <p class="text-sm font-bold text-gray-800 dark:text-gray-100 line-clamp-2">{{ item.name }}</p>
              <p class="mt-2 text-xs text-gray-400 dark:text-gray-500 line-clamp-2">
                {{ [item.group, item.category, item.subcategory].filter(Boolean).join(' > ') || 'Sem hierarquia' }}
              </p>
              <p class="mt-3 text-[11px] text-gray-400 dark:text-gray-500">{{ availableVariationsForItem(item.id).length }} variacoes</p>
            </button>
          </div>

          <div v-else-if="selectedMaterialItem && selectedMaterialItemVariations.length" class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
            <button
              v-for="variation in selectedMaterialItemVariations"
              :key="variation.id"
              type="button"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              :class="isPendingMaterial(variation.id) ? 'bg-primary-50 dark:bg-primary-900/20' : ''"
              @click="togglePendingMaterial(variation.id)"
            >
              <span
                class="flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors"
                :class="isPendingMaterial(variation.id)
                  ? 'bg-primary-600 border-primary-600'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'"
              >
                <svg v-if="isPendingMaterial(variation.id)" class="w-3 h-3 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              </span>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{{ selectedMaterialItem.name }}</p>
                <AttributeBadges class="mt-1" :item="selectedMaterialItem" :variation="variation" compact />
                <p class="text-xs text-gray-400 dark:text-gray-500 truncate">{{ materialMeta(variation) || selectedMaterialItem.name }}</p>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <span class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  Estoque {{ variation.stock }}
                </span>
                <span
                  v-if="variation.minStock !== null && variation.minStock !== undefined"
                  class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                >
                  Min. {{ variation.minStock }}
                </span>
              </div>
            </button>
          </div>

          <p v-else class="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
            Nenhum material disponivel neste nivel.
          </p>
        </div>

        <div class="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
          <button
            class="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            @click="cancelMaterialAdd"
          >Cancelar</button>
          <button
            class="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-[var(--ds-primary-text)] hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!pendingMaterialIds.length"
            @click="savePendingMaterials"
          >Salvar vinculos</button>
        </div>
      </div>
  </AppDialog>
</template>

<style scoped>
button:not(:disabled) {
  cursor: pointer;
}
</style>
