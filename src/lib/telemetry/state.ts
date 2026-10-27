import type { Packet, PacketData, PacketKind, RaceEvent, SessionHistory, UdpFormat } from '../f1/schema.ts';
import { createOutline, learnOutline, type TrackOutline } from './track.ts';

// Stato gara: ultimo pacchetto di ogni tipo + analisi che il gioco non mostra
// (delta live sul giro migliore, distacchi giro per giro). Mutato in place per non allocare a 60 Hz.
export interface EventRecord {
  id: number;
  time: number;
  lap: number;
  event: RaceEvent;
}

const TRACE_STEP = 10; // metri tra due campioni del giro di riferimento
const TRACE_SLOTS = 1000; // fino a 10 km di pista
const MAX_EVENTS = 60;
const QUIET_EVENTS = new Set(['BUTN', 'STLG']);

export interface RaceState {
  version: number;
  format?: UdpFormat;
  sessionUID?: bigint;
  playerIndex: number;
  sessionTime: number;
  session?: PacketData<'session'>;
  motion?: PacketData<'motion'>;
  lapData?: PacketData<'lapData'>;
  participants?: PacketData<'participants'>;
  setups?: PacketData<'carSetups'>;
  telemetry?: PacketData<'carTelemetry'>;
  status?: PacketData<'carStatus'>;
  damage?: PacketData<'carDamage'>;
  motionEx?: PacketData<'motionEx'>;
  telemetry2?: PacketData<'carTelemetry2'>;
  timeTrial?: PacketData<'timeTrial'>;
  classification?: PacketData<'finalClassification'>;
  histories: (SessionHistory | undefined)[];
  tyreSets: (PacketData<'tyreSets'> | undefined)[];
  lapPositions: number[][];
  events: EventRecord[];
  startLights: number;
  fastestLap?: { carIndex: number; timeMs: number };
  speedTrap?: { carIndex: number; speed: number };
  redFlag: boolean;
  // Distacco dal leader all'inizio di ogni giro, per auto: base per trend e "ti raggiunge in N giri"
  gapLog: number[][];
  lastLapNum: number[];
  trace: { current: Float32Array; best?: Float32Array; bestMs: number; invalid: boolean };
  track?: TrackOutline;
  counts: Partial<Record<PacketKind, number>>;
}

const emptyTrace = () => new Float32Array(TRACE_SLOTS).fill(Number.NaN);

export function createRaceState(): RaceState {
  return {
    version: 0,
    playerIndex: 0,
    sessionTime: 0,
    histories: [],
    tyreSets: [],
    lapPositions: [],
    events: [],
    startLights: 0,
    redFlag: false,
    gapLog: [],
    lastLapNum: [],
    trace: { current: emptyTrace(), bestMs: 0, invalid: false },
    counts: {},
  };
}

export const msOf = (minutes: number, ms: number) => minutes * 60_000 + ms;

// Nuova sessione: via i dati della precedente, restano contatori e tracciato appreso (stessa pista)
function resetSession(state: RaceState) {
  const fresh = createRaceState();
  const record = state as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!(key in fresh) && key !== 'track') delete record[key];
  Object.assign(state, fresh, { counts: state.counts, version: state.version });
}

let eventId = 0;

function recordEvent(state: RaceState, event: RaceEvent) {
  switch (event.code) {
    case 'FTLP':
      state.fastestLap = { carIndex: event.details.vehicleIdx, timeMs: Math.round(event.details.lapTime * 1000) };
      break;
    case 'SPTP':
      state.speedTrap = {
        carIndex: event.details.fastestVehicleIdxInSession,
        speed: event.details.fastestSpeedInSession,
      };
      break;
    case 'STLG':
      state.startLights = event.details.numLights;
      break;
    case 'LGOT':
    case 'SSTA':
      state.startLights = 0;
      state.redFlag = false;
      break;
    case 'RDFL':
      state.redFlag = true;
      break;
    case 'SCAR':
      if (event.details.eventType === 3) state.redFlag = false;
      break;
  }
  if (QUIET_EVENTS.has(event.code)) return;
  const lap = state.lapData?.lapData[state.playerIndex]?.currentLapNum ?? 0;
  state.events.unshift({ id: ++eventId, time: state.sessionTime, lap, event });
  if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
}

