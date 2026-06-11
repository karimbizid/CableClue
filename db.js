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

db.exec(`
  CREATE TABLE IF NOT EXISTS racks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    height_u   INTEGER NOT NULL DEFAULT 42,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vlans (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    rack_id INTEGER NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
    tag     INTEGER NOT NULL,
    name    TEXT    NOT NULL DEFAULT '',
    color   TEXT    NOT NULL DEFAULT '#3b82f6'
  );

  CREATE TABLE IF NOT EXISTS devices (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    rack_id      INTEGER NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
    type         TEXT    NOT NULL,             -- 'switch' | 'patch' | 'blank'
    port_count   INTEGER NOT NULL DEFAULT 0,
    size_u       INTEGER NOT NULL DEFAULT 1,
    position_u   INTEGER NOT NULL,             -- top U-slot the device occupies
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
    client    TEXT    NOT NULL DEFAULT '',
    label     TEXT    NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_devices_rack ON devices(rack_id);
  CREATE INDEX IF NOT EXISTS idx_ports_device ON ports(device_id);
  CREATE INDEX IF NOT EXISTS idx_vlans_rack   ON vlans(rack_id);
`);

module.exports = db;
