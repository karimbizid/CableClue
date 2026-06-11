'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const VERSION = require('./package.json').version;

app.get('/api/version', (req, res) => res.json({ version: VERSION }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Build the full nested representation of a rack: devices (each with their
// ports) and the rack-level VLAN list. This is what a tab loads.
function getRackFull(rackId) {
  const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(rackId);
  if (!rack) return null;

  const vlans = db
    .prepare('SELECT * FROM vlans WHERE rack_id = ? ORDER BY tag')
    .all(rackId);

  const devices = db
    .prepare('SELECT * FROM devices WHERE rack_id = ? ORDER BY position_u')
    .all(rackId);

  const portsByDevice = db.prepare(
    'SELECT * FROM ports WHERE device_id = ? ORDER BY port_nr'
  );
  for (const d of devices) {
    d.ports = portsByDevice.all(d.id);
  }

  const cables = db.prepare('SELECT * FROM cables WHERE rack_id = ?').all(rackId);

  return { ...rack, vlans, devices, cables };
}

function asInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Racks
// ---------------------------------------------------------------------------

app.get('/api/racks', (req, res) => {
  const racks = db
    .prepare('SELECT * FROM racks ORDER BY position, id')
    .all();
  res.json(racks);
});

app.get('/api/racks/:id', (req, res) => {
  const rack = getRackFull(asInt(req.params.id));
  if (!rack) return res.status(404).json({ error: 'rack not found' });
  res.json(rack);
});

app.post('/api/racks', (req, res) => {
  const name = (req.body.name || 'New rack').toString().trim() || 'New rack';
  const height_u = asInt(req.body.height_u, 42);
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM racks').get().m;
  const info = db
    .prepare('INSERT INTO racks (name, height_u, position) VALUES (?, ?, ?)')
    .run(name, height_u, maxPos + 1);
  res.status(201).json(getRackFull(info.lastInsertRowid));
});

app.put('/api/racks/:id', (req, res) => {
  const id = asInt(req.params.id);
  const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(id);
  if (!rack) return res.status(404).json({ error: 'rack not found' });
  const name = req.body.name !== undefined ? req.body.name.toString() : rack.name;
  const height_u = req.body.height_u !== undefined ? asInt(req.body.height_u, rack.height_u) : rack.height_u;
  const position = req.body.position !== undefined ? asInt(req.body.position, rack.position) : rack.position;
  db.prepare('UPDATE racks SET name = ?, height_u = ?, position = ? WHERE id = ?')
    .run(name, height_u, position, id);
  res.json(getRackFull(id));
});

app.delete('/api/racks/:id', (req, res) => {
  db.prepare('DELETE FROM racks WHERE id = ?').run(asInt(req.params.id));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// VLANs (scoped to a rack)
// ---------------------------------------------------------------------------

app.post('/api/racks/:id/vlans', (req, res) => {
  const rackId = asInt(req.params.id);
  const rack = db.prepare('SELECT id FROM racks WHERE id = ?').get(rackId);
  if (!rack) return res.status(404).json({ error: 'rack not found' });
  const tag = asInt(req.body.tag, 1);
  const name = (req.body.name || '').toString();
  const color = (req.body.color || '#3b82f6').toString();
  const info = db
    .prepare('INSERT INTO vlans (rack_id, tag, name, color) VALUES (?, ?, ?, ?)')
    .run(rackId, tag, name, color);
  res.status(201).json(db.prepare('SELECT * FROM vlans WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/vlans/:id', (req, res) => {
  const id = asInt(req.params.id);
  const vlan = db.prepare('SELECT * FROM vlans WHERE id = ?').get(id);
  if (!vlan) return res.status(404).json({ error: 'vlan not found' });
  const tag = req.body.tag !== undefined ? asInt(req.body.tag, vlan.tag) : vlan.tag;
  const name = req.body.name !== undefined ? req.body.name.toString() : vlan.name;
  const color = req.body.color !== undefined ? req.body.color.toString() : vlan.color;
  db.prepare('UPDATE vlans SET tag = ?, name = ?, color = ? WHERE id = ?').run(tag, name, color, id);
  res.json(db.prepare('SELECT * FROM vlans WHERE id = ?').get(id));
});

app.delete('/api/vlans/:id', (req, res) => {
  db.prepare('DELETE FROM vlans WHERE id = ?').run(asInt(req.params.id));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

const createDevice = db.transaction((rackId, body) => {
  const type = (body.type || 'switch').toString();
  const port_count = asInt(body.port_count, 0);
  const size_u = Math.max(1, asInt(body.size_u, 1));
  const position_u = asInt(body.position_u, 1);
  const name = (body.name || '').toString();

  const info = db
    .prepare(
      `INSERT INTO devices (rack_id, type, port_count, size_u, position_u, name)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(rackId, type, port_count, size_u, position_u, name);

  const deviceId = info.lastInsertRowid;
  if (port_count > 0) {
    const insPort = db.prepare('INSERT INTO ports (device_id, port_nr) VALUES (?, ?)');
    for (let i = 1; i <= port_count; i++) insPort.run(deviceId, i);
  }
  return deviceId;
});

app.post('/api/racks/:id/devices', (req, res) => {
  const rackId = asInt(req.params.id);
  const rack = db.prepare('SELECT id FROM racks WHERE id = ?').get(rackId);
  if (!rack) return res.status(404).json({ error: 'rack not found' });
  const deviceId = createDevice(rackId, req.body);
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
  device.ports = db.prepare('SELECT * FROM ports WHERE device_id = ? ORDER BY port_nr').all(deviceId);
  res.status(201).json(device);
});

app.put('/api/devices/:id', (req, res) => {
  const id = asInt(req.params.id);
  const d = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  if (!d) return res.status(404).json({ error: 'device not found' });

  const fields = ['name', 'manufacturer', 'model', 'mgmt_ip', 'notes'];
  const next = {};
  for (const f of fields) next[f] = req.body[f] !== undefined ? req.body[f].toString() : d[f];
  const position_u = req.body.position_u !== undefined ? asInt(req.body.position_u, d.position_u) : d.position_u;

  db.prepare(
    `UPDATE devices SET name = ?, manufacturer = ?, model = ?, mgmt_ip = ?, notes = ?, position_u = ?
     WHERE id = ?`
  ).run(next.name, next.manufacturer, next.model, next.mgmt_ip, next.notes, position_u, id);

  const updated = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  updated.ports = db.prepare('SELECT * FROM ports WHERE device_id = ? ORDER BY port_nr').all(id);
  res.json(updated);
});

app.delete('/api/devices/:id', (req, res) => {
  db.prepare('DELETE FROM devices WHERE id = ?').run(asInt(req.params.id));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

app.put('/api/ports/:id', (req, res) => {
  const id = asInt(req.params.id);
  const p = db.prepare('SELECT * FROM ports WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'port not found' });

  const vlan_id = req.body.vlan_id !== undefined
    ? (req.body.vlan_id === null || req.body.vlan_id === '' ? null : asInt(req.body.vlan_id, null))
    : p.vlan_id;
  const ip = req.body.ip !== undefined ? req.body.ip.toString() : p.ip;
  const client = req.body.client !== undefined ? req.body.client.toString() : p.client;
  const label = req.body.label !== undefined ? req.body.label.toString() : p.label;

  db.prepare('UPDATE ports SET vlan_id = ?, ip = ?, client = ?, label = ? WHERE id = ?')
    .run(vlan_id, ip, client, label, id);
  res.json(db.prepare('SELECT * FROM ports WHERE id = ?').get(id));
});

// ---------------------------------------------------------------------------
// Cables (switch-to-switch links, scoped to a rack)
// ---------------------------------------------------------------------------

app.post('/api/racks/:id/cables', (req, res) => {
  const rackId = asInt(req.params.id);
  const rack = db.prepare('SELECT id FROM racks WHERE id = ?').get(rackId);
  if (!rack) return res.status(404).json({ error: 'rack not found' });
  const a = asInt(req.body.a_port_id, NaN);
  const b = asInt(req.body.b_port_id, NaN);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
    return res.status(400).json({ error: 'two distinct ports required' });
  }
  const color = (req.body.color || '#e3b341').toString();
  const label = (req.body.label || '').toString();
  const info = db
    .prepare('INSERT INTO cables (rack_id, a_port_id, b_port_id, color, label) VALUES (?, ?, ?, ?, ?)')
    .run(rackId, a, b, color, label);
  res.status(201).json(db.prepare('SELECT * FROM cables WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/cables/:id', (req, res) => {
  const id = asInt(req.params.id);
  const c = db.prepare('SELECT * FROM cables WHERE id = ?').get(id);
  if (!c) return res.status(404).json({ error: 'cable not found' });
  const color = req.body.color !== undefined ? req.body.color.toString() : c.color;
  const label = req.body.label !== undefined ? req.body.label.toString() : c.label;
  db.prepare('UPDATE cables SET color = ?, label = ? WHERE id = ?').run(color, label, id);
  res.json(db.prepare('SELECT * FROM cables WHERE id = ?').get(id));
});

app.delete('/api/cables/:id', (req, res) => {
  db.prepare('DELETE FROM cables WHERE id = ?').run(asInt(req.params.id));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Static frontend (Vite build output)
// ---------------------------------------------------------------------------

const clientDist = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`CableClue listening on http://localhost:${PORT}`);
});
