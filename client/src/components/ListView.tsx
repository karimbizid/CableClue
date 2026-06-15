import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { PortRow, Vlan } from '../types';

export function ListView({ projectId }: { projectId: number }) {
  const [rows, setRows] = useState<PortRow[]>([]);
  const [vlans, setVlans] = useState<Vlan[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listPorts(projectId);
      setRows(res.rows);
      setVlans(res.vlans);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function patchPort(portId: number, patch: Partial<PortRow>) {
    setRows((rs) => rs.map((r) => (r.port_id === portId ? { ...r, ...patch } : r)));
  }
  function patchDevice(deviceId: number, patch: Partial<PortRow>) {
    setRows((rs) => rs.map((r) => (r.device_id === deviceId ? { ...r, ...patch } : r)));
  }

  async function savePort(portId: number, patch: Parameters<typeof api.updatePort>[1]) {
    try {
      await api.updatePort(portId, patch);
    } catch {
      alert('Could not save that change.');
      load();
    }
  }
  async function saveDevice(deviceId: number, mgmt_ip: string) {
    try {
      await api.updateDevice(deviceId, { mgmt_ip });
    } catch {
      alert('Could not save the management IP.');
      load();
    }
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    const vlanText = (id: number | null) => {
      const v = vlans.find((x) => x.id === id);
      return v ? `${v.tag} ${v.name}` : '';
    };
    return rows.filter((r) =>
      [
        r.rack_name,
        r.device_name,
        r.device_type,
        r.mgmt_ip,
        `port ${r.port_nr}`,
        vlanText(r.vlan_id),
        r.ip,
        r.mac,
        r.client,
        r.label,
        r.notes,
        r.link,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [rows, vlans, filter]);

  const filled = rows.filter((r) => r.ip || r.client || r.vlan_id != null).length;

  return (
    <div className="listview">
      <div className="lv-toolbar">
        <input
          className="lv-filter"
          placeholder="Filter… (rack, device, IP, MAC, client, VLAN, …)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="lv-stats">
          {filled} / {rows.length} ports configured
        </span>
        <button onClick={load}>↻ Refresh</button>
      </div>

      <div className="lv-scroll">
        <table className="lv-table">
          <thead>
            <tr>
              <th>Rack</th>
              <th>Device</th>
              <th>Mgmt IP</th>
              <th className="num">Port</th>
              <th>Type</th>
              <th>Status</th>
              <th>VLAN</th>
              <th>IP address</th>
              <th>MAC</th>
              <th>Client</th>
              <th>Label</th>
              <th>Notes</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const prev = filtered[i - 1];
              const newRack = !prev || prev.rack_id !== r.rack_id;
              const newDevice = newRack || prev.device_id !== r.device_id;
              const occupied = Boolean(r.ip || r.client || r.vlan_id != null);
              return (
                <tr key={r.port_id} className={newRack ? 'rack-start' : ''}>
                  <td className="muted">{newRack ? r.rack_name : ''}</td>
                  <td className="muted">{newDevice ? r.device_name || <em>unnamed</em> : ''}</td>
                  <td>
                    {newDevice && r.device_type !== 'blank' && (
                      <input
                        value={r.mgmt_ip}
                        placeholder="10.0.0.2"
                        onChange={(e) => patchDevice(r.device_id, { mgmt_ip: e.target.value })}
                        onBlur={(e) => saveDevice(r.device_id, e.target.value)}
                      />
                    )}
                  </td>
                  <td className="num">{r.port_nr}</td>
                  <td className="muted">{newDevice ? r.device_type : ''}</td>
                  <td>
                    <span className={`lv-status ${occupied ? 'on' : ''}`}>
                      {occupied ? 'occupied' : 'free'}
                    </span>
                  </td>
                  <td>
                    <select
                      value={r.vlan_id ?? ''}
                      onChange={(e) => {
                        const vlan_id = e.target.value === '' ? null : Number(e.target.value);
                        patchPort(r.port_id, { vlan_id });
                        savePort(r.port_id, { vlan_id });
                      }}
                    >
                      <option value="">—</option>
                      {vlans.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.tag}
                          {v.name ? ` · ${v.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={r.ip}
                      placeholder="10.0.0.x"
                      onChange={(e) => patchPort(r.port_id, { ip: e.target.value })}
                      onBlur={(e) => savePort(r.port_id, { ip: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={r.mac}
                      placeholder="aa:bb:cc:…"
                      onChange={(e) => patchPort(r.port_id, { mac: e.target.value })}
                      onBlur={(e) => savePort(r.port_id, { mac: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={r.client}
                      onChange={(e) => patchPort(r.port_id, { client: e.target.value })}
                      onBlur={(e) => savePort(r.port_id, { client: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={r.label}
                      onChange={(e) => patchPort(r.port_id, { label: e.target.value })}
                      onBlur={(e) => savePort(r.port_id, { label: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={r.notes}
                      onChange={(e) => patchPort(r.port_id, { notes: e.target.value })}
                      onBlur={(e) => savePort(r.port_id, { notes: e.target.value })}
                    />
                  </td>
                  <td className="muted lv-link">{r.link}</td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={13} className="muted lv-empty">
                  No ports yet — add switches or patch panels in the rack view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
