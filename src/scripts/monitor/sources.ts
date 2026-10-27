import { decodePacket, type DecodeResult } from '@lib/f1/codec';
import type { UdpFormat } from '@lib/f1/schema';
import { createSimulator, type SimSession } from '@lib/sim/simulator';
import { connectBridge, type BridgeState, type BridgeStatus } from '../bridge';
import type { Runtime } from './runtime';

// Sorgenti dati del monitor: il bridge (gioco reale o mock UDP) oppure il simulatore nel browser.
export interface BridgeSource {
  stop(): void;
}

export function startBridge(
  runtime: Runtime,
  handlers: {
    onState: (state: BridgeState) => void;
    onStatus: (status: BridgeStatus) => void;
    onFormat: (format: UdpFormat) => void;
    onReject: (result: Extract<DecodeResult, { ok: false }>) => void;
  },
): BridgeSource {
  let lastFormat: number | undefined;
  const stop = connectBridge({
    onState: handlers.onState,
    onStatus: handlers.onStatus,
    onPacket(data) {
      const result = decodePacket(data);
      if (!result.ok) return handlers.onReject(result);
      if (result.format !== lastFormat) handlers.onFormat((lastFormat = result.format));
      runtime.push(result.packet, result.format);
    },
  });
  return { stop };
}

export interface DemoSource {
  stop(): void;
}

const TICK_MS = 1000 / 60;

// Solo per sviluppo (?demo): il simulatore nel browser, senza bridge né gioco
export function startDemo(runtime: Runtime, format: UdpFormat, session: SimSession): DemoSource {
  const sim = createSimulator({ format, session, rate: 30, seed: Math.floor(Math.random() * 100_000) });
  let last = performance.now();
  // Timer invece di rAF: la gara prosegue anche con la scheda in background
  const timer = window.setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    for (const packet of sim.step(dt)) runtime.push(packet, format);
  }, TICK_MS);
  return { stop: () => window.clearInterval(timer) };
}
