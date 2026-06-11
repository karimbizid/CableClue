import { useState } from 'react';
import { api } from '../api';
import type { Rack } from '../types';

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export function VlanManager({
  rack,
  onClose,
  onChanged,
}: {
  rack: Rack;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLORS[rack.vlans.length % DEFAULT_COLORS.length]);

  async function add() {
    const tagNum = parseInt(tag, 10);
    if (!Number.isFinite(tagNum)) return;
    await api.createVlan(rack.id, { tag: tagNum, name, color });
    setTag('');
    setName('');
    onChanged();
  }

  async function remove(id: number) {
    await api.deleteVlan(id);
    onChanged();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>VLANs · {rack.name}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <table className="vlan-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Name</th>
                <th>Color</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rack.vlans.map((v) => (
                <tr key={v.id}>
                  <td>{v.tag}</td>
                  <td>{v.name || <em>—</em>}</td>
                  <td>
                    <span className="swatch" style={{ background: v.color }} />
                  </td>
                  <td>
                    <button className="link-danger" onClick={() => remove(v.id)}>delete</button>
                  </td>
                </tr>
              ))}
              {rack.vlans.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">No VLANs yet.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="vlan-add">
            <input
              type="number"
              placeholder="Tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              style={{ width: 80 }}
            />
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              title="Color"
            />
            <button className="primary" onClick={add}>Add</button>
          </div>
        </div>
        <footer className="modal-foot">
          <button onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}
