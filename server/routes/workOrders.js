import { Router } from 'express'
import crypto from 'crypto'
import db from '../db.js'
import { requireAdmin, requireAuth, requireOperator } from '../middleware/auth.js'
import { getDestinationFullName } from '../utils/destinations.js'
import { nextMotorMaintenanceStatus } from '../utils/motorStatus.js'
import { workOrderCreationDateError } from '../../src/utils/workOrderForm.js'
import { parsePositiveQty } from '../utils/stockMath.js'
import { prepareStockConfirmations, applyStockConfirmations } from '../utils/stockConfirmation.js'

const router = Router()
const INTERNAL_MAINTENANCE_LOCATION = 'Oficina'
const MOTOR_OBJECTIVE_TYPES = new Set(['nenhum', 'rebobinado', 'reformado', 'revisado', 'enrolado', 'enrolar', 'instalado', 'removido', 'movimentado', 'inativado', 'reativado', 'observacao'])
const MOTOR_STATUS_AFTER_MAINTENANCE = new Set(['ativo', 'reserva', 'inativo'])
const MOTOR_OBJECTIVE_LABELS = {
  nenhum: 'Nenhum',
  rebobinado: 'Rebobinado',
  reformado: 'Reformado',
  revisado: 'Revisado',
  enrolado: 'Enrolado',
  enrolar: 'Enrolado',
  instalado: 'Instalado',
  removido: 'Removido',
  movimentado: 'Movimentado',
  inativado: 'Inativado',
  reativado: 'Reativado',
  observacao: 'Observacao',
}

function genId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex')
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function nowIso() {
  return new Date().toISOString()
}

