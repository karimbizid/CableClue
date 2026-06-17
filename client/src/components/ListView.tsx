import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { api } from '../api';
import type { PortRow, Vlan } from '../types';
import { POE_STANDARDS, allowedFor, poeStd } from '../poe';
import { VlanManager } from './VlanManager';
import { ExportDialog } from './ExportDialog';

type SortKey =
  | 'rack' | 'device' | 'mgmt_ip' | 'port' | 'type' | 'status' | 'poe'
  | 'vlan' | 'ip' | 'mac' | 'client' | 'label' | 'notes' | 'link';
type StatusFilter = 'all' | 'free' | 'occupied';
type TextCol = 'mgmt_ip' | 'ip' | 'mac' | 'client' | 'label' | 'notes';

const TEXT_COLS: TextCol[] = ['mgmt_ip', 'ip', 'mac', 'client', 'label', 'notes'];

// ---- IP / series helpers (Excel-style fill) ----
const isIp = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s.trim());
const ipToInt = (s: string) =>
  s.trim().split('.').reduce((a, o) => a * 256 + (parseInt(o, 10) & 255), 0);
const intToIp = (n: number) => {
  const v = ((n % 4294967296) + 4294967296) % 4294967296;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.');
};
function parseTrailing(s: string): { prefix: string; num: number; width: number } | null {
  const m = s.match(/^(.*?)(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], num: parseInt(m[2], 10), width: m[2].length };
}
// Returns a function giving the i-th value AFTER the source (i >= 1), or null.
function detectSeries(vals: string[]): ((i: number) => string) | null {
  if (vals.length < 2) return null;
  if (vals.every(isIp)) {
    const ints = vals.map(ipToInt);
    const d = ints[1] - ints[0];
    if (ints.every((v, i) => i === 0 || v - ints[i - 1] === d)) {
      const last = ints[ints.length - 1];
      return (i) => intToIp(last + d * i);
    }
  }
  const parsed = vals.map(parseTrailing);
  if (parsed.every((p): p is NonNullable<typeof p> => !!p) && parsed.every((p) => p.prefix === parsed[0]!.prefix)) {
    const nums = parsed.map((p) => p.num);
    const d = nums[1] - nums[0];
    if (nums.every((v, i) => i === 0 || v - nums[i - 1] === d)) {
      const last = nums[nums.length - 1];
      const width = Math.max(...parsed.map((p) => p.width));
      const prefix = parsed[0]!.prefix;
      return (i) => prefix + String(last + d * i).padStart(width, '0');
    }
  }
  return null;
}
function fillSeries(src: string[], count: number): string[] {
  if (src.length === 0) return Array(count).fill('');
  const series = detectSeries(src);
  if (series) return Array.from({ length: count }, (_, i) => series(i + 1));
  return Array.from({ length: count }, (_, i) => src[i % src.length]); // repeat block
}

