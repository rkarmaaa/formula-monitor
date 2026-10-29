import type {
  CarDamage,
  CarMotion,
  CarStatus,
  CarTelemetry,
  CarTelemetry2,
  LapData,
  Participant,
  SessionData,
  SessionHistory,
} from '../f1/schema.ts';
import { liveDelta, msOf, type EventRecord, type RaceState } from './state.ts';
import { referenceFor, type Reference, type TrackOutline } from './track.ts';

// Vista per i widget: dati grezzi per auto (nomi come da specifica) + campi derivati pronti da mostrare.
// Ricostruita al massimo una volta per frame, solo se lo stato è cambiato.
export interface CarView {
  index: number;
  isPlayer: boolean;
  name: string;
  surname: string;
  code: string;
  teamId: number;
  raceNumber: number;
  position: number;
  lap?: LapData;
  participant?: Participant;
  telemetry?: CarTelemetry;
  status?: CarStatus;
  damage?: CarDamage;
  motion?: CarMotion;
  telemetry2?: CarTelemetry2;
  history?: SessionHistory;
  gapLeaderMs: number;
  intervalMs: number;
  lapsDown: number;
  lastLapMs: number;
  bestLapMs: number;
  lastSectorsMs: number[];
  bestSectorsMs: number[];
  paceMs: number;
  positionsGained: number;
  ersPct: number;
  rpmRatio: number;
  wearMax: number;
  stints: number[];
  inPit: boolean;
  retired: boolean;
  fastestLap: boolean;
  publicTelemetry: boolean;
  inGarage: boolean;
  bestLapTone: TimeTone;
  // Settori del giro in corso (o del precedente) con il tono rispetto ai migliori della sessione
  sectors: SectorView[];
  // Distacco dal primo: sul giro migliore in qualifica/prove, sul traguardo in gara
  gapMs: number;
}

export interface Battle {
  car: CarView;
  gapMs: number;
  // Variazione media del distacco per giro (negativo = si avvicina) e giri per annullarlo
  trendMs?: number;
  catchLaps?: number;
  drsRange: boolean;
  tyreAgeDelta?: number;
}

export interface EventView extends EventRecord {
  car?: CarView;
  other?: CarView;
}

// Colori dei tempi come in TV: viola = migliore assoluto, verde = personale, giallo = più lento
export type TimeTone = 'best' | 'personal' | 'slower' | 'invalid' | 'none';

export interface SectorView {
  ms: number;
  tone: TimeTone;
  live: boolean;
}

export interface LapRow {
  lap: number;
  ms: number;
  valid: boolean;
  tone: TimeTone;
  sectors: SectorView[];
  compound: number;
}

export interface RaceView {
  live: boolean;
  format?: number;
  sessionTime: number;
  session?: SessionData;
  units: { speed: 'kmh' | 'mph'; temp: 'c' | 'f' };
  cars: CarView[];
  player?: CarView;
  leader?: CarView;
  ahead?: Battle;
  behind?: Battle;
  race: {
    lap: number;
    totalLaps: number;
    lapsLeft: number;
    progress: number;
    timeLeft: number;
    isRace: boolean;
    fuelDeltaLaps?: number;
    lightsOn: number;
    lightsSlots: boolean[];
  };
  liveDeltaMs?: number;
  // Danno delle ali del giocatore (%): l'ala anteriore conta il lato più danneggiato
  wings: { front?: number; rear?: number };
  playerBestMs: number;
  bestSectorsMs: number[];
  playerSectors: SectorView[];
  playerLaps: LapRow[];
  speedTraps: { car: CarView; speed: number }[];
  fastestLap?: { car?: CarView; timeMs: number };
  speedTrap?: { car?: CarView; speed: number };
  flags: { safetyCar: number; redFlag: boolean; yellowSectors: boolean[]; player: number };
  pit: { idealLap: number; latestLap: number; rejoinPosition: number; limiter: boolean; from: number; to: number };
  forecast: SessionData['weatherForecastSamples'];
  // Prossime previsioni della sessione in corso (al massimo 5), con la pioggia segnalata
  weatherNext: WeatherSlot[];
  events: EventView[];
  lapPositions: number[][];
  trackLength: number;
  sectorStarts: number[];
  track?: TrackOutline;
  reference?: Reference;
  bestLapMs: number;
}