function addWorkOrderEvent(workOrderId, eventType, req, fields = {}) {
  const eventDate = fields.eventDate || nowIso()
  db.prepare(`INSERT INTO work_order_events (
    id, work_order_id, event_type, event_date, operator_id, operator_name,
    from_value, to_value, notes, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    genId('woe'),
    workOrderId,
    eventType,
    eventDate,
    req?.user?.id || '',
    req?.user?.name || '',
    fields.fromValue || '',
    fields.toValue || '',
    fields.notes || '',
    nowIso()
  )
}

function mapWorkOrderEvent(r) {
  return {
    id: r.id,
    workOrderId: r.work_order_id,
    eventType: r.event_type,
    eventDate: r.event_date,
    operatorId: r.operator_id || '',
    operatorName: r.operator_name || '',
    fromValue: r.from_value || '',
    toValue: r.to_value || '',
    notes: r.notes || '',
    createdAt: r.created_at,
  }
}

function normalizeServiceType(value) {
  const normalized = clean(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  if (normalized === 'eletrica') return 'Elétrica'
  if (normalized === 'mecanica') return 'Mecânica'
  return 'Outros'
}

function parseOrderNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : NaN
}

function parseOrderDateTime(dateValue, timeValue = '00:00') {
  const dateText = clean(dateValue)
  const timeText = clean(timeValue) || '00:00'
  const iso = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const br = dateText.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : br
      ? { year: Number(br[3]), month: Number(br[2]), day: Number(br[1]) }
      : null
  if (!parts) return null
  const time = timeText.match(/^(\d{2}):(\d{2})$/)
  if (!time) return null
  const date = new Date(parts.year, parts.month - 1, parts.day, Number(time[1]), Number(time[2]))
  if (Number.isNaN(date.getTime())) return null
  if (date.getFullYear() !== parts.year || date.getMonth() + 1 !== parts.month || date.getDate() !== parts.day) return null
  return date
}

function validateMaintenanceDates({
  maintenanceStartDate,
  maintenanceStartTime,
  maintenanceEndDate,
  maintenanceEndTime,
  allowEndWithoutStart = false,
}) {
  const hasStartDate = !!clean(maintenanceStartDate)
  const hasStartTime = !!clean(maintenanceStartTime)
  const hasEndDate = !!clean(maintenanceEndDate)
  const hasEndTime = !!clean(maintenanceEndTime)
  if (hasStartTime && !hasStartDate) return 'Informe data de início da manutenção'
  if (hasEndTime && !hasEndDate) return 'Informe data de término da manutenção'
  if (hasEndDate && !hasStartDate && !allowEndWithoutStart) return 'Informe início/envio antes do término/retorno da manutenção'
  if (hasStartDate && hasEndDate) {
    const start = parseOrderDateTime(maintenanceStartDate, maintenanceStartTime)
    const end = parseOrderDateTime(maintenanceEndDate, maintenanceEndTime)
    if (!start || !end) return 'Datas de manutenção inválidas'
    if (end < start) return 'Término não pode ser antes do início da manutenção'
  }
  return ''
}

function resolveDestinationName(destinationId) {
  return destinationId ? getDestinationFullName(db, destinationId) : ''
}

function resolveDestinationLeafName(destinationId, storedName = '') {
  if (destinationId) {
    const row = db.prepare('SELECT name FROM destinations WHERE id = ?').get(destinationId)
    if (row?.name) return row.name
  }
  const name = clean(storedName)
  if (!name) return ''
  if (name.includes('>')) return name.split('>').pop().trim()
  const rows = db.prepare('SELECT * FROM destinations WHERE lower(name) = lower(?) ORDER BY active DESC').all(name)
  return rows.length === 1 ? rows[0].name : name
}

function resolvePersonName(storedName = '') {
  const name = clean(storedName)
  if (!name) return ''
  return db.prepare('SELECT name FROM people WHERE lower(name) = lower(?)').get(name)?.name || name
}

function destinationIsActive(destinationId) {
  if (!destinationId) return false
  return !!db.prepare('SELECT id FROM destinations WHERE id = ? AND active = 1').get(destinationId)
}

function buildTitle({ title, equipment, destinationName, number }) {
  const typedTitle = clean(title)
  if (typedTitle) return typedTitle
  const subject = equipment || destinationName || `OS #${number}`
  return subject
}

function normalizeMaintenanceLocationType(value, hasInternal, hasExternal) {
  const normalized = clean(value).toLowerCase()
  if (normalized === 'interna' || normalized === 'externa') return normalized
  if (hasInternal) return 'interna'
  if (hasExternal) return 'externa'
  return 'interna'
}

function buildMaintenanceLocation(body, existing = null) {
  const rawType = body.maintenanceLocationType ?? existing?.maintenance_location_type ?? ''
  const maintenanceDestinationId = clean(body.maintenanceDestinationId ?? existing?.maintenance_destination_id ?? '')
  const maintenanceExternalLocation = clean(body.maintenanceExternalLocation ?? existing?.maintenance_external_location ?? '')
  const maintenanceExternalOrderNumber = clean(body.maintenanceExternalOrderNumber ?? existing?.maintenance_external_order_number ?? '')
  const maintenanceLocationType = normalizeMaintenanceLocationType(rawType, !!maintenanceDestinationId, !!maintenanceExternalLocation)
  if (maintenanceLocationType === 'externa' && !maintenanceExternalLocation) {
    return { error: 'Oficina externa é obrigatória' }
  }
  return {
    maintenanceLocationType,
    maintenanceDestinationId: '',
    maintenanceDestinationName: maintenanceLocationType === 'interna' ? INTERNAL_MAINTENANCE_LOCATION : '',
    maintenanceExternalLocation: maintenanceLocationType === 'externa' ? maintenanceExternalLocation : '',
    maintenanceExternalOrderNumber: maintenanceLocationType === 'externa' ? maintenanceExternalOrderNumber : '',
    maintenanceLocationName: maintenanceLocationType === 'interna' ? INTERNAL_MAINTENANCE_LOCATION : maintenanceExternalLocation,
  }
}

function normalizeMotorObjectiveType(value) {
  const eventType = clean(value) || 'nenhum'
  return MOTOR_OBJECTIVE_TYPES.has(eventType) ? eventType : ''
}

function motorObjectiveLabel(eventType) {
  return MOTOR_OBJECTIVE_LABELS[eventType] || eventType
}

function addMotorEvent(workOrderId, motorId, eventType, fields = {}) {
  db.prepare(`INSERT INTO motor_events (
    id, motor_id, work_order_id, event_type, event_date, from_destination,
    to_destination, performed_by, notes, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    genId('mev'),
    motorId,
    workOrderId,
    eventType,
    fields.eventDate || nowIso(),
    fields.fromDestination || '',
    fields.toDestination || '',
    fields.performedBy || '',
    fields.notes || '',
    nowIso()
  )
}

function setMotorStatus(motorId, status) {
  if (!motorId) return
  db.prepare('UPDATE motors SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), motorId)
}

function normalizeMotorStatusAfterMaintenance(value) {
  const status = clean(value)
  return MOTOR_STATUS_AFTER_MAINTENANCE.has(status) ? status : ''
}

function syncMotorMaintenanceStatus(motorId) {
  if (!motorId) return { status: '', previousStatus: '', changed: false }
  const motor = db.prepare('SELECT status FROM motors WHERE id = ?').get(motorId)
  if (!motor) return { status: '', previousStatus: '', changed: false }
  const openWorkOrders = db.prepare(`
    SELECT COUNT(*) as count
    FROM work_orders
    WHERE motor_id = ? AND COALESCE(maintenance_end_date, '') = ''
  `).get(motorId).count
  const lastFinishedStatus = db.prepare(`
    SELECT motor_status_after_maintenance as status
    FROM work_orders
    WHERE motor_id = ?
      AND COALESCE(maintenance_end_date, '') <> ''
      AND COALESCE(motor_status_after_maintenance, '') <> ''
    ORDER BY maintenance_end_date DESC, maintenance_end_time DESC, created_at DESC
    LIMIT 1
  `).get(motorId)?.status || ''
  const nextStatus = nextMotorMaintenanceStatus(motor.status, openWorkOrders, lastFinishedStatus)
  if (nextStatus !== motor.status) setMotorStatus(motorId, nextStatus)
  return { status: nextStatus, previousStatus: motor.status, changed: nextStatus !== motor.status }
}

function applyMotorEventEffect(motorId, eventType, fields = {}) {
  if (!motorId) return
  const now = nowIso()
  if (eventType === 'movimentado' && fields.toDestinationId && fields.toDestination) {
    db.prepare('UPDATE motors SET destination_id = ?, destination_name = ?, updated_at = ? WHERE id = ?')
      .run(fields.toDestinationId, fields.toDestination, now, motorId)
  }
  if (eventType === 'inativado') {
    db.prepare("UPDATE motors SET status = 'inativo', updated_at = ? WHERE id = ?").run(now, motorId)
  }
  if (eventType === 'reativado' || ['rebobinado', 'reformado', 'revisado', 'enrolado', 'enrolar'].includes(eventType)) {
    db.prepare("UPDATE motors SET status = 'ativo', updated_at = ? WHERE id = ?").run(now, motorId)
  }
}

function mapWorkOrder(r) {
  const motor = r.motor_id ? db.prepare('SELECT id, tag, name, status FROM motors WHERE id = ?').get(r.motor_id) : null
  const motorEvent = r.motor_id
    ? db.prepare(`
      SELECT id, event_type, event_date, performed_by, to_destination, notes
      FROM motor_events
      WHERE work_order_id = ?
      ORDER BY event_date DESC, created_at DESC
      LIMIT 1
    `).get(r.id)
    : null
  const maintenanceLocationName =
    r.maintenance_location_type === 'interna'
      ? (r.maintenance_destination_name || '')
      : (r.maintenance_external_location || '')
  const destinationName = resolveDestinationLeafName(r.destination_id, r.destination_name)
  const originDestinationName = resolveDestinationLeafName(r.motor_origin_destination_id, r.motor_origin_destination_name)
  const maintenanceDestinationName = resolveDestinationLeafName(r.maintenance_destination_id, r.maintenance_destination_name)
  const requestedByName = resolvePersonName(r.requested_by)
  const professionalName = resolvePersonName(r.maintenance_professional)
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    motorId: r.motor_id || '',
    motorTag: motor?.tag || '',
    motorName: motor?.name || '',
    motorStatus: motor?.status || '',
    motorEventId: motorEvent?.id || '',
    motorEventType: motorEvent?.event_type || '',
    motorEventLabel: motorEvent ? motorObjectiveLabel(motorEvent.event_type) : '',
    motorEventDate: motorEvent?.event_date || '',
    motorEventPerformedBy: motorEvent?.performed_by || '',
    motorEventToDestination: motorEvent?.to_destination || '',
    motorEventNotes: motorEvent?.notes || '',
    destinationId: r.destination_id,
    destinationName,
    equipment: r.destination_id ? destinationName : (r.equipment || destinationName || ''),
    motorOriginDestinationId: r.motor_origin_destination_id || '',
    motorOriginDestinationName: originDestinationName,
    maintenanceLocationType: r.maintenance_location_type || '',
    maintenanceDestinationId: r.maintenance_destination_id || '',
    maintenanceDestinationName,
    maintenanceExternalLocation: r.maintenance_external_location || '',
    maintenanceExternalOrderNumber: r.maintenance_external_order_number || '',
    maintenanceLocationName: maintenanceLocationName || destinationName || '',
    serviceType: r.service_type || 'Outros',
    requestDate: r.request_date || '',
    requestTime: r.request_time || '',
    requestedBy: requestedByName,
    note: r.note,
    maintenanceStartDate: r.maintenance_start_date || '',
    maintenanceStartTime: r.maintenance_start_time || '',
    maintenanceEndDate: r.maintenance_end_date || '',
    maintenanceEndTime: r.maintenance_end_time || '',
    maintenanceProfessional: professionalName,
    maintenanceMaterials: r.maintenance_materials || '',
    maintenanceNote: r.maintenance_note || '',
    motorStatusAfterMaintenance: r.motor_status_after_maintenance || '',
    createdAt: r.created_at,
  }
}

function mapWorkOrderItem(r) {
  return {
    id: r.id,
    workOrderId: r.work_order_id,
    variationId: r.variation_id,
    itemId: r.item_id,
    itemName: r.item_name,
    itemGroup: r.item_group,
    itemCategory: r.item_category,
    itemUnit: r.item_unit,
    variationValues: JSON.parse(r.variation_values || '{}'),
    qty: r.qty,
    movementId: r.movement_id,
    addedAt: r.added_at,
  }
}

function changedNotes(changes) {
  return changes.map(c => `${c.label}: ${c.from || '-'} -> ${c.to || '-'}`).join('\n')
}

function collectWorkOrderChanges(oldOrder, nextValues) {
  const fields = [
    ['Numero', oldOrder.number, nextValues.number],
    ['Titulo', oldOrder.title, nextValues.title],
    ['Motor', oldOrder.motor_id || '', nextValues.motorId || ''],
    ['Equipamento', oldOrder.equipment || '', nextValues.equipment || ''],
    ['Local/Oficina', oldOrder.destination_name || '', nextValues.destinationName || ''],
    ['Origem motor', oldOrder.motor_origin_destination_name || '', nextValues.motorOriginDestinationName || ''],
    ['Pedido externo', oldOrder.maintenance_external_order_number || '', nextValues.maintenanceExternalOrderNumber || ''],
    ['Tipo', oldOrder.service_type || '', nextValues.serviceType || ''],
    ['Data solicitacao', oldOrder.request_date || '', nextValues.requestDate || ''],
    ['Horario solicitacao', oldOrder.request_time || '', nextValues.requestTime || ''],
    ['Solicitante', oldOrder.requested_by || '', nextValues.requestedBy || ''],
    ['Observacoes abertura', oldOrder.note || '', nextValues.note || ''],
    ['Inicio manutencao', `${oldOrder.maintenance_start_date || ''} ${oldOrder.maintenance_start_time || ''}`.trim(), `${nextValues.maintenanceStartDate || ''} ${nextValues.maintenanceStartTime || ''}`.trim()],
    ['Termino manutencao', `${oldOrder.maintenance_end_date || ''} ${oldOrder.maintenance_end_time || ''}`.trim(), `${nextValues.maintenanceEndDate || ''} ${nextValues.maintenanceEndTime || ''}`.trim()],
    ['Profissional', oldOrder.maintenance_professional || '', nextValues.maintenanceProfessional || ''],
    ['Materiais adicionais', oldOrder.maintenance_materials || '', nextValues.maintenanceMaterials || ''],
    ['Observacoes manutencao', oldOrder.maintenance_note || '', nextValues.maintenanceNote || ''],
    ['Status motor apos OS', oldOrder.motor_status_after_maintenance || '', nextValues.motorStatusAfterMaintenance || ''],
  ]
  return fields
    .filter(([, from, to]) => String(from ?? '') !== String(to ?? ''))
    .map(([label, from, to]) => ({ label, from: String(from ?? ''), to: String(to ?? '') }))
}

// GET /api/work-orders — list all with items
router.get('/', (req, res) => {
  const orders = db.prepare('SELECT * FROM work_orders ORDER BY created_at DESC').all()
  const allItems = db.prepare('SELECT * FROM work_order_items ORDER BY added_at ASC').all()

  const itemsByOrder = {}
  for (const it of allItems) {
    if (!itemsByOrder[it.work_order_id]) itemsByOrder[it.work_order_id] = []
    itemsByOrder[it.work_order_id].push(mapWorkOrderItem(it))
  }

  res.json(orders.map(o => ({
    ...mapWorkOrder(o),
    items: itemsByOrder[o.id] || []
  })))
})

// GET /api/work-orders/report/by-destination — report grouped by destination
router.get('/report/by-destination', (req, res) => {
  // All work orders grouped by destination
  const orders = db.prepare('SELECT * FROM work_orders ORDER BY created_at DESC').all()
  const allWoItems = db.prepare('SELECT * FROM work_order_items ORDER BY added_at ASC').all()

  // Group orders by destination_name
  const destMap = {} // { destinationName: { destinationId, orders: [...], looseSaidas: [...] } }

  for (const o of orders) {
    const key = resolveDestinationLeafName(o.destination_id, o.destination_name) || 'Sem destino'
    if (!destMap[key]) destMap[key] = { destinationId: o.destination_id, destinationName: key, orders: [], looseSaidas: [] }
    const woItems = allWoItems.filter(it => it.work_order_id === o.id).map(mapWorkOrderItem)
    destMap[key].orders.push({ ...mapWorkOrder(o), items: woItems })
  }

  // Build material totals per destination using only items linked to work orders.
  const result = Object.values(destMap).map(d => {
    const osTotals = {}

    for (const o of d.orders) {
      for (const it of o.items) {
        const key = `${it.itemId}||${JSON.stringify(it.variationValues)}`
        if (!osTotals[key]) osTotals[key] = { itemId: it.itemId, itemName: it.itemName, itemUnit: it.itemUnit, variationValues: it.variationValues, qty: 0 }
        osTotals[key].qty += it.qty
      }
    }

    const osMaterialTotals = Object.values(osTotals)

    return {
      ...d,
      osMaterialTotals,
      looseMaterialTotals: [],
      looseSaidas: [],
      materialTotals: osMaterialTotals,
    }
  })

  result.sort((a, b) => a.destinationName.localeCompare(b.destinationName))
  res.json(result)
})

// GET /api/work-orders/:id — single with items
router.get('/:id', (req, res) => {
  const o = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id)
  if (!o) return res.status(404).json({ error: 'Ordem de serviço não encontrada' })

  const items = db.prepare('SELECT * FROM work_order_items WHERE work_order_id = ? ORDER BY added_at ASC').all(o.id)
  res.json({ ...mapWorkOrder(o), items: items.map(mapWorkOrderItem) })
})

// GET /api/work-orders/:id/events — timeline for a work order
router.get('/:id/events', (req, res) => {
  const o = db.prepare('SELECT id FROM work_orders WHERE id = ?').get(req.params.id)
  if (!o) return res.status(404).json({ error: 'Ordem de servico nao encontrada' })

  const rows = db.prepare(`
    SELECT * FROM work_order_events
    WHERE work_order_id = ?
    ORDER BY event_date DESC, created_at DESC
  `).all(req.params.id)
  res.json(rows.map(mapWorkOrderEvent))
})

// POST /api/work-orders — create
router.post('/', requireAuth, requireOperator, (req, res) => {
  const {
    title,
    number: rawNumber,
    destinationId,
    motorId,
    requestedBy,
    note,
    equipment,
    serviceType,
    requestDate,
    requestTime,
    maintenanceStartDate,
    maintenanceStartTime,
    maintenanceEndDate,
    maintenanceEndTime,
    maintenanceProfessional,
    maintenanceMaterials,
    maintenanceNote,
    motorStatusAfterMaintenance,
    motorOriginDestinationId,
    motorOriginDestinationName,
    maintenanceLocationType,
    maintenanceDestinationId,
    maintenanceExternalLocation,
    maintenanceExternalOrderNumber,
    initialMotorEventType,
    initialMotorEventDate,
    initialMotorEventPerformedBy,
    initialMotorEventToDestinationId,
    initialMotorEventToDestination,
    initialMotorEventNotes,
    createIntent,
  } = req.body

  if (!clean(requestedBy)) return res.status(400).json({ error: 'Solicitante é obrigatório' })
  if (!clean(requestDate)) return res.status(400).json({ error: 'Data é obrigatória' })
  if (!parseOrderDateTime(requestDate, requestTime)) return res.status(400).json({ error: 'Data ou horário inválido' })

  const parsedNumber = parseOrderNumber(rawNumber)
  if (Number.isNaN(parsedNumber)) return res.status(400).json({ error: 'Número da ordem inválido' })

  const maxRow = db.prepare('SELECT MAX(number) as maxNum FROM work_orders').get()
  const number = parsedNumber || (maxRow.maxNum || 0) + 1
  const numberExists = db.prepare('SELECT id FROM work_orders WHERE number = ?').get(number)
  if (numberExists) return res.status(409).json({ error: 'Número da ordem já existe' })

  const motor = clean(motorId) ? db.prepare('SELECT * FROM motors WHERE id = ?').get(clean(motorId)) : null
  if (clean(motorId) && !motor) return res.status(400).json({ error: 'Motor nao encontrado' })

  const isMotorOrder = !!motor
  const maintenanceLocation = buildMaintenanceLocation({ maintenanceLocationType, maintenanceDestinationId, maintenanceExternalLocation, maintenanceExternalOrderNumber })
  if (maintenanceLocation?.error) return res.status(400).json({ error: maintenanceLocation.error })
  const motorObjectiveType = isMotorOrder ? normalizeMotorObjectiveType(initialMotorEventType) : ''
  if (isMotorOrder && !motorObjectiveType) return res.status(400).json({ error: 'Evento inicial do motor invalido' })
  const hasInitialMotorEvent = isMotorOrder && motorObjectiveType !== 'nenhum'
  const initialMotorEventDateValue = hasInitialMotorEvent ? clean(initialMotorEventDate) || clean(requestDate) : ''
  const initialMotorEventToDestinationIdValue = hasInitialMotorEvent ? clean(initialMotorEventToDestinationId) : ''
  const initialMotorEventToDestinationValue = hasInitialMotorEvent && initialMotorEventToDestinationIdValue
    ? resolveDestinationName(initialMotorEventToDestinationIdValue)
    : ''
  if (hasInitialMotorEvent && motorObjectiveType === 'movimentado' && !initialMotorEventToDestinationIdValue) {
    return res.status(400).json({ error: 'Novo local do motor é obrigatório para movimentação' })
  }
  if (hasInitialMotorEvent && initialMotorEventToDestinationIdValue && !initialMotorEventToDestinationValue) {
    return res.status(400).json({ error: 'Destino do evento nao encontrado' })
  }
  const internalMaintenance = maintenanceLocation.maintenanceLocationType === 'interna'
  const maintenanceStartDateValue = clean(maintenanceStartDate)
  const maintenanceStartTimeValue = clean(maintenanceStartTime)
  const maintenanceEndDateValue = clean(maintenanceEndDate)
  const maintenanceEndTimeValue = clean(maintenanceEndTime)
  const maintenanceProfessionalValue = internalMaintenance ? clean(maintenanceProfessional) : ''
  const maintenanceMaterialsValue = maintenanceMaterials || ''
  const maintenanceNoteValue = maintenanceNote || ''
  const creationDateError = workOrderCreationDateError(createIntent, maintenanceStartDateValue, maintenanceEndDateValue)
  if (creationDateError) return res.status(400).json({ error: creationDateError })
  const motorStatusAfterMaintenanceValue = isMotorOrder && maintenanceEndDateValue ? normalizeMotorStatusAfterMaintenance(motorStatusAfterMaintenance) : ''
  if (isMotorOrder && maintenanceEndDateValue && !motorStatusAfterMaintenanceValue) {
    return res.status(400).json({ error: 'Status do motor apos a OS e obrigatorio' })
  }
  const maintenanceError = validateMaintenanceDates({
    maintenanceStartDate: maintenanceStartDateValue,
    maintenanceStartTime: maintenanceStartTimeValue,
    maintenanceEndDate: maintenanceEndDateValue,
    maintenanceEndTime: maintenanceEndTimeValue,
    allowEndWithoutStart: false,
  })
  if (maintenanceError) return res.status(400).json({ error: maintenanceError })

  const originIdValue = isMotorOrder ? clean(motorOriginDestinationId) || motor.destination_id || '' : ''
  const originNameValue = isMotorOrder
    ? clean(motorOriginDestinationName) || (originIdValue ? resolveDestinationName(originIdValue) : '') || motor.destination_name || ''
    : ''
  const destinationIdValue = isMotorOrder ? (maintenanceLocation.maintenanceDestinationId || '') : clean(destinationId)
  let destinationName = isMotorOrder ? maintenanceLocation.maintenanceLocationName : resolveDestinationName(destinationIdValue)
  if (!isMotorOrder && !destinationIdValue) return res.status(400).json({ error: 'Equipamento deve ser selecionado em destinos' })
  if (!isMotorOrder && !destinationIsActive(destinationIdValue)) return res.status(400).json({ error: 'Equipamento deve ser um destino ativo' })
  const equipmentValue = isMotorOrder ? (clean(equipment) || motor?.tag || destinationName) : destinationName
  if (!equipmentValue) return res.status(400).json({ error: 'Equipamento é obrigatório' })

  const serviceTypeValue = normalizeServiceType(serviceType)
  const motorObjectiveTitle = hasInitialMotorEvent ? ` - ${motorObjectiveLabel(motorObjectiveType)}` : ''
  const titleValue = isMotorOrder && !clean(title)
    ? `Motor ${motor.tag}${motorObjectiveTitle}`
    : buildTitle({ title, serviceType: serviceTypeValue, equipment: equipmentValue, destinationName, number })

  const id = genId('os')
  const createdAt = nowIso()

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO work_orders (
      id, number, title, motor_id, destination_id, destination_name, equipment,
      motor_origin_destination_id, motor_origin_destination_name,
      maintenance_location_type, maintenance_destination_id, maintenance_destination_name, maintenance_external_location, maintenance_external_order_number,
      service_type, request_date, request_time,
      requested_by, note, maintenance_start_date, maintenance_start_time, maintenance_end_date,
      maintenance_end_time, maintenance_professional, maintenance_materials, maintenance_note, motor_status_after_maintenance, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, number, titleValue, clean(motorId), destinationIdValue, destinationName, equipmentValue,
      originIdValue, originNameValue,
      maintenanceLocation.maintenanceLocationType || '',
      maintenanceLocation.maintenanceDestinationId || '',
      maintenanceLocation.maintenanceDestinationName || '',
      maintenanceLocation.maintenanceExternalLocation || '',
      maintenanceLocation.maintenanceExternalOrderNumber || '',
      serviceTypeValue,
      clean(requestDate), clean(requestTime), clean(requestedBy), note || '',
      maintenanceStartDateValue, maintenanceStartTimeValue, maintenanceEndDateValue, maintenanceEndTimeValue,
      maintenanceProfessionalValue, maintenanceMaterialsValue, maintenanceNoteValue, motorStatusAfterMaintenanceValue, createdAt
    )

    addWorkOrderEvent(id, 'criada', req, {
      eventDate: createdAt,
      toValue: `OS #${number}`,
      notes: `${titleValue} criada para ${equipmentValue}.`,
    })

    if (hasInitialMotorEvent) {
      const objectiveLabel = motorObjectiveLabel(motorObjectiveType)
      addMotorEvent(id, motor.id, motorObjectiveType, {
        eventDate: initialMotorEventDateValue,
        fromDestination: motor.destination_name || '',
        toDestination: initialMotorEventToDestinationValue,
        performedBy: clean(initialMotorEventPerformedBy) || maintenanceProfessionalValue,
        notes: clean(initialMotorEventNotes) || `Evento inicial da OS: ${objectiveLabel}.`,
      })
      applyMotorEventEffect(motor.id, motorObjectiveType, {
        toDestinationId: initialMotorEventToDestinationIdValue,
        toDestination: initialMotorEventToDestinationValue,
      })
      addWorkOrderEvent(id, 'evento_motor_registrado', req, {
        eventDate: initialMotorEventDateValue,
        toValue: motorObjectiveType,
        notes: clean(initialMotorEventNotes) || `Evento inicial do motor: ${objectiveLabel}.`,
      })
    }

    if (isMotorOrder) {
      const statusSync = syncMotorMaintenanceStatus(motor.id)
      if (statusSync.changed) {
        addWorkOrderEvent(id, 'atualizada', req, {
          eventDate: createdAt,
          fromValue: statusSync.previousStatus,
          toValue: statusSync.status,
          notes: `Status do motor ${motor.tag} sincronizado com OS abertas.`,
        })
      }
    }
  })
  tx()

  const createdOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id)
  res.json({ ...mapWorkOrder(createdOrder), items: [] })
})

