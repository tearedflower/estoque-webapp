<script setup>
import { computed, ref, watch } from 'vue'
import { useItems, stockAlertStatus } from '../composables/useItems.js'
import { useMovements } from '../composables/useMovements.js'
import { useWorkOrders } from '../composables/useWorkOrders.js'
import { useMotors } from '../composables/useMotors.js'
import { useClosings } from '../composables/useClosings.js'
import { useDestinations } from '../composables/useDestinations.js'
import { buildMovementReport, movementMonthKey, shiftReportMonth } from '../utils/movementReports.js'
import { buildDestinationAlerts } from '../utils/stockReports.js'
import AppButton from '../components/ui/AppButton.vue'
import AppLink from '../components/ui/AppLink.vue'
import AttributeBadges from '../components/ui/AttributeBadges.vue'
import SectionTabs from '../components/ui/SectionTabs.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'

const props = defineProps({ initialSubTab: { type: String, default: 'movimentacoes' } })
const emit = defineEmits(['go', 'update:subTab'])
const tabs = [{ id: 'movimentacoes', label: 'Movimentações' }, { id: 'estoque', label: 'Estoque atual' }, { id: 'manutencao', label: 'Manutenção' }]
const section = ref('movimentacoes')
watch(() => props.initialSubTab, value => { section.value = tabs.some(tab => tab.id === value) ? value : 'movimentacoes' }, { immediate: true })
watch(section, value => emit('update:subTab', value), { immediate: true })
const month = ref(movementMonthKey(new Date()))
const selectedMonth = computed({ get: () => month.value.slice(5), set: value => { month.value = `${selectedYear.value}-${value}` } })
const selectedYear = computed({ get: () => month.value.slice(0, 4), set: value => { month.value = `${value}-${selectedMonth.value}` } })
const months = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, '0'), label: new Date(2000, index, 1).toLocaleDateString('pt-BR', { month: 'long' }) }))
const pages = ref({})
const pageSize = 6
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })
const format = value => number.format(value)
const monthLabel = computed(() => /^\d{4}-(0[1-9]|1[0-2])$/.test(month.value)
  ? new Date(`${month.value}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : 'Selecione um mês')
watch([month, section], () => { pages.value = {} })
const { items, variations } = useItems()
const { movements } = useMovements()
const years = computed(() => [...new Set([
  ...Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - index),
  Number(selectedYear.value),
  ...movements.value.map(row => Number(movementMonthKey(row.date).slice(0, 4))).filter(year => year > 0),
])].sort((a, b) => b - a))
const { workOrders } = useWorkOrders()
const { motors } = useMotors()
const { closings } = useClosings()
const { destinations, getDestFullName } = useDestinations()
const report = computed(() => buildMovementReport(movements.value, month.value))
const stockRows = computed(() => {
  const byId = new Map(items.value.map(item => [item.id, item]))
  return variations.value.flatMap(variation => {
    const item = byId.get(variation.itemId)
    return item ? [{ item, variation, status: stockAlertStatus(variation, item) }] : []
  })
})
const lowStock = computed(() => stockRows.value.filter(row => row.status !== 'ok').sort((a, b) =>
  ({ zero: 0, critical: 1, alert: 2 })[a.status] - ({ zero: 0, critical: 1, alert: 2 })[b.status]
  || a.item.name.localeCompare(b.item.name, 'pt-BR')))
const destinationAlerts = computed(() => buildDestinationAlerts(stockRows.value, destinations.value, getDestFullName))
const openOrders = computed(() => workOrders.value.filter(order => !order.maintenanceEndDate))
const maintenanceMotors = computed(() => motors.value.filter(motor => motor.status === 'em_manutencao'))
const latestClosing = computed(() => [...closings.value].sort((a, b) => b.year - a.year || b.month - a.month)[0])
const inventoryTarget = status => ({ tab: 'inventario', section: 'estoque', status })
const metrics = computed(() => {
  if (section.value === 'movimentacoes') return [
    { label: 'Entradas', value: report.value.entries, note: 'registros no período', tone: 'success' },
    { label: 'Saídas', value: report.value.exits, note: 'registros no período', tone: 'danger' },
    { label: 'Variações movimentadas', value: report.value.variations, note: 'sem ajustes de estoque', tone: 'info' },
    { label: 'Ajustes e conferências', value: report.value.adjustments, note: 'separados do consumo', tone: 'warning' },
  ]
  if (section.value === 'estoque') return [
    { label: 'Sem estoque', value: stockRows.value.filter(row => row.status === 'zero').length, note: 'variações', tone: 'danger' },
    { label: 'Estoque crítico', value: stockRows.value.filter(row => row.status === 'critical').length, note: 'variações', tone: 'warning' },
    { label: 'Em alerta', value: stockRows.value.filter(row => row.status === 'alert').length, note: 'variações', tone: 'warning' },
    { label: 'Estoque regular', value: stockRows.value.filter(row => row.status === 'ok').length, note: 'variações', tone: 'success' },
  ]
  return [
    { label: 'Ordens abertas', value: openOrders.value.length, note: 'posição atual', tone: 'info' },
    { label: 'Motores em manutenção', value: maintenanceMotors.value.length, note: 'posição atual', tone: 'warning' },
    { label: 'Último fechamento', value: latestClosing.value ? `${String(latestClosing.value.month).padStart(2, '0')}/${latestClosing.value.year}` : '—', note: 'estoque consolidado', tone: 'success' },
  ]
})
const panels = computed(() => {
  if (section.value === 'movimentacoes') return [
    { id: 'materials', title: 'Materiais com mais retiradas', description: 'Ordenados por número de saídas. Quantidades mantêm a unidade de cada variação.', empty: 'Nenhuma saída registrada neste período.', rows: report.value.materials.map(row => ({
      id: row.id, title: row.name, variation: { values: row.values, extras: row.extras }, detail: `${row.count} saída${row.count === 1 ? '' : 's'}`,
      value: `${format(row.qty)} ${row.unit}`, target: { tab: 'movimentacoes', subTab: 'historico', search: row.name },
    })) },
    { id: 'destinations', title: 'Destinos com mais retiradas', description: 'Ordenados por número de saídas, sem somar unidades diferentes.', empty: 'Nenhum consumo por destino neste período.', rows: report.value.destinations.map(row => ({
      id: row.id, title: row.name, detail: row.units.map(([unit, qty]) => `${format(qty)} ${unit}`).join(' · '),
      value: `${row.count} saída${row.count === 1 ? '' : 's'}`, target: { tab: 'movimentacoes', subTab: 'historico', search: row.name === 'Sem destino informado' ? '' : row.name },
    })) },
  ]
  if (section.value === 'estoque') return [
    { id: 'stock', title: 'Materiais que precisam de atenção', description: 'Saldos atuais, começando pelos materiais sem estoque.', empty: 'Nenhum material em alerta.', rows: lowStock.value.map(row => ({
      id: row.variation.id, title: row.item.name, variation: row.variation, detail: `Mínimo: ${format(row.variation.minStock ?? row.item.minStock ?? 0)} ${row.item.unit || ''}`,
      value: `${format(row.variation.stock)} ${row.item.unit || ''}`, status: row.status === 'zero' || row.status === 'critical' ? 'danger' : 'warning', statusLabel: { zero: 'Sem estoque', critical: 'Crítico', alert: 'Alerta' }[row.status],
      target: { ...inventoryTarget(row.status), search: row.item.name },
    })) },
    { id: 'alerts', title: 'Destinos em alerta', description: 'Vínculos de materiais e regras de estoque por destino.', empty: 'Nenhum destino com material em alerta.', rows: destinationAlerts.value.map(row => ({
      id: row.id, title: row.label, detail: `${row.zero} sem estoque · ${row.critical + row.alert} em alerta`, value: `${row.total} alerta${row.total === 1 ? '' : 's'}`,
      target: { tab: 'movimentacoes', subTab: 'resumo' },
    })) },
  ]
  return [
    { id: 'orders', title: 'Ordens de serviço abertas', description: 'Abra uma ordem para acompanhar os detalhes e os materiais utilizados.', empty: 'Nenhuma ordem de serviço aberta.', rows: openOrders.value.map(row => ({
      id: row.id, title: `OS #${row.number} · ${row.title}`, detail: [row.requestedBy, row.destinationName || row.maintenanceLocationName].filter(Boolean).join(' · '),
      value: 'Abrir ordem →', target: { tab: 'ordens', subTab: 'ordens', orderId: row.id },
    })) },
    { id: 'motors', title: 'Motores em manutenção', description: 'Consulte os motores e acompanhe a manutenção em andamento.', empty: 'Nenhum motor em manutenção.', rows: maintenanceMotors.value.map(row => ({
      id: row.id, title: row.tag || row.name || 'Motor', detail: [row.name, row.destinationName].filter(Boolean).join(' · '),
      value: row.power ? `${row.power} ${row.powerUnit || 'CV'}` : 'Consultar →', target: { tab: 'motores' },
    })) },
  ]
})
const pageCount = panel => Math.max(1, Math.ceil(panel.rows.length / pageSize))
const currentPage = panel => Math.min(pages.value[panel.id] || 1, pageCount(panel))
const panelRows = panel => panel.rows.slice((currentPage(panel) - 1) * pageSize, currentPage(panel) * pageSize)
function changePage(panel, direction) { pages.value[panel.id] = Math.min(pageCount(panel), Math.max(1, currentPage(panel) + direction)) }
</script>

