import { describe, expect, it } from 'vitest';

import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../lib/firebase/room-code.js';

describe('room-code', () => {
  it('generates 5-char codes from safe alphabet by default', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(5);
    expect(isValidRoomCode(code)).toBe(true);
  });

  it('still supports explicit 4-char generation', () => {
    const code = generateRoomCode(4);
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
