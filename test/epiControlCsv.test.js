import test from 'node:test'
import assert from 'node:assert/strict'
import { epiControlCsv } from '../src/utils/epiControlCsv.js'

test('EPI control CSV includes all supplied results, dates, attributes and pending deliveries without changing records', () => {
  const record = { person: { name: 'José "A"; Silva', role: '=FÓRMULA()', status: 'afastado' },
    rule: { targetLabel: 'EPI > Calçados > Bota', quantity: 2, usageReason: 'Risco descrito no PGR; por cargo' }, period: { days: 180 }, status: 'Programar troca',
    item: { attributes: ['Tamanho', 'CA'] }, variation: { values: { Tamanho: '41', CA: '123' } },
    movement: { date: '2026-10-10T12:00:00', itemName: 'Bota', qty: 2, itemUnit: 'PAR', variationValues: { CA: '123' } },
    dueDate: new Date('2027-04-08T12:00:00') }
  const pending = { person: { name: 'Maria', status: 'ativo' }, rule: { targetKey: 'Proteção das Mãos' }, status: 'Pendente' }
  const records = [...Array.from({ length: 25 }, () => structuredClone(record)), pending]
  const before = structuredClone(records)
  const csv = epiControlCsv(records)
  assert.equal(csv.charCodeAt(0), 0xFEFF)
  assert.equal(csv.split('\r\n').length, 27)
  assert.ok(csv.includes('"José ""A""; Silva"'))
  assert.ok(csv.includes('"\'=FÓRMULA()";"Afastado"'))
  assert.ok(csv.includes('"CA: 123 · Tamanho: 41";"2";"180";"Troca em 8–30 dias"'))
  assert.ok(csv.includes('"10/10/2026";"Bota";"CA: 123";"2";"PAR";"08/04/2027"'))
  assert.ok(csv.includes('"08/04/2027";"Risco descrito no PGR; por cargo"'))
  assert.ok(csv.split('\r\n')[0].endsWith('"Motivo de uso"'))
  assert.ok(csv.includes('"Maria";"";"Ativo";"Proteção das Mãos";"";"1";"";"Pendente";"";"";"";"";"";""'))
  assert.deepEqual(records, before)
  assert.equal(epiControlCsv([]).split('\r\n').length, 1)
})
