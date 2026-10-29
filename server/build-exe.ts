import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';
import { inject } from 'postject';
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit';
import sharp from 'sharp';
import { appVersion } from './version.ts';

// App in un solo file (Node SEA): sito compilato + server dell'app, senza Node né codice da scaricare.
// 1) build del sito  2) bundle CommonJS di server/app.ts  3) blob SEA con il sito come asset  4) blob nel node
// Windows: icona e dati dell'exe, poi release/FormulaMonitor.exe. macOS: firma ad hoc (obbligatoria su Apple
// Silicon) e zip che conserva il permesso di esecuzione: release/FormulaMonitor-macOS-<AppleSilicon|Intel>.zip
// Uso: npm run build:exe (sul sistema di destinazione: il binario è il node che esegue lo script)
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const work = join(root, 'build', 'exe');
const release = join(root, 'release');
const windows = process.platform === 'win32';
const mac = process.platform === 'darwin';
const exe = join(release, windows ? 'FormulaMonitor.exe' : 'FormulaMonitor');
const macZip = join(release, `FormulaMonitor-macOS-${process.arch === 'arm64' ? 'AppleSilicon' : 'Intel'}.zip`);
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];

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

// ICO con le immagini PNG (Windows Vista e successivi) disegnate da public/favicon.svg
async function icon(): Promise<Buffer> {
  const svg = await readFile(join(root, 'public', 'favicon.svg'));
  const images = await Promise.all(
    ICON_SIZES.map((size) =>
      sharp(svg, { density: (72 * size) / 16 })
        .resize(size, size)
        .png()
        .toBuffer(),
    ),
  );
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); // tipo: icona
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, i) => {
    const size = ICON_SIZES[i]! % 256; // 0 = 256 px
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4); // piani
    header.writeUInt16LE(32, entry + 6); // bit per pixel
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  return Buffer.concat([header, ...images]);
}

// Icona e dati del file (Esplora risorse, barra delle applicazioni, Gestione attività) al posto di quelli di Node.
// Dopo l'iniezione: resedit riscrive le risorse (blob compreso) e toglie la firma di Node, ormai non più valida.
async function brandWindowsExe(path: string, version: string) {
  const executable = NtExecutable.from(await readFile(path), { ignoreCert: true });
  const resource = NtExecutableResource.from(executable);
  const [group] = Resource.IconGroupEntry.fromEntries(resource.entries);
  const ico = Data.IconFile.from(await icon());
  Resource.IconGroupEntry.replaceIconsForResource(
    resource.entries,
    group?.id ?? 1,
    group?.lang ?? 1033,
    ico.icons.map((item) => item.data),
  );
  const [info] = Resource.VersionInfo.fromEntries(resource.entries);
  if (info) {
    const language = info.getAvailableLanguages()[0] ?? { lang: 1033, codepage: 1200 };
    info.setFileVersion(`${version}.0`);
    info.setProductVersion(`${version}.0`);
    info.setStringValues(language, {
      FileDescription: 'Formula Monitor',
      ProductName: 'Formula Monitor',
      CompanyName: 'Formula Monitor',
      InternalName: 'FormulaMonitor',
      OriginalFilename: 'FormulaMonitor.exe',
      LegalCopyright: 'MIT',
      FileVersion: version,
      ProductVersion: version,
    });
    info.outputToResourceEntries(resource.entries);
  }
  resource.outputResource(executable);
  await writeFile(path, Buffer.from(executable.generate()));
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
if (mac) run('codesign', ['--remove-signature', exe]);
await inject(exe, 'NODE_SEA_BLOB', await readFile(blob), {
  sentinelFuse: FUSE,
  ...(mac ? { machoSegmentName: 'NODE_SEA' } : {}),
});
if (windows) await brandWindowsExe(exe, version);

let output = exe;
if (mac) {
  run('codesign', ['--sign', '-', '--force', exe]);
  await rm(macZip, { force: true });
  run('ditto', ['-c', '-k', '--keepParent', exe, macZip]);
  output = macZip;
}

console.log(`\nPronto: ${relative(root, output)} (${Object.keys(assets).length} file del sito, versione ${version})\n`);
