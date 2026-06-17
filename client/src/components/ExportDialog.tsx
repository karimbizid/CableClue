import { useMemo, useState } from 'react';
import type { PortRow, Vlan } from '../types';
import { POE_STANDARDS } from '../poe';

const COLUMNS = [
  'Rack', 'Device', 'Mgmt IP', 'Port', 'Type', 'Status', 'PoE',
  'VLAN', 'IP address', 'MAC', 'Client', 'Label', 'Notes', 'Link',
];

type DeviceChip = { id: number; label: string; type: string };

export function ExportDialog({
  projectName,
  rows,
  vlans,
  devices,
  onClose,
}: {
  projectName: string;
  rows: PortRow[];
  vlans: Vlan[];
  devices: DeviceChip[];
  onClose: () => void;
}) {
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf'>('csv');
  const [scope, setScope] = useState<'all' | 'sel'>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const vlanLabel = (r: PortRow) => {
    const v = vlans.find((x) => x.id === r.vlan_id);
    return v ? `${v.tag}${v.name ? ` · ${v.name}` : ''}` : '';
  };

  const matrix = useMemo(() => {
    const sel = scope === 'sel' ? rows.filter((r) => selected.has(r.device_id)) : rows;
    return sel.map((r) => [
      r.rack_name,
      r.device_name || '',
      r.mgmt_ip,
      r.port_nr,
      r.device_type,
      r.ip || r.client || r.vlan_id != null ? 'occupied' : 'free',
      r.poe ? POE_STANDARDS.find((s) => s.key === r.poe)?.label ?? r.poe : '',
      vlanLabel(r),
      r.ip,
      r.mac,
      r.client,
      r.label,
      r.notes,
      r.link,
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, vlans, scope, selected]);

  const fileBase = (projectName || 'project').replace(/[^a-z0-9-_]+/gi, '_');

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function logoDataUrl(): Promise<string | null> {
    try {
      const res = await fetch('/logo.png');
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  async function doExport() {
    setBusy(true);
    try {
      if (format === 'csv') {
        const esc = (v: unknown) => {
          const s = String(v ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csv = [COLUMNS, ...matrix].map((r) => r.map(esc).join(',')).join('\r\n');
        download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`);
      } else if (format === 'xlsx') {
        const XLSX = await import('xlsx');
        const aoa = [
          ['CableClue'],
          [`Project: ${projectName}`],
          [`Exported: ${new Date().toLocaleString()}`],
          [],
          COLUMNS,
          ...matrix,
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = COLUMNS.map(() => ({ wch: 16 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Ports');
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        download(
          new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
          `${fileBase}.xlsx`
        );
      } else {
        const { jsPDF } = await import('jspdf');
        const autoTable = (await import('jspdf-autotable')).default;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        const logo = await logoDataUrl();
        if (logo) {
          try {
            doc.addImage(logo, 'PNG', 40, 22, 38, 38);
          } catch {
            /* ignore image failures */
          }
        }
        doc.setFontSize(16);
        doc.text('CableClue', 88, 40);
        doc.setFontSize(10);
        doc.setTextColor(120);
        doc.text(`Project: ${projectName}    Exported: ${new Date().toLocaleString()}`, 88, 56);
        doc.setTextColor(0);
        autoTable(doc, {
          head: [COLUMNS],
          body: matrix as (string | number)[][],
          startY: 74,
          styles: { fontSize: 7, cellPadding: 3 },
          headStyles: { fillColor: [37, 99, 235] },
        });
        doc.save(`${fileBase}.pdf`);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Export list</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <div className="insp-section">Format</div>
          <div className="seg">
            {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
              <button key={f} className={format === f ? 'active' : ''} onClick={() => setFormat(f)}>
                {f === 'csv' ? 'CSV' : f === 'xlsx' ? 'Excel' : 'PDF'}
              </button>
            ))}
          </div>
          {(format === 'pdf' || format === 'xlsx') && (
            <p className="hint">{format.toUpperCase()} includes CableClue branding (logo &amp; title).</p>
          )}

          <div className="insp-section">Scope</div>
          <label className="radio">
            <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
            Whole project ({devices.length} devices)
          </label>
          <label className="radio">
            <input type="radio" checked={scope === 'sel'} onChange={() => setScope('sel')} />
            Selected devices
          </label>
          {scope === 'sel' && (
            <div className="export-devices">
              {devices.map((d) => (
                <label key={d.id} className="check">
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                  {d.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <footer className="modal-foot">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={doExport}
            disabled={busy || matrix.length === 0 || (scope === 'sel' && selected.size === 0)}
          >
            {busy ? 'Exporting…' : `Export ${matrix.length} rows`}
          </button>
        </footer>
      </div>
    </div>
  );
}
