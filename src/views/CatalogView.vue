<script setup>
import { ref, computed, watch, nextTick, inject } from 'vue'
import { stockAlertTransition, useItems } from '../composables/useItems.js'
import { useMovements } from '../composables/useMovements.js'
import { useToast } from '../composables/useToast.js'
import { useDestinations } from '../composables/useDestinations.js'
import { useLocations } from '../composables/useLocations.js'
import { useWorkOrders } from '../composables/useWorkOrders.js'
import { generateSeedData } from '../data/seedData.js'
import {
  emptyVariationForm,
  extrasListToObject,
  validateVariationForm,
  variationFormForItem,
} from '../utils/variationForm.js'
import VariationSheet from '../components/ui/VariationSheet.vue'
import AppDialog from '../components/ui/AppDialog.vue'
import AppButton from '../components/ui/AppButton.vue'
import { sortedAttributeNames, orderedAttributeNames } from '../utils/attributes.js'
import AppLink from '../components/ui/AppLink.vue'
import AiCatalogDialog from '../components/catalog/AiCatalogDialog.vue'

const isAdmin = inject('isAdmin')
const canOperate = inject('canOperate')

const props = defineProps({
  search: { type: String, default: '' },
  initialItemId: { type: String, default: '' },
  initialVariationId: { type: String, default: '' },
  initialHighlightVariationId: { type: String, default: '' },
})
const emit = defineEmits(['update:search', 'update:record', 'quick-movement', 'open-work-order'])

const {
  items, variations,
  activeGroup, activeCategory, activeSubcategory,
  uniqueGroups, setActiveGroup, setActiveCategory, setActiveSubcategory,
  groupItems, navigationItems,
  getVariationsForItem, addVariation, deleteVariation, getTotalStock,
  getCategoriesForGroup, getSubcategoriesForCategory,
  toggleFilter, clearFilters, setViewingItem,
  seedDatabase, resetAll
} = useItems()

const { success, error } = useToast()
const { movements, addMovement } = useMovements()
const { workOrders } = useWorkOrders()
const { activeDestinations, groupedDestinations, getDestinationName, getDestFullName } = useDestinations()
const { activeLocais, groupedLocais, getFullName } = useLocations()
const showSeedTools = import.meta.env.VITE_ENABLE_SEED_TOOLS === 'true'

// ===== Search =====
const searchQuery = computed({
  get: () => props.search,
  set: (v) => emit('update:search', v)
})
const searchNorm = ref(props.search.trim().toLowerCase())
watch(() => props.search, (value, _, onCleanup) => {
  const timer = setTimeout(() => { searchNorm.value = value.trim().toLowerCase() }, 250)
  onCleanup(() => clearTimeout(timer))
})

// Reset search only when user manually navigates (not auto-drill)
const autoDrilling = ref(false)

// Auto-drill triggered by Enter key from sidebar search
function triggerSearchDrill() {
  const q = props.search.trim().toLowerCase()
  if (!q) return
  searchNorm.value = q

  // Reset navigation to root first
  if (viewingItem.value) closeItem()
  setActiveSubcategory(null)
  setActiveCategory(null)
  setActiveGroup(null)

  autoDrilling.value = true
  nextTick(() => {
    // Drill into group
    if (searchedGroups.value.length === 1) {
      setActiveGroup(searchedGroups.value[0])
    } else { autoDrilling.value = false; return }

    nextTick(() => {
      // Drill into category
      if (groupCategories.value.length && searchedCategories.value.length === 1 && searchedGroupDirectItems.value.length === 0) {
        setActiveCategory(searchedCategories.value[0])
      } else if (searchedGroupDirectItems.value.length === 1 && searchedCategories.value.length === 0) {
        openItem(searchedGroupDirectItems.value[0]); autoDrilling.value = false; return
      } else if (!groupCategories.value.length && searchedGroupItems.value.length === 1) {
        openItem(searchedGroupItems.value[0]); autoDrilling.value = false; return
      } else { autoDrilling.value = false; return }

      nextTick(() => {
        // Drill into subcategory
        if (categorySubcategories.value.length && searchedSubcategories.value.length === 1) {
          setActiveSubcategory(searchedSubcategories.value[0])
        } else if (searchedCategoryDirectItems.value.length === 1 && searchedSubcategories.value.length === 0) {
          openItem(searchedCategoryDirectItems.value[0]); autoDrilling.value = false; return
        } else if (!categorySubcategories.value.length && searchedResults.value.length === 1) {
          openItem(searchedResults.value[0]); autoDrilling.value = false; return
        } else { autoDrilling.value = false; return }

        nextTick(() => {
          // Drill into item
          if (searchedResults.value.length === 1) {
            openItem(searchedResults.value[0])
          }
          autoDrilling.value = false
        })
      })
    })
  })
}

// Categories and subcategories for the current nav level
const groupCategories = computed(() =>
  activeGroup.value ? getCategoriesForGroup(activeGroup.value) : []
)
const categorySubcategories = computed(() =>
  activeGroup.value && activeCategory.value
    ? getSubcategoriesForCategory(activeGroup.value, activeCategory.value)
    : []
)

// Grid stat helpers
function categoryCount(cat) {
  return catalogIndex.value.categories.get(`${activeGroup.value}\0${cat}`)?.items.length || 0
}
function categoryStock(cat) {
  return catalogIndex.value.categories.get(`${activeGroup.value}\0${cat}`)?.stock || 0
}
function subcategoryCount(sub) {
  return catalogIndex.value.subcategories.get(`${activeGroup.value}\0${activeCategory.value}\0${sub}`)?.items.length || 0
}
function subcategoryStock(sub) {
  return catalogIndex.value.subcategories.get(`${activeGroup.value}\0${activeCategory.value}\0${sub}`)?.stock || 0
}

// ===== Item detail =====
const viewingItem = ref(null)
const varSearchQuery = ref('')
const varSearchNorm = computed(() => varSearchQuery.value.trim().toLowerCase())

// Close item when group or category changes
watch(() => activeGroup.value, () => { viewingItem.value = null; setViewingItem(null) })
watch(() => activeCategory.value, () => { viewingItem.value = null; setViewingItem(null) })

const highlightedVariationId = ref('')
const variationTable = ref(null)
watch(highlightedVariationId, async id => {
  if (!id) return
  await nextTick()
  requestAnimationFrame(() => variationTable.value?.querySelector('[data-catalog-highlight="true"]')?.scrollIntoView({ block: 'center' }))
}, { flush: 'post' })

function openItem(item, variationId = '', highlightVariationId = '') {
  viewingItem.value = item
  varSearchQuery.value = ''
  highlightedVariationId.value = getVariationsForItem(item.id).some(row => row.id === highlightVariationId) ? highlightVariationId : ''
  setViewingItem(item.id)
  emit('update:record', { itemId: item.id, variationId, highlightVariationId: highlightedVariationId.value })
}

function closeItem() {
  highlightedVariationId.value = ''
  viewingItem.value = null
  varSearchQuery.value = ''
  setViewingItem(null)
  emit('update:record', {})
}

function clearCatalogSearch() {
  searchNorm.value = ''
  searchQuery.value = ''
}

// Breadcrumb navigation
function goToGroup() {
  clearCatalogSearch()
  setActiveCategory(null)
  closeItem()
}

function goToCategory(category) {
  clearCatalogSearch()
  setActiveCategory(category)
  closeItem()
}

