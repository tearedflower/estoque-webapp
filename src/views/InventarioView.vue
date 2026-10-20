<script setup>
import { ref, computed, nextTick, inject, watch } from 'vue'
import { useItems } from '../composables/useItems.js'
import { stockAlertStatus } from '../composables/useItems.js'
import { useMovements } from '../composables/useMovements.js'
import { useWorkOrders } from '../composables/useWorkOrders.js'
import { useDestinations } from '../composables/useDestinations.js'
import { useToast } from '../composables/useToast.js'
import FechamentosView from './FechamentosView.vue'
import VariationSheet from '../components/ui/VariationSheet.vue'
import AppButton from '../components/ui/AppButton.vue'
import AttributeBadges from '../components/ui/AttributeBadges.vue'
import { variationAttributeRows } from '../utils/attributes.js'
import AppLink from '../components/ui/AppLink.vue'
import AppDialog from '../components/ui/AppDialog.vue'
import EpiControlTab from '../components/inventario/EpiControlTab.vue'
import BulkVariationDialog from '../components/inventario/BulkVariationDialog.vue'
import { normalizeSearchText, searchTokens } from '../utils/globalSearch.js'

const props = defineProps({
  initialVariationId: { type: String, default: '' },
  initialSection: {
    type: String,
    default: 'estoque',
  },
  initialStatus: {
    type: String,
    default: 'all',
  },
  initialSearch: {
    type: String,
    default: '',
  },
})
const isAdmin = inject('isAdmin')
const isLoggedIn = inject('isLoggedIn')
const canOperate = inject('canOperate')
const canAccessClosings = computed(() => Boolean(isLoggedIn?.value ?? isLoggedIn))
const canAccessEpiControl = computed(() => Boolean(isLoggedIn?.value ?? isLoggedIn))
const emit = defineEmits(['quick-movement', 'open-work-order', 'navigate', 'update:section', 'update:status', 'update:search', 'update:variation'])

const { items, getVariationsForItem, getCategoriesForGroup, getSubcategoriesForCategory } = useItems()
const { movements, addMovement } = useMovements()
const { workOrders } = useWorkOrders()
const { getDestFullName } = useDestinations()
const { success, error } = useToast()
const inventorySections = ['estoque', 'epis', 'fechamentos']
const inventorySection = ref(inventorySections.includes(props.initialSection) ? props.initialSection : 'estoque')
const columnMenuOpen = ref(false)
const VISIBLE_COLUMNS_KEY = 'inventory_visible_columns'
const DEFAULT_VISIBLE_COLUMNS = {
  variation: true,
  location: true,
  destinations: false,
  current: true,
  min: false,
  status: true,
  history: false,
  adjust: true,
}

function loadVisibleColumns() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(VISIBLE_COLUMNS_KEY) || '{}')
    return Object.fromEntries(Object.entries(saved).filter(([key, value]) => key in DEFAULT_VISIBLE_COLUMNS && typeof value === 'boolean'))
  } catch {
    return {}
  }
}

const visibleColumns = ref({ ...DEFAULT_VISIBLE_COLUMNS, ...loadVisibleColumns() })

const columnOptions = computed(() => [
  { key: 'variation', label: 'Variação' },
  { key: 'location', label: 'Local' },
  { key: 'destinations', label: 'Destinos' },
  { key: 'current', label: 'Qtd. atual' },
  { key: 'min', label: 'Mín.' },
  { key: 'status', label: 'Status' },
  { key: 'history', label: 'Histórico por item' },
  ...((canOperate?.value ?? canOperate) ? [{ key: 'adjust', label: 'Ações rápidas' }] : []),
])

watch(() => props.initialSection, section => {
  if (section === 'epis' && !canAccessEpiControl.value) {
    inventorySection.value = 'estoque'
    return
  }
  if (section === 'fechamentos' && !canAccessClosings.value) {
    inventorySection.value = 'estoque'
    return
  }
  if (inventorySections.includes(section)) inventorySection.value = section
})

watch(canAccessClosings, allowed => {
  if (!allowed && inventorySection.value === 'fechamentos') inventorySection.value = 'estoque'
}, { immediate: true })

watch(canAccessEpiControl, allowed => {
  if (!allowed && inventorySection.value === 'epis') inventorySection.value = 'estoque'
}, { immediate: true })

watch(inventorySection, section => {
  emit('update:section', section)
})

function isColumnVisible(key) {
  return visibleColumns.value[key] !== false
}

function toggleColumn(key) {
  visibleColumns.value = {
    ...visibleColumns.value,
    [key]: !isColumnVisible(key),
  }
}

watch(visibleColumns, columns => {
  try {
    globalThis.localStorage?.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(columns))
  } catch {}
}, { deep: true })

// ===== Search =====
const searchQuery = ref(props.initialSearch || '')
const autoHierarchy = ref(null)
const activeHeaderSearch = ref('')
const locationHeaderSearch = ref('')
const destinationsHeaderSearch = ref('')
const locationHeaderSearchInput = ref(null)
const destinationsHeaderSearchInput = ref(null)

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

function compareText(a, b) {
  return collator.compare(String(a || ''), String(b || ''))
}

function rowVariationText(row) {
  const values = Object.entries(row.variation.values || {}).map(([key, value]) => `${key}: ${value}`)
  const extras = Object.entries(row.variation.extras || {}).map(([key, value]) => `${key}: ${value}`)
  return [...values, ...extras].filter(Boolean).join(' ')
}

function inventorySearchText(row) {
  return normalizeSearchText([
    row.item.name,
    row.item.group,
    row.item.category,
    row.item.subcategory,
    row.item.unit,
    row.item.location,
    inventoryLocation(row),
    inventoryDestinationsText(row),
    rowVariationText(row),
    ...Object.values(row.variation.values || {}),
    ...Object.entries(row.variation.extras || {}).flatMap(([key, value]) => [key, value]),
  ].filter(Boolean).join(' '))
}

function rowMatchesSearch(row, query) {
  const tokens = searchTokens(query)
  if (!tokens.length) return true
  const text = inventorySearchText(row)
  return tokens.every(token => text.includes(token))
}

function compareInventoryRows(a, b) {
  return compareText(a.item.group, b.item.group) ||
    compareText(a.item.category, b.item.category) ||
    compareText(a.item.subcategory, b.item.subcategory) ||
    compareText(a.item.name, b.item.name) ||
    compareText(rowVariationText(a), rowVariationText(b))
}

function compareItemColumn(a, b) {
  return compareText(a.item.name, b.item.name) ||
    compareText(rowVariationText(a), rowVariationText(b)) ||
    compareInventoryRows(a, b)
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0)
}

function compareStatus(a, b) {
  const order = { zero: 0, critical: 1, alert: 2, ok: 3 }
  return (order[a] ?? 99) - (order[b] ?? 99)
}

function inventoryLocation(row) {
  return row?.variation?.location || row?.item?.location || ''
}

function inventoryDestinations(row) {
  return (row?.variation?.destinations || [])
    .map(id => getDestFullName(id))
    .filter(Boolean)
}

function inventoryDestinationsText(row) {
  return inventoryDestinations(row).join(', ')
}

const searchNorm = computed(() => normalizeSearchText(searchQuery.value))
const locationHeaderSearchNorm = computed(() => normalizeSearchText(locationHeaderSearch.value))
const destinationsHeaderSearchNorm = computed(() => normalizeSearchText(destinationsHeaderSearch.value))

function toggleHeaderSearch(key) {
  activeHeaderSearch.value = activeHeaderSearch.value === key ? '' : key
  if (activeHeaderSearch.value === key) {
    nextTick(() => {
      const input = key === 'location' ? locationHeaderSearchInput.value : destinationsHeaderSearchInput.value
      input?.focus()
      input?.select()
    })
  }
}

function clearHeaderSearch(key) {
  if (key === 'location') locationHeaderSearch.value = ''
  if (key === 'destinations') destinationsHeaderSearch.value = ''
  if (activeHeaderSearch.value === key) activeHeaderSearch.value = ''
}

// ===== Pagination =====
const currentPage = ref(1)
const pageSize = ref(20)
const PAGE_SIZE_OPTIONS = [20, 40, 60, 100]
const sortKey = ref('item')
const sortDirection = ref('asc')

function compareSortColumn(a, b) {
  if (sortKey.value === 'variation') return compareText(rowVariationText(a), rowVariationText(b)) || compareInventoryRows(a, b)
  if (sortKey.value === 'location') return compareText(inventoryLocation(a), inventoryLocation(b)) || compareInventoryRows(a, b)
  if (sortKey.value === 'destinations') return compareText(inventoryDestinationsText(a), inventoryDestinationsText(b)) || compareInventoryRows(a, b)
  if (sortKey.value === 'current') return compareNumber(a.variation.stock, b.variation.stock) || compareInventoryRows(a, b)
  if (sortKey.value === 'min') return compareNumber(a.variation.minStock, b.variation.minStock) || compareInventoryRows(a, b)
  if (sortKey.value === 'status') return compareStatus(a.status, b.status) || compareInventoryRows(a, b)
  return compareItemColumn(a, b)
}

