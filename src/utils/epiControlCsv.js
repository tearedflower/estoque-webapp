import { serializeCsv } from './csv.js'
import { variationAttributeRows } from './attributes.js'
import { personStatusLabel } from '../composables/usePeople.js'

const attributes = (item, variation) => variationAttributeRows(item, variation)
  .map(row => `${row.key}: ${row.value}`).join(' · ')
const dateLabel = value => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR')
}

export function epiControlCsv(records) {
  return serializeCsv([
    ['Pessoa', 'Cargo', 'Situação da pessoa', 'EPI previsto', 'Características previstas', 'Quantidade prevista', 'Periodicidade (dias)', 'Situação do EPI',
      'Última entrega', 'Material da última entrega', 'Características da última entrega', 'Quantidade entregue', 'Unidade entregue', 'Próxima troca', 'Motivo de uso'],
    ...records.map(record => [
      record.person.name, record.person.role, personStatusLabel(record.person.status),
      record.rule.targetLabel || record.rule.targetKey, attributes(record.item, record.variation), record.rule.quantity ?? 1,
      record.period?.days, record.status === 'Programar troca' ? 'Troca em 8–30 dias' : record.status,
      dateLabel(record.movement?.date), record.movement?.itemName,
      attributes(null, { values: record.movement?.variationValues, extras: record.movement?.variationExtras }),
      record.movement?.qty, record.movement?.itemUnit, dateLabel(record.dueDate),
      record.rule.usageReason,
    ]),
  ])
}
