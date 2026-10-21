<script setup>
import { computed, ref, watch } from 'vue'
import { matchesSearchTokens, searchTokens } from '../../utils/globalSearch.js'

const props = defineProps({
  groups: { type: Array, required: true },
  activeGroup: { type: String, default: null },
  activeCategory: { type: String, default: null },
  activeSubcategory: { type: String, default: null },
  facets: { type: Array, default: () => [] },
  hasActiveFilters: { type: Boolean, default: false },
  search: { type: String, default: '' },
  showSearch: { type: Boolean, default: true },
})
const emit = defineEmits(['select-group', 'select-category', 'select-subcategory', 'toggle-filter', 'clear-filters', 'update:search', 'search-submit'])
const filterSearch = ref('')
const expandedSection = ref(null)
const tokens = computed(() => searchTokens(filterSearch.value))
const visibleGroups = computed(() => props.groups.filter(group => matchesSearchTokens(group, tokens.value)))
const visibleFacets = computed(() => props.facets.flatMap(facet => {
  if (!tokens.value.length || matchesSearchTokens(facet.label, tokens.value)) return [facet]
  const options = facet.options.filter(option => matchesSearchTokens(option.value, tokens.value))
  return options.length ? [{ ...facet, options }] : []
}))
watch(() => [props.activeGroup, props.activeCategory, props.activeSubcategory], () => { filterSearch.value = ''; expandedSection.value = null })
const isHierarchy = facet => ['category', 'subcategory'].includes(facet.key)
const isExpanded = facet => !!filterSearch.value.trim() || expandedSection.value === facet.key
function toggleSection(facet) { expandedSection.value = expandedSection.value === facet.key ? null : facet.key }
function clearFilters() {
  filterSearch.value = ''
  expandedSection.value = null
  emit('clear-filters')
}
</script>

<template>
  <aside class="catalog-sidebar catalog-filter-panel fixed top-0 left-0 h-full z-40 w-60 flex flex-col">
    <header class="catalog-filter-header">
      <h2>Filtrar materiais</h2>
      <button v-if="hasActiveFilters" type="button" class="catalog-filter-clear" @click="clearFilters">Limpar</button>
    </header>

    <div class="catalog-filter-context">
      <button v-if="activeGroup" type="button" class="catalog-filter-all" @click="activeSubcategory ? emit('select-subcategory', null) : activeCategory ? emit('select-category', null) : emit('select-group', null)">
        <span aria-hidden="true">←</span> {{ activeSubcategory ? activeCategory : activeCategory ? activeGroup : 'Todos os grupos' }}
      </button>
      <template v-if="activeGroup">
        <h3 class="catalog-filter-group">{{ activeSubcategory || activeCategory || activeGroup }}</h3>
      </template>
      <input v-model="filterSearch" class="ds-input catalog-filter-search" type="search" :aria-label="activeGroup ? 'Buscar filtro ou opção' : 'Buscar grupo'" :placeholder="activeGroup ? 'Buscar categoria, atributo…' : 'Buscar grupo…'" />
      <input v-if="showSearch" :value="search" type="search" class="ds-input catalog-filter-search" aria-label="Buscar materiais no catálogo" placeholder="Buscar material…" @input="emit('update:search', $event.target.value)" @keydown.enter="emit('search-submit')" />
    </div>

    <nav v-if="!activeGroup" class="catalog-filter-scroll catalog-filter-groups" aria-label="Grupos de materiais">
      <button v-for="group in visibleGroups" :key="group" type="button" class="catalog-filter-row" @click="emit('select-group', group)">
        <span>{{ group }}</span><span aria-hidden="true" class="catalog-filter-chevron">›</span>
      </button>
      <p v-if="!visibleGroups.length" class="catalog-filter-empty">Nenhum grupo encontrado.</p>
    </nav>
    <div v-else class="catalog-filter-scroll">
      <section v-for="facet in visibleFacets" :key="facet.key" class="catalog-filter-section">
        <button type="button" class="catalog-filter-section-title" :aria-expanded="isExpanded(facet)" :aria-controls="`catalog-facet-${facet.key}`" @click="toggleSection(facet)">
          <span>{{ facet.label }} <small v-if="facet.selected.length">{{ facet.selected.length }}</small></span>
          <span aria-hidden="true">{{ isExpanded(facet) ? '−' : '+' }}</span>
        </button>
        <div :id="`catalog-facet-${facet.key}`" class="ds-collapse" :class="{ 'ds-collapse-open': isExpanded(facet) }">
          <div class="catalog-filter-options">
            <template v-for="option in facet.options" :key="option.value">
              <button v-if="isHierarchy(facet)" type="button" class="catalog-filter-row" @click="emit('toggle-filter', facet.key, option.value)">
                <span>{{ option.value }}</span><span aria-hidden="true" class="catalog-filter-chevron">›</span>
              </button>
              <label v-else class="catalog-filter-option">
                <input type="checkbox" class="ds-table-checkbox" :checked="facet.selected.includes(option.value)" @change="emit('toggle-filter', facet.key, option.value)" />
                <span>{{ option.value }}</span>
              </label>
            </template>
          </div>
        </div>
      </section>
      <p v-if="!visibleFacets.length" class="catalog-filter-empty">{{ filterSearch.trim() ? 'Nenhum filtro encontrado.' : 'Nenhum filtro disponível neste nível.' }}</p>
    </div>
  </aside>