// PUT /api/work-orders/:id — update
router.put('/:id', requireAuth, requireOperator, (req, res) => {
  const o = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id)
  if (!o) return res.status(404).json({ error: 'Ordem de serviço não encontrada' })

  const {
    title,
    number: rawNumber,
    destinationId,
    motorId,
    requestedBy,
    note,
    equipment,
    serviceType,
    requestDate,
    requestTime,
    maintenanceStartDate,
    maintenanceStartTime,
    maintenanceEndDate,
    maintenanceEndTime,
    maintenanceProfessional,
    maintenanceMaterials,
    maintenanceNote,
    motorStatusAfterMaintenance,
    motorOriginDestinationId,
    motorOriginDestinationName,
    maintenanceLocationType,
    maintenanceDestinationId,
    maintenanceExternalLocation,
    maintenanceExternalOrderNumber,
  } = req.body

  const newMotorId = motorId !== undefined ? clean(motorId) : (o.motor_id || '')
  const motor = newMotorId ? db.prepare('SELECT * FROM motors WHERE id = ?').get(newMotorId) : null
  if (newMotorId && !motor) return res.status(400).json({ error: 'Motor nao encontrado' })
  const isMotorOrder = !!motor
  const parsedNumber = parseOrderNumber(rawNumber)
  if (Number.isNaN(parsedNumber)) return res.status(400).json({ error: 'Número da ordem inválido' })
  const nextNumber = parsedNumber || o.number
  const numberExists = db.prepare('SELECT id FROM work_orders WHERE number = ? AND id != ?').get(nextNumber, req.params.id)
  if (numberExists) return res.status(409).json({ error: 'Número da ordem já existe' })

  const requestDateValue = requestDate !== undefined ? clean(requestDate) : (o.request_date || '')
  const requestTimeValue = requestTime !== undefined ? clean(requestTime) : (o.request_time || '')
  if (!requestDateValue) return res.status(400).json({ error: 'Data é obrigatória' })
  if (!parseOrderDateTime(requestDateValue, requestTimeValue)) return res.status(400).json({ error: 'Data ou horário inválido' })

  const maintenanceLocation = buildMaintenanceLocation({
    maintenanceLocationType,
    maintenanceDestinationId,
    maintenanceExternalLocation,
    maintenanceExternalOrderNumber,
  }, o)
  if (maintenanceLocation?.error) return res.status(400).json({ error: maintenanceLocation.error })

  const originIdValue = isMotorOrder
    ? clean(motorOriginDestinationId ?? o.motor_origin_destination_id) || motor.destination_id || ''
    : ''
  const originNameValue = isMotorOrder
    ? clean(motorOriginDestinationName ?? o.motor_origin_destination_name) || (originIdValue ? resolveDestinationName(originIdValue) : '') || motor.destination_name || ''
    : ''
  const newDestId = isMotorOrder
    ? (maintenanceLocation.maintenanceDestinationId || '')
    : clean(destinationId !== undefined ? destinationId : o.destination_id)
  let destinationName = isMotorOrder ? maintenanceLocation.maintenanceLocationName : resolveDestinationName(newDestId)
  if (!isMotorOrder && !newDestId) return res.status(400).json({ error: 'Equipamento deve ser selecionado em destinos' })
  if (!isMotorOrder && !destinationIsActive(newDestId)) return res.status(400).json({ error: 'Equipamento deve ser um destino ativo' })
  const equipmentValue = isMotorOrder
    ? (equipment !== undefined ? clean(equipment) : (o.equipment || motor?.tag || o.destination_name || ''))
    : destinationName

  const serviceTypeValue = serviceType !== undefined ? normalizeServiceType(serviceType) : (o.service_type || 'Outros')
  const requestedByValue = requestedBy !== undefined ? clean(requestedBy) : o.requested_by

  if (!requestedByValue) return res.status(400).json({ error: 'Solicitante é obrigatório' })
  if (!equipmentValue) return res.status(400).json({ error: 'Equipamento é obrigatório' })
  const internalMaintenance = maintenanceLocation.maintenanceLocationType === 'interna'
  const maintenanceStartDateValue = maintenanceStartDate !== undefined ? clean(maintenanceStartDate) : (o.maintenance_start_date || '')
  const maintenanceStartTimeValue = maintenanceStartTime !== undefined ? clean(maintenanceStartTime) : (o.maintenance_start_time || '')
  const maintenanceEndDateValue = maintenanceEndDate !== undefined ? clean(maintenanceEndDate) : (o.maintenance_end_date || '')
  const maintenanceEndTimeValue = maintenanceEndTime !== undefined ? clean(maintenanceEndTime) : (o.maintenance_end_time || '')
  const maintenanceProfessionalValue = internalMaintenance
    ? (maintenanceProfessional !== undefined ? clean(maintenanceProfessional) : (o.maintenance_professional || ''))
    : ''
  const maintenanceMaterialsValue = maintenanceMaterials !== undefined ? maintenanceMaterials : (o.maintenance_materials || '')
  const maintenanceNoteValue = maintenanceNote !== undefined ? maintenanceNote : (o.maintenance_note || '')
  const motorStatusAfterMaintenanceValue = isMotorOrder && maintenanceEndDateValue
    ? normalizeMotorStatusAfterMaintenance(motorStatusAfterMaintenance !== undefined ? motorStatusAfterMaintenance : (o.motor_status_after_maintenance || ''))
    : ''
  if (isMotorOrder && maintenanceEndDateValue && !motorStatusAfterMaintenanceValue) {
    return res.status(400).json({ error: 'Status do motor apos a OS e obrigatorio' })
  }
  const maintenanceError = validateMaintenanceDates({
    maintenanceStartDate: maintenanceStartDateValue,
    maintenanceStartTime: maintenanceStartTimeValue,
    maintenanceEndDate: maintenanceEndDateValue,
    maintenanceEndTime: maintenanceEndTimeValue,
    allowEndWithoutStart: false,
  })
  if (maintenanceError) return res.status(400).json({ error: maintenanceError })

  const titleValue = buildTitle({
    title: title !== undefined ? title : o.title,
    serviceType: serviceTypeValue,
    equipment: equipmentValue,
    destinationName,
    number: nextNumber,
  })

  const nextValues = {
    number: nextNumber,
    title: titleValue,
    motorId: newMotorId,
    destinationId: newDestId,
    destinationName,
    equipment: equipmentValue,
    motorOriginDestinationId: originIdValue,
    motorOriginDestinationName: originNameValue,
    maintenanceLocationType: maintenanceLocation.maintenanceLocationType || '',
    maintenanceDestinationId: maintenanceLocation.maintenanceDestinationId || '',
    maintenanceDestinationName: maintenanceLocation.maintenanceDestinationName || '',
    maintenanceExternalLocation: maintenanceLocation.maintenanceExternalLocation || '',
    maintenanceExternalOrderNumber: maintenanceLocation.maintenanceExternalOrderNumber || '',
    serviceType: serviceTypeValue,
    requestDate: requestDateValue,
    requestTime: requestTimeValue,
    requestedBy: requestedByValue,
    note: note !== undefined ? note : o.note,
    maintenanceStartDate: maintenanceStartDateValue,
    maintenanceStartTime: maintenanceStartTimeValue,
    maintenanceEndDate: maintenanceEndDateValue,
    maintenanceEndTime: maintenanceEndTimeValue,
    maintenanceProfessional: maintenanceProfessionalValue,
    maintenanceMaterials: maintenanceMaterialsValue,
    maintenanceNote: maintenanceNoteValue,
    motorStatusAfterMaintenance: motorStatusAfterMaintenanceValue,
  }
  const changes = collectWorkOrderChanges(o, nextValues)
  const wasOpenEnded = !o.maintenance_end_date
  const isNowFinished = Boolean(nextValues.maintenanceEndDate)

  const tx = db.transaction(() => {
    db.prepare(`UPDATE work_orders SET
      number=?, title=?, motor_id=?, destination_id=?, destination_name=?, equipment=?,
      motor_origin_destination_id=?, motor_origin_destination_name=?,
      maintenance_location_type=?, maintenance_destination_id=?, maintenance_destination_name=?, maintenance_external_location=?, maintenance_external_order_number=?,
      service_type=?,
      request_date=?, request_time=?, requested_by=?, note=?,
      maintenance_start_date=?, maintenance_start_time=?, maintenance_end_date=?,
      maintenance_end_time=?, maintenance_professional=?, maintenance_materials=?, maintenance_note=?, motor_status_after_maintenance=?
      WHERE id=?`).run(
      nextValues.number,
      nextValues.title,
      nextValues.motorId,
      nextValues.destinationId,
      nextValues.destinationName,
      nextValues.equipment,
      nextValues.motorOriginDestinationId,
      nextValues.motorOriginDestinationName,
      nextValues.maintenanceLocationType,
      nextValues.maintenanceDestinationId,
      nextValues.maintenanceDestinationName,
      nextValues.maintenanceExternalLocation,
      nextValues.maintenanceExternalOrderNumber,
      nextValues.serviceType,
      nextValues.requestDate,
      nextValues.requestTime,
      nextValues.requestedBy,
      nextValues.note,
      nextValues.maintenanceStartDate,
      nextValues.maintenanceStartTime,
      nextValues.maintenanceEndDate,
      nextValues.maintenanceEndTime,
      nextValues.maintenanceProfessional,
      nextValues.maintenanceMaterials,
      nextValues.maintenanceNote,
      nextValues.motorStatusAfterMaintenance,
      req.params.id
    )

    if (changes.length) {
      addWorkOrderEvent(req.params.id, 'atualizada', req, {
        notes: changedNotes(changes),
      })
    }
    if (wasOpenEnded && isNowFinished) {
      addWorkOrderEvent(req.params.id, 'finalizada', req, {
        toValue: `${nextValues.maintenanceEndDate} ${nextValues.maintenanceEndTime || ''}`.trim(),
        notes: 'Data de termino da manutencao foi preenchida.',
      })
    }

    for (const motorId of new Set([o.motor_id, nextValues.motorId].filter(Boolean))) {
      const statusSync = syncMotorMaintenanceStatus(motorId)
      if (statusSync.changed) {
        addWorkOrderEvent(req.params.id, 'atualizada', req, {
          fromValue: statusSync.previousStatus,
          toValue: statusSync.status,
          notes: 'Status do motor sincronizado com OS abertas.',
        })
      }
    }
  })
  tx()

  const updated = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id)
  const items = db.prepare('SELECT * FROM work_order_items WHERE work_order_id = ? ORDER BY added_at ASC').all(req.params.id)
  res.json({ ...mapWorkOrder(updated), items: items.map(mapWorkOrderItem) })
})

