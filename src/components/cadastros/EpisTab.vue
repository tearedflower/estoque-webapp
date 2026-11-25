<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useItems } from '../../composables/useItems.js'
import { usePeople } from '../../composables/usePeople.js'
import { useRoles } from '../../composables/useRoles.js'
import { useEpis } from '../../composables/useEpis.js'
import { useToast } from '../../composables/useToast.js'
import { normalizeSearchText } from '../../utils/globalSearch.js'
import { catalogRowsForTarget, epiVariationCa } from '../../utils/epiSheet.js'
import { groupEpiRolesBySector } from '../../utils/epiRoleSectors.js'
import AttributeBadges from '../ui/AttributeBadges.vue'
import AppDialog from '../ui/AppDialog.vue'
import EpiGeneralControl from './EpiGeneralControl.vue'
import EpiOverview from './EpiOverview.vue'
import EpiVariationChoices from './EpiVariationChoices.vue'

const isLoggedIn = inject('isLoggedIn')
const { items, variations } = useItems()
const { activeRoles } = useRoles()
const { people } = usePeople()
const personNames = computed(() => new Map(people.value.map(person => [person.id, person.name])))
const {
  roleRules,
  addRoleRule,
  editRoleRule,
  deleteRoleRule,
} = useEpis()
const { success, error } = useToast()

const selectedRoleName = ref('')
const view = ref('general')
const showInactive = ref(false)
const roleSearch = ref('')
const onlyRolesWithEpi = ref(false)
const ruleDayDrafts = ref({})
const ruleQuantityDrafts = ref({})
const ruleReasonDrafts = ref({})
const ruleObservationDrafts = ref({})
const selectorOpen = ref(false)
const editingRuleId = ref(null)
const approvedCas = ref([])
const approvedItemId = ref('')
const approvedCaEdited = ref(false)
const selectorSaving = ref(false)
const selectorContext = ref('rule')
const selectorSearch = ref('')
const linkSingleVariation = ref(false)
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
const rolesWithEpi = computed(() => new Set(roleRules.value
  .filter(rule => rule.active)
  .filter(rule => catalogRowsForTarget(items.value, variations.value, rule).length > 0)
  .map(rule => normalizeSearchText(rule.roleName))))
const visibleRoles = computed(() => onlyRolesWithEpi.value
  ? activeRoles.value.filter(role => rolesWithEpi.value.has(normalizeSearchText(role.name)))
  : activeRoles.value)
const roleGroups = computed(() => groupEpiRolesBySector(visibleRoles.value, roleSearch.value))

watch([visibleRoles, selectedRoleName], ([roles, selected]) => {
  if (onlyRolesWithEpi.value && !roles.some(role => role.name === selected)) {
    selectedRoleName.value = roles[0]?.name || ''
  }
})

