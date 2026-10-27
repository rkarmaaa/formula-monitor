import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePacket, encodePacket } from '../f1/codec.ts';
import { applyPacket, createRaceState } from '../telemetry/state.ts';
import { buildView } from '../telemetry/view.ts';
import { coverage } from '../telemetry/track.ts';
import { createSimulator } from './simulator.ts';

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
