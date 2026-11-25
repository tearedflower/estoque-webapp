const pad = value => String(value).padStart(2, '0')

export function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDateOnly(value) {
  if (!value) return '-'
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${day}/${month}/${year}`
  }
  return formatDate(value).split(' ')[0]
}

export function formatTimeOnly(value) {
  return value || '-'
}

export function formatDateTimeParts(date, time, fallback) {
  if (date && time) return `${formatDateOnly(date)} ${formatTimeOnly(time)}`
  if (date) return formatDateOnly(date)
  if (time) return formatTimeOnly(time)
  return formatDate(fallback)
}

export function maintenancePeriod(order) {
  const start = formatDateTimeParts(order.maintenanceStartDate, order.maintenanceStartTime, '')
  const end = formatDateTimeParts(order.maintenanceEndDate, order.maintenanceEndTime, '')
  if (start === '-' && end === '-') return '-'
  if (end === '-') return `${start} até em aberto`
  return `${start} até ${end}`
}

export function maintenanceEndLabel(order) {
  if (order.maintenanceEndDate && order.maintenanceEndTime) {
    return formatDateTimeParts(order.maintenanceEndDate, order.maintenanceEndTime, '')
  }
  if (order.maintenanceEndDate) return formatDateOnly(order.maintenanceEndDate)
  return 'Em aberto'
}

export function maintenanceObservation(order) {
  return order.maintenanceNote || order.note || '-'
}

export function motorOrderTitle(order) {
  if (!order.motorId) return ''
  const tag = order.motorTag || order.equipment || 'Sem tag'
  return `${tag}${order.motorName ? ` - ${order.motorName}` : ''}`
}

export function maintenanceLocationLabel(order) {
  return order.maintenanceLocationName ||
    order.maintenanceDestinationName ||
    order.maintenanceExternalLocation ||
    order.destinationName ||
    '-'
}

export function maintenanceLocationTypeLabel(order) {
  if (order.maintenanceLocationType === 'interna') return 'Interna'
  if (order.maintenanceLocationType === 'externa') return 'Externa'
  return order.motorId ? '-' : ''
}

export function orderDisplayTitle(order) {
  if (order.motorId) return motorOrderTitle(order)
  return order.equipment || order.destinationName || order.title || 'Sem equipamento'
}

export function variationLabel(v) {
  const vals = v.variationValues || v.values || {}
  const parts = Object.entries(vals).map(([k, val]) => `${k}: ${val}`).filter(Boolean)
  return parts.length ? parts.join(' - ') : '-'
}

export function hierarchyLabel(item) {
  return [item.group, item.category, item.subcategory].filter(Boolean).join(' > ')
}
