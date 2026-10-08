<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useItems } from '../../composables/useItems.js'
import { useRoles } from '../../composables/useRoles.js'
import { useEpis } from '../../composables/useEpis.js'
import { useToast } from '../../composables/useToast.js'
import { normalizeSearchText } from '../../utils/globalSearch.js'
import AttributeBadges from '../ui/AttributeBadges.vue'
import AppDialog from '../ui/AppDialog.vue'

const isLoggedIn = inject('isLoggedIn')
const { items, variations } = useItems()
const { activeRoles } = useRoles()
const {
  roleRules,
  addRoleRule,
  editRoleRule,
  deleteRoleRule,
} = useEpis()
const { success, error } = useToast()

const selectedRoleName = ref('')
const rolePickerOpen = ref(false)
const roleSearch = ref('')
const selectedRuleTarget = ref(null)
const ruleDayDrafts = ref({})
const ruleQuantityDrafts = ref({})
const selectorOpen = ref(false)
const selectorContext = ref('rule')
const selectorSearch = ref('')
const selectorScope = ref('levels')
const selectedGroup = ref('')
const selectedCategory = ref('')
const selectedSubcategory = ref('')
const selectedItemId = ref('')
const modalSelectedTarget = ref(null)

watch(activeRoles, roles => {
  if (!selectedRoleName.value && roles.length) selectedRoleName.value = roles[0].name
}, { immediate: true })

const targetTypeRank = { grupo: 1, categoria: 2, subcategoria: 3, item: 4, variacao: 5 }
const targetTypeLabels = {
  grupo: 'Grupo',
  categoria: 'Categoria',
  subcategoria: 'Subcategoria',
  item: 'Item',
  variacao: 'Variação',
}
const DIRECT_ITEMS_SUBCATEGORY = 'Itens diretos'

const itemById = computed(() => new Map(items.value.map(item => [item.id, item])))
const filteredRoles = computed(() => {
  const search = normalizeSearchText(roleSearch.value)
  if (!search) return activeRoles.value
  return activeRoles.value.filter(role => normalizeSearchText(role.name).includes(search))
})

function openRolePicker() {
  roleSearch.value = ''
  rolePickerOpen.value = true
}

function selectRole(role) {
  selectedRoleName.value = role.name
  rolePickerOpen.value = false
}

function hierarchy(item) {
  return [item.group, item.category, item.subcategory].filter(Boolean).join(' > ')
}

