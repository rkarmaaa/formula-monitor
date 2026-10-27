import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePacket, encodePacket } from '../f1/codec.ts';
import { applyPacket, createRaceState } from '../telemetry/state.ts';
import { buildView } from '../telemetry/view.ts';
import { coverage, referenceFor, REF_POINTS, toReference } from '../telemetry/track.ts';
import { createSimulator } from './simulator.ts';
import { buildTrack } from './track.ts';
import { demoTrack } from '../../data/demo.ts';

const createSimulatorTrack = () => buildTrack(demoTrack.control, demoTrack.length);

for (const format of [2025, 2026] as const) {
  test(`simulatore ${format}: gara completa attraverso il codec`, () => {
    const sim = createSimulator({ format, laps: 6, rate: 10, seed: 7 });
    const state = createRaceState();
    const codes = new Set<string>();
    let finished = false;

    for (let second = 0; second < 900 && !finished; second++) {
      for (const packet of sim.step(1)) {
        const decoded = decodePacket(encodePacket(format, packet));
        assert.ok(decoded.ok, `decode ${packet.kind}`);
        applyPacket(state, decoded.packet, decoded.format);
        if (decoded.packet.kind === 'event') codes.add(decoded.packet.data.event.code);
        if (decoded.packet.kind === 'finalClassification') finished = true;
      }
    }

    assert.ok(finished, 'la gara arriva alla classifica finale');
    for (const code of ['SSTA', 'LGOT', 'FTLP', 'DRSE', 'CHQF', 'RCWN', 'SEND']) assert.ok(codes.has(code), code);

    const view = buildView(state);
    const expected = format === 2026 ? 22 : 20;
    assert.equal(view.cars.length, expected);
    assert.deepEqual(
      view.cars.map((car) => car.position),
      Array.from({ length: expected }, (_, i) => i + 1),
    );
    const winner = view.cars[0]!;
    assert.ok(winner.bestLapMs > 70_000 && winner.bestLapMs < 100_000, `giro ${winner.bestLapMs} ms`);
    assert.ok(
      view.cars.some((car) => car.history && car.history.numTyreStints >= 2),
      'almeno un pit stop',
    );
    assert.ok(state.lapPositions.length >= 6, 'grafico posizioni');
    assert.ok(state.track && coverage(state.track) > 0.95, 'tracciato appreso per la mappa');
    assert.ok(
      view.cars.every((car) => car.lapsDown === 0 || car.retired),
      'nessun doppiato in una gara di 6 giri',
    );
  });
}

test('simulatore in qualifica: timer, classifica sul giro migliore e mappa allineata', () => {
  const sim = createSimulator({ format: 2025, session: 'qualifying', rate: 10, seed: 3 });
  const state = createRaceState();
  let fitted = 0;
  for (let second = 0; second < 400; second++) {
    for (const packet of sim.step(1)) {
      const decoded = decodePacket(encodePacket(2025, packet));
      assert.ok(decoded.ok);
      applyPacket(state, decoded.packet, decoded.format);
    }
    if (!fitted && state.track?.fitted) fitted = coverage(state.track);
  }
  const view = buildView(state);
  assert.equal(view.session?.sessionType, 5);
  assert.ok(view.session!.sessionTimeLeft > 0 && view.session!.sessionTimeLeft < 18 * 60);
  const timed = view.cars.filter((car) => car.bestLapMs > 0);
  assert.ok(timed.length >= 15, `piloti con tempo: ${timed.length}`);
  for (let i = 1; i < timed.length; i++) assert.ok(timed[i]!.bestLapMs >= timed[i - 1]!.bestLapMs, 'ordine per giro');
  assert.ok(
    view.bestSectorsMs.every((ms) => ms > 0),
    'settori migliori assoluti',
  );
  assert.ok(
    view.cars.some((car) => car.sectors.some((sector) => sector.tone === 'best')),
    'almeno un settore viola',
  );
  for (const i of [0, 1, 2]) {
    const purple = view.cars.filter((car) => car.sectors[i]!.tone === 'best');
    assert.ok(purple.length <= 1, `S${i + 1}: ${purple.length} settori viola, ne serve al massimo uno`);
    for (const car of purple) assert.ok(car.sectors[i]!.ms <= view.bestSectorsMs[i]!, 'viola = migliore assoluto');
  }

  // La forma reale di Monza (ruotata e specchiata nel simulatore) si allinea prima di un giro completo
  assert.ok(fitted > 0 && fitted < 0.5, `allineata con ${Math.round(fitted * 100)}% di pista appresa`);
  const track = state.track!;
  let error = 0;
  let guessed = 0;
  const truth = createSimulatorTrack();
  for (let i = 0; i < track.filled.length; i++) {
    if (!track.guessed[i]) continue;
    const k = Math.min(truth.samples - 1, i);
    error = Math.max(error, Math.hypot(track.x[i]! - truth.x[k]!, track.z[i]! - truth.z[k]!));
    guessed++;
  }
  assert.ok(guessed === 0 || error < 120, `scarto massimo ${Math.round(error)} m`);

  // Riportato nel piano della forma reale (mappa orientata a nord), il tracciato appreso ci sta sopra
  const ref = referenceFor(track.trackId)!;
  let far = 0;
  for (let i = 0; i < track.filled.length; i += 20) {
    if (!track.filled[i]) continue;
    const [x, y] = toReference(track.fit!, track.x[i]!, track.z[i]!);
    let near = Infinity;
    for (let k = 0; k < REF_POINTS; k++) near = Math.min(near, Math.hypot(ref.x[k]! - x, ref.y[k]! - y));
    far = Math.max(far, near);
  }
  assert.ok(far < 120, `distanza massima dalla forma reale ${Math.round(far)} m`);
});
