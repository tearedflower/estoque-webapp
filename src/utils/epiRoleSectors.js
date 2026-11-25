import { normalizeSearchText } from './globalSearch.js'

export function groupEpiRolesBySector(roles, search) {
  const query = normalizeSearchText(search)
  const groups = new Map()

  for (const role of roles) {
    const sector = role.sector?.trim() || ''
    if (query && !normalizeSearchText(sector).includes(query) && !normalizeSearchText(role.name).includes(query)) continue
    const key = normalizeSearchText(sector)
    if (!groups.has(key)) groups.set(key, { name: sector || 'Sem setor vinculado', roles: [] })
    groups.get(key).roles.push(role)
  }

  return [...groups]
    .sort(([keyA, a], [keyB, b]) => !keyA ? 1 : !keyB ? -1 : a.name.localeCompare(b.name, 'pt-BR'))
    .map(([, group]) => group)
}