// DELETE /api/work-orders/:id — delete (cascade removes items)
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const o = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id)
  if (!o) return res.status(404).json({ error: 'Ordem de serviço não encontrada' })

  const workOrderItems = db.prepare('SELECT * FROM work_order_items WHERE work_order_id = ?').all(req.params.id)
  const removedMovementIds = []
  const restoredStockByVariation = new Map()

  const tx = db.transaction(() => {
    for (const item of workOrderItems) {
      if (!item.movement_id) continue
      const movement = db.prepare('SELECT doc_ref, qty, type, affects_stock FROM movements WHERE id = ?').get(item.movement_id)
      const isImplicit = movement?.type === 'saida' && movement.doc_ref === `OS #${o.number}`
      if (!isImplicit) continue

      const variation = db.prepare('SELECT stock FROM variations WHERE id = ?').get(item.variation_id)
      if (variation && movement.affects_stock !== 0) {
        const newStock = variation.stock + movement.qty
        db.prepare('UPDATE variations SET stock = ? WHERE id = ?').run(newStock, item.variation_id)
        restoredStockByVariation.set(item.variation_id, newStock)
      }
      db.prepare('DELETE FROM movements WHERE id = ?').run(item.movement_id)
      removedMovementIds.push(item.movement_id)
    }

    db.prepare('DELETE FROM motor_events WHERE work_order_id = ?').run(req.params.id)
    db.prepare('DELETE FROM work_orders WHERE id = ?').run(req.params.id)
    syncMotorMaintenanceStatus(o.motor_id)
  })

  tx()

  res.json({
    ok: true,
    removedMovementIds,
    restoredStock: Array.from(restoredStockByVariation.entries()).map(([variationId, newStock]) => ({ variationId, newStock })),
  })
})

