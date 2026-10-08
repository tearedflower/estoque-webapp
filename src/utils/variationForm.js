export function emptyVariationForm() {
  return { values: {}, stock: 0, minStock: null, extrasList: [], location: '', locations: [], destinations: [] }
}

export function variationFormForItem(item) {
  return {
    ...emptyVariationForm(),
    values: Object.fromEntries((item?.attributes || []).map(attribute => [attribute, ''])),
  }
}

export function variationFormForEdit(item, variation) {
  const locations = variation.locations?.length
    ? [...variation.locations]
    : [variation.location || item?.location].filter(Boolean)
  return {
    values: Object.fromEntries((item?.attributes || []).map(attribute => [attribute, variation.values?.[attribute] || ''])),
    stock: variation.stock,
    minStock: variation.minStock ?? null,
    extrasList: Object.entries(variation.extras || {}).map(([key, value]) => ({ key, value })),
    location: locations[0] || '',
    locations,
    destinations: [...(variation.destinations || [])],
  }
}

export function extrasListToObject(list) {
  return Object.fromEntries(
    list.map(({ key, value }) => [String(key || '').trim(), value || '']).filter(([key]) => key)
  )
}

export function validateVariationForm(item, form) {
  if ((item?.attributes?.length || 0) > 0 && !Object.values(form.values).some(value => String(value || '').trim())) {
    return 'Preencha ao menos um atributo.'
  }
  const stock = Number(form.stock)
  if (!Number.isFinite(stock)) return 'Quantidade deve ser um número válido.'
  if (stock < 0) return 'Quantidade não pode ser negativa.'
  return null
}

export function variationSetupIssues(item, variation) {
  const issues = []
  if (variation?.minStock === null || variation?.minStock === undefined || String(variation.minStock).trim() === '') issues.push('minStock')
  const hasLocation = (variation?.locations || []).some(value => String(value || '').trim()) ||
    String(variation?.location || item?.location || '').trim()
  if (!hasLocation) issues.push('location')
  if (!(variation?.destinations || []).some(Boolean)) issues.push('destination')
  return issues
}
