import { useState } from 'react';
import { api } from '../api';
import type { Device } from '../types';

export function DeviceInspector({
  device,
  onClose,
  onSaved,
}: {
  device: Device;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(device.name);
  const [manufacturer, setManufacturer] = useState(device.manufacturer);
  const [model, setModel] = useState(device.model);
  const [mgmtIp, setMgmtIp] = useState(device.mgmt_ip);
  const [notes, setNotes] = useState(device.notes);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updateDevice(device.id, {
        name,
        manufacturer,
        model,
        mgmt_ip: mgmtIp,
        notes,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const typeLabel =
    device.type === 'switch' ? 'Switch' : device.type === 'patch' ? 'Patch panel' : 'Blind panel';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{typeLabel} inspector</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <div className="grid2">
            <label>
              Manufacturer
              <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            </label>
            <label>
              Model
              <input value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
          </div>
          <label>
            Management IP
            <input value={mgmtIp} onChange={(e) => setMgmtIp(e.target.value)} placeholder="10.0.0.2" />
          </label>
          <label>
            Notes
            <textarea value={notes} rows={3} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <p className="meta">
            {typeLabel} · {device.port_count > 0 ? `${device.port_count} ports · ` : ''}
            {device.size_u}U
          </p>
        </div>
        <footer className="modal-foot">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}
