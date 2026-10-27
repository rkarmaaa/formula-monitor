import type { PacketData } from '../f1/schema.ts';

// Tracciato appreso: il gioco non invia la forma della pista, ma ogni auto comunica distanza sul
// giro e posizione nel mondo. Ogni BUCKET metri memorizziamo il primo punto x/z osservato.
export const BUCKET = 5;

export interface TrackOutline {
  key: string;
  length: number;
  x: Float32Array;
  z: Float32Array;
  filled: Uint8Array;
  drs: Uint8Array;
  count: number;
}

export interface StoredOutline {
  length: number;
  points: (number | null)[];
  drs: number[];
}

export function createOutline(key: string, length: number): TrackOutline {
  const slots = Math.ceil(length / BUCKET) + 1;
  return {
    key,
    length,
    x: new Float32Array(slots),
    z: new Float32Array(slots),
    filled: new Uint8Array(slots),
    drs: new Uint8Array(slots),
    count: 0,
  };
}

export const coverage = (outline: TrackOutline) => outline.count / outline.filled.length;

export function learnOutline(
  outline: TrackOutline,
  motion: PacketData<'motion'>,
  lapData: PacketData<'lapData'>,
  telemetry?: PacketData<'carTelemetry'>,
) {
  lapData.lapData.forEach((lap, index) => {
    const car = motion.carMotionData[index];
    const d = lap.lapDistance;
    if (!car || lap.resultStatus !== 2 || lap.pitStatus > 0 || d < 0 || d >= outline.length) return;
    const i = Math.floor(d / BUCKET);
    if (!outline.filled[i]) {
      outline.x[i] = car.worldPositionX;
      outline.z[i] = car.worldPositionZ;
      outline.filled[i] = 1;
      outline.count++;
    }
    // Zone DRS apprese dove le auto aprono davvero l'ala (formato 2025: non sono nel pacchetto)
    if (telemetry?.carTelemetryData[index]?.drs) outline.drs[i] = 1;
  });
}

export function serializeOutline(outline: TrackOutline): StoredOutline {
  const points: (number | null)[] = [];
  outline.filled.forEach((filled, i) => {
    points.push(
      filled ? Math.round(outline.x[i]! * 10) / 10 : null,
      filled ? Math.round(outline.z[i]! * 10) / 10 : null,
    );
  });
  return { length: outline.length, points, drs: [...outline.drs.keys()].filter((i) => outline.drs[i]) };
}

// Integra un tracciato salvato senza sovrascrivere ciò che è già stato osservato in questa sessione
export function restoreOutline(outline: TrackOutline, stored: StoredOutline) {
  if (stored.length !== outline.length) return;
  for (let i = 0; i < outline.filled.length; i++) {
    const x = stored.points[i * 2];
    const z = stored.points[i * 2 + 1];
    if (outline.filled[i] || x === null || x === undefined || z === null || z === undefined) continue;
    outline.x[i] = x;
    outline.z[i] = z;
    outline.filled[i] = 1;
    outline.count++;
  }
  stored.drs.forEach((i) => (outline.drs[i] = 1));
}
