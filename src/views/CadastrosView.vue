<script setup>
import { computed, ref, inject, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue'
import EditHierarchyView from './EditHierarchyView.vue'
import DestinationsTab from '../components/cadastros/DestinationsTab.vue'
import LocationsTab from '../components/cadastros/LocationsTab.vue'
import PeopleTab from '../components/cadastros/PeopleTab.vue'
import SuppliersTab from '../components/cadastros/SuppliersTab.vue'
import UsersTab from '../components/cadastros/UsersTab.vue'
import CatalogPendingTab from '../components/cadastros/CatalogPendingTab.vue'
import { backupCountdownLabel } from '../utils/backupStatus.js'
const AuditTab = defineAsyncComponent(() => import('../components/cadastros/AuditTab.vue'))

const isAdmin = inject('isAdmin')
const props = defineProps({
  initialTab: { type: String, default: 'hierarquia' },
  backupHealth: { type: Object, default: null },
})
const emit = defineEmits(['quick-movement', 'update:tab'])

const validTabs = ['hierarquia', 'destinos', 'locais', 'fornecedores', 'pendencias', 'pessoas', 'cargos', 'operadores', 'auditoria']
const activeSubTab = ref(validTabs.includes(props.initialTab) ? props.initialTab : 'hierarquia')
const now = ref(Date.now())
let countdownTimer = null
const backupCountdown = computed(() => backupCountdownLabel(props.backupHealth, now.value))
const backupScheduledFor = computed(() => {
  const target = Date.parse(props.backupHealth?.nextRunAt)
  return Number.isFinite(target) ? new Date(target).toLocaleString('pt-BR') : ''
})
const lastBackupAt = computed(() => {
  const target = Date.parse(props.backupHealth?.lastSuccessAt)
  return Number.isFinite(target) ? new Date(target).toLocaleString('pt-BR') : ''
})
const backupIntervalLabel = computed(() => {
  const hours = props.backupHealth?.intervalHours
  return hours ? `A cada ${hours}h` : ''
})
const cadastroTabs = computed(() => [
  { id: 'hierarquia', label: 'Materiais' },
  { id: 'destinos', label: 'Destinos e máquinas' },
  { id: 'locais', label: 'Locais' },
  { id: 'fornecedores', label: 'Fornecedores' },
  { id: 'pendencias', label: 'Pendências' },
  { id: 'pessoas', label: 'Pessoas' },
  ...(isAdmin.value ? [{ id: 'operadores', label: 'Operadores' }, { id: 'auditoria', label: 'Auditoria' }] : []),
])

watch(() => props.initialTab, tab => {
  if (validTabs.includes(tab)) activeSubTab.value = tab
})

watch(activeSubTab, tab => {
  emit('update:tab', tab)
})

watch(isAdmin, admin => {
  if (!admin && ['operadores', 'auditoria'].includes(activeSubTab.value)) activeSubTab.value = 'hierarquia'
}, { immediate: true })

onMounted(() => {
  countdownTimer = window.setInterval(() => { now.value = Date.now() }, 1000)
})

onUnmounted(() => {
  window.clearInterval(countdownTimer)
})
</script>

<template>
  <section
    v-if="isAdmin"
    class="ds-panel mb-4 flex flex-wrap items-center gap-3 px-4 py-3"
  >
    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ds-border ds-surface-subtle ds-muted" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4">
        <path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="12" cy="12" r="8" />
      </svg>
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-[11px] font-semibold uppercase tracking-[0.08em] ds-muted">Próximo backup automático</p>
      <p class="mt-0.5 text-lg font-semibold tabular-nums ds-text">{{ backupCountdown }}</p>
      <p class="mt-0.5 truncate text-xs ds-muted">
        <template v-if="backupScheduledFor">Previsto para {{ backupScheduledFor }}</template>
        <template v-else-if="lastBackupAt">Último backup concluído em {{ lastBackupAt }}</template>
        <template v-else>O servidor informará o próximo horário assim que o agendamento estiver pronto.</template>
      </p>
    </div>
    <span v-if="backupIntervalLabel" class="ds-chip shrink-0 tabular-nums">{{ backupIntervalLabel }}</span>
  </section>

  <!-- Sub-tab bar -->
  <div class="mb-5 overflow-x-auto">
    <nav class="ds-segmented min-w-max" aria-label="Seções de administração">
      <button
        v-for="tab in cadastroTabs"
        :key="tab.id"
        type="button"
        :aria-current="activeSubTab === tab.id ? 'page' : undefined"
        class="ds-segmented-item"
        :class="activeSubTab === tab.id || (tab.id === 'pessoas' && activeSubTab === 'cargos') ? 'ds-segmented-item-active' : ''"
        @click="activeSubTab = tab.id"
      >{{ tab.label }}</button>
    </nav>
  </div>

  <!-- Hierarquia -->
  <EditHierarchyView v-if="activeSubTab === 'hierarquia'" />

  <CatalogPendingTab v-else-if="activeSubTab === 'pendencias'" />

  <!-- ===== Destinos ===== -->
  <DestinationsTab v-else-if="activeSubTab === 'destinos'" />

  <!-- ===== Pessoas ===== -->
  <PeopleTab
    v-else-if="activeSubTab === 'pessoas' || activeSubTab === 'cargos'"
    :initial-section="activeSubTab === 'cargos' ? 'cargos' : 'funcionarios'"
  />

  <!-- ===== Fornecedores ===== -->
  <SuppliersTab v-else-if="activeSubTab === 'fornecedores'" />

  <!-- ===== Locais ===== -->
  <LocationsTab v-else-if="activeSubTab === 'locais'" />

  <!-- ===== Operadores ===== -->
  <UsersTab v-else-if="activeSubTab === 'operadores'" />

  <AuditTab v-else-if="activeSubTab === 'auditoria' && isAdmin" />
</template>
