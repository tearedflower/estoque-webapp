<script setup>
import { computed, onMounted, ref } from 'vue'
import { readSheet } from 'read-excel-file/browser'
import { useItems } from '../../composables/useItems.js'
import { useMovements } from '../../composables/useMovements.js'
import { usePeople } from '../../composables/usePeople.js'
import { useToast } from '../../composables/useToast.js'
import * as api from '../../services/api.js'
import {
  buildCatalogChoices,
  buildFormerPeople,
  normalizeImportText,
  parseMovementWorkbookSheets,
  rankVariationChoices,
  searchCatalogChoices,
  suggestVariation,
} from '../../utils/movementSpreadsheetImport.js'
import AppButton from '../ui/AppButton.vue'
import EmptyState from '../ui/EmptyState.vue'

const { items, variations, loadData: loadItems } = useItems()
const { loadData: loadMovements } = useMovements()
const { people, loadData: loadPeople } = usePeople()
const { success, error } = useToast()

const fileInput = ref(null)
const reading = ref(false)
const importing = ref(false)
const updateExisting = ref(false)
const fileName = ref('')
const review = ref(null)
const savedMappings = ref([])
const mappings = ref({})
const mappingLabels = ref({})
const activeMappingKey = ref('')

const choices = computed(() => buildCatalogChoices(items.value, variations.value))
const choiceById = computed(() => new Map(choices.value.map(choice => [choice.variationId, choice])))
const minimumBySource = computed(() => new Map(
  (review.value?.minimumMatches || []).map(row => [normalizeImportText(row.sourceName), row])
))

const sourceGroups = computed(() => {
  const groups = new Map()
  for (const row of review.value?.rows || []) {
    const key = normalizeImportText(row.sourceName)
    const current = groups.get(key)
    if (current) current.count += 1
    else groups.set(key, {
      key,
      sourceName: row.sourceName,
      unit: row.unit,
      count: 1,
      minimum: minimumBySource.value.get(key),
    })
  }
  return [...groups.values()].sort((a, b) => a.sourceName.localeCompare(b.sourceName, 'pt-BR', { sensitivity: 'base', numeric: true }))
})

const unresolved = computed(() => sourceGroups.value.filter(group => !choiceById.value.has(mappings.value[group.key])))
const resolvedGroups = computed(() => sourceGroups.value.filter(group => choiceById.value.has(mappings.value[group.key])))
const resolvedCount = computed(() => sourceGroups.value.length - unresolved.value.length)
const activeMappingGroup = computed(() => unresolved.value.find(group => group.key === activeMappingKey.value))
const activeMappingResults = computed(() => {
  const group = activeMappingGroup.value
  if (!group) return []
  const query = mappingLabels.value[group.key]
  if (normalizeImportText(query)) {
    return searchCatalogChoices(query, choices.value, {
      sourceName: group.sourceName,
      unit: group.unit,
    })
  }
  return rankVariationChoices(group.sourceName, group.unit, choices.value)
    .filter(result => result.score > 0)
    .slice(0, 6)
    .map(result => result.choice)
})
const formerPeople = computed(() => review.value
  ? buildFormerPeople(review.value.rows, people.value, review.value.people)
  : [])
const formerAliasCount = computed(() => formerPeople.value.reduce((total, person) => total + person.aliases.length, 0))
const invalidStock = computed(() => (review.value?.stockRows || []).filter(row => row.stock < 0))
const invalidMinimumStocks = computed(() => (review.value?.minimumMatches || []).filter(row =>
  row.status === 'invalid' || row.status === 'missing'
))
const minimumSummary = computed(() => {
  const rows = review.value?.minimumMatches || []
  return {
    positive: rows.filter(row => row.status === 'valid' && row.minStock > 0).length,
    zero: rows.filter(row => row.status === 'valid' && row.minStock === 0).length,
    blank: rows.filter(row => row.status === 'blank').length,
    invalid: invalidMinimumStocks.value.length,
  }
})
const validMinimumCount = computed(() => minimumSummary.value.positive + minimumSummary.value.zero)
const invalidSpreadsheetValues = computed(() => [
  ...invalidStock.value.map(row => ({
    key: `stock-${row.rowNumber}-${row.sourceName}`,
    sourceName: row.sourceName,
    field: 'Saldo',
    value: `${row.stock} ${row.unit || ''}`.trim(),
  })),
  ...invalidMinimumStocks.value.map(row => ({
    key: `minimum-${row.rowNumber || 'missing'}-${row.sourceName}`,
    sourceName: row.sourceName,
    field: 'Mínimo',
    value: row.status === 'missing' ? 'Produto não localizado em CADASTROS' : String(row.rawMinimum ?? ''),
  })),
])
const ignoredSummary = computed(() => {
  const result = new Map()
  for (const row of review.value?.ignored || []) result.set(row.reason, (result.get(row.reason) || 0) + 1)
  return [...result.entries()].map(([reason, count]) => ({ reason, count }))
})
const balanceDifferences = computed(() => {
  const stockByName = new Map((review.value?.stockRows || []).map(row => [normalizeImportText(row.sourceName), row]))
  return sourceGroups.value.flatMap(group => {
    const stockRow = stockByName.get(group.key)
    const choice = choiceById.value.get(mappings.value[group.key])
    if (!stockRow || !choice) return []
    return [{
      sourceName: group.sourceName,
      spreadsheetStock: stockRow.stock,
      systemStock: choice.stock,
      difference: stockRow.stock - choice.stock,
    }]
  }).filter(row => row.difference !== 0)
})

