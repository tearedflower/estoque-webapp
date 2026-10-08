<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useClosings } from '../composables/useClosings.js'
import { useDestinations } from '../composables/useDestinations.js'
import { useToast } from '../composables/useToast.js'
import AppModal from '../components/ui/AppModal.vue'
import { closingInconsistencyCount, previousMonthPeriod } from '../utils/closingAutomation.js'

const isAdmin = inject('isAdmin')
const { closings, closingDetails, createClosing, deleteClosing, loadClosing, previewClosing } = useClosings()
const { getDestFullName } = useDestinations()
const { success, error } = useToast()

const now = new Date()
const defaultPeriod = previousMonthPeriod(now)
const selectedMonth = ref(defaultPeriod.month)
const selectedYear = ref(defaultPeriod.year)
const notes = ref('')
const selectedClosingId = ref('')
const loading = ref(false)
const deletingId = ref('')
const exporting = ref(false)
const preview = ref(null)
const previewOpen = ref(false)
const previewLoading = ref(false)
const autoPreparedPeriod = ref('')

const MONTHS = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Marco' },
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

const yearOptions = computed(() => {
  const year = new Date().getFullYear()
  return Array.from({ length: 8 }, (_, index) => year - index)
})

const selectedClosing = computed(() => {
  if (!selectedClosingId.value) return closings.value[0] || null
  return closingDetails.value[selectedClosingId.value] || closings.value.find(c => c.id === selectedClosingId.value) || null
})

const selectedDetail = computed(() => {
  if (!selectedClosing.value) return null
  return closingDetails.value[selectedClosing.value.id] || selectedClosing.value
})

const existingPeriodClosing = computed(() => closings.value.find(closing =>
  closing.year === selectedYear.value && closing.month === selectedMonth.value
) || null)
const previewIssueCount = computed(() => closingInconsistencyCount(preview.value || {}))
const isPreviousMonthSelected = computed(() =>
  selectedYear.value === defaultPeriod.year && selectedMonth.value === defaultPeriod.month
)

async function preparePreview({ open = false } = {}) {
  if (!isAdmin?.value || previewLoading.value) return
  previewLoading.value = true
  try {
    preview.value = await previewClosing(selectedYear.value, selectedMonth.value)
    previewOpen.value = open
  } catch (e) {
    error(e.message)
  } finally {
    previewLoading.value = false
  }
}

async function handlePreview() {
  await preparePreview({ open: true })
}

const attentionRows = computed(() => {
  const rows = selectedDetail.value?.data?.rows || []
  return rows
    .filter(row => row.stockAtClose <= 0 || (row.minStock > 0 && row.stockAtClose <= row.minStock))
    .slice()
    .sort((a, b) => a.stockAtClose - b.stockAtClose || a.itemName.localeCompare(b.itemName))
    .slice(0, 12)
})

