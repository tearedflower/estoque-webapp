export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u203a\u00bb]/g, '>')
    .toLowerCase()
    .trim()
}

export function searchTokens(value) {
  return normalizeSearchText(value).split(/[^a-z0-9]+/).filter(Boolean)
}

export function filterPeopleByName(people, query) {
  const tokens = searchTokens(query)
  return people.filter(person => matchesSearchTokens(person.name, tokens))
}

export function matchesSearchTokens(value, tokens) {
  const normalized = normalizeSearchText(value)
  return tokens.every(token => normalized.includes(token))
}

export function filterDestinations(destinations, query) {
  const normalizedQuery = normalizeSearchText(query.trim())
  if (!normalizedQuery) return destinations.filter(destination => !destination.parentId)
  return destinations.filter(destination =>
    matches([destination.name, destination.description], normalizedQuery)
  )
}

export function findExactDestination(destinations, query) {
  const normalizedQuery = normalizeSearchText(query.trim())
  if (!normalizedQuery) return null
  const exact = destinations.filter(destination => normalizeSearchText(destination.name) === normalizedQuery)
  return exact.length === 1 ? exact[0] : null
}

function matches(parts, query) {
  return normalizeSearchText(parts.filter(Boolean).join(' ')).includes(query)
}

function variationLabel(item, variation) {
  const attributes = Object.entries({ ...(variation.values || {}), ...(variation.extras || {}) })
    .map(([key, value]) => `${key}: ${value}`)
    .join(' / ')
  return attributes ? `${item.name} - ${attributes}` : item.name
}

export function buildGlobalSearchResults({
  query,
  commands = [],
  recentIds = [],
  workOrders = [],
  motors = [],
  people = [],
  destinations = [],
  items = [],
  variations = [],
  getDestinationName = () => '',
}) {
  const normalizedQuery = normalizeSearchText(query.trim())
  const groups = []

  groups.push(commands.filter(command =>
    matches([command.title, command.subtitle, command.keywords], normalizedQuery)
  ))

  const orderResults = []

  for (const order of workOrders) {
    if (!matches([order.number, order.title, order.requestedBy, order.equipment, order.destinationName, order.motorTag], normalizedQuery)) continue
    orderResults.push({
      id: `os:${order.id}`,
      type: 'OS',
      title: `OS #${order.number}`,
      subtitle: order.title || order.equipment || order.destinationName || 'Ordem de servico',
      target: { tab: 'ordens', subTab: 'ordens', orderId: order.id },
    })
  }
  groups.push(orderResults)

  const motorResults = []
  for (const motor of motors) {
    if (!matches([motor.tag, motor.name, motor.model, motor.locationName, motor.status], normalizedQuery)) continue
    motorResults.push({
      id: `motor:${motor.id}`,
      type: 'Motor',
      title: motor.tag || motor.name || 'Motor',
      subtitle: [motor.name, motor.locationName, motor.status].filter(Boolean).join(' - '),
      target: { tab: 'motores' },
    })
  }
  groups.push(motorResults)

  const peopleResults = []
  for (const person of people) {
    if (!matches([person.name, person.role], normalizedQuery)) continue
    peopleResults.push({
      id: `pessoa:${person.id}`,
      type: 'Pessoa',
      title: person.name,
      subtitle: person.role || 'Cadastro de pessoa',
      target: { tab: 'cadastros', subTab: 'pessoas', requiresAdmin: true },
    })
  }
  groups.push(peopleResults)

  const destinationResults = []
  for (const destination of destinations) {
    const fullName = getDestinationName(destination.id)
    if (!matches([destination.name, fullName, destination.description], normalizedQuery)) continue
    destinationResults.push({
      id: `destino:${destination.id}`,
      type: 'Destino',
      title: fullName || destination.name,
      subtitle: 'Cadastro de destinos',
      target: { tab: 'cadastros', subTab: 'destinos', requiresAdmin: true },
    })
  }
  groups.push(destinationResults)

  const itemResults = []
  for (const item of items) {
    if (!matches([item.name, item.group, item.category, item.subcategory], normalizedQuery)) continue
    itemResults.push({
      id: `item:${item.id}`,
      type: 'Item',
      title: item.name,
      subtitle: [item.group, item.category, item.subcategory].filter(Boolean).join(' > '),
      target: { tab: 'catalogo', itemId: item.id, search: item.name },
    })
  }
  groups.push(itemResults)

  const variationResults = []
  for (const variation of variations) {
    // ponytail: linear lookup is enough here; index items by id if search profiling says otherwise.
    const item = items.find(row => row.id === variation.itemId)
    if (!item) continue
    const label = variationLabel(item, variation)
    if (!matches([label, variation.location], normalizedQuery)) continue
    variationResults.push({
      id: `var:${variation.id}`,
      type: 'Variacao',
      title: label,
      subtitle: `Estoque: ${variation.stock ?? 0} ${item.unit || 'un'}`,
      target: { tab: 'catalogo', itemId: item.id, variationId: variation.id, search: item.name },
    })
  }
  groups.push(variationResults)

  if (!normalizedQuery) {
    const byId = new Map(groups.flat().map(result => [result.id, result]))
    const recent = recentIds.map(id => byId.get(id)).filter(Boolean)
    return [...new Map([...groups[0].slice(0, 6), ...recent].map(result => [result.id, result])).values()].slice(0, 12)
  }

  const results = []
  for (let index = 0; results.length < 12 && groups.some(group => index < group.length); index += 1) {
    for (const group of groups) {
      if (group[index]) results.push(group[index])
      if (results.length >= 12) break
    }
  }
  return results
}
