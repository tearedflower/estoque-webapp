<script setup>
import { computed, ref } from 'vue'
import { useEpis } from '../../composables/useEpis.js'
import { useItems } from '../../composables/useItems.js'
import { useRoles } from '../../composables/useRoles.js'
import { usePeople } from '../../composables/usePeople.js'
import { epiRoleOverview } from '../../utils/epiRoleOverview.js'
import { normalizeSearchText } from '../../utils/globalSearch.js'
import AppDialog from '../ui/AppDialog.vue'

defineEmits(['open-role'])
const { roleRules } = useEpis()
const { items } = useItems()
const { activeRoles } = useRoles()
const { people } = usePeople()
const search = ref('')
const filter = ref('all')
const selectedRoleKey = ref(null)
const groups = computed(() => epiRoleOverview(activeRoles.value, roleRules.value, items.value, people.value).map(group => ({
  ...group, activeNames: group.rules.filter(rule => rule.active).map(rule => rule.name),
})))
const selectedRole = computed(() => groups.value.find(group => group.key === selectedRoleKey.value))
const filtered = computed(() => {
  const query = normalizeSearchText(search.value)
  return groups.value.filter(group =>
    (!query || normalizeSearchText([group.name, ...group.rules.map(rule => rule.name)].join(' ')).includes(query)) &&
    (filter.value !== 'withoutEpi' || !group.activeCount) &&
    (filter.value !== 'withoutPeriod' || group.withoutPeriod) &&
    (filter.value !== 'withoutReason' || group.withoutReason))
})
const totals = computed(() => ({
  withEpi: groups.value.filter(group => group.activeCount).length,
  withoutEpi: groups.value.filter(group => !group.activeCount).length,
  withoutPeriod: groups.value.reduce((sum, group) => sum + group.withoutPeriod, 0),
}))
</script>

