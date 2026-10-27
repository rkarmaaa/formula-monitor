import { gameById, gameByFormat, isGameId } from '@data/games';
import type { WidgetId } from '@data/widgets';
import { fill } from '@lib/text';
import { t } from '@i18n/index';
import { getGame, hasGame, setGame } from '../prefs';
import type { BridgeState, BridgeStatus } from '../bridge';
import { createBinder } from './bind';
import { createGrid } from './grid';
import { createRuntime } from './runtime';
import { startBridge, startDemo, type BridgeSource, type DemoSource } from './sources';
import { initMapDialog } from './map-dialog';
import { initDevPanel } from './dev';

const params = new URLSearchParams(location.search);
const preview = params.has('preview');

// Prima apertura: la versione di gioco si sceglie dalla pagina di avvio (insieme alle istruzioni)
if (!preview && !params.has('demo') && !hasGame()) location.replace('/#avvio');

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const monitor = $('[data-monitor]');
const bar = $('[data-bar]');
const status = $('[data-status]');
const statusLabel = $('[data-status-label]');
const banner = $('[data-banner]');
const bannerText = $('[data-banner-text]');
const bannerAction = $<HTMLButtonElement>('[data-banner-action]');
const empty = $('[data-empty]');
const drawer = $<HTMLDialogElement>('[data-drawer]');
const toast = $('[data-toast]');
const devPanel = $('[data-dev]');

const game = gameById(getGame());
const runtime = createRuntime();
const grid = createGrid($('[data-grid]'), $('[data-stage]'), game.id, { locked: preview });
const barBinder = createBinder(bar);
const mapDialog = initMapDialog($<HTMLDialogElement>('[data-map-dialog]'));
const gameDialog = $<HTMLDialogElement>('[data-game-dialog]');

let bridge: BridgeSource | undefined;
let demo: DemoSource | undefined;
let bridgeState: BridgeState = 'connecting';
let bridgeStatus: BridgeStatus | undefined;
let toastTimer: number | undefined;

if (preview) document.documentElement.classList.add('preview');

function notify(message: string) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 3200);
}

function showBanner(message?: string, action?: { label: string; run: () => void }) {
  banner.hidden = !message;
  bannerText.textContent = message ?? '';
  bannerAction.hidden = !action;
  if (action) {
    bannerAction.textContent = action.label;
    bannerAction.onclick = action.run;
  }
}

// ——— Stato della sorgente ———
function renderStatus() {
  const live = performance.now() - runtime.stats.lastPacketAt < 2500 && runtime.stats.lastPacketAt > 0;
  const state = demo
    ? 'demo'
    : live
      ? 'live'
      : bridgeState === 'open'
        ? 'waiting'
        : bridgeState === 'connecting'
          ? 'connecting'
          : 'offline';
  status.dataset.state = state;
  statusLabel.textContent = t.monitor.status[state];
  empty.hidden = Boolean(demo) || runtime.stats.lastPacketAt > 0;
  document.querySelectorAll<HTMLButtonElement>('[data-action="demo"]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Boolean(demo)));
    button.querySelector('.button-label')!.textContent = demo ? t.monitor.actions.demoOff : t.monitor.actions.demoOn;
  });
}
window.setInterval(renderStatus, 1000);

function connect() {
  bridge = startBridge(runtime, {
    onState(state) {
      bridgeState = state;
      renderStatus();
    },
    onStatus(next) {
      bridgeStatus = next;
      if (next.error) showBanner(fill(t.monitor.bridgeError, { error: next.error }));
      renderStatus();
    },
    onFormat(format) {
      const detected = gameByFormat(format);
      if (!detected || detected.id === game.id) return showBanner();
      showBanner(fill(t.monitor.formatMismatch, { got: format, game: t.games[game.id].name }), {
        label: fill(t.monitor.formatSwitch, { game: t.games[detected.id].name }),
        run: () => {
          setGame(detected.id);
          location.reload();
        },
      });
    },
    onReject(result) {
      if (result.reason === 'format') showBanner(fill(t.monitor.formatUnknown, { got: result.format ?? '?' }));
    },
  });
}