</template>

<style scoped>
.catalog-filter-panel { background: var(--ds-panel); color: var(--ds-text); border: 1px solid var(--ds-border); }
.catalog-filter-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 12px 8px 16px; border-bottom: 1px solid var(--ds-border-subtle); flex-shrink: 0; }
.catalog-filter-header h2 { font-size: 14px; font-weight: 650; }
.catalog-filter-clear { margin-left: auto; color: var(--ds-danger); font-size: 12px; cursor: pointer; }
.catalog-filter-context { display: grid; gap: 12px; padding: 12px; flex-shrink: 0; }
.catalog-filter-all { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 8px 10px; border-radius: 6px; font-size: 13px; text-align: left; color: var(--ds-text-soft); cursor: pointer; }
.catalog-filter-group { font-size: 15px; font-weight: 650; overflow-wrap: anywhere; }
.catalog-filter-search { min-width: 0; min-height: 38px; font-size: 13px; }
.catalog-filter-scroll { min-height: 0; overflow-y: auto; flex: 1 1 auto; scrollbar-width: thin; scrollbar-color: var(--ds-border) transparent; }
.catalog-filter-groups { padding: 0 6px 8px; }
.catalog-filter-row, .catalog-filter-option { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 10px; border-radius: 6px; font-size: 13px; text-align: left; cursor: pointer; }
.catalog-filter-row > span:first-child, .catalog-filter-option > span { flex: 1; min-width: 0; overflow-wrap: anywhere; line-height: 1.4; }
.catalog-filter-chevron { color: var(--ds-text-muted); font-size: 19px; }
.catalog-filter-row:hover, .catalog-filter-option:hover, .catalog-filter-all:hover { background: var(--ds-surface-hover); }
.catalog-filter-section { border-top: 1px solid var(--ds-border-subtle); }
.catalog-filter-section-title { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 12px 16px; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; }
.catalog-filter-section-title small { margin-left: 6px; color: var(--ds-active-text); }
.catalog-filter-panel .catalog-filter-options { max-height: 260px; overflow-y: auto; padding: 0 6px 8px; }
.catalog-filter-option input { flex-shrink: 0; }
.catalog-filter-empty { padding: 20px 12px; color: var(--ds-text-muted); text-align: center; font-size: 13px; }
.catalog-filter-panel button:focus-visible { outline: 2px solid var(--ds-active-text); outline-offset: -2px; }
</style>
