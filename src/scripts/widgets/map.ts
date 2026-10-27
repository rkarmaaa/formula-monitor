import type { CarView, RaceView } from '@lib/telemetry/view';
import { teamOf } from '@data/teams';
import { t } from '@i18n/index';
import { BUCKET, coverage, type TrackOutline } from '@lib/telemetry/track';
import { readJson, writeJson } from '../prefs';
import { createSurface } from './canvas';

// Mappa del circuito. Il tracciato non arriva via UDP: lo "impariamo" dalle posizioni di tutte le
// auto (lapDistance → x/z ogni 5 m), lo salviamo per circuito e lo riusiamo alla sessione successiva.
export interface MapOptions {
  preset: 'broadcast' | 'minimal' | 'neon' | 'blueprint';
  labels: 'code' | 'position' | 'none';
  sectors: boolean;
  drs: boolean;
  startLine: boolean;
  trail: boolean;
  rivalsOnly: boolean;
  follow: boolean;
  rotation: 'auto' | '0' | '90' | '180' | '270';
}

export const MAP_DEFAULTS: MapOptions = {
  preset: 'broadcast',
  labels: 'code',
  sectors: true,
  drs: true,
  startLine: true,
  trail: false,
  rivalsOnly: false,
  follow: false,
  rotation: 'auto',
};

const OPTIONS_KEY = 'fm:map';
export const getMapOptions = (): MapOptions => ({ ...MAP_DEFAULTS, ...readJson<Partial<MapOptions>>(OPTIONS_KEY, {}) });
export function setMapOptions(options: MapOptions) {
  writeJson(OPTIONS_KEY, options);
  document.dispatchEvent(new CustomEvent<MapOptions>('fm:map-options', { detail: options }));
}

const GAP_BREAK = 24; // buchi più lunghi di 120 m spezzano la linea
const READY = 0.6;
const FOLLOW_RADIUS = 420;
const TRAIL_POINTS = 150;
const RIVAL_RANGE = 3;
const COLORS = [
  'map-track',
  'map-edge',
  'map-s1',
  'map-s2',
  'map-s3',
  'map-drs',
  'map-yellow',
  'map-player',
  'map-label',
  'map-label-bg',
  'map-glow',
  'map-grid',
  'map-start',
];

