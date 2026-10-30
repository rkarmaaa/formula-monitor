import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUpdater, isNewer, oldPath } from './update.ts';

test('aggiornamento: confronto delle versioni', () => {
  assert.ok(isNewer('1.4.10', '1.4.9'));
  assert.ok(isNewer('v2.0.0', '1.9.99'));
  assert.ok(!isNewer('1.4.9', '1.4.9'));
  assert.ok(!isNewer('1.4.8', '1.4.9'));
  assert.ok(!isNewer('1.5.0', 'dev'));
});

test('aggiornamento: scarica, verifica e sostituisce l’exe', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fm-update-'));
  const exePath = join(dir, 'FormulaMonitor.exe');
  await writeFile(exePath, 'vecchio');
  const fresh = Buffer.from('nuovo exe');
  let digest = `sha256:${createHash('sha256').update(fresh).digest('hex')}`;
  const server = createServer((request, response) => {
    if (request.url === '/release') {
      const { port } = server.address() as { port: number };
      const url = `http://localhost:${port}/FormulaMonitor.exe`;
      response.end(
        JSON.stringify({
          tag_name: 'v9.0.0',
          assets: [{ name: 'FormulaMonitor.exe', size: fresh.length, browser_download_url: url, digest }],
        }),
      );
    } else response.end(fresh);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const api = `http://localhost:${(server.address() as { port: number }).port}/release`;
  try {
    // SHA-256 sbagliato: l'exe resta quello di prima
    digest = `sha256:${'0'.repeat(64)}`;
    const ready: string[] = [];
    const wrong = createUpdater({ current: '1.0.0', exePath, api, onReady: (v) => ready.push(v) });
    await wrong.check();
    wrong.stop();
    assert.equal(await readFile(exePath, 'utf8'), 'vecchio');
    assert.equal(ready.length, 0);

    digest = `sha256:${createHash('sha256').update(fresh).digest('hex')}`;
    const updater = createUpdater({ current: '1.0.0', exePath, api, onReady: (v) => ready.push(v) });
    await updater.check();
    updater.stop();
    assert.deepEqual(ready, ['9.0.0']);
    assert.equal(await readFile(exePath, 'utf8'), 'nuovo exe');
    assert.equal(await readFile(oldPath(exePath), 'utf8'), 'vecchio');

    // Già all'ultima versione: niente da fare
    const same = createUpdater({ current: '9.0.0', exePath, api, onReady: (v) => ready.push(v) });
    await same.check();
    same.stop();
    assert.deepEqual(ready, ['9.0.0']);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
