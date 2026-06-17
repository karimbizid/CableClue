import { useMemo, useState } from 'react';
import { api } from '../api';
import { MANUFACTURERS } from '../models';
import { POE_STANDARDS, allowedFor, poeStd } from '../poe';
import type { Cable, Device, Port, Rack, Selection } from '../types';

const CUSTOM = '__custom__';

export function Inspector({
  rack,
  selection,
  onReload,
  onClear,
  onStartCable,
  onStartPoe,
  poeAssign,
  onRequestDelete,
}: {
  rack: Rack;
  selection: Selection | null;
  onReload: () => void;
  onClear: () => void;
  onStartCable: (portId: number, deviceId: number) => void;
  onStartPoe: (key: string) => void;
  poeAssign: string | null;
  onRequestDelete: (device: Device) => void;
}) {
  const device =
    selection?.type === 'device'
      ? rack.devices.find((d) => d.id === selection.id)
      : selection?.type === 'port'
      ? rack.devices.find((d) => d.id === selection.deviceId)
      : undefined;
  const port =
    selection?.type === 'port'
      ? device?.ports.find((p) => p.id === selection.id)
      : undefined;
  const cable = selection?.type === 'cable' ? rack.cables.find((c) => c.id === selection.id) : undefined;

  return (
    <aside className="inspector">
      <div className="insp-head">
        <span>Inspector</span>
        {selection && (
          <button className="insp-x" title="Close" onClick={onClear}>
            ×
          </button>
        )}
      </div>
      <div className="insp-body">
        {!selection && <p className="insp-hint">Select a device, a port or a cable to edit it here.</p>}
        {selection?.type === 'device' && device && (
          <DeviceEditor
            key={`d${device.id}`}
            device={device}
            poeAssign={poeAssign}
            onReload={onReload}
            onStartPoe={onStartPoe}
            onRequestDelete={onRequestDelete}
          />
        )}
        {selection?.type === 'port' && port && device && (
          <PortEditor
            key={`p${port.id}`}
            rack={rack}
            device={device}
            port={port}
            onReload={onReload}
            onStartCable={onStartCable}
          />
        )}
        {selection?.type === 'cable' && cable && (
          <CableEditor key={`c${cable.id}`} rack={rack} cable={cable} onReload={onReload} onClear={onClear} />
        )}
      </div>
    </aside>
  );
}

