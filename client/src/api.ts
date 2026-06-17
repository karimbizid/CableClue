import type { Cable, Device, Notification, Port, PortRow, Project, Rack, RackSummary, Vlan } from './types';

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // Projects
  listProjects: () => req<Project[]>('/api/projects'),
  createProject: (name: string) =>
    req<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  updateProject: (id: number, name: string) =>
    req<Project>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteProject: (id: number) => req<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  exportProject: (id: number) => req<unknown>(`/api/projects/${id}/export`),
  importNewProject: (data: unknown, name?: string) =>
    req<Project>('/api/projects/import', { method: 'POST', body: JSON.stringify({ data, name }) }),
  importIntoProject: (id: number, data: unknown, parts: { racks: boolean; vlans: boolean }) =>
    req<{ ok: boolean }>(`/api/projects/${id}/import`, {
      method: 'POST',
      body: JSON.stringify({ data, parts }),
    }),

  // Project-wide admin / IP list
  listPorts: (projectId: number) =>
    req<{ vlans: Vlan[]; rows: PortRow[] }>(`/api/projects/${projectId}/ports`),
  listNotifications: (projectId: number) =>
    req<Notification[]>(`/api/projects/${projectId}/notifications`),

  // Racks (scoped to a project)
  listRacks: (projectId: number) => req<RackSummary[]>(`/api/projects/${projectId}/racks`),
  getRack: (id: number) => req<Rack>(`/api/racks/${id}`),
  createRack: (projectId: number, name: string, height_u = 42) =>
    req<Rack>(`/api/projects/${projectId}/racks`, {
      method: 'POST',
      body: JSON.stringify({ name, height_u }),
    }),
  updateRack: (id: number, patch: Partial<Pick<Rack, 'name' | 'height_u' | 'position'>>) =>
    req<Rack>(`/api/racks/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteRack: (id: number) => req<void>(`/api/racks/${id}`, { method: 'DELETE' }),

  // VLANs (scoped to a project)
  createVlan: (projectId: number, v: Pick<Vlan, 'tag' | 'name' | 'color'>) =>
    req<Vlan>(`/api/projects/${projectId}/vlans`, { method: 'POST', body: JSON.stringify(v) }),
  updateVlan: (id: number, patch: Partial<Pick<Vlan, 'tag' | 'name' | 'color'>>) =>
    req<Vlan>(`/api/vlans/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteVlan: (id: number) => req<void>(`/api/vlans/${id}`, { method: 'DELETE' }),

  // Devices
  createDevice: (
    rackId: number,
    d: Pick<Device, 'type' | 'port_count' | 'size_u' | 'position_u'>
  ) => req<Device>(`/api/racks/${rackId}/devices`, { method: 'POST', body: JSON.stringify(d) }),
  updateDevice: (id: number, patch: Partial<Device>) =>
    req<Device>(`/api/devices/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteDevice: (id: number) => req<void>(`/api/devices/${id}`, { method: 'DELETE' }),

  // Ports
  updatePort: (
    id: number,
    patch: Partial<Pick<Port, 'vlan_id' | 'ip' | 'mac' | 'client' | 'label' | 'notes' | 'poe' | 'poe_cap'>>
  ) =>
    req<Port>(`/api/ports/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),

  // Cables
  createCable: (rackId: number, a_port_id: number, b_port_id: number, color: string) =>
    req<Cable>(`/api/racks/${rackId}/cables`, {
      method: 'POST',
      body: JSON.stringify({ a_port_id, b_port_id, color }),
    }),
  updateCable: (id: number, patch: Partial<Pick<Cable, 'color' | 'label'>>) =>
    req<Cable>(`/api/cables/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteCable: (id: number) => req<void>(`/api/cables/${id}`, { method: 'DELETE' }),

  // Misc
  getVersion: () => req<{ version: string }>('/api/version'),
};
