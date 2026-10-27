import type { PacketData } from '../f1/schema.ts';
import { circuits, reversedLayouts } from '../../data/circuits.ts';

// Tracciato della mappa. Il gioco non invia la forma della pista, ma ogni auto comunica distanza sul giro
// e posizione nel mondo: ogni BUCKET metri memorizziamo il primo punto x/z osservato ("appreso").
// Per non aspettare un giro intero partiamo dalla forma reale del circuito (src/data/circuits.ts):
// appena ci sono abbastanza punti appresi la allineiamo al sistema di coordinate del gioco e
// riempiamo i buchi con punti "stimati", sostituiti da quelli osservati man mano che arrivano.
export const BUCKET = 5;

export interface TrackOutline {
  key: string;
  trackId: number;
  length: number;
  x: Float32Array;
  z: Float32Array;
  filled: Uint8Array;
  guessed: Uint8Array;
  drs: Uint8Array;
  count: number;
  fitted: boolean;
  nextFit: number;
  // Trasformazione forma reale → mondo del gioco dell'ultimo allineamento riuscito
  fit?: Fit;
}

export interface Fit {
  c: number;
  s: number;
  mirror: number;
  ax: number;
  ay: number;
  bx: number;
  bz: number;
}

export interface StoredOutline {
  length: number;
  points: (number | null)[];
  drs: number[];
}

// Forma di riferimento ricampionata a passo costante: indice k = frazione di giro k / REF_POINTS
export const REF_POINTS = 400;

export interface Reference {
  x: Float32Array;
  y: Float32Array;
}

const FIT_MIN = 0.12; // copertura appresa minima per tentare l'allineamento
const FIT_STEP = 0.1; // nuovo allineamento ogni 10% di pista appresa in più
const FIT_MAX_SAMPLES = 160;
const FIT_MAX_RESIDUAL = 0.03; // varianza non spiegata accettabile (forma reale ≠ pista del gioco)
const references = new Map<number, Reference | undefined>();

export function referenceFor(trackId: number | undefined): Reference | undefined {
  if (trackId === undefined || trackId < 0) return undefined;
  if (references.has(trackId)) return references.get(trackId);
  const base = reversedLayouts[trackId];
  const flat = circuits[base ?? trackId];
  let reference: Reference | undefined;
  if (flat && flat.length >= 8) {
    let points: [number, number][] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) points.push([flat[i]!, flat[i + 1]!]);
    if (base !== undefined) points = [points[0]!, ...points.slice(1).reverse()];
    reference = resample(points);
  }
  references.set(trackId, reference);
  return reference;
}

function resample(points: [number, number][]): Reference {
  const n = points.length;
  const seg = points.map((p, i) => Math.hypot(points[(i + 1) % n]![0] - p[0], points[(i + 1) % n]![1] - p[1]));
  const total = seg.reduce((a, b) => a + b, 0);
  const x = new Float32Array(REF_POINTS);
  const y = new Float32Array(REF_POINTS);
  let i = 0;
  let walked = 0;
  for (let k = 0; k < REF_POINTS; k++) {
    const target = (k / REF_POINTS) * total;
    while (i < n - 1 && walked + seg[i]! < target) walked += seg[i++]!;
    const p = points[i]!;
    const q = points[(i + 1) % n]!;
    const f = seg[i] ? (target - walked) / seg[i]! : 0;
    x[k] = p[0] + (q[0] - p[0]) * f;
    y[k] = p[1] + (q[1] - p[1]) * f;
  }
  return { x, y };
}

// Punto della forma di riferimento a una frazione di giro (interpolato)
export function referenceAt(ref: Reference, fraction: number): [number, number] {
  const pos = ((((fraction % 1) + 1) % 1) * REF_POINTS) % REF_POINTS;
  const a = Math.floor(pos);
  const b = (a + 1) % REF_POINTS;
  const f = pos - a;
  return [ref.x[a]! + (ref.x[b]! - ref.x[a]!) * f, ref.y[a]! + (ref.y[b]! - ref.y[a]!) * f];
}

