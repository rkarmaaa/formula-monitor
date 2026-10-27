import { schemas } from '../f1/codec.ts';
import { blank } from '../f1/struct.ts';
import type { Packet, PacketHeader, RaceEvent, UdpFormat } from '../f1/schema.ts';
import { demoGrid, demoGrid2026Extra, demoPlayerDriverId, demoTrack, type DemoDriver } from '../../data/demo.ts';
import { buildTrack, sampleAt, type Track } from './track.ts';

// Gara simulata che emette pacchetti F1 reali con le frequenze del gioco: serve alla modalità DEV
// (nel browser, senza bridge) e al mock UDP (`npm run mock`) per provare tutta la catena.
export type SimCommand = 'safety-car' | 'penalty' | 'pit' | 'retire' | 'restart';

export type SimSession = 'race' | 'qualifying';

export interface SimOptions {
  format: UdpFormat;
  session?: SimSession;
  laps?: number;
  rate?: number;
  seed?: number;
}

export interface Simulator {
  readonly format: UdpFormat;
  step(dt: number): Packet[];
  command(command: SimCommand): void;
}

type Compound = 16 | 17 | 18;
type PitPhase = 'none' | 'entry' | 'stop' | 'exit';

const PHYSICS_DT = 1 / 60;
const ERS_MAX = 4_000_000;
const FUEL_CAPACITY = 110;
const FUEL_PER_LAP = 1.72;
const FUEL_MARGIN_LAPS = 1.2;
const ERS_DEPLOY_CAP = 2_100_000;
const OVERTAKE_DEBOUNCE = 6;
const FOLLOW_GAP = 14; // metri minimi dietro all'auto che precede
const PIT_LIMIT = 80 / 3.6;
const PIT_STOP_S = 2.4;
const PIT_ENTRY = 280;
const PIT_EXIT = 340;
const CHECKPOINT = 25;
const VSC_DURATION = 48;
const RESTART_DELAY = 15;
const QUALI_DURATION = 18 * 60; // Q1 da 18 minuti
const QUALI_SPACING = 220; // metri tra un'auto e l'altra all'uscita dai box
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const COMPOUNDS: Record<Compound, { actual: number; wear: number; pace: number; heat: number }> = {
  16: { actual: 17, wear: 3.1, pace: 1.006, heat: 5 },
  17: { actual: 18, wear: 2.1, pace: 1, heat: 0 },
  18: { actual: 19, wear: 1.4, pace: 0.994, heat: -5 },
};
const WHEEL_WEAR = [0.96, 0.92, 1.08, 1.02];
const STRATEGIES: [Compound, Compound][] = [
  [17, 18],
  [16, 18],
  [18, 17],
];

interface LapRecord {
  time: number;
  sectors: number[];
  valid: boolean;
}

