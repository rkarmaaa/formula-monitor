import type { RaceView } from '@lib/telemetry/view';
import { fill } from '@lib/text';
import { readJson, writeJson } from '../prefs';
import { createSurface } from './canvas';

// Traccia di acceleratore e freno degli ultimi secondi, come nei grafici di telemetria in TV.
// I campioni sono legati al tempo della sessione: la finestra visibile (RANGES, secondi) si allarga e si
// stringe dai bottoni del blocco, le voci della legenda accendono e spengono le tracce.
// Le scelte restano salvate sul dispositivo, separate per qualifica (e prove) e gara.
const RANGES = [4, 8, 16, 32];
const CAPACITY = 4096; // oltre 60 campioni al secondo per la finestra più lunga

type Series = 'throttle' | 'brake';
type Kind = 'race' | 'qualifying';

interface Prefs {
  range: number;
  visible: Record<Series, boolean>;
}

const prefsKey = (kind: Kind) => `fm:pedals:${kind}`;
const defaults = (): Prefs => ({ range: 0, visible: { throttle: true, brake: true } });

export function createInputs(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-trace]')!;
  // Legenda e zoom ci sono solo nel blocco base dei pedali (il blocco completo "Comandi" mostra la traccia e basta)
  const rangeLabel = root.querySelector<HTMLElement>('[data-range]');
  const time = new Float64Array(CAPACITY);
  const values: Record<Series, Float32Array> = {
    throttle: new Float32Array(CAPACITY),
    brake: new Float32Array(CAPACITY),
  };
  let visible: Record<Series, boolean> = defaults().visible;
  let head = 0;
  let count = 0;
  let range = 0;
  // Solo il blocco base ha i comandi e salva le preferenze (il blocco completo "Comandi" mostra la traccia e basta)
  const controls = root.querySelector('[data-series]') !== null;
  let kind: Kind | undefined;
  const surface = createSurface(canvas, ['trace-throttle', 'trace-brake', 'trace-grid'], () => draw());

  function line(series: Series, color: string) {
    const { ctx, width, height } = surface;
    const data = values[series];
    const now = time[(head - 1 + CAPACITY) % CAPACITY]!;
    const seconds = RANGES[range]!;
    // La finestra di tempo copre la parte visibile; il canvas sborda a sinistra (tagliato dal contenitore)
    const visible = canvas.parentElement?.clientWidth || width;
    const x = (i: number) => width - ((now - time[i]!) / seconds) * visible;
    const y = (i: number) => height - 1 - data[i]! * (height - 2);
    ctx.beginPath();
    let first = -1;
    let last = -1;
    let older = -1; // ultimo campione fuori dalla finestra: la linea parte da lì, oltre il bordo
    for (let k = count; k > 0; k--) {
      const i = (head - k + CAPACITY) % CAPACITY;
      if (x(i) < 0) {
        older = i;
        continue;
      }
      if (first < 0) {
        first = older >= 0 ? older : i;
        ctx.moveTo(x(first), y(first));
        if (first !== i) ctx.lineTo(x(i), y(i));
      } else ctx.lineTo(x(i), y(i));
      last = i;
    }
    if (first < 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.lineTo(x(last), height);
    ctx.lineTo(x(first), height);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
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
    if (!count) return;
    if (visible.throttle) line('throttle', colors['trace-throttle'] ?? '');
    if (visible.brake) line('brake', colors['trace-brake'] ?? '');
  }

  const save = () => {
    if (controls && kind) writeJson(prefsKey(kind), { range, visible } satisfies Prefs);
  };

  function setRange(next: number) {
    range = Math.min(RANGES.length - 1, Math.max(0, next));
    if (rangeLabel) rangeLabel.textContent = fill(canvas.dataset.rangeLabel ?? '{s}', { s: RANGES[range]! });
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-zoom]')) {
      const next = range + Number(button.dataset.zoom);
      button.disabled = next < 0 || next >= RANGES.length;
    }
    draw();
  }
  setRange(0);

  // Al cambio di tipo di sessione si ricaricano le preferenze di quel tipo
  function useKind(next: Kind) {
    if (!controls || next === kind) return;
    kind = next;
    const stored = readJson<Partial<Prefs>>(prefsKey(kind), {});
    visible = { ...defaults().visible, ...stored.visible };
    for (const key of root.querySelectorAll<HTMLElement>('[data-series]'))
      key.setAttribute('aria-pressed', String(visible[key.dataset.series as Series]));
    setRange(Number.isInteger(stored.range) ? stored.range! : 0);
  }

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const key = target.closest<HTMLElement>('[data-series]');
    if (key) {
      const series = key.dataset.series as Series;
      visible[series] = !visible[series];
      key.setAttribute('aria-pressed', String(visible[series]));
      draw();
      save();
    }
    const zoom = target.closest<HTMLElement>('[data-zoom]');
    if (zoom) {
      setRange(range + Number(zoom.dataset.zoom));
      save();
    }
  });

  return {
    update(view: RaceView) {
      if (view.session) useKind(view.race.isRace ? 'race' : 'qualifying');
      const telemetry = view.player?.telemetry;
      if (!telemetry) return;
      const at = view.sessionTime;
      const previous = time[(head - 1 + CAPACITY) % CAPACITY]!;
      // Nuova sessione (il tempo torna indietro): si riparte da zero; tempo fermo: nessun nuovo campione
      if (count && at < previous) count = 0;
      else if (count && at === previous) return;
      time[head] = at;
      values.throttle[head] = telemetry.throttle;
      values.brake[head] = telemetry.brake;
      head = (head + 1) % CAPACITY;
      count = Math.min(CAPACITY, count + 1);
      draw();
    },
    destroy: () => surface.destroy(),
  };
}