function goToSubcategory(category, subcategory) {
  clearCatalogSearch()
  setActiveCategory(category)
  setActiveSubcategory(subcategory)
  closeItem()
}

// Clear search when user explicitly navigates back to root
function goToRoot() {
  clearCatalogSearch()
  setActiveGroup(null)
  closeItem()
}

const itemVariations = computed(() => {
  if (!viewingItem.value) return []
  return getVariationsForItem(viewingItem.value.id)
})

const filteredItemVariations = computed(() => {
  if (!varSearchNorm.value) return itemVariations.value
  const q = varSearchNorm.value
  return itemVariations.value.filter(v => {
    if (Object.values(v.values || {}).some(val => (val || '').toLowerCase().includes(q))) return true
    if ((v.location || '').toLowerCase().includes(q)) return true
    const extras = v.extras || {}
    return Object.entries(extras).some(([k, val]) =>
      k.toLowerCase().includes(q) || (val || '').toLowerCase().includes(q)
    )
  })
})

const totalStock = computed(() => {
  if (!viewingItem.value) return 0
  return getTotalStock(viewingItem.value.id)
})

function itemHasVariationAlert(itemId) {
  return getVariationsForItem(itemId).some(v => v.minStock > 0 && v.stock <= v.minStock)
}

function itemStockClass(item, normalClass = 'text-gray-400 dark:text-gray-500') {
  const stock = getTotalStock(item.id)
  if (stock <= 0) return 'text-red-500 dark:text-red-400'
  if (itemHasVariationAlert(item.id)) return 'text-amber-500 dark:text-amber-400'
  return normalClass
}

const totalStockClass = computed(() =>
  viewingItem.value ? itemStockClass(viewingItem.value, 'text-green-600 dark:text-green-400') : ''
)

// ===== Variation CRUD =====
const addingVariation = ref(false)
const varForm = ref(emptyVariationForm())
const directVariationMode = ref(false)
const directVariationGroup = ref('')
const directVariationCategory = ref('')
const directVariationSubcategory = ref('')
const directVariationItemId = ref('')
const sheetVariationId = ref('')
const sheetInitialTab = ref('data')
const aiCatalogOpen = ref(false)
const aiCatalogSearchOpen = ref(false)
const sheetVariation = computed(() => itemVariations.value.find(v => v.id === sheetVariationId.value) || null)

const directVariationCategories = computed(() =>
  directVariationGroup.value ? getCategoriesForGroup(directVariationGroup.value) : []
)
const directVariationSubcategories = computed(() =>
  directVariationGroup.value && directVariationCategory.value
    ? getSubcategoriesForCategory(directVariationGroup.value, directVariationCategory.value)
    : []
)

function sameStructureName(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
}

function isHierarchyModelItem(item) {
  if (!item) return false
  if (variations.value.some(v => v.itemId === item.id)) return false
  if (!item.category && !item.subcategory && sameStructureName(item.name, item.group)) return true
  if (item.category && !item.subcategory && sameStructureName(item.name, item.category)) return true
  if (item.subcategory && sameStructureName(item.name, item.subcategory)) return true
  return false
}

const directVariationItems = computed(() => {
  if (!directVariationGroup.value) return []
  return items.value
    .filter(item => !isHierarchyModelItem(item))
    .filter(item => item.group === directVariationGroup.value)
    .filter(item => directVariationCategory.value ? item.category === directVariationCategory.value : !item.category)
    .filter(item => directVariationSubcategory.value ? item.subcategory === directVariationSubcategory.value : !item.subcategory)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true }))
})
const directVariationItem = computed(() =>
  directVariationItems.value.find(item => item.id === directVariationItemId.value) || null
)
const variationFormItem = computed(() =>
  directVariationMode.value ? directVariationItem.value : viewingItem.value
)

function syncDirectVariationSingleModel() {
  if (!directVariationMode.value) return
  const available = directVariationItems.value
  if (available.length === 1) {
    directVariationItemId.value = available[0].id
    return
  }
  if (directVariationItemId.value && !available.some(item => item.id === directVariationItemId.value)) {
    resetDirectVariationForm()
  }
}

function addExtraField() { varForm.value.extrasList.push({ key: '', value: '' }) }
function removeExtraField(i) { varForm.value.extrasList.splice(i, 1) }

function startAddVariation() {
  if (!viewingItem.value) return
  directVariationMode.value = false
  varForm.value = variationFormForItem(viewingItem.value)
  addingVariation.value = true
  nextTick(() => {
    const el = document.querySelector('.var-form-input')
    if (el) el.focus()
  })
}

function resetDirectVariationForm() {
  directVariationItemId.value = ''
  varForm.value = emptyVariationForm()
}

function startDirectVariation() {
  directVariationMode.value = true
  addingVariation.value = true
  directVariationGroup.value = activeGroup.value || ''
  directVariationCategory.value = activeCategory.value || ''
  directVariationSubcategory.value = activeSubcategory.value || ''
  resetDirectVariationForm()
  localDropOpen.value = false
  destsDropOpen.value = false
  nextTick(() => {
    const el = document.querySelector('.direct-variation-select')
    if (el) el.focus()
  })
}

function startAiCatalog() {
  aiCatalogOpen.value = true
}

function startAiCatalogSearch() {
  aiCatalogSearchOpen.value = true
}

async function onAiCatalogSaved(item, options = {}) {
  if (options.keepOpen) return
  aiCatalogOpen.value = false
  if (activeGroup.value !== (item.group || null)) setActiveGroup(item.group || null)
  setActiveCategory(item.category || null)
  setActiveSubcategory(item.subcategory || null)
  closeItem()
  await nextTick()
  openItem(item)
}

async function onAiCatalogFound(item, options = {}) {
  aiCatalogSearchOpen.value = false
  if (activeGroup.value !== (item.group || null)) setActiveGroup(item.group || null)
  setActiveCategory(item.category || null)
  setActiveSubcategory(item.subcategory || null)
  closeItem()
  await nextTick()
  openItem(item)
  if (options.variationId) {
    const variation = variations.value.find(row => row.id === options.variationId)
    if (variation) openVariationSheet(variation)
  }
}

function onDirectVariationGroupChange() {
  directVariationCategory.value = ''
  directVariationSubcategory.value = ''
  resetDirectVariationForm()
}

function onDirectVariationCategoryChange() {
  directVariationSubcategory.value = ''
  resetDirectVariationForm()
}

function onDirectVariationSubcategoryChange() {
  resetDirectVariationForm()
  syncDirectVariationSingleModel()
}

watch(directVariationItems, syncDirectVariationSingleModel)

watch(directVariationItem, item => {
  if (!directVariationMode.value || !item) return
  varForm.value = variationFormForItem(item)
  nextTick(() => {
    const el = document.querySelector('.var-form-input')
    if (el) el.focus()
  })
})

async function saveVariation() {
  const targetItem = variationFormItem.value
  if (!targetItem) {
    error('Selecione o modelo de item.')
    return
  }
  const validationError = validateVariationForm(targetItem, varForm.value)
  if (validationError) {
    error(validationError)
    return
  }
  const result = await addVariation(targetItem.id, varForm.value.values, varForm.value.stock, varForm.value.minStock, extrasListToObject(varForm.value.extrasList), varForm.value.location, varForm.value.destinations)
  if (!result.ok) { error(result.error); return }
  success('Variação adicionada!')
  if (directVariationMode.value) openItem(targetItem)
  addingVariation.value = false
  directVariationMode.value = false
}

