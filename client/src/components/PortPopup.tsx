import { useState } from 'react';
import { api } from '../api';
import type { Device, Port, Vlan } from '../types';

export function PortPopup({
  port,
  device,
  vlans,
  onClose,
  onSaved,
}: {
  port: Port;
  device: Device;
  vlans: Vlan[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vlanId, setVlanId] = useState<string>(port.vlan_id != null ? String(port.vlan_id) : '');
  const [ip, setIp] = useState(port.ip);
  const [client, setClient] = useState(port.client);
  const [label, setLabel] = useState(port.label);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updatePort(port.id, {
        vlan_id: vlanId === '' ? null : Number(vlanId),
        ip,
        client,
        label,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>
            Port {port.port_nr}
            <span className="sub"> · {device.name || device.type}</span>
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <label>
            VLAN
            <select value={vlanId} onChange={(e) => setVlanId(e.target.value)}>
              <option value="">— none —</option>
              {vlans.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.tag}
                  {v.name ? ` · ${v.name}` : ''}
                </option>
              ))}
            </select>
            {vlans.length === 0 && <small className="hint">Define VLANs via the top-right button.</small>}
          </label>
          <label>
            IP address
            <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="10.0.0.10" />
          </label>
          <label>
            Client
            <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Desktop, AP, …" />
          </label>
          <label>
            Label
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
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
