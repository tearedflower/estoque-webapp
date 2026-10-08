<script setup>
import { useEditHierarchyState } from '../composables/useEditHierarchyState.js'
import AppDialog from '../components/ui/AppDialog.vue'

const {
  units,
  uniqueGroups,
  getCategoriesForGroup,
  getSubcategoriesForCategory,
  countItemsInGroup,
  countItemsInCategory,
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
} = useEditHierarchyState()
</script>

<template>
  <!-- Two-panel layout -->
  <div class="flex gap-0 min-h-[520px] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">

    <!-- LEFT: Groups list -->
    <div class="hierarchy-group-sidebar w-64 flex-shrink-0 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      <div class="px-3 pt-2.5 pb-2 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Grupos</p>
          <button
            v-if="uniqueGroups.length && !searchQ"
            class="ds-chip cursor-pointer hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            title="Organizar grupos em ordem alfabetica"
            @click="organizeGroupsAlphabetically"
          >
            A-Z
          </button>
        </div>
        <div class="relative">
          <svg class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ds-text-subtle)]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" /></svg>
          <input
            v-model="groupSearch"
            placeholder="Filtrar..."
            class="ds-input !min-h-10 !pl-9 !pr-3 !text-xs"
          />
        </div>
      </div>
      <div class="flex-1 overflow-y-auto py-1">
        <!-- Empty groups hint -->
        <div v-if="!uniqueGroups.length && !addingGroup" class="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500 italic">
          Nenhum grupo ainda.
        </div>
        <div
          v-for="(group, gIdx) in filteredGroupList"
          :key="group"
          :draggable="!searchQ"
          @dragstart.stop="!searchQ && onDragStart('group', gIdx, $event)"
          @dragover.stop="!searchQ && onDragOver('group', gIdx, $event)"
          @drop.stop="!searchQ && onDrop('group', gIdx, $event)"
          @dragend.stop="onDragEnd"
          class="group/row flex items-center gap-1.5 px-2 py-1.5 mx-1 my-0.5 rounded-lg cursor-pointer transition-colors border-t-2"
          :class="[
            selectedGroup === group
              ? 'bg-primary-600 dark:bg-primary-700 text-[var(--ds-primary-text)]'
              : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200',
            isDragTarget('group', gIdx) ? 'border-primary-500 dark:border-primary-400' : 'border-transparent',
            isDragFrom('group', gIdx) ? 'opacity-40' : ''
          ]"
          @click="selectedGroup = group"
        >
          <!-- Grip handle -->
          <svg v-if="!searchQ" class="w-3 h-3 flex-shrink-0 opacity-0 group-hover/row:opacity-40 cursor-grab active:cursor-grabbing text-current" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="7" cy="5" r="1.2"/><circle cx="13" cy="5" r="1.2"/>
            <circle cx="7" cy="10" r="1.2"/><circle cx="13" cy="10" r="1.2"/>
            <circle cx="7" cy="15" r="1.2"/><circle cx="13" cy="15" r="1.2"/>
          </svg>
          <svg class="w-4 h-4 flex-shrink-0 opacity-70" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
          </svg>

          <!-- Inline edit -->
          <template v-if="isEditing('group', group)">
            <input
              v-model="editValue"
              class="flex-1 min-w-0 px-1 py-0.5 text-sm rounded border border-primary-300 dark:border-primary-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none"
              @keydown="onEditKeydown"
              @click.stop
              autofocus
            />
            <button class="p-0.5 rounded text-green-400 hover:text-green-300 flex-shrink-0" @click.stop="saveEdit">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
            </button>
            <button class="p-0.5 rounded text-gray-400 hover:text-gray-300 flex-shrink-0" @click.stop="cancelEdit">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </template>

          <template v-else-if="isDeleting('group', group)">
            <span class="flex-1 min-w-0 text-xs font-medium truncate">Excluir?</span>
            <button class="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500 text-white hover:bg-red-600 flex-shrink-0" @click.stop="confirmDelete">Sim</button>
            <button class="px-1.5 py-0.5 text-[10px] rounded bg-white/20 hover:bg-white/30 flex-shrink-0" @click.stop="cancelDelete">Não</button>
          </template>

          <template v-else>
            <span class="flex-1 min-w-0 truncate text-sm font-medium">{{ group }}</span>
            <span class="text-[10px] opacity-60 tabular-nums flex-shrink-0 mr-0.5">{{ countItemsInGroup(group) }}</span>
            <div class="flex-shrink-0 flex opacity-0 group-hover/row:opacity-100 transition-opacity" @click.stop>
              <button class="p-0.5 rounded hover:text-amber-300 transition-colors" title="Renomear" @click.stop="startEdit('group', group)">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
              </button>
              <button class="p-0.5 rounded hover:text-red-300 transition-colors" title="Excluir" @click.stop="requestDelete('group', group)">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79" /></svg>
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- Add group footer -->
      <div class="border-t border-gray-200 dark:border-gray-700 p-2">
        <div v-if="addingGroup">
          <div class="grid grid-cols-[minmax(0,1fr)_2rem_2rem] items-center gap-1">
            <input
              v-model="newGroupName"
              placeholder="Nome do grupo"
              class="h-9 min-w-0 rounded-md border border-primary-400 bg-white px-2 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-primary-500 dark:bg-gray-700 dark:text-gray-100"
              @keydown="onAddGroupKeydown"
              autofocus
            />
            <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-green-500 transition-colors hover:bg-green-500/10 hover:text-green-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500" title="Salvar grupo" aria-label="Salvar grupo" @click="saveAddGroup">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
            </button>
            <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-500/10 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:hover:text-gray-200" title="Cancelar" aria-label="Cancelar" @click="cancelAddGroup">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div v-else>
          <button
            type="button"
            class="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary-600 px-3 text-xs font-semibold text-[var(--ds-primary-text)] transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
            @click="startAddGroup"
          >
            <span aria-hidden="true">+</span> Novo
          </button>
        </div>
      </div>
    </div>

    <!-- RIGHT: Content -->
    <div class="flex-1 min-w-0 bg-white dark:bg-gray-900 overflow-y-auto">

      <!-- No group selected -->
      <div v-if="!selectedGroup" class="flex flex-col items-center justify-center h-full py-20 text-gray-300 dark:text-gray-600">
        <svg class="w-10 h-10 mb-3" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        <p class="text-sm">Selecione um grupo à esquerda.</p>
      </div>

      <template v-else>
        <!-- Sticky header / breadcrumb -->
        <div class="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <!-- Group -->
          <button
            v-if="selectedCategory"
            class="inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium"
            @click="selectedCategory = null"
          >{{ selectedGroup }}</button>
          <span v-else class="text-sm font-bold text-gray-800 dark:text-gray-100">{{ selectedGroup }}</span>

          <!-- Category -->
          <template v-if="selectedCategory">
            <svg class="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
            <button
              v-if="selectedSubcategory"
              class="inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium"
              @click="selectedSubcategory = null"
            >{{ selectedCategory }}</button>
            <span v-else class="text-sm font-bold text-gray-800 dark:text-gray-100">{{ selectedCategory }}</span>
          </template>

          <!-- Subcategory -->
          <template v-if="selectedSubcategory">
            <svg class="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
            <span class="text-sm font-bold text-gray-800 dark:text-gray-100">{{ selectedSubcategory }}</span>
          </template>
        </div>

        <!-- ===== CATEGORY GRID ===== -->
        <div v-if="!selectedCategory" class="flex flex-col p-5">
          <div class="order-2 mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white/70 dark:border-gray-700 dark:bg-gray-800/70">
            <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">Modelos sem subgrupo</p>
                <p class="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Use so quando o produto nao precisa ser separado em subgrupo.</p>
                <div class="mt-1 flex flex-wrap gap-1">
                  <span
                    v-for="attr in getGroupModelAttrs(selectedGroup)"
                    :key="attr"
                    class="px-1.5 py-0.5 text-[11px] rounded bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                  >{{ attr }}</span>
                  <span v-if="!getGroupModelAttrs(selectedGroup).length" class="text-xs text-gray-400 dark:text-gray-500 italic">Sem modelo de variacao</span>
                </div>
              </div>
              <button
                v-if="addingItemForSub !== groupDirectKey"
                class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-[var(--ds-primary-text)] hover:bg-primary-700 transition-colors"
                @click="startAddItem(groupDirectKey)"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Novo modelo sem subgrupo
              </button>
            </div>

            <div v-if="groupDirectItems.length" class="divide-y divide-gray-100 dark:divide-gray-700/50">
              <div v-for="item in groupDirectItems" :key="item.id" class="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ item.name }}</p>
                  <div class="mt-1 flex flex-wrap gap-1">
                    <span v-for="attr in (item.attributes || [])" :key="attr" class="px-1.5 py-0.5 text-[11px] rounded bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">{{ attr }}</span>
                    <span v-if="!(item.attributes || []).length" class="text-xs text-gray-400 dark:text-gray-500 italic">Sem atributos</span>
                  </div>
                </div>
                <div v-if="isDeleting('item', item.id, item.name)" class="flex items-center gap-1">
                  <span class="text-xs font-medium text-red-500">Excluir?</span>
                  <button class="rounded bg-red-500 px-2 py-1 text-xs font-bold text-white hover:bg-red-600" @click.stop="confirmDelete">Sim</button>
                  <button class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600" @click.stop="cancelDelete">Nao</button>
                </div>
                <div v-else class="flex items-center gap-1">
                  <button class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-primary-100 hover:text-primary-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-300" title="Editar atributos do modelo" @click.stop="startEditItemModel(item)">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                    Editar
                  </button>
                  <button class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-primary-100 hover:text-primary-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-300" title="Mover modelo" @click.stop="startMoveItem(item)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3" /></svg>
                    Mover
                  </button>
                  <button class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-red-100 hover:text-red-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-red-900/30 dark:hover:text-red-300" title="Excluir modelo" @click.stop="requestDelete('item', item.id, item.name)">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79" /></svg>
                    Excluir
                  </button>
                </div>
              </div>
            </div>

            <div v-else-if="addingItemForSub !== groupDirectKey" class="px-4 py-4 text-sm text-gray-400 dark:text-gray-500 italic">Nenhum modelo sem subgrupo neste grupo.</div>

          </div>

          <div class="order-1 mb-3 flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">Subgrupos de {{ selectedGroup }}</p>
              <p class="text-xs text-gray-400 dark:text-gray-500">Organize os blocos principais antes de cadastrar os modelos.</p>
            </div>
            <button
              v-if="filteredCategoryList.length && !searchQ"
              class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-primary-100 hover:text-primary-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-300"
              title="Organizar subgrupos em ordem alfabetica"
              @click="organizeCategoriesAlphabetically"
            >
              A-Z
            </button>
          </div>

          <div class="order-1 max-h-[22rem] overflow-y-auto pr-1">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              <div
                v-for="(cat, cIdx) in filteredCategoryList"
                :key="cat"
                :draggable="!searchQ"
                @dragstart.stop="!searchQ && onDragStart('category', cIdx, $event)"
                @dragover.stop="!searchQ && onDragOver('category', cIdx, $event)"
                @drop.stop="!searchQ && onDrop('category', cIdx, $event)"
                @dragend.stop="onDragEnd"
                class="group/card relative rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-sm transition-colors duration-100 border-t-4"
                :class="[
                  isDragTarget('category', cIdx) ? '!border-t-primary-500' : 'border-t-transparent',
                  isDragFrom('category', cIdx) ? 'opacity-40' : ''
                ]"
              >
              <!-- Grip handle -->
              <div v-if="!searchQ" class="absolute top-2 left-2 opacity-0 group-hover/card:opacity-30 cursor-grab active:cursor-grabbing text-gray-500 dark:text-gray-400 pointer-events-none">
                <svg class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="7" cy="5" r="1.2"/><circle cx="13" cy="5" r="1.2"/>
                  <circle cx="7" cy="10" r="1.2"/><circle cx="13" cy="10" r="1.2"/>
                  <circle cx="7" cy="15" r="1.2"/><circle cx="13" cy="15" r="1.2"/>
                </svg>
              </div>
              <button class="w-full text-left p-4" @click="selectedCategory = cat">
                <template v-if="isEditing('category', cat, selectedGroup)">
                  <input
                    v-model="editValue"
                    class="w-full px-2 py-1 text-sm border border-primary-400 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none"
                    @keydown="onEditKeydown"
                    @click.stop
                    autofocus
                  />
                </template>
                <template v-else>
                  <p class="truncate pr-10 text-sm font-bold text-gray-800 dark:text-gray-100">{{ cat }}</p>
                  <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {{ countItemsInCategory(selectedGroup, cat) }} {{ countItemsInCategory(selectedGroup, cat) === 1 ? 'modelo' : 'modelos' }}
                    &middot; {{ getSubcategoriesForCategory(selectedGroup, cat).length }} subnivel opcional
                  </p>
                </template>
              </button>

              <!-- Save/cancel when editing -->
              <template v-if="isEditing('category', cat, selectedGroup)">
                <div class="absolute top-2 right-2 flex gap-0.5">
                  <button class="p-1 rounded text-green-500 hover:text-green-600" @click.stop="saveEdit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  </button>
                  <button class="p-1 rounded text-gray-400 hover:text-gray-600" @click.stop="cancelEdit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </template>

              <!-- Delete confirmation overlay -->
              <template v-else-if="isDeleting('category', selectedGroup, cat)">
                <div class="absolute inset-0 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 flex flex-col items-center justify-center gap-2 p-3">
                  <p class="text-xs font-medium text-red-600 dark:text-red-400 text-center">Excluir {{ countItemsInCategory(selectedGroup, cat) }} modelo(s)?</p>
                  <div class="flex gap-2">
                    <button class="px-3 py-1 text-xs font-bold rounded bg-red-500 text-white hover:bg-red-600" @click.stop="confirmDelete">Sim</button>
                    <button class="px-3 py-1 text-xs rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300" @click.stop="cancelDelete">Não</button>
                  </div>
                </div>
              </template>

              <!-- Hover actions -->
              <template v-else>
                <div class="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
                  <button class="p-1 rounded text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 bg-white dark:bg-gray-700 shadow-sm" title="Renomear" @click.stop="startEdit('category', cat, selectedGroup)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                  </button>
                  <button class="p-1 rounded text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 bg-white dark:bg-gray-700 shadow-sm" title="Mover" @click.stop="startMoveCategory(selectedGroup, cat)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3" /></svg>
                  </button>
                  <button class="p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 bg-white dark:bg-gray-700 shadow-sm" title="Excluir" @click.stop="requestDelete('category', selectedGroup, cat)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79" /></svg>
                  </button>
                </div>
              </template>
              </div>

              <!-- Novo subgrupo: form card -->
              <div
                v-if="addingCategory"
                class="relative rounded-xl border border-primary-300 dark:border-primary-700 bg-primary-50/40 dark:bg-primary-900/10 p-4 flex flex-col gap-2"
              >
                <p class="text-xs font-semibold text-primary-600 dark:text-primary-400">Novo subgrupo</p>
                <input
                  v-model="newCategoryName"
                  placeholder="Nome do subgrupo"
                  class="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
                  @keydown="onAddCategoryKeydown"
                  autofocus
                />
                <div class="flex gap-2">
                  <button class="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-[var(--ds-primary-text)] hover:bg-primary-700 transition-colors" @click="saveAddCategory">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    Salvar
                  </button>
                  <button class="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors" @click="cancelAddCategory">Cancelar</button>
                </div>
              </div>

              <!-- Novo subgrupo: "+" button card -->
              <button
                v-else-if="!searchQ"
                class="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-600 text-gray-400 dark:text-gray-500 hover:text-primary-500 dark:hover:text-primary-400 flex flex-col items-center justify-center gap-2 p-4 transition-colors min-h-[80px]"
                @click="startAddCategory"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                <span class="text-xs font-medium">Novo subgrupo</span>
              </button>
            </div>
          </div>

          <!-- Empty hint (no categories and no search) -->
          <p v-if="!filteredCategoryList.length && !addingCategory && !searchQ" class="order-1 mt-4 text-center text-xs text-gray-400 dark:text-gray-500 italic">
            Nenhum subgrupo neste grupo ainda.
          </p>
          <p v-else-if="!filteredCategoryList.length && searchQ" class="order-1 mt-4 text-center text-xs text-gray-400 dark:text-gray-500 italic">
            Nenhum subgrupo encontrado para "{{ groupSearch }}".
          </p>
        </div>

        <!-- ===== SUBGROUP CONTENT ===== -->
        <div v-else-if="!selectedSubcategory" class="flex flex-col p-5">
          <div class="order-2 mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white/70 dark:border-gray-700 dark:bg-gray-800/70">
            <div class="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-700/40">
              <div>
                <div class="flex items-center gap-2">
                  <p class="text-sm font-semibold text-gray-700 dark:text-gray-200">Modelos deste subgrupo</p>
                  <span class="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">{{ categoryDirectItems.length }}</span>
                </div>
                <p class="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Use aqui quando o produto nao precisa de subnivel opcional.</p>
                <div class="mt-1 flex flex-wrap gap-1">
                  <span
                    v-for="attr in getCategoryModelAttrs(selectedGroup, selectedCategory)"
                    :key="attr"
                    class="px-1.5 py-0.5 text-[11px] rounded bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                  >{{ attr }}</span>
                  <span v-if="!getCategoryModelAttrs(selectedGroup, selectedCategory).length" class="text-xs text-gray-400 dark:text-gray-500 italic">Sem modelo de variação</span>
                </div>
              </div>
              <button
                v-if="addingItemForSub !== categoryDirectKey"
                class="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-[var(--ds-primary-text)] transition-colors hover:bg-primary-700"
                @click="startAddItem(categoryDirectKey)"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Novo modelo
              </button>
            </div>

            <div v-if="categoryDirectItems.length" class="divide-y divide-gray-100 dark:divide-gray-700/50">
              <div v-for="item in categoryDirectItems" :key="item.id" class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ item.name }}</p>
                  <div class="mt-1 flex flex-wrap gap-1">
                    <span v-for="attr in (item.attributes || [])" :key="attr" class="rounded bg-primary-50 px-1.5 py-0.5 text-[11px] text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">{{ attr }}</span>
                    <span v-if="!(item.attributes || []).length" class="text-xs italic text-gray-400 dark:text-gray-500">Sem atributos</span>
                  </div>
                </div>
                <div v-if="isDeleting('item', item.id, item.name)" class="flex items-center gap-1">
                  <span class="text-xs font-medium text-red-500">Excluir?</span>
                  <button class="rounded bg-red-500 px-2 py-1 text-xs font-bold text-white hover:bg-red-600" @click.stop="confirmDelete">Sim</button>
                  <button class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600" @click.stop="cancelDelete">Nao</button>
                </div>
                <div v-else class="flex items-center gap-1">
                  <button class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-primary-100 hover:text-primary-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-300" title="Editar atributos do modelo" @click.stop="startEditItemModel(item)">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                    Editar
                  </button>
                  <button class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-primary-100 hover:text-primary-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-300" title="Mover modelo" @click.stop="startMoveItem(item)">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3" /></svg>
                    Mover
                  </button>
                  <button class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-red-100 hover:text-red-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-red-900/30 dark:hover:text-red-300" title="Excluir modelo" @click.stop="requestDelete('item', item.id, item.name)">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79" /></svg>
                    Excluir
                  </button>
                </div>
              </div>
            </div>

            <div v-else-if="addingItemForSub !== categoryDirectKey" class="px-4 py-4 text-sm text-gray-400 dark:text-gray-500 italic">
              Nenhum modelo cadastrado neste subgrupo.
            </div>

          </div>

          <div class="order-1 mb-3 flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">Subniveis opcionais de {{ selectedCategory }}</p>
              <p class="text-xs text-gray-400 dark:text-gray-500">Use so quando este subgrupo ainda precisa de outra divisao.</p>
            </div>
            <button
              v-if="filteredSubcategoryList.length && !searchQ"
              class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-primary-100 hover:text-primary-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-300"
              title="Organizar subniveis em ordem alfabetica"
              @click="organizeSubcategoriesAlphabetically"
            >
              A-Z
            </button>
          </div>

          <div v-if="filteredSubcategoryList.length" class="order-1">
            <table class="block text-sm">
              <thead class="sr-only">
                <tr class="bg-gray-50/60 dark:bg-gray-700/30 border-b border-gray-200 dark:border-gray-700">
                  <th class="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Subnível opcional</th>
                  <th class="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Modelos</th>
                  <th class="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Atributos</th>
                  <th class="w-24"></th>
                </tr>
              </thead>
              <tbody class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <template v-for="(sub, sIdx) in filteredSubcategoryList" :key="sub">
                <tr
                  class="group/row relative block min-h-[78px] rounded-xl border bg-white p-4 transition hover:shadow-sm dark:bg-gray-800"
                  :class="[
                    !isEditing('subcategory', sub, selectedGroup, selectedCategory) && !isDeleting('subcategory', selectedGroup, selectedCategory, sub) ? 'cursor-pointer' : '',
                    isDragTarget('subcategory', sIdx) ? 'border-primary-500 dark:border-primary-400' : 'border-gray-200 hover:border-primary-500 dark:border-gray-700 dark:hover:border-primary-500',
                    isDragFrom('subcategory', sIdx) ? 'opacity-40' : ''
                  ]"
                  :draggable="!isEditing('subcategory', sub, selectedGroup, selectedCategory) && !isDeleting('subcategory', selectedGroup, selectedCategory, sub) && !searchQ"
                  @dragstart.stop="onDragStart('subcategory', sIdx, $event)"
                  @dragover.stop="onDragOver('subcategory', sIdx, $event)"
                  @drop.stop="onDrop('subcategory', sIdx, $event)"
                  @dragend.stop="onDragEnd"
                  @click="!isEditing('subcategory', sub, selectedGroup, selectedCategory) && !isDeleting('subcategory', selectedGroup, selectedCategory, sub) ? selectedSubcategory = sub : null"
                >
                  <!-- Name / inline edit -->
                  <td class="block">
                    <template v-if="isEditing('subcategory', sub, selectedGroup, selectedCategory)">
                      <div class="flex items-center gap-1">
                        <input
                          v-model="editValue"
                          class="flex-1 px-2 py-1 text-sm border border-primary-400 dark:border-primary-500 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none"
                          @keydown="onEditKeydown"
                          autofocus
                        />
                        <button class="p-1 text-green-500 hover:text-green-600" @click="saveEdit">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                        </button>
                        <button class="p-1 text-gray-400 hover:text-gray-600" @click="cancelEdit">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </template>
                    <template v-else>
                      <div class="flex items-center gap-1.5">
                        <svg v-if="!searchQ" class="w-3 h-3 flex-shrink-0 opacity-0 group-hover/row:opacity-40 cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                          <circle cx="7" cy="5" r="1.2"/><circle cx="13" cy="5" r="1.2"/>
                          <circle cx="7" cy="10" r="1.2"/><circle cx="13" cy="10" r="1.2"/>
                          <circle cx="7" cy="15" r="1.2"/><circle cx="13" cy="15" r="1.2"/>
                        </svg>
                        <span class="font-medium text-gray-800 dark:text-gray-100">{{ sub }}</span>
                      </div>
                    </template>
                  </td>

                  <!-- Item count -->
                  <td class="mt-2 block text-xs text-gray-500 dark:text-gray-400">
                    {{ countVisibleItemsInSubcategory(selectedGroup, selectedCategory, sub) }} modelo(s)
                  </td>

                  <td class="hidden"></td>

                  <!-- Row actions -->
                  <td
                    v-if="isDeleting('subcategory', selectedGroup, selectedCategory, sub) || !isEditing('subcategory', sub, selectedGroup, selectedCategory)"
                    class="absolute right-3 top-3 block"
                    @click.stop
                  >
                    <template v-if="isDeleting('subcategory', selectedGroup, selectedCategory, sub)">
                      <div class="flex items-center gap-1">
                        <span class="text-[11px] text-red-500 font-medium whitespace-nowrap">Excluir?</span>
                        <button class="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500 text-white hover:bg-red-600" @click="confirmDelete">Sim</button>
                        <button class="px-1.5 py-0.5 text-[10px] rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300" @click="cancelDelete">Não</button>
                      </div>
                    </template>
                    <template v-else>
                      <div class="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button class="p-1 text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 rounded" title="Novo modelo" @click="startAddItem(sub)">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        </button>
                        <button class="p-1 text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 rounded" title="Renomear" @click="startEdit('subcategory', sub, selectedGroup, selectedCategory)">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                        </button>
                        <button class="p-1 text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 rounded" title="Mover" @click="startMoveSubcategory(selectedGroup, selectedCategory, sub)">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3" /></svg>
                        </button>
                        <button class="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded" title="Excluir" @click="requestDelete('subcategory', selectedGroup, selectedCategory, sub)">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79" /></svg>
                        </button>
                      </div>
                    </template>
                  </td>
                </tr>

                <!-- Inline add-item form -->
                <tr v-if="false" class="bg-primary-50/40 dark:bg-primary-900/10">
                  <td colspan="4" class="px-4 py-3">
                    <div class="rounded-xl border border-primary-300 dark:border-primary-700 bg-white dark:bg-gray-800 p-4">
                      <span class="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                        Novo modelo em <strong class="text-gray-600 dark:text-gray-300">{{ sub }}</strong>
                      </span>
                      <input
                        v-model="newItemName"
                        :placeholder="`Nome (padrão: ${sub})`"
                        class="flex-1 min-w-[140px] px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
                        @keydown="onNewItemKeydown"
                        autofocus
                      />
                      <!-- Attributes tag input -->
                      <div class="flex-1 min-w-[160px] flex flex-wrap items-center gap-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus-within:border-primary-400 dark:focus-within:border-primary-500">
                        <span
                          v-for="(attr, i) in newItemAttrs"
                          :key="attr"
                          class="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
                        >
                          {{ attr }}
                          <button class="text-primary-400 hover:text-red-500" @click.stop="newItemAttrs.splice(i, 1)">
                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                          </button>
                        </span>
                        <input
                          v-model="newItemAttrInput"
                          placeholder="+ atributo"
                          class="flex-1 min-w-[80px] text-xs bg-transparent text-gray-700 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none py-0.5"
                          @keydown="onNewItemAttrKeydown"
                        />
                      </div>
                      <div class="flex items-center gap-1 ml-auto">
                        <button
                          class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-[var(--ds-primary-text)] hover:bg-primary-700 transition-colors"
                          @click="saveAddItem(sub)"
                        >
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                          Salvar
                        </button>
                        <button
                          class="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          @click="cancelAddItem"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
                </template>

                <!-- Add subcategory row -->
                <tr v-if="addingSubcategory" class="block rounded-xl border border-primary-300 bg-primary-50/60 p-4 dark:border-primary-700 dark:bg-primary-900/10 md:col-span-2">
                  <td colspan="4" class="block">
                    <div class="flex items-center gap-2 flex-wrap">
                      <input
                        v-model="newSubcategoryName"
                        placeholder="Nome do subnível opcional"
                        class="flex-1 min-w-[160px] px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
                        @keydown="onAddSubcategoryKeydown"
                        autofocus
                      />
                      <select
                        v-model="newSubcategoryUnit"
                        class="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
                      >
                        <option v-for="u in units" :key="u.value" :value="u.value">{{ u.label }}</option>
                      </select>
                      <div class="flex-1 min-w-[180px] flex flex-wrap items-center gap-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus-within:border-primary-400 dark:focus-within:border-primary-500">
                        <span
                          v-for="(attr, i) in newSubcategoryAttrs"
                          :key="attr"
                          class="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
                        >
                          {{ attr }}
                          <button class="text-primary-400 hover:text-red-500" @click.stop="newSubcategoryAttrs.splice(i, 1)">
                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                          </button>
                        </span>
                        <input
                          v-model="newSubcategoryAttrInput"
                          placeholder="+ modelo de variação"
                          class="flex-1 min-w-[110px] text-xs bg-transparent text-gray-700 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none py-0.5"
                          @keydown="onNewSubcategoryAttrKeydown"
                        />
                        <button v-if="newSubcategoryAttrInput.trim()" class="text-xs text-primary-500 hover:text-primary-600" @click="addNewSubcategoryAttr">Adicionar</button>
                      </div>
                      <button class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-[var(--ds-primary-text)] hover:bg-primary-700 transition-colors" @click="saveAddSubcategory">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                        Salvar
                      </button>
                      <button class="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors" @click="cancelAddSubcategory">Cancelar</button>
                    </div>
                  </td>
                </tr>
                <tr v-else class="block">
                  <td colspan="4" class="block">
                    <button
                      class="flex min-h-[78px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 p-4 text-gray-400 transition-colors hover:border-primary-400 hover:text-primary-500 dark:border-gray-700 dark:text-gray-500 dark:hover:border-primary-600 dark:hover:text-primary-400"
                      @click="startAddSubcategory"
                    >
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      <span class="text-xs font-medium">Novo subnivel</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="order-1 flex flex-col items-start gap-3 px-2 py-8">
            <p class="text-sm text-gray-400 dark:text-gray-500 italic">Nenhum subnível opcional neste subgrupo.</p>
            <div v-if="addingSubcategory" class="flex items-center gap-2 flex-wrap">
              <input
                v-model="newSubcategoryName"
                placeholder="Nome do subnível opcional"
                class="px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
                @keydown="onAddSubcategoryKeydown"
                autofocus
              />
              <select
                v-model="newSubcategoryUnit"
                class="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
              >
                <option v-for="u in units" :key="u.value" :value="u.value">{{ u.label }}</option>
              </select>
              <div class="min-w-[180px] flex flex-wrap items-center gap-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus-within:border-primary-400 dark:focus-within:border-primary-500">
                <span
                  v-for="(attr, i) in newSubcategoryAttrs"
                  :key="attr"
                  class="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
                >
                  {{ attr }}
                  <button class="text-primary-400 hover:text-red-500" @click.stop="newSubcategoryAttrs.splice(i, 1)">
                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </span>
                <input
                  v-model="newSubcategoryAttrInput"
                  placeholder="+ modelo de variação"
                  class="flex-1 min-w-[110px] text-xs bg-transparent text-gray-700 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none py-0.5"
                  @keydown="onNewSubcategoryAttrKeydown"
                />
                <button v-if="newSubcategoryAttrInput.trim()" class="text-xs text-primary-500 hover:text-primary-600" @click="addNewSubcategoryAttr">Adicionar</button>
              </div>
              <button class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-[var(--ds-primary-text)] hover:bg-primary-700 transition-colors" @click="saveAddSubcategory">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Salvar
              </button>
              <button class="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors" @click="cancelAddSubcategory">Cancelar</button>
            </div>
            <button
              v-else
              class="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              @click="startAddSubcategory"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Novo subnível opcional
            </button>
          </div>
        </div>

        <!-- ===== ITEM GRID ===== -->
        <div v-else class="p-5">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- Item cards -->
            <div
              v-for="item in getVisibleItemsForSubcategory(selectedGroup, selectedCategory, selectedSubcategory)"
              :key="item.id"
              class="group/card rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              <!-- Card header -->
              <div class="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight">{{ item.name }}</p>
                  <!-- Unit badge (click to edit) -->
                  <template v-if="editingUnitItemId === item.id">
                    <select
                      v-model="editUnitValue"
                      class="text-xs font-medium px-1.5 py-0.5 rounded mt-1 inline-block border border-primary-400 dark:border-primary-500 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer"
                      @change="saveEditUnit(item.id)"
                      @keydown.escape="cancelEditUnit"
                      autofocus
                    >
                      <option v-for="u in units" :key="u.value" :value="u.value">{{ u.label }}</option>
                    </select>
                  </template>
                  <template v-else>
                    <button
                      class="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400 px-1.5 py-0.5 rounded mt-1 inline-block transition-colors cursor-pointer"
                      title="Clique para alterar a unidade"
                      @click.stop="startEditUnit(item)"
                    >{{ item.unit }}</button>
                  </template>
                </div>
                <div v-if="isDeleting('item', item.id, item.name)" class="flex shrink-0 items-center gap-1">
                  <button class="rounded bg-red-500 px-2 py-1 text-xs font-bold text-white hover:bg-red-600" @click.stop="confirmDelete">Sim</button>
                  <button class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600" @click.stop="cancelDelete">Nao</button>
                </div>
                <div v-else class="flex shrink-0 items-center gap-1 opacity-0 transition group-hover/card:opacity-100">
                  <button
                    class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-primary-100 hover:text-primary-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-300"
                    title="Editar atributos do modelo"
                    @click.stop="startEditItemModel(item)"
                  >
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                  </button>
                  <button
                    class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-primary-100 hover:text-primary-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-300"
                    title="Mover modelo"
                    @click.stop="startMoveItem(item)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3" /></svg>
                    Mover
                  </button>
                  <button
                    class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-red-100 hover:text-red-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                    title="Excluir modelo"
                    @click.stop="requestDelete('item', item.id, item.name)"
                  >
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79" /></svg>
                  </button>
                </div>
              </div>

              <!-- Attributes section -->
              <div class="px-4 pb-3 flex-1">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Atributos</p>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="(attr, aIdx) in (item.attributes || [])"
                    :key="attr"
                    :draggable="!isEditingAttr(item.id, attr)"
                    @dragstart.stop="!isEditingAttr(item.id, attr) && onDragStart('attr:' + item.id, aIdx, $event)"
                    @dragover.stop="onDragOver('attr:' + item.id, aIdx, $event)"
                    @drop.stop="onDrop('attr:' + item.id, aIdx, $event)"
                    @dragend.stop="onDragEnd"
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 group/attr cursor-pointer hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors border-l-2"
                    :class="[
                      isDragTarget('attr:' + item.id, aIdx) ? 'border-primary-500' : 'border-transparent',
                      isDragFrom('attr:' + item.id, aIdx) ? 'opacity-40' : ''
                    ]"
                    @click.stop="!isDraggingType('attr:' + item.id) && startAttrEdit(item.id, attr)"
                  >
                    <template v-if="isEditingAttr(item.id, attr)">
                      <input v-model="editAttrValue" class="w-20 px-0.5 text-[11px] bg-transparent border-b border-primary-400 focus:outline-none" @keydown="onAttrEditKeydown" @click.stop autofocus />
                      <button class="text-green-500 hover:text-green-600" @click.stop="saveAttrEdit"><svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg></button>
                      <button class="text-gray-400 hover:text-gray-600" @click.stop="cancelAttrEdit"><svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>
                    </template>
                    <template v-else>
                      {{ attr }}
                      <button class="opacity-0 group-hover/attr:opacity-100 text-primary-400 hover:text-red-500 transition-opacity" @click.stop="onRemoveAttr(item.id, attr)">
                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                      </button>
                    </template>
                  </span>

                  <!-- Extra keys from variations -->
                  <span
                    v-for="ekey in getItemExtraKeys(item.id)"
                    :key="'extra-' + ekey"
                    class="px-1.5 py-0.5 text-[11px] rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                  >{{ ekey }}</span>

                  <!-- Add attribute input -->
                  <template v-if="addingAttrItemId === item.id">
                    <div class="inline-flex items-center gap-1">
                      <input v-model="newAttrName" placeholder="novo atributo" class="w-28 px-2 py-0.5 text-[11px] border border-primary-400 dark:border-primary-500 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none" @keydown="onNewAttrKeydown" autofocus />
                      <button class="p-0.5 text-green-500 hover:text-green-600" @click="saveNewAttr"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg></button>
                      <button class="p-0.5 text-gray-400 hover:text-gray-600" @click="cancelAddAttr"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>
                    </div>
                  </template>
                  <button
                    v-else
                    class="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-primary-400 hover:text-primary-500 transition-colors"
                    @click.stop="startAddAttr(item.id)"
                  >
                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    atributo
                  </button>
                </div>
              </div>

            </div>

            <!-- "+" new item button card -->
            <button
              class="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-600 text-gray-400 dark:text-gray-500 hover:text-primary-500 dark:hover:text-primary-400 flex flex-col items-center justify-center gap-2 p-6 transition-colors min-h-[120px]"
              @click="startAddItem(selectedSubcategory)"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              <span class="text-xs font-medium">Novo modelo</span>
            </button>
          </div>

          <!-- Empty state -->
          <div v-if="!getVisibleItemsForSubcategory(selectedGroup, selectedCategory, selectedSubcategory).length" class="mt-8 text-center text-gray-400 dark:text-gray-500 text-sm italic">
            Nenhum modelo neste subnível ainda.
          </div>
        </div>
      </template>
    </div>
  </div>

  <AppDialog
    v-if="aiCatalogOpen"
    visible
    aria-label="Catalogar material pela foto"
    @close="cancelAiCatalog"
  >
    <div class="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
      <div class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <p class="text-[11px] font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400">Catálogo com Gemini</p>
          <h3 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">Catalogar material pela foto</h3>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">A IA sugere toda a hierarquia. Nada é salvo antes da sua aprovação.</p>
        </div>
        <button class="min-h-9 rounded-lg px-3 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200" @click="cancelAiCatalog">Fechar</button>
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
              <span class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Grupo</span>
              <input v-model="aiCatalog.group" list="ai-catalog-groups" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              <datalist id="ai-catalog-groups"><option v-for="group in uniqueGroups" :key="group" :value="group" /></datalist>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Subgrupo</span>
              <input v-model="aiCatalog.category" list="ai-catalog-categories" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              <datalist id="ai-catalog-categories"><option v-for="category in getCategoriesForGroup(aiCatalog.group)" :key="category" :value="category" /></datalist>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Subnível opcional</span>
              <input v-model="aiCatalog.subcategory" list="ai-catalog-subcategories" placeholder="Opcional" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
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
            <span class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nome do item</span>
            <input v-model="aiCatalog.name" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          </label>

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
              <span class="text-[11px] text-gray-400 dark:text-gray-500">criam uma variação com estoque zero</span>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <label v-for="attribute in aiCatalogValueAttrs" :key="attribute" class="block">
                <span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">{{ attribute }}</span>
                <input v-model="aiCatalog.values[attribute]" :placeholder="`Revisar ${attribute.toLowerCase()}`" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500" />
              </label>
            </div>
          </div>
        </template>
      </div>

      <div class="sticky bottom-0 flex items-center justify-end gap-2 border-t border-gray-100 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
        <button class="min-h-10 rounded-lg bg-gray-100 px-4 text-sm text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700" @click="cancelAiCatalog">Cancelar</button>
        <button class="inline-flex min-h-10 items-center gap-1 rounded-lg bg-primary-600 px-4 text-sm font-medium hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50" style="color: var(--ds-primary-text)" :disabled="!aiCatalogReady || aiCatalogLoading" @click="saveAiCatalog">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          Aprovar e catalogar
        </button>
      </div>
    </div>
  </AppDialog>

  <AppDialog
    v-if="editingItemModel"
    visible
    aria-label="Editar modelo"
    @close="cancelEditItemModel"
  >
    <section class="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
      <div class="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div>
          <p class="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Editar modelo</p>
          <h3 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{{ editingItemModel.name }}</h3>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Renomear preserva os valores das variações. Excluir remove o campo das variações atuais.</p>
        </div>
        <button type="button" class="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" @click="cancelEditItemModel">Fechar</button>
      </div>

      <div class="space-y-3 px-5 py-4">
        <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <label for="edit-model-name" class="block text-xs font-semibold text-gray-600 dark:text-gray-300">Nome do modelo</label>
          <div class="mt-2 flex gap-2">
            <input
              id="edit-model-name"
              v-model="editItemModelName"
              class="ds-input min-w-0 flex-1"
              @keydown.enter.prevent="saveItemModelName"
            />
            <button
              type="button"
              class="min-h-10 rounded-lg bg-primary-600 px-4 text-sm font-semibold hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              style="color: var(--ds-primary-text)"
              :disabled="!editItemModelName.trim() || editItemModelName.trim() === editingItemModel.name"
              @click="saveItemModelName"
            >
              Salvar nome
            </button>
          </div>
        </div>

        <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Atributos</p>
        <div v-if="editingItemModel.attributes?.length" class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
          <div v-for="attr in editingItemModel.attributes" :key="attr" class="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
            <template v-if="isEditingAttr(editingItemModel.id, attr)">
              <input v-model="editAttrValue" class="ds-input min-w-0 flex-1" autofocus @keydown="onAttrEditKeydown" />
              <div class="flex shrink-0 gap-2">
                <button type="button" class="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" @click="cancelAttrEdit">Cancelar</button>
                <button type="button" class="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold hover:bg-primary-700" style="color: var(--ds-primary-text)" @click="saveAttrEdit">Salvar</button>
              </div>
            </template>
            <template v-else>
              <span class="font-medium text-gray-800 dark:text-gray-100">{{ attr }}</span>
              <div class="flex shrink-0 gap-1">
                <button type="button" class="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-primary-600 dark:text-gray-300 dark:hover:bg-gray-800" @click="startAttrEdit(editingItemModel.id, attr)">Renomear</button>
                <button type="button" class="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-300 dark:hover:bg-red-900/20" @click="onRemoveAttr(editingItemModel.id, attr)">Excluir</button>
              </div>
            </template>
          </div>
        </div>
        <p v-else class="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">Este modelo ainda não possui atributos.</p>

        <div v-if="addingAttrItemId === editingItemModel.id" class="flex gap-2">
          <input v-model="newAttrName" class="ds-input min-w-0 flex-1" placeholder="Nome do novo atributo" autofocus @keydown="onNewAttrKeydown" />
          <button type="button" class="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" @click="cancelAddAttr">Cancelar</button>
          <button type="button" class="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold hover:bg-primary-700 disabled:opacity-50" style="color: var(--ds-primary-text)" :disabled="!newAttrName.trim()" @click="saveNewAttr">Adicionar</button>
        </div>
        <button v-else type="button" class="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800" @click="startAddAttr(editingItemModel.id)">
          <span aria-hidden="true">+</span> Novo atributo
        </button>
      </div>
    </section>
  </AppDialog>

  <AppDialog
    v-if="removingAttr"
    visible
    aria-label="Confirmar exclusão do atributo"
    @close="cancelRemoveAttr"
  >
    <section class="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
      <div class="px-5 py-4">
        <p class="text-[11px] font-bold uppercase tracking-widest text-red-500">Excluir atributo</p>
        <h3 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{{ removingAttr.attrName }}</h3>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          O atributo será removido do modelo
          <template v-if="removingAttr.affectedVariations"> e de {{ removingAttr.affectedVariations }} variação(ões) que possuem valor preenchido</template>.
          O histórico de movimentações não será alterado.
        </p>
      </div>
      <div class="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <button type="button" class="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700" @click="cancelRemoveAttr">Cancelar</button>
        <button type="button" class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700" @click="confirmRemoveAttr">Excluir atributo</button>
      </div>
    </section>
  </AppDialog>

  <AppDialog
    v-if="addingItemForSub"
    visible
    aria-label="Criar modelo de item"
    @close="cancelAddItem"
  >
    <div class="w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
      <div class="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div>
          <p class="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Novo modelo</p>
          <h3 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{{ newItemContextLabel }}</h3>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ newItemHelpText }}</p>
        </div>
        <button class="rounded-lg px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200" @click="cancelAddItem">
          Fechar
        </button>
      </div>

      <div class="space-y-4 px-5 py-4">
        <label class="block">
          <span class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nome do modelo</span>
          <input
            v-model="newItemName"
            :placeholder="newItemPlaceholder"
            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            @keydown="onNewItemKeydown"
            autofocus
          />
        </label>

        <label class="block max-w-[180px]">
          <span class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Unidade</span>
          <select v-model="newItemUnit" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
            <option v-for="u in units" :key="u.value" :value="u.value">{{ u.label }}</option>
          </select>
        </label>

        <div>
          <p class="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Atributos</p>
          <div class="flex min-h-[42px] flex-wrap items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-2 focus-within:border-primary-400 dark:border-gray-700 dark:bg-gray-800">
            <span
              v-for="(attr, i) in newItemAttrs"
              :key="attr"
              class="inline-flex items-center gap-1 rounded bg-primary-50 px-1.5 py-0.5 text-[11px] text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
            >
              {{ attr }}
              <button class="text-primary-400 hover:text-red-500" @click.stop="newItemAttrs.splice(i, 1)">
                <svg class="h-2.5 w-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </span>
            <input
              v-model="newItemAttrInput"
              placeholder="+ atributo"
              class="min-w-[110px] flex-1 bg-transparent px-1.5 py-0.5 text-sm text-gray-700 outline-none placeholder-gray-400 dark:text-gray-200 dark:placeholder-gray-500"
              @keydown="onNewItemAttrKeydown"
            />
          </div>
        </div>

      </div>

      <div class="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <button class="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700" @click="cancelAddItem">
          Cancelar
        </button>
        <button class="inline-flex min-h-10 items-center gap-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-primary-700" style="color: var(--ds-primary-text)" @click="saveAddItem(addingItemForSub)">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          Criar modelo
        </button>
      </div>
    </div>
  </AppDialog>

  <AppDialog
    v-if="moving"
    visible
    aria-label="Mover item na hierarquia"
    @close="cancelMove"
  >
    <div class="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
      <div class="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <p class="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Mover na hierarquia</p>
        <h3 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
          <template v-if="moving.type === 'category'">Subgrupo {{ moving.category }}</template>
          <template v-else-if="moving.type === 'subcategory'">Subnível {{ moving.subcategory }}</template>
          <template v-else>Modelo {{ moving.item.name }}</template>
        </h3>
      </div>

      <div class="space-y-4 px-5 py-4">
        <label class="block">
          <span class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Grupo</span>
          <select
            v-model="moveTargetGroup"
            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">Selecione um grupo</option>
            <option v-for="group in uniqueGroups" :key="group" :value="group">{{ group }}</option>
          </select>
        </label>

        <label v-if="moving.type === 'subcategory' || moving.type === 'item'" class="block">
          <span class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Subgrupo</span>
          <select
            v-model="moveTargetCategory"
            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            <option v-if="moving.type === 'item'" value="">Sem subgrupo</option>
            <option v-else value="">Selecione um subgrupo</option>
            <option v-for="category in moveTargetCategories" :key="category" :value="category">{{ category }}</option>
          </select>
        </label>

        <label v-if="moving.type === 'item'" class="block">
          <span class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Subnível opcional</span>
          <select
            v-model="moveTargetSubcategory"
            :disabled="!moveTargetCategory"
            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">Sem subnível</option>
            <option v-for="subcategory in moveTargetSubcategories" :key="subcategory" :value="subcategory">{{ subcategory }}</option>
          </select>
        </label>

        <div class="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <template v-if="moving.type === 'category'">
            Move todos os modelos deste subgrupo para outro grupo.
          </template>
          <template v-else-if="moving.type === 'subcategory'">
            Move todos os modelos deste subnível para outro subgrupo.
          </template>
          <template v-else>
            Move este modelo e mantem suas variacoes e estoque.
          </template>
        </div>
      </div>

      <div class="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <button class="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" @click="cancelMove">
          Cancelar
        </button>
        <button class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-[var(--ds-primary-text)] hover:bg-primary-700" @click="saveMove">
          Mover
        </button>
      </div>
    </div>
  </AppDialog>
</template>
