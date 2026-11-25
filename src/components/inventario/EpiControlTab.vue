<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useRoles } from '../../composables/useRoles.js'
import { useItems } from '../../composables/useItems.js'
import { personStatusLabel, usePeople } from '../../composables/usePeople.js'
import { useMovements } from '../../composables/useMovements.js'
import { useEpis } from '../../composables/useEpis.js'
import { useToast } from '../../composables/useToast.js'
import { catalogRowsForTarget, createEpiMovementLookup, epiRuleMatchesPerson, matchesAllowedCa, matchesRequiredEpiAttributes } from '../../utils/epiSheet.js'
import { epiControlCsv } from '../../utils/epiControlCsv.js'
import AttributeBadges from '../ui/AttributeBadges.vue'
import AppDialog from '../ui/AppDialog.vue'
import AppButton from '../ui/AppButton.vue'
import EpiSheetDialog from './EpiSheetDialog.vue'

const emit = defineEmits(['quick-movement'])
defineProps({ canOperate: { type: Boolean, default: false } })

const { items, variations } = useItems()
const { people } = usePeople()
const { roles } = useRoles()
const sectorByRole = computed(() => new Map(roles.value.map(role => [normalize(role.name), role.sector])))
const { movements, addMovementBatch, editMovement } = useMovements()
const { roleRules, activePeriodicities } = useEpis()
const { success, error } = useToast()
const isAdmin = inject('isAdmin')

const search = ref('')
const statusFilters = ref([])
const controlView = ref('list')
const groupBy = ref([])
const expandedGroupKeys = ref(new Set())
const personStatusFilter = ref('ativo')
const currentPage = ref(1)
const pageSize = ref(20)
const historyRecord = ref(null)
const compatibleRecord = ref(null)
const compatibleRows = computed(() => compatibleRecord.value ? targetRows(compatibleRecord.value.rule) : [])
const editingHistoryMovement = ref(null)
const historyEditForm = ref({ qty: '', date: '', docRef: '', note: '' })
const historyEditSaving = ref(false)
const sheetOpen = ref(false)
const bulkOpen = ref(false)
const bulkSubmitting = ref(false)
const selectedRecordKeys = ref([])
const bulkChoices = ref({})

const targetTypeLabels = {
  grupo: 'Grupo',
  categoria: 'Categoria',
  subcategoria: 'Subcategoria',
  item: 'Item',
  variacao: 'Variação',
}