function cancelVariation() {
  addingVariation.value = false
  directVariationMode.value = false
  localDropOpen.value = false
  destsDropOpen.value = false
  destsSearch.value = ''
}

// ===== Combobox dropdowns (Local + Destinos) =====
const localDropOpen = ref(false)
const destsDropOpen = ref(false)
const destsSearch = ref('')
const localDropStyle = ref({})
const destsDropStyle = ref({})

const localDisplayList = computed(() => {
  const list = []
  for (const g of groupedLocais.value) {
    const fullName = g.parent.name
    list.push({ id: g.parent.id, label: fullName, indent: false })
    for (const c of g.children) {
      list.push({ id: c.id, label: `${g.parent.name} > ${c.name}`, indent: true })
    }
  }
  return list
})

const localFilteredLocais = computed(() => {
  const q = (varForm.value.location || '').toLowerCase()
  if (!q) return localDisplayList.value
  return localDisplayList.value.filter(l => l.label.toLowerCase().includes(q))
})

const destDisplayList = computed(() => {
  const list = []
  for (const g of groupedDestinations.value) {
    list.push({ id: g.parent.id, label: g.parent.name, indent: false })
    for (const c of g.children) {
      list.push({ id: c.id, label: getDestFullName(c.id), indent: true })
    }
  }
  return list
})

const destsFiltered = computed(() => {
  const q = destsSearch.value.toLowerCase()
  if (!q) return destDisplayList.value
  return destDisplayList.value.filter(d => d.label.toLowerCase().includes(q))
})

function _rectStyle(el, minW = 0) {
  const r = el.getBoundingClientRect()
  return { position: 'fixed', top: (r.bottom + 4) + 'px', left: r.left + 'px', width: Math.max(r.width, minW) + 'px', zIndex: 9999 }
}

function openLocalDrop(inputEl) {
  if (!localDisplayList.value.length) return
  localDropStyle.value = _rectStyle(inputEl)
  localDropOpen.value = true
}

function openDestsDrop(inputEl) {
  if (!activeDestinations.value.length) return
  const wrapper = inputEl.closest('.dests-wrapper') || inputEl
  destsDropStyle.value = _rectStyle(wrapper, 220)
  destsDropOpen.value = true
}

function selectLocal(label) {
  varForm.value.location = label
  localDropOpen.value = false
}

function selectFirstLocal() {
  if (localDropOpen.value && localFilteredLocais.value.length) {
    selectLocal(localFilteredLocais.value[0].label)
  }
}

function toggleDest(id) {
  const idx = varForm.value.destinations.indexOf(id)
  if (idx === -1) varForm.value.destinations.push(id)
  else varForm.value.destinations.splice(idx, 1)
  destsSearch.value = ''
}

function selectFirstDest() {
  if (destsDropOpen.value && destsFiltered.value.length) {
    toggleDest(destsFiltered.value[0].id)
  }
}

function handleDestsBackspace() {
  if (destsSearch.value === '' && varForm.value.destinations.length) {
    varForm.value.destinations.pop()
  }
}

function closeAllDrops() {
  localDropOpen.value = false
  destsDropOpen.value = false
}

// ===== Variation Modal =====
const showVarModal = computed(() => addingVariation.value)
const varModalTitle = computed(() => directVariationMode.value ? 'Criar Variação' : 'Nova Variação')

function onDeleteVariation(v) {
  const label = Object.values(v.values).filter(Boolean).join(' / ') || 'esta variação'
  if (!confirm(`Excluir "${label}"?`)) return
  deleteVariation(v.id)
  success('Variação excluída.')
}

// ===== Overview helpers =====
const catalogIndex = computed(() => {
  const groups = new Map()
  const categories = new Map()
  const subcategories = new Map()

  function add(map, key, item, stock) {
    const entry = map.get(key) || { items: [], stock: 0 }
    entry.items.push(item)
    entry.stock += stock
    map.set(key, entry)
  }

  for (const item of items.value) {
    const stock = getTotalStock(item.id)
    add(groups, item.group, item, stock)
    if (item.category) add(categories, `${item.group}\0${item.category}`, item, stock)
    if (item.subcategory) add(subcategories, `${item.group}\0${item.category}\0${item.subcategory}`, item, stock)
  }
  return { groups, categories, subcategories }
})

function groupItemCount(g) {
  return catalogIndex.value.groups.get(g)?.items.length || 0
}

function groupStockTotal(g) {
  return catalogIndex.value.groups.get(g)?.stock || 0
}

// ===== Seed / Clear (dev-only UI, controlled by VITE_ENABLE_SEED_TOOLS) =====
const showSeedConfirm = ref(false)
const showClearConfirm = ref(false)

async function loadSeedData() {
  if (!showSeedTools) return
  const { items: seedItems, variations: seedVars, ...seedExtras } = generateSeedData()
  await seedDatabase(seedItems, seedVars, seedExtras)
  showSeedConfirm.value = false
  success(`Dados de teste carregados! ${seedItems.length} itens + ${seedVars.length} variações + históricos.`)
}

function openVariationSheet(v, initialTab = 'data') {
  sheetInitialTab.value = initialTab
  sheetVariationId.value = v.id
  emit('update:record', { itemId: v.itemId, variationId: v.id })
}

function openItemById(itemId, highlightVariationId = '') {
  const item = items.value.find(row => row.id === itemId)
  if (!item) return false
  if (activeGroup.value !== (item.group || null)) setActiveGroup(item.group || null)
  setActiveCategory(item.category || null)
  setActiveSubcategory(item.subcategory || null)
  nextTick(() => openItem(item, '', highlightVariationId))
  return true
}

function variationQueryText(variation) {
  return Object.values({ ...(variation.values || {}), ...(variation.extras || {}) })
    .filter(Boolean)
    .join(' ')
}

function openVariationById(variationId) {
  const variation = variations.value.find(row => row.id === variationId)
  if (!variation) return false
  const item = items.value.find(row => row.id === variation.itemId)
  if (!item) return false
  if (activeGroup.value !== (item.group || null)) setActiveGroup(item.group || null)
  setActiveCategory(item.category || null)
  setActiveSubcategory(item.subcategory || null)
  nextTick(() => {
    openItem(item, variationId)
    varSearchQuery.value = variationQueryText(variation)
    nextTick(() => openVariationSheet(variation))
  })
  return true
}

function closeVariationSheet() {
  sheetVariationId.value = ''
  sheetInitialTab.value = 'data'
  emit('update:record', { itemId: viewingItem.value?.id })
}

watch([() => props.initialItemId, () => props.initialVariationId, () => props.initialHighlightVariationId, items, variations], () => {
  if (props.initialVariationId) {
    if (sheetVariationId.value !== props.initialVariationId) openVariationById(props.initialVariationId)
  } else {
    sheetVariationId.value = ''
    if (props.initialItemId && (viewingItem.value?.id !== props.initialItemId || highlightedVariationId.value !== props.initialHighlightVariationId)) openItemById(props.initialItemId, props.initialHighlightVariationId)
    if (!props.initialItemId) { viewingItem.value = null; setViewingItem(null) }
  }
}, { immediate: true })

function quickSheetMovement(type) {
  if (!viewingItem.value || !sheetVariation.value || !(canOperate?.value ?? canOperate)) return
  emit('quick-movement', {
    type,
    itemId: viewingItem.value.id,
    variationId: sheetVariation.value.id,
    nonce: Date.now(),
  })
}

