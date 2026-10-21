import { ref, computed, watch, nextTick } from 'vue'
import { useItems } from './useItems.js'
import { useToast } from './useToast.js'
import { units } from '../utils/units.js'
import { suggestCatalogFromImage } from '../services/api.js'

export function useEditHierarchyState() {
const {
  items,
  uniqueGroups, getCategoriesForGroup, getSubcategoriesForCategory,
  renameGroup, renameCategory, renameSubcategory,
  moveCategory, moveSubcategory, moveItem,
  deleteGroup, deleteCategory, deleteSubcategory,
  countItemsInGroup, countItemsInCategory, countItemsInSubcategory,
  getItemsForSubcategory, renameAttribute, addAttribute, removeAttribute,
  getVariationsForItem, addItem, editItem, deleteItem,
  addVariation, editVariation, deleteVariation,
  reorderGroups, reorderCategories, reorderSubcategories, reorderItemAttributes,
  sortGroupsAlphabetically, sortCategoriesAlphabetically, sortSubcategoriesAlphabetically
} = useItems()

const { success, error } = useToast()
const reorderingAttributes = ref(false)
async function moveAttribute(itemId, from, to) {
  if (reorderingAttributes.value) return
  reorderingAttributes.value = true
  try { await reorderItemAttributes(itemId, from, to) }
  catch (cause) { error(cause?.message || 'Não foi possível salvar a ordem dos atributos.') }
  finally { reorderingAttributes.value = false }
}

// Returns unique extra-field keys used across all variations of an item
function getItemExtraKeys(itemId) {
  const vars = getVariationsForItem(itemId)
  const keys = new Set()
  for (const v of vars) for (const k of Object.keys(v.extras || {})) keys.add(k)
  return [...keys]
}

// ===== Navigation =====
const selectedGroup = ref(null)
const selectedCategory = ref(null)
const selectedSubcategory = ref(null)
const groupSearch = ref('')
const searchQ = computed(() => groupSearch.value.trim().toLowerCase())

const filteredGroupList = computed(() => {
  const q = searchQ.value
  if (!q) return uniqueGroups.value
  return uniqueGroups.value.filter(g => {
    if (g.toLowerCase().includes(q)) return true
    const cats = getCategoriesForGroup(g)
    for (const c of cats) {
      if (c.toLowerCase().includes(q)) return true
      const subs = getSubcategoriesForCategory(g, c)
      if (subs.some(s => s.toLowerCase().includes(q))) return true
    }
    return false
  })
})

// Auto-navigate when the query uniquely points to one group+category
watch(searchQ, async (q) => {
  if (!q) return
  const matches = []
  for (const g of uniqueGroups.value) {
    for (const c of getCategoriesForGroup(g)) {
      const subs = getSubcategoriesForCategory(g, c)
      if (subs.some(s => s.toLowerCase().includes(q))) {
        matches.push({ g, c })
      }
    }
  }
  if (matches.length === 1) {
    selectedGroup.value = matches[0].g
    await nextTick() // let selectedGroup watcher reset selectedCategory first
    selectedCategory.value = matches[0].c
  }
})

watch(selectedGroup, () => { selectedCategory.value = null; selectedSubcategory.value = null; cancelEdit(); cancelDelete(); cancelMove() })
watch(selectedCategory, () => { selectedSubcategory.value = null; cancelAddSubcategory(); cancelEdit(); cancelDelete(); cancelMove() })
watch(selectedSubcategory, () => { expandedItemId.value = null; cancelAddVariation(); cancelEditVariation(); cancelEdit(); cancelDelete(); cancelMove() })

watch(uniqueGroups, (groups) => {
  if (selectedGroup.value && !groups.includes(selectedGroup.value)) selectedGroup.value = null
})

// ===== Inline editing =====
const editing = ref(null)
const editValue = ref('')

function startEdit(type, oldName, group = null, category = null) {
  editing.value = { type, oldName, group, category }
  editValue.value = oldName
  cancelDelete()
}

function cancelEdit() {
  editing.value = null
  editValue.value = ''
}

function saveEdit() {
  const e = editing.value
  if (!e) return
  const newName = editValue.value.trim()
  if (!newName || newName === e.oldName) { cancelEdit(); return }
  if (e.type === 'group') {
    renameGroup(e.oldName, newName)
    selectedGroup.value = newName
    success(`Grupo renomeado para "${newName}".`)
  } else if (e.type === 'category') {
    renameCategory(e.group, e.oldName, newName)
    if (selectedCategory.value === e.oldName) selectedCategory.value = newName
    success(`Categoria renomeada para "${newName}".`)
  } else if (e.type === 'subcategory') {
    renameSubcategory(e.group, e.category, e.oldName, newName)
    success(`Subcategoria renomeada para "${newName}".`)
  }
  cancelEdit()
}

function onEditKeydown(e) {
  if (e.key === 'Enter') saveEdit()
  else if (e.key === 'Escape') cancelEdit()
}

function isEditing(type, name, group = null, category = null) {
  const e = editing.value
  if (!e || e.type !== type || e.oldName !== name) return false
  if (type === 'category' && e.group !== group) return false
  if (type === 'subcategory' && (e.group !== group || e.category !== category)) return false
  return true
}

// ===== Inline delete confirmation =====
const deletingKey = ref(null)

function dKey(type, group = null, cat = null, sub = null) {
  return [type, group, cat, sub].join('|||')
}

function requestDelete(type, group = null, cat = null, sub = null) {
  deletingKey.value = dKey(type, group, cat, sub)
  cancelEdit()
}

function isDeleting(type, group = null, cat = null, sub = null) {
  return deletingKey.value === dKey(type, group, cat, sub)
}

function cancelDelete() { deletingKey.value = null }

function confirmDelete() {
  const k = deletingKey.value
  if (!k) return
  const [type, g, c, s] = k.split('|||').map(v => v === 'null' ? null : v)
  if (type === 'group') {
    if (selectedGroup.value === g) selectedGroup.value = null
    deleteGroup(g)
    success(`Grupo "${g}" excluído.`)
  } else if (type === 'category') {
    if (selectedCategory.value === c) selectedCategory.value = null
    deleteCategory(g, c)
    success(`Categoria "${c}" excluída.`)
  } else if (type === 'subcategory') {
    if (selectedSubcategory.value === s) selectedSubcategory.value = null
    deleteSubcategory(g, c, s)
    success(`Subcategoria "${s}" excluída.`)
  } else if (type === 'item') {
    deleteItem(g)
    if (expandedItemId.value === g) expandedItemId.value = null
    success(`Modelo "${c}" excluido.`)
  }
  deletingKey.value = null
}

// ===== Move hierarchy =====
const moving = ref(null)
const moveTargetGroup = ref('')
const moveTargetCategory = ref('')
const moveTargetSubcategory = ref('')

const moveTargetCategories = computed(() =>
  moveTargetGroup.value ? getCategoriesForGroup(moveTargetGroup.value) : []
)

const moveTargetSubcategories = computed(() =>
  moveTargetGroup.value && moveTargetCategory.value
    ? getSubcategoriesForCategory(moveTargetGroup.value, moveTargetCategory.value)
    : []
)

watch(moveTargetGroup, (group) => {
  if (!moving.value) return
  const categories = group ? getCategoriesForGroup(group) : []
  if (moving.value.type === 'subcategory' && !categories.includes(moveTargetCategory.value)) {
    moveTargetCategory.value = categories[0] || ''
  } else if (moving.value.type === 'item' && moveTargetCategory.value && !categories.includes(moveTargetCategory.value)) {
    moveTargetCategory.value = ''
  }
  moveTargetSubcategory.value = ''
})

watch(moveTargetCategory, (category) => {
  if (!moving.value || moving.value.type !== 'item') return
  const subcategories = moveTargetGroup.value && category
    ? getSubcategoriesForCategory(moveTargetGroup.value, category)
    : []
  if (moveTargetSubcategory.value && !subcategories.includes(moveTargetSubcategory.value)) {
    moveTargetSubcategory.value = ''
  }
})

function startMoveCategory(group, category) {
  moving.value = { type: 'category', group, category }
  moveTargetGroup.value = group
  moveTargetCategory.value = ''
  moveTargetSubcategory.value = ''
  cancelEdit()
  cancelDelete()
}

function startMoveSubcategory(group, category, subcategory) {
  moving.value = { type: 'subcategory', group, category, subcategory }
  moveTargetGroup.value = group
  moveTargetCategory.value = category
  moveTargetSubcategory.value = ''
  cancelEdit()
  cancelDelete()
}

function startMoveItem(item) {
  moving.value = { type: 'item', item }
  moveTargetGroup.value = item.group || ''
  moveTargetCategory.value = item.category || ''
  moveTargetSubcategory.value = item.subcategory || ''
  cancelEdit()
  cancelDelete()
}

function cancelMove() {
  moving.value = null
  moveTargetGroup.value = ''
  moveTargetCategory.value = ''
  moveTargetSubcategory.value = ''
}

async function saveMove() {
  const move = moving.value
  if (!move) return
  const targetGroup = moveTargetGroup.value
  const targetCategory = moveTargetCategory.value
  const targetSubcategory = moveTargetSubcategory.value
  if (!targetGroup) {
    error('Escolha um grupo de destino.')
    return
  }
  try {
    if (move.type === 'category') {
      if (move.group === targetGroup) { cancelMove(); return }
      await moveCategory(move.group, move.category, targetGroup)
      selectedGroup.value = targetGroup
      await nextTick()
      selectedCategory.value = move.category
      success(`Categoria "${move.category}" movida.`)
    } else if (move.type === 'subcategory') {
      if (!targetCategory) {
        error('Escolha uma categoria de destino.')
        return
      }
      if (move.group === targetGroup && move.category === targetCategory) { cancelMove(); return }
      await moveSubcategory(move.group, move.category, move.subcategory, targetGroup, targetCategory)
      selectedGroup.value = targetGroup
      await nextTick()
      selectedCategory.value = targetCategory
      selectedSubcategory.value = move.subcategory
      success(`Subcategoria "${move.subcategory}" movida.`)
    } else if (move.type === 'item') {
      if (targetSubcategory && !targetCategory) {
        error('Escolha uma categoria antes da subcategoria.')
        return
      }
      const result = await moveItem(
        move.item.id,
        targetGroup,
        targetCategory || null,
        targetSubcategory || null
      )
      if (!result?.ok) {
        error(result?.error || 'Não foi possível mover o item.')
        return
      }
      selectedGroup.value = targetGroup
      await nextTick()
      selectedCategory.value = targetCategory || null
      await nextTick()
      selectedSubcategory.value = targetSubcategory || null
      success(`Item "${move.item.name}" movido.`)
    }
    cancelMove()
  } catch (err) {
    error(err?.message || 'Não foi possível mover.')
  }
}

// ===== Attribute editing =====
const editingAttr = ref(null)
const editAttrValue = ref('')
const addingAttrItemId = ref(null)
const newAttrName = ref('')
const removingAttr = ref(null)

function startAttrEdit(itemId, attrName) {
  editingAttr.value = { itemId, oldName: attrName }
  editAttrValue.value = attrName
}

async function saveAttrEdit() {
  if (!editingAttr.value) return
  const newName = editAttrValue.value.trim()
  if (!newName || newName === editingAttr.value.oldName) { cancelAttrEdit(); return }
  try {
    const result = await renameAttribute(editingAttr.value.itemId, editingAttr.value.oldName, newName)
    if (!result?.ok) { error(result?.error || 'Não foi possível renomear o atributo.'); return }
    success(`Atributo renomeado para "${newName}".`)
    cancelAttrEdit()
  } catch (cause) {
    error(cause?.message || 'Não foi possível renomear o atributo.')
  }
}

function cancelAttrEdit() {
  editingAttr.value = null
  editAttrValue.value = ''
}

function onAttrEditKeydown(e) {
  if (e.key === 'Enter') saveAttrEdit()
  else if (e.key === 'Escape') cancelAttrEdit()
}

function startAddAttr(itemId) {
  addingAttrItemId.value = itemId
  newAttrName.value = ''
}

async function saveNewAttr() {
  const name = newAttrName.value.trim()
  if (!name) { cancelAddAttr(); return }
  try {
    const result = await addAttribute(addingAttrItemId.value, name)
    if (!result?.ok) { error(result?.error || 'Não foi possível adicionar o atributo.'); return }
    success(`Atributo "${name}" adicionado.`)
    cancelAddAttr()
  } catch (cause) {
    error(cause?.message || 'Não foi possível adicionar o atributo.')
  }
}

function cancelAddAttr() {
  addingAttrItemId.value = null
  newAttrName.value = ''
}

function onNewAttrKeydown(e) {
  if (e.key === 'Enter') saveNewAttr()
  else if (e.key === 'Escape') cancelAddAttr()
}

function onRemoveAttr(itemId, attrName) {
  removingAttr.value = {
    itemId,
    attrName,
    affectedVariations: getVariationsForItem(itemId).filter(variation =>
      Object.hasOwn(variation.values || {}, attrName)
    ).length,
  }
}

function cancelRemoveAttr() {
  removingAttr.value = null
}

async function confirmRemoveAttr() {
  const target = removingAttr.value
  if (!target) return
  try {
    const result = await removeAttribute(target.itemId, target.attrName)
    if (!result?.ok) { error(result?.error || 'Não foi possível excluir o atributo.'); return }
    success(`Atributo "${target.attrName}" excluído.`)
    cancelRemoveAttr()
  } catch (cause) {
    error(cause?.message || 'Não foi possível excluir o atributo.')
  }
}

// ===== Item model editing =====
const editingItemModel = ref(null)
const editItemModelName = ref('')

function startEditItemModel(item) {
  editingItemModel.value = item
  editItemModelName.value = item.name
  cancelDelete()
  cancelMove()
}

function cancelEditItemModel() {
  editingItemModel.value = null
  editItemModelName.value = ''
  cancelAttrEdit()
  cancelAddAttr()
  cancelRemoveAttr()
}

async function saveItemModelName() {
  const item = editingItemModel.value
  const name = editItemModelName.value.trim()
  if (!item || !name || name === item.name) return
  try {
    const result = await editItem(item.id, { name })
    if (!result?.ok) { error(result?.error || 'Não foi possível renomear o modelo.'); return }
    editItemModelName.value = result.item.name
    success(`Modelo renomeado para "${result.item.name}".`)
  } catch (cause) {
    error(cause?.message || 'Não foi possível renomear o modelo.')
  }
}

// ===== Item unit editing =====
const editingUnitItemId = ref(null)
const editUnitValue = ref('')

function startEditUnit(item) {
  editingUnitItemId.value = item.id
  editUnitValue.value = item.unit || 'UN'
}

function saveEditUnit(itemId) {
  editItem(itemId, { unit: editUnitValue.value })
  editingUnitItemId.value = null
  editUnitValue.value = ''
}

function cancelEditUnit() {
  editingUnitItemId.value = null
  editUnitValue.value = ''
}

function isEditingAttr(itemId, attrName) {
  return editingAttr.value?.itemId === itemId && editingAttr.value?.oldName === attrName
}

// ===== Add item modal =====
const groupDirectKey = '__group_direct__'
const categoryDirectKey = '__category_direct__'
const addingItemForSub = ref(null)
const newItemName = ref('')
const newItemUnit = ref('UN')
const newItemAttrs = ref([])
const newItemAttrInput = ref('')

function normName(value) {
  return String(value || '').trim().toLowerCase()
}

function isGroupModelItem(item) {
  return Boolean(item?.group && !item?.category && !item?.subcategory && normName(item.name) === normName(item.group) && !getVariationsForItem(item.id).length)
}

function isCategoryModelItem(item) {
  return Boolean(item?.category && !item?.subcategory && normName(item.name) === normName(item.category) && !getVariationsForItem(item.id).length)
}

function isSubcategoryModelItem(item) {
  return Boolean(item?.subcategory && normName(item.name) === normName(item.subcategory) && !getVariationsForItem(item.id).length)
}

const groupDirectItems = computed(() =>
  selectedGroup.value
    ? items.value.filter(i =>
        i.group === selectedGroup.value &&
        !i.category &&
        !i.subcategory &&
        !isGroupModelItem(i)
      )
    : []
)

const categoryDirectItems = computed(() =>
  selectedGroup.value && selectedCategory.value
    ? items.value.filter(i =>
        i.group === selectedGroup.value &&
        i.category === selectedCategory.value &&
        !i.subcategory &&
        !isCategoryModelItem(i)
      )
    : []
)

function getGroupModelAttrs(group = selectedGroup.value) {
  const model = items.value.find(i => i.group === group && !i.category && !i.subcategory && isGroupModelItem(i))
  return [...(model?.attributes || [])]
}

function getCategoryModelAttrs(group = selectedGroup.value, category = selectedCategory.value) {
  const model = items.value.find(i => i.group === group && i.category === category && !i.subcategory && isCategoryModelItem(i))
  const attrs = model?.attributes || []
  return attrs.length ? [...attrs] : getGroupModelAttrs(group)
}

function getSubcategoryModelAttrs(group, category, subcategory) {
  const model = getItemsForSubcategory(group, category, subcategory).find(isSubcategoryModelItem)
  return [...(model?.attributes || [])]
}

function getVisibleItemsForSubcategory(group, category, subcategory) {
  return getItemsForSubcategory(group, category, subcategory).filter(item => !isSubcategoryModelItem(item))
}

function countVisibleItemsInSubcategory(group, category, subcategory) {
  return getVisibleItemsForSubcategory(group, category, subcategory).length
}

function inheritedItemAttrs(sub) {
  if (sub === groupDirectKey) return getGroupModelAttrs()
  const targetSub = sub === categoryDirectKey ? null : sub
  if (targetSub) {
    const subModelAttrs = getSubcategoryModelAttrs(selectedGroup.value, selectedCategory.value, targetSub)
    if (subModelAttrs.length) return subModelAttrs
  }
  return getCategoryModelAttrs()
}

function getItemDefaultsForAdd(sub) {
  const isGroupDirect = sub === groupDirectKey
  const targetCategory = isGroupDirect ? null : (selectedCategory.value || null)
  const scopedItems = items.value.filter(i =>
    i.group === selectedGroup.value &&
    (targetCategory ? i.category === targetCategory : !i.category)
  )
  return {
    unit: scopedItems[0]?.unit || 'UN',
  }
}

const newItemContextLabel = computed(() => {
  const sub = addingItemForSub.value
  if (!sub) return ''
  if (sub === groupDirectKey) return selectedGroup.value || ''
  if (sub === categoryDirectKey) return selectedCategory.value || selectedGroup.value || ''
  return sub
})

const newItemHelpText = computed(() => {
  const sub = addingItemForSub.value
  if (sub === groupDirectKey) return 'Modelo cadastrado direto no grupo, sem subgrupo.'
  if (sub === categoryDirectKey) return 'Modelo cadastrado neste subgrupo, sem subnivel opcional.'
  return 'Modelo cadastrado dentro deste subnivel opcional.'
})

const newItemPlaceholder = computed(() => {
  const label = newItemContextLabel.value
  if (!label) return 'Nome do modelo'
  if (addingItemForSub.value === groupDirectKey) return `Nome do modelo sem subgrupo em ${label}`
  return `Nome do modelo em ${label}`
})

function startAddItem(sub) {
  const defaults = getItemDefaultsForAdd(sub)
  addingItemForSub.value = sub
  newItemName.value = ''
  newItemUnit.value = defaults.unit
  newItemAttrs.value = inheritedItemAttrs(sub)
  newItemAttrInput.value = ''
  cancelEdit()
  cancelDelete()
}

function cancelAddItem() {
  addingItemForSub.value = null
  newItemName.value = ''
  newItemUnit.value = 'UN'
  newItemAttrs.value = []
  newItemAttrInput.value = ''
}

function addNewItemAttr() {
  const val = newItemAttrInput.value.trim()
  if (!val) return
  if (!newItemAttrs.value.includes(val)) newItemAttrs.value.push(val)
  newItemAttrInput.value = ''
}

function onNewItemAttrKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); addNewItemAttr() }
  else if (e.key === 'Backspace' && newItemAttrInput.value === '' && newItemAttrs.value.length > 0) {
    newItemAttrs.value.pop()
  }
}