<template>
  <div class="reports-page">
    <header class="reports-header">
      <div><h1 class="ds-page-title">Relatórios</h1><p class="ds-page-subtitle">Movimentações por período e situação atual do estoque e da manutenção.</p></div>
      <AppLink :target="{ tab: 'movimentacoes', subTab: 'historico' }" class="reports-history" @navigate="emit('go', $event)">Abrir histórico completo →</AppLink>
    </header>
    <SectionTabs v-model="section" route-tab="relatorios" :tabs="tabs" aria-label="Tipo de relatório" />
    <section class="reports-context">
      <template v-if="section === 'movimentacoes'">
        <div><h2>{{ monthLabel }}</h2><p>Os indicadores consideram somente o mês selecionado. Ajustes não entram no consumo.</p></div>
        <div class="reports-period" role="group" aria-label="Selecionar período do relatório">
          <AppButton variant="secondary" size="icon" aria-label="Mês anterior" title="Mês anterior" @click="month = shiftReportMonth(month, -1)">←</AppButton>
          <label class="reports-month">Mês<select v-model="selectedMonth" class="ds-input"><option v-for="option in months" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          <label class="reports-year">Ano<select v-model="selectedYear" class="ds-input"><option v-for="year in years" :key="year" :value="String(year)">{{ year }}</option></select></label>
          <AppButton variant="secondary" size="icon" aria-label="Próximo mês" title="Próximo mês" @click="month = shiftReportMonth(month, 1)">→</AppButton>
          <AppButton variant="ghost" size="sm" :disabled="month === movementMonthKey(new Date())" @click="month = movementMonthKey(new Date())">Mês atual</AppButton>
        </div>
      </template>
      <div v-else><h2>{{ section === 'estoque' ? 'Posição atual do estoque' : 'Situação atual da manutenção' }}</h2><p>Esta visão usa os cadastros e saldos atuais; não representa um fechamento histórico.</p></div>
      <AppLink v-if="section === 'manutencao'" :target="{ tab: 'inventario', section: 'fechamentos', requiresAuth: true }" class="reports-history" @navigate="emit('go', $event)">Ver fechamentos →</AppLink>
    </section>
    <section class="reports-metrics" aria-label="Resumo do relatório">
      <article v-for="metric in metrics" :key="metric.label" class="reports-metric" :class="`reports-tone-${metric.tone}`">
        <h2>{{ metric.label }}</h2><strong>{{ typeof metric.value === 'number' ? format(metric.value) : metric.value }}</strong><p>{{ metric.note }}</p>
      </article>
    </section>
    <div class="reports-grid">
      <section v-for="panel in panels" :key="panel.id" class="reports-panel">
        <header><div><h2>{{ panel.title }}</h2><p>{{ panel.description }}</p></div></header>
        <p v-if="!panel.rows.length" class="reports-empty">{{ panel.empty }}</p>
        <AppLink v-for="row in panelRows(panel)" :key="row.id" :target="row.target" class="reports-row" @navigate="emit('go', $event)">
          <div class="reports-row-content"><h3>{{ row.title }}</h3><AttributeBadges v-if="row.variation" class="reports-attributes mt-2" :variation="row.variation" /><p v-if="row.detail">{{ row.detail }}</p></div>
          <div class="reports-row-value"><strong>{{ row.value }}</strong><StatusBadge v-if="row.status" :status="row.status" :label="row.statusLabel" /></div>
        </AppLink>
        <footer v-if="panel.rows.length">
          <span>{{ panel.rows.length }} registros</span>
          <div v-if="pageCount(panel) > 1"><AppButton variant="ghost" size="md" :disabled="currentPage(panel) <= 1" @click="changePage(panel, -1)">Anterior</AppButton><span>{{ currentPage(panel) }} / {{ pageCount(panel) }}</span><AppButton variant="ghost" size="md" :disabled="currentPage(panel) >= pageCount(panel)" @click="changePage(panel, 1)">Próxima</AppButton></div>
        </footer>
      </section>
    </div>
    <p v-if="section === 'movimentacoes'" class="reports-note">Os links das listas abrem as consultas completas. O período acima se aplica aos indicadores desta página.</p>
  </div>