function formatMonth(closing) {
  if (!closing) return '-'
  return `${String(closing.month).padStart(2, '0')}/${closing.year}`
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function formatDateOnly(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('pt-BR')
}

async function selectClosing(closing) {
  selectedClosingId.value = closing.id
  if (!closingDetails.value[closing.id]) {
    await loadClosing(closing.id)
  }
}

watch(closings, list => {
  if (!selectedClosingId.value && list.length) selectClosing(list[0]).catch(() => {})
}, { immediate: true })

watch(
  [closings, () => isAdmin?.value, selectedYear, selectedMonth],
  () => {
    preview.value = null
    const key = `${selectedYear.value}-${selectedMonth.value}`
    if (!isAdmin?.value || existingPeriodClosing.value || autoPreparedPeriod.value === key) return
    autoPreparedPeriod.value = key
    preparePreview().catch(() => {})
  },
  { immediate: true }
)

async function handleCreate() {
  if (!isAdmin?.value) return
  loading.value = true
  try {
    const created = await createClosing({
      year: selectedYear.value,
      month: selectedMonth.value,
      notes: notes.value,
      expectedMovementCount: preview.value?.movementCount,
    })
    selectedClosingId.value = created.id
    notes.value = ''
    previewOpen.value = false
    preview.value = null
    success(`Fechamento ${formatMonth(created)} salvo.`)
  } catch (e) {
    error(e.message)
  } finally {
    loading.value = false
  }
}

async function handleDelete(id) {
  if (!isAdmin?.value) return
  if (deletingId.value !== id) {
    deletingId.value = id
    return
  }
  try {
    await deleteClosing(id)
    if (selectedClosingId.value === id) selectedClosingId.value = ''
    deletingId.value = ''
    success('Fechamento excluido.')
  } catch (e) {
    error(e.message)
  }
}

function variationText(row) {
  return Object.entries(row.variationValues || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(' / ') || '-'
}

function extrasText(row) {
  return Object.entries(row.variationExtras || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(' / ') || '-'
}

function destinationsText(row) {
  return Array.isArray(row.destinations) && row.destinations.length
    ? row.destinations.map(destination => getDestFullName(destination)).join(' / ')
    : '-'
}

function closingStatus(row) {
  if (row.stockAtClose <= 0) return 'Sem estoque'
  if (row.minStock > 0 && row.stockAtClose <= row.minStock) return 'Abaixo do minimo'
  return 'OK'
}

function stockMonthStart(row) {
  if (row.stockMonthStart !== null && row.stockMonthStart !== undefined) return row.stockMonthStart
  return Number(row.stockAtClose || 0) - Number(row.monthEntradas || 0) + Number(row.monthSaidas || 0)
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value).replace(/\r?\n/g, ' ').trim()
  return `"${text.replace(/"/g, '""')}"`
}

function rowsToCsv(rows) {
  const headers = [
    'Ano',
    'Mes',
    'Grupo',
    'Categoria',
    'Subcategoria',
    'Item',
    'Variacao',
    'Extras',
    'Unidade',
    'Estoque inicio do mes',
    'Estoque fim do mes',
    'Entradas no mes',
    'Saidas no mes',
    'Estoque minimo',
    'Status',
    'Local',
    'Destinos vinculados',
  ]
  const lines = rows.map(row => [
    selectedClosing.value?.year || '',
    selectedClosing.value?.month || '',
    row.group || '',
    row.category || '',
    row.subcategory || '',
    row.itemName || '',
    variationText(row),
    extrasText(row),
    row.unit || '',
    stockMonthStart(row),
    row.stockAtClose || 0,
    row.monthEntradas || 0,
    row.monthSaidas || 0,
    row.minStock ?? '',
    closingStatus(row),
    row.location || '',
    destinationsText(row),
  ])
  return [headers, ...lines]
    .map(line => line.map(csvCell).join(';'))
    .join('\n')
}

async function handleExportDetails() {
  if (!selectedClosing.value || exporting.value) return
  exporting.value = true
  try {
    const detail = selectedDetail.value?.data?.rows
      ? selectedDetail.value
      : await loadClosing(selectedClosing.value.id)
    const csv = rowsToCsv(detail?.data?.rows || [])
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fechamento-${selectedClosing.value.year}-${String(selectedClosing.value.month).padStart(2, '0')}-detalhado.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    error(e.message)
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="ds-page-stack">
    <section
      v-if="isAdmin && isPreviousMonthSelected && !existingPeriodClosing"
      class="rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/50 dark:bg-amber-900/10"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="font-semibold text-amber-900 dark:text-amber-100">Fechamento do mês anterior pendente</p>
          <p class="mt-1 text-sm text-amber-800 dark:text-amber-200">
            {{ previewLoading ? 'Preparando a prévia automaticamente...' : preview ? `Prévia pronta: ${preview.movementCount} movimentações e ${previewIssueCount} inconsistências para revisar.` : 'A prévia será preparada automaticamente.' }}
          </p>
        </div>
        <button
          type="button"
          class="ds-segmented-item ds-segmented-item-active min-h-[38px] justify-center"
          :disabled="previewLoading"
          @click="preview ? previewOpen = true : handlePreview()"
        >
          Revisar e confirmar
        </button>
      </div>
    </section>

    <section class="ds-toolbar">
      <div class="grid grid-cols-1 md:grid-cols-[160px_120px_minmax(220px,1fr)_auto] gap-3 w-full items-end">
        <label>
          <span class="ds-label">Mês</span>
          <select v-model.number="selectedMonth" class="ds-input">
            <option v-for="month in MONTHS" :key="month.value" :value="month.value">{{ month.label }}</option>
          </select>
        </label>
        <label>
          <span class="ds-label">Ano</span>
          <select v-model.number="selectedYear" class="ds-input">
            <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
          </select>
        </label>
        <label>
          <span class="ds-label">Observação</span>
          <input v-model="notes" class="ds-input" placeholder="Opcional" :disabled="!isAdmin" />
        </label>
        <button
          class="ds-segmented-item ds-segmented-item-active min-h-[38px] justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!isAdmin || loading || previewLoading"
          @click="handlePreview"
        >
          {{ previewLoading ? 'Calculando...' : 'Revisar fechamento' }}
        </button>
      </div>
      <p v-if="!isAdmin" class="text-xs ds-muted">Somente admin pode salvar ou excluir fechamentos.</p>
    </section>

    <div class="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-4">
      <section class="ds-list-panel">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 class="ds-section-heading">Fechamentos salvos</h2>
          <span class="ds-chip">{{ closings.length }}</span>
        </div>
        <div v-if="!closings.length" class="p-4 text-sm ds-muted">Nenhum fechamento salvo.</div>
        <button
          v-for="closing in closings"
          :key="closing.id"
          class="ds-list-row text-left p-4 cursor-pointer"
          :class="{ 'ds-list-row-active': selectedClosing?.id === closing.id }"
          @click="selectClosing(closing)"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-medium text-gray-900 dark:text-gray-100">{{ formatMonth(closing) }}</p>
              <p class="text-xs ds-muted">{{ formatDate(closing.closedAt) }}</p>
              <p class="text-xs ds-subtle">{{ closing.closedByName || '-' }}</p>
            </div>
            <button
              v-if="isAdmin"
              class="ds-chip hover:text-red-500 cursor-pointer"
              @click.stop="handleDelete(closing.id)"
            >
              {{ deletingId === closing.id ? 'Confirmar' : 'Excluir' }}
            </button>
          </div>
        </button>
      </section>

      <section v-if="selectedClosing" class="ds-page-stack">
        <div class="ds-panel p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="ds-page-kicker">Fechamento selecionado</p>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ formatMonth(selectedClosing) }}</h2>
              <p class="text-sm ds-muted">Salvo em {{ formatDate(selectedClosing.closedAt) }}</p>
              <p class="mt-1 text-xs ds-subtle">
                O estoque deste fechamento representa o saldo no fim do mês selecionado
                <span v-if="selectedClosing.summary?.closedThrough">({{ formatDateOnly(selectedClosing.summary.closedThrough) }})</span>,
                reconstruído pelas movimentações.
              </p>
            </div>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <button
                class="inline-flex items-center gap-1.5 rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 cursor-pointer"
                title="Baixar detalhamento do fechamento em CSV"
                :disabled="exporting"
                @click="handleExportDetails"
              >
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {{ exporting ? 'Exportando...' : 'Baixar CSV detalhado' }}
              </button>
            </div>
          </div>
          <p v-if="selectedClosing.notes" class="mt-3 text-sm ds-muted">{{ selectedClosing.notes }}</p>
        </div>

        <div class="ds-metric-grid">
          <div class="ds-metric">
            <p class="ds-metric-label">Entradas no mês</p>
            <p class="ds-metric-value text-green-500">{{ selectedClosing.summary?.monthEntradas || 0 }}</p>
          </div>
          <div class="ds-metric">
            <p class="ds-metric-label">Saídas no mês</p>
            <p class="ds-metric-value text-red-500">{{ selectedClosing.summary?.monthSaidas || 0 }}</p>
          </div>
          <div class="ds-metric">
            <p class="ds-metric-label">Sem estoque no fim</p>
            <p class="ds-metric-value text-red-500">{{ selectedClosing.summary?.zeroStock || 0 }}</p>
          </div>
          <div class="ds-metric">
            <p class="ds-metric-label">Abaixo do mínimo no fim</p>
            <p class="ds-metric-value text-amber-500">{{ selectedClosing.summary?.belowMin || 0 }}</p>
          </div>
        </div>

        <section class="ds-list-panel">
          <div class="p-4 border-b border-gray-200 dark:border-gray-800">
            <h2 class="ds-section-heading">Itens em atenção no fim do mês</h2>
          </div>
          <div v-if="!attentionRows.length" class="p-4 text-sm ds-muted">Nenhum item critico neste fechamento.</div>
          <div v-for="row in attentionRows" :key="row.variationId" class="ds-list-row p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium text-gray-900 dark:text-gray-100 truncate">{{ row.itemName }}</p>
                <p class="text-xs ds-muted truncate">{{ row.group }} / {{ row.category }} / {{ row.subcategory }}</p>
                <p class="text-xs ds-subtle truncate">{{ variationText(row) }}</p>
              </div>
              <span class="ds-chip">{{ row.stockAtClose }} {{ row.unit }}</span>
            </div>
          </div>
        </section>
      </section>

      <section v-else class="ds-panel p-8 text-center ds-muted">
        Selecione ou salve um fechamento para ver os detalhes.
      </section>
    </div>

    <AppModal
      :visible="previewOpen"
      :title="`Confirmar fechamento ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`"
      :confirm-loading="loading"
      :confirm-disabled="!preview"
      :persistent="loading"
      @close="previewOpen = false"
      @confirm="handleCreate"
    >
      <div v-if="preview" class="space-y-4">
        <p v-if="existingPeriodClosing" class="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          Este período já foi fechado em {{ formatDate(existingPeriodClosing.closedAt) }}. Confirmar substituirá a fotografia existente.
        </p>
        <div class="grid grid-cols-2 gap-2">
          <div class="ds-metric"><p class="ds-metric-label">Entradas</p><p class="ds-metric-value text-green-500">{{ preview.monthEntradas }}</p></div>
          <div class="ds-metric"><p class="ds-metric-label">Saídas</p><p class="ds-metric-value text-red-500">{{ preview.monthSaidas }}</p></div>
          <div class="ds-metric"><p class="ds-metric-label">Sem estoque</p><p class="ds-metric-value text-red-500">{{ preview.zeroStock }}</p></div>
          <div class="ds-metric"><p class="ds-metric-label">Abaixo do mínimo</p><p class="ds-metric-value text-amber-500">{{ preview.belowMin }}</p></div>
        </div>
        <div
          v-if="previewIssueCount"
          class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-100"
        >
          <p class="font-semibold">{{ previewIssueCount }} inconsistência(s) para revisar</p>
          <ul class="mt-2 space-y-1">
            <li>Saldo negativo: {{ preview.inconsistencies?.negativeStock || 0 }}</li>
            <li>Cálculo de saldo divergente: {{ preview.inconsistencies?.movementMath || 0 }}</li>
            <li>Movimentações com responsável, destino ou fornecedor incompleto: {{ preview.inconsistencies?.partialMovements || 0 }}</li>
          </ul>
        </div>
        <dl class="grid grid-cols-2 gap-2 text-xs ds-muted">
          <div><dt>Movimentações</dt><dd class="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">{{ preview.movementCount }}</dd></div>
          <div><dt>Materiais</dt><dd class="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">{{ preview.items }}</dd></div>
          <div><dt>Variações</dt><dd class="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">{{ preview.variations }}</dd></div>
          <div><dt>Último fechamento</dt><dd class="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">{{ formatMonth(closings[0]) }}</dd></div>
        </dl>
        <p class="text-xs ds-subtle">O fechamento será reconstruído pelas movimentações registradas até o fim do período.</p>
      </div>
      <template #confirmLabel>{{ existingPeriodClosing ? 'Substituir fechamento' : 'Confirmar fechamento' }}</template>
    </AppModal>
  </div>
</template>