interface SimCar {
  index: number;
  driver: DemoDriver;
  teamId: number;
  pace: number;
  grid: number;
  position: number;
  distance: number;
  speed: number;
  accel: number;
  lap: number;
  lapStart: number;
  sector: number;
  sectorMarks: number[];
  laps: LapRecord[];
  lapInvalid: boolean;
  compound: Compound;
  nextCompound: Compound;
  tyreAge: number;
  stints: { endLap: number; visual: Compound }[];
  wear: number[];
  fuel: number;
  ers: number;
  ersDeployed: number;
  ersHarvestK: number;
  ersHarvestH: number;
  ersMode: number;
  pitLap: number;
  pit: PitPhase;
  pitTimer: number;
  pitLaneTime: number;
  pitStops: number;
  lastStopMs: number;
  penalties: number;
  warnings: number;
  cornerWarnings: number;
  numPenalties: number;
  checkpoints: Float64Array;
  checkpoint: number;
  status: number;
  finishOrder: number;
  finishTime: number;
  brakes: number[];
  surface: number[];
  inner: number[];
  engine: number;
  throttle: number;
  brake: number;
  steer: number;
  drsAllowed: boolean;
  drsOpen: boolean;
  wing: [number, number];
  wearPu: number;
  speedTrap: number;
  speedTrapLap: number;
  retireLap: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const split = (ms: number) => ({ minutes: Math.floor(ms / 60_000), ms: Math.round(ms % 60_000) });
const gearTops = [24, 34, 44, 54, 63, 72, 81, 93];

export function createSimulator(options: SimOptions): Simulator {
  const { format } = options;
  const rate = options.rate ?? 30;
  // Qualifica: giri lanciati a ripetizione fino allo scadere del tempo, classifica sul giro migliore
  const quali = options.session === 'qualifying';
  const totalLaps = quali ? 99 : (options.laps ?? 18);
  const { codecs, maxCars } = schemas[format];
  const track: Track = buildTrack(demoTrack.control, demoTrack.length);
  const L = track.length;
  const is2026 = format === 2026;

  let random = mulberry32(options.seed ?? 2025);
  let cars: SimCar[] = [];
  let player: SimCar;
  let t = 0;
  let accumulator = 0;
  let frame = 0;
  let sessionUID = 0n;
  let phase: 'grid' | 'race' | 'finished' = 'grid';
  let lightsOutAt = 0;
  let lights = 0;
  let raceStart = 0;
  let finishedAt = 0;
  let finishers = 0;
  let checkered = false;
  let vscLap = 0;
  let vscUntil = 0;
  let vscEnding = false;
  let drsEnabled = false;
  let fastest = { car: -1, ms: Infinity };
  let topSpeed = 0;
  let lapPositions: number[][] = [];
  let leaderLap = 0;
  let collided = false;
  let overtakes = new Map<string, number>();
  let historyCursor = 0;
  let out: Packet[] = [];
  const next = { rate: 0, session: 0, setups: 0, damage: 0, participants: 0, history: 0, positions: 0 };

  function setup() {
    random = mulberry32((options.seed ?? 2025) + Number(sessionUID & 0xffffn));
    sessionUID = BigInt(Math.floor(random() * 2 ** 48)) + 1n;
    const drivers = is2026 ? [...demoGrid, ...demoGrid2026Extra] : demoGrid;
    const order = drivers.map((_, i) => i).sort(() => random() - 0.5);
    const checkpointSlots = Math.ceil(((totalLaps + 1) * L) / CHECKPOINT) + 8;
    cars = drivers.map((driver, index) => {
      const grid = order.indexOf(index) + 1;
      const [first, second] = STRATEGIES[Math.floor(random() * STRATEGIES.length)]!;
      return {
        index,
        driver,
        teamId: is2026 ? driver.team2026 : driver.team2025,
        pace: driver.skill - grid * 0.0002 + (random() - 0.5) * 0.004,
        grid,
        position: grid,
        distance: -24 - (grid - 1) * 8,
        speed: 0,
        accel: 0,
        lap: 1,
        lapStart: 0,
        sector: 0,
        sectorMarks: [0, 0],
        laps: [],
        lapInvalid: false,
        compound: first,
        nextCompound: second,
        tyreAge: grid <= 10 ? 2 : 0,
        stints: [],
        wear: [0, 0, 0, 0].map(() => (grid <= 10 ? 4 : 0) + random() * 1.5),
        fuel: FUEL_PER_LAP * (totalLaps + FUEL_MARGIN_LAPS + (random() - 0.5) * 0.8),
        ers: ERS_MAX * (0.85 + random() * 0.15),
        ersDeployed: 0,
        ersHarvestK: 0,
        ersHarvestH: 0,
        ersMode: 1,
        pitLap: Math.round(totalLaps * (0.38 + random() * 0.24)),
        pit: 'none',
        pitTimer: 0,
        pitLaneTime: 0,
        pitStops: 0,
        lastStopMs: 0,
        penalties: 0,
        warnings: 0,
        cornerWarnings: 0,
        numPenalties: 0,
        checkpoints: new Float64Array(checkpointSlots),
        checkpoint: -1,
        status: 2,
        finishOrder: 0,
        finishTime: 0,
        brakes: [420, 420, 450, 450],
        surface: [78, 78, 80, 80],
        inner: [88, 88, 90, 90],
        engine: 96,
        throttle: 0,
        brake: 0,
        steer: 0,
        drsAllowed: false,
        drsOpen: false,
        wing: [0, 0],
        wearPu: 8 + random() * 14,
        speedTrap: 0,
        speedTrapLap: 255,
        retireLap: 0,
      } satisfies SimCar;
    });
    player = cars.find((car) => car.driver.driverId === demoPlayerDriverId) ?? cars[0]!;
    // Il giocatore parte a centro gruppo: più battaglie da mostrare
    const swap = cars.find((car) => car.grid === 7)!;
    [swap.grid, player.grid] = [player.grid, swap.grid];
    for (const car of [swap, player]) {
      car.position = car.grid;
      car.distance = -24 - (car.grid - 1) * 8;
    }
    player.pitLap = Math.round(totalLaps * 0.45);
    const unlucky = cars.filter((car) => car !== player)[Math.floor(random() * (cars.length - 1))]!;
    unlucky.retireLap = Math.round(totalLaps * (0.3 + random() * 0.4));
    if (quali) {
      // In fila all'uscita dai box, primo giro di lancio non valido, niente soste né ritiri
      [...cars]
        .sort((a, b) => a.grid - b.grid)
        .forEach((car, i) => {
          car.distance = -60 - i * QUALI_SPACING;
          car.lapInvalid = true;
          car.pitLap = 0;
          car.retireLap = 0;
          car.tyreAge = 0;
          car.compound = 16;
        });
    }

    t = 0;
    frame = 0;
    phase = 'grid';
    lights = 0;
    lightsOutAt = 6 + 0.4 + random() * 1.4;
    raceStart = 0;
    finishedAt = 0;
    finishers = 0;
    checkered = false;
    vscLap = quali ? 0 : Math.round(totalLaps * (0.4 + random() * 0.25));
    vscUntil = 0;
    vscEnding = false;
    drsEnabled = false;
    fastest = { car: -1, ms: Infinity };
    topSpeed = 0;
    lapPositions = [];
    leaderLap = 0;
    collided = quali;
    overtakes = new Map();
    if (quali) phase = 'race';
    Object.keys(next).forEach((key) => (next[key as keyof typeof next] = 0));
    emitEvent({ code: 'SSTA', details: {} });
  }

  const header = (): PacketHeader => ({
    packetFormat: format,
    gameYear: 25,
    gameMajorVersion: 1,
    gameMinorVersion: is2026 ? 20 : 12,
    packetVersion: 1,
    packetId: 0,
    sessionUID,
    sessionTime: t,
    frameIdentifier: frame,
    overallFrameIdentifier: frame,
    playerCarIndex: player.index,
    secondaryPlayerCarIndex: 255,
  });

  function emitEvent(event: RaceEvent) {
    const data = blank(codecs.event);
    data.header = header();
    data.event = event;
    out.push({ kind: 'event', data });
  }

  const lapDistance = (car: SimCar) => (car.distance < 0 ? car.distance : car.distance % L);
  const vscActive = () => vscUntil > t;

  // ——— Fisica di un'auto per un passo ———
  function drive(car: SimCar, ahead: SimCar | undefined, dt: number) {
    if (car.status === 7) {
      car.speed = Math.max(0, car.speed - 30 * dt);
      car.throttle = 0;
      car.brake = car.speed > 0 ? 1 : 0;
      return;
    }
    // Dopo la bandiera a scacchi: giro di rientro lento, senza cronometro
    const cooling = car.status === 3;
    const i = sampleAt(track, car.distance);
    const d = lapDistance(car);
    const curvature = track.curvature[i]!;
    const spec = COMPOUNDS[car.compound];
    const avgWear = car.wear.reduce((a, b) => a + b, 0) / 4;
    const interval = ahead ? intervalMs(car, ahead) : Infinity;
    const inZone = track.drsZones.some(([a, b]) => d >= a && d <= b);
    car.drsOpen = car.drsAllowed && inZone && car.throttle > 0.9 && car.pit === 'none';

    let target =
      track.speed[i]! *
      car.pace *
      spec.pace *
      (1 - avgWear * 0.00042) *
      (1 - car.fuel * 0.00022) *
      (1 + 0.0015 * Math.sin(t * 0.05 + car.index * 1.7));
    // Aria sporca in curva, scia e DRS in rettilineo: i sorpassi avvengono dove devono
    if (car.drsOpen) target *= 1.04;
    else if (interval < 600 && Math.abs(curvature) < 0.002) target *= 1.01;
    else if (interval < 900 && Math.abs(curvature) > 0.004) target *= 0.985;
    if (vscActive()) target = Math.min(target, track.speed[i]! * 0.6);
    if (car.pit !== 'none') target = Math.min(target, PIT_LIMIT);
    if (car.pit === 'stop') target = 0;
    if (phase === 'grid') target = 0;
    if (cooling) target *= 0.45;

    // Niente sorpassi "attraverso": chi è in scia può passare solo in rettilineo e con un vantaggio
    const room = ahead && ahead.status === 2 ? ahead.distance - car.distance : Infinity;
    const canPass = car.drsOpen || (Math.abs(curvature) < 0.002 && target > (ahead?.speed ?? 0) * 1.025);
    if (room > 0 && room < FOLLOW_GAP && !canPass) target = Math.min(target, ahead!.speed * (room / FOLLOW_GAP));

    const previous = car.speed;
    const maxAccel = Math.max(3, 17 - 0.15 * car.speed) * 1.08;
    car.speed =
      target > car.speed ? Math.min(target, car.speed + maxAccel * dt) : Math.max(target, car.speed - 46 * dt);
    car.accel = (car.speed - previous) / dt;
    const atLimit = car.speed >= target - 0.3;
    car.throttle =
      car.accel > 0.4 ? clamp(0.82 + car.accel / 40) : atLimit ? (Math.abs(curvature) < 0.002 ? 1 : 0.58) : 0;
    car.brake = car.accel < -3 ? clamp(-car.accel / 44) : 0;
    car.steer = clamp(-curvature * 48, -1, 1);

    const moved = car.speed * dt;
    const before = car.distance;
    car.distance += moved;
    if (car.distance > 0 && !cooling) progress(car, before, moved, curvature, dt);
    thermal(car, curvature, spec.heat, dt);
  }

  function crossingTime(car: SimCar, overshoot: number) {
    return t - (car.speed > 0 ? overshoot / car.speed : 0);
  }

  function progress(car: SimCar, before: number, moved: number, curvature: number, dt: number) {
    const spec = COMPOUNDS[car.compound];
    const wearStep = (spec.wear * moved) / L;
    car.wear = car.wear.map((w, k) => Math.min(100, w + wearStep * WHEEL_WEAR[k]! * (1 + Math.abs(curvature) * 30)));
    car.fuel = Math.max(0, car.fuel - (FUEL_PER_LAP * moved * (car.lap === 1 ? 1.08 : vscActive() ? 0.8 : 1)) / L);

    // ERS: recupero in frenata e sul turbo, rilascio in rettilineo con un tetto per giro
    car.ersHarvestK += car.brake * 120_000 * dt;
    car.ersHarvestH += car.throttle * 25_000 * dt;
    car.ersMode = car.drsOpen && car.ers > ERS_MAX * 0.3 ? 3 : 1;
    const canDeploy =
      car.throttle > 0.95 && car.speed > 55 && car.ersDeployed < ERS_DEPLOY_CAP && car.ers > ERS_MAX * 0.15;
    const deploy = canDeploy ? (car.ersMode === 3 ? 160_000 : 110_000) : 0;
    car.ersDeployed += deploy * dt;
    car.ers = clamp(car.ers + (car.brake * 120_000 + car.throttle * 25_000 - deploy) * dt, 0, ERS_MAX);

    while (car.checkpoint < Math.floor(car.distance / CHECKPOINT)) {
      car.checkpoint++;
      car.checkpoints[car.checkpoint] = crossingTime(car, car.distance - car.checkpoint * CHECKPOINT);
    }

    const d = car.distance % L;
    const prevD = before < 0 ? -1 : before % L;
    const s2 = L / 3;
    const s3 = (2 * L) / 3;
    if (prevD < s2 && d >= s2) car.sectorMarks[0] = crossingTime(car, d - s2) - car.lapStart;
    if (prevD < s3 && d >= s3) car.sectorMarks[1] = crossingTime(car, d - s3) - car.lapStart;
    car.sector = d >= s3 ? 2 : d >= s2 ? 1 : 0;
    if (prevD < track.speedTrap && d >= track.speedTrap) speedTrap(car);
    const detection = track.drsZones.find(([a]) => prevD < a - 150 && d >= a - 150);
    if (detection) {
      const ahead = cars.find((other) => other.position === car.position - 1);
      car.drsAllowed = drsEnabled && !vscActive() && !!ahead && intervalMs(car, ahead) < 1000;
    }
    if (pitLogic(car, d, dt)) return;
    if (Math.floor(car.distance / L) + 1 > car.lap) completeLap(car, d);
  }

  function pitLogic(car: SimCar, d: number, dt: number) {
    if (car.pit !== 'none') car.pitLaneTime += dt;
    if (car.pit === 'none' && car.lap === car.pitLap && d > L - PIT_ENTRY && !checkered) {
      car.pit = 'entry';
      car.pitLaneTime = 0;
      if (car.teamId === player.teamId && car !== player)
        emitEvent({ code: 'TMPT', details: { vehicleIdx: car.index } });
    } else if (car.pit === 'entry' && car.lap > car.pitLap && d >= 18 && d < L / 2) {
      car.pit = 'stop';
      car.pitTimer = 0;
    } else if (car.pit === 'stop') {
      car.pitTimer += dt;
      if (car.pitTimer >= PIT_STOP_S + car.wing[0] / 20) {
        car.stints.push({ endLap: car.lap - 1, visual: car.compound });
        car.compound = car.nextCompound;
        car.tyreAge = 0;
        car.wear = [0, 0, 0, 0];
        car.wing = [0, 0];
        car.pitStops++;
        car.lastStopMs = Math.round(car.pitTimer * 1000);
        car.pit = 'exit';
      }
      return true;
    } else if (car.pit === 'exit' && d > PIT_EXIT && d < L / 2) {
      car.pit = 'none';
    }
    return false;
  }

  function completeLap(car: SimCar, d: number) {
    const crossed = crossingTime(car, d);
    const time = Math.round((crossed - car.lapStart) * 1000);
    const s1 = Math.round(car.sectorMarks[0]! * 1000);
    const s2 = Math.round(car.sectorMarks[1]! * 1000) - s1;
    car.laps.push({ time, sectors: [s1, s2, time - s1 - s2], valid: !car.lapInvalid });
    car.lap++;
    car.lapStart = crossed;
    car.lapInvalid = false;
    car.tyreAge++;
    car.ersDeployed = 0;
    car.ersHarvestK = 0;
    car.ersHarvestH = 0;
    car.wearPu += 0.35;

    if (time < fastest.ms && car.lap > 2 && car.laps.at(-1)!.valid) {
      fastest = { car: car.index, ms: time };
      emitEvent({ code: 'FTLP', details: { vehicleIdx: car.index, lapTime: time / 1000 } });
    }
    if (car.position === 1 && car.lap > leaderLap) {
      leaderLap = car.lap;
      onLeaderLap(car);
    }
    if (car.lap > 2 && car.lap <= totalLaps) incidents(car);
    if (car.retireLap && car.lap === car.retireLap) retire(car);
    if (checkered || car.lap > totalLaps) finish(car);
  }

  function incidents(car: SimCar) {
    const roll = random();
    if (roll < 0.025) {
      car.cornerWarnings++;
      car.warnings++;
      emitEvent({
        code: 'PENA',
        details: {
          penaltyType: 5,
          infringementType: 7,
          vehicleIdx: car.index,
          otherVehicleIdx: 255,
          time: 0,
          lapNum: car.lap,
          placesGained: 0,
        },
      });
      if (car.cornerWarnings % 3 === 0) penalise(car, 7);
    } else if (roll < 0.06) {
      car.lapInvalid = true;
      emitEvent({
        code: 'PENA',
        details: {
          penaltyType: 10,
          infringementType: 26,
          vehicleIdx: car.index,
          otherVehicleIdx: 255,
          time: 0,
          lapNum: car.lap,
          placesGained: 0,
        },
      });
    }
  }

  function penalise(car: SimCar, infringementType: number) {
    car.penalties += 5;
    car.numPenalties++;
    emitEvent({
      code: 'PENA',
      details: {
        penaltyType: 4,
        infringementType,
        vehicleIdx: car.index,
        otherVehicleIdx: 255,
        time: 5,
        lapNum: car.lap,
        placesGained: 0,
      },
    });
  }

  function onLeaderLap(leader: SimCar) {
    lapPositions[leader.lap - 1] = Array.from({ length: maxCars }, (_, i) => cars[i]?.position ?? 0);
    if (leader.lap === 3 && !drsEnabled) {
      drsEnabled = true;
      emitEvent({ code: 'DRSE', details: {} });
    }
    if (leader.lap === vscLap) deployVsc();
    if (leader.lap > totalLaps && !checkered) {
      checkered = true;
      emitEvent({ code: 'CHQF', details: {} });
      emitEvent({ code: 'RCWN', details: { vehicleIdx: leader.index } });
    }
  }

  function deployVsc() {
    if (vscActive() || phase !== 'race') return;
    vscUntil = t + VSC_DURATION;
    vscEnding = false;
    emitEvent({ code: 'SCAR', details: { safetyCarType: 2, eventType: 0 } });
    if (drsEnabled) emitEvent({ code: 'DRSD', details: { reason: 1 } });
  }

  function retire(car: SimCar) {
    if (car.status !== 2) return;
    car.status = 7;
    emitEvent({ code: 'RTMT', details: { vehicleIdx: car.index, reason: 8 } });
  }

  function finish(car: SimCar) {
    if (car.status !== 2) return;
    car.status = 3;
    car.finishOrder = ++finishers;
    car.finishTime = t - raceStart;
    if (cars.every((other) => other.status !== 2)) {
      phase = 'finished';
      finishedAt = t;
      emitEvent({ code: 'SEND', details: {} });
      out.push(classification());
      cars.forEach((other) => out.push(history(other)));
    }
  }

  function speedTrap(car: SimCar) {
    const kmh = car.speed * 3.6;
    if (kmh <= car.speedTrap) return;
    car.speedTrap = kmh;
    car.speedTrapLap = car.lap;
    if (kmh > topSpeed) {
      topSpeed = kmh;
      emitEvent({
        code: 'SPTP',
        details: {
          vehicleIdx: car.index,
          speed: kmh,
          isOverallFastestInSession: 1,
          isDriverFastestInSession: 1,
          fastestVehicleIdxInSession: car.index,
          fastestSpeedInSession: kmh,
        },
      });
    }
  }

  function thermal(car: SimCar, curvature: number, heat: number, dt: number) {
    const lateral = car.speed * car.speed * Math.abs(curvature);
    for (let w = 0; w < 4; w++) {
      const front = w >= 2 ? 1 : 0;
      const brakeTarget = 380 + 640 * car.brake + front * 80;
      car.brakes[w]! += (brakeTarget - car.brakes[w]!) * (brakeTarget > car.brakes[w]! ? 3.2 : 0.45) * dt;
      const surfaceTarget = 80 + lateral * 0.5 + car.brake * 14 + heat + front * 3 + car.wear[w]! * 0.08;
      car.surface[w]! += (surfaceTarget - car.surface[w]!) * 1.4 * dt;
      const innerTarget = 90 + (car.surface[w]! - 88) * 0.35 + car.wear[w]! * 0.12;
      car.inner[w]! += (innerTarget - car.inner[w]!) * 0.12 * dt;
    }
    car.engine += (98 + car.throttle * 16 - car.engine) * 0.18 * dt;
  }

  // Distacco cronometrico allo stesso punto della pista; a gara finita conta il traguardo
  function intervalMs(car: SimCar, ahead: SimCar): number {
    if (car.finishOrder && ahead.finishOrder) return Math.round((car.finishTime - ahead.finishTime) * 1000);
    const k = Math.min(car.checkpoint, ahead.checkpoint);
    if (k < 0) return 0;
    return Math.max(0, Math.round((car.checkpoints[k]! - ahead.checkpoints[k]!) * 1000));
  }

  const bestLap = (car: SimCar) =>
    car.laps.reduce((best, lap) => (lap.valid && lap.time < best ? lap.time : best), Infinity);

  function rank() {
    const previous = cars.map((car) => car.position);
    if (quali) {
      const order = [...cars].sort((a, b) => bestLap(a) - bestLap(b) || a.grid - b.grid);
      order.forEach((car, i) => (car.position = i + 1));
      return;
    }
    const sorted = [...cars].sort((a, b) => {
      if (a.status === 7 || b.status === 7)
        return (a.status === 7 ? 1 : 0) - (b.status === 7 ? 1 : 0) || b.distance - a.distance;
      const finished = (a.finishOrder || 99) - (b.finishOrder || 99);
      return finished || b.distance - a.distance;
    });
    sorted.forEach((car, i) => (car.position = i + 1));
    if (phase !== 'race') return;
    for (const car of sorted) {
      const was = previous[car.index]!;
      if (car.position >= was || car.status !== 2 || car.pit !== 'none') continue;
      const passed = sorted[car.position];
      const pair = `${Math.min(car.index, passed?.index ?? 0)}-${Math.max(car.index, passed?.index ?? 0)}`;
      if (!passed || previous[passed.index] !== car.position || passed.pit !== 'none' || passed.status !== 2) continue;
      if (t - (overtakes.get(pair) ?? -Infinity) > OVERTAKE_DEBOUNCE) {
        overtakes.set(pair, t);
        emitEvent({
          code: 'OVTK',
          details: { overtakingVehicleIdx: car.index, beingOvertakenVehicleIdx: passed.index },
        });
      }
    }
  }

  function race(dt: number) {
    if (phase === 'grid') {
      const due = Math.min(5, Math.floor(t - 1));
      while (lights < due) {
        lights++;
        emitEvent({ code: 'STLG', details: { numLights: lights } });
      }
      if (t >= lightsOutAt) {
        phase = 'race';
        raceStart = t;
        cars.forEach((car) => (car.lapStart = t));
        lapPositions[0] = Array.from({ length: maxCars }, (_, i) => cars[i]?.grid ?? 0);
        emitEvent({ code: 'LGOT', details: {} });
      }
    }
    if (quali && phase === 'race' && t >= QUALI_DURATION) {
      phase = 'finished';
      finishedAt = t;
      emitEvent({ code: 'CHQF', details: {} });
      emitEvent({ code: 'SEND', details: {} });
    }
    if (phase === 'finished' && t - finishedAt > RESTART_DELAY) {
      setup();
      return;
    }
    // In qualifica l'auto "davanti" è quella fisicamente davanti in pista, non in classifica
    const order = quali
      ? [...cars].sort((a, b) => b.distance - a.distance)
      : [...cars].sort((a, b) => a.position - b.position);
    order.forEach((car, i) => drive(car, order[i - 1], dt));
    rank();

    if (vscActive() && !vscEnding && vscUntil - t < 12) {
      vscEnding = true;
      emitEvent({ code: 'SCAR', details: { safetyCarType: 2, eventType: 1 } });
    }
    if (vscUntil && !vscActive()) {
      vscUntil = 0;
      emitEvent({ code: 'SCAR', details: { safetyCarType: 2, eventType: 3 } });
      if (drsEnabled) emitEvent({ code: 'DRSE', details: {} });
    }
    if (!collided && phase === 'race' && t - raceStart > 9) {
      collided = true;
      const [a, b] = [order[9], order[10]];
      if (a && b) {
        emitEvent({
          code: 'COLL',
          details: { vehicle1Idx: a.index, vehicle2Idx: b.index, severity: is2026 ? 1 : undefined },
        });
        b.wing = [12 + Math.round(random() * 10), 3];
      }
    }
  }

  // ——— Costruzione dei pacchetti ———
  function lapPacket() {
    const data = blank(codecs.lapData);
    data.header = header();
    const leader = cars.find((car) => car.position === 1)!;
    cars.forEach((car) => {
      const lap = data.lapData[car.index]!;
      const ahead = cars.find((other) => other.position === car.position - 1);
      const interval = split(ahead ? intervalMs(car, ahead) : 0);
      const toLeader = split(car === leader ? 0 : intervalMs(car, leader));
      const last = car.laps.at(-1);
      const current = phase === 'grid' ? 0 : Math.round((t - car.lapStart) * 1000);
      Object.assign(lap, {
        lastLapTimeInMS: last?.time ?? 0,
        currentLapTimeInMS: car.status === 2 ? current : 0,
        sector1TimeMSPart: car.sector > 0 ? Math.round(car.sectorMarks[0]! * 1000) % 60_000 : 0,
        sector1TimeMinutesPart: car.sector > 0 ? Math.floor(car.sectorMarks[0]! / 60) : 0,
        sector2TimeMSPart: car.sector > 1 ? Math.round((car.sectorMarks[1]! - car.sectorMarks[0]!) * 1000) % 60_000 : 0,
        sector2TimeMinutesPart: 0,
        deltaToCarInFrontMSPart: interval.ms,
        deltaToCarInFrontMinutesPart: interval.minutes,
        deltaToRaceLeaderMSPart: toLeader.ms,
        deltaToRaceLeaderMinutesPart: toLeader.minutes,
        lapDistance: car.distance < 0 ? car.distance : car.distance % L,
        totalDistance: car.distance,
        carPosition: car.position,
        currentLapNum: Math.min(car.lap, totalLaps),
        pitStatus: car.pit === 'none' ? 0 : car.pit === 'stop' ? 2 : 1,
        numPitStops: car.pitStops,
        sector: car.sector,
        currentLapInvalid: car.lapInvalid ? 1 : 0,
        penalties: car.penalties,
        totalWarnings: car.warnings,
        cornerCuttingWarnings: car.cornerWarnings,
        gridPosition: car.grid,
        driverStatus: car.pit !== 'none' ? 2 : phase === 'grid' ? 0 : 4,
        resultStatus: car.status,
        pitLaneTimerActive: car.pit !== 'none' ? 1 : 0,
        pitLaneTimeInLaneInMS: car.pit !== 'none' ? Math.round(car.pitLaneTime * 1000) : 0,
        pitStopTimerInMS: car.pit === 'stop' ? Math.round(car.pitTimer * 1000) : car.lastStopMs,
        speedTrapFastestSpeed: car.speedTrap,
        speedTrapFastestLap: car.speedTrapLap,
      });
    });
    data.timeTrialPBCarIdx = 255;
    data.timeTrialRivalCarIdx = 255;
    return data;
  }

  function telemetryPacket() {
    const data = blank(codecs.carTelemetry);
    data.header = header();
    cars.forEach((car) => {
      const g = gearTops.findIndex((top) => car.speed <= top);
      const gear = car.speed < 0.5 ? (phase === 'grid' ? 1 : 0) : g < 0 ? 8 : g + 1;
      const top = gearTops[Math.max(0, gear - 1)]!;
      const rpm = Math.round(clamp(car.speed / top, 0, 1) * 7600 + 4200);
      const revPct = Math.round(clamp((rpm - 9200) / 2600) * 100);
      Object.assign(data.carTelemetryData[car.index]!, {
        speed: Math.round(car.speed * 3.6),
        throttle: car.throttle,
        steer: car.steer,
        brake: car.brake,
        clutch: 0,
        gear,
        engineRPM: rpm,
        drs: car.drsOpen ? 1 : 0,
        revLightsPercent: revPct,
        revLightsBitValue: (1 << Math.round((revPct / 100) * 15)) - 1,
        brakesTemperature: car.brakes.map(Math.round),
        tyresSurfaceTemperature: car.surface.map(Math.round),
        tyresInnerTemperature: car.inner.map(Math.round),
        engineTemperature: Math.round(car.engine),
        tyresPressure: car.inner.map((inner, w) => (w >= 2 ? 22.6 : 20.8) + (inner - 90) * 0.045),
        surfaceType: [0, 0, 0, 0],
      });
    });
    data.mfdPanelIndex = 255;
    data.mfdPanelIndexSecondaryPlayer = 255;
    data.suggestedGear = 0;
    return data;
  }

  function statusPacket() {
    const data = blank(codecs.carStatus);
    data.header = header();
    cars.forEach((car) => {
      const d = lapDistance(car);
      const nextZone = track.drsZones.map(([a]) => a - d).filter((gap) => gap > 0 && gap < 600)[0];
      Object.assign(data.carStatusData[car.index]!, {
        tractionControl: 0,
        antiLockBrakes: 0,
        fuelMix: vscActive() ? 0 : car.lap === 1 ? 2 : 1,
        frontBrakeBias: 56,
        pitLimiterStatus: car.pit !== 'none' ? 1 : 0,
        fuelInTank: car.fuel,
        fuelCapacity: FUEL_CAPACITY,
        fuelRemainingLaps: car.fuel / FUEL_PER_LAP,
        maxRPM: 11_800,
        idleRPM: 4_000,
        maxGears: 8,
        drsAllowed: car.drsAllowed ? 1 : 0,
        drsActivationDistance: car.drsAllowed && nextZone ? Math.round(nextZone) : 0,
        actualTyreCompound: COMPOUNDS[car.compound].actual,
        visualTyreCompound: car.compound,
        tyresAgeLaps: car.tyreAge,
        vehicleFiaFlags: vscActive() ? 3 : 0,
        enginePowerICE: 560_000 * car.throttle,
        enginePowerMGUK: car.ersMode === 3 ? 120_000 : 0,
        ersStoreEnergy: car.ers,
        ersDeployMode: car.ersMode,
        ersHarvestedThisLapMGUK: car.ersHarvestK,
        ersHarvestedThisLapMGUH: car.ersHarvestH,
        ersHarvestLimitPerLap: is2026 ? 8_500_000 : undefined,
        ersDeployedThisLap: car.ersDeployed,
        networkPaused: 0,
      });
    });
    return data;
  }

  function damagePacket() {
    const data = blank(codecs.carDamage);
    data.header = header();
    cars.forEach((car) => {
      const pu = Math.round(car.wearPu);
      Object.assign(data.carDamageData[car.index]!, {
        tyresWear: [...car.wear],
        tyresDamage: car.wear.map((w) => Math.round(Math.max(0, w - 45) * 0.8)),
        brakesDamage: car.brakes.map(() => Math.round(car.lap * 0.4)),
        tyreBlisters: car.wear.map((w) => (car.compound === 16 ? Math.round(Math.max(0, w - 30) * 0.9) : 0)),
        frontLeftWingDamage: car.wing[0],
        frontRightWingDamage: car.wing[1],
        rearWingDamage: 0,
        floorDamage: car.wing[0] ? 4 : 0,
        diffuserDamage: 0,
        sidepodDamage: 0,
        gearBoxDamage: Math.round(pu * 0.7),
        engineDamage: Math.round(pu * 0.3),
        engineMGUHWear: pu + 3,
        engineESWear: pu - 2,
        engineCEWear: pu - 4,
        engineICEWear: pu,
        engineMGUKWear: pu + 1,
        engineTCWear: pu - 1,
      });
    });
    return data;
  }

  function motionPacket() {
    const data = blank(codecs.motion);
    data.header = header();
    cars.forEach((car) => {
      const i = sampleAt(track, car.distance);
      const j = (i + 1) % track.samples;
      const heading = Math.atan2(track.z[j]! - track.z[i]!, track.x[j]! - track.x[i]!);
      Object.assign(data.carMotionData[car.index]!, {
        worldPositionX: track.x[i]!,
        worldPositionY: 0,
        worldPositionZ: track.z[i]!,
        worldVelocityX: Math.cos(heading) * car.speed,
        worldVelocityZ: Math.sin(heading) * car.speed,
        worldForwardDirX: Math.round(Math.cos(heading) * 32767),
        worldForwardDirZ: Math.round(Math.sin(heading) * 32767),
        worldRightDirX: Math.round(-Math.sin(heading) * 32767),
        worldRightDirZ: Math.round(Math.cos(heading) * 32767),
        gForceLateral: (car.speed * car.speed * track.curvature[i]!) / 9.81,
        gForceLongitudinal: car.accel / 9.81,
        gForceVertical: 1,
        yaw: heading,
      });
    });
    return data;
  }

  function motionExPacket() {
    const data = blank(codecs.motionEx);
    data.header = header();
    const wheel = player.speed;
    data.wheelSpeed = [wheel, wheel, wheel * 1.002, wheel * 1.002];
    data.wheelSlipRatio = [0, 0, 0, 0].map(() => (player.throttle > 0.9 ? 0.02 : player.brake * 0.06));
    data.localVelocityZ = player.speed;
    data.frontWheelsAngle = player.steer * 0.3;
    data.heightOfCOGAboveGround = 0.28;
    data.frontAeroHeight = 0.03 + player.speed * 0.0001;
    data.rearAeroHeight = 0.07;
    return data;
  }

  function telemetry2Packet() {
    const codec = codecs.carTelemetry2;
    if (!codec) return undefined;
    const data = blank(codec);
    data.header = header();
    cars.forEach((car) => {
      const d = lapDistance(car);
      const curvature = track.curvature[sampleAt(track, car.distance)]!;
      const straight = Math.abs(curvature) < 0.0016 && car.speed > 45;
      const zone = track.drsZones.map(([a]) => a - d).filter((gap) => gap > 0 && gap < 600)[0];
      Object.assign(data.carTelemetry2Data[car.index]!, {
        activeAeroMode: straight && !vscActive() ? 1 : 0,
        activeAeroAvailable: vscActive() ? 0 : 1,
        activeAeroActivationDistance: straight ? 0 : 120,
        overtakeAvailable: car.drsAllowed ? 1 : 0,
        overtakeActive: car.drsOpen ? 1 : 0,
        overtakeActivationDistance: car.drsAllowed && zone ? Math.round(zone) : 0,
        regulations2026: 1,
        drivingWrongWay: 0,
      });
    });
    return data;
  }

  function sessionPacket() {
    const data = blank(codecs.session);
    data.header = header();
    const forecast = [
      [0, 1, 34, 25, 5],
      [5, 1, 34, 25, 8],
      [10, 2, 33, 24, 18],
      [15, 2, 32, 24, 34],
      [30, 3, 29, 22, 56],
      [45, 2, 30, 23, 38],
    ];
    const yellow = vscActive();
    Object.assign(data, {
      weather: 1,
      trackTemperature: 34,
      airTemperature: 25,
      totalLaps: quali ? 0 : totalLaps,
      trackLength: L,
      sessionType: quali ? 5 : 15,
      trackId: demoTrack.trackId,
      formula: is2026 ? 13 : 0,
      sessionTimeLeft: Math.max(0, Math.round((quali ? QUALI_DURATION : 7200) - t)),
      sessionDuration: quali ? QUALI_DURATION : 7200,
      pitSpeedLimit: 80,
      numMarshalZones: 18,
      safetyCarStatus: yellow ? 2 : 0,
      networkGame: 0,
      numWeatherForecastSamples: forecast.length,
      forecastAccuracy: 1,
      aiDifficulty: 92,
      pitStopWindowIdealLap: Math.max(1, player.pitLap - 1),
      pitStopWindowLatestLap: player.pitLap + 3,
      pitStopRejoinPosition: Math.min(cars.length, player.position + 4),
      gearboxAssist: 1,
      gameMode: 28,
      ruleSet: 1,
      timeOfDay: 14 * 60 + Math.floor(t / 60),
      sessionLength: 4,
      speedUnitsLeadPlayer: 1,
      temperatureUnitsLeadPlayer: 0,
      speedUnitsSecondaryPlayer: 1,
      numVirtualSafetyCarPeriods: vscLap && leaderLap >= vscLap ? 1 : 0,
      carDamage: 2,
      tyreTemperature: 1,
      sector2LapDistanceStart: L / 3,
      sector3LapDistanceStart: (2 * L) / 3,
      numSessionsInWeekend: 5,
    });
    data.marshalZones.forEach((zone, i) => {
      zone.zoneStart = i < 18 ? i / 18 : 0;
      zone.zoneFlag = i < 18 ? (yellow && i >= 9 && i <= 11 ? 3 : 0) : -1;
    });
    forecast.forEach(([offset, weather, trackTemp, air, rain], i) =>
      Object.assign(data.weatherForecastSamples[i]!, {
        sessionType: quali ? 5 : 15,
        timeOffset: offset,
        weather,
        trackTemperature: trackTemp,
        trackTemperatureChange: i === 0 ? 2 : 1,
        airTemperature: air,
        airTemperatureChange: i === 0 ? 2 : 1,
        rainPercentage: rain,
      }),
    );
    data.weekendStructure = [1, 2, 3, 5, 15, 0, 0, 0, 0, 0, 0, 0];
    if (is2026) {
      data.numDRSZones = track.drsZones.length;
      data.drsZones = [0, 1, 2, 3].map((i) => {
        const zone = track.drsZones[i];
        return { zoneStart: zone ? zone[0] / L : 0, zoneEnd: zone ? zone[1] / L : 0 };
      });
      data.numActiveAeroZonesFull = data.numDRSZones;
      data.activeAeroZonesFull = [...data.drsZones, ...data.drsZones];
      data.numActiveAeroZonesPartial = 0;
      data.activeAeroZonesPartial = data.activeAeroZonesFull.map(() => ({ zoneStart: 0, zoneEnd: 0 }));
      data.startReactionTime = 0.21;
    }
    return data;
  }

  function participantsPacket() {
    const data = blank(codecs.participants);
    data.header = header();
    data.numActiveCars = cars.length;
    cars.forEach((car) => {
      Object.assign(data.participants[car.index]!, {
        aiControlled: car === player ? 0 : 1,
        driverId: car.driver.driverId,
        networkId: 255,
        teamId: car.teamId,
        myTeam: 0,
        raceNumber: car.driver.number,
        nationality: car.driver.nationality,
        name: car.driver.name,
        yourTelemetry: 1,
        showOnlineNames: 1,
        platform: 255,
      });
    });
    return data;
  }

  function setupsPacket() {
    const data = blank(codecs.carSetups);
    data.header = header();
    cars.forEach((car) =>
      Object.assign(data.carSetups[car.index]!, {
        frontWing: 24,
        rearWing: 18,
        onThrottle: 65,
        offThrottle: 55,
        frontCamber: -3.2,
        rearCamber: -1.8,
        frontToe: 0.05,
        rearToe: 0.2,
        frontSuspension: 22,
        rearSuspension: 8,
        frontAntiRollBar: 14,
        rearAntiRollBar: 6,
        frontSuspensionHeight: 22,
        rearSuspensionHeight: 48,
        brakePressure: 100,
        brakeBias: 56,
        engineBraking: 50,
        rearLeftTyrePressure: 21.5,
        rearRightTyrePressure: 21.5,
        frontLeftTyrePressure: 24.4,
        frontRightTyrePressure: 24.4,
        fuelLoad: FUEL_PER_LAP * (totalLaps + FUEL_MARGIN_LAPS),
      }),
    );
    return data;
  }

  function history(car: SimCar): Packet {
    const data = blank(codecs.sessionHistory);
    data.header = header();
    const best = (pick: (lap: LapRecord) => number) =>
      car.laps.reduce(
        (bestAt, lap, i) => (lap.valid && (bestAt < 0 || pick(lap) < pick(car.laps[bestAt]!)) ? i : bestAt),
        -1,
      ) + 1;
    data.carIdx = car.index;
    data.numLaps = Math.min(100, car.laps.length + (car.status === 2 ? 1 : 0));
    data.bestLapTimeLapNum = best((lap) => lap.time);
    data.bestSector1LapNum = best((lap) => lap.sectors[0]!);
    data.bestSector2LapNum = best((lap) => lap.sectors[1]!);
    data.bestSector3LapNum = best((lap) => lap.sectors[2]!);
    car.laps.slice(0, 100).forEach((lap, i) => {
      const [s1, s2, s3] = lap.sectors.map(split);
      Object.assign(data.lapHistoryData[i]!, {
        lapTimeInMS: lap.time,
        sector1TimeMSPart: s1!.ms,
        sector1TimeMinutesPart: s1!.minutes,
        sector2TimeMSPart: s2!.ms,
        sector2TimeMinutesPart: s2!.minutes,
        sector3TimeMSPart: s3!.ms,
        sector3TimeMinutesPart: s3!.minutes,
        lapValidBitFlags: lap.valid ? 0x0f : 0x0e,
      });
    });
    const stints = [...car.stints, { endLap: 255, visual: car.compound }];
    data.numTyreStints = stints.length;
    stints.forEach((stint, i) =>
      Object.assign(data.tyreStintsHistoryData[i]!, {
        endLap: stint.endLap,
        tyreVisualCompound: stint.visual,
        tyreActualCompound: COMPOUNDS[stint.visual].actual,
      }),
    );
    return { kind: 'sessionHistory', data };
  }

  function positionsPacket() {
    const data = blank(codecs.lapPositions);
    data.header = header();
    data.numLaps = Math.min(50, lapPositions.length);
    data.lapStart = 0;
    lapPositions.slice(0, 50).forEach((row, i) => (data.positionForVehicleIdx[i] = row));
    return data;
  }

  function classification(): Packet {
    const data = blank(codecs.finalClassification);
    data.header = header();
    data.numCars = cars.length;
    cars.forEach((car) => {
      const stints = [...car.stints, { endLap: car.lap - 1, visual: car.compound }];
      const best = car.laps.filter((lap) => lap.valid).reduce((min, lap) => Math.min(min, lap.time), Infinity);
      Object.assign(data.classificationData[car.index]!, {
        position: car.position,
        numLaps: car.laps.length,
        gridPosition: car.grid,
        points: POINTS[car.position - 1] ?? 0,
        numPitStops: car.pitStops,
        resultStatus: car.status,
        resultReason: car.status === 7 ? 8 : 2,
        bestLapTimeInMS: Number.isFinite(best) ? best : 0,
        totalRaceTime: car.finishTime,
        penaltiesTime: car.penalties,
        numPenalties: car.numPenalties,
        numTyreStints: stints.length,
        tyreStintsActual: stints.map((stint) => COMPOUNDS[stint.visual].actual),
        tyreStintsVisual: stints.map((stint) => stint.visual),
        tyreStintsEndLaps: stints.map((stint) => stint.endLap),
      });
    });
    return { kind: 'finalClassification', data };
  }

  // Calendario di invio come nel gioco: "rate" per i dati di guida, frequenze fisse per il resto
  function schedule() {
    const due = (key: keyof typeof next, interval: number) => {
      if (t < next[key]) return false;
      next[key] = t + interval;
      return true;
    };
    if (due('rate', 1 / rate)) {
      frame++;
      out.push({ kind: 'motion', data: motionPacket() });
      out.push({ kind: 'lapData', data: lapPacket() });
      out.push({ kind: 'carTelemetry', data: telemetryPacket() });
      out.push({ kind: 'carStatus', data: statusPacket() });
      out.push({ kind: 'motionEx', data: motionExPacket() });
      const telemetry2 = telemetry2Packet();
      if (telemetry2) out.push({ kind: 'carTelemetry2', data: telemetry2 });
    }
    if (due('session', 0.5)) out.push({ kind: 'session', data: sessionPacket() });
    if (due('setups', 0.5)) out.push({ kind: 'carSetups', data: setupsPacket() });
    if (due('damage', 0.1)) out.push({ kind: 'carDamage', data: damagePacket() });
    if (due('participants', 5)) out.push({ kind: 'participants', data: participantsPacket() });
    if (due('positions', 1)) out.push({ kind: 'lapPositions', data: positionsPacket() });
    if (due('history', 0.05)) {
      historyCursor = (historyCursor + 1) % cars.length;
      out.push(history(cars[historyCursor]!));
    }
  }

  setup();

  return {
    format,
    step(dt) {
      accumulator = Math.min(accumulator + dt, 1);
      while (accumulator >= PHYSICS_DT) {
        accumulator -= PHYSICS_DT;
        t += PHYSICS_DT;
        race(PHYSICS_DT);
        schedule();
      }
      const packets = out;
      out = [];
      return packets;
    },
    // Comandi DEV: gli eventi generati escono al prossimo step
    command(command) {
      switch (command) {
        case 'safety-car':
          deployVsc();
          break;
        case 'penalty':
          penalise(player, 7);
          break;
        case 'pit':
          player.pitLap = player.lap;
          break;
        case 'retire': {
          const candidates = cars.filter((car) => car !== player && car.status === 2);
          const car = candidates[Math.floor(random() * candidates.length)];
          if (car) retire(car);
          break;
        }
        case 'restart':
          setup();
          break;
      }
    },
  };
}
