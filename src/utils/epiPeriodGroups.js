const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

export function epiPeriodGroups(rules, items) {
  const itemById = new Map(items.map(item => [item.id, item]))
  const groups = new Map()
  for (const rule of rules) {
    const key = JSON.stringify([rule.targetType, rule.targetKey])
    if (!groups.has(key)) {
      const item = rule.targetType === 'item' ? itemById.get(rule.targetKey) : null
      groups.set(key, { key, name: item?.name || rule.targetLabel || rule.targetKey,
        category: item?.category || '', unit: item?.unit || '', rules: [] })
    }
    groups.get(key).rules.push(rule)
  }
  return [...groups.values()].map(group => {
    const counts = new Map()
    for (const rule of group.rules) counts.set(rule.days, (counts.get(rule.days) || 0) + 1)
    const periods = [...counts].map(([days, count]) => ({ days, count })).sort((a, b) => b.count - a.count || a.days - b.days)
    const quantities = [...new Set(group.rules.map(rule => rule.quantity || 1))].sort((a, b) => a - b)
    return { ...group, quantities, activeCount: group.rules.filter(rule => rule.active).length,
      inactiveCount: group.rules.filter(rule => !rule.active).length,
      rules: [...group.rules].sort((a, b) => collator.compare(a.roleName, b.roleName)),
      periods, different: periods.length > 1,
      majorityDays: periods[0].count > group.rules.length / 2 ? periods[0].days : null }
  }).sort((a, b) => collator.compare(a.name, b.name))
}