const statusConfig = {
  'Sem periodicidade': { label: 'Sem periodicidade', pill: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  Inativo: { label: 'Inativo — não conta', pill: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  Pendente: {
    label: 'Pendente',
    pill: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  },
  'Em dia': {
    label: 'Em dia',
    pill: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  },
  'Programar troca': {
    label: 'Troca em 8–30 dias',
    pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  'Vence em breve': {
    label: 'Vence em breve',
    pill: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  },
  Vencido: {
    label: 'Vencido',
    pill: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  },
}

const itemById = computed(() => new Map(items.value.map(item => [item.id, item])))
const variationById = computed(() => new Map(variations.value.map(variation => [variation.id, variation])))

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function targetFromRule(rule) {
  return {
    targetType: rule.targetType,
    targetKey: rule.targetKey,
    targetLabel: rule.targetLabel,
    allowedCas: rule.allowedCas,
    requiredAttributes: rule.requiredAttributes,
  }
}

function targetMatchesMovement(target, movement) {
  if (!target || !movement || movement.type !== 'saida') return false
  if (!matchesAllowedCa(target, movement.variationValues, movement.variationExtras)) return false
  const variation = variationById.value.get(movement.variationId)
  const values = { ...variation?.values, ...movement.variationValues }
  if (!matchesRequiredEpiAttributes(target, values, movement.variationExtras)) return false
  if (target.targetType === 'grupo') return movement.itemGroup === target.targetKey
  if (target.targetType === 'categoria') return `${movement.itemGroup || ''}|${movement.itemCategory || ''}` === target.targetKey
  if (target.targetType === 'subcategoria') return `${movement.itemGroup || ''}|${movement.itemCategory || ''}|${movement.itemSubcategory || ''}` === target.targetKey
  if (target.targetType === 'item') return movement.itemId === target.targetKey
  if (target.targetType === 'variacao') return movement.variationId === target.targetKey
  return false
}

function periodForRule(rule) {
  const days = Number(rule?.days ?? 0)
  if (days === 0) return null
  if (Number.isInteger(days) && days > 0) return { days }
  return activePeriodicities.value.find(period =>
    period.targetType === rule.targetType && period.targetKey === rule.targetKey
  ) || null
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + Number(days || 0))
  return next
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('pt-BR')
}

function epiStatus(record) {
  if (!record.rule.active) return 'Inativo'
  if (Number(record.rule.days) === 0) return 'Sem periodicidade'
  if (!record.movement) return 'Pendente'
  if (!record.dueDate) return 'Em dia'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(record.dueDate)
  due.setHours(0, 0, 0, 0)
  const daysLeft = Math.ceil((due - today) / 86400000)
  if (daysLeft < 0) return 'Vencido'
  if (daysLeft <= 7) return 'Vence em breve'
  if (daysLeft <= 30) return 'Programar troca'
  return 'Em dia'
}

function variationLabel(variation, item) {
  const attrs = Object.entries(variation.values || {}).map(([key, value]) => `${key}: ${value}`)
  const extras = Object.entries(variation.extras || {}).map(([key, value]) => `${key}: ${value}`)
  return [item?.name, ...attrs, ...extras].filter(Boolean).join(' / ')
}

const personStatusTabs = [
  { id: 'ativo', label: 'Ativas' },
  { id: 'all', label: 'Todas' },
  { id: 'inativo', label: 'Inativas' },
  { id: 'afastado', label: 'Afastadas' },
  { id: 'demitido', label: 'Demitidas' },
]

function readableTargetLabel(rule) {
  const label = String(rule?.targetLabel || rule?.targetKey || '').trim()
  if (!label) return '-'
  const parts = label.split('>').map(part => part.trim()).filter(Boolean)
  return parts[parts.length - 1] || label
}

function resolveQuickTarget(rule) {
  const matches = targetRows(rule)
  return matches.length === 1 ? matches[0] : null
}

const catalogRowsByRule = computed(() => new Map(roleRules.value.map(rule => [
  rule, catalogRowsForTarget(items.value, variations.value, rule),
])))
const movementsForPerson = computed(() => createEpiMovementLookup(movements.value))

function targetRows(rule) {
  return catalogRowsByRule.value.get(rule) ?? catalogRowsForTarget(items.value, variations.value, rule)
}

function matchingMovements(personMovements, target) {
  return personMovements.filter(movement => targetMatchesMovement(target, movement))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
}

function targetVariationRow(rule) {
  if (rule?.targetType !== 'variacao') return null
  const variation = variations.value.find(row => row.id === rule.targetKey)
  const item = variation ? itemById.value.get(variation.itemId) : null
  return variation && item ? { variation, item } : null
}

const records = computed(() => {
  const rows = []
  for (const person of people.value) {
    const personStatus = person.status || (person.active ? 'ativo' : 'inativo')
    if (personStatusFilter.value !== 'all' && personStatus !== personStatusFilter.value) continue
    const rules = roleRules.value.filter(rule => epiRuleMatchesPerson(rule, person))
    if (!rules.length) continue
    const personMovements = movementsForPerson.value(person)
    for (const rule of rules) {
      if (!targetRows(rule).length) continue
      const target = targetFromRule(rule)
      const movement = matchingMovements(personMovements, target)[0] || null
      const period = periodForRule(rule)
      const dueDate = movement && period ? addDays(movement.date, period.days) : null
      const record = { person: { ...person, status: personStatus }, rule, movement, period, dueDate }
      rows.push({ ...record, status: epiStatus(record) })
    }
  }
  return rows.sort((a, b) =>
    a.person.name.localeCompare(b.person.name, 'pt-BR', { sensitivity: 'base', numeric: true }) ||
    String(a.rule.targetLabel || a.rule.targetKey).localeCompare(String(b.rule.targetLabel || b.rule.targetKey), 'pt-BR', { sensitivity: 'base', numeric: true })
  )
})

const searchedRecords = computed(() => {
  const q = normalize(search.value)
  if (!q) return records.value
  return records.value.filter(record => [
    record.person.name,
    record.person.role,
    sectorByRole.value.get(normalize(record.person.role)),
    personStatusLabel(record.person.status),
    record.rule.targetLabel,
    record.rule.targetKey,
    record.movement?.itemName,
    record.status,
  ].some(value => normalize(value).includes(q)))
})

const statusesByFilter = {
  attention: ['Pendente', 'Programar troca', 'Vence em breve', 'Vencido'],
  ok: ['Em dia'],
  pending: ['Pendente'],
  upcoming: ['Programar troca'],
  soon: ['Vence em breve'],
  expired: ['Vencido'],
  inactive: ['Inativo'],
}


const counts = computed(() => {
  const byStatus = new Map()
  for (const { status } of searchedRecords.value) {
    byStatus.set(status, (byStatus.get(status) || 0) + 1)
  }
  return {
    all: searchedRecords.value.length - (byStatus.get('Inativo') || 0),
    ...Object.fromEntries(Object.entries(statusesByFilter).map(([id, statuses]) => [
      id, statuses.reduce((total, status) => total + (byStatus.get(status) || 0), 0),
    ])),
  }
})

const filterTabs = computed(() => [
  { id: 'all', label: 'Todos', count: counts.value.all },
  { id: 'attention', label: 'Precisam trocar', count: counts.value.attention },
  { id: 'ok', label: 'Em dia', count: counts.value.ok },
  { id: 'pending', label: 'Pendentes', count: counts.value.pending },
  { id: 'upcoming', label: 'Troca em 8–30 dias', count: counts.value.upcoming },
  { id: 'soon', label: 'Vence em breve', count: counts.value.soon },
  { id: 'expired', label: 'Vencidos', count: counts.value.expired },
  { id: 'inactive', label: 'Inativos (não contam)', count: counts.value.inactive },
])


function toggleStatusFilter(filterId) {
  if (filterId === 'all') {
    statusFilters.value = []
    return
  }
  statusFilters.value = statusFilters.value.includes(filterId)
    ? statusFilters.value.filter(id => id !== filterId)
    : [...statusFilters.value, filterId]
}

function statusFilterActive(filterId) {
  return filterId === 'all'
    ? statusFilters.value.length === 0
    : statusFilters.value.includes(filterId)
}

const filteredRecords = computed(() => {
  const selectedStatuses = new Set(
    statusFilters.value.flatMap(filterId => statusesByFilter[filterId] || [])
  )
  return searchedRecords.value.filter(record =>
    selectedStatuses.size === 0 ? record.status !== 'Inativo' : selectedStatuses.has(record.status)
  )
})

const groupOptions = [
  { id: 'sector', label: 'Setor', unit: 'setores' },
  { id: 'epi', label: 'Tipo de EPI', unit: 'tipos de EPI' },
  { id: 'person', label: 'Nome', unit: 'pessoas' },
]
const showPersonColumn = computed(() => controlView.value === 'list' || !groupBy.value.includes('person'))

function toggleGroupBy(field) {
  if (!groupBy.value.includes(field)) {
    groupBy.value = [...groupBy.value, field]
  } else {
    groupBy.value = groupBy.value.filter(selected => selected !== field)
  }
}

function groupLabelFor(field, record) {
  if (field === 'sector') return sectorByRole.value.get(normalize(record.person.role)) || 'Sem setor vinculado'
  if (field === 'epi') {
    const { rule } = record
    return itemById.value.get(rule.targetKey)?.name || targetVariationRow(rule)?.item.name ||
      rule.targetKey.split('|').at(-1) || readableTargetLabel(rule)
  }
  return record.person.name
}

function buildResultGroups(records, fields, path = []) {
  const [field, ...remainingFields] = fields
  const groups = new Map()
  for (const record of records) {
    const label = groupLabelFor(field, record)
    const value = field === 'person' ? record.person.id : normalize(label)
    if (!groups.has(value)) groups.set(value, { label, records: [] })
    groups.get(value).records.push(record)
  }
  return [...groups.entries()]
    .map(([value, group]) => {
      const groupPath = [...path, value]
      return {
        ...group,
        key: JSON.stringify(groupPath),
        depth: path.length,
        children: remainingFields.length ? buildResultGroups(group.records, remainingFields, groupPath) : [],
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base', numeric: true }))
}

const resultGroups = computed(() => controlView.value === 'grouped' && groupBy.value.length
  ? buildResultGroups(filteredRecords.value, groupBy.value)
  : [])

const entryCount = computed(() => controlView.value === 'list' ? filteredRecords.value.length : resultGroups.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(entryCount.value / pageSize.value)))
const pageGroups = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return controlView.value === 'list'
    ? [{ key: 'list', records: filteredRecords.value.slice(start, end), children: [] }]
    : visibleGroups(resultGroups.value.slice(start, end))
})
const pageUnit = computed(() => controlView.value === 'list'
  ? 'registros'
  : groupOptions.find(option => option.id === groupBy.value[0])?.unit || 'grupos')

function visibleGroups(groups) {
  return groups.flatMap(group => expandedGroupKeys.value.has(group.key)
    ? [group, ...visibleGroups(group.children)]
    : [group])
}

function toggleGroupDetails(key) {
  const expanded = new Set(expandedGroupKeys.value)
  if (expanded.has(key)) expanded.delete(key)
  else expanded.add(key)
  expandedGroupKeys.value = expanded
}

function exportControlCsv() {
  if (!filteredRecords.value.length) return
  const records = filteredRecords.value.map(record => ({ ...record, ...targetVariationRow(record.rule) }))
  const url = URL.createObjectURL(new Blob([epiControlCsv(records)], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `controle_epis_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function historyRowsForRecord(record) {
  if (!record) return []
  const target = targetFromRule(record.rule)
  return matchingMovements(movementsForPerson.value(record.person), target)
}

const selectedHistoryRows = computed(() => historyRowsForRecord(historyRecord.value))

function movementAttributesText(movement) {
  return [
    ...Object.entries(movement.variationValues || {}).map(([key, value]) => `${key}: ${value}`),
    ...Object.entries(movement.variationExtras || {}).map(([key, value]) => `${key}: ${value}`),
  ].filter(Boolean).join(' / ')
}

function openHistory(record) {
  historyRecord.value = record
  editingHistoryMovement.value = null
}

function closeHistory() {
  historyRecord.value = null
  editingHistoryMovement.value = null
}

function toLocalDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function startHistoryEdit(movement) {
  editingHistoryMovement.value = movement
  historyEditForm.value = {
    qty: movement.qty,
    date: toLocalDateTime(movement.date),
    docRef: movement.docRef || '',
    note: movement.note || '',
  }
}

function cancelHistoryEdit() {
  editingHistoryMovement.value = null
}

async function saveHistoryEdit() {
  const movement = editingHistoryMovement.value
  if (!movement || historyEditSaving.value) return
  const qty = Number(historyEditForm.value.qty)
  const date = new Date(historyEditForm.value.date)
  if (!(qty > 0)) {
    error('Informe uma quantidade maior que zero.')
    return
  }
  if (Number.isNaN(date.getTime())) {
    error('Informe uma data válida.')
    return
  }
  historyEditSaving.value = true
  const variation = variations.value.find(row => row.id === movement.variationId)
  const result = await editMovement(movement.id, {
    qty,
    date: date.toISOString(),
    docRef: historyEditForm.value.docRef.trim(),
    note: historyEditForm.value.note.trim(),
  }, variation)
  historyEditSaving.value = false
  if (!result.ok) {
    error(result.error || 'Não foi possível editar esta retirada.')
    return
  }
  editingHistoryMovement.value = null
  success('Retirada de EPI atualizada.')
}

watch([entryCount, pageSize], () => {
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
})

watch([search, statusFilters, personStatusFilter, controlView, groupBy], () => {
  currentPage.value = 1
  expandedGroupKeys.value = new Set()
})

function quickMovement(record) {
  const exact = resolveQuickTarget(record.rule)
  if (record.rule.allowedCas || record.rule.requiredAttributes) {
    selectedRecordKeys.value = [recordKey(record)]
    openBulkDelivery()
    return
  }
  emit('quick-movement', {
    type: 'saida',
    itemId: exact?.item?.id,
    variationId: exact?.variation?.id,
    targetType: record.rule.targetType,
    targetKey: record.rule.targetKey,
    targetLabel: record.rule.targetLabel,
    quantity: Number(record.rule.quantity || 1),
    requestedBy: record.person.name,
    requestedByPersonId: record.person.id,
    destination: 'EPI',
    returnTo: { tab: 'inventario', section: 'epis' },
    nonce: `epi:${record.person.id}:${record.rule.id}:${Date.now()}`,
  })
}

function recordKey(record) {
  return `${record.person.id}:${record.rule.id}`
}

const selectedRecords = computed(() => {
  const keys = new Set(selectedRecordKeys.value)
  return records.value.filter(record => keys.has(recordKey(record)))
})

const allVisibleSelected = computed(() => {
  const visible = filteredRecords.value
  return visible.length > 0 && visible.every(record => selectedRecordKeys.value.includes(recordKey(record)))
})

function toggleRecord(record) {
  const key = recordKey(record)
  selectedRecordKeys.value = selectedRecordKeys.value.includes(key)
    ? selectedRecordKeys.value.filter(value => value !== key)
    : [...selectedRecordKeys.value, key]
}

function toggleVisibleRecords() {
  const visibleKeys = filteredRecords.value.map(recordKey)
  if (allVisibleSelected.value) {
    selectedRecordKeys.value = selectedRecordKeys.value.filter(key => !visibleKeys.includes(key))
    return
  }
  selectedRecordKeys.value = [...new Set([...selectedRecordKeys.value, ...visibleKeys])]
}

function openBulkDelivery() {
  if (!selectedRecords.value.length) return
  const choices = { ...bulkChoices.value }
  for (const record of selectedRecords.value) {
    const key = recordKey(record)
    const matches = targetRows(record.rule)
    if (!choices[key] && matches.length === 1) choices[key] = matches[0].variation.id
  }
  bulkChoices.value = choices
  bulkOpen.value = true
}

function selectedRowForRecord(record) {
  const variationId = bulkChoices.value[recordKey(record)]
  return targetRows(record.rule).find(row => row.variation.id === variationId) || null
}

const bulkValidation = computed(() => {
  if (!selectedRecords.value.length) return 'Selecione ao menos uma reposição.'
  const requestedByVariation = new Map()
  for (const record of selectedRecords.value) {
    const row = selectedRowForRecord(record)
    if (!row) return `Escolha a variação para ${record.person.name}.`
    const qty = Number(record.rule.quantity || 1)
    requestedByVariation.set(row.variation.id, (requestedByVariation.get(row.variation.id) || 0) + qty)
  }
  for (const [variationId, qty] of requestedByVariation) {
    const variation = variations.value.find(row => row.id === variationId)
    if (variation?.stockConfirmed !== false && Number(variation?.stock || 0) < qty) return 'O estoque não cobre todas as reposições selecionadas.'
  }
  return ''
})

async function submitBulkDelivery() {
  if (bulkValidation.value || bulkSubmitting.value) return
  bulkSubmitting.value = true
  try {
    const lines = selectedRecords.value.map(record => {
      const { variation, item } = selectedRowForRecord(record)
      return {
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
        qty: Number(record.rule.quantity || 1),
        requestedBy: record.person.name,
        requestedByPersonId: record.person.id,
        destination: 'EPI',
        docRef: 'REPOSICAO EPI',
        note: `Reposição automática: ${readableTargetLabel(record.rule)}`,
      }
    })
    const created = await addMovementBatch('saida', lines, {}, `epi_${Date.now()}_${lines.length}`)
    for (const movement of created) {
      const variation = variations.value.find(row => row.id === movement.variationId)
      if (variation) { variation.stock = movement.stockAfter; variation.stockConfirmed = movement.stockConfirmed !== false }
    }
    success(`${created.length} reposição(ões) de EPI registrada(s).`)
    selectedRecordKeys.value = []
    bulkChoices.value = {}
    bulkOpen.value = false
  } catch (cause) {
    error(cause.message || 'Não foi possível registrar as reposições.')
  } finally {
    bulkSubmitting.value = false
  }
}
</script>

<template>
  <section class="epi-control space-y-4">
    <header class="epi-control-header">
      <div>
        <h1 class="ds-page-title">Controle de EPIs</h1>
        <p class="ds-page-subtitle">Entregas, trocas e vencimentos por pessoa.</p>
      </div>
      <div class="epi-control-actions">
        <AppButton variant="secondary" :disabled="!filteredRecords.length" title="Exportar todos os resultados da busca e dos filtros, incluindo outras páginas" @click="exportControlCsv">Exportar CSV</AppButton>
        <AppButton variant="primary" @click="sheetOpen = true">Ficha de EPI</AppButton>
      </div>
    </header>

    <nav class="flex flex-wrap items-center gap-2" aria-label="Visualização do controle de EPIs">
      <AppButton :variant="controlView === 'list' ? 'primary' : 'secondary'" size="sm" :aria-pressed="controlView === 'list'" @click="controlView = 'list'">Lista</AppButton>
      <AppButton :variant="controlView === 'grouped' ? 'primary' : 'secondary'" size="sm" :aria-pressed="controlView === 'grouped'" @click="controlView = 'grouped'">Agrupado</AppButton>
      <div v-if="controlView === 'grouped'" role="group" aria-label="Agrupar por" class="flex flex-wrap items-center gap-1.5 sm:ml-2">
        <span class="mr-1 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">Agrupar por</span>
        <button
          v-for="option in groupOptions"
          :key="option.id"
          type="button"
          class="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors"
          :class="groupBy.includes(option.id)
            ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
            : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'"
          :aria-pressed="groupBy.includes(option.id)"
          @click="toggleGroupBy(option.id)"
        >
          <span v-if="groupBy.includes(option.id)" class="inline-grid h-4 w-4 place-items-center rounded-full bg-current/10 text-[10px] tabular-nums" :aria-label="`Nível ${groupBy.indexOf(option.id) + 1}`">
            {{ groupBy.indexOf(option.id) + 1 }}
          </span>
          {{ option.label }}
        </button>
      </div>
    </nav>

    <div class="epi-control-panel overflow-hidden">
      <div class="epi-control-toolbar">
        <div class="ds-query-bar epi-control-search" role="search" aria-label="Pesquisar controle de EPIs">
          <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path stroke-linecap="round" d="m16 16 4 4" /></svg>
          <input v-model="search" type="search" class="ds-query-input" aria-label="Buscar pessoa, cargo, setor ou EPI" placeholder="Buscar pessoa, cargo, setor ou EPI..." />
        </div>
        <label class="epi-control-person-filter">
          <span>Pessoas</span>
          <select v-model="personStatusFilter" class="ds-input" aria-label="Situação da pessoa">
            <option v-for="tab in personStatusTabs" :key="tab.id" :value="tab.id">{{ tab.label }}</option>
          </select>
        </label>
        <div v-if="canOperate" class="epi-control-selection">
          <AppButton variant="ghost" size="sm"
            :disabled="!filteredRecords.length"
            :aria-pressed="allVisibleSelected" @click="toggleVisibleRecords">
            {{ allVisibleSelected ? 'Limpar seleção' : 'Selecionar EPIs dos resultados' }}
          </AppButton>
          <AppButton v-if="selectedRecords.length" variant="primary" size="sm" @click="openBulkDelivery">
            Registrar reposições ({{ selectedRecords.length }})
          </AppButton>
        </div>
      </div>
      <div class="epi-control-status" role="group" aria-label="Situação do EPI">
        <button v-for="tab in filterTabs" :key="tab.id" type="button"
          :aria-pressed="statusFilterActive(tab.id)" @click="toggleStatusFilter(tab.id)">
          {{ tab.label }} <span>{{ tab.count }}</span>
        </button>
      </div>
      <div class="divide-y divide-gray-100 dark:divide-gray-800">
        <p v-if="!entryCount" class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {{ controlView === 'grouped' && !groupBy.length
            ? 'Escolha os níveis na ordem em que quer abrir os grupos.'
            : 'Nenhum EPI encontrado para os filtros selecionados.' }}
        </p>
        <div v-for="group in pageGroups" v-show="entryCount" :key="group.key">
          <button
            v-if="controlView === 'grouped'"
            type="button"
            class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/40"
            :style="{ paddingInlineStart: `${1 + group.depth * 1.25}rem` }"
            :aria-expanded="expandedGroupKeys.has(group.key)"
            @click="toggleGroupDetails(group.key)"
          >
            <span class="min-w-0 flex-1 font-semibold text-gray-900 dark:text-gray-100">{{ group.label }}</span>
            <span class="shrink-0 text-xs text-gray-500 dark:text-gray-400">{{ group.records.length }} {{ group.records.length === 1 ? 'registro' : 'registros' }}</span>
            <svg aria-hidden="true" class="h-4 w-4 shrink-0 text-gray-500 transition-transform" :class="{ 'rotate-180': expandedGroupKeys.has(group.key) }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div v-if="!group.children.length && (controlView === 'list' || expandedGroupKeys.has(group.key))" :class="controlView === 'grouped' ? 'border-t border-gray-200 dark:border-gray-800' : ''">
            <div class="overflow-x-auto">
            <table class="w-full min-w-[700px] text-sm" :aria-label="group.label ? `EPIs · ${group.label}` : 'Lista de EPIs'">
              <thead>
                <tr class="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400">
                  <th v-if="showPersonColumn" class="px-3 py-2 text-left font-semibold">Pessoa</th>
                  <th class="px-3 py-2 text-left font-semibold">EPI e periodicidade</th>
                  <th class="px-3 py-2 text-left font-semibold">Motivo de uso</th>
                  <th class="px-3 py-2 text-left font-semibold">Situação</th>
                  <th class="w-px whitespace-nowrap px-3 py-2 text-center font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                <tr
                  v-for="record in group.records"
                  :key="recordKey(record)"
                  class="hover:bg-gray-50/70 dark:hover:bg-gray-800/40"
                  :class="selectedRecordKeys.includes(recordKey(record)) ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''"
                >
                  <td v-if="showPersonColumn" class="px-3 py-2">
                    <p class="font-semibold text-gray-900 dark:text-gray-100">{{ record.person.name }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      {{ record.person.role || '-' }}
                      <span v-if="record.person.status !== 'ativo'"> · {{ personStatusLabel(record.person.status) }}</span>
                    </p>
                  </td>
                  <td class="px-3 py-2">
                    <template v-if="targetVariationRow(record.rule)">
                      <p class="font-medium text-gray-900 dark:text-gray-100">{{ targetVariationRow(record.rule).item.name }}</p>
                      <AttributeBadges class="mt-1" :item="targetVariationRow(record.rule).item" :variation="targetVariationRow(record.rule).variation" compact />
                    </template>
                    <p v-else class="font-medium text-gray-900 dark:text-gray-100">{{ readableTargetLabel(record.rule) }}</p>
                    <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {{ targetTypeLabels[record.rule.targetType] }}<template v-if="record.period"> · troca a cada {{ record.period.days }} dias</template>
                    </p>
                  </td>
                  <td class="px-3 py-2">
                    <p class="max-w-xs whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{{ record.rule.usageReason || 'Não informado' }}</p>
                  </td>
                  <td class="px-3 py-2">
                    <span class="rounded-full px-2 py-1 text-xs font-semibold" :class="statusConfig[record.status].pill">
                      {{ statusConfig[record.status].label }}
                    </span>
                    <p class="mt-1.5 text-xs text-gray-600 dark:text-gray-300">
                      Última saída: <strong>{{ formatDate(record.movement?.date) }}</strong>
                      <template v-if="record.dueDate"> · vence: <strong>{{ formatDate(record.dueDate) }}</strong></template>
                    </p>
                  </td>
                  <td class="px-3 py-2 text-right">
                    <div class="flex flex-nowrap justify-end gap-1.5 whitespace-nowrap">

                      <button type="button" class="inline-flex h-9 items-center rounded-md border border-gray-200 px-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 cursor-pointer" aria-haspopup="dialog" @click="compatibleRecord = record">Itens compatíveis</button>
                      <button
                        type="button"
                        class="inline-flex h-9 items-center rounded-md border border-gray-200 px-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 cursor-pointer"
                        @click="openHistory(record)"
                      >
                        Histórico
                      </button>
                      <button
                        v-if="canOperate"
                        type="button"
                        class="inline-flex h-9 items-center rounded-md bg-primary-600 px-2.5 text-xs font-semibold text-[var(--ds-primary-text)] transition-colors hover:bg-primary-700 cursor-pointer"
                        @click="quickMovement(record)"
                      >
                        Registrar saida
                      </button>
                      <button
                        v-if="canOperate"
                        type="button"
                        class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-semibold transition-colors"
                        :class="selectedRecordKeys.includes(recordKey(record))
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
                          : 'border-gray-200 text-gray-600 hover:border-primary-400 hover:text-primary-700 dark:border-gray-700 dark:text-gray-300 dark:hover:text-primary-300'"
                        :aria-pressed="selectedRecordKeys.includes(recordKey(record))"
                        :aria-label="`${selectedRecordKeys.includes(recordKey(record)) ? 'Desmarcar' : 'Selecionar'} reposição de ${readableTargetLabel(record.rule)} para ${record.person.name}`"
                        :title="selectedRecordKeys.includes(recordKey(record)) ? 'Desmarcar reposição' : 'Selecionar reposição'"
                        @click="toggleRecord(record)"
                      >
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <path v-if="selectedRecordKeys.includes(recordKey(record))" stroke-linecap="round" stroke-linejoin="round" d="m8.5 12 2.25 2.25L15.5 9.5" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
        </div>

        <div v-if="entryCount" class="flex items-center justify-between border-t border-gray-200 bg-gray-50/70 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400">
          <div class="flex items-center gap-2">
            <span>Exibir</span>
            <select v-model.number="pageSize" class="rounded-lg border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="40">40</option>
              <option :value="80">80</option>
            </select>
            <span>{{ pageUnit }} por página</span>
            <span>{{ entryCount }} {{ pageUnit }}</span>
          </div>
          <div class="flex items-center gap-1">
            <button type="button" class="rounded-lg px-2 py-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700" :disabled="currentPage <= 1" @click="currentPage--">Anterior</button>
            <span class="px-2">{{ currentPage }} / {{ totalPages }}</span>
            <button type="button" class="rounded-lg px-2 py-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700" :disabled="currentPage >= totalPages" @click="currentPage++">Proxima</button>
          </div>
        </div>
      </div>
    </div>

    <AppDialog v-if="compatibleRecord" visible aria-label="Itens compatíveis com o EPI" @close="compatibleRecord = null">
      <section class="ds-panel flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden">
        <header class="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div class="min-w-0"><h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Itens compatíveis</h2><p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{{ readableTargetLabel(compatibleRecord.rule) }} · {{ compatibleRecord.person.name }}</p><p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Variações do catálogo que atendem ao vínculo cadastrado · {{ compatibleRecord.rule.quantity }} por entrega</p></div>
          <button type="button" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Fechar itens compatíveis" @click="compatibleRecord = null">✕</button>
        </header>
        <div class="min-h-0 overflow-y-auto px-5">
          <p v-if="!compatibleRows.length" class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma variação ativa encontrada para este vínculo.</p>
          <article v-for="{ item, variation } in compatibleRows" :key="variation.id" class="flex items-center justify-between gap-4 border-b border-gray-200 py-4 last:border-b-0 dark:border-gray-700">
            <div class="min-w-0"><h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ item.name }}</h3><AttributeBadges class="mt-2" :item="item" :variation="variation" compact /></div>
            <div class="shrink-0 text-right"><p class="text-xs text-gray-500 dark:text-gray-400">Estoque</p><p class="mt-1 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ variation.stockConfirmed === false ? 'A confirmar' : `${variation.stock} ${item.unit}` }}</p></div>
          </article>
        </div>
        <footer class="border-t border-gray-200 px-5 py-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">{{ compatibleRows.length }} {{ compatibleRows.length === 1 ? 'variação' : 'variações' }}</footer>
      </section>
    </AppDialog>

    <AppDialog
      :visible="bulkOpen"
      aria-label="Registrar reposições de EPI"
      :persistent="bulkSubmitting"
      @close="bulkOpen = false"
    >
      <section class="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <header class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-300">Entrega em lote</p>
            <h3 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">Registrar {{ selectedRecords.length }} reposições</h3>
            <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Confirme a variação entregue para cada pessoa. O estoque só será alterado depois da confirmação.
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            :disabled="bulkSubmitting"
            @click="bulkOpen = false"
          >
            Fechar
          </button>
        </header>

        <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <article
            v-for="record in selectedRecords"
            :key="recordKey(record)"
            class="grid gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,1.4fr)_auto] lg:items-center"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-semibold text-gray-900 dark:text-gray-100">{{ record.person.name }}</p>
                <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusConfig[record.status].pill">
                  {{ statusConfig[record.status].label }}
                </span>
              </div>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ record.person.role || 'Sem cargo' }} · {{ readableTargetLabel(record.rule) }}
              </p>
            </div>

            <label class="block">
              <span class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Variação entregue</span>
              <select
                v-model="bulkChoices[recordKey(record)]"
                class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Escolha uma variação</option>
                <option
                  v-for="row in targetRows(record.rule)"
                  :key="row.variation.id"
                  :value="row.variation.id"
                >
                  {{ variationLabel(row.variation, row.item) }} — estoque {{ row.variation.stock }} {{ row.item.unit }}
                </option>
              </select>
            </label>

            <div class="rounded-lg bg-gray-50 px-3 py-2 text-center dark:bg-gray-800/70">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Quantidade</p>
              <p class="mt-0.5 text-lg font-semibold text-gray-900 dark:text-gray-100">{{ Number(record.rule.quantity || 1) }}</p>
            </div>
          </article>
        </div>

        <footer class="flex flex-col gap-3 border-t border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/40 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm" :class="bulkValidation ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'">
            {{ bulkValidation || 'Tudo pronto para registrar.' }}
          </p>
          <div class="flex justify-end gap-2">
            <AppButton variant="ghost" :disabled="bulkSubmitting" @click="bulkOpen = false">Cancelar</AppButton>
            <AppButton
              variant="primary"
              :loading="bulkSubmitting"
              :disabled="Boolean(bulkValidation)"
              @click="submitBulkDelivery"
            >
              Confirmar entregas
            </AppButton>
          </div>
        </footer>
      </section>
    </AppDialog>

    <AppDialog
      v-if="historyRecord"
      visible
      aria-label="Histórico de retirada de EPI"
      :persistent="historyEditSaving"
      @close="closeHistory"
    >
      <section class="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <header class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Histórico de retirada</p>
            <h3 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{{ historyRecord.person.name }}</h3>
            <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{{ readableTargetLabel(historyRecord.rule) }}</p>
          </div>
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            :disabled="historyEditSaving"
            @click="closeHistory"
          >
            Fechar
          </button>
        </header>

        <div v-if="selectedHistoryRows.length" class="min-h-0 flex-1 overflow-auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Data</th>
                <th class="px-4 py-3 text-left font-semibold">EPI retirado</th>
                <th class="px-4 py-3 text-center font-semibold">Qtd.</th>
                <th class="px-4 py-3 text-left font-semibold">Destino / Doc</th>
                <th v-if="isAdmin" class="px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <template v-for="movement in selectedHistoryRows" :key="movement.id">
                <tr class="hover:bg-gray-50/70 dark:hover:bg-gray-800/40">
                  <td class="px-4 py-3 whitespace-nowrap font-medium text-gray-900 dark:text-gray-100">{{ formatDate(movement.date) }}</td>
                  <td class="px-4 py-3">
                    <p class="font-semibold text-gray-900 dark:text-gray-100">{{ movement.itemName }}</p>
                    <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ movementAttributesText(movement) || 'Sem atributos' }}</p>
                  </td>
                  <td class="px-4 py-3 text-center font-semibold text-red-600 dark:text-red-400">-{{ movement.qty }} {{ movement.itemUnit }}</td>
                  <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
                    <p>{{ movement.destination || '-' }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ movement.docRef || movement.note || '-' }}</p>
                  </td>
                  <td v-if="isAdmin" class="px-4 py-3 text-right">
                    <button
                      type="button"
                      class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      :disabled="historyEditSaving"
                      @click="startHistoryEdit(movement)"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
                <tr v-if="editingHistoryMovement?.id === movement.id" class="bg-primary-50/40 dark:bg-primary-900/10">
                  <td :colspan="isAdmin ? 5 : 4" class="p-4">
                    <form class="grid gap-3 md:grid-cols-[13rem_8rem_1fr_1fr_auto]" @submit.prevent="saveHistoryEdit">
                      <label class="block">
                        <span class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Data e hora</span>
                        <input v-model="historyEditForm.date" type="datetime-local" class="ds-input w-full" />
                      </label>
                      <label class="block">
                        <span class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Quantidade</span>
                        <input v-model="historyEditForm.qty" type="number" min="0.001" step="any" class="ds-input w-full" />
                      </label>
                      <label class="block">
                        <span class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Documento</span>
                        <input v-model="historyEditForm.docRef" type="text" class="ds-input w-full" placeholder="Opcional" />
                      </label>
                      <label class="block">
                        <span class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Observação</span>
                        <input v-model="historyEditForm.note" type="text" class="ds-input w-full" placeholder="Opcional" />
                      </label>
                      <div class="flex items-end justify-end gap-2">
                        <AppButton type="button" size="sm" variant="ghost" :disabled="historyEditSaving" @click="cancelHistoryEdit">Cancelar</AppButton>
                        <AppButton type="submit" size="sm" variant="primary" :loading="historyEditSaving">Salvar</AppButton>
                      </div>
                    </form>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div v-else class="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Nenhuma retirada registrada para este EPI desta pessoa.
        </div>
      </section>
    </AppDialog>

    <EpiSheetDialog v-if="sheetOpen" :can-operate="canOperate" @close="sheetOpen = false" />
  </section>
</template>

<style scoped>
.epi-control-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
.epi-control-actions, .epi-control-selection { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.epi-control-panel { border: 1px solid var(--ds-border); border-radius: var(--ds-radius-card); background: var(--ds-panel); }
.epi-control-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 16px 16px 12px; }
.epi-control-search { flex: 1 1 300px; min-width: 0; margin: 0; color: var(--ds-text-muted); }
.epi-control-person-filter { display: flex; align-items: center; gap: 8px; color: var(--ds-text-muted); font-size: 13px; }
.epi-control-person-filter select { width: 150px; min-height: 40px; }
.epi-control-status { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 14px; border-bottom: 1px solid var(--ds-border-subtle); }
.epi-control-status button { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 6px 10px; border: 1px solid var(--ds-border); border-radius: 6px; color: var(--ds-text-soft); font-size: 13px; font-weight: 600; cursor: pointer; }
.epi-control-status button span { font-size: 12px; font-variant-numeric: tabular-nums; opacity: .8; }
.epi-control-status button:hover { background: var(--ds-surface-hover); }
.epi-control-status button[aria-pressed="true"] { border-color: var(--ds-brand); background: var(--ds-brand); color: var(--ds-primary-text); }
.epi-control-status button:focus-visible { outline: 2px solid var(--ds-active-text); outline-offset: 2px; }
@media (max-width: 640px) {
  .epi-control-actions { width: 100%; }
  .epi-control-actions > * { flex: 1; }
  .epi-control-toolbar { gap: 10px; padding: 12px; }
  .epi-control-search { flex-basis: 100%; }
  .epi-control-person-filter { flex: 1; }
  .epi-control-person-filter select { flex: 1; width: auto; }
  .epi-control-selection { flex-basis: 100%; }
  .epi-control-status { padding: 0 12px 12px; }
}
</style>
