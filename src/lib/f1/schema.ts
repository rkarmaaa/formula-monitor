import {
  array,
  chars,
  f32,
  f64,
  i16,
  i8,
  none,
  scaled,
  struct,
  tagged,
  u16,
  u32,
  u64,
  u8,
  type Codec,
  type Infer,
} from './struct.ts';

// Formati UDP supportati: 2025 = F1 25, 2026 = F1 25 con Season Pack 2026.
// Un solo schema parametrizzato: i campi che esistono in un solo formato valgono undefined nell'altro.
export const UDP_FORMATS = [2025, 2026] as const;
export type UdpFormat = (typeof UDP_FORMATS)[number];

export const isUdpFormat = (value: number): value is UdpFormat => (UDP_FORMATS as readonly number[]).includes(value);

export const header = struct({
  packetFormat: u16,
  gameYear: u8,
  gameMajorVersion: u8,
  gameMinorVersion: u8,
  packetVersion: u8,
  packetId: u8,
  sessionUID: u64,
  sessionTime: f32,
  frameIdentifier: u32,
  overallFrameIdentifier: u32,
  playerCarIndex: u8,
  secondaryPlayerCarIndex: u8,
});

export type PacketHeader = Infer<typeof header>;

export const PACKET_IDS = {
  motion: 0,
  session: 1,
  lapData: 2,
  event: 3,
  participants: 4,
  carSetups: 5,
  carTelemetry: 6,
  carStatus: 7,
  finalClassification: 8,
  lobbyInfo: 9,
  carDamage: 10,
  sessionHistory: 11,
  tyreSets: 12,
  motionEx: 13,
  timeTrial: 14,
  lapPositions: 15,
  carTelemetry2: 16,
} as const;

export type PacketKind = keyof typeof PACKET_IDS;

const EVENT_DETAILS_SIZE = 12;
const MAX_LAPS_HISTORY = 100;
const MAX_TYRE_STINTS = 8;
const LAP_POSITIONS_CHUNK = 50;
const TYRE_SETS = 20;
const LIVERY_COLOURS = 4;

const wheels = <T>(codec: Codec<T>) => array(codec, 4);

