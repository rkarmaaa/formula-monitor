// Dati del progetto
export const site = {
  name: 'Formula Monitor',
  repository: 'https://github.com/rkarmaaa/formula-monitor',
  // File dell'ultima release (vedi .github/workflows/release.yml)
  releases: 'https://github.com/rkarmaaa/formula-monitor/releases/latest/download/',
  version: import.meta.env.PUBLIC_VERSION ?? '0.0.0',
} as const;

// Versioni scaricabili: la prima è quella predefinita (senza JavaScript o su sistemi non riconosciuti)
export type DownloadId = 'windows' | 'mac-arm' | 'mac-intel';

export const downloads: { id: DownloadId; file: string; icon: string }[] = [
  { id: 'windows', file: 'FormulaMonitor.exe', icon: 'simple-icons:windows' },
  { id: 'mac-arm', file: 'FormulaMonitor-macOS-AppleSilicon.zip', icon: 'simple-icons:apple' },
  { id: 'mac-intel', file: 'FormulaMonitor-macOS-Intel.zip', icon: 'simple-icons:apple' },
];
