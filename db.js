'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// The database lives on a writable volume in Docker. Default to ./data so it
// works the same way when running locally.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'cableclue.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Desired (current) schema. CREATE ... IF NOT EXISTS only runs on a fresh DB;
// existing databases are brought up to date by the migration block below.
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS racks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    height_u   INTEGER NOT NULL DEFAULT 42,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vlans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tag        INTEGER NOT NULL,
    name       TEXT    NOT NULL DEFAULT '',
    color      TEXT    NOT NULL DEFAULT '#3b82f6'
  );

  CREATE TABLE IF NOT EXISTS devices (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    rack_id      INTEGER NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
    type         TEXT    NOT NULL,
    port_count   INTEGER NOT NULL DEFAULT 0,
    size_u       INTEGER NOT NULL DEFAULT 1,
    position_u   INTEGER NOT NULL,
    name         TEXT    NOT NULL DEFAULT '',
    manufacturer TEXT    NOT NULL DEFAULT '',
    model        TEXT    NOT NULL DEFAULT '',
    mgmt_ip      TEXT    NOT NULL DEFAULT '',
    notes        TEXT    NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS ports (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    port_nr   INTEGER NOT NULL,
    vlan_id   INTEGER REFERENCES vlans(id) ON DELETE SET NULL,
    ip        TEXT    NOT NULL DEFAULT '',
    mac       TEXT    NOT NULL DEFAULT '',
    client    TEXT    NOT NULL DEFAULT '',
    label     TEXT    NOT NULL DEFAULT '',
    notes     TEXT    NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS cables (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    rack_id   INTEGER NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
    a_port_id INTEGER NOT NULL REFERENCES ports(id) ON DELETE CASCADE,
    b_port_id INTEGER NOT NULL REFERENCES ports(id) ON DELETE CASCADE,
    color     TEXT    NOT NULL DEFAULT '#e3b341',
    label     TEXT    NOT NULL DEFAULT ''
  );
`);

// --- Migrations for databases created before projects existed ---------------
function hasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}

// Part 1 (transaction-safe): racks need a project_id, backfilled to a default
// project for any pre-existing data.
db.transaction(() => {
  if (!hasColumn('racks', 'project_id')) {
    db.exec('ALTER TABLE racks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE');
  }
  const orphans = db.prepare('SELECT COUNT(*) AS c FROM racks WHERE project_id IS NULL').get().c;
  if (orphans > 0) {
    let p = db.prepare('SELECT id FROM projects ORDER BY id LIMIT 1').get();
    if (!p) {
      const info = db.prepare('INSERT INTO projects (name) VALUES (?)').run('My project');
      p = { id: info.lastInsertRowid };
    }
    db.prepare('UPDATE racks SET project_id = ? WHERE project_id IS NULL').run(p.id);
  }
})();

// Extra port columns added for the admin / IP list view.
if (!hasColumn('ports', 'mac')) db.exec("ALTER TABLE ports ADD COLUMN mac TEXT NOT NULL DEFAULT ''");
if (!hasColumn('ports', 'notes')) db.exec("ALTER TABLE ports ADD COLUMN notes TEXT NOT NULL DEFAULT ''");

// Part 2: move vlans from rack-scope to project-scope by rebuilding the table.
// This must run OUTSIDE a transaction so foreign_keys can be turned off —
// otherwise DROP TABLE vlans would cascade ON DELETE SET NULL onto ports and
// wipe every port's VLAN assignment. VLAN ids are preserved, so ports.vlan_id
// keeps pointing at the right rows.
if (hasColumn('vlans', 'rack_id') && !hasColumn('vlans', 'project_id')) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE vlans_new (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      tag        INTEGER NOT NULL,
      name       TEXT    NOT NULL DEFAULT '',
      color      TEXT    NOT NULL DEFAULT '#3b82f6'
    );
    INSERT INTO vlans_new (id, project_id, tag, name, color)
      SELECT v.id, r.project_id, v.tag, v.name, v.color
      FROM vlans v JOIN racks r ON v.rack_id = r.id;
    DROP TABLE vlans;
    ALTER TABLE vlans_new RENAME TO vlans;
  `);
  db.pragma('foreign_keys = ON');
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_racks_project  ON racks(project_id);
  CREATE INDEX IF NOT EXISTS idx_devices_rack   ON devices(rack_id);
  CREATE INDEX IF NOT EXISTS idx_ports_device   ON ports(device_id);
  CREATE INDEX IF NOT EXISTS idx_vlans_project  ON vlans(project_id);
  CREATE INDEX IF NOT EXISTS idx_cables_rack    ON cables(rack_id);
`);

// Guarantee there is always at least one project to land in.
const projectCount = db.prepare('SELECT COUNT(*) AS c FROM projects').get().c;
if (projectCount === 0) {
  db.prepare('INSERT INTO projects (name) VALUES (?)').run('My project');
}

module.exports = db;
