import { fill } from '@lib/text';
import { t } from '@i18n/index';
import type { BridgeState, BridgeStatus } from '../bridge';
import { createBinder, type Binder } from './bind';
import { createRuntime } from './runtime';
import { startBridge, startDemo, type DemoSource } from './sources';
import { createInputs } from '../blocks/inputs';
import { gameByFormat } from '@data/games';
import { site } from '@data/site';
import type { RaceView } from '@lib/telemetry/view';
import type { SimSession } from '@lib/sim/simulator';

// Monitor: schermata di attesa finché il gioco non invia una sessione, poi i blocchi.
// La versione del gioco (formato 2025/2026) si riconosce dai pacchetti: nessuna scelta da fare.
// Sul sito online non c'è il bridge (un sito non riceve UDP): il monitor gira sempre in simulazione.
const params = new URLSearchParams(location.search);
const demo = params.has('demo') || import.meta.env.PUBLIC_TARGET === 'site';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const monitor = $('[data-monitor]');
const status = $('[data-status]');
const statusLabel = $('[data-status-label]');
const waitDetail = $('[data-wait-detail]');
const domain = $('[data-domain]');
const waitUrl = $('[data-wait-url]');
const board = $('[data-board]');
const modes = $('[data-modes]');

const BOARD_TIMEOUT = 15_000; // senza pacchetti per 15 s si torna all'attesa (menu del gioco)
const LIVE_TIMEOUT = 2500;
const FORMAT_TIMEOUT = 5000;

const runtime = createRuntime();
let bridgeState: BridgeState = 'connecting';
let bridgeStatus: BridgeStatus | undefined;
let rejected: { format: number; at: number } | undefined;

// ——— Blocchi: binder dichiarativo + renderer canvas dei pedali ———
interface Renderer {
  update(view: RaceView): void;
}

const roots = [...document.querySelectorAll<HTMLElement>('.monitor-board [data-block], [data-bind]')];
const renderers: Renderer[] = [createInputs($('.monitor-board [data-block="pedals"]'))];
const binders: Binder[] = roots.map((el) => createBinder(el));

runtime.subscribe((view) => {
  // In gara il cruscotto cambia: distacchi in classifica e giri in alto
  board.toggleAttribute('data-race', view.race.isRace);
  if (monitor.dataset.view !== 'board') return;
  for (const binder of binders) binder.update(view, view);
  for (const renderer of renderers) renderer.update(view);
});

// Versione del gioco dal formato dei pacchetti: mostra solo i blocchi di quella versione (DRS / aero attiva)
function applyFormat(format: number) {
  const game = gameByFormat(format);
  if (game) document.documentElement.dataset.game = game.id;
}

// ——— Stato: attesa o cruscotto, etichetta della barra, diagnosi per l'utente ———
function render() {
  const now = performance.now();
  const since = runtime.stats.lastPacketAt ? now - runtime.stats.lastPacketAt : Infinity;
  const hasSession = Boolean(runtime.view.session);
  const board = hasSession && since < BOARD_TIMEOUT;
  const view = board ? 'board' : 'wait';
  if (monitor.dataset.view !== view) {
    monitor.dataset.view = view;
    if (board) {
      for (const binder of binders) binder.update(runtime.view, runtime.view);
      for (const renderer of renderers) renderer.update(runtime.view);
    }
  }

  const state = demo
    ? 'demo'
    : since < LIVE_TIMEOUT
      ? 'live'
      : board
        ? 'paused'
        : bridgeState === 'open'
          ? 'waiting'
          : bridgeState === 'connecting'
            ? 'connecting'
            : 'offline';
  status.dataset.state = state;
  statusLabel.textContent = t.monitor.status[state];

  const d = t.monitor.wait.detail;
  waitDetail.textContent =
    rejected && now - rejected.at < FORMAT_TIMEOUT
      ? fill(d.format, { format: rejected.format })
      : bridgeStatus?.error
        ? fill(d.error, { error: bridgeStatus.error })
        : since < LIVE_TIMEOUT
          ? d.session
          : bridgeState === 'open'
            ? fill(d.listening, { port: bridgeStatus?.udpPort ?? 20777 })
            : bridgeState === 'connecting'
              ? d.connecting
              : d.offline;
}
window.setInterval(render, 500);

