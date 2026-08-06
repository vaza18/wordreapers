import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  MAX_ROUNDS_PER_ROOM,
  canRematchAfterRound,
  isFinalRoomRound,
} from '@/constants/max-rounds-per-room';

describe('MAX_ROUNDS_PER_ROOM helpers', () => {
  it('exports product room cap of 12', () => {
    expect(MAX_ROUNDS_PER_ROOM).toBe(12);
  });

  it('allows rematch after rounds 0..MAX-2 and blocks at final index', () => {
    for (let round = 0; round < MAX_ROUNDS_PER_ROOM - 1; round += 1) {
      expect(canRematchAfterRound(round)).toBe(true);
      expect(isFinalRoomRound(round)).toBe(false);
    }
    expect(canRematchAfterRound(MAX_ROUNDS_PER_ROOM - 1)).toBe(false);
    expect(isFinalRoomRound(MAX_ROUNDS_PER_ROOM - 1)).toBe(true);
    expect(canRematchAfterRound(MAX_ROUNDS_PER_ROOM)).toBe(false);
    expect(isFinalRoomRound(MAX_ROUNDS_PER_ROOM)).toBe(true);
  });

  it('keeps Firebase rules literals in parity with the TS constant', () => {
    const rules = readFileSync('firebase/database.rules.json', 'utf8');
    const maxExclusive = MAX_ROUNDS_PER_ROOM;
    const rematchCeiling = MAX_ROUNDS_PER_ROOM - 1;
    expect(rules).toContain(`baseWordRound').val() < ${rematchCeiling}`);
    expect(rules).toContain(`newData.val() < ${maxExclusive}`);
  });
});