<template>
  <section class="space-y-3" aria-label="Visão geral dos EPIs por cargo">
    <div class="ds-panel flex flex-wrap items-center justify-between gap-4 px-4 py-4">
      <div>
        <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">EPIs por cargo</h2>
        <div class="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600 dark:text-gray-300">
          <span><strong class="mr-1 text-lg tabular-nums text-gray-900 dark:text-gray-100">{{ totals.withEpi }}</strong> com EPIs ativos</span>
          <span><strong class="mr-1 text-lg tabular-nums text-gray-900 dark:text-gray-100">{{ totals.withoutEpi }}</strong> sem EPIs ativos</span>
          <span v-if="totals.withoutPeriod"><strong class="mr-1 text-lg tabular-nums text-gray-900 dark:text-gray-100">{{ totals.withoutPeriod }}</strong> vínculos sem prazo</span>
        </div>
      </div>
      <div class="flex w-full flex-wrap gap-2 sm:w-auto">
        <input v-model="search" type="search" class="ds-input min-w-0 flex-1 sm:w-64" aria-label="Buscar cargo ou EPI na visão geral" placeholder="Buscar cargo ou EPI..." />
        <select v-model="filter" class="ds-input w-auto" aria-label="Filtrar visão geral"><option value="all">Todos os cargos</option><option value="withoutEpi">Sem EPIs ativos</option><option value="withoutPeriod">Com EPIs sem prazo</option><option value="withoutReason">Com motivos não informados</option></select>
      </div>
    </div>
    <div class="ds-panel overflow-hidden">
      <div class="overview-columns hidden border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-500 md:grid dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400" aria-hidden="true"><span>Cargo</span><span>Equipamentos ativos</span><span class="text-center">Pessoas ativas</span><span class="text-center">EPIs ativos</span><span></span></div>
      <p v-if="!filtered.length" class="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum cargo encontrado.</p>
        <button v-for="group in filtered" :key="group.key" type="button" class="overview-columns overview-row grid min-h-[72px] w-full cursor-pointer items-center gap-y-2 border-b border-gray-200 px-4 py-3 text-left text-sm text-gray-900 transition-colors last:border-b-0 hover:bg-gray-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800/40" aria-haspopup="dialog" :aria-label="`Ver EPIs de ${group.name}`" @click="selectedRoleKey = group.key">
          <span class="min-w-0"><span class="block text-[15px] font-semibold">{{ group.name }}</span><span v-if="group.inactiveCount" class="mt-1 block text-xs text-gray-500 dark:text-gray-400">{{ group.inactiveCount }} {{ group.inactiveCount === 1 ? 'EPI inativo' : 'EPIs inativos' }}</span></span>
          <span class="min-w-0">
            <span v-if="group.activeCount" class="flex min-w-0 items-center gap-2"><span class="truncate text-gray-600 dark:text-gray-300" :title="group.activeNames.join(' · ')">{{ group.activeNames.slice(0, 2).join(' · ') }}</span><span v-if="group.activeNames.length > 2" class="ds-chip shrink-0">+{{ group.activeNames.length - 2 }}</span></span>
            <span v-else class="text-gray-500 dark:text-gray-400">Nenhum EPI ativo</span>
            <span v-if="group.withoutPeriod || group.withoutReason" class="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500 dark:text-gray-400"><span v-if="group.withoutPeriod">{{ group.withoutPeriod }} sem prazo de troca</span><span v-if="group.withoutReason">{{ group.withoutReason }} sem motivo de uso</span></span>
          </span>
          <span class="text-gray-600 md:text-center dark:text-gray-300"><span class="md:sr-only">Pessoas ativas: </span><span class="tabular-nums">{{ group.people }}</span></span>
          <span class="font-semibold md:text-center"><span class="md:sr-only">EPIs ativos: </span><span class="tabular-nums">{{ group.activeCount }}</span></span>
          <svg class="overview-chevron h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 5 7 7-7 7" /></svg>
        </button>
    </div>
    <p class="px-1 text-xs text-gray-500 dark:text-gray-400">{{ filtered.length }} {{ filtered.length === 1 ? 'cargo' : 'cargos' }} · Clique em um cargo para ver quantidades, prazos e motivos de uso.</p>
    <AppDialog v-if="selectedRole" visible aria-label="EPIs do cargo" @close="selectedRoleKey = null">
      <section class="ds-panel flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden">
        <header class="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div class="min-w-0"><h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ selectedRole.name }}</h2><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ selectedRole.activeCount }} EPIs ativos · {{ selectedRole.inactiveCount }} inativos · {{ selectedRole.people }} pessoas ativas</p></div>
          <button type="button" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Fechar EPIs do cargo" @click="selectedRoleKey = null">✕</button>
        </header>
        <div class="min-h-0 overflow-y-auto px-5">
          <div v-for="rule in selectedRole.rules" :key="rule.id" class="grid gap-x-6 gap-y-2 border-b border-gray-200 py-4 last:border-b-0 sm:grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)] dark:border-gray-700">
            <div><p class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ rule.name }} <span v-if="!rule.active" class="ds-chip ml-1">Inativo</span></p><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ rule.quantity }} {{ rule.unit }} por entrega · {{ Number(rule.days) === 0 ? 'Sem prazo de troca' : `A cada ${rule.days} dias` }}</p></div>
            <p class="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600 dark:text-gray-300"><span class="font-medium">Motivo de uso: </span>{{ rule.usageReason || 'Não informado' }}</p>
          </div>
          <p v-if="!selectedRole.rules.length" class="py-6 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum EPI vinculado.</p>
        </div>
        <footer class="flex justify-end border-t border-gray-200 px-5 py-3 dark:border-gray-700"><button type="button" class="min-h-10 text-sm font-semibold text-primary-700 dark:text-primary-300" @click="$emit('open-role', selectedRole.name)">Editar por cargo →</button></footer>
      </section>
    </AppDialog>
  </section>
</template>

<style scoped>
.overview-columns { grid-template-columns: minmax(0, 1fr) auto; column-gap: 1.25rem; }
.overview-row > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; }
.overview-row > :nth-child(3), .overview-row > :nth-child(4) { grid-column: 1 / -1; }
.overview-chevron { grid-column: 2; grid-row: 1; }
@media (min-width: 768px) {
  .overview-columns { grid-template-columns: minmax(12rem, 1.15fr) minmax(0, 2fr) 6.5rem 5.5rem 1rem; }
  .overview-row > :nth-child(n) { grid-column: auto; grid-row: auto; }
}
</style>
