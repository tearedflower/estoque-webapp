<script setup>
import { computed, ref } from 'vue'
import AppDialog from '../ui/AppDialog.vue'
import { useItems } from '../../composables/useItems.js'
import { useToast } from '../../composables/useToast.js'
import { suggestCatalogFromImage } from '../../services/api.js'
import { compressImageFile, fileAsDataUrl } from '../../utils/imageFile.js'
import { units } from '../../utils/units.js'

const props = defineProps({
  mode: { type: String, default: 'catalog' },
})
const emit = defineEmits(['close', 'saved', 'found'])

const {
  items,
  uniqueGroups,
  getCategoriesForGroup,
  getSubcategoriesForCategory,
  getVariationsForItem,
  findDuplicateItem,
  addItem,
  addVariation,
} = useItems()
const { success, error } = useToast()

const aiCatalogImage = ref('')
const aiCatalogLoading = ref(false)
const aiCatalogError = ref('')
const aiCatalogAttrInput = ref('')
const keepCataloging = ref(false)
let aiCatalogRun = 0
const isSearchMode = computed(() => props.mode === 'search')
const dialogTitle = computed(() => isSearchMode.value ? 'Pesquisar material pela foto' : 'Catalogar material pela foto')
const dialogSubtitle = computed(() => isSearchMode.value
  ? 'Tire uma foto para procurar se este material já existe no catálogo.'
  : 'Revise antes de salvar. Só o que for novo fica destacado.'
)

function emptyAiCatalog() {
  return {
    identified: false,
    industrialSupply: true,
    group: '',
    category: '',
    subcategory: '',
    name: '',
    unit: 'UN',
    initialStock: 0,
    confidence: null,
    attributes: [],
    values: {},
    observations: [],
  }
}

const aiCatalog = ref(emptyAiCatalog())
const aiCatalogValueAttrs = computed(() =>
  aiCatalog.value.attributes.filter(attribute => Object.hasOwn(aiCatalog.value.values, attribute))
)
const aiCatalogReady = computed(() =>
  aiCatalog.value.identified && aiCatalog.value.group.trim() && aiCatalog.value.name.trim()
)

function sameName(a, b) {
  return normalizeComparable(a) === normalizeComparable(b)
}

