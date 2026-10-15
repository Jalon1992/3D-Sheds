// SQLite storage using Node's built-in node:sqlite (no native build step needed).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || './data/shedbuilder.db';
mkdirSync(dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS styles (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, image_url TEXT,
  roof_type TEXT DEFAULT 'gable',            -- gable | barn | lean_to | saltbox
  ridge_axis TEXT DEFAULT 'depth',           -- depth: gable end faces front; width: eave faces front
  wall_height REAL DEFAULT 7, roof_pitch REAL DEFAULT 6, overhang REAL DEFAULT 0.75,
  siding_type TEXT DEFAULT 'lap',            -- lap | board_batten | t111 | metal
  roof_material TEXT DEFAULT 'shingle',      -- default/included roofing: shingle | metal
  roof_choices TEXT DEFAULT '["shingle","metal"]', -- roofing materials customers may pick
  gable_overhang REAL,                       -- rake overhang at gable ends (null = same as eave)
  standard_options TEXT DEFAULT '[]',        -- JSON [{option_id, wall, offset}]
  default_colors TEXT DEFAULT '{}',          -- JSON {siding, trim, roof, door}
  active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS sizes (
  id INTEGER PRIMARY KEY, style_id INTEGER NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
  width REAL NOT NULL, depth REAL NOT NULL, price REAL NOT NULL DEFAULT 0,
  active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS colors (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, hex TEXT NOT NULL,
  category TEXT NOT NULL,                    -- siding | trim | roof | door
  material TEXT,                             -- roof colors only: shingle | metal | null (both)
  price REAL DEFAULT 0, active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  category TEXT NOT NULL,                    -- doors | windows | interior | electrical | exterior | upgrades
  kind TEXT,                                 -- built-in 3D model type (see README)
  placement TEXT DEFAULT 'opening',          -- opening | wall_interior | wall_exterior | floor | ceiling | loft | ground | roof | none
  swap_group TEXT,                           -- options in the same group can be swapped for each other
  width REAL DEFAULT 3, height REAL DEFAULT 6.5, depth REAL DEFAULT 0.3, elevation REAL DEFAULT 0,
  price REAL DEFAULT 0,
  price_unit TEXT DEFAULT 'each',            -- each | per_ft_width | per_ft_depth | per_sqft | per_ft_perimeter
  model_url TEXT, image_url TEXT, plan_label TEXT,
  max_qty INTEGER DEFAULT 10,
  active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY, number TEXT UNIQUE, token TEXT UNIQUE, status TEXT DEFAULT 'new',
  first_name TEXT, last_name TEXT, email TEXT, phone TEXT,
  address TEXT, city TEXT, state TEXT, zip TEXT, notes TEXT, sms_consent INTEGER DEFAULT 0,
  source TEXT, utm TEXT,
  config TEXT NOT NULL, pricing TEXT NOT NULL, total REAL,
  style_name TEXT, size_label TEXT,
  ghl_contact_id TEXT, ghl_opportunity_id TEXT, ghl_status TEXT,
  internal_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY, name TEXT, url TEXT NOT NULL,
  events TEXT DEFAULT '["quote.created"]', secret TEXT, headers TEXT DEFAULT '{}',
  active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS webhook_log (
  id INTEGER PRIMARY KEY, webhook_id INTEGER, target TEXT, event TEXT, status INTEGER,
  ok INTEGER, attempt INTEGER, response TEXT, created_at TEXT DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY, name TEXT, prefix TEXT, key_hash TEXT UNIQUE,
  scopes TEXT DEFAULT 'full', last_used TEXT, created_at TEXT DEFAULT (datetime('now')));
`);

// ---- Migrations for databases created by earlier versions (safe to re-run)
for (const sql of [
  'ALTER TABLE styles ADD COLUMN gable_overhang REAL',
  `ALTER TABLE styles ADD COLUMN roof_choices TEXT DEFAULT '["shingle","metal"]'`,
  'ALTER TABLE colors ADD COLUMN material TEXT',
]) { try { db.exec(sql); } catch { /* column already exists */ } }

// ---- JSON column helpers -----------------------------------------------------
export const JSON_COLS = new Set(['standard_options', 'default_colors', 'roof_choices', 'roofing', 'events', 'headers', 'config', 'pricing', 'utm']);

export function parseRow(row) {
  if (!row) return row;
  const r = { ...row };
  for (const k of Object.keys(r)) if (JSON_COLS.has(k) && typeof r[k] === 'string') {
    try { r[k] = JSON.parse(r[k]); } catch { /* leave as string */ }
  }
  return r;
}
export const all = (sql, ...p) => db.prepare(sql).all(...p).map(parseRow);
export const get = (sql, ...p) => parseRow(db.prepare(sql).get(...p));
export const run = (sql, ...p) => db.prepare(sql).run(...p);

// ---- Settings ---------------------------------------------------------------
export function getSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}
export function setSettings(obj) {
  const st = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(obj)) st.run(k, JSON.stringify(v));
}

// Settings that are safe to expose to the public configurator
export const PUBLIC_SETTINGS = ['company_name', 'logo_url', 'brand_color', 'currency_symbol', 'tax_rate', 'tax_delivery',
  'delivery_fee', 'show_prices', 'success_message', 'consent_text', 'phone', 'website', 'privacy_url', 'require_phone',
  'headline', 'thank_you_url', 'roofing', 'downgrade_credit', 'remove_credit'];

// ---- Catalog (what the configurator needs) ----------------------------------
export function getCatalog({ includeInactive = false } = {}) {
  const act = includeInactive ? '' : 'WHERE active = 1';
  const styles = all(`SELECT * FROM styles ${act} ORDER BY sort, id`);
  const sizes = all(`SELECT * FROM sizes ${act} ORDER BY sort, width, depth`);
  for (const s of styles) s.sizes = sizes.filter(z => z.style_id === s.id);
  const colors = all(`SELECT * FROM colors ${act} ORDER BY category, sort, id`);
  const options = all(`SELECT * FROM options ${act} ORDER BY category, sort, id`);
  const all_settings = getSettings();
  const settings = Object.fromEntries(PUBLIC_SETTINGS.map(k => [k, all_settings[k]]));
  return { styles: styles.filter(s => includeInactive || s.sizes.length), colors, options, settings };
}
