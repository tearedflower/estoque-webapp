const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const RELATIVE_LIMIT_MS = 48 * HOUR_MS

export function formatRecentDateTime(value, now = new Date()) {
  const date = new Date(value)
  const elapsed = new Date(now).getTime() - date.getTime()
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= RELATIVE_LIMIT_MS) return ''

  const minutes = Math.floor(elapsed / MINUTE_MS)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`

  const hours = Math.floor(elapsed / HOUR_MS)
  if (hours < 24) return `há ${hours} ${hours === 1 ? 'hora' : 'horas'}`

  const days = Math.floor(hours / 24)
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
}
