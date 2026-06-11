import { useState, type MouseEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Device, Port, Rack, Vlan } from '../types';

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
  onClick,
  onHover,
  onLeave,
}: {
  port: Port;
  vlan: Vlan | undefined;
  variant: 'switch' | 'patch';
  showNum: boolean;
  onClick: () => void;
  onHover: (e: MouseEvent) => void;
  onLeave: () => void;
}) {
  const occupied = Boolean(port.client || port.ip);
  const body = vlan ? vlan.color : '#11151c';
  const stroke = vlan ? vlan.color : '#3a414f';

  return (
    <button
      className={`jack ${occupied ? 'occupied' : ''}`}
      title=""
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={onHover}
      onMouseMove={onHover}
      onMouseLeave={onLeave}
    >
      <svg viewBox="0 0 20 18" width="18" height="16" aria-hidden>
        {/* jack body */}
        <rect x="1.5" y="2.5" width="17" height="13" rx="1.6" fill={body} stroke={stroke} strokeWidth="1" />
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
        {variant === 'switch' && (
          <circle cx="10" cy="9.6" r="1.5" fill={occupied ? '#22c55e' : '#1f2937'} />
        )}
      </svg>
      {showNum && <span className="pnum">{port.port_nr}</span>}
    </button>
  );
}

function DeviceFace({
  device,
  vlanById,
  onDeviceClick,
  onPortClick,
  onDelete,
  setHover,
}: {
  device: Device;
  vlanById: Map<number, Vlan>;
  onDeviceClick: (d: Device) => void;
  onPortClick: (p: Port, d: Device) => void;
  onDelete: (id: number) => void;
  setHover: (h: HoverState) => void;
}) {
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

  return (
    <div
      className={`device face ${device.type}`}
      style={{ height: device.size_u * ROW_H }}
      onClick={() => onDeviceClick(device)}
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
  onDeviceClick,
  onPortClick,
  onDeleteDevice,
}: {
  rack: Rack;
  onDeviceClick: (d: Device) => void;
  onPortClick: (p: Port, d: Device) => void;
  onDeleteDevice: (id: number) => void;
}) {
  const [hover, setHover] = useState<HoverState>(null);
  const vlanById = new Map(rack.vlans.map((v) => [v.id, v]));

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

  return (
    <div className="rack">
      <div className="rack-title">
        {rack.name} <span className="rack-sub">{rack.height_u}U</span>
      </div>
      <div className="rack-frame">{rows}</div>
      {hover && <PortTooltip hover={hover} />}
    </div>
  );
}
