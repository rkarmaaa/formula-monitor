import type { RaceView } from '@lib/telemetry/view';
import { createSurface } from './canvas';

// Traccia di acceleratore e freno degli ultimi secondi, come nei grafici di telemetria in TV
const SAMPLES = 240;

export function createInputs(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-trace]')!;
  const throttle = new Float32Array(SAMPLES);
  const brake = new Float32Array(SAMPLES);
  let head = 0;
  const surface = createSurface(canvas, ['trace-throttle', 'trace-brake', 'trace-grid'], () => draw());

  function line(values: Float32Array, color: string, fill: boolean) {
    const { ctx, width, height } = surface;
    const step = width / (SAMPLES - 1);
    ctx.beginPath();
    for (let i = 0; i < SAMPLES; i++) {
      const value = values[(head + i) % SAMPLES]!;
      const y = height - 1 - value * (height - 2);
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * step, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    if (fill) {
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    const { ctx, width, height, colors } = surface;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = colors['trace-grid'] ?? '';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const f of [0.25, 0.5, 0.75]) {
      ctx.moveTo(0, Math.round(height * f) + 0.5);
      ctx.lineTo(width, Math.round(height * f) + 0.5);
    }
    ctx.stroke();
    line(throttle, colors['trace-throttle'] ?? '', true);
    line(brake, colors['trace-brake'] ?? '', true);
  }

  return {
    update(view: RaceView) {
      const telemetry = view.player?.telemetry;
      if (!telemetry) return;
      throttle[head] = telemetry.throttle;
      brake[head] = telemetry.brake;
      head = (head + 1) % SAMPLES;
      draw();
    },
    destroy: () => surface.destroy(),
  };
}