function variationLabel(variation, item) {
  const attrs = (item?.attributes || [])
    .map(attr => variation.values?.[attr] ? `${attr}: ${variation.values[attr]}` : '')
    .filter(Boolean)
  const extras = Object.entries(variation.extras || {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
  return [...attrs, ...extras].join(' / ') || 'Sem atributos'
}

function makeGroupTarget(group) {
  return { targetType: 'grupo', targetKey: group, targetLabel: group }
}

function makeCategoryTarget(group, category) {
  return { targetType: 'categoria', targetKey: `${group}|${category}`, targetLabel: `${group} > ${category}` }
}

function makeSubcategoryTarget(group, category, subcategory) {
  return { targetType: 'subcategoria', targetKey: `${group}|${category}|${subcategory}`, targetLabel: `${group} > ${category} > ${subcategory}` }
}

function makeItemTarget(item) {
  return {
    targetType: 'item',
    targetKey: item.id,
    targetLabel: `${hierarchy(item)} > ${item.name}`.replace(/^ > /, ''),
    itemId: item.id,
  }
}

function makeVariationTarget(variation, item) {
  return {
    targetType: 'variacao',
    targetKey: variation.id,
    targetLabel: `${item.name} - ${variationLabel(variation, item)}`,
    itemId: item.id,
    variationId: variation.id,
  }
}

function targetVariationRow(target) {
  if (target?.targetType !== 'variacao') return null
  const variation = variations.value.find(row => row.id === target.targetKey)
  const item = variation ? itemById.value.get(variation.itemId) : null
  return variation && item ? { variation, item } : null
}

function readableTargetLabel(target) {
  const label = String(target?.targetLabel || target?.targetKey || '').trim()
  if (!label) return '-'
  const parts = label.split('>').map(part => part.trim()).filter(Boolean)
  return parts[parts.length - 1] || label
}

const catalogTargets = computed(() => {
  const targets = []
  const seen = new Set()
  function add(target) {
    const id = `${target.targetType}:${target.targetKey}`
    if (seen.has(id)) return
    seen.add(id)
    targets.push(target)
  }

  for (const item of items.value) {
    if (item.group) add(makeGroupTarget(item.group))
    if (item.group && item.category) add(makeCategoryTarget(item.group, item.category))
    if (item.group && item.category && item.subcategory) {
      add(makeSubcategoryTarget(item.group, item.category, item.subcategory))
    }
    add(makeItemTarget(item))
  }

  for (const variation of variations.value) {
    const item = itemById.value.get(variation.itemId)
    if (!item) continue
    add(makeVariationTarget(variation, item))
  }

  return targets.sort((a, b) =>
    targetTypeRank[a.targetType] - targetTypeRank[b.targetType] ||
    a.targetLabel.localeCompare(b.targetLabel, 'pt-BR', { sensitivity: 'base', numeric: true })
  )
})

function filterTargets(search) {
  const q = String(search || '').trim().toLowerCase()
  if (!q) return catalogTargets.value.slice(0, 16)
  return catalogTargets.value
    .filter(target =>
      target.targetLabel.toLowerCase().includes(q) ||
      targetTypeLabels[target.targetType].toLowerCase().includes(q)
    )
    .slice(0, 20)
}

const modalSearchTargets = computed(() =>
  filterTargets(selectorSearch.value)
    .filter(target => selectorScope.value === 'levels' || target.targetType === 'variacao')
)

const groups = computed(() =>
  [...new Set(items.value.map(item => item.group).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true }))
)

const categoriesForGroup = computed(() =>
  [...new Set(items.value
    .filter(item => item.group === selectedGroup.value)
    .map(item => item.category)
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true }))
)

const subcategoriesForCategory = computed(() =>
  {
    const scopedItems = items.value.filter(item =>
      item.group === selectedGroup.value &&
      item.category === selectedCategory.value
    )
    const subcategories = [...new Set(scopedItems.map(item => item.subcategory).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true }))
    if (subcategories.length && scopedItems.some(item => !item.subcategory)) {
      return [...subcategories, DIRECT_ITEMS_SUBCATEGORY]
    }
    return subcategories
  }
)

const itemsForSelection = computed(() =>
  {
    const hasSubcategories = subcategoriesForCategory.value.length > 0
    return items.value
      .filter(item => {
        if (!selectedGroup.value || item.group !== selectedGroup.value) return false
        if (!selectedCategory.value || item.category !== selectedCategory.value) return false
        if (selectedSubcategory.value === DIRECT_ITEMS_SUBCATEGORY) return !item.subcategory
        if (hasSubcategories && selectedSubcategory.value) return item.subcategory === selectedSubcategory.value
        if (hasSubcategories && !selectedSubcategory.value) return false
        return true
      })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true }))
  }
)

const variationsForSelectedItem = computed(() =>
  variations.value
    .filter(variation => variation.itemId === selectedItemId.value)
    .map(variation => ({ variation, item: itemById.value.get(variation.itemId) }))
    .filter(row => row.item)
)

const modalSelectedLabel = computed(() =>
  modalSelectedTarget.value ? readableTargetLabel(modalSelectedTarget.value) : 'Nenhum EPI selecionado'
)

function itemStock(item) {
  return variations.value
    .filter(variation => variation.itemId === item.id)
    .reduce((sum, variation) => sum + Number(variation.stock || 0), 0)
}

function itemsInGroup(group) {
  return items.value.filter(item => item.group === group)
}

function itemsInCategory(category) {
  return items.value.filter(item => item.group === selectedGroup.value && item.category === category)
}

function itemsInSubcategory(subcategory) {
  return items.value.filter(item => {
    if (item.group !== selectedGroup.value || item.category !== selectedCategory.value) return false
    if (subcategory === DIRECT_ITEMS_SUBCATEGORY) return !item.subcategory
    return item.subcategory === subcategory
  })
}

