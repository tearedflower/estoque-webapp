const EMPTY_MARKERS = new Set(['', '-', '—', 'N/A'])

export function normalizeImportText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function cleanCell(value) {
  const text = String(value ?? '').trim()
  return EMPTY_MARKERS.has(text.toUpperCase()) ? '' : text
}

function numberCell(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value).includes(',')
      ? String(value).replace(/\./g, '').replace(',', '.')
      : String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function dateCell(value) {
  if (value === null || value === undefined || String(value).trim() === '') return ''
  const parsed = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(parsed.getTime())) return ''
  const iso = parsed.toISOString()
  // Excel encodes calendar days as UTC midnight. The almoxarifado operates in Sao Paulo (UTC-3).
  return iso.endsWith('T00:00:00.000Z') ? `${iso.slice(0, 10)}T03:00:00.000Z` : iso
}

function indexHeaders(row = []) {
  return new Map(row.map((value, index) => [normalizeImportText(value), index]))
}

function cell(row, headers, ...names) {
  for (const name of names) {
    const index = headers.get(normalizeImportText(name))
    if (index !== undefined) return row[index]
  }
  return null
}

function findSheet(sheets, wanted) {
  const key = normalizeImportText(wanted)
  return sheets.find(sheet => normalizeImportText(sheet.sheet) === key)?.data || []
}

function parseMovementSheet(rows, type) {
  if (!rows.length) return { rows: [], ignored: [] }
  const headers = indexHeaders(rows[0])
  const parsed = []
  const ignored = []

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2
    const sourceName = cleanCell(cell(row, headers, 'ITEM'))
    const qty = numberCell(cell(row, headers, 'QTD'))
    const date = dateCell(cell(row, headers, 'DATA'))
    const reason = !sourceName ? 'Produto sem nome'
      : !date ? 'Data inválida'
        : !(qty > 0) ? 'Quantidade vazia, zero ou negativa'
          : ''

    if (reason) {
      if (sourceName || qty !== null || date) ignored.push({ type, rowNumber, sourceName, sourceCode: cleanCell(cell(row, headers, 'COD PROD')), qty, reason })
      return
    }

    parsed.push({
      type,
      rowNumber,
      sourceName,
      qty,
      date,
      unit: cleanCell(cell(row, headers, 'UNIDADE')),
      supplier: type === 'entrada' ? cleanCell(cell(row, headers, 'FORNECEDOR')) : '',
      unitCost: type === 'entrada' ? numberCell(cell(row, headers, 'VALOR UNI.', 'VALOR UNITÁRIO')) : null,
      docRef: type === 'entrada' ? cleanCell(cell(row, headers, 'NF')) : '',
      requestedBy: type === 'saida' ? cleanCell(cell(row, headers, 'REQUISITANTE')) : '',
      destination: type === 'saida' ? cleanCell(cell(row, headers, 'LOCAL DE APLICAÇÃO')) : '',
      operator: type === 'saida' ? cleanCell(cell(row, headers, 'OPERADOR')) : '',
    })
  })

  return { rows: parsed, ignored }
}

function parseStockSheet(rows) {
  if (!rows.length) return []
  const headers = indexHeaders(rows[0])
  return rows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    sourceName: cleanCell(cell(row, headers, 'ITEM')),
    stock: numberCell(cell(row, headers, 'QTD TOTAL')),
    unit: cleanCell(cell(row, headers, 'UNIDADE')),
  })).filter(row => row.sourceName && row.stock !== null)
}

function parsePeopleSheet(rows) {
  const people = new Map()
  if (!rows.length) return []
  const headers = indexHeaders(rows[0])

  const add = (name, role = '', registration = '') => {
    const cleanName = cleanCell(name)
    const key = normalizeImportText(cleanName)
    if (!key || key.includes('acerto estoque')) return
    const current = people.get(key)
    people.set(key, {
      name: current?.name || cleanName,
      role: current?.role || cleanCell(role),
      registration: current?.registration || cleanCell(registration),
    })
  }

  rows.slice(1).forEach(row => {
    add(
      cell(row, headers, 'NOME'),
      cell(row, headers, 'CARGO'),
      cell(row, headers, 'N° MAT.', 'N MAT.')
    )
    add(
      cell(row, headers, 'NOMES (ALFABÉTICA)'),
      cell(row, headers, 'CARGOS (ALFABÉTICA)')
    )
  })

  return [...people.values()]
}

