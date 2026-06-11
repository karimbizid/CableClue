import type { DeviceTemplate } from './types';

// The catalogue shown in the library sidebar. Patch panels with 48 ports
// occupy 2U; everything else is a single U in this first version.
export const TEMPLATES: DeviceTemplate[] = [
  { key: 'switch-8', label: 'Switch 8p', type: 'switch', port_count: 8, size_u: 1 },
  { key: 'switch-24', label: 'Switch 24p', type: 'switch', port_count: 24, size_u: 1 },
  { key: 'switch-48', label: 'Switch 48p', type: 'switch', port_count: 48, size_u: 1 },
  { key: 'patch-24', label: 'Patch 24p', type: 'patch', port_count: 24, size_u: 1 },
  { key: 'patch-48', label: 'Patch 48p', type: 'patch', port_count: 48, size_u: 2 },
  { key: 'blank-1', label: 'Blind 1U', type: 'blank', port_count: 0, size_u: 1 },
  { key: 'blank-2', label: 'Blind 2U', type: 'blank', port_count: 0, size_u: 2 },
];
