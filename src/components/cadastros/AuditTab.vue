<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import AppButton from '../ui/AppButton.vue'
import EmptyState from '../ui/EmptyState.vue'
import { getMovementAuditPage } from '../../services/api.js'

const filters = reactive({ q: '', action: '', from: '', to: '' })
let applied = { ...filters }
const entries = ref([])
const page = ref(1)
const pageSize = 25
const total = ref(0)
const loading = ref(true)
const error = ref('')
let request = 0
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const hasFilters = computed(() => Object.values(filters).some(Boolean))
const actions = { update: 'Correção', delete: 'Exclusão', recalculate: 'Recálculo do saldo' }
const labels = { qty: 'Quantidade', date: 'Data da movimentação', supplier: 'Fornecedor', unit_cost: 'Custo unitário',
  requested_by: 'Responsável', destination: 'Destino', doc_ref: 'Documento', note: 'Observação',
  stock_before: 'Saldo anterior', stock_after: 'Saldo após', item_name: 'Material',
  variation_values: 'Atributos', variation_extras: 'Informações adicionais' }

function presentValue(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (key === 'date') return formatDate(value)
  if (key === 'variation_values' || key === 'variation_extras') {
    try { return Object.entries(JSON.parse(value)).map(([name, content]) => `${name}: ${content}`).join(', ') || '—' } catch { return String(value) }
  }
  return typeof value === 'number' ? value.toLocaleString('pt-BR') : String(value)
}
function changes(entry) {
  return Object.entries(labels).filter(([key]) => entry.after && entry.before[key] !== entry.after[key])
    .map(([key, label]) => ({ key, label, before: presentValue(key, entry.before[key]), after: presentValue(key, entry.after[key]) }))
}
function formatDate(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR') : '—'
}
function queryDate(value, nextDay = false) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (nextDay) date.setDate(date.getDate() + 1)
  return date.toISOString()
}
async function load(targetPage = page.value) {
  const id = ++request
  loading.value = true
  error.value = ''
  try {
    const result = await getMovementAuditPage({ page: targetPage, pageSize, q: applied.q.trim(), action: applied.action,
      from: queryDate(applied.from), to: queryDate(applied.to, true) })
    if (id !== request) return
    const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
    if (targetPage > lastPage) return load(lastPage)
    entries.value = result.items
    total.value = result.total
    page.value = result.page
  } catch (e) {
    if (id === request) error.value = e.message
  } finally { if (id === request) loading.value = false }
}
function applyFilters() {
  if (filters.from && filters.to && filters.from > filters.to) {
    error.value = 'A data inicial deve ser anterior ou igual à data final.'
    return
  }
  applied = { ...filters }
  load(1)
}
function clearFilters() {
  Object.assign(filters, { q: '', action: '', from: '', to: '' })
  applied = { ...filters }
  load(1)
}
onMounted(() => load())
onBeforeUnmount(() => { request++ })
</script>

