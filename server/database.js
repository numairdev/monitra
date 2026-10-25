import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(dir, 'monitra.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  response_ms INTEGER,
  http_status INTEGER,
  checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  response_ms INTEGER,
  http_status INTEGER,
  error_message TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS checks_monitor_time_idx ON checks(monitor_id, checked_at);
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Investigating',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings(key, value) VALUES ('intervalMinutes', '5');
`);

export default db;

export function listMonitors() {
  return db.prepare(`
    SELECT m.id, m.name, m.url, m.status,
           m.response_ms AS response, m.http_status AS httpStatus,
           m.checked_at AS checkedAt,
           CASE WHEN COUNT(c.id) = 0 THEN NULL
                ELSE ROUND(100.0 * SUM(CASE WHEN c.status IN ('operational','degraded') THEN 1 ELSE 0 END) / COUNT(c.id), 2)
           END AS uptime,
           COUNT(c.id) AS checkCount
    FROM monitors m
    LEFT JOIN checks c ON c.monitor_id = m.id
    GROUP BY m.id
    ORDER BY m.id DESC
  `).all().map(m => ({...m, id: String(m.id), type: 'Website'}));
}

export function intervalMinutes() {
  return Number(db.prepare('SELECT value FROM settings WHERE key = ?').get('intervalMinutes')?.value ?? 5);
}
