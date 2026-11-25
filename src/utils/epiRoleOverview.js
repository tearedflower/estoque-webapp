import { roleNameKey } from './nameFormat.js'

export function epiRoleOverview(roles, rules, items, people) {
  const groups = new Map(roles.map(role => [roleNameKey(role.name), { key: roleNameKey(role.name), name: role.name, rules: [], people: 0 }]))
  const itemById = new Map(items.map(item => [item.id, item]))
  for (const rule of rules) {
    const key = roleNameKey(rule.roleName)
    if (!groups.has(key)) groups.set(key, { key, name: rule.roleName, rules: [], people: 0 })
    const item = rule.targetType === 'item' ? itemById.get(rule.targetKey) : null
    groups.get(key).rules.push({ ...rule, name: item?.name || rule.targetLabel || rule.targetKey, unit: item?.unit || '' })
  }
  for (const person of people) {
    if ((person.status ? person.status === 'ativo' : person.active) && groups.has(roleNameKey(person.role))) groups.get(roleNameKey(person.role)).people++
  }
  return [...groups.values()].map(group => {
    const active = group.rules.filter(rule => rule.active)
    return { ...group, activeCount: active.length, inactiveCount: group.rules.length - active.length,
      withoutPeriod: active.filter(rule => Number(rule.days) === 0).length,
      withoutReason: active.filter(rule => !String(rule.usageReason || '').trim()).length,
      rules: group.rules.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR')) }
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}
