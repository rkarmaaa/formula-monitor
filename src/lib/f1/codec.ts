import {
  header,
  isUdpFormat,
  PACKET_IDS,
  createSchema,
  type Packet,
  type PacketKind,
  type UdpFormat,
} from './schema.ts';
import type { Codec } from './struct.ts';

export const schemas = { 2025: createSchema(2025), 2026: createSchema(2026) } as const;

const KINDS = Object.keys(PACKET_IDS) as PacketKind[];

export type DecodeResult =
  | { ok: true; packet: Packet; format: UdpFormat }
  | { ok: false; reason: 'short' | 'format' | 'kind' | 'size'; format?: number; packetId?: number };

const codecOf = (format: UdpFormat, kind: PacketKind) =>
  schemas[format].codecs[kind] as Codec<Packet['data']> | undefined;

// Byte in ingresso (UDP inoltrato dal bridge o loopback) → pacchetto tipizzato
export function decodePacket(input: ArrayBuffer | ArrayBufferView): DecodeResult {
  const view =
    input instanceof ArrayBuffer ? new DataView(input) : new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (view.byteLength < header.size) return { ok: false, reason: 'short' };

  const format = view.getUint16(0, true);
  const packetId = view.getUint8(6);
  if (!isUdpFormat(format)) return { ok: false, reason: 'format', format, packetId };

  const kind = KINDS[packetId];
  const codec = kind && codecOf(format, kind);
  if (!kind || !codec) return { ok: false, reason: 'kind', format, packetId };
  if (view.byteLength !== codec.size) return { ok: false, reason: 'size', format, packetId };

  return { ok: true, format, packet: { kind, data: codec.read(view, 0) } as Packet };
}

// Pacchetto → byte, con header coerente (formato e id) — usato da simulatore UDP e test
export function encodePacket(format: UdpFormat, packet: Packet): ArrayBuffer {
  const codec = codecOf(format, packet.kind);
  if (!codec) throw new Error(`Pacchetto ${packet.kind} non previsto nel formato ${format}`);
  const buffer = new ArrayBuffer(codec.size);
  const data = {
    ...packet.data,
    header: { ...packet.data.header, packetFormat: format, packetId: PACKET_IDS[packet.kind] },
  };
  codec.write(new DataView(buffer), 0, data);
  return buffer;
}

export const packetSize = (format: UdpFormat, kind: PacketKind) => codecOf(format, kind)?.size;
