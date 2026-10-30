import { spawn } from 'node:child_process';
import { getAsset, isSea } from 'node:sea';
import { ports } from '../src/data/games.ts';
import { createBridge } from './bridge.ts';
import { createSiteServer } from './http.ts';
import { createUpdater } from './update.ts';

// Ingresso dell'exe (Node SEA): sito compilato incorporato come asset, bridge UDP e apertura del monitor
// nel browser predefinito. Se l'app è già aperta (porta occupata) apre solo il monitor.
// Opzioni come npm start: FormulaMonitor.exe --port 20780 --udp 20777
// Su Windows l'exe si aggiorna da solo (server/update.ts) e si riavvia con --restarted: niente nuova scheda del
// browser, la pagina già aperta si ricarica quando il bridge riporta la nuova versione.
const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};

const httpPort = arg('port', ports.http);
const udpPort = arg('udp', ports.udp);
const local = `http://localhost:${httpPort}/monitor/`;
const restarted = process.argv.includes('--restarted');
const version = process.env.FM_VERSION ?? 'dev'; // inserita dalla build dell'exe
const IDLE_BEFORE_RESTART = 60_000; // riavvio solo dopo un minuto senza dati dal gioco
const LISTEN_RETRIES = 20; // dopo il riavvio la porta può essere ancora della versione precedente

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
const bridge = createBridge({ server, udpPort, httpPort, version, log: () => undefined });

let retries = 0;
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EADDRINUSE') throw error;
  if (restarted && retries++ < LISTEN_RETRIES) {
    setTimeout(() => server.listen(httpPort), 500);
    return;
  }
  console.log(`\n  Formula Monitor è già aperto: apro il monitor nel browser.\n`);
  openBrowser(local);
  setTimeout(() => process.exit(0), 3000);
});

server.listen(httpPort, () => {
  const ip = bridge.addresses[0];
  const lines = [
    '',
    `  FORMULA MONITOR ${version}${restarted ? ' (aggiornato)' : ''}`,
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
  if (!restarted) openBrowser(local);
});

// Nuovo exe al suo posto: si chiude questa versione e si apre la nuova in una nuova finestra, con le stesse porte
function restart() {
  bridge.close();
  server.closeAllConnections();
  server.close(() => {
    const args = ['--port', String(httpPort), '--udp', String(udpPort), '--restarted'];
    spawn('cmd.exe', ['/c', 'start', '', process.execPath, ...args], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    process.exit(0);
  });
}

if (isSea() && process.platform === 'win32') {
  createUpdater({
    current: version,
    exePath: process.execPath,
    api: process.env.FM_UPDATE_API,
    log: (message) => console.log(message),
    onReady() {
      console.log('  Riavvio automatico appena il gioco non invia dati.');
      const timer = setInterval(() => {
        if (bridge.idleFor() < IDLE_BEFORE_RESTART) return;
        clearInterval(timer);
        restart();
      }, 5000);
    },
  });
}

const shutdown = () => {
  bridge.close();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