// POST /api/work-orders/:id/items — add material to work order
router.post('/:id/items', requireAuth, requireOperator, (req, res) => {
  const o = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id)
  if (!o) return res.status(404).json({ error: 'Ordem de serviço não encontrada' })

  const { variationId } = req.body
  const qty = parsePositiveQty(req.body.qty)
  if (!variationId || !qty) return res.status(400).json({ error: 'variationId e qty (>0) são obrigatórios' })

  const variation = db.prepare('SELECT * FROM variations WHERE id = ? AND active = 1').get(variationId)
  if (!variation) return res.status(404).json({ error: 'Variação não encontrada' })

  const item = db.prepare('SELECT * FROM items WHERE id = ? AND active = 1').get(variation.item_id)
  if (!item) return res.status(404).json({ error: 'Item não encontrado' })

  const confirmations = prepareStockConfirmations(db, [{ variationId, qty, type: 'saida' }], req.body.stockCounts)
  const stockBefore = confirmations.get(variationId)?.countedStock ?? variation.stock
  if (stockBefore < qty) return res.status(400).json({ error: `Estoque insuficiente. Disponível: ${stockBefore}` })

  const operatorId = req.user?.id || ''
  const operatorName = req.user?.name || ''
  const withdrawnBy = o.maintenance_professional || o.requested_by || ''
  const materialDestination = o.maintenance_destination_name || o.maintenance_external_location || o.destination_name || ''

  // Deduct stock + create implicit movement in a transaction
  const stockAfter = stockBefore - qty

  const movId = genId('mov')
  const woiId = genId('osi')
  const now = new Date().toISOString()

  const tx = db.transaction(() => {
    applyStockConfirmations(db, confirmations, req.user, now)
    // Update variation stock
    db.prepare('UPDATE variations SET stock = ? WHERE id = ?').run(stockAfter, variationId)

    // Create implicit saida movement
    db.prepare(`INSERT INTO movements (id, type, variation_id, item_id, item_name, item_group, item_category, item_subcategory, item_unit, variation_values, variation_extras, qty, stock_before, stock_after, date, supplier, requested_by, destination, doc_ref, note, operator_id, operator_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      movId, 'saida', variationId, item.id,
      item.name, item.group_name, item.category || '', item.subcategory || '', item.unit,
      variation.vals, variation.extras || '{}',
      qty, stockBefore, stockAfter, now,
      '', withdrawnBy, materialDestination,
      `OS #${o.number}`, `Material adicionado via OS #${o.number}`,
      operatorId, operatorName
    )

    // Create work_order_items record
    db.prepare(`INSERT INTO work_order_items (id, work_order_id, variation_id, item_id, item_name, item_group, item_category, item_unit, variation_values, qty, movement_id, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      woiId, o.id, variationId, item.id,
      item.name, item.group_name, item.category || '', item.unit,
      variation.vals, qty, movId, now
    )

    addWorkOrderEvent(o.id, 'material_adicionado', req, {
      eventDate: now,
      toValue: `${item.name} (${qty} ${item.unit})`,
      notes: `Material adicionado com baixa no estoque. Movimento ${movId}.`,
    })
  })

  tx()

  res.json({
    workOrderItem: {
      id: woiId,
      workOrderId: o.id,
      variationId, itemId: item.id,
      itemName: item.name, itemGroup: item.group_name,
      itemCategory: item.category || '', itemUnit: item.unit,
      variationValues: JSON.parse(variation.vals || '{}'),
      qty, movementId: movId, addedAt: now,
    },
    movement: {
      id: movId, type: 'saida', variationId, itemId: item.id,
      itemName: item.name, itemGroup: item.group_name,
      itemCategory: item.category || '', itemSubcategory: item.subcategory || '',
      itemUnit: item.unit,
      variationValues: JSON.parse(variation.vals || '{}'),
      variationExtras: JSON.parse(variation.extras || '{}'),
      qty, stockBefore, stockAfter, date: now,
      supplier: '', requestedBy: withdrawnBy,
      destination: materialDestination,
      docRef: `OS #${o.number}`,
      note: `Material adicionado via OS #${o.number}`,
      operatorId, operatorName
    },
    newStock: stockAfter,
    stockConfirmed: true
  })
})