async function adjustSheetStock(delta) {
  if (!viewingItem.value || !sheetVariation.value || !(isAdmin?.value ?? isAdmin)) return
  const qty = Math.abs(delta)
  if (delta < 0 && sheetVariation.value.stockConfirmed !== false && sheetVariation.value.stock < qty) {
    error(`Estoque insuficiente. Disponível: ${sheetVariation.value.stock}`)
    return
  }
  const type = delta > 0 ? 'entrada' : 'saida'
  try {
    const movement = await addMovement(type, sheetVariation.value, viewingItem.value, qty, {
      supplier: '',
      requestedBy: '',
      destination: '',
      docRef: 'AJUSTE',
      note: 'Ajuste manual pela ficha da variação.',
    })
    const status = stockAlertTransition(movement, sheetVariation.value, viewingItem.value)
    if (status) error(status === 'zero'
      ? `${viewingItem.value.name} ficou sem estoque.`
      : `${viewingItem.value.name} entrou em alerta de estoque: ${movement.stockAfter} ${viewingItem.value.unit}.`
    )
    success(type === 'entrada' ? 'Entrada de ajuste registrada.' : 'Saída de ajuste registrada.')
  } catch (e) {
    error(e.message)
  }
}

function clearAllData() {
  if (!showSeedTools) return
  resetAll()
  showClearConfirm.value = false
  success('Todos os dados foram apagados.')
}

// Shared search helper — checks item name, hierarchy, location, attributes, variations & extras
function itemMatchesSearch(item, q) {
  if (item.name.toLowerCase().includes(q)) return true
  if ((item.category || '').toLowerCase().includes(q)) return true
  if ((item.subcategory || '').toLowerCase().includes(q)) return true
  if ((item.location || '').toLowerCase().includes(q)) return true
  const vars = getVariationsForItem(item.id)
  return vars.some(v =>
    Object.values(v.values || {}).some(val => (val || '').toLowerCase().includes(q)) ||
    (v.location || '').toLowerCase().includes(q) ||
    Object.entries(v.extras || {}).some(([k, val]) => k.toLowerCase().includes(q) || (val || '').toLowerCase().includes(q))
  )
}

// Search-filtered groups for overview
const searchedGroups = computed(() => {
  if (!searchNorm.value) return uniqueGroups.value
  const q = searchNorm.value
  return uniqueGroups.value.filter(g => {
    if (g.toLowerCase().includes(q)) return true
    const gItems = catalogIndex.value.groups.get(g)?.items || []
    return gItems.some(i => itemMatchesSearch(i, q))
  })
})

// Search-filtered categories for the category grid
const directSearchResults = computed(() => searchNorm.value
  ? items.value.filter(item => itemMatchesSearch(item, searchNorm.value) || (item.group || '').toLowerCase().includes(searchNorm.value))
  : [])

function searchCatalog(value) {
  if (value.trim() && viewingItem.value) closeItem()
  if (!value.trim()) searchNorm.value = ''
  searchQuery.value = value
}

const searchedCategories = computed(() => {
  if (!searchNorm.value) return groupCategories.value
  const q = searchNorm.value
  return groupCategories.value.filter(cat => {
    if (cat.toLowerCase().includes(q)) return true
    const catItems = catalogIndex.value.categories.get(`${activeGroup.value}\0${cat}`)?.items || []
    return catItems.some(i => itemMatchesSearch(i, q))
  })
})

// Search-filtered subcategories for the subcategory grid
const searchedSubcategories = computed(() => {
  if (!searchNorm.value) return categorySubcategories.value
  const q = searchNorm.value
  return categorySubcategories.value.filter(sub => {
    if (sub.toLowerCase().includes(q)) return true
    const subItems = catalogIndex.value.subcategories.get(`${activeGroup.value}\0${activeCategory.value}\0${sub}`)?.items || []
    return subItems.some(i => itemMatchesSearch(i, q))
  })
})

// Search-filtered items when no categories exist in a group
const searchedGroupItems = computed(() => {
  if (!searchNorm.value) return groupItems.value
  const q = searchNorm.value
  return groupItems.value.filter(item => itemMatchesSearch(item, q))
})

// Search-filtered direct models under the selected group.
const searchedGroupDirectItems = computed(() => {
  if (!activeGroup.value) return []
  const scoped = (catalogIndex.value.groups.get(activeGroup.value)?.items || [])
    .filter(item => !item.category && !item.subcategory)
    .filter(item => !isHierarchyModelItem(item))
  if (!searchNorm.value) return scoped
  const q = searchNorm.value
  return scoped.filter(item => itemMatchesSearch(item, q))
})

// Search-filtered direct models under the selected subgroup/family.
const searchedCategoryDirectItems = computed(() => {
  if (!activeGroup.value || !activeCategory.value) return []
  const scoped = (catalogIndex.value.categories.get(`${activeGroup.value}\0${activeCategory.value}`)?.items || [])
    .filter(item => !item.subcategory)
    .filter(item => !isHierarchyModelItem(item))
  if (!searchNorm.value) return scoped
  const q = searchNorm.value
  return scoped.filter(item => itemMatchesSearch(item, q))
})

// Search-filtered items at the current nav level
const searchedResults = computed(() => {
  if (!searchNorm.value) return navigationItems.value
  const q = searchNorm.value
  return navigationItems.value.filter(item => itemMatchesSearch(item, q))
})

// ===== Auto-drill is now triggered only on Enter (triggerSearchDrill) =====
defineExpose({ triggerSearchDrill, openItemById, openVariationById })
</script>

