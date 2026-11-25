import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDateOnly, maintenanceEndLabel, maintenancePeriod, orderDisplayTitle, variationLabel } from '../src/utils/workOrderPresentation.js'
import { serializeCsv } from '../src/utils/csv.js'

test('OS apresenta datas sem mudar o dia, manutenção em aberto e identidade do equipamento', () => {
  assert.equal(formatDateOnly('2026-10-20'), '20/10/2026')
  assert.equal(formatDateOnly('inválido'), '-')
  assert.equal(maintenanceEndLabel({}), 'Em aberto')
  assert.equal(maintenancePeriod({ maintenanceStartDate: '2026-10-20', maintenanceStartTime: '09:30' }), '20/10/2026 09:30 até em aberto')
  assert.equal(orderDisplayTitle({ motorId: 'm1', motorTag: 'M-1', motorName: 'Bomba' }), 'M-1 - Bomba')
  assert.equal(orderDisplayTitle({ equipment: 'Prensa' }), 'Prensa')
  assert.equal(variationLabel({ values: { Medida: '10mm' } }), 'Medida: 10mm')
})

test('CSV preserva acentos e aspas e impede fórmulas em campos de texto', () => {
  assert.equal(serializeCsv([['Nome', 'Quantidade'], ['Peça "A"', 2], ['=1+1', -3]]), '\uFEFF"Nome";"Quantidade"\r\n"Peça ""A""";"2"\r\n"\'=1+1";"-3"')
})
