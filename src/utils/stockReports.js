export function buildDestinationAlerts(rows, destinations, getDestFullName) {
  const map = new Map()

  // Vínculos manuais continuam sendo controlados por variação específica.
  for (const row of rows.filter(r => r.status !== 'ok')) {
    for (const destinationId of row.variation.destinations || []) {
      addDestinationAlert(map, destinationId, row.status, row)
    }
  }

  // Regras amplas são agregadas por nível: uma marca zerada não alerta se outra variação cobre o conjunto.
  for (const destination of destinations) {
    for (const rule of destination.materialRules || []) {
      const ruleRows = rows.filter(row => itemMatchesDestinationRule(row.item, rule))
      if (!ruleRows.length) continue
      const status = aggregateRuleStatus(ruleRows)
      if (status === 'ok') continue
      addDestinationAlert(map, destination.id, status, {
        item: {
          name: ruleLabel(rule),
          group: rule.group,
          category: rule.category,
          subcategory: rule.subcategory,
        },
        variation: {
          stock: ruleRows.reduce((sum, row) => sum + Number(row.variation.stock || 0), 0),
        },
        status,
      })
    }
  }

  return [...map.values()]
    .map(dest => ({ ...dest, total: dest.zero + dest.critical + dest.alert }))
    .sort((a, b) =>
      b.zero - a.zero ||
      b.total - a.total ||
      String(a.label).localeCompare(String(b.label))
    )



function addDestinationAlert(map, destinationId, status, row) {
  const label = getDestFullName(destinationId)
  if (!label || status === 'ok') return
  const current = map.get(destinationId) || {
    id: destinationId,
    label,
    zero: 0,
    critical: 0,
    alert: 0,
    items: [],
  }
  current[status] += 1
  if (current.items.length < 3) current.items.push(row)
  map.set(destinationId, current)
}

function aggregateRuleStatus(ruleRows) {
  const totalStock = ruleRows.reduce((sum, row) => sum + Number(row.variation.stock || 0), 0)
  const totalMinimum = ruleRows.reduce((sum, row) => sum + Number(row.variation.minStock || row.item.minStock || 0), 0)
  if (totalStock <= 0) return 'zero'
  if (totalMinimum > 0 && totalStock <= totalMinimum * 0.5) return 'critical'
  if (totalMinimum > 0 && totalStock <= totalMinimum) return 'alert'
  return 'ok'
}

function itemMatchesDestinationRule(item, rule) {
  if (!item || !rule?.group || item.group !== rule.group) return false
  if (rule.category && item.category !== rule.category) return false
  if (rule.subcategory && item.subcategory !== rule.subcategory) return false
  return true
}

function ruleLabel(rule) {
  return [rule.group, rule.category, rule.subcategory].filter(Boolean).join(' / ')
}
}
