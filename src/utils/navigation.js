export const routeTabs = ['dashboard', 'relatorios', 'catalogo', 'inventario', 'movimentacoes', 'ordens', 'motores', 'cadastros', 'epis-admin']
const routeKeys = ['section', 'subTab', 'search', 'status', 'itemId', 'variationId', 'highlightVariationId', 'orderId', 'group', 'category', 'subcategory']

export function routeHref(target) {
  const route = typeof target === 'string' ? { tab: target } : target
  const tab = routeTabs.includes(route?.tab) ? route.tab : 'dashboard'
  const params = new URLSearchParams()
  for (const key of routeKeys) if (route?.[key]) params.set(key, route[key])
  return `#/${tab}${params.size ? `?${params}` : ''}`
}

export function parseRoute(hash) {
  const [path, query = ''] = String(hash || '').replace(/^#\/?/, '').split('?')
  if (!routeTabs.includes(path)) return null
  const params = new URLSearchParams(query)
  return { tab: path, ...Object.fromEntries(routeKeys.filter(key => params.has(key)).map(key => [key, params.get(key)])) }
}

export function isPlainLinkClick(event) {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !event.defaultPrevented
}

export function routeIdentity(route) {
  return routeHref(Object.fromEntries(Object.entries(route || {}).filter(([key]) => !['search', 'status'].includes(key))))
}
