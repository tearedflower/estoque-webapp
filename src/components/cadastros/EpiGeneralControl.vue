<script setup>
import { computed, inject, ref } from 'vue'
import { useEpis } from '../../composables/useEpis.js'
import { useItems } from '../../composables/useItems.js'
import { useToast } from '../../composables/useToast.js'
import { epiPeriodGroups } from '../../utils/epiPeriodGroups.js'
import { normalizeSearchText } from '../../utils/globalSearch.js'
import AppDialog from '../ui/AppDialog.vue'

const emit = defineEmits(['open-role'])
const { roleRules, editRoleBatch } = useEpis()
const { items } = useItems()
const { success, error } = useToast()
const isLoggedIn = inject('isLoggedIn')
const canEdit = computed(() => !!isLoggedIn?.value)
const query = ref('')
const filter = ref('all')
const activity = ref('all')
const globalDays = ref('')
const groupDrafts = ref({})
const roleDrafts = ref({})
const quantityDrafts = ref({})
const roleQuantities = ref({})
const selectedGroupKey = ref(null)
const review = ref(null)
const saving = ref(false)
const groups = computed(() => epiPeriodGroups(roleRules.value, items.value))
const selectedGroup = computed(() => groups.value.find(group => group.key === selectedGroupKey.value))
const activeRules = computed(() => roleRules.value.filter(rule => rule.active))
const differentCount = computed(() => groups.value.filter(group => group.different).length)
const filtered = computed(() => {
  const search = normalizeSearchText(query.value)
  return groups.value.filter(group =>
    (activity.value !== 'active' || group.activeCount > 0) &&
    (activity.value !== 'inactive' || group.inactiveCount > 0) &&
    (!search || normalizeSearchText([group.name, group.category, ...group.rules.map(rule => rule.roleName)].join(' ')).includes(search)) &&
    (filter.value !== 'different' || group.different) &&
    (filter.value !== 'without' || group.periods.some(period => period.days === 0))
  )
})
const periodLabel = days => Number(days) === 0 ? 'Sem controle' : `${days} dias`
const validDays = value => value !== '' && value !== null && value !== undefined && Number.isSafeInteger(Number(value)) && Number(value) >= 0
const groupValue = group => groupDrafts.value[group.key] ?? (group.periods.length === 1 ? group.periods[0].days : '')
const roleValue = rule => roleDrafts.value[rule.id] ?? rule.days
const validQuantity = value => validDays(value) && Number(value) > 0
const quantityValue = group => quantityDrafts.value[group.key] ?? (group.quantities.length === 1 ? group.quantities[0] : '')
const roleQuantity = rule => roleQuantities.value[rule.id] ?? rule.quantity
const valueLabel = (field, value, unit = '') => field === 'days' ? periodLabel(value) : field === 'active' ? (value ? 'Ativo' : 'Inativo') : `${value} ${unit} por troca`.replace(/ +/g, ' ')
function prepare(rules, value, title, field = 'days', unit = '') {
  if (!canEdit.value || (field === 'days' && !validDays(value)) || (field === 'quantity' && !validQuantity(value))) return
  value = field === 'active' ? value : Number(value)
  const previous = `previous${field[0].toUpperCase()}${field.slice(1)}`
  const changes = rules.filter(rule => (field === 'active' || rule.active) && rule[field] !== value).map(rule => ({ id: rule.id, [field]: value, [previous]: rule[field] }))
  if (!changes.length) { success('Os vínculos já usam essa configuração.'); return }
  const ids = new Set(changes.map(change => change.id))
  review.value = { title, field, value, unit, changes, groups: groups.value.map(group => ({
    key: group.key, name: group.name, rules: group.rules.filter(rule => ids.has(rule.id)),
  })).filter(group => group.rules.length) }
}
async function save() {
  if (saving.value || !review.value) return
  saving.value = true
  try {
    const result = await editRoleBatch(review.value.changes)
    if (!result.ok) { error(result.error); return }
    for (const change of review.value.changes) { delete roleDrafts.value[change.id]; delete roleQuantities.value[change.id] }
    for (const group of review.value.groups) { delete groupDrafts.value[group.key]; delete quantityDrafts.value[group.key] }
    success(`${review.value.changes.length} vínculo(s) atualizado(s).`)
    review.value = null
  } finally { saving.value = false }
}
</script>