function sortRows(list) {
  const direction = sortDirection.value === 'desc' ? -1 : 1
  return [...list].sort((a, b) => compareSortColumn(a, b) * direction)
}

function setSort(key) {
  if (sortKey.value === key) sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.value = key
    sortDirection.value = 'asc'
  }
}

function sortArrow(key) {
  if (sortKey.value !== key) return ''
  return sortDirection.value === 'asc' ? '↑' : '↓'
}

// ===== Status filter =====
const inventoryStatusFilters = ['all', '', 'zero', 'critical', 'alert']
const filterStatus = ref(inventoryStatusFilters.includes(props.initialStatus) ? props.initialStatus : 'all')

watch(() => props.initialStatus, status => {
  if (inventoryStatusFilters.includes(status)) filterStatus.value = status
})

watch(filterStatus, status => {
  emit('update:status', status)
})

watch(() => props.initialSearch, search => {
  searchQuery.value = search || ''
})

watch(searchQuery, search => {
  emit('update:search', search || '')
})

// ===== Facet filters =====
const filterGroup = ref('')
const filterCategory = ref('')
const filterSubcategory = ref('')
const filterAttrValues = ref({}) // { [attrKey]: selectedValue }

// All rows regardless of status (for "Todas" tab)
const allRows = computed(() => {
  const rows = []
  for (const item of items.value) {
    const vars = getVariationsForItem(item.id)
    for (const v of vars) {
      const status = stockAlertStatus(v, item)
      rows.push({ variation: v, item, status })
    }
  }
  return rows.sort(compareInventoryRows)
})

// All alert rows (unfiltered)
const alertRows = computed(() => {
  const order = { zero: 0, critical: 1, alert: 2, ok: 3 }
  return allRows.value
    .filter(r => r.status !== 'ok')
    .slice()
    .sort((a, b) => order[a.status] - order[b.status] || compareInventoryRows(a, b))
})

// Base rows depending on active tab
const baseRows = computed(() => filterStatus.value === 'all' ? allRows.value : alertRows.value)

// After status + search only
const afterStatusSearch = computed(() => {
  let rows = baseRows.value
  if (filterStatus.value && filterStatus.value !== 'all')
    rows = rows.filter(r => r.status === filterStatus.value)
  if (searchNorm.value) {
    const q = searchNorm.value
    rows = rows.filter(r => rowMatchesSearch(r, q))
  }
  return rows
})

// Helper: apply attr filters to a row set, optionally skipping one key
function applyAttrFilters(rows, exceptKey = null) {
  const filters = Object.entries(filterAttrValues.value).filter(([k]) => k !== exceptKey)
  if (!filters.length) return rows
  return rows.filter(r =>
    filters.every(([key, val]) =>
      r.variation.values?.[key] === val || r.variation.extras?.[key] === val
    )
  )
}

function itemSubgroup(item) {
  return item.subcategory || item.name || ''
}

// After hierarchy filters
const afterHierarchy = computed(() => {
  let rows = afterStatusSearch.value
  if (filterGroup.value) rows = rows.filter(r => r.item.group === filterGroup.value)
  if (filterCategory.value) rows = rows.filter(r => r.item.category === filterCategory.value)
  if (filterSubcategory.value) rows = rows.filter(r => itemSubgroup(r.item) === filterSubcategory.value)
  return rows
})

// Fully filtered rows (all active filters)
const filteredRows = computed(() => {
  let rows = applyAttrFilters(afterHierarchy.value)
  if (locationHeaderSearchNorm.value) {
    const q = locationHeaderSearchNorm.value
    rows = rows.filter(r => normalizeSearchText(inventoryLocation(r)).includes(q))
  }
  if (destinationsHeaderSearchNorm.value) {
    const q = destinationsHeaderSearchNorm.value
    rows = rows.filter(r => normalizeSearchText(inventoryDestinationsText(r)).includes(q))
  }
  return rows
})
const sortedFilteredRows = computed(() => sortRows(filteredRows.value))
const selectedVariationIds = ref([])
const selectionMode = ref(false)
function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  selectedVariationIds.value = []
}
const bulkEdit = ref(null)
const selectedRows = computed(() => allRows.value.filter(row => selectedVariationIds.value.includes(row.variation.id)))
const allFilteredSelected = computed(() => filteredRows.value.length > 0 && filteredRows.value.every(row => selectedVariationIds.value.includes(row.variation.id)))
function selectFiltered(checked) {
  selectedVariationIds.value = checked ? filteredRows.value.map(row => row.variation.id) : []
}
function openBulkEdit(row = null, field = 'attribute', attribute = '') {
  if (row) selectedVariationIds.value = [row.variation.id]
  bulkEdit.value = { field, attribute }
}
watch([searchQuery, locationHeaderSearch, destinationsHeaderSearch, filterStatus, filterGroup, filterCategory, filterSubcategory, filterAttrValues, inventorySection], () => { selectedVariationIds.value = [] }, { deep: true })

// ===== Paginated rows =====
const totalPages = computed(() => Math.max(1, Math.ceil(sortedFilteredRows.value.length / pageSize.value)))
const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return sortedFilteredRows.value.slice(start, start + pageSize.value)
})

// Reset page when filters change
watch([searchQuery, locationHeaderSearch, destinationsHeaderSearch, filterStatus, filterGroup, filterCategory, filterSubcategory, filterAttrValues, pageSize, sortKey, sortDirection], () => {
  currentPage.value = 1
})

function clearAutoHierarchyIfOwned() {
  const auto = autoHierarchy.value
  if (!auto) return
  if (
    filterGroup.value === (auto.group || '') &&
    filterCategory.value === (auto.category || '') &&
    filterSubcategory.value === (auto.subcategory || '')
  ) {
    filterGroup.value = ''
    filterCategory.value = ''
    filterSubcategory.value = ''
  }
  autoHierarchy.value = null
}

function applyAutoHierarchy(next) {
  clearAutoHierarchyIfOwned()
  filterGroup.value = next.group || ''
  filterCategory.value = next.category || ''
  filterSubcategory.value = next.subcategory || ''
  autoHierarchy.value = {
    group: filterGroup.value,
    category: filterCategory.value,
    subcategory: filterSubcategory.value,
  }
}

function findHierarchySearchMatch(q) {
  if (!q) return null
  const rows = afterStatusSearch.value
  if (!rows.length) return null

  const uniqueGroups = new Set(rows.map(r => r.item.group || '').filter(Boolean))
  if (uniqueGroups.size !== 1) return null

  const group = [...uniqueGroups][0]
  const rowsInGroup = rows.filter(r => r.item.group === group)
  const uniqueCategories = new Set(rowsInGroup.map(r => r.item.category || '').filter(Boolean))
  const category = uniqueCategories.size === 1 ? [...uniqueCategories][0] : ''
  const rowsInCategory = category
    ? rowsInGroup.filter(r => r.item.category === category)
    : rowsInGroup
  const uniqueSubcategories = new Set(rowsInCategory.map(r => itemSubgroup(r.item)).filter(Boolean))
  const subcategory = category && uniqueSubcategories.size === 1 ? [...uniqueSubcategories][0] : ''

  return { group, category, subcategory }
}

watch(searchNorm, q => {
  const match = findHierarchySearchMatch(q)
  if (match) applyAutoHierarchy(match)
  else clearAutoHierarchyIfOwned()
})

// ---- Hierarchy facet options (each excludes its own filter, includes all others) ----
const facetGroups = computed(() => {
  let rows = afterStatusSearch.value
  if (filterCategory.value) rows = rows.filter(r => r.item.category === filterCategory.value)
  if (filterSubcategory.value) rows = rows.filter(r => itemSubgroup(r.item) === filterSubcategory.value)
  rows = applyAttrFilters(rows)
  return [...new Set(rows.map(r => r.item.group).filter(Boolean))].sort(compareText)
})

const facetCategories = computed(() => {
  let rows = afterStatusSearch.value
  if (filterGroup.value) rows = rows.filter(r => r.item.group === filterGroup.value)
  if (filterSubcategory.value) rows = rows.filter(r => itemSubgroup(r.item) === filterSubcategory.value)
  rows = applyAttrFilters(rows)
  return [...new Set(rows.map(r => r.item.category).filter(Boolean))].sort(compareText)
})