const RACE_SESSIONS = new Set([15, 16, 17]);
const DRS_GAP_MS = 1000;
const ERS_CAPACITY_J = 4_000_000;
const TREND_LAPS = 4;
const TREND_OUTLIER_MS = 2500;

const surnameOf = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;

function sectorTimes(history: SessionHistory | undefined, lapNum: number): number[] {
  const lap = history && lapNum > 0 ? history.lapHistoryData[lapNum - 1] : undefined;
  if (!lap) return [0, 0, 0];
  return [
    msOf(lap.sector1TimeMinutesPart, lap.sector1TimeMSPart),
    msOf(lap.sector2TimeMinutesPart, lap.sector2TimeMSPart),
    msOf(lap.sector3TimeMinutesPart, lap.sector3TimeMSPart),
  ];
}

function bestSectors(history: SessionHistory | undefined): number[] {
  if (!history) return [0, 0, 0];
  return [history.bestSector1LapNum, history.bestSector2LapNum, history.bestSector3LapNum].map(
    (lapNum, i) => sectorTimes(history, lapNum)[i] ?? 0,
  );
}

function pace(history: SessionHistory | undefined): number {
  if (!history) return 0;
  const done = history.lapHistoryData.slice(0, Math.max(0, history.numLaps - 1)).filter((lap) => lap.lapTimeInMS > 0);
  const recent = done.slice(-TREND_LAPS);
  return recent.length ? recent.reduce((sum, lap) => sum + lap.lapTimeInMS, 0) / recent.length : 0;
}

function buildCar(state: RaceState, index: number): CarView {
  const lap = state.lapData?.lapData[index];
  const participant = state.participants?.participants[index];
  const telemetry = state.telemetry?.carTelemetryData[index];
  const status = state.status?.carStatusData[index];
  const damage = state.damage?.carDamageData[index];
  const history = state.histories[index];
  const name = participant?.name || `#${index + 1}`;
  const surname = surnameOf(name);
  const best = history ? history.lapHistoryData[history.bestLapTimeLapNum - 1]?.lapTimeInMS : undefined;
  const position = lap?.carPosition ?? 0;
  const stints = history
    ? history.tyreStintsHistoryData.slice(0, history.numTyreStints).map((stint) => stint.tyreVisualCompound)
    : [];

  return {
    index,
    isPlayer: index === state.playerIndex,
    name,
    surname,
    code: surname.slice(0, 3).toUpperCase(),
    teamId: participant?.teamId ?? 255,
    raceNumber: participant?.raceNumber ?? 0,
    position,
    lap,
    participant,
    telemetry,
    status,
    damage,
    motion: state.motion?.carMotionData[index],
    telemetry2: state.telemetry2?.carTelemetry2Data[index],
    history,
    gapLeaderMs: lap ? msOf(lap.deltaToRaceLeaderMinutesPart, lap.deltaToRaceLeaderMSPart) : 0,
    intervalMs: lap ? msOf(lap.deltaToCarInFrontMinutesPart, lap.deltaToCarInFrontMSPart) : 0,
    lapsDown: 0,
    lastLapMs: lap?.lastLapTimeInMS ?? 0,
    bestLapMs: best ?? 0,
    lastSectorsMs: sectorTimes(history, (lap?.currentLapNum ?? 1) - 1),
    bestSectorsMs: bestSectors(history),
    paceMs: pace(history),
    positionsGained: lap && lap.gridPosition > 0 ? lap.gridPosition - lap.carPosition : 0,
    ersPct: status ? (status.ersStoreEnergy / ERS_CAPACITY_J) * 100 : 0,
    rpmRatio: telemetry && status?.maxRPM ? Math.min(1, telemetry.engineRPM / status.maxRPM) : 0,
    wearMax: damage ? Math.max(...damage.tyresWear) : 0,
    stints: stints.length ? stints : status ? [status.visualTyreCompound] : [],
    inPit: (lap?.pitStatus ?? 0) > 0,
    retired: (lap?.resultStatus ?? 2) >= 4,
    fastestLap: state.fastestLap?.carIndex === index,
    publicTelemetry: index === state.playerIndex || participant?.yourTelemetry === 1,
    inGarage: lap?.driverStatus === 0,
    bestLapTone: 'none',
    sectors: [],
    gapMs: 0,
  };
}

