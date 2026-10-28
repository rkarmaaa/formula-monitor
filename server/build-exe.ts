import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';
import { inject } from 'postject';
import { appVersion } from './version.ts';

// Exe per Windows (Node SEA): sito compilato + server dell'app in un solo file, senza Node né codice da scaricare.
// 1) build del sito  2) bundle CommonJS di server/app.ts  3) blob SEA con il sito come asset  4) blob nel node.exe
// Uso: npm run build:exe  →  release/FormulaMonitor.exe
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const work = join(root, 'build', 'exe');
const release = join(root, 'release');
const exe = join(release, process.platform === 'win32' ? 'FormulaMonitor.exe' : 'FormulaMonitor');
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function run(command: string, args: string[] = []) {
  // npm è uno script (npm.cmd su Windows): va lanciato dalla shell, come comando unico
  const result = args.length
    ? spawnSync(command, args, { cwd: root, stdio: 'inherit' })
    : spawnSync(command, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} è fallito`);
}

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
}

const version = appVersion();
console.log(`\nFormula Monitor ${version}: build dell'exe\n`);

run('npm run build');

await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await mkdir(release, { recursive: true });

const main = join(work, 'app.cjs');
await build({
  input: join(root, 'server', 'app.ts'),
  platform: 'node',
  external: ['bufferutil', 'utf-8-validate'], // dipendenze facoltative di ws
  output: { file: main, format: 'cjs', minify: true },
  logLevel: 'warn',
});

// Asset del SEA: chiave = percorso relativo del sito con le barre "/", come lo chiede il server
const assets = Object.fromEntries((await files(dist)).map((file) => [relative(dist, file).split(sep).join('/'), file]));
const blob = join(work, 'app.blob');
const config = join(work, 'sea-config.json');
await writeFile(
  config,
  JSON.stringify({ main, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false, assets }, null, 2),
);
run(process.execPath, ['--experimental-sea-config', config]);

await rm(exe, { force: true });
await copyFile(process.execPath, exe);
await inject(exe, 'NODE_SEA_BLOB', await readFile(blob), {
  sentinelFuse: FUSE,
  ...(process.platform === 'darwin' ? { machoSegmentName: 'NODE_SEA' } : {}),
});

console.log(`\nPronto: ${relative(root, exe)} (${Object.keys(assets).length} file del sito, versione ${version})\n`);