async function saveAddItem(sub) {
  if (!selectedGroup.value) return
  const isGroupDirect = sub === groupDirectKey
  const targetCategory = isGroupDirect ? null : (selectedCategory.value || null)
  const targetSub = sub === categoryDirectKey || isGroupDirect ? null : sub
  const result = await addItem({
    group: selectedGroup.value,
    category: targetCategory,
    subcategory: targetSub || null,
    name: newItemName.value.trim() || null,
    unit: newItemUnit.value || 'UN',
    attributes: [...newItemAttrs.value],
  })
  if (!result.ok) { error(result.error); return }
  const label = targetSub || targetCategory || selectedGroup.value
  success(`Item adicionado em "${label}".`)
  cancelAddItem()
}

function onNewItemKeydown(e) {
  if (e.key === 'Enter') saveAddItem(addingItemForSub.value)
  else if (e.key === 'Escape') cancelAddItem()
}

// ===== Variation management =====
const expandedItemId = ref(null)

function toggleItemExpand(itemId) {
  if (expandedItemId.value === itemId) {
    expandedItemId.value = null
    cancelAddVariation()
    cancelEditVariation()
  } else {
    expandedItemId.value = itemId
    cancelAddVariation()
    cancelEditVariation()
  }
}

const addingVariationForItemId = ref(null)
const newVariationValues = ref({})
const newVariationStock = ref(0)

