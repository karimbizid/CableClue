import type { Project } from '../types';

export function ProjectWindow({
  projects,
  version,
  theme,
  onToggleTheme,
  onOpen,
  onNew,
  onImport,
  onExport,
  onRename,
  onDelete,
}: {
  projects: Project[];
  version: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpen: (id: number) => void;
  onNew: () => void;
  onImport: () => void;
  onExport: (id: number) => void;
  onRename: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="project-window">
      <div className="pw-top">
        {version && <span className="version">v{version}</span>}
        <a
          className="gh-link"
          href="https://github.com/karimbizid/CableClue"
          target="_blank"
          rel="noopener noreferrer"
          title="View on GitHub"
        >
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
        <button className="theme-toggle" onClick={onToggleTheme} title="Toggle light / dark">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>

      <div className="pw-center">
        <img className="pw-logo" src="/logo.png" alt="CableClue" />

        <div className="pw-card">
          <div className="pw-head">
            <h1>Projects</h1>
            <div className="pw-head-actions">
              <button onClick={onImport}>⬆ Import</button>
              <button className="primary" onClick={onNew}>＋ New project</button>
            </div>
          </div>

          <div className="pw-list">
            {projects.length === 0 && (
              <p className="insp-hint">No projects yet — create one or import a file.</p>
            )}
            {projects.map((p) => (
              <div className="pw-row" key={p.id}>
                <button className="pw-open" onClick={() => onOpen(p.id)} title="Open project">
                  {p.name}
                </button>
                <div className="pw-row-actions">
                  <button onClick={() => onExport(p.id)} title="Download project">⬇</button>
                  <button onClick={() => onRename(p.id)} title="Rename project">✎</button>
                  <button onClick={() => onDelete(p.id)} title="Delete project">🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
