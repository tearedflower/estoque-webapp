import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, nextTick, ref } from 'vue'
import { useMovementHistory } from '../src/composables/useMovementHistory.js'
import { movementHistoryCsv } from '../src/utils/movementHistoryCsv.js'

test('CSV exports every matching history row across pages with combined search, dates and facets', () => {
  const scope = effectScope()
  try {
    scope.run(() => {
      const movement = { date: '2026-10-12T12:00:00', type: 'saida', itemName: 'Luva "A"; reforçada', itemGroup: 'EPI', itemCategory: 'Mãos', itemUnit: 'PAR', qty: 2, stockAfter: 0, requestedBy: 'José', destination: 'Oficina', operatorName: 'admin', note: '=1+1', variationValues: { Tamanho: 'G', CA: '123' }, variationExtras: { Bico: 'Aço' } }
      const rows = Array.from({ length: 25 }, (_, id) => ({ ...movement, id }))
      rows.push({ ...movement, itemName: 'Bota' }, { ...movement, type: 'entrada' }, { ...movement, date: '2026-09-12T12:00:00' }, { ...movement, itemGroup: 'Ferramentas' })
      const history = useMovementHistory(ref(rows))
      history.clearHistFilters()
      history.histSearch.value = 'luva'
      history.histDateFrom.value = '2026-10-01'
      history.histDateTo.value = '2026-10-31'
      history.toggleHistFilter('tipo', 'Saída')
      history.toggleHistFilter('grupo', 'EPI')
      assert.equal(history.paginatedMovements.value.length, 20)
      const csv = movementHistoryCsv(history.filteredMovements.value)
      assert.equal(csv.charCodeAt(0), 0xFEFF)
      assert.equal(csv.split('\r\n').length, 26)
      assert.ok(csv.includes('"Luva ""A""; reforçada"'))
      assert.ok(csv.includes('"Bico: Aço · CA: 123 · Tamanho: G"'))
      assert.ok(csv.includes('"2";"PAR";"0"'))
      assert.ok(csv.includes('"\'=1+1"'))
      assert.ok(!csv.includes('Ferramentas'))
      history.histSearch.value = 'inexistente'
      assert.equal(movementHistoryCsv(history.filteredMovements.value).split('\r\n').length, 1)
    })
  } finally { scope.stop() }
})

test('history from a ranking isolates the variation, persists it and clears it with other filters', async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const values = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } })
  const scope = effectScope()
  try {
    const base = { itemName: 'Rolamento', type: 'saida', qty: 1, date: '2026-10-01', itemUnit: 'UN' }
    const movements = ref([{ ...base, variationId: 'v1' }, { ...base, variationId: 'v2' }, { ...base, variationId: 'v1', type: 'entrada', date: '2026-09-01' }])
    const history = scope.run(() => useMovementHistory(movements))
    history.histSearch.value = 'Rolamento'
    history.histVariationId.value = 'v1'
    assert.equal(history.filteredMovements.value.length, 2)
    assert.ok(history.filteredMovements.value.every(row => row.variationId === 'v1'))
    assert.equal(history.histFacets.value.find(row => row.key === 'tipo').options.length, 2)
    assert.equal(movementHistoryCsv(history.filteredMovements.value).split('\r\n').length, 3)
    await nextTick()
    const reloaded = scope.run(() => useMovementHistory(movements))
    assert.equal(reloaded.histVariationId.value, 'v1')
    reloaded.clearHistFilters()
    assert.equal(reloaded.histVariationId.value, '')
    assert.equal(reloaded.hasHistFilters.value, false)
    assert.equal(reloaded.filteredMovements.value.length, 3)
  } finally {
    scope.stop()
    if (previousStorage) Object.defineProperty(globalThis, 'sessionStorage', previousStorage)
    else delete globalThis.sessionStorage
  }
})