function startAddVariation(item) {
  addingVariationForItemId.value = item.id
  newVariationValues.value = Object.fromEntries((item.attributes || []).map(a => [a, '']))
  newVariationStock.value = 0
}

function cancelAddVariation() {
  addingVariationForItemId.value = null
  newVariationValues.value = {}
  newVariationStock.value = 0
}

async function saveAddVariation(item) {
  const result = await addVariation(item.id, { ...newVariationValues.value }, newVariationStock.value)
  if (!result.ok) { error(result.error || 'Variação duplicada.'); return }
  success('Variação adicionada.')
  cancelAddVariation()
}

const editingVariationId = ref(null)
const editingVariationValues = ref({})
const editingVariationStock = ref(0)

function startEditVariation(variation) {
  editingVariationId.value = variation.id
  editingVariationValues.value = { ...variation.values }
  editingVariationStock.value = variation.stock
  cancelAddVariation()
}

function cancelEditVariation() {
  editingVariationId.value = null
  editingVariationValues.value = {}
  editingVariationStock.value = 0
}

async function saveEditVariation() {
  const result = await editVariation(editingVariationId.value, {
    values: { ...editingVariationValues.value },
    stock: editingVariationStock.value
  })
  if (!result.ok) { error(result.error || 'Erro ao salvar.'); return }
  success('Variação atualizada.')
  cancelEditVariation()
}

