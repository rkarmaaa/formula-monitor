import { getMapOptions, setMapOptions, type MapOptions } from '../widgets/map';

// Dialog delle opzioni mappa: radio per stile, etichette e orientamento, checkbox per i livelli
const LAYERS = ['sectors', 'drs', 'startLine', 'trail', 'rivalsOnly', 'follow'] as const;

export function initMapDialog(dialog: HTMLDialogElement) {
  const form = dialog.querySelector('form')!;

  const fillForm = (options: MapOptions) => {
    form.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      const value = options[input.name as keyof MapOptions];
      input.checked = input.type === 'radio' ? String(value) === input.value : Boolean(value);
    });
  };

  const read = (): MapOptions => {
    const data = new FormData(form);
    const current = getMapOptions();
    return {
      ...current,
      preset: (data.get('preset') as MapOptions['preset']) ?? current.preset,
      labels: (data.get('labels') as MapOptions['labels']) ?? current.labels,
      rotation: (data.get('rotation') as MapOptions['rotation']) ?? current.rotation,
      ...Object.fromEntries(LAYERS.map((layer) => [layer, data.has(layer)])),
    };
  };

  form.oninput = () => setMapOptions(read());

  return {
    open() {
      fillForm(getMapOptions());
      dialog.showModal();
    },
  };
}
