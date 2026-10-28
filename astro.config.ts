import { defineConfig, fontProviders } from 'astro/config';
import icon from 'astro-icon';
import formulaMonitorBridge from './server/integration.ts';
import { appVersion } from './server/version.ts';

// Versione mostrata nel footer, calcolata dai commit (vedi server/version.ts)
process.env.PUBLIC_VERSION ??= appVersion();

const fontsource = (pkg: string, file: string) => `./node_modules/${pkg}/files/${file}.woff2`;

// App locale: il bridge UDP → WebSocket gira dentro il dev server (vedi server/integration.ts).
// Font self-hosted da @fontsource: Saira (display, numeri grandi) + Geist (interfaccia, tabelle).
// SITE_URL e BASE_PATH arrivano dal workflow di GitHub Pages; in locale il sito sta nella radice
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:20780',
  base: process.env.BASE_PATH ?? '/',
  output: 'static',
  integrations: [icon({ iconDir: 'src/assets/icons' }), formulaMonitorBridge()],
  devToolbar: { enabled: false },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Saira',
      cssVariable: '--font-display',
      fallbacks: ['Arial Narrow', 'sans-serif'],
      options: {
        variants: [
          {
            src: [fontsource('@fontsource-variable/saira', 'saira-latin-standard-normal')],
            weight: '100 900',
            stretch: '50% 125%',
            style: 'normal',
          },
          {
            src: [fontsource('@fontsource-variable/saira', 'saira-latin-standard-italic')],
            weight: '100 900',
            stretch: '50% 125%',
            style: 'italic',
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Geist',
      cssVariable: '--font-body',
      fallbacks: ['Segoe UI', 'Arial', 'sans-serif'],
      options: {
        variants: [
          {
            src: [fontsource('@fontsource-variable/geist', 'geist-latin-wght-normal')],
            weight: '100 900',
            style: 'normal',
          },
        ],
      },
    },
  ],
});