export function createSchema(format: UdpFormat) {
  const is2026 = format === 2026;
  const maxCars = is2026 ? 24 : 22;
  const only2026 = <T>(codec: Codec<T>): Codec<T | undefined> => (is2026 ? codec : none);
  const perCar = <T>(codec: Codec<T>) => array(codec, maxCars);
  const packet = <S extends Record<string, Codec<unknown>>>(shape: S) => struct({ header, ...shape });
  const dbId = is2026 ? u16 : u8;

  const carMotion = struct({
    worldPositionX: f32,
    worldPositionY: f32,
    worldPositionZ: f32,
    worldVelocityX: f32,
    worldVelocityY: f32,
    worldVelocityZ: f32,
    worldForwardDirX: i16,
    worldForwardDirY: i16,
    worldForwardDirZ: i16,
    worldRightDirX: i16,
    worldRightDirY: i16,
    worldRightDirZ: i16,
    gForceLateral: is2026 ? scaled(i16, 1000) : f32,
    gForceLongitudinal: is2026 ? scaled(i16, 1000) : f32,
    gForceVertical: is2026 ? scaled(i16, 1000) : f32,
    yaw: f32,
    pitch: f32,
    roll: f32,
  });

  const zone = struct({ zoneStart: f32, zoneEnd: f32 });

  const weatherSample = struct({
    sessionType: u8,
    timeOffset: u8,
    weather: u8,
    trackTemperature: i8,
    trackTemperatureChange: i8,
    airTemperature: i8,
    airTemperatureChange: i8,
    rainPercentage: u8,
  });

  const session = packet({
    weather: u8,
    trackTemperature: i8,
    airTemperature: i8,
    totalLaps: u8,
    trackLength: u16,
    sessionType: u8,
    trackId: i8,
    formula: u8,
    sessionTimeLeft: u16,
    sessionDuration: u16,
    pitSpeedLimit: u8,
    gamePaused: u8,
    isSpectating: u8,
    spectatorCarIndex: u8,
    sliProNativeSupport: u8,
    numMarshalZones: u8,
    marshalZones: array(struct({ zoneStart: f32, zoneFlag: i8 }), 21),
    safetyCarStatus: u8,
    networkGame: u8,
    numWeatherForecastSamples: u8,
    weatherForecastSamples: array(weatherSample, 64),
    forecastAccuracy: u8,
    aiDifficulty: u8,
    seasonLinkIdentifier: u32,
    weekendLinkIdentifier: u32,
    sessionLinkIdentifier: u32,
    pitStopWindowIdealLap: u8,
    pitStopWindowLatestLap: u8,
    pitStopRejoinPosition: u8,
    steeringAssist: u8,
    brakingAssist: u8,
    gearboxAssist: u8,
    pitAssist: u8,
    pitReleaseAssist: u8,
    ersAssist: u8,
    drsAssist: u8,
    dynamicRacingLine: u8,
    dynamicRacingLineType: u8,
    gameMode: u8,
    ruleSet: u8,
    timeOfDay: u32,
    sessionLength: u8,
    speedUnitsLeadPlayer: u8,
    temperatureUnitsLeadPlayer: u8,
    speedUnitsSecondaryPlayer: u8,
    temperatureUnitsSecondaryPlayer: u8,
    numSafetyCarPeriods: u8,
    numVirtualSafetyCarPeriods: u8,
    numRedFlagPeriods: u8,
    equalCarPerformance: u8,
    recoveryMode: u8,
    flashbackLimit: u8,
    surfaceType: u8,
    lowFuelMode: u8,
    raceStarts: u8,
    tyreTemperature: u8,
    pitLaneTyreSim: u8,
    carDamage: u8,
    carDamageRate: u8,
    collisions: u8,
    collisionsOffForFirstLapOnly: u8,
    mpUnsafePitRelease: u8,
    mpOffForGriefing: u8,
    cornerCuttingStringency: u8,
    parcFermeRules: u8,
    pitStopExperience: u8,
    safetyCar: u8,
    safetyCarExperience: u8,
    formationLap: u8,
    formationLapExperience: u8,
    redFlags: u8,
    affectsLicenceLevelSolo: u8,
    affectsLicenceLevelMP: u8,
    numSessionsInWeekend: u8,
    weekendStructure: array(u8, 12),
    sector2LapDistanceStart: f32,
    sector3LapDistanceStart: f32,
    activeAeroTrackStatus: only2026(u8),
    numActiveAeroZonesFull: only2026(u8),
    activeAeroZonesFull: only2026(array(zone, 8)),
    numActiveAeroZonesPartial: only2026(u8),
    activeAeroZonesPartial: only2026(array(zone, 8)),
    numDRSZones: only2026(u8),
    drsZones: only2026(array(zone, 4)),
    startReactionTime: only2026(f32),
    antiLockBrakesAssist: only2026(u8),
    tractionControlAssist: only2026(u8),
    dynamicRacingLineHiVis: only2026(u8),
    dynamicRacingLineColourBlind: only2026(u8),
    recurringRewindPrompt: only2026(u8),
  });

  const lap = struct({
    lastLapTimeInMS: u32,
    currentLapTimeInMS: u32,
    sector1TimeMSPart: u16,
    sector1TimeMinutesPart: u8,
    sector2TimeMSPart: u16,
    sector2TimeMinutesPart: u8,
    deltaToCarInFrontMSPart: u16,
    deltaToCarInFrontMinutesPart: u8,
    deltaToRaceLeaderMSPart: u16,
    deltaToRaceLeaderMinutesPart: u8,
    lapDistance: f32,
    totalDistance: f32,
    safetyCarDelta: f32,
    carPosition: u8,
    currentLapNum: u8,
    pitStatus: u8,
    numPitStops: u8,
    sector: u8,
    currentLapInvalid: u8,
    penalties: u8,
    totalWarnings: u8,
    cornerCuttingWarnings: u8,
    numUnservedDriveThroughPens: u8,
    numUnservedStopGoPens: u8,
    gridPosition: u8,
    driverStatus: u8,
    resultStatus: u8,
    pitLaneTimerActive: u8,
    pitLaneTimeInLaneInMS: u16,
    pitStopTimerInMS: u16,
    pitStopShouldServePen: u8,
    speedTrapFastestSpeed: f32,
    speedTrapFastestLap: u8,
  });

  const vehicle = struct({ vehicleIdx: u8 });
  const empty = struct({});

  const event = tagged(
    {
      SSTA: empty,
      SEND: empty,
      FTLP: struct({ vehicleIdx: u8, lapTime: f32 }),
      RTMT: struct({ vehicleIdx: u8, reason: u8 }),
      DRSE: empty,
      DRSD: struct({ reason: u8 }),
      TMPT: vehicle,
      CHQF: empty,
      RCWN: vehicle,
      PENA: struct({
        penaltyType: u8,
        infringementType: u8,
        vehicleIdx: u8,
        otherVehicleIdx: u8,
        time: u8,
        lapNum: u8,
        placesGained: u8,
      }),
      SPTP: struct({
        vehicleIdx: u8,
        speed: f32,
        isOverallFastestInSession: u8,
        isDriverFastestInSession: u8,
        fastestVehicleIdxInSession: u8,
        fastestSpeedInSession: f32,
      }),
      STLG: struct({ numLights: u8 }),
      LGOT: empty,
      DTSV: vehicle,
      SGSV: struct({ vehicleIdx: u8, stopTime: f32 }),
      FLBK: struct({ flashbackFrameIdentifier: u32, flashbackSessionTime: f32 }),
      BUTN: struct({ buttonStatus: u32 }),
      RDFL: empty,
      OVTK: struct({ overtakingVehicleIdx: u8, beingOvertakenVehicleIdx: u8 }),
      SCAR: struct({ safetyCarType: u8, eventType: u8 }),
      COLL: struct({ vehicle1Idx: u8, vehicle2Idx: u8, severity: only2026(u8) }),
    },
    EVENT_DETAILS_SIZE,
  );

  const participant = struct({
    aiControlled: u8,
    driverId: dbId,
    networkId: dbId,
    teamId: dbId,
    myTeam: u8,
    raceNumber: u8,
    nationality: u8,
    name: chars(32),
    yourTelemetry: u8,
    showOnlineNames: u8,
    techLevel: u16,
    platform: u8,
    numColours: u8,
    liveryColours: array(struct({ red: u8, green: u8, blue: u8 }), LIVERY_COLOURS),
  });

  const carSetup = struct({
    frontWing: u8,
    rearWing: u8,
    onThrottle: u8,
    offThrottle: u8,
    frontCamber: f32,
    rearCamber: f32,
    frontToe: f32,
    rearToe: f32,
    frontSuspension: u8,
    rearSuspension: u8,
    frontAntiRollBar: u8,
    rearAntiRollBar: u8,
    frontSuspensionHeight: u8,
    rearSuspensionHeight: u8,
    brakePressure: u8,
    brakeBias: u8,
    engineBraking: u8,
    rearLeftTyrePressure: f32,
    rearRightTyrePressure: f32,
    frontLeftTyrePressure: f32,
    frontRightTyrePressure: f32,
    ballast: u8,
    fuelLoad: f32,
  });

  const carTelemetry = struct({
    speed: u16,
    throttle: f32,
    steer: f32,
    brake: f32,
    clutch: u8,
    gear: i8,
    engineRPM: u16,
    drs: u8,
    revLightsPercent: u8,
    revLightsBitValue: u16,
    brakesTemperature: wheels(u16),
    tyresSurfaceTemperature: wheels(u8),
    tyresInnerTemperature: wheels(u8),
    engineTemperature: is2026 ? u8 : u16,
    tyresPressure: wheels(f32),
    surfaceType: wheels(u8),
  });

  const carStatus = struct({
    tractionControl: u8,
    antiLockBrakes: u8,
    fuelMix: u8,
    frontBrakeBias: u8,
    pitLimiterStatus: u8,
    fuelInTank: f32,
    fuelCapacity: f32,
    fuelRemainingLaps: f32,
    maxRPM: u16,
    idleRPM: u16,
    maxGears: u8,
    drsAllowed: u8,
    drsActivationDistance: u16,
    actualTyreCompound: u8,
    visualTyreCompound: u8,
    tyresAgeLaps: u8,
    vehicleFiaFlags: i8,
    enginePowerICE: f32,
    enginePowerMGUK: f32,
    ersStoreEnergy: f32,
    ersDeployMode: u8,
    ersHarvestedThisLapMGUK: f32,
    ersHarvestedThisLapMGUH: f32,
    ersHarvestLimitPerLap: only2026(f32),
    ersDeployedThisLap: f32,
    networkPaused: u8,
  });

  const classification = struct({
    position: u8,
    numLaps: u8,
    gridPosition: u8,
    points: u8,
    numPitStops: u8,
    resultStatus: u8,
    resultReason: u8,
    bestLapTimeInMS: u32,
    totalRaceTime: f64,
    penaltiesTime: u8,
    numPenalties: u8,
    numTyreStints: u8,
    tyreStintsActual: array(u8, MAX_TYRE_STINTS),
    tyreStintsVisual: array(u8, MAX_TYRE_STINTS),
    tyreStintsEndLaps: array(u8, MAX_TYRE_STINTS),
  });

  const lobbyPlayer = struct({
    aiControlled: u8,
    teamId: dbId,
    nationality: u8,
    platform: u8,
    name: chars(32),
    carNumber: u8,
    yourTelemetry: u8,
    showOnlineNames: u8,
    techLevel: u16,
    readyStatus: u8,
  });

  const carDamage = struct({
    tyresWear: wheels(f32),
    tyresDamage: wheels(u8),
    brakesDamage: wheels(u8),
    tyreBlisters: wheels(u8),
    frontLeftWingDamage: u8,
    frontRightWingDamage: u8,
    rearWingDamage: u8,
    floorDamage: u8,
    diffuserDamage: u8,
    sidepodDamage: u8,
    drsFault: u8,
    ersFault: u8,
    gearBoxDamage: u8,
    engineDamage: u8,
    engineMGUHWear: u8,
    engineESWear: u8,
    engineCEWear: u8,
    engineICEWear: u8,
    engineMGUKWear: u8,
    engineTCWear: u8,
    engineBlown: u8,
    engineSeized: u8,
  });

  const lapHistory = struct({
    lapTimeInMS: u32,
    sector1TimeMSPart: u16,
    sector1TimeMinutesPart: u8,
    sector2TimeMSPart: u16,
    sector2TimeMinutesPart: u8,
    sector3TimeMSPart: u16,
    sector3TimeMinutesPart: u8,
    lapValidBitFlags: u8,
  });

  const tyreSet = struct({
    actualTyreCompound: u8,
    visualTyreCompound: u8,
    wear: u8,
    available: u8,
    recommendedSession: u8,
    lifeSpan: u8,
    usableLife: u8,
    lapDeltaTime: i16,
    fitted: u8,
  });

  const timeTrialSet = struct({
    carIdx: u8,
    teamId: dbId,
    lapTimeInMS: u32,
    sector1TimeInMS: u32,
    sector2TimeInMS: u32,
    sector3TimeInMS: u32,
    tractionControl: u8,
    gearboxAssist: u8,
    antiLockBrakes: u8,
    equalCarPerformance: u8,
    customSetup: u8,
    valid: u8,
  });

  const carTelemetry2 = struct({
    activeAeroMode: u8,
    activeAeroAvailable: u8,
    activeAeroActivationDistance: u16,
    overtakeAvailable: u8,
    overtakeActive: u8,
    overtakeActivationDistance: u16,
    regulations2026: u8,
    drivingWrongWay: u8,
  });

  const codecs = {
    motion: packet({ carMotionData: perCar(carMotion) }),
    session,
    lapData: packet({ lapData: perCar(lap), timeTrialPBCarIdx: u8, timeTrialRivalCarIdx: u8 }),
    event: packet({ event }),
    participants: packet({ numActiveCars: u8, participants: perCar(participant) }),
    carSetups: packet({ carSetups: perCar(carSetup), nextFrontWingValue: f32 }),
    carTelemetry: packet({
      carTelemetryData: perCar(carTelemetry),
      mfdPanelIndex: u8,
      mfdPanelIndexSecondaryPlayer: u8,
      suggestedGear: i8,
    }),
    carStatus: packet({ carStatusData: perCar(carStatus) }),
    finalClassification: packet({ numCars: u8, classificationData: perCar(classification) }),
    lobbyInfo: packet({ numPlayers: u8, lobbyPlayers: perCar(lobbyPlayer) }),
    carDamage: packet({ carDamageData: perCar(carDamage) }),
    sessionHistory: packet({
      carIdx: u8,
      numLaps: u8,
      numTyreStints: u8,
      bestLapTimeLapNum: u8,
      bestSector1LapNum: u8,
      bestSector2LapNum: u8,
      bestSector3LapNum: u8,
      lapHistoryData: array(lapHistory, MAX_LAPS_HISTORY),
      tyreStintsHistoryData: array(
        struct({ endLap: u8, tyreActualCompound: u8, tyreVisualCompound: u8 }),
        MAX_TYRE_STINTS,
      ),
    }),
    tyreSets: packet({ carIdx: u8, tyreSetData: array(tyreSet, TYRE_SETS), fittedIdx: u8 }),
    motionEx: packet({
      suspensionPosition: wheels(f32),
      suspensionVelocity: wheels(f32),
      suspensionAcceleration: wheels(f32),
      wheelSpeed: wheels(f32),
      wheelSlipRatio: wheels(f32),
      wheelSlipAngle: wheels(f32),
      wheelLatForce: wheels(f32),
      wheelLongForce: wheels(f32),
      heightOfCOGAboveGround: f32,
      localVelocityX: f32,
      localVelocityY: f32,
      localVelocityZ: f32,
      angularVelocityX: f32,
      angularVelocityY: f32,
      angularVelocityZ: f32,
      angularAccelerationX: f32,
      angularAccelerationY: f32,
      angularAccelerationZ: f32,
      frontWheelsAngle: f32,
      wheelVertForce: wheels(f32),
      frontAeroHeight: f32,
      rearAeroHeight: f32,
      frontRollAngle: f32,
      rearRollAngle: f32,
      chassisYaw: f32,
      chassisPitch: f32,
      wheelCamber: wheels(f32),
      wheelCamberGain: wheels(f32),
    }),
    timeTrial: packet({
      playerSessionBestDataSet: timeTrialSet,
      personalBestDataSet: timeTrialSet,
      rivalDataSet: timeTrialSet,
    }),
    lapPositions: packet({
      numLaps: u8,
      lapStart: u8,
      positionForVehicleIdx: array(array(u8, maxCars), LAP_POSITIONS_CHUNK),
    }),
    carTelemetry2: is2026 ? packet({ carTelemetry2Data: perCar(carTelemetry2) }) : undefined,
  } satisfies Record<PacketKind, Codec<unknown> | undefined>;

  return { format, maxCars, codecs };
}

export type Schema = ReturnType<typeof createSchema>;
type Codecs = Schema['codecs'];
export type PacketData<K extends PacketKind> = Infer<NonNullable<Codecs[K]>>;
export type Packet = { [K in PacketKind]: { kind: K; data: PacketData<K> } }[PacketKind];
export type RaceEvent = PacketData<'event'>['event'];
export type EventCode = RaceEvent['code'];

// Strutture per singola auto, comode per stato e widget
export type CarMotion = PacketData<'motion'>['carMotionData'][number];
export type LapData = PacketData<'lapData'>['lapData'][number];
export type Participant = PacketData<'participants'>['participants'][number];
export type CarTelemetry = PacketData<'carTelemetry'>['carTelemetryData'][number];
export type CarStatus = PacketData<'carStatus'>['carStatusData'][number];
export type CarDamage = PacketData<'carDamage'>['carDamageData'][number];
export type CarTelemetry2 = NonNullable<PacketData<'carTelemetry2'>>['carTelemetry2Data'][number];
export type SessionData = PacketData<'session'>;
export type SessionHistory = PacketData<'sessionHistory'>;
