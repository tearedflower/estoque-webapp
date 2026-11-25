<script setup>
import { computed, inject, ref } from 'vue'
import { useEpis } from '../../composables/useEpis.js'
import { useItems } from '../../composables/useItems.js'
import { useToast } from '../../composables/useToast.js'
import { epiVariationCa } from '../../utils/epiSheet.js'
import { epiPeriodGroups } from '../../utils/epiPeriodGroups.js'
import { epiPeriodCsv } from '../../utils/epiPeriodCsv.js'
import { normalizeSearchText } from '../../utils/globalSearch.js'
import { variationAttributeRows } from '../../utils/attributes.js'
import AttributeBadges from '../ui/AttributeBadges.vue'
import AppDialog from '../ui/AppDialog.vue'
import EpiVariationChoices from './EpiVariationChoices.vue'

const emit = defineEmits(['open-role'])
const { roleRules, editRoleBatch } = useEpis()
const { items, variations } = useItems()
const variationById = computed(() => new Map(variations.value.map(variation => [variation.id, variation])))
const itemById = computed(() => new Map(items.value.map(item => [item.id, item])))
const groupVariation = group => group.rules[0]?.targetType === 'variacao'
  ? variationById.value.get(group.rules[0].targetKey)
  : null
const { success, error } = useToast()
const isLoggedIn = inject('isLoggedIn')
const canEdit = computed(() => !!isLoggedIn?.value)
const query = ref('')
const filter = ref('all')
const activity = ref('all')
const globalDays = ref('')
const globalOpen = ref(false)
const groupDrafts = ref({})
const roleDrafts = ref({})
const quantityDrafts = ref({})
const roleQuantities = ref({})
const selectedGroupKey = ref(null)
const groupAdjustment = ref('')
const selectedRuleId = ref(null)
const review = ref(null)
const saving = ref(false)
const approvedCas = ref([])
const reviewVariations = computed(() => variations.value.filter(variation =>
  variation.itemId === review.value?.item?.id && variation.active !== false
))
const groups = computed(() => epiPeriodGroups(roleRules.value, items.value))
const selectedGroup = computed(() => groups.value.find(group => group.key === selectedGroupKey.value))
const selectedItem = computed(() => {
  const group = selectedGroup.value
  if (!group) return null
  const rule = group.rules[0]
  const id = rule.targetType === 'item' ? rule.targetKey : groupVariation(group)?.itemId
  const item = itemById.value.get(id)
  return item?.active !== false ? item : null
})
const commonCas = computed(() => {
  const rules = selectedGroup.value?.rules || []
  return (rules[0]?.allowedCas || []).filter(ca => ca && rules.every(rule => rule.allowedCas?.includes(ca)))
})
const activeRules = computed(() => roleRules.value.filter(rule => rule.active))
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
const reportRules = computed(() => filtered.value.flatMap(group => group.rules.filter(rule =>
  activity.value === 'all' || rule.active === (activity.value === 'active')
)))

function exportPeriodicities() {
  if (!reportRules.value.length) return
  const csv = epiPeriodCsv(reportRules.value, items.value, variations.value)
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'epis_por_periodicidade.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function equipmentName(group) {
  return group.name.split(' > ').at(-1)
}

function variationSummary(group) {
  const variation = groupVariation(group)
  if (!variation) return ''
  const attributes = variationAttributeRows(itemById.value.get(variation.itemId), variation)
  return attributes.map(({ key, value }) => normalizeSearchText(key) === 'ca' ? `CA ${value}` : value).join(' · ')
}

function activityLabel(group) {
  if (!group.activeCount) return 'Inativo'
  return group.inactiveCount ? `${group.inactiveCount} ${group.inactiveCount === 1 ? 'inativo' : 'inativos'}` : 'Ativo'
}

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
function openGroup(group) {
  groupAdjustment.value = ''
  selectedRuleId.value = null
  selectedGroupKey.value = group.key
}

