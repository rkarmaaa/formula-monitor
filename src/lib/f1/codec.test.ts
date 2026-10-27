import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePacket, encodePacket, packetSize, schemas } from './codec.ts';
import { PACKET_IDS, type Packet, type PacketKind, type UdpFormat } from './schema.ts';
import { blank, type Codec } from './struct.ts';

// Dimensioni dichiarate nelle specifiche ufficiali ("Size: N bytes")
const SPEC_SIZES: Record<UdpFormat, Partial<Record<PacketKind, number>>> = {
  2025: {
    motion: 1349,
    session: 753,
    lapData: 1285,
    event: 45,
    participants: 1284,
    carSetups: 1133,
    carTelemetry: 1352,
    carStatus: 1239,
    finalClassification: 1042,
    lobbyInfo: 954,
    carDamage: 1041,
    sessionHistory: 1460,
    tyreSets: 231,
    motionEx: 273,
    timeTrial: 101,
    lapPositions: 1131,
  },
  2026: {
    motion: 1325,
    session: 926,
    lapData: 1399,
    event: 45,
    participants: 1470,
    carSetups: 1233,
    carTelemetry: 1448,
    carStatus: 1445,
    finalClassification: 1134,
    lobbyInfo: 1062,
    carDamage: 1133,
    sessionHistory: 1460,
    tyreSets: 231,
    motionEx: 273,
    timeTrial: 104,
    lapPositions: 1231,
    carTelemetry2: 269,
  },
};

for (const format of [2025, 2026] as const) {
  test(`formato ${format}: dimensioni come da specifica`, () => {
    for (const [kind, size] of Object.entries(SPEC_SIZES[format])) {
      assert.equal(packetSize(format, kind as PacketKind), size, `${kind}`);
    }
  });

  test(`formato ${format}: encode → decode senza perdite`, () => {
    for (const kind of Object.keys(PACKET_IDS) as PacketKind[]) {
      const codec = schemas[format].codecs[kind];
      if (!codec) continue;
      const data = blank(codec as Codec<Packet['data']>);
      data.header.sessionUID = 123456789n;
      data.header.playerCarIndex = 3;
      const result = decodePacket(encodePacket(format, { kind, data } as Packet));
      assert.ok(result.ok, kind);
      assert.equal(result.packet.kind, kind);
      assert.equal(result.packet.data.header.packetId, PACKET_IDS[kind]);
      assert.equal(result.packet.data.header.sessionUID, 123456789n);
    }
  });
}

test('evento Fastest Lap e stringhe UTF-8', () => {
  const event = blank(schemas[2025].codecs.event);
  event.event = { code: 'FTLP', details: { vehicleIdx: 7, lapTime: 81.25 } };
  const decoded = decodePacket(encodePacket(2025, { kind: 'event', data: event }));
  assert.ok(decoded.ok && decoded.packet.kind === 'event');
  assert.deepEqual(decoded.packet.data.event, { code: 'FTLP', details: { vehicleIdx: 7, lapTime: 81.25 } });

  const participants = blank(schemas[2026].codecs.participants);
  participants.participants[0]!.name = 'Kimi Antonelli';
  participants.participants[0]!.teamId = 476;
  const back = decodePacket(encodePacket(2026, { kind: 'participants', data: participants }));
  assert.ok(back.ok && back.packet.kind === 'participants');
  assert.equal(back.packet.data.participants[0]!.name, 'Kimi Antonelli');
  assert.equal(back.packet.data.participants[0]!.teamId, 476);
});

test('G-force quantizzata nel formato 2026', () => {
  const motion = blank(schemas[2026].codecs.motion);
  motion.carMotionData[0]!.gForceLateral = -3.456;
  const decoded = decodePacket(encodePacket(2026, { kind: 'motion', data: motion }));
  assert.ok(decoded.ok && decoded.packet.kind === 'motion');
  assert.equal(decoded.packet.data.carMotionData[0]!.gForceLateral, -3.456);
});

test('rifiuta formati sconosciuti e dimensioni errate', () => {
  const wrongFormat = new ArrayBuffer(1349);
  new DataView(wrongFormat).setUint16(0, 2024, true);
  assert.deepEqual(decodePacket(wrongFormat), { ok: false, reason: 'format', format: 2024, packetId: 0 });

  const truncated = encodePacket(2025, { kind: 'session', data: blank(schemas[2025].codecs.session) }).slice(0, 700);
  assert.equal(decodePacket(truncated).ok, false);
  assert.equal(decodePacket(new ArrayBuffer(4)).ok, false);

  // Coda in più (patch future): il pacchetto resta decodificabile
  const session = encodePacket(2025, { kind: 'session', data: blank(schemas[2025].codecs.session) });
  const longer = new Uint8Array(session.byteLength + 16);
  longer.set(new Uint8Array(session));
  assert.equal(decodePacket(longer.buffer).ok, true);
});
