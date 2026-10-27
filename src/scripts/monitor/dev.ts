import type { SimCommand } from '@lib/sim/simulator';
import type { Runtime } from './runtime';
import type { DemoSource } from './sources';

// Pannello DEV: frame e pacchetti al secondo, conteggio per tipo, comandi del simulatore
export function initDevPanel(
  panel: HTMLElement,
  runtime: Runtime,
  demo: () => DemoSource | undefined,
  source: () => string,
) {
  const fps = panel.querySelector<HTMLElement>('[data-dev-fps]')!;
  const pps = panel.querySelector<HTMLElement>('[data-dev-pps]')!;
  const label = panel.querySelector<HTMLElement>('[data-dev-source]')!;
  const counts = panel.querySelector<HTMLElement>('[data-dev-counts]')!;
  const controls = panel.querySelector<HTMLElement>('[data-dev-controls]')!;
  const pause = panel.querySelector<HTMLButtonElement>('[data-dev-pause]')!;

  panel.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    const sim = demo();
    if (!target || !sim) return;
    if (target.dataset.devCommand) sim.command(target.dataset.devCommand as SimCommand);
    if (target.dataset.devSpeed) {
      sim.speed = Number(target.dataset.devSpeed);
      panel
        .querySelectorAll<HTMLButtonElement>('[data-dev-speed]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b === target)));
    }
    if (target === pause) {
      sim.paused = !sim.paused;
      pause.setAttribute('aria-pressed', String(sim.paused));
    }
  });

  window.setInterval(() => {
    if (panel.hidden) return;
    fps.textContent = String(runtime.stats.fps);
    pps.textContent = String(runtime.stats.packetsPerSecond);
    label.textContent = source();
    controls.hidden = !demo();
    counts.textContent = Object.entries(runtime.counts)
      .map(([kind, count]) => `${kind} ${count}`)
      .join(' · ');
  }, 500);
}
