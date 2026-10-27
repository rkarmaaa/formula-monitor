import { t } from '@i18n/index';
import { connectBridge, monitorUrl } from './bridge';

// Pagine informative: IP e URL del bridge in tempo reale, bottoni copia
function initBridge() {
  if (!document.querySelector('[data-bridge-ip], [data-bridge-url]')) return;
  connectBridge({
    onStatus(status) {
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
      button.setAttribute('aria-label', t.common.copied);
      window.setTimeout(() => {
        delete button.dataset.copied;
        button.setAttribute('aria-label', t.common.copy);
      }, 1600);
    } catch {
      getSelection()?.selectAllChildren(code);
    }
  });
}

initBridge();
initCopy();