const facetSubcategories = computed(() => {
  let rows = afterStatusSearch.value
  if (filterGroup.value) rows = rows.filter(r => r.item.group === filterGroup.value)
  if (filterCategory.value) rows = rows.filter(r => r.item.category === filterCategory.value)
  rows = applyAttrFilters(rows)
  return [...new Set(rows.map(r => itemSubgroup(r.item)).filter(Boolean))].sort(compareText)
})

// ---- Attribute facet keys & values ----
// Keys: present in fully-filtered rows (+ currently active keys to keep them visible)
const facetAttrKeys = computed(() => {
  const rows = filteredRows.value
  const keys = new Set()
  for (const r of rows) {
    for (const k of (r.item.attributes || []))
      if (r.variation.values?.[k]) keys.add(k)
    for (const k of Object.keys(r.variation.extras || {}))
      if (r.variation.extras[k]) keys.add(k)
  }
  for (const k of Object.keys(filterAttrValues.value)) keys.add(k)
  return [...keys].sort(compareText)
})

// Values for key K: afterHierarchy with all attr filters EXCEPT K
function facetValuesForKey(key) {
  const rows = applyAttrFilters(afterHierarchy.value, key)
  const vals = new Set()
  for (const r of rows) {
    const v = r.variation.values?.[key] || r.variation.extras?.[key]
    if (v) vals.add(v)
  }
  return [...vals].sort(compareText)
}

// Pre-computed map of attr values per key (avoids calling the function in template on every render)
const facetAttrValueMap = computed(() => {
  const map = {}
  for (const key of facetAttrKeys.value) {
    map[key] = facetValuesForKey(key)
  }
  return map
})

// Is key an "extra" (not a template attr of any current item)?
const templateAttrKeys = computed(() => {
  const keys = new Set()
  for (const r of afterHierarchy.value)
    for (const k of (r.item.attributes || [])) keys.add(k)
  return keys
})

// ---- Setters ----
function setGroup(g) {
  autoHierarchy.value = null
  filterGroup.value = filterGroup.value === g ? '' : g
  filterCategory.value = ''
  filterSubcategory.value = ''
}
function setCategory(c) {
  autoHierarchy.value = null
  filterCategory.value = filterCategory.value === c ? '' : c
  filterSubcategory.value = ''
}
function setSubcategory(s) {
  autoHierarchy.value = null
  filterSubcategory.value = filterSubcategory.value === s ? '' : s
}
function setAttrValue(key, val) {
  const cur = filterAttrValues.value[key]
  const next = { ...filterAttrValues.value }
  if (cur === val) delete next[key]
  else next[key] = val
  filterAttrValues.value = next
}

function clearFacets() {
  autoHierarchy.value = null
  filterGroup.value = ''
  filterCategory.value = ''
  filterSubcategory.value = ''
  filterAttrValues.value = {}
}

const facetActive = computed(() =>
  filterGroup.value || filterCategory.value || filterSubcategory.value ||
  Object.keys(filterAttrValues.value).length > 0
)

const rowsForStatusCounts = computed(() => {
  let rows = allRows.value
  if (searchNorm.value) rows = rows.filter(row => rowMatchesSearch(row, searchNorm.value))
  if (filterGroup.value) rows = rows.filter(row => row.item.group === filterGroup.value)
  if (filterCategory.value) rows = rows.filter(row => row.item.category === filterCategory.value)
  if (filterSubcategory.value) rows = rows.filter(row => itemSubgroup(row.item) === filterSubcategory.value)
  rows = applyAttrFilters(rows)
  if (locationHeaderSearchNorm.value) rows = rows.filter(row => normalizeSearchText(inventoryLocation(row)).includes(locationHeaderSearchNorm.value))
  if (destinationsHeaderSearchNorm.value) rows = rows.filter(row => normalizeSearchText(inventoryDestinationsText(row)).includes(destinationsHeaderSearchNorm.value))
  return rows
})

const counts = computed(() => {
  const c = { zero: 0, critical: 0, alert: 0, alerts: 0, all: 0 }
  for (const r of rowsForStatusCounts.value) {
    if (r.status !== 'ok') { c[r.status]++; c.alerts++ }
    c.all++
  }
  return c
})

const showBody = computed(() => filterStatus.value === 'all' || alertRows.value.length > 0)

// ===== Inline stock adjust =====
const adjustingId = ref(null)
const adjustInput = ref(null)
const adjustValue = ref('')
const movementMenuId = ref(null)
const sheetRow = ref(null)

function startAdjust(varId, currentStock) {
  adjustingId.value = varId
  adjustValue.value = ''
  movementMenuId.value = null
  nextTick(() => adjustInput.value?.focus())
}

function quickMovement(row, type) {
  if (!(canOperate?.value ?? canOperate)) return
  movementMenuId.value = null
  emit('quick-movement', {
    type,
    itemId: row.item.id,
    variationId: row.variation.id,
    nonce: Date.now(),
  })
}

function toggleMovementMenu(varId) {
  movementMenuId.value = movementMenuId.value === varId ? null : varId
}

function cancelAdjust() {
  adjustingId.value = null
  adjustValue.value = ''
}

async function confirmAdjust(varId) {
  const val = Number(adjustValue.value)
  if (!isFinite(val) || isNaN(val) || val === 0) { error('Informe um ajuste diferente de zero.'); return }

  const delta = Math.round(val)
  if (delta === 0) { error('Informe um ajuste inteiro diferente de zero.'); return }

  const row = allRows.value.find(r => r.variation.id === varId)
  if (!row) { error('Variação não encontrada.'); return }

  const ok = await applyStockAdjustment(row, delta)
  if (!ok) return
  adjustingId.value = null
  adjustValue.value = ''
}

async function applyStockAdjustment(row, delta) {
  const qty = Math.abs(delta)
  if (delta < 0 && row.variation.stockConfirmed !== false && row.variation.stock < qty) {
    error(`Estoque insuficiente. Disponível: ${row.variation.stock}`)
    return false
  }

  const type = delta > 0 ? 'entrada' : 'saida'
  try {
    await addMovement(type, row.variation, row.item, qty, {
      supplier: '',
      requestedBy: '',
      destination: '',
      docRef: 'AJUSTE',
      note: 'Ajuste manual pelo inventário.',
    })
    success(type === 'entrada' ? 'Entrada de ajuste registrada.' : 'Saída de ajuste registrada.')
    return true
  } catch (e) {
    error(e.message)
    return false
  }
}

function onAdjustKeydown(e, varId) {
  if (e.key === 'Enter') confirmAdjust(varId)
  else if (e.key === 'Escape') cancelAdjust()
}

// ===== Variation movement history =====
const historyRow = ref(null)

const historyMovements = computed(() => {
  if (!historyRow.value) return []
  return movements.value
    .filter(m => m.variationId === historyRow.value.variation.id)
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
})

const historyTotals = computed(() => {
  const totals = { entradas: 0, saidas: 0, ajustes: 0, os: 0 }
  const osNumbers = new Set()
  for (const movement of historyMovements.value) {
    if (movement.type === 'entrada') totals.entradas += Number(movement.qty || 0)
    else totals.saidas += Number(movement.qty || 0)
    if (movement.docRef === 'AJUSTE') totals.ajustes += 1
    const order = workOrderFromMovement(movement)
    if (order?.number) osNumbers.add(order.number)
  }
  totals.os = osNumbers.size
  return totals
})

const historyLinkedDestinations = computed(() => {
  if (!historyRow.value) return []
  return (historyRow.value.variation.destinations || [])
    .map(id => ({ id, name: getDestFullName(id) }))
    .filter(dest => dest.name)
    .sort((a, b) => compareText(a.name, b.name))
})

const historyTimeline = computed(() =>
  historyMovements.value.map(movement => ({
    movement,
    order: workOrderFromMovement(movement),
    title: movementTimelineTitle(movement),
    subtitle: movementTimelineSubtitle(movement),
  }))
)

function openVariationHistory(row) {
  historyRow.value = row
}

function openVariationSheet(row) {
  sheetRow.value = row
  emit('update:variation', row.variation.id)
}

function closeVariationSheet() {
  sheetRow.value = null
  emit('update:variation', '')
}

function openSheetInCatalog() {
  if (!sheetRow.value) return
  const { item } = sheetRow.value
  emit('navigate', {
    tab: 'catalogo',
    itemId: item.id,
    group: item.group,
    category: item.category || '',
    subcategory: item.subcategory || '',
    clearSearch: true,
  })
}
watch([() => props.initialVariationId, allRows], () => {
  sheetRow.value = allRows.value.find(row => row.variation.id === props.initialVariationId) || null
}, { immediate: true })

function quickSheetMovement(type) {
  if (!sheetRow.value) return
  quickMovement(sheetRow.value, type)
}

async function adjustSheetStock(delta) {
  if (!sheetRow.value) return
  await applyStockAdjustment(sheetRow.value, delta)
}

