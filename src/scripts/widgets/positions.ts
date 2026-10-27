import type { RaceView } from '@lib/telemetry/view';
import { teamOf } from '@data/teams';
import { createSurface } from './canvas';

// Grafico delle posizioni a inizio giro (pacchetto Lap Positions, novità di F1 25)
export function createPositions(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-positions]')!;
  let view: RaceView | undefined;
  let signature = '';
  const surface = createSurface(canvas, ['chart-grid', 'chart-label'], () => draw(true));

  function draw(force = false) {
    if (!view) return;
    const rows = view.lapPositions.filter(Boolean);
    const cars = view.cars;
    const next = `${rows.length}:${cars.map((car) => car.index).join(',')}:${surface.width}`;
    if (!force && next === signature) return;
    signature = next;

    const { ctx, width, height, colors } = surface;
    ctx.clearRect(0, 0, width, height);
    if (rows.length < 1 || !cars.length) return;
    const total = cars.length;
    const laps = Math.max(rows.length, 2);
    const pad = { left: 18, right: 34, top: 6, bottom: 6 };
    const x = (lap: number) => pad.left + (lap / laps) * (width - pad.left - pad.right);
    const y = (pos: number) => pad.top + ((pos - 1) / Math.max(1, total - 1)) * (height - pad.top - pad.bottom);

    ctx.strokeStyle = colors['chart-grid'] ?? '';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lap = 0; lap <= laps; lap += Math.max(1, Math.round(laps / 6))) {
      ctx.moveTo(Math.round(x(lap)) + 0.5, pad.top);
      ctx.lineTo(Math.round(x(lap)) + 0.5, height - pad.bottom);
    }
    ctx.stroke();

    const ordered = [...cars].sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer));
    for (const car of ordered) {
      const points = rows.map((row, lap) => [lap, row[car.index] ?? 0] as const).filter(([, pos]) => pos > 0);
      points.push([rows.length, car.position]);
      ctx.strokeStyle = teamOf(car.teamId).color;
      ctx.globalAlpha = car.isPlayer ? 1 : 0.42;
      ctx.lineWidth = car.isPlayer ? 3 : 1.4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach(([lap, pos], i) => (i ? ctx.lineTo(x(lap), y(pos)) : ctx.moveTo(x(lap), y(pos))));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = `600 10px ${getComputedStyle(canvas).fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors['chart-label'] ?? '';
    ctx.textAlign = 'right';
    ctx.fillText('1', pad.left - 6, y(1));
    ctx.fillText(String(total), pad.left - 6, y(total));
    const player = view.player;
    if (player) {
      ctx.textAlign = 'left';
      ctx.fillStyle = teamOf(player.teamId).color;
      ctx.fillText(player.code, width - pad.right + 6, y(player.position));
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
