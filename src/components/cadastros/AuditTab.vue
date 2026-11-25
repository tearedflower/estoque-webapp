<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import EmptyState from '../ui/EmptyState.vue'
import { getMovementAuditPage } from '../../services/api.js'

const filters = reactive({ q: '', action: '', from: '', to: '' })
let applied = { ...filters }
const entries = ref([])
const selectedEntry = ref(null)
const page = ref(1)
const pageSize = 25
const total = ref(0)
const loading = ref(true)
const error = ref('')
let request = 0
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const hasFilters = computed(() => Object.values(filters).some(Boolean))
const actions = { update: 'Correção', delete: 'Exclusão', recalculate: 'Recálculo do saldo' }
const movementTypes = { entrada: 'Entrada', saida: 'Saída' }
const labels = { type: 'Tipo', qty: 'Quantidade', date: 'Data da movimentação', supplier: 'Fornecedor', unit_cost: 'Custo unitário',
  requested_by: 'Responsável', destination: 'Destino', doc_ref: 'Documento', note: 'Observação',
  stock_before: 'Saldo anterior', stock_after: 'Saldo após', item_name: 'Material',
  variation_values: 'Atributos', variation_extras: 'Informações adicionais' }

function presentValue(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (key === 'type') return movementTypes[value] || 'Não informado'
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
function originalFields(entry) {
  return Object.entries(labels).filter(([key]) => entry.before[key] !== null && entry.before[key] !== undefined && entry.before[key] !== '')
    .map(([key, label]) => ({ key, label: key === 'type' ? 'Tipo original' : label, value: presentValue(key, entry.before[key]) }))
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
              <th scope="col" class="px-4 py-3">Tipo</th>
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
              <td data-label="Tipo" class="px-4 py-3 whitespace-nowrap">
                <span v-if="entry.action !== 'delete'" class="audit-type" :class="{ 'audit-type-entry': entry.before.type === 'entrada', 'audit-type-exit': entry.before.type === 'saida' }">{{ movementTypes[entry.before.type] || 'Não informado' }}</span>
                <span v-else class="ds-muted">—</span>
              </td>
              <td data-label="Material" class="px-4 py-3 min-w-40">
                <p class="font-medium">{{ entry.before.item_name || entry.before.item_id }}</p>
                <p v-if="entry.before.item_unit" class="mt-1 text-xs ds-muted">Unidade: {{ entry.before.item_unit }}</p>
                <p v-if="entry.before.doc_ref" class="mt-1 text-xs ds-muted">{{ entry.before.doc_ref }}</p>
              </td>
              <td data-label="Motivo e detalhes" class="px-4 py-3 min-w-64">
                <p class="break-words">{{ entry.reason || 'Motivo não informado.' }}</p>
                <AppButton variant="secondary" size="sm" class="mt-2" aria-haspopup="dialog" @click="selectedEntry = entry">Ver detalhes</AppButton>
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
    <AppDialog :visible="!!selectedEntry" aria-label="Detalhes da auditoria" @close="selectedEntry = null">
      <div v-if="selectedEntry" class="audit-dialog ds-panel w-full max-w-3xl text-sm">
        <header class="audit-dialog-header">
          <h2 class="text-lg font-semibold">Detalhes da auditoria</h2>
          <AppButton variant="secondary" size="sm" @click="selectedEntry = null">Fechar</AppButton>
        </header>
        <div class="audit-dialog-body">
          <p class="text-base font-semibold break-words">{{ selectedEntry.before.item_name || selectedEntry.before.item_id }}</p>
          <dl class="audit-context">
            <div><dt>Ação</dt><dd>{{ actions[selectedEntry.action] || selectedEntry.action }}</dd></div>
            <div v-if="selectedEntry.action !== 'delete'"><dt>Tipo</dt><dd>{{ movementTypes[selectedEntry.before.type] || 'Não informado' }}</dd></div>
            <div><dt>Operador</dt><dd>{{ selectedEntry.operatorName || 'Operação do sistema' }}</dd></div>
            <div><dt>Data do registro</dt><dd><time :datetime="selectedEntry.createdAt">{{ formatDate(selectedEntry.createdAt) }}</time></dd></div>
          </dl>
          <div class="audit-reason">
            <h3 class="font-semibold">Motivo</h3>
            <p class="mt-1 break-words">{{ selectedEntry.reason || 'Motivo não informado.' }}</p>
          </div>
          <div class="audit-detail-panel">
            <template v-if="selectedEntry.action === 'delete'">
              <div class="audit-detail-heading">
                <h3>Movimentação excluída</h3>
                <p class="ds-muted">Registro original preservado.</p>
              </div>
              <dl class="audit-original">
                <div v-for="field in originalFields(selectedEntry)" :key="field.key">
                  <dt>{{ field.label }}</dt>
                  <dd>{{ field.value }}</dd>
                </div>
              </dl>
            </template>
            <template v-else>
              <div class="audit-detail-heading">
                <h3>{{ selectedEntry.action === 'recalculate' ? 'Recálculo do saldo' : 'Alterações registradas' }}</h3>
                <p class="ds-muted">Compare os valores antes e depois da alteração.</p>
              </div>
              <template v-if="changes(selectedEntry).length">
                <div class="audit-comparison-head" aria-hidden="true">
                  <span>Campo</span><span>Antes</span><span>Depois</span>
                </div>
                <dl class="audit-comparison">
                  <div v-for="change in changes(selectedEntry)" :key="change.key" class="audit-change">
                    <dt>{{ change.label }}</dt>
                    <dd class="audit-value-before"><span class="audit-value-label">Antes</span><span>{{ change.before }}</span></dd>
                    <dd class="audit-value-after"><span class="audit-value-label">Depois</span><span>{{ change.after }}</span></dd>
                  </div>
                </dl>
              </template>
              <p v-else class="p-3 ds-muted">Nenhum campo alterado neste registro.</p>
            </template>
          </div>
        </div>
      </div>
    </AppDialog>
    <p class="text-xs ds-muted">Os registros começam na ativação da auditoria.</p>
  </section>
</template>

<style scoped>
.audit-type { display: inline-flex; align-items: center; padding: 3px 8px; border: 1px solid var(--ds-border); border-radius: var(--ds-radius-control); background: var(--ds-surface); font-size: 12px; font-weight: 600; }
.audit-type-entry { color: var(--ds-success); }
.audit-type-exit { color: var(--ds-danger); }
.audit-dialog { display: flex; flex-direction: column; max-height: calc(100dvh - 2rem); overflow: hidden; }
.audit-dialog-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--ds-border); }
.audit-dialog-body { min-height: 0; overflow-y: auto; padding: 20px; }
.audit-context { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 20px; margin: 16px 0; }
.audit-context dt { color: var(--ds-text-muted); font-size: 12px; }
.audit-context dd { margin-top: 4px; overflow-wrap: anywhere; }
.audit-reason { padding: 12px; background: var(--ds-surface); border-radius: var(--ds-radius-control); }
.audit-detail-panel { margin-top: 10px; overflow: hidden; border: 1px solid var(--ds-border); border-radius: var(--ds-radius-control); background: var(--ds-panel); }
.audit-detail-heading { padding: 12px; border-bottom: 1px solid var(--ds-border); }
.audit-detail-heading h3 { font-size: 13px; font-weight: 600; }
.audit-detail-heading p { margin-top: 4px; font-size: 12px; }
.audit-comparison-head, .audit-change { display: grid; grid-template-columns: minmax(90px, 0.9fr) repeat(2, minmax(0, 1fr)); }
.audit-comparison-head { background: var(--ds-surface); color: var(--ds-text-muted); font-size: 12px; font-weight: 600; }
.audit-comparison-head > span, .audit-change > * { min-width: 0; padding: 10px 12px; overflow-wrap: anywhere; }
.audit-change + .audit-change { border-top: 1px solid var(--ds-border-subtle); }
.audit-change dt { font-size: 12px; font-weight: 500; }
.audit-change dd { font-variant-numeric: tabular-nums; }
.audit-value-before { color: var(--ds-text-muted); }
.audit-value-after { background: var(--ds-surface); font-weight: 600; }
.audit-value-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.audit-original > div { display: grid; grid-template-columns: minmax(90px, 0.9fr) minmax(0, 2fr); gap: 12px; padding: 10px 12px; }
.audit-original > div + div { border-top: 1px solid var(--ds-border-subtle); }
.audit-original dt { color: var(--ds-text-muted); font-size: 12px; }
.audit-original dd { overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
@media (max-width: 560px) {
  .audit-dialog-header, .audit-dialog-body { padding: 12px; }
  .audit-comparison-head { display: none; }
  .audit-change { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .audit-change dt { grid-column: 1 / -1; padding-bottom: 4px; }
  .audit-value-label { position: static; display: block; width: auto; height: auto; margin-bottom: 4px; overflow: visible; clip-path: none; color: var(--ds-text-muted); font-size: 11px; font-weight: 400; }
}

.audit-filters { display: grid; grid-template-columns: minmax(220px, 2fr) repeat(3, minmax(130px, 1fr)); gap: 12px; align-items: end; }
@media (max-width: 960px) { .audit-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .audit-filters { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 640px) {
  .audit-table, .audit-table tbody { display: block; width: 100%; }
  .audit-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .audit-table tbody tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .audit-table tbody tr + tr { border-top: 1px solid var(--ds-border); }
  .audit-table td { display: block; min-width: 0; white-space: normal; }
  .audit-table td:first-child { grid-column: 1 / -1; }
  .audit-table td:nth-child(n+4) { grid-column: 1 / -1; }
  .audit-table td::before { content: attr(data-label); display: block; margin-bottom: 6px; font-size: 11px; color: var(--ds-text-muted); }
}
</style>
