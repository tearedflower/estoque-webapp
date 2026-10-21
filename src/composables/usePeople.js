import { ref, computed } from 'vue'
import * as api from '../services/api.js'
import { formatPersonName, formatRoleName } from '../utils/nameFormat.js'

export { formatPersonName, formatRoleName }

// Singleton state
const people = ref([])
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

function sortByName(list) {
  return [...list].sort((a, b) =>
    collator.compare(a.name || '', b.name || '') ||
    String(a.id || '').localeCompare(String(b.id || ''))
  )
}

export const PERSON_STATUSES = [
  { id: 'ativo', label: 'Ativo' },
  { id: 'inativo', label: 'Inativo' },
  { id: 'demitido', label: 'Demitido' },
  { id: 'afastado', label: 'Afastado' },
]

export function personStatusLabel(status) {
  return PERSON_STATUSES.find(row => row.id === status)?.label || 'Inativo'
}

export function usePeople() {
  async function loadData() {
    people.value = sortByName((await api.getPeople()).map(person => ({
      ...person,
      name: formatPersonName(person.name),
      role: formatRoleName(person.role),
    })))
  }

  const activePeople = computed(() =>
    sortByName(people.value.filter(p => p.active && (p.status || 'ativo') === 'ativo'))
  )

  async function addPerson(name, role = '', status = 'ativo', registration = '') {
    const trimmed = formatPersonName(name)
    if (!trimmed) return { ok: false, error: 'Nome obrigatório.' }
    if (people.value.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, error: 'Já existe uma pessoa com esse nome.' }
    }
    const created = await api.createPerson({
      name: trimmed,
      role: formatRoleName(role),
      registration: String(registration || '').trim(),
      status,
      active: status === 'ativo',
    })
    people.value.push(created)
    people.value = sortByName(people.value)
    return { ok: true, person: created }
  }

  async function editPerson(id, changes) {
    const p = people.value.find(p => p.id === id)
    if (!p) return { ok: false, error: 'Pessoa não encontrada.' }
    if (changes.name !== undefined) {
      const trimmed = formatPersonName(changes.name)
      if (!trimmed) return { ok: false, error: 'Nome obrigatório.' }
      if (people.value.some(x => x.id !== id && x.name.toLowerCase() === trimmed.toLowerCase())) {
        return { ok: false, error: 'Já existe uma pessoa com esse nome.' }
      }
    }
    const updated = await api.updatePerson(id, {
      ...p,
      ...changes,
      name: changes.name === undefined ? p.name : formatPersonName(changes.name),
      role: changes.role === undefined ? p.role : formatRoleName(changes.role),
    })
    Object.assign(p, updated)
    people.value = sortByName(people.value)
    return { ok: true }
  }

  async function togglePersonActive(id) {
    const p = people.value.find(p => p.id === id)
    if (!p) return
    const status = p.active ? 'inativo' : 'ativo'
    const updated = await api.updatePerson(id, { ...p, active: status === 'ativo', status })
    Object.assign(p, updated)
  }

  async function deletePerson(id) {
    await api.deletePerson(id)
    people.value = people.value.filter(p => p.id !== id)
  }

  function getPersonById(id) {
    return people.value.find(p => p.id === id) ?? null
  }

  function getPersonName(id) {
    return people.value.find(p => p.id === id)?.name ?? id
  }

  return {
    people,
    loadData,
    clearData: () => { people.value = [] },
    activePeople,
    personStatusLabel,
    addPerson,
    editPerson,
    togglePersonActive,
    deletePerson,
    getPersonById,
    getPersonName,
  }
}
