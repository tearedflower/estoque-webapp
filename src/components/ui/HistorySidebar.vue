<script setup>
import { computed, reactive } from 'vue'

const props = defineProps({
  facets: { type: Array, default: () => [] },
  hasActiveFilters: { type: Boolean, default: false },
  search: { type: String, default: '' },
  dateFrom: { type: String, default: '' },
  dateTo: { type: String, default: '' },
})

defineEmits(['close', 'toggle-filter', 'clear-filters', 'update:search', 'update:dateFrom', 'update:dateTo'])

const expandedSections = reactive({})
const expandedGroups = reactive({ details: false })

const mainFacets = computed(() => facetsForGroup('main'))
const productFacets = computed(() => facetsForGroup('product'))
const detailFacets = computed(() => facetsForGroup('details'))

const selectedFilters = computed(() =>
  props.facets.flatMap(facet =>
    (facet.selected || []).map(value => ({
      key: facet.key,
      label: facet.label,
      value,
    }))
  )
)

const detailSelectedCount = computed(() => selectedCount(detailFacets.value))

function facetsForGroup(group) {
  return props.facets
    .filter(facet => facet.group === group)
    .sort((a, b) =>
      (a.priority || 0) - (b.priority || 0) ||
      a.label.localeCompare(b.label)
    )
}

function selectedCount(facets) {
  return facets.reduce((sum, facet) => sum + (facet.selected?.length || 0), 0)
}

function isExpanded(facet) {
  if (expandedSections[facet.key] !== undefined) return expandedSections[facet.key]
  return Boolean(facet.defaultExpanded)
}

function toggleSection(facet) {
  expandedSections[facet.key] = !isExpanded(facet)
}
</script>