export function createMap(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-map-canvas]')!;
  const status = root.querySelector<HTMLElement>('[data-map-status]');
  let options = getMapOptions();
  let view: RaceView | undefined;
  let trail: [number, number][] = [];
  let trackKey = '';
  const surface = createSurface(canvas, COLORS, () => draw());

  let family = '';
  const applyPreset = () => {
    root.dataset.preset = options.preset;
    surface.refreshColors();
    family = getComputedStyle(canvas).fontFamily;
  };
  applyPreset();

  const onOptions = (event: Event) => {
    options = (event as CustomEvent<MapOptions>).detail;
    applyPreset();
    draw();
  };
  document.addEventListener('fm:map-options', onOptions);

  function draw() {
    const { ctx, width, height, colors } = surface;
    ctx.clearRect(0, 0, width, height);
    const o = view?.track;
    if (!view || !o || !width) return;
    const learned = coverage(o);
    if (status) {
      status.hidden = learned >= READY;
      status.textContent = `${t.monitor.mapOptions.learning} ${Math.round(learned * 100)}%`;
    }

    const player = view.player;
    const angle =
      ((options.rotation === 'auto' ? autoRotation(o, width, height) : Number(options.rotation)) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Vista dall'alto: x a destra, z verso l'alto (y dello schermo invertita)
    const rotate = (x: number, z: number): [number, number] => [x * cos - -z * sin, x * sin + -z * cos];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const follow = options.follow && player?.motion;
    if (follow) {
      const [cx, cy] = rotate(player.motion!.worldPositionX, player.motion!.worldPositionZ);
      [minX, maxX, minY, maxY] = [cx - FOLLOW_RADIUS, cx + FOLLOW_RADIUS, cy - FOLLOW_RADIUS, cy + FOLLOW_RADIUS];
    } else {
      const extend = (x: number, z: number) => {
        const [rx, ry] = rotate(x, z);
        minX = Math.min(minX, rx);
        maxX = Math.max(maxX, rx);
        minY = Math.min(minY, ry);
        maxY = Math.max(maxY, ry);
      };
      for (let i = 0; i < o.filled.length; i++) if (o.filled[i]) extend(o.x[i]!, o.z[i]!);
      for (const car of view.cars) if (car.motion) extend(car.motion.worldPositionX, car.motion.worldPositionZ);
      if (!Number.isFinite(minX)) return;
    }

    const pad = Math.max(14, Math.min(width, height) * 0.08);
    const scale = Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY));
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;
    const project = (x: number, z: number): [number, number] => {
      const [rx, ry] = rotate(x, z);
      return [offsetX + (rx - minX) * scale, offsetY + (ry - minY) * scale];
    };
    const unit = Math.max(1, Math.min(width, height) / 160);
    const glow = options.preset === 'neon' ? (colors['map-glow'] ?? '') : '';

    if (options.preset === 'blueprint') {
      ctx.strokeStyle = colors['map-grid'] ?? '';
      ctx.lineWidth = 1;
      const step = Math.max(16, 24 * unit);
      ctx.beginPath();
      for (let x = (offsetX % step) - step; x < width; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = (offsetY % step) - step; y < height; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }

    // Segmento di pista tra due distanze (frazioni di giro gestite dal chiamante)
    const segment = (from: number, to: number) => {
      const path = new Path2D();
      let open = false;
      let lastFilled = -Infinity;
      const end = Math.min(o.filled.length - 1, Math.ceil(to / BUCKET));
      for (let i = Math.max(0, Math.floor(from / BUCKET)); i <= end; i++) {
        if (!o.filled[i]) continue;
        const [px, py] = project(o.x[i]!, o.z[i]!);
        if (open && i - lastFilled <= GAP_BREAK) path.lineTo(px, py);
        else path.moveTo(px, py);
        open = true;
        lastFilled = i;
      }
      return path;
    };
    const full = segment(0, o.length);
    const stroke = (path: Path2D, color: string, width: number, dash: number[] = []) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash(dash);
      ctx.shadowColor = glow;
      ctx.shadowBlur = glow ? 10 * unit : 0;
      ctx.stroke(path);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    };

    const trackWidth = { broadcast: 7, minimal: 2.4, neon: 3, blueprint: 2 }[options.preset] * unit;
    if (options.preset === 'broadcast') stroke(full, colors['map-edge'] ?? '', trackWidth + 3 * unit);
    stroke(full, colors['map-track'] ?? '', trackWidth);

    if (options.sectors) {
      const [, s2, s3] = view.sectorStarts;
      const sectorWidth = options.preset === 'broadcast' ? 2 * unit : trackWidth;
      [
        [0, s2 ?? 0, 'map-s1'],
        [s2 ?? 0, s3 ?? 0, 'map-s2'],
        [s3 ?? 0, o.length, 'map-s3'],
      ].forEach(([from, to, color]) =>
        stroke(segment(Number(from), Number(to)), colors[String(color)] ?? '', sectorWidth),
      );
    }

    if (options.drs) {
      const zones =
        view.session?.drsZones && view.session.numDRSZones
          ? view.session.drsZones
              .slice(0, view.session.numDRSZones)
              .map((zone) => [zone.zoneStart * o.length, zone.zoneEnd * o.length])
          : runs(o.drs).map(([a, b]) => [a * BUCKET, b * BUCKET]);
      const drsWidth = Math.max(2 * unit, trackWidth * 0.4);
      zones.forEach(([from, to]) =>
        stroke(segment(from!, to!), colors['map-drs'] ?? '', drsWidth, [4 * unit, 3 * unit]),
      );
    }

    const zones = view.session?.marshalZones.slice(0, view.session.numMarshalZones) ?? [];
    zones.forEach((zone, i) => {
      if (zone.zoneFlag !== 3) return;
      const end = zones[i + 1]?.zoneStart ?? 1;
      stroke(segment(zone.zoneStart * o.length, end * o.length), colors['map-yellow'] ?? '', trackWidth + 3 * unit);
    });

    if (options.startLine && o.filled[0] && o.filled[1]) {
      const [ax, ay] = project(o.x[0]!, o.z[0]!);
      const [bx, by] = project(o.x[1]!, o.z[1]!);
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const [nx, ny] = [-(by - ay) / len, (bx - ax) / len];
      const half = trackWidth + 4 * unit;
      ctx.strokeStyle = colors['map-start'] ?? '';
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      ctx.moveTo(ax - nx * half, ay - ny * half);
      ctx.lineTo(ax + nx * half, ay + ny * half);
      ctx.stroke();
    }

    if (player?.motion) {
      trail.push([player.motion.worldPositionX, player.motion.worldPositionZ]);
      if (trail.length > TRAIL_POINTS) trail.shift();
    }
    if (options.trail && trail.length > 2) {
      trail.forEach(([x, z], i) => {
        const [px, py] = project(x, z);
        ctx.globalAlpha = (i / trail.length) * 0.8;
        ctx.fillStyle = colors['map-player'] ?? '';
        ctx.beginPath();
        ctx.arc(px, py, 1.4 * unit, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    const visible = view.cars.filter(
      (car) =>
        car.motion &&
        !car.retired &&
        (!options.rivalsOnly || !player || car.isPlayer || Math.abs(car.position - player.position) <= RIVAL_RANGE),
    );
    visible
      .sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer) || b.position - a.position)
      .forEach((car) => drawCar(car));

    function drawCar(car: CarView) {
      const [px, py] = project(car.motion!.worldPositionX, car.motion!.worldPositionZ);
      const radius = (options.labels === 'position' ? 5.2 : 3.6) * unit * (car.isPlayer ? 1.35 : 1);
      ctx.globalAlpha = car.inPit ? 0.45 : 1;
      ctx.shadowColor = glow ? teamOf(car.teamId).color : '';
      ctx.shadowBlur = glow ? 8 * unit : 0;
      ctx.fillStyle =
        options.preset === 'minimal' && !car.isPlayer ? (colors['map-label'] ?? '') : teamOf(car.teamId).color;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (car.isPlayer) {
        ctx.strokeStyle = colors['map-player'] ?? '';
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(px, py, radius + 2.5 * unit, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (options.labels === 'position') {
        ctx.fillStyle = colors['map-label-bg'] ?? '';
        ctx.font = `700 ${Math.round(radius * 1.15)}px ${family}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(car.position), px, py + radius * 0.06);
      } else if (options.labels === 'code') {
        const size = Math.round(Math.max(9, 4.6 * unit) * (car.isPlayer ? 1.1 : 1));
        ctx.font = `600 ${size}px ${family}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const text = car.code;
        const w = ctx.measureText(text).width;
        const x = px + radius + 3 * unit;
        ctx.fillStyle = colors['map-label-bg'] ?? '';
        ctx.fillRect(x - 2, py - size * 0.62, w + 4, size * 1.24);
        ctx.fillStyle = car.isPlayer ? (colors['map-player'] ?? '') : (colors['map-label'] ?? '');
        ctx.fillText(text, x, py);
      }
      ctx.globalAlpha = 1;
    }
  }

  return {
    update(next: RaceView) {
      view = next;
      if (next.track && next.track.key !== trackKey) {
        trackKey = next.track.key;
        trail = [];
      }
      draw();
    },
    destroy() {
      document.removeEventListener('fm:map-options', onOptions);
      surface.destroy();
    },
  };
}

// Orientamento automatico: 0° o 90°, quello in cui il tracciato riempie meglio il riquadro
function autoRotation(o: TrackOutline, width: number, height: number): number {
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < o.filled.length; i++) {
    if (!o.filled[i]) continue;
    minX = Math.min(minX, o.x[i]!);
    maxX = Math.max(maxX, o.x[i]!);
    minZ = Math.min(minZ, o.z[i]!);
    maxZ = Math.max(maxZ, o.z[i]!);
  }
  const [w, h] = [maxX - minX, maxZ - minZ];
  if (!(w > 0 && h > 0)) return 0;
  return Math.min(width / w, height / h) >= Math.min(width / h, height / w) ? 0 : 90;
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
