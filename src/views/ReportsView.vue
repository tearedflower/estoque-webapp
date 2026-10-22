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
import AppDialog from '../components/ui/AppDialog.vue'
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
const periodMode = ref('month')
const group = ref('')
const category = ref('')
const selectedDestination = ref(null)
const rankBy = ref('value')
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const money = value => value === null || value === undefined ? 'Sem custo de entrada' : currency.format(value)
const historyTarget = row => ({ tab: 'movimentacoes', subTab: 'historico', search: row.name, variationId: row.variationId || '' })
function orderedRows(rows) {
  return [...rows].sort((a, b) => (rankBy.value === 'value' ? (b.estimatedValue ?? -1) - (a.estimatedValue ?? -1) : 0)
    || b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))
}
const selectedMonth = computed({ get: () => month.value.slice(5), set: value => { month.value = `${selectedYear.value}-${value}` } })
const selectedYear = computed({ get: () => month.value.slice(0, 4), set: value => { month.value = `${value}-${selectedMonth.value}` } })
const reportPeriod = computed(() => periodMode.value === 'year' ? selectedYear.value : month.value)
const months = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, '0'), label: new Date(2000, index, 1).toLocaleDateString('pt-BR', { month: 'long' }) }))
const pages = ref({})
watch(rankBy, () => { pages.value = {} })
const pageSize = 6
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })
const format = value => number.format(value)
const periodLabel = computed(() => periodMode.value === 'year' ? `Ano ${selectedYear.value}`
  : new Date(`${month.value}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
watch([reportPeriod, section, category], () => { pages.value = {}; selectedDestination.value = null })
watch(group, () => { category.value = ''; selectedDestination.value = null; pages.value = {} })
watch(selectedDestination, () => { pages.value.ranking = 1 })
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
const groups = computed(() => [...new Set(movements.value.map(row => row.itemGroup).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')))
const categories = computed(() => [...new Set(movements.value.filter(row => !group.value || row.itemGroup === group.value).map(row => row.itemCategory).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')))
const report = computed(() => buildMovementReport(movements.value, reportPeriod.value, { group: group.value, category: category.value }))
const materialRanking = computed(() => orderedRows(selectedDestination.value === null ? report.value.materials
  : buildMovementReport(movements.value, reportPeriod.value, { group: group.value, category: category.value, destination: selectedDestination.value }).materials))
const rankingPanel = computed(() => ({ id: 'ranking', rows: materialRanking.value, pageSize: 20 }))
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
    { label: 'Valor estimado das saídas', value: money(report.value.estimatedExitValue), note: '', tone: 'info' },
    { label: 'Sem custo de entrada', value: report.value.unpricedExits, note: 'retiradas fora do total estimado', tone: 'warning' },
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
    { id: 'materials', title: rankBy.value === 'value' ? 'Materiais com maior valor retirado' : 'Materiais com mais retiradas', description: '', empty: 'Nenhuma saída registrada neste período.', rows: orderedRows(report.value.materials).map(row => ({
      id: row.id, title: row.name, item: items.value.find(item => item.id === row.itemId), variation: { values: row.values, extras: row.extras }, detail: `${row.count} saída${row.count === 1 ? '' : 's'} · Custo unitário médio: ${money(row.averageUnitCost)}`,
      value: `${format(row.qty)} ${row.unit}`,
      cost: money(row.estimatedValue),
      historyTarget: historyTarget(row),
    })) },
    { id: 'destinations', title: rankBy.value === 'value' ? 'Destinos com maior valor retirado' : 'Destinos com mais retiradas', description: '', empty: 'Nenhum consumo por destino neste período.', rows: orderedRows(report.value.destinations).map(row => ({
      id: row.id, title: row.name, detail: row.units.map(([unit, qty]) => `${format(qty)} ${unit}`).join(' · '),
      value: `${row.count} saída${row.count === 1 ? '' : 's'} →`, destination: row.name,
      cost: money(row.estimatedValue),
    })) },
  ]
  if (section.value === 'estoque') return [
    { id: 'stock', title: 'Materiais que precisam de atenção', description: 'Saldos atuais, começando pelos materiais sem estoque.', empty: 'Nenhum material em alerta.', rows: lowStock.value.map(row => ({
      id: row.variation.id, title: row.item.name, item: row.item, variation: row.variation, detail: `Mínimo: ${format(row.variation.minStock ?? row.item.minStock ?? 0)} ${row.item.unit || ''}`,
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
const pageCount = panel => Math.max(1, Math.ceil(panel.rows.length / (panel.pageSize || pageSize)))
const currentPage = panel => Math.min(pages.value[panel.id] || 1, pageCount(panel))
const panelRows = panel => panel.rows.slice((currentPage(panel) - 1) * (panel.pageSize || pageSize), currentPage(panel) * (panel.pageSize || pageSize))
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
        <div><h2>{{ periodLabel }}</h2><p>Os indicadores consideram {{ periodMode === 'year' ? 'todos os meses do ano selecionado' : 'somente o mês selecionado' }}. Ajustes não entram no consumo.</p></div>
        <div class="reports-period" role="group" aria-label="Selecionar período do relatório">
          <div class="reports-period-date">
            <button type="button" class="reports-period-arrow" :aria-label="periodMode === 'month' ? 'Mês anterior' : 'Ano anterior'" @click="month = shiftReportMonth(month, periodMode === 'month' ? -1 : -12)">‹</button>
            <label v-if="periodMode === 'month'" class="reports-month"><span class="sr-only">Mês</span><select v-model="selectedMonth"><option v-for="option in months" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label class="reports-year"><span class="sr-only">Ano</span><select v-model="selectedYear"><option v-for="year in years" :key="year" :value="String(year)">{{ year }}</option></select></label>
            <button type="button" class="reports-period-arrow" :aria-label="periodMode === 'month' ? 'Próximo mês' : 'Próximo ano'" @click="month = shiftReportMonth(month, periodMode === 'month' ? 1 : 12)">›</button>
          </div>
          <div class="reports-period-mode" role="group" aria-label="Agrupar por mês ou ano">
            <button type="button" :aria-pressed="periodMode === 'month'" @click="periodMode = 'month'">Mês</button>
            <button type="button" :aria-pressed="periodMode === 'year'" @click="periodMode = 'year'">Ano</button>
          </div>
        </div>
      </template>
      <div v-else><h2>{{ section === 'estoque' ? 'Posição atual do estoque' : 'Situação atual da manutenção' }}</h2><p>Esta visão usa os cadastros e saldos atuais; não representa um fechamento histórico.</p></div>
      <AppLink v-if="section === 'manutencao'" :target="{ tab: 'inventario', section: 'fechamentos', requiresAuth: true }" class="reports-history" @navigate="emit('go', $event)">Ver fechamentos →</AppLink>
    </section>
    <div v-if="section === 'movimentacoes'" class="reports-filters">
      <label>Grupo<select v-model="group" class="ds-input"><option value="">Todos os grupos</option><option v-for="name in groups" :key="name" :value="name">{{ name }}</option></select></label>
      <label>Categoria<select v-model="category" class="ds-input"><option value="">Todas as categorias</option><option v-for="name in categories" :key="name" :value="name">{{ name }}</option></select></label>
    </div>
    <section class="reports-metrics" aria-label="Resumo do relatório">
      <article v-for="metric in metrics" :key="metric.label" class="reports-metric" :class="`reports-tone-${metric.tone}`">
        <h2>{{ metric.label }}</h2><strong>{{ typeof metric.value === 'number' ? format(metric.value) : metric.value }}</strong><p>{{ metric.note }}</p>
      </article>
    </section>
    <AppDialog :visible="section === 'movimentacoes' && selectedDestination !== null" :aria-label="`Ranking de materiais · ${selectedDestination || ''}`" @close="selectedDestination = null">
    <section class="reports-panel reports-ranking" aria-label="Ranking de materiais por destino">
      <header class="reports-ranking-header">
        <div><h2>Ranking de materiais · {{ selectedDestination }}</h2><p>{{ periodLabel }} · {{ materialRanking.length }} variações</p></div>
        <AppButton variant="ghost" size="icon" aria-label="Fechar ranking" @click="selectedDestination = null">×</AppButton>
      </header>
      <div class="reports-ranking-scroll">
        <table class="ds-table reports-ranking-table">
          <caption class="sr-only">Materiais retirados para {{ selectedDestination }} em {{ periodLabel }}</caption>
          <thead><tr><th scope="col">Posição</th><th scope="col">Material</th><th scope="col">Variação</th><th scope="col" class="text-right">Saídas</th><th scope="col" class="text-right">Quantidade retirada</th><th scope="col" class="text-right">Custo unitário médio</th><th scope="col" class="text-right">Valor estimado</th><th scope="col">Ações</th></tr></thead>
          <tbody>
            <tr v-for="(row, index) in panelRows(rankingPanel)" :key="row.id">
              <td class="reports-ranking-position">{{ (currentPage(rankingPanel) - 1) * rankingPanel.pageSize + index + 1 }}º</td>
              <td class="reports-ranking-name">{{ row.name }}</td>
              <td class="reports-ranking-attributes"><AttributeBadges :item="items.find(item => item.id === row.itemId)" :variation="{ values: row.values, extras: row.extras }" compact /></td>
              <td class="text-right">{{ format(row.count) }}</td>
              <td class="text-right"><strong>{{ format(row.qty) }}</strong> <span class="reports-ranking-unit">{{ row.unit }}</span></td>
              <td class="text-right">{{ money(row.averageUnitCost) }}</td>
              <td class="text-right"><strong>{{ money(row.estimatedValue) }}</strong></td>
              <td class="reports-ranking-actions"><AppLink :target="historyTarget(row)" class="ds-button ds-button-secondary ds-button-sm" @navigate="emit('go', $event)">Ver histórico →</AppLink></td>
            </tr>
            <tr v-if="!materialRanking.length"><td colspan="8" class="reports-empty">Nenhuma saída registrada para este destino com os filtros selecionados.</td></tr>
          </tbody>
        </table>
      </div>
      <footer v-if="materialRanking.length">
        <span>{{ materialRanking.length }} variações</span>
        <div v-if="pageCount(rankingPanel) > 1"><AppButton variant="ghost" :disabled="currentPage(rankingPanel) <= 1" @click="changePage(rankingPanel, -1)">Anterior</AppButton><span>{{ currentPage(rankingPanel) }} / {{ pageCount(rankingPanel) }}</span><AppButton variant="ghost" :disabled="currentPage(rankingPanel) >= pageCount(rankingPanel)" @click="changePage(rankingPanel, 1)">Próxima</AppButton></div>
      </footer>
    </section>
    </AppDialog>
    <div v-if="section === 'movimentacoes'" class="reports-filters">
      <label>Ordenar rankings<select v-model="rankBy" class="ds-input"><option value="value">Maior valor retirado</option><option value="count">Mais saídas</option></select></label>
    </div>
    <div class="reports-grid">
      <section v-for="panel in panels" :key="panel.id" class="reports-panel">
        <header><div><h2>{{ panel.title }}</h2><p v-if="panel.description">{{ panel.description }}</p></div></header>
        <p v-if="!panel.rows.length" class="reports-empty">{{ panel.empty }}</p>
        <component :is="row.destination !== undefined ? 'button' : row.target ? AppLink : 'article'" v-for="row in panelRows(panel)" :key="row.id" :target="row.target" :type="row.destination !== undefined ? 'button' : undefined" class="reports-row" @click="row.destination !== undefined && (selectedDestination = row.destination)" @navigate="emit('go', $event)">
          <div class="reports-row-content"><h3>{{ row.title }}</h3><AttributeBadges v-if="row.variation" class="reports-attributes mt-2" :item="row.item" :variation="row.variation" /><p v-if="row.detail">{{ row.detail }}</p></div>
          <div class="reports-row-value"><strong>{{ row.value }}</strong><strong v-if="row.cost" class="reports-row-cost">{{ row.cost }}</strong><AppLink v-if="row.historyTarget" :target="row.historyTarget" class="ds-button ds-button-secondary ds-button-sm" @navigate="emit('go', $event)">Ver histórico →</AppLink><StatusBadge v-if="row.status" :status="row.status" :label="row.statusLabel" /></div>
        </component>
        <footer v-if="panel.rows.length">
          <span>{{ panel.rows.length }} registros</span>
          <div v-if="pageCount(panel) > 1"><AppButton variant="ghost" size="md" :disabled="currentPage(panel) <= 1" @click="changePage(panel, -1)">Anterior</AppButton><span>{{ currentPage(panel) }} / {{ pageCount(panel) }}</span><AppButton variant="ghost" size="md" :disabled="currentPage(panel) >= pageCount(panel)" @click="changePage(panel, 1)">Próxima</AppButton></div>
        </footer>
      </section>
    </div>
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
.reports-period { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.reports-period-mode { display: flex; padding: 3px; gap: 2px; border: 1px solid var(--ds-border); border-radius: 8px; background: var(--ds-surface); }
.reports-period-mode button { min-height: 34px; padding: 6px 16px; border-radius: 5px; font-size: 14px; font-weight: 600; color: var(--ds-text-muted); cursor: pointer; }
.reports-period-mode button[aria-pressed="true"] { color: var(--ds-primary-text); background: var(--ds-brand); }
.reports-period-date { display: flex; align-items: center; min-height: 42px; border: 1px solid var(--ds-border); border-radius: 8px; background: var(--ds-surface); overflow: hidden; }
.reports-month, .reports-year { display: flex; min-width: 0; }
.reports-period-date select { width: 100%; min-height: 40px; padding: 6px 10px; background: var(--ds-surface); color: var(--ds-text); font-size: 14px; font-weight: 600; cursor: pointer; }
.reports-month select { text-transform: capitalize; }
.reports-period-arrow { flex-shrink: 0; width: 36px; min-height: 40px; color: var(--ds-text-soft); font-size: 25px; cursor: pointer; }
.reports-period-arrow:hover, .reports-period-mode button:not([aria-pressed="true"]):hover { background: var(--ds-surface-hover); color: var(--ds-text); }
.reports-period :is(button, select):focus-visible { outline: 2px solid var(--ds-active-text); outline-offset: -2px; }
.reports-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
.reports-filters label { display: grid; gap: 4px; flex: 1 1 200px; font-size: 13px; color: var(--ds-text-soft); }
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
.reports-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 96px; padding: 12px 16px; border-bottom: 1px solid var(--ds-border-subtle); }
.reports-row:hover { background: var(--ds-surface-hover); }
button.reports-row { width: 100%; text-align: left; cursor: pointer; color: inherit; }
button.reports-row:focus-visible { outline: 2px solid var(--ds-info); outline-offset: -2px; }
.reports-row-content { min-width: 0; }
.reports-row h3 { font-size: 16px; line-height: 1.4; font-weight: 600; overflow-wrap: anywhere; }
.reports-attributes :deep(.ds-attribute-tag) { font-size: 12px; padding: 2px 6px; }
.reports-row-content > p { margin-top: 4px; color: var(--ds-text-muted); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.reports-row-value { display: grid; grid-template-columns: repeat(2, max-content); align-items: center; justify-items: end; gap: 6px 12px; text-align: right; font-size: 17px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.reports-row-value > :is(a, .ds-badge) { grid-column: 1 / -1; }
.reports-row-cost { color: var(--ds-info); }
.reports-panel > footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; min-height: 60px; margin-top: auto; padding: 10px 16px; font-size: 14px; color: var(--ds-text-muted); }
.reports-panel > footer > div { display: flex; align-items: center; gap: 8px; }
.reports-empty { padding: 32px 16px; text-align: center; color: var(--ds-text-muted); font-size: 13px; }
.reports-note { font-size: 12px; color: var(--ds-text-muted); }
.reports-ranking { width: min(1320px, 100%); max-height: calc(100dvh - 32px); box-shadow: var(--ds-shadow-panel); }
.reports-ranking-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; }
.reports-ranking-scroll { overflow: auto; min-height: 0; }
.reports-ranking > footer { flex-shrink: 0; }
.reports-ranking-table { min-width: 1200px; }
.reports-ranking-table td { padding: 8px 12px; font-size: 14px; font-variant-numeric: tabular-nums; }
.reports-ranking-position, .reports-ranking-unit { color: var(--ds-text-muted); }
.reports-ranking-name { font-weight: 500; min-width: 170px; }
.reports-ranking-attributes { min-width: 300px; width: 30%; }
.reports-ranking-attributes :deep(.ds-attribute-tag) { flex-shrink: 0; max-width: none; white-space: nowrap; font-size: 12px; padding: 2px 5px; }
.reports-ranking > header { min-height: 64px; padding: 12px 16px; }
.reports-ranking > footer { min-height: 44px; padding: 8px 16px; }
.reports-ranking-table td:nth-last-child(-n+4) { white-space: nowrap; }
.reports-ranking-actions .ds-button { display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; }
@media (max-width: 900px) { .reports-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 480px) { .reports-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .reports-row { gap: 10px; } .reports-row-value { max-width: 100px; flex-shrink: 1; } .reports-period { width: 100%; } .reports-period-date { flex: 1 1 100%; } .reports-month { flex: 1; } .reports-period-date > .reports-year { flex: 1; } }
</style>
