<script setup>
import { ref, computed, watch, nextTick, inject, onMounted, onBeforeUnmount } from 'vue'
import { useWorkOrders } from '../composables/useWorkOrders.js'
import { stockAlertTransition, useItems } from '../composables/useItems.js'
import { useDestinations } from '../composables/useDestinations.js'
import { usePeople } from '../composables/usePeople.js'
import { useMovements } from '../composables/useMovements.js'
import { useMotors, MOTOR_EVENT_TYPES, MOTOR_STATUSES, motorEventLabel, motorOpenEventLabel, motorStatusLabel } from '../composables/useMotors.js'
import { useToast } from '../composables/useToast.js'
import AppButton from '../components/ui/AppButton.vue'
import AppDialog from '../components/ui/AppDialog.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import DestinationTreePicker from '../components/ui/DestinationTreePicker.vue'
import MotorPicker from '../components/ui/MotorPicker.vue'
import PersonPicker from '../components/ui/PersonPicker.vue'
import SectionTabs from '../components/ui/SectionTabs.vue'
import { formatPartialOrderDate, workOrderCreationDateError } from '../utils/workOrderForm.js'
import { workOrderMaintenanceKindLabel, workOrderMaintenanceSearchParts } from '../utils/workOrderSearch.js'
import { normalizeSearchText as normalizeText, searchTokens as textTokens } from '../utils/globalSearch.js'

import { formatDate, formatDateOnly, formatTimeOnly, formatDateTimeParts, maintenancePeriod, maintenanceEndLabel, maintenanceObservation, motorOrderTitle, maintenanceLocationLabel, maintenanceLocationTypeLabel, orderDisplayTitle, variationLabel, hierarchyLabel } from '../utils/workOrderPresentation.js'
import { serializeCsv } from '../utils/csv.js'

const props = defineProps({
  mode: { type: String, default: 'general' },
  embedded: { type: Boolean, default: false },
  createOnly: { type: Boolean, default: false },
  popupOnly: { type: Boolean, default: false },
  prefillMotor: { type: Object, default: null },
  scopedMotorId: { type: String, default: '' },
  initialMotorId: { default: null },
  initialTab: { type: String, default: 'ordens' },
  initialStatus: { type: String, default: '' },
  focusOrderId: { type: String, default: '' },
})
const emit = defineEmits(['prefill-consumed', 'created', 'updated', 'closed', 'update:tab'])
const isAdmin = inject('isAdmin')
const canOperate = inject('canOperate')
const canManageOs = computed(() => Boolean(canOperate?.value ?? canOperate))
const {
  workOrders, report,
  loadData: loadWorkOrders,
  loadReport,
  addWorkOrder, editWorkOrder, deleteWorkOrder,
  addMaterial, removeMaterial
} = useWorkOrders()

const { items, variations, getVariationsForItem } = useItems()
const { groupedDestinations, getDestFullName, addDestination } = useDestinations()
const { activePeople, addPerson } = usePeople()
const { movements } = useMovements()
const { motors, loadData: loadMotorData, addMotorEvent, editMotorEvent } = useMotors()
const { success, error: showError } = useToast()

const DEFAULT_SERVICE_TYPE = 'Outros'
const MOTOR_STATUS_AFTER_OPTIONS = MOTOR_STATUSES.filter(status => status.id !== 'em_manutencao')
const NO_MOTOR_EVENT = { id: 'nenhum', label: 'Nenhum' }
const motorEventQuickTypes = [
  { id: 'revisado', label: 'Revisado' },
  { id: 'rebobinado', label: 'Rebobinado' },
  { id: 'reformado', label: 'Reformado' },
  { id: 'enrolado', label: 'Enrolado' },
  { id: 'movimentado', label: 'Mudança de local' },
  { id: 'observacao', label: 'Observação' },
]
const motorEventTypes = [NO_MOTOR_EVENT, ...MOTOR_EVENT_TYPES]
const motorObjectiveTypes = motorEventTypes
const isMotorMode = computed(() => props.mode === 'motor')
const pageTitle = computed(() => isMotorMode.value ? 'OS de Motor' : 'Ordens de Serviço')
const pageSubtitle = computed(() =>
  isMotorMode.value
    ? 'Manutenção de motores com histórico do ativo e baixa de peças do estoque'
    : 'Manutenção geral, sem vínculo obrigatório com motor'
)
const createIntent = ref(props.createOnly ? 'register' : 'open')
const isRegisteringOrder = computed(() => !editingOrderId.value && createIntent.value === 'register')
const showExecutionFields = computed(() => Boolean(editingOrderId.value) || createIntent.value === 'register')
const formTitle = computed(() => {
  if (editingOrderId.value) return isMotorMode.value ? 'Editar OS de Motor' : 'Editar Ordem de Serviço'
  if (createIntent.value === 'register') return isMotorMode.value ? 'Registrar OS de Motor' : 'Registrar Ordem de Serviço'
  return isMotorMode.value ? 'Abrir OS de Motor' : 'Abrir Ordem de Serviço'
})
const formSubmitLabel = computed(() => editingOrderId.value ? 'Salvar OS' : (createIntent.value === 'register' ? 'Registrar OS' : 'Abrir OS'))
const formStatusLabel = computed(() => editingOrderId.value ? 'Editando' : (createIntent.value === 'register' ? 'Registrando' : 'Abrindo'))
const scopedMotor = computed(() => props.scopedMotorId ? motors.value.find(m => m.id === props.scopedMotorId) || null : null)
const OS_FILTER_STATE_KEY = computed(() => `estoque_os_filters_${props.mode || 'general'}`)

function loadOsFilterState() {
  try {
    return JSON.parse(sessionStorage.getItem(OS_FILTER_STATE_KEY.value) || '{}')
  } catch {
    return {}
  }
}

function focusRef(target) {
  const el = Array.isArray(target?.value) ? target.value[0] : target?.value
  if (el && typeof el.focus === 'function') el.focus()
}

