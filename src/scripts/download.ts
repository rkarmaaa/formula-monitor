import type { DownloadId } from '@data/site';

// Pulsanti di download: scelgono la versione dal sistema del visitatore e aprono il menu delle versioni.
// Chromium dice sistema e architettura (userAgentData); Safari e Firefox solo "Macintosh": lì Apple Silicon,
// la scelta più probabile (l'Intel resta nel menu). Telefoni, tablet e sistemi non riconosciuti: Windows.
interface UserAgentData {
  platform: string;
  getHighEntropyValues(hints: string[]): Promise<{ architecture?: string }>;
}

async function detect(): Promise<DownloadId> {
  const data = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 1; // iPad in modalità desktop si presenta come Macintosh
  const mac = data ? data.platform === 'macOS' : /Macintosh/.test(ua) && !touch;
  if (!mac) return 'windows';
  try {
    const { architecture } = (await data?.getHighEntropyValues(['architecture'])) ?? {};
    if (architecture === 'x86') return 'mac-intel';
  } catch {
    // dato non concesso dal browser
  }
  return 'mac-arm';
}

const buttons = [...document.querySelectorAll<HTMLElement>('[data-download]')];

function select(root: HTMLElement, id: string) {
  const option = root.querySelector<HTMLAnchorElement>(`[data-option="${id}"]`);
  if (!option) return;
  root.querySelector<HTMLAnchorElement>('[data-download-main]')!.href = option.href;
  for (const face of root.querySelectorAll<HTMLElement>('[data-face]')) face.hidden = face.dataset.face !== id;
  for (const item of root.querySelectorAll<HTMLElement>('[data-option]')) {
    if (item === option) item.setAttribute('aria-current', 'true');
    else item.removeAttribute('aria-current');
  }
}

function open(root: HTMLElement, next: boolean) {
  root.querySelector<HTMLElement>('.download-button-menu')!.hidden = !next;
  root.querySelector('[data-download-toggle]')!.setAttribute('aria-expanded', String(next));
}

const closeAll = () => buttons.forEach((root) => open(root, false));

for (const root of buttons) {
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-download-toggle]')) {
      const menu = root.querySelector<HTMLElement>('.download-button-menu')!;
      const next = menu.hidden !== false;
      closeAll();
      open(root, next);
      return;
    }
    const id = target.closest<HTMLElement>('[data-option]')?.dataset.option;
    if (id) {
      buttons.forEach((other) => select(other, id));
      open(root, false);
    }
  });
}

document.addEventListener('click', (event) => {
  if (!(event.target as HTMLElement).closest('[data-download]')) closeAll();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAll();
});

if (buttons.length) {
  const id = await detect();
  buttons.forEach((root) => select(root, id));
}
