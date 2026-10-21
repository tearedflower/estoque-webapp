<script setup>
import { ref, computed, watch, nextTick, inject } from 'vue'
import { stockAlertTransition, useItems } from '../composables/useItems.js'
import { useMovements } from '../composables/useMovements.js'
import { useDestinations } from '../composables/useDestinations.js'
import { usePeople } from '../composables/usePeople.js'
import { useSuppliers } from '../composables/useSuppliers.js'
import { useWorkOrders } from '../composables/useWorkOrders.js'
import { useToast } from '../composables/useToast.js'
import { useMovementHistory, searchHistoryFacets } from '../composables/useMovementHistory.js'
import { useDestinationSummary } from '../composables/useDestinationSummary.js'
import { getRecentMovementDefaults } from '../services/api.js'
import DestinationSummaryPanel from '../components/movements/DestinationSummaryPanel.vue'
import PhotoMovementTab from '../components/movements/PhotoMovementTab.vue'
import MovementImportTab from '../components/movements/MovementImportTab.vue'
import DestinationTreePicker from '../components/ui/DestinationTreePicker.vue'
import PersonPicker from '../components/ui/PersonPicker.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import AppButton from '../components/ui/AppButton.vue'
import AttributeBadges from '../components/ui/AttributeBadges.vue'
import { sortedAttributeNames, orderedAttributeNames, variationAttributeRows } from '../utils/attributes.js'
import AppLink from '../components/ui/AppLink.vue'
import AppDialog from '../components/ui/AppDialog.vue'
import AppModal from '../components/ui/AppModal.vue'
import SectionTabs from '../components/ui/SectionTabs.vue'
import { normalizeSearchText as normalizeText } from '../utils/globalSearch.js'
import { formatRecentDateTime } from '../utils/recentDateTime.js'
import { buildMovementRows, filterMovementRows } from '../utils/movementPicker.js'
import { movementHistoryCsv } from '../utils/movementHistoryCsv.js'

const isAdmin = inject('isAdmin')
const canOperate = inject('canOperate')
const props = defineProps({
  initialSubTab: {
    type: String,
    default: '',
  },
  initialHistorySearch: {
    type: String,
    default: null,
  },
  prefillMovement: {
    type: Object,
    default: null,
  },
})

const {
  items, variations, getVariationsForItem,
  uniqueGroups, getCategoriesForGroup, getSubcategoriesForCategory,
  activeGroup, activeCategory, activeSubcategory,
  setActiveGroup, setActiveCategory, setActiveSubcategory,
  setViewingItem
} = useItems()
const { movements, addMovementBatch, editMovement, deleteMovement } = useMovements()
const { destinations, activeDestinations, groupedDestinations, getDestinationName, getDestFullName } = useDestinations()
const { activePeople } = usePeople()
const { activeSuppliers, ensureSupplier } = useSuppliers()
const { workOrders } = useWorkOrders()
const { success, error } = useToast()

const emit = defineEmits(['update:browsing', 'update:subTab', 'movement-complete', 'navigate'])

function focusRef(target) {
  const el = Array.isArray(target?.value) ? target.value[0] : target?.value
  if (el && typeof el.focus === 'function') el.focus()
}

// ===== Sub-tabs =====
const movementSubTabs = ['entrada', 'saida', 'rapida']
const validSubTabs = [...movementSubTabs, 'fotos', 'importacao', 'historico', 'resumo']
const initialSubTab = props.initialSubTab === 'entradaRapida' || props.initialSubTab === 'saidaRapida' ? 'rapida' : props.initialSubTab
const activeSubTab = ref(validSubTabs.includes(initialSubTab) ? initialSubTab : 'entrada')