function importNameSignature(value) {
  return [...new Set(normalizeImportText(value).split(' ').filter(Boolean))].sort().join('|')
}

function parseMinimumStockSheet(rows) {
  if (!rows.length) return []
  const headers = indexHeaders(rows[0])

  return rows.slice(1).flatMap((row, index) => {
    const sourceName = cleanCell(cell(row, headers, 'NOME C/ ATRIBUTOS')) ||
      cleanCell(cell(row, headers, 'NOMEITEM'))
    if (!sourceName) return []

    const baseName = cleanCell(cell(row, headers, 'NOMEITEM'))
    const rawMinimum = cell(row, headers, 'QTD MÍNIMA', 'QTD MINIMA')
    if (rawMinimum === null || rawMinimum === undefined || String(rawMinimum).trim() === '') {
      return [{ rowNumber: index + 2, sourceName, baseName, minStock: null, status: 'blank' }]
    }

    const minStock = numberCell(rawMinimum)
    if (minStock === null || minStock < 0) {
      return [{
        rowNumber: index + 2,
        sourceName,
        baseName,
        minStock: null,
        status: 'invalid',
        rawMinimum,
        reason: 'Quantidade mínima deve ser zero ou positiva',
      }]
    }

    return [{ rowNumber: index + 2, sourceName, baseName, minStock, status: 'valid' }]
  })
}

export function matchMinimumStocks(movementRows, minimumRows) {
  const exact = new Map()
  const bySignature = new Map()
  for (const row of minimumRows) {
    for (const name of [row.sourceName, row.baseName]) {
      const key = normalizeImportText(name)
      if (key && !exact.has(key)) exact.set(key, row)
      const signature = importNameSignature(name)
      if (!signature) continue
      const matches = bySignature.get(signature) || []
      if (!matches.includes(row)) matches.push(row)
      bySignature.set(signature, matches)
    }
  }

  const sources = new Map()
  for (const row of movementRows) {
    const key = normalizeImportText(row.sourceName)
    if (key && !sources.has(key)) sources.set(key, row.sourceName)
  }

  return [...sources].map(([key, sourceName]) => {
    const signatureMatches = bySignature.get(importNameSignature(sourceName)) || []
    const minimum = exact.get(key) || (signatureMatches.length === 1 ? signatureMatches[0] : null)
    return minimum
      ? { ...minimum, sourceName }
      : { sourceName, minStock: null, status: 'missing', reason: 'Produto não encontrado em CADASTROS' }
  })
}

export function parseMovementWorkbookSheets(sheets) {
  const entries = parseMovementSheet(findSheet(sheets, 'LANÇAR - ENTRADA'), 'entrada')
  const exits = parseMovementSheet(findSheet(sheets, 'LANÇAR - SAÍDA'), 'saida')
  const rows = [...entries.rows, ...exits.rows]
  if (!rows.length) throw new Error('A planilha não contém entradas ou saídas válidas.')
  const minimumRows = parseMinimumStockSheet(findSheet(sheets, 'CADASTROS'))

  return {
    rows,
    ignored: [...entries.ignored, ...exits.ignored],
    stockRows: parseStockSheet(findSheet(sheets, 'ESTOQUE')),
    people: parsePeopleSheet(findSheet(sheets, 'Nomes e Cargos')),
    minimumRows,
    minimumMatches: matchMinimumStocks(rows, minimumRows),
  }
}

function catalogTokens(value) {
  return new Set(normalizeImportText(value).split(' ').filter(Boolean))
}

function tokenScore(source, candidate) {
  const sourceTokens = catalogTokens(source)
  const candidateTokens = catalogTokens(candidate)
  let intersection = 0
  for (const token of candidateTokens) if (sourceTokens.has(token)) intersection += 1
  const coverage = intersection / Math.max(1, candidateTokens.size)
  const precision = intersection / Math.max(1, sourceTokens.size)
  const exact = normalizeImportText(source) === normalizeImportText(candidate) ? 1 : 0
  return exact || (coverage * 0.72 + precision * 0.28)
}

