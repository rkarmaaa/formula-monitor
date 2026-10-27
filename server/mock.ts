import dgram from 'node:dgram';
import { encodePacket } from '../src/lib/f1/codec.ts';
import { isUdpFormat } from '../src/lib/f1/schema.ts';
import { createSimulator } from '../src/lib/sim/simulator.ts';
import { ports } from '../src/data/games.ts';

// Gioco finto: invia via UDP pacchetti F1 reali generati dal simulatore, per provare bridge e monitor
// senza console. Uso: npm run mock -- --format 2026 --session quali --rate 30 --host 127.0.0.1 --port 20777
const option = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

const format = Number(option('format', '2025'));
if (!isUdpFormat(format)) throw new Error(`Formato non supportato: ${format} (usa 2025 o 2026)`);
const host = option('host', '127.0.0.1');
const port = Number(option('port', String(ports.udp)));
const rate = Number(option('rate', '30'));
const laps = Number(option('laps', '18'));
const session = option('session', 'race') === 'quali' ? 'qualifying' : 'race';

const socket = dgram.createSocket('udp4');
const sim = createSimulator({ format, session, rate, laps, seed: Date.now() % 100_000 });
const TICK = 1000 / 60;
let last = performance.now();
let sent = 0;

setInterval(() => {
  const now = performance.now();
  for (const packet of sim.step((now - last) / 1000)) {
    socket.send(new Uint8Array(encodePacket(format, packet)), port, host);
    sent++;
  }
  last = now;
}, TICK);

setInterval(() => process.stdout.write(`\r  mock F1 ${format} → ${host}:${port} · ${sent} pacchetti inviati`), 1000);
const what = session === 'qualifying' ? 'qualifica' : `gara, ${laps} giri`;
console.log(`\n  Simulazione F1: ${what} (formato ${format}, ${rate} Hz). Ctrl+C per fermare.\n`);