const visibleSubTabs = computed(() => {
  const all = [
    { id: 'entrada',   label: 'Entrada',   icon: 'M12 4.5v15m0-15 6 6m-6-6-6 6' },
    { id: 'saida',     label: 'Saída',     icon: 'M12 19.5v-15m0 15-6-6m6 6 6-6' },
    { id: 'rapida',    label: 'Vários itens', icon: 'M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3' },
    { id: 'fotos',     label: 'Por foto', icon: 'M6.827 6.175 7.7 4.65A1.5 1.5 0 0 1 9.002 3.9h5.996a1.5 1.5 0 0 1 1.302.75l.873 1.525A1.5 1.5 0 0 0 18.475 6.9H19.5A1.5 1.5 0 0 1 21 8.4V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V8.4a1.5 1.5 0 0 1 1.5-1.5h1.025a1.5 1.5 0 0 0 1.302-.725Z M15.75 12.75a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z' },
    { id: 'importacao', label: 'Importar planilha', icon: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 10.5 12 15m0 0 4.5-4.5M12 15V3' },
    { id: 'historico', label: 'Histórico', icon: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
    { id: 'resumo',    label: 'Relatório por destino', icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h16.5m0 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3M8.25 9.75l2.25 2.25 4.5-4.5' },
  ]
  const allowed = isAdmin.value ? all : all.filter(t => t.id !== 'importacao')
  return canOperate.value ? allowed : allowed.filter(t => t.id === 'historico' || t.id === 'resumo')
})

const registrationTabs = computed(() => visibleSubTabs.value.filter(tab => !['historico', 'resumo'].includes(tab.id)))
const isRegistering = computed(() => !['historico', 'resumo'].includes(activeSubTab.value))
const pageHeading = computed(() => ({
  entrada: { title: 'Registrar entrada', description: 'Selecione o material recebido e informe os dados da entrada.' },
  saida: { title: 'Registrar saída', description: 'Selecione o material e informe a quantidade, quem retirou e o destino.' },
  rapida: { title: 'Movimentação em lote', description: 'Adicione materiais à fila e confirme os lançamentos juntos.' },
  fotos: { title: 'Movimentação por foto', description: 'Identifique os materiais nas fotos e revise antes de registrar.' },
  importacao: { title: 'Importar movimentações', description: 'Envie a planilha e revise os lançamentos antes de confirmar.' },
  historico: { title: 'Histórico de movimentações', description: 'Consulte entradas, saídas e ajustes registrados.' },
  resumo: { title: 'Relatórios de movimentações', description: 'Acompanhe o consumo de materiais por destino.' },
})[activeSubTab.value])

// Force historico when visitor
watch(canOperate, (v) => { if (!v && activeSubTab.value !== 'resumo') activeSubTab.value = 'historico' }, { immediate: true })
watch(isAdmin, (v) => { if (!v && activeSubTab.value === 'importacao') activeSubTab.value = 'historico' }, { immediate: true })

function switchSubTab(tab) {
  if (!validSubTabs.includes(tab) || activeSubTab.value === tab) return
  const keepMovementContext =
    ['entrada', 'saida'].includes(activeSubTab.value) &&
    ['entrada', 'saida'].includes(tab)

  suppressFlowReset.value = true
  activeSubTab.value = tab
  if (keepMovementContext) {
    adaptFormForSubTab(tab)
    nextTick(() => {
      suppressFlowReset.value = false
      if (step.value === 3) focusRef(qtyInputEl)
      else if (step.value === 1) focusRef(searchInputEl)
    })
    return
  }

  resetFlow()
  nextTick(() => {
    suppressFlowReset.value = false
  })
}

// ===== Step flow (shared for Entrada + Saída) =====
const step = ref(1) // 1: search item | 2: pick variation | 3: fill form
const registrationStep = computed(() => step.value === 3 ? 2 : 1)
const itemSearch = ref('')
const selectedItem = ref(null)
const selectedVariation = ref(null)
const searchInputEl = ref(null)
const qtyInputEl = ref(null)
const destSearchInputEl = ref(null)
const supplierListEl = ref(null)

const form = ref({
  qty: '',
  supplier: '',
  unitCost: '',
  requestedBy: '',
  requestedByPersonId: '',
  destination: '',
  docRef: '',
  note: '',
})

const docType = ref('sem') // 'nf' | 'pedido' | 'sem' — only used for entrada
const confirmPending = ref(false)
const movementFormAttempted = ref(false)
const suppressFlowReset = ref(false)

function selectDocType(v) {
  docType.value = v
  if (v === 'sem') form.value.docRef = ''
}

const supplierDropdownOpen = ref(false)
const supplierActiveIndex = ref(-1)
const destDropdownOpen = ref(false)
const destSearch = ref('')
const personSelectVal = ref('')
const destSelectVal = ref('')
const movementDestinationId = ref('')
const appliedPrefillKey = ref('')
const activeQuickMovementType = ref(props.initialSubTab === 'entradaRapida' ? 'entrada' : 'saida')

// ===== Entrada rapida =====
const quickEntrySearch = ref('')
const quickEntrySelected = ref(null)
const quickEntryQty = ref('1')
const quickEntrySupplier = ref('')
const quickEntryUnitCost = ref('')
const quickEntryDocType = ref('sem')
const quickEntryDocRef = ref('')
const quickEntryNote = ref('')
const quickEntryQueue = ref([])
const quickEntryPending = ref(false)
const quickEntryAttempted = ref(false)
const quickEntrySupplierDropdownOpen = ref(false)
const quickEntrySearchInputEl = ref(null)

// ===== Saida rapida =====
const quickExitSearch = ref('')
const quickExitSelected = ref(null)
const quickExitQty = ref('1')
const quickExitRequestedBy = ref('')
const quickExitRequestedByPersonId = ref('')
const quickExitDestinationId = ref('')
const quickExitDestinationName = ref('')
const quickExitDestinationOther = ref(false)
const quickExitNote = ref('')
const quickExitQueue = ref([])
const quickExitPending = ref(false)
const quickExitAttempted = ref(false)
const quickExitSearchInputEl = ref(null)

function resetFlow() {
  step.value = 1
  itemSearch.value = ''
  selectedItem.value = null
  selectedVariation.value = null
  form.value = { qty: '', supplier: '', unitCost: '', requestedBy: '', requestedByPersonId: '', destination: '', docRef: '', note: '' }
  personSelectVal.value = ''
  destSelectVal.value = ''
  movementDestinationId.value = ''
  docType.value = 'sem'
  confirmPending.value = false
  movementFormAttempted.value = false
  supplierDropdownOpen.value = false
  destDropdownOpen.value = false
  destSearch.value = ''
  nextTick(() => focusRef(searchInputEl))
}

function adaptFormForSubTab(tab) {
  confirmPending.value = false
  supplierDropdownOpen.value = false
  destDropdownOpen.value = false
  destSearch.value = ''
  if (tab === 'entrada') {
    form.value.requestedBy = ''
    form.value.requestedByPersonId = ''
    form.value.destination = ''
    personSelectVal.value = ''
    destSelectVal.value = ''
    movementDestinationId.value = ''
  } else {
    form.value.supplier = ''
    form.value.unitCost = ''
    form.value.docRef = ''
    docType.value = 'sem'
  }
}

function applyRequestedByPrefill(prefill, tab) {
  if (tab !== 'saida' || (!prefill.requestedBy && !prefill.requestedByPersonId)) return
  const person = activePeople.value.find(p =>
    (prefill.requestedByPersonId && p.id === prefill.requestedByPersonId) ||
    normalizeText(p.name) === normalizeText(prefill.requestedBy)
  )
  personSelectVal.value = person?.name || prefill.requestedBy || ''
  form.value.requestedBy = person?.name || prefill.requestedBy || ''
  form.value.requestedByPersonId = person?.id || prefill.requestedByPersonId || ''
}

function applyDestinationPrefill(prefill, tab) {
  if (tab !== 'saida' || (!prefill.destination && !prefill.destinationId)) return
  const destination = activeDestinations.value.find(row =>
    (prefill.destinationId && row.id === prefill.destinationId) ||
    normalizeText(getDestFullName(row.id)) === normalizeText(prefill.destination) ||
    normalizeText(row.name) === normalizeText(prefill.destination)
  )
  if (!destination) return
  const fullName = getDestFullName(destination.id)
  movementDestinationId.value = destination.id
  destSelectVal.value = fullName
  form.value.destination = fullName
}

function hierarchyFromPrefillTarget(prefill) {
  if (!prefill?.targetType || !prefill?.targetKey) return null
  if (prefill.targetType === 'grupo') return { group: prefill.targetKey, category: null, subcategory: null }
  if (prefill.targetType === 'categoria') {
    const [group, category] = String(prefill.targetKey).split('|')
    return { group: group || null, category: category || null, subcategory: null }
  }
  if (prefill.targetType === 'subcategoria') {
    const [group, category, subcategory] = String(prefill.targetKey).split('|')
    return { group: group || null, category: category || null, subcategory: subcategory || null }
  }
  if (prefill.targetType === 'item') {
    const item = items.value.find(i => i.id === prefill.targetKey)
    if (!item) return null
    return { item, group: item.group || null, category: item.category || null, subcategory: item.subcategory || null }
  }
  return null
}

function applyTargetPrefill(prefill, tab) {
  const target = hierarchyFromPrefillTarget(prefill)
  if (!target) return false
  appliedPrefillKey.value = prefill.nonce || `${tab}:${prefill.targetType}:${prefill.targetKey}`
  suppressFlowReset.value = true
  activeSubTab.value = tab
  resetFlow()
  setActiveGroup(target.group)
  setActiveCategory(target.category)
  setActiveSubcategory(target.subcategory)
  itemSearch.value = ''
  applyRequestedByPrefill(prefill, tab)
  applyDestinationPrefill(prefill, tab)
  if (target.item) {
    selectedItem.value = target.item
    step.value = 2
    setViewingItem(target.item.id)
  } else {
    step.value = 1
  }
  nextTick(() => {
    suppressFlowReset.value = false
    if (!target.item) focusRef(searchInputEl)
  })
  return true
}

function applyMovementPrefill(prefill) {
  if (!prefill || !canOperate.value) return
  const tab = ['entrada', 'saida'].includes(prefill.type) ? prefill.type : 'entrada'
  const prefillKey = prefill.nonce || `${tab}:${prefill.itemId}:${prefill.variationId}:${prefill.targetType || ''}:${prefill.targetKey || ''}`
  if (appliedPrefillKey.value === prefillKey) {
    applyDestinationPrefill(prefill, tab)
    return
  }
  const item = items.value.find(i => i.id === prefill.itemId)
  const variation = variations.value.find(v => v.id === prefill.variationId)
  if (!item || !variation) {
    if (applyTargetPrefill(prefill, tab)) return
    if (!items.value.length || !variations.value.length) return
    appliedPrefillKey.value = prefillKey
    error('Item ou variação não encontrada para movimentação rápida.')
    return
  }

  appliedPrefillKey.value = prefillKey
  suppressFlowReset.value = true
  activeSubTab.value = tab
  resetFlow()
  selectedItem.value = item
  selectedVariation.value = variation
  step.value = 3
  applyRequestedByPrefill(prefill, tab)
  applyDestinationPrefill(prefill, tab)
  setViewingItem(item.id)
  nextTick(() => {
    suppressFlowReset.value = false
    focusRef(qtyInputEl)
  })
}

watch(() => props.initialSubTab, tab => {
  if (props.prefillMovement && props.prefillMovement.type === tab) {
    applyMovementPrefill(props.prefillMovement)
    return
  }
  if (tab === 'entradaRapida') activeQuickMovementType.value = 'entrada'
  if (tab === 'saidaRapida') activeQuickMovementType.value = 'saida'
  const normalizedTab = tab === 'entradaRapida' || tab === 'saidaRapida' ? 'rapida' : tab
  switchSubTab(normalizedTab)
})

watch(
  [() => props.prefillMovement, () => items.value.length, () => variations.value.length, () => activeDestinations.value.length],
  ([prefill]) => applyMovementPrefill(prefill),
  { immediate: true }
)

function resetCurrentItem() {
  step.value = 1
  itemSearch.value = ''
  selectedItem.value = null
  selectedVariation.value = null
  form.value = { qty: '', supplier: '', unitCost: '', requestedBy: '', requestedByPersonId: '', destination: '', docRef: '', note: '' }
  personSelectVal.value = ''
  destSelectVal.value = ''
  movementDestinationId.value = ''
  docType.value = 'sem'
  supplierDropdownOpen.value = false
  destDropdownOpen.value = false
  destSearch.value = ''
  confirmPending.value = false
  movementFormAttempted.value = false
  nextTick(() => focusRef(searchInputEl))
}

watch(activeSubTab, () => {
  if (suppressFlowReset.value) return
  resetFlow()
})

// Emit browsing state and manage viewingItemId
watch([step, activeSubTab], ([v, tab]) => {
  emit('update:browsing', v <= 2 && (tab === 'entrada' || tab === 'saida'))
  emit('update:subTab', tab)
  if (v === 1) setViewingItem(null)
}, { immediate: true })

// ===== Catalog navigation helpers (step 1) =====
const navCategories = computed(() =>
  activeGroup.value ? getCategoriesForGroup(activeGroup.value) : []
)
const navSubcategories = computed(() =>
  activeGroup.value && activeCategory.value
    ? getSubcategoriesForCategory(activeGroup.value, activeCategory.value)
    : []
)

// The same indexed catalog serves single-item and batch registration.
const movementRows = computed(() => buildMovementRows(items.value, variations.value))
const variationResults = computed(() => itemSearch.value.trim() ? filterMovementRows(movementRows.value, itemSearch.value, {
  group: activeGroup.value, category: activeCategory.value, subcategory: activeSubcategory.value,
}) : [])
const pickerPage = ref(1)
const pickerPageSize = 30
const pickerPages = computed(() => Math.max(1, Math.ceil(variationResults.value.length / pickerPageSize)))
const pickerRows = computed(() => variationResults.value.slice((pickerPage.value - 1) * pickerPageSize, pickerPage.value * pickerPageSize))
watch([itemSearch, activeGroup, activeCategory, activeSubcategory], () => { pickerPage.value = 1 })
watch(pickerPages, pages => { pickerPage.value = Math.min(pickerPage.value, pages) })
const quickExitResults = computed(() => quickExitSearch.value.trim()
  ? filterMovementRows(movementRows.value, quickExitSearch.value).slice(0, 30) : [])
const quickEntryResults = computed(() => quickEntrySearch.value.trim()
  ? filterMovementRows(movementRows.value, quickEntrySearch.value).slice(0, 30) : [])

function clearPickerFilters() {
  itemSearch.value = ''
  setActiveGroup(null)
}

function selectItem(item) {
  selectedItem.value = item
  step.value = 2
}

function selectVariationResult(result) {
  if (activeSubTab.value === 'saida' && result.variation.stockConfirmed !== false && result.variation.stock <= 0) {
    error('Esta variacao esta sem estoque para saida.')
    return
  }
  selectedItem.value = result.item
  selectVariation(result.variation)
}

function handleItemSearchEnter() {
  if (variationResults.value.length === 1) selectVariationResult(variationResults.value[0])
}

function backToStep1() {
  selectedItem.value = null
  selectedVariation.value = null
  step.value = 1
  nextTick(() => focusRef(searchInputEl))
}

function backToHierarchyLevel(level) {
  if (!selectedItem.value) return
  setActiveGroup(selectedItem.value.group || null)
  setActiveCategory(level === 'group' ? null : (selectedItem.value.category || null))
  setActiveSubcategory(level === 'subcategory' ? (selectedItem.value.subcategory || null) : null)
  itemSearch.value = ''
  backToStep1()
}

// ===== Variation picker (step 2) =====
const itemVariations = computed(() =>
  selectedItem.value ? getVariationsForItem(selectedItem.value.id) : []
)

function selectVariation(v) {
  selectedVariation.value = v
  movementFormAttempted.value = false
  step.value = 3
  applyRememberedDefaults(v.id, activeSubTab.value, 'form')
  nextTick(() => focusRef(qtyInputEl))
}

function destinationFromRemembered(name) {
  const normalized = normalizeText(name)
  return activeDestinations.value.find(destination =>
    normalizeText(getDestFullName(destination.id)) === normalized ||
    normalizeText(destination.name) === normalized
  ) || null
}

async function applyRememberedDefaults(variationId, type, target) {
  try {
    const remembered = await getRecentMovementDefaults(variationId, type)
    if (target === 'entry') {
      if (!quickEntrySupplier.value) quickEntrySupplier.value = remembered.supplier || ''
      if (quickEntryUnitCost.value === '' && remembered.unitCost !== null && remembered.unitCost !== undefined) {
        quickEntryUnitCost.value = String(remembered.unitCost)
      }
      return
    }
    if (target === 'exit') {
      const person = activePeople.value.find(row =>
        (remembered.requestedByPersonId && row.id === remembered.requestedByPersonId) ||
        normalizeText(row.name) === normalizeText(remembered.requestedBy)
      )
      if (!quickExitRequestedBy.value && person) {
        quickExitRequestedBy.value = person.name
        quickExitRequestedByPersonId.value = person.id
      }
      const destination = destinationFromRemembered(remembered.destination)
      if (!quickExitDestinationId.value && destination) {
        quickExitDestinationId.value = destination.id
        quickExitDestinationName.value = getDestFullName(destination.id)
        quickExitDestinationOther.value = false
      }
      return
    }
    if (type === 'entrada') {
      if (!form.value.supplier) form.value.supplier = remembered.supplier || ''
      if (form.value.unitCost === '' && remembered.unitCost !== null && remembered.unitCost !== undefined) {
        form.value.unitCost = String(remembered.unitCost)
      }
      return
    }
    const person = activePeople.value.find(row =>
      (remembered.requestedByPersonId && row.id === remembered.requestedByPersonId) ||
      normalizeText(row.name) === normalizeText(remembered.requestedBy)
    )
    if (!form.value.requestedBy && person) {
      form.value.requestedBy = person.name
      form.value.requestedByPersonId = person.id
      personSelectVal.value = person.name
    }
    const destination = destinationFromRemembered(remembered.destination)
    if (!movementDestinationId.value && destination) {
      const fullName = getDestFullName(destination.id)
      movementDestinationId.value = destination.id
      destSelectVal.value = fullName
      form.value.destination = fullName
    }
  } catch {
    // Lembrar valores é uma conveniência; a movimentação continua normalmente se não houver histórico.
  }
}

function backToStep2() {
  selectedVariation.value = null
  movementFormAttempted.value = false
  step.value = 2
}

// ===== Destination + People quick-pick helpers =====

// Destinations linked to the selected variation
const linkedDestinationIds = computed(() =>
  selectedVariation.value?.destinations || []
)

// Ordered flat list: parent then children, for hierarchical display
const orderedActiveDestinations = computed(() => {
  const list = []
  for (const g of groupedDestinations.value) {
    list.push(g.parent)
    for (const c of g.children) list.push(c)
  }
  return list
})

const linkedDestinations = computed(() =>
  orderedActiveDestinations.value.filter(d => linkedDestinationIds.value.includes(d.id))
)
const otherDestinations = computed(() =>
  orderedActiveDestinations.value.filter(d => !linkedDestinationIds.value.includes(d.id))
)

// Filtered by search
const filteredLinkedDests = computed(() => {
  const q = destSearch.value.trim().toLowerCase()
  if (!q) return linkedDestinations.value
  return linkedDestinations.value.filter(d => getDestFullName(d.id).toLowerCase().includes(q))
})
const filteredOtherDests = computed(() => {
  const q = destSearch.value.trim().toLowerCase()
  if (!q) return otherDestinations.value
  return otherDestinations.value.filter(d => getDestFullName(d.id).toLowerCase().includes(q))
})

const filteredSuppliers = computed(() => {
  const q = String(form.value.supplier || '').trim().toLowerCase()
  if (!q) return activeSuppliers.value
  return activeSuppliers.value.filter(s =>
    s.name.toLowerCase().includes(q) ||
    String(s.description || '').toLowerCase().includes(q)
  )
})

const supplierNameExists = computed(() => {
  const q = String(form.value.supplier || '').trim().toLowerCase()
  return Boolean(q && activeSuppliers.value.some(s => s.name.toLowerCase() === q))
})

function selectSupplier(supplier) {
  form.value.supplier = supplier.name
  supplierDropdownOpen.value = false
  supplierActiveIndex.value = -1
}

function openSupplierDropdown() {
  supplierDropdownOpen.value = true
  supplierActiveIndex.value = -1
}

function closeSupplierDropdown() {
  supplierDropdownOpen.value = false
  supplierActiveIndex.value = -1
}

function handleSupplierKeydown(event) {
  if (event.key === 'Tab') {
    closeSupplierDropdown()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    closeSupplierDropdown()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const supplier = filteredSuppliers.value[supplierActiveIndex.value]
      || (filteredSuppliers.value.length === 1 ? filteredSuppliers.value[0] : null)
    if (supplier) selectSupplier(supplier)
    return
  }
  if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !filteredSuppliers.value.length) return

  event.preventDefault()
  supplierDropdownOpen.value = true
  const direction = event.key === 'ArrowDown' ? 1 : -1
  supplierActiveIndex.value = (
    supplierActiveIndex.value + direction + filteredSuppliers.value.length
  ) % filteredSuppliers.value.length
  nextTick(() => supplierListEl.value
    ?.querySelector('[aria-selected="true"]')
    ?.scrollIntoView({ block: 'nearest' }))
}


const requestedPersonIsValid = computed(() => {
  if (activeSubTab.value !== 'saida') return true
  return activePeople.value.some(p =>
    p.id === form.value.requestedByPersonId &&
    p.name.toLowerCase() === String(form.value.requestedBy || '').trim().toLowerCase()
  )
})

function selectRequestedPerson(person) {
  personSelectVal.value = person.name
  form.value.requestedBy = person.name
  form.value.requestedByPersonId = person.id
}

function syncRequestedPersonFromInput() {
  const q = String(form.value.requestedBy || '').trim().toLowerCase()
  const exact = activePeople.value.find(p => p.name.toLowerCase() === q)
  form.value.requestedByPersonId = exact?.id || ''
  personSelectVal.value = exact?.name || form.value.requestedBy
}


function movementDestinationIdForName(name) {
  const q = String(name || '').trim().toLowerCase()
  if (!q) return ''
  return orderedActiveDestinations.value.find(d => getDestFullName(d.id).toLowerCase() === q)?.id || ''
}

function handleMovementDestinationSelect({ fullName }) {
  destSelectVal.value = fullName
  form.value.destination = fullName
}

function handleMovementDestinationClear() {
  movementDestinationId.value = ''
  destSelectVal.value = ''
  form.value.destination = ''
}

function handleMovementDestinationOther() {
  movementDestinationId.value = ''
  destSelectVal.value = '__outro__'
  form.value.destination = ''
}

watch(personSelectVal, (v) => {
  if (v && v !== '__outro__') {
    const person = activePeople.value.find(p => p.name === v)
    form.value.requestedBy = v
    form.value.requestedByPersonId = person?.id || ''
  } else {
    form.value.requestedBy = ''
    form.value.requestedByPersonId = ''
  }
})
watch(destSelectVal, (v) => {
  if (v !== '__outro__') form.value.destination = v
  else form.value.destination = ''
})

// ===== Form: step 3 validation =====
const parsedQty = computed(() => {
  const n = Number(form.value.qty)
  return isFinite(n) && n > 0 ? n : null
})

const parsedUnitCost = computed(() => {
  if (form.value.unitCost === '' || form.value.unitCost === null || form.value.unitCost === undefined) return null
  const n = Number(form.value.unitCost)
  return Number.isFinite(n) && n >= 0 ? n : null
})

const selectedAvailableStock = computed(() => {
  if (activeSubTab.value !== 'saida' || !selectedVariation.value) return selectedVariation.value?.stock || 0
  return selectedVariation.value.stock
})

const saidaExceedsStock = computed(() =>
  activeSubTab.value === 'saida' &&
  parsedQty.value !== null &&
  selectedVariation.value !== null &&
  selectedVariation.value.stockConfirmed !== false &&
  parsedQty.value > selectedAvailableStock.value
)

const canConfirm = computed(() => {
  if (!parsedQty.value) return false
  if (saidaExceedsStock.value) return false
  if (activeSubTab.value === 'entrada' && form.value.unitCost !== '' && parsedUnitCost.value === null) return false
  if (activeSubTab.value === 'saida') {
    return requestedPersonIsValid.value && form.value.destination.trim().length > 0
  }
  return true
})

const formBlockReason = computed(() => {
  if (!selectedVariation.value) return ''
  if (!parsedQty.value) return 'Informe uma quantidade maior que zero.'
  if (saidaExceedsStock.value) return `Estoque disponivel: ${selectedAvailableStock.value} ${selectedItem.value?.unit || ''}.`
  if (activeSubTab.value === 'entrada' && form.value.unitCost !== '' && parsedUnitCost.value === null) return 'Informe um custo valido ou deixe vazio.'
  if (activeSubTab.value === 'saida' && !form.value.requestedBy.trim()) return 'Selecione quem retirou.'
  if (activeSubTab.value === 'saida' && !requestedPersonIsValid.value) return 'Quem retirou precisa ser uma pessoa cadastrada.'
  if (activeSubTab.value === 'saida' && !form.value.destination.trim()) return 'Selecione ou informe o destino.'
  return ''
})

const visibleFormBlockReason = computed(() =>
  movementFormAttempted.value ? formBlockReason.value : ''
)

const quickEntryQtyParsed = computed(() => {
  const n = Number(quickEntryQty.value)
  return Number.isFinite(n) && n > 0 ? n : null
})

const quickEntryUnitCostParsed = computed(() => {
  if (quickEntryUnitCost.value === '' || quickEntryUnitCost.value === null || quickEntryUnitCost.value === undefined) return null
  const n = Number(quickEntryUnitCost.value)
  return Number.isFinite(n) && n >= 0 ? n : null
})

const quickEntryFilteredSuppliers = computed(() => {
  const q = String(quickEntrySupplier.value || '').trim().toLowerCase()
  if (!q) return activeSuppliers.value
  return activeSuppliers.value.filter(s =>
    s.name.toLowerCase().includes(q) ||
    String(s.description || '').toLowerCase().includes(q)
  )
})

const quickEntrySupplierNameExists = computed(() => {
  const q = String(quickEntrySupplier.value || '').trim().toLowerCase()
  return Boolean(q && activeSuppliers.value.some(s => s.name.toLowerCase() === q))
})

const quickEntryDocText = computed(() =>
  quickEntryDocType.value && quickEntryDocType.value !== 'sem' && quickEntryDocRef.value.trim()
    ? `${quickEntryDocType.value === 'nf' ? 'NF' : 'PC'} ${quickEntryDocRef.value.trim()}`
    : ''
)

const quickEntryCanAdd = computed(() =>
  Boolean(
    quickEntrySelected.value &&
    quickEntryQtyParsed.value &&
    (quickEntryUnitCost.value === '' || quickEntryUnitCostParsed.value !== null)
  )
)

const quickEntryBlockReason = computed(() => {
  if (!quickEntrySelected.value) return 'Selecione uma variação.'
  if (!quickEntryQtyParsed.value) return 'Informe uma quantidade maior que zero.'
  if (quickEntryUnitCost.value !== '' && quickEntryUnitCostParsed.value === null) return 'Informe um custo válido ou deixe vazio.'
  return ''
})

function selectQuickEntryResult(result) {
  quickEntrySelected.value = result
  quickEntrySearch.value = ''
  quickEntryQty.value = '1'
  quickEntryAttempted.value = false
  applyRememberedDefaults(result.variation.id, 'entrada', 'entry')
}

function handleQuickEntrySearchEnter() {
  if (quickEntryResults.value.length === 1) selectQuickEntryResult(quickEntryResults.value[0])
}

function setQuickMovementType(type) {
  activeQuickMovementType.value = type
  quickEntrySupplierDropdownOpen.value = false
  nextTick(() => focusRef(type === 'entrada' ? quickEntrySearchInputEl : quickExitSearchInputEl))
}

function selectQuickEntrySupplier(supplier) {
  quickEntrySupplier.value = supplier.name
  quickEntrySupplierDropdownOpen.value = false
}

function handleQuickEntrySupplierEnter() {
  if (quickEntryFilteredSuppliers.value.length === 1) selectQuickEntrySupplier(quickEntryFilteredSuppliers.value[0])
}

function selectQuickEntryDocType(v) {
  quickEntryDocType.value = v
  if (v === 'sem') quickEntryDocRef.value = ''
}

function quickEntryLineFromSelection() {
  const { item, variation } = quickEntrySelected.value
  return {
    uid: `quick_entrada_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: 'entrada',
    variationId: variation.id,
    itemId: item.id,
    itemName: item.name,
    itemGroup: item.group,
    itemCategory: item.category || '',
    itemSubcategory: item.subcategory || '',
    itemUnit: item.unit,
    variationValues: { ...(variation.values || {}) },
    variationExtras: { ...(variation.extras || {}) },
    qty: quickEntryQtyParsed.value,
    supplier: quickEntrySupplier.value,
    unitCost: quickEntryUnitCostParsed.value,
    requestedBy: '',
    requestedByPersonId: '',
    destination: '',
    destinationId: '',
    destinationOther: false,
    docRef: quickEntryDocText.value,
    note: quickEntryNote.value,
  }
}

function addQuickEntryLine() {
  quickEntryAttempted.value = true
  if (!quickEntryCanAdd.value) {
    if (quickEntryBlockReason.value) error(quickEntryBlockReason.value)
    return
  }
  quickEntryQueue.value = [...quickEntryQueue.value, quickEntryLineFromSelection()]
  quickEntrySelected.value = null
  quickEntrySearch.value = ''
  quickEntryQty.value = '1'
  quickEntryNote.value = ''
  quickEntryAttempted.value = false
  nextTick(() => focusRef(quickEntrySearchInputEl))
}

function removeQuickEntryLine(uid) {
  quickEntryQueue.value = quickEntryQueue.value.filter(line => line.uid !== uid)
}

function clearQuickEntryQueue() {
  quickEntryQueue.value = []
}

async function confirmQuickEntryQueue() {
  if (quickEntryPending.value || !quickEntryQueue.value.length) return
  try {
    quickEntryPending.value = true
    await ensureSuppliersForLines(quickEntryQueue.value)
    const created = await addMovementBatch('entrada', quickEntryQueue.value, {})
    for (const movement of created) {
      const updatedVar = variations.value.find(v => v.id === movement.variationId)
      if (updatedVar) { updatedVar.stock = movement.stockAfter; updatedVar.stockConfirmed = movement.stockConfirmed !== false }
    }
    successWithHistoryAction(`${created.length} entrada${created.length === 1 ? '' : 's'} registrada${created.length === 1 ? '' : 's'}.`)
    quickEntryQueue.value = []
    nextTick(() => focusRef(quickEntrySearchInputEl))
  } catch (e) {
    error(e.message)
  } finally {
    quickEntryPending.value = false
  }
}

const quickExitQtyParsed = computed(() => {
  const n = Number(quickExitQty.value)
  return Number.isFinite(n) && n > 0 ? n : null
})


const quickExitPersonIsValid = computed(() =>
  activePeople.value.some(p =>
    p.id === quickExitRequestedByPersonId.value &&
    p.name.toLowerCase() === String(quickExitRequestedBy.value || '').trim().toLowerCase()
  )
)

const quickExitDestinationText = computed(() =>
  quickExitDestinationOther.value ? quickExitDestinationName.value : getDestFullName(quickExitDestinationId.value)
)

const quickExitDestinationValid = computed(() =>
  quickExitDestinationOther.value
    ? quickExitDestinationName.value.trim().length > 0
    : Boolean(quickExitDestinationId.value && quickExitDestinationText.value)
)

const quickExitSelectedQueuedQty = computed(() => {
  const variationId = quickExitSelected.value?.variation?.id
  if (!variationId) return 0
  return quickExitQueue.value
    .filter(line => line.variationId === variationId)
    .reduce((sum, line) => sum + Number(line.qty || 0), 0)
})

const quickExitAvailableStock = computed(() => {
  const stock = Number(quickExitSelected.value?.variation?.stock || 0)
  return Math.max(0, stock - quickExitSelectedQueuedQty.value)
})

const quickExitCanAdd = computed(() =>
  Boolean(
    quickExitSelected.value &&
    quickExitQtyParsed.value &&
    (quickExitSelected.value.variation.stockConfirmed === false || quickExitQtyParsed.value <= quickExitAvailableStock.value) &&
    quickExitPersonIsValid.value &&
    quickExitDestinationValid.value
  )
)

const quickExitBlockReason = computed(() => {
  if (!quickExitSelected.value) return 'Selecione uma variação.'
  if (!quickExitQtyParsed.value) return 'Informe uma quantidade maior que zero.'
  if (quickExitSelected.value.variation.stockConfirmed !== false && quickExitQtyParsed.value > quickExitAvailableStock.value) return `Estoque disponível: ${quickExitAvailableStock.value} ${quickExitSelected.value.item.unit}.`
  if (!quickExitRequestedBy.value.trim()) return 'Selecione quem retirou.'
  if (!quickExitPersonIsValid.value) return 'Quem retirou precisa ser uma pessoa cadastrada.'
  if (!quickExitDestinationValid.value) return 'Selecione ou informe o destino.'
  return ''
})

function selectQuickExitResult(result) {
  if (result.variation.stockConfirmed !== false && result.variation.stock <= 0) {
    error('Esta variação está sem estoque para saída.')
    return
  }
  quickExitSelected.value = result
  quickExitSearch.value = ''
  quickExitQty.value = '1'
  quickExitAttempted.value = false
  applyRememberedDefaults(result.variation.id, 'saida', 'exit')
}

function handleQuickExitSearchEnter() {
  if (quickExitResults.value.length === 1) selectQuickExitResult(quickExitResults.value[0])
}

function selectQuickExitPerson(person) {
  quickExitRequestedBy.value = person.name
  quickExitRequestedByPersonId.value = person.id
}

function syncQuickExitPersonFromInput() {
  const q = String(quickExitRequestedBy.value || '').trim().toLowerCase()
  const exact = activePeople.value.find(p => p.name.toLowerCase() === q)
  quickExitRequestedByPersonId.value = exact?.id || ''
}


function handleQuickExitDestinationSelect({ fullName }) {
  quickExitDestinationOther.value = false
  quickExitDestinationName.value = fullName
}

function handleQuickExitDestinationClear() {
  quickExitDestinationId.value = ''
  quickExitDestinationName.value = ''
  quickExitDestinationOther.value = false
}

function handleQuickExitDestinationOther() {
  quickExitDestinationId.value = ''
  quickExitDestinationName.value = ''
  quickExitDestinationOther.value = true
}

function quickExitLineFromSelection() {
  const { item, variation } = quickExitSelected.value
  return {
    uid: `quick_saida_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: 'saida',
    variationId: variation.id,
    itemId: item.id,
    itemName: item.name,
    itemGroup: item.group,
    itemCategory: item.category || '',
    itemSubcategory: item.subcategory || '',
    itemUnit: item.unit,
    variationValues: { ...(variation.values || {}) },
    variationExtras: { ...(variation.extras || {}) },
    qty: quickExitQtyParsed.value,
    supplier: '',
    unitCost: null,
    requestedBy: quickExitRequestedBy.value,
    requestedByPersonId: quickExitRequestedByPersonId.value,
    destination: quickExitDestinationText.value,
    destinationId: quickExitDestinationOther.value ? '' : quickExitDestinationId.value,
    destinationOther: quickExitDestinationOther.value,
    docRef: '',
    note: quickExitNote.value,
  }
}

function addQuickExitLine() {
  quickExitAttempted.value = true
  if (!quickExitCanAdd.value) {
    if (quickExitBlockReason.value) error(quickExitBlockReason.value)
    return
  }
  quickExitQueue.value = [...quickExitQueue.value, quickExitLineFromSelection()]
  quickExitSelected.value = null
  quickExitSearch.value = ''
  quickExitQty.value = '1'
  quickExitNote.value = ''
  quickExitAttempted.value = false
  nextTick(() => focusRef(quickExitSearchInputEl))
}

function removeQuickExitLine(uid) {
  quickExitQueue.value = quickExitQueue.value.filter(line => line.uid !== uid)
}

function clearQuickExitQueue() {
  quickExitQueue.value = []
}

async function confirmQuickExitQueue() {
  if (quickExitPending.value || !quickExitQueue.value.length) return
  const totals = new Map()
  for (const line of quickExitQueue.value) totals.set(line.variationId, (totals.get(line.variationId) || 0) + Number(line.qty || 0))
  for (const [variationId, qty] of totals.entries()) {
    const liveVar = variations.value.find(v => v.id === variationId)
    if (!liveVar) { error('Uma variação da fila não foi encontrada.'); return }
    if (liveVar.stockConfirmed !== false && qty > Number(liveVar.stock || 0)) {
      error(`Estoque insuficiente para ${quickExitQueue.value.find(line => line.variationId === variationId)?.itemName || 'item da fila'}.`)
      return
    }
  }
  try {
    quickExitPending.value = true
    const created = await addMovementBatch('saida', quickExitQueue.value, {})
    for (const movement of created) {
      const updatedVar = variations.value.find(v => v.id === movement.variationId)
      if (updatedVar) { updatedVar.stock = movement.stockAfter; updatedVar.stockConfirmed = movement.stockConfirmed !== false }
    }
    for (const movement of created) notifyStockAlert(movement)
    successWithHistoryAction(`${created.length} saída${created.length === 1 ? '' : 's'} registrada${created.length === 1 ? '' : 's'}.`)
    quickExitQueue.value = []
    nextTick(() => focusRef(quickExitSearchInputEl))
  } catch (e) {
    error(e.message)
  } finally {
    quickExitPending.value = false
  }
}

function commonMovementFields() {
  return {
    supplier: form.value.supplier,
    unitCost: activeSubTab.value === 'entrada' ? parsedUnitCost.value : null,
    requestedBy: form.value.requestedBy,
    requestedByPersonId: activeSubTab.value === 'saida' ? form.value.requestedByPersonId : '',
    destination: form.value.destination,
    destinationId: activeSubTab.value === 'saida' ? movementDestinationId.value : '',
    destinationOther: activeSubTab.value === 'saida' && destSelectVal.value === '__outro__',
    docRef: activeSubTab.value === 'entrada' && docType.value && docType.value !== 'sem' && form.value.docRef.trim()
      ? `${docType.value === 'nf' ? 'NF' : 'PC'} ${form.value.docRef.trim()}`
      : '',
    note: form.value.note,
  }
}

async function ensureSuppliersForLines(lines) {
  const names = [...new Set(lines
    .filter(line => line.type === 'entrada')
    .map(line => String(line.supplier || '').trim())
    .filter(Boolean)
  )]
  for (const name of names) await ensureSupplier(name)
}

function currentMovementLine(liveVar) {
  return {
    uid: `movement_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: activeSubTab.value,
    variationId: liveVar.id,
    itemId: selectedItem.value.id,
    itemName: selectedItem.value.name,
    itemGroup: selectedItem.value.group,
    itemCategory: selectedItem.value.category || '',
    itemSubcategory: selectedItem.value.subcategory || '',
    itemUnit: selectedItem.value.unit,
    variationValues: { ...(liveVar.values || {}) },
    variationExtras: { ...(liveVar.extras || {}) },
    qty: parsedQty.value,
    ...commonMovementFields(),
  }
}

async function confirmCurrentMovement() {
  if (confirmPending.value || !canConfirm.value || !selectedVariation.value || !selectedItem.value) return
  const liveVar = variations.value.find(v => v.id === selectedVariation.value.id)
  if (!liveVar) { error('Variacao nao encontrada.'); return }

  const line = currentMovementLine(liveVar)
  try {
    confirmPending.value = true
    await ensureSuppliersForLines([line])
    const created = await addMovementBatch(activeSubTab.value, [line], {})
    for (const movement of created) {
      const updatedVar = variations.value.find(v => v.id === movement.variationId)
      if (updatedVar) { updatedVar.stock = movement.stockAfter; updatedVar.stockConfirmed = movement.stockConfirmed !== false }
    }
    for (const movement of created) notifyStockAlert(movement)

    successWithHistoryAction(`${activeSubTab.value === 'entrada' ? 'Entrada' : 'Saida'} registrada com sucesso.`)
    const returnTo = props.prefillMovement?.returnTo
    resetCurrentItem()
    if (returnTo) emit('movement-complete', returnTo)
  } catch (e) {
    error(e.message)
  } finally {
    confirmPending.value = false
  }
}

function tryConfirmCurrentMovement() {
  movementFormAttempted.value = true
  if (!canConfirm.value) {
    if (formBlockReason.value) error(formBlockReason.value)
    return
  }
  confirmCurrentMovement()
}

// ===== Helpers =====
function hierarchyLabel(item) {
  return [item.group, item.category, item.subcategory].filter(Boolean).join(' › ')
}

function variationLabel(v, item) {
  const parts = variationAttributeRows(item, v).map(({ key, value }) => `${key}: ${value}`)
  return parts.length ? parts.join(' · ') : '—'
}

function notifyStockAlert(movement) {
  const variation = variations.value.find(v => v.id === movement.variationId)
  const item = items.value.find(i => i.id === movement.itemId)
  const status = stockAlertTransition(movement, variation, item)
  if (!status) return
  const detail = variation ? ` (${variationLabel({ ...variation, values: movement.variationValues, extras: movement.variationExtras }, item)})` : ''
  const unit = movement.itemUnit || item?.unit || ''
  error(status === 'zero'
    ? `${movement.itemName || item?.name || 'Produto'}${detail} ficou sem estoque.`
    : `${movement.itemName || item?.name || 'Produto'}${detail} entrou em alerta de estoque: ${movement.stockAfter} ${unit}.`
  )
}

function formatCurrency(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso) {
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function movementDateLabel(iso) {
  return formatRecentDateTime(iso) || formatDate(iso)
}

const {
  histSearch,
  histDateFrom,
  histDateTo,
  histFacets,
  hasHistFilters,
  toggleHistFilter,
  clearHistFilters,
  filteredMovements,
  paginatedMovements,
  historyCurrentPage,
  historyPageSize,
  historyPageSizeOptions,
  historyTotalPages,
} = useMovementHistory(movements)
function exportHistoryCsv() {
  if (!filteredMovements.value.length) return
  const url = URL.createObjectURL(new Blob([movementHistoryCsv(filteredMovements.value)], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `historico_movimentacoes_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const selectedHistoryFilters = computed(() => histFacets.value.flatMap(facet =>
  facet.selected.map(value => ({ key: facet.key, label: facet.label, value }))))
const orderedHistoryFacets = computed(() => [...histFacets.value].sort((a, b) =>
  ['main', 'product', 'details'].indexOf(a.group) - ['main', 'product', 'details'].indexOf(b.group)
  || a.priority - b.priority))
const primaryHistoryKeys = ['tipo', 'responsavel', 'local', 'grupo', 'categoria']
const primaryHistoryFacets = computed(() => orderedHistoryFacets.value.filter(facet => primaryHistoryKeys.includes(facet.key)))
const extraHistoryFacets = computed(() => orderedHistoryFacets.value.filter(facet => !primaryHistoryKeys.includes(facet.key)))
const moreHistoryFiltersOpen = ref(false)
const historyFilterSearch = ref('')
const searchedHistoryFacets = computed(() => searchHistoryFacets(extraHistoryFacets.value, historyFilterSearch.value))
const extraHistorySelectedCount = computed(() => extraHistoryFacets.value.reduce((count, facet) => count + facet.selected.length, 0))


function successWithHistoryAction(message) {
  success(message, {
    label: 'Ver histórico',
    onClick: () => {
      activeSubTab.value = 'historico'
    },
  })
}

watch(() => props.initialHistorySearch, search => {
  if (search !== null) histSearch.value = search || ''
}, { immediate: true })

const {
  summarySearch,
  expandedSummaryDestId,
  destinationSummaries,
  filteredDestinationSummaries,
  summaryTotals,
} = useDestinationSummary({ destinations, movements, workOrders, getDestFullName })
const deleteReason = ref('')
const deletePendingId = ref(null)
const deleteConfirmPending = ref(false)
const deletePendingMovement = computed(() => movements.value.find(m => m.id === deletePendingId.value) || null)
const deleteStockPreview = computed(() => {
  const movement = deletePendingMovement.value
  if (!movement) return null
  const variation = variations.value.find(v => v.id === movement.variationId)
  if (!variation) return { current: null, after: null, unit: movement.itemUnit || '' }
  const current = Number(variation.stock)
  return {
    current,
    after: movement.type === 'entrada' ? current - movement.qty : current + movement.qty,
    unit: movement.itemUnit || '',
  }
})
const deleteLinkedOrderCount = computed(() => {
  const movementId = deletePendingId.value
  if (!movementId) return 0
  return workOrders.value.filter(order => order.items?.some(item => item.movementId === movementId || item.movement_id === movementId)).length
})

function requestDelete(id) { deleteReason.value = ''; deletePendingId.value = id }
function cancelDelete() { deletePendingId.value = null }
async function confirmDelete() {
  const id = deletePendingId.value
  if (!id || !deleteReason.value.trim()) return
  deleteConfirmPending.value = true
  try {
    const result = await deleteMovement(id, deleteReason.value)
    if (result?.variationId) {
      const liveVar = variations.value.find(v => v.id === result.variationId)
      if (liveVar) liveVar.stock = result.newStock
    }
    for (const itemId of result?.removedWorkOrderItemIds || []) {
      for (const wo of workOrders.value) {
        const idx = wo.items?.findIndex(i => i.id === itemId) ?? -1
        if (idx !== -1) wo.items.splice(idx, 1)
      }
    }
    deletePendingId.value = null
    success('Movimentação excluída e estoque ajustado.')
    if (result.refreshFailed) error('Exclusão salva. Recarregue a página para atualizar os demais saldos do histórico.')
  } catch (e) {
    error(e.message)
  } finally {
    deleteConfirmPending.value = false
  }
}

// Edit movement modal
const editingMovement = ref(null)
const editMovForm = ref({ date: '', qty: '', supplier: '', unitCost: '', requestedBy: '', requestedByPersonId: '', destination: '', docRef: '', note: '' })
const editMovementDestinationId = ref('')
const editMovementDestinationOther = ref(false)
const editMovementSaving = ref(false)
const editSupplierDropdownOpen = ref(false)

function toLocalDatetimeStr(iso) {
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function startEditMovement(m) {
  const person = activePeople.value.find(p =>
    p.id === m.requestedByPersonId ||
    p.name.toLowerCase() === String(m.requestedBy || '').trim().toLowerCase()
  )
  editingMovement.value = m
  editMovementDestinationId.value = movementDestinationIdForName(m.destination)
  editMovementDestinationOther.value = Boolean(m.destination && !editMovementDestinationId.value)
  editSupplierDropdownOpen.value = false
  editMovForm.value = {
    date: toLocalDatetimeStr(m.date),
    qty: m.qty,
    supplier: m.supplier || '',
    unitCost: m.unitCost ?? '',
    requestedBy: person?.name || m.requestedBy || '',
    requestedByPersonId: person?.id || m.requestedByPersonId || '',
    destination: m.destination || '',
    docRef: m.docRef || '',
    note: m.note || '',
    reason: '',
    expectedRevision: m.revision ?? 0,
  }
}

function cancelEditMovement() {
  editingMovement.value = null
  editMovementDestinationId.value = ''
  editMovementDestinationOther.value = false
  editSupplierDropdownOpen.value = false
}

function handleEditMovementDestinationSelect({ fullName }) {
  editMovementDestinationOther.value = false
  editMovForm.value.destination = fullName
}

function handleEditMovementDestinationClear() {
  editMovementDestinationId.value = ''
  editMovementDestinationOther.value = false
  editMovForm.value.destination = ''
}

function handleEditMovementDestinationOther() {
  editMovementDestinationId.value = ''
  editMovementDestinationOther.value = true
  editMovForm.value.destination = ''
}

const filteredEditSuppliers = computed(() => {
  const q = String(editMovForm.value.supplier || '').trim().toLowerCase()
  if (!q) return activeSuppliers.value
  return activeSuppliers.value.filter(s =>
    s.name.toLowerCase().includes(q) ||
    String(s.description || '').toLowerCase().includes(q)
  )
})

const editSupplierNameExists = computed(() => {
  const q = String(editMovForm.value.supplier || '').trim().toLowerCase()
  return Boolean(q && activeSuppliers.value.some(s => s.name.toLowerCase() === q))
})

function selectEditSupplier(supplier) {
  editMovForm.value.supplier = supplier.name
  editSupplierDropdownOpen.value = false
}

function handleEditSupplierEnter() {
  if (filteredEditSuppliers.value.length === 1) selectEditSupplier(filteredEditSuppliers.value[0])
}


const editRequestedPersonIsValid = computed(() => {
  if (!editingMovement.value || editingMovement.value.type !== 'saida') return true
  return activePeople.value.some(p =>
    p.id === editMovForm.value.requestedByPersonId &&
    p.name.toLowerCase() === String(editMovForm.value.requestedBy || '').trim().toLowerCase()
  )
})

function selectEditRequestedPerson(person) {
  editMovForm.value.requestedBy = person.name
  editMovForm.value.requestedByPersonId = person.id
}

function syncEditRequestedPersonFromInput() {
  const q = String(editMovForm.value.requestedBy || '').trim().toLowerCase()
  const exact = activePeople.value.find(p => p.name.toLowerCase() === q)
  editMovForm.value.requestedByPersonId = exact?.id || ''
}


const editUnitCostInvalid = computed(() => {
  if (!editingMovement.value || editingMovement.value.type !== 'entrada') return false
  if (editMovForm.value.unitCost === '' || editMovForm.value.unitCost === null || editMovForm.value.unitCost === undefined) return false
  const n = Number(editMovForm.value.unitCost)
  return !Number.isFinite(n) || n < 0
})

const editMovementBlockReason = computed(() => {
  if (!editingMovement.value) return ''
  if (!editMovForm.value.reason?.trim()) return 'Informe o motivo da correção.'
  const qty = Number(editMovForm.value.qty)
  if (!Number.isFinite(qty) || qty <= 0) return 'Informe uma quantidade maior que zero.'
  if (editingMovement.value.type === 'entrada' && editUnitCostInvalid.value) return 'Informe um custo valido ou deixe vazio.'
  if (editingMovement.value.type === 'saida' && !editMovForm.value.requestedBy.trim()) return 'Selecione quem retirou.'
  if (editingMovement.value.type === 'saida' && !editRequestedPersonIsValid.value) return 'Quem retirou precisa ser uma pessoa cadastrada.'
  if (editingMovement.value.type === 'saida' && !editMovForm.value.destination.trim()) return 'Selecione ou informe o destino.'
  return ''
})

const canSaveEditMovement = computed(() => !editMovementSaving.value && !editMovementBlockReason.value)

async function saveEditMovement() {
  if (!editingMovement.value || editMovementSaving.value) return
  if (!canSaveEditMovement.value) {
    error(editMovementBlockReason.value || 'Revise os campos da movimentacao.')
    return
  }
  const liveVar = variations.value.find(v => v.id === editingMovement.value.variationId)
  const changes = { ...editMovForm.value }
  if (editingMovement.value.type === 'entrada') {
    const supplierName = String(changes.supplier || '').trim()
    if (supplierName) {
      try {
        await ensureSupplier(supplierName)
      } catch (e) {
        error(e.message)
        return
      }
    }
    changes.unitCost = changes.unitCost === '' ? null : Number(changes.unitCost)
    if (changes.unitCost !== null && (!Number.isFinite(changes.unitCost) || changes.unitCost < 0)) {
      error('Custo unitario invalido.')
      return
    }
  } else {
    changes.unitCost = null
    const person = activePeople.value.find(p => p.name.toLowerCase() === String(changes.requestedBy || '').trim().toLowerCase())
    changes.requestedByPersonId = person?.id || ''
    changes.destinationId = editMovementDestinationId.value
    changes.destinationOther = editMovementDestinationOther.value
  }
  // Convert local datetime string to ISO
  if (changes.date) changes.date = new Date(changes.date).toISOString()
  editMovementSaving.value = true
  try {
    const result = await editMovement(editingMovement.value.id, changes, liveVar)
    if (!result.ok) { error(result.error); return }
    success('Movimentacao atualizada!')
    if (result.refreshFailed) error('Correção salva. Recarregue a página para atualizar os demais saldos do histórico.')
    editingMovement.value = null
    editMovementDestinationId.value = ''
    editMovementDestinationOther.value = false
  } finally {
    editMovementSaving.value = false
  }
}

defineExpose({
  histFacets,
  hasHistFilters,
  toggleHistFilter,
  clearHistFilters,
  histSearch,
  histDateFrom,
  histDateTo,
})
</script>

<template>
  <div class="movement-workspace space-y-4">

    <header class="movement-page-header">
      <div class="movement-page-intro">
        <div>
          <h1>{{ pageHeading.title }}</h1>
          <p>{{ pageHeading.description }}</p>
        </div>
        <span v-if="activeSubTab === 'entrada' || activeSubTab === 'saida'" class="movement-step" aria-live="polite">
          <span>Etapa {{ registrationStep }} de 2</span>
          {{ registrationStep === 1 ? 'Selecionar material' : 'Preencher e confirmar' }}
        </span>
      </div>
      <div v-if="canOperate && isRegistering" class="movement-modes">
        <SectionTabs route-tab="movimentacoes" aria-label="Modo de registro"
          :model-value="activeSubTab" :tabs="registrationTabs" @update:model-value="switchSubTab" />
      </div>
    </header>

    <!-- ======================================================= -->
    <!-- ENTRADA / SAÍDA — step flow                             -->
    <!-- ======================================================= -->
    <PhotoMovementTab v-if="activeSubTab === 'fotos'" />
    <MovementImportTab v-else-if="activeSubTab === 'importacao' && isAdmin" />

    <template v-else-if="activeSubTab === 'entrada' || activeSubTab === 'saida'">


      <!-- Direct selection: search and hierarchy filters work together. -->
      <section v-if="step === 1" aria-label="Selecionar material" class="movement-picker">
        <section class="movement-picker-tools" aria-labelledby="movement-search-title">
          <div class="movement-search-heading">
            <h2 id="movement-search-title" class="movement-picker-title">Encontrar material</h2>
            <AppButton v-if="itemSearch || activeGroup" variant="ghost" size="sm" @click="clearPickerFilters">Limpar filtros</AppButton>
          </div>
          <div class="movement-search-fields">
          <label class="movement-search">
            <span class="movement-label">Pesquisar por nome ou característica</span>
            <span class="movement-search-control">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path stroke-linecap="round" d="m16 16 4 4" /></svg>
            <input ref="searchInputEl" v-model="itemSearch" type="search" class="ds-query-input"
              aria-label="Buscar material para movimentar" placeholder="Nome, medida, marca, CA ou local…"
              @keydown.enter.prevent="handleItemSearchEnter" />
            </span>
          </label>
          <div class="movement-filter-row">
            <label><span class="movement-label">Grupo</span>
              <select :value="activeGroup || ''" @change="setActiveGroup($event.target.value || null)">
                <option value="">Todos os grupos</option><option v-for="group in uniqueGroups" :key="group">{{ group }}</option>
              </select>
            </label>
            <label><span class="movement-label">Categoria</span>
              <select :value="activeCategory || ''" :disabled="!activeGroup" @change="setActiveCategory($event.target.value || null)">
                <option value="">Todas as categorias</option><option v-for="category in navCategories" :key="category">{{ category }}</option>
              </select>
            </label>
            <label v-if="navSubcategories.length"><span class="movement-label">Subcategoria</span>
              <select :value="activeSubcategory || ''" @change="setActiveSubcategory($event.target.value || null)">
                <option value="">Todas as subcategorias</option><option v-for="subcategory in navSubcategories" :key="subcategory">{{ subcategory }}</option>
              </select>
            </label>
          </div>
          </div>
        </section>
        <section v-if="itemSearch.trim()" aria-label="Resultados da busca de materiais">
        <div class="movement-selection-panel">
        <EmptyState v-if="!variationResults.length" title="Nenhuma variação encontrada."
          text="Revise a busca e os filtros de grupo e categoria." :action-label="itemSearch || activeGroup ? 'Limpar filtros' : ''" @action="clearPickerFilters" />
        <div v-else class="movement-results">
          <div class="movement-result movement-column-headings" aria-hidden="true">
            <span>Material</span><span>Variação</span><span>Local</span><span>Saldo atual</span><span></span>
          </div>
          <button v-for="result in pickerRows" :key="result.variation.id" type="button" class="movement-result movement-result-button"
            :disabled="activeSubTab === 'saida' && result.variation.stockConfirmed !== false && result.variation.stock <= 0"
            @click="selectVariationResult(result)">
            <span class="movement-material">
              <strong>{{ result.item.name }}</strong>
              <small :title="hierarchyLabel(result.item)">{{ hierarchyLabel(result.item) }}</small>
            </span>
            <AttributeBadges class="movement-attributes" :item="result.item" :variation="result.variation" compact />
            <span class="movement-location" :class="{ 'movement-location-empty': !result.variation.location && !result.item.location }">{{ result.variation.location || result.item.location || 'Não informado' }}</span>
            <span class="movement-stock">
              <strong :class="{ 'movement-stock-empty': result.variation.stock <= 0 }">{{ result.variation.stock }} <small>{{ result.item.unit }}</small></strong>
              <small v-if="result.variation.stockConfirmed === false" class="movement-stock-check" title="A contagem física será solicitada antes de registrar a primeira movimentação desta variação.">Conferir saldo</small>
              <small v-else-if="result.variation.stock <= 0" class="movement-stock-empty">Sem estoque</small>
            </span>
            <span class="movement-next" aria-hidden="true">{{ activeSubTab === 'saida' && result.variation.stockConfirmed !== false && result.variation.stock <= 0 ? 'Indisponível' : 'Selecionar →' }}</span>
          </button>
        </div>
        <div v-if="pickerPages > 1" class="movement-pagination">
          <span>{{ (pickerPage - 1) * pickerPageSize + 1 }}–{{ Math.min(pickerPage * pickerPageSize, variationResults.length) }} de {{ variationResults.length }}</span>
          <AppButton variant="secondary" size="sm" :disabled="pickerPage === 1" @click="pickerPage--">Anterior</AppButton>
          <span>Página {{ pickerPage }} de {{ pickerPages }}</span>
          <AppButton variant="secondary" size="sm" :disabled="pickerPage === pickerPages" @click="pickerPage++">Próxima</AppButton>
        </div>
        </div>
        </section>
        <div v-else class="movement-search-idle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path stroke-linecap="round" d="m16 16 4 4" /></svg>
          <div>
            <p>Pesquise um material para começar</p>
            <span>Digite um nome, medida, marca ou CA. Use os filtros para refinar a busca.</span>
          </div>
        </div>
      </section>

      <!-- ===== STEP 2: Pick variation ===== -->
      <div v-else-if="step === 2">

        <!-- Breadcrumb: hierarchy + item name -->
        <div class="flex items-center gap-1.5 text-sm mb-5 flex-wrap">
          <button
            type="button"
            class="text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
            @click="backToHierarchyLevel('group')"
          >{{ selectedItem?.group }}</button>
          <template v-if="selectedItem?.category">
            <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
            <button
              type="button"
              class="text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
              @click="backToHierarchyLevel('category')"
            >{{ selectedItem.category }}</button>
          </template>
          <template v-if="selectedItem?.subcategory">
            <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
            <button
              type="button"
              class="text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
              @click="backToHierarchyLevel('subcategory')"
            >{{ selectedItem.subcategory }}</button>
          </template>
          <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          <button
            type="button"
            class="text-gray-800 dark:text-gray-100 font-semibold hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
            @click="backToStep1"
          >{{ selectedItem?.name }}</button>
        </div>

        <!-- Item header (like catalog) -->
        <div class="flex items-center gap-4 mb-5">
          <button
            class="w-12 h-12 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Voltar"
            @click="backToStep1"
          >
            <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div class="flex-1 min-w-0">
            <h2 class="text-xl font-bold text-gray-800 dark:text-gray-100">{{ selectedItem?.name }}</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ selectedItem?.unit }} &middot; Mín. {{ selectedItem?.minStock ?? '—' }}  &middot;
              <span :class="selectedItem?.minStock > 0 && getTotalStock(selectedItem?.id) < selectedItem.minStock ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-green-600 dark:text-green-400 font-semibold'">
                Estoque: {{ getTotalStock(selectedItem?.id) }}
              </span>
            </p>
          </div>
          <span class="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Escolha uma variação</span>
        </div>

        <!-- No variations -->
        <div v-if="itemVariations.length === 0" class="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
          Este item não tem variações cadastradas.
        </div>

        <!-- Variations table (like catalog) -->
        <div v-else class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <th v-for="attr in orderedAttributeNames(selectedItem)" :key="attr" class="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300">{{ attr }}</th>
                  <th class="text-center px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300 w-20">Qtd.</th>
                  <th class="text-center px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300 w-20">Mín.</th>
                  <th class="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300">Local</th>
                  <th class="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300">Destinos</th>
                  <th class="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300">Obs.</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="v in itemVariations"
                  :key="v.id"
                  class="border-b border-gray-100 dark:border-gray-700/50 transition-colors"
                  :class="activeSubTab === 'saida' && v.stockConfirmed !== false && v.stock <= 0
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer'"
                  @click="!(activeSubTab === 'saida' && v.stockConfirmed !== false && v.stock <= 0) && selectVariation(v)"
                >
                  <td v-for="attr in orderedAttributeNames(selectedItem)" :key="attr" class="px-4 py-2.5 text-gray-700 dark:text-gray-300">{{ v.values?.[attr] || '—' }}</td>
                  <td
                    class="px-4 py-2.5 text-center tabular-nums font-medium"
                    :class="v.stock <= 0 ? 'text-red-500 dark:text-red-400' : (v.minStock > 0 && v.stock <= v.minStock) ? 'text-amber-500 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'"
                  >
                    {{ v.stock }}
                    <span v-if="v.stock <= 0" class="ml-1 text-[10px]">&#x1F534;</span>
                    <span v-else-if="v.minStock > 0 && v.stock <= v.minStock" class="ml-1 text-[10px]">&#x1F7E1;</span>
                  </td>
                  <td class="px-4 py-2.5 text-center tabular-nums text-gray-500 dark:text-gray-400">
                    {{ v.minStock ?? '—' }}
                  </td>
                  <td class="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                    {{ v.location || selectedItem?.location || '—' }}
                  </td>
                  <td class="px-4 py-2.5">
                    <div v-if="v.destinations && v.destinations.length" class="flex flex-wrap gap-1">
                      <span
                        v-for="destId in v.destinations"
                        :key="destId"
                        class="px-1.5 py-0.5 text-[11px] rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 whitespace-nowrap"
                      >{{ getDestinationName(destId) }}</span>
                    </div>
                    <span v-else class="text-gray-300 dark:text-gray-600">—</span>
                  </td>
                  <td class="px-4 py-2.5 text-sm">
                    <template v-if="v.extras && Object.keys(v.extras).length">
                      <span v-for="(key, i) in sortedAttributeNames(Object.keys(v.extras))" :key="key">
                        <span class="font-medium text-gray-600 dark:text-gray-400">{{ key }}</span><span class="text-gray-400 dark:text-gray-500">:</span> <span class="text-gray-700 dark:text-gray-300">{{ v.extras[key] }}</span><span v-if="i < Object.keys(v.extras).length - 1" class="mx-1 text-gray-300 dark:text-gray-600">&middot;</span>
                      </span>
                    </template>
                    <span v-else class="text-gray-300 dark:text-gray-600">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ===== STEP 3: Form ===== -->
      <div
        v-else-if="step === 3"
        class="rounded-xl border shadow-sm"
        :class="activeSubTab === 'entrada'
          ? 'border-green-400/70 dark:border-green-700/80'
          : 'border-red-400/70 dark:border-red-700/80'"
      >

        <!-- Header -->
        <div
          class="flex items-center gap-3 px-4 py-3 border-b rounded-t-xl"
          :class="activeSubTab === 'entrada'
            ? 'border-green-200 bg-green-50/80 dark:border-green-900/60 dark:bg-green-950/20'
            : 'border-red-200 bg-red-50/80 dark:border-red-900/60 dark:bg-red-950/20'"
        >
          <button
            class="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer"
            title="Voltar para variações"
            @click="backToStep2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span
            class="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            :class="activeSubTab === 'entrada'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'"
          >
            {{ activeSubTab === 'entrada' ? 'Entrada' : 'Saída' }}
          </span>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Movimentando agora</p>
            <p class="text-base font-semibold text-gray-800 dark:text-gray-100 truncate">{{ selectedItem?.name }}</p>
            <p class="text-[11px] text-gray-400 dark:text-gray-500 truncate">
              {{ hierarchyLabel(selectedItem) }} · {{ variationLabel(selectedVariation, selectedItem) }}
            </p>
          </div>
          <!-- Estoque atual badge -->
          <div class="flex-shrink-0 text-right">
            <p class="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Estoque</p>
            <p class="text-sm font-bold text-gray-700 dark:text-gray-200">{{ selectedVariation?.stock }} <span class="font-normal text-xs">{{ selectedItem?.unit }}</span></p>
          </div>
        </div>

        <!-- Form body -->
        <form
          class="bg-white dark:bg-gray-900 p-5 rounded-b-xl"
          @submit.prevent="tryConfirmCurrentMovement"
        >
          <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 content-start">

          <!-- Quantidade -->
          <div class="md:col-span-2">
            <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">
              Quantidade <span class="text-red-500">*</span>
            </label>
            <div class="flex items-center gap-2">
              <input
                ref="qtyInputEl"
                v-model="form.qty"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                class="w-36 px-3 py-2.5 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 transition-colors"
                :class="movementFormAttempted && saidaExceedsStock
                  ? 'border-amber-400 dark:border-amber-700 focus:border-amber-500 focus:ring-amber-500'
                  : 'border-gray-300 dark:border-gray-600 focus:border-primary-500 focus:ring-primary-500'"
                @keydown.enter.prevent="tryConfirmCurrentMovement"
              />
              <span class="text-sm text-gray-500 dark:text-gray-400">{{ selectedItem?.unit }}</span>
            </div>
            <p v-if="movementFormAttempted && saidaExceedsStock" class="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Quantidade excede o estoque disponivel ({{ selectedAvailableStock }} {{ selectedItem?.unit }}).
            </p>
            <p v-else-if="activeSubTab === 'saida' && selectedVariation" class="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Disponivel: {{ selectedAvailableStock }} {{ selectedItem?.unit }}
            </p>
          </div>

          <!-- ENTRADA fields -->
          <template v-if="activeSubTab === 'entrada'">
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fornecedor</label>
              <div class="relative">
                <div v-if="supplierDropdownOpen" class="fixed inset-0 z-10" @click="closeSupplierDropdown"></div>
                <input
                  v-model="form.supplier"
                  type="text"
                  role="combobox"
                  aria-controls="supplier-options"
                  :aria-expanded="supplierDropdownOpen"
                  :aria-activedescendant="supplierActiveIndex >= 0 ? `supplier-option-${filteredSuppliers[supplierActiveIndex]?.id}` : undefined"
                  placeholder="Buscar ou digitar fornecedor..."
                  class="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                  @focus="openSupplierDropdown"
                  @input="openSupplierDropdown"
                  @blur="closeSupplierDropdown"
                  @keydown="handleSupplierKeydown"
                />
                <div
                  v-if="supplierDropdownOpen"
                  id="supplier-options"
                  ref="supplierListEl"
                  role="listbox"
                  class="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl overflow-hidden"
                >
                  <div class="max-h-56 overflow-y-auto py-1">
                    <button
                      v-for="(supplier, index) in filteredSuppliers"
                      :id="`supplier-option-${supplier.id}`"
                      :key="supplier.id"
                      type="button"
                      role="option"
                      tabindex="-1"
                      :aria-selected="supplierActiveIndex === index"
                      class="w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                      :class="supplierActiveIndex === index ? 'bg-gray-50 dark:bg-gray-700/60' : ''"
                      @mouseenter="supplierActiveIndex = index"
                      @mousedown.prevent="selectSupplier(supplier)"
                    >
                      <span class="font-medium truncate">{{ supplier.name }}</span>
                      <span v-if="supplier.description" class="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{{ supplier.description }}</span>
                    </button>
                    <p v-if="!filteredSuppliers.length" class="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
                      Nenhum fornecedor cadastrado encontrado.
                    </p>
                  </div>
                </div>
              </div>
              <p class="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                {{ form.supplier && !supplierNameExists ? 'Novo fornecedor sera cadastrado ao confirmar.' : 'Selecione um cadastrado para evitar duplicatas.' }}
              </p>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Custo unitario</label>
              <input
                v-model="form.unitCost"
                type="number"
                min="0"
                step="0.01"
                placeholder="Opcional"
                class="w-full px-3 py-2.5 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 transition-colors"
                :class="movementFormAttempted && form.unitCost !== '' && parsedUnitCost === null
                  ? 'border-amber-400 dark:border-amber-700 focus:border-amber-500 focus:ring-amber-500'
                  : 'border-gray-300 dark:border-gray-600 focus:border-primary-500 focus:ring-primary-500'"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nº Documento</label>
              <div
                class="flex items-stretch rounded-xl border transition-colors"
                :class="docType !== 'sem' ? 'border-gray-300 dark:border-gray-600 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500' : 'border-gray-200 dark:border-gray-700'"
              >
                <div class="relative flex-shrink-0 border-r border-gray-200 dark:border-gray-700">
                  <select
                    v-model="docType"
                    aria-label="Tipo de documento"
                    class="h-full min-w-28 rounded-l-xl border-0 px-3 py-2.5 text-xs font-semibold transition-colors focus:outline-none"
                    :class="docType !== 'sem'
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/30'
                      : 'bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60'"
                    @change="selectDocType(docType)"
                  >
                    <option value="sem">Sem doc.</option>
                    <option value="nf">NF-e</option>
                    <option value="pedido">PC</option>
                  </select>
                </div>
                <!-- Number input -->
                <input
                  v-if="docType !== 'sem'"
                  v-model="form.docRef"
                  type="text"
                  :placeholder="docType === 'nf' ? 'Número da NF-e...' : 'Número do pedido...'"
                  class="flex-1 min-w-0 px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none rounded-r-xl"
                />
                <span
                  v-else
                  class="flex-1 flex items-center px-3 text-xs text-gray-400 dark:text-gray-500 italic bg-white dark:bg-gray-800 rounded-r-xl"
                >Sem documento</span>
              </div>
            </div>
          </template>

          <!-- SAÍDA fields -->
          <template v-else>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Quem retirou <span class="text-red-500">*</span>
              </label>
              <template v-if="activePeople.length">
                <PersonPicker
                  :model-value="form.requestedBy"
                  placeholder="Buscar pessoa cadastrada..."
                  :invalid="movementFormAttempted && Boolean(form.requestedBy) && !requestedPersonIsValid"
                  @update:model-value="value => { form.requestedBy = value; syncRequestedPersonFromInput() }"
                  @select="selectRequestedPerson"
                />
                <p v-if="movementFormAttempted && form.requestedBy && !requestedPersonIsValid" class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Selecione uma pessoa cadastrada.
                </p>
              </template>
              <p v-else class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                Cadastre pessoas antes de registrar saidas.
              </p>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Local de destino <span class="text-red-500">*</span>
              </label>
              <template v-if="activeDestinations.length">
                <DestinationTreePicker
                  v-model="movementDestinationId"
                  :linked-ids="linkedDestinationIds"
                  allow-other
                  placeholder="Pesquisar destino..."
                  other-label="Outro (digitar)..."
                  @select="handleMovementDestinationSelect"
                  @clear="handleMovementDestinationClear"
                  @other="handleMovementDestinationOther"
                />
                <input
                  v-if="destSelectVal === '__outro__'"
                  v-model="form.destination"
                  type="text"
                  placeholder="Digite o destino..."
                  class="mt-2 w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                  autofocus
                />
              </template>
              <input
                v-else
                v-model="form.destination"
                type="text"
                placeholder="Ex: Obra São Paulo, Depósito B..."
                class="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              />
            </div>
          </template>

          <!-- Observação (both) -->
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Observação</label>
            <input
              v-model="form.note"
              type="text"
              placeholder="Observação opcional..."
              class="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
          </div>

          <div class="md:col-span-2 border-t border-gray-200 dark:border-gray-700 pt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              class="px-5 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              :class="canConfirm && !confirmPending
                ? activeSubTab === 'entrada'
                  ? 'bg-[var(--ds-success-solid)] hover:bg-[var(--ds-success-hover)] text-white'
                  : 'bg-[var(--ds-danger-solid)] hover:bg-[var(--ds-danger-hover)] text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'"
              :aria-disabled="!canConfirm || confirmPending"
              :disabled="confirmPending"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path v-if="activeSubTab === 'entrada'" stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m0-15 6 6m-6-6-6 6" />
                <path v-else stroke-linecap="round" stroke-linejoin="round" d="M12 19.5v-15m0 15-6-6m6 6 6-6" />
              </svg>
              {{ confirmPending ? 'Registrando...' : activeSubTab === 'entrada' ? 'Registrar entrada' : 'Registrar saida' }}
            </button>
            <button
              type="button"
              class="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              @click="resetCurrentItem"
            >
              Voltar a selecao
            </button>
            <p v-if="visibleFormBlockReason" class="text-xs text-amber-600 dark:text-amber-400">
              {{ visibleFormBlockReason }}
            </p>
          </div>
          </div>
        </form>

      </div>

    </template>

    <!-- ======================================================= -->
    <!-- MOVIMENTACAO RAPIDA                                     -->
    <!-- ======================================================= -->
    <template v-else-if="activeSubTab === 'rapida'">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Movimentação rápida</p>
          <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100">Lançar itens em sequência</h2>
        </div>
        <div class="inline-flex rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            :class="activeQuickMovementType === 'saida'
              ? 'bg-[var(--ds-danger-solid)] text-white shadow-sm'
              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'"
            @click="setQuickMovementType('saida')"
          >
            Saída
          </button>
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            :class="activeQuickMovementType === 'entrada'
              ? 'bg-[var(--ds-success-solid)] text-white shadow-sm'
              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'"
            @click="setQuickMovementType('entrada')"
          >
            Entrada
          </button>
        </div>
      </div>

      <div v-if="activeQuickMovementType === 'entrada'" class="quick-movement-layout">
        <section class="quick-movement-editor">
          <section class="quick-search-panel" aria-label="Pesquisar material">
          <div class="mb-4">
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Entrada rápida</p>
            <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100">Encontrar material para entrada</h2>
          </div>

          <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div class="lg:col-span-2">
              <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Buscar item ou variação</label>
              <div class="relative">
                <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  ref="quickEntrySearchInputEl"
                  v-model="quickEntrySearch"
                  type="text"
                  placeholder="Nome, medida, marca, CA ou local…"
                  class="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm text-gray-800 transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  @keydown.enter.prevent="handleQuickEntrySearchEnter"
                />
                <button
                  v-if="quickEntrySearch"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  type="button"
                  @click="quickEntrySearch = ''"
                >
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div v-if="quickEntrySearch && quickEntryResults.length" class="lg:col-span-2 movement-selection-panel">
              <div class="movement-result movement-column-headings quick-movement-result" aria-hidden="true">
                <span>Material</span><span>Variação</span><span>Saldo</span><span></span>
              </div>
              <button
                v-for="result in quickEntryResults"
                :key="result.variation.id"
                type="button"
                class="movement-result movement-result-button quick-movement-result"
                @click="selectQuickEntryResult(result)"
              >
                <span class="movement-material">
                  <strong>{{ result.item.name }}</strong>
                  <small :title="hierarchyLabel(result.item)">{{ hierarchyLabel(result.item) }}</small>
                </span>
                <AttributeBadges class="movement-attributes" :item="result.item" :variation="result.variation" compact />
                <span class="movement-stock">
                  <strong :class="{ 'movement-stock-empty': result.variation.stock <= 0 }">{{ result.variation.stock }} <small>{{ result.item.unit }}</small></strong>
                  <small v-if="result.variation.stockConfirmed === false" class="movement-stock-check">Conferir saldo</small>
                  <small v-else-if="result.variation.stock <= 0">Sem estoque</small>
                </span>
                <span class="movement-next" aria-hidden="true">{{ 'Selecionar →' }}</span>
              </button>
            </div>
            <p v-else-if="quickEntrySearch" class="lg:col-span-2 rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
              Nenhuma variação encontrada.
            </p>

          </div>
          </section>
          <section class="quick-details-panel" aria-label="Dados da entrada">
            <header class="quick-details-heading">
              <h2 class="movement-picker-title">Dados da entrada</h2>
              <p>Preencha os dados e adicione o material à fila.</p>
            </header>
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div v-if="quickEntrySelected" class="quick-selected-material lg:col-span-2">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-bold text-gray-900 dark:text-gray-100">{{ quickEntrySelected.item.name }}</p>
                  <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ hierarchyLabel(quickEntrySelected.item) }}</p>
                  <AttributeBadges class="mt-2" :item="quickEntrySelected.item" :variation="quickEntrySelected.variation" compact />
                </div>
                <div class="text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {{ quickEntrySelected.variation.stock }} {{ quickEntrySelected.item.unit }}
                  <p class="text-[11px] font-normal uppercase tracking-wider text-gray-400 dark:text-gray-500">atual</p>
                </div>
              </div>
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Quantidade</label>
              <input
                v-model="quickEntryQty"
                type="number"
                min="1"
                step="1"
                class="w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-800 transition-colors focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-gray-100"
                :class="quickEntryAttempted && !quickEntryQtyParsed
                  ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500 dark:border-amber-700'
                  : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600'"
                @keydown.enter.prevent="addQuickEntryLine"
              />
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Custo unitario</label>
              <input
                v-model="quickEntryUnitCost"
                type="number"
                min="0"
                step="0.01"
                placeholder="Opcional"
                class="w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-800 transition-colors focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-gray-100"
                :class="quickEntryAttempted && quickEntryUnitCost !== '' && quickEntryUnitCostParsed === null
                  ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500 dark:border-amber-700'
                  : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600'"
                @keydown.enter.prevent="addQuickEntryLine"
              />
            </div>

            <div class="relative">
              <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Fornecedor</label>
              <div v-if="quickEntrySupplierDropdownOpen" class="fixed inset-0 z-10" @click="quickEntrySupplierDropdownOpen = false"></div>
              <input
                v-model="quickEntrySupplier"
                type="text"
                placeholder="Buscar ou digitar fornecedor..."
                class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                @focus="quickEntrySupplierDropdownOpen = true"
                @input="quickEntrySupplierDropdownOpen = true"
                @blur="quickEntrySupplierDropdownOpen = false"
                @keydown.tab="quickEntrySupplierDropdownOpen = false"
                @keydown.enter.prevent="handleQuickEntrySupplierEnter"
              />
              <div v-if="quickEntrySupplierDropdownOpen" class="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                <button
                  v-for="supplier in quickEntryFilteredSuppliers"
                  :key="supplier.id"
                  type="button"
                  tabindex="-1"
                  class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/60"
                  @mousedown.prevent="selectQuickEntrySupplier(supplier)"
                >
                  <span class="truncate font-medium">{{ supplier.name }}</span>
                  <span v-if="supplier.description" class="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">{{ supplier.description }}</span>
                </button>
                <p v-if="!quickEntryFilteredSuppliers.length" class="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">Nenhum fornecedor encontrado.</p>
              </div>
              <p class="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                {{ quickEntrySupplier && !quickEntrySupplierNameExists ? 'Novo fornecedor sera cadastrado ao confirmar.' : 'Opcional.' }}
              </p>
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Nº Documento</label>
              <div
                class="flex items-stretch rounded-xl border transition-colors"
                :class="quickEntryDocType !== 'sem' ? 'border-gray-300 dark:border-gray-600 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500' : 'border-gray-200 dark:border-gray-700'"
              >
                <div class="relative flex-shrink-0 border-r border-gray-200 dark:border-gray-700">
                  <select
                    v-model="quickEntryDocType"
                    aria-label="Tipo de documento"
                    class="h-full min-w-28 rounded-l-xl border-0 px-3 py-2 text-xs font-semibold transition-colors focus:outline-none"
                    :class="quickEntryDocType !== 'sem'
                      ? 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/20 dark:text-primary-300 dark:hover:bg-primary-900/30'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-800/60 dark:text-gray-400 dark:hover:bg-gray-700/60'"
                    @change="selectQuickEntryDocType(quickEntryDocType)"
                  >
                    <option value="sem">Sem doc.</option>
                    <option value="nf">NF-e</option>
                    <option value="pedido">PC</option>
                  </select>
                </div>
                <input
                  v-if="quickEntryDocType !== 'sem'"
                  v-model="quickEntryDocRef"
                  type="text"
                  :placeholder="quickEntryDocType === 'nf' ? 'Numero da NF-e...' : 'Numero do pedido...'"
                  class="min-w-0 flex-1 rounded-r-xl bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-600"
                  @keydown.enter.prevent="addQuickEntryLine"
                />
                <span
                  v-else
                  class="flex flex-1 items-center rounded-r-xl bg-white px-3 text-xs italic text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                >Sem documento</span>
              </div>
            </div>

            <div class="lg:col-span-2">
              <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Observação</label>
              <input
                v-model="quickEntryNote"
                type="text"
                placeholder="Opcional..."
                class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                @keydown.enter.prevent="addQuickEntryLine"
              />
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              :class="quickEntryCanAdd
                ? 'bg-[var(--ds-success-solid)] text-white hover:bg-[var(--ds-success-hover)]'
                : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'"
              @click="addQuickEntryLine"
            >
              Adicionar à fila
            </button>
            <p v-if="quickEntryAttempted && quickEntryBlockReason" class="text-xs text-amber-600 dark:text-amber-400">{{ quickEntryBlockReason }}</p>
          </div>
          </section>
        </section>

        <aside class="quick-queue overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Fila de entrada</p>
              <p class="text-sm font-bold text-gray-900 dark:text-gray-100">{{ quickEntryQueue.length }} item{{ quickEntryQueue.length === 1 ? '' : 's' }}</p>
            </div>
            <button
              v-if="quickEntryQueue.length"
              type="button"
              class="text-xs text-gray-400 hover:text-red-500"
              @click="clearQuickEntryQueue"
            >
              Limpar
            </button>
          </div>

          <div v-if="quickEntryQueue.length" class="max-h-[28rem] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            <div v-for="line in quickEntryQueue" :key="line.uid" class="px-4 py-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ line.itemName }}</p>
                  <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ [line.itemGroup, line.itemCategory, line.itemSubcategory].filter(Boolean).join(' > ') }}</p>
                  <AttributeBadges class="mt-2" :item="items.find(item => item.id === line.itemId)" :variation="{ values: line.variationValues, extras: line.variationExtras }" compact />
                  <p class="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                    {{ [line.supplier, line.unitCost !== null ? `Custo: R$ ${Number(line.unitCost).toFixed(2)}` : '', line.docRef].filter(Boolean).join(' · ') || 'Sem fornecedor/custo/doc.' }}
                  </p>
                </div>
                <div class="flex-shrink-0 text-right">
                  <p class="text-sm font-bold text-green-600 dark:text-green-400">+{{ line.qty }} {{ line.itemUnit }}</p>
                  <button type="button" class="mt-2 text-xs text-red-500 hover:text-red-600" @click="removeQuickEntryLine(line.uid)">Remover</button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
            Nenhuma entrada na fila.
            <p class="mt-2 text-xs">Adicione materiais ao lado. O estoque será atualizado ao confirmar.</p>
          </div>

          <div class="border-t border-gray-200 p-4 dark:border-gray-700">
            <button
              type="button"
              class="w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
              :class="quickEntryQueue.length && !quickEntryPending
                ? 'bg-primary-600 text-[var(--ds-primary-text)] hover:bg-primary-700'
                : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'"
              :disabled="!quickEntryQueue.length || quickEntryPending"
              @click="confirmQuickEntryQueue"
            >
              {{ quickEntryPending ? 'Confirmando...' : `Confirmar ${quickEntryQueue.length || ''} entrada${quickEntryQueue.length === 1 ? '' : 's'}` }}
            </button>
          </div>
        </aside>
      </div>

    <!-- ======================================================= -->
    <!-- SAIDA RAPIDA                                            -->
    <!-- ======================================================= -->
      <div v-else class="quick-movement-layout">
        <section class="quick-movement-editor">
          <section class="quick-search-panel" aria-label="Pesquisar material">
          <div class="mb-4">
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Saída rápida</p>
            <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100">Encontrar material para saída</h2>
          </div>

          <div class="grid grid-cols-1 gap-4 lg:grid-cols-[9rem_minmax(0,1fr)]">
            <div class="lg:col-span-2">
              <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Buscar item ou variação</label>
              <div class="relative">
                <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  ref="quickExitSearchInputEl"
                  v-model="quickExitSearch"
                  type="text"
                  placeholder="Nome, medida, marca, CA ou local…"
                  class="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm text-gray-800 transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  @keydown.enter.prevent="handleQuickExitSearchEnter"
                />
                <button
                  v-if="quickExitSearch"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  type="button"
                  @click="quickExitSearch = ''"
                >
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div v-if="quickExitSearch && quickExitResults.length" class="lg:col-span-2 movement-selection-panel">
              <div class="movement-result movement-column-headings quick-movement-result" aria-hidden="true">
                <span>Material</span><span>Variação</span><span>Saldo</span><span></span>
              </div>
              <button
                v-for="result in quickExitResults"
                :key="result.variation.id"
                type="button"
                class="movement-result movement-result-button quick-movement-result"
                :disabled="result.variation.stockConfirmed !== false && result.variation.stock <= 0"
                @click="selectQuickExitResult(result)"
              >
                <span class="movement-material">
                  <strong>{{ result.item.name }}</strong>
                  <small :title="hierarchyLabel(result.item)">{{ hierarchyLabel(result.item) }}</small>
                </span>
                <AttributeBadges class="movement-attributes" :item="result.item" :variation="result.variation" compact />
                <span class="movement-stock">
                  <strong :class="{ 'movement-stock-empty': result.variation.stock <= 0 }">{{ result.variation.stock }} <small>{{ result.item.unit }}</small></strong>
                  <small v-if="result.variation.stockConfirmed === false" class="movement-stock-check">Conferir saldo</small>
                  <small v-else-if="result.variation.stock <= 0">Sem estoque</small>
                </span>
                <span class="movement-next" aria-hidden="true">{{ result.variation.stockConfirmed !== false && result.variation.stock <= 0 ? 'Indisponível' : 'Selecionar →' }}</span>
              </button>
            </div>
            <p v-else-if="quickExitSearch" class="lg:col-span-2 rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
              Nenhuma variação encontrada.
            </p>

          </div>
          </section>
          <section class="quick-details-panel" aria-label="Dados da saída">
            <header class="quick-details-heading">
              <h2 class="movement-picker-title">Dados da saída</h2>
              <p>Preencha os dados e adicione o material à fila.</p>
            </header>
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-[9rem_minmax(0,1fr)]">
            <div v-if="quickExitSelected" class="quick-selected-material lg:col-span-2">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-bold text-gray-900 dark:text-gray-100">{{ quickExitSelected.item.name }}</p>
                  <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ hierarchyLabel(quickExitSelected.item) }}</p>
                  <AttributeBadges class="mt-2" :item="quickExitSelected.item" :variation="quickExitSelected.variation" compact />
                </div>
                <div class="text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {{ quickExitAvailableStock }} {{ quickExitSelected.item.unit }}
                  <p class="text-[11px] font-normal uppercase tracking-wider text-gray-400 dark:text-gray-500">disponivel</p>
                </div>
              </div>
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Quantidade</label>
              <input
                v-model="quickExitQty"
                type="number"
                min="1"
                step="1"
                class="w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-800 transition-colors focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-gray-100"
                :class="quickExitAttempted && (!quickExitQtyParsed || (quickExitSelected.variation.stockConfirmed !== false && quickExitQtyParsed > quickExitAvailableStock))
                  ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500 dark:border-amber-700'
                  : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600'"
                @keydown.enter.prevent="addQuickExitLine"
              />
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Quem retirou</label>
              <PersonPicker
                :model-value="quickExitRequestedBy"
                placeholder="Buscar pessoa cadastrada..."
                :invalid="quickExitAttempted && Boolean(quickExitRequestedBy) && !quickExitPersonIsValid"
                @update:model-value="value => { quickExitRequestedBy = value; syncQuickExitPersonFromInput() }"
                @select="selectQuickExitPerson"
              />
            </div>

            <div class="lg:col-span-2">
              <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Destino</label>
              <DestinationTreePicker
                v-model="quickExitDestinationId"
                :linked-ids="quickExitSelected?.variation?.destinations || []"
                allow-other
                placeholder="Pesquisar destino..."
                other-label="Outro (digitar)..."
                @select="handleQuickExitDestinationSelect"
                @clear="handleQuickExitDestinationClear"
                @other="handleQuickExitDestinationOther"
              />
              <input
                v-if="quickExitDestinationOther"
                v-model="quickExitDestinationName"
                type="text"
                placeholder="Digite o destino..."
                class="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div class="lg:col-span-2">
              <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Observação</label>
              <input
                v-model="quickExitNote"
                type="text"
                placeholder="Opcional..."
                class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                @keydown.enter.prevent="addQuickExitLine"
              />
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              :class="quickExitCanAdd
                ? 'bg-[var(--ds-danger-solid)] text-white hover:bg-[var(--ds-danger-hover)]'
                : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'"
              @click="addQuickExitLine"
            >
              Adicionar à fila
            </button>
            <p v-if="quickExitAttempted && quickExitBlockReason" class="text-xs text-amber-600 dark:text-amber-400">{{ quickExitBlockReason }}</p>
          </div>
          </section>
        </section>

        <aside class="quick-queue rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 overflow-hidden">
          <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Fila de saída</p>
              <p class="text-sm font-bold text-gray-900 dark:text-gray-100">{{ quickExitQueue.length }} item{{ quickExitQueue.length === 1 ? '' : 's' }}</p>
            </div>
            <button
              v-if="quickExitQueue.length"
              type="button"
              class="text-xs text-gray-400 hover:text-red-500"
              @click="clearQuickExitQueue"
            >
              Limpar
            </button>
          </div>

          <div v-if="quickExitQueue.length" class="max-h-[28rem] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            <div v-for="line in quickExitQueue" :key="line.uid" class="px-4 py-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ line.itemName }}</p>
                  <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ [line.itemGroup, line.itemCategory, line.itemSubcategory].filter(Boolean).join(' > ') }}</p>
                  <AttributeBadges class="mt-2" :item="items.find(item => item.id === line.itemId)" :variation="{ values: line.variationValues, extras: line.variationExtras }" compact />
                  <p class="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{{ line.requestedBy }} · {{ line.destination }}</p>
                </div>
                <div class="flex-shrink-0 text-right">
                  <p class="text-sm font-bold text-red-600 dark:text-red-400">-{{ line.qty }} {{ line.itemUnit }}</p>
                  <button type="button" class="mt-2 text-xs text-red-500 hover:text-red-600" @click="removeQuickExitLine(line.uid)">Remover</button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
            Nenhuma saída na fila.
            <p class="mt-2 text-xs">Adicione materiais ao lado. O estoque será atualizado ao confirmar.</p>
          </div>

          <div class="border-t border-gray-200 p-4 dark:border-gray-700">
            <button
              type="button"
              class="w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
              :class="quickExitQueue.length && !quickExitPending
                ? 'bg-primary-600 text-[var(--ds-primary-text)] hover:bg-primary-700'
                : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'"
              :disabled="!quickExitQueue.length || quickExitPending"
              @click="confirmQuickExitQueue"
            >
              {{ quickExitPending ? 'Confirmando...' : `Confirmar ${quickExitQueue.length || ''} saída${quickExitQueue.length === 1 ? '' : 's'}` }}
            </button>
          </div>
        </aside>
      </div>
    </template>

    <!-- ======================================================= -->
    <!-- HISTÓRICO                                               -->
    <!-- ======================================================= -->
    <template v-else-if="activeSubTab === 'historico'">
      <div class="movement-history-toolbar">
      <div class="ds-query-bar" role="search" aria-label="Busca no histórico">
        <input v-model="histSearch" class="ds-query-input" type="search" aria-label="Buscar no histórico" placeholder="Buscar material, pessoa, destino ou documento…" />
        <AppButton v-if="hasHistFilters" variant="secondary" @click="clearHistFilters">Limpar filtros</AppButton>
      </div>
      <label class="movement-history-date"><span class="movement-label">De</span><input v-model="histDateFrom" type="date" aria-label="Data inicial" /></label>
      <label class="movement-history-date"><span class="movement-label">Até</span><input v-model="histDateTo" type="date" aria-label="Data final" /></label>
      <AppButton class="movement-history-export" variant="secondary" :disabled="!filteredMovements.length" title="Exportar todos os resultados da busca e dos filtros, incluindo outras páginas" @click="exportHistoryCsv">Exportar CSV</AppButton>
      </div>
      <div class="movement-history-filters" aria-label="Filtros do histórico">
          <div v-for="(facet, index) in primaryHistoryFacets" :key="facet.key" class="movement-facet">
            <button type="button" :popovertarget="`history-filter-${index}`"
              :style="{ anchorName: `--history-filter-${index}` }"
              :class="{ 'movement-facet-selected': facet.selected.length }">
              {{ facet.label }} <span v-if="facet.selected.length">({{ facet.selected.length }})</span>
              <span aria-hidden="true">⌄</span>
            </button>
            <div :id="`history-filter-${index}`" popover="auto" class="movement-facet-options"
              :style="{ positionAnchor: `--history-filter-${index}` }" role="group" :aria-label="`Filtrar por ${facet.label}`">
              <div class="movement-facet-title"><strong>{{ facet.label }}</strong>
                <button type="button" :popovertarget="`history-filter-${index}`" popovertargetaction="hide" :aria-label="`Fechar filtro ${facet.label}`">×</button>
              </div>
              <div class="movement-facet-scroll">
              <label v-for="option in facet.options" :key="option.value">
                <input type="checkbox" :checked="facet.selected.includes(option.value)" @change="toggleHistFilter(facet.key, option.value)" />
                <span>{{ option.value }}</span><small>{{ option.count }}</small>
              </label>
              </div>
            </div>
          </div>
          <AppButton v-if="extraHistoryFacets.length" variant="secondary" size="sm" @click="historyFilterSearch = ''; moreHistoryFiltersOpen = true">
            Mais filtros<span v-if="extraHistorySelectedCount"> ({{ extraHistorySelectedCount }})</span>
          </AppButton>
          <span class="movement-result-count" role="status">{{ filteredMovements.length }} movimentações</span>
      </div>
      <AppDialog :visible="moreHistoryFiltersOpen" aria-label="Mais filtros do histórico" @close="moreHistoryFiltersOpen = false">
        <section class="history-more-panel">
          <header class="movement-facet-title">
            <div><h2>Mais filtros</h2><p>Refine por operador, material ou atributos da variação.</p></div>
            <AppButton variant="ghost" size="icon" aria-label="Fechar mais filtros" @click="moreHistoryFiltersOpen = false">×</AppButton>
          </header>
          <input v-model="historyFilterSearch" autofocus type="search" class="ds-query-input" aria-label="Buscar filtro ou valor" placeholder="Buscar filtro ou valor: marca, tamanho, bico…" />
          <div class="history-more-list">
            <details v-for="facet in searchedHistoryFacets" :key="facet.key" :open="!!historyFilterSearch.trim()">
              <summary>{{ facet.label }}<span v-if="facet.selected.length"> · {{ facet.selected.length }} selecionados</span></summary>
              <div class="history-more-options">
                <label v-for="option in facet.options" :key="option.value">
                  <input type="checkbox" :checked="facet.selected.includes(option.value)" @change="toggleHistFilter(facet.key, option.value)" />
                  <span>{{ option.value }}</span><small>{{ option.count }}</small>
                </label>
              </div>
            </details>
            <p v-if="!searchedHistoryFacets.length" class="history-filter-empty">Nenhum filtro ou valor encontrado.</p>
          </div>
          <footer><span>{{ extraHistorySelectedCount }} selecionados · Aplicados automaticamente</span>
            <AppButton variant="primary" @click="moreHistoryFiltersOpen = false">Concluído</AppButton>
          </footer>
        </section>
      </AppDialog>
      <div v-if="selectedHistoryFilters.length" class="movement-filter-tags" aria-label="Filtros ativos">
        <button v-for="filter in selectedHistoryFilters" :key="filter.key + filter.value" type="button"
          :aria-label="`Remover filtro ${filter.label}: ${filter.value}`" @click="toggleHistFilter(filter.key, filter.value)">
          {{ filter.label }}: {{ filter.value }} <span aria-hidden="true">×</span>
        </button>
      </div>
      <div class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">

        <!-- Table area -->
        <div class="bg-white dark:bg-gray-900 flex flex-col">

          <!-- Empty state -->
          <EmptyState
            v-if="movements.length === 0"
            title="Nenhuma movimentação registrada ainda."
            text="Entradas e saídas aparecem aqui depois do primeiro lançamento."
            :action-label="canOperate ? 'Registrar entrada' : ''"
            @action="activeSubTab = 'entrada'"
          />

          <!-- No filter results -->
          <EmptyState
            v-else-if="filteredMovements.length === 0"
            title="Nenhum resultado para os filtros selecionados."
            text="Limpe filtros ou ajuste a busca para encontrar movimentações."
            action-label="Limpar filtros"
            @action="clearHistFilters"
          />

          <template v-else>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                    <th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Data</th>
                    <th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Item / Variação</th>
                    <th class="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Quantidade</th>
                    <th class="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Estoque após</th>
                    <th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Responsável / Local</th>
                    <th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Doc</th>
                    <th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Operador</th>
                    <th v-if="isAdmin" class="px-3 py-2.5 w-16"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr
                    v-for="m in paginatedMovements"
                    :key="m.id"
                    class="hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors"
                  >
                    <!-- Date + type pill -->
                    <td class="px-3 py-2.5 whitespace-nowrap">
                      <span
                        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold mb-1 uppercase tracking-wider"
                        :class="m.type === 'entrada'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'"
                      >
                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" :d="m.type === 'entrada' ? 'M12 4.5v15m0-15 6 6m-6-6-6 6' : 'M12 19.5v-15m0 15-6-6m6 6 6-6'" />
                        </svg>
                        {{ m.type === 'entrada' ? 'Entrada' : 'Saída' }}
                      </span>
                      <p class="text-[11px] text-gray-400 dark:text-gray-500" :title="formatDate(m.date)">{{ movementDateLabel(m.date) }}</p>
                    </td>

                    <!-- Item + variation -->
                    <td class="px-3 py-2.5 max-w-[220px]">
                      <AppLink v-if="m.variationId" :target="{ tab: 'inventario', section: 'estoque', variationId: m.variationId }" class="block font-medium text-gray-800 dark:text-gray-100 text-xs leading-snug truncate hover:underline" @navigate="target => emit('navigate', target)">{{ m.itemName }}</AppLink>
                      <p v-else class="font-medium text-gray-800 dark:text-gray-100 text-xs leading-snug truncate">{{ m.itemName }}</p>
                      <p class="text-[10px] text-gray-400 dark:text-gray-500 truncate mb-1">{{ [m.itemGroup, m.itemCategory, m.itemSubcategory].filter(Boolean).join(' › ') }}</p>
                      <AttributeBadges :item="items.find(item => item.id === m.itemId)" :variation="{ values: m.variationValues, extras: m.variationExtras }" compact />
                    </td>

                    <!-- Qty -->
                    <td class="px-3 py-2.5 text-center whitespace-nowrap">
                      <span
                        class="text-sm font-bold"
                        :class="m.type === 'entrada' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
                      >{{ m.type === 'entrada' ? '+' : '-' }}{{ m.qty }}</span>
                      <span class="text-xs text-gray-400 dark:text-gray-500 ml-0.5">{{ m.itemUnit }}</span>
                    </td>

                    <!-- Stock after -->
                    <td class="px-3 py-2.5 text-center whitespace-nowrap">
                      <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">{{ m.stockAfter }}</span>
                      <span class="text-xs text-gray-400 dark:text-gray-500 ml-0.5">{{ m.itemUnit }}</span>
                    </td>

                    <!-- Responsible / location -->
                    <td class="px-3 py-2.5 max-w-[160px]">
                      <template v-if="m.type === 'entrada'">
                        <p v-if="m.supplier" class="text-xs text-gray-700 dark:text-gray-300 truncate">{{ m.supplier }}</p>
                        <p v-else class="text-xs text-gray-300 dark:text-gray-600">—</p>
                      </template>
                      <template v-else>
                        <p class="text-xs text-gray-700 dark:text-gray-300 truncate">{{ m.requestedBy || '—' }}</p>
                        <p v-if="m.destination" class="text-[10px] text-gray-400 dark:text-gray-500 truncate">{{ m.destination }}</p>
                      </template>
                    </td>

                    <!-- Doc ref -->
                    <td class="px-3 py-2.5 max-w-[100px]">
                      <span v-if="m.docRef" class="text-xs text-gray-600 dark:text-gray-400 font-mono truncate block">{{ m.docRef }}</span>
                      <span v-else class="text-xs text-gray-300 dark:text-gray-600">—</span>
                      <p v-if="m.note" class="text-[10px] text-gray-400 dark:text-gray-500 italic truncate mt-0.5">{{ m.note }}</p>
                    </td>

                    <!-- Operator -->
                    <td class="px-3 py-2.5 max-w-[120px]">
                      <span v-if="m.operatorName" class="text-xs text-gray-600 dark:text-gray-400 truncate block">{{ m.operatorName }}</span>
                      <span v-else class="text-xs text-gray-300 dark:text-gray-600">—</span>
                    </td>

                    <!-- Actions: edit + delete -->
                    <td v-if="isAdmin" class="px-3 py-2.5 text-center">
                      <div class="flex items-center justify-center gap-0.5">
                        <button
                          v-if="isAdmin"
                          class="p-1 text-gray-300 dark:text-gray-600 hover:text-amber-500 dark:hover:text-amber-400 transition-colors rounded"
                          title="Editar movimentação"
                          @click="startEditMovement(m)"
                        >
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                        </button>
                        <button
                          class="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded"
                          title="Remover do histórico"
                          @click="requestDelete(m.id)"
                        >
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="flex flex-col gap-3 border-t border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
                <span>{{ filteredMovements.length }} movimentações</span>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <label class="flex items-center gap-2">
                  <span>Exibir</span>
                  <select
                    v-model.number="historyPageSize"
                    class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option v-for="option in historyPageSizeOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </label>
                <span>
                  {{ (historyCurrentPage - 1) * historyPageSize + 1 }}–{{ Math.min(historyCurrentPage * historyPageSize, filteredMovements.length) }} de {{ filteredMovements.length }}
                </span>
                <AppButton size="xs" variant="secondary" :disabled="historyCurrentPage <= 1" @click="historyCurrentPage--">
                  Anterior
                </AppButton>
                <span class="font-medium text-gray-700 dark:text-gray-200">{{ historyCurrentPage }} / {{ historyTotalPages }}</span>
                <AppButton size="xs" variant="secondary" :disabled="historyCurrentPage >= historyTotalPages" @click="historyCurrentPage++">
                  Próxima
                </AppButton>
              </div>
            </div>
          </template>

        </div>
      </div>
    </template>

    <!-- ======================================================= -->
    <!-- RESUMO POR DESTINO                                      -->
    <!-- ======================================================= -->
    <template v-else-if="activeSubTab === 'resumo'">
      <DestinationSummaryPanel
        :summary-totals="summaryTotals"
        :destination-summaries="destinationSummaries"
        :filtered-destination-summaries="filteredDestinationSummaries"
        :summary-search="summarySearch"
        :expanded-summary-dest-id="expandedSummaryDestId"
        :format-date="formatDate"
        @update:summary-search="v => summarySearch = v"
        @update:expanded-summary-dest-id="v => expandedSummaryDestId = v"
      />
    </template>

  </div>

  <AppModal
    :visible="!!deletePendingMovement"
    title="Excluir movimentação?"
    :show-actions="false"
    :persistent="deleteConfirmPending"
    @close="cancelDelete"
  >
    <div v-if="deletePendingMovement" class="space-y-4">
      <p class="text-sm text-gray-600 dark:text-gray-300">
        A movimentação será removida do histórico operacional. O conteúdo original e o motivo serão preservados na auditoria.
      </p>

      <dl class="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs dark:border-gray-700 dark:bg-gray-900/50">
        <div class="col-span-2">
          <dt class="text-gray-500 dark:text-gray-400">Material</dt>
          <dd class="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">{{ deletePendingMovement.itemName }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">Movimentação</dt>
          <dd class="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">
            {{ deletePendingMovement.type === 'entrada' ? 'Entrada' : 'Saída' }} de {{ deletePendingMovement.qty }} {{ deletePendingMovement.itemUnit }}
          </dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">Data</dt>
          <dd class="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">{{ formatDate(deletePendingMovement.date) }}</dd>
        </div>
      </dl>

      <div v-if="deleteStockPreview?.current !== null" class="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <div>
          <p class="text-xs text-amber-800 dark:text-amber-200">Estoque atual</p>
          <p class="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ deleteStockPreview.current }} {{ deleteStockPreview.unit }}</p>
        </div>
        <span class="text-lg text-amber-600 dark:text-amber-400">→</span>
        <div class="text-right">
          <p class="text-xs text-amber-800 dark:text-amber-200">Após excluir</p>
          <p class="mt-0.5 text-lg font-semibold tabular-nums" :class="deleteStockPreview.after < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'">
            {{ deleteStockPreview.after }} {{ deleteStockPreview.unit }}
          </p>
        </div>
      </div>
      <p v-else class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300">
        A variação não existe mais; somente o registro histórico será removido.
      </p>

      <p v-if="deleteStockPreview?.after < 0" class="text-xs font-medium text-red-600 dark:text-red-400">
        Esta entrada não pode ser excluída porque o estoque ficaria negativo.
      </p>
      <p v-if="deleteLinkedOrderCount" class="text-xs font-medium text-amber-700 dark:text-amber-300">
        A movimentação também será removida de {{ deleteLinkedOrderCount }} {{ deleteLinkedOrderCount === 1 ? 'ordem' : 'ordens' }} de serviço.
      </p>

      <label class="block text-sm">Motivo da exclusão
        <textarea v-model="deleteReason" class="ds-input mt-1" maxlength="2000" required></textarea>
      </label>
      <div class="flex justify-end gap-2 pt-1">
        <AppButton variant="secondary" :disabled="deleteConfirmPending" @click="cancelDelete">Cancelar</AppButton>
        <AppButton
          variant="dangerSolid"
          :loading="deleteConfirmPending"
          :disabled="!deleteReason.trim() || deleteStockPreview?.after < 0"
          @click="confirmDelete"
        >
          Excluir e registrar motivo
        </AppButton>
      </div>
    </div>
  </AppModal>

  <!-- ===== Edit Movement Modal ===== -->
  <AppDialog
    v-if="editingMovement"
    visible
    aria-label="Editar movimentação"
    @close="cancelEditMovement"
  >
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto" @click.stop>
        <h3 class="text-lg font-semibold text-primary-700 dark:text-primary-400 mb-1">
          Editar {{ editingMovement.type === 'entrada' ? 'Entrada' : 'Saída' }}
        </h3>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-5">
          {{ editingMovement.itemName }}
        </p>

        <!-- Data -->
        <div class="mb-4">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Data</label>
          <input
            v-model="editMovForm.date"
            type="datetime-local"
            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
          />
        </div>

        <!-- Quantidade -->
        <div class="mb-4">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Quantidade</label>
          <input
            v-model.number="editMovForm.qty"
            type="number"
            min="0"
            step="1"
            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
          />
        </div>

        <!-- Entrada: Fornecedor -->
        <div v-if="editingMovement.type === 'entrada'" class="mb-4">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Fornecedor</label>
          <div class="relative">
            <div v-if="editSupplierDropdownOpen" class="fixed inset-0 z-10" @click="editSupplierDropdownOpen = false"></div>
            <input
              v-model="editMovForm.supplier"
              type="text"
              placeholder="Buscar ou digitar fornecedor..."
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              @focus="editSupplierDropdownOpen = true"
              @input="editSupplierDropdownOpen = true"
              @keydown.enter.prevent="handleEditSupplierEnter"
            />
            <div
              v-if="editSupplierDropdownOpen"
              class="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl overflow-hidden"
            >
              <div class="max-h-52 overflow-y-auto py-1">
                <button
                  v-for="supplier in filteredEditSuppliers"
                  :key="supplier.id"
                  type="button"
                  class="w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                  @mousedown.prevent="selectEditSupplier(supplier)"
                >
                  <span class="font-medium truncate">{{ supplier.name }}</span>
                  <span v-if="supplier.description" class="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{{ supplier.description }}</span>
                </button>
                <p v-if="!filteredEditSuppliers.length" class="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
                  Nenhum fornecedor cadastrado encontrado.
                </p>
              </div>
            </div>
          </div>
          <p class="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
            {{ editMovForm.supplier && !editSupplierNameExists ? 'Novo fornecedor sera cadastrado ao salvar.' : 'Selecione um cadastrado para evitar duplicatas.' }}
          </p>
        </div>

        <div v-if="editingMovement.type === 'entrada'" class="mb-4">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Custo unitario</label>
          <input
            v-model="editMovForm.unitCost"
            type="number"
            min="0"
            step="0.01"
            placeholder="Opcional"
            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
          />
        </div>

        <!-- Saída: Quem retirou + Destino -->
        <template v-else>
          <div class="mb-4">
            <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Quem retirou</label>
            <PersonPicker
              :model-value="editMovForm.requestedBy"
              placeholder="Buscar pessoa cadastrada..."
              :invalid="Boolean(editMovForm.requestedBy) && !editRequestedPersonIsValid"
              @update:model-value="value => { editMovForm.requestedBy = value; syncEditRequestedPersonFromInput() }"
              @select="selectEditRequestedPerson"
            />
            <p v-if="editMovForm.requestedBy && !editRequestedPersonIsValid" class="mt-1 text-xs text-red-500 dark:text-red-400">
              Selecione uma pessoa cadastrada.
            </p>
          </div>
          <div class="mb-4">
            <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Destino</label>
            <DestinationTreePicker
              v-model="editMovementDestinationId"
              allow-other
              placeholder="Local de destino..."
              other-label="Outro (digitar)..."
              @select="handleEditMovementDestinationSelect"
              @clear="handleEditMovementDestinationClear"
              @other="handleEditMovementDestinationOther"
            />
            <input
              v-if="editMovementDestinationOther"
              v-model="editMovForm.destination"
              type="text"
              placeholder="Digite o destino..."
              class="mt-2 w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
          </div>
        </template>

        <!-- Documento -->
        <div class="mb-4">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Documento</label>
          <input
            v-model="editMovForm.docRef"
            type="text"
            placeholder="NF, pedido..."
            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
          />
        </div>

        <!-- Observação -->
        <div class="mb-5">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Observação</label>
          <input
            v-model="editMovForm.note"
            type="text"
            placeholder="Observação..."
            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
          />
        </div>

        <label class="mb-4 block text-sm">Motivo da correção
          <textarea v-model="editMovForm.reason" class="ds-input mt-1" maxlength="2000" required></textarea>
        </label>
        <!-- Ações -->
        <div class="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
          <p v-if="editMovementBlockReason" class="mr-auto self-center text-xs text-amber-600 dark:text-amber-400">
            {{ editMovementBlockReason }}
          </p>
          <button
            class="px-4 py-2 text-sm rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="editMovementSaving"
            @click="cancelEditMovement"
          >Cancelar</button>
          <button
            class="px-4 py-2 text-sm rounded-lg bg-primary-700 dark:bg-primary-600 text-[var(--ds-primary-text)] hover:bg-primary-800 dark:hover:bg-primary-500 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!canSaveEditMovement"
            @click="saveEditMovement"
          >{{ editMovementSaving ? 'Salvando...' : 'Salvar' }}</button>
        </div>
      </div>
  </AppDialog>
</template>

<style scoped>
.movement-workspace { color: var(--ds-text); }
.movement-page-header { display: grid; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--ds-border-subtle); }
.movement-page-intro { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 24px; }
.movement-page-intro h1 { font-size: 22px; line-height: 1.3; font-weight: 600; letter-spacing: -.02em; }
.movement-page-intro p { margin-top: 4px; color: var(--ds-text-muted); font-size: 13px; }
.movement-step { display: grid; gap: 3px; padding-left: 12px; border-left: 2px solid var(--ds-brand); font-size: 12px; color: var(--ds-text-soft); }
.movement-step > span { font-size: 11px; font-weight: 600; color: var(--ds-text-muted); }
.movement-search-idle { display: flex; align-items: center; gap: 16px; padding: 20px 16px; color: var(--ds-text-muted); }
.movement-search-idle > svg { width: 28px; height: 28px; flex-shrink: 0; color: var(--ds-text-subtle); }
.movement-search-idle p { margin-bottom: 4px; font-size: 14px; font-weight: 500; color: var(--ds-text-soft); }
.movement-search-idle span { font-size: 12px; }
.movement-label { display: block; font-size: 12px; font-weight: 600; color: var(--ds-text-soft); margin-bottom: 6px; }
.movement-modes { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.movement-modes > .movement-label { margin: 0; }
.movement-modes :deep(.ds-segmented) { flex-wrap: wrap; }
.movement-picker { display: grid; gap: 20px; }
.movement-picker-tools { padding: 16px; display: grid; gap: 12px; border: 1px solid var(--ds-border); border-radius: 8px; background: var(--ds-panel); }
.movement-search-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; }
.movement-search-fields { display: flex; align-items: end; gap: 16px; flex-wrap: wrap; }
.movement-search-fields > .movement-search { flex: 1.2 1 320px; min-width: 0; }
.movement-search-fields > .movement-filter-row { flex: 1 1 360px; }
.movement-picker-title { font-size: 16px; font-weight: 600; color: var(--ds-text); }
.movement-selection-panel { border: 1px solid var(--ds-border); border-radius: 8px; background: var(--ds-panel); overflow: hidden; }
.movement-search { display: block; }
.movement-search-control { position: relative; display: block; }
.movement-search-control > svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--ds-text-muted); pointer-events: none; }
.movement-search input { min-height: 40px; padding-left: 36px; background: var(--ds-control-bg); }
.movement-filter-row, .movement-history-tools { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; }
.movement-filter-row > label { flex: 1 1 180px; min-width: 0; }
.movement-search-fields .movement-filter-row > label { flex-basis: 140px; }
.movement-search-fields .movement-filter-row select { background: var(--ds-control-bg); }
.movement-filter-row select, .movement-history-tools input { width: 100%; min-height: 40px; padding: 8px 12px; border: 1px solid var(--ds-border); border-radius: 6px; background: var(--ds-surface); color: var(--ds-text); font-size: 14px; }
.movement-filter-row select:disabled { opacity: .55; }
.movement-workspace :is(button, select, input, summary):focus-visible { outline: 2px solid var(--ds-active-text); outline-offset: 2px; }
.movement-result { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.6fr) minmax(80px, .6fr) 112px 108px; align-items: center; gap: 16px; padding: 10px 16px; line-height: 1.35; }
.movement-column-headings { padding-block: 10px; background: var(--ds-table-head); color: var(--ds-text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid var(--ds-border); }
.movement-column-headings > :nth-child(n + 4) { text-align: center; }
.movement-result-button { width: 100%; min-height: 56px; text-align: left; border-bottom: 1px solid var(--ds-border-subtle); cursor: pointer; font-size: 14px; transition: background 120ms ease; }
.movement-result-button:last-child { border-bottom: 0; }
.movement-result-button:hover:not(:disabled), .movement-result-button:focus-visible { background: var(--ds-surface-hover); }
.movement-result-button:disabled { cursor: not-allowed; color: var(--ds-text-soft); }
.movement-material { display: grid; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
.movement-material strong { font-weight: 600; }
.movement-material small { color: var(--ds-text-muted); font-size: 11px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.movement-attributes { gap: 4px; min-width: 0; }
.movement-location { font-size: 12px; color: var(--ds-text-soft); overflow-wrap: anywhere; }
.movement-stock { text-align: center; display: grid; gap: 4px; font-variant-numeric: tabular-nums; }
.movement-stock small { color: var(--ds-text-soft); font-size: 11px; font-weight: 400; }
.movement-stock .movement-stock-check { color: var(--ds-warning); font-size: 10px; }
.movement-stock .movement-stock-empty { color: var(--ds-danger); }
.movement-location-empty { color: var(--ds-text-subtle); }
.movement-next { padding: 7px 8px; border: 1px solid var(--ds-border); border-radius: 6px; color: var(--ds-text); font-size: 12px; font-weight: 500; text-align: center; white-space: nowrap; }
.movement-result-button:hover:not(:disabled) .movement-next, .movement-result-button:focus-visible .movement-next { background: var(--ds-active-bg); border-color: var(--ds-active-text); color: var(--ds-active-text); }
.movement-result-button:disabled .movement-next { color: var(--ds-text-subtle); }
.quick-movement-layout { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 20px; }
.quick-movement-editor { display: grid; gap: 20px; min-width: 0; }
.quick-search-panel, .quick-details-panel { padding: 16px; background: var(--ds-panel); border: 1px solid var(--ds-border); border-radius: 8px; min-width: 0; }
.quick-details-heading { margin-bottom: 16px; }
.quick-details-heading p { margin-top: 4px; color: var(--ds-text-soft); font-size: 12px; }
.quick-selected-material { padding: 12px; border-left: 3px solid var(--ds-brand); border-radius: 4px; background: var(--ds-surface); }
.quick-movement-result { grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) 88px 100px; gap: 12px; padding-inline: 12px; }
.quick-movement-result > :nth-child(3) { text-align: center; }
.quick-movement-editor :is(input:not([type="checkbox"]), select) { min-height: 40px; }
.quick-queue { min-width: 0; }
@media (min-width: 1280px) {
  .quick-movement-layout { grid-template-columns: minmax(0, 1fr) 320px; }
}
.movement-pagination { display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--ds-border); font-size: 12px; }
.movement-pagination > :first-child { margin-right: auto; }
.movement-history-toolbar { display: grid; grid-template-columns: minmax(240px, 1fr) 170px 170px auto; align-items: end; gap: 12px; }
.movement-history-toolbar .ds-query-bar { min-width: 0; margin: 0; }
.movement-history-toolbar .ds-query-input { min-height: 44px; }
.movement-history-toolbar .ds-query-bar > button { flex-shrink: 0; white-space: nowrap; }
.movement-history-date { min-width: 0; }
.movement-history-date input { width: 100%; min-width: 0; min-height: 44px; padding: 8px 12px; border: 1px solid var(--ds-border); border-radius: 6px; background: var(--ds-surface); color: var(--ds-text); font-size: 14px; }
.movement-history-export { min-height: 44px; white-space: nowrap; }
.history-more-panel { width: min(560px, 100%); max-height: calc(100dvh - 48px); display: flex; flex-direction: column; gap: 16px; padding: 20px; border: 1px solid var(--ds-border); border-radius: 12px; background: var(--ds-surface); color: var(--ds-text); }
.history-more-panel h2 { font-size: 18px; font-weight: 600; }
.history-more-panel header { margin: 0; }
.history-more-panel header p, .history-more-panel footer span { font-size: 12px; color: var(--ds-text-soft); margin-top: 4px; }
.history-more-panel > input { flex-shrink: 0; }
.history-more-list { overflow-y: auto; min-height: 0; }
.history-more-list details { border-bottom: 1px solid var(--ds-border); }
.history-more-list summary { padding: 12px 4px; cursor: pointer; font-size: 14px; font-weight: 500; }
.history-more-list summary span { font-size: 12px; color: var(--ds-active-text); }
.history-more-options { max-height: 220px; overflow-y: auto; padding: 0 8px 12px; }
.history-more-options label { display: flex; align-items: center; gap: 10px; min-height: 36px; font-size: 13px; cursor: pointer; }
.history-more-options label span { flex: 1; overflow-wrap: anywhere; }
.history-more-options input { accent-color: var(--ds-active-text); }
.history-more-options small, .history-filter-empty { color: var(--ds-text-soft); }
.history-more-panel footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.history-more-panel :is(input, summary, button):focus-visible { outline: 2px solid var(--ds-active-text); outline-offset: 2px; }
.movement-result-count { align-self: center; margin-left: auto; color: var(--ds-text-soft); font-size: 12px; }
.movement-history-filters { display: flex; flex-wrap: wrap; gap: 8px; }
.movement-facet > button { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 6px 12px; border: 1px solid var(--ds-border); background: var(--ds-surface); color: var(--ds-text-soft); border-radius: 6px; font-size: 13px; cursor: pointer; }
.movement-facet > .movement-facet-selected { background: var(--ds-active-bg); color: var(--ds-active-text); }
.movement-facet-options { position: fixed; inset: auto; position-area: bottom span-right; position-try-fallbacks: flip-inline, flip-block; width: min(300px, calc(100vw - 32px)); margin: 6px 0; padding: 12px; border: 1px solid var(--ds-border); border-radius: 8px; background: var(--ds-surface); color: var(--ds-text); box-shadow: var(--ds-shadow-pop); }
.movement-facet-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 13px; }
.movement-facet-title button { min-width: 32px; min-height: 32px; border-radius: 4px; cursor: pointer; font-size: 20px; }
.movement-facet-scroll { max-height: min(280px, 45dvh); overflow-y: auto; }
.movement-facet-options label { display: flex; align-items: center; gap: 8px; min-height: 36px; cursor: pointer; font-size: 13px; }
.movement-facet-options input { accent-color: var(--ds-active-text); }
.movement-facet-options span { flex: 1; overflow-wrap: anywhere; }
.movement-facet-options small { color: var(--ds-text-subtle); }
.movement-filter-tags { display: flex; gap: 8px; flex-wrap: wrap; }
.movement-filter-tags button { background: var(--ds-active-bg); color: var(--ds-active-text); border: 1px solid var(--ds-border); border-radius: 6px; padding: 6px 10px; min-height: 36px; font-size: 12px; cursor: pointer; }
@media (max-width: 900px) {
  .movement-history-toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .movement-history-toolbar .ds-query-bar, .movement-history-export { grid-column: 1 / -1; }
  .movement-history-export { justify-self: end; }
}
@media (max-width: 767px) {
  .movement-search-fields { gap: 12px; }
  .movement-search-fields > .movement-search, .movement-search-fields > .movement-filter-row { flex-basis: 100%; }
  .movement-result { grid-template-columns: minmax(0, 1fr) 110px; gap: 6px 8px; padding: 10px 12px; }
  .movement-material { grid-column: 1; grid-row: 1; }
  .movement-stock { grid-column: 2; grid-row: 1 / span 2; }
  .movement-attributes { grid-column: 1; grid-row: 2; }
  .movement-location { grid-column: 1; grid-row: 3; }
  .movement-column-headings { display: none; }
  .movement-next { grid-column: 2; grid-row: 3; }
  .quick-movement-result { grid-template-columns: minmax(0, 1fr) 110px; }
}
@media (max-width: 640px) {
  .movement-search-fields .movement-filter-row > label { flex-basis: 100%; }
  .movement-workspace .ds-query-bar { flex-wrap: wrap; }
}
</style>