// Settori del giro in corso appena chiusi; quelli non ancora percorsi mostrano il giro precedente.
// Il tono si assegna dopo, quando si conoscono i migliori assoluti (vedi buildView).
function carSectors(car: CarView): (SectorView & { invalid: boolean })[] {
  const lap = car.lap;
  if (!lap) return [0, 1, 2].map(() => ({ ms: 0, tone: 'none', live: false, invalid: false }));
  const current = [
    msOf(lap.sector1TimeMinutesPart, lap.sector1TimeMSPart),
    msOf(lap.sector2TimeMinutesPart, lap.sector2TimeMSPart),
  ];
  const previous = sectorTimes(car.history, lap.currentLapNum - 1);
  const previousValid = ((car.history?.lapHistoryData[lap.currentLapNum - 2]?.lapValidBitFlags ?? 1) & 0x01) === 1;
  return [0, 1, 2].map((i) => {
    const live = lap.sector > i && (current[i] ?? 0) > 0;
    const ms = live ? current[i]! : (previous[i] ?? 0);
    const invalid = live ? lap.currentLapInvalid === 1 : !previousValid;
    return { ms, live, invalid, tone: 'none' as TimeTone };
  });
}

// Trend del distacco relativo negli ultimi giri (ms/giro): scarta i salti da pit stop o incidenti
function gapTrend(state: RaceState, front: CarView, back: CarView): number | undefined {
  const a = state.gapLog[front.index];
  const b = state.gapLog[back.index];
  const lap = back.lap?.currentLapNum ?? 0;
  if (!a || !b || lap < 3) return undefined;
  const relative = (n: number) => (b[n] ?? Number.NaN) - (a[n] ?? Number.NaN);
  const deltas: number[] = [];
  for (let n = Math.max(3, lap - TREND_LAPS + 1); n <= lap; n++) {
    const delta = relative(n) - relative(n - 1);
    if (Number.isFinite(delta) && Math.abs(delta) < TREND_OUTLIER_MS) deltas.push(delta);
  }
  return deltas.length >= 2 ? deltas.reduce((sum, d) => sum + d, 0) / deltas.length : undefined;
}

function battle(
  state: RaceState,
  car: CarView | undefined,
  player: CarView,
  side: 'ahead' | 'behind',
): Battle | undefined {
  if (!car) return undefined;
  const gapMs = side === 'ahead' ? player.intervalMs : car.intervalMs;
  const trend = side === 'ahead' ? gapTrend(state, car, player) : gapTrend(state, player, car);
  const closing = trend !== undefined && trend < -20;
  const ages = [car.status?.tyresAgeLaps, player.status?.tyresAgeLaps];
  return {
    car,
    gapMs,
    trendMs: trend,
    catchLaps: closing ? Math.ceil(gapMs / -trend!) : undefined,
    drsRange: gapMs > 0 && gapMs < DRS_GAP_MS,
    tyreAgeDelta: ages[0] !== undefined && ages[1] !== undefined ? ages[0] - ages[1] : undefined,
  };
}

// Nessun riferimento ancora (0) = il tempo è per forza il migliore
const toneOf = (ms: number, personal: number, overall: number): TimeTone =>
  ms <= 0 ? 'none' : overall <= 0 || ms <= overall ? 'best' : personal <= 0 || ms <= personal ? 'personal' : 'slower';

