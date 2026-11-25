import { serializeCsv } from './csv.js'
import { variationAttributeRows } from './attributes.js'

export function movementHistoryCsv(movements) {
  return serializeCsv([
    ['Data', 'Tipo', 'Material', 'Grupo', 'Categoria', 'Subcategoria', 'Variação', 'Quantidade', 'Unidade', 'Estoque após', 'Fornecedor', 'Responsável', 'Destino', 'Documento', 'Observação', 'Operador'],
    ...movements.map(movement => [
      movement.date, movement.type === 'entrada' ? 'Entrada' : 'Saída',
      movement.itemName, movement.itemGroup, movement.itemCategory, movement.itemSubcategory,
      variationAttributeRows(null, { values: movement.variationValues, extras: movement.variationExtras })
        .map(attribute => `${attribute.key}: ${attribute.value}`).join(' · '),
      movement.qty, movement.itemUnit, movement.stockAfter, movement.supplier,
      movement.requestedBy, movement.destination, movement.docRef, movement.note, movement.operatorName,
    ]),
  ])
}