<template>
  <section aria-label="Auditoria de movimentações" class="audit-tab space-y-4 min-w-0">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="ds-page-title">Auditoria</h1>
        <p class="ds-page-subtitle">Consulte correções, exclusões e recálculos de saldo das movimentações.</p>
      </div>
      <AppButton variant="secondary" :disabled="loading" @click="load()">Atualizar</AppButton>
    </header>

    <form class="ds-panel p-4 space-y-3" aria-label="Filtros da auditoria" @submit.prevent="applyFilters">
      <div class="audit-filters">
        <label class="block min-w-0 text-sm">
          <span class="block mb-1 font-medium">Buscar na auditoria</span>
          <input v-model="filters.q" type="search" maxlength="200" class="ds-input" placeholder="Material, operador, documento ou motivo" />
        </label>
        <div class="min-w-0 text-sm">
          <label for="audit-action" class="block mb-1 font-medium">Ação</label>
          <select id="audit-action" v-model="filters.action" class="ds-input">
            <option value="">Todas as ações</option>
            <option v-for="(label, key) in actions" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
        <label class="block min-w-0 text-sm">
          <span class="block mb-1 font-medium">Data inicial</span>
          <input v-model="filters.from" type="date" class="ds-input" />
        </label>
        <label class="block min-w-0 text-sm">
          <span class="block mb-1 font-medium">Data final</span>
          <input v-model="filters.to" type="date" class="ds-input" />
        </label>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <AppButton v-if="hasFilters" variant="ghost" @click="clearFilters">Limpar filtros</AppButton>
        <AppButton type="submit" variant="primary" :loading="loading">Filtrar</AppButton>
      </div>
    </form>

    <p v-if="loading" role="status" class="py-8 text-center ds-muted">Carregando registros…</p>
    <div v-else-if="error" role="alert" class="ds-panel p-4 space-y-3">
      <p>{{ error }}</p>
      <AppButton variant="secondary" @click="load()">Tentar novamente</AppButton>
    </div>
    <template v-else>
      <p role="status" class="text-sm ds-muted">{{ total }} {{ total === 1 ? 'registro encontrado' : 'registros encontrados' }}</p>
      <EmptyState v-if="!entries.length" title="Nenhum registro encontrado."
        :text="hasFilters ? 'Ajuste os filtros para consultar outro período ou ação.' : 'As correções e exclusões aparecerão aqui após serem registradas.'" />
      <div v-else class="ds-panel overflow-x-auto">
        <table class="audit-table ds-table w-full text-left text-sm">
          <caption class="sr-only">Registros de auditoria das movimentações</caption>
          <thead>
            <tr>
              <th scope="col" class="px-4 py-3">Data e operador</th>
              <th scope="col" class="px-4 py-3">Ação</th>
              <th scope="col" class="px-4 py-3">Material</th>
              <th scope="col" class="px-4 py-3">Motivo e detalhes</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in entries" :key="entry.id" class="align-top">
              <td data-label="Data e operador" class="px-4 py-3 whitespace-nowrap">
                <time :datetime="entry.createdAt">{{ formatDate(entry.createdAt) }}</time>
                <p class="mt-1 text-xs ds-muted">{{ entry.operatorName || 'Operação do sistema' }}</p>
              </td>
              <td data-label="Ação" class="px-4 py-3 whitespace-nowrap">{{ actions[entry.action] || entry.action }}</td>
              <td data-label="Material" class="px-4 py-3 min-w-40">
                <p class="font-medium">{{ entry.before.item_name || entry.before.item_id }}</p>
                <p v-if="entry.before.doc_ref" class="mt-1 text-xs ds-muted">{{ entry.before.doc_ref }}</p>
              </td>
              <td data-label="Motivo e detalhes" class="px-4 py-3 min-w-64">
                <p class="break-words">{{ entry.reason || 'Motivo não informado.' }}</p>
                <details class="mt-2">
                  <summary class="cursor-pointer font-medium underline underline-offset-4 focus-visible:outline">Ver detalhes</summary>
                  <div v-if="entry.action === 'delete'" class="mt-3 space-y-1 text-sm">
                    <p>Registro original preservado.</p>
                    <p>{{ entry.before.type === 'entrada' ? 'Entrada' : 'Saída' }} de {{ presentValue('qty', entry.before.qty) }} {{ entry.before.item_unit }}</p>
                    <p>Movimentação em {{ formatDate(entry.before.date) }}</p>
                    <p v-if="entry.before.requested_by">Responsável: {{ entry.before.requested_by }}</p>
                    <p v-if="entry.before.destination">Destino: {{ entry.before.destination }}</p>
                    <p v-if="entry.before.note">Observação: {{ entry.before.note }}</p>
                  </div>
                  <dl v-else class="mt-3 space-y-2">
                    <div v-for="change in changes(entry)" :key="change.key">
                      <dt class="text-xs ds-muted">{{ change.label }}</dt>
                      <dd class="break-words">{{ change.before }} → {{ change.after }}</dd>
                    </div>
                  </dl>
                </details>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav v-if="total > pageSize" aria-label="Páginas da auditoria" class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm ds-muted">Página {{ page }} de {{ totalPages }}</p>
        <div class="flex gap-2">
          <AppButton variant="secondary" :disabled="page <= 1" @click="load(page - 1)">Anterior</AppButton>
          <AppButton variant="secondary" :disabled="page >= totalPages" @click="load(page + 1)">Próxima</AppButton>
        </div>
      </nav>
    </template>
    <p class="text-xs ds-muted">Os registros começam na ativação da auditoria.</p>
  </section>
</template>

<style scoped>
.audit-filters { display: grid; grid-template-columns: minmax(220px, 2fr) repeat(3, minmax(130px, 1fr)); gap: 12px; align-items: end; }
@media (max-width: 960px) { .audit-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .audit-filters { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 640px) {
  .audit-table, .audit-table tbody { display: block; width: 100%; }
  .audit-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .audit-table tbody tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .audit-table tbody tr + tr { border-top: 1px solid var(--ds-border); }
  .audit-table td { display: block; min-width: 0; white-space: normal; }
  .audit-table td:nth-child(n+3) { grid-column: 1 / -1; }
  .audit-table td::before { content: attr(data-label); display: block; margin-bottom: 6px; font-size: 11px; color: var(--ds-text-muted); }
}
</style>