function setDemo(active: boolean) {
  bridge?.stop();
  demo?.stop();
  bridge = undefined;
  demo = undefined;
  runtime.reset();
  showBanner();
  if (active) demo = startDemo(runtime, game.udpFormat);
  else connect();
  if (!preview) {
    const query = new URLSearchParams(location.search);
    if (active) query.set('demo', '');
    else query.delete('demo');
    const search = query.toString().replace(/=(?=&|$)/g, '');
    history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}`);
  }
  renderStatus();
}

// ——— Modalità Personalizza ———
function setEditing(editing: boolean) {
  monitor.toggleAttribute('data-editing', editing);
  grid.setEditing(editing);
  const button = $<HTMLButtonElement>('[data-action="edit"]');
  button.setAttribute('aria-pressed', String(editing));
  button.querySelector('.button-label')!.textContent = editing ? t.monitor.actions.done : t.monitor.actions.edit;
  if (editing) drawer.show();
  else drawer.close();
  syncDrawer();
}

function syncDrawer() {
  drawer.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((button) => {
    const added = grid.has(button.dataset.add as WidgetId);
    button.disabled = added;
    button.querySelector('.button-label')!.textContent = added ? t.monitor.drawer.added : t.monitor.drawer.add;
  });
}
grid.onChange(syncDrawer);

let wakeLock: WakeLockSentinel | undefined;
async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    /* Wake Lock disponibile solo in contesto sicuro (localhost/HTTPS) */
  }
}

async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
}

const actions: Record<string, () => void> = {
  edit: () => setEditing(!monitor.hasAttribute('data-editing')),
  demo: () => setDemo(!demo),
  fullscreen: () => void toggleFullscreen(),
  dev: () => (devPanel.hidden = !devPanel.hidden),
  drawer: () => (drawer.open ? drawer.close() : drawer.show()),
  game: () => gameDialog.showModal(),
};

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action) actions[action]?.();

  const add = target.closest<HTMLButtonElement>('[data-add]');
  if (add && !grid.add(add.dataset.add as WidgetId)) notify(t.monitor.drawer.full);

  const widget = target.closest<HTMLElement>('[data-widget]')?.dataset.widget as WidgetId | undefined;
  if (widget && target.closest('[data-widget-remove]')) grid.remove(widget);
  if (widget === 'map' && target.closest('[data-widget-settings]')) mapDialog.open();

  if (target.closest('[data-reset]')) grid.reset();
  if (target.closest('[data-drawer-close]')) setEditing(false);
  if (target.closest('[data-drawer-hide]')) drawer.close();
  if (target.closest('[data-dialog-close]')) target.closest('dialog')?.close();
});

gameDialog.querySelectorAll<HTMLInputElement>('input[name="game"]').forEach((input) => {
  input.checked = input.value === game.id;
  input.onchange = () => {
    if (!isGameId(input.value)) return;
    setGame(input.value);
    location.reload();
  };
});

document.addEventListener('keydown', (event) => {
  const typing = (event.target as HTMLElement).closest('input, textarea, select, dialog');
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'e') actions.edit!();
  if (key === 'f') actions.fullscreen!();
  if (key === 'd') actions.dev!();
  if (key === 'escape' && monitor.hasAttribute('data-editing')) setEditing(false);
});

document.addEventListener('fullscreenchange', () => {
  document.documentElement.classList.toggle('fullscreen', Boolean(document.fullscreenElement));
  if (document.fullscreenElement) void keepAwake();
  else void wakeLock?.release();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && document.fullscreenElement) void keepAwake();
});

runtime.subscribe((view) => {
  grid.update(view);
  barBinder.update(view, view);
});

initDevPanel(
  devPanel,
  runtime,
  () => demo,
  () => (demo ? t.monitor.status.demo : bridgeStatus ? `bridge · UDP ${bridgeStatus.udpPort}` : '—'),
);
if (params.has('dev')) devPanel.hidden = false;

setDemo(preview || params.has('demo'));
