// Codec binario dichiarativo little-endian: la stessa definizione legge e scrive i pacchetti.
// Isomorfo (browser + Node), senza dipendenze.
export interface Codec<T> {
  readonly size: number;
  read(view: DataView, offset: number): T;
  write(view: DataView, offset: number, value: T): void;
}

export type Infer<C> = C extends Codec<infer T> ? T : never;

type Shape = Record<string, Codec<unknown>>;
export type StructOf<S extends Shape> = { -readonly [K in keyof S]: Infer<S[K]> };

const LE = true;

const prim = <T>(
  size: number,
  read: (view: DataView, offset: number) => T,
  write: (view: DataView, offset: number, value: T) => void,
): Codec<T> => ({ size, read, write });

export const u8 = prim<number>(
  1,
  (v, o) => v.getUint8(o),
  (v, o, x) => v.setUint8(o, x),
);
export const i8 = prim<number>(
  1,
  (v, o) => v.getInt8(o),
  (v, o, x) => v.setInt8(o, x),
);
export const u16 = prim<number>(
  2,
  (v, o) => v.getUint16(o, LE),
  (v, o, x) => v.setUint16(o, x, LE),
);
export const i16 = prim<number>(
  2,
  (v, o) => v.getInt16(o, LE),
  (v, o, x) => v.setInt16(o, x, LE),
);
export const u32 = prim<number>(
  4,
  (v, o) => v.getUint32(o, LE),
  (v, o, x) => v.setUint32(o, x, LE),
);
export const f32 = prim<number>(
  4,
  (v, o) => v.getFloat32(o, LE),
  (v, o, x) => v.setFloat32(o, x, LE),
);
export const f64 = prim<number>(
  8,
  (v, o) => v.getFloat64(o, LE),
  (v, o, x) => v.setFloat64(o, x, LE),
);
export const u64 = prim<bigint>(
  8,
  (v, o) => v.getBigUint64(o, LE),
  (v, o, x) => v.setBigUint64(o, x, LE),
);

// Intero quantizzato letto come decimale (es. G-force 2026 in millesimi)
export const scaled = (base: Codec<number>, scale: number): Codec<number> =>
  prim(
    base.size,
    (v, o) => base.read(v, o) / scale,
    (v, o, x) => base.write(v, o, Math.round(x * scale)),
  );

// Campo assente in un formato: zero byte, vale undefined
export const none: Codec<undefined> = prim(
  0,
  () => undefined,
  () => undefined,
);

export const array = <T>(item: Codec<T>, length: number): Codec<T[]> => ({
  size: item.size * length,
  read(view, offset) {
    const out = new Array<T>(length);
    for (let i = 0; i < length; i++) out[i] = item.read(view, offset + i * item.size);
    return out;
  },
  write(view, offset, values) {
    for (let i = 0; i < length; i++) {
      const value = values[i];
      if (value !== undefined) item.write(view, offset + i * item.size, value);
    }
  },
});

const decoder = new TextDecoder();
const encoder = new TextEncoder();

// Stringa UTF-8 a lunghezza fissa terminata da zero
export const chars = (length: number): Codec<string> => ({
  size: length,
  read(view, offset) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
    const end = bytes.indexOf(0);
    return decoder.decode(end < 0 ? bytes : bytes.subarray(0, end));
  },
  write(view, offset, text) {
    const bytes = encoder.encode(text).subarray(0, length - 1);
    new Uint8Array(view.buffer, view.byteOffset + offset, length).set(bytes);
  },
});

export function struct<S extends Shape>(shape: S): Codec<StructOf<S>> {
  const fields = Object.entries(shape);
  return {
    size: fields.reduce((sum, [, codec]) => sum + codec.size, 0),
    read(view, offset) {
      const out: Record<string, unknown> = {};
      for (const [key, codec] of fields) {
        out[key] = codec.read(view, offset);
        offset += codec.size;
      }
      return out as StructOf<S>;
    },
    write(view, offset, value) {
      const record = value as Record<string, unknown>;
      for (const [key, codec] of fields) {
        codec.write(view, offset, record[key]);
        offset += codec.size;
      }
    },
  };
}

// Union a lunghezza fissa scelta da un codice ASCII di 4 caratteri (pacchetto Event)
type Variants = Record<string, Codec<unknown>>;
export type TaggedOf<V extends Variants> = { [K in keyof V & string]: { code: K; details: Infer<V[K]> } }[keyof V &
  string];

export function tagged<V extends Variants>(variants: V, detailsSize: number): Codec<TaggedOf<V>> {
  return {
    size: 4 + detailsSize,
    read(view, offset) {
      let code = '';
      for (let i = 0; i < 4; i++) code += String.fromCharCode(view.getUint8(offset + i));
      const details = variants[code]?.read(view, offset + 4) ?? {};
      return { code, details } as TaggedOf<V>;
    },
    write(view, offset, value) {
      for (let i = 0; i < 4; i++) view.setUint8(offset + i, value.code.charCodeAt(i));
      variants[value.code]?.write(view, offset + 4, value.details);
    },
  };
}

// Valore "vuoto" di un codec: base comoda per costruire pacchetti (simulatore, test)
export const blank = <T>(codec: Codec<T>): T => codec.read(new DataView(new ArrayBuffer(codec.size)), 0);
