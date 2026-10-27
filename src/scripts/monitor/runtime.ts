import type { Packet, PacketKind, UdpFormat } from '@lib/f1/schema';
import { applyPacket, createRaceState } from '@lib/telemetry/state';
import { buildView, type RaceView } from '@lib/telemetry/view';
import { coverage, restoreOutline, serializeOutline, type StoredOutline } from '@lib/telemetry/track';
import { readJson, writeJson } from '../prefs';

// Stato + ciclo di rendering: i pacchetti aggiornano lo stato, la vista si ricostruisce
// al massimo una volta per frame e solo se qualcosa è cambiato.
type Listener = (view: RaceView) => void;

const TRACK_SAVE_COVERAGE = 0.9;

export interface Runtime {
  push(packet: Packet, format: UdpFormat): void;
  reset(): void;
  subscribe(listener: Listener): () => void;
  readonly view: RaceView;
  readonly stats: { fps: number; packetsPerSecond: number; lastPacketAt: number };
  readonly counts: Partial<Record<PacketKind, number>>;
}

export function createRuntime(): Runtime {
  let state = createRaceState();
  let view = buildView(state);
  let rendered = -1;
  let frames = 0;
  let packets = 0;
  const listeners = new Set<Listener>();
  const stats = { fps: 0, packetsPerSecond: 0, lastPacketAt: 0 };

  // Tracciati appresi salvati per circuito: la mappa è completa da subito alla sessione successiva
  let trackKey = '';
  let trackSaved = 0;
  const syncTrack = () => {
    const track = state.track;
    if (!track) return;
    const key = `fm:track:${track.key}`;
    if (track.key !== trackKey) {
      trackKey = track.key;
      const stored = readJson<StoredOutline | null>(key, null);
      if (stored) restoreOutline(track, stored);
      trackSaved = track.count;
    } else if (coverage(track) > TRACK_SAVE_COVERAGE && track.count - trackSaved > track.filled.length * 0.02) {
      writeJson(key, serializeOutline(track));
      trackSaved = track.count;
    }
  };

  const frame = () => {
    syncTrack();
    if (state.version !== rendered) {
      rendered = state.version;
      view = buildView(state);
      listeners.forEach((listener) => listener(view));
      frames++;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  window.setInterval(() => {
    stats.fps = frames;
    stats.packetsPerSecond = packets;
    frames = 0;
    packets = 0;
  }, 1000);

  return {
    push(packet, format) {
      applyPacket(state, packet, format);
      packets++;
      stats.lastPacketAt = performance.now();
    },
    reset() {
      state = createRaceState();
      rendered = -1;
      state.version = 0;
      view = buildView(state);
      listeners.forEach((listener) => listener(view));
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(view);
      return () => listeners.delete(listener);
    },
    get view() {
      return view;
    },
    get counts() {
      return state.counts;
    },
    stats,
  };
}
