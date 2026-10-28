import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ports } from '../src/data/games.ts';
import { createBridge } from './bridge.ts';
import { createSiteServer } from './http.ts';

// Avvio "da gara": serve il sito compilato (dist/) e il bridge sulla stessa porta. È l'app dell'exe, da sorgente.
// Uso: npm run build && npm start   (opzioni: --port 20780 --udp 20777)
const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};

const httpPort = arg('port', ports.http);
const udpPort = arg('udp', ports.udp);
const root = fileURLToPath(new URL('../dist', import.meta.url));

const server = createSiteServer(async (path) => {
  const file = join(root, path);
  const info = await stat(file).catch(() => undefined);
  return info?.isFile() ? readFile(file) : undefined;
});

const bridge = createBridge({ server, udpPort, httpPort });

server.listen(httpPort, () => {
  const urls = ['localhost', ...bridge.addresses].map((host) => `   http://${host}:${httpPort}`);
  console.log(
    `\n  Formula Monitor è pronto\n\n  Apri il monitor da questo PC o da un dispositivo sulla stessa rete:\n${urls.join('\n')}\n`,
  );
  console.log(`  Nel gioco imposta IP ${bridge.addresses[0] ?? '127.0.0.1'} e porta UDP ${udpPort}\n`);
});

const shutdown = () => {
  bridge.close();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
