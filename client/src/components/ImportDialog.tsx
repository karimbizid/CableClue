import { useRef, useState, type ChangeEvent } from 'react';
import { api } from '../api';
import type { Project } from '../types';

type ExportData = {
  format?: string;
  project?: { name?: string };
  vlans?: unknown[];
  racks?: unknown[];
};

export function ImportDialog({
  projects,
  currentProject,
  onClose,
  onImported,
}: {
  projects: Project[];
  currentProject: Project | null;
  onClose: () => void;
  onImported: (openProjectId?: number) => void;
}) {
  const [data, setData] = useState<ExportData | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'new' | 'merge'>('new');
  const [parts, setParts] = useState({ racks: true, vlans: true });
  const [sourceProjectId, setSourceProjectId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>(
    currentProject ? String(currentProject.id) : projects[0] ? String(projects[0].id) : ''
  );
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function accept(parsed: unknown, name: string) {
    const d = parsed as ExportData;
    if (!d || d.format !== 'cableclue' || !Array.isArray(d.racks)) {
      setError('That file is not a CableClue export.');
      setData(null);
      return;
    }
    setError('');
    setData(d);
    setSourceName(d.project?.name || name);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      accept(JSON.parse(await file.text()), file.name);
    } catch {
      setError('Could not read that file as JSON.');
      setData(null);
    }
  }

  async function loadFromProject() {
    if (!sourceProjectId) return;
    setBusy(true);
    try {
      const exported = await api.exportProject(Number(sourceProjectId));
      const proj = projects.find((p) => p.id === Number(sourceProjectId));
      accept(exported, proj?.name || 'project');
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!data) return;
    setBusy(true);
    try {
      if (mode === 'new') {
        const p = await api.importNewProject(data, sourceName);
        onImported(p.id);
      } else if (targetId) {
        await api.importIntoProject(Number(targetId), data, parts);
        onImported(Number(targetId));
      }
    } finally {
      setBusy(false);
    }
  }

  const counts = data
    ? `${data.racks?.length ?? 0} rack(s), ${data.vlans?.length ?? 0} VLAN(s)`
    : '';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Import</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <div className="insp-section">1 · Source</div>
          <div className="import-source">
            <button onClick={() => fileRef.current?.click()}>Choose file…</button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={onFile}
            />
            <span className="or">or</span>
            <select value={sourceProjectId} onChange={(e) => setSourceProjectId(e.target.value)}>
              <option value="">a project in this instance…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button onClick={loadFromProject} disabled={!sourceProjectId || busy}>
              Load
            </button>
          </div>
          {error && <p className="import-error">{error}</p>}
          {data && (
            <p className="import-ok">
              Loaded <b>{sourceName}</b> — {counts}
            </p>
          )}

          {data && (
            <>
              <div className="insp-section">2 · Destination</div>
              <label className="radio">
                <input
                  type="radio"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                />
                Import as a new project
              </label>
              <label className="radio">
                <input
                  type="radio"
                  checked={mode === 'merge'}
                  disabled={projects.length === 0}
                  onChange={() => setMode('merge')}
                />
                Merge into an existing project
              </label>
              {mode === 'merge' && (
                <div className="import-parts">
                  <label className="check" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}>
                    Target project
                    <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={parts.racks}
                      onChange={(e) => setParts((p) => ({ ...p, racks: e.target.checked }))}
                    />
                    Racks (layout, devices, ports &amp; links)
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={parts.vlans}
                      onChange={(e) => setParts((p) => ({ ...p, vlans: e.target.checked }))}
                    />
                    VLAN definitions
                  </label>
                  <p className="hint">Existing VLANs with the same tag are kept; nothing is overwritten.</p>
                </div>
              )}
            </>
          )}
        </div>
        <footer className="modal-foot">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={doImport}
            disabled={
              !data ||
              busy ||
              (mode === 'merge' && (!targetId || (!parts.racks && !parts.vlans)))
            }
          >
            {busy ? 'Importing…' : 'Import'}
          </button>
        </footer>
      </div>
    </div>
  );
}