function stockTotal(list) {
  return list.reduce((sum, item) => sum + itemStock(item), 0)
}

function openSelector(context) {
  selectorContext.value = context
  selectorSearch.value = ''
  selectorScope.value = 'levels'
  modalSelectedTarget.value = selectedRuleTarget.value
  selectorOpen.value = true
}

function closeSelector() {
  selectorOpen.value = false
}

function setModalTarget(target) {
  if (selectorScope.value === 'variations' && target.targetType !== 'variacao') return
  modalSelectedTarget.value = target
}

function confirmSelector() {
  if (!modalSelectedTarget.value) return
  selectedRuleTarget.value = modalSelectedTarget.value
  selectorOpen.value = false
}

function selectGroup(group) {
  selectedGroup.value = group
  selectedCategory.value = ''
  selectedSubcategory.value = ''
  selectedItemId.value = ''
  if (selectorScope.value === 'levels') setModalTarget(makeGroupTarget(group))
}

function selectCategory(category) {
  selectedCategory.value = category
  selectedSubcategory.value = ''
  selectedItemId.value = ''
  if (selectorScope.value === 'levels') setModalTarget(makeCategoryTarget(selectedGroup.value, category))
}

function selectSubcategory(subcategory) {
  selectedSubcategory.value = subcategory
  selectedItemId.value = ''
  if (selectorScope.value === 'levels') setModalTarget(makeSubcategoryTarget(selectedGroup.value, selectedCategory.value, subcategory))
}

function selectItem(item) {
  selectedItemId.value = item.id
  if (selectorScope.value === 'levels') setModalTarget(makeItemTarget(item))
}

function resetSelectorPath(level = 'root') {
  if (level === 'root') {
    selectedGroup.value = ''
    selectedCategory.value = ''
    selectedSubcategory.value = ''
    selectedItemId.value = ''
    modalSelectedTarget.value = null
    return
  }
  if (level === 'group') {
    selectedCategory.value = ''
    selectedSubcategory.value = ''
    selectedItemId.value = ''
    if (selectorScope.value === 'levels') setModalTarget(makeGroupTarget(selectedGroup.value))
    return
  }
  if (level === 'category') {
    selectedSubcategory.value = ''
    selectedItemId.value = ''
    if (selectorScope.value === 'levels') setModalTarget(makeCategoryTarget(selectedGroup.value, selectedCategory.value))
    return
  }
  selectedItemId.value = ''
  if (selectorScope.value === 'levels') setModalTarget(makeSubcategoryTarget(selectedGroup.value, selectedCategory.value, selectedSubcategory.value))
}

const rulesForRole = computed(() =>
  roleRules.value.filter(rule => rule.roleName === selectedRoleName.value)
)
const activeRuleCount = computed(() => rulesForRole.value.filter(rule => rule.active).length)

async function onAddRule() {
  if (!isLoggedIn?.value) return
  if (!selectedRuleTarget.value) { error('Selecione um EPI.'); return }
  const result = await addRoleRule(selectedRoleName.value, selectedRuleTarget.value, 30, 1)
  if (!result.ok) { error(result.error); return }
  success('EPI vinculado ao cargo.')
  selectedRuleTarget.value = null
}

async function onToggleRule(rule) {
  const result = await editRoleRule(rule.id, { active: !rule.active })
  if (!result.ok) error(result.error)
}

async function onDeleteRule(rule) {
  if (!confirm(`Remover "${rule.targetLabel || rule.targetKey}" deste cargo?`)) return
  await deleteRoleRule(rule.id)
  success('Vinculo removido.')
}

async function onUpdateRule(rule) {
  const days = Number(ruleDayDrafts.value[rule.id] ?? rule.days)
  const quantity = Number(ruleQuantityDrafts.value[rule.id] ?? rule.quantity)
  const result = await editRoleRule(rule.id, { days, quantity })
  if (!result.ok) { error(result.error); return }
  ruleDayDrafts.value[rule.id] = result.rule.days
  ruleQuantityDrafts.value[rule.id] = result.rule.quantity
  success('Regra do cargo atualizada.')
}

function ruleDayValue(rule) {
  return ruleDayDrafts.value[rule.id] ?? rule.days ?? 30
}