// ===== Sub-tabs =====
const activeSubTab = ref('ordens')
const visibleSubTabs = computed(() => [
  {
    id: 'ordens',
    label: isMotorMode.value ? 'OS de Motor' : 'Ordens',
    icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.251 2.251 0 011.65.762m-5.8 0c-.376.023-.75.05-1.124.08C8.845 4.013 8 4.974 8 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
  },
  {
    id: 'historico',
    label: 'Histórico',
    icon: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
  {
    id: 'resumo',
    label: 'Resumo',
    icon: 'M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h16.5m0 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3M9 9.75l2.25-2.25 2.25 2.25 3.75-4.5',
  },
])

// ===== OS List =====
const savedOsFilterState = loadOsFilterState()
const searchQuery = ref(savedOsFilterState.searchQuery || '')
const ordersStatusTab = ref(['open', 'finished'].includes(props.initialStatus) ? props.initialStatus : (savedOsFilterState.ordersStatusTab || 'open'))
const motorFilterId = ref(props.scopedMotorId || (props.initialMotorId !== null ? props.initialMotorId : savedOsFilterState.motorFilterId || ''))
const historyDateFrom = ref(savedOsFilterState.historyDateFrom || '')
const historyDateTo = ref(savedOsFilterState.historyDateTo || '')
const ORDERS_PAGE_SIZE = 10
const HISTORY_PAGE_SIZE = 10
const openOrdersPage = ref(1)
const finishedOrdersPage = ref(1)
const historyPage = ref(1)
const expandedOrderId = ref(null)
const showNewForm = ref(false)
const editingOrderId = ref(null)
const confirmDeleteId = ref(null)
const quickOsFieldRefs = ref([])
const quickSuggestionIndex = ref(-1)
const quickSuggestionFieldKey = ref('')
const quickSuggestionNavigated = ref(false)
const quickExplicitNewValues = ref({})
const quickInvalidFieldKey = ref('')
const osEntryMode = ref('form')
const quickRowsMenuOpen = ref(false)
const quickDuplicateWarningSignature = ref('')
const quickAutoCreateRegistries = true
const QUICK_OS_HIDDEN_FIELDS_KEY = 'estoque_quick_os_hidden_fields'
const QUICK_OS_KEEP_VALUES_KEY = 'estoque_quick_os_keep_values'

function loadQuickHiddenFields() {
  try {
    const saved = JSON.parse(localStorage.getItem(QUICK_OS_HIDDEN_FIELDS_KEY) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

const quickHiddenFieldKeys = ref(loadQuickHiddenFields())
const quickKeepValues = ref(localStorage.getItem(QUICK_OS_KEEP_VALUES_KEY) === 'true')

watch(quickHiddenFieldKeys, (keys) => {
  localStorage.setItem(QUICK_OS_HIDDEN_FIELDS_KEY, JSON.stringify(keys))
  quickOsFieldRefs.value = []
}, { deep: true })

watch(quickKeepValues, (keep) => {
  localStorage.setItem(QUICK_OS_KEEP_VALUES_KEY, keep ? 'true' : 'false')
})

watch([searchQuery, ordersStatusTab, motorFilterId, historyDateFrom, historyDateTo], () => {
  sessionStorage.setItem(OS_FILTER_STATE_KEY.value, JSON.stringify({
    searchQuery: searchQuery.value,
    ordersStatusTab: ordersStatusTab.value,
    motorFilterId: motorFilterId.value,
    historyDateFrom: historyDateFrom.value,
    historyDateTo: historyDateTo.value,
  }))
})

function pad(n) {
  return String(n).padStart(2, '0')
}

function todayDate() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function currentTime() {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function emptyMotorEventForm(order = null) {
  return {
    eventType: 'nenhum',
    eventDate: todayDate(),
    performedBy: order?.maintenanceProfessional || '',
    toDestinationId: '',
    toDestination: '',
    notes: '',
  }
}

function splitIsoDateTime(iso) {
  if (!iso) return { date: todayDate(), time: currentTime() }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: todayDate(), time: currentTime() }
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

function valueFromOrder(order, camelKey, snakeKey = '') {
  return order?.[camelKey] || (snakeKey ? order?.[snakeKey] : '') || ''
}

function dateInputValue(value) {
  const isoPrefix = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoPrefix) return `${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`
  const parts = dateParts(value)
  if (!parts) return value || ''
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

function inferEquipment(order) {
  const explicit = valueFromOrder(order, 'equipment') || valueFromOrder(order, 'destinationName', 'destination_name')
  if (explicit) return explicit
  const title = valueFromOrder(order, 'title')
  const match = title.match(/^[^-]+-\s*(.+)$/)
  return match?.[1]?.trim() || ''
}

function createEmptyOsForm(order = null) {
  if (order) {
    const fallback = splitIsoDateTime(order.createdAt)
    const equipment = inferEquipment(order)
    return {
      title: valueFromOrder(order, 'title'),
      number: order.number || '',
      requestedBy: valueFromOrder(order, 'requestedBy', 'requested_by'),
      requestDate: dateInputValue(valueFromOrder(order, 'requestDate', 'request_date') || fallback.date),
      requestTime: valueFromOrder(order, 'requestTime', 'request_time'),
      equipment,
      motorId: valueFromOrder(order, 'motorId', 'motor_id'),
      destinationId: valueFromOrder(order, 'destinationId', 'destination_id') || findDestinationIdByEquipment(equipment),
      motorOriginDestinationId: valueFromOrder(order, 'motorOriginDestinationId', 'motor_origin_destination_id'),
      motorOriginDestinationName: valueFromOrder(order, 'motorOriginDestinationName', 'motor_origin_destination_name'),
      maintenanceLocationType: valueFromOrder(order, 'maintenanceLocationType', 'maintenance_location_type') || (valueFromOrder(order, 'motorId', 'motor_id') ? (valueFromOrder(order, 'maintenanceDestinationId', 'maintenance_destination_id') ? 'interna' : 'externa') : 'interna'),
      maintenanceDestinationId: valueFromOrder(order, 'maintenanceDestinationId', 'maintenance_destination_id'),
      maintenanceExternalLocation: valueFromOrder(order, 'maintenanceExternalLocation', 'maintenance_external_location') || (valueFromOrder(order, 'motorId', 'motor_id') ? valueFromOrder(order, 'destinationName', 'destination_name') : ''),
      maintenanceExternalOrderNumber: valueFromOrder(order, 'maintenanceExternalOrderNumber', 'maintenance_external_order_number'),
      initialMotorEventType: 'nenhum',
      initialMotorEventDate: dateInputValue(valueFromOrder(order, 'requestDate', 'request_date') || fallback.date),
      initialMotorEventPerformedBy: valueFromOrder(order, 'maintenanceProfessional', 'maintenance_professional'),
      initialMotorEventToDestinationId: '',
      initialMotorEventToDestination: '',
      initialMotorEventNotes: '',
      serviceType: valueFromOrder(order, 'serviceType', 'service_type') || DEFAULT_SERVICE_TYPE,
      note: valueFromOrder(order, 'note'),
      maintenanceStartDate: dateInputValue(valueFromOrder(order, 'maintenanceStartDate', 'maintenance_start_date')),
      maintenanceStartTime: valueFromOrder(order, 'maintenanceStartTime', 'maintenance_start_time'),
      maintenanceEndDate: dateInputValue(valueFromOrder(order, 'maintenanceEndDate', 'maintenance_end_date')),
      maintenanceEndTime: valueFromOrder(order, 'maintenanceEndTime', 'maintenance_end_time'),
      maintenanceProfessional: valueFromOrder(order, 'maintenanceProfessional', 'maintenance_professional'),
      maintenanceMaterials: valueFromOrder(order, 'maintenanceMaterials', 'maintenance_materials'),
      maintenanceNote: valueFromOrder(order, 'maintenanceNote', 'maintenance_note'),
      motorStatusAfterMaintenance: valueFromOrder(order, 'motorStatusAfterMaintenance', 'motor_status_after_maintenance') || 'ativo',
    }
  }

  return {
    title: '',
    number: '',
    requestedBy: '',
    requestDate: todayDate(),
    requestTime: currentTime(),
    equipment: '',
    motorId: '',
    destinationId: '',
    motorOriginDestinationId: '',
    motorOriginDestinationName: '',
    maintenanceLocationType: 'interna',
    maintenanceDestinationId: '',
    maintenanceExternalLocation: '',
    maintenanceExternalOrderNumber: '',
    initialMotorEventType: 'nenhum',
    initialMotorEventDate: todayDate(),
    initialMotorEventPerformedBy: '',
    initialMotorEventToDestinationId: '',
    initialMotorEventToDestination: '',
    initialMotorEventNotes: '',
    serviceType: DEFAULT_SERVICE_TYPE,
    note: '',
    maintenanceStartDate: '',
    maintenanceStartTime: '',
    maintenanceEndDate: '',
    maintenanceEndTime: '',
    maintenanceProfessional: '',
    maintenanceMaterials: '',
    maintenanceNote: '',
    motorStatusAfterMaintenance: 'ativo',
  }
}

// ===== New/Edit OS form =====
const osForm = ref(createEmptyOsForm())
const motorEventOrderId = ref(null)
const motorEventForm = ref(emptyMotorEventForm())
const destinationPickerSearch = ref('')
const destinationPickerOpen = ref(false)
const expandedDestinationGroups = ref(new Set())

function resetOsForm() {
  osForm.value = createEmptyOsForm()
  destinationPickerSearch.value = ''
  destinationPickerOpen.value = false
  resetQuickOsEntry()
  applyScopedMotorToOsForm()
}

function resetQuickOsEntry() {
  quickOsFieldRefs.value = []
  closeQuickSuggestions()
}

// ===== "Add Material" flow inside an OS =====
const addingMaterialToId = ref(null)
const matStep = ref(1)
const matSearch = ref('')
const matSelectedItem = ref(null)
const matSelectedVariation = ref(null)
const matQty = ref('')
const matSearchEl = ref(null)
const matQtyEl = ref(null)
const matSelectedGroup = ref('')
const matSelectedCategory = ref('')
const matSelectedSubcategory = ref('')
const confirmRemoveItemId = ref(null)

function startAddMaterial(orderId) {
  addingMaterialToId.value = orderId
  matStep.value = 1
  matSearch.value = ''
  matSelectedItem.value = null
  matSelectedVariation.value = null
  matSelectedGroup.value = ''
  matSelectedCategory.value = ''
  matSelectedSubcategory.value = ''
  matQty.value = '1'
  nextTick(() => focusRef(matSearchEl))
}

function cancelAddMaterial() {
  addingMaterialToId.value = null
}

// ===== Destination helpers =====
const orderedDestinations = computed(() => {
  const list = []
  for (const g of groupedDestinations.value) {
    list.push(g.parent)
    for (const c of g.children) list.push(c)
  }
  return list
})

const destinationOptions = computed(() =>
  orderedDestinations.value.map(d => ({ id: d.id, name: getDestFullName(d.id) }))
)

const filteredDestinationGroups = computed(() => {
  const q = normalizeText(destinationPickerSearch.value)
  return groupedDestinations.value
    .map(group => {
      const parentPath = getDestFullName(group.parent.id)
      const parentMatches = !q || normalizeText(`${parentPath} ${group.parent.description || ''}`).includes(q)
      const children = !q || parentMatches
        ? group.children
        : group.children.filter(child =>
          normalizeText(`${getDestFullName(child.id)} ${child.description || ''}`).includes(q)
        )
      if (!parentMatches && !children.length) return null
      return { parent: group.parent, children, parentMatches }
    })
    .filter(Boolean)
})

const filteredDestinationCount = computed(() =>
  filteredDestinationGroups.value.reduce((sum, group) => sum + (group.parentMatches ? 1 : 0) + group.children.length, 0)
)

const filteredDestinationResults = computed(() =>
  filteredDestinationGroups.value.flatMap(group => [
    ...(group.parentMatches ? [group.parent] : []),
    ...group.children,
  ])
)

const selectedDestinationPath = computed(() =>
  osForm.value.destinationId ? selectedDestinationLabel(osForm.value.destinationId) : ''
)

function selectedDestinationParentId() {
  const selectedId = osForm.value.destinationId
  if (!selectedId) return ''
  for (const group of groupedDestinations.value) {
    if (group.parent.id === selectedId) return group.parent.id
    if (group.children.some(child => child.id === selectedId)) return group.parent.id
  }
  return ''
}

function isDestinationGroupOpen(group) {
  return Boolean(destinationPickerSearch.value.trim()) ||
    expandedDestinationGroups.value.has(group.parent.id) ||
    selectedDestinationParentId() === group.parent.id
}

function toggleDestinationGroup(groupId) {
  const next = new Set(expandedDestinationGroups.value)
  if (next.has(groupId)) next.delete(groupId)
  else next.add(groupId)
  expandedDestinationGroups.value = next
}

function selectNormalOsDestination(destinationId) {
  osForm.value.destinationId = destinationId
  updateNormalOsEquipmentFromDestination()
  destinationPickerSearch.value = selectedDestinationLabel(destinationId)
  destinationPickerOpen.value = false
}

function handleDestinationPickerInput() {
  destinationPickerOpen.value = true
  if (osForm.value.destinationId && destinationPickerSearch.value !== selectedDestinationPath.value) {
    osForm.value.destinationId = ''
    osForm.value.equipment = ''
  }
}

function handleDestinationPickerFocus() {
  destinationPickerOpen.value = true
}

function selectSingleDestinationOnEnter() {
  if (filteredDestinationResults.value.length !== 1) return
  selectNormalOsDestination(filteredDestinationResults.value[0].id)
}

const motorOptions = computed(() =>
  motors.value
    .filter(m => !props.scopedMotorId || m.id === props.scopedMotorId)
    .map(m => ({
    id: m.id,
    label: `${m.tag}${m.name ? ` - ${m.name}` : ''}${m.destinationName ? ` (${m.destinationName})` : ''}`,
    motor: m,
  }))
)

const activeMotorFilterId = computed(() => props.scopedMotorId || motorFilterId.value)
const motorFilterLocked = computed(() => Boolean(props.scopedMotorId))

const selectedOsMotor = computed(() =>
  motors.value.find(m => m.id === osForm.value.motorId) || null
)

function applyMotorToOsForm(motor = selectedOsMotor.value) {
  if (!motor) return
  osForm.value.motorId = motor.id
  osForm.value.equipment = motor.tag
  osForm.value.destinationId = ''
  osForm.value.motorOriginDestinationId = motor.destinationId || ''
  osForm.value.motorOriginDestinationName = motor.destinationName || ''
  if (!osForm.value.note.trim() && motor.name) osForm.value.note = `Motor: ${motor.name}`
}

function applyScopedMotorToOsForm() {
  if (isMotorMode.value && scopedMotor.value) applyMotorToOsForm(scopedMotor.value)
}

function isNumericToken(value) {
  return /^\d+$/.test(value)
}

function tokenSequenceScore(queryTokens, optionTokens) {
  let score = 0
  let startIndex = 0
  for (const queryToken of queryTokens) {
    let foundIndex = -1
    let tokenScore = 0
    for (let i = startIndex; i < optionTokens.length; i += 1) {
      const optionToken = optionTokens[i]
      if (isNumericToken(queryToken)) {
        if (optionToken !== queryToken) continue
        foundIndex = i
        tokenScore = 120
        break
      }
      if (optionToken === queryToken) {
        foundIndex = i
        tokenScore = 100
        break
      }
      if (optionToken.startsWith(queryToken)) {
        foundIndex = i
        tokenScore = 80 - Math.min(optionToken.length - queryToken.length, 20)
        break
      }
    }
    if (foundIndex < 0) return 0
    score += tokenScore - foundIndex
    startIndex = foundIndex + 1
  }
  return score
}

function quickAutocompleteCandidates(field, value) {
  const q = normalizeText(value)
  if (!q) return []
  const queryTokens = textTokens(value)
  return quickOptionsForField(field)
    .map(option => {
      const normalized = normalizeText(option)
      let score = 0
      if (normalized === q) score = 10000
      else if (normalized.startsWith(q)) score = 9000 - normalized.length
      else {
        const index = normalized.indexOf(q)
        const startsAtWord = index === 0 || /[\s/>._-]/.test(normalized[index - 1] || '')
        if (index >= 0 && startsAtWord) score = 8000 - index - normalized.length
        else score = tokenSequenceScore(queryTokens, textTokens(option))
      }
      return { option, normalized, score }
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.option.length - b.option.length || a.option.localeCompare(b.option))
}

function findDestinationIdByEquipment(equipment) {
  const q = normalizeText(equipment)
  if (!q) return ''
  return destinationOptions.value.find(d => normalizeText(d.name) === q)?.id || ''
}

function destinationIdForName(name) {
  const q = normalizeText(name)
  if (!q) return ''
  return destinationOptions.value.find(d => normalizeText(d.name) === q)?.id || ''
}

function selectedDestinationLabel(id) {
  return id ? getDestFullName(id) : ''
}

function updateNormalOsEquipmentFromDestination() {
  if (isMotorMode.value) return
  osForm.value.equipment = selectedDestinationLabel(osForm.value.destinationId)
}

function quickOptionsForField(field) {
  if (field.type === 'person') return activePeople.value.map(person => person.name)
  if (field.type === 'destination') return destinationOptions.value.map(destination => destination.name)
  return []
}

function quickTokenMatches(optionToken, queryToken) {
  if (isNumericToken(queryToken)) return optionToken === queryToken
  return optionToken === queryToken || optionToken.startsWith(queryToken)
}

function isStrongQuickAutocompleteMatch(result, value) {
  const q = normalizeText(value)
  if (!result || !q) return false
  if (result.normalized === q || result.normalized.startsWith(q)) return true
  const queryTokens = textTokens(value)
  const optionTokens = textTokens(result.option)
  if (!queryTokens.length || !optionTokens.length) return false
  return quickTokenMatches(optionTokens[0], queryTokens[0]) &&
    tokenSequenceScore(queryTokens, optionTokens) > 0
}

function strongQuickAutocompleteCandidates(field, value) {
  return quickAutocompleteCandidates(field, value)
    .filter(result => isStrongQuickAutocompleteMatch(result, value))
}

function findQuickAutocompleteMatch(field, value, uniqueOnly = false) {
  const matches = strongQuickAutocompleteCandidates(field, value)
  if (!matches.length) return ''
  if (!uniqueOnly) return matches[0].option
  if (matches.length === 1 || matches[0].score > matches[1].score) return matches[0].option
  return ''
}

function quickInlineCompletion(field) {
  if (!['person', 'destination'].includes(field.type)) return ''
  const value = String(osForm.value[field.key] || '')
  const q = normalizeText(value)
  if (!q) return ''
  const match = quickAutocompleteCandidates(field, value).find(result => result.normalized.startsWith(q) && result.normalized !== q)
  return match ? match.option.slice(value.length) : ''
}

function quickAutocompleteStatus(field) {
  if (!['person', 'destination'].includes(field.type)) return null
  const value = String(osForm.value[field.key] || '').trim()
  if (!value) return null
  const exact = field.type === 'person'
    ? isRegisteredRequester(value)
    : Boolean(findDestinationIdByEquipment(value))
  if (exact) return null
  const matches = quickAutocompleteCandidates(field, value)
  const label = field.type === 'person' ? 'Pessoa' : 'Destino'
  if (!matches.length && quickAutoCreateRegistries) return { type: 'hint', text: `${label} sera cadastrado ao criar a OS` }
  if (!matches.length) return { type: 'error', text: `${label} não encontrado` }
  if (matches.length > 1 && matches[0].score === matches[1].score) {
    return { type: 'warn', text: 'Mais de uma opção. Digite mais um detalhe.' }
  }
  return { type: 'hint', text: `Enter para usar: ${matches[0].option}` }
}

function quickSuggestionOptions(field) {
  if (!['person', 'destination'].includes(field.type)) return []
  if (quickSuggestionFieldKey.value !== field.key) return []
  const value = String(osForm.value[field.key] || '').trim()
  if (!value) return []
  const exact = field.type === 'person'
    ? isRegisteredRequester(value)
    : Boolean(findDestinationIdByEquipment(value))
  if (exact) return []
  const suggestions = quickAutocompleteCandidates(field, value).slice(0, 6)
  if (!quickAutoCreateRegistries) return suggestions
  return [
    ...suggestions,
    {
      type: 'new',
      option: value,
      label: `${field.type === 'person' ? 'Nova pessoa' : 'Novo destino'}: ${value}`,
      normalized: normalizeText(value),
      score: -1,
    },
  ]
}

function openQuickSuggestions(field) {
  if (!['person', 'destination'].includes(field.type)) return
  if (quickSuggestionFieldKey.value === field.key) return
  quickSuggestionFieldKey.value = field.key
  quickSuggestionIndex.value = -1
  quickSuggestionNavigated.value = false
}

function closeQuickSuggestions({ blur = false } = {}) {
  quickSuggestionFieldKey.value = ''
  quickSuggestionIndex.value = -1
  quickSuggestionNavigated.value = false
  if (blur && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }
}

function handleQuickSuggestionDocumentMouseDown(event) {
  const target = event.target
  if (quickSuggestionFieldKey.value) {
    if (target instanceof Element && target.closest('[data-quick-suggestion-root]')) return
    closeQuickSuggestions()
  }
  if (quickRowsMenuOpen.value) {
    if (target instanceof Element && target.closest('[data-quick-rows-menu]')) return
    quickRowsMenuOpen.value = false
  }
}

function handleQuickSuggestionDocumentKeydown(event) {
  if (event.key !== 'Escape') return
  if (!quickSuggestionFieldKey.value) return
  event.preventDefault()
  event.stopPropagation()
  closeQuickSuggestions({ blur: true })
}

onMounted(() => {
  document.addEventListener('mousedown', handleQuickSuggestionDocumentMouseDown, true)
  document.addEventListener('keydown', handleQuickSuggestionDocumentKeydown, true)
  document.addEventListener('keyup', handleQuickSuggestionDocumentKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleQuickSuggestionDocumentMouseDown, true)
  document.removeEventListener('keydown', handleQuickSuggestionDocumentKeydown, true)
  document.removeEventListener('keyup', handleQuickSuggestionDocumentKeydown, true)
})

function applyQuickSuggestion(field, option, index) {
  if (!option) return
  const value = typeof option === 'string' ? option : option.option
  if (!value) return
  osForm.value[field.key] = value
  closeQuickSuggestions()
  if (typeof option === 'object' && option.type === 'new') {
    quickExplicitNewValues.value[field.key] = value
    if (field.type === 'destination') osForm.value.destinationId = ''
    return
  }
  delete quickExplicitNewValues.value[field.key]
  if (field.type === 'destination') {
    osForm.value.destinationId = findDestinationIdByEquipment(value)
  }
}

function chooseQuickSuggestion(field, option, index) {
  applyQuickSuggestion(field, option, index)
  focusNextQuickOsField(index)
}

function moveQuickSuggestion(field, direction) {
  const options = quickSuggestionOptions(field)
  if (!options.length) return
  const next = quickSuggestionIndex.value + direction
  quickSuggestionIndex.value = Math.max(0, Math.min(next, options.length - 1))
  quickSuggestionNavigated.value = true
}

function syncQuickDestinationFromText(uniqueOnly = false) {
  if (isMotorMode.value) return false
  const match = findQuickAutocompleteMatch({ type: 'destination' }, osForm.value.equipment, uniqueOnly)
  if (!match) return false
  osForm.value.equipment = match
  osForm.value.destinationId = findDestinationIdByEquipment(match)
  return Boolean(osForm.value.destinationId)
}

function handleQuickAutocompleteInput(field) {
  openQuickSuggestions(field)
  quickSuggestionIndex.value = -1
  quickSuggestionNavigated.value = false
  delete quickExplicitNewValues.value[field.key]
  if (field.type !== 'destination') return
  if (!osForm.value.equipment.trim()) {
    osForm.value.destinationId = ''
    return
  }
  const exactId = findDestinationIdByEquipment(osForm.value.equipment)
  osForm.value.destinationId = exactId || ''
}

function commitQuickAutocomplete(field, index) {
  openQuickSuggestions(field)
  const value = String(osForm.value[field.key] || '').trim()
  if (value) {
    const suggestions = quickSuggestionOptions(field)
    if (suggestions.length) {
      const selectedSuggestion = suggestions[quickSuggestionIndex.value] || suggestions[0]
      if (quickSuggestionNavigated.value) {
        chooseQuickSuggestion(field, selectedSuggestion, index)
        return
      }
      if (selectedSuggestion.type !== 'new' && isStrongQuickAutocompleteMatch(selectedSuggestion, value)) {
        chooseQuickSuggestion(field, selectedSuggestion.option, index)
        return
      }
    }
    const matches = quickAutocompleteCandidates(field, value)
    const exact = field.type === 'person'
      ? isRegisteredRequester(value)
      : Boolean(findDestinationIdByEquipment(value))
    const match = findQuickAutocompleteMatch(field, value, true)
    if (!exact && !match) {
      if (quickAutoCreateRegistries && !strongQuickAutocompleteCandidates(field, value).length) {
        closeQuickSuggestions()
        focusNextQuickOsField(index)
        return
      }
      showError(matches.length ? 'Mais de uma opção encontrada. Digite mais um detalhe.' : `${field.type === 'person' ? 'Pessoa' : 'Destino'} não encontrado.`)
      focusQuickOsField(index)
      return
    }
    if (match) osForm.value[field.key] = match
  }
  if (field.type === 'destination' && osForm.value.equipment.trim()) {
    const ok = syncQuickDestinationFromText(true) || Boolean(findDestinationIdByEquipment(osForm.value.equipment))
    if (!ok) {
      if (quickAutoCreateRegistries && !strongQuickAutocompleteCandidates(field, osForm.value.equipment).length) {
        closeQuickSuggestions()
        focusNextQuickOsField(index)
        return
      }
      showError('Destino não encontrado.')
      focusQuickOsField(index)
      return
    }
  }
  focusNextQuickOsField(index)
}

function handleQuickAutocompleteDown(field) {
  openQuickSuggestions(field)
  if (quickSuggestionOptions(field).length) {
    if (!quickSuggestionNavigated.value) {
      quickSuggestionNavigated.value = true
      quickSuggestionIndex.value = 0
      return
    }
    moveQuickSuggestion(field, 1)
    return
  }
}

function handleQuickAutocompleteUp(field, index) {
  openQuickSuggestions(field)
  const options = quickSuggestionOptions(field)
  if (options.length) {
    if (!quickSuggestionNavigated.value) {
      quickSuggestionNavigated.value = true
      quickSuggestionIndex.value = options.length - 1
      return
    }
    if (quickSuggestionIndex.value > 0) {
      moveQuickSuggestion(field, -1)
      return
    }
  }
  if (!options.length || !quickSuggestionNavigated.value) {
    handleQuickOsBack(field, index)
    return
  }
}

const baseQuickOsFields = [
  { key: 'requestDate', label: 'Data', type: 'date', required: true },
  { key: 'requestTime', label: 'Horário', type: 'time' },
  { key: 'requestedBy', label: 'Solicitante', type: 'person', required: true, placeholder: 'Pessoa cadastrada' },
  { key: 'equipment', label: 'Equipamento / destino', type: 'destination', required: true, placeholder: 'Destino cadastrado' },
  { key: 'serviceType', label: 'Tipo', type: 'select', options: ['Elétrica', 'Mecânica', 'Outros'] },
  { key: 'note', label: 'Observações', type: 'text', placeholder: 'Abertura da OS' },
  { key: 'maintenanceStartDate', label: 'Início - data', type: 'date' },
  { key: 'maintenanceStartTime', label: 'Início - hora', type: 'time' },
  { key: 'maintenanceEndDate', label: 'Término - data', type: 'date' },
  { key: 'maintenanceEndTime', label: 'Término - hora', type: 'time' },
  { key: 'maintenanceProfessional', label: 'Profissional', type: 'person', placeholder: 'Pessoa cadastrada' },
  { key: 'maintenanceMaterials', label: 'Materiais adicionais', type: 'text', placeholder: 'Opcional' },
  { key: 'maintenanceNote', label: 'Obs. manutenção', type: 'text', placeholder: 'Opcional' },
]

const registrationQuickRequiredKeys = new Set(['maintenanceStartDate', 'maintenanceEndDate'])

function isQuickFieldRequired(field) {
  return field.required || (isRegisteringOrder.value && registrationQuickRequiredKeys.has(field.key))
}

const quickOptionalFieldControls = computed(() =>
  baseQuickOsFields.filter(field => !isQuickFieldRequired(field))
)

const quickOsFields = computed(() =>
  baseQuickOsFields.filter(field => isQuickFieldRequired(field) || !quickHiddenFieldKeys.value.includes(field.key))
)

function isQuickFieldVisible(key) {
  return !quickHiddenFieldKeys.value.includes(key)
}

function toggleQuickFieldVisibility(key) {
  const hidden = new Set(quickHiddenFieldKeys.value)
  if (hidden.has(key)) hidden.delete(key)
  else {
    hidden.add(key)
    osForm.value[key] = key === 'serviceType' ? DEFAULT_SERVICE_TYPE : ''
    if (quickInvalidFieldKey.value === key) quickInvalidFieldKey.value = ''
  }
  quickHiddenFieldKeys.value = [...hidden]
}

function setQuickOsFieldRef(el, index) {
  if (el) quickOsFieldRefs.value[index] = el
}

function focusQuickOsField(index) {
  nextTick(() => {
    const el = quickOsFieldRefs.value[index]
    const field = quickOsFields.value[index]
    if (!el) return
    if (field?.type === 'date') {
      osForm.value[field.key] = formatQuickDateForInput(osForm.value[field.key])
    }
    el.focus?.()
    if (['date', 'time', 'text'].includes(field?.type)) {
      nextTick(() => el.select?.())
    }
  })
}

function focusNextQuickOsField(index) {
  focusQuickOsField(Math.min(index + 1, quickOsFields.value.length - 1))
}

function focusPreviousQuickOsField(index) {
  focusQuickOsField(Math.max(index - 1, 0))
}

async function handleQuickOsMove(field, index) {
  if (!validateQuickField(field, index)) return
  if (index === quickOsFields.value.length - 1) {
    await handleSubmitOS()
    return
  }
  focusNextQuickOsField(index)
}

function handleQuickOsBack(field, index) {
  normalizeQuickField(field)
  focusPreviousQuickOsField(index)
}

function isQuickFieldInvalid(field) {
  return quickInvalidFieldKey.value === field.key
}

function quickInputType(field) {
  return ['date', 'time'].includes(field.type) ? 'text' : field.type
}

function quickPlaceholder(field) {
  if (field.type === 'date') return 'dd/mm/aaaa'
  if (field.type === 'time') return 'HH:mm'
  return field.placeholder
}

function handleQuickFieldInput(field, event) {
  if (quickInvalidFieldKey.value === field.key) quickInvalidFieldKey.value = ''
  if (field.type !== 'date') return
  const formatted = formatPartialOrderDate(event.target.value)
  event.target.value = formatted
  osForm.value[field.key] = formatted
}

function formatQuickDateForInput(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text
}

function normalizeQuickDate(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatQuickDateForInput(text)
  const slash = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/)
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3]
    return `${pad(slash[1])}/${pad(slash[2])}/${year}`
  }
  if (/^\d{4,8}$/.test(text)) return normalizeCompactQuickDate(text)
  return text
}

function compactDateCandidate(day, month, year) {
  const fullYear = year.length === 2 ? `20${year}` : year
  const candidate = `${pad(day)}/${pad(month)}/${fullYear}`
  return isValidOrderDate(candidate) ? candidate : ''
}

function normalizeCompactQuickDate(text) {
  const candidatesByLength = {
    4: [[1, 1, 2]],
    5: [[1, 2, 2], [2, 1, 2]],
    6: [[2, 2, 2], [1, 1, 4]],
    7: [[1, 2, 4], [2, 1, 4]],
    8: [[2, 2, 4]],
  }
  const candidates = candidatesByLength[text.length] || []
  for (const [dayLength, monthLength, yearLength] of candidates) {
    const day = text.slice(0, dayLength)
    const month = text.slice(dayLength, dayLength + monthLength)
    const year = text.slice(dayLength + monthLength, dayLength + monthLength + yearLength)
    const formatted = compactDateCandidate(day, month, year)
    if (formatted) return formatted
  }
  return text
}

function normalizeQuickTime(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const colon = text.match(/^(\d{1,2}):(\d{1,2})$/)
  if (colon) return `${pad(colon[1])}:${pad(colon[2])}`
  const compact = text.match(/^(\d{1,2})(\d{2})$/)
  if (compact) return `${pad(compact[1])}:${compact[2]}`
  return text
}

function normalizeQuickField(field) {
  if (field.type === 'date') {
    osForm.value[field.key] = formatQuickDateForInput(normalizeQuickDate(osForm.value[field.key]))
  }
  if (field.type === 'time') osForm.value[field.key] = normalizeQuickTime(osForm.value[field.key])
}

function validateQuickField(field, index) {
  normalizeQuickField(field)
  if (field.type === 'date' && osForm.value[field.key] && !isValidOrderDate(osForm.value[field.key])) {
    quickInvalidFieldKey.value = field.key
    osForm.value[field.key] = ''
    focusQuickOsField(index)
    return false
  }
  if (field.type === 'time' && osForm.value[field.key] && !isValidTime(osForm.value[field.key])) {
    quickInvalidFieldKey.value = field.key
    osForm.value[field.key] = ''
    focusQuickOsField(index)
    return false
  }
  if (quickInvalidFieldKey.value === field.key) quickInvalidFieldKey.value = ''
  return true
}

function normalizeQuickOsFields() {
  quickOsFields.value.forEach(normalizeQuickField)
}

function dateParts(value) {
  const text = String(value || '').trim()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return { year: Number(br[3]), month: Number(br[2]), day: Number(br[1]) }
  return null
}

function isValidOrderDate(value) {
  const parts = dateParts(value)
  if (!parts) return false
  const date = new Date(parts.year, parts.month - 1, parts.day)
  return !Number.isNaN(date.getTime()) &&
    date.getFullYear() === parts.year &&
    date.getMonth() + 1 === parts.month &&
    date.getDate() === parts.day
}

function orderDateTime(value, time = '00:00') {
  const parts = dateParts(value)
  if (!parts) return null
  const [hours = '0', minutes = '0'] = String(time || '00:00').split(':')
  const date = new Date(parts.year, parts.month - 1, parts.day, Number(hours), Number(minutes))
  return Number.isNaN(date.getTime()) ? null : date
}

function isValidTime(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/)
  if (!match) return false
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

watch([osEntryMode, showNewForm, activeSubTab], () => {
  if (isMotorMode.value || editingOrderId.value || osEntryMode.value !== 'quick') return
  if (!showNewForm.value || (!props.createOnly && !['ordens', 'nova'].includes(activeSubTab.value))) return
  focusQuickOsField(0)
})

function handleNormalOsDestinationSelect({ fullName }) {
  if (isMotorMode.value) return
  osForm.value.equipment = fullName
}

function clearNormalOsDestination() {
  if (isMotorMode.value) return
  osForm.value.destinationId = ''
  osForm.value.equipment = ''
  destinationPickerSearch.value = ''
}

function isRegisteredRequester(name) {
  const q = normalizeText(name)
  if (!q) return false
  return activePeople.value.some(person => normalizeText(person.name) === q)
}

async function ensureQuickPersonRegistered(key, label) {
  const name = String(osForm.value[key] || '').trim()
  if (!name || isRegisteredRequester(name)) return true
  const explicitNew = quickExplicitNewValues.value[key] === name
  if (!explicitNew && strongQuickAutocompleteCandidates({ type: 'person' }, name).length) return true
  const result = await addPerson(name)
  if (!result.ok) {
    showError(result.error || `Nao foi possivel cadastrar ${label}.`)
    return false
  }
  osForm.value[key] = result.person?.name || name
  delete quickExplicitNewValues.value[key]
  return true
}

async function ensureQuickDestinationRegistered() {
  const name = String(osForm.value.equipment || '').trim()
  if (!name) return true
  const existingId = findDestinationIdByEquipment(name)
  if (existingId) {
    osForm.value.destinationId = existingId
    return true
  }
  const explicitNew = quickExplicitNewValues.value.equipment === name
  if (!explicitNew && strongQuickAutocompleteCandidates({ type: 'destination' }, name).length) return true
  const result = await addDestination(name)
  if (!result.ok) {
    showError(result.error || 'Nao foi possivel cadastrar o destino.')
    return false
  }
  osForm.value.destinationId = result.destination?.id || ''
  osForm.value.equipment = result.destination?.name || name
  delete quickExplicitNewValues.value.equipment
  return Boolean(osForm.value.destinationId)
}

async function ensureQuickAutoRegistries() {
  if (isMotorMode.value || osEntryMode.value !== 'quick' || !quickAutoCreateRegistries) return true
  const requesterOk = await ensureQuickPersonRegistered('requestedBy', 'solicitante')
  if (!requesterOk) return false
  const professionalOk = await ensureQuickPersonRegistered('maintenanceProfessional', 'profissional')
  if (!professionalOk) return false
  return ensureQuickDestinationRegistered()
}

watch(() => props.prefillMotor, (motor) => {
  if (!motor || !isMotorMode.value) return
  if (!canManageOs.value) {
    emit('prefill-consumed')
    return
  }
  activeSubTab.value = 'nova'
  showNewForm.value = true
  editingOrderId.value = null
  osForm.value = createEmptyOsForm()
  motorFilterId.value = motor.id
  applyMotorToOsForm(motor)
  emit('prefill-consumed')
}, { immediate: true })

watch(() => props.initialMotorId, (id) => {
  if (!isMotorMode.value || id === null) return
  motorFilterId.value = id || ''
  if (!id || (!showNewForm.value && activeSubTab.value !== 'nova') || editingOrderId.value) return
  const motor = motors.value.find(m => m.id === id)
  if (motor) applyMotorToOsForm(motor)
}, { immediate: true })

watch(scopedMotor, () => {
  if (!showNewForm.value && !editingOrderId.value) return
  applyScopedMotorToOsForm()
}, { immediate: true })

watch(isMotorMode, () => {
  showNewForm.value = false
  editingOrderId.value = null
  resetOsForm()
})

watch(canManageOs, (allowed) => {
  if (allowed) return
  showNewForm.value = false
  editingOrderId.value = null
  motorEventOrderId.value = null
  if (activeSubTab.value === 'nova') activeSubTab.value = 'ordens'
})

watch(() => props.createOnly, (createOnly) => {
  if (!createOnly) return
  if (!canManageOs.value) {
    activeSubTab.value = 'ordens'
    showNewForm.value = false
    return
  }
  activeSubTab.value = 'nova'
  createIntent.value = 'register'
  editingOrderId.value = null
  showNewForm.value = true
  resetOsForm()
}, { immediate: true })

function prepareSubTab(tab, { forceNew = false } = {}) {
  if (tab === 'resumo') loadReport()
  if (tab === 'nova') {
    if (!canManageOs.value) {
      activeSubTab.value = 'ordens'
      showNewForm.value = false
      return
    }
    showNewForm.value = true
    if (forceNew || !editingOrderId.value) {
      editingOrderId.value = null
      motorEventOrderId.value = null
      resetOsForm()
      if (isMotorMode.value && motorFilterId.value) {
        const motor = motors.value.find(m => m.id === motorFilterId.value)
        if (motor) applyMotorToOsForm(motor)
      }
      applyScopedMotorToOsForm()
    }
  } else {
    showNewForm.value = false
  }
}

function switchSubTab(tab) {
  if (tab === 'nova') {
    openNewOsModal()
    return
  }
  if (!visibleSubTabs.value.some(t => t.id === tab)) return
  if (tab === activeSubTab.value) return
  activeSubTab.value = tab
}

function openNewOsModal(intent = 'open') {
  createIntent.value = intent
  if (intent === 'open') osEntryMode.value = 'form'
  activeSubTab.value = 'ordens'
  prepareSubTab('nova', { forceNew: true })
}

watch(() => props.initialTab, (tab) => {
  if (tab === 'nova' || tab === 'registrar') {
    openNewOsModal(tab === 'registrar' ? 'register' : 'open')
    return
  }
  if (!tab || !visibleSubTabs.value.some(t => t.id === tab)) return
  const sameTab = activeSubTab.value === tab
  activeSubTab.value = tab
  if (sameTab) prepareSubTab(tab)
}, { immediate: true })

watch(() => props.initialStatus, (status) => {
  if (['open', 'finished'].includes(status)) ordersStatusTab.value = status
}, { immediate: true })

// ===== Item search for material =====
const matSearchNorm = computed(() => matSearch.value.trim().toLowerCase())
const matItemResults = computed(() => {
  const q = matSearchNorm.value
  return items.value.filter(item => {
    if (!q) return true
    if (item.name.toLowerCase().includes(q) ||
      (item.group || '').toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q) ||
      (item.subcategory || '').toLowerCase().includes(q)) return true

    return getVariationsForItem(item.id).some(v =>
      Object.values(v.values || {}).some(val => String(val || '').toLowerCase().includes(q)) ||
      Object.values(v.extras || {}).some(val => String(val || '').toLowerCase().includes(q)) ||
      (v.location || '').toLowerCase().includes(q)
    )
  })
})

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true }))
}

