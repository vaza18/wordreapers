import { describe, expect, it } from 'vitest';

import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../lib/firebase/room-code.js';

describe('room-code', () => {
  it('generates 4-char codes from safe alphabet', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(4);
    expect(isValidRoomCode(code)).toBe(true);
  });

  it('normalizes user input', () => {
    expect(normalizeRoomCode('7 x3k')).toBe('7X3K');
  });

  it('rejects too short codes', () => {
    expect(isValidRoomCode('AB')).toBe(false);
  });
});
