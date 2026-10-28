import { spawn } from 'node:child_process';
import { getAsset, isSea } from 'node:sea';
import { ports } from '../src/data/games.ts';
import { createBridge } from './bridge.ts';
import { createSiteServer } from './http.ts';

// Ingresso dell'exe (Node SEA): sito compilato incorporato come asset, bridge UDP e apertura del monitor
// nel browser predefinito. Se l'app è già aperta (porta occupata) apre solo il monitor.
// Opzioni come npm start: FormulaMonitor.exe --port 20780 --udp 20777
const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};

const httpPort = arg('port', ports.http);
const udpPort = arg('udp', ports.udp);
const local = `http://localhost:${httpPort}/monitor/`;

const read = async (path: string) => {
  if (!isSea()) return undefined;
  try {
    return Buffer.from(getAsset(path));
  } catch {
    return undefined; // asset inesistente
  }
};

function openBrowser(url: string) {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd.exe', ['/c', 'start', '', url]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  spawn(command, args as string[], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

const server = createSiteServer(read);
const bridge = createBridge({ server, udpPort, httpPort, log: () => undefined });

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EADDRINUSE') throw error;
  console.log(`\n  Formula Monitor è già aperto: apro il monitor nel browser.\n`);
  openBrowser(local);
  setTimeout(() => process.exit(0), 3000);
});

server.listen(httpPort, () => {
  const ip = bridge.addresses[0];
  const lines = [
    '',
    '  FORMULA MONITOR',
    '',
    '  Nel gioco (Impostazioni telemetria UDP):',
    `     UDP IP Address   ${ip ?? '127.0.0.1'}`,
    `     UDP Port         ${udpPort}`,
    '',
    '  Monitor su questo PC:',
    `     ${local}`,
    ...(ip ? ['', '  Su telefono o tablet (stessa rete):', `     http://${ip}:${httpPort}/monitor/`] : []),
    '',
    '  Lascia aperta questa finestra mentre giochi. Per chiudere: Ctrl+C o chiudi la finestra.',
    '',
  ];
  console.log(lines.join('\n'));
  openBrowser(local);
});

const shutdown = () => {
  bridge.close();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
