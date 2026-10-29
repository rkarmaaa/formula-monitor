// Circuito sintetico: spline Catmull-Rom chiusa, campionata ogni STEP metri, con profilo di velocità
// fisicamente plausibile (limite di aderenza in curva + accelerazione/frenata massime).
export const STEP = 5;

export interface Track {
  length: number;
  samples: number;
  x: Float32Array;
  z: Float32Array;
  curvature: Float32Array;
  speed: Float32Array;
  drsZones: [number, number][];
  speedTrap: number;
}

const V_MAX = 93; // m/s ≈ 335 km/h
const V_MIN = 19;
const LATERAL_GRIP = 35; // m/s² in curva

// Come nei dati reali: in frenata ~5 g a 300 km/h e ~3 g sotto i 100 (il carico aerodinamico cala con la
// velocità); trazione limitata dal motore in alto e dalle gomme in basso
export const braking = (v: number) => 26 + 0.0034 * v * v;
export const accel = (v: number) => Math.max(3, 17 - 0.15 * v);
// Resistenza aerodinamica (m/s²): rallenta l'auto anche senza freno e chiede gas per tenere la velocità
export const drag = (v: number) => 0.0012 * v * v;

// Cerchio di aderenza: la parte di grip usata in curva non è disponibile per frenare o accelerare. Ne nascono la
// frenata "a scalare" verso il punto di corda e la pressione progressiva del gas in uscita.
const longitudinal = (v: number, k: number) =>
  Math.sqrt(Math.max(0.04, 1 - ((v * v * Math.abs(k)) / LATERAL_GRIP) ** 4));

function catmullRom(points: [number, number][], substeps = 48): [number, number][] {
  const out: [number, number][] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((k) => points[(i + k + n) % n]!);
    for (let s = 0; s < substeps; s++) {
      const t = s / substeps;
      const t2 = t * t;
      const t3 = t2 * t;
      const axis = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([axis(p0![0], p1![0], p2![0], p3![0]), axis(p0![1], p1![1], p2![1], p3![1])]);
    }
  }
  return out;
}

function resample(dense: [number, number][], length: number) {
  const seg = dense.map((p, i) => {
    const q = dense[(i + 1) % dense.length]!;
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  const raw = seg.reduce((a, b) => a + b, 0);
  const scale = length / raw;
  const samples = Math.round(length / STEP);
  const x = new Float32Array(samples);
  const z = new Float32Array(samples);
  let i = 0;
  let walked = 0;
  for (let k = 0; k < samples; k++) {
    const target = (k * STEP) / scale;
    while (walked + seg[i]! < target && i < dense.length - 1) walked += seg[i++]!;
    const p = dense[i]!;
    const q = dense[(i + 1) % dense.length]!;
    const f = seg[i] ? (target - walked) / seg[i]! : 0;
    x[k] = (p[0] + (q[0] - p[0]) * f) * scale;
    z[k] = (p[1] + (q[1] - p[1]) * f) * scale;
  }
  return { x, z, samples };
}

function smooth(values: Float32Array, radius: number): Float32Array {
  const n = values.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += values[(i + k + n) % n]!;
    out[i] = sum / (2 * radius + 1);
  }
  return out;
}

export function buildTrack(control: [number, number][], length: number): Track {
  const { x, z, samples } = resample(catmullRom(control), length);
  const heading = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const j = (i + 1) % samples;
    heading[i] = Math.atan2(z[j]! - z[i]!, x[j]! - x[i]!);
  }
  const rawCurvature = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    let d = heading[(i + 1) % samples]! - heading[i]!;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    rawCurvature[i] = d / STEP;
  }
  const curvature = smooth(rawCurvature, 3);

  const speed = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const k = Math.abs(curvature[i]!);
    speed[i] = Math.max(V_MIN, Math.min(V_MAX, k > 1e-5 ? Math.sqrt(LATERAL_GRIP / k) : V_MAX));
  }
  // Due giri di passate per chiudere il profilo sul traguardo
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < samples; i++) {
      const j = (i + 1) % samples;
      const grip = longitudinal(speed[i]!, curvature[i]!);
      speed[j] = Math.min(speed[j]!, Math.sqrt(speed[i]! ** 2 + 2 * accel(speed[i]!) * grip * STEP));
    }
    for (let i = samples - 1; i >= 0; i--) {
      const j = (i - 1 + samples) % samples;
      const grip = longitudinal(speed[i]!, curvature[i]!);
      speed[j] = Math.min(speed[j]!, Math.sqrt(speed[i]! ** 2 + 2 * braking(speed[i]!) * grip * STEP));
    }
  }

  // Zone DRS: i due rettilinei più lunghi (curvatura minima), attivazione dopo 80 m
  const straights: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= samples; i++) {
    const straight = i < samples && Math.abs(curvature[i]!) < 0.0016;
    if (straight && start < 0) start = i;
    if (!straight && start >= 0) {
      straights.push([start * STEP, i * STEP]);
      start = -1;
    }
  }
  const drsZones = straights
    .filter(([a, b]) => b - a > 450)
    .sort((a, b) => b[1] - b[0] - (a[1] - a[0]))
    .slice(0, 2)
    .map(([a, b]): [number, number] => [a + 80, b - 40]);

  return { length, samples, x, z, curvature, speed, drsZones, speedTrap: drsZones[0]?.[1] ?? length * 0.9 };
}

export const sampleAt = (track: Track, distance: number) => {
  const d = ((distance % track.length) + track.length) % track.length;
  return Math.min(track.samples - 1, Math.floor(d / STEP));
};