onMounted(async () => {
  try {
    savedMappings.value = await api.getMovementImportMappings()
  } catch (cause) {
    error(cause.message || 'Não foi possível carregar as associações salvas.')
  }
})

function openFilePicker() {
  fileInput.value?.click()
}

function applyInitialMappings() {
  const persisted = new Map(savedMappings.value.map(row => [row.nameKey, row.variationId]))
  const nextMappings = {}
  const nextLabels = {}
  for (const group of sourceGroups.value) {
    const persistedChoice = choiceById.value.get(persisted.get(group.key))
    const suggested = persistedChoice || suggestVariation(group.sourceName, group.unit, choices.value)
    if (!suggested) continue
    nextMappings[group.key] = suggested.variationId
    nextLabels[group.key] = suggested.label
  }
  mappings.value = nextMappings
  mappingLabels.value = nextLabels
}

async function readFile(event) {
  const file = event.target.files?.[0]
  if (!file || reading.value) return
  if (file.size > 30 * 1024 * 1024) {
    error('A planilha deve ter no máximo 30 MB.')
    event.target.value = ''
    return
  }

  reading.value = true
  review.value = null
  fileName.value = file.name
  try {
    const sheets = []
    for (const sheet of ['LANÇAR - ENTRADA', 'LANÇAR - SAÍDA', 'ESTOQUE', 'CADASTROS', 'Nomes e Cargos']) {
      sheets.push({ sheet, data: await readSheet(file, sheet) })
    }
    review.value = parseMovementWorkbookSheets(sheets)
    updateExisting.value = false
    applyInitialMappings()
  } catch (cause) {
    fileName.value = ''
    error(cause.message || 'Não foi possível ler essa planilha.')
  } finally {
    reading.value = false
    event.target.value = ''
  }
}

function selectMapping(group, choice) {
  const next = { ...mappings.value }
  if (choice) next[group.key] = choice.variationId
  else delete next[group.key]
  mappings.value = next
  mappingLabels.value = { ...mappingLabels.value, [group.key]: choice?.label || '' }
  activeMappingKey.value = ''
}

function selectOnlyMapping(group) {
  if (activeMappingResults.value.length === 1) selectMapping(group, activeMappingResults.value[0])
}

function clearMapping(group) {
  const next = { ...mappings.value }
  delete next[group.key]
  mappings.value = next
  mappingLabels.value = { ...mappingLabels.value, [group.key]: '' }
}

