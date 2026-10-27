import type { CarView, RaceView } from '@lib/telemetry/view';
import { teamOf } from '@data/teams';
import { BUCKET, coverage, REF_POINTS, referenceAt, toReference } from '@lib/telemetry/track';
import { createSurface } from './canvas';

// Mappa del circuito in due modalità:
// - "mondo": tracciato appreso dalle auto (completato dalla forma reale allineata), auto alle coordinate x/z;
// - "riferimento": prima che il tracciato sia pronto, la forma reale del circuito con le auto posizionate
//   in base alla distanza percorsa sul giro. Così la mappa c'è già dal garage, prima di girare.
interface Sample {
  d: number;
  x: number;
  y: number;
}

const READY = 0.6;
const GAP_BREAK = 120; // metri: buchi più lunghi spezzano la linea
const COLORS = [
  'map-track',
  'map-edge',
  'map-sector',
  'map-drs',
  'map-yellow',
  'map-player',
  'map-label',
  'map-label-bg',
  'map-start',
];

export function createMap(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-map-canvas]')!;
  const status = root.querySelector<HTMLElement>('[data-map-status]');
  let view: RaceView | undefined;
  const surface = createSurface(canvas, COLORS, () => draw());

  function draw() {
    const { ctx, width, height, colors } = surface;
    ctx.clearRect(0, 0, width, height);
    if (!view || !width || !height) return;
    const o = view.track;
    const ref = view.reference;
    const length = view.trackLength || o?.length || 0;
    const world = Boolean(o && (o.fitted || coverage(o) >= READY));
    // Con un allineamento riuscito tutto (tracciato e auto) torna nel piano della forma reale, nord in alto
    const fit = world ? o?.fit : undefined;
    const plane = (x: number, z: number): [number, number] => (fit ? toReference(fit, x, z) : [x, z]);
    const samples: Sample[] = [];
    if (o && (world || !ref)) {
      for (let i = 0; i < o.filled.length; i++) {
        if (!o.filled[i]) continue;
        const [x, y] = plane(o.x[i]!, o.z[i]!);
        samples.push({ d: i * BUCKET, x, y });
      }
    } else if (ref && length) {
      for (let k = 0; k < REF_POINTS; k++) samples.push({ d: (k / REF_POINTS) * length, x: ref.x[k]!, y: ref.y[k]! });
    }
    if (status) status.hidden = samples.length > 0 || !view.session;
    if (samples.length < 2) return;

    // Posizione di un'auto nello stesso piano dei campioni
    const carPoint = (car: CarView): [number, number] | undefined => {
      if (world || !ref) return car.motion ? plane(car.motion.worldPositionX, car.motion.worldPositionZ) : undefined;
      // Prima del via (griglia, giro di uscita) la distanza è negativa: l'auto è prima del traguardo
      const raw = car.lap?.lapDistance;
      if (raw === undefined || !length || car.inGarage || raw < -length) return undefined;
      const d = raw < 0 ? length + raw : raw;
      return referenceAt(ref, d / length);
    };

    // Orientamento: 0° o 90°, quello in cui il tracciato riempie meglio il riquadro.
    // Vista dall'alto: y del piano verso l'alto (y dello schermo invertita)
    let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const s of samples) {
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y);
      maxY = Math.max(maxY, s.y);
    }
    const [w, h] = [maxX - minX || 1, maxY - minY || 1];
    const turn = Math.min(width / w, height / h) < Math.min(width / h, height / w);
    const rotate = (x: number, y: number): [number, number] => (turn ? [y, x] : [x, -y]);
    let [rMinX, rMaxX, rMinY, rMaxY] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const s of samples) {
      const [rx, ry] = rotate(s.x, s.y);
      rMinX = Math.min(rMinX, rx);
      rMaxX = Math.max(rMaxX, rx);
      rMinY = Math.min(rMinY, ry);
      rMaxY = Math.max(rMaxY, ry);
    }
    const pad = Math.max(16, Math.min(width, height) * 0.08);
    const scale = Math.min((width - pad * 2) / (rMaxX - rMinX || 1), (height - pad * 2) / (rMaxY - rMinY || 1));
    const offsetX = (width - (rMaxX - rMinX) * scale) / 2;
    const offsetY = (height - (rMaxY - rMinY) * scale) / 2;
    const project = (x: number, y: number): [number, number] => {
      const [rx, ry] = rotate(x, y);
      return [offsetX + (rx - rMinX) * scale, offsetY + (ry - rMinY) * scale];
    };
    const unit = Math.max(1, Math.min(width, height) / 180);

    const segment = (from: number, to: number, closed = false) => {
      const path = new Path2D();
      let last: Sample | undefined;
      let first: Sample | undefined;
      for (const s of samples) {
        if (s.d < from || s.d > to) continue;
        const [px, py] = project(s.x, s.y);
        if (last && s.d - last.d <= GAP_BREAK) path.lineTo(px, py);
        else path.moveTo(px, py);
        first ??= s;
        last = s;
      }
      if (closed && first && last && length - last.d + first.d <= GAP_BREAK) path.lineTo(...project(first.x, first.y));
      return path;
    };
    const stroke = (path: Path2D, color: string, lineWidth: number, dash: number[] = []) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.setLineDash(dash);
      ctx.stroke(path);
      ctx.setLineDash([]);
    };

    const trackWidth = 4 * unit;
    const full = segment(0, length, true);
    stroke(full, colors['map-edge'] ?? '', trackWidth + 3 * unit);
    stroke(full, colors['map-track'] ?? '', trackWidth);

    // Zone DRS (2026: dal pacchetto, 2025: dove le auto aprono l'ala) e bandiere gialle
    const session = view.session;
    const drs =
      session?.drsZones && session.numDRSZones
        ? session.drsZones.slice(0, session.numDRSZones).map((z) => [z.zoneStart * length, z.zoneEnd * length])
        : o && world
          ? runs(o.drs).map(([a, b]) => [a * BUCKET, b * BUCKET])
          : [];
    drs.forEach(([a, b]) =>
      stroke(segment(a!, b!), colors['map-drs'] ?? '', Math.max(1.5, unit), [3 * unit, 3 * unit]),
    );
    const zones = session?.marshalZones.slice(0, session.numMarshalZones) ?? [];
    zones.forEach((zone, i) => {
      if (zone.zoneFlag !== 3) return;
      const end = zones[i + 1]?.zoneStart ?? 1;
      stroke(segment(zone.zoneStart * length, end * length), colors['map-yellow'] ?? '', trackWidth + 3 * unit);
    });

    // Tacche: traguardo (bianca, lunga) e inizio dei settori (grigie)
    const tick = (d: number, color: string, size: number) => {
      const i = Math.max(
        0,
        samples.findIndex((s) => s.d >= d),
      );
      const a = samples[i];
      const b = samples[Math.min(samples.length - 1, i + 1)];
      if (!a || !b || a === b) return;
      const [ax, ay] = project(a.x, a.y);
      const [bx, by] = project(b.x, b.y);
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const [nx, ny] = [-(by - ay) / len, (bx - ax) / len];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      ctx.moveTo(ax - nx * size, ay - ny * size);
      ctx.lineTo(ax + nx * size, ay + ny * size);
      ctx.stroke();
    };
    view.sectorStarts.slice(1).forEach((d) => d > 0 && tick(d, colors['map-sector'] ?? '', trackWidth));
    tick(0, colors['map-start'] ?? '', trackWidth + 4 * unit);

    // Auto: quadrati colore team; il giocatore più grande, bordato di bianco e con etichetta
    const cars = view.cars.filter((car) => !car.retired);
    cars.sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer) || b.position - a.position);
    for (const car of cars) {
      const point = carPoint(car);
      if (!point) continue;
      const [px, py] = project(point[0], point[1]);
      const size = (car.isPlayer ? 5 : 3.4) * unit;
      ctx.globalAlpha = car.inPit ? 0.4 : 1;
      if (car.isPlayer) {
        ctx.fillStyle = colors['map-player'] ?? '';
        ctx.fillRect(px - size - unit, py - size - unit, (size + unit) * 2, (size + unit) * 2);
      }
      ctx.fillStyle = teamOf(car.teamId).color;
      ctx.fillRect(px - size, py - size, size * 2, size * 2);
      if (car.isPlayer || car.position === 1) {
        const fontSize = Math.round(Math.max(10, 5 * unit));
        ctx.font = `600 ${fontSize}px ${surface.font}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const text = car.isPlayer ? car.code : `P1 ${car.code}`;
        const x = px + size + 3 * unit;
        ctx.fillStyle = colors['map-label-bg'] ?? '';
        ctx.fillRect(x - 3, py - fontSize * 0.65, ctx.measureText(text).width + 6, fontSize * 1.3);
        ctx.fillStyle = car.isPlayer ? (colors['map-player'] ?? '') : (colors['map-label'] ?? '');
        ctx.fillText(text, x, py);
      }
      ctx.globalAlpha = 1;
    }
  }

  return {
    update(next: RaceView) {
      view = next;
      draw();
    },
    destroy: () => surface.destroy(),
  };
}

// Tratti contigui di bucket marcati (zone DRS apprese dove le auto aprono l'ala)
function runs(marks: Uint8Array): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= marks.length; i++) {
    if (i < marks.length && marks[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - start > 6) out.push([start, i]);
      start = -1;
    }
  }
  return out;
}