function normalizeComparable(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function sameValue(a, b) {
  return normalizeComparable(a) === normalizeComparable(b)
}

function nameTokens(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || []
}

function samePath(item, data) {
  return sameName(item.group, data.group) &&
    sameName(item.category, data.category) &&
    sameName(item.subcategory, data.subcategory)
}

function itemNameContainedInSuggestion(itemName, suggestedName) {
  const itemTokens = nameTokens(itemName)
  const suggestedTokens = new Set(nameTokens(suggestedName))
  return itemTokens.length >= 2 && itemTokens.every(token => suggestedTokens.has(token))
}

function findExactItem(data) {
  return items.value.find(item =>
    samePath(item, data) &&
    sameName(item.name, data.name)
  ) || null
}

function exactExistingItem() {
  return findDuplicateItem(aiCatalog.value) || findExactItem(aiCatalog.value)
}

function searchExistingItem() {
  const data = aiCatalog.value
  return exactExistingItem() || items.value.find(item =>
    samePath(item, data) &&
    itemNameContainedInSuggestion(item.name, data.name)
  ) || null
}

function canonicalizeSuggestionAttributes(suggestion) {
  const item = findDuplicateItem(suggestion) || findExactItem(suggestion)
  const attributes = suggestion.attributes || []
  if (!item) return attributes

  const officialAttributes = item.attributes || []
  const officialByKey = new Map(officialAttributes.map(attribute => [normalizeComparable(attribute), attribute]))
  const result = []
  const resultByKey = new Map()

  function pushAttribute(name, value = '') {
    const key = normalizeComparable(name)
    if (!key) return
    const existing = resultByKey.get(key)
    if (existing) {
      if (value && !existing.value) existing.value = value
      return
    }
    const row = { name, value }
    result.push(row)
    resultByKey.set(key, row)
  }

  for (const attribute of attributes) {
    const name = String(attribute?.name || '').trim()
    const value = String(attribute?.value || '').trim()
    const officialName = officialByKey.get(normalizeComparable(name))
    if (officialName) {
      pushAttribute(officialName, value)
      continue
    }

    const officialNameFromValue = officialByKey.get(normalizeComparable(value))
    if (officialNameFromValue) {
      pushAttribute(officialNameFromValue, 'Sim')
      continue
    }

    pushAttribute(name, value)
  }

  for (const attribute of officialAttributes) pushAttribute(attribute, '')
  return result
}

const aiCatalogFoundItem = computed(() => isSearchMode.value ? searchExistingItem() : exactExistingItem())
const aiCatalogMatchedVariation = computed(() => {
  const item = aiCatalogFoundItem.value
  if (!item) return null
  const values = aiCatalogValueAttrs.value
    .map(attribute => [attribute, aiCatalog.value.values[attribute]])
    .filter(([, value]) => String(value || '').trim())
  const variations = getVariationsForItem(item.id)
  if (!values.length) {
    return variations.find(variation => !Object.keys(variation.values || {}).length) || null
  }
  return variations.find(variation =>
    values.every(([attribute, value]) => sameValue(variation.values?.[attribute], value))
  ) || null
})

const aiCatalogNew = computed(() => {
  const data = aiCatalog.value
  const group = data.group.trim()
  const category = data.category.trim()
  const subcategory = data.subcategory.trim()
  const existingGroupName = uniqueGroups.value.find(value => sameName(value, group)) || ''
  const existingCategoryName = existingGroupName
    ? getCategoriesForGroup(existingGroupName).find(value => sameName(value, category)) || ''
    : ''
  const groupExists = !!existingGroupName
  const categoryExists = !!category && !!existingCategoryName
  const subcategoryExists = !!subcategory && !!existingCategoryName && getSubcategoriesForCategory(existingGroupName, existingCategoryName).some(value => sameName(value, subcategory))
  const itemExists = isSearchMode.value ? aiCatalogFoundItem.value : exactExistingItem()
  return {
    group: !!group && !groupExists,
    category: !!category && !categoryExists,
    subcategory: !!subcategory && !subcategoryExists,
    item: !!data.name.trim() && !itemExists,
  }
})

function aiInputClass(isNew) {
  return [
    'w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100',
    isNew
      ? 'border-amber-400 bg-amber-50 text-gray-900 ring-1 ring-amber-300/60 dark:border-amber-500 dark:bg-amber-950/30'
      : 'border-gray-300 bg-white text-gray-800 dark:border-gray-700',
  ]
}

function clearAiCatalogImage() {
  aiCatalogRun++
  aiCatalogImage.value = ''
  aiCatalogLoading.value = false
  aiCatalogError.value = ''
  aiCatalogAttrInput.value = ''
  aiCatalog.value = emptyAiCatalog()
}

function closeDialog() {
  clearAiCatalogImage()
  emit('close')
}

async function onAiCatalogImageSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    aiCatalogError.value = 'Use uma imagem JPG, PNG ou WEBP.'
    return
  }
  clearAiCatalogImage()
  const run = ++aiCatalogRun
  aiCatalogLoading.value = true
  try {
    const image = await fileAsDataUrl(await compressImageFile(file))
    if (run !== aiCatalogRun) return
    aiCatalogImage.value = image
    const suggestion = await suggestCatalogFromImage({ image })
    if (run !== aiCatalogRun) return

    const existingItem = findDuplicateItem(suggestion)
    const attributes = canonicalizeSuggestionAttributes(suggestion)
    aiCatalog.value = {
      ...suggestion,
      group: existingItem?.group || suggestion.group,
      category: existingItem?.category || suggestion.category,
      subcategory: existingItem?.subcategory || suggestion.subcategory,
      name: existingItem?.name || suggestion.name,
      initialStock: 0,
      attributes: attributes.map(attribute => attribute.name).filter(Boolean),
      values: Object.fromEntries(attributes.map(attribute => [attribute.name, attribute.value || ''])),
    }
    if (!suggestion.identified) aiCatalogError.value = 'Não foi possível identificar um material com segurança.'
  } catch (cause) {
    if (run === aiCatalogRun) aiCatalogError.value = cause.message || 'Não foi possível analisar a imagem.'
  } finally {
    if (run === aiCatalogRun) aiCatalogLoading.value = false
  }
}

function addAiCatalogAttr() {
  const attribute = aiCatalogAttrInput.value.trim()
  if (!attribute) return
  if (!aiCatalog.value.attributes.includes(attribute)) aiCatalog.value.attributes.push(attribute)
  if (!Object.hasOwn(aiCatalog.value.values, attribute)) aiCatalog.value.values[attribute] = ''
  aiCatalogAttrInput.value = ''
}

function onAiCatalogAttrKeydown(event) {
  if (event.key === 'Enter') { event.preventDefault(); addAiCatalogAttr() }
}