function hierarchy(item) {
  return [item.group, item.category, item.subcategory].filter(Boolean).join(' > ')
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
    targetLabel: makeItemTarget(item).targetLabel,
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

const selectedItem = computed(() => itemById.value.get(selectedItemId.value))
const variationsForSelectedItem = computed(() => variations.value
  .filter(variation => variation.itemId === selectedItemId.value && variation.active !== false))

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

function openCurrentTarget(rule) {
  const item = rule.targetType === 'item'
    ? itemById.value.get(rule.targetKey)
    : targetVariationRow(rule)?.item
  if (item) {
    selectedGroup.value = item.group || ''
    selectedCategory.value = item.category || ''
    selectedSubcategory.value = item.subcategory || (subcategoriesForCategory.value.length ? DIRECT_ITEMS_SUBCATEGORY : '')
    selectedItemId.value = item.id
    return
  }
  if (['grupo', 'categoria', 'subcategoria'].includes(rule.targetType)) {
    const [group, category = '', subcategory = ''] = rule.targetKey.split('|')
    selectedGroup.value = group
    selectedCategory.value = category
    selectedSubcategory.value = subcategory
  }
}

function openSelector(context, rule = null) {
  selectorContext.value = context
  selectorSearch.value = ''
  linkSingleVariation.value = rule?.targetType === 'variacao'
  editingRuleId.value = rule?.id || null
  resetSelectorPath()
  modalSelectedTarget.value = rule
  approvedCas.value = []
  approvedItemId.value = ''
  approvedCaEdited.value = false
  if (rule) {
    openCurrentTarget(rule)
    const variation = targetVariationRow(rule)?.variation
    const ca = variation && epiVariationCa(variation.values, variation.extras)
    approvedItemId.value = selectedItemId.value
    approvedCas.value = rule.targetType === 'item' ? (rule.allowedCas || []).filter(Boolean) : ca ? [ca] : []
  }
  selectorOpen.value = true
}

function closeSelector() {
  if (selectorSaving.value) return
  selectorOpen.value = false
  editingRuleId.value = null
}

function setModalTarget(target) {
  modalSelectedTarget.value = target
}

function toggleApprovedCa(ca) {
  approvedCas.value = approvedCas.value.includes(ca)
    ? approvedCas.value.filter(value => value !== ca)
    : [...approvedCas.value, ca]
  approvedCaEdited.value = true
}

function chooseSearchTarget(target) {
  if (target.itemId) {
    const item = itemById.value.get(target.itemId)
    selectedGroup.value = item.group || ''
    selectedCategory.value = item.category || ''
    selectedSubcategory.value = item.subcategory || (subcategoriesForCategory.value.length ? DIRECT_ITEMS_SUBCATEGORY : '')
    selectItem(item)
    linkSingleVariation.value = target.targetType === 'variacao'
    selectorSearch.value = ''
  }
  setModalTarget(target)
}

function toggleVariationMode() {
  linkSingleVariation.value = !linkSingleVariation.value
  setModalTarget(linkSingleVariation.value ? null : makeItemTarget(selectedItem.value))
}

async function confirmSelector() {
  if (!modalSelectedTarget.value || selectorSaving.value) return
  const { targetType, targetKey, targetLabel } = modalSelectedTarget.value
  const current = roleRules.value.find(rule => rule.id === editingRuleId.value)
  const needsCaList = targetType === 'item' && (approvedCaEdited.value || current?.targetType !== 'item' || current.targetKey !== targetKey)
  const changes = { targetType, targetKey, targetLabel }
  if (needsCaList) {
    changes.allowedCas = approvedCas.value
    if (!changes.allowedCas.length) {
      error('Marque pelo menos uma variação com CA.')
      return
    }
  }
  if (editingRuleId.value) {
    selectorSaving.value = true
    try {
      const result = await editRoleRule(editingRuleId.value, changes)
      if (!result.ok) { error(result.error); return }
      success('EPI do cargo alterado.')
      selectorOpen.value = false
      editingRuleId.value = null
    } finally { selectorSaving.value = false }
    return
  }
  if (!isLoggedIn?.value || !selectedRoleName.value) return
  selectorSaving.value = true
  try {
    const result = await addRoleRule(selectedRoleName.value, modalSelectedTarget.value, 30, 1, { allowedCas: changes.allowedCas })
    if (!result.ok) { error(result.error); return }
    success('EPI vinculado ao cargo.')
    selectorOpen.value = false
  } catch (cause) {
    error(cause.message || 'Não foi possível vincular o EPI.')
  } finally {
    selectorSaving.value = false
  }
}

function selectGroup(group) {
  selectedGroup.value = group
  selectedCategory.value = ''
  selectedSubcategory.value = ''
  selectedItemId.value = ''
  setModalTarget(makeGroupTarget(group))
}

function selectCategory(category) {
  selectedCategory.value = category
  selectedSubcategory.value = ''
  selectedItemId.value = ''
  setModalTarget(makeCategoryTarget(selectedGroup.value, category))
}

function selectSubcategory(subcategory) {
  selectedSubcategory.value = subcategory
  selectedItemId.value = ''
  setModalTarget(makeSubcategoryTarget(selectedGroup.value, selectedCategory.value, subcategory))
}

function selectItem(item) {
  selectedItemId.value = item.id
  if (approvedItemId.value !== item.id) {
    approvedItemId.value = item.id
    approvedCas.value = []
    approvedCaEdited.value = true
  }
  linkSingleVariation.value = false
  setModalTarget(makeItemTarget(item))
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
    setModalTarget(makeGroupTarget(selectedGroup.value))
    return
  }
  if (level === 'category') {
    selectedSubcategory.value = ''
    selectedItemId.value = ''
    setModalTarget(makeCategoryTarget(selectedGroup.value, selectedCategory.value))
    return
  }
  selectedItemId.value = ''
  setModalTarget(makeSubcategoryTarget(selectedGroup.value, selectedCategory.value, selectedSubcategory.value))
}

