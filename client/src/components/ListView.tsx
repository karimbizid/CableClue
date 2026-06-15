import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { PortRow, Vlan } from '../types';
import { VlanManager } from './VlanManager';

type SortKey =
  | 'rack' | 'device' | 'mgmt_ip' | 'port' | 'type' | 'status'
  | 'vlan' | 'ip' | 'mac' | 'client' | 'label' | 'notes' | 'link';
type StatusFilter = 'all' | 'free' | 'occupied';

// Zero-pad IP octets so "10.0.0.2" sorts before "10.0.0.10".
function ipKey(ip: string): string {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return ip.toLowerCase();
  return m.slice(1).map((o) => o.padStart(3, '0')).join('.');
}

export function ListView({ projectId }: { projectId: number }) {
  const [rows, setRows] = useState<PortRow[]>([]);
  const [vlans, setVlans] = useState<Vlan[]>([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [vlanOpen, setVlanOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const vlanById = useMemo(() => new Map(vlans.map((v) => [v.id, v])), [vlans]);
  const occupied = (r: PortRow) => Boolean(r.ip || r.client || r.vlan_id != null);

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

  // Header click cycles: ascending → descending → default order.
  function toggleSort(key: SortKey) {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 1 };
      if (s.dir === 1) return { key, dir: -1 };
      return null;
    });
  }
  const arrow = (key: SortKey) => (sort?.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');

  function sortVal(r: PortRow, key: SortKey): string | number {
    switch (key) {
      case 'rack': return r.rack_name.toLowerCase();
      case 'device': return (r.device_name || '~').toLowerCase();
      case 'mgmt_ip': return ipKey(r.mgmt_ip);
      case 'port': return r.port_nr;
      case 'type': return r.device_type;
      case 'status': return occupied(r) ? 1 : 0;
      case 'vlan': return r.vlan_id != null ? vlanById.get(r.vlan_id)?.tag ?? 99999 : 99999;
      case 'ip': return ipKey(r.ip);
      case 'mac': return r.mac.toLowerCase();
      case 'client': return r.client.toLowerCase();
      case 'label': return r.label.toLowerCase();
      case 'notes': return r.notes.toLowerCase();
      case 'link': return r.link.toLowerCase();
    }
  }

  const display = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (statusFilter === 'free' && occupied(r)) return false;
      if (statusFilter === 'occupied' && !occupied(r)) return false;
      if (!q) return true;
      const v = r.vlan_id != null ? vlanById.get(r.vlan_id) : undefined;
      return [
        r.rack_name, r.device_name, r.device_type, r.mgmt_ip, `port ${r.port_nr}`,
        v ? `${v.tag} ${v.name}` : '', r.ip, r.mac, r.client, r.label, r.notes, r.link,
      ].join(' ').toLowerCase().includes(q);
    });
    if (sort) {
      out = [...out].sort((a, b) => {
        const av = sortVal(a, sort.key);
        const bv = sortVal(b, sort.key);
        const c = av < bv ? -1 : av > bv ? 1 : 0;
        return c * sort.dir;
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, vlans, filter, statusFilter, sort]);

  // Unique devices for the jump chips (in fetched order).
  const devices = useMemo(() => {
    const seen = new Set<number>();
    const list: { id: number; label: string; type: string }[] = [];
    for (const r of rows) {
      if (seen.has(r.device_id)) continue;
      seen.add(r.device_id);
      list.push({ id: r.device_id, label: r.device_name || `${r.device_type}`, type: r.device_type });
    }
    return list;
  }, [rows]);

  function jumpTo(deviceId: number) {
    const el = scrollRef.current?.querySelector(`[data-device-id="${deviceId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const filled = rows.filter(occupied).length;

  return (
    <div className="listview">
      <div className="lv-toolbar">
        <input
          className="lv-filter"
          placeholder="Filter… (rack, device, IP, MAC, client, VLAN, …)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="seg">
          {(['all', 'free', 'occupied'] as StatusFilter[]).map((s) => (
            <button key={s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>
              {s === 'all' ? 'All' : s === 'free' ? 'Free' : 'Occupied'}
            </button>
          ))}
        </span>
        <span className="lv-stats">
          {filled} / {rows.length} configured{display.length !== rows.length ? ` · ${display.length} shown` : ''}
        </span>
        <button onClick={() => setVlanOpen(true)}>VLANs ({vlans.length})</button>
        <button onClick={load}>↻ Refresh</button>
      </div>

      {devices.length > 0 && (
        <div className="lv-chips">
          {devices.map((d) => (
            <button key={d.id} className={`lv-chip ${d.type}`} onClick={() => jumpTo(d.id)} title="Jump to this device">
              {d.label}
            </button>
          ))}
        </div>
      )}

      <div className="lv-scroll" ref={scrollRef}>
        <table className="lv-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('rack')}>Rack{arrow('rack')}</th>
              <th onClick={() => toggleSort('device')}>Device{arrow('device')}</th>
              <th onClick={() => toggleSort('mgmt_ip')}>Mgmt IP{arrow('mgmt_ip')}</th>
              <th className="num" onClick={() => toggleSort('port')}>Port{arrow('port')}</th>
              <th onClick={() => toggleSort('type')}>Type{arrow('type')}</th>
              <th onClick={() => toggleSort('status')}>Status{arrow('status')}</th>
              <th onClick={() => toggleSort('vlan')}>VLAN{arrow('vlan')}</th>
              <th onClick={() => toggleSort('ip')}>IP address{arrow('ip')}</th>
              <th onClick={() => toggleSort('mac')}>MAC{arrow('mac')}</th>
              <th onClick={() => toggleSort('client')}>Client{arrow('client')}</th>
              <th onClick={() => toggleSort('label')}>Label{arrow('label')}</th>
              <th onClick={() => toggleSort('notes')}>Notes{arrow('notes')}</th>
              <th onClick={() => toggleSort('link')}>Link{arrow('link')}</th>
            </tr>
          </thead>
          <tbody>
            {display.map((r) => {
              const vlan = r.vlan_id != null ? vlanById.get(r.vlan_id) : undefined;
              const occ = occupied(r);
              return (
                <tr key={r.port_id} data-device-id={r.device_id}>
                  <td className="muted">{r.rack_name}</td>
                  <td className="dev">{r.device_name || <em>unnamed</em>}</td>
                  <td>
                    {r.device_type !== 'blank' && (
                      <input
                        value={r.mgmt_ip}
                        placeholder="10.0.0.2"
                        onChange={(e) => patchDevice(r.device_id, { mgmt_ip: e.target.value })}
                        onBlur={(e) => saveDevice(r.device_id, e.target.value)}
                      />
                    )}
                  </td>
                  <td className="num">{r.port_nr}</td>
                  <td className="muted">{r.device_type}</td>
                  <td>
                    <span className={`lv-status ${occ ? 'on' : ''}`}>{occ ? 'occupied' : 'free'}</span>
                  </td>
                  <td>
                    <div className="vlan-cell">
                      <span className="vlan-dot" style={{ background: vlan ? vlan.color : 'transparent', borderColor: vlan ? vlan.color : 'var(--line)' }} />
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
                    </div>
                  </td>
                  <td>
                    <input value={r.ip} placeholder="10.0.0.x"
                      onChange={(e) => patchPort(r.port_id, { ip: e.target.value })}
                      onBlur={(e) => savePort(r.port_id, { ip: e.target.value })} />
                  </td>
                  <td>
                    <input value={r.mac} placeholder="aa:bb:cc:…"
                      onChange={(e) => patchPort(r.port_id, { mac: e.target.value })}
                      onBlur={(e) => savePort(r.port_id, { mac: e.target.value })} />
                  </td>
                  <td>
                    <input value={r.client}
                      onChange={(e) => patchPort(r.port_id, { client: e.target.value })}
                      onBlur={(e) => savePort(r.port_id, { client: e.target.value })} />
                  </td>
                  <td>
                    <input value={r.label}
                      onChange={(e) => patchPort(r.port_id, { label: e.target.value })}
                      onBlur={(e) => savePort(r.port_id, { label: e.target.value })} />
                  </td>
                  <td>
                    <input value={r.notes}
                      onChange={(e) => patchPort(r.port_id, { notes: e.target.value })}
                      onBlur={(e) => savePort(r.port_id, { notes: e.target.value })} />
                  </td>
                  <td className="muted lv-link">{r.link}</td>
                </tr>
              );
            })}
            {!loading && display.length === 0 && (
              <tr>
                <td colSpan={13} className="muted lv-empty">
                  {rows.length === 0 ? 'No ports yet — add switches or patch panels in the rack view.' : 'No ports match the current filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {vlanOpen && (
        <VlanManager
          projectId={projectId}
          vlans={vlans}
          onClose={() => setVlanOpen(false)}
          onChanged={load}
        />
      )}
    </div>
  );
}
