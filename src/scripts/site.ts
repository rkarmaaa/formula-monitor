import { isGameId } from '@data/games';
import { t } from '@i18n/index';
import { connectBridge, monitorUrl } from './bridge';
import { getGame, setGame } from './prefs';

// Pagine informative: selettore versione, IP e URL del bridge in tempo reale, bottoni copia
function initGamePicker() {
  const current = getGame();
  document.querySelectorAll<HTMLInputElement>('[data-game-picker] input[name="game"]').forEach((input) => {
    input.checked = input.value === current;
    input.onchange = () => {
      if (input.checked && isGameId(input.value)) setGame(input.value);
    };
  });
}

function initBridge() {
  const pill = document.querySelector<HTMLElement>('[data-bridge-pill]');
  const label = pill?.querySelector<HTMLElement>('[data-bridge-label]');
  connectBridge({
    onState(state) {
      if (state === 'open' || !pill || !label) return;
      pill.dataset.state = 'offline';
      label.textContent = t.common.bridge.waiting;
    },
    onStatus(status) {
      if (pill && label) {
        pill.dataset.state = status.rate > 0 ? 'live' : 'online';
        label.textContent = t.common.bridge.connected;
      }
      const ip = status.addresses[0];
      document.querySelectorAll<HTMLElement>('[data-bridge-ip]').forEach((el) => {
        if (!ip) return;
        el.textContent = ip;
        delete el.dataset.empty;
      });
      document
        .querySelectorAll<HTMLElement>('[data-bridge-url]')
        .forEach((el) => (el.textContent = monitorUrl(status)));
    },
  });
}

// Copia negli appunti; senza contesto sicuro (http su IP) seleziona il testo per la copia manuale
function initCopy() {
  document.addEventListener('click', async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-copy]');
    const code = button?.parentElement?.querySelector('code');
    if (!button || !code) return;
    try {
      await navigator.clipboard.writeText(code.textContent?.trim() ?? '');
      button.dataset.copied = '';
      button.setAttribute('aria-label', t.common.bridge.copied);
      window.setTimeout(() => {
        delete button.dataset.copied;
        button.setAttribute('aria-label', t.common.bridge.copy);
      }, 1600);
    } catch {
      getSelection()?.selectAllChildren(code);
    }
  });
}

initGamePicker();
initBridge();
initCopy();