export function ListView({
  projectId,
  projectName,
  onChanged,
}: {
  projectId: number;
  projectName: string;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<PortRow[]>([]);
  const [vlans, setVlans] = useState<Vlan[]>([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deviceFilter, setDeviceFilter] = useState<Set<number>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [vlanOpen, setVlanOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Grid selection (single column, row range).
  const [selection, setSelection] = useState<{ col: TextCol; r0: number; r1: number } | null>(null);
  const [anchorRow, setAnchorRow] = useState(0);
  const [editing, setEditing] = useState<{ col: TextCol; r: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [drag, setDrag] = useState<'select' | 'fill' | null>(null);
  const [fillToRow, setFillToRow] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

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
      onChanged?.();
    } catch {
      alert('Could not save that change.');
      load();
    }
  }
  async function saveDevice(deviceId: number, mgmt_ip: string) {
    try {
      await api.updateDevice(deviceId, { mgmt_ip });
      onChanged?.();
    } catch {
      alert('Could not save the management IP.');
      load();
    }
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  }
  const arrow = (key: SortKey) => (sort?.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');

  function sortVal(r: PortRow, key: SortKey): string | number {
    switch (key) {
      case 'rack': return r.rack_name.toLowerCase();
      case 'device': return (r.device_name || '~').toLowerCase();
      case 'mgmt_ip': return r.mgmt_ip;
      case 'port': return r.port_nr;
      case 'type': return r.device_type;
      case 'status': return occupied(r) ? 1 : 0;
      case 'poe': return POE_STANDARDS.find((s) => s.key === r.poe)?.watts ?? -1;
      case 'vlan': return r.vlan_id != null ? vlanById.get(r.vlan_id)?.tag ?? 99999 : 99999;
      default: return (r[key] as string).toLowerCase();
    }
  }

  const display = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (deviceFilter.size > 0 && !deviceFilter.has(r.device_id)) return false;
      if (statusFilter === 'free' && occupied(r)) return false;
      if (statusFilter === 'occupied' && !occupied(r)) return false;
      if (!q) return true;
      const v = r.vlan_id != null ? vlanById.get(r.vlan_id) : undefined;
      return [r.rack_name, r.device_name, r.device_type, r.mgmt_ip, `port ${r.port_nr}`,
        v ? `${v.tag} ${v.name}` : '', r.ip, r.mac, r.client, r.label, r.notes, r.link]
        .join(' ').toLowerCase().includes(q);
    });
    if (sort) out = [...out].sort((a, b) => {
      const av = sortVal(a, sort.key), bv = sortVal(b, sort.key);
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, vlans, filter, statusFilter, deviceFilter, sort]);

  // Selection coordinates are display-row indices, so reset when the view changes.
  useEffect(() => {
    setSelection(null);
    setEditing(null);
  }, [filter, statusFilter, deviceFilter, sort]);

  // Unique devices for the filter chips, top-to-bottom of each rack.
  const devices = useMemo(() => {
    const rackOrder: number[] = [];
    const map = new Map<number, { id: number; label: string; type: string; rack_id: number; position_u: number }>();
    for (const r of rows) {
      if (!rackOrder.includes(r.rack_id)) rackOrder.push(r.rack_id);
      if (!map.has(r.device_id))
        map.set(r.device_id, { id: r.device_id, label: r.device_name || r.device_type, type: r.device_type, rack_id: r.rack_id, position_u: r.position_u });
    }
    return [...map.values()].sort((a, b) => {
      const ra = rackOrder.indexOf(a.rack_id), rb = rackOrder.indexOf(b.rack_id);
      return ra !== rb ? ra - rb : a.position_u - b.position_u;
    });
  }, [rows]);

  function toggleDevice(id: number) {
    setDeviceFilter((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ---- Grid value access ----
  const getVal = (r: PortRow, col: TextCol) => (col === 'mgmt_ip' ? r.mgmt_ip : (r[col] as string));
  const focusGrid = () => gridRef.current?.focus();

  function startEdit(r: number, col: TextCol, initial?: string) {
    const row = display[r];
    if (!row) return;
    setSelection({ col, r0: r, r1: r });
    setAnchorRow(r);
    setEditing({ col, r });
    setEditValue(initial !== undefined ? initial : getVal(row, col));
  }
  function commitEdit() {
    if (!editing) return;
    const row = display[editing.r];
    if (row) {
      if (editing.col === 'mgmt_ip') {
        patchDevice(row.device_id, { mgmt_ip: editValue });
        saveDevice(row.device_id, editValue);
      } else {
        patchPort(row.port_id, { [editing.col]: editValue });
        savePort(row.port_id, { [editing.col]: editValue });
      }
    }
    setEditing(null);
  }

  function onCellDown(e: MouseEvent, r: number, col: TextCol) {
    e.preventDefault();
    if (editing) commitEdit();
    // Shift / Ctrl / Cmd click extends the range from the existing anchor.
    const extend = (e.shiftKey || e.metaKey || e.ctrlKey) && selection != null && selection.col === col;
    if (extend) {
      setSelection({ col, r0: Math.min(anchorRow, r), r1: Math.max(anchorRow, r) });
    } else {
      setSelection({ col, r0: r, r1: r });
      setAnchorRow(r);
    }
    setDrag('select');
    focusGrid();
  }
  function onCellEnter(r: number, col: TextCol) {
    if (drag === 'select' && selection && col === selection.col) {
      setSelection({ col, r0: Math.min(anchorRow, r), r1: Math.max(anchorRow, r) });
    } else if (drag === 'fill') {
      setFillToRow(r);
    }
  }

  async function applyFill() {
    if (!selection || fillToRow == null || fillToRow <= selection.r1) return;
    const { col, r0, r1 } = selection;
    const src: string[] = [];
    for (let r = r0; r <= r1; r++) if (display[r]) src.push(getVal(display[r], col));
    const n = fillToRow - r1;
    const vals = fillSeries(src, n);
    const portUpdates: { port_id: number; value: string }[] = [];
    const deviceUpdates = new Map<number, string>();
    for (let i = 0; i < n; i++) {
      const row = display[r1 + 1 + i];
      if (!row) break;
      if (col === 'mgmt_ip') deviceUpdates.set(row.device_id, vals[i]);
      else portUpdates.push({ port_id: row.port_id, value: vals[i] });
    }
    setRows((prev) =>
      prev.map((pr) => {
        if (col === 'mgmt_ip') return deviceUpdates.has(pr.device_id) ? { ...pr, mgmt_ip: deviceUpdates.get(pr.device_id)! } : pr;
        const pu = portUpdates.find((x) => x.port_id === pr.port_id);
        return pu ? { ...pr, [col]: pu.value } : pr;
      })
    );
    try {
      await Promise.all([
        ...portUpdates.map((pu) => api.updatePort(pu.port_id, { [col]: pu.value })),
        ...[...deviceUpdates].map(([id, val]) => api.updateDevice(id, { mgmt_ip: val })),
      ]);
      onChanged?.();
    } catch {
      alert('Could not save the filled values.');
      load();
    }
  }

  async function clearCells() {
    if (!selection) return;
    const { col, r0, r1 } = selection;
    const portIds: number[] = [];
    const deviceIds = new Set<number>();
    for (let r = r0; r <= r1; r++) {
      const row = display[r];
      if (!row) continue;
      if (col === 'mgmt_ip') deviceIds.add(row.device_id);
      else portIds.push(row.port_id);
    }
    setRows((prev) =>
      prev.map((pr) => {
        if (col === 'mgmt_ip') return deviceIds.has(pr.device_id) ? { ...pr, mgmt_ip: '' } : pr;
        return portIds.includes(pr.port_id) ? { ...pr, [col]: '' } : pr;
      })
    );
    try {
      await Promise.all([
        ...portIds.map((id) => api.updatePort(id, { [col]: '' })),
        ...[...deviceIds].map((id) => api.updateDevice(id, { mgmt_ip: '' })),
      ]);
      onChanged?.();
    } catch {
      alert('Could not clear those cells.');
      load();
    }
  }

  // End drags on a global mouse-up.
  useEffect(() => {
    if (!drag) return;
    const up = () => {
      if (drag === 'fill') applyFill();
      setDrag(null);
      setFillToRow(null);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, selection, fillToRow]);

  function onGridKeyDown(e: KeyboardEvent) {
    if (editing || !selection) return;
    const { col } = selection;
    const active = anchorRow;
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      startEdit(active, col);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      clearCells();
    } else if (e.key === 'Escape') {
      setSelection(null);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      if (e.shiftKey) {
        // Extend the range: move the edge opposite the anchor.
        const focus = selection.r1 === anchorRow ? selection.r0 : selection.r1;
        const nf = Math.max(0, Math.min(display.length - 1, focus + step));
        setSelection({ col, r0: Math.min(anchorRow, nf), r1: Math.max(anchorRow, nf) });
      } else {
        const nr = Math.max(0, Math.min(display.length - 1, active + step));
        setSelection({ col, r0: nr, r1: nr });
        setAnchorRow(nr);
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      startEdit(active, col, e.key);
    }
  }

  function textCell(row: PortRow, r: number, col: TextCol) {
    const sel = selection && selection.col === col && r >= selection.r0 && r <= selection.r1;
    const prev = drag === 'fill' && selection && selection.col === col && fillToRow != null && r > selection.r1 && r <= fillToRow;
    const bottom = selection && selection.col === col && r === selection.r1;
    const isEditing = editing && editing.col === col && editing.r === r;
    return (
      <td key={col} className="gcell-td">
        {isEditing ? (
          <input
            className="gcell-input"
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit();
                const nr = Math.min(display.length - 1, r + 1);
                setSelection({ col, r0: nr, r1: nr });
                setAnchorRow(nr);
                focusGrid();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(null);
                focusGrid();
              }
            }}
          />
        ) : (
          <div
            className={`gcell ${sel ? 'sel' : ''} ${prev ? 'fillprev' : ''}`}
            onMouseDown={(e) => onCellDown(e, r, col)}
            onMouseEnter={() => onCellEnter(r, col)}
            onDoubleClick={() => startEdit(r, col)}
          >
            <span className="gcell-val">{getVal(row, col) || ' '}</span>
            {bottom && <span className="fill-handle" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDrag('fill'); setFillToRow(selection!.r1); }} />}
          </div>
        )}
      </td>
    );
  }

  const filled = rows.filter(occupied).length;

  return (
    <div className="listview">
      <div className="lv-toolbar">
        <input className="lv-filter" placeholder="Filter… (rack, device, IP, MAC, client, VLAN, …)" value={filter} onChange={(e) => setFilter(e.target.value)} />
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
        <button onClick={() => setExportOpen(true)}>⬇ Export</button>
        <button onClick={load}>↻ Refresh</button>
      </div>

      {devices.length > 0 && (
        <div className="lv-chips">
          {deviceFilter.size > 0 && (
            <button className="lv-chip clear" onClick={() => setDeviceFilter(new Set())}>All</button>
          )}
          {devices.map((d) => (
            <button
              key={d.id}
              className={`lv-chip ${d.type} ${deviceFilter.has(d.id) ? 'on' : ''}`}
              onClick={() => toggleDevice(d.id)}
              title="Toggle this device in the list"
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      <div className="lv-scroll" ref={gridRef} tabIndex={0} onKeyDown={onGridKeyDown}>
        <table className="lv-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('rack')}>Rack{arrow('rack')}</th>
              <th onClick={() => toggleSort('device')}>Device{arrow('device')}</th>
              <th onClick={() => toggleSort('mgmt_ip')}>Mgmt IP{arrow('mgmt_ip')}</th>
              <th className="num" onClick={() => toggleSort('port')}>Port{arrow('port')}</th>
              <th onClick={() => toggleSort('type')}>Type{arrow('type')}</th>
              <th onClick={() => toggleSort('status')}>Status{arrow('status')}</th>
              <th onClick={() => toggleSort('poe')}>PoE{arrow('poe')}</th>
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
            {display.map((r, i) => {
              const vlan = r.vlan_id != null ? vlanById.get(r.vlan_id) : undefined;
              const occ = occupied(r);
              return (
                <tr key={r.port_id}>
                  <td className="muted">{r.rack_name}</td>
                  <td className="dev">{r.device_name || <em>unnamed</em>}</td>
                  {textCell(r, i, 'mgmt_ip')}
                  <td className="num">{r.port_nr}</td>
                  <td className="muted">{r.device_type}</td>
                  <td><span className={`lv-status ${occ ? 'on' : ''}`}>{occ ? 'occupied' : 'free'}</span></td>
                  <td>
                    {r.device_type === 'switch' ? (
                      <div className="poe-cell">
                        <select value={r.poe} onChange={(e) => { patchPort(r.port_id, { poe: e.target.value }); savePort(r.port_id, { poe: e.target.value }); }}>
                          {allowedFor(r.poe_cap).map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
                        </select>
                        {r.poe_cap && <span className="poe-cap" title="Port capability">≤ {poeStd(r.poe_cap)?.name}</span>}
                      </div>
                    ) : (<span className="muted">—</span>)}
                  </td>
                  <td>
                    <div className="vlan-cell">
                      <span className="vlan-dot" style={{ background: vlan ? vlan.color : 'transparent', borderColor: vlan ? vlan.color : 'var(--line)' }} />
                      <select value={r.vlan_id ?? ''} onChange={(e) => { const vlan_id = e.target.value === '' ? null : Number(e.target.value); patchPort(r.port_id, { vlan_id }); savePort(r.port_id, { vlan_id }); }}>
                        <option value="">—</option>
                        {vlans.map((v) => (<option key={v.id} value={v.id}>{v.tag}{v.name ? ` · ${v.name}` : ''}</option>))}
                      </select>
                    </div>
                  </td>
                  {textCell(r, i, 'ip')}
                  {textCell(r, i, 'mac')}
                  {textCell(r, i, 'client')}
                  {textCell(r, i, 'label')}
                  {textCell(r, i, 'notes')}
                  <td className="muted lv-link">{r.link}</td>
                </tr>
              );
            })}
            {!loading && display.length === 0 && (
              <tr><td colSpan={14} className="muted lv-empty">{rows.length === 0 ? 'No ports yet — add switches or patch panels in the rack view.' : 'No ports match the current filter.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {vlanOpen && (
        <VlanManager projectId={projectId} vlans={vlans} onClose={() => setVlanOpen(false)} onChanged={load} />
      )}
      {exportOpen && (
        <ExportDialog projectName={projectName} rows={rows} vlans={vlans} devices={devices} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}
