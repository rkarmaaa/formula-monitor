import { createServer } from 'node:http';
import { extname, posix } from 'node:path';

// Server HTTP del sito compilato, comune a `npm start` (file da dist/) e all'exe (file incorporati).
// L'app locale apre direttamente il monitor: la radice rimanda a /monitor/.
export type ReadFile = (path: string) => Promise<Buffer | undefined>;

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Percorso relativo e sicuro (niente risalite fuori dalla radice), con le varianti index.html e .html
function candidates(pathname: string): string[] {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return [];
  }
  const safe = posix.normalize(decoded.replaceAll('\\', '/')).replace(/^\/+/, '');
  if (safe.startsWith('..')) return [];
  const base = safe.replace(/\/$/, '');
  return [base, `${base ? `${base}/` : ''}index.html`, `${base}.html`].filter(Boolean);
}

export function createSiteServer(read: ReadFile) {
  return createServer(async (request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname === '/') {
      response.writeHead(302, { Location: '/monitor/' }).end();
      return;
    }
    let file: string | undefined;
    let body: Buffer | undefined;
    for (const candidate of candidates(pathname)) {
      body = await read(candidate);
      if (body) {
        file = candidate;
        break;
      }
    }
    const found = Boolean(body);
    if (!body) [file, body] = ['404.html', await read('404.html')];
    const cache = pathname.startsWith('/_astro/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    response.writeHead(found ? 200 : 404, {
      'Content-Type': types[extname(file ?? '')] ?? 'application/octet-stream',
      'Cache-Control': cache,
    });
    response.end(body);
  });
}