export function createOutline(key: string, length: number, trackId = -1): TrackOutline {
  const slots = Math.ceil(length / BUCKET) + 1;
  return {
    key,
    trackId,
    length,
    x: new Float32Array(slots),
    z: new Float32Array(slots),
    filled: new Uint8Array(slots),
    guessed: new Uint8Array(slots),
    drs: new Uint8Array(slots),
    count: 0,
    fitted: false,
    nextFit: Math.ceil(slots * FIT_MIN),
  };
}

// Frazione di pista osservata davvero (i punti stimati non contano)
export const coverage = (outline: TrackOutline) => outline.count / outline.filled.length;

function observe(outline: TrackOutline, i: number, x: number, z: number) {
  if (outline.filled[i] && !outline.guessed[i]) return;
  outline.x[i] = x;
  outline.z[i] = z;
  outline.filled[i] = 1;
  outline.guessed[i] = 0;
  outline.count++;
}

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
    observe(outline, i, car.worldPositionX, car.worldPositionZ);
    // Zone DRS apprese dove le auto aprono davvero l'ala (formato 2025: non sono nel pacchetto)
    if (telemetry?.carTelemetryData[index]?.drs) outline.drs[i] = 1;
  });
  // Nuovi allineamenti finché la pista non è quasi tutta osservata (almeno uno serve per orientare la mappa)
  if (outline.count >= outline.nextFit && (!outline.fitted || coverage(outline) < 0.95)) {
    outline.nextFit = outline.count + Math.ceil(outline.filled.length * FIT_STEP);
    const ref = referenceFor(outline.trackId);
    if (ref) fitReference(outline, ref);
  }
}

// Allinea la forma di riferimento ai punti appresi: trasformazione di similitudine (rotazione, scala,
// traslazione, eventuale specchiatura) con lo sfasamento del traguardo e il verso di marcia ignoti.
// Procrustes in forma chiusa per ogni candidato, si tiene quello con meno varianza non spiegata.
export function fitReference(outline: TrackOutline, ref: Reference): number {
  const observed: number[] = [];
  for (let i = 0; i < outline.filled.length; i++) if (outline.filled[i] && !outline.guessed[i]) observed.push(i);
  if (observed.length < 12) return Infinity;
  const step = Math.max(1, Math.floor(observed.length / FIT_MAX_SAMPLES));
  const samples = observed.filter((_, k) => k % step === 0);
  const fractions = samples.map((i) => (i * BUCKET) / outline.length);
  const bx = samples.map((i) => outline.x[i]!);
  const bz = samples.map((i) => outline.z[i]!);
  const n = samples.length;
  const meanBx = bx.reduce((a, b) => a + b, 0) / n;
  const meanBz = bz.reduce((a, b) => a + b, 0) / n;
  let sbb = 0;
  for (let k = 0; k < n; k++) sbb += (bx[k]! - meanBx) ** 2 + (bz[k]! - meanBz) ** 2;
  if (!(sbb > 0)) return Infinity;

  let best = { residual: Infinity, dir: 1, mirror: 1, offset: 0, sxx: 0, sxy: 0, saa: 1, ax: 0, ay: 0 };
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  for (const dir of [1, -1]) {
    for (const mirror of [1, -1]) {
      for (let o = 0; o < REF_POINTS; o++) {
        const offset = o / REF_POINTS;
        let mx = 0;
        let my = 0;
        for (let k = 0; k < n; k++) {
          const [rx, ry] = referenceAt(ref, dir * fractions[k]! + offset);
          ax[k] = rx;
          ay[k] = ry * mirror;
          mx += rx;
          my += ry * mirror;
        }
        mx /= n;
        my /= n;
        let sxx = 0;
        let sxy = 0;
        let saa = 0;
        for (let k = 0; k < n; k++) {
          const px = ax[k]! - mx;
          const py = ay[k]! - my;
          const qx = bx[k]! - meanBx;
          const qz = bz[k]! - meanBz;
          sxx += px * qx + py * qz;
          sxy += px * qz - py * qx;
          saa += px * px + py * py;
        }
        if (!(saa > 0)) continue;
        const residual = 1 - (sxx * sxx + sxy * sxy) / saa / sbb;
        if (residual < best.residual) best = { residual, dir, mirror, offset, sxx, sxy, saa, ax: mx, ay: my };
      }
    }
  }
  if (best.residual > FIT_MAX_RESIDUAL) return best.residual;

  // Trasformazione: b = s·R·(a − media a) + media b, con s·cos = sxx/saa e s·sin = sxy/saa
  const c = best.sxx / best.saa;
  const s = best.sxy / best.saa;
  const slots = outline.filled.length;
  const predict = (i: number): [number, number] => {
    const [rx, ry] = referenceAt(ref, best.dir * ((i * BUCKET) / outline.length) + best.offset);
    const px = rx - best.ax;
    const py = ry * best.mirror - best.ay;
    return [meanBx + c * px - s * py, meanBz + s * px + c * py];
  };
  // Scarto tra osservato e previsto nei punti osservati: lungo ogni tratto stimato lo si interpola fra i due
  // estremi osservati, così i raccordi restano continui (niente "speroni" dove finisce la parte appresa)
  const ex = new Float32Array(slots);
  const ez = new Float32Array(slots);
  const real = (i: number) => outline.filled[i] === 1 && outline.guessed[i] === 0;
  for (let i = 0; i < slots; i++) {
    if (!real(i)) continue;
    const [x, z] = predict(i);
    ex[i] = outline.x[i]! - x;
    ez[i] = outline.z[i]! - z;
  }
  let previous = -1;
  for (let i = slots - 1; i >= 0 && previous < 0; i--) if (real(i)) previous = i - slots;
  for (let i = 0; i < slots; i++) {
    if (real(i)) {
      previous = i;
      continue;
    }
    let next = i + 1;
    while (!real(next % slots) && next < i + slots) next++;
    const a = (previous + slots) % slots;
    const b = next % slots;
    const f = next - previous > 0 ? (i - previous) / (next - previous) : 0;
    const [x, z] = predict(i);
    outline.x[i] = x + ex[a]! + (ex[b]! - ex[a]!) * f;
    outline.z[i] = z + ez[a]! + (ez[b]! - ez[a]!) * f;
    outline.filled[i] = 1;
    outline.guessed[i] = 1;
  }
  outline.fitted = true;
  outline.fit = { c, s, mirror: best.mirror, ax: best.ax, ay: best.ay, bx: meanBx, bz: meanBz };
  return best.residual;
}

