export type DeviceType = 'switch' | 'patch' | 'blank';

export interface Port {
  id: number;
  device_id: number;
  port_nr: number;
  vlan_id: number | null;
  ip: string;
  client: string;
  label: string;
}

export interface Device {
  id: number;
  rack_id: number;
  type: DeviceType;
  port_count: number;
  size_u: number;
  position_u: number;
  name: string;
  manufacturer: string;
  model: string;
  mgmt_ip: string;
  notes: string;
  ports: Port[];
}

export interface Vlan {
  id: number;
  rack_id: number;
  tag: number;
  name: string;
  color: string;
}

export interface RackSummary {
  id: number;
  name: string;
  height_u: number;
  position: number;
}

export interface Rack extends RackSummary {
  vlans: Vlan[];
  devices: Device[];
}

// A draggable item from the library sidebar.
export interface DeviceTemplate {
  key: string;
  label: string;
  type: DeviceType;
  port_count: number;
  size_u: number;
}