function setRuleDayValue(rule, value) {
  ruleDayDrafts.value[rule.id] = Number(value)
}

function ruleQuantityValue(rule) {
  return ruleQuantityDrafts.value[rule.id] ?? rule.quantity ?? 1
}

function setRuleQuantityValue(rule, value) {
  ruleQuantityDrafts.value[rule.id] = Number(value)
}

</script>

<template>
  <div class="ds-page-stack">
    <header class="ds-page-header">
      <div>
        <h1 class="ds-page-title">Editar EPIs</h1>
        <p class="ds-page-subtitle">Defina os equipamentos obrigatórios, a quantidade e a periodicidade por cargo. Use 0 para não controlar trocas.</p>
      </div>
    </header>

    <section class="ds-panel p-4">
      <div class="grid gap-4 md:grid-cols-[minmax(16rem,24rem)_1fr] md:items-end">
        <div>
          <label class="ds-label">Cargo</label>
          <div class="relative">
            <button
              type="button"
              role="combobox"
              :aria-expanded="rolePickerOpen"
              class="ds-input flex w-full items-center justify-between gap-2 text-left"
              @click="openRolePicker"
            >
              <span class="truncate font-semibold">{{ selectedRoleName || 'Selecione um cargo' }}</span>
              <svg class="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            </button>
            <div v-if="rolePickerOpen" class="fixed inset-0 z-10" @click="rolePickerOpen = false"></div>
            <div v-if="rolePickerOpen" role="listbox" class="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 overflow-hidden rounded-lg border border-gray-300 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
              <div class="border-b border-gray-200 p-2 dark:border-gray-700">
                <input
                  v-model="roleSearch"
                  type="search"
                  autocomplete="off"
                  autofocus
                  placeholder="Buscar cargo..."
                  class="ds-input"
                  @keydown.escape.stop="rolePickerOpen = false"
                  @keydown.enter.prevent="filteredRoles.length === 1 && selectRole(filteredRoles[0])"
                />
              </div>
              <div class="max-h-64 overflow-y-auto py-1">
                <button
                  v-for="role in filteredRoles"
                  :key="role.id"
                  type="button"
                  role="option"
                  :aria-selected="selectedRoleName === role.name"
                  class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                  :class="selectedRoleName === role.name ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300' : 'text-gray-800 dark:text-gray-100'"
                  @click="selectRole(role)"
                >
                  <span class="truncate">{{ role.name }}</span>
                  <svg v-if="selectedRoleName === role.name" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                </button>
                <p v-if="!filteredRoles.length" class="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">Nenhum cargo encontrado.</p>
              </div>
            </div>
          </div>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 md:pb-2">
          <span class="font-semibold text-gray-900 dark:text-gray-100">{{ activeRuleCount }}</span>
          {{ activeRuleCount === 1 ? 'regra ativa' : 'regras ativas' }} para este cargo
        </p>
      </div>
    </section>

    <section class="grid items-start gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <aside class="ds-panel overflow-hidden">
        <div class="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Novo EPI obrigatório</h2>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Vincule um item ou bloco do catálogo ao cargo selecionado.</p>
        </div>
        <div class="space-y-4 p-4">
          <div>
            <label class="ds-label">EPI do catálogo</label>
            <button
              type="button"
              class="ds-input min-h-16 w-full text-left transition-colors hover:border-primary-500"
              @click="openSelector('rule')"
            >
              <span class="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{{ selectedRuleTarget ? targetTypeLabels[selectedRuleTarget.targetType] : 'Selecionar' }}</span>
              <span class="mt-1 block truncate font-semibold text-gray-900 dark:text-gray-100">{{ selectedRuleTarget ? readableTargetLabel(selectedRuleTarget) : 'Escolher no catálogo' }}</span>
            </button>
          </div>
          <button type="button" class="min-h-10 w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-[var(--ds-primary-text)] transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-700 dark:disabled:bg-gray-700 dark:disabled:text-gray-300" :disabled="!selectedRoleName || !selectedRuleTarget" @click="onAddRule">Adicionar ao cargo</button>
        </div>
      </aside>

      <div class="ds-panel overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div>
            <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">EPIs obrigatórios</h2>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ selectedRoleName || 'Selecione um cargo' }}</p>
          </div>
          <span class="ds-chip tabular-nums">{{ rulesForRole.length }}</span>
        </div>
        <div v-if="rulesForRole.length" class="divide-y divide-gray-100 dark:divide-gray-700">
          <article v-for="rule in rulesForRole" :key="rule.id" class="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(12rem,1fr)_8rem_11rem_auto] xl:items-end" :class="{ 'opacity-60': !rule.active }">
            <div class="self-center">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{{ targetTypeLabels[rule.targetType] }}</p>
              <template v-if="targetVariationRow(rule)">
                <p class="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{{ targetVariationRow(rule).item.name }}</p>
                <AttributeBadges class="mt-1" :item="targetVariationRow(rule).item" :variation="targetVariationRow(rule).variation" compact />
              </template>
              <p v-else class="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{{ readableTargetLabel(rule) }}</p>
            </div>
            <div>
              <label class="ds-label">Quantidade</label>
              <input
                :value="ruleQuantityValue(rule)"
                type="number"
                min="1"
                step="1"
                class="ds-input"
                @input="setRuleQuantityValue(rule, $event.target.value)"
              />
            </div>
            <div>
              <label class="ds-label">Periodicidade</label>
              <div class="flex items-center gap-2">
                <input
                  :value="ruleDayValue(rule)"
                  type="number"
                  min="0"
                  step="1"
                  class="ds-input"
                  @input="setRuleDayValue(rule, $event.target.value)"
                />
                <span class="text-xs text-gray-500 dark:text-gray-400">{{ Number(ruleDayValue(rule)) === 0 ? 'sem controle' : 'dias' }}</span>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 xl:justify-end">
              <button type="button" class="min-h-9 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-[var(--ds-primary-text)] hover:bg-primary-700" @click="onUpdateRule(rule)">Atualizar</button>
              <button type="button" :aria-pressed="rule.active" class="min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold" :class="rule.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'" @click="onToggleRule(rule)">{{ rule.active ? 'Ativo' : 'Inativo' }}</button>
              <button type="button" class="min-h-9 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30" @click="onDeleteRule(rule)">Excluir</button>
            </div>
          </article>
        </div>
        <div v-else class="p-8 text-center">
          <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">Nenhum EPI obrigatório</p>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Use o painel ao lado para criar a primeira regra deste cargo.</p>
        </div>
      </div>
    </section>

    <AppDialog
        v-if="selectorOpen"
        visible
        aria-label="Selecionar EPI no catálogo"
        @close="closeSelector"
      >
        <section class="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <header class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {{ selectorContext === 'rule' ? 'Selecionar EPI para cargo' : 'Selecionar EPI para periodicidade' }}
              </p>
              <h3 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">Catálogo em blocos</h3>
            </div>
            <button
              type="button"
              class="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              @click="closeSelector"
            >Fechar</button>
          </header>

          <div class="border-b border-gray-200 p-4 dark:border-gray-700">
            <div class="grid gap-3 lg:grid-cols-[1fr_auto]">
              <input
                v-model="selectorSearch"
                type="search"
                placeholder="Pesquisar grupo, categoria, item ou variação..."
                class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              <div class="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
                <button
                  type="button"
                  class="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
                  :class="selectorScope === 'levels' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'"
                  @click="selectorScope = 'levels'"
                >Níveis específicos</button>
                <button
                  type="button"
                  class="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
                  :class="selectorScope === 'variations' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'"
                  @click="selectorScope = 'variations'; if (modalSelectedTarget?.targetType !== 'variacao') modalSelectedTarget = null"
                >Só variações</button>
              </div>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-auto p-4">
            <div v-if="selectorSearch.trim()" class="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              <button
                v-for="target in modalSearchTargets"
                :key="`${target.targetType}:${target.targetKey}`"
                type="button"
                class="rounded-lg border p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                :class="modalSelectedTarget?.targetType === target.targetType && modalSelectedTarget?.targetKey === target.targetKey
                  ? 'border-primary-500 bg-primary-50 text-primary-900 dark:bg-primary-900/20 dark:text-primary-100'
                  : 'border-gray-200 text-gray-900 dark:border-gray-700 dark:text-gray-100'"
                @click="setModalTarget(target)"
              >
                <span class="block text-[11px] font-semibold uppercase tracking-wider text-gray-400">{{ targetTypeLabels[target.targetType] }}</span>
                <template v-if="targetVariationRow(target)">
                  <span class="mt-1 block text-sm font-semibold">{{ targetVariationRow(target).item.name }}</span>
                  <AttributeBadges class="mt-2" :item="targetVariationRow(target).item" :variation="targetVariationRow(target).variation" compact />
                </template>
                <span v-else class="mt-1 block text-sm font-semibold">{{ readableTargetLabel(target) }}</span>
              </button>
            </div>

            <div v-else class="space-y-4">
              <div v-if="selectedGroup" class="flex flex-wrap items-center gap-1.5 text-sm">
                <button type="button" class="font-medium text-primary-600 hover:underline dark:text-primary-400" @click="resetSelectorPath('root')">Catálogo</button>
                <svg class="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                <button
                  v-if="selectedCategory"
                  type="button"
                  class="font-medium text-primary-600 hover:underline dark:text-primary-400"
                  @click="resetSelectorPath('group')"
                >{{ selectedGroup }}</button>
                <span v-else class="font-semibold text-gray-900 dark:text-gray-100">{{ selectedGroup }}</span>
                <template v-if="selectedCategory">
                  <svg class="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                  <button
                    v-if="selectedSubcategory || selectedItemId"
                    type="button"
                    class="font-medium text-primary-600 hover:underline dark:text-primary-400"
                    @click="resetSelectorPath('category')"
                  >{{ selectedCategory }}</button>
                  <span v-else class="font-semibold text-gray-900 dark:text-gray-100">{{ selectedCategory }}</span>
                </template>
                <template v-if="selectedSubcategory">
                  <svg class="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                  <button
                    v-if="selectedItemId"
                    type="button"
                    class="font-medium text-primary-600 hover:underline dark:text-primary-400"
                    @click="resetSelectorPath('subcategory')"
                  >{{ selectedSubcategory }}</button>
                  <span v-else class="font-semibold text-gray-900 dark:text-gray-100">{{ selectedSubcategory }}</span>
                </template>
              </div>

              <div v-if="!selectedGroup" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                <button
                  v-for="group in groups"
                  :key="group"
                  type="button"
                  class="group cursor-pointer rounded-lg border border-gray-200 bg-white p-5 text-left transition-colors duration-100 hover:border-primary-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-500"
                  @click="selectGroup(group)"
                >
                  <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 transition-colors group-hover:bg-primary-100 dark:bg-primary-900/30 dark:group-hover:bg-primary-900/50">
                    <svg class="h-5 w-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                    </svg>
                  </div>
                  <p class="mb-1 truncate text-sm font-bold text-gray-800 dark:text-gray-100">{{ group }}</p>
                  <p class="text-xs text-gray-400 dark:text-gray-500">
                    {{ itemsInGroup(group).length }} {{ itemsInGroup(group).length === 1 ? 'item' : 'itens' }} · Estoque: {{ stockTotal(itemsInGroup(group)) }}
                  </p>
                </button>
              </div>

              <div v-else-if="!selectedCategory" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                <button
                  v-for="category in categoriesForGroup"
                  :key="category"
                  type="button"
                  class="group cursor-pointer rounded-lg border border-gray-200 bg-white p-5 text-left transition-colors duration-100 hover:border-primary-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-500"
                  @click="selectCategory(category)"
                >
                  <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 transition-colors group-hover:bg-primary-100 dark:bg-primary-900/30 dark:group-hover:bg-primary-900/50">
                    <svg class="h-5 w-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                    </svg>
                  </div>
                  <p class="mb-1 truncate text-sm font-bold text-gray-800 dark:text-gray-100">{{ category }}</p>
                  <p class="text-xs text-gray-400 dark:text-gray-500">
                    {{ itemsInCategory(category).length }} {{ itemsInCategory(category).length === 1 ? 'item' : 'itens' }} · Estoque: {{ stockTotal(itemsInCategory(category)) }}
                  </p>
                </button>
              </div>

              <div v-else-if="subcategoriesForCategory.length && !selectedSubcategory" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                <button
                  v-for="subcategory in subcategoriesForCategory"
                  :key="subcategory"
                  type="button"
                  class="group cursor-pointer rounded-lg border border-gray-200 bg-white p-5 text-left transition-colors duration-100 hover:border-primary-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-500"
                  @click="selectSubcategory(subcategory)"
                >
                  <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 transition-colors group-hover:bg-primary-100 dark:bg-primary-900/30 dark:group-hover:bg-primary-900/50">
                    <svg class="h-5 w-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                    </svg>
                  </div>
                  <p class="mb-1 truncate text-sm font-bold text-gray-800 dark:text-gray-100">{{ subcategory }}</p>
                  <p class="text-xs text-gray-400 dark:text-gray-500">
                    {{ itemsInSubcategory(subcategory).length }} {{ itemsInSubcategory(subcategory).length === 1 ? 'item' : 'itens' }} · Estoque: {{ stockTotal(itemsInSubcategory(subcategory)) }}
                  </p>
                </button>
              </div>

              <div v-else-if="!selectedItemId" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                <button
                  v-for="item in itemsForSelection"
                  :key="item.id"
                  type="button"
                  class="group cursor-pointer rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors duration-100 hover:border-primary-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-500"
                  @click="selectItem(item)"
                >
                  <p class="mb-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{{ item.name }}</p>
                  <p class="mb-1 truncate text-xs text-gray-400 dark:text-gray-500">{{ hierarchy(item) || 'Sem hierarquia' }}</p>
                  <p class="text-xs text-gray-400 dark:text-gray-500">
                    {{ variations.filter(variation => variation.itemId === item.id).length }} var. · Estoque: {{ itemStock(item) }}
                  </p>
                </button>
                <p v-if="!itemsForSelection.length" class="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Nenhum item neste nível.
                </p>
              </div>

              <div v-else>
                <div v-if="variationsForSelectedItem.length" class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                  <table class="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                    <thead class="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
                      <tr>
                        <th class="px-4 py-3">Variação</th>
                        <th class="px-4 py-3 text-right">Estoque</th>
                        <th class="px-4 py-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
                      <tr
                        v-for="{ variation, item } in variationsForSelectedItem"
                        :key="variation.id"
                        class="cursor-pointer transition-colors hover:bg-primary-50/70 dark:hover:bg-primary-950/20"
                        @click="setModalTarget(makeVariationTarget(variation, item))"
                      >
                        <td class="px-4 py-3 text-gray-900 dark:text-gray-100">
                          <p class="font-semibold">{{ item?.name }}</p>
                          <AttributeBadges class="mt-1" :item="item" :variation="variation" compact />
                        </td>
                        <td class="px-4 py-3 text-right font-semibold" :class="variation.stock > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'">
                          {{ variation.stock }} {{ item?.unit }}
                        </td>
                        <td class="px-4 py-3 text-right">
                          <button
                            type="button"
                            class="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-[var(--ds-primary-text)] hover:bg-primary-700"
                            @click.stop="setModalTarget(makeVariationTarget(variation, item))"
                          >
                            Selecionar
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Nenhuma variação encontrada.
                </p>
              </div>
            </div>
          </div>

          <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-4 dark:border-gray-700">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Selecionado</p>
              <template v-if="targetVariationRow(modalSelectedTarget)">
                <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ targetVariationRow(modalSelectedTarget).item.name }}</p>
                <AttributeBadges class="mt-1" :item="targetVariationRow(modalSelectedTarget).item" :variation="targetVariationRow(modalSelectedTarget).variation" compact />
              </template>
              <p v-else class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{{ modalSelectedLabel }}</p>
            </div>
            <button
              type="button"
              class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-[var(--ds-primary-text)] hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-700 dark:disabled:bg-gray-700 dark:disabled:text-gray-300"
              :disabled="!modalSelectedTarget"
              @click="confirmSelector"
            >Usar seleção</button>
          </footer>
        </section>
    </AppDialog>
  </div>
</template>
