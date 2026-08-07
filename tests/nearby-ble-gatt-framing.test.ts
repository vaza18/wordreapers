import { describe, expect, it } from 'vitest';

import {
  BLE_GATT_CHUNK_PAYLOAD_CHARS,
  chunkUtf8Payload,
  createBleChunkAssembler,
  encodeBleGattChunkHex,
  hexToUtf8,
  utf8ToHex,
} from '@/lib/online/nearby/ble-gatt-framing';

describe('ble-gatt-framing', () => {
  it('round-trips utf8 hex', () => {
    const text = JSON.stringify({ type: 'want', gameId: 'K7X3P', wantRounds: [0, 1] });
    expect(hexToUtf8(utf8ToHex(text))).toBe(text);
  });

  it('chunks and reassembles a protocol payload', () => {
    const payload = 'x'.repeat(BLE_GATT_CHUNK_PAYLOAD_CHARS * 3 + 10);
    const chunks = chunkUtf8Payload(payload);
    expect(chunks.length).toBe(4);
    expect(chunks.every((chunk) => chunk.n === 4)).toBe(true);

    const assembler = createBleChunkAssembler();
    let complete: string | null = null;
    for (const chunk of chunks) {
      const result = assembler.pushHex(encodeBleGattChunkHex(chunk));
      if (result.status === 'complete') {
        complete = result.payload;
      }
    }
    expect(complete).toBe(payload);
  });

  it('rejects oversized reassembled streams', () => {
    const assembler = createBleChunkAssembler(50);
    const chunks = chunkUtf8Payload('y'.repeat(80), 20);
    let sawOverflow = false;
    for (const chunk of chunks) {
      const result = assembler.pushHex(encodeBleGattChunkHex(chunk));
      if (result.status === 'overflow') {
        sawOverflow = true;
        break;
      }
    }
    expect(sawOverflow).toBe(true);
  });
});
