import { useState } from 'react';
import type { Device } from '../types';

export function DeleteDeviceModal({
  device,
  onCancel,
  onConfirm,
}: {
  device: Device;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const typeLabel =
    device.type === 'switch' ? 'Switch' : device.type === 'patch' ? 'Patch panel' : 'Blind panel';
  const top = device.position_u + device.size_u - 1;
  const range = device.size_u > 1 ? `U${device.position_u}–${top}` : `U${device.position_u}`;
  const target = device.name.trim() || `${typeLabel} (${range})`;
  const phrase = `DELETE ${target}`;
  const ready = text === phrase;

  async function confirm() {
    if (!ready) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Delete {typeLabel.toLowerCase()}</h2>
          <button className="modal-close" onClick={onCancel}>
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="danger-note">
            You are about to permanently delete <b>{target}</b>. This also removes everything
            attached to it:
          </p>
          <ul className="danger-list">
            <li>all VLAN assignments on its ports</li>
            <li>all links (cables) to and from its ports</li>
            <li>all client / IP data on its ports</li>
          </ul>
          <p className="danger-note">This cannot be undone.</p>
          <label>
            <span>
              Type <code>{phrase}</code> to confirm
            </span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={phrase}
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        </div>
        <footer className="modal-foot">
          <button onClick={onCancel}>Cancel</button>
          <button className="danger-btn" onClick={confirm} disabled={!ready || busy}>
            {busy ? 'Deleting…' : 'Delete device'}
          </button>
        </footer>
      </div>
    </div>
  );
}