export function buildCatalogChoices(items, variations) {
  const itemById = new Map(items.map(item => [item.id, item]))
  return variations.map(variation => {
    const item = itemById.get(variation.itemId)
    if (!item) return null
    const variationDetails = { ...(variation.values || {}), ...(variation.extras || {}) }
    const details = Object.entries(variationDetails)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' · ')
    const hierarchy = [item.group, item.category, item.subcategory].filter(Boolean).join(' › ')
    const identity = details ? `${item.name} · ${details}` : item.name
    const label = hierarchy ? `${identity} — ${hierarchy}` : identity
    return {
      variationId: variation.id,
      itemId: item.id,
      label,
      unit: item.unit || '',
      stock: Number(variation.stock || 0),
      searchText: [item.name, ...Object.values(variationDetails)].filter(Boolean).join(' '),
    }
  }).filter(Boolean).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base', numeric: true }))
}

export function rankVariationChoices(sourceName, unit, choices) {
  return choices.map(choice => ({
    choice,
    score: tokenScore(sourceName, choice.searchText) + (
      unit && normalizeImportText(unit) === normalizeImportText(choice.unit) ? 0.03 : 0
    ),
  })).sort((a, b) => b.score - a.score)
}

export function searchCatalogChoices(query, choices, { sourceName = '', unit = '', limit = 6 } = {}) {
  const terms = normalizeImportText(query).split(' ').filter(Boolean)
  if (!terms.length) return []
  const matches = choices.filter(choice => {
    const tokens = normalizeImportText(choice.label).split(' ').filter(Boolean)
    return terms.every(term => tokens.some(token =>
      /^\d+$/.test(term) ? token === term : token.startsWith(term)
    ))
  })
  if (sourceName) {
    const scoreById = new Map(rankVariationChoices(sourceName, unit, choices)
      .map(result => [result.choice.variationId, result.score]))
    matches.sort((a, b) => (scoreById.get(b.variationId) || 0) - (scoreById.get(a.variationId) || 0))
  }
  return matches.slice(0, limit)
}

export function suggestVariation(sourceName, unit, choices) {
  const ranked = rankVariationChoices(sourceName, unit, choices)
  const first = ranked[0]
  const second = ranked[1]
  if (!first || first.score < 0.75 || first.score - (second?.score || 0) < 0.12) return null
  return first.choice
}

export function isStockAdjustmentName(value) {
  const normalized = normalizeImportText(value)
  return normalized === 'acerto estoque' || normalized === 'acerto de estoque'
}

function likelySamePerson(a, b) {
  const left = normalizeImportText(a).split(' ')
  const right = normalizeImportText(b).split(' ')
  if (left[0] !== right[0] || left.at(-1) !== right.at(-1)) return false
  const rightSet = new Set(right)
  const shared = left.filter(token => rightSet.has(token)).length
  return shared / Math.max(left.length, right.length) >= 0.6
}

export function buildFormerPeople(rows, existingPeople, workbookPeople) {
  const existing = new Set(existingPeople.map(person => normalizeImportText(person.name)))
  const workbookByName = new Map(workbookPeople.map(person => [normalizeImportText(person.name), person]))
  const uniqueNames = new Map()
  for (const row of rows) {
    const name = String(row.requestedBy || '').trim().replace(/^["']+|["']+$/g, '')
    const key = normalizeImportText(name)
    if (row.type === 'saida' && key && !isStockAdjustmentName(name) && !existing.has(key) && !uniqueNames.has(key)) {
      uniqueNames.set(key, name)
    }
  }
  const names = [...uniqueNames.values()]

  const groups = []
  for (const name of names) {
    const group = groups.find(candidate => candidate.aliases.some(alias => likelySamePerson(alias, name)))
    if (group) group.aliases.push(name)
    else groups.push({ aliases: [name] })
  }

  return groups.map(group => {
    const canonical = [...group.aliases].sort((a, b) => b.length - a.length)[0]
    const workbookPerson = group.aliases.map(alias => workbookByName.get(normalizeImportText(alias))).find(Boolean)
    return {
      name: workbookPerson?.name || canonical,
      role: workbookPerson?.role || '',
      registration: workbookPerson?.registration || '',
      aliases: group.aliases,
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
}