function onDeleteVariation(id) {
  deleteVariation(id)
  success('Variação removida.')
}

// ===== Computed helpers =====
const groupCategories = computed(() =>
  selectedGroup.value ? getCategoriesForGroup(selectedGroup.value) : []
)

const filteredCategoryList = computed(() => {
  const q = searchQ.value
  if (!q || !selectedGroup.value) return groupCategories.value
  return groupCategories.value.filter(c => {
    if (c.toLowerCase().includes(q)) return true
    const subs = getSubcategoriesForCategory(selectedGroup.value, c)
    return subs.some(s => s.toLowerCase().includes(q))
  })
})

const categorySubcategories = computed(() =>
  selectedGroup.value && selectedCategory.value
    ? getSubcategoriesForCategory(selectedGroup.value, selectedCategory.value)
    : []
)

const filteredSubcategoryList = computed(() => {
  const q = searchQ.value
  if (!q) return categorySubcategories.value
  return categorySubcategories.value.filter(s => s.toLowerCase().includes(q))
})

// ===== Catalog with AI =====
const aiCatalogOpen = ref(false)
const aiCatalogImage = ref('')
const aiCatalogLoading = ref(false)
const aiCatalogError = ref('')
const aiCatalogAttrInput = ref('')
const aiCatalog = ref(emptyAiCatalog())
let aiCatalogRun = 0

