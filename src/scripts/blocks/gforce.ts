import type { RaceView } from '@lib/telemetry/view';

// Picchi di forza G del giro in corso (il punto si muove via binder con --x e --y)
export function createGforce(root: HTMLElement) {
  const lat = root.querySelector<HTMLElement>('[data-peak-lat]');
  const lon = root.querySelector<HTMLElement>('[data-peak-lon]');
  let lap = 0;
  let peak = { lat: 0, lon: 0 };

  return {
    update(view: RaceView) {
      const motion = view.player?.motion;
      const current = view.player?.lap?.currentLapNum ?? 0;
      if (!motion) return;
      if (current !== lap) {
        lap = current;
        peak = { lat: 0, lon: 0 };
      }
      peak.lat = Math.max(peak.lat, Math.abs(motion.gForceLateral));
      peak.lon = Math.max(peak.lon, Math.abs(motion.gForceLongitudinal));
      if (lat) lat.textContent = peak.lat.toFixed(1);
      if (lon) lon.textContent = peak.lon.toFixed(1);
    },
  };
}
