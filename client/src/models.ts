// Catalogue of common switch models per manufacturer, used by the inspector's
// manufacturer/model dropdowns. `ports` is the access-port count (shown in the
// label to help pick the right model); it is informational only.
//
// Every manufacturer — and every model list — also offers a "Custom…" entry so
// you can type any name that isn't listed here.

export interface SwitchModel {
  name: string;
  ports: number;
}

export interface Manufacturer {
  name: string;
  models: SwitchModel[];
}

export const MANUFACTURERS: Manufacturer[] = [
  {
    name: 'Netgear',
    models: [
      { name: 'M4250-8G2XF-PoE+ (GSM4210PX)', ports: 8 },
      { name: 'M4250-9G1F-PoE+ (GSM4210P)', ports: 8 },
      { name: 'M4250-10G2XF-PoE+ (GSM4212P)', ports: 8 },
      { name: 'M4250-24G4XF-PoE+ (GSM4230PX)', ports: 24 },
      { name: 'M4250-26G4XF-PoE+ (GSM4230P)', ports: 24 },
      { name: 'M4250-40G8XF-PoE+ (GSM4248PX)', ports: 40 },
      { name: 'M4300-48X (GSM4352)', ports: 48 },
      { name: 'GS308', ports: 8 },
      { name: 'GS324', ports: 24 },
      { name: 'GS348', ports: 48 },
    ],
  },
  {
    name: 'Cisco',
    models: [
      { name: 'CBS350-8P-2G', ports: 8 },
      { name: 'CBS350-24P-4G', ports: 24 },
      { name: 'CBS350-48P-4G', ports: 48 },
      { name: 'Catalyst 9200-24T', ports: 24 },
      { name: 'Catalyst 9200-48T', ports: 48 },
      { name: 'Catalyst 9300-24P', ports: 24 },
      { name: 'Catalyst 9300-48P', ports: 48 },
      { name: 'Catalyst 2960-X 24', ports: 24 },
      { name: 'Catalyst 2960-X 48', ports: 48 },
    ],
  },
  {
    name: 'Aruba',
    models: [
      { name: 'Instant On 1930 8G', ports: 8 },
      { name: 'Instant On 1930 24G', ports: 24 },
      { name: 'Instant On 1930 48G', ports: 48 },
      { name: '2930F 8G PoE+', ports: 8 },
      { name: '2930F 24G PoE+', ports: 24 },
      { name: '2930F 48G PoE+', ports: 48 },
      { name: 'CX 6300M 24', ports: 24 },
      { name: 'CX 6300M 48', ports: 48 },
    ],
  },
  {
    name: 'Yamaha',
    models: [
      { name: 'SWP1-8', ports: 8 },
      { name: 'SWP1-8MMF', ports: 8 },
      { name: 'SWP2-10SMF', ports: 8 },
      { name: 'SWR2100P-5G', ports: 5 },
      { name: 'SWR2100P-10G', ports: 8 },
      { name: 'SWR2310-18GT', ports: 16 },
      { name: 'SWR2310P-18G', ports: 16 },
      { name: 'SWR2310-28GT', ports: 24 },
    ],
  },
  {
    name: 'Ubiquiti UniFi (Pro)',
    models: [
      { name: 'USW-Pro-8-PoE', ports: 8 },
      { name: 'USW-Pro-Max-16', ports: 16 },
      { name: 'USW-Pro-24', ports: 24 },
      { name: 'USW-Pro-24-PoE', ports: 24 },
      { name: 'USW-Pro-Max-24', ports: 24 },
      { name: 'USW-Pro-Max-24-PoE', ports: 24 },
      { name: 'USW-Pro-48', ports: 48 },
      { name: 'USW-Pro-48-PoE', ports: 48 },
      { name: 'USW-Pro-Max-48', ports: 48 },
      { name: 'USW-Pro-Max-48-PoE', ports: 48 },
    ],
  },
  {
    name: 'Luminex',
    models: [
      { name: 'GigaCore 10', ports: 8 },
      { name: 'GigaCore 12', ports: 10 },
      { name: 'GigaCore 14R', ports: 12 },
      { name: 'GigaCore 16Xt', ports: 16 },
      { name: 'GigaCore 26i', ports: 24 },
      { name: 'GigaCore 30i', ports: 28 },
    ],
  },
  // --- Suggested additions beyond the requested brands ---
  {
    name: 'MikroTik',
    models: [
      { name: 'CRS310-8G+2S+', ports: 8 },
      { name: 'CRS326-24G-2S+', ports: 24 },
      { name: 'CRS354-48G-4S+', ports: 48 },
    ],
  },
  {
    name: 'Extreme Networks',
    models: [
      { name: 'X435-24P', ports: 24 },
      { name: 'X435-48P', ports: 48 },
      { name: '5320-24P', ports: 24 },
      { name: '5320-48P', ports: 48 },
    ],
  },
  {
    name: 'TP-Link Omada',
    models: [
      { name: 'SG2008P', ports: 8 },
      { name: 'SG2210MP (8)', ports: 8 },
      { name: 'SG3428 (24)', ports: 24 },
      { name: 'SG3452 (48)', ports: 48 },
    ],
  },
];
