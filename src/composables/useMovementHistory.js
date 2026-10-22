import { computed, ref, watch } from 'vue'
import { normalizeSearchText } from '../utils/globalSearch.js'

const HISTORY_STATE_KEY = 'estoque_movement_history_v1'
const PAGE_SIZE_OPTIONS = [20, 50, 100]

export function searchHistoryFacets(facets, search) {
  const query = normalizeSearchText(search)
  if (!query) return facets
  return facets.flatMap(facet => {
    if (normalizeSearchText(facet.label).includes(query)) return [facet]
    const options = facet.options.filter(option => normalizeSearchText(option.value).includes(query))
    return options.length ? [{ ...facet, options }] : []
  })
}

function loadHistoryState() {
  try {
    return JSON.parse(globalThis.sessionStorage?.getItem(HISTORY_STATE_KEY) || '{}')
  } catch {
    return {}
  }
}

function savedFilters(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, selected]) => Array.isArray(selected))
  )
}

function saveHistoryState(state) {
  try {
    globalThis.sessionStorage?.setItem(HISTORY_STATE_KEY, JSON.stringify(state))
  } catch {
    // The history still works when browser storage is unavailable.
  }
}

const FIELD_BY_FILTER = {
  grupo: 'itemGroup',
  categoria: 'itemCategory',
  subcategoria: 'itemSubcategory',
  item: 'itemName',
  responsavel: 'requestedBy',
  local: 'destination',
  operador: 'operatorName',
}

