import type { AstroIntegration } from 'astro';
import type { Server } from 'node:http';
import { createBridge } from './bridge.ts';

// In sviluppo il bridge vive dentro il dev server di Astro: stessa porta, stesso /ws che in produzione
export default function formulaMonitorBridge(): AstroIntegration {
  return {
    name: 'formula-monitor-bridge',
    hooks: {
      'astro:server:setup': ({ server, logger }) => {
        const http = server.httpServer as Server | null;
        if (!http) return;
        const bridge = createBridge({ server: http, log: (message) => logger.info(message) });
        http.once('close', () => bridge.close());
      },
    },
  };
}
