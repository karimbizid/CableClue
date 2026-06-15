import { useCallback, useEffect, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { api } from './api';
import { TEMPLATES } from './templates';
import type { Device, DeviceTemplate, Port, Project, Rack, RackSummary, Selection } from './types';
import { Library } from './components/Library';
import { RackView } from './components/RackView';
import { ListView } from './components/ListView';
import { Inspector } from './components/Inspector';
import { VlanManager } from './components/VlanManager';
import { DeleteDeviceModal } from './components/DeleteDeviceModal';
import { ImportDialog } from './components/ImportDialog';
import { ProjectWindow } from './components/ProjectWindow';

const THEME_KEY = 'cableclue.theme';
const CABLE_COLORS = ['#e3b341', '#58a6ff', '#3fb950', '#f85149', '#a371f7', '#ec6cb9'];

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);

  const [racks, setRacks] = useState<RackSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [rack, setRack] = useState<Rack | null>(null);

  const [libraryOpen, setLibraryOpen] = useState(true);
  const [draggingTemplate, setDraggingTemplate] = useState<DeviceTemplate | null>(null);

  const [viewMode, setViewMode] = useState<'rack' | 'list'>('rack');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showCables, setShowCables] = useState(true);
  const [pendingPort, setPendingPort] = useState<{ portId: number; deviceId: number } | null>(null);
  const [vlanOpen, setVlanOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [version, setVersion] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // ----- Theme + version -------------------------------------------------
  useEffect(() => {
    const saved = (localStorage.getItem(THEME_KEY) as 'dark' | 'light') || 'dark';
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);
  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.dataset.theme = next;
  }
  useEffect(() => {
    api.getVersion().then((v) => setVersion(v.version)).catch(() => {});
  }, []);

  // ----- Projects (start on the project window) --------------------------
  const refreshProjects = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    return list;
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // Load the active project's racks. A freshly opened, empty project gets a
  // first rack so it feels like a clean start.
  useEffect(() => {
    if (activeProjectId == null) {
      setRacks([]);
      setActiveId(null);
      setRack(null);
      return;
    }
    (async () => {
      let list = await api.listRacks(activeProjectId);
      if (list.length === 0) {
        await api.createRack(activeProjectId, 'Rack 1');
        list = await api.listRacks(activeProjectId);
      }
      setRacks(list);
      setActiveId(list[0]?.id ?? null);
      setSelection(null);
      setPendingPort(null);
    })();
  }, [activeProjectId]);

  const refreshRacks = useCallback(async () => {
    if (activeProjectId == null) return [];
    const list = await api.listRacks(activeProjectId);
    setRacks(list);
    return list;
  }, [activeProjectId]);

  const loadRack = useCallback(async (id: number) => {
    setRack(await api.getRack(id));
  }, []);

  useEffect(() => {
    if (activeId != null) loadRack(activeId);
    setSelection(null);
    setPendingPort(null);
  }, [activeId, loadRack]);

  const reload = useCallback(() => {
    if (activeId != null) loadRack(activeId);
  }, [activeId, loadRack]);

  // ----- Project actions -------------------------------------------------
  async function newProject() {
    const name = prompt('Project name', `Project ${projects.length + 1}`);
    if (!name) return;
    const p = await api.createProject(name);
    await refreshProjects();
    setActiveProjectId(p.id); // open it straight away
  }
  async function renameProject(id: number) {
    const cur = projects.find((p) => p.id === id);
    const name = prompt('Project name', cur?.name);
    if (!name || name === cur?.name) return;
    await api.updateProject(id, name);
    refreshProjects();
  }
  async function deleteProject(id: number) {
    const cur = projects.find((p) => p.id === id);
    if (!confirm(`Delete project "${cur?.name}" and ALL its racks, VLANs and links? This cannot be undone.`))
      return;
    await api.deleteProject(id);
    await refreshProjects();
    if (id === activeProjectId) setActiveProjectId(null);
  }
  async function exportProject(id: number) {
    const data = await api.exportProject(id);
    const cur = projects.find((p) => p.id === id);
    const safe = (cur?.name || 'project').replace(/[^a-z0-9-_]+/gi, '_');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.cableclue.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ----- Rack tabs -------------------------------------------------------
  async function addRack() {
    if (activeProjectId == null) return;
    const created = await api.createRack(activeProjectId, `Rack ${racks.length + 1}`);
    await refreshRacks();
    setActiveId(created.id);
  }
  async function renameRack(id: number, name: string) {
    await api.updateRack(id, { name });
    await refreshRacks();
    if (id === activeId) reload();
  }
  async function removeRack(id: number) {
    if (!confirm('Delete this rack and everything in it?')) return;
    await api.deleteRack(id);
    const list = await refreshRacks();
    if (id === activeId) setActiveId(list[0]?.id ?? null);
  }

  // ----- Selection & links ----------------------------------------------
  function selectDevice(d: Device) {
    setSelection({ type: 'device', id: d.id });
  }
  async function onPortClick(p: Port, d: Device) {
    if (linkMode) {
      if (!pendingPort) {
        setPendingPort({ portId: p.id, deviceId: d.id });
        setSelection({ type: 'port', id: p.id, deviceId: d.id });
      } else if (pendingPort.portId === p.id) {
        setPendingPort(null);
      } else if (rack) {
        const color = CABLE_COLORS[rack.cables.length % CABLE_COLORS.length];
        await api.createCable(rack.id, pendingPort.portId, p.id, color);
        setPendingPort(null);
        reload();
      }
      return;
    }
    setSelection({ type: 'port', id: p.id, deviceId: d.id });
  }
  function startLinkFromPort(portId: number, deviceId: number) {
    setLinkMode(true);
    setEditMode(false);
    setPendingPort({ portId, deviceId });
  }
  function toggleLinkMode() {
    setLinkMode((v) => !v);
    setEditMode(false);
    setPendingPort(null);
  }
  function toggleEditMode() {
    setEditMode((v) => !v);
    setLinkMode(false);
    setPendingPort(null);
  }

  // ----- Drag & drop -----------------------------------------------------
  function onDragStart(e: DragStartEvent) {
    setDraggingTemplate((e.active.data.current?.template as DeviceTemplate) ?? null);
  }
  async function onDragEnd(e: DragEndEvent) {
    setDraggingTemplate(null);
    const data = e.active.data.current;
    const overId = e.over?.id;
    if (!rack || typeof overId !== 'string' || !overId.startsWith('u:')) return;
    const topU = parseInt(overId.slice(2), 10);

    if (data?.kind === 'device') {
      const dev = rack.devices.find((d) => d.id === data.deviceId);
      if (dev && dev.position_u !== topU && canPlace(rack, topU, dev.size_u, dev.id)) {
        await api.updateDevice(dev.id, { position_u: topU });
        reload();
      }
      return;
    }

    const tpl = data?.template as DeviceTemplate | undefined;
    if (!tpl || !canPlace(rack, topU, tpl.size_u)) return;
    await api.createDevice(rack.id, {
      type: tpl.type,
      port_count: tpl.port_count,
      size_u: tpl.size_u,
      position_u: topU,
    });
    reload();
  }

  const selectedDeviceId = selection?.type === 'device' ? selection.id : null;
  const selectedPortId = selection?.type === 'port' ? selection.id : null;
  const selectedCableId = selection?.type === 'cable' ? selection.id : null;
  const activeProject = projects.find((p) => p.id === activeProjectId) || null;

  let pendingInfo: { name: string; nr: number } | null = null;
  if (pendingPort && rack) {
    const d = rack.devices.find((x) => x.id === pendingPort.deviceId);
    const p = d?.ports.find((x) => x.id === pendingPort.portId);
    if (d && p) pendingInfo = { name: d.name || d.type, nr: p.port_nr };
  }

  const importDialog = importOpen && (
    <ImportDialog
      projects={projects}
      currentProject={activeProject}
      onClose={() => setImportOpen(false)}
      onImported={async (openId) => {
        setImportOpen(false);
        await refreshProjects();
        if (openId != null) {
          if (openId === activeProjectId) {
            await refreshRacks();
            reload();
          } else {
            setActiveProjectId(openId);
          }
        }
      }}
    />
  );

  // ----- Project window (no project open) --------------------------------
  if (activeProjectId == null) {
    return (
      <>
        <ProjectWindow
          projects={projects}
          version={version}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpen={(id) => {
            setViewMode('rack');
            setActiveProjectId(id);
          }}
          onNew={newProject}
          onImport={() => setImportOpen(true)}
          onExport={exportProject}
          onRename={renameProject}
          onDelete={deleteProject}
        />
        {importDialog}
      </>
    );
  }

  // ----- Workspace (a project is open) -----------------------------------
  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <img src="/logo.png" alt="CableClue" className="logo-img" />
          </div>

          <div className="head-stack">
            <div className="project-bar">
              <button className="back-btn" onClick={() => setActiveProjectId(null)} title="Back to projects">
                ← Projects
              </button>
              <span className="ws-project">{activeProject?.name}</span>
              <span className="view-toggle">
                <button
                  className={viewMode === 'rack' ? 'active' : ''}
                  onClick={() => {
                    setViewMode('rack');
                    reload();
                  }}
                >
                  Rack
                </button>
                <button
                  className={viewMode === 'list' ? 'active' : ''}
                  onClick={() => setViewMode('list')}
                >
                  List
                </button>
              </span>
            </div>
            {viewMode === 'rack' && (
            <nav className="tabs">
              {racks.map((r) => (
                <div
                  key={r.id}
                  className={`tab ${r.id === activeId ? 'active' : ''}`}
                  onClick={() => setActiveId(r.id)}
                  onDoubleClick={() => {
                    const name = prompt('Rack name', r.name);
                    if (name && name !== r.name) renameRack(r.id, name);
                  }}
                >
                  <span>{r.name}</span>
                  <button
                    className="tab-close"
                    title="Delete rack"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      removeRack(r.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button className="tab-add" onClick={addRack} title="Add rack">
                +
              </button>
            </nav>
            )}
          </div>

          <div className="status-group">
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
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle light / dark">
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </header>

        {viewMode === 'list' ? (
          <div className="body">
            <ListView projectId={activeProjectId} />
          </div>
        ) : (
        <div className="body">
          {libraryOpen && <Library templates={TEMPLATES} />}
          <main className="canvas">
            <div className="canvas-toolbar">
              <button className="tool-btn" onClick={() => setLibraryOpen((v) => !v)} title="Toggle library">
                ☰
              </button>
              <button
                className={`tool-btn ${editMode ? 'active' : ''}`}
                onClick={toggleEditMode}
                title="Edit mode: drag devices to reposition them"
              >
                ✥ Edit mode
              </button>
              <button
                className={`tool-btn ${linkMode ? 'active' : ''}`}
                onClick={toggleLinkMode}
                title="Link mode: click any two ports to link them"
              >
                🔌 Link mode
              </button>
              <button
                className={`tool-btn ${showCables ? 'active' : ''}`}
                onClick={() => setShowCables((v) => !v)}
                title="Show or hide the cables overlay"
              >
                {showCables ? '〰 Cables: on' : '〰 Cables: off'}
              </button>
              {editMode && (
                <span className="link-banner edit">Drag any device to reposition it in the rack.</span>
              )}
              {linkMode && (
                <span className="link-banner">
                  {pendingInfo ? (
                    <>
                      Linking from <b>{pendingInfo.name} · port {pendingInfo.nr}</b> — click the target
                      port
                    </>
                  ) : (
                    'Click the first port…'
                  )}
                  {pendingPort && (
                    <button className="link-cancel" onClick={() => setPendingPort(null)}>
                      Cancel
                    </button>
                  )}
                </span>
              )}
              {rack && (
                <button className="tool-btn" onClick={() => setVlanOpen(true)}>
                  VLANs ({rack.vlans.length})
                </button>
              )}
            </div>
            <div className="canvas-scroll">
              {rack ? (
                <RackView
                  rack={rack}
                  selectedDeviceId={selectedDeviceId}
                  selectedPortId={selectedPortId}
                  pendingPortId={pendingPort?.portId ?? null}
                  selectedCableId={selectedCableId}
                  linkMode={linkMode}
                  editMode={editMode}
                  showCables={showCables}
                  onDeviceClick={selectDevice}
                  onPortClick={onPortClick}
                  onDeleteDevice={(id) => {
                    const d = rack.devices.find((x) => x.id === id);
                    if (d) setDeleteTarget(d);
                  }}
                  onSelectCable={(id) => setSelection({ type: 'cable', id })}
                />
              ) : (
                <p className="empty">No rack in this project yet — add one with the “+”.</p>
              )}
            </div>
          </main>
          {rack && (
            <Inspector
              rack={rack}
              selection={selection}
              onReload={reload}
              onClear={() => setSelection(null)}
              onStartCable={startLinkFromPort}
              onRequestDelete={(d) => setDeleteTarget(d)}
            />
          )}
        </div>
        )}
      </div>

      <DragOverlay>
        {draggingTemplate && <div className="lib-item dragging">{draggingTemplate.label}</div>}
      </DragOverlay>

      {vlanOpen && rack && (
        <VlanManager rack={rack} onClose={() => setVlanOpen(false)} onChanged={reload} />
      )}

      {deleteTarget && (
        <DeleteDeviceModal
          device={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const id = deleteTarget.id;
            await api.deleteDevice(id);
            if (
              (selection?.type === 'device' && selection.id === id) ||
              (selection?.type === 'port' && selection.deviceId === id)
            ) {
              setSelection(null);
            }
            setDeleteTarget(null);
            reload();
          }}
        />
      )}

      {importDialog}
    </DndContext>
  );
}

function canPlace(rack: Rack, topU: number, size: number, excludeId?: number): boolean {
  if (topU < 1 || topU + size - 1 > rack.height_u) return false;
  const occupied = new Set<number>();
  for (const d of rack.devices) {
    if (d.id === excludeId) continue;
    for (let u = d.position_u; u < d.position_u + d.size_u; u++) occupied.add(u);
  }
  for (let u = topU; u < topU + size; u++) {
    if (occupied.has(u)) return false;
  }
  return true;
}
