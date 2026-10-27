import type { GameId } from './games.ts';

// Catalogo dei blocchi del monitor. La griglia è 12 colonne × 24 righe su un display 9:16.
// tier = importanza visiva · exclusive = dato che l'HUD del gioco non mostra (badge nel catalogo).
export type Tier = 'hero' | 'primary' | 'secondary' | 'detail';
export type WidgetCategory = 'race' | 'car' | 'strategy' | 'track';

export interface WidgetDef {
  id: string;
  tier: Tier;
  category: WidgetCategory;
  icon: string;
  size: { w: number; h: number };
  min: { w: number; h: number };
  exclusive?: boolean;
  games?: GameId[];
}

export const GRID = { columns: 12, rows: 24 } as const;

export const widgets = [
  { id: 'position', tier: 'hero', category: 'race', icon: 'lucide:trophy', size: { w: 3, h: 3 }, min: { w: 2, h: 2 } },
  { id: 'lap', tier: 'hero', category: 'race', icon: 'lucide:flag', size: { w: 3, h: 3 }, min: { w: 2, h: 2 } },
  {
    id: 'delta',
    tier: 'hero',
    category: 'race',
    icon: 'lucide:timer',
    size: { w: 6, h: 3 },
    min: { w: 3, h: 2 },
    exclusive: true,
  },
  { id: 'cockpit', tier: 'hero', category: 'car', icon: 'lucide:gauge', size: { w: 6, h: 4 }, min: { w: 3, h: 3 } },
  {
    id: 'battle',
    tier: 'hero',
    category: 'race',
    icon: 'lucide:swords',
    size: { w: 6, h: 4 },
    min: { w: 4, h: 3 },
    exclusive: true,
  },
  {
    id: 'leaderboard',
    tier: 'primary',
    category: 'race',
    icon: 'lucide:list-ordered',
    size: { w: 7, h: 9 },
    min: { w: 4, h: 4 },
    exclusive: true,
  },
  { id: 'map', tier: 'primary', category: 'track', icon: 'lucide:map', size: { w: 5, h: 5 }, min: { w: 3, h: 3 } },
  {
    id: 'tyres',
    tier: 'primary',
    category: 'car',
    icon: 'lucide:circle-dot',
    size: { w: 5, h: 4 },
    min: { w: 3, h: 3 },
    exclusive: true,
  },
  {
    id: 'strategy',
    tier: 'primary',
    category: 'strategy',
    icon: 'lucide:route',
    size: { w: 4, h: 4 },
    min: { w: 3, h: 3 },
    exclusive: true,
  },
  {
    id: 'fuel',
    tier: 'secondary',
    category: 'strategy',
    icon: 'lucide:fuel',
    size: { w: 4, h: 2 },
    min: { w: 2, h: 2 },
  },
  {
    id: 'ers',
    tier: 'secondary',
    category: 'car',
    icon: 'lucide:battery-charging',
    size: { w: 4, h: 2 },
    min: { w: 2, h: 2 },
  },
  {
    id: 'flags',
    tier: 'secondary',
    category: 'track',
    icon: 'lucide:siren',
    size: { w: 4, h: 4 },
    min: { w: 2, h: 2 },
  },
  {
    id: 'sectors',
    tier: 'secondary',
    category: 'race',
    icon: 'lucide:split',
    size: { w: 6, h: 2 },
    min: { w: 3, h: 2 },
  },
  {
    id: 'inputs',
    tier: 'secondary',
    category: 'car',
    icon: 'lucide:footprints',
    size: { w: 6, h: 2 },
    min: { w: 3, h: 2 },
  },
  {
    id: 'events',
    tier: 'secondary',
    category: 'race',
    icon: 'lucide:radio',
    size: { w: 6, h: 4 },
    min: { w: 3, h: 2 },
  },
  {
    id: 'drs',
    tier: 'secondary',
    category: 'car',
    icon: 'lucide:wind',
    size: { w: 3, h: 2 },
    min: { w: 2, h: 2 },
    games: ['f1-25'],
  },
  {
    id: 'aero',
    tier: 'secondary',
    category: 'car',
    icon: 'lucide:wind',
    size: { w: 4, h: 2 },
    min: { w: 3, h: 2 },
    games: ['f1-25-2026'],
  },
  { id: 'session', tier: 'detail', category: 'track', icon: 'lucide:info', size: { w: 4, h: 3 }, min: { w: 3, h: 2 } },
  {
    id: 'weather',
    tier: 'detail',
    category: 'track',
    icon: 'lucide:cloud-sun-rain',
    size: { w: 6, h: 3 },
    min: { w: 3, h: 2 },
    exclusive: true,
  },
  {
    id: 'laps',
    tier: 'detail',
    category: 'race',
    icon: 'lucide:history',
    size: { w: 6, h: 5 },
    min: { w: 4, h: 3 },
    exclusive: true,
  },
  {
    id: 'positions',
    tier: 'detail',
    category: 'race',
    icon: 'lucide:chart-spline',
    size: { w: 6, h: 5 },
    min: { w: 4, h: 3 },
    exclusive: true,
  },
  { id: 'damage', tier: 'detail', category: 'car', icon: 'lucide:wrench', size: { w: 4, h: 4 }, min: { w: 3, h: 3 } },
  {
    id: 'engine',
    tier: 'detail',
    category: 'car',
    icon: 'lucide:cog',
    size: { w: 4, h: 4 },
    min: { w: 3, h: 3 },
    exclusive: true,
  },
  {
    id: 'brakes',
    tier: 'detail',
    category: 'car',
    icon: 'lucide:disc',
    size: { w: 3, h: 3 },
    min: { w: 2, h: 2 },
    exclusive: true,
  },
  {
    id: 'gforce',
    tier: 'detail',
    category: 'car',
    icon: 'lucide:crosshair',
    size: { w: 4, h: 3 },
    min: { w: 3, h: 2 },
    exclusive: true,
  },
  {
    id: 'speedtrap',
    tier: 'detail',
    category: 'race',
    icon: 'lucide:zap',
    size: { w: 4, h: 3 },
    min: { w: 3, h: 2 },
    exclusive: true,
  },
] as const satisfies readonly WidgetDef[];

