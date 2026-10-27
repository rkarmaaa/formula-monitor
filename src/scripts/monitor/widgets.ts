import type { RaceView } from '@lib/telemetry/view';
import type { WidgetId } from '@data/widgets';
import { createBinder } from './bind';
import { createMap } from '../widgets/map';
import { createInputs } from '../widgets/inputs';
import { createPositions } from '../widgets/positions';
import { createGforce } from '../widgets/gforce';

// Ogni blocco = binder dichiarativo + (solo se serve) un renderer dedicato per canvas o stato locale
export interface WidgetInstance {
  update(view: RaceView): void;
  destroy(): void;
}

interface Renderer {
  update(view: RaceView): void;
  destroy?(): void;
}

const renderers: Partial<Record<WidgetId, (root: HTMLElement) => Renderer>> = {
  map: createMap,
  inputs: createInputs,
  positions: createPositions,
  gforce: createGforce,
};

export function mountWidget(id: WidgetId, root: HTMLElement): WidgetInstance {
  const binder = createBinder(root);
  const custom = renderers[id]?.(root);
  return {
    update(view) {
      binder.update(view, view);
      custom?.update(view);
    },
    destroy: () => custom?.destroy?.(),
  };
}