// Punto del mondo del gioco riportato nel piano della forma reale (x = est, y = nord): la mappa resta
// orientata come il circuito vero anche dopo l'allineamento
export function toReference(fit: Fit, x: number, z: number): [number, number] {
  const qx = x - fit.bx;
  const qz = z - fit.bz;
  const k = fit.c * fit.c + fit.s * fit.s || 1;
  const px = (fit.c * qx + fit.s * qz) / k + fit.ax;
  const py = (-fit.s * qx + fit.c * qz) / k + fit.ay;
  return [px, py * fit.mirror];
}

export function serializeOutline(outline: TrackOutline): StoredOutline {
  const points: (number | null)[] = [];
  outline.filled.forEach((filled, i) => {
    const real = filled && !outline.guessed[i];
    points.push(real ? Math.round(outline.x[i]! * 10) / 10 : null, real ? Math.round(outline.z[i]! * 10) / 10 : null);
  });
  return { length: outline.length, points, drs: [...outline.drs.keys()].filter((i) => outline.drs[i]) };
}

// Integra un tracciato salvato senza sovrascrivere ciò che è già stato osservato in questa sessione
export function restoreOutline(outline: TrackOutline, stored: StoredOutline) {
  if (stored.length !== outline.length) return;
  for (let i = 0; i < outline.filled.length; i++) {
    const x = stored.points[i * 2];
    const z = stored.points[i * 2 + 1];
    if (x === null || x === undefined || z === null || z === undefined) continue;
    observe(outline, i, x, z);
  }
  stored.drs.forEach((i) => (outline.drs[i] = 1));
  const ref = referenceFor(outline.trackId);
  if (ref && coverage(outline) >= FIT_MIN) fitReference(outline, ref);
}