function emptyAiCatalog() {
  return {
    identified: false,
    industrialSupply: true,
    group: '',
    category: '',
    subcategory: '',
    name: '',
    unit: 'UN',
    confidence: null,
    attributes: [],
    values: {},
    observations: []
  }
}

const aiCatalogValueAttrs = computed(() =>
  aiCatalog.value.attributes.filter(attribute => Object.hasOwn(aiCatalog.value.values, attribute))
)
const aiCatalogReady = computed(() =>
  aiCatalog.value.identified && aiCatalog.value.group.trim() && aiCatalog.value.name.trim()
)

function startAiCatalog() {
  aiCatalogOpen.value = true
  clearAiCatalogImage()
  cancelEdit()
  cancelDelete()
}

function cancelAiCatalog() {
  aiCatalogOpen.value = false
  clearAiCatalogImage()
}

function clearAiCatalogImage() {
  aiCatalogRun++
  aiCatalogImage.value = ''
  aiCatalogLoading.value = false
  aiCatalogError.value = ''
  aiCatalogAttrInput.value = ''
  aiCatalog.value = emptyAiCatalog()
}

const AI_CATALOG_MAX_IMAGE_BYTES = 6 * 1024 * 1024

function imageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('NÃ£o foi possÃ­vel ler a imagem.'))
    }
    image.src = url
  })
}

