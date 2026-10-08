import { shallowRef, ref } from 'vue'

export const stockConfirmation = shallowRef(null)
export const stockConfirmationRevision = ref(0)
let finish = null

export function requestStockCounts(rows) {
  if (finish) return Promise.reject(new Error('Conclua a conferência de estoque já aberta.'))
  return new Promise((resolve, reject) => {
    finish = counts => counts ? resolve(counts) : reject(new Error('Movimentação cancelada. Nenhum saldo foi alterado.'))
    stockConfirmation.value = rows
  })
}

export function finishStockConfirmation(counts = null) {
  const resolve = finish
  finish = null
  stockConfirmation.value = null
  resolve?.(counts)
}
