'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '25mb' }));

const PORT = process.env.PORT || 8080;
const VERSION = require('./package.json').version;

app.get('/api/version', (req, res) => res.json({ version: VERSION }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Full nested representation of a rack: devices (with ports) plus the parent
// project's VLAN pool. This is what a rack tab loads.
function getRackFull(rackId) {
  const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(rackId);
  if (!rack) return null;

  const vlans = db
    .prepare('SELECT * FROM vlans WHERE project_id = ? ORDER BY tag')
    .all(rack.project_id);

  const devices = db
    .prepare('SELECT * FROM devices WHERE rack_id = ? ORDER BY position_u')
    .all(rackId);

  const portsByDevice = db.prepare('SELECT * FROM ports WHERE device_id = ? ORDER BY port_nr');
  for (const d of devices) d.ports = portsByDevice.all(d.id);

  const cables = db.prepare('SELECT * FROM cables WHERE rack_id = ?').all(rackId);

  return { ...rack, vlans, devices, cables };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

app.get('/api/projects', (req, res) => {
  res.json(db.prepare('SELECT * FROM projects ORDER BY position, id').all());
});

app.post('/api/projects', (req, res) => {
  const name = (req.body.name || 'New project').toString().trim() || 'New project';
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM projects').get().m;
  const info = db.prepare('INSERT INTO projects (name, position) VALUES (?, ?)').run(name, maxPos + 1);
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/projects/:id', (req, res) => {
  const id = asInt(req.params.id);
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  const name = req.body.name !== undefined ? req.body.name.toString() : p.name;
  db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
});

app.delete('/api/projects/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(asInt(req.params.id));
  res.status(204).end();
});

app.get('/api/projects/:id/racks', (req, res) => {
  const racks = db
    .prepare('SELECT * FROM racks WHERE project_id = ? ORDER BY position, id')
    .all(asInt(req.params.id));
  res.json(racks);
});

app.post('/api/projects/:id/racks', (req, res) => {
  const projectId = asInt(req.params.id);
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const name = (req.body.name || 'New rack').toString().trim() || 'New rack';
  const height_u = asInt(req.body.height_u, 42);
  const maxPos = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM racks WHERE project_id = ?')
    .get(projectId).m;
  const info = db
    .prepare('INSERT INTO racks (project_id, name, height_u, position) VALUES (?, ?, ?, ?)')
    .run(projectId, name, height_u, maxPos + 1);
  res.status(201).json(getRackFull(info.lastInsertRowid));
});

// Flat, spreadsheet-style list of every port in a project (the admin view).
app.get('/api/projects/:id/ports', (req, res) => {
  const projectId = asInt(req.params.id);
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });

  const vlans = db.prepare('SELECT * FROM vlans WHERE project_id = ? ORDER BY tag').all(projectId);

  const rows = db
    .prepare(
      `SELECT p.id AS port_id, r.id AS rack_id, r.name AS rack_name,
              d.id AS device_id, d.name AS device_name, d.type AS device_type,
              d.mgmt_ip AS mgmt_ip, d.position_u AS position_u,
              p.port_nr, p.vlan_id, p.ip, p.mac, p.client, p.label, p.notes
       FROM ports p
       JOIN devices d ON p.device_id = d.id
       JOIN racks r   ON d.rack_id = r.id
       WHERE r.project_id = ?
       ORDER BY r.position, r.id, d.position_u, p.port_nr`
    )
    .all(projectId);

  // Resolve cable links to a readable "device · pN" per port.
  const cables = db
    .prepare('SELECT c.* FROM cables c JOIN racks r ON c.rack_id = r.id WHERE r.project_id = ?')
    .all(projectId);
  const byId = new Map(rows.map((r) => [r.port_id, r]));
  const linkByPort = new Map();
  const desc = (r) => `${r.device_name || r.device_type} · p${r.port_nr}`;
  for (const c of cables) {
    const a = byId.get(c.a_port_id);
    const b = byId.get(c.b_port_id);
    if (a && b) {
      if (!linkByPort.has(a.port_id)) linkByPort.set(a.port_id, desc(b));
      if (!linkByPort.has(b.port_id)) linkByPort.set(b.port_id, desc(a));
    }
  }
  for (const r of rows) r.link = linkByPort.get(r.port_id) || '';

  res.json({ vlans, rows });
});

// ---------------------------------------------------------------------------
// Racks
// ---------------------------------------------------------------------------

app.get('/api/racks/:id', (req, res) => {
  const rack = getRackFull(asInt(req.params.id));
  if (!rack) return res.status(404).json({ error: 'rack not found' });
  res.json(rack);
});