function canvasToJpeg(canvas, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
}

async function compressImageFile(file) {
  if (file.size <= AI_CATALOG_MAX_IMAGE_BYTES) return file

  const image = await imageFromBlob(file)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('NÃ£o foi possÃ­vel reduzir a imagem.')

  let maxEdge = Math.min(1800, Math.max(image.width, image.height))
  let quality = 0.82

  while (maxEdge >= 900) {
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    while (quality >= 0.45) {
      const blob = await canvasToJpeg(canvas, quality)
      if (blob && blob.size <= AI_CATALOG_MAX_IMAGE_BYTES) return blob
      quality -= 0.12
    }

    quality = 0.76
    maxEdge = Math.round(maxEdge * 0.82)
  }

  throw new Error('NÃ£o foi possÃ­vel reduzir a imagem para menos de 6 MB.')
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    reader.readAsDataURL(file)
  })
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

    const attributes = suggestion.attributes || []
    aiCatalog.value = {
      ...suggestion,
      attributes: attributes.map(attribute => attribute.name).filter(Boolean),
      values: Object.fromEntries(attributes.map(attribute => [attribute.name, attribute.value || '']))
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

async function saveAiCatalog() {
  const data = aiCatalog.value
  if (!data.group.trim() || !data.name.trim()) {
    aiCatalogError.value = 'Revise o grupo e o nome do item.'
    return
  }
  if (data.subcategory.trim() && !data.category.trim()) {
    aiCatalogError.value = 'Defina o subgrupo antes do subnível.'
    return
  }

  const result = await addItem({
    group: data.group.trim(),
    category: data.category.trim() || null,
    subcategory: data.subcategory.trim() || null,
    name: data.name.trim(),
    unit: data.unit || 'UN',
    minStock: null,
    attributes: [...data.attributes],
    location: ''
  })
  if (!result.ok) { aiCatalogError.value = result.error; return }

  const values = Object.fromEntries(
    data.attributes
      .map(attribute => [attribute, String(data.values[attribute] || '').trim()])
      .filter(([, value]) => value)
  )
  if (Object.keys(values).length) {
    try {
      const variation = await addVariation(result.item.id, values, 0)
      if (!variation.ok) error(`Item criado, mas a variação não foi criada: ${variation.error}`)
    } catch {
      error('Item criado, mas não foi possível criar a variação sugerida.')
    }
  }

  selectedGroup.value = result.item.group
  await nextTick()
  selectedCategory.value = result.item.category || null
  await nextTick()
  selectedSubcategory.value = result.item.subcategory || null
  success(`Item "${result.item.name}" catalogado com IA.`)
  cancelAiCatalog()
}

// ===== Create group =====
const addingGroup = ref(false)
const newGroupName = ref('')

function startAddGroup() {
  addingGroup.value = true
  newGroupName.value = ''
  cancelEdit()
  cancelDelete()
}
function cancelAddGroup() {
  addingGroup.value = false
  newGroupName.value = ''
}
async function saveAddGroup() {
  const name = newGroupName.value.trim()
  if (!name) { cancelAddGroup(); return }
  if (uniqueGroups.value.includes(name)) { error(`Grupo "${name}" já existe.`); return }
  const result = await addItem({ group: name })
  if (!result.ok) { error(result.error); return }
  selectedGroup.value = name
  success(`Grupo "${name}" criado.`)
  cancelAddGroup()
}
function onAddGroupKeydown(e) {
  if (e.key === 'Enter') saveAddGroup()
  else if (e.key === 'Escape') cancelAddGroup()
}

// ===== Create category =====
const addingCategory = ref(false)
const newCategoryName = ref('')

function startAddCategory() {
  addingCategory.value = true
  newCategoryName.value = ''
  cancelEdit()
  cancelDelete()
}
function cancelAddCategory() {
  addingCategory.value = false
  newCategoryName.value = ''
}
async function saveAddCategory() {
  const name = newCategoryName.value.trim()
  if (!name) { cancelAddCategory(); return }
  const existing = getCategoriesForGroup(selectedGroup.value)
  if (existing.includes(name)) { error(`Categoria "${name}" já existe.`); return }
  const result = await addItem({ group: selectedGroup.value, category: name })
  if (!result.ok) { error(result.error); return }
  success(`Categoria "${name}" criada.`)
  cancelAddCategory()
}
function onAddCategoryKeydown(e) {
  if (e.key === 'Enter') saveAddCategory()
  else if (e.key === 'Escape') cancelAddCategory()
}

// ===== Create subcategory =====
const addingSubcategory = ref(false)
const newSubcategoryName = ref('')
const newSubcategoryUnit = ref('UN')
const newSubcategoryAttrs = ref([])
const newSubcategoryAttrInput = ref('')

function startAddSubcategory() {
  addingSubcategory.value = true
  newSubcategoryName.value = ''
  newSubcategoryUnit.value = 'UN'
  newSubcategoryAttrs.value = getCategoryModelAttrs()
  newSubcategoryAttrInput.value = ''
  cancelEdit()
  cancelDelete()
}
function cancelAddSubcategory() {
  addingSubcategory.value = false
  newSubcategoryName.value = ''
  newSubcategoryUnit.value = 'UN'
  newSubcategoryAttrs.value = []
  newSubcategoryAttrInput.value = ''
}
function addNewSubcategoryAttr() {
  const val = newSubcategoryAttrInput.value.trim()
  if (!val) return
  if (!newSubcategoryAttrs.value.includes(val)) newSubcategoryAttrs.value.push(val)
  newSubcategoryAttrInput.value = ''
}
function onNewSubcategoryAttrKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); addNewSubcategoryAttr() }
  else if (e.key === 'Backspace' && newSubcategoryAttrInput.value === '' && newSubcategoryAttrs.value.length > 0) {
    newSubcategoryAttrs.value.pop()
  }
}
async function saveAddSubcategory() {
  const name = newSubcategoryName.value.trim()
  if (!name) { cancelAddSubcategory(); return }
  const existing = getSubcategoriesForCategory(selectedGroup.value, selectedCategory.value)
  if (existing.includes(name)) { error(`Subcategoria "${name}" já existe.`); return }
  const result = await addItem({
    group: selectedGroup.value,
    category: selectedCategory.value,
    subcategory: name,
    unit: newSubcategoryUnit.value,
    attributes: [...newSubcategoryAttrs.value],
  })
  if (!result.ok) { error(result.error); return }
  success(`Subcategoria "${name}" criada.`)
  cancelAddSubcategory()
}
function onAddSubcategoryKeydown(e) {
  if (e.key === 'Enter') saveAddSubcategory()
  else if (e.key === 'Escape') cancelAddSubcategory()
}

