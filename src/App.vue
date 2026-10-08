<script setup>
import { ref, computed, provide, onMounted, onUnmounted, watch, nextTick, defineAsyncComponent } from 'vue'
import AppSidebar from './components/ui/AppSidebar.vue'
import RailFooter from './components/ui/RailFooter.vue'
import ToastContainer from './components/ui/ToastContainer.vue'
import StockConfirmationDialog from './components/movements/StockConfirmationDialog.vue'
import { stockConfirmationRevision } from './composables/useStockConfirmation.js'
import LoginModal from './components/ui/LoginModal.vue'
import AppButton from './components/ui/AppButton.vue'
import AppLink from './components/ui/AppLink.vue'
import { routeHref, parseRoute, routeIdentity } from './utils/navigation.js'
import AppDialog from './components/ui/AppDialog.vue'
import AppModal from './components/ui/AppModal.vue'
import DashboardView from './views/DashboardView.vue'
import { canUseLocalVisualStyles, useTheme } from './composables/useTheme.js'
import { useItems } from './composables/useItems.js'
import { useMovements } from './composables/useMovements.js'
import { useLocations } from './composables/useLocations.js'
import { useDestinations } from './composables/useDestinations.js'
import { usePeople } from './composables/usePeople.js'
import { useSuppliers } from './composables/useSuppliers.js'
import { useRoles } from './composables/useRoles.js'
import { useEpis } from './composables/useEpis.js'
import { useUsers } from './composables/useUsers.js'
import { useAuth } from './composables/useAuth.js'
import { useWorkOrders } from './composables/useWorkOrders.js'
import { useMotors } from './composables/useMotors.js'
import { useClosings } from './composables/useClosings.js'
import { useToast } from './composables/useToast.js'
import { buildGlobalSearchResults } from './utils/globalSearch.js'
import { failedSourceNames } from './utils/sync.js'

const CatalogView = defineAsyncComponent(() => import('./views/CatalogView.vue'))
const CadastrosView = defineAsyncComponent(() => import('./views/CadastrosView.vue'))
const InventarioView = defineAsyncComponent(() => import('./views/InventarioView.vue'))
const MovimentacoesView = defineAsyncComponent(() => import('./views/MovimentacoesView.vue'))
const OrdensServicoView = defineAsyncComponent(() => import('./views/OrdensServicoView.vue'))
const MotoresView = defineAsyncComponent(() => import('./views/MotoresView.vue'))
const EpisTab = defineAsyncComponent(() => import('./components/cadastros/EpisTab.vue'))

const { isDark, toggleTheme, visualStyleName, cycleStyle } = useTheme()
const canChangeVisualStyle = canUseLocalVisualStyles()
const { items, variations, uniqueGroups, activeGroup, activeCategory, activeSubcategory, setActiveGroup, facets, hasActiveFilters, toggleFilter, clearFilters, loadData: loadItems } = useItems()
const { loadData: loadMovements } = useMovements()
const { loadData: loadLocations } = useLocations()
const { destinations, getDestFullName, loadData: loadDestinations } = useDestinations()
const { activePeople, loadData: loadPeople } = usePeople()
const { loadData: loadSuppliers } = useSuppliers()
const { loadData: loadRoles } = useRoles()
const { loadData: loadEpis } = useEpis()
const { loadData: loadUsers } = useUsers()
const { isAdmin, isLoggedIn, canOperate, user, logout, checkSession, changeOwnPassword } = useAuth()
const { workOrders, loadData: loadWorkOrders } = useWorkOrders()
const { motors, loadData: loadMotors } = useMotors()
const { loadData: loadClosings } = useClosings()
const { success, error } = useToast()
watch(stockConfirmationRevision, async () => {
  try { await Promise.all([loadItems(), loadMovements()]) }
  catch { error('Movimentação salva. Atualize a página para recarregar os saldos e o histórico.') }
})
const localBrandFavicon = '/local-brand/favicon.png'
const localBrandName = ref('Estoque')
const environmentBadge = ref(null)
const backupHealth = ref(null)
let healthTimer = null
provide('isAdmin', isAdmin)
provide('isLoggedIn', isLoggedIn)
provide('canOperate', canOperate)
provide('environmentBadge', environmentBadge)
const UI_STATE_KEY = 'estoque_ui_state_v1'