function closeVariationHistory() {
  historyRow.value = null
}

function formatHistoryDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR')
}

function workOrderNumberFromMovement(movement) {
  const match = String(movement.docRef || movement.note || '').match(/OS\s*#\s*(\d+)/i)
  return match ? Number(match[1]) : null
}

function workOrderFromMovement(movement) {
  const number = workOrderNumberFromMovement(movement)
  if (!number) return null
  return workOrders.value.find(order => Number(order.number) === number) || null
}

function movementTimelineTitle(movement) {
  const orderNumber = workOrderNumberFromMovement(movement)
  if (orderNumber) return `Baixa por OS #${orderNumber}`
  if (movement.docRef === 'AJUSTE') return movement.type === 'entrada' ? 'Ajuste de entrada' : 'Ajuste de saída'
  return movement.type === 'entrada' ? 'Entrada avulsa' : 'Saída avulsa'
}

function movementTimelineSubtitle(movement) {
  const parts = []
  const responsible = movementResponsible(movement)
  const place = movementPlace(movement)
  if (responsible && responsible !== '-') parts.push(responsible)
  if (place && place !== '-') parts.push(place)
  if (movement.docRef && movement.docRef !== 'AJUSTE') parts.push(movement.docRef)
  return parts.join(' · ') || '-'
}

function movementResponsible(movement) {
  return movement.supplier || movement.requestedBy || '-'
}

function movementPlace(movement) {
  return movement.destination || movement.location || movement.note || '-'
}

function movementStock(movement) {
  const before = movement.stockBefore ?? movement.beforeStock
  const after = movement.stockAfter ?? movement.afterStock
  if (before === undefined || after === undefined) return '-'
  return `${before} -> ${after}`
}

// ===== Collapsible attr sections =====
const collapsedAttrs = ref({})

function toggleAttr(key) {
  collapsedAttrs.value[key] = collapsedAttrs.value[key] === false ? true : false
}
function isAttrCollapsed(key) {
  return collapsedAttrs.value[key] !== false
}

// Navigate back one level in the cascading hierarchy
function backToGroups() {
  autoHierarchy.value = null
  filterGroup.value = ''
  filterCategory.value = ''
  filterSubcategory.value = ''
  filterAttrValues.value = {}
}
function backToCategories() {
  autoHierarchy.value = null
  filterCategory.value = ''
  filterSubcategory.value = ''
  filterAttrValues.value = {}
}
function backToSubcategories() {
  autoHierarchy.value = null
  filterSubcategory.value = ''
  filterAttrValues.value = {}
}

// ===== Helpers =====
function hierarchyLabel(item) {
  return [item.group, item.category, item.subcategory].filter(Boolean).join(' › ')
}

const STATUS_CONFIG = {
  zero:     { label: 'Sem estoque', pillClass: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  critical: { label: 'Crítico',     pillClass: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' },
  alert:    { label: 'Alerta',      pillClass: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500' },
  ok:       { label: 'OK',          pillClass: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
}

const FILTER_TABS = [
  { id: 'all',      label: 'Todas',        countKey: 'all' },
  { id: '',         label: 'Com alertas',  countKey: 'alerts' },
  { id: 'zero',     label: 'Sem estoque',  countKey: 'zero' },
  { id: 'critical', label: 'Crítico',      countKey: 'critical' },
  { id: 'alert',    label: 'Alerta',       countKey: 'alert' },
]

const FILTER_COUNT_CLASS = {
  alerts:   'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  zero:     'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  critical: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
  alert:    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-500',
  all:      'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
}

// ===== CSV Export =====
const csvSelectedMonth = ref(new Date().getMonth() + 1)
const csvSelectedYear = ref(new Date().getFullYear())

const CSV_MONTHS = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
]

const csvYears = computed(() => {
  const cur = new Date().getFullYear()
  const years = []
  for (let y = cur; y >= cur - 5; y--) years.push(y)
  return years
})

function exportCSV() {
  const month = Number(csvSelectedMonth.value)
  const year = Number(csvSelectedYear.value)
  const from = new Date(year, month - 1, 1)
  const to = new Date(year, month, 1)
  const cutoffLabel = new Date(year, month, 0).toLocaleDateString('pt-BR')
  const monthTag = `${String(month).padStart(2, '0')}/${year}`

  // Pre-compute monthly movements per variation
  const monthMovs = {}
  const afterPeriodMovs = {}
  for (const m of movements.value) {
    const d = new Date(m.date)
    if (d >= from && d < to) {
      if (!monthMovs[m.variationId]) monthMovs[m.variationId] = { entradas: 0, saidas: 0 }
      if (m.type === 'entrada') monthMovs[m.variationId].entradas += m.qty
      else monthMovs[m.variationId].saidas += m.qty
    }
    if (d >= to) {
      if (!afterPeriodMovs[m.variationId]) afterPeriodMovs[m.variationId] = 0
      afterPeriodMovs[m.variationId] += m.type === 'entrada' ? m.qty : -m.qty
    }
  }

  const STATUS_LABEL = { zero: 'Zero', critical: 'Crítico', alert: 'Alerta', ok: 'OK' }
  const sep = ';'
  const header = ['Grupo', 'Categoria', 'Subcategoria', 'Item', 'Variação', 'Unidade', `Saldo em ${cutoffLabel}`, 'Estoque Atual', 'Estoque Mínimo', 'Status', `Entradas (${monthTag})`, `Saídas (${monthTag})`, 'Local', 'Destinos'].join(sep)

  const rows = sortedFilteredRows.value.map(row => {
    const attrs = []
    for (const k of (row.item.attributes || [])) {
      const v = row.variation.values?.[k]
      if (v) attrs.push(`${k}: ${v}`)
    }
    for (const [k, v] of Object.entries(row.variation.extras || {})) {
      if (v) attrs.push(`${k}: ${v}`)
    }
    const vm = monthMovs[row.variation.id] || { entradas: 0, saidas: 0 }
    const stockAtCutoff = row.variation.stock - (afterPeriodMovs[row.variation.id] || 0)
    return [
      row.item.group || '',
      row.item.category || '',
      row.item.subcategory || '',
      row.item.name,
      attrs.join(', '),
      row.item.unit || 'UN',
      stockAtCutoff,
      row.variation.stock,
      row.variation.minStock ?? '',
      STATUS_LABEL[row.status],
      vm.entradas,
      vm.saidas,
      inventoryLocation(row),
      inventoryDestinationsText(row),
    ].map(v => String(v).replace(/;/g, ',')).join(sep)
  })

  const bom = '\uFEFF'
  const csv = bom + header + '\n' + rows.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const fileTag = `${year}-${String(month).padStart(2, '0')}`
  a.download = `relatorio_estoque_${fileTag}.csv`
  a.click()
  URL.revokeObjectURL(url)
  success(`Relatório exportado: relatorio_estoque_${fileTag}.csv`)
}
</script>

<template>
  <div class="space-y-4">

    <!-- Header -->
    <div v-if="inventorySection !== 'epis'" class="ds-page-header">
      <div>
        <h1 class="ds-page-title">{{ inventorySection === 'fechamentos' ? 'Fechamentos mensais' : 'Controle de estoque' }}</h1>
        <p v-if="inventorySection === 'fechamentos'" class="ds-page-subtitle">
          Salve uma foto oficial do estoque no fim do mês selecionado, calculada a partir das movimentações.
        </p>
        <p v-else class="ds-page-subtitle">
          <template v-if="filterStatus === 'all'">
            Todas as variações cadastradas
            <span v-if="counts.all" class="ml-1 font-medium">({{ counts.all }})</span>
          </template>
          <template v-else>
            Variações que precisam de atenção
            <span v-if="alertRows.length" class="ml-1 font-medium">({{ alertRows.length }})</span>
          </template>
        </p>
      </div>
    </div>

    <div v-if="inventorySection !== 'epis'" class="ds-segmented">
      <AppLink
        :target="{ tab: 'inventario', section: 'estoque' }"
        class="ds-segmented-item"
        :class="inventorySection === 'estoque' ? 'ds-segmented-item-active' : ''"
        @navigate="inventorySection = 'estoque'"
      >
        Estoque
      </AppLink>
      <AppLink
        v-if="canAccessClosings"
        :target="{ tab: 'inventario', section: 'fechamentos' }"
        class="ds-segmented-item"
        :class="inventorySection === 'fechamentos' ? 'ds-segmented-item-active' : ''"
        @navigate="inventorySection = 'fechamentos'"
      >
        Fechamentos
      </AppLink>
    </div>

    <template v-if="inventorySection === 'estoque'">
    <!-- Status filters + CSV export -->
    <div class="ds-panel">
      <div class="flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
        <div class="ds-scroll-x flex w-full items-center gap-1 overflow-x-auto sm:w-auto">
          <button
            v-for="tab in FILTER_TABS"
            :key="tab.id"
            class="relative flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-sm font-medium transition-colors"
            :class="filterStatus === tab.id
              ? 'text-primary-700 dark:text-primary-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
            @click="filterStatus = tab.id"
          >
            {{ tab.label }}
            <span
              v-if="tab.id !== 'all' && tab.countKey && counts[tab.countKey]"
              class="rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
              :class="FILTER_COUNT_CLASS[tab.countKey]"
            >{{ counts[tab.countKey] }}</span>
            <span
              v-if="filterStatus === tab.id"
              class="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary-600 dark:bg-primary-400"
            ></span>
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="relative">
            <AppButton variant="ghost" size="sm" :aria-expanded="columnMenuOpen" @click="columnMenuOpen = !columnMenuOpen">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 5.25h16.5M3.75 9.75h16.5M3.75 14.25h16.5M3.75 18.75h16.5" />
              </svg>
              Mais detalhes
            </AppButton>
            <div
              v-if="columnMenuOpen"
              class="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-900"
            >
              <button
                v-for="column in columnOptions"
                :key="column.key"
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                @click="toggleColumn(column.key)"
              >
                <span
                  class="flex h-4 w-4 items-center justify-center rounded border"
                  :class="isColumnVisible(column.key)
                    ? 'border-primary-500 bg-primary-600 text-[var(--ds-primary-text)]'
                    : 'border-gray-300 dark:border-gray-600'"
                >
                  <svg v-if="isColumnVisible(column.key)" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </span>
                {{ column.label }}
              </button>
            </div>
          </div>
          <span class="hidden h-6 w-px bg-gray-200 dark:bg-gray-700 xl:block"></span>
          <select v-model="csvSelectedMonth" class="ds-input w-auto min-w-32">
            <option v-for="m in CSV_MONTHS" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <select v-model="csvSelectedYear" class="ds-input w-auto min-w-24">
            <option v-for="y in csvYears" :key="y" :value="y">{{ y }}</option>
          </select>
          <div class="relative">
            <AppButton variant="primary" size="sm" aria-describedby="csv-export-help" @click="exportCSV">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Exportar CSV
              <span class="group/help relative ml-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/40 bg-white/10 text-[11px] font-bold">
                <span aria-hidden="true">?</span>
                <span
                  id="csv-export-help"
                  role="tooltip"
                  class="pointer-events-none absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs font-normal leading-relaxed text-gray-700 opacity-0 shadow-xl transition-opacity group-hover/help:opacity-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                >
                  O CSV inclui os {{ sortedFilteredRows.length }} registros que correspondem aos filtros atuais, não apenas a página visível.
                </span>
              </span>
            </AppButton>
          </div>
        </div>
      </div>

    <!-- Empty: no alerts -->
    <div v-if="alertRows.length === 0 && filterStatus !== 'all'" class="flex flex-col items-center justify-center py-20 text-center">
      <svg class="w-12 h-12 text-green-300 dark:text-green-700 mb-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
      <p class="text-lg font-medium text-gray-600 dark:text-gray-300">Estoque em dia!</p>
      <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">Nenhuma variação com estoque baixo ou zerado.</p>
    </div>

    <!-- Body: facet sidebar + table -->
    <div v-if="showBody" class="flex flex-col items-stretch overflow-hidden rounded-b-xl border-t border-gray-200 dark:border-gray-700 md:flex-row md:items-start">

      <!-- ===== Facet sidebar ===== -->
      <div class="inventory-filter-sidebar max-h-56 w-full flex-shrink-0 self-stretch space-y-2 overflow-y-auto border-b border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800 md:max-h-none md:w-44 md:border-b-0 md:border-r">


        <!-- ===== Cascade: no group selected — show group list ===== -->
        <template v-if="!filterGroup">
          <ul class="space-y-0.5 mt-1">
            <li v-for="g in facetGroups" :key="g">
              <button
                class="w-full text-left px-2 py-1.5 rounded-md text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors truncate"
                @click="setGroup(g)"
              >{{ g }}</button>
            </li>
          </ul>
        </template>

        <!-- ===== Cascade: group selected, no category yet ===== -->
        <template v-else-if="filterGroup && !filterCategory">
          <button
            class="w-full text-left px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700/60 transition-colors flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 mb-1"
            @click="backToGroups"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Todos os Grupos
          </button>
          <p class="px-2 py-1 text-xs font-bold text-gray-800 dark:text-gray-100 truncate">{{ filterGroup }}</p>
          <ul class="space-y-0.5 mt-1">
            <li v-for="c in facetCategories" :key="c">
              <button
                class="w-full text-left px-2 py-1.5 rounded-md text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors truncate"
                @click="setCategory(c)"
              >{{ c }}</button>
            </li>
          </ul>
          <!-- Se não há categorias, mostra attr filters direto -->
          <template v-if="!facetCategories.length">
            <template v-for="(key, attrIndex) in facetAttrKeys" :key="key">
              <div v-if="(facetAttrValueMap[key] || []).length > 1 || filterAttrValues[key]" class="mt-1">
                <button
                  type="button"
                  class="w-full flex items-center justify-between gap-1 mb-1 group"
                  :aria-expanded="!isAttrCollapsed(key)"
                  :aria-controls="`inventory-group-attribute-${attrIndex}`"
                  @click="toggleAttr(key)"
                >
                  <span class="text-[10px] font-bold uppercase tracking-wider truncate flex items-center gap-1 min-w-0 transition-colors"
                    :class="filterAttrValues[key] ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'">
                    {{ key }}
                    <span v-if="!templateAttrKeys.has(key)" class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block flex-shrink-0" title="Atributo extra"></span>
                  </span>
                  <svg class="w-3 h-3 flex-shrink-0 transition-transform text-gray-400 dark:text-gray-500" :class="isAttrCollapsed(key) ? '' : 'rotate-180'" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7" /></svg>
                </button>
                <div
                  :id="`inventory-group-attribute-${attrIndex}`"
                  class="ds-collapse"
                  :class="{ 'ds-collapse-open': !isAttrCollapsed(key) }"
                >
                <ul class="space-y-0.5">
                  <li v-for="val in (facetAttrValueMap[key] || [])" :key="val">
                    <button class="w-full text-left px-2 py-1 rounded-md text-xs transition-colors truncate"
                      :class="filterAttrValues[key] === val ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-semibold' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
                      @click="setAttrValue(key, val)">{{ val }}</button>
                  </li>
                </ul>
                </div>
              </div>
            </template>
          </template>
        </template>

        <!-- ===== Cascade: category selected, no subcategory yet ===== -->
        <template v-else-if="filterGroup && filterCategory && !filterSubcategory">
          <button
            class="w-full text-left px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700/60 transition-colors flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 mb-1"
            @click="backToCategories"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            {{ filterGroup }}
          </button>
          <p class="px-2 py-1 text-xs font-bold text-gray-800 dark:text-gray-100 truncate">{{ filterCategory }}</p>
          <ul v-if="facetSubcategories.length" class="space-y-0.5 mt-1">
            <li v-for="s in facetSubcategories" :key="s">
              <button
                class="w-full text-left px-2 py-1.5 rounded-md text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors truncate"
                @click="setSubcategory(s)"
              >{{ s }}</button>
            </li>
          </ul>
          <!-- Se não há subcategorias, mostra attr filters direto -->
          <template v-if="!facetSubcategories.length">
            <template v-for="(key, attrIndex) in facetAttrKeys" :key="key">
              <div v-if="(facetAttrValueMap[key] || []).length > 1 || filterAttrValues[key]" class="mt-1">
                <button
                  type="button"
                  class="w-full flex items-center justify-between gap-1 mb-1 group"
                  :aria-expanded="!isAttrCollapsed(key)"
                  :aria-controls="`inventory-category-attribute-${attrIndex}`"
                  @click="toggleAttr(key)"
                >
                  <span class="text-[10px] font-bold uppercase tracking-wider truncate flex items-center gap-1 min-w-0 transition-colors"
                    :class="filterAttrValues[key] ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'">
                    {{ key }}
                    <span v-if="!templateAttrKeys.has(key)" class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block flex-shrink-0" title="Atributo extra"></span>
                  </span>
                  <svg class="w-3 h-3 flex-shrink-0 transition-transform text-gray-400 dark:text-gray-500" :class="isAttrCollapsed(key) ? '' : 'rotate-180'" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7" /></svg>
                </button>
                <div
                  :id="`inventory-category-attribute-${attrIndex}`"
                  class="ds-collapse"
                  :class="{ 'ds-collapse-open': !isAttrCollapsed(key) }"
                >
                <ul class="space-y-0.5">
                  <li v-for="val in (facetAttrValueMap[key] || [])" :key="val">
                    <button class="w-full text-left px-2 py-1 rounded-md text-xs transition-colors truncate"
                      :class="filterAttrValues[key] === val ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-semibold' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
                      @click="setAttrValue(key, val)">{{ val }}</button>
                  </li>
                </ul>
                </div>
              </div>
            </template>
          </template>
        </template>

        <!-- ===== Cascade: subcategory selected — show attr filters ===== -->
        <template v-else-if="filterGroup && filterCategory && filterSubcategory">
          <button
            class="w-full text-left px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700/60 transition-colors flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 mb-1"
            @click="backToSubcategories"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            {{ filterCategory }}
          </button>
          <p class="px-2 py-1 text-xs font-bold text-gray-800 dark:text-gray-100 truncate">{{ filterSubcategory }}</p>
          <button
            v-if="Object.keys(filterAttrValues).length"
            class="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1 px-1"
            @click="filterAttrValues = {}"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            Limpar filtros
          </button>
          <template v-for="(key, attrIndex) in facetAttrKeys" :key="key">
            <div v-if="(facetAttrValueMap[key] || []).length > 1 || filterAttrValues[key]" class="mt-1">
              <button
                type="button"
                class="w-full flex items-center justify-between gap-1 mb-1 group"
                :aria-expanded="!isAttrCollapsed(key)"
                :aria-controls="`inventory-subcategory-attribute-${attrIndex}`"
                @click="toggleAttr(key)"
              >
                <span class="text-[10px] font-bold uppercase tracking-wider truncate flex items-center gap-1 min-w-0 transition-colors"
                  :class="filterAttrValues[key] ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'">
                  {{ key }}
                  <span v-if="!templateAttrKeys.has(key)" class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block flex-shrink-0" title="Atributo extra"></span>
                </span>
                <svg class="w-3 h-3 flex-shrink-0 transition-transform text-gray-400 dark:text-gray-500" :class="isAttrCollapsed(key) ? '' : 'rotate-180'" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7" /></svg>
              </button>
              <div
                :id="`inventory-subcategory-attribute-${attrIndex}`"
                class="ds-collapse"
                :class="{ 'ds-collapse-open': !isAttrCollapsed(key) }"
              >
                <ul class="space-y-0.5">
                <li v-for="val in (facetAttrValueMap[key] || [])" :key="val">
                  <button class="w-full text-left px-2 py-1 rounded-md text-xs transition-colors truncate"
                    :class="filterAttrValues[key] === val ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-semibold' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
                    @click="setAttrValue(key, val)">{{ val }}</button>
                </li>
              </ul>
              </div>
            </div>
          </template>
        </template>

      </div>

      <!-- ===== Main area ===== -->
      <div class="flex-1 min-w-0 bg-white dark:bg-gray-900">

          <header class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 text-sm dark:border-gray-700">
            <div class="ds-query-bar !mb-0 min-w-0 flex-1 basis-64" role="search" aria-label="Busca no estoque">
              <input v-model="searchQuery" class="ds-query-input" type="search" aria-label="Buscar no estoque" placeholder="Buscar material, medida, marca ou local…" />
              <AppButton v-if="searchQuery" variant="secondary" size="sm" @click="searchQuery = ''">Limpar</AppButton>
            </div>
            <div v-if="isAdmin" class="flex flex-wrap items-center gap-3">
              <template v-if="selectionMode">
                <label class="flex items-center gap-2"><input type="checkbox" :checked="allFilteredSelected" @change="selectFiltered($event.target.checked)" /> Selecionar todos</label>
                <span v-if="selectedRows.length" class="font-medium">{{ selectedRows.length }} selecionadas</span>
                <AppButton size="sm" :disabled="!selectedRows.length" @click="openBulkEdit()">Editar seleção</AppButton>
                <button v-if="selectedRows.length" type="button" class="text-xs text-gray-500 hover:underline" @click="selectedVariationIds = []">Limpar seleção</button>
              </template>
              <AppButton variant="secondary" size="sm" :aria-pressed="selectionMode" @click="toggleSelectionMode">
                {{ selectionMode ? 'Cancelar seleção' : 'Selecionar itens' }}
              </AppButton>
            </div>
          </header>
        <!-- Keep search available when no rows match. -->
        <div v-if="filteredRows.length === 0" class="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
          Nenhum resultado para os filtros selecionados.
        </div>
        <div v-else>
          <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                <th v-if="isAdmin && selectionMode" class="w-10 px-3"><span class="sr-only">Selecionar variação</span></th>
                <th class="px-4 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider w-[200px]">
                  <button type="button" class="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer" @click="setSort('item')">
                    Item <span class="text-[10px]">{{ sortArrow('item') }}</span>
                  </button>
                </th>
                <th v-if="isColumnVisible('variation')" class="hidden px-4 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider md:table-cell">
                  <button type="button" class="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer" @click="setSort('variation')">
                    Variação <span class="text-[10px]">{{ sortArrow('variation') }}</span>
                  </button>
                </th>
                <th v-if="isColumnVisible('location')" class="hidden px-4 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider w-56 md:table-cell">
                  <div class="flex items-center gap-1.5">
                    <button
                      v-if="activeHeaderSearch !== 'location'"
                      type="button"
                      class="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer"
                      :title="locationHeaderSearch ? `Filtro de local: ${locationHeaderSearch}` : 'Ordenar por local'"
                      @click="setSort('location')"
                    >
                      <span class="max-w-28 truncate">{{ locationHeaderSearch || 'Local' }}</span>
                      <span class="text-[10px]">{{ sortArrow('location') }}</span>
                    </button>
                    <button
                      v-if="activeHeaderSearch !== 'location'"
                      type="button"
                      class="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                      :class="locationHeaderSearch
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-primary-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-primary-300'"
                      :title="locationHeaderSearch ? 'Limpar filtro de local' : 'Pesquisar local'"
                      @click.stop="locationHeaderSearch ? clearHeaderSearch('location') : toggleHeaderSearch('location')"
                    >
                      <svg v-if="!locationHeaderSearch" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
                      </svg>
                      <svg v-else class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                    <div v-if="activeHeaderSearch === 'location'" class="relative normal-case tracking-normal">
                      <input
                        ref="locationHeaderSearchInput"
                        v-model="locationHeaderSearch"
                        type="search"
                        placeholder="Filtrar local..."
                        class="w-32 rounded-md border border-gray-300 bg-white py-1 pl-2 pr-7 text-xs font-normal text-gray-800 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                        @click.stop
                        @keydown.enter.stop.prevent="activeHeaderSearch = ''"
                        @keydown.escape.stop="activeHeaderSearch = ''"
                      />
                      <button
                        type="button"
                        class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-red-500"
                        :title="locationHeaderSearch ? 'Limpar filtro de local' : 'Fechar busca'"
                        @click.stop="locationHeaderSearch ? clearHeaderSearch('location') : activeHeaderSearch = ''"
                      >
                        <svg class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                </th>
                <th v-if="isColumnVisible('destinations')" class="hidden px-4 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider w-72 md:table-cell">
                  <div class="flex items-center gap-1.5">
                    <button
                      v-if="activeHeaderSearch !== 'destinations'"
                      type="button"
                      class="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer"
                      :title="destinationsHeaderSearch ? `Filtro de destinos: ${destinationsHeaderSearch}` : 'Ordenar por destinos'"
                      @click="setSort('destinations')"
                    >
                      <span class="max-w-36 truncate">{{ destinationsHeaderSearch || 'Destinos' }}</span>
                      <span class="text-[10px]">{{ sortArrow('destinations') }}</span>
                    </button>
                    <button
                      v-if="activeHeaderSearch !== 'destinations'"
                      type="button"
                      class="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                      :class="destinationsHeaderSearch
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-primary-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-primary-300'"
                      :title="destinationsHeaderSearch ? 'Limpar filtro de destinos' : 'Pesquisar destinos'"
                      @click.stop="destinationsHeaderSearch ? clearHeaderSearch('destinations') : toggleHeaderSearch('destinations')"
                    >
                      <svg v-if="!destinationsHeaderSearch" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
                      </svg>
                      <svg v-else class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                    <div v-if="activeHeaderSearch === 'destinations'" class="relative normal-case tracking-normal">
                      <input
                        ref="destinationsHeaderSearchInput"
                        v-model="destinationsHeaderSearch"
                        type="search"
                        placeholder="Filtrar destino..."
                        class="w-40 rounded-md border border-gray-300 bg-white py-1 pl-2 pr-7 text-xs font-normal text-gray-800 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                        @click.stop
                        @keydown.enter.stop.prevent="activeHeaderSearch = ''"
                        @keydown.escape.stop="activeHeaderSearch = ''"
                      />
                      <button
                        type="button"
                        class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-red-500"
                        :title="destinationsHeaderSearch ? 'Limpar filtro de destinos' : 'Fechar busca'"
                        @click.stop="destinationsHeaderSearch ? clearHeaderSearch('destinations') : activeHeaderSearch = ''"
                      >
                        <svg class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                </th>
                <th v-if="isColumnVisible('current')" class="px-4 py-2.5 text-center font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider w-24">
                  <button type="button" class="inline-flex items-center justify-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer" @click="setSort('current')">
                    Qtd. atual <span class="text-[10px]">{{ sortArrow('current') }}</span>
                  </button>
                </th>
                <th v-if="isColumnVisible('min')" class="hidden px-4 py-2.5 text-center font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider w-20 md:table-cell">
                  <button type="button" class="inline-flex items-center justify-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer" @click="setSort('min')">
                    Mín. <span class="text-[10px]">{{ sortArrow('min') }}</span>
                  </button>
                </th>
                <th v-if="isColumnVisible('status')" class="hidden px-4 py-2.5 text-center font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider w-32 md:table-cell">
                  <button type="button" class="inline-flex items-center justify-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer" @click="setSort('status')">
                    Status <span class="text-[10px]">{{ sortArrow('status') }}</span>
                  </button>
                </th>
                <th v-if="isColumnVisible('history')" class="hidden px-4 py-2.5 text-center font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider w-28 md:table-cell">Histórico</th>
                <th v-if="canOperate && isColumnVisible('adjust')" class="hidden px-4 py-2.5 text-center font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider w-44 md:table-cell">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr
                v-for="(row, rowIndex) in paginatedRows"
                :key="row.variation.id"
                class="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors cursor-pointer"
                @click="openVariationSheet(row)"
              >
                <td v-if="isAdmin && selectionMode" class="px-3 py-3" @click.stop><input v-model="selectedVariationIds" type="checkbox" :value="row.variation.id" :aria-label="`Selecionar ${row.item.name}, ${Object.values(row.variation.values || {}).filter(Boolean).join(', ')}`" /></td>
                <!-- Item -->
                <td class="px-3 py-3 md:px-4">
                  <AppLink class="font-medium text-gray-800 dark:text-gray-100 leading-snug hover:underline" :target="{ tab: 'inventario', variationId: row.variation.id }" @navigate="openVariationSheet(row)" @click.stop>{{ row.item.name }}</AppLink>
                  <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{{ hierarchyLabel(row.item) }}</p>
                  <p class="mt-1 line-clamp-2 text-[11px] leading-tight text-gray-500 dark:text-gray-400 md:hidden">
                    {{ variationAttributeRows(row.item, row.variation).map(attribute => attribute.value).join(' · ') || 'Variação única' }}
                  </p>
                </td>

                <!-- Variação: attribute pills -->
                <td v-if="isColumnVisible('variation')" class="hidden px-4 py-3 md:table-cell">
                  <div class="flex flex-wrap gap-1">
                    <template v-for="attribute in variationAttributeRows(row.item, row.variation, true)" :key="`${attribute.extra}:${attribute.key}`">
                      <span
                        v-if="String(attribute.value ?? '').trim()"
                        class="ds-attribute-tag inline-flex items-center gap-0.5 rounded border px-2 py-0.5 text-[11px]"
                      >
                        <span class="font-medium">{{ attribute.key }}:</span>
                        <span>{{ attribute.value }}</span>
                      </span>
                      <button v-else-if="isAdmin && !attribute.extra" type="button" class="rounded border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-500 hover:border-primary-500 hover:text-primary-600 dark:border-gray-600" @click.stop="openBulkEdit(row, 'attribute', attribute.key)">{{ attribute.key }}: preencher</button>
                    </template>
                    <!-- Fallback -->
                    <span
                      v-if="!Object.values(row.variation.values || {}).some(Boolean) && !Object.values(row.variation.extras || {}).some(Boolean)"
                      class="text-gray-300 dark:text-gray-600 text-xs"
                    >—</span>
                  </div>
                </td>

                <!-- Local -->
                <td v-if="isColumnVisible('location')" class="hidden px-4 py-3 md:table-cell">
                  <span v-if="inventoryLocation(row)" class="text-sm text-gray-600 dark:text-gray-300">{{ inventoryLocation(row) }}</span>
                  <button v-else-if="isAdmin" type="button" class="text-xs text-primary-600 hover:underline" @click.stop="openBulkEdit(row, 'locations')">Definir local</button>
                  <span v-else class="text-xs text-gray-300 dark:text-gray-600">—</span>
                </td>

                <!-- Destinos -->
                <td v-if="isColumnVisible('destinations')" class="hidden px-4 py-3 md:table-cell">
                  <div v-if="inventoryDestinations(row).length" class="flex flex-wrap gap-1">
                    <span
                      v-for="dest in inventoryDestinations(row).slice(0, 2)"
                      :key="dest"
                      class="inline-flex max-w-[10rem] items-center rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      :title="dest"
                    >
                      <span class="truncate">{{ dest }}</span>
                    </span>
                    <span
                      v-if="inventoryDestinations(row).length > 2"
                      class="inline-flex rounded bg-primary-50 px-2 py-0.5 text-[11px] text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                      :title="inventoryDestinationsText(row)"
                    >
                      +{{ inventoryDestinations(row).length - 2 }}
                    </span>
                  </div>
                  <button v-else-if="isAdmin" type="button" class="text-xs text-primary-600 hover:underline" @click.stop="openBulkEdit(row, 'destinations')">Definir destinos</button>
                  <span v-else class="text-xs text-gray-300 dark:text-gray-600">—</span>
                </td>

                <!-- Qtd atual -->
                <td v-if="isColumnVisible('current')" class="px-4 py-3 text-center">
                  <span
                    class="text-base font-semibold"
                    :class="row.status === 'zero'
                      ? 'text-red-600 dark:text-red-400'
                      : row.status === 'critical'
                        ? 'text-orange-600 dark:text-orange-400'
                        : row.status === 'alert'
                          ? 'text-yellow-600 dark:text-yellow-500'
                          : 'text-green-600 dark:text-green-400'"
                  >{{ row.variation.stock }}</span>
                  <span class="text-xs text-gray-400 dark:text-gray-500 ml-1">{{ row.item.unit }}</span>
                </td>

                <!-- Mín. -->
                <td v-if="isColumnVisible('min')" class="hidden px-4 py-3 text-center md:table-cell">
                  <span class="tabular-nums text-gray-600 dark:text-gray-400">{{ row.variation.minStock ?? '—' }}</span>
                </td>

                <!-- Status pill -->
                <td v-if="isColumnVisible('status')" class="hidden px-4 py-3 text-center md:table-cell">
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    :class="STATUS_CONFIG[row.status].pillClass"
                  >{{ STATUS_CONFIG[row.status].label }}</span>
                </td>

                <!-- Histórico -->
                <td v-if="isColumnVisible('history')" class="hidden px-4 py-3 text-center md:table-cell">
                  <button
                    class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    @click.stop="openVariationHistory(row)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    Histórico
                  </button>
                </td>

                <!-- Ações rápidas -->
                <td v-if="canOperate && isColumnVisible('adjust')" class="hidden px-4 py-3 text-center md:table-cell">
                  <div v-if="adjustingId === row.variation.id" class="flex items-center justify-center gap-1">
                    <input
                      :ref="el => { adjustInput = el }"
                      v-model="adjustValue"
                      type="number"
                      step="1"
                      placeholder="+/-"
                      class="w-16 px-2 py-1 text-center text-sm border border-primary-400 dark:border-primary-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      @click.stop
                      @keydown="onAdjustKeydown($event, row.variation.id)"
                    />
                    <button
                      class="p-1 rounded text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors cursor-pointer"
                      title="Confirmar"
                      @click.stop="confirmAdjust(row.variation.id)"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </button>
                    <button
                      class="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                      title="Cancelar"
                      @click.stop="cancelAdjust"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div v-else class="relative flex items-center justify-center gap-1.5">
                    <button
                      v-if="isAdmin"
                      class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                      title="Corrigir saldo manualmente"
                      @click.stop="startAdjust(row.variation.id, row.variation.stock)"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                    <div class="ds-split-action rounded-lg">
                      <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-[7px] bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        title="Movimentação"
                        :aria-expanded="movementMenuId === row.variation.id"
                        @click.stop="toggleMovementMenu(row.variation.id)"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 7.5h9m0 0-3-3m3 3-3 3M16.5 16.5h-9m0 0 3 3m-3-3 3-3" />
                        </svg>
                      </button>
                    </div>
                    <div
                      v-if="movementMenuId === row.variation.id"
                      class="absolute right-0 z-20 w-32 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
                      :class="rowIndex >= paginatedRows.length - 2 ? 'bottom-9' : 'top-9'"
                    >
                      <button
                        type="button"
                        class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors cursor-pointer"
                        @click.stop="quickMovement(row, 'entrada')"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m0-15 6 6m-6-6-6 6" />
                        </svg>
                        Entrada
                      </button>
                      <button
                        type="button"
                        class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                        @click.stop="quickMovement(row, 'saida')"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 19.5v-15m0 15-6-6m6 6 6-6" />
                        </svg>
                        Saída
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          </div>

          <!-- Pagination controls -->
          <div class="flex flex-col gap-3 border-t border-gray-200 bg-gray-50/50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/40 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <!-- Page size selector -->
            <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>Exibir</span>
              <select
                v-model.number="pageSize"
                class="px-2 py-1 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-primary-500 transition-colors text-xs"
              >
                <option v-for="opt in PAGE_SIZE_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
              </select>
              <span>por página</span>
              <span class="text-gray-400 dark:text-gray-500 ml-2">
                {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, sortedFilteredRows.length) }} de {{ sortedFilteredRows.length }}
              </span>
            </div>

            <!-- Page navigation -->
            <div class="flex w-full items-center justify-center gap-1 sm:w-auto">
              <button
                class="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 transition-colors dark:border-gray-600 dark:text-gray-400"
                :class="currentPage <= 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'"
                :disabled="currentPage <= 1"
                @click="currentPage = 1"
                title="Primeira página"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m18.75 19.5-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" /></svg>
              </button>
              <button
                class="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 transition-colors dark:border-gray-600 dark:text-gray-400"
                :class="currentPage <= 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'"
                :disabled="currentPage <= 1"
                @click="currentPage--"
                title="Página anterior"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              </button>

              <span class="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200">
                {{ currentPage }} / {{ totalPages }}
              </span>

              <button
                class="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 transition-colors dark:border-gray-600 dark:text-gray-400"
                :class="currentPage >= totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'"
                :disabled="currentPage >= totalPages"
                @click="currentPage++"
                title="Próxima página"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </button>
              <button
                class="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 transition-colors dark:border-gray-600 dark:text-gray-400"
                :class="currentPage >= totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'"
                :disabled="currentPage >= totalPages"
                @click="currentPage = totalPages"
                title="Última página"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>

    </div>
    </template>

    <EpiControlTab
      v-else-if="inventorySection === 'epis'"
      :can-operate="Boolean(canOperate?.value ?? canOperate)"
      @quick-movement="payload => emit('quick-movement', payload)"
    />

    <FechamentosView v-else />

    <VariationSheet
      v-if="sheetRow"
      :item="sheetRow.item"
      :variation="sheetRow.variation"
      :movements="movements"
      :work-orders="workOrders"
      :can-manage="Boolean(canOperate?.value ?? canOperate)"
      :can-adjust="Boolean(isAdmin?.value ?? isAdmin)"
      :can-edit-details="Boolean(isAdmin?.value ?? isAdmin)"
      show-catalog-link
      @close="closeVariationSheet"
      @quick-movement="quickSheetMovement"
      @adjust-stock="adjustSheetStock"
      @go-to-catalog="openSheetInCatalog"
      @open-work-order="order => emit('open-work-order', order)"
    />

    <AppDialog
      v-if="historyRow"
      visible
      aria-label="Histórico por item e variação"
      @close="closeVariationHistory"
    >
      <section class="w-full max-w-5xl max-h-[86vh] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-gray-200 dark:border-gray-700 p-4">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Histórico por item / variação</p>
            <h2 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{{ historyRow.item.name }}</h2>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">{{ hierarchyLabel(historyRow.item) }}</p>
            <AttributeBadges class="mt-3" :item="historyRow.item" :variation="historyRow.variation" compact />
          </div>
          <button
            class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            title="Fechar"
            @click="closeVariationHistory"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 border-b border-gray-200 dark:border-gray-700 p-4">
          <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
            <p class="text-xs text-gray-500 dark:text-gray-400">Estoque atual</p>
            <p class="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{{ historyRow.variation.stock }} {{ historyRow.item.unit }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
            <p class="text-xs text-gray-500 dark:text-gray-400">Entradas registradas</p>
            <p class="mt-1 text-xl font-semibold text-green-600 dark:text-green-400">{{ historyTotals.entradas }} {{ historyRow.item.unit }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
            <p class="text-xs text-gray-500 dark:text-gray-400">Saídas registradas</p>
            <p class="mt-1 text-xl font-semibold text-red-600 dark:text-red-400">{{ historyTotals.saidas }} {{ historyRow.item.unit }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
            <p class="text-xs text-gray-500 dark:text-gray-400">OS vinculadas</p>
            <p class="mt-1 text-xl font-semibold text-primary-600 dark:text-primary-400">{{ historyTotals.os }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
            <p class="text-xs text-gray-500 dark:text-gray-400">Destinos vinculados</p>
            <p class="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{{ historyLinkedDestinations.length }}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-4 max-h-[48vh] overflow-auto p-4">
          <div>
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Linha do tempo</h3>
            <div v-if="!historyTimeline.length" class="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-6 text-sm text-gray-500 dark:text-gray-400">
              Nenhuma movimentação registrada para esta variação.
            </div>
            <div v-else class="space-y-3">
              <article
                v-for="entry in historyTimeline"
                :key="entry.movement.id"
                class="relative rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40 p-3 pl-4"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span
                        class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        :class="entry.movement.type === 'entrada'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'"
                      >
                        {{ entry.movement.type === 'entrada' ? 'Entrada' : 'Saída' }}
                      </span>
                      <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ entry.title }}</h4>
                    </div>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ entry.subtitle }}</p>
                    <p v-if="entry.order" class="mt-1 text-xs text-primary-700 dark:text-primary-300">
                      {{ entry.order.title || entry.order.equipment || 'Ordem de serviço' }}
                    </p>
                    <p v-if="entry.movement.note" class="mt-2 text-xs text-gray-600 dark:text-gray-300">{{ entry.movement.note }}</p>
                  </div>
                  <div class="text-right text-xs text-gray-500 dark:text-gray-400">
                    <p>{{ formatHistoryDate(entry.movement.date) }}</p>
                    <p class="mt-1 font-semibold text-gray-900 dark:text-gray-100">{{ entry.movement.qty }} {{ historyRow.item.unit }}</p>
                  </div>
                </div>
                <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span class="text-gray-400 dark:text-gray-500">Estoque</span>
                    <p class="font-medium text-gray-800 dark:text-gray-200">{{ movementStock(entry.movement) }}</p>
                  </div>
                  <div>
                    <span class="text-gray-400 dark:text-gray-500">Responsável</span>
                    <p class="font-medium text-gray-800 dark:text-gray-200">{{ movementResponsible(entry.movement) }}</p>
                  </div>
                  <div>
                    <span class="text-gray-400 dark:text-gray-500">Local</span>
                    <p class="font-medium text-gray-800 dark:text-gray-200">{{ movementPlace(entry.movement) }}</p>
                  </div>
                  <div>
                    <span class="text-gray-400 dark:text-gray-500">Operador</span>
                    <p class="font-medium text-gray-800 dark:text-gray-200">{{ entry.movement.operatorName || entry.movement.operator || '-' }}</p>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <aside class="space-y-3">
            <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Destinos vinculados</h3>
              <div v-if="historyLinkedDestinations.length" class="mt-3 flex flex-wrap gap-1.5">
                <span
                  v-for="dest in historyLinkedDestinations"
                  :key="dest.id"
                  class="inline-flex rounded px-2 py-1 text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                >
                  {{ dest.name }}
                </span>
              </div>
              <p v-else class="mt-3 text-sm text-gray-500 dark:text-gray-400">Nenhum destino vinculado no cadastro.</p>
            </div>

            <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Resumo</h3>
              <dl class="mt-3 space-y-2 text-sm">
                <div class="flex justify-between gap-3">
                  <dt class="text-gray-500 dark:text-gray-400">Ajustes</dt>
                  <dd class="font-medium text-gray-900 dark:text-gray-100">{{ historyTotals.ajustes }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-gray-500 dark:text-gray-400">Movimentações</dt>
                  <dd class="font-medium text-gray-900 dark:text-gray-100">{{ historyMovements.length }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-gray-500 dark:text-gray-400">Último movimento</dt>
                  <dd class="font-medium text-gray-900 dark:text-gray-100">{{ historyMovements[0] ? formatHistoryDate(historyMovements[0].date) : '-' }}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </section>
    </AppDialog>

    <BulkVariationDialog v-if="bulkEdit && selectedRows.length" :rows="selectedRows" :initial-field="bulkEdit.field" :initial-attribute="bulkEdit.attribute" @close="bulkEdit = null" @saved="bulkEdit = null; selectedVariationIds = []" />
  </div>
</template>