// ===== Drag and drop reorder =====
const dragCtx = ref(null)   // { type, from }
const dragToIdx = ref(null)

function onDragStart(type, from, e) {
  dragCtx.value = { type, from }
  dragToIdx.value = null
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', '')
}

function onDragOver(type, to, e) {
  if (dragCtx.value?.type !== type) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dragToIdx.value = to
}

function onDrop(type, to, e) {
  e.preventDefault()
  const from = dragCtx.value?.from
  if (dragCtx.value?.type !== type || from == null || from === to) { onDragEnd(); return }
  if (type === 'group') reorderGroups(from, to)
  else if (type === 'category') reorderCategories(selectedGroup.value, from, to)
  else if (type === 'subcategory') reorderSubcategories(selectedGroup.value, selectedCategory.value, from, to)
  else if (type.startsWith('attr:')) moveAttribute(type.slice(5), from, to)
  onDragEnd()
}

function onDragEnd() {
  dragCtx.value = null
  dragToIdx.value = null
}

function isDraggingType(type) { return dragCtx.value?.type === type }
function isDragFrom(type, idx) { return dragCtx.value?.type === type && dragCtx.value.from === idx }
function isDragTarget(type, idx) { return dragCtx.value?.type === type && dragToIdx.value === idx && dragCtx.value.from !== idx }