function prepareUseItem(group) {
  const item = selectedItem.value
  if (!canEdit.value || !item) return
  const variation = groupVariation(group)
  const converting = Boolean(variation)
  const available = new Set(variations.value
    .filter(row => row.itemId === item.id && row.active !== false)
    .map(row => epiVariationCa(row.values, row.extras)))
  const currentCas = converting ? [epiVariationCa(variation.values, variation.extras)] : commonCas.value
  approvedCas.value = currentCas.filter(ca => /^\d{1,12}$/.test(ca) && available.has(ca))
  review.value = {
    title: `Definir CAs · ${item.name}`,
    field: 'target',
    item,
    converting,
    changes: group.rules.map(rule => converting
      ? { id: rule.id, previousVariationId: rule.targetKey }
      : { id: rule.id, previousItemId: rule.targetKey, previousAllowedCas: rule.allowedCas ?? null }),
    groups: [group],
  }
}
function toggleApprovedCa(ca) {
  approvedCas.value = approvedCas.value.includes(ca)
    ? approvedCas.value.filter(value => value !== ca)
    : [...approvedCas.value, ca]
}
async function save() {
  if (saving.value || !review.value) return
  const useItem = review.value.field === 'target'
  if (useItem && !approvedCas.value.length) {
    error('Marque pelo menos uma variação com CA.')
    return
  }
  saving.value = true
  try {
    const result = await editRoleBatch(review.value.changes, { useItem, allowedCas: approvedCas.value })
    if (!result.ok) { error(result.error); return }
    for (const change of review.value.changes) { delete roleDrafts.value[change.id]; delete roleQuantities.value[change.id] }
    for (const group of review.value.groups) { delete groupDrafts.value[group.key]; delete quantityDrafts.value[group.key] }
    success(`${review.value.changes.length} vínculo(s) atualizado(s).`)
    if (review.value.converting) selectedGroupKey.value = null
    globalOpen.value = false
    review.value = null
  } finally { saving.value = false }
}
</script>

