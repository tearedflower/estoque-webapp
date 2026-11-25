import { ref, computed } from 'vue'
import * as api from '../services/api.js'

// ===== Singleton state =====
const movements = ref([])

// ===== Composable =====
export function useMovements() {

  async function loadData() {
    movements.value = await api.getMovements()
  }

  /**
   * Record a new movement and update variation stock.
   * @param {'entrada'|'saida'} type
   * @param {object} variation  — reactive variation object (will be mutated)
   * @param {object} item       — item object (for denormalization)
   * @param {number} qty        — always positive; direction comes from type
   * @param {object} fields     — { supplier?, requestedBy?, destination?, docRef?, note? }
   */
  async function addMovement(type, variation, item, qty, fields = {}) {
    const created = await api.createMovement({
      type,
      variationId: variation.id,
      itemId: item.id,
      itemName: item.name,
      itemGroup: item.group,
      itemCategory: item.category || '',
      itemSubcategory: item.subcategory || '',
      itemUnit: item.unit,
      variationValues: { ...(variation.values || {}) },
      variationExtras: { ...(variation.extras || {}) },
      qty,
      supplier: fields.supplier || '',
      unitCost: fields.unitCost ?? null,
      requestedBy: fields.requestedBy || '',
      requestedByPersonId: fields.requestedByPersonId || '',
      destination: fields.destination || '',
      docRef: fields.docRef || '',
      note: fields.note || '',
    })
    // Update local variation stock from server response
    variation.stock = created.stockAfter
    variation.stockConfirmed = true
    movements.value.unshift(...(created.adjustments || []), created)
    return created
  }

  async function addMovementBatch(type, lines, fields = {}, requestId = '') {
    const result = await api.createMovementBatch({
      type,
      items: lines,
      fields,
      ...(requestId ? { requestId } : {}),
    })
    const created = result.movements || []
    movements.value.unshift(...(result.initialMovements || []), ...created)
    return created
  }

  async function deleteMovement(id, reason = '') {
    const result = await api.deleteMovement(id, { reason })
    const idx = movements.value.findIndex(m => m.id === id)
    if (idx !== -1) movements.value.splice(idx, 1)
    const refreshFailed = await loadData().then(() => false, () => true)
    return { ...result, refreshFailed }
  }

  /**
   * Edit a movement's editable fields and adjust stock if qty changed.
   */
  async function editMovement(id, changes, variation) {
    const m = movements.value.find(mv => mv.id === id)
    if (!m) return { ok: false, error: 'Movimentação não encontrada.' }

    const oldQty = m.qty
    const newQty = changes.qty !== undefined ? Number(changes.qty) : oldQty
    if (!isFinite(newQty) || newQty <= 0) return { ok: false, error: 'Quantidade deve ser positiva.' }

    try {
      const updated = await api.updateMovement(id, { ...changes, expectedRevision: changes.expectedRevision ?? m.revision ?? 0 })
      // Update local movement
      Object.assign(m, updated)
      // Update local variation stock if qty changed
      if (newQty !== oldQty && variation) {
        variation.stock = updated.currentStock
      }
      // Re-sort by date descending after date change
      if (changes.date !== undefined) {
        movements.value.sort((a, b) => new Date(b.date) - new Date(a.date))
      }
      const refreshFailed = await loadData().then(() => false, () => true)
      return { ok: true, refreshFailed }
    } catch (e) {
      if (e.code === 'MOVEMENT_CHANGED') await loadData().catch(() => {})
      return { ok: false, error: e.message }
    }
  }

  /**
   * Movements in the last 24 hours — used for the badge in App.vue
   */
  const recentMovements = computed(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return movements.value.filter(m => new Date(m.date).getTime() > cutoff)
  })

  return {
    movements,
    loadData,
    addMovement,
    addMovementBatch,
    editMovement,
    deleteMovement,
    recentMovements,
  }
}
