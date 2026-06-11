import { useDroppable } from '@dnd-kit/core';
import type { Device, Port, Rack, Vlan } from '../types';

const ROW_H = 30; // pixels per rack unit

function USlot({ u }: { u: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `u:${u}` });
  return (
    <div ref={setNodeRef} className={`u-slot ${isOver ? 'over' : ''}`} style={{ height: ROW_H }}>
      <span className="u-num">{u}</span>
      <span className="u-empty">empty</span>
    </div>
  );
}

function PortCell({
  port,
  vlan,
  onClick,
}: {
  port: Port;
  vlan: Vlan | undefined;
  onClick: () => void;
}) {
  const assigned = port.vlan_id != null || port.ip || port.client;
  const title = [
    `Port ${port.port_nr}`,
    vlan ? `VLAN ${vlan.tag}${vlan.name ? ` (${vlan.name})` : ''}` : null,
    port.ip ? `IP ${port.ip}` : null,
    port.client ? `Client ${port.client}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <button
      className={`port ${assigned ? 'assigned' : ''}`}
      style={vlan ? { background: vlan.color, borderColor: vlan.color } : undefined}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {port.port_nr}
    </button>
  );
}

function DeviceBlock({
  device,
  vlanById,
  onDeviceClick,
  onPortClick,
  onDelete,
}: {
  device: Device;
  vlanById: Map<number, Vlan>;
  onDeviceClick: (d: Device) => void;
  onPortClick: (p: Port, d: Device) => void;
  onDelete: (id: number) => void;
}) {
  const top = device.position_u + device.size_u - 1;
  const range = device.size_u > 1 ? `${device.position_u}–${top}` : `${device.position_u}`;
  return (
    <div
      className={`device ${device.type}`}
      style={{ height: device.size_u * ROW_H }}
      onClick={() => onDeviceClick(device)}
    >
      <div className="device-head">
        <span className="device-u">{range}</span>
        <span className="device-name">
          {device.name || <em>{device.type === 'blank' ? 'Blind panel' : 'unnamed'}</em>}
        </span>
        {device.mgmt_ip && <span className="device-mgmt">{device.mgmt_ip}</span>}
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
      {device.ports.length > 0 && (
        <div className="ports">
          {device.ports.map((p) => (
            <PortCell
              key={p.id}
              port={p}
              vlan={p.vlan_id != null ? vlanById.get(p.vlan_id) : undefined}
              onClick={() => onPortClick(p, device)}
            />
          ))}
        </div>
      )}
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
        <DeviceBlock
          key={`d${dev.id}`}
          device={dev}
          vlanById={vlanById}
          onDeviceClick={onDeviceClick}
          onPortClick={onPortClick}
          onDelete={onDeleteDevice}
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
    </div>
  );
}
