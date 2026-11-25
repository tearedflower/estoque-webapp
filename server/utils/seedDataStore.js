function nowIso() {
  return new Date().toISOString()
}

export function resetBusinessData(db, { includeSessions = false } = {}) {
  db.exec(`
    ${includeSessions ? 'DELETE FROM sessions;' : ''}
    DELETE FROM photo_batch_photos;
    DELETE FROM photo_batches;
    DELETE FROM variation_photos;
    DELETE FROM movement_batch_requests;
    DELETE FROM work_order_events;
    DELETE FROM work_order_items;
    DELETE FROM motor_events;
    DELETE FROM motor_materials;
    DELETE FROM work_orders;
    DELETE FROM motors;
    DELETE FROM monthly_closings;
    DELETE FROM epi_role_rules;
    DELETE FROM epi_periodicities;
    DELETE FROM movements;
    DELETE FROM variations;
    DELETE FROM items;
    DELETE FROM locations;
    DELETE FROM destinations;
    DELETE FROM people;
    DELETE FROM suppliers;
    DELETE FROM roles;
    UPDATE display_order SET data = '{}' WHERE id = 1;
  `)
}

export function populateSeedData(db, data) {
  const {
    items = [],
    variations = [],
    movements = [],
    destinations = [],
    locations = [],
    people = [],
    suppliers = [],
    roles = [],
    epiRoleRules = [],
    epiPeriodicities = [],
    workOrders = [],
    workOrderItems = [],
    workOrderEvents = [],
    motors = [],
    motorEvents = [],
    motorMaterials = [],
    monthlyClosings = [],
  } = data

  const insertItem = db.prepare(`
    INSERT OR REPLACE INTO items (
      id, name, group_name, category, subcategory, unit, min_stock, min_stock_defined, attributes, location, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertVariation = db.prepare(`
    INSERT OR REPLACE INTO variations (
      id, item_id, vals, stock, min_stock, min_stock_defined, initial_stock, extras, location, locations, destinations, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertMovement = db.prepare(`
    INSERT OR REPLACE INTO movements (
      id, type, variation_id, item_id, item_name, item_group, item_category, item_subcategory,
      item_unit, variation_values, variation_extras, qty, stock_before, stock_after, date,
      supplier, unit_cost, requested_by, requested_by_person_id, destination, doc_ref, note,
      operator_id, operator_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertDestination = db.prepare(`
    INSERT OR REPLACE INTO destinations (
      id, name, description, active, parent_id, material_rules
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)
  const insertLocation = db.prepare(`
    INSERT OR REPLACE INTO locations (id, name, description, active, parent_id)
    VALUES (?, ?, ?, ?, ?)
  `)
  const insertPerson = db.prepare(`
    INSERT OR REPLACE INTO people (id, name, role_text, registration, active, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const insertSupplier = db.prepare(`
    INSERT OR REPLACE INTO suppliers (id, name, description, active)
    VALUES (?, ?, ?, ?)
  `)
  const insertRole = db.prepare(`
    INSERT OR REPLACE INTO roles (id, name, description, active)
    VALUES (?, ?, ?, ?)
  `)
  const insertEpiRoleRule = db.prepare(`
    INSERT OR REPLACE INTO epi_role_rules (
      id, role_name, target_type, target_key, target_label, days, quantity, active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertEpiPeriodicity = db.prepare(`
    INSERT OR REPLACE INTO epi_periodicities (
      id, target_type, target_key, target_label, days, active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const insertMotor = db.prepare(`
    INSERT OR REPLACE INTO motors (
      id, tag, serial, name, manufacturer, power, power_unit, voltage, rpm, amperage,
      destination_id, destination_name, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertWorkOrder = db.prepare(`
    INSERT OR REPLACE INTO work_orders (
      id, number, title, motor_id, destination_id, destination_name, equipment,
      motor_origin_destination_id, motor_origin_destination_name,
      maintenance_location_type, maintenance_destination_id, maintenance_destination_name,
      maintenance_external_location, maintenance_external_order_number, service_type,
      request_date, request_time, requested_by, note, maintenance_start_date,
      maintenance_start_time, maintenance_end_date, maintenance_end_time,
      maintenance_professional, maintenance_materials, maintenance_note,
      motor_status_after_maintenance, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertWorkOrderItem = db.prepare(`
    INSERT OR REPLACE INTO work_order_items (
      id, work_order_id, variation_id, item_id, item_name, item_group, item_category,
      item_unit, variation_values, qty, movement_id, added_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertWorkOrderEvent = db.prepare(`
    INSERT OR REPLACE INTO work_order_events (
      id, work_order_id, event_type, event_date, operator_id, operator_name,
      from_value, to_value, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertMotorEvent = db.prepare(`
    INSERT OR REPLACE INTO motor_events (
      id, motor_id, work_order_id, event_type, event_date, from_destination,
      to_destination, performed_by, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertMotorMaterial = db.prepare(`
    INSERT OR REPLACE INTO motor_materials (
      id, motor_id, item_id, variation_id, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)
  const insertClosing = db.prepare(`
    INSERT OR REPLACE INTO monthly_closings (
      id, year, month, closed_at, closed_by_id, closed_by_name, notes, data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const row of roles) {
    insertRole.run(row.id, row.name, row.description || '', row.active !== false ? 1 : 0)
  }
  for (const row of people) {
    const status = row.status || (row.active === false ? 'inativo' : 'ativo')
    insertPerson.run(
      row.id,
      row.name,
      row.role || '',
      row.registration || '',
      row.active !== false && status !== 'demitido' && status !== 'inativo' ? 1 : 0,
      status
    )
  }
  for (const row of suppliers) {
    insertSupplier.run(row.id, row.name, row.description || '', row.active !== false ? 1 : 0)
  }
  for (const row of locations) {
    insertLocation.run(row.id, row.name, row.description || '', row.active !== false ? 1 : 0, row.parentId || null)
  }
  for (const row of destinations) {
    insertDestination.run(
      row.id,
      row.name,
      row.description || '',
      row.active !== false ? 1 : 0,
      row.parentId || null,
      JSON.stringify(row.materialRules || [])
    )
  }
  for (const row of items) {
    insertItem.run(
      row.id,
      row.name,
      row.group,
      row.category || null,
      row.subcategory || null,
      row.unit || 'UN',
      row.minStock || 0,
      row.minStock !== null && row.minStock !== undefined && String(row.minStock).trim() !== '' ? 1 : 0,
      JSON.stringify(row.attributes || []),
      row.location || '',
      row.active !== false ? 1 : 0
    )
  }
  for (const row of variations) {
    const stock = Number(row.stock || 0)
    insertVariation.run(
      row.id,
      row.itemId,
      JSON.stringify(row.values || {}),
      stock,
      row.minStock || 0,
      row.minStock !== null && row.minStock !== undefined && String(row.minStock).trim() !== '' ? 1 : 0,
      row.initialStock !== undefined ? row.initialStock : stock,
      JSON.stringify(row.extras || {}),
      row.location || '',
      JSON.stringify(row.locations || []),
      JSON.stringify(row.destinations || []),
      row.active !== false ? 1 : 0
    )
  }
  for (const row of movements) {
    insertMovement.run(
      row.id,
      row.type,
      row.variationId,
      row.itemId,
      row.itemName || '',
      row.itemGroup || '',
      row.itemCategory || '',
      row.itemSubcategory || '',
      row.itemUnit || '',
      JSON.stringify(row.variationValues || {}),
      JSON.stringify(row.variationExtras || {}),
      row.qty || 0,
      row.stockBefore || 0,
      row.stockAfter || 0,
      row.date || nowIso(),
      row.supplier || '',
      row.unitCost ?? null,
      row.requestedBy || '',
      row.requestedByPersonId || '',
      row.destination || '',
      row.docRef || '',
      row.note || '',
      row.operatorId || '',
      row.operatorName || ''
    )
  }
  for (const row of epiRoleRules) {
    insertEpiRoleRule.run(
      row.id,
      row.roleName,
      row.targetType,
      row.targetKey,
      row.targetLabel || '',
      row.days || 30,
      row.quantity || 1,
      row.active !== false ? 1 : 0,
      row.createdAt || nowIso()
    )
  }
  for (const row of epiPeriodicities) {
    insertEpiPeriodicity.run(
      row.id,
      row.targetType,
      row.targetKey,
      row.targetLabel || '',
      row.days || 30,
      row.active !== false ? 1 : 0,
      row.createdAt || nowIso()
    )
  }
  for (const row of motors) {
    insertMotor.run(
      row.id,
      row.tag,
      row.serial || '',
      row.name || '',
      row.manufacturer || '',
      row.power || '',
      row.powerUnit || 'CV',
      row.voltage || '',
      row.rpm || '',
      row.amperage || '',
      row.destinationId || '',
      row.destinationName || '',
      row.status || 'ativo',
      row.notes || '',
      row.createdAt || nowIso(),
      row.updatedAt || row.createdAt || nowIso()
    )
  }
  for (const row of workOrders) {
    insertWorkOrder.run(
      row.id,
      row.number,
      row.title || `OS #${row.number}`,
      row.motorId || '',
      row.destinationId || '',
      row.destinationName || '',
      row.equipment || '',
      row.motorOriginDestinationId || '',
      row.motorOriginDestinationName || '',
      row.maintenanceLocationType || '',
      row.maintenanceDestinationId || '',
      row.maintenanceDestinationName || '',
      row.maintenanceExternalLocation || '',
      row.maintenanceExternalOrderNumber || '',
      row.serviceType || 'Outros',
      row.requestDate || '',
      row.requestTime || '',
      row.requestedBy || '',
      row.note || '',
      row.maintenanceStartDate || '',
      row.maintenanceStartTime || '',
      row.maintenanceEndDate || '',
      row.maintenanceEndTime || '',
      row.maintenanceProfessional || '',
      row.maintenanceMaterials || '',
      row.maintenanceNote || '',
      row.motorStatusAfterMaintenance || '',
      row.createdAt || nowIso()
    )
  }
  for (const row of workOrderItems) {
    insertWorkOrderItem.run(
      row.id,
      row.workOrderId,
      row.variationId,
      row.itemId,
      row.itemName || '',
      row.itemGroup || '',
      row.itemCategory || '',
      row.itemUnit || '',
      JSON.stringify(row.variationValues || {}),
      row.qty || 0,
      row.movementId || '',
      row.addedAt || nowIso()
    )
  }
  for (const row of workOrderEvents) {
    insertWorkOrderEvent.run(
      row.id,
      row.workOrderId,
      row.eventType,
      row.eventDate || nowIso(),
      row.operatorId || '',
      row.operatorName || '',
      row.fromValue || '',
      row.toValue || '',
      row.notes || '',
      row.createdAt || row.eventDate || nowIso()
    )
  }
  for (const row of motorEvents) {
    insertMotorEvent.run(
      row.id,
      row.motorId,
      row.workOrderId || '',
      row.eventType,
      row.eventDate || nowIso(),
      row.fromDestination || '',
      row.toDestination || '',
      row.performedBy || '',
      row.notes || '',
      row.createdAt || row.eventDate || nowIso()
    )
  }
  for (const row of motorMaterials) {
    insertMotorMaterial.run(
      row.id,
      row.motorId,
      row.itemId,
      row.variationId,
      row.note || '',
      row.createdAt || nowIso()
    )
  }
  for (const row of monthlyClosings) {
    insertClosing.run(
      row.id,
      row.year,
      row.month,
      row.closedAt || nowIso(),
      row.closedById || '',
      row.closedByName || '',
      row.notes || '',
      JSON.stringify(row.data || {})
    )
  }
  return {
    items: items.length,
    variations: variations.length,
    movements: movements.length,
    destinations: destinations.length,
    locations: locations.length,
    people: people.length,
    suppliers: suppliers.length,
    roles: roles.length,
    epiRoleRules: epiRoleRules.length,
    epiPeriodicities: epiPeriodicities.length,
    workOrders: workOrders.length,
    workOrderItems: workOrderItems.length,
    workOrderEvents: workOrderEvents.length,
    motors: motors.length,
    motorEvents: motorEvents.length,
    motorMaterials: motorMaterials.length,
    monthlyClosings: monthlyClosings.length,
  }
}
