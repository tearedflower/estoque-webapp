<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useItems } from '../../composables/useItems.js'
import { personStatusLabel, usePeople } from '../../composables/usePeople.js'
import { useMovements } from '../../composables/useMovements.js'
import { useEpis } from '../../composables/useEpis.js'
import { useToast } from '../../composables/useToast.js'
import { catalogRowsForTarget, movementPersonMatches } from '../../utils/epiSheet.js'
import AttributeBadges from '../ui/AttributeBadges.vue'
import AppDialog from '../ui/AppDialog.vue'
import AppButton from '../ui/AppButton.vue'
import EpiSheetDialog from './EpiSheetDialog.vue'

const emit = defineEmits(['quick-movement'])
defineProps({ canOperate: { type: Boolean, default: false } })

const { items, variations } = useItems()
const { people } = usePeople()
const { movements, addMovementBatch, editMovement } = useMovements()
const { activeRoleRules, activePeriodicities } = useEpis()
const { success, error } = useToast()
const isAdmin = inject('isAdmin')

const search = ref('')
const statusFilters = ref([])
const personStatusFilter = ref('ativo')
const currentPage = ref(1)
const pageSize = ref(20)
const historyRecord = ref(null)
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
  }
}

function targetMatchesMovement(target, movement) {
  if (!target || !movement || movement.type !== 'saida') return false
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

function targetRows(rule) {
  return catalogRowsForTarget(items.value, variations.value, rule)
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
    const role = String(person.role || '').trim()
    if (!role) continue
    const rules = activeRoleRules.value.filter(rule => normalize(rule.roleName) === normalize(role))
    for (const rule of rules) {
      if (Number(rule.days) === 0 || !targetRows(rule).length) continue
      const target = targetFromRule(rule)
      const movement = movements.value
        .filter(movement => movementPersonMatches(movement, person) && targetMatchesMovement(target, movement))
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null
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

const counts = computed(() => ({
  all: records.value.length,
  ok: records.value.filter(record => record.status === 'Em dia').length,
  attention: records.value.filter(record => ['Pendente', 'Programar troca', 'Vence em breve', 'Vencido'].includes(record.status)).length,
  pending: records.value.filter(record => record.status === 'Pendente').length,
  upcoming: records.value.filter(record => record.status === 'Programar troca').length,
  soon: records.value.filter(record => record.status === 'Vence em breve').length,
  expired: records.value.filter(record => record.status === 'Vencido').length,
}))

const filterTabs = computed(() => [
  { id: 'all', label: 'Todos', count: counts.value.all },
  { id: 'attention', label: 'Precisam trocar', count: counts.value.attention },
  { id: 'ok', label: 'Em dia', count: counts.value.ok },
  { id: 'pending', label: 'Pendentes', count: counts.value.pending },
  { id: 'upcoming', label: 'Troca em 8–30 dias', count: counts.value.upcoming },
  { id: 'soon', label: 'Vence em breve', count: counts.value.soon },
  { id: 'expired', label: 'Vencidos', count: counts.value.expired },
])

const statusesByFilter = {
  attention: ['Pendente', 'Programar troca', 'Vence em breve', 'Vencido'],
  ok: ['Em dia'],
  pending: ['Pendente'],
  upcoming: ['Programar troca'],
  soon: ['Vence em breve'],
  expired: ['Vencido'],
}

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
  const q = normalize(search.value)
  const selectedStatuses = new Set(
    statusFilters.value.flatMap(filterId => statusesByFilter[filterId] || [])
  )
  return records.value.filter(record => {
    const statusOk = selectedStatuses.size === 0 || selectedStatuses.has(record.status)
    if (!statusOk) return false
    if (!q) return true
    return [
      record.person.name,
      record.person.role,
      personStatusLabel(record.person.status),
      record.rule.targetLabel,
      record.rule.targetKey,
      record.movement?.itemName,
      record.status,
    ].some(value => normalize(value).includes(q))
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRecords.value.length / pageSize.value)))
const paginatedRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRecords.value.slice(start, start + pageSize.value)
})