// DELETE /api/work-orders/:id/items/:itemId — remove material, revert stock
router.delete('/:id/items/:itemId', requireAuth, requireAdmin, (req, res) => {
  const woi = db.prepare('SELECT * FROM work_order_items WHERE id = ? AND work_order_id = ?').get(req.params.itemId, req.params.id)
  if (!woi) return res.status(404).json({ error: 'Item da OS não encontrado' })
  const order = db.prepare('SELECT number FROM work_orders WHERE id = ?').get(req.params.id)
  const movement = woi.movement_id ? db.prepare('SELECT doc_ref, qty, type, affects_stock FROM movements WHERE id = ?').get(woi.movement_id) : null
  const isImplicit = movement?.type === 'saida' && movement.doc_ref === `OS #${order?.number}`

  const tx = db.transaction(() => {
    // Only revert stock and remove movement if it was an implicit movement (added directly via OS)
    // For linked movements (from saída flow), stock was already handled by the movement itself

    if (isImplicit) {
      // Revert stock
      const variation = db.prepare('SELECT stock FROM variations WHERE id = ?').get(woi.variation_id)
      if (variation && movement.affects_stock !== 0) {
        db.prepare('UPDATE variations SET stock = ? WHERE id = ?').run(variation.stock + movement.qty, woi.variation_id)
      }
      db.prepare('DELETE FROM movements WHERE id = ?').run(woi.movement_id)
    }

    // Remove the work order item
    db.prepare('DELETE FROM work_order_items WHERE id = ?').run(woi.id)

    addWorkOrderEvent(req.params.id, 'material_removido', req, {
      fromValue: `${woi.item_name} (${woi.qty} ${woi.item_unit})`,
      notes: isImplicit
        ? 'Material removido da OS e estoque restaurado.'
        : 'Material desvinculado da OS. Movimento original preservado.',
    })
  })

  tx()

  const newStock = db.prepare('SELECT stock FROM variations WHERE id = ?').get(woi.variation_id)
  res.json({
    ok: true,
    removedMovementId: isImplicit ? woi.movement_id : null,
    variationId: woi.variation_id,
    newStock: newStock ? newStock.stock : null,
    implicit: isImplicit
  })
})

