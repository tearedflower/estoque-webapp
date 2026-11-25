<script setup>
import { computed, inject } from 'vue'
import { useItems, stockAlertStatus } from '../composables/useItems.js'
import { useWorkOrders } from '../composables/useWorkOrders.js'
import { useMotors } from '../composables/useMotors.js'
import { useClosings } from '../composables/useClosings.js'
import { useDestinations } from '../composables/useDestinations.js'
import { buildDestinationAlerts } from '../utils/stockReports.js'
import { periodClosing, previousMonthPeriod } from '../utils/closingAutomation.js'

const emit = defineEmits(['go'])
const isAdmin = inject('isAdmin')
const canOperate = inject('canOperate')

const { items, variations } = useItems()
const { workOrders } = useWorkOrders()
const { motors } = useMotors()
const { closings } = useClosings()
const { destinations, getDestFullName } = useDestinations()
const dashboardCopy = computed(() => {
  if (isAdmin?.value) return {
    title: 'Prioridades do estoque',
    subtitle: 'Resolva rupturas e pendências antes de acompanhar os indicadores.',
  }
  if (canOperate?.value) return {
    title: 'Registrar movimentação',
    subtitle: 'Registre entradas e saídas; consultas e relatórios ficam em segundo plano.',
  }
  return {
    title: 'Consultar materiais',
    subtitle: 'Consulte saldos e locais. Entre para registrar ou administrar o estoque.',
  }
})

const rows = computed(() => variations.value.map(variation => {
  const item = items.value.find(i => i.id === variation.itemId) || {}
  return { item, variation, status: stockAlertStatus(variation, item) }
}))

const openOrders = computed(() =>
  workOrders.value.filter(o => !o.maintenanceEndDate)
)

const motorsInMaintenance = computed(() =>
  motors.value.filter(m => m.status === 'em_manutencao')
)

const stockStats = computed(() => ({
  zero: rows.value.filter(r => r.status === 'zero').length,
  critical: rows.value.filter(r => r.status === 'critical').length,
  alert: rows.value.filter(r => r.status === 'alert').length,
  totalStock: rows.value.reduce((sum, r) => sum + Number(r.variation.stock || 0), 0),
}))

const destinationAlerts = computed(() => buildDestinationAlerts(rows.value, destinations.value, getDestFullName))

const previousPeriod = previousMonthPeriod()
const previousMonthClosing = computed(() => periodClosing(closings.value, previousPeriod))

const shortcutActions = [
  {
    id: 'entrada',
    label: 'Entrada',
    description: 'Registrar material chegando no estoque.',
    target: { tab: 'movimentacoes', subTab: 'entrada', requiresOperator: true },
    icon: 'M12 4.5v15m0-15 6 6m-6-6-6 6',
    tone: 'success',
    primary: true,
  },
  {
    id: 'catalogo',
    label: 'Consultar materiais',
    description: 'Buscar materiais, variações, locais e saldo.',
    target: { tab: 'catalogo' },
    icon: 'm21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z',
    tone: 'info',
  },
  {
    id: 'saida',
    label: 'Saída',
    description: 'Registrar retirada para pessoa ou destino.',
    target: { tab: 'movimentacoes', subTab: 'saida', requiresOperator: true },
    icon: 'M12 19.5v-15m0 15-6-6m6 6 6-6',
    tone: 'danger',
    primary: true,
  },
  {
    id: 'inventario',
    label: 'Consultar estoque',
    description: 'Ver quantidades, locais e materiais em atenção.',
    target: { tab: 'inventario', section: 'estoque' },
    icon: 'M3.75 6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6Zm3 2.25h10.5M6.75 12h10.5M6.75 15.75h6',
    tone: 'info',
  },
  {
    id: 'nova-os',
    label: 'Nova ordem de serviço',
    description: 'Abrir uma atividade de manutenção.',
    target: { tab: 'ordens', subTab: 'nova', requiresOperator: true },
    icon: 'M12 4.5v15m7.5-7.5h-15',
    tone: 'brand',
    primary: true,
  },
]

const dashboardActions = computed(() => canOperate?.value
  ? shortcutActions
  : shortcutActions.filter(action => ['catalogo', 'inventario'].includes(action.id))
)

