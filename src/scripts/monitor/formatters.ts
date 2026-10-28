import type { CarView, EventView, RaceView } from '@lib/telemetry/view';
import { fill } from '@lib/text';
import { teamOf } from '@data/teams';
import { tracks } from '@data/tracks';
import { href } from '@lib/paths';
import { t } from '@i18n/index';

// Formatter del binder: valore grezzo → testo, numero (custom property) o stato (attributo).
export interface Scope {
  view: RaceView;
  item: unknown;
}
export type Formatter = (value: unknown, arg: string | undefined, scope: Scope) => unknown;

const DASH = '—';
const PU_OK = 30;
const PU_HIGH = 60;
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

const toTemp = (celsius: number, view: RaceView) => (view.units.temp === 'f' ? (celsius * 9) / 5 + 32 : celsius);

const compound = (id: unknown) => (isNum(id) ? t.f1.compounds[id] : undefined);
const COMPOUND_CLASS: Record<string, string> = { S: 'soft', M: 'medium', H: 'hard', I: 'inter', W: 'wet', D: 'hard' };

// Valori dei messaggi di gara: piloti ({car}, {other}) più i dettagli del singolo evento
function eventValues(record: EventView, name: (car?: CarView) => string): Record<string, string> {
  const { event } = record;
  const base = { car: name(record.car), other: name(record.other) };
  switch (event.code) {
    case 'FTLP':
      return { ...base, time: lapTime(event.details.lapTime * 1000) };
    case 'RTMT':
      return { ...base, reason: t.f1.retirement[event.details.reason] ?? DASH };
    case 'DRSD':
      return { reason: t.f1.drsDisabled[event.details.reason] ?? DASH };
    case 'PENA': {
      const { penaltyType, infringementType, time } = event.details;
      const penalty = `${t.f1.penalties[penaltyType] ?? DASH}${penaltyType === 4 && time ? ` +${time} s` : ''}`;
      return { ...base, penalty, infringement: t.f1.infringements[infringementType] ?? DASH };
    }
    case 'SCAR':
      return {
        type: t.f1.safetyCar[event.details.safetyCarType] ?? DASH,
        phase: t.f1.safetyCarPhase[event.details.eventType] ?? '',
      };
    default:
      return base;
  }
}

const eventTemplate = (record: EventView) => t.f1.events[record.event.code] ?? record.event.code;
// Messaggio a pezzi per il live feed: le sigle dei piloti diventano pezzi "name" (evidenziati nel blocco)
export interface TextPart {
  text: string;
  name: boolean;
}

function eventParts(record: EventView): TextPart[] {
  const values = eventValues(record, (car) => car?.code ?? DASH);
  return eventTemplate(record)
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((piece) => {
      const key = /^\{(\w+)\}$/.exec(piece)?.[1];
      if (!key) return { text: piece, name: false };
      return { text: values[key] ?? '', name: key === 'car' || key === 'other' };
    });
}

// Distacco in classifica: in gara dal leader (o giri di ritardo), altrimenti dal giro migliore del primo.
// Il primo mostra "Leader" (in qualifica solo quando ha un tempo)
function towerGap(car: CarView | undefined, view: RaceView): string {
  if (!car) return '';
  if (car.position === 1) return view.race.isRace || car.bestLapMs > 0 ? t.monitor.blocks.timing.leader : '';
  if (view.race.isRace) {
    if (car.lapsDown > 0) return `+${car.lapsDown} ${t.monitor.blocks.timing.laps}`;
    return car.gapLeaderMs > 0 ? `+${(car.gapLeaderMs / 1000).toFixed(3)}` : DASH;
  }
  return car.gapMs > 0 ? `+${(car.gapMs / 1000).toFixed(3)}` : car.bestLapMs > 0 ? '' : DASH;
}
export const formatters: Record<string, Formatter> = {
  fixed: (v, arg) => (isNum(v) ? v.toFixed(Number(arg ?? 1)) : DASH),
  pct: (v) => (isNum(v) ? `${Math.round(v)}%` : DASH),
  unit: (v) => (isNum(v) ? clamp(v).toFixed(3) : 0),
  ratio: (v, arg) => (isNum(v) ? clamp(v / Number(arg ?? 1)).toFixed(3) : 0),
  temp: (v, _, { view }) => (isNum(v) ? `${Math.round(toTemp(v, view))}°` : DASH),
  lapTime: (v) => (isNum(v) ? lapTime(v) : DASH),
  delta: (v) => (isNum(v) ? signed(v / 1000, 3) : DASH),
  pos: (v) => (isNum(v) && v > 0 ? `P${v}` : DASH),
  compoundLetter: (v) => compound(v)?.short ?? '',
  towerGap: (v, _, { view }) => towerGap(v as CarView | undefined, view),
  compoundClass: (v) => COMPOUND_CLASS[compound(v)?.short ?? ''] ?? null,
  track: (v) => (isNum(v) ? (tracks[v]?.name ?? DASH) : DASH),
  session: (v) => (isNum(v) ? (t.f1.sessionTypes[v] ?? DASH) : DASH),
  time: (v) => {
    if (!isNum(v)) return DASH;
    const s = Math.max(0, Math.round(v));
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
    return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
  },
  deltaTone: (v) => (isNum(v) && Math.abs(v) >= 5 ? (v < 0 ? 'gain' : 'loss') : null),
  fuelTone: (v) => (isNum(v) ? (v < 0 ? 'danger' : v < 0.4 ? 'warn' : 'ok') : null),
  bool: (v) => (v ? true : null),
  eq: (v, arg) => (String(v) === arg ? true : null),
  team: (v) => teamOf(isNum(v) ? v : undefined).color,
  eventParts: (v) => (v ? eventParts(v as EventView) : []),
  lapLabel: (v) => (isNum(v) && v > 0 ? `G${v}` : DASH),

  // ——— Monitor in qualifica ———
  // Settore in secondi anche oltre il minuto (giri di lancio): resta largo come gli altri
  sectorTime: (v) => (isNum(v) && v > 0 ? (v / 1000).toFixed(3) : DASH),
  pad2: (v) => (isNum(v) && v > 0 ? String(v).padStart(2, '0') : DASH),
  teamLogo: (v) => {
    const logo = teamOf(isNum(v) ? v : undefined).logo;
    return logo ? href(`teams/${logo}.png`) : null;
  },
  noTeamLogo: (v) => (teamOf(isNum(v) ? v : undefined).logo ? null : true),
  compoundName: (v) => compound(v)?.name ?? '',
  offset: (v) => (isNum(v) ? `+${v}’` : DASH),
  // Strategia di gara: stato della finestra dei pit, giri della gomma, margine di carburante
  pitWindow: (v, _, { view }) => {
    const pit = v as RaceView['pit'] | undefined;
    const s = t.monitor.blocks.strategy;
    if (!pit?.idealLap || !view.race.lap) return DASH;
    const laps = pit.idealLap - view.race.lap;
    if (laps > 0) return laps === 1 ? s.inOne : fill(s.in, { n: laps });
    return view.race.lap <= pit.latestLap ? s.open : s.closed;
  },
  tyreAge: (v) => (isNum(v) ? fill(t.monitor.blocks.strategy.age, { n: v }) : ''),
  fuelLaps: (v) => (isNum(v) ? fill(t.monitor.blocks.strategy.fuelLaps, { laps: signed(v, 1) }) : DASH),
  // Usura dei componenti della power unit: verde fino a PU_OK, arancio fino a PU_HIGH, poi rosso
  puTone: (v) => (isNum(v) ? (v < PU_OK ? 'ok' : v < PU_HIGH ? 'high' : 'over') : null),
};
