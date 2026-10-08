import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'
import { getPhotoBatches } from '../src/services/api.js'
import {
  buildPhotoMovementLine,
  canDeletePhotoBatch,
  canEditPhotoBatch,
  effectivePhotoFields,
  displayPhotoUnitCost,
  findExactPhotoMatch,
  maskPhotoUnitCost,
  parsePhotoUnitCost,
  photoBatchBlockReason,
  photoCatalogDraft,
  photoBatchExpired,
} from '../src/utils/photoMovement.js'
import { isPhotoStorageQuotaError, photoSyncWarning, toPhotoStorageRecord } from '../src/services/photoMovementDrafts.js'

const items = [
  { id: 'item_1', group: 'EPI', category: 'Luvas', subcategory: 'Nitrílica', name: 'Luva de proteção', unit: 'PAR' },
  { id: 'item_2', group: 'EPI', category: 'Calçados', subcategory: '', name: 'Bota de PVC', unit: 'PAR' },
]

const variations = [
  { id: 'var_1', itemId: 'item_1', values: { Tamanho: 'M', Cor: 'Azul' }, extras: {}, stock: 5 },
  { id: 'var_2', itemId: 'item_1', values: { Tamanho: 'G', Cor: 'Azul' }, extras: {}, stock: 8 },
  { id: 'var_3', itemId: 'item_2', values: { Tamanho: '40' }, extras: {}, stock: 2 },
]

function suggestion(overrides = {}) {
  return {
    identified: true,
    group: 'EPI',
    category: 'Luvas',
    subcategory: 'Nitrílica',
    name: 'Luva de proteção',
    attributes: [
      { name: 'Tamanho', value: 'M' },
      { name: 'Cor', value: 'Azul' },
    ],
    ...overrides,
  }
}

test('preselects only one exact item and variation', () => {
  const match = findExactPhotoMatch(suggestion(), items, variations)
  assert.equal(match.item.id, 'item_1')
  assert.equal(match.variation.id, 'var_1')
})

test('keeps variation open when the image only identifies the item', () => {
  const match = findExactPhotoMatch(suggestion({ attributes: [] }), items, variations)
  assert.equal(match.item.id, 'item_1')
  assert.equal(match.variation, null)
})

test('does not silently select ambiguous or approximate matches', () => {
  const ambiguous = findExactPhotoMatch(suggestion({ attributes: [{ name: 'Cor', value: 'Azul' }] }), items, variations)
  assert.equal(ambiguous.item.id, 'item_1')
  assert.equal(ambiguous.variation, null)

  const approximate = findExactPhotoMatch(suggestion({ name: 'Luva proteção azul' }), items, variations)
  assert.equal(approximate.item, null)
  assert.equal(approximate.variation, null)
})

test('matches known attributes while ignoring an uncatalogued package weight', () => {
  const adhesiveItems = [{
    id: 'item_adhesive',
    group: 'Materiais de Consumo',
    category: 'Adesivos',
    subcategory: '',
    name: 'Adesivo Anaeróbico',
  }]
  const adhesiveVariations = [
    { id: 'var_115', itemId: 'item_adhesive', values: { Modelo: '115', Cor: 'Azul', Marca: 'Tekbond' } },
    { id: 'var_120', itemId: 'item_adhesive', values: { Modelo: '120', Cor: 'Vermelho', Marca: 'Tekbond' } },
  ]
  const match = findExactPhotoMatch({
    group: 'Materiais de Consumo',
    category: 'Adesivos',
    subcategory: 'Adesivo Anaeróbico',
    name: 'Adesivo Anaeróbico',
    attributes: [
      { name: 'Modelo', value: '120' },
      { name: 'Marca', value: 'Tekbond' },
      { name: 'Peso Líquido', value: '10g' },
    ],
  }, adhesiveItems, adhesiveVariations)

  assert.equal(match.item.id, 'item_adhesive')
  assert.equal(match.variation.id, 'var_120')

  const unknownOnly = findExactPhotoMatch({
    ...suggestion(),
    attributes: [{ name: 'Peso Líquido', value: '10g' }],
  }, items, variations)
  assert.equal(unknownOnly.item.id, 'item_1')
  assert.equal(unknownOnly.variation, null)
})