export function useMovementHistory(movements) {
  const saved = loadHistoryState()
  const histSearch = ref(typeof saved.search === 'string' ? saved.search : '')
  const histVariationId = ref(typeof saved.variationId === 'string' ? saved.variationId : '')
  const histDateFrom = ref(typeof saved.dateFrom === 'string' ? saved.dateFrom : '')
  const histDateTo = ref(typeof saved.dateTo === 'string' ? saved.dateTo : '')
  const histFilters = ref(savedFilters(saved.filters))
  const historyCurrentPage = ref(1)
  const historyPageSize = ref(PAGE_SIZE_OPTIONS.includes(saved.pageSize) ? saved.pageSize : 20)

  const facetDefs = [
    { key: 'tipo', label: 'Tipo', group: 'main', priority: 10, defaultExpanded: true },
    { key: 'responsavel', label: 'Responsável', group: 'main', priority: 20 },
    { key: 'local', label: 'Local', group: 'main', priority: 30 },
    { key: 'operador', label: 'Operador', group: 'main', priority: 50 },
    { key: 'grupo', label: 'Grupo', group: 'product', priority: 10 },
    { key: 'categoria', label: 'Categoria', group: 'product', priority: 20 },
    { key: 'subcategoria', label: 'Subcategoria', group: 'product', priority: 30 },
    { key: 'item', label: 'Item', group: 'product', priority: 40 },
  ]

  function getFilterValue(movement, key) {
    if (key === 'tipo') return movement.type === 'entrada' ? 'Entrada' : 'Sa\u00edda'
    if (key.startsWith('attr_')) return (movement.variationValues || {})[key.slice(5)] || ''
    const fieldName = FIELD_BY_FILTER[key]
    return fieldName ? movement[fieldName] : ''
  }

  // Normalize each record only when the history changes, never once per facet and keystroke.
  const searchIndex = computed(() => movements.value.map(movement => ({
    movement,
    date: new Date(movement.date).getTime(),
    text: [
      movement.itemName, movement.itemGroup, movement.itemCategory, movement.itemSubcategory,
      movement.supplier, movement.requestedBy, movement.destination,
      movement.docRef, movement.operatorName, movement.note,
      ...Object.values(movement.variationValues || {}),
      ...Object.values(movement.variationExtras || {}),
    ].map(normalizeSearchText).join(' '),
  })))
  const baseMovements = computed(() => {
    const q = normalizeSearchText(histSearch.value)
    const from = histDateFrom.value ? new Date(`${histDateFrom.value}T00:00:00`).getTime() : null
    let end = null
    if (histDateTo.value) {
      const to = new Date(`${histDateTo.value}T00:00:00`)
      to.setDate(to.getDate() + 1)
      end = to.getTime()
    }
    return searchIndex.value.filter(entry => (!q || entry.text.includes(q)) &&
      (!histVariationId.value || entry.movement.variationId === histVariationId.value) &&
      (from === null || !(entry.date < from)) && (end === null || !(entry.date >= end)))
      .map(entry => entry.movement)
  })

  function movementMatchesFilters(movement, ignoredKey = '') {
    for (const [key, selectedValues] of Object.entries(histFilters.value)) {
      if (key === ignoredKey || !selectedValues.length) continue
      if (!selectedValues.includes(getFilterValue(movement, key))) return false
    }
    return true
  }

  const attributeKeys = computed(() => [...new Set(movements.value.flatMap(m => Object.keys(m.variationValues || {}).map(key => `attr_${key}`)))])

  const histFacets = computed(() => {
    if (!movements.value.length) return []
    const selected = histFilters.value
    const attrKeys = new Set([...attributeKeys.value, ...Object.keys(selected).filter(key => key.startsWith('attr_'))])
    const definitions = [...facetDefs, ...[...attrKeys].map(key => ({ key, label: key.slice(5), group: 'details', priority: 100, defaultExpanded: false }))]
    const counts = new Map(definitions.map(def => [def.key, new Map()]))
    const active = Object.entries(selected).filter(([, values]) => values.length)
    // A facet ignores only its own selection. Two failed filters exclude every facet.
    for (const movement of baseMovements.value) {
      const failed = active.filter(([key, values]) => !values.includes(getFilterValue(movement, key)))
      if (failed.length > 1) continue
      for (const def of definitions) {
        if (failed.length && failed[0][0] !== def.key) continue
        const value = getFilterValue(movement, def.key)
        if (!value) continue
        const values = counts.get(def.key)
        values.set(value, (values.get(value) || 0) + 1)
      }
    }

    function makeFacet(def) {
      const vals = counts.get(def.key)
      for (const value of selected[def.key] || []) {
        if (!vals.has(value)) vals.set(value, 0)
      }
      const options = [...vals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }))
      if (!options.length) return null
      return { ...def, options, selected: selected[def.key] || [] }
    }

    const result = definitions
      .map(makeFacet)
      .filter(Boolean)

    return result.sort((a, b) =>
      (a.group || '').localeCompare(b.group || '') ||
      (a.priority || 0) - (b.priority || 0) ||
      a.label.localeCompare(b.label)
    )
  })

  const hasHistFilters = computed(() =>
    Boolean(histVariationId.value) ||
    histSearch.value.trim().length > 0 ||
    histDateFrom.value !== '' ||
    histDateTo.value !== '' ||
    Object.values(histFilters.value).some(arr => arr.length > 0)
  )

  function toggleHistFilter(key, value) {
    const cur = histFilters.value[key] || []
    const idx = cur.indexOf(value)
    if (idx >= 0) cur.splice(idx, 1)
    else cur.push(value)
    histFilters.value = { ...histFilters.value, [key]: cur }
  }

  function clearHistFilters() {
    histVariationId.value = ''
    histSearch.value = ''
    histDateFrom.value = ''
    histDateTo.value = ''
    histFilters.value = {}
  }

  const filteredMovements = computed(() => {
    return baseMovements.value.filter(m => movementMatchesFilters(m))
  })

  const historyTotalPages = computed(() => Math.max(1, Math.ceil(filteredMovements.value.length / historyPageSize.value)))
  const paginatedMovements = computed(() => {
    const start = (historyCurrentPage.value - 1) * historyPageSize.value
    return filteredMovements.value.slice(start, start + historyPageSize.value)
  })

  watch([histSearch, histVariationId, histDateFrom, histDateTo, histFilters, historyPageSize], () => {
    historyCurrentPage.value = 1
    saveHistoryState({
      search: histSearch.value,
      variationId: histVariationId.value,
      dateFrom: histDateFrom.value,
      dateTo: histDateTo.value,
      filters: histFilters.value,
      pageSize: historyPageSize.value,
    })
  }, { deep: true })

  watch(historyTotalPages, total => {
    if (historyCurrentPage.value > total) historyCurrentPage.value = total
  })

  const histTotals = computed(() => {
    let entradas = 0
    let saidas = 0
    for (const m of filteredMovements.value) {
      if (m.type === 'entrada') entradas += m.qty
      else saidas += m.qty
    }
    return { entradas, saidas }
  })

  return {
    histVariationId,
    histSearch,
    histDateFrom,
    histDateTo,
    histFacets,
    hasHistFilters,
    toggleHistFilter,
    clearHistFilters,
    filteredMovements,
    paginatedMovements,
    historyCurrentPage,
    historyPageSize,
    historyPageSizeOptions: PAGE_SIZE_OPTIONS,
    historyTotalPages,
    histTotals,
  }
}