const priorityActions = computed(() => {
  const list = []
  if (stockStats.value.zero) {
    list.push({
      id: 'zero',
      label: `${stockStats.value.zero} ${stockStats.value.zero === 1 ? 'variação' : 'variações'} sem estoque`,
      description: 'Prioridade alta para reposição ou ajuste.',
      target: { tab: 'inventario', section: 'estoque', status: 'zero' },
      tone: 'text-red-600 dark:text-red-400',
    })
  }
  if (stockStats.value.critical + stockStats.value.alert) {
    list.push({
      id: 'alertas',
      label: `${stockStats.value.critical + stockStats.value.alert} ${stockStats.value.critical + stockStats.value.alert === 1 ? 'variação' : 'variações'} em alerta`,
      description: 'Conferir mínimo, consumo e necessidade de compra.',
      target: { tab: 'inventario', section: 'estoque', status: '' },
      tone: 'text-amber-600 dark:text-amber-400',
    })
  }
  if (destinationAlerts.value.length) {
    list.push({
      id: 'destinos',
      label: `${destinationAlerts.value.length} destino${destinationAlerts.value.length === 1 ? '' : 's'} com alerta`,
      description: 'Ver materiais críticos por máquina ou local.',
      target: { tab: 'inventario', section: 'estoque', status: '' },
      tone: 'text-amber-600 dark:text-amber-400',
    })
  }
  if (openOrders.value.length) {
    list.push({
      id: 'os',
      label: `${openOrders.value.length} OS aberta${openOrders.value.length === 1 ? '' : 's'}`,
      description: 'Continuar manutenções pendentes.',
      target: { tab: 'ordens', subTab: 'ordens' },
      tone: 'text-primary-600 dark:text-primary-400',
    })
  }
  if (motorsInMaintenance.value.length) {
    list.push({
      id: 'motores',
      label: `${motorsInMaintenance.value.length} motor${motorsInMaintenance.value.length === 1 ? '' : 'es'} em manutenção`,
      description: 'Acompanhar OS e eventos de motor.',
      target: { tab: 'motores' },
      tone: 'text-primary-600 dark:text-primary-400',
    })
  }
  if (!previousMonthClosing.value) {
    list.push({
      id: 'sem-fechamento',
      label: `Fechamento ${String(previousPeriod.month).padStart(2, '0')}/${previousPeriod.year} pendente`,
      description: 'A prévia já será preparada ao abrir a rotina.',
      target: { tab: 'inventario', section: 'fechamentos', requiresAdmin: true },
      tone: 'text-amber-600 dark:text-amber-400',
    })
  }
  return list.filter(action => !action.target.requiresAdmin || isAdmin.value).slice(0, 6)
})

function go(target) {
  emit('go', target)
}

</script>

<template>
  <div class="ds-page-stack">
    <header class="ds-page-header dashboard-header">
      <div>
        <h1 class="ds-page-title">{{ dashboardCopy.title }}</h1>
        <p class="ds-page-subtitle">{{ dashboardCopy.subtitle }}</p>
      </div>
    </header>

    <section
      class="dashboard-actions grid grid-cols-1 gap-4"
      :class="isAdmin ? 'dashboard-actions-admin xl:grid-cols-[1.25fr_0.75fr]' : 'dashboard-actions-operator'"
    >
      <div class="ds-list-panel">
        <div class="grid auto-rows-fr grid-cols-1 sm:grid-cols-2 gap-2.5 p-4">
          <button
            v-for="action in dashboardActions"
            :key="action.id"
            type="button"
            class="ds-action-card rounded-lg border p-3 pl-4 text-left transition-colors cursor-pointer"
            :class="[`ds-action-card-${action.tone}`, { 'ds-action-card-primary': !isAdmin && ['entrada', 'saida'].includes(action.id) }]"
            :title="action.target.requiresOperator && !canOperate ? 'Seu perfil não pode registrar movimentações' : action.description"
            @click="go(action.target)"
          >
            <div class="flex items-start gap-3">
              <span class="ds-action-icon mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" :d="action.icon" />
                </svg>
              </span>
              <span class="min-w-0">
                <span class="ds-action-label block text-sm font-semibold">{{ action.label }}</span>
                <span class="ds-action-description mt-1 block text-xs leading-5">{{ action.description }}</span>
              </span>
            </div>
          </button>
        </div>
      </div>

      <div v-if="isAdmin" class="ds-list-panel dashboard-priorities">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h2 class="ds-section-heading">Prioridades</h2>
            <p class="mt-1 text-xs ds-muted">Pendências com destino direto para resolver.</p>
          </div>
        </div>
        <div v-if="!priorityActions.length" class="p-4 text-sm ds-muted">Nenhuma prioridade operacional agora.</div>
        <button
          v-for="action in priorityActions"
          :key="action.id"
          type="button"
          class="ds-list-row w-full text-left p-4 cursor-pointer"
          @click="go(action.target)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold truncate" :class="action.tone">{{ action.label }}</p>
              <p class="mt-1 text-xs ds-muted truncate">{{ action.description }}</p>
            </div>
            <svg class="mt-1 h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </button>
      </div>
    </section>

    <section class="dashboard-pulse">
      <button class="ds-metric ds-metric-danger text-left cursor-pointer" @click="go({ tab: 'inventario', section: 'estoque', status: 'zero' })">
        <p class="ds-metric-label">Sem estoque</p>
        <p class="ds-metric-value">{{ stockStats.zero }}</p>
      </button>
      <button class="ds-metric ds-metric-warning text-left cursor-pointer" @click="go({ tab: 'inventario', section: 'estoque', status: '' })">
        <p class="ds-metric-label">Críticos / alerta</p>
        <p class="ds-metric-value">{{ stockStats.critical + stockStats.alert }}</p>
      </button>
      <button class="ds-metric ds-metric-warning text-left cursor-pointer" @click="go({ tab: 'inventario', section: 'estoque', status: '' })">
        <p class="ds-metric-label">Destinos em alerta</p>
        <p class="ds-metric-value">{{ destinationAlerts.length }}</p>
      </button>
    </section>

  </div>
</template>
