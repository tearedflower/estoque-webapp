import { serializeCsv } from './csv.js'
import { catalogRowsForTarget, epiVariationCa } from './epiSheet.js'

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

export function epiPeriodCsv(rules, items, variations) {
  const rows = rules.map(rule => {
    const label = rule.targetLabel || rule.targetKey
    const candidates = rule.allowedCas ?? catalogRowsForTarget(items, variations, rule)
      .map(({ variation }) => epiVariationCa(variation.values, variation.extras))
    const cas = [...new Set(candidates.filter(Boolean))].sort(collator.compare)
    if (candidates.includes('')) cas.push('CA pendente')
    const caLabel = cas.join(' | ') || 'Sem variação compatível'
    const status = rule.active ? 'Ativo' : 'Inativo'
    const role = rule.personId ? `${rule.roleName} (vínculo individual)` : rule.roleName
    return { label, days: rule.days, caLabel, status, role }
  })

  const periodOrder = days => days > 0 ? days : Infinity
  rows.sort((a, b) =>
    periodOrder(a.days) - periodOrder(b.days) ||
    collator.compare(a.label, b.label) || collator.compare(a.caLabel, b.caLabel) ||
    collator.compare(a.role, b.role) || collator.compare(a.status, b.status)
  )
  return serializeCsv([
    ['Periodicidade (dias)', 'EPI', 'CAs aceitos', 'Cargo', 'Situação do vínculo'],
    ...rows.map(({ days, label, caLabel, role, status }) => [
      days || 'Sem periodicidade', label, caLabel, role, status,
    ]),
  ])
}
