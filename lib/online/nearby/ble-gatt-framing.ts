/**
 * Chunk UTF-8 protocol JSON for BLE ATT MTU limits (munim values are hex-encoded).
 */

/** Default payload chars per chunk (leave room for {"i":n,"n":n,"d":""} envelope). */
export const BLE_GATT_CHUNK_PAYLOAD_CHARS = 96;

/** Refuse reassembled streams larger than this (defense-in-depth vs wire DoS). */
export const BLE_GATT_MAX_REASSEMBLED_CHARS = 450_000;

export type BleGattChunk = {
  i: number;
  n: number;
  d: string;
};

export function utf8ToHex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
}

export function hexToUtf8(hex: string): string {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error('odd hex length');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

export function chunkUtf8Payload(
  payload: string,
  maxPayloadChars: number = BLE_GATT_CHUNK_PAYLOAD_CHARS,
): BleGattChunk[] {
  if (!payload) {
    return [{ i: 0, n: 1, d: '' }];
  }
  const size = Math.max(1, Math.floor(maxPayloadChars));
  const chunks: BleGattChunk[] = [];
  for (let offset = 0; offset < payload.length; offset += size) {
    chunks.push({
      i: chunks.length,
      n: 0,
      d: payload.slice(offset, offset + size),
    });
  }
  const n = chunks.length;
  for (const chunk of chunks) {
    chunk.n = n;
  }
  return chunks;
}

export function encodeBleGattChunkHex(chunk: BleGattChunk): string {
  return utf8ToHex(JSON.stringify(chunk));
}

export function parseBleGattChunkHex(hex: string): BleGattChunk | null {
  try {
    const raw = JSON.parse(hexToUtf8(hex)) as Partial<BleGattChunk>;
    if (
      typeof raw.i !== 'number' ||
      typeof raw.n !== 'number' ||
      typeof raw.d !== 'string' ||
      !Number.isInteger(raw.i) ||
      !Number.isInteger(raw.n) ||
      raw.i < 0 ||
      raw.n < 1 ||
      raw.i >= raw.n
    ) {
      return null;
    }
    return { i: raw.i, n: raw.n, d: raw.d };
  } catch {
    return null;
  }
}

export type BleChunkAssemblerResult =
  | { status: 'need_more' }
  | { status: 'complete'; payload: string }
  | { status: 'overflow' }
  | { status: 'invalid' };

/**
 * Stateful reassembly for one BLE direction (TX notify or RX write stream).
 */
export function createBleChunkAssembler(
  maxReassembledChars: number = BLE_GATT_MAX_REASSEMBLED_CHARS,
): {
  pushHex: (hex: string) => BleChunkAssemblerResult;
  reset: () => void;
} {
  let expectedN: number | null = null;
  const parts = new Map<number, string>();

  const reset = () => {
    expectedN = null;
    parts.clear();
  };

  return {
    reset,
    pushHex(hex: string): BleChunkAssemblerResult {
      const chunk = parseBleGattChunkHex(hex);
      if (!chunk) {
        reset();
        return { status: 'invalid' };
      }
      if (expectedN != null && chunk.n !== expectedN) {
        reset();
        return { status: 'invalid' };
      }
      expectedN = chunk.n;
      parts.set(chunk.i, chunk.d);
      if (parts.size < chunk.n) {
        return { status: 'need_more' };
      }
      let payload = '';
      for (let i = 0; i < chunk.n; i += 1) {
        const part = parts.get(i);
        if (part === undefined) {
          return { status: 'need_more' };
        }
        payload += part;
        if (payload.length > maxReassembledChars) {
          reset();
          return { status: 'overflow' };
        }
      }
      reset();
      return { status: 'complete', payload };
    },
  };
}
