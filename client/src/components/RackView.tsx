import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Cable, Device, Port, Rack, Vlan } from '../types';

const ROW_H = 54; // pixels per rack unit

type HoverState = { port: Port; vlan: Vlan | undefined; x: number; y: number } | null;

function USlot({ u }: { u: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `u:${u}` });
  return (
    <div ref={setNodeRef} className={`u-slot ${isOver ? 'over' : ''}`} style={{ height: ROW_H }}>
      <span className="u-num">{u}</span>
      <span className="u-empty">empty</span>
    </div>
  );
}

// A single RJ45 / keystone jack drawn as SVG so it stays crisp and clickable.
function Jack({
  port,
  vlan,
  variant,
  showNum,
  selected,
  pending,
  editMode,
  linkBadge,
  onClick,
  onHover,
  onLeave,
}: {
  port: Port;
  vlan: Vlan | undefined;
  variant: 'switch' | 'patch';
  showNum: boolean;
  selected: boolean;
  pending: boolean;
  editMode: boolean;
  linkBadge: boolean;
  onClick: () => void;
  onHover: (e: MouseEvent) => void;
  onLeave: () => void;
}) {
  const occupied = Boolean(port.client || port.ip);

  return (
    <button
      className={`jack ${occupied ? 'occupied' : ''} ${selected ? 'sel' : ''} ${pending ? 'pending' : ''}`}
      data-port-id={port.id}
      title=""
      style={editMode ? { pointerEvents: 'none' } : undefined}
      // Act on pointer-down: it fires reliably inside the dnd context, whereas
      // the synthetic click can get dropped by re-renders during the press.
      onPointerDown={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={onHover}
      onMouseMove={onHover}
      onMouseLeave={onLeave}
    >
      <svg viewBox="0 0 20 18" width="18" height="16" aria-hidden>
        {/* jack body — themed via CSS; a VLAN tints it inline */}
        <rect
          className="jack-body"
          x="1.5"
          y="2.5"
          width="17"
          height="13"
          rx="1.6"
          strokeWidth="1"
          style={vlan ? { fill: vlan.color, stroke: vlan.color } : undefined}
        />
        {/* gold contacts */}
        <g stroke="#caa24a" strokeWidth="0.7" opacity={vlan ? 0.85 : 0.55}>
          <line x1="4" y1="4" x2="4" y2="7" />
          <line x1="6.5" y1="4" x2="6.5" y2="7" />
          <line x1="9" y1="4" x2="9" y2="7" />
          <line x1="11.5" y1="4" x2="11.5" y2="7" />
          <line x1="14" y1="4" x2="14" y2="7" />
          <line x1="16.5" y1="4" x2="16.5" y2="7" />
        </g>
        {/* tab slot at the bottom */}
        <rect x="7.5" y="12" width="5" height="3.5" rx="0.6" fill="#05070a" opacity="0.8" />
        {/* link LED (switches only) */}
        {variant === 'switch' && !linkBadge && (
          <circle cx="10" cy="9.6" r="1.5" fill={occupied ? '#22c55e' : '#1f2937'} />
        )}
        {/* "L" badge shown when the cables overlay is hidden */}
        {linkBadge && (
          <text className="link-badge-text" x="10" y="12" textAnchor="middle">
            L
          </text>
        )}
      </svg>
      {showNum && <span className="pnum">{port.port_nr}</span>}
    </button>
  );
}

function DeviceFace({
  device,
  vlanById,
  selectedDeviceId,
  selectedPortId,
  pendingPortId,
  editMode,
  linkedPortIds,
  showCables,
  onDeviceClick,
  onPortClick,
  onDelete,
  setHover,
}: {
  device: Device;
  vlanById: Map<number, Vlan>;
  selectedDeviceId: number | null;
  selectedPortId: number | null;
  pendingPortId: number | null;
  editMode: boolean;
  linkedPortIds: Set<number>;
  showCables: boolean;
  onDeviceClick: (d: Device) => void;
  onPortClick: (p: Port, d: Device) => void;
  onDelete: (id: number) => void;
  setHover: (h: HoverState) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `dev:${device.id}`,
    data: { kind: 'device', deviceId: device.id, size_u: device.size_u },
    disabled: !editMode,
  });
  const top = device.position_u + device.size_u - 1;
  const range = device.size_u > 1 ? `${device.position_u}–${top}` : `${device.position_u}`;

  // Pair ports into columns: odd number on top, even on the bottom.
  const columns: Array<{ topPort?: Port; botPort?: Port }> = [];
  for (let i = 0; i < device.ports.length; i += 2) {
    columns.push({ topPort: device.ports[i], botPort: device.ports[i + 1] });
  }

  const variant: 'switch' | 'patch' = device.type === 'patch' ? 'patch' : 'switch';
  const showNum = device.ports.length <= 24;

  const hoverHandler = (port: Port) => (e: MouseEvent) =>
    setHover({ port, vlan: port.vlan_id != null ? vlanById.get(port.vlan_id) : undefined, x: e.clientX, y: e.clientY });

  const dragProps = editMode
    ? { ...listeners, ...attributes }
    : { onPointerDown: () => onDeviceClick(device) };

  return (
    <div
      ref={setNodeRef}
      className={`device face ${device.type} ${device.id === selectedDeviceId ? 'sel' : ''} ${
        editMode ? 'editable' : ''
      } ${isDragging ? 'dragging' : ''}`}
      style={{
        height: device.size_u * ROW_H,
        ...(transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 20, position: 'relative' }
          : null),
      }}
      {...dragProps}
    >
      <div className="face-info">
        <div className="face-leds">
          <span className="sysled green" />
          <span className="sysled amber" />
        </div>
        <div className="face-text">
          <span className="face-name">
            {device.name || <em>{device.type === 'blank' ? 'Blind panel' : 'unnamed'}</em>}
          </span>
          <span className="face-sub">
            {device.type === 'switch' ? 'SWITCH' : device.type === 'patch' ? 'PATCH' : 'BLANK'}
            {device.mgmt_ip ? ` · ${device.mgmt_ip}` : ''}
          </span>
        </div>
      </div>

      {device.type === 'blank' ? (
        <div className="face-vents">
          {Array.from({ length: device.size_u * 3 }).map((_, i) => (
            <span key={i} className="vent" />
          ))}
        </div>
      ) : (
        <div className="face-ports">
          {columns.map((col, i) => (
            <div className="port-col" key={i}>
              {col.topPort ? (
                <Jack
                  port={col.topPort}
                  vlan={col.topPort.vlan_id != null ? vlanById.get(col.topPort.vlan_id) : undefined}
                  variant={variant}
                  showNum={showNum}
                  selected={col.topPort.id === selectedPortId}
                  pending={col.topPort.id === pendingPortId}
                  editMode={editMode}
                  linkBadge={!showCables && linkedPortIds.has(col.topPort.id)}
                  onClick={() => onPortClick(col.topPort!, device)}
                  onHover={hoverHandler(col.topPort)}
                  onLeave={() => setHover(null)}
                />
              ) : (
                <span className="jack-spacer" />
              )}
              {col.botPort ? (
                <Jack
                  port={col.botPort}
                  vlan={col.botPort.vlan_id != null ? vlanById.get(col.botPort.vlan_id) : undefined}
                  variant={variant}
                  showNum={showNum}
                  selected={col.botPort.id === selectedPortId}
                  pending={col.botPort.id === pendingPortId}
                  editMode={editMode}
                  linkBadge={!showCables && linkedPortIds.has(col.botPort.id)}
                  onClick={() => onPortClick(col.botPort!, device)}
                  onHover={hoverHandler(col.botPort)}
                  onLeave={() => setHover(null)}
                />
              ) : (
                <span className="jack-spacer" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="face-actions">
        <span className="face-u">{range}</span>
        <button
          className="device-del"
          title="Remove device"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(device.id);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function PortTooltip({ hover }: { hover: NonNullable<HoverState> }) {
  const { port, vlan, x, y } = hover;
  const occupied = Boolean(port.client || port.ip);
  return (
    <div className="port-tooltip" style={{ left: x + 14, top: y + 14 }}>
      <div className="pt-title">Port {port.port_nr}</div>
      <div className="pt-row">
        <span className={`pt-dot ${occupied ? 'on' : ''}`} />
        {occupied ? 'Occupied' : 'Free'}
      </div>
      <div className="pt-row">
        <span className="pt-swatch" style={{ background: vlan ? vlan.color : 'transparent', borderColor: vlan ? vlan.color : '#3a414f' }} />
        {vlan ? `VLAN ${vlan.tag}${vlan.name ? ` · ${vlan.name}` : ''}` : 'No VLAN'}
      </div>
      {port.ip && <div className="pt-row muted">IP {port.ip}</div>}
      {port.client && <div className="pt-row muted">{port.client}</div>}
    </div>
  );
}

export function RackView({
  rack,
  selectedDeviceId,
  selectedPortId,
  pendingPortId,
  selectedCableId,
  linkMode,
  editMode,
  showCables,
  onDeviceClick,
  onPortClick,
  onDeleteDevice,
  onSelectCable,
}: {
  rack: Rack;
  selectedDeviceId: number | null;
  selectedPortId: number | null;
  pendingPortId: number | null;
  selectedCableId: number | null;
  linkMode: boolean;
  editMode: boolean;
  showCables: boolean;
  onDeviceClick: (d: Device) => void;
  onPortClick: (p: Port, d: Device) => void;
  onDeleteDevice: (id: number) => void;
  onSelectCable: (id: number) => void;
}) {
  const [hover, setHover] = useState<HoverState>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const vlanById = new Map(rack.vlans.map((v) => [v.id, v]));

  // Remount the cable overlay once just after the rack first paints. Measuring
  // in place is unreliable on first load in both Chrome and Firefox (the SVG
  // doesn't repaint), but a fresh mount in the settled DOM draws every cable —
  // the same thing the manual cables toggle does.
  const cablesSig = rack.cables.map((c) => `${c.id}:${c.color}`).join(',');
  const [overlayTick, setOverlayTick] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOverlayTick((t) => t + 1));
    const to = setTimeout(() => setOverlayTick((t) => t + 1), 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(to);
    };
  }, [rack.id, cablesSig]);

  // Ports that are an endpoint of any cable (for the "L" badge when hidden).
  const linkedPortIds = new Set<number>();
  for (const c of rack.cables) {
    linkedPortIds.add(c.a_port_id);
    linkedPortIds.add(c.b_port_id);
  }

  const deviceByTop = new Map<number, Device>();
  const covered = new Set<number>();
  for (const d of rack.devices) {
    const top = d.position_u + d.size_u - 1;
    deviceByTop.set(top, d);
    for (let u = d.position_u; u <= top; u++) covered.add(u);
  }

  const rows: JSX.Element[] = [];
  for (let u = rack.height_u; u >= 1; u--) {
    const dev = deviceByTop.get(u);
    if (dev) {
      rows.push(
        <DeviceFace
          key={`d${dev.id}`}
          device={dev}
          vlanById={vlanById}
          selectedDeviceId={selectedDeviceId}
          selectedPortId={selectedPortId}
          pendingPortId={pendingPortId}
          editMode={editMode}
          linkedPortIds={linkedPortIds}
          showCables={showCables}
          onDeviceClick={onDeviceClick}
          onPortClick={onPortClick}
          onDelete={onDeleteDevice}
          setHover={setHover}
        />
      );
    } else if (!covered.has(u)) {
      rows.push(<USlot key={`u${u}`} u={u} />);
    }
  }

  // A compact signature of the layout so the cable overlay re-measures when
  // devices are added/removed/moved (port wrapping can shift positions).
  const layoutKey = rack.devices.map((d) => `${d.id}:${d.position_u}:${d.size_u}`).join('|');

  return (
    <div className={`rack ${linkMode ? 'link-mode' : ''}`}>
      <div className="rack-title">
        {rack.name} <span className="rack-sub">{rack.height_u}U</span>
      </div>
      <div className="rack-frame" ref={frameRef}>
        {rows}
        {showCables && (
          <CableLayer
            key={`cl-${rack.id}-${overlayTick}`}
            frameRef={frameRef}
            cables={rack.cables}
            layoutKey={layoutKey}
            selectedCableId={selectedCableId}
            onSelectCable={onSelectCable}
          />
        )}
      </div>
      {hover && <PortTooltip hover={hover} />}
    </div>
  );
}

type CablePath = { id: number; d: string; color: string; selected: boolean };

function CableLayer({
  frameRef,
  cables,
  layoutKey,
  selectedCableId,
  onSelectCable,
}: {
  frameRef: RefObject<HTMLDivElement>;
  cables: Cable[];
  layoutKey: string;
  selectedCableId: number | null;
  onSelectCable: (id: number) => void;
}) {
  const [paths, setPaths] = useState<CablePath[]>([]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => {
      const fr = frame.getBoundingClientRect();
      const next: CablePath[] = [];
      for (const c of cables) {
        const ae = frame.querySelector(`[data-port-id="${c.a_port_id}"]`);
        const be = frame.querySelector(`[data-port-id="${c.b_port_id}"]`);
        if (!ae || !be) continue;
        const ra = ae.getBoundingClientRect();
        const rb = be.getBoundingClientRect();
        const ax = ra.left + ra.width / 2 - fr.left;
        const ay = ra.top + ra.height / 2 - fr.top;
        const bx = rb.left + rb.width / 2 - fr.left;
        const by = rb.top + rb.height / 2 - fr.top;
        // Loop the cable out to the right (like real rack uplinks).
        const out = Math.max(36, Math.abs(by - ay) * 0.5);
        const cx = Math.max(ax, bx) + out;
        const d = `M ${ax} ${ay} C ${cx} ${ay}, ${cx} ${by}, ${bx} ${by}`;
        next.push({ id: c.id, d, color: c.color, selected: c.id === selectedCableId });
      }
      setPaths(next);
    };

    // This component is remounted by its parent right after the rack paints, so
    // a plain measure here runs against a settled DOM. The observers keep the
    // cables aligned when the rack is resized or ports re-wrap.
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [frameRef, cables, layoutKey, selectedCableId]);

  // The SVG fills the rack frame via CSS; path coordinates are in CSS pixels.
  return (
    <svg className="cable-layer" width="100%" height="100%">
      {paths.map((p) => (
        <g key={p.id}>
          <path
            d={p.d}
            className="cable-hit"
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelectCable(p.id);
            }}
          />
          <path d={p.d} stroke={p.color} className={`cable-line ${p.selected ? 'sel' : ''}`} />
        </g>
      ))}
    </svg>
  );
}