<template>
  <section>
    <div class="ds-panel overflow-hidden">
      <div class="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <input v-model="query" type="search" class="ds-input compact-input min-w-0 grow basis-full sm:basis-48 sm:grow-0" aria-label="Buscar EPI ou cargo" placeholder="Buscar EPI ou cargo..." />
        <select v-model="activity" class="ds-input compact-input w-auto" aria-label="Situação dos vínculos">
          <option value="all">Todas as situações</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
        <select v-model="filter" class="ds-input compact-input w-auto" aria-label="Filtrar periodicidades">
          <option value="all">Todos os prazos</option>
          <option value="different">Prazos diferentes</option>
          <option value="without">Com cargos sem controle</option>
        </select>
        <button type="button" class="period-secondary sm:ml-auto" :disabled="!reportRules.length" @click="exportPeriodicities">Exportar periodicidades</button>
        <button v-if="canEdit" type="button" class="period-secondary" aria-haspopup="dialog" :disabled="!activeRules.length" @click="globalOpen = true">Ajustar prazo geral</button>
      </div>

      <div v-if="filtered.length" aria-hidden="true" class="equipment-grid hidden border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400 sm:grid">
        <span>EPI</span><span>Cargos</span><span>Prazo de troca</span><span>Situação</span>
      </div>
      <p v-if="!filtered.length" class="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum EPI encontrado para os filtros selecionados.</p>
      <article v-for="group in filtered" :key="group.key" class="border-b border-gray-200 last:border-b-0 dark:border-gray-700">
        <button type="button" aria-haspopup="dialog"
          class="equipment-grid equipment-row w-full items-center px-4 py-3 text-left text-sm transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500 dark:hover:bg-gray-800/60"
          @click="openGroup(group)">
          <span class="equipment-name min-w-0">
            <span class="block font-semibold text-gray-900 dark:text-gray-100">{{ equipmentName(group) }}</span>
            <span v-if="groupVariation(group)" class="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400" :title="variationSummary(group)">
              {{ variationSummary(group) || 'Variação' }}
            </span>
          </span>
          <span class="equipment-count tabular-nums text-gray-600 dark:text-gray-300">{{ group.rules.length }}<span class="sm:hidden"> {{ group.rules.length === 1 ? 'cargo' : 'cargos' }}</span></span>
          <span class="equipment-period" :class="group.different ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-300'">
            {{ group.different ? 'Prazos diferentes' : periodLabel(group.periods[0].days) }}
          </span>
          <span class="equipment-status text-gray-500 dark:text-gray-400">
            <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" :class="group.activeCount === 0 ? 'bg-gray-400' : group.inactiveCount ? 'bg-amber-500' : 'bg-emerald-500'"></span>
            {{ activityLabel(group) }}
          </span>
          <svg aria-hidden="true" class="equipment-chevron h-4 w-4 justify-self-end text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="m9 6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </article>
    </div>

    <AppDialog v-if="globalOpen" visible aria-label="Ajustar prazo geral" @close="globalOpen = false">
      <form class="ds-panel w-full max-w-md space-y-4 p-5" @submit.prevent="prepare(activeRules, globalDays, 'Aplicar a todos os EPIs')">
        <h2 class="text-lg font-semibold">Ajustar prazo geral</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">O novo prazo vale para os {{ activeRules.length }} vínculos ativos, inclusive fora dos filtros atuais. Use zero para remover o prazo.</p>
        <label class="block">
          <span class="ds-label">Periodicidade em dias</span>
          <input v-model="globalDays" type="number" min="0" step="1" class="ds-input w-36" placeholder="Ex.: 90" />
        </label>
        <div class="flex justify-end gap-2">
          <button type="button" class="period-secondary" @click="globalOpen = false">Cancelar</button>
          <button type="submit" class="period-button" :disabled="!canEdit || !activeRules.length || !validDays(globalDays)">Revisar alteração geral</button>
        </div>
      </form>
    </AppDialog>

    <AppDialog v-if="selectedGroup" visible aria-label="Cargos por EPI" @close="selectedGroupKey = null">
      <section class="ds-panel flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden">
        <header class="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 dark:border-gray-700">
          <div class="min-w-0 space-y-1">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ equipmentName(selectedGroup) }}</h2>
            <p v-if="equipmentName(selectedGroup) !== selectedGroup.name" class="text-xs text-gray-500 dark:text-gray-400">{{ selectedGroup.name }}</p>
            <AttributeBadges v-if="groupVariation(selectedGroup)" :item="itemById.get(groupVariation(selectedGroup).itemId)" :variation="groupVariation(selectedGroup)" compact />
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ selectedGroup.rules.length }} {{ selectedGroup.rules.length === 1 ? 'cargo' : 'cargos' }} · {{ activityLabel(selectedGroup) }}
              <template v-if="commonCas.length"> · CAs em comum: {{ commonCas.join(', ') }}</template>
            </p>
          </div>
          <button type="button" class="period-secondary" aria-label="Fechar cargos" @click="selectedGroupKey = null">✕</button>
        </header>
        <div class="min-h-0 overflow-auto">
          <section class="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
            <h3 class="text-xs font-semibold text-gray-600 dark:text-gray-300">Para todos os cargos</h3>
            <div class="mt-2 flex flex-wrap gap-2">
              <button type="button" class="period-secondary" :disabled="!canEdit || !selectedGroup.activeCount" :aria-expanded="groupAdjustment === 'days'"
                @click="groupAdjustment = groupAdjustment === 'days' ? '' : 'days'">Alterar prazo</button>
              <button type="button" class="period-secondary" :disabled="!canEdit || !selectedGroup.activeCount" :aria-expanded="groupAdjustment === 'quantity'"
                @click="groupAdjustment = groupAdjustment === 'quantity' ? '' : 'quantity'">Alterar quantidade</button>
              <button v-if="selectedItem" type="button" class="period-secondary" :disabled="!canEdit" @click="prepareUseItem(selectedGroup)">
                {{ groupVariation(selectedGroup) ? 'Usar item em todos os cargos' : 'Definir CAs para todos os cargos' }}
              </button>
              <button type="button" class="period-secondary" :disabled="!canEdit" @click="prepare(selectedGroup.rules, !selectedGroup.activeCount, `${selectedGroup.activeCount ? 'Inativar' : 'Ativar'} ${selectedGroup.name}`, 'active')">
                {{ selectedGroup.activeCount ? 'Inativar' : 'Ativar' }} em todos os cargos
              </button>
            </div>
            <div v-if="groupAdjustment" class="mt-3">
              <form v-if="groupAdjustment === 'days'" class="flex flex-wrap items-center gap-2"
                @submit.prevent="prepare(selectedGroup.rules, groupValue(selectedGroup), selectedGroup.name)">
                <label for="epi-group-days" class="text-sm">Novo prazo</label>
                <input id="epi-group-days" :value="groupValue(selectedGroup)" type="number" min="0" step="1" class="ds-input compact-input w-20"
                  :aria-label="`Periodicidade de ${selectedGroup.name} em dias`" @input="groupDrafts[selectedGroup.key] = $event.target.value" />
                <span class="text-xs text-gray-500 dark:text-gray-400">dias</span>
                <button type="submit" class="period-button" aria-label="Aplicar aos cargos" :disabled="!canEdit || !validDays(groupValue(selectedGroup))">Revisar prazo</button>
              </form>
              <form v-else class="flex flex-wrap items-center gap-2"
                @submit.prevent="prepare(selectedGroup.rules, quantityValue(selectedGroup), selectedGroup.name, 'quantity', selectedGroup.unit)">
                <label for="epi-group-quantity" class="text-sm">Quantidade por troca para todos</label>
                <input id="epi-group-quantity" :value="quantityValue(selectedGroup)" type="number" min="1" step="1" class="ds-input compact-input w-20"
                  @input="quantityDrafts[selectedGroup.key] = $event.target.value" />
                <span v-if="selectedGroup.unit" class="text-xs text-gray-500 dark:text-gray-400">{{ selectedGroup.unit }}</span>
                <button type="submit" class="period-button" :disabled="!canEdit || !validQuantity(quantityValue(selectedGroup))">Aplicar quantidade</button>
              </form>
              <p v-if="selectedGroup.inactiveCount" class="mt-2 text-xs text-gray-500 dark:text-gray-400">O ajuste se aplica aos vínculos ativos.</p>
            </div>
          </section>
          <table class="w-full text-sm">
            <thead class="text-left text-xs text-gray-500 dark:text-gray-400">
              <tr>
                <th scope="col" class="px-4 py-2.5 font-medium">Cargo</th>
                <th scope="col" class="px-2 py-2.5 font-medium">Prazo</th>
                <th scope="col" class="px-2 py-2.5 font-medium"><span class="sm:hidden">Qtd.</span><span class="hidden sm:inline">Quantidade por troca</span></th>
                <th scope="col" class="px-4 py-2.5"><span class="sr-only">Ajustes</span></th>
              </tr>
            </thead>
            <tbody v-for="rule in selectedGroup.rules" :key="rule.id">
              <tr class="border-t border-gray-200 dark:border-gray-700">
                <th scope="row" class="px-4 py-2.5 text-left font-medium text-gray-900 dark:text-gray-100">
                  {{ rule.roleName }}
                  <span v-if="!rule.active" class="block text-xs font-normal text-gray-500 dark:text-gray-400">Inativo</span>
                </th>
                <td class="px-2 py-2.5">{{ periodLabel(rule.days) }}</td>
                <td class="whitespace-nowrap px-2 py-2.5">{{ rule.quantity }} {{ selectedGroup.unit }}</td>
                <td class="px-4 py-2.5 text-right">
                  <button type="button" class="text-xs font-semibold text-primary-700 hover:underline dark:text-primary-300"
                    :aria-expanded="selectedRuleId === rule.id" @click="selectedRuleId = selectedRuleId === rule.id ? null : rule.id">
                    {{ selectedRuleId === rule.id ? 'Recolher' : 'Ajustar' }}
                  </button>
                </td>
              </tr>
              <tr v-if="selectedRuleId === rule.id" class="bg-gray-50 dark:bg-gray-800/50">
                <td colspan="4" class="px-4 py-3">
                  <div class="flex flex-wrap items-end gap-3">
                    <form class="flex items-end gap-2" @submit.prevent="prepare([rule], roleValue(rule), `${selectedGroup.name} · ${rule.roleName}`)">
                      <label>
                        <span class="ds-label">Prazo em dias</span>
                        <input :value="roleValue(rule)" type="number" min="0" step="1" class="ds-input compact-input w-20"
                          :aria-label="`Prazo de ${selectedGroup.name} para ${rule.roleName} em dias`" :disabled="!canEdit || !rule.active" @input="roleDrafts[rule.id] = $event.target.value" />
                      </label>
                      <button type="submit" class="period-secondary" aria-label="Salvar prazo" :disabled="!canEdit || !rule.active || !validDays(roleValue(rule)) || Number(roleValue(rule)) === rule.days">Salvar</button>
                    </form>
                    <form class="flex items-end gap-2" @submit.prevent="prepare([rule], roleQuantity(rule), `${selectedGroup.name} · ${rule.roleName}`, 'quantity', selectedGroup.unit)">
                      <label>
                        <span class="ds-label">Quantidade</span>
                        <input :value="roleQuantity(rule)" type="number" min="1" step="1" class="ds-input compact-input w-20"
                          :aria-label="`Quantidade de ${selectedGroup.name} para ${rule.roleName}`" :disabled="!canEdit || !rule.active" @input="roleQuantities[rule.id] = $event.target.value" />
                      </label>
                      <button type="submit" class="period-secondary" aria-label="Salvar quantidade" :disabled="!canEdit || !rule.active || !validQuantity(roleQuantity(rule)) || Number(roleQuantity(rule)) === rule.quantity">Salvar</button>
                    </form>
                    <button type="button" class="period-secondary" :disabled="!canEdit" @click="prepare([rule], !rule.active, `${rule.active ? 'Inativar' : 'Ativar'} ${selectedGroup.name} · ${rule.roleName}`, 'active')">{{ rule.active ? 'Inativar' : 'Ativar' }}</button>
                    <button type="button" class="period-secondary" @click="emit('open-role', rule.roleName)">Editar por cargo</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </AppDialog>

    <AppDialog v-if="review" visible aria-label="Revisar alteração de EPIs" :persistent="saving" @close="review = null">
      <section class="ds-panel flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
        <header class="border-b border-gray-200 p-5 dark:border-gray-700"><h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ review.title }}</h2><p v-if="review.field === 'target'" class="mt-2 text-sm text-gray-600 dark:text-gray-300">{{ review.converting ? 'O vínculo passará a usar o item do catálogo.' : 'A seleção substitui os CAs dos vínculos listados, inclusive os inativos.' }} Marque as variações cujos CAs devem ser aceitos.</p><p v-else class="mt-2 text-sm text-gray-600 dark:text-gray-300">{{ review.changes.length }} vínculo(s) passarão para <strong>{{ valueLabel(review.field, review.value, review.unit) }}</strong>.</p><p v-if="review.field === 'days' && review.value === 0" class="mt-2 text-sm font-semibold text-primary-700 dark:text-primary-300">Esses vínculos ficarão sem prazo de troca.</p><p v-if="review.field === 'active' && !review.value" class="mt-2 text-sm text-gray-600 dark:text-gray-300">O EPI deixará de ser obrigatório nesses cargos e sairá do controle de trocas. Saldos e histórico serão preservados. Você poderá reativar pelo Controle geral.</p><p v-if="review.field === 'active' && review.value" class="mt-2 text-sm text-gray-600 dark:text-gray-300">O EPI voltará a ser obrigatório nesses cargos, com os mesmos prazos, quantidades e motivos de uso.</p></header>
        <div class="min-h-0 space-y-4 overflow-y-auto p-5">
          <EpiVariationChoices v-if="review.item" :item="review.item" :variations="reviewVariations"
            :allowed-cas="approvedCas" :disabled="saving" @toggle-ca="toggleApprovedCa" />
          <div v-for="group in review.groups" :key="group.key">
            <h3 class="font-semibold text-gray-900 dark:text-gray-100">{{ review.item ? 'Cargos afetados' : group.name }}</h3>
            <ul class="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
              <li v-for="rule in group.rules" :key="rule.id">{{ rule.roleName }}<span v-if="review.item && !rule.active" class="ml-2 text-xs text-gray-500">Inativo</span><template v-if="review.field !== 'target'">: {{ valueLabel(review.field, rule[review.field], review.unit) }} → {{ valueLabel(review.field, review.value, review.unit) }}</template></li>
            </ul>
          </div>
        </div>
        <footer class="flex justify-end gap-2 border-t border-gray-200 p-4 dark:border-gray-700"><button type="button" class="period-secondary" :disabled="saving" @click="review = null">Cancelar</button><button type="button" class="period-button" :disabled="saving || (review.item && !approvedCas.length)" @click="save">{{ saving ? 'Salvando...' : 'Confirmar alteração' }}</button></footer>
      </section>
    </AppDialog>
  </section>