async function confirmImport() {
  if (!review.value || unresolved.value.length || importing.value) return
  importing.value = true
  try {
    const result = await api.importMovementHistory({
      updateExisting: updateExisting.value,
      rows: review.value.rows,
      mappings: sourceGroups.value.map(group => ({
        sourceName: group.sourceName,
        variationId: mappings.value[group.key],
      })),
      formerPeople: formerPeople.value,
      minimumStocks: sourceGroups.value.flatMap(group =>
        group.minimum?.status === 'valid'
          ? [{ sourceName: group.sourceName, minStock: group.minimum.minStock }]
          : []
      ),
    })
    await Promise.all([loadMovements(), loadPeople(), loadItems()])
    success([
      `${result.movementsCreated} movimentação(ões) importada(s).`,
      result.movementsUpdated ? `${result.movementsUpdated} atualizada(s).` : '',
      result.movementsSkipped ? `${result.movementsSkipped} já existiam.` : '',
      result.peopleCreated ? `${result.peopleCreated} ex-funcionário(s) cadastrado(s) como inativo(s).` : '',
      result.minimumStocksUpdated ? `${result.minimumStocksUpdated} mínimo(s) atualizado(s).` : '',
    ].filter(Boolean).join(' '))
    savedMappings.value = sourceGroups.value.map(group => ({
      nameKey: group.key,
      sourceName: group.sourceName,
      variationId: mappings.value[group.key],
    }))
  } catch (cause) {
    error(cause.message || 'Não foi possível importar o histórico.')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Importação histórica</p>
          <h2 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">Entradas e saídas da planilha</h2>
          <p class="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Os produtos são associados pelo nome. Códigos são ignorados e o saldo atual é recalculado pelo histórico.
          </p>
        </div>
        <AppButton size="sm" :disabled="reading" @click="openFilePicker">
          {{ reading ? 'Lendo planilha...' : review ? 'Trocar planilha' : 'Escolher planilha' }}
        </AppButton>
        <input
          ref="fileInput"
          class="sr-only"
          type="file"
          accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
          @change="readFile"
        />
      </div>
      <p v-if="fileName" class="mt-3 text-xs font-medium text-gray-500 dark:text-gray-400">{{ fileName }}</p>
      <label v-if="review" class="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input v-model="updateExisting" type="checkbox" />
        Atualizar linhas que mudaram desde a última importação (com backup).
      </label>
    </div>

    <EmptyState
      v-if="!review && !reading"
      title="Nenhuma planilha selecionada"
      text="Escolha o arquivo do almoxarifado para montar a prévia. Nada será gravado nessa etapa."
    />

    <template v-if="review">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Movimentações válidas</p>
          <p class="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ review.rows.length }}</p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Produtos associados</p>
          <p class="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ resolvedCount }} / {{ sourceGroups.length }}</p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Ex-funcionários</p>
          <p class="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ formerPeople.length }}</p>
          <p v-if="formerAliasCount !== formerPeople.length" class="text-[11px] text-gray-400">{{ formerAliasCount }} nomes consolidados</p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="minimumSummary.invalid ? 'border-amber-500/40 bg-amber-500/10' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'"
        >
          <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Mínimos da planilha</p>
          <p class="mt-1 text-xl font-semibold tabular-nums" :class="minimumSummary.invalid ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-gray-100'">
            {{ validMinimumCount }}
          </p>
          <p class="text-[11px] text-gray-400">
            {{ minimumSummary.positive }} positivos · {{ minimumSummary.zero }} zerados · {{ minimumSummary.blank }} vazios
          </p>
        </div>
        <div class="rounded-lg border p-3" :class="invalidStock.length ? 'border-amber-500/40 bg-amber-500/10' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Saldos inválidos</p>
          <p class="mt-1 text-xl font-semibold tabular-nums" :class="invalidStock.length ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-gray-100'">{{ invalidStock.length }}</p>
        </div>
      </div>

      <section v-if="unresolved.length" class="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
        <div class="mb-3">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Resolver {{ unresolved.length }} produto(s)</h3>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Escolha a variação cadastrada. A decisão será reutilizada nas próximas importações.</p>
        </div>
        <div
          class="max-h-[34rem] space-y-2 overflow-y-auto pr-1"
          :class="activeMappingKey ? 'pb-64' : ''"
        >
          <div
            v-for="group in unresolved"
            :key="group.key"
            class="relative grid gap-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,1.2fr)] lg:items-center"
            :class="activeMappingKey === group.key ? 'z-20' : 'z-0'"
          >
            <div class="relative min-w-0">
              <p class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{{ group.sourceName }}</p>
              <p class="mt-0.5 text-xs text-gray-400">{{ group.count }} ocorrência(s) · {{ group.unit || 'sem unidade' }}</p>
            </div>
            <div class="relative min-w-0">
              <input
                v-model="mappingLabels[group.key]"
                type="search"
                role="combobox"
                autocomplete="off"
                aria-controls="movement-import-results"
                :aria-expanded="activeMappingKey === group.key"
                placeholder="Buscar por nome, medida, marca..."
                class="h-10 w-full rounded-md border border-gray-300 bg-gray-50 px-3 text-sm text-gray-800 outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                @focus="activeMappingKey = group.key"
                @keydown.enter.prevent="selectOnlyMapping(group)"
                @keydown.escape="activeMappingKey = ''"
              />
              <div
                v-if="activeMappingKey === group.key"
                id="movement-import-results"
                class="ds-menu absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto p-1"
                role="listbox"
              >
                <p class="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {{ normalizeImportText(mappingLabels[group.key]) ? 'Resultados da busca' : 'Melhores sugestões' }}
                </p>
                <button
                  v-for="choice in activeMappingResults"
                  :key="choice.variationId"
                  type="button"
                  role="option"
                  class="ds-menu-item text-sm"
                  @click="selectMapping(group, choice)"
                >
                  {{ choice.label }}
                </button>
                <p v-if="!activeMappingResults.length" class="px-3 py-3 text-sm text-gray-400">
                  Nenhum resultado. Tente menos palavras.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <details v-if="resolvedGroups.length" class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <summary class="cursor-pointer text-sm font-semibold text-gray-800 dark:text-gray-200">
          Revisar {{ resolvedGroups.length }} associação(ões) já resolvida(s)
        </summary>
        <div class="mt-3 max-h-80 divide-y divide-gray-200 overflow-y-auto dark:divide-gray-700">
          <div v-for="group in resolvedGroups" :key="group.key" class="flex items-center gap-3 py-2">
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium text-gray-800 dark:text-gray-200">{{ group.sourceName }}</p>
              <p class="truncate text-[11px] text-gray-400">{{ choiceById.get(mappings[group.key])?.label }}</p>
            </div>
            <AppButton size="xs" variant="ghost" @click="clearMapping(group)">Alterar</AppButton>
          </div>
        </div>
      </details>

      <section v-if="formerPeople.length" class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Pessoas que serão cadastradas como inativas</h3>
        <div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <div v-for="person in formerPeople" :key="person.name" class="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ person.name }}</p>
            <p class="text-xs text-gray-400">{{ person.role || 'Cargo não informado' }}</p>
            <p v-if="person.aliases.length > 1" class="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{{ person.aliases.length }} grafias unificadas</p>
          </div>
        </div>
      </section>

      <section v-if="invalidSpreadsheetValues.length" class="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
        <h3 class="text-sm font-semibold text-amber-800 dark:text-amber-200">Valores inválidos encontrados</h3>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Eles são exibidos para conferência e não serão importados.</p>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full min-w-[32rem] text-left text-sm">
            <thead class="text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th class="pb-2 font-semibold">Produto</th>
                <th class="pb-2 font-semibold">Campo</th>
                <th class="pb-2 text-right font-semibold">Valor da planilha</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="row in invalidSpreadsheetValues" :key="row.key">
                <td class="py-2 pr-4 text-gray-800 dark:text-gray-200">{{ row.sourceName }}</td>
                <td class="py-2 pr-4 text-gray-500 dark:text-gray-400">{{ row.field }}</td>
                <td class="py-2 text-right font-semibold tabular-nums text-amber-700 dark:text-amber-300">{{ row.value }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <details v-if="balanceDifferences.length || ignoredSummary.length" class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <summary class="cursor-pointer text-sm font-semibold text-gray-800 dark:text-gray-200">Conferência adicional</summary>
        <div class="mt-3 grid gap-4 lg:grid-cols-2">
          <div v-if="balanceDifferences.length">
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">Diferenças de saldo</p>
            <div class="mt-2 max-h-64 space-y-1 overflow-y-auto">
              <p v-for="row in balanceDifferences" :key="row.sourceName" class="flex justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span class="truncate">{{ row.sourceName }}</span>
                <span class="shrink-0 tabular-nums">Planilha {{ row.spreadsheetStock }} · Sistema {{ row.systemStock }}</span>
              </p>
            </div>
          </div>
          <div v-if="ignoredSummary.length">
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">Linhas ignoradas</p>
            <p v-for="row in ignoredSummary" :key="row.reason" class="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{{ row.reason }}</span><span class="tabular-nums">{{ row.count }}</span>
            </p>
          </div>
        </div>
      </details>

      <div class="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{ unresolved.length ? `Faltam ${unresolved.length} associações.` : `Pronto para importar o histórico e ${validMinimumCount} mínimo(s).` }}
        </p>
        <AppButton size="sm" :disabled="Boolean(unresolved.length) || importing" @click="confirmImport">
          {{ importing ? 'Importando...' : `Importar ${review.rows.length} movimentações` }}
        </AppButton>
      </div>
    </template>
  </section>
</template>