const allRulesForRole = computed(() =>
  roleRules.value.filter(rule => normalizeSearchText(rule.roleName) === normalizeSearchText(selectedRoleName.value))
)
const rulesForRole = computed(() => allRulesForRole.value.filter(rule => showInactive.value || rule.active))
const observationsByRule = computed(() => new Map(rulesForRole.value.map(rule => {
  const compatible = catalogRowsForTarget(items.value, variations.value, rule)
  if (!compatible.length) return [rule.id, ['Sem variação compatível']]
  let missingCa = 0
  for (const { variation } of compatible) {
    const attributes = new Map(Object.entries({ ...variation.extras, ...variation.values })
      .map(([key, value]) => [normalizeSearchText(key), String(value ?? '').trim()]))
    if (!['ca', 'numero ca', 'numero do ca', 'certificado de aprovacao'].some(key => attributes.get(key))) missingCa++
  }
  const observations = []
  if (missingCa) observations.push(missingCa === compatible.length ? 'CA pendente' : `${missingCa} de ${compatible.length} variações sem CA`)
  return [rule.id, observations]
})))
function automaticObservations(rule) {
  const note = normalizeSearchText(ruleObservationDrafts.value[rule.id] ?? rule.observation)
  return (observationsByRule.value.get(rule.id) || []).filter(observation =>
    !note.includes(normalizeSearchText(observation))
  )
}
const activeRuleCount = computed(() => allRulesForRole.value.filter(rule => rule.active).length)
const inactiveRuleCount = computed(() => allRulesForRole.value.filter(rule => !rule.active).length)