const DIRECT_ITEMS_SUBCATEGORY = 'Itens diretos'

const matGroupOptions = computed(() =>
  uniqueSorted(matItemResults.value.map(item => item.group || 'Sem grupo'))
)

const matCategoryOptions = computed(() => {
  if (!matSelectedGroup.value) return []
  return uniqueSorted(
    matItemResults.value
      .filter(item => (item.group || 'Sem grupo') === matSelectedGroup.value)
      .map(item => item.category || 'Sem categoria')
  )
})

const matSubcategoryOptions = computed(() => {
  if (!matSelectedGroup.value || !matSelectedCategory.value) return []
  const scopedItems = matItemResults.value.filter(item =>
    (item.group || 'Sem grupo') === matSelectedGroup.value &&
    (item.category || 'Sem categoria') === matSelectedCategory.value
  )
  const subcategories = uniqueSorted(scopedItems.map(item => item.subcategory))
  if (subcategories.length && scopedItems.some(item => !item.subcategory)) {
    return [...subcategories, DIRECT_ITEMS_SUBCATEGORY]
  }
  return subcategories
})

const matItemsForSelection = computed(() => {
  if (!matSelectedGroup.value || !matSelectedCategory.value) return []
  const hasSubcategories = matSubcategoryOptions.value.length > 0
  return matItemResults.value
    .filter(item => {
      if ((item.group || 'Sem grupo') !== matSelectedGroup.value) return false
      if ((item.category || 'Sem categoria') !== matSelectedCategory.value) return false
      if (matSelectedSubcategory.value === DIRECT_ITEMS_SUBCATEGORY) return !item.subcategory
      if (hasSubcategories && matSelectedSubcategory.value) return item.subcategory === matSelectedSubcategory.value
      if (hasSubcategories && !matSelectedSubcategory.value) return false
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true }))
})

const matItemVariations = computed(() =>
  matSelectedItem.value ? getVariationsForItem(matSelectedItem.value.id) : []
)

function matItemStock(item) {
  return getVariationsForItem(item.id).reduce((sum, variation) => sum + Number(variation.stock || 0), 0)
}

function matItemsInGroup(group) {
  return matItemResults.value.filter(item => (item.group || 'Sem grupo') === group)
}

function matItemsInCategory(category) {
  return matItemResults.value.filter(item =>
    (item.group || 'Sem grupo') === matSelectedGroup.value &&
    (item.category || 'Sem categoria') === category
  )
}

function matItemsInSubcategory(subcategory) {
  return matItemResults.value.filter(item => {
    if ((item.group || 'Sem grupo') !== matSelectedGroup.value) return false
    if ((item.category || 'Sem categoria') !== matSelectedCategory.value) return false
    if (subcategory === DIRECT_ITEMS_SUBCATEGORY) return !item.subcategory
    return item.subcategory === subcategory
  })
}

function matItemsStockTotal(itemsList) {
  return itemsList.reduce((sum, item) => sum + matItemStock(item), 0)
}

const matParsedQty = computed(() => {
  const n = Number(matQty.value)
  return isFinite(n) && n > 0 ? n : null
})

const matExceedsStock = computed(() =>
  matParsedQty.value !== null &&
  matSelectedVariation.value !== null &&
  matSelectedVariation.value.stockConfirmed !== false &&
  matParsedQty.value > matSelectedVariation.value.stock
)

function selectSingleMatItemOnEnter() {
  if (matItemResults.value.length === 1) selectMatCatalogItem(matItemResults.value[0])
}

function selectMatGroup(group) {
  matSelectedGroup.value = group
  matSelectedCategory.value = ''
  matSelectedSubcategory.value = ''
  matSelectedItem.value = null
  matSelectedVariation.value = null
}

function selectMatCategory(category) {
  matSelectedCategory.value = category
  matSelectedSubcategory.value = ''
  matSelectedItem.value = null
  matSelectedVariation.value = null
}

function selectMatSubcategory(subcategory) {
  matSelectedSubcategory.value = subcategory
  matSelectedItem.value = null
  matSelectedVariation.value = null
}

function selectMatCatalogItem(item) {
  matSelectedGroup.value = item.group || 'Sem grupo'
  matSelectedCategory.value = item.category || 'Sem categoria'
  matSelectedSubcategory.value = item.subcategory || (matSubcategoryOptions.value.includes(DIRECT_ITEMS_SUBCATEGORY) ? DIRECT_ITEMS_SUBCATEGORY : '')
  matSelectedItem.value = item
  matSelectedVariation.value = null
  matQty.value = '1'
}

function resetMatCatalogSelection(level = 'root') {
  if (level === 'root') {
    matSelectedGroup.value = ''
    matSelectedCategory.value = ''
    matSelectedSubcategory.value = ''
    matSelectedItem.value = null
    matSelectedVariation.value = null
    return
  }
  if (level === 'group') {
    matSelectedCategory.value = ''
    matSelectedSubcategory.value = ''
    matSelectedItem.value = null
    matSelectedVariation.value = null
    return
  }
  if (level === 'category') {
    matSelectedSubcategory.value = ''
    matSelectedItem.value = null
    matSelectedVariation.value = null
    return
  }
  matSelectedItem.value = null
  matSelectedVariation.value = null
}

watch(matSearch, () => {
  matSelectedGroup.value = ''
  matSelectedCategory.value = ''
  matSelectedSubcategory.value = ''
  matSelectedItem.value = null
  matSelectedVariation.value = null
  matStep.value = 1
})

// ===== Filtered OS list =====
const visibleOrdersBase = computed(() =>
  workOrders.value.filter(o => {
    if (!isMotorMode.value) return !o.motorId
    if (!o.motorId) return false
    return !activeMotorFilterId.value || o.motorId === activeMotorFilterId.value
  })
)

function isOrderFinished(order) {
  return Boolean(order.maintenanceEndDate)
}

function isOrderOpen(order) {
  return !isOrderFinished(order)
}

const orderStats = computed(() => {
  const orders = visibleOrdersBase.value
  const finished = orders.filter(isOrderFinished).length
  const withMaterials = orders.filter(o => (o.items || []).length).length
  return {
    total: orders.length,
    open: orders.length - finished,
    finished,
    withMaterials,
  }
})

const searchedOrders = computed(() => {
  const baseOrders = visibleOrdersBase.value
  const q = normalizeText(searchQuery.value)
  const from = historyDateFrom.value ? new Date(`${historyDateFrom.value}T00:00:00`) : null
  const to = historyDateTo.value ? new Date(`${historyDateTo.value}T23:59:59`) : null
  return baseOrders.filter(o => {
    if (!orderHasDateInRange(o, from, to)) return false
    if (!q) return true
    const haystack = [
      o.number,
      formatDateOnly(o.requestDate),
      formatDateTimeParts(o.maintenanceStartDate, o.maintenanceStartTime, ''),
      formatDateTimeParts(o.maintenanceEndDate, o.maintenanceEndTime, ''),
      orderDisplayTitle(o),
      o.motorTag,
      o.motorName,
      ...workOrderMaintenanceSearchParts(o),
      o.requestedBy,
      o.note,
      o.maintenanceProfessional,
      o.maintenanceMaterials,
      o.maintenanceNote,
    ].join(' ')
    return normalizeText(haystack).includes(q)
  })
})

const orderStatusTabs = computed(() => {
  const orders = searchedOrders.value
  return [
    { id: 'open', label: 'Ordens abertas', count: orders.filter(isOrderOpen).length },
    { id: 'finished', label: 'Ordens finalizadas', count: orders.filter(isOrderFinished).length },
  ]
})

function orderHasDateInRange(order, from, to) {
  if (!from && !to) return true
  const dates = [
    orderDateTime(order.requestDate, order.requestTime),
    orderDateTime(order.maintenanceStartDate, order.maintenanceStartTime),
    orderDateTime(order.maintenanceEndDate, order.maintenanceEndTime),
  ].filter(Boolean)
  return dates.some(date => (!from || date >= from) && (!to || date <= to))
}

const filteredOrders = computed(() => {
  return searchedOrders.value.filter(order =>
    ordersStatusTab.value === 'finished' ? isOrderFinished(order) : isOrderOpen(order)
  )
})

const ordersPage = computed({
  get: () => ordersStatusTab.value === 'finished' ? finishedOrdersPage.value : openOrdersPage.value,
  set: page => {
    if (ordersStatusTab.value === 'finished') finishedOrdersPage.value = page
    else openOrdersPage.value = page
  },
})
const ordersTotalPages = computed(() => Math.max(1, Math.ceil(filteredOrders.value.length / ORDERS_PAGE_SIZE)))
const paginatedOrders = computed(() => {
  const start = (ordersPage.value - 1) * ORDERS_PAGE_SIZE
  return filteredOrders.value.slice(start, start + ORDERS_PAGE_SIZE)
})

const historyOrders = computed(() => {
  const q = normalizeText(searchQuery.value)
  const from = historyDateFrom.value ? new Date(`${historyDateFrom.value}T00:00:00`) : null
  const to = historyDateTo.value ? new Date(`${historyDateTo.value}T23:59:59`) : null

  return visibleOrdersBase.value
    .filter(o => {
      if (ordersStatusTab.value === 'finished' ? !isOrderFinished(o) : !isOrderOpen(o)) return false
      if (!orderHasDateInRange(o, from, to)) return false

      if (!q) return true
      const haystack = [
        o.number,
        formatDateOnly(o.requestDate),
        formatDateTimeParts(o.maintenanceStartDate, o.maintenanceStartTime, ''),
        formatDateTimeParts(o.maintenanceEndDate, o.maintenanceEndTime, ''),
        o.requestedBy,
        orderDisplayTitle(o),
        ...workOrderMaintenanceSearchParts(o),
        o.motorTag,
        o.motorName,
        motorOrderEventLabel(o),
        o.note,
        o.maintenanceProfessional,
        o.maintenanceMaterials,
        o.maintenanceNote,
      ].join(' ')
      return normalizeText(haystack).includes(q)
    })
    .sort((a, b) => {
      const bDate = b.createdAt || `${b.requestDate || ''} ${b.requestTime || ''}`
      const aDate = a.createdAt || `${a.requestDate || ''} ${a.requestTime || ''}`
      return bDate.localeCompare(aDate)
    })
})

const hasHistoryFilters = computed(() =>
  Boolean(searchQuery.value || historyDateFrom.value || historyDateTo.value)
)

const historyTotalPages = computed(() => Math.max(1, Math.ceil(historyOrders.value.length / HISTORY_PAGE_SIZE)))
const paginatedHistoryOrders = computed(() => {
  const start = (historyPage.value - 1) * HISTORY_PAGE_SIZE
  return historyOrders.value.slice(start, start + HISTORY_PAGE_SIZE)
})

watch([searchQuery, historyDateFrom, historyDateTo], () => {
  openOrdersPage.value = 1
  finishedOrdersPage.value = 1
  historyPage.value = 1
}, { flush: 'sync' })

watch(motorFilterId, () => {
  openOrdersPage.value = 1
  finishedOrdersPage.value = 1
  historyPage.value = 1
})

watch(ordersTotalPages, total => {
  if (ordersPage.value > total) ordersPage.value = total
})

watch(historyTotalPages, total => {
  if (historyPage.value > total) historyPage.value = total
})

function clearHistoryFilters() {
  searchQuery.value = ''
  historyDateFrom.value = ''
  historyDateTo.value = ''
}


function csvDateStamp() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`
}

function orderItemsCsvLabel(order) {
  return (order.items || [])
    .map(item => {
      const variation = variationLabel(item)
      const qty = [item.qty, item.itemUnit].filter(Boolean).join(' ')
      return [item.itemName, variation !== '-' ? variation : '', qty].filter(Boolean).join(' - ')
    })
    .join(' | ')
}

function orderCsvRows(orders) {
  const headers = [
    'numero',
    'status',
    'data_abertura',
    'horario_abertura',
    'solicitante',
    isMotorMode.value ? 'motor' : 'equipamento',
    'destino_ou_oficina',
    'tipo',
    'observacoes_abertura',
    'inicio_manutencao',
    'termino_manutencao',
    'profissional',
    'materiais_estoque',
    'materiais_adicionais',
    'observacoes_manutencao',
  ]
  const rows = orders.map(order => [
    order.number ? `#${order.number}` : '',
    orderStatusLabel(order),
    formatDateOnly(order.requestDate),
    formatTimeOnly(order.requestTime),
    order.requestedBy || '',
    orderDisplayTitle(order),
    maintenanceLocationLabel(order),
    order.serviceType || order.service_type || '',
    order.note || '',
    formatDateTimeParts(order.maintenanceStartDate, order.maintenanceStartTime, ''),
    maintenanceEndLabel(order),
    order.maintenanceProfessional || '',
    orderItemsCsvLabel(order),
    order.maintenanceMaterials || '',
    order.maintenanceNote || '',
  ])
  return [headers, ...rows]
}