<template>
  <aside
    class="history-filter-sidebar ds-filter-rail fixed top-0 left-0 h-full z-40 w-60 border-r border-gray-200 dark:border-gray-700 shadow-lg flex flex-col"
  >
    <div class="border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center justify-between gap-2 p-3">
        <span class="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Filtros</span>
        <button
          data-mobile-sidebar-close
          class="inline-flex min-h-10 min-w-10 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          type="button"
          title="Fechar painel"
          aria-label="Fechar filtros"
          @click="$emit('close')"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col">
      <button
        v-if="hasActiveFilters"
        class="w-full text-left px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-b border-gray-200 dark:border-gray-700 flex items-center gap-1 cursor-pointer"
        @click="$emit('clear-filters')"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Limpar filtros
      </button>

      <div class="flex-1 overflow-y-auto sidebar-scroll flex flex-col">
        <section class="order-0 px-3 pt-3 pb-2 border-b border-gray-100 dark:border-gray-700/50">
          <p class="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Busca</p>
          <div class="relative">
            <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              :value="search"
              type="text"
              placeholder="Buscar material, responsável, local, doc ou operador..."
              class="ds-filter-rail-input w-full rounded-lg border py-1.5 pl-8 pr-7 text-xs transition-colors focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              @input="$emit('update:search', $event.target.value)"
            />
            <button v-if="search" class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer" @click="$emit('update:search', '')">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div v-if="selectedFilters.length" class="mt-2 flex flex-wrap gap-1.5">
            <button
              v-for="filter in selectedFilters"
              :key="`${filter.key}:${filter.value}`"
              class="max-w-full inline-flex items-center gap-1 rounded-full border border-primary-500/20 bg-primary-500/10 px-2 py-0.5 text-[10px] font-medium text-primary-700 dark:text-primary-300 cursor-pointer"
              :title="`${filter.label}: ${filter.value}`"
              @click="$emit('toggle-filter', filter.key, filter.value)"
            >
              <span class="truncate">{{ filter.label }}: {{ filter.value }}</span>
              <svg class="h-2.5 w-2.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </section>

        <section class="order-10 px-3 py-3 space-y-1.5 border-b border-gray-100 dark:border-gray-700/50">
          <p class="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Período</p>
          <div class="grid grid-cols-2 gap-1.5">
            <div>
              <label class="block text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">De</label>
              <input
                :value="dateFrom"
                type="date"
                class="ds-filter-rail-input w-full rounded border px-1.5 py-1 text-[11px] transition-colors focus:outline-none focus:border-primary-500"
                @input="$emit('update:dateFrom', $event.target.value)"
              />
            </div>
            <div>
              <label class="block text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">Até</label>
              <input
                :value="dateTo"
                type="date"
                class="ds-filter-rail-input w-full rounded border px-1.5 py-1 text-[11px] transition-colors focus:outline-none focus:border-primary-500"
                @input="$emit('update:dateTo', $event.target.value)"
              />
            </div>
          </div>
        </section>

        <section v-if="mainFacets.length" class="order-40 mt-2 border-t-2 border-b border-gray-200 bg-gray-50/70 dark:border-gray-600/70 dark:bg-gray-900/35">
          <div class="flex items-center justify-between px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            <span>Filtros principais</span>
            <span v-if="selectedCount(mainFacets)" class="rounded-full bg-primary-600 px-1.5 py-0.5 text-[9px] text-[var(--ds-primary-text)]">{{ selectedCount(mainFacets) }}</span>
          </div>
          <div v-for="facet in mainFacets" :key="facet.key" class="border-t border-gray-100 dark:border-gray-700/50">
            <button
              type="button"
              class="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer"
              :class="!isExpanded(facet)
                ? 'text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
              :aria-expanded="isExpanded(facet)"
              :aria-controls="`history-main-facet-${facet.key}`"
              @click="toggleSection(facet)"
            >
              <span class="flex items-center gap-1.5">
                {{ facet.label }}
                <span v-if="facet.selected.length" class="w-4 h-4 rounded-full bg-primary-600 dark:bg-primary-500 text-[var(--ds-primary-text)] text-[9px] font-bold flex items-center justify-center">{{ facet.selected.length }}</span>
              </span>
              <svg class="w-3.5 h-3.5 transition-transform duration-200" :class="{ '-rotate-90': !isExpanded(facet) }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            <div
              :id="`history-main-facet-${facet.key}`"
              class="ds-collapse"
              :class="{ 'ds-collapse-open': isExpanded(facet) }"
            >
              <div class="px-3 pb-2.5 space-y-0.5">
              <label
                v-for="opt in facet.options"
                :key="opt.value"
                class="flex items-center gap-2.5 py-1 px-1 rounded cursor-pointer group hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
              >
                <span
                  class="relative flex items-center justify-center w-4 h-4 rounded border-[1.5px] transition-all flex-shrink-0"
                  :class="facet.selected.includes(opt.value)
                    ? 'bg-primary-600 dark:bg-primary-500 border-primary-600 dark:border-primary-500'
                    : 'border-gray-300 dark:border-gray-500 group-hover:border-gray-400 dark:group-hover:border-gray-400'"
                >
                  <svg v-if="facet.selected.includes(opt.value)" class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </span>
                <input type="checkbox" class="sr-only" :checked="facet.selected.includes(opt.value)" @change="$emit('toggle-filter', facet.key, opt.value)" />
                <span class="text-[13px] text-gray-700 dark:text-gray-300 truncate flex-1 group-hover:text-gray-900 dark:group-hover:text-gray-100 leading-tight">{{ opt.value }}</span>
                <span class="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums flex-shrink-0">({{ opt.count }})</span>
              </label>
            </div>
            </div>
          </div>
        </section>

        <section v-if="productFacets.length" class="order-20 mt-2 border-t-2 border-b border-gray-200 bg-gray-50/70 dark:border-gray-600/70 dark:bg-gray-900/35">
          <div class="flex items-center justify-between px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            <span>Produto</span>
            <span v-if="selectedCount(productFacets)" class="rounded-full bg-primary-600 px-1.5 py-0.5 text-[9px] text-[var(--ds-primary-text)]">{{ selectedCount(productFacets) }}</span>
          </div>
          <div v-for="facet in productFacets" :key="facet.key" class="border-t border-gray-100 dark:border-gray-700/50">
            <button
              type="button"
              class="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer"
              :class="!isExpanded(facet)
                ? 'text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
              :aria-expanded="isExpanded(facet)"
              :aria-controls="`history-product-facet-${facet.key}`"
              @click="toggleSection(facet)"
            >
              <span class="flex items-center gap-1.5">
                {{ facet.label }}
                <span v-if="facet.selected.length" class="w-4 h-4 rounded-full bg-primary-600 dark:bg-primary-500 text-[var(--ds-primary-text)] text-[9px] font-bold flex items-center justify-center">{{ facet.selected.length }}</span>
              </span>
              <svg class="w-3.5 h-3.5 transition-transform duration-200" :class="{ '-rotate-90': !isExpanded(facet) }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            <div
              :id="`history-product-facet-${facet.key}`"
              class="ds-collapse"
              :class="{ 'ds-collapse-open': isExpanded(facet) }"
            >
              <div class="px-3 pb-2.5 space-y-0.5">
              <label
                v-for="opt in facet.options"
                :key="opt.value"
                class="flex items-center gap-2.5 py-1 px-1 rounded cursor-pointer group hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
              >
                <span
                  class="relative flex items-center justify-center w-4 h-4 rounded border-[1.5px] transition-all flex-shrink-0"
                  :class="facet.selected.includes(opt.value)
                    ? 'bg-primary-600 dark:bg-primary-500 border-primary-600 dark:border-primary-500'
                    : 'border-gray-300 dark:border-gray-500 group-hover:border-gray-400 dark:group-hover:border-gray-400'"
                >
                  <svg v-if="facet.selected.includes(opt.value)" class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </span>
                <input type="checkbox" class="sr-only" :checked="facet.selected.includes(opt.value)" @change="$emit('toggle-filter', facet.key, opt.value)" />
                <span class="text-[13px] text-gray-700 dark:text-gray-300 truncate flex-1 group-hover:text-gray-900 dark:group-hover:text-gray-100 leading-tight">{{ opt.value }}</span>
                <span class="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums flex-shrink-0">({{ opt.count }})</span>
              </label>
            </div>
            </div>
          </div>
        </section>

        <section v-if="detailFacets.length" class="order-30 border-b border-gray-200 bg-gray-50/70 dark:border-gray-600/70 dark:bg-gray-900/35">
          <button
            type="button"
            class="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
            :aria-expanded="expandedGroups.details"
            aria-controls="history-detail-facets"
            @click="expandedGroups.details = !expandedGroups.details"
          >
            <span class="flex items-center gap-1.5">
              Detalhes do produto
              <span v-if="detailSelectedCount" class="w-4 h-4 rounded-full bg-primary-600 dark:bg-primary-500 text-[var(--ds-primary-text)] text-[9px] font-bold flex items-center justify-center">{{ detailSelectedCount }}</span>
            </span>
            <svg class="w-3.5 h-3.5 transition-transform duration-200" :class="{ '-rotate-90': !expandedGroups.details }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          <div
            id="history-detail-facets"
            class="ds-collapse"
            :class="{ 'ds-collapse-open': expandedGroups.details }"
          >
            <div>
            <div v-for="facet in detailFacets" :key="facet.key" class="border-t border-gray-100 dark:border-gray-700/50">
              <button
                type="button"
                class="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer"
                :class="!isExpanded(facet)
                  ? 'text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
                :aria-expanded="isExpanded(facet)"
                :aria-controls="`history-detail-facet-${facet.key}`"
                @click="toggleSection(facet)"
              >
                <span class="flex items-center gap-1.5">
                  {{ facet.label }}
                  <span v-if="facet.selected.length" class="w-4 h-4 rounded-full bg-primary-600 dark:bg-primary-500 text-[var(--ds-primary-text)] text-[9px] font-bold flex items-center justify-center">{{ facet.selected.length }}</span>
                </span>
                <svg class="w-3.5 h-3.5 transition-transform duration-200" :class="{ '-rotate-90': !isExpanded(facet) }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              <div
                :id="`history-detail-facet-${facet.key}`"
                class="ds-collapse"
                :class="{ 'ds-collapse-open': isExpanded(facet) }"
              >
              <div class="px-3 pb-2.5 space-y-0.5">
                <label
                  v-for="opt in facet.options"
                  :key="opt.value"
                  class="flex items-center gap-2.5 py-1 px-1 rounded cursor-pointer group hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                >
                  <span
                    class="relative flex items-center justify-center w-4 h-4 rounded border-[1.5px] transition-all flex-shrink-0"
                    :class="facet.selected.includes(opt.value)
                      ? 'bg-primary-600 dark:bg-primary-500 border-primary-600 dark:border-primary-500'
                      : 'border-gray-300 dark:border-gray-500 group-hover:border-gray-400 dark:group-hover:border-gray-400'"
                  >
                    <svg v-if="facet.selected.includes(opt.value)" class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </span>
                  <input type="checkbox" class="sr-only" :checked="facet.selected.includes(opt.value)" @change="$emit('toggle-filter', facet.key, opt.value)" />
                  <span class="text-[13px] text-gray-700 dark:text-gray-300 truncate flex-1 group-hover:text-gray-900 dark:group-hover:text-gray-100 leading-tight">{{ opt.value }}</span>
                  <span class="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums flex-shrink-0">({{ opt.count }})</span>
                </label>
              </div>
              </div>
            </div>
            </div>
          </div>
        </section>

        <p v-if="facets.length === 0" class="px-3 py-4 text-sm text-gray-400 dark:text-gray-500 italic text-center">
          Nenhuma movimentação registrada.
        </p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-scroll {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--ds-text-subtle) 45%, transparent) transparent;
}
.sidebar-scroll::-webkit-scrollbar { width: 5px; }
.sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
.sidebar-scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--ds-text-subtle) 45%, transparent); border-radius: 9999px; }
.sidebar-scroll::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--ds-text-subtle) 65%, transparent); }
</style>