async function organizeGroupsAlphabetically() {
  await sortGroupsAlphabetically()
  success('Grupos organizados em ordem alfabetica.')
}

async function organizeCategoriesAlphabetically() {
  if (!selectedGroup.value) return
  await sortCategoriesAlphabetically(selectedGroup.value)
  success('Subgrupos organizados em ordem alfabetica.')
}

async function organizeSubcategoriesAlphabetically() {
  if (!selectedGroup.value || !selectedCategory.value) return
  await sortSubcategoriesAlphabetically(selectedGroup.value, selectedCategory.value)
  success('Subniveis organizados em ordem alfabetica.')
}

  return {
    units,
    moveAttribute,
    reorderingAttributes,
    uniqueGroups,
    getCategoriesForGroup,
    getSubcategoriesForCategory,
    countItemsInGroup,
    countItemsInCategory,
    countItemsInSubcategory,
    getItemsForSubcategory,
    getVariationsForItem,
    getItemExtraKeys,
    selectedGroup,
    selectedCategory,
    selectedSubcategory,
    groupSearch,
    searchQ,
    filteredGroupList,
    editing,
    editValue,
    startEdit,
    cancelEdit,
    saveEdit,
    onEditKeydown,
    isEditing,
    requestDelete,
    isDeleting,
    cancelDelete,
    confirmDelete,
    moving,
    moveTargetGroup,
    moveTargetCategory,
    moveTargetSubcategory,
    moveTargetCategories,
    moveTargetSubcategories,
    startMoveCategory,
    startMoveSubcategory,
    startMoveItem,
    cancelMove,
    saveMove,
    editingAttr,
    editAttrValue,
    addingAttrItemId,
    newAttrName,
    removingAttr,
    startAttrEdit,
    saveAttrEdit,
    cancelAttrEdit,
    onAttrEditKeydown,
    startAddAttr,
    saveNewAttr,
    cancelAddAttr,
    onNewAttrKeydown,
    onRemoveAttr,
    cancelRemoveAttr,
    confirmRemoveAttr,
    editingUnitItemId,
    editUnitValue,
    editingItemModel,
    editItemModelName,
    startEditItemModel,
    cancelEditItemModel,
    saveItemModelName,
    startEditUnit,
    saveEditUnit,
    cancelEditUnit,
    isEditingAttr,
    groupDirectItems,
    categoryDirectItems,
    getGroupModelAttrs,
    getCategoryModelAttrs,
    getSubcategoryModelAttrs,
    getVisibleItemsForSubcategory,
    countVisibleItemsInSubcategory,
    groupDirectKey,
    categoryDirectKey,
    addingItemForSub,
    newItemName,
    newItemUnit,
    newItemAttrs,
    newItemAttrInput,
    newItemContextLabel,
    newItemHelpText,
    newItemPlaceholder,
    startAddItem,
    cancelAddItem,
    addNewItemAttr,
    onNewItemAttrKeydown,
    saveAddItem,
    onNewItemKeydown,
    expandedItemId,
    toggleItemExpand,
    addingVariationForItemId,
    newVariationValues,
    newVariationStock,
    startAddVariation,
    cancelAddVariation,
    saveAddVariation,
    editingVariationId,
    editingVariationValues,
    editingVariationStock,
    startEditVariation,
    cancelEditVariation,
    saveEditVariation,
    onDeleteVariation,
    groupCategories,
    filteredCategoryList,
    categorySubcategories,
    filteredSubcategoryList,
    aiCatalogOpen,
    aiCatalogImage,
    aiCatalogLoading,
    aiCatalogError,
    aiCatalogAttrInput,
    aiCatalog,
    aiCatalogValueAttrs,
    aiCatalogReady,
    startAiCatalog,
    cancelAiCatalog,
    clearAiCatalogImage,
    onAiCatalogImageSelected,
    addAiCatalogAttr,
    onAiCatalogAttrKeydown,
    saveAiCatalog,
    addingGroup,
    newGroupName,
    startAddGroup,
    cancelAddGroup,
    saveAddGroup,
    onAddGroupKeydown,
    addingCategory,
    newCategoryName,
    startAddCategory,
    cancelAddCategory,
    saveAddCategory,
    onAddCategoryKeydown,
    addingSubcategory,
    newSubcategoryName,
    newSubcategoryUnit,
    newSubcategoryAttrs,
    newSubcategoryAttrInput,
    addNewSubcategoryAttr,
    onNewSubcategoryAttrKeydown,
    startAddSubcategory,
    cancelAddSubcategory,
    saveAddSubcategory,
    onAddSubcategoryKeydown,
    dragCtx,
    dragToIdx,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    isDraggingType,
    isDragFrom,
    isDragTarget,
    organizeGroupsAlphabetically,
    organizeCategoriesAlphabetically,
    organizeSubcategoriesAlphabetically,
  }
}
