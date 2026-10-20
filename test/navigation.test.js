import test from 'node:test'
import assert from 'node:assert/strict'
import { isPlainLinkClick, parseRoute, routeHref, routeIdentity } from '../src/utils/navigation.js'

test('navigation routes round-trip encoded filters and record ids', () => {
  assert.deepEqual(parseRoute(routeHref({ tab: 'relatorios' })), { tab: 'relatorios' })
  assert.deepEqual(parseRoute(routeHref({ tab: 'relatorios', subTab: 'estoque' })), { tab: 'relatorios', subTab: 'estoque' })
  const route = { tab: 'catalogo', group: 'Botas de Segurança', search: 'Composite/42', itemId: 'item 1', variationId: 'var&2' }
  assert.deepEqual(parseRoute(routeHref(route)), route)
  assert.equal(routeIdentity({ ...route, search: 'other', status: 'critical' }), routeIdentity(route))
  assert.equal(parseRoute('#/unknown'), null)
})

test('app links intercept only ordinary primary clicks', () => {
  const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false }
  assert.equal(isPlainLinkClick(plain), true)
  for (const key of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) assert.equal(isPlainLinkClick({ ...plain, [key]: true }), false)
  assert.equal(isPlainLinkClick({ ...plain, button: 1 }), false)
  assert.equal(isPlainLinkClick({ ...plain, defaultPrevented: true }), false)
})