test('merges batch defaults and per-photo overrides into the movement line', () => {
  const batch = { type: 'saida', defaults: { requestedBy: 'Maria', requestedByPersonId: 'person_1', destination: 'Fábrica', destinationId: 'dest_1', note: 'Padrão' } }
  const photo = { itemId: 'item_1', variationId: 'var_1', qty: 2, useOverrides: true, overrides: { ...batch.defaults, destination: 'Oficina', destinationId: 'dest_2', note: 'Urgente' } }
  assert.equal(effectivePhotoFields(batch, photo).destinationId, 'dest_2')
  assert.deepEqual(buildPhotoMovementLine(batch, photo, items[0], variations[0]), {
    variationId: 'var_1',
    itemId: 'item_1',
    itemName: 'Luva de proteção',
    itemGroup: 'EPI',
    itemCategory: 'Luvas',
    itemSubcategory: 'Nitrílica',
    itemUnit: 'PAR',
    variationValues: { Tamanho: 'M', Cor: 'Azul' },
    variationExtras: {},
    qty: 2,
    requestedBy: 'Maria',
    requestedByPersonId: 'person_1',
    destination: 'Oficina',
    destinationId: 'dest_2',
    destinationOther: false,
    note: 'Urgente',
  })
})

test('blocks repeated exits that exceed the accumulated available stock', () => {
  const batch = { type: 'saida', defaults: { requestedBy: 'Maria', requestedByPersonId: 'person_1', destination: 'Fábrica', destinationId: 'dest_1' } }
  const photos = [
    { itemId: 'item_1', variationId: 'var_1', qty: 3 },
    { itemId: 'item_1', variationId: 'var_1', qty: 3 },
  ]
  assert.match(photoBatchBlockReason(batch, photos, items, variations), /excede o saldo/i)
  photos[1].qty = 2
  assert.equal(photoBatchBlockReason(batch, photos, items, variations), '')
})

test('expires only completed batches after 30 days', () => {
  const now = Date.parse('2026-07-14T12:00:00Z')
  assert.equal(photoBatchExpired({ status: 'completed', expiresAt: '2026-07-14T11:59:59Z' }, now), true)
  assert.equal(photoBatchExpired({ status: 'pending', expiresAt: '2026-07-14T11:59:59Z' }, now), false)
  assert.equal(photoBatchExpired({ status: 'completed', expiresAt: '2026-07-15T00:00:00Z' }, now), false)
})

test('recognizes browser storage quota errors', () => {
  assert.equal(isPhotoStorageQuotaError({ name: 'QuotaExceededError' }), true)
  assert.equal(isPhotoStorageQuotaError(new Error('storage quota exceeded')), true)
  assert.equal(isPhotoStorageQuotaError(new Error('offline')), false)
})

test('distinguishes network, session and outdated server sync failures', () => {
  assert.match(photoSyncWarning(new TypeError('Failed to fetch')), /sem conexão/i)
  assert.match(photoSyncWarning({ status: 401 }), /sessão/i)
  assert.match(photoSyncWarning({ status: 404 }), /atualize o servidor/i)
})

test('reuses the Gemini suggestion when cataloging and moving a new item', () => {
  const catalog = photoCatalogDraft(suggestion({ unit: 'PAR', industrialSupply: false }))
  catalog.initialStock = 4
  const batch = { type: 'entrada', defaults: { supplier: '', docRef: 'NF 1', note: 'Implantação' } }
  const photo = { createCatalog: true, catalog, status: 'matched', qty: 2, unitCost: '12,50' }

  assert.deepEqual(buildPhotoMovementLine(batch, photo), {
    newCatalog: catalog,
    qty: 2,
    supplier: '',
    unitCost: 12.5,
    docRef: 'NF 1',
    note: 'Implantação',
  })
  assert.equal(photoBatchBlockReason(batch, [photo], items, variations), '')
})

