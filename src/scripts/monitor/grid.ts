import { GridStack, type GridItemHTMLElement, type GridStackNode, type GridStackWidget } from 'gridstack';
import 'gridstack/dist/gridstack.min.css';
import type { RaceView } from '@lib/telemetry/view';
import type { GameId } from '@data/games';
import { defaultLayout, GRID, isAvailable, widgetById, type LayoutItem, type WidgetId } from '@data/widgets';
import { readJson, writeJson } from '../prefs';
import { mountWidget, type WidgetInstance } from './widgets';

// Griglia 12×24 a dimensione fissa (riempie lo stage 9:16): i blocchi si spostano e
// ridimensionano solo in modalità Personalizza; il layout è salvato per versione di gioco.
export interface MonitorGrid {
  update(view: RaceView): void;
  setEditing(editing: boolean): void;
  add(id: WidgetId): boolean;
  remove(id: WidgetId): void;
  reset(): void;
  has(id: WidgetId): boolean;
  onChange(listener: () => void): void;
}

const layoutKey = (game: GameId) => `fm:layout:${game}`;

function sanitize(items: LayoutItem[], game: GameId): LayoutItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const def = widgetById(item.id);
    if (!def || !isAvailable(def, game) || seen.has(item.id)) return false;
    seen.add(item.id);
    return [item.x, item.y, item.w, item.h].every(Number.isFinite) && item.y + item.h <= GRID.rows;
  });
}

const toWidget = (item: LayoutItem): GridStackWidget => {
  const def = widgetById(item.id)!;
  return { ...item, minW: def.min.w, minH: def.min.h };
};

export function createGrid(
  el: HTMLElement,
  stage: HTMLElement,
  game: GameId,
  options: { locked?: boolean } = {},
): MonitorGrid {
  const instances = new Map<WidgetId, WidgetInstance>();
  const listeners = new Set<() => void>();
  let lastView: RaceView | undefined;

  GridStack.renderCB = (content: HTMLElement, node: GridStackNode) => {
    const template = document.querySelector<HTMLTemplateElement>(`template[data-widget-template="${node.id}"]`);
    if (template) content.append(template.content.cloneNode(true));
  };

  const grid = GridStack.init(
    {
      column: GRID.columns,
      maxRow: GRID.rows,
      minRow: GRID.rows,
      cellHeight: stage.clientHeight / GRID.rows,
      margin: 3,
      mode: 'float',
      staticGrid: true,
      animate: true,
      handle: '.widget-head',
      resizable: { handles: 'se,sw' },
    },
    el,
  )!;

  const mount = (item: GridItemHTMLElement) => {
    const node = item.gridstackNode;
    const root = item.querySelector<HTMLElement>('[data-widget]');
    if (!node?.id || !root) return;
    const instance = mountWidget(node.id as WidgetId, root);
    instances.set(node.id as WidgetId, instance);
    if (lastView) instance.update(lastView);
  };

  const unmount = (id: WidgetId) => {
    instances.get(id)?.destroy();
    instances.delete(id);
  };

  const save = () => {
    if (options.locked) return;
    const items = (grid.save(false) as GridStackWidget[]).map(
      ({ id, x = 0, y = 0, w = 1, h = 1 }) => ({ id, x, y, w, h }) as LayoutItem,
    );
    writeJson(layoutKey(game), items);
    listeners.forEach((listener) => listener());
  };

  const load = (items: LayoutItem[]) => {
    grid.batchUpdate();
    grid.load(items.map(toWidget));
    grid.batchUpdate(false);
    grid.getGridItems().forEach(mount);
  };

  const saved = options.locked ? null : readJson<LayoutItem[] | null>(layoutKey(game), null);
  const initial = saved ? sanitize(saved, game) : [];
  load(initial.length ? initial : defaultLayout(game));

  grid.on('change', save);
  new ResizeObserver(() => grid.cellHeight(stage.clientHeight / GRID.rows)).observe(stage);

  return {
    update(view) {
      lastView = view;
      instances.forEach((instance) => instance.update(view));
    },
    setEditing(editing) {
      grid.setStatic(!editing);
    },
    add(id) {
      const def = widgetById(id);
      if (!def || instances.has(id)) return false;
      // La misura più grande tra standard e minima che entra nello spazio libero
      let size: { w: number; h: number } | undefined;
      for (let h = def.size.h; h >= def.min.h; h--) {
        for (let w = def.size.w; w >= def.min.w; w--) {
          if ((!size || w * h > size.w * size.h) && grid.willItFit({ w, h })) size = { w, h };
        }
      }
      if (!size) return false;
      const item = grid.addWidget({ id, ...size, minW: def.min.w, minH: def.min.h });
      if (!item) return false;
      mount(item);
      save();
      return true;
    },
    remove(id) {
      const item = grid.getGridItems().find((el) => el.gridstackNode?.id === id);
      if (!item) return;
      unmount(id);
      grid.removeWidget(item);
      save();
    },
    reset() {
      instances.forEach((_, id) => unmount(id));
      grid.removeAll();
      writeJson(layoutKey(game), undefined);
      load(defaultLayout(game));
      listeners.forEach((listener) => listener());
    },
    has: (id) => instances.has(id),
    onChange: (listener) => listeners.add(listener),
  };
}
