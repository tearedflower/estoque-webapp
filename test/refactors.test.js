import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick, ref } from 'vue'

import { buildGlobalSearchResults, filterDestinations, findExactDestination, matchesSearchTokens, normalizeSearchText, searchTokens } from '../src/utils/globalSearch.js'
import { failedSourceNames } from '../src/utils/sync.js'
import { destinationDescendants, destinationMoveError, sortDestinationsByOrder } from '../src/composables/useDestinations.js'
import { buildMotorDestinationTree, motorMatchesIdentity, motorMatchesSearch, motorOpenEventLabel } from '../src/composables/useMotors.js'
import { stockAlertStatus, stockAlertTransition } from '../src/composables/useItems.js'
import { useMovementHistory, searchHistoryFacets } from '../src/composables/useMovementHistory.js'

test('additional history filters can be found by label or value without changing selections', () => {
  const facets = [
    { key: 'attr_Bico', label: 'Bico', selected: ['Composite'], options: [{ value: 'Composite', count: 4 }, { value: 'Aço', count: 2 }] },
    { key: 'attr_Marca', label: 'Marca', selected: [], options: [{ value: 'Volk', count: 3 }] },
  ]
  assert.equal(searchHistoryFacets(facets, ''), facets)
  assert.deepEqual(searchHistoryFacets(facets, 'bico'), [facets[0]])
  const found = searchHistoryFacets(facets, ' ACO ')
  assert.deepEqual(found[0].options, [{ value: 'Aço', count: 2 }])
  assert.deepEqual(found[0].selected, ['Composite'])
  assert.equal(facets[0].options.length, 2)
  assert.deepEqual(searchHistoryFacets(facets, 'inexistente'), [])
})

test('history search reuses normalized records and keeps contextual facet counts correct', () => {
  let reads = 0
  const note = { toString: () => { reads++; return 'Conferência'; } }
  const movements = ref([
    { id: 'a', type: 'entrada', itemName: 'Bóta', requestedBy: 'Ana', qty: 2, date: '2026-09-01', note, variationValues: { Bico: 'Composite' } },
    { id: 'b', type: 'saida', itemName: 'Bota', requestedBy: 'Ana', qty: 1, date: '2026-09-02', note, variationValues: { Bico: 'Aço' } },
    { id: 'c', type: 'entrada', itemName: 'Bota', requestedBy: 'Bia', qty: 3, date: '2026-09-03', note, variationValues: { Bico: 'Aço' } },
  ])
  const h = useMovementHistory(movements)
  h.clearHistFilters()
  for (const term of ['b', 'bo', 'bot', 'bota', 'conferencia']) {
    h.histSearch.value = term
    assert.equal(h.filteredMovements.value.length, 3)
    assert.equal(h.histFacets.value.find(f => f.key === 'tipo').options.find(o => o.value === 'Entrada').count, 2)
    assert.equal(h.histTotals.value.entradas, 5)
  }
  assert.equal(reads, 3, 'Typing must not renormalize every record for every facet.')
  h.toggleHistFilter('responsavel', 'Ana')
  h.toggleHistFilter('tipo', 'Entrada')
  assert.deepEqual(h.filteredMovements.value.map(m => m.id), ['a'])
  const options = key => Object.fromEntries(h.histFacets.value.find(f => f.key === key).options.map(o => [o.value, o.count]))
  assert.deepEqual(options('tipo'), { Entrada: 1, Saída: 1 })
  assert.deepEqual(options('responsavel'), { Ana: 1, Bia: 1 })
  assert.deepEqual(options('attr_Bico'), { Composite: 1 })
  movements.value[0].itemName = 'Parafuso'
  h.histSearch.value = 'bota'
  assert.equal(h.filteredMovements.value.length, 0)
  assert.deepEqual(options('tipo'), { Saída: 1, Entrada: 0 })
  h.clearHistFilters()
  movements.value[1].variationValues.Bico = 'Composite'
  h.toggleHistFilter('attr_Bico', 'Composite')
  assert.deepEqual(h.filteredMovements.value.map(m => m.id), ['a', 'b'])
})
import { getDestinationFullName } from '../server/utils/destinations.js'
import { formatPartialOrderDate, workOrderCreationDateError } from '../src/utils/workOrderForm.js'
import { workOrderMaintenanceKindLabel, workOrderMaintenanceSearchParts } from '../src/utils/workOrderSearch.js'
import {
  extrasListToObject,
  validateVariationForm,
  variationSetupIssues,
  variationFormForEdit,
  variationFormForItem,
} from '../src/utils/variationForm.js'

