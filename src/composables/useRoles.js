import { ref, computed } from 'vue'
import * as api from '../services/api.js'
import { formatRoleName } from './usePeople.js'
import { roleNameKey } from '../utils/nameFormat.js'

// Singleton state
const roles = ref([])
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

function sortByName(list) {
  return [...list].sort((a, b) =>
    collator.compare(a.name || '', b.name || '') ||
    String(a.id || '').localeCompare(String(b.id || ''))
  )
}

export function useRoles() {
  async function loadData() {
    roles.value = sortByName((await api.getRoles()).map(role => ({
      ...role,
      name: formatRoleName(role.name),
    })))
  }

  const activeRoles = computed(() =>
    sortByName(roles.value.filter(r => r.active))
  )

  async function addRole(name, description = '') {
    const trimmed = formatRoleName(name)
    if (!trimmed) return { ok: false, error: 'Nome obrigatório.' }
    if (roles.value.some(r => roleNameKey(r.name) === roleNameKey(trimmed))) {
      return { ok: false, error: 'Já existe um cargo com esse nome.' }
    }
    const created = await api.createRole({
      name: trimmed,
      description: description.trim(),
      active: true,
    })
    roles.value.push(created)
    roles.value = sortByName(roles.value)
    return { ok: true, role: created }
  }

  async function editRole(id, changes) {
    const r = roles.value.find(r => r.id === id)
    if (!r) return { ok: false, error: 'Cargo não encontrado.' }
    if (changes.name !== undefined) {
      const trimmed = formatRoleName(changes.name)
      if (!trimmed) return { ok: false, error: 'Nome obrigatório.' }
      if (roles.value.some(x => x.id !== id && roleNameKey(x.name) === roleNameKey(trimmed))) {
        return { ok: false, error: 'Já existe um cargo com esse nome.' }
      }
    }
    const updated = await api.updateRole(id, {
      ...r,
      ...changes,
      name: changes.name === undefined ? r.name : formatRoleName(changes.name),
    })
    Object.assign(r, updated)
    roles.value = sortByName(roles.value)
    return { ok: true }
  }

  async function toggleRoleActive(id) {
    const r = roles.value.find(r => r.id === id)
    if (!r) return
    const updated = await api.updateRole(id, { ...r, active: !r.active })
    Object.assign(r, updated)
  }

  async function deleteRole(id) {
    await api.deleteRole(id)
    roles.value = roles.value.filter(r => r.id !== id)
  }

  return {
    roles,
    loadData,
    activeRoles,
    addRole,
    editRole,
    toggleRoleActive,
    deleteRole,
  }
}
