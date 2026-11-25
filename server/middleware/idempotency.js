import { createHash } from 'node:crypto'

// Only synchronous handlers: mutation and request record commit together.
export function idempotent(db, handler) {
  return (req, res, next) => {
    const key = req.get('idempotency-key') || req.body?.requestId
    if (!key) return handler(req, res, next)
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,160}$/.test(key)) return res.status(400).json({ error: 'Chave de repetição inválida.' })
    const route = req.baseUrl + req.path
    const hash = createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex')
    const userId = req.user.id
    const json = res.json
    let response
    try {
      db.transaction(() => {
        const stored = db.prepare('SELECT * FROM mutation_requests WHERE user_id=? AND route=? AND request_key=?').get(userId, route, key)
        if (stored) {
          if (stored.payload_sha256 !== hash) {
            res.status(409)
            response = { error: 'Esta chave já foi utilizada com dados diferentes.', code: 'IDEMPOTENCY_CONFLICT' }
          } else { res.status(stored.status); response = JSON.parse(stored.response_json) }
          return
        }
        res.json = data => { response = data; return res }
        const result = handler(req, res, next)
        if (result?.then) throw new Error('Idempotência exige um handler síncrono.')
        if (response === undefined) throw new Error('Operação não retornou JSON.')
        if (res.statusCode < 400) {
          db.prepare('INSERT INTO mutation_requests (user_id,route,request_key,payload_sha256,response_json,status) VALUES (?,?,?,?,?,?)')
            .run(userId, route, key, hash, JSON.stringify(response), res.statusCode)
        }
      }).immediate()
    } catch (error) { res.json = json; return next(error) }
    finally { res.json = json }
    return res.json(response)
  }
}