function historyRowsForRecord(record) {
  if (!record) return []
  const target = targetFromRule(record.rule)
  return movements.value
    .filter(movement => movementPersonMatches(movement, record.person) && targetMatchesMovement(target, movement))
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
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

watch([filteredRecords, pageSize], () => {
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
})

watch([search, statusFilters, personStatusFilter], () => {
  currentPage.value = 1
})

function quickMovement(record) {
  const exact = resolveQuickTarget(record.rule)
  emit('quick-movement', {
    type: 'saida',
    itemId: exact?.item?.id,
    variationId: exact?.variation?.id,
    targetType: record.rule.targetType,
    targetKey: record.rule.targetKey,
    targetLabel: record.rule.targetLabel,
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

const attentionRecords = computed(() => records.value.filter(record =>
  ['Pendente', 'Programar troca', 'Vence em breve', 'Vencido'].includes(record.status)
))

const selectedRecords = computed(() => {
  const keys = new Set(selectedRecordKeys.value)
  return attentionRecords.value.filter(record => keys.has(recordKey(record)))
})

const allVisibleAttentionSelected = computed(() => {
  const visible = filteredRecords.value.filter(record =>
    ['Pendente', 'Programar troca', 'Vence em breve', 'Vencido'].includes(record.status)
  )
  return visible.length > 0 && visible.every(record => selectedRecordKeys.value.includes(recordKey(record)))
})

function toggleRecord(record) {
  const key = recordKey(record)
  selectedRecordKeys.value = selectedRecordKeys.value.includes(key)
    ? selectedRecordKeys.value.filter(value => value !== key)
    : [...selectedRecordKeys.value, key]
}

function toggleVisibleAttention() {
  const visibleKeys = filteredRecords.value
    .filter(record => ['Pendente', 'Programar troca', 'Vence em breve', 'Vencido'].includes(record.status))
    .map(recordKey)
  if (allVisibleAttentionSelected.value) {
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
  const variation = variations.value.find(row => row.id === variationId)
  const item = variation ? itemById.value.get(variation.itemId) : null
  return variation && item ? { variation, item } : null
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
  <section class="space-y-4">
    <header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div class="ds-page-header">
        <div>
          <h1 class="ds-page-title">Controle de EPIs</h1>
          <p class="ds-page-subtitle">Entregas, trocas e vencimentos por pessoa.</p>
        </div>
      </div>
      <div class="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
        <AppButton
          v-if="canOperate"
          variant="ghost"
          :disabled="!filteredRecords.some(record => ['Pendente', 'Programar troca', 'Vence em breve', 'Vencido'].includes(record.status))"
          :aria-pressed="allVisibleAttentionSelected"
          @click="toggleVisibleAttention"
        >
          {{ allVisibleAttentionSelected ? 'Limpar resultados' : 'Selecionar resultados' }}
        </AppButton>
        <AppButton
          v-if="canOperate"
          variant="secondary"
          :disabled="!selectedRecords.length"
          @click="openBulkDelivery"
        >
          Registrar reposições
          <span v-if="selectedRecords.length" class="rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700 dark:bg-primary-900/50 dark:text-primary-200">
            {{ selectedRecords.length }}
          </span>
        </AppButton>
        <button type="button" class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-[var(--ds-primary-text)] transition-colors hover:bg-primary-700" @click="sheetOpen = true">
          Ficha de EPI
        </button>
        <input
          v-model="search"
          type="search"
          placeholder="Buscar pessoa, cargo ou EPI..."
          class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 md:w-80"
        />
      </div>
    </header>

    <div class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div class="grid gap-3 border-b border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-800/30 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div class="min-w-0">
          <p class="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Situação do EPI</p>
          <div class="flex min-h-10 min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-700">
            <button
              v-for="tab in filterTabs"
              :key="tab.id"
              type="button"
              class="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors"
              :class="statusFilterActive(tab.id)
                ? 'bg-primary-600 text-[var(--ds-primary-text)]'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-gray-100'"
              :aria-pressed="statusFilterActive(tab.id)"
              @click="toggleStatusFilter(tab.id)"
            >
              {{ tab.label }} <span class="tabular-nums opacity-70">({{ tab.count }})</span>
            </button>
          </div>
        </div>
        <div class="min-w-0">
          <p class="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Situação da pessoa</p>
          <div class="flex min-h-10 min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-700">
            <button
              v-for="tab in personStatusTabs"
              :key="tab.id"
              type="button"
              class="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors"
              :class="personStatusFilter === tab.id
                ? 'bg-primary-600 text-[var(--ds-primary-text)]'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-gray-100'"
              :aria-pressed="personStatusFilter === tab.id"
              @click="personStatusFilter = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[780px] text-sm">
          <thead>
            <tr class="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400">
              <th class="px-3 py-2 text-left font-semibold">Pessoa</th>
              <th class="px-3 py-2 text-left font-semibold">EPI e periodicidade</th>
              <th class="px-3 py-2 text-left font-semibold">Situação</th>
              <th class="px-3 py-2 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="!filteredRecords.length">
              <td colspan="4" class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhum EPI encontrado para os filtros selecionados.
              </td>
            </tr>
            <tr
              v-for="record in paginatedRecords"
              :key="`${record.person.id}:${record.rule.id}`"
              class="hover:bg-gray-50/70 dark:hover:bg-gray-800/40"
              :class="selectedRecordKeys.includes(recordKey(record)) ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''"
            >
              <td class="px-3 py-2">
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
                  <button
                    v-if="canOperate && ['Pendente', 'Programar troca', 'Vence em breve', 'Vencido'].includes(record.status)"
                    type="button"
                    class="inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-xs font-semibold transition-colors"
                    :class="selectedRecordKeys.includes(recordKey(record))
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
                      : 'border-gray-200 text-gray-600 hover:border-primary-400 hover:text-primary-700 dark:border-gray-700 dark:text-gray-300 dark:hover:text-primary-300'"
                    :aria-pressed="selectedRecordKeys.includes(recordKey(record))"
                    @click="toggleRecord(record)"
                  >
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="9" />
                      <path v-if="selectedRecordKeys.includes(recordKey(record))" stroke-linecap="round" stroke-linejoin="round" d="m8.5 12 2.25 2.25L15.5 9.5" />
                    </svg>
                    {{ selectedRecordKeys.includes(recordKey(record)) ? 'Selecionado' : 'Selecionar' }}
                  </button>
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
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="filteredRecords.length" class="flex items-center justify-between border-t border-gray-200 bg-gray-50/70 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400">
          <div class="flex items-center gap-2">
            <span>Exibir</span>
            <select v-model.number="pageSize" class="rounded-lg border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="40">40</option>
              <option :value="80">80</option>
            </select>
            <span>por pagina</span>
            <span>{{ filteredRecords.length }} registros</span>
          </div>
          <div class="flex items-center gap-1">
            <button type="button" class="rounded-lg px-2 py-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700" :disabled="currentPage <= 1" @click="currentPage--">Anterior</button>
            <span class="px-2">{{ currentPage }} / {{ totalPages }}</span>
            <button type="button" class="rounded-lg px-2 py-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700" :disabled="currentPage >= totalPages" @click="currentPage++">Proxima</button>
          </div>
        </div>
      </div>
    </div>

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