// Delta live: tempo sul giro corrente contro il miglior giro valido, campionato ogni TRACE_STEP metri
function trackPlayerLap(state: RaceState, data: PacketData<'lapData'>) {
  const lap = data.lapData[state.playerIndex];
  if (!lap) return;
  const { trace } = state;
  const previous = state.lastLapNum[state.playerIndex];
  if (previous !== undefined && lap.currentLapNum === previous + 1) {
    const completed = lap.lastLapTimeInMS;
    if (!trace.invalid && completed > 0 && (trace.bestMs === 0 || completed < trace.bestMs)) {
      trace.best = trace.current;
      trace.bestMs = completed;
      trace.current = emptyTrace();
    } else {
      trace.current.fill(Number.NaN);
    }
    trace.invalid = false;
  }
  // Riferimento solo da giri lanciati: esclusi partenza da fermo, giri con sosta e out-lap
  if (lap.currentLapInvalid || lap.currentLapNum <= 1 || lap.pitStatus > 0 || lap.driverStatus === 3)
    trace.invalid = true;
  const slot = Math.floor(lap.lapDistance / TRACE_STEP);
  if (slot >= 0 && slot < TRACE_SLOTS) trace.current[slot] = lap.currentLapTimeInMS;
}

function logGaps(state: RaceState, data: PacketData<'lapData'>) {
  data.lapData.forEach((lap, index) => {
    if (lap.resultStatus < 2) return;
    if (state.lastLapNum[index] !== lap.currentLapNum) {
      (state.gapLog[index] ??= [])[lap.currentLapNum] = msOf(
        lap.deltaToRaceLeaderMinutesPart,
        lap.deltaToRaceLeaderMSPart,
      );
    }
    state.lastLapNum[index] = lap.currentLapNum;
  });
}

function learnTrack(state: RaceState, motion: PacketData<'motion'>) {
  const { session, lapData } = state;
  if (!session?.trackLength || !lapData) return;
  const key = `${state.format}:${session.trackId}:${session.trackLength}`;
  if (state.track?.key !== key) state.track = createOutline(key, session.trackLength);
  learnOutline(state.track, motion, lapData, state.telemetry);
}

export function liveDelta(state: RaceState): number | undefined {
  const lap = state.lapData?.lapData[state.playerIndex];
  const best = state.trace.best;
  if (!lap || !best) return undefined;
  const reference = best[Math.floor(lap.lapDistance / TRACE_STEP)];
  return reference === undefined || Number.isNaN(reference) ? undefined : lap.currentLapTimeInMS - reference;
}

export function applyPacket(state: RaceState, packet: Packet, format: UdpFormat) {
  const { header } = packet.data;
  if (header.sessionUID !== 0n && header.sessionUID !== state.sessionUID) {
    if (state.sessionUID !== undefined) resetSession(state);
    state.sessionUID = header.sessionUID;
  }
  state.format = format;
  state.playerIndex = header.playerCarIndex;
  state.sessionTime = header.sessionTime;
  state.counts[packet.kind] = (state.counts[packet.kind] ?? 0) + 1;
  state.version++;

  switch (packet.kind) {
    case 'motion':
      state.motion = packet.data;
      learnTrack(state, packet.data);
      break;
    case 'session':
      state.session = packet.data;
      break;
    case 'lapData':
      trackPlayerLap(state, packet.data);
      logGaps(state, packet.data);
      state.lapData = packet.data;
      break;
    case 'event':
      recordEvent(state, packet.data.event);
      break;
    case 'participants':
      state.participants = packet.data;
      break;
    case 'carSetups':
      state.setups = packet.data;
      break;
    case 'carTelemetry':
      state.telemetry = packet.data;
      break;
    case 'carStatus':
      state.status = packet.data;
      break;
    case 'finalClassification':
      state.classification = packet.data;
      break;
    case 'carDamage':
      state.damage = packet.data;
      break;
    case 'sessionHistory':
      state.histories[packet.data.carIdx] = packet.data;
      break;
    case 'tyreSets':
      state.tyreSets[packet.data.carIdx] = packet.data;
      break;
    case 'motionEx':
      state.motionEx = packet.data;
      break;
    case 'timeTrial':
      state.timeTrial = packet.data;
      break;
    case 'lapPositions': {
      const { numLaps, lapStart, positionForVehicleIdx } = packet.data;
      for (let i = 0; i < numLaps; i++) state.lapPositions[lapStart + i] = positionForVehicleIdx[i] ?? [];
      break;
    }
    case 'carTelemetry2':
      state.telemetry2 = packet.data;
      break;
    case 'lobbyInfo':
      break;
  }
}
