<script setup>
import { computed, ref, watch } from 'vue'
import { useItems } from '../../composables/useItems.js'
import { matchesSearchTokens, searchTokens } from '../../utils/globalSearch.js'
import { variationSetupIssues } from '../../utils/variationForm.js'
import VariationSheet from '../ui/VariationSheet.vue'

const { items, variations } = useItems()
const search = ref('')
const statusFilter = ref(['all'])
const currentPage = ref(1)
const pageSize = ref(20)
const selectedVariationId = ref('')
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

const issueLabels = {
  minStock: 'Sem estoque mínimo',
  location: 'Sem local',
  destination: 'Sem destino',
}

const itemById = computed(() => new Map(items.value.map(item => [item.id, item])))
const pendingRows = computed(() => variations.value
  .map(variation => {
    const item = itemById.value.get(variation.itemId)
    const issues = item ? variationSetupIssues(item, variation) : []
    return item && issues.length ? { item, variation, issues } : null
  })
  .filter(Boolean)
  .sort((a, b) =>
    collator.compare(a.item.group, b.item.group) ||
    collator.compare(a.item.category, b.item.category) ||
    collator.compare(a.item.name, b.item.name) ||
    collator.compare(variationLabel(a.variation), variationLabel(b.variation))
  ))

const statusOptions = computed(() => [
  { id: 'all', label: 'Todas', count: pendingRows.value.length },
  { id: 'minStock', label: 'Sem mínimo', count: pendingRows.value.filter(row => row.issues.includes('minStock')).length },
  { id: 'location', label: 'Sem local', count: pendingRows.value.filter(row => row.issues.includes('location')).length },
  { id: 'destination', label: 'Sem destino', count: pendingRows.value.filter(row => row.issues.includes('destination')).length },
])

const filteredRows = computed(() => {
  const tokens = searchTokens(search.value)
  return pendingRows.value.filter(row => {
    const statusMatches = statusFilter.value.includes('all') || row.issues.some(issue => statusFilter.value.includes(issue))
    if (!statusMatches) return false
    return !tokens.length || matchesSearchTokens([
      row.item.group,
      row.item.category,
      row.item.subcategory,
      row.item.name,
      variationLabel(row.variation),
    ].filter(Boolean).join(' '), tokens)
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)))
const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})
const selectedVariation = computed(() => variations.value.find(row => row.id === selectedVariationId.value) || null)
const selectedItem = computed(() => selectedVariation.value ? itemById.value.get(selectedVariation.value.itemId) || null : null)

watch([search, statusFilter, pageSize], () => { currentPage.value = 1 })
watch(totalPages, total => { if (currentPage.value > total) currentPage.value = total })

function variationLabel(variation) {
  const values = Object.entries({ ...(variation.values || {}), ...(variation.extras || {}) })
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => `${key}: ${value}`)
  return values.join(' · ') || 'Variação sem atributos'
}

function hierarchyLabel(item) {
  return [item.group, item.category, item.subcategory].filter(Boolean).join(' › ')
}

function isStatusSelected(id) {
  return statusFilter.value.includes(id)
}

function toggleStatus(id) {
  if (id === 'all') { statusFilter.value = ['all']; return }
  const selected = statusFilter.value.includes('all')
    ? []
    : statusFilter.value.filter(status => status !== id)
  if (!statusFilter.value.includes(id)) selected.push(id)
  statusFilter.value = selected.length ? selected : ['all']
}
</script>

<template>
  <section>
    <div class="mb-4 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div class="mb-3">
        <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">Pendências de materiais</h2>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Variações sem estoque mínimo, local ou destino. Ao corrigir, a linha sai da lista automaticamente.</p>
      </div>
      <div class="grid gap-2 xl:grid-cols-[minmax(14rem,1fr)_auto_6rem]">
        <input
          v-model="search"
          type="search"
          placeholder="Buscar material, modelo ou grupo..."
          class="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-primary-400 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <div role="group" class="flex min-h-10 flex-wrap items-center gap-1 rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-800" aria-label="Filtrar pendências">
          <button
            v-for="option in statusOptions"
            :key="option.id"
            type="button"
            class="min-h-8 rounded-md px-2.5 text-xs font-semibold transition-colors"
            :class="isStatusSelected(option.id)
              ? 'bg-primary-600 text-[var(--ds-primary-text)]'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100'"
            :aria-pressed="isStatusSelected(option.id)"
            @click="toggleStatus(option.id)"
          >
            {{ option.label }} <span class="tabular-nums opacity-70">({{ option.count }})</span>
          </button>
        </div>
        <select v-model.number="pageSize" aria-label="Itens por página" class="min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="40">40</option>
        </select>
      </div>
    </div>

    <div class="ds-table-wrap">
      <div v-if="paginatedRows.length" class="overflow-x-auto">
        <table class="ds-table min-w-[760px]">
          <thead class="bg-gray-50 dark:bg-gray-800/60">
            <tr class="border-b border-gray-200 dark:border-gray-700">
              <th class="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Material</th>
              <th class="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Variação</th>
              <th class="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pendências</th>
              <th class="w-28 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Ação</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedRows" :key="row.variation.id" class="border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50 dark:border-gray-700/50 dark:hover:bg-gray-800/40">
              <td class="px-4 py-3">
                <p class="font-semibold text-gray-800 dark:text-gray-100">{{ row.item.name }}</p>
                <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ hierarchyLabel(row.item) }}</p>
              </td>
              <td class="max-w-md px-4 py-3 text-gray-600 dark:text-gray-300">{{ variationLabel(row.variation) }}</td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="issue in row.issues" :key="issue" class="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{{ issueLabels[issue] }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-right">
                <button type="button" class="min-h-10 rounded-lg px-3 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-primary-300 dark:hover:bg-primary-900/20" @click="selectedVariationId = row.variation.id">Corrigir</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="pendingRows.length" class="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
        <p class="text-sm font-semibold">Nenhuma pendência encontrada.</p>
        <p class="mt-1 text-xs">Troque a busca ou os status selecionados.</p>
      </div>
      <div v-else class="px-6 py-12 text-center text-green-700 dark:text-green-400">
        <p class="text-sm font-semibold">Todos os materiais estão completos.</p>
        <p class="mt-1 text-xs opacity-80">Estoque mínimo, local e destino estão cadastrados em todas as variações.</p>
      </div>

      <div v-if="filteredRows.length" class="flex flex-col gap-2 border-t border-gray-200 bg-gray-50/70 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
        <span>Página {{ currentPage }} de {{ totalPages }} · {{ filteredRows.length }} pendência(s)</span>
        <div class="flex items-center gap-1">
          <button type="button" class="min-h-9 rounded-lg px-3 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700" :disabled="currentPage <= 1" @click="currentPage--">Anterior</button>
          <button type="button" class="min-h-9 rounded-lg px-3 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700" :disabled="currentPage >= totalPages" @click="currentPage++">Próxima</button>
        </div>
      </div>
    </div>

    <VariationSheet
      v-if="selectedItem && selectedVariation"
      :item="selectedItem"
      :variation="selectedVariation"
      can-edit-details
      initial-tab="edit"
      @close="selectedVariationId = ''"
    />
  </section>
</template>
