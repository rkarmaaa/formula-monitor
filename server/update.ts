import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Aggiornamento automatico dell'exe (Windows): controlla l'ultima release su GitHub, scarica il nuovo exe accanto a
// quello in uso, ne verifica dimensione e SHA-256 e lo mette al suo posto. Windows non cancella un exe in esecuzione
// ma lo lascia rinominare: il vecchio diventa FormulaMonitor.old.exe (eliminato al prossimo avvio) e il nuovo prende
// il suo nome. Poi onReady: l'app si riavvia appena il gioco non manda dati.
const LATEST = 'https://api.github.com/repos/rkarmaaa/formula-monitor/releases/latest';
const ASSET = 'FormulaMonitor.exe';
const CHECK_DELAY = 10_000;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

interface Release {
  tag_name: string;
  assets: { name: string; size: number; browser_download_url: string; digest?: string | null }[];
}

interface UpdaterOptions {
  current: string;
  exePath: string;
  // Solo per le prove in locale: API della release al posto di GitHub
  api?: string;
  log?: (message: string) => void;
  onReady: (version: string) => void;
}

// 1.4.12 > 1.4.9: confronto numerico per parti
export function isNewer(candidate: string, current: string): boolean {
  const a = candidate.replace(/^v/, '').split('.').map(Number);
  const b = current.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
    if (x !== y) return x > y;
  }
  return false;
}

export const oldPath = (exePath: string) => exePath.replace(/\.exe$/i, '') + '.old.exe';

export function createUpdater({ current, exePath, api = LATEST, log = () => undefined, onReady }: UpdaterOptions) {
  const dir = dirname(exePath);
  const partial = join(dir, 'FormulaMonitor.update.exe');
  let installed: string | undefined;
  let busy = false;
  // Avvio: via l'exe della versione precedente (non più in uso) e un eventuale download interrotto
  const cleanup = Promise.all(
    [oldPath(exePath), partial].map((path) => rm(path, { force: true }).catch(() => undefined)),
  );

  async function download(url: string, size: number, digest: string | undefined) {
    const response = await fetch(url, { headers: { 'User-Agent': 'FormulaMonitor' } });
    if (!response.ok || !response.body) throw new Error(`download: HTTP ${response.status}`);
    const hash = createHash('sha256');
    const tap = new Transform({
      transform(chunk: Buffer, _, done) {
        hash.update(chunk);
        done(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body as never), tap, createWriteStream(partial));
    const written = (await stat(partial)).size;
    if (written !== size) throw new Error(`download incompleto (${written} di ${size} byte)`);
    if (digest && hash.digest('hex') !== digest) throw new Error('SHA-256 diverso da quello della release');
  }

  // Vecchio exe da parte, nuovo al suo posto; se il secondo passo fallisce si rimette il vecchio
  async function swap() {
    const old = oldPath(exePath);
    await rm(old, { force: true });
    await rename(exePath, old);
    try {
      await rename(partial, exePath);
    } catch (error) {
      await rename(old, exePath);
      throw error;
    }
  }

  async function check() {
    if (busy || installed) return;
    busy = true;
    try {
      await cleanup;
      const response = await fetch(api, {
        headers: { 'User-Agent': 'FormulaMonitor', Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) throw new Error(`release: HTTP ${response.status}`);
      const release = (await response.json()) as Release;
      const version = release.tag_name.replace(/^v/, '');
      if (!isNewer(version, current)) return;
      const asset = release.assets.find((item) => item.name === ASSET);
      if (!asset) return;
      log(`  Nuova versione ${version}: download in corso…`);
      const digest = asset.digest?.startsWith('sha256:') ? asset.digest.slice(7) : undefined;
      await download(asset.browser_download_url, asset.size, digest);
      await swap();
      installed = version;
      log(`  Versione ${version} installata.`);
      onReady(version);
    } catch (error) {
      // Offline, limite dell'API o cartella non scrivibile: si riprova al prossimo controllo
      await rm(partial, { force: true }).catch(() => undefined);
      log(`  Aggiornamento non riuscito: ${(error as Error).message}`);
    } finally {
      busy = false;
    }
  }

  const first = setTimeout(check, CHECK_DELAY);
  const timer = setInterval(check, CHECK_INTERVAL);
  first.unref();
  timer.unref();

  return {
    check,
    get installed() {
      return installed;
    },
    stop() {
      clearTimeout(first);
      clearInterval(timer);
    },
  };
}
