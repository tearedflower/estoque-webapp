import { ref, computed } from 'vue'
import * as api from '../services/api.js'

// Singleton state
const destinations = ref([])
const destinationOrder = ref([])
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

export function sortDestinationsByOrder(list, ids = []) {
  const order = new Map(ids.map((id, index) => [id, index]))
  return [...list].sort((a, b) =>
    (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
    collator.compare(a.name || '', b.name || '') ||
    String(a.id || '').localeCompare(String(b.id || ''))
  )
}

function sortDestinations(list) {
  return sortDestinationsByOrder(list, destinationOrder.value)
}

async function saveDestinationOrder(ids) {
  destinationOrder.value = ids
  const current = await api.getDisplayOrder()
  await api.saveDisplayOrder({ ...current, destinations: ids })
}

export function destinationMoveError(list, id, parentId) {
  const destination = list.find(d => d.id === id)
  if (!destination) return 'Destino não encontrado.'
  if (!parentId) return ''

  const byId = new Map(list.map(destination => [destination.id, destination]))
  const seen = new Set()
  let parent = byId.get(parentId)
  if (!parent) return 'Destino pai não encontrado.'
  while (parent) {
    if (parent.id === id) return 'Destino não pode ser movido para dentro dele mesmo ou de um descendente.'
    if (seen.has(parent.id)) return 'A hierarquia de destinos contém um ciclo.'
    seen.add(parent.id)
    parent = parent.parentId ? byId.get(parent.parentId) : null
  }
  return ''
}

export function destinationDescendants(list, parentId) {
  const result = []
  const byParent = new Map()
  for (const destination of list) {
    const children = byParent.get(destination.parentId) || []
    children.push(destination)
    byParent.set(destination.parentId, children)
  }
  const queue = [parentId]
  const seen = new Set(queue)
  while (queue.length) {
    const id = queue.shift()
    for (const destination of byParent.get(id) || []) {
      if (seen.has(destination.id)) continue
      seen.add(destination.id)
      result.push(destination)
      queue.push(destination.id)
    }
  }
  return result
}

export function useDestinations() {
  async function loadData() {
    const [list, order] = await Promise.all([api.getDestinations(), api.getDisplayOrder()])
    destinationOrder.value = Array.isArray(order?.destinations) ? order.destinations : []
    destinations.value = sortDestinations(list)
  }

  const activeDestinations = computed(() =>
    sortDestinations(destinations.value.filter(d => d.active))
  )

  const topLevelDestinations = computed(() =>
    sortDestinations(destinations.value.filter(d => !d.parentId))
  )

  const activeTopLevelDest = computed(() =>
    sortDestinations(destinations.value.filter(d => !d.parentId && d.active))
  )

  function getDestChildren(parentId) {
    return sortDestinations(destinations.value.filter(d => d.parentId === parentId))
  }

  function getActiveDestChildren(parentId) {
    return sortDestinations(destinations.value.filter(d => d.parentId === parentId && d.active))
  }

  function getDestDescendants(parentId, activeOnly = false) {
    return destinationDescendants(
      activeOnly ? destinations.value.filter(destination => destination.active) : destinations.value,
      parentId,
    )
  }

  function getDestFullName(idOrName) {
    if (!idOrName) return ''
    const byId = new Map(destinations.value.map(destination => [destination.id, destination]))
    let destination = byId.get(idOrName)
    if (!destination) return idOrName
    const names = []
    const seen = new Set()
    while (destination && !seen.has(destination.id)) {
      seen.add(destination.id)
      names.unshift(destination.name)
      destination = destination.parentId ? byId.get(destination.parentId) : null
    }
    return names.join(' > ')
  }

  const groupedDestinations = computed(() => {
    const result = []
    for (const p of activeTopLevelDest.value) {
      const children = getDestDescendants(p.id, true)
      result.push({ parent: p, children })
    }
    return result
  })

  async function addDestination(name, description = '', parentId = null) {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'Nome obrigatório.' }

    if (parentId) {
      const parent = destinations.value.find(d => d.id === parentId)
      if (!parent) return { ok: false, error: 'Destino pai não encontrado.' }
    }

    const siblings = destinations.value.filter(d => (d.parentId || null) === (parentId || null))
    if (siblings.some(d => d.name.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, error: 'Já existe um destino com esse nome neste nível.' }
    }

    const created = await api.createDestination({
      name: trimmed,
      description: description.trim(),
      active: true,
      parentId: parentId || null,
      materialRules: [],
    })
    destinations.value.push(created)
    destinations.value = sortDestinations(destinations.value)
    return { ok: true, destination: created }
  }

  async function editDestination(id, changes) {
    const d = destinations.value.find(d => d.id === id)
    if (!d) return { ok: false, error: 'Destino não encontrado.' }
    const nextParentId = changes.parentId !== undefined ? (changes.parentId || null) : (d.parentId || null)
    const moveError = destinationMoveError(destinations.value, id, nextParentId)
    if (moveError) return { ok: false, error: moveError }
    if (changes.name !== undefined || changes.parentId !== undefined) {
      const trimmed = (changes.name ?? d.name).trim()
      if (!trimmed) return { ok: false, error: 'Nome obrigatório.' }
      const siblings = destinations.value.filter(x => (x.parentId || null) === nextParentId)
      if (siblings.some(x => x.id !== id && x.name.toLowerCase() === trimmed.toLowerCase())) {
        return { ok: false, error: 'Já existe um destino com esse nome neste nível.' }
      }
    }
    const updated = await api.updateDestination(id, { ...d, materialRules: d.materialRules || [], ...changes })
    Object.assign(d, updated)
    destinations.value = sortDestinations(destinations.value)
    return { ok: true }
  }

  async function reorderDestinations(from, to) {
    const ordered = [...topLevelDestinations.value]
    const [destination] = ordered.splice(from, 1)
    if (!destination) return
    ordered.splice(to, 0, destination)
    await saveDestinationOrder(ordered.map(d => d.id))
    destinations.value = sortDestinations(destinations.value)
  }

  async function sortDestinationsAlphabetically() {
    const ordered = [...topLevelDestinations.value].sort((a, b) => collator.compare(a.name, b.name))
    await saveDestinationOrder(ordered.map(d => d.id))
    destinations.value = sortDestinations(destinations.value)
  }

  async function toggleDestinationActive(id) {
    const d = destinations.value.find(d => d.id === id)
    if (!d) return
    const updated = await api.updateDestination(id, { ...d, active: !d.active })
    Object.assign(d, updated)
  }

  async function deleteDestination(id) {
    const removedIds = new Set([id, ...getDestDescendants(id).map(destination => destination.id)])
    await api.deleteDestination(id)
    destinations.value = destinations.value.filter(destination => !removedIds.has(destination.id))
  }

  function getDestinationById(id) {
    return destinations.value.find(d => d.id === id) ?? null
  }

  function getDestinationName(id) {
    return destinations.value.find(d => d.id === id)?.name ?? id
  }

  return {
    destinations,
    loadData,
    activeDestinations,
    topLevelDestinations,
    activeTopLevelDest,
    groupedDestinations,
    getDestChildren,
    getActiveDestChildren,
    getDestDescendants,
    getDestFullName,
    addDestination,
    editDestination,
    reorderDestinations,
    sortDestinationsAlphabetically,
    toggleDestinationActive,
    deleteDestination,
    getDestinationById,
    getDestinationName,
  }
}