// Settori del giro: quelli già percorsi sono "live" e colorati, gli altri grigi. Chiuso il giro, tutti e tre
// restano colorati per SECTOR_HOLD_MS con i tempi del giro appena finito, poi tornano grigi.
const SECTOR_HOLD_MS = 5500;

function playerSectors(player: CarView | undefined, lastSectors: number[], overall: number[]): SectorView[] {
  const lap = player?.lap;
  if (!player || !lap) return [0, 1, 2].map(() => ({ ms: 0, tone: 'none', live: false }));
  const current = [
    msOf(lap.sector1TimeMinutesPart, lap.sector1TimeMSPart),
    msOf(lap.sector2TimeMinutesPart, lap.sector2TimeMSPart),
  ];
  const last = lastSectors.some((ms) => ms > 0) ? lastSectors : player.lastSectorsMs;
  const hold = lap.sector === 0 && lap.currentLapNum > 1 && lap.currentLapTimeInMS < SECTOR_HOLD_MS;
  return [0, 1, 2].map((i) => {
    const ms = lap.sector > i && (current[i] ?? 0) > 0 ? current[i]! : (last[i] ?? 0);
    const live = ms > 0 && (lap.sector > i || hold);
    return { ms, live, tone: live ? toneOf(ms, player.bestSectorsMs[i] ?? 0, overall[i] ?? 0) : 'none' };
  });
}

const LAP_ROWS = 12;

function playerLaps(player: CarView | undefined, overall: number[], fastest: number): LapRow[] {
  const history = player?.history;
  if (!player || !history) return [];
  const completed = Math.max(0, history.numLaps - (player.lap?.resultStatus === 2 ? 1 : 0));
  const stints = history.tyreStintsHistoryData.slice(0, history.numTyreStints);
  const rows: LapRow[] = [];
  for (let n = completed; n >= 1 && rows.length < LAP_ROWS; n--) {
    const lap = history.lapHistoryData[n - 1];
    if (!lap || lap.lapTimeInMS <= 0) continue;
    const sectors = sectorTimes(history, n);
    rows.push({
      lap: n,
      ms: lap.lapTimeInMS,
      valid: (lap.lapValidBitFlags & 0x01) === 1,
      tone: toneOf(lap.lapTimeInMS, player.bestLapMs, fastest),
      sectors: sectors.map((ms, i) => ({
        ms,
        live: false,
        tone: toneOf(ms, player.bestSectorsMs[i] ?? 0, overall[i] ?? 0),
      })),
      compound: stints.find((stint) => stint.endLap >= n)?.tyreVisualCompound ?? 0,
    });
  }
  return rows;
}

function yellowSectors(session: SessionData | undefined, sectorStarts: number[], trackLength: number): boolean[] {
  const sectors = [false, false, false];
  if (!session || !trackLength) return sectors;
  const bounds = sectorStarts.map((start) => start / trackLength);
  session.marshalZones.slice(0, session.numMarshalZones).forEach((zone) => {
    if (zone.zoneFlag !== 3) return;
    const sector = zone.zoneStart >= (bounds[2] ?? 1) ? 2 : zone.zoneStart >= (bounds[1] ?? 1) ? 1 : 0;
    sectors[sector] = true;
  });
  return sectors;
}

export interface WeatherSlot {
  offset: number;
  weather: number;
  air: number;
  track: number;
  rain: number;
  wet: boolean;
}

const WEATHER_SLOTS = 5;
const RAIN_WEATHER = 3; // da "pioggia leggera" in su

