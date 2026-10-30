import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { ports, wsPath } from '../src/data/games.ts';

// Ponte UDP → WebSocket: i browser non ricevono UDP, quindi il bridge inoltra i datagrammi del gioco
// così come sono (frame binari). Il parsing avviene nel browser con lo stesso codec del simulatore.
export interface BridgeStatus {
  type: 'status';
  udpPort: number;
  httpPort?: number;
  addresses: string[];
  packets: number;
  rate: number;
  lastPacketAgo?: number;
  clients: number;
  error?: string;
  // Versione dell'app (exe): se cambia dopo un aggiornamento la pagina si ricarica
  version?: string;
}

interface BridgeOptions {
  server: Server;
  udpPort?: number;
  httpPort?: number;
  version?: string;
  log?: (message: string) => void;
}

const STATUS_INTERVAL = 1000;
const MAX_BUFFERED = 1_000_000; // client lento: salta i pacchetti invece di accumulare memoria

// IPv4 della rete locale, prima quelle domestiche (192.168.x) che sono quasi sempre quelle giuste
export function lanAddresses(): string[] {
  const all = Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net!.address);
  const rank = (ip: string) =>
    ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3;
  return [...new Set(all)].sort((a, b) => rank(a) - rank(b));
}

export function createBridge({ server, udpPort = ports.udp, httpPort, version, log = console.log }: BridgeOptions) {
  const wss = new WebSocketServer({ noServer: true });
  const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const addresses = lanAddresses();
  let packets = 0;
  let window = 0;
  let rate = 0;
  let lastPacket = 0;
  let error: string | undefined;

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== wsPath) return;
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  };
  server.on('upgrade', onUpgrade);

  const status = (): BridgeStatus => ({
    type: 'status',
    udpPort,
    httpPort,
    addresses,
    packets,
    rate,
    lastPacketAgo: lastPacket ? Date.now() - lastPacket : undefined,
    clients: wss.clients.size,
    error,
    version,
  });

  const broadcast = (data: Buffer | string, binary: boolean) => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN && client.bufferedAmount < MAX_BUFFERED) client.send(data, { binary });
    }
  };

  wss.on('connection', (ws) => ws.send(JSON.stringify(status())));

  udp.on('message', (message) => {
    packets++;
    window++;
    lastPacket = Date.now();
    broadcast(message, true);
  });
  udp.on('error', (err: NodeJS.ErrnoException) => {
    error = err.code === 'EADDRINUSE' ? `porta UDP ${udpPort} già in uso` : err.message;
    log(`[formula-monitor] UDP: ${error}`);
  });
  udp.on('listening', () => log(`[formula-monitor] in ascolto UDP sulla porta ${udpPort}`));
  udp.bind(udpPort);

  const timer = setInterval(() => {
    rate = window;
    window = 0;
    broadcast(JSON.stringify(status()), false);
  }, STATUS_INTERVAL);

  return {
    addresses,
    // Millisecondi dall'ultimo pacchetto del gioco (Infinity se non ne è mai arrivato uno)
    idleFor: () => (lastPacket ? Date.now() - lastPacket : Infinity),
    close() {
      clearInterval(timer);
      server.off('upgrade', onUpgrade);
      wss.clients.forEach((client) => client.terminate());
      wss.close();
      udp.close();
    },
  };
}