function downloadCsv(filename, rows) {
  if (!rows.length || rows.length === 1) {
    showError('Nenhuma OS para exportar.')
    return
  }
  const blob = new Blob([serializeCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  success('CSV exportado.')
}

function exportOrdersCsv(orders, scope) {
  const mode = isMotorMode.value ? 'os-motores' : 'os-comuns'
  const filename = `${mode}-${scope}-${csvDateStamp()}.csv`
  downloadCsv(filename, orderCsvRows(orders))
}

function exportSingleOrderCsv(order) {
  const number = order.number ? `os-${order.number}` : `os-${order.id || 'individual'}`
  exportOrdersCsv([order], number)
}

function exportFilteredHistoryCsv() {
  exportOrdersCsv(historyOrders.value, 'filtrado')
}

function exportAllHistoryCsv() {
  exportOrdersCsv(visibleOrdersBase.value, 'tudo')
}

watch(() => [props.focusOrderId, visibleOrdersBase.value.length], ([orderId]) => {
  editFocusedOrder(orderId)
}, { immediate: true })

watch(() => osForm.value.initialMotorEventType, (eventType) => {
  if (!isMotorMode.value || eventType !== 'movimentado') return
  osForm.value.maintenanceLocationType = 'interna'
})

watch(() => motorEventForm.value.eventType, (eventType) => {
  if (!isMotorMode.value || eventType !== 'movimentado') return
  osForm.value.maintenanceLocationType = 'interna'
})

function validateOsForm() {
  if (!isMotorMode.value) syncQuickDestinationFromText(false)
  osForm.value.requestTime = normalizeQuickTime(osForm.value.requestTime)
  osForm.value.maintenanceStartTime = normalizeQuickTime(osForm.value.maintenanceStartTime)
  osForm.value.maintenanceEndTime = normalizeQuickTime(osForm.value.maintenanceEndTime)
  const numberText = String(osForm.value.number || '').trim()
  if (numberText && (!Number.isInteger(Number(numberText)) || Number(numberText) <= 0)) { showError('Número da ordem inválido'); return false }
  if (!osForm.value.requestedBy.trim()) { showError('Solicitante é obrigatório'); return false }
  if (!isRegisteredRequester(osForm.value.requestedBy)) { showError('Solicitante deve ser uma pessoa cadastrada ativa'); return false }
  if (osForm.value.maintenanceLocationType === 'interna' && osForm.value.maintenanceProfessional.trim() && !isRegisteredRequester(osForm.value.maintenanceProfessional)) { showError('Profissional deve ser uma pessoa cadastrada ativa'); return false }
  if (!osForm.value.requestDate) { showError('Data é obrigatória'); return false }
  if (!isValidOrderDate(osForm.value.requestDate)) { showError('Data inválida'); return false }
  if (osForm.value.requestTime && !isValidTime(osForm.value.requestTime)) { showError('Horário inválido'); return false }
  if (isMotorMode.value && !osForm.value.motorId) { showError('Motor é obrigatório'); return false }
  if (!isMotorMode.value && !osForm.value.destinationId) { showError('Selecione um equipamento em destinos'); return false }
  if (!isMotorMode.value && !destinationOptions.value.some(d => d.id === osForm.value.destinationId)) { showError('Equipamento deve ser um destino ativo'); return false }
  if (osForm.value.maintenanceLocationType === 'externa' && !osForm.value.maintenanceExternalLocation.trim()) { showError('Oficina externa é obrigatória'); return false }
  if (isMotorMode.value && !motorObjectiveTypes.some(type => type.id === osForm.value.initialMotorEventType)) { showError('Evento inicial do motor é obrigatório'); return false }
  if (isMotorMode.value && osForm.value.initialMotorEventType === 'movimentado' && !osForm.value.initialMotorEventToDestinationId) { showError('Informe o novo local do motor'); return false }
  if (editingOrderId.value && isMotorMode.value && motorEventForm.value.eventType === 'movimentado' && !motorEventForm.value.toDestinationId) { showError('Informe o novo local do motor'); return false }
  if (isMotorMode.value && osForm.value.maintenanceEndDate && !MOTOR_STATUS_AFTER_OPTIONS.some(status => status.id === osForm.value.motorStatusAfterMaintenance)) { showError('Informe o status do motor após a OS'); return false }

  const internalMaintenance = osForm.value.maintenanceLocationType === 'interna'
  const hasStartDate = !!osForm.value.maintenanceStartDate
  const hasStartTime = !!osForm.value.maintenanceStartTime
  const hasEndDate = !!osForm.value.maintenanceEndDate
  const hasEndTime = !!osForm.value.maintenanceEndTime
  const creationDateError = workOrderCreationDateError(
    editingOrderId.value ? '' : createIntent.value,
    osForm.value.maintenanceStartDate,
    osForm.value.maintenanceEndDate
  )
  if (creationDateError) { showError(creationDateError); return false }
  if (hasStartTime && !hasStartDate) { showError('Informe data de início da manutenção'); return false }
  if (hasEndTime && !hasEndDate) { showError('Informe data de término da manutenção'); return false }
  if (hasStartDate && !isValidOrderDate(osForm.value.maintenanceStartDate)) { showError('Data de início inválida'); return false }
  if (hasStartTime && !isValidTime(osForm.value.maintenanceStartTime)) { showError('Horário de início inválido'); return false }
  if (hasEndDate && !isValidOrderDate(osForm.value.maintenanceEndDate)) { showError('Data de término inválida'); return false }
  if (hasEndTime && !isValidTime(osForm.value.maintenanceEndTime)) { showError('Horário de término inválido'); return false }
  if (hasEndDate && !hasStartDate) { showError('Informe início/envio antes do término/retorno da manutenção'); return false }
  if (hasStartDate && hasEndDate) {
    const start = orderDateTime(osForm.value.maintenanceStartDate, osForm.value.maintenanceStartTime)
    const end = orderDateTime(osForm.value.maintenanceEndDate, osForm.value.maintenanceEndTime)
    if (end < start) { showError('Término não pode ser antes do início da manutenção'); return false }
  }
  return true
}

function motorObjectiveLabel(eventType) {
  const type = motorObjectiveTypes.find(option => option.id === eventType)
  if (!type) return eventType
  return showExecutionFields.value ? type.label : motorOpenEventLabel(type.id)
}

function buildOrderTitle(form) {
  if (editingOrderId.value && form.title) return form.title
  const subject = isMotorMode.value
    ? `Motor ${selectedOsMotor.value?.tag || form.equipment.trim() || ''}`.trim()
    : selectedDestinationLabel(form.destinationId)
  const objective = isMotorMode.value && !editingOrderId.value && form.initialMotorEventType !== 'nenhum'
    ? motorObjectiveLabel(form.initialMotorEventType)
    : ''
  return `${subject || 'Sem equipamento'}${objective ? ` - ${objective}` : ''}`
}

function buildOsPayload() {
  const form = osForm.value
  const equipment = isMotorMode.value ? (selectedOsMotor.value?.tag || form.equipment.trim()) : selectedDestinationLabel(form.destinationId)
  const numberText = String(form.number || '').trim()
  const internalMaintenance = form.maintenanceLocationType === 'interna'
  const includeExecution = showExecutionFields.value
  const hasInitialMotorEvent = isMotorMode.value && form.initialMotorEventType !== 'nenhum'
  const initialMotorEventPerformedBy = form.maintenanceLocationType === 'externa'
    ? form.maintenanceExternalLocation.trim()
    : form.maintenanceProfessional.trim()
  const maintenanceStartDate = form.maintenanceStartDate
  const maintenanceStartTime = form.maintenanceStartTime
  const maintenanceProfessional = isMotorMode.value && internalMaintenance ? initialMotorEventPerformedBy : form.maintenanceProfessional.trim()

  return {
    createIntent: editingOrderId.value ? '' : createIntent.value,
    number: numberText ? Number(numberText) : '',
    title: buildOrderTitle(form),
    motorId: isMotorMode.value ? form.motorId : '',
    destinationId: isMotorMode.value ? '' : form.destinationId,
    requestedBy: form.requestedBy.trim(),
    requestDate: form.requestDate,
    requestTime: form.requestTime,
    equipment,
    motorOriginDestinationId: isMotorMode.value ? form.motorOriginDestinationId : '',
    motorOriginDestinationName: isMotorMode.value ? form.motorOriginDestinationName : '',
    maintenanceLocationType: form.maintenanceLocationType,
    maintenanceDestinationId: '',
    maintenanceExternalLocation: form.maintenanceLocationType === 'externa' ? form.maintenanceExternalLocation.trim() : '',
    maintenanceExternalOrderNumber: form.maintenanceLocationType === 'externa' ? form.maintenanceExternalOrderNumber.trim() : '',
    initialMotorEventType: isMotorMode.value ? form.initialMotorEventType : '',
    initialMotorEventDate: hasInitialMotorEvent
      ? (includeExecution ? (form.maintenanceEndDate || form.requestDate) : (form.maintenanceStartDate || form.requestDate))
      : '',
    initialMotorEventPerformedBy: hasInitialMotorEvent ? initialMotorEventPerformedBy : '',
    initialMotorEventToDestinationId: hasInitialMotorEvent && form.initialMotorEventType === 'movimentado' ? form.initialMotorEventToDestinationId : '',
    initialMotorEventToDestination: '',
    initialMotorEventNotes: hasInitialMotorEvent ? form.maintenanceNote.trim() : '',
    serviceType: form.serviceType || DEFAULT_SERVICE_TYPE,
    note: form.note.trim(),
    maintenanceStartDate,
    maintenanceStartTime,
    maintenanceEndDate: includeExecution ? form.maintenanceEndDate : '',
    maintenanceEndTime: includeExecution ? form.maintenanceEndTime : '',
    maintenanceProfessional: includeExecution && internalMaintenance ? maintenanceProfessional : '',
    maintenanceMaterials: includeExecution ? form.maintenanceMaterials.trim() : '',
    maintenanceNote: includeExecution ? form.maintenanceNote.trim() : '',
    motorStatusAfterMaintenance: includeExecution && isMotorMode.value && form.maintenanceEndDate ? form.motorStatusAfterMaintenance : '',
  }
}

const duplicateWorkOrderFields = [
  'motorId',
  'destinationId',
  'equipment',
  'requestedBy',
  'requestDate',
  'requestTime',
  'serviceType',
  'note',
  'maintenanceLocationType',
  'maintenanceExternalLocation',
  'maintenanceExternalOrderNumber',
  'maintenanceStartDate',
  'maintenanceStartTime',
  'maintenanceEndDate',
  'maintenanceEndTime',
  'maintenanceProfessional',
  'maintenanceMaterials',
  'maintenanceNote',
  'motorStatusAfterMaintenance',
]

function duplicateValue(value) {
  return normalizeText(value)
}

function duplicateSignatureFromPayload(payload) {
  return JSON.stringify(duplicateWorkOrderFields.map(key => duplicateValue(payload[key])))
}

function duplicateSignatureFromOrder(order) {
  const values = {
    motorId: valueFromOrder(order, 'motorId', 'motor_id'),
    destinationId: valueFromOrder(order, 'destinationId', 'destination_id'),
    equipment: valueFromOrder(order, 'equipment'),
    requestedBy: valueFromOrder(order, 'requestedBy', 'requested_by'),
    requestDate: valueFromOrder(order, 'requestDate', 'request_date'),
    requestTime: valueFromOrder(order, 'requestTime', 'request_time'),
    serviceType: valueFromOrder(order, 'serviceType', 'service_type'),
    note: valueFromOrder(order, 'note'),
    maintenanceLocationType: valueFromOrder(order, 'maintenanceLocationType', 'maintenance_location_type'),
    maintenanceExternalLocation: valueFromOrder(order, 'maintenanceExternalLocation', 'maintenance_external_location'),
    maintenanceExternalOrderNumber: valueFromOrder(order, 'maintenanceExternalOrderNumber', 'maintenance_external_order_number'),
    maintenanceStartDate: valueFromOrder(order, 'maintenanceStartDate', 'maintenance_start_date'),
    maintenanceStartTime: valueFromOrder(order, 'maintenanceStartTime', 'maintenance_start_time'),
    maintenanceEndDate: valueFromOrder(order, 'maintenanceEndDate', 'maintenance_end_date'),
    maintenanceEndTime: valueFromOrder(order, 'maintenanceEndTime', 'maintenance_end_time'),
    maintenanceProfessional: valueFromOrder(order, 'maintenanceProfessional', 'maintenance_professional'),
    maintenanceMaterials: valueFromOrder(order, 'maintenanceMaterials', 'maintenance_materials'),
    maintenanceNote: valueFromOrder(order, 'maintenanceNote', 'maintenance_note'),
    motorStatusAfterMaintenance: valueFromOrder(order, 'motorStatusAfterMaintenance', 'motor_status_after_maintenance'),
  }
  return JSON.stringify(duplicateWorkOrderFields.map(key => duplicateValue(values[key])))
}

function shouldWarnDuplicateWorkOrder(payload) {
  const previousOrder = visibleOrdersBase.value[0]
  if (!previousOrder) return false
  const signature = duplicateSignatureFromPayload(payload)
  if (signature !== duplicateSignatureFromOrder(previousOrder)) {
    quickDuplicateWarningSignature.value = ''
    return false
  }
  if (quickDuplicateWarningSignature.value === signature) return false
  quickDuplicateWarningSignature.value = signature
  showError(`OS igual à anterior. Clique em ${formSubmitLabel.value} de novo para confirmar.`)
  return true
}

// ===== Actions =====
async function handleCreateOS() {
  if (!canManageOs.value) return
  const continueQuickEntry = isRegisteringOrder.value && !isMotorMode.value && osEntryMode.value === 'quick'
  try {
    if (continueQuickEntry) {
      normalizeQuickOsFields()
      const autoRegistriesOk = await ensureQuickAutoRegistries()
      if (!autoRegistriesOk) return
    }
    if (!validateOsForm()) return
    const payload = buildOsPayload()
    if (shouldWarnDuplicateWorkOrder(payload)) return
    const created = await addWorkOrder(payload)
    ordersStatusTab.value = created.maintenanceEndDate ? 'finished' : 'open'
    quickDuplicateWarningSignature.value = ''
    if (isMotorMode.value) await loadMotorData().catch(() => {})
    success(createIntent.value === 'register' ? 'Ordem de serviço registrada' : 'Ordem de serviço aberta', {
      label: 'Abrir',
      onClick: () => {
        activeSubTab.value = 'ordens'
        expandedOrderId.value = created.id
      },
    })
    if (props.createOnly) {
      if (!continueQuickEntry || !quickKeepValues.value) resetOsForm()
      emit('created')
      return
    }
    if (continueQuickEntry) {
      if (!quickKeepValues.value) resetOsForm()
      showNewForm.value = true
      osEntryMode.value = 'quick'
      await nextTick()
      focusQuickOsField(0)
      return
    }
    showNewForm.value = false
    activeSubTab.value = 'ordens'
    resetOsForm()
  } catch (e) { showError(e.message) }
}

async function handleEditOS(id) {
  if (!canManageOs.value) return
  if (!validateOsForm()) return
  try {
    const currentOrder = visibleOrdersBase.value.find(o => o.id === id)
    const updatedOrder = await editWorkOrder(id, buildOsPayload())
    if (isMotorMode.value && currentOrder?.motorId) {
      const eventOrder = {
        ...updatedOrder,
        motorEventId: currentOrder.motorEventId || updatedOrder.motorEventId || '',
        motorEventType: currentOrder.motorEventType || updatedOrder.motorEventType || '',
      }
      await persistMotorEventForOrder(eventOrder)
      await loadWorkOrders().catch(() => {})
      await loadMotorData().catch(() => {})
    }
    success('Ordem de serviço atualizada')
    editingOrderId.value = null
    motorEventOrderId.value = null
    activeSubTab.value = 'ordens'
    expandedOrderId.value = id
    resetOsForm()
    if (props.popupOnly) emit('updated', updatedOrder)
  } catch (e) { showError(e.message) }
}

async function handleSubmitOS() {
  if (editingOrderId.value) {
    await handleEditOS(editingOrderId.value)
    return
  }
  await handleCreateOS()
}

function loadOrderIntoEditForm(order) {
  expandedOrderId.value = null
  editingOrderId.value = order.id
  showNewForm.value = true
  osEntryMode.value = 'form'
  osForm.value = createEmptyOsForm(order)
  destinationPickerSearch.value = selectedDestinationLabel(osForm.value.destinationId)
  destinationPickerOpen.value = false
  if (isMotorMode.value && order.motorId) {
    motorEventOrderId.value = order.id
    motorEventForm.value = {
      ...emptyMotorEventForm(order),
      eventType: order.motorEventType === 'enrolar' ? 'enrolado' : (order.motorEventType || 'nenhum'),
      eventDate: dateInputValue(order.motorEventDate || order.requestDate || todayDate()),
      performedBy: order.motorEventPerformedBy || order.maintenanceProfessional || '',
      toDestinationId: destinationIdForName(order.motorEventToDestination),
      toDestination: order.motorEventToDestination || '',
      notes: order.motorEventNotes || '',
    }
  }
}

async function startEditOS(order) {
  if (!canManageOs.value) return
  window.dispatchEvent(new CustomEvent('app-picker-open', { detail: 'edit-os' }))
  activeSubTab.value = 'ordens'
  loadOrderIntoEditForm(order)
  await nextTick()
}

function cancelEdit() {
  editingOrderId.value = null
  motorEventOrderId.value = null
  showNewForm.value = false
  activeSubTab.value = 'ordens'
  resetOsForm()
  if (props.popupOnly) emit('closed')
}

async function handleDeleteOS(id) {
  if (!isAdmin.value) return
  try {
    const result = await deleteWorkOrder(id)
    for (const movementId of result?.removedMovementIds || []) {
      const idx = movements.value.findIndex(m => m.id === movementId)
      if (idx !== -1) movements.value.splice(idx, 1)
    }
    for (const restored of result?.restoredStock || []) {
      const liveVar = variations.value.find(v => v.id === restored.variationId)
      if (liveVar) liveVar.stock = restored.newStock
    }
    success('Ordem de serviço excluída')
    confirmDeleteId.value = null
    if (expandedOrderId.value === id) expandedOrderId.value = null
  } catch (e) { showError(e.message) }
}

async function handleAddMaterial() {
  if (!canManageOs.value) return
  if (!matParsedQty.value || !matSelectedVariation.value || !addingMaterialToId.value) return
  if (matExceedsStock.value) { showError('Estoque insuficiente'); return }

  try {
    const result = await addMaterial(addingMaterialToId.value, matSelectedVariation.value.id, matParsedQty.value)
    const liveVar = variations.value.find(v => v.id === matSelectedVariation.value.id)
    if (liveVar) liveVar.stock = result.newStock
    if (result.movement) movements.value.unshift(result.movement)
    const item = result.movement ? items.value.find(i => i.id === result.movement.itemId) : null
    const status = stockAlertTransition(result.movement, liveVar, item)
    if (status) showError(status === 'zero'
      ? `${result.movement.itemName} ficou sem estoque.`
      : `${result.movement.itemName} entrou em alerta de estoque: ${result.movement.stockAfter} ${result.movement.itemUnit}.`
    )
    success('Material adicionado à OS')
    cancelAddMaterial()
  } catch (e) { showError(e.message) }
}

async function handleRemoveMaterial(workOrderId, woiId) {
  if (!isAdmin.value) return
  try {
    const result = await removeMaterial(workOrderId, woiId)
    if (result.variationId && result.newStock !== null) {
      const liveVar = variations.value.find(v => v.id === result.variationId)
      if (liveVar) liveVar.stock = result.newStock
    }
    if (result.removedMovementId) {
      const idx = movements.value.findIndex(m => m.id === result.removedMovementId)
      if (idx !== -1) movements.value.splice(idx, 1)
    }
    success('Material removido da OS')
    confirmRemoveItemId.value = null
  } catch (e) { showError(e.message) }
}

function startMotorEvent(order, type = 'nenhum') {
  motorEventOrderId.value = order.id
  motorEventForm.value = { ...emptyMotorEventForm(order), eventType: type }
}

function cancelMotorEvent() {
  motorEventOrderId.value = null
  motorEventForm.value = emptyMotorEventForm()
}

function buildMotorEventPayload(order) {
  if (!canManageOs.value) return
  if (!order.motorId) return
  if (motorEventForm.value.eventType === 'nenhum') {
    return
  }
  const usingEditForm = editingOrderId.value === order.id
  if (motorEventForm.value.eventType === 'movimentado' && !motorEventForm.value.toDestinationId) {
    showError('Informe o novo local do motor')
    return
  }
  if (!usingEditForm && !motorEventForm.value.eventDate) {
    showError('Data do evento do motor é obrigatória')
    return
  }
  const maintenanceLocationType = usingEditForm ? osForm.value.maintenanceLocationType : order.maintenanceLocationType
  const externalLocation = usingEditForm
    ? osForm.value.maintenanceExternalLocation
    : (order.maintenanceExternalLocation || order.maintenanceLocationName || '')
  const performedBy = maintenanceLocationType === 'externa'
    ? externalLocation
    : (usingEditForm ? osForm.value.maintenanceProfessional : motorEventForm.value.performedBy)
  return {
    ...motorEventForm.value,
    eventDate: usingEditForm ? (osForm.value.maintenanceEndDate || osForm.value.requestDate || order.requestDate) : motorEventForm.value.eventDate,
    notes: usingEditForm ? osForm.value.maintenanceNote.trim() : motorEventForm.value.notes,
    toDestinationId: motorEventForm.value.eventType === 'movimentado' ? motorEventForm.value.toDestinationId : '',
    toDestination: '',
    performedBy,
    workOrderId: order.id,
  }
}

function applyMotorEventToOrder(order, event, fallbackPayload = {}) {
  if (!order || !event) return
  order.motorEventId = event.id || order.motorEventId || ''
  order.motorEventType = event.eventType || fallbackPayload.eventType || ''
  order.motorEventLabel = motorEventLabel(order.motorEventType)
  order.motorEventDate = event.eventDate || fallbackPayload.eventDate || ''
  order.motorEventPerformedBy = event.performedBy || fallbackPayload.performedBy || ''
  order.motorEventToDestination = event.toDestination || fallbackPayload.toDestination || ''
  order.motorEventNotes = event.notes || fallbackPayload.notes || ''
}

async function persistMotorEventForOrder(order) {
  const eventPayload = buildMotorEventPayload(order)
  if (!eventPayload) return null
  const event = order.motorEventId
    ? await editMotorEvent(order.motorId, order.motorEventId, eventPayload)
    : await addMotorEvent(order.motorId, eventPayload)
  applyMotorEventToOrder(order, event, eventPayload)
  return event
}

async function handleMotorEvent(order) {
  if (!canManageOs.value) return
  if (!order.motorId) return
  if (motorEventForm.value.eventType === 'nenhum') {
    cancelMotorEvent()
    return
  }
  try {
    await persistMotorEventForOrder(order)
    success('Evento do motor registrado')
    cancelMotorEvent()
  } catch (e) { showError(e.message) }
}

// ===== Report =====
const expandedReportDest = ref(null)
const visibleReport = computed(() =>
  report.value
    .map(group => {
      const orders = (group.orders || []).filter(o => {
        if (!isMotorMode.value) return !o.motorId
        if (!o.motorId) return false
        return !props.scopedMotorId || o.motorId === props.scopedMotorId
      })
      const totals = {}
      for (const order of orders) {
        for (const item of order.items || []) {
          const key = `${item.itemId}||${JSON.stringify(item.variationValues || {})}`
          if (!totals[key]) {
            totals[key] = {
              itemId: item.itemId,
              itemName: item.itemName,
              itemUnit: item.itemUnit,
              variationValues: item.variationValues,
              qty: 0,
            }
          }
          totals[key].qty += item.qty
        }
      }
      const osMaterialTotals = Object.values(totals)
      return { ...group, orders, osMaterialTotals, materialTotals: osMaterialTotals }
    })
    .filter(group => group.orders.length || (group.osMaterialTotals || []).length)
)

watch(activeSubTab, (tab) => {
  prepareSubTab(tab)
  emit('update:tab', tab)
})

// ===== Helpers =====






function orderStatusLabel(order) {
  return isOrderFinished(order) ? 'Finalizada' : 'Aberta'
}

function orderStatusClass(order) {
  return isOrderFinished(order)
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
}



function motorOrderEventLabel(order) {
  if (!order?.motorId) return ''
  if (!isOrderFinished(order) && order.motorEventType) return motorOpenEventLabel(order.motorEventType)
  if (order.motorEventLabel) return order.motorEventLabel === 'Enrolar' ? 'Enrolado' : order.motorEventLabel
  if (order.motorEventType) return motorEventLabel(order.motorEventType)
  const parts = String(order.title || '').split(' - ').map(part => part.trim()).filter(Boolean)
  const label = parts.length > 1 ? parts[parts.length - 1] : ''
  if (!label || label === order.motorName || label === order.motorTag) return ''
  return label === 'Enrolar' ? 'Enrolado' : label
}




function orderHistoryLocationLabel(order) {
  const label = order.motorId ? maintenanceLocationLabel(order) : order.destinationName
  if (!label || label === '-') return ''
  const kind = order.motorId ? workOrderMaintenanceKindLabel(order) : ''
  const visibleLabel = kind && !normalizeText(label).includes(normalizeText(kind)) ? `${kind}: ${label}` : label
  return normalizeText(visibleLabel) === normalizeText(orderDisplayTitle(order)) ? '' : visibleLabel
}



function toggleOrder(id) {
  expandedOrderId.value = expandedOrderId.value === id ? null : id
}

function closeOrderDetails() {
  expandedOrderId.value = null
  motorEventOrderId.value = null
  if (props.popupOnly) emit('closed')
}

function revealOrder(order) {
  activeSubTab.value = 'ordens'
  searchQuery.value = ''
  ordersStatusTab.value = isOrderFinished(order) ? 'finished' : 'open'
  const orderIndex = filteredOrders.value.findIndex(item => item.id === order.id)
  ordersPage.value = orderIndex < 0 ? 1 : Math.floor(orderIndex / ORDERS_PAGE_SIZE) + 1
  expandedOrderId.value = order.id
  nextTick(() => document.getElementById(`os-${order.id}`)?.scrollIntoView({ block: 'center' }))
}

function openOrderFromHistory(order) {
  if (canManageOs.value && isMotorMode.value && !order.maintenanceEndDate && !order.maintenanceEndTime) {
    startEditOS(order)
    return
  }
  revealOrder(order)
}

function editFocusedOrder(orderId) {
  if (!orderId) return
  const order = visibleOrdersBase.value.find(o => o.id === orderId)
  if (!order) return
  if (canManageOs.value) {
    startEditOS(order)
    return
  }
  revealOrder(order)
}

function cancelNewOsForm() {
  editingOrderId.value = null
  motorEventOrderId.value = null
  showNewForm.value = false
  resetOsForm()
  if (!props.createOnly) activeSubTab.value = 'ordens'
  if (props.popupOnly) emit('closed')
}

function selectMatItem(item) {
  matSelectedItem.value = item
  matStep.value = 2
}

function selectMatVariation(v) {
  matSelectedVariation.value = v
  matStep.value = 3
  matQty.value = '1'
  nextTick(() => focusRef(matQtyEl))
}

function matBackToStep1() {
  matSelectedItem.value = null
  matSelectedVariation.value = null
  matStep.value = 1
  nextTick(() => focusRef(matSearchEl))
}

function matBackToStep2() {
  matSelectedVariation.value = null
  matStep.value = 2
}
</script>

<template>
  <div class="ds-page-stack" :class="{ hidden: popupOnly }">
    <datalist id="os-people-options">
      <option v-for="p in activePeople" :key="p.id" :value="p.name" />
    </datalist>
    <!-- Header -->
    <div v-if="!embedded" class="ds-page-header">
      <div>
        <h1 class="ds-page-title">{{ pageTitle }}</h1>
        <p class="ds-page-subtitle">{{ pageSubtitle }}</p>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-full sm:min-w-[28rem]">
        <div class="ds-metric">
          <p class="ds-metric-label">Total</p>
          <p class="ds-metric-value">{{ orderStats.total }}</p>
        </div>
        <div class="ds-metric">
          <p class="ds-metric-label">Abertas</p>
          <p class="ds-metric-value">{{ orderStats.open }}</p>
        </div>
        <div class="ds-metric">
          <p class="ds-metric-label">Finalizadas</p>
          <p class="ds-metric-value">{{ orderStats.finished }}</p>
        </div>
        <div class="ds-metric">
          <p class="ds-metric-label">Com material</p>
          <p class="ds-metric-value">{{ orderStats.withMaterials }}</p>
        </div>
      </div>
    </div>

    <SectionTabs
      route-tab="ordens"
      v-if="!createOnly"
      aria-label="Seções de ordens de serviço"
      :model-value="activeSubTab"
      :tabs="visibleSubTabs"
      @update:model-value="switchSubTab"
    />

    <div v-if="!createOnly && activeSubTab !== 'nova'" class="ds-toolbar">
      <div
        class="grid w-full gap-3 lg:items-end"
        :class="isMotorMode
          ? (activeSubTab === 'ordens' && canManageOs ? 'lg:grid-cols-[minmax(18rem,1fr)_15rem_10rem_10rem_auto]' : 'lg:grid-cols-[minmax(18rem,1fr)_15rem_10rem_10rem]')
          : (activeSubTab === 'ordens' && canManageOs ? 'lg:grid-cols-[minmax(18rem,1fr)_10rem_10rem_auto]' : 'lg:grid-cols-[minmax(18rem,1fr)_10rem_10rem]')"
      >
        <div class="relative">
          <label class="ds-label">Buscar</label>
          <svg class="absolute left-3 top-[2.1rem] h-4 w-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
          <input
            v-model="searchQuery"
            type="search"
            class="ds-input pl-9"
            :placeholder="isMotorMode ? 'Buscar por OS, motor, solicitante, profissional ou oficina' : 'Buscar por OS, equipamento, solicitante, profissional ou oficina'"
          />
        </div>
        <div v-if="isMotorMode">
          <label class="ds-label">Motor</label>
          <MotorPicker v-model="motorFilterId" :options="motorOptions" :disabled="motorFilterLocked" />
        </div>
        <label>
          <span class="ds-label">De</span>
          <input v-model="historyDateFrom" type="date" class="ds-input" />
        </label>
        <label>
          <span class="ds-label">Até</span>
          <input v-model="historyDateTo" type="date" class="ds-input" />
        </label>
        <div v-if="activeSubTab === 'ordens' && canManageOs" class="flex self-end gap-2 whitespace-nowrap">
          <AppButton variant="primary" size="sm" @click="openNewOsModal('open')">Abrir OS</AppButton>
          <AppButton variant="secondary" size="sm" @click="openNewOsModal('register')">Registrar OS</AppButton>
        </div>
      </div>
    </div>

    <!-- TAB: Ordens de Serviço / Nova OS -->
    <template v-if="activeSubTab === 'ordens' || activeSubTab === 'nova'">
      <div v-if="!createOnly && activeSubTab === 'ordens'" class="flex flex-wrap items-center gap-2">
        <div class="inline-flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
          <button
            v-for="tab in isMotorMode ? [
              { id: 'open', label: 'Abertas', count: orderStats.open },
              { id: 'finished', label: 'Finalizadas', count: orderStats.finished },
            ] : orderStatusTabs"
            :key="tab.id"
            type="button"
            class="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
            :class="ordersStatusTab === tab.id ? 'bg-[var(--ds-brand)] text-[var(--ds-primary-text)] hover:bg-[var(--ds-brand-hover)]' : 'text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700'"
            @click="ordersStatusTab = tab.id"
          >
            {{ tab.label }}
            <span
              class="rounded px-1.5 py-0.5 text-[10px]"
              :class="ordersStatusTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'"
            >{{ tab.count }}</span>
          </button>
        </div>
      </div>

      <!-- New OS form -->
      <component
        v-if="showNewForm && (activeSubTab === 'ordens' || activeSubTab === 'nova' || createOnly || editingOrderId)"
        :is="createOnly ? 'div' : AppDialog"
        v-bind="createOnly ? {} : { visible: true, ariaLabel: 'Formulário de ordem de serviço' }"
        :class="createOnly ? 'ds-panel p-4' : ''"
        @close="cancelNewOsForm"
      >
        <div :class="createOnly ? 'space-y-4' : 'ds-panel flex max-h-[calc(100vh-1rem)] w-full max-w-5xl flex-col overflow-hidden p-3 shadow-2xl sm:p-4'">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <span class="ds-chip">{{ formStatusLabel }}</span>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{{ formTitle }}</h3>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-400">Campos com * são obrigatórios</span>
            <button
              v-if="!createOnly"
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              aria-label="Fechar"
              @click="cancelNewOsForm"
            >x</button>
          </div>
        </div>

        <div :class="createOnly ? 'space-y-4' : 'min-h-0 flex-1 space-y-2 overflow-y-auto pb-2 pr-1'">
        <div v-if="!isMotorMode && isRegisteringOrder" class="inline-flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
            :class="osEntryMode === 'form' ? 'bg-primary-600 text-[var(--ds-primary-text)]' : 'text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700'"
            @click="osEntryMode = 'form'"
          >Formulário</button>
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
            :class="osEntryMode === 'quick' ? 'bg-primary-600 text-[var(--ds-primary-text)]' : 'text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700'"
            @click="osEntryMode = 'quick'"
          >Preenchimento rápido</button>
        </div>

        <div v-if="!isMotorMode && isRegisteringOrder && osEntryMode === 'quick'" class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Preenchimento rápido</h4>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Modo planilha: digite uma linha e use Enter, seta para baixo ou seta para cima para navegar.
              </p>
            </div>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                :class="quickKeepValues
                  ? 'bg-primary-600 text-[var(--ds-primary-text)] hover:bg-primary-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700'"
                @click="quickKeepValues = !quickKeepValues"
              >
                Manter dados
              </button>
              <div class="relative" data-quick-rows-menu>
                <button
                  type="button"
                  class="flex items-center gap-1.5 rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
                  @click="quickRowsMenuOpen = !quickRowsMenuOpen"
                >
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 5.25h16.5M3.75 9.75h16.5M3.75 14.25h16.5M3.75 18.75h16.5" />
                  </svg>
                  Linhas
                </button>
                <div
                  v-if="quickRowsMenuOpen"
                  class="absolute right-0 top-full z-[220] mt-2 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-900"
                >
                  <button
                    v-for="field in quickOptionalFieldControls"
                    :key="field.key"
                    type="button"
                    class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    @click="toggleQuickFieldVisibility(field.key)"
                  >
                    <span
                      class="flex h-4 w-4 items-center justify-center rounded border"
                      :class="isQuickFieldVisible(field.key)
                        ? 'border-primary-500 bg-primary-600 text-[var(--ds-primary-text)]'
                        : 'border-gray-300 dark:border-gray-600'"
                    >
                      <svg v-if="isQuickFieldVisible(field.key)" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </span>
                    {{ field.label }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="mt-4 overflow-visible rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <div class="grid grid-cols-1 border-b border-gray-100 dark:border-gray-800 md:grid-cols-[220px_minmax(0,1fr)]">
              <label class="flex min-h-10 items-center gap-1 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                Nº da Ordem
              </label>
              <div class="min-h-10 w-full bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
                Automático ao criar
              </div>
            </div>
            <div
              v-for="(field, index) in quickOsFields"
              :key="field.key"
              class="relative grid grid-cols-1 border-b border-gray-100 last:border-b-0 dark:border-gray-800 md:grid-cols-[220px_minmax(0,1fr)]"
              :class="quickSuggestionOptions(field).length ? 'z-50' : 'z-0'"
            >
              <label class="flex min-h-10 items-center gap-1 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {{ field.label }}<span v-if="isQuickFieldRequired(field)" class="text-red-500">*</span>
              </label>
              <select
                v-if="field.type === 'select'"
                :ref="el => setQuickOsFieldRef(el, index)"
                v-model="osForm[field.key]"
                class="min-h-10 w-full border-0 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-900 dark:text-gray-100"
                @focus="closeQuickSuggestions()"
                @keydown.enter.prevent="handleQuickOsMove(field, index)"
                @keydown.escape.prevent="closeQuickSuggestions({ blur: true })"
                @keydown.shift.tab.prevent="handleQuickOsBack(field, index)"
                @keydown.up.prevent="handleQuickOsBack(field, index)"
              >
                <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
              </select>
              <div
                v-else-if="field.type === 'person' || field.type === 'destination'"
                data-quick-suggestion-root
                class="relative min-h-10 bg-white dark:bg-gray-900"
              >
                <div
                  v-if="quickSuggestionFieldKey === field.key && !quickSuggestionNavigated && quickInlineCompletion(field)"
                  aria-hidden="true"
                  class="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre px-3 py-2 text-sm"
                >
                  <span class="invisible">{{ osForm[field.key] }}</span>
                  <span class="text-gray-400 dark:text-gray-500">{{ quickInlineCompletion(field) }}</span>
                </div>
                <input
                  :ref="el => setQuickOsFieldRef(el, index)"
                  v-model="osForm[field.key]"
                  type="text"
                  role="combobox"
                  autocomplete="off"
                  :aria-expanded="quickSuggestionOptions(field).length > 0"
                  :aria-controls="`quick-suggestions-${field.key}`"
                  :aria-activedescendant="quickSuggestionNavigated && quickSuggestionIndex >= 0 ? `quick-suggestion-${field.key}-${quickSuggestionIndex}` : undefined"
                  :placeholder="field.placeholder"
                  class="relative z-10 min-h-10 w-full border-0 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 dark:text-gray-100"
                  :class="(field.type === 'person' && osForm[field.key] && !isRegisteredRequester(osForm[field.key])) || (field.type === 'destination' && osForm.equipment && !osForm.destinationId)
                    ? 'focus:ring-amber-500 text-amber-700 dark:text-amber-300'
                    : 'focus:ring-primary-500'"
                  @focus="$event.target.select(); openQuickSuggestions(field)"
                  @input="handleQuickAutocompleteInput(field)"
                  @change="field.type === 'destination' && syncQuickDestinationFromText(false)"
                  @blur="field.type === 'destination' && syncQuickDestinationFromText(false); setTimeout(closeQuickSuggestions, 120)"
                  @keydown.enter.prevent="commitQuickAutocomplete(field, index)"
                  @keydown.escape.prevent="closeQuickSuggestions({ blur: true })"
                  @keydown.down.prevent="handleQuickAutocompleteDown(field)"
                  @keydown.up.prevent="handleQuickAutocompleteUp(field, index)"
                  @keydown.shift.tab.prevent="handleQuickOsBack(field, index)"
                />
                <div
                  v-if="quickSuggestionOptions(field).length"
                  :id="`quick-suggestions-${field.key}`"
                  role="listbox"
                  class="absolute left-0 right-0 top-full z-[200] max-h-56 overflow-auto border border-gray-200 bg-white py-1 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-900"
                >
                  <button
                    v-for="(suggestion, suggestionIndex) in quickSuggestionOptions(field)"
                    :id="`quick-suggestion-${field.key}-${suggestionIndex}`"
                    :key="`${suggestion.type || 'existing'}:${suggestion.option}`"
                    type="button"
                    role="option"
                    tabindex="-1"
                    :aria-selected="quickSuggestionNavigated && suggestionIndex === quickSuggestionIndex"
                    class="block w-full truncate px-3 py-2 text-left text-gray-700 dark:text-gray-200"
                    :class="[
                      quickSuggestionNavigated && suggestionIndex === quickSuggestionIndex ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200' : 'hover:bg-gray-50 dark:hover:bg-gray-800',
                      suggestion.type === 'new' ? 'border-t border-gray-100 font-semibold text-primary-700 dark:border-gray-800 dark:text-primary-300' : ''
                    ]"
                    @mousedown.prevent="chooseQuickSuggestion(field, suggestion, index)"
                  >
                    {{ suggestion.label || suggestion.option }}
                  </button>
                </div>
                <p
                  v-else-if="quickAutocompleteStatus(field)"
                  class="pointer-events-none absolute bottom-0 left-3 right-3 translate-y-[-2px] truncate text-[10px]"
                  :class="quickAutocompleteStatus(field).type === 'error'
                    ? 'text-red-500 dark:text-red-400'
                    : quickAutocompleteStatus(field).type === 'warn'
                      ? 'text-amber-600 dark:text-amber-300'
                      : 'text-gray-400 dark:text-gray-500'"
                >
                  {{ quickAutocompleteStatus(field).text }}
                </p>
              </div>
              <input
                v-else
                :ref="el => setQuickOsFieldRef(el, index)"
                v-model="osForm[field.key]"
                :type="quickInputType(field)"
                :list="field.list"
                :inputmode="['date', 'time'].includes(field.type) ? 'numeric' : undefined"
                :maxlength="field.type === 'date' ? 10 : field.type === 'time' ? 5 : undefined"
                :placeholder="quickPlaceholder(field)"
                class="min-h-10 w-full border-0 px-3 py-2 text-sm outline-none focus:ring-2 dark:text-gray-100"
                :class="isQuickFieldInvalid(field)
                  ? 'bg-red-50 text-red-700 ring-2 ring-red-500 placeholder-red-300 focus:ring-red-500 dark:bg-red-950/30 dark:text-red-200 dark:placeholder-red-400'
                  : 'bg-white text-gray-900 focus:ring-primary-500 dark:bg-gray-900'"
                @focus="closeQuickSuggestions(); field.type === 'date' && (osForm[field.key] = formatQuickDateForInput(osForm[field.key])); $event.target.select()"
                @input="handleQuickFieldInput(field, $event)"
                @blur="normalizeQuickField(field)"
                @keydown.enter.prevent="handleQuickOsMove(field, index)"
                @keydown.escape.prevent="closeQuickSuggestions({ blur: true })"
                @keydown.shift.tab.prevent="handleQuickOsBack(field, index)"
                @keydown.down.prevent="handleQuickOsMove(field, index)"
                @keydown.up.prevent="handleQuickOsBack(field, index)"
              />
            </div>
          </div>
        </div>

        <div v-if="isMotorMode || editingOrderId || osEntryMode === 'form' || createIntent === 'open'" class="rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-800/40">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nº da Ordem</label>
              <input v-model="osForm.number" type="number" min="1" placeholder="Automático" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data *</label>
              <input v-model="osForm.requestDate" type="date" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Horário *</label>
              <input v-model="osForm.requestTime" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @blur="osForm.requestTime = normalizeQuickTime(osForm.requestTime)" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Solicitante *</label>
              <PersonPicker
                v-model="osForm.requestedBy"
                placeholder="Buscar pessoa cadastrada..."
                :invalid="Boolean(osForm.requestedBy) && !isRegisteredRequester(osForm.requestedBy)"
              />
            </div>
            <div v-if="!isMotorMode" class="relative md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Equipamento *</label>
              <DestinationTreePicker
                v-model="osForm.destinationId"
                placeholder="Buscar destino ou máquina..."
                @select="handleNormalOsDestinationSelect"
                @clear="clearNormalOsDestination"
              />
            </div>
            <div v-if="!isMotorMode">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tipo</label>
              <select v-model="osForm.serviceType" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                <option>Elétrica</option>
                <option>Mecânica</option>
                <option>Outros</option>
              </select>
            </div>
            <div v-if="!isMotorMode" class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tipo de execução</label>
              <div class="grid grid-cols-2 rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                <button
                  type="button"
                  class="px-2 py-2 text-xs font-medium transition-colors"
                  :class="osForm.maintenanceLocationType === 'interna' ? 'bg-primary-600 text-[var(--ds-primary-text)]' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
                  @click="osForm.maintenanceLocationType = 'interna'"
                >Interna</button>
                <button
                  type="button"
                  class="px-2 py-2 text-xs font-medium transition-colors"
                  :class="osForm.maintenanceLocationType === 'externa' ? 'bg-primary-600 text-[var(--ds-primary-text)]' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
                  @click="osForm.maintenanceLocationType = 'externa'"
                >Externa</button>
              </div>
            </div>
            <div v-if="isMotorMode" class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Motor *</label>
              <select v-model="osForm.motorId" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @change="applyMotorToOsForm()">
                <option value="">Sem motor</option>
                <option v-for="opt in motorOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
              </select>
            </div>
            <template v-if="isMotorMode">
              <div class="md:col-span-2">
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Evento do motor</label>
                <select v-model="osForm.initialMotorEventType" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                  <option v-for="type in motorObjectiveTypes" :key="type.id" :value="type.id">
                    {{ showExecutionFields ? type.label : motorOpenEventLabel(type.id) }}
                  </option>
                </select>
              </div>
              <div class="md:col-span-2">
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tipo de manutenção *</label>
                <div class="grid grid-cols-2 rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                  <button
                    type="button"
                    class="px-2 py-2 text-xs font-medium transition-colors"
                    :class="osForm.maintenanceLocationType === 'interna' ? 'bg-primary-600 text-[var(--ds-primary-text)]' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
                    @click="osForm.maintenanceLocationType = 'interna'"
                  >Interna</button>
                  <button
                    type="button"
                    class="px-2 py-2 text-xs font-medium transition-colors"
                    :disabled="osForm.initialMotorEventType === 'movimentado'"
                    :class="[
                      osForm.maintenanceLocationType === 'externa' ? 'bg-primary-600 text-[var(--ds-primary-text)]' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
                      osForm.initialMotorEventType === 'movimentado' ? 'cursor-not-allowed opacity-50' : ''
                    ]"
                    @click="osForm.maintenanceLocationType = 'externa'"
                  >Externa</button>
                </div>
              </div>
              <div v-if="!showExecutionFields && osForm.initialMotorEventType === 'movimentado'" class="md:col-span-2">
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Novo local do motor *</label>
                <DestinationTreePicker v-model="osForm.initialMotorEventToDestinationId" placeholder="Buscar novo local do motor..." />
              </div>
            </template>
            <template v-if="!showExecutionFields && osForm.maintenanceLocationType === 'externa'">
              <div class="md:col-span-2">
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Oficina externa / executado por *</label>
                <input v-model="osForm.maintenanceExternalLocation" type="text" placeholder="Oficina externa, fornecedor ou local de envio" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
              <div class="md:col-span-2">
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Número do pedido</label>
                <input v-model="osForm.maintenanceExternalOrderNumber" type="text" placeholder="Pedido, OC ou referência externa" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
            </template>
            <fieldset v-if="!showExecutionFields" class="md:col-span-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-300 px-3 pb-3 sm:grid-cols-2 dark:border-gray-600">
              <legend class="px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Opcional</legend>
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data de início da manutenção</label>
                <input v-model="osForm.maintenanceStartDate" type="date" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Horário de início</label>
                <input v-model="osForm.maintenanceStartTime" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @blur="osForm.maintenanceStartTime = normalizeQuickTime(osForm.maintenanceStartTime)" />
              </div>
            </fieldset>
            <div class="md:col-span-4">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Observações</label>
              <textarea v-model="osForm.note" rows="1" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="Observações da abertura"></textarea>
            </div>
          </div>
        </div>

        <div v-if="showExecutionFields && (isMotorMode || editingOrderId || osEntryMode === 'form') && osForm.maintenanceLocationType === 'interna'" class="rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-800/40">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data início</label>
              <input v-model="osForm.maintenanceStartDate" type="date" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Horário início</label>
              <input v-model="osForm.maintenanceStartTime" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @blur="osForm.maintenanceStartTime = normalizeQuickTime(osForm.maintenanceStartTime)" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data término</label>
              <input v-model="osForm.maintenanceEndDate" type="date" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Horário término</label>
              <input v-model="osForm.maintenanceEndTime" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @blur="osForm.maintenanceEndTime = normalizeQuickTime(osForm.maintenanceEndTime)" />
            </div>
            <div v-if="isMotorMode && osForm.maintenanceEndDate" class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status do motor após a OS *</label>
              <select v-model="osForm.motorStatusAfterMaintenance" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                <option v-for="status in MOTOR_STATUS_AFTER_OPTIONS" :key="status.id" :value="status.id">{{ status.label }}</option>
              </select>
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Profissional</label>
              <PersonPicker
                v-model="osForm.maintenanceProfessional"
                placeholder="Buscar pessoa cadastrada..."
                :invalid="Boolean(osForm.maintenanceProfessional) && !isRegisteredRequester(osForm.maintenanceProfessional)"
              />
            </div>
            <div v-if="isMotorMode && osForm.initialMotorEventType === 'movimentado'" class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Novo local do motor *</label>
              <DestinationTreePicker v-model="osForm.initialMotorEventToDestinationId" placeholder="Buscar novo local do motor..." />
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Materiais adicionais</label>
              <textarea v-model="osForm.maintenanceMaterials" rows="1" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="Materiais fora do catálogo, peças ou ferramentas"></textarea>
            </div>
            <div class="md:col-span-4">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Observações da manutenção</label>
              <textarea v-model="osForm.maintenanceNote" rows="1" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="Serviço executado, pendências, testes"></textarea>
            </div>
          </div>
        </div>

        <div v-if="showExecutionFields && (isMotorMode || editingOrderId || osEntryMode === 'form') && osForm.maintenanceLocationType === 'externa'" class="rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-800/40">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Oficina externa / executado por *</label>
              <input v-model="osForm.maintenanceExternalLocation" type="text" placeholder="Oficina externa, fornecedor ou local de envio" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Numero do pedido</label>
              <input v-model="osForm.maintenanceExternalOrderNumber" type="text" placeholder="Pedido, OC ou referencia externa" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data envio</label>
              <input v-model="osForm.maintenanceStartDate" type="date" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Horário envio</label>
              <input v-model="osForm.maintenanceStartTime" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @blur="osForm.maintenanceStartTime = normalizeQuickTime(osForm.maintenanceStartTime)" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data retorno</label>
              <input v-model="osForm.maintenanceEndDate" type="date" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Horário retorno</label>
              <input v-model="osForm.maintenanceEndTime" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @blur="osForm.maintenanceEndTime = normalizeQuickTime(osForm.maintenanceEndTime)" />
            </div>
            <div v-if="isMotorMode && osForm.maintenanceEndDate" class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status do motor após a OS *</label>
              <select v-model="osForm.motorStatusAfterMaintenance" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                <option v-for="status in MOTOR_STATUS_AFTER_OPTIONS" :key="status.id" :value="status.id">{{ status.label }}</option>
              </select>
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Materiais adicionais</label>
              <textarea v-model="osForm.maintenanceMaterials" rows="1" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="Materiais fora do catálogo, peças ou ferramentas"></textarea>
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Observações da execução externa</label>
              <textarea v-model="osForm.maintenanceNote" rows="1" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="Retorno, pendências, laudo ou observações"></textarea>
            </div>
          </div>
        </div>

        </div>
        <div
          class="flex items-center gap-2"
          :class="createOnly ? 'pt-1' : 'shrink-0 border-t border-gray-200 bg-white pt-3 dark:border-gray-700 dark:bg-gray-900'"
        >
          <button class="px-4 py-2 text-sm font-medium text-[var(--ds-primary-text)] bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors" @click="handleSubmitOS">{{ formSubmitLabel }}</button>
          <button class="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" @click="cancelNewOsForm">Cancelar</button>
        </div>
        </div>
      </component>

      <!-- Orders list -->
      <EmptyState
        v-if="!createOnly && activeSubTab === 'ordens' && filteredOrders.length === 0"
        :title="searchQuery
          ? 'Nenhuma OS encontrada'
          : (ordersStatusTab === 'finished' ? 'Nenhuma ordem finalizada' : 'Nenhuma ordem aberta')"
        :text="searchQuery ? 'Tente limpar a busca ou procurar por número, solicitante ou equipamento.' : 'Abra uma OS para iniciar o histórico deste fluxo.'"
        :action-label="canManageOs ? 'Abrir OS' : ''"
        @action="openNewOsModal('open')"
      />

      <div v-else-if="!createOnly && activeSubTab === 'ordens'" class="ds-list-panel">
        <div
          v-for="order in paginatedOrders"
          :key="order.id"
          :id="`os-${order.id}`"
          class="ds-list-row"
        >
          <div
            class="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-3 cursor-pointer transition-colors sm:gap-3 sm:px-4"
            @click="toggleOrder(order.id)"
          >
            <svg
              class="w-4 h-4 text-gray-400 transition-transform flex-shrink-0"
              :class="expandedOrderId === order.id ? 'rotate-90' : ''"
              fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
            ><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>

            <span class="text-xs font-bold px-2 py-0.5 rounded bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-400 whitespace-nowrap">
              OS #{{ order.number }}
            </span>
            <span class="text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap" :class="orderStatusClass(order)">
              {{ orderStatusLabel(order) }}
            </span>
            <span v-if="order.motorTag" class="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap">
              Motor {{ order.motorTag }}
            </span>
            <span class="flex w-full basis-full items-center gap-2 truncate text-sm font-medium text-gray-900 dark:text-gray-100 sm:w-auto sm:min-w-[180px] sm:basis-auto sm:flex-1">
              <span class="truncate">{{ orderDisplayTitle(order) }}</span>
              <span v-if="isMotorMode && motorOrderEventLabel(order)" class="text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 whitespace-nowrap">
                {{ motorOrderEventLabel(order) }}
              </span>
            </span>
            <span class="max-w-full truncate text-xs text-gray-500 dark:text-gray-400 sm:whitespace-nowrap">{{ order.requestedBy || 'Sem solicitante' }}</span>
            <span class="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{{ formatDateTimeParts(order.requestDate, order.requestTime, order.createdAt) }}</span>
            <span class="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
              {{ (order.items || []).length }} {{ (order.items || []).length === 1 ? 'material' : 'materiais' }}
            </span>
            <button
              v-if="canManageOs"
              type="button"
              class="ml-auto min-h-10 px-3 py-1.5 text-xs font-medium text-[var(--ds-primary-text)] bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors sm:ml-0"
              @click.stop="startEditOS(order)"
            >
              Editar
            </button>
            <button
              v-if="isMotorMode && isAdmin && confirmDeleteId !== order.id"
              type="button"
              class="min-h-10 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              @click.stop="confirmDeleteId = order.id"
            >
              Excluir
            </button>
            <template v-else-if="isMotorMode && isAdmin">
              <span class="text-xs text-red-600 dark:text-red-400">Confirmar?</span>
              <button
                type="button"
                class="min-h-10 px-3 py-1 text-xs font-medium text-white bg-[var(--ds-danger-solid)] hover:bg-[var(--ds-danger-hover)] rounded"
                @click.stop="handleDeleteOS(order.id)"
              >
                Sim
              </button>
              <button
                type="button"
                class="min-h-10 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                @click.stop="confirmDeleteId = null"
              >
                Não
              </button>
            </template>
          </div>

          <AppDialog
            v-if="expandedOrderId === order.id && editingOrderId !== order.id"
            visible
            align="start"
            aria-label="Detalhes da ordem de serviço"
            @close="closeOrderDetails"
          >
            <div class="ds-panel max-h-[calc(100vh-2rem)] w-full max-w-6xl space-y-4 overflow-y-auto p-4 shadow-2xl sm:p-5">
              <div class="flex items-start justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-700">
                <div class="min-w-0">
                  <p class="ds-page-kicker">Ordem de Serviço</p>
                  <h3 class="mt-1 truncate text-lg font-semibold text-gray-900 dark:text-gray-100">OS #{{ order.number }} · {{ orderDisplayTitle(order) }}</h3>
                </div>
                <button
                  type="button"
                  class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  aria-label="Fechar"
                  @click="closeOrderDetails"
                >x</button>
              </div>
            <template v-if="editingOrderId === order.id">
              <div class="space-y-4">
                <div class="rounded-xl border border-gray-200 bg-white/70 p-4 space-y-3 dark:border-gray-700 dark:bg-gray-800/40">
                  <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Abertura da OS</h4>
                  <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nº da Ordem</label>
                      <input v-model="osForm.number" type="number" min="1" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data *</label>
                      <input v-model="osForm.requestDate" type="date" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Horário *</label>
                      <input v-model="osForm.requestTime" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @blur="osForm.requestTime = normalizeQuickTime(osForm.requestTime)" />
                    </div>
                    <div class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Solicitante *</label>
                      <PersonPicker
                        v-model="osForm.requestedBy"
                        placeholder="Buscar pessoa cadastrada..."
                        :invalid="Boolean(osForm.requestedBy) && !isRegisteredRequester(osForm.requestedBy)"
                      />
                    </div>
                    <div v-if="!isMotorMode" class="relative md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Equipamento *</label>
                      <DestinationTreePicker
                        v-model="osForm.destinationId"
                        placeholder="Buscar destino ou máquina..."
                        @select="handleNormalOsDestinationSelect"
                        @clear="clearNormalOsDestination"
                      />
                    </div>
                    <div v-if="!isMotorMode" class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tipo de execução</label>
                      <div class="grid grid-cols-2 rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                        <button
                          type="button"
                          class="px-2 py-2 text-xs font-medium transition-colors"
                          :class="osForm.maintenanceLocationType === 'interna' ? 'bg-primary-600 text-[var(--ds-primary-text)]' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
                          @click="osForm.maintenanceLocationType = 'interna'"
                        >Interna</button>
                        <button
                          type="button"
                          class="px-2 py-2 text-xs font-medium transition-colors"
                          :class="osForm.maintenanceLocationType === 'externa' ? 'bg-primary-600 text-[var(--ds-primary-text)]' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
                          @click="osForm.maintenanceLocationType = 'externa'"
                        >Externa</button>
                      </div>
                    </div>
                    <div v-if="isMotorMode" class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Motor *</label>
                      <select v-model="osForm.motorId" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @change="applyMotorToOsForm()">
                        <option value="">Sem motor</option>
                        <option v-for="opt in motorOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
                      </select>
                    </div>
                    <template v-if="isMotorMode">
                      <div class="md:col-span-2">
                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Evento do motor</label>
                        <select v-model="motorEventForm.eventType" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                          <option v-for="t in motorEventTypes" :key="t.id" :value="t.id">{{ t.label }}</option>
                        </select>
                      </div>
                      <div class="md:col-span-2">
                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tipo de manutenção *</label>
                        <div class="grid grid-cols-2 rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                          <button
                            type="button"
                            class="px-2 py-2 text-xs font-medium transition-colors"
                            :class="osForm.maintenanceLocationType === 'interna' ? 'bg-primary-600 text-[var(--ds-primary-text)]' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
                            @click="osForm.maintenanceLocationType = 'interna'"
                          >Interna</button>
                          <button
                            type="button"
                            class="px-2 py-2 text-xs font-medium transition-colors"
                            :disabled="motorEventForm.eventType === 'movimentado'"
                            :class="[
                              osForm.maintenanceLocationType === 'externa' ? 'bg-primary-600 text-[var(--ds-primary-text)]' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
                              motorEventForm.eventType === 'movimentado' ? 'cursor-not-allowed opacity-50' : ''
                            ]"
                            @click="osForm.maintenanceLocationType = 'externa'"
                          >Externa</button>
                        </div>
                      </div>
                    </template>
                    <div class="md:col-span-4">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Observações</label>
                      <textarea v-model="osForm.note" rows="2" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"></textarea>
                    </div>
                  </div>
                </div>

                <div v-if="osForm.maintenanceLocationType === 'interna'" class="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Execução interna</h4>
                  <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data início</label>
                      <input v-model="osForm.maintenanceStartDate" type="date" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Horário início</label>
                      <input v-model="osForm.maintenanceStartTime" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @blur="osForm.maintenanceStartTime = normalizeQuickTime(osForm.maintenanceStartTime)" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data término</label>
                      <input v-model="osForm.maintenanceEndDate" type="date" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Horário término</label>
                      <input v-model="osForm.maintenanceEndTime" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @blur="osForm.maintenanceEndTime = normalizeQuickTime(osForm.maintenanceEndTime)" />
                    </div>
                    <div v-if="isMotorMode && osForm.maintenanceEndDate" class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status do motor após a OS *</label>
                      <select v-model="osForm.motorStatusAfterMaintenance" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                        <option v-for="status in MOTOR_STATUS_AFTER_OPTIONS" :key="status.id" :value="status.id">{{ status.label }}</option>
                      </select>
                    </div>
                    <div class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Profissional</label>
                      <PersonPicker
                        v-model="osForm.maintenanceProfessional"
                        placeholder="Buscar pessoa cadastrada..."
                        :invalid="Boolean(osForm.maintenanceProfessional) && !isRegisteredRequester(osForm.maintenanceProfessional)"
                      />
                    </div>
                    <div v-if="isMotorMode && motorEventForm.eventType === 'movimentado'" class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Novo local do motor *</label>
                      <DestinationTreePicker v-model="motorEventForm.toDestinationId" placeholder="Buscar novo local do motor..." />
                    </div>
                    <div class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Materiais adicionais</label>
                      <textarea v-model="osForm.maintenanceMaterials" rows="2" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"></textarea>
                    </div>
                    <div class="md:col-span-4">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Observações da manutenção</label>
                      <textarea v-model="osForm.maintenanceNote" rows="2" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"></textarea>
                    </div>
                  </div>
                </div>

                <div v-if="osForm.maintenanceLocationType === 'externa'" class="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Execução externa</h4>
                  <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Oficina externa / executado por *</label>
                      <input v-model="osForm.maintenanceExternalLocation" type="text" placeholder="Oficina externa, fornecedor ou local de envio" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Numero do pedido</label>
                      <input v-model="osForm.maintenanceExternalOrderNumber" type="text" placeholder="Pedido, OC ou referencia externa" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data envio</label>
                      <input v-model="osForm.maintenanceStartDate" type="date" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Horário envio</label>
                      <input v-model="osForm.maintenanceStartTime" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @blur="osForm.maintenanceStartTime = normalizeQuickTime(osForm.maintenanceStartTime)" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data retorno</label>
                      <input v-model="osForm.maintenanceEndDate" type="date" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Horário retorno</label>
                      <input v-model="osForm.maintenanceEndTime" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent" @blur="osForm.maintenanceEndTime = normalizeQuickTime(osForm.maintenanceEndTime)" />
                    </div>
                    <div v-if="isMotorMode && osForm.maintenanceEndDate" class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status do motor após a OS *</label>
                      <select v-model="osForm.motorStatusAfterMaintenance" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                        <option v-for="status in MOTOR_STATUS_AFTER_OPTIONS" :key="status.id" :value="status.id">{{ status.label }}</option>
                      </select>
                    </div>
                    <div class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Materiais adicionais</label>
                      <textarea v-model="osForm.maintenanceMaterials" rows="2" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"></textarea>
                    </div>
                    <div class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Observações da execução externa</label>
                      <textarea v-model="osForm.maintenanceNote" rows="2" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"></textarea>
                    </div>
                  </div>
                </div>

                <div v-if="false && isMotorMode && order.motorId" class="ds-surface p-3 space-y-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Registrar evento do motor</h4>
                    <span class="text-xs text-gray-400 dark:text-gray-500">Evento vinculado a esta OS</span>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select v-model="motorEventForm.eventType" class="ds-input">
                      <option v-for="t in motorEventTypes" :key="t.id" :value="t.id">{{ t.label }}</option>
                    </select>
                    <template v-if="motorEventForm.eventType !== 'nenhum'">
                      <input v-model="motorEventForm.eventDate" type="date" class="ds-input" />
                      <input v-if="osForm.maintenanceLocationType !== 'externa'" v-model="motorEventForm.performedBy" list="os-people-options" placeholder="Executado por" class="ds-input" />
                      <div v-else class="ds-input bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                        {{ osForm.maintenanceExternalLocation || 'Oficina externa' }}
                      </div>
                      <div v-if="motorEventForm.eventType === 'movimentado'" class="md:col-span-2">
                        <DestinationTreePicker v-model="motorEventForm.toDestinationId" placeholder="Novo local do motor *" />
                      </div>
                    </template>
                  </div>
                  <textarea v-if="motorEventForm.eventType !== 'nenhum'" v-model="motorEventForm.notes" rows="2" placeholder="Observações do evento" class="ds-input"></textarea>
                  <div class="flex justify-end">
                    <AppButton variant="primary" size="sm" @click="handleMotorEvent(order)">Salvar evento</AppButton>
                  </div>
                </div>

                <div class="flex gap-2">
                  <button class="px-3 py-1.5 text-sm font-medium text-[var(--ds-primary-text)] bg-primary-600 hover:bg-primary-700 rounded-lg" @click="handleEditOS(order.id)">Salvar</button>
                  <button class="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" @click="cancelEdit">Cancelar</button>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="grid gap-3 rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" :class="orderStatusClass(order)">{{ orderStatusLabel(order) }}</span>
                    <span v-if="isMotorMode && motorOrderEventLabel(order)" class="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">{{ motorOrderEventLabel(order) }}</span>
                  </div>
                  <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    <span class="font-medium text-gray-900 dark:text-gray-100">{{ order.requestedBy || 'Sem solicitante' }}</span>
                    <span class="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
                    {{ formatDateTimeParts(order.requestDate, order.requestTime, order.createdAt) }}
                  </p>
                </div>
                <dl class="grid grid-cols-2 overflow-hidden rounded-lg border border-gray-200 bg-white text-right dark:border-gray-700 dark:bg-gray-900">
                  <div class="min-w-24 px-4 py-2">
                    <dt class="text-xs text-gray-400">Materiais</dt>
                    <dd class="mt-0.5 text-base font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ (order.items || []).length }}</dd>
                  </div>
                  <div class="min-w-36 border-l border-gray-200 px-4 py-2 dark:border-gray-700">
                    <dt class="text-xs text-gray-400">Término</dt>
                    <dd class="mt-0.5 font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ maintenanceEndLabel(order) }}</dd>
                  </div>
                </dl>
              </div>

              <div class="grid gap-3 text-sm lg:grid-cols-2">
                <section class="rounded-lg border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/30">
                  <h4 class="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Solicitação</h4>
                  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <span class="text-xs text-gray-400 dark:text-gray-500">Solicitante</span>
                      <p class="text-gray-900 dark:text-gray-100">{{ order.requestedBy || '-' }}</p>
                    </div>
                    <div>
                      <span class="text-xs text-gray-400 dark:text-gray-500">Abertura</span>
                      <p class="text-gray-900 dark:text-gray-100">{{ formatDateTimeParts(order.requestDate, order.requestTime, order.createdAt) }}</p>
                    </div>
                    <div>
                      <span class="text-xs text-gray-400 dark:text-gray-500">{{ isMotorMode ? 'Motor' : 'Equipamento' }}</span>
                      <p class="text-gray-900 dark:text-gray-100">{{ orderDisplayTitle(order) }}</p>
                    </div>
                    <div>
                      <span class="text-xs text-gray-400 dark:text-gray-500">Manutenção</span>
                      <p class="text-gray-900 dark:text-gray-100">{{ maintenanceLocationTypeLabel(order) }}</p>
                    </div>
                    <div v-if="order.note" class="sm:col-span-2">
                      <span class="text-xs text-gray-400 dark:text-gray-500">Observações</span>
                      <p class="whitespace-pre-wrap text-gray-900 dark:text-gray-100">{{ order.note }}</p>
                    </div>
                  </div>
                </section>

                <section v-if="isMotorMode && motorOrderEventLabel(order)" class="rounded-lg border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/30 lg:order-last lg:col-span-2">
                  <h4 class="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Evento do motor</h4>
                  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div>
                      <span class="text-xs text-gray-400 dark:text-gray-500">Tipo de evento</span>
                      <p class="font-semibold text-gray-900 dark:text-gray-100">{{ motorOrderEventLabel(order) }}</p>
                    </div>
                    <div>
                      <span class="text-xs text-gray-400 dark:text-gray-500">Data</span>
                      <p class="text-gray-900 dark:text-gray-100">{{ formatDateOnly(order.motorEventDate) }}</p>
                    </div>
                    <div class="col-span-2">
                      <span class="text-xs text-gray-400 dark:text-gray-500">Responsável</span>
                      <p class="text-gray-900 dark:text-gray-100">{{ order.motorEventPerformedBy || '-' }}</p>
                    </div>
                    <div
                      v-if="order.motorEventType === 'movimentado' || order.motorEventToDestination"
                      class="col-span-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 lg:col-span-4 dark:bg-gray-800/50"
                    >
                      <div>
                        <span class="text-xs text-gray-400 dark:text-gray-500">Origem</span>
                        <p class="font-medium text-gray-900 dark:text-gray-100">{{ order.motorOriginDestinationName || '-' }}</p>
                      </div>
                      <svg class="h-5 w-5 text-primary-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-5-5 5 5-5 5" />
                      </svg>
                      <div>
                        <span class="text-xs text-gray-400 dark:text-gray-500">Destino</span>
                        <p class="font-semibold text-gray-900 dark:text-gray-100">{{ order.motorEventToDestination || '-' }}</p>
                      </div>
                    </div>
                    <div v-if="order.motorEventNotes" class="col-span-2 lg:col-span-4">
                      <span class="text-xs text-gray-400 dark:text-gray-500">Observações</span>
                      <p class="whitespace-pre-wrap text-gray-900 dark:text-gray-100">{{ order.motorEventNotes }}</p>
                    </div>
                  </div>
                </section>

                <section class="rounded-lg border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/30">
                  <h4 class="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Execução</h4>
                  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <span class="text-xs text-gray-400 dark:text-gray-500">Período</span>
                      <p class="text-gray-900 dark:text-gray-100">{{ maintenancePeriod(order) }}</p>
                    </div>
                    <div>
                      <span class="text-xs text-gray-400 dark:text-gray-500">{{ order.maintenanceLocationType === 'externa' ? 'Oficina' : 'Profissional' }}</span>
                      <p class="text-gray-900 dark:text-gray-100">{{ order.maintenanceLocationType === 'externa' ? (order.maintenanceExternalLocation || '-') : (order.maintenanceProfessional || '-') }}</p>
                    </div>
                    <div v-if="order.maintenanceLocationType === 'externa'">
                      <span class="text-xs text-gray-400 dark:text-gray-500">Pedido</span>
                      <p class="text-gray-900 dark:text-gray-100">{{ order.maintenanceExternalOrderNumber || '-' }}</p>
                    </div>
                    <div v-if="isMotorMode && order.motorStatusAfterMaintenance">
                      <span class="text-xs text-gray-400 dark:text-gray-500">Status após OS</span>
                      <p class="text-gray-900 dark:text-gray-100">{{ motorStatusLabel(order.motorStatusAfterMaintenance) }}</p>
                    </div>
                    <div v-if="order.maintenanceMaterials" class="sm:col-span-2">
                      <span class="text-xs text-gray-400 dark:text-gray-500">Materiais adicionais</span>
                      <p class="whitespace-pre-wrap text-gray-900 dark:text-gray-100">{{ order.maintenanceMaterials }}</p>
                    </div>
                    <div v-if="order.maintenanceNote" class="sm:col-span-2">
                      <span class="text-xs text-gray-400 dark:text-gray-500">Observações</span>
                      <p class="whitespace-pre-wrap text-gray-900 dark:text-gray-100">{{ order.maintenanceNote }}</p>
                    </div>
                  </div>
                </section>
              </div>

              <div v-if="canManageOs && !isMotorMode" class="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                <button class="inline-flex min-h-9 items-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800" @click="startEditOS(order)">
                  <svg class="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                  Editar
                </button>
                <button v-if="isMotorMode && order.motorId" class="px-3 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors" @click="startMotorEvent(order)">
                  Registrar evento
                </button>
                <template v-if="isMotorMode && order.motorId">
                  <button
                    v-for="type in motorEventQuickTypes"
                    :key="type.id"
                    class="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    @click="startMotorEvent(order, type.id)"
                  >
                    {{ type.label }}
                  </button>
                </template>
                <button
                  v-if="isAdmin && confirmDeleteId !== order.id"
                  class="inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  @click="confirmDeleteId = order.id"
                >
                  <svg class="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                  Excluir
                </button>
                <template v-else-if="isAdmin">
                  <span class="text-xs text-red-600 dark:text-red-400">Confirmar exclusão?</span>
                  <button class="px-2 py-1 text-xs font-medium text-white bg-[var(--ds-danger-solid)] hover:bg-[var(--ds-danger-hover)] rounded" @click="handleDeleteOS(order.id)">Sim</button>
                  <button class="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" @click="confirmDeleteId = null">Não</button>
                </template>
              </div>

              <div v-if="motorEventOrderId === order.id" class="ds-surface p-3 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Registrar evento do motor</h4>
                  <span class="text-xs text-gray-400 dark:text-gray-500">Evento vinculado a esta OS</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select v-model="motorEventForm.eventType" class="ds-input">
                    <option v-for="t in motorEventTypes" :key="t.id" :value="t.id">{{ t.label }}</option>
                  </select>
                  <template v-if="motorEventForm.eventType !== 'nenhum'">
                    <input v-model="motorEventForm.eventDate" type="date" class="ds-input" />
                    <input v-if="order.maintenanceLocationType !== 'externa'" v-model="motorEventForm.performedBy" list="os-people-options" placeholder="Executado por" class="ds-input" />
                    <div v-else class="ds-input bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                      {{ order.maintenanceExternalLocation || order.maintenanceLocationName || 'Oficina externa' }}
                    </div>
                    <div v-if="motorEventForm.eventType === 'movimentado'" class="md:col-span-2">
                      <DestinationTreePicker v-model="motorEventForm.toDestinationId" placeholder="Novo local do motor *" />
                    </div>
                  </template>
                </div>
                <textarea v-if="motorEventForm.eventType !== 'nenhum'" v-model="motorEventForm.notes" rows="2" placeholder="Observações do evento" class="ds-input"></textarea>
                <div class="flex justify-end gap-2">
                  <AppButton variant="ghost" size="sm" @click="cancelMotorEvent">Cancelar</AppButton>
                  <AppButton variant="primary" size="sm" @click="handleMotorEvent(order)">Salvar evento</AppButton>
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-3 rounded-t-lg border border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                <div>
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Materiais utilizados</h4>
                  <p class="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">Itens do catálogo com baixa no estoque</p>
                </div>
                <button
                  v-if="canManageOs"
                  class="inline-flex min-h-9 items-center rounded-lg border border-green-200 bg-white px-3 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50 dark:border-green-900/60 dark:bg-gray-900 dark:text-green-400 dark:hover:bg-green-900/20"
                  @click="startAddMaterial(order.id)"
                >
                  <svg class="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Buscar catálogo
                </button>
              </div>

              <!-- Add material flow -->
              <div v-if="false && addingMaterialToId === order.id" class="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
                <div class="flex items-center justify-between">
                  <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Adicionar material do catálogo</h4>
                  <button class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="cancelAddMaterial">Fechar</button>
                </div>

                <template v-if="matStep === 1">
                  <input
                    ref="matSearchEl"
                    v-model="matSearch"
                    type="text"
                    placeholder="Buscar item por nome, grupo ou categoria..."
                    class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <div v-if="matSearchNorm && matItemResults.length" class="space-y-1 max-h-48 overflow-y-auto">
                    <button
                      v-for="item in matItemResults"
                      :key="item.id"
                      class="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      @click="selectMatItem(item)"
                    >
                      <span class="font-medium text-gray-900 dark:text-gray-100">{{ item.name }}</span>
                      <span class="text-xs text-gray-400 ml-2">{{ hierarchyLabel(item) }}</span>
                    </button>
                  </div>
                  <p v-else-if="matSearchNorm && !matItemResults.length" class="text-sm text-gray-400">Nenhum item encontrado</p>
                </template>

                <template v-else-if="matStep === 2">
                  <div class="flex items-center gap-2 mb-2">
                    <button class="text-xs text-primary-600 dark:text-primary-400 hover:underline" @click="matBackToStep1">Voltar</button>
                    <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ matSelectedItem.name }}</span>
                  </div>
                  <div v-if="matItemVariations.length" class="space-y-1 max-h-48 overflow-y-auto">
                    <button
                      v-for="v in matItemVariations"
                      :key="v.id"
                      class="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between gap-3"
                      @click="selectMatVariation(v)"
                    >
                      <span class="text-gray-900 dark:text-gray-100">{{ variationLabel(v) }}</span>
                      <span class="text-xs whitespace-nowrap" :class="v.stock > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'">
                        Estoque: {{ v.stock }} {{ matSelectedItem.unit }}
                      </span>
                    </button>
                  </div>
                  <p v-else class="text-sm text-gray-400">Nenhuma variação encontrada</p>
                </template>

                <template v-else-if="matStep === 3">
                  <div class="flex items-center gap-2 mb-2">
                    <button class="text-xs text-primary-600 dark:text-primary-400 hover:underline" @click="matBackToStep2">Voltar</button>
                    <span class="text-sm text-gray-900 dark:text-gray-100">{{ matSelectedItem.name }} - {{ variationLabel(matSelectedVariation) }}</span>
                  </div>
                  <div class="flex flex-col sm:flex-row sm:items-end gap-2">
                    <div class="flex-1">
                      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Quantidade ({{ matSelectedItem.unit }})</label>
                      <input
                        ref="matQtyEl"
                        v-model="matQty"
                        type="number"
                        min="1"
                        step="1"
                        class="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        :class="matExceedsStock ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'"
                        @keydown.enter="handleAddMaterial"
                      />
                      <p v-if="matExceedsStock" class="text-xs text-red-500 mt-1">Estoque insuficiente (disponível: {{ matSelectedVariation.stock }})</p>
                    </div>
                    <button
                      :disabled="!matParsedQty || matExceedsStock"
                      class="px-4 py-2 text-sm font-medium text-white bg-[var(--ds-success-solid)] hover:bg-[var(--ds-success-hover)] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
                      @click="handleAddMaterial"
                    >Adicionar</button>
                  </div>
                </template>
              </div>

              <!-- Materials list -->
              <div v-if="order.items && order.items.length" class="rounded-b-lg border-x border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                        <th class="pb-2 pr-3">Item</th>
                        <th class="pb-2 pr-3">Variação</th>
                        <th class="pb-2 pr-3 text-right">Qtd</th>
                        <th class="pb-2 pr-3">Unid</th>
                        <th class="pb-2 pr-3">Data</th>
                        <th v-if="isAdmin" class="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="mat in order.items" :key="mat.id" class="border-t border-gray-100 dark:border-gray-700/50">
                        <td class="py-2 pr-3 text-gray-900 dark:text-gray-100">{{ mat.itemName }}</td>
                        <td class="py-2 pr-3 text-gray-600 dark:text-gray-400">{{ variationLabel(mat) }}</td>
                        <td class="py-2 pr-3 text-right font-medium text-gray-900 dark:text-gray-100">{{ mat.qty }}</td>
                        <td class="py-2 pr-3 text-gray-500 dark:text-gray-400">{{ mat.itemUnit }}</td>
                        <td class="py-2 pr-3 text-gray-400 dark:text-gray-500 text-xs">{{ formatDate(mat.addedAt) }}</td>
                        <td v-if="isAdmin" class="py-2 text-right">
                          <button
                            v-if="confirmRemoveItemId !== mat.id"
                            class="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                            @click="confirmRemoveItemId = mat.id"
                          >Remover</button>
                          <span v-else class="inline-flex items-center gap-1">
                            <button class="text-xs text-white bg-[var(--ds-danger-solid)] hover:bg-[var(--ds-danger-hover)] px-2 py-0.5 rounded" @click="handleRemoveMaterial(order.id, mat.id)">Sim</button>
                            <button class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-0.5" @click="confirmRemoveItemId = null">Não</button>
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div v-else class="rounded-b-lg border-x border-b border-gray-200 bg-white px-4 py-5 text-sm italic text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">Nenhum material do estoque vinculado a esta OS.</div>

              <div v-if="false" class="border-t border-gray-200 dark:border-gray-700 pt-3">
                <div class="space-y-3">
                  <div
                    v-for="event in []"
                    :key="event.id"
                    class="relative pl-6"
                  >
                    <span
                      class="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-gray-800"
                      :class="workOrderEventTone(event.eventType)"
                    ></span>
                    <div class="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ workOrderEventLabel(event.eventType) }}</p>
                        <p v-if="event.operatorName || event.toValue || event.fromValue" class="text-xs text-gray-500 dark:text-gray-400">
                          <span v-if="event.operatorName">{{ event.operatorName }}</span>
                          <span v-if="event.fromValue || event.toValue">
                            <span v-if="event.operatorName"> · </span>
                            <span v-if="event.fromValue">{{ event.fromValue }} -> </span>{{ event.toValue }}
                          </span>
                        </p>
                      </div>
                      <span class="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{{ formatDate(event.eventDate) }}</span>
                    </div>
                    <p v-if="event.notes" class="mt-1 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{{ event.notes }}</p>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </AppDialog>
        </div>

        <div v-if="ordersTotalPages > 1" class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
          <span>
            {{ (ordersPage - 1) * ORDERS_PAGE_SIZE + 1 }}-{{ Math.min(ordersPage * ORDERS_PAGE_SIZE, filteredOrders.length) }} de {{ filteredOrders.length }} OS
          </span>
          <div class="flex items-center gap-2">
            <AppButton variant="ghost" size="xs" :disabled="ordersPage === 1" @click="ordersPage--">Anterior</AppButton>
            <span class="min-w-14 text-center font-semibold text-gray-700 dark:text-gray-200">{{ ordersPage }} / {{ ordersTotalPages }}</span>
            <AppButton variant="ghost" size="xs" :disabled="ordersPage === ordersTotalPages" @click="ordersPage++">Próxima</AppButton>
          </div>
        </div>
      </div>
    </template>

    <!-- TAB: Histórico de Ordens de Serviço -->
    <template v-if="activeSubTab === 'historico'">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-[var(--ds-primary-text)] hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!historyOrders.length"
            @click="exportFilteredHistoryCsv"
          >
            Exportar filtrado
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            :disabled="!visibleOrdersBase.length"
            @click="exportAllHistoryCsv"
          >
            Exportar tudo
          </button>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ historyOrders.length }} filtrada(s) de {{ visibleOrdersBase.length }} OS
          </span>
        </div>

        <div
          v-if="hasHistoryFilters"
          class="flex flex-wrap items-center gap-2"
        >
          <span v-if="searchQuery" class="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs text-gray-600 dark:text-gray-300">
            Busca: {{ searchQuery }}
          </span>
          <span v-if="historyDateFrom || historyDateTo" class="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs text-gray-600 dark:text-gray-300">
            Período: {{ historyDateFrom ? formatDateOnly(historyDateFrom) : 'início' }} - {{ historyDateTo ? formatDateOnly(historyDateTo) : 'hoje' }}
          </span>
          <button
            type="button"
            class="text-xs font-medium text-primary-700 dark:text-primary-400 hover:underline"
            @click="clearHistoryFilters"
          >
            Limpar filtros
          </button>
        </div>

        <EmptyState
          v-if="historyOrders.length === 0"
          title="Nenhuma OS encontrada no histórico"
          text="Histórico aparece aqui conforme as ordens forem criadas ou quando filtros combinarem com registros existentes."
          :action-label="hasHistoryFilters ? 'Limpar filtros' : ''"
          @action="clearHistoryFilters"
        />

        <div v-else class="ds-table-wrap">
          <div class="overflow-x-auto">
            <table class="ds-table min-w-[900px]">
              <thead>
                <tr class="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th class="px-4 py-3">Nº / Status</th>
                  <th class="px-4 py-3">Data</th>
                  <th class="px-4 py-3">{{ isMotorMode ? 'Evento' : 'Solicitante' }}</th>
                  <th class="px-4 py-3">{{ isMotorMode ? 'Motor / oficina' : 'Equipamento' }}</th>
                  <th class="px-4 py-3">Observações da manutenção</th>
                  <th class="px-4 py-3 text-right">CSV</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                <tr
                  v-for="order in paginatedHistoryOrders"
                  :key="order.id"
                  class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                  title="Abrir detalhes da OS"
                  @click="openOrderFromHistory(order)"
                >
                  <td class="px-4 py-3 align-top">
                    <div class="flex flex-col gap-1">
                      <span class="font-semibold text-gray-900 dark:text-gray-100">#{{ order.number }}</span>
                      <span class="w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold" :class="orderStatusClass(order)">
                        {{ isOrderFinished(order) ? maintenanceEndLabel(order) : 'Aberta' }}
                      </span>
                    </div>
                  </td>
                  <td class="px-4 py-3 align-top whitespace-nowrap text-gray-600 dark:text-gray-300">
                    {{ formatDateTimeParts(order.requestDate, order.requestTime, order.createdAt) }}
                  </td>
                  <td class="px-4 py-3 align-top text-gray-700 dark:text-gray-200">
                    {{ isMotorMode ? (motorOrderEventLabel(order) || '-') : (order.requestedBy || '-') }}
                  </td>
                  <td class="px-4 py-3 align-top">
                    <div class="font-medium text-gray-900 dark:text-gray-100">{{ orderDisplayTitle(order) }}</div>
                    <div v-if="order.motorTag || orderHistoryLocationLabel(order)" class="mt-0.5 flex flex-wrap gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <span v-if="order.motorTag" class="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 text-primary-700 dark:text-primary-300">
                        {{ order.motorTag }}
                      </span>
                      <span v-if="orderHistoryLocationLabel(order)">{{ orderHistoryLocationLabel(order) }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 align-top text-gray-600 dark:text-gray-300">
                    <p class="max-w-[360px] whitespace-pre-wrap break-words line-clamp-3">{{ maintenanceObservation(order) }}</p>
                  </td>
                  <td class="px-4 py-3 align-top text-right">
                    <button
                      type="button"
                      class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/20"
                      @click.stop="exportSingleOrderCsv(order)"
                    >
                      Exportar
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <span>
              {{ (historyPage - 1) * HISTORY_PAGE_SIZE + 1 }}-{{ Math.min(historyPage * HISTORY_PAGE_SIZE, historyOrders.length) }} de {{ historyOrders.length }} OS no histórico
            </span>
            <div v-if="historyTotalPages > 1" class="flex items-center gap-2">
              <AppButton variant="ghost" size="xs" :disabled="historyPage === 1" @click="historyPage--">Anterior</AppButton>
              <span class="min-w-14 text-center font-semibold text-gray-700 dark:text-gray-200">{{ historyPage }} / {{ historyTotalPages }}</span>
              <AppButton variant="ghost" size="xs" :disabled="historyPage === historyTotalPages" @click="historyPage++">Próxima</AppButton>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- TAB: Resumo por local/equipamento -->
    <template v-if="activeSubTab === 'resumo'">
      <div v-if="!visibleReport.length" class="text-center py-12 text-gray-400 dark:text-gray-500">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>
        <p class="text-sm">{{ isMotorMode ? 'Nenhum dado de oficina/local encontrado' : 'Nenhum dado de equipamento encontrado' }}</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="(dest, reportIndex) in visibleReport"
          :key="dest.destinationName"
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
        >
          <button
            type="button"
            class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
            :aria-expanded="expandedReportDest === dest.destinationName"
            :aria-controls="`os-report-${reportIndex}`"
            @click="expandedReportDest = expandedReportDest === dest.destinationName ? null : dest.destinationName"
          >
            <svg
              class="w-4 h-4 text-gray-400 transition-transform motion-reduce:transition-none flex-shrink-0"
              :class="expandedReportDest === dest.destinationName ? 'rotate-90' : ''"
              aria-hidden="true"
              fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
            ><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>

            <span class="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1">{{ dest.destinationName }}</span>
            <span class="text-xs text-gray-400 dark:text-gray-500">
              {{ dest.orders.length }} OS - {{ (dest.osMaterialTotals || []).length }} materiais em OS
            </span>
          </button>

          <div
            :id="`os-report-${reportIndex}`"
            class="ds-collapse"
            :class="{ 'ds-collapse-open': expandedReportDest === dest.destinationName }"
          >
          <div class="border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-4">
            <div v-if="(dest.osMaterialTotals || []).length">
              <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{{ isMotorMode ? 'Resumo por oficina/local da OS' : 'Resumo por destino de OS' }}</h4>
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                      <th class="pb-2 pr-3">Item</th>
                      <th class="pb-2 pr-3">Variação</th>
                      <th class="pb-2 pr-3 text-right">Qtd em OS</th>
                      <th class="pb-2">Unid</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(mt, idx) in dest.osMaterialTotals" :key="idx" class="border-t border-gray-100 dark:border-gray-700/50">
                      <td class="py-1.5 pr-3 text-gray-900 dark:text-gray-100">{{ mt.itemName }}</td>
                      <td class="py-1.5 pr-3 text-gray-600 dark:text-gray-400">{{ variationLabel(mt) }}</td>
                      <td class="py-1.5 pr-3 text-right font-semibold text-gray-900 dark:text-gray-100">{{ mt.qty }}</td>
                      <td class="py-1.5 text-gray-500 dark:text-gray-400">{{ mt.itemUnit }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-if="dest.orders.length">
              <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Ordens de Serviço</h4>
              <div class="space-y-2">
                <div v-for="wo in dest.orders" :key="wo.id" class="bg-gray-50 dark:bg-gray-900/40 rounded-lg p-3">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="text-xs font-bold px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-400">OS #{{ wo.number }}</span>
                    <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ orderDisplayTitle(wo) }}</span>
                    <span class="text-xs text-gray-400 ml-auto">{{ formatDateTimeParts(wo.requestDate, wo.requestTime, wo.createdAt) }}</span>
                  </div>
                  <p v-if="wo.maintenanceProfessional" class="text-xs text-gray-500 dark:text-gray-400 mb-2">Profissional: {{ wo.maintenanceProfessional }}</p>
                  <div v-if="wo.items && wo.items.length" class="mt-2">
                    <table class="w-full text-xs">
                      <tbody>
                        <tr v-for="it in wo.items" :key="it.id" class="border-t border-gray-200/50 dark:border-gray-700/30">
                          <td class="py-1 pr-2 text-gray-700 dark:text-gray-300">{{ it.itemName }}</td>
                          <td class="py-1 pr-2 text-gray-500 dark:text-gray-400">{{ variationLabel(it) }}</td>
                          <td class="py-1 pr-2 text-right font-medium text-gray-700 dark:text-gray-300">{{ it.qty }}</td>
                          <td class="py-1 text-gray-400">{{ it.itemUnit }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p v-else class="text-xs text-gray-400 italic mt-1">Sem materiais do estoque</p>
                </div>
              </div>
            </div>

            <p v-if="!(dest.osMaterialTotals || []).length" class="text-sm text-gray-400 italic">Nenhum material de OS registrado para este destino</p>
          </div>
          </div>
        </div>
      </div>
    </template>

    <AppDialog v-if="addingMaterialToId" visible aria-label="Adicionar material do catálogo" @close="cancelAddMaterial">
      <div class="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Adicionar material do catálogo</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Selecione o item por grupo, categoria e subcategoria; depois escolha a variação e quantidade.
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            @click="cancelAddMaterial"
          >Fechar</button>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <template v-if="matStep === 1">
            <div class="mb-4">
              <div class="relative max-w-xl">
                <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  ref="matSearchEl"
                  v-model="matSearch"
                  type="search"
                  placeholder="Buscar por nome, grupo, categoria, subcategoria, atributo ou local..."
                  class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pl-9 text-sm text-gray-900 outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  @keydown.enter.prevent="selectSingleMatItemOnEnter"
                />
              </div>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {{ matItemResults.length }} item(ns) encontrado(s)
              </p>
            </div>

            <div v-if="matItemResults.length" class="space-y-4">
              <div v-if="matSelectedGroup" class="flex flex-wrap items-center gap-1.5 text-sm">
                <button type="button" class="font-medium text-primary-600 hover:underline dark:text-primary-400" @click="resetMatCatalogSelection('root')">Catálogo</button>
                <svg class="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                <button
                  v-if="matSelectedCategory"
                  type="button"
                  class="font-medium text-primary-600 hover:underline dark:text-primary-400"
                  @click="resetMatCatalogSelection('group')"
                >{{ matSelectedGroup }}</button>
                <span v-else class="font-semibold text-gray-900 dark:text-gray-100">{{ matSelectedGroup }}</span>
                <template v-if="matSelectedCategory">
                  <svg class="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                  <button
                    v-if="matSelectedSubcategory || matSelectedItem"
                    type="button"
                    class="font-medium text-primary-600 hover:underline dark:text-primary-400"
                    @click="resetMatCatalogSelection('category')"
                  >{{ matSelectedCategory }}</button>
                  <span v-else class="font-semibold text-gray-900 dark:text-gray-100">{{ matSelectedCategory }}</span>
                </template>
                <template v-if="matSelectedSubcategory">
                  <svg class="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                  <button
                    v-if="matSelectedItem"
                    type="button"
                    class="font-medium text-primary-600 hover:underline dark:text-primary-400"
                    @click="resetMatCatalogSelection('subcategory')"
                  >{{ matSelectedSubcategory }}</button>
                  <span v-else class="font-semibold text-gray-900 dark:text-gray-100">{{ matSelectedSubcategory }}</span>
                </template>
                <template v-if="matSelectedItem">
                  <svg class="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                  <span class="font-semibold text-gray-900 dark:text-gray-100">{{ matSelectedItem.name }}</span>
                </template>
              </div>

              <div v-if="!matSelectedGroup" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                <button
                  v-for="group in matGroupOptions"
                  :key="group"
                  type="button"
                  class="group cursor-pointer rounded-lg border border-gray-200 bg-white p-5 text-left transition-colors duration-100 hover:border-primary-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-500"
                  @click="selectMatGroup(group)"
                >
                  <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 transition-colors group-hover:bg-primary-100 dark:bg-primary-900/30 dark:group-hover:bg-primary-900/50">
                    <svg class="h-5 w-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                    </svg>
                  </div>
                  <p class="mb-1 truncate text-sm font-bold text-gray-800 dark:text-gray-100">{{ group }}</p>
                  <p class="text-xs text-gray-400 dark:text-gray-500">
                    {{ matItemsInGroup(group).length }} {{ matItemsInGroup(group).length === 1 ? 'item' : 'itens' }} · Estoque: {{ matItemsStockTotal(matItemsInGroup(group)) }}
                  </p>
                </button>
              </div>

              <div v-else-if="!matSelectedCategory" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                <button
                  v-for="category in matCategoryOptions"
                  :key="category"
                  type="button"
                  class="group cursor-pointer rounded-lg border border-gray-200 bg-white p-5 text-left transition-colors duration-100 hover:border-primary-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-500"
                  @click="selectMatCategory(category)"
                >
                  <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 transition-colors group-hover:bg-primary-100 dark:bg-primary-900/30 dark:group-hover:bg-primary-900/50">
                    <svg class="h-5 w-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                    </svg>
                  </div>
                  <p class="mb-1 truncate text-sm font-bold text-gray-800 dark:text-gray-100">{{ category }}</p>
                  <p class="text-xs text-gray-400 dark:text-gray-500">
                    {{ matItemsInCategory(category).length }} {{ matItemsInCategory(category).length === 1 ? 'item' : 'itens' }} · Estoque: {{ matItemsStockTotal(matItemsInCategory(category)) }}
                  </p>
                </button>
              </div>

              <div v-else-if="matSubcategoryOptions.length && !matSelectedSubcategory" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                <button
                  v-for="subcategory in matSubcategoryOptions"
                  :key="subcategory"
                  type="button"
                  class="group cursor-pointer rounded-lg border border-gray-200 bg-white p-5 text-left transition-colors duration-100 hover:border-primary-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-500"
                  @click="selectMatSubcategory(subcategory)"
                >
                  <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 transition-colors group-hover:bg-primary-100 dark:bg-primary-900/30 dark:group-hover:bg-primary-900/50">
                    <svg class="h-5 w-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                    </svg>
                  </div>
                  <p class="mb-1 truncate text-sm font-bold text-gray-800 dark:text-gray-100">{{ subcategory }}</p>
                  <p class="text-xs text-gray-400 dark:text-gray-500">
                    {{ matItemsInSubcategory(subcategory).length }} {{ matItemsInSubcategory(subcategory).length === 1 ? 'item' : 'itens' }} · Estoque: {{ matItemsStockTotal(matItemsInSubcategory(subcategory)) }}
                  </p>
                </button>
              </div>

              <div v-else-if="!matSelectedItem" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                <button
                  v-for="item in matItemsForSelection"
                  :key="item.id"
                  type="button"
                  class="group cursor-pointer rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors duration-100 hover:border-primary-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-500"
                  @click="selectMatCatalogItem(item)"
                >
                  <p class="mb-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{{ item.name }}</p>
                  <p class="mb-1 truncate text-xs text-gray-400 dark:text-gray-500">{{ hierarchyLabel(item) || 'Sem hierarquia' }}</p>
                  <p class="text-xs text-gray-400 dark:text-gray-500">
                    {{ getVariationsForItem(item.id).length }} var. · Estoque: {{ matItemStock(item) }}
                  </p>
                </button>
              </div>

              <div v-else>
                <div v-if="matItemVariations.length" class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                  <table class="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                    <thead class="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
                      <tr>
                        <th class="px-4 py-3">Variação</th>
                        <th class="px-4 py-3 text-right">Estoque</th>
                        <th class="px-4 py-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
                      <tr
                        v-for="variation in matItemVariations"
                        :key="variation.id"
                        class="cursor-pointer transition-colors hover:bg-primary-50/70 dark:hover:bg-primary-950/20"
                        @click="selectMatVariation(variation)"
                      >
                        <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {{ variationLabel(variation) }}
                        </td>
                        <td class="px-4 py-3 text-right font-semibold" :class="variation.stock > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'">
                          {{ variation.stock }} {{ matSelectedItem?.unit }}
                        </td>
                        <td class="px-4 py-3 text-right">
                          <button
                            type="button"
                            class="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-[var(--ds-primary-text)] hover:bg-primary-700"
                            @click.stop="selectMatVariation(variation)"
                          >
                            Selecionar
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Nenhuma variação encontrada.
                </p>
              </div>
            </div>
            <div v-else class="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Nenhum item encontrado no catálogo.
            </div>
          </template>

          <template v-else-if="matStep === 2">
            <div class="mb-4 flex flex-wrap items-center gap-2">
              <button class="rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/20" @click="matBackToStep1">Voltar</button>
              <div>
                <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ matSelectedItem.name }}</h4>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ hierarchyLabel(matSelectedItem) }}</p>
              </div>
            </div>
            <div v-if="matItemVariations.length" class="grid gap-2 md:grid-cols-2">
              <button
                v-for="v in matItemVariations"
                :key="v.id"
                type="button"
                class="rounded-lg border border-gray-200 px-3 py-2 text-left transition-colors hover:border-primary-400 hover:bg-primary-50 dark:border-gray-700 dark:hover:border-primary-500 dark:hover:bg-primary-950/30"
                @click="selectMatVariation(v)"
              >
                <span class="block text-sm font-semibold text-gray-900 dark:text-gray-100">{{ variationLabel(v) }}</span>
                <span class="mt-1 block text-xs" :class="v.stock > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'">
                  Estoque: {{ v.stock }} {{ matSelectedItem.unit }}
                </span>
              </button>
            </div>
            <p v-else class="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">Nenhuma variação encontrada.</p>
          </template>

          <template v-else-if="matStep === 3">
            <div class="mb-4 flex flex-wrap items-center gap-2">
              <button class="rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/20" @click="matBackToStep2">Voltar</button>
              <div>
                <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ matSelectedItem.name }}</h4>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ variationLabel(matSelectedVariation) }}</p>
              </div>
            </div>
            <div class="max-w-xl rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Quantidade ({{ matSelectedItem.unit }})</label>
              <input
                ref="matQtyEl"
                v-model="matQty"
                type="number"
                min="1"
                step="1"
                class="w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                :class="matExceedsStock ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'"
                @keydown.enter="handleAddMaterial"
              />
              <p v-if="matExceedsStock" class="mt-1 text-xs text-red-500">Estoque insuficiente (disponível: {{ matSelectedVariation.stock }})</p>
              <div class="mt-4 flex justify-end gap-2">
                <button class="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" @click="matBackToStep2">Cancelar</button>
                <button
                  :disabled="!matParsedQty || matExceedsStock"
                  class="rounded-lg bg-[var(--ds-success-solid)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--ds-success-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                  @click="handleAddMaterial"
                >Adicionar baixa</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </AppDialog>
  </div>
</template>