// Previsioni della sessione in corso a partire dalla prossima (offset > 0); se il gioco ne manda meno, anche l'attuale
function weatherNext(session: SessionData | undefined): WeatherSlot[] {
  if (!session) return [];
  const own = session.weatherForecastSamples
    .slice(0, session.numWeatherForecastSamples)
    .filter((sample) => sample.sessionType === session.sessionType)
    .sort((a, b) => a.timeOffset - b.timeOffset);
  const future = own.filter((sample) => sample.timeOffset > 0);
  return (future.length >= WEATHER_SLOTS ? future : own).slice(0, WEATHER_SLOTS).map((sample) => ({
    offset: sample.timeOffset,
    weather: sample.weather,
    air: sample.airTemperature,
    track: sample.trackTemperature,
    rain: sample.rainPercentage,
    wet: sample.weather >= RAIN_WEATHER,
  }));
}

export function buildView(state: RaceState): RaceView {
  const { session } = state;
  const lapData = state.lapData?.lapData ?? [];
  const cars = lapData
    .map((lap, index) => (lap.resultStatus >= 2 ? buildCar(state, index) : undefined))
    .filter((car): car is CarView => car !== undefined)
    .sort((a, b) => (a.position || 99) - (b.position || 99));

  // Doppiato = un giro intero di distanza percorsa in meno, non solo un numero di giro diverso
  const leader = cars[0];
  const trackLength = session?.trackLength ?? 0;
  for (const car of cars) {
    const behind = leader?.lap && car.lap ? leader.lap.totalDistance - car.lap.totalDistance : 0;
    car.lapsDown = trackLength && !car.retired ? Math.max(0, Math.floor(behind / trackLength)) : 0;
  }
  const player = cars.find((car) => car.isPlayer);
  const playerAt = player ? cars.indexOf(player) : -1;
  const totalLaps = session?.totalLaps ?? 0;
  const lap = player?.lap?.currentLapNum ?? 0;
  const lapsLeft = Math.max(0, totalLaps - lap + 1);
  const sectorStarts = [0, session?.sector2LapDistanceStart ?? 0, session?.sector3LapDistanceStart ?? 0];
  const lapFraction = trackLength && player?.lap ? Math.max(0, player.lap.lapDistance) / trackLength : 0;
  // Migliori assoluti: dallo storico dei giri validi e dai settori validi appena chiusi (lo storico arriva dopo)
  const isRace = RACE_SESSIONS.has(session?.sessionType ?? 0);
  const sectors = cars.map(carSectors);
  const bestSectorsMs = [0, 1, 2].map((i) =>
    cars.reduce((best, car, k) => {
      const shown = sectors[k]![i]!;
      const candidates = [car.bestSectorsMs[i] ?? 0, shown.invalid ? 0 : shown.ms];
      return candidates.reduce((min, value) => (value > 0 && (min === 0 || value < min) ? value : min), best);
    }, 0),
  );
  const bestLapMs = cars.reduce(
    (best, car) => (car.bestLapMs > 0 && (best === 0 || car.bestLapMs < best) ? car.bestLapMs : best),
    0,
  );
  // In gara i settori seguono il giro in corso; in qualifica restano quelli del giro migliore (somma = MIGLIORE)
  cars.forEach((car, k) => {
    const shown = isRace
      ? sectors[k]!
      : sectorTimes(car.history, car.history?.bestLapTimeLapNum ?? 0).map((ms) => ({
          ms,
          live: false,
          invalid: false,
        }));
    car.sectors = shown.map(({ ms, live, invalid }, i) => ({
      ms,
      live,
      tone: ms > 0 && invalid ? 'invalid' : toneOf(ms, car.bestSectorsMs[i] ?? 0, bestSectorsMs[i] ?? 0),
    }));
    car.bestLapTone = car.bestLapMs > 0 && car.bestLapMs <= bestLapMs ? 'best' : 'none';
    car.gapMs = isRace ? car.gapLeaderMs : car.bestLapMs > 0 && bestLapMs > 0 ? car.bestLapMs - bestLapMs : 0;
  });
  const byIndex = (index: number | undefined) => cars.find((car) => car.index === index);
  const remainingFraction = Math.max(0, lapsLeft - lapFraction);
  const fastestMs =
    state.fastestLap?.timeMs ??
    cars.reduce((best, car) => (car.bestLapMs > 0 && (!best || car.bestLapMs < best) ? car.bestLapMs : best), 0);
  const speedTraps = cars
    .map((car) => ({ car, speed: car.lap?.speedTrapFastestSpeed ?? 0 }))
    .filter((entry) => entry.speed > 0)
    .sort((a, b) => b.speed - a.speed);

  return {
    live: state.version > 0,
    format: state.format,
    sessionTime: state.sessionTime,
    session,
    units: {
      speed: session?.speedUnitsLeadPlayer === 0 ? 'mph' : 'kmh',
      temp: session?.temperatureUnitsLeadPlayer === 1 ? 'f' : 'c',
    },
    cars,
    player,
    leader,
    ahead: player && playerAt > 0 ? battle(state, cars[playerAt - 1], player, 'ahead') : undefined,
    behind: player ? battle(state, cars[playerAt + 1], player, 'behind') : undefined,
    race: {
      lap,
      totalLaps,
      lapsLeft,
      progress: totalLaps ? Math.min(1, (lap - 1 + lapFraction) / totalLaps) : 0,
      timeLeft: session?.sessionTimeLeft ?? 0,
      isRace,
      fuelDeltaLaps: player?.status && totalLaps ? player.status.fuelRemainingLaps - remainingFraction : undefined,
      lightsOn: state.startLights,
      lightsSlots: [1, 2, 3, 4, 5].map((n) => state.startLights >= n),
    },
    liveDeltaMs: liveDelta(state),
    wings: {
      front: player?.damage && Math.max(player.damage.frontLeftWingDamage, player.damage.frontRightWingDamage),
      rear: player?.damage?.rearWingDamage,
    },
    playerBestMs: state.trace.bestMs || player?.bestLapMs || 0,
    bestSectorsMs,
    playerSectors: playerSectors(player, state.playerLastSectorsMs, bestSectorsMs),
    playerLaps: playerLaps(player, bestSectorsMs, fastestMs),
    speedTraps,
    fastestLap: state.fastestLap && { car: byIndex(state.fastestLap.carIndex), timeMs: state.fastestLap.timeMs },
    speedTrap: state.speedTrap && { car: byIndex(state.speedTrap.carIndex), speed: state.speedTrap.speed },
    flags: {
      safetyCar: session?.safetyCarStatus ?? 0,
      redFlag: state.redFlag,
      yellowSectors: yellowSectors(session, sectorStarts, trackLength),
      player: player?.status?.vehicleFiaFlags ?? 0,
    },
    pit: {
      idealLap: session?.pitStopWindowIdealLap ?? 0,
      latestLap: session?.pitStopWindowLatestLap ?? 0,
      rejoinPosition: session?.pitStopRejoinPosition ?? 0,
      limiter: player?.status?.pitLimiterStatus === 1,
      from: totalLaps && session?.pitStopWindowIdealLap ? (session.pitStopWindowIdealLap - 1) / totalLaps : 0,
      to: totalLaps && session?.pitStopWindowLatestLap ? Math.min(1, session.pitStopWindowLatestLap / totalLaps) : 0,
    },
    forecast: session ? session.weatherForecastSamples.slice(0, session.numWeatherForecastSamples) : [],
    weatherNext: weatherNext(session),
    events: state.events.map((record) => {
      const details = record.event.details as { vehicleIdx?: number; otherVehicleIdx?: number };
      const pair = record.event.code === 'OVTK' ? record.event.details : undefined;
      const crash = record.event.code === 'COLL' ? record.event.details : undefined;
      return {
        ...record,
        car: byIndex(pair?.overtakingVehicleIdx ?? crash?.vehicle1Idx ?? details.vehicleIdx),
        other: byIndex(pair?.beingOvertakenVehicleIdx ?? crash?.vehicle2Idx ?? details.otherVehicleIdx),
      };
    }),
    lapPositions: state.lapPositions,
    trackLength,
    sectorStarts,
    track: state.track,
    reference: referenceFor(session?.trackId),
    bestLapMs,
  };
}