function loadUiState() {
  try {
    return JSON.parse(sessionStorage.getItem(UI_STATE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveUiState(patch) {
  const current = loadUiState()
  sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({ ...current, ...patch }))
}

function loadStoredList(key) {
  try {
    const value = localStorage.getItem(key) || '[]'
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const savedUiState = loadUiState()
const savedActiveTab = ['dashboard', 'catalogo', 'inventario', 'movimentacoes', 'ordens', 'motores', 'cadastros', 'epis-admin'].includes(savedUiState.activeTab)
  ? savedUiState.activeTab
  : 'dashboard'
const showLoginModal = ref(false)
const mobileSidebarOpen = ref(false)
const mobileSidebarTrigger = ref(null)
const railOpen = ref(false)
const catalogSidebarDismissed = ref(true)
const catalogSearch = ref(savedUiState.catalogSearch || '')
const catalogRef = ref(null)
const activeTab = ref(savedActiveTab)
const requestedInventorySection = ref(savedUiState.inventorySection || 'estoque')
const requestedInventoryStatus = ref(savedUiState.inventoryStatus || 'all')
const requestedInventorySearch = ref(savedUiState.inventorySearch || '')
const requestedOrdersTab = ref(savedUiState.ordersTab || 'ordens')
const requestedOrderFocusId = ref('')
const workOrderPreview = ref(null)
const movBrowsing = ref(true)
const movSubTab = ref(savedUiState.movSubTab || 'entrada')
const requestedMovSubTab = ref(savedUiState.movSubTab || 'entrada')
const requestedMovSearch = ref(null)
const requestedMovementPrefill = ref(null)
const requestedItemId = ref('')
const requestedVariationId = ref('')
let routeReady = false
let applyingRoute = false
const movRef = ref(null)
const requestedCadastrosTab = ref(savedUiState.cadastrosTab || 'hierarquia')
const globalCreateOpen = ref(false)
const globalSearchOpen = ref(false)
const globalSearchQuery = ref('')
const globalSearchActiveIndex = ref(0)
const GLOBAL_SEARCH_RECENTS_KEY = 'estoque_global_search_recents_v1'
const globalSearchRecentIds = ref(loadStoredList(GLOBAL_SEARCH_RECENTS_KEY))
const syncFailures = ref([])
const syncing = ref(false)
const globalCreateRootRef = ref(null)
const shortcutHelpOpen = ref(false)
const shortcutPrefix = ref('')
const passwordModalOpen = ref(false)
const ownPassword = ref('')
const ownPasswordConfirm = ref('')
const changingOwnPassword = ref(false)
const mustChangePassword = computed(() => Boolean(user.value?.mustChangePassword))
let shortcutPrefixTimer = null

watch(mustChangePassword, required => {
  if (required) passwordModalOpen.value = true
}, { immediate: true })

const catalogSidebarAvailable = computed(() =>
  activeTab.value === 'catalogo'
)
const showCatalogSidebar = computed(() => catalogSidebarAvailable.value && !catalogSidebarDismissed.value)
const anySidebar = computed(() => showCatalogSidebar.value)
const catalogSidebarDocked = computed(() => showCatalogSidebar.value)
const sidebarDocked = computed(() => catalogSidebarDocked.value)
const sidebarOverlayOpen = computed(() => anySidebar.value && mobileSidebarOpen.value && !sidebarDocked.value)
const navigationGroups = [
  { id: 'inicio', label: 'Início', defaultTab: 'dashboard', icon: 'M2.25 12l8.954-8.955a1.125 1.125 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75', tabs: [{ id: 'dashboard', label: 'Início' }] },
  {
    id: 'materiais',
    label: 'Materiais',
    defaultTab: 'catalogo',
    icon: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
    tabs: [
      { id: 'catalogo', label: 'Consultar materiais' },
      { id: 'inventario', label: 'Controle de estoque', target: { tab: 'inventario', section: 'estoque' } },
    ],
  },
  {
    id: 'epis',
    label: 'EPIs',
    defaultTab: 'inventario',
    target: { tab: 'inventario', section: 'epis', requiresAuth: true },
    requiresAuth: true,
    icon: 'M9 12.75 11.25 15 15 9.75m5.25-3.735A11.96 11.96 0 0 1 12 3c-2.755 0-5.3.93-7.33 2.494-.54.416-.83 1.075-.745 1.752.516 4.135 2.56 7.75 5.535 10.303L12 19.5l2.54-1.951c2.976-2.554 5.02-6.168 5.535-10.303a1.823 1.823 0 0 0-.745-1.752Z',
    tabs: [
      { id: 'epi-control', label: 'Controle de EPIs', target: { tab: 'inventario', section: 'epis', requiresAuth: true } },
      { id: 'epis-admin', label: 'Editar EPIs', target: { tab: 'epis-admin', requiresAdmin: true }, requiresAdmin: true },
    ],
  },
  { id: 'movimentacoes', label: 'Entradas e saídas', defaultTab: 'movimentacoes', icon: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5', tabs: [{ id: 'movimentacoes', label: 'Entradas e saídas' }] },
  {
    id: 'manutencao',
    label: 'Manutenção',
    defaultTab: 'ordens',
    icon: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085',
    tabs: [
      { id: 'ordens', label: 'Ordens de serviço' },
      { id: 'motores', label: 'Motores' },
    ],
  },
  { id: 'administracao', label: 'Administração', defaultTab: 'cadastros', icon: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75', tabs: [{ id: 'cadastros', label: 'Administração' }], requiresAdmin: true },
]
const activeNavigationGroup = computed(() => {
  if (activeTab.value === 'inventario' && requestedInventorySection.value === 'epis') return 'epis'
  return navigationGroups.find(group => group.tabs.some(tab => tab.id === activeTab.value))?.id || 'inicio'
})
const activeTabLabel = computed(() => {
  if (activeNavigationGroup.value === 'epis') return activeTab.value === 'epis-admin' ? 'Editar EPIs' : 'Controle de EPIs'
  for (const group of navigationGroups) {
    const tab = group.tabs.find(t => t.id === activeTab.value)
    if (tab) return group.tabs.length > 1 ? `${group.label} · ${tab.label}` : tab.label
  }
  return ''
})

const navigationShortcuts = [
  { chord: 'G D', key: 'd', label: 'Início', target: { tab: 'dashboard' } },
  { chord: 'G C', key: 'c', label: 'Consultar materiais', target: { tab: 'catalogo' } },
  { chord: 'G I', key: 'i', label: 'Controle de estoque', target: { tab: 'inventario' } },
  { chord: 'G V', key: 'v', label: 'Entradas e saídas', target: { tab: 'movimentacoes' } },
  { chord: 'G O', key: 'o', label: 'Ordens de Serviço', target: { tab: 'ordens' } },
  { chord: 'G M', key: 'm', label: 'Motores', target: { tab: 'motores' } },
  { chord: 'G A', key: 'a', label: 'Administração', target: { tab: 'cadastros', requiresAdmin: true } },
]

const actionShortcuts = [
  { chord: '?', label: 'Abrir atalhos' },
  { chord: 'Ctrl K', label: 'Busca global' },
  { chord: 'Ctrl N', label: 'Registrar ou cadastrar' },
]

function canAccessTarget(target = {}) {
  if (target.requiresAdmin) return isAdmin.value
  if (target.requiresOperator) return canOperate.value
  if (target.requiresAuth) return isLoggedIn.value
  return true
}

const visibleNavigationGroups = computed(() =>
  navigationGroups
    .filter(canAccessTarget)
    .map(group => ({ ...group, tabs: group.tabs.filter(canAccessTarget) }))
)

const visibleNavigationShortcuts = computed(() =>
  navigationShortcuts.filter(shortcut => canAccessTarget(shortcut.target))
)

const createActions = computed(() => [
  { id: 'entrada', label: 'Registrar entrada', hint: 'Material chegando ao estoque', target: { tab: 'movimentacoes', subTab: 'entrada', requiresOperator: true } },
  { id: 'saida', label: 'Registrar saída', hint: 'Retirar material do estoque', target: { tab: 'movimentacoes', subTab: 'saida', requiresOperator: true } },
  { id: 'os', label: 'Nova ordem de serviço', hint: 'Abrir uma atividade de manutenção', target: { tab: 'ordens', subTab: 'nova', requiresOperator: true } },
  { id: 'pessoa', label: 'Cadastrar pessoa', hint: 'Funcionário ou solicitante', target: { tab: 'cadastros', subTab: 'pessoas', requiresAdmin: true } },
  { id: 'destino', label: 'Cadastrar destino', hint: 'Máquina, local ou destino', target: { tab: 'cadastros', subTab: 'destinos', requiresAdmin: true } },
  { id: 'item', label: 'Cadastrar material', hint: 'Abrir organização dos materiais', target: { tab: 'cadastros', subTab: 'hierarquia', requiresAdmin: true } },
].filter(action => canAccessTarget(action.target)))

const visibleActionShortcuts = computed(() =>
  actionShortcuts.filter(shortcut => shortcut.chord !== 'Ctrl N' || createActions.value.length)
)

const globalSearchCommands = computed(() => [
  { id: 'command:entrada', type: 'Ação', title: 'Registrar entrada', subtitle: 'Material chegando ao estoque', keywords: 'receber adicionar', target: { tab: 'movimentacoes', subTab: 'entrada', requiresOperator: true } },
  { id: 'command:saida', type: 'Ação', title: 'Registrar saída', subtitle: 'Retirar material para pessoa ou destino', keywords: 'retirar entregar', target: { tab: 'movimentacoes', subTab: 'saida', requiresOperator: true } },
  { id: 'command:os', type: 'Ação', title: 'Nova ordem de serviço', subtitle: 'Abrir atividade de manutenção', keywords: 'manutenção nova os', target: { tab: 'ordens', subTab: 'nova', requiresOperator: true } },
  { id: 'command:estoque', type: 'Ação', title: 'Consultar estoque', subtitle: 'Quantidades, locais e alertas', keywords: 'inventário material', target: { tab: 'inventario', section: 'estoque' } },
  { id: 'command:historico', type: 'Ação', title: 'Ver histórico de movimentações', subtitle: 'Entradas e saídas registradas', keywords: 'auditoria rastrear', target: { tab: 'movimentacoes', subTab: 'historico' } },
  { id: 'command:fechamento', type: 'Ação', title: 'Fazer fechamento mensal', subtitle: 'Salvar a posição oficial do estoque', keywords: 'mês relatório', target: { tab: 'inventario', section: 'fechamentos', requiresAdmin: true } },
].filter(command => canAccessTarget(command.target)))

const globalSearchResults = computed(() => {
  const results = buildGlobalSearchResults({
    query: globalSearchQuery.value,
    commands: globalSearchCommands.value,
    recentIds: globalSearchRecentIds.value,
    workOrders: workOrders.value,
    motors: motors.value,
    people: activePeople.value,
    destinations: destinations.value,
    items: items.value,
    variations: variations.value,
    getDestinationName: getDestFullName,
  })
  return results.filter(result => canAccessTarget(result.target))
})

watch(globalSearchQuery, () => { globalSearchActiveIndex.value = 0 })
// Load all data from API
async function loadAllData() {
  const sources = [
    ['materiais', loadItems],
    ['movimentações', loadMovements],
    ['locais', loadLocations],
    ['destinos', loadDestinations],
    ['pessoas', loadPeople],
    ['fornecedores', loadSuppliers],
    ['cargos', loadRoles],
    ['EPIs', loadEpis],
    ['ordens de serviço', loadWorkOrders],
    ['motores', loadMotors],
    ['fechamentos', loadClosings],
  ]
  syncing.value = true
  try {
    const results = await Promise.allSettled(sources.map(([, load]) => load()))
    syncFailures.value = failedSourceNames(sources, results)
    if (syncFailures.value.length) console.error('Erro ao carregar dados:', syncFailures.value)
    try { await loadUsers() } catch {}
  } finally {
    syncing.value = false
  }
}

async function loadLocalBrand() {
  try {
    const response = await fetch('/local-brand/brand.json', { cache: 'no-store' })
    if (!response.ok) return
    const data = await response.json()
    if (typeof data.name === 'string' && data.name.trim()) localBrandName.value = data.name.trim()
  } catch {}
}

async function loadEnvironmentBadge() {
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname)) return
  try {
    const response = await fetch('/api/meta', { cache: 'no-store' })
    if (response.ok) environmentBadge.value = await response.json()
  } catch {}
}

async function loadHealthStatus() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' })
    const data = await response.json()
    backupHealth.value = data.backup || null
  } catch {}
}

onMounted(async () => {
  loadLocalBrand()
  loadEnvironmentBadge()
  loadHealthStatus()
  healthTimer = window.setInterval(loadHealthStatus, 15_000)
  await checkSession()
  if (['cadastros', 'epis-admin'].includes(activeTab.value) && !isAdmin.value) activeTab.value = 'catalogo'
  await loadAllData()
  if (savedUiState.catalogGroup) activeGroup.value = savedUiState.catalogGroup
  await applyLocationRoute()
  routeReady = true
  window.history.replaceState(null, '', routeHref(currentRoute.value))
  window.addEventListener('hashchange', applyLocationRoute)
  window.addEventListener('app:data-invalidated', loadAllData)
  window.addEventListener('keydown', handleGlobalShortcutKeydown)
  window.addEventListener('mousedown', handleGlobalPointerDown, true)
})

onUnmounted(() => {
  if (healthTimer) window.clearInterval(healthTimer)
  window.removeEventListener('app:data-invalidated', loadAllData)
  window.removeEventListener('keydown', handleGlobalShortcutKeydown)
  window.removeEventListener('mousedown', handleGlobalPointerDown, true)
  window.removeEventListener('hashchange', applyLocationRoute)
  clearShortcutPrefix()
})

// Reload data after login
watch(user, (newUser, oldUser) => {
  if (newUser && !oldUser) loadAllData()
  if (!isAdmin.value && ['cadastros', 'epis-admin'].includes(activeTab.value)) activeTab.value = 'catalogo'
})

const scrollPositions = {}
watch(activeTab, (_, previous) => { scrollPositions[previous] = window.scrollY }, { flush: 'sync' })
watch(activeTab, async value => {
  await nextTick()
  requestAnimationFrame(() => window.scrollTo(0, scrollPositions[value] || 0))
}, { flush: 'post' })

watch(activeTab, value => {
  loadAllData()
  railOpen.value = false
  if (value === 'catalogo' || value === 'movimentacoes') catalogSidebarDismissed.value = true
  saveUiState({ activeTab: value })
})

watch(movBrowsing, browsing => {
  if (activeTab.value === 'movimentacoes' && browsing) catalogSidebarDismissed.value = true
})

// Fecha painéis antigos ao trocar de contexto; a abertura é sempre manual.
watch([anySidebar, catalogSidebarDocked], ([available, docked]) => {
  if (!available || docked) mobileSidebarOpen.value = false
}, { immediate: true })

function openMobileSidebar() {
  mobileSidebarOpen.value = true
  nextTick(() => document.querySelector('[data-mobile-sidebar-close]')?.focus())
}

function closeMobileSidebar(restoreFocus = true) {
  mobileSidebarOpen.value = false
  if (restoreFocus) {
    nextTick(() => (mobileSidebarTrigger.value?.$el || mobileSidebarTrigger.value)?.focus?.())
  }
}

function closeCatalogSidebar() {
  if (catalogSidebarDocked.value) {
    catalogSidebarDismissed.value = true
    return
  }
  closeMobileSidebar()
}

function toggleSidebar() {
  if (catalogSidebarAvailable.value) {
    catalogSidebarDismissed.value = !catalogSidebarDismissed.value
    return
  }
  mobileSidebarOpen.value ? closeMobileSidebar() : openMobileSidebar()
}

function selectSidebarGroup(group) {
  requestedItemId.value = ''
  requestedVariationId.value = ''
  setActiveGroup(group)
}

watch(catalogSearch, value => saveUiState({ catalogSearch: value }))
watch(activeGroup, value => saveUiState({ catalogGroup: value || '' }))
watch(requestedInventorySection, value => { if (value) saveUiState({ inventorySection: value }) })
watch(requestedInventoryStatus, value => { if (value && value !== '__pending__') saveUiState({ inventoryStatus: value }) })
watch(requestedInventorySearch, value => saveUiState({ inventorySearch: value || '' }))
watch(movSubTab, value => { if (value) saveUiState({ movSubTab: value }) })
watch(requestedOrdersTab, value => { if (value) saveUiState({ ordersTab: value }) })
watch(requestedCadastrosTab, value => { if (value) saveUiState({ cadastrosTab: value }) })

function onLoginClose() {
  showLoginModal.value = false
}

function openPasswordModal() {
  ownPassword.value = ''
  ownPasswordConfirm.value = ''
  passwordModalOpen.value = true
}

function closePasswordModal() {
  if (mustChangePassword.value) return
  passwordModalOpen.value = false
  ownPassword.value = ''
  ownPasswordConfirm.value = ''
  changingOwnPassword.value = false
}

async function submitOwnPassword() {
  if (changingOwnPassword.value) return
  if (!ownPassword.value.trim()) { error('Informe a nova senha.'); return }
  if (ownPassword.value !== ownPasswordConfirm.value) { error('As senhas nao conferem.'); return }
  changingOwnPassword.value = true
  const result = await changeOwnPassword(ownPassword.value)
  changingOwnPassword.value = false
  if (!result.ok) { error(result.error); return }
  success('Senha alterada.')
  closePasswordModal()
  await loadAllData()
}

function logoutFromMenu() {
  logout()
  activeTab.value = 'catalogo'
}

function openMovementTab(tab, prefill = null) {
  if (!canOperate.value) return
  shortcutHelpOpen.value = false
  requestedMovementPrefill.value = prefill
  requestedMovSubTab.value = ''
  requestedMovSearch.value = ''
  activeTab.value = 'movimentacoes'
  nextTick(() => {
    requestedMovSubTab.value = tab
  })
}

function openGlobalSearch() {
  globalSearchOpen.value = true
  globalCreateOpen.value = false
  shortcutHelpOpen.value = false
  clearShortcutPrefix()
  globalSearchActiveIndex.value = 0
}

function closeGlobalSearch() {
  globalSearchOpen.value = false
  globalSearchQuery.value = ''
}

function handleGlobalSearchKeydown(event) {
  if (!globalSearchResults.value.length) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    globalSearchActiveIndex.value = (globalSearchActiveIndex.value + 1) % globalSearchResults.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    globalSearchActiveIndex.value = (globalSearchActiveIndex.value - 1 + globalSearchResults.value.length) % globalSearchResults.value.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    openGlobalSearchResult(globalSearchResults.value[globalSearchActiveIndex.value])
  }
}

function openGlobalCreate() {
  if (!createActions.value.length) return
  globalCreateOpen.value = !globalCreateOpen.value
  shortcutHelpOpen.value = false
  clearShortcutPrefix()
}

function runCreateAction(action) {
  globalCreateOpen.value = false
  navigateTab(action.target)
}

function closeTopPopup() {
  if (workOrderPreview.value) {
    workOrderPreview.value = null
    return true
  }
  if (globalSearchOpen.value) {
    closeGlobalSearch()
    return true
  }
  if (globalCreateOpen.value) {
    globalCreateOpen.value = false
    return true
  }
  if (shortcutHelpOpen.value) {
    closeShortcutHelp()
    return true
  }
  if (passwordModalOpen.value) {
    closePasswordModal()
    return true
  }
  if (mobileSidebarOpen.value) {
    closeMobileSidebar()
    return true
  }
  if (railOpen.value) {
    railOpen.value = false
    return true
  }
  if (showLoginModal.value) {
    showLoginModal.value = false
    return true
  }
  return false
}

function handleGlobalPointerDown(event) {
  const target = event.target
  if (!(target instanceof Node)) return
  if (globalCreateOpen.value && !globalCreateRootRef.value?.contains(target)) {
    globalCreateOpen.value = false
  }
}

function isEditableTarget(target) {
  const tagName = String(target?.tagName || '').toLowerCase()
  return Boolean(target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName))
}

function clearShortcutPrefix() {
  shortcutPrefix.value = ''
  if (shortcutPrefixTimer) {
    window.clearTimeout(shortcutPrefixTimer)
    shortcutPrefixTimer = null
  }
}

function startShortcutPrefix(prefix) {
  clearShortcutPrefix()
  shortcutPrefix.value = prefix
  shortcutPrefixTimer = window.setTimeout(clearShortcutPrefix, 1500)
}

function toggleShortcutHelp() {
  shortcutHelpOpen.value = !shortcutHelpOpen.value
  clearShortcutPrefix()
}

function closeShortcutHelp() {
  shortcutHelpOpen.value = false
}

function runNavigationShortcut(shortcut) {
  closeShortcutHelp()
  navigateTab(shortcut.target)
}

function openGlobalSearchResult(result) {
  if (!result) return
  if (!result.id.startsWith('command:')) {
    globalSearchRecentIds.value = [result.id, ...globalSearchRecentIds.value.filter(id => id !== result.id)].slice(0, 6)
    localStorage.setItem(GLOBAL_SEARCH_RECENTS_KEY, JSON.stringify(globalSearchRecentIds.value))
  }
  closeGlobalSearch()
  if (result.target?.search) {
    catalogSearch.value = result.target.search
  }
  navigateTab(result.target)
  if (result.target?.tab === 'catalogo') {
    nextTick(() => {
      if (result.target.variationId) {
        catalogRef.value?.openVariationById?.(result.target.variationId)
      } else if (result.target.itemId) {
        catalogRef.value?.openItemById?.(result.target.itemId)
      }
    })
  }
}

function openContextQuickMovement(payload) {
  if (!payload?.variationId || !payload?.itemId) {
    if (payload?.targetType && payload?.targetKey) {
      openMovementTab(payload?.type || 'saida', payload)
      return
    }
    openMovementTab(payload?.type || 'saida')
    return
  }
  openMovementTab(payload.type || 'saida', payload)
}

function handleMovementComplete(target) {
  requestedMovementPrefill.value = null
  navigateTab(target)
}

function selectMainTab(tabId) {
  if (tabId === 'cadastros' && !isAdmin.value) {
    if (!isLoggedIn.value) showLoginModal.value = true
    else error('A administração é restrita a administradores.')
    return
  }
  activeTab.value = tabId
}

function selectNavigationGroup(group) {
  if (!canAccessTarget(group)) {
    if (!isLoggedIn.value) showLoginModal.value = true
    else error('A administração é restrita a administradores.')
    return
  }
  if (group.target) {
    navigateTab(group.target)
    return
  }
  navigateTab(group.defaultTab)
}

function isNavigationTabActive(group, tab) {
  if (activeNavigationGroup.value !== group.id) return false
  const target = tab.target || { tab: tab.id }
  if (activeTab.value !== target.tab) return false
  if (target.section) return requestedInventorySection.value === target.section
  return true
}

function navigateTab(target) {
  const options = typeof target === 'string' ? {} : (target || {})
  const tab = typeof target === 'string' ? target : options.tab
  if (!tab) return
  if (!canAccessTarget(options) || (['cadastros', 'epis-admin'].includes(tab) && !isAdmin.value)) {
    if (!isLoggedIn.value) showLoginModal.value = true
    else error('Seu perfil não tem permissão para esta ação.')
    return
  }
  requestedItemId.value = options.itemId || ''
  requestedVariationId.value = options.variationId || ''
  if ((tab === 'fechamentos' || options.section === 'fechamentos') && !isLoggedIn.value) {
    showLoginModal.value = true
    return
  }
  if (options.section === 'epis' && !isLoggedIn.value) {
    showLoginModal.value = true
    return
  }
  if (options.orderId) {
    const order = workOrders.value.find(item => item.id === options.orderId)
    if (order) {
      activeTab.value = 'ordens'
      workOrderPreview.value = order
      return
    }
  }
  if (tab === 'fechamentos') {
    requestedInventorySection.value = 'fechamentos'
    requestedInventorySearch.value = ''
    activeTab.value = 'inventario'
    return
  }
  if (tab === 'inventario') {
    const section = options.section || (applyingRoute ? 'estoque' : requestedInventorySection.value)
    const status = options.status ?? (applyingRoute ? 'all' : requestedInventoryStatus.value)
    const search = options.search ?? (applyingRoute ? '' : requestedInventorySearch.value)
    if (!applyingRoute && !('search' in options) && !('status' in options)) {
      requestedInventorySection.value = section
      activeTab.value = 'inventario'
      return
    }
    requestedInventorySection.value = ''
    requestedInventoryStatus.value = '__pending__'
    requestedInventorySearch.value = ''
    activeTab.value = 'inventario'
    nextTick(() => {
      requestedInventorySection.value = section
      requestedInventoryStatus.value = status
      requestedInventorySearch.value = search
    })
    return
  }
  if (tab === 'movimentacoes' && options.subTab) {
    const search = options.search || ''
    if (['entrada', 'saida'].includes(options.subTab)) {
      openMovementTab(options.subTab)
      return
    }
    requestedMovSubTab.value = ''
    requestedMovSearch.value = ''
    activeTab.value = 'movimentacoes'
    nextTick(() => {
      requestedMovSubTab.value = options.subTab
      requestedMovSearch.value = search
    })
    return
  }
  if (tab === 'cadastros' && options.subTab) {
    if (!isAdmin.value) {
      if (!isLoggedIn.value) showLoginModal.value = true
      else error('A administração é restrita a administradores.')
      return
    }
    requestedCadastrosTab.value = options.subTab
    activeTab.value = 'cadastros'
    return
  }
  if (tab === 'ordens') {
    requestedOrdersTab.value = ''
    requestedOrderFocusId.value = ''
    activeTab.value = 'ordens'
    nextTick(() => {
      requestedOrdersTab.value = options.subTab || 'ordens'
      requestedOrderFocusId.value = options.orderId || ''
    })
    return
  }
  activeTab.value = tab
}

const currentRoute = computed(() => {
  const route = { tab: activeTab.value }
  if (route.tab === 'catalogo') Object.assign(route, { search: catalogSearch.value, group: activeGroup.value, category: activeCategory.value, subcategory: activeSubcategory.value, itemId: requestedItemId.value, variationId: requestedVariationId.value })
  if (route.tab === 'inventario') Object.assign(route, { section: requestedInventorySection.value, status: requestedInventoryStatus.value, search: requestedInventorySearch.value, variationId: requestedVariationId.value })
  if (route.tab === 'movimentacoes') Object.assign(route, { subTab: movSubTab.value, search: movSubTab.value === 'historico' ? (movRef.value?.histSearch ?? requestedMovSearch.value) : '' })
  if (route.tab === 'cadastros') route.subTab = requestedCadastrosTab.value
  if (route.tab === 'ordens') Object.assign(route, { subTab: requestedOrdersTab.value, orderId: workOrderPreview.value?.id || requestedOrderFocusId.value })
  return route
})
watch(currentRoute, route => {
  if (!routeReady || applyingRoute || route.status === '__pending__' || (route.tab === 'inventario' && !route.section) || (route.tab === 'movimentacoes' && !route.subTab)) return
  const href = routeHref(route)
  if (href === window.location.hash) return
  const method = routeIdentity(parseRoute(window.location.hash)) === routeIdentity(route) ? 'replaceState' : 'pushState'
  window.history[method](null, '', href)
})
async function applyLocationRoute() {
  const route = parseRoute(window.location.hash)
  if (!route) return
  applyingRoute = true
  workOrderPreview.value = null
  navigateTab(route)
  if (route.tab === 'catalogo') {
    catalogSearch.value = route.search || ''
    activeGroup.value = route.group || null
    activeCategory.value = route.category || null
    activeSubcategory.value = route.subcategory || null
  }
  if (route.tab === 'movimentacoes' && !route.subTab) { requestedMovSubTab.value = 'historico'; movSubTab.value = 'historico' }
  await nextTick()
  await nextTick()
  applyingRoute = false
}

function handleGlobalShortcutKeydown(event) {
  const key = String(event.key || '').toLowerCase()
  if (key === 'escape') {
    if (closeTopPopup()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    clearShortcutPrefix()
    return
  }
  if ((event.ctrlKey || event.metaKey) && key === 'k') {
    event.preventDefault()
    openGlobalSearch()
    return
  }
  if ((event.ctrlKey || event.metaKey) && key === 'n') {
    event.preventDefault()
    openGlobalCreate()
    return
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return
  if (isEditableTarget(event.target)) return
  if (key === '?' || (key === '/' && event.shiftKey)) {
    event.preventDefault()
    toggleShortcutHelp()
    return
  }
  if (shortcutPrefix.value === 'g') {
    const shortcut = navigationShortcuts.find(item => item.key === key)
    if (shortcut) {
      event.preventDefault()
      runNavigationShortcut(shortcut)
    } else if (key !== 'g') {
      clearShortcutPrefix()
    }
    return
  }
  if (key === 'g') {
    event.preventDefault()
    startShortcutPrefix('g')
    return
  }
}
</script>

<template>
  <div class="ds-page" :class="{ 'has-docked-sidebar': sidebarDocked }">
    <!-- Catalog Sidebar -->
    <Teleport to="#workspace-filters" defer>
    <AppSidebar
      v-if="showCatalogSidebar"
      id="mobile-side-panel"
      :class="{ 'mobile-sidebar-open': mobileSidebarOpen, 'catalog-sidebar-docked': catalogSidebarDocked }"
      :role="sidebarOverlayOpen ? 'dialog' : undefined"
      :aria-modal="sidebarOverlayOpen ? 'true' : undefined"
      aria-label="Categorias e filtros"
      :groups="uniqueGroups"
      :active-group="activeGroup"
      :facets="facets"
      :has-active-filters="hasActiveFilters"
      :search="catalogSearch"
      :show-search="activeTab !== 'catalogo'"
      @close="closeCatalogSidebar"
      @select-group="selectSidebarGroup"
      @toggle-filter="(k, v) => toggleFilter(k, v)"
      @clear-filters="clearFilters"
      @update:search="v => catalogSearch = v"
      @search-submit="catalogRef?.triggerSearchDrill?.()"
    />

    </Teleport>
    <button
      v-if="sidebarOverlayOpen"
      type="button"
      class="mobile-sidebar-backdrop"
      aria-label="Fechar painel lateral"
      @click="closeMobileSidebar()"
    ></button>

    <!-- Rail de navegação -->
    <aside
      class="ds-rail"
      :class="{ 'rail-open': railOpen }"
      :role="railOpen ? 'dialog' : undefined"
      :aria-modal="railOpen ? 'true' : undefined"
      aria-label="Navegação principal"
    >
      <button class="ds-rail-brand" type="button" title="Ir para o início" @click="selectMainTab('dashboard')">
        <img
          :src="localBrandFavicon"
          :alt="localBrandName"
          class="h-7 w-7 rounded-md object-contain"
          @error="$event.currentTarget.style.display = 'none'"
        />
        <span class="ds-rail-brand-name text-sm truncate">{{ localBrandName }}</span>
        <span
          v-if="environmentBadge"
          class="rounded px-1.5 py-0.5 text-[10px] font-bold leading-none"
          :class="environmentBadge.env === 'PROD' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'ds-environment-badge-dev'"
        >
          {{ environmentBadge.env }}
        </span>
      </button>

      <nav class="ds-rail-nav ds-scrollbar">
        <template v-for="group in visibleNavigationGroups" :key="group.id">
          <AppLink
            :target="group.target || group.defaultTab"
            class="ds-rail-item"
            :class="activeNavigationGroup === group.id ? 'ds-rail-item-active' : ''"
            :title="group.requiresAdmin && !isAdmin ? 'Acesso restrito a administradores' : group.label"
            @navigate="selectNavigationGroup(group)"
          >
            <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :d="group.icon" />
            </svg>
            {{ group.label }}
          </AppLink>
          <div v-if="group.tabs.length > 1">
            <div class="ds-rail-sub">
              <AppLink
                v-for="tab in group.tabs"
                :key="tab.id"
                :target="tab.target || tab.id"
                class="ds-rail-item"
                :class="isNavigationTabActive(group, tab) ? 'ds-rail-item-active' : ''"
                @navigate="navigateTab"
              >
                {{ tab.label }}
              </AppLink>
            </div>
          </div>
        </template>
      </nav>

    </aside>

    <RailFooter
      class="ds-fixed-rail-footer"
      :class="{
        'sidebar-footer-open': railOpen || anySidebar,
        'sidebar-filter-active': anySidebar,
      }"
      :is-logged-in="isLoggedIn"
      :user-name="user?.name || ''"
      :is-dark="isDark"
      :can-change-visual-style="canChangeVisualStyle"
      :visual-style-name="visualStyleName"
      @login="showLoginModal = true"
      @change-password="openPasswordModal"
      @logout="logoutFromMenu"
      @toggle-visual-style="cycleStyle"
      @toggle-theme="toggleTheme"
    />

    <button
      v-if="railOpen"
      type="button"
      class="rail-backdrop"
      aria-label="Fechar navegação"
      @click="railOpen = false"
    ></button>

    <!-- Main content -->
    <div
      class="ds-app-main"
      :inert="sidebarOverlayOpen ? '' : undefined"
    >
      <!-- Topbar -->
      <header class="ds-topbar">
        <AppButton
          variant="ghost"
          size="icon"
          class="!w-9 !min-w-9 !h-9 min-[840px]:!hidden"
          aria-label="Abrir navegação"
          :aria-expanded="railOpen"
          @click="railOpen = true"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </AppButton>
        <AppButton
          v-if="catalogSidebarAvailable"
          ref="mobileSidebarTrigger"
          class="!w-9 !min-w-9 !h-9"
          variant="ghost"
          size="icon"
          aria-controls="mobile-side-panel"
          :aria-expanded="sidebarDocked || mobileSidebarOpen"
          :aria-label="sidebarDocked || mobileSidebarOpen ? 'Fechar filtros' : catalogSidebarAvailable ? 'Mostrar categorias e filtros' : 'Mostrar filtros'"
          :title="sidebarDocked || mobileSidebarOpen ? 'Fechar filtros' : catalogSidebarAvailable ? 'Mostrar categorias e filtros' : 'Mostrar filtros'"
          @click="toggleSidebar"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 5.25h16.5M6.75 12h10.5m-7.5 6.75h4.5" />
          </svg>
        </AppButton>
        <span class="ds-topbar-title truncate">{{ activeTabLabel }}</span>
        <div class="ml-auto flex items-center gap-1.5">
          <AppButton
            variant="secondary"
            size="sm"
            title="Busca global (Ctrl+K)"
            @click="openGlobalSearch"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
            </svg>
            <span class="hidden sm:inline">Busca global</span>
          </AppButton>
          <div v-if="createActions.length" ref="globalCreateRootRef" class="relative">
            <AppButton
              variant="primary"
              size="sm"
              title="Registrar ou cadastrar (Ctrl+N)"
              :aria-expanded="globalCreateOpen"
              @click="openGlobalCreate"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span class="hidden sm:inline">Registrar</span>
            </AppButton>
            <div
              v-if="globalCreateOpen"
              class="ds-menu ds-pop absolute right-0 mt-2 w-72 p-2"
            >
              <button
                v-for="action in createActions"
                :key="action.id"
                type="button"
                class="ds-menu-item"
                @click="runCreateAction(action)"
              >
                <span class="block text-sm font-semibold text-gray-900 dark:text-gray-100">{{ action.label }}</span>
                <span class="block text-xs text-gray-500 dark:text-gray-400">{{ action.hint }}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 p-4 sm:p-5 lg:p-6">
        <div
          v-if="isAdmin && backupHealth?.status === 'error'"
          class="mb-4 rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm"
          role="alert"
        >
          <p class="font-semibold text-red-800 dark:text-red-200">O backup automático falhou</p>
          <p class="mt-0.5 text-xs text-red-700 dark:text-red-300">
            Última falha: {{ backupHealth.lastFailureAt ? new Date(backupHealth.lastFailureAt).toLocaleString('pt-BR') : 'agora' }}. Verifique a pasta de backup e o log do servidor.
          </p>
        </div>
        <div
          v-if="syncFailures.length"
          class="mb-4 flex flex-col gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <div>
            <p class="font-semibold text-amber-800 dark:text-amber-200">Alguns dados não foram atualizados</p>
            <p class="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
              Falha em {{ syncFailures.join(', ') }}. Os demais dados continuam disponíveis.
            </p>
          </div>
          <AppButton variant="secondary" size="sm" :loading="syncing" @click="loadAllData">
            Tentar novamente
          </AppButton>
        </div>

        <div class="ds-workspace-layout" :class="{ 'ds-workspace-filtered': sidebarDocked }">
        <div id="workspace-filters" v-show="sidebarDocked"></div>
        <div class="min-w-0">
        <KeepAlive>
          <DashboardView v-if="activeTab === 'dashboard'" @go="navigateTab" />
        </KeepAlive>

        <!-- Catálogo tab -->
        <CatalogView
          v-if="activeTab === 'catalogo'"
          ref="catalogRef"
          :search="catalogSearch"
          :initial-item-id="requestedItemId"
          :initial-variation-id="requestedVariationId"
          @update:record="record => { requestedItemId = record.itemId || ''; requestedVariationId = record.variationId || '' }"
          @update:search="v => catalogSearch = v"
          @quick-movement="openContextQuickMovement"
          @open-work-order="order => navigateTab({ tab: 'ordens', subTab: 'ordens', orderId: order.id })"
        />

        <!-- Cadastros tab -->
        <CadastrosView
          v-if="activeTab === 'cadastros'"
          :initial-tab="requestedCadastrosTab"
          :backup-health="backupHealth"
          @update:tab="v => requestedCadastrosTab = v"
          @quick-movement="openContextQuickMovement"
        />

        <EpisTab v-if="activeTab === 'epis-admin' && isAdmin" />

        <!-- Inventário tab -->
        <KeepAlive>
        <InventarioView
          v-if="activeTab === 'inventario'"
          :initial-section="requestedInventorySection"
          :initial-status="requestedInventoryStatus"
          :initial-search="requestedInventorySearch"
          :initial-variation-id="requestedVariationId"
          @update:variation="id => requestedVariationId = id"
          @update:section="v => requestedInventorySection = v"
          @update:status="v => requestedInventoryStatus = v"
          @update:search="v => requestedInventorySearch = v"
          @quick-movement="openContextQuickMovement"
          @open-work-order="order => navigateTab({ tab: 'ordens', subTab: 'ordens', orderId: order.id })"
        />

        </KeepAlive>
        <!-- Movimentações tab -->
        <MovimentacoesView
          v-if="activeTab === 'movimentacoes'"
          ref="movRef"
          :initial-sub-tab="requestedMovSubTab"
          :initial-history-search="requestedMovSearch"
          :prefill-movement="requestedMovementPrefill"
          @update:browsing="v => movBrowsing = v"
          @update:sub-tab="v => { movSubTab = v; requestedMovSubTab = v }"
          @movement-complete="handleMovementComplete"
          @navigate="navigateTab"
        />

        <!-- Ordens de Serviço tab -->
        <OrdensServicoView
          v-if="activeTab === 'ordens'"
          mode="general"
          :initial-tab="requestedOrdersTab"
          :focus-order-id="requestedOrderFocusId"
          @update:tab="v => requestedOrdersTab = v"
        />

        <!-- Motores tab -->
        <MotoresView v-if="activeTab === 'motores'" />
        </div>
        </div>
      </main>
    </div>

    <OrdensServicoView
      v-if="workOrderPreview"
      :key="workOrderPreview.id"
      :mode="workOrderPreview.motorId ? 'motor' : 'general'"
      embedded
      popup-only
      :initial-motor-id="workOrderPreview.motorId || ''"
      :focus-order-id="workOrderPreview.id"
      @closed="workOrderPreview = null"
      @updated="workOrderPreview = null"
    />

    <!-- Login modal -->
    <LoginModal :show="showLoginModal" @close="showLoginModal = false" />

    <AppDialog
      :visible="globalSearchOpen"
      align="top"
      aria-label="Busca global"
      @close="closeGlobalSearch"
    >
      <div class="ds-menu w-full max-w-2xl overflow-hidden rounded-xl">
        <div class="border-b border-gray-200 p-3 dark:border-white/[0.08]">
          <div class="relative">
            <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
            </svg>
            <input
              v-model="globalSearchQuery"
              type="text"
              autofocus
              class="ds-input !py-3 !pl-9"
              placeholder="Buscar ou executar uma ação..."
              role="combobox"
              aria-controls="global-search-results"
              :aria-activedescendant="globalSearchResults[globalSearchActiveIndex] ? `global-result-${globalSearchActiveIndex}` : undefined"
              @keydown="handleGlobalSearchKeydown"
            />
          </div>
        </div>
        <div id="global-search-results" class="max-h-[26rem] overflow-auto p-2" role="listbox">
          <button
            v-for="(result, index) in globalSearchResults"
            :key="result.id"
            :id="`global-result-${index}`"
            type="button"
            class="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            :class="index === globalSearchActiveIndex ? 'bg-gray-100 dark:bg-white/[0.06]' : ''"
            role="option"
            :aria-selected="index === globalSearchActiveIndex"
            @mouseenter="globalSearchActiveIndex = index"
            @click="openGlobalSearchResult(result)"
          >
            <span class="mt-0.5 rounded-md bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">{{ result.type }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{{ result.title }}</span>
              <span class="block truncate text-xs text-gray-500 dark:text-gray-400">{{ result.subtitle }}</span>
            </span>
          </button>
          <div v-if="globalSearchQuery && !globalSearchResults.length" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhum resultado encontrado.
          </div>
          <div v-if="!globalSearchQuery && !globalSearchResults.length" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Ações frequentes e registros abertos recentemente aparecem aqui.
          </div>
        </div>
      </div>
    </AppDialog>

    <AppModal
      :visible="passwordModalOpen"
      :title="mustChangePassword ? 'Defina sua senha' : 'Trocar senha'"
      :persistent="mustChangePassword"
      :show-actions="false"
      @close="closePasswordModal"
    >
      <p class="mb-4 text-xs text-gray-500 dark:text-gray-400">
        {{ mustChangePassword ? 'A senha inicial precisa ser substituída antes de continuar.' : `Conta: ${user?.name}` }}
      </p>
        <form class="space-y-3" @submit.prevent="submitOwnPassword">
          <input
            v-model="ownPassword"
            type="password"
            autocomplete="new-password"
            class="ds-input"
            placeholder="Nova senha"
            autofocus
          />
          <input
            v-model="ownPasswordConfirm"
            type="password"
            autocomplete="new-password"
            class="ds-input"
            placeholder="Confirmar nova senha"
          />
          <div class="flex justify-end gap-2 pt-1">
            <AppButton v-if="!mustChangePassword" type="button" variant="secondary" @click="closePasswordModal">Cancelar</AppButton>
            <AppButton type="submit" variant="primary" :loading="changingOwnPassword">Salvar senha</AppButton>
          </div>
        </form>
    </AppModal>

    <AppDialog
      v-if="shortcutHelpOpen"
      visible
      aria-label="Atalhos de teclado"
      @close="closeShortcutHelp"
    >
      <div class="ds-menu w-full max-w-xl">
        <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/[0.08]">
          <div>
            <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Atalhos</h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">Use fora dos campos de digitação.</p>
          </div>
          <AppButton variant="ghost" size="xs" @click="closeShortcutHelp">Fechar</AppButton>
        </div>

        <div class="grid gap-4 p-4 md:grid-cols-2">
          <section>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Navegação</h3>
            <div class="space-y-1">
              <button
                v-for="shortcut in visibleNavigationShortcuts"
                :key="shortcut.chord"
                type="button"
                class="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                @click="runNavigationShortcut(shortcut)"
              >
                <span>{{ shortcut.label }}</span>
                <kbd class="ds-kbd">{{ shortcut.chord }}</kbd>
              </button>
            </div>
          </section>

          <section>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Ações</h3>
            <div class="space-y-1">
              <div
                v-for="shortcut in visibleActionShortcuts"
                :key="shortcut.chord"
                class="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
              >
                <span>{{ shortcut.label }}</span>
                <kbd class="ds-kbd">{{ shortcut.chord }}</kbd>
              </div>
              <div class="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-gray-700 dark:text-gray-200">
                <span>Fechar menus</span>
                <kbd class="ds-kbd">Esc</kbd>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppDialog>

    <div
      v-if="shortcutPrefix"
      class="ds-menu fixed bottom-5 left-5 z-50 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200"
    >
      {{ shortcutPrefix.toUpperCase() }}...
    </div>

    <!-- Toasts -->
    <ToastContainer />
    <StockConfirmationDialog />
  </div>
</template>
