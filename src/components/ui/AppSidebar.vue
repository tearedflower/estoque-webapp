<script setup>
import { reactive } from 'vue'

defineProps({
  groups: { type: Array, required: true },
  activeGroup: { type: String, default: null },
  facets: { type: Array, default: () => [] },
  hasActiveFilters: { type: Boolean, default: false },
  search: { type: String, default: '' },
  showSearch: { type: Boolean, default: true },
})

defineEmits(['close', 'select-group', 'toggle-filter', 'clear-filters', 'update:search', 'search-submit'])

// Sections start collapsed — track which ones the user has expanded
const expandedSections = reactive({})

function toggleSection(key) {
  expandedSections[key] = !expandedSections[key]
}
</script>

<template>
  <aside
    class="catalog-sidebar ds-filter-rail fixed top-0 left-0 h-full z-40 w-60 border-r border-gray-200 dark:border-gray-700 shadow-lg flex flex-col"
  >
    <!-- Header -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center justify-between p-3">
        <span class="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Categorias e filtros</span>
        <button
          data-mobile-sidebar-close
          class="inline-flex min-h-10 min-w-10 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          type="button"
          title="Fechar painel"
          aria-label="Fechar categorias e filtros"
          @click="$emit('close')"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- ===== NAVIGATION MODE (no group selected) ===== -->
    <template v-if="!activeGroup">
      <button
        class="ds-filter-rail-active w-full truncate border-b border-gray-200 px-3 py-2 text-left text-sm font-medium transition-colors dark:border-gray-700 cursor-pointer"
        @click="$emit('select-group', null)"
      >
        Todos os Grupos
      </button>

      <!-- Search -->
      <div v-if="showSearch" class="px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
        <div class="relative">
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            :value="search"
            type="text"
            placeholder="Buscar..."
            class="ds-filter-rail-input sidebar-search-input w-full rounded-lg border py-1.5 pl-8 pr-7 text-xs transition-colors focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            @input="$emit('update:search', $event.target.value)"
            @keydown.enter="$emit('search-submit')"
          />
          <button
            v-if="search"
            class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
            @click="$emit('update:search', '')"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <nav class="flex-1 overflow-y-auto py-2">
        <button
          v-for="group in groups"
          :key="group"
          class="w-full text-left px-3 py-2 text-sm font-semibold transition-colors truncate text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          :title="group"
          @click="$emit('select-group', group)"
        >
          {{ group }}
        </button>
      </nav>
    </template>

    <!-- ===== EXPANDED: FILTER MODE (group selected) ===== -->
    <template v-else>
      <!-- Back button -->
      <button
        class="w-full text-left px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-700 flex items-center gap-1.5 cursor-pointer"
        @click="$emit('select-group', null)"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Todos os Grupos
      </button>

      <!-- Group name -->
      <div class="px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-sm font-bold text-primary-700 dark:text-primary-400 truncate">{{ activeGroup }}</h3>
      </div>

      <!-- Search -->
      <div v-if="showSearch" class="px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
        <div class="relative">
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            :value="search"
            type="text"
            placeholder="Buscar item, atributo..."
            class="ds-filter-rail-input sidebar-search-input w-full rounded-lg border py-1.5 pl-8 pr-7 text-xs transition-colors focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            @input="$emit('update:search', $event.target.value)"
            @keydown.enter="$emit('search-submit')"
          />
          <button
            v-if="search"
            class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
            @click="$emit('update:search', '')"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <!-- Clear filters -->
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

      <!-- Facet sections -->
      <div class="flex-1 overflow-y-auto sidebar-scroll">
        <div v-for="facet in facets" :key="facet.key" class="border-b border-gray-100 dark:border-gray-700/50">
          <!-- Section header -->
          <button
            type="button"
            class="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer"
            :class="!expandedSections[facet.key]
              ? 'text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
            :aria-expanded="Boolean(expandedSections[facet.key])"
            :aria-controls="`catalog-facet-${facet.key}`"
            @click="toggleSection(facet.key)"
          >
            <span>{{ facet.label }}</span>
            <svg
              class="w-3.5 h-3.5 transition-transform duration-200"
              :class="{ '-rotate-90': !expandedSections[facet.key] }"
              fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          <!-- Checkbox options -->
          <div
            :id="`catalog-facet-${facet.key}`"
            class="ds-collapse"
            :class="{ 'ds-collapse-open': expandedSections[facet.key] }"
          >
            <div class="px-3 pb-2.5 space-y-0.5">
            <label
              v-for="opt in facet.options"
              :key="opt.value"
              class="flex items-center gap-2.5 py-1 px-1 rounded cursor-pointer group hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
            >
              <!-- Custom checkbox -->
              <span
                class="relative flex items-center justify-center w-4 h-4 rounded border-[1.5px] transition-all flex-shrink-0"
                :class="facet.selected.includes(opt.value)
                  ? 'bg-primary-600 dark:bg-primary-500 border-primary-600 dark:border-primary-500'
                  : 'border-gray-300 dark:border-gray-500 group-hover:border-gray-400 dark:group-hover:border-gray-400'"
              >
                <svg
                  v-if="facet.selected.includes(opt.value)"
                  class="w-2.5 h-2.5 text-white"
                  fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </span>
              <input
                type="checkbox"
                class="sr-only"
                :checked="facet.selected.includes(opt.value)"
                @change="$emit('toggle-filter', facet.key, opt.value)"
              />
              <span class="text-[13px] text-gray-700 dark:text-gray-300 truncate flex-1 group-hover:text-gray-900 dark:group-hover:text-gray-100 leading-tight">
                {{ opt.value }}
              </span>
              <span class="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums flex-shrink-0">
                ({{ opt.count }})
              </span>
            </label>
            </div>
          </div>
        </div>

        <!-- No facets -->
        <p v-if="facets.length === 0" class="px-3 py-4 text-sm text-gray-400 dark:text-gray-500 italic text-center">
          Nenhum filtro disponível.
        </p>
      </div>
    </template>
  </aside>
</template>

<style scoped>
/* Thin elegant scrollbar */
.sidebar-scroll {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--ds-text-subtle) 45%, transparent) transparent;
}
.sidebar-scroll::-webkit-scrollbar {
  width: 5px;
}
.sidebar-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.sidebar-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ds-text-subtle) 45%, transparent);
  border-radius: 9999px;
}
.sidebar-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ds-text-subtle) 65%, transparent);
}

</style>