test('destination order preserves manual positions and sorts new entries', () => {
  const destinations = [
    { id: 'a', name: 'Alfa' },
    { id: 'b', name: 'Beta' },
    { id: 'c', name: 'Charlie' },
  ]
  assert.deepEqual(sortDestinationsByOrder(destinations, ['b', 'a']).map(d => d.id), ['b', 'a', 'c'])
})

test('movement history paginates and restores saved filters', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const storage = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  })

  try {
    const movements = ref(Array.from({ length: 25 }, (_, index) => ({
      id: `mov-${index}`,
      type: index % 2 ? 'saida' : 'entrada',
      itemName: `Item ${index + 1}`,
      qty: 1,
      date: `2026-01-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
    })))
    const history = useMovementHistory(movements)

    assert.equal(history.paginatedMovements.value.length, 20)
    assert.equal(history.historyTotalPages.value, 2)
    history.historyCurrentPage.value = 2
    assert.equal(history.paginatedMovements.value.length, 5)

    history.histDateFrom.value = '2026-01-10'
    history.toggleHistFilter('tipo', 'Entrada')
    history.historyPageSize.value = 50
    await nextTick()

    assert.equal(history.historyCurrentPage.value, 1)
    const restored = useMovementHistory(movements)
    assert.equal(restored.histDateFrom.value, '2026-01-10')
    assert.equal(restored.filteredMovements.value.every(movement => movement.type === 'entrada'), true)
    assert.equal(restored.historyPageSize.value, 50)
    restored.clearHistFilters()
    movements.value = [
      { id: 'last-minute', date: new Date(2026, 8, 30, 23, 59).toISOString() },
      { id: 'next-day', date: new Date(2026, 9, 1, 0, 0).toISOString() },
    ]
    restored.histDateFrom.value = '2026-09-30'
    restored.histDateTo.value = '2026-09-30'
    assert.deepEqual(restored.filteredMovements.value.map(row => row.id), ['last-minute'])
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor)
    else delete globalThis.sessionStorage
  }
})

test('variation form helpers preserve catalog behavior', () => {
  const item = { attributes: ['Cor'], minStock: 2, location: 'A1' }
  assert.deepEqual(variationFormForItem(item), {
    values: { Cor: '' }, stock: 0, minStock: null, extrasList: [], location: '', locations: [], destinations: [],
  })
  assert.deepEqual(
    variationFormForEdit(item, { values: { Cor: 'Azul' }, stock: 3, extras: { Marca: 'X' }, destinations: [4] }),
    { values: { Cor: 'Azul' }, stock: 3, minStock: null, extrasList: [{ key: 'Marca', value: 'X' }], location: 'A1', locations: ['A1'], destinations: [4] }
  )
  assert.deepEqual(variationFormForEdit(item, { values: {}, stock: 1, location: 'B2' }).locations, ['B2'])
  assert.deepEqual(variationFormForEdit(item, { values: {}, stock: 1, locations: ['A1', 'A2'] }).locations, ['A1', 'A2'])
  assert.deepEqual(extrasListToObject([{ key: ' Marca ', value: 'X' }, { key: ' ', value: 'ignorar' }]), { Marca: 'X' })
  assert.equal(validateVariationForm(item, variationFormForItem(item)), 'Preencha ao menos um atributo.')
  assert.equal(validateVariationForm(item, { ...variationFormForItem(item), values: { Cor: 'Azul' }, stock: -1 }), 'Quantidade não pode ser negativa.')
  assert.equal(validateVariationForm(item, { ...variationFormForItem(item), values: { Cor: 'Azul' }, stock: 1 }), null)
})

test('variation setup reports only missing operational fields', () => {
  assert.deepEqual(variationSetupIssues(
    { location: 'Prateleira A' },
    { minStock: 0, locations: [], destinations: [] },
  ), ['destination'])
  assert.deepEqual(variationSetupIssues(
    {},
    { minStock: 2, locations: ['Prateleira B'], destinations: ['Máquina 1'] },
  ), [])
})

test('stock alert transition only fires when saída enters a bad stock band', () => {
  const item = { unit: 'UN' }
  const variation = { minStock: 5, stock: 10 }

  assert.equal(stockAlertStatus({ minStock: 0, stock: 0 }, item), 'ok')
  assert.equal(stockAlertStatus({ minStock: 0, stock: -1 }, item), 'zero')
  assert.equal(stockAlertTransition({ type: 'saida', stockBefore: 12, stockAfter: 8 }, variation, item), 'alert')
  assert.equal(stockAlertTransition({ type: 'saida', stockBefore: 8, stockAfter: 4 }, variation, item), 'critical')
  assert.equal(stockAlertTransition({ type: 'saida', stockBefore: 4, stockAfter: 0 }, variation, item), 'zero')
  assert.equal(stockAlertTransition({ type: 'saida', stockBefore: 9, stockAfter: 8 }, variation, item), '')
  assert.equal(stockAlertTransition({ type: 'entrada', stockBefore: 0, stockAfter: 8 }, variation, item), '')
})

test('global search remains accent-insensitive and returns catalog targets', () => {
  const results = buildGlobalSearchResults({
    query: 'acido',
    items: [{ id: 1, name: 'Ácido', group: 'Químicos', unit: 'L' }],
    variations: [{ id: 2, itemId: 1, values: { Tipo: 'Forte' }, stock: 3 }],
  })
  assert.deepEqual(results.map(result => result.id), ['item:1', 'var:2'])
  assert.deepEqual(results[0].target, { tab: 'catalogo', itemId: 1, search: 'Ácido' })
})

test('shared search normalization handles accents, hierarchy separators and tokens', () => {
  assert.equal(normalizeSearchText('  Fiação » RÁPIDA  '), 'fiacao > rapida')
  const tokens = searchTokens('Bomba 10-mm')
  assert.deepEqual(tokens, ['bomba', '10', 'mm'])
  assert.equal(matchesSearchTokens('Bomba centrífuga 10 mm', tokens), true)
  assert.equal(matchesSearchTokens('Bomba centrífuga 12 mm', tokens), false)
})

test('global search shows commands and balances result types', () => {
  const commands = [{ id: 'command:entrada', type: 'Ação', title: 'Registrar entrada', target: {} }]
  assert.deepEqual(buildGlobalSearchResults({ query: '', commands }).map(result => result.id), ['command:entrada'])

  const results = buildGlobalSearchResults({
    query: 'x',
    commands: [{ id: 'command:x', type: 'Ação', title: 'X', target: {} }],
    workOrders: Array.from({ length: 20 }, (_, index) => ({ id: index, number: `X${index}` })),
    items: [{ id: 'item-x', name: 'Material X' }],
    motors: [{ id: 'motor-x', tag: 'Motor X' }],
  })
  assert.deepEqual(results.slice(0, 4).map(result => result.id), ['command:x', 'os:0', 'motor:motor-x', 'item:item-x'])
})

test('destination search returns and opens child destinations', () => {
  const destinations = [
    { id: 'machines', name: 'Máquinas', parentId: null },
    { id: 'machine-1', name: 'Super Máquina 1', parentId: 'machines' },
    { id: 'machine-2', name: 'Outra Máquina', parentId: 'machines' },
  ]

  assert.deepEqual(filterDestinations(destinations, 'super maquina').map(destination => destination.id), ['machine-1'])
  assert.equal(findExactDestination(destinations, 'Super Maquina 1')?.id, 'machine-1')
})

test('sync failures identify only stale data sources', () => {
  assert.deepEqual(failedSourceNames(
    [['materiais'], ['movimentações'], ['motores']],
    [{ status: 'fulfilled' }, { status: 'rejected' }, { status: 'fulfilled' }]
  ), ['movimentações'])
})

test('destination hierarchy supports any depth and blocks cycles', () => {
  const destinations = [
    { id: 'a', name: 'A', parentId: null },
    { id: 'a1', name: 'A1', parentId: 'a' },
    { id: 'a11', name: 'A11', parentId: 'a1' },
    { id: 'b', name: 'B', parentId: null },
  ]

  assert.deepEqual(destinationDescendants(destinations, 'a').map(destination => destination.id), ['a1', 'a11'])
  assert.equal(destinationMoveError(destinations, 'a', 'b'), '')
  assert.match(destinationMoveError(destinations, 'a', 'a11'), /descendente/)
  assert.equal(destinationMoveError(destinations, 'a11', 'b'), '')
  assert.match(destinationMoveError(destinations, 'b', 'b'), /dele mesmo/)
})

test('server resolves destination names at any depth', () => {
  const rows = new Map([
    ['a', { id: 'a', name: 'A', parent_id: null }],
    ['a1', { id: 'a1', name: 'A1', parent_id: 'a' }],
    ['a11', { id: 'a11', name: 'A11', parent_id: 'a1' }],
  ])
  const db = { prepare: () => ({ get: id => rows.get(id) }) }
  assert.equal(getDestinationFullName(db, 'a11'), 'A > A1 > A11')
})

test('motor search combines fields and ignores accents', () => {
  const motor = {
    tag: 'M-001',
    serial: 'ABC123',
    name: 'Motor principal',
    manufacturer: 'WEG',
    power: '5 CV',
    voltage: '380 V',
    rpm: '1750',
    status: 'em_manutencao',
    notes: 'Revisão preventiva',
  }

  assert.equal(motorMatchesSearch(motor, 'weg super manutencao', 'Máquinas > Super Máquina 1'), true)
  assert.equal(motorMatchesSearch(motor, 'siemens'), false)
  assert.equal(motorMatchesSearch({ tag: '1', serial: '1001' }, '1001'), true)
  assert.equal(motorMatchesIdentity({ tag: '1001' }, '1001'), true)
  assert.equal(motorMatchesIdentity({ tag: '1', serial: '1001' }, '1001'), false)
  assert.equal(motorMatchesSearch({ power: '5 CV', powerUnit: 'CV' }, '5', '', 'power_cv'), true)
  assert.equal(motorMatchesSearch({ power: '5 HP', powerUnit: 'HP' }, '5', '', 'power_cv'), false)
  assert.equal(motorMatchesSearch({ power: '5 HP', powerUnit: 'HP' }, '5', '', 'power_hp'), true)
})

test('open motor work orders use activity names for events', () => {
  assert.equal(motorOpenEventLabel('movimentado'), 'Movimentação')
  assert.equal(motorOpenEventLabel('rebobinado'), 'Rebobinação')
  assert.equal(motorOpenEventLabel('instalado'), 'Instalação')
})

test('motor catalog nests motors under parent and child destinations', () => {
  const destinations = [
    { id: 'machines', name: 'Máquinas' },
    { id: 'machine-1', name: 'Super Máquina 1', parentId: 'machines' },
    { id: 'sector-a', name: 'Setor A', parentId: 'machine-1' },
  ]
  const motors = [
    { id: 'm1', tag: 'M-001', destinationId: 'sector-a' },
    { id: 'm2', tag: 'M-002', destinationId: '' },
  ]

  const tree = buildMotorDestinationTree(motors, destinations)
  assert.equal(tree[0].name, 'Máquinas')
  assert.equal(tree[0].motorCount, 1)
  assert.equal(tree[0].children[0].name, 'Super Máquina 1')
  assert.deepEqual(tree[0].children[0].children[0].motors.map(motor => motor.id), ['m1'])
  assert.deepEqual(tree[1].motors.map(motor => motor.id), ['m2'])
})

test('work order maintenance search includes external workshop mapping', () => {
  const order = {
    maintenanceLocationType: 'externa',
    maintenanceExternalLocation: 'Americana Motores',
    maintenanceExternalOrderNumber: 'PED-771',
    motorOriginDestinationName: 'Turbo 1',
    motorEventLabel: 'Rebobinado',
    motorEventPerformedBy: 'Carlos Silva',
    motorEventNotes: 'Troca de rolamento',
  }
  const searchText = normalizeSearchText(workOrderMaintenanceSearchParts(order).join(' '))

  assert.equal(workOrderMaintenanceKindLabel(order), 'Oficina Externa')
  assert.equal(searchText.includes('oficina externa'), true)
  assert.equal(searchText.includes('americana motores'), true)
  assert.equal(searchText.includes('ped-771'), true)
  assert.equal(searchText.includes('rebobinado'), true)
  assert.equal(searchText.includes('carlos silva'), true)
  assert.equal(searchText.includes('troca de rolamento'), true)
})

test('registering a closed work order requires start and end dates', () => {
  assert.equal(workOrderCreationDateError('open', '', ''), '')
  assert.equal(workOrderCreationDateError('open', '2026-06-29', ''), '')
  assert.match(workOrderCreationDateError('register', '', ''), /início/)
  assert.match(workOrderCreationDateError('register', '2026-06-29', ''), /término/)
  assert.equal(workOrderCreationDateError('register', '2026-06-29', '2026-06-29'), '')
})

test('quick work order dates format while typing', () => {
  assert.equal(formatPartialOrderDate('010'), '01/0')
  assert.equal(formatPartialOrderDate('01072026'), '01/07/2026')
  assert.equal(formatPartialOrderDate('2026-07-01'), '01/07/2026')
})
