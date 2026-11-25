export function auditMovement(db, before, after, user, reason = '', action = 'update') {
  db.prepare(`INSERT INTO movement_audit (movement_id,action,before_json,after_json,reason,operator_id,operator_name)
    VALUES (?,?,?,?,?,?,?)`).run(before.id, action, JSON.stringify(before), after ? JSON.stringify(after) : null,
    String(reason || '').slice(0, 2000), user?.id || '', user?.name || '')
}

// Caller updates current stock and invokes this within the same transaction.
export function reconcileMovementBalances(db, variationId, user, reason) {
  const stock = db.prepare('SELECT stock FROM variations WHERE id=?').get(variationId)?.stock
  if (stock === undefined) return
  const movements = db.prepare('SELECT * FROM movements WHERE variation_id=? AND affects_stock=1 ORDER BY date, rowid').all(variationId)
  const delta = m => m.type === 'entrada' ? m.qty : -m.qty
  let balance = stock - movements.reduce((sum, m) => sum + delta(m), 0)
  for (const movement of movements) {
    const after = balance + delta(movement)
    if (movement.stock_before !== balance || movement.stock_after !== after) {
      db.prepare('UPDATE movements SET stock_before=?,stock_after=?,revision=revision+1 WHERE id=?').run(balance, after, movement.id)
      auditMovement(db, movement, db.prepare('SELECT * FROM movements WHERE id=?').get(movement.id), user, reason, 'recalculate')
    }
    balance = after
  }
}
