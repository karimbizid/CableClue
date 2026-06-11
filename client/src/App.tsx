import { useCallback, useEffect, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { api } from './api';
import { TEMPLATES } from './templates';
import type { Device, DeviceTemplate, Port, Rack, RackSummary } from './types';
import { Library } from './components/Library';
import { RackView } from './components/RackView';
import { DeviceInspector } from './components/DeviceInspector';
import { PortPopup } from './components/PortPopup';
import { VlanManager } from './components/VlanManager';

export default function App() {
  const [racks, setRacks] = useState<RackSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [rack, setRack] = useState<Rack | null>(null);

  const [libraryOpen, setLibraryOpen] = useState(true);
  const [draggingTemplate, setDraggingTemplate] = useState<DeviceTemplate | null>(null);

  const [inspectDevice, setInspectDevice] = useState<Device | null>(null);
  const [editPort, setEditPort] = useState<{ port: Port; device: Device } | null>(null);
  const [vlanOpen, setVlanOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const loadRacks = useCallback(async () => {
    const list = await api.listRacks();
    setRacks(list);
    return list;
  }, []);

  const loadRack = useCallback(async (id: number) => {
    const full = await api.getRack(id);
    setRack(full);
  }, []);

  // Initial load: fetch racks and open the first one (or create one).
  useEffect(() => {
    (async () => {
      let list = await loadRacks();
      if (list.length === 0) {
        const created = await api.createRack('Rack 1');
        list = await loadRacks();
        setActiveId(created.id);
      } else {
        setActiveId(list[0].id);
      }
    })();
  }, [loadRacks]);

  useEffect(() => {
    if (activeId != null) loadRack(activeId);
  }, [activeId, loadRack]);

  const reload = useCallback(() => {
    if (activeId != null) loadRack(activeId);
  }, [activeId, loadRack]);

  // ----- Rack tab actions -------------------------------------------------
  async function addRack() {
    const created = await api.createRack(`Rack ${racks.length + 1}`);
    await loadRacks();
    setActiveId(created.id);
  }

  async function renameRack(id: number, name: string) {
    await api.updateRack(id, { name });
    await loadRacks();
    if (id === activeId) reload();
  }

  async function removeRack(id: number) {
    if (!confirm('Delete this rack and everything in it?')) return;
    await api.deleteRack(id);
    const list = await loadRacks();
    if (id === activeId) setActiveId(list[0]?.id ?? null);
  }

  // ----- Drag & drop ------------------------------------------------------
  function onDragStart(e: DragStartEvent) {
    const tpl = e.active.data.current?.template as DeviceTemplate | undefined;
    setDraggingTemplate(tpl ?? null);
  }

  async function onDragEnd(e: DragEndEvent) {
    setDraggingTemplate(null);
    const tpl = e.active.data.current?.template as DeviceTemplate | undefined;
    const overId = e.over?.id;
    if (!tpl || !rack || typeof overId !== 'string' || !overId.startsWith('u:')) return;

    const topU = parseInt(overId.slice(2), 10);
    if (!canPlace(rack, topU, tpl.size_u)) return;

    await api.createDevice(rack.id, {
      type: tpl.type,
      port_count: tpl.port_count,
      size_u: tpl.size_u,
      position_u: topU,
    });
    reload();
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="app">
        <header className="topbar">
          <button className="lib-toggle" onClick={() => setLibraryOpen((v) => !v)} title="Toggle library">
            ☰
          </button>
          <span className="brand">CableClue</span>
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
          {rack && (
            <button className="vlan-btn" onClick={() => setVlanOpen(true)}>
              VLANs ({rack.vlans.length})
            </button>
          )}
        </header>

        <div className="body">
          {libraryOpen && <Library templates={TEMPLATES} />}
          <main className="canvas">
            {rack ? (
              <RackView
                rack={rack}
                onDeviceClick={(d) => setInspectDevice(d)}
                onPortClick={(port, device) => setEditPort({ port, device })}
                onDeleteDevice={async (id) => {
                  await api.deleteDevice(id);
                  reload();
                }}
              />
            ) : (
              <p className="empty">No rack selected.</p>
            )}
          </main>
        </div>
      </div>

      <DragOverlay>
        {draggingTemplate && <div className="lib-item dragging">{draggingTemplate.label}</div>}
      </DragOverlay>

      {inspectDevice && (
        <DeviceInspector
          device={inspectDevice}
          onClose={() => setInspectDevice(null)}
          onSaved={() => {
            setInspectDevice(null);
            reload();
          }}
        />
      )}

      {editPort && rack && (
        <PortPopup
          port={editPort.port}
          device={editPort.device}
          vlans={rack.vlans}
          onClose={() => setEditPort(null)}
          onSaved={() => {
            setEditPort(null);
            reload();
          }}
        />
      )}

      {vlanOpen && rack && (
        <VlanManager
          rack={rack}
          onClose={() => setVlanOpen(false)}
          onChanged={reload}
        />
      )}
    </DndContext>
  );
}

// True if a device of `size` U starting at `topU` fits within the rack and
// does not overlap an existing device.
function canPlace(rack: Rack, topU: number, size: number): boolean {
  if (topU < 1 || topU + size - 1 > rack.height_u) return false;
  const occupied = new Set<number>();
  for (const d of rack.devices) {
    for (let u = d.position_u; u < d.position_u + d.size_u; u++) occupied.add(u);
  }
  for (let u = topU; u < topU + size; u++) {
    if (occupied.has(u)) return false;
  }
  return true;
}