function DeviceEditor({
  device,
  poeAssign,
  onReload,
  onStartPoe,
  onRequestDelete,
}: {
  device: Device;
  poeAssign: string | null;
  onReload: () => void;
  onStartPoe: (key: string) => void;
  onRequestDelete: (device: Device) => void;
}) {
  const [name, setName] = useState(device.name);
  const [manufacturer, setManufacturer] = useState(device.manufacturer);
  const [model, setModel] = useState(device.model);
  const [mgmtIp, setMgmtIp] = useState(device.mgmt_ip);
  const [notes, setNotes] = useState(device.notes);
  const [poeBudget, setPoeBudget] = useState(device.poe_budget ? String(device.poe_budget) : '');
  const [saving, setSaving] = useState(false);

  // How many of this device's ports currently have each PoE capability.
  const capCounts = new Map<string, number>();
  for (const p of device.ports) capCounts.set(p.poe_cap, (capCounts.get(p.poe_cap) ?? 0) + 1);

  const catalogNames = MANUFACTURERS.map((m) => m.name);
  const manuKnown = catalogNames.includes(manufacturer);
  const manuSel = manuKnown ? manufacturer : manufacturer ? CUSTOM : '';
  const models = MANUFACTURERS.find((m) => m.name === manufacturer)?.models ?? [];
  const modelKnown = models.some((m) => m.name === model);
  const modelSel = modelKnown ? model : model ? CUSTOM : '';

  const typeLabel =
    device.type === 'switch' ? 'Switch' : device.type === 'patch' ? 'Patch panel' : 'Blind panel';

  async function save() {
    setSaving(true);
    try {
      await api.updateDevice(device.id, {
        name,
        manufacturer: manufacturer.trim(),
        model: model.trim(),
        mgmt_ip: mgmtIp,
        notes,
        poe_budget: parseInt(poeBudget, 10) || 0,
      });
      onReload();
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    onRequestDelete(device);
  }

  return (
    <div className="editor">
      <div className="insp-title">
        {typeLabel}
        <span className="insp-sub">
          {device.port_count > 0 ? `${device.port_count}p · ` : ''}
          {device.size_u}U
        </span>
      </div>

      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>

      {device.type !== 'blank' && (
        <>
          <label>
            Manufacturer
            <select
              value={manuSel}
              onChange={(e) => {
                const v = e.target.value;
                if (v === CUSTOM) setManufacturer(' ');
                else setManufacturer(v);
                setModel('');
              }}
            >
              <option value="">— none —</option>
              {catalogNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value={CUSTOM}>Custom…</option>
            </select>
          </label>
          {!manuKnown && manuSel === CUSTOM && (
            <input
              placeholder="Manufacturer name"
              value={manufacturer.trim()}
              onChange={(e) => setManufacturer(e.target.value)}
            />
          )}

          <label>
            Model
            {manuKnown ? (
              <select
                value={modelSel}
                onChange={(e) => {
                  const v = e.target.value;
                  setModel(v === CUSTOM ? ' ' : v);
                  const m = models.find((x) => x.name === v);
                  if (m && m.poeBudget > 0) setPoeBudget(String(m.poeBudget));
                }}
              >
                <option value="">— none —</option>
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.ports}p)
                  </option>
                ))}
                <option value={CUSTOM}>Custom…</option>
              </select>
            ) : (
              <input value={model.trim()} onChange={(e) => setModel(e.target.value)} placeholder="Model" />
            )}
          </label>
          {manuKnown && modelSel === CUSTOM && (
            <input
              placeholder="Model name"
              value={model.trim()}
              onChange={(e) => setModel(e.target.value)}
            />
          )}

          {device.type === 'switch' && (
            <>
              <label>
                PoE budget (W)
                <input
                  type="number"
                  value={poeBudget}
                  onChange={(e) => setPoeBudget(e.target.value)}
                  placeholder="e.g. 370 (0 = no PoE)"
                />
              </label>
              <div className="insp-section">PoE port capabilities</div>
              <p className="insp-hint">Pick a class, then click ports in the rack to assign it.</p>
              <div className="poe-assign">
                {POE_STANDARDS.map((s) => (
                  <div className={`poe-row ${poeAssign === s.key ? 'active' : ''}`} key={s.key || 'none'}>
                    <span
                      className="poe-swatch"
                      style={{ background: s.color || 'transparent', borderColor: s.color || 'var(--line)' }}
                    />
                    <span className="poe-name">{s.name}</span>
                    <span className="poe-count">{capCounts.get(s.key) ?? 0}</span>
                    <button
                      className={`poe-assign-btn ${poeAssign === s.key ? 'active' : ''}`}
                      onClick={() => onStartPoe(s.key)}
                    >
                      {poeAssign === s.key ? 'Assigning…' : 'Assign'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <label>
            Management IP
            <input value={mgmtIp} onChange={(e) => setMgmtIp(e.target.value)} placeholder="10.0.0.2" />
          </label>
        </>
      )}

      <label>
        Notes
        <textarea value={notes} rows={3} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="insp-actions">
        <button className="danger-link" onClick={remove}>
          Delete device
        </button>
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function PortEditor({
  rack,
  device,
  port,
  onReload,
  onStartCable,
}: {
  rack: Rack;
  device: Device;
  port: Port;
  onReload: () => void;
  onStartCable: (portId: number, deviceId: number) => void;
}) {
  const [vlanId, setVlanId] = useState<string>(port.vlan_id != null ? String(port.vlan_id) : '');
  const [ip, setIp] = useState(port.ip);
  const [mac, setMac] = useState(port.mac);
  const [client, setClient] = useState(port.client);
  const [label, setLabel] = useState(port.label);
  const [notes, setNotes] = useState(port.notes);
  const [poe, setPoe] = useState(port.poe);
  const [saving, setSaving] = useState(false);

  const portIndex = useMemo(() => buildPortIndex(rack), [rack]);
  const cables = rack.cables.filter((c) => c.a_port_id === port.id || c.b_port_id === port.id);

  async function save() {
    setSaving(true);
    try {
      await api.updatePort(port.id, {
        vlan_id: vlanId === '' ? null : Number(vlanId),
        ip,
        mac,
        client,
        label,
        notes,
        poe,
      });
      onReload();
    } finally {
      setSaving(false);
    }
  }

  async function removeCable(id: number) {
    await api.deleteCable(id);
    onReload();
  }

  return (
    <div className="editor">
      <div className="insp-title">
        Port {port.port_nr}
        <span className="insp-sub">{device.name || device.type}</span>
      </div>

      <label>
        VLAN
        <select value={vlanId} onChange={(e) => setVlanId(e.target.value)}>
          <option value="">— none —</option>
          {rack.vlans.map((v) => (
            <option key={v.id} value={v.id}>
              {v.tag}
              {v.name ? ` · ${v.name}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        IP address
        <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="10.0.0.10" />
      </label>
      <label>
        MAC address
        <input value={mac} onChange={(e) => setMac(e.target.value)} placeholder="aa:bb:cc:dd:ee:ff" />
      </label>
      {device.type === 'switch' && (
        <label>
          PoE (used){port.poe_cap ? <span className="insp-sub"> · port supports {poeStd(port.poe_cap)?.name}</span> : null}
          <select value={poe} onChange={(e) => setPoe(e.target.value)}>
            {allowedFor(port.poe_cap).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Client
        <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Desktop, AP, …" />
      </label>
      <label>
        Label
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="insp-actions">
        <span />
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="insp-cables">
        <div className="insp-section">Links</div>
        {cables.length === 0 && <p className="insp-hint">No links on this port.</p>}
          {cables.map((c) => {
            const otherId = c.a_port_id === port.id ? c.b_port_id : c.a_port_id;
            const other = portIndex.get(otherId);
            return (
              <div className="cable-row" key={c.id}>
                <span className="cable-swatch" style={{ background: c.color }} />
                <span className="cable-to">
                  → {other ? `${other.deviceName} · port ${other.portNr}` : 'unknown'}
                </span>
                <button className="danger-link" onClick={() => removeCable(c.id)}>
                  remove
                </button>
              </div>
            );
          })}
        <button className="ghost-btn" onClick={() => onStartCable(port.id, device.id)}>
          🔌 Link to another port
        </button>
      </div>
    </div>
  );
}

function CableEditor({
  rack,
  cable,
  onReload,
  onClear,
}: {
  rack: Rack;
  cable: Cable;
  onReload: () => void;
  onClear: () => void;
}) {
  const [color, setColor] = useState(cable.color);
  const [label, setLabel] = useState(cable.label);
  const portIndex = useMemo(() => buildPortIndex(rack), [rack]);
  const a = portIndex.get(cable.a_port_id);
  const b = portIndex.get(cable.b_port_id);

  async function save() {
    await api.updateCable(cable.id, { color, label });
    onReload();
  }
  async function remove() {
    await api.deleteCable(cable.id);
    onClear();
    onReload();
  }

  return (
    <div className="editor">
      <div className="insp-title">Link</div>
      <p className="insp-endpoints">
        {a ? `${a.deviceName} · port ${a.portNr}` : '?'} ↔ {b ? `${b.deviceName} · port ${b.portNr}` : '?'}
      </p>
      <label>
        Color
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      <label>
        Label
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Uplink, trunk, …" />
      </label>
      <div className="insp-actions">
        <button className="danger-link" onClick={remove}>
          Delete link
        </button>
        <button className="primary" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

function buildPortIndex(rack: Rack) {
  const map = new Map<number, { deviceName: string; portNr: number }>();
  for (const d of rack.devices) {
    for (const p of d.ports) {
      map.set(p.id, { deviceName: d.name || d.type, portNr: p.port_nr });
    }
  }
  return map;
}