</template>

<style scoped>
.reports-page { display: grid; gap: 20px; color: var(--ds-text); }
.reports-header, .reports-context { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.reports-history { color: var(--ds-info); font-size: 13px; font-weight: 500; }
.reports-history:hover { text-decoration: underline; }
.reports-context { padding: 16px; border: 1px solid var(--ds-border); border-radius: var(--ds-radius-card); background: var(--ds-panel); }
.reports-context h2, .reports-panel h2 { font-size: 17px; font-weight: 600; }
.reports-context p, .reports-panel header p { margin-top: 6px; font-size: 14px; color: var(--ds-text-muted); line-height: 1.5; }
.reports-period { display: flex; align-items: end; gap: 8px; flex-wrap: wrap; }
.reports-month, .reports-year { display: grid; gap: 4px; font-size: 12px; color: var(--ds-text-soft); }
.reports-month { min-width: 140px; }
.reports-month select { text-transform: capitalize; }
.reports-year { min-width: 88px; }
.reports-period .ds-input { min-height: 40px; }
.reports-period > .ds-button { min-height: 40px; }
.reports-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.reports-metric { --report-tone: var(--ds-info-solid); padding: 16px; border-radius: var(--ds-radius-card); background: var(--report-tone); color: var(--ds-primary-text); }
.reports-tone-success { --report-tone: var(--ds-success-solid); }
.reports-tone-danger { --report-tone: var(--ds-danger-solid); }
.reports-tone-warning { --report-tone: var(--ds-warning-solid); }
.reports-metric h2 { font-size: 12px; font-weight: 600; }
.reports-metric strong { display: block; margin: 8px 0 4px; font-size: 28px; line-height: 1.2; font-weight: 650; font-variant-numeric: tabular-nums; }
.reports-metric p { font-size: 11px; }
.reports-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: stretch; }
.reports-panel { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--ds-border); border-radius: var(--ds-radius-card); background: var(--ds-panel); overflow: hidden; }
.reports-panel > header { min-height: 84px; padding: 16px; border-bottom: 1px solid var(--ds-border-subtle); }
.reports-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 120px; padding: 16px 20px; border-bottom: 1px solid var(--ds-border-subtle); }
.reports-row:hover { background: var(--ds-surface-hover); }
.reports-row-content { min-width: 0; }
.reports-row h3 { font-size: 17px; line-height: 1.4; font-weight: 600; overflow-wrap: anywhere; }
.reports-attributes :deep(.ds-attribute-tag) { font-size: 13px; padding: 4px 8px; }
.reports-row-content > p { margin-top: 8px; color: var(--ds-text-muted); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.reports-row-value { display: grid; justify-items: end; gap: 8px; text-align: right; font-size: 18px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.reports-panel > footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; min-height: 60px; margin-top: auto; padding: 10px 16px; font-size: 14px; color: var(--ds-text-muted); }
.reports-panel > footer > div { display: flex; align-items: center; gap: 8px; }
.reports-empty { padding: 32px 16px; text-align: center; color: var(--ds-text-muted); font-size: 13px; }
.reports-note { font-size: 12px; color: var(--ds-text-muted); }
@media (max-width: 900px) { .reports-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 480px) { .reports-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .reports-row { gap: 10px; } .reports-row-value { max-width: 100px; flex-shrink: 1; } .reports-period { width: 100%; } .reports-month { min-width: 0; flex: 1; } }
</style>