export type WidgetId = (typeof widgets)[number]['id'];

export interface LayoutItem {
  id: WidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Layout 9:16 di partenza: in alto ciò che serve a colpo d'occhio, sotto strategia e contesto
const base: LayoutItem[] = [
  { id: 'position', x: 0, y: 0, w: 3, h: 3 },
  { id: 'lap', x: 3, y: 0, w: 3, h: 3 },
  { id: 'delta', x: 6, y: 0, w: 6, h: 3 },
  { id: 'cockpit', x: 0, y: 3, w: 6, h: 4 },
  { id: 'battle', x: 6, y: 3, w: 6, h: 4 },
  { id: 'leaderboard', x: 0, y: 7, w: 7, h: 9 },
  { id: 'map', x: 7, y: 7, w: 5, h: 5 },
  { id: 'tyres', x: 7, y: 12, w: 5, h: 4 },
  { id: 'strategy', x: 0, y: 16, w: 4, h: 4 },
  { id: 'fuel', x: 4, y: 16, w: 4, h: 2 },
  { id: 'ers', x: 4, y: 18, w: 4, h: 2 },
  { id: 'flags', x: 8, y: 16, w: 4, h: 4 },
  { id: 'sectors', x: 0, y: 20, w: 6, h: 2 },
  { id: 'inputs', x: 0, y: 22, w: 6, h: 2 },
  { id: 'events', x: 6, y: 20, w: 6, h: 4 },
];

export const defaultLayout = (game: GameId): LayoutItem[] =>
  game === 'f1-25-2026'
    ? base
        .map((item) => (item.id === 'flags' ? { ...item, h: 2 } : item))
        .concat({ id: 'aero', x: 8, y: 18, w: 4, h: 2 })
    : base;

export const widgetById = (id: string) => widgets.find((widget) => widget.id === id);
export const isAvailable = (widget: WidgetDef, game: GameId) => !widget.games || widget.games.includes(game);