function showRole(roleName) {
  selectedRoleName.value = activeRoles.value.find(role => normalizeSearchText(role.name) === normalizeSearchText(roleName))?.name || roleName
  view.value = 'role'
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
  const result = await editRoleRule(rule.id, { days, quantity, usageReason: ruleReasonDrafts.value[rule.id] ?? rule.usageReason ?? '',
    observation: ruleObservationDrafts.value[rule.id] ?? rule.observation ?? '',
  })
  if (!result.ok) { error(result.error); return }
  ruleDayDrafts.value[rule.id] = result.rule.days
  ruleQuantityDrafts.value[rule.id] = result.rule.quantity
  ruleReasonDrafts.value[rule.id] = result.rule.usageReason
  ruleObservationDrafts.value[rule.id] = result.rule.observation
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
        <h1 class="ds-page-title">Gestão de EPIs</h1>
        <p class="ds-page-subtitle">Compare os prazos por equipamento e ajuste os vínculos de cada cargo.</p>
      </div>
    </header>

    <nav class="flex flex-wrap gap-2" aria-label="Visões da gestão de EPIs">
      <button v-for="option in [{ key: 'overview', label: 'Visão geral' }, { key: 'general', label: 'Controle geral' }, { key: 'role', label: 'Por cargo' }]" :key="option.key" type="button" class="min-h-10 rounded-lg border px-4 py-2 text-sm font-semibold" :class="view === option.key ? 'border-primary-600 bg-primary-600 text-[var(--ds-primary-text)]' : 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'" :aria-pressed="view === option.key" @click="view = option.key">{{ option.label }}</button>
    </nav>

    <EpiGeneralControl v-if="view === 'general'" @open-role="showRole" />
    <EpiOverview v-if="view === 'overview'" @open-role="showRole" />

    <template v-if="view === 'role'">
    <section class="grid items-start gap-4 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
      <aside class="ds-panel overflow-hidden lg:sticky lg:top-4" aria-label="Cargos por setor">
        <div class="border-b border-gray-200 p-3 dark:border-gray-700">
          <label for="epi-role-search" class="ds-label">Cargos por setor</label>
          <input id="epi-role-search" v-model="roleSearch" type="search" autocomplete="off" placeholder="Buscar cargo ou setor..." class="ds-input" />
          <button
            type="button"
            class="mt-2 w-full rounded-md border px-2 py-2 text-left text-xs font-semibold"
            :class="onlyRolesWithEpi ? 'border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300' : 'border-gray-200 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800'"
            :aria-pressed="onlyRolesWithEpi"
            @click="onlyRolesWithEpi = !onlyRolesWithEpi"
          >Só cargos com EPI</button>
        </div>
        <div class="max-h-64 overflow-y-auto px-2 py-2 lg:max-h-[65vh]">
          <div v-for="group in roleGroups" :key="group.name" class="pb-2">
            <h3 class="px-2 pb-1 pt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">{{ group.name }}</h3>
            <button
              v-for="role in group.roles"
              :key="role.id"
              type="button"
              class="block w-full rounded-md px-2 py-2 text-left text-sm transition-colors"
              :class="selectedRoleName === role.name ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
              :aria-pressed="selectedRoleName === role.name"
              @click="selectedRoleName = role.name"
            >{{ role.name }}</button>
          </div>
          <p v-if="!roleGroups.length" class="px-2 py-3 text-sm text-gray-500 dark:text-gray-400">Nenhum cargo encontrado.</p>
        </div>
      </aside>

      <div class="ds-panel min-w-0 overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div>
            <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ selectedRoleName || 'Selecione um cargo' }}</h2>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ activeRuleCount }} {{ activeRuleCount === 1 ? 'EPI ativo' : 'EPIs ativos' }}</p>
            <label v-if="inactiveRuleCount" class="mt-2 flex items-center gap-2 text-xs"><input v-model="showInactive" type="checkbox" /> Mostrar inativos ({{ inactiveRuleCount }})</label>
          </div>
          <button
            v-if="isLoggedIn"
            type="button"
            class="min-h-10 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-[var(--ds-primary-text)] hover:bg-primary-700 disabled:opacity-50"
            :disabled="!selectedRoleName"
            aria-haspopup="dialog"
            @click="openSelector('rule')"
          ><span aria-hidden="true">＋</span> Adicionar EPI</button>
        </div>
        <div v-if="rulesForRole.length" class="epi-rule-list divide-y divide-gray-100 dark:divide-gray-700">
          <article v-for="rule in rulesForRole" :key="rule.id" class="epi-rule-row grid items-start gap-3 px-4 py-3 sm:grid-cols-3" :class="{ 'opacity-60': !rule.active }">
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{{ targetTypeLabels[rule.targetType] }}</p>
              <template v-if="targetVariationRow(rule)">
                <p class="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{{ targetVariationRow(rule).item.name }}</p>
                <AttributeBadges class="mt-1" :item="targetVariationRow(rule).item" :variation="targetVariationRow(rule).variation" compact />
              </template>
              <p v-else class="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{{ readableTargetLabel(rule) }}</p>
              <p v-if="rule.targetType === 'item' && rule.allowedCas?.some(Boolean)" class="mt-1 text-xs text-gray-600 dark:text-gray-300">
                CAs aceitos · {{ rule.allowedCas.filter(Boolean).join(', ') }}
              </p>
              <p v-if="rule.personId" class="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                Somente {{ personNames.get(rule.personId) || 'pessoa vinculada' }}
              </p>
            </div>
            <div class="min-w-0">
              <label :for="`usage-reason-${rule.id}`" class="ds-label">Motivo de uso</label>
              <textarea
                :id="`usage-reason-${rule.id}`"
                :value="ruleReasonDrafts[rule.id] ?? rule.usageReason ?? ''"
                rows="2"
                maxlength="2000"
                class="epi-reason ds-input w-full resize-y text-sm"
                placeholder="Motivo indicado no PGR para este cargo"
                @input="ruleReasonDrafts[rule.id] = $event.target.value"
              ></textarea>
            </div>
            <div class="min-w-0">
              <label :for="`epi-observation-${rule.id}`" class="ds-label">Observação</label>
              <p v-if="automaticObservations(rule).length" class="mb-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                {{ automaticObservations(rule).join(' · ') }}
              </p>
              <textarea
                :id="`epi-observation-${rule.id}`"
                :value="ruleObservationDrafts[rule.id] ?? rule.observation ?? ''"
                rows="2"
                maxlength="2000"
                class="epi-reason ds-input w-full resize-y text-sm"
                placeholder="Adicionar observação"
                @input="ruleObservationDrafts[rule.id] = $event.target.value"
              ></textarea>
            </div>
            <div class="epi-rule-fields flex flex-wrap items-end gap-2 sm:col-span-3">
              <div class="epi-quantity w-24">
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
              <div class="epi-period w-32">
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
              <div class="epi-rule-actions flex flex-wrap items-center gap-1.5 sm:ml-auto">
                <button type="button" class="min-h-9 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800" aria-haspopup="dialog" @click="openSelector('rule', rule)">Editar EPI</button>
                <button type="button" class="min-h-9 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-[var(--ds-primary-text)] hover:bg-primary-700" @click="onUpdateRule(rule)">Atualizar</button>
                <button type="button" :aria-pressed="rule.active" class="min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold" :class="rule.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'" @click="onToggleRule(rule)">{{ rule.active ? 'Ativo' : 'Inativo' }}</button>
                <button type="button" class="min-h-9 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30" @click="onDeleteRule(rule)">Excluir</button>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="p-8 text-center">
          <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">Nenhum EPI obrigatório</p>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Use Adicionar EPI para vincular a primeira regra deste cargo.</p>
        </div>
      </div>
    </section>

    </template>

    <AppDialog
        v-if="selectorOpen"
        visible
        aria-label="Selecionar EPI no catálogo"
        :persistent="selectorSaving"
        @close="closeSelector"
      >
        <section class="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <header class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {{ editingRuleId ? 'Editar EPI do cargo' : selectorContext === 'rule' ? 'Selecionar EPI para cargo' : 'Selecionar EPI para periodicidade' }}
              </p>
              <h3 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{{ editingRuleId ? 'Alterar item vinculado' : selectedRoleName }}</h3>
              <p v-if="editingRuleId" class="mt-1 text-sm text-gray-500 dark:text-gray-400">Escolha outro item ou variação para a regra.</p>
            </div>
            <button
              type="button"
              class="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              @click="closeSelector"
            >Fechar</button>
          </header>

          <div class="border-b border-gray-200 p-4 dark:border-gray-700">
            <input
              v-model="selectorSearch"
              type="search"
              placeholder="Pesquisar grupo, categoria, item ou variação..."
              class="ds-input w-full"
            />
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
                @click="chooseSearchTarget(target)"
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

              <div v-if="!selectedItemId && !selectedGroup" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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

              <div v-else-if="!selectedItemId && !selectedCategory" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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

              <div v-else-if="!selectedItemId && subcategoriesForCategory.length && !selectedSubcategory" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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

              <div v-else-if="selectedItem" class="space-y-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 class="text-sm font-semibold">{{ selectedItem.name }}</h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      {{ linkSingleVariation ? 'Escolha uma variação específica.' : 'Marque as variações para liberar seus CAs. Outros tamanhos com o mesmo CA também ficam disponíveis.' }}
                    </p>
                  </div>
                  <button type="button" class="text-xs font-semibold text-primary-700 hover:underline dark:text-primary-300" @click="toggleVariationMode">
                    {{ linkSingleVariation ? 'Vincular ao item com CAs aceitos' : 'Vincular uma única variação' }}
                  </button>
                </div>
                <EpiVariationChoices
                  :item="selectedItem"
                  :variations="variationsForSelectedItem"
                  :allowed-cas="approvedCas"
                  :single="linkSingleVariation"
                  :selected-id="modalSelectedTarget?.targetType === 'variacao' ? modalSelectedTarget.targetKey : ''"
                  :disabled="selectorSaving"
                  @toggle-ca="toggleApprovedCa"
                  @select="setModalTarget(makeVariationTarget($event, selectedItem))"
                />
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
              <p v-if="modalSelectedTarget?.targetType === 'item' && approvedCas.length" class="text-xs text-gray-600 dark:text-gray-300">
                CAs aceitos · {{ approvedCas.join(', ') }}
              </p>
            </div>
            <button
              type="button"
              class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-[var(--ds-primary-text)] hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-700 dark:disabled:bg-gray-700 dark:disabled:text-gray-300"
              :disabled="!modalSelectedTarget || selectorSaving"
              @click="confirmSelector"
            >{{ selectorSaving ? 'Salvando...' : editingRuleId ? 'Salvar EPI' : 'Vincular ao cargo' }}</button>
          </footer>
        </section>
    </AppDialog>
  </div>
</template>

<style scoped>
.epi-rule-list {
  container-type: inline-size;
}

.epi-reason {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.epi-reason:hover,
.epi-reason:focus-visible {
  border-color: var(--ds-border);
  background: var(--ds-surface);
}

@container (min-width: 64rem) {
  .epi-rule-row {
    grid-template-columns: minmax(8rem, 1fr) minmax(10rem, 1.5fr) minmax(10rem, 1.3fr) 5.5rem 7.5rem 10rem;
  }

  .epi-rule-fields {
    display: contents;
  }

  .epi-quantity,
  .epi-period,
  .epi-rule-actions {
    width: 100%;
  }

  .epi-rule-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: 0;
  }

  .epi-rule-actions button {
    min-height: 2rem;
    padding-inline: 0.35rem;
  }
}
</style>
