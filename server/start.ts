import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ports } from '../src/data/games.ts';
import { createBridge } from './bridge.ts';

// Avvio "da gara": serve il sito compilato (dist/) e il bridge sulla stessa porta.
// Uso: npm run build && npm start   (opzioni: --port 20780 --udp 20777)
const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};

const httpPort = arg('port', ports.http);
const udpPort = arg('udp', ports.udp);
const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(pathname: string): Promise<string | undefined> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const safe = normalize(decoded).replace(/^([/\\])+/, '');
  const target = join(root, safe);
  // Solo file dentro dist/ (con il separatore: "dist-altro" accanto non deve passare)
  if (target !== root && !target.startsWith(root + sep)) return undefined;
  for (const candidate of [target, join(target, 'index.html'), `${target}.html`]) {
    const info = await stat(candidate).catch(() => undefined);
    if (info?.isFile()) return candidate;
  }
  return undefined;
}

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const file = (await resolveFile(pathname)) ?? join(root, '404.html');
  const found = file.endsWith('404.html') && !pathname.endsWith('404.html') ? 404 : 200;
  const cache = pathname.startsWith('/_astro/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  response.writeHead(found, {
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': cache,
  });
  createReadStream(file)
    .on('error', () => response.end())
    .pipe(response);
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