<template>
  <div class="relative">
    <div class="catalog-toolbar">
    <div class="ds-query-bar" role="search" aria-label="Busca de materiais">
      <input class="ds-query-input" type="search" aria-label="Buscar materiais" placeholder="Buscar material, medida, marca ou local…" :value="searchQuery" @input="searchCatalog($event.target.value)" />
      <AppButton v-if="searchQuery" variant="secondary" @click="searchCatalog('')">Limpar</AppButton>
    </div>
    <div v-if="isAdmin && !viewingItem" class="catalog-actions">
      <button
        class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        @click="startAiCatalogSearch"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35m0 0A7.5 7.5 0 1 0 6.05 6.05a7.5 7.5 0 0 0 10.6 10.6Z" />
        </svg>
        Pesquisar com IA
      </button>
      <AppButton
        variant="primary"
        size="md"
        @click="startAiCatalog"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 0 0 2.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
        </svg>
        Catalogar com IA
      </AppButton>
      <AppButton
        variant="primary"
        size="md"
        @click="startDirectVariation"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Criar Variação
      </AppButton>
    </div>
    </div>

    <!-- ===== 1. ITEM DETAIL (variations table) ===== -->
    <template v-if="searchNorm && !viewingItem">
      <h2 class="mb-3 text-lg font-semibold">Materiais encontrados ({{ directSearchResults.length }})</h2>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AppLink v-for="item in directSearchResults" :key="item.id" :target="{ tab: 'catalogo', itemId: item.id }" class="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 hover:bg-[var(--ds-active-bg)]" @navigate="openItemById(item.id)">
          <span class="block font-semibold">{{ item.name }}</span>
          <span class="mt-1 block text-xs text-[var(--ds-text-soft)]">{{ [item.group, item.category, item.subcategory].filter(Boolean).join(' › ') }}</span>
          <span class="mt-2 block text-sm">Estoque: {{ getTotalStock(item.id) }} {{ item.unit }}</span>
        </AppLink>
      </div>
      <p v-if="!directSearchResults.length" class="py-6 text-sm">Nenhum material encontrado. Tente outro nome, medida ou marca.</p>
    </template>
    <template v-else-if="viewingItem">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-1.5 text-sm mb-5 flex-wrap">
        <!-- Chevron separator -->
        <template v-for="(_, i) in [0]" :key="i">
          <!-- Catálogo root -->
          <button
            class="text-primary-600 dark:text-primary-400 hover:underline font-medium"
            @click="goToRoot()"
          >Catálogo</button>
          <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>

          <!-- Group -->
          <button
            class="text-primary-600 dark:text-primary-400 hover:underline font-medium"
            @click="goToGroup"
          >{{ viewingItem.group }}</button>

          <!-- Category -->
          <template v-if="viewingItem.category">
            <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
            <button
              class="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              @click="goToCategory(viewingItem.category)"
            >{{ viewingItem.category }}</button>
          </template>

          <!-- Subcategory -->
          <template v-if="viewingItem.subcategory">
            <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
            <button
              class="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              @click="goToSubcategory(viewingItem.category, viewingItem.subcategory)"
            >{{ viewingItem.subcategory }}</button>
          </template>

          <!-- Item name (current, not clickable) -->
          <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          <span class="text-gray-800 dark:text-gray-100 font-semibold">{{ viewingItem.name }}</span>
        </template>
      </div>

      <!-- Item header -->
      <div class="mb-5 flex flex-wrap items-center gap-3 sm:gap-4">
        <div class="w-12 h-12 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg class="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </div>
        <div class="min-w-[12rem] flex-1">
          <h2 class="break-words text-lg font-bold leading-tight text-gray-800 dark:text-gray-100 sm:text-xl">{{ viewingItem.name }}</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ viewingItem.unit }} &middot;
            <span class="font-semibold tabular-nums" :class="totalStockClass">
              Estoque: {{ totalStock }}
            </span>
          </p>
        </div>
        <!-- Variation search -->
        <div class="relative w-full sm:w-52">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            v-model="varSearchQuery"
            type="text"
            placeholder="Buscar variação..."
            class="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
          />
          <button
            v-if="varSearchQuery"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            @click="varSearchQuery = ''"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <button
          v-if="isAdmin"
          class="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-[var(--ds-primary-text)] transition-colors hover:bg-primary-800 dark:bg-primary-600 dark:hover:bg-primary-500 sm:w-auto sm:flex-shrink-0"
          @click="startAddVariation"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nova Variação
        </button>
      </div>

      <!-- Variations table — condensed -->
      <div class="ds-table-wrap">
        <div class="overflow-x-auto">
          <table ref="variationTable" class="ds-table min-w-full md:min-w-[760px]">
            <thead>
              <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th class="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300">Variação</th>
                <th class="w-16 px-2 py-2.5 text-center font-semibold text-gray-600 dark:text-gray-300 sm:w-20 sm:px-4">Qtd.</th>
                <th class="hidden text-center px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300 w-20 md:table-cell">Mín.</th>
                <th class="hidden text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300 md:table-cell">Local</th>
                <th class="hidden text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300 md:table-cell">Destinos</th>
                <th class="hidden text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300 md:table-cell">Obs.</th>
                <th v-if="isAdmin" class="w-24 px-2 py-2.5 text-center font-semibold text-gray-600 dark:text-gray-300 sm:px-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="v in filteredItemVariations"
                :key="v.id"
                :data-catalog-highlight="highlightedVariationId === v.id ? 'true' : undefined"
                :class="{ 'catalog-variation-highlight': highlightedVariationId === v.id }"
                class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                @click="openVariationSheet(v)"
              >
                <!-- Variation: attribute tags -->
                <td class="px-4 py-2.5">
                  <AppLink class="flex flex-wrap gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" :target="{ tab: 'catalogo', itemId: viewingItem.id, variationId: v.id }" @navigate="openVariationSheet(v)" @click.stop>
                    <span
                      v-for="attr in orderedAttributeNames(viewingItem)"
                      :key="attr"
                      class="ds-attribute-tag inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
                      :title="attr"
                    >
                      <span class="text-[10px] font-medium text-[var(--ds-text)]">{{ attr }}:</span>
                      {{ v.values[attr] || '—' }}
                    </span>
                  </AppLink>
                </td>
                <!-- Qtd -->
                <td
                  class="px-2 py-2.5 text-center tabular-nums font-medium sm:px-4"
                  :class="v.stock <= 0 ? 'text-red-500 dark:text-red-400' : (v.minStock > 0 && v.stock <= v.minStock) ? 'text-amber-500 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'"
                >
                  {{ v.stock }}
                  <span v-if="v.stock <= 0" class="ml-1 text-[10px]">&#x1F534;</span>
                  <span v-else-if="v.minStock > 0 && v.stock <= v.minStock" class="ml-1 text-[10px]">&#x1F7E1;</span>
                </td>
                <!-- Mín -->
                <td class="hidden px-4 py-2.5 text-center tabular-nums text-gray-500 dark:text-gray-400 md:table-cell">
                  {{ v.minStock ?? '—' }}
                </td>
                <!-- Local -->
                <td class="hidden px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 md:table-cell">
                  {{ v.location || viewingItem.location || '—' }}
                </td>
                <!-- Destinos (count + tooltip) -->
                <td class="hidden px-4 py-2.5 text-sm md:table-cell">
                  <span v-if="v.destinations && v.destinations.length" class="relative group/dests inline-flex items-center gap-1 cursor-default">
                    <span class="text-blue-600 dark:text-blue-400">{{ v.destinations.length }} {{ v.destinations.length === 1 ? 'destino' : 'destinos' }}</span>
                    <svg class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 group-hover/dests:text-blue-500 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
                    <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/dests:block z-20 px-3 py-2 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs shadow-lg whitespace-nowrap">
                      <span v-for="(dId, di) in v.destinations" :key="dId">{{ getDestinationName(dId) }}<template v-if="di < v.destinations.length - 1">, </template></span>
                    </span>
                  </span>
                  <span v-else class="text-gray-300 dark:text-gray-600">—</span>
                </td>
                <!-- Obs (count + tooltip) -->
                <td class="hidden px-4 py-2.5 text-sm md:table-cell">
                  <span v-if="v.extras && Object.keys(v.extras).length" class="relative group/obs inline-flex items-center gap-1 cursor-default">
                    <span class="text-amber-600 dark:text-amber-400">{{ Object.keys(v.extras).length }} {{ Object.keys(v.extras).length === 1 ? 'campo' : 'campos' }}</span>
                    <svg class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 group-hover/obs:text-amber-500 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
                    <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/obs:block z-20 px-3 py-2 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs shadow-lg whitespace-nowrap">
                      <span v-for="key in sortedAttributeNames(Object.keys(v.extras))" :key="key" class="block"><span class="text-gray-400">{{ key }}:</span> {{ v.extras[key] }}</span>
                    </span>
                  </span>
                  <span v-else class="text-gray-300 dark:text-gray-600">—</span>
                </td>
                <!-- Ações -->
                <td v-if="isAdmin" class="px-1 py-2.5 sm:px-4">
                  <div class="flex items-center justify-center gap-1">
                    <button class="p-1 text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors" title="Editar" @click.stop="openVariationSheet(v, 'edit')">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                    </button>
                    <button class="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="Excluir" @click.stop="onDeleteVariation(v)">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79" /></svg>
                    </button>
                  </div>
                </td>
              </tr>

              <!-- No search results -->
              <tr v-if="varSearchNorm && filteredItemVariations.length === 0 && !addingVariation">
                <td colspan="7" class="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  Nenhuma variação encontrada para "{{ varSearchQuery }}".
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Empty: no attributes -->
        <div v-if="!viewingItem.attributes?.length" class="px-6 py-8 text-center text-gray-400 dark:text-gray-500">
          <p class="text-sm">Este item não possui atributos definidos.</p>
          <p class="text-xs mt-1">Edite o item na hierarquia para adicionar atributos.</p>
        </div>
        <!-- Empty: no variations -->
        <div v-else-if="itemVariations.length === 0 && !addingVariation" class="px-6 py-8 text-center text-gray-400 dark:text-gray-500">
          <svg class="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
          </svg>
          <p class="text-sm">Nenhuma variação cadastrada.</p>
          <p class="text-xs mt-1">Clique em <strong>Nova Variação</strong> para adicionar.</p>
        </div>
      </div>
    </template>

    <!-- ===== 2A. CATEGORY GRID (group selected, no category yet) ===== -->
    <template v-else-if="activeGroup && !activeCategory">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-1.5 text-sm mb-4 flex-wrap">
        <button class="text-primary-600 dark:text-primary-400 hover:underline font-medium" @click="goToRoot()">Catálogo</button>
        <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
        <span class="text-gray-800 dark:text-gray-100 font-semibold">{{ activeGroup }}</span>
      </div>

      <!-- Count -->
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {{ (searchedCategories.length + searchedGroupDirectItems.length) || searchedGroupItems.length }}
        {{ ((searchedCategories.length + searchedGroupDirectItems.length) || searchedGroupItems.length) === 1 ? 'opção' : 'opções' }}
      </p>

      <!-- Category grid -->
      <div v-if="searchedCategories.length || searchedGroupDirectItems.length" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <button
          v-for="cat in searchedCategories"
          :key="cat"
          class="group text-left p-5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md transition-colors duration-100 cursor-pointer"
          @click="setActiveCategory(cat)"
        >
          <div class="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-3 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
            <svg class="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
          </div>
          <p class="text-sm font-bold text-gray-800 dark:text-gray-100 truncate mb-1">{{ cat }}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500">
            {{ categoryCount(cat) }} {{ categoryCount(cat) === 1 ? 'item' : 'itens' }}
            &middot; Estoque: {{ categoryStock(cat) }}
          </p>
        </button>

        <AppLink
          v-for="item in searchedGroupDirectItems"
          :key="item.id"
          class="group text-left p-5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md transition-colors duration-100 cursor-pointer"
          :target="{ tab: 'catalogo', itemId: item.id }" @navigate="openItem(item)"
        >
          <div class="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-3 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
            <svg class="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <p class="text-sm font-bold text-gray-800 dark:text-gray-100 truncate mb-1">{{ item.name }}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500">Estoque: {{ getTotalStock(item.id) }}</p>
        </AppLink>
      </div>

      <!-- No search results for categories -->
      <div v-else-if="searchNorm" class="text-center py-10 text-gray-400 dark:text-gray-500">
        <p class="text-sm">Nenhuma opção encontrada para "{{ searchQuery }}".</p>
      </div>

      <!-- No categories — show items directly -->
      <template v-else>
        <div v-if="searchedGroupItems.length" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <AppLink
            v-for="item in searchedGroupItems"
            :key="item.id"
            class="group text-left p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md transition-colors duration-100 cursor-pointer"
            :target="{ tab: 'catalogo', itemId: item.id }" @navigate="openItem(item)"
          >
            <p class="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate mb-1">{{ item.name }}</p>
            <p class="text-xs text-gray-400 dark:text-gray-500">Estoque: {{ getTotalStock(item.id) }}</p>
          </AppLink>
        </div>
        <div v-else-if="searchNorm" class="text-center py-10 text-gray-400 dark:text-gray-500">
          <p class="text-sm">Nenhum item encontrado para "{{ searchQuery }}".</p>
        </div>
      </template>
    </template>

    <!-- ===== 2B. SUBCATEGORY GRID (category selected, no subcategory yet) ===== -->
    <template v-else-if="activeGroup && activeCategory && !activeSubcategory">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-1.5 text-sm mb-4 flex-wrap">
        <button class="text-primary-600 dark:text-primary-400 hover:underline font-medium" @click="goToRoot()">Catálogo</button>
        <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
        <button class="text-primary-600 dark:text-primary-400 hover:underline font-medium" @click="goToGroup">{{ activeGroup }}</button>
        <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
        <span class="text-gray-800 dark:text-gray-100 font-semibold">{{ activeCategory }}</span>
      </div>

      <!-- Count -->
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {{ searchedCategoryDirectItems.length + searchedSubcategories.length }} {{ (searchedCategoryDirectItems.length + searchedSubcategories.length) === 1 ? 'opção' : 'opções' }}
      </p>

      <!-- Options at this level -->
      <div v-if="searchedCategoryDirectItems.length || searchedSubcategories.length" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <AppLink
            v-for="item in searchedCategoryDirectItems"
            :key="item.id"
            class="group text-left p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md transition-colors duration-100 cursor-pointer"
            :target="{ tab: 'catalogo', itemId: item.id }" @navigate="openItem(item)"
          >
            <div class="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-2 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
              <svg class="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            </div>
            <p class="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate mb-1">{{ item.name }}</p>
            <p class="text-xs text-gray-400 dark:text-gray-500">Estoque: {{ getTotalStock(item.id) }}</p>
          </AppLink>

          <button
            v-for="sub in searchedSubcategories"
            :key="sub"
            class="group text-left p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md transition-colors duration-100 cursor-pointer"
            @click="setActiveSubcategory(sub)"
          >
            <div class="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-2 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
              <svg class="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            </div>
            <p class="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate mb-1">{{ sub }}</p>
            <p class="text-xs text-gray-400 dark:text-gray-500">Estoque: {{ subcategoryStock(sub) }}</p>
          </button>
      </div>

      <!-- No search results at this category/subgroup level -->
      <div v-if="searchNorm && !searchedCategoryDirectItems.length && !searchedSubcategories.length" class="text-center py-10 text-gray-400 dark:text-gray-500">
        <p class="text-sm">Nenhuma opção encontrada para "{{ searchQuery }}".</p>
      </div>

      <!-- No subcategories and no direct-only split — show scoped items directly -->
      <template v-else-if="!categorySubcategories.length && !searchedCategoryDirectItems.length">
        <div v-if="searchedResults.length" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <AppLink
            v-for="item in searchedResults"
            :key="item.id"
            class="group text-left p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md transition-colors duration-100 cursor-pointer"
            :target="{ tab: 'catalogo', itemId: item.id }" @navigate="openItem(item)"
          >
            <p class="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate mb-1">{{ item.name }}</p>
            <p class="text-xs text-gray-400 dark:text-gray-500">Estoque: {{ getTotalStock(item.id) }}</p>
          </AppLink>
        </div>
        <div v-else-if="searchNorm" class="text-center py-10 text-gray-400 dark:text-gray-500">
          <p class="text-sm">Nenhum item encontrado para "{{ searchQuery }}".</p>
        </div>
      </template>
    </template>

    <!-- ===== 2C. ITEMS TABLE (subcategory selected) ===== -->
    <template v-else-if="activeGroup && activeCategory && activeSubcategory">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-1.5 text-sm mb-4 flex-wrap">
        <button class="text-primary-600 dark:text-primary-400 hover:underline font-medium" @click="goToRoot()">Catálogo</button>
        <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
        <button class="text-primary-600 dark:text-primary-400 hover:underline font-medium" @click="goToGroup">{{ activeGroup }}</button>
        <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
        <button class="text-primary-600 dark:text-primary-400 hover:underline font-medium" @click="goToCategory(activeCategory)">{{ activeCategory }}</button>
        <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
        <span class="text-gray-800 dark:text-gray-100 font-semibold">{{ activeSubcategory }}</span>
      </div>

      <!-- Count -->
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {{ searchedResults.length }} {{ searchedResults.length === 1 ? 'item' : 'itens' }}
      </p>

      <!-- Items grid -->
      <div v-if="searchedResults.length" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <AppLink
          v-for="item in searchedResults"
          :key="item.id"
          class="group text-left p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md transition-colors duration-100 cursor-pointer"
          :target="{ tab: 'catalogo', itemId: item.id }" @navigate="openItem(item)"
        >
          <div class="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-2 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/30 transition-colors">
            <svg class="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <p class="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate mb-1">{{ item.name }}</p>
          <p class="text-xs tabular-nums"
            :class="itemStockClass(item)">
            Estoque: {{ getTotalStock(item.id) }}
          </p>
        </AppLink>
      </div>

      <div v-else class="text-center py-16 text-gray-400 dark:text-gray-500">
        <p class="text-sm">Nenhum item encontrado.</p>
      </div>
    </template>

    <!-- ===== 3. OVERVIEW (no group selected) ===== -->
    <template v-else>
      <div class="flex min-h-10 items-center justify-between mb-6 gap-4">
        <h2 class="text-xl font-bold text-gray-800 dark:text-gray-100">Catálogo</h2>
        <div v-if="showSeedTools && isAdmin" class="flex items-center gap-2 ml-auto">
          <!-- Seed -->
          <div class="relative flex-shrink-0">
            <button
              v-if="!showSeedConfirm"
              class="px-3 py-2 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors flex items-center gap-1.5"
              @click="showSeedConfirm = true; showClearConfirm = false"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75" />
              </svg>
              Popular
            </button>
            <div v-else class="flex items-center gap-2">
              <span class="text-xs text-amber-600 dark:text-amber-400">Substituir tudo?</span>
              <button class="px-3 py-1.5 text-xs font-bold rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors" @click="loadSeedData">Sim</button>
              <button class="px-3 py-1.5 text-xs font-medium rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors" @click="showSeedConfirm = false">Não</button>
            </div>
          </div>

          <!-- Clear -->
          <div class="relative flex-shrink-0">
            <button
              v-if="!showClearConfirm"
              class="px-3 py-2 text-xs font-medium rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center gap-1.5"
              @click="showClearConfirm = true; showSeedConfirm = false"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
              Limpar
            </button>
            <div v-else class="flex items-center gap-2">
              <span class="text-xs text-red-600 dark:text-red-400">Apagar tudo?</span>
              <button class="px-3 py-1.5 text-xs font-bold rounded bg-[var(--ds-danger-solid)] text-white hover:bg-[var(--ds-danger-hover)] transition-colors" @click="clearAllData">Sim</button>
              <button class="px-3 py-1.5 text-xs font-medium rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors" @click="showClearConfirm = false">Não</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="searchedGroups.length" class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <button
          v-for="g in searchedGroups"
          :key="g"
          class="group text-left p-5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md transition-colors duration-100 cursor-pointer"
          @click="setActiveGroup(g)"
        >
          <div class="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-3 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
            <svg class="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
          </div>
          <p class="text-sm font-bold text-gray-800 dark:text-gray-100 truncate mb-1">{{ g }}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500">
            {{ groupItemCount(g) }} {{ groupItemCount(g) === 1 ? 'item' : 'itens' }}
            &middot; Estoque: {{ groupStockTotal(g) }}
          </p>
        </button>
      </div>

      <!-- No search results -->
      <div v-else-if="uniqueGroups.length && searchNorm" class="text-center py-10 text-gray-400 dark:text-gray-500">
        <p class="text-sm">Nenhum resultado encontrado para "{{ searchQuery }}".</p>
      </div>

      <!-- Empty state -->
      <div v-else class="text-center py-16 text-gray-400 dark:text-gray-500">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
        </svg>
        <p class="text-lg">Nenhum grupo encontrado.</p>
        <p class="text-sm mt-1">Cadastre itens na aba <strong>Cadastros</strong> para começar.</p>
      </div>
    </template>
  </div>

  <AiCatalogDialog
    v-if="aiCatalogOpen"
    @close="aiCatalogOpen = false"
    @saved="onAiCatalogSaved"
  />
  <AiCatalogDialog
    v-if="aiCatalogSearchOpen"
    mode="search"
    @close="aiCatalogSearchOpen = false"
    @found="onAiCatalogFound"
  />

  <VariationSheet
    v-if="viewingItem && sheetVariation"
    :item="viewingItem"
    :variation="sheetVariation"
    :movements="movements"
    :work-orders="workOrders"
    :can-manage="Boolean(canOperate?.value ?? canOperate)"
    :can-adjust="Boolean(isAdmin?.value ?? isAdmin)"
    :can-edit-details="Boolean(isAdmin?.value ?? isAdmin)"
    :initial-tab="sheetInitialTab"
    @close="closeVariationSheet"
    @quick-movement="quickSheetMovement"
    @adjust-stock="adjustSheetStock"
    @open-work-order="order => emit('open-work-order', order)"
  />

  <!-- ===== Variation Add/Edit Modal ===== -->
  <AppDialog
    v-if="showVarModal"
    visible
    aria-label="Adicionar ou editar variação"
    @close="cancelVariation"
  >
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" @click.stop>
        <h3 class="text-lg font-semibold text-primary-700 dark:text-primary-400 mb-5">
          {{ varModalTitle }}
        </h3>

        <div v-if="directVariationMode" class="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Modelo da variação</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">Grupo</label>
              <select
                v-model="directVariationGroup"
                class="direct-variation-select w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                @change="onDirectVariationGroupChange"
              >
                <option value="">Selecione...</option>
                <option v-for="group in uniqueGroups" :key="group" :value="group">{{ group }}</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">Família / subgrupo</label>
              <select
                v-model="directVariationCategory"
                class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                :disabled="!directVariationGroup"
                @change="onDirectVariationCategoryChange"
              >
                <option value="">Item direto no grupo</option>
                <option v-for="category in directVariationCategories" :key="category" :value="category">{{ category }}</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">Subnível opcional</label>
              <select
                v-model="directVariationSubcategory"
                class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                :disabled="!directVariationCategory"
                @change="onDirectVariationSubcategoryChange"
              >
                <option value="">Sem subnível</option>
                <option v-for="subcategory in directVariationSubcategories" :key="subcategory" :value="subcategory">{{ subcategory }}</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">Modelo de item</label>
              <select
                v-model="directVariationItemId"
                class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                :disabled="!directVariationGroup"
              >
                <option value="">Selecione...</option>
                <option v-for="item in directVariationItems" :key="item.id" :value="item.id">{{ item.name }}</option>
              </select>
            </div>
          </div>
          <p v-if="directVariationGroup && !directVariationItems.length" class="mt-3 text-xs text-amber-600 dark:text-amber-400">
            Nenhum modelo encontrado nesse nível da hierarquia.
          </p>
          <p v-else-if="variationFormItem" class="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {{ [variationFormItem.group, variationFormItem.category, variationFormItem.subcategory, variationFormItem.name].filter(Boolean).join(' > ') }}
          </p>
        </div>

        <template v-if="!directVariationMode || variationFormItem">
        <!-- Attributes -->
        <div v-if="variationFormItem?.attributes?.length" class="mb-4">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Atributos</label>
          <div class="grid grid-cols-2 gap-3">
            <div v-for="attr in orderedAttributeNames(variationFormItem)" :key="attr">
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">{{ attr }}</label>
              <input
                v-model="varForm.values[attr]"
                type="text"
                class="var-form-input w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                :placeholder="attr"
              />
            </div>
          </div>
        </div>

        <!-- Stock + Min Stock -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Quantidade</label>
            <input
              v-model.number="varForm.stock"
              type="number"
              min="0"
              placeholder="Não definido"
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Estoque Mín.</label>
            <input
              v-model.number="varForm.minStock"
              type="number"
              min="0"
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
          </div>
        </div>

        <!-- Location -->
        <div class="mb-4">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Local</label>
          <input
            v-model="varForm.location"
            type="text"
            placeholder="Digite ou selecione..."
            autocomplete="off"
            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            @focus="e => openLocalDrop(e.currentTarget)"
            @input="e => openLocalDrop(e.currentTarget)"
            @keydown.enter.prevent="selectFirstLocal"
            @keydown.escape.stop="localDropOpen ? (localDropOpen = false) : cancelVariation()"
          />
        </div>

        <!-- Destinations -->
        <div class="mb-4">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Destinos</label>
          <div
            class="dests-wrapper flex flex-wrap gap-1 items-center min-h-[38px] px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 cursor-text focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 transition-colors"
            @click="$event.currentTarget.querySelector('input')?.focus()"
          >
            <span
              v-for="dId in varForm.destinations"
              :key="dId"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs"
            >
              {{ getDestinationName(dId) }}
              <button type="button" class="hover:text-red-500" @click.stop="toggleDest(dId)">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </span>
            <input
              v-model="destsSearch"
              type="text"
              :placeholder="varForm.destinations.length ? '' : 'Destinos...'"
              autocomplete="off"
              class="flex-1 min-w-[60px] bg-transparent text-sm text-gray-800 dark:text-gray-100 outline-none placeholder-gray-400 py-0.5"
              @focus="e => openDestsDrop(e.currentTarget)"
              @input="e => openDestsDrop(e.currentTarget)"
              @keydown.enter.prevent="selectFirstDest"
              @keydown.escape.stop="destsDropOpen ? (destsDropOpen = false) : cancelVariation()"
              @keydown.backspace="handleDestsBackspace"
            />
          </div>
        </div>

        <!-- Extras (obs) -->
        <div class="mb-5">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Campos extras</label>
          <div class="flex flex-col gap-2">
            <div v-for="(e, i) in varForm.extrasList" :key="i" class="flex items-center gap-2">
              <input
                v-model="e.key"
                placeholder="Campo"
                class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              />
              <input
                v-model="e.value"
                placeholder="Valor"
                class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              />
              <button class="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded hover:bg-red-50 dark:hover:bg-red-900/20" @click="removeExtraField(i)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <button
              class="text-left text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 transition-colors font-medium"
              @click="addExtraField"
            >+ Adicionar campo</button>
          </div>
        </div>
        </template>

        <div v-else class="mb-5 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Selecione o grupo e o modelo de item para preencher os atributos da variação.
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button
            class="px-4 py-2 text-sm rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            @click="cancelVariation"
          >Cancelar</button>
          <button
            class="px-4 py-2 text-sm rounded-lg bg-primary-700 dark:bg-primary-600 text-[var(--ds-primary-text)] hover:bg-primary-800 dark:hover:bg-primary-500 transition-colors font-medium"
            :disabled="directVariationMode && !variationFormItem"
            :class="directVariationMode && !variationFormItem ? 'cursor-not-allowed opacity-60' : ''"
            @click="saveVariation"
          >{{ directVariationMode ? 'Criar variação' : 'Adicionar' }}</button>
        </div>
      </div>
  </AppDialog>

  <!-- Teleported combobox dropdowns — renders outside any overflow-hidden container -->
  <Teleport to="body">
    <!-- Transparent backdrop: click outside closes dropdowns -->
    <div v-if="localDropOpen || destsDropOpen" class="fixed inset-0" style="z-index:9998" @click="closeAllDrops" />

    <!-- Local suggestions (grouped) -->
    <div
      v-if="localDropOpen && localFilteredLocais.length"
      :style="[localDropStyle, { minWidth: 'max-content' }]"
      class="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl py-1 max-h-48 overflow-y-auto"
    >
      <button
        v-for="l in localFilteredLocais" :key="l.id"
        type="button"
        class="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 flex items-center gap-2"
        :class="l.indent ? 'pl-7' : 'font-medium'"
        @mousedown.prevent="selectLocal(l.label)"
      >
        <svg v-if="!l.indent" class="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
        <svg v-else class="w-3 h-3 flex-shrink-0 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
        {{ l.indent ? l.label.split(' > ').pop() : l.label }}
      </button>
    </div>

    <!-- Destinations multi-select -->
    <div
      v-if="destsDropOpen && destDisplayList.length"
      :style="destsDropStyle"
      class="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl overflow-hidden py-1 max-h-52 overflow-y-auto"
    >
      <button
        v-for="d in destsFiltered" :key="d.id"
        type="button"
        class="w-full flex items-center gap-2.5 py-1.5 hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer text-left"
        :class="d.indent ? 'pl-7 pr-3' : 'px-3'"
        @mousedown.prevent="toggleDest(d.id)"
      >
        <span
          class="flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors"
          :class="varForm.destinations.includes(d.id)
            ? 'bg-primary-600 border-primary-600'
            : 'border-gray-300 dark:border-gray-500'"
        >
          <svg v-if="varForm.destinations.includes(d.id)" class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
        </span>
        <svg v-if="!d.indent" class="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
        <svg v-else class="w-3 h-3 flex-shrink-0 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
        <span class="text-sm" :class="d.indent ? 'text-gray-700 dark:text-gray-200' : 'font-medium text-gray-800 dark:text-gray-100'">{{ d.indent ? d.label.split(' > ').pop() : d.label }}</span>
      </button>
      <p v-if="destsSearch && !destsFiltered.length" class="px-3 py-2 text-xs text-gray-400 italic">Nenhum resultado para "{{ destsSearch }}"</p>
    </div>
  </Teleport>
</template>

<style scoped>
.catalog-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.catalog-toolbar .ds-query-bar { flex: 1 1 280px; min-width: 0; margin-bottom: 0; }
.catalog-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.catalog-actions > * { flex-shrink: 0; white-space: nowrap; }
.ds-table tbody tr.catalog-variation-highlight, .ds-table tbody tr.catalog-variation-highlight:hover { background: var(--ds-active-bg); box-shadow: inset 3px 0 var(--ds-brand); }
@media (max-width: 640px) {
  .catalog-toolbar .ds-query-bar { flex-basis: 100%; }
}
</style>
