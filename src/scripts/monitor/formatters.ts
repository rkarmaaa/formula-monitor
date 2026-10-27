import type { CarView, EventView, RaceView } from '@lib/telemetry/view';
import { fill } from '@lib/text';
import { teamOf } from '@data/teams';
import { tracks } from '@data/tracks';
import { t } from '@i18n/index';

// Formatter del binder: valore grezzo → testo, numero (custom property) o stato (attributo).
export interface Scope {
  view: RaceView;
  item: unknown;
}
export type Formatter = (value: unknown, arg: string | undefined, scope: Scope) => unknown;

const DASH = '—';
const MINUS = '−';
const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const signed = (value: number, digits: number) => `${value < 0 ? MINUS : '+'}${Math.abs(value).toFixed(digits)}`;

export function lapTime(ms: number): string {
  if (!(ms > 0)) return DASH;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(3).padStart(6, '0');
  return minutes ? `${minutes}:${seconds}` : seconds;
}

const toKmh = (kmh: number, view: RaceView) => (view.units.speed === 'mph' ? kmh * 0.621371 : kmh);
const toTemp = (celsius: number, view: RaceView) => (view.units.temp === 'f' ? (celsius * 9) / 5 + 32 : celsius);

// Soglie per gli stati colore: [freddo/ok, ok/caldo, caldo/oltre] oppure [ok/attenzione, attenzione/pericolo]
const TONES: Record<string, { limits: number[]; names: string[] }> = {
  tyre: { limits: [78, 106, 116], names: ['cold', 'ok', 'hot', 'over'] },
  inner: { limits: [84, 108, 118], names: ['cold', 'ok', 'hot', 'over'] },
  brake: { limits: [300, 820, 1000], names: ['cold', 'ok', 'hot', 'over'] },
  engine: { limits: [90, 118, 128], names: ['cold', 'ok', 'hot', 'over'] },
  wear: { limits: [30, 55, 75], names: ['ok', 'warn', 'hot', 'over'] },
  damage: { limits: [1, 20, 50], names: ['none', 'low', 'mid', 'high'] },
  pu: { limits: [40, 65, 85], names: ['ok', 'warn', 'hot', 'over'] },
  ers: { limits: [15, 40], names: ['danger', 'warn', 'ok'] },
};

const compound = (id: unknown) => (isNum(id) ? t.f1.compounds[id] : undefined);
const COMPOUND_CLASS: Record<string, string> = { S: 'soft', M: 'medium', H: 'hard', I: 'inter', W: 'wet', D: 'hard' };

const surname = (car?: CarView) => car?.surname ?? DASH;

function eventText(record: EventView, view: RaceView): string {
  const { event } = record;
  const template = t.f1.events[event.code] ?? event.code;
  const base = { car: surname(record.car), other: surname(record.other) };
  switch (event.code) {
    case 'FTLP':
      return fill(template, { ...base, time: lapTime(event.details.lapTime * 1000) });
    case 'RTMT':
      return fill(template, { ...base, reason: t.f1.retirement[event.details.reason] ?? DASH });
    case 'DRSD':
      return fill(template, { reason: t.f1.drsDisabled[event.details.reason] ?? DASH });
    case 'PENA': {
      const { penaltyType, infringementType, time } = event.details;
      const penalty = `${t.f1.penalties[penaltyType] ?? DASH}${penaltyType === 4 && time ? ` +${time} s` : ''}`;
      return fill(template, { ...base, penalty, infringement: t.f1.infringements[infringementType] ?? DASH });
    }
    case 'SPTP':
      return fill(template, {
        ...base,
        speed: `${Math.round(toKmh(event.details.speed, view))} ${view.units.speed === 'mph' ? 'mph' : 'km/h'}`,
      });
    case 'SCAR':
      return fill(template, {
        type: t.f1.safetyCar[event.details.safetyCarType] ?? DASH,
        phase: t.f1.safetyCarPhase[event.details.eventType] ?? '',
      });
    default:
      return fill(template, base);
  }
}

// Distacco in classifica: in gara dall'auto davanti (o giri di ritardo), altrimenti dal giro migliore del primo
function towerGap(car: CarView | undefined, view: RaceView): string {
  if (!car || car.position === 1) return '';
  if (view.race.isRace) {
    if (car.lapsDown > 0) return `+${car.lapsDown} ${t.monitor.blocks.timing.laps}`;
    return car.intervalMs > 0 ? `+${(car.intervalMs / 1000).toFixed(3)}` : DASH;
  }
  return car.gapMs > 0 ? `+${(car.gapMs / 1000).toFixed(3)}` : car.bestLapMs > 0 ? '' : DASH;
}

const EVENT_TONES: Record<string, string> = {
  OVTK: 'overtake',
  PENA: 'penalty',
  DTSV: 'penalty',
  SGSV: 'penalty',
  FTLP: 'fastest',
  SPTP: 'fastest',
  SCAR: 'caution',
  RDFL: 'danger',
  RTMT: 'danger',
  COLL: 'danger',
  CHQF: 'finish',
  RCWN: 'finish',
};