function openAiCatalogFound() {
  const item = aiCatalogFoundItem.value
  if (!item) {
    aiCatalogError.value = 'Não encontrei este cadastro no catálogo.'
    return
  }
  emit('found', item, {
    variationId: aiCatalogMatchedVariation.value?.id || '',
  })
  closeDialog()
}

async function saveAiCatalog() {
  const data = aiCatalog.value
  const createsNewItem = aiCatalogNew.value.item
  if (!data.group.trim() || !data.name.trim()) {
    aiCatalogError.value = 'Revise o grupo e o nome do item.'
    return
  }
  if (data.subcategory.trim() && !data.category.trim()) {
    aiCatalogError.value = 'Defina o subgrupo antes do subnível.'
    return
  }
  const initialStock = Number(data.initialStock || 0)
  if (!Number.isInteger(initialStock) || initialStock < 0) {
    aiCatalogError.value = 'Informe um estoque inicial inteiro e não negativo.'
    return
  }

  let item = exactExistingItem()
  if (!item) {
    const result = await addItem({
      group: data.group.trim(),
      category: data.category.trim() || null,
      subcategory: data.subcategory.trim() || null,
      name: data.name.trim(),
      unit: data.unit || 'UN',
      minStock: null,
      attributes: [...data.attributes],
      location: '',
    })
    if (!result.ok) {
      if (!result.duplicate) { aiCatalogError.value = result.error; return }
      item = result.duplicate
    } else {
      item = result.item
    }
  }

  const values = Object.fromEntries(
    data.attributes
      .map(attribute => [attribute, String(data.values[attribute] || '').trim()])
      .filter(([, value]) => value)
  )
  if ((Object.keys(values).length || initialStock > 0) && !aiCatalogMatchedVariation.value) {
    try {
      const variation = await addVariation(item.id, values, initialStock)
      if (!variation.ok) error(`Item encontrado, mas a variação não foi criada: ${variation.error}`)
    } catch {
      error('Item encontrado, mas não foi possível criar a variação sugerida.')
    }
  }

  success(createsNewItem ? `Item "${item.name}" catalogado com IA.` : `Cadastro "${item.name}" reutilizado pela IA.`)
  emit('saved', item, { keepOpen: keepCataloging.value })
  if (keepCataloging.value) {
    clearAiCatalogImage()
  } else {
    closeDialog()
  }
}
</script>