// POST /api/work-orders/:id/items/link — link an existing movement to a work order (no stock deduction)
router.post('/:id/items/link', requireAuth, requireOperator, (req, res) => {
  const o = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id)
  if (!o) return res.status(404).json({ error: 'Ordem de serviço não encontrada' })

  const { movementId } = req.body
  if (!movementId) return res.status(400).json({ error: 'movementId é obrigatório' })

  const mov = db.prepare('SELECT * FROM movements WHERE id = ?').get(movementId)
  if (!mov) return res.status(404).json({ error: 'Movimentação não encontrada' })
  if (mov.type !== 'saida') return res.status(400).json({ error: 'Somente saídas podem ser vinculadas a uma OS.' })
  if (db.prepare('SELECT id FROM work_order_items WHERE movement_id = ?').get(movementId)) {
    return res.status(409).json({ error: 'Esta movimentação já está vinculada a uma OS.' })
  }

  const woiId = genId('osi')
  const now = new Date().toISOString()

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO work_order_items (id, work_order_id, variation_id, item_id, item_name, item_group, item_category, item_unit, variation_values, qty, movement_id, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      woiId, o.id, mov.variation_id, mov.item_id,
      mov.item_name || '', mov.item_group || '', mov.item_category || '', mov.item_unit || '',
      mov.variation_values || '{}', mov.qty, mov.id, now
    )

    addWorkOrderEvent(o.id, 'movimento_vinculado', req, {
      eventDate: now,
      toValue: `${mov.item_name || 'Movimento'} (${mov.qty} ${mov.item_unit || ''})`,
      notes: `Movimento ${mov.id} vinculado a OS #${o.number}.`,
    })
  })
  tx()

  res.json({
    id: woiId,
    workOrderId: o.id,
    variationId: mov.variation_id,
    itemId: mov.item_id,
    itemName: mov.item_name || '',
    itemGroup: mov.item_group || '',
    itemCategory: mov.item_category || '',
    itemUnit: mov.item_unit || '',
    variationValues: JSON.parse(mov.variation_values || '{}'),
    qty: mov.qty,
    movementId: mov.id,
    addedAt: now,
  })
})

export default router