app.put('/api/racks/:id', (req, res) => {
  const id = asInt(req.params.id);
  const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(id);
  if (!rack) return res.status(404).json({ error: 'rack not found' });
  const name = req.body.name !== undefined ? req.body.name.toString() : rack.name;
  const height_u = req.body.height_u !== undefined ? asInt(req.body.height_u, rack.height_u) : rack.height_u;
  const position = req.body.position !== undefined ? asInt(req.body.position, rack.position) : rack.position;
  db.prepare('UPDATE racks SET name = ?, height_u = ?, position = ? WHERE id = ?').run(name, height_u, position, id);
  res.json(getRackFull(id));
});

app.delete('/api/racks/:id', (req, res) => {
  db.prepare('DELETE FROM racks WHERE id = ?').run(asInt(req.params.id));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// VLANs (scoped to a project)
// ---------------------------------------------------------------------------

app.post('/api/projects/:id/vlans', (req, res) => {
  const projectId = asInt(req.params.id);
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const tag = asInt(req.body.tag, 1);
  const name = (req.body.name || '').toString();
  const color = (req.body.color || '#3b82f6').toString();
  const info = db
    .prepare('INSERT INTO vlans (project_id, tag, name, color) VALUES (?, ?, ?, ?)')
    .run(projectId, tag, name, color);
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

  const vlan_id =
    req.body.vlan_id !== undefined
      ? req.body.vlan_id === null || req.body.vlan_id === ''
        ? null
        : asInt(req.body.vlan_id, null)
      : p.vlan_id;
  const ip = req.body.ip !== undefined ? req.body.ip.toString() : p.ip;
  const mac = req.body.mac !== undefined ? req.body.mac.toString() : p.mac;
  const client = req.body.client !== undefined ? req.body.client.toString() : p.client;
  const label = req.body.label !== undefined ? req.body.label.toString() : p.label;
  const notes = req.body.notes !== undefined ? req.body.notes.toString() : p.notes;

  db.prepare('UPDATE ports SET vlan_id = ?, ip = ?, mac = ?, client = ?, label = ?, notes = ? WHERE id = ?').run(
    vlan_id,
    ip,
    mac,
    client,
    label,
    notes,
    id
  );
  res.json(db.prepare('SELECT * FROM ports WHERE id = ?').get(id));
});

// ---------------------------------------------------------------------------
// Cables
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
// Export / import (id-independent: ports reference VLANs by tag, cables by
// device index + port number within their rack)
// ---------------------------------------------------------------------------

function buildProjectExport(projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;

  const vlanRows = db.prepare('SELECT * FROM vlans WHERE project_id = ? ORDER BY tag').all(projectId);
  const vlanTagById = new Map(vlanRows.map((v) => [v.id, v.tag]));
  const vlans = vlanRows.map((v) => ({ tag: v.tag, name: v.name, color: v.color }));

  const racks = db.prepare('SELECT * FROM racks WHERE project_id = ? ORDER BY position, id').all(projectId);
  const exportedRacks = racks.map((rack) => {
    const devices = db.prepare('SELECT * FROM devices WHERE rack_id = ? ORDER BY position_u').all(rack.id);
    const portLocByPortId = new Map(); // portId -> { deviceIdx, port_nr }
    const exportedDevices = devices.map((d, deviceIdx) => {
      const ports = db.prepare('SELECT * FROM ports WHERE device_id = ? ORDER BY port_nr').all(d.id);
      const exportedPorts = ports.map((p) => {
        portLocByPortId.set(p.id, { deviceIdx, port_nr: p.port_nr });
        return {
          port_nr: p.port_nr,
          vlanTag: p.vlan_id != null ? vlanTagById.get(p.vlan_id) ?? null : null,
          ip: p.ip,
          mac: p.mac,
          client: p.client,
          label: p.label,
          notes: p.notes,
        };
      });
      return {
        type: d.type,
        port_count: d.port_count,
        size_u: d.size_u,
        position_u: d.position_u,
        name: d.name,
        manufacturer: d.manufacturer,
        model: d.model,
        mgmt_ip: d.mgmt_ip,
        notes: d.notes,
        ports: exportedPorts,
      };
    });

    const cables = db.prepare('SELECT * FROM cables WHERE rack_id = ?').all(rack.id);
    const exportedCables = cables
      .map((c) => {
        const a = portLocByPortId.get(c.a_port_id);
        const b = portLocByPortId.get(c.b_port_id);
        if (!a || !b) return null;
        return { a, b, color: c.color, label: c.label };
      })
      .filter(Boolean);

    return {
      name: rack.name,
      height_u: rack.height_u,
      position: rack.position,
      devices: exportedDevices,
      cables: exportedCables,
    };
  });

  return {
    format: 'cableclue',
    version: 1,
    exportedAt: new Date().toISOString(),
    project: { name: project.name },
    vlans,
    racks: exportedRacks,
  };
}

// Insert VLANs from export data into a project, returning a tag -> vlan_id map
// that also includes the project's already-existing VLANs.
function importVlans(projectId, vlans) {
  const map = new Map();
  for (const v of db.prepare('SELECT id, tag FROM vlans WHERE project_id = ?').all(projectId)) {
    map.set(v.tag, v.id);
  }
  const ins = db.prepare('INSERT INTO vlans (project_id, tag, name, color) VALUES (?, ?, ?, ?)');
  for (const v of vlans || []) {
    if (map.has(v.tag)) continue; // keep existing definition
    const info = ins.run(projectId, asInt(v.tag, 0), (v.name || '').toString(), (v.color || '#3b82f6').toString());
    map.set(v.tag, info.lastInsertRowid);
  }
  return map;
}

// Insert one rack (and its devices/ports/cables) into a project.
function importRack(projectId, rackData, vlanByTag) {
  const maxPos = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM racks WHERE project_id = ?')
    .get(projectId).m;
  const rackInfo = db
    .prepare('INSERT INTO racks (project_id, name, height_u, position) VALUES (?, ?, ?, ?)')
    .run(projectId, (rackData.name || 'Rack').toString(), asInt(rackData.height_u, 42), maxPos + 1);
  const rackId = rackInfo.lastInsertRowid;

  const insDevice = db.prepare(
    `INSERT INTO devices (rack_id, type, port_count, size_u, position_u, name, manufacturer, model, mgmt_ip, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insPort = db.prepare(
    'INSERT INTO ports (device_id, port_nr, vlan_id, ip, mac, client, label, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const portIdByLoc = new Map(); // `${deviceIdx}:${port_nr}` -> portId
  (rackData.devices || []).forEach((d, deviceIdx) => {
    const devInfo = insDevice.run(
      rackId,
      (d.type || 'switch').toString(),
      asInt(d.port_count, 0),
      Math.max(1, asInt(d.size_u, 1)),
      asInt(d.position_u, 1),
      (d.name || '').toString(),
      (d.manufacturer || '').toString(),
      (d.model || '').toString(),
      (d.mgmt_ip || '').toString(),
      (d.notes || '').toString()
    );
    const deviceId = devInfo.lastInsertRowid;
    for (const p of d.ports || []) {
      const vlanId = p.vlanTag != null && vlanByTag.has(p.vlanTag) ? vlanByTag.get(p.vlanTag) : null;
      const pInfo = insPort.run(
        deviceId,
        asInt(p.port_nr, 0),
        vlanId,
        (p.ip || '').toString(),
        (p.mac || '').toString(),
        (p.client || '').toString(),
        (p.label || '').toString(),
        (p.notes || '').toString()
      );
      portIdByLoc.set(`${deviceIdx}:${asInt(p.port_nr, 0)}`, pInfo.lastInsertRowid);
    }
  });

  const insCable = db.prepare(
    'INSERT INTO cables (rack_id, a_port_id, b_port_id, color, label) VALUES (?, ?, ?, ?, ?)'
  );
  for (const c of rackData.cables || []) {
    const aId = portIdByLoc.get(`${c.a?.deviceIdx}:${c.a?.port_nr}`);
    const bId = portIdByLoc.get(`${c.b?.deviceIdx}:${c.b?.port_nr}`);
    if (aId && bId) insCable.run(rackId, aId, bId, (c.color || '#e3b341').toString(), (c.label || '').toString());
  }
}

function validImport(data) {
  return data && data.format === 'cableclue' && Array.isArray(data.racks);
}

// Full import → brand new project.
const importNewProject = db.transaction((data, name) => {
  const projName = (name || data.project?.name || 'Imported project').toString();
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM projects').get().m;
  const info = db.prepare('INSERT INTO projects (name, position) VALUES (?, ?)').run(projName, maxPos + 1);
  const projectId = info.lastInsertRowid;
  const vlanByTag = importVlans(projectId, data.vlans);
  for (const rack of data.racks) importRack(projectId, rack, vlanByTag);
  return projectId;
});

// Selective merge of chosen parts into an existing project.
const importIntoProject = db.transaction((projectId, data, parts) => {
  const vlanByTag = importVlans(projectId, parts.vlans ? data.vlans : []);
  if (parts.racks) {
    // Make sure rack ports can still resolve VLANs that exist in the file even
    // if "vlans" wasn't ticked: fall back to whatever the project already has.
    for (const rack of data.racks) importRack(projectId, rack, vlanByTag);
  }
});

app.get('/api/projects/:id/export', (req, res) => {
  const data = buildProjectExport(asInt(req.params.id));
  if (!data) return res.status(404).json({ error: 'project not found' });
  res.json(data);
});

app.post('/api/projects/import', (req, res) => {
  const data = req.body.data;
  if (!validImport(data)) return res.status(400).json({ error: 'not a valid CableClue export' });
  const projectId = importNewProject(data, req.body.name);
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId));
});

app.post('/api/projects/:id/import', (req, res) => {
  const id = asInt(req.params.id);
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const data = req.body.data;
  if (!validImport(data)) return res.status(400).json({ error: 'not a valid CableClue export' });
  const parts = req.body.parts || { racks: true, vlans: true };
  importIntoProject(id, data, parts);
  res.json({ ok: true });
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
