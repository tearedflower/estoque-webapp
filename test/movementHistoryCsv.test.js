import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, ref } from 'vue'
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
