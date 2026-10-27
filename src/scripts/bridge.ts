import { wsPath } from '@data/games';
import type { BridgeStatus } from '../../server/bridge';

// Client WebSocket del bridge locale con riconnessione automatica.
// Frame binari = pacchetti UDP del gioco, frame di testo = stato del bridge (JSON).
export type BridgeState = 'connecting' | 'open' | 'closed';
export type { BridgeStatus };

interface Handlers {
  onPacket?: (data: ArrayBuffer) => void;
  onStatus?: (status: BridgeStatus) => void;
  onState?: (state: BridgeState) => void;
}

const RETRY_MIN = 1000;
const RETRY_MAX = 6000;

// ?bridge=192.168.1.20:20780 per collegarsi a un bridge diverso dalla pagina corrente
function bridgeUrl() {
  const override = new URLSearchParams(location.search).get('bridge');
  const secure = location.protocol === 'https:';
  return `${secure ? 'wss' : 'ws'}://${override ?? location.host}${wsPath}`;
}

export function connectBridge(handlers: Handlers): () => void {
  let socket: WebSocket | undefined;
  let retry = RETRY_MIN;
  let timer: number | undefined;
  let stopped = false;

  const open = () => {
    handlers.onState?.('connecting');
    socket = new WebSocket(bridgeUrl());
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      retry = RETRY_MIN;
      handlers.onState?.('open');
    };
    socket.onmessage = (message: MessageEvent<ArrayBuffer | string>) => {
      if (typeof message.data === 'string') {
        try {
          handlers.onStatus?.(JSON.parse(message.data) as BridgeStatus);
        } catch {
          /* messaggio non valido: ignorato */
        }
      } else handlers.onPacket?.(message.data);
    };
    socket.onclose = () => {
      handlers.onState?.('closed');
      if (stopped) return;
      timer = window.setTimeout(open, retry);
      retry = Math.min(RETRY_MAX, retry * 1.6);
    };
  };

  open();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    socket?.close();
  };
}

export const monitorUrl = (status: BridgeStatus) => {
  const host = status.addresses[0] ?? location.hostname;
  const port = status.httpPort ?? location.port;
  return `http://${host}${port ? `:${port}` : ''}/monitor/`;
};