</template>

<style scoped>
.equipment-row {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content 1rem;
  column-gap: .75rem;
  row-gap: .375rem;
}
.equipment-name { grid-column: 1 / 4; }
.equipment-chevron { grid-column: 4; grid-row: 1; }
.equipment-count, .equipment-period, .equipment-status { font-size: .75rem; }
@media (min-width: 640px) {
  .equipment-grid {
    grid-template-columns: minmax(0, 1fr) 4.5rem 9rem 6rem 1rem;
    gap: 1rem;
  }
  .equipment-name, .equipment-chevron { grid-column: auto; grid-row: auto; }
  .equipment-count, .equipment-period, .equipment-status { font-size: inherit; }
}

.compact-input { min-height: 2.125rem; height: 2.125rem; padding-block: .25rem; }
.period-button, .period-secondary { min-height: 2.125rem; border-radius: var(--ds-radius-md, .5rem); padding: .375rem .75rem; font-size: .875rem; font-weight: 600; cursor: pointer; }
.period-button { background: var(--color-primary-600); color: var(--ds-primary-text); }
.period-secondary { border: 1px solid var(--ds-border); color: var(--ds-text); background: var(--ds-surface); }
.period-button:disabled, .period-secondary:disabled { opacity: .45; cursor: not-allowed; }
</style>
