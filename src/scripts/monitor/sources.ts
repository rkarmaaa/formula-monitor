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
const SIM_RATE = 30;
// Qualifica: la sessione si porta avanti fino a un giro lanciato valido (al massimo 6 minuti simulati)
const WARMUP_MAX_S = 360;
const WARMUP_AFTER_S = 3;

// Solo per sviluppo (?demo): il simulatore nel browser, senza bridge né gioco.
// In qualifica il giocatore ha già completato il giro di lancio e un giro lanciato: si vede subito il delta.
export function startDemo(runtime: Runtime, format: UdpFormat, session: SimSession): DemoSource {
  const sim = createSimulator({ format, session, rate: SIM_RATE, seed: Math.floor(Math.random() * 100_000) });
  if (session === 'qualifying') {
    const step = 1 / SIM_RATE;
    let after = 0;
    for (let t = 0; t < WARMUP_MAX_S && after < WARMUP_AFTER_S; t += step) {
      for (const packet of sim.step(step)) runtime.push(packet, format);
      if (runtime.referenceMs > 0) after += step;
    }
  }
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
