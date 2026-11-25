export function parsePositiveQty(qty) {
  if (typeof qty !== 'number' && typeof qty !== 'string') return null
  const n = Number(qty)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function calculateStockAfter(type, stockBefore, qty) {
  if (type === 'entrada') return stockBefore + qty
  if (type === 'saida') return stockBefore - qty
  throw new Error('Tipo de movimentacao invalido.')
}

export function hasEnoughStock(type, stockBefore, qty) {
  const stockAfter = calculateStockAfter(type, stockBefore, qty)
  return type === 'entrada' || stockAfter >= 0
}

export function isAdminStockAdjustment(docRef, role) {
  return role === 'admin' && String(docRef || '').trim().toUpperCase() === 'AJUSTE'
}