<template>
  <section class="space-y-3">
    <div class="ds-panel px-4 py-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Controle geral por EPI</h2>
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ groups.length }} EPIs · {{ activeRules.length }} vínculos ativos · {{ roleRules.length - activeRules.length }} inativos · {{ differentCount }} com prazos diferentes</p>
        </div>
        <div class="flex w-full flex-wrap gap-2 sm:w-auto">
          <input v-model="query" type="search" class="ds-input compact-input min-w-0 flex-1 sm:w-60" aria-label="Buscar EPI ou cargo" placeholder="Buscar EPI ou cargo..." />
          <select v-model="activity" class="ds-input compact-input w-auto" aria-label="Situação dos vínculos">
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="all">Todos</option>
          </select>
          <select v-model="filter" class="ds-input compact-input w-auto" aria-label="Filtrar periodicidades">
            <option value="all">Todos os EPIs</option>
            <option value="different">Prazos diferentes</option>
            <option value="without">Com cargos sem controle</option>
          </select>
        </div>
      </div>
      <details class="mt-2 border-t border-gray-200 pt-2 dark:border-gray-700">
        <summary class="cursor-pointer text-sm font-semibold text-gray-900 dark:text-gray-100">Definir um prazo para todos os EPIs</summary>
        <div class="mt-3 flex flex-wrap items-end gap-3">
          <label class="block"><span class="ds-label">Periodicidade em dias</span><input v-model="globalDays" type="number" min="0" step="1" class="ds-input w-36" placeholder="Ex.: 90" /></label>
          <button type="button" class="period-button" :disabled="!canEdit || !activeRules.length || !validDays(globalDays)" @click="prepare(activeRules, globalDays, 'Aplicar a todos os EPIs')">Revisar alteração geral</button>
          <p class="max-w-xl text-xs text-gray-500 dark:text-gray-400">Abrange os {{ activeRules.length }} vínculos ativos, inclusive fora da busca. Substitui os prazos de cada cargo. Zero desativa o controle de trocas.</p>
        </div>
      </details>
    </div>

    <div class="ds-panel overflow-hidden">
      <p v-if="!filtered.length" class="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum EPI encontrado para os filtros selecionados.</p>
      <article v-for="group in filtered" :key="group.key" class="border-b border-gray-200 last:border-b-0 dark:border-gray-700">
        <div class="grid items-center gap-x-4 gap-y-2 px-4 py-2 lg:grid-cols-[minmax(14rem,1fr)_minmax(12rem,1fr)_auto]">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2"><p class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ group.name }}</p><span v-if="group.inactiveCount" class="ds-chip">{{ group.activeCount ? `${group.inactiveCount} vínculo(s) inativo(s)` : 'Inativo' }}</span></div>
            <div class="flex flex-wrap items-center gap-x-3"><span class="text-xs text-gray-500 dark:text-gray-400">{{ group.quantities.length === 1 ? `${group.quantities[0]} ${group.unit} por troca` : 'Quantidades por cargo' }}</span><button type="button" class="min-h-7 text-xs font-semibold text-primary-700 dark:text-primary-300" aria-haspopup="dialog" @click="selectedGroupKey = group.key">Ver {{ group.rules.length }} cargo(s) <span aria-hidden="true">↗</span></button></div>
          </div>
          <div>
            <p v-if="group.different" class="mb-1 text-xs font-semibold text-primary-700 dark:text-primary-300">Prazos diferentes</p>
            <div class="flex flex-wrap gap-1.5"><span v-for="period in group.periods" :key="period.days" class="ds-chip tabular-nums">{{ periodLabel(period.days) }} · {{ period.count }} cargo(s)</span></div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input :value="groupValue(group)" type="number" min="0" step="1" class="ds-input compact-input w-24" :aria-label="`Periodicidade de ${group.name} em dias`" placeholder="Dias" @input="groupDrafts[group.key] = $event.target.value" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dias</span>
            <button type="button" class="period-button" aria-label="Aplicar aos cargos" :disabled="!canEdit || !group.activeCount || !validDays(groupValue(group))" @click="prepare(group.rules, groupValue(group), group.name)">Aplicar</button>
            <button type="button" class="period-secondary" :disabled="!canEdit" :aria-label="`${group.activeCount ? 'Inativar' : 'Ativar'} ${group.name} em todos os cargos`" @click="prepare(group.rules, !group.activeCount, `${group.activeCount ? 'Inativar' : 'Ativar'} ${group.name}`, 'active')">{{ group.activeCount ? 'Inativar' : 'Ativar' }}</button>
          </div>
        </div>
      </article>
    </div>

    <AppDialog v-if="selectedGroup" visible aria-label="Cargos por EPI" @close="selectedGroupKey = null">
      <section class="ds-panel flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden">
        <header class="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div><h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ selectedGroup.name }}</h2><p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ selectedGroup.rules.length }} cargo(s) · prazo e quantidade por troca</p></div>
          <button type="button" class="period-secondary" aria-label="Fechar cargos" @click="selectedGroupKey = null">✕</button>
        </header>
        <div class="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <label class="text-xs" :for="'epi-group-quantity'">Quantidade por troca para todos</label>
          <input id="epi-group-quantity" :value="quantityValue(selectedGroup)" type="number" min="1" step="1" class="ds-input compact-input w-20" placeholder="Qtd." @input="quantityDrafts[selectedGroup.key] = $event.target.value" />
          <span class="text-xs">{{ selectedGroup.unit }}</span>
          <button type="button" class="period-button" :disabled="!canEdit || !selectedGroup.activeCount || !validQuantity(quantityValue(selectedGroup))" @click="prepare(selectedGroup.rules, quantityValue(selectedGroup), selectedGroup.name, 'quantity', selectedGroup.unit)">Aplicar quantidade</button>
          <button type="button" class="period-secondary sm:ml-auto" :disabled="!canEdit" @click="prepare(selectedGroup.rules, !selectedGroup.activeCount, `${selectedGroup.activeCount ? 'Inativar' : 'Ativar'} ${selectedGroup.name}`, 'active')">{{ selectedGroup.activeCount ? 'Inativar' : 'Ativar' }} em todos os cargos</button>
        </div>
        <p v-if="selectedGroup.inactiveCount" class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{{ selectedGroup.inactiveCount }} vínculo(s) inativo(s). Alterações de prazo e quantidade atingem apenas os ativos.</p>
          <div class="min-h-0 overflow-auto">
            <table class="w-full text-sm">
              <thead><tr class="text-left text-xs text-gray-500 dark:text-gray-400"><th class="px-4 py-3 font-semibold">Cargo</th><th class="px-4 py-3 font-semibold">Prazo atual</th><th class="px-4 py-3 font-semibold">Alterar prazo</th><th class="px-4 py-3 font-semibold">Quantidade por troca</th><th class="px-4 py-3 text-right font-semibold">Vínculo</th></tr></thead>
              <tbody>
                <tr v-for="rule in selectedGroup.rules" :key="rule.id" class="border-t border-gray-200 dark:border-gray-700">
                  <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{{ rule.roleName }}<span class="mt-1 block text-xs text-gray-500 dark:text-gray-400">{{ rule.active ? 'Ativo' : 'Inativo' }}</span><button type="button" class="mt-1 text-xs font-semibold text-primary-700 dark:text-primary-300" :disabled="!canEdit" @click="prepare([rule], !rule.active, `${rule.active ? 'Inativar' : 'Ativar'} ${selectedGroup.name} · ${rule.roleName}`, 'active')">{{ rule.active ? 'Inativar' : 'Ativar' }}</button></td>
                  <td class="px-4 py-3"><span class="whitespace-nowrap">{{ periodLabel(rule.days) }}</span><span v-if="selectedGroup.majorityDays !== null && rule.days !== selectedGroup.majorityDays" class="mt-1 block text-xs font-semibold text-primary-700 dark:text-primary-300">Diferente da maioria</span></td>
                  <td class="px-4 py-3"><div class="flex items-center gap-2"><input :value="roleValue(rule)" type="number" min="0" step="1" class="ds-input compact-input w-24" :aria-label="`Prazo de ${selectedGroup.name} para ${rule.roleName} em dias`" @input="roleDrafts[rule.id] = $event.target.value" /><button type="button" class="period-secondary" :disabled="!canEdit || !rule.active || !validDays(roleValue(rule)) || Number(roleValue(rule)) === rule.days" @click="prepare([rule], roleValue(rule), `${selectedGroup.name} · ${rule.roleName}`)">Salvar</button></div></td>
                  <td class="px-4 py-3"><div class="flex items-center gap-2"><input :value="roleQuantity(rule)" type="number" min="1" step="1" class="ds-input compact-input w-20" :aria-label="`Quantidade de ${selectedGroup.name} para ${rule.roleName}`" @input="roleQuantities[rule.id] = $event.target.value" /><span class="text-xs">{{ selectedGroup.unit }}</span><button type="button" class="period-secondary" :disabled="!canEdit || !rule.active || !validQuantity(roleQuantity(rule)) || Number(roleQuantity(rule)) === rule.quantity" @click="prepare([rule], roleQuantity(rule), `${selectedGroup.name} · ${rule.roleName}`, 'quantity', selectedGroup.unit)">Salvar quantidade</button></div></td>
                  <td class="px-4 py-3 text-right"><button type="button" class="period-secondary whitespace-nowrap" @click="emit('open-role', rule.roleName)">Editar por cargo →</button></td>
                </tr>
              </tbody>
            </table>
          </div>
      </section>
    </AppDialog>

    <AppDialog v-if="review" visible aria-label="Revisar alteração de EPIs" :persistent="saving" @close="review = null">
      <section class="ds-panel flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
        <header class="border-b border-gray-200 p-5 dark:border-gray-700"><h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ review.title }}</h2><p class="mt-2 text-sm text-gray-600 dark:text-gray-300">{{ review.changes.length }} vínculo(s) passarão para <strong>{{ valueLabel(review.field, review.value, review.unit) }}</strong>.</p><p v-if="review.field === 'days' && review.value === 0" class="mt-2 text-sm font-semibold text-primary-700 dark:text-primary-300">Esses vínculos deixarão de aparecer no controle de trocas.</p><p v-if="review.field === 'active' && !review.value" class="mt-2 text-sm text-gray-600 dark:text-gray-300">O EPI deixará de ser obrigatório nesses cargos e sairá do controle de trocas. Saldos e histórico serão preservados. Você poderá reativar pelo Controle geral.</p><p v-if="review.field === 'active' && review.value" class="mt-2 text-sm text-gray-600 dark:text-gray-300">O EPI voltará a ser obrigatório nesses cargos, com os mesmos prazos, quantidades e motivos de uso.</p></header>
        <div class="min-h-0 overflow-y-auto p-5"><div v-for="group in review.groups" :key="group.key" class="mb-4 last:mb-0"><h3 class="font-semibold text-gray-900 dark:text-gray-100">{{ group.name }}</h3><ul class="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300"><li v-for="rule in group.rules" :key="rule.id">{{ rule.roleName }}: {{ valueLabel(review.field, rule[review.field], review.unit) }} → {{ valueLabel(review.field, review.value, review.unit) }}</li></ul></div></div>
        <footer class="flex justify-end gap-2 border-t border-gray-200 p-4 dark:border-gray-700"><button type="button" class="period-secondary" :disabled="saving" @click="review = null">Cancelar</button><button type="button" class="period-button" :disabled="saving" @click="save">{{ saving ? 'Salvando...' : 'Confirmar alteração' }}</button></footer>
      </section>
    </AppDialog>
  </section>
</template>

<style scoped>
.compact-input { min-height: 2.125rem; height: 2.125rem; padding-block: .25rem; }
.period-button, .period-secondary { min-height: 2.125rem; border-radius: var(--ds-radius-md, .5rem); padding: .375rem .75rem; font-size: .875rem; font-weight: 600; cursor: pointer; }
.period-button { background: var(--color-primary-600); color: var(--ds-primary-text); }
.period-secondary { border: 1px solid var(--ds-border); color: var(--ds-text); background: var(--ds-surface); }
.period-button:disabled, .period-secondary:disabled { opacity: .45; cursor: not-allowed; }
</style>
