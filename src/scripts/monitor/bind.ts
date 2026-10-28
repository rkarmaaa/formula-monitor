import type { RaceView } from '@lib/telemetry/view';
import { formatters, type Formatter } from './formatters';

// Binder dichiarativo: collega il markup alla vista senza codice per widget.
//   data-text="player.telemetry.speed|speed"        → textContent
//   data-var="--v:player.telemetry.throttle"        → custom property (più voci separate da ;)
//   data-attr="data-tone:ersPct|tone:ers"           → attributo (null/false lo rimuove)
//   data-list="cars" + <template> [data-key] [data-limit] [data-flip] → righe ripetute
//   data-every="334"                                 → al massimo un aggiornamento ogni 334 ms (valori nervosi)
// Percorsi relativi all'elemento della lista corrente; "@" parte dalla vista intera.
type Getter = (item: unknown, view: RaceView) => unknown;

interface Expr {
  get: Getter;
  fmt?: Formatter;
  arg?: string;
}

interface Binding {
  el: HTMLElement;
  kind: 'text' | 'var' | 'attr';
  name: string;
  expr: Expr;
  last: unknown;
  clock?: Clock;
}

// Ritmo di un elemento con data-every: tutte le sue voci si aggiornano insieme, al massimo una volta per intervallo
interface Clock {
  every: number;
  at: number;
  frame: number;
  open: boolean;
}

interface Row {
  el: HTMLElement;
  binder: Binder;
}

interface ListBinding {
  el: HTMLElement;
  expr: Expr;
  template: HTMLTemplateElement;
  key?: string;
  limit: number;
  flip: boolean;
  rows: Map<unknown, Row>;
}

export interface Binder {
  update(item: unknown, view: RaceView): void;
}

const SELECTOR = '[data-text], [data-var], [data-attr], [data-list]';
const FLIP_MS = 420;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function compilePath(path: string): Getter {
  const fromRoot = path.startsWith('@');
  const parts = (fromRoot ? path.slice(1) : path).split('.').filter(Boolean);
  return (item, view) => {
    let value: unknown = fromRoot ? view : item;
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  };
}

function compileExpr(source: string): Expr {
  const [path = '', spec] = source.trim().split('|');
  const [name, arg] = spec ? spec.split(':') : [];
  const fmt = name ? formatters[name] : undefined;
  if (name && !fmt) console.warn(`[formula-monitor] formatter sconosciuto: ${name}`);
  return { get: compilePath(path.trim()), fmt, arg };
}

// "--v:path|fmt; --w:path" → [["--v", "path|fmt"], ["--w", "path"]]
const pairs = (source: string) =>
  source
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const i = entry.indexOf(':');
      return [entry.slice(0, i).trim(), entry.slice(i + 1)] as const;
    });

const evaluate = (expr: Expr, item: unknown, view: RaceView) => {
  const value = expr.get(item, view);
  return expr.fmt ? expr.fmt(value, expr.arg, { view, item }) : value;
};

function apply(binding: Binding, value: unknown) {
  const { el, name } = binding;
  if (binding.kind === 'text')
    el.textContent = value === undefined || value === null || value === '' ? '—' : String(value);
  else if (binding.kind === 'var')
    el.style.setProperty(name, value === undefined || value === null ? '' : String(value));
  else if (value === undefined || value === null || value === false) el.removeAttribute(name);
  else el.setAttribute(name, value === true ? '' : String(value));
}

function updateList(list: ListBinding, item: unknown, view: RaceView) {
  const items = (evaluate(list.expr, item, view) as unknown[] | undefined)?.slice(0, list.limit) ?? [];
  const keyOf = (entry: unknown, i: number) => (list.key ? (entry as Record<string, unknown>)[list.key] : i);
  const keys = items.map(keyOf);
  const previousKeys = [...list.rows.keys()];
  const reordered = keys.length !== previousKeys.length || keys.some((key, i) => key !== previousKeys[i]);
  // Misure di layout solo quando l'ordine cambia davvero (sorpasso), mai a ogni frame
  const before =
    reordered && list.flip && !reducedMotion.matches
      ? new Map([...list.rows.values()].map((row) => [row, row.el.offsetTop]))
      : undefined;
  const next = new Map<unknown, Row>();
  let previous: Element = list.template;
  let moved = false;

  items.forEach((entry, i) => {
    const key = keys[i];
    let row = list.rows.get(key);
    if (!row) {
      const el = list.template.content.firstElementChild!.cloneNode(true) as HTMLElement;
      el.classList.add('enter');
      row = { el, binder: createBinder(el) };
    }
    next.set(key, row);
    row.binder.update(entry, view);
    if (previous.nextElementSibling !== row.el) {
      previous.after(row.el);
      moved = true;
    }
    previous = row.el;
  });
  for (const [key, row] of list.rows) if (!next.has(key)) row.el.remove();
  list.rows = next;

  // FLIP: le righe che cambiano posizione scivolano al nuovo posto (sorpassi in classifica)
  if (before && moved) {
    for (const [row, top] of before) {
      const dy = top - row.el.offsetTop;
      if (dy && row.el.isConnected)
        row.el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
          duration: FLIP_MS,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        });
    }
  }
}

export function createBinder(root: HTMLElement): Binder {
  const bindings: Binding[] = [];
  const lists: ListBinding[] = [];
  const elements = [root, ...root.querySelectorAll<HTMLElement>(SELECTOR)].filter((el) => el.matches(SELECTOR));

  for (const el of elements) {
    const { text, var: vars, attr, list } = el.dataset;
    const every = Number(el.dataset.every ?? 0);
    const timing = { last: Symbol(), clock: every ? { every, at: -Infinity, frame: -1, open: true } : undefined };
    if (text !== undefined) bindings.push({ el, kind: 'text', name: '', expr: compileExpr(text), ...timing });
    if (vars)
      for (const [name, expr] of pairs(vars))
        bindings.push({ el, kind: 'var', name, expr: compileExpr(expr), ...timing });
    if (attr)
      for (const [name, expr] of pairs(attr))
        bindings.push({ el, kind: 'attr', name, expr: compileExpr(expr), ...timing });
    const template = el.querySelector<HTMLTemplateElement>(':scope > template');
    if (list !== undefined && template) {
      lists.push({
        el,
        expr: compileExpr(list),
        template,
        key: el.dataset.key,
        limit: Number(el.dataset.limit ?? Infinity),
        flip: el.dataset.flip !== undefined,
        rows: new Map(),
      });
    }
  }

  return {
    update(item, view) {
      const now = performance.now();
      for (const binding of bindings) {
        const { clock } = binding;
        if (clock) {
          if (clock.frame !== now) {
            clock.frame = now;
            clock.open = now - clock.at >= clock.every;
            if (clock.open) clock.at = now;
          }
          if (!clock.open) continue;
        }
        const value = evaluate(binding.expr, item, view);
        if (value === binding.last) continue;
        binding.last = value;
        apply(binding, value);
      }
      for (const list of lists) updateList(list, item, view);
    },
  };
}
