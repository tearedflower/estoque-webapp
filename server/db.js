import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createBackup } from './backup.js'
import { argValue, loadEnvFile, resolveEnvPath } from './env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const ENV_FILE = loadEnvFile(argValue('env', '.env'))

export const DB_PATH = process.env.DB_PATH
  ? resolveEnvPath(process.env.DB_PATH)
  : join(__dirname, 'estoque.db')

mkdirSync(dirname(DB_PATH), { recursive: true })

const CURRENT_SCHEMA_VERSION = 9
const databaseExisted = existsSync(DB_PATH)
const db = new Database(DB_PATH)
const previousSchemaVersion = db.pragma('user_version', { simple: true })

if (databaseExisted && previousSchemaVersion < CURRENT_SCHEMA_VERSION) {
  await createBackup(db)
}

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ===== Schema =====
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    username TEXT DEFAULT '',
    role TEXT NOT NULL CHECK(role IN ('admin','operador','visitante')),
    pin_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+30 days'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_name TEXT NOT NULL,
    category TEXT,
    subcategory TEXT,
    unit TEXT NOT NULL DEFAULT 'UN',
    min_stock REAL NOT NULL DEFAULT 0,
    min_stock_defined INTEGER NOT NULL DEFAULT 0,
    attributes TEXT NOT NULL DEFAULT '[]',
    location TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS variations (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    vals TEXT NOT NULL DEFAULT '{}',
    stock REAL NOT NULL DEFAULT 0,
    min_stock REAL NOT NULL DEFAULT 0,
    min_stock_defined INTEGER NOT NULL DEFAULT 0,
    initial_stock REAL NOT NULL DEFAULT 0,
    extras TEXT NOT NULL DEFAULT '{}',
    location TEXT DEFAULT '',
    locations TEXT NOT NULL DEFAULT '[]',
    destinations TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS movements (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('entrada','saida')),
    variation_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_name TEXT,
    item_group TEXT,
    item_category TEXT,
    item_subcategory TEXT,
    item_unit TEXT,
    variation_values TEXT DEFAULT '{}',
    variation_extras TEXT DEFAULT '{}',
    qty REAL NOT NULL,
    stock_before REAL NOT NULL DEFAULT 0,
    stock_after REAL NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    supplier TEXT DEFAULT '',
    unit_cost REAL DEFAULT NULL,
    requested_by TEXT DEFAULT '',
    requested_by_person_id TEXT DEFAULT '',
    destination TEXT DEFAULT '',
    doc_ref TEXT DEFAULT '',
    note TEXT DEFAULT '',
    operator_id TEXT DEFAULT '',
    operator_name TEXT DEFAULT '',
    affects_stock INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS stock_confirmations (
    variation_id TEXT PRIMARY KEY REFERENCES variations(id) ON DELETE CASCADE,
    previous_stock REAL NOT NULL,
    counted_stock REAL NOT NULL CHECK(counted_stock >= 0),
    confirmed_at TEXT NOT NULL,
    operator_id TEXT NOT NULL,
    operator_name TEXT NOT NULL,
    movement_id TEXT
  );

  CREATE TABLE IF NOT EXISTS movement_audit (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    movement_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('update', 'delete', 'recalculate')),
    before_json TEXT NOT NULL,
    after_json TEXT,
    reason TEXT NOT NULL DEFAULT '',
    operator_id TEXT NOT NULL DEFAULT '',
    operator_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_movement_audit_id ON movement_audit(movement_id, sequence);
  CREATE INDEX IF NOT EXISTS idx_movements_date ON movements(date DESC, id);
  CREATE INDEX IF NOT EXISTS idx_movements_variation_date ON movements(variation_id, date, id);
  CREATE TABLE IF NOT EXISTS mutation_requests (
    user_id TEXT NOT NULL,
    route TEXT NOT NULL,
    request_key TEXT NOT NULL,
    payload_sha256 TEXT NOT NULL,
    response_json TEXT NOT NULL,
    status INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, route, request_key)
  );

  CREATE TABLE IF NOT EXISTS movement_batch_requests (
    request_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS movement_import_mappings (
    name_key TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    variation_id TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS photo_batches (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('pending','completed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT DEFAULT '',
    expires_at TEXT DEFAULT '',
    data_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_photo_batches_owner_updated
    ON photo_batches(owner_user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS photo_batch_photos (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES photo_batches(id) ON DELETE CASCADE,
    image_path TEXT DEFAULT '',
    mime_type TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    data_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_photo_batch_photos_batch_created
    ON photo_batch_photos(batch_id, created_at);

  CREATE TABLE IF NOT EXISTS variation_photos (
    variation_id TEXT PRIMARY KEY,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    image_data BLOB NOT NULL,
    updated_at TEXT NOT NULL,
    source_batch_id TEXT DEFAULT '',
    source_photo_id TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    parent_id TEXT REFERENCES locations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS destinations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    parent_id TEXT REFERENCES destinations(id) ON DELETE CASCADE,
    material_rules TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    role_text TEXT DEFAULT '',
    registration TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo','inativo','demitido','afastado'))
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS epi_role_rules (
    id TEXT PRIMARY KEY,
    role_name TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('grupo','categoria','subcategoria','item','variacao')),
    target_key TEXT NOT NULL,
    target_label TEXT DEFAULT '',
    days INTEGER NOT NULL DEFAULT 30,
    quantity INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS epi_periodicities (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL CHECK(target_type IN ('grupo','categoria','subcategoria','item','variacao')),
    target_key TEXT NOT NULL,
    target_label TEXT DEFAULT '',
    days INTEGER NOT NULL DEFAULT 30,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS work_orders (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    motor_id TEXT DEFAULT '',
    destination_id TEXT DEFAULT '',
    destination_name TEXT DEFAULT '',
    equipment TEXT DEFAULT '',
    motor_origin_destination_id TEXT DEFAULT '',
    motor_origin_destination_name TEXT DEFAULT '',
    maintenance_location_type TEXT DEFAULT '',
    maintenance_destination_id TEXT DEFAULT '',
    maintenance_destination_name TEXT DEFAULT '',
    maintenance_external_location TEXT DEFAULT '',
    maintenance_external_order_number TEXT DEFAULT '',
    service_type TEXT DEFAULT 'Outros',
    request_date TEXT DEFAULT '',
    request_time TEXT DEFAULT '',
    requested_by TEXT DEFAULT '',
    note TEXT DEFAULT '',
    maintenance_start_date TEXT DEFAULT '',
    maintenance_start_time TEXT DEFAULT '',
    maintenance_end_date TEXT DEFAULT '',
    maintenance_end_time TEXT DEFAULT '',
    maintenance_professional TEXT DEFAULT '',
    maintenance_materials TEXT DEFAULT '',
    maintenance_note TEXT DEFAULT '',
    motor_status_after_maintenance TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS work_order_items (
    id TEXT PRIMARY KEY,
    work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    variation_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_name TEXT DEFAULT '',
    item_group TEXT DEFAULT '',
    item_category TEXT DEFAULT '',
    item_unit TEXT DEFAULT '',
    variation_values TEXT DEFAULT '{}',
    qty REAL NOT NULL,
    movement_id TEXT DEFAULT '',
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS work_order_events (
    id TEXT PRIMARY KEY,
    work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_date TEXT NOT NULL,
    operator_id TEXT DEFAULT '',
    operator_name TEXT DEFAULT '',
    from_value TEXT DEFAULT '',
    to_value TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS motors (
    id TEXT PRIMARY KEY,
    tag TEXT NOT NULL UNIQUE,
    serial TEXT DEFAULT '',
    name TEXT DEFAULT '',
    manufacturer TEXT DEFAULT '',
    power TEXT DEFAULT '',
    power_unit TEXT DEFAULT 'CV',
    voltage TEXT DEFAULT '',
    rpm TEXT DEFAULT '',
    amperage TEXT DEFAULT '',
    destination_id TEXT DEFAULT '',
    destination_name TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo','em_manutencao','reserva','inativo')),
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS motor_events (
    id TEXT PRIMARY KEY,
    motor_id TEXT NOT NULL REFERENCES motors(id) ON DELETE CASCADE,
    work_order_id TEXT DEFAULT '',
    event_type TEXT NOT NULL CHECK(event_type IN ('rebobinado','reformado','revisado','enrolado','enrolar','instalado','removido','movimentado','inativado','reativado','observacao')),
    event_date TEXT NOT NULL,
    from_destination TEXT DEFAULT '',
    to_destination TEXT DEFAULT '',
    performed_by TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS motor_materials (
    id TEXT PRIMARY KEY,
    motor_id TEXT NOT NULL REFERENCES motors(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    variation_id TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(motor_id, variation_id)
  );

  CREATE TABLE IF NOT EXISTS monthly_closings (
    id TEXT PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
    closed_at TEXT NOT NULL,
    closed_by_id TEXT DEFAULT '',
    closed_by_name TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    data TEXT NOT NULL DEFAULT '{}',
    UNIQUE(year, month)
  );

  CREATE TABLE IF NOT EXISTS display_order (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    data TEXT NOT NULL DEFAULT '{}'
  );
`)

const migrateSchema = db.transaction(() => {
// Ensure display_order row exists
db.prepare(`INSERT OR IGNORE INTO display_order (id, data) VALUES (1, '{}')`).run()

// Migration: add operator columns to movements if missing
const movCols = db.prepare("PRAGMA table_info(movements)").all().map(c => c.name)
if (!movCols.includes('revision')) {
  db.prepare('ALTER TABLE movements ADD COLUMN revision INTEGER NOT NULL DEFAULT 0').run()
}
if (!movCols.includes('operator_id')) {
  db.prepare("ALTER TABLE movements ADD COLUMN operator_id TEXT DEFAULT ''").run()
  db.prepare("ALTER TABLE movements ADD COLUMN operator_name TEXT DEFAULT ''").run()
}
if (!movCols.includes('unit_cost')) {
  db.prepare("ALTER TABLE movements ADD COLUMN unit_cost REAL DEFAULT NULL").run()
}
if (!movCols.includes('requested_by_person_id')) {
  db.prepare("ALTER TABLE movements ADD COLUMN requested_by_person_id TEXT DEFAULT ''").run()
}
if (!movCols.includes('affects_stock')) {
  db.prepare('ALTER TABLE movements ADD COLUMN affects_stock INTEGER NOT NULL DEFAULT 1').run()
}
const variationCols = db.prepare("PRAGMA table_info(variations)").all().map(c => c.name)
if (!variationCols.includes('min_stock_defined')) {
  db.prepare('ALTER TABLE variations ADD COLUMN min_stock_defined INTEGER NOT NULL DEFAULT 0').run()
  db.prepare('UPDATE variations SET min_stock_defined = 1 WHERE min_stock > 0').run()
}
if (!variationCols.includes('locations')) {
  db.prepare("ALTER TABLE variations ADD COLUMN locations TEXT NOT NULL DEFAULT '[]'").run()
  const legacyLocations = db.prepare("SELECT id, location FROM variations WHERE COALESCE(location, '') <> ''").all()
  const migrateLocation = db.prepare('UPDATE variations SET locations = ? WHERE id = ?')
  db.transaction(() => {
    for (const variation of legacyLocations) migrateLocation.run(JSON.stringify([variation.location]), variation.id)
  })()
}
if (!variationCols.includes('active')) {
  db.prepare("ALTER TABLE variations ADD COLUMN active INTEGER NOT NULL DEFAULT 1").run()
}

const itemCols = db.prepare("PRAGMA table_info(items)").all().map(c => c.name)
if (!itemCols.includes('min_stock_defined')) {
  db.prepare('ALTER TABLE items ADD COLUMN min_stock_defined INTEGER NOT NULL DEFAULT 0').run()
  db.prepare('UPDATE items SET min_stock_defined = 1 WHERE min_stock > 0').run()
}
if (!itemCols.includes('active')) {
  db.prepare("ALTER TABLE items ADD COLUMN active INTEGER NOT NULL DEFAULT 1").run()
}

const destinationCols = db.prepare("PRAGMA table_info(destinations)").all().map(c => c.name)
if (!destinationCols.includes('material_rules')) {
  db.prepare("ALTER TABLE destinations ADD COLUMN material_rules TEXT NOT NULL DEFAULT '[]'").run()
}

const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name)
if (!userCols.includes('username')) {
  db.prepare("ALTER TABLE users ADD COLUMN username TEXT DEFAULT ''").run()
}
if (!userCols.includes('must_change_password')) {
  db.prepare('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0').run()
}
db.prepare("UPDATE users SET username = name WHERE COALESCE(username, '') = ''").run()
db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username <> ''").run()

const peopleCols = db.prepare("PRAGMA table_info(people)").all().map(c => c.name)
if (!peopleCols.includes('status')) {
  db.prepare("ALTER TABLE people ADD COLUMN status TEXT NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo','inativo','demitido','afastado'))").run()
  db.prepare("UPDATE people SET status = CASE WHEN active = 1 THEN 'ativo' ELSE 'inativo' END").run()
}
if (!peopleCols.includes('registration')) {
  db.prepare("ALTER TABLE people ADD COLUMN registration TEXT DEFAULT ''").run()
}

const epiRoleRuleCols = db.prepare("PRAGMA table_info(epi_role_rules)").all().map(c => c.name)
if (!epiRoleRuleCols.includes('days')) {
  db.prepare("ALTER TABLE epi_role_rules ADD COLUMN days INTEGER NOT NULL DEFAULT 30").run()
}
if (!epiRoleRuleCols.includes('quantity')) {
  db.prepare("ALTER TABLE epi_role_rules ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1").run()
}
if (!epiRoleRuleCols.includes('usage_reason')) {
  db.prepare("ALTER TABLE epi_role_rules ADD COLUMN usage_reason TEXT NOT NULL DEFAULT ''").run()
}

// Migration: add detailed OS fields if missing
const workOrderCols = db.prepare("PRAGMA table_info(work_orders)").all().map(c => c.name)
const workOrderMigrations = [
  ['motor_id', "ALTER TABLE work_orders ADD COLUMN motor_id TEXT DEFAULT ''"],
  ['equipment', "ALTER TABLE work_orders ADD COLUMN equipment TEXT DEFAULT ''"],
  ['motor_origin_destination_id', "ALTER TABLE work_orders ADD COLUMN motor_origin_destination_id TEXT DEFAULT ''"],
  ['motor_origin_destination_name', "ALTER TABLE work_orders ADD COLUMN motor_origin_destination_name TEXT DEFAULT ''"],
  ['maintenance_location_type', "ALTER TABLE work_orders ADD COLUMN maintenance_location_type TEXT DEFAULT ''"],
  ['maintenance_destination_id', "ALTER TABLE work_orders ADD COLUMN maintenance_destination_id TEXT DEFAULT ''"],
  ['maintenance_destination_name', "ALTER TABLE work_orders ADD COLUMN maintenance_destination_name TEXT DEFAULT ''"],
  ['maintenance_external_location', "ALTER TABLE work_orders ADD COLUMN maintenance_external_location TEXT DEFAULT ''"],
  ['maintenance_external_order_number', "ALTER TABLE work_orders ADD COLUMN maintenance_external_order_number TEXT DEFAULT ''"],
  ['service_type', "ALTER TABLE work_orders ADD COLUMN service_type TEXT DEFAULT 'Outros'"],
  ['request_date', "ALTER TABLE work_orders ADD COLUMN request_date TEXT DEFAULT ''"],
  ['request_time', "ALTER TABLE work_orders ADD COLUMN request_time TEXT DEFAULT ''"],
  ['maintenance_start_date', "ALTER TABLE work_orders ADD COLUMN maintenance_start_date TEXT DEFAULT ''"],
  ['maintenance_start_time', "ALTER TABLE work_orders ADD COLUMN maintenance_start_time TEXT DEFAULT ''"],
  ['maintenance_end_date', "ALTER TABLE work_orders ADD COLUMN maintenance_end_date TEXT DEFAULT ''"],
  ['maintenance_end_time', "ALTER TABLE work_orders ADD COLUMN maintenance_end_time TEXT DEFAULT ''"],
  ['maintenance_professional', "ALTER TABLE work_orders ADD COLUMN maintenance_professional TEXT DEFAULT ''"],
  ['maintenance_materials', "ALTER TABLE work_orders ADD COLUMN maintenance_materials TEXT DEFAULT ''"],
  ['maintenance_note', "ALTER TABLE work_orders ADD COLUMN maintenance_note TEXT DEFAULT ''"],
  ['motor_status_after_maintenance', "ALTER TABLE work_orders ADD COLUMN motor_status_after_maintenance TEXT DEFAULT ''"],
]

for (const [col, sql] of workOrderMigrations) {
  if (!workOrderCols.includes(col)) db.prepare(sql).run()
}

const motorCols = db.prepare("PRAGMA table_info(motors)").all().map(c => c.name)
const motorMigrations = [
  ['power_unit', "ALTER TABLE motors ADD COLUMN power_unit TEXT DEFAULT 'CV'"],
  ['amperage', "ALTER TABLE motors ADD COLUMN amperage TEXT DEFAULT ''"],
]
for (const [col, sql] of motorMigrations) {
  if (!motorCols.includes(col)) db.prepare(sql).run()
}

// Migration: widen motor event CHECK constraint for Enrolado.
const motorEventsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'motor_events'").get()?.sql || ''
if (motorEventsSchema && !motorEventsSchema.includes("'enrolado'")) {
  const migrateMotorEvents = db.transaction(() => {
    db.prepare(`
      CREATE TABLE motor_events_next (
        id TEXT PRIMARY KEY,
        motor_id TEXT NOT NULL REFERENCES motors(id) ON DELETE CASCADE,
        work_order_id TEXT DEFAULT '',
        event_type TEXT NOT NULL CHECK(event_type IN ('rebobinado','reformado','revisado','enrolado','enrolar','instalado','removido','movimentado','inativado','reativado','observacao')),
        event_date TEXT NOT NULL,
        from_destination TEXT DEFAULT '',
        to_destination TEXT DEFAULT '',
        performed_by TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run()
    db.prepare(`
      INSERT INTO motor_events_next (
        id, motor_id, work_order_id, event_type, event_date,
        from_destination, to_destination, performed_by, notes, created_at
      )
      SELECT
        id, motor_id, work_order_id, event_type, event_date,
        from_destination, to_destination, performed_by, notes, created_at
      FROM motor_events
    `).run()
    db.prepare('DROP TABLE motor_events').run()
    db.prepare('ALTER TABLE motor_events_next RENAME TO motor_events').run()
  })
  migrateMotorEvents()
}

db.prepare(`
  INSERT INTO work_order_events (id, work_order_id, event_type, event_date, notes, created_at)
  SELECT
    'woe_' || lower(hex(randomblob(6))),
    wo.id,
    'criada',
    COALESCE(NULLIF(wo.created_at, ''), datetime('now')),
    'Evento inicial criado automaticamente para OS existente.',
    datetime('now')
  FROM work_orders wo
  WHERE NOT EXISTS (
    SELECT 1 FROM work_order_events ev WHERE ev.work_order_id = wo.id
  )
`).run()

const sessionCols = db.prepare("PRAGMA table_info(sessions)").all().map(c => c.name)
if (!sessionCols.includes('expires_at')) {
  db.prepare("ALTER TABLE sessions ADD COLUMN expires_at TEXT NOT NULL DEFAULT ''").run()
}
db.prepare("UPDATE sessions SET expires_at = datetime(created_at, '+30 days') WHERE COALESCE(expires_at, '') = ''").run()
db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`)
})

if (previousSchemaVersion < CURRENT_SCHEMA_VERSION) migrateSchema()

// Seed default admin if no users exist
import bcryptjs from 'bcryptjs'
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c
if (userCount === 0) {
  const hash = bcryptjs.hashSync('admin123', 10)
  db.prepare('INSERT INTO users (id, name, username, role, pin_hash, must_change_password) VALUES (?, ?, ?, ?, ?, 1)').run('user_admin', 'admin', 'admin', 'admin', hash)
} else {
  const defaultAdmin = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get('user_admin')
  if (defaultAdmin && bcryptjs.compareSync('admin123', defaultAdmin.pin_hash)) {
    db.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run('user_admin')
  }
}

export default db
