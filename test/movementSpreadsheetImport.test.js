import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCatalogChoices,
  buildFormerPeople,
  isStockAdjustmentName,
  normalizeImportText,
  parseMovementWorkbookSheets,
  searchCatalogChoices,
  suggestVariation,
} from '../src/utils/movementSpreadsheetImport.js'

test('importação lê movimentos pelo nome, aceita preço ausente e mostra saldo negativo', () => {
  const result = parseMovementWorkbookSheets([
    { sheet: 'LANÇAR - ENTRADA', data: [
      [null, 'DATA', 'COD PROD', 'ITEM', 'QTD', 'Unidade', 'VALOR UNI.', 'NF', 'FORNECEDOR'],
      [null, new Date('2026-01-02T12:00:00Z'), null, 'Luva Látex M', 3, 'PAR', null, '-', '-'],
    ] },
    { sheet: 'LANÇAR - SAÍDA', data: [
      [null, 'DATA', 'COD PROD', 'ITEM', 'QTD', 'Unidade', 'OPERADOR', 'LOCAL DE APLICAÇÃO', 'REQUISITANTE'],
      [null, new Date('2026-01-03T12:00:00Z'), 123, 'Luva Látex M', 1, 'PAR', 'Ana', 'Oficina', 'José'],
    ] },
    { sheet: 'ESTOQUE', data: [
      ['COD PROD', 'ITEM', 'LOCAL', 'QTD TOTAL', 'UNIDADE'],
      [123, 'Luva Látex M', '', -2, 'PAR'],
    ] },
    { sheet: 'Nomes e Cargos', data: [
      ['NOME', 'CARGO', 'Saída', 'N° MAT.', null, 'NOMES (ALFABÉTICA)', 'CARGOS (ALFABÉTICA)'],
      ['Ana', 'Almoxarife', '', 10, null, 'José', 'Mecânico'],
    ] },
  ])

  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].unitCost, null)
  assert.equal(result.stockRows[0].stock, -2)
  assert.equal(result.people.length, 2)
})

test('quantidade mínima distingue vazio, zero e inválido e tolera palavras fora de ordem', () => {
  const result = parseMovementWorkbookSheets([
    { sheet: 'LANÇAR - ENTRADA', data: [
      ['DATA', 'ITEM', 'QTD', 'UNIDADE'],
      [new Date('2026-01-02T12:00:00Z'), 'ABAFADOR CONFORT PLUS CAMPER CA 48.054', 1, 'PC'],
      [new Date('2026-01-02T12:00:00Z'), 'ARRUELA LISA 1/4 GE', 1, 'PC'],
      [new Date('2026-01-02T12:00:00Z'), 'PROTETOR AUDITIVO SILICONE', 1, 'PC'],
    ] },
    { sheet: 'CADASTROS', data: [
      ['NomeItem', 'Nome c/ Atributos', 'Qtd Miníma'],
      ['ABAFADOR CONFORT PLUS', 'ABAFADOR CA 48.054 CAMPER CONFORT PLUS', 0],
      ['ARRUELA LISA 1/4', 'ARRUELA LISA 1/4 GE', null],
      ['PROTETOR AUDITIVO', 'PROTETOR AUDITIVO SILICONE', -1],
    ] },
  ])

  assert.deepEqual(result.minimumMatches.map(row => ({
    sourceName: row.sourceName,
    minStock: row.minStock,
    status: row.status,
  })), [
    { sourceName: 'ABAFADOR CONFORT PLUS CAMPER CA 48.054', minStock: 0, status: 'valid' },
    { sourceName: 'ARRUELA LISA 1/4 GE', minStock: null, status: 'blank' },
    { sourceName: 'PROTETOR AUDITIVO SILICONE', minStock: null, status: 'invalid' },
  ])
})

test('associação automática exige uma opção claramente superior', () => {
  const choices = buildCatalogChoices(
    [{ id: 'item_1', name: 'Luva de Látex', unit: 'PAR' }],
    [
      { id: 'var_m', itemId: 'item_1', values: { Tamanho: 'M', Marca: 'SuperSafety' }, stock: 4 },
      { id: 'var_g', itemId: 'item_1', values: { Tamanho: 'G', Marca: 'SuperSafety' }, stock: 2 },
    ]
  )

  assert.equal(suggestVariation('LUVA DE LATEX M SUPERSAFETY', 'PAR', choices)?.variationId, 'var_m')
  assert.equal(suggestVariation('LUVA DE LATEX SUPERSAFETY', 'PAR', choices), null)
  assert.equal(suggestVariation('ABAFADOR 26DB CONFORT PLUS - CAMPER - CA 48.054', 'PC', [
    { variationId: 'var_abafador', unit: 'PC', searchText: 'Abafador de ruídos Confort Plus Camper 48.054' },
    { variationId: 'var_protetor', unit: 'PC', searchText: 'Protetor auditivo Prevent 48.349' },
  ])?.variationId, 'var_abafador')
  assert.equal(normalizeImportText('Lúva  de  Látex'), 'luva de latex')
  assert.equal(isStockAdjustmentName('ACERTO DE ESTOQUE'), true)
})

test('busca manual encontra produto com palavras fora de ordem', () => {
  const choices = [
    { variationId: 'mixed', unit: 'PC', searchText: 'Arruela 1.1/4 Tramontina', label: 'Arruela · Medida: 1.1/4 · Marca: Tramontina' },
    { variationId: 'quarter', unit: 'PC', searchText: 'Arruela lisa 1/4 GE', label: 'Arruela lisa · Medida: 1/4 · Marca: GE' },
    { variationId: 'three_eighths', unit: 'PC', searchText: 'Arruela lisa 3/8 GE', label: 'Arruela lisa · Medida: 3/8 · Marca: GE' },
  ]

  assert.deepEqual(
    searchCatalogChoices('1/4 arru', choices, {
      sourceName: 'ARRUELA LISA 1/4 - GE',
      unit: 'PC',
    }).map(choice => choice.variationId),
    ['quarter', 'mixed']
  )
})

test('ex-funcionários são consolidados e ajustes não viram pessoas', () => {
  const former = buildFormerPeople([
    { type: 'saida', requestedBy: 'JOSE DONIZETE JONAS NASCIMENTO' },
    { type: 'saida', requestedBy: 'JOSÉ DONIZETI JONAS DO NASCIMENTO' },
    { type: 'saida', requestedBy: 'ACERTO DE ESTOQUE' },
  ], [], [])

  assert.equal(former.length, 1)
  assert.equal(former[0].aliases.length, 2)
})

test('datas vazias não viram 1970 e dias do Excel preservam a data em São Paulo', () => {
  const result = parseMovementWorkbookSheets([{ sheet: 'LANÇAR - ENTRADA', data: [
    ['DATA', 'ITEM', 'QTD'],
    [null, 'Sem data', 1],
    [new Date('2026-09-01T00:00:00Z'), 'Rolamento', 2],
    [null, null, null],
  ] }])
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].date, '2026-09-01T03:00:00.000Z')
  assert.equal(result.ignored.length, 1)
  assert.equal(result.ignored[0].reason, 'Data inválida')
})