<template>
  <AppDialog
    visible
    :aria-label="dialogTitle"
    @close="closeDialog"
  >
    <div class="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
      <div class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <p class="text-[11px] font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400">{{ isSearchMode ? 'Pesquisa com IA' : 'Catálogo com IA' }}</p>
          <h3 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{{ dialogTitle }}</h3>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ dialogSubtitle }}</p>
        </div>
        <button class="min-h-9 rounded-lg px-3 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200" @click="closeDialog">Fechar</button>
      </div>

      <div class="space-y-5 px-5 py-4">
        <section class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
          <div class="flex items-center gap-3">
            <img v-if="aiCatalogImage" :src="aiCatalogImage" alt="Foto selecionada para catalogação" class="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-black/10 dark:ring-white/10" />
            <div v-else class="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-500">
              <svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z" /></svg>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">Foto do material</p>
                <span v-if="aiCatalog.confidence !== null" class="text-xs tabular-nums text-gray-500 dark:text-gray-400">{{ Math.round(aiCatalog.confidence * 100) }}% de confiança</span>
              </div>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">JPG, PNG ou WEBP, até 6 MB.</p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <label class="inline-flex min-h-9 cursor-pointer items-center rounded-md bg-primary-600 px-3 text-xs font-semibold hover:bg-primary-700 focus-within:ring-2 focus-within:ring-primary-400 focus-within:ring-offset-2 dark:focus-within:ring-offset-gray-900" style="color: var(--ds-primary-text)" :class="aiCatalogLoading ? 'pointer-events-none opacity-60' : ''">
                  <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" :disabled="aiCatalogLoading" @change="onAiCatalogImageSelected" />
                  {{ aiCatalogImage ? 'Trocar foto' : 'Selecionar foto' }}
                </label>
                <label class="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-100 focus-within:ring-2 focus-within:ring-primary-400 focus-within:ring-offset-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus-within:ring-offset-gray-900" :class="aiCatalogLoading ? 'pointer-events-none opacity-60' : ''">
                  <input class="sr-only" type="file" accept="image/*" capture="environment" :disabled="aiCatalogLoading" @change="onAiCatalogImageSelected" />
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175 7.7 4.65A1.5 1.5 0 0 1 9.002 3.9h5.996a1.5 1.5 0 0 1 1.302.75l.873 1.525A1.5 1.5 0 0 0 18.475 6.9H19.5A1.5 1.5 0 0 1 21 8.4v9.6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V8.4a1.5 1.5 0 0 1 1.5-1.5h1.025a1.5 1.5 0 0 0 1.302-.725Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 12.75a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>
                  Tirar foto
                </label>
                <button v-if="aiCatalogImage" type="button" class="min-h-9 rounded-md px-3 text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200" @click="clearAiCatalogImage">Remover</button>
                <span v-if="aiCatalogLoading" class="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <svg class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" /><path class="opacity-75" fill="currentColor" d="M21 12a9 9 0 0 0-9-9v3a6 6 0 0 1 6 6h3Z" /></svg>
                  Analisando…
                </span>
              </div>
            </div>
          </div>
          <p v-if="aiCatalogError" class="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{{ aiCatalogError }}</p>
          <ul v-if="aiCatalog.observations.length" class="mt-2 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
            <li v-for="note in aiCatalog.observations" :key="note">• {{ note }}</li>
          </ul>
        </section>

        <div v-if="aiCatalog.identified && aiCatalog.industrialSupply === false" role="status" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300">
          <p class="text-sm font-semibold">Pode não fazer parte de suprimentos industriais</p>
          <p class="mt-1 text-xs opacity-80">A classificação é apenas um aviso. Revise os dados e catalogue normalmente se o item pertence ao seu estoque.</p>
        </div>

        <template v-if="aiCatalogImage && !aiCatalogLoading">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Grupo
                <span v-if="aiCatalogNew.group" class="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">Novo</span>
              </span>
              <input v-model="aiCatalog.group" list="ai-catalog-groups" :class="aiInputClass(aiCatalogNew.group)" />
              <datalist id="ai-catalog-groups"><option v-for="group in uniqueGroups" :key="group" :value="group" /></datalist>
            </label>
            <label class="block">
              <span class="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Subgrupo
                <span v-if="aiCatalogNew.category" class="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">Novo</span>
              </span>
              <input v-model="aiCatalog.category" list="ai-catalog-categories" :class="aiInputClass(aiCatalogNew.category)" />
              <datalist id="ai-catalog-categories"><option v-for="category in getCategoriesForGroup(aiCatalog.group)" :key="category" :value="category" /></datalist>
            </label>
            <label class="block">
              <span class="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Subnível opcional
                <span v-if="aiCatalogNew.subcategory" class="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">Novo</span>
              </span>
              <input v-model="aiCatalog.subcategory" list="ai-catalog-subcategories" placeholder="Opcional" :class="aiInputClass(aiCatalogNew.subcategory)" />
              <datalist id="ai-catalog-subcategories"><option v-for="subcategory in getSubcategoriesForCategory(aiCatalog.group, aiCatalog.category)" :key="subcategory" :value="subcategory" /></datalist>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Unidade</span>
              <select v-model="aiCatalog.unit" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                <option v-for="unit in units" :key="unit.value" :value="unit.value">{{ unit.label }}</option>
              </select>
            </label>
          </div>

          <label class="block">
            <span class="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Nome do item
              <span v-if="aiCatalogNew.item" class="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">{{ isSearchMode ? 'Não encontrado' : 'Novo' }}</span>
            </span>
            <input v-model="aiCatalog.name" :class="aiInputClass(aiCatalogNew.item)" />
          </label>

          <div v-if="!isSearchMode && aiCatalogFoundItem && aiCatalogReady" role="status" class="rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-green-800 dark:border-green-900/60 dark:bg-green-950/25 dark:text-green-300">
            <p class="text-sm font-semibold">Este item já existe no catálogo</p>
            <p class="mt-1 text-xs opacity-80">{{ [aiCatalogFoundItem.group, aiCatalogFoundItem.category, aiCatalogFoundItem.subcategory, aiCatalogFoundItem.name].filter(Boolean).join(' > ') }} será reutilizado; nenhum item duplicado será criado.</p>
          </div>

          <div v-if="isSearchMode && aiCatalogReady" class="rounded-lg border px-3 py-3 text-sm" :class="aiCatalogFoundItem ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/25 dark:text-green-300' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300'">
            <p class="font-semibold">{{ aiCatalogFoundItem ? 'Encontrado no catálogo' : 'Cadastro igual não encontrado' }}</p>
            <p class="mt-1 text-xs opacity-80">
              {{ [aiCatalog.group, aiCatalog.category, aiCatalog.subcategory, aiCatalog.name].filter(Boolean).join(' > ') }}
            </p>
            <p v-if="aiCatalogMatchedVariation" class="mt-1 text-xs font-medium">Variação correspondente também encontrada.</p>
          </div>

          <div>
            <p class="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Atributos</p>
            <div class="flex min-h-[42px] flex-wrap items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-2 focus-within:border-primary-400 dark:border-gray-700 dark:bg-gray-800">
              <span v-for="(attribute, index) in aiCatalog.attributes" :key="attribute" class="inline-flex items-center gap-1 rounded bg-primary-50 px-1.5 py-0.5 text-[11px] text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                {{ attribute }}
                <button class="text-primary-400 hover:text-red-500" @click.stop="aiCatalog.attributes.splice(index, 1)">
                  <svg class="h-2.5 w-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </span>
              <input v-model="aiCatalogAttrInput" placeholder="+ atributo" class="min-w-[110px] flex-1 bg-transparent px-1.5 py-0.5 text-sm text-gray-700 outline-none placeholder-gray-400 dark:text-gray-200 dark:placeholder-gray-500" @keydown="onAiCatalogAttrKeydown" />
              <button v-if="aiCatalogAttrInput.trim()" class="text-xs font-medium text-primary-600 dark:text-primary-400" @click="addAiCatalogAttr">Adicionar</button>
            </div>
          </div>

          <div v-if="aiCatalogValueAttrs.length">
            <div class="mb-1.5 flex items-center justify-between gap-3">
              <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Valores identificados</p>
              <span class="text-[11px] text-gray-400 dark:text-gray-500">{{ isSearchMode ? 'usados para filtrar a variação' : 'definem a nova variação' }}</span>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <label v-for="attribute in aiCatalogValueAttrs" :key="attribute" class="block">
                <span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">{{ attribute }}</span>
                <input v-model="aiCatalog.values[attribute]" :placeholder="`Revisar ${attribute.toLowerCase()}`" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500" />
              </label>
            </div>
          </div>

          <label v-if="!isSearchMode && !aiCatalogMatchedVariation" class="block sm:max-w-xs">
            <span class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Estoque inicial</span>
            <input v-model.number="aiCatalog.initialStock" type="number" min="0" step="1" inputmode="numeric" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            <span class="mt-1 block text-[11px] text-gray-400 dark:text-gray-500">Quantidade já disponível ao criar esta variação.</span>
          </label>

          <p v-else-if="!isSearchMode && aiCatalogMatchedVariation" class="text-xs text-gray-500 dark:text-gray-400">
            A variação já existe; o saldo atual não será alterado.
          </p>
        </template>
      </div>

      <div class="sticky bottom-0 flex flex-col gap-3 border-t border-gray-100 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4 sm:pb-4">
        <label v-if="!isSearchMode" class="inline-flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:bg-gray-800">
          <input v-model="keepCataloging" type="checkbox" class="peer sr-only" />
          <span class="relative h-5 w-9 rounded-full bg-gray-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:content-[''] peer-checked:bg-primary-600 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:bg-gray-700 dark:peer-focus-visible:ring-offset-gray-900"></span>
          <span>Continuar catalogando</span>
        </label>
        <div class="flex w-full gap-2 sm:w-auto sm:justify-end">
          <button class="min-h-10 flex-1 rounded-lg bg-gray-100 px-4 text-sm text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:flex-none" @click="closeDialog">Cancelar</button>
          <button v-if="isSearchMode" class="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg bg-primary-600 px-4 text-sm font-medium hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none" style="color: var(--ds-primary-text)" :disabled="!aiCatalogFoundItem || aiCatalogLoading" @click="openAiCatalogFound">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35m0 0A7.5 7.5 0 1 0 6.05 6.05a7.5 7.5 0 0 0 10.6 10.6Z" /></svg>
            {{ aiCatalogFoundItem ? 'Abrir no catálogo' : 'Não encontrado' }}
          </button>
          <button v-else class="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg bg-primary-600 px-4 text-sm font-medium hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none" style="color: var(--ds-primary-text)" :disabled="!aiCatalogReady || aiCatalogLoading" @click="saveAiCatalog">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
            {{ aiCatalogFoundItem ? (keepCataloging ? 'Reutilizar e continuar' : 'Reutilizar cadastro') : (keepCataloging ? 'Aprovar e continuar' : 'Aprovar e catalogar') }}
          </button>
        </div>
      </div>
    </div>
  </AppDialog>
</template>
