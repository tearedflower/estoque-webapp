function dateAt(daysFromToday, hour = 10, minute = 0) {
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  date.setDate(date.getDate() + daysFromToday)
  return date.toISOString()
}

function dateOnly(daysFromToday) {
  return dateAt(daysFromToday).slice(0, 10)
}

function monthOffset(offset) {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + offset)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

function periodClosedAt({ year, month }) {
  return new Date(year, month, 1, 8).toISOString()
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function rowFor(data, itemName, variationMatch = () => true) {
  const item = data.items.find(row => normalize(row.name) === normalize(itemName))
  const variation = data.variations.find(row => row.itemId === item?.id && variationMatch(row))
  if (!item || !variation) throw new Error(`Seed: material/variação não encontrado: ${itemName}`)
  return { item, variation }
}

function valueIs(key, value) {
  return variation => normalize(variation.values?.[key]) === normalize(value)
}

function movement(row, id, type, qty, daysFromToday, fields = {}) {
  return {
    id: `mov_seed_${id}`,
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
    stockBefore: 0,
    stockAfter: 0,
    date: dateAt(daysFromToday, fields.hour ?? 10, fields.minute ?? 0),
    supplier: fields.supplier || '',
    unitCost: fields.unitCost ?? null,
    requestedBy: fields.requestedBy || '',
    requestedByPersonId: fields.requestedByPersonId || '',
    destination: fields.destination || '',
    docRef: fields.docRef || '',
    note: fields.note || '',
    operatorId: fields.operatorId || 'user_admin',
    operatorName: fields.operatorName || 'admin',
  }
}

function reconcileStocks(data, movements) {
  const byVariation = new Map()
  for (const row of movements) {
    if (!byVariation.has(row.variationId)) byVariation.set(row.variationId, [])
    byVariation.get(row.variationId).push(row)
  }

  for (const variation of data.variations) {
    const rows = (byVariation.get(variation.id) || [])
      .sort((a, b) => new Date(a.date) - new Date(b.date))
    const net = rows.reduce((sum, row) => sum + (row.type === 'entrada' ? row.qty : -row.qty), 0)
    let stock = Number(variation.stock || 0) - net
    if (stock < 0) throw new Error(`Seed: saldo inicial negativo para ${variation.id}`)
    variation.initialStock = stock
    for (const row of rows) {
      row.stockBefore = stock
      stock += row.type === 'entrada' ? row.qty : -row.qty
      row.stockAfter = stock
    }
  }
}

function workOrderItem(id, workOrderId, row) {
  return {
    id,
    workOrderId,
    variationId: row.variationId,
    itemId: row.itemId,
    itemName: row.itemName,
    itemGroup: row.itemGroup,
    itemCategory: row.itemCategory,
    itemUnit: row.itemUnit,
    variationValues: row.variationValues,
    qty: row.qty,
    movementId: row.id,
    addedAt: row.date,
  }
}

/**
 * Adds a small, coherent operational scenario to the large catalog seed.
 * Dates are relative so dashboards and reminders remain useful over time.
 */
export function enrichOperationalSeed(data) {
  const latexCritical = rowFor(data, 'Luva de Latex', variation =>
    variation.values?.Marca === 'SuperSafety' && variation.values?.Tamanho === 'M'
  )
  const latexMaria = rowFor(data, 'Luva de Latex', variation =>
    variation.values?.Marca === 'Volk' && variation.values?.Tamanho === 'M'
  )
  const raspa = rowFor(data, 'Luva de Raspa', valueIs('Tamanho', 'M'))
  const glasses = rowFor(data, 'Óculos de Proteção', variation =>
    variation.values?.Marca === '3M' && variation.values?.['Cor Lente'] === 'Incolor'
  )
  const hearing = rowFor(data, 'Protetor Auricular Plug', valueIs('Modelo', '1100'))
  const helmet = rowFor(data, 'Capacete Classe B', valueIs('Cor', 'Branco'))
  const boots = rowFor(data, 'Botina de Segurança', valueIs('Tamanho', '40'))
  const cuttingDisc = rowFor(data, 'Disco de Corte', variation =>
    variation.values?.Marca === 'Norton' && variation.values?.Espessura === '1.0mm'
  )
  const flapDisc = rowFor(data, 'Disco Flap', valueIs('Grão', '60'))
  const grease = rowFor(data, 'Graxa', valueIs('Peso', '500g'))
  const oil = rowFor(data, 'Óleo Lubrificante', variation =>
    variation.values?.Marca === 'Mobil' && variation.values?.Volume === '20L'
  )
  const spray = rowFor(data, 'Spray Lubrificante', valueIs('Tipo', 'Multiuso'))
  const contactTip = rowFor(data, 'Bico de Contato MIG', valueIs('Diâmetro', '0.8mm'))

  const inactiveItem = data.items.find(item => normalize(item.name) === normalize('Etiqueta de Bloqueio'))
  if (inactiveItem) {
    inactiveItem.active = false
    for (const variation of data.variations.filter(row => row.itemId === inactiveItem.id)) variation.active = false
  }

  const destinations = [
    { id: 'dest_producao', name: 'Produção', description: 'Áreas produtivas da fábrica.' },
    {
      id: 'dest_rama_texima',
      name: 'Rama Texima',
      parentId: 'dest_producao',
      description: 'Linha de acabamento têxtil.',
      materialRules: [
        { group: 'Lubrificação', category: '', subcategory: '' },
        { group: 'Abrasivos', category: 'Discos', subcategory: '' },
      ],
    },
    { id: 'dest_jigger_1', name: 'Jigger 1', parentId: 'dest_producao', description: 'Linha de beneficiamento.' },
    { id: 'dest_turbo_1', name: 'Turbo 1', parentId: 'dest_producao', description: 'Equipamento de processo.' },
    { id: 'dest_costura', name: 'Máquinas de Costura', parentId: 'dest_producao', description: 'Parque de máquinas da costura.' },
    { id: 'dest_costura_reta', name: 'Reta 01', parentId: 'dest_costura', description: 'Máquina reta principal.' },
    { id: 'dest_costura_overlock', name: 'Overlock 02', parentId: 'dest_costura', description: 'Máquina overlock.' },
    { id: 'dest_manutencao', name: 'Manutenção', description: 'Estrutura da manutenção.' },
    {
      id: 'dest_oficina',
      name: 'Oficina interna',
      parentId: 'dest_manutencao',
      description: 'Bancada e oficina mecânica.',
      materialRules: [
        { group: 'Soldagem', category: '', subcategory: '' },
        { group: 'Abrasivos', category: '', subcategory: '' },
      ],
    },
    {
      id: 'dest_epi',
      name: 'EPI',
      description: 'Entregas individuais de equipamentos de proteção.',
      materialRules: [{ group: 'EPIs', category: '', subcategory: '' }],
    },
    { id: 'dest_desativado', name: 'Galpão antigo', description: 'Exemplo de destino inativo.', active: false },
  ]

  const locations = [
    { id: 'loc_almox', name: 'Almoxarifado', description: 'Local principal de estoque.' },
    { id: 'loc_epi', name: 'EPI', parentId: 'loc_almox', description: 'Prateleiras de EPI.' },
    { id: 'loc_manut', name: 'Manutenção', parentId: 'loc_almox', description: 'Peças e ferramentas.' },
    { id: 'loc_manut_a', name: 'Estante A', parentId: 'loc_manut', description: 'Abrasivos e soldagem.' },
    { id: 'loc_manut_b', name: 'Estante B', parentId: 'loc_manut', description: 'Óleos e graxas.' },
    { id: 'loc_quarentena', name: 'Quarentena', description: 'Materiais aguardando conferência.' },
    { id: 'loc_inativo', name: 'Depósito antigo', description: 'Exemplo de local inativo.', active: false },
  ]

  const roles = [
    { id: 'role_mecanico', name: 'Mecânico', description: 'Manutenção mecânica.' },
    { id: 'role_eletricista', name: 'Eletricista', description: 'Manutenção elétrica.' },
    { id: 'role_costureira', name: 'Costureira', description: 'Operação de costura.' },
    { id: 'role_almoxarife', name: 'Almoxarife', description: 'Controle de estoque.' },
    { id: 'role_inativo', name: 'Auxiliar antigo', description: 'Exemplo de cargo inativo.', active: false },
  ]

  const people = [
    { id: 'person_maria', name: 'Maria Souza', role: 'Costureira', registration: '000101', status: 'ativo' },
    { id: 'person_joao', name: 'João Pereira', role: 'Mecânico', registration: '000102', status: 'ativo' },
    { id: 'person_ana', name: 'Ana Lima', role: 'Almoxarife', registration: '000103', status: 'ativo' },
    { id: 'person_carlos', name: 'Carlos Silva', role: 'Eletricista', registration: '000104', status: 'ativo' },
    { id: 'person_rafael', name: 'Rafael Santos', role: 'Mecânico', registration: '000105', status: 'afastado' },
    { id: 'person_lucia', name: 'Lúcia Alves', role: 'Costureira', registration: '000106', status: 'demitido', active: false },
  ]

  const suppliers = [
    { id: 'supplier_epi', name: 'Protege EPI', description: 'EPIs e uniformes.' },
    { id: 'supplier_rolamento', name: 'Casa do Rolamento', description: 'Rolamentos, correias e lubrificação.' },
    { id: 'supplier_solda', name: 'Solda Forte', description: 'Consumíveis de soldagem.' },
    { id: 'supplier_abrasivos', name: 'Abrasivos Brasil', description: 'Discos e lixas.' },
    { id: 'supplier_inativo', name: 'Fornecedor desativado', description: 'Exemplo para filtros.', active: false },
  ]

  for (const variation of data.variations) {
    const item = data.items.find(row => row.id === variation.itemId)
    variation.minStock = item?.minStock || 0
    if (item?.group === 'EPIs') {
      variation.location = 'Almoxarifado > EPI'
      variation.locations = ['loc_almox', 'loc_epi']
      variation.destinations = ['dest_epi']
    } else {
      variation.location = 'Almoxarifado > Manutenção'
      variation.locations = ['loc_almox', 'loc_manut']
      variation.destinations = ['dest_oficina', 'dest_rama_texima', 'dest_jigger_1']
    }
  }

  const movements = [
    movement(latexCritical, '001', 'entrada', 30, -75, { supplier: 'Protege EPI', unitCost: 8.9, docRef: 'NF 4501' }),
    movement(latexCritical, '002', 'saida', 15, -55, { requestedBy: 'Costura - turno A', destination: 'Máquinas de Costura', docRef: 'REQ 2101' }),
    movement(latexCritical, '003', 'saida', 12, -25, { requestedBy: 'Costura - turno A', destination: 'Máquinas de Costura', docRef: 'REQ 2218' }),
    movement(latexCritical, '004', 'saida', 10, -6, { requestedBy: 'Costura - turno A', destination: 'Máquinas de Costura', docRef: 'REQ 2290' }),

    movement(oil, '010', 'entrada', 8, -70, { supplier: 'Casa do Rolamento', unitCost: 389.5, docRef: 'NF 8177' }),
    movement(oil, '011', 'saida', 4, -42, { requestedBy: 'João Pereira', requestedByPersonId: 'person_joao', destination: 'Rama Texima', docRef: 'REQ 2160' }),
    movement(oil, '012', 'saida', 3, -9, { requestedBy: 'Carlos Silva', requestedByPersonId: 'person_carlos', destination: 'Jigger 1', docRef: 'REQ 2275' }),

    movement(cuttingDisc, '020', 'entrada', 20, -80, { supplier: 'Abrasivos Brasil', unitCost: 7.45, docRef: 'NF 9908' }),
    movement(cuttingDisc, '021', 'saida', 5, -60, { requestedBy: 'João Pereira', requestedByPersonId: 'person_joao', destination: 'Oficina interna', docRef: 'REQ 2088' }),
    movement(cuttingDisc, '022', 'saida', 6, -31, { requestedBy: 'João Pereira', requestedByPersonId: 'person_joao', destination: 'Rama Texima', docRef: 'REQ 2199' }),
    movement(cuttingDisc, '023', 'saida', 2, -12, { requestedBy: 'João Pereira', requestedByPersonId: 'person_joao', destination: 'Rama Texima', docRef: 'OS #101', note: 'Material aplicado pela OS #101.' }),

    movement(grease, '030', 'entrada', 12, -65, { supplier: 'Casa do Rolamento', docRef: 'NF 8210', note: 'Entrada sem custo informado; preço é opcional.' }),
    movement(grease, '031', 'saida', 1, -50, { requestedBy: 'João Pereira', requestedByPersonId: 'person_joao', destination: 'Jigger 1' }),
    movement(grease, '032', 'saida', 1, -35, { requestedBy: 'João Pereira', requestedByPersonId: 'person_joao', destination: 'Jigger 1' }),
    movement(grease, '033', 'saida', 1, -20, { requestedBy: 'João Pereira', requestedByPersonId: 'person_joao', destination: 'Jigger 1' }),
    movement(grease, '034', 'saida', 8, -5, { requestedBy: 'João Pereira', requestedByPersonId: 'person_joao', destination: 'Jigger 1', note: 'Atendimento emergencial de manutenção.' }),

    movement(contactTip, '040', 'entrada', 25, -45, { supplier: 'Solda Forte', unitCost: 4.2, docRef: 'NF 3302' }),
    movement(contactTip, '041', 'saida', 5, -18, { requestedBy: 'Carlos Silva', requestedByPersonId: 'person_carlos', destination: 'Oficina interna' }),
    movement(contactTip, '042', 'saida', 1, -3, { requestedBy: 'Carlos Silva', requestedByPersonId: 'person_carlos', note: 'Destino omitido de propósito para a prévia de fechamento.' }),

    movement(latexMaria, '050', 'saida', 1, -85, { requestedBy: 'Maria Souza', requestedByPersonId: 'person_maria', destination: 'EPI', docRef: 'FICHA EPI 501' }),
    movement(glasses, '051', 'saida', 1, -160, { requestedBy: 'Maria Souza', requestedByPersonId: 'person_maria', destination: 'EPI', docRef: 'FICHA EPI 502' }),
    movement(raspa, '052', 'saida', 1, -123, { requestedBy: 'João Pereira', requestedByPersonId: 'person_joao', destination: 'EPI', docRef: 'FICHA EPI 503' }),
    movement(helmet, '053', 'saida', 1, -315, { requestedBy: 'Carlos Silva', requestedByPersonId: 'person_carlos', destination: 'EPI', docRef: 'FICHA EPI 504' }),
    movement(boots, '054', 'saida', 1, -173, { requestedBy: 'Carlos Silva', requestedByPersonId: 'person_carlos', destination: 'EPI', docRef: 'FICHA EPI 505' }),
    movement(raspa, '055', 'saida', 1, -15, { requestedBy: 'Rafael Santos', requestedByPersonId: 'person_rafael', destination: 'EPI', docRef: 'FICHA EPI 506' }),

    movement(spray, '060', 'saida', 1, -14, { requestedBy: 'Carlos Silva', requestedByPersonId: 'person_carlos', destination: 'Oficina interna', docRef: 'OS #103', note: 'Material aplicado pela OS de motor #103.' }),
    movement(flapDisc, '061', 'entrada', 12, -28, { supplier: 'Abrasivos Brasil', unitCost: 11.8, docRef: 'NF 9950' }),
    movement(flapDisc, '062', 'saida', 2, -2, { requestedBy: 'João Pereira', requestedByPersonId: 'person_joao', destination: 'Rama Texima', docRef: 'REQ 2301' }),
  ]

  reconcileStocks(data, movements)

  const epiRoleRules = [
    { id: 'epi_rule_cost_latex', roleName: 'Costureira', targetType: 'item', targetKey: latexMaria.item.id, targetLabel: 'Luva de Latex', days: 90, quantity: 1 },
    { id: 'epi_rule_cost_glasses', roleName: 'Costureira', targetType: 'item', targetKey: glasses.item.id, targetLabel: 'Óculos de Proteção', days: 180, quantity: 1 },
    { id: 'epi_rule_mec_raspa', roleName: 'Mecânico', targetType: 'item', targetKey: raspa.item.id, targetLabel: 'Luva de Raspa', days: 120, quantity: 1 },
    { id: 'epi_rule_mec_hearing', roleName: 'Mecânico', targetType: 'item', targetKey: hearing.item.id, targetLabel: 'Protetor Auricular Plug', days: 180, quantity: 1 },
    { id: 'epi_rule_elet_helmet', roleName: 'Eletricista', targetType: 'item', targetKey: helmet.item.id, targetLabel: 'Capacete Classe B', days: 365, quantity: 1 },
    { id: 'epi_rule_elet_boots', roleName: 'Eletricista', targetType: 'item', targetKey: boots.item.id, targetLabel: 'Botina de Segurança', days: 180, quantity: 1 },
    { id: 'epi_rule_almox_glasses', roleName: 'Almoxarife', targetType: 'item', targetKey: glasses.item.id, targetLabel: 'Óculos de Proteção', days: 180, quantity: 1 },
  ]

  const epiPeriodicities = [
    { id: 'epi_period_latex', targetType: 'item', targetKey: latexMaria.item.id, targetLabel: 'Luva de Latex', days: 90 },
    { id: 'epi_period_glasses', targetType: 'item', targetKey: glasses.item.id, targetLabel: 'Óculos de Proteção', days: 180 },
    { id: 'epi_period_raspa', targetType: 'item', targetKey: raspa.item.id, targetLabel: 'Luva de Raspa', days: 120 },
    { id: 'epi_period_hearing', targetType: 'item', targetKey: hearing.item.id, targetLabel: 'Protetor Auricular Plug', days: 180 },
    { id: 'epi_period_helmet', targetType: 'item', targetKey: helmet.item.id, targetLabel: 'Capacete Classe B', days: 365 },
    { id: 'epi_period_boots', targetType: 'item', targetKey: boots.item.id, targetLabel: 'Botina de Segurança', days: 180 },
  ]

  const motors = [
    {
      id: 'motor_azul',
      tag: 'N 10-20-30',
      serial: 'RTS-220V-W22',
      name: 'Motor Azul',
      manufacturer: 'WEG',
      power: '7.5',
      powerUnit: 'CV',
      voltage: '220/380V',
      rpm: '1750',
      amperage: '21/12A',
      destinationId: 'dest_rama_texima',
      destinationName: 'Rama Texima',
      status: 'ativo',
      notes: 'Motor principal da Rama Texima.',
      createdAt: dateAt(-420),
      updatedAt: dateAt(-14),
    },
    {
      id: 'motor_verde',
      tag: 'N 20-40-10',
      serial: 'JG-380V-02',
      name: 'Motor Verde',
      manufacturer: 'WEG',
      power: '5',
      powerUnit: 'CV',
      voltage: '380V',
      rpm: '1720',
      amperage: '9.8A',
      destinationId: 'dest_jigger_1',
      destinationName: 'Jigger 1',
      status: 'em_manutencao',
      notes: 'Em rebobinamento externo.',
      createdAt: dateAt(-300),
      updatedAt: dateAt(-4),
    },
    {
      id: 'motor_reserva',
      tag: 'N 30-10-05',
      serial: 'RSV-220V-01',
      name: 'Motor Reserva',
      manufacturer: 'Kohlbach',
      power: '3',
      powerUnit: 'CV',
      voltage: '220V',
      rpm: '1700',
      amperage: '8.2A',
      destinationId: 'dest_turbo_1',
      destinationName: 'Turbo 1',
      status: 'reserva',
      notes: 'Reserva operacional testada.',
      createdAt: dateAt(-240),
      updatedAt: dateAt(-40),
    },
    {
      id: 'motor_inativo',
      tag: 'N 00-00-01',
      serial: 'SUC-001',
      name: 'Motor Sucateado',
      manufacturer: 'Kohlbach',
      power: '2',
      powerUnit: 'CV',
      voltage: '220V',
      rpm: '1680',
      amperage: '6A',
      status: 'inativo',
      notes: 'Exemplo de motor inativo.',
      createdAt: dateAt(-800),
      updatedAt: dateAt(-200),
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
      serviceType: 'Mecânica',
      requestDate: dateOnly(-13),
      requestTime: '08:30',
      requestedBy: 'Maria Souza',
      note: 'Ruído anormal no conjunto.',
      maintenanceStartDate: dateOnly(-12),
      maintenanceStartTime: '13:00',
      maintenanceEndDate: dateOnly(-12),
      maintenanceEndTime: '15:00',
      maintenanceProfessional: 'João Pereira',
      maintenanceMaterials: 'Disco de corte e insumos de limpeza.',
      maintenanceNote: 'Serviço concluído.',
      createdAt: dateAt(-13, 8, 30),
    },
    {
      id: 'wo_seed_102',
      number: 102,
      title: 'Jigger 1 - inspeção do painel',
      destinationId: 'dest_jigger_1',
      destinationName: 'Jigger 1',
      equipment: 'Jigger 1',
      serviceType: 'Elétrica',
      requestDate: dateOnly(-3),
      requestTime: '09:10',
      requestedBy: 'Carlos Silva',
      note: 'Verificar aquecimento no painel de comando.',
      createdAt: dateAt(-3, 9, 10),
    },
    {
      id: 'wo_seed_103',
      number: 103,
      title: 'N 10-20-30 - revisão preventiva',
      motorId: 'motor_azul',
      equipment: 'N 10-20-30 - Motor Azul',
      motorOriginDestinationId: 'dest_rama_texima',
      motorOriginDestinationName: 'Rama Texima',
      maintenanceLocationType: 'interna',
      maintenanceDestinationId: 'dest_oficina',
      maintenanceDestinationName: 'Oficina interna',
      serviceType: 'Outros',
      requestDate: dateOnly(-15),
      requestTime: '09:00',
      requestedBy: 'João Pereira',
      note: 'Revisão preventiva.',
      maintenanceStartDate: dateOnly(-14),
      maintenanceStartTime: '10:00',
      maintenanceEndDate: dateOnly(-14),
      maintenanceEndTime: '16:00',
      maintenanceProfessional: 'Carlos Silva',
      maintenanceMaterials: 'Spray lubrificante.',
      maintenanceNote: 'Motor revisado e liberado.',
      motorStatusAfterMaintenance: 'ativo',
      createdAt: dateAt(-15, 9),
    },
    {
      id: 'wo_seed_104',
      number: 104,
      title: 'N 20-40-10 - rebobinamento externo',
      motorId: 'motor_verde',
      equipment: 'N 20-40-10 - Motor Verde',
      motorOriginDestinationId: 'dest_jigger_1',
      motorOriginDestinationName: 'Jigger 1',
      maintenanceLocationType: 'externa',
      maintenanceExternalLocation: 'Americana Motores',
      maintenanceExternalOrderNumber: 'EXT-8841',
      serviceType: 'Outros',
      requestDate: dateOnly(-4),
      requestTime: '14:20',
      requestedBy: 'Ana Lima',
      note: 'Motor enviado para rebobinamento.',
      createdAt: dateAt(-4, 14, 20),
    },
  ]

  const osMovement = movements.find(row => row.docRef === 'OS #101')
  const motorOsMovement = movements.find(row => row.docRef === 'OS #103')
  const workOrderItems = [
    workOrderItem('woi_seed_101_1', 'wo_seed_101', osMovement),
    workOrderItem('woi_seed_103_1', 'wo_seed_103', motorOsMovement),
  ]
  const workOrderEvents = [
    { id: 'woe_seed_101_1', workOrderId: 'wo_seed_101', eventType: 'criada', eventDate: dateAt(-13, 8, 30), operatorName: 'admin', notes: 'OS criada.' },
    { id: 'woe_seed_101_2', workOrderId: 'wo_seed_101', eventType: 'finalizada', eventDate: dateAt(-12, 15), operatorName: 'admin', notes: 'OS finalizada.' },
    { id: 'woe_seed_102_1', workOrderId: 'wo_seed_102', eventType: 'criada', eventDate: dateAt(-3, 9, 10), operatorName: 'admin', notes: 'OS aguardando atendimento.' },
    { id: 'woe_seed_103_1', workOrderId: 'wo_seed_103', eventType: 'criada', eventDate: dateAt(-15, 9), operatorName: 'admin', notes: 'OS de motor criada.' },
    { id: 'woe_seed_103_2', workOrderId: 'wo_seed_103', eventType: 'finalizada', eventDate: dateAt(-14, 16), operatorName: 'admin', notes: 'Motor revisado e reinstalado.' },
    { id: 'woe_seed_104_1', workOrderId: 'wo_seed_104', eventType: 'criada', eventDate: dateAt(-4, 14, 20), operatorName: 'admin', notes: 'OS externa aberta.' },
  ]
  const motorEvents = [
    { id: 'mev_seed_azul_1', motorId: 'motor_azul', workOrderId: 'wo_seed_103', eventType: 'revisado', eventDate: dateAt(-14, 10), fromDestination: 'Rama Texima', toDestination: 'Oficina interna', performedBy: 'Carlos Silva', notes: 'Revisão preventiva.' },
    { id: 'mev_seed_azul_2', motorId: 'motor_azul', workOrderId: 'wo_seed_103', eventType: 'movimentado', eventDate: dateAt(-14, 16), fromDestination: 'Oficina interna', toDestination: 'Rama Texima', performedBy: 'Carlos Silva', notes: 'Retorno para operação.' },
    { id: 'mev_seed_verde_1', motorId: 'motor_verde', workOrderId: 'wo_seed_104', eventType: 'rebobinado', eventDate: dateAt(-4, 14, 20), fromDestination: 'Jigger 1', toDestination: 'Americana Motores', performedBy: 'Americana Motores', notes: 'Enviado para rebobinamento externo.' },
    { id: 'mev_seed_reserva_1', motorId: 'motor_reserva', eventType: 'observacao', eventDate: dateAt(-40), fromDestination: 'Turbo 1', performedBy: 'João Pereira', notes: 'Motor reserva testado.' },
  ]
  const motorMaterials = [
    { id: 'mmat_seed_azul_spray', motorId: 'motor_azul', itemId: spray.item.id, variationId: spray.variation.id, note: 'Lubrificante padrão de revisão.', createdAt: dateAt(-100) },
    { id: 'mmat_seed_verde_graxa', motorId: 'motor_verde', itemId: grease.item.id, variationId: grease.variation.id, note: 'Graxa recomendada.', createdAt: dateAt(-90) },
  ]

  const closedPeriod = monthOffset(-2)
  const closingRows = [
    { row: latexCritical, stockMonthStart: 8, monthEntradas: 30, monthSaidas: 15, stockAtClose: 23 },
    { row: cuttingDisc, stockMonthStart: 43, monthEntradas: 20, monthSaidas: 5, stockAtClose: 58 },
    { row: oil, stockMonthStart: 1, monthEntradas: 8, monthSaidas: 4, stockAtClose: 5 },
  ].map(({ row, ...totals }) => ({
    variationId: row.variation.id,
    itemId: row.item.id,
    itemName: row.item.name,
    group: row.item.group,
    category: row.item.category || '',
    subcategory: row.item.subcategory || '',
    unit: row.item.unit || 'UN',
    variationValues: row.variation.values || {},
    variationExtras: row.variation.extras || {},
    location: row.variation.location || '',
    destinations: row.variation.destinations || [],
    minStock: row.variation.minStock || row.item.minStock || 0,
    currentStock: row.variation.stock,
    ...totals,
  }))
  const monthlyClosings = [{
    id: `close_${closedPeriod.year}_${String(closedPeriod.month).padStart(2, '0')}`,
    year: closedPeriod.year,
    month: closedPeriod.month,
    closedAt: periodClosedAt(closedPeriod),
    closedById: 'user_admin',
    closedByName: 'admin',
    notes: 'Fechamento demonstrativo do seed.',
    data: {
      summary: {
        year: closedPeriod.year,
        month: closedPeriod.month,
        variations: data.variations.length,
        items: data.items.length,
        totalStockAtClose: 86,
        movementCount: 5,
        monthEntradas: 58,
        monthSaidas: 24,
        zeroStock: 0,
        belowMin: 0,
        inconsistencies: { negativeStock: 0, movementMath: 0, partialMovements: 0 },
        groups: [
          { group: 'Abrasivos', variations: 1, stockAtClose: 58, monthEntradas: 20, monthSaidas: 5 },
          { group: 'EPIs', variations: 1, stockAtClose: 23, monthEntradas: 30, monthSaidas: 15 },
          { group: 'Lubrificação', variations: 1, stockAtClose: 5, monthEntradas: 8, monthSaidas: 4 },
        ],
      },
      rows: closingRows,
    },
  }]

  return {
    ...data,
    movements,
    destinations,
    locations,
    people,
    suppliers,
    roles,
    epiRoleRules,
    epiPeriodicities,
    workOrders,
    workOrderItems,
    workOrderEvents,
    motors,
    motorEvents,
    motorMaterials,
    monthlyClosings,
  }
}