export const formatters: Record<string, Formatter> = {
  fixed: (v, arg) => (isNum(v) ? v.toFixed(Number(arg ?? 1)) : DASH),
  pct: (v) => (isNum(v) ? `${Math.round(v)}%` : DASH),
  unit: (v) => (isNum(v) ? clamp(v).toFixed(3) : 0),
  ratio: (v, arg) => (isNum(v) ? clamp(v / Number(arg ?? 1)).toFixed(3) : 0),
  signedRatio: (v, arg) => (isNum(v) ? clamp(v / Number(arg ?? 1), -1, 1).toFixed(3) : 0),
  thousands: (v) => (isNum(v) ? Math.round(v).toLocaleString('it-IT') : DASH),
  speed: (v, _, { view }) => (isNum(v) ? Math.round(toKmh(v, view)) : DASH),
  speedUnit: (_, __, { view }) => (view.units.speed === 'mph' ? 'MPH' : 'KM/H'),
  temp: (v, _, { view }) => (isNum(v) ? `${Math.round(toTemp(v, view))}°` : DASH),
  lapTime: (v) => (isNum(v) ? lapTime(v) : DASH),
  delta: (v) => (isNum(v) ? signed(v / 1000, 3) : DASH),
  gap: (v) => (isNum(v) && v > 0 ? `+${(v / 1000).toFixed(3)}` : DASH),
  trend: (v) => (isNum(v) ? `${signed(v / 1000, 2)} s` : DASH),
  interval: (v) => {
    const car = v as CarView | undefined;
    if (!car) return DASH;
    if (car.position === 1) return t.widgets.leaderboard.leader;
    if (car.lapsDown > 0) return `+${car.lapsDown} G`;
    return car.intervalMs > 0 ? `+${(car.intervalMs / 1000).toFixed(3)}` : DASH;
  },
  pos: (v) => (isNum(v) && v > 0 ? `P${v}` : DASH),
  gained: (v) => (isNum(v) && v !== 0 ? `${v > 0 ? '▲' : '▼'}${Math.abs(v)}` : '='),
  gainedTone: (v) => (isNum(v) && v !== 0 ? (v > 0 ? 'up' : 'down') : null),
  gear: (v) => (isNum(v) ? (v < 0 ? 'R' : v === 0 ? 'N' : v) : DASH),
  compound: (v) => compound(v)?.short ?? DASH,
  compoundLetter: (v) => compound(v)?.short ?? '',
  towerGap: (v, _, { view }) => towerGap(v as CarView | undefined, view),
  compoundClass: (v) => COMPOUND_CLASS[compound(v)?.short ?? ''] ?? null,
  track: (v) => (isNum(v) ? (tracks[v]?.name ?? DASH) : DASH),
  trackShort: (v) => (isNum(v) ? (tracks[v]?.short ?? DASH) : DASH),
  session: (v) => (isNum(v) ? (t.f1.sessionTypes[v] ?? DASH) : DASH),
  weather: (v) => (isNum(v) ? (t.f1.weather[v] ?? DASH) : DASH),
  ersMode: (v, _, { view }) =>
    isNum(v) ? ((view.format === 2026 ? t.f1.ersModes2026 : t.f1.ersModes)[v] ?? DASH) : DASH,
  fuelMix: (v) => (isNum(v) ? (t.f1.fuelMix[v] ?? DASH) : DASH),
  safetyCar: (v) => (isNum(v) ? (t.f1.safetyCar[v] ?? DASH) : DASH),
  kg: (v) => (isNum(v) ? `${v.toFixed(1)} kg` : DASH),
  signedLaps: (v) => (isNum(v) ? signed(v, 1) : DASH),
  mj: (v) => (isNum(v) ? (v / 1_000_000).toFixed(2) : DASH),
  kw: (v) => (isNum(v) ? Math.round(v / 1000) : DASH),
  time: (v) => {
    if (!isNum(v)) return DASH;
    const s = Math.max(0, Math.round(v));
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
    return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
  },
  laps: (v) => (isNum(v) ? fill(t.widgets.battle.catch, { n: v }) : DASH),
  lapsBehind: (v) => (isNum(v) ? fill(t.widgets.battle.caught, { n: v }) : DASH),
  ageDelta: (v) => (isNum(v) && v !== 0 ? `${v > 0 ? '+' : MINUS}${Math.abs(v)} ${t.widgets.tyres.laps}` : '='),
  distanceIn: (v, arg) =>
    isNum(v) && v > 0 ? fill(arg === 'aero' ? t.widgets.aero.in : t.widgets.drs.in, { m: Math.round(v) }) : DASH,
  tone: (v, arg) => {
    const set = TONES[arg ?? ''];
    if (!set || !isNum(v)) return null;
    const i = set.limits.findIndex((limit) => v < limit);
    return set.names[i < 0 ? set.names.length - 1 : i];
  },
  deltaTone: (v) => (isNum(v) && Math.abs(v) >= 5 ? (v < 0 ? 'gain' : 'loss') : null),
  trendTone: (v, arg) => (isNum(v) && Math.abs(v) >= 20 ? (v < 0 !== (arg === 'behind') ? 'gain' : 'loss') : null),
  fuelTone: (v) => (isNum(v) ? (v < 0 ? 'danger' : v < 0.4 ? 'warn' : 'ok') : null),
  scClass: (v) => (isNum(v) ? ([null, 'sc', 'vsc', 'formation'][v] ?? null) : null),
  bool: (v) => (v ? true : null),
  not: (v) => (v ? null : true),
  eq: (v, arg) => (String(v) === arg ? true : null),
  gt: (v, arg) => (isNum(v) && v > Number(arg ?? 0) ? true : null),
  team: (v) => teamOf(isNum(v) ? v : undefined).color,
  event: (v, _, { view }) => (v ? eventText(v as EventView, view) : DASH),
  eventTone: (v) => (typeof v === 'string' ? (EVENT_TONES[v] ?? 'info') : null),
  lapLabel: (v) => (isNum(v) && v > 0 ? `G${v}` : DASH),
};
