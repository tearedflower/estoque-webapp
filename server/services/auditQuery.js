export function normalizeAuditSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function queryMovementAudit(db, query) {
  const badRequest = message => { throw Object.assign(new Error(message), { status: 400 }) }
  const paginated = query.page !== undefined || query.pageSize !== undefined
  const page = Number(query.page ?? 1)
  const pageSize = Number(query.pageSize ?? 25)
  const offset = (page - 1) * pageSize
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isSafeInteger(offset)) {
    badRequest('Use uma página positiva e de 1 a 100 registros por página.')
  }
  const clauses = []
  const params = []
  if (query.action) {
    if (!['update', 'delete', 'recalculate'].includes(query.action)) badRequest('Ação inválida.')
    clauses.push('action = ?')
    params.push(query.action)
  }
  const dates = {}
  for (const field of ['from', 'to']) {
    if (!query[field]) continue
    if (typeof query[field] !== 'string' || !Number.isFinite(Date.parse(query[field]))) badRequest('Período inválido.')
    dates[field] = new Date(query[field]).toISOString()
    clauses.push(`created_at ${field === 'from' ? '>=' : '<'} ?`)
    params.push(dates[field])
  }
  if (dates.from && dates.to && dates.from >= dates.to) badRequest('A data inicial deve ser anterior ao fim do período.')
  if (query.q) {
    if (typeof query.q !== 'string' || query.q.length > 200) badRequest('Busca inválida. Use até 200 caracteres.')
    clauses.push(`instr(audit_text(COALESCE(json_extract(before_json, '$.item_name'), '') || ' ' ||
      COALESCE(json_extract(before_json, '$.item_id'), '') || ' ' ||
      COALESCE(json_extract(before_json, '$.doc_ref'), '') || ' ' || operator_name || ' ' || reason), ?) > 0`)
    params.push(normalizeAuditSearch(query.q.trim()))
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''
  const rows = db.prepare(`SELECT * FROM movement_audit${where} ORDER BY sequence DESC LIMIT ? OFFSET ?`)
    .all(...params, paginated ? pageSize : 200, paginated ? offset : 0)
  const total = paginated ? db.prepare(`SELECT count(*) AS total FROM movement_audit${where}`).get(...params).total : rows.length
  return { rows, total, page, pageSize, paginated }
}
