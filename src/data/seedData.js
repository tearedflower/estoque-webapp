/**
 * Mass test data for stress-testing the catalog UI.
 * Returns { items, variations } arrays ready for injection.
 */
import { generateId } from '../utils/id.js'
import { enrichOperationalSeed } from './operationalSeed.js'

function makeItems(defs) {
  const items = []
  const variations = []

  for (const d of defs) {
    const itemId = generateId('item')
    items.push({
      id: itemId,
      name: d.name,
      group: d.group,
      category: d.category || null,
      subcategory: d.subcategory || null,
      unit: d.unit || 'UN',
      minStock: d.minStock ?? 5,
      attributes: d.attrs
    })
    for (const v of d.vars) {
      variations.push({
        id: generateId('var'),
        itemId,
        values: v.values,
        stock: v.stock
      })
    }
  }

  return { items, variations }
}

function findSeedRow(data, itemMatcher, variationMatcher = () => true) {
  for (const item of data.items) {
    if (!itemMatcher(item)) continue
    for (const variation of data.variations.filter(v => v.itemId === item.id)) {
      if (variationMatcher(variation)) return { item, variation }
    }
  }
  return null
}

function variationLabel(variation) {
  return Object.entries(variation.values || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')
}

function makeMovement(row, index, type, qty, date, fields = {}) {
  const signed = type === 'entrada' ? qty : -qty
  const stockAfter = Number(row.variation.stock || 0)
  const stockBefore = stockAfter - signed
  return {
    id: `mov_seed_${index}`,
    type,
    variationId: row.variation.id,
    itemId: row.item.id,
    itemName: row.item.name,
    itemGroup: row.item.group,
    itemCategory: row.item.category || '',
    itemSubcategory: row.item.subcategory || '',
    itemUnit: row.item.unit || 'UN',
    variationValues: row.variation.values || {},
    variationExtras: row.variation.extras || {},
    qty,
    stockBefore,
    stockAfter,
    date,
    supplier: fields.supplier || '',
    requestedBy: fields.requestedBy || '',
    destination: fields.destination || '',
    docRef: fields.docRef || '',
    note: fields.note || '',
    operatorId: fields.operatorId || 'user_admin',
    operatorName: fields.operatorName || 'admin',
  }
}

function enrichSeedData(data) {
  const destinations = [
    { id: 'dest_rama_texima', name: 'Rama Texima', description: 'Setor de costura industrial.' },
    { id: 'dest_rama_sta_clara', name: 'Rama Sta. Clara', description: 'Setor de acabamento.' },
    { id: 'dest_jigger_1', name: 'Jigger 1', description: 'Linha de beneficiamento.' },
    { id: 'dest_turbo_1', name: 'Turbo 1', description: 'Equipamento de processo.' },
    { id: 'dest_epi', name: 'EPI', description: 'Saidas avulsas de equipamentos de protecao.' },
    { id: 'dest_costura', name: 'Maquinas de Costura', description: 'Grupo de maquinas de costura.' },
    { id: 'dest_costura_reta', name: 'Reta 01', parentId: 'dest_costura', description: 'Maquina reta principal.' },
    { id: 'dest_costura_overlock', name: 'Overlock 02', parentId: 'dest_costura', description: 'Maquina overlock.' },
  ]
  const locations = [
    { id: 'loc_almox', name: 'Almoxarifado', description: 'Local principal de estoque.' },
    { id: 'loc_almox_epi', name: 'EPI', parentId: 'loc_almox', description: 'Prateleiras de EPI.' },
    { id: 'loc_almox_manut', name: 'Manutenção', parentId: 'loc_almox', description: 'Peças e ferramentas.' },
    { id: 'loc_oficina', name: 'Oficina', description: 'Oficina interna.' },
  ]
  const roles = [
    { id: 'role_mecanico', name: 'Mecânico', description: 'Execução de manutenção mecânica.' },
    { id: 'role_eletricista', name: 'Eletricista', description: 'Execução de manutenção elétrica.' },
    { id: 'role_costureira', name: 'Costureira', description: 'Operacao de costura.' },
    { id: 'role_almoxarife', name: 'Almoxarife', description: 'Controle de estoque.' },
  ]
  const people = [
    { id: 'person_maria', name: 'Maria Souza', role: 'Costureira' },
    { id: 'person_joao', name: 'João Pereira', role: 'Mecânico' },
    { id: 'person_ana', name: 'Ana Lima', role: 'Almoxarife' },
    { id: 'person_carlos', name: 'Carlos Silva', role: 'Eletricista' },
  ]

  const linkedRows = [
    findSeedRow(data, item => item.name.includes('Luva de Latex')),
    findSeedRow(data, item => item.name.toLowerCase().includes('nitr')),
    findSeedRow(data, item => item.name === 'Disco Flap'),
    findSeedRow(data, item => item.name === 'Bico de Contato MIG'),
    findSeedRow(data, item => item.name === 'Graxa'),
  ].filter(Boolean)

  for (const row of linkedRows) {
    if (row.item.group === 'EPIs') row.variation.destinations = ['dest_epi', 'dest_costura']
    else row.variation.destinations = ['dest_rama_texima', 'dest_jigger_1']
    row.variation.location = row.item.group === 'EPIs' ? 'Almoxarifado > EPI' : 'Almoxarifado > Manutenção'
  }

  const movements = []
  let movIndex = 1
  const historyRows = linkedRows.slice(0, 5)
  for (const row of historyRows) {
    movements.push(makeMovement(row, movIndex++, 'entrada', 10, '2025-04-10T08:15:00.000Z', { supplier: 'Fornecedor Modelo', docRef: 'NF 2025-0410', note: 'Entrada historica do seed.' }))
    movements.push(makeMovement(row, movIndex++, 'saida', 2, '2025-05-12T10:30:00.000Z', { requestedBy: 'Maria Souza', destination: row.item.group === 'EPIs' ? 'EPI' : 'Rama Texima', docRef: 'REQ 2025-0512', note: 'Saida historica do seed.' }))
    movements.push(makeMovement(row, movIndex++, 'saida', 4, '2025-06-18T14:00:00.000Z', { requestedBy: 'João Pereira', destination: row.item.group === 'EPIs' ? 'Máquinas de Costura' : 'Jigger 1', docRef: 'REQ 2025-0618' }))
    movements.push(makeMovement(row, movIndex++, 'entrada', 4, '2025-09-05T09:45:00.000Z', { supplier: 'Fornecedor Modelo', docRef: 'PC 2025-0905' }))
    movements.push(makeMovement(row, movIndex++, 'saida', 3, '2026-01-22T11:20:00.000Z', { requestedBy: 'Carlos Silva', destination: row.item.group === 'EPIs' ? 'EPI' : 'Turbo 1', docRef: 'REQ 2026-0122' }))
    movements.push(makeMovement(row, movIndex++, 'entrada', 1, '2026-04-08T16:10:00.000Z', { supplier: 'Ajuste de inventário', docRef: 'AJUSTE', note: 'Ajuste histórico do seed.' }))
  }

  const osMaterial = findSeedRow(data, item => item.name === 'Disco de Corte') || historyRows[0]
  const motorMaterial = findSeedRow(data, item => item.name === 'Spray Lubrificante') || historyRows[1]
  const osMovement = osMaterial
    ? makeMovement(osMaterial, movIndex++, 'saida', 2, '2026-03-18T13:40:00.000Z', { requestedBy: 'João Pereira', destination: 'Rama Texima', docRef: 'OS #101', note: 'Material adicionado via OS #101.' })
    : null
  const motorOsMovement = motorMaterial
    ? makeMovement(motorMaterial, movIndex++, 'saida', 1, '2026-04-22T15:05:00.000Z', { requestedBy: 'Carlos Silva', destination: 'Oficina', docRef: 'OS #103', note: 'Material adicionado via OS de motor #103.' })
    : null
  if (osMovement) movements.push(osMovement)
  if (motorOsMovement) movements.push(motorOsMovement)

  const motors = [
    {
      id: 'motor_azul',
      tag: 'N 10-20-30',
      serial: 'RTS-220V-W22',
      name: 'Motor Azul',
      manufacturer: 'WEG',
      power: '7CV',
      voltage: '220/380V',
      rpm: '1750RPM',
      destinationId: 'dest_rama_texima',
      destinationName: 'Rama Texima',
      status: 'ativo',
      notes: 'Motor principal da linha Rama Texima.',
      createdAt: '2025-05-20T08:00:00.000Z',
      updatedAt: '2026-04-25T12:00:00.000Z',
    },
    {
      id: 'motor_verde',
      tag: 'N 20-40-10',
      serial: 'JG-380V-02',
      name: 'Motor Verde',
      manufacturer: 'WEG',
      power: '5CV',
      voltage: '380V',
      rpm: '1720RPM',
      destinationId: 'dest_jigger_1',
      destinationName: 'Jigger 1',
      status: 'em_manutencao',
      notes: 'Motor em manutenção preventiva.',
      createdAt: '2025-08-11T08:00:00.000Z',
      updatedAt: '2026-04-28T12:00:00.000Z',
    },
    {
      id: 'motor_reserva',
      tag: 'N 30-10-05',
      serial: 'RSV-220V-01',
      name: 'Motor Reserva',
      manufacturer: 'Kohlbach',
      power: '3CV',
      voltage: '220V',
      rpm: '1700RPM',
      destinationId: 'dest_turbo_1',
      destinationName: 'Turbo 1',
      status: 'reserva',
      notes: 'Motor reserva operacional.',
      createdAt: '2025-10-03T08:00:00.000Z',
      updatedAt: '2026-02-12T12:00:00.000Z',
    },
  ]

  const workOrders = [
    {
      id: 'wo_seed_101',
      number: 101,
      title: 'Rama Texima - troca de disco',
      destinationId: 'dest_rama_texima',
      destinationName: 'Rama Texima',
      equipment: 'Rama Texima',
      serviceType: 'Mecanica',
      requestDate: '2026-03-18',
      requestTime: '08:30',
      requestedBy: 'Maria Souza',
      note: 'Ruido anormal no conjunto.',
      maintenanceStartDate: '2026-03-18',
      maintenanceStartTime: '13:00',
      maintenanceEndDate: '2026-03-18',
      maintenanceEndTime: '15:00',
      maintenanceProfessional: 'João Pereira',
      maintenanceMaterials: 'Disco e insumos de limpeza.',
      maintenanceNote: 'Serviço concluído.',
      createdAt: '2026-03-18T08:30:00.000Z',
    },
    {
      id: 'wo_seed_102',
      number: 102,
      title: 'Jigger 1 - inspecao pendente',
      destinationId: 'dest_jigger_1',
      destinationName: 'Jigger 1',
      equipment: 'Jigger 1',
      serviceType: 'Elétrica',
      requestDate: '2026-04-12',
      requestTime: '09:10',
      requestedBy: 'Carlos Silva',
      note: 'Verificar painel de comando.',
      maintenanceStartDate: '',
      maintenanceStartTime: '',
      maintenanceEndDate: '',
      maintenanceEndTime: '',
      maintenanceProfessional: '',
      createdAt: '2026-04-12T09:10:00.000Z',
    },
    {
      id: 'wo_seed_103',
      number: 103,
      title: 'N 10-20-30 - Revisado',
      motorId: 'motor_azul',
      equipment: 'N 10-20-30 - Motor Azul',
      motorOriginDestinationId: 'dest_rama_texima',
      motorOriginDestinationName: 'Rama Texima',
      maintenanceLocationType: 'interna',
      maintenanceDestinationName: 'Oficina',
      serviceType: 'Outros',
      requestDate: '2026-04-22',
      requestTime: '09:00',
      requestedBy: 'João Pereira',
      note: 'Revisao preventiva.',
      maintenanceStartDate: '2026-04-22',
      maintenanceStartTime: '10:00',
      maintenanceEndDate: '2026-04-22',
      maintenanceEndTime: '16:00',
      maintenanceProfessional: 'Carlos Silva',
      maintenanceMaterials: 'Spray lubrificante.',
      maintenanceNote: 'Motor revisado e liberado.',
      createdAt: '2026-04-22T09:00:00.000Z',
    },
    {
      id: 'wo_seed_104',
      number: 104,
      title: 'N 20-40-10 - Rebobinado',
      motorId: 'motor_verde',
      equipment: 'N 20-40-10 - Motor Verde',
      motorOriginDestinationId: 'dest_jigger_1',
      motorOriginDestinationName: 'Jigger 1',
      maintenanceLocationType: 'externa',
      maintenanceExternalLocation: 'Americana Motores',
      serviceType: 'Outros',
      requestDate: '2026-04-28',
      requestTime: '14:20',
      requestedBy: 'Ana Lima',
      note: 'Motor enviado para rebobinamento.',
      createdAt: '2026-04-28T14:20:00.000Z',
    },
  ]

  const workOrderItems = [
    osMovement && {
      id: 'woi_seed_101_1',
      workOrderId: 'wo_seed_101',
      variationId: osMovement.variationId,
      itemId: osMovement.itemId,
      itemName: osMovement.itemName,
      itemGroup: osMovement.itemGroup,
      itemCategory: osMovement.itemCategory,
      itemUnit: osMovement.itemUnit,
      variationValues: osMovement.variationValues,
      qty: osMovement.qty,
      movementId: osMovement.id,
      addedAt: osMovement.date,
    },
    motorOsMovement && {
      id: 'woi_seed_103_1',
      workOrderId: 'wo_seed_103',
      variationId: motorOsMovement.variationId,
      itemId: motorOsMovement.itemId,
      itemName: motorOsMovement.itemName,
      itemGroup: motorOsMovement.itemGroup,
      itemCategory: motorOsMovement.itemCategory,
      itemUnit: motorOsMovement.itemUnit,
      variationValues: motorOsMovement.variationValues,
      qty: motorOsMovement.qty,
      movementId: motorOsMovement.id,
      addedAt: motorOsMovement.date,
    },
  ].filter(Boolean)

  const workOrderEvents = [
    { id: 'woe_seed_101_1', workOrderId: 'wo_seed_101', eventType: 'criada', eventDate: '2026-03-18T08:30:00.000Z', operatorName: 'admin', notes: 'OS criada pelo seed.' },
    { id: 'woe_seed_101_2', workOrderId: 'wo_seed_101', eventType: 'finalizada', eventDate: '2026-03-18T15:00:00.000Z', operatorName: 'admin', notes: 'OS finalizada pelo seed.' },
    { id: 'woe_seed_102_1', workOrderId: 'wo_seed_102', eventType: 'criada', eventDate: '2026-04-12T09:10:00.000Z', operatorName: 'admin', notes: 'OS aberta pelo seed.' },
    { id: 'woe_seed_103_1', workOrderId: 'wo_seed_103', eventType: 'criada', eventDate: '2026-04-22T09:00:00.000Z', operatorName: 'admin', notes: 'OS de motor criada pelo seed.' },
    { id: 'woe_seed_103_2', workOrderId: 'wo_seed_103', eventType: 'finalizada', eventDate: '2026-04-22T16:00:00.000Z', operatorName: 'admin', notes: 'Motor revisado e OS finalizada.' },
    { id: 'woe_seed_104_1', workOrderId: 'wo_seed_104', eventType: 'criada', eventDate: '2026-04-28T14:20:00.000Z', operatorName: 'admin', notes: 'OS de motor externa aberta.' },
  ]

  const motorEvents = [
    { id: 'mev_seed_azul_1', motorId: 'motor_azul', workOrderId: 'wo_seed_103', eventType: 'revisado', eventDate: '2026-04-22T09:00:00.000Z', fromDestination: 'Rama Texima', performedBy: 'Carlos Silva', notes: 'Revisao preventiva.' },
    { id: 'mev_seed_azul_2', motorId: 'motor_azul', workOrderId: 'wo_seed_103', eventType: 'movimentado', eventDate: '2026-04-22T16:00:00.000Z', fromDestination: 'Oficina', toDestination: 'Rama Texima', performedBy: 'Carlos Silva', notes: 'Retorno para operacao.' },
    { id: 'mev_seed_verde_1', motorId: 'motor_verde', workOrderId: 'wo_seed_104', eventType: 'rebobinado', eventDate: '2026-04-28T14:20:00.000Z', fromDestination: 'Jigger 1', toDestination: 'Americana Motores', performedBy: 'Americana Motores', notes: 'Enviado para rebobinamento externo.' },
    { id: 'mev_seed_reserva_1', motorId: 'motor_reserva', eventType: 'observacao', eventDate: '2026-02-12T11:00:00.000Z', fromDestination: 'Turbo 1', performedBy: 'João Pereira', notes: 'Motor reserva testado.' },
  ]

  return {
    ...data,
    movements,
    destinations,
    locations,
    people,
    roles,
    workOrders,
    workOrderItems,
    workOrderEvents,
    motors,
    motorEvents,
  }
}

export function generateSeedData() {
  const allDefs = [

    // ═══════════════════════════════════════
    //  EPIs > Luvas
    // ═══════════════════════════════════════
    { name: 'Luva de Latex', group: 'EPIs', category: 'Luvas', unit: 'PAR', minStock: 10,
      attrs: ['Marca','Modelo','Tamanho','CA','Material'],
      vars: [
        { values: { Marca:'Volk', Modelo:'Verniz Silver', Tamanho:'P', CA:'15100', Material:'Latex' }, stock: 25 },
        { values: { Marca:'Volk', Modelo:'Verniz Silver', Tamanho:'M', CA:'15100', Material:'Latex' }, stock: 40 },
        { values: { Marca:'Volk', Modelo:'Verniz Silver', Tamanho:'G', CA:'15100', Material:'Latex' }, stock: 18 },
        { values: { Marca:'Danny', Modelo:'Confort', Tamanho:'P', CA:'14800', Material:'Latex' }, stock: 12 },
        { values: { Marca:'Danny', Modelo:'Confort', Tamanho:'M', CA:'14800', Material:'Latex' }, stock: 30 },
        { values: { Marca:'Danny', Modelo:'Confort', Tamanho:'G', CA:'14800', Material:'Latex' }, stock: 5 },
        { values: { Marca:'SuperSafety', Modelo:'SS1009', Tamanho:'M', CA:'16200', Material:'Latex' }, stock: 0 },
        { values: { Marca:'SuperSafety', Modelo:'SS1009', Tamanho:'G', CA:'16200', Material:'Latex' }, stock: 8 },
      ]},
    { name: 'Luva de Raspa', group: 'EPIs', category: 'Luvas', unit: 'PAR', minStock: 10,
      attrs: ['Marca','Tipo','Tamanho','CA'],
      vars: [
        { values: { Marca:'Delta Plus', Tipo:'Cano Curto', Tamanho:'M', CA:'12440' }, stock: 15 },
        { values: { Marca:'Delta Plus', Tipo:'Cano Curto', Tamanho:'G', CA:'12440' }, stock: 20 },
        { values: { Marca:'Delta Plus', Tipo:'Cano Longo', Tamanho:'M', CA:'12441' }, stock: 10 },
        { values: { Marca:'Delta Plus', Tipo:'Cano Longo', Tamanho:'G', CA:'12441' }, stock: 7 },
        { values: { Marca:'Volk', Tipo:'Cano Curto', Tamanho:'Único', CA:'13300' }, stock: 22 },
      ]},
    { name: 'Luva Nitrílica', group: 'EPIs', category: 'Luvas', unit: 'PAR', minStock: 10,
      attrs: ['Marca','Modelo','Tamanho','CA','Cor'],
      vars: [
        { values: { Marca:'Danny', Modelo:'DA-360', Tamanho:'P', CA:'21500', Cor:'Azul' }, stock: 50 },
        { values: { Marca:'Danny', Modelo:'DA-360', Tamanho:'M', CA:'21500', Cor:'Azul' }, stock: 80 },
        { values: { Marca:'Danny', Modelo:'DA-360', Tamanho:'G', CA:'21500', Cor:'Azul' }, stock: 35 },
        { values: { Marca:'Volk', Modelo:'Nitriflex', Tamanho:'M', CA:'22100', Cor:'Preta' }, stock: 0 },
        { values: { Marca:'Volk', Modelo:'Nitriflex', Tamanho:'G', CA:'22100', Cor:'Preta' }, stock: 12 },
      ]},
    { name: 'Luva de PVC', group: 'EPIs', category: 'Luvas', unit: 'PAR', minStock: 10,
      attrs: ['Marca','Comprimento','Tamanho','CA'],
      vars: [
        { values: { Marca:'Volk', Comprimento:'26cm', Tamanho:'M', CA:'18700' }, stock: 14 },
        { values: { Marca:'Volk', Comprimento:'26cm', Tamanho:'G', CA:'18700' }, stock: 9 },
        { values: { Marca:'Volk', Comprimento:'36cm', Tamanho:'M', CA:'18701' }, stock: 6 },
        { values: { Marca:'Volk', Comprimento:'36cm', Tamanho:'G', CA:'18701' }, stock: 11 },
      ]},
    { name: 'Luva Anticorte', group: 'EPIs', category: 'Luvas', unit: 'PAR', minStock: 5,
      attrs: ['Marca','Nível','Tamanho','CA'],
      vars: [
        { values: { Marca:'3M', Nível:'A4', Tamanho:'M', CA:'33100' }, stock: 10 },
        { values: { Marca:'3M', Nível:'A4', Tamanho:'G', CA:'33100' }, stock: 15 },
        { values: { Marca:'SuperSafety', Nível:'A3', Tamanho:'M', CA:'33200' }, stock: 4 },
      ]},

    // ═══════════════════════════════════════
    //  EPIs > Óculos
    // ═══════════════════════════════════════
    { name: 'Óculos de Proteção', group: 'EPIs', category: 'Óculos', unit: 'UN', minStock: 8,
      attrs: ['Marca','Modelo','Cor Lente','CA'],
      vars: [
        { values: { Marca:'3M', Modelo:'Virtua', 'Cor Lente':'Incolor', CA:'15649' }, stock: 30 },
        { values: { Marca:'3M', Modelo:'Virtua', 'Cor Lente':'Fumê', CA:'15649' }, stock: 25 },
        { values: { Marca:'Kalipso', Modelo:'Jaguar', 'Cor Lente':'Incolor', CA:'11790' }, stock: 40 },
        { values: { Marca:'Kalipso', Modelo:'Jaguar', 'Cor Lente':'Fumê', CA:'11790' }, stock: 20 },
        { values: { Marca:'Kalipso', Modelo:'Jaguar', 'Cor Lente':'Amarela', CA:'11790' }, stock: 10 },
        { values: { Marca:'Honeywell', Modelo:'Uvex S3200', 'Cor Lente':'Incolor', CA:'18800' }, stock: 15 },
      ]},
    { name: 'Óculos Ampla Visão', group: 'EPIs', category: 'Óculos', unit: 'UN', minStock: 5,
      attrs: ['Marca','Modelo','Ventilação','CA'],
      vars: [
        { values: { Marca:'Kalipso', Modelo:'Rã', Ventilação:'Direta', CA:'11285' }, stock: 18 },
        { values: { Marca:'Kalipso', Modelo:'Rã', Ventilação:'Indireta', CA:'11286' }, stock: 12 },
        { values: { Marca:'3M', Modelo:'GG500', Ventilação:'Indireta', CA:'37640' }, stock: 8 },
      ]},

    // ═══════════════════════════════════════
    //  EPIs > Respiradores
    // ═══════════════════════════════════════
    { name: 'Máscara PFF2', group: 'EPIs', category: 'Respiradores', unit: 'UN', minStock: 15,
      attrs: ['Marca','Modelo','Válvula','CA'],
      vars: [
        { values: { Marca:'3M', Modelo:'Aura 9320+', Válvula:'Sem', CA:'30592' }, stock: 100 },
        { values: { Marca:'3M', Modelo:'Aura 9322+', Válvula:'Com', CA:'30593' }, stock: 60 },
        { values: { Marca:'Delta Plus', Modelo:'PFF2 VO', Válvula:'Com', CA:'38500' }, stock: 45 },
        { values: { Marca:'Delta Plus', Modelo:'PFF2 S', Válvula:'Sem', CA:'38501' }, stock: 80 },
      ]},
    { name: 'Máscara PFF3', group: 'EPIs', category: 'Respiradores', unit: 'UN', minStock: 10,
      attrs: ['Marca','Modelo','Válvula','CA'],
      vars: [
        { values: { Marca:'3M', Modelo:'Aura 9332+', Válvula:'Com', CA:'30594' }, stock: 20 },
        { values: { Marca:'Honeywell', Modelo:'SuperOne 3208', Válvula:'Com', CA:'41200' }, stock: 10 },
      ]},
    { name: 'Respirador Semifacial', group: 'EPIs', category: 'Respiradores', unit: 'UN', minStock: 3,
      attrs: ['Marca','Modelo','Tamanho','CA'],
      vars: [
        { values: { Marca:'3M', Modelo:'Série 6200', Tamanho:'M', CA:'46300' }, stock: 5 },
        { values: { Marca:'3M', Modelo:'Série 6200', Tamanho:'G', CA:'46300' }, stock: 3 },
        { values: { Marca:'3M', Modelo:'Série 7502', Tamanho:'M', CA:'46301' }, stock: 8 },
      ]},
    { name: 'Filtro Químico', group: 'EPIs', category: 'Respiradores', unit: 'UN', minStock: 5,
      attrs: ['Marca','Modelo','Tipo','CA'],
      vars: [
        { values: { Marca:'3M', Modelo:'6001', Tipo:'Vapores Orgânicos', CA:'4600' }, stock: 12 },
        { values: { Marca:'3M', Modelo:'6003', Tipo:'Vapores Orgânicos + Gases Ácidos', CA:'4601' }, stock: 8 },
        { values: { Marca:'3M', Modelo:'2091', Tipo:'Particulados P100', CA:'4602' }, stock: 10 },
      ]},

    // ═══════════════════════════════════════
    //  EPIs > Calçados
    // ═══════════════════════════════════════
    { name: 'Botina de Segurança', group: 'EPIs', category: 'Calçados', unit: 'PAR', minStock: 5,
      attrs: ['Marca','Modelo','Biqueira','Tamanho','CA'],
      vars: [
        { values: { Marca:'Marluvas', Modelo:'Premier 75BPR26', Biqueira:'Composite', Tamanho:'38', CA:'32900'}, stock: 4 },
        { values: { Marca:'Marluvas', Modelo:'Premier 75BPR26', Biqueira:'Composite', Tamanho:'40', CA:'32900'}, stock: 8 },
        { values: { Marca:'Marluvas', Modelo:'Premier 75BPR26', Biqueira:'Composite', Tamanho:'42', CA:'32900'}, stock: 6 },
        { values: { Marca:'Marluvas', Modelo:'Premier 75BPR26', Biqueira:'Composite', Tamanho:'44', CA:'32900'}, stock: 3 },
        { values: { Marca:'Bracol', Modelo:'BRK 10', Biqueira:'Aço', Tamanho:'38', CA:'29100'}, stock: 5 },
        { values: { Marca:'Bracol', Modelo:'BRK 10', Biqueira:'Aço', Tamanho:'40', CA:'29100'}, stock: 10 },
        { values: { Marca:'Bracol', Modelo:'BRK 10', Biqueira:'Aço', Tamanho:'42', CA:'29100'}, stock: 7 },
        { values: { Marca:'Bracol', Modelo:'BRK 10', Biqueira:'Aço', Tamanho:'44', CA:'29100'}, stock: 2 },
        { values: { Marca:'Fujiwara', Modelo:'Onix', Biqueira:'Composite', Tamanho:'40', CA:'34500'}, stock: 0 },
        { values: { Marca:'Fujiwara', Modelo:'Onix', Biqueira:'Composite', Tamanho:'42', CA:'34500'}, stock: 3 },
      ]},
    { name: 'Bota de PVC', group: 'EPIs', category: 'Calçados', unit: 'PAR', minStock: 5,
      attrs: ['Marca','Cano','Tamanho','CA'],
      vars: [
        { values: { Marca:'Fujiwara', Cano:'Médio', Tamanho:'39/40', CA:'28300' }, stock: 6 },
        { values: { Marca:'Fujiwara', Cano:'Médio', Tamanho:'41/42', CA:'28300' }, stock: 8 },
        { values: { Marca:'Fujiwara', Cano:'Longo', Tamanho:'39/40', CA:'28301' }, stock: 4 },
        { values: { Marca:'Fujiwara', Cano:'Longo', Tamanho:'41/42', CA:'28301' }, stock: 5 },
      ]},
    { name: 'Sapato de Segurança', group: 'EPIs', category: 'Calçados', unit: 'PAR', minStock: 3,
      attrs: ['Marca','Modelo','Tamanho','CA'],
      vars: [
        { values: { Marca:'Marluvas', Modelo:'50F61', Tamanho:'39', CA:'25300'}, stock: 2 },
        { values: { Marca:'Marluvas', Modelo:'50F61', Tamanho:'41', CA:'25300'}, stock: 4 },
        { values: { Marca:'Marluvas', Modelo:'50F61', Tamanho:'43', CA:'25300'}, stock: 3 },
      ]},

    // ═══════════════════════════════════════
    //  EPIs > Proteção Auditiva
    // ═══════════════════════════════════════
    { name: 'Protetor Auricular Plug', group: 'EPIs', category: 'Proteção Auditiva', unit: 'UN', minStock: 20,
      attrs: ['Marca','Modelo','NRRsf','CA'],
      vars: [
        { values: { Marca:'3M', Modelo:'1100', NRRsf:'14dB', CA:'5674' }, stock: 200 },
        { values: { Marca:'3M', Modelo:'1110', NRRsf:'14dB', CA:'5674' }, stock: 150 },
        { values: { Marca:'Honeywell', Modelo:'Max Lite', NRRsf:'16dB', CA:'17200' }, stock: 80 },
      ]},
    { name: 'Abafador de Ruído', group: 'EPIs', category: 'Proteção Auditiva', unit: 'UN', minStock: 5,
      attrs: ['Marca','Modelo','NRRsf','CA'],
      vars: [
        { values: { Marca:'3M', Modelo:'Muffler H9A', NRRsf:'24dB', CA:'16700' }, stock: 12 },
        { values: { Marca:'3M', Modelo:'Peltor H10A', NRRsf:'27dB', CA:'16701' }, stock: 8 },
        { values: { Marca:'Honeywell', Modelo:'Thunder T3', NRRsf:'25dB', CA:'21000' }, stock: 6 },
      ]},

    // ═══════════════════════════════════════
    //  EPIs > Capacetes
    // ═══════════════════════════════════════
    { name: 'Capacete Classe A', group: 'EPIs', category: 'Capacetes', unit: 'UN', minStock: 5,
      attrs: ['Marca','Modelo','Cor','CA'],
      vars: [
        { values: { Marca:'MSA', Modelo:'V-Gard', Cor:'Branco', CA:'498' }, stock: 20 },
        { values: { Marca:'MSA', Modelo:'V-Gard', Cor:'Azul', CA:'498' }, stock: 15 },
        { values: { Marca:'MSA', Modelo:'V-Gard', Cor:'Amarelo', CA:'498' }, stock: 18 },
        { values: { Marca:'MSA', Modelo:'V-Gard', Cor:'Laranja', CA:'498' }, stock: 10 },
        { values: { Marca:'Honeywell', Modelo:'A79R', Cor:'Branco', CA:'15800' }, stock: 12 },
        { values: { Marca:'Honeywell', Modelo:'A79R', Cor:'Azul', CA:'15800' }, stock: 8 },
      ]},
    { name: 'Capacete Classe B', group: 'EPIs', category: 'Capacetes', unit: 'UN', minStock: 3,
      attrs: ['Marca','Modelo','Cor','CA'],
      vars: [
        { values: { Marca:'MSA', Modelo:'V-Gard 520', Cor:'Branco', CA:'14100' }, stock: 5 },
        { values: { Marca:'MSA', Modelo:'V-Gard 520', Cor:'Azul', CA:'14100' }, stock: 3 },
      ]},

    // ═══════════════════════════════════════
    //  EPIs > Vestimentas
    // ═══════════════════════════════════════
    { name: 'Avental de Raspa', group: 'EPIs', category: 'Vestimentas', unit: 'UN', minStock: 5,
      attrs: ['Marca','Tipo','Tamanho','CA'],
      vars: [
        { values: { Marca:'Delta Plus', Tipo:'Barbeiro', Tamanho:'Único', CA:'14600' }, stock: 7 },
        { values: { Marca:'Volk', Tipo:'Comprido', Tamanho:'Único', CA:'14700' }, stock: 5 },
      ]},
    { name: 'Jaleco Descartável', group: 'EPIs', category: 'Vestimentas', unit: 'UN', minStock: 10,
      attrs: ['Marca','Gramatura','Tamanho'],
      vars: [
        { values: { Marca:'Descarpack', Gramatura:'30g', Tamanho:'M' }, stock: 100 },
        { values: { Marca:'Descarpack', Gramatura:'30g', Tamanho:'G' }, stock: 80 },
        { values: { Marca:'Descarpack', Gramatura:'30g', Tamanho:'GG' }, stock: 50 },
        { values: { Marca:'Descarpack', Gramatura:'50g', Tamanho:'M' }, stock: 30 },
        { values: { Marca:'Descarpack', Gramatura:'50g', Tamanho:'G' }, stock: 40 },
      ]},
    { name: 'Macacão de Segurança', group: 'EPIs', category: 'Vestimentas', unit: 'UN', minStock: 5,
      attrs: ['Marca','Modelo','Tamanho','CA'],
      vars: [
        { values: { Marca:'3M', Modelo:'4520', Tamanho:'M', CA:'29300' }, stock: 10 },
        { values: { Marca:'3M', Modelo:'4520', Tamanho:'G', CA:'29300' }, stock: 8 },
        { values: { Marca:'3M', Modelo:'4520', Tamanho:'GG', CA:'29300' }, stock: 4 },
      ]},
    { name: 'Mangote de Raspa', group: 'EPIs', category: 'Vestimentas', unit: 'PAR', minStock: 5,
      attrs: ['Marca','Comprimento','CA'],
      vars: [
        { values: { Marca:'Delta Plus', Comprimento:'40cm', CA:'11800' }, stock: 10 },
        { values: { Marca:'Volk', Comprimento:'50cm', CA:'11900' }, stock: 6 },
      ]},
    { name: 'Perneira de Segurança', group: 'EPIs', category: 'Vestimentas', unit: 'PAR', minStock: 3,
      attrs: ['Marca','Material','CA'],
      vars: [
        { values: { Marca:'Delta Plus', Material:'Raspa', CA:'12100' }, stock: 8 },
        { values: { Marca:'Volk', Material:'Vaqueta', CA:'12200' }, stock: 4 },
      ]},

    // ═══════════════════════════════════════
    //  EPIs > Proteção Facial
    // ═══════════════════════════════════════
    { name: 'Protetor Facial', group: 'EPIs', category: 'Proteção Facial', unit: 'UN', minStock: 5,
      attrs: ['Marca','Modelo','Visor','CA'],
      vars: [
        { values: { Marca:'Carbografite', Modelo:'CG 200', Visor:'Incolor', CA:'9400' }, stock: 10 },
        { values: { Marca:'Carbografite', Modelo:'CG 200', Visor:'Verde Ton.3', CA:'9401' }, stock: 5 },
        { values: { Marca:'MSA', Modelo:'V-Gard Frame', Visor:'Incolor', CA:'9500' }, stock: 8 },
      ]},
    { name: 'Máscara de Solda', group: 'EPIs', category: 'Proteção Facial', unit: 'UN', minStock: 3,
      attrs: ['Marca','Modelo','Tipo','Tonalidade'],
      vars: [
        { values: { Marca:'Esab', Modelo:'A20', Tipo:'Escurecimento Automático', Tonalidade:'9-13' }, stock: 4 },
        { values: { Marca:'Carbografite', Modelo:'CG 500', Tipo:'Escurecimento Automático', Tonalidade:'9-13' }, stock: 3 },
        { values: { Marca:'Carbografite', Modelo:'CG 100', Tipo:'Convencional', Tonalidade:'10' }, stock: 6 },
      ]},

    // ═══════════════════════════════════════
    //  FERRAMENTAS > Manuais
    // ═══════════════════════════════════════
    { name: 'Chave de Fenda', group: 'Ferramentas', category: 'Manuais', unit: 'UN', minStock: 3,
      attrs: ['Marca','Tamanho','Ponta'],
      vars: [
        { values: { Marca:'Tramontina PRO', Tamanho:'3/16x4"', Ponta:'Fenda' }, stock: 12 },
        { values: { Marca:'Tramontina PRO', Tamanho:'1/4x5"', Ponta:'Fenda' }, stock: 8 },
        { values: { Marca:'Tramontina PRO', Tamanho:'5/16x6"', Ponta:'Fenda' }, stock: 6 },
        { values: { Marca:'Gedore', Tamanho:'3/16x4"', Ponta:'Fenda' }, stock: 4 },
        { values: { Marca:'Gedore', Tamanho:'1/4x6"', Ponta:'Fenda' }, stock: 3 },
      ]},
    { name: 'Chave Phillips', group: 'Ferramentas', category: 'Manuais', unit: 'UN', minStock: 3,
      attrs: ['Marca','Tamanho','Ponta'],
      vars: [
        { values: { Marca:'Tramontina PRO', Tamanho:'PH1x4"', Ponta:'Phillips' }, stock: 10 },
        { values: { Marca:'Tramontina PRO', Tamanho:'PH2x5"', Ponta:'Phillips' }, stock: 14 },
        { values: { Marca:'Tramontina PRO', Tamanho:'PH3x6"', Ponta:'Phillips' }, stock: 5 },
        { values: { Marca:'Gedore', Tamanho:'PH2x5"', Ponta:'Phillips' }, stock: 7 },
      ]},
    { name: 'Alicate Universal', group: 'Ferramentas', category: 'Manuais', unit: 'UN', minStock: 3,
      attrs: ['Marca','Tamanho','Isolamento'],
      vars: [
        { values: { Marca:'Tramontina PRO', Tamanho:'8"', Isolamento:'1000V' }, stock: 6 },
        { values: { Marca:'Gedore', Tamanho:'8"', Isolamento:'1000V' }, stock: 4 },
        { values: { Marca:'Vonder', Tamanho:'8"', Isolamento:'Sem' }, stock: 10 },
      ]},
    { name: 'Alicate de Corte', group: 'Ferramentas', category: 'Manuais', unit: 'UN', minStock: 3,
      attrs: ['Marca','Tamanho','Isolamento'],
      vars: [
        { values: { Marca:'Tramontina PRO', Tamanho:'6"', Isolamento:'1000V' }, stock: 5 },
        { values: { Marca:'Gedore', Tamanho:'6"', Isolamento:'1000V' }, stock: 3 },
      ]},
    { name: 'Alicate de Bico', group: 'Ferramentas', category: 'Manuais', unit: 'UN', minStock: 3,
      attrs: ['Marca','Tamanho','Isolamento'],
      vars: [
        { values: { Marca:'Tramontina PRO', Tamanho:'6"', Isolamento:'1000V' }, stock: 4 },
        { values: { Marca:'Tramontina PRO', Tamanho:'8"', Isolamento:'Sem' }, stock: 7 },
      ]},
    { name: 'Chave Combinada', group: 'Ferramentas', category: 'Manuais', unit: 'UN', minStock: 2,
      attrs: ['Marca','Medida'],
      vars: [
        { values: { Marca:'Gedore', Medida:'8mm' }, stock: 6 },
        { values: { Marca:'Gedore', Medida:'10mm' }, stock: 8 },
        { values: { Marca:'Gedore', Medida:'12mm' }, stock: 5 },
        { values: { Marca:'Gedore', Medida:'13mm' }, stock: 7 },
        { values: { Marca:'Gedore', Medida:'14mm' }, stock: 4 },
        { values: { Marca:'Gedore', Medida:'17mm' }, stock: 6 },
        { values: { Marca:'Gedore', Medida:'19mm' }, stock: 3 },
        { values: { Marca:'Gedore', Medida:'22mm' }, stock: 2 },
      ]},
    { name: 'Martelo', group: 'Ferramentas', category: 'Manuais', unit: 'UN', minStock: 2,
      attrs: ['Marca','Tipo','Peso'],
      vars: [
        { values: { Marca:'Tramontina', Tipo:'Unha', Peso:'25mm' }, stock: 8 },
        { values: { Marca:'Tramontina', Tipo:'Bola', Peso:'300g' }, stock: 4 },
        { values: { Marca:'Gedore', Tipo:'Unha', Peso:'27mm' }, stock: 3 },
      ]},
    { name: 'Trena', group: 'Ferramentas', category: 'Manuais', unit: 'UN', minStock: 3,
      attrs: ['Marca','Comprimento','Largura Fita'],
      vars: [
        { values: { Marca:'Stanley', Comprimento:'3m', 'Largura Fita':'13mm' }, stock: 15 },
        { values: { Marca:'Stanley', Comprimento:'5m', 'Largura Fita':'19mm' }, stock: 20 },
        { values: { Marca:'Stanley', Comprimento:'8m', 'Largura Fita':'25mm' }, stock: 10 },
        { values: { Marca:'Vonder', Comprimento:'5m', 'Largura Fita':'19mm' }, stock: 12 },
      ]},
    { name: 'Chave Allen', group: 'Ferramentas', category: 'Manuais', unit: 'UN', minStock: 2,
      attrs: ['Marca','Medida','Tipo'],
      vars: [
        { values: { Marca:'Gedore', Medida:'3mm', Tipo:'Curta' }, stock: 5 },
        { values: { Marca:'Gedore', Medida:'4mm', Tipo:'Curta' }, stock: 6 },
        { values: { Marca:'Gedore', Medida:'5mm', Tipo:'Curta' }, stock: 7 },
        { values: { Marca:'Gedore', Medida:'6mm', Tipo:'Curta' }, stock: 4 },
        { values: { Marca:'Gedore', Medida:'8mm', Tipo:'Longa' }, stock: 3 },
      ]},
    { name: 'Chave de Grifo', group: 'Ferramentas', category: 'Manuais', unit: 'UN', minStock: 1,
      attrs: ['Marca','Tamanho'],
      vars: [
        { values: { Marca:'Gedore', Tamanho:'10"' }, stock: 3 },
        { values: { Marca:'Gedore', Tamanho:'14"' }, stock: 2 },
        { values: { Marca:'Gedore', Tamanho:'18"' }, stock: 1 },
      ]},
    { name: 'Arco de Serra', group: 'Ferramentas', category: 'Manuais', unit: 'UN', minStock: 2,
      attrs: ['Marca','Tamanho'],
      vars: [
        { values: { Marca:'Starrett', Tamanho:'12"' }, stock: 5 },
        { values: { Marca:'Tramontina', Tamanho:'12"' }, stock: 8 },
      ]},
    { name: 'Lâmina de Serra', group: 'Ferramentas', category: 'Manuais', unit: 'UN', minStock: 5,
      attrs: ['Marca','Dentes/pol','Material'],
      vars: [
        { values: { Marca:'Starrett', 'Dentes/pol':'18', Material:'Bimetal' }, stock: 20 },
        { values: { Marca:'Starrett', 'Dentes/pol':'24', Material:'Bimetal' }, stock: 15 },
        { values: { Marca:'Starrett', 'Dentes/pol':'32', Material:'Bimetal' }, stock: 10 },
      ]},

    // ═══════════════════════════════════════
    //  FERRAMENTAS > Elétricas
    // ═══════════════════════════════════════
    { name: 'Furadeira', group: 'Ferramentas', category: 'Elétricas', unit: 'UN', minStock: 1,
      attrs: ['Marca','Modelo','Potência','Voltagem'],
      vars: [
        { values: { Marca:'Bosch', Modelo:'GSB 550 RE', Potência:'550W', Voltagem:'220V' }, stock: 3 },
        { values: { Marca:'DeWalt', Modelo:'DWD024', Potência:'700W', Voltagem:'220V' }, stock: 2 },
        { values: { Marca:'Makita', Modelo:'HP1640', Potência:'680W', Voltagem:'220V' }, stock: 2 },
      ]},
    { name: 'Esmerilhadeira', group: 'Ferramentas', category: 'Elétricas', unit: 'UN', minStock: 1,
      attrs: ['Marca','Modelo','Disco','Potência'],
      vars: [
        { values: { Marca:'Bosch', Modelo:'GWS 700', Disco:'4.1/2"', Potência:'710W' }, stock: 4 },
        { values: { Marca:'DeWalt', Modelo:'DWE4020', Disco:'4.1/2"', Potência:'700W' }, stock: 2 },
        { values: { Marca:'Makita', Modelo:'GA4530', Disco:'4.1/2"', Potência:'720W' }, stock: 1 },
        { values: { Marca:'Bosch', Modelo:'GWS 22-180', Disco:'7"', Potência:'2200W' }, stock: 1 },
      ]},
    { name: 'Parafusadeira', group: 'Ferramentas', category: 'Elétricas', unit: 'UN', minStock: 1,
      attrs: ['Marca','Modelo','Voltagem','Torque'],
      vars: [
        { values: { Marca:'Bosch', Modelo:'GSR 120-LI', Voltagem:'12V', Torque:'30Nm' }, stock: 3 },
        { values: { Marca:'DeWalt', Modelo:'DCD700', Voltagem:'12V', Torque:'24Nm' }, stock: 2 },
        { values: { Marca:'Makita', Modelo:'DF333D', Voltagem:'12V', Torque:'30Nm' }, stock: 1 },
      ]},
    { name: 'Serra Circular', group: 'Ferramentas', category: 'Elétricas', unit: 'UN', minStock: 1,
      attrs: ['Marca','Modelo','Disco','Potência'],
      vars: [
        { values: { Marca:'Bosch', Modelo:'GKS 150', Disco:'7.1/4"', Potência:'1500W' }, stock: 1 },
        { values: { Marca:'DeWalt', Modelo:'DWE560', Disco:'7.1/4"', Potência:'1400W' }, stock: 1 },
      ]},
    { name: 'Martelete', group: 'Ferramentas', category: 'Elétricas', unit: 'UN', minStock: 1,
      attrs: ['Marca','Modelo','Potência','Encaixe'],
      vars: [
        { values: { Marca:'Bosch', Modelo:'GBH 2-24D', Potência:'820W', Encaixe:'SDS Plus' }, stock: 1 },
        { values: { Marca:'DeWalt', Modelo:'D25133K', Potência:'800W', Encaixe:'SDS Plus' }, stock: 1 },
      ]},

    // ═══════════════════════════════════════
    //  FERRAMENTAS > Medição
    // ═══════════════════════════════════════
    { name: 'Paquímetro', group: 'Ferramentas', category: 'Medição', unit: 'UN', minStock: 1,
      attrs: ['Marca','Capacidade','Resolução','Tipo'],
      vars: [
        { values: { Marca:'Mitutoyo', Capacidade:'150mm', Resolução:'0.05mm', Tipo:'Analógico' }, stock: 3 },
        { values: { Marca:'Mitutoyo', Capacidade:'150mm', Resolução:'0.01mm', Tipo:'Digital' }, stock: 2 },
        { values: { Marca:'Starrett', Capacidade:'200mm', Resolução:'0.02mm', Tipo:'Analógico' }, stock: 1 },
      ]},
    { name: 'Nível de Bolha', group: 'Ferramentas', category: 'Medição', unit: 'UN', minStock: 2,
      attrs: ['Marca','Comprimento'],
      vars: [
        { values: { Marca:'Stanley', Comprimento:'30cm' }, stock: 5 },
        { values: { Marca:'Stanley', Comprimento:'60cm' }, stock: 4 },
        { values: { Marca:'Stanley', Comprimento:'100cm' }, stock: 2 },
      ]},
    { name: 'Esquadro', group: 'Ferramentas', category: 'Medição', unit: 'UN', minStock: 2,
      attrs: ['Marca','Tamanho','Tipo'],
      vars: [
        { values: { Marca:'Starrett', Tamanho:'8"', Tipo:'Combinado' }, stock: 3 },
        { values: { Marca:'Stanley', Tamanho:'12"', Tipo:'Carpinteiro' }, stock: 4 },
      ]},

    // ═══════════════════════════════════════
    //  ELÉTRICA > Fios e Cabos
    // ═══════════════════════════════════════
    { name: 'Fio Flexível', group: 'Elétrica', category: 'Fios e Cabos', unit: 'M', minStock: 50,
      attrs: ['Marca','Seção','Cor'],
      vars: [
        { values: { Marca:'Prysmian', Seção:'1.5mm²', Cor:'Azul' }, stock: 500 },
        { values: { Marca:'Prysmian', Seção:'1.5mm²', Cor:'Vermelho' }, stock: 400 },
        { values: { Marca:'Prysmian', Seção:'1.5mm²', Cor:'Preto' }, stock: 450 },
        { values: { Marca:'Prysmian', Seção:'1.5mm²', Cor:'Verde' }, stock: 300 },
        { values: { Marca:'Prysmian', Seção:'2.5mm²', Cor:'Azul' }, stock: 350 },
        { values: { Marca:'Prysmian', Seção:'2.5mm²', Cor:'Vermelho' }, stock: 300 },
        { values: { Marca:'Prysmian', Seção:'2.5mm²', Cor:'Preto' }, stock: 280 },
        { values: { Marca:'Prysmian', Seção:'2.5mm²', Cor:'Verde' }, stock: 200 },
        { values: { Marca:'Prysmian', Seção:'4mm²', Cor:'Preto' }, stock: 150 },
        { values: { Marca:'Prysmian', Seção:'6mm²', Cor:'Preto' }, stock: 100 },
        { values: { Marca:'Prysmian', Seção:'10mm²', Cor:'Preto' }, stock: 50 },
      ]},
    { name: 'Cabo PP', group: 'Elétrica', category: 'Fios e Cabos', unit: 'M', minStock: 30,
      attrs: ['Marca','Condutores','Seção'],
      vars: [
        { values: { Marca:'Prysmian', Condutores:'2', Seção:'1.5mm²' }, stock: 200 },
        { values: { Marca:'Prysmian', Condutores:'2', Seção:'2.5mm²' }, stock: 150 },
        { values: { Marca:'Prysmian', Condutores:'3', Seção:'1.5mm²' }, stock: 180 },
        { values: { Marca:'Prysmian', Condutores:'3', Seção:'2.5mm²' }, stock: 120 },
        { values: { Marca:'Prysmian', Condutores:'4', Seção:'2.5mm²' }, stock: 60 },
      ]},
    { name: 'Cabo de Rede', group: 'Elétrica', category: 'Fios e Cabos', unit: 'M', minStock: 50,
      attrs: ['Marca','Categoria','Blindagem'],
      vars: [
        { values: { Marca:'Furukawa', Categoria:'Cat5e', Blindagem:'UTP' }, stock: 300 },
        { values: { Marca:'Furukawa', Categoria:'Cat6', Blindagem:'UTP' }, stock: 200 },
        { values: { Marca:'Furukawa', Categoria:'Cat6', Blindagem:'FTP' }, stock: 100 },
      ]},

    // ═══════════════════════════════════════
    //  ELÉTRICA > Disjuntores
    // ═══════════════════════════════════════
    { name: 'Disjuntor Monopolar', group: 'Elétrica', category: 'Disjuntores', unit: 'UN', minStock: 5,
      attrs: ['Marca','Corrente','Curva'],
      vars: [
        { values: { Marca:'Schneider', Corrente:'10A', Curva:'C' }, stock: 30 },
        { values: { Marca:'Schneider', Corrente:'16A', Curva:'C' }, stock: 25 },
        { values: { Marca:'Schneider', Corrente:'20A', Curva:'C' }, stock: 35 },
        { values: { Marca:'Schneider', Corrente:'25A', Curva:'C' }, stock: 20 },
        { values: { Marca:'Schneider', Corrente:'32A', Curva:'C' }, stock: 15 },
        { values: { Marca:'ABB', Corrente:'16A', Curva:'C' }, stock: 10 },
        { values: { Marca:'ABB', Corrente:'25A', Curva:'C' }, stock: 8 },
      ]},
    { name: 'Disjuntor Bipolar', group: 'Elétrica', category: 'Disjuntores', unit: 'UN', minStock: 3,
      attrs: ['Marca','Corrente','Curva'],
      vars: [
        { values: { Marca:'Schneider', Corrente:'20A', Curva:'C' }, stock: 12 },
        { values: { Marca:'Schneider', Corrente:'32A', Curva:'C' }, stock: 10 },
        { values: { Marca:'Schneider', Corrente:'40A', Curva:'C' }, stock: 6 },
      ]},
    { name: 'Disjuntor Tripolar', group: 'Elétrica', category: 'Disjuntores', unit: 'UN', minStock: 2,
      attrs: ['Marca','Corrente','Curva'],
      vars: [
        { values: { Marca:'Schneider', Corrente:'25A', Curva:'C' }, stock: 5 },
        { values: { Marca:'Schneider', Corrente:'32A', Curva:'C' }, stock: 4 },
        { values: { Marca:'Schneider', Corrente:'50A', Curva:'C' }, stock: 3 },
        { values: { Marca:'ABB', Corrente:'63A', Curva:'C' }, stock: 2 },
      ]},
    { name: 'Disjuntor DR', group: 'Elétrica', category: 'Disjuntores', unit: 'UN', minStock: 2,
      attrs: ['Marca','Corrente','Sensibilidade','Polos'],
      vars: [
        { values: { Marca:'Schneider', Corrente:'25A', Sensibilidade:'30mA', Polos:'2P' }, stock: 5 },
        { values: { Marca:'Schneider', Corrente:'40A', Sensibilidade:'30mA', Polos:'2P' }, stock: 4 },
        { values: { Marca:'ABB', Corrente:'25A', Sensibilidade:'30mA', Polos:'4P' }, stock: 2 },
      ]},

    // ═══════════════════════════════════════
    //  ELÉTRICA > Tomadas e Interruptores
    // ═══════════════════════════════════════
    { name: 'Tomada 2P+T', group: 'Elétrica', category: 'Tomadas e Interruptores', unit: 'UN', minStock: 10,
      attrs: ['Marca','Corrente','Cor'],
      vars: [
        { values: { Marca:'Schneider', Corrente:'10A', Cor:'Branco' }, stock: 50 },
        { values: { Marca:'Schneider', Corrente:'20A', Cor:'Branco' }, stock: 40 },
        { values: { Marca:'Tramontina', Corrente:'10A', Cor:'Branco' }, stock: 60 },
        { values: { Marca:'Tramontina', Corrente:'20A', Cor:'Branco' }, stock: 35 },
      ]},
    { name: 'Interruptor Simples', group: 'Elétrica', category: 'Tomadas e Interruptores', unit: 'UN', minStock: 10,
      attrs: ['Marca','Seções','Cor'],
      vars: [
        { values: { Marca:'Schneider', Seções:'1', Cor:'Branco' }, stock: 30 },
        { values: { Marca:'Schneider', Seções:'2', Cor:'Branco' }, stock: 20 },
        { values: { Marca:'Schneider', Seções:'3', Cor:'Branco' }, stock: 10 },
        { values: { Marca:'Tramontina', Seções:'1', Cor:'Branco' }, stock: 40 },
        { values: { Marca:'Tramontina', Seções:'2', Cor:'Branco' }, stock: 25 },
      ]},

    // ═══════════════════════════════════════
    //  ELÉTRICA > Eletrodutos
    // ═══════════════════════════════════════
    { name: 'Eletroduto PVC', group: 'Elétrica', category: 'Eletrodutos', unit: 'UN', minStock: 10,
      attrs: ['Marca','Diâmetro','Comprimento'],
      vars: [
        { values: { Marca:'Tigre', Diâmetro:'20mm', Comprimento:'3m' }, stock: 40 },
        { values: { Marca:'Tigre', Diâmetro:'25mm', Comprimento:'3m' }, stock: 30 },
        { values: { Marca:'Tigre', Diâmetro:'32mm', Comprimento:'3m' }, stock: 20 },
      ]},
    { name: 'Curva Eletroduto', group: 'Elétrica', category: 'Eletrodutos', unit: 'UN', minStock: 10,
      attrs: ['Material','Diâmetro','Ângulo'],
      vars: [
        { values: { Material:'PVC', Diâmetro:'20mm', Ângulo:'90°' }, stock: 50 },
        { values: { Material:'PVC', Diâmetro:'25mm', Ângulo:'90°' }, stock: 40 },
        { values: { Material:'PVC', Diâmetro:'32mm', Ângulo:'90°' }, stock: 25 },
      ]},

    // ═══════════════════════════════════════
    //  ELÉTRICA > Iluminação
    // ═══════════════════════════════════════
    { name: 'Lâmpada LED Bulbo', group: 'Elétrica', category: 'Iluminação', unit: 'UN', minStock: 10,
      attrs: ['Marca','Potência','Temperatura','Base'],
      vars: [
        { values: { Marca:'Philips', Potência:'9W', Temperatura:'3000K', Base:'E27' }, stock: 40 },
        { values: { Marca:'Philips', Potência:'9W', Temperatura:'6500K', Base:'E27' }, stock: 50 },
        { values: { Marca:'Philips', Potência:'12W', Temperatura:'6500K', Base:'E27' }, stock: 30 },
        { values: { Marca:'Osram', Potência:'9W', Temperatura:'6500K', Base:'E27' }, stock: 35 },
        { values: { Marca:'Osram', Potência:'15W', Temperatura:'6500K', Base:'E27' }, stock: 20 },
      ]},
    { name: 'Lâmpada Tubular LED', group: 'Elétrica', category: 'Iluminação', unit: 'UN', minStock: 5,
      attrs: ['Marca','Potência','Comprimento','Temperatura'],
      vars: [
        { values: { Marca:'Philips', Potência:'18W', Comprimento:'120cm', Temperatura:'6500K' }, stock: 20 },
        { values: { Marca:'Osram', Potência:'18W', Comprimento:'120cm', Temperatura:'6500K' }, stock: 15 },
        { values: { Marca:'Philips', Potência:'9W', Comprimento:'60cm', Temperatura:'6500K' }, stock: 25 },
      ]},
    { name: 'Luminária de Embutir', group: 'Elétrica', category: 'Iluminação', unit: 'UN', minStock: 3,
      attrs: ['Marca','Potência','Formato','Cor'],
      vars: [
        { values: { Marca:'Stellatech', Potência:'18W', Formato:'Quadrado', Cor:'Branco' }, stock: 15 },
        { values: { Marca:'Stellatech', Potência:'18W', Formato:'Redondo', Cor:'Branco' }, stock: 12 },
        { values: { Marca:'Stellatech', Potência:'24W', Formato:'Quadrado', Cor:'Branco' }, stock: 8 },
      ]},

    // ═══════════════════════════════════════
    //  HIDRÁULICA > Conexões
    // ═══════════════════════════════════════
    { name: 'Joelho 90°', group: 'Hidráulica', category: 'Conexões', unit: 'UN', minStock: 10,
      attrs: ['Material','Diâmetro','Tipo'],
      vars: [
        { values: { Material:'PVC', Diâmetro:'20mm', Tipo:'Soldável' }, stock: 80 },
        { values: { Material:'PVC', Diâmetro:'25mm', Tipo:'Soldável' }, stock: 60 },
        { values: { Material:'PVC', Diâmetro:'32mm', Tipo:'Soldável' }, stock: 40 },
        { values: { Material:'PVC', Diâmetro:'40mm', Tipo:'Soldável' }, stock: 30 },
        { values: { Material:'PVC', Diâmetro:'50mm', Tipo:'Soldável' }, stock: 25 },
        { values: { Material:'CPVC', Diâmetro:'22mm', Tipo:'Soldável' }, stock: 20 },
        { values: { Material:'CPVC', Diâmetro:'28mm', Tipo:'Soldável' }, stock: 15 },
      ]},
    { name: 'Joelho 45°', group: 'Hidráulica', category: 'Conexões', unit: 'UN', minStock: 10,
      attrs: ['Material','Diâmetro','Tipo'],
      vars: [
        { values: { Material:'PVC', Diâmetro:'20mm', Tipo:'Soldável' }, stock: 40 },
        { values: { Material:'PVC', Diâmetro:'25mm', Tipo:'Soldável' }, stock: 30 },
        { values: { Material:'PVC', Diâmetro:'50mm', Tipo:'Soldável' }, stock: 20 },
      ]},
    { name: 'Tê', group: 'Hidráulica', category: 'Conexões', unit: 'UN', minStock: 10,
      attrs: ['Material','Diâmetro','Tipo'],
      vars: [
        { values: { Material:'PVC', Diâmetro:'20mm', Tipo:'Soldável' }, stock: 50 },
        { values: { Material:'PVC', Diâmetro:'25mm', Tipo:'Soldável' }, stock: 45 },
        { values: { Material:'PVC', Diâmetro:'32mm', Tipo:'Soldável' }, stock: 30 },
        { values: { Material:'PVC', Diâmetro:'50mm', Tipo:'Soldável' }, stock: 20 },
      ]},
    { name: 'Luva de Correr', group: 'Hidráulica', category: 'Conexões', unit: 'UN', minStock: 10,
      attrs: ['Material','Diâmetro'],
      vars: [
        { values: { Material:'PVC', Diâmetro:'20mm' }, stock: 40 },
        { values: { Material:'PVC', Diâmetro:'25mm' }, stock: 35 },
        { values: { Material:'PVC', Diâmetro:'32mm' }, stock: 25 },
      ]},
    { name: 'Cap', group: 'Hidráulica', category: 'Conexões', unit: 'UN', minStock: 10,
      attrs: ['Material','Diâmetro'],
      vars: [
        { values: { Material:'PVC', Diâmetro:'20mm' }, stock: 30 },
        { values: { Material:'PVC', Diâmetro:'25mm' }, stock: 25 },
        { values: { Material:'PVC', Diâmetro:'50mm' }, stock: 15 },
      ]},
    { name: 'Registro Esfera', group: 'Hidráulica', category: 'Conexões', unit: 'UN', minStock: 5,
      attrs: ['Material','Diâmetro','Marca'],
      vars: [
        { values: { Material:'PVC', Diâmetro:'20mm', Marca:'Tigre' }, stock: 12 },
        { values: { Material:'PVC', Diâmetro:'25mm', Marca:'Tigre' }, stock: 10 },
        { values: { Material:'PVC', Diâmetro:'32mm', Marca:'Tigre' }, stock: 6 },
        { values: { Material:'Latão', Diâmetro:'1/2"', Marca:'Deca' }, stock: 8 },
        { values: { Material:'Latão', Diâmetro:'3/4"', Marca:'Deca' }, stock: 5 },
      ]},
    { name: 'Adaptador Soldável', group: 'Hidráulica', category: 'Conexões', unit: 'UN', minStock: 10,
      attrs: ['Material','Diâmetro','Rosca'],
      vars: [
        { values: { Material:'PVC', Diâmetro:'20mm', Rosca:'1/2"' }, stock: 40 },
        { values: { Material:'PVC', Diâmetro:'25mm', Rosca:'3/4"' }, stock: 35 },
        { values: { Material:'PVC', Diâmetro:'32mm', Rosca:'1"' }, stock: 20 },
      ]},

    // ═══════════════════════════════════════
    //  HIDRÁULICA > Tubos
    // ═══════════════════════════════════════
    { name: 'Tubo PVC Soldável', group: 'Hidráulica', category: 'Tubos', unit: 'UN', minStock: 5,
      attrs: ['Marca','Diâmetro','Comprimento'],
      vars: [
        { values: { Marca:'Tigre', Diâmetro:'20mm', Comprimento:'3m' }, stock: 30 },
        { values: { Marca:'Tigre', Diâmetro:'25mm', Comprimento:'3m' }, stock: 25 },
        { values: { Marca:'Tigre', Diâmetro:'32mm', Comprimento:'3m' }, stock: 15 },
        { values: { Marca:'Tigre', Diâmetro:'50mm', Comprimento:'3m' }, stock: 10 },
      ]},
    { name: 'Tubo PVC Esgoto', group: 'Hidráulica', category: 'Tubos', unit: 'UN', minStock: 3,
      attrs: ['Marca','Diâmetro','Comprimento'],
      vars: [
        { values: { Marca:'Tigre', Diâmetro:'40mm', Comprimento:'3m' }, stock: 12 },
        { values: { Marca:'Tigre', Diâmetro:'50mm', Comprimento:'3m' }, stock: 10 },
        { values: { Marca:'Tigre', Diâmetro:'75mm', Comprimento:'3m' }, stock: 8 },
        { values: { Marca:'Tigre', Diâmetro:'100mm', Comprimento:'3m' }, stock: 6 },
      ]},

    // ═══════════════════════════════════════
    //  HIDRÁULICA > Adesivos
    // ═══════════════════════════════════════
    { name: 'Adesivo PVC', group: 'Hidráulica', category: 'Adesivos e Vedação', unit: 'UN', minStock: 5,
      attrs: ['Marca','Volume'],
      vars: [
        { values: { Marca:'Tigre', Volume:'75g' }, stock: 15 },
        { values: { Marca:'Tigre', Volume:'175g' }, stock: 10 },
        { values: { Marca:'Amanco', Volume:'75g' }, stock: 8 },
      ]},
    { name: 'Fita Veda Rosca', group: 'Hidráulica', category: 'Adesivos e Vedação', unit: 'UN', minStock: 10,
      attrs: ['Marca','Largura','Comprimento'],
      vars: [
        { values: { Marca:'Tigre', Largura:'18mm', Comprimento:'10m' }, stock: 30 },
        { values: { Marca:'Tigre', Largura:'18mm', Comprimento:'25m' }, stock: 20 },
      ]},

    // ═══════════════════════════════════════
    //  LIMPEZA > Produtos
    // ═══════════════════════════════════════
    { name: 'Desinfetante', group: 'Limpeza', category: 'Produtos', unit: 'UN', minStock: 5,
      attrs: ['Marca','Fragrância','Volume'],
      vars: [
        { values: { Marca:'Veja', Fragrância:'Lavanda', Volume:'2L' }, stock: 20 },
        { values: { Marca:'Veja', Fragrância:'Pinho', Volume:'2L' }, stock: 15 },
        { values: { Marca:'Ypê', Fragrância:'Lavanda', Volume:'2L' }, stock: 25 },
        { values: { Marca:'Ypê', Fragrância:'Eucalipto', Volume:'2L' }, stock: 18 },
      ]},
    { name: 'Detergente', group: 'Limpeza', category: 'Produtos', unit: 'UN', minStock: 5,
      attrs: ['Marca','Tipo','Volume'],
      vars: [
        { values: { Marca:'Ypê', Tipo:'Neutro', Volume:'500ml' }, stock: 40 },
        { values: { Marca:'Ypê', Tipo:'Coco', Volume:'500ml' }, stock: 30 },
        { values: { Marca:'Limpol', Tipo:'Neutro', Volume:'500ml' }, stock: 35 },
      ]},
    { name: 'Água Sanitária', group: 'Limpeza', category: 'Produtos', unit: 'UN', minStock: 5,
      attrs: ['Marca','Volume'],
      vars: [
        { values: { Marca:'Q-Boa', Volume:'1L' }, stock: 30 },
        { values: { Marca:'Q-Boa', Volume:'5L' }, stock: 12 },
        { values: { Marca:'Ypê', Volume:'1L' }, stock: 25 },
      ]},
    { name: 'Sabão em Pó', group: 'Limpeza', category: 'Produtos', unit: 'UN', minStock: 5,
      attrs: ['Marca','Peso'],
      vars: [
        { values: { Marca:'Omo', Peso:'1kg' }, stock: 15 },
        { values: { Marca:'Omo', Peso:'2kg' }, stock: 8 },
        { values: { Marca:'Ypê', Peso:'1kg' }, stock: 20 },
      ]},
    { name: 'Limpa Alumínio', group: 'Limpeza', category: 'Produtos', unit: 'UN', minStock: 3,
      attrs: ['Marca','Volume'],
      vars: [
        { values: { Marca:'Veja', Volume:'500ml' }, stock: 10 },
        { values: { Marca:'Limpol', Volume:'500ml' }, stock: 8 },
      ]},
    { name: 'Desengraxante', group: 'Limpeza', category: 'Produtos', unit: 'UN', minStock: 3,
      attrs: ['Marca','Volume','Tipo'],
      vars: [
        { values: { Marca:'Quimatic', Volume:'1L', Tipo:'Concentrado' }, stock: 6 },
        { values: { Marca:'Quimatic', Volume:'5L', Tipo:'Concentrado' }, stock: 3 },
        { values: { Marca:'WD-40', Volume:'500ml', Tipo:'Spray' }, stock: 10 },
      ]},

    // ═══════════════════════════════════════
    //  LIMPEZA > Descartáveis
    // ═══════════════════════════════════════
    { name: 'Saco de Lixo', group: 'Limpeza', category: 'Descartáveis', unit: 'UN', minStock: 10,
      attrs: ['Marca','Capacidade','Cor'],
      vars: [
        { values: { Marca:'Dover Roll', Capacidade:'30L', Cor:'Preto' }, stock: 50 },
        { values: { Marca:'Dover Roll', Capacidade:'50L', Cor:'Preto' }, stock: 40 },
        { values: { Marca:'Dover Roll', Capacidade:'100L', Cor:'Preto' }, stock: 30 },
        { values: { Marca:'Dover Roll', Capacidade:'100L', Cor:'Azul' }, stock: 15 },
      ]},
    { name: 'Papel Toalha', group: 'Limpeza', category: 'Descartáveis', unit: 'UN', minStock: 10,
      attrs: ['Marca','Folhas','Tipo'],
      vars: [
        { values: { Marca:'Snob', Folhas:'2 rolos', Tipo:'Interfolhado' }, stock: 24 },
        { values: { Marca:'Mili', Folhas:'2 rolos', Tipo:'Rolo' }, stock: 30 },
      ]},
    { name: 'Papel Higiênico', group: 'Limpeza', category: 'Descartáveis', unit: 'UN', minStock: 5,
      attrs: ['Marca','Folhas','Tipo'],
      vars: [
        { values: { Marca:'Personal', Folhas:'Dupla', Tipo:'Rolão 300m' }, stock: 12 },
        { values: { Marca:'Mili', Folhas:'Simples', Tipo:'Rolão 300m' }, stock: 8 },
      ]},
    { name: 'Pano Multiuso', group: 'Limpeza', category: 'Descartáveis', unit: 'RL', minStock: 5,
      attrs: ['Marca','Cor','Dimensão'],
      vars: [
        { values: { Marca:'Scotch-Brite', Cor:'Azul', Dimensão:'30cmx50m' }, stock: 10 },
        { values: { Marca:'Scotch-Brite', Cor:'Rosa', Dimensão:'30cmx50m' }, stock: 8 },
      ]},

    // ═══════════════════════════════════════
    //  ESCRITÓRIO > Papelaria
    // ═══════════════════════════════════════
    { name: 'Caneta Esferográfica', group: 'Escritório', category: 'Papelaria', unit: 'UN', minStock: 10,
      attrs: ['Marca','Cor','Tipo'],
      vars: [
        { values: { Marca:'BIC', Cor:'Azul', Tipo:'Cristal' }, stock: 100 },
        { values: { Marca:'BIC', Cor:'Preta', Tipo:'Cristal' }, stock: 80 },
        { values: { Marca:'BIC', Cor:'Vermelha', Tipo:'Cristal' }, stock: 40 },
        { values: { Marca:'Pilot', Cor:'Azul', Tipo:'BPS Grip' }, stock: 30 },
        { values: { Marca:'Pilot', Cor:'Preta', Tipo:'BPS Grip' }, stock: 25 },
      ]},
    { name: 'Lápis', group: 'Escritório', category: 'Papelaria', unit: 'UN', minStock: 10,
      attrs: ['Marca','Graduação'],
      vars: [
        { values: { Marca:'Faber-Castell', Graduação:'HB' }, stock: 50 },
        { values: { Marca:'Faber-Castell', Graduação:'2B' }, stock: 30 },
      ]},
    { name: 'Borracha', group: 'Escritório', category: 'Papelaria', unit: 'UN', minStock: 10,
      attrs: ['Marca','Tipo'],
      vars: [
        { values: { Marca:'Faber-Castell', Tipo:'Branca' }, stock: 40 },
        { values: { Marca:'Pentel', Tipo:'Ain' }, stock: 20 },
      ]},
    { name: 'Envelope', group: 'Escritório', category: 'Papelaria', unit: 'UN', minStock: 20,
      attrs: ['Tipo','Tamanho'],
      vars: [
        { values: { Tipo:'Saco Kraft', Tamanho:'A4' }, stock: 100 },
        { values: { Tipo:'Saco Kraft', Tamanho:'Ofício' }, stock: 80 },
        { values: { Tipo:'Branco', Tamanho:'Carta' }, stock: 60 },
      ]},
    { name: 'Grampos', group: 'Escritório', category: 'Papelaria', unit: 'CX', minStock: 5,
      attrs: ['Marca','Tipo'],
      vars: [
        { values: { Marca:'ACC', Tipo:'26/6' }, stock: 30 },
        { values: { Marca:'ACC', Tipo:'23/10' }, stock: 15 },
      ]},
    { name: 'Fita Adesiva', group: 'Escritório', category: 'Papelaria', unit: 'UN', minStock: 5,
      attrs: ['Marca','Largura','Tipo'],
      vars: [
        { values: { Marca:'3M', Largura:'12mm', Tipo:'Transparente' }, stock: 20 },
        { values: { Marca:'3M', Largura:'48mm', Tipo:'Transparente' }, stock: 15 },
        { values: { Marca:'3M', Largura:'48mm', Tipo:'Marrom' }, stock: 25 },
        { values: { Marca:'Adelbras', Largura:'48mm', Tipo:'Transparente' }, stock: 12 },
      ]},
    { name: 'Clips', group: 'Escritório', category: 'Papelaria', unit: 'CX', minStock: 5,
      attrs: ['Marca','Tamanho','Material'],
      vars: [
        { values: { Marca:'ACC', Tamanho:'2/0', Material:'Niquelado' }, stock: 20 },
        { values: { Marca:'ACC', Tamanho:'4/0', Material:'Niquelado' }, stock: 15 },
        { values: { Marca:'ACC', Tamanho:'6/0', Material:'Niquelado' }, stock: 10 },
      ]},
    { name: 'Post-it', group: 'Escritório', category: 'Papelaria', unit: 'PCT', minStock: 5,
      attrs: ['Marca','Tamanho','Cor'],
      vars: [
        { values: { Marca:'3M', Tamanho:'76x76mm', Cor:'Amarelo' }, stock: 25 },
        { values: { Marca:'3M', Tamanho:'76x76mm', Cor:'Colorido' }, stock: 15 },
        { values: { Marca:'3M', Tamanho:'38x50mm', Cor:'Amarelo' }, stock: 20 },
      ]},

    // ═══════════════════════════════════════
    //  ESCRITÓRIO > Impressão
    // ═══════════════════════════════════════
    { name: 'Papel A4', group: 'Escritório', category: 'Impressão', unit: 'PCT', minStock: 5,
      attrs: ['Marca','Gramatura','Folhas'],
      vars: [
        { values: { Marca:'Chamex', Gramatura:'75g', Folhas:'500' }, stock: 20 },
        { values: { Marca:'Report', Gramatura:'75g', Folhas:'500' }, stock: 15 },
        { values: { Marca:'Chamex', Gramatura:'90g', Folhas:'500' }, stock: 8 },
      ]},
    { name: 'Toner', group: 'Escritório', category: 'Impressão', unit: 'UN', minStock: 2,
      attrs: ['Marca','Modelo','Cor'],
      vars: [
        { values: { Marca:'HP', Modelo:'CF217A', Cor:'Preto' }, stock: 5 },
        { values: { Marca:'HP', Modelo:'CF226A', Cor:'Preto' }, stock: 3 },
        { values: { Marca:'Brother', Modelo:'TN-2370', Cor:'Preto' }, stock: 4 },
      ]},

    // ═══════════════════════════════════════
    //  FIXAÇÃO > Parafusos e Acessórios
    // ═══════════════════════════════════════
    { name: 'Parafuso Sextavado', group: 'Fixação', category: 'Parafusos', unit: 'UN', minStock: 50,
      attrs: ['Material','Diâmetro','Comprimento'],
      vars: [
        { values: { Material:'Aço Zincado', Diâmetro:'M6', Comprimento:'20mm' }, stock: 200 },
        { values: { Material:'Aço Zincado', Diâmetro:'M6', Comprimento:'30mm' }, stock: 180 },
        { values: { Material:'Aço Zincado', Diâmetro:'M8', Comprimento:'25mm' }, stock: 150 },
        { values: { Material:'Aço Zincado', Diâmetro:'M8', Comprimento:'40mm' }, stock: 120 },
        { values: { Material:'Aço Zincado', Diâmetro:'M10', Comprimento:'30mm' }, stock: 100 },
        { values: { Material:'Aço Zincado', Diâmetro:'M10', Comprimento:'50mm' }, stock: 80 },
        { values: { Material:'Aço Zincado', Diâmetro:'M12', Comprimento:'40mm' }, stock: 60 },
        { values: { Material:'Inox 304', Diâmetro:'M6', Comprimento:'20mm' }, stock: 50 },
        { values: { Material:'Inox 304', Diâmetro:'M8', Comprimento:'30mm' }, stock: 30 },
      ]},
    { name: 'Porca Sextavada', group: 'Fixação', category: 'Parafusos', unit: 'UN', minStock: 50,
      attrs: ['Material','Diâmetro'],
      vars: [
        { values: { Material:'Aço Zincado', Diâmetro:'M6' }, stock: 300 },
        { values: { Material:'Aço Zincado', Diâmetro:'M8' }, stock: 250 },
        { values: { Material:'Aço Zincado', Diâmetro:'M10' }, stock: 200 },
        { values: { Material:'Aço Zincado', Diâmetro:'M12' }, stock: 150 },
        { values: { Material:'Inox 304', Diâmetro:'M6' }, stock: 80 },
        { values: { Material:'Inox 304', Diâmetro:'M8' }, stock: 60 },
      ]},
    { name: 'Arruela Lisa', group: 'Fixação', category: 'Parafusos', unit: 'UN', minStock: 50,
      attrs: ['Material','Diâmetro'],
      vars: [
        { values: { Material:'Aço Zincado', Diâmetro:'M6' }, stock: 400 },
        { values: { Material:'Aço Zincado', Diâmetro:'M8' }, stock: 350 },
        { values: { Material:'Aço Zincado', Diâmetro:'M10' }, stock: 250 },
        { values: { Material:'Aço Zincado', Diâmetro:'M12' }, stock: 200 },
      ]},
    { name: 'Arruela de Pressão', group: 'Fixação', category: 'Parafusos', unit: 'UN', minStock: 50,
      attrs: ['Material','Diâmetro'],
      vars: [
        { values: { Material:'Aço Zincado', Diâmetro:'M6' }, stock: 350 },
        { values: { Material:'Aço Zincado', Diâmetro:'M8' }, stock: 300 },
        { values: { Material:'Aço Zincado', Diâmetro:'M10' }, stock: 200 },
      ]},
    { name: 'Parafuso Phillips', group: 'Fixação', category: 'Parafusos', unit: 'UN', minStock: 50,
      attrs: ['Material','Diâmetro','Comprimento','Rosca'],
      vars: [
        { values: { Material:'Aço Zincado', Diâmetro:'4.2mm', Comprimento:'13mm', Rosca:'Soberba' }, stock: 500 },
        { values: { Material:'Aço Zincado', Diâmetro:'4.2mm', Comprimento:'25mm', Rosca:'Soberba' }, stock: 400 },
        { values: { Material:'Aço Zincado', Diâmetro:'4.2mm', Comprimento:'32mm', Rosca:'Soberba' }, stock: 300 },
        { values: { Material:'Aço Zincado', Diâmetro:'4.8mm', Comprimento:'25mm', Rosca:'Soberba' }, stock: 250 },
        { values: { Material:'Aço Zincado', Diâmetro:'4.8mm', Comprimento:'38mm', Rosca:'Soberba' }, stock: 200 },
      ]},
    { name: 'Bucha Plástica', group: 'Fixação', category: 'Buchas e Chumbadores', unit: 'UN', minStock: 30,
      attrs: ['Marca','Tamanho'],
      vars: [
        { values: { Marca:'Fischer', Tamanho:'S6' }, stock: 300 },
        { values: { Marca:'Fischer', Tamanho:'S8' }, stock: 250 },
        { values: { Marca:'Fischer', Tamanho:'S10' }, stock: 150 },
        { values: { Marca:'Fischer', Tamanho:'S12' }, stock: 80 },
      ]},
    { name: 'Chumbador Mecânico', group: 'Fixação', category: 'Buchas e Chumbadores', unit: 'UN', minStock: 10,
      attrs: ['Marca','Diâmetro','Comprimento'],
      vars: [
        { values: { Marca:'Fischer', Diâmetro:'3/8"', Comprimento:'75mm' }, stock: 40 },
        { values: { Marca:'Fischer', Diâmetro:'1/2"', Comprimento:'100mm' }, stock: 30 },
        { values: { Marca:'Walsywa', Diâmetro:'3/8"', Comprimento:'75mm' }, stock: 25 },
      ]},
    { name: 'Rebite Pop', group: 'Fixação', category: 'Rebites', unit: 'UN', minStock: 50,
      attrs: ['Material','Diâmetro','Comprimento'],
      vars: [
        { values: { Material:'Alumínio', Diâmetro:'3.2mm', Comprimento:'8mm' }, stock: 500 },
        { values: { Material:'Alumínio', Diâmetro:'4.0mm', Comprimento:'10mm' }, stock: 400 },
        { values: { Material:'Alumínio', Diâmetro:'4.0mm', Comprimento:'12mm' }, stock: 300 },
        { values: { Material:'Alumínio', Diâmetro:'4.8mm', Comprimento:'12mm' }, stock: 200 },
      ]},

    // ═══════════════════════════════════════
    //  ABRASIVOS
    // ═══════════════════════════════════════
    { name: 'Disco de Corte', group: 'Abrasivos', category: 'Discos', unit: 'UN', minStock: 10,
      attrs: ['Marca','Diâmetro','Espessura','Material'],
      vars: [
        { values: { Marca:'Norton', Diâmetro:'4.1/2"', Espessura:'1.0mm', Material:'Aço' }, stock: 50 },
        { values: { Marca:'Norton', Diâmetro:'4.1/2"', Espessura:'1.6mm', Material:'Aço' }, stock: 40 },
        { values: { Marca:'Norton', Diâmetro:'7"', Espessura:'1.6mm', Material:'Aço' }, stock: 20 },
        { values: { Marca:'3M', Diâmetro:'4.1/2"', Espessura:'1.0mm', Material:'Aço' }, stock: 30 },
        { values: { Marca:'3M', Diâmetro:'4.1/2"', Espessura:'1.0mm', Material:'Inox' }, stock: 25 },
      ]},
    { name: 'Disco de Desbaste', group: 'Abrasivos', category: 'Discos', unit: 'UN', minStock: 10,
      attrs: ['Marca','Diâmetro','Espessura'],
      vars: [
        { values: { Marca:'Norton', Diâmetro:'4.1/2"', Espessura:'6.4mm' }, stock: 30 },
        { values: { Marca:'Norton', Diâmetro:'7"', Espessura:'6.4mm' }, stock: 15 },
        { values: { Marca:'3M', Diâmetro:'4.1/2"', Espessura:'6.4mm' }, stock: 20 },
      ]},
    { name: 'Disco Flap', group: 'Abrasivos', category: 'Discos', unit: 'UN', minStock: 10,
      attrs: ['Marca','Diâmetro','Grão'],
      vars: [
        { values: { Marca:'Norton', Diâmetro:'4.1/2"', Grão:'40' }, stock: 20 },
        { values: { Marca:'Norton', Diâmetro:'4.1/2"', Grão:'60' }, stock: 25 },
        { values: { Marca:'Norton', Diâmetro:'4.1/2"', Grão:'80' }, stock: 30 },
        { values: { Marca:'Norton', Diâmetro:'4.1/2"', Grão:'120' }, stock: 15 },
      ]},
    { name: 'Lixa Ferro', group: 'Abrasivos', category: 'Lixas', unit: 'UN', minStock: 10,
      attrs: ['Marca','Grão','Tamanho'],
      vars: [
        { values: { Marca:'Norton', Grão:'60', Tamanho:'225x275mm' }, stock: 40 },
        { values: { Marca:'Norton', Grão:'80', Tamanho:'225x275mm' }, stock: 50 },
        { values: { Marca:'Norton', Grão:'100', Tamanho:'225x275mm' }, stock: 60 },
        { values: { Marca:'Norton', Grão:'120', Tamanho:'225x275mm' }, stock: 45 },
      ]},
    { name: 'Lixa Massa', group: 'Abrasivos', category: 'Lixas', unit: 'UN', minStock: 10,
      attrs: ['Marca','Grão','Tamanho'],
      vars: [
        { values: { Marca:'Norton', Grão:'100', Tamanho:'225x275mm' }, stock: 30 },
        { values: { Marca:'Norton', Grão:'150', Tamanho:'225x275mm' }, stock: 40 },
        { values: { Marca:'Norton', Grão:'220', Tamanho:'225x275mm' }, stock: 35 },
      ]},
    { name: 'Lixa d\'Água', group: 'Abrasivos', category: 'Lixas', unit: 'UN', minStock: 10,
      attrs: ['Marca','Grão','Tamanho'],
      vars: [
        { values: { Marca:'Norton', Grão:'220', Tamanho:'225x275mm' }, stock: 25 },
        { values: { Marca:'Norton', Grão:'400', Tamanho:'225x275mm' }, stock: 30 },
        { values: { Marca:'Norton', Grão:'600', Tamanho:'225x275mm' }, stock: 20 },
        { values: { Marca:'Norton', Grão:'1000', Tamanho:'225x275mm' }, stock: 15 },
      ]},
    { name: 'Escova de Aço', group: 'Abrasivos', category: 'Escovas', unit: 'UN', minStock: 5,
      attrs: ['Marca','Tipo','Material'],
      vars: [
        { values: { Marca:'Osborn', Tipo:'Manual', Material:'Aço Carbono' }, stock: 10 },
        { values: { Marca:'Osborn', Tipo:'Circular 4.1/2"', Material:'Aço Carbono' }, stock: 6 },
        { values: { Marca:'Osborn', Tipo:'Copo 4"', Material:'Aço Carbono' }, stock: 5 },
        { values: { Marca:'Osborn', Tipo:'Circular 4.1/2"', Material:'Aço Inox' }, stock: 4 },
      ]},

    // ═══════════════════════════════════════
    //  PINTURA
    // ═══════════════════════════════════════
    { name: 'Tinta Acrílica', group: 'Pintura', category: 'Tintas', unit: 'UN', minStock: 3,
      attrs: ['Marca','Cor','Acabamento','Volume'],
      vars: [
        { values: { Marca:'Suvinil', Cor:'Branco', Acabamento:'Fosco', Volume:'18L' }, stock: 5 },
        { values: { Marca:'Suvinil', Cor:'Branco', Acabamento:'Acetinado', Volume:'18L' }, stock: 3 },
        { values: { Marca:'Suvinil', Cor:'Branco', Acabamento:'Fosco', Volume:'3.6L' }, stock: 8 },
        { values: { Marca:'Coral', Cor:'Branco', Acabamento:'Fosco', Volume:'18L' }, stock: 4 },
        { values: { Marca:'Coral', Cor:'Gelo', Acabamento:'Fosco', Volume:'18L' }, stock: 3 },
      ]},
    { name: 'Tinta Esmalte', group: 'Pintura', category: 'Tintas', unit: 'UN', minStock: 3,
      attrs: ['Marca','Cor','Base','Volume'],
      vars: [
        { values: { Marca:'Suvinil', Cor:'Branco', Base:'Água', Volume:'3.6L' }, stock: 6 },
        { values: { Marca:'Suvinil', Cor:'Preto', Base:'Água', Volume:'3.6L' }, stock: 4 },
        { values: { Marca:'Coral', Cor:'Branco', Base:'Solvente', Volume:'3.6L' }, stock: 5 },
      ]},
    { name: 'Tinta Spray', group: 'Pintura', category: 'Tintas', unit: 'UN', minStock: 5,
      attrs: ['Marca','Cor','Volume'],
      vars: [
        { values: { Marca:'Colorgin', Cor:'Preto Fosco', Volume:'350ml' }, stock: 15 },
        { values: { Marca:'Colorgin', Cor:'Preto Brilhante', Volume:'350ml' }, stock: 12 },
        { values: { Marca:'Colorgin', Cor:'Branco Fosco', Volume:'350ml' }, stock: 10 },
        { values: { Marca:'Colorgin', Cor:'Prata', Volume:'350ml' }, stock: 8 },
        { values: { Marca:'Colorgin', Cor:'Azul', Volume:'350ml' }, stock: 6 },
      ]},
    { name: 'Rolo de Pintura', group: 'Pintura', category: 'Acessórios', unit: 'UN', minStock: 3,
      attrs: ['Marca','Largura','Pelo'],
      vars: [
        { values: { Marca:'Atlas', Largura:'23cm', Pelo:'Curto' }, stock: 10 },
        { values: { Marca:'Atlas', Largura:'23cm', Pelo:'Médio' }, stock: 12 },
        { values: { Marca:'Atlas', Largura:'15cm', Pelo:'Curto' }, stock: 8 },
        { values: { Marca:'Tigre', Largura:'23cm', Pelo:'Médio' }, stock: 6 },
      ]},
    { name: 'Pincel', group: 'Pintura', category: 'Acessórios', unit: 'UN', minStock: 5,
      attrs: ['Marca','Largura','Tipo'],
      vars: [
        { values: { Marca:'Atlas', Largura:'1"', Tipo:'Trincha' }, stock: 15 },
        { values: { Marca:'Atlas', Largura:'2"', Tipo:'Trincha' }, stock: 12 },
        { values: { Marca:'Atlas', Largura:'3"', Tipo:'Trincha' }, stock: 8 },
        { values: { Marca:'Atlas', Largura:'4"', Tipo:'Trincha' }, stock: 5 },
      ]},
    { name: 'Fita Crepe', group: 'Pintura', category: 'Acessórios', unit: 'UN', minStock: 5,
      attrs: ['Marca','Largura'],
      vars: [
        { values: { Marca:'3M', Largura:'18mm' }, stock: 30 },
        { values: { Marca:'3M', Largura:'24mm' }, stock: 25 },
        { values: { Marca:'3M', Largura:'48mm' }, stock: 15 },
        { values: { Marca:'Adelbras', Largura:'24mm' }, stock: 20 },
      ]},
    { name: 'Massa Corrida', group: 'Pintura', category: 'Preparação', unit: 'UN', minStock: 3,
      attrs: ['Marca','Volume'],
      vars: [
        { values: { Marca:'Suvinil', Volume:'18L' }, stock: 4 },
        { values: { Marca:'Suvinil', Volume:'5.6L' }, stock: 6 },
        { values: { Marca:'Coral', Volume:'18L' }, stock: 3 },
      ]},
    { name: 'Selador Acrílico', group: 'Pintura', category: 'Preparação', unit: 'UN', minStock: 3,
      attrs: ['Marca','Volume'],
      vars: [
        { values: { Marca:'Suvinil', Volume:'18L' }, stock: 3 },
        { values: { Marca:'Suvinil', Volume:'3.6L' }, stock: 5 },
      ]},
    { name: 'Thinner', group: 'Pintura', category: 'Solventes', unit: 'UN', minStock: 3,
      attrs: ['Marca','Volume','Tipo'],
      vars: [
        { values: { Marca:'Natrielli', Volume:'900ml', Tipo:'Comum' }, stock: 10 },
        { values: { Marca:'Natrielli', Volume:'5L', Tipo:'Comum' }, stock: 4 },
        { values: { Marca:'Natrielli', Volume:'900ml', Tipo:'Extra' }, stock: 6 },
      ]},

    // ═══════════════════════════════════════
    //  SOLDAGEM
    // ═══════════════════════════════════════
    { name: 'Eletrodo Revestido', group: 'Soldagem', category: 'Consumíveis', unit: 'KG', minStock: 10,
      attrs: ['Marca','Classificação','Diâmetro'],
      vars: [
        { values: { Marca:'Esab', Classificação:'E6013', Diâmetro:'2.5mm' }, stock: 30 },
        { values: { Marca:'Esab', Classificação:'E6013', Diâmetro:'3.25mm' }, stock: 40 },
        { values: { Marca:'Esab', Classificação:'E7018', Diâmetro:'2.5mm' }, stock: 20 },
        { values: { Marca:'Esab', Classificação:'E7018', Diâmetro:'3.25mm' }, stock: 25 },
        { values: { Marca:'Lincoln', Classificação:'E6013', Diâmetro:'3.25mm' }, stock: 15 },
      ]},
    { name: 'Arame MIG', group: 'Soldagem', category: 'Consumíveis', unit: 'KG', minStock: 5,
      attrs: ['Marca','Classificação','Diâmetro','Peso'],
      vars: [
        { values: { Marca:'Esab', Classificação:'ER70S-6', Diâmetro:'0.8mm', Peso:'15kg' }, stock: 10 },
        { values: { Marca:'Esab', Classificação:'ER70S-6', Diâmetro:'1.0mm', Peso:'15kg' }, stock: 8 },
        { values: { Marca:'Lincoln', Classificação:'ER70S-6', Diâmetro:'0.8mm', Peso:'15kg' }, stock: 5 },
      ]},
    { name: 'Gás CO2', group: 'Soldagem', category: 'Gases', unit: 'UN', minStock: 2,
      attrs: ['Fornecedor','Volume'],
      vars: [
        { values: { Fornecedor:'White Martins', Volume:'10kg' }, stock: 4 },
        { values: { Fornecedor:'White Martins', Volume:'25kg' }, stock: 2 },
      ]},
    { name: 'Gás Argônio', group: 'Soldagem', category: 'Gases', unit: 'UN', minStock: 1,
      attrs: ['Fornecedor','Volume'],
      vars: [
        { values: { Fornecedor:'White Martins', Volume:'10m³' }, stock: 2 },
        { values: { Fornecedor:'Air Liquide', Volume:'10m³' }, stock: 1 },
      ]},
    { name: 'Bico de Contato MIG', group: 'Soldagem', category: 'Acessórios Tocha', unit: 'UN', minStock: 10,
      attrs: ['Diâmetro','Rosca'],
      vars: [
        { values: { Diâmetro:'0.8mm', Rosca:'M6' }, stock: 30 },
        { values: { Diâmetro:'1.0mm', Rosca:'M6' }, stock: 25 },
        { values: { Diâmetro:'1.2mm', Rosca:'M8' }, stock: 15 },
      ]},
    { name: 'Bocal MIG', group: 'Soldagem', category: 'Acessórios Tocha', unit: 'UN', minStock: 5,
      attrs: ['Tipo','Diâmetro'],
      vars: [
        { values: { Tipo:'Cônico', Diâmetro:'12mm' }, stock: 15 },
        { values: { Tipo:'Cônico', Diâmetro:'16mm' }, stock: 12 },
        { values: { Tipo:'Cilíndrico', Diâmetro:'16mm' }, stock: 8 },
      ]},

    // ═══════════════════════════════════════
    //  SEGURANÇA
    // ═══════════════════════════════════════
    { name: 'Cone de Sinalização', group: 'Segurança', category: 'Sinalização', unit: 'UN', minStock: 5,
      attrs: ['Marca','Altura','Cor'],
      vars: [
        { values: { Marca:'Plastcor', Altura:'50cm', Cor:'Laranja' }, stock: 15 },
        { values: { Marca:'Plastcor', Altura:'75cm', Cor:'Laranja' }, stock: 10 },
        { values: { Marca:'Plastcor', Altura:'75cm', Cor:'Laranja/Branco' }, stock: 8 },
      ]},
    { name: 'Fita Zebrada', group: 'Segurança', category: 'Sinalização', unit: 'RL', minStock: 5,
      attrs: ['Cor','Comprimento'],
      vars: [
        { values: { Cor:'Amarela/Preta', Comprimento:'200m' }, stock: 12 },
        { values: { Cor:'Vermelha/Branca', Comprimento:'200m' }, stock: 8 },
      ]},
    { name: 'Placa de Sinalização', group: 'Segurança', category: 'Sinalização', unit: 'UN', minStock: 3,
      attrs: ['Tipo','Tamanho','Material'],
      vars: [
        { values: { Tipo:'Piso Molhado', Tamanho:'A4', Material:'PVC' }, stock: 6 },
        { values: { Tipo:'use EPI', Tamanho:'A4', Material:'PVC' }, stock: 8 },
        { values: { Tipo:'Perigo', Tamanho:'A3', Material:'PVC' }, stock: 5 },
        { values: { Tipo:'Proibido Fumar', Tamanho:'A4', Material:'PVC' }, stock: 7 },
        { values: { Tipo:'Saída de Emergência', Tamanho:'A3', Material:'Fotoluminescente' }, stock: 4 },
      ]},
    { name: 'Extintor de Incêndio', group: 'Segurança', category: 'Combate a Incêndio', unit: 'UN', minStock: 2,
      attrs: ['Tipo','Capacidade','Validade'],
      vars: [
        { values: { Tipo:'PQS ABC', Capacidade:'4kg', Validade:'2025' }, stock: 6 },
        { values: { Tipo:'PQS ABC', Capacidade:'6kg', Validade:'2025' }, stock: 4 },
        { values: { Tipo:'CO2', Capacidade:'6kg', Validade:'2026' }, stock: 3 },
        { values: { Tipo:'Água Pressurizada', Capacidade:'10L', Validade:'2025' }, stock: 2 },
      ]},
    { name: 'Cadeado de Bloqueio', group: 'Segurança', category: 'Lockout/Tagout', unit: 'UN', minStock: 5,
      attrs: ['Marca','Cor','Tipo'],
      vars: [
        { values: { Marca:'Brady', Cor:'Vermelho', Tipo:'Haste Curta' }, stock: 10 },
        { values: { Marca:'Brady', Cor:'Azul', Tipo:'Haste Curta' }, stock: 8 },
        { values: { Marca:'Brady', Cor:'Amarelo', Tipo:'Haste Longa' }, stock: 6 },
        { values: { Marca:'Master Lock', Cor:'Vermelho', Tipo:'Haste Curta' }, stock: 5 },
      ]},
    { name: 'Etiqueta de Bloqueio', group: 'Segurança', category: 'Lockout/Tagout', unit: 'UN', minStock: 20,
      attrs: ['Marca','Tipo','Idioma'],
      vars: [
        { values: { Marca:'Brady', Tipo:'Perigo - Não Energize', Idioma:'Português' }, stock: 50 },
        { values: { Marca:'Brady', Tipo:'Manutenção em Andamento', Idioma:'Português' }, stock: 30 },
      ]},

    // ═══════════════════════════════════════
    //  LUBRIFICAÇÃO
    // ═══════════════════════════════════════
    { name: 'Óleo Lubrificante', group: 'Lubrificação', category: 'Óleos', unit: 'UN', minStock: 3,
      attrs: ['Marca','Tipo','Viscosidade','Volume'],
      vars: [
        { values: { Marca:'Mobil', Tipo:'Mineral', Viscosidade:'SAE 10W', Volume:'1L' }, stock: 8 },
        { values: { Marca:'Mobil', Tipo:'Mineral', Viscosidade:'SAE 10W', Volume:'20L' }, stock: 2 },
        { values: { Marca:'Shell', Tipo:'Sintético', Viscosidade:'SAE 5W40', Volume:'1L' }, stock: 6 },
        { values: { Marca:'Castrol', Tipo:'Mineral', Viscosidade:'SAE 68', Volume:'20L' }, stock: 1 },
      ]},
    { name: 'Graxa', group: 'Lubrificação', category: 'Graxas', unit: 'UN', minStock: 3,
      attrs: ['Marca','Tipo','Peso'],
      vars: [
        { values: { Marca:'Shell', Tipo:'Lítio', Peso:'500g' }, stock: 10 },
        { values: { Marca:'Shell', Tipo:'Lítio', Peso:'1kg' }, stock: 6 },
        { values: { Marca:'Mobil', Tipo:'Lítio EP2', Peso:'500g' }, stock: 8 },
        { values: { Marca:'Mobil', Tipo:'Complexo de Lítio', Peso:'500g' }, stock: 4 },
      ]},
    { name: 'Spray Lubrificante', group: 'Lubrificação', category: 'Sprays', unit: 'UN', minStock: 5,
      attrs: ['Marca','Tipo','Volume'],
      vars: [
        { values: { Marca:'WD-40', Tipo:'Multiuso', Volume:'300ml' }, stock: 15 },
        { values: { Marca:'WD-40', Tipo:'Desengripante', Volume:'300ml' }, stock: 10 },
        { values: { Marca:'LPS', Tipo:'Anticorrosivo', Volume:'300ml' }, stock: 8 },
      ]},
    { name: 'Fluido de Corte', group: 'Lubrificação', category: 'Fluidos', unit: 'UN', minStock: 2,
      attrs: ['Marca','Tipo','Volume'],
      vars: [
        { values: { Marca:'Quimatic', Tipo:'Integral', Volume:'500ml' }, stock: 6 },
        { values: { Marca:'Quimatic', Tipo:'Solúvel', Volume:'5L' }, stock: 3 },
        { values: { Marca:'Tapmatic', Tipo:'Spray', Volume:'400ml' }, stock: 10 },
      ]},
  ]

  return enrichOperationalSeed(makeItems(allDefs))
}
