// PoE standards. `key` is stored on each port; `watts` is what the switch port
// provisions for that class (used for budget calculations). `name` is the short
// variant name (PoE / PoE+ / PoE++), `label` the full descriptive option text,
// `color` is used to tint ports when assigning PoE capabilities in the rack.
export interface PoeStd {
  key: string;
  name: string;
  label: string;
  watts: number;
  color: string;
}

export const POE_STANDARDS: PoeStd[] = [
  { key: '', name: '—', label: 'None', watts: 0, color: '' },
  { key: 'af', name: 'PoE', label: 'PoE · 802.3af (15.4W)', watts: 15.4, color: '#3fb950' },
  { key: 'at', name: 'PoE+', label: 'PoE+ · 802.3at (30W)', watts: 30, color: '#58a6ff' },
  { key: 'bt3', name: 'PoE++ T3', label: 'PoE++ · 802.3bt Type 3 (60W)', watts: 60, color: '#a371f7' },
  { key: 'bt4', name: 'PoE++ T4', label: 'PoE++ · 802.3bt Type 4 (90W)', watts: 90, color: '#f0883e' },
];

export const poeStd = (key: string): PoeStd | undefined => POE_STANDARDS.find((s) => s.key === key);
export const poeWatts = (key: string): number => poeStd(key)?.watts ?? 0;

// The PoE standards a port may actually use, given its capability. An unset
// capability is treated as unrestricted.
export function allowedFor(cap: string): PoeStd[] {
  const capW = poeWatts(cap);
  if (!cap) return POE_STANDARDS;
  return POE_STANDARDS.filter((s) => s.watts <= capW);
}