// Indirizzo da aprire sugli altri dispositivi: su localhost mostriamo l'IP di rete del PC.
// Nell'attesa anche l'IP da inserire nel gioco (tabella delle impostazioni).
function renderDomain() {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const ip = bridgeStatus?.addresses[0];
  const host = local && ip ? `${ip}${location.port ? `:${location.port}` : ''}` : location.host;
  domain.textContent = host;
  if (ip) waitUrl.textContent = `http://${host}/monitor/`;
  document.querySelectorAll<HTMLElement>('[data-bridge-ip]').forEach((el) => {
    if (!ip) return;
    el.textContent = ip;
    delete el.dataset.empty;
  });
}
renderDomain();

const justReloaded = () =>
  performance.now() < 30_000 &&
  (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload';

if (demo) {
  const format = params.get('format') === '2026' ? 2026 : 2025;
  applyFormat(format);
  // Selettore della schermata nella barra: menu con le viste, la scelta riparte la simulazione con quella sessione
  const toggle = modes.querySelector<HTMLButtonElement>('[data-mode-toggle]')!;
  const menu = modes.querySelector<HTMLElement>('.monitor-bar-menu')!;
  const label = modes.querySelector<HTMLElement>('[data-mode-label]')!;
  const open = (next: boolean) => {
    menu.hidden = !next;
    toggle.setAttribute('aria-expanded', String(next));
  };
  let source: DemoSource | undefined;
  const play = (session: SimSession) => {
    source?.stop();
    runtime.reset();
    source = startDemo(runtime, format, session);
    for (const button of modes.querySelectorAll<HTMLElement>('[data-mode]')) {
      const active = button.dataset.mode === session;
      button.setAttribute('aria-pressed', String(active));
      if (active) label.textContent = button.textContent?.trim() ?? '';
    }
  };
  modes.hidden = false;
  modes.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-mode-toggle]')) return open(Boolean(menu.hidden));
    const mode = target.closest<HTMLElement>('[data-mode]')?.dataset.mode;
    if (mode === 'race' || mode === 'qualifying') {
      open(false);
      play(mode);
      toggle.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!modes.contains(event.target as Node)) open(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      open(false);
      toggle.focus();
    }
  });
  play(params.get('demo') === 'race' ? 'race' : 'qualifying');
} else {
  startBridge(runtime, {
    onState(state) {
      bridgeState = state;
      render();
    },
    onStatus(next) {
      // App aggiornata e riavviata: la pagina carica il sito della nuova versione (una volta: niente ricariche a
      // catena se le versioni non tornano)
      if (next.version && next.version !== site.version && !justReloaded()) return location.reload();
      bridgeStatus = next;
      renderDomain();
    },
    onFormat: applyFormat,
    onReject(result) {
      if (result.reason === 'format' && result.format !== undefined)
        rejected = { format: result.format, at: performance.now() };
    },
  });
}
render();

// ——— Schermo intero e schermo sempre acceso ———
// Wake Lock per tutta la vita della pagina: lo schermo non si spegne per inattività mentre il monitor è aperto.
// Il browser lo rilascia quando la scheda è nascosta: si richiede di nuovo al ritorno e al primo gesto se rifiutato.
let wakeLock: WakeLockSentinel | undefined;
let requesting = false;
async function keepAwake() {
  if (wakeLock || requesting || document.visibilityState !== 'visible') return;
  requesting = true;
  try {
    const lock = await navigator.wakeLock?.request('screen');
    if (!lock) return;
    wakeLock = lock;
    lock.addEventListener('release', () => {
      if (wakeLock === lock) wakeLock = undefined;
    });
  } catch {
    /* Wake Lock disponibile solo in contesto sicuro (localhost/HTTPS) e con la pagina visibile */
  } finally {
    requesting = false;
  }
}
void keepAwake();
document.addEventListener('visibilitychange', () => void keepAwake());
for (const type of ['pointerdown', 'keydown'] as const) document.addEventListener(type, () => void keepAwake());

document.addEventListener('click', (event) => {
  if (!(event.target as HTMLElement).closest('[data-action="fullscreen"]')) return;
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
});
document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey && !event.altKey)
    $('[data-action="fullscreen"]').click();
});
document.addEventListener('fullscreenchange', () => {
  document.documentElement.classList.toggle('fullscreen', Boolean(document.fullscreenElement));
});