test('defers a new-item exit balance check to the mandatory physical count', () => {
  const batch = { type: 'saida', defaults: { requestedBy: 'Maria', requestedByPersonId: 'person_1', destination: 'Fábrica', destinationId: 'dest_1' } }
  const photo = { createCatalog: true, catalog: { ...photoCatalogDraft(suggestion()), initialStock: 2 }, status: 'matched', qty: 3 }
  assert.equal(photoBatchBlockReason(batch, [photo], items, variations), '')
  photo.catalog.initialStock = 3
  assert.equal(photoBatchBlockReason(batch, [photo], items, variations), '')
})

test('requires explicit review and masks photo entry unit cost in pt-BR', () => {
  const batch = { type: 'entrada', defaults: { supplier: '', docRef: '', note: '' } }
  const photo = { createCatalog: true, catalog: photoCatalogDraft(suggestion()), status: 'review', qty: 1, unitCost: '12,34' }
  assert.match(photoBatchBlockReason(batch, [photo], items, variations), /confirme a revisão/i)
  assert.equal(maskPhotoUnitCost('1234'), '12,34')
  assert.equal(displayPhotoUnitCost(12.34), '12,34')
  assert.equal(parsePhotoUnitCost('1.234,56'), 1234.56)
})

test('requires an explicit edit action for another account pending batch', () => {
  const pending = { id: 'batch_1', ownerUserId: 'operator_1', status: 'pending' }
  const completed = { ...pending, status: 'completed' }

  assert.equal(canEditPhotoBatch(pending, 'operator_1', false), true)
  assert.equal(canEditPhotoBatch(pending, 'admin_1', true), false)
  assert.equal(canEditPhotoBatch(pending, 'admin_1', true, 'batch_1'), true)
  assert.equal(canEditPhotoBatch(completed, 'admin_1', true, 'batch_1'), false)
})

test('lets owners and administrators delete batches without erasing movement history', () => {
  const pending = { ownerUserId: 'operator_1', status: 'pending' }
  const completed = { ...pending, status: 'completed' }

  assert.equal(canDeletePhotoBatch(pending, 'operator_1', false), true)
  assert.equal(canDeletePhotoBatch(completed, 'operator_1', false), true)
  assert.equal(canDeletePhotoBatch(completed, 'admin_1', true), true)
  assert.equal(canDeletePhotoBatch(pending, 'operator_2', false), false)
})

test('requests all account photo batches only for administrators', async () => {
  const originalFetch = globalThis.fetch
  const urls = []
  globalThis.fetch = async url => {
    urls.push(url)
    return { ok: true, status: 200, json: async () => [] }
  }
  try {
    await getPhotoBatches()
    await getPhotoBatches(true)
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.deepEqual(urls, ['/api/photo-batches', '/api/photo-batches?all=1'])
})

test('removes nested Vue proxies before saving a photo in IndexedDB', () => {
  const photo = reactive({
    id: 'photo_1',
    blob: new Blob(['foto'], { type: 'image/jpeg' }),
    overrides: { note: 'teste' },
    suggestion: { attributes: [{ name: 'Cor', value: 'Azul' }] },
  })
  const spreadWithNestedProxies = { ...photo }
  assert.throws(() => structuredClone(spreadWithNestedProxies), /could not be cloned/i)

  const stored = toPhotoStorageRecord(spreadWithNestedProxies)
  assert.doesNotThrow(() => structuredClone(stored))
  assert.equal(stored.blob instanceof Blob, true)
  assert.equal(stored.suggestion.attributes[0].value, 'Azul')
})
